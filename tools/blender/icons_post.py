"""Food Delivery Simulator - icon post-processing (python3 + numpy + Pillow).

Takes the raw renders written by tools/blender/icons.py and produces the shipping icons:
  * crop to the alpha bounding box and fit into a square with a fixed margin ("auto" framing),
    or keep the camera framing as-is ("fixed" framing, used by the character portraits);
  * add a soft dark outline whose hue follows the local edge colour (cartoon ink line);
  * light saturation lift, premultiplied-alpha downsampling in linear light (no dark halo);
  * bleed edge colours into fully transparent pixels (safe for WebGL / mipmapping);
  * write assets/icons/<name>.png + .webp and tools/shots/icons-sheet.png.

    python3 tools/blender/icons_post.py --raw /tmp/fds-icons/raw [--only a,b]
"""
import os, sys, json, glob, argparse
import numpy as np
from scipy import ndimage
from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
OUT = os.path.join(ROOT, 'assets', 'icons')
SHEET = os.path.join(ROOT, 'tools', 'shots', 'icons-sheet.png')

# framing / style per group: margin and outline are in OUTPUT pixels
STYLE = {
    'food': dict(margin=10, outline=5.0, sat=1.22),
    'char': dict(margin=0, outline=5.0, sat=1.06),
    'ui':   dict(margin=5, outline=3.2, sat=1.08),
}


def srgb_to_lin(c):
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)


def lin_to_srgb(c):
    c = np.clip(c, 0, 1)
    return np.where(c <= 0.0031308, c * 12.92, 1.055 * np.power(c, 1 / 2.4) - 0.055)


def nearest_fill(rgb, solid):
    """Every pixel gets the colour of the nearest `solid` pixel (solid pixels keep their own)."""
    _, (iy, ix) = ndimage.distance_transform_edt(~solid, return_indices=True)
    return rgb[iy, ix]


def ink_color(rgb_srgb):
    """Dark, saturated version of a colour for the outline (works per pixel, sRGB in/out)."""
    mx = rgb_srgb.max(axis=-1, keepdims=True)
    mn = rgb_srgb.min(axis=-1, keepdims=True)
    sat = np.where(mx > 1e-4, (mx - mn) / np.maximum(mx, 1e-4), 0)
    hue_dir = np.where(mx > 1e-4, rgb_srgb / np.maximum(mx, 1e-4), 1)   # colour normalised to V=1
    # push saturation a bit, keep hue, set value low
    s2 = np.clip(sat * 1.15 + 0.05, 0, 1)
    base = 1 - (1 - hue_dir) * (s2 / np.maximum(sat, 1e-4))
    base = np.where(sat > 1e-3, np.clip(base, 0, 1), 1)
    v = 0.25
    ink = base * v
    # pull slightly towards a deep navy so all outlines share a family
    navy = np.array([0.10, 0.11, 0.20])
    return ink * 0.7 + navy * 0.3


def saturate(rgb_srgb, amt):
    if abs(amt - 1) < 1e-3:
        return rgb_srgb
    lum = (rgb_srgb * np.array([0.2126, 0.7152, 0.0722])).sum(-1, keepdims=True)
    return np.clip(lum + (rgb_srgb - lum) * amt, 0, 1)


def resize_premul(rgb_lin, alpha, size):
    """Resize premultiplied linear RGBA with Lanczos, per channel in float."""
    out = []
    for ch in [rgb_lin[..., i] * alpha for i in range(3)] + [alpha]:
        im = Image.fromarray(ch.astype(np.float32), mode='F')
        out.append(np.asarray(im.resize((size, size), Image.Resampling.LANCZOS), dtype=np.float32))
    a = np.clip(out[3], 0, 1)
    rgb = np.stack(out[:3], -1)
    rgb = np.clip(rgb, 0, None) / np.maximum(a, 1e-6)[..., None]
    rgb = np.where(a[..., None] > 1e-6, rgb, 0)
    return np.clip(rgb, 0, 1), a


def process(raw_png, meta):
    style = STYLE[meta['group']]
    size = meta['out']
    im = np.asarray(Image.open(raw_png).convert('RGBA'), dtype=np.float32) / 255.0
    rgb, a = im[..., :3], im[..., 3]
    rgb = saturate(rgb, style['sat'] * meta.get('sat', 1.0))
    margin = meta.get('margin', style['margin'])
    outline = meta.get('outline', style['outline'])
    H, W = a.shape
    if meta.get('framing', 'auto') == 'auto':
        ys, xs = np.nonzero(a > 0.02)
        y0, y1, x0, x1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
        ext = max(y1 - y0, x1 - x0)
        s = (size - 2 * margin - 2 * outline) / ext          # raw px -> out px
        # square crop window centred on the bbox (optionally biased), padded with transparency
        cy = (y0 + y1) / 2 + meta.get('dy', 0) / s
        cx = (x0 + x1) / 2 + meta.get('dx', 0) / s
        half = size / s / 2
        pad = int(np.ceil(half)) + 4
        rgb = np.pad(rgb, ((pad, pad), (pad, pad), (0, 0)))
        a = np.pad(a, ((pad, pad), (pad, pad)))
        Y0 = int(round(cy - half)) + pad
        X0 = int(round(cx - half)) + pad
        n = int(round(2 * half))
        rgb, a = rgb[Y0:Y0 + n, X0:X0 + n], a[Y0:Y0 + n, X0:X0 + n]
    else:
        s = size / W
        n = W
    r_raw = outline / s
    # colour field outside the silhouette = colour of the nearest solid pixel
    col = nearest_fill(rgb, a > 0.5)
    ink = ink_color(col)
    if outline > 0:
        # outline alpha from the exact distance to the silhouette (anti-aliased at raw resolution,
        # then downsampled 2-4x), merged with the soft render alpha
        dist = ndimage.distance_transform_edt(a < 0.5)
        oa = np.maximum(np.clip(r_raw + 0.5 - dist, 0, 1), a)
    else:
        oa = np.zeros_like(a)
    # composite object over ink (straight alpha -> premultiplied)
    lin_o = srgb_to_lin(rgb)
    lin_i = srgb_to_lin(ink)
    pa = a + oa * (1 - a)
    prem = lin_o * a[..., None] + lin_i * (oa * (1 - a))[..., None]
    lin = np.where(pa[..., None] > 1e-6, prem / np.maximum(pa, 1e-6)[..., None], 0)
    rgb_lin, alpha = resize_premul(lin, pa, size)
    srgb = lin_to_srgb(rgb_lin)
    # bleed final colours into transparent pixels so bilinear sampling never pulls in black
    if (alpha > 0).any():
        srgb = np.where(alpha[..., None] > 0, srgb, nearest_fill(srgb, alpha > 0))
    out = np.concatenate([srgb, alpha[..., None]], -1)
    return Image.fromarray((np.clip(out, 0, 1) * 255 + 0.5).astype(np.uint8), 'RGBA')


def contact_sheet(names, path, cell=64):
    """Every icon at `cell` px on navy (#1d2a44) and cream (#fbf3e4) panels, plus a 40 px strip."""
    cols = 12
    rows = (len(names) + cols - 1) // cols
    pad, label_h = 10, 14
    cw = cell + pad
    ch = cell + pad + label_h
    panel_w = cols * cw + pad
    panel_h = rows * ch + pad
    small = 40
    strip_h = small + 2 * pad
    W = panel_w
    H = 2 * panel_h + 2 * strip_h + 3 * pad
    sheet = Image.new('RGBA', (W, H), (60, 60, 60, 255))
    try:
        font = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', 9)
    except Exception:
        font = ImageFont.load_default()
    y = 0
    for bg, fg in (((29, 42, 68, 255), (220, 228, 240)), ((251, 243, 228, 255), (60, 50, 40))):
        panel = Image.new('RGBA', (panel_w, panel_h), bg)
        d = ImageDraw.Draw(panel)
        for i, n in enumerate(names):
            im = Image.open(os.path.join(OUT, n + '.png')).convert('RGBA').resize((cell, cell), Image.Resampling.LANCZOS)
            x0 = pad + (i % cols) * cw
            y0 = pad + (i // cols) * ch
            panel.alpha_composite(im, (x0, y0))
            label = n.split('-', 1)[1][:11]
            d.text((x0 + cell / 2, y0 + cell + 2), label, fill=fg, font=font, anchor='mt')
        sheet.alpha_composite(panel, (0, y))
        y += panel_h + pad
    # 40 px strips (all icons in a row, wrapping) on both backgrounds
    for bg in ((29, 42, 68, 255), (251, 243, 228, 255)):
        per = (W - pad) // (small + 4)
        nrows = (len(names) + per - 1) // per
        strip = Image.new('RGBA', (W, nrows * (small + 4) + pad), bg)
        for i, n in enumerate(names):
            im = Image.open(os.path.join(OUT, n + '.png')).convert('RGBA').resize((small, small), Image.Resampling.LANCZOS)
            strip.alpha_composite(im, (pad // 2 + (i % per) * (small + 4), pad // 2 + (i // per) * (small + 4)))
        if y + strip.height > sheet.height:
            grown = Image.new('RGBA', (W, y + strip.height + pad), (60, 60, 60, 255))
            grown.alpha_composite(sheet, (0, 0))
            sheet = grown
        sheet.alpha_composite(strip, (0, y))
        y += strip.height + pad
    sheet = sheet.crop((0, 0, W, y))
    os.makedirs(os.path.dirname(path), exist_ok=True)
    sheet.convert('RGB').save(path, optimize=True)


ORDER_GROUPS = ('food', 'char', 'ui')


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--raw', default='/tmp/fds-icons/raw')
    ap.add_argument('--only', default='')
    ap.add_argument('--no-sheet', action='store_true')
    ap.add_argument('--sheet', default=SHEET)
    args = ap.parse_args()
    os.makedirs(OUT, exist_ok=True)
    only = [s for s in args.only.split(',') if s]
    metas = {}
    for js in sorted(glob.glob(os.path.join(args.raw, '*.json'))):
        n = os.path.splitext(os.path.basename(js))[0]
        with open(js) as f:
            metas[n] = json.load(f)
    for n, meta in metas.items():
        if only and n not in only:
            continue
        img = process(os.path.join(args.raw, n + '.png'), meta)
        img.save(os.path.join(OUT, n + '.png'), optimize=True)
        img.save(os.path.join(OUT, n + '.webp'), quality=90, alpha_quality=100, method=6, exact=True)
        print('wrote', n, img.size)
    if not args.no_sheet:
        names = [n for g in ORDER_GROUPS for n in metas if metas[n]['group'] == g
                 and os.path.exists(os.path.join(OUT, n + '.png'))]
        contact_sheet(names, args.sheet)
        print('sheet', args.sheet)


if __name__ == '__main__':
    main()

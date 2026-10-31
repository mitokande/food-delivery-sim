"""The store apps' icon and splash, from the courier-on-the-Vespetta render (python3 + numpy + scipy + Pillow).

The look is the boot screen's (css/game.css #boot): its sunset gradient behind, and the logo's dark ink outline
and drop shadow around the rider. Writes the sources @capacitor/assets turns into every Android / iOS size:

    blender -b --factory-startup -P tools/blender/vehicles_render.py -- --mode appicon --only vespetta --out /tmp/fds-app
    python3 mobile/scripts/icon.py /tmp/fds-app/app-vespetta.png
    cd mobile && npm run assets

mobile/assets/icon-only.png         1024, opaque: iOS and the old Android icons (the phone rounds the corners)
mobile/assets/icon-foreground.png   1024, transparent, rider inside the adaptive icon's safe circle
mobile/assets/icon-background.png   1024, the gradient
mobile/assets/splash.png, splash-dark.png   2732, the gradient with a smaller rider
"""
import os, sys
import numpy as np
from scipy import ndimage
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, '..', 'assets')
INK = (0x3a, 0x1d, 0x24)                 # .logo span stroke
SHADOW = (60, 20, 30, 0.35)              # .logo drop-shadow
STOPS = [(0.0, (0xff, 0xd2, 0x8a)), (0.45, (0xf3, 0x9a, 0x5b)), (1.0, (0x8f, 0x4f, 0x6e))]  # #boot gradient


def gradient(w, h):
    """radial-gradient(120% 90% at 50% 20%, ...) as CSS draws it on a w x h box"""
    y, x = np.mgrid[0:h, 0:w].astype(np.float32)
    t = np.sqrt(((x + 0.5 - 0.5 * w) / (1.2 * w)) ** 2 + ((y + 0.5 - 0.2 * h) / (0.9 * h)) ** 2)
    out = np.zeros((h, w, 3), np.float32)
    for (t0, c0), (t1, c1) in zip(STOPS, STOPS[1:]):
        f = np.clip((t - t0) / (t1 - t0), 0, 1)[..., None]
        seg = (t >= t0) if t0 == 0 else (t > t0)
        out = np.where(seg[..., None], np.array(c0) * (1 - f) + np.array(c1) * f, out)
    return Image.fromarray(np.clip(out, 0, 255).astype(np.uint8), 'RGB').convert('RGBA')


def inked(render):
    """the rider with the logo's ink outline and drop shadow, on a transparent square with room for both"""
    pad = render.width // 8
    src = Image.new('RGBA', (render.width + 2 * pad, render.height + 2 * pad))
    src.alpha_composite(render, (pad, pad))
    a = np.asarray(src, np.float32)[..., 3] / 255
    r = render.width * 0.016                                       # ~16 px at 1024
    dist = ndimage.distance_transform_edt(a < 0.5)
    ring = np.clip(r + 0.5 - dist, 0, 1)
    ink = np.zeros(a.shape + (4,), np.float32); ink[..., :3] = INK; ink[..., 3] = ring * 255
    shadow_a = ndimage.gaussian_filter(np.roll(ring, int(r * 1.4), axis=0), r * 0.5) * SHADOW[3]
    shadow = np.zeros_like(ink); shadow[..., :3] = SHADOW[:3]; shadow[..., 3] = shadow_a * 255
    out = Image.fromarray(shadow.astype(np.uint8), 'RGBA')
    out.alpha_composite(Image.fromarray(ink.astype(np.uint8), 'RGBA'))
    out.alpha_composite(src)
    return out.crop(out.getbbox())


def place(bg, art, width_frac, cy=0.5):
    """art scaled to width_frac of the background's width, centred (cy: its centre's height, 0 top .. 1 bottom)"""
    w = round(bg.width * width_frac); h = round(art.height * w / art.width)
    a = art.resize((w, h), Image.LANCZOS)
    bg.alpha_composite(a, ((bg.width - w) // 2, round(bg.height * cy - h / 2)))
    return bg


def main(path):
    os.makedirs(OUT, exist_ok=True)
    art = inked(Image.open(path).convert('RGBA'))
    place(gradient(1024, 1024), art, 0.80, 0.52).convert('RGB').save(os.path.join(OUT, 'icon-only.png'))
    # adaptive icons: @capacitor/assets insets both layers to the 72 dp a launcher shows, whose masks can cut that down
    # to a 66 dp circle (92 %): the rider stays inside it
    place(Image.new('RGBA', (1024, 1024)), art, 0.70, 0.51).save(os.path.join(OUT, 'icon-foreground.png'))
    gradient(1024, 1024).convert('RGB').save(os.path.join(OUT, 'icon-background.png'))
    splash = place(gradient(2732, 2732), art, 0.24, 0.5).convert('RGB')
    splash.save(os.path.join(OUT, 'splash.png')); splash.save(os.path.join(OUT, 'splash-dark.png'))
    print('wrote', ', '.join(sorted(os.listdir(OUT))))


if __name__ == '__main__':
    main(sys.argv[1] if len(sys.argv) > 1 else '/tmp/fds-app/app-vespetta.png')

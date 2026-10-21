"""Contact sheet for assets/models/cars.glb (plain python3 + Pillow).

    python3 tools/blender/cars_sheet.py --raw /tmp/fds-cars [--out tools/shots/cars-sheet.png]

Expects DIR/cell-<name>.png from `cars_render.py --mode cells`, plus an optional DIR/stats.json written by
`cars.py --report` (adds the triangle count under each label).
"""
import os, sys, json
from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
argv = sys.argv[1:]
def _arg(name, default=None):
    return argv[argv.index(name) + 1] if name in argv else default
RAW = _arg('--raw', '/tmp/fds-cars')
OUT = _arg('--out', os.path.join(ROOT, 'tools', 'shots', 'cars-sheet.png'))

ROWS = [['sedan', 'taxi', 'police', 'hatchback-sports', 'compact'],
        ['suv', 'suv-luxury', 'sedan-sports', 'van', 'ambulance'],
        ['delivery', 'truck', 'garbage-truck', 'sailboat', 'boat_small'],
        ['train_head', 'train_mid']]
W, H = 1600, 1000
TITLE = 44
BG = (246, 241, 232)
CELL_BG = (255, 252, 246)

def font(sz, bold=True):
    for p in ('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf' if bold else '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
              '/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf'):
        if os.path.exists(p):
            return ImageFont.truetype(p, sz)
    return ImageFont.load_default()

def main():
    stats = {}
    sp = os.path.join(RAW, 'stats.json')
    if os.path.exists(sp):
        stats = json.load(open(sp))
    sheet = Image.new('RGB', (W, H), BG)
    d = ImageDraw.Draw(sheet)
    d.text((18, 10), 'Food Delivery Simulator  -  cars.glb  (toy traffic, procedural, Blender 5.2)', font=font(22), fill=(52, 48, 60))
    d.text((W - 610, 16), 'paint id 1 shown with sample tints; runtime re-tints per car', font=font(14, False), fill=(110, 104, 112))
    body_h = H - TITLE
    row_h = [250, 250, 250, body_h - 750]
    y = TITLE
    for r, names in enumerate(ROWS):
        cw = W // len(names)
        for c, n in enumerate(names):
            x = c * cw
            box = (x + 4, y + 4, x + cw - 4, y + row_h[r] - 4)
            d.rounded_rectangle(box, 10, fill=CELL_BG)
            path = os.path.join(RAW, f'cell-{n}.png')
            if os.path.exists(path):
                im = Image.open(path).convert('RGB')
                tw, th = box[2] - box[0] - 8, box[3] - box[1] - 30
                im.thumbnail((tw, th), Image.LANCZOS)
                sheet.paste(im, (box[0] + 4 + (tw - im.width) // 2, box[1] + 26 + (th - im.height) // 2))
            lab = n
            st = stats.get(n)
            d.text((box[0] + 10, box[1] + 5), lab, font=font(15), fill=(40, 40, 52))
            if st:
                sz = st['size']
                d.text((box[0] + 10 + d.textlength(lab, font=font(15)) + 8, box[1] + 8),
                       f"{st['tris']} tris  L{sz[1]:.1f} W{sz[0]:.2f} H{sz[2]:.2f}", font=font(11, False), fill=(120, 116, 124))
        y += row_h[r]
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    sheet.save(OUT, optimize=True)
    print('sheet', OUT)

if __name__ == '__main__':
    main()

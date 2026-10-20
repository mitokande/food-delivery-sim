"""Post step for vehicles_render.py (plain python3 + Pillow).

    python3 tools/blender/vehicles_sheet.py --raw /tmp/fds-veh [--icons assets/icons] [--shots tools/shots]

* icons: raw 768 px RGBA renders -> 384x384 PNG (Lanczos), transparent background
* sheets: tools/shots/vehicles-sheet.png (no rider) and tools/shots/vehicles-rider.png
  (rider 3/4 + chase + side per vehicle, plus helmet check in drive / idle poses)
"""
import os, sys
from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
argv = sys.argv[1:]
def _arg(name, default=None):
    return argv[argv.index(name) + 1] if name in argv else default
RAW = _arg('--raw', '/tmp/fds-veh')
ICONS = _arg('--icons', os.path.join(ROOT, 'assets', 'icons'))
SHOTS = _arg('--shots', os.path.join(ROOT, 'tools', 'shots'))
VEH = ['rustbucket', 'zippy', 'vespetta', 'volt', 'mule', 'viper']
NAMES = {'rustbucket': 'Rust Bucket (kulustur)', 'zippy': 'Zippy 50', 'vespetta': 'Vespetta 125', 'volt': 'Volt E-Scooter',
         'mule': 'Mule cargo trike', 'viper': 'Viper 600'}
BG = (226, 229, 236, 255)
BG2 = (205, 210, 220, 255)

def font(sz, bold=True):
    for p in ('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf' if bold else '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
              '/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf'):
        if os.path.exists(p):
            return ImageFont.truetype(p, sz)
    return ImageFont.load_default()

def icons():
    os.makedirs(ICONS, exist_ok=True)
    for name in [f'veh-{v}' for v in VEH] + ['helmet']:
        src = os.path.join(RAW, 'icons', name + '.png')
        if not os.path.exists(src):
            continue
        im = Image.open(src).convert('RGBA').resize((384, 384), Image.LANCZOS)
        im.save(os.path.join(ICONS, name + '.png'), optimize=True)
        print('icon', name)

def tile(path, size, bg=BG):
    t = Image.new('RGBA', size, bg)
    if os.path.exists(path):
        im = Image.open(path).convert('RGBA')
        im.thumbnail(size, Image.LANCZOS)
        t.alpha_composite(im, ((size[0] - im.width) // 2, (size[1] - im.height) // 2))
    return t

def label(img, xy, text, sz=22, col=(40, 44, 58)):
    ImageDraw.Draw(img).text(xy, text, font=font(sz), fill=col)

def sheets():
    os.makedirs(SHOTS, exist_ok=True)
    C = os.path.join(RAW, 'cells')
    # --- bare vehicles: 3 x 2 grid, icon view
    cw, ch = 520, 520
    sheet = Image.new('RGBA', (cw * 3, ch * 2 + 70), BG)
    label(sheet, (24, 20), 'Food Delivery Simulator - player vehicles (assets/models/vehicles.glb)', 28)
    for i, v in enumerate(VEH):
        x, y = (i % 3) * cw, 70 + (i // 3) * ch
        sheet.alpha_composite(tile(os.path.join(C, f'cell-{v}.png'), (cw - 16, ch - 16), BG2), (x + 8, y + 8))
        label(sheet, (x + 22, y + 18), NAMES[v], 22)
    sheet.convert('RGB').save(os.path.join(SHOTS, 'vehicles-sheet.png'), optimize=True)
    print('sheet', os.path.join(SHOTS, 'vehicles-sheet.png'))
    # --- rider fit: one row per vehicle (3/4, chase, side) + helmet row
    cw, ch = 400, 400
    rows = VEH + ['helmet']
    sheet = Image.new('RGBA', (cw * 3 + 230, ch * len(rows) + 70), BG)
    label(sheet, (24, 14), 'Rider fit: character-male-a x2.2, `drive` frame 0, root placed at the `seat` empty; helmet parented to head bone', 22)
    for c, t in enumerate(('3/4 front-left (helmet)', 'chase cam: behind + above', 'side, helmet off (fit check)')):
        label(sheet, (230 + c * cw + 14, 44), t, 18, (90, 96, 112))
    for r, v in enumerate(rows):
        y = 70 + r * ch
        if v == 'helmet':
            cells = ['cell-helmet-drive.png', 'cell-helmet-idle.png', 'cell-helmet-idle-side.png']
            lab = 'helmet on\nhead bone\n(drive,\n idle,\n idle side)'
        else:
            cells = [f'cell-{v}-rider.png', f'cell-{v}-chase.png', f'cell-{v}-side.png']
            lab = NAMES[v].replace(' (', '\n(')
        label(sheet, (18, y + 24), lab, 22)
        for c, fn in enumerate(cells):
            sheet.alpha_composite(tile(os.path.join(C, fn), (cw - 12, ch - 12), BG2), (230 + c * cw + 6, y + 6))
    sheet.convert('RGB').save(os.path.join(SHOTS, 'vehicles-rider.png'), optimize=True)
    print('sheet', os.path.join(SHOTS, 'vehicles-rider.png'))

if '--icons-only' in argv:
    icons()
elif '--sheets-only' in argv:
    sheets()
else:
    icons()
    sheets()

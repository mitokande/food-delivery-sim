"""Compose tools/shots/props-sheet.png from props_render.py cells (plain python3 + Pillow).

    python3 tools/blender/props_sheet.py --raw DIR [--stats DIR/stats.json] [--out tools/shots/props-sheet.png]
"""
import os, sys, json
from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
argv = sys.argv[1:]
def _arg(name, default=None):
    return argv[argv.index(name) + 1] if name in argv else default
RAW = _arg('--raw', '/tmp/fds-props')
STATS = _arg('--stats', os.path.join(RAW, 'stats.json'))
OUT = _arg('--out', os.path.join(ROOT, 'tools', 'shots', 'props-sheet.png'))
ORDER = ['tree_round_a', 'tree_round_b', 'tree_round_c', 'palm_a', 'palm_b', 'bush_a', 'flower_pot',
         'street_lamp', 'street_lamp_double', 'traffic_light', 'sign_post', 'bollard', 'hydrant', 'trash_bin',
         'cafe_set_a', 'cafe_set_b', 'planter', 'bench', 'chalkboard', 'railing', 'bus_stop',
         'clock_tower', 'lighthouse', 'ferris_wheel', 'hill_house_a', 'hill_house_b', 'hill_house_c']
COLS, CW, CH, HEAD = 7, 256, 256, 54
BG = (236, 233, 226)

def font(sz, bold=True):
    for p in ('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf' if bold else '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
              '/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf'):
        if os.path.exists(p):
            return ImageFont.truetype(p, sz)
    return ImageFont.load_default()

stats = json.load(open(STATS)) if os.path.exists(STATS) else {}
names = [n for n in ORDER if os.path.exists(os.path.join(RAW, f'cell-{n}.png'))]
rows = (len(names) + COLS - 1) // COLS
sheet = Image.new('RGB', (COLS * CW + 8, HEAD + rows * CH + 8), BG)
d = ImageDraw.Draw(sheet)
d.text((14, 12), 'Food Delivery Simulator - street props kit  (assets/models/props.glb, EEVEE, runtime-like toy shading; grey figure = 1.5 m chibi)',
       font=font(19), fill=(40, 44, 58))
for i, n in enumerate(names):
    x, y = 4 + (i % COLS) * CW, HEAD + (i // COLS) * CH
    im = Image.open(os.path.join(RAW, f'cell-{n}.png')).convert('RGBA').resize((CW - 6, CH - 6), Image.LANCZOS)
    sky = Image.new('RGBA', im.size)
    sd = ImageDraw.Draw(sky)
    for yy in range(im.height):
        t = min(1.0, yy / (im.height * 0.75))
        c = tuple(int(a + (b - a) * t) for a, b in zip((128, 190, 240), (250, 240, 222))) + (255,)
        sd.line((0, yy, im.width, yy), fill=c)
    sheet.paste(Image.alpha_composite(sky, im).convert('RGB'), (x + 3, y + 3))
    st = stats.get(n, {})
    tris = st.get('tris')
    if n == 'ferris_wheel' and 'ferris_wheel_rotor' in stats:
        tris = f"{tris}+{stats['ferris_wheel_rotor']['tris']}"
    lab = n + (f'  {tris} tris' if tris is not None else '')
    d.rectangle((x + 3, y + 3, x + 3 + 9 * len(lab) + 10, y + 25), fill=(255, 255, 255))
    d.text((x + 8, y + 6), lab, font=font(13), fill=(40, 44, 58))
# last free cell: the street vignette (also saved full size next to the sheet)
scene = os.path.join(RAW, 'scene.png')
if os.path.exists(scene):
    im = Image.open(scene).convert('RGBA')
    sky = Image.new('RGBA', im.size)
    sd = ImageDraw.Draw(sky)
    for yy in range(im.height):
        t = min(1.0, yy / (im.height * 0.45))
        sd.line((0, yy, im.width, yy), fill=tuple(int(a + (b - a) * t) for a, b in zip((110, 180, 240), (225, 238, 250))) + (255,))
    full = Image.alpha_composite(sky, im).convert('RGB')
    full.save(os.path.join(os.path.dirname(OUT), 'props-street.png'), optimize=True)
    i = len(names)
    if i < rows * COLS:
        x, y = 4 + (i % COLS) * CW, HEAD + (i // COLS) * CH
        th = full.copy()
        th.thumbnail((CW - 6, CH - 6), Image.LANCZOS)
        sheet.paste(th, (x + 3 + (CW - 6 - th.width) // 2, y + 3))
        d.rectangle((x + 3, y + 3, x + 3 + 120, y + 25), fill=(255, 255, 255))
        d.text((x + 8, y + 6), 'street vignette', font=font(13), fill=(40, 44, 58))
os.makedirs(os.path.dirname(OUT), exist_ok=True)
sheet.save(OUT, optimize=True)
print('sheet', OUT, sheet.size)

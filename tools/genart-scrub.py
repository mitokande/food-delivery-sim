# Cuts the art of Ferdi's scrub mini game (tools/genart.mjs, the scrub-* names) into assets/ui4/scrub: the sheets by
# their grid, each cell trimmed to what is painted in it; the four surfaces scaled down.
#   python3 tools/genart-scrub.py <rawdir> [outdir=assets/ui4/scrub]
import sys
from PIL import Image
raw, out = sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else 'assets/ui4/scrub'
def cells(name, cols, rows, names, size):
    im = Image.open(f'{raw}/{name}.png').convert('RGBA'); cw, ch = im.width / cols, im.height / rows
    a = im.getchannel('A')
    # (nothing may sit on a line between two cells: 0 is a clean cut)
    for c in range(1, cols):
        x = round(c * cw); print(name, 'col line', c, 'alpha', a.crop((x - 1, 0, x + 1, im.height)).getextrema()[1])
    for r in range(1, rows):
        y = round(r * ch); print(name, 'row line', r, 'alpha', a.crop((0, y - 1, im.width, y + 1)).getextrema()[1])
    for i, n in enumerate(names):
        c, r = i % cols, i // cols
        cell = im.crop((round(c * cw), round(r * ch), round((c + 1) * cw), round((r + 1) * ch)))
        cell = cell.crop(cell.getchannel('A').point(lambda v: 255 if v > 12 else 0).getbbox()); k = size / max(cell.size)
        cell = cell.resize((max(1, round(cell.width * k)), max(1, round(cell.height * k))), Image.LANCZOS)
        cell.save(f'{out}/{n}.webp', quality=86, method=6); print(n, cell.size)
cells('scrub-dirt', 4, 3, [f'd{i}' for i in range(1, 13)], 256)
cells('scrub-tools', 3, 2, ['sponge', 'spray', 'foam', 'sparkle', 'glove', 'clipboard'], 192)
cells('scrub-stamps', 3, 1, ['a', 'b', 'c'], 256)
for n in ['counter', 'grill', 'floor', 'tiles']:
    Image.open(f'{raw}/scrub-{n}.png').convert('RGB').resize((720, 1080), Image.LANCZOS).save(f'{out}/{n}.webp', quality=80, method=6)

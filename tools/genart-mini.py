# Cuts the art of Ferdi's cook and flyers mini games and of the cook-offs (tools/genart.mjs, the cook-*, flyers-*,
# duel-* and face-critic names)
# into assets/ui4/cook, flyers, duel and faces: the sheets by their grid (cut in the empty gaps between the pictures),
# each cell trimmed to what is painted in it; the backgrounds scaled down; the faces cut square (from the top).
#   python3 tools/genart-mini.py <rawdir> [outdir=assets/ui4]
import os, sys
from PIL import Image
raw, out = sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else 'assets/ui4'
def cuts(a, n, across):
    # the n - 1 cuts between the cells: the middle of the empty gap nearest to each line of an even grid
    size = a.width if across else a.height
    full = [a.crop((i, 0, i + 1, a.height) if across else (0, i, a.width, i + 1)).getextrema()[1] > 12 for i in range(size)]
    gaps, i = [], 0
    while i < size:
        if full[i]: i += 1; continue
        j = i
        while j < size and not full[j]: j += 1
        gaps.append((i + j) / 2); i = j
    return [0] + [round(min(gaps, key=lambda g: abs(g - size * k / n))) for k in range(1, n)] + [size]
def cells(name, cols, rows, names, size, sub=None, face=False):
    im = Image.open(f'{raw}/{name}.png').convert('RGBA'); a = im.getchannel('A')
    d = f'{out}/{sub or name.split("-")[0]}'; os.makedirs(d, exist_ok=True)
    xs, ys = cuts(a, cols, True), cuts(a, rows, False); print(name, 'cut at', xs, ys)
    for i, n in enumerate(names):
        c, r = i % cols, i // cols
        cell = im.crop((xs[c], ys[r], xs[c + 1], ys[r + 1]))
        cell = cell.crop(cell.getchannel('A').point(lambda v: 255 if v > 12 else 0).getbbox())
        if face: # (a square from the top, round the middle)
            w = min(cell.size); x = (cell.width - w) // 2; cell = cell.crop((x, 0, x + w, w))
        k = size / max(cell.size)
        cell = cell.resize((max(1, round(cell.width * k)), max(1, round(cell.height * k))), Image.LANCZOS)
        cell.save(f'{d}/{n}.webp', quality=86, method=6); print(n, cell.size)
# (a column an ingredient, a row a stage: 0 raw, 1 done, 2 burnt)
cells('cook-food', 4, 3, [f'{n}{s}' for s in range(3) for n in ['patty', 'bun', 'bacon', 'onion']], 256)
cells('cook-tools', 3, 2, ['spatula', 'bell', 'burger', 'steam', 'smoke', 'flame'], 192)
cells('flyers-people', 4, 2, ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'v1', 'v2'], 256)
cells('flyers-tools', 3, 2, ['flyer', 'hand', 'love', 'angry', 'truck', 'megaphone'], 192)
cells('duel-rivals', 4, 2, ['todd', 'pip', 'brick', 'kyle', 'sharp', 'sly', 'dolores', 'baron'], 256, sub='faces', face=True)
cells('duel-skills', 4, 3, ['flambe', 'express', 'charm', 'tipjar', 'showstopper', 'peptalk', 'rush', 'salt', 'smoke', 'bribe', 'panic', 'crit'], 192)
cells('duel-icons', 4, 2, ['taste', 'pace', 'calm', 'ticket', 'emblem', 'pin-rival', 'pin-ours', 'pin-boss'], 192)
for n, f in [('cook-stove', 'cook/stove'), ('flyers-street', 'flyers/street'), ('duel-arena', 'duel/arena'), ('duel-map', 'duel/map')]:
    Image.open(f'{raw}/{n}.png').convert('RGB').resize((720, 1080), Image.LANCZOS).save(f'{out}/{f}.webp', quality=80, method=6)
face = Image.open(f'{raw}/face-critic.png').convert('RGBA').crop((290, 0, 930, 640))
face.paste((0, 0, 0, 0), (0, 420, 40, 640)) # (the tips of the fingers round his fork)
face.resize((256, 256), Image.LANCZOS).save(f'{out}/faces/critic.webp', quality=88, method=6)

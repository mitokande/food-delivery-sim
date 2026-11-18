# Cuts the art of Ferdi's cook and flyers mini games, of the cook-offs and of the repairs by hand (tools/genart.mjs,
# the cook-*, flyers-*, duel-*, fix-* and face-critic names)
# into assets/ui4/cook, flyers, duel, fix and faces: the sheets by their grid (cut in the empty gaps between the pictures),
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
have = lambda n: os.path.exists(f'{raw}/{n}.png') or print('no', n, '(skipped)') # (only the pictures that are in <rawdir>)
def cells(name, cols, rows, names, size, sub=None, face=False):
    if not have(name): return
    im = Image.open(f'{raw}/{name}.png').convert('RGBA'); a = im.getchannel('A')
    d = f'{out}/{sub or name.split("-")[0]}'; os.makedirs(d, exist_ok=True)
    xs, ys = cuts(a, cols, True), cuts(a, rows, False); print(name, 'cut at', xs, ys)
    for i, n in enumerate(names):
        if not n: continue # (a picture of the sheet no game uses any more)
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
cells('fix-tools', 4, 3, [None] * 10 + ['hammer', 'tin'], 192)
cells('fix-grime', 4, 2, ['tag1', 'tag2', 'poster1', 'poster2', 'moss', 'web', 'mud', 'soot'], 320)
cells('fix-wash', 3, 2, ['gun', 'splash', 'drop', 'tarp', 'foam', 'tank'], 384)
cells('fix-coins', 4, 2, ['c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'dish', 'roll'], 192)
cells('fix-plumb', 3, 2, ['p-straight', 'p-elbow', 'p-tee', 'p-cross', 'valve', 'sink'], 256)
cells('fix-garden', 4, 2, ['mower', 'fpot', 'gnome', 'birdbath', 'sprinkler', 'clippings', 'wcan', 'stone'], 256)
cells('fix-yard', 3, 2, ['scooter', 'car', 'van', 'crates', 'tyres', 'drums'], 384)
cells('fix-frame', 1, 1, ['frame'], 768)
for n, f in [('cook-stove', 'cook/stove'), ('flyers-street', 'flyers/street'), ('duel-arena', 'duel/arena'), ('duel-map', 'duel/map'),
             ('fix-front', 'fix/front'), ('fix-front-dirty', 'fix/front-dirty'), ('fix-till', 'fix/till'),
             ('fix-desk', 'fix/desk'), ('fix-tilewall', 'fix/tilewall'), ('fix-lawn', 'fix/lawn'), ('fix-lawn-wild', 'fix/lawn-wild'), ('fix-floor', 'fix/floor')]:
    if not have(n): continue
    os.makedirs(os.path.dirname(f'{out}/{f}'), exist_ok=True)
    Image.open(f'{raw}/{n}.png').convert('RGB').resize((720, 1080), Image.LANCZOS).save(f'{out}/{f}.webp', quality=80, method=6)
if have('fix-frame') and have('fix-photo'):
    fr = Image.open(f'{out}/fix/frame.webp').convert('RGB'); w, h = fr.size
    cream = lambda p: p[0] > 225 and p[1] > 215 and 170 < p[2] < 235 and p[0] - p[2] > 12
    col = [x for x in range(w) if cream(fr.getpixel((x, h // 2)))]; row = [y for y in range(h) if cream(fr.getpixel((w // 2, y)))]
    mat = (col[0] / w, row[0] / h, (col[-1] + 1) / w, (row[-1] + 1) / h); print('the mat of fix/frame (x0, y0, x1, y1 of it):', [round(v, 4) for v in mat])
    ph = Image.open(f'{raw}/fix-photo.png').convert('RGB'); k = (mat[2] - mat[0]) * w / ((mat[3] - mat[1]) * h) # (the mat's width : height)
    cw = min(ph.width, round(ph.height * k)); ch = round(cw / k); x0 = (ph.width - cw) // 2; y0 = (ph.height - ch) // 2
    ph.crop((x0, y0, x0 + cw, y0 + ch)).resize((600, round(600 / k)), Image.LANCZOS).save(f'{out}/fix/photo.webp', quality=86, method=6)
if not have('face-critic'): sys.exit()
face = Image.open(f'{raw}/face-critic.png').convert('RGBA').crop((290, 0, 930, 640))
face.paste((0, 0, 0, 0), (0, 420, 40, 640)) # (the tips of the fingers round his fork)
face.resize((256, 256), Image.LANCZOS).save(f'{out}/faces/critic.webp', quality=88, method=6)

# Small webp copies of the raw PNGs for the page: python3 tools/genart-webp.py <rawdir>
# Story panels → assets/story/<name>.webp at 768×512; the smash button icon → 256×256 with its transparency.
# Icon sheets (dishes.png, vehicles.png: one transparent image with every item on it) are cut into one webp per item,
# and ferdi.png (white background) becomes a cut-out portrait. The sheets need numpy and scipy.
import sys, os
from PIL import Image
raw, out = sys.argv[1], os.path.join(os.path.dirname(__file__), '..', 'assets', 'story')
os.makedirs(out, exist_ok=True)
def done(n): print(n, os.path.getsize(os.path.join(out, n + '.webp')) // 1024, 'KB')
for n in ['letter', 'diner', 'scooter', 'smash', 'cook-btn', 'stage2', 'stage3', 'stage4', 'stage5', 'away']:
    p = os.path.join(raw, n + '.png')
    if not os.path.exists(p): continue
    im = Image.open(p)
    if n.endswith('-btn'): im = im.convert('RGBA').resize((256, 256), Image.LANCZOS); im.save(os.path.join(out, n + '.webp'), quality=82, method=6)
    else: im = im.convert('RGB'); im.thumbnail((768, 512), Image.LANCZOS); im.save(os.path.join(out, n + '.webp'), quality=78, method=6)
    done(n)

# sheet → (file prefix, the items in reading order, rows on the sheet, square icon?)
SHEETS = {
    'dishes': ('dish', ['burger', 'hotdog', 'doner', 'pizza', 'noodle', 'fish', 'sushi', 'icecream'], 2, True),
    'vehicles': ('veh', ['rustbucket', 'zippy', 'vespetta', 'volt', 'viper'], 1, False),
}
# scale with premultiplied alpha, or the colour under the transparent pixels bleeds into the edges
def shrink(im, size):
    im = im.convert('RGBa'); im.thumbnail(size, Image.LANCZOS); return im.convert('RGBA')
def save(im, n): im.save(os.path.join(out, n + '.webp'), quality=84, method=6); done(n)

for sheet, (prefix, ids, rows, square) in SHEETS.items():
    p = os.path.join(raw, sheet + '.png')
    if not os.path.exists(p): continue
    import numpy as np
    from scipy import ndimage
    im = Image.open(p).convert('RGBA'); a = np.array(im)
    lab, k = ndimage.label(a[..., 3] > 128)
    area = ndimage.sum(np.ones(lab.shape), lab, range(1, k + 1))
    big = [int(i) + 1 for i in np.argsort(-area)[:len(ids)]]  # the items are the largest blobs
    if len(big) < len(ids): sys.exit(f'{sheet}: found {len(big)} items, expected {len(ids)}')
    ctr = {i: ndimage.center_of_mass(lab == i) for i in big}
    # loose bits (a crumb, a puff of steam) go to the item they are nearest to; specks are dropped
    owner = {i: i for i in big}
    for i in range(1, k + 1):
        if i in owner or area[i - 1] < 40: continue
        cy, cx = ndimage.center_of_mass(lab == i)
        owner[i] = min(big, key=lambda b: (ctr[b][0] - cy) ** 2 + (ctr[b][1] - cx) ** 2)
    # reading order: by row, then left to right
    order = sorted(big, key=lambda b: (int(ctr[b][0] * rows / lab.shape[0]), ctr[b][1]))
    for n, b in zip(ids, order):
        mine = np.isin(lab, [i for i, o in owner.items() if o == b])
        ys, xs = np.where(mine); y0, y1, x0, x1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
        cut = a[y0:y1, x0:x1].copy(); cut[..., 3] = np.where(mine[y0:y1, x0:x1], cut[..., 3], 0)  # a neighbour inside the box stays out
        it = Image.fromarray(cut)
        if square:
            side = int(max(it.size) * 1.08); sq = Image.new('RGBA', (side, side), (0, 0, 0, 0))
            sq.paste(it, ((side - it.width) // 2, (side - it.height) // 2)); it = sq
        save(shrink(it, (256, 256)), f'{prefix}-{n}')

# Uncle Ferdi: the white around him (and inside the spatula's slots) becomes transparent, then head and shoulders
p = os.path.join(raw, 'ferdi.png')
if os.path.exists(p):
    import numpy as np
    from scipy import ndimage
    a = np.array(Image.open(p).convert('RGB')).astype(np.float32)
    white = a.min(axis=2) > 244
    lab, k = ndimage.label(white)
    edge = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))) - {0}
    area = ndimage.sum(white, lab, range(1, k + 1))
    bg = np.isin(lab, [i for i in range(1, k + 1) if i in edge or area[i - 1] > 400])
    # soft edge: in the two pixels next to the background, the lighter the pixel the more of it is background
    near = ndimage.binary_dilation(bg, iterations=2) & ~bg
    alpha = np.where(bg, 0.0, 1.0); alpha[near] = np.clip((255 - a.min(axis=2)[near]) / 70, 0.15, 1)
    rgb = np.where(alpha[..., None] > 0, (a - 255 * (1 - alpha[..., None])) / np.maximum(alpha[..., None], 0.01), 0)
    cut = np.dstack([np.clip(rgb, 0, 255), alpha * 255]).astype(np.uint8)
    h, w = cut.shape[:2]; s = int(w * 0.74); x0 = int(w * 0.13)
    save(shrink(Image.fromarray(cut).crop((x0, 0, x0 + s, s)), (256, 256)), 'ferdi')

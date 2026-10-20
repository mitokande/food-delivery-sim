#!/usr/bin/env python3
"""District palette variants for the Kenney city kits -> assets/models/tex/*.png

    python3 tools/palettes.py

Every Kenney colormap is 512x512 = 4 rows x 16 half-cells (each half-cell 32 px wide, 128 px tall).
A half-cell is either a flat colour or a vertical gradient (light at the top -> darker at the bottom);
models sample it at u = cell centre and a v that runs along the face (walls: top of the wall -> v~12,
bottom -> v~102), which gives Kenney's baked vertical shading. A variant only changes the colours of
the half-cells, never the layout, so the same UVs work. See assets/models/tex/README.md for the map.

recolour(cell, mid)                 - keeps the original light->dark profile of the cell, re-hued to `mid`
                                      (the colour at the middle row), with a slightly warm top and a slightly
                                      cool/purple bottom like Kenney's own ramps.
recolour(cell, mid, top=, bottom=)  - explicit top / bottom colours (profile shape kept).
band(cell, rows, colour)            - paint rows [a, b) of a cell flat (used for the sidewalk top row).
"""
import os
import numpy as np
from PIL import Image

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
SRC = os.path.join(ROOT, 'assets/src/kenney')
OUT = os.path.join(ROOT, 'assets/models/tex')

KITS = {
    'roads': 'kenney_city-kit-roads',
    'commercial': 'kenney_city-kit-commercial_2.1',
    'suburban': 'kenney_city-kit-suburban_20',
    'industrial': 'kenney_city-kit-industrial_2.0',
}


def to_lin(c):
    c = np.asarray(c, dtype=np.float64) / 255.0
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)


def to_srgb(l):
    l = np.clip(l, 0, 1)
    return np.where(l <= 0.0031308, l * 12.92, 1.055 * np.power(l, 1 / 2.4) - 0.055) * 255.0


def lum(lin):
    return lin[..., 0] * 0.2126 + lin[..., 1] * 0.7152 + lin[..., 2] * 0.0722


def hexrgb(h):
    h = h.lstrip('#')
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


class Palette:
    def __init__(self, kit):
        self.kit = kit
        self.src = np.array(Image.open(os.path.join(SRC, KITS[kit], 'Models/GLB format/Textures/colormap.png')).convert('RGB')).astype(np.float64)
        self.img = self.src.copy()

    def block(self, cell, img=None):
        r, h = cell
        return (img if img is not None else self.img)[r * 128:(r + 1) * 128, h * 32:(h + 1) * 32]

    def recolour(self, cell, mid, top=None, bottom=None, warm=0.04, cool=0.05):
        """Re-hue a half-cell. mid/top/bottom are sRGB tuples or '#hex'."""
        mid = hexrgb(mid) if isinstance(mid, str) else mid
        top = hexrgb(top) if isinstance(top, str) else top
        bottom = hexrgb(bottom) if isinstance(bottom, str) else bottom
        orig = to_lin(self.block(cell, self.src)[:, 16])          # (128, 3) column profile
        L = lum(orig)
        Lmid = L[64]
        m = to_lin(mid)
        if top is None:
            top_l = m * (L.max() / max(Lmid, 1e-6))
            top_l = top_l * np.array([1 + warm, 1 + warm * 0.3, 1 - warm])
        else:
            top_l = to_lin(top)
        if bottom is None:
            bot_l = m * (L.min() / max(Lmid, 1e-6))
            bot_l = bot_l * np.array([1 - cool * 0.5, 1 - cool, 1 + cool * 1.5])
        else:
            bot_l = to_lin(bottom)
        if L.max() - L.min() < 1e-4:          # flat cell
            col = np.repeat(m[None, :], 128, 0)
        else:
            # piecewise: top..mid..bottom following the original luminance profile
            col = np.empty((128, 3))
            for y in range(128):
                if L[y] >= Lmid:
                    t = (L[y] - Lmid) / max(L.max() - Lmid, 1e-6)
                    col[y] = m + (top_l - m) * t
                else:
                    t = (Lmid - L[y]) / max(Lmid - L.min(), 1e-6)
                    col[y] = m + (bot_l - m) * t
        blk = self.block(cell)
        blk[:, :, :] = to_srgb(col)[:, None, :]
        return self

    def band(self, cell, rows, colour, feather=0):
        colour = hexrgb(colour) if isinstance(colour, str) else colour
        blk = self.block(cell)
        a, b = rows
        blk[a:b, :, :] = np.array(colour, dtype=np.float64)[None, None, :]
        if feather:
            c = to_lin(colour)
            for k in range(feather):
                y = b + k
                if y >= 128:
                    break
                t = (k + 1) / (feather + 1)
                cur = to_lin(blk[y, 0])
                blk[y, :, :] = to_srgb(c * (1 - t) + cur * t)[None, :]
        return self

    def save(self, name):
        os.makedirs(OUT, exist_ok=True)
        p = os.path.join(OUT, name + '.png')
        Image.fromarray(np.clip(np.round(self.img), 0, 255).astype(np.uint8)).save(p, optimize=True)
        return p


# ---------------------------------------------------------------- variants
def roads_warm():
    p = Palette('roads')
    p.recolour((3, 4), '#67625f')            # asphalt lanes: neutral warm dark grey
    p.recolour((3, 0), '#53504d')            # asphalt edge strip / gutter (darker)
    p.recolour((3, 1), '#5e5956')            # driveway asphalt
    p.recolour((3, 6), '#efe9da')            # markings: warm white
    # sidewalk + curb + slant sides + ALSO street-furniture poles share half-cell (2,7).
    # Sidewalk tops sample row 12 exactly, poles run over rows ~13-92: paint a beige-stone band on top,
    # then a warm grey ramp for curbs / poles.
    p.recolour((2, 7), '#a8a39c', top='#c9c3ba', bottom='#7d7873')
    p.band((2, 7), (0, 16), '#e6d6bb', feather=8)
    p.recolour((2, 6), '#d2c09f')            # plain paving: tile-low/high, square-bend corner, barrier blocks
    p.recolour((3, 5), '#6e6a66')            # dark metal: sign/light poles bases, bridge beams, electricity
    p.recolour((3, 3), '#4a4644')            # dumpster lid, traffic-light housings
    p.recolour((2, 9), '#f2eee6')            # light parts: sign backs, cone stripes
    return p.save('roads-warm')


def commercial(name, walls, trim, base, glass, awning, accent, plants=None, soil=None):
    p = Palette('commercial')
    p.recolour((2, 7), walls)                # main walls
    p.recolour((2, 1), trim)                 # cornices, window frames, parapets, pillars
    p.recolour((2, 3), base)                 # ground-floor band, flat roofs, balconies, floor bands
    p.recolour((1, 11), glass)               # windows, glass doors, curtain walls
    p.recolour((1, 1), awning)               # awnings, parasols, roof gardens, green dome
    p.recolour((1, 3), accent)               # shop-sign / awning accents (small)
    if plants:
        p.recolour((3, 3), plants)
    if soil:
        p.recolour((2, 9), soil)
    return p.save('commercial-' + name)


def suburban(name, roofs, walls, trim, doors, glass, fences, plants=None):
    p = Palette('suburban')
    p.recolour((1, 1), roofs)
    p.recolour((2, 7), walls)
    p.recolour((2, 1), trim)                 # window frames, plinth, chimneys, flat roofs
    p.recolour((2, 3), doors)                # doors + dark upper-storey cladding (types l, p, q)
    p.recolour((1, 11), glass)
    p.recolour((2, 9), fences)               # fences, planter boxes
    if plants:
        p.recolour((3, 3), plants)
    return p.save('suburban-' + name)


def industrial(name, walls, upper, trim, metal, accent, glass, containers=None):
    p = Palette('industrial')
    p.recolour((2, 15), walls)               # light walls (ground floors)
    p.recolour((2, 11), upper)               # dark upper walls + flat roofs
    p.recolour((2, 9), trim)                 # parapets, frames, roof edges, saw-tooth roofs
    p.recolour((2, 13), metal)               # tank / chimney metal
    p.recolour((1, 11), accent)              # yellow-orange tank bodies, chimney stripes
    p.recolour((3, 9), glass)
    if containers:
        for cell, c in zip([(1, 15), (1, 9), (3, 13)], containers):
            p.recolour(cell, c)
    return p.save('industrial-' + name)


def main():
    out = [roads_warm()]
    out.append(commercial('oldtown', walls='#da9068', trim='#f1dfbf', base='#8d4c3b', glass='#8fb8d0',
                          awning='#d4513c', accent='#f4b63f', plants='#5aa65a'))
    out.append(commercial('downtown', walls='#e2e4e4', trim='#8a9bb0', base='#4b5768', glass='#6fb1e8',
                          awning='#2f9fa8', accent='#ffc23d'))
    out.append(commercial('harbor', walls='#d9c49d', trim='#4f8882', base='#8e4a35', glass='#86b8b8',
                          awning='#c4643a', accent='#e8b04a'))
    out.append(suburban('hills', roofs='#b9553d', walls='#f3e6c9', trim='#b49a82', doors='#7a4b33',
                        glass='#8fbcd8', fences='#c98d5c'))
    out.append(industrial('harbor', walls='#d9c7a2', upper='#9a4b36', trim='#3f7f80', metal='#9fb3b0',
                          accent='#e08a3c', glass='#86b8b8',
                          containers=['#b84a32', '#3e8a78', '#3d6f93']))
    # extra variants so a district can alternate two looks (one extra draw call per chunk)
    out.append(commercial('oldtown-b', walls='#e8c27a', trim='#fbf0dc', base='#6f5a4c', glass='#8fb8d0',
                          awning='#3f9a6a', accent='#e2553f', plants='#5aa65a'))
    out.append(suburban('hills-b', roofs='#8a5a44', walls='#f6dfa4', trim='#ffffff', doors='#3f6e8c',
                        glass='#8fbcd8', fences='#f2ece0'))
    for p in out:
        print(p, os.path.getsize(p))


if __name__ == '__main__':
    main()

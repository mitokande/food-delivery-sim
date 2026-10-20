#!/usr/bin/env python3
"""Builds assets/models/kit-manifest.json from the packed kit GLBs (+ restaurants.glb).

    python3 tools/build-manifest.py

Geometry is decoded with tools/dump-geom.mjs (Node + draco3dgltf), then analysed here:
  * bbox / size / triangle count for every top-level piece,
  * road pieces: top-down rasterisation of the upward-facing surfaces, classified by palette cell
    (asphalt / markings / sidewalk / plain paving), to find which edges the road opens to, the exact
    asphalt spans on every edge, the road height at each opening and whether sidewalk is included,
  * building fronts (verified visually from 4-side renders: every Kenney city building has its
    shop-front / front door on -Z; most also have a small back door on +Z).
"""
import json, math, os, subprocess, sys, tempfile
import numpy as np

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
MODELS = os.path.join(ROOT, 'assets/models')
KITS = ['kit-roads', 'kit-commercial', 'kit-suburban', 'kit-industrial', 'kit-cars', 'kit-food', 'restaurants']
RES = 0.005  # raster resolution for the road analysis (kit units)

# Palette cells of the roads colormap (row = v*512//128, half-column = u*512//32), see assets/models/tex/README.md
ROAD_CELLS = {(3, 0), (3, 1), (3, 4)}      # asphalt edge strip, driveway asphalt, asphalt lanes
MARK_CELLS = {(3, 6)}                      # lane lines, zebra crossings, stop lines
SIDEWALK_CELLS = {(2, 7)}                  # sidewalk top + curb faces (gradient swatch)
PAVE_CELLS = {(2, 6)}                      # plain paving (tile-*, road-bend-square corner, barrier tops)


def dump(glb, tmp):
    out = os.path.join(tmp, os.path.basename(glb) + '.json')
    subprocess.run(['node', os.path.join(ROOT, 'tools/dump-geom.mjs'), glb, out], check=True, cwd=os.path.join(ROOT, 'tools'),
                   stdout=subprocess.DEVNULL)
    with open(out) as f:
        return json.load(f)


def arrays(g):
    P = np.array(g['P'], dtype=np.float64).reshape(-1, 3)
    N = np.array(g['N'], dtype=np.float64).reshape(-1, 3)
    UV = np.array(g['UV'], dtype=np.float64).reshape(-1, 2)
    I = np.array(g['IDX'], dtype=np.int64).reshape(-1, 3)
    return P, N, UV, I


def r4(v):
    return [round(float(x), 4) + 0.0 for x in v]


def cell_of(uv):
    u, v = uv
    x = min(max(int(u * 512), 0), 511)
    y = min(max(int(v * 512), 0), 511)
    return (y // 128, x // 32)


def footprint_axis(lo, hi):
    n = max(1, int(round(hi - lo - 0.05)))
    return n, -n / 2, n / 2


def raster(P, N, UV, I, x0, x1, z0, z1):
    nx = int(round((x1 - x0) / RES)); nz = int(round((z1 - z0) / RES))
    H = np.full((nz, nx), -9.0); C = np.zeros((nz, nx), dtype=np.int8)
    xs = x0 + (np.arange(nx) + 0.5) * RES; zs = z0 + (np.arange(nz) + 0.5) * RES
    for t in I:
        n = N[t].mean(0)
        if n[1] < 0.3:
            continue
        cell = cell_of(UV[t].mean(0))
        c = 1 if cell in ROAD_CELLS else 4 if cell in MARK_CELLS else 2 if cell in SIDEWALK_CELLS else 3 if cell in PAVE_CELLS else 5
        p = P[t]
        a, b, d = p[0, [0, 2]], p[1, [0, 2]], p[2, [0, 2]]
        i0 = max(int((p[:, 0].min() - x0) / RES) - 1, 0); i1 = min(int((p[:, 0].max() - x0) / RES) + 2, nx)
        j0 = max(int((p[:, 2].min() - z0) / RES) - 1, 0); j1 = min(int((p[:, 2].max() - z0) / RES) + 2, nz)
        if i1 <= i0 or j1 <= j0:
            continue
        X, Z = np.meshgrid(xs[i0:i1], zs[j0:j1])
        v0 = b - a; v1 = d - a; den = v0[0] * v1[1] - v1[0] * v0[1]
        if abs(den) < 1e-12:
            continue
        wx = X - a[0]; wz = Z - a[1]
        l1 = (wx * v1[1] - v1[0] * wz) / den; l2 = (v0[0] * wz - wx * v0[1]) / den; l0 = 1 - l1 - l2
        m = (l0 >= -1e-6) & (l1 >= -1e-6) & (l2 >= -1e-6)
        y = l0 * p[0, 1] + l1 * p[1, 1] + l2 * p[2, 1]
        sub = H[j0:j1, i0:i1]; subc = C[j0:j1, i0:i1]
        upd = m & (y > sub + 1e-6)
        sub[upd] = y[upd]; subc[upd] = c
    return H, C, xs, zs


def runs(vals, heights, coords):
    out = []
    k = 0
    while k < len(vals):
        j = k
        while j + 1 < len(vals) and vals[j + 1] == vals[k]:
            j += 1
        h = heights[k:j + 1]
        out.append((int(vals[k]), round(float(coords[k] - RES / 2), 3), round(float(coords[j] + RES / 2), 3),
                    round(float(np.median(h)), 3)))
        k = j + 1
    return out


NAMES = {0: 'none', 1: 'road', 2: 'sidewalk', 3: 'paving', 4: 'road', 5: 'other'}


def analyse_road(name, g, max_y=None):
    P, N, UV, I = arrays(g)
    if max_y is not None:  # only look at the surfaces below max_y (lower level of road-bridge)
        keep = P[I][:, :, 1].max(1) < max_y
        I = I[keep]
    mn, mx = P.min(0), P.max(0)
    nxt, fx0, fx1 = footprint_axis(mn[0], mx[0])
    nzt, fz0, fz1 = footprint_axis(mn[2], mx[2])
    # edges are taken at the piece's bbox (== footprint for all regular pieces; road-straight-half is 0.5 long,
    # road-side* overhang 0.31 to the N)
    x0, x1 = round(mn[0] / RES) * RES, round(mx[0] / RES) * RES
    z0, z1 = round(mn[2] / RES) * RES, round(mx[2] / RES) * RES
    H, C, xs, zs = raster(P, N, UV, I, x0, x1, z0, z1)
    C = np.where(C == 4, 1, C)  # markings are road surface
    edges = {
        'N': (C[0, :], H[0, :], xs, z0), 'S': (C[-1, :], H[-1, :], xs, z1),
        'W': (C[:, 0], H[:, 0], zs, x0), 'E': (C[:, -1], H[:, -1], zs, x1),
    }
    edge_info = {}
    openings = []
    driveways = []
    for side, (vals, hs, coords, pos) in edges.items():
        rr = runs(vals, hs, coords)
        edge_info[side] = [{'surface': NAMES[v], 'from': a, 'to': b, 'y': (h if v else None)} for v, a, b, h in rr]
        for v, a, b, h in rr:
            if v != 1:
                continue
            centre = (a + b) / 2
            at = [round(centre, 3), round(pos, 3)] if side in 'NS' else [round(pos, 3), round(centre, 3)]
            if b - a >= 0.3:
                lo, n = (fx0, nxt) if side in 'NS' else (fz0, nzt)
                tile_cs = [lo + k + 0.5 for k in range(n)]
                aligned = any(abs(a - (tc - 0.4)) < 0.011 and abs(b - (tc + 0.4)) < 0.011 for tc in tile_cs)
                edge_on_grid = abs(pos * 2 - round(pos * 2)) < 0.02 and abs(pos) >= 0.49
                openings.append({'side': side, 'at': at, 'span': [a, b], 'y': h, 'aligned': bool(aligned and edge_on_grid)})
            elif b - a >= 0.15:
                driveways.append({'side': side, 'at': at, 'span': [a, b], 'y': h})
    cover = float((C > 0).mean()) * ((x1 - x0) * (z1 - z0)) / (nxt * nzt)
    has_sidewalk = bool((C == 2).any())
    side_full = [s for s, (vals, hs, coords, pos) in edges.items() if (vals == 2).mean() > 0.98]
    road_y = H[C == 1]
    out = {
        'footprintTiles': [nxt, nzt],
        'origin': ('tile-center' if nxt % 2 and nzt % 2 else 'tile-corner' if not nxt % 2 and not nzt % 2 else 'edge-mid'),
        'opens': sorted({o['side'] for o in openings}, key='NESW'.index),
        'openings': openings,
        'allAligned': all(o['aligned'] for o in openings),
        'sidewalk': has_sidewalk,
        'sidewalkFullEdges': sorted(side_full, key='NESW'.index),
        'groundCoverage': round(min(cover, 1.0), 3),
        'roadY': [round(float(road_y.min()), 3), round(float(road_y.max()), 3)] if road_y.size else None,
        'edges': edge_info,
    }
    if driveways:
        out['driveways'] = driveways
    return out


ROAD_NOTES = {
    'road-straight': 'straight road, 2 lanes, continuous centre line',
    'road-straight-half': 'half-length straight (0.5 along the road), for odd offsets',
    'road-crossing': 'straight with zebra crossing (stripes run N-S across the road)',
    'road-bend': 'tight 90° bend (radius 0.5 to the centre line, around the S-W corner); NE corner beyond the outer sidewalk is EMPTY (no ground) - put a ground tile under it or use road-bend-sidewalk',
    'road-bend-sidewalk': 'road-bend with the outer (NE) corner filled with sidewalk',
    'road-bend-square': 'square-cornered 90° bend; outer N and E edges are sidewalk',
    'road-end': 'dead end (square), sidewalk on 3 sides',
    'road-end-round': 'dead end, rounded cul-de-sac; outer corners on the W side are EMPTY',
    'road-intersection': 'T junction (no road to the N)',
    'road-intersection-line': 'T junction with centre lines continued',
    'road-intersection-path': 'T junction with zebra crossings on all three arms',
    'road-crossroad': '4-way crossroad',
    'road-crossroad-line': '4-way crossroad with centre lines continued through',
    'road-crossroad-path': '4-way crossroad with zebra crossings on all arms',
    'road-square': 'closed square of asphalt surrounded by sidewalk (parking / plaza); no openings',
    'road-driveway-single': 'straight road with a driveway cut through the S sidewalk',
    'road-driveway-double': 'straight road with driveway cuts through both sidewalks (N and S)',
    'road-curve': 'wide 90° curve over 2x2 tiles; origin at the shared corner of the 4 tiles; outer NE and inner SW areas partly EMPTY',
    'road-curve-pavement': 'road-curve with the outside (NE) filled with sidewalk',
    'road-curve-intersection': 'road-curve plus a straight branch continuing E along the top row (N tiles)',
    'road-roundabout': '3x3 roundabout with 4 arms; centre island; corners EMPTY',
    'road-side': 'straight road widened on the N side by an extra lane that OVERHANGS the tile by 0.31 (highway on-/off-ramp lane)',
    'road-side-entry': 'start of the widened N lane (taper) - pairs with road-side',
    'road-side-exit': 'end of the widened N lane (taper) - pairs with road-side',
    'road-split': 'two roads (W side, 1x2 tiles) merging into one road on the E side; E opening is centred on the boundary between the two tiles (not grid aligned)',
    'road-bridge': 'elevated road deck (top at y=0.52) on 4 posts, runs N-S; ground-level road also included underneath (E-W)',
    'road-slant': 'ramp along the road (E-W), rises 0.25 over one tile',
    'road-slant-high': 'ramp from 0.25 to 0.5 (stack on tile-high or after road-slant)',
    'road-slant-flat': 'thin ramp deck (no solid block under it), rises 0.25',
    'road-slant-flat-high': 'thin ramp deck from 0.25 to 0.5',
    'road-slant-curve': 'smooth S-profile ramp over 2 tiles (E-W), 0 to 0.5, solid',
    'road-slant-flat-curve': 'smooth S-profile ramp deck over 2 tiles, 0 to 0.5, thin',
}


def classify(kit, name):
    if kit == 'kit-roads':
        if name.endswith('-barrier') or '-barrier-' in name:
            return 'road-overlay'
        if name.startswith('road-sign') or name.startswith('traffic-light') or name.startswith('light-') or name.startswith('sign-'):
            return 'prop'
        if name.startswith('road-'):
            return 'road'
        if name.startswith('tile-'):
            return 'ground'
        return 'prop'
    if kit == 'kit-commercial':
        if name.startswith('low-detail-'):
            return 'building-lowdetail'
        if name.startswith('building-'):
            return 'building'
        return 'detail'
    if kit == 'kit-suburban':
        if name.startswith('building-'):
            return 'building'
        if name.startswith('fence'):
            return 'fence'
        if name.startswith('path') or name.startswith('driveway'):
            return 'path'
        if name.startswith('tree'):
            return 'tree'
        return 'detail'
    if kit == 'kit-industrial':
        if name.startswith('building-'):
            return 'building'
        return 'prop'
    if kit == 'kit-cars':
        return 'prop' if name in ('cone', 'cone-flat', 'box') else 'vehicle'
    if kit == 'kit-food':
        return 'food'
    if kit == 'restaurants':
        return 'landmark'
    return 'prop'


def main():
    tmp = tempfile.mkdtemp(prefix='fds-manifest-')
    manifest = {
        'version': 1,
        'units': 'kit units: 1 = one road tile (the game scales a tile to 8 m). +Y up. All pieces have their origin at ground '
                 'level (y=0), centred on their footprint; top-level node transform is identity.',
        'conventions': {
            'edges': {'N': '-Z', 'S': '+Z', 'E': '+X', 'W': '-X'},
            'rotation': 'three.js rotation.y = +PI/2 (counter-clockwise seen from above) maps N->W, W->S, S->E, E->N '
                        '(and a -Z front becomes -X). rotation.y = PI: N<->S, E<->W.',
            'buildingFront': 'Every Kenney city building (commercial, suburban, industrial) has its shop-front / front door '
                             'on -Z (N); most also have a small back door on +Z. Restaurants/landmarks in restaurants.glb face +Z (S).',
            'footprint': 'footprintTiles = [tiles along X, tiles along Z]; origin "tile-center" for odd x odd footprints, '
                         '"tile-corner" for even x even, "edge-mid" for mixed - i.e. pieces are always centred on their footprint.',
            'roadOpenings': 'opens = edges (in the default rotation) where asphalt (>=0.3 wide) reaches the edge of the piece. '
                            'openings[] gives each one exactly: side, at (local x,z of the middle of the opening on that edge), span '
                            '(asphalt extent along the edge, local coordinate), y (road surface height there), aligned (edge lies on '
                            'the tile grid and span == a tile centre +-0.4, i.e. it mates with a standard road-straight). '
                            'driveways[] = narrow asphalt cuts through the sidewalk (0.26 wide). edges{} lists every surface run '
                            'along each edge (road / sidewalk / paving / other / none=no geometry).',
        },
        'roadGeometry': {
            'note': 'Measured from road-straight (runs along X). Coordinates across the road (z) in kit units; x8 for metres.',
            'tileWidth': 1.0,
            'asphalt': {'from': -0.4, 'to': 0.4, 'width': 0.8, 'topY': 0.01},
            'edgeStrip': 'darker asphalt strips (gutter / parking strip) at 0.3 <= |z| <= 0.4 (0.1 wide), same height as the lanes',
            'lanes': [{'from': -0.3, 'to': -0.01, 'centre': -0.155}, {'from': 0.01, 'to': 0.3, 'centre': 0.155}],
            'centreLine': {'width': 0.02, 'at': 0.0, 'style': 'continuous on road-straight; uses the marking swatch'},
            'suggestedDrivingLineOffset': 'z = +-0.155 lane centres (or +-0.2 to use the full lane + edge strip). Right-hand '
                                           'traffic: travelling +X drive at z=+0.155 (the vehicle\'s right is +Z), travelling -X at z=-0.155.',
            'sidewalk': {'width': 0.1, 'innerEdge': 0.4, 'outerEdge': 0.5, 'topY': 0.02},
            'curb': {'height': 0.01, 'at': 0.4, 'note': 'vertical step from asphalt (y=0.01) to sidewalk (y=0.02) at |z|=0.4'},
            'baseY': 0.0,
            'metres': {'asphalt': 6.4, 'lane': 2.32, 'edgeStrip': 0.8, 'sidewalk': 0.8, 'curb': 0.08},
            'heights': {'tile-high / road-slant top': 0.25, 'road-slant-high / bridge deck top': 0.52},
        },
        'kits': {},
    }
    for kit in KITS:
        glb = os.path.join(MODELS, kit + '.glb')
        if not os.path.exists(glb):
            continue
        data = dump(glb, tmp)
        pieces = {}
        total = 0
        for name, g in data.items():
            P, N, UV, I = arrays(g)
            mn, mx = P.min(0), P.max(0)
            tris = len(I)
            total += tris
            e = {'category': classify(kit, name), 'bbox': {'min': r4(mn), 'max': r4(mx)}, 'size': r4(mx - mn), 'tris': tris}
            cat = e['category']
            if cat in ('building', 'building-lowdetail', 'ground', 'landmark'):
                # smallest whole-tile footprint (centred on the origin) that holds the piece; up to 0.075 overhang per side tolerated
                nx = max(1, math.ceil(mx[0] - mn[0] - 0.15)); nz = max(1, math.ceil(mx[2] - mn[2] - 0.15))
                e['footprintTiles'] = [nx, nz]
                e['origin'] = 'tile-center' if nx % 2 and nz % 2 else 'tile-corner' if not nx % 2 and not nz % 2 else 'edge-mid'
                over = [round(max(0.0, (mx[0] - mn[0] - nx) / 2), 3), round(max(0.0, (mx[2] - mn[2] - nz) / 2), 3)]
                if over[0] > 0.001 or over[1] > 0.001:
                    e['overhangPerSide'] = over
            if cat == 'building':
                e['front'] = '-Z'
            if cat == 'building-lowdetail':
                e['front'] = None
                e['note'] = 'low-detail filler (no doors) for distant blocks / skyline'
            if cat == 'landmark':
                e['front'] = '+Z'
                ex = g.get('extras') or {}
                for k in ('title', 'brandColor', 'awningColor', 'door', 'counter'):
                    if k in ex:
                        e[k] = [round(v, 3) for v in ex[k]] if isinstance(ex[k], list) else ex[k]
            if kit == 'kit-roads' and cat == 'road':
                e.update(analyse_road(name, g))
                if name == 'road-bridge':  # two levels: N-S deck on top, E-W road underneath
                    low = analyse_road(name, g, max_y=0.1)
                    e['levels'] = {'deck': {k: e[k] for k in ('opens', 'openings', 'roadY')},
                                   'ground': {k: low[k] for k in ('opens', 'openings', 'roadY')}}
                    e['opens'] = sorted(set(e['opens']) | set(low['opens']), key='NESW'.index)
                    e['openings'] = e['openings'] + low['openings']
                if name in ROAD_NOTES:
                    e['note'] = ROAD_NOTES[name]
            if kit == 'kit-roads' and cat == 'road-overlay':
                base = name.replace('-barrier-end', '').replace('-barrier-half', '').replace('-barrier', '')
                e['note'] = f'guard-rail overlay; place on top of {base} with the same transform' + (
                    ' (end cap)' if name.endswith('-end') else ' (half length)' if name.endswith('-half') else '')
            if g.get('children'):
                e['children'] = [{'name': c['name'], 'translation': r4(c['translation'])} for c in g['children']]
            mats = sorted({p['material'] for p in g['parts'] if p['material']})
            if kit == 'restaurants' or len(mats) > 1:
                e['materials'] = mats
            pieces[name] = e
        manifest['kits'][kit + '.glb'] = {'pieces': pieces, 'pieceCount': len(pieces), 'totalTris': total,
                                          'sizeKB': round(os.path.getsize(glb) / 1024, 1)}
    # Kit specific notes
    k = manifest['kits']
    if 'kit-commercial.glb' in k:
        k['kit-commercial.glb']['notes'] = ('detail-awning(-wide) / detail-overhang(-wide): the high/back edge (z=+0.248 / +0.25) goes '
                                            'against a wall, the canopy and posts stick out toward -Z (i.e. they belong on a -Z building front, '
                                            'translated so their +Z edge touches the wall).')
    if 'kit-cars.glb' in k:
        k['kit-cars.glb']['notes'] = ('Vehicles face +Z (front wheels at +Z), origin on the ground under the body centre. Car-kit scale: '
                                      'a sedan is ~2.6 units long, so scale cars down relative to road tiles (DOCS.md uses x1.5 on a metre scale). '
                                      'Children: body (+ optional door/doors/arm/grill/spoiler/wheel-back/trash) and wheel-front-left, '
                                      'wheel-front-right, wheel-back-left, wheel-back-right with their pivot at the wheel centre - spin about local X.')
    if 'restaurants.glb' in k:
        k['restaurants.glb']['notes'] = (
            'Landmarks face +Z (door/shop-front toward the street on +Z), lot 0.96 x 0.96 with a paved pad (y 0..0.012) and a '
            'small terrace between the facade (z ~ +0.15..0.19) and the lot edge. Materials per landmark: brand (main brand colour), '
            'awning (awning stripes / canopy), props (shared 64x64 palette texture for all untinted colours), food (Kenney food '
            'colormap, only where a Kenney food item is used). The child node <name>-sign is the giant rooftop food / sign with its '
            'pivot at its base centre (spin about Y: rest-doner spit; bob/rotate the others). Node extras (three.js userData): '
            'title, brandColor, awningColor, door [x,y,z] (pickup point), counter (serving hatch, doner/icecream).')
    if 'kit-industrial.glb' in k:
        k['kit-industrial.glb']['notes'] = 'windmill / windmill-low keep a child node "blades" with its pivot at the hub (spin about local X).'
    with open(os.path.join(MODELS, 'kit-manifest.json'), 'w') as f:
        json.dump(manifest, f, indent=1)
    for kit, v in k.items():
        print(f"{kit}: {v['pieceCount']} pieces, {v['totalTris']} tris, {v['sizeKB']} KB")


if __name__ == '__main__':
    main()

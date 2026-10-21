"""Validate assets/models/cars.glb (Blender 5.2 headless; re-imports the Draco GLB).

    blender -b --factory-startup -P tools/blender/cars_check.py -- [--glb assets/models/cars.glb]

Per top-level node: name, bbox (glTF axes: +Y up, +Z front), size, triangles, material ids decoded from UV0
(id = floor(u * 16)), COLOR_0 present.  Also checks the GLB JSON (one material `toy`, one primitive per mesh,
COLOR_0 / TEXCOORD_0 / NORMAL attributes, Draco) and that colours are stored linear (paint #e8e8e8 -> 0.807).
"""
import bpy, os, sys, json, struct, math
from collections import Counter

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
GLB = os.path.abspath(argv[argv.index('--glb') + 1] if '--glb' in argv else os.path.join(ROOT, 'assets', 'models', 'cars.glb'))

SPEC = {   # name: (length, max tris, max height)
    'sedan': (4.3, 2500, 1.7), 'taxi': (4.3, 2500, 1.95), 'hatchback-sports': (3.9, 2500, 1.7),
    'compact': (3.4, 2500, 1.7), 'suv': (4.5, 2500, 1.85), 'van': (4.8, 2500, 2.1), 'sedan-sports': (4.2, 2500, 1.7),
    'suv-luxury': (4.7, 2500, 1.85), 'police': (4.4, 2500, 1.9), 'delivery': (5.4, 3500, 3.0), 'truck': (6.2, 3500, 3.0),
    'garbage-truck': (6.6, 3500, 3.0), 'ambulance': (5.4, 3500, 3.0),
    'train_head': (12.0, 3000, 3.55), 'train_mid': (12.0, 3000, 3.55), 'sailboat': (8.6, 2000, 13), 'boat_small': (6.0, 2000, 5),
}
ALLOWED_IDS = {0, 1, 2, 3, 4, 5, 6, 8, 10}
problems = []

def lin(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4

# ---------------------------------------------------------------- GLB JSON
d = open(GLB, 'rb').read()
clen = struct.unpack('<I', d[12:16])[0]
J = json.loads(d[20:20 + clen])
scene = J['scenes'][J.get('scene', 0)]
top = [J['nodes'][i] for i in scene['nodes']]
mats = [m.get('name') for m in J.get('materials', [])]
print(f"CHK file {os.path.relpath(GLB, ROOT)}  {len(d) / 1024:.0f} KB  nodes(top)={len(top)}  materials={mats}  "
      f"extensions={J.get('extensionsUsed')}")
if mats != ['toy']:
    problems.append(f'materials {mats}')
for n in top:
    if 'children' in n:
        problems.append(f"{n['name']} has children")
    mesh = J['meshes'][n['mesh']]
    if len(mesh['primitives']) != 1:
        problems.append(f"{n['name']} has {len(mesh['primitives'])} primitives")
    attrs = mesh['primitives'][0]['attributes']
    for a in ('POSITION', 'NORMAL', 'TEXCOORD_0', 'COLOR_0'):
        if a not in attrs:
            problems.append(f"{n['name']} lacks {a}")
    if 'KHR_draco_mesh_compression' not in mesh['primitives'][0].get('extensions', {}):
        problems.append(f"{n['name']} not draco")
    t = n.get('translation', [0, 0, 0])
    if any(abs(v) > 1e-6 for v in t) or 'rotation' in n or 'scale' in n:
        problems.append(f"{n['name']} has a node transform {t}")

# ---------------------------------------------------------------- re-import
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=GLB)
objs = {o.name: o for o in bpy.data.objects if o.parent is None and o.type == 'MESH'}
print(f"{'name':17s} {'min (x,y,z)':>24s} {'max (x,y,z)':>24s} {'size W x H x L':>20s} {'tris':>5s}  ids         COLOR_0")
paint_lin = None
for name in [n['name'] for n in top]:
    o = objs.get(name)
    if o is None:
        problems.append(f'{name} missing after import')
        continue
    me = o.data
    me.calc_loop_triangles()
    tris = len(me.loop_triangles)
    vs = [o.matrix_world @ v.co for v in me.vertices]
    # glTF axes: x = bx, y = bz, z = -by
    mn = (min(v.x for v in vs), min(v.z for v in vs), min(-v.y for v in vs))
    mx = (max(v.x for v in vs), max(v.z for v in vs), max(-v.y for v in vs))
    W, H, L = mx[0] - mn[0], mx[1] - mn[1], mx[2] - mn[2]
    uv = me.uv_layers[0].data if me.uv_layers else None
    ids = Counter()
    col = me.color_attributes.get('Color') or (me.color_attributes[0] if len(me.color_attributes) else None)
    for poly in me.polygons:
        if uv:
            us = {round(uv[li].uv[0], 4) for li in poly.loop_indices}
            for u in us:
                ids[int(math.floor(u * 16))] += 1
            if len(us) > 1:
                problems.append(f'{name}: face with mixed ids')
                break
    idset = sorted(ids)
    # paint colour readback (first id-1 face)
    if col is not None and paint_lin is None:
        for poly in me.polygons:
            li = poly.loop_indices[0]
            if uv and int(uv[li].uv[0] * 16) == 1:
                paint_lin = tuple(col.data[li].color[:3])
                break
    print(f"{name:17s} ({mn[0]:6.2f},{mn[1]:6.2f},{mn[2]:6.2f}) ({mx[0]:6.2f},{mx[1]:6.2f},{mx[2]:6.2f}) "
          f"{W:5.2f} x {H:4.2f} x {L:5.2f} {tris:5d}  {','.join(map(str, idset)):11s} {'yes' if col is not None else 'NO'}")
    spec = SPEC.get(name)
    if col is None:
        problems.append(f'{name}: no COLOR_0')
    if not set(idset) <= ALLOWED_IDS:
        problems.append(f'{name}: unexpected ids {idset}')
    if spec:
        Ls, tmax, hmax = spec
        if abs(L - Ls) > 0.15:
            problems.append(f'{name}: length {L:.2f} vs {Ls}')
        if tris > tmax * 1.02:
            problems.append(f'{name}: {tris} tris > {tmax}')
        if H > hmax:
            problems.append(f'{name}: height {H:.2f} > {hmax}')
    boat = name in ('sailboat', 'boat_small')
    train = name.startswith('train')
    if not boat and not train and W > 2.25:
        problems.append(f'{name}: width {W:.2f} > 2.25')
    if not boat and abs(mn[1]) > 0.01:
        problems.append(f'{name}: min y {mn[1]:.3f}')
    if abs((mn[0] + mx[0]) / 2) > 0.1 or abs((mn[2] + mx[2]) / 2) > 0.1:
        problems.append(f'{name}: not centred ({(mn[0] + mx[0]) / 2:.2f}, {(mn[2] + mx[2]) / 2:.2f})')
if paint_lin:
    print(f"COLOR paint #e8e8e8 read back as linear {paint_lin[0]:.3f} (expected {lin(0xe8 / 255):.3f}; "
          f"#808080 would be {lin(0x80 / 255):.3f})")
    if abs(paint_lin[0] - lin(0xe8 / 255)) > 0.01:
        problems.append(f'paint colour not linear: {paint_lin}')
print('ALL OK' if not problems else 'PROBLEMS:\n  ' + '\n  '.join(problems))

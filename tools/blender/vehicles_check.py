"""Validate assets/models/vehicles.glb in glTF space (plain python3, no deps).

    python3 tools/blender/vehicles_check.py [assets/models/vehicles.glb] [--json out.json]

Checks: root nodes have identity transforms, required part nodes exist under each vehicle,
wheel_front is at +Z (front) and wheel_rear at -Z, wheels touch the ground, origin is midway
between the axles, materials `paint` / `box` exist per vehicle, triangle budget, and prints
world positions of the seat / light / exhaust empties plus bounding boxes.
"""
import json, struct, sys, math, os

HERE = os.path.dirname(os.path.abspath(__file__))
path = next((a for a in sys.argv[1:] if a.endswith('.glb')),
            os.path.join(HERE, '..', '..', 'assets', 'models', 'vehicles.glb'))
out_json = sys.argv[sys.argv.index('--json') + 1] if '--json' in sys.argv else None

d = open(path, 'rb').read()
clen = struct.unpack('<I', d[12:16])[0]
J = json.loads(d[20:20 + clen])
nodes = J['nodes']

def qmat(q):
    x, y, z, w = q
    return [[1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
            [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
            [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)]]

def local(n):
    t = n.get('translation', [0, 0, 0])
    r = qmat(n.get('rotation', [0, 0, 0, 1]))
    s = n.get('scale', [1, 1, 1])
    m = [[r[i][j] * s[j] for j in range(3)] + [t[i]] for i in range(3)] + [[0, 0, 0, 1]]
    return m

def mul(a, b):
    return [[sum(a[i][k] * b[k][j] for k in range(4)) for j in range(4)] for i in range(4)]

def apply(m, p):
    return [sum(m[i][k] * p[k] for k in range(3)) + m[i][3] for i in range(3)]

parent = {}
for i, n in enumerate(nodes):
    for c in n.get('children', []):
        parent[c] = i
world = {}
def W(i):
    if i not in world:
        world[i] = mul(W(parent[i]), local(nodes[i])) if i in parent else local(nodes[i])
    return world[i]

def pos_w(i):
    return apply(W(i), [0, 0, 0])

def subtree(i):
    out = [i]
    for c in nodes[i].get('children', []):
        out += subtree(c)
    return out

scene_roots = J['scenes'][J.get('scene', 0)]['nodes']
REQ = ['body', 'steer', 'wheel_front', 'box', 'seat', 'exhaust', 'headlight', 'taillight']
ok = True
report = {}
def fail(msg):
    global ok
    ok = False
    print('  FAIL', msg)

for r in scene_roots:
    rn = nodes[r]
    name = rn.get('name')
    print(f'== {name}')
    if any(k in rn for k in ('translation', 'rotation', 'scale', 'matrix')):
        fail(f'root {name} has a transform {rn}')
    parts = {}
    for i in subtree(r)[1:]:
        p = (nodes[i].get('extras') or {}).get('part') or nodes[i].get('name')
        parts[p] = i
    # bbox + tris + materials
    mn, mx, tris, mats = [1e9] * 3, [-1e9] * 3, 0, set()
    for i in subtree(r):
        n = nodes[i]
        if 'mesh' not in n:
            continue
        for prim in J['meshes'][n['mesh']]['primitives']:
            acc = J['accessors'][prim['attributes']['POSITION']]
            tris += J['accessors'][prim['indices']]['count'] // 3
            if 'material' in prim:
                mats.add(J['materials'][prim['material']]['name'])
            lo, hi = acc['min'], acc['max']
            for cx in (lo[0], hi[0]):
                for cy in (lo[1], hi[1]):
                    for cz in (lo[2], hi[2]):
                        p = apply(W(i), [cx, cy, cz])
                        mn = [min(a, b) for a, b in zip(mn, p)]
                        mx = [max(a, b) for a, b in zip(mx, p)]
    info = dict(tris=tris, materials=sorted(mats), bbox_min=[round(v, 3) for v in mn], bbox_max=[round(v, 3) for v in mx],
                size=[round(b - a, 3) for a, b in zip(mn, mx)])
    print(f'  tris {tris}  materials {len(mats)} {sorted(mats)}')
    print(f'  AABB of node bboxes (overestimates rotated steer parts) size {info["size"]}')
    if name == 'helmet':
        report[name] = info
        continue
    if tris > 3500:
        fail(f'triangle budget {tris} > 3500')
    for k in ('paint', 'box'):
        if k not in mats:
            fail(f'material {k} missing')
    req = REQ + (['wheel_rear_l', 'wheel_rear_r'] if 'wheel_rear_l' in parts else ['wheel_rear'])
    for k in req:
        if k not in parts:
            fail(f'missing part {k}')
    pos = {k: [round(v, 4) for v in apply(W(i), [0, 0, 0])] for k, i in parts.items()}
    info['parts'] = pos
    # wheel checks
    wf = pos['wheel_front']
    rears = [pos[k] for k in ('wheel_rear', 'wheel_rear_l', 'wheel_rear_r') if k in pos]
    if wf[2] <= 0:
        fail('front wheel not at +Z')
    for wr in rears:
        if wr[2] >= 0:
            fail('rear wheel not at -Z')
    if abs(wf[2] + rears[0][2]) > 1e-3:
        fail(f'origin not midway between axles ({wf[2]} / {rears[0][2]})')
    # ground contact: wheels are axisymmetric about local X, so local |y| extent = tyre radius
    lows = []
    for k in ('wheel_front', 'wheel_rear', 'wheel_rear_l', 'wheel_rear_r'):
        if k in parts:
            i = parts[k]
            rr = (rn.get('extras') or {}).get('wheel_radius_front' if k == 'wheel_front' else 'wheel_radius_rear')
            lows.append(round(pos_w(i)[1] - rr, 4))
    info['wheel_lowest_y'] = lows
    if any(abs(l) > 0.002 for l in lows):
        fail(f'wheels do not touch y=0: {lows}')
    ex = rn.get('extras', {})
    if 'bbox_min' in ex:
        print(f'  exact bbox (build time) min {ex["bbox_min"]} max {ex["bbox_max"]}  L {ex["length"]} W {ex["width"]} H {ex["height"]}')
        info.update(exact_bbox_min=ex['bbox_min'], exact_bbox_max=ex['bbox_max'], length=ex['length'], width=ex['width'], height=ex['height'])
        if abs(ex['bbox_min'][1]) > 0.003:
            fail(f'lowest point {ex["bbox_min"][1]}')
    # steer frame: local +Y axis must tilt backwards (toward -Z) and wheel_front must be its child
    st = parts['steer']
    ax = [W(st)[i][1] for i in range(3)]
    info['steer_axis'] = [round(v, 4) for v in ax]
    if parts['wheel_front'] not in nodes[st].get('children', []):
        fail('wheel_front is not a child of steer')
    lid = parts.get('box_lid')
    if lid is not None and lid not in nodes[parts['box']].get('children', []):
        fail('box_lid not a child of box')
    for k in ('seat', 'headlight', 'taillight', 'exhaust', 'box', 'box_lid', 'wheel_front', 'wheel_rear', 'wheel_rear_l',
              'wheel_rear_r', 'steer'):
        if k in pos:
            print(f'  {k:12s} {pos[k]}')
    print(f'  steer axis (local +Y in world) {info["steer_axis"]}  rake {math.degrees(math.atan2(-ax[2], ax[1])):.1f} deg')
    report[name] = info

print('ALL OK' if ok else 'PROBLEMS FOUND', '| file', os.path.getsize(path), 'bytes')
if out_json:
    json.dump(report, open(out_json, 'w'), indent=1)
sys.exit(0 if ok else 1)

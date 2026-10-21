"""Food Delivery Simulator - toy traffic cars, train and boats (Blender 5.2, headless, procedural).

    blender -b --factory-startup -P tools/blender/cars.py -- [--out assets/models/cars.glb]
            [--only sedan,taxi] [--nodraco] [--blend /tmp/cars.blend] [--report stats.json] [--debugx]

Every model is one joined mesh with one material called `toy`. Nothing uses image textures:
  * COLOR_0  flat per-face colour (authored as sRGB hex, stored in a BYTE_COLOR corner attribute, so the
             exporter writes the matching *linear* value: #808080 -> 0.216)
  * UV0      material id for the runtime shader, u = (id + 0.5) / 16, v = 0.5 on every corner of a face
             0 matte  1 paint (re-tintable)  2 glass  3 head light  4 tail light  5 chrome
             6 rubber  8 gloss (fixed livery)  10 always emissive (light bars, taxi sign)
The exporter splits vertices wherever the UV/colour of two faces differ, so faces with different ids never
share a vertex in the GLB.

Conventions (glTF / three.js): metres, +Y up, front = +Z, origin on the ground (bottom of the tyres) at the
centre of the footprint.  While building in Blender the front is -Y; helper P(x, f, z) takes the forward
distance f and returns Vector((x, -f, z)).

Bodies are lofts of rounded cross-sections (smooth, bubbly, ~1k tris) whose bottom line rises over each
axle, which cuts the wheel arches; the greenhouse is a loft of rounded plan-view rings with the glass band
coloured per segment (A/B/C pillars).  Details (lights, grilles, letters, stripes) are stuck onto the body by
ray casting against it.
"""
import bpy, bmesh, math, os, sys, json, struct
from mathutils import Vector, Matrix
from mathutils.bvhtree import BVHTree

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
def _arg(name, default=None):
    return argv[argv.index(name) + 1] if name in argv else default
OUT = os.path.abspath(_arg('--out', os.path.join(ROOT, 'assets', 'models', 'cars.glb')))
ONLY = [s for s in (_arg('--only', '') or '').split(',') if s]
BLEND = _arg('--blend')
DRACO = '--nodraco' not in argv
REPORT = _arg('--report')
DEBUGX = '--debugx' in argv

# ------------------------------------------------------------------------------------------------
# axes / maths
# ------------------------------------------------------------------------------------------------
X = Vector((1, 0, 0))
F = Vector((0, -1, 0))      # forward (glTF +Z)
Z = Vector((0, 0, 1))

def P(x, f, z):
    return Vector((x, -f, z))

def lerp(a, b, t):
    return a + (b - a) * t

def clamp(v, a, b):
    return max(a, min(b, v))

def smooth01(t):
    t = clamp(t, 0.0, 1.0)
    return t * t * (3 - 2 * t)

def pwl(pts, x):
    """piecewise-linear interpolation through [(x, y)] (sorted by x), clamped at the ends."""
    if x <= pts[0][0]:
        return pts[0][1]
    for (x0, y0), (x1, y1) in zip(pts[:-1], pts[1:]):
        if x <= x1:
            return lerp(y0, y1, (x - x0) / (x1 - x0) if x1 > x0 else 1.0)
    return pts[-1][1]

def arc2(cx, cy, r, a0, a1, n):
    """n+1 points on a circle arc (degrees, inclusive)."""
    out = []
    for i in range(n + 1):
        a = math.radians(lerp(a0, a1, i / n))
        out.append((cx + r * math.cos(a), cy + r * math.sin(a)))
    return out

# ------------------------------------------------------------------------------------------------
# swatches: (sRGB hex, material id).  Faces carry the swatch index in material_index while building.
# ------------------------------------------------------------------------------------------------
SW = []
_SWI = {}
def S(hexcol, mid):
    k = (hexcol.lower(), int(mid))
    if k not in _SWI:
        _SWI[k] = len(SW)
        SW.append(k)
    return _SWI[k]

def srgb01(h):
    h = h.lstrip('#')
    return tuple(int(h[i:i + 2], 16) / 255.0 for i in (0, 2, 4))

PAINT = '#e8e8e8'                   # neutral mid paint for re-tintable cars (id 1)
DARK = S('#2a2b31', 0)              # underbody, wheel wells, chassis
TYRE = S('#2c2c33', 6)
GLASS = S('#2d4b63', 2)
HEAD = S('#fff4d6', 3)
TAIL = S('#e0302a', 4)
CHROME = S('#d3d9e1', 5)
CHROME_D = S('#9aa4b0', 5)          # recessed hub dish
PLASTIC = S('#3b3e47', 0)           # dark bumpers / trim
PLASTIC_L = S('#c9ced6', 0)         # light grey trim
PLATE = S('#f3f1ea', 0)
AMBER = S('#ffae2b', 0)
BLACKP = S('#25262b', 0)            # black B-pillars / letters

# ------------------------------------------------------------------------------------------------
# bmesh helpers
# ------------------------------------------------------------------------------------------------
def newell(pts):
    n = Vector()
    for i in range(len(pts)):
        a, b = pts[i], pts[(i + 1) % len(pts)]
        n.x += (a.y - b.y) * (a.z + b.z)
        n.y += (a.z - b.z) * (a.x + b.x)
        n.z += (a.x - b.x) * (a.y + b.y)
    return n

def loft(rings, axis, fmat, cap0=True, cap1=True, capmat=None, smooth=True, closed=True):
    """Loft closed rings (lists of Vectors, same length) along `axis` (direction of travel).
    fmat(band, seg) -> swatch for the quad between ring[band] and ring[band+1], segment seg -> seg+1.
    Rings are re-ordered so that they wind counter-clockwise around `axis` (outward normals)."""
    axis = Vector(axis)
    ref = newell(rings[len(rings) // 2])
    if ref.dot(axis) < 0:
        rings = [list(reversed(r)) for r in rings]
        rev = True
    else:
        rev = False
    n = len(rings[0])
    bm = bmesh.new()
    rows = [[bm.verts.new(p) for p in r] for r in rings]
    for b in range(len(rows) - 1):
        A, B = rows[b], rows[b + 1]
        for i in range(n if closed else n - 1):
            j = (i + 1) % n
            seg = (n - 2 - i) % n if rev else i     # report the segment index in the caller's order
            try:
                fc = bm.faces.new((A[i], A[j], B[j], B[i]))
            except ValueError:
                continue
            fc.material_index = fmat(b, seg)
            fc.smooth = smooth
    if cap0:
        fc = bm.faces.new(list(reversed(rows[0])))
        fc.material_index = capmat if capmat is not None else fmat(0, -1)
        fc.smooth = smooth
    if cap1:
        fc = bm.faces.new(rows[-1])
        fc.material_index = capmat if capmat is not None else fmat(len(rows) - 2, -1)
        fc.smooth = smooth
    return bm

def mark_sharp(bm, angle=48.0):
    lim = math.radians(angle)
    bm.normal_update()
    for e in bm.edges:
        if len(e.link_faces) != 2:
            e.smooth = False
            continue
        try:
            a = e.calc_face_angle()
        except ValueError:
            a = 0.0
        if a > lim:
            e.smooth = False
    return bm

def set_mat(bm, sw):
    for f in bm.faces:
        f.material_index = sw
    return bm

def xform(bm, m):
    bmesh.ops.transform(bm, matrix=m, verts=bm.verts[:])
    return bm

def translate(bm, v):
    bmesh.ops.translate(bm, vec=Vector(v), verts=bm.verts[:])
    return bm

def mirror_x(bm):
    b2 = bm.copy()
    bmesh.ops.scale(b2, vec=(-1, 1, 1), verts=b2.verts[:])
    bmesh.ops.reverse_faces(b2, faces=b2.faces[:])
    return b2

def append(dst, src):
    vmap = {v: dst.verts.new(v.co) for v in src.verts}
    for f in src.faces:
        try:
            nf = dst.faces.new([vmap[v] for v in f.verts])
        except ValueError:
            continue
        nf.material_index = f.material_index
        nf.smooth = f.smooth
    dst.edges.ensure_lookup_table()
    for e in src.edges:
        if not e.smooth:
            ne = dst.edges.get([vmap[e.verts[0]], vmap[e.verts[1]]])
            if ne is not None:
                ne.smooth = False

def rbox(c, size, r=0.05, segs=2, sw=None, rot=None, angle=50):
    """rounded box centred at Vector c, full size (sx, sy, sz) in Blender axes."""
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.scale(bm, vec=Vector(size), verts=bm.verts[:])
    if r > 0:
        r = min(r, min(size) * 0.49)
        bmesh.ops.bevel(bm, geom=bm.edges[:], offset=r, offset_type='OFFSET', segments=segs,
                        profile=0.5, affect='EDGES', clamp_overlap=True)
    for f in bm.faces:
        f.smooth = True
    mark_sharp(bm, angle if (r > 0 and segs > 1) else 1.0)
    if rot is not None:
        xform(bm, rot)
    translate(bm, c)
    if sw is not None:
        set_mat(bm, sw)
    return bm

def box_f(x, f, z, sx, sf, sz, r=0.0, segs=2, sw=None, pitch=0.0, yaw=0.0, roll=0.0):
    """rounded box with centre (x, forward, up) and size (x, forward, up).  pitch + = nose up (deg)."""
    rot = None
    if pitch or yaw or roll:
        rot = (Matrix.Rotation(math.radians(yaw), 4, 'Z') @ Matrix.Rotation(math.radians(-roll), 4, 'Y')
               @ Matrix.Rotation(math.radians(-pitch), 4, 'X'))
    return rbox(P(x, f, z), (sx, sf, sz), r, segs, sw, rot)

def frame_from_axis(ax):
    ax = Vector(ax).normalized()
    ref = Z if abs(ax.dot(Z)) < 0.9 else X
    u = ax.cross(ref).normalized()
    v = ax.cross(u).normalized()
    return ax, u, v

def lathe(profile, center, axis, segs=12, mats=None, angle=50, phase=None):
    """revolve [(radius, axial)] around `axis` through `center`; mats[k] = swatch of band k.
    A zero radius closes the end with a fan."""
    ax, u, v = frame_from_axis(axis)
    if phase is None:
        phase = math.pi / segs
    bm = bmesh.new()
    rows = []
    for r, a in profile:
        if r < 1e-6:
            rows.append([bm.verts.new(center + ax * a)])
        else:
            rows.append([bm.verts.new(center + ax * a + (u * math.cos(phase + 2 * math.pi * i / segs)
                                                         + v * math.sin(phase + 2 * math.pi * i / segs)) * r)
                         for i in range(segs)])
    for k, (A, B) in enumerate(zip(rows[:-1], rows[1:])):
        for i in range(segs):
            j = (i + 1) % segs
            if len(A) == 1 and len(B) == 1:
                continue
            if len(A) == 1:
                fc = bm.faces.new((A[0], B[j], B[i]))
            elif len(B) == 1:
                fc = bm.faces.new((A[i], A[j], B[0]))
            else:
                fc = bm.faces.new((A[i], A[j], B[j], B[i]))
            fc.material_index = mats[min(k, len(mats) - 1)] if mats else 0
            fc.smooth = True
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    mark_sharp(bm, angle)
    return bm

def cyl(center, axis, r, length, segs=10, sw=None, r2=None, cap=True):
    r2 = r if r2 is None else r2
    h = length / 2
    prof = ([(0, -h)] if cap else []) + [(r, -h), (r2, h)] + ([(0, h)] if cap else [])
    bm = lathe(prof, Vector(center), axis, segs, [sw or 0], angle=40)
    return bm

def poly_prism(poly, origin, u, v, n, depth, sw):
    """2D polygon (in u, v) extruded along n by depth; flat shaded."""
    bm = bmesh.new()
    bot = [bm.verts.new(origin + u * a + v * b) for a, b in poly]
    top = [bm.verts.new(origin + u * a + v * b + n * depth) for a, b in poly]
    bm.faces.new(bot)
    bm.faces.new(list(reversed(top)))
    k = len(poly)
    for i in range(k):
        j = (i + 1) % k
        bm.faces.new((bot[i], bot[j], top[j], top[i]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    for f in bm.faces:
        f.material_index = sw
        f.smooth = False
    return bm

def rrect2(w, h, r, n=3):
    """rounded rectangle outline, centred, CCW, as 2D tuples."""
    r = min(r, w / 2 * 0.999, h / 2 * 0.999)
    pts = []
    for cx, cy, a0 in ((w / 2 - r, h / 2 - r, 0), (-w / 2 + r, h / 2 - r, 90), (-w / 2 + r, -h / 2 + r, 180),
                       (w / 2 - r, -h / 2 + r, 270)):
        pts += arc2(cx, cy, r, a0, a0 + 90, n)
    return pts

def sweep(path, prof, sw, closed_prof=True, cap=True, up=Z, angle=50):
    """sweep a 2D profile [(side, up)] along a 3D polyline; side axis = path tangent x up."""
    path = [Vector(p) for p in path]
    rings = []
    for i, p in enumerate(path):
        if i == 0:
            t = path[1] - path[0]
        elif i == len(path) - 1:
            t = path[-1] - path[-2]
        else:
            t = (path[i + 1] - path[i]).normalized() + (path[i] - path[i - 1]).normalized()
        t.normalize()
        s = t.cross(up).normalized()
        u = s.cross(t).normalized()
        rings.append([p + s * a + u * b for a, b in prof])
    axis = path[-1] - path[0]
    bm = loft(rings, axis if axis.length > 1e-6 else Vector((1, 0, 0)), lambda b, s: sw, cap, cap)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    mark_sharp(bm, angle)
    return bm

# ------------------------------------------------------------------------------------------------
# model accumulator
# ------------------------------------------------------------------------------------------------
class Model:
    def __init__(self, name):
        self.name = name
        self.bm = bmesh.new()
        self.parts = {}

    def add(self, src, sw=None, mirror=False, tag='misc'):
        if sw is not None:
            set_mat(src, sw)
        n = sum(len(f.verts) - 2 for f in src.faces) * (2 if mirror else 1)
        if DEBUGX and src.verts:
            print("XMAX", self.name, tag, round(max(abs(v.co.x) for v in src.verts), 3))
        self.parts[tag] = self.parts.get(tag, 0) + n
        append(self.bm, src)
        if mirror:
            m = mirror_x(src)
            append(self.bm, m)
            m.free()
        src.free()

    def tris(self):
        return sum(len(f.verts) - 2 for f in self.bm.faces)

    def build(self, collection, center=True):
        bm = self.bm
        if center:   # origin: centre of the footprint, on the ground
            xs = [v.co.x for v in bm.verts]
            ys = [v.co.y for v in bm.verts]
            translate(bm, (-(min(xs) + max(xs)) / 2, -(min(ys) + max(ys)) / 2, 0))
        me = bpy.data.meshes.new(self.name)
        bm.to_mesh(me)
        nf = len(me.polygons)
        mi = [0] * nf
        me.polygons.foreach_get('material_index', mi)
        uvl = me.uv_layers.new(name='UVMap')
        col = me.color_attributes.new(name='Color', type='BYTE_COLOR', domain='CORNER')
        uv = [0.0] * (len(me.loops) * 2)
        cols = []
        for p in me.polygons:
            hexcol, mid = SW[mi[p.index]]
            c = srgb01(hexcol)
            for li in p.loop_indices:
                uv[li * 2] = (mid + 0.5) / 16.0
                uv[li * 2 + 1] = 0.5
                col.data[li].color_srgb = (c[0], c[1], c[2], 1.0)
        uvl.data.foreach_set('uv', uv)
        me.color_attributes.active_color = col
        me.color_attributes.render_color_index = me.color_attributes.active_color_index
        me.polygons.foreach_set('material_index', [0] * nf)
        me.materials.append(toy_material())
        ob = bpy.data.objects.new(self.name, me)
        collection.objects.link(ob)
        return ob

_TOY = None
def toy_material():
    global _TOY
    if _TOY is None:
        m = bpy.data.materials.new('toy')
        m.use_nodes = True
        nt = m.node_tree
        b = nt.nodes['Principled BSDF']
        ca = nt.nodes.new('ShaderNodeVertexColor')
        ca.layer_name = 'Color'
        nt.links.new(ca.outputs['Color'], b.inputs['Base Color'])
        b.inputs['Roughness'].default_value = 0.5
        _TOY = m
    return _TOY

# ------------------------------------------------------------------------------------------------
# surface tools (ray casting onto a body)
# ------------------------------------------------------------------------------------------------
class Surf:
    def __init__(self, bm):
        bm.normal_update()
        self.tree = BVHTree.FromBMesh(bm)

    def hit(self, origin, direction):
        loc, nrm, idx, dist = self.tree.ray_cast(Vector(origin), Vector(direction).normalized())
        return loc, nrm

    def side(self, f, z, s=1, start=3.0):
        """surface point on the +x (s=1) or -x side at forward f, height z."""
        return self.hit(P(s * start, f, z), Vector((-s, 0, 0)))

    def front(self, x, z, f0=20.0):
        return self.hit(P(x, f0, z), -F)

    def back(self, x, z, f0=-20.0):
        return self.hit(P(x, f0, z), F)

    def top(self, x, f, z0=10.0):
        return self.hit(P(x, f, z0), -Z)

def decal_quads(surf, rects, sw, axis, off=0.008, sub=1):
    """rects in the (a, b) plane of a projection: axis 'xp'/'xn' (side, a=f, b=z), 'f'/'b' (front/back, a=x, b=z),
    't' (top, a=x, b=f).  Each rect (a0, b0, a1, b1) is projected onto the surface and lifted by `off`."""
    bm = bmesh.new()
    def proj(a, b):
        if axis in ('xp', 'xn'):
            s = 1 if axis == 'xp' else -1
            loc, n = surf.side(a, b, s)
        elif axis == 'f':
            loc, n = surf.front(a, b)
        elif axis == 'b':
            loc, n = surf.back(a, b)
        else:
            loc, n = surf.top(a, b)
        if loc is None:
            return None
        return loc + n * off
    for (a0, b0, a1, b1) in rects:
        grid = []
        ok = True
        for i in range(sub + 1):
            row = []
            for j in range(sub + 1):
                p = proj(lerp(a0, a1, j / sub), lerp(b0, b1, i / sub))
                if p is None:
                    ok = False
                    break
                row.append(bm.verts.new(p))
            if not ok:
                break
            grid.append(row)
        if not ok:
            continue
        for i in range(sub):
            for j in range(sub):
                fc = bm.faces.new((grid[i][j], grid[i][j + 1], grid[i + 1][j + 1], grid[i + 1][j]))
                fc.material_index = sw
                fc.smooth = False
    # orient: normals away from the body (project direction reversed)
    d = {'xp': X, 'xn': -X, 'f': F, 'b': -F, 't': Z}[axis]
    bm.normal_update()
    for fc in bm.faces:
        if fc.normal.dot(d) < 0:
            fc.normal_flip()
    return bm

def stick_disc(surf, origin, direction, r, sw, depth=0.05, segs=12, rim_sw=None, out=0.012, tilt=0.6):
    """round lamp: domed lens with a chrome ring, pushed into the surface along the hit normal."""
    loc, n = surf.hit(origin, direction)
    if loc is None:
        return None
    d = -Vector(direction).normalized()
    n = (n * tilt + d * (1 - tilt)).normalized()
    rim = rim_sw if rim_sw is not None else sw
    prof = [(0, out + 0.014), (r * 0.70, out + 0.006), (r * 0.80, out + 0.012), (r, out), (r, -depth)]
    return lathe(prof, loc, n, segs, [sw, rim, rim, rim], angle=40)

def flat_text(text, origin, u, v, h, sw, align=0.5):
    """pixel letters as quads on the plane origin + u*a + v*b (normal = u x v)."""
    rects, W = letters(text, h)
    bm = bmesh.new()
    for a0, b0, a1, b1 in rects:
        a0 -= W * align
        a1 -= W * align
        vs = [bm.verts.new(origin + u * a + v * b) for a, b in ((a0, b0), (a1, b0), (a1, b1), (a0, b1))]
        fc = bm.faces.new(vs)
        fc.material_index = sw
        fc.smooth = False
    return bm

def letters(text, h):
    """5x7-ish pixel font -> list of (a0, b0, a1, b1) rects for the string, origin at bottom-left."""
    G = {
        'T': ['111', '010', '010', '010', '010'],
        'A': ['010', '101', '111', '101', '101'],
        'X': ['101', '101', '010', '101', '101'],
        'I': ['1', '1', '1', '1', '1'],
        'P': ['110', '101', '110', '100', '100'],
        'O': ['111', '101', '101', '101', '111'],
        'L': ['100', '100', '100', '100', '111'],
        'C': ['111', '100', '100', '100', '111'],
        'E': ['111', '100', '110', '100', '111'],
        'B': ['110', '101', '110', '101', '110'],
        'U': ['101', '101', '101', '101', '111'],
        'N': ['1001', '1101', '1011', '1001', '1001'],
        'M': ['10001', '11011', '10101', '10001', '10001'],
        'S': ['111', '100', '111', '001', '111'],
        'R': ['110', '101', '110', '101', '101'],
        'Y': ['101', '101', '010', '010', '010'],
        'F': ['111', '100', '110', '100', '100'],
        'D': ['110', '101', '101', '101', '110'],
        'H': ['101', '101', '111', '101', '101'],
        'K': ['101', '101', '110', '101', '101'],
        'G': ['111', '100', '101', '101', '111'],
        'Z': ['111', '001', '010', '100', '111'],
        ' ': ['0', '0', '0', '0', '0'],
    }
    px = h / 5.0
    rects = []
    x = 0.0
    for ch in text:
        g = G[ch]
        w = len(g[0])
        for r, row in enumerate(g):
            b1 = h - r * px
            b0 = b1 - px
            c = 0
            while c < w:
                if row[c] == '1':
                    c0 = c
                    while c < w and row[c] == '1':
                        c += 1
                    rects.append((x + c0 * px, b0, x + c * px, b1))
                else:
                    c += 1
        x += (w + 1) * px
    return rects, x - px

# ------------------------------------------------------------------------------------------------
# generic toy car
# ------------------------------------------------------------------------------------------------
def body_ring(hwb, hwt, zb, zt, rb, rt, zs, bulge, crown, f, nb=2, nt=2):
    """cross-section ring at forward f: bottom centre -> right side -> top centre -> left side."""
    h = zt - zb
    rb = clamp(rb, 0.01, h * 0.40)
    rt = clamp(rt, 0.01, h * 0.55)
    zs = clamp(zs, zb + rb + 0.01, zt - rt - 0.01)
    right = arc2(hwb - rb, zb + rb, rb, -90, 0, nb)
    t = (zs - (zb + rb)) / max(1e-6, (zt - rt) - (zb + rb))
    right.append((lerp(hwb, hwt, t) + bulge, zs))
    right += arc2(hwt - rt, zt - rt, rt, 0, 90, nt)
    pts = [(0.0, zb)] + right + [(0.0, zt + crown)] + [(-x, z) for x, z in reversed(right)]
    return [P(x, f, z) for x, z in pts]

def axle_bump(f, axles, width):
    return max([max(0.0, math.cos(clamp((f - fa) / width, -1, 1) * math.pi / 2)) ** 2 for fa in axles] or [0.0])

def car_body(p):
    """lower body loft.  Returns (bmesh, list of station dicts)."""
    L = p.get('Lb', p['L'] - 2 * p.get('trim', 0.05))
    fc = p.get('fc', 0.0)
    ff, fr = fc + L / 2, fc - L / 2
    r = p['wheel_r']
    zc = p.get('arch_zc', r * 0.92)
    Ra = p.get('arch_r', r + 0.07)
    axles = p.get('arch_axles', p['axles'])
    Rf, Rr = p['end_f'], p['end_r']                     # fillet length at the front / rear
    ins_f = p['ins_f']                                  # (side, top, bottom) insets at the front cap
    ins_r = p['ins_r']
    top = p['top']                                      # [(f, z)] top line
    sill = p.get('sill', 0.30)
    hw = p['hw']
    flare = p.get('flare', 0.03)
    tumble = p.get('tumble', 0.05)
    rb0, rt0 = p.get('rb', 0.10), p.get('rt', 0.16)
    # station list: (f, mode)  mode -1 = sill side of an arch step, +1 = arch side, 0 normal
    sts = []
    for th in (0, 30, 55, 75, 90):
        s = math.sin(math.radians(th))
        sts.append((ff - Rf + Rf * s, 0))
        sts.append((fr + Rr - Rr * s, 0))
    for fa in axles:
        for a in p.get('arch_angles', (-70, -45, -20, 0, 20, 45, 70)):
            sts.append((fa + Ra * math.sin(math.radians(a)), 0))
        sts.append((fa - Ra, -1)); sts.append((fa - Ra, 1))
        sts.append((fa + Ra, 1)); sts.append((fa + Ra, -1))
    for f in p.get('extra_f', []):
        sts.append((f, 0))
    # order: by f; at an arch step the sill ring comes first when entering, last when leaving
    def key(s):
        f, m = s
        o = 0
        if m:
            entering = any(abs(f - (fa - Ra)) < 1e-6 for fa in axles)
            o = (-1 if m == -1 else 1) if entering else (1 if m == -1 else -1)
        return (round(f, 5), o)
    sts = sorted(set(sts), key=key)
    # drop near-duplicates (except arch steps)
    clean = []
    for s in sts:
        if clean and s[1] == 0 and clean[-1][1] == 0 and abs(s[0] - clean[-1][0]) < 0.04:
            continue
        if clean and s[1] == 0 and abs(s[0] - clean[-1][0]) < 0.04 and clean[-1][1] != 0:
            continue
        clean.append(s)
    sts = clean
    # remove a normal station that sits too close to an arch step
    sts = [s for s in sts if not (s[1] == 0 and any(abs(s[0] - (fa + k * Ra)) < 0.04 for fa in axles for k in (-1, 1)))]

    rings, info = [], []
    for f, m in sts:
        # bottom line
        zb = pwl(p.get('bottom', [(fr, sill), (ff, sill)]), f)
        in_arch = False
        for fa in axles:
            d = f - fa
            if abs(d) < Ra - 1e-6 or (abs(abs(d) - Ra) < 1e-6 and m == 1):
                zb = max(zb, zc + math.sqrt(max(0.0, Ra * Ra - d * d)))
                in_arch = True
        zt = pwl(top, f)
        w = hw + flare * axle_bump(f, axles, Ra + 0.35)
        # end fillets
        sf = st_ = sb = 0.0
        if f > ff - Rf:
            s = clamp((f - (ff - Rf)) / Rf, 0, 1)
            k = 1 - math.sqrt(max(0.0, 1 - s * s))
            sf, st_, sb = ins_f[0] * k, ins_f[1] * k, ins_f[2] * k
        if f < fr + Rr:
            s = clamp(((fr + Rr) - f) / Rr, 0, 1)
            k = 1 - math.sqrt(max(0.0, 1 - s * s))
            sf, st_, sb = ins_r[0] * k, ins_r[1] * k, ins_r[2] * k
        zb2, zt2 = zb + sb, zt - st_
        hwb = w - 0.025 - sf
        hwt = w - tumble - sf
        zs = pwl(p.get('zs', [(fr, (sill + zt) / 2), (ff, (sill + zt) / 2)]), f)
        bul = p.get('bulge', 0.02)
        rings.append(body_ring(hwb, hwt, zb2, zt2, rb0, rt0 if not callable(rt0) else rt0(f), zs, bul,
                               p.get('crown', 0.015), f, p.get('nb', 2), p.get('nt', 2)))
        info.append(dict(f=f, zb=zb2, zt=zt2, hw=w - sf, arch=in_arch))
    n = len(rings[0])
    paint = p['paint']
    def fm(b, s):
        return DARK if s in (0, n - 1) else paint
    bm = loft(rings, F, fm, True, True)
    return bm, info

def car_cabin(p):
    """greenhouse: horizontal rounded rings (plan view) lofted upward.  Returns bmesh."""
    c = p['cab']
    z0, z1, z2, zr = c['z0'], c['z1'], c['z2'], c['zr']
    nc = c.get('nc', 3)
    fr_ = c.get('side_fracs', [0.5, 0.5])            # split points along the side straight
    side_tags = c.get('side_tags', ['g', 'g', 'g'])   # tag per side segment
    def plan(z):
        t = (z - z1) / (z2 - z1)
        return dict(hw=lerp(c['hw1'], c['hw2'], t), fb=lerp(c['fb1'], c['fb2'], t), ff=lerp(c['ff1'], c['ff2'], t),
                    rf=lerp(c['rf1'], c['rf2'], t), rr=lerp(c['rr1'], c['rr2'], t))
    def ring(z, q, inset=0.0, bulge=0.0):
        hw, fb, ff, rf, rr = q['hw'] - inset + bulge, q['fb'] + inset, q['ff'] - inset, q['rf'], q['rr']
        rf = clamp(rf - inset * 0.6, 0.03, hw * 0.98)
        rr = clamp(rr - inset * 0.6, 0.03, hw * 0.98)
        bow = c.get('bow', 0.04)
        pts, tags = [], []
        # front centre -> right front corner
        pts.append((0.0, ff + bow)); tags.append('ws')
        a = arc2(hw - rf, ff - rf, rf, 90, 0, nc)
        pts += a; tags += c.get('A_tags', ['A'] * nc)
        # side straight: from (hw, ff - rf) to (hw, fb + rr) through split points
        s0, s1 = ff - rf, fb + rr
        side = [lerp(s0, s1, k) for k in fr_]
        for i, fs in enumerate(side):
            sb = c.get('side_bulge', 0.02) * math.sin(math.pi * (i + 1) / (len(side) + 1))
            pts.append((hw + sb, fs))
        tags.append(side_tags[0])               # corner end -> first split
        tags += side_tags[1:]                    # between splits ... last split -> rear corner start
        a = arc2(hw - rr, fb + rr, rr, 0, -90, nc)
        pts += a; tags += c.get('C_tags', ['C'] * nc)
        pts.append((0.0, fb - c.get('rbow', 0.03))); tags.append('rw')
        # the right half has a known tag sequence; mirror for the left
        right_pts = pts[1:-1]
        n_right_tags = tags[1:-1]
        assert len(n_right_tags) == len(right_pts) - 1, (len(n_right_tags), len(right_pts))
        full = [pts[0]] + right_pts + [pts[-1]] + [(-x, f) for x, f in reversed(right_pts)]
        full_tags = ['ws'] + n_right_tags + ['rw', 'rw'] + list(reversed(n_right_tags)) + ['ws']
        # segment i joins full[i] -> full[i+1]; we built tags such that index matches
        return [P(x, f, z) for x, f in full], full_tags
    rows, bands = [], []
    q1 = plan(z1)
    # hidden base row: extrapolate the windshield / rear slope down to z0
    q0 = plan(z0)
    q0['hw'] = max(q0['hw'], q1['hw'])
    rows.append(ring(z0, q0)); bands.append('low')
    zl = c.get('zl', z1)                         # top of the painted cabin base (= window bottom)
    if zl > z0 + 0.01 and zl < z1 - 0.005:
        rows.append(ring(zl, plan(zl))); bands.append('low')
    rows.append(ring(z1, q1)); bands.append('win')
    nwin = c.get('win_rows', 1)
    for k in range(1, nwin):
        z = lerp(z1, z2, k / nwin)
        rows.append(ring(z, plan(z), bulge=c.get('win_bulge', 0.012))); bands.append('win')
    q2 = plan(z2)
    fr_h = c.get('frame', 0.0)
    if fr_h > 0:
        rows.append(ring(z2, q2)); bands.append('frame')
        ze = z2 + fr_h
        rows.append(ring(ze, q2)); bands.append('roof')
    else:
        ze = z2
        rows.append(ring(ze, q2)); bands.append('roof')
    Ri = c.get('roof_inset', 0.16)
    for th in c.get('roof_th', (30, 60, 90)):
        tt = math.radians(th)
        z = ze + (zr - ze) * math.sin(tt)
        rows.append(ring(z, q2, inset=Ri * (1 - math.cos(tt)))); bands.append('roof')
    tags = rows[0][1]
    paint, roof = c['paint'], c.get('roof', c['paint'])
    pillar = c.get('pillar', paint)
    bpill = c.get('bpillar', BLACKP)
    glassmap = {'ws': GLASS, 'rw': c.get('rw', GLASS), 'A': pillar, 'C': pillar, 'g': GLASS, 'p': pillar,
                'b': bpill, 'P': paint}
    def fm(b, s):
        if s < 0:
            return roof
        band = bands[b]
        if band == 'low':
            return paint
        if band == 'frame':
            return c.get('frame_sw', paint)
        if band == 'roof':
            return roof
        return glassmap[tags[s]]
    bm = loft([r[0] for r in rows], Z, fm, cap0=True, cap1=True)
    # the bottom cap is hidden inside the body: remove it
    for fc in list(bm.faces):
        fc.normal_update()
    bot = [fc for fc in bm.faces if len(fc.verts) > 4 and fc.calc_center_median().z < z0 + 1e-4]
    bmesh.ops.delete(bm, geom=bot, context='FACES_ONLY')
    return bm

def wheel(center, side, r, w, segs=12, rim=CHROME, dish=CHROME_D, hub=None, style='cap'):
    """tyre + hubcap.  side = +1 for the +x wheels (hubcap faces +x)."""
    hub = hub if hub is not None else rim
    k = 1.0 / math.cos(math.pi / segs)          # flat-bottom polygon: tread touches z = 0
    prof = [(r * 0.84 * k, -w / 2),
            (r * k, -w / 2 + w * 0.24),
            (r * k, w / 2 - w * 0.24),
            (r * 0.86 * k, w / 2),
            (r * 0.68, w / 2 + 0.006),
            (r * 0.60, w / 2 - 0.004),
            (r * 0.26, w / 2 - 0.03),
            (0.0, w / 2 + 0.012)]
    mats = [TYRE, TYRE, TYRE, TYRE, rim, dish, hub]
    if style == 'dark':
        mats = [TYRE, TYRE, TYRE, TYRE, rim, PLASTIC, rim]
    bm = lathe(prof, Vector(center), X * side, segs, mats, angle=38, phase=math.pi / 2 - math.pi / segs)
    return bm

def apply_livery(bm, fn, skip=(DARK,)):
    if not fn:
        return
    bm.normal_update()
    for fc in bm.faces:
        if fc.material_index in skip:
            continue
        cen = fc.calc_center_median()
        fc.material_index = fn(-cen.y, cen.x, cen.z, fc.normal, fc.material_index)

def build_vehicle(p):
    """p: params of the main body (+ optional extra bodies in p['bodies'], extra shell parts in p['shell'])."""
    m = Model(p['name'])
    shell = []
    for bp in p.get('bodies', [{}]):
        q = dict(p)
        q.update(bp)
        body, info = car_body(q)
        apply_livery(body, q.get('livery'))
        mark_sharp(body, 55)
        shell.append((body, 'body'))
        if q.get('cab'):
            cab = car_cabin(q)
            apply_livery(cab, q.get('cab_livery'), skip=())
            mark_sharp(cab, 55)
            shell.append((cab, 'cabin'))
    for fn in p.get('shell', []):
        shell += fn(p)
    sbm = bmesh.new()
    for bm, tag in shell:
        append(sbm, bm)
    surf = Surf(sbm)
    sbm.free()
    for bm, tag in shell:
        m.add(bm, tag=tag)
    # chassis tub (fills the space between the wheels, dark inside the arches)
    r = p['wheel_r']
    ax = p['axles']
    if p.get('tub', True):
        tw = p['hw'] - p['wheel_w'] - 0.06
        m.add(box_f(0, (ax[0] + ax[-1]) / 2, r * 0.85, tw * 2, (ax[-1] - ax[0]) + r * 2.0, r * 0.7, 0.0, sw=DARK), tag='tub')
    # wheels: p['wheels'] = [(f, r, w)] or one per axle
    for wd in p.get('wheels') or [(fa, r, p['wheel_w']) for fa in ax]:
        fa, rr, ww = wd[:3]
        wx = p.get('wheel_x', p['hw'] - ww / 2 - 0.02) if len(wd) < 4 else wd[3]
        m.add(wheel(P(wx, fa, rr), 1, rr, ww, p.get('wheel_segs', 14), **p.get('wheel_kw', {})), mirror=True, tag='wheels')
    for fn in p.get('details', []):
        fn(m, surf, p)
    return m

# ------------------------------------------------------------------------------------------------
# detail helpers (all take (model, surf, params))
# ------------------------------------------------------------------------------------------------
def d_headlights(kind='rect', x=0.62, z=0.66, w=0.30, h=0.16, r=None, segs=10, rim=None):
    def fn(m, s, p):
        if kind == 'round':
            for sx in (1,):
                bm = stick_disc(s, P(x, 10, z), -F, r or h / 2, HEAD, segs=segs, rim_sw=rim if rim is not None else CHROME)
                if bm:
                    m.add(bm, mirror=True, tag='lights')
        else:
            loc, n = s.front(x, z)
            if loc is None:
                return
            n2 = (n * 0.6 + F * 0.4).normalized()
            bm = fit_lamp(s, loc, n2, w, h, HEAD, rr=min(w, h) * 0.45, nseg=2)
            m.add(bm, mirror=True, tag='lights')
    return fn

def fit_lamp(s, loc, n, w, h, sw, rr, nseg=2, out=0.015, depth=0.05, up=Z):
    """rect_lamp pushed out along n until its whole face clears the curved surface underneath."""
    n = Vector(n).normalized()
    u = up.cross(n).normalized()
    v = n.cross(u).normalized()
    hi = 0.0
    for a in (-0.5, 0.0, 0.5):
        for b in (-0.5, 0.0, 0.5):
            p0 = loc + u * (a * w * 0.95) + v * (b * h * 0.95)
            hit, nn = s.hit(p0 + n * 0.6, -n)
            if hit is not None:
                hi = max(hi, (hit - loc).dot(n))
    push = max(0.0, hi + 0.006 - out)
    fit_lamp.push = push
    return rect_lamp(loc + n * push, n, w, h, sw, depth=depth + push, out=out, rr=rr, up=up, nseg=nseg)

def rect_lamp(loc, n, w, h, sw, depth=0.05, out=0.015, rr=0.05, up=Z, nseg=2):
    """rounded-rect lamp slab whose face is perpendicular to n, centred at loc."""
    n = Vector(n).normalized()
    u = up.cross(n).normalized()
    if u.length < 0.5:
        u = X.copy()
    v = n.cross(u).normalized()
    poly = rrect2(w, h, rr, nseg)
    bm = poly_prism(poly, loc - n * depth, u, v, n, depth + out, sw)
    bm.normal_update()
    for f in list(bm.faces):
        if len(f.verts) > 4 and f.normal.dot(n) < -0.5:
            bm.faces.remove(f)
    for f in bm.faces:
        f.smooth = False
    return bm

def d_taillights(x=0.66, z=0.78, w=0.26, h=0.14, sw=None, kind='rect'):
    def fn(m, s, p):
        loc, n = s.back(x, z)
        if loc is None:
            return
        if kind == 'round':
            bm = stick_disc(s, P(x, -10, z), F, h / 2, sw or TAIL, segs=10, rim_sw=sw or TAIL)
        else:
            n2 = (n * 0.6 - F * 0.4).normalized()
            bm = fit_lamp(s, loc, n2, w, h, sw or TAIL, rr=min(w, h) * 0.3, nseg=2)
        m.add(bm, mirror=True, tag='lights')
    return fn

def d_grille(w=0.7, h=0.2, z=0.52, sw=None, rr=0.08, out=0.015, slats=0):
    def fn(m, s, p):
        loc, n = s.front(0, z)
        if loc is None:
            return
        bm = fit_lamp(s, loc, F, w, h, sw if sw is not None else PLASTIC, rr=rr, out=out, depth=0.06)
        m.add(bm, tag='grille')
        for k in range(slats):
            zz = z - h / 2 + h * (k + 1) / (slats + 1)
            l2, n2 = s.front(0, zz)
            if l2 is None:
                continue
            m.add(box_f(0, -loc.y + fit_lamp.push + out + 0.010, zz, w * 0.86, 0.03, 0.025, 0, sw=CHROME), tag='grille')
    return fn

def d_bumper(end=1, z=0.36, h=0.16, depth=0.12, sw=None, wrap=0.55, xw=None, r=0.05, out=0.03):
    """bar across the front (end=1) or rear (-1), sweeping round the corners."""
    def fn(m, s, p):
        hw = (xw or p['hw']) - 0.03
        pts = []
        xs = [-hw, -hw * 0.75, 0, hw * 0.75, hw]
        for x in xs:
            loc, n = (s.front(x * 0.98, z) if end == 1 else s.back(x * 0.98, z))
            if loc is None:
                continue
            pts.append(loc + Vector((0, -end * out, 0)))
        # wrap the ends back along the sides
        if len(pts) < 3:
            return
        first, last = pts[0], pts[-1]
        side_pts = []
        ra = p.get('arch_r', p['wheel_r'] + 0.07)
        axs = p.get('arch_axles', p['axles'])
        lim = (max(axs) + ra + 0.05) if end == 1 else (min(axs) - ra - 0.05)
        for sx, base in ((-1, first), (1, last)):
            fend = -base.y - end * wrap
            fend = max(fend, lim) if end == 1 else min(fend, lim)
            if abs(fend - (-base.y)) < 0.05:
                side_pts.append(None)
                continue
            loc, n = s.side(fend, z, sx)
            side_pts.append(loc + Vector((sx * (out + 0.012 - depth / 2), 0, 0)) if loc is not None else None)
        path = ([side_pts[0]] if side_pts[0] is not None else []) + pts + ([side_pts[1]] if side_pts[1] is not None else [])
        prof = [(dx, dz) for dx, dz in rrect2(depth, h, r, 1)]
        bm = sweep(path, prof, sw if sw is not None else PLASTIC, cap=True)
        m.add(bm, tag='bumpers')
    return fn

def d_mirrors(f, z, sw=None, size=(0.14, 0.16, 0.11)):
    def fn(m, s, p):
        loc, n = s.side(f, z, 1)
        if loc is None or loc.x < p['hw'] * 0.7:
            print('WARN mirror miss', p['name'])
            return
        sx, sf, sz = size
        col = sw if sw is not None else p['paint']
        xb = max(loc.x, p['hw'] - 0.06)          # always reach past the body side
        bm = box_f(xb + sx / 2 - 0.02, f, z, sx, sf, sz, r=0.04, segs=1, sw=col)
        m.add(bm, mirror=True, tag='mirrors')
        if xb - loc.x > 0.02:                    # stalk back to the pillar / door
            m.add(box_f((loc.x + xb) / 2, f + 0.02, z - sz * 0.15, xb - loc.x + 0.04, 0.05, 0.04, 0, sw=col),
                  mirror=True, tag='mirrors')
    return fn

def d_plates(zf=0.42, zr=0.55, w=0.36, h=0.11, front=True):
    def fn(m, s, p):
        for end, z in ((1, zf), (-1, zr)):
            if end == 1 and not front:
                continue
            loc, n = s.front(0, z) if end == 1 else s.back(0, z)
            if loc is None:
                continue
            m.add(box_f(0, -loc.y + end * 0.012, z, w, 0.04, h, 0, sw=PLATE), tag='plates')
    return fn

def d_handles(fs, z, sw=CHROME):
    def fn(m, s, p):
        for f in fs:
            loc, n = s.side(f, z, 1)
            if loc is None:
                continue
            m.add(box_f(loc.x, f, z, 0.03, 0.12, 0.03, 0, sw=sw), mirror=True, tag='handles')
    return fn

def d_seams(fs, z0, z1, sw=None, wdt=0.012):
    """dark door gaps on both sides."""
    def fn(m, s, p):
        rects = [(f - wdt / 2, z0, f + wdt / 2, z1) for f in fs]
        bm = decal_quads(s, rects, sw if sw is not None else PLASTIC, 'xp', off=0.004, sub=3)
        m.add(bm, mirror=True, tag='seams')
    return fn

def d_decal(rects, sw, axis='xp', mirror=True, off=0.006, sub=1, tag='decal'):
    def fn(m, s, p):
        bm = decal_quads(s, rects, sw, axis, off=off, sub=sub)
        m.add(bm, mirror=mirror, tag=tag)
    return fn

def d_text(text, fc, zb, h, sw, sides=(1, -1), off=0.006):
    """pixel letters on both flanks, reading front-to-back on each side as seen from outside."""
    def fn(m, s, p):
        rects, W = letters(text, h)
        for sd in sides:
            rr = []
            for (a0, b0, a1, b1) in rects:
                if sd == 1:
                    rr.append((fc + W / 2 - a1, zb + b0, fc + W / 2 - a0, zb + b1))
                else:
                    rr.append((fc - W / 2 + a0, zb + b0, fc - W / 2 + a1, zb + b1))
            m.add(decal_quads(s, rr, sw, 'xp' if sd == 1 else 'xn', off=off), tag='text')
    return fn

def d_lightbar(f, width, lenses, base_sw=PLASTIC, h=0.11, depth=0.28, x=0.0):
    """roof light bar: a dark base with emissive lenses [(x0, x1, swatch)]."""
    def fn(m, s, p):
        loc, n = s.top(x, f)
        if loc is None:
            return
        z = loc.z - 0.01
        m.add(box_f(x, f, z + 0.04, width, depth, 0.08, r=0.03, segs=1, sw=base_sw), tag='lightbar')
        for (x0, x1, sw) in lenses:
            m.add(box_f(x + (x0 + x1) / 2, f, z + 0.07 + h / 2, x1 - x0 - 0.02, depth * 0.86, h, r=0.04, segs=1, sw=sw),
                  tag='lightbar')
    return fn

def d_roofrails(f0, f1, x, sw=PLASTIC, hgt=0.06):
    def fn(m, s, p):
        l0, _ = s.top(x, f0)
        l1, _ = s.top(x, f1)
        lm, _ = s.top(x, (f0 + f1) / 2)
        if l0 is None or l1 is None or lm is None:
            return
        z = max(l0.z, l1.z, lm.z) + hgt
        pitch = math.degrees(math.atan2(l1.z - l0.z, f1 - f0))
        m.add(box_f(x, (f0 + f1) / 2, z, 0.05, f1 - f0, 0.05, 0, sw=sw, pitch=pitch), mirror=True, tag='rails')
        for f, l in ((f0 + 0.06, l0), (f1 - 0.06, l1)):
            m.add(box_f(x, f, (l.z + z) / 2, 0.05, 0.08, z - l.z + 0.03, 0, sw=sw), mirror=True, tag='rails')
    return fn

def d_spoiler(f, z, width, chord, sw, thick=0.05, pitch=-6, posts=0.0):
    def fn(m, s, p):
        if z is None:          # sit on the roof edge
            loc, n = s.top(0, f + chord * 0.3)
            zz = loc.z + thick * 0.2
        else:
            zz = z
        _fn(m, s, p, zz)
    def _fn(m, s, p, z):
        m.add(box_f(0, f, z, width, chord, thick, r=0.025, segs=1, sw=sw, pitch=pitch), tag='spoiler')
        if posts > 0:
            for x in (-width * 0.32, width * 0.32):
                m.add(box_f(x, f + 0.02, z - posts / 2, 0.05, 0.10, posts, 0, sw=sw), tag='spoiler')
    return fn

def d_exhaust(x, f, z, r=0.045):
    def fn(m, s, p):
        m.add(cyl(P(x, f, z), F, r, 0.16, segs=8, sw=CHROME), tag='exhaust')
    return fn

def d_box(x, f, z, sx, sf, sz, sw, r=0.0, segs=1, mirror=False, tag='box', **kw):
    def fn(m, s, p):
        m.add(box_f(x, f, z, sx, sf, sz, r=r, segs=segs, sw=sw, **kw), mirror=mirror, tag=tag)
    return fn

def d_fender(f, z, r, x, width, sw=PLASTIC, a0=-75, a1=75, segs=6, thick=0.035):
    """mudguard arc over a wheel that has no body arch (trucks)."""
    def fn(m, s, p):
        pts = []
        for i in range(segs + 1):
            a = math.radians(lerp(a0, a1, i / segs))
            pts.append(P(x, f + r * math.sin(a), z + r * math.cos(a)))
        bm = sweep(pts, [(-width / 2, -thick / 2), (width / 2, -thick / 2), (width / 2, thick / 2), (-width / 2, thick / 2)],
                   sw, up=X)
        m.add(bm, mirror=True, tag='fenders')
    return fn

def d_lamp(end, x, z, w, h, sw, mirror=True, out=0.015):
    """rect lamp stuck on the front (end=1) or back (end=-1)."""
    def fn(m, s, p):
        loc, n = s.front(x, z) if end == 1 else s.back(x, z)
        if loc is None:
            return
        n2 = (n * 0.6 + F * 0.4 * end).normalized()
        m.add(fit_lamp(s, loc, n2, w, h, sw, rr=min(w, h) * 0.3, nseg=2, out=out), mirror=mirror, tag='lights')
    return fn

def d_round(end, x, z, r, sw, rim=CHROME, segs=12, mirror=True, tilt=0.6):
    def fn(m, s, p):
        bm = stick_disc(s, P(x, 10 * end, z), -F * end, r, sw, rim_sw=rim, segs=segs, tilt=tilt)
        if bm:
            m.add(bm, mirror=mirror, tag='lights')
    return fn

def d_cross(fc, zc, size, sw, axis='xp', mirror=True):
    """medical cross decal centred at (fc, zc) on a flank, or at (x=fc, zc) on the back (axis 'b')."""
    def fn(m, s, p):
        k = size / 3
        rects = [(fc - k / 2, zc - size / 2, fc + k / 2, zc + size / 2),
                 (fc - size / 2, zc - k / 2, fc - k / 2, zc + k / 2),
                 (fc + k / 2, zc - k / 2, fc + size / 2, zc + k / 2)]
        m.add(decal_quads(s, rects, sw, axis, off=0.006), mirror=mirror, tag='decal')
    return fn

def upd(base, **kw):
    d = dict(base)
    for k, v in kw.items():
        if k == 'cab' and isinstance(v, dict) and isinstance(d.get('cab'), dict):
            c = dict(d['cab'])
            c.update(v)
            d['cab'] = c
        else:
            d[k] = v
    return d

def checker(f0, f1, z0, z1, n_rows, sq):
    rects = []
    cols = int(round((f1 - f0) / sq))
    for r in range(n_rows):
        for c in range(cols):
            if (r + c) % 2 == 0:
                rects.append((f0 + c * sq, z0 + r * (z1 - z0) / n_rows, f0 + (c + 1) * sq, z0 + (r + 1) * (z1 - z0) / n_rows))
    return rects

# ------------------------------------------------------------------------------------------------
# traffic cars
# ------------------------------------------------------------------------------------------------
BUMPER = S('#8d929c', 0)

def p_sedan(name='sedan', paint=None, L=4.3):
    paint = paint if paint is not None else S(PAINT, 1)
    hl = L / 2 - 0.04
    p = dict(name=name, L=L, hw=0.93, paint=paint, wheel_r=0.40, wheel_w=0.30, wheel_segs=14,
             axles=[-hl + 0.84, hl - 0.80], sill=0.33, arch_zc=0.35, arch_r=0.44,
             end_f=0.46, end_r=0.40, ins_f=(0.34, 0.26, 0.12), ins_r=(0.30, 0.22, 0.12),
             top=[(-hl, 0.96), (-hl + 0.40, 1.00), (-1.2, 1.02), (0.70, 1.02), (hl - 0.45, 0.95), (hl, 0.90)],
             zs=[(-hl, 0.64), (hl, 0.62)], rb=0.08, rt=0.20, flare=0.02, tumble=0.03, bulge=0.02,
             cab=dict(z0=0.92, z1=1.06, z2=1.44, zr=1.63,
                      hw1=0.87, hw2=0.80, ff1=0.70, ff2=0.30, fb1=-1.32, fb2=-1.00,
                      rf1=0.26, rf2=0.22, rr1=0.26, rr2=0.22, side_fracs=[0.50, 0.57], side_tags=['g', 'b', 'g'],
                      A_tags=['ws', 'A', 'g'], C_tags=['g', 'C', 'rw'],
                      paint=paint, roof_inset=0.24, bow=0.05, side_bulge=0.015),
             )
    p['details'] = [
        d_headlights('rect', x=0.56, z=0.71, w=0.34, h=0.19),
        d_taillights(x=0.62, z=0.80, w=0.22, h=0.22),
        d_grille(w=0.50, h=0.14, z=0.55),
        d_bumper(1, z=0.41, h=0.21, depth=0.15, sw=BUMPER, r=0.08, out=0.015, wrap=0.35),
        d_bumper(-1, z=0.42, h=0.21, depth=0.15, sw=BUMPER, r=0.08, out=0.015, wrap=0.35),
        d_mirrors(0.62, 1.05),
        d_plates(zf=0.41, zr=0.64),
    ]
    return p

def build_sedan():
    return build_vehicle(p_sedan())

def build_taxi():
    Y = S('#ffc21a', 8)
    BLK = S('#24252b', 8)
    p = p_sedan('taxi', paint=Y)
    p['details'] = [d for d in p['details']]
    sign_f = -0.40
    def sign(m, s, p):
        loc, n = s.top(0, sign_f)
        z = loc.z - 0.01
        m.add(box_f(0, sign_f, z + 0.03, 0.42, 0.16, 0.06, 0, sw=BLK), tag='sign')
        SIGN = S('#fff2b3', 10)
        sw_, sd, sh = 0.64, 0.22, 0.20
        zc = z + 0.06 + sh / 2
        m.add(box_f(0, sign_f, zc, sw_, sd, sh, r=0.05, segs=1, sw=SIGN), tag='sign')
        LET = S('#2a2116', 0)
        hh = 0.10
        m.add(flat_text('TAXI', P(0, sign_f + sd / 2 + 0.004, zc - hh / 2), X, Z, hh, LET), tag='sign')
        m.add(flat_text('TAXI', P(0, sign_f - sd / 2 - 0.004, zc - hh / 2), -X, Z, hh, LET), tag='sign')
    p['details'].append(sign)
    p['details'].append(d_decal(checker(-0.78, 0.82, 0.79, 0.95, 2, 0.08), BLK, 'xp', mirror=True, off=0.005))
    p['details'][3] = d_bumper(1, z=0.41, h=0.21, depth=0.15, sw=PLASTIC, r=0.08, out=0.015, wrap=0.35)
    p['details'][4] = d_bumper(-1, z=0.42, h=0.21, depth=0.15, sw=PLASTIC, r=0.08, out=0.015, wrap=0.35)
    return build_vehicle(p)

def build_police():
    W = S('#f6f7f9', 8)
    B = S('#1f3f94', 8)
    p = p_sedan('police', paint=W, L=4.4)
    p['livery'] = lambda f, x, z, n, cur: (B if (z < 0.80 and -1.80 < f < 1.74) else cur)
    RED, BLUE = S('#ff3b30', 10), S('#2f6bff', 10)
    p['details'] = p['details'] + [
        d_lightbar(-0.42, 1.12, [(-0.56, -0.02, RED), (0.02, 0.56, BLUE)]),
        d_text('POLICE', -0.22, 0.655, 0.12, W),
        d_box(0, 2.17, 0.47, 0.9, 0.08, 0.18, PLASTIC, tag='pushbar'),
    ]
    p['details'] = [d for d in p['details'] if getattr(d, '__qualname__', '') != 'd_plates.<locals>.fn'] + [
        d_plates(zf=0.41, zr=0.64, front=False)]
    return build_vehicle(p)

def build_hatch():
    paint = S(PAINT, 1)
    L = 3.9
    hl = L / 2 - 0.04
    RIM = S('#5b616d', 5)
    p = dict(name='hatchback-sports', L=L, trim=0.09, hw=0.94, paint=paint, wheel_r=0.40, wheel_w=0.31,
             wheel_kw=dict(rim=RIM, dish=PLASTIC, hub=RIM),
             axles=[-hl + 0.72, hl - 0.74], sill=0.31, arch_zc=0.35, arch_r=0.44,
             end_f=0.46, end_r=0.30, ins_f=(0.34, 0.24, 0.12), ins_r=(0.24, 0.08, 0.10),
             top=[(-hl, 0.99), (-hl + 0.25, 1.01), (0.55, 1.01), (hl - 0.40, 0.93), (hl, 0.86)],
             zs=[(-hl, 0.62), (hl, 0.60)], rb=0.08, rt=0.18, flare=0.035, tumble=0.03, bulge=0.02,
             cab=dict(z0=0.94, z1=1.05, z2=1.35, zr=1.50,
                      hw1=0.88, hw2=0.79, ff1=0.55, ff2=0.14, fb1=-hl + 0.08, fb2=-hl + 0.62,
                      rf1=0.26, rf2=0.22, rr1=0.24, rr2=0.20, side_fracs=[0.60, 0.66], side_tags=['g', 'b', 'g'],
                      A_tags=['ws', 'A', 'g'], C_tags=['g', 'C', 'rw'],
                      paint=paint, roof_inset=0.20, bow=0.05, side_bulge=0.015))
    p['details'] = [
        d_headlights('rect', x=0.58, z=0.71, w=0.32, h=0.15),
        d_lamp(-1, 0.62, 0.86, 0.26, 0.14, TAIL),
        d_grille(w=0.86, h=0.17, z=0.48, rr=0.06),
        d_bumper(1, z=0.38, h=0.18, depth=0.14, sw=PLASTIC, r=0.07, out=0.015, wrap=0.30),
        d_bumper(-1, z=0.40, h=0.18, depth=0.14, sw=PLASTIC, r=0.07, out=0.015, wrap=0.30),
        d_mirrors(0.48, 1.05),
        d_spoiler(-hl + 0.55, None, 1.40, 0.30, PLASTIC, pitch=-12),
        d_exhaust(0.38, -hl + 0.02, 0.36), d_exhaust(0.26, -hl + 0.02, 0.36),
        d_plates(zf=0.38, zr=0.62),
    ]
    return build_vehicle(p)

def build_compact():
    paint = S(PAINT, 1)
    ROOF = S('#f8f8f6', 8)
    L = 3.4
    hl = L / 2 - 0.04
    p = dict(name='compact', L=L, trim=0.07, hw=0.86, paint=paint, wheel_r=0.34, wheel_w=0.26,
             axles=[-hl + 0.60, hl - 0.62], sill=0.30, arch_zc=0.30, arch_r=0.38,
             end_f=0.55, end_r=0.42, ins_f=(0.38, 0.30, 0.12), ins_r=(0.32, 0.14, 0.10),
             top=[(-hl, 0.90), (-hl + 0.30, 0.96), (0.40, 0.97), (hl - 0.35, 0.86), (hl, 0.78)],
             zs=[(-hl, 0.58), (hl, 0.56)], rb=0.08, rt=0.18, flare=0.03, tumble=0.03, bulge=0.03,
             cab=dict(z0=0.88, z1=1.00, z2=1.36, zr=1.58,
                      hw1=0.80, hw2=0.71, ff1=0.44, ff2=0.06, fb1=-hl + 0.12, fb2=-hl + 0.30,
                      rf1=0.30, rf2=0.26, rr1=0.30, rr2=0.26, side_fracs=[0.62, 0.69], side_tags=['g', 'b', 'g'],
                      A_tags=['ws', 'A', 'g'], C_tags=['g', 'C', 'rw'],
                      paint=paint, roof=ROOF, roof_inset=0.24, bow=0.05, side_bulge=0.02, frame=0.03))
    p['details'] = [
        d_round(1, 0.53, 0.69, 0.115, HEAD),
        d_lamp(-1, 0.60, 0.80, 0.12, 0.20, TAIL),
        d_grille(w=0.36, h=0.08, z=0.56, sw=CHROME, rr=0.04),
        d_bumper(1, z=0.40, h=0.12, depth=0.12, sw=CHROME, r=0.05, out=0.02, wrap=0.30),
        d_bumper(-1, z=0.42, h=0.12, depth=0.12, sw=CHROME, r=0.05, out=0.02, wrap=0.30),
        d_mirrors(0.36, 1.00, size=(0.13, 0.14, 0.10)),
        d_plates(zf=0.50, zr=0.58, w=0.32),
    ]
    return build_vehicle(p)

def build_suv(lux=False):
    paint = S(PAINT, 1)
    L = 4.7 if lux else 4.5
    hl = L / 2 - 0.04
    CLAD = S('#4b4e57', 0)
    p = dict(name='suv-luxury' if lux else 'suv', L=L, trim=0.07 if lux else 0.05, hw=0.97 if lux else 0.96, paint=paint, wheel_r=0.43, wheel_w=0.32,
             axles=[-hl + 0.92, hl - 0.90], sill=0.42, arch_zc=0.40, arch_r=0.48,
             end_f=0.46, end_r=0.32, ins_f=(0.32, 0.24, 0.12), ins_r=(0.26, 0.10, 0.10),
             top=[(-hl, 1.08), (-hl + 0.30, 1.12), (0.75, 1.12), (hl - 0.45, 1.06), (hl, 1.00)],
             zs=[(-hl, 0.72), (hl, 0.70)], rb=0.08, rt=0.18, flare=0.04, tumble=0.03, bulge=0.02,
             cab=dict(z0=1.04, z1=1.16, z2=1.54, zr=1.72,
                      hw1=0.90, hw2=0.84, ff1=0.78, ff2=0.40, fb1=-hl + 0.10, fb2=-hl + 0.24,
                      rf1=0.24, rf2=0.20, rr1=0.20, rr2=0.18, side_fracs=[0.38, 0.43, 0.80, 0.84],
                      side_tags=['g', 'b', 'g', 'b', 'g'], A_tags=['ws', 'A', 'g'], C_tags=['g', 'C', 'rw'],
                      paint=paint, roof_inset=0.20, bow=0.04, side_bulge=0.012))
    if lux:
        p['top'] = [(-hl, 1.06), (-hl + 0.30, 1.10), (0.70, 1.10), (hl - 0.50, 1.03), (hl, 0.96)]
        p['cab'] = dict(p['cab'], ff1=0.70, ff2=0.26, fb2=-hl + 0.34, zr=1.70, z2=1.52)
        p['wheel_kw'] = dict(rim=CHROME, dish=CHROME, hub=CHROME_D)
        p['details'] = [
            d_headlights('rect', x=0.62, z=0.78, w=0.34, h=0.12),
            d_lamp(-1, 0.66, 0.92, 0.30, 0.12, TAIL),
            d_grille(w=0.70, h=0.30, z=0.70, sw=CHROME, rr=0.06),
            d_grille(w=0.62, h=0.24, z=0.70, sw=PLASTIC, rr=0.05, out=0.02, slats=2),
            d_bumper(1, z=0.50, h=0.20, depth=0.15, sw=PLASTIC, r=0.07, out=0.015, wrap=0.35),
            d_bumper(-1, z=0.52, h=0.20, depth=0.15, sw=PLASTIC, r=0.07, out=0.015, wrap=0.35),
            d_mirrors(0.62, 1.18, size=(0.14, 0.16, 0.12)),
            d_roofrails(-hl + 0.55, 0.05, 0.62, sw=CHROME, hgt=0.04),
            d_plates(zf=0.48, zr=0.70, front=False),
        ]
    else:
        p['livery'] = lambda f, x, z, n, cur: (CLAD if z < 0.56 and abs(n.y) < 0.95 else cur)
        p['details'] = [
            d_headlights('rect', x=0.60, z=0.74, w=0.34, h=0.16),
            d_lamp(-1, 0.68, 0.94, 0.20, 0.26, TAIL),
            d_grille(w=0.62, h=0.20, z=0.68, sw=PLASTIC, rr=0.06, slats=2),
            d_bumper(1, z=0.48, h=0.24, depth=0.17, sw=CLAD, r=0.08, out=0.02, wrap=0.40),
            d_bumper(-1, z=0.50, h=0.24, depth=0.17, sw=CLAD, r=0.08, out=0.02, wrap=0.40),
            d_mirrors(0.70, 1.20, size=(0.14, 0.16, 0.13)),
            d_roofrails(-hl + 0.45, 0.20, 0.64, sw=PLASTIC),
            d_plates(zf=0.48, zr=0.72),
        ]
    return build_vehicle(p)

def build_sports():
    paint = S(PAINT, 1)
    L = 4.2
    hl = L / 2 - 0.04
    p = dict(name='sedan-sports', L=L, trim=0.08, hw=0.95, paint=paint, wheel_r=0.40, wheel_w=0.32,
             wheel_kw=dict(rim=CHROME, dish=PLASTIC, hub=CHROME),
             axles=[-hl + 0.78, hl - 0.84], sill=0.29, arch_zc=0.36, arch_r=0.44,
             end_f=0.50, end_r=0.40, ins_f=(0.34, 0.20, 0.10), ins_r=(0.30, 0.16, 0.10),
             top=[(-hl, 0.86), (-hl + 0.35, 0.92), (-0.60, 0.93), (0.40, 0.92), (hl - 0.45, 0.82), (hl, 0.76)],
             zs=[(-hl, 0.58), (hl, 0.54)], rb=0.08, rt=0.17, flare=0.045, tumble=0.04, bulge=0.025,
             cab=dict(z0=0.84, z1=0.96, z2=1.25, zr=1.42,
                      hw1=0.86, hw2=0.74, ff1=0.36, ff2=-0.12, fb1=-1.42, fb2=-0.98,
                      rf1=0.30, rf2=0.24, rr1=0.30, rr2=0.24, side_fracs=[0.68, 0.73], side_tags=['g', 'b', 'g'],
                      A_tags=['ws', 'A', 'g'], C_tags=['g', 'C', 'rw'],
                      paint=paint, roof_inset=0.22, bow=0.06, side_bulge=0.015))
    p['details'] = [
        d_headlights('rect', x=0.60, z=0.56, w=0.32, h=0.11),
        d_lamp(-1, 0.58, 0.80, 0.36, 0.10, TAIL),
        d_grille(w=0.92, h=0.15, z=0.44, sw=PLASTIC, rr=0.06),
        d_bumper(1, z=0.36, h=0.15, depth=0.13, sw=PLASTIC, r=0.06, out=0.015, wrap=0.30),
        d_bumper(-1, z=0.38, h=0.15, depth=0.13, sw=PLASTIC, r=0.06, out=0.015, wrap=0.30),
        d_mirrors(0.20, 0.97, size=(0.14, 0.15, 0.09)),
        d_spoiler(-hl + 0.18, 1.04, 1.50, 0.26, PLASTIC, pitch=-4, posts=0.12),
        d_exhaust(0.45, -hl + 0.02, 0.33), d_exhaust(-0.45, -hl + 0.02, 0.33),
        d_plates(zf=0.36, zr=0.58),
    ]
    return build_vehicle(p)

def build_van():
    paint = S(PAINT, 1)
    L = 4.8
    hl = L / 2 - 0.04
    p = dict(name='van', L=L, trim=0.08, hw=0.98, paint=paint, wheel_r=0.40, wheel_w=0.30,
             axles=[-hl + 0.92, hl - 0.80], sill=0.36, arch_zc=0.36, arch_r=0.45,
             end_f=0.46, end_r=0.20, ins_f=(0.32, 0.26, 0.12), ins_r=(0.16, 0.06, 0.08),
             top=[(-hl, 1.06), (-hl + 0.2, 1.08), (hl - 0.95, 1.08), (hl - 0.40, 1.00), (hl, 0.92)],
             zs=[(-hl, 0.70), (hl, 0.66)], rb=0.08, rt=0.14, flare=0.02, tumble=0.02, bulge=0.02,
             cab=dict(z0=1.00, z1=1.12, z2=1.58, zr=2.00,
                      hw1=0.95, hw2=0.92, ff1=hl - 0.78, ff2=hl - 1.30, fb1=-hl + 0.03, fb2=-hl + 0.05,
                      rf1=0.30, rf2=0.26, rr1=0.20, rr2=0.18, side_fracs=[0.15, 0.19],
                      side_tags=['g', 'b', 'P'], A_tags=['ws', 'A', 'g'], C_tags=['P', 'C', 'rw'],
                      paint=paint, roof_inset=0.18, bow=0.05, side_bulge=0.01, frame=0.20, roof_th=(35, 65, 90)))
    seam = PLASTIC
    p['details'] = [
        d_headlights('rect', x=0.62, z=0.80, w=0.32, h=0.18),
        d_lamp(-1, 0.80, 0.95, 0.14, 0.34, TAIL),
        d_grille(w=0.80, h=0.20, z=0.62, sw=PLASTIC, rr=0.06, slats=2),
        d_bumper(1, z=0.46, h=0.22, depth=0.16, sw=PLASTIC, r=0.08, out=0.015, wrap=0.30),
        d_bumper(-1, z=0.48, h=0.22, depth=0.16, sw=PLASTIC, r=0.08, out=0.015, wrap=0.25),
        d_mirrors(hl - 0.98, 1.20, size=(0.13, 0.10, 0.22)),
        d_seams([hl - 1.78, -0.40], 0.42, 1.80, sw=seam),
        d_decal([(-0.42, 1.06, -0.10, 1.10)], PLASTIC, 'xp', mirror=True, off=0.006),
        d_decal([(-0.008, 0.45, 0.008, 1.82)], seam, 'b', mirror=False, sub=4),
        d_plates(zf=0.46, zr=0.70),
    ]
    return build_vehicle(p)

# ------------------------------------------------------------------------------------------------
# trucks: a car-style cab (lower body + greenhouse) plus boxes
# ------------------------------------------------------------------------------------------------
def cab_params(name, L, cab_len, paint, fa_front, wheel_r, hood_z, belt_z, z1, z2, zr, ff1, ff2, hw=1.0,
               sill=0.48, side_frac=0.62, end_f=0.42, ins_f=(0.30, 0.22, 0.12)):
    hl = L / 2 - 0.03
    fcab = hl - cab_len / 2
    f_back = hl - cab_len
    return dict(name=name, L=L, hw=hw, paint=paint, wheel_r=wheel_r,
                Lb=cab_len, fc=fcab, arch_axles=[fa_front], sill=sill, arch_zc=wheel_r * 0.95, arch_r=wheel_r + 0.06,
                end_f=end_f, end_r=0.14, ins_f=ins_f, ins_r=(0.08, 0.08, 0.05),
                top=[(f_back, belt_z), (ff1 - 0.10, belt_z), (hl - 0.45, hood_z + 0.04), (hl, hood_z)],
                zs=[(f_back, (sill + belt_z) / 2), (hl, (sill + hood_z) / 2)], rb=0.08, rt=0.16, flare=0.02, tumble=0.03,
                bulge=0.02,
                cab=dict(z0=belt_z - 0.12, z1=belt_z + 0.04, z2=z2, zr=zr,
                         hw1=hw - 0.04, hw2=hw - 0.07, ff1=ff1, ff2=ff2, fb1=f_back + 0.04, fb2=f_back + 0.06,
                         rf1=0.24, rf2=0.20, rr1=0.14, rr2=0.12, side_fracs=[side_frac, side_frac + 0.08],
                         side_tags=['g', 'b', 'P'], A_tags=['ws', 'A', 'g'], C_tags=['P', 'P', 'P'], rw=paint,
                         paint=paint, roof_inset=0.18, bow=0.04, side_bulge=0.01, frame=0.06)), hl, f_back

def truck_common(p, hl, mirror_f, mirror_z, head_z, grille_z, bumper_z):
    return [
        d_headlights('rect', x=0.66, z=head_z, w=0.30, h=0.18),
        d_grille(w=0.86, h=0.30, z=grille_z, sw=PLASTIC, rr=0.06, slats=3),
        d_bumper(1, z=bumper_z, h=0.24, depth=0.18, sw=PLASTIC, r=0.08, out=0.015, wrap=0.25),
        d_mirrors(mirror_f, mirror_z, sw=PLASTIC, size=(0.12, 0.10, 0.30)),
    ]

def build_delivery():
    CAB = S('#3b87e6', 8)
    BOX = S('#f6f3ec', 8)
    BAND = S('#3b87e6', 8)
    ORANGE = S('#ff9a2e', 8)
    L = 5.4
    fa_f, fa_r = 1.78, -1.62
    p, hl, fb = cab_params('delivery', L, 1.80, CAB, fa_f, 0.44, hood_z=1.16, belt_z=1.30, z1=1.34, z2=1.92, zr=2.34,
                           ff1=2.14, ff2=1.84)
    p.update(wheel_w=0.32, axles=[fa_r, fa_f], tub=False,
             wheels=[(fa_f, 0.44, 0.32), (fa_r, 0.44, 0.42)])
    bf0, bf1 = fb - 0.06, -hl
    zb0, zb1 = 0.98, 2.90
    def box(p):
        return [(rbox(P(0, (bf0 + bf1) / 2, (zb0 + zb1) / 2), (2.12, bf0 - bf1, zb1 - zb0), r=0.13, segs=3, sw=BOX), 'box')]
    p['shell'] = [box]
    p['details'] = truck_common(p, hl, 2.02, 1.50, 0.96, 0.82, 0.56) + [
        d_box(0, (bf0 + bf1) / 2 + 0.2, 0.74, 1.04, bf0 - bf1 - 0.2, 0.30, DARK, tag='chassis'),
        d_box(0, bf1 + 0.06, 0.62, 2.0, 0.14, 0.18, PLASTIC, r=0.04, tag='bumper'),
        d_fender(fa_r, 0.44, 0.52, 0.80, 0.46, a0=-80, a1=80),
        d_lamp(-1, 0.86, 0.66, 0.16, 0.14, TAIL),
        d_decal([(bf1 + 0.18, 1.12, bf0 - 0.16, 1.34)], BAND, 'xp', sub=6),
        d_decal([(bf1 + 0.18, 1.40, bf0 - 0.16, 1.49)], ORANGE, 'xp', sub=6),
        d_decal([(-0.009, 1.06, 0.009, 2.80)], PLASTIC, 'b', mirror=False, sub=4),
        d_decal([(0.12, 1.70, 0.16, 2.10)], CHROME, 'b', mirror=True, off=0.012),
        d_decal([(-0.98, 1.12, 0.98, 1.34)], BAND, 'b', mirror=False, sub=4),
        d_plates(zf=0.56, zr=0.62, front=False),
    ]
    return build_vehicle(p)

def build_truck():
    CAB = S('#e9573d', 8)
    WOOD = S('#bf8a55', 0)
    WOOD_D = S('#9a6a3e', 0)
    METAL = S('#5a606b', 0)
    CRATE = S('#dcab68', 0)
    TARP = S('#4f9a52', 0)
    L = 6.2
    fa_f, fa_r = 2.22, -1.90
    p, hl, fb = cab_params('truck', L, 1.86, CAB, fa_f, 0.45, hood_z=1.18, belt_z=1.32, z1=1.36, z2=1.92, zr=2.40,
                           ff1=2.52, ff2=2.22)
    p.update(wheel_w=0.32, axles=[fa_r, fa_f], tub=False,
             wheels=[(fa_f, 0.45, 0.32), (fa_r, 0.45, 0.42)])
    bf0, bf1 = fb - 0.12, -hl
    def bed(p):
        parts = []
        parts.append((rbox(P(0, (bf0 + bf1) / 2, 1.08), (2.12, bf0 - bf1, 0.16), r=0.03, segs=1, sw=WOOD), 'bed'))
        for sx in (-1, 1):
            parts.append((rbox(P(sx * 1.02, (bf0 + bf1) / 2, 1.34), (0.08, bf0 - bf1, 0.38), r=0.025, segs=1, sw=WOOD_D), 'bed'))
        parts.append((rbox(P(0, bf1 + 0.04, 1.34), (2.04, 0.08, 0.38), r=0.025, segs=1, sw=WOOD_D), 'bed'))
        parts.append((rbox(P(0, bf0 - 0.05, 1.62), (2.06, 0.10, 0.94), r=0.03, segs=1, sw=METAL), 'bed'))
        return parts
    p['shell'] = [bed]
    def cargo(m, s, p):
        for f, sz, rot in ((bf0 - 0.62, 0.86, 4), (bf0 - 1.55, 0.80, -6)):
            m.add(box_f(-0.42 if rot > 0 else 0.40, f, 1.16 + sz / 2, sz, sz, sz, r=0.04, segs=1, sw=CRATE, yaw=rot),
                  tag='cargo')
            for k in (-1, 1):
                m.add(box_f(-0.42 if rot > 0 else 0.40, f, 1.16 + sz / 2 + k * sz * 0.28, sz + 0.02, sz + 0.02, 0.07, 0,
                            sw=WOOD_D, yaw=rot), tag='cargo')
        m.add(box_f(0, bf1 + 0.85, 1.48, 1.80, 1.30, 0.64, r=0.18, segs=2, sw=TARP), tag='cargo')
        for f in (bf1 + 0.45, bf1 + 1.25):
            m.add(box_f(0, f, 1.50, 1.86, 0.05, 0.68, r=0.02, segs=1, sw=WOOD_D), tag='cargo')
    p['details'] = truck_common(p, hl, 2.40, 1.50, 0.98, 0.84, 0.58) + [
        d_box(0, (bf0 + bf1) / 2 + 0.2, 0.76, 1.04, bf0 - bf1 - 0.2, 0.26, DARK, tag='chassis'),
        d_box(0, bf1 + 0.10, 0.62, 2.0, 0.14, 0.18, PLASTIC, r=0.04, tag='bumper'),
        d_fender(fa_r, 0.45, 0.53, 0.80, 0.46, a0=-80, a1=80),
        d_lamp(-1, 0.86, 0.62, 0.16, 0.12, TAIL),
        cargo,
    ]
    return build_vehicle(p)

def build_garbage():
    G = S('#3fa652', 8)
    GD = S('#2f7d3e', 8)
    HOP = S('#5a606a', 0)
    YEL = S('#ffc928', 0)
    BLK = S('#2a2b30', 0)
    L = 6.6
    fa_f, fa_r1, fa_r2 = 2.52, -1.12, -2.16
    hl = L / 2 - 0.03
    cab_len = 1.66
    p, hl, fb = cab_params('garbage-truck', L, cab_len, G, fa_f, 0.47, hood_z=1.32, belt_z=1.44, z1=1.48, z2=2.16,
                           zr=2.56, ff1=hl - 0.08, ff2=hl - 0.24, sill=0.56, side_frac=0.70, end_f=0.30,
                           ins_f=(0.24, 0.16, 0.10))
    p.update(wheel_w=0.34, axles=[fa_r2, fa_f], tub=False,
             wheels=[(fa_f, 0.47, 0.34), (fa_r1, 0.47, 0.42), (fa_r2, 0.47, 0.42)])
    p['cab']['rf1'] = 0.18
    p['cab']['rf2'] = 0.16
    p['cab']['side_tags'] = ['g', 'b', 'P']
    bf0, bf1 = fb - 0.08, -hl + 0.70
    def body(p):
        parts = [(rbox(P(0, (bf0 + bf1) / 2, 1.98), (2.14, bf0 - bf1, 1.96), r=0.16, segs=3, sw=G), 'box')]
        hb = rbox(P(0, bf1 - 0.34, 1.66), (2.08, 0.70, 1.90), r=0.14, segs=2, sw=GD)
        for v in hb.verts:      # tailgate: lower lip sticks out, top leans forward
            v.co.y -= max(0.0, v.co.z - 1.2) * 0.16
        parts.append((hb, 'box'))
        return parts
    p['shell'] = [body]
    stripes = []
    for k in range(6):
        x0 = -0.95 + k * 0.33
        stripes.append((x0, 0.78, x0 + 0.165, 0.95))
    p['details'] = truck_common(p, hl, hl - 0.30, 1.62, 0.92, 0.78, 0.58) + [
        d_box(0, (fa_r2 + bf0) / 2 + 0.1, 0.80, 1.04, bf0 - fa_r2 + 0.6, 0.30, DARK, tag='chassis'),
        d_fender((fa_r1 + fa_r2) / 2, 0.47, 0.55, 0.80, 0.46, a0=-90, a1=90, segs=8),
        d_box(0, hl - 0.85, 2.60, 0.26, 0.20, 0.10, YEL, r=0.04, tag='beacon'),
        d_decal([(bf1 + 0.2, 1.06, bf0 - 0.2, 1.18)], S('#f2f4f2', 8), 'xp', sub=6),
        d_decal([(-0.80, 0.98, 0.80, 1.52)], BLK, 'b', mirror=False, sub=2),
        d_decal(stripes, YEL, 'b', mirror=False),
        d_lamp(-1, 0.86, 0.90, 0.14, 0.24, TAIL),
        d_box(0.0, bf1 - 0.62, 0.62, 1.9, 0.12, 0.16, PLASTIC, r=0.04, tag='bumper'),
        d_text('CITY', (bf0 + bf1) / 2, 1.82, 0.30, S('#f2f4f2', 8)),
    ]
    return build_vehicle(p)

def build_ambulance():
    W = S('#f7f8fa', 8)
    RED = S('#e2302d', 8)
    LR, LW, LB = S('#ff3b30', 10), S('#ffffff', 10), S('#2f6bff', 10)
    L = 5.4
    fa_f, fa_r = 1.82, -1.66
    p, hl, fb = cab_params('ambulance', L, 1.92, W, fa_f, 0.42, hood_z=1.04, belt_z=1.18, z1=1.22, z2=1.76, zr=2.24,
                           ff1=1.96, ff2=1.56, side_frac=0.66)
    p.update(wheel_w=0.31, axles=[fa_r, fa_f], tub=False, wheels=[(fa_f, 0.42, 0.31), (fa_r, 0.42, 0.40)])
    bf0, bf1 = fb - 0.04, -hl
    zb0, zb1 = 0.86, 2.76
    def box(p):
        return [(rbox(P(0, (bf0 + bf1) / 2, (zb0 + zb1) / 2), (2.12, bf0 - bf1, zb1 - zb0), r=0.14, segs=3, sw=W), 'box')]
    p['shell'] = [box]
    p['details'] = truck_common(p, hl, 1.66, 1.36, 0.86, 0.70, 0.50) + [
        d_box(0, (bf0 + bf1) / 2, 0.68, 1.04, bf0 - bf1 - 0.4, 0.24, DARK, tag='chassis'),
        d_box(0, bf1 + 0.02, 0.56, 2.0, 0.16, 0.16, PLASTIC, r=0.04, tag='bumper'),
        d_fender(fa_r, 0.42, 0.50, 0.80, 0.44, a0=-80, a1=80),
        d_decal([(bf1 + 0.16, 1.00, hl - 0.30, 1.20)], RED, 'xp', sub=10),
        d_decal([(bf1 + 0.16, 1.27, bf0 - 0.14, 1.33)], RED, 'xp', sub=6),
        d_decal([(-0.98, 1.00, 0.98, 1.20)], RED, 'b', mirror=False, sub=4),
        d_cross((bf0 + bf1) / 2 - 0.15, 2.00, 0.62, RED),
        d_cross(0.5, 2.05, 0.46, RED, axis='b', mirror=False),
        d_decal([(-0.008, 0.92, 0.008, 2.66)], PLASTIC, 'b', mirror=False, sub=4),
        d_lightbar(1.30, 1.30, [(-0.65, -0.22, LR), (-0.21, 0.21, LW), (0.22, 0.65, LB)]),
        d_box(0.92, bf0 - 0.12, zb1 + 0.04, 0.16, 0.16, 0.10, LR, r=0.03, mirror=True, tag='beacons'),
        d_box(0.92, bf1 + 0.12, zb1 + 0.04, 0.16, 0.16, 0.10, LR, r=0.03, mirror=True, tag='beacons'),
        d_lamp(-1, 0.86, 0.62, 0.14, 0.26, TAIL),
        d_text('AMBULANCE', (bf0 + bf1) / 2 - 0.15, 1.45, 0.18, RED),
    ]
    return build_vehicle(p)

# ------------------------------------------------------------------------------------------------
# elevated metro / tram cars
# ------------------------------------------------------------------------------------------------
T_WHITE = S('#f6f7f9', 8)
T_ORANGE = S('#ff8a2a', 8)
T_TEAL = S('#16b3a6', 8)
T_DOOR = S('#cfd6e0', 8)
T_GREY = S('#59606b', 0)
T_ROOFBOX = S('#cfd5dd', 0)

TR = dict(hw=1.35, zb=0.98, zt=3.36, rb=0.12, rt=0.62,
          levels=[(1.18, 'side'), (1.36, 'orange'), (1.48, 'teal'), (1.70, 'side'), (2.62, 'win'), (2.92, 'side')])

def train_ring(f, hw, zb, zt, rt, lv=TR['levels'], rb=TR['rb']):
    """returns (points, labels) - right half bottom -> top, mirrored; label[i] = segment i -> i+1."""
    rt = min(rt, hw * 0.6, (zt - zb) * 0.45)
    rb = min(rb, (zt - zb) * 0.2)
    lo, hi = zb + rb + 0.01, zt - rt - 0.01
    zs = [z for z, _ in lv]
    z0, z1 = zs[0], zs[-1]
    # squeeze the side levels into the available height (nose)
    if z0 < lo or z1 > hi:
        k = min(1.0, (hi - lo) / (z1 - z0))
        base = max(lo, min(z0, hi - (z1 - z0) * k))
        zs = [base + (z - z0) * k for z in zs]
    right, labs = [], []
    right += arc2(hw - rb, zb + rb, rb, -90, 0, 2)
    labs += ['lip', 'lip']
    for i, z in enumerate(zs):
        t = (z - zb) / (zt - zb)
        right.append((hw - 0.03 * t, z))
        labs.append(lv[i][1])
    labs.append('side')              # last level -> top arc start
    right += arc2(hw - 0.03 - rt, zt - rt, rt, 0, 90, 4)
    labs += ['roof'] * 4
    pts = [(0.0, zb)] + right + [(0.0, zt)] + [(-x, z) for x, z in reversed(right)]
    labels = ['under'] + labs + ['roof', 'roof'] + list(reversed(labs)) + ['under']
    return [P(x, f, z) for x, z in pts], labels

def train_car(name, head):
    m = Model(name)
    L = 12.0
    hl = L / 2 - 0.08
    if head:
        doors = [(1.80, 3.00), (-3.60, -2.40)]
        wins = [(3.22, 5.72), (0.18, 1.58), (-2.18, -0.14), (-5.50, -3.82)]
    else:
        doors = [(2.30, 3.50), (-3.50, -2.30)]
        wins = [(3.72, 5.50), (0.12, 2.08), (-2.08, -0.12), (-5.50, -3.72)]
    sts = []
    # rear (and, for mid cars, front) coupling end: short fillet
    def end_stations(sign):
        out = []
        for th in (0, 45, 75, 90):
            sth = math.sin(math.radians(th))
            k = 1 - math.cos(math.radians(th))
            out.append((sign * (hl - 0.16 + 0.16 * sth), dict(dhw=0.10 * k, dzt=0.10 * k, dzb=0.04 * k)))
        return out
    sts += end_stations(-1)
    edges = sorted(set([e for d in doors for e in d] + [e for w in wins for e in w]))
    for e in edges:
        sts.append((e, {}))
    if head:
        # rounded nose from 4.25 to 6.0: (f, hw, zb, zt, rt)
        nose = [(4.55, 1.35, 0.98, 3.36, 0.62), (5.05, 1.345, 0.98, 3.33, 0.64), (5.42, 1.33, 0.985, 3.26, 0.66),
                (5.68, 1.30, 0.99, 3.14, 0.66), (5.84, 1.25, 1.00, 3.00, 0.62), (5.93, 1.17, 1.02, 2.86, 0.56),
                (5.975, 1.06, 1.05, 2.74, 0.48), (6.0, 0.92, 1.09, 2.64, 0.40)]
        for f, hw, zb, zt, rt in nose:
            sts.append((f, dict(hw=hw, zb=zb, zt=zt, rt=rt)))
    else:
        sts += end_stations(1)
    sts.sort(key=lambda s: s[0])
    rings, labels, fs = [], None, []
    for f, d in sts:
        hw = d.get('hw', TR['hw']) - d.get('dhw', 0)
        zb = d.get('zb', TR['zb']) + d.get('dzb', 0)
        zt = d.get('zt', TR['zt']) - d.get('dzt', 0)
        rt = d.get('rt', TR['rt'])
        r, labels = train_ring(f, hw, zb, zt, rt)
        rings.append(r)
        fs.append(f)
    def inside(f, spans):
        return any(a <= f <= b for a, b in spans)
    def fm(b, sidx):
        if sidx < 0:
            return T_WHITE
        lab = labels[sidx]
        fmid = (fs[b] + fs[b + 1]) / 2
        if lab == 'under':
            return DARK
        if lab == 'orange':
            return T_ORANGE
        if lab == 'teal':
            return T_TEAL
        if lab == 'win' and (inside(fmid, wins) or inside(fmid, doors)):
            return GLASS
        if lab in ('side', 'lip', 'win') and inside(fmid, doors):
            return T_DOOR
        return T_WHITE
    body = loft(rings, F, fm, True, True)
    if head:   # rake the front: the upper nose leans back
        for v in body.verts:
            f = -v.co.y
            if f > 4.6:
                v.co.y += 0.30 * max(0.0, v.co.z - 1.45) * smooth01((f - 4.6) / 1.4)
    mark_sharp(body, 50)
    surf = Surf(body)
    m.add(body, tag='body')
    # door seams + window pillars between door leaves
    rects = []
    for a, b in doors:
        c = (a + b) / 2
        rects.append((c - 0.012, 1.02, c + 0.012, 2.90))
    m.add(decal_quads(surf, rects, T_GREY, 'xp', off=0.006, sub=4), mirror=True, tag='doors')
    if head:
        # big wrap-around windshield on the nose and two lamps
        m.add(decal_quads(surf, [(-0.84, 1.54, 0.84, 2.50)], GLASS, 'f', off=0.010, sub=4), tag='windshield')
        m.add(decal_quads(surf, [(-0.42, 2.32, 0.42, 2.44)], S('#ffb43a', 10), 'f', off=0.018, sub=2), tag='windshield')
        m.add(decal_quads(surf, [(-0.96, 1.22, 0.96, 1.32)], T_ORANGE, 'f', off=0.006, sub=6), tag='stripes')
        m.add(decal_quads(surf, [(-0.96, 1.32, 0.96, 1.39)], T_TEAL, 'f', off=0.006, sub=6), tag='stripes')
        for x in (0.62,):
            m.add(decal_quads(surf, [(x - 0.17, 1.42, x + 0.17, 1.50)], HEAD, 'f', off=0.010, sub=1), mirror=True,
                  tag='lamps')
        m.add(box_f(0, hl - 0.05, 0.86, 1.10, 0.30, 0.18, r=0.05, segs=1, sw=T_GREY), tag='coupler')
    else:
        m.add(box_f(0, hl + 0.02, 1.95, 1.20, 0.12, 1.70, r=0.05, segs=1, sw=S('#3a3d45', 0)), tag='gangway')
    m.add(box_f(0, -hl - 0.02, 1.95, 1.20, 0.12, 1.70, r=0.05, segs=1, sw=S('#3a3d45', 0)), tag='gangway')
    # bogies: side frames, bolster, wheels
    for fb_ in ((3.75 if head else 4.1), -4.1):
        for sx in (1,):
            m.add(box_f(0.86, fb_, 0.52, 0.14, 2.30, 0.34, r=0.05, segs=1, sw=T_GREY), mirror=True, tag='bogies')
        m.add(box_f(0, fb_, 0.78, 1.60, 0.60, 0.26, 0, sw=DARK), tag='bogies')
        for fw in (fb_ - 0.80, fb_ + 0.80):
            k = 0.38 / math.cos(math.pi / 10)
            m.add(lathe([(k, -0.07), (k, 0.07), (0.20, 0.08), (0.0, 0.08)], P(0.72, fw, 0.38), X, 10,
                        [S('#4a4f58', 5), S('#8d949e', 5), S('#8d949e', 5)], angle=40, phase=math.pi / 2 - math.pi / 10),
                  mirror=True, tag='bogies')
    # underframe equipment and roof units
    m.add(box_f(0, 0, 0.82, 2.10, 5.0, 0.30, r=0.04, segs=1, sw=DARK), tag='under')
    for fr_ in ((-2.8, 1.6) if head else (-3.0, 3.0)):
        loc, n = surf.top(0, fr_)
        m.add(box_f(0, fr_, loc.z + 0.05, 1.50, 1.90, 0.20, r=0.08, segs=1, sw=T_ROOFBOX), tag='roof')
    return m

def build_train_head():
    return train_car('train_head', True)

def build_train_mid():
    return train_car('train_mid', False)

# ------------------------------------------------------------------------------------------------
# boats (y = 0 is the waterline)
# ------------------------------------------------------------------------------------------------
def hull(L, beam, sheer, bottom, cols, bow_rise=0.25, transom=0.78, n=11, stripe=None):
    """open-topped hull loft + deck strip + transom.  cols: dict label -> swatch.
    levels on the side: bottom .. waterline (0) .. boot stripe .. sheer."""
    hl = L / 2
    fs = [-hl + L * (i / (n - 1)) for i in range(n)]
    fs[-1] = hl
    rings, labs = [], None
    for f in fs:
        t = (f + hl) / L                          # 0 stern .. 1 bow
        bowk = smooth01((t - 0.55) / 0.45)
        hw = beam / 2 * (lerp(transom, 1.0, smooth01(t / 0.45)) * max(0.02, math.cos(bowk * math.pi / 2) ** 0.8))
        zs = sheer + bow_rise * bowk ** 2
        zb = bottom * (1 - 0.65 * bowk ** 1.2)
        lv = [(zb, 0.0), (lerp(zb, 0, 0.55), 0.62), (lerp(zb, 0, 0.88), 0.88), (0.0, 0.96),
              (stripe or 0.12, 0.99), (lerp(stripe or 0.12, zs, 0.55), 1.0), (zs, 0.97)]
        # flare: near the bow the lower hull narrows faster than the sheer
        right = [(hw * k * (1 - 0.55 * bowk * (1 - (z - zb) / (zs - zb))), z) for z, k in lv[1:]]
        pts = list(reversed(right)) + [(0.0, zb)] + [(-x, z) for x, z in right]
        rings.append([P(x, f, z) for x, z in pts])
        names = ['top', 'upper', 'boot', 'water', 'below', 'below']
        labs = names + list(reversed(names))
    def fm(b, s):
        if s < 0:
            return cols['transom']
        return cols[labs[s]]
    bm = loft(rings, F, fm, cap0=True, cap1=False, closed=False)
    # deck: strips between port and starboard sheer points
    deck = bmesh.new()
    prev = None
    for r in rings:
        a, b = deck.verts.new(r[0]), deck.verts.new(r[-1])
        if prev:
            fc = deck.faces.new((prev[0], prev[1], b, a))
            fc.material_index = cols['deck']
        prev = (a, b)
    deck.normal_update()
    for fc in deck.faces:
        if fc.normal.z < 0:
            fc.normal_flip()
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    bm.normal_update()
    # make sure the hull faces point outwards (the open top confuses recalc)
    out = sum(1 for fc in bm.faces if fc.normal.dot(fc.calc_center_median() - Vector((0, fc.calc_center_median().y, -0.2))) > 0)
    if out < len(bm.faces) / 2:
        for fc in bm.faces:
            fc.normal_flip()
    mark_sharp(bm, 50)
    for fc in deck.faces:
        fc.smooth = False
    return bm, deck, rings

def sail(pts3, thick, sw, rows=4, belly=0.0, side=X):
    """thin two-sided triangular sail: pts3 = (tack, head, clew) Vectors; belly bulges along `side`."""
    A, Hd, C = pts3
    bm = bmesh.new()
    grid = []
    for i in range(rows + 1):
        u = i / rows
        row = []
        for j in range(rows + 1 - i):
            v = j / rows
            p = A + (Hd - A) * u + (C - A) * v
            w = 1 - u - v
            bul = belly * 4 * (u * v + u * w + v * w) / 1.33
            row.append(p + side * bul)
        grid.append(row)
    def build(offs, want):
        vv = [[bm.verts.new(p + side * offs) for p in row] for row in grid]
        made = []
        for i in range(rows):
            for j in range(rows - i):
                made.append(bm.faces.new([vv[i][j], vv[i + 1][j], vv[i][j + 1]]))
                if j < rows - i - 1:
                    made.append(bm.faces.new([vv[i + 1][j], vv[i + 1][j + 1], vv[i][j + 1]]))
        for fc in made:
            fc.normal_update()
        flip = made[0].normal.dot(side) * want < 0
        for fc in made:
            if flip:
                fc.normal_flip()
            fc.material_index = sw
            fc.smooth = True
    build(thick / 2, 1)
    build(-thick / 2, -1)
    return bm

def build_sailboat():
    m = Model('sailboat')
    WHITE = S('#f7f7f4', 8)
    NAVY = S('#24407a', 8)
    RED = S('#c9483e', 0)
    TEAK = S('#d4a46c', 0)
    SAILW = S('#fbf9f2', 0)
    SAILC = S('#ff6f59', 0)
    ALU = S('#d5dae1', 5)
    L = 8.6
    cols = dict(top=WHITE, upper=WHITE, boot=NAVY, water=WHITE, below=RED, transom=WHITE, deck=TEAK)
    bm, deck, rings = hull(L, 2.7, 0.82, -0.55, cols, bow_rise=0.25, transom=0.80, n=15, stripe=0.12)
    m.add(bm, tag='hull')
    m.add(deck, tag='deck')
    # cabin house + cockpit coaming
    m.add(box_f(0, 0.40, 1.08, 1.72, 2.70, 0.60, r=0.18, segs=2, sw=WHITE), tag='cabin')
    surf = Surf(rbox(P(0, 0.40, 1.08), (1.72, 2.70, 0.60), r=0.18, segs=2))
    m.add(decal_quads(surf, [(-0.25, 1.10, 0.35, 1.24), (0.55, 1.10, 1.25, 1.24)], GLASS, 'xp', off=0.008, sub=2),
          mirror=True, tag='cabin')
    m.add(decal_quads(surf, [(-0.55, 1.10, 0.55, 1.26)], GLASS, 'f', off=0.008, sub=3), tag='cabin')
    m.add(box_f(0, -2.30, 0.88, 1.90, 2.00, 0.14, r=0.05, segs=1, sw=TEAK), tag='cockpit')
    # mast, boom, sails
    mf = 1.35
    m.add(cyl(P(0, mf, 5.85), Z, 0.07, 10.0, segs=8, sw=ALU), tag='mast')
    m.add(cyl(P(0, mf - 1.6, 1.85), F, 0.055, 3.4, segs=8, sw=ALU), tag='boom')
    m.add(sail((P(0, mf - 0.08, 1.95), P(0, mf - 0.10, 10.45), P(0, mf - 3.25, 1.95)), 0.03, SAILW, rows=5,
               belly=0.22, side=X), tag='sails')
    m.add(sail((P(0, 3.95, 1.20), P(0, mf + 0.10, 9.4), P(0, mf + 0.25, 1.40)), 0.03, SAILC, rows=4,
               belly=-0.20, side=X), tag='sails')
    # keel + rudder (under water)
    m.add(box_f(0, 0.3, -0.85, 0.14, 1.2, 0.80, r=0.05, segs=1, sw=RED), tag='keel')
    m.add(box_f(0, -3.75, -0.45, 0.08, 0.45, 0.70, r=0.03, segs=1, sw=RED), tag='keel')
    # pulpit rails
    for side in (1,):
        pts = [P(1.12, -3.6, 0.60), P(1.28, -1.0, 0.95), P(1.20, 2.0, 0.98), P(0.35, 4.05, 0.92)]
    return m

def build_boat_small():
    m = Model('boat_small')
    HULL = S('#2f8fd8', 8)
    TOPB = S('#ffffff', 8)
    STRIPE = S('#ffcf3a', 8)
    BOT = S('#c9483e', 0)
    DECK = S('#d8b07d', 0)
    WHITE = S('#f7f7f4', 8)
    ROOF = S('#ff6b4a', 8)
    L = 6.0
    cols = dict(top=TOPB, upper=HULL, boot=STRIPE, water=HULL, below=BOT, transom=HULL, deck=DECK)
    bm, deck, rings = hull(L, 2.3, 0.78, -0.42, cols, bow_rise=0.34, transom=0.86, n=15, stripe=0.10)
    m.add(bm, tag='hull')
    m.add(deck, tag='deck')
    # wheelhouse
    wf, wz = 0.25, 0.80
    house = rbox(P(0, wf, wz + 0.72), (1.36, 1.40, 1.44), r=0.12, segs=2, sw=WHITE)
    surf = Surf(house)
    m.add(house, tag='house')
    m.add(box_f(0, wf - 0.05, wz + 1.50, 1.62, 1.75, 0.14, r=0.06, segs=1, sw=ROOF), tag='house')
    m.add(decal_quads(surf, [(-0.50, wz + 0.86, 0.50, wz + 1.26)], GLASS, 'f', off=0.008, sub=2), tag='house')
    m.add(decal_quads(surf, [(wf - 0.45, wz + 0.86, wf + 0.40, wz + 1.26)], GLASS, 'xp', off=0.008, sub=2),
          mirror=True, tag='house')
    m.add(decal_quads(surf, [(-0.30, wz + 0.10, 0.30, wz + 1.26)], S('#c46a3a', 0), 'b', off=0.008, sub=2), tag='house')
    # mast with lamp, life ring, crates, buoys
    m.add(cyl(P(0, wf + 0.2, wz + 2.15), Z, 0.04, 1.20, segs=6, sw=S('#d5dae1', 5)), tag='mast')
    m.add(cyl(P(0, wf + 0.2, wz + 2.78), Z, 0.07, 0.12, segs=8, sw=S('#fff4d6', 3)), tag='mast')
    ring_ = lathe([(0.20, -0.04), (0.24, 0.0), (0.20, 0.04), (0.16, 0.0)], P(0.70, wf, wz + 0.80), X, 10,
                  [S('#ff7a2e', 0)], angle=60)
    for e in ring_.edges:
        pass
    m.add(lathe_torus(P(0.69, wf - 0.05, wz + 0.78), X, 0.20, 0.05, 10, 4, S('#ff7a2e', 0)), mirror=True, tag='ring')
    ring_.free()
    CR = S('#c99456', 0)
    m.add(box_f(0.45, -2.05, 1.00, 0.55, 0.55, 0.45, r=0.03, segs=1, sw=CR), tag='cargo')
    m.add(box_f(-0.40, -1.95, 1.00, 0.55, 0.55, 0.45, r=0.03, segs=1, sw=S('#5aa7d6', 0)), tag='cargo')
    m.add(box_f(0.05, -2.05, 1.45, 0.55, 0.55, 0.45, r=0.03, segs=1, sw=CR, yaw=12), tag='cargo')
    for f in (-1.4, 1.0):
        t = (f + 3.0) / 6.0
        hw = 2.3 / 2 * lerp(0.86, 1.0, smooth01(t / 0.45)) * math.cos(smooth01((t - 0.55) / 0.45) * math.pi / 2) ** 0.8
        m.add(cyl(P(hw + 0.08, f, 0.40), Z, 0.10, 0.36, segs=8, sw=S('#ff5a4a', 0)), mirror=True, tag='fenders')
    # outboard-ish rudder/engine block at the stern
    m.add(box_f(0, -2.92, 0.62, 0.36, 0.26, 0.56, r=0.06, segs=1, sw=S('#3a3d45', 0)), tag='engine')
    return m

def lathe_torus(center, axis, R, r, segs, rsegs, sw):
    prof = []
    for k in range(rsegs):
        a = 2 * math.pi * k / rsegs
        prof.append((R + r * math.cos(a), r * math.sin(a)))
    ax, u, v = frame_from_axis(axis)
    bm = bmesh.new()
    rows = []
    for rr, aa in prof:
        rows.append([bm.verts.new(center + ax * aa + (u * math.cos(2 * math.pi * i / segs) + v * math.sin(2 * math.pi * i / segs)) * rr)
                     for i in range(segs)])
    for k in range(rsegs):
        A, B = rows[k], rows[(k + 1) % rsegs]
        for i in range(segs):
            j = (i + 1) % segs
            fc = bm.faces.new((A[i], A[j], B[j], B[i]))
            fc.material_index = sw
            fc.smooth = True
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    return bm

BUILDERS = {
    'sedan': build_sedan, 'taxi': build_taxi, 'hatchback-sports': build_hatch, 'compact': build_compact,
    'suv': build_suv, 'van': build_van, 'sedan-sports': build_sports, 'suv-luxury': lambda: build_suv(True),
    'police': build_police, 'delivery': build_delivery, 'truck': build_truck, 'garbage-truck': build_garbage,
    'ambulance': build_ambulance,
    'train_head': build_train_head, 'train_mid': build_train_mid, 'sailboat': build_sailboat, 'boat_small': build_boat_small,
}

# ------------------------------------------------------------------------------------------------
# export
# ------------------------------------------------------------------------------------------------
def read_glb(path):
    d = open(path, 'rb').read()
    clen, ctype = struct.unpack('<II', d[12:20])
    j = json.loads(d[20:20 + clen])
    return j, d[20 + clen:]

def write_glb(path, j, rest):
    js = json.dumps(j, separators=(',', ':')).encode('utf8')
    js += b' ' * ((4 - len(js) % 4) % 4)
    total = 12 + 8 + len(js) + len(rest)
    with open(path, 'wb') as fh:
        fh.write(struct.pack('<III', 0x46546C67, 2, total))
        fh.write(struct.pack('<II', len(js), 0x4E4F534A))
        fh.write(js)
        fh.write(rest)

def patch_glb(path):
    j, rest = read_glb(path)
    j.setdefault('asset', {})['extras'] = {
        'source': 'tools/blender/cars.py', 'units': 'metres', 'front': '+Z', 'origin': 'ground, footprint centre',
        'material_id': 'UV0 u = (id + 0.5) / 16: 0 matte 1 paint 2 glass 3 head 4 tail 5 chrome 6 rubber 8 gloss 10 emissive',
        'boats': 'y = 0 is the waterline'}
    write_glb(path, j, rest)

def main():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    col = bpy.context.scene.collection
    names = ONLY or list(BUILDERS.keys())
    stats = {}
    for name in names:
        m = BUILDERS[name]()
        ob = m.build(col, center=True)
        ob.data.calc_loop_triangles()
        tris = len(ob.data.loop_triangles)
        bb = [ob.matrix_world @ Vector(c) for c in ob.bound_box]
        mn = Vector((min(v.x for v in bb), min(v.y for v in bb), min(v.z for v in bb)))
        mx = Vector((max(v.x for v in bb), max(v.y for v in bb), max(v.z for v in bb)))
        size = mx - mn
        stats[name] = dict(tris=tris, size=[round(size.x, 3), round(size.y, 3), round(size.z, 3)], parts=m.parts)
        print(f'STAT {name:15s} tris={tris:5d}  W={size.x:.2f} L={size.y:.2f} H={size.z:.2f}  zmin={mn.z:.3f}  '
              + ' '.join(f'{k}:{v}' for k, v in sorted(m.parts.items(), key=lambda kv: -kv[1])))
    if BLEND:
        bpy.ops.wm.save_as_mainfile(filepath=BLEND)
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    bpy.ops.export_scene.gltf(filepath=OUT, export_format='GLB', use_selection=False, export_apply=True,
                              export_extras=False, export_yup=True, export_texcoords=True, export_normals=True,
                              export_vertex_color='ACTIVE', export_all_vertex_colors=False,
                              export_animations=False, export_cameras=False, export_lights=False,
                              export_draco_mesh_compression_enable=DRACO, export_draco_mesh_compression_level=10,
                              export_draco_position_quantization=14, export_draco_normal_quantization=10,
                              export_draco_texcoord_quantization=12, export_draco_color_quantization=10)
    patch_glb(OUT)
    print('WROTE', OUT, os.path.getsize(OUT))
    if REPORT:
        json.dump(stats, open(REPORT, 'w'), indent=1)

if __name__ == '__main__':
    main()

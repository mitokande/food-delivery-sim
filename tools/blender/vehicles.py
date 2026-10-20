"""Food Delivery Simulator - player vehicles + courier helmet (Blender 5.2, headless, procedural).

    blender -b --factory-startup -P tools/blender/vehicles.py -- [--out assets/models/vehicles.glb]
            [--only vespetta,helmet] [--blend /tmp/x.blend] [--nodraco]

Builds six vehicles and the courier helmet from code (no image textures, flat-colour Principled
materials), exports one Draco GLB and then patches the GLB JSON so that
  * every vehicle part node carries its exact game name (`wheel_front`, `steer`, `seat`, ...) even
    though Blender needs unique object names (objects are called `part@vehicle` while building),
  * per-vehicle materials are called exactly `paint` / `box` (Blender: `paint@vespetta`, ...),
  * each part node also gets glTF extras {"part": "<name>"} -> three.js `userData.part`
    (GLTFLoader de-duplicates repeated node names to `wheel_front_1`, `wheel_front_2`, ...).

Conventions (glTF / three.js): metres, +Y up, vehicle front = +Z, origin on the ground midway
between the axles, centred in X.  Blender while building: front = -Y, so helper P(x, f, z)
takes f = forward distance and returns Vector((x, -f, z)).

Rider: Kenney mini character scaled x2.2 playing `drive`.  The `seat` empty is where that
character's root node goes (no rotation).  Rider-relative anchor numbers below (RIDER_*) were
measured from character-male-a.glb (`drive`, frame 0, x2.2) - see CREDITS-vehicles.md.
"""
import bpy, bmesh, math, os, sys, json, struct, random
from mathutils import Vector, Matrix, Euler

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
def _arg(name, default=None):
    if name in argv:
        return argv[argv.index(name) + 1]
    return default
OUT = os.path.abspath(_arg('--out', os.path.join(ROOT, 'assets', 'models', 'vehicles.glb')))
ONLY = [s for s in (_arg('--only', '') or '').split(',') if s]
BLEND = _arg('--blend')
DRACO = '--nodraco' not in argv
REPORT = _arg('--report')
TRI_DEBUG = {} if '--tridebug' in argv else None

# ----------------------------------------------------------------------------------------------
# axes / small helpers
# ----------------------------------------------------------------------------------------------
X = Vector((1, 0, 0))
F = Vector((0, -1, 0))   # forward (glTF +Z)
Z = Vector((0, 0, 1))

def P(x, f, z):
    return Vector((x, -f, z))

def lerp(a, b, t):
    return a + (b - a) * t

def smoothstep(t):
    t = max(0.0, min(1.0, t))
    return t * t * (3 - 2 * t)

# ----------------------------------------------------------------------------------------------
# colours / materials
# ----------------------------------------------------------------------------------------------
def srgb(h):
    h = h.lstrip('#')
    c = [int(h[i:i + 2], 16) / 255.0 for i in (0, 2, 4)]
    return tuple(((v / 12.92) if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4) for v in c) + (1.0,)

MATDEF = {
    # shared materials (one instance in the GLB)
    'trim':       dict(col='#d7dbe6', rough=0.28, metal=0.55),   # chrome-ish trim (also helmet trim)
    'metal':      dict(col='#a0a8c9', rough=0.55, metal=0.25),   # Kenney light grey-blue parts
    'rubber':     dict(col='#38383d', rough=0.85),               # Kenney tyre dark
    'plastic':    dict(col='#4f5260', rough=0.70),               # dark grey plastic panels
    'seat_black': dict(col='#2e2d33', rough=0.62),
    'seat_brown': dict(col='#6b4532', rough=0.60),
    'light':      dict(col='#fff6dc', rough=0.25, emit='#fff1c8', estr=2.0),
    'light_red':  dict(col='#ff4a3d', rough=0.30, emit='#ff2a1f', estr=2.0),
    'light_teal': dict(col='#5ef2e0', rough=0.30, emit='#32e8d2', estr=2.5),
    'light_amber':dict(col='#ffb22e', rough=0.30, emit='#ff9a10', estr=1.5),
    'rust':       dict(col='#a5532d', rough=0.90),
    'cardboard':  dict(col='#e2c08a', rough=0.85),               # packing tape / rope / flap edges
    'emblem':     dict(col='#ffffff', rough=0.50),
    'visor':      dict(col='#22252f', rough=0.12, metal=0.10),
    'helmet_paint': dict(col='#de433e', rough=0.40),
}
# per-vehicle recolourable defaults
PAINT = {
    'rustbucket': '#8fcfb5',  # faded mint
    'zippy':      '#eef0f2',  # white plastic
    'vespetta':   '#de433e',  # Kenney red
    'volt':       '#f4f6f8',  # white
    'mule':       '#41557a',  # workhorse slate blue
    'viper':      '#46b33a',  # sport green
}
BOXCOL = {
    'rustbucket': '#c4925a',  # cardboard
    'zippy':      '#c9655a',  # faded red
    'vespetta':   '#d23c37',  # red
    'volt':       '#3f86d6',  # insulated blue
    'mule':       '#ff7e44',  # Kenney orange
    'viper':      '#2f3036',  # sporty black
}
PAINT_ROUGH = {'rustbucket': 0.75, 'zippy': 0.45, 'vespetta': 0.35, 'volt': 0.38, 'mule': 0.55, 'viper': 0.32}

_MATS = {}
def make_mat(name, col, rough=0.6, metal=0.0, emit=None, estr=1.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = srgb(col)
    b.inputs['Roughness'].default_value = rough
    b.inputs['Metallic'].default_value = metal
    if emit:
        b.inputs['Emission Color'].default_value = srgb(emit)
        b.inputs['Emission Strength'].default_value = estr
    m.diffuse_color = srgb(col)
    return m

def mat(key, vid=None):
    """material by logical key; 'paint' and 'box' are per vehicle (name 'paint@vid')."""
    if key in ('paint', 'box'):
        name = f'{key}@{vid}'
        if name not in _MATS:
            col = PAINT[vid] if key == 'paint' else BOXCOL[vid]
            rough = PAINT_ROUGH.get(vid, 0.5) if key == 'paint' else (0.8 if vid == 'rustbucket' else 0.55)
            _MATS[name] = make_mat(name, col, rough=rough)
        return _MATS[name]
    if key not in _MATS:
        d = MATDEF[key]
        _MATS[key] = make_mat(key, d['col'], d.get('rough', 0.6), d.get('metal', 0.0), d.get('emit'), d.get('estr', 1.0))
    return _MATS[key]

# ----------------------------------------------------------------------------------------------
# bmesh primitives (each returns a fresh BMesh with smooth / sharp flags set)
# ----------------------------------------------------------------------------------------------
def shade(bm, mode='auto', angle=40.0):
    """flat | smooth | auto (smooth faces, sharp edges above `angle` degrees)."""
    lim = math.radians(angle)
    for f in bm.faces:
        f.smooth = mode != 'flat'
    if mode == 'auto':
        bm.normal_update()
        for e in bm.edges:
            if len(e.link_faces) == 2:
                try:
                    a = e.calc_face_angle()
                except ValueError:
                    a = 0
                e.smooth = a < lim
            else:
                e.smooth = False
    elif mode == 'smooth':
        for e in bm.edges:
            e.smooth = True
    return bm

def recalc(bm):
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    return bm

def xform(bm, m):
    bmesh.ops.transform(bm, matrix=m, verts=bm.verts[:])
    return bm

def deform(bm, fn):
    for v in bm.verts:
        v.co = fn(v.co.copy())
    return bm

def se(t, n):
    c, s = math.cos(t), math.sin(t)
    p = 2.0 / n
    return math.copysign(abs(c) ** p, c), math.copysign(abs(s) ** p, s)

def ring(center, u, v, a, b, n=4.0, npts=16, phase=-math.pi / 2):
    out = []
    for i in range(npts):
        cu, sv = se(phase + 2 * math.pi * i / npts, n)
        out.append(center + u * (a * cu) + v * (b * sv))
    return out

def bm_loft(rings, cap0=True, cap1=True, mode='auto', angle=50):
    bm = bmesh.new()
    rows = []
    for r in rings:
        if isinstance(r, Vector):
            rows.append([bm.verts.new(r)])
        else:
            rows.append([bm.verts.new(p) for p in r])
    n = max(len(r) for r in rows)
    for A, B in zip(rows[:-1], rows[1:]):
        if len(A) == 1 and len(B) == 1:
            continue
        for i in range(n):
            j = (i + 1) % n
            if len(A) == 1:
                bm.faces.new((A[0], B[j], B[i]))
            elif len(B) == 1:
                bm.faces.new((A[i], A[j], B[0]))
            else:
                bm.faces.new((A[i], A[j], B[j], B[i]))
    if cap0 and len(rows[0]) > 2:
        bm.faces.new(list(reversed(rows[0])))
    if cap1 and len(rows[-1]) > 2:
        bm.faces.new(rows[-1])
    recalc(bm)
    return shade(bm, mode, angle)

def loft_f(stations, npts=16, cap0=True, cap1=True, x0=0.0, mode='auto', angle=50):
    """loft along forward axis. station = (f, half_width, z_bottom, z_top, squareness)"""
    rings = []
    for st in stations:
        f, hw, zb, zt, n = st[:5]
        rings.append(ring(P(x0, f, (zb + zt) / 2), X, Z, hw, (zt - zb) / 2, n, npts))
    return bm_loft(rings, cap0, cap1, mode, angle)

def loft_z(stations, npts=16, cap0=True, cap1=True, mode='auto', angle=50):
    """loft along up axis. station = (z, half_width, f_back, f_front, squareness[, x_center])"""
    rings = []
    for st in stations:
        z, hw, fb, ff, n = st[:5]
        xc = st[5] if len(st) > 5 else 0.0
        rings.append(ring(P(xc, (fb + ff) / 2, z), X, F, hw, (ff - fb) / 2, n, npts, phase=0.0))
    return bm_loft(rings, cap0, cap1, mode, angle)

def loft_x(stations, npts=16, cap0=True, cap1=True, mode='auto', angle=50):
    """loft along side axis. station = (x, half_f, z_bottom, z_top, squareness, f_center)"""
    rings = []
    for st in stations:
        x, hf, zb, zt, n, fc = st
        rings.append(ring(P(x, fc, (zb + zt) / 2), F, Z, hf, (zt - zb) / 2, n, npts))
    return bm_loft(rings, cap0, cap1, mode, angle)

def bm_box(c, size, bevel=0.0, segs=2, rot=None, mode=None):
    """box centred at Vector c with full size (sx, sy, sz) in BLENDER axes; rounded edges."""
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.scale(bm, vec=Vector(size), verts=bm.verts[:])
    if bevel > 0:
        res = bmesh.ops.bevel(bm, geom=bm.edges[:], offset=bevel, offset_type='OFFSET', segments=segs,
                              profile=0.5, affect='EDGES', clamp_overlap=True)
        bev = set(res['faces'])
        if segs == 1 or mode == 'flat':
            shade(bm, 'flat')
        else:
            for f in bm.faces:
                f.smooth = True
            for e in bm.edges:
                lf = e.link_faces
                e.smooth = not (len(lf) == 2 and ((lf[0] in bev) != (lf[1] in bev)))
    else:
        shade(bm, 'flat')
    if rot is not None:
        xform(bm, rot.to_matrix().to_4x4() if hasattr(rot, 'to_matrix') else rot)
    bmesh.ops.translate(bm, vec=Vector(c), verts=bm.verts[:])
    return bm

def box_f(x, f, z, sx, sf, sz, bevel=0.0, segs=2, rx=0.0, ry=0.0, rz=0.0, mode=None):
    """box with centre given as (x, forward, up) and sizes (x, forward, up); rotations in degrees
    about X (pitch, + = nose up), Y(forward axis roll) and Z (yaw, + = turn left)."""
    rot = None
    if rx or ry or rz:
        rot = (Matrix.Rotation(math.radians(rz), 4, 'Z') @ Matrix.Rotation(math.radians(-ry), 4, 'Y')
               @ Matrix.Rotation(math.radians(rx), 4, 'X'))
    return bm_box(P(x, f, z), (sx, sf, sz), bevel, segs, rot, mode)

def frame_from_axis(ax):
    ax = Vector(ax).normalized()
    ref = Z if abs(ax.dot(Z)) < 0.9 else X
    u = ax.cross(ref).normalized()
    v = ax.cross(u).normalized()
    return ax, u, v

def bm_lathe(profile, center, axis, segs=16, closed=False, mode='auto', angle=40, phase=0.0, seg_mats=None):
    """revolve profile [(radius, axial)] around axis through center. seg_mats[k] = material index
    of the band between profile points k and k+1."""
    ax, u, v = frame_from_axis(axis)
    bm = bmesh.new()
    rows = []
    for r, a in profile:
        if r < 1e-6:
            rows.append([bm.verts.new(center + ax * a)])
        else:
            rows.append([bm.verts.new(center + ax * a + (u * math.cos(phase + 2 * math.pi * i / segs)
                                                         + v * math.sin(phase + 2 * math.pi * i / segs)) * r)
                         for i in range(segs)])
    pairs = list(zip(rows[:-1], rows[1:]))
    if closed:
        pairs.append((rows[-1], rows[0]))
    for k, (A, B) in enumerate(pairs):
        if len(A) == 1 and len(B) == 1:
            continue
        for i in range(segs):
            j = (i + 1) % segs
            if len(A) == 1:
                fc = bm.faces.new((A[0], B[j], B[i]))
            elif len(B) == 1:
                fc = bm.faces.new((A[i], A[j], B[0]))
            else:
                fc = bm.faces.new((A[i], A[j], B[j], B[i]))
            if seg_mats:
                fc.material_index = seg_mats[min(k, len(seg_mats) - 1)]
    recalc(bm)
    return shade(bm, mode, angle)

def bm_cyl(center, axis, r, length, segs=12, bevel=0.0, mode='auto', r2=None):
    r2 = r if r2 is None else r2
    h = length / 2
    if bevel > 0:
        prof = [(0, -h), (r - bevel, -h), (r, -h + bevel), (r2, h - bevel), (r2 - bevel, h), (0, h)]
    else:
        prof = [(0, -h), (r, -h), (r2, h), (0, h)]
    return bm_lathe(prof, center, axis, segs, mode=mode, angle=40)

def round_path(pts, rad, segs=3):
    """replace interior corners of a polyline with quadratic-bezier fillets."""
    pts = [Vector(p) for p in pts]
    if len(pts) < 3:
        return pts
    out = [pts[0]]
    for i in range(1, len(pts) - 1):
        a, b, c = pts[i - 1], pts[i], pts[i + 1]
        d1 = min(rad, (b - a).length * 0.5)
        d2 = min(rad, (c - b).length * 0.5)
        p0 = b + (a - b).normalized() * d1
        p2 = b + (c - b).normalized() * d2
        for k in range(segs + 1):
            t = k / segs
            out.append((1 - t) ** 2 * p0 + 2 * (1 - t) * t * b + t * t * p2)
    out.append(pts[-1])
    return out

def bm_tube(pts, r, sides=8, cap=True, mode='auto', angle=50, rscale=None):
    pts = [Vector(p) for p in pts]
    T = []
    for i in range(len(pts)):
        if i == 0:
            t = pts[1] - pts[0]
        elif i == len(pts) - 1:
            t = pts[-1] - pts[-2]
        else:
            t = (pts[i + 1] - pts[i]).normalized() + (pts[i] - pts[i - 1]).normalized()
        T.append(t.normalized())
    ref = Z if abs(T[0].dot(Z)) < 0.9 else X
    N = T[0].cross(ref).normalized()
    rings = []
    for i, p in enumerate(pts):
        if i > 0:
            q = T[i - 1].rotation_difference(T[i])
            N = (q @ N).normalized()
        B = T[i].cross(N).normalized()
        rr = r * (rscale[i] if rscale else 1.0)
        rings.append([p + (N * math.cos(2 * math.pi * k / sides) + B * math.sin(2 * math.pi * k / sides)) * rr
                      for k in range(sides)])
    return bm_loft(rings, cap, cap, mode, angle)

def bm_prism(poly, origin, u, v, n, depth, mode='flat'):
    """extrude 2D polygon [(a, b)] (plane origin + u*a + v*b) along n by depth."""
    bm = bmesh.new()
    bot = [bm.verts.new(origin + u * a + v * b) for a, b in poly]
    top = [bm.verts.new(origin + u * a + v * b + n * depth) for a, b in poly]
    bm.faces.new(bot)
    bm.faces.new(list(reversed(top)))
    k = len(poly)
    for i in range(k):
        j = (i + 1) % k
        bm.faces.new((bot[i], bot[j], top[j], top[i]))
    recalc(bm)
    return shade(bm, mode)

def side_profile(pts_fz, x0, x1, bevel=0.0, segs=1, mode='flat'):
    """polygon in the (forward, up) plane extruded from x0 to x1, optional bevel."""
    bm = bm_prism([(f, z) for f, z in pts_fz], P(x0, 0, 0), F, Z, X, x1 - x0, mode='flat')
    if bevel > 0:
        res = bmesh.ops.bevel(bm, geom=bm.edges[:], offset=bevel, segments=segs, profile=0.5,
                              affect='EDGES', clamp_overlap=True)
        if segs > 1 and mode != 'flat':
            bev = set(res['faces'])
            for f in bm.faces:
                f.smooth = True
            for e in bm.edges:
                lf = e.link_faces
                e.smooth = not (len(lf) == 2 and ((lf[0] in bev) != (lf[1] in bev)))
        else:
            shade(bm, 'flat')
    return bm

def bm_blob(c, rx, rf, rz, n=2.5, nu=12, nv=7, mode='smooth'):
    """superellipsoid centred at c (Vector) with radii along x, forward, up."""
    rings = [c + Z * (-rz)]
    for j in range(1, nv):
        t = -math.pi / 2 + math.pi * j / nv
        cz, sz = se(t, n)[0], se(t, n)[1]
        rings.append(ring(c + Z * (rz * sz), X, F, rx * cz, rf * cz, n, nu, phase=0.0))
    rings.append(c + Z * rz)
    return bm_loft(rings, False, False, mode)

def merge(*bms):
    out = bmesh.new()
    for b in bms:
        _append(out, b, None)
        b.free()
    return out

def _append(dst, src, idx):
    vmap = {}
    for v in src.verts:
        vmap[v] = dst.verts.new(v.co)
    for f in src.faces:
        try:
            nf = dst.faces.new([vmap[v] for v in f.verts])
        except ValueError:
            continue
        nf.material_index = f.material_index if idx is None else idx
        nf.smooth = f.smooth
    dst.edges.ensure_lookup_table()
    for e in src.edges:
        if not e.smooth:
            ne = dst.edges.get([vmap[e.verts[0]], vmap[e.verts[1]]])
            if ne is not None:
                ne.smooth = False

def mirror_x(bm):
    b2 = bm.copy()
    bmesh.ops.scale(b2, vec=(-1, 1, 1), verts=b2.verts[:])
    bmesh.ops.reverse_faces(b2, faces=b2.faces[:])
    return b2

# ----------------------------------------------------------------------------------------------
# parts = one mesh object each, material slots by logical key
# ----------------------------------------------------------------------------------------------
class Part:
    def __init__(self, vid):
        self.vid = vid
        self.bm = bmesh.new()
        self.keys = []

    def add(self, src, key, mirror=False):
        """add BMesh src with material `key` (or list of keys indexed by face.material_index)."""
        if isinstance(key, (list, tuple)):
            idxmap = [self._slot(k) for k in key]
            for f in src.faces:
                f.material_index = idxmap[min(f.material_index, len(idxmap) - 1)]
            idx = None
        else:
            idx = self._slot(key)
        if TRI_DEBUG is not None:
            import inspect
            fr = inspect.stack()[1]
            k = (self.vid, fr.lineno, fr.code_context[0].strip()[:60] if fr.code_context else '')
            TRI_DEBUG[k] = TRI_DEBUG.get(k, 0) + sum(len(f.verts) - 2 for f in src.faces) * (2 if mirror else 1)
        _append(self.bm, src, idx)
        if mirror:
            m = mirror_x(src)
            _append(self.bm, m, idx)
            m.free()
        src.free()

    def _slot(self, key):
        if key not in self.keys:
            self.keys.append(key)
        return self.keys.index(key)

    def build(self, name, collection, origin=None, matrix=None):
        """make a mesh object; geometry is authored in vehicle space and re-expressed relative to
        `matrix` (object world matrix) or a plain `origin` translation."""
        me = bpy.data.meshes.new(name.replace('@', '_') + '_mesh')
        bm = self.bm
        if matrix is None:
            matrix = Matrix.Translation(origin if origin is not None else Vector())
        bmesh.ops.transform(bm, matrix=matrix.inverted(), verts=bm.verts[:])
        bm.to_mesh(me)
        for k in self.keys:
            me.materials.append(mat(k, self.vid))
        ob = bpy.data.objects.new(name, me)
        collection.objects.link(ob)
        ob.matrix_world = matrix
        return ob

    def tris(self):
        return sum(len(f.verts) - 2 for f in self.bm.faces)


def decal(part, key, center, normal, radius, seed, npts=9, depth=0.004, jag=0.35, up=None, stretch=1.0):
    """irregular blob patch hugging a surface (rust spots, scuffs)."""
    rnd = random.Random(seed)
    n = Vector(normal).normalized()
    upv = up if up is not None else (Z if abs(n.dot(Z)) < 0.9 else X)
    u = n.cross(upv).normalized()
    v = n.cross(u).normalized()
    rot = rnd.random() * math.pi
    u, v = u * math.cos(rot) + v * math.sin(rot), v * math.cos(rot) - u * math.sin(rot)
    # lumpy outline: two low-frequency wobbles + jitter, never self-intersecting (star-shaped)
    p1, p2 = rnd.random() * 6.28, rnd.random() * 6.28
    k1, k2 = rnd.choice((2, 3)), rnd.choice((4, 5))
    poly = []
    for i in range(npts):
        a = 2 * math.pi * i / npts
        rr = radius * (1 + 0.28 * math.sin(k1 * a + p1) + 0.16 * math.sin(k2 * a + p2) + jag * 0.5 * (rnd.random() - 0.5))
        poly.append((math.cos(a) * rr * stretch, math.sin(a) * rr))
    bm = bm_prism(poly, Vector(center) - n * 0.002, u, v, n, depth)
    bm.normal_update()
    for f in list(bm.faces):          # bottom cap sits against the surface: drop it
        if len(f.verts) > 4 and f.normal.dot(n) < -0.5:
            bm.faces.remove(f)
    part.add(bm, key)

def surface(bm, origin, direction):
    """ray-cast onto a BMesh -> (hit point, normal) or (None, None)."""
    from mathutils.bvhtree import BVHTree
    bm.normal_update()
    tree = BVHTree.FromBMesh(bm)
    hit, nrm, idx, dist = tree.ray_cast(Vector(origin), Vector(direction).normalized())
    return hit, nrm

def rust_spot(part, origin, direction, radius, seed, key='rust', target=None, stretch=1.0):
    """drop an irregular patch where a ray from origin hits the part (or target BMesh)."""
    hit, nrm = surface(target if target is not None else part.bm, origin, direction)
    if hit is None:
        return False
    decal(part, key, hit, nrm, radius, seed, npts=10, depth=0.007, stretch=stretch)
    return True

# ----------------------------------------------------------------------------------------------
# rider anchors (character-male-a, `drive` frame 0, scale 2.2) relative to the character root
# (x = lateral, f = forward, z = up).  measured in tools/blender (see report)
# ----------------------------------------------------------------------------------------------
RIDER_GRIP = (0.40, 0.50, 0.31)      # fist centre: |x|, forward, up  (arm block x 0.24..0.48)
RIDER_GRIP_SPAN = (0.20, 0.56)        # bar must run at least through x = 0.24..0.50
RIDER_SEAT_DZ = -0.135                # cushion top relative to root (pants bottom at -0.156)
RIDER_SOLE_F = 0.39                   # sole plane front (toe top) forward of root
RIDER_HEEL = (0.275, -0.20)           # heel bottom (forward, up) relative to root
RIDER_BACK_F = -0.38                  # torso / head back
RIDER_HEAD_BOTTOM = 0.425

# ----------------------------------------------------------------------------------------------
# shared components
# ----------------------------------------------------------------------------------------------
def tyre(r, w, hub_key='metal', cap_key='trim', segs=14, rim_frac=0.62, style='disc'):
    """wheel centred at origin, axle along X. material indices 0 = rubber, 1 = hub_key, 2 = cap_key."""
    ri = r * rim_frac
    c = r * 0.30          # tyre shoulder roundness
    hw = w / 2
    prof = [(ri, -hw * 0.78), (r - c, -hw), (r - c * 0.2, -hw * 0.62), (r, 0.0),
            (r - c * 0.2, hw * 0.62), (r - c, hw), (ri, hw * 0.78)]
    t = bm_lathe(prof, Vector(), X, segs, closed=True, mode='auto', angle=60, phase=math.pi / 2)  # vertex on the ground
    for f in t.faces:
        f.material_index = 0
    hd = hw * 0.62
    if style == 'disc':      # flat disc + domed cap
        hp = [(0, -hd - 0.014), (ri * 0.30, -hd - 0.012), (ri * 0.40, -hd), (ri * 1.02, -hd * 0.78),
              (ri * 1.02, hd * 0.78), (ri * 0.40, hd), (ri * 0.30, hd + 0.012), (0, hd + 0.014)]
    else:                    # deep dish: rim lip stands proud, hub recessed
        hp = [(0, -hd * 0.55 - 0.016), (ri * 0.34, -hd * 0.55 - 0.010), (ri * 0.42, -hd * 0.55),
              (ri * 1.02, -hd * 0.98), (ri * 1.02, hd * 0.98),
              (ri * 0.42, hd * 0.55), (ri * 0.34, hd * 0.55 + 0.010), (0, hd * 0.55 + 0.016)]
    n = len(hp)
    sm = [2, 2] + [1] * (n - 5) + [2, 2]
    h = bm_lathe(hp, Vector(), X, max(10, segs - 2), mode='auto', angle=35, seg_mats=sm)
    return merge(t, h)

def emblem_polys():
    """fork + knife (crossed) in unit space ~[-0.5,0.5]^2, returns list of polygons."""
    knife = [(-0.045, -0.50), (0.045, -0.50), (0.05, -0.08), (0.03, -0.05), (0.03, 0.42), (-0.02, 0.50),
             (-0.075, 0.38), (-0.075, 0.06), (-0.04, -0.05), (-0.05, -0.08)]
    fork = [(-0.04, -0.50), (0.04, -0.50), (0.045, -0.02), (0.115, 0.10), (0.12, 0.50), (0.075, 0.50),
            (0.07, 0.22), (0.025, 0.22), (0.025, 0.50), (-0.025, 0.50), (-0.025, 0.22), (-0.07, 0.22),
            (-0.075, 0.50), (-0.12, 0.50), (-0.115, 0.10), (-0.045, -0.02)]
    def rot(poly, deg):
        a = math.radians(deg)
        return [(x * math.cos(a) - y * math.sin(a), x * math.sin(a) + y * math.cos(a)) for x, y in poly]
    return [rot(knife, -38), rot(fork, 38)]

def bm_decal(poly, origin, u, v, n, lift):
    """single n-gon (top cap only) floating `lift` above a surface - cheap printed emblem."""
    bm = bmesh.new()
    vs = [bm.verts.new(origin + u * a + v * b + n * lift) for a, b in poly]
    f = bm.faces.new(vs)
    bm.normal_update()
    if f.normal.dot(n) < 0:
        f.normal_flip()
    return shade(bm, 'flat')

def add_emblem(part, center, normal, up, size, key='emblem', lift=0.004):
    n = Vector(normal).normalized()
    v = Vector(up).normalized()
    u = v.cross(n).normalized()
    for i, poly in enumerate(emblem_polys()):
        pp = [(a * size, b * size) for a, b in poly]
        part.add(bm_decal(pp, Vector(center), u, v, n, lift + 0.0015 * i), key)

def delivery_box(veh, f0, f1, z0, w, h, key='box', bevel=0.035, lid_h=0.07, emblem=True, emblem_sides=True,
                 emblem_size=None, trim_key=None, latch=True, latch_key='metal', emblem_key='emblem', segs=2):
    """box from forward f0 (front) back to f1 (f1 < f0), bottom z0, width w, height h.
    builds parts 'box' (origin bottom centre) and 'box_lid' (origin on the back top hinge)."""
    fc = (f0 + f1) / 2
    d = f0 - f1
    bx, lid = veh.part('box'), veh.part('box_lid')
    body_h = h - lid_h
    bx.add(box_f(0, fc, z0 + body_h / 2, w, d, body_h, bevel=bevel, segs=segs), key)
    lid.add(box_f(0, fc, z0 + body_h + lid_h / 2 + 0.003, w + 0.012, d + 0.012, lid_h, bevel=min(bevel, lid_h * 0.45), segs=segs), key)
    if trim_key:
        # seam band under the lid
        bx.add(box_f(0, fc, z0 + body_h - 0.012, w + 0.008, d + 0.008, 0.022, bevel=0.008, segs=1), trim_key)
    if latch:
        lid.add(box_f(0, f0 + 0.008, z0 + body_h + 0.005, 0.07, 0.02, 0.05), latch_key)
    if emblem:
        es = emblem_size or min(w, body_h) * 0.72
        add_emblem(bx, P(0, f1, z0 + body_h * 0.52), -F, Z, es, key=emblem_key)
        if emblem_sides:
            es2 = min(d, body_h) * 0.72
            add_emblem(bx, P(w / 2, fc, z0 + body_h * 0.52), X, Z, es2, key=emblem_key)
            add_emblem(bx, P(-w / 2, fc, z0 + body_h * 0.52), -X, Z, es2, key=emblem_key)
    veh.box_origin = P(0, fc, z0)
    veh.lid_origin = P(0, f1 - 0.006, z0 + body_h + 0.003)
    veh.box_dims = (w, d, h)

def mirror_head(c, rx=0.075, rz=0.05, rf=0.022):
    return bm_blob(c, rx, rf, rz, n=2.6, nu=8, nv=4)

def grip_bar(part, x_in, x_out, f, z, r=0.034, key='rubber'):
    for s in (-1, 1):
        part.add(bm_cyl(P(s * (x_in + x_out) / 2, f, z), X, r, x_out - x_in, segs=8, bevel=0.01), key)

# ----------------------------------------------------------------------------------------------
# vehicle assembly
# ----------------------------------------------------------------------------------------------
class Vehicle:
    def __init__(self, vid):
        self.vid = vid
        self.parts = {}
        self.empties = {}
        self.meta = {}
        self.steer_top = None
        self.steer_bottom = None
        self.wheels = {}
        self.box_origin = None
        self.lid_origin = None

    def part(self, name):
        if name not in self.parts:
            self.parts[name] = Part(self.vid)
        return self.parts[name]

    def empty(self, name, loc):
        self.empties[name] = Vector(loc)

    def bbox(self):
        pts = [v.co for p in self.parts.values() for v in p.bm.verts]
        pts += [v.co for _, w in self.wheels.values() for v in w['bm'].verts]
        g = [(p.x, p.z, -p.y) for p in pts]          # glTF axes
        lo = [round(min(q[i] for q in g), 3) for i in range(3)]
        hi = [round(max(q[i] for q in g), 3) for i in range(3)]
        return lo, hi

    def build(self, col):
        vid = self.vid
        lo, hi = self.bbox()
        self.meta.update(bbox_min=lo, bbox_max=hi, length=round(hi[2] - lo[2], 3), width=round(hi[0] - lo[0], 3),
                         height=round(hi[1] - lo[1], 3))
        root = bpy.data.objects.new(vid, None)
        root.empty_display_size = 0.3
        col.objects.link(root)
        root['vehicle'] = vid
        for k, v in self.meta.items():
            root[k] = v
        objs = {}

        def child(ob, parent, part):
            ob.parent = parent
            ob.matrix_parent_inverse = parent.matrix_world.inverted()
            ob['part'] = part
            objs[part] = ob
            return ob

        body = self.parts['body'].build(f'body@{vid}', col)
        child(body, root, 'body')
        # steering: frame tilted about X so the node's local up axis runs along the steering axis
        top, bot = self.steer_top, self.steer_bottom
        axis = (top - bot).normalized()
        a = math.atan2(-axis.y, axis.z)      # Rx(a) maps +Z onto axis (blender space)
        M = Matrix.Translation(top) @ Matrix.Rotation(a, 4, 'X')
        assert (M.to_3x3() @ Z - axis).length < 1e-6
        self.meta_rake = math.degrees(abs(a))
        steer = self.parts['steer'].build(f'steer@{vid}', col, matrix=M)
        child(steer, root, 'steer')
        for wname, (center, wb) in self.wheels.items():
            parent = steer if wname == 'wheel_front' else root
            wm = (M @ Matrix.Translation(M.inverted() @ center)) if wname == 'wheel_front' else Matrix.Translation(center)
            # wheel_front: same rotation as steer (axisymmetric about X), so local rotation = identity
            pt = Part(vid)
            pt.bm.free()
            pt.bm = wb['bm']
            pt.keys = wb['keys']
            ob = pt.build(f'{wname}@{vid}', col, matrix=wm)
            child(ob, parent, wname)
        bx = self.parts['box'].build(f'box@{vid}', col, origin=self.box_origin)
        child(bx, root, 'box')
        if 'box_lid' in self.parts and self.parts['box_lid'].bm.faces:
            lid = self.parts['box_lid'].build(f'box_lid@{vid}', col, origin=self.lid_origin)
            child(lid, bx, 'box_lid')
        for name, loc in self.empties.items():
            e = bpy.data.objects.new(f'{name}@{vid}', None)
            e.empty_display_size = 0.08
            e.empty_display_type = 'ARROWS'
            col.objects.link(e)
            e.matrix_world = Matrix.Translation(loc)
            child(e, root, name)
        root['steer_rake_deg'] = round(self.meta_rake, 2)
        tri = sum(p.tris() for p in self.parts.values()) + sum(
            sum(len(f.verts) - 2 for f in w['bm'].faces) for _, w in self.wheels.values())
        return root, objs

    def wheel(self, name, center, r, w, hub='metal', cap='trim', style='disc', segs=14):
        bm = tyre(r, w, hub, cap, segs=segs, style=style)
        keys = ['rubber', hub, cap]
        # translate into vehicle space (Part.build re-expresses it relative to the node matrix)
        bmesh.ops.translate(bm, vec=center, verts=bm.verts[:])
        self.wheels[name] = (center, {'bm': bm, 'keys': keys})
        return center

# ----------------------------------------------------------------------------------------------
# helpers shared by the scooters
# ----------------------------------------------------------------------------------------------
def se_halfwidth(hw, zc, hh, n, z):
    """x extent of a superellipse ring (half width hw, centre zc, half height hh) at height z."""
    t = min(1.0, abs(z - zc) / hh)
    return hw * max(0.0, 1 - t ** n) ** (1.0 / n)

def fender_arc(axle_f, axle_z, rad, hw, thick, a0, a1, steps=8, n=3.0, npts=12, dent=None, flare=0.0):
    """mudguard: loft of rounded sections along an arc around the axle (angles in degrees,
    0 = forward, 90 = up, 180 = back)."""
    rings = []
    for i in range(steps + 1):
        a = math.radians(lerp(a0, a1, i / steps))
        d = Vector((0, -math.cos(a), math.sin(a)))          # radial (blender)
        c = P(0, axle_f, axle_z) + d * (rad + thick / 2)
        w = hw * (1 + flare * (1 - abs(2 * i / steps - 1)))
        r = ring(c, X, d, w, thick / 2, n, npts, phase=0.0)
        if dent:
            dc, dr, dd = dent
            r = [p - d * dd * max(0.0, 1 - (p - dc).length / dr) for p in r]
        rings.append(r)
    return bm_loft(rings, True, True, 'auto', 55)

def rider_root(f_r, h_r):
    return P(0, f_r, h_r)

class Scoot:
    """numbers shared by the step-through layouts"""
    def __init__(self, fA, fR, r_f, r_r, f_r, h_r, rake):
        self.fA, self.fR, self.rf, self.rr = fA, fR, r_f, r_r
        self.f_r, self.h_r = f_r, h_r
        self.rake = math.radians(rake)
        self.grip_f = f_r + RIDER_GRIP[1]
        self.grip_z = h_r + RIDER_GRIP[2]
        self.seat_z = h_r + RIDER_SEAT_DZ

    def col_f(self, z):
        """forward position of the steering axis at height z (axis passes through front axle)."""
        return self.fA - (z - self.rf) * math.tan(self.rake)

    def axis_pt(self, z):
        return P(0, self.col_f(z), z)

# ----------------------------------------------------------------------------------------------
# VESPETTA - the concept-art hero: curvy red classic scooter, chrome, red box with emblem
# ----------------------------------------------------------------------------------------------
def build_vespetta():
    v = Vehicle('vespetta')
    L = Scoot(fA=0.66, fR=-0.66, r_f=0.25, r_r=0.25, f_r=-0.10, h_r=0.66, rake=20)
    body, steer = v.part('body'), v.part('steer')

    # --- wheels
    v.wheel('wheel_front', P(0, L.fA, L.rf), L.rf, 0.20, hub='trim', cap='paint', style='dish')
    v.wheel('wheel_rear', P(0, L.fR, L.rr), L.rr, 0.21, hub='trim', cap='paint', style='dish')

    # --- rear cowl (bulbous engine body)
    cowl = [(0.03, 0.11, 0.26, 0.36, 3), (-0.06, 0.19, 0.23, 0.44, 3), (-0.18, 0.25, 0.22, 0.485, 3.2),
            (-0.36, 0.295, 0.22, 0.50, 3.2), (-0.55, 0.30, 0.24, 0.505, 3.2), (-0.74, 0.27, 0.29, 0.50, 3),
            (-0.89, 0.19, 0.35, 0.49, 3), (-0.97, 0.10, 0.40, 0.47, 2.6)]
    body.add(loft_f(cowl, npts=16), 'paint')
    for s in (-1, 1):   # chrome side strips
        pts = []
        for f, hw, zb, zt, n in cowl[2:7]:
            zc, hh = (zb + zt) / 2, (zt - zb) / 2
            pts.append(P(s * (se_halfwidth(hw, zc, hh, n, 0.34) + 0.003), f, 0.34))
        body.add(bm_tube(pts, 0.016, sides=4), 'trim')
    # --- floor board + runners + belly
    body.add(box_f(0, 0.10, 0.262, 0.40, 0.30, 0.07, bevel=0.02, segs=1), 'paint')
    for x in (-0.12, -0.04, 0.04, 0.12):
        body.add(box_f(x, 0.10, 0.300, 0.024, 0.26, 0.012), 'rubber')
    body.add(box_f(0, 0.06, 0.215, 0.28, 0.40, 0.04), 'rubber')
    # --- leg shield (chunky, convex front; inner face follows the rider's soles) + ridge "tie"
    sh = [(0.22, 0.22, 0.03, 0.40, 4), (0.32, 0.27, 0.09, 0.41, 4), (0.46, 0.33, 0.17, 0.395, 4),
          (0.64, 0.34, 0.235, 0.385, 4), (0.80, 0.31, 0.285, 0.385, 4), (0.90, 0.24, 0.315, 0.395, 3.5),
          (0.955, 0.15, 0.335, 0.405, 3)]
    b = loft_z(sh, npts=16, mode='auto', angle=60)
    deform(b, lambda co: Vector((co.x, co.y + 0.30 * co.x * co.x, co.z)))
    body.add(b, 'paint')
    ridge = []
    for z in (0.58, 0.70, 0.82, 0.95):
        cf = L.col_f(z)
        ridge.append((z, 0.075 if z < 0.9 else 0.07, cf - 0.05, cf + 0.055, 3))
    body.add(loft_z(ridge, npts=10), 'paint')
    for sgn in (-1, 1):   # chrome beading along the shield's outer edges
        pts = []
        for z, hw, fb_, ff_, n in sh[1:6]:
            hit, nrm = surface(body.bm, P(sgn * (hw - 0.022), 2.0, z), -F)
            if hit is not None:
                pts.append(hit + nrm * 0.006)
        body.add(bm_tube(pts, 0.017, sides=4), 'trim')
    hz = 0.77    # horn grille on the tie
    body.add(box_f(0, L.col_f(hz) + 0.052, hz, 0.09, 0.02, 0.10, bevel=0.008, segs=1, rx=-20), 'trim')
    for i in range(3):
        body.add(box_f(0, L.col_f(hz - 0.03 + i * 0.03) + 0.064, hz - 0.03 + i * 0.03, 0.07, 0.01, 0.012, rx=-20), 'rubber')
    # --- seat (solo saddle) + chrome base + rear rack
    seat = [(-0.03, 0.12, 0.43, 0.47, 3), (-0.10, 0.17, 0.44, 0.52, 3), (-0.28, 0.195, 0.45, 0.53, 3),
            (-0.46, 0.19, 0.46, 0.535, 3), (-0.56, 0.12, 0.47, 0.525, 3)]
    body.add(loft_f(seat, npts=12, mode='smooth'), 'seat_black')
    body.add(loft_f([(-0.05, 0.13, 0.44, 0.46, 3), (-0.55, 0.15, 0.47, 0.49, 3)], npts=10), 'trim')
    rack_z = 0.565
    for s in (-1, 1):
        body.add(bm_tube(round_path([P(s * 0.20, -0.53, 0.49), P(s * 0.20, -0.53, rack_z), P(s * 0.20, -0.99, rack_z),
                                     P(s * 0.12, -1.0, rack_z)], 0.04, 1), 0.021, sides=5), 'trim')
        body.add(bm_tube([P(s * 0.20, -0.90, rack_z), P(s * 0.14, -0.90, 0.48)], 0.018, sides=5), 'trim')
    for f in (-0.66, -0.84):
        body.add(bm_tube([P(-0.20, f, rack_z), P(0.20, f, rack_z)], 0.016, sides=5), 'trim')
    body.add(bm_tube([P(-0.12, -1.0, rack_z), P(0.12, -1.0, rack_z)], 0.021, sides=5), 'trim')
    # --- tail light, exhaust
    body.add(box_f(0, -0.965, 0.445, 0.15, 0.05, 0.075, bevel=0.018, segs=1), 'trim')
    body.add(box_f(0, -0.985, 0.445, 0.12, 0.03, 0.055, bevel=0.012, segs=1), 'light_red')
    ex = bm_lathe([(0, -0.48), (0.05, -0.46), (0.068, -0.38), (0.068, -0.18), (0.05, -0.12), (0.024, -0.10),
                   (0.024, 0.0), (0, 0.0)], P(-0.19, -0.78, 0.17), -F, 8, mode='auto', angle=40)
    body.add(ex, 'trim')
    body.add(bm_tube([P(-0.10, -0.10, 0.22), P(-0.17, -0.20, 0.18), P(-0.19, -0.30, 0.17)], 0.022, sides=5), 'trim')

    # --- steering group: headset, headlight, bars, grips, mirrors, column, fork arm, fender
    hs = P(0, L.col_f(0.955) + 0.01, 0.965)
    steer.add(bm_blob(hs, 0.17, 0.11, 0.085, n=2.6, nu=12, nv=6), 'paint')
    lf = L.col_f(0.955) + 0.105
    steer.add(bm_lathe([(0, -0.02), (0.088, -0.02), (0.092, 0.0), (0.088, 0.028), (0, 0.028)], P(0, lf - 0.02, 0.975), F, 12), 'trim')
    steer.add(bm_lathe([(0, 0.0), (0.072, 0.0), (0.064, 0.022), (0, 0.034)], P(0, lf + 0.006, 0.975), F, 12, mode='smooth'), 'light')
    steer.add(bm_lathe([(0, 0), (0.05, 0), (0.05, 0.02), (0, 0.025)], P(0, L.col_f(0.955) - 0.04, 1.03), Z, 8), 'rubber')
    gf, gz = L.grip_f, L.grip_z
    steer.add(bm_tube([P(-0.27, gf + 0.01, gz), P(-0.12, gf + 0.03, gz - 0.01), P(0.12, gf + 0.03, gz - 0.01),
                       P(0.27, gf + 0.01, gz)], 0.03, sides=6), 'paint')
    grip_bar(steer, 0.25, 0.55, gf, gz, r=0.046)
    for s in (-1, 1):
        stalk = round_path([P(s * 0.12, gf + 0.04, gz + 0.03), P(s * 0.34, gf + 0.05, gz + 0.12),
                            P(s * 0.56, gf + 0.05, gz + 0.20)], 0.06, 1)
        steer.add(bm_tube(stalk, 0.018, sides=5), 'trim')
        steer.add(mirror_head(P(s * 0.60, gf + 0.05, gz + 0.235), rx=0.092, rz=0.066, rf=0.03), 'trim')
    steer.add(bm_tube([P(0, L.col_f(0.92), 0.92), P(0, L.col_f(0.50), 0.50)], 0.03, sides=6), 'rubber')
    fk = [P(0, L.col_f(0.54), 0.54), P(0.06, L.col_f(0.49), 0.48), P(0.155, L.col_f(0.42) + 0.02, 0.41),
          P(0.155, L.fA - 0.03, 0.31), P(0.155, L.fA, L.rf)]
    steer.add(bm_tube(round_path(fk, 0.05, 1), 0.045, sides=6), 'paint')
    steer.add(bm_cyl(P(0.14, L.fA, L.rf), X, 0.065, 0.05, segs=10, bevel=0.014), 'paint')
    steer.add(fender_arc(L.fA, L.rf, L.rf + 0.028, 0.14, 0.06, 6, 126, steps=7, n=2.6, npts=10, flare=0.10), 'paint')
    a = math.radians(42)
    crest = P(0, L.fA + math.cos(a) * (L.rf + 0.095), L.rf + math.sin(a) * (L.rf + 0.095))
    steer.add(bm_blob(crest, 0.028, 0.06, 0.034, n=2.4, nu=8, nv=4), 'trim')

    # --- box with emblem on the rack
    delivery_box(v, -0.53, -0.99, rack_z + 0.016, 0.50, 0.46, bevel=0.04, lid_h=0.075, latch_key='trim')

    # --- empties
    v.empty('seat', P(0, L.f_r, L.h_r))
    v.empty('headlight', P(0, lf + 0.04, 0.975))
    v.empty('taillight', P(0, -1.0, 0.445))
    v.empty('exhaust', P(-0.19, -0.78, 0.17))
    v.steer_top, v.steer_bottom = L.axis_pt(0.955), L.axis_pt(L.rf)
    v.meta.update(wheel_radius_front=L.rf, wheel_radius_rear=L.rr, wheelbase=L.fA - L.fR)
    return v

# ----------------------------------------------------------------------------------------------
# ZIPPY - cheap second-hand 50cc scooter: white/grey plastic, small faded red box
# ----------------------------------------------------------------------------------------------
def build_zippy():
    v = Vehicle('zippy')
    L = Scoot(fA=0.64, fR=-0.64, r_f=0.22, r_r=0.22, f_r=-0.10, h_r=0.64, rake=22)
    body, steer = v.part('body'), v.part('steer')
    v.wheel('wheel_front', P(0, L.fA, L.rf), L.rf, 0.19, hub='plastic', cap='paint', style='disc')
    v.wheel('wheel_rear', P(0, L.fR, L.rr), L.rr, 0.20, hub='plastic', cap='paint', style='disc')

    # front body: apron over the wheel, inner face follows the soles; steering column inside
    fr = [(0.23, 0.21, 0.04, 0.40, 4), (0.33, 0.25, 0.09, 0.42, 4), (0.45, 0.29, 0.15, 0.47, 4),
          (0.55, 0.30, 0.19, 0.56, 4), (0.67, 0.29, 0.235, 0.545, 4), (0.79, 0.26, 0.28, 0.51, 4),
          (0.89, 0.19, 0.315, 0.46, 3.5), (0.94, 0.12, 0.335, 0.42, 3)]
    b = loft_z(fr, npts=16, mode='auto', angle=50)
    deform(b, lambda co: Vector((co.x, co.y + 0.25 * co.x * co.x, co.z)))
    body.add(b, 'paint')
    # grey inner leg panel + floor + skirt
    body.add(box_f(0, 0.205, 0.60, 0.44, 0.03, 0.46, bevel=0.012, segs=1, rx=18.5), 'plastic')
    body.add(box_f(0, 0.07, 0.265, 0.38, 0.34, 0.06, bevel=0.015, segs=1), 'plastic')
    for x in (-0.10, 0.0, 0.10):
        body.add(box_f(x, 0.07, 0.298, 0.05, 0.28, 0.008), 'rubber')
    # front grille / nose vent on the apron
    hit, nrm = surface(body.bm, P(0, 2.0, 0.62), -F)
    if hit is not None:
        body.add(box_f(0, -hit.y - 0.004, 0.62, 0.12, 0.02, 0.05, bevel=0.01, segs=1, rx=-30), 'plastic')
    # rear body + lower skirt
    rb = [(0.05, 0.13, 0.22, 0.32, 3), (-0.05, 0.20, 0.22, 0.41, 3.5), (-0.20, 0.23, 0.23, 0.46, 3.5),
          (-0.45, 0.235, 0.26, 0.475, 3.5), (-0.68, 0.21, 0.31, 0.485, 3.5), (-0.86, 0.15, 0.37, 0.49, 3),
          (-0.95, 0.08, 0.41, 0.48, 2.5)]
    body.add(loft_f(rb, npts=16), 'paint')
    body.add(loft_f([(0.04, 0.17, 0.17, 0.27, 4), (-0.30, 0.25, 0.16, 0.30, 4), (-0.62, 0.20, 0.24, 0.34, 4)], npts=12), 'plastic')
    for s in (-1, 1):  # grey side stripe
        pts = []
        for f, hw, zb, zt, n in rb[1:6]:
            zc, hh = (zb + zt) / 2, (zt - zb) / 2
            pts.append(P(s * (se_halfwidth(hw, zc, hh, n, 0.37) + 0.002), f, 0.37))
        body.add(bm_tube(pts, 0.012, sides=4), 'plastic')
    # seat (two-up, slightly worn) + grab rail rack
    seat = [(-0.01, 0.12, 0.42, 0.46, 3), (-0.08, 0.17, 0.43, 0.505, 3), (-0.28, 0.19, 0.44, 0.515, 3),
            (-0.46, 0.18, 0.45, 0.525, 3), (-0.54, 0.12, 0.46, 0.515, 3)]
    body.add(loft_f(seat, npts=12, mode='smooth'), 'seat_black')
    rz = 0.535
    for s in (-1, 1):
        body.add(bm_tube(round_path([P(s * 0.17, -0.47, 0.47), P(s * 0.18, -0.55, rz), P(s * 0.18, -0.92, rz),
                                     P(0, -0.95, rz)], 0.05, 1), 0.022, sides=5), 'plastic')
    body.add(box_f(0, -0.73, rz - 0.005, 0.34, 0.36, 0.015), 'plastic')
    # tail light + plate holder + rear hugger
    body.add(box_f(0, -0.955, 0.455, 0.16, 0.04, 0.05, bevel=0.012, segs=1, rx=12), 'light_red')
    body.add(box_f(0, -0.97, 0.33, 0.14, 0.02, 0.10, bevel=0.008, segs=1, rx=-15), 'plastic')
    body.add(fender_arc(L.fR, L.rr, L.rr + 0.03, 0.115, 0.03, 95, 170, steps=4, n=3, npts=8), 'plastic')
    # exhaust (right side): pipe + black heat-shielded can + dark tip
    body.add(bm_tube(round_path([P(-0.06, 0.02, 0.17), P(-0.14, -0.15, 0.13), P(-0.19, -0.36, 0.18)], 0.06, 1), 0.02, sides=5), 'rubber')
    body.add(bm_lathe([(0, -0.22), (0.045, -0.21), (0.06, -0.16), (0.06, 0.14), (0.045, 0.19), (0, 0.20)],
                      P(-0.19, -0.58, 0.20), -F, 8, mode='auto', angle=40), 'plastic')
    body.add(bm_cyl(P(-0.19, -0.80, 0.20), F, 0.02, 0.06, segs=6), 'rubber')

    # steering: handlebar cover with headlight, bars, grips, mirrors, twin fork, fender
    hz = 0.935
    hc = P(0, L.col_f(hz) + 0.02, hz + 0.005)
    steer.add(bm_blob(hc, 0.20, 0.10, 0.06, n=3.2, nu=12, nv=5), 'paint')
    steer.add(bm_blob(hc - Z * 0.035 + F * 0.005, 0.17, 0.08, 0.035, n=3.2, nu=10, nv=4), 'plastic')
    lf = L.col_f(hz) + 0.115
    steer.add(box_f(0, lf, hz + 0.005, 0.15, 0.03, 0.055, bevel=0.015, segs=1, rx=8), 'light')
    steer.add(box_f(0, L.col_f(hz) - 0.06, hz + 0.065, 0.12, 0.05, 0.02, bevel=0.008, segs=1, rx=-25), 'rubber')
    gf, gz = L.grip_f, L.grip_z
    steer.add(bm_tube([P(-0.28, gf, gz), P(-0.16, gf - 0.02, gz - 0.015), P(0.16, gf - 0.02, gz - 0.015), P(0.28, gf, gz)], 0.027, sides=6), 'plastic')
    grip_bar(steer, 0.25, 0.54, gf, gz, r=0.045)
    for s in (-1, 1):
        stalk = round_path([P(s * 0.17, L.col_f(hz) + 0.02, hz + 0.04), P(s * 0.36, gf + 0.03, gz + 0.14),
                            P(s * 0.52, gf + 0.04, gz + 0.22)], 0.05, 1)
        steer.add(bm_tube(stalk, 0.017, sides=5), 'plastic')
        steer.add(mirror_head(P(s * 0.56, gf + 0.045, gz + 0.245), rx=0.088, rz=0.058, rf=0.028), 'plastic')
        legs = [P(s * 0.135, L.col_f(0.56), 0.56), P(s * 0.135, L.fA, L.rf)]
        steer.add(bm_tube(legs, 0.036, sides=6), 'plastic')
    steer.add(box_f(0, L.col_f(0.56), 0.56, 0.28, 0.07, 0.05, bevel=0.012, segs=1, rx=-22), 'plastic')
    steer.add(fender_arc(L.fA, L.rf, L.rf + 0.025, 0.125, 0.045, 12, 135, steps=6, n=3, npts=10), 'paint')

    delivery_box(v, -0.55, -0.91, rz + 0.008, 0.40, 0.36, bevel=0.03, lid_h=0.065, emblem_sides=False,
                 emblem_size=0.20, latch_key='plastic', segs=1)
    v.empty('seat', P(0, L.f_r, L.h_r))
    v.empty('headlight', P(0, lf + 0.02, hz + 0.005))
    v.empty('taillight', P(0, -0.98, 0.455))
    v.empty('exhaust', P(-0.19, -0.83, 0.20))
    v.steer_top, v.steer_bottom = L.axis_pt(hz), L.axis_pt(L.rf)
    v.meta.update(wheel_radius_front=L.rf, wheel_radius_rear=L.rr, wheelbase=L.fA - L.fR)
    return v

# ----------------------------------------------------------------------------------------------
# VOLT - sleek angular electric scooter: white, teal light strips, insulated blue box
# ----------------------------------------------------------------------------------------------
def build_volt():
    v = Vehicle('volt')
    L = Scoot(fA=0.67, fR=-0.67, r_f=0.25, r_r=0.25, f_r=-0.10, h_r=0.66, rake=21)
    body, steer = v.part('body'), v.part('steer')
    v.wheel('wheel_front', P(0, L.fA, L.rf), L.rf, 0.20, hub='plastic', cap='light_teal', style='disc')
    v.wheel('wheel_rear', P(0, L.fR, L.rr), L.rr, 0.23, hub='plastic', cap='light_teal', style='disc')

    # front shell: faceted wedge (stack of chamfered-rectangle sections) - crisp and angular
    st = [(0.24, 0.29, 0.06, 0.40), (0.34, 0.30, 0.10, 0.40), (0.50, 0.31, 0.18, 0.41), (0.60, 0.30, 0.21, 0.62),
          (0.73, 0.27, 0.255, 0.60), (0.84, 0.23, 0.29, 0.53), (0.93, 0.18, 0.33, 0.47), (0.955, 0.14, 0.35, 0.42)]
    rings = []
    for z, hw, fb_, ff_ in st:
        fc, hf = (fb_ + ff_) / 2, (ff_ - fb_) / 2
        c = min(hw, hf) * 0.45
        pts2 = [(hw, -hf + c), (hw, hf - c), (hw - c, hf), (-hw + c, hf), (-hw, hf - c), (-hw, -hf + c), (-hw + c, -hf), (hw - c, -hf)]
        rings.append([P(x, fc + f, z) for x, f in pts2])
    fbm = bm_loft(rings, True, True, 'auto', 14)
    deform(fbm, lambda co: Vector((co.x, co.y + 0.30 * co.x * co.x, co.z)))
    body.add(fbm, 'paint')
    body.add(box_f(0, 0.215, 0.60, 0.46, 0.03, 0.46, bevel=0.01, segs=1, rx=19), 'plastic')
    # V light strip down the nose (ray-cast onto the shell)
    for s in (-1, 1):
        pts = []
        for t in (0.0, 0.33, 0.66, 1.0):
            x, z = s * lerp(0.03, 0.22, t), lerp(0.50, 0.82, t)
            hit, nrm = surface(body.bm, P(x, 2.0, z), -F)
            if hit is not None:
                pts.append(hit + nrm * 0.006)
        if len(pts) > 1:
            body.add(bm_tube(pts, 0.013, sides=4), 'light_teal')
    # battery deck floor with teal edge strips
    body.add(box_f(0, 0.06, 0.245, 0.42, 0.42, 0.12, bevel=0.02, segs=1), 'plastic')
    body.add(box_f(0, 0.07, 0.308, 0.36, 0.34, 0.01), 'rubber')
    for s in (-1, 1):
        body.add(box_f(s * 0.212, 0.06, 0.25, 0.006, 0.36, 0.014), 'light_teal')
    # rear body: wedge rising to a sharp tail
    rb = [(0.04, 0.15, 0.20, 0.33, 6), (-0.08, 0.21, 0.20, 0.43, 6), (-0.26, 0.235, 0.22, 0.47, 7),
          (-0.50, 0.235, 0.26, 0.485, 7), (-0.72, 0.20, 0.32, 0.50, 6), (-0.90, 0.12, 0.40, 0.51, 5),
          (-0.99, 0.05, 0.45, 0.505, 4)]
    rbm = loft_f(rb, npts=16, mode='auto', angle=24)
    body.add(rbm, 'paint')
    for s in (-1, 1):   # glowing flank strip, ray-cast along the side
        pts = []
        for f in (-0.10, -0.30, -0.52, -0.74, -0.90):
            z = lerp(0.33, 0.44, (-f - 0.1) / 0.8)
            hit, nrm = surface(body.bm, P(s * 1.0, f, z), Vector((-s, 0, 0)))
            if hit is not None:
                pts.append(hit + nrm * 0.005)
        body.add(bm_tube(pts, 0.011, sides=4), 'light_teal')
    body.add(loft_f([(0.0, 0.18, 0.15, 0.24, 6), (-0.55, 0.20, 0.20, 0.30, 6)], npts=12, mode='auto', angle=25), 'plastic')
    # seat
    seat = [(-0.01, 0.12, 0.43, 0.47, 5), (-0.09, 0.175, 0.44, 0.52, 6), (-0.30, 0.19, 0.45, 0.53, 6),
            (-0.50, 0.18, 0.46, 0.535, 6), (-0.57, 0.11, 0.47, 0.525, 5)]
    body.add(loft_f(seat, npts=12, mode='auto', angle=30), 'seat_black')
    # rear carrier, tail LED bar, hugger
    rz = 0.545
    body.add(box_f(0, -0.78, rz, 0.40, 0.46, 0.025, bevel=0.008, segs=1), 'plastic')
    for s in (-1, 1):
        body.add(box_f(s * 0.17, -0.70, 0.50, 0.03, 0.10, 0.08, bevel=0.006, segs=1, rx=-25), 'plastic')
    body.add(box_f(0, -0.99, 0.478, 0.012 + 0.10, 0.02, 0.02, bevel=0.006, segs=1), 'light_red')
    body.add(box_f(0, -0.955, 0.40, 0.18, 0.03, 0.012), 'light_red')
    body.add(fender_arc(L.fR, L.rr, L.rr + 0.03, 0.125, 0.03, 100, 175, steps=4, n=6, npts=8), 'plastic')
    # electric motor hub cover on the rear swing arm (left)
    body.add(bm_cyl(P(0.155, L.fR, L.rr), X, 0.13, 0.05, segs=12, bevel=0.012), 'plastic')
    body.add(box_f(0.155, L.fR + 0.25, L.rr + 0.03, 0.05, 0.42, 0.09, bevel=0.012, segs=1, rx=6), 'plastic')
    body.add(bm_cyl(P(0.182, L.fR, L.rr), X, 0.05, 0.006, segs=10), 'light_teal')

    # steering: angular cover with LED headlight bar, display, bars, mirrors, fork, fender
    hz = 0.94
    hc = P(0, L.col_f(hz) + 0.02, hz)
    steer.add(box_f(0, L.col_f(hz) + 0.02, hz, 0.30, 0.15, 0.08, bevel=0.03, segs=1), 'paint')
    steer.add(box_f(0, L.col_f(hz) + 0.10, hz + 0.005, 0.22, 0.03, 0.035, bevel=0.01, segs=1, rx=10), 'light')
    steer.add(box_f(0, L.col_f(hz) - 0.035, hz + 0.05, 0.13, 0.06, 0.02, bevel=0.006, segs=1, rx=-25), 'plastic')
    steer.add(box_f(0, L.col_f(hz) - 0.038, hz + 0.062, 0.10, 0.045, 0.006, rx=-25), 'light_teal')
    gf, gz = L.grip_f, L.grip_z
    steer.add(bm_tube([P(-0.28, gf, gz), P(-0.14, gf + 0.02, gz - 0.01), P(0.14, gf + 0.02, gz - 0.01), P(0.28, gf, gz)], 0.026, sides=6), 'plastic')
    grip_bar(steer, 0.25, 0.53, gf, gz, r=0.044)
    for s in (-1, 1):
        steer.add(box_f(s * 0.54, gf, gz, 0.02, 0.05, 0.05, bevel=0.006, segs=1), 'light_teal')
        st = [P(s * 0.14, L.col_f(hz) + 0.02, hz + 0.03), P(s * 0.40, gf + 0.04, gz + 0.16), P(s * 0.53, gf + 0.04, gz + 0.22)]
        steer.add(bm_tube(st, 0.017, sides=4), 'plastic')
        steer.add(box_f(s * 0.58, gf + 0.045, gz + 0.235, 0.155, 0.04, 0.075, bevel=0.014, segs=1, ry=s * 12), 'plastic')
        legs = [P(s * 0.145, L.col_f(0.62), 0.62), P(s * 0.145, L.fA, L.rf)]
        steer.add(bm_tube(legs, 0.038, sides=6), 'plastic')
    steer.add(box_f(0, L.col_f(0.62), 0.62, 0.29, 0.07, 0.05, bevel=0.012, segs=1, rx=-21), 'plastic')
    steer.add(fender_arc(L.fA, L.rf, L.rf + 0.028, 0.125, 0.045, 15, 128, steps=5, n=7, npts=8), 'paint')

    delivery_box(v, -0.555, -1.00, rz + 0.015, 0.50, 0.46, bevel=0.07, lid_h=0.085, emblem_sides=True,
                 latch_key='plastic')
    # glowing reflective band around the insulated box
    w, d = 0.50, 0.445
    bz = rz + 0.015 + 0.17
    v.part('box').add(box_f(0, -0.7775, bz, w + 0.008, d * 0.72, 0.024), 'light_teal')
    v.part('box').add(box_f(0, -0.7775, bz, w * 0.72, d + 0.008, 0.024), 'light_teal')
    v.empty('seat', P(0, L.f_r, L.h_r))
    v.empty('headlight', P(0, L.col_f(hz) + 0.12, hz + 0.005))
    v.empty('taillight', P(0, -1.0, 0.478))
    v.empty('exhaust', P(0, -0.98, 0.22))
    v.steer_top, v.steer_bottom = L.axis_pt(hz), L.axis_pt(L.rf)
    v.meta.update(wheel_radius_front=L.rf, wheel_radius_rear=L.rr, wheelbase=L.fA - L.fR)
    return v

# ----------------------------------------------------------------------------------------------
# RUSTBUCKET - the starting junk moped ("kulustur"): faded mint, rust, tape, cardboard box
# ----------------------------------------------------------------------------------------------
def build_rustbucket():
    v = Vehicle('rustbucket')
    L = Scoot(fA=0.66, fR=-0.66, r_f=0.25, r_r=0.25, f_r=-0.10, h_r=0.66, rake=23)
    body, steer = v.part('body'), v.part('steer')
    v.wheel('wheel_front', P(0, L.fA, L.rf), L.rf, 0.15, hub='metal', cap='rust', style='disc', segs=12)
    v.wheel('wheel_rear', P(0, L.fR, L.rr), L.rr, 0.16, hub='metal', cap='rust', style='disc', segs=12)

    # flat-ish leg shield (Cub style), slightly warped
    sh = [(0.22, 0.25, 0.03, 0.33, 5), (0.32, 0.28, 0.08, 0.35, 5), (0.46, 0.32, 0.16, 0.36, 5),
          (0.64, 0.325, 0.235, 0.355, 5), (0.80, 0.29, 0.285, 0.36, 5), (0.88, 0.20, 0.31, 0.365, 4)]
    b = loft_z(sh, npts=16, mode='auto', angle=40)
    deform(b, lambda co: Vector((co.x, co.y + 0.20 * co.x * co.x + 0.03 * max(0.0, co.x) * (co.z - 0.5), co.z)))
    for f in b.faces:      # rusty lower band
        if f.calc_center_median().z < 0.25:
            f.material_index = 1
    body.add(b, ['paint', 'rust'])
    # pressed-steel backbone + floor slab
    bb = round_path([P(0, L.col_f(0.84) - 0.02, 0.84), P(0, 0.42, 0.50), P(0, 0.26, 0.27), P(0, -0.02, 0.25),
                     P(0, -0.22, 0.38)], 0.12, 2)
    body.add(bm_tube(bb, 0.062, sides=7), 'paint')
    body.add(box_f(0, 0.08, 0.255, 0.34, 0.30, 0.05, bevel=0.012, segs=1, rz=2), 'rubber')
    # engine: block + horizontal cylinder with fins
    body.add(box_f(0, -0.12, 0.23, 0.22, 0.30, 0.20, bevel=0.03, segs=1), 'metal')
    body.add(bm_cyl(P(0, 0.08, 0.20), F, 0.07, 0.16, segs=8), 'metal')
    for i in range(3):
        body.add(box_f(0, 0.04 + i * 0.045, 0.20, 0.17, 0.012, 0.17), 'metal')
    # side covers under the seat
    sc_ = [(-0.06, 0.12, 0.30, 0.44, 4), (-0.20, 0.17, 0.29, 0.48, 4), (-0.48, 0.17, 0.30, 0.48, 4),
           (-0.60, 0.12, 0.33, 0.47, 4)]
    body.add(loft_f(sc_, npts=12, mode='auto', angle=40), 'paint')
    # saggy seat with duct-tape bands and exposed foam
    seat = [(-0.02, 0.11, 0.43, 0.47, 3), (-0.09, 0.165, 0.44, 0.515, 3), (-0.26, 0.18, 0.44, 0.515, 3),
            (-0.44, 0.18, 0.45, 0.53, 3), (-0.62, 0.15, 0.46, 0.53, 3), (-0.68, 0.09, 0.47, 0.515, 3)]
    sb = loft_f(seat, npts=12, mode='smooth')
    deform(sb, lambda co: Vector((co.x, co.y, co.z - 0.018 * math.exp(-((co.y - 0.22) / 0.12) ** 2) * (co.z > 0.48))))
    body.add(sb, 'seat_black')
    for i, (f, tilt) in enumerate(((-0.17, 4), (-0.33, -6), (-0.52, 3))):
        tb = loft_f([(f + 0.03, 0.185, 0.432, 0.535, 3), (f - 0.03, 0.185, 0.432, 0.535, 3)], npts=12)
        xform(tb, Matrix.Translation(P(0, f, 0.48)) @ Matrix.Rotation(math.radians(tilt), 4, 'Z') @ Matrix.Translation(-P(0, f, 0.48)))
        body.add(tb, 'metal')
    rust_spot(body, P(0.06, -0.40, 1.2), -Z, 0.035, 7, key='cardboard')
    # rear mudguard, bent rack, taillight
    rf = fender_arc(L.fR, L.rr, L.rr + 0.03, 0.115, 0.036, 40, 190, steps=8, n=3, npts=8)
    body.add(rf, 'paint')
    rack_z = 0.575
    rk = [P(-0.17, -0.50, 0.49), P(-0.17, -0.52, rack_z), P(-0.18, -0.97, rack_z - 0.025), P(0.18, -0.96, rack_z - 0.02),
          P(0.17, -0.52, rack_z), P(0.17, -0.50, 0.49)]
    body.add(bm_tube(round_path(rk, 0.04, 1), 0.019, sides=5), 'metal')
    for f in (-0.66, -0.82):
        body.add(bm_tube([P(-0.175, f, rack_z - 0.01), P(0.175, f, rack_z - 0.012)], 0.016, sides=5), 'metal')
    body.add(bm_tube([P(0.15, -0.88, rack_z - 0.02), P(0.12, -0.90, 0.40)], 0.011, sides=5), 'metal')
    body.add(bm_tube([P(-0.15, -0.88, rack_z - 0.02), P(-0.12, -0.90, 0.40)], 0.011, sides=5), 'metal')
    a = math.radians(152)
    tl = P(0, L.fR + math.cos(a) * (L.rr + 0.07), L.rr + math.sin(a) * (L.rr + 0.07))
    body.add(box_f(0, -tl.y, tl.z + 0.03, 0.10, 0.06, 0.06, bevel=0.01, segs=1, rx=-8), 'metal')
    body.add(box_f(0, -tl.y - 0.032, tl.z + 0.03, 0.075, 0.01, 0.04, rx=-8), 'light_red')
    # rusty exhaust
    ex = round_path([P(-0.04, 0.16, 0.15), P(-0.10, 0.10, 0.09), P(-0.16, -0.10, 0.10), P(-0.17, -0.30, 0.16)], 0.06, 1)
    body.add(bm_tube(ex, 0.022, sides=5), 'rust')
    body.add(bm_lathe([(0, -0.24), (0.045, -0.22), (0.052, -0.15), (0.052, 0.18), (0.035, 0.22), (0.02, 0.22),
                       (0.02, 0.27), (0, 0.27)], P(-0.17, -0.55, 0.165), -F, 8, mode='auto', angle=40), 'rust')
    # rust patches all over
    for i, (o, d, r) in enumerate([
            (P(0.12, 1.5, 0.70), -F, 0.06), (P(-0.18, 1.5, 0.48), -F, 0.05), (P(0.05, 1.5, 0.36), -F, 0.045),
            (P(1.0, -0.30, 0.38), -X, 0.05), (P(-1.0, -0.45, 0.42), X, 0.045), (P(1.0, -0.72, 0.52), -X, 0.035),
            (P(-1.0, 0.20, 0.70), X, 0.04), (P(0, -0.88, 1.2), -Z, 0.04), (P(0.6, 0.30, 0.33), -X, 0.03)]):
        rust_spot(body, o, d, r, 11 + i, stretch=1.3)
    rust_spot(body, P(1.0, -0.36, 0.40), -X, 0.075, 5, key='metal', stretch=1.6)    # grey primer repair patch

    # steering: bare bars, crooked headlight, one bent mirror, telescopic fork, dented fender
    hz = 0.93
    top = P(0, L.col_f(hz), hz)
    steer.add(bm_cyl(top, Z, 0.045, 0.07, segs=8), 'metal')
    gf, gz = L.grip_f, L.grip_z
    bar = round_path([P(-0.53, gf, gz), P(-0.30, gf + 0.01, gz), P(-0.14, L.col_f(hz) - 0.01, hz + 0.02),
                      P(0.14, L.col_f(hz) - 0.01, hz + 0.02), P(0.30, gf + 0.01, gz + 0.012), P(0.53, gf - 0.01, gz + 0.02)], 0.05, 1)
    steer.add(bm_tube(bar, 0.024, sides=6), 'metal')
    steer.add(bm_cyl(P(0.405, gf - 0.005, gz + 0.016), X, 0.045, 0.27, segs=8, bevel=0.012), 'rubber')   # left grip
    steer.add(bm_cyl(P(-0.405, gf, gz), X, 0.042, 0.27, segs=8, bevel=0.008), 'metal')               # taped right grip
    steer.add(bm_cyl(P(-0.40, gf, gz), X, 0.052, 0.12, segs=8, bevel=0.018), 'metal')
    # small round headlight on a bracket, knocked askew
    hl = P(0.0, L.col_f(hz) + 0.10, hz - 0.03)
    rot = Matrix.Rotation(math.radians(9), 4, 'Z') @ Matrix.Rotation(math.radians(-7), 4, 'X')
    lamp = merge(bm_lathe([(0, -0.07), (0.05, -0.065), (0.068, -0.02), (0.07, 0.012), (0.062, 0.016), (0, 0.016)],
                          Vector(), F, 10, mode='auto', angle=40))
    xform(lamp, Matrix.Translation(hl) @ rot)
    steer.add(lamp, 'metal')
    lens = bm_lathe([(0, 0.0), (0.058, 0.0), (0.05, 0.015), (0, 0.022)], Vector(), F, 10, mode='smooth')
    xform(lens, Matrix.Translation(hl + (rot.to_3x3() @ F) * 0.012) @ rot)
    steer.add(lens, 'light')
    steer.add(bm_tube([P(0, L.col_f(hz) + 0.02, hz - 0.02), hl - F * 0.05], 0.014, sides=5), 'metal')
    # single bent mirror (left), snapped stub (right)
    ms = [P(0.20, gf + 0.01, gz + 0.012), P(0.24, gf + 0.03, gz + 0.12), P(0.34, gf + 0.10, gz + 0.17), P(0.47, gf + 0.06, gz + 0.13)]
    steer.add(bm_tube(ms, 0.016, sides=5), 'metal')
    mh = mirror_head(Vector(), rx=0.085, rz=0.06, rf=0.028)
    xform(mh, Matrix.Translation(P(0.50, gf + 0.06, gz + 0.12)) @ Matrix.Rotation(math.radians(35), 4, 'Y') @ Matrix.Rotation(math.radians(-25), 4, 'Z'))
    steer.add(mh, 'metal')
    steer.add(bm_tube([P(-0.20, gf, gz), P(-0.215, gf + 0.01, gz + 0.06), P(-0.245, gf + 0.03, gz + 0.075)], 0.016, sides=4), 'metal')
    for s in (-1, 1):
        steer.add(bm_tube([P(s * 0.105, L.col_f(0.80), 0.80), P(s * 0.105, L.col_f(0.48), 0.48)], 0.038, sides=6), 'metal')
        steer.add(bm_tube([P(s * 0.105, L.col_f(0.50), 0.50), P(s * 0.105, L.fA, L.rf)], 0.029, sides=6), 'metal')
    steer.add(box_f(0, L.col_f(0.82), 0.82, 0.27, 0.07, 0.05, bevel=0.01, segs=1, rx=-23), 'metal')
    steer.add(box_f(0, L.col_f(0.90), 0.90, 0.27, 0.07, 0.045, bevel=0.01, segs=1, rx=-23), 'metal')
    a = math.radians(70)
    dent_c = P(0.06, L.fA + math.cos(a) * (L.rf + 0.06), L.rf + math.sin(a) * (L.rf + 0.06))
    ff = fender_arc(L.fA, L.rf, L.rf + 0.03, 0.115, 0.038, 0, 140, steps=9, n=3, npts=10, dent=(dent_c, 0.10, 0.055))
    steer.add(ff, 'paint')
    rust_spot(steer, P(-0.02, L.fA + 0.15, 1.0), -Z, 0.035, 41, stretch=1.4)
    rust_spot(steer, P(0.0, L.fA + 0.6, L.rf + 0.08), -F, 0.03, 42)

    # battered cardboard box tied on with rope
    z0 = rack_z + 0.0
    f0, f1, w, h = -0.53, -0.93, 0.46, 0.38
    fc = (f0 + f1) / 2
    bx, lid = v.part('box'), v.part('box_lid')
    lid_h = 0.03
    cb = box_f(0, fc, z0 + (h - lid_h) / 2, w, f0 - f1, h - lid_h, bevel=0.012, segs=1)
    # squash a corner, bulge sides
    def batter(co):
        rel = co - P(0, fc, z0)
        if rel.x > 0.15 and rel.z > 0.25 and -rel.y > 0.10:
            co = co + Vector((-0.02, 0.0, -0.035))
        co.x *= 1.0 + 0.04 * math.sin(rel.z * 9)
        return co
    deform(cb, batter)
    bx.add(cb, 'box')
    flap = box_f(0, fc, z0 + h - lid_h / 2 + 0.002, w * 0.97, (f0 - f1) * 0.97, lid_h * 0.5, bevel=0.004, segs=1, rx=-2)
    lid.add(flap, 'box')
    lid.add(box_f(0.0, fc, z0 + h - lid_h * 0.5 + 0.004 + 0.004, 0.06, (f0 - f1) * 1.0, 0.004), 'cardboard')
    bx.add(box_f(0.0, f1 - 0.002, z0 + h - 0.08, 0.06, 0.004, 0.16), 'cardboard')
    bx.add(box_f(0.0, f0 + 0.002, z0 + h - 0.08, 0.06, 0.004, 0.16), 'cardboard')
    # "FRAGILE"-ish scribble patch + crease
    bx.add(box_f(-0.10, f1 - 0.003, z0 + 0.12, 0.14, 0.004, 0.06, rz=0, ry=-6), 'cardboard')
    # rope: belt around the middle + ties down to the rack
    rz_ = z0 + 0.17
    hw_, hd_ = w / 2 + 0.012, (f0 - f1) / 2 + 0.012
    loop = [P(-hw_, fc + hd_, rz_), P(hw_, fc + hd_, rz_ + 0.01), P(hw_, fc - hd_, rz_ - 0.01), P(-hw_, fc - hd_, rz_),
            P(-hw_, fc + hd_, rz_)]
    bx.add(bm_tube(round_path(loop, 0.03, 1), 0.015, sides=4, cap=False), 'cardboard')
    for sx, sf in ((1, 1), (-1, 1), (1, -1), (-1, -1)):
        bx.add(bm_tube([P(sx * hw_, fc + sf * (hd_ - 0.04), rz_), P(sx * 0.175, fc + sf * (hd_ - 0.02), z0 - 0.005)], 0.013, sides=4), 'cardboard')
    rot = Matrix.Translation(P(0, fc, z0)) @ Matrix.Rotation(math.radians(5), 4, 'Z') @ Matrix.Rotation(math.radians(-2.5), 4, 'Y') @ Matrix.Translation(-P(0, fc, z0))
    bmesh.ops.transform(bx.bm, matrix=rot, verts=bx.bm.verts[:])
    bmesh.ops.transform(lid.bm, matrix=rot, verts=lid.bm.verts[:])
    v.box_origin = P(0, fc, z0)
    v.lid_origin = rot @ P(0, f1, z0 + h)

    v.empty('seat', P(0, L.f_r, L.h_r))
    v.empty('headlight', hl + F * 0.03)
    v.empty('taillight', P(0, -tl.y - 0.04, tl.z + 0.03))
    v.empty('exhaust', P(-0.17, -0.82, 0.165))
    v.steer_top, v.steer_bottom = L.axis_pt(hz), L.axis_pt(L.rf)
    v.meta.update(wheel_radius_front=L.rf, wheel_radius_rear=L.rr, wheelbase=L.fA - L.fR)
    return v

# ----------------------------------------------------------------------------------------------
# MULE - cargo trike: scooter front, two rear wheels, big orange box, sturdy
# ----------------------------------------------------------------------------------------------
def build_mule():
    v = Vehicle('mule')
    L = Scoot(fA=0.85, fR=-0.85, r_f=0.25, r_r=0.25, f_r=0.05, h_r=0.70, rake=18)
    body, steer = v.part('body'), v.part('steer')
    v.wheel('wheel_front', P(0, L.fA, L.rf), L.rf, 0.20, hub='metal', cap='paint', style='dish', segs=12)
    TR = 0.50
    v.wheel('wheel_rear_l', P(TR, L.fR, L.rr), L.rr, 0.20, hub='metal', cap='paint', style='dish', segs=12)
    v.wheel('wheel_rear_r', P(-TR, L.fR, L.rr), L.rr, 0.20, hub='metal', cap='paint', style='dish', segs=12)

    # front body (apron + shield), chunky
    fr = [(0.24, 0.25, 0.20, 0.57, 4), (0.34, 0.29, 0.25, 0.59, 4), (0.48, 0.33, 0.31, 0.63, 4),
          (0.60, 0.34, 0.355, 0.73, 4), (0.74, 0.32, 0.40, 0.72, 4), (0.86, 0.28, 0.44, 0.69, 4),
          (0.94, 0.20, 0.47, 0.66, 3.5), (0.985, 0.13, 0.49, 0.64, 3)]
    b = loft_z(fr, npts=16, mode='auto', angle=45)
    deform(b, lambda co: Vector((co.x, co.y + 0.22 * co.x * co.x, co.z)))
    body.add(b, 'paint')
    body.add(box_f(0, 0.385, 0.62, 0.48, 0.03, 0.48, bevel=0.012, segs=1, rx=18), 'plastic')
    hit, nrm = surface(body.bm, P(0, 2.5, 0.66), -F)
    hlp = hit if hit is not None else P(0, 0.74, 0.66)
    body.add(bm_lathe([(0, -0.03), (0.085, -0.03), (0.09, 0.0), (0.085, 0.03), (0, 0.03)], hlp, F, 12), 'metal')
    body.add(bm_lathe([(0, 0.0), (0.07, 0.0), (0.062, 0.022), (0, 0.032)], hlp + F * 0.02, F, 12, mode='smooth'), 'light')
    # floor + seat base + seat
    body.add(box_f(0, 0.26, 0.27, 0.44, 0.32, 0.07, bevel=0.015, segs=1), 'plastic')
    for x in (-0.12, 0.0, 0.12):
        body.add(box_f(x, 0.26, 0.308, 0.05, 0.28, 0.008), 'rubber')
    sb = [(0.16, 0.16, 0.24, 0.40, 4), (0.08, 0.23, 0.22, 0.49, 4), (-0.10, 0.25, 0.22, 0.52, 4),
          (-0.36, 0.25, 0.24, 0.52, 4), (-0.42, 0.22, 0.26, 0.50, 4)]
    body.add(loft_f(sb, npts=16, mode='auto', angle=45), 'paint')
    seat = [(0.15, 0.13, 0.47, 0.51, 3), (0.08, 0.19, 0.48, 0.565, 3), (-0.12, 0.21, 0.49, 0.575, 3),
            (-0.30, 0.20, 0.50, 0.58, 3), (-0.37, 0.14, 0.50, 0.565, 3)]
    body.add(loft_f(seat, npts=12, mode='smooth'), 'seat_black')
    # chassis rails, cargo deck, rear axle, fenders, bumper, lights
    for s in (-1, 1):
        body.add(bm_tube([P(s * 0.28, -0.30, 0.30), P(s * 0.28, -1.20, 0.32)], 0.03, sides=6), 'metal')
    body.add(box_f(0, -0.775, 0.465, 0.74, 0.83, 0.05, bevel=0.012, segs=1), 'plastic')
    body.add(bm_tube([P(-TR + 0.05, L.fR, L.rr), P(TR - 0.05, L.fR, L.rr)], 0.03, sides=6), 'metal')
    body.add(bm_blob(P(0, L.fR, L.rr), 0.09, 0.08, 0.075, n=2.4, nu=10, nv=5), 'metal')
    for s in (-1, 1):
        body.add(bm_tube([P(s * 0.28, L.fR + 0.12, 0.31), P(s * (TR - 0.06), L.fR, L.rr), P(s * 0.28, L.fR - 0.14, 0.32)], 0.022, sides=5), 'metal')
        fa = fender_arc(L.fR, L.rr, L.rr + 0.035, 0.125, 0.045, 10, 170, steps=7, n=4, npts=8)
        bmesh.ops.translate(fa, vec=X * s * TR, verts=fa.verts[:])
        body.add(fa, 'paint')
        body.add(box_f(s * 0.38, -1.19, 0.42, 0.10, 0.03, 0.06, bevel=0.01, segs=1), 'light_red')
        body.add(box_f(s * (TR + 0.02), L.fR - 0.30, 0.17, 0.12, 0.012, 0.12), 'rubber')   # mud flaps
    body.add(bm_tube(round_path([P(-0.46, -1.13, 0.33), P(-0.46, -1.21, 0.33), P(0.46, -1.21, 0.33), P(0.46, -1.13, 0.33)], 0.05, 1), 0.026, sides=6), 'metal')
    body.add(box_f(0, -1.19, 0.43, 0.70, 0.03, 0.07, bevel=0.01, segs=1), 'plastic')
    # exhaust under the deck, tip out the back (right)
    body.add(bm_tube(round_path([P(-0.10, 0.0, 0.18), P(-0.18, -0.30, 0.20), P(-0.20, -0.60, 0.22)], 0.08, 1), 0.024, sides=5), 'metal')
    body.add(bm_lathe([(0, -0.20), (0.05, -0.19), (0.06, -0.14), (0.06, 0.14), (0.04, 0.18), (0.025, 0.18), (0.025, 0.26), (0, 0.26)],
                      P(-0.20, -0.82, 0.24), -F, 8, mode='auto', angle=40), 'metal')
    # steering
    hz = 0.95
    hc = P(0, L.col_f(hz) + 0.02, hz)
    steer.add(bm_blob(hc, 0.19, 0.11, 0.065, n=3.2, nu=12, nv=5), 'paint')
    steer.add(box_f(0, L.col_f(hz) - 0.05, hz + 0.055, 0.12, 0.05, 0.02, bevel=0.006, segs=1, rx=-25), 'rubber')
    gf, gz = L.grip_f, L.grip_z
    steer.add(bm_tube([P(-0.28, gf, gz), P(-0.15, gf + 0.02, gz - 0.01), P(0.15, gf + 0.02, gz - 0.01), P(0.28, gf, gz)], 0.03, sides=6), 'metal')
    grip_bar(steer, 0.25, 0.55, gf, gz, r=0.047)
    for s in (-1, 1):
        st = round_path([P(s * 0.16, L.col_f(hz) + 0.02, hz + 0.03), P(s * 0.38, gf + 0.03, gz + 0.15), P(s * 0.54, gf + 0.04, gz + 0.22)], 0.05, 1)
        steer.add(bm_tube(st, 0.018, sides=5), 'metal')
        steer.add(mirror_head(P(s * 0.58, gf + 0.045, gz + 0.245), rx=0.09, rz=0.062, rf=0.03), 'plastic')
        steer.add(bm_tube([P(s * 0.15, L.col_f(0.62), 0.62), P(s * 0.15, L.fA, L.rf)], 0.042, sides=6), 'metal')
    steer.add(box_f(0, L.col_f(0.62), 0.62, 0.31, 0.08, 0.06, bevel=0.014, segs=1, rx=-18), 'metal')
    steer.add(fender_arc(L.fA, L.rf, L.rf + 0.03, 0.135, 0.05, 20, 135, steps=7, n=4, npts=10), 'paint')

    delivery_box(v, -0.40, -1.17, 0.49, 0.72, 0.64, bevel=0.045, lid_h=0.085, emblem_size=0.40, latch_key='metal')
    v.empty('seat', P(0, L.f_r, L.h_r))
    v.empty('headlight', hlp + F * 0.04)
    v.empty('taillight', P(0, -1.21, 0.43))
    v.empty('exhaust', P(-0.20, -1.08, 0.24))
    v.steer_top, v.steer_bottom = L.axis_pt(hz), L.axis_pt(L.rf)
    v.meta.update(wheel_radius_front=L.rf, wheel_radius_rear=L.rr, wheelbase=L.fA - L.fR, rear_track=2 * TR)
    return v

# ----------------------------------------------------------------------------------------------
# VIPER - green sport bike: fairing, screen, tank, tail, side exhaust, sporty black box
# ----------------------------------------------------------------------------------------------
def build_viper():
    v = Vehicle('viper')
    L = Scoot(fA=0.73, fR=-0.73, r_f=0.30, r_r=0.30, f_r=-0.16, h_r=0.78, rake=24)
    body, steer = v.part('body'), v.part('steer')
    v.wheel('wheel_front', P(0, L.fA, L.rf), L.rf, 0.21, hub='plastic', cap='paint', style='disc', segs=16)
    v.wheel('wheel_rear', P(0, L.fR, L.rr), L.rr, 0.26, hub='plastic', cap='paint', style='disc', segs=16)

    # nose fairing with twin "eyes" + screen
    nose = [(1.03, 0.05, 0.84, 0.90, 2.5), (0.97, 0.15, 0.76, 0.97, 3), (0.84, 0.23, 0.70, 1.01, 3.5),
            (0.68, 0.265, 0.64, 1.02, 3.5), (0.52, 0.275, 0.52, 0.99, 3.5), (0.40, 0.25, 0.47, 0.93, 3.5)]
    body.add(loft_f(nose, npts=16, mode='auto', angle=45), 'paint')
    for s in (-1, 1):
        hit, nrm = surface(body.bm, P(s * 0.085, 2.0, 0.86), -F)
        if hit is not None:
            body.add(box_f(s * 0.085, -hit.y - 0.004, 0.86, 0.10, 0.03, 0.04, bevel=0.012, segs=1, rz=s * -18, ry=s * 14, rx=-8), 'light')
    body.add(loft_f([(0.68, 0.205, 0.995, 1.035, 3), (0.58, 0.19, 1.05, 1.09, 3), (0.47, 0.15, 1.13, 1.165, 3),
                     (0.43, 0.11, 1.16, 1.19, 3)], npts=12, mode='smooth'), 'visor')
    # lower fairing / belly pan
    low = [(0.44, 0.19, 0.30, 0.74, 4), (0.36, 0.225, 0.22, 0.78, 4), (0.16, 0.23, 0.19, 0.74, 4), (-0.02, 0.20, 0.22, 0.66, 4),
           (-0.12, 0.13, 0.27, 0.56, 3.5)]
    body.add(loft_f(low, npts=16, mode='auto', angle=45), 'paint')
    for s in (-1, 1):   # black side vents
        body.add(box_f(s * 0.215, 0.24, 0.45, 0.02, 0.18, 0.04, rx=8), 'plastic')
        body.add(box_f(s * 0.215, 0.22, 0.38, 0.02, 0.16, 0.04, rx=8), 'plastic')
    # tank
    tank = [(0.45, 0.13, 0.80, 0.92, 3), (0.32, 0.18, 0.66, 0.97, 3.5), (0.12, 0.18, 0.64, 0.95, 3.5),
            (-0.04, 0.15, 0.64, 0.86, 3), (-0.10, 0.11, 0.64, 0.75, 3)]
    body.add(loft_f(tank, npts=16, mode='auto', angle=50), 'paint')
    # engine + frame beams
    body.add(box_f(0, 0.12, 0.35, 0.26, 0.42, 0.30, bevel=0.03, segs=1), 'plastic')
    for s in (-1, 1):
        body.add(box_f(s * 0.175, -0.47, 0.38, 0.06, 0.56, 0.09, bevel=0.014, segs=1, rx=15), 'plastic')   # swing arm
        body.add(bm_cyl(P(s * 0.21, 0.08, 0.565), X, 0.022, 0.07, segs=6), 'plastic')   # foot pegs
    # seat + tail section
    seat = [(-0.04, 0.12, 0.62, 0.66, 3), (-0.12, 0.17, 0.61, 0.645, 3), (-0.34, 0.18, 0.60, 0.65, 3),
            (-0.54, 0.16, 0.61, 0.66, 3), (-0.60, 0.11, 0.63, 0.67, 3)]
    body.add(loft_f(seat, npts=12, mode='smooth'), 'seat_black')
    tail = [(-0.28, 0.175, 0.44, 0.62, 3.5), (-0.50, 0.18, 0.50, 0.68, 3.5), (-0.70, 0.165, 0.60, 0.80, 3.5),
            (-0.90, 0.125, 0.70, 0.865, 3.2), (-1.02, 0.06, 0.77, 0.865, 2.6)]
    body.add(loft_f(tail, npts=16, mode='auto', angle=45), 'paint')
    body.add(box_f(0, -1.0, 0.82, 0.08, 0.04, 0.03, bevel=0.008, segs=1, rx=20), 'light_red')
    body.add(fender_arc(L.fR, L.rr, L.rr + 0.03, 0.13, 0.03, 70, 150, steps=4, n=4, npts=8), 'plastic')
    # rack for the box
    rz = 0.865
    body.add(box_f(0, -0.79, rz - 0.01, 0.30, 0.40, 0.02, bevel=0.006, segs=1), 'plastic')
    for s in (-1, 1):
        body.add(box_f(s * 0.10, -0.64, 0.79, 0.03, 0.05, 0.16, bevel=0.008, segs=1, rx=-12), 'plastic')
    # exhaust: header + angled side silencer (right)
    body.add(bm_tube(round_path([P(-0.05, 0.30, 0.25), P(-0.12, 0.10, 0.18), P(-0.17, -0.20, 0.24), P(-0.235, -0.40, 0.37)], 0.08, 1), 0.026, sides=6), 'trim')
    ax = (P(0, -0.92, 0.55) - P(0, -0.40, 0.38)).normalized()
    sil = bm_lathe([(0, -0.30), (0.06, -0.29), (0.078, -0.24), (0.078, 0.18), (0.066, 0.23), (0.04, 0.24), (0.04, 0.28), (0, 0.28)],
                   P(-0.245, -0.66, 0.465), ax, 10, mode='auto', angle=40, seg_mats=[0, 0, 0, 1, 1, 1, 1])
    body.add(sil, ['trim', 'plastic'])
    exhaust_tip = P(-0.245, -0.66, 0.465) + ax * 0.28
    # steering: top clamp, clip-on bars, forks, small fender, mirrors on the screen base
    hz = 1.0
    steer.add(box_f(0, L.col_f(hz), hz, 0.32, 0.11, 0.05, bevel=0.014, segs=1, rx=-24), 'plastic')
    gf, gz = L.grip_f, L.grip_z
    for s in (-1, 1):
        steer.add(bm_tube([P(s * 0.11, L.col_f(hz) - 0.01, hz + 0.01), P(s * 0.26, gf + 0.01, gz - 0.005)], 0.03, sides=6), 'trim')
        steer.add(bm_cyl(P(s * 0.395, gf, gz), X, 0.046, 0.29, segs=8, bevel=0.012), 'rubber')
        steer.add(bm_cyl(P(s * 0.55, gf, gz), X, 0.04, 0.03, segs=8, bevel=0.01), 'plastic')
        steer.add(bm_tube([P(s * 0.165, L.col_f(1.02), 1.02), P(s * 0.165, L.col_f(0.55), 0.55)], 0.042, sides=8), 'trim')
        steer.add(bm_tube([P(s * 0.165, L.col_f(0.57), 0.57), P(s * 0.165, L.fA, L.rf)], 0.052, sides=8), 'plastic')
    steer.add(box_f(0, L.col_f(0.92), 0.92, 0.33, 0.10, 0.05, bevel=0.014, segs=1, rx=-24), 'plastic')
    steer.add(fender_arc(L.fA, L.rf, L.rf + 0.025, 0.115, 0.035, 30, 115, steps=4, n=4, npts=8), 'paint')
    for s in (-1, 1):
        body.add(bm_tube([P(s * 0.22, 0.66, 1.0), P(s * 0.36, 0.62, 1.07)], 0.016, sides=4), 'plastic')
        body.add(mirror_head(P(s * 0.40, 0.62, 1.085), rx=0.08, rz=0.05, rf=0.028), 'plastic')

    delivery_box(v, -0.585, -1.00, rz, 0.44, 0.38, bevel=0.035, lid_h=0.07, emblem_size=0.22, emblem_key='trim',
                 latch_key='trim')
    # sporty accent stripe on the box lid
    v.part('box_lid').add(box_f(0, -0.7925, rz + 0.38 - 0.0, 0.08, 0.43, 0.006), 'paint')
    v.empty('seat', P(0, L.f_r, L.h_r))
    v.empty('headlight', P(0, 1.03, 0.86))
    v.empty('taillight', P(0, -1.03, 0.82))
    v.empty('exhaust', exhaust_tip)
    v.steer_top, v.steer_bottom = L.axis_pt(hz), L.axis_pt(L.rf)
    v.meta.update(wheel_radius_front=L.rf, wheel_radius_rear=L.rr, wheelbase=L.fA - L.fR)
    return v

# ----------------------------------------------------------------------------------------------
# HELMET - courier helmet in the mini character's NATIVE units, head-bone frame
# (origin = head bone head, up = +Y glTF / +Z blender, face = +Z glTF / -Y blender)
# character-male-a head mesh (incl. ears & hair) relative to the head bone: x +-0.227,
# up 0..0.328, back -0.17 .. front +0.17 (glasses).
# ----------------------------------------------------------------------------------------------
HELMET_SHELL = [  # (up, half width, back, front, squareness) - front sized to cover fringes / beards
    (-0.012, 0.236, -0.188, 0.212, 3.6), (0.03, 0.252, -0.200, 0.233, 3.6), (0.13, 0.262, -0.207, 0.236, 3.6),
    (0.24, 0.262, -0.207, 0.236, 3.4), (0.315, 0.250, -0.196, 0.226, 3.2), (0.36, 0.222, -0.170, 0.198, 3.0),
    (0.390, 0.160, -0.120, 0.145, 2.8), (0.405, 0.075, -0.058, 0.068, 2.6)]

def build_helmet(col):
    part = Part('helmet')
    shell = loft_z(HELMET_SHELL, npts=16, cap0=True, cap1=True, mode='smooth')
    part.add(shell, 'helmet_paint')
    # visor: front band of a slightly larger ring, between up 0.105 .. 0.275
    rows = []
    zs = (0.10, 0.155, 0.215, 0.275)
    angs = [math.radians(a) for a in (-62, -46, -30, -15, 0, 15, 30, 46, 62)]
    def shell_at(z):
        for (z0, w0, b0, f0, n0), (z1, w1, b1, f1, n1) in zip(HELMET_SHELL[:-1], HELMET_SHELL[1:]):
            if z0 <= z <= z1:
                t = (z - z0) / (z1 - z0)
                return lerp(w0, w1, t), lerp(b0, b1, t), lerp(f0, f1, t), lerp(n0, n1, t)
        return HELMET_SHELL[-1][1:]
    for z in zs:
        w, bk, fr, n = shell_at(z)
        fc, hf = (bk + fr) / 2, (fr - bk) / 2
        row = []
        for a in angs:
            cu, sv = se(math.pi / 2 + a, n)
            nrm = Vector((cu / w, -sv / hf, 0)).normalized()
            row.append(P(w * cu, fc + hf * sv, z) + nrm * 0.009)
        rows.append(row)
    vb = bmesh.new()
    vv = [[vb.verts.new(p) for p in r] for r in rows]
    for r0, r1 in zip(vv[:-1], vv[1:]):
        for i in range(len(angs) - 1):
            vb.faces.new((r0[i], r0[i + 1], r1[i + 1], r1[i]))
    vb.normal_update()
    vb.faces.ensure_lookup_table()
    if vb.faces[len(vb.faces) // 2].normal.dot(F) < 0:
        for fc_ in vb.faces:
            fc_.normal_flip()
    shade(vb, 'smooth')
    # give the visor some thickness at its rim by duplicating slightly inward (closed look)
    part.add(vb, 'visor')
    nr = len(rows)
    loop = rows[0][:] + [rows[i][-1] for i in range(1, nr)] + rows[-1][::-1][1:] + [rows[i][0] for i in range(nr - 2, -1, -1)]
    part.add(bm_tube(round_path(loop, 0.02, 1), 0.010, sides=5, cap=False), 'trim')
    # top vents + chin vent
    for s in (-1, 1):
        part.add(box_f(s * 0.05, 0.03, 0.397, 0.03, 0.16, 0.022, bevel=0.008, segs=1, rx=4), 'trim')
    part.add(box_f(0, 0.228, 0.05, 0.10, 0.02, 0.03, bevel=0.008, segs=1, rx=-8), 'trim')
    # neck roll
    part.add(loft_z([(-0.02, 0.236, -0.188, 0.196, 3.6), (0.012, 0.243, -0.196, 0.203, 3.6)], npts=16, cap1=False), 'trim')
    ob = part.build('helmet', col)
    ob['part'] = 'helmet'
    ob['units'] = 'mini-character native (parent to head bone)'
    return ob

# ----------------------------------------------------------------------------------------------
# export + GLB patch
# ----------------------------------------------------------------------------------------------
BUILDERS = {}

def read_glb(path):
    d = open(path, 'rb').read()
    clen, ctype = struct.unpack('<II', d[12:20])
    j = json.loads(d[20:20 + clen])
    rest = d[20 + clen:]
    return j, rest

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
    for n in j.get('nodes', []):
        nm = n.get('name', '')
        if '@' in nm:
            n['name'] = nm.split('@')[0]
    for m in j.get('materials', []):
        nm = m.get('name', '')
        if '@' in nm:
            m['name'] = nm.split('@')[0]
    j.setdefault('asset', {})['extras'] = {
        'source': 'tools/blender/vehicles.py', 'units': 'metres', 'front': '+Z',
        'note': 'part nodes carry extras.part (three.js userData.part); GLTFLoader suffixes duplicate names'}
    write_glb(path, j, rest)
    return j

def main():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    col = bpy.context.scene.collection
    names = ONLY or list(BUILDERS.keys())
    roots = {}
    for i, name in enumerate(names):
        if name not in BUILDERS:
            continue
        obj = BUILDERS[name](col) if name == 'helmet' else BUILDERS[name]()
        if isinstance(obj, Vehicle):
            root, objs = obj.build(col)
        else:
            root = obj
        roots[name] = root
    # stats
    dg = bpy.context.evaluated_depsgraph_get()
    stats = {}
    for name, root in roots.items():
        tris, mats = 0, set()
        stack = [root]
        while stack:
            o = stack.pop()
            stack.extend(o.children)
            if o.type == 'MESH':
                o.data.calc_loop_triangles()
                tris += len(o.data.loop_triangles)
                mats |= {m.name.split('@')[0] for m in o.data.materials}
        stats[name] = dict(tris=tris, mats=sorted(mats))
        print(f'STAT {name:11s} tris={tris:5d} mats={len(mats)} {sorted(mats)}')
    if TRI_DEBUG is not None:
        for k, n in sorted(TRI_DEBUG.items(), key=lambda kv: -kv[1]):
            print(f'TRIDBG {k[0]:10s} {n:5d}  L{k[1]:4d} {k[2]}')
        for name, root in roots.items():
            for o in root.children_recursive:
                if o.type == 'MESH':
                    o.data.calc_loop_triangles()
                    print(f'TRIOBJ {name:10s} {o.name:24s} {len(o.data.loop_triangles)}')
    if BLEND:
        bpy.ops.wm.save_as_mainfile(filepath=BLEND)
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    bpy.ops.export_scene.gltf(filepath=OUT, export_format='GLB', use_selection=False, export_apply=True,
                              export_extras=True, export_yup=True, export_texcoords=False, export_normals=True,
                              export_animations=False, export_cameras=False, export_lights=False,
                              export_draco_mesh_compression_enable=DRACO, export_draco_mesh_compression_level=10,
                              export_draco_position_quantization=14, export_draco_normal_quantization=10)
    patch_glb(OUT)
    print('WROTE', OUT, os.path.getsize(OUT))
    if REPORT:
        json.dump(stats, open(REPORT, 'w'), indent=1)

BUILDERS.update(rustbucket=build_rustbucket, zippy=build_zippy, vespetta=build_vespetta, volt=build_volt,
                mule=build_mule, viper=build_viper, helmet=build_helmet)

if __name__ == '__main__':
    main()

"""Food Delivery Simulator - street props kit (Blender 5.2, headless, fully procedural).

    blender -b --factory-startup -P tools/blender/props.py -- [--out assets/models/props.glb]
            [--only tree_round_a,bench] [--blend /tmp/props.blend] [--nodraco] [--report stats.json]

Builds the bright "toy city" street-props kit (trees, palms, lamps, traffic light, cafe sets, planters,
street furniture, landmarks, hillside houses) from bmesh primitives and exports ONE Draco GLB.

Conventions (runtime depends on them):
  * metres; glTF +Y up, front +Z.  In Blender (Z up) front is -Y; export_yup does the swap.
  * one top-level node per model, named exactly as the model; one joined mesh, one material `toy`.
  * origin on the ground at the footprint centre (exceptions: `railing` = left end,
    `ferris_wheel_rotor` = hub, its node translation is the hub height).
  * colours live in COLOR_0 (authored as sRGB hex, stored linear via a FLOAT_COLOR corner layer),
    flat per face except foliage gradients (per vertex).
  * material id per face in UV0: u = (id + 0.5) / 16, v = 0.5; faces with different ids never share
    vertices.  0 matte, 2 glass, 3 lamp glass, 5 metal, 7 foliage (wind sway), 9 cloth.
  * extras: nodes carry runtime anchors in glTF axes (traffic-light lens centres, sign-board
    rectangles, ferris hub) as glTF node extras -> three.js userData.
"""
import bpy, bmesh, math, os, sys, json, struct, random
from mathutils import Vector, Matrix, noise
from mathutils.bvhtree import BVHTree

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
def _arg(name, default=None):
    return argv[argv.index(name) + 1] if name in argv else default
OUT = os.path.abspath(_arg('--out', os.path.join(ROOT, 'assets', 'models', 'props.glb')))
ONLY = [s for s in (_arg('--only', '') or '').split(',') if s]
BLEND = _arg('--blend')
DRACO = '--nodraco' not in argv
REPORT = _arg('--report')

V = Vector
PI = math.pi
ZUP = V((0, 0, 1))
ID_MATTE, ID_GLASS, ID_LAMP, ID_METAL, ID_FOLIAGE, ID_CLOTH = 0, 2, 3, 5, 7, 9

# ----------------------------------------------------------------------------------------------
# colour helpers (authored in sRGB, written linear)
# ----------------------------------------------------------------------------------------------
def hx(c):
    if isinstance(c, str):
        h = c.lstrip('#')
        return tuple(int(h[i:i + 2], 16) / 255.0 for i in (0, 2, 4))
    return tuple(c[:3])

def s2l(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4

def lin(c):
    r, g, b = hx(c)
    return (s2l(max(0.0, min(1.0, r))), s2l(max(0.0, min(1.0, g))), s2l(max(0.0, min(1.0, b))), 1.0)

def mix(a, b, t):
    a, b = hx(a), hx(b)
    t = max(0.0, min(1.0, t))
    return tuple(a[i] + (b[i] - a[i]) * t for i in range(3))

def mul(c, k):
    return tuple(min(1.0, v * k) for v in hx(c))

def grad(stops, t):
    if t <= stops[0][0]:
        return hx(stops[0][1])
    for (t0, c0), (t1, c1) in zip(stops[:-1], stops[1:]):
        if t <= t1:
            return mix(c0, c1, (t - t0) / (t1 - t0))
    return hx(stops[-1][1])

PAL = dict(
    trunk='#7a5236', trunk_dk='#5f3e28', soil='#5b3f2b', grate='#3b3d43',
    iron='#24262b', iron2='#30333a', gold='#e0b04a',
    lamp_glass='#ffe6a0',
    wood='#b0703f', wood_lt='#c98a4e', wood_dk='#7d4a2a', rattan='#d39a58',
    terracotta='#c9683b', terra_lt='#dc7f4c', terra_dk='#a6522c',
    marble='#f4efe4', cream='#fbf5e8', white='#fbf8f1',
    red='#e2453a', pink='#f27fb0', yellow='#ffd23f', fwhite='#fff7ec', orange='#ff9a3c', purple='#b07ae0',
    leaf_dk='#3f7a2e', leaf_lt='#a6d64a',
    stone='#e6d0a6', stone_lt='#f3e5c5', stone_dk='#c9ae84', brick='#c8714f',
    copper='#5bb39b', copper_dk='#4a9a84',
    sign_green='#24784a', glass='#bfe3ee', concrete='#808080',
)
LEAF_STOPS = [(0.0, '#285a22'), (0.25, '#3f7a2e'), (0.6, '#6fab3a'), (0.86, '#98cc44'), (1.0, '#aedb4e')]

# ----------------------------------------------------------------------------------------------
# geometry primitives (each returns a fresh bmesh; callers hand it to Model.add)
# ----------------------------------------------------------------------------------------------
def xf(bm, M):
    bmesh.ops.transform(bm, matrix=M, verts=bm.verts)
    return bm

def mv(bm, d):
    bmesh.ops.translate(bm, vec=V(d), verts=bm.verts)
    return bm

def rotz(a):
    return Matrix.Rotation(a, 4, 'Z')

def rotx(a):
    return Matrix.Rotation(a, 4, 'X')

def roty(a):
    return Matrix.Rotation(a, 4, 'Y')

def orient_z(d):
    d = V(d).normalized()
    return ZUP.rotation_difference(d).to_matrix().to_4x4()

def box(c, s, M=None, bevel=0.0):
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.scale(bm, vec=V(s), verts=bm.verts)
    if bevel > 0:
        bmesh.ops.bevel(bm, geom=list(bm.edges) + list(bm.verts), offset=bevel, segments=1,
                        affect='EDGES', profile=0.5, clamp_overlap=True)
    if M is not None:
        xf(bm, M)
    return mv(bm, c)

def beam(p0, p1, w, h=None, up=(0, 0, 1), ext=0.0):
    """box from p0 to p1 with cross-section w (side) x h (up)."""
    h = w if h is None else h
    p0, p1 = V(p0), V(p1)
    d = p1 - p0
    L = d.length
    x = d / L
    u = V(up)
    z = u - x * u.dot(x)
    if z.length < 1e-5:
        u = V((0, 1, 0))
        z = u - x * u.dot(x)
    z.normalize()
    y = z.cross(x)
    M = Matrix(((x.x, y.x, z.x, 0), (x.y, y.y, z.y, 0), (x.z, y.z, z.z, 0), (0, 0, 0, 1)))
    return box((p0 + p1) / 2, (L + 2 * ext, w, h), M)

def _band_layer(bm):
    return bm.faces.layers.int.get('band') or bm.faces.layers.int.new('band')

def lathe(prof, segs=8, phase=None, cap0=True, cap1=True):
    """surface of revolution around +Z. prof = [(r, z), ...] bottom->top along the outer silhouette.
    r == 0 makes an apex. Faces carry int layer 'band' = profile segment index (caps: -1 / -2)."""
    if phase is None:
        phase = PI / segs
    bm = bmesh.new()
    bl = _band_layer(bm)
    sl = bm.faces.layers.int.new('seg')
    angs = [phase + 2 * PI * k / segs for k in range(segs)]
    rings = []
    for r, z in prof:
        if r <= 1e-7:
            rings.append([bm.verts.new((0, 0, z))])
        else:
            rings.append([bm.verts.new((r * math.cos(a), r * math.sin(a), z)) for a in angs])
    for bi, (r0, r1) in enumerate(zip(rings[:-1], rings[1:])):
        if len(r0) == 1 and len(r1) == 1:
            continue
        for k in range(segs):
            k1 = (k + 1) % segs
            if len(r0) == 1:
                f = bm.faces.new((r0[0], r1[k1], r1[k]))
            elif len(r1) == 1:
                f = bm.faces.new((r0[k], r0[k1], r1[0]))
            else:
                f = bm.faces.new((r0[k], r0[k1], r1[k1], r1[k]))
            f[bl] = bi
            f[sl] = k
    if cap0 and len(rings[0]) > 1:
        f = bm.faces.new(list(reversed(rings[0])))
        f[bl] = -1
    if cap1 and len(rings[-1]) > 1:
        f = bm.faces.new(rings[-1])
        f[bl] = -2
    return bm

def cyl(p0, p1, r0, r1=None, segs=8, cap0=True, cap1=True, phase=None):
    r1 = r0 if r1 is None else r1
    p0, p1 = V(p0), V(p1)
    bm = lathe([(r0, 0.0), (r1, (p1 - p0).length)], segs, phase, cap0, cap1)
    xf(bm, orient_z(p1 - p0))
    return mv(bm, p0)

def lathe_at(prof, base, segs=8, axis=(0, 0, 1), **kw):
    bm = lathe(prof, segs, **kw)
    if tuple(axis) != (0, 0, 1):
        xf(bm, orient_z(axis))
    return mv(bm, base)

def tube(pts, radii, segs=6, cap0=True, cap1=True, phase=0.0, n0=None):
    """swept circle along a polyline with parallel-transport frames. 'band' = segment index."""
    pts = [V(p) for p in pts]
    n = len(pts)
    if not hasattr(radii, '__len__'):
        radii = [radii] * n
    T = []
    for i in range(n):
        if i == 0:
            t = pts[1] - pts[0]
        elif i == n - 1:
            t = pts[-1] - pts[-2]
        else:
            t = (pts[i + 1] - pts[i]).normalized() + (pts[i] - pts[i - 1]).normalized()
        T.append(t.normalized())
    a = V(n0) if n0 is not None else (V((0, 0, 1)) if abs(T[0].z) < 0.9 else V((1, 0, 0)))
    N = (a - T[0] * a.dot(T[0])).normalized()
    bm = bmesh.new()
    bl = _band_layer(bm)
    rings = []
    for i in range(n):
        N = (N - T[i] * N.dot(T[i])).normalized()
        B = T[i].cross(N)
        rings.append([bm.verts.new(pts[i] + radii[i] * (N * math.cos(phase + 2 * PI * k / segs) +
                                                        B * math.sin(phase + 2 * PI * k / segs)))
                      for k in range(segs)])
    for bi, (r0, r1) in enumerate(zip(rings[:-1], rings[1:])):
        for k in range(segs):
            k1 = (k + 1) % segs
            f = bm.faces.new((r0[k], r0[k1], r1[k1], r1[k]))
            f[bl] = bi
    if cap0:
        f = bm.faces.new(list(reversed(rings[0])))
        f[bl] = -1
    if cap1:
        f = bm.faces.new(rings[-1])
        f[bl] = -2
    return bm

def torus(R, r, seg_major, seg_minor, phase=0.0):
    """ring in the XZ plane (axle along Y)."""
    bm = bmesh.new()
    rings = []
    for i in range(seg_major):
        a = 2 * PI * i / seg_major
        c = V((R * math.cos(a), 0, R * math.sin(a)))
        radial = V((math.cos(a), 0, math.sin(a)))
        rings.append([bm.verts.new(c + r * (radial * math.cos(phase + 2 * PI * k / seg_minor) +
                                            V((0, 1, 0)) * math.sin(phase + 2 * PI * k / seg_minor)))
                      for k in range(seg_minor)])
    for i in range(seg_major):
        r0, r1 = rings[i], rings[(i + 1) % seg_major]
        for k in range(seg_minor):
            k1 = (k + 1) % seg_minor
            bm.faces.new((r0[k], r1[k], r1[k1], r0[k1]))
    bm.normal_update()
    # make sure the normals point away from the tube centre line
    bm.faces.ensure_lookup_table()
    f = bm.faces[0]
    a = 2 * PI * 0.5 / seg_major
    cl = V((R * math.cos(a), 0, R * math.sin(a)))
    if f.normal.dot(f.calc_center_median() - cl) < 0:
        bmesh.ops.reverse_faces(bm, faces=bm.faces[:])
    return bm

def ico(c, r, sub=2, s=(1, 1, 1)):
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=sub, radius=1.0)
    c = V(c)
    for v in bm.verts:
        v.co = V((v.co.x * s[0] * r + c.x, v.co.y * s[1] * r + c.y, v.co.z * s[2] * r + c.z))
    return bm

def octa(c, r, s=(1, 1, 1)):
    bm = bmesh.new()
    c = V(c)
    P = [V((1, 0, 0)), V((0, 1, 0)), V((-1, 0, 0)), V((0, -1, 0)), V((0, 0, 1)), V((0, 0, -1))]
    vs = [bm.verts.new(c + V((p.x * s[0], p.y * s[1], p.z * s[2])) * r) for p in P]
    for i in range(4):
        j = (i + 1) % 4
        bm.faces.new((vs[i], vs[j], vs[4]))
        bm.faces.new((vs[j], vs[i], vs[5]))
    return bm

def poly(pts):
    bm = bmesh.new()
    bm.faces.new([bm.verts.new(V(p)) for p in pts])
    return bm

def disc(c, r, segs=12, n=(0, 0, 1), phase=None, s=(1, 1)):
    if phase is None:
        phase = PI / segs
    pts = [V((r * s[0] * math.cos(phase + 2 * PI * k / segs), r * s[1] * math.sin(phase + 2 * PI * k / segs), 0))
           for k in range(segs)]
    bm = poly(pts)
    xf(bm, orient_z(n))
    return mv(bm, c)

def quad_on(c, w, h, n=(0, -1, 0), rot=0.0):
    """flat rectangle centred at c facing n (rot: in-plane rotation)."""
    pts = [V((-w / 2, -h / 2, 0)), V((w / 2, -h / 2, 0)), V((w / 2, h / 2, 0)), V((-w / 2, h / 2, 0))]
    bm = poly(pts)
    if rot:
        xf(bm, rotz(rot))
    # local +Y (up in the rectangle) should end up as world +Z when n is horizontal
    n = V(n).normalized()
    if abs(n.z) < 0.99:
        up = V((0, 0, 1))
        x = up.cross(n).normalized()          # right-handed (x, y=up, n)
        y = n.cross(x).normalized()
        M = Matrix(((x.x, y.x, n.x, 0), (x.y, y.y, n.y, 0), (x.z, y.z, n.z, 0), (0, 0, 0, 1)))
        xf(bm, M)
    else:
        xf(bm, orient_z(n))
    return mv(bm, c)

# ----------------------------------------------------------------------------------------------
# model accumulator
# ----------------------------------------------------------------------------------------------
class Model:
    def __init__(self, name):
        self.name = name
        self.bm = bmesh.new()
        self.cl = self.bm.loops.layers.float_color.new('Col')
        self.il = self.bm.faces.layers.int.new('mid')
        self.nl = self.bm.verts.layers.float_vector.new('cn')     # optional custom (foliage) normals
        self.extras = {}
        self.location = (0, 0, 0)

    def add(self, src, col=None, mid=ID_MATTE, smooth=False, vcol=None, fcol=None, back=None, vnorm=None):
        """merge src (consumed). col: hex/tuple; fcol(face, src) -> colour per face;
        vcol(vert, face, src) -> colour per corner; back=dict(col|fcol|vcol, off) adds a flipped copy."""
        src.normal_update()
        self._emit(src, col, mid, smooth, vcol, fcol, False, 0.0, vnorm)
        if back is not None:
            self._emit(src, back.get('col', col), mid, smooth, back.get('vcol'), back.get('fcol'), True,
                       back.get('off', 0.012))
        src.free()
        return self

    def _emit(self, src, col, mid, smooth, vcol, fcol, flip, off, vnorm=None):
        vm = {v: self.bm.verts.new(v.co - v.normal * off if off else v.co.copy()) for v in src.verts}
        if vnorm is not None:
            for v, nv in vm.items():
                nv[self.nl] = vnorm(v)
        for f in src.faces:
            vs = [vm[v] for v in f.verts]
            ls = list(f.loops)
            if flip:
                vs.reverse()
                ls.reverse()
            try:
                nf = self.bm.faces.new(vs)
            except ValueError:
                continue
            nf.smooth = smooth
            nf[self.il] = mid
            fc = fcol(f, src) if fcol else col
            for nl, sl in zip(nf.loops, ls):
                c = vcol(sl.vert, f, src) if vcol else fc
                nl[self.cl] = lin(c)

    def tris(self):
        return sum(len(f.verts) - 2 for f in self.bm.faces)

    def finish(self, col, sharp_deg=48.0):
        bm = self.bm
        zmin = min(v.co.z for v in bm.verts)
        if self.location == (0, 0, 0) and -0.06 < zmin < 0:   # snap tiny dips (tilted legs etc.) onto the ground
            for v in bm.verts:
                v.co.z -= zmin
        bm.normal_update()
        ground = [f for f in bm.faces if f.normal.z < -0.999 and all(abs(v.co.z) < 0.003 for v in f.verts)]
        if ground and self.location == (0, 0, 0):
            bmesh.ops.delete(bm, geom=ground, context='FACES_ONLY')
        for v in [v for v in bm.verts if not v.link_faces]:
            bm.verts.remove(v)
        bm.normal_update()
        lim = math.radians(sharp_deg)
        il = self.il
        split = []
        for e in bm.edges:
            lf = e.link_faces
            if len(lf) != 2:
                e.smooth = False
                continue
            f1, f2 = lf
            if f1[il] != f2[il]:
                split.append(e)
                e.smooth = False
            elif not (f1.smooth and f2.smooth):
                e.smooth = False
            elif f1[il] == ID_FOLIAGE:
                e.smooth = True
            else:
                e.smooth = f1.normal.angle(f2.normal, 0.0) <= lim
        if split:   # faces with different material ids never share vertices
            bmesh.ops.split_edges(bm, edges=split)
        uvl = bm.loops.layers.uv.new('UVMap')
        for f in bm.faces:
            u = (f[il] + 0.5) / 16.0
            for l in f.loops:
                l[uvl].uv = (u, 0.5)
        me = bpy.data.meshes.new(self.name)
        bm.to_mesh(me)
        bm.free()
        if 'mid' in me.attributes:
            me.attributes.remove(me.attributes['mid'])
        cn = me.attributes.get('cn')
        if cn is not None:
            custom = [tuple(d.vector) for d in cn.data]
            if any(c != (0.0, 0.0, 0.0) for c in custom):
                base = [tuple(c.vector) for c in me.corner_normals]
                loops = [custom[l.vertex_index] if custom[l.vertex_index] != (0.0, 0.0, 0.0) else base[i]
                         for i, l in enumerate(me.loops)]
                me.normals_split_custom_set(loops)
            me.attributes.remove(me.attributes['cn'])
        ca = me.color_attributes['Col']
        me.color_attributes.active_color = ca
        me.color_attributes.render_color_index = me.color_attributes.find('Col')
        me.materials.append(toy_material())
        ob = bpy.data.objects.new(self.name, me)
        ob.location = self.location
        for k, v in self.extras.items():
            ob[k] = v
        col.objects.link(ob)
        return ob

_TOY = []
def toy_material():
    if _TOY:
        return _TOY[0]
    m = bpy.data.materials.new('toy')
    m.use_nodes = True
    nt = m.node_tree
    b = nt.nodes['Principled BSDF']
    b.inputs['Roughness'].default_value = 0.75
    a = nt.nodes.new('ShaderNodeVertexColor')
    a.layer_name = 'Col'
    nt.links.new(a.outputs['Color'], b.inputs['Base Color'])
    _TOY.append(m)
    return m

def gl(p):
    """Blender coords -> glTF coords (x, z, -y), rounded."""
    p = V(p)
    return [round(p.x, 4), round(p.z, 4), round(-p.y, 4)]

def band_of(f, src):
    bl = src.faces.layers.int.get('band')
    return f[bl] if bl is not None else 0

def seg_of(f, src):
    sl = src.faces.layers.int.get('seg')
    return f[sl] if sl is not None else 0

# ----------------------------------------------------------------------------------------------
# foliage: blobby canopy with baked sun/AO gradient
# ----------------------------------------------------------------------------------------------
def canopy(m, blobs, seed, lump=0.13, sub=2, squash=0.82, stops=LEAF_STOPS, tint=0.07, soft=0.5, dapple=0.06, subs=None):
    """blobs = [(centre, radius, (sx, sy, sz)), ...] -> overlapping lumpy icospheres, hidden faces culled,
    per-vertex colour: vertical gradient + up-facing light + crevice darkening + per-blob tint."""
    rnd = random.Random(seed)
    blobs = [(V(c), r, s) for c, r, s in blobs]
    zlo = min(c.z - r * s[2] * squash for c, r, s in blobs)
    zhi = max(c.z + r * s[2] for c, r, s in blobs)
    cen = sum((c for c, r, s in blobs), V()) / len(blobs)
    xlo = min(c.x - r * s[0] for c, r, s in blobs); xhi = max(c.x + r * s[0] for c, r, s in blobs)
    ylo = min(c.y - r * s[1] for c, r, s in blobs); yhi = max(c.y + r * s[1] for c, r, s in blobs)
    ecen = V(((xlo + xhi) / 2, (ylo + yhi) / 2, (zlo + zhi) / 2))
    erad = V(((xhi - xlo) / 2, (yhi - ylo) / 2, (zhi - zlo) / 2))
    tints = [rnd.uniform(-tint, tint) for _ in blobs]
    hues = [rnd.uniform(-1, 1) for _ in blobs]

    def ed(p, j):
        c, r, s = blobs[j]
        d = p - c
        return math.sqrt((d.x / (r * s[0])) ** 2 + (d.y / (r * s[1])) ** 2 + (d.z / (r * s[2])) ** 2)

    for i, (c, r, s) in enumerate(blobs):
        bm = bmesh.new()
        bmesh.ops.create_icosphere(bm, subdivisions=subs[i] if subs else sub, radius=1.0)
        off = V((rnd.uniform(0, 40), rnd.uniform(0, 40), rnd.uniform(0, 40)))
        bmesh.ops.rotate(bm, cent=(0, 0, 0), matrix=Matrix.Rotation(rnd.uniform(0, 2 * PI), 3, 'Z'), verts=bm.verts)
        for v in bm.verts:
            d = v.co.normalized()
            k = 1.0 + lump * (0.9 * noise.noise(d * 1.05 + off) + 0.2 * noise.noise(d * 2.0 + off * 1.7))
            sz = s[2] * (squash if d.z < 0 else 1.0)
            v.co = c + V((d.x * s[0], d.y * s[1], d.z * sz)) * r * k
        others = [j for j in range(len(blobs)) if j != i]
        bm.faces.ensure_lookup_table()
        kill = [f for f in bm.faces
                if any(all(ed(v.co, j) < 1.0 - lump * 1.05 for v in f.verts) for j in others)]
        if kill:
            bmesh.ops.delete(bm, geom=kill, context='FACES')
        bm.normal_update()

        def vc(v, f, src, i=i):
            p = v.co
            t = max(0.0, min(1.0, (p.z - zlo) / (zhi - zlo)))
            nz = max(-1.0, min(1.0, v.normal.z))
            outward = v.normal.dot((p - cen).normalized())
            L = 0.02 + 0.78 * t ** 1.15 + 0.3 * (0.5 + 0.5 * nz) ** 1.6 + tints[i]
            L -= 0.22 * max(0.0, -outward)
            L -= 0.12 * max(0.0, -nz) * (1.0 - t)
            cre = 1.0
            for j in others:
                e = ed(p, j)
                if e < 1.38:
                    cre = min(cre, 0.48 + 0.52 * max(0.0, (e - 0.95) / 0.43) ** 0.8)
            L *= cre
            L *= 1.0 + dapple * noise.noise(p * 2.4 + V((seed, 0, 0)))
            col = grad(stops, L)
            h = hues[i]
            return mix(col, '#c9e25a' if h > 0 else '#3f8c50', abs(h) * 0.10 * min(1.0, L + 0.2))
        def vn(v):
            q = v.co - ecen
            en = V((q.x / erad.x ** 2, q.y / erad.y ** 2, q.z / erad.z ** 2)).normalized()
            return (v.normal * (1.0 - soft) + en * soft).normalized()
        m.add(bm, mid=ID_FOLIAGE, smooth=True, vcol=vc, vnorm=vn if soft > 0 else None)

def _hemi_dirs(n=24):
    out = []
    ga = PI * (3 - math.sqrt(5))
    for i in range(n):
        z = 1 - (i + 0.5) / n            # cosine-ish spread over the upper hemisphere
        r = math.sqrt(max(0.0, 1 - z * z))
        out.append(V((r * math.cos(ga * i), r * math.sin(ga * i), z)))
    return out
HEMI = _hemi_dirs()

def canopy_shell(m, blobs, seed, tris=560, lump=0.07, sub=4, smooth_iter=0, stops=LEAF_STOPS, tint=0.06,
                 soft=0.25, dapple=0.06, ao=0.65, ground_clip=None):
    """one smooth canopy surface = outer envelope (seen from the canopy centre) of overlapping lumpy ellipsoid
    blobs, relaxed, decimated to ~tris. Colour per vertex: vertical sun gradient + up-facing light + ray-cast AO
    in the creases between clumps + per-clump tint + dapple. Normals blended toward the canopy ellipsoid."""
    rnd = random.Random(seed)
    blobs = [(V(c), r, s) for c, r, s in blobs]
    xlo = min(c.x - r * s[0] for c, r, s in blobs); xhi = max(c.x + r * s[0] for c, r, s in blobs)
    ylo = min(c.y - r * s[1] for c, r, s in blobs); yhi = max(c.y + r * s[1] for c, r, s in blobs)
    zlo = min(c.z - r * s[2] for c, r, s in blobs); zhi = max(c.z + r * s[2] for c, r, s in blobs)
    ecen = V(((xlo + xhi) / 2, (ylo + yhi) / 2, (zlo + zhi) / 2))
    erad = V(((xhi - xlo) / 2, (yhi - ylo) / 2, (zhi - zlo) / 2))
    offs = [V((rnd.uniform(0, 50), rnd.uniform(0, 50), rnd.uniform(0, 50))) for _ in blobs]
    tints = [rnd.uniform(-tint, tint) for _ in blobs]
    hues = [rnd.uniform(-1, 1) for _ in blobs]
    def far_hit(o, d, j):
        c, r, s = blobs[j]
        sc = V((r * s[0], r * s[1], r * s[2]))
        oo = V(((o.x - c.x) / sc.x, (o.y - c.y) / sc.y, (o.z - c.z) / sc.z))
        dd = V((d.x / sc.x, d.y / sc.y, d.z / sc.z))
        a, b, cc = dd.dot(dd), oo.dot(dd), oo.dot(oo) - 1.0
        disc_ = b * b - a * cc
        if disc_ < 0:
            return None
        t = (-b + math.sqrt(disc_)) / a
        if t <= 0:
            return None
        # lumpy: modulate by noise on the blob's own surface direction
        hp = oo + dd * t
        k = 1.0 + lump * (noise.noise(hp * 1.3 + offs[j]) + 0.4 * noise.noise(hp * 2.6 + offs[j] * 1.3))
        return t * k
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=sub, radius=1.0)
    for v in bm.verts:
        d = v.co.normalized()
        best = 0.3
        for j in range(len(blobs)):
            t = far_hit(ecen, d, j)
            if t is not None and t > best:
                best = t
        v.co = ecen + d * best
    for _ in range(smooth_iter):
        bmesh.ops.smooth_vert(bm, verts=bm.verts, factor=0.5, use_axis_x=True, use_axis_y=True, use_axis_z=True)
    # decimate to budget
    me = bpy.data.meshes.new('_canopy_tmp')
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new('_canopy_tmp', me)
    bpy.context.scene.collection.objects.link(ob)
    mod = ob.modifiers.new('dec', 'DECIMATE')
    mod.decimate_type = 'COLLAPSE'
    mod.ratio = tris / len(me.polygons)
    mod.use_collapse_triangulate = True
    dg = bpy.context.evaluated_depsgraph_get()
    ev = ob.evaluated_get(dg)
    bm = bmesh.new()
    bm.from_mesh(ev.to_mesh())
    ev.to_mesh_clear()
    bpy.data.objects.remove(ob, do_unlink=True)
    bpy.data.meshes.remove(me)
    bmesh.ops.triangulate(bm, faces=bm.faces[:])
    if ground_clip is not None:
        for v in bm.verts:
            v.co.z = max(ground_clip, v.co.z)
    bm.normal_update()
    tree_bvh = BVHTree.FromBMesh(bm)
    def ed(p, j):
        c, r, s = blobs[j]
        d = p - c
        return math.sqrt((d.x / (r * s[0])) ** 2 + (d.y / (r * s[1])) ** 2 + (d.z / (r * s[2])) ** 2)
    occl = {}
    for v in bm.verts:
        n = v.normal
        q = n.to_track_quat('Z', 'Y').to_matrix()
        hits = 0
        for hd in HEMI:
            dirw = q @ hd
            loc, nn, idx, dist = tree_bvh.ray_cast(v.co + n * 0.03, dirw, 3.0)
            if loc is not None:
                hits += 1
        occl[v] = hits / len(HEMI)
    def vc(v, f, src):
        p = v.co
        t = max(0.0, min(1.0, (p.z - zlo) / (zhi - zlo)))
        nz = max(-1.0, min(1.0, v.normal.z))
        j = min(range(len(blobs)), key=lambda k: abs(ed(p, k) - 1.0))
        L = 0.04 + 0.8 * t ** 0.95 + 0.3 * (0.5 + 0.5 * nz) ** 1.5 + tints[j]
        L -= 0.12 * max(0.0, -nz) * (1.0 - t)
        L *= 1.0 - ao * occl[v] ** 0.9
        L *= 1.0 + dapple * noise.noise(p * 2.4 + V((seed, 0, 0)))
        col = grad(stops, L)
        h = hues[j]
        return mix(col, '#c9e25a' if h > 0 else '#3f8c50', abs(h) * 0.1 * min(1.0, L + 0.2))
    def vn(v):
        q = v.co - ecen
        en = V((q.x / erad.x ** 2, q.y / erad.y ** 2, q.z / erad.z ** 2)).normalized()
        return (v.normal * (1.0 - soft) + en * soft).normalized()
    m.add(bm, mid=ID_FOLIAGE, smooth=True, vcol=vc, vnorm=vn if soft > 0 else None)

def grate(m, r_out=0.62, r_in=0.36, segs=10):
    m.add(lathe([(r_out, 0.0), (r_out, 0.04), (r_in, 0.04), (r_in, 0.015)], segs, cap0=False, cap1=False),
          PAL['grate'], ID_METAL)
    m.add(disc((0, 0, 0.015), r_in, segs), PAL['soil'])

def trunk(m, h, r0, r1, segs=7, col=None, flare=1.55):
    col = col or PAL['trunk']
    prof = [(r0 * flare, 0.0), (r0 * 1.12, 0.22), (r0, 0.5), (r1 * 1.05, h * 0.7), (r1, h)]
    m.add(lathe(prof, segs, cap0=False, cap1=True), col, smooth=True)

def branch(m, p0, p1, r0, r1, bendz=0.25, segs=5, col=None):
    p0, p1 = V(p0), V(p1)
    mid = (p0 + p1) / 2 + V((0, 0, bendz))
    m.add(tube([p0, mid, p1], [r0, (r0 + r1) / 2, r1], segs, cap0=False, cap1=True), col or PAL['trunk'], smooth=True)

def ring_blobs(n, dist, z, r, rnd, sx=1.0, sz=0.9, jz=0.25, jr=0.1, a0=0.0):
    out = []
    for k in range(n):
        a = a0 + 2 * PI * k / n + rnd.uniform(-0.25, 0.25)
        d = dist * rnd.uniform(0.92, 1.08)
        out.append(((d * math.cos(a), d * math.sin(a), z + rnd.uniform(-jz, jz)),
                    r * rnd.uniform(1 - jr, 1 + jr), (sx, sx, sz)))
    return out

def bumps(blobs, idx, n, seed, k=0.42, zmin=0.0):
    """small clumps on the outer/upper surface of the given main blobs (breaks the round silhouette)."""
    rnd = random.Random(seed)
    out = []
    cen = sum((V(b[0]) for b in blobs), V()) / len(blobs)
    for j in range(n):
        c, r, s = blobs[idx[j % len(idx)]]
        c = V(c)
        for _ in range(20):
            d = V((rnd.uniform(-1, 1), rnd.uniform(-1, 1), rnd.uniform(zmin, 1))).normalized()
            if d.dot((c - cen).normalized() if (c - cen).length > 0.1 else V((0, 0, 1))) > 0.1:
                break
        out.append((c + V((d.x * s[0], d.y * s[1], d.z * s[2])) * r * 0.86, r * k * rnd.uniform(0.85, 1.15), (1, 1, 0.92)))
    return out

def tree(name, seed, trunk_h, r0, r1, blobs, branches, grate_r=(0.62, 0.36, 8), tsegs=6, ctris=540):
    m = Model(name)
    grate(m, *grate_r)
    trunk(m, trunk_h, r0, r1, segs=tsegs)
    for c in branches:
        branch(m, (0, 0, trunk_h * 0.62), (c[0] * 0.72, c[1] * 0.72, c[2] - 0.35), r1 * 0.75, r1 * 0.45, 0.2, segs=4)
    canopy_shell(m, blobs, seed, tris=ctris)
    return m

def ring(n, dist, z, r, seed, sz=0.9, jz=0.22, jr=0.08, a0=0.0, sx=1.0):
    return ring_blobs(n, dist, z, r, random.Random(seed), sx=sx, sz=sz, jz=jz, jr=jr, a0=a0)

def build_tree_round_a():
    blobs = [((0, 0, 4.4), 1.45, (1, 1, 0.9))]
    blobs += ring(5, 1.42, 3.95, 1.08, 11, a0=0.3)
    blobs += [((0.4, -0.3, 5.56), 1.0, (1, 1, 0.95)), ((-0.55, 0.4, 5.2), 0.92, (1, 1, 0.95))]
    return tree('tree_round_a', 101, 3.4, 0.21, 0.14, blobs, [b[0] for b in blobs[1:6:2]], ctris=538)

def build_tree_round_b():
    blobs = [((0, 0, 4.6), 1.3, (1, 1, 1.0)), ((0.05, 0.0, 6.15), 1.2, (1, 1, 1.0))]
    blobs += ring(3, 1.0, 4.3, 1.0, 23, sz=1.05, a0=0.2)
    blobs += ring(2, 0.85, 6.0, 0.9, 24, sz=1.05, a0=1.1)
    blobs += [((-0.05, -0.05, 7.2), 0.82, (1, 1, 0.98))]
    return tree('tree_round_b', 202, 4.3, 0.22, 0.14, blobs, [b[0] for b in blobs[2:5]], ctris=538)

def build_tree_round_c():
    blobs = [((0, 0, 3.15), 1.05, (1, 1, 0.9))]
    blobs += ring(4, 0.98, 2.95, 0.78, 37, a0=0.7)
    blobs += [((0.12, -0.05, 3.88), 0.68, (1, 1, 0.95))]
    return tree('tree_round_c', 303, 2.5, 0.16, 0.11, blobs, [b[0] for b in blobs[1:4]],
                grate_r=(0.52, 0.3, 8), tsegs=6, ctris=520)

def build_bush_a():
    m = Model('bush_a')
    blobs = [((0, 0, 0.52), 0.42, (1, 1, 0.98)),
             ((0.3, -0.12, 0.36), 0.32, (1, 1, 0.95)),
             ((-0.27, -0.2, 0.35), 0.31, (1, 1, 0.95)),
             ((-0.05, 0.3, 0.36), 0.32, (1, 1, 0.95)),
             ((0.12, -0.08, 0.78), 0.27, (1, 1, 0.95))]
    canopy_shell(m, blobs, 404, tris=270, sub=3, ground_clip=0.04, lump=0.1)
    zmin = min(v.co.z for v in m.bm.verts)
    for v in m.bm.verts:
        v.co.z -= zmin
    return m

# ----------------------------------------------------------------------------------------------
# palms
# ----------------------------------------------------------------------------------------------
def palm(name, seed, H, nseg, nfr, lean_az, bend, flen, wid=0.34):
    m = Model(name)
    rnd = random.Random(seed)
    Ht = H - 1.05
    ldir = V((math.cos(lean_az), math.sin(lean_az), 0))
    sdir = V((-ldir.y, ldir.x, 0))
    def spine(t):
        return ldir * (bend * t ** 1.8) + sdir * (0.18 * math.sin(t * PI * 1.2)) + V((0, 0, Ht * t))
    def rad(t):
        return 0.29 - 0.11 * t
    pts, radii = [spine(0), spine(0.035)], [0.42, 0.31]
    eps = 0.035
    for i in range(nseg):
        t0, t1 = i / nseg, (i + 1) / nseg
        if i > 0:
            pts.append(spine(t0 + eps))
            radii.append(rad(t0) * 0.80)
        pts.append(spine(t1 - eps * 0.4))
        radii.append(rad(t0) * 1.04)
    # band 0 = root flare, then body/step alternate
    seg_cols = ['#9a7350', '#8a6443']
    def fc(f, src):
        b = band_of(f, src)
        if b < 0:
            return '#6f5034'
        if b == 0:
            return '#8a6443'
        k = b - 1
        if k % 2 == 1:
            return '#6a4c31'          # step ring between segments
        return seg_cols[(k // 2) % 2]
    tb = tube(pts, radii, 6, cap0=False, cap1=True)
    for v in tb.verts:
        v.co.z = max(0.0, v.co.z)
    m.add(tb, fcol=fc, smooth=False)
    top = spine(1.0) + V((0, 0, 0.05))
    m.add(ico(top + V((0, 0, 0.04)), 0.34, 1, (1, 1, 0.75)), '#5f8a34', smooth=True)
    for k in range(3):
        a = lean_az + 2 * PI * k / 3 + 0.4
        m.add(ico(top + V((0.24 * math.cos(a), 0.24 * math.sin(a), -0.24)), 0.15, 1), '#6a4528', smooth=True)
    for k in range(nfr):
        az = 2 * PI * k / nfr + rnd.uniform(-0.18, 0.18)
        h = V((math.cos(az), math.sin(az), 0))
        side = V((-h.y, h.x, 0))
        e0 = math.radians(rnd.uniform(48, 66) if k % 2 else rnd.uniform(28, 46))
        dr = math.radians(rnd.uniform(118, 138) if k % 2 else rnd.uniform(118, 140))
        L = flen * rnd.uniform(0.86, 1.08)
        W = wid * rnd.uniform(0.9, 1.1)
        n = 6
        sp = [top.copy()]
        p = top.copy()
        for j in range(1, n):
            s = j / (n - 1)
            pitch = e0 - dr * s ** 1.45
            p = p + (L / (n - 1)) * (h * math.cos(pitch) + ZUP * math.sin(pitch))
            sp.append(p.copy())
        bm = bmesh.new()
        svals = {}
        mids, lefts, rights = [], [], []
        for j, q in enumerate(sp):
            s = j / (n - 1)
            if j == 0:
                t = (sp[1] - sp[0]).normalized()
            elif j == n - 1:
                t = (sp[-1] - sp[-2]).normalized()
            else:
                t = (sp[j + 1] - sp[j - 1]).normalized()
            nrm = t.cross(side).normalized()
            mv_ = bm.verts.new(q)
            svals[mv_] = (s, 0)
            mids.append(mv_)
            if j < n - 1:
                w = W * math.sin(PI * min(1.0, 0.1 + s * 0.98)) ** 0.7
                w *= 1.0 if j % 2 == 1 else 0.74
                fold = 0.36 * w
                fwd = t * 0.0
                lv = bm.verts.new(q + side * w - nrm * fold + fwd)
                rv = bm.verts.new(q - side * w - nrm * fold + fwd)
                svals[lv] = (s, 1)
                svals[rv] = (s, 1)
                lefts.append(lv)
                rights.append(rv)
        for j in range(n - 2):
            bm.faces.new((mids[j], mids[j + 1], lefts[j + 1], lefts[j]))
            bm.faces.new((mids[j], rights[j], rights[j + 1], mids[j + 1]))
        bm.faces.new((mids[n - 2], mids[n - 1], lefts[n - 2]))
        bm.faces.new((mids[n - 2], rights[n - 2], mids[n - 1]))
        def top_c(v, f, src, svals=svals):
            s, e = svals.get(v, (0.5, 1))
            c = grad([(0.0, '#4f8a30'), (0.45, '#8cc843'), (1.0, '#a6d64a')], s)
            return mul(c, 0.86) if e else mul(c, 1.06)
        def bot_c(v, f, src, svals=svals):
            s, e = svals.get(v, (0.5, 1))
            return grad([(0.0, '#335f24'), (0.5, '#3f7a2e'), (1.0, '#5f9a38')], s)
        m.add(bm, mid=ID_FOLIAGE, smooth=True, vcol=top_c, back=dict(vcol=bot_c, off=0.014))
    return m

def build_palm_a():
    return palm('palm_a', 7, 8.6, 7, 9, 0.6, 0.85, 4.0, wid=0.52)

def build_palm_b():
    return palm('palm_b', 19, 9.0, 7, 9, 2.4, 1.25, 4.1, wid=0.5)

# ----------------------------------------------------------------------------------------------
# lights
# ----------------------------------------------------------------------------------------------
LAMP_POST = [(0.32, 0.0), (0.32, 0.13), (0.25, 0.18), (0.21, 0.36), (0.22, 0.52), (0.14, 0.8),
             (0.105, 1.05), (0.14, 1.08), (0.14, 1.16), (0.09, 1.2)]

def lantern(m, base, s=1.0, bars=True):
    b = V(base)
    def L(prof):
        return [(r * s, z * s) for r, z in prof]
    # glass = outward-facing panes only, recessed ~2 cm inside the frame (cup lip, roof lip, corner bars) so no frame
    # face ever lies on or grazes a pane; its ends tuck 5 mm into the closed cup / roof solids (crisp intersections).
    m.add(lathe_at(L([(0.03, -0.04), (0.11, 0.03), (0.165, 0.1)]), b, 6, cap0=True, cap1=True), PAL['iron'], ID_METAL, smooth=False)
    m.add(lathe_at(L([(0.14, 0.095), (0.19, 0.505)]), b, 6, cap0=False, cap1=False), PAL['lamp_glass'], ID_LAMP)
    m.add(lathe_at(L([(0.225, 0.5), (0.29, 0.53), (0.29, 0.57), (0.14, 0.72), (0.05, 0.8)]), b, 6, cap0=True, cap1=True),
          PAL['iron'], ID_METAL)
    # corner frame bars: centre line 2.5 cm outside the glass corners (bar radius 1.4 cm -> clear of the panes)
    for k in range(6 if bars else 0):
        a = PI / 6 + 2 * PI * k / 6
        d = V((math.cos(a), math.sin(a), 0))
        m.add(tube([b + d * 0.165 * s + V((0, 0, 0.1 * s)), b + d * 0.215 * s + V((0, 0, 0.5 * s))], 0.014 * s, 3,
                   cap0=False, cap1=False), PAL['iron'], ID_METAL)
    m.add(octa(b + V((0, 0, 0.86 * s)), 0.07 * s, (1, 1, 1.3)), PAL['gold'], ID_METAL, smooth=True)

def build_street_lamp():
    m = Model('street_lamp')
    prof = LAMP_POST + [(0.08, 3.36), (0.115, 3.4), (0.115, 3.46), (0.07, 3.5)]
    m.add(lathe(prof, 8, cap0=False, cap1=True), PAL['iron'], ID_METAL, smooth=True)
    # ladder rest crossbar under the lantern
    m.add(beam((-0.34, 0, 3.16), (0.34, 0, 3.16), 0.045), PAL['iron'], ID_METAL)
    for sx in (-1, 1):
        m.add(octa((sx * 0.35, 0, 3.16), 0.05), PAL['gold'], ID_METAL, smooth=True)
    lantern(m, (0, 0, 3.5), 1.15)
    return m

def build_street_lamp_double():
    m = Model('street_lamp_double')
    prof = LAMP_POST + [(0.08, 3.2), (0.115, 3.24), (0.115, 3.32), (0.05, 3.62), (0.0, 3.72)]
    m.add(lathe(prof, 8, cap0=False, cap1=False), PAL['iron'], ID_METAL, smooth=True)
    m.add(octa((0, 0, 3.76), 0.065, (1, 1, 1.3)), PAL['gold'], ID_METAL, smooth=True)
    zb = 3.3
    m.add(tube([(-0.68, 0, zb), (0.68, 0, zb)], 0.04, 6), PAL['iron'], ID_METAL, smooth=True)
    for sx in (-1, 1):
        # decorative scroll under the bar
        pts = [(sx * 0.07, 0, zb - 0.55)] + [(sx * (0.08 + 0.5 * (k / 5) ** 0.8), 0, zb - 0.55 + 0.5 * math.sin(k / 5 * PI * 0.5)) for k in range(1, 6)]
        m.add(tube(pts, 0.03, 4, cap0=False, cap1=False), PAL['iron'], ID_METAL, smooth=True)
        m.add(octa((sx * 0.71, 0, zb), 0.055), PAL['gold'], ID_METAL, smooth=True)
        m.add(cyl((sx * 0.6, 0, zb - 0.02), (sx * 0.6, 0, zb + 0.115), 0.05, 0.05, 6), PAL['iron'], ID_METAL)
        lantern(m, (sx * 0.6, 0, zb + 0.14), 1.0, bars=False)
    return m

def build_traffic_light():
    m = Model('traffic_light')
    prof = [(0.17, 0.0), (0.17, 0.07), (0.13, 0.11), (0.13, 0.28), (0.08, 0.36), (0.066, 0.55), (0.062, 4.05),
            (0.085, 4.08), (0.085, 4.16), (0.045, 4.22), (0.0, 4.3)]
    m.add(lathe(prof, 8, cap0=False), PAL['iron'], ID_METAL, smooth=True)
    hx_, hz = -0.92, 3.3
    za = 3.96
    m.add(tube([(0, 0, za), (hx_ - 0.06, 0, za)], 0.045, 6, cap0=False), PAL['iron'], ID_METAL, smooth=True)
    m.add(beam((0, 0, 3.55), (-0.5, 0, za - 0.02), 0.035), PAL['iron'], ID_METAL)
    m.add(box((hx_, 0, 3.86), (0.09, 0.09, 0.16)), PAL['iron'], ID_METAL)
    # signal head (front = -Y in Blender = +Z glTF)
    m.add(box((hx_, 0, hz), (0.36, 0.28, 1.0), bevel=0.045), '#1e2025', ID_MATTE)
    m.add(box((hx_, 0.165, hz), (0.54, 0.03, 1.16), bevel=0.012), '#1a1c20', ID_MATTE)
    yf = -0.14
    lens = {}
    for name, dz, col in (('red', 0.31, '#6e1a14'), ('yellow', 0.0, '#6e5512'), ('green', -0.31, '#0f5a33')):
        c = V((hx_, yf - 0.006, hz + dz))
        m.add(disc(c, 0.108, 10, (0, -1, 0)), col, ID_GLASS)
        lens[name] = gl(c)
        # visor: half hood over the lens, longer on top
        bm = bmesh.new()
        ro, ri = 0.135, 0.12
        outer0, outer1, inner0, inner1 = [], [], [], []
        for k in range(6):
            a = PI * k / 5 * 1.12 - PI * 0.06
            ca, sa = math.cos(a), math.sin(a)
            ln = 0.07 + 0.13 * max(0.0, sa)
            outer0.append(bm.verts.new((hx_ + ro * ca, yf, hz + dz + ro * sa)))
            outer1.append(bm.verts.new((hx_ + ro * ca, yf - ln, hz + dz + ro * sa)))
            inner0.append(bm.verts.new((hx_ + ri * ca, yf, hz + dz + ri * sa)))
            inner1.append(bm.verts.new((hx_ + ri * ca, yf - ln, hz + dz + ri * sa)))
        for k in range(5):
            bm.faces.new((outer0[k], outer0[k + 1], outer1[k + 1], outer1[k]))
            bm.faces.new((inner0[k + 1], inner0[k], inner1[k], inner1[k + 1]))
            bm.faces.new((outer1[k], outer1[k + 1], inner1[k + 1], inner1[k]))
        m.add(bm, '#1e2025', ID_MATTE)
    m.extras['lens_red'] = lens['red']
    m.extras['lens_yellow'] = lens['yellow']
    m.extras['lens_green'] = lens['green']
    m.extras['lens_radius'] = 0.108
    m.lens = lens
    return m

# ----------------------------------------------------------------------------------------------
# street furniture
# ----------------------------------------------------------------------------------------------
def chair(m, pos, face_dir, seat_col, rnd=None):
    """bistro chair at pos facing face_dir (angle in XY of the direction the sitter looks)."""
    M = Matrix.Translation(V(pos)) @ rotz(face_dir + PI / 2)
    def put(bm):
        return xf(bm, M)
    # local: front = -Y
    m.add(put(cyl((0, 0, 0.42), (0, 0, 0.48), 0.215, 0.215, 8)), seat_col, smooth=False)
    for sx in (-1, 1):
        for sy in (-1, 1):
            top = (sx * 0.13, sy * 0.13, 0.44)
            bot = (sx * 0.18, sy * 0.18, 0.0)
            m.add(put(beam(bot, top, 0.036)), PAL['iron'], ID_METAL)
    for sx in (-1, 1):
        m.add(put(beam((sx * 0.13, 0.13, 0.46), (sx * 0.15, 0.2, 0.9), 0.036)), PAL['iron'], ID_METAL)
    # curved back band
    bm = bmesh.new()
    rows = []
    for z in (0.66, 0.9):
        row = []
        for k in range(6):
            a = PI * (0.18 + 0.64 * k / 5)
            row.append(bm.verts.new((-0.2 * math.cos(a), 0.03 + 0.18 * math.sin(a) + (z - 0.68) * 0.12, z)))
        rows.append(row)
    for k in range(5):
        bm.faces.new((rows[0][k], rows[0][k + 1], rows[1][k + 1], rows[1][k]))
    bm.normal_update()
    bm.faces.ensure_lookup_table()
    if bm.faces[2].normal.y > 0:
        bmesh.ops.reverse_faces(bm, faces=bm.faces[:])
    m.add(put(bm), seat_col, back=dict(col=mul(seat_col, 0.85), off=0.03))

def parasol(m, colA, colB, R=1.2, top=2.6):
    m.add(cyl((0, 0, 0.0), (0, 0, top - 0.05), 0.026, 0.026, 6, cap0=False), '#e9e4da', ID_METAL)
    m.add(lathe([(0.24, 0.0), (0.24, 0.05), (0.06, 0.09)], 8, cap0=False, cap1=True), PAL['iron2'], ID_METAL)
    n = 8
    apex = V((0, 0, top - 0.04))
    zm, zr = top - 0.17, top - 0.46
    mids = [V((0.6 * math.cos(2 * PI * k / n), 0.6 * math.sin(2 * PI * k / n), zm)) for k in range(n)]
    rims = [V((R * math.cos(2 * PI * k / n), R * math.sin(2 * PI * k / n), zr)) for k in range(n)]
    for k in range(n):
        k1 = (k + 1) % n
        bm = bmesh.new()
        a = bm.verts.new(apex)
        m0, m1 = bm.verts.new(mids[k]), bm.verts.new(mids[k1])
        r0, r1 = bm.verts.new(rims[k]), bm.verts.new(rims[k1])
        d0, d1 = bm.verts.new(rims[k] - V((0, 0, 0.15))), bm.verts.new(rims[k1] - V((0, 0, 0.15)))
        mid_low = bm.verts.new((rims[k] + rims[k1]) / 2 * 0.99 - V((0, 0, 0.24)))
        bm.faces.new((a, m0, m1))
        bm.faces.new((m0, r0, r1, m1))
        bm.faces.new((r0, d0, mid_low, d1, r1))
        c = colA if k % 2 == 0 else colB
        m.add(bm, c, ID_CLOTH, back=dict(col=mul(c, 0.8), off=0.012))
    m.add(ico(apex + V((0, 0, 0.03)), 0.055, 1), PAL['wood_dk'], smooth=True)

def build_cafe_set(name, colA, colB, square=False, seat_col=None):
    m = Model(name)
    seat_col = seat_col or PAL['rattan']
    if square:
        m.add(box((0, 0, 0.735), (0.72, 0.72, 0.045), bevel=0.012), PAL['wood_lt'])
        for sx in (-1, 1):
            for sy in (-1, 1):
                m.add(beam((sx * 0.29, sy * 0.29, 0.0), (sx * 0.29, sy * 0.29, 0.715), 0.04), PAL['iron'], ID_METAL)
    else:
        m.add(cyl((0, 0, 0.71), (0, 0, 0.755), 0.42, 0.42, 12), PAL['marble'])
        m.add(lathe([(0.25, 0.0), (0.25, 0.03), (0.07, 0.07), (0.035, 0.12), (0.035, 0.66), (0.09, 0.71)], 6,
                    cap0=False, cap1=False), PAL['iron'], ID_METAL, smooth=True)
    tz = 0.76
    for (x, y) in ((0.17, -0.12), (-0.16, 0.1)):
        m.add(cyl((x, y, tz), (x, y, tz + 0.07), 0.04, 0.045, 6, cap0=False), PAL['white'])
        m.add(disc((x, y, tz + 0.074), 0.033, 6), '#6b3f22')
    m.add(cyl((0.02, 0.2, tz), (0.02, 0.2, tz + 0.13), 0.03, 0.035, 6, cap0=False), '#7fc3d8', ID_GLASS)
    m.add(ico((0.02, 0.2, tz + 0.17), 0.06, 1), PAL['red'] if not square else PAL['yellow'], ID_FOLIAGE, smooth=True)
    for sx in (-1, 1):
        chair(m, (sx * 0.66, 0.02 * sx, 0.0), 0.0 if sx < 0 else PI, seat_col)
    parasol(m, colA, colB)
    return m

def build_cafe_set_a():
    return build_cafe_set('cafe_set_a', '#e3433b', '#fbf6ee')

def build_cafe_set_b():
    return build_cafe_set('cafe_set_b', '#2f9a5a', '#fbf6ee', square=True, seat_col='#c47f45')

FLOWER_COLS = [PAL['red'], PAL['pink'], PAL['yellow'], PAL['fwhite'], '#ff6f61', PAL['pink'], PAL['red']]

def leaf_mound(m, blobs, seed, lump=0.12):
    canopy(m, blobs, seed, lump=lump, sub=1, squash=0.7,
           stops=[(0.0, '#2c6125'), (0.3, '#3f7a2e'), (0.7, '#6aa83a'), (1.0, '#93c845')], tint=0.05)

def flowers(m, pts, rnd, r=0.075, sub=0):
    for i, p in enumerate(pts):
        c = FLOWER_COLS[i % len(FLOWER_COLS)]
        rr = r * rnd.uniform(0.85, 1.2)
        if sub == 0:
            bm = octa(p, rr, (1, 1, 0.7))
            xf(mv(bm, -V(p)), rotz(rnd.uniform(0, PI)))
            mv(bm, p)
        else:
            bm = ico(p, rr, 1, (1, 1, 0.72))
        hi = mul(c, 1.04)
        lo = mul(c, 0.78)
        m.add(bm, mid=ID_FOLIAGE, smooth=True,
              vcol=lambda v, f, src, p=V(p), hi=hi, lo=lo: lo if v.co.z < p.z - rr * 0.2 else hi)

def build_planter():
    m = Model('planter')
    rnd = random.Random(5)
    L, W, H = 1.6, 0.5, 0.5
    for sx in (-1, 1):
        for sy in (-1, 1):
            m.add(box((sx * (L / 2 - 0.045), sy * (W / 2 - 0.045), H / 2), (0.09, 0.09, H)), PAL['wood_dk'])
    for i, z in enumerate((0.13, 0.36)):
        for sy in (-1, 1):
            m.add(box((0, sy * (W / 2 - 0.035), z), (L - 0.12, 0.05, 0.215)), PAL['wood'] if i == 0 else PAL['wood_lt'])
    for sx in (-1, 1):
        m.add(box((sx * (L / 2 - 0.035), 0, 0.245), (0.05, W - 0.12, 0.44)), PAL['wood'])
    m.add(quad_on((0, 0, H - 0.05), L - 0.1, W - 0.1, (0, 0, 1)), PAL['soil'])
    blobs = [((x, rnd.uniform(-0.05, 0.05), H + 0.02), 0.27, (1.25, 0.95, 0.75)) for x in (-0.55, -0.2, 0.17, 0.53)]
    leaf_mound(m, blobs, 55)
    pts = []
    for i in range(10):
        x = -0.7 + 1.4 * (i + 0.5) / 10 + rnd.uniform(-0.04, 0.04)
        y = rnd.uniform(-0.15, 0.15)
        z = H + 0.13 + 0.06 * math.cos((x / 0.35) * PI) * 0.5 + rnd.uniform(0.0, 0.07)
        pts.append((x, y, z))
    flowers(m, pts, rnd, 0.1, sub=1)
    return m

def build_flower_pot():
    m = Model('flower_pot')
    rnd = random.Random(9)
    prof = [(0.19, 0.0), (0.21, 0.03), (0.285, 0.44), (0.335, 0.45), (0.345, 0.53), (0.30, 0.54)]
    def fc(f, src):
        b = band_of(f, src)
        return PAL['terra_lt'] if b in (2, 3) else (PAL['terra_dk'] if b == 4 else PAL['terracotta'])
    m.add(lathe(prof, 8, cap0=False, cap1=False), fcol=fc, smooth=True)
    m.add(disc((0, 0, 0.5), 0.3, 8), PAL['soil'])
    blobs = [((0, 0, 0.72), 0.3, (1, 1, 0.9)), ((0.16, -0.1, 0.6), 0.2, (1, 1, 0.9)), ((-0.15, 0.1, 0.62), 0.2, (1, 1, 0.9))]
    canopy(m, [blobs[0]], 66, lump=0.1, sub=2, squash=0.8)
    leaf_mound(m, blobs[1:], 67)
    pts = []
    for i in range(7):
        a = 2 * PI * i / 7 + rnd.uniform(-0.2, 0.2)
        el = rnd.uniform(0.15, 0.9)
        d = V((math.cos(a) * math.cos(el), math.sin(a) * math.cos(el), math.sin(el) * 0.9))
        pts.append(V((0, 0, 0.72)) + d * 0.3)
    flowers(m, pts, rnd, 0.06)
    for v in m.bm.verts:          # overall height ~0.85 m (pot ~0.46 m)
        v.co *= 0.87
    return m

def build_bench():
    m = Model('bench')
    L = 1.6
    for i, (y, z) in enumerate(((-0.17, 0.44), (-0.04, 0.445), (0.09, 0.45))):
        m.add(box((0, y, z), (L, 0.115, 0.045), bevel=0.0), PAL['wood'] if i % 2 == 0 else PAL['wood_lt'])
    for i, z in enumerate((0.63, 0.80)):
        yb = 0.17 + (z - 0.5) * 0.25
        M = rotx(math.radians(-14))
        m.add(box((0, yb, z), (L, 0.04, 0.13), M), PAL['wood_lt'] if i == 0 else PAL['wood'])
    for sx in (-1, 1):
        x = sx * (L / 2 - 0.12)
        m.add(beam((x, -0.24, 0.0), (x, -0.2, 0.62), 0.06, up=(0, 1, 0)), PAL['iron'], ID_METAL)
        m.add(beam((x, 0.2, 0.0), (x, 0.24, 0.88), 0.06, up=(0, 1, 0)), PAL['iron'], ID_METAL)
        m.add(beam((x, -0.25, 0.41), (x, 0.17, 0.41), 0.05), PAL['iron'], ID_METAL)
        m.add(beam((x, -0.28, 0.62), (x, 0.2, 0.64), 0.05, ext=0.02), PAL['iron'], ID_METAL)
    m.add(box((0, -0.03, 0.4), (L - 0.3, 0.04, 0.04)), PAL['iron'], ID_METAL)
    return m

def build_bollard():
    m = Model('bollard')
    prof = [(0.12, 0.0), (0.12, 0.05), (0.09, 0.09), (0.078, 0.6), (0.095, 0.62), (0.095, 0.69), (0.078, 0.71),
            (0.078, 0.77), (0.066, 0.83), (0.035, 0.875), (0.0, 0.9)]
    def fc(f, src):
        return PAL['gold'] if band_of(f, src) in (3, 4, 5) else PAL['iron']
    m.add(lathe(prof, 8, cap0=False), fcol=fc, mid=ID_METAL, smooth=True)
    return m

def build_chalkboard():
    m = Model('chalkboard')
    H, W, tilt = 1.0, 0.6, math.radians(13)
    rect = None
    for side in (-1, 1):   # -1 = front (faces -Y / glTF +Z)
        # frame rotated about the top hinge line
        M = Matrix.Translation(V((0, 0, H * math.cos(tilt)))) @ rotx(side * tilt)
        def put(bm):
            return xf(bm, M)
        y0 = side * 0.02
        for sx in (-1, 1):
            m.add(put(box((sx * (W / 2 - 0.025), y0, -H / 2), (0.05, 0.035, H))), PAL['wood'])
        m.add(put(box((0, y0, -0.03), (W - 0.1, 0.03, 0.05))), PAL['wood_lt'])
        m.add(put(box((0, y0, -H + 0.2), (W - 0.1, 0.03, 0.05))), PAL['wood_lt'])
        bh = H - 0.3
        m.add(put(box((0, y0, -0.05 - bh / 2), (W - 0.12, 0.02, bh - 0.01))), '#2f3d37')
        if side == -1:
            c = M @ V((0, y0 - 0.01, -0.05 - bh / 2))
            nrm = (M.to_3x3() @ V((0, -1, 0))).normalized()
            rect = dict(center=gl(c), width=round(W - 0.12, 3), height=round(bh - 0.01, 3), normal=gl(nrm))
    m.extras['board_front'] = rect
    m.rect = rect
    return m

def build_trash_bin():
    m = Model('trash_bin')
    prof = [(0.22, 0.0), (0.23, 0.08), (0.25, 0.1), (0.27, 0.78), (0.295, 0.8), (0.295, 0.86), (0.25, 0.87),
            (0.25, 0.9), (0.28, 0.91), (0.26, 0.97), (0.14, 1.03), (0.0, 1.05)]
    def fc(f, src):
        b = band_of(f, src)
        if b in (0, 1):
            return PAL['iron2']
        if b in (5, 6):
            return '#1b1d21'
        if b >= 7:
            return '#2d6e45'
        return '#3a8a55'
    m.add(lathe(prof, 10, cap0=False), fcol=fc, smooth=True)
    m.add(box((0, -0.27, 0.45), (0.18, 0.02, 0.14)), PAL['gold'])
    return m

def build_hydrant():
    m = Model('hydrant')
    red, dk = '#d9372c', '#b02a22'
    prof = [(0.16, 0.0), (0.16, 0.05), (0.12, 0.07), (0.11, 0.1), (0.11, 0.5), (0.145, 0.52), (0.145, 0.57),
            (0.12, 0.58), (0.115, 0.63), (0.07, 0.69), (0.035, 0.7), (0.035, 0.76), (0.0, 0.77)]
    def fc(f, src):
        b = band_of(f, src)
        return dk if b in (0, 1, 5, 6, 10, 11) else red
    m.add(lathe(prof, 8, cap0=False), fcol=fc, smooth=True)
    for sx in (-1, 1):
        m.add(cyl((sx * 0.1, 0, 0.38), (sx * 0.2, 0, 0.38), 0.045, 0.045, 6, cap0=False), red, smooth=True)
        m.add(cyl((sx * 0.2, 0, 0.38), (sx * 0.23, 0, 0.38), 0.055, 0.055, 6), '#e8e2d6', ID_METAL)
    m.add(cyl((0, -0.1, 0.33), (0, -0.2, 0.33), 0.06, 0.06, 6, cap0=False), red, smooth=True)
    m.add(cyl((0, -0.2, 0.33), (0, -0.235, 0.33), 0.072, 0.072, 6), '#e8e2d6', ID_METAL)
    return m

def build_railing():
    m = Model('railing')
    post, cap, rail = '#dcd8cf', '#f4f2ec', '#f8f6f1'
    for x in (0.0, 1.0):
        big = x == 0.0
        w = 0.24 if big else 0.16
        m.add(box((x, 0, 0.06), (w + 0.06, w + 0.06, 0.12)), '#cbc6bb')
        m.add(box((x, 0, 0.53), (w, w, 0.84)), post)
        m.add(box((x, 0, 0.98), (w + 0.07, w + 0.07, 0.08), bevel=0.02), cap)
    m.add(tube([(0, 0, 0.9), (2.0, 0, 0.9)], 0.06, 6, cap0=False, cap1=False), rail, smooth=True)
    m.add(box((1.0, 0, 0.55), (2.0, 0.07, 0.07)), rail)
    m.add(box((1.0, 0, 0.24), (2.0, 0.06, 0.06)), rail)
    return m

def build_sign_post():
    m = Model('sign_post')
    prof = [(0.11, 0.0), (0.11, 0.06), (0.065, 0.1), (0.06, 3.15), (0.075, 3.17), (0.05, 3.22), (0.0, 3.24)]
    m.add(lathe(prof, 8, cap0=False), '#3b3f46', ID_METAL, smooth=True)
    rects = []
    yb = -0.085
    for i, zc in enumerate((2.95, 2.6, 2.25)):
        m.add(box((0, yb, zc), (1.2, 0.04, 0.3)), PAL['white'])
        m.add(box((0, yb - 0.024, zc), (1.14, 0.01, 0.24)), PAL['sign_green'])
        m.add(box((0, yb + 0.022, zc), (1.14, 0.006, 0.24)), PAL['sign_green'])
        m.add(box((0, -0.035, zc), (0.12, 0.05, 0.08)), '#3b3f46', ID_METAL)
        front = V((0, yb - 0.029, zc))
        rects.append(dict(center=gl(front), width=1.14, height=0.24, normal=[0, 0, 1]))
    m.extras['boards'] = rects
    m.rects = rects
    return m

def build_bus_stop():
    m = Model('bus_stop')
    W, D, H = 2.8, 1.3, 2.45
    frame = '#2f5f7a'
    m.add(box((0, 0, 0.04), (W + 0.2, D + 0.15, 0.08)), PAL['concrete'])
    for sx in (-1, 1):
        for sy in (-1, 1):
            m.add(box((sx * (W / 2 - 0.05), sy * (D / 2 - 0.05) + 0.05, H / 2), (0.08, 0.08, H)), frame, ID_METAL)
    m.add(box((0, 0.0, H + 0.08), (W + 0.3, D + 0.35, 0.14), M=rotx(math.radians(-4)), bevel=0.03), '#e2493d')
    m.add(box((0, -(D + 0.35) / 2 - 0.0, H + 0.03), (W + 0.32, 0.05, 0.18)), PAL['cream'])
    m.add(box((0, D / 2, 1.25), (W - 0.1, 0.03, 1.85)), PAL['glass'], ID_GLASS)
    m.add(box((0, D / 2 - 0.01, 2.22), (W - 0.1, 0.05, 0.08)), frame, ID_METAL)
    m.add(box((0, D / 2 - 0.01, 0.3), (W - 0.1, 0.05, 0.06)), frame, ID_METAL)
    m.add(box((-W / 2 + 0.05, 0.05, 1.25), (0.03, D - 0.2, 1.85)), PAL['glass'], ID_GLASS)
    # ad panel on the right side
    m.add(box((W / 2 - 0.05, 0.05, 1.3), (0.1, D - 0.25, 1.7)), frame, ID_METAL)
    m.add(box((W / 2 - 0.05, 0.05, 1.3), (0.12, D - 0.4, 1.5)), '#ffb52e')
    # bench
    m.add(box((0, 0.35, 0.47), (W - 0.6, 0.38, 0.06)), PAL['wood'])
    for sx in (-1, 1):
        m.add(box((sx * (W / 2 - 0.5), 0.4, 0.23), (0.06, 0.3, 0.44)), PAL['iron'], ID_METAL)
    # stop sign on a little pole at the front-right corner
    m.add(cyl((W / 2 + 0.05, -D / 2 - 0.05, 0.08), (W / 2 + 0.05, -D / 2 - 0.05, 2.1), 0.035, 0.035, 6, cap0=False), frame, ID_METAL)
    m.add(cyl((W / 2 + 0.05, -D / 2 - 0.08, 2.25), (W / 2 + 0.05, -D / 2 - 0.02, 2.25), 0.22, 0.22, 12), '#2f86c8')
    m.add(disc((W / 2 + 0.05, -D / 2 - 0.085, 2.25), 0.15, 12, (0, -1, 0)), PAL['yellow'])
    return m

# ----------------------------------------------------------------------------------------------
# landmarks / backdrop
# ----------------------------------------------------------------------------------------------
def on_sides(fn):
    """call fn(M) for each of the 4 side orientations; M maps local front (-Y) to the side."""
    for k in range(4):
        fn(rotz(k * PI / 2))

def build_clock_tower():
    m = Model('clock_tower')
    stone, light, dark, brick = PAL['stone'], PAL['stone_lt'], PAL['stone_dk'], PAL['brick']
    S = 5.4
    m.add(box((0, 0, 0.75), (6.6, 6.6, 1.5)), dark)
    m.add(box((0, 0, 1.6), (6.2, 6.2, 0.22)), light)
    m.add(box((0, 0, 1.7 + 8.15), (S, S, 16.3)), brick)
    for sx in (-1, 1):
        for sy in (-1, 1):
            m.add(box((sx * (S / 2 - 0.25), sy * (S / 2 - 0.25), 1.7 + 8.15), (0.8, 0.8, 16.3)), light)
    m.add(box((0, 0, 9.6), (S + 0.3, S + 0.3, 0.35)), light)
    def windows(M):
        for zc in (5.6, 12.6):
            pts = [(-0.4, -S / 2 - 0.02, zc - 1.0), (0.4, -S / 2 - 0.02, zc - 1.0), (0.4, -S / 2 - 0.02, zc + 0.55),
                   (0.0, -S / 2 - 0.02, zc + 1.0), (-0.4, -S / 2 - 0.02, zc + 0.55)]
            m.add(xf(poly([pts[0], pts[1], pts[2], pts[3], pts[4]]), M), '#3d3230')
            m.add(xf(box((0, -S / 2 - 0.08, zc - 1.05), (1.0, 0.16, 0.12)), M), light)
    on_sides(windows)
    # clock stage
    m.add(box((0, 0, 18.0), (6.4, 6.4, 0.4)), light)
    m.add(box((0, 0, 20.6), (6.0, 6.0, 5.2)), stone)
    m.add(box((0, 0, 23.25), (6.6, 6.6, 0.45)), light)
    yfc = -3.0
    def clock(M):
        c = V((0, yfc, 20.6))
        m.add(xf(disc(c - V((0, 0.02, 0)), 2.05, 16, (0, -1, 0)), M), '#2a2b30')
        m.add(xf(disc(c - V((0, 0.06, 0)), 1.82, 16, (0, -1, 0)), M), '#fbf8ef')
        for h in range(12):
            a = 2 * PI * h / 12
            big = h % 3 == 0
            p = c + V((1.5 * math.sin(a), -0.08, 1.5 * math.cos(a)))
            m.add(xf(quad_on(p, 0.12 if big else 0.08, 0.36 if big else 0.22, (0, -1, 0), rot=-a), M), '#26272c')
        for a, ln, w in ((math.radians(-60), 0.95, 0.15), (math.radians(65), 1.4, 0.1)):
            d = V((math.sin(a), 0, math.cos(a)))
            m.add(xf(beam(c + V((0, -0.12, 0)) - d * 0.18, c + V((0, -0.12, 0)) + d * ln, w, 0.05, up=(0, -1, 0)), M), '#1d1e22')
        m.add(xf(disc(c - V((0, 0.16, 0)), 0.14, 8, (0, -1, 0)), M), PAL['gold'])
    on_sides(clock)
    # belfry
    zb0, zb1 = 23.44, 27.9
    m.add(box((0, 0, (zb0 + zb1) / 2), (5.0, 5.0, zb1 - zb0)), '#4a3a33')
    for sx in (-1, 1):
        for sy in (-1, 1):
            m.add(box((sx * 2.55, sy * 2.55, (zb0 + zb1) / 2), (0.95, 0.95, zb1 - zb0)), light)
    def belfry(M):
        y = -2.62
        m.add(xf(box((0, y + 0.1, (zb0 + zb1) / 2), (0.45, 0.3, zb1 - zb0)), M), light)
        m.add(xf(box((0, y - 0.05, zb0 + 0.3), (5.2, 0.45, 0.6)), M), light)
        for xc in (-1.15, 1.15):
            R, zs = 0.85, 26.55
            bm = bmesh.new()
            arc, topv = [], []
            for k in range(7):
                a = PI * k / 6
                x = xc + R * math.cos(a)
                arc.append(bm.verts.new((x, y, zs + R * math.sin(a))))
                topv.append(bm.verts.new((x, y, zb1)))
            for k in range(6):
                bm.faces.new((arc[k], topv[k], topv[k + 1], arc[k + 1]))
            bm.normal_update()
            bm.faces.ensure_lookup_table()
            if bm.faces[0].normal.y > 0:
                bmesh.ops.reverse_faces(bm, faces=bm.faces[:])
            m.add(xf(bm, M), stone)
    on_sides(belfry)
    m.add(box((0, 0, 28.1), (6.3, 6.3, 0.4)), light)
    for sx in (-1, 1):
        for sy in (-1, 1):
            m.add(lathe_at([(0.38, 0.0), (0.38, 0.45), (0.0, 1.9)], (sx * 2.75, sy * 2.75, 28.3), 4, phase=PI / 4, cap0=False),
                  PAL['copper'])
            m.add(ico((sx * 2.75, sy * 2.75, 30.25), 0.12, 1), PAL['gold'], ID_METAL, smooth=True)
    bm = lathe([(2.55, 28.3), (2.3, 29.1), (0.06, 33.6)], 8, phase=PI / 8, cap0=False, cap1=True)
    m.add(bm, fcol=lambda f, src: PAL['copper'] if band_of(f, src) == 0 else (PAL['copper'] if seg_of(f, src) % 2 else PAL['copper_dk']))
    # dormers on the spire
    def dormer(M):
        y0, z0 = -2.05, 29.2
        bm = bmesh.new()
        a = bm.verts.new((-0.45, y0 - 0.5, z0)); b = bm.verts.new((0.45, y0 - 0.5, z0))
        c = bm.verts.new((0.0, y0 - 0.5, z0 + 0.95))
        a2 = bm.verts.new((-0.45, y0 + 0.6, z0)); b2 = bm.verts.new((0.45, y0 + 0.6, z0)); c2 = bm.verts.new((0.0, y0 + 0.6, z0 + 0.95))
        bm.faces.new((a, b, c))
        bm.faces.new((a, c, c2, a2))
        bm.faces.new((b, b2, c2, c))
        m.add(xf(bm, M), PAL['copper_dk'])
        m.add(xf(poly([(-0.25, y0 - 0.52, z0 + 0.05), (0.25, y0 - 0.52, z0 + 0.05), (0, y0 - 0.52, z0 + 0.55)]), M), PAL['gold'])
    on_sides(dormer)
    m.add(cyl((0, 0, 33.5), (0, 0, 34.3), 0.05, 0.03, 4, cap0=False), PAL['gold'], ID_METAL)
    m.add(ico((0, 0, 33.75), 0.16, 1), PAL['gold'], ID_METAL, smooth=True)
    return m

def build_lighthouse():
    m = Model('lighthouse')
    red, white = '#dd3b33', '#f6f2ea'
    m.add(lathe([(3.1, 0.0), (3.1, 0.9), (2.75, 1.1), (2.5, 1.2)], 8, cap0=False, cap1=True), '#cdbf9f')
    zs = [1.2 + 2.05 * i for i in range(7)]
    prof = [(2.15 - 0.68 * (z - 1.2) / (zs[-1] - 1.2), z) for z in zs]
    m.add(lathe(prof, 12, cap0=False, cap1=False), fcol=lambda f, src: white if band_of(f, src) % 2 == 0 else red, smooth=True)
    zt = zs[-1]
    m.add(lathe([(1.45, zt - 0.3), (2.25, zt), (2.25, zt + 0.25), (1.1, zt + 0.25)], 12, cap0=False, cap1=True), '#2b2d33', ID_METAL)
    m.add(lathe([(2.15, zt + 0.25), (2.15, zt + 0.95)], 12, cap0=False, cap1=False), '#2b2d33', ID_METAL,
          back=dict(col='#3a3d44', off=0.03))
    m.add(lathe([(1.15, zt + 0.25), (1.15, zt + 0.8)], 10, cap0=False, cap1=True), white)
    m.add(lathe([(0.98, zt + 0.8), (0.98, zt + 2.3)], 10, cap0=False, cap1=False), PAL['lamp_glass'], ID_LAMP)
    for k in range(5):
        a = 2 * PI * k / 5
        p = V((1.0 * math.cos(a), 1.0 * math.sin(a), 0))
        m.add(box(p + V((0, 0, zt + 1.55)), (0.08, 0.08, 1.5), rotz(a)), '#2b2d33', ID_METAL)
    m.add(lathe([(1.3, zt + 2.3), (1.3, zt + 2.45), (1.0, zt + 2.85), (0.55, zt + 3.25), (0.18, zt + 3.5), (0.0, zt + 3.55)], 10,
                cap0=True, cap1=False), red, smooth=True)
    m.add(ico((0, 0, zt + 3.7), 0.2, 1), '#2b2d33', ID_METAL, smooth=True)
    m.add(cyl((0, 0, zt + 3.85), (0, 0, 18.0), 0.035, 0.02, 4, cap0=False), '#2b2d33', ID_METAL)
    # door + windows (front = -Y)
    r_at = lambda z: 2.15 - 0.68 * (z - 1.2) / (zs[-1] - 1.2)
    m.add(poly([(-0.5, -r_at(1.2) - 0.03, 1.2), (0.5, -r_at(1.2) - 0.03, 1.2), (0.5, -r_at(3.1) - 0.03, 3.1),
                (0, -r_at(3.45) - 0.03, 3.45), (-0.5, -r_at(3.1) - 0.03, 3.1)]), '#4a3326')
    for z, a in ((6.3, 0.0), (9.8, PI / 2), (11.4, -PI * 0.75)):
        r = r_at(z) + 0.03
        d = V((math.sin(a), -math.cos(a), 0))
        m.add(quad_on(d * r + V((0, 0, z)), 0.42, 0.7, d), '#2c3a48')
    return m

FERRIS_HUB = 15.6
FERRIS_R = 12.2

def build_ferris_wheel():
    m = Model('ferris_wheel')
    leg = '#e8544a'
    H = FERRIS_HUB
    m.add(box((0, 0, 0.25), (16.0, 7.5, 0.5)), '#d8cdb9')
    m.add(box((0, -3.4, 0.6), (5.0, 1.2, 0.2)), '#e7dcc8')
    for sy in (-1, 1):
        for sx in (-1, 1):
            m.add(beam((sx * 6.8, sy * 2.9, 0.5), (sx * 0.25, sy * 1.75, H), 0.5, up=(0, 1, 0)), leg)
        for z in (5.5, 10.5):
            t = (z - 0.5) / (H - 0.5)
            x = 6.8 + (0.25 - 6.8) * t
            y = 2.9 + (1.75 - 2.9) * t
            m.add(beam((-x, sy * y, z), (x, sy * y, z), 0.32, up=(0, 1, 0)), '#f4f0e8')
        m.add(cyl((0, sy * 1.6, H), (0, sy * 2.15, H), 0.75, 0.75, 10), PAL['gold'])
    m.add(cyl((0, -2.2, H), (0, 2.2, H), 0.32, 0.32, 8), '#9aa0a8', ID_METAL)
    # ticket booth
    m.add(box((5.6, -2.4, 1.55), (1.8, 1.4, 2.1)), '#ffd25a')
    m.add(box((5.6, -2.4, 2.75), (2.2, 1.8, 0.3), bevel=0.06), '#e2493d')
    m.add(quad_on((5.6, -3.11, 1.8), 1.1, 0.7, (0, -1, 0)), '#2c3a48')
    m.extras['hub_height'] = H
    return m

def build_ferris_wheel_rotor():
    m = Model('ferris_wheel_rotor')
    R = FERRIS_R
    rim = '#f6f2ea'
    for sy in (-1, 1):
        bm = torus(R, 0.2, 32, 4, phase=PI / 4)
        mv(bm, (0, sy * 1.05, 0))
        m.add(bm, rim, smooth=False)
        bm = torus(R * 0.55, 0.12, 20, 3)
        mv(bm, (0, sy * 1.05, 0))
        m.add(bm, '#e2493d')
    ncab = 16
    for k in range(ncab):
        a = 2 * PI * k / ncab
        d = V((math.cos(a), 0, math.sin(a)))
        for sy in (-1, 1):
            m.add(beam(d * 0.9 + V((0, sy * 1.25, 0)), d * (R - 0.1) + V((0, sy * 1.05, 0)), 0.14, up=(0, 1, 0)), rim)
        m.add(cyl(d * R + V((0, -1.1, 0)), d * R + V((0, 1.1, 0)), 0.1, 0.1, 4, cap0=False, cap1=False), rim)
    m.add(cyl((0, -1.45, 0), (0, 1.45, 0), 1.0, 1.0, 12), '#e2493d')
    m.add(cyl((0, -1.5, 0), (0, -1.45, 0), 0.6, 0.6, 12, cap1=False), PAL['gold'])
    m.add(cyl((0, 1.45, 0), (0, 1.5, 0), 0.6, 0.6, 12, cap0=False), PAL['gold'])
    cols = ['#e2453a', '#ffc93c', '#3d9be0', '#4cbf6a', '#f27fb0', '#ff8a3c', '#9b6be0', '#2fc0b5']
    for k in range(ncab):
        a = 2 * PI * k / ncab
        d = V((math.cos(a), 0, math.sin(a)))
        c = d * (R + 1.42)
        col = cols[k % len(cols)]
        # cabin = solid of revolution around an axis parallel to the axle (looks the same at any wheel angle)
        m.add(lathe_at([(0.0, -1.0), (0.85, -0.9), (1.27, -0.62), (1.35, -0.34)], c, 6, axis=(0, 1, 0), cap0=False, cap1=False),
              col, smooth=True)
        m.add(lathe_at([(1.35, -0.34), (1.35, 0.34)], c, 6, axis=(0, 1, 0), cap0=False, cap1=False), PAL['glass'], ID_GLASS)
        m.add(lathe_at([(1.35, 0.34), (1.27, 0.62), (0.85, 0.9), (0.0, 1.0)], c, 6, axis=(0, 1, 0), cap0=False, cap1=False),
              col, smooth=True)
        m.add(beam(d * (R + 0.05), c - d * 1.22, 0.16, up=(0, 1, 0)), rim)
    # rotor geometry is authored around its hub; the node itself sits at the hub height
    m.location = (0, 0, FERRIS_HUB)
    m.extras['pivot'] = 'hub'
    m.extras['hub_height'] = FERRIS_HUB
    m.extras['axle'] = [0, 0, 1]
    return m

def hip_roof(m, cx, cy, z0, w, d, h, over=0.35, col='#c8603a', col2='#b4532f'):
    """hip roof over a w x d footprint (x/y), eaves at z0."""
    W, D = w / 2 + over, d / 2 + over
    if W >= D:
        r0, r1 = V((cx - (W - D), cy, z0 + h)), V((cx + (W - D), cy, z0 + h))
    else:
        r0, r1 = V((cx, cy - (D - W), z0 + h)), V((cx, cy + (D - W), z0 + h))
    a, b, c, e = V((cx - W, cy - D, z0)), V((cx + W, cy - D, z0)), V((cx + W, cy + D, z0)), V((cx - W, cy + D, z0))
    bm = bmesh.new()
    va, vb, vc, ve = [bm.verts.new(p) for p in (a, b, c, e)]
    v0, v1 = bm.verts.new(r0), bm.verts.new(r1)
    if W >= D:
        bm.faces.new((va, vb, v1, v0))       # front (-Y)
        bm.faces.new((vc, ve, v0, v1))       # back
        bm.faces.new((vb, vc, v1))           # right
        bm.faces.new((ve, va, v0))           # left
    else:
        bm.faces.new((va, vb, v0))
        bm.faces.new((vc, ve, v1))
        bm.faces.new((vb, vc, v1, v0))
        bm.faces.new((ve, va, v0, v1))
    bm.faces.new((ve, vc, vb, va))           # eave underside
    bm.normal_update()
    m.add(bm, fcol=lambda f, src: col if f.normal.z > 0 and (abs(f.normal.y) > abs(f.normal.x)) else (col2 if f.normal.z > 0 else '#8a4a30'))

def house_box(m, cx, cy, w, d, h, wall):
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.scale(bm, vec=(w, d, h), verts=bm.verts)
    bmesh.ops.translate(bm, vec=(cx, cy, h / 2), verts=bm.verts)
    bm.normal_update()
    bm.faces.ensure_lookup_table()
    bmesh.ops.delete(bm, geom=[f for f in bm.faces if f.normal.z < -0.5], context='FACES_ONLY')
    m.add(bm, wall)

def windows_on(m, cx, cy, w, d, floors, per_side, sides=('f', 'l', 'r', 'b'), col='#3b3a4a', fh=2.9, ww=0.75, wh=1.05,
               door=None):
    for s in sides:
        if s in 'fb':
            n = V((0, -1 if s == 'f' else 1, 0))
            span, off = w, d / 2
            ax = V((1, 0, 0))
        else:
            n = V((-1 if s == 'l' else 1, 0, 0))
            span, off = d, w / 2
            ax = V((0, 1, 0))
        cnt = per_side if s in 'fb' else max(1, per_side - 1)
        for fl in range(floors):
            z = 1.5 + fl * fh
            for i in range(cnt):
                t = (i + 0.5) / cnt - 0.5
                if door and s == 'f' and fl == 0 and i == door:
                    p = V((cx, cy, 0)) + ax * (t * span) + n * (off + 0.02) + V((0, 0, 1.1))
                    m.add(quad_on(p, 0.95, 2.2, n), '#6a3f2a')
                    continue
                p = V((cx, cy, 0)) + ax * (t * span) + n * (off + 0.02) + V((0, 0, z))
                m.add(quad_on(p, ww, wh, n), col)

def build_hill_house_a():
    m = Model('hill_house_a')
    w, d, h = 7.0, 5.5, 5.8
    house_box(m, 0, 0, w, d, h, '#f3e2c0')
    hip_roof(m, 0, 0, h, w, d, 1.7)
    windows_on(m, 0, 0, w, d, 2, 3, door=1)
    m.add(box((1.8, 1.0, h + 1.3), (0.6, 0.6, 1.4)), '#e9d5b0')
    return m

def build_hill_house_b():
    m = Model('hill_house_b')
    house_box(m, -0.8, 0, 5.0, 5.0, 8.0, '#efb86a')
    hip_roof(m, -0.8, 0, 8.0, 5.0, 5.0, 1.5)
    house_box(m, 2.6, 0.35, 3.6, 4.1, 4.6, '#f6e7c8')
    hip_roof(m, 2.6, 0.35, 4.6, 3.6, 4.1, 1.2, over=0.3)
    windows_on(m, -0.8, 0, 5.0, 5.0, 3, 2, sides=('f', 'l', 'b'), fh=2.55)
    windows_on(m, 2.6, 0.35, 3.6, 4.1, 1, 2, sides=('f', 'r'), door=0)
    m.add(box((-0.8, -2.85, 3.0), (2.2, 0.7, 0.14)), '#f6e7c8')
    m.add(box((-0.8, -3.18, 3.3), (2.2, 0.05, 0.5)), '#3f7f5a')
    return m

def build_hill_house_c():
    m = Model('hill_house_c')
    w, d, h = 4.6, 4.2, 4.8
    house_box(m, 0, 0, w, d, h, '#f2bfae')
    hip_roof(m, 0, 0, h, w, d, 1.35, over=0.3)
    windows_on(m, 0, 0, w, d, 2, 2, sides=('f', 'l', 'r', 'b'), fh=2.4, ww=0.65, wh=0.9)
    m.add(box((0, -2.55, 0.06), (2.4, 0.9, 0.12)), '#d9cbb3')
    return m

# ----------------------------------------------------------------------------------------------
# build + export
# ----------------------------------------------------------------------------------------------
BUILDERS = dict(
    tree_round_a=build_tree_round_a, tree_round_b=build_tree_round_b, tree_round_c=build_tree_round_c,
    palm_a=build_palm_a, palm_b=build_palm_b, bush_a=build_bush_a,
    street_lamp=build_street_lamp, street_lamp_double=build_street_lamp_double, traffic_light=build_traffic_light,
    cafe_set_a=build_cafe_set_a, cafe_set_b=build_cafe_set_b, planter=build_planter, flower_pot=build_flower_pot,
    bench=build_bench, bollard=build_bollard, chalkboard=build_chalkboard, trash_bin=build_trash_bin,
    hydrant=build_hydrant, railing=build_railing, sign_post=build_sign_post, bus_stop=build_bus_stop,
    clock_tower=build_clock_tower, lighthouse=build_lighthouse, ferris_wheel=build_ferris_wheel,
    ferris_wheel_rotor=build_ferris_wheel_rotor,
    hill_house_a=build_hill_house_a, hill_house_b=build_hill_house_b, hill_house_c=build_hill_house_c,
)
BUDGET = dict(tree_round_a=700, tree_round_b=700, tree_round_c=700, palm_a=600, palm_b=600, street_lamp=400,
              street_lamp_double=600, traffic_light=400, cafe_set_a=700, cafe_set_b=700, planter=400, flower_pot=300,
              clock_tower=1500, lighthouse=800, ferris_wheel=3000, ferris_wheel_rotor=3000,
              hill_house_a=150, hill_house_b=150, hill_house_c=150)

def read_glb(path):
    d = open(path, 'rb').read()
    clen = struct.unpack('<I', d[12:16])[0]
    return json.loads(d[20:20 + clen]), d[20 + clen:]

def write_glb(path, j, rest):
    js = json.dumps(j, separators=(',', ':')).encode('utf8')
    js += b' ' * ((4 - len(js) % 4) % 4)
    with open(path, 'wb') as fh:
        fh.write(struct.pack('<III', 0x46546C67, 2, 12 + 8 + len(js) + len(rest)))
        fh.write(struct.pack('<II', len(js), 0x4E4F534A))
        fh.write(js)
        fh.write(rest)

def main():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    col = bpy.context.scene.collection
    names = ONLY or list(BUILDERS.keys())
    stats = {}
    for name in names:
        mdl = BUILDERS[name]()
        ob = mdl.finish(col)
        me = ob.data
        me.calc_loop_triangles()
        tris = len(me.loop_triangles)
        xs = [v.co for v in me.vertices]
        lo = V((min(p.x for p in xs), min(p.y for p in xs), min(p.z for p in xs)))
        hi = V((max(p.x for p in xs), max(p.y for p in xs), max(p.z for p in xs)))
        ids = sorted({int(me.uv_layers[0].data[l].uv[0] * 16) for l in range(len(me.loops))})
        size = [round(hi.x - lo.x, 2), round(hi.z - lo.z, 2), round(hi.y - lo.y, 2)]
        stats[name] = dict(tris=tris, ids=ids, size_gltf=size, min_gltf=gl(V((lo.x, hi.y, lo.z))),
                           max_gltf=gl(V((hi.x, lo.y, hi.z))), extras=mdl.extras)
        b = BUDGET.get(name, 300)
        print(f'STAT {name:20s} tris={tris:5d}/{b:<5d} {"OVER" if tris > b else "ok  "} size(x,y,z)={size} ids={ids}')
    for name, st in stats.items():
        for k, v in st['extras'].items():
            print(f'EXTRA {name}.{k} = {json.dumps(v)}')
    if BLEND:
        bpy.ops.wm.save_as_mainfile(filepath=BLEND)
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    bpy.ops.export_scene.gltf(filepath=OUT, export_format='GLB', use_selection=False, export_apply=True,
                              export_extras=True, export_yup=True, export_texcoords=True, export_normals=True,
                              export_vertex_color='ACTIVE', export_all_vertex_colors=False,
                              export_animations=False, export_cameras=False, export_lights=False,
                              export_draco_mesh_compression_enable=DRACO, export_draco_mesh_compression_level=10,
                              export_draco_position_quantization=14, export_draco_normal_quantization=10,
                              export_draco_texcoord_quantization=12, export_draco_color_quantization=10)
    j, rest = read_glb(OUT)
    j.setdefault('asset', {})['extras'] = {
        'source': 'tools/blender/props.py', 'units': 'metres', 'front': '+Z',
        'material_id': 'TEXCOORD_0.u = (id + 0.5) / 16: 0 matte, 2 glass, 3 lamp glass, 5 metal, 7 foliage, 9 cloth'}
    write_glb(OUT, j, rest)
    print('WROTE', OUT, os.path.getsize(OUT))
    if REPORT:
        def conv(o):
            if hasattr(o, 'to_list'):
                return o.to_list()
            if hasattr(o, 'to_dict'):
                return o.to_dict()
            return str(o)
        json.dump(stats, open(REPORT, 'w'), indent=1, default=conv)

if __name__ == '__main__':
    main()

"""Restaurants + landmarks for Food Delivery Simulator -> restaurants.glb

    /snap/bin/blender -b --factory-startup -P tools/blender/restaurants.py -- [--out /tmp/restaurants-raw.glb]
    node tools/finish-restaurants.mjs /tmp/restaurants-raw.glb      # names, dedupe, Draco -> assets/models/restaurants.glb

Conventions (same as the packed Kenney kits): kit units (1 = one road tile = 8 m), +Y up, origin at the
ground centre of the lot, footprint within 0.96 x 0.96, FRONT DOOR FACING +Z, height <= ~1.6.
One top-level node per landmark (`rest-burger`, ..., `garage`, `office`); the giant rooftop food /
sign is a child node `<name>-sign` with its pivot at its base centre (so the game can spin / bob it).

Everything is authored here in game coordinates (x right, y up, z toward the street) and rotated to
Blender's Z-up only when the mesh is written. Giant food = Kenney Food Kit items (CC0) scaled up,
keeping their UVs on a shared `food` material (Kenney food colormap). Building shells, awnings, sign
boards, frames, tables, parasols, lanterns, the döner spit etc. are modelled here from primitives with
flat materials. Per-landmark material names: `brand` (main brand colour) and `awning` (awning stripes)
so code can tint them; the rest are shared (`white`, `dark`, `glass`, `wood`, `metal`, `paving`,
`green`, `food`, `accent`). Blender needs unique names, so they are stored as `brand@rest-burger` etc.
and finish-restaurants.mjs strips the `@...` suffix.
"""
import bpy, bmesh, math, os, random, sys
from mathutils import Vector, Matrix

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
FOOD_DIR = os.path.join(ROOT, 'assets/src/kenney/kenney_food-kit/Models/GLB format')
CAR_DIR = os.path.join(ROOT, 'assets/src/kenney/kenney_car-kit/Models/GLB format')

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
OUT = argv[argv.index('--out') + 1] if '--out' in argv else '/tmp/restaurants-raw.glb'
ONLY = argv[argv.index('--only') + 1].split(',') if '--only' in argv else None

# ------------------------------------------------------------------ scene / materials
for o in list(bpy.data.objects):
    bpy.data.objects.remove(o, do_unlink=True)
for m in list(bpy.data.meshes):
    bpy.data.meshes.remove(m)

def srgb_to_lin(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4

def hexcol(h):
    h = h.lstrip('#')
    return tuple(srgb_to_lin(int(h[i:i + 2], 16) / 255) for i in (0, 2, 4)) + (1.0,)

MATS = {}

def material(name, colour=None, rough=0.85, metal=0.0, emit=None, emit_strength=1.0, image=None):
    if name in MATS:
        return MATS[name]
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    bsdf = nt.nodes.get('Principled BSDF')
    bsdf.inputs['Roughness'].default_value = rough
    bsdf.inputs['Metallic'].default_value = metal
    if image:
        img = bpy.data.images.load(image, check_existing=True)
        tex = nt.nodes.new('ShaderNodeTexImage')
        tex.image = img
        tex.interpolation = 'Linear'
        nt.links.new(tex.outputs['Color'], bsdf.inputs['Base Color'])
    elif colour:
        bsdf.inputs['Base Color'].default_value = hexcol(colour)
    if emit:
        bsdf.inputs['Emission Color'].default_value = hexcol(emit)
        bsdf.inputs['Emission Strength'].default_value = emit_strength
    MATS[name] = m
    return m

# Flat colours that are NOT meant to be tinted live in one small palette texture (`props` material,
# 16x16 swatches of 4x4 px, sampled at swatch centres - same idea as Kenney's colormaps), so a landmark
# needs only: props + brand + awning (+ food). Shared swatches first, per-landmark accents appended.
SHARED = {
    'white': '#f6efe1', 'dark': '#3b3534', 'glass': '#3f6f8e', 'wood': '#8d5b3a', 'metal': '#a3aaae',
    'paving': '#d8c5a3', 'green': '#4f9a4c', 'cream': '#f3e2c4', 'black': '#26211f', 'roof': '#574c48',
    'tomato': '#e0402d', 'pepper': '#5fae3a',
}
PAL = {}          # palette key -> swatch index
PAL_COL = []      # swatch index -> hex
PAL_N = 16        # swatches per row; image = 64 x 64 px
PAL_IMG_PATH = os.path.join(os.path.dirname(OUT) or '/tmp', 'restaurants-props.png')

def pal_add(key, colour):
    if key not in PAL:
        PAL[key] = len(PAL_COL)
        PAL_COL.append(colour)
    return PAL[key]

for k, c in SHARED.items():
    pal_add(k, c)

def pal_uv(key):
    i = PAL[key]
    u = ((i % PAL_N) * 4 + 2) / 64.0
    v = ((i // PAL_N) * 4 + 2) / 64.0
    return (u, 1.0 - v)      # Blender UV origin is bottom-left; glTF flips it back on export

PROPS_IMG = bpy.data.images.new('props', 64, 64, alpha=False)
FOOD_IMG = os.path.join(FOOD_DIR, 'Textures/colormap.png')

def props_material():
    if 'props' in MATS:
        return MATS['props']
    m = bpy.data.materials.new('props')
    m.use_nodes = True
    nt = m.node_tree
    bsdf = nt.nodes.get('Principled BSDF')
    bsdf.inputs['Roughness'].default_value = 0.85
    bsdf.inputs['Metallic'].default_value = 0.0
    tex = nt.nodes.new('ShaderNodeTexImage')
    tex.image = PROPS_IMG
    tex.interpolation = 'Closest'
    nt.links.new(tex.outputs['Color'], bsdf.inputs['Base Color'])
    MATS['props'] = m
    return m

def write_palette():
    px = [0.0] * (64 * 64 * 4)
    for i, hx in enumerate(PAL_COL):
        r, g, b = (int(hx.lstrip('#')[k:k + 2], 16) / 255 for k in (0, 2, 4))
        cx, cy = (i % PAL_N) * 4, (i // PAL_N) * 4
        for y in range(cy, cy + 4):
            for x in range(cx, cx + 4):
                row = 63 - y          # Blender pixel rows start at the bottom
                o = (row * 64 + x) * 4
                px[o:o + 4] = [r, g, b, 1.0]
    PROPS_IMG.pixels = px
    PROPS_IMG.filepath_raw = PAL_IMG_PATH
    PROPS_IMG.file_format = 'PNG'
    PROPS_IMG.save()

def resolve(key, owner):
    """-> (material, uv or None)"""
    if key in ('brand', 'awning'):
        return MATS[f'{key}@{owner}'], None
    if key == 'food':
        return material('food', image=FOOD_IMG, rough=1.0), None
    pk = key if key in SHARED else f'{key}@{owner}'
    return props_material(), pal_uv(pk)

# ------------------------------------------------------------------ geometry builder
GAME_TO_BLENDER = Matrix.Rotation(math.radians(90), 4, 'X')   # (x, y, z)game -> (x, -z, y)blender
BLENDER_TO_GAME = Matrix.Rotation(math.radians(-90), 4, 'X')

def rot_y(deg):
    return Matrix.Rotation(math.radians(deg), 4, 'Y')

def rot_x(deg):
    return Matrix.Rotation(math.radians(deg), 4, 'X')

def rot_z(deg):
    return Matrix.Rotation(math.radians(deg), 4, 'Z')


class B:
    """Accumulates geometry (game coords) into one bmesh with per-face material slots."""

    def __init__(self, name, owner):
        self.name, self.owner = name, owner
        self.bm = bmesh.new()
        self.uv = self.bm.loops.layers.uv.new('UVMap')   # same name as Kenney meshes -> from_mesh keeps their UVs
        self.slots = []

    def slot(self, key):
        m, uv = resolve(key, self.owner)
        if m not in self.slots:
            self.slots.append(m)
        return self.slots.index(m), uv

    def paint(self, f, key):
        idx, uv = self.slot(key)
        f.material_index = idx
        if uv:
            for l in f.loops:
                l[self.uv].uv = uv

    def _finish(self, verts, key, M, smooth=False):
        bmesh.ops.transform(self.bm, matrix=M, verts=verts)
        faces = {f for v in verts for f in v.link_faces}
        for f in faces:
            self.paint(f, key)
            f.smooth = smooth
        return faces

    def _merge(self, tmp, key, M, smooth=False):
        """Copy a temp bmesh into self.bm, transformed by M, with material `key`."""
        vmap = {}
        for v in tmp.verts:
            vmap[v] = self.bm.verts.new(M @ v.co)
        for f in tmp.faces:
            nf = self.bm.faces.new([vmap[v] for v in f.verts])
            self.paint(nf, key)
            nf.smooth = smooth
        tmp.free()

    def box(self, size, at, key, bevel=0.0, M=None):
        """size (w, h, d), at = bottom centre (x, y, z); M = local transform about that point."""
        w, h, d = size
        tmp = bmesh.new()
        bmesh.ops.create_cube(tmp, size=1.0)
        bmesh.ops.scale(tmp, vec=(w, h, d), verts=tmp.verts)
        bmesh.ops.translate(tmp, vec=(0, h / 2, 0), verts=tmp.verts)
        if bevel > 0:
            bmesh.ops.bevel(tmp, geom=list(tmp.verts) + list(tmp.edges), offset=min(bevel, w / 3, h / 3, d / 3), segments=1,
                            affect='EDGES', profile=0.5, clamp_overlap=True)
        self._merge(tmp, key, Matrix.Translation(Vector(at)) @ (M if M is not None else Matrix()))
        return self

    def cyl(self, r, h, at, key, seg=12, r2=None, M=None, smooth=False, caps=True):
        """Vertical cylinder / cone (r2 = top radius) standing on `at`."""
        res = bmesh.ops.create_cone(self.bm, cap_ends=caps, cap_tris=False, segments=seg, radius1=r,
                                    radius2=r if r2 is None else r2, depth=h)
        vs = res['verts']
        # created along Z (bmesh) centred -> make it along +Y, bottom at 0
        bmesh.ops.transform(self.bm, matrix=Matrix.Rotation(math.radians(-90), 4, 'X'), verts=vs)
        bmesh.ops.translate(self.bm, vec=(0, h / 2, 0), verts=vs)
        T = Matrix.Translation(Vector(at)) @ (M if M is not None else Matrix())
        self._finish(vs, key, T, smooth)
        return self

    def sphere(self, r, at, key, seg=10, rings=6, scale=(1, 1, 1), smooth=True, M=None):
        res = bmesh.ops.create_uvsphere(self.bm, u_segments=seg, v_segments=rings, radius=r)
        vs = res['verts']
        bmesh.ops.scale(self.bm, vec=scale, verts=vs)
        T = Matrix.Translation(Vector(at)) @ (M if M is not None else Matrix())
        self._finish(vs, key, T, smooth)
        return self

    def torus(self, R, r, at, key, seg=16, rseg=6, M=None, smooth=True, keys=None):
        """Torus in the XZ plane (hole along Y) unless M rotates it. keys: alternate materials per segment."""
        verts = []
        ring = []
        for i in range(seg):
            a = 2 * math.pi * i / seg
            row = []
            for j in range(rseg):
                b = 2 * math.pi * j / rseg
                x = (R + r * math.cos(b)) * math.cos(a)
                z = (R + r * math.cos(b)) * math.sin(a)
                y = r * math.sin(b)
                row.append(self.bm.verts.new((x, y, z)))
            ring.append(row)
        faces = []
        for i in range(seg):
            for j in range(rseg):
                a, b2 = ring[i][j], ring[(i + 1) % seg][j]
                c, d = ring[(i + 1) % seg][(j + 1) % rseg], ring[i][(j + 1) % rseg]
                f = self.bm.faces.new((a, d, c, b2))
                faces.append((i, f))
        vs = [v for row in ring for v in row]
        T = Matrix.Translation(Vector(at)) @ (M if M is not None else Matrix())
        self._finish(vs, key, T, smooth)
        if keys:
            for i, f in faces:
                self.paint(f, keys[(i * len(keys)) // seg])
        return self

    def prism(self, pts, depth, at, key, M=None, bevel=0.0):
        """Extrude a 2D polygon (x, y points) along z by depth (centred), placed at `at`."""
        area = sum(pts[i][0] * pts[(i + 1) % len(pts)][1] - pts[(i + 1) % len(pts)][0] * pts[i][1] for i in range(len(pts)))
        if area < 0:
            pts = list(reversed(pts))
        vs_f = [self.bm.verts.new((x, y, depth / 2)) for x, y in pts]
        vs_b = [self.bm.verts.new((x, y, -depth / 2)) for x, y in pts]
        n = len(pts)
        self.bm.faces.new(vs_f)
        self.bm.faces.new(list(reversed(vs_b)))
        for i in range(n):
            j = (i + 1) % n
            self.bm.faces.new((vs_f[i], vs_b[i], vs_b[j], vs_f[j]))
        vs = vs_f + vs_b
        T = Matrix.Translation(Vector(at)) @ (M if M is not None else Matrix())
        self._finish(vs, key, T)
        return self

    def kenney(self, path, M, key='food', drop_nodes=(), pull=None):
        """Append a Kenney GLB (all its meshes, world transforms applied), transformed by M (game coords).
        pull = {node_name: distance}: push that sub-mesh outward (radially in XZ) before M - e.g. a pizza slice."""
        before = set(bpy.data.objects)
        bpy.ops.import_scene.gltf(filepath=path)
        new = [o for o in bpy.data.objects if o not in before]
        for o in new:
            if o.type != 'MESH' or o.name.split('.')[0] in drop_nodes:
                continue
            me = o.data.copy()
            me.transform(o.matrix_world)
            me.transform(BLENDER_TO_GAME)
            d = (pull or {}).get(o.name.split('.')[0])
            if d:
                c = sum((v.co for v in me.vertices), Vector()) / max(len(me.vertices), 1)
                r = Vector((c.x, 0, c.z))
                if r.length > 1e-6:
                    me.transform(Matrix.Translation(r.normalized() * d))
            me.transform(M)
            nf = len(self.bm.faces)
            self.bm.from_mesh(me)
            self.bm.faces.ensure_lookup_table()
            for f in self.bm.faces[nf:]:
                if key == 'food':
                    f.material_index = self.slot('food')[0]
                else:
                    self.paint(f, key)
                f.smooth = False
            bpy.data.meshes.remove(me)
        for o in new:
            bpy.data.objects.remove(o, do_unlink=True)
        return self

    def build(self, parent=None, location=(0, 0, 0)):
        bmesh.ops.transform(self.bm, matrix=GAME_TO_BLENDER, verts=self.bm.verts)
        bmesh.ops.remove_doubles(self.bm, verts=self.bm.verts, dist=1e-6)
        me = bpy.data.meshes.new(self.name)
        self.bm.to_mesh(me)
        self.bm.free()
        for m in self.slots:
            me.materials.append(m)
        ob = bpy.data.objects.new(self.name, me)
        bpy.context.scene.collection.objects.link(ob)
        if parent:
            ob.parent = parent
        ob.location = GAME_TO_BLENDER @ Vector(location)
        return ob

# ------------------------------------------------------------------ reusable parts
FOOD = lambda n: os.path.join(FOOD_DIR, n + '.glb')

def S(s):
    return Matrix.Scale(s, 4)

def T(x, y, z):
    return Matrix.Translation(Vector((x, y, z)))

def pad(b, key='paving', w=0.96, d=0.96, h=0.012):
    b.box((w, h, d), (0, 0, 0), key)

def shell(b, w, h, d, zc, wall='brand', base='dark', cornice='white', roof='roof', parapet=0.05, bevel=0.012, base_h=0.05):
    """Simple shop body: walls, base plinth, cornice band, roof deck + parapet."""
    b.box((w, h, d), (0, 0, zc), wall, bevel=bevel)
    b.box((w + 0.012, base_h, d + 0.012), (0, 0, zc), base)
    b.box((w + 0.03, 0.035, d + 0.03), (0, h - 0.035, zc), cornice, bevel=0.006)
    if parapet:
        t = 0.03
        b.box((w + 0.03, parapet, t), (0, h, zc + d / 2 + 0.015 - t / 2), cornice)
        b.box((w + 0.03, parapet, t), (0, h, zc - d / 2 - 0.015 + t / 2), cornice)
        b.box((t, parapet, d), (w / 2 + 0.015 - t / 2, h, zc), cornice)
        b.box((t, parapet, d), (-w / 2 - 0.015 + t / 2, h, zc), cornice)
    b.box((w - 0.02, 0.012, d - 0.02), (0, h - 0.002, zc), roof)

def window(b, w, h, at, frame='white', glass='glass', mullions=1, sill=True, depth=0.012):
    x, y, z = at
    b.box((w + 0.03, h + 0.03, depth), (x, y - 0.015, z), frame)
    b.box((w, h, depth), (x, y, z + 0.004), glass)
    for i in range(1, mullions + 1):
        mx = x - w / 2 + w * i / (mullions + 1)
        b.box((0.012, h, depth + 0.006), (mx, y, z + 0.004), frame)
    if sill:
        b.box((w + 0.05, 0.014, depth + 0.025), (x, y - 0.025, z + 0.008), frame)

def door(b, w, h, at, key='dark', glass='glass', frame='white', knob='metal'):
    x, y, z = at
    b.box((w + 0.03, h + 0.02, 0.012), (x, y, z), frame)
    b.box((w, h, 0.014), (x, y, z + 0.004), key)
    b.box((w * 0.62, h * 0.45, 0.016), (x, y + h * 0.42, z + 0.004), glass)
    b.box((0.012, 0.012, 0.02), (x + w * 0.32, y + h * 0.45, z + 0.012), knob)

def striped_awning(b, x0, x1, y_top, z_wall, depth, drop, n, keys=('awning', 'white'), valance=0.04, scallop=False):
    """Sloped striped awning from the wall (z_wall, y_top) out to (z_wall+depth, y_top-drop)."""
    ang = math.atan2(drop, depth)
    L = math.hypot(depth, drop)
    sw = (x1 - x0) / n
    for i in range(n):
        k = keys[i % len(keys)]
        cx = x0 + sw * (i + 0.5)
        M = T(cx, y_top, z_wall) @ rot_x(math.degrees(ang)) @ T(0, -0.006, L / 2)
        b.box((sw + 0.0005, 0.012, L), (0, 0, 0), k, M=M)
        # valance
        if scallop:
            pts = [(-sw / 2, 0), (sw / 2, 0), (sw / 2, -valance * 0.6), (sw * 0.25, -valance * 0.95), (0, -valance), (-sw * 0.25, -valance * 0.95), (-sw / 2, -valance * 0.6)]
            pts = [(-sw / 2 - 0.0003, 0)] + [(px, py) for px, py in pts[1:]]
            b.prism(pts, 0.01, (cx, y_top - drop, z_wall + depth), k)
        else:
            b.box((sw + 0.0005, valance, 0.01), (cx, y_top - drop - valance, z_wall + depth), k)
    # side cheeks
    for sx in (x0, x1):
        b.prism([(0, 0), (0, -0.02), (-depth, -drop - valance * 0.6), (-depth, -drop)], 0.008,
                (sx, y_top, z_wall), keys[0], M=rot_y(90))

def sign_board(b, w, h, at, frame='brand', panel='white', depth=0.03, inset=0.02):
    x, y, z = at
    b.box((w, h, depth), (x, y, z), frame, bevel=0.006)
    b.box((w - 2 * inset, h - 2 * inset, 0.008), (x, y + inset, z + depth / 2), panel)

def parasol_table(b, at, keys=('awning', 'white'), r=0.11, h=0.2, table='white', seg=8):
    x, y, z = at
    b.cyl(0.045, 0.006, (x, y + 0.075, z), table, seg=10)          # table top
    b.cyl(0.006, 0.075, (x, y, z), 'dark', seg=6)                   # leg
    b.cyl(0.025, 0.004, (x, y, z), 'dark', seg=8)                   # foot
    b.cyl(0.004, h, (x, y, z), 'dark', seg=5)                       # pole
    # canopy: cone with alternating stripes
    res = bmesh.ops.create_cone(b.bm, cap_ends=False, cap_tris=False, segments=seg, radius1=r, radius2=0.004, depth=0.05)
    vs = res['verts']
    bmesh.ops.transform(b.bm, matrix=Matrix.Rotation(math.radians(-90), 4, 'X'), verts=vs)
    bmesh.ops.translate(b.bm, vec=(x, y + h - 0.005, z), verts=vs)
    faces = sorted({f for v in vs for f in v.link_faces}, key=lambda f: math.atan2(f.calc_center_median().z - z, f.calc_center_median().x - x))
    for i, f in enumerate(faces):
        b.paint(f, keys[i % len(keys)])
        f.smooth = False
    # make the canopy double sided by adding an underside copy
    dup = bmesh.ops.duplicate(b.bm, geom=faces)
    dfaces = [g for g in dup['geom'] if isinstance(g, bmesh.types.BMFace)]
    bmesh.ops.reverse_faces(b.bm, faces=dfaces)
    bmesh.ops.translate(b.bm, vec=(0, -0.002, 0), verts=list({v for f in dfaces for v in f.verts}))
    # two stools
    for dx in (-0.06, 0.06):
        b.cyl(0.018, 0.045, (x + dx, y, z + 0.01), 'dark', seg=6)

def chair_bench(b, at, w=0.12, key='wood'):
    x, y, z = at
    b.box((w, 0.012, 0.04), (x, y + 0.04, z), key)
    b.box((w, 0.045, 0.008), (x, y + 0.04, z - 0.018), key)
    for dx in (-w / 2 + 0.01, w / 2 - 0.01):
        b.box((0.008, 0.04, 0.035), (x + dx, y, z), 'dark')

def menu_board(b, at, rot=0, key='dark', frame='wood'):
    """A-frame chalkboard."""
    x, y, z = at
    M = T(x, y, z) @ rot_y(rot)
    for s in (1, -1):
        b.box((0.07, 0.12, 0.008), (0, 0, 0), frame, M=M @ T(0, 0, s * 0.018) @ rot_x(-s * 12))
        b.box((0.056, 0.095, 0.004), (0, 0.012, 0), key, M=M @ T(0, 0, s * 0.022) @ rot_x(-s * 12))

def planter(b, at, w=0.12, d=0.06, key='wood', plant='green'):
    x, y, z = at
    b.box((w, 0.04, d), (x, y, z), key)
    b.sphere(0.045, (x - w * 0.22, y + 0.055, z), plant, seg=7, rings=5, scale=(1, 0.8, 0.8), smooth=False)
    b.sphere(0.04, (x + w * 0.22, y + 0.05, z), plant, seg=7, rings=5, scale=(1, 0.8, 0.8), smooth=False)

def lantern(b, at, key='brand', cap='dark', r=0.035, hang=0.0):
    x, y, z = at
    if hang:
        b.cyl(0.002, hang, (x, y + r * 1.3, z), cap, seg=4)
    b.cyl(r * 0.55, 0.008, (x, y + r * 1.2, z), cap, seg=8)
    b.sphere(r, (x, y + r * 0.6, z), key, seg=10, rings=6, scale=(1, 1.15, 1))
    b.cyl(r * 0.55, 0.008, (x, y - r * 0.55, z), cap, seg=8)

def roof_frame(b, w, h, at, post='dark', top=None):
    """Rooftop sign frame: two posts + a top bar."""
    x, y, z = at
    for sx in (-w / 2, w / 2):
        b.box((0.02, h, 0.02), (x + sx, y, z), post)
    b.box((w + 0.03, 0.02, 0.025), (x, y + h - 0.02, z), top or post)

def wall_lamp(b, at, key='dark', glow='white'):
    x, y, z = at
    b.box((0.012, 0.03, 0.03), (x, y, z), key)
    b.cyl(0.014, 0.025, (x, y - 0.02, z + 0.03), glow, seg=6)

LANDMARKS = {}

# Game-facing metadata, exported as glTF node extras (three.js: object.userData).
# door = local (x, y, z) of the main entrance at the foot of the façade (pickup point; +Z side).
INFO = {
    'rest-burger': dict(title='Sunny Burger', door=(0.24, 0.0, 0.19), counter=None),
    'rest-pizza': dict(title='Mamma Pizza', door=(0.22, 0.0, 0.16), counter=None),
    'rest-sushi': dict(title='Sakura Sushi', door=(0.22, 0.0, 0.15), counter=None),
    'rest-cafe': dict(title='Bean There', door=(0.0, 0.0, 0.16), counter=None),
    'rest-donut': dict(title='Donut Worry', door=(0.22, 0.0, 0.16), counter=None),
    'rest-taco': dict(title='Taco Loco', door=(0.2, 0.0, 0.16), counter=None),
    'rest-noodle': dict(title='Wok This Way', door=(0.16, 0.0, 0.16), counter=None),
    'rest-doner': dict(title='Sultan Döner', door=(0.25, 0.0, 0.16), counter=(-0.12, 0.13, 0.19)),
    'rest-fish': dict(title='Salty Fry', door=(0.22, 0.0, 0.16), counter=None),
    'rest-icecream': dict(title='Scoops', door=(0.23, 0.0, 0.15), counter=(-0.14, 0.13, 0.19)),
    'garage': dict(title='Garage', door=(-0.07, 0.0, 0.19), counter=None),
    'office': dict(title='Dispatch Office', door=(0.29, 0.0, 0.17), counter=None),
}

def landmark(name, brand, awning, accent=None, accent2=None):
    def deco(fn):
        def run():
            material(f'brand@{name}', colour=brand)
            material(f'awning@{name}', colour=awning)
            if accent:
                pal_add(f'accent@{name}', accent)
            if accent2:
                pal_add(f'accent2@{name}', accent2)
            body = B(name, name)
            sign = B(name + '-sign', name)
            sign_at = fn(body, sign)
            ob = body.build()
            info = INFO.get(name, {})
            ob['title'] = info.get('title', name)
            ob['front'] = '+Z'
            ob['brandColor'] = brand
            ob['awningColor'] = awning
            if info.get('door'):
                ob['door'] = list(info['door'])
            if info.get('counter'):
                ob['counter'] = list(info['counter'])
            if sign.bm.faces:
                sign.build(parent=ob, location=sign_at)
            else:
                sign.bm.free()
            return ob
        LANDMARKS[name] = run
        return fn
    return deco

# ================================================================== the landmarks
# Lot: x,z in [-0.48, 0.48]. Body set back so the front façade sits at z ~ +0.16..0.22, leaving a
# small terrace (tables, menu boards) between the façade and the lot edge (sidewalk side, +Z).

@landmark('rest-burger', brand='#ffc533', awning='#e2382b', accent='#c4261d')
def burger(b, s):
    pad(b)
    W, H, D, ZC = 0.80, 0.50, 0.58, -0.10
    FZ = ZC + D / 2
    shell(b, W, H, D, ZC, wall='brand', base='accent', cornice='awning', roof='roof')
    # big shop window + door
    window(b, 0.40, 0.22, (-0.13, 0.08, FZ), frame='white', mullions=2)
    door(b, 0.13, 0.25, (0.24, 0.05, FZ), key='accent')
    striped_awning(b, -W / 2 + 0.02, W / 2 - 0.02, 0.37, FZ, 0.14, 0.07, 8, keys=('awning', 'brand'))
    sign_board(b, 0.56, 0.085, (0, 0.395, FZ + 0.005), frame='awning', panel='brand')
    b.kenney(FOOD('burger'), T(0, 0.405, FZ + 0.035) @ S(0.17) @ rot_x(90) @ rot_x(-90))
    # side window
    for zz in (-0.2, 0.04):
        b.box((0.012, 0.16, 0.16), (W / 2 + 0.004, 0.16, ZC + zz), 'glass')
        b.box((0.018, 0.012, 0.18), (W / 2 + 0.006, 0.15, ZC + zz), 'white')
    # rooftop: sunburst board + plinth
    rz = ZC - 0.05
    b.cyl(0.25, 0.05, (0, H, rz), 'awning', seg=16)
    b.cyl(0.26, 0.012, (0, H + 0.05, rz), 'white', seg=16)
    rays = []
    for i in range(12):
        a = 2 * math.pi * i / 12
        r0, r1 = 0.20, 0.30
        p0 = (math.cos(a - 0.13) * r0, math.sin(a - 0.13) * r0)
        p1 = (math.cos(a) * r1, math.sin(a) * r1)
        p2 = (math.cos(a + 0.13) * r0, math.sin(a + 0.13) * r0)
        b.prism([p0, p1, p2], 0.02, (0, H + 0.36, rz - 0.17), 'brand')
    b.cyl(0.215, 0.022, (0, H + 0.36, rz - 0.17 - 0.011), 'brand', seg=20, M=rot_x(90))
    b.box((0.03, 0.2, 0.03), (0, H + 0.05, rz - 0.17), 'dark')
    # terrace: two parasol tables
    parasol_table(b, (-0.26, 0.012, 0.36), keys=('awning', 'white'))
    parasol_table(b, (0.13, 0.012, 0.37), keys=('awning', 'brand'))
    menu_board(b, (0.40, 0.012, 0.33), rot=-25)
    # giant burger (+ fries) on the roof
    s.kenney(FOOD('burger-cheese'), S(1.45))
    s.kenney(FOOD('fries'), T(0.34, 0, 0.08) @ S(0.9) @ rot_y(-30))
    return (0, H + 0.062, rz + 0.02)


@landmark('rest-pizza', brand='#d8432d', awning='#2f9a4f', accent='#f4e6c8')
def pizza(b, s):
    pad(b)
    W, H, D, ZC = 0.78, 0.78, 0.56, -0.12
    FZ = ZC + D / 2
    shell(b, W, H, D, ZC, wall='brand', base='dark', cornice='accent', roof='roof')
    # ground floor: arched window + door
    b.box((W + 0.005, 0.02, 0.012), (0, 0.38, FZ), 'accent')   # floor band
    window(b, 0.30, 0.18, (-0.15, 0.08, FZ), frame='accent', mullions=1)
    # arch top (half disc) over the window
    pts = [(math.cos(a) * 0.165, math.sin(a) * 0.08) for a in [i * math.pi / 8 for i in range(9)]]
    b.prism(pts, 0.014, (-0.15, 0.265, FZ + 0.004), 'accent')
    pts2 = [(math.cos(a) * 0.15, math.sin(a) * 0.065) for a in [i * math.pi / 8 for i in range(9)]]
    b.prism(pts2, 0.016, (-0.15, 0.265, FZ + 0.006), 'glass')
    door(b, 0.13, 0.26, (0.22, 0.05, FZ), key='awning', frame='accent')
    # tricolore awning (green / white / red)
    striped_awning(b, -0.36, 0.36, 0.36, FZ, 0.12, 0.06, 9, keys=('awning', 'white', 'brand'))
    # upper floor: two windows with green shutters + flower boxes
    for x in (-0.18, 0.18):
        window(b, 0.12, 0.17, (x, 0.47, FZ), frame='accent', mullions=1)
        for sx in (-1, 1):
            b.box((0.05, 0.17, 0.012), (x + sx * 0.093, 0.47, FZ + 0.006), 'awning')
        b.box((0.15, 0.03, 0.035), (x, 0.43, FZ + 0.02), 'wood')
        for k in range(3):
            b.sphere(0.018, (x - 0.05 + k * 0.05, 0.47, FZ + 0.025), 'brand' if k % 2 == 0 else 'white', seg=6, rings=4, smooth=False)
    sign_board(b, 0.46, 0.07, (0, 0.655, FZ + 0.004), frame='awning', panel='accent')
    b.kenney(FOOD('pizza'), T(0, 0.69, FZ + 0.038) @ S(0.075) @ rot_x(90))
    # wood-fired oven chimney
    b.box((0.09, 0.16, 0.09), (0.26, H, ZC - 0.16), 'brand', bevel=0.008)
    b.box((0.11, 0.02, 0.11), (0.26, H + 0.16, ZC - 0.16), 'dark')
    # easel frame for the giant pizza
    rz = ZC - 0.02
    roof_frame(b, 0.46, 0.34, (0, H, rz - 0.06), post='dark')
    b.box((0.5, 0.025, 0.06), (0, H + 0.04, rz - 0.02), 'dark')
    # terrace
    parasol_table(b, (-0.24, 0.012, 0.36), keys=('awning', 'white', 'brand'), seg=9)
    parasol_table(b, (0.12, 0.012, 0.37), keys=('brand', 'white'))
    menu_board(b, (0.40, 0.012, 0.33), rot=-25)
    planter(b, (-0.42, 0.012, 0.2), w=0.07, d=0.07, key='brand')
    # giant pizza: upright, tilted back, one slice pulled out
    s.kenney(FOOD('pizza'), T(0, 0.33, 0) @ rot_x(80) @ S(0.74), pull={'slice6': 0.05})
    return (0, H + 0.02, rz)


@landmark('rest-sushi', brand='#d2342c', awning='#36404f', accent='#f5b8c8', accent2='#4a2f24')
def sushi(b, s):
    pad(b, key='paving')
    W, H, D, ZC = 0.76, 0.46, 0.54, -0.12
    FZ = ZC + D / 2
    b.box((W, H, D), (0, 0, ZC), 'accent2', bevel=0.01)                  # dark wood body
    b.box((W + 0.02, 0.05, D + 0.02), (0, 0, ZC), 'dark')                # stone base
    # vertical wood slats on the façade
    for i in range(9):
        x = -W / 2 + 0.03 + i * (W - 0.06) / 8
        if -0.27 < x < 0.12:
            continue
        b.box((0.014, H - 0.07, 0.012), (x, 0.05, FZ + 0.004), 'wood')
    # shoji screen window (paper + dark grid)
    b.box((0.30, 0.2, 0.012), (-0.08, 0.1, FZ + 0.004), 'white')
    for i in range(1, 4):
        b.box((0.008, 0.2, 0.016), (-0.08 - 0.15 + i * 0.075, 0.1, FZ + 0.006), 'dark')
    for j in range(1, 3):
        b.box((0.3, 0.008, 0.016), (-0.08, 0.1 + j * 0.0667, FZ + 0.006), 'dark')
    # door with noren curtain
    b.box((0.14, 0.27, 0.014), (0.22, 0.05, FZ + 0.004), 'dark')
    for i in range(3):
        b.box((0.042, 0.09, 0.006), (0.22 - 0.046 + i * 0.046, 0.23, FZ + 0.016), 'brand')
    b.box((0.16, 0.012, 0.012), (0.22, 0.32, FZ + 0.012), 'wood')
    # pagoda-ish hipped roof with up-turned corners (awning = roof tiles)
    res = bmesh.ops.create_cone(b.bm, cap_ends=True, cap_tris=False, segments=4, radius1=0.6, radius2=0.25, depth=0.16)
    vs = res['verts']
    bmesh.ops.transform(b.bm, matrix=Matrix.Rotation(math.radians(-90), 4, 'X'), verts=vs)
    bmesh.ops.transform(b.bm, matrix=Matrix.Rotation(math.radians(45), 4, 'Y'), verts=vs)
    bmesh.ops.scale(b.bm, vec=(1.0, 1.0, 0.76), verts=vs)
    bmesh.ops.translate(b.bm, vec=(0, H + 0.08, ZC), verts=vs)
    b._finish(vs, 'awning', Matrix())
    for sx in (-1, 1):
        for sz in (-1, 1):
            b.box((0.05, 0.02, 0.05), (sx * 0.418, H + 0.01, ZC + sz * 0.318), 'awning', M=Matrix())
    b.box((0.46, 0.03, 0.2), (0, H + 0.16, ZC), 'dark')                  # ridge
    # sign board above the door
    sign_board(b, 0.36, 0.07, (-0.06, 0.34, FZ + 0.005), frame='accent2', panel='brand')
    b.kenney(FOOD('maki-salmon'), T(-0.06, 0.348, FZ + 0.04) @ S(0.5) @ rot_x(90))
    # red lanterns
    lantern(b, (0.10, 0.27, FZ + 0.05), hang=0.04)
    lantern(b, (0.34, 0.27, FZ + 0.05), hang=0.04)
    for x in (-0.42, 0.42):
        b.cyl(0.006, 0.26, (x, 0.012, 0.42), 'dark', seg=5)
        lantern(b, (x, 0.24, 0.42), r=0.03)
    # sakura tree in the corner + bench
    b.cyl(0.018, 0.2, (-0.34, 0.012, 0.30), 'accent2', seg=6)
    for (dx, dy, dz, r) in ((0, 0.25, 0, 0.085), (-0.05, 0.22, 0.04, 0.065), (0.06, 0.23, -0.03, 0.07), (0.02, 0.3, 0.03, 0.06)):
        b.sphere(r, (-0.34 + dx, dy, 0.30 + dz), 'accent', seg=7, rings=5, smooth=False)
    chair_bench(b, (0.05, 0.012, 0.40), w=0.16, key='accent2')
    # wooden platform on the ridge
    b.box((0.46, 0.04, 0.24), (0, H + 0.19, ZC), 'accent2', bevel=0.006)
    b.box((0.48, 0.012, 0.26), (0, H + 0.23, ZC), 'brand')
    # giant salmon maki standing up, cut face toward the street (tilted back), + a nigiri + chopsticks
    s.kenney(FOOD('maki-salmon'), T(-0.04, 0.26, 0.0) @ rot_y(-12) @ rot_x(68) @ S(4.3) @ T(0, -0.035, 0))
    s.kenney(FOOD('sushi-salmon'), T(0.17, 0.0, 0.06) @ rot_y(70) @ S(1.5))
    s.kenney(FOOD('chopstick'), T(0.2, 0.15, -0.06) @ rot_z(-55) @ rot_y(20) @ S(1.5))
    return (0, H + 0.242, ZC + 0.03)


@landmark('rest-cafe', brand='#6b4430', awning='#7a4a33', accent='#f3e2c4')
def cafe(b, s):
    pad(b)
    W, H, D, ZC = 0.80, 0.50, 0.56, -0.12
    FZ = ZC + D / 2
    shell(b, W, H, D, ZC, wall='accent', base='brand', cornice='brand', roof='roof')
    # two big windows + central door
    window(b, 0.24, 0.22, (-0.24, 0.08, FZ), frame='brand', mullions=1)
    window(b, 0.24, 0.22, (0.24, 0.08, FZ), frame='brand', mullions=1)
    door(b, 0.13, 0.26, (0.0, 0.05, FZ), key='brand', frame='brand')
    striped_awning(b, -0.38, 0.38, 0.37, FZ, 0.13, 0.07, 10, keys=('awning', 'accent'), scallop=True)
    sign_board(b, 0.5, 0.08, (0, 0.39, FZ + 0.004), frame='brand', panel='accent')
    b.kenney(FOOD('cup-coffee'), T(0.0, 0.40, FZ + 0.03) @ S(0.3) @ rot_x(0))
    wall_lamp(b, (-0.385, 0.33, FZ + 0.01))
    wall_lamp(b, (0.385, 0.33, FZ + 0.01))
    # rooftop: saucer plinth
    rz = ZC + 0.0
    b.cyl(0.2, 0.05, (0, H, rz), 'brand', seg=16)
    b.cyl(0.26, 0.025, (0, H + 0.05, rz), 'white', seg=20, r2=0.23)
    # terrace: bistro tables, chalkboard, planters
    for x in (-0.25, 0.22):
        b.cyl(0.05, 0.006, (x, 0.012 + 0.075, 0.37), 'white', seg=10)
        b.cyl(0.006, 0.075, (x, 0.012, 0.37), 'dark', seg=6)
        for dx in (-0.075, 0.075):
            b.cyl(0.02, 0.045, (x + dx, 0.012, 0.37), 'brand', seg=8)
    menu_board(b, (0.0, 0.012, 0.40), rot=0)
    planter(b, (-0.42, 0.012, 0.22), w=0.06, d=0.1, key='brand')
    planter(b, (0.42, 0.012, 0.22), w=0.06, d=0.1, key='brand')
    # giant coffee cup with steam
    s.kenney(FOOD('cup-coffee'), rot_y(-35) @ S(2.35))
    for i, (dx, dy, r) in enumerate(((0.0, 0.42, 0.06), (0.04, 0.52, 0.05), (-0.01, 0.61, 0.04))):
        s.sphere(r, (dx, dy, -0.02), 'white', seg=8, rings=5, smooth=False)
    return (0, H + 0.075, rz)


@landmark('rest-donut', brand='#f27fae', awning='#ffd6e6', accent='#7a4a35')
def donut(b, s):
    pad(b)
    W, H, D, ZC = 0.78, 0.50, 0.56, -0.12
    FZ = ZC + D / 2
    shell(b, W, H, D, ZC, wall='brand', base='accent', cornice='white', roof='roof')
    # round porthole windows + shop window + door
    window(b, 0.30, 0.2, (-0.16, 0.09, FZ), frame='white', mullions=2)
    door(b, 0.13, 0.26, (0.22, 0.05, FZ), key='white', frame='white')
    striped_awning(b, -0.37, 0.37, 0.37, FZ, 0.12, 0.07, 10, keys=('awning', 'brand'), scallop=True)
    sign_board(b, 0.5, 0.08, (0, 0.39, FZ + 0.004), frame='white', panel='awning')
    b.kenney(FOOD('donut-sprinkles'), T(0, 0.398, FZ + 0.04) @ S(0.28) @ rot_x(90))
    # sprinkles dots on the walls (cute)
    rnd = random.Random(3)
    for i in range(10):
        x = rnd.uniform(-0.36, 0.36)
        y = rnd.uniform(0.38, 0.46)
        if abs(x) < 0.27:
            continue
        b.box((0.025, 0.008, 0.006), (x, y, FZ + 0.004), rnd.choice(['white', 'awning', 'accent']), M=rot_z(rnd.uniform(-60, 60)))
    # rooftop cradle for the upright donut
    rz = ZC - 0.02
    b.box((0.48, 0.05, 0.16), (0, H, rz), 'accent', bevel=0.01)
    b.box((0.5, 0.015, 0.18), (0, H + 0.05, rz), 'white')
    for sx in (-0.17, 0.17):
        b.box((0.04, 0.12, 0.08), (sx, H + 0.065, rz), 'white', bevel=0.008)
    # terrace
    parasol_table(b, (-0.24, 0.012, 0.37), keys=('brand', 'white'))
    parasol_table(b, (0.13, 0.012, 0.37), keys=('awning', 'brand'))
    menu_board(b, (0.40, 0.012, 0.33), rot=-25, key='accent', frame='white')
    # giant upright donut (hole faces the street)
    s.kenney(FOOD('donut-sprinkles'), T(0, 0.33, 0) @ rot_x(90) @ S(2.55) @ T(0, -0.045, 0))
    return (0, H + 0.065, rz)


@landmark('rest-taco', brand='#f08a2c', awning='#1f9e9a', accent='#f6d34a', accent2='#e0476b')
def taco(b, s):
    pad(b, key='paving')
    W, H, D, ZC = 0.80, 0.46, 0.56, -0.12
    FZ = ZC + D / 2
    b.box((W, H, D), (0, 0, ZC), 'brand', bevel=0.02)                  # adobe body
    b.box((W + 0.01, 0.05, D + 0.01), (0, 0, ZC), 'awning')
    # mission-style stepped parapet on the front
    pts = [(-0.4, 0), (0.4, 0), (0.4, 0.06), (0.24, 0.06), (0.24, 0.11), (0.1, 0.11), (0.06, 0.16), (-0.06, 0.16), (-0.1, 0.11), (-0.24, 0.11), (-0.24, 0.06), (-0.4, 0.06)]
    b.prism(pts, 0.05, (0, H - 0.01, FZ - 0.025), 'brand')
    b.box((0.82, 0.02, 0.06), (0, H - 0.012, FZ - 0.025), 'awning')
    b.box((W - 0.02, 0.012, D - 0.06), (0, H - 0.002, ZC - 0.02), 'roof')
    # teal framed windows + door
    window(b, 0.26, 0.2, (-0.2, 0.09, FZ), frame='awning', mullions=1)
    door(b, 0.13, 0.26, (0.2, 0.05, FZ), key='awning', frame='white')
    window(b, 0.08, 0.12, (0.34, 0.14, FZ), frame='awning', mullions=0)
    # flat canvas awning (teal / yellow)
    striped_awning(b, -0.37, 0.05, 0.34, FZ, 0.1, 0.05, 6, keys=('awning', 'accent'))
    sign_board(b, 0.4, 0.07, (0, 0.375, FZ + 0.004), frame='awning', panel='accent')
    b.kenney(FOOD('taco'), T(0, 0.383, FZ + 0.035) @ S(0.3))
    # papel picado bunting across the terrace
    cols = ['accent2', 'accent', 'awning', 'white']
    for i in range(10):
        x = -0.4 + 0.08 * i + 0.04
        y = 0.40 - 0.03 * math.sin(math.pi * (i + 0.5) / 10)
        b.prism([(-0.025, 0), (0.025, 0), (0, -0.045)], 0.004, (x, y, 0.44), cols[i % 4])
    b.box((0.84, 0.004, 0.004), (0, 0.402, 0.44), 'dark')
    for x in (-0.44, 0.44):
        b.cyl(0.006, 0.41, (x, 0.012, 0.44), 'dark', seg=5)
    # cacti in pots
    for x, h in ((-0.42, 0.14), (0.42, 0.11)):
        b.cyl(0.035, 0.04, (x, 0.012, 0.22), 'brand', seg=8, r2=0.045)
        b.cyl(0.022, h, (x, 0.05, 0.22), 'green', seg=8)
        b.cyl(0.012, 0.05, (x + 0.03, 0.09, 0.22), 'green', seg=6)
    parasol_table(b, (-0.2, 0.012, 0.36), keys=('awning', 'accent', 'accent2', 'white'))
    parasol_table(b, (0.16, 0.012, 0.36), keys=('accent2', 'accent'))
    # rooftop plinth + giant taco
    rz = ZC - 0.06
    b.box((0.5, 0.05, 0.22), (0, H, rz), 'awning', bevel=0.01)
    s.kenney(FOOD('taco'), T(0, 0.0, 0.02) @ rot_y(-8) @ rot_x(28) @ S(1.42))
    return (0, H + 0.05, rz)


@landmark('rest-noodle', brand='#cf2a27', awning='#f2b632', accent='#2f6e5a')
def noodle(b, s):
    pad(b)
    W, H, D, ZC = 0.78, 0.50, 0.56, -0.12
    FZ = ZC + D / 2
    b.box((W, H, D), (0, 0, ZC), 'brand', bevel=0.012)
    b.box((W + 0.02, 0.05, D + 0.02), (0, 0, ZC), 'dark')
    # red pillars with gold caps at the front
    for x in (-0.36, 0.36):
        b.box((0.05, H, 0.05), (x, 0, FZ + 0.01), 'brand', bevel=0.008)
        b.box((0.06, 0.03, 0.06), (x, H - 0.1, FZ + 0.01), 'awning')
    # moon door (round) + windows with gold lattice
    b.cyl(0.11, 0.014, (0.16, 0.16, FZ - 0.002), 'awning', seg=16, M=rot_x(90) @ T(0, -0.007, 0))
    b.cyl(0.095, 0.018, (0.16, 0.16, FZ - 0.002), 'dark', seg=16, M=rot_x(90) @ T(0, -0.009, 0))
    b.box((0.19, 0.06, 0.02), (0.16, 0.012, FZ + 0.004), 'dark')
    window(b, 0.24, 0.18, (-0.17, 0.1, FZ), frame='awning', mullions=2)
    b.box((0.24, 0.01, 0.016), (-0.17, 0.19, FZ + 0.006), 'awning')
    # Chinese roof: green tiles, upturned corners (accent = green tiles, gold ridge)
    res = bmesh.ops.create_cone(b.bm, cap_ends=True, cap_tris=False, segments=4, radius1=0.61, radius2=0.3, depth=0.13)
    vs = res['verts']
    bmesh.ops.transform(b.bm, matrix=Matrix.Rotation(math.radians(-90), 4, 'X'), verts=vs)
    bmesh.ops.transform(b.bm, matrix=Matrix.Rotation(math.radians(45), 4, 'Y'), verts=vs)
    bmesh.ops.scale(b.bm, vec=(1.0, 1.0, 0.78), verts=vs)
    bmesh.ops.translate(b.bm, vec=(0, H + 0.065, ZC), verts=vs)
    b._finish(vs, 'accent', Matrix())
    for sx in (-1, 1):
        for sz in (-1, 1):
            b.cyl(0.018, 0.06, (sx * 0.425, H - 0.01, ZC + sz * 0.322), 'awning', seg=6, r2=0.004, M=Matrix())
    b.box((0.5, 0.025, 0.07), (0, H + 0.13, ZC), 'awning')
    # gold sign board
    sign_board(b, 0.46, 0.08, (0, 0.37, FZ + 0.03), frame='awning', panel='brand')
    b.kenney(FOOD('chinese'), T(0, 0.378, FZ + 0.06) @ S(0.13))
    # lanterns
    for x in (-0.3, -0.04, 0.3):
        lantern(b, (x, 0.29, FZ + 0.06), key='brand', cap='awning', hang=0.04)
    for x in (-0.43, 0.43):
        b.cyl(0.006, 0.28, (x, 0.012, 0.42), 'dark', seg=5)
        lantern(b, (x, 0.26, 0.42), key='brand', cap='awning', r=0.03)
    b.box((0.86, 0.004, 0.004), (0, 0.29, 0.42), 'dark')
    for i in range(5):
        lantern(b, (-0.3 + i * 0.15, 0.245, 0.42), key='brand' if i % 2 else 'awning', cap='dark', r=0.022, hang=0.02)
    chair_bench(b, (-0.2, 0.012, 0.36), w=0.16, key='brand')
    chair_bench(b, (0.2, 0.012, 0.36), w=0.16, key='brand')
    # giant takeout box on the roof
    s.kenney(FOOD('chinese'), rot_y(20) @ S(1.08))
    return (0, H + 0.14, ZC + 0.02)


@landmark('rest-doner', brand='#d22b2b', awning='#d22b2b', accent='#a8602f', accent2='#83441f')
def doner(b, s):
    pad(b)
    W, H, D, ZC = 0.78, 0.50, 0.56, -0.12
    FZ = ZC + D / 2
    shell(b, W, H, D, ZC, wall='white', base='brand', cornice='brand', roof='roof')
    # big open serving window with counter + a small döner on its spit inside
    b.box((0.40, 0.2, 0.012), (-0.12, 0.13, FZ + 0.002), 'dark')
    b.box((0.44, 0.02, 0.06), (-0.12, 0.12, FZ + 0.03), 'metal')
    b.box((0.44, 0.012, 0.012), (-0.12, 0.33, FZ + 0.008), 'brand')
    b.cyl(0.004, 0.17, (-0.04, 0.14, FZ - 0.002), 'metal', seg=5)
    b.cyl(0.028, 0.11, (-0.04, 0.16, FZ - 0.002), 'accent', seg=8, r2=0.045)
    b.box((0.06, 0.13, 0.008), (-0.04, 0.15, FZ - 0.06), 'brand')
    door(b, 0.13, 0.26, (0.25, 0.05, FZ), key='brand', frame='brand')
    striped_awning(b, -0.38, 0.38, 0.37, FZ, 0.13, 0.07, 10, keys=('awning', 'white'))
    sign_board(b, 0.52, 0.08, (0, 0.39, FZ + 0.004), frame='brand', panel='white')
    # little döner icon on the sign
    b.cyl(0.012, 0.055, (0.0, 0.403, FZ + 0.04), 'accent', seg=8, r2=0.022)
    b.cyl(0.002, 0.07, (0.0, 0.398, FZ + 0.04), 'metal', seg=4)
    # rooftop: round red platform with a grill panel behind the spit
    rz = ZC - 0.04
    b.cyl(0.2, 0.04, (0, H, rz), 'brand', seg=16)
    b.cyl(0.21, 0.012, (0, H + 0.04, rz), 'white', seg=16)
    # grill panel (dark with metal frame) behind
    b.box((0.30, 0.58, 0.03), (0, H + 0.05, rz - 0.17), 'metal', bevel=0.006)
    b.box((0.25, 0.52, 0.01), (0, H + 0.08, rz - 0.152), 'dark')
    for i in range(5):
        b.box((0.22, 0.012, 0.004), (0, H + 0.12 + i * 0.1, rz - 0.146), 'accent')
    # the giant döner: vertical spit + inverted cone of meat in layers (child -> can rotate)
    s.cyl(0.11, 0.012, (0, 0, 0), 'metal', seg=14)                       # bottom plate
    s.cyl(0.008, 0.66, (0, 0, 0), 'metal', seg=6)                        # spit
    s.cyl(0.035, 0.02, (0, 0.64, 0), 'metal', seg=8, r2=0.02)            # top cap
    rings = 8
    y = 0.03
    for i in range(rings):
        h = 0.068
        r0 = 0.06 + 0.0125 * i
        r1 = 0.06 + 0.0125 * (i + 1)
        s.cyl(r0, h, (0, y, 0), 'accent' if i % 2 == 0 else 'accent2', seg=12, r2=r1, M=rot_y(i * 11))
        y += h
    s.cyl(r1, 0.025, (0, y, 0), 'accent2', seg=12, r2=0.11)               # rounded top shoulder
    s.cyl(0.11, 0.02, (0, y + 0.025, 0), 'accent', seg=12, r2=0.05)
    # tomato + green pepper on top of the spit, the classic döner look
    s.sphere(0.045, (0, y + 0.07, 0), 'tomato', seg=10, rings=6, scale=(1, 0.8, 1), smooth=False)
    s.cyl(0.018, 0.06, (0, y + 0.1, 0), 'pepper', seg=6, r2=0.008)
    # roasted, crispy outer strips
    for i in range(8):
        a = i * 0.785 + 0.3
        yy = 0.08 + (i % 4) * 0.12
        rr = 0.06 + 0.0125 * (yy - 0.03) / 0.068 + 0.004
        s.box((0.035, 0.07, 0.012), (math.cos(a) * rr, yy, math.sin(a) * rr), 'accent2', M=rot_y(-math.degrees(a) + 90))
    # terrace
    chair_bench(b, (-0.24, 0.012, 0.37), w=0.18, key='brand')
    b.box((0.18, 0.012, 0.07), (-0.24, 0.09, 0.42), 'white')
    b.box((0.012, 0.09, 0.012), (-0.24, 0.0, 0.42), 'dark')
    chair_bench(b, (0.12, 0.012, 0.37), w=0.18, key='brand')
    b.box((0.18, 0.012, 0.07), (0.12, 0.09, 0.42), 'white')
    b.box((0.012, 0.09, 0.012), (0.12, 0.0, 0.42), 'dark')
    menu_board(b, (0.40, 0.012, 0.33), rot=-25)
    return (0, H + 0.052, rz)


@landmark('rest-fish', brand='#1f3d6b', awning='#1f3d6b', accent='#e0412f')
def fish(b, s):
    pad(b, key='paving')
    W, H, D, ZC = 0.80, 0.50, 0.56, -0.12
    FZ = ZC + D / 2
    b.box((W, H, D), (0, 0, ZC), 'white', bevel=0.012)
    # navy weatherboard on the lower half (overlapping planks)
    for i in range(5):
        y = 0.04 + i * 0.045
        b.box((W + 0.012, 0.048, D + 0.012), (0, y, ZC), 'brand', M=Matrix())
        b.box((W + 0.02, 0.006, D + 0.02), (0, y + 0.042, ZC), 'brand')
    b.box((W + 0.03, 0.035, D + 0.03), (0, H - 0.035, ZC), 'brand', bevel=0.006)
    b.box((W - 0.02, 0.012, D - 0.02), (0, H - 0.002, ZC), 'roof')
    for zz, ww in ((FZ + 0.0, W + 0.03),):
        b.box((ww, 0.04, 0.03), (0, H, zz), 'white')
    b.box((W + 0.03, 0.04, 0.03), (0, H, ZC - D / 2), 'white')
    b.box((0.03, 0.04, D), (W / 2, H, ZC), 'white')
    b.box((0.03, 0.04, D), (-W / 2, H, ZC), 'white')
    # portholes + shop window + door
    for x in (-0.3, -0.12):
        b.cyl(0.055, 0.016, (x, 0.32, FZ - 0.004), 'metal', seg=14, M=rot_x(90) @ T(0, -0.008, 0))
        b.cyl(0.042, 0.02, (x, 0.32, FZ - 0.004), 'glass', seg=14, M=rot_x(90) @ T(0, -0.01, 0))
    window(b, 0.3, 0.13, (-0.2, 0.09, FZ + 0.004), frame='white', mullions=2)
    door(b, 0.13, 0.27, (0.22, 0.05, FZ + 0.004), key='white', frame='white')
    # lifebuoy (red / white)
    b.torus(0.045, 0.014, (0.06, 0.3, FZ + 0.03), 'accent', seg=12, rseg=6, M=rot_x(90), keys=['accent', 'white', 'accent', 'white'])
    striped_awning(b, -0.38, 0.38, 0.415, FZ + 0.004, 0.1, 0.05, 10, keys=('awning', 'white'))
    sign_board(b, 0.5, 0.07, (0, 0.43, FZ + 0.03), frame='white', panel='brand')
    b.kenney(FOOD('fish'), T(0.0, 0.435, FZ + 0.07) @ S(0.17) @ rot_y(90))
    # roof: rope-wrapped posts + frame for the fish
    rz = ZC - 0.04
    roof_frame(b, 0.6, 0.22, (0, H + 0.04, rz - 0.06), post='wood', top='wood')
    b.box((0.66, 0.03, 0.22), (0, H + 0.04, rz), 'wood', bevel=0.006)
    # terrace: picnic table + barrel + bollards
    b.box((0.26, 0.014, 0.1), (-0.2, 0.09, 0.38), 'wood')
    for dz in (-0.075, 0.075):
        b.box((0.26, 0.01, 0.04), (-0.2, 0.05, 0.38 + dz), 'wood')
    for dx in (-0.1, 0.1):
        b.box((0.012, 0.09, 0.012), (-0.2 + dx, 0.012, 0.38), 'dark')
    b.cyl(0.045, 0.11, (0.17, 0.012, 0.39), 'wood', seg=10)
    b.cyl(0.047, 0.008, (0.17, 0.04, 0.39), 'dark', seg=10)
    b.cyl(0.047, 0.008, (0.17, 0.09, 0.39), 'dark', seg=10)
    for x in (-0.42, 0.42):
        b.cyl(0.025, 0.07, (x, 0.012, 0.44), 'dark', seg=8)
    b.box((0.84, 0.006, 0.006), (0, 0.07, 0.44), 'wood')
    # giant fish leaping over a cone of fries
    s.kenney(FOOD('fish'), T(-0.06, 0.08, 0) @ rot_y(90) @ rot_x(-12) @ S(1.15))
    s.kenney(FOOD('fries'), T(0.27, 0.0, 0.03) @ S(0.85))
    return (0, H + 0.07, rz)


@landmark('rest-icecream', brand='#9fe3c9', awning='#ffb3cf', accent='#fff1a8', accent2='#e8475a')
def icecream(b, s):
    pad(b)
    W, H, D, ZC = 0.76, 0.48, 0.54, -0.12
    FZ = ZC + D / 2
    shell(b, W, H, D, ZC, wall='brand', base='awning', cornice='white', roof='roof')
    # serving hatch with counter + door
    b.box((0.34, 0.16, 0.012), (-0.14, 0.14, FZ + 0.002), 'glass')
    b.box((0.38, 0.02, 0.07), (-0.14, 0.13, FZ + 0.035), 'white')
    b.box((0.36, 0.012, 0.012), (-0.14, 0.3, FZ + 0.006), 'white')
    door(b, 0.13, 0.26, (0.23, 0.05, FZ), key='awning', frame='white')
    striped_awning(b, -0.37, 0.37, 0.37, FZ, 0.12, 0.07, 10, keys=('awning', 'white'), scallop=True)
    sign_board(b, 0.48, 0.08, (0, 0.39, FZ + 0.004), frame='white', panel='awning')
    b.kenney(FOOD('ice-cream'), T(0, 0.392, FZ + 0.035) @ S(0.16) @ rot_x(90) @ rot_x(-90))
    # polka dots on the side walls
    for i, (zz, yy) in enumerate(((-0.3, 0.12), (-0.18, 0.3), (-0.05, 0.16), (0.05, 0.35), (-0.32, 0.38))):
        for sx in (-1, 1):
            b.cyl(0.022, 0.006, (sx * (W / 2 + 0.002), yy, ZC + zz + 0.12), ['awning', 'accent', 'white'][i % 3], seg=8, M=rot_z(-90 * sx))
    # roof plinth: waffle-cone-coloured cup
    rz = ZC - 0.04
    b.cyl(0.17, 0.05, (0, H, rz), 'awning', seg=16)
    b.cyl(0.18, 0.012, (0, H + 0.05, rz), 'white', seg=16)
    # terrace: pastel parasols + benches
    parasol_table(b, (-0.24, 0.012, 0.37), keys=('awning', 'accent', 'brand', 'white'))
    parasol_table(b, (0.13, 0.012, 0.37), keys=('brand', 'white'))
    menu_board(b, (0.40, 0.012, 0.33), rot=-25, key='awning', frame='white')
    # giant ice cream cone (+ cherry)
    s.kenney(FOOD('ice-cream'), S(1.55))
    s.sphere(0.045, (0.01, 0.765, 0.02), 'accent2', seg=8, rings=6)
    s.cyl(0.004, 0.06, (0.02, 0.8, 0.02), 'green', seg=4, M=rot_z(-20))
    return (0, H + 0.062, rz)


@landmark('garage', brand='#5f8794', awning='#9a5a37', accent='#e08a2c', accent2='#d9cdb4')
def garage(b, s):
    pad(b, key='paving', h=0.01)
    W, H, D, ZC = 0.74, 0.42, 0.62, -0.12
    FZ = ZC + D / 2
    b.box((W, H, D), (0, 0, ZC), 'brand', bevel=0.006)
    # corrugated ribs
    for i in range(12):
        x = -W / 2 + 0.03 + i * (W - 0.06) / 11
        b.box((0.012, H - 0.04, 0.01), (x, 0.02, ZC - D / 2 - 0.003), 'brand')
    for i in range(9):
        z = ZC - D / 2 + 0.04 + i * (D - 0.08) / 8
        b.box((0.01, H - 0.04, 0.012), (W / 2 + 0.003, 0.02, z), 'brand')
        b.box((0.01, H - 0.04, 0.012), (-W / 2 - 0.003, 0.02, z), 'brand')
    # rust patches
    for (x, y, w, h) in ((-0.3, 0.05, 0.12, 0.08), (0.28, 0.28, 0.1, 0.07), (0.33, 0.06, 0.06, 0.05)):
        b.box((w, h, 0.008), (x, y, FZ + 0.002), 'awning')
    b.box((0.012, 0.1, 0.09), (W / 2 + 0.008, 0.2, ZC + 0.1), 'awning')
    # slightly sloped roof (single pitch)
    b.box((W + 0.06, 0.03, D + 0.08), (0, H - 0.01, ZC), 'metal', M=rot_x(-4))
    # roll-up door, half open, with slats
    dw = 0.42
    b.box((dw + 0.04, 0.32, 0.016), (-0.07, 0.0, FZ), 'dark')
    for i in range(6):
        b.box((dw, 0.03, 0.02), (-0.07, 0.14 + i * 0.03, FZ + 0.004), 'accent2')
    b.box((dw, 0.012, 0.022), (-0.07, 0.135, FZ + 0.006), 'dark')
    b.box((dw + 0.06, 0.04, 0.05), (-0.07, 0.32, FZ + 0.01), 'accent2')  # roller housing
    # small side door + dirty window
    door(b, 0.1, 0.24, (0.25, 0.012, FZ), key='awning', frame='accent2')
    b.box((0.012, 0.1, 0.16), (W / 2 + 0.004, 0.2, ZC - 0.12), 'glass')
    # rusty canopy over the door
    b.box((0.18, 0.012, 0.1), (0.25, 0.3, FZ + 0.05), 'awning', M=rot_x(10))
    # bulb lamp
    b.box((0.008, 0.008, 0.04), (-0.07, 0.36, FZ + 0.03), 'dark')
    b.sphere(0.012, (-0.07, 0.35, FZ + 0.05), 'accent2', seg=6, rings=4)
    # tool sign on the roof edge, a little crooked: board + wrench silhouette
    b.box((0.02, 0.12, 0.02), (-0.2, H + 0.0, FZ - 0.06), 'dark')
    b.box((0.02, 0.12, 0.02), (0.2, H + 0.0, FZ - 0.06), 'dark')
    # oil barrels, tyre stack, workbench, crates
    for (x, z, k) in ((0.34, 0.3, 'accent'), (0.27, 0.36, 'brand')):
        b.cyl(0.04, 0.12, (x, 0.01, z), k, seg=10)
        b.cyl(0.041, 0.006, (x, 0.05, z), 'dark', seg=10)
        b.cyl(0.041, 0.006, (x, 0.09, z), 'dark', seg=10)
    for i in range(3):
        b.torus(0.04, 0.018, (-0.38, 0.03 + i * 0.036, 0.33), 'dark', seg=10, rseg=5, smooth=False)
    b.torus(0.04, 0.018, (-0.30, 0.06, 0.41), 'dark', seg=10, rseg=5, smooth=False, M=rot_z(80))
    b.box((0.16, 0.012, 0.06), (0.06, 0.09, 0.4), 'wood')
    for dx in (-0.07, 0.07):
        b.box((0.01, 0.09, 0.05), (0.06 + dx, 0.0, 0.4), 'dark')
    b.box((0.04, 0.02, 0.02), (0.03, 0.1, 0.4), 'accent')
    b.box((0.08, 0.06, 0.06), (-0.22, 0.01, 0.40), 'wood', bevel=0.004)
    b.box((0.06, 0.05, 0.05), (-0.2, 0.07, 0.41), 'wood', bevel=0.004, M=rot_y(15))
    # tool sign (child so it can swing a bit): board + wrench + gear
    s.box((0.36, 0.11, 0.02), (0, 0, 0), 'accent2', bevel=0.006)
    s.box((0.34, 0.09, 0.006), (0, 0.01, 0.012), 'accent')
    # wrench: handle + open jaw
    s.box((0.17, 0.022, 0.008), (-0.03, 0.044, 0.018), 'dark', M=rot_z(-12))
    jaw = [(math.cos(a) * 0.03, math.sin(a) * 0.03) for a in [math.radians(d) for d in range(40, 330, 30)]]
    jaw += [(math.cos(math.radians(d)) * 0.012, math.sin(math.radians(d)) * 0.012) for d in range(320, 30, -30)]
    s.prism(jaw, 0.008, (0.07, 0.035, 0.018), 'dark')
    s.cyl(0.026, 0.008, (-0.12, 0.055, 0.014), 'dark', seg=8, M=rot_x(90))
    s.cyl(0.01, 0.01, (-0.12, 0.055, 0.016), 'accent2', seg=6, M=rot_x(90))
    return (0, H + 0.08, FZ - 0.05)


@landmark('office', brand='#d8322b', awning='#d8322b', accent='#2b3440')
def office(b, s):
    pad(b, key='paving')
    W, H, D, ZC = 0.80, 0.62, 0.58, -0.12
    FZ = ZC + D / 2
    b.box((W, H, D), (0, 0, ZC), 'white', bevel=0.01)
    b.box((W + 0.012, 0.04, D + 0.012), (0, 0, ZC), 'accent')
    # glass curtain wall across the front (2 storeys) with dark mullions
    b.box((0.56, 0.5, 0.012), (-0.08, 0.06, FZ + 0.003), 'glass')
    for i in range(5):
        b.box((0.012, 0.5, 0.018), (-0.36 + i * 0.14, 0.06, FZ + 0.006), 'accent')
    b.box((0.56, 0.014, 0.018), (-0.08, 0.30, FZ + 0.006), 'accent')
    b.box((0.58, 0.012, 0.02), (-0.08, 0.56, FZ + 0.006), 'accent')
    # red accent band + entrance canopy
    b.box((W + 0.02, 0.05, D + 0.02), (0, H - 0.05, ZC), 'brand')
    b.box((0.2, 0.26, 0.016), (0.29, 0.04, FZ + 0.004), 'glass')
    b.box((0.012, 0.26, 0.02), (0.29, 0.04, FZ + 0.008), 'accent')
    b.box((0.26, 0.02, 0.16), (0.29, 0.31, FZ + 0.08), 'awning', bevel=0.005)
    for dx in (-0.11, 0.11):
        b.box((0.012, 0.31, 0.012), (0.29 + dx, 0.0, FZ + 0.15), 'accent')
    b.box((W - 0.02, 0.012, D - 0.02), (0, H - 0.002, ZC), 'roof')
    # company logo above the entrance: red tile with a white delivery box + fork & knife cross
    b.box((0.15, 0.15, 0.014), (0.29, 0.37, FZ + 0.004), 'brand', bevel=0.004)
    b.box((0.09, 0.08, 0.008), (0.29, 0.405, FZ + 0.014), 'white')
    b.box((0.075, 0.008, 0.006), (0.29, 0.445, FZ + 0.02), 'brand', M=rot_z(40))
    b.box((0.075, 0.008, 0.006), (0.29, 0.445, FZ + 0.02), 'brand', M=rot_z(-40))
    # red stripe wrapping the side walls
    b.box((W + 0.014, 0.03, D - 0.1), (0, 0.29, ZC - 0.04), 'brand')
    # side windows
    for y in (0.08, 0.34):
        b.box((0.012, 0.18, 0.4), (W / 2 + 0.003, y, ZC), 'glass')
    # roof: AC unit + rooftop sign frame
    b.box((0.14, 0.07, 0.1), (0.24, H, ZC - 0.17), 'metal', bevel=0.006)
    rz = ZC - 0.04
    roof_frame(b, 0.6, 0.11, (0, H, rz), post='accent')
    # planters, bike rack, parcel lockers
    planter(b, (-0.36, 0.012, 0.36), w=0.12, d=0.07, key='accent')
    planter(b, (-0.06, 0.012, 0.36), w=0.12, d=0.07, key='accent')
    b.box((0.16, 0.22, 0.08), (0.36, 0.012, 0.2), 'brand', bevel=0.006)
    for i in range(3):
        b.box((0.13, 0.004, 0.084), (0.36, 0.06 + i * 0.06, 0.2), 'white')
    # sign board child: red board with a white scooter + delivery box silhouette
    s.box((0.62, 0.26, 0.03), (0, 0, 0), 'brand', bevel=0.01)
    s.box((0.58, 0.22, 0.006), (0, 0.02, 0.016), 'accent')
    Z = 0.02
    # scooter: wheels, body, seat, handlebar
    for x in (-0.15, 0.06):
        s.cyl(0.04, 0.012, (x, 0.07, Z), 'white', seg=12, M=rot_x(90))
        s.cyl(0.018, 0.016, (x, 0.07, Z), 'accent', seg=10, M=rot_x(90))
    body = [(-0.19, 0.08), (-0.1, 0.075), (0.0, 0.08), (0.04, 0.1), (0.07, 0.2), (0.09, 0.2), (0.075, 0.105), (0.1, 0.075), (0.08, 0.06), (0.0, 0.065), (-0.06, 0.12), (-0.17, 0.125), (-0.2, 0.1)]
    s.prism(list(reversed(body)), 0.012, (0, 0, Z), 'white')
    s.box((0.08, 0.016, 0.012), (-0.11, 0.125, Z), 'white')
    s.box((0.05, 0.012, 0.012), (0.085, 0.2, Z), 'white')
    # delivery box with fork & knife cross
    s.box((0.1, 0.09, 0.012), (-0.135, 0.14, Z), 'white')
    s.box((0.075, 0.008, 0.006), (-0.135, 0.18, Z + 0.008), 'brand', M=rot_z(40))
    s.box((0.075, 0.008, 0.006), (-0.135, 0.18, Z + 0.008), 'brand', M=rot_z(-40))
    # speed lines
    for i, y in enumerate((0.1, 0.14, 0.18)):
        s.box((0.07 - i * 0.012, 0.008, 0.008), (-0.25, y, Z), 'white')
    # "box" icon right of the scooter
    s.box((0.1, 0.1, 0.012), (0.2, 0.06, Z), 'white')
    s.box((0.1, 0.012, 0.016), (0.2, 0.11, Z), 'brand')
    s.box((0.014, 0.1, 0.016), (0.2, 0.06, Z), 'brand')
    return (0, H + 0.11, rz + 0.01)


# ------------------------------------------------------------------ build + export
names = [n for n in LANDMARKS if not ONLY or n in ONLY]
objs = []
for n in names:
    ob = LANDMARKS[n]()
    objs.append(ob)
    tris = sum(len(p.vertices) - 2 for p in ob.data.polygons)
    for c in ob.children:
        tris += sum(len(p.vertices) - 2 for p in c.data.polygons)
    mats = {m.name.split('@')[0] for m in ob.data.materials} | {m.name.split('@')[0] for c in ob.children for m in c.data.materials}
    print(f'LANDMARK {n}: tris={tris} materials={len(mats)} {sorted(mats)}')

write_palette()
bpy.ops.export_scene.gltf(filepath=OUT, export_format='GLB', export_yup=True, export_apply=True,
                          export_texcoords=True, export_normals=True, export_materials='EXPORT',
                          export_cameras=False, export_lights=False, use_selection=False, export_extras=True)
print('EXPORTED', OUT)

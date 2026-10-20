"""Food Delivery Simulator - icon renderer (Blender 5.2, EEVEE, headless).

Renders every icon of the game as a raw, oversized RGBA PNG (+ a .json with framing info).
`icons_post.py` (plain python3 + numpy + Pillow) then crops/frames them, adds the dark
"cartoon" outline, downsamples to the final size and writes PNG + WebP + the contact sheet.

    blender -b --factory-startup -P tools/blender/icons.py -- --raw /tmp/fds-icons/raw [--only a,b] [--group food,char,ui] [--samples 64]
    python3 tools/blender/icons_post.py --raw /tmp/fds-icons/raw

Groups
  food-*  256 px, Kenney Food Kit (CC0) items, 3/4 view; food-doner is modelled here.
  char-*  256 px, Kenney Mini Characters (CC0), head-and-shoulders, identical camera for all 12.
  ui-*    128 px, modelled here from primitives / extruded curves ("chunky toy" style).

Look: soft studio key (upper left, fairly frontal), cool fill, warm + cool rims from behind,
gradient world for glossy reflections, Standard view transform (no AgX desaturation) so the Kenney
palette stays as authored. Light levels live in LIGHT (override: --light '{"key": 2.2}').
Every light is placed in the camera frame, so all icons share exactly the same lighting.
Final build uses --samples 64 (default); ~20 s per icon on 20 CPU cores, less on an idle box.
"""
import bpy, bmesh, math, os, sys, json, time
from mathutils import Vector, Matrix, Euler, Quaternion

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
KEN = os.path.join(ROOT, 'assets', 'src', 'kenney')
FOOD_DIR = os.path.join(KEN, 'kenney_food-kit', 'Models', 'GLB format')
CHAR_DIR = os.path.join(KEN, 'kenney_mini-characters', 'Models', 'GLB format')

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
def _arg(name, default=None):
    if name in argv:
        i = argv.index(name)
        return argv[i + 1]
    return default
RAW = os.path.abspath(_arg('--raw', '/tmp/fds-icons/raw'))
ONLY = [s for s in (_arg('--only', '') or '').split(',') if s]
GROUPS = [s for s in (_arg('--group', '') or '').split(',') if s]
SAMPLES = int(_arg('--samples', '64'))
os.makedirs(RAW, exist_ok=True)

# light levels (sun strengths, world strength, per-group exposure); override with --light '{"key": 2}'
LIGHT = dict(key=2.0, fill=0.45, rim=1.6, rim2=0.6, world=0.45, exp_food=0.0, exp_char=0.0, exp_ui=0.15)
LIGHT.update(json.loads(_arg('--light', '{}')))

REG = {}          # name -> dict(fn, group, out, res)
def icon(name, group, out, res):
    def deco(fn):
        REG[name] = dict(fn=fn, group=group, out=out, res=res)
        return fn
    return deco

# ----------------------------------------------------------------------------- scene basics

def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    sc.render.engine = 'BLENDER_EEVEE'
    sc.render.film_transparent = True
    sc.render.image_settings.file_format = 'PNG'
    sc.render.image_settings.color_mode = 'RGBA'
    sc.render.image_settings.color_depth = '8'
    sc.render.filter_size = 1.2
    sc.view_settings.view_transform = 'Standard'
    sc.view_settings.look = 'None'
    sc.view_settings.exposure = 0.0
    sc.view_settings.gamma = 1.0
    sc.display_settings.display_device = 'sRGB'
    ee = sc.eevee
    ee.taa_render_samples = SAMPLES
    ee.use_shadows = True
    ee.shadow_ray_count = 3
    ee.shadow_step_count = 12
    ee.use_fast_gi = True
    ee.fast_gi_method = 'GLOBAL_ILLUMINATION'
    ee.fast_gi_distance = 0.0
    ee.use_raytracing = False
    ee.clamp_surface_indirect = 10.0
    return sc


def world(top=(0.86, 0.92, 1.0), mid=(0.5, 0.52, 0.58), bot=(0.26, 0.22, 0.2), strength=None):
    """Vertical gradient studio world: bright cool top, neutral horizon, dark warm floor."""
    w = bpy.data.worlds.new('studio')
    bpy.context.scene.world = w
    try:
        if hasattr(w, 'use_nodes') and not w.use_nodes:
            w.use_nodes = True
    except Exception:
        pass
    nt = w.node_tree
    nt.nodes.clear()
    tc = nt.nodes.new('ShaderNodeTexCoord')
    sep = nt.nodes.new('ShaderNodeSeparateXYZ')
    ramp = nt.nodes.new('ShaderNodeValToRGB')
    mr = nt.nodes.new('ShaderNodeMapRange')
    mr.inputs['From Min'].default_value = -1.0
    mr.inputs['From Max'].default_value = 1.0
    bg = nt.nodes.new('ShaderNodeBackground')
    out = nt.nodes.new('ShaderNodeOutputWorld')
    nt.links.new(tc.outputs['Generated'], sep.inputs[0])
    nt.links.new(sep.outputs['Z'], mr.inputs['Value'])
    nt.links.new(mr.outputs['Result'], ramp.inputs['Fac'])
    els = ramp.color_ramp.elements
    els[0].position = 0.25; els[0].color = (*bot, 1)
    els[1].position = 1.0; els[1].color = (*top, 1)
    e = els.new(0.55); e.color = (*mid, 1)
    nt.links.new(ramp.outputs['Color'], bg.inputs['Color'])
    bg.inputs['Strength'].default_value = LIGHT['world'] if strength is None else strength
    nt.links.new(bg.outputs['Background'], out.inputs['Surface'])
    return w


def sun(name, direction, strength, color=(1, 1, 1), angle_deg=20.0, shadow=True):
    """direction = vector pointing FROM the light TO the subject (world space)."""
    ld = bpy.data.lights.new(name, 'SUN')
    ld.energy = strength
    ld.color = color
    ld.angle = math.radians(angle_deg)
    ld.use_shadow = shadow
    ob = bpy.data.objects.new(name, ld)
    bpy.context.scene.collection.objects.link(ob)
    d = Vector(direction).normalized()
    ob.rotation_mode = 'QUATERNION'
    ob.rotation_quaternion = d.to_track_quat('-Z', 'Y')
    return ob


def light_rig(cam):
    """Lights defined in the camera frame so every icon gets identical lighting."""
    key, fill, rim, rim2 = LIGHT['key'], LIGHT['fill'], LIGHT['rim'], LIGHT['rim2']
    m = cam.matrix_world.to_3x3()
    right, up, back = m.col[0], m.col[1], m.col[2]     # back = from subject towards camera
    def to_subject(r, u, b):                           # position of light in cam frame -> direction to subject
        return -(right * r + up * u + back * b)
    sun('key', to_subject(-0.6, 0.85, 0.95), key, (1.0, 0.97, 0.92), 28)
    sun('fill', to_subject(0.95, -0.05, 0.6), fill, (0.82, 0.88, 1.0), 45, shadow=False)
    sun('rim', to_subject(0.7, 0.55, -1.0), rim, (1.0, 0.93, 0.82), 10, shadow=False)
    sun('rim2', to_subject(-0.9, 0.35, -0.8), rim2, (0.85, 0.92, 1.0), 10, shadow=False)


def mesh_objects():
    return [o for o in bpy.context.scene.objects if o.type in ('MESH', 'CURVE', 'FONT') and not o.hide_render]


def world_points(objs=None):
    dg = bpy.context.evaluated_depsgraph_get()
    pts = []
    for o in (objs or mesh_objects()):
        oe = o.evaluated_get(dg)
        me = oe.to_mesh()
        mw = oe.matrix_world
        pts.extend(mw @ v.co for v in me.vertices)
        oe.to_mesh_clear()
    return pts


def make_camera(az=-32.0, el=28.0, lens=70.0, fill=0.86, pts=None, target=None, roll=0.0):
    """Camera looking at the subject from azimuth `az` (deg, 0 = front (-Y), + = from the right)
    and elevation `el`; distance/shift fitted so the subject fills `fill` of the frame."""
    sc = bpy.context.scene
    cd = bpy.data.cameras.new('cam')
    cd.lens = lens
    cd.sensor_width = 36
    cd.sensor_fit = 'AUTO'
    cd.clip_start = 0.001
    cd.clip_end = 1000
    cam = bpy.data.objects.new('cam', cd)
    sc.collection.objects.link(cam)
    sc.camera = cam
    pts = pts if pts is not None else world_points()
    lo = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
    hi = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
    c = target if target is not None else (lo + hi) / 2
    R = max((p - c).length for p in pts)
    a, e = math.radians(az), math.radians(el)
    d = Vector((math.sin(a) * math.cos(e), -math.cos(a) * math.cos(e), math.sin(e)))
    k = (lens / 36.0)
    dist = R * k * 2.0 / fill + R
    q = (-d).to_track_quat('-Z', 'Y')
    if roll:
        q = q @ Quaternion((0, 0, 1), math.radians(roll))
    cam.rotation_mode = 'QUATERNION'
    cam.rotation_quaternion = q
    for _ in range(4):
        cam.location = c + d * dist
        bpy.context.view_layer.update()
        inv = cam.matrix_world.inverted()
        xs, ys = [], []
        for p in pts:
            pc = inv @ p
            z = -pc.z
            xs.append(pc.x / z * k)
            ys.append(pc.y / z * k)
        cd.shift_x = (min(xs) + max(xs)) / 2
        cd.shift_y = (min(ys) + max(ys)) / 2
        ext = max(max(xs) - min(xs), max(ys) - min(ys))
        dist *= ext / fill
    cam.location = c + d * dist
    bpy.context.view_layer.update()
    return cam


def render(name, res, meta):
    sc = bpy.context.scene
    sc.render.resolution_x = sc.render.resolution_y = res
    sc.render.resolution_percentage = 100
    sc.render.filepath = os.path.join(RAW, name + '.png')
    t = time.time()
    bpy.ops.render.render(write_still=True)
    with open(os.path.join(RAW, name + '.json'), 'w') as f:
        json.dump(meta, f)
    print(f'[icons] {name}: {time.time() - t:.1f}s', flush=True)

# ----------------------------------------------------------------------------- materials

def bsdf_of(mat):
    for n in mat.node_tree.nodes:
        if n.type == 'BSDF_PRINCIPLED':
            return n
    return None


def setin(node, name, val):
    if name in node.inputs:
        node.inputs[name].default_value = val


def glossify(mat, rough=0.5, coat=0.18, coat_rough=0.2, spec=0.5):
    b = bsdf_of(mat)
    if not b:
        return
    setin(b, 'Roughness', rough)
    setin(b, 'Specular IOR Level', spec)
    setin(b, 'Coat Weight', coat)
    setin(b, 'Coat Roughness', coat_rough)


def mat(name, color, rough=0.38, coat=0.4, coat_rough=0.15, metal=0.0, emit=None, emit_strength=1.0,
        spec=0.5, alpha=1.0, transmission=0.0):
    """Toy-plastic material. colour is given in sRGB (0..1 or hex string)."""
    if isinstance(color, str):
        color = hex2rgb(color)
    m = bpy.data.materials.new(name)
    try:
        m.use_nodes = True
    except Exception:
        pass
    b = bsdf_of(m)
    setin(b, 'Base Color', (*srgb2lin(color), 1))
    setin(b, 'Roughness', rough)
    setin(b, 'Metallic', metal)
    setin(b, 'Specular IOR Level', spec)
    setin(b, 'Coat Weight', coat)
    setin(b, 'Coat Roughness', coat_rough)
    if emit is not None:
        if isinstance(emit, str):
            emit = hex2rgb(emit)
        setin(b, 'Emission Color', (*srgb2lin(emit), 1))
        setin(b, 'Emission Strength', emit_strength)
    if transmission:
        setin(b, 'Transmission Weight', transmission)
    if alpha < 1:
        setin(b, 'Alpha', alpha)
    m.diffuse_color = (*srgb2lin(color), 1)
    return m


def hex2rgb(h):
    h = h.lstrip('#')
    return tuple(int(h[i:i + 2], 16) / 255.0 for i in (0, 2, 4))


def srgb2lin(c):
    return tuple((x / 12.92) if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c)

# ----------------------------------------------------------------------------- Kenney import

def import_glb(path):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=path)
    new = [o for o in bpy.data.objects if o not in before]
    return new


def food(name, loc=(0, 0, 0), rot=(0, 0, 0), scale=1.0):
    """Import a Kenney food item (from its own folder so Textures/colormap.png resolves),
    parent its parts under one empty, gloss up the materials; returns (empty, parts)."""
    objs = import_glb(os.path.join(FOOD_DIR, name + '.glb'))
    root = bpy.data.objects.new(name + '-root', None)
    bpy.context.scene.collection.objects.link(root)
    for o in objs:
        if o.parent is None:
            o.parent = root
    root.location = loc
    root.rotation_euler = [math.radians(r) for r in rot]
    root.scale = (scale, scale, scale)
    for o in objs:
        for s in getattr(o, 'material_slots', []):
            if s.material and not s.material.get('_gloss'):
                glossify(s.material)
                s.material['_gloss'] = 1
    bpy.context.view_layer.update()
    return root, objs


# ----------------------------------------------------------------------------- geometry helpers

BOLD_FONT = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'


def link(ob):
    bpy.context.scene.collection.objects.link(ob)
    return ob


def place(ob, loc=(0, 0, 0), rot=(0, 0, 0), scale=None, parent=None):
    ob.location = loc
    ob.rotation_euler = [math.radians(r) for r in rot]
    if scale is not None:
        ob.scale = scale if hasattr(scale, '__len__') else (scale, scale, scale)
    if parent is not None:
        ob.parent = parent
    return ob


def rot_seq(ob, *steps):
    """Apply world-axis rotations in order, e.g. rot_seq(ob, ('Y', 90), ('Z', 30))."""
    m = Matrix.Identity(3)
    for ax, deg in steps:
        m = Matrix.Rotation(math.radians(deg), 3, ax) @ m
    ob.rotation_mode = 'QUATERNION'
    ob.rotation_quaternion = m.to_quaternion()
    return ob


def finish(name, bm, material=None, smooth=True, sharp=35.0, mats=None, **kw):
    me = bpy.data.meshes.new(name)
    bm.normal_update()
    bm.to_mesh(me)
    bm.free()
    for m in (mats or ([material] if material else [])):
        me.materials.append(m)
    if smooth:
        me.shade_smooth()
        if sharp:
            me.set_sharp_from_angle(angle=math.radians(sharp))
    ob = link(bpy.data.objects.new(name, me))
    return place(ob, **kw)


def arc(cx, cy, r, a0, a1, n=8):
    """Points on an arc (degrees), inclusive."""
    return [(cx + r * math.cos(math.radians(a0 + (a1 - a0) * i / n)),
             cy + r * math.sin(math.radians(a0 + (a1 - a0) * i / n))) for i in range(n + 1)]


def lathe(name, prof, material=None, segs=48, sharp=35.0, **kw):
    """Revolve a (r, z) profile (bottom -> top) around Z. r == 0 makes a pole."""
    bm = bmesh.new()
    rings = []
    for r, z in prof:
        if r <= 1e-6:
            rings.append([bm.verts.new((0, 0, z))])
        else:
            rings.append([bm.verts.new((r * math.cos(2 * math.pi * i / segs), r * math.sin(2 * math.pi * i / segs), z))
                          for i in range(segs)])
    for A, B in zip(rings, rings[1:]):
        if len(A) == 1 and len(B) == 1:
            continue
        for i in range(segs):
            j = (i + 1) % segs
            if len(A) == 1:
                bm.faces.new((A[0], B[j], B[i]))
            elif len(B) == 1:
                bm.faces.new((A[i], A[j], B[0]))
            else:
                bm.faces.new((A[i], A[j], B[j], B[i]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    return finish(name, bm, material, sharp=sharp, **kw)


def disc_prof(r, h, rr, n=6, z0=0.0):
    """Profile of a cylinder with rounded rims (radius rr), bottom at z0."""
    rr = min(rr, r * 0.99, h / 2 * 0.99)
    p = [(0, z0)]
    p += arc(r - rr, z0 + rr, rr, -90, 0, n)
    p += arc(r - rr, z0 + h - rr, rr, 0, 90, n)
    p += [(0, z0 + h)]
    return p


def disc(name, r, h, rr, material=None, segs=64, z0=0.0, **kw):
    return lathe(name, disc_prof(r, h, rr, z0=z0), material, segs=segs, **kw)


def rbox(name, size, radius, material=None, segs=4, sharp=30.0, **kw):
    """Box (full size x, y, z) centred on the origin with rounded edges."""
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts:
        v.co = Vector((v.co.x * size[0], v.co.y * size[1], v.co.z * size[2]))
    if radius > 0:
        bmesh.ops.bevel(bm, geom=bm.verts[:] + bm.edges[:], offset=radius, segments=segs, profile=0.5,
                        affect='EDGES', clamp_overlap=True)
    return finish(name, bm, material, sharp=sharp, **kw)


def sphere(name, r, material=None, segs=48, rings=24, **kw):
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=segs, v_segments=rings, radius=r)
    return finish(name, bm, material, sharp=0, **kw)


def tube(name, pts, r, material=None, segs=20, caps=True, **kw):
    """Round tube along a 3D polyline (bevelled curve)."""
    cu = bpy.data.curves.new(name, 'CURVE')
    cu.dimensions = '3D'
    cu.bevel_depth = r
    cu.bevel_resolution = 6
    cu.use_fill_caps = caps
    sp = cu.splines.new('POLY')
    sp.points.add(len(pts) - 1)
    for p, c in zip(sp.points, pts):
        p.co = (c[0], c[1], c[2], 1)
    sp.use_smooth = True
    ob = link(bpy.data.objects.new(name, cu))
    if material:
        cu.materials.append(material)
    return place(ob, **kw)


def fillet_poly(pts, r, n=6):
    """Round every corner of a closed 2D polygon with radius r (clamped to the edges)."""
    out = []
    N = len(pts)
    for i in range(N):
        p0, p1, p2 = Vector(pts[i - 1]), Vector(pts[i]), Vector(pts[(i + 1) % N])
        d1, d2 = p0 - p1, p2 - p1
        l1, l2 = d1.length, d2.length
        if l1 < 1e-9 or l2 < 1e-9:
            continue
        d1.normalize(); d2.normalize()
        ang = math.acos(max(-1.0, min(1.0, d1.dot(d2))))
        if ang < 1e-3 or abs(ang - math.pi) < 1e-3 or r <= 0:
            out.append(p1)
            continue
        t = min(r / math.tan(ang / 2), l1 * 0.48, l2 * 0.48)
        rr = t * math.tan(ang / 2)
        a, b = p1 + d1 * t, p1 + d2 * t
        c = p1 + (d1 + d2).normalized() * (rr / math.sin(ang / 2))
        aa = math.atan2((a - c).y, (a - c).x)
        ab = math.atan2((b - c).y, (b - c).x)
        diff = (ab - aa + math.pi) % (2 * math.pi) - math.pi
        for k in range(n + 1):
            th = aa + diff * k / n
            out.append(c + Vector((math.cos(th), math.sin(th))) * rr)
    return [(p.x, p.y) for p in out]


def shape2d(name, polys, depth, bevel, material=None, fillet=0.0, front=True, **kw):
    """Extruded, edge-rounded 2D shape. polys = outer polygon [+ hole polygons].
    front=True stands the shape up in the XZ plane, facing the -Y (front) camera."""
    if polys and isinstance(polys[0][0], (int, float)):
        polys = [polys]
    cu = bpy.data.curves.new(name, 'CURVE')
    cu.dimensions = '2D'
    cu.fill_mode = 'BOTH'
    cu.extrude = max(depth / 2 - bevel, 0.0)
    cu.bevel_depth = bevel
    cu.bevel_resolution = 5
    cu.offset = -bevel if bevel else 0.0
    for poly in polys:
        if fillet:
            poly = fillet_poly(poly, fillet)
        sp = cu.splines.new('POLY')
        sp.points.add(len(poly) - 1)
        for p, (x, y) in zip(sp.points, poly):
            p.co = (x, y, 0, 1)
        sp.use_cyclic_u = True
        sp.use_smooth = True
    ob = link(bpy.data.objects.new(name, cu))
    if material:
        cu.materials.append(material)
    if front and 'rot' not in kw:
        kw['rot'] = (90, 0, 0)
    return place(ob, **kw)


def stroke(center, width, head_len=0.0, head_w=0.0):
    """Polygon of a thick polyline; optional arrow head at the last point (which is the tip)."""
    P = [Vector(p) for p in center]
    if head_len > 0:
        # walk back from the tip by head_len to find the head base
        tip = P[-1]
        rem = head_len
        k = len(P) - 1
        while k > 0 and (P[k] - P[k - 1]).length < rem:
            rem -= (P[k] - P[k - 1]).length
            k -= 1
        base = P[k] + (P[k - 1] - P[k]).normalized() * rem
        body = P[:k] + [base]
        hdir = (tip - base).normalized()
    else:
        body = P
    def nrm(i, pts):
        if i == 0:
            d = pts[1] - pts[0]
        elif i == len(pts) - 1:
            d = pts[-1] - pts[-2]
        else:
            d = (pts[i + 1] - pts[i]).normalized() + (pts[i] - pts[i - 1]).normalized()
        d = d.normalized()
        return Vector((-d.y, d.x))
    L, R = [], []
    for i, p in enumerate(body):
        n = nrm(i, body)
        L.append(p + n * width / 2)
        R.append(p - n * width / 2)
    poly = L[:]
    if head_len > 0:
        n = Vector((-hdir.y, hdir.x))
        poly += [base + n * head_w / 2, tip, base - n * head_w / 2]
    poly += R[::-1]
    return [(p.x, p.y) for p in poly]


def text3d(name, body, size, depth, bevel, material=None, **kw):
    cu = bpy.data.curves.new(name, 'FONT')
    cu.body = body
    cu.font = bpy.data.fonts.load(BOLD_FONT, check_existing=True)
    cu.size = size
    cu.extrude = depth / 2
    cu.bevel_depth = bevel
    cu.bevel_resolution = 3
    cu.align_x = 'CENTER'
    cu.align_y = 'CENTER'
    ob = link(bpy.data.objects.new(name, cu))
    if material:
        cu.materials.append(material)
    if 'rot' not in kw:
        kw['rot'] = (90, 0, 0)
    return place(ob, **kw)


def centroid(ob):
    pts = world_points([ob])
    return sum(pts, Vector()) / len(pts)

# ----------------------------------------------------------------------------- food icons

FOOD_VIEW = dict(az=-30.0, el=30.0, lens=60.0)


def food_shot(**view):
    v = dict(FOOD_VIEW)
    v.update(view)
    bpy.context.scene.view_settings.exposure = LIGHT['exp_food']
    cam = make_camera(**v)
    light_rig(cam)
    world()
    return cam


def view_dir_xy(az):
    a = math.radians(az)
    return Vector((math.sin(a), -math.cos(a), 0))


def pull_part(parts, az, dist, lift=0.0):
    """Move the part that faces the camera outward (pizza slice, cake slice)."""
    c0 = sum((centroid(p) for p in parts), Vector()) / len(parts)
    vd = view_dir_xy(az)
    best = max(parts, key=lambda p: (centroid(p) - c0).normalized().dot(vd))
    d = centroid(best) - c0
    d.z = 0
    d.normalize()
    best.location += d * dist + Vector((0, 0, lift))
    bpy.context.view_layer.update()
    return best


def tint(mat, color, gain=1.0):
    """Copy of a textured material whose colour = luminance(texture) * gain * colour (keeps the detail)."""
    m = mat.copy()
    nt = m.node_tree
    b = bsdf_of(m)
    tex = next(n for n in nt.nodes if n.type == 'TEX_IMAGE')
    bw = nt.nodes.new('ShaderNodeRGBToBW')
    g = nt.nodes.new('ShaderNodeMath'); g.operation = 'MULTIPLY'; g.inputs[1].default_value = gain
    vm = nt.nodes.new('ShaderNodeVectorMath'); vm.operation = 'MULTIPLY'
    vm.inputs[1].default_value = srgb2lin(hex2rgb(color) if isinstance(color, str) else color)
    nt.links.new(tex.outputs['Color'], bw.inputs[0])
    nt.links.new(bw.outputs[0], g.inputs[0])
    nt.links.new(g.outputs[0], vm.inputs[0])
    nt.links.new(vm.outputs[0], b.inputs['Base Color'])
    return m


@icon('food-burger', 'food', 256, 768)
def _():
    food('burger')
    food_shot(el=20)


@icon('food-pizza', 'food', 256, 768)
def _():
    root, objs = food('pizza')
    s = pull_part([o for o in objs if o.type == 'MESH'], -30, 0.07, 0.02)
    food_shot(el=36)


@icon('food-sushi', 'food', 256, 768)
def _():
    food('sushi-salmon', loc=(0.02, -0.03, 0), rot=(0, 0, 25))
    food('maki-salmon', loc=(-0.13, 0.06, 0))
    food('maki-salmon', loc=(0.12, 0.10, 0), rot=(0, 0, 30))
    food_shot(el=32)


@icon('food-coffee', 'food', 256, 768)
def _():
    sroot, sparts = food('cup-saucer')
    top = max(p.z for p in world_points([o for o in sparts if o.type == 'MESH']))
    food('cup-tea', loc=(0, 0, top * 0.5), rot=(0, 0, -90))      # handle (+Y in the kit) -> right
    food_shot(el=30, az=-22)


@icon('food-donut', 'food', 256, 768)
def _():
    food('donut-sprinkles')
    food_shot(el=42)


@icon('food-taco', 'food', 256, 768)
def _():
    food('taco', rot=(22, 0, -18))
    food_shot(el=34)


@icon('food-noodle', 'food', 256, 768)
def _():
    food('chinese', rot=(0, 0, 10))
    food_shot(el=24)


@icon('food-fish', 'food', 256, 768)
def _():
    food('fries', loc=(0.1, 0.1, 0), scale=1.05)
    froot, fparts = food('fish', loc=(-0.04, -0.13, 0.03), scale=0.72)
    rot_seq(froot, ('Y', 90), ('Z', 90), ('X', 34), ('Z', -6))
    gold = None
    for o in fparts:
        for s in getattr(o, 'material_slots', []):
            if s.material:
                gold = gold or tint(s.material, '#e58a2c', 2.3)
                s.material = gold
    food_shot(el=28, az=-26)


@icon('food-icecream', 'food', 256, 768)
def _():
    food('ice-cream', rot=(0, 0, 0))
    food_shot(el=20)


@icon('food-soda', 'food', 256, 768)
def _():
    food('soda')
    food_shot(el=20)


@icon('food-cake', 'food', 256, 768)
def _():
    root, objs = food('cake')
    pull_part([o for o in objs if o.type == 'MESH'], -30, 0.09)
    food_shot(el=30)


@icon('food-salad', 'food', 256, 768)
def _():
    root, parts = food('salad')
    top = max(p.z for p in world_points([o for o in parts if o.type == 'MESH']))
    for (x, y, rz, it) in ((-0.08, -0.06, 10, 'tomato-slice'), (0.09, 0.0, 40, 'tomato-slice'),
                           (-0.02, 0.1, 70, 'tomato-slice'), (0.04, -0.13, 0, 'egg-half')):
        food(it, loc=(x, y, top * 0.72), rot=(0, 0, rz), scale=1.25)
    food_shot(el=40)


@icon('food-hotdog', 'food', 256, 768)
def _():
    food('hot-dog', rot=(0, 0, -8))
    food_shot(el=32)


@icon('food-doner', 'food', 256, 768)
def _():
    """Döner kebab cone on a vertical spit (no Kenney item) - modelled here.
    Inverted cone, irregular shaved surface, caramel with dark crispy streaks, a lighter freshly
    cut band facing the camera, steel spit + plates and the customary tomato on top."""
    from mathutils import noise
    H = 0.9
    prof = []
    n = 90
    for i in range(n + 1):
        t = i / n
        z = 0.05 + t * (H - 0.05)
        r = 0.19 + 0.23 * t ** 1.15                      # clearly wider at the top
        if t > 0.86:                                     # rounded shoulder into the top plate
            u = (t - 0.86) / 0.14
            r = 0.06 + (r - 0.06) * math.sqrt(max(0.0, 1 - u * u))
        if t < 0.04:
            r *= 0.9 + 0.1 * (t / 0.04)
        prof.append((r, z))
    prof = [(0.0, 0.05)] + prof + [(0.0, H)]
    meat_mat = bpy.data.materials.new('doner')
    try:
        meat_mat.use_nodes = True
    except Exception:
        pass
    nt = meat_mat.node_tree
    b = bsdf_of(meat_mat)
    at = nt.nodes.new('ShaderNodeAttribute')
    at.attribute_name = 'Col'
    nt.links.new(at.outputs['Color'], b.inputs['Base Color'])
    setin(b, 'Roughness', 0.45)
    setin(b, 'Coat Weight', 0.3)
    setin(b, 'Coat Roughness', 0.25)
    cone = lathe('doner-meat', prof, meat_mat, segs=96, sharp=0)
    me = cone.data
    vd = view_dir_xy(-50)
    ca = me.color_attributes.new('Col', 'FLOAT_COLOR', 'POINT')
    dark = Vector(srgb2lin(hex2rgb('#561f07')))
    mid = Vector(srgb2lin(hex2rgb('#a8521e')))
    light = Vector(srgb2lin(hex2rgb('#e3944f')))
    shaved = Vector(srgb2lin(hex2rgb('#f2b97c')))
    for v in me.vertices:
        co = v.co.copy()
        rxy = math.hypot(co.x, co.y)
        t = (co.z - 0.05) / (H - 0.05)
        if rxy < 1e-5:
            ca.data[v.index].color = (*dark.lerp(mid, 0.5), 1)
            continue
        ang = math.atan2(co.y, co.x)
        u = Vector((math.cos(ang), math.sin(ang), 0))
        front = u.dot(vd)
        # relief: irregular stacked meat layers + lumps; the cut band facing the viewer is flatter
        # with vertical knife marks
        wob = noise.noise(Vector((u.x * 1.6, u.y * 1.6, co.z * 2.0)))
        ridge = math.sin(2 * math.pi * (co.z * 7.0 + 0.6 * wob))
        chunk = noise.noise(Vector((u.x * 7.0, u.y * 7.0, co.z * 9.0)))
        streak = noise.noise(Vector((u.x * 11.0, u.y * 11.0, co.z * 0.8)))
        cut = max(0.0, min(1.0, (front - 0.35) / 0.3)) if 0.06 < t < 0.86 else 0.0
        disp = (0.016 * ridge + 0.014 * chunk) * (1 - 0.7 * cut) + 0.008 * streak * cut - 0.01 * cut
        if t < 0.9:
            v.co.x += u.x * disp
            v.co.y += u.y * disp
        f = 0.5 + 0.38 * ridge + 0.6 * chunk
        f = max(0.0, min(1.0, f))
        c = dark.lerp(mid, min(1.0, f / 0.5)) if f < 0.5 else mid.lerp(light, (f - 0.5) / 0.5)
        fc = max(0.0, min(1.0, 0.55 + 1.2 * streak))
        c = c.lerp(mid.lerp(shaved, fc), cut * 0.9)
        if t > 0.9:
            c = c.lerp(dark, 0.35)
        ca.data[v.index].color = (*c, 1)
    me.update()
    steel = mat('steel', '#cfd7e0', rough=0.22, metal=1.0, coat=0.0)
    dsteel = mat('steel-dark', '#5d6672', rough=0.3, metal=0.9, coat=0.0)
    disc('spit', 0.022, H + 0.22, 0.01, steel, segs=24, z0=-0.1)
    disc('top-plate', 0.13, 0.03, 0.012, steel, z0=H - 0.012)
    tomato = mat('tomato', '#e8352a', rough=0.25, coat=0.6)
    leaf = mat('stem', '#3d9a3a', rough=0.4)
    sphere('tomato', 0.095, tomato, loc=(0, 0, H + 0.09), scale=(1, 1, 0.85))
    shape2d('stem', [(math.cos(a) * (0.05 if k % 2 == 0 else 0.018), math.sin(a) * (0.05 if k % 2 == 0 else 0.018))
                     for k, a in enumerate([i * math.pi / 5 for i in range(10)])],
            0.015, 0.006, leaf, front=False, loc=(0, 0, H + 0.168))
    disc('tray', 0.33, 0.04, 0.018, steel, z0=0.0)
    disc('tray-rim', 0.36, 0.028, 0.014, dsteel, z0=-0.022)
    disc('spit-foot', 0.06, 0.05, 0.02, dsteel, segs=32, z0=-0.12)
    food_shot(el=20, az=-26)


# ----------------------------------------------------------------------------- character portraits

CHARS = [f'{s}-{l}' for s in ('male', 'female') for l in 'abcdef']
CHAR_POSE = ('emote-yes', 4)          # mid-nod: head tipped slightly up = friendly look at the viewer
CHAR_CAM = dict(target=(0.0, 0.0, 0.535), size=0.68, az=-18.0, el=5.0, lens=85.0)


def fixed_camera(target, size, az, el, lens):
    sc = bpy.context.scene
    cd = bpy.data.cameras.new('cam')
    cd.lens = lens
    cd.sensor_width = 36
    cd.sensor_fit = 'AUTO'
    cd.clip_start = 0.01
    cam = link(bpy.data.objects.new('cam', cd))
    sc.camera = cam
    a, e = math.radians(az), math.radians(el)
    d = Vector((math.sin(a) * math.cos(e), -math.cos(a) * math.cos(e), math.sin(e)))
    dist = size * lens / 36.0
    cam.location = Vector(target) + d * dist
    cam.rotation_mode = 'QUATERNION'
    cam.rotation_quaternion = (-d).to_track_quat('-Z', 'Y')
    bpy.context.view_layer.update()
    return cam


def char_portrait(cn):
    objs = import_glb(os.path.join(CHAR_DIR, f'character-{cn}.glb'))
    arm = next(o for o in objs if o.type == 'ARMATURE')
    for o in list(objs):
        if o.type == 'MESH' and o.parent != arm:          # stray helper sphere in the GLBs
            bpy.data.objects.remove(o, do_unlink=True)
    ad = arm.animation_data or arm.animation_data_create()
    for t in list(ad.nla_tracks):
        ad.nla_tracks.remove(t)
    act = bpy.data.actions[CHAR_POSE[0]]
    ad.action = act
    if hasattr(ad, 'action_slot') and len(act.slots):
        ad.action_slot = act.slots[0]
    bpy.context.scene.frame_set(CHAR_POSE[1])
    for o in bpy.context.scene.objects:
        if o.type == 'MESH':
            for s in o.material_slots:
                if s.material and not s.material.get('_gloss'):
                    glossify(s.material, rough=0.55, coat=0.12)
                    s.material['_gloss'] = 1
    cam = fixed_camera(**CHAR_CAM)
    bpy.context.scene.view_settings.exposure = LIGHT['exp_char']
    light_rig(cam)
    world()
    return dict(framing='fixed')


for _cn in CHARS:
    icon('char-' + _cn, 'char', 256, 512)(lambda cn=_cn: char_portrait(cn))

# ----------------------------------------------------------------------------- UI icons (modelled here)

UI_VIEW = dict(az=-20.0, el=14.0, lens=70.0)
UI_RES = 512

# shared palette (sRGB)
P = dict(
    gold='#ffc62e', gold_d='#f08c12', gold_l='#ffe27a',
    green='#5cc848', green_d='#2e8c3a', green_l='#9be67f',
    blue='#2f8cff', blue_d='#1c56c8', blue_l='#8fd3ff',
    red='#ef4136', red_d='#b8231c', orange='#ff8a1f', orange_d='#d9600c',
    steel='#c9d2dc', steel_d='#7f8a98', dark='#353d4a', ink='#2a2f3a',
    white='#f7f7f2', cream='#f3dcb8', kraft='#d6924c', kraft_d='#b06f32', tape='#f2d39b',
    grey='#aab2bf', pink='#ff5a7a', teal='#21c4b4', purple='#8a5cf5', yellow='#ffd23f',
)
_MATS = {}


def M(key, **kw):
    """Cached palette material."""
    k = (key, tuple(sorted(kw.items())))
    m = _MATS.get(k)
    try:
        ok = m is not None and bpy.data.materials.get(m.name) == m
    except ReferenceError:
        ok = False
    if not ok:
        m = _MATS[k] = mat(key, P.get(key, key), **kw)
    return m


def ui_shot(**view):
    v = dict(UI_VIEW)
    v.update(view)
    bpy.context.scene.view_settings.exposure = LIGHT['exp_ui']
    cam = make_camera(**v)
    light_rig(cam)
    world()
    return cam


def group(objs, loc=(0, 0, 0), rot=(0, 0, 0), scale=None):
    e = link(bpy.data.objects.new('grp', None))
    for o in objs:
        o.parent = e
    return place(e, loc=loc, rot=rot, scale=scale)


def star_poly(R, r, n=5, rot=90.0):
    pts = []
    for i in range(2 * n):
        a = math.radians(rot + i * 180.0 / n)
        rr = R if i % 2 == 0 else r
        pts.append((rr * math.cos(a), rr * math.sin(a)))
    return pts


def circle_poly(r, n=48, cx=0.0, cy=0.0, a0=0.0, a1=360.0, closed=True):
    m = n if closed else n + 1
    return [(cx + r * math.cos(math.radians(a0 + (a1 - a0) * i / n)),
             cy + r * math.sin(math.radians(a0 + (a1 - a0) * i / n))) for i in range(m)]


def annulus_sector(r0, r1, a0, a1, n=24):
    outer = circle_poly(r1, n, a0=a0, a1=a1, closed=False)
    inner = circle_poly(r0, n, a0=a1, a1=a0, closed=False)
    return outer + inner


def drop_prof(r=0.16, h=0.42):
    """Raindrop / teardrop profile (point at the top)."""
    p = [(0.0, 0.0)]
    p += arc(0.0, r, r, -90, 30, 10)[1:]
    tip = (0.0, h)
    x0, z0 = p[-1]
    for k in range(1, 7):
        t = k / 6
        p.append((x0 * (1 - t) ** 1.3, z0 + (h - z0) * t))
    p[-1] = (0.0, h)
    return p


@icon('ui-cash', 'ui', 128, UI_RES)
def _():
    parts = []
    for i, (dx, dy, rz) in enumerate([(0.03, 0.02, -5), (-0.02, -0.01, 3), (0.0, 0.0, 0)]):
        z = i * 0.085
        parts.append(rbox(f'note{i}', (1.5, 0.78, 0.075), 0.03, M('green'), loc=(dx, dy, z), rot=(0, 0, rz)))
    top = 2 * 0.085 + 0.0375
    parts.append(rbox('inset', (1.28, 0.58, 0.012), 0.006, M('green_d'), loc=(0, 0, top + 0.003)))
    parts.append(rbox('inset2', (1.2, 0.5, 0.014), 0.006, M('green_l'), loc=(0, 0, top + 0.006)))
    parts.append(disc('seal', 0.17, 0.02, 0.008, M('green_d'), z0=top + 0.008))
    parts.append(text3d('dollar', '$', 0.26, 0.012, 0.002, M('green_l'), rot=(0, 0, 0), loc=(0, -0.005, top + 0.03)))
    parts.append(rbox('band', (0.3, 0.84, 0.3), 0.025, M('gold'), loc=(0, 0, 0.11)))
    group(parts, rot=(0, 0, 24))
    ui_shot(az=-24, el=38)


@icon('ui-coin', 'ui', 128, UI_RES)
def _():
    h = 0.17
    parts = [disc('rim', 0.5, h, 0.06, mat('coin-rim', '#f7a823', rough=0.32, coat=0.5))]
    parts.append(disc('face', 0.4, h + 0.02, 0.03, mat('coin-face', '#ffd640', rough=0.32, coat=0.5), z0=-0.01))
    parts.append(shape2d('star', star_poly(0.21, 0.1), 0.06, 0.018, M('gold_d'), fillet=0.02,
                         front=False, loc=(0, 0, h + 0.005)))
    group(parts, rot=(90, 0, 0))
    ui_shot(az=-28, el=10)


@icon('ui-gem', 'ui', 128, UI_RES)
def _():
    prof = [(0.0, -0.46), (0.5, 0.06), (0.5, 0.12), (0.33, 0.3), (0.0, 0.3)]
    g = mat('gem', P['blue'], rough=0.12, coat=1.0, coat_rough=0.05, emit=P['blue_d'], emit_strength=0.35)
    gem = lathe('gem', prof, g, segs=8, sharp=1.0)
    t = lathe('table', [(0.0, 0.299), (0.25, 0.299), (0.2, 0.312), (0.0, 0.312)],
              mat('gem-top', P['blue_l'], rough=0.1, coat=1.0, emit=P['blue_l'], emit_strength=0.25), segs=8, sharp=1.0)
    group([gem, t], rot=(0, 0, 22.5 / 2))
    ui_shot(az=-14, el=22)


def _star(material):
    shape2d('star', star_poly(0.52, 0.26), 0.26, 0.085, material, fillet=0.05)
    ui_shot(az=-20, el=10)


@icon('ui-star', 'ui', 128, UI_RES)
def _():
    _star(M('gold'))


@icon('ui-star-empty', 'ui', 128, UI_RES)
def _():
    _star(mat('grey-star', '#a9b1be', rough=0.45, coat=0.25))


@icon('ui-clock', 'ui', 128, UI_RES)
def _():
    parts = [disc('case', 0.5, 0.2, 0.07, M('dark'))]
    parts.append(disc('face', 0.4, 0.21, 0.02, M('white'), z0=-0.005))
    parts.append(shape2d('elapsed', [(0, 0)] + circle_poly(0.36, 24, a0=90, a1=-10, closed=False), 0.02, 0.0,
                         M('red'), front=False, loc=(0, 0, 0.206)))
    for a in (90, 0, -90, 180):
        x, y = 0.3 * math.cos(math.radians(a)), 0.3 * math.sin(math.radians(a))
        parts.append(rbox(f'tick{a}', (0.05, 0.1, 0.02), 0.01, M('ink'), loc=(x, y, 0.215), rot=(0, 0, a + 90)))
    parts.append(shape2d('hand', stroke([(0, 0), (0.22, 0.17)], 0.06), 0.03, 0.008, M('ink'), fillet=0.02,
                         front=False, loc=(0, 0, 0.22)))
    parts.append(disc('hub', 0.055, 0.05, 0.015, M('ink'), z0=0.21))
    parts.append(rbox('stem', (0.1, 0.09, 0.12), 0.02, M('dark'), loc=(0, 0.53, 0.1)))
    parts.append(rbox('crown', (0.24, 0.1, 0.12), 0.035, M('red'), loc=(0, 0.62, 0.1)))
    parts.append(rbox('side', (0.1, 0.08, 0.1), 0.025, M('dark'), loc=(0.39, 0.39, 0.1), rot=(0, 0, -45)))
    group(parts, rot=(90, 0, 0))
    ui_shot(az=-22, el=12)


@icon('ui-bolt', 'ui', 128, UI_RES)
def _():
    parts = [disc('badge', 0.5, 0.16, 0.06, M('blue'))]
    parts.append(disc('inner', 0.41, 0.17, 0.03, mat('blue2', '#3d9bff', rough=0.3, coat=0.5), z0=-0.005))
    bolt = [(0.11, 0.52), (-0.27, -0.04), (-0.02, -0.04), (-0.13, -0.52), (0.28, 0.07), (0.03, 0.07)]
    parts.append(shape2d('bolt', bolt, 0.12, 0.035, mat('bolt', P['yellow'], rough=0.3, coat=0.6,
                                                            emit='#ffb000', emit_strength=0.15),
                         fillet=0.02, front=False, loc=(0, 0, 0.17)))
    group(parts, rot=(90, 0, 0))
    ui_shot(az=-20, el=10)


@icon('ui-package', 'ui', 128, UI_RES)
def _():
    W, D, H = 1.0, 0.86, 0.72
    rbox('box', (W, D, H), 0.035, M('kraft'), loc=(0, 0, H / 2))
    rbox('seam', (W - 0.04, 0.012, 0.01), 0.004, M('kraft_d'), loc=(0, 0, H + 0.002))
    rbox('tape-top', (W + 0.012, 0.24, 0.018), 0.008, M('tape'), loc=(0, 0, H + 0.004))
    rbox('tape-l', (0.018, 0.24, 0.3), 0.008, M('tape'), loc=(-W / 2 - 0.004, 0, H - 0.14))
    rbox('tape-r', (0.018, 0.24, 0.3), 0.008, M('tape'), loc=(W / 2 + 0.004, 0, H - 0.14))
    rbox('label', (0.3, 0.012, 0.18), 0.01, M('white'), loc=(0.24, -D / 2 - 0.002, 0.24))
    for k in range(3):
        rbox(f'line{k}', (0.2 - k * 0.04, 0.008, 0.02), 0.004, M('kraft_d'), loc=(0.22 - k * 0.02, -D / 2 - 0.009, 0.29 - k * 0.05))
    rbox('arrow-up', (0.04, 0.01, 0.14), 0.01, M('kraft_d'), loc=(-0.3, -D / 2 - 0.003, 0.24))
    shape2d('arrow-head', [(-0.07, 0), (0.07, 0), (0, 0.08)], 0.01, 0.0, M('kraft_d'),
            loc=(-0.3, -D / 2 - 0.003, 0.3))
    ui_shot(az=-32, el=24)


@icon('ui-fuel', 'ui', 128, UI_RES)
def _():
    W, D, H = 0.78, 0.34, 0.96
    rbox('body', (W, D, H), 0.09, M('red'), loc=(0, 0, H / 2))
    rbox('panel', (W - 0.16, 0.02, H - 0.24), 0.04, M('red_d'), loc=(0, -D / 2 - 0.004, H / 2 - 0.02))
    L = math.hypot(W - 0.3, H - 0.38)
    a = math.degrees(math.atan2(H - 0.38, W - 0.3))
    for s in (1, -1):
        rbox(f'x{s}', (L, 0.035, 0.08), 0.025, M('red'), loc=(0, -D / 2 - 0.012, H / 2 - 0.02), rot=(0, s * a, 0))
    tube('handle', [(-0.3, 0, H - 0.02), (-0.3, 0, H + 0.13), (0.04, 0, H + 0.13), (0.04, 0, H - 0.02)], 0.05,
         M('red_d'))
    sp = disc('spout', 0.085, 0.2, 0.03, M('dark'), segs=32)
    place(sp, loc=(0.25, 0, H - 0.07), rot=(0, 28, 0))
    cap = disc('cap', 0.1, 0.07, 0.025, M('yellow'), segs=32)
    place(cap, loc=(0.25 + 0.2 * math.sin(math.radians(28)), 0, H - 0.07 + 0.2 * math.cos(math.radians(28))),
          rot=(0, 28, 0))
    ui_shot(az=-26, el=12)


@icon('ui-thermo', 'ui', 128, UI_RES)
def _():
    parts = []
    parts.append(lathe('tube', disc_prof(0.16, 0.9, 0.16, z0=0.1), M('white'), segs=40))
    parts.append(sphere('bulb', 0.27, M('red'), loc=(0, 0, 0.04)))
    parts.append(lathe('column', disc_prof(0.085, 0.6, 0.085, z0=0.05), M('red'), segs=32, loc=(0, -0.09, 0)))
    for k in range(5):
        parts.append(rbox(f'tick{k}', (0.07 if k % 2 == 0 else 0.045, 0.03, 0.03), 0.01, M('ink'),
                          loc=(0.115, -0.105, 0.36 + k * 0.12)))
    parts.append(disc('cap', 0.16, 0.08, 0.035, M('steel_d'), z0=0.96))
    group(parts, rot=(0, -12, 0))
    ui_shot(az=-12, el=8)


@icon('ui-wrench', 'ui', 128, UI_RES)
def _():
    R, cy, w, jaw_bot = 0.3, 0.42, 0.105, 0.38
    hw = 0.095
    a_side = math.degrees(math.asin(hw / R))
    a_jaw = math.degrees(math.acos(w / R))
    poly = [(hw, -0.62)]
    poly += circle_poly(R, 20, cx=0, cy=cy, a0=-90 + a_side, a1=a_jaw, closed=False)
    poly += [(w, jaw_bot), (-w, jaw_bot)]
    poly += circle_poly(R, 20, cx=0, cy=cy, a0=180 - a_jaw, a1=270 - a_side, closed=False)
    poly += [(-hw, -0.62)]
    poly += circle_poly(hw, 8, cx=0, cy=-0.62, a0=180, a1=360, closed=False)[1:-1]
    wr = shape2d('wrench', [poly, circle_poly(0.04, 16, cy=-0.6)], 0.12, 0.035,
                 mat('wrench', '#cfd8e2', rough=0.25, coat=0.6, metal=0.35), fillet=0.02)
    grip = shape2d('grip', fillet_poly([(-0.125, -0.5), (0.125, -0.5), (0.125, 0.05), (-0.125, 0.05)], 0.06),
                   0.17, 0.05, M('orange'))
    group([wr, grip], rot=(0, -42, 0))
    ui_shot(az=-18, el=10)


@icon('ui-trophy', 'ui', 128, UI_RES)
def _():
    g = M('gold')
    prof = [(0.0, 0.2), (0.12, 0.2), (0.1, 0.26), (0.065, 0.32), (0.06, 0.4), (0.1, 0.46), (0.2, 0.5),
            (0.31, 0.6), (0.38, 0.75), (0.42, 0.9), (0.45, 1.0), (0.46, 1.02), (0.42, 1.03), (0.4, 1.0),
            (0.36, 0.86), (0.0, 0.83)]
    lathe('cup', prof, g, segs=64, sharp=60)
    disc('foot', 0.26, 0.06, 0.02, M('gold_d'), z0=0.17)
    rbox('base', (0.62, 0.46, 0.2), 0.04, mat('base', '#6b4430', rough=0.4, coat=0.3), loc=(0, 0, 0.1))
    rbox('plate', (0.34, 0.02, 0.09), 0.01, M('gold_l'), loc=(0, -0.235, 0.1))
    for s in (1, -1):
        pts = [(s * 0.38, 0, 0.92)] + [(s * (0.47 + 0.15 * math.cos(math.radians(a))), 0,
                                         0.76 + 0.15 * math.sin(math.radians(a))) for a in range(80, -100, -20)] + \
              [(s * 0.3, 0, 0.6)]
        tube(f'handle{s}', pts, 0.045, g)
    shape2d('emblem', star_poly(0.15, 0.075), 0.04, 0.012, M('gold_l'), fillet=0.012, loc=(0, -0.37, 0.76),
            rot=(90 - 18, 0, 0))
    ui_shot(az=-16, el=12)


@icon('ui-pin', 'ui', 128, UI_RES)
def _():
    Rr, cz = 0.36, 0.78
    phi = math.degrees(math.acos(Rr / cz))
    prof = [(0.0, 0.0), (0.012, 0.012)]
    prof += arc(0.0, cz, Rr, -90 + phi, 90, 24)
    prof[-1] = (0.0, cz + Rr)
    lathe('pin', prof, M('orange'), segs=64, sharp=0)
    sphere('dot', 0.16, M('white'), loc=(0, -0.29, cz + 0.02), scale=(1, 0.45, 1))
    ui_shot(az=-18, el=12)


@icon('ui-lock', 'ui', 128, UI_RES)
def _():
    tube('shackle', [(-0.24, 0, 0.2)] + [(0.24 * math.cos(math.radians(a)), 0, 0.5 + 0.24 * math.sin(math.radians(a)))
                                        for a in range(180, -1, -15)] + [(0.24, 0, 0.2)], 0.075,
         mat('shackle', '#cfd8e2', rough=0.22, coat=0.6, metal=0.4))
    rbox('body', (0.84, 0.36, 0.66), 0.11, M('gold'), loc=(0, 0, 0.0))
    shape2d('keyhole-c', circle_poly(0.085, 24, cy=0.04), 0.03, 0.008, M('ink'), loc=(0, -0.18, 0))
    shape2d('keyhole-s', [(-0.045, 0.02), (0.045, 0.02), (0.065, -0.17), (-0.065, -0.17)], 0.03, 0.008, M('ink'),
            fillet=0.015, loc=(0, -0.18, 0))
    ui_shot(az=-20, el=12)


@icon('ui-gift', 'ui', 128, UI_RES)
def _():
    S, Hb = 0.82, 0.56
    rbox('box', (S, S, Hb), 0.03, M('red'), loc=(0, 0, Hb / 2))
    rbox('lid', (S + 0.08, S + 0.08, 0.16), 0.03, M('red'), loc=(0, 0, Hb + 0.05))
    rib = M('yellow')
    rbox('rib-a', (0.17, S + 0.012, Hb), 0.01, rib, loc=(0, 0, Hb / 2 - 0.01))
    rbox('rib-b', (S + 0.012, 0.17, Hb), 0.01, rib, loc=(0, 0, Hb / 2 - 0.01))
    rbox('rib-c', (0.18, S + 0.09, 0.168), 0.01, rib, loc=(0, 0, Hb + 0.05))
    rbox('rib-d', (S + 0.09, 0.18, 0.168), 0.01, rib, loc=(0, 0, Hb + 0.05))
    top = Hb + 0.13
    for s in (1, -1):
        loop = [(0.16 * math.cos(math.radians(a)), 0, 0.11 * math.sin(math.radians(a))) for a in range(0, 361, 20)]
        t = tube(f'bow{s}', loop, 0.055, rib)
        t.rotation_euler = (0, math.radians(-s * 24), math.radians(s * 14))
        t.location = (s * 0.17, 0, top + 0.12)
    sphere('knot', 0.09, rib, loc=(0, 0, top + 0.07))
    ui_shot(az=-28, el=22)


@icon('ui-xp', 'ui', 128, UI_RES)
def _():
    hexp = [(0.52 * math.cos(math.radians(90 + 60 * i)), 0.52 * math.sin(math.radians(90 + 60 * i))) for i in range(6)]
    shape2d('hex', hexp, 0.2, 0.06, M('blue_d'), fillet=0.07)
    hexi = [(0.41 * math.cos(math.radians(90 + 60 * i)), 0.41 * math.sin(math.radians(90 + 60 * i))) for i in range(6)]
    shape2d('hex-in', hexi, 0.22, 0.04, M('blue'), fillet=0.05, loc=(0, -0.005, 0))
    text3d('xp', 'XP', 0.4, 0.1, 0.012, mat('xp-text', '#ffffff', rough=0.3, coat=0.5, emit='#ffffff', emit_strength=0.35),
           loc=(0, -0.13, -0.01))
    ui_shot(az=-16, el=8)


@icon('ui-heart', 'ui', 128, UI_RES)
def _():
    r, C, T = 0.27, Vector((0.235, 0.13)), Vector((0.0, -0.5))
    d = (C - T).length
    tdir = math.atan2(C.y - T.y, C.x - T.x) - math.asin(r / d)
    Pt = T + Vector((math.cos(tdir), math.sin(tdir))) * math.sqrt(d * d - r * r)
    K = Vector((0.0, C.y + math.sqrt(r * r - C.x * C.x)))
    a0 = math.degrees(math.atan2(Pt.y - C.y, Pt.x - C.x))
    a1 = math.degrees(math.atan2(K.y - C.y, K.x - C.x))
    if a1 < a0:
        a1 += 360
    right = circle_poly(r, 28, cx=C.x, cy=C.y, a0=a0, a1=a1, closed=False)
    left = [(-x, y) for x, y in reversed(right)][1:]
    poly = [(T.x, T.y)] + right + left
    shape2d('heart', poly, 0.3, 0.1, mat('heart', '#ff3d5f', rough=0.3, coat=0.6), fillet=0.06)
    ui_shot(az=-18, el=10)


@icon('ui-speed', 'ui', 128, UI_RES)
def _():
    parts = []
    body = circle_poly(0.52, 40, a0=-40, a1=220, closed=False)
    parts.append(shape2d('bezel', body, 0.18, 0.06, M('dark'), fillet=0.08, front=False))
    face = circle_poly(0.43, 40, a0=-36, a1=216, closed=False)
    parts.append(shape2d('face', face, 0.2, 0.02, M('white'), fillet=0.05, front=False, loc=(0, 0, 0.005)))
    for (a0, a1, c) in ((215, 135, '#3ddc6b'), (135, 60, P['yellow']), (60, -35, P['red'])):
        parts.append(shape2d(f'seg{c}', annulus_sector(0.28, 0.39, a1, a0, 16), 0.03, 0.0,
                             mat('seg' + c, c, rough=0.35, coat=0.4), front=False, loc=(0, 0, 0.11)))
    parts.append(shape2d('needle', [(-0.035, 0.0), (0.035, 0.0), (0.006, 0.36), (-0.006, 0.36)], 0.04, 0.01,
                         M('ink'), front=False, loc=(0, 0, 0.12), rot=(0, 0, -52)))
    parts.append(disc('hub', 0.075, 0.08, 0.02, M('ink'), z0=0.08))
    group(parts, rot=(90, 0, 0))
    ui_shot(az=-18, el=10)


@icon('ui-route', 'ui', 128, UI_RES)
def _():
    xs = [-0.54, -0.18, 0.18, 0.54]
    ys = [0.0, -0.11, 0.0, -0.11]
    Hh = 0.46
    bm = bmesh.new()
    vb = [bm.verts.new((x, y, -Hh)) for x, y in zip(xs, ys)]
    vt = [bm.verts.new((x, y, Hh)) for x, y in zip(xs, ys)]
    for i in range(3):
        f = bm.faces.new((vb[i], vb[i + 1], vt[i + 1], vt[i]))
        f.material_index = i % 2
    mp = finish('map', bm, mats=[mat('map-a', '#dff2c4', rough=0.6, coat=0.1), mat('map-b', '#c6e7f7', rough=0.6, coat=0.1)],
                sharp=10)
    sol = mp.modifiers.new('thick', 'SOLIDIFY')
    sol.thickness = 0.03
    sol.offset = 1.0
    def ysurf(x):
        for i in range(3):
            if xs[i] <= x <= xs[i + 1]:
                t = (x - xs[i]) / (xs[i + 1] - xs[i])
                return ys[i] * (1 - t) + ys[i + 1] * t
        return ys[-1]
    # green park + blue river patches on the panels
    shape2d('park', fillet_poly([(-0.12, -0.13), (0.1, -0.14), (0.12, 0.12), (-0.1, 0.14)], 0.05), 0.01, 0.0,
            mat('park', '#7fcf63', rough=0.6, coat=0.1), loc=(-0.36, ysurf(-0.36) - 0.033, 0.22), rot=(90, 0, -17))
    shape2d('lake', fillet_poly([(-0.1, -0.08), (0.11, -0.1), (0.1, 0.09), (-0.09, 0.1)], 0.06), 0.01, 0.0,
            mat('lake', '#5bb8ef', rough=0.3, coat=0.4), loc=(0.36, ysurf(0.36) - 0.033, -0.24), rot=(90, 0, 17))
    route = []
    for i in range(25):
        t = i / 24
        x = -0.44 + 0.86 * t
        z = -0.3 + 0.55 * t + 0.16 * math.sin(t * 2 * math.pi * 1.1)
        route.append((x, ysurf(x) - 0.045, z))
    tube('route', route, 0.032, mat('route', '#ff5a3c', rough=0.35, coat=0.4))
    disc('start', 0.06, 0.04, 0.015, M('white'), loc=(route[0][0], route[0][1] - 0.01, route[0][2]), rot=(90, 0, 0))
    Rr, cz = 0.11, 0.24
    phi = math.degrees(math.acos(Rr / cz))
    prof = [(0.0, 0.0)] + arc(0.0, cz, Rr, -90 + phi, 90, 16)
    prof[-1] = (0.0, cz + Rr)
    lathe('pin', prof, M('red'), segs=40, sharp=0, loc=(route[-1][0], route[-1][1] - 0.05, route[-1][2] - 0.02))
    sphere('pin-dot', 0.05, M('white'), loc=(route[-1][0], route[-1][1] - 0.15, route[-1][2] + 0.23), scale=(1, 0.5, 1))
    ui_shot(az=-10, el=12)


@icon('ui-building', 'ui', 128, UI_RES)
def _():
    wall = mat('wall', '#5b8fd6', rough=0.4, coat=0.3)
    glass = mat('glass', '#bfe9ff', rough=0.15, coat=0.8, emit='#bfe9ff', emit_strength=0.15)
    W, D, H = 0.56, 0.5, 1.2
    rbox('tower', (W, D, H), 0.03, wall, loc=(0, 0, H / 2))
    rbox('roof', (W + 0.04, D + 0.04, 0.06), 0.02, M('dark'), loc=(0, 0, H + 0.02))
    rbox('roof-box', (0.2, 0.18, 0.1), 0.02, M('steel_d'), loc=(0.08, 0.05, H + 0.09))
    for r in range(5):
        for c in range(3):
            rbox(f'wf{r}{c}', (0.12, 0.02, 0.13), 0.015, glass,
                 loc=(-0.17 + c * 0.17, -D / 2 - 0.004, 0.36 + r * 0.17))
        for c in range(2):
            rbox(f'ws{r}{c}', (0.02, 0.12, 0.13), 0.015, glass,
                 loc=(W / 2 + 0.004, -0.1 + c * 0.2, 0.36 + r * 0.17))
    rbox('door', (0.2, 0.03, 0.22), 0.02, M('dark'), loc=(0, -D / 2 - 0.006, 0.11))
    rbox('awning', (0.3, 0.1, 0.04), 0.015, M('orange'), loc=(0, -D / 2 - 0.04, 0.25))
    W2, H2 = 0.42, 0.62
    side = mat('wall2', '#f2a65a', rough=0.4, coat=0.3)
    rbox('annex', (W2, 0.44, H2), 0.03, side, loc=(W / 2 + W2 / 2 - 0.02, 0.12, H2 / 2))
    rbox('annex-roof', (W2 + 0.03, 0.47, 0.05), 0.02, M('red_d'), loc=(W / 2 + W2 / 2 - 0.02, 0.12, H2 + 0.015))
    for r in range(2):
        for c in range(2):
            rbox(f'wa{r}{c}', (0.11, 0.02, 0.12), 0.015, glass,
                 loc=(W / 2 + 0.08 + c * 0.16, 0.12 - 0.22 - 0.004, 0.2 + r * 0.22))
    ui_shot(az=-24, el=16)


@icon('ui-people', 'ui', 128, UI_RES)
def _():
    body = [(0.0, 0.0), (0.3, 0.0)] + arc(0.3, 0.06, 0.06, -90, 0, 4)[1:] + [(0.36, 0.2)] + \
           [(0.36 * math.cos(math.radians(a)), 0.2 + 0.24 * math.sin(math.radians(a))) for a in range(0, 91, 10)]
    body[-1] = (0.0, 0.44)
    for name, col, loc, sc in (('back', '#ff9f43', (0.26, 0.22, 0.1), 0.86), ('front', P['blue'], (-0.1, 0.0, 0.0), 1.0)):
        m = mat(name, col, rough=0.35, coat=0.45)
        b = lathe(name + '-body', body, m, segs=48, sharp=50)
        hd = sphere(name + '-head', 0.2, m, loc=(0, 0, 0.66))
        group([b, hd], loc=loc, scale=sc)
    ui_shot(az=-12, el=10)


@icon('ui-calendar', 'ui', 128, UI_RES)
def _():
    W, H = 0.92, 0.9
    rbox('page', (W, 0.16, H), 0.08, M('white'), loc=(0, 0, 0))
    rbox('header', (W + 0.004, 0.166, 0.27), 0.06, M('red'), loc=(0, 0, H / 2 - 0.12))
    for s in (-1, 1):
        rbox(f'ring{s}', (0.07, 0.07, 0.2), 0.03, M('steel_d'), loc=(s * 0.22, -0.02, H / 2 + 0.02))
        disc(f'hole{s}', 0.05, 0.02, 0.01, M('red_d'), loc=(s * 0.22, -0.09, H / 2 - 0.08), rot=(90, 0, 0))
    for r in range(2):
        for c in range(3):
            hi = (r == 1 and c == 2)
            rbox(f'day{r}{c}', (0.2, 0.03, 0.15), 0.035, M('orange') if hi else mat('day', '#c9d3df', rough=0.5, coat=0.2),
                 loc=(-0.25 + c * 0.25, -0.085, 0.05 - r * 0.21))
    ui_shot(az=-18, el=10)


@icon('ui-sun', 'ui', 128, UI_RES)
def _():
    rays = star_poly(0.56, 0.36, n=10, rot=90)
    shape2d('rays', rays, 0.1, 0.03, mat('rays', '#ff9f1c', rough=0.3, coat=0.5, emit='#ff7a00', emit_strength=0.15),
            fillet=0.03)
    sphere('core', 0.34, mat('core', '#ffd02e', rough=0.3, coat=0.6, emit='#ffb000', emit_strength=0.2),
           loc=(0, -0.04, 0), scale=(1, 0.5, 1))
    ui_shot(az=-16, el=8)


def crescent_poly(Rc=0.34, wmax=0.36, wmin=0.12, a0=70.0, a1=290.0, n=40):
    """Crescent as a tapered arc with round tips (robust under curve bevel offsets)."""
    outer, inner = [], []
    for i in range(n + 1):
        u = i / n
        a = math.radians(a0 + (a1 - a0) * u)
        w = wmin + (wmax - wmin) * math.sin(math.pi * u) ** 0.9
        d = Vector((math.cos(a), math.sin(a)))
        outer.append(d * (Rc + w / 2))
        inner.append(d * (Rc - w / 2))
    def cap(a_deg, start):
        c = Vector((math.cos(math.radians(a_deg)), math.sin(math.radians(a_deg)))) * Rc
        t = math.degrees(math.atan2(c.y, c.x))
        # semicircle from outer to inner side (end cap) or inner to outer (start cap)
        rng = (t, t + 180) if not start else (t + 180, t + 360)
        if a1 < a0:
            rng = rng[::-1]
        return [c + Vector((math.cos(math.radians(rng[0] + (rng[1] - rng[0]) * k / 8)),
                            math.sin(math.radians(rng[0] + (rng[1] - rng[0]) * k / 8)))) * wmin / 2
                for k in range(1, 8)]
    poly = outer + cap(a1, False) + inner[::-1] + cap(a0, True)
    return [(p.x, p.y) for p in poly]


@icon('ui-moon', 'ui', 128, UI_RES)
def _():
    moon = mat('moon', '#ffe27a', rough=0.35, coat=0.5, emit='#ffd34a', emit_strength=0.18)
    shape2d('moon', crescent_poly(), 0.28, 0.05, moon, rot=(90, -22, 0))
    shape2d('star', star_poly(0.13, 0.05, n=4, rot=90), 0.06, 0.015, moon, fillet=0.01, loc=(0.3, 0.0, 0.3))
    ui_shot(az=-16, el=8)


@icon('ui-rain', 'ui', 128, UI_RES)
def _():
    cloud = mat('cloud', '#eef3f9', rough=0.45, coat=0.3)
    for (x, z, r) in ((-0.3, 0.08, 0.22), (-0.04, 0.22, 0.3), (0.28, 0.12, 0.24), (0.1, 0.02, 0.22)):
        sphere(f'puff{x}', r, cloud, loc=(x, 0, z), scale=(1, 0.75, 1))
    rbox('base', (0.86, 0.36, 0.26), 0.13, cloud, loc=(0, 0, 0.0))
    drop = mat('drop', '#3a9cf5', rough=0.2, coat=0.8)
    for (x, z, rz) in ((-0.26, -0.5, 0), (0.03, -0.62, 0), (0.3, -0.48, 0)):
        lathe(f'drop{x}', drop_prof(0.085, 0.24), drop, segs=32, sharp=0, loc=(x, -0.05, z), rot=(0, -14, 0))
    ui_shot(az=-14, el=8)


@icon('ui-dog', 'ui', 128, UI_RES)
def _():
    fur = mat('fur', '#d39553', rough=0.5, coat=0.2)
    ear = mat('ear', '#7c4a2a', rough=0.5, coat=0.2)
    muz = mat('muzzle', '#f6e2c2', rough=0.5, coat=0.2)
    black = mat('nose', '#211a18', rough=0.15, coat=0.8)
    sphere('head', 0.4, fur, scale=(1.0, 0.9, 0.9))
    sphere('patch', 0.17, ear, loc=(0.17, -0.25, 0.12), scale=(1, 0.5, 0.9))
    sphere('muzzle', 0.22, muz, loc=(0, -0.27, -0.12), scale=(1.15, 0.8, 0.72))
    sphere('nose', 0.085, black, loc=(0, -0.45, -0.04), scale=(1.2, 0.8, 0.85))
    for s in (1, -1):
        sphere(f'eye{s}', 0.058, black, loc=(s * 0.15, -0.33, 0.1))
        sphere(f'glint{s}', 0.018, M('white'), loc=(s * 0.15 - 0.02, -0.385, 0.125))
        e = sphere(f'ear{s}', 0.2, ear, loc=(s * 0.37, 0.02, 0.02), scale=(0.5, 0.32, 1.05))
        e.rotation_euler = (0, math.radians(s * -24), 0)
    sphere('tongue', 0.08, mat('tongue', '#ff6f8e', rough=0.3, coat=0.5), loc=(0.03, -0.3, -0.3),
           scale=(0.9, 0.6, 1.1))
    ui_shot(az=-14, el=6)


@icon('ui-police', 'ui', 128, UI_RES)
def _():
    disc('base', 0.46, 0.17, 0.05, M('dark'))
    disc('base-ring', 0.4, 0.04, 0.015, M('steel'), z0=0.165)
    prof = [(0.0, 0.18), (0.34, 0.18), (0.35, 0.3), (0.32, 0.46)] + \
           [(0.32 * math.cos(math.radians(a)), 0.46 + 0.22 * math.sin(math.radians(a))) for a in range(0, 91, 10)]
    prof[-1] = (0.0, 0.68)
    red = mat('siren-r', '#ff3b30', rough=0.15, coat=0.9, emit='#ff2a1a', emit_strength=0.6)
    blue = mat('siren-b', '#2f8cff', rough=0.15, coat=0.9, emit='#1a6bff', emit_strength=0.6)
    dome = lathe('dome', prof, None, segs=64, sharp=60)
    dome.data.materials.append(red)
    dome.data.materials.append(blue)
    for p in dome.data.polygons:
        p.material_index = 0 if p.center.x < 0 else 1
    rbox('divider', (0.025, 0.7, 0.5), 0.01, M('steel_d'), loc=(0, 0, 0.42))
    disc('top', 0.06, 0.05, 0.02, M('steel'), z0=0.67)
    glow = mat('ray', '#ffe27a', rough=0.3, coat=0.4, emit='#ffd23f', emit_strength=0.4)
    for s in (1, -1):
        for k, a in enumerate((20, 45, 70)):
            ar = math.radians(a)
            x = s * (0.52 * math.cos(ar))
            z = 0.4 + 0.52 * math.sin(ar)
            rbox(f'ray{s}{k}', (0.16, 0.05, 0.05), 0.024, glow, loc=(x, 0, z), rot=(0, -s * a, 0))
    ui_shot(az=-12, el=10)


@icon('ui-horn', 'ui', 128, UI_RES)
def _():
    brass = M('gold')
    L, rm = 0.62, 0.46
    prof = [(0.0, 0.0), (0.09, 0.0)]
    for i in range(1, 21):
        t = i / 20
        prof.append((0.09 + (rm - 0.09) * t ** 2.0, L * t))
    prof += [(rm + 0.02, L + 0.02), (rm - 0.03, L + 0.04), (rm - 0.07, L - 0.01), (0.0, L - 0.08)]
    bell = lathe('bell', prof, brass, segs=48, sharp=70)
    inner = disc('mouth', rm - 0.08, 0.02, 0.005, mat('mouth', '#9a5a12', rough=0.4, coat=0.2), z0=L - 0.04)
    ring = disc('collar', 0.12, 0.09, 0.03, M('steel_d'), z0=-0.05)
    bulb = sphere('bulb', 0.3, mat('bulb', '#e8392e', rough=0.35, coat=0.5), loc=(0, 0, -0.3), scale=(1, 1, 1.12))
    g = group([bell, inner, ring, bulb], loc=(-0.2, 0, -0.15), rot=(0, 62, -26))
    bpy.context.view_layer.update()
    mouth = g.matrix_world @ Vector((0, 0, L))
    d = (g.matrix_world.to_3x3() @ Vector((0, 0, 1))).normalized()
    e = math.degrees(math.atan2(d.z, d.x))
    wave = mat('wave', P['yellow'], rough=0.3, coat=0.4)
    for k, r in enumerate((0.6, 0.78)):
        shape2d(f'wave{k}', stroke(circle_poly(r, 12, a0=e - 30, a1=e + 30, closed=False), 0.085), 0.06, 0.025,
                wave, fillet=0.02, loc=(mouth.x, mouth.y - 0.05, mouth.z))
    ui_shot(az=-10, el=12)


def arrow_icon(name, center, color, width=0.22, head_len=0.3, head_w=0.52, depth=0.16):
    return shape2d(name, stroke(center, width, head_len, head_w), depth, 0.05,
                   mat(name, color, rough=0.3, coat=0.6), fillet=0.025)


@icon('ui-jump', 'ui', 128, UI_RES)
def _():
    pts = circle_poly(0.78, 24, cx=0.42, cy=-0.5, a0=180, a1=82, closed=False)
    arrow_icon('jump', pts, '#3ddc6b', width=0.2, head_len=0.3, head_w=0.48)
    cone = [(0.0, 0.0), (0.2, 0.0), (0.2, 0.03), (0.13, 0.04), (0.035, 0.36), (0.0, 0.37)]
    c = lathe('cone', cone, M('orange'), segs=40, sharp=50, loc=(0.28, 0.1, -0.62))
    disc('cone-stripe', 0.092, 0.06, 0.006, M('white'), segs=40, loc=(0.28, 0.1, -0.62 + 0.17))
    ui_shot(az=-14, el=10)


@icon('ui-overtake', 'ui', 128, UI_RES)
def _():
    car = mat('car', '#ef4136', rough=0.3, coat=0.7)
    win = mat('wind', '#23365c', rough=0.1, coat=0.9)
    cx = 0.2
    rbox('car-body', (0.44, 0.78, 0.16), 0.09, car, loc=(cx, 0.0, 0.1))
    rbox('car-cabin', (0.36, 0.38, 0.14), 0.08, car, loc=(cx, -0.04, 0.22))
    rbox('windshield', (0.32, 0.1, 0.1), 0.035, win, loc=(cx, 0.15, 0.22), rot=(-35, 0, 0))
    rbox('rear-window', (0.3, 0.08, 0.08), 0.03, win, loc=(cx, -0.23, 0.22), rot=(35, 0, 0))
    for sx in (-1, 1):
        for sy in (-1, 1):
            rbox(f'wheel{sx}{sy}', (0.07, 0.16, 0.12), 0.035, M('ink'), loc=(cx + sx * 0.2, sy * 0.24, 0.07))
        rbox(f'lamp{sx}', (0.09, 0.03, 0.05), 0.015, mat('lamp', '#fff3b0', emit='#ffe680', emit_strength=0.6),
             loc=(cx + sx * 0.13, 0.39, 0.12))
    pts = [(0.16, -0.74), (0.02, -0.56), (-0.24, -0.32), (-0.31, 0.0), (-0.24, 0.3), (-0.04, 0.52), (0.16, 0.72)]
    sm = []
    for i in range(len(pts) - 1):
        for k in range(4):
            sm.append(Vector(pts[i]).lerp(Vector(pts[i + 1]), k / 4))
    sm.append(Vector(pts[-1]))
    a = arrow_icon('arrow', [(p.x, p.y) for p in sm], P['blue'], width=0.17, head_len=0.26, head_w=0.42, depth=0.1)
    a.rotation_euler = (0, 0, 0)
    a.location = (0, 0, 0.12)
    ui_shot(az=-10, el=64)


@icon('ui-traffic-light', 'ui', 128, UI_RES)
def _():
    rbox('housing', (0.44, 0.3, 1.12), 0.12, mat('housing', '#5a6576', rough=0.35, coat=0.5), loc=(0, 0, 0))
    for k, (c, e) in enumerate((('#ff3b30', 0.5), ('#ffcc00', 0.5), ('#34d36b', 0.9))):
        z = 0.34 - k * 0.34
        lm = mat(f'lamp{k}', c, rough=0.15, coat=0.9, emit=c, emit_strength=e)
        sphere(f'lamp{k}', 0.13, lm, loc=(0, -0.13, z), scale=(1, 0.55, 1))
        hood = circle_poly(0.17, 12, a0=0, a1=180, closed=False) + circle_poly(0.13, 12, a0=180, a1=0, closed=False)
        shape2d(f'hood{k}', hood, 0.12, 0.02, M('dark'), front=False, loc=(0, -0.2, z + 0.0), rot=(0, 0, 0))
        hd = bpy.context.scene.objects[f'hood{k}']
        hd.rotation_euler = (math.radians(90), 0, 0)
        hd.location = (0, -0.21, z)
    disc('pole', 0.06, 0.3, 0.02, M('dark'), segs=24, z0=-0.86)
    ui_shot(az=-20, el=8)


@icon('ui-shortcut', 'ui', 128, UI_RES)
def _():
    arrow_icon('main', [(0, -0.62), (0, -0.2), (0, 0.2), (0, 0.62)], '#dfe6ee', width=0.2, head_len=0.28, head_w=0.46)
    br = [(0.0, -0.3)] + [(0.42 - 0.42 * math.cos(math.radians(a)), -0.3 + 0.42 * math.sin(math.radians(a)))
                          for a in range(10, 91, 10)] + [(0.62, 0.12)]
    s = arrow_icon('short', br, P['yellow'], width=0.2, head_len=0.26, head_w=0.46)
    s.location = (0, -0.03, 0)
    ui_shot(az=-14, el=8)


@icon('ui-nitro', 'ui', 128, UI_RES)
def _():
    def flame(sc):
        pts = [(0.0, 0.62), (0.12, 0.38), (0.3, 0.46), (0.28, 0.2), (0.4, -0.06)] + \
              circle_poly(0.32, 20, cx=0.0, cy=-0.26, a0=10, a1=-190, closed=False)[1:] + \
              [(-0.38, 0.02), (-0.28, 0.3), (-0.16, 0.18)]
        return [(x * sc, (y + 0.26) * sc - 0.26) for x, y in pts]
    shape2d('f1', flame(1.0), 0.16, 0.05, mat('f1', '#ff4b1f', rough=0.3, coat=0.6, emit='#ff3000', emit_strength=0.25),
            fillet=0.05)
    shape2d('f2', flame(0.7), 0.18, 0.05, mat('f2', '#ff9a1c', rough=0.3, coat=0.6, emit='#ff7a00', emit_strength=0.25),
            fillet=0.04, loc=(0, -0.035, -0.06))
    shape2d('f3', flame(0.42), 0.2, 0.04, mat('f3', '#ffe35a', rough=0.3, coat=0.6, emit='#ffd000', emit_strength=0.3),
            fillet=0.03, loc=(0, -0.07, -0.12))
    ui_shot(az=-16, el=8)


# ----------------------------------------------------------------------------- main

def main():
    names = [n for n in REG if (not ONLY or n in ONLY) and (not GROUPS or REG[n]['group'] in GROUPS)]
    t0 = time.time()
    for n in names:
        r = REG[n]
        reset()
        meta = r['fn']() or {}
        if bpy.context.scene.camera is None:
            raise RuntimeError(n + ': no camera')
        meta.update(group=r['group'], out=r['out'], res=r['res'])
        render(n, r['res'], meta)
    print(f'[icons] {len(names)} icons in {time.time() - t0:.0f}s', flush=True)

if __name__ == '__main__':
    main()

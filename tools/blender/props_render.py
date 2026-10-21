"""Contact-sheet cells for assets/models/props.glb (Blender 5.2 headless, EEVEE).

    blender -b --factory-startup -P tools/blender/props_render.py -- --glb assets/models/props.glb \
        --out DIR [--only tree_round_a,palm_a] [--res 520] [--samples 24] [--scene]

Renders DIR/cell-<name>.png for every top-level node (ferris_wheel together with its rotor), in warm
daylight on a paving disc, with a 1.5 m grey "chibi" stand-in for scale.  Shading mimics the runtime
`toy` material: base colour = COLOR_0, material id decoded from UV0.u (glass/metal glossier, lamp glass
slightly emissive, cloth/foliage matte).  --scene renders DIR/scene.png, a small street vignette.
tools/blender/props_sheet.py composes the cells into tools/shots/props-sheet.png.
"""
import bpy, math, os, sys
from mathutils import Vector, Matrix
from bpy_extras.object_utils import world_to_camera_view

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
def _arg(name, default=None):
    return argv[argv.index(name) + 1] if name in argv else default
GLB = os.path.abspath(_arg('--glb', os.path.join(ROOT, 'assets', 'models', 'props.glb')))
OUTD = os.path.abspath(_arg('--out', '/tmp/fds-props'))
ONLY = [s for s in (_arg('--only', '') or '').split(',') if s]
RES = int(_arg('--res', '520'))
SAMPLES = int(_arg('--samples', '24'))
SCENE = '--scene' in argv
UNLIT = '--unlit' in argv    # debug: show the baked COLOR_0 only (emission, no lights)
os.makedirs(OUTD, exist_ok=True)

bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene
bpy.ops.import_scene.gltf(filepath=GLB)
roots = {o.name: o for o in bpy.data.objects if o.parent is None and o.type == 'MESH'}

def srgb(h):
    h = h.lstrip('#')
    c = [int(h[i:i + 2], 16) / 255.0 for i in (0, 2, 4)]
    return tuple((v / 12.92) if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4 for v in c) + (1.0,)

# ---------------------------------------------------------------- runtime-like material
def preview_material(colname):
    m = bpy.data.materials.new('toy_preview')
    m.use_nodes = True
    nt = m.node_tree
    N, L = nt.nodes, nt.links
    b = N['Principled BSDF']
    at = N.new('ShaderNodeAttribute')
    at.attribute_name = colname
    uv = N.new('ShaderNodeUVMap')
    sep = N.new('ShaderNodeSeparateXYZ')
    L.new(uv.outputs['UV'], sep.inputs[0])
    m16 = N.new('ShaderNodeMath'); m16.operation = 'MULTIPLY'; m16.inputs[1].default_value = 16.0
    L.new(sep.outputs['X'], m16.inputs[0])
    fl = N.new('ShaderNodeMath'); fl.operation = 'FLOOR'
    L.new(m16.outputs[0], fl.inputs[0])
    def is_id(k):
        c = N.new('ShaderNodeMath'); c.operation = 'COMPARE'
        c.inputs[1].default_value = float(k); c.inputs[2].default_value = 0.1
        L.new(fl.outputs[0], c.inputs[0])
        return c.outputs[0]
    g, lamp, met = is_id(2), is_id(3), is_id(5)
    # roughness = 0.8 - 0.65*glass - 0.6*lamp - 0.4*metal
    def lin_comb(base, terms):
        out = None
        cur_val = base
        node = N.new('ShaderNodeValue'); node.outputs[0].default_value = base
        out = node.outputs[0]
        for sock, k in terms:
            mm = N.new('ShaderNodeMath'); mm.operation = 'MULTIPLY_ADD'
            L.new(sock, mm.inputs[0]); mm.inputs[1].default_value = k; L.new(out, mm.inputs[2])
            out = mm.outputs[0]
        return out
    L.new(lin_comb(0.82, [(g, -0.7), (lamp, -0.55), (met, -0.42)]), b.inputs['Roughness'])
    L.new(lin_comb(0.0, [(met, 0.35)]), b.inputs['Metallic'])
    L.new(at.outputs['Color'], b.inputs['Base Color'])
    L.new(at.outputs['Color'], b.inputs['Emission Color'])
    L.new(lin_comb(0.0, [(lamp, 0.35)]), b.inputs['Emission Strength'])
    try:
        b.inputs['Specular IOR Level'].default_value = 0.35
    except KeyError:
        pass
    return m

colname = None
for o in roots.values():
    if o.data.color_attributes:
        colname = o.data.color_attributes[0].name
        break
PM = preview_material(colname or 'Color')
if UNLIT:
    nt = PM.node_tree
    em = nt.nodes.new('ShaderNodeEmission')
    at = [n for n in nt.nodes if n.type == 'ATTRIBUTE'][0]
    nt.links.new(at.outputs['Color'], em.inputs['Color'])
    nt.links.new(em.outputs[0], nt.nodes['Material Output'].inputs['Surface'])
for o in roots.values():
    o.data.materials.clear()
    o.data.materials.append(PM)

# ---------------------------------------------------------------- look
sc.render.engine = 'BLENDER_EEVEE'
try:
    sc.eevee.taa_render_samples = SAMPLES
    sc.eevee.use_shadows = True
except Exception:
    pass
for attr, val in (('use_raytracing', True), ('shadow_ray_count', 2), ('shadow_step_count', 8)):
    try:
        setattr(sc.eevee, attr, val)
    except Exception:
        pass
sc.view_settings.view_transform = 'Standard'
sc.view_settings.look = 'None'
sc.view_settings.exposure = 0.0
world = bpy.data.worlds.new('w')
sc.world = world
world.use_nodes = True
wn = world.node_tree.nodes
bg = wn['Background']
# ambient: light blue overhead, warm haze at the horizon (background itself is transparent; the sheet adds a sky)
tc = wn.new('ShaderNodeTexCoord')
sep = wn.new('ShaderNodeSeparateXYZ')
world.node_tree.links.new(tc.outputs['Generated'], sep.inputs[0])
ramp = wn.new('ShaderNodeValToRGB')
world.node_tree.links.new(sep.outputs['Z'], ramp.inputs['Fac'])
ramp.color_ramp.elements[0].position = 0.0
ramp.color_ramp.elements[0].color = srgb('#fbeedd')
ramp.color_ramp.elements[1].position = 0.28
ramp.color_ramp.elements[1].color = srgb('#8cc3f0')
world.node_tree.links.new(ramp.outputs['Color'], bg.inputs['Color'])
bg.inputs['Strength'].default_value = 0.85

sun_d = bpy.data.lights.new('sun', 'SUN')
sun_d.energy = 2.7
sun_d.color = (1.0, 0.9, 0.76)
sun_d.angle = math.radians(3.0)
sun = bpy.data.objects.new('sun', sun_d)
sc.collection.objects.link(sun)
sun.rotation_euler = Vector((0.55, -0.9, 1.05)).normalized().to_track_quat('Z', 'Y').to_euler()

# paving disc + chibi stand-in
def mk_mat(name, hexcol, rough=0.85):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = srgb(hexcol)
    b.inputs['Roughness'].default_value = rough
    return m
bpy.ops.mesh.primitive_circle_add(vertices=64, radius=1.0, fill_type='NGON')
ground = bpy.context.active_object
ground.name = 'ground'
ground.data.materials.append(mk_mat('paving', '#ead9bf'))
bpy.ops.mesh.primitive_cylinder_add(vertices=16, radius=0.33, depth=0.75, location=(0, 0, 0.375 + 0.05))
body = bpy.context.active_object
bpy.ops.mesh.primitive_uv_sphere_add(segments=16, ring_count=10, radius=0.36, location=(0, 0, 1.14))
head = bpy.context.active_object
for o in (body, head):
    o.data.materials.append(mk_mat('chibi', '#9aa7bd', 0.6))
    bpy.ops.object.select_all(action='DESELECT')
for o in (body, head):
    o.select_set(True)
bpy.context.view_layer.objects.active = body
bpy.ops.object.join()
chibi = body
chibi.name = 'chibi'
for o in (body,):
    for p in o.data.polygons:
        p.use_smooth = True

cam_d = bpy.data.cameras.new('cam')
cam_d.lens = 50
cam_d.clip_start = 0.05
cam_d.clip_end = 2000
cam = bpy.data.objects.new('cam', cam_d)
sc.collection.objects.link(cam)
sc.camera = cam
sc.render.resolution_x = RES
sc.render.resolution_y = RES
sc.render.film_transparent = True
sc.render.image_settings.file_format = 'PNG'

def corners(objs):
    pts = []
    for o in objs:
        for c in o.bound_box:
            pts.append(o.matrix_world @ Vector(c))
    return pts

def frame(objs, view=Vector((-0.62, -1.0, 0.5)), margin=0.84, lens=50):
    cam_d.lens = lens
    cam_d.shift_x = cam_d.shift_y = 0.0
    pts = corners(objs)
    lo = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
    hi = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
    tgt = (lo + hi) / 2
    d = view.normalized()
    dist = (hi - lo).length * 1.6
    for _ in range(6):
        cam.location = tgt + d * dist
        cam.rotation_euler = (-d).to_track_quat('-Z', 'Y').to_euler()
        bpy.context.view_layer.update()
        co = [world_to_camera_view(sc, cam, p) for p in pts]
        xs, ys = [c.x for c in co], [c.y for c in co]
        ext = max(max(xs) - min(xs), max(ys) - min(ys))
        cx, cy = (max(xs) + min(xs)) / 2, (max(ys) + min(ys)) / 2
        cam_d.shift_x += (cx - 0.5)
        cam_d.shift_y += (cy - 0.5)
        dist *= ext / margin
    cam.location = tgt + d * dist
    bpy.context.view_layer.update()
    return lo, hi

def show_only(objs):
    keep = set(objs) | {ground, sun, cam, chibi}
    for o in bpy.data.objects:
        o.hide_render = o not in keep

CELLS = [n for n in roots if n != 'ferris_wheel_rotor']
if SCENE and not ONLY:
    CELLS = []
if ONLY:
    CELLS = [n for n in CELLS if n in ONLY]

extra_copies = []
for name in CELLS:
    for o in extra_copies:
        bpy.data.objects.remove(o, do_unlink=True)
    extra_copies = []
    objs = [roots[name]]
    if name == 'ferris_wheel' and 'ferris_wheel_rotor' in roots:
        objs.append(roots['ferris_wheel_rotor'])
    if name == 'railing':   # show chaining: three segments along +X
        for i in (1, 2):
            c = roots[name].copy()
            c.location = (2.0 * i, 0, 0)
            sc.collection.objects.link(c)
            extra_copies.append(c)
            objs.append(c)
    pts = corners(objs)
    lo = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
    hi = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
    size = max(hi.x - lo.x, hi.y - lo.y, hi.z - lo.z)
    # chibi to the front-right of the footprint
    chibi.location = (hi.x + 0.55, lo.y + 0.25, 0)
    big = size > 12
    chibi.hide_render = False
    show_only(objs)
    ground.scale = (size * 2.5 + 3, size * 2.5 + 3, 1)
    ground.location = ((lo.x + hi.x) / 2, (lo.y + hi.y) / 2, -0.002)
    frame(objs + ([chibi] if not big else []))
    sc.render.filepath = os.path.join(OUTD, f'cell-{name}.png')
    bpy.ops.render.render(write_still=True)
    print('CELL', name)

def place(name, x, y, rz=0.0, s=1.0, z=0.0):
    src = roots[name]
    o = src.copy()
    o.location = (x, y, src.location.z * s + z)
    o.rotation_euler = (0, 0, math.radians(rz))
    o.scale = (s, s, s)
    o.hide_render = False
    sc.collection.objects.link(o)
    return o

def slab(name, x0, x1, y0, y1, z0, z1, col, rough=0.9):
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2))
    o = bpy.context.active_object
    o.name = name
    o.scale = (x1 - x0, y1 - y0, z1 - z0)
    o.data.materials.append(mk_mat(name, col, rough))
    return o

if SCENE:
    for o in bpy.data.objects:
        if o.type == 'MESH':
            o.hide_render = True
    sw = 0.15   # sidewalk height
    slab('road', -4.0, 4.0, -20, 400, -0.05, 0.0, '#6c7380')
    for y in range(-10, 200, 6):
        slab('dash', -0.08, 0.08, y, y + 3, 0.0, 0.01, '#f4f1e8')
    slab('walk_r', 4.0, 9.5, -20, 400, 0.0, sw, '#ead7b8')
    slab('curb_r', 4.0, 4.25, -20, 400, 0.0, sw + 0.01, '#d9d2c4')
    slab('walk_l', -9.0, -4.0, -20, 400, 0.0, sw, '#e3cfaa')
    slab('curb_l', -4.25, -4.0, -20, 400, 0.0, sw + 0.01, '#d9d2c4')
    slab('quay', -9.6, -9.0, -20, 400, -1.2, sw, '#cdbf9f')
    slab('water', -600, -9.6, -20, 900, -1.6, -0.6, '#2f9fd8', 0.15)
    for i, (y, h, col) in enumerate(((0, 11, '#f1d9b0'), (9, 14, '#e8a77d'), (17, 12, '#f5e6c4'), (26, 16, '#dfb36c'),
                                     (36, 12, '#f0c9b5'), (45, 15, '#f1d9b0'), (55, 13, '#e8a77d'))):
        slab(f'bld{i}', 9.5, 17, y, y + 8.6, 0, h, col)
        slab(f'bldr{i}', 9.3, 17.2, y - 0.1, y + 8.7, h, h + 0.5, '#c8603a')
    # hills across the bay
    for i, (x, y, r, col) in enumerate(((-140, 120, 70, '#86b84e'), (-90, 220, 80, '#7aae48'), (-200, 30, 60, '#8fbe55'))):
        bpy.ops.mesh.primitive_uv_sphere_add(segments=32, ring_count=16, radius=r, location=(x, y, -r * 0.55))
        h_ = bpy.context.active_object
        h_.scale = (1.0, 1.4, 0.55)
        h_.data.materials.append(mk_mat(f'hill{i}', col))
        for p in h_.data.polygons:
            p.use_smooth = True
    import random
    rnd = random.Random(3)
    for k in range(70):
        hx_, hy_ = rnd.uniform(-125, -80), rnd.uniform(60, 260)
        hz_ = 2 + 18 * (1 - min(1, abs(hx_ + 110) / 40))
        place(rnd.choice(['hill_house_a', 'hill_house_b', 'hill_house_c']), hx_, hy_, rnd.uniform(-30, 30), 1.0, max(0, hz_ - 6))
    place('lighthouse', -60, 70, 0, 1.0, -0.6)
    slab('mole', -64, -56, 40, 74, -0.8, 0.0, '#cdbf9f')
    place('clock_tower', 13, 150, 20)
    place('ferris_wheel', 60, 160, -35)
    place('ferris_wheel_rotor', 60, 160, -35)
    # right sidewalk: cafe street
    for y, n in ((3, 'tree_round_a'), (15, 'tree_round_c'), (27, 'tree_round_b'), (39, 'tree_round_a'), (51, 'tree_round_c'), (63, 'tree_round_a')):
        place(n, 5.1, y, y * 7, 1.0, sw)
    for y in (9, 21, 33, 45, 57):
        place('street_lamp', 4.6, y, 0, 1.0, sw)
    place('traffic_light', 4.55, 70, 0, 1.0, sw)
    place('cafe_set_a', 7.6, 6.5, 0, 1.0, sw)
    place('cafe_set_b', 7.6, 11.5, 0, 1.0, sw)
    place('cafe_set_a', 7.6, 30.5, 0, 1.0, sw)
    place('chalkboard', 5.9, 9.2, 15, 1.0, sw)
    place('planter', 8.9, 18.5, 90, 1.0, sw)
    place('flower_pot', 8.9, 2.6, 0, 1.0, sw)
    place('flower_pot', 8.9, 14.2, 0, 1.0, sw)
    place('bench', 8.9, 24, -90, 1.0, sw)
    place('trash_bin', 4.75, 18, 0, 1.0, sw)
    place('hydrant', 4.6, 0.8, 0, 1.0, sw)
    for y in (-2, 12, 24, 36):
        place('bollard', 4.45, y, 0, 1.0, sw)
    place('bush_a', 8.8, 21.3, 0, 1.0, sw)
    # left: palm promenade
    for y in (2, 16, 30, 44, 58):
        place('palm_a' if (y // 14) % 2 == 0 else 'palm_b', -5.4, y, y * 11, 1.0, sw)
    for y in (9, 23, 37, 51):
        place('street_lamp_double', -4.6, y, 90, 1.0, sw)
    for k in range(40):
        place('railing', -8.75, -10 + 2 * k, 90, 1.0, sw)
    place('sign_post', -4.65, 26.5, 0, 1.0, sw)
    place('bus_stop', -6.9, 64, 90, 1.0, sw)
    place('planter', -7.6, 12, 90, 1.0, sw)
    chibi.hide_render = False
    chibi.location = (6.3, 4.6, sw)
    for (x, y) in ((-6.6, 7.0), (6.9, 26.0)):
        c = chibi.copy()
        c.location = (x, y, sw)
        sc.collection.objects.link(c)
    ground.hide_render = True
    sc.render.resolution_x, sc.render.resolution_y = 1000, 1240
    sc.render.film_transparent = True
    cam_d.lens = 24
    cam_d.shift_x = cam_d.shift_y = 0.0
    cam.location = (0.8, -9.0, 3.6)
    cam.rotation_euler = (Vector((0.3, 30.0, 1.6)) - cam.location).to_track_quat('-Z', 'Y').to_euler()
    sun.rotation_euler = Vector((0.75, -0.55, 0.9)).normalized().to_track_quat('Z', 'Y').to_euler()
    sc.render.filepath = os.path.join(OUTD, 'scene.png')
    bpy.ops.render.render(write_still=True)
    print('SCENE', sc.render.filepath)

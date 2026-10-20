"""Renders for assets/models/vehicles.glb (Blender 5.2 headless).

    blender -b --factory-startup -P tools/blender/vehicles_render.py -- --glb assets/models/vehicles.glb \
        --mode icons|cells|preview --out DIR [--only vespetta,zippy] [--engine CYCLES|EEVEE] [--samples 64]

mode icons    -> DIR/veh-<id>.png + DIR/helmet.png (768 px raw; vehicles_sheet.py downsamples to 384)
mode cells    -> DIR/cell-<id>.png, DIR/cell-<id>-rider.png, DIR/cell-helmet-drive.png, DIR/cell-helmet-idle.png
mode preview  -> DIR/pv-<id>-{side,top,front,q,chase}.png (with rider, for iterating on fit)

The rider is Kenney's character-male-a.glb scaled x2.2 with the `drive` action, its root object
placed exactly at the vehicle's `seat` empty (no rotation: both face glTF +Z / Blender -Y).
The helmet is placed the way three.js does `headBone.add(helmet)`: world = armature world @
(pose deformation of the head bone) @ translation(head bone rest head).
"""
import bpy, math, os, sys, json
from mathutils import Vector, Matrix
from bpy_extras.object_utils import world_to_camera_view

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
CHAR = os.path.join(ROOT, 'assets', 'src', 'kenney', 'kenney_mini-characters', 'Models', 'GLB format')
argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
def _arg(name, default=None):
    return argv[argv.index(name) + 1] if name in argv else default
GLB = os.path.abspath(_arg('--glb', os.path.join(ROOT, 'assets', 'models', 'vehicles.glb')))
MODE = _arg('--mode', 'preview')
OUTD = os.path.abspath(_arg('--out', '/tmp/fds-veh-render'))
ONLY = [s for s in (_arg('--only', '') or '').split(',') if s]
ENGINE = _arg('--engine', 'CYCLES' if MODE == 'icons' else 'EEVEE')
SAMPLES = int(_arg('--samples', '64'))
CHARNAME = _arg('--char', 'character-male-a')
os.makedirs(OUTD, exist_ok=True)
VEHICLES = ['rustbucket', 'zippy', 'vespetta', 'volt', 'mule', 'viper']

bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene

# ---------------------------------------------------------------- import
bpy.ops.import_scene.gltf(filepath=GLB)
roots = {o.name: o for o in bpy.data.objects if o.parent is None}
def descendants(o):
    out, st = [], [o]
    while st:
        x = st.pop()
        out.append(x)
        st.extend(x.children)
    return out
def find_part(root, part):
    for o in descendants(root):
        if o.get('part') == part or o.name.split('.')[0] == part:
            return o
    return None

def import_char(name=CHARNAME, action='drive'):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=os.path.join(CHAR, name + '.glb'))
    new = [o for o in bpy.data.objects if o not in before]
    arm = [o for o in new if o.type == 'ARMATURE'][0]
    for o in new:   # importer adds a bone-shape icosphere; keep it out of renders
        if o.type == 'MESH' and o.parent is None:
            o.hide_render = True
            o.hide_viewport = True
    arm.scale = (2.2, 2.2, 2.2)
    set_action(arm, action)
    return arm, new

def set_action(arm, action):
    for pb in arm.pose.bones:          # actions only key some channels: start from rest
        pb.location = (0, 0, 0)
        pb.rotation_mode = 'QUATERNION'
        pb.rotation_quaternion = (1, 0, 0, 0)
        pb.scale = (1, 1, 1)
    if not arm.animation_data:
        arm.animation_data_create()
    act = bpy.data.actions[action]
    arm.animation_data.action = act
    try:
        arm.animation_data.action_slot = act.slots[0]
    except Exception:
        pass
    sc.frame_set(0)

def attach_helmet(helmet, arm):
    """replicate three.js headBone.add(helmet) for the current pose."""
    bpy.context.view_layer.update()
    pb = arm.pose.bones['head']
    b = arm.data.bones['head']
    D = pb.matrix @ b.matrix_local.inverted()          # pose deformation in armature space
    helmet.matrix_world = arm.matrix_world @ D @ Matrix.Translation(b.head_local)

def set_visible(objs, vis):
    for o in objs:
        o.hide_render = not vis

ALL = [o for o in bpy.data.objects]

# ---------------------------------------------------------------- look
sc.render.engine = 'CYCLES' if ENGINE == 'CYCLES' else 'BLENDER_EEVEE'
if ENGINE == 'CYCLES':
    sc.cycles.device = 'CPU'
    sc.cycles.samples = SAMPLES
    sc.cycles.use_denoising = True
    sc.cycles.max_bounces = 6
else:
    sc.eevee.taa_render_samples = 32
sc.render.film_transparent = True
sc.render.image_settings.file_format = 'PNG'
sc.render.image_settings.color_mode = 'RGBA'
sc.view_settings.view_transform = 'Standard'
sc.view_settings.look = 'None'
world = bpy.data.worlds.new('w')
sc.world = world
world.use_nodes = True
nt = world.node_tree
bg = nt.nodes['Background']
grad = nt.nodes.new('ShaderNodeTexGradient')
coord = nt.nodes.new('ShaderNodeTexCoord')
ramp = nt.nodes.new('ShaderNodeValToRGB')
sep = nt.nodes.new('ShaderNodeSeparateXYZ')
nt.links.new(coord.outputs['Generated'], sep.inputs[0])
mapr = nt.nodes.new('ShaderNodeMapRange')
nt.links.new(sep.outputs['Z'], mapr.inputs['Value'])
mapr.inputs['From Min'].default_value = 0.35
mapr.inputs['From Max'].default_value = 0.75
nt.links.new(mapr.outputs['Result'], ramp.inputs['Fac'])
ramp.color_ramp.elements[0].color = (0.30, 0.30, 0.33, 1)
ramp.color_ramp.elements[1].color = (0.95, 0.96, 1.0, 1)
nt.links.new(ramp.outputs['Color'], bg.inputs['Color'])
bg.inputs['Strength'].default_value = 0.55

def area(name, loc, target, energy, size, color=(1, 1, 1)):
    l = bpy.data.lights.new(name, 'AREA')
    l.energy = energy
    l.size = size
    l.color = color
    o = bpy.data.objects.new(name, l)
    sc.collection.objects.link(o)
    o.location = loc
    o.rotation_euler = (Vector(target) - Vector(loc)).to_track_quat('-Z', 'Y').to_euler()
    return o
# key upper-left-front (camera sits front-left), cool fill, warm rim from behind
LIGHTS = [area('key', (4.5, -4.0, 5.5), (0, 0, 0.6), 900, 4.0, (1.0, 0.97, 0.92)),
          area('fill', (-5.0, -3.0, 2.5), (0, 0, 0.6), 260, 5.0, (0.85, 0.9, 1.0)),
          area('rim', (-1.5, 5.5, 4.0), (0, 0, 0.8), 550, 3.0, (1.0, 0.9, 0.8))]

cam_data = bpy.data.cameras.new('cam')
cam = bpy.data.objects.new('cam', cam_data)
sc.collection.objects.link(cam)
sc.camera = cam

def world_verts(objs):
    dg = bpy.context.evaluated_depsgraph_get()
    pts = []
    for o in objs:
        if o.type != 'MESH' or o.hide_render:
            continue
        oe = o.evaluated_get(dg)
        me = oe.to_mesh()
        mw = oe.matrix_world
        pts += [mw @ v.co for v in me.vertices]
        oe.to_mesh_clear()
    return pts

def frame_persp(pts, direction, lens=60, margin=0.06, res=(768, 768)):
    """aim camera along -direction at the points and fit them with a margin (uses shift)."""
    sc.render.resolution_x, sc.render.resolution_y = res
    cam_data.type = 'PERSP'
    cam_data.lens = lens
    cam_data.sensor_fit = 'AUTO'
    cam_data.shift_x = cam_data.shift_y = 0
    c = sum(pts, Vector()) / len(pts)
    d = Vector(direction).normalized()
    rot = (-d).to_track_quat('-Z', 'Y').to_euler()
    dist = 6.0
    for _ in range(30):
        cam.location = c + d * dist
        cam.rotation_euler = rot
        bpy.context.view_layer.update()
        co = [world_to_camera_view(sc, cam, p) for p in pts]
        xs, ys = [p.x for p in co], [p.y for p in co]
        cx, cy = (min(xs) + max(xs)) / 2, (min(ys) + max(ys)) / 2
        cam_data.shift_x += (cx - 0.5) * (1.0 if res[0] >= res[1] else res[0] / res[1])
        cam_data.shift_y += (cy - 0.5) * (1.0 if res[1] >= res[0] else res[1] / res[0])
        span = max(max(xs) - min(xs), max(ys) - min(ys))
        dist *= span / (1 - 2 * margin)
    return cam

def frame_ortho(pts, direction, up=(0, 0, 1), scale=None, res=(800, 600), center=None):
    sc.render.resolution_x, sc.render.resolution_y = res
    cam_data.type = 'ORTHO'
    cam_data.shift_x = cam_data.shift_y = 0
    c = center if center is not None else sum(pts, Vector()) / len(pts)
    d = Vector(direction).normalized()
    cam.location = c + d * 10
    cam.rotation_euler = (-d).to_track_quat('-Z', 'Y' if abs(d.z) < 0.9 else 'Y').to_euler()
    if abs(d.z) > 0.9:
        cam.rotation_euler = (0, 0, 0)
    cam_data.ortho_scale = scale or 3.0
    cam_data.clip_end = 100
    return cam

def render(path):
    sc.render.filepath = path
    bpy.ops.render.render(write_still=True)
    print('RENDER', path)

def isolate(keep):
    keep = set(keep)
    for o in bpy.data.objects:
        if o.type in ('MESH',):
            o.hide_render = o not in keep

# ---------------------------------------------------------------- modes
veh_ids = [v for v in VEHICLES if v in roots and (not ONLY or v in ONLY)]
helmet = roots.get('helmet')
ICON_DIR = Vector((math.sin(math.radians(40)), -math.cos(math.radians(40)), 0.62))   # front-left, above
RIDER_DIR = Vector((math.sin(math.radians(58)), -math.cos(math.radians(58)), 0.30))  # lower, more lateral

if MODE == 'icons':
    for vid in veh_ids:
        objs = descendants(roots[vid])
        isolate(objs)
        frame_persp(world_verts(objs), ICON_DIR, lens=70, margin=0.045)
        render(os.path.join(OUTD, f'veh-{vid}.png'))
    if helmet and (not ONLY or 'helmet' in ONLY):
        hobj = descendants(helmet)
        isolate(hobj)
        hdir = Vector((math.sin(math.radians(35)), -math.cos(math.radians(35)), 0.35))
        frame_persp(world_verts(hobj), hdir, lens=70, margin=0.06)
        render(os.path.join(OUTD, 'helmet.png'))

elif MODE in ('cells', 'preview'):
    arm, cobjs = import_char()
    cmesh = [o for o in cobjs if o.type == 'MESH' and o.parent is not None]
    if helmet:
        hobj = descendants(helmet)
    for vid in veh_ids:
        root = roots[vid]
        objs = descendants(root)
        seat = find_part(root, 'seat')
        arm.location = seat.matrix_world.translation
        arm.rotation_euler = (0, 0, 0)
        bpy.context.view_layer.update()
        if helmet:
            attach_helmet(helmet, arm)
        riders = cmesh + (hobj if helmet else [])
        if MODE == 'cells':
            isolate(objs)
            frame_persp(world_verts(objs), ICON_DIR, lens=55, margin=0.075, res=(720, 720))
            render(os.path.join(OUTD, f'cell-{vid}.png'))
            isolate(objs + riders)
            frame_persp(world_verts(objs + riders), RIDER_DIR, lens=55, margin=0.06, res=(720, 720))
            render(os.path.join(OUTD, f'cell-{vid}-rider.png'))
            chase = Vector((0.0, 1.0, 0.45))
            frame_persp(world_verts(objs + riders), chase, lens=55, margin=0.05, res=(720, 720))
            render(os.path.join(OUTD, f'cell-{vid}-chase.png'))
            isolate(objs + cmesh)
            frame_ortho(None, Vector((1, 0, 0)), scale=2.6, res=(720, 720), center=Vector((0, 0, 0.95)))
            render(os.path.join(OUTD, f'cell-{vid}-side.png'))
        else:
            isolate(objs + riders)
            pts = world_verts(objs + riders)
            frame_ortho(pts, Vector((1, 0, 0)), scale=2.6, res=(900, 760), center=Vector((0, 0, 0.95)))
            render(os.path.join(OUTD, f'pv-{vid}-side.png'))
            frame_ortho(pts, Vector((0, 0, 1)), scale=2.6, res=(760, 900), center=Vector((0, 0, 0.5)))
            render(os.path.join(OUTD, f'pv-{vid}-top.png'))
            frame_ortho(pts, Vector((0, -1, 0)), scale=2.2, res=(760, 760), center=Vector((0, 0, 0.95)))
            render(os.path.join(OUTD, f'pv-{vid}-front.png'))
            frame_persp(pts, ICON_DIR, lens=50, margin=0.05, res=(760, 760))
            render(os.path.join(OUTD, f'pv-{vid}-q.png'))
            frame_persp(pts, Vector((0.0, 1.0, 0.45)), lens=50, margin=0.05, res=(760, 760))
            render(os.path.join(OUTD, f'pv-{vid}-chase.png'))
            isolate(objs)
            frame_persp(world_verts(objs), ICON_DIR, lens=50, margin=0.05, res=(760, 760))
            render(os.path.join(OUTD, f'pv-{vid}-bare.png'))
    if helmet and MODE == 'cells' and (not ONLY or 'helmet' in ONLY):
        arm.location = (0, 0, 0)
        for act in ('drive', 'idle'):
            set_action(arm, act)
            sc.frame_set(0)
            attach_helmet(helmet, arm)
            isolate(cmesh + hobj)
            frame_persp(world_verts(cmesh + hobj), ICON_DIR, lens=55, margin=0.08, res=(720, 720))
            render(os.path.join(OUTD, f'cell-helmet-{act}.png'))
            frame_ortho(None, Vector((1, 0, 0)), scale=1.9, res=(720, 720), center=Vector((0, 0, 0.75 if act == 'idle' else 0.45)))
            render(os.path.join(OUTD, f'cell-helmet-{act}-side.png'))

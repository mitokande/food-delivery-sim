"""Renders for assets/models/cars.glb (Blender 5.2 headless).

    blender -b --factory-startup -P tools/blender/cars_render.py -- --glb assets/models/cars.glb \
        --mode cells|preview --out DIR [--only sedan,taxi] [--engine EEVEE|CYCLES] [--samples 32] [--res 640x520]

mode cells    -> DIR/cell-<name>.png  (3/4 front view, bright daylight, ground + soft shadow)
mode preview  -> DIR/pv-<name>-{q,side,front,rear,top}.png for iterating on shapes

The `toy` material is replaced by a node setup that mimics the runtime shader: COLOR_0 is the base colour and
the material id in UV0 (u = (id + 0.5) / 16) picks roughness / metalness / coat / emission through a
constant colour ramp, so glass looks glossy, tyres matte, chrome metallic and light bars glow.
"""
import bpy, math, os, sys
from mathutils import Vector
from bpy_extras.object_utils import world_to_camera_view

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
def _arg(name, default=None):
    return argv[argv.index(name) + 1] if name in argv else default
GLB = os.path.abspath(_arg('--glb', os.path.join(ROOT, 'assets', 'models', 'cars.glb')))
MODE = _arg('--mode', 'cells')
OUTD = os.path.abspath(_arg('--out', '/tmp/fds-cars'))
ONLY = [s for s in (_arg('--only', '') or '').split(',') if s]
ENGINE = _arg('--engine', 'EEVEE')
SAMPLES = int(_arg('--samples', '32'))
RES = tuple(int(v) for v in _arg('--res', '640x470').split('x'))
os.makedirs(OUTD, exist_ok=True)

bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene
bpy.ops.import_scene.gltf(filepath=GLB)
models = {o.name: o for o in bpy.data.objects if o.parent is None and o.type == 'MESH'}

# ------------------------------------------------------------------ material mimicking the runtime shader
#            id: (roughness, metallic, emission, coat)
PROPS = {0: (0.62, 0.0, 0.0, 0.0), 1: (0.30, 0.0, 0.0, 0.7), 2: (0.22, 0.0, 0.0, 0.25), 3: (0.20, 0.0, 0.35, 0.5),
         4: (0.25, 0.0, 0.30, 0.5), 5: (0.20, 0.9, 0.0, 0.0), 6: (0.92, 0.0, 0.0, 0.0), 7: (0.5, 0.0, 0.0, 0.0),
         8: (0.30, 0.0, 0.0, 0.7), 9: (0.5, 0.0, 0.0, 0.0), 10: (0.30, 0.0, 0.9, 0.0)}
EMIT_SCALE = 3.0

def toy_shader():
    m = bpy.data.materials.new('toy_render')
    m.use_nodes = True
    nt = m.node_tree
    for n in list(nt.nodes):
        nt.nodes.remove(n)
    out = nt.nodes.new('ShaderNodeOutputMaterial')
    b = nt.nodes.new('ShaderNodeBsdfPrincipled')
    nt.links.new(b.outputs[0], out.inputs['Surface'])
    vc = nt.nodes.new('ShaderNodeVertexColor')
    vc.layer_name = 'Color'
    uv = nt.nodes.new('ShaderNodeUVMap')
    sep = nt.nodes.new('ShaderNodeSeparateXYZ')
    nt.links.new(uv.outputs['UV'], sep.inputs[0])
    # preview tint of re-tintable paint (id 1), like the runtime does per instance
    isp = nt.nodes.new('ShaderNodeMath')
    isp.operation = 'COMPARE'
    isp.inputs[1].default_value = 1.5 / 16
    isp.inputs[2].default_value = 0.01
    nt.links.new(sep.outputs['X'], isp.inputs[0])
    tint = nt.nodes.new('ShaderNodeAttribute')
    tint.attribute_type = 'OBJECT'
    tint.attribute_name = 'tint'
    mix = nt.nodes.new('ShaderNodeMix')
    mix.data_type = 'RGBA'
    nt.links.new(isp.outputs[0], mix.inputs['Factor'])
    nt.links.new(vc.outputs['Color'], mix.inputs['A'])
    nt.links.new(tint.outputs['Color'], mix.inputs['B'])
    nt.links.new(mix.outputs['Result'], b.inputs['Base Color'])
    nt.links.new(vc.outputs['Color'], b.inputs['Emission Color'])
    ramp = nt.nodes.new('ShaderNodeValToRGB')
    ramp.color_ramp.interpolation = 'CONSTANT'
    els = ramp.color_ramp.elements
    ids = sorted(PROPS)
    els[0].position = 0.0
    els[0].color = (*PROPS[0][:2], PROPS[0][2] / EMIT_SCALE, PROPS[0][3])
    els[1].position = ids[1] / 16.0
    els[1].color = (*PROPS[ids[1]][:2], PROPS[ids[1]][2] / EMIT_SCALE * 0 + PROPS[ids[1]][2] / EMIT_SCALE, PROPS[ids[1]][3])
    for i in ids[2:]:
        e = els.new(i / 16.0)
        r, mt, em, co = PROPS[i]
        e.color = (r, mt, em / EMIT_SCALE, co)
    nt.links.new(sep.outputs['X'], ramp.inputs['Fac'])
    sc2 = nt.nodes.new('ShaderNodeSeparateColor')
    nt.links.new(ramp.outputs['Color'], sc2.inputs[0])
    nt.links.new(sc2.outputs[0], b.inputs['Roughness'])
    nt.links.new(sc2.outputs[1], b.inputs['Metallic'])
    mul = nt.nodes.new('ShaderNodeMath')
    mul.operation = 'MULTIPLY'
    mul.inputs[1].default_value = EMIT_SCALE
    nt.links.new(sc2.outputs[2], mul.inputs[0])
    nt.links.new(mul.outputs[0], b.inputs['Emission Strength'])
    nt.links.new(ramp.outputs['Alpha'], b.inputs['Coat Weight'])
    b.inputs['Coat Roughness'].default_value = 0.08
    m.use_backface_culling = True          # like three.js FrontSide: flipped faces would vanish
    return m

TOY = toy_shader()
# preview tints for the re-tintable cars (runtime picks its own colours per instance)
TINT = {'sedan': '#3d7fe0', 'hatchback-sports': '#e8453c', 'compact': '#7cc443', 'suv': '#f08a2c',
        'van': '#f2f2f2', 'sedan-sports': '#8b5bd6', 'suv-luxury': '#2f9c9a'}
def lin(h):
    h = h.lstrip('#')
    c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return [x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c]
for n, o in models.items():
    o.data.materials.clear()
    o.data.materials.append(TOY)
    o['tint'] = lin(TINT.get(n, '#e8e8e8')) + [1.0]

# ------------------------------------------------------------------ daylight
sc.render.engine = 'CYCLES' if ENGINE == 'CYCLES' else 'BLENDER_EEVEE'
if ENGINE == 'CYCLES':
    sc.cycles.device = 'CPU'
    sc.cycles.samples = SAMPLES
    sc.cycles.use_denoising = True
else:
    sc.eevee.taa_render_samples = SAMPLES
    try:
        sc.eevee.use_raytracing = True
        sc.eevee.use_shadows = True
    except Exception:
        pass
sc.render.film_transparent = False
sc.render.image_settings.file_format = 'PNG'
sc.render.image_settings.color_mode = 'RGB'
VIEW = _arg('--view', 'Standard')
sc.view_settings.view_transform = VIEW
if VIEW == 'AgX':
    try:
        sc.view_settings.look = 'AgX - Punchy'
    except Exception:
        pass
    sc.view_settings.exposure = 0.35
else:
    sc.view_settings.exposure = float(_arg('--exposure', '-0.6'))

world = bpy.data.worlds.new('sky')
sc.world = world
world.use_nodes = True
nt = world.node_tree
bg = nt.nodes['Background']
coord = nt.nodes.new('ShaderNodeTexCoord')
sep = nt.nodes.new('ShaderNodeSeparateXYZ')
nt.links.new(coord.outputs['Generated'], sep.inputs[0])
ramp = nt.nodes.new('ShaderNodeValToRGB')
nt.links.new(sep.outputs['Z'], ramp.inputs['Fac'])
ramp.color_ramp.elements[0].position = 0.45
ramp.color_ramp.elements[0].color = (0.80, 0.74, 0.64, 1)   # warm ground bounce
e = ramp.color_ramp.elements.new(0.52)
e.color = (0.85, 0.92, 1.0, 1)                               # bright horizon
ramp.color_ramp.elements[1].position = 0.85
ramp.color_ramp.elements[1].color = (0.28, 0.52, 0.95, 1)   # blue zenith
nt.links.new(ramp.outputs['Color'], bg.inputs['Color'])
bg.inputs['Strength'].default_value = 1.0

sun_d = bpy.data.lights.new('sun', 'SUN')
sun_d.energy = 4.2
sun_d.color = (1.0, 0.95, 0.86)
sun_d.angle = math.radians(6)
sun = bpy.data.objects.new('sun', sun_d)
sc.collection.objects.link(sun)
sun.rotation_euler = (math.radians(42), 0, math.radians(-35))

# ground
bpy.ops.mesh.primitive_plane_add(size=4000, location=(0, 0, 0))
ground = bpy.context.active_object
gm = bpy.data.materials.new('ground')
gm.use_nodes = True
gb = gm.node_tree.nodes['Principled BSDF']
gb.inputs['Base Color'].default_value = (0.86, 0.82, 0.74, 1)
gb.inputs['Roughness'].default_value = 0.9
ground.data.materials.append(gm)

cam_d = bpy.data.cameras.new('cam')
cam = bpy.data.objects.new('cam', cam_d)
sc.collection.objects.link(cam)
sc.camera = cam

def verts_of(o):
    return [o.matrix_world @ v.co for v in o.data.vertices]

def frame(pts, direction, lens=50, margin=0.06, res=RES, ortho=False):
    sc.render.resolution_x, sc.render.resolution_y = res
    cam_d.type = 'ORTHO' if ortho else 'PERSP'
    cam_d.lens = lens
    cam_d.sensor_fit = 'AUTO'
    cam_d.shift_x = cam_d.shift_y = 0
    cam_d.clip_end = 500
    c = sum(pts, Vector()) / len(pts)
    d = Vector(direction).normalized()
    rot = (-d).to_track_quat('-Z', 'Y').to_euler()
    dist = 12.0
    if ortho:
        cam.location = c + d * 60
        cam.rotation_euler = rot
        cam_d.ortho_scale = 10
    for _ in range(25):
        if not ortho:
            cam.location = c + d * dist
        cam.rotation_euler = rot
        bpy.context.view_layer.update()
        co = [world_to_camera_view(sc, cam, p) for p in pts]
        xs, ys = [p.x for p in co], [p.y for p in co]
        cx, cy = (min(xs) + max(xs)) / 2, (min(ys) + max(ys)) / 2
        asp = res[0] / res[1]
        cam_d.shift_x += (cx - 0.5) * (1.0 if asp >= 1 else asp)
        cam_d.shift_y += (cy - 0.5) * (1.0 if asp < 1 else 1 / asp)
        sx, sy = max(xs) - min(xs), max(ys) - min(ys)
        span = max(sx, sy)
        k = span / (1 - 2 * margin)
        if ortho:
            cam_d.ortho_scale *= k
        else:
            dist *= k

def render(path):
    sc.render.filepath = path
    bpy.ops.render.render(write_still=True)
    print('RENDER', path)

def isolate(name):
    for n, o in models.items():
        o.hide_render = n != name

names = [n for n in models if not ONLY or n in ONLY]
Q = Vector((math.sin(math.radians(38)), -math.cos(math.radians(38)), 0.42))
for n in names:
    o = models[n]
    isolate(n)
    pts = verts_of(o)
    if MODE == 'cells':
        if n.startswith('train'):
            frame(pts, Vector((math.sin(math.radians(60)), -math.cos(math.radians(60)), 0.20)), lens=50, margin=0.02,
                  res=(int(RES[0] * 2), int(RES[0] * 0.5)))
        else:
            frame(pts, Q, lens=50, margin=0.05)
        render(os.path.join(OUTD, f'cell-{n}.png'))
    else:
        frame(pts, Q, lens=50, margin=0.05)
        render(os.path.join(OUTD, f'pv-{n}-q.png'))
        frame(pts, Vector((1, 0, 0.0001)), margin=0.04, ortho=True)
        render(os.path.join(OUTD, f'pv-{n}-side.png'))
        frame(pts, Vector((0.0001, -1, 0.0001)), margin=0.04, ortho=True, res=(RES[1], RES[1]))
        render(os.path.join(OUTD, f'pv-{n}-front.png'))
        frame(pts, Vector((-math.sin(math.radians(35)), math.cos(math.radians(35)), 0.45)), lens=50, margin=0.05)
        render(os.path.join(OUTD, f'pv-{n}-rear.png'))
        frame(pts, Vector((0.0001, 0.0001, 1)), margin=0.04, ortho=True)
        render(os.path.join(OUTD, f'pv-{n}-top.png'))

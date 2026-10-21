// Street props from props.glb (trees, palms, lanterns, café sets, planters, benches…): one InstancedMesh per type,
// refilled with only the instances near the focus point (cheap distance culling, ~25 draw calls in total).
// The shared "toy" material reads a per-face material id from uv.x ((id + 0.5) / 16): foliage sways in the wind,
// lantern glass glows at night, glass gets a cool sheen.
import * as THREE from 'three';
import { loadKit, pieceParts } from '../assets.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const toyUni = { uTime: { value: 0 }, uNight: { value: 0 } };

let toy = null;
export function toyMaterial() {
  if (toy) return toy;
  toy = new THREE.MeshLambertMaterial({ vertexColors: true });
  toy.name = 'toy';
  toy.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = toyUni.uTime; sh.uniforms.uNight = toyUni.uNight;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uTime; varying float vTid; varying float vTy;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vTid = floor(uv.x * 16.0); vTy = position.y;
        if (abs(vTid - 7.0) < 0.5) {
          vec3 ip = vec3(0.0);
          #ifdef USE_INSTANCING
            ip = instanceMatrix[3].xyz;
          #endif
          float h = max(0.0, position.y - 1.2);
          float ph = uTime * 1.6 + ip.x * 0.21 + ip.z * 0.17;
          transformed.x += sin(ph) * 0.035 * h + sin(ph * 2.7 + position.y) * 0.012 * h;
          transformed.z += cos(ph * 0.8) * 0.03 * h;
        }`);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uNight; varying float vTid; varying float vTy;')
      .replace('#include <color_fragment>', `#include <color_fragment>
        if (abs(vTid - 7.0) < 0.5) { float tt = smoothstep(1.5, 7.0, vTy); diffuseColor.rgb *= 0.9 + 0.28 * tt; diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(1.08, 1.06, 0.8), tt * 0.6); }
        if (abs(vTid - 2.0) < 0.5) diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.55, 0.75, 0.9), 0.25);
        if (vTy < 0.6) diffuseColor.rgb *= mix(0.75, 1.0, smoothstep(0.0, 0.6, vTy));`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        if (abs(vTid - 3.0) < 0.5) totalEmissiveRadiance += diffuseColor.rgb * (0.15 + 1.6 * uNight);
        if (abs(vTid - 10.0) < 0.5) totalEmissiveRadiance += diffuseColor.rgb * 0.9;`);
  };
  toy.customProgramCacheKey = () => 'toy1';
  return toy;
}

const BIG = new Set(['tree_round_a', 'tree_round_b', 'tree_round_c', 'palm_a', 'palm_b', 'clock_tower', 'lighthouse', 'ferris_wheel', 'ferris_wheel_rotor']);
const LOD_TYPES = new Set(['tree_round_a', 'tree_round_b', 'tree_round_c', 'palm_a', 'palm_b']);
const SMALL = new Set(['bollard', 'hydrant', 'trash_bin', 'chalkboard', 'bench', 'flower_pot', 'planter', 'street_lamp', 'street_lamp_double']);

// far-away stand-in for a tree: one lumpy blob for the crown (foliage id 7) + a 5-sided trunk, ~100 triangles
const lodCache = new Map();
export function lodGeometry(type) {
  if (lodCache.has(type)) return lodCache.get(type);
  const parts = pieceParts('props', type);
  const g = parts.length ? makeLod(parts[0].geometry) : null;
  lodCache.set(type, g); return g;
}
function makeLod(geo) {
  const pos = geo.attributes.position, uv = geo.attributes.uv, col = geo.attributes.color;
  const fb = new THREE.Box3(), tb = new THREE.Box3(), fc = [0, 0, 0], tc = [0, 0, 0], v = new THREE.Vector3();
  let nf = 0, nt = 0;
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const id = Math.floor(uv.getX(i) * 16);
    const c = col ? [col.getX(i), col.getY(i), col.getZ(i)] : [0.4, 0.6, 0.3];
    if (id === 7) { fb.expandByPoint(v); fc[0] += c[0]; fc[1] += c[1]; fc[2] += c[2]; nf++; } else { tb.expandByPoint(v); tc[0] += c[0]; tc[1] += c[1]; tc[2] += c[2]; nt++; }
  }
  if (!nf) return null;
  const avg = (a, n) => a.map((x) => x / Math.max(1, n));
  const F = avg(fc, nf), Tc = avg(tc, nt);
  const ico = new THREE.IcosahedronGeometry(1, 1);
  const c = new THREE.Vector3(), h = new THREE.Vector3(); fb.getCenter(c); fb.getSize(h).multiplyScalar(0.46);
  const p = ico.attributes.position;
  for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i); const k = 1 + 0.12 * Math.sin(v.x * 5 + v.z * 3); p.setXYZ(i, c.x + v.x * h.x * k, c.y + v.y * h.y * k, c.z + v.z * h.z * k); }
  const cols = [], uvs = [];
  for (let i = 0; i < p.count; i++) { const t = (p.getY(i) - fb.min.y) / Math.max(0.01, fb.max.y - fb.min.y); const k = 0.7 + 0.5 * t; cols.push(F[0] * k, F[1] * k, F[2] * k); uvs.push(7.5 / 16, 0.5); }
  ico.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3)); ico.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  ico.computeVertexNormals();
  const trunkH = Math.max(1, fb.min.y + 0.5);
  const cyl = new THREE.CylinderGeometry(0.16, 0.22, trunkH, 5, 1, true).toNonIndexed(); cyl.translate(0, trunkH / 2, 0);
  const tcol = [], tuv = []; for (let i = 0; i < cyl.attributes.position.count; i++) { tcol.push(Tc[0], Tc[1], Tc[2]); tuv.push(0.5 / 16, 0.5); }
  cyl.setAttribute('color', new THREE.Float32BufferAttribute(tcol, 3)); cyl.setAttribute('uv', new THREE.Float32BufferAttribute(tuv, 2));
  return mergeGeometries([ico, cyl]);
}

export async function createProps(scene, list, { y = 0.2, extra = {} } = {}) {
  await loadKit('props');
  const byType = new Map();
  for (const p of list) { let a = byType.get(p.type); if (!a) byType.set(p.type, (a = [])); a.push(p); }
  const mat = toyMaterial();
  const types = [];
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), sc = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  for (const [type, items] of byType) {
    const ex = extra[type];
    const parts = ex ? [] : pieceParts('props', type);
    if (!parts.length && !ex) { console.warn('prop missing', type); continue; }
    const geo = ex ? ex.geo : parts.length === 1 ? parts[0].geometry : mergeGeometries(parts.map((p) => p.geometry));
    if (!geo) continue;
    const mk = (g) => { const im = new THREE.InstancedMesh(g, ex ? ex.mat : mat, items.length); im.castShadow = true; im.receiveShadow = true; im.frustumCulled = false; im.name = 'props:' + type; im.count = 0; scene.add(im); return im; };
    const im = mk(geo);
    const lodGeo = LOD_TYPES.has(type) ? lodGeometry(type) : null;
    const lod = lodGeo ? mk(lodGeo) : null;
    // precompute matrices
    const mats = items.map((p) => { q.setFromAxisAngle(up, p.rot || 0); v.set(p.x, p.y ?? y, p.z); sc.setScalar(p.s || 1); return m4.compose(v, q, sc).clone(); });
    types.push({ type, items, im, lod, mats, big: BIG.has(type), small: SMALL.has(type) || !!ex });
  }
  let lx = Infinity, lz = Infinity, lr = -1, lfx = 0, lfz = 0;
  const fwd = new THREE.Vector3();
  // Refill the instance buffers with what is near (x, z). With a camera: only what lies roughly in front of it
  // (plus a ring right around it); trees past LOD_D swap to their low-poly stand-ins.
  const LOD_D = 70;
  function update(x, z, radius = 160, camera = null, force = false) {
    let fx = 0, fz = 0;
    if (camera) { camera.getWorldDirection(fwd); const l = Math.hypot(fwd.x, fwd.z) || 1; fx = fwd.x / l; fz = fwd.z / l; }
    if (!force && Math.hypot(x - lx, z - lz) < 3 && radius === lr && fx * lfx + fz * lfz > 0.998) return;
    lx = x; lz = z; lr = radius; lfx = fx; lfz = fz;
    // the cone starts a little behind the camera so wide angles near it are kept
    const ox = x - fx * 12, oz = z - fz * 12;
    const lodD2 = camera ? LOD_D * LOD_D : 30 * 30; // seen from the hub's high camera, low-poly trees are plenty
    for (const t of types) {
      const R = radius * (t.big ? 1.25 : t.small ? 0.55 : 1), R2 = R * R;
      let n = 0, nl = 0;
      for (let i = 0; i < t.items.length; i++) {
        const p = t.items[i], dx = p.x - x, dz = p.z - z, d2 = dx * dx + dz * dz;
        if (d2 > R2) continue;
        if (camera && d2 > 400) { const ex = p.x - ox, ez = p.z - oz; if (ex * fx + ez * fz < 0.55 * Math.hypot(ex, ez)) continue; }
        if (t.lod && d2 > lodD2) t.lod.setMatrixAt(nl++, t.mats[i]);
        else t.im.setMatrixAt(n++, t.mats[i]);
      }
      t.im.count = n; t.im.instanceMatrix.needsUpdate = true; t.im.visible = n > 0;
      if (t.lod) { t.lod.count = nl; t.lod.instanceMatrix.needsUpdate = true; t.lod.visible = nl > 0; }
    }
  }
  return { types, update, setNight: (n) => { toyUni.uNight.value = n; } };
}

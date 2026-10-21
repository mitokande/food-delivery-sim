// Builds the city's three.js meshes from the generator's placements: merged per chunk per material.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { TILE } from '../data.js';
import { K } from './gen.js';
import { loadKit, pieceParts, getNode, texAsync } from '../assets.js';
import { buildArchitecture, refreshSignFont } from './arch.js';
import { archMaterial, archUni } from './archmat.js';

const CHUNK = 9;

// one shared material per (kit, palette) — Kenney kits use a single colormap each
const mats = new Map();
const PALETTE_FOR = { commercial: { oldtown: 'commercial-oldtown', downtown: 'commercial-downtown', harbor: 'commercial-harbor' }, suburban: { hills: 'suburban-hills' }, industrial: { harbor: 'industrial-harbor' }, roads: { '*': 'roads-warm' } };
const paletteTex = {};
export const cityMaterials = mats;

async function loadPalettes() {
  const names = new Set(); for (const k in PALETTE_FOR) for (const d in PALETTE_FOR[k]) names.add(PALETTE_FOR[k][d]);
  await Promise.all([...names].map(async (n) => { paletteTex[n] = await texAsync(`assets/models/tex/${n}.png`); }));
}
// night glow: an emissive mask that lights only the glass (and street-lamp) swatches of each kit palette
const GLOW = {
  commercial: [[352, 128, 32, 128, '#ffd68a']], suburban: [[352, 128, 32, 128, '#ffcf7a']],
  industrial: [[288, 384, 32, 128, '#ffd68a']], roads: [[256, 256, 32, 128, '#fff2c8']],
};
const glowTex = {};
function glowMap(kit) {
  if (glowTex[kit] !== undefined) return glowTex[kit];
  if (!GLOW[kit]) return (glowTex[kit] = null);
  const c = document.createElement('canvas'); c.width = c.height = 512;
  const g = c.getContext('2d'); g.fillStyle = '#000'; g.fillRect(0, 0, 512, 512);
  for (const [x, y, w, h, col] of GLOW[kit]) { g.fillStyle = col; g.fillRect(x, y, w, h); }
  const t = new THREE.CanvasTexture(c); t.flipY = false; t.colorSpace = THREE.SRGBColorSpace;
  return (glowTex[kit] = t);
}
export function setCityNight(n) {
  for (const m of mats.values()) if (m.userData.glow) m.emissiveIntensity = n * m.userData.glow;
  archUni.uNight.value = n;
}
function kitMaterial(kit, district, src) {
  const pal = PALETTE_FOR[kit] && (PALETTE_FOR[kit][district] || PALETTE_FOR[kit]['*']);
  const map = (pal && paletteTex[pal]) || src.map || null;
  const key = kit + '|' + (map ? map.uuid : 'none');
  let m = mats.get(key);
  if (!m) {
    if (map && map !== src.map) { map.flipY = src.map ? src.map.flipY : false; map.colorSpace = THREE.SRGBColorSpace; }
    m = new THREE.MeshLambertMaterial({ map, color: map ? 0xffffff : src.color });
    if (kit === 'roads') streetSurface(m);
    const gm = glowMap(kit);
    if (gm) { m.emissiveMap = gm; m.emissive.set(0xffffff); m.emissiveIntensity = 0; m.userData.glow = kit === 'roads' ? 1.6 : 0.85; }
    m.name = key; mats.set(key, m);
  }
  return m;
}
// Street surfaces in world space: lighter warm asphalt with grain and patches, paving slabs on the sidewalks.
function streetSurface(m) {
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vSWp;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvSWp = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
      varying vec3 vSWp;
      float sh1(vec2 p){ p = fract(p * vec2(233.34, 851.73)); p += dot(p, p + 23.45); return fract(p.x * p.y); }
      float sn1(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 w = f*f*(3.0-2.0*f);
        return mix(mix(sh1(i), sh1(i+vec2(1.0,0.0)), w.x), mix(sh1(i+vec2(0.0,1.0)), sh1(i+vec2(1.0,1.0)), w.x), w.y); }`)
      .replace('#include <map_fragment>', `#include <map_fragment>
      {
        vec3 c = diffuseColor.rgb;
        float lum = dot(c, vec3(0.3, 0.59, 0.11));
        vec2 p = vSWp.xz;
        if (vSWp.y < 0.155 && lum < 0.2) {
          // asphalt: lift and warm the near-black kit colour, add grain + soft repair patches
          float big = sn1(p * 0.09), mid = sn1(p * 0.6), grain = sh1(floor(p * 22.0));
          vec3 a = c * 2.1 + vec3(0.034, 0.036, 0.043);
          a *= 0.9 + big * 0.14 + mid * 0.06 + (grain - 0.5) * 0.08;
          diffuseColor.rgb = a;
        } else if (vSWp.y >= 0.155 && lum > 0.12 && lum < 0.85) {
          // paving slabs: 0.8 m grid, grout lines, per-slab tint
          vec2 g = p / 0.8; vec2 cell = floor(g), f = fract(g);
          float grout = step(f.x, 0.04) + step(f.y, 0.04);
          float t = sh1(cell);
          vec3 pv = c * (0.94 + t * 0.12);
          pv = mix(pv, c * 0.7, clamp(grout, 0.0, 1.0) * 0.6);
          diffuseColor.rgb = pv * (0.96 + sn1(p * 0.3) * 0.08);
        }
      }`);
  };
  m.customProgramCacheKey = () => 'street1';
}
function ownMaterial(src) {
  const key = 'own|' + src.uuid;
  let m = mats.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ map: src.map || null, color: src.color, roughness: Math.max(0.35, src.roughness ?? 0.7), metalness: Math.min(0.3, src.metalness ?? 0),
      emissive: src.emissive, emissiveIntensity: src.emissiveIntensity ?? 1, emissiveMap: src.emissiveMap || null, transparent: src.transparent, opacity: src.opacity });
    m.name = src.name; mats.set(key, m);
  }
  return m;
}
const KIT_SHARED = new Set(['roads', 'commercial', 'suburban', 'industrial']);

export async function buildCityView(city, scene) {
  // which pieces are needed per kit
  const need = {};
  for (const p of city.placements) (need[p.kit] ||= new Set()).add(p.name);
  (need.restaurants ||= new Set()).add('rest-burger'); // rooftop signs
  await Promise.all([loadPalettes(), ...Object.entries(need).map(([kit, set]) => loadKit(kit, [...set]))]);

  const root = new THREE.Group(); root.name = 'city';
  const nC = Math.ceil(city.W / CHUNK);
  const buckets = new Map(); // chunkKey|matKey|flat → {geos:[], mat, flat}
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), sc = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  const missing = new Set();
  for (const p of city.placements) {
    let parts = pieceParts(p.kit, p.name);
    if (!parts.length && p.kit === 'restaurants') parts = pieceParts('commercial', 'building-c');
    if (!parts.length) { missing.add(p.kit + '/' + p.name); continue; }
    const tile = city.tiles[Math.max(0, Math.min(city.W - 1, Math.round(p.z))) * city.W + Math.max(0, Math.min(city.W - 1, Math.round(p.x)))];
    const cx = Math.floor(Math.max(0, Math.min(city.W - 1, p.x)) / CHUNK), cz = Math.floor(Math.max(0, Math.min(city.H - 1, p.z)) / CHUNK);
    q.setFromAxisAngle(up, p.rot);
    v.set(p.x * TILE, p.y * TILE, p.z * TILE);
    sc.set(p.s * TILE, p.s * p.sy * TILE, p.s * TILE);
    m4.compose(v, q, sc);
    const flat = p.cat === 'road' || p.cat === 'ground';
    for (const part of parts) {
      const kitName = getNode(p.kit, p.name) ? p.kit : 'commercial';
      const mat = KIT_SHARED.has(kitName) ? kitMaterial(kitName, tile.d, part.material) : ownMaterial(part.material);
      const key = `${cx},${cz}|${mat.name}|${flat ? 1 : 0}`;
      let b = buckets.get(key);
      if (!b) { b = { geos: [], mat, flat, cx, cz }; buckets.set(key, b); }
      const g = part.geometry.clone(); g.applyMatrix4(m4);
      b.geos.push(g);
    }
  }
  if (missing.size) console.warn('missing pieces', [...missing]);
  const chunks = [];
  for (let z = 0; z < nC; z++) for (let x = 0; x < nC; x++) { const g = new THREE.Group(); g.name = `chunk${x},${z}`; chunks.push(g); root.add(g); }
  let tris = 0;
  for (const b of buckets.values()) {
    const hasColor = b.geos.some((g) => g.attributes.color);
    if (hasColor) for (const g of b.geos) if (!g.attributes.color) { const n = g.attributes.position.count; const c = new Float32Array(n * 3).fill(1); g.setAttribute('color', new THREE.BufferAttribute(c, 3)); }
    const merged = mergeGeometries(b.geos, false);
    if (!merged) { console.warn('merge failed', b.mat.name); continue; }
    merged.computeBoundingSphere(); merged.computeBoundingBox();
    tris += merged.index ? merged.index.count / 3 : merged.attributes.position.count / 3;
    let mat = b.mat;
    if (hasColor && !mat.vertexColors) { mat = mat.clone(); mat.vertexColors = true; }
    const mesh = new THREE.Mesh(merged, mat);
    mesh.receiveShadow = true; mesh.castShadow = !b.flat;
    mesh.matrixAutoUpdate = false;
    chunks[b.cz * nC + b.cx].add(mesh);
    for (const g of b.geos) g.dispose();
  }
  // procedural buildings: shells/roofs per chunk (any distance) + dressing per chunk (culled nearer)
  const arch = buildArchitecture(city);
  const am = archMaterial(); mats.set('arch', am);
  for (const c of arch.chunks) {
    const ch = chunks[c.cz * nC + c.cx];
    if (c.base) { const m = new THREE.Mesh(c.base, am); m.castShadow = m.receiveShadow = true; m.matrixAutoUpdate = false; ch.add(m); tris += c.base.index.count / 3; }
    if (c.detail) { const m = new THREE.Mesh(c.detail, am); m.castShadow = m.receiveShadow = true; m.matrixAutoUpdate = false; ch.add(m); ch.userData.detail = m; tris += c.detail.index.count / 3; }
  }
  if (arch.far) { const m = new THREE.Mesh(arch.far, am); m.receiveShadow = true; m.matrixAutoUpdate = false; m.name = 'outskirts-far'; root.add(m); }
  refreshSignFont();
  if (arch.signText) { const m = new THREE.Mesh(arch.signText.geo, new THREE.MeshLambertMaterial({ map: arch.signText.tex })); m.name = 'road-signs'; m.matrixAutoUpdate = false; root.add(m); }
  root.add(buildRoofSigns(city, arch));
  root.add(buildGround(city));
  root.add(buildLampPools(city, arch));
  root.add(buildWater(city));
  scene.add(root);
  return { root, chunks, tris, nC, arch };
}

// grass / paving underlay + park lawns
function buildGround(city) {
  const g = new THREE.Group();
  const W = city.W * TILE, H = city.H * TILE;
  // grass out to the hills; it stops at the quay so the bay shows
  const south = H - TILE / 2 + 1, north = -1700;
  const base = new THREE.Mesh(new THREE.PlaneGeometry(W + 3400, south - north), new THREE.MeshLambertMaterial({ color: 0x9cc566 }));
  base.rotation.x = -Math.PI / 2; base.position.set(W / 2 - TILE / 2, -0.05, (south + north) / 2);
  base.receiveShadow = true; g.add(base);
  // lawn tiles: parks, hills lots/yards
  const lawn = [];
  const quad = new THREE.PlaneGeometry(TILE, TILE); quad.rotateX(-Math.PI / 2);
  for (const t of city.tiles) {
    const isLawn = t.k === K.PARK || (t.k === K.ALLEY && t.style === 'park') || (t.d === 'hills' && (t.k === K.LOT || t.k === K.YARD));
    if (!isLawn) continue;
    const q = quad.clone(); q.translate(t.x * TILE, 0.02, t.z * TILE); lawn.push(q);
  }
  if (lawn.length) {
    const m = new THREE.Mesh(mergeGeometries(lawn), new THREE.MeshStandardMaterial({ color: 0x8fca5a, roughness: 1 }));
    m.receiveShadow = true; g.add(m);
  }
  return g;
}

// sea south of the city
function buildWater(city) {
  const W = city.W * TILE;
  const geo = new THREE.PlaneGeometry(W + 2400, 1400, 1, 1); geo.rotateX(-Math.PI / 2);
  const mat = new THREE.MeshStandardMaterial({ color: 0x3fa7c9, roughness: 0.25, metalness: 0.1, transparent: true, opacity: 0.95 });
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = waterTime;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWp;').replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWp = (modelMatrix * vec4(transformed,1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vWp; uniform float uTime;')
      .replace('#include <color_fragment>', `#include <color_fragment>
        float w = sin(vWp.x*0.08 + uTime*0.9) * sin(vWp.z*0.11 - uTime*0.7) + 0.5*sin(vWp.x*0.23 - vWp.z*0.17 + uTime*1.7);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.75,0.93,1.0), smoothstep(0.85, 1.4, w) * 0.55);
        float shore = smoothstep(${(city.H * TILE - TILE * 0.5 + 40).toFixed(1)}, ${(city.H * TILE - TILE * 0.5).toFixed(1)}, vWp.z);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.55,0.85,0.9), shore*0.6);`);
  };
  const m = new THREE.Mesh(geo, mat);
  m.position.set(W / 2, -0.6, city.H * TILE - TILE / 2 + 700 + 6);
  m.receiveShadow = true;
  // quay wall along the south edge
  const quay = new THREE.Mesh(new THREE.BoxGeometry(W + 2400, 2, 12), new THREE.MeshLambertMaterial({ color: 0xd6c6a6 }));
  quay.position.set(W / 2, -1.02, city.H * TILE - TILE / 2 + 6.2); // top just under the road, starting at the sidewalk edge
  const grp = new THREE.Group(); grp.add(m, quay);
  return grp;
}
export const waterTime = { value: 0 };

// cull chunks by distance (cheap LOD for the ride camera)
export function cullChunks(view, x, z, radius, detailR = 170) {
  const nC = view.nC, cs = CHUNK * TILE;
  for (let cz = 0; cz < nC; cz++) for (let cx = 0; cx < nC; cx++) {
    const ch = view.chunks[cz * nC + cx];
    const mx = (cx + 0.5) * cs - TILE / 2, mz = (cz + 0.5) * cs - TILE / 2;
    const d = Math.hypot(mx - x, mz - z) - cs * 0.71;
    ch.visible = radius == null || d < radius;
    if (ch.userData.detail) ch.userData.detail.visible = radius == null || d < detailR;
  }
}

// restaurants / garage / office: the giant food (or brand) sign from restaurants.glb on the roof or facade
function buildRoofSigns(city, arch) {
  const g = new THREE.Group(); g.name = 'signs';
  for (const s of arch.signs) {
    const node = getNode('restaurants', s.model);
    const src = node && (node.getObjectByName(s.model + '-sign'));
    if (!src) continue;
    const o = src.clone(true);
    o.position.set(0, 0, 0); o.rotation.set(0, 0, 0);
    o.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
    const holder = new THREE.Group();
    holder.add(o);
    const k = s.facade ? TILE : TILE * 0.85;
    holder.scale.setScalar(k);
    holder.position.set(s.x, s.y + (s.facade ? 0 : 0.5), s.z);
    holder.rotation.y = s.rot;
    if (s.facade) o.position.z = -0.14; // the board's back sits on the wall
    g.add(holder);
  }
  return g;
}

// soft warm pools of light under street lamps (visible at night only)
export const lampUni = { uNight: { value: 0 } };
function buildLampPools(city, arch) {
  const lamps = arch.props.filter((p) => p.lamp);
  const geo = new THREE.PlaneGeometry(9, 9); geo.rotateX(-Math.PI / 2);
  const mat = new THREE.ShaderMaterial({
    uniforms: lampUni, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0); }',
    fragmentShader: 'uniform float uNight; varying vec2 vUv; void main(){ float d = length(vUv - 0.5) * 2.0; float a = pow(max(0.0, 1.0 - d), 1.6) * 0.95 * uNight; gl_FragColor = vec4(1.0, 0.78, 0.45, 1.0) * a; }',
  });
  const im = new THREE.InstancedMesh(geo, mat, lamps.length);
  const m4 = new THREE.Matrix4();
  lamps.forEach((p, i) => {
    m4.makeTranslation(p.x, 0.15, p.z); im.setMatrixAt(i, m4);
  });
  im.frustumCulled = false; im.renderOrder = 1;
  return im;
}

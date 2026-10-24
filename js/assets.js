// Asset loading: packed kit GLBs (fallback: raw Kenney pieces), characters, vehicles, textures.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { clone as skClone } from 'three/addons/utils/SkeletonUtils.js';

const draco = new DRACOLoader().setDecoderPath('https://cdn.jsdelivr.net/npm/three@0.186.1/examples/jsm/libs/draco/gltf/');
const loader = new GLTFLoader().setDRACOLoader(draco);
const texLoader = new THREE.TextureLoader();

const PACKED = {
  roads: 'assets/models/kit-roads.glb', commercial: 'assets/models/kit-commercial.glb', suburban: 'assets/models/kit-suburban.glb',
  industrial: 'assets/models/kit-industrial.glb', cars: 'assets/models/kit-cars.glb', food: 'assets/models/kit-food.glb',
  restaurants: 'assets/models/restaurants.glb', vehicles: 'assets/models/vehicles.glb', props: 'assets/models/props.glb', toycars: 'assets/models/cars.glb',
};
const RAW = {
  roads: 'kenney_city-kit-roads', commercial: 'kenney_city-kit-commercial_2.1', suburban: 'kenney_city-kit-suburban_20',
  industrial: 'kenney_city-kit-industrial_2.0', cars: 'kenney_car-kit', food: 'kenney_food-kit',
};
export const CHAR_URL = (id) => `assets/models/chars/character-${id}.glb`;
const CHAR_RAW = (id) => `assets/src/kenney/kenney_mini-characters/Models/GLB%20format/character-${id}.glb`;

const kits = {}; // kit → Map(name → Object3D)
const pieceCache = new Map(); // 'kit/name' → [{geometry, material}] baked
export const stats = { loaded: 0, total: 0 };
let onProgress = () => {};
export const setProgress = (fn) => (onProgress = fn);
const tick = () => { stats.loaded++; onProgress(stats.loaded / Math.max(1, stats.total)); };

async function exists(url) {
  try { const r = await fetch(url, { method: 'HEAD' }); return r.ok; } catch { return false; }
}

// Load a kit. `names` = pieces needed (only used for the raw fallback).
export async function loadKit(kit, names = []) {
  if (kits[kit]) return kits[kit];
  const map = new Map();
  let packed = null;
  if (PACKED[kit]) { stats.total++; try { packed = await loader.loadAsync(PACKED[kit]); } catch (e) { packed = null; } tick(); }
  if (packed) {
    for (const c of [...packed.scene.children]) map.set(c.name, c);
  } else if (RAW[kit]) {
    stats.total += names.length;
    await Promise.all(names.map(async (n) => {
      try {
        const g = await loader.loadAsync(`assets/src/kenney/${RAW[kit]}/Models/GLB%20format/${n}.glb`);
        g.scene.name = n; map.set(n, g.scene);
      } catch (e) { console.warn('missing piece', kit, n); }
      tick();
    }));
  }
  kits[kit] = map;
  return map;
}
export const hasKit = (kit) => !!kits[kit] && kits[kit].size > 0;
export const getNode = (kit, name) => kits[kit]?.get(name) || null;

// Flatten a piece into [{geometry, material}] with transforms baked relative to its root.
export function pieceParts(kit, name) {
  const key = kit + '/' + name;
  if (pieceCache.has(key)) return pieceCache.get(key);
  const root = getNode(kit, name);
  const parts = [];
  if (root) {
    const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
    root.updateMatrixWorld(true);
    inv.copy(root.matrixWorld).invert();
    root.traverse((o) => {
      if (!o.isMesh) return;
      const m = new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld);
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      if (mats.length > 1 && o.geometry.groups.length) {
        for (const gr of o.geometry.groups) {
          const g = sub(o.geometry, gr.start, gr.count); g.applyMatrix4(m); parts.push({ geometry: normalize(g), material: mats[gr.materialIndex] });
        }
      } else {
        const g = o.geometry.clone(); g.applyMatrix4(m); parts.push({ geometry: normalize(g), material: mats[0] });
      }
    });
  }
  pieceCache.set(key, parts);
  return parts;
}
function sub(geo, start, count) {
  const g = new THREE.BufferGeometry();
  for (const k in geo.attributes) g.setAttribute(k, geo.attributes[k]);
  const idx = geo.index.array.slice(start, start + count);
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  return g;
}
// keep position/normal/uv (+color if present), make indexed, so geometries merge cleanly
export function normalize(g) {
  for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv', 'color'].includes(k)) g.deleteAttribute(k);
  if (!g.attributes.normal) g.computeVertexNormals();
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
  if (!g.index) { const n = g.attributes.position.count; const a = n > 65535 ? new Uint32Array(n) : new Uint16Array(n); for (let i = 0; i < n; i++) a[i] = i; g.setIndex(new THREE.BufferAttribute(a, 1)); }
  return g;
}

// ---- characters (skinned, animated) ----
const charCache = new Map();
export async function loadChar(id) {
  if (charCache.has(id)) return charCache.get(id);
  const p = (async () => {
    let g;
    try { g = await loader.loadAsync(CHAR_URL(id)); } catch { g = await loader.loadAsync(CHAR_RAW(id)); }
    g.scene.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.frustumCulled = false; } });
    // walking with something in both hands: legs from 'walk', arms from the 'holding-both' pose
    const walk = g.animations.find((a) => a.name === 'walk'), hold = g.animations.find((a) => a.name === 'holding-both');
    if (walk && hold) {
      const arms = new Set(hold.tracks.map((t) => t.name));
      g.animations.push(new THREE.AnimationClip('walk-hold', walk.duration, [...walk.tracks.filter((t) => !arms.has(t.name)), ...hold.tracks]));
    }
    return { scene: g.scene, clips: g.animations };
  })();
  charCache.set(id, p);
  p.catch(() => charCache.delete(id)); // a failed download is tried again next time
  return p;
}
export async function makeChar(id) {
  const c = await loadChar(id);
  const obj = skClone(c.scene);
  const mixer = new THREE.AnimationMixer(obj);
  const actions = {};
  for (const clip of c.clips) actions[clip.name] = mixer.clipAction(clip);
  let cur = null;
  const play = (name, fade = 0.2, { once = false, speed = 1 } = {}) => {
    const a = actions[name]; if (!a || a === cur) return a;
    a.reset(); a.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat); a.clampWhenFinished = once; a.timeScale = speed;
    if (cur) cur.crossFadeTo(a, fade, false); a.play();
    cur = a; return a;
  };
  let head = null; obj.traverse((o) => { if (o.isBone && o.name === 'head') head = o; });
  return { obj, mixer, actions, play, head };
}

// ---- textures ----
const texCache = new Map();
export function tex(url, { srgb = true, nearest = false } = {}) {
  if (texCache.has(url)) return texCache.get(url);
  const t = texLoader.load(url);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.flipY = false;
  if (nearest) { t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestMipmapNearestFilter; }
  texCache.set(url, t);
  return t;
}
export async function texAsync(url, opts = {}) {
  if (texCache.has(url)) return texCache.get(url);
  try {
    const t = await texLoader.loadAsync(url);
    if (opts.srgb !== false) t.colorSpace = THREE.SRGBColorSpace;
    t.flipY = false;
    texCache.set(url, t);
    return t;
  } catch { return null; }
}

export { loader, THREE };

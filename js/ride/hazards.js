// Things on the road during a delivery: potholes, puddles, cones, barriers, double-parked cars,
// jaywalkers, cash and energy pickups. Spawning (pure-ish) + simple visuals.
import * as THREE from 'three';
import { pieceParts, makeChar } from '../assets.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { TILE } from '../data.js';
import { CAR_SCALE } from '../city/traffic.js';
import { pick } from '../rng.js';

export const HZ = {
  pothole: { hop: true, block: false, dmg: 11, slow: 0.65, sfx: 'bump', label: 'Pothole' },
  puddle: { hop: true, block: false, dmg: 4, slow: 0.8, sfx: 'splash', label: 'Puddle' },
  cones: { hop: true, block: true, dmg: 8, len: 3, label: 'Cones' },
  barrier: { hop: true, block: true, dmg: 12, len: 2, label: 'Road works' },
  parked: { hop: false, block: true, len: 4.4, overtake: true, label: 'Double-parked' },
  ped: { hop: false, block: true, horn: true, label: 'Jaywalker' },
  crates: { hop: true, block: true, dmg: 10, len: 1.5, label: 'Crates' },
  cash: { pickup: true },
  energy: { pickup: true },
};
const MIX = {
  oldtown: [['pothole', 3], ['puddle', 2], ['cones', 1], ['parked', 2], ['ped', 2], ['cash', 2.5], ['energy', 1]],
  downtown: [['parked', 3], ['cones', 2], ['ped', 2.5], ['pothole', 1], ['cash', 2], ['energy', 1], ['barrier', 1]],
  harbor: [['pothole', 3], ['barrier', 2], ['puddle', 2], ['cash', 2], ['parked', 1], ['energy', 1]],
  hills: [['puddle', 2], ['pothole', 1.5], ['cash', 3], ['energy', 1.2], ['ped', 1], ['cones', 0.6]],
};
const pickW = (rng, list) => { let t = 0; for (const [, w] of list) t += w; let r = rng() * t; for (const [k, w] of list) { r -= w; if (r <= 0) return k; } return list[0][0]; };

// choose hazards along a route (s positions in metres)
export function planHazards(route, city, rng, { density = 1, startS = 0, tutorial = false } = {}) {
  const out = [];
  let lastS = startS + 26;
  for (let k = 1; k < route.steps.length - 1; k++) {
    const st = route.steps[k];
    const t = city.tiles[st.tile];
    if (st.alley) {
      if (rng() < 0.45 * density) out.push({ type: 'crates', s: st.s0 + st.c.len * 0.5, lane: 0, tile: st.tile });
      continue;
    }
    if (st.din !== st.dout || t.junction) continue;
    const s = st.s0 + st.c.len * (0.3 + rng() * 0.4);
    if (s - lastS < 24 || route.length - s < 26) continue;
    if (rng() > 0.42 * density) continue;
    let type = pickW(rng, MIX[t.d] || MIX.oldtown);
    if (tutorial && !['pothole', 'cash', 'parked'].includes(type)) type = 'pothole';
    const lane = (type === 'cash' || type === 'energy') && rng() < 0.35 ? -1 : 1;
    out.push({ type, s, lane, tile: st.tile });
    lastS = s;
  }
  return out;
}

// ---- visuals ----
const M = {
  pothole: new THREE.MeshStandardMaterial({ color: 0x2b2a2e, roughness: 1, polygonOffset: true, polygonOffsetFactor: -2 }),
  rim: new THREE.MeshStandardMaterial({ color: 0x55525a, roughness: 1, polygonOffset: true, polygonOffsetFactor: -1 }),
  puddle: new THREE.MeshStandardMaterial({ color: 0x6fb6e6, roughness: 0.05, metalness: 0.2, transparent: true, opacity: 0.75, polygonOffset: true, polygonOffsetFactor: -2 }),
  cash: new THREE.MeshStandardMaterial({ color: 0x5fcf4a, roughness: 0.5, emissive: 0x1f6a12, emissiveIntensity: 0.6 }),
  band: new THREE.MeshStandardMaterial({ color: 0xf2e7c4, roughness: 0.6 }),
  energy: new THREE.MeshStandardMaterial({ color: 0x3fa9ff, roughness: 0.3, metalness: 0.4, emissive: 0x0b4a8a, emissiveIntensity: 0.6 }),
  ring: new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.6, depthWrite: false }),
  hazard: new THREE.MeshBasicMaterial({ color: 0xffa21f, toneMapped: false }),
  crate: new THREE.MeshStandardMaterial({ color: 0xb98a55, roughness: 0.9 }),
};
const geo = {
  hole: (() => { const g = new THREE.CircleGeometry(0.85, 14); g.rotateX(-Math.PI / 2); g.scale(1.2, 1, 0.8); return g; })(),
  rim: (() => { const g = new THREE.RingGeometry(0.85, 1.05, 14); g.rotateX(-Math.PI / 2); g.scale(1.2, 1, 0.8); return g; })(),
  puddle: (() => { const g = new THREE.CircleGeometry(1.4, 18); g.rotateX(-Math.PI / 2); g.scale(1.3, 1, 0.8); return g; })(),
  bill: new THREE.BoxGeometry(0.9, 0.32, 0.5),
  band: new THREE.BoxGeometry(0.18, 0.34, 0.52),
  can: new THREE.CylinderGeometry(0.28, 0.28, 0.7, 14),
  ring: (() => { const g = new THREE.RingGeometry(0.8, 0.95, 24); g.rotateX(-Math.PI / 2); return g; })(),
  crate: new THREE.BoxGeometry(0.8, 0.8, 0.8),
  light: new THREE.BoxGeometry(0.18, 0.1, 0.06),
};
let carGeo = null;
function parkedGeo(type) {
  carGeo ||= {};
  if (carGeo[type]) return carGeo[type];
  const parts = pieceParts('cars', type);
  if (!parts.length) return null;
  const g = mergeGeometries(parts.map((p) => p.geometry.clone()));
  g.scale(CAR_SCALE, CAR_SCALE, CAR_SCALE); g.computeBoundingBox(); g.translate(0, -g.boundingBox.min.y, 0);
  carGeo[type] = { g, mat: new THREE.MeshStandardMaterial({ map: parts[0].material.map, roughness: 0.55 }) };
  return carGeo[type];
}
const pedPool = [];
export async function warmPeds() {
  if (pedPool.length) return;
  for (const id of ['male-c', 'female-d', 'male-e']) { const c = await makeChar(id); c.obj.scale.setScalar(2.2); pedPool.push({ c, busy: false }); }
}

export function makeHazardMesh(h) {
  const g = new THREE.Group();
  switch (h.type) {
    case 'pothole': g.add(new THREE.Mesh(geo.hole, M.pothole), new THREE.Mesh(geo.rim, M.rim)); g.position.y = 0.13; break;
    case 'puddle': g.add(new THREE.Mesh(geo.puddle, M.puddle)); g.position.y = 0.13; break;
    case 'cones': {
      const p = pieceParts('cars', 'cone')[0];
      for (let i = 0; i < 3; i++) { const m = new THREE.Mesh(p ? p.geometry : geo.can, p ? p.material : M.hazard); m.scale.setScalar(p ? 2.4 : 1); m.position.set((i - 1) * 0.9, 0, (i % 2) * 0.6 - 0.3); m.castShadow = true; g.add(m); }
      break;
    }
    case 'barrier': {
      const parts = pieceParts('roads', 'construction-barrier');
      for (const pt of parts) for (let i = -1; i <= 1; i += 2) { const m = new THREE.Mesh(pt.geometry, pt.material); m.scale.setScalar(TILE * 1.1); m.rotation.y = Math.PI / 2; m.position.x = i * 0.9; m.castShadow = true; g.add(m); }
      const l = new THREE.Mesh(geo.light, M.hazard); l.position.set(0, 1.5, 0); g.add(l); h.blink = [l];
      break;
    }
    case 'crates': for (let i = 0; i < 3; i++) { const m = new THREE.Mesh(geo.crate, M.crate); m.position.set((i - 1) * 0.6, 0.4 + (i === 1 ? 0.75 : 0), (i % 2) * 0.3); m.rotation.y = i * 0.4; m.castShadow = true; g.add(m); } break;
    case 'parked': {
      const t = pick(Math.random, ['van', 'delivery', 'sedan', 'taxi']);
      const c = parkedGeo(t);
      if (c) { const m = new THREE.Mesh(c.g, c.mat); m.castShadow = true; g.add(m); }
      h.blink = [];
      for (const [x, z] of [[-0.8, 2.2], [0.8, 2.2], [-0.8, -2.2], [0.8, -2.2]]) { const l = new THREE.Mesh(geo.light, M.hazard); l.position.set(x, 1.0, z); g.add(l); h.blink.push(l); }
      break;
    }
    case 'cash': {
      const s = new THREE.Group();
      s.add(new THREE.Mesh(geo.bill, M.cash)); const b = new THREE.Mesh(geo.band, M.band); s.add(b);
      s.position.y = 1.1; g.add(s); h.spin = s;
      const r = new THREE.Mesh(geo.ring, M.ring); r.position.y = 0.05; g.add(r);
      break;
    }
    case 'energy': {
      const s = new THREE.Mesh(geo.can, M.energy); s.position.y = 1.1; g.add(s); h.spin = s;
      const r = new THREE.Mesh(geo.ring, M.ring); r.position.y = 0.05; g.add(r);
      break;
    }
    case 'ped': {
      const p = pedPool.find((x) => !x.busy);
      if (p) { p.busy = true; h.ped = p; p.c.play('walk'); g.add(p.c.obj); p.c.obj.position.set(0, 0.05, 0); }
      break;
    }
  }
  if (g.position.y === 0) g.position.y = 0.1; // asphalt top
  return g;
}
export function freeHazard(h) {
  if (h.ped) { h.ped.busy = false; h.ped.c.obj.removeFromParent(); h.ped = null; }
  h.obj?.removeFromParent();
}

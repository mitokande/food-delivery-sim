// Ambient traffic on the road graph: cars (instanced), traffic lights, pedestrians on sidewalks.
// The player bike and fleet couriers register as agents too, so cars queue behind them.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { TILE, DISTRICT } from '../data.js';
import { DIRS, OPP, RIGHT, LEFT, K } from './gen.js';
import { laneCurve, sampleCurve, LANE } from './graph.js';
import { makeChar } from '../assets.js';
import { loadCars, carModel, PAINTS } from './cars.js';
import { mulberry32, pick } from '../rng.js';

export const CAR_TYPES = ['sedan', 'taxi', 'hatchback-sports', 'compact', 'suv', 'van', 'sedan-sports', 'suv-luxury', 'police', 'delivery', 'truck', 'garbage-truck', 'ambulance'];
const CAR_W = { sedan: 9, taxi: 6, 'hatchback-sports': 6, compact: 6, suv: 5, van: 4, 'sedan-sports': 3, 'suv-luxury': 3, police: 1.5, delivery: 2, truck: 1.5, 'garbage-truck': 0.7, ambulance: 0.6 };
export { CAR_SCALE } from './cars.js';

// light cycle (s): NS green, NS yellow, EW green, EW yellow
const CYCLE = 17, G = 7, Y = 1.5;
export function lightState(light, t, dir) {
  const c = ((t + light.phase) % CYCLE + CYCLE) % CYCLE;
  const ns = dir === 0 || dir === 2;
  if (ns) return c < G ? 'g' : c < G + Y ? 'y' : 'r';
  return c < G + Y ? 'r' : c < 2 * G + Y ? 'g' : c < CYCLE ? 'y' : 'r';
}

export async function createTraffic(city, scene, { seed = 99 } = {}) {
  const rng = mulberry32(seed);
  await loadCars(CAR_TYPES);
  const lightAt = new Map(); for (const l of city.lights) lightAt.set(l.tile, l);

  // ---- instanced car meshes (paint per instance) ----
  const meshes = {};
  const MAX = 40;
  for (const type of CAR_TYPES) {
    const cm = carModel(type);
    if (!cm) continue;
    const im = new THREE.InstancedMesh(cm.geo, cm.mat, MAX);
    im.count = 0; im.castShadow = true; im.receiveShadow = true; im.frustumCulled = false;
    im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    for (let i = 0; i < MAX; i++) im.setColorAt(i, PAINTS[0]);
    scene.add(im);
    meshes[type] = { im, len: Math.max(3.2, cm.len) };
  }

  // ---- signal lamps: red / yellow / green per junction approach, in front of the lenses of props.glb's traffic_light ----
  const LENS = [3.61, 3.30, 2.99]; // r, y, g centre heights (m); lenses at local x -0.92, z 0.15 (facing +Z)
  const bulbGeo = new THREE.CircleGeometry(0.11, 12); // a disc in front of each lens, seen only from the front
  const bulbs = new THREE.InstancedMesh(bulbGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }), Math.max(1, city.lights.length * 12));
  const bulbInfo = [];
  {
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), one = new THREE.Vector3(1, 1, 1), p = new THREE.Vector3();
    let n = 0;
    for (const l of city.lights) {
      const t = city.tiles[l.tile];
      for (let d = 0; d < 4; d++) {
        // approach heading d enters from the OPP(d) side; the signal stands on the far-right corner, facing the driver
        const f = DIRS[d], r = DIRS[RIGHT(d)];
        if (!(t.mask & (1 << OPP(d)))) continue;
        const rot = [Math.PI, Math.PI / 2, 0, -Math.PI / 2][OPP(d)], lx = -0.92, lz = 0.2;
        const x = (t.x + (f[0] + r[0]) * 0.46) * TILE + lx * Math.cos(rot) + lz * Math.sin(rot);
        const z = (t.z + (f[1] + r[1]) * 0.46) * TILE - lx * Math.sin(rot) + lz * Math.cos(rot);
        q.setFromAxisAngle(up, rot);
        for (let k = 0; k < 3; k++) { m.compose(p.set(x, LENS[k] + 0.2, z), q, one); bulbs.setMatrixAt(n, m); bulbInfo.push({ light: l, d, k }); n++; }
      }
    }
    bulbs.count = n; bulbs.frustumCulled = false; bulbs.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(Math.max(1, n) * 3), 3);
    scene.add(bulbs);
  }
  const COL = { g: new THREE.Color(0x46ff6a), y: new THREE.Color(0xffc23a), r: new THREE.Color(0xff3b30) };
  const OFF = [new THREE.Color(0x3a0d0b), new THREE.Color(0x3a2a08), new THREE.Color(0x0b3312)];
  const KEY = ['r', 'y', 'g'];

  // ---- agents ----
  const agents = [];
  const byTile = new Map();
  const roadTiles = city.tiles.filter((t) => t.k === K.ROAD);
  const straight = roadTiles.filter((t) => t.piece === 'straight');
  const exitsOf = (t, din) => { const out = []; for (let d = 0; d < 4; d++) if (t.mask & (1 << d) && d !== OPP(din)) out.push(d); return out.length ? out : [OPP(din)]; };
  const chooseExit = (t, din) => {
    const ex = exitsOf(t, din);
    if (ex.includes(din) && rng() < 0.55) return din;
    return pick(rng, ex);
  };
  function placeAgent(a, tile, din, dout, s) {
    a.tile = tile; a.din = din; a.dout = dout; a.s = s;
    a.curve = laneCurve(din, dout, 'full', a.off ?? LANE);
    const t = city.tiles[tile]; a.cx = t.x * TILE; a.cz = t.z * TILE;
  }
  function spawnCar(type, district) {
    const cand = district ? straight.filter((t) => t.d === district) : straight;
    const t = pick(rng, cand);
    const dirs = [0, 1, 2, 3].filter((d) => t.mask & (1 << d));
    const din = pick(rng, dirs);
    const a = { kind: 'car', type, v: 0, vmax: 8 + rng() * 3.5, len: meshes[type]?.len || 4.2, pos: [0, 0, 0], off: LANE, id: agents.length, paint: PAINTS[Math.floor(rng() * PAINTS.length)] };
    placeAgent(a, t.i, din, din, rng() * 8);
    agents.push(a);
    return a;
  }
  // density by district
  for (const t of CAR_TYPES) if (!meshes[t]) continue;
  const total = 46;
  for (let i = 0; i < total; i++) {
    const d = pick(rng, ['oldtown', 'downtown', 'downtown', 'harbor', 'hills', 'oldtown', 'downtown', 'harbor']);
    let type = 'sedan'; { let sum = 0; for (const k in CAR_W) sum += CAR_W[k]; let r = rng() * sum; for (const k in CAR_W) { r -= CAR_W[k]; if (r <= 0) { type = k; break; } } }
    if (d === 'harbor' && rng() < 0.4) type = pick(rng, ['truck', 'delivery', 'van']);
    if (meshes[type]) spawnCar(type, d);
  }

  let time = 0;
  const tmp = [0, 0, 0];

  // look-ahead: distance to the nearest agent ahead in the same lane (up to 2 tiles ahead)
  function leaderGap(a) {
    let best = Infinity, who = null;
    const here = byTile.get(a.tile);
    if (here) for (const b of here) if (b !== a && b.din === a.din && b.s > a.s && Math.sign(b.off) === Math.sign(a.off)) {
      const g = b.s - a.s - (a.len + b.len) / 2; if (g < best) { best = g; who = b; }
    }
    if (who) return { gap: best, who };
    let dist = a.curve.len - a.s, tile = a.tile, dir = a.dout;
    for (let k = 0; k < 2; k++) {
      const nt = city.tiles[tile].x + DIRS[dir][0] + (city.tiles[tile].z + DIRS[dir][1]) * city.W;
      const list = byTile.get(nt);
      if (list) for (const b of list) if (b !== a && b.din === dir && Math.sign(b.off) === Math.sign(a.off)) { const g = dist + b.s - (a.len + b.len) / 2; if (g < best) { best = g; who = b; } }
      if (who) return { gap: best, who };
      const t = city.tiles[nt]; if (!t) break;
      dist += TILE; tile = nt;
      dir = (k === 0 && a.next != null) ? a.next : dir;
    }
    return { gap: best, who: null };
  }

  function stopDist(a) {
    // distance to the stop line if the junction ahead shows red/yellow for us
    const t = city.tiles[a.tile];
    const nt = city.tiles[t.i + DIRS[a.dout][0] + DIRS[a.dout][1] * city.W];
    if (!nt) return Infinity;
    const L = lightAt.get(nt.i);
    if (!L) return Infinity;
    const st = lightState(L, time, a.dout);
    const remain = a.curve.len - a.s - 0.6;
    if (st === 'g') return Infinity;
    if (st === 'y' && remain < a.v * 0.9) return Infinity; // too close to stop: go
    return remain;
  }

  // things off the road graph (the player riding freely): a car brakes for one that's in its path
  const blockers = [];
  function blockerGap(a) {
    let best = Infinity;
    const h = a.pos[2], fx = Math.sin(h), fz = Math.cos(h);
    for (const b of blockers) {
      const dx = b.x - a.pos[0], dz = b.z - a.pos[1];
      const lon = dx * fx + dz * fz;
      if (lon < 0 || lon > 40 || Math.abs(dx * fz - dz * fx) > 1.15 + b.r) continue;
      best = Math.min(best, lon - a.len / 2 - b.r);
    }
    return best;
  }

  function stepAgent(a, dt) {
    if (a.kind === 'player' || a.kind === 'parked') return; // the ride controller moves the player
    const { gap } = leaderGap(a);
    const sd = Math.min(stopDist(a), blockers.length ? blockerGap(a) - 1.2 : Infinity);
    let target = a.vmax;
    if (a.curve.turn) target = Math.min(target, Math.sqrt(7 * a.curve.radius));
    else {
      // pre-brake for a turn in the next tile
      if (a.next != null && a.next !== a.dout) { const r = a.next === RIGHT(a.dout) ? TILE / 2 - LANE : TILE / 2 + LANE; const vt = Math.sqrt(7 * r); const d = a.curve.len - a.s; target = Math.min(target, Math.sqrt(vt * vt + 2 * 5 * Math.max(0, d))); }
    }
    const g = Math.min(gap - 2.2, sd);
    if (g < 40) target = Math.min(target, Math.sqrt(2 * 5.5 * Math.max(0, g)));
    if (a.wait > 0) { a.wait -= dt; target = 0; }
    const acc = target > a.v ? 2.6 : 9;
    a.v += Math.sign(target - a.v) * Math.min(Math.abs(target - a.v), acc * dt);
    a.s += a.v * dt;
    while (a.s >= a.curve.len) {
      const over = a.s - a.curve.len;
      const t = city.tiles[a.tile];
      const ni = t.i + DIRS[a.dout][0] + DIRS[a.dout][1] * city.W;
      const nt = city.tiles[ni];
      const din = a.dout;
      const dout = a.next != null ? a.next : chooseExit(nt, din);
      placeAgent(a, ni, din, dout, over);
      const nn = city.tiles[ni + DIRS[dout][0] + DIRS[dout][1] * city.W];
      a.next = nn && nn.k === K.ROAD ? chooseExit(nn, dout) : null;
    }
  }

  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), v3 = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1);
  function update(dt, focus) {
    time += dt;
    byTile.clear();
    for (const a of agents) { let l = byTile.get(a.tile); if (!l) byTile.set(a.tile, (l = [])); l.push(a); }
    for (const a of agents) stepAgent(a, dt);
    // draw
    for (const k in meshes) meshes[k].im.count = 0;
    for (const a of agents) {
      if (a.obj) {
        sampleCurve(a.curve, a.s, a.cx, a.cz, tmp);
        a.pos[0] = tmp[0]; a.pos[1] = tmp[1]; a.pos[2] = tmp[2];
        a.obj.position.set(tmp[0], 0.1, tmp[1]);
        let dh = tmp[2] - a.obj.rotation.y; while (dh > Math.PI) dh -= 2 * Math.PI; while (dh < -Math.PI) dh += 2 * Math.PI;
        a.obj.rotation.y += dh * Math.min(1, dt * 12);
        a.onDraw?.(dt, a.v, dh);
        continue;
      }
      if (a.kind !== 'car' && a.kind !== 'parked') continue;
      sampleCurve(a.curve, a.s, a.cx, a.cz, tmp);
      a.pos[0] = tmp[0]; a.pos[1] = tmp[1]; a.pos[2] = tmp[2];
      const M = meshes[a.type]; if (!M || M.im.count >= MAX) continue;
      q.setFromAxisAngle(up, tmp[2]);
      v3.set(tmp[0], 0.1, tmp[1]);
      m4.compose(v3, q, one);
      M.im.setColorAt(M.im.count, a.paint);
      M.im.setMatrixAt(M.im.count++, m4);
    }
    for (const k in meshes) { const im = meshes[k].im; im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true; im.visible = im.count > 0; }
    for (let i = 0; i < bulbInfo.length; i++) { const b = bulbInfo[i], st = lightState(b.light, time, b.d); bulbs.setColorAt(i, st === KEY[b.k] ? COL[st] : OFF[b.k]); }
    bulbs.instanceColor.needsUpdate = true;
  }

  return {
    agents, byTile, update, lightAt, placeAgent, leaderGap, meshes, blockers,
    get time() { return time; },
    light: (tile, dir) => { const L = lightAt.get(tile); return L ? lightState(L, time, dir) : 'g'; },
    addAgent(a) { agents.push(a); return a; },
    // a rider (fleet courier) that wanders like a car inside a district; obj = Object3D to move
    addRider(obj, district, onDraw) {
      const a = spawnCar('sedan', district);
      a.kind = 'rider'; a.obj = obj; a.len = 2.2; a.vmax = 7.5 + rng() * 2; a.onDraw = onDraw;
      return a;
    },
    removeAgent(a) { const i = agents.indexOf(a); if (i >= 0) agents.splice(i, 1); },
  };
}

// ---- pedestrians: walk loops around intact blocks on the sidewalk ----
export async function createPeds(city, scene, { count = 14, seed = 5, ids } = {}) {
  const rng = mulberry32(seed);
  const loops = [];
  for (let bz = 0; bz < 11; bz++) for (let bx = 0; bx < 11; bx++) {
    const x0 = bx * 4, z0 = bz * 4;
    const pts = [[x0 + 0.55, z0 + 0.55], [x0 + 3.45, z0 + 0.55], [x0 + 3.45, z0 + 3.45], [x0 + 0.55, z0 + 3.45]];
    // only blocks whose four sides are roads
    const ok = [[x0 + 2, z0], [x0 + 4, z0 + 2], [x0 + 2, z0 + 4], [x0, z0 + 2]].every(([x, z]) => city.tiles[z * city.W + x]?.k === K.ROAD);
    if (ok) loops.push({ pts: pts.map(([x, z]) => [x * TILE, z * TILE]), d: city.tiles[(z0 + 2) * city.W + x0 + 2].d });
  }
  const peds = [];
  const list = ids || ['male-a', 'male-b', 'male-c', 'male-d', 'male-e', 'male-f', 'female-a', 'female-b', 'female-c', 'female-d', 'female-e', 'female-f'];
  const chars = await Promise.all(Array.from({ length: count }, (_, i) => makeChar(list[i % list.length])));
  for (const c of chars) {
    c.obj.scale.setScalar(2.2);
    scene.add(c.obj);
    c.play('walk');
    c.mixer.setTime(rng() * 3);
    peds.push({ c, loop: null, seg: 0, f: 0, speed: 1.1 + rng() * 0.5, dir: rng() < 0.5 ? 1 : -1 });
  }
  function place(p, x, z) {
    const near = loops.map((l) => [l, Math.hypot(l.pts[0][0] - x, l.pts[0][1] - z)]).filter(([, d]) => d < 260).map(([l]) => l);
    p.loop = pick(rng, near.length ? near : loops); p.seg = Math.floor(rng() * 4); p.f = rng();
  }
  function update(dt, fx, fz, radius = 140) {
    for (const p of peds) {
      if (!p.loop) place(p, fx, fz);
      const L = p.loop.pts, n = L.length;
      const a = L[p.seg], b = L[(p.seg + 1) % n];
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      p.f += p.speed * dt / len * p.dir;
      if (p.f > 1) { p.f -= 1; p.seg = (p.seg + 1) % n; }
      if (p.f < 0) { p.f += 1; p.seg = (p.seg + n - 1) % n; }
      const A = L[p.seg], B = L[(p.seg + 1) % n];
      const x = A[0] + (B[0] - A[0]) * p.f, z = A[1] + (B[1] - A[1]) * p.f;
      p.c.obj.position.set(x, 0.2, z);
      p.c.obj.rotation.y = Math.atan2((B[0] - A[0]) * p.dir, (B[1] - A[1]) * p.dir);
      if (Math.hypot(x - fx, z - fz) > radius) { place(p, fx, fz); continue; }
      p.c.mixer.update(dt);
    }
  }
  return { peds, update, setVisible: (v) => { for (const p of peds) p.c.obj.visible = v; } };
}

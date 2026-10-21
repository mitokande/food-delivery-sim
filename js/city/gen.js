// City layout generator — pure data, deterministic. Tile coords: x → east, z → south.
// Tile (x,z) is centred at world (x*TILE, 0, z*TILE). Kit pieces are 1×1 tile at scale 1.
import { mulberry32, pick, shuffle, weighted } from '../rng.js';
import { RESTAURANTS } from '../data.js';

export const DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0]]; // N E S W
export const OPP = (d) => (d + 2) & 3;
export const RIGHT = (d) => (d + 1) & 3; // turning right while heading d
export const LEFT = (d) => (d + 3) & 3;
// rotation (radians about +Y) that turns a piece's +Z front toward direction d
export const FRONT_ROT = [Math.PI, Math.PI / 2, 0, -Math.PI / 2];

export const BLOCK = 4, NB = 11, W = BLOCK * NB + 1, H = W;
export const K = { ROAD: 1, LOT: 2, ALLEY: 3, PARK: 4, YARD: 5 };

// Default open sides of road pieces (bit per dir). A rotation of q quarter-turns maps dir d → (d - q) & 3.
const ROAD_PIECES = {
  straight: { mask: 0b1010, names: ['road-straight'] }, // E+W
  bend: { mask: 0b1100, names: ['road-bend-sidewalk'] }, // S+W
  tee: { mask: 0b1110, names: ['road-intersection'] }, // E+S+W
  cross: { mask: 0b1111, names: ['road-crossroad'] },
  end: { mask: 0b0010, names: ['road-end'] }, // E
};
function rotMask(mask, q) { let m = 0; for (let d = 0; d < 4; d++) if (mask & (1 << d)) m |= 1 << ((d - q + 4) & 3); return m; }
export function fitRoad(mask) {
  const n = [0, 1, 2, 3].filter((d) => mask & (1 << d)).length;
  const kind = n === 4 ? 'cross' : n === 3 ? 'tee' : n === 1 ? 'end' : (mask === 0b1010 || mask === 0b0101) ? 'straight' : 'bend';
  for (let q = 0; q < 4; q++) if (rotMask(ROAD_PIECES[kind].mask, q) === mask) return { kind, q };
  return { kind, q: 0 };
}

export function districtOfBlock(bx, bz) {
  if (bz <= 4) return bx <= 5 ? 'downtown' : 'hills';
  return bx <= 4 ? 'oldtown' : 'harbor';
}

export function generateCity(seed = 20261019) {
  const rng = mulberry32(seed);
  const N = W * H;
  const idx = (x, z) => z * W + x;
  const inb = (x, z) => x >= 0 && z >= 0 && x < W && z < H;
  const tiles = new Array(N);
  for (let z = 0; z < H; z++) for (let x = 0; x < W; x++) {
    const bx = Math.min(NB - 1, Math.floor(x / BLOCK)), bz = Math.min(NB - 1, Math.floor(z / BLOCK));
    tiles[idx(x, z)] = { x, z, i: idx(x, z), k: 0, d: districtOfBlock(bx, bz), bx, bz, mask: 0 };
  }

  // ---- road network: grid lines with some interior segments removed ----
  const segs = []; // {a:[ix,iz], b:[ix,iz], tiles:[i...], on}
  for (let iz = 0; iz <= NB; iz++) for (let ix = 0; ix < NB; ix++) {
    const t = []; for (let k = 1; k < BLOCK; k++) t.push(idx(ix * BLOCK + k, iz * BLOCK));
    segs.push({ a: [ix, iz], b: [ix + 1, iz], tiles: t, on: true, outer: iz === 0 || iz === NB, h: true });
  }
  for (let ix = 0; ix <= NB; ix++) for (let iz = 0; iz < NB; iz++) {
    const t = []; for (let k = 1; k < BLOCK; k++) t.push(idx(ix * BLOCK, iz * BLOCK + k));
    segs.push({ a: [ix, iz], b: [ix, iz + 1], tiles: t, on: true, outer: ix === 0 || ix === NB, h: false });
  }
  const key = (p) => p[0] + ',' + p[1];
  const degree = () => { const deg = {}; for (const s of segs) if (s.on) { deg[key(s.a)] = (deg[key(s.a)] || 0) + 1; deg[key(s.b)] = (deg[key(s.b)] || 0) + 1; } return deg; };
  const connected = () => {
    const adj = {}; for (const s of segs) if (s.on) { (adj[key(s.a)] ||= []).push(key(s.b)); (adj[key(s.b)] ||= []).push(key(s.a)); }
    const start = '0,0', seen = new Set([start]), q = [start];
    while (q.length) { const c = q.pop(); for (const n of adj[c] || []) if (!seen.has(n)) { seen.add(n); q.push(n); } }
    return seen.size === (NB + 1) * (NB + 1);
  };
  const cands = shuffle(rng, segs.filter((s) => !s.outer));
  let removed = 0;
  const target = Math.round(cands.length * 0.13);
  for (const s of cands) {
    if (removed >= target) break;
    // keep the district borders (avenues) and the south waterfront row intact
    const d1 = districtOfBlock(Math.min(NB - 1, s.a[0]), Math.min(NB - 1, s.a[1]));
    if (s.h && (s.a[1] === 5 || s.a[1] === 10)) continue;
    if (!s.h && (s.a[0] === 5 || s.a[0] === 6)) continue;
    if (d1 === 'hills' && rng() < 0.4) continue;
    s.on = false;
    const deg = degree();
    if (deg[key(s.a)] < 2 || deg[key(s.b)] < 2 || !connected()) { s.on = true; continue; }
    removed++;
  }
  const deg = degree();
  for (const s of segs) if (s.on) for (const i of s.tiles) tiles[i].k = K.ROAD;
  for (let iz = 0; iz <= NB; iz++) for (let ix = 0; ix <= NB; ix++) if (deg[ix + ',' + iz]) tiles[idx(ix * BLOCK, iz * BLOCK)].k = K.ROAD;
  for (const t of tiles) if (t.k === K.ROAD) {
    for (let d = 0; d < 4; d++) { const nx = t.x + DIRS[d][0], nz = t.z + DIRS[d][1]; if (inb(nx, nz) && tiles[idx(nx, nz)].k === K.ROAD) t.mask |= 1 << d; }
    // a road tile's district = the block it borders to the south-east, clamped
  }

  // ---- blocks: parks, alleys ----
  const blockIntact = (bx, bz) => {
    const on = (ax, az, bx2, bz2) => segs.find((s) => s.a[0] === ax && s.a[1] === az && s.b[0] === bx2 && s.b[1] === bz2)?.on;
    return on(bx, bz, bx + 1, bz) && on(bx, bz + 1, bx + 1, bz + 1) && on(bx, bz, bx, bz + 1) && on(bx + 1, bz, bx + 1, bz + 1);
  };
  const shortcuts = []; // {tiles:[...], ends:[roadTileA, roadTileB], style}
  for (let bz = 0; bz < NB; bz++) for (let bx = 0; bx < NB; bx++) {
    const d = districtOfBlock(bx, bz);
    const x0 = bx * BLOCK + 1, z0 = bz * BLOCK + 1;
    const intact = blockIntact(bx, bz);
    if (!intact) continue;
    const r = rng();
    const pPark = { hills: 0.3, oldtown: 0.08, downtown: 0.08, harbor: 0.02 }[d];
    const pAlley = { hills: 0.05, oldtown: 0.5, downtown: 0.42, harbor: 0.3 }[d];
    const waterfront = bz === NB - 1 && d === 'oldtown';
    let style = null;
    if (waterfront || r < pPark) style = 'park';
    else if (r < pPark + pAlley) style = 'alley';
    if (!style) continue;
    const vertical = rng() < 0.5;
    const path = [];
    for (let k = 0; k < 3; k++) path.push(vertical ? idx(x0 + 1, z0 + k) : idx(x0 + k, z0 + 1));
    if (style === 'park') for (let k = 0; k < 9; k++) tiles[idx(x0 + (k % 3), z0 + Math.floor(k / 3))].k = K.PARK;
    for (const i of path) { tiles[i].k = K.ALLEY; tiles[i].style = style; tiles[i].vertical = vertical; }
    const ends = vertical ? [idx(x0 + 1, z0 - 1), idx(x0 + 1, z0 + 3)] : [idx(x0 - 1, z0 + 1), idx(x0 + 3, z0 + 1)];
    shortcuts.push({ tiles: path, ends, style, vertical, block: [bx, bz] });
    for (const i of path) tiles[i].sc = shortcuts.length - 1;
  }

  // ---- lots ----
  for (const t of tiles) if (!t.k) t.k = K.LOT;
  const frontage = (t) => { const f = []; for (let d = 0; d < 4; d++) { const nx = t.x + DIRS[d][0], nz = t.z + DIRS[d][1]; if (inb(nx, nz) && tiles[idx(nx, nz)].k === K.ROAD) f.push(d); } return f; };
  const lots = [];
  const free = (x, z) => inb(x, z) && tiles[idx(x, z)].k === K.LOT && tiles[idx(x, z)].lot == null;
  const order = shuffle(rng, tiles.filter((t) => t.k === K.LOT && frontage(t).length));
  // corners first so they claim big lots sensibly
  order.sort((a, b) => frontage(b).length - frontage(a).length);
  for (const t of order) {
    if (t.lot != null) continue;
    const fs = frontage(t);
    const f = pick(rng, fs);
    const r = DIRS[RIGHT(f)], back = DIRS[OPP(f)];
    const d = t.d;
    const want = rng();
    let shape = [1, 1];
    const big = { downtown: 0.55, harbor: 0.5, oldtown: 0.06, hills: 0 }[d];
    const wide = { downtown: 0.15, harbor: 0.35, oldtown: 0.22, hills: 0 }[d];
    const tryShape = (w, dep) => {
      for (let a = 0; a < w; a++) for (let b = 0; b < dep; b++) {
        const x = t.x + r[0] * a + back[0] * b, z = t.z + r[1] * a + back[1] * b;
        if (!free(x, z)) return false;
        if (b === 0 && !frontage(tiles[idx(x, z)]).includes(f)) return false;
      }
      return true;
    };
    if (want < big && tryShape(2, 2)) shape = [2, 2];
    else if (want < big + wide && tryShape(2, 1)) shape = [2, 1];
    const lt = [];
    for (let a = 0; a < shape[0]; a++) for (let b = 0; b < shape[1]; b++) lt.push(idx(t.x + r[0] * a + back[0] * b, t.z + r[1] * a + back[1] * b));
    const lot = { id: lots.length, tiles: lt, front: f, w: shape[0], dep: shape[1], d,
      cx: t.x + r[0] * (shape[0] - 1) / 2 + back[0] * (shape[1] - 1) / 2, cz: t.z + r[1] * (shape[0] - 1) / 2 + back[1] * (shape[1] - 1) / 2,
      door: idx(t.x + DIRS[f][0], t.z + DIRS[f][1]), doorFrom: t.i };
    for (const i of lt) tiles[i].lot = lot.id;
    lots.push(lot);
  }
  for (const t of tiles) if (t.k === K.LOT && t.lot == null) t.k = K.YARD;

  // ---- special buildings: restaurants, garage, office ----
  const specials = {};
  const placed = [];
  const farEnough = (lot, minD) => placed.every((p) => Math.abs(p.cx - lot.cx) + Math.abs(p.cz - lot.cz) >= minD);
  const take = (district, minD, prefer) => {
    let c = lots.filter((l) => l.d === district && l.w === 1 && l.dep === 1 && !l.special && farEnough(l, minD));
    if (prefer) c.sort(prefer);
    else c = shuffle(rng, c);
    const l = c[0]; if (!l) return null;
    placed.push(l); return l;
  };
  // the garage: Old Town, near its middle
  const mid = (cx, cz) => (a, b) => (Math.abs(a.cx - cx) + Math.abs(a.cz - cz)) - (Math.abs(b.cx - cx) + Math.abs(b.cz - cz));
  const g = take('oldtown', 0, mid(10, 31)); g.special = 'garage'; specials.garage = g.id;
  const o = take('oldtown', 4, mid(21, 23)); o.special = 'office'; specials.office = o.id;
  const restaurants = [];
  for (const R of RESTAURANTS) {
    let l = take(R.district, 9) || take(R.district, 6) || take(R.district, 3);
    if (!l) continue;
    l.special = 'restaurant'; l.rest = R.id;
    restaurants.push({ id: R.id, lot: l.id });
  }

  // ---- placements (what to draw) ----
  const P = []; // {kit, name, x, y, z, rot, s, sy, cat, tile}
  const PR = []; // street props from props.glb, tile coords: {type, x, z, rot, s, tile}
  const put = (kit, name, x, z, rot = 0, s = 1, cat = 'prop', extra) => P.push({ kit, name, x, y: 0, z, rot, s, sy: 1, cat, ...extra });

  // roads
  for (const t of tiles) if (t.k === K.ROAD) {
    const { kind, q } = fitRoad(t.mask);
    let name = ROAD_PIECES[kind].names[0];
    const busy = t.d === 'downtown' || t.d === 'oldtown';
    if (kind === 'cross') name = busy ? 'road-crossroad-path' : t.d === 'harbor' ? 'road-crossroad-line' : 'road-crossroad';
    if (kind === 'tee') name = busy ? 'road-intersection-path' : t.d === 'harbor' ? 'road-intersection-line' : 'road-intersection';
    t.piece = kind; t.q = q;
    put('roads', name, t.x, t.z, q * Math.PI / 2, 1, 'road', { tile: t.i });
    if (kind === 'tee' || kind === 'cross') t.junction = true;
  }
  // ground for alleys / parks / lots
  for (const t of tiles) {
    if (t.k === K.LOT || t.k === K.YARD || t.k === K.ALLEY) {
      if (t.d !== 'hills' && !(t.k === K.ALLEY && t.style === 'park')) put('roads', 'tile-low', t.x, t.z, 0, 1, 'ground', { tile: t.i });
    }
  }
  // buildings
  // buildings: procedural (city/arch.js builds every lot, restaurants included)
  // props: street lights, traffic lights, trees, alley clutter
  const lights = [];
  for (const t of tiles) if (t.k === K.ROAD) {
    if (t.junction && t.d !== 'hills') {
      lights.push({ tile: t.i, phase: rng() * 17 });
      // one signal per approach, on the far-right corner, facing the oncoming driver (lamp faces +Z at rot 0)
      for (let d = 0; d < 4; d++) {
        if (!(t.mask & (1 << OPP(d)))) continue;
        const f = DIRS[d], r = DIRS[RIGHT(d)];
        PR.push({ type: 'traffic_light', x: t.x + (f[0] + r[0]) * 0.46, z: t.z + (f[1] + r[1]) * 0.46, rot: FRONT_ROT[OPP(d)], s: 1, tile: t.i });
      }
    }
  }
  for (const t of tiles) {
    if (t.k === K.PARK || (t.k === K.ALLEY && t.style === 'park')) {
      if (t.k === K.PARK) {
        const n = 1 + Math.floor(rng() * 3);
        for (let k = 0; k < n; k++) PR.push({ type: rng() < 0.5 ? 'tree_round_a' : 'tree_round_b', x: t.x + (rng() - 0.5) * 0.7, z: t.z + (rng() - 0.5) * 0.7, rot: rng() * 6.28, s: 0.95 + rng() * 0.4, tile: t.i });
      } else put('suburban', 'path-long', t.x, t.z, t.vertical ? 0 : Math.PI / 2, 2.4, 'ground');
    }
    if (t.k === K.ALLEY && t.style === 'alley') {
      if (rng() < 0.55) put('roads', 'dumpster', t.x + (t.vertical ? 0.36 : 0) * (rng() < 0.5 ? 1 : -1), t.z + (t.vertical ? 0 : 0.36) * (rng() < 0.5 ? 1 : -1), t.vertical ? Math.PI / 2 : 0, 1);
    }
    if (t.k === K.YARD) {
      if (t.d === 'harbor') { if (rng() < 0.6) put('industrial', pick(rng, ['shipping-container-a', 'shipping-container-b', 'shipping-container-c']), t.x, t.z, rng() < 0.5 ? 0 : Math.PI / 2, 0.55); else if (rng() < 0.5) put('industrial', 'detail-tank', t.x, t.z, 0, 1); }
      else { PR.push({ type: 'tree_round_a', x: t.x + (rng() - 0.5) * 0.4, z: t.z + (rng() - 0.5) * 0.4, rot: rng() * 6, s: 1.1, tile: t.i }); if (rng() < 0.6) PR.push({ type: 'bench', x: t.x + 0.25, z: t.z - 0.3, rot: 0, s: 1, tile: t.i }); }
    }
  }
  // hills: trees in front yards, driveways
  for (const lot of lots) if (lot.d === 'hills' && !lot.special) {
    const t = tiles[lot.doorFrom];
    const f = DIRS[lot.front], r = DIRS[RIGHT(lot.front)];
    if (rng() < 0.7) PR.push({ type: rng() < 0.5 ? 'tree_round_a' : 'tree_round_c', x: t.x + f[0] * 0.36 + r[0] * 0.34, z: t.z + f[1] * 0.36 + r[1] * 0.34, rot: rng() * 6, s: 0.9 + rng() * 0.3, tile: t.i });
    if (rng() < 0.6) PR.push({ type: 'bush_a', x: t.x + f[0] * 0.4 - r[0] * 0.3, z: t.z + f[1] * 0.4 - r[1] * 0.3, rot: rng() * 6, s: 1.2, tile: t.i });
  }

  // customers = ordinary lots (not restaurants/garage/office)
  const customers = lots.filter((l) => !l.special).map((l) => l.id);
  return { W, H, tiles, lots, restaurants, specials, customers, shortcuts, lights, placements: P, props: PR, segs: segs.filter((s) => s.on).length };
}

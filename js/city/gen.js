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

// Building footprints in kit units (w along X = frontage, d along Z = depth, cx/cz = bbox centre, h = height)
const B = (name, w, d, h, cx = 0, cz = 0) => ({ name, w, d, h, cx, cz });
const COMMERCIAL_1 = [B('building-a', .88, .94, 1.29), B('building-b', .98, .94, 1.29), B('building-c', .88, 1.1, .89), B('building-d', .84, .9, 1.29),
  B('building-f', .84, 1.03, 1.69), B('building-g', .98, .92, 1.69), B('building-h', .88, 1.0, 1.29)];
const COMMERCIAL_2x1 = [B('building-e', 1.64, 1.0, .89), B('building-k', 2.08, .94, 1.47)];
const COMMERCIAL_BIG = [B('building-i', 1.24, 1.3, 1.68), B('building-j', 2.08, 1.34, 1.69), B('building-l', 1.38, 1.4, 2.27), B('building-m', 1.24, 1.24, 3.15), B('building-n', 2.32, 1.82, 2.48)];
const SKYSCRAPERS = [B('building-skyscraper-a', 1.36, 1.36, 2.88), B('building-skyscraper-b', 1.36, 1.36, 4.48), B('building-skyscraper-c', 1.28, 1.38, 4.08),
  B('building-skyscraper-d', 1.28, 1.38, 5.47), B('building-skyscraper-e', 1.3, 1.24, 4.08)];
const SUBURBAN = 'abcdefghijklmnopqrstu'.split('').map((c) => c); // sizes filled below
const SUB_SIZE = { a: [1.3, 1.02], b: [1.82, 1.14], c: [1.28, 1.02], d: [1.76, 1.02], e: [1.3, 1.02], f: [1.42, 1.4], g: [1.46, 1.18], h: [1.3, .92], i: [1.28, 1.02],
  j: [1.38, .92], k: [.92, 1.02], l: [1.04, 1.02], m: [1.42, 1.42], n: [1.78, 1.38], o: [1.27, 1.02], p: [1.24, 1.0], q: [1.24, .88, 0, .02], r: [1.02, 1.02], s: [1.4, 1.08], t: [1.31, 1.4, -.005], u: [1.42, 1.08] };
const HOUSES = SUBURBAN.map((c) => { const s = SUB_SIZE[c]; return B('building-type-' + c, s[0], s[1], 1, s[2] || 0, s[3] || 0); });
const IND = (n, x0, z0, x1, z1, h) => B('building-' + n, x1 - x0, z1 - z0, h, (x0 + x1) / 2, (z0 + z1) / 2);
const INDUSTRIAL_1 = [IND('d', -.44, -.8, .44, .62, 1.41), IND('i', -.95, -.38, .08, .92, .73), IND('j', -.95, -.38, .08, .92, .86), IND('k', -.65, -.46, .65, .45, .77),
  IND('o', -.88, 0, 0, 1.24, .92)];
const INDUSTRIAL_2x1 = [IND('p', -.84, -.5, .84, .5, .71), IND('s', -1.07, -.46, 1.05, .46, .84), IND('r', -1.24, -.64, 1.24, .64, 1.39), IND('g', -.84, -.64, .84, .64, 1.28)];
const INDUSTRIAL_BIG = [IND('a', -1.04, -.62, 1.04, .62, 1.47), IND('b', -1.04, -.64, 1.04, .62, 1.47), IND('c', -.84, -.91, 1.03, 1.2, 1.25), IND('e', -.84, -.4, .84, .89, 1.65),
  IND('f', -1.35, -.39, .44, .89, 1.92), IND('l', -1.46, -.71, .62, 1.16, 1.92), IND('m', -.66, -.85, .66, .85, 1.52), IND('q', -1.3, -.87, .84, .9, .88), IND('t', -.86, -.7, .86, .7, 1.01)];

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
  const choose = (lot) => {
    const d = lot.d, big = lot.w === 2 && lot.dep === 2, wide = lot.w === 2 && lot.dep === 1;
    if (d === 'hills') return ['suburban', pick(rng, HOUSES)];
    if (d === 'harbor') {
      if (big) return ['industrial', pick(rng, INDUSTRIAL_BIG)];
      if (wide) return ['industrial', pick(rng, INDUSTRIAL_2x1)];
      return rng() < 0.6 ? ['industrial', pick(rng, INDUSTRIAL_1)] : ['commercial', pick(rng, COMMERCIAL_1)];
    }
    if (d === 'downtown') {
      if (big) return rng() < 0.7 ? ['commercial', pick(rng, SKYSCRAPERS)] : ['commercial', pick(rng, COMMERCIAL_BIG)];
      if (wide) return ['commercial', pick(rng, COMMERCIAL_2x1)];
      return ['commercial', pick(rng, COMMERCIAL_1.filter((b) => b.h > 1.2))];
    }
    if (wide) return ['commercial', pick(rng, COMMERCIAL_2x1)];
    return ['commercial', pick(rng, COMMERCIAL_1)];
  };
  for (const lot of lots) {
    const rot = FRONT_ROT[lot.front]; // landmarks face +Z
    if (lot.special) {
      const name = lot.special === 'restaurant' ? RESTAURANTS.find((r) => r.id === lot.rest).model : lot.special;
      put('restaurants', name, lot.cx, lot.cz, rot, 1, 'building', { lot: lot.id });
      continue;
    }
    const [kit, b] = choose(lot);
    const rotK = rot + Math.PI; // Kenney buildings have their front door on -Z
    const fw = lot.w * 0.93, fd = lot.dep * 0.93;
    let s = Math.min(fw / b.w, fd / b.d);
    if (kit === 'commercial' && b.name.includes('skyscraper')) s = Math.min(s, 1.4);
    s = Math.min(s, 1.45);
    // piece centre offset (cx,cz) is in local space → rotate into world
    const c = Math.cos(rotK), sn = Math.sin(rotK);
    const ox = (b.cx * c + b.cz * sn) * s, oz = (-b.cx * sn + b.cz * c) * s;
    // push the building towards its front edge so the shop front meets the sidewalk
    const slack = (lot.dep - b.d * s) / 2 * 0.9;
    const fx = DIRS[lot.front][0] * slack, fz = DIRS[lot.front][1] * slack;
    put(kit, b.name, lot.cx - ox + fx, lot.cz - oz + fz, rotK, s, 'building', { lot: lot.id, h: b.h * s });
    lot.h = b.h * s;
  }
  // props: street lights, traffic lights, trees, alley clutter
  const lights = [];
  for (const t of tiles) if (t.k === K.ROAD) {
    if (t.piece === 'straight' && (t.x + t.z) % 3 === 0) {
      // on a sidewalk edge, arm reaching over the road. light-curved arm points -Z.
      const horiz = (t.mask & 0b1010) === 0b1010; // E-W road → sidewalks on N/S edges
      const side = ((t.x * 7 + t.z * 3) % 2) ? 1 : -1;
      if (horiz) put('roads', 'light-curved', t.x, t.z + side * 0.47, side > 0 ? 0 : Math.PI, 1, 'prop', { lamp: true });
      else put('roads', 'light-curved', t.x + side * 0.47, t.z, side > 0 ? Math.PI / 2 : -Math.PI / 2, 1, 'prop', { lamp: true });
    }
    if (t.junction && t.d !== 'hills') {
      lights.push({ tile: t.i, phase: rng() * 17 });
      // one signal per approach, on the far-right corner, facing the oncoming driver (lamp faces +Z at rot 0)
      for (let d = 0; d < 4; d++) {
        if (!(t.mask & (1 << OPP(d)))) continue;
        const f = DIRS[d], r = DIRS[RIGHT(d)];
        put('roads', 'traffic-light', t.x + (f[0] + r[0]) * 0.46, t.z + (f[1] + r[1]) * 0.46, FRONT_ROT[OPP(d)], 1, 'prop');
      }
    }
  }
  for (const t of tiles) {
    if (t.k === K.PARK || (t.k === K.ALLEY && t.style === 'park')) {
      if (t.k === K.PARK) {
        const n = 1 + Math.floor(rng() * 3);
        for (let k = 0; k < n; k++) put('suburban', rng() < 0.5 ? 'tree-large' : 'tree-small', t.x + (rng() - 0.5) * 0.7, t.z + (rng() - 0.5) * 0.7, rng() * 6.28, 1.3 + rng() * 0.6);
      } else put('suburban', 'path-long', t.x, t.z, t.vertical ? 0 : Math.PI / 2, 2.4, 'ground');
    }
    if (t.k === K.ALLEY && t.style === 'alley') {
      if (rng() < 0.55) put('roads', 'dumpster', t.x + (t.vertical ? 0.36 : 0) * (rng() < 0.5 ? 1 : -1), t.z + (t.vertical ? 0 : 0.36) * (rng() < 0.5 ? 1 : -1), t.vertical ? Math.PI / 2 : 0, 1);
    }
    if (t.k === K.YARD) {
      if (t.d === 'harbor') { if (rng() < 0.6) put('industrial', pick(rng, ['shipping-container-a', 'shipping-container-b', 'shipping-container-c']), t.x, t.z, rng() < 0.5 ? 0 : Math.PI / 2, 0.55); else if (rng() < 0.5) put('industrial', 'detail-tank', t.x, t.z, 0, 1); }
      else { put('suburban', 'tree-large', t.x + (rng() - 0.5) * 0.4, t.z + (rng() - 0.5) * 0.4, rng() * 6, 1.4); if (rng() < 0.6) put('suburban', 'planter', t.x + 0.3, t.z - 0.3, 0, 1.2); }
    }
  }
  // hills: trees in front yards, driveways
  for (const lot of lots) if (lot.d === 'hills' && !lot.special) {
    const t = tiles[lot.doorFrom];
    const f = DIRS[lot.front], r = DIRS[RIGHT(lot.front)];
    if (rng() < 0.7) put('suburban', rng() < 0.5 ? 'tree-large' : 'tree-small', t.x + f[0] * 0.4 + r[0] * 0.38, t.z + f[1] * 0.4 + r[1] * 0.38, rng() * 6, 1.2 + rng() * 0.5);
    put('suburban', 'fence-low', t.x - f[0] * 0.05, t.z - f[1] * 0.05, FRONT_ROT[lot.front], 0.72);
  }

  // customers = ordinary lots (not restaurants/garage/office)
  const customers = lots.filter((l) => !l.special).map((l) => l.id);
  return { W, H, tiles, lots, restaurants, specials, customers, shortcuts, lights, placements: P, segs: segs.filter((s) => s.on).length };
}

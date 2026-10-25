// The city as solid ground for free riding (desktop): what is under the wheels (asphalt, sidewalk, grass, and how high
// it is) and what the bike can run into (buildings, trees, lamp posts, benches, the viaduct's pillars, people sitting
// out, the city's edge). Pure data, no three.js. Colliders live in a 10 m grid hash; queries return push-out contacts.
import { TILE } from '../data.js';
import { K, DIRS } from '../city/gen.js';

const ASPH = 4; // asphalt half-width of a Kenney road tile (m); the metre beyond it is sidewalk, one 0.1 m kerb up
export const Y = { asphalt: 0.1, walk: 0.2, grass: 0.02 };
// street props: [kind, radius] for a round collider, or [kind, half-x, half-z] for a box turned with the prop
const PROP = {
  tree_round_a: ['pole', 0.38], tree_round_b: ['pole', 0.38], tree_round_c: ['pole', 0.38], palm_a: ['pole', 0.3], palm_b: ['pole', 0.3],
  street_lamp: ['pole', 0.22], street_lamp_double: ['pole', 0.24], traffic_light: ['pole', 0.22], sign_post: ['pole', 0.62, 0.12],
  bollard: ['small', 0.13], hydrant: ['small', 0.22], trash_bin: ['small', 0.3], chalkboard: ['small', 0.3, 0.26], flower_pot: ['small', 0.3],
  planter: ['small', 0.84, 0.27], bench: ['small', 0.8, 0.3], cafe_set_a: ['small', 0.85], cafe_set_b: ['small', 0.85], bush_a: ['small', 0.58],
};
// yard and alley clutter from the city layout (kit units: 1 = one tile at scale 1): [half-x, half-z]
const PLACED = { 'shipping-container-a': [0.19, 0.41], 'shipping-container-b': [0.19, 0.41], 'shipping-container-c': [0.19, 0.41], 'detail-tank': [0.42, 0.26], dumpster: [0.14, 0.19] };

export function createWorld(city, arch, people = []) {
  const W = city.W, H = city.H;
  // the playable rectangle: the outer roads' far sidewalks (the outskirts' shopfronts stand right behind them) and the quay
  const B = { x0: -5 - 2.5, z0: -5 - 2.5, x1: (W - 1) * TILE + 5 + 2.5, z1: (H - 0.5) * TILE - 0.4 };
  const OFF = 2, NC = W + 2 * OFF;
  const cells = new Map();
  const cellOf = (x, z) => (Math.floor(z / TILE + 0.5) + OFF) * NC + Math.floor(x / TILE + 0.5) + OFF;
  function add(c) {
    const e = c.box ? Math.hypot(c.hx, c.hz) : c.r;
    const i0 = Math.floor((c.x - e) / TILE + 0.5), i1 = Math.floor((c.x + e) / TILE + 0.5);
    const j0 = Math.floor((c.z - e) / TILE + 0.5), j1 = Math.floor((c.z + e) / TILE + 0.5);
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const k = (j + OFF) * NC + i + OFF;
      let l = cells.get(k); if (!l) cells.set(k, (l = [])); l.push(c);
    }
  }
  const box = (kind, x, z, hx, hz, rot = 0, what) => add({ box: true, kind, x, z, hx, hz, c: Math.cos(rot), s: Math.sin(rot), what });
  const disc = (kind, x, z, r, what) => add({ box: false, kind, x, z, r, what });
  for (const b of arch.buildings) box('wall', (b.x0 + b.x1) / 2, (b.z0 + b.z1) / 2, (b.x1 - b.x0) / 2, (b.z1 - b.z0) / 2, 0, 'wall');
  for (const p of arch.props) {
    const d = PROP[p.type]; if (!d) continue;
    const s = p.s || 1;
    if (d.length === 3) box(d[0], p.x, p.z, d[1] * s, d[2] * s, p.rot || 0, p.type);
    else disc(d[0], p.x, p.z, d[1] * (d[0] === 'pole' ? Math.min(1.3, s) : s), p.type);
  }
  for (const [x, z] of arch.pillars || []) box('wall', x, z, 0.55, 0.55, 0, 'pillar');
  for (const p of city.placements) {
    const d = PLACED[p.name]; if (!d) continue;
    box(p.name === 'dumpster' ? 'small' : 'wall', p.x * TILE, p.z * TILE, d[0] * TILE * p.s, d[1] * TILE * p.s, p.rot || 0, p.name);
  }
  if (city.clockTower >= 0) { const t = city.tiles[city.clockTower]; box('wall', t.x * TILE, t.z * TILE, 3.3 * 1.15, 3.3 * 1.15, 0, 'tower'); }
  for (const p of people) disc('person', p.x, p.z, 0.34, 'person');

  const tileAt = (x, z) => {
    const tx = Math.round(x / TILE), tz = Math.round(z / TILE);
    return tx < 0 || tz < 0 || tx >= W || tz >= H ? null : city.tiles[tz * W + tx];
  };
  // what's under the wheels: asphalt on the road arms of a road tile, sidewalk round them, paving on lots and alleys,
  // grass in parks and the hills' gardens
  function surface(x, z) {
    const t = tileAt(x, z);
    if (!t) return 'walk';
    if (t.k === K.ROAD) {
      const lx = x - t.x * TILE, lz = z - t.z * TILE;
      if (t.piece === 'bend') {
        // the kit's bend sweeps round its inner corner: asphalt between 1 m and 9 m from it
        let cx = 0, cz = 0;
        for (let d = 0; d < 4; d++) if (t.mask & (1 << d)) { cx += DIRS[d][0] * TILE / 2; cz += DIRS[d][1] * TILE / 2; }
        const r = Math.hypot(lx - cx, lz - cz);
        return r > 1 && r < TILE - 1 ? 'asphalt' : 'walk';
      }
      if (Math.abs(lx) < ASPH && Math.abs(lz) < ASPH) return 'asphalt';
      for (let d = 0; d < 4; d++) {
        if (!(t.mask & (1 << d))) continue;
        const along = DIRS[d][0] * lx + DIRS[d][1] * lz, across = DIRS[d][0] * lz - DIRS[d][1] * lx;
        if (along > 0 && Math.abs(across) < ASPH) return 'asphalt';
      }
      return 'walk';
    }
    if (t.k === K.PARK || (t.k === K.ALLEY && t.style === 'park') || (t.d === 'hills' && (t.k === K.LOT || t.k === K.YARD))) return 'grass';
    return 'walk';
  }
  // contacts of a circle against everything solid: [{nx, nz, depth, kind, what}] (n points away from the obstacle)
  const seen = new Set();
  function hits(x, z, r, out) {
    out.length = 0;
    if (x - r < B.x0) out.push({ nx: 1, nz: 0, depth: B.x0 - (x - r), kind: 'wall', what: 'edge' });
    if (x + r > B.x1) out.push({ nx: -1, nz: 0, depth: x + r - B.x1, kind: 'wall', what: 'edge' });
    if (z - r < B.z0) out.push({ nx: 0, nz: 1, depth: B.z0 - (z - r), kind: 'wall', what: 'edge' });
    if (z + r > B.z1) out.push({ nx: 0, nz: -1, depth: z + r - B.z1, kind: 'wall', what: 'quay' });
    seen.clear();
    const i0 = Math.floor((x - r) / TILE + 0.5), i1 = Math.floor((x + r) / TILE + 0.5);
    const j0 = Math.floor((z - r) / TILE + 0.5), j1 = Math.floor((z + r) / TILE + 0.5);
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const l = cells.get((j + OFF) * NC + i + OFF); if (!l) continue;
      for (const c of l) {
        if (seen.has(c)) continue;
        seen.add(c);
        const h = c.box ? boxHit(x, z, r, c.x, c.z, c.hx, c.hz, c.c, c.s) : discHit(x, z, r, c.x, c.z, c.r);
        if (h) { h.kind = c.kind; h.what = c.what; out.push(h); }
      }
    }
    return out;
  }
  // the tile to plan a route from: the road (or alley) under the bike, else the nearest one next to it
  function routeTile(x, z, roadOnly = false) {
    const ok = (t) => t && (t.k === K.ROAD || (!roadOnly && t.k === K.ALLEY));
    const t = tileAt(x, z);
    if (ok(t)) return t.i;
    const cx = Math.round(x / TILE), cz = Math.round(z / TILE);
    let best = -1, bd = Infinity;
    for (let r = 1; r <= 3 && best < 0; r++) for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
      const tx = cx + dx, tz = cz + dz;
      if (tx < 0 || tz < 0 || tx >= W || tz >= H) continue;
      const n = city.tiles[tz * W + tx];
      if (!ok(n)) continue;
      const d = Math.hypot(Math.max(0, Math.abs(x - tx * TILE) - TILE / 2), Math.max(0, Math.abs(z - tz * TILE) - TILE / 2));
      if (d < bd) { bd = d; best = n.i; }
    }
    return best;
  }
  return { surface, hits, tileAt, routeTile, bounds: B, buildings: arch.buildings };
}

function discHit(x, z, r, cx, cz, cr) {
  const dx = x - cx, dz = z - cz, d2 = dx * dx + dz * dz, R = r + cr;
  if (d2 >= R * R) return null;
  const d = Math.sqrt(d2) || 1e-4;
  return { nx: dx / d, nz: dz / d, depth: R - d };
}
// circle against a box turned by rot about +Y (three.js: local x → world (cos, −sin), local z → world (sin, cos))
export function boxHit(x, z, r, bx, bz, hx, hz, c, s) {
  const dx = x - bx, dz = z - bz;
  const lx = dx * c - dz * s, lz = dx * s + dz * c;
  if (Math.abs(lx) >= hx + r || Math.abs(lz) >= hz + r) return null;
  const qx = Math.max(-hx, Math.min(hx, lx)), qz = Math.max(-hz, Math.min(hz, lz));
  let nlx, nlz, depth;
  const ex = lx - qx, ez = lz - qz, e2 = ex * ex + ez * ez;
  if (e2 > 1e-8) {
    const e = Math.sqrt(e2); if (e >= r) return null;
    nlx = ex / e; nlz = ez / e; depth = r - e;
  } else {
    // centre inside the box: out through the nearest face
    const px = hx - Math.abs(lx), pz = hz - Math.abs(lz);
    if (px < pz) { nlx = Math.sign(lx) || 1; nlz = 0; depth = px + r; } else { nlx = 0; nlz = Math.sign(lz) || 1; depth = pz + r; }
  }
  return { nx: nlx * c + nlz * s, nz: -nlx * s + nlz * c, depth };
}

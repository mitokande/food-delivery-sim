// Road graph: A* over tiles, lane curves per tile, routes with arc-length sampling. Pure (no three.js).
import { TILE } from '../data.js';
import { DIRS, OPP, RIGHT, K } from './gen.js';

export const LANE = 0.16 * TILE; // lane centre offset from the road centre line (m)
const HALF = TILE / 2;

export function dirBetween(city, a, b) {
  const ta = city.tiles[a], tb = city.tiles[b];
  const dx = tb.x - ta.x, dz = tb.z - ta.z;
  for (let d = 0; d < 4; d++) if (DIRS[d][0] === dx && DIRS[d][1] === dz) return d;
  return -1;
}

// neighbours of tile i (road graph, optionally through shortcut alleys)
export function neighbours(city, i, alleys) {
  const t = city.tiles[i], out = [];
  if (t.k === K.ROAD) {
    for (let d = 0; d < 4; d++) if (t.mask & (1 << d)) out.push(i + DIRS[d][0] + DIRS[d][1] * city.W);
    if (alleys) for (let d = 0; d < 4; d++) {
      const j = i + DIRS[d][0] + DIRS[d][1] * city.W, n = city.tiles[j];
      if (n && n.k === K.ALLEY && city.shortcuts[n.sc].ends.includes(i) && Math.abs(n.x - t.x) + Math.abs(n.z - t.z) === 1) out.push(j);
    }
  } else if (t.k === K.ALLEY) {
    const sc = city.shortcuts[t.sc];
    for (let d = 0; d < 4; d++) {
      const j = i + DIRS[d][0] + DIRS[d][1] * city.W, n = city.tiles[j];
      if (!n || Math.abs(n.x - t.x) + Math.abs(n.z - t.z) !== 1) continue;
      if ((n.k === K.ALLEY && n.sc === t.sc) || sc.ends.includes(j)) out.push(j);
    }
  }
  return out;
}

// A* from tile a to tile b. noBack: direction we must not leave a by (no U-turns).
export function findPath(city, a, b, { alleys = false, noBack = -1, avoid = null } = {}) {
  if (a === b) return [a];
  const W = city.W;
  const h = (i) => Math.abs((i % W) - (b % W)) + Math.abs(((i / W) | 0) - ((b / W) | 0));
  const g = new Map([[a, 0]]), came = new Map(), dirIn = new Map([[a, noBack >= 0 ? OPP(noBack) : -1]]);
  // tiny binary heap
  const heap = [[h(a), a]];
  const push = (f, i) => { heap.push([f, i]); let k = heap.length - 1; while (k > 0) { const p = (k - 1) >> 1; if (heap[p][0] <= heap[k][0]) break; [heap[p], heap[k]] = [heap[k], heap[p]]; k = p; } };
  const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let k = 0; for (;;) { const l = 2 * k + 1, r = l + 1; let m = k; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === k) break; [heap[m], heap[k]] = [heap[k], heap[m]]; k = m; } } return top; };
  const closed = new Set();
  while (heap.length) {
    const [, i] = pop();
    if (i === b) break;
    if (closed.has(i)) continue;
    closed.add(i);
    const din = dirBetween(city, came.get(i) ?? i, i);
    for (const j of neighbours(city, i, alleys)) {
      const d = dirBetween(city, i, j);
      if (i === a && noBack >= 0 && d === noBack) continue;
      if (din >= 0 && d === OPP(din)) continue;
      if (avoid && avoid.has(j)) continue;
      const tj = city.tiles[j];
      let cost = tj.k === K.ALLEY ? 1.3 : 1;
      if (din >= 0 && d !== din) cost += 0.35;
      const ng = g.get(i) + cost;
      if (ng < (g.get(j) ?? Infinity)) { g.set(j, ng); came.set(j, i); push(ng + h(j), j); }
    }
  }
  if (!came.has(b)) return null;
  const path = [b];
  while (path[path.length - 1] !== a) path.push(came.get(path[path.length - 1]));
  return path.reverse();
}

// ---- lane curves (tile-local, metres, relative to tile centre) ----
const curveCache = new Map();
const right = (d) => DIRS[RIGHT(d)];
function bez(p0, p1, p2, n, out) {
  for (let k = 1; k <= n; k++) {
    const t = k / n, u = 1 - t;
    out.push([u * u * p0[0] + 2 * u * t * p1[0] + t * t * p2[0], u * u * p0[1] + 2 * u * t * p1[1] + t * t * p2[1]]);
  }
}
// kind: 'full' edge→edge, 'start' centre→exit edge, 'end' entry edge→centre, 'only' (single tile route)
export function laneCurve(din, dout, kind, off = LANE) {
  const key = din * 1000 + dout * 100 + (kind === 'full' ? 0 : kind === 'start' ? 1 : kind === 'end' ? 2 : 3) * 10 + Math.round(off * 2);
  let c = curveCache.get(key);
  if (c) return c;
  const pts = [];
  const ri = right(din), ro = right(dout), di = DIRS[din], dq = DIRS[dout];
  const entry = [-di[0] * HALF + ri[0] * off, -di[1] * HALF + ri[1] * off];
  const exit = [dq[0] * HALF + ro[0] * off, dq[1] * HALF + ro[1] * off];
  if (kind === 'start') {
    pts.push([ro[0] * off - dq[0] * 0.5, ro[1] * off - dq[1] * 0.5]); pts.push(exit);
  } else if (kind === 'end') {
    pts.push(entry); pts.push([ri[0] * off + di[0] * 0.5, ri[1] * off + di[1] * 0.5]);
  } else if (kind === 'only') {
    pts.push([ri[0] * off - di[0] * 2, ri[1] * off - di[1] * 2]); pts.push([ri[0] * off + di[0] * 2, ri[1] * off + di[1] * 2]);
  } else if (din === dout) {
    pts.push(entry); pts.push([(entry[0] + exit[0]) / 2, (entry[1] + exit[1]) / 2]); pts.push(exit);
  } else {
    // control point = where the entry line meets the exit line
    const t = (exit[0] - entry[0]) * di[0] + (exit[1] - entry[1]) * di[1];
    const ctrl = [entry[0] + di[0] * t, entry[1] + di[1] * t];
    pts.push(entry); bez(entry, ctrl, exit, 8, pts);
  }
  const cum = [0];
  for (let k = 1; k < pts.length; k++) cum.push(cum[k - 1] + Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]));
  const turn = din === dout ? 0 : dout === RIGHT(din) ? 1 : -1;
  const radius = turn === 0 ? Infinity : turn === 1 ? HALF - off : HALF + off;
  c = { pts, cum, len: cum[cum.length - 1], turn, radius };
  curveCache.set(key, c);
  return c;
}

// sample a tile-local curve at distance s → writes [x, z, heading] into out (world coords given tile centre)
export function sampleCurve(c, s, cx, cz, out) {
  const { pts, cum } = c;
  if (s <= 0) s = 0; if (s >= c.len) s = c.len - 1e-6;
  let k = 1; while (k < cum.length - 1 && cum[k] < s) k++;
  const a = pts[k - 1], b = pts[k], seg = cum[k] - cum[k - 1] || 1, t = (s - cum[k - 1]) / seg;
  out[0] = cx + a[0] + (b[0] - a[0]) * t;
  out[1] = cz + a[1] + (b[1] - a[1]) * t;
  out[2] = Math.atan2(b[0] - a[0], b[1] - a[1]); // heading: 0 = +Z (south), π/2 = +X (east)
  return out;
}

// Build a route (list of steps with lane curves) from a tile path.
export function buildRoute(city, path, { startDir = -1 } = {}) {
  const steps = [];
  const n = path.length;
  for (let k = 0; k < n; k++) {
    const i = path[k], t = city.tiles[i];
    const dout = k < n - 1 ? dirBetween(city, i, path[k + 1]) : -1;
    const din = k > 0 ? dirBetween(city, path[k - 1], i) : (startDir >= 0 ? startDir : dout);
    const kind = n === 1 ? 'only' : k === 0 ? 'start' : k === n - 1 ? 'end' : 'full';
    const off = t.k === K.ALLEY ? 0 : LANE;
    const c = laneCurve(din, dout < 0 ? din : dout, kind, off);
    steps.push({ tile: i, din, dout: dout < 0 ? din : dout, kind, c, cx: t.x * TILE, cz: t.z * TILE, s0: 0, alley: t.k === K.ALLEY });
  }
  let s = 0;
  for (const st of steps) { st.s0 = s; s += st.c.len; }
  return { steps, length: s, path };
}

const tmp = [0, 0, 0];
export function sampleRoute(route, s, out = [0, 0, 0, 0]) {
  const st = route.steps;
  let k = out[3] | 0;
  if (k >= st.length || st[k].s0 > s) k = 0;
  while (k < st.length - 1 && st[k + 1].s0 <= s) k++;
  const step = st[k];
  sampleCurve(step.c, s - step.s0, step.cx, step.cz, tmp);
  out[0] = tmp[0]; out[1] = tmp[1]; out[2] = tmp[2]; out[3] = k;
  return out;
}

export const tileCenter = (city, i) => [city.tiles[i].x * TILE, city.tiles[i].z * TILE];
export const manhattan = (city, a, b) => Math.abs(city.tiles[a].x - city.tiles[b].x) + Math.abs(city.tiles[a].z - city.tiles[b].z);

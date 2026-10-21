// Procedural architecture: every lot becomes a building in its district's style — Old Town townhouses with
// shopfronts, striped awnings, shutters and flower boxes; Downtown stone blocks and glass towers on podiums;
// Harbor pastel Mediterranean houses and corrugated warehouses; Green Hills villas in gardens. Restaurants,
// the garage and the office are townhouses too, with their brand colours, name boards and rooftop signs.
//
// Geometry is deliberately simple (boxes, hip/gable roofs, cornices, awnings, balconies, flower boxes, signs);
// archmat.js paints windows and surfaces in the shader. Output is merged per city chunk: a `base` layer (shells,
// roofs) drawn at any distance and a `detail` layer (awnings, balconies, boxes, signs) culled sooner.
import * as THREE from 'three';
import { TILE, RESTAURANT } from '../data.js';
import { DIRS, K, districtOfBlock } from './gen.js';
import { mulberry32, pick } from '../rng.js';
import { KIND, archUni } from './archmat.js';

const T = TILE;
const lin = (h) => { const c = new THREE.Color(h); return [c.r, c.g, c.b]; };

// ---------------------------------------------------------------- palettes
const PAL = {
  oldtown: { walls: ['#f4e1bf', '#f2c39d', '#eba57f', '#de8662', '#f1c76f', '#efb5a6', '#f7dca0', '#e9d3ad', '#dc8f70', '#f5ead6'],
    brick: ['#bf5c3e', '#c96f48', '#ad5440'], shut: ['#3f8f6b', '#2f7d86', '#3a6fb0', '#7a4d36', '#b8463a', '#5c8a3e', '#2f5d8c'],
    roof: ['#c8643f', '#b8563a', '#d0744a', '#a94f35'] },
  harbor: { walls: ['#a3dad3', '#f5b6bf', '#f7da7c', '#f7f1e3', '#c9b8eb', '#f6a98b', '#acd0ec', '#fff0c6', '#f4d1a6'],
    brick: ['#c96f48'], shut: ['#2f6fb5', '#2f8f9a', '#3f8f6b', '#2a5d8f', '#e0703a'], roof: ['#cf6a42', '#c45c3a', '#d9804f'] },
  downtown: { walls: ['#ece0c8', '#dacbb0', '#d3d6db', '#c6ccd4', '#e6d6bb', '#f0e6d4', '#d9c3a3'], brick: ['#b9654a', '#a85b46', '#c27858'],
    shut: ['#2f3d52', '#3a4f6b', '#5a3a2e'], roof: ['#8a8f99', '#9a948a'], glass: ['#5fa8d6', '#4f93c4', '#5fb6c2', '#6f9fd6', '#7cb4cf'] },
  hills: { walls: ['#fbf4e6', '#f5e7d0', '#f8dbbd', '#f3eadb', '#ffe9c7', '#e9f0e4'], shut: ['#3f8f6b', '#2f6fb5', '#7a4d36', '#5c8a3e'],
    roof: ['#c8643f', '#b8563a', '#d0744a'] },
};
const AWN = ['#d8423a', '#2f8f5b', '#2e6db4', '#e8a92e', '#8e2f45', '#e0703a', '#3fa7a0', '#3b4f8f'];
const WARE = ['#c9d3d6', '#d98a5a', '#7fb3c8', '#e6d8b0', '#9fbfa0'];

// ---------------------------------------------------------------- shop names + sign atlas
const SHOPS = {
  oldtown: [['Bakery', '#c0703c'], ['Café Luna', '#2f6f5b'], ['Books', '#3b4f8f'], ['Florist', '#4f9a4a'], ['Gelato', '#e86f9a'], ['Pharmacy', '#2f9a6a'],
    ['Deli', '#8e2f45'], ['Barber', '#2e6db4'], ['Fruit & Veg', '#5c9a3e'], ['Wine Bar', '#6b2f45']],
  downtown: [['Bank', '#2f3d52'], ['Hotel', '#7a4d36'], ['Cinema', '#b8463a'], ['Electronics', '#2e6db4'], ['Bistro', '#3f6f5b']],
  harbor: [['Fish Market', '#2d5c9a'], ['Surf Shop', '#2f9aa0'], ['Ice Cream', '#e86f9a'], ['Souvenirs', '#e0703a'], ['Seafood', '#2f6fb5']],
  hills: [],
};
const SPECIAL_SIGNS = [['Moto Garage', '#2b2f3a', '#ffc53d'], ['Dispatch Co.', '#2e6db4', '#ffffff']];
let atlas = null;
function signAtlas() {
  if (atlas) return atlas;
  const entries = [];
  for (const d in SHOPS) for (const [name, bg] of SHOPS[d]) entries.push({ name, bg, fg: '#fff7e8' });
  const seen = new Set();
  for (const r of Object.values(RESTAURANT)) if (!seen.has(r.name)) { seen.add(r.name); entries.push({ name: r.name, bg: r.color, fg: light(r.color) ? '#3a2412' : '#ffffff', rest: true }); }
  for (const [name, bg, fg] of SPECIAL_SIGNS) entries.push({ name, bg, fg });
  const CW = 512, CH = 128, cols = 2, rows = Math.ceil(entries.length / cols);
  const c = document.createElement('canvas'); c.width = CW * cols; c.height = CH * rows;
  const g = c.getContext('2d');
  entries.forEach((e, i) => {
    const x = (i % cols) * CW, y = Math.floor(i / cols) * CH;
    g.fillStyle = e.bg; g.fillRect(x, y, CW, CH);
    g.strokeStyle = 'rgba(255,255,255,.85)'; g.lineWidth = 7; roundRect(g, x + 10, y + 10, CW - 20, CH - 20, 14); g.stroke();
    g.fillStyle = 'rgba(0,0,0,.18)'; g.fillRect(x, y + CH - 10, CW, 10);
    let fs = 70; g.font = `${fs}px "Lilita One", "Fredoka", system-ui, sans-serif`;
    while (g.measureText(e.name).width > CW - 70 && fs > 30) { fs -= 4; g.font = `${fs}px "Lilita One", "Fredoka", system-ui, sans-serif`; }
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = 'rgba(0,0,0,.25)'; g.fillText(e.name, x + CW / 2 + 3, y + CH / 2 + 6);
    g.fillStyle = e.fg; g.fillText(e.name, x + CW / 2, y + CH / 2 + 2);
    e.uv = [x / c.width, 1 - (y + CH) / c.height, (x + CW) / c.width, 1 - y / c.height];
  });
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  archUni.uSigns.value = tex;
  atlas = { tex, entries, by: Object.fromEntries(entries.map((e) => [e.name, e])), canvas: c, redraw: null };
  return atlas;
}
function light(hex) { const c = new THREE.Color(hex); return c.r * 0.3 + c.g * 0.55 + c.b * 0.15 > 0.62; }
function roundRect(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
// re-draw the atlas once the display font has loaded (canvas text falls back to system-ui before that)
export function refreshSignFont() {
  if (!atlas || !document.fonts) return;
  document.fonts.load('40px "Lilita One"').then(() => { const keep = atlas; atlas = null; const a = signAtlas(); a.tex.needsUpdate = true; if (keep !== a) keep.tex.dispose(); }).catch(() => {});
}

// ---------------------------------------------------------------- geometry accumulator
class GB {
  constructor() { this.p = []; this.n = []; this.c = []; this.f = []; this.w = []; this.o = []; this.a = []; this.t = []; this.i = []; this.vc = 0; }
  // 4 corners counter-clockwise seen from the front; fv = per-corner facade (u,v); S = style
  quad(P, fv, S, nrm, suv) {
    const b = this.vc;
    const N = nrm || faceNormal(P[0], P[1], P[2]);
    for (let k = 0; k < 4; k++) {
      this.p.push(P[k][0], P[k][1], P[k][2]); this.n.push(N[0], N[1], N[2]); this.c.push(S.col[0], S.col[1], S.col[2]);
      this.f.push(fv[k][0], fv[k][1], S.W || 0, S.kind); this.w.push(S.win[0], S.win[1], S.win[2], S.win[3]);
      this.o.push(S.opt[0], S.opt[1], S.opt[2], S.opt[3]); this.a.push(S.alt[0], S.alt[1], S.alt[2]);
      this.t.push(suv ? suv[k][0] : 0, suv ? suv[k][1] : 0);
    }
    this.i.push(b, b + 1, b + 2, b, b + 2, b + 3); this.vc += 4;
  }
  tri(P, fv, S) {
    const b = this.vc, N = faceNormal(P[0], P[1], P[2]);
    for (let k = 0; k < 3; k++) {
      this.p.push(P[k][0], P[k][1], P[k][2]); this.n.push(N[0], N[1], N[2]); this.c.push(S.col[0], S.col[1], S.col[2]);
      this.f.push(fv[k][0], fv[k][1], S.W || 0, S.kind); this.w.push(S.win[0], S.win[1], S.win[2], S.win[3]);
      this.o.push(S.opt[0], S.opt[1], S.opt[2], S.opt[3]); this.a.push(S.alt[0], S.alt[1], S.alt[2]); this.t.push(0, 0);
    }
    this.i.push(b, b + 1, b + 2); this.vc += 3;
  }
  build() {
    if (!this.vc) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    g.setAttribute('aFac', new THREE.Float32BufferAttribute(this.f, 4));
    g.setAttribute('aWin', new THREE.Float32BufferAttribute(this.w, 4));
    g.setAttribute('aOpt', new THREE.Float32BufferAttribute(this.o, 4));
    g.setAttribute('aAlt', new THREE.Float32BufferAttribute(this.a, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.t, 2));
    g.setIndex(this.vc > 65535 ? new THREE.Uint32BufferAttribute(this.i, 1) : new THREE.Uint16BufferAttribute(this.i, 1));
    g.computeBoundingSphere(); g.computeBoundingBox();
    return g;
  }
}
function faceNormal(a, b, c) {
  const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
  let x = uy * vz - uz * vy, y = uz * vx - ux * vz, z = ux * vy - uy * vx; const l = Math.hypot(x, y, z) || 1;
  return [x / l, y / l, z / l];
}
const st = (kind, col, o = {}) => ({ kind, col, W: o.W || 0, win: o.win || [3, 2.5, 3, 0], opt: o.opt || [0, 0, 0, 0], alt: o.alt || [0.5, 0.5, 0.5] });

// vertical wall from base point a (left, seen from outside) to b (right), y0..y1
function wall(gb, ax, az, bx, bz, y0, y1, S, u0 = 0) {
  const len = Math.hypot(bx - ax, bz - az);
  gb.quad([[ax, y0, az], [bx, y0, bz], [bx, y1, bz], [ax, y1, az]], [[u0, y0], [u0 + len, y0], [u0 + len, y1], [u0, y1]], { ...S, W: S.W || len });
}
// axis-aligned box (skips the bottom face); facade coords in metres
function abox(gb, x0, y0, z0, x1, y1, z1, S, { top = true, sides = 15 } = {}) {
  if (sides & 4) wall(gb, x0, z1, x1, z1, y0, y1, S); // S
  if (sides & 2) wall(gb, x1, z1, x1, z0, y0, y1, S); // E
  if (sides & 1) wall(gb, x1, z0, x0, z0, y0, y1, S); // N
  if (sides & 8) wall(gb, x0, z0, x0, z1, y0, y1, S); // W
  if (top) gb.quad([[x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0]], [[x0, z1], [x1, z1], [x1, z0], [x0, z0]], S, [0, 1, 0]);
}
// a box in a local frame: origin o, right r (unit, horizontal), out n (unit, horizontal); extents in m
function lbox(gb, o, r, n, x0, x1, y0, y1, d0, d1, S, { bottom = false } = {}) {
  const P = (x, y, d) => [o[0] + r[0] * x + n[0] * d, y, o[2] + r[2] * x + n[2] * d];
  const q = (a, b, c, e, fv) => gb.quad([a, b, c, e], fv || [[0, 0], [1, 0], [1, 1], [0, 1]], S);
  const w = x1 - x0, h = y1 - y0, dd = d1 - d0;
  q(P(x0, y0, d1), P(x1, y0, d1), P(x1, y1, d1), P(x0, y1, d1), [[0, 0], [w, 0], [w, h], [0, h]]); // front
  q(P(x1, y0, d0), P(x0, y0, d0), P(x0, y1, d0), P(x1, y1, d0), [[0, 0], [w, 0], [w, h], [0, h]]); // back
  q(P(x1, y0, d1), P(x1, y0, d0), P(x1, y1, d0), P(x1, y1, d1), [[0, 0], [dd, 0], [dd, h], [0, h]]); // right
  q(P(x0, y0, d0), P(x0, y0, d1), P(x0, y1, d1), P(x0, y1, d0), [[0, 0], [dd, 0], [dd, h], [0, h]]); // left
  q(P(x0, y1, d1), P(x1, y1, d1), P(x1, y1, d0), P(x0, y1, d0), [[0, 0], [w, 0], [w, dd], [0, dd]]); // top
  if (bottom) q(P(x0, y0, d0), P(x1, y0, d0), P(x1, y0, d1), P(x0, y0, d1), [[0, 0], [w, 0], [w, dd], [0, dd]]);
}
// face frames: for side d (0 N, 1 E, 2 S, 3 W) of rect [x0,x1]×[z0,z1]: left/right base points seen from outside
function sideFrame(d, x0, z0, x1, z1) {
  if (d === 0) return { a: [x1, z0], b: [x0, z0], n: [0, -1] };
  if (d === 1) return { a: [x1, z1], b: [x1, z0], n: [1, 0] };
  if (d === 2) return { a: [x0, z1], b: [x1, z1], n: [0, 1] };
  return { a: [x0, z0], b: [x0, z1], n: [-1, 0] };
}

// ---------------------------------------------------------------- planning
const SET = { oldtown: 2.6, downtown: 2.9, harbor: 2.6, hills: 4.6 };
function lotRect(city, lot) {
  const xs = lot.tiles.map((i) => city.tiles[i].x), zs = lot.tiles.map((i) => city.tiles[i].z);
  const tx0 = Math.min(...xs), tx1 = Math.max(...xs), tz0 = Math.min(...zs), tz1 = Math.max(...zs);
  // what borders each side: road > alley > park/yard > lot
  const border = (d) => {
    const out = new Set();
    const along = d === 0 || d === 2 ? xs.filter((v, i, a) => a.indexOf(v) === i).map((x) => [x, d === 0 ? tz0 - 1 : tz1 + 1]) : zs.filter((v, i, a) => a.indexOf(v) === i).map((z) => [d === 3 ? tx0 - 1 : tx1 + 1, z]);
    for (const [x, z] of along) { const t = city.tiles[z * city.W + x]; out.add(!t ? 'edge' : t.k === K.ROAD ? 'road' : t.k === K.ALLEY ? 'alley' : t.k === K.LOT && t.lot != null ? 'lot' : 'open'); }
    return out.has('road') ? 'road' : out.has('alley') ? 'alley' : out.has('edge') ? 'road' : out.has('open') ? 'open' : 'lot';
  };
  return { x0: (tx0 - 0.5) * T, x1: (tx1 + 0.5) * T, z0: (tz0 - 0.5) * T, z1: (tz1 + 0.5) * T, sides: [0, 1, 2, 3].map(border) };
}

function plan(city, lot) {
  const rng = mulberry32(lot.id * 7919 + 1013);
  const d = lot.d, P = PAL[d];
  const R = lotRect(city, lot);
  const spec = { lot, d, rng, seed: rng(), front: lot.front, sides: R.sides };
  const big = lot.w === 2 && lot.dep === 2, wide = lot.w * lot.dep === 2;
  const special = lot.special;
  let type = 'house';
  if (d === 'hills' && !special) type = 'villa';
  else if (d === 'downtown' && big && !special) type = rng() < 0.75 ? 'tower' : 'block';
  else if (d === 'downtown' && !special) type = 'block';
  else if (d === 'harbor' && !special && (big || (wide && rng() < 0.5))) type = 'warehouse';
  spec.type = type;
  // insets: deep setback on road sides (a real sidewalk), small gaps to alleys/parks, none between neighbours
  const sb = SET[d];
  const ins = R.sides.map((s) => s === 'road' ? sb : s === 'alley' ? 0.9 : s === 'open' ? 0.5 : 0);
  if (type === 'villa') for (let k = 0; k < 4; k++) ins[k] = R.sides[k] === 'road' ? sb : 1.8;
  if (type === 'tower') for (let k = 0; k < 4; k++) ins[k] = Math.max(ins[k], 1.2);
  if (type === 'warehouse') for (let k = 0; k < 4; k++) ins[k] = Math.max(ins[k], R.sides[k] === 'road' ? 3.2 : 1.0);
  spec.x0 = R.x0 + ins[3]; spec.x1 = R.x1 - ins[1]; spec.z0 = R.z0 + ins[0]; spec.z1 = R.z1 - ins[2];
  spec.road = [0, 1, 2, 3].filter((k) => R.sides[k] === 'road');
  if (!spec.road.includes(lot.front)) spec.road.unshift(lot.front);
  return dress(spec, { big, wide, special });
}

// storeys, rhythm, style, shopfront for a placed footprint
function dress(spec, { big = false, wide = false, special = null } = {}) {
  const { rng, d, type } = spec, P = PAL[d];
  const lot = spec.lot;
  const pickWall = () => pick(rng, P.walls);
  spec.fh = 3.0; spec.bay = 2.45; spec.wst = 0; spec.shut = 0; spec.roof = 'flat';
  spec.wall = pickWall(); spec.alt = pick(rng, P.shut); spec.roofCol = pick(rng, P.roof);
  spec.balMask = 0; spec.balPat = 0; spec.shop = false; spec.sign = null; spec.awning = null;
  if (type === 'house') {
    spec.floors = d === 'oldtown' ? 3 + (rng() < 0.55 ? 1 : 0) + (rng() < 0.18 ? 1 : 0) : 2 + (rng() < 0.6 ? 1 : 0) + (rng() < 0.25 ? 1 : 0);
    spec.wst = rng() < (d === 'harbor' ? 0.45 : 0.3) ? 1 : 0;
    if (d === 'oldtown' && rng() < 0.28) { spec.wst = 5; spec.wall = pick(rng, P.brick); }
    spec.shut = rng() < (d === 'harbor' ? 0.75 : 0.55) ? 1 : 0;
    spec.roof = rng() < (d === 'harbor' ? 0.65 : 0.5) ? 'hip' : 'flat';
    spec.shop = rng() < (d === 'oldtown' ? 0.85 : 0.6);
    if (rng() < 0.45) { spec.balMask = rng() < 0.5 ? 1 : 1 | 2 | 4; spec.balPat = 1 + Math.floor(rng() * 3); }
  } else if (type === 'block') {
    spec.floors = (wide ? 6 : 5) + Math.floor(rng() * 3) + (big ? 2 : 0);
    spec.fh = 3.2; spec.bay = 2.6;
    const brick = rng() < 0.3;
    spec.wall = brick ? pick(rng, P.brick) : pickWall();
    spec.wst = brick ? 5 : rng() < 0.3 ? 3 : rng() < 0.4 ? 1 : 0;
    spec.shut = 0; spec.shop = rng() < 0.75;
    if (spec.wst < 3 && rng() < 0.4) { spec.balMask = 2 | 8; spec.balPat = 2 + Math.floor(rng() * 2); }
  } else if (type === 'tower') {
    spec.floors = 10 + Math.floor(rng() * 12); spec.fh = 3.4; spec.glass = pick(rng, P.glass); spec.shop = true;
    spec.wall = pick(rng, ['#e8edf2', '#d9dee6', '#f0ebe2', '#c9ced8']);
  } else if (type === 'warehouse') {
    spec.floors = 1; spec.fh = 6.5 + rng() * 1.5; spec.wall = pick(rng, WARE); spec.roof = 'gable'; spec.roofCol = pick(rng, ['#8a929c', '#b8563a', '#6f8fa8']);
  } else if (type === 'villa') {
    spec.floors = 2; spec.fh = 3.0; spec.bay = 2.8; spec.wst = 4; spec.shut = 1; spec.roof = 'hip';
    if (rng() < 0.5) { spec.balMask = 1; spec.balPat = 3; }
  }
  if (special) {
    // restaurants, garage, office: a two/three-storey townhouse with a shopfront in the brand colour
    spec.type = 'house'; spec.special = special;
    spec.floors = special === 'office' ? 4 : 2 + (rng() < 0.5 ? 1 : 0);
    spec.shop = true; spec.roof = 'flat'; spec.balMask = 0;
    if (d === 'hills') { spec.wall = pick(rng, PAL.hills.walls); }
    if (special === 'restaurant') { const r = RESTAURANT[lot.rest]; spec.brand = r.color; spec.sign = r.name; spec.awning = r.color; spec.rest = r; }
    else if (special === 'garage') { spec.brand = '#2b2f3a'; spec.sign = 'Moto Garage'; spec.awning = '#e8a92e'; spec.garage = true; }
    else { spec.brand = '#2e6db4'; spec.sign = 'Dispatch Co.'; spec.awning = '#2e6db4'; }
  } else if (spec.shop && type !== 'warehouse') {
    const list = SHOPS[d];
    if (list.length && rng() < 0.7) { const [name, bg] = pick(rng, list); spec.sign = name; spec.brand = bg; }
    else spec.brand = pick(rng, ['#2f5d4a', '#3b4f8f', '#7a2f3a', '#2b2f3a', '#3f6f5b', '#8a4a2a']);
    spec.awning = rng() < 0.85 ? pick(rng, AWN) : null;
  }
  spec.gh = spec.shop ? (type === 'block' || type === 'tower' ? 4.3 : 3.8) : spec.fh;
  spec.H = spec.gh + (spec.floors - 1) * spec.fh;
  if (type === 'tower') spec.H = spec.gh + spec.fh; // podium; the tower rises from it
  return spec;
}

// ---------------------------------------------------------------- emit
function emit(spec, base, det, out) {
  const { rng, x0, x1, z0, z1, H, fh, gh, bay } = spec;
  const wc = lin(spec.wall), alt = lin(spec.brand || spec.alt);
  const trimCol = lin(spec.wst === 5 ? '#efe4d0' : '#fbf3e4');
  const win = [fh, bay, gh, spec.seed];
  const faceKind = (k) => spec.type === 'warehouse' ? KIND.CORR : spec.shop && spec.road.includes(k) ? KIND.SHOP : k === spec.front ? KIND.ENTRY : KIND.FACADE;
  const optFor = (k) => [spec.road.includes(k) ? spec.balMask : 0, spec.balPat, spec.wst, spec.shut];
  const W = x1 - x0, D = z1 - z0;

  // ---- shell ----
  for (let k = 0; k < 4; k++) {
    const f = sideFrame(k, x0, z0, x1, z1);
    const kind = faceKind(k);
    wall(base, f.a[0], f.a[1], f.b[0], f.b[1], 0, H, st(kind, wc, { win, opt: optFor(k), alt: kind === KIND.SHOP ? alt : lin(spec.alt) }));
  }
  // ---- roofs ----
  if (spec.type === 'tower') emitTower(spec, base, det);
  else if (spec.roof === 'hip') hipRoof(base, x0, z0, x1, z1, H, lin(spec.roofCol), trimCol, rng, wc);
  else if (spec.roof === 'gable') gableRoof(base, x0, z0, x1, z1, H, lin(spec.roofCol), wc);
  else flatRoof(base, det, x0, z0, x1, z1, H, trimCol, spec, rng);

  // ---- warehouse doors ----
  if (spec.type === 'warehouse') {
    for (const k of spec.road) {
      const f = sideFrame(k, x0, z0, x1, z1), len = Math.hypot(f.b[0] - f.a[0], f.b[1] - f.a[1]);
      const r = [(f.b[0] - f.a[0]) / len, 0, (f.b[1] - f.a[1]) / len], n = [f.n[0], 0, f.n[1]];
      const nd = Math.max(1, Math.floor(len / 8));
      for (let i = 0; i < nd; i++) {
        const cx = len * (i + 0.5) / nd;
        lbox(base, [f.a[0], 0, f.a[1]], r, n, cx - 2.1, cx + 2.1, 0, 4.6, 0, 0.08, st(KIND.CORR, lin(pick(rng, ['#4f6f8a', '#8a4a3a', '#3f5f4a', '#d9a03a'])), { W: 4.2 }));
        lbox(base, [f.a[0], 0, f.a[1]], r, n, cx - 2.35, cx + 2.35, 4.6, 4.85, 0, 0.18, st(KIND.TRIM, lin('#6b6f78')));
      }
      // a row of high windows
      for (let x = 1.5; x < len - 1.5; x += 2.2) lbox(base, [f.a[0], 0, f.a[1]], r, n, x - 0.7, x + 0.7, H - 1.6, H - 0.7, 0, 0.04, st(KIND.CURTAIN, lin('#48606f'), { win: [3, 1.4, 0, spec.seed], alt: lin('#6fa0c0') }));
    }
    return;
  }

  // ---- the front door (same bay the shader paints it in): where NPCs come out in arrival scenes ----
  if (spec.lot && spec.lot.id >= 0) {
    const f = sideFrame(spec.front, x0, z0, x1, z1);
    const len = Math.hypot(f.b[0] - f.a[0], f.b[1] - f.a[1]);
    const nb = Math.max(1, Math.floor((len - 0.6) / bay)), m = (len - nb * bay) / 2;
    const db = spec.shop ? Math.max(0, Math.floor(nb * 0.5 + (spec.seed > 0.5 ? 0 : -0.4))) : Math.floor(nb * 0.5);
    const u = m + (db + 0.5) * bay, rx = (f.b[0] - f.a[0]) / len, rz = (f.b[1] - f.a[1]) / len;
    spec.lot.doorPos = [f.a[0] + rx * u + f.n[0] * 0.45, f.a[1] + rz * u + f.n[1] * 0.45];
    spec.doorBay = db;
  }

  // ---- street faces: shopfront dressing, balconies, flower boxes ----
  for (const k of spec.road) {
    const f = sideFrame(k, x0, z0, x1, z1);
    const len = Math.hypot(f.b[0] - f.a[0], f.b[1] - f.a[1]);
    const o = [f.a[0], 0, f.a[1]], r = [(f.b[0] - f.a[0]) / len, 0, (f.b[1] - f.a[1]) / len], n = [f.n[0], 0, f.n[1]];
    const nb = Math.max(1, Math.floor((len - 0.6) / bay)), m = (len - nb * bay) / 2;
    const bc = (i) => m + (i + 0.5) * bay;
    const upper = spec.type === 'tower' ? 1 : spec.floors - 1;
    // shopfront: awnings, a name board
    if (spec.shop) {
      const awn = spec.awning ? lin(spec.awning) : null;
      if (awn) {
        const full = !!spec.special || rng() < 0.6;
        const aS = st(KIND.AWNING, wc, { alt: awn, win: [0, 0, 0, spec.special ? 0.3 : rng()] });
        if (full) awning(det, o, r, n, m - 0.12, len - m + 0.12, gh - 0.9, 1.75, aS);
        else for (let i = 0; i < nb; i++) awning(det, o, r, n, bc(i) - bay * 0.48, bc(i) + bay * 0.48, gh - 0.9, 1.45, aS);
      }
      if (spec.sign && k === spec.front) {
        const e = signAtlas().by[spec.sign];
        if (e) {
          const h = 0.72, w = Math.min(len - 2 * m + 0.2, h * 4.0), cx = len / 2;
          const S = st(KIND.TRIM, alt);
          lbox(det, o, r, n, cx - w / 2 - 0.04, cx + w / 2 + 0.04, gh - 0.84, gh - 0.84 + h, 0, 0.07, S);
          const P = (x, y) => [o[0] + r[0] * x + n[0] * 0.075, y, o[2] + r[2] * x + n[2] * 0.075];
          det.quad([P(cx - w / 2, gh - 0.84), P(cx + w / 2, gh - 0.84), P(cx + w / 2, gh - 0.84 + h), P(cx - w / 2, gh - 0.84 + h)], [[0, 0], [1, 0], [1, 1], [0, 1]],
            st(KIND.SIGN, [1, 1, 1]), [n[0], 0, n[2]], [[e.uv[0], e.uv[1]], [e.uv[2], e.uv[1]], [e.uv[2], e.uv[3]], [e.uv[0], e.uv[3]]]);
        }
      }
      if (spec.rest && k === spec.front) out.signs.push({ lot: spec.lot.id, model: spec.rest.model, x: o[0] + r[0] * len / 2 - n[0] * D * 0.2, z: o[2] + r[2] * len / 2 - n[2] * D * 0.2, y: H, rot: Math.atan2(n[0], n[2]) });
      if (spec.garage && k === spec.front) out.signs.push({ lot: spec.lot.id, model: 'garage', x: o[0] + r[0] * len / 2 + n[0] * 0.1, z: o[2] + r[2] * len / 2 + n[2] * 0.1, y: gh + 0.3, rot: Math.atan2(n[0], n[2]), facade: true });
      if (spec.special === 'office' && k === spec.front) out.signs.push({ lot: spec.lot.id, model: 'office', x: o[0] + r[0] * len / 2 - n[0] * D * 0.25, z: o[2] + r[2] * len / 2 - n[2] * D * 0.25, y: H, rot: Math.atan2(n[0], n[2]) });
      // street furniture in front of cafés and restaurants
      if ((spec.special === 'restaurant' || /Café|Gelato|Bistro|Bakery|Ice Cream|Wine/.test(spec.sign || '')) && len > 6) {
        for (let i = 0; i < nb; i++) if ((i % 2 === 0 || nb < 3) && !(k === spec.front && i === spec.doorBay)) out.props.push({ type: rng() < 0.5 ? 'cafe_set_a' : 'cafe_set_b', x: o[0] + r[0] * bc(i) + n[0] * 1.55, z: o[2] + r[2] * bc(i) + n[2] * 1.55, rot: Math.atan2(n[0], n[2]) + (rng() - 0.5) * 0.4 });
        if (rng() < 0.7) out.props.push({ type: 'chalkboard', x: o[0] + r[0] * (m + 0.3) + n[0] * 0.9, z: o[2] + r[2] * (m + 0.3) + n[2] * 0.9, rot: Math.atan2(n[0], n[2]) + 0.3 });
      } else if (rng() < 0.45) {
        out.props.push({ type: rng() < 0.6 ? 'planter' : 'flower_pot', x: o[0] + r[0] * bc(Math.floor(rng() * nb)) + n[0] * 0.55, z: o[2] + r[2] * bc(Math.floor(rng() * nb)) + n[2] * 0.55, rot: Math.atan2(r[0], r[2]) });
      }
    }
    // balconies and flower boxes on the upper floors
    if (spec.type === 'tower') continue;
    const ww = bay * (spec.wst === 4 ? 0.55 : 0.42);
    for (let fi = 0; fi < upper; fi++) {
      const fy0 = gh + fi * fh;
      const balcRow = (spec.balMask >> fi) & 1;
      for (let i = 0; i < nb; i++) {
        const balc = balcRow && spec.balPat > 0 && (spec.balPat === 1 || (spec.balPat === 2 && i % 2 === 0 && nb > 1) || (spec.balPat === 3 && i === Math.floor(nb * 0.5)));
        const cx = bc(i);
        if (balc) {
          const bw = Math.min(bay * 0.92, ww + 1.0);
          lbox(det, o, r, n, cx - bw / 2, cx + bw / 2, fy0 - 0.02, fy0 + 0.12, 0, 0.75, st(KIND.TRIM, trimCol), { bottom: true });
          const rS = st(KIND.RAIL, [0.2, 0.2, 0.22], { alt: lin(spec.wst === 4 ? '#f2efe8' : '#2c2f36') });
          railing(det, o, r, n, cx - bw / 2 + 0.03, cx + bw / 2 - 0.03, fy0 + 0.12, 0.72, rS);
          if (rng() < 0.4) flowers(det, o, r, n, cx + bw / 2 - 0.35, fy0 + 0.12, 0.45, rng);
        } else if (spec.wst !== 3 && rng() < (spec.d === 'oldtown' || spec.d === 'harbor' ? 0.42 : spec.type === 'villa' ? 0.5 : 0.12)) {
          const y0 = fy0 + fh * 0.3;
          lbox(det, o, r, n, cx - ww / 2 - 0.05, cx + ww / 2 + 0.05, y0 - 0.3, y0 - 0.02, 0.02, 0.3, st(KIND.TRIM, lin(pick(rng, ['#b8673f', '#8a5a3a', '#f2efe8', '#3f6f4a']))));
          flowers(det, o, r, n, cx, y0 - 0.02, ww * 0.5, rng, 0.16);
        }
      }
    }
  }
  // chimneys on pitched roofs are added by hipRoof; flat roofs get rooftop clutter in flatRoof
}

function awning(gb, o, r, n, xa, xb, yTop, out, S) {
  const drop = out * 0.42, P = (x, y, d) => [o[0] + r[0] * x + n[0] * d, y, o[2] + r[2] * x + n[2] * d];
  const w = xb - xa, slope = Math.hypot(out, drop);
  // canvas (top + underside), valance front (both faces), side cheeks
  gb.quad([P(xa, yTop - drop, out), P(xb, yTop - drop, out), P(xb, yTop, 0.02), P(xa, yTop, 0.02)], [[0, 0], [w, 0], [w, 1], [0, 1]], S);
  gb.quad([P(xb, yTop - drop, out), P(xa, yTop - drop, out), P(xa, yTop, 0.02), P(xb, yTop, 0.02)], [[w, 0], [0, 0], [0, 1], [w, 1]], { ...S, col: S.col.map((c) => c * 0.8) });
  const V = { ...S, kind: KIND.VALANCE };
  gb.quad([P(xa, yTop - drop - 0.3, out), P(xb, yTop - drop - 0.3, out), P(xb, yTop - drop, out), P(xa, yTop - drop, out)], [[0, 0.3], [w, 0.3], [w, 0], [0, 0]], V);
  gb.quad([P(xb, yTop - drop - 0.3, out - 0.005), P(xa, yTop - drop - 0.3, out - 0.005), P(xa, yTop - drop, out - 0.005), P(xb, yTop - drop, out - 0.005)], [[w, 0.3], [0, 0.3], [0, 0], [w, 0]], V);
  for (const x of [xa, xb]) {
    gb.tri([P(x, yTop - drop, out), P(x, yTop, 0.02), P(x, yTop - drop, 0.02)], [[0, 0], [0.5, 1], [1, 0]], S);
    gb.tri([P(x, yTop - drop, out), P(x, yTop - drop, 0.02), P(x, yTop, 0.02)], [[0, 0], [1, 0], [0.5, 1]], S);
  }
  void slope;
}
function railing(gb, o, r, n, xa, xb, y0, d, S) {
  const h = 1.0, P = (x, y, dd) => [o[0] + r[0] * x + n[0] * dd, y, o[2] + r[2] * x + n[2] * dd], w = xb - xa;
  const q = (a, b, c, e, fv) => gb.quad([a, b, c, e], fv, S);
  q(P(xa, y0, d), P(xb, y0, d), P(xb, y0 + h, d), P(xa, y0 + h, d), [[0, 0], [w, 0], [w, 1], [0, 1]]);
  q(P(xb, y0, d - 0.01), P(xa, y0, d - 0.01), P(xa, y0 + h, d - 0.01), P(xb, y0 + h, d - 0.01), [[w, 0], [0, 0], [0, 1], [w, 1]]);
  for (const [x, s] of [[xa, -1], [xb, 1]]) {
    q(P(x, y0, s > 0 ? d : 0.02), P(x, y0, s > 0 ? 0.02 : d), P(x, y0 + h, s > 0 ? 0.02 : d), P(x, y0 + h, s > 0 ? d : 0.02), [[0, 0], [d, 0], [d, 1], [0, 1]]);
    q(P(x, y0, s > 0 ? 0.02 : d), P(x, y0, s > 0 ? d : 0.02), P(x, y0 + h, s > 0 ? d : 0.02), P(x, y0 + h, s > 0 ? 0.02 : d), [[d, 0], [0, 0], [0, 1], [d, 1]]);
  }
}
const FLOWER = ['#e8433f', '#ff7aa8', '#ffffff', '#ffd23f', '#d63a7a', '#ff9a3c'];
function flowers(gb, o, r, n, cx, y, halfW, rng, depth = 0.16) {
  const leaf = st(KIND.TRIM, lin('#4f8f3a'));
  lbox(gb, o, r, n, cx - halfW, cx + halfW, y, y + 0.16, 0.06, 0.28, leaf);
  const k = Math.max(3, Math.round(halfW * 7));
  for (let i = 0; i < k; i++) {
    const x = cx - halfW + (i + 0.5) * (2 * halfW / k) + (rng() - 0.5) * 0.06, s = 0.07 + rng() * 0.05, yy = y + 0.14 + rng() * 0.1, dd = 0.1 + rng() * depth;
    lbox(gb, o, r, n, x - s, x + s, yy, yy + s * 1.6, dd - s, dd + s, st(KIND.TRIM, lin(pick(rng, FLOWER))));
  }
}

function flatRoof(base, det, x0, z0, x1, z1, H, trimCol, spec, rng) {
  const tr = st(KIND.TRIM, trimCol);
  base.quad([[x0, H, z1], [x1, H, z1], [x1, H, z0], [x0, H, z0]], [[0, 0], [1, 0], [1, 1], [0, 1]], st(KIND.FLAT, lin(pick(rng, ['#b9b2a6', '#a9a49c', '#c4b8a4', '#9ea3a8']))), [0, 1, 0]);
  // cornice + parapet: protrudes outside, rises above the roof
  const p = 0.24, t = 0.3, y0 = H - 0.38, y1 = H + 0.55;
  abox(base, x0 - p, y0, z0 - p, x1 + p, y1, z0 + t, tr, { sides: 1 | 2 | 8 });
  abox(base, x0 - p, y0, z1 - t, x1 + p, y1, z1 + p, tr, { sides: 4 | 2 | 8 });
  abox(base, x0 - p, y0, z0 + t, x0 + t, y1, z1 - t, tr, { sides: 8 | 2 });
  abox(base, x1 - t, y0, z0 + t, x1 + p, y1, z1 - t, tr, { sides: 2 | 8 });
  // cornice underside lip
  const lip = st(KIND.TRIM, trimCol.map((c) => c * 0.8));
  for (const [ax, az, bx, bz] of [[x0 - p, z1 + p, x1 + p, z1 + p], [x1 + p, z0 - p, x0 - p, z0 - p]]) wall(base, ax, az, bx, bz, y0 - 0.12, y0, lip);
  // rooftop clutter: AC units, a stair hut, maybe a water tank
  const W = x1 - x0, D = z1 - z0;
  const n = spec.d === 'downtown' ? 3 : 1 + (rng() < 0.5 ? 1 : 0);
  for (let i = 0; i < n; i++) {
    const w = 0.9 + rng() * 1.4, d = 0.8 + rng() * 1.0, h = 0.7 + rng() * 0.9;
    const cx = x0 + 1 + w / 2 + rng() * Math.max(0, W - 2 - w), cz = z0 + 1 + d / 2 + rng() * Math.max(0, D - 2 - d);
    abox(det, cx - w / 2, H, cz - d / 2, cx + w / 2, H + h, cz + d / 2, st(KIND.TRIM, lin(pick(rng, ['#c9ccd2', '#b5b9c0', '#d8d2c6']))));
  }
  if (spec.d === 'downtown' && rng() < 0.35) {
    const cx = x0 + W * (0.3 + rng() * 0.4), cz = z0 + D * (0.3 + rng() * 0.4);
    tank(det, cx, H, cz, rng);
  }
}
function tank(gb, cx, y, cz, rng) {
  const legs = st(KIND.TRIM, lin('#4a4a50')), wood = st(KIND.TRIM, lin('#9a6a45')), cap = st(KIND.TRIM, lin('#5a5f66'));
  for (const [dx, dz] of [[-0.8, -0.8], [0.8, -0.8], [0.8, 0.8], [-0.8, 0.8]]) abox(gb, cx + dx - 0.08, y, cz + dz - 0.08, cx + dx + 0.08, y + 2, cz + dz + 0.08, legs, { top: false });
  const N = 8, R = 1.25, y0 = y + 2, y1 = y + 4.4;
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2, b = ((i + 1) / N) * Math.PI * 2;
    const A = [cx + Math.sin(a) * R, cz + Math.cos(a) * R], B = [cx + Math.sin(b) * R, cz + Math.cos(b) * R];
    gb.quad([[A[0], y0, A[1]], [B[0], y0, B[1]], [B[0], y1, B[1]], [A[0], y1, A[1]]], [[0, 0], [1, 0], [1, 1], [0, 1]], wood);
    gb.tri([[A[0], y1, A[1]], [B[0], y1, B[1]], [cx, y1 + 0.9, cz]], [[0, 0], [1, 0], [0.5, 1]], cap);
  }
  void rng;
}
function hipRoof(gb, x0, z0, x1, z1, H, col, trimCol, rng, wallCol) {
  const ov = 0.42, X0 = x0 - ov, X1 = x1 + ov, Z0 = z0 - ov, Z1 = z1 + ov, W = X1 - X0, D = Z1 - Z0;
  const rh = Math.min(W, D) * 0.3, y = H, yr = H + rh;
  const S = st(KIND.ROOF, col);
  const face = (pts, e0, e1) => {
    const ex = e1[0] - e0[0], ez = e1[2] - e0[2], el = Math.hypot(ex, ez), dx = ex / el, dz = ez / el;
    const fv = pts.map((p) => { const px = p[0] - e0[0], pz = p[2] - e0[2], u = px * dx + pz * dz; const ox = px - u * dx, oz = pz - u * dz; return [u, Math.hypot(ox, oz, p[1] - e0[1])]; });
    if (pts.length === 4) gb.quad(pts, fv, S); else gb.tri(pts, fv, S);
  };
  if (W >= D) {
    const zc = (Z0 + Z1) / 2, ra = X0 + D / 2, rb = X1 - D / 2;
    face([[X0, y, Z1], [X1, y, Z1], [rb, yr, zc], [ra, yr, zc]], [X0, y, Z1], [X1, y, Z1]);
    face([[X1, y, Z0], [X0, y, Z0], [ra, yr, zc], [rb, yr, zc]], [X1, y, Z0], [X0, y, Z0]);
    face([[X1, y, Z1], [X1, y, Z0], [rb, yr, zc]], [X1, y, Z1], [X1, y, Z0]);
    face([[X0, y, Z0], [X0, y, Z1], [ra, yr, zc]], [X0, y, Z0], [X0, y, Z1]);
  } else {
    const xc = (X0 + X1) / 2, ra = Z0 + W / 2, rb = Z1 - W / 2;
    face([[X1, y, Z1], [X1, y, Z0], [xc, yr, ra], [xc, yr, rb]], [X1, y, Z1], [X1, y, Z0]);
    face([[X0, y, Z0], [X0, y, Z1], [xc, yr, rb], [xc, yr, ra]], [X0, y, Z0], [X0, y, Z1]);
    face([[X0, y, Z1], [X1, y, Z1], [xc, yr, rb]], [X0, y, Z1], [X1, y, Z1]);
    face([[X1, y, Z0], [X0, y, Z0], [xc, yr, ra]], [X1, y, Z0], [X0, y, Z0]);
  }
  // eave fascia + soffit
  const fa = st(KIND.TRIM, trimCol.map((c) => c * 0.92)), so = st(KIND.TRIM, wallCol.map((c) => c * 0.7));
  for (const [ax, az, bx, bz] of [[X0, Z1, X1, Z1], [X1, Z1, X1, Z0], [X1, Z0, X0, Z0], [X0, Z0, X0, Z1]]) wall(gb, ax, az, bx, bz, y - 0.2, y + 0.02, fa);
  gb.quad([[X0, y - 0.2, Z0], [X1, y - 0.2, Z0], [X1, y - 0.2, Z1], [X0, y - 0.2, Z1]], [[0, 0], [1, 0], [1, 1], [0, 1]], so, [0, -1, 0]);
  // a chimney or two
  const nc = rng() < 0.7 ? 1 + (rng() < 0.4 ? 1 : 0) : 0;
  for (let i = 0; i < nc; i++) {
    const cx = x0 + 1.2 + rng() * Math.max(0.1, x1 - x0 - 2.4), cz = z0 + 1.2 + rng() * Math.max(0.1, z1 - z0 - 2.4);
    const ch = st(KIND.TRIM, wallCol.map((c) => c * 0.88));
    abox(gb, cx - 0.32, H, cz - 0.32, cx + 0.32, yr + 0.7, cz + 0.32, ch);
    abox(gb, cx - 0.4, yr + 0.7, cz - 0.4, cx + 0.4, yr + 0.85, cz + 0.4, st(KIND.TRIM, lin('#7a5a4a')));
  }
}
function gableRoof(gb, x0, z0, x1, z1, H, col, wallCol) {
  const ov = 0.35, W = x1 - x0, D = z1 - z0;
  const S = st(KIND.CORR, col), G = st(KIND.CORR, wallCol);
  if (W >= D) {
    const zc = (z0 + z1) / 2, rh = D * 0.22, X0 = x0 - ov, X1 = x1 + ov;
    const sl = Math.hypot(D / 2 + ov, rh);
    gb.quad([[X0, H - 0.1, z1 + ov], [X1, H - 0.1, z1 + ov], [X1, H + rh, zc], [X0, H + rh, zc]], [[0, 0], [X1 - X0, 0], [X1 - X0, sl], [0, sl]], S);
    gb.quad([[X1, H - 0.1, z0 - ov], [X0, H - 0.1, z0 - ov], [X0, H + rh, zc], [X1, H + rh, zc]], [[0, 0], [X1 - X0, 0], [X1 - X0, sl], [0, sl]], S);
    gb.tri([[x1, H, z1], [x1, H, z0], [x1, H + rh, zc]], [[0, H], [D, H], [D / 2, H + rh]], G);
    gb.tri([[x0, H, z0], [x0, H, z1], [x0, H + rh, zc]], [[0, H], [D, H], [D / 2, H + rh]], G);
  } else {
    const xc = (x0 + x1) / 2, rh = W * 0.22, Z0 = z0 - ov, Z1 = z1 + ov;
    const sl = Math.hypot(W / 2 + ov, rh);
    gb.quad([[x1 + ov, H - 0.1, Z1], [x1 + ov, H - 0.1, Z0], [xc, H + rh, Z0], [xc, H + rh, Z1]], [[0, 0], [Z1 - Z0, 0], [Z1 - Z0, sl], [0, sl]], S);
    gb.quad([[x0 - ov, H - 0.1, Z0], [x0 - ov, H - 0.1, Z1], [xc, H + rh, Z1], [xc, H + rh, Z0]], [[0, 0], [Z1 - Z0, 0], [Z1 - Z0, sl], [0, sl]], S);
    gb.tri([[x0, H, z1], [x1, H, z1], [xc, H + rh, z1]], [[0, H], [W, H], [W / 2, H + rh]], G);
    gb.tri([[x1, H, z0], [x0, H, z0], [xc, H + rh, z0]], [[0, H], [W, H], [W / 2, H + rh]], G);
  }
}
function emitTower(spec, base, det) {
  const { x0, x1, z0, z1, H, rng } = spec;
  const trimCol = lin('#eef1f4');
  // podium roof
  base.quad([[x0, H, z1], [x1, H, z1], [x1, H, z0], [x0, H, z0]], [[0, 0], [1, 0], [1, 1], [0, 1]], st(KIND.FLAT, lin('#a9a49c')), [0, 1, 0]);
  abox(base, x0 - 0.2, H - 0.3, z0 - 0.2, x1 + 0.2, H + 0.5, z1 + 0.2, st(KIND.TRIM, trimCol), { top: false });
  // the tower: one or two tiers of curtain wall
  let tx0 = x0 + 2.2, tx1 = x1 - 2.2, tz0 = z0 + 2.2, tz1 = z1 - 2.2;
  let y = H, floors = spec.floors;
  const tiers = rng() < 0.5 ? 2 : 1;
  const frame = lin(spec.wall), glass = lin(spec.glass);
  for (let t = 0; t < tiers; t++) {
    const fl = tiers === 2 && t === 0 ? Math.ceil(floors * 0.65) : tiers === 2 ? floors - Math.ceil(floors * 0.65) : floors;
    const h = fl * spec.fh;
    for (let k = 0; k < 4; k++) {
      const f = sideFrame(k, tx0, tz0, tx1, tz1);
      wall(base, f.a[0], f.a[1], f.b[0], f.b[1], y, y + h, st(KIND.CURTAIN, frame, { win: [spec.fh, 1.6, 0, spec.seed + t], alt: glass }));
    }
    abox(base, tx0 - 0.15, y + h - 0.2, tz0 - 0.15, tx1 + 0.15, y + h + 0.6, tz1 + 0.15, st(KIND.TRIM, frame), { top: false });
    base.quad([[tx0, y + h, tz1], [tx1, y + h, tz1], [tx1, y + h, tz0], [tx0, y + h, tz0]], [[0, 0], [1, 0], [1, 1], [0, 1]], st(KIND.FLAT, lin('#9ea3a8')), [0, 1, 0]);
    y += h;
    if (t === 0 && tiers === 2) { const s = 1.6; tx0 += s; tx1 -= s; tz0 += s; tz1 -= s; }
  }
  // crown: plant room + antenna
  const cx = (tx0 + tx1) / 2, cz = (tz0 + tz1) / 2, cw = Math.min(tx1 - tx0, tz1 - tz0) * 0.35;
  abox(det, cx - cw, y, cz - cw, cx + cw, y + 2.4, cz + cw, st(KIND.TRIM, frame));
  if (rng() < 0.6) abox(det, cx - 0.12, y + 2.4, cz - 0.12, cx + 0.12, y + 9, cz + 0.12, st(KIND.TRIM, lin('#d0d4da')));
  spec.top = y;
}

// ---------------------------------------------------------------- street dressing (sidewalks)
function streetProps(city, out) {
  const rng = mulberry32(4242);
  const W = city.W;
  const isRoad = (x, z) => { const t = city.tiles[z * W + x]; return t && t.k === K.ROAD; };
  for (const t of city.tiles) {
    if (t.k !== K.ROAD || t.piece !== 'straight') continue;
    const horiz = (t.mask & 0b1010) === 0b1010; // runs E–W → sidewalks on N/S
    for (const side of [-1, 1]) {
      // sidewalk band: 4.45 m off the road centre (Kenney sidewalk), along-road offsets inside the tile
      const ox = horiz ? 0 : side * 4.55, oz = horiz ? side * 4.55 : 0;
      const nx = t.x + (horiz ? 0 : side), nz = t.z + (horiz ? side : 0);
      const outside = nx < 0 || nz < 0 || nx >= W || nz >= city.H;
      const beyond = outside ? { k: K.LOT } : city.tiles[nz * W + nx];
      if (beyond.k === K.ROAD) continue;
      const along = (a) => [t.x * T + ox + (horiz ? a : 0), t.z * T + oz + (horiz ? 0 : a)];
      const faceRot = horiz ? (side > 0 ? Math.PI : 0) : (side > 0 ? -Math.PI / 2 : Math.PI / 2); // faces the road
      const d = t.d;
      const treeOK = beyond.k !== K.PARK && !(beyond.k === K.ALLEY);
      const k = (t.x * 31 + t.z * 17 + (side > 0 ? 7 : 0)) % 4;
      // trees (palms on the harbor), one per tile per side, staggered
      if (treeOK) {
        const [x, z] = along(k % 2 ? 2.2 : -2.2);
        const type = d === 'harbor' ? (rng() < 0.5 ? 'palm_a' : 'palm_b') : d === 'downtown' ? (rng() < 0.5 ? 'tree_round_b' : 'tree_round_c') : rng() < 0.45 ? 'tree_round_a' : rng() < 0.6 ? 'tree_round_b' : 'tree_round_c';
        if (d !== 'downtown' || rng() < 0.6) out.props.push({ type, x, z, rot: rng() * Math.PI * 2, s: 0.8 + rng() * 0.18 });
      }
      // lamps every other tile, on alternating sides
      if ((t.x + t.z + (side > 0 ? 1 : 0)) % 2 === 0) {
        const [x, z] = along(k % 2 ? -2.6 : 2.6);
        out.props.push({ type: d === 'downtown' && rng() < 0.4 ? 'street_lamp_double' : 'street_lamp', x, z, rot: faceRot, lamp: true });
      }
      // odds and ends
      if (rng() < 0.12) { const [x, z] = along((rng() - 0.5) * 6); out.props.push({ type: pick(rng, ['bench', 'trash_bin', 'bollard', 'hydrant', 'bench']), x: x - (horiz ? 0 : side * 0.15), z: z - (horiz ? side * 0.15 : 0), rot: faceRot }); }
    }
  }
  void isRoad;
}

// ---------------------------------------------------------------- elevated railway
// A viaduct along the north side of the downtown avenue (tile row 20): pillars in the shop setback, the deck over
// the sidewalk and the north lane, running from the western fog into a tunnel in the eastern hills.
export const RAIL = { z0: 192.95, z1: 199.4, y: 9.2, x0: -320, x1: 640, pillarZ: 193.7, every: 20 };
function viaduct(gb, out) {
  const { z0, z1, y, x0, x1, pillarZ, every } = RAIL;
  const con = st(KIND.TRIM, lin('#ddd6ca')), dark = st(KIND.TRIM, lin('#8f8a84')), rail = st(KIND.TRIM, lin('#5a5550'));
  abox(gb, x0, y, z0, x1, y + 1.0, z1, con, { sides: 15 });
  gb.quad([[x0, y, z0], [x1, y, z0], [x1, y, z1], [x0, y, z1]], [[0, 0], [1, 0], [1, 1], [0, 1]], dark, [0, -1, 0]); // underside
  abox(gb, x0, y + 1.0, z0, x1, y + 1.9, z0 + 0.25, con); abox(gb, x0, y + 1.0, z1 - 0.25, x1, y + 1.9, z1, con);
  const zc = (z0 + z1) / 2 + 0.6;
  for (const dz of [-0.72, 0.72]) abox(gb, x0, y + 1.0, zc + dz - 0.07, x1, y + 1.16, zc + dz + 0.07, rail);
  for (let x = x0 + 10; x < x1; x += every) {
    abox(gb, x - 0.55, -0.5, pillarZ - 0.55, x + 0.55, y, pillarZ + 0.55, con, { top: false });
    abox(gb, x - 0.9, y - 0.6, pillarZ - 0.9, x + 0.9, y, z1 - 1.5, con, { top: false });
    out.pillars.push([x, pillarZ]);
  }
  // tunnel portal where the line meets the eastern hill
  abox(gb, x1 - 4, 0, z0 - 3, x1, y + 6, z1 + 3, st(KIND.TRIM, lin('#b9b0a2')));
  gb.quad([[x1 - 4.02, y, z1 - 0.5], [x1 - 4.02, y, z0 + 0.5], [x1 - 4.02, y + 4.2, z0 + 0.5], [x1 - 4.02, y + 4.2, z1 - 0.5]], [[0, 0], [1, 0], [1, 1], [0, 1]], st(KIND.TRIM, lin('#1c1a1a')), [-1, 0, 0]);
}

// ---------------------------------------------------------------- direction signs + harbour railing
// Green finger-post signs before some junctions ("Harbor →"), facing the driver, and a promenade railing on the quay.
const DEST = [['Old Town', 10, 32], ['Downtown', 11, 9], ['Harbor', 33, 33], ['Green Hills', 34, 9], ['Beach', 26, 47]];
function roadSigns(city, out) {
  const rng = mulberry32(8080);
  const at = (x, z) => city.tiles[z * city.W + x];
  const dest = [...DEST];
  if (city.clockTower >= 0) { const t = city.tiles[city.clockTower]; dest.push(['Clock Tower', t.x, t.z]); }
  // the atlas: one 512×112 board per (destination, arrow)
  const AW = 512, AH = 112, arrows = ['up', 'right', 'left'];
  const c = document.createElement('canvas'); c.width = AW * 2; c.height = AH * Math.ceil(dest.length * 3 / 2);
  const g = c.getContext('2d');
  const uvOf = {};
  dest.forEach(([name], di) => arrows.forEach((a, ai) => {
    const i = di * 3 + ai, x = (i % 2) * AW, y = Math.floor(i / 2) * AH;
    g.fillStyle = '#1f7a45'; g.fillRect(x, y, AW, AH);
    g.strokeStyle = '#ffffff'; g.lineWidth = 8; roundRect(g, x + 8, y + 8, AW - 16, AH - 16, 12); g.stroke();
    g.fillStyle = '#ffffff'; g.font = '58px "Fredoka", "Lilita One", system-ui, sans-serif'; g.textBaseline = 'middle';
    g.textAlign = 'left'; g.fillText(name, x + 34, y + AH / 2 + 3);
    // arrow glyph drawn as a path (fonts may lack arrows)
    const ax = x + AW - 62, ay = y + AH / 2;
    g.save(); g.translate(ax, ay); g.rotate(a === 'up' ? -Math.PI / 2 : a === 'left' ? Math.PI : 0);
    g.beginPath(); g.moveTo(-24, -8); g.lineTo(6, -8); g.lineTo(6, -22); g.lineTo(28, 0); g.lineTo(6, 22); g.lineTo(6, 8); g.lineTo(-24, 8); g.closePath(); g.fill(); g.restore();
    uvOf[name + '|' + a] = [x / c.width, 1 - (y + AH) / c.height, (x + AW) / c.width, 1 - y / c.height];
  }));
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  const pos = [], nrm = [], uv = [], idx = [];
  const BOARDS = [2.95, 2.6, 2.25]; // board centres on props.glb's sign_post (+0.2 m sidewalk)
  for (const t of city.tiles) {
    if (!t.junction || t.d === 'hills' && rng() < 0.6) continue;
    const avenue = t.x === 20 || t.x === 24 || t.z === 20;
    if (!avenue && rng() > 0.18) continue;
    for (let d = 0; d < 4; d++) {
      if (!(t.mask & (1 << ((d + 2) & 3))) || rng() < 0.45) continue; // approach heading d enters from the opposite side
      const f = DIRS[d], r = DIRS[(d + 1) & 3];
      // near-right corner of the junction, facing the driver
      const px = (t.x + (-f[0] + r[0]) * 0.46) * T, pz = (t.z + (-f[1] + r[1]) * 0.46) * T;
      const before = at(t.x - f[0], t.z - f[1]); if (!before || before.k !== K.ROAD) continue;
      const rot = Math.atan2(-f[0], -f[1]);
      const lines = [];
      for (const [name, dx, dz] of dest) {
        const vx = dx - t.x, vz = dz - t.z, dist = Math.hypot(vx, vz);
        if (dist < 7) continue;
        const fw = (vx * f[0] + vz * f[1]) / dist, rt = (vx * r[0] + vz * r[1]) / dist;
        if (fw < -0.5) continue;
        lines.push([dist, name, fw > 0.7 ? 'up' : rt > 0 ? 'right' : 'left']);
      }
      if (lines.length < 2) continue;
      lines.sort((a, b) => a[0] - b[0]);
      out.props.push({ type: 'sign_post', x: px, z: pz, rot });
      // board faces: local +Z is the front; text quads 1.1 × 0.27 just proud of the board (z 0.118)
      const cs = Math.cos(rot), sn = Math.sin(rot);
      const W2 = (lx, y, lz) => [px + lx * cs + lz * sn, y, pz - lx * sn + lz * cs];
      lines.slice(0, 3).forEach(([, name, a], k) => {
        const u = uvOf[name + '|' + a]; if (!u) return;
        const y = BOARDS[k] + 0.2, b = pos.length / 3;
        for (const [lx, ly] of [[-0.56, -0.118], [0.56, -0.118], [0.56, 0.118], [-0.56, 0.118]]) pos.push(...W2(lx, y + ly, 0.118));
        const n = [sn, 0, cs]; for (let q = 0; q < 4; q++) nrm.push(...n);
        uv.push(u[0], u[1], u[2], u[1], u[2], u[3], u[0], u[3]);
        idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
      });
    }
  }
  if (pos.length) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setIndex(idx); geo.computeBoundingSphere();
    out.signText = { geo, tex };
  }
  // promenade railing along the quay (south sidewalk of the waterfront road), leaving a gap for the pier
  const zq = (city.H - 0.5) * T - 0.12, pierX = (city.W * T) / 2 - T / 2 + 90;
  for (let x = -4; x < (city.W - 0.5) * T - 2; x += 2) { if (Math.abs(x + 1 - pierX) < 6) continue; out.props.push({ type: 'railing', x, z: zq, rot: 0 }); }
}

// ---------------------------------------------------------------- outskirts: more city past the edge roads
// Rows of buildings face the city across its outer roads (north, west, east; the south is the sea), a taller
// row stands behind them, and a far skyline of towers rises beyond downtown. Purely scenery.
function outskirts(city, put, far, ground) {
  const rng = mulberry32(31337);
  const E0 = -0.5 * T, E1 = (city.W - 0.5) * T;
  const dOf = (x, z) => districtOfBlock(Math.max(0, Math.min(10, Math.floor((x / T + 0.5) / 4))), Math.max(0, Math.min(10, Math.floor((z / T + 0.5) / 4))));
  let seed = 1;
  const make = (x0, z0, x1, z1, front, d, row) => {
    const r = mulberry32(9001 + seed++);
    if (z1 > RAIL.z0 - 3 && z0 < RAIL.z1 + 3) return; // the railway passes here
    let type = d === 'hills' ? 'villa' : d === 'downtown' ? (row === 2 && r() < 0.6 ? 'tower' : 'block') : d === 'harbor' && row > 0 && r() < 0.4 ? 'warehouse' : 'house';
    if (type === 'villa' && row > 0) return;
    const spec = { lot: { id: -1 }, d, rng: r, seed: r(), front, type, road: row === 0 ? [front] : [], sides: ['lot', 'lot', 'lot', 'lot'] };
    const inset = [0, 0, 0, 0];
    inset[front] = row === 0 ? SET[d] : row === 2 ? 1.5 : 0;
    if (type === 'villa') for (let k = 0; k < 4; k++) if (k !== front) inset[k] = 2;
    if (type === 'tower') for (let k = 0; k < 4; k++) inset[k] = Math.max(inset[k], 1.5);
    spec.x0 = x0 + inset[3]; spec.x1 = x1 - inset[1]; spec.z0 = z0 + inset[0]; spec.z1 = z1 - inset[2];
    dress(spec, { big: x1 - x0 > 15 && z1 - z0 > 15, wide: x1 - x0 > 15 || z1 - z0 > 15 });
    if (row === 1 && type !== 'warehouse') { spec.floors += 1 + Math.floor(r() * 2); spec.H = spec.gh + (spec.floors - 1) * spec.fh; }
    put(spec, (x0 + x1) / 2, (z0 + z1) / 2);
  };
  // rows along one side. axis: lots run along `a` (x for N, z for W/E); depth goes outward from `edge`
  const ROWS = [[0, 12], [12, 26], [36, 52]];
  const side = (front, edge, outward, a0, a1) => {
    for (let ri = 0; ri < ROWS.length; ri++) {
      const [dn, df] = ROWS[ri];
      let a = a0;
      while (a < a1) {
        const w = ri === 2 ? 18 + Math.floor(rng() * 2) * 6 : rng() < 0.25 ? 20 : 10;
        const b = Math.min(a1, a + w);
        const n0 = edge + outward * dn, n1 = edge + outward * df;
        const lo = Math.min(n0, n1), hi = Math.max(n0, n1);
        const mid = (a + b) / 2;
        if (front === 2) make(a, lo, b, hi, 2, dOf(mid, E0), ri);
        else make(lo, a, hi, b, front, dOf(front === 1 ? E0 : E1, mid), ri);
        a = b;
      }
    }
    ground(front, edge, outward);
  };
  side(2, E0, -1, E0 - 52, E1 + 52); // north, facing south
  side(1, E0, -1, E0, E1);           // west, facing east
  side(3, E1, 1, E0, E1);            // east, facing west
  // far skyline beyond downtown (north-west): towers, always drawn
  for (let i = 0; i < 16; i++) {
    const x = -140 + rng() * 380, z = -95 - rng() * 230;
    const w = 14 + rng() * 10, d2 = 14 + rng() * 10;
    const r = mulberry32(555 + i);
    const spec = { lot: { id: -1 }, d: 'downtown', rng: r, seed: r(), front: 2, type: 'tower', road: [], sides: ['lot', 'lot', 'lot', 'lot'], x0: x - w / 2, x1: x + w / 2, z0: z - d2 / 2, z1: z + d2 / 2 };
    dress(spec, { big: true });
    spec.floors = 14 + Math.floor(r() * 18);
    far(spec);
  }
}

// ---------------------------------------------------------------- entry point
const CHUNK = 9;
export function buildArchitecture(city) {
  signAtlas();
  const nC = Math.ceil(city.W / CHUNK);
  const chunks = new Map();
  const out = { signs: [], props: [], buildings: [], pillars: [] };
  const gbs = (lot) => {
    const cx = Math.floor(Math.max(0, Math.min(city.W - 1, lot.cx)) / CHUNK), cz = Math.floor(Math.max(0, Math.min(city.H - 1, lot.cz)) / CHUNK);
    const key = cz * nC + cx;
    let c = chunks.get(key); if (!c) chunks.set(key, (c = { cx, cz, base: new GB(), detail: new GB() }));
    return c;
  };
  for (const lot of city.lots) {
    const spec = plan(city, lot);
    const c = gbs(lot);
    emit(spec, c.base, c.detail, out);
    lot.h = spec.top || spec.H;
    out.buildings.push({ lot: lot.id, type: spec.type, x0: spec.x0, x1: spec.x1, z0: spec.z0, z1: spec.z1, h: lot.h });
  }
  const farGB = new GB();
  const pave = st(KIND.PAVE, lin('#d9cdb8'));
  outskirts(city,
    (spec, x, z) => { const c = gbs({ cx: x / T, cz: z / T }); emit(spec, c.base, c.detail, out); },
    (spec) => emit(spec, farGB, farGB, out),
    (front, edge, outward) => {
      // paving under the outskirts (not the hills: those are lawns)
      const E0 = -0.5 * T, E1 = (city.W - 0.5) * T, y = 0.19, d = 60;
      const qd = (x0, z0, x1, z1) => farGB.quad([[x0, y, z1], [x1, y, z1], [x1, y, z0], [x0, y, z0]], [[0, 0], [1, 0], [1, 1], [0, 1]], pave, [0, 1, 0]);
      if (front === 2) qd(E0 - d, E0 - d, 24 * T, E0);
      else if (front === 1) qd(E0 - d, E0, E0, E1);
      else qd(E1, 20 * T, E1 + d, E1);
      void outward; void edge;
    });
  // the clock tower stands on a mid-side tile of an Old Town park, next to its path
  {
    const D4 = [[1, 0], [-1, 0], [0, 1], [0, -1]], at = (x, z) => city.tiles[z * city.W + x];
    const cand = city.tiles.filter((t) => t.k === K.PARK && t.d === 'oldtown' && D4.some(([dx, dz]) => at(t.x + dx, t.z + dz)?.k === K.ALLEY && at(t.x + 2 * dx, t.z + 2 * dz)?.k === K.PARK));
    cand.sort((a, b) => Math.hypot(a.x - 10, a.z - 32) - Math.hypot(b.x - 10, b.z - 32));
    city.clockTower = cand[0] ? cand[0].i : -1;
  }
  for (const p of city.props || []) if (p.tile !== city.clockTower) out.props.push({ ...p, x: p.x * T, z: p.z * T });
  streetProps(city, out);
  roadSigns(city, out);
  out.pillars = [];
  viaduct(farGB, out);
  out.props = out.props.filter((p) => !out.pillars.some(([x, z]) => Math.abs(p.x - x) < 1.9 && Math.abs(p.z - z) < 1.9));
  const geos = [];
  for (const c of chunks.values()) geos.push({ cx: c.cx, cz: c.cz, base: c.base.build(), detail: c.detail.build() });
  return { chunks: geos, far: farGB.build(), ...out };
}

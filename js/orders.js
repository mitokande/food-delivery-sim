// Order board: generation, pricing, ETA, scoring. Pure (uses the city graph, no three.js).
import { DISTRICT, DPROFILE, RESTAURANT, RESTAURANTS, FOODS, ORDER_TYPES, FIRST_NAMES, CHAR_IDS } from './data.js';
import { findPath, buildRoute } from './city/graph.js';
import { S, rushMult, skillFx, vehStats } from './state.js';
import { pick } from './rng.js';
import { W, rainBonus } from './weather.js';

// ---- timers ----
// What the autopilot really averages (tools/speed.mjs, no turbo): a district base for the Rust Bucket, scaled by the
// bike — measured ≈ (top speed / 8.9 m/s)^0.6 (turns, lights and traffic eat most of a fast bike's top speed).
const AUTO_BASE = { oldtown: 4.8, downtown: 5.0, harbor: 4.6, hills: 6.9 };
const bikeGain = (vs, k) => Math.pow(Math.max(1, vs.top / 8.9), k);
export function autoSpeed(district, vs = vehStats()) { return (AUTO_BASE[district] ?? 5) * bikeGain(vs, 0.6); }
// Timers follow the bike a little slower than its real gain (exponent 0.45 vs 0.6), so upgrades still make you
// faster than the clock — and they tighten with courier level: generous at first, on-time-without-turbo by Lv 10,
// tight for veterans (turbo, hops and shortcuts are what make you early).
export function etaSlack(lvl = S.lvl) { return lvl <= 2 ? 1.3 : lvl >= 14 ? 0.94 : 1.3 - (lvl - 2) * 0.03; }
const timerSpeed = (district, vs = vehStats()) => (AUTO_BASE[district] ?? 5) * bikeGain(vs, 0.45);
// seconds allowed for `meters` of riding (+ a few seconds for the stops) on the active bike
export function etaFor(meters, district, typeEta = 1) {
  const wet = rainBonus() > 1 ? 1.08 : 1;
  return Math.round((meters / timerSpeed(district) * etaSlack() + 6) * typeEta * skillFx().eta * wet);
}
let nextId = 1;
const routeLen = new Map();
export function pathMeters(city, a, b) {
  const k = a * 100000 + b;
  if (routeLen.has(k)) return routeLen.get(k);
  const p = findPath(city, a, b);
  const m = p ? buildRoute(city, p).length : Infinity;
  routeLen.set(k, m);
  return m;
}

export function makeOrder(city, rng, { from, restId, type } = {}) {
  let open = RESTAURANTS.filter((r) => S.districts[r.district] && city.restaurants.some((x) => x.id === r.id));
  // the courier can choose to work one district only (order board filter)
  if (S.focus && S.districts[S.focus]) { const f = open.filter((r) => r.district === S.focus); if (f.length) open = f; }
  const R = restId ? RESTAURANT[restId] : pick(rng, open);
  const P = DPROFILE[R.district];
  const rl = city.restaurants.find((x) => x.id === R.id);
  const restLot = city.lots[rl.lot];
  // customer: usually the same district, sometimes a neighbouring unlocked one
  const sameD = rng() < P.same;
  const pool = city.customers.filter((id) => { const l = city.lots[id]; return S.districts[l.d] && (sameD ? l.d === R.district : true); });
  // distance band by district: Old Town hops, Green Hills long rides
  let best = null;
  const [dMin, dMax] = sameD ? P.dist : [P.dist[0] + 4, P.dist[1] + 14];
  for (let tries = 0; tries < 60 && !best; tries++) {
    const id = pick(rng, pool);
    const l = city.lots[id];
    const m = Math.abs(l.cx - restLot.cx) + Math.abs(l.cz - restLot.cz);
    if (m >= dMin && m <= dMax) best = id;
  }
  if (best == null) best = pick(rng, pool);
  const cust = city.lots[best];
  let tid = type;
  if (!tid) {
    const ents = Object.entries(ORDER_TYPES).filter(([, t]) => !t.minLvl || S.lvl >= t.minLvl).map(([k, t]) => [k, t.w * (P.types[k] ?? 1)]);
    let tot = 0; for (const [, w] of ents) tot += w; let r = rng() * tot;
    for (const [k, w] of ents) { r -= w; if (r <= 0) { tid = k; break; } }
    tid ||= 'standard';
  }
  const T = ORDER_TYPES[tid];
  const dropM = pathMeters(city, restLot.door, cust.door);
  const pickM = from != null ? pathMeters(city, from, restLot.door) : 150;
  const D = DISTRICT[R.district];
  const rush = rushMult();
  const wet = rainBonus();
  const base = Math.max(5, Math.round((3 + 0.03 * dropM + 0.01 * pickM) * D.pay * T.pay * rush.m * wet));
  const eta = etaFor(pickM + dropM, R.district, T.eta);
  return {
    id: nextId++, rest: R.id, restName: R.name, food: R.food, restLot: restLot.id, cust: cust.id, district: R.district,
    custDistrict: cust.d, name: pick(rng, FIRST_NAMES.filter((n) => n.toLowerCase() !== (S.name || '').trim().toLowerCase())), char: pick(rng, CHAR_IDS), type: tid, base, eta, dropM, pickM,
    size: T.size || 1, fragile: (FOODS[R.food].fragile || 1) * (T.fragile || 1), rush: rush.m > 1 ? rush.name : '', rain: wet > 1,
    born: performance.now(), life: 70 + rng() * 80,
  };
}

// refresh pickup distances (and ETAs) when the player has moved
export function refreshOrder(city, o, from) {
  const restLot = city.lots[o.restLot];
  o.pickM = pathMeters(city, from, restLot.door);
  const T = ORDER_TYPES[o.type];
  o.eta = etaFor(o.pickM + o.dropM, o.district, T.eta);
}

// stars from time + condition; pay breakdown
export function scoreOrder(o, { elapsed, heat, integrity, tipMult = 1, ratingAdj = 0 }) {
  const fx = skillFx();
  const ratio = elapsed / o.eta;
  let stars = 5;
  if (ratio > 1.06) stars -= Math.min(3, Math.ceil((ratio - 1.06) / 0.22) * (1 - fx.forgive));
  const cond = Math.min(heat, integrity);
  if (cond < 85) stars -= 1 - fx.forgive;
  if (cond < 60) stars -= 1;
  if (cond < 35) stars -= 1;
  stars = Math.max(1, Math.min(5, Math.round(stars + ratingAdj)));
  const early = ratio < 0.85;
  const tipPct = [0, 0, 0.03, 0.08, 0.16, 0.28][stars];
  const T = ORDER_TYPES[o.type];
  const tip = Math.round(o.base * tipPct * T.tip * fx.tips * tipMult * (DPROFILE[o.district]?.tip ?? 1) * (early ? 1.15 : 1) * (W.rain > 0.35 ? 1.2 : 1));
  const bonus = early ? Math.round(o.base * 0.15) : 0;
  const latePenalty = ratio > 1.5 ? Math.round(o.base * 0.25) : 0;
  return { stars, early, late: ratio > 1, ratio, tip, bonus, latePenalty, pay: o.base - latePenalty, cond };
}

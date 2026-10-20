// Order board: generation, pricing, ETA, scoring. Pure (uses the city graph, no three.js).
import { DISTRICT, RESTAURANT, RESTAURANTS, FOODS, ORDER_TYPES, FIRST_NAMES, CHAR_IDS } from './data.js';
import { findPath, buildRoute } from './city/graph.js';
import { S, rushMult, skillFx } from './state.js';
import { pick } from './rng.js';
import { W, rainBonus } from './weather.js';

const REF_SPEED = { oldtown: 4.7, downtown: 5.4, harbor: 6.2, hills: 6.9 }; // m/s an average courier manages
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
  const open = RESTAURANTS.filter((r) => S.districts[r.district] && city.restaurants.some((x) => x.id === r.id));
  const R = restId ? RESTAURANT[restId] : pick(rng, open);
  const rl = city.restaurants.find((x) => x.id === R.id);
  const restLot = city.lots[rl.lot];
  // customer: usually the same district, sometimes a neighbouring unlocked one
  const sameD = rng() < 0.8;
  const pool = city.customers.filter((id) => { const l = city.lots[id]; return S.districts[l.d] && (sameD ? l.d === R.district : true); });
  let best = null;
  for (let tries = 0; tries < 12 && !best; tries++) {
    const id = pick(rng, pool);
    const l = city.lots[id];
    const m = Math.abs(l.cx - restLot.cx) + Math.abs(l.cz - restLot.cz);
    if (m >= 5 && m <= 30) best = id;
  }
  if (best == null) best = pick(rng, pool);
  const cust = city.lots[best];
  const fx = skillFx();
  let tid = type;
  if (!tid) {
    const ents = Object.entries(ORDER_TYPES).filter(([, t]) => !t.minLvl || S.lvl >= t.minLvl);
    let tot = 0; for (const [, t] of ents) tot += t.w; let r = rng() * tot;
    for (const [k, t] of ents) { r -= t.w; if (r <= 0) { tid = k; break; } }
    tid ||= 'standard';
  }
  const T = ORDER_TYPES[tid];
  const dropM = pathMeters(city, restLot.door, cust.door);
  const pickM = from != null ? pathMeters(city, from, restLot.door) : 150;
  const D = DISTRICT[R.district];
  const rush = rushMult();
  const wet = rainBonus();
  const base = Math.max(5, Math.round((3 + 0.03 * dropM + 0.01 * pickM) * D.pay * T.pay * rush.m * wet));
  const eta = Math.round(((pickM + dropM) / REF_SPEED[R.district] + 14) * T.eta * fx.eta * (wet > 1 ? 1.08 : 1));
  return {
    id: nextId++, rest: R.id, restName: R.name, food: R.food, restLot: restLot.id, cust: cust.id, district: R.district,
    custDistrict: cust.d, name: pick(rng, FIRST_NAMES), char: pick(rng, CHAR_IDS), type: tid, base, eta, dropM, pickM,
    size: T.size || 1, fragile: (FOODS[R.food].fragile || 1) * (T.fragile || 1), rush: rush.m > 1 ? rush.name : '', rain: wet > 1,
    born: performance.now(), life: 70 + rng() * 80,
  };
}

// refresh pickup distances (and ETAs) when the player has moved
export function refreshOrder(city, o, from) {
  const restLot = city.lots[o.restLot];
  o.pickM = pathMeters(city, from, restLot.door);
  const T = ORDER_TYPES[o.type];
  o.eta = Math.round(((o.pickM + o.dropM) / REF_SPEED[o.district] + 14) * T.eta * skillFx().eta);
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
  const tip = Math.round(o.base * tipPct * T.tip * fx.tips * tipMult * (early ? 1.15 : 1) * (W.rain > 0.35 ? 1.2 : 1));
  const bonus = early ? Math.round(o.base * 0.15) : 0;
  const latePenalty = ratio > 1.5 ? Math.round(o.base * 0.25) : 0;
  return { stars, early, late: ratio > 1, ratio, tip, bonus, latePenalty, pay: o.base - latePenalty, cond };
}

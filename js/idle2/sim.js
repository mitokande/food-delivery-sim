// Hot Chain (idle2.html): the rules. One stage = one business day in one district, 15 real minutes.
// Orders flow demand → kitchen → pickup shelf → courier → door, and every order cools down from the moment it is
// cooked: a hot delivery pays ×1.5 and lifts the kitchen's rating (more orders), a cold one pays ×0.4 and drags it.
// The player never drives; they decide where the money goes: cooks, shelves, promos, couriers, vehicles, the stand.
// Pure: no DOM, no three.js. G is plain JSON (the save); the world (map geometry) is derived from the city.
import { RESTAURANTS, FOODS, TILE, FIRST_NAMES, CHAR_IDS } from '../data.js';
import { findPath } from '../city/graph.js';

export const KEY = 'fds_idle2_v1';

// ---------------------------------------------------------------- the day
export const DAY = { from: 9 * 60, to: 22 * 60, sec: 900 }; // game minutes; real seconds the day lasts
export const GMPS = (DAY.to - DAY.from) / DAY.sec; // game minutes per real second
export const RUSH = [
  { from: 12 * 60, to: 14 * 60, m: 2.0, name: 'Lunch rush' },
  { from: 18.5 * 60, to: 21 * 60, m: 2.4, name: 'Dinner rush' },
];
export const clockOf = (G) => DAY.from + G.t * GMPS;
export const rushAt = (clock) => RUSH.find((r) => clock >= r.from && clock < r.to) || null;
export const nextRush = (clock) => RUSH.find((r) => r.from > clock) || null;
export function dayMult(clock) {
  const r = rushAt(clock); if (r) return r.m;
  if (clock < 11 * 60) return 0.8;
  if (clock < 12 * 60) return 0.85;
  if (clock >= 21 * 60) return 0.8;
  return 1;
}

// ---------------------------------------------------------------- stage 1: Old Town, opening day
// cook: seconds a cook needs for one order · value: what it pays at the door (before heat) · demand: orders a real
// minute at ×1 (before rush, promo, rating) · decay: heat lost per second (100 → 0) · partner: price · base: price scale
export const STAGE = {
  id: 'oldtown-1', district: 'oldtown', name: 'Old Town · Opening day',
  cash: 45,
  stars: [110, 170, 215], // hot deliveries for ★ ★★ ★★★
  kitchens: {
    sunny: { cook: 20, value: 16, demand: 3.5, decay: 0.55, partner: 0, base: 10 },
    sultan: { cook: 24, value: 19, demand: 3.0, decay: 0.5, partner: 70, base: 20 },
    bean: { cook: 10, value: 11, demand: 5.0, decay: 0.85, partner: 220, base: 40 },
    mamma: { cook: 30, value: 28, demand: 2.6, decay: 0.42, partner: 520, base: 80 },
  },
};
export const KIDS = Object.keys(STAGE.kitchens);
export const kitchenInfo = (id) => ({ ...RESTAURANTS.find((r) => r.id === id), ...STAGE.kitchens[id], food: RESTAURANTS.find((r) => r.id === id).food });

export const MAX_COOKS = 10;
export const SHELF = [4, 6, 9, 13, 18]; // pickup shelf slots by upgrade
export const MAX_PROMO = 6;
export const PROMO_STEP = 0.35; // demand × (1 + step × promo)
export const LAMP = 0.35; // shelf heat loss × this with a heat lamp
export const BAGS = { m: 0.6, cost: 380 }; // thermal bags: heat loss on the bike ×m (the whole fleet)
export const PATIENCE = 75; // s an order waits for a cook before the customer cancels
export const PICKUP = 2, HANDOVER = 3; // s at the counter, s at each door
export const COUNTER_WAIT = 5; // s a courier with room waits for food about to be ready
export const HEAT = { hot: 70, warm: 40 };
export const PAY = { hot: 1.5, warm: 1, cold: 0.5 };
export const heatClass = (h) => (h >= HEAT.hot ? 'hot' : h >= HEAT.warm ? 'warm' : 'cold');

// couriers: vehicles you can hire (data.js ids), m/s on Old Town streets
export const VEH = {
  zippy: { cap: 1, speed: 10, hire: 15, name: 'Zippy 50' },
  vespetta: { cap: 2, speed: 12, hire: 28, name: 'Vespetta 125' },
  mule: { cap: 4, speed: 8, hire: 60, name: 'Mule Cargo Trike' },
};
export const HIRE_G = 1.22; // each courier you already have makes the next one ×this
export const MOVE_STAND = 40;

// ---------------------------------------------------------------- prices
export const cookCost = (id, L) => Math.round(STAGE.kitchens[id].base * Math.pow(1.55, L - 1)); // L → L + 1
export const shelfCost = (id, s) => Math.round(STAGE.kitchens[id].base * 1.4 * Math.pow(2.1, s)); // s → s + 1
export const promoCost = (id, m) => Math.round(STAGE.kitchens[id].base * 3 * Math.pow(2, m));
export const lampCost = (id) => Math.round(STAGE.kitchens[id].base * 7);
export const hireCost = (G, v) => Math.round(VEH[v].hire * Math.pow(HIRE_G, G.couriers.length - 1));

// ---------------------------------------------------------------- the world: map geometry for a district
// kitchens' and customers' door tiles, stand spots, and road distances (A* over the city's road tiles, alleys too)
export function createWorld(city, district = STAGE.district) {
  const lots = city.lots;
  const kitchenLot = {};
  for (const r of city.restaurants) if (STAGE.kitchens[r.id]) kitchenLot[r.id] = lots[r.lot];
  const customers = city.customers.map((i) => lots[i]).filter((l) => l.d === district);
  // stand spots: the garage (where every courier starts), and the plain lot nearest each kitchen
  const stands = [{ id: 'garage', lot: lots[city.specials.garage], name: 'The garage' }];
  for (const id of KIDS) {
    const k = kitchenLot[id]; if (!k) continue;
    let best = null, bd = 1e9;
    for (const l of customers) { const d = Math.abs(l.cx - k.cx) + Math.abs(l.cz - k.cz); if (d > 0 && d < bd) { bd = d; best = l; } }
    if (best) stands.push({ id: 'near-' + id, lot: best, name: `Next to ${RESTAURANTS.find((r) => r.id === id).name}`, kitchen: id });
  }
  const paths = new Map();
  function path(a, b) {
    const key = a * 4096 + b;
    let p = paths.get(key);
    if (!p) { p = findPath(city, a, b, { alleys: true }) || [a, b]; paths.set(key, p); }
    return p;
  }
  const dist = (a, b) => (a === b ? 0 : (path(a, b).length - 1) * TILE);
  return { city, district, kitchenLot, customers, stands, standOf: (id) => stands.find((s) => s.id === id) || stands[0], path, dist,
    kitchenDoor: (id) => kitchenLot[id].door };
}

// ---------------------------------------------------------------- the save
const newKitchen = () => ({ cooks: 1, shelf: 0, promo: 0, lamp: false, rating: 4.2, acc: 0, queue: [], cooking: [], rack: [], served: 0,
  ema: { qwait: 0, rwait: 0 } });
const newCourier = (G, veh) => {
  const n = G.couriers.length;
  return { id: G.seq++, name: FIRST_NAMES[n % FIRST_NAMES.length], char: CHAR_IDS[(n * 7 + 6) % CHAR_IDS.length], veh,
    st: 'idle', at: null, leg: null, wait: 0, load: [], claim: [], k: null, busy: 0 };
};
export function fresh(keep = {}) {
  const G = {
    v: 1, stage: STAGE.id, t: 0, cash: STAGE.cash, done: false, seed: 20261109, seq: 1,
    kit: { sunny: newKitchen() }, orders: {}, couriers: [], stand: 'garage', bags: false,
    stats: { hot: 0, warm: 0, cold: 0, lost: 0, earned: 0, spent: 0, deliveries: 0 },
    ema: { util: 0, hotShare: 1, idle: 0 },
    best: 0, plays: 0,
    settings: { music: 0.5, sfx: 1, quality: 'auto' },
    seen: {},
    ...keep,
  };
  G.couriers.push(newCourier(G, 'zippy'));
  return G;
}
// a new day on the same stage (keeps best score, settings)
export const replay = (G) => fresh({ best: Math.max(G.best || 0, G.stats.hot), plays: (G.plays || 0) + 1, settings: G.settings, seen: G.seen });

function rnd(G) {
  let t = (G.seed = (G.seed + 0x6d2b79f5) | 0);
  t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

// ---------------------------------------------------------------- derived numbers
export const partnered = (G, id) => !!G.kit[id];
export const shelfSize = (k) => SHELF[k.shelf];
export const demandRate = (G, id, clock = clockOf(G)) => { // orders / real minute
  const k = G.kit[id], s = STAGE.kitchens[id]; if (!k) return 0;
  return s.demand * dayMult(clock) * (1 + PROMO_STEP * k.promo) * ratingMult(k.rating);
};
export const ratingMult = (r) => Math.max(0.6, Math.min(1.2, r / 4.2)); // a kitchen's stars → its orders
export const cookRate = (G, id) => (G.kit[id] ? G.kit[id].cooks * 60 / STAGE.kitchens[id].cook : 0); // orders / min
export const starsFor = (hot) => STAGE.stars.filter((s) => hot >= s).length;
export const courierFree = (c) => c.st === 'idle' || c.st === 'home';
export function fleetRate(G, W) { // rough orders / min the fleet can carry (for the planner and the UI)
  let r = 0;
  for (const c of G.couriers) {
    const v = VEH[c.veh], trip = (170 / v.speed) * 2 + 2 + PICKUP + HANDOVER * v.cap + (v.cap - 1) * 90 / v.speed;
    r += v.cap * 60 / trip;
  }
  void W; return r;
}

// ---------------------------------------------------------------- buying
function pay(G, cost) { if (G.cash + 1e-9 < cost) return false; G.cash -= cost; G.stats.spent += cost; return true; }
export const prices = (G) => {
  const out = [];
  for (const id of KIDS) {
    const k = G.kit[id], s = STAGE.kitchens[id];
    if (!k) { out.push({ a: 'partner', id, cost: s.partner }); continue; }
    if (k.cooks < MAX_COOKS) out.push({ a: 'cook', id, cost: cookCost(id, k.cooks) });
    if (k.shelf < SHELF.length - 1) out.push({ a: 'shelf', id, cost: shelfCost(id, k.shelf) });
    if (k.promo < MAX_PROMO) out.push({ a: 'promo', id, cost: promoCost(id, k.promo) });
    if (!k.lamp) out.push({ a: 'lamp', id, cost: lampCost(id) });
  }
  for (const v in VEH) out.push({ a: 'hire', id: v, cost: hireCost(G, v) });
  if (!G.bags) out.push({ a: 'bags', cost: BAGS.cost });
  return out;
};
export function act(G, a, id, W) {
  if (G.done) return false;
  const k = G.kit[id];
  if (a === 'partner') { if (k || !STAGE.kitchens[id] || !pay(G, STAGE.kitchens[id].partner)) return false; G.kit[id] = newKitchen(); return true; }
  if (a === 'cook') { if (!k || k.cooks >= MAX_COOKS || !pay(G, cookCost(id, k.cooks))) return false; k.cooks++; return true; }
  if (a === 'shelf') { if (!k || k.shelf >= SHELF.length - 1 || !pay(G, shelfCost(id, k.shelf))) return false; k.shelf++; return true; }
  if (a === 'promo') { if (!k || k.promo >= MAX_PROMO || !pay(G, promoCost(id, k.promo))) return false; k.promo++; return true; }
  if (a === 'lamp') { if (!k || k.lamp || !pay(G, lampCost(id))) return false; k.lamp = true; return true; }
  if (a === 'hire') { if (!VEH[id] || !pay(G, hireCost(G, id))) return false; G.couriers.push(newCourier(G, id)); return true; }
  if (a === 'bags') { if (G.bags || !pay(G, BAGS.cost)) return false; G.bags = true; return true; }
  if (a === 'stand') { if (id === G.stand || !W?.stands.some((s) => s.id === id) || !pay(G, MOVE_STAND)) return false; G.stand = id; return true; }
  return false;
}

// ---------------------------------------------------------------- where a courier is
const standDoor = (G, W) => W.standOf(G.stand).lot.door;
export function courierTile(G, W, c) {
  if (!c.leg) return c.at ?? standDoor(G, W);
  const p = W.path(c.leg.a, c.leg.b);
  const f = c.leg.d > 0 ? Math.max(0, Math.min(1, c.leg.t / c.leg.d)) : 1;
  return p[Math.min(p.length - 1, Math.round(f * (p.length - 1)))];
}
function go(c, W, a, b) {
  const v = VEH[c.veh];
  c.leg = { a, b, t: 0, d: 1 + W.dist(a, b) / v.speed };
}

// ---------------------------------------------------------------- the day ticks
// returns events for the page: { kind: 'paid'|'lost'|'order', ... }
export function tick(G, W, dtIn, max = 1) {
  const ev = [];
  if (G.done) return ev;
  let left = Math.min(max, dtIn);
  while (left > 1e-6) {
    const dt = Math.min(0.25, left); left -= dt;
    step(G, W, dt, ev);
    if (G.t >= DAY.sec) { G.done = true; G.best = Math.max(G.best || 0, G.stats.hot); ev.push({ kind: 'end' }); break; }
  }
  return ev;
}

function step(G, W, dt, ev) {
  G.t += dt;
  const clock = clockOf(G);
  // 1. customers order
  for (const id in G.kit) {
    const k = G.kit[id];
    k.acc += demandRate(G, id, clock) / 60 * dt * (0.6 + 0.8 * rnd(G));
    while (k.acc >= 1) {
      k.acc -= 1;
      const lot = W.customers[Math.floor(rnd(G) * W.customers.length)];
      const o = { id: G.seq++, k: id, lot: lot.id, door: lot.door, t0: G.t, st: 'q', heat: 100, tr: 0, by: null };
      G.orders[o.id] = o; k.queue.push(o.id);
      ev.push({ kind: 'order', id: o.id, k: id });
    }
  }
  // 2. kitchens cook; the shelf takes what's done (a full shelf blocks the cooks)
  for (const id in G.kit) {
    const k = G.kit[id], s = STAGE.kitchens[id];
    // impatient customers leave the queue
    while (k.queue.length && G.t - G.orders[k.queue[0]].t0 > PATIENCE) {
      const o = G.orders[k.queue.shift()];
      delete G.orders[o.id]; G.stats.lost++; rate(k, 1.5);
      ev.push({ kind: 'lost', k: id, door: o.door });
    }
    for (const c of k.cooking) if (c.left > 0) c.left -= dt;
    for (let i = 0; i < k.cooking.length; i++) {
      const c = k.cooking[i];
      if (c.left > 0) continue;
      if (k.rack.length >= shelfSize(k)) break; // blocked
      const o = G.orders[c.o]; o.st = 'r'; o.heat = 100; o.tr = G.t;
      k.rack.push(o.id); k.cooking.splice(i--, 1);
    }
    while (k.cooking.length < k.cooks && k.queue.length) {
      const o = G.orders[k.queue.shift()];
      k.ema.qwait += (G.t - o.t0 - k.ema.qwait) * 0.15;
      o.st = 'c'; k.cooking.push({ o: o.id, left: s.cook });
    }
    // food on the shelf cools
    const loss = s.decay * (k.lamp ? LAMP : 1) * dt;
    for (const oid of k.rack) G.orders[oid].heat = Math.max(0, G.orders[oid].heat - loss);
  }
  // 3. dispatch: the nearest free courier goes to the kitchen with the oldest unclaimed food
  const want = [];
  for (const id in G.kit) {
    const k = G.kit[id], free = k.rack.filter((oid) => !G.orders[oid].by);
    if (free.length) want.push({ id, n: free.length, since: G.orders[free[0]].tr, free });
  }
  want.sort((a, b) => a.since - b.since);
  for (const w of want) {
    const door = W.kitchenDoor(w.id);
    let best = null, bd = Infinity;
    const pending = w.n + G.kit[w.id].cooking.filter((c) => c.left <= PICKUP + 4).length;
    for (const c of G.couriers) {
      if (!courierFree(c)) continue;
      // seconds to get there, minus a bonus for room the waiting food can fill
      const room = Math.min(VEH[c.veh].cap, pending);
      const d = W.dist(courierTile(G, W, c), door) / VEH[c.veh].speed - (room - 1) * 6;
      if (d < bd) { bd = d; best = c; }
    }
    if (!best) break;
    const take = w.free.slice(0, VEH[best.veh].cap);
    for (const oid of take) G.orders[oid].by = best.id;
    best.claim = take; best.k = w.id; best.st = 'go';
    go(best, W, courierTile(G, W, best), door);
  }
  // 4. couriers move
  for (const c of G.couriers) {
    const bagLoss = c.load.length ? dt * (G.bags ? BAGS.m : 1) : 0;
    for (const oid of c.load) { const o = G.orders[oid]; o.heat = Math.max(0, o.heat - STAGE.kitchens[o.k].decay * bagLoss); }
    if (c.st !== 'idle') c.busy += dt;
    if (c.wait > 0) { c.wait -= dt; if (c.wait > 0) continue; if (!c.leg && c.st === 'go') { arrive(G, W, c, ev); continue; } }
    if (c.leg) { c.leg.t += dt; if (c.leg.t < c.leg.d) continue; c.at = c.leg.b; c.leg = null; arrive(G, W, c, ev); }
  }
  // 5. running measures for the page and the planner
  const n = G.couriers.length, idle = G.couriers.filter((c) => c.st === 'idle').length;
  G.ema.idle += ((n ? idle / n : 0) - G.ema.idle) * Math.min(1, dt / 20);
  for (const id in G.kit) {
    const k = G.kit[id], oldest = k.rack.length ? G.t - G.orders[k.rack[0]].tr : 0;
    k.ema.rwait += (oldest - k.ema.rwait) * Math.min(1, dt / 8);
    if (!k.queue.length) k.ema.qwait += (0 - k.ema.qwait) * Math.min(1, dt / 15);
  }
}

// a courier reaches the end of a leg
function arrive(G, W, c, ev) {
  if (c.st === 'go') { // at the kitchen: pick up what was claimed, and anything else ready, up to the vehicle's room
    const k = G.kit[c.k], cap = VEH[c.veh].cap;
    const mine = k.rack.filter((oid) => G.orders[oid].by === c.id);
    const extra = k.rack.filter((oid) => !G.orders[oid].by).slice(0, Math.max(0, cap - mine.length));
    const take = [...mine, ...extra].slice(0, cap);
    const soon = k.cooking.filter((x) => x.left > 0 && x.left <= COUNTER_WAIT).sort((a, b) => a.left - b.left);
    if (take.length < cap && soon.length && !c.waited && k.rack.length + soon.length <= shelfSize(k) + soon.length) {
      for (const oid of take) G.orders[oid].by = c.id; // (keep what's mine while I wait)
      c.waited = true; c.wait = Math.min(COUNTER_WAIT, soon[Math.min(soon.length, cap - take.length) - 1].left + 0.1);
      return;
    }
    c.waited = false;
    for (const oid of take) { const o = G.orders[oid]; o.st = 'b'; o.by = c.id; }
    k.rack = k.rack.filter((oid) => !take.includes(oid));
    c.claim = []; c.load = take;
    if (!take.length) { c.st = 'home'; go(c, W, c.at, standDoor(G, W)); return; }
    // drop order: nearest next door each time
    let at = c.at; const left = [...take], plan = [];
    while (left.length) {
      let bi = 0, bd = Infinity;
      for (let i = 0; i < left.length; i++) { const d = W.dist(at, G.orders[left[i]].door); if (d < bd) { bd = d; bi = i; } }
      const oid = left.splice(bi, 1)[0]; plan.push(oid); at = G.orders[oid].door;
    }
    c.load = plan; c.st = 'drop';
    go(c, W, c.at, G.orders[plan[0]].door);
    c.leg.t = -PICKUP; // (the counter time, then the ride)
    c.wait = 0;
    return;
  }
  if (c.st === 'drop') {
    const oid = c.load.shift(), o = G.orders[oid], k = G.kit[o.k], s = STAGE.kitchens[o.k];
    const hc = heatClass(o.heat), amount = Math.round(s.value * PAY[hc] * 100) / 100;
    G.cash += amount; G.stats.earned += amount; G.stats[hc]++; G.stats.deliveries++;
    if (k) { k.served++; rate(k, hc === 'hot' ? 5 : hc === 'warm' ? 3.8 : 2); }
    G.ema.hotShare += ((hc === 'hot' ? 1 : 0) - G.ema.hotShare) * 0.06;
    ev.push({ kind: 'paid', k: o.k, door: o.door, amount, heat: hc, courier: c.id });
    delete G.orders[oid];
    c.wait = HANDOVER;
    if (c.load.length) { go(c, W, c.at, G.orders[c.load[0]].door); c.leg.t = -HANDOVER; c.wait = 0; return; }
    c.st = 'home'; go(c, W, c.at, standDoor(G, W)); c.leg.t = -HANDOVER; c.wait = 0;
    return;
  }
  if (c.st === 'home') { c.st = 'idle'; c.at = standDoor(G, W); }
}
function rate(k, target) { k.rating = Math.max(1, Math.min(5, k.rating + (target - k.rating) * 0.05)); }

// ---------------------------------------------------------------- what's holding the chain back (for the page and the planner)
// kind: 'kitchen' (orders wait for a cook), 'shelf' (food waits for a courier), 'demand' (couriers stand around),
// 'heat' (food arrives warm), 'ok'
export function diagnose(G) {
  const out = [];
  for (const id in G.kit) {
    const k = G.kit[id];
    const full = k.rack.length >= shelfSize(k) && k.cooking.some((c) => c.left <= 0);
    // (cooks waiting for shelf room is the couriers' fault, not the kitchen's)
    if (!full && k.queue.length > k.cooks + 1 && k.ema.qwait > 18) out.push({ kind: 'kitchen', id, w: k.ema.qwait });
    if (full || k.ema.rwait > 14) out.push({ kind: 'shelf', id, w: k.ema.rwait + (full ? 20 : 0) });
  }
  if (!out.length && G.ema.idle > 0.45 && G.t > 30) out.push({ kind: 'demand', w: G.ema.idle });
  if (!out.length && G.ema.hotShare < 0.6 && G.stats.deliveries > 10) out.push({ kind: 'heat', w: 1 - G.ema.hotShare });
  out.sort((a, b) => b.w - a.w);
  return out[0] || { kind: 'ok' };
}

export const short = (n) => {
  const a = Math.abs(n);
  if (a < 1000) return (Math.round(n * 10) / 10).toString().replace(/\.0$/, '');
  const u = ['K', 'M', 'B', 'T']; let i = -1, x = a;
  while (x >= 1000 && i < u.length - 1) { x /= 1000; i++; }
  return (n < 0 ? '-' : '') + (x >= 100 ? Math.round(x) : x >= 10 ? x.toFixed(1) : x.toFixed(2)).replace(/\.?0+$/, '') + u[i];
};
export const money = (n) => '$' + (Math.abs(n) < 100 ? (Math.round(n * 10) / 10).toString() : short(Math.round(n)));
export { FOODS };

// Uncle's Diner (idle3.html): the rules. Your distant uncle left you a run-down diner in Old Town and an old scooter.
// You only know smash burgers. Tap to make one (the tap waits out your make time), walk-in customers buy them at the
// counter; hire cooks to make burgers on their own, a courier to ride the old scooter to customers' doors, and level
// everyone's skills. Selling burgers makes the diner known (fame), which brings more customers of both kinds.
// Pure: no DOM, no three.js. G is plain JSON (the save); the world (map geometry) is derived from the city.
import { TILE, FIRST_NAMES, CHAR_IDS } from '../data.js';
import { findPath } from '../city/graph.js';

export const KEY = 'fds_idle3_v1';
export const DINER = 'sunny'; // the city lot the diner stands on (the burger joint's building)

// ---------------------------------------------------------------- burgers
export const PRICE = 4; // a burger at the counter, before quality
export const COUNTER = 6; // burgers (and packed delivery bags) the counter holds
export const QUAL_STEP = 0.12; // a burger's price × (1 + step × the quality level of whoever made it)
export const SPEED_K = 0.87; // make time × this per speed level
export const YOU = { make: 3 }; // s per burger, by hand
export const COOK = { make: 8, max: 4 }; // a new cook's s per burger; how many fit in the kitchen
export const COOK_HIRE = [40, 180, 700, 2400];

// ---------------------------------------------------------------- customers
export const WALK = { rate: 12, queue: 6, patience: 30 }; // walk-ins a minute at fame 1, queue length, s they wait
// delivery orders a minute at fame 1, s an order waits to be picked up, the zone (m of road), pay: fee + per m, tip
export const DELIV = { rate: 3.2, patience: 100, radius: 220, fee: 3, perM: 0.04, tip: 2 };
export const openMax = (G) => 3 + 2 * G.couriers.length;
export const FAME = [0, 20, 50, 100, 180, 300, 480, 750, 1100, 1600, 2300, 3200, 4500]; // burgers sold → fame level
export const FAME_STEP = 0.3; // customers × (1 + step × (level − 1))

// ---------------------------------------------------------------- couriers
export const COURIER_HIRE = [75, 220, 700, 2200];
// m/s on Old Town streets; stall: chance the engine won't start when leaving (costs STALL s)
export const MOTORS = [
  { id: 'rustbucket', name: 'Rust Bucket', speed: 7, cap: 1, stall: 0.3, cost: 0 },
  { id: 'zippy', name: 'Zippy 50', speed: 9.5, cap: 1, stall: 0, cost: 120 },
  { id: 'vespetta', name: 'Vespetta 125', speed: 11, cap: 2, stall: 0, cost: 500 },
  { id: 'volt', name: 'Volt E-Scooter', speed: 13, cap: 2, stall: 0, cost: 1600 },
  { id: 'viper', name: 'Viper 600', speed: 16, cap: 2, stall: 0, cost: 5000 },
];
export const STALL = 6;
export const PICKUP = 1.5, HANDOVER = 2.5; // s at the counter, s at each door
export const RIDE_STEP = 0.07; // speed × (1 + step × riding level)
export const CHARM_STEP = 0.25; // tips × (1 + step × charm level)

// ---------------------------------------------------------------- skills
// who: 'you' | 'cook' | 'rider'. Price of level L → L + 1 for the n-th hire (0-based; later hires cost more to train)
export const SKILLS = {
  speed: { max: 10, who: ['you', 'cook'], base: 12, g: 1.7 },
  quality: { max: 10, who: ['you', 'cook'], base: 18, g: 1.75 },
  ride: { max: 10, who: ['rider'], base: 20, g: 1.7 },
  charm: { max: 10, who: ['rider'], base: 15, g: 1.7 },
  bag: { max: 2, who: ['rider'], costs: [300, 2000] }, // +1 order a trip per level
};
export const skillCost = (sk, L, n = 0) => {
  const s = SKILLS[sk];
  if (L >= s.max) return null;
  if (s.costs) return Math.round(s.costs[L] * Math.pow(1.5, n));
  return Math.round(s.base * Math.pow(s.g, L) * Math.pow(1.6, n));
};
export const cookHireCost = (G) => COOK_HIRE[G.cooks.length] ?? null;
export const courierHireCost = (G) => COURIER_HIRE[G.couriers.length] ?? null;
export const motorCost = (c) => MOTORS[c.motor + 1]?.cost ?? null;

// ---------------------------------------------------------------- the world: the diner, the delivery zone, road distances
export function createWorld(city) {
  const r = city.restaurants.find((x) => x.id === DINER);
  const lot = city.lots[r.lot];
  const paths = new Map();
  function path(a, b) {
    const key = a * 4096 + b;
    let p = paths.get(key);
    if (!p) { p = findPath(city, a, b, { alleys: true }) || [a, b]; paths.set(key, p); }
    return p;
  }
  const dist = (a, b) => (a === b ? 0 : (path(a, b).length - 1) * TILE);
  const T = city.tiles, d0 = T[lot.door];
  const zone = [];
  for (const i of city.customers) {
    const l = city.lots[i], t = T[l.door];
    if ((Math.abs(t.x - d0.x) + Math.abs(t.z - d0.z)) * TILE > DELIV.radius) continue; // (a road path is never shorter)
    const d = dist(lot.door, l.door);
    if (d > 0 && d <= DELIV.radius) zone.push({ lot: l.id, door: l.door, d });
  }
  zone.sort((a, b) => a.d - b.d);
  return { city, lot, door: lot.door, zone, path, dist };
}

// ---------------------------------------------------------------- the save
const person = (G, n) => ({ id: G.seq++, name: FIRST_NAMES[(n * 5 + 3) % FIRST_NAMES.length], char: CHAR_IDS[(n * 7 + 2) % CHAR_IDS.length] });
const newCook = (G) => ({ ...person(G, G.cooks.length * 2 + 1), speed: 0, quality: 0, left: 0, q: 0, held: null, made: 0 });
const newCourier = (G) => ({ ...person(G, G.couriers.length * 2 + 2), motor: 0, ride: 0, charm: 0, bag: 0,
  st: 'idle', at: null, leg: null, wait: 0, waited: false, load: [], trips: 0, busy: 0 });
export function fresh(keep = {}) {
  return {
    v: 1, t: 0, cash: 0, seed: 20261109, seq: 1,
    you: { speed: 0, quality: 0, left: 0, q: 0, held: null, made: 0 },
    cooks: [], couriers: [],
    counter: [], // quality multipliers of the burgers ready on the counter (not yet anyone's)
    walk: [], // walk-in customers in the queue: { id, t0 }
    orders: {}, // delivery orders: { id, lot, door, d, t0, st: 'open'|'packed'|'bike', q, by }
    acc: { walk: 0.6, deliv: 0.5 },
    served: 0, // burgers sold, the fame meter
    stats: { burgers: 0, walkins: 0, deliveries: 0, lostWalk: 0, lostOrders: 0, earned: 0, tips: 0, spent: 0, taps: 0 },
    ema: { wait: 0, bags: 0, full: 0 },
    settings: { music: 0.5, sfx: 1, quality: 'auto' },
    seen: {}, // story and tips already shown
    ...keep,
  };
}

function rnd(G) {
  let t = (G.seed = (G.seed + 0x6d2b79f5) | 0);
  t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

// ---------------------------------------------------------------- derived numbers
export const fameLevel = (G) => { let L = 0; while (L < FAME.length && G.served >= FAME[L]) L++; return L; };
export const fameNext = (G) => FAME[fameLevel(G)] ?? null; // burgers sold for the next level (null at the top)
export const fameMult = (G) => 1 + FAME_STEP * (fameLevel(G) - 1);
export const makeTime = (base, speed) => base * Math.pow(SPEED_K, speed);
export const youTime = (G) => makeTime(YOU.make, G.you.speed);
export const cookTime = (c) => makeTime(COOK.make, c.speed);
export const qualMult = (quality) => 1 + QUAL_STEP * quality;
export const motorOf = (c) => MOTORS[c.motor];
export const capOf = (c) => MOTORS[c.motor].cap + c.bag;
export const speedOf = (c) => MOTORS[c.motor].speed * (1 + RIDE_STEP * c.ride);
export const walkRate = (G) => WALK.rate * fameMult(G); // a minute
export const delivRate = (G) => (G.couriers.length ? DELIV.rate * fameMult(G) : 0);
export const cookRate = (G) => G.cooks.reduce((s, c) => s + 60 / cookTime(c), 0); // burgers a minute without you
export const packedN = (G) => { let n = 0; for (const id in G.orders) if (G.orders[id].st === 'packed') n++; return n; };
export const openN = (G) => Object.keys(G.orders).length;
export const room = (G) => COUNTER - G.counter.length - packedN(G);
// bags packed ahead: one load per courier at most (a bag can't wait long for a courier who's out; walk-ins get the rest)
export const packCap = (G) => G.couriers.reduce((s, c) => s + capOf(c), 0);
export const orderPay = (o) => Math.round((PRICE * o.q + DELIV.fee + DELIV.perM * o.d) * 10) / 10;
// (tip falls off once the order took longer than 50 s from the call; charm multiplies it)
export const tipFor = (elapsed, charm) => Math.round(DELIV.tip * (1 + CHARM_STEP * charm) * Math.max(0.25, Math.min(1, (150 - elapsed) / 100)) * 10) / 10;
export function canSmash(G) {
  if (G.you.left > 0 || G.you.held != null) return 'busy';
  if (room(G) <= 0) return 'full';
  return 'ok';
}
export function deliveryRate(G, W) { // rough orders a minute the couriers can carry (for the page and the bots)
  const d = W.zone.reduce((s, z) => s + z.d, 0) / Math.max(1, W.zone.length);
  let r = 0;
  for (const c of G.couriers) {
    const v = speedOf(c), cap = capOf(c), m = motorOf(c);
    const trip = (2 * d + (cap - 1) * d * 0.8) / v + PICKUP + HANDOVER * cap + m.stall * STALL;
    r += cap * 60 / trip;
  }
  return r;
}

// ---------------------------------------------------------------- buying
function pay(G, cost) { if (cost == null || G.cash + 1e-9 < cost) return false; G.cash -= cost; G.stats.spent += cost; return true; }
export const whoOf = (G, id) => (id === 'you' ? G.you : G.cooks.find((c) => c.id === +id) || G.couriers.find((c) => c.id === +id) || null);
export const roleOf = (G, id) => (id === 'you' ? 'you' : G.cooks.some((c) => c.id === +id) ? 'cook' : G.couriers.some((c) => c.id === +id) ? 'rider' : null);
const indexOf = (G, id) => (id === 'you' ? 0 : Math.max(0, G.cooks.findIndex((c) => c.id === +id), G.couriers.findIndex((c) => c.id === +id)));
export const priceOfSkill = (G, id, sk) => { const p = whoOf(G, id); return p ? skillCost(sk, p[sk], indexOf(G, id)) : null; };
// everything for sale now (the bots read this)
export function prices(G) {
  const out = [];
  const add = (a, cost, id, sk) => { if (cost != null) out.push({ a, cost, id, sk }); };
  add('cook', cookHireCost(G));
  add('courier', courierHireCost(G));
  for (const sk of ['speed', 'quality']) { add('skill', priceOfSkill(G, 'you', sk), 'you', sk); for (const c of G.cooks) add('skill', priceOfSkill(G, c.id, sk), c.id, sk); }
  for (const c of G.couriers) {
    add('motor', motorCost(c), c.id);
    for (const sk of ['ride', 'charm', 'bag']) add('skill', priceOfSkill(G, c.id, sk), c.id, sk);
  }
  return out;
}
export function act(G, a, id, sk) {
  if (a === 'smash') {
    if (canSmash(G) !== 'ok') return false;
    G.you.left = youTime(G); G.you.q = qualMult(G.you.quality); G.stats.taps++;
    return true;
  }
  if (a === 'cook') { if (G.cooks.length >= COOK.max || !pay(G, cookHireCost(G))) return false; G.cooks.push(newCook(G)); return true; }
  if (a === 'courier') { if (!pay(G, courierHireCost(G))) return false; G.couriers.push(newCourier(G)); return true; }
  if (a === 'motor') { const c = G.couriers.find((x) => x.id === +id); if (!c || !pay(G, motorCost(c))) return false; c.motor++; return true; }
  if (a === 'skill') {
    const p = whoOf(G, id), role = roleOf(G, id);
    if (!p || !SKILLS[sk] || !SKILLS[sk].who.includes(role) || !pay(G, priceOfSkill(G, id, sk))) return false;
    p[sk]++; return true;
  }
  return false;
}

// ---------------------------------------------------------------- where a courier is
export function courierTile(G, W, c) {
  if (!c.leg) return c.at ?? W.door;
  const p = W.path(c.leg.a, c.leg.b);
  const f = c.leg.d > 0 ? Math.max(0, Math.min(1, c.leg.t / c.leg.d)) : 1;
  return p[Math.min(p.length - 1, Math.round(f * (p.length - 1)))];
}
function go(c, W, a, b) { c.leg = { a, b, t: 0, d: 0.5 + W.dist(a, b) / speedOf(c) }; }

// ---------------------------------------------------------------- time passes
// returns events for the page: made, walkin, sold, order, packed, depart, stall, paid, lostWalk, lostOrder, fame
export function tick(G, W, dtIn, max = 1) {
  const ev = [];
  let left = Math.min(max, dtIn);
  while (left > 1e-6) { const dt = Math.min(0.25, left); left -= dt; step(G, W, dt, ev); }
  return ev;
}

// a finished burger goes to the counter (or waits in the cook's hands while the counter is full)
function place(G, q) { if (room(G) <= 0) return false; G.counter.push(q); G.stats.burgers++; return true; }
function earn(G, amount) { G.cash += amount; G.stats.earned += amount; }
function sold(G, ev) { const L = fameLevel(G); G.served++; if (fameLevel(G) > L) ev.push({ kind: 'fame', level: fameLevel(G) }); }

function step(G, W, dt, ev) {
  G.t += dt;
  // 1. customers come in, and orders come from the doors in the zone
  G.acc.walk += walkRate(G) / 60 * dt * (0.5 + rnd(G));
  while (G.acc.walk >= 1) {
    G.acc.walk -= 1;
    if (G.walk.length >= WALK.queue) { G.stats.lostWalk++; ev.push({ kind: 'lostWalk', full: true }); continue; }
    G.walk.push({ id: G.seq++, t0: G.t }); ev.push({ kind: 'walkin' });
  }
  if (G.couriers.length && W.zone.length) {
    G.acc.deliv += delivRate(G) / 60 * dt * (0.5 + rnd(G));
    while (G.acc.deliv >= 1) {
      G.acc.deliv -= 1;
      if (openN(G) >= openMax(G)) continue; // (the phone's busy: nobody hears this one)
      const z = W.zone[Math.floor(rnd(G) * W.zone.length)];
      const o = { id: G.seq++, lot: z.lot, door: z.door, d: z.d, t0: G.t, st: 'open', q: 1, by: null };
      G.orders[o.id] = o; ev.push({ kind: 'order', id: o.id, door: o.door });
    }
  }
  // 2. impatient people leave
  while (G.walk.length && G.t - G.walk[0].t0 > WALK.patience) { G.walk.shift(); G.stats.lostWalk++; ev.push({ kind: 'lostWalk' }); }
  for (const id in G.orders) {
    const o = G.orders[id];
    if (o.st === 'bike' || G.t - o.t0 <= DELIV.patience) continue;
    if (o.st === 'packed') G.counter.push(o.q); // (the bag is unpacked: its burger can still sell)
    delete G.orders[id]; G.stats.lostOrders++; ev.push({ kind: 'lostOrder', door: o.door });
  }
  // 3. the grill: you (one burger a tap) and the cooks (on their own while there's room)
  const y = G.you;
  if (y.left > 0) { y.left -= dt; if (y.left <= 0) { y.left = 0; y.held = y.q; } }
  if (y.held != null && place(G, y.held)) { y.held = null; y.made++; ev.push({ kind: 'made', by: 'you' }); }
  for (const c of G.cooks) {
    if (c.left > 0) { c.left -= dt; if (c.left <= 0) { c.left = 0; c.held = c.q; } }
    if (c.held != null && place(G, c.held)) { c.held = null; c.made++; ev.push({ kind: 'made', by: c.id }); }
    if (c.held == null && c.left <= 0 && room(G) > 0) { c.left = cookTime(c); c.q = qualMult(c.quality); }
  }
  // 4. the counter: each ready burger goes to whoever has waited longest, a walk-in or a delivery order (while a
  //    courier can take the bag soon)
  while (G.counter.length) {
    let o = null;
    if (packedN(G) < packCap(G)) for (const id in G.orders) { const x = G.orders[id]; if (x.st === 'open' && (!o || x.t0 < o.t0)) o = x; }
    const w = G.walk[0];
    if (!o && !w) break;
    const q = G.counter.shift();
    if (w && (!o || w.t0 <= o.t0)) {
      G.walk.shift();
      const amount = Math.round(PRICE * q * 10) / 10;
      earn(G, amount); G.stats.walkins++; sold(G, ev);
      ev.push({ kind: 'sold', amount });
    } else { o.st = 'packed'; o.q = q; ev.push({ kind: 'packed', id: o.id }); }
  }
  // 5. couriers at the diner take the bags (oldest first), wait a moment if another is nearly ready, and ride
  for (const c of G.couriers) {
    if (c.st !== 'idle') continue;
    const bags = Object.values(G.orders).filter((o) => o.st === 'packed').sort((a, b) => a.t0 - b.t0);
    if (!bags.length) { c.waited = false; continue; }
    const cap = capOf(c);
    if (bags.length < cap && !c.waited) {
      const waiting = Object.values(G.orders).some((o) => o.st === 'open');
      const soon = [y, ...G.cooks].some((p) => p.left > 0 && p.left <= 3);
      if (waiting && soon) { c.waited = true; c.st = 'wait'; c.wait = 3; continue; }
    }
    depart(G, W, c, bags, ev);
  }
  // 6. couriers move
  for (const c of G.couriers) {
    if (c.st !== 'idle') c.busy += dt;
    if (c.st === 'wait') {
      c.wait -= dt;
      if (c.wait > 0) continue;
      c.st = 'idle';
      const bags = Object.values(G.orders).filter((o) => o.st === 'packed').sort((a, b) => a.t0 - b.t0);
      if (bags.length) depart(G, W, c, bags, ev);
      continue;
    }
    if (!c.leg) continue;
    c.leg.t += dt;
    if (c.leg.t < c.leg.d) continue;
    c.at = c.leg.b; c.leg = null;
    arrive(G, W, c, ev);
  }
  // 7. running measures for the "what's holding you back" banner
  const k = Math.min(1, dt / 10);
  const waitingN = G.walk.length + Object.values(G.orders).filter((o) => o.st === 'open').length;
  G.ema.wait += ((G.counter.length === 0 && waitingN >= 2 ? 1 : 0) - G.ema.wait) * k;
  const openWait = Object.values(G.orders).filter((o) => o.st !== 'bike').length;
  G.ema.bags += ((openWait >= 2 && !G.couriers.some((c) => c.st === 'idle' || c.st === 'wait') ? 1 : 0) - G.ema.bags) * k;
  G.ema.full += ((G.counter.length >= COUNTER - 1 ? 1 : 0) - G.ema.full) * k;
}

function depart(G, W, c, bags, ev) {
  const cap = capOf(c);
  const first = bags[0], take = [first];
  // (more bags: the nearest to the last stop each time)
  let at = first.door;
  const rest = bags.slice(1);
  while (take.length < cap && rest.length) {
    let bi = 0, bd = Infinity;
    for (let i = 0; i < rest.length; i++) { const d = W.dist(at, rest[i].door); if (d < bd) { bd = d; bi = i; } }
    const o = rest.splice(bi, 1)[0]; take.push(o); at = o.door;
  }
  for (const o of take) { o.st = 'bike'; o.by = c.id; }
  c.load = take.map((o) => o.id); c.st = 'drop'; c.waited = false; c.trips++;
  go(c, W, W.door, take[0].door);
  c.leg.t = -PICKUP;
  const m = motorOf(c);
  if (m.stall && rnd(G) < m.stall) { c.leg.t -= STALL; ev.push({ kind: 'stall', courier: c.id }); }
  ev.push({ kind: 'depart', courier: c.id, n: take.length });
}

function arrive(G, W, c, ev) {
  if (c.st === 'drop') {
    const o = G.orders[c.load.shift()];
    if (o) {
      const amount = orderPay(o), tip = tipFor(G.t - o.t0, c.charm);
      earn(G, amount + tip); G.stats.tips += tip; G.stats.deliveries++; sold(G, ev);
      ev.push({ kind: 'paid', door: o.door, amount: amount + tip, tip, courier: c.id });
      delete G.orders[o.id];
    }
    if (c.load.length) { go(c, W, c.at, G.orders[c.load[0]].door); c.leg.t = -HANDOVER; return; }
    c.st = 'home'; go(c, W, c.at, W.door); c.leg.t = -HANDOVER;
    return;
  }
  if (c.st === 'home') { c.st = 'idle'; c.at = W.door; }
}

// ---------------------------------------------------------------- what's holding the diner back (the banner and the bots)
// kind: 'grill' (walk-ins wait for burgers), 'bags' (delivery orders wait for a courier), 'quiet' (burgers wait for
// customers), 'courier' (no courier yet: deliveries would bring more customers), 'ok'
export function diagnose(G) {
  if (G.ema.wait > 0.5 && G.ema.wait >= G.ema.bags) return { kind: 'grill' };
  if (G.ema.bags > 0.5) return { kind: 'bags' };
  if (G.ema.full > 0.6) return { kind: G.couriers.length ? 'quiet' : 'courier' };
  return { kind: 'ok' };
}

export const short = (n) => {
  const a = Math.abs(n);
  if (a < 1000) return (Math.round(n * 10) / 10).toString().replace(/\.0$/, '');
  const u = ['K', 'M', 'B', 'T']; let i = -1, x = a;
  while (x >= 1000 && i < u.length - 1) { x /= 1000; i++; }
  return (n < 0 ? '-' : '') + (x >= 100 ? Math.round(x) : x >= 10 ? x.toFixed(1) : x.toFixed(2)).replace(/\.?0+$/, '') + u[i];
};
export const money = (n) => '$' + (Math.abs(n) < 100 ? (Math.round(n * 10) / 10).toString() : short(Math.round(n)));

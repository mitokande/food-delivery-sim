// Uncle's Diner (idle3.html): the rules of an idle restaurant manager. Your distant uncle left you a run-down diner in
// Old Town and an old scooter; all you can cook is a smash burger. Customers take a table and order from the menu, the
// order goes to the kitchen as a ticket, a cook (or you, one tap per dish) cooks it, they eat, pay and leave. Every cook
// you hire brings a new dish to the menu (more dishes, more customers). Expanding the restaurant (five stages, from
// the run-down diner to a grand two-building restaurant) adds tables and room for more cooks and couriers. Couriers
// ride the old scooter (and better ones) to doors nearby. Every dish sold makes the place better known (fame).
// Pure: no DOM, no three.js. G is plain JSON (the save); the world (map geometry) is derived from the city.
import { TILE, FIRST_NAMES, CHAR_IDS } from '../data.js';
import { findPath } from '../city/graph.js';

export const KEY = 'fds_idle3_v2';
export const DINER = 'sunny'; // the city lot the restaurant stands on (the burger joint's)

// ---------------------------------------------------------------- the menu: you start with the burger; each cook brings the next dish
// price $ · time: s a new cook needs (you cook at YOU_K of that)
export const DISHES = [
  { id: 'burger', name: 'Smash Burger', icon: 'food-burger', price: 4, time: 8 },
  { id: 'hotdog', name: 'Hot Dog', icon: 'food-hotdog', price: 5, time: 8 },
  { id: 'doner', name: 'Döner', icon: 'food-doner', price: 7, time: 10 },
  { id: 'pizza', name: 'Pizza', icon: 'food-pizza', price: 11, time: 14 },
  { id: 'noodle', name: 'Noodles', icon: 'food-noodle', price: 10, time: 11 },
  { id: 'fish', name: 'Fish & Chips', icon: 'food-fish', price: 14, time: 14 },
  { id: 'sushi', name: 'Sushi', icon: 'food-sushi', price: 19, time: 16 },
  { id: 'icecream', name: 'Ice Cream', icon: 'food-icecream', price: 8, time: 5 },
];
export const DISH = Object.fromEntries(DISHES.map((d) => [d.id, d]));
export const VARIETY = 0.18; // customers × (1 + step × (dishes − 1))
export const YOU_K = 0.4; // you cook a dish in this share of a new cook's time
export const QUAL_STEP = 0.12; // price × (1 + step × the quality level of whoever cooked it)
export const SPEED_K = 0.87; // cooking time × this per speed level

// ---------------------------------------------------------------- the restaurant grows: tables, room for cooks and couriers, appeal
export const STAGES = [
  { id: 'rundown', name: 'Uncle Ferdi\'s old diner', seats: 6, cooks: 1, couriers: 1, appeal: 1, cost: 0, fame: 0 },
  { id: 'fixed', name: 'The fixed-up diner', seats: 10, cooks: 2, couriers: 2, appeal: 1.15, cost: 120, fame: 2 },
  { id: 'terrace', name: 'Diner with a terrace', seats: 16, cooks: 3, couriers: 3, appeal: 1.3, cost: 500, fame: 3 },
  { id: 'nextdoor', name: 'Ferdi\'s Restaurant', seats: 26, cooks: 5, couriers: 4, appeal: 1.5, cost: 2500, fame: 5 },
  { id: 'grand', name: 'Ferdi\'s Grand', seats: 40, cooks: 7, couriers: 6, appeal: 1.75, cost: 9000, fame: 7 },
];
export const stageOf = (G) => STAGES[G.stage];
export const nextStage = (G) => STAGES[G.stage + 1] || null;
export const COOK_HIRE = [30, 150, 500, 1500, 4000, 10000, 22000];

// ---------------------------------------------------------------- customers
// walk-ins a minute at fame 1 with one dish, how many wait at the door for a table and how long, s at the table
// waiting for the food before they walk out, s eating
export const WALK = { rate: 8, door: 4, doorPatience: 25, patience: 60, eat: 12 };
// delivery orders a minute at fame 1 with one dish, s an order waits to be picked up, the zone (m of road), pay
export const DELIV = { rate: 3, patience: 120, radius: 220, fee: 3, perM: 0.04, tip: 2 };
export const openMax = (G) => 3 + 2 * G.couriers.length;
export const FAME = [0, 20, 50, 100, 180, 300, 480, 750, 1100, 1600, 2300, 3200, 4500, 6500, 9000];
export const FAME_STEP = 0.25; // customers × (1 + step × (level − 1))

// ---------------------------------------------------------------- couriers
export const COURIER_HIRE = [75, 220, 700, 2200, 6000, 14000];
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
// (null: none left; roomFor says whether this stage has room for one more)
export const cookHireCost = (G) => COOK_HIRE[G.cooks.length] ?? null;
export const courierHireCost = (G) => COURIER_HIRE[G.couriers.length] ?? null;
export const roomFor = (G, what) => (what === 'cook' ? G.cooks.length < stageOf(G).cooks : G.couriers.length < stageOf(G).couriers);
export const nextDish = (G) => DISHES[G.menu.length] || null; // what the next cook brings
export const motorCost = (c) => MOTORS[c.motor + 1]?.cost ?? null;

// ---------------------------------------------------------------- the world: the restaurant's lots, the delivery zone, road distances
export function createWorld(city) {
  const r = city.restaurants.find((x) => x.id === DINER);
  const lot = city.lots[r.lot];
  // the building next door on the same street: the restaurant takes it over at stage 4
  const T = city.tiles, d0 = T[lot.door];
  const next = city.lots.filter((l) => l.id !== lot.id && !l.special && l.front === lot.front && l.w === 1 && l.dep === 1
    && Math.abs(l.cx - lot.cx) + Math.abs(l.cz - lot.cz) === 1).sort((a, b) => a.cx - b.cx || a.cz - b.cz)[0] || null;
  const paths = new Map();
  function path(a, b) {
    const key = a * 4096 + b;
    let p = paths.get(key);
    if (!p) { p = findPath(city, a, b, { alleys: true }) || [a, b]; paths.set(key, p); }
    return p;
  }
  const dist = (a, b) => (a === b ? 0 : (path(a, b).length - 1) * TILE);
  const zone = [];
  for (const i of city.customers) {
    const l = city.lots[i], t = T[l.door];
    if (next && l.id === next.id) continue;
    if ((Math.abs(t.x - d0.x) + Math.abs(t.z - d0.z)) * TILE > DELIV.radius) continue; // (a road path is never shorter)
    const d = dist(lot.door, l.door);
    if (d > 0 && d <= DELIV.radius) zone.push({ lot: l.id, door: l.door, d });
  }
  zone.sort((a, b) => a.d - b.d);
  return { city, lot, next, door: lot.door, zone, path, dist };
}

// ---------------------------------------------------------------- the save
const person = (G, n) => ({ id: G.seq++, name: FIRST_NAMES[(n * 5 + 3) % FIRST_NAMES.length], char: CHAR_IDS[(n * 7 + 2) % CHAR_IDS.length] });
const newCook = (G, dish) => ({ ...person(G, G.cooks.length * 2 + 1), dish, speed: 0, quality: 0, job: null, made: 0 });
const newCourier = (G) => ({ ...person(G, G.couriers.length * 2 + 2), motor: 0, ride: 0, charm: 0, bag: 0,
  st: 'idle', at: null, leg: null, wait: 0, waited: false, load: [], trips: 0, busy: 0 });
export function fresh(keep = {}) {
  return {
    v: 2, t: 0, cash: 0, seed: 20261109, seq: 1, stage: 0,
    you: { speed: 0, quality: 0, job: null, made: 0 },
    cooks: [], couriers: [],
    menu: ['burger'],
    tables: [], // seated customers: { id, dish, st: 'wait'|'eat', t0, left }
    door: [], // waiting for a table: { id, t0 }
    tickets: [], // the kitchen's queue, oldest first: { id, dish, kind: 'table'|'deliv', ref, t0 }
    orders: {}, // delivery orders: { id, dish, lot, door, d, t0, st: 'open'|'cooking'|'packed'|'bike', q, by }
    acc: { walk: 0.6, deliv: 0.5 },
    served: 0, // dishes sold, the fame meter
    sold: {}, // dish → how many
    stats: { tables: 0, deliveries: 0, lostWalk: 0, lostOrders: 0, earned: 0, tips: 0, spent: 0, taps: 0 },
    ema: { kitchen: 0, seats: 0, bags: 0, quiet: 0 },
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
export const fameNext = (G) => FAME[fameLevel(G)] ?? null; // dishes sold for the next level (null at the top)
export const fameMult = (G) => 1 + FAME_STEP * (fameLevel(G) - 1);
export const varietyMult = (G) => 1 + VARIETY * (G.menu.length - 1);
export const speedK = (speed) => Math.pow(SPEED_K, speed);
export const youTime = (G, dish) => DISH[dish].time * YOU_K * speedK(G.you.speed);
export const cookTime = (c, dish) => DISH[dish].time * speedK(c.speed);
export const qualMult = (quality) => 1 + QUAL_STEP * quality;
export const avgTime = (G) => G.menu.reduce((s, d) => s + DISH[d].time, 0) / G.menu.length;
export const avgPrice = (G) => G.menu.reduce((s, d) => s + DISH[d].price, 0) / G.menu.length;
export const motorOf = (c) => MOTORS[c.motor];
export const capOf = (c) => MOTORS[c.motor].cap + c.bag;
export const speedOf = (c) => MOTORS[c.motor].speed * (1 + RIDE_STEP * c.ride);
export const walkRate = (G) => WALK.rate * fameMult(G) * varietyMult(G) * stageOf(G).appeal; // a minute
export const delivRate = (G) => (G.couriers.length ? DELIV.rate * fameMult(G) * varietyMult(G) : 0);
export const cookRate = (G) => G.cooks.reduce((s, c) => s + 60 / (avgTime(G) * speedK(c.speed)), 0); // dishes a minute without you
export const seatsFree = (G) => stageOf(G).seats - G.tables.length;
export const packedN = (G) => { let n = 0; for (const id in G.orders) if (G.orders[id].st === 'packed') n++; return n; };
export const openN = (G) => Object.keys(G.orders).length;
// bags cooked ahead: one load per courier at most (a bag can't wait long for a courier who's out; tables get the rest)
export const packCap = (G) => G.couriers.reduce((s, c) => s + capOf(c), 0);
export const orderPay = (o) => Math.round((DISH[o.dish].price * o.q + DELIV.fee + DELIV.perM * o.d) * 10) / 10;
// (the tip falls off once the order took longer than 50 s from the call; charm multiplies it)
export const tipFor = (elapsed, charm) => Math.round(DELIV.tip * (1 + CHARM_STEP * charm) * Math.max(0.25, Math.min(1, (150 - elapsed) / 100)) * 10) / 10;
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

// delivery bags cooked or cooking that no courier has taken yet
function bagsAhead(G, skipYou = false) {
  let n = packedN(G);
  for (const p of skipYou ? G.cooks : [G.you, ...G.cooks]) if (p.job && p.job.kind === 'deliv') n++;
  return n;
}
// the next ticket a cook (or you) takes: the oldest, but no more delivery bags than the couriers can take soon
function nextTicket(G) {
  const bags = bagsAhead(G);
  const i = G.tickets.findIndex((t) => t.kind === 'table' || bags < packCap(G));
  return i < 0 ? null : G.tickets.splice(i, 1)[0];
}
export function canCook(G) {
  if (G.you.job) return 'busy';
  const bags = bagsAhead(G, true);
  return G.tickets.some((t) => t.kind === 'table' || bags < packCap(G)) ? 'ok' : 'none';
}

// ---------------------------------------------------------------- buying
function pay(G, cost) { if (cost == null || G.cash + 1e-9 < cost) return false; G.cash -= cost; G.stats.spent += cost; return true; }
export const whoOf = (G, id) => (id === 'you' ? G.you : G.cooks.find((c) => c.id === +id) || G.couriers.find((c) => c.id === +id) || null);
export const roleOf = (G, id) => (id === 'you' ? 'you' : G.cooks.some((c) => c.id === +id) ? 'cook' : G.couriers.some((c) => c.id === +id) ? 'rider' : null);
const indexOf = (G, id) => (id === 'you' ? 0 : Math.max(0, G.cooks.findIndex((c) => c.id === +id), G.couriers.findIndex((c) => c.id === +id)));
export const priceOfSkill = (G, id, sk) => { const p = whoOf(G, id); return p ? skillCost(sk, p[sk], indexOf(G, id)) : null; };
export const canExpand = (G) => { const n = nextStage(G); return !!n && fameLevel(G) >= n.fame; };
// everything for sale now (the bots read this)
export function prices(G) {
  const out = [];
  const add = (a, cost, id, sk) => { if (cost != null) out.push({ a, cost, id, sk }); };
  if (canExpand(G)) add('expand', nextStage(G).cost);
  if (roomFor(G, 'cook')) add('cook', cookHireCost(G));
  if (roomFor(G, 'courier')) add('courier', courierHireCost(G));
  for (const sk of ['speed', 'quality']) { add('skill', priceOfSkill(G, 'you', sk), 'you', sk); for (const c of G.cooks) add('skill', priceOfSkill(G, c.id, sk), c.id, sk); }
  for (const c of G.couriers) {
    add('motor', motorCost(c), c.id);
    for (const sk of ['ride', 'charm', 'bag']) add('skill', priceOfSkill(G, c.id, sk), c.id, sk);
  }
  return out;
}
function startJob(G, p, tk, t) {
  p.job = { ...tk, left: t, total: t, q: qualMult(p.quality) };
  if (tk.kind === 'deliv' && G.orders[tk.ref]) G.orders[tk.ref].st = 'cooking';
}
export function act(G, a, id, sk) {
  if (a === 'cook-tap') {
    if (canCook(G) !== 'ok') return false;
    const tk = nextTicket(G);
    startJob(G, G.you, tk, youTime(G, tk.dish));
    G.stats.taps++;
    return true;
  }
  if (a === 'expand') { if (!canExpand(G) || !pay(G, nextStage(G).cost)) return false; G.stage++; return true; }
  if (a === 'cook') {
    const dish = nextDish(G);
    if (!roomFor(G, 'cook') || !pay(G, cookHireCost(G))) return false;
    G.cooks.push(newCook(G, dish ? dish.id : null));
    if (dish) G.menu.push(dish.id);
    return true;
  }
  if (a === 'courier') { if (!roomFor(G, 'courier') || !pay(G, courierHireCost(G))) return false; G.couriers.push(newCourier(G)); return true; }
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
// returns events for the page: seat, served, order, packed, depart, stall, paid, lostWalk, lostOrder, cooked, fame
export function tick(G, W, dtIn, max = 1) {
  const ev = [];
  let left = Math.min(max, dtIn);
  while (left > 1e-6) { const dt = Math.min(0.25, left); left -= dt; step(G, W, dt, ev); }
  return ev;
}

const pickDish = (G) => G.menu[Math.floor(rnd(G) * G.menu.length)];
function seat(G, ev) {
  const tb = { id: G.seq++, dish: pickDish(G), st: 'wait', t0: G.t, left: 0 };
  G.tables.push(tb);
  G.tickets.push({ id: G.seq++, dish: tb.dish, kind: 'table', ref: tb.id, t0: G.t });
  ev.push({ kind: 'seat', dish: tb.dish });
}
function earn(G, amount) { G.cash += amount; G.stats.earned += amount; }
function sold(G, dish, ev) {
  const L = fameLevel(G); G.served++; G.sold[dish] = (G.sold[dish] || 0) + 1;
  if (fameLevel(G) > L) ev.push({ kind: 'fame', level: fameLevel(G) });
}
const dropTicket = (G, kind, ref) => { const i = G.tickets.findIndex((t) => t.kind === kind && t.ref === ref); if (i >= 0) G.tickets.splice(i, 1); };

// a dish is ready: to its table, or into a bag for a courier (if the customer is still there)
function finish(G, job, by, ev) {
  if (job.kind === 'table') {
    const tb = G.tables.find((x) => x.id === job.ref);
    if (!tb || tb.st !== 'wait') return;
    const amount = Math.round(DISH[job.dish].price * job.q * 10) / 10;
    tb.st = 'eat'; tb.left = WALK.eat;
    earn(G, amount); G.stats.tables++; sold(G, job.dish, ev);
    ev.push({ kind: 'served', amount, dish: job.dish, by });
  } else {
    const o = G.orders[job.ref];
    if (!o || o.st === 'bike') return;
    o.st = 'packed'; o.q = job.q;
    ev.push({ kind: 'packed', id: o.id, dish: job.dish, by });
  }
}

function step(G, W, dt, ev) {
  G.t += dt;
  const stg = stageOf(G);
  // 1. customers come in (a free table, or the line at the door); orders come from doors in the zone
  G.acc.walk += walkRate(G) / 60 * dt * (0.5 + rnd(G));
  let turnedAway = 0;
  while (G.acc.walk >= 1) {
    G.acc.walk -= 1;
    if (G.tables.length < stg.seats && !G.door.length) seat(G, ev);
    else if (G.door.length < WALK.door) G.door.push({ id: G.seq++, t0: G.t });
    else { G.stats.lostWalk++; turnedAway++; ev.push({ kind: 'lostWalk', full: true }); }
  }
  if (G.couriers.length && W.zone.length) {
    G.acc.deliv += delivRate(G) / 60 * dt * (0.5 + rnd(G));
    while (G.acc.deliv >= 1) {
      G.acc.deliv -= 1;
      if (openN(G) >= openMax(G)) continue; // (the phone's busy: nobody hears this one)
      const z = W.zone[Math.floor(rnd(G) * W.zone.length)];
      const o = { id: G.seq++, dish: pickDish(G), lot: z.lot, door: z.door, d: z.d, t0: G.t, st: 'open', q: 1, by: null };
      G.orders[o.id] = o;
      G.tickets.push({ id: G.seq++, dish: o.dish, kind: 'deliv', ref: o.id, t0: G.t });
      ev.push({ kind: 'order', id: o.id, door: o.door, dish: o.dish });
    }
  }
  // 2. tables: eaters finish and leave; the hungry give up after a while; the line at the door moves up
  for (let i = G.tables.length - 1; i >= 0; i--) {
    const tb = G.tables[i];
    if (tb.st === 'eat') { tb.left -= dt; if (tb.left <= 0) G.tables.splice(i, 1); continue; }
    if (G.t - tb.t0 > WALK.patience) { G.tables.splice(i, 1); dropTicket(G, 'table', tb.id); G.stats.lostWalk++; ev.push({ kind: 'lostWalk' }); }
  }
  while (G.door.length && G.t - G.door[0].t0 > WALK.doorPatience) { G.door.shift(); G.stats.lostWalk++; turnedAway++; ev.push({ kind: 'lostWalk', door: true }); }
  while (G.door.length && G.tables.length < stg.seats) { G.door.shift(); seat(G, ev); }
  for (const id in G.orders) {
    const o = G.orders[id];
    if (o.st === 'bike' || G.t - o.t0 <= DELIV.patience) continue;
    delete G.orders[id]; dropTicket(G, 'deliv', o.id); G.stats.lostOrders++; ev.push({ kind: 'lostOrder', door: o.door });
  }
  // 3. the kitchen: everyone on a dish works it down; free cooks take the next ticket (you take one per tap)
  const y = G.you;
  if (y.job) { y.job.left -= dt; if (y.job.left <= 0) { const j = y.job; y.job = null; y.made++; finish(G, j, 'you', ev); ev.push({ kind: 'cooked', by: 'you', dish: j.dish }); } }
  for (const c of G.cooks) {
    if (c.job) { c.job.left -= dt; if (c.job.left <= 0) { const j = c.job; c.job = null; c.made++; finish(G, j, c.id, ev); } }
    if (!c.job) { const tk = nextTicket(G); if (tk) startJob(G, c, tk, cookTime(c, tk.dish)); }
  }
  // 4. couriers at the restaurant take the bags (oldest first), wait a moment if another is nearly ready, and ride
  for (const c of G.couriers) {
    if (c.st !== 'idle') continue;
    const bags = Object.values(G.orders).filter((o) => o.st === 'packed').sort((a, b) => a.t0 - b.t0);
    if (!bags.length) { c.waited = false; continue; }
    if (bags.length < capOf(c) && !c.waited && Object.values(G.orders).some((o) => o.st === 'cooking')) { c.waited = true; c.st = 'wait'; c.wait = 3; continue; }
    depart(G, W, c, bags, ev);
  }
  // 5. couriers move
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
  // 6. running measures for the "what's holding you back" banner
  const k = Math.min(1, dt / 10);
  const tableTickets = G.tickets.filter((t) => t.kind === 'table').length;
  const busyCooks = G.cooks.filter((c) => c.job).length;
  G.ema.kitchen += ((tableTickets >= 2 + Math.floor(G.cooks.length / 2) ? 1 : 0) - G.ema.kitchen) * k;
  G.ema.seats += ((G.door.length >= 2 || turnedAway ? 1 : 0) - G.ema.seats) * k;
  let oldest = 0; for (const id in G.orders) { const o = G.orders[id]; if (o.st !== 'bike') oldest = Math.max(oldest, G.t - o.t0); }
  G.ema.bags += ((oldest > 50 && !G.couriers.some((c) => c.st === 'idle' || c.st === 'wait') ? 1 : 0) - G.ema.bags) * k;
  G.ema.quiet += ((G.cooks.length && busyCooks < G.cooks.length && !G.tickets.length && !G.door.length ? 1 : 0) - G.ema.quiet) * k;
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
      earn(G, amount + tip); G.stats.tips += tip; G.stats.deliveries++; sold(G, o.dish, ev);
      ev.push({ kind: 'paid', door: o.door, amount: amount + tip, tip, courier: c.id, dish: o.dish });
      delete G.orders[o.id];
    }
    if (c.load.length) { go(c, W, c.at, G.orders[c.load[0]].door); c.leg.t = -HANDOVER; return; }
    c.st = 'home'; go(c, W, c.at, W.door); c.leg.t = -HANDOVER;
    return;
  }
  if (c.st === 'home') { c.st = 'idle'; c.at = W.door; }
}

// ---------------------------------------------------------------- what's holding the restaurant back (the banner and the bots)
// kind: 'kitchen' (tables wait for their food), 'seats' (customers wait for a table or walk away), 'bags' (delivery
// orders wait for a courier), 'quiet' (cooks stand around: more dishes, fame, a bigger place bring customers), 'ok'
export function diagnose(G) {
  const c = [['kitchen', G.ema.kitchen], ['seats', G.ema.seats], ['bags', G.ema.bags], ['quiet', G.ema.quiet * 0.9]].filter((x) => x[1] > 0.5);
  c.sort((a, b) => b[1] - a[1]);
  return { kind: c.length ? c[0][0] : 'ok' };
}

export const short = (n) => {
  const a = Math.abs(n);
  if (a < 1000) return (Math.round(n * 10) / 10).toString().replace(/\.0$/, '');
  const u = ['K', 'M', 'B', 'T']; let i = -1, x = a;
  while (x >= 1000 && i < u.length - 1) { x /= 1000; i++; }
  const t = x >= 100 ? String(Math.round(x)) : String(parseFloat(x.toFixed(x >= 10 ? 1 : 2))); // (12.0K → 12K, 100K stays 100K)
  return (n < 0 ? '-' : '') + t + u[i];
};
export const money = (n) => '$' + (Math.abs(n) < 100 ? (Math.round(n * 10) / 10).toString() : short(Math.round(n)));

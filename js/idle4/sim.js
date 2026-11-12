// Ferdi's (idle4.html): the rules. Uncle Ferdi left you a run-down restaurant in Old Town: a building of rooms, most of
// them in ruins. Customers walk in off the street, wait on a bench if every table is taken, sit down and order; a cook
// takes the ticket to the station of that dish, cooks it and puts the plate on the pass; a waiter brings it to the
// table; they eat, and pay at the cashier (or, while the cashier is in ruins, a waiter brings the bill to the table).
// At first you do all of it yourself; every cook and waiter you hire takes a job off your hands, and when nobody needs
// you any more you sit down in Ferdi's office. Each room has things to buy (tables, staff, stations, upgrades); when
// everything in a room is at its cap the room can be renovated to the next level, which raises the caps. The office's
// level is the restaurant's level: no other room can be more than one level above it. The staff room's lockers set how
// many people can work here. Customers sometimes leave a tip by their chair, to be picked up (a tap). What the place
// earns while the game is closed waits in the mailbox, with the letters people send. A chain of quests leads the way.
// Pure: no DOM, no three.js. G is plain JSON (the save). Every walk is timed on the floor plan's routes (plan.js), the
// same ones the view walks the characters along.
import * as P from './plan.js';
import { FIRST_NAMES } from '../data.js';

export const KEY = 'fds_idle4_v1';

// ---------------------------------------------------------------- the menu: a station in the kitchen per dish (built in this order)
// price $, time s at a level 1 station, build $ (the burger grill is there from the start)
export const DISHES = [
  { id: 'burger', name: 'Smash Burger', price: 8, time: 7, build: 0, station: 'Grill' },
  { id: 'hotdog', name: 'Hot Dog', price: 10, time: 7, build: 50, station: 'Sausage grill' },
  { id: 'doner', name: 'Döner', price: 16, time: 9, build: 400, station: 'Döner spit' },
  { id: 'pizza', name: 'Pizza', price: 24, time: 12, build: 2500, station: 'Pizza oven' },
  { id: 'noodle', name: 'Noodles', price: 26, time: 10, build: 9000, station: 'Wok' },
  { id: 'fish', name: 'Fish & Chips', price: 32, time: 12, build: 30000, station: 'Fryer' },
  { id: 'sushi', name: 'Sushi', price: 44, time: 14, build: 90000, station: 'Sushi bar' },
  { id: 'icecream', name: 'Ice Cream', price: 24, time: 5, build: 200000, station: 'Ice cream bar' },
];
export const DISH = Object.fromEntries(DISHES.map((d) => [d.id, d]));
P.stationSpots(DISHES.map((d) => d.id));

// ---------------------------------------------------------------- rooms
// up[L]: [cost $, seconds] to go from level L to L + 1 (L 0: the repair); gate: the office level a repair needs.
// Items: 'n' a count (caps[room level]: how many the room holds; cost[n]: the price of the (n + 1)th),
// 'lv' an upgrade (cap 5 a room level; base × g^level), 'st' the kitchen's stations (one item per dish, see below).
export const MAXLV = 5;
export const LV_CAP = 5; // (an upgrade's cap: this × the room's level)
export const STATIONS_AT = [0, 2, 3, 5, 6, 8]; // stations the kitchen holds at each level
export const ROOMS = {
  entrance: {
    name: 'Entrance', start: 0, gate: 0, up: [[40, 10], [300, 25], [3000, 50], [25000, 90], [150000, 150]],
    blurb: 'Benches for people to wait on when every table is taken, and a sign that brings them in.',
    items: {
      benches: { kind: 'n', name: 'Waiting bench', caps: [0, 1, 2, 3, 4, 5], cost: [20, 90, 350, 1300, 4500], what: 'Two more people wait for a table' },
      sign: { kind: 'lv', name: 'Sign', base: 8, g: 1.26, what: 'More people walk in' },
      decor: { kind: 'lv', name: 'Flowers', base: 6, g: 1.26, what: 'People wait longer on the benches' },
    },
  },
  dining: {
    name: 'Dining Hall', start: 1, gate: 0, up: [[0, 0], [200, 20], [2500, 45], [20000, 90], [140000, 150]],
    blurb: 'Tables, and the waiters who bring the food from the pass.',
    items: {
      tables: { kind: 'n', name: 'Table', caps: [0, 4, 6, 8, 9, 10], start: 2, cost: [0, 0, 15, 40, 100, 250, 600, 1400, 3000, 6500], what: 'Two more seats' },
      waiters: { kind: 'n', name: 'Waiter', caps: [0, 2, 3, 4, 5, 6], cost: [25, 150, 900, 3500, 10000, 25000], what: 'Brings plates to the tables' },
      comfort: { kind: 'lv', name: 'Comfy chairs', base: 8, g: 1.26, what: 'People pay more' },
      service: { kind: 'lv', name: 'Trays & shoes', base: 9, g: 1.26, what: 'Waiters walk faster' },
    },
  },
  kitchen: {
    name: 'Kitchen', start: 1, gate: 0, up: [[0, 0], [250, 20], [3000, 45], [25000, 90], [160000, 150]],
    blurb: 'A station for every dish on the menu, and the cooks who work them.',
    items: {
      cooks: { kind: 'n', name: 'Cook', caps: [0, 2, 3, 5, 6, 8], cost: [10, 90, 600, 2500, 7000, 16000, 35000, 70000], what: 'Cooks the orders' },
      ...Object.fromEntries(DISHES.map((d) => [`st:${d.id}`, { kind: 'st', dish: d.id, name: d.station, base: d.price * 0.75, g: 1.26, what: 'Cooks faster, sells for more' }])),
    },
  },
  cashier: {
    name: 'Cashier', start: 0, gate: 0, up: [[150, 15], [900, 35], [7000, 70], [50000, 120], [250000, 180]],
    blurb: 'People pay here on their way out, so the waiters don\'t have to bring the bill and the table is free sooner.',
    items: {
      registers: { kind: 'n', name: 'Register', caps: [0, 1, 2, 2, 3, 3], cost: [70, 900, 7000], what: 'A cashier takes the money' },
      speed: { kind: 'lv', name: 'Card reader', base: 12, g: 1.26, what: 'Paying is quicker' },
      upsell: { kind: 'lv', name: 'Cake display', base: 15, g: 1.26, what: 'People add a little something' },
    },
  },
  office: {
    name: 'Ferdi\'s Office', start: 0, gate: 0, up: [[120, 15], [900, 40], [8000, 80], [60000, 140], [300000, 200]],
    blurb: 'Where the restaurant is run from. Its level is the restaurant\'s level: no room can be more than one level above it.',
    items: {
      ledger: { kind: 'lv', name: 'Ledger', base: 15, g: 1.26, what: 'Every dish sells for more' },
      ads: { kind: 'lv', name: 'Flyers', base: 14, g: 1.26, what: 'More people walk in' },
      training: { kind: 'lv', name: 'Training', base: 18, g: 1.26, what: 'Everyone works faster' },
    },
  },
  terrace: {
    name: 'Terrace', start: 0, gate: 2, up: [[1500, 45], [9000, 70], [50000, 100], [250000, 150], [0, 0]],
    blurb: 'Tables outside in the sun. People love it.',
    items: {
      tables: { kind: 'n', name: 'Table', caps: [0, 3, 5, 7, 9, 9], cost: [300, 500, 900, 1600, 2800, 5000, 9000, 16000, 28000], what: 'Two more seats outside' },
      parasols: { kind: 'lv', name: 'Parasols', base: 60, g: 1.26, what: 'People outside pay more' },
    },
  },
  staff: {
    name: 'Staff Room', start: 0, gate: 1, up: [[300, 30], [2500, 50], [20000, 90], [120000, 140], [400000, 190]],
    blurb: 'Where the team changes and takes a coffee. Every locker is room for one more on the team.',
    items: {
      lockers: { kind: 'n', name: 'Locker', caps: [0, 3, 5, 8, 10, 12], cost: [150, 250, 600, 1500, 3000, 6000, 10000, 16000, 25000, 40000, 60000, 90000], what: 'Room for one more on the team' },
      coffee: { kind: 'lv', name: 'Coffee machine', base: 14, g: 1.26, what: 'The staff walk faster' },
      uniforms: { kind: 'lv', name: 'Uniforms', base: 12, g: 1.26, what: 'More people leave a tip' },
    },
  },
  bay: { name: 'Courier Bay', soon: 'phase 4', start: 0, gate: 99, up: [], items: {} },
};
export const ROOM_IDS = Object.keys(ROOMS);
// effect of one level of each upgrade
export const STEP = { sign: 0.04, ads: 0.04, decor: 0.1, comfort: 0.08, service: 0.05, ledger: 0.05, training: 0.025, speed: 0.07, upsell: 0.05, parasols: 0.08, stPrice: 0.1, stSpeed: 0.95,
  coffee: 0.03, uniforms: 0.06 };
// the team: this many can work here without a staff room, one more for every locker in it
export const STAFF_BASE = 5;
const HIRE = { cooks: 'cook', waiters: 'waiter', registers: 'cashier' };
// tips: the chance a paying customer leaves one by their chair (× uniforms), its share of the bill; at most this many
// lie about at a time
export const TIPS = { chance: 0.12, share: 0.4, max: 8 };

// ---------------------------------------------------------------- people
export const WALK = { rate: 8, variety: 0.12, appeal: 0.03 }; // walk-ins a minute (× sign, flyers, dishes, room levels)
export const PATIENCE = { bench: 30, food: 70 }; // s on a bench before they give up, s at the table waiting for food
export const EAT = 12;
export const SPEED = { customer: 1.5, staff: 2.2 }; // m/s
export const CHECKOUT = 4, BILL = 1.4, PICK = 0.3, PLACE = 0.45, PLATE = 0.25, IDLE_HOME = 1.5, LOCKER = 1.2;
export const QMAX = P.QUEUE.length;

// ---------------------------------------------------------------- the save
const ITEM_START = (room, id) => ROOMS[room].items[id].start ?? (ROOMS[room].items[id].kind === 'st' && ROOMS[room].items[id].dish === 'burger' ? 1 : 0);
export function fresh(keep = {}) {
  const rooms = {};
  for (const id of ROOM_IDS) rooms[id] = { lv: ROOMS[id].start, it: Object.fromEntries(Object.keys(ROOMS[id].items).map((k) => [k, ITEM_START(id, k)])) };
  const G = {
    v: 1, t: 0, cash: 15, seed: 20261112, seq: 1,
    rooms, build: null, // { room, to, t0, dur }
    staff: [], cust: [],
    seats: {}, benches: {}, // seat / bench id → customer id
    tickets: [], pass: [], queue: [], regs: [], stBusy: {},
    acc: { walk: 0.7 },
    stats: { served: 0, lost: 0, earned: 0, spent: 0, walkins: 0, tips: 0, tipCash: 0, letters: 0 },
    sold: {},
    tips: [], // { id, seat, amount }
    mail: [], // { id, kind: 'letter' | 'away', key, cash, secs, served, read }
    quest: { i: 0 }, sent: {}, // (the quest you're on; the letters already sent)
    ema: { food: 0, plates: 0, seats: 0, pay: 0, quiet: 0 },
    settings: { music: 0.5, sfx: 1, quality: 'auto', haptics: true },
    seen: {},
    ...keep,
  };
  G.staff.push(newStaff(G, 'you', 0));
  return G;
}
// an older save: rooms and things it didn't know about yet
export function migrate(G) {
  for (const id of ROOM_IDS) {
    G.rooms[id] ||= { lv: ROOMS[id].start, it: {} };
    for (const k of Object.keys(ROOMS[id].items)) G.rooms[id].it[k] ??= ITEM_START(id, k);
  }
  return G;
}
function newStaff(G, role, k) {
  const id = role === 'you' ? 0 : G.seq++;
  return { id, role, k, name: role === 'you' ? 'You' : FIRST_NAMES[(id * 7 + 3) % FIRST_NAMES.length], st: 'idle', at: homeOf(G, { role, k }), a: null, b: null, t0: 0, dur: 0, job: null, carry: null };
}

function rnd(G) {
  let t = (G.seed = (G.seed + 0x6d2b79f5) | 0);
  t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

// ---------------------------------------------------------------- reading the rooms
export const lvOf = (G, room) => G.rooms[room].lv;
export const itemOf = (G, room, id) => G.rooms[room].it[id] ?? 0;
export const officeLv = (G) => G.rooms.office.lv;
export const restaurantLv = (G) => Math.max(1, officeLv(G));
export const menu = (G) => DISHES.filter((d) => itemOf(G, 'kitchen', `st:${d.id}`) > 0).map((d) => d.id);
export const nTables = (G, room) => (lvOf(G, room) > 0 ? itemOf(G, room, 'tables') : 0);
export const nCooks = (G) => itemOf(G, 'kitchen', 'cooks');
export const nWaiters = (G) => itemOf(G, 'dining', 'waiters');
export const nRegisters = (G) => (lvOf(G, 'cashier') > 0 ? itemOf(G, 'cashier', 'registers') : 0);
export const nBenchSeats = (G) => (lvOf(G, 'entrance') > 0 ? itemOf(G, 'entrance', 'benches') * 2 : 0);
export const cashierOpen = (G) => nRegisters(G) > 0;
const step = (G, room, id) => 1 + STEP[id] * itemOf(G, room, id);
export const stPrice = (L) => Math.pow(1 + STEP.stPrice, Math.max(0, L - 1));
export const stTime = (dish, L) => DISH[dish].time * Math.pow(STEP.stSpeed, Math.max(0, L - 1));
export const variety = (G) => 1 + WALK.variety * (menu(G).length - 1);
export const appeal = (G) => { let s = 0; for (const id of ROOM_IDS) if (id !== 'staff') s += G.rooms[id].lv; return 1 + WALK.appeal * Math.max(0, s - 2); }; // (the rooms customers see)
export const walkRate = (G) => WALK.rate * step(G, 'entrance', 'sign') * step(G, 'office', 'ads') * variety(G) * appeal(G); // a minute
export const trainK = (G) => step(G, 'office', 'training');
export const staffSpeed = (G, s) => SPEED.staff * trainK(G) * step(G, 'staff', 'coffee') * (s.role === 'waiter' || s.role === 'you' ? step(G, 'dining', 'service') : 1);
export const staffCount = (G) => G.staff.length - 1; // (not you)
export const staffCap = (G) => STAFF_BASE + (lvOf(G, 'staff') > 0 ? itemOf(G, 'staff', 'lockers') : 0);
export const tipChance = (G) => TIPS.chance * step(G, 'staff', 'uniforms');
export const cookTime = (G, dish) => stTime(dish, itemOf(G, 'kitchen', `st:${dish}`)) / trainK(G);
export const checkoutTime = (G) => CHECKOUT * Math.pow(1 - STEP.speed, itemOf(G, 'cashier', 'speed')) / trainK(G);
export const benchPatience = (G) => PATIENCE.bench * step(G, 'entrance', 'decor');
// what a dish brings at a seat (room: 'dining' | 'terrace'), paid at the table or at the register (the cake display)
export function priceOf(G, dish, room, atRegister) {
  const L = itemOf(G, 'kitchen', `st:${dish}`);
  return DISH[dish].price * stPrice(L) * step(G, 'office', 'ledger') * (room === 'terrace' ? step(G, 'terrace', 'parasols') : step(G, 'dining', 'comfort'))
    * (atRegister ? step(G, 'cashier', 'upsell') : 1);
}

// ---------------------------------------------------------------- caps, prices, renovations
export function capOf(G, room, id) {
  const R = lvOf(G, room), it = ROOMS[room].items[id];
  if (it.kind === 'n') return it.caps[R] ?? 0;
  if (it.kind === 'st') return DISHES.findIndex((d) => d.id === it.dish) < STATIONS_AT[R] ? LV_CAP * R : 0;
  return LV_CAP * R;
}
export function itemCost(G, room, id) {
  const it = ROOMS[room].items[id], n = itemOf(G, room, id);
  if (n >= capOf(G, room, id)) return null;
  if (it.kind === 'n') return it.cost[n] ?? null;
  if (it.kind === 'st') return n === 0 ? DISH[it.dish].build : Math.round(it.base * Math.pow(it.g, n - 1));
  return Math.round(it.base * Math.pow(it.g, n));
}
// the items a room's next level waits for: [done, of]
export function readiness(G, room) {
  let done = 0, of = 0;
  for (const id in ROOMS[room].items) {
    const cap = capOf(G, room, id);
    if (!cap) continue;
    of++; if (itemOf(G, room, id) >= cap) done++;
  }
  return [done, of];
}
// can this be bought now, apart from the cash? → null, or 'staff' (a hire, and the team is full: lockers first)
export const itemBlock = (G, room, id) => (HIRE[id] && staffCount(G) >= staffCap(G) ? 'staff' : null);
// can the room go up a level now? → null, or why not: 'max' | 'soon' | 'build' (a renovation is going on somewhere) |
// 'office' (the office has to go up first) | 'gate' (a repair waiting for the office) | 'items' (not everything at its cap)
export function upBlock(G, room) {
  const R = ROOMS[room], L = lvOf(G, room);
  if (R.soon) return 'soon';
  if (L >= MAXLV || !R.up[L] || !R.up[L][0]) return 'max';
  if (G.build) return 'build';
  if (L === 0 && officeLv(G) < R.gate) return 'gate';
  if (room !== 'office' && L >= 1 && L + 1 > officeLv(G) + 1) return 'office';
  if (L >= 1) { const [d, o] = readiness(G, room); if (d < o) return 'items'; }
  return null;
}
export const upCost = (G, room) => ROOMS[room].up[lvOf(G, room)]?.[0] ?? null;
export const upTime = (G, room) => ROOMS[room].up[lvOf(G, room)]?.[1] ?? 0;
export const building = (G, room) => (G.build && G.build.room === room ? G.build : null);

// everything for sale now (the bots and the green arrows read this)
export function prices(G) {
  const out = [];
  for (const room of ROOM_IDS) {
    if (lvOf(G, room) > 0) for (const id in ROOMS[room].items) { const c = itemCost(G, room, id); if (c != null && !itemBlock(G, room, id)) out.push({ a: 'item', room, id, cost: c }); }
    if (!upBlock(G, room)) out.push({ a: 'up', room, cost: upCost(G, room) });
  }
  return out;
}
export const affordable = (G, room) => prices(G).some((p) => p.room === room && p.cost <= G.cash);

function pay(G, cost) { if (cost == null || G.cash + 1e-9 < cost) return false; G.cash -= cost; G.stats.spent += cost; return true; }
// → false, or what happened: { hire: staff } | { up: room } | { item }
export function act(G, a, room, id) {
  if (a === 'up') {
    if (upBlock(G, room) || !pay(G, upCost(G, room))) return false;
    G.build = { room, to: lvOf(G, room) + 1, t0: G.t, dur: upTime(G, room) };
    return { up: room };
  }
  if (a === 'item') {
    const it = ROOMS[room]?.items[id];
    if (!it || lvOf(G, room) < 1 || itemBlock(G, room, id) || !pay(G, itemCost(G, room, id))) return false;
    G.rooms[room].it[id]++;
    const role = HIRE[id];
    if (role) {
      const s = newStaff(G, role, G.staff.filter((x) => x.role === role).length);
      // (new staff walk in from the street, change at a locker if there is a staff room, and go to work; a cashier is
      // at the register at once: people may be waiting to pay)
      if (role !== 'cashier') {
        s.at = 'front';
        if (lvOf(G, 'staff') > 0) startJob(G, s, 'locker', [{ go: `locker:${staffCount(G) % P.LOCKERS}` }, { work: LOCKER, anim: 'work' }], {}, []);
      }
      G.staff.push(s);
      if (role === 'cashier') G.regs.push(null);
      return { hire: s };
    }
    return { item: id };
  }
  return false;
}
// hurry a renovation along (the playtest bar; later: gems or an ad)
export function finishBuild(G, ev = []) { if (G.build) { G.build.dur = 0; settleBuild(G, ev); } return ev; }
function settleBuild(G, ev) {
  const b = G.build;
  if (!b || G.t < b.t0 + b.dur) return;
  G.rooms[b.room].lv = b.to; G.build = null;
  ev.push({ kind: 'built', room: b.room, lv: b.to });
}

// ---------------------------------------------------------------- who does what
// You do every job nobody is hired for: cooking until there's a cook, waiting tables until there's a waiter. With both
// you go to the office (or stand at the door while the office is in ruins).
export const youCook = (G) => nCooks(G) === 0;
export const youServe = (G) => nWaiters(G) === 0;
export function homeOf(G, s) {
  if (s.role === 'cook') return `kidle:${s.k % 8}`;
  if (s.role === 'waiter') return `widle:${s.k % 6}`;
  if (s.role === 'cashier') return `creg:${s.k}`;
  if (youCook(G)) return 'kidle:7';
  if (youServe(G)) return 'widle:5';
  return officeLv(G) > 0 ? 'office' : 'host';
}
const canCook = (G, s) => s.role === 'cook' || (s.role === 'you' && youCook(G));
const canServe = (G, s) => s.role === 'waiter' || (s.role === 'you' && youServe(G));
const custBy = (G, id) => G.cust.find((c) => c.id === id) || null;

// a job is a list of steps: { go: spot } walks there, { work: s, on } stands and works, then `on` happens
function startJob(G, s, kind, steps, data, ev) { s.job = { kind, steps, i: -1, ...data }; nextStep(G, s, ev); }
function nextStep(G, s, ev) {
  const j = s.job;
  for (;;) {
    j.i++;
    if (j.i >= j.steps.length) { s.job = null; s.st = 'idle'; s.t0 = G.t; return; }
    const st = j.steps[j.i];
    if (st.go) {
      if (st.go === s.at) continue;
      s.st = 'go'; s.a = s.at; s.b = st.go; s.t0 = G.t; s.dur = P.dist(s.at, st.go) / staffSpeed(G, s);
      return;
    }
    s.st = 'work'; s.t0 = G.t; s.dur = st.work; s.anim = st.anim || 'work';
    return;
  }
}
function stepDone(G, s, ev) {
  const j = s.job, st = j.steps[j.i];
  if (st.go) { s.at = st.go; s.a = s.b = null; }
  else if (st.on) happen(G, s, j, st.on, ev);
  if (s.job === j) nextStep(G, s, ev);
}
function happen(G, s, j, on, ev) {
  if (on === 'cooked') { delete G.stBusy[j.dish]; s.carry = j.dish; ev.push({ kind: 'cooked', dish: j.dish, by: s.id }); return; }
  if (on === 'plate') { // (on the pass in front of the station, if the customer is still there)
    s.carry = null;
    const c = custBy(G, j.cust);
    if (c && c.st === 'wait') G.pass.push({ id: G.seq++, dish: j.dish, cust: c.id, t0: G.t, w: null });
    else ev.push({ kind: 'wasted', dish: j.dish });
    return;
  }
  if (on === 'pick') { const i = G.pass.findIndex((p) => p.id === j.plate); if (i >= 0) G.pass.splice(i, 1); s.carry = j.dish; return; }
  if (on === 'place') {
    s.carry = null;
    const c = custBy(G, j.cust);
    if (!c || c.st !== 'wait') { ev.push({ kind: 'wasted', dish: j.dish }); return; }
    c.st = 'eat'; c.t0 = G.t; c.dur = EAT;
    ev.push({ kind: 'served', cust: c.id, dish: j.dish, seat: c.seat, by: s.id });
    return;
  }
  if (on === 'bill') { const c = custBy(G, j.cust); if (c && c.st === 'bill') { paid(G, c, false, ev); leaveSeat(G, c, false); } }
}

// ---------------------------------------------------------------- customers
function walk(G, c, b, then) { c.a = c.at; c.b = b; c.st = 'go'; c.then = then; c.t0 = G.t; c.dur = P.dist(c.at, b) / SPEED.customer; }
function seatFree(G) {
  // an empty table first (dining hall, then terrace), else the other chair of a table
  let half = null;
  for (const room of ['dining', 'terrace']) {
    const n = nTables(G, room);
    for (let i = 0; i < n; i++) {
      const [s0, s1] = P.TABLES[room][i].seats, f0 = !G.seats[s0], f1 = !G.seats[s1];
      if (f0 && f1) return s0;
      if (!half && (f0 || f1)) half = f0 ? s0 : s1;
    }
  }
  return half;
}
function benchFree(G) { const n = nBenchSeats(G); for (let i = 0; i < n; i++) if (!G.benches[`b:${i}`]) return `b:${i}`; return null; }
const seatRoom = (seat) => (seat[0] === 'd' ? 'dining' : 'terrace');
function sitDown(G, c, seat) { G.seats[seat] = c.id; c.seat = seat; walk(G, c, seat, 'sit'); }
function leaveSeat(G, c, lost) {
  if (c.seat && G.seats[c.seat] === c.id) delete G.seats[c.seat];
  c.mood = lost ? 'mad' : 'happy';
  walk(G, c, c.exit, 'gone');
}
function lose(G, c, ev, why) {
  G.stats.lost++;
  ev.push({ kind: 'lost', cust: c.id, why, at: c.at });
}
function paid(G, c, atRegister, ev) {
  const amount = Math.round(priceOf(G, c.dish, seatRoom(c.seat), atRegister) * 10) / 10;
  G.cash += amount; G.stats.earned += amount; G.stats.served++; G.sold[c.dish] = (G.sold[c.dish] || 0) + 1;
  ev.push({ kind: 'paid', cust: c.id, amount, at: c.at, dish: c.dish });
  // a tip by the chair, now and then
  if (c.seat && G.tips.length < TIPS.max && rnd(G) < tipChance(G)) {
    const t = { id: G.seq++, seat: c.seat, amount: Math.max(1, Math.round(amount * TIPS.share)) };
    G.tips.push(t); ev.push({ kind: 'tip', tip: t.id });
  }
}
// picking a tip up → its amount (0 if it's gone)
export function collectTip(G, id) {
  const i = G.tips.findIndex((t) => t.id === id);
  if (i < 0) return 0;
  const t = G.tips.splice(i, 1)[0];
  G.cash += t.amount; G.stats.earned += t.amount; G.stats.tips++; G.stats.tipCash += t.amount;
  return t.amount;
}
function arrive(G, c, ev) {
  c.at = c.b; c.a = c.b = null;
  const then = c.then; c.then = null;
  if (then === 'door') {
    const seat = seatFree(G);
    if (seat) { sitDown(G, c, seat); return; }
    const b = benchFree(G);
    if (b) { G.benches[b] = c.id; c.bench = b; walk(G, c, b, 'bench'); return; }
    lose(G, c, ev, 'full'); c.mood = 'mad'; walk(G, c, c.exit, 'gone');
    return;
  }
  if (then === 'bench') { c.st = 'bench'; c.t0 = G.t; return; }
  if (then === 'sit') {
    const m = menu(G), dish = m[Math.floor(rnd(G) * m.length)];
    c.st = 'wait'; c.t0 = G.t; c.dish = dish;
    G.tickets.push({ id: G.seq++, dish, cust: c.id, t0: G.t });
    ev.push({ kind: 'order', cust: c.id, dish });
    return;
  }
  if (then === 'queue') { c.st = 'queue'; c.t0 = G.t; return; }
  if (then === 'pay') { c.st = 'pay'; c.t0 = G.t; c.dur = checkoutTime(G); const s = G.staff.find((x) => x.role === 'cashier' && x.k === c.reg); if (s) { s.st = 'work'; s.t0 = G.t; s.dur = c.dur; s.anim = 'work'; } return; }
  if (then === 'gone') c.st = 'gone';
}
const QSPOT = (k) => `q:${Math.min(k, P.QUEUE.length - 1)}`;

// ---------------------------------------------------------------- time passes
// returns events for the page: order, cooked, served, paid, lost (why: 'full' | 'bench' | 'food'), wasted, built
export function tick(G, dtIn, max = 1) {
  const ev = [];
  let left = Math.min(max, dtIn);
  while (left > 1e-6) { const dt = Math.min(0.2, left); left -= dt; stepSim(G, dt, ev); }
  return ev;
}

function stepSim(G, dt, ev) {
  G.t += dt;
  settleBuild(G, ev);
  // 1. people walk in off the street (from the left mostly) and decide at the door
  G.acc.walk += walkRate(G) / 60 * dt * (0.5 + rnd(G));
  while (G.acc.walk >= 1) {
    G.acc.walk -= 1;
    const left = rnd(G) < 0.7;
    const c = { id: G.seq++, ch: Math.floor(rnd(G) * 1000), at: left ? 'spawnL' : 'spawnR', exit: rnd(G) < 0.6 ? 'spawnR' : 'spawnL', st: 'go', seat: null, bench: null, dish: null, reg: null, mood: null };
    if (!left && c.exit === 'spawnR') c.exit = 'spawnL';
    G.cust.push(c); G.stats.walkins++;
    walk(G, c, 'front', 'door');
  }
  // 2. customers: arrive where they walked to; give up waiting; finish eating
  for (const c of G.cust) {
    if (c.st === 'go') { if (G.t >= c.t0 + c.dur) arrive(G, c, ev); continue; }
    if (c.st === 'bench' && G.t - c.t0 > benchPatience(G)) {
      delete G.benches[c.bench]; c.bench = null; lose(G, c, ev, 'bench'); c.mood = 'mad'; walk(G, c, c.exit, 'gone');
    } else if (c.st === 'wait' && G.t - c.t0 > PATIENCE.food && !G.pass.some((p) => p.cust === c.id && p.w) && !G.staff.some((s) => s.job?.cust === c.id && s.carry)) {
      const i = G.tickets.findIndex((t) => t.cust === c.id); if (i >= 0) G.tickets.splice(i, 1);
      const k = G.pass.findIndex((p) => p.cust === c.id); if (k >= 0) G.pass.splice(k, 1);
      lose(G, c, ev, 'food'); leaveSeat(G, c, true);
    } else if (c.st === 'eat' && G.t >= c.t0 + c.dur) { c.st = 'bill'; c.t0 = G.t; }
    else if (c.st === 'pay' && G.t >= c.t0 + c.dur) {
      paid(G, c, true, ev); G.regs[c.reg] = null;
      const s = G.staff.find((x) => x.role === 'cashier' && x.k === c.reg); if (s && s.st === 'work') { s.st = 'idle'; s.t0 = G.t; }
      c.mood = 'happy'; walk(G, c, c.exit, 'gone');
    }
  }
  // waiting on a bench → the first free seat (longest waiting first)
  const benchers = G.cust.filter((c) => c.st === 'bench').sort((a, b) => a.t0 - b.t0);
  for (const c of benchers) { const seat = seatFree(G); if (!seat) break; delete G.benches[c.bench]; c.bench = null; sitDown(G, c, seat); }
  // done eating: to the line at the cashier (if there's room in it), else wait for the bill at the table
  if (cashierOpen(G)) {
    for (const c of G.cust) {
      if (c.st !== 'bill' || G.queue.length >= QMAX) continue;
      G.queue.push(c.id);
      if (c.seat && G.seats[c.seat] === c.id) delete G.seats[c.seat];
      walk(G, c, QSPOT(G.queue.length - 1), 'queue');
    }
    // registers: the first in line steps up to a free one
    for (let r = 0; r < nRegisters(G); r++) {
      if (G.regs[r] != null || !G.queue.length) continue;
      const c = custBy(G, G.queue[0]);
      if (!c || c.st !== 'queue') break;
      G.queue.shift(); G.regs[r] = c.id; c.reg = r;
      c.at = 'q:0'; walk(G, c, `reg:${r}`, 'pay'); // (the line moved up under them: they step from its head)
    }
  }
  G.cust = G.cust.filter((c) => c.st !== 'gone');
  // 3. staff: walk, work; then the free ones take the next job
  for (const s of G.staff) {
    if (s.job && (s.st === 'go' || s.st === 'work') && G.t >= s.t0 + s.dur) stepDone(G, s, ev);
  }
  dispatch(G, ev);
  // 4. renovation done? the post?
  settleBuild(G, ev);
  post(G);
  // 5. running measures (what holds the place back)
  const k = Math.min(1, dt / 12);
  const waiting = G.cust.filter((c) => c.st === 'wait').length;
  const em = (key, on) => { G.ema[key] += ((on ? 1 : 0) - G.ema[key]) * k; };
  em('food', G.tickets.length >= 2 + Math.floor(nCooks(G) / 2) && waiting >= 2);
  em('plates', G.pass.filter((p) => !p.w).length >= 2);
  em('seats', G.cust.some((c) => c.st === 'bench') || ev.some((e) => e.kind === 'lost' && e.why === 'full'));
  em('pay', G.cust.filter((c) => c.st === 'bill').length >= 2 || G.queue.length >= QMAX - 1);
  em('quiet', !waiting && !G.tickets.length && Object.keys(G.seats).length < 2 * (nTables(G, 'dining') + nTables(G, 'terrace')) - 1);
}

function dispatch(G, ev) {
  const free = G.staff.filter((s) => s.st === 'idle' && !s.job);
  for (const s of free) {
    // waiters first carry plates, then bring bills; cooks take the oldest ticket whose station is free
    if (canServe(G, s)) {
      const p = G.pass.find((x) => !x.w);
      if (p) {
        const c = custBy(G, p.cust);
        p.w = s.id;
        startJob(G, s, 'serve', [{ go: `pass:${p.dish}` }, { work: PICK, on: 'pick' }, { go: P.aisleOf(c.seat) }, { work: PLACE, on: 'place' }], { plate: p.id, dish: p.dish, cust: p.cust }, ev);
        continue;
      }
      if (!cashierOpen(G)) {
        const c = G.cust.find((x) => x.st === 'bill' && !x.billBy);
        if (c) { c.billBy = s.id; startJob(G, s, 'bill', [{ go: P.aisleOf(c.seat) }, { work: BILL, on: 'bill', anim: 'take' }], { cust: c.id }, ev); continue; }
      }
    }
    if (canCook(G, s)) {
      const i = G.tickets.findIndex((t) => !G.stBusy[t.dish]);
      if (i >= 0) {
        const t = G.tickets.splice(i, 1)[0], c = custBy(G, t.cust);
        G.stBusy[t.dish] = s.id;
        // (you, cooking and serving on your own: straight to the table with it)
        const tail = canServe(G, s) && c ? [{ go: P.aisleOf(c.seat) }, { work: PLACE, on: 'place' }] : [{ work: PLATE, on: 'plate' }];
        startJob(G, s, 'cook', [{ go: `st:${t.dish}` }, { work: cookTime(G, t.dish), on: 'cooked', anim: 'cook' }, ...tail], { dish: t.dish, cust: t.cust }, ev);
        continue;
      }
    }
    // nothing to do: back to their place after a moment
    const home = homeOf(G, s);
    if (s.at !== home && G.t - s.t0 > IDLE_HOME) startJob(G, s, 'home', [{ go: home }], {}, ev);
  }
}

// ---------------------------------------------------------------- what's holding the restaurant back (the hint and the bots)
// 'food' (tables wait for their food: the kitchen), 'plates' (plates wait on the pass: waiters), 'seats' (people wait
// for a table or walk past), 'pay' (people wait to pay), 'quiet' (empty tables: bring people in), 'ok'
export function diagnose(G) {
  const c = Object.entries(G.ema).map(([k, v]) => [k, k === 'quiet' ? v * 0.8 : v]).filter((x) => x[1] > 0.45);
  c.sort((a, b) => b[1] - a[1]);
  return { kind: c.length ? c[0][0] : 'ok' };
}

// ---------------------------------------------------------------- the mailbox: letters (some with a gift) and what was earned while away
export const LETTERS = [
  { key: 'health', when: (G) => officeLv(G) >= 1, cash: 40, from: 'Old Town Health Office', title: 'Inspection passed',
    text: 'Our inspector visited Ferdi\'s on Tuesday. The kitchen was clean, the burgers were hot, and he had two. Keep it up.' },
  { key: 'regular', when: (G) => G.stats.served >= 150, cash: 150, from: 'Mrs. Okafor, the table by the window', title: 'Thank you',
    text: 'I ate at Ferdi\'s every Sunday for forty years. When it closed I cried. Now it is open again. Here is something for the jar.' },
  { key: 'victor1', when: (G) => lvOf(G, 'terrace') >= 1, cash: 0, from: 'Victor Gristle, Gristle Burger', title: 'Cute',
    text: 'Tables outside, in the sun. How quaint. Gristle Burger serves a thousand people an hour, three streets from you. My offer stands. For now.' },
  { key: 'bruno', when: (G) => menu(G).length >= 4, cash: 1500, from: 'Bruno, Bruno\'s Fresh Produce', title: 'An old friend of Ferdi',
    text: 'Ferdi bought my tomatoes for thirty years and never paid on time once. I liked him anyway. The first crate for the new owner is on the house.' },
  { key: 'gazette', when: (G) => officeLv(G) >= 3, cash: 4000, from: 'The Old Town Gazette', title: 'Ferdi\'s is back',
    text: 'Four stars. "The smash burger alone is worth the walk. The rest of the menu is catching up fast." Readers sent a little something.' },
  { key: 'ferdi', when: (G) => officeLv(G) >= 4, cash: 20000, from: 'Uncle Ferdi (found in a drawer of his desk)', title: 'If you are reading this',
    text: 'If you are reading this, you kept the place open. I knew it. Under the floor of my office there is a tin. It was for a rainy day. Make it sunny.' },
  { key: 'victor2', when: (G) => officeLv(G) >= 5, cash: 0, from: 'Victor Gristle, Gristle Burger', title: 'This isn\'t over',
    text: 'Fine. Your little place is busy. So was every place I bought. I am patient, and I have a lot of money. See you around.' },
];
export const LETTER = Object.fromEntries(LETTERS.map((l) => [l.key, l]));
function post(G) {
  for (const l of LETTERS) if (!G.sent[l.key] && l.when(G)) { G.sent[l.key] = 1; G.mail.push({ id: G.seq++, kind: 'letter', key: l.key, cash: l.cash, read: false }); }
}
export const unread = (G) => G.mail.filter((m) => !m.read).length;
// opening a letter (or the money earned while away) → it, its gift added to the cash; read mail goes after a while
export function openMail(G, id) {
  const m = G.mail.find((x) => x.id === id);
  if (!m || m.read) return null;
  m.read = true;
  G.cash += m.cash || 0;
  if (m.kind === 'letter') G.stats.letters++;
  const keep = new Set(G.mail.filter((x) => x.read).slice(-8)); // (the last few read stay, to read again)
  G.mail = G.mail.filter((x) => !x.read || keep.has(x));
  return m;
}

// ---------------------------------------------------------------- while the game is closed
// The restaurant runs on: the time away is played through (up to AWAY.max), renovations finish too. What it earned in a
// longer absence (AWAY.card and up) waits in the mailbox.
export const AWAY = { max: 2 * 3600, card: 60 };
export function away(G, secs) {
  const ran = Math.max(0, Math.min(AWAY.max, secs || 0));
  const s0 = { ...G.stats };
  const built = [];
  for (let left = ran; left > 1e-6;) {
    const d = Math.min(30, left); left -= d;
    for (const e of tick(G, d, d)) if (e.kind === 'built') built.push(e);
  }
  const d = (k) => G.stats[k] - s0[k];
  const r = { secs, ran, capped: secs > AWAY.max + 1, earned: d('earned'), served: d('served'), lost: d('lost'), built, mail: null };
  if (secs >= AWAY.card && r.earned > 0) {
    G.cash -= r.earned;
    const m = { id: G.seq++, kind: 'away', cash: r.earned, secs, served: r.served, lost: r.lost, read: false };
    G.mail.push(m); r.mail = m.id;
  }
  return r;
}

export const short = (n) => {
  const a = Math.abs(n);
  if (a < 1000) return (Math.round(n * 10) / 10).toString().replace(/\.0$/, '');
  const u = ['K', 'M', 'B', 'T']; let i = -1, x = a;
  while (x >= 1000 && i < u.length - 1) { x /= 1000; i++; }
  const t = x >= 100 ? String(Math.round(x)) : String(parseFloat(x.toFixed(x >= 10 ? 1 : 2)));
  return (n < 0 ? '-' : '') + t + u[i];
};
export const money = (n) => '$' + (Math.abs(n) < 100 ? (Math.round(n * 10) / 10).toString() : short(Math.round(n)));

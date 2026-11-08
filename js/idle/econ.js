// Idle + manager mode ("Saffron Bay Delivery Co."): the economy. Pure rules and numbers: no three.js, no DOM, so
// tools/idlesim.mjs can play it headless. The page (idle.html → js/idle/main.js) draws it.
//
// The loop: restaurants cook batches of orders (a cycle each), the district's couriers carry them. A batch pays
// orders × value, but only the share the couriers can carry: kitchens faster than the fleet means food going cold.
// Without a manager a restaurant cooks one batch per tap; a district manager keeps every kitchen there cooking,
// online and off (offline up to the office's hours). Deals multiply, a franchise resets the city for Stars.
import { DISTRICTS, DISTRICT, RESTAURANTS, VEHICLES, FIRST_NAMES, CHAR_IDS } from '../data.js';

export const KEY = 'fds_idle_v1'; // (its own save: the courier game's fds_save_v1 is never read or written here)

// ---------------------------------------------------------------- restaurants (data.js order: by district)
// t cycle seconds · g level-cost growth · c partner cost (and level 0 → 1 price base) · v value of one order at level 1
const T = [1, 1.6, 2.5, 4, 3, 4.5, 6, 8, 6, 9, 12, 10, 14, 20];
const GR = [1.08, 1.1, 1.11, 1.12, 1.11, 1.12, 1.13, 1.14, 1.12, 1.13, 1.14, 1.13, 1.14, 1.15];
export const IREST = RESTAURANTS.map((r, k) => {
  const c = k === 0 ? 0 : Math.round(6 * Math.pow(7, k));
  const base = k === 0 ? 4 : c; // (the first one comes free; its levels are priced as if it cost 4)
  const yieldPerSec = 0.25 * Math.pow(0.5, k); // $/s per $ spent at level 1: later kitchens pay back slower
  // bigger kitchens send bigger batches (orders per level): the couriers' load grows with every partner
  const j = RESTAURANTS.slice(0, k).filter((x) => x.district === r.district).length;
  const o = Math.pow(3, j);
  return { ...r, k, t: T[k], g: GR[k], c, base, o, v: base * yieldPerSec * T[k] / o };
});
export const IREST_BY = Object.fromEntries(IREST.map((r) => [r.id, r]));
export const restOf = (d) => IREST.filter((r) => r.district === d);

// a restaurant's level milestones: each doubles the orders in its batches (a bigger kitchen)
export const LEVEL_MS = [10, 25, 50, 100, 200, 300, 400, 500, 750, 1000];
export const msCount = (L, list = LEVEL_MS) => { let n = 0; for (const m of list) if (L >= m) n++; return n; };
export const nextMs = (L, list = LEVEL_MS) => list.find((m) => m > L) ?? null;

// ---------------------------------------------------------------- districts: license, couriers, vehicles, manager
const first = (d) => IREST.find((r) => r.district === d);
export const IDIST = Object.fromEntries(DISTRICTS.map((d, i) => {
  const f = first(d.id);
  return [d.id, {
    ...d, i,
    unlock: i === 0 ? 0 : Math.round(f.c * 4), // the license (comes with its first courier); the kitchens are partnered on top
    hire: Math.round(Math.max(10, f.base * 2)), // first courier's price; each next one × HIRE_G
    mgr: Math.round(Math.max(60, f.base * 40)), // the district manager: automation + the Surge button
  }];
}));
export const HIRE_G = 1.14;
export const Q = 1; // orders a second one courier carries on the first vehicle
export const TEAM_MS = LEVEL_MS; // courier headcount milestones: each doubles the fleet's reach (new routes), like a kitchen's
// the district's vehicle tier (data.js vehicles, in order): × carrying capacity, price × the district's first courier
export const VEH_MULT = [1, 1.6, 2.5, 4, 6.5, 10];
export const VEH_COST = [0, 60, 900, 14000, 2.5e5, 5e6];
export const VEH_LIST = VEHICLES.map((v) => v.id); // rustbucket … viper

// the manager's Surge: × value in their district for SURGE.sec, then a cooldown
export const SURGE = { mult: 3, sec: 30, cd: 300 };
// lunch and dinner rush on the city clock (1 game hour a real minute): orders are worth more
export const RUSH = [{ from: 11.5 * 60, to: 14 * 60, m: 1.5, name: 'Lunch rush' }, { from: 18.5 * 60, to: 21 * 60, m: 1.5, name: 'Dinner rush' }];
export const GAME_MIN_PER_SEC = 1;
export const rushAt = (clock) => RUSH.find((r) => clock >= r.from && clock < r.to) || null;

// ---------------------------------------------------------------- the office: how long the managers work while you're away
export const OFFICE = [{ h: 1, cost: 0 }, { h: 2, cost: 2000 }, { h: 4, cost: 1e5 }, { h: 8, cost: 1e7 }, { h: 12, cost: 1e9 }, { h: 24, cost: 1e11 }];

// ---------------------------------------------------------------- deals: one-off multipliers, cheapest first
const REST_DEALS = [['Loyalty app', 3, 900], ['Secret sauce', 3, 1e6], ['Billboard on the avenue', 3, 1e10], ['TV spot', 5, 1e14]];
const CITY_DEALS = [['Delivery app', 2, 3e4], ['Food festival stand', 2, 3e6], ['Front page of the Bay Times', 3, 3e9], ['Late-night menu', 3, 3e12], ['City-wide sponsorship', 5, 3e15], ['Saffron Bay Food Week', 5, 3e18], ['Airport kiosks', 10, 3e21]];
const FLEET_DEALS = [['Thermal boxes', 2, 300], ['Bike lanes', 2, 3e5], ['Route planner', 2, 3e8], ['Rain gear', 2, 3e11]];
export const DEALS = (() => {
  const out = [];
  for (const r of IREST) REST_DEALS.forEach(([name, m, k], j) => out.push({ id: `r-${r.id}-${j}`, kind: 'rest', target: r.id, name: `${r.name}: ${name}`, m, cost: Math.round(r.base * k) }));
  CITY_DEALS.forEach(([name, m, cost], j) => out.push({ id: `c-${j}`, kind: 'all', name, m, cost }));
  for (const d of DISTRICTS) FLEET_DEALS.forEach(([name, m, k], j) => out.push({ id: `f-${d.id}-${j}`, kind: 'fleet', target: d.id, name: `${d.name} couriers: ${name}`, m, cost: Math.round(IDIST[d.id].hire * k) }));
  return out.sort((a, b) => a.cost - b.cost);
})();
export const DEAL = Object.fromEntries(DEALS.map((d) => [d.id, d]));

// ---------------------------------------------------------------- stars (the franchise)
// Selling the company to a franchise group resets the city; every Star is +STAR_BONUS income for good.
export const STAR_BONUS = 0.1;
export const STAR_UNIT = 1e10; // lifetime earnings for the first star; stars grow with the square root
export const starsFor = (earned) => Math.floor(Math.sqrt(Math.max(0, earned) / STAR_UNIT));

// ---------------------------------------------------------------- the save
export const fresh = (keep = {}) => ({
  v: 1,
  created: Date.now(),
  cash: 0,
  rest: { [IREST[0].id]: 1 }, // id → level (absent = not a partner yet)
  prog: {}, // id → cycle progress 0..1
  run: {}, // id → true while a tapped batch cooks (no manager)
  dist: { oldtown: { n: 1, veh: 0, mgr: null } }, // unlocked districts: couriers, vehicle tier, manager { name, char, surgeUntil, cdUntil }
  deals: {},
  office: 0,
  clock: 9 * 60, day: 1,
  earned: 0, // this run (since the last franchise)
  earnedAll: 0, // every run
  stars: 0, franchises: 0,
  quest: 0, questDone: false, taps: 0, best: 0,
  last: Date.now(),
  settings: { music: 0.5, sfx: 1, quality: 'auto' },
  seen: {},
  ...keep,
});

// ---------------------------------------------------------------- derived numbers
export const level = (G, id) => G.rest[id] || 0;
export const hasMgr = (G, d) => !!G.dist[d]?.mgr;
export const starMult = (G) => 1 + G.stars * STAR_BONUS;
function dealMult(G, kind, target) {
  let m = 1;
  for (const id in G.deals) { const x = DEAL[id]; if (x && x.kind === kind && (x.target ?? null) === (target ?? null)) m *= x.m; }
  return m;
}
export const allMult = (G) => dealMult(G, 'all') * starMult(G);
export const restMult = (G, id) => dealMult(G, 'rest', id);
// orders in one batch: the level, doubled at every milestone (so a milestone also doubles what the couriers must carry)
export const batchOrders = (G, id) => { const L = level(G, id); return L * IREST_BY[id].o * Math.pow(2, msCount(L)); };

// couriers' carrying capacity (orders / s)
export function capacity(G, d) {
  const s = G.dist[d]; if (!s) return 0;
  return s.n * Q * VEH_MULT[s.veh] * Math.pow(2, msCount(s.n, TEAM_MS)) * dealMult(G, 'fleet', d);
}
// orders / s the district's kitchens put out: the ones cooking now (a manager keeps them all going)
export const cooking = (G, id) => level(G, id) > 0 && (hasMgr(G, IREST_BY[id].district) || !!G.run[id]);
export function demand(G, d, all = false) {
  let n = 0;
  for (const r of restOf(d)) if (all ? level(G, r.id) > 0 : cooking(G, r.id)) n += batchOrders(G, r.id) / r.t;
  return n;
}
// the share of the orders that reach a door (the rest go cold)
export function ratio(G, d, all = false) { const dm = demand(G, d, all); return dm <= 0 ? 1 : Math.min(1, capacity(G, d) / dm); }

// temporary multipliers (online only): the city clock's rush, the manager's surge, rain (the page sets G.rain)
export function liveMult(G, d, now = Date.now()) {
  let m = rushAt(G.clock)?.m || 1;
  if (G.dist[d]?.mgr?.surgeUntil > now) m *= SURGE.mult;
  if (G.rain) m *= 1.25;
  return m;
}
// what one batch pays before the couriers' share and the live multipliers
export const batchValue = (G, id) => batchOrders(G, id) * IREST_BY[id].v * restMult(G, id) * allMult(G);
export function batchPay(G, id, now = Date.now(), all = false) {
  const d = IREST_BY[id].district;
  return batchValue(G, id) * ratio(G, d, all) * liveMult(G, d, now);
}
// $/s: everything cooking now (live), or what the managers alone make (offline: no live multipliers)
export function incomePerSec(G, { offline = false, now = Date.now(), d: only } = {}) {
  let s = 0;
  for (const r of IREST) {
    if (only && r.district !== only) continue;
    if (!level(G, r.id)) continue;
    if (offline) { if (hasMgr(G, r.district)) s += batchValue(G, r.id) * ratio(G, r.district, true) / r.t; }
    else if (cooking(G, r.id)) s += batchPay(G, r.id, now) / r.t;
  }
  return s;
}
// what every kitchen would make if it were cooking (the City list's potential for a district without a manager)
export const potentialPerSec = (G, d) => restOf(d).reduce((a, r) => a + (level(G, r.id) ? batchValue(G, r.id) * ratio(G, d, true) / r.t : 0), 0);

// ---------------------------------------------------------------- prices
const geo = (base, g, from, n) => (n <= 0 ? 0 : base * Math.pow(g, from) * (Math.pow(g, n) - 1) / (g - 1));
const maxN = (cash, base, g, from) => { const a = cash * (g - 1) / (base * Math.pow(g, from)) + 1; return a <= 1 ? 0 : Math.floor(Math.log(a) / Math.log(g) + 1e-9); };
// how many levels / couriers a "buy" means: 1, 10, 100, or 'max' (as many as the cash buys, at least 1)
export function levelBuy(G, id, amt) {
  const r = IREST_BY[id], L = level(G, id);
  const n = amt === 'max' ? Math.max(1, maxN(G.cash, r.base, r.g, L)) : amt;
  return { n, cost: geo(r.base, r.g, L, n) };
}
export function hireBuy(G, d, amt) {
  const D = IDIST[d], N = G.dist[d]?.n || 0;
  const n = amt === 'max' ? Math.max(1, maxN(G.cash, D.hire, HIRE_G, N - 1)) : amt;
  return { n, cost: geo(D.hire, HIRE_G, N - 1, n) }; // (the first courier was the license's)
}
export const vehCost = (d, tier) => IDIST[d].hire * VEH_COST[tier];

// ---------------------------------------------------------------- actions (each returns true when it happened)
function pay(G, cost) { if (!(cost >= 0) || G.cash + 1e-9 < cost) return false; G.cash = Math.max(0, G.cash - cost); return true; }
export function partner(G, id) {
  const r = IREST_BY[id];
  if (level(G, id) || !G.dist[r.district] || !pay(G, r.c)) return false;
  G.rest[id] = 1; G.prog[id] = 0; return true;
}
export function levelUp(G, id, amt = 1) {
  if (!level(G, id)) return false;
  const { n, cost } = levelBuy(G, id, amt);
  if (!pay(G, cost)) return false;
  G.rest[id] += n; return n;
}
export function hire(G, d, amt = 1) {
  if (!G.dist[d]) return false;
  const { n, cost } = hireBuy(G, d, amt);
  if (!pay(G, cost)) return false;
  G.dist[d].n += n; return n;
}
export function upgradeVehicle(G, d) {
  const s = G.dist[d]; if (!s || s.veh >= VEH_MULT.length - 1) return false;
  if (!pay(G, vehCost(d, s.veh + 1))) return false;
  s.veh++; return true;
}
export function unlock(G, d) {
  if (G.dist[d] || !pay(G, IDIST[d].unlock)) return false;
  G.dist[d] = { n: 1, veh: 0, mgr: null }; return true;
}
export function hireManager(G, d, rng = Math.random) {
  const s = G.dist[d]; if (!s || s.mgr || !pay(G, IDIST[d].mgr)) return false;
  s.mgr = { name: FIRST_NAMES[Math.floor(rng() * FIRST_NAMES.length)], char: CHAR_IDS[Math.floor(rng() * CHAR_IDS.length)], surgeUntil: 0, cdUntil: 0 };
  for (const r of restOf(d)) delete G.run[r.id]; // (they all cook now)
  return true;
}
export function surge(G, d, now = Date.now()) {
  const m = G.dist[d]?.mgr; if (!m || m.cdUntil > now) return false;
  m.surgeUntil = now + SURGE.sec * 1000; m.cdUntil = now + (SURGE.sec + SURGE.cd) * 1000; return true;
}
export function buyDeal(G, id) {
  const x = DEAL[id]; if (!x || G.deals[id] || !dealOpen(G, x) || !pay(G, x.cost)) return false;
  G.deals[id] = 1; return true;
}
// a deal shows once what it boosts is there
export const dealOpen = (G, x) => x.kind === 'all' || (x.kind === 'rest' ? level(G, x.target) > 0 : !!G.dist[x.target]);
export function upgradeOffice(G) {
  const nx = OFFICE[G.office + 1]; if (!nx || !pay(G, nx.cost)) return false;
  G.office++; return true;
}
// a tap on a restaurant without a manager: cook one batch
export function cook(G, id) {
  if (!level(G, id) || G.run[id] || hasMgr(G, IREST_BY[id].district)) return false;
  G.run[id] = true; G.taps++; return true;
}
export const pendingStars = (G) => Math.max(0, starsFor(G.earnedAll) - G.stars);
export function franchise(G) {
  const add = pendingStars(G); if (add < 1) return false;
  const keep = { stars: G.stars + add, franchises: G.franchises + 1, earnedAll: G.earnedAll, created: G.created, settings: G.settings, seen: G.seen,
    quest: G.quest, questDone: G.questDone, taps: G.taps, best: G.best, day: G.day, clock: G.clock };
  for (const k of Object.keys(G)) delete G[k];
  Object.assign(G, fresh(keep));
  return add;
}

// ---------------------------------------------------------------- time
export function earn(G, n) { G.cash += n; G.earned += n; G.earnedAll += n; } // (also the map's big-order bubbles)
// advance dt seconds: cycles fill, finished batches pay. Returns [{ id, n, pay }] for the page's popups.
export function tick(G, dt, now = Date.now()) {
  const out = [];
  G.clock += dt * GAME_MIN_PER_SEC;
  if (G.clock >= 24 * 60) { G.clock -= 24 * 60; G.day++; }
  for (const r of IREST) {
    if (!cooking(G, r.id)) continue;
    const auto = hasMgr(G, r.district);
    let p = (G.prog[r.id] || 0) + dt / r.t, n = 0;
    if (p >= 1) {
      n = auto ? Math.floor(p) : 1;
      p = auto ? p - n : 0;
      const got = batchPay(G, r.id, now) * n;
      earn(G, got);
      out.push({ id: r.id, n, pay: got });
      if (!auto) delete G.run[r.id];
    }
    G.prog[r.id] = p;
  }
  G.best = Math.max(G.best, incomePerSec(G, { now }));
  return out;
}
// back after a while: the managers' districts earned at their offline rate, up to the office's hours
export function offline(G, now = Date.now()) {
  const away = Math.max(0, (now - (G.last || now)) / 1000);
  G.last = now;
  if (away < 60) return null;
  const cap = OFFICE[G.office].h * 3600, sec = Math.min(away, cap);
  const gain = incomePerSec(G, { offline: true }) * sec;
  return { away, sec, gain, capped: away > cap };
}
export function collectOffline(G, info, mult = 1) { if (info?.gain > 0) earn(G, info.gain * mult); }

// ---------------------------------------------------------------- goals: a guided start, then an endless list
const GUIDE = [
  { id: 'tap', text: 'Tap Sunny Burger to cook a batch', done: (G) => G.taps >= 1 || hasMgr(G, 'oldtown'), reward: 5 },
  { id: 'lvl5', text: 'Upgrade Sunny Burger to level 5', done: (G) => level(G, 'sunny') >= 5, reward: 15 },
  { id: 'sultan', text: 'Partner with Sultan Döner', done: (G) => level(G, 'sultan') > 0, reward: 30 },
  { id: 'hire', text: 'Hire a second Old Town courier', done: (G) => (G.dist.oldtown?.n || 0) >= 2, reward: 40 },
  { id: 'lvl10', text: 'Get Sunny Burger to level 10 (orders ×2)', done: (G) => level(G, 'sunny') >= 10, reward: 60 },
  { id: 'mgr', text: 'Hire an Old Town manager', done: (G) => hasMgr(G, 'oldtown'), reward: 150 },
  { id: 'bean', text: 'Partner with Bean There', done: (G) => level(G, 'bean') > 0, reward: 300 },
  { id: 'deal', text: 'Buy your first deal', done: (G) => Object.keys(G.deals).length >= 1, reward: 400 },
  { id: 'veh', text: 'Put Old Town couriers on Zippy 50s', done: (G) => (G.dist.oldtown?.veh || 0) >= 1, reward: 600 },
  { id: 'mamma', text: 'Partner with Mamma Pizza', done: (G) => level(G, 'mamma') > 0, reward: 1500 },
  { id: 'down', text: 'Get the Downtown license', done: (G) => !!G.dist.downtown, reward: 4000 },
];
export function goal(G) {
  if (G.quest < GUIDE.length) return { ...GUIDE[G.quest], cash: GUIDE[G.quest].reward };
  // then: the next milestone somewhere, worth about a minute of income
  const k = G.quest - GUIDE.length;
  const open = IREST.filter((r) => level(G, r.id) > 0);
  const r = open[k % open.length] || IREST[0];
  const L = level(G, r.id), target = nextMs(L + 1) || L + 100;
  return { id: 'ms-' + k, text: `Get ${r.name} to level ${target}`, done: (H) => level(H, r.id) >= target, cash: null };
}
export function goalReward(G, g) { return g.cash ?? Math.max(50, Math.round(incomePerSec(G) * 60)); }
export function claimGoal(G) {
  const g = goal(G); if (!g.done(G)) return false;
  const n = goalReward(G, g); earn(G, n); G.quest++; return n;
}

// ---------------------------------------------------------------- numbers
const SUF = ['', 'K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx', 'Sp', 'Oc', 'No', 'Dc'];
export function short(n, dec = 2) {
  if (!isFinite(n)) return '∞';
  const a = Math.abs(n), sg = n < 0 ? '−' : '';
  if (a < 1000) return sg + (a < 10 && a % 1 ? a.toFixed(1) : Math.floor(a).toLocaleString('en-US'));
  let e = Math.floor(Math.log10(a) / 3);
  let name = SUF[e];
  if (!name) { const k = e - SUF.length; name = String.fromCharCode(97 + Math.floor(k / 26) % 26) + String.fromCharCode(97 + k % 26); }
  const v = a / Math.pow(1000, e);
  return sg + (v >= 100 ? v.toFixed(Math.max(0, dec - 2)) : v >= 10 ? v.toFixed(Math.max(0, dec - 1)) : v.toFixed(dec)) + name;
}
export const money = (n) => '$' + short(n);
export { DISTRICTS, DISTRICT };

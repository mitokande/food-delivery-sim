// Save game + derived stats + economy actions. No three.js, no DOM.
import { VEHICLE, VEHICLES, PARTS, PART_MAX, partCost, SKILLS, SKILL_MAX, skillCost, DISTRICT, DISTRICTS, FLEET, fleetRate,
  xpToNext, DAY_START, DAY_END, GOALS, PAINT_COST, CHAR_IDS, FIRST_NAMES, RANKS, PREMIUM, CONTRACTS, CONTRACT_DAYS } from './data.js';

const KEY = 'fds_save_v1';
const listeners = new Set();
export const on = (fn) => (listeners.add(fn), () => listeners.delete(fn));
export const emit = (what, data) => { for (const fn of listeners) fn(what, data); };
// economy actions announce themselves for analytics.js: did('buy', { k: 'vehicle', id, cost })
const did = (ev, d) => emit('act', { ev, ...d });

const fresh = () => ({
  v: 1,
  created: Date.now(),
  cash: 25,
  xp: 0, lvl: 1,
  ratings: [4, 5, 4, 5, 4, 5],
  day: 1, clock: DAY_START,
  vehicles: { rustbucket: { parts: { engine: 0, suspension: 0, box: 0, tires: 0 }, paint: null, box: null, count: 1 } },
  active: 'rustbucket',
  skills: { riding: 0, navigation: 0, charm: 0, reflexes: 0, stamina: 0 },
  districts: { oldtown: true },
  pos: null, // tile index where the player is parked; null = garage
  fleet: { office: false, level: 0, couriers: [], last: Date.now(), bank: 0, applicants: [] },
  stats: { deliveries: 0, earned: 0, fiveStars: 0, meters: 0, overtakes: 0, shortcuts: 0, perfectHops: 0, early: 0, events: 0, bestTip: 0,
    express: 0, vip: 0, rainy: 0, night: 0, maxFlow: 1, contracts: 0 },
  today: { earned: 0, deliveries: 0, fuel: 0, tips: 0, fleet: 0 },
  goals: null,
  look: { char: 'male-a', helmet: '#e8432f' },
  settings: { music: 0.5, sfx: 1, quality: 'auto', haptics: true, autodrive: null }, // autodrive null: by device (phones auto, keyboards ride)
  seen: {}, // one-time tips
  onboard: { step: 0 }, // first-time guide; 99 = finished
  focus: null, // order board: work one district only (id) or all (null)
  emp: {}, // per district: { del, r: last 20 star ratings there, sus: suspended through this day }
  week: null, // weekly contracts
  ach: {}, // achievement id → time unlocked
  unlocked: { paints: [] }, // premium finishes
  name: '',
});

export let S = fresh();

export function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const d = JSON.parse(raw);
      const f = fresh();
      S = { ...f, ...d, fleet: { ...f.fleet, ...d.fleet }, stats: { ...f.stats, ...d.stats }, skills: { ...f.skills, ...d.skills },
        settings: { ...f.settings, ...d.settings }, look: { ...f.look, ...d.look }, today: { ...f.today, ...d.today }, seen: { ...d.seen },
        emp: { ...d.emp }, ach: { ...d.ach }, unlocked: { ...f.unlocked, ...d.unlocked },
        onboard: d.onboard ? { ...d.onboard } : { step: 99 } }; // saves from before onboarding existed skip it
      return true;
    }
  } catch (e) { console.warn('save load failed', e); }
  return false;
}
let saveT = 0;
export function save(now = false) {
  clearTimeout(saveT);
  const w = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* private mode */ } };
  if (now) w(); else saveT = setTimeout(w, 400);
}
// erase everything on this device and start a brand-new career (the caller reloads the page)
export function wipe() { clearTimeout(saveT); try { localStorage.removeItem(KEY); } catch {} S = fresh(); emit('reset'); }

// ---------- derived ----------
export const rating = () => S.ratings.reduce((a, b) => a + b, 0) / S.ratings.length;
export const xpNeed = () => xpToNext(S.lvl);
export const owned = (id) => (S.vehicles[id]?.count || 0);
export const skill = (id) => S.skills[id] || 0;

export function vehStats(id = S.active) {
  const v = VEHICLE[id], o = S.vehicles[id] || { parts: {} }, p = o.parts || {};
  const eng = p.engine || 0, sus = p.suspension || 0, box = p.box || 0, tir = p.tires || 0;
  return {
    id, v,
    top: v.speed / 3.6 * (1 + 0.06 * eng), // m/s
    accel: 1.6 + 3.2 * v.accel * (1 + 0.05 * eng),
    bump: v.bump * (1 - 0.12 * sus),
    heat: 1 - 0.13 * box, // multiplier on temperature loss
    cap: v.cap + (box >= 5 ? 1 : 0),
    corner: 1 + 0.06 * tir,
    land: 1 - 0.1 * tir - 0.05 * sus,
    fuel: v.fuel,
    breakdown: v.breakdown * (1 - 0.15 * eng),
    boost: v.boost,
    paint: o.paint || v.paint,
    boxColor: o.box || v.box,
  };
}
export function skillFx() {
  const k = S.skills;
  return {
    boostDur: 1 + 0.15 * k.riding, regen: 1 + 0.12 * k.riding,
    shortcuts: k.navigation >= 1, eta: 1 + 0.04 * k.navigation,
    tips: 1 + 0.12 * k.charm, forgive: 0.08 * k.charm,
    react: 1 + 0.12 * k.reflexes,
    energy: 1 + 0.2 * k.stamina,
  };
}

export function districtStatus(id) {
  const d = DISTRICT[id];
  if (S.districts[id]) return { open: true };
  const miss = [];
  if (S.lvl < (d.req.lvl || 1)) miss.push(`Level ${d.req.lvl}`);
  if (d.req.rating && rating() < d.req.rating) miss.push(`★ ${d.req.rating.toFixed(1)}`);
  if (d.req.tier && !Object.keys(S.vehicles).some((v) => VEHICLE[v].tier >= d.req.tier && owned(v))) miss.push('a real scooter');
  if (d.req.speed && !Object.keys(S.vehicles).some((v) => VEHICLE[v].speed >= d.req.speed && owned(v))) miss.push(`${d.req.speed}+ km/h vehicle`);
  return { open: false, miss, canApply: miss.length === 0, fee: d.fee };
}

// ---------- actions ----------
export function spend(n) {
  if (S.cash < n) { emit('broke', n); return false; }
  S.cash -= n; emit('cash'); save(); return true;
}
export function earn(n, why) { S.cash += n; S.stats.earned += Math.max(0, n); emit('cash', { n, why }); save(); }

// what one delivery is worth to this courier right now (best district they work in, a little more as they level)
export function typicalPay() {
  const bp = Math.max(1, ...Object.keys(S.districts).filter((d) => S.districts[d]).map((d) => DISTRICT[d].pay));
  return 12 * bp * (1 + 0.04 * S.lvl);
}
export const levelReward = () => Math.round(typicalPay() * 4 / 5) * 5; // cash bonus on reaching a level

export function addXP(n) {
  S.xp += n;
  let ups = 0;
  while (S.xp >= xpNeed()) { S.xp -= xpNeed(); S.lvl++; ups++; const rw = levelReward(); S.cash += rw; S.stats.earned += rw; emit('levelup', S.lvl); }
  emit('xp'); save();
  return ups;
}
export function addRating(stars) { S.ratings.push(stars); while (S.ratings.length > 30) S.ratings.shift(); emit('rating'); }

export function buyVehicle(id) {
  const v = VEHICLE[id];
  if (!spend(v.price)) return false;
  if (!S.vehicles[id]) S.vehicles[id] = { parts: { engine: 0, suspension: 0, box: 0, tires: 0 }, paint: null, box: null, count: 0 };
  S.vehicles[id].count++;
  did('buy', { k: 'vehicle', id, cost: v.price });
  emit('vehicles'); save(); return true;
}
export function setActive(id) { if (owned(id) - assignedCount(id) > 0 || S.active === id) { if (S.active !== id) did('equip', { id }); S.active = id; emit('vehicles'); save(); return true; } return false; }
export function upgradePart(id, part) {
  const o = S.vehicles[id], lvl = o.parts[part] || 0;
  if (lvl >= PART_MAX) return false;
  const cost = partCost(VEHICLE[id], part, lvl);
  if (!spend(cost)) return false;
  o.parts[part] = lvl + 1; did('buy', { k: 'part', id, part, to: lvl + 1, cost }); emit('vehicles'); save(); return true;
}
export function paintVehicle(id, which, color) {
  if (!spend(PAINT_COST)) return false;
  S.vehicles[id][which] = color; did('buy', { k: 'paint', id, which, color, cost: PAINT_COST }); emit('vehicles'); save(); return true;
}
export function skillReq(id) { return Math.max(1, skill(id) * 2); } // courier level needed for the next level
export function upgradeSkill(id) {
  const lvl = skill(id);
  if (lvl >= SKILL_MAX || S.lvl < skillReq(id)) return false;
  if (!spend(skillCost(lvl))) return false;
  S.skills[id] = lvl + 1; did('buy', { k: 'skill', id, to: lvl + 1, cost: skillCost(lvl) }); emit('skills'); save(); return true;
}
export function applyDistrict(id) {
  const st = districtStatus(id);
  if (st.open || !st.canApply) return false;
  if (!spend(st.fee)) return false;
  S.districts[id] = true; did('buy', { k: 'district', id, cost: st.fee }); emit('districts', id); save(); return true;
}

// ---------- day / clock ----------
export function advanceClock(min) {
  S.clock += min;
  emit('clock');
  if (S.clock >= DAY_END) return true; // day over — caller shows the report
  return false;
}
export function rushMult(clock = S.clock) {
  if (clock >= 11.5 * 60 && clock < 13.5 * 60) return { m: 1.3, name: 'Lunch rush' };
  if (clock >= 18.5 * 60 && clock < 21 * 60) return { m: 1.5, name: 'Dinner rush' };
  if (clock >= 22 * 60) return { m: 1.2, name: 'Late night' };
  return { m: 1, name: '' };
}
export function newDay() {
  const report = { day: S.day, ...S.today };
  // couriers are paid at the end of each day: from the fleet bank first, then cash. If you can't pay, someone quits.
  const wages = S.fleet.couriers.reduce((a, c) => a + courierWage(c), 0);
  if (wages > 0) {
    const fromBank = Math.min(S.fleet.bank, wages); S.fleet.bank -= fromBank;
    const rest = wages - fromBank, fromCash = Math.min(Math.max(0, S.cash), rest); S.cash -= fromCash;
    report.wages = fromBank + fromCash;
    if (rest - fromCash > 0.5 && S.fleet.couriers.length) {
      const q = [...S.fleet.couriers].sort((a, b) => a.skill - b.skill)[0];
      fire(q.id); report.quit = q.name;
    }
  }
  S.day++; S.clock = DAY_START;
  S.today = { earned: 0, deliveries: 0, fuel: 0, tips: 0, fleet: 0 };
  S.goals = null; ensureGoals(); ensureWeek();
  emit('clock'); save(true);
  return report;
}

// ---------- daily goals ----------
export function ensureGoals(rng = Math.random) {
  if (S.goals && S.goals.day === S.day) return S.goals;
  const pool = GOALS.filter((g) => !g.needs || skill(g.needs) > 0);
  const list = [];
  while (list.length < 3 && pool.length) {
    const g = pool.splice(Math.floor(rng() * pool.length), 1)[0];
    const n = g.n[Math.min(g.n.length - 1, Math.floor(rng() * g.n.length + (S.lvl > 6 ? 1 : 0)))];
    list.push({ id: g.id, n, p: 0, reward: Math.round(typicalPay() * 2 * g.reward * Math.sqrt(n / g.n[0]) / 5) * 5, claimed: false });
  }
  S.goals = { day: S.day, list };
  save(); return S.goals;
}
export function goalProgress(id, by = 1, ctx = {}) {
  ensureGoals();
  for (const g of S.goals.list) if (g.id === id && g.p < g.n) { g.p = Math.min(g.n, g.p + by); if (g.p >= g.n) emit('goal', g); }
  weekProgress(id, by, ctx);
  save();
}

// ---------- weekly contracts (a set of three bigger goals every CONTRACT_DAYS in-game days) ----------
export function ensureWeek(rng = Math.random) {
  if (S.week && S.day < S.week.from + CONTRACT_DAYS) return S.week;
  const pool = CONTRACTS.filter((c) => !c.minLvl || S.lvl >= c.minLvl);
  const open = DISTRICTS.filter((d) => S.districts[d.id]);
  const list = [];
  while (list.length < 3 && pool.length) {
    const c = pool.splice(Math.floor(rng() * pool.length), 1)[0];
    const k = 1 + 0.03 * S.lvl;
    const n = c.money ? Math.round(typicalPay() * 30 / 50) * 50 : Math.round(c.n * k);
    const d = c.district ? open[Math.floor(rng() * open.length)].id : null;
    list.push({ id: c.id, n, p: 0, d, reward: Math.round(typicalPay() * 8 / 10) * 10, claimed: false });
  }
  // finishing all three wins a premium finish (or a fat cheque once you own them all)
  const paints = PREMIUM.filter((x) => !x.award && !S.unlocked.paints.includes(x.id));
  const bonus = paints.length ? { paint: paints[Math.floor(rng() * paints.length)].id } : { cash: Math.round(typicalPay() * 20 / 10) * 10 };
  S.week = { from: S.day, list, bonus, bonusClaimed: false };
  save(); return S.week;
}
export function weekProgress(id, by = 1, ctx = {}) {
  if (!S.week) return;
  for (const c of S.week.list) {
    if (c.p >= c.n) continue;
    const match = c.id === id && (!c.d || c.d === ctx.d) || (c.id === 'dist' && id === 'deliver' && c.d === ctx.d);
    if (!match) continue;
    c.p = Math.min(c.n, c.p + by);
    if (c.p >= c.n) emit('contract', c);
  }
}
export function claimContract(i) {
  const c = S.week?.list[i];
  if (!c || c.p < c.n || c.claimed) return false;
  c.claimed = true; did('claim', { k: 'contract', id: c.id, reward: c.reward }); earn(c.reward, 'contract'); addXP(60);
  if (S.week.list.every((x) => x.claimed)) S.stats.contracts++;
  return true;
}
export function claimWeekBonus() {
  const w = S.week;
  if (!w || w.bonusClaimed || !w.list.every((x) => x.claimed)) return null;
  w.bonusClaimed = true;
  did('claim', { k: 'week', paint: w.bonus.paint || null, reward: w.bonus.cash || 0 });
  if (w.bonus.paint) { if (!S.unlocked.paints.includes(w.bonus.paint)) S.unlocked.paints.push(w.bonus.paint); }
  else earn(w.bonus.cash, 'contract');
  emit('look'); save(); return w.bonus;
}

// ---------- employers: ranks, perks, probation ----------
export function empData(d) { return (S.emp[d] ||= { del: 0, r: [], sus: 0 }); }
export function empAvg(d) { const e = empData(d); return e.r.length ? e.r.reduce((a, b) => a + b, 0) / e.r.length : 5; }
export function empRank(d) {
  const e = empData(d), avg = empAvg(d);
  let r = RANKS[0];
  for (const k of RANKS) if (e.del >= k.del && (e.r.length < 5 || avg >= k.rating)) r = k;
  return r;
}
export function empState(d) {
  const e = empData(d), req = DISTRICT[d].req.rating || 0, avg = empAvg(d);
  const suspended = e.sus >= S.day;
  const probation = !suspended && req > 0 && e.r.length >= 5 && avg < req;
  const rank = empRank(d);
  return { rank, next: RANKS[RANKS.indexOf(rank) + 1] || null, avg, n: e.r.length, del: e.del, probation, suspended, req };
}
// perks that apply right now (none while on probation or suspended)
export function empPerks(d) { const st = empState(d); return st.probation || st.suspended ? RANKS[0] : st.rank; }
export function empRecord(d, stars) {
  const e = empData(d), before = empState(d);
  e.del++; e.r.push(stars); while (e.r.length > 20) e.r.shift();
  let after = empState(d);
  if (after.req && e.r.length >= 5 && after.avg < after.req - 0.4 && !after.suspended) { e.sus = S.day; after = empState(d); }
  const out = [];
  if (RANKS.indexOf(after.rank) > RANKS.indexOf(before.rank)) out.push({ kind: 'promoted', d, rank: after.rank });
  if (after.suspended && !before.suspended) out.push({ kind: 'suspended', d });
  else if (after.probation && !before.probation) out.push({ kind: 'probation', d, req: after.req });
  else if (before.probation && !after.probation) out.push({ kind: 'cleared', d });
  return out;
}

// ---------- premium finishes ----------
export const hasPaint = (id) => S.unlocked.paints.includes(id);
export function buyPaint(id) {
  const p = PREMIUM.find((x) => x.id === id);
  if (!p || p.award || hasPaint(id)) return false;
  if (!spend(p.price)) return false;
  S.unlocked.paints.push(id); did('buy', { k: 'premium', id, cost: p.price }); emit('look'); save(); return true;
}

// ---------- save code: move a career between devices by copy & paste ----------
export function exportCode() { return 'FDS1.' + btoa(unescape(encodeURIComponent(JSON.stringify(S)))); }
export function importCode(code) {
  const m = /^FDS1\.([A-Za-z0-9+/=]+)$/.exec(String(code).replace(/\s+/g, ''));
  if (!m) return false;
  let d;
  try { d = JSON.parse(decodeURIComponent(escape(atob(m[1])))); } catch { return false; }
  if (!d || typeof d !== 'object' || d.v !== 1 || typeof d.cash !== 'number' || !d.vehicles || !d.districts) return false;
  clearTimeout(saveT);
  try { localStorage.setItem(KEY, JSON.stringify(d)); } catch { return false; }
  return true;
}
export function claimGoal(i) {
  const g = S.goals.list[i];
  if (!g || g.p < g.n || g.claimed) return false;
  g.claimed = true; did('claim', { k: 'goal', id: g.id, reward: g.reward }); earn(g.reward, 'goal'); addXP(30); return true;
}

// ---------- fleet ----------
export const officeLevel = () => FLEET.levels[S.fleet.level];
export const assignedCount = (veh) => S.fleet.couriers.filter((c) => c.veh === veh && !c.own).length;
export const freeVehicles = (veh) => owned(veh) - assignedCount(veh) - (S.active === veh ? 1 : 0);
// one courier's $/min right now: benched couriers earn nothing, catering jobs pay ×2.5 for an hour
export function courierRate(c, now = Date.now()) {
  if (c.benched >= S.day) return 0;
  return fleetRate(c.district, c.veh || 'rustbucket', c.skill, c.cut ?? FLEET.commission) * (c.own ? 0.8 : 1) * (c.boostUntil > now ? 2.5 : 1);
}
export function courierWage(c) {
  return Math.max(5, Math.round(fleetRate(c.district, c.veh || 'rustbucket', c.skill, c.cut ?? FLEET.commission) * (c.own ? 0.8 : 1) * FLEET.wageMin));
}
export function fleetPerMin(mult = 1) {
  const now = Date.now();
  return S.fleet.couriers.reduce((a, c) => a + courierRate(c, now), 0) * mult;
}
export function openOffice() {
  if (S.fleet.office || S.lvl < FLEET.unlockLvl) return false;
  if (!spend(FLEET.officeCost)) return false;
  S.fleet.office = true; S.fleet.last = Date.now(); rollApplicants(); did('buy', { k: 'office', cost: FLEET.officeCost }); emit('fleet'); save(); return true;
}
export function upgradeOffice() {
  const next = FLEET.levels[S.fleet.level + 1];
  if (!next || !spend(next.cost)) return false;
  S.fleet.level++; did('buy', { k: 'office_up', to: S.fleet.level, cost: next.cost }); emit('fleet'); save(); return true;
}
export function rollApplicants(rng = Math.random) {
  const list = [];
  for (let i = 0; i < 3; i++) {
    const skillLv = 1 + Math.floor(rng() * Math.min(5, 1 + S.lvl / 4));
    list.push({
      id: Math.random().toString(36).slice(2, 8),
      name: FIRST_NAMES[Math.floor(rng() * FIRST_NAMES.length)],
      char: CHAR_IDS[Math.floor(rng() * CHAR_IDS.length)],
      skill: skillLv,
      fee: Math.round(FLEET.hireBase * (0.6 + skillLv * 0.55) * (1 + S.fleet.couriers.length * 0.35) / 10) * 10,
      ownVeh: skillLv >= 3 && rng() < 0.5 ? 'zippy' : 'rustbucket',
    });
  }
  S.fleet.applicants = list; S.fleet.rolled = Date.now(); save(); return list;
}
export function hire(appId) {
  const a = S.fleet.applicants.find((x) => x.id === appId);
  if (!a || S.fleet.couriers.length >= officeLevel().slots) return false;
  if (!spend(a.fee)) return false;
  S.fleet.applicants = S.fleet.applicants.filter((x) => x !== a);
  S.fleet.couriers.push({ id: a.id, name: a.name, char: a.char, skill: a.skill, veh: a.ownVeh, own: true, district: 'oldtown', hired: Date.now() });
  did('buy', { k: 'hire', skill: a.skill, cost: a.fee, couriers: S.fleet.couriers.length });
  emit('fleet'); save(); return true;
}
export function fire(id) { did('fleet', { k: 'fire', left: S.fleet.couriers.length - 1 }); S.fleet.couriers = S.fleet.couriers.filter((c) => c.id !== id); emit('fleet'); save(); }
export function assign(id, patch) {
  const c = S.fleet.couriers.find((x) => x.id === id); if (!c) return false;
  if (patch.district && !S.districts[patch.district]) return false;
  if (patch.veh) {
    if (patch.veh !== c.veh && !(c.own && patch.veh === c.ownVeh) && freeVehicles(patch.veh) <= 0) return false;
    c.own = false;
  }
  Object.assign(c, patch); did('fleet', { k: 'assign', ...patch }); emit('fleet'); save(); return true;
}
export function trainCost(c) { return Math.round(200 * Math.pow(2.1, c.skill) / 10) * 10; }
export function train(id) {
  const c = S.fleet.couriers.find((x) => x.id === id); if (!c || c.skill >= 5) return false;
  const cost = trainCost(c);
  if (!spend(cost)) return false;
  c.skill++; did('buy', { k: 'train', to: c.skill, cost }); emit('fleet'); save(); return true;
}
// Accrue fleet income (×FLEET.dispatch while the player is out riding). Returns { offline: $ added since last visit if > 1 min away }.
export function tickFleet(now = Date.now(), offlineCheck = false, mult = 1) {
  const f = S.fleet;
  if (!f.office || !f.couriers.length || !(f.last > 1.6e12)) { f.last = now; return null; }
  let mins = Math.max(0, (now - f.last) / 60000);
  const capMin = officeLevel().cap * 60;
  const away = mins;
  mins = Math.min(mins, capMin);
  const gain = fleetPerMin(mult) * mins;
  f.bank = Math.min(f.bank + gain, fleetPerMin(Math.max(1, mult)) * capMin + 1);
  // now and then the office needs a decision
  f.evT = (f.evT || 0) + mins;
  f.events ||= [];
  if (f.evT > FLEET.eventEvery * (f.evNext ||= 0.6 + Math.random() * 0.8) && f.events.length < 2) { f.evT = 0; f.evNext = 0; const ev = makeFleetEvent(); if (ev) { f.events.push(ev); emit('fleetevent', ev); } }
  f.last = now;
  S.today.fleet += gain;
  emit('fleetbank');
  if (offlineCheck && away > 1) return { gain, away, capped: away > capMin };
  return null;
}
export function collectFleet() {
  const n = Math.floor(S.fleet.bank);
  if (n <= 0) return 0;
  S.fleet.bank -= n; did('claim', { k: 'fleet', reward: n }); earn(n, 'fleet'); return n;
}

// ---------- fleet decisions ----------
function makeFleetEvent(rng = Math.random) {
  const cs = S.fleet.couriers.filter((c) => !(c.benched >= S.day));
  if (!cs.length) return null;
  const c = cs[Math.floor(rng() * cs.length)];
  const kinds = [['crash', 3], ['raise', (c.cut ?? FLEET.commission) <= 0.35 ? 2 : 0], ['catering', cs.length >= 2 ? 2 : 0], ['star', c.skill < 5 ? 2 : 0]];
  let t = 0; for (const [, w] of kinds) t += w; let r = rng() * t, kind = 'crash';
  for (const [k, w] of kinds) { r -= w; if (r <= 0) { kind = k; break; } }
  const id = Math.random().toString(36).slice(2, 8);
  if (kind === 'crash') return { id, kind, cid: c.id, cost: Math.round((40 + VEHICLE[c.veh || 'rustbucket'].price * 0.06) / 5) * 5 };
  if (kind === 'raise') return { id, kind, cid: c.id };
  if (kind === 'star') return { id, kind, cid: c.id, cost: Math.round(trainCost(c) * 0.4 / 10) * 10 };
  const two = [...cs].sort(() => rng() - 0.5).slice(0, 2).map((x) => x.id);
  return { id, kind, cids: two, pay: Math.round(typicalPay() * 2 / 5) * 5 };
}
// choice: 'a' (pay / accept) or 'b' (bench / refuse / decline / skip). Returns a short result line.
export function resolveFleetEvent(id, choice) {
  const f = S.fleet, ev = (f.events || []).find((e) => e.id === id);
  if (!ev) return null;
  const c = f.couriers.find((x) => x.id === ev.cid);
  let msg = '';
  if (ev.kind === 'crash') {
    if (choice === 'a') { if (!spend(ev.cost)) return null; msg = `${c?.name || 'The bike'} is back on the road.`; }
    else { if (c) c.benched = S.day; msg = `${c?.name} sits out until tomorrow.`; }
  } else if (ev.kind === 'raise') {
    if (choice === 'a') { if (c) c.cut = (c.cut ?? FLEET.commission) + 0.05; msg = `${c?.name} is happy. Their cut is now ${Math.round((c?.cut || 0) * 100)}%.`; }
    else { if (c) fire(c.id); msg = `${c?.name} handed in the keys.`; }
  } else if (ev.kind === 'star') {
    if (choice === 'a') { if (!spend(ev.cost)) return null; if (c && c.skill < 5) c.skill++; msg = `${c?.name} levelled up!`; }
    else msg = 'Maybe next time.';
  } else if (ev.kind === 'catering') {
    if (choice === 'a') { const until = Date.now() + 60 * 60000; for (const x of f.couriers) if (ev.cids.includes(x.id)) x.boostUntil = until; earn(ev.pay, 'fleet'); msg = 'Catering run booked: ×2.5 for an hour.'; }
    else msg = 'Declined.';
  }
  f.events = f.events.filter((e) => e !== ev);
  if (choice === 'a' && ev.cost) did('buy', { k: 'fleet_' + ev.kind, cost: ev.cost });
  did('fleet', { k: 'decision', kind: ev.kind, choice });
  emit('fleet'); save(); return msg;
}

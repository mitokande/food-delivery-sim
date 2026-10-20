// Save game + derived stats + economy actions. No three.js, no DOM.
import { VEHICLE, VEHICLES, PARTS, PART_MAX, partCost, SKILLS, SKILL_MAX, skillCost, DISTRICT, DISTRICTS, FLEET, fleetRate,
  xpToNext, DAY_START, DAY_END, GOALS, PAINT_COST, CHAR_IDS, FIRST_NAMES } from './data.js';

const KEY = 'fds_save_v1';
const listeners = new Set();
export const on = (fn) => (listeners.add(fn), () => listeners.delete(fn));
export const emit = (what, data) => { for (const fn of listeners) fn(what, data); };

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
  stats: { deliveries: 0, earned: 0, fiveStars: 0, meters: 0, overtakes: 0, shortcuts: 0, perfectHops: 0, early: 0, events: 0, bestTip: 0 },
  today: { earned: 0, deliveries: 0, fuel: 0, tips: 0, fleet: 0 },
  goals: null,
  look: { char: 'male-a', helmet: '#e8432f' },
  settings: { music: 0.5, sfx: 1, quality: 'auto', haptics: true },
  seen: {}, // one-time tips
  onboard: { step: 0 }, // first-time guide; 99 = finished
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

export function addXP(n) {
  S.xp += n;
  let ups = 0;
  while (S.xp >= xpNeed()) { S.xp -= xpNeed(); S.lvl++; ups++; emit('levelup', S.lvl); }
  emit('xp'); save();
  return ups;
}
export function addRating(stars) { S.ratings.push(stars); while (S.ratings.length > 30) S.ratings.shift(); emit('rating'); }

export function buyVehicle(id) {
  const v = VEHICLE[id];
  if (!spend(v.price)) return false;
  if (!S.vehicles[id]) S.vehicles[id] = { parts: { engine: 0, suspension: 0, box: 0, tires: 0 }, paint: null, box: null, count: 0 };
  S.vehicles[id].count++;
  emit('vehicles'); save(); return true;
}
export function setActive(id) { if (owned(id) - assignedCount(id) > 0 || S.active === id) { S.active = id; emit('vehicles'); save(); return true; } return false; }
export function upgradePart(id, part) {
  const o = S.vehicles[id], lvl = o.parts[part] || 0;
  if (lvl >= PART_MAX) return false;
  if (!spend(partCost(VEHICLE[id], part, lvl))) return false;
  o.parts[part] = lvl + 1; emit('vehicles'); save(); return true;
}
export function paintVehicle(id, which, color) {
  if (!spend(PAINT_COST)) return false;
  S.vehicles[id][which] = color; emit('vehicles'); save(); return true;
}
export function skillReq(id) { return Math.max(1, skill(id) * 2); } // courier level needed for the next level
export function upgradeSkill(id) {
  const lvl = skill(id);
  if (lvl >= SKILL_MAX || S.lvl < skillReq(id)) return false;
  if (!spend(skillCost(lvl))) return false;
  S.skills[id] = lvl + 1; emit('skills'); save(); return true;
}
export function applyDistrict(id) {
  const st = districtStatus(id);
  if (st.open || !st.canApply) return false;
  if (!spend(st.fee)) return false;
  S.districts[id] = true; emit('districts', id); save(); return true;
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
  S.day++; S.clock = DAY_START;
  S.today = { earned: 0, deliveries: 0, fuel: 0, tips: 0, fleet: 0 };
  S.goals = null; ensureGoals();
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
    list.push({ id: g.id, n, p: 0, reward: Math.round((40 + S.lvl * 25) * g.reward * (n / g.n[0]) / 5) * 5, claimed: false });
  }
  S.goals = { day: S.day, list };
  save(); return S.goals;
}
export function goalProgress(id, by = 1) {
  ensureGoals();
  for (const g of S.goals.list) if (g.id === id && g.p < g.n) { g.p = Math.min(g.n, g.p + by); if (g.p >= g.n) emit('goal', g); }
  save();
}
export function claimGoal(i) {
  const g = S.goals.list[i];
  if (!g || g.p < g.n || g.claimed) return false;
  g.claimed = true; earn(g.reward, 'goal'); addXP(30); return true;
}

// ---------- fleet ----------
export const officeLevel = () => FLEET.levels[S.fleet.level];
export const assignedCount = (veh) => S.fleet.couriers.filter((c) => c.veh === veh && !c.own).length;
export const freeVehicles = (veh) => owned(veh) - assignedCount(veh) - (S.active === veh ? 1 : 0);
export function fleetPerMin() {
  return S.fleet.couriers.reduce((a, c) => a + fleetRate(c.district, c.veh || 'rustbucket', c.skill) * (c.own ? 0.8 : 1), 0);
}
export function openOffice() {
  if (S.fleet.office || S.lvl < FLEET.unlockLvl) return false;
  if (!spend(FLEET.officeCost)) return false;
  S.fleet.office = true; S.fleet.last = Date.now(); rollApplicants(); emit('fleet'); save(); return true;
}
export function upgradeOffice() {
  const next = FLEET.levels[S.fleet.level + 1];
  if (!next || !spend(next.cost)) return false;
  S.fleet.level++; emit('fleet'); save(); return true;
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
  emit('fleet'); save(); return true;
}
export function fire(id) { S.fleet.couriers = S.fleet.couriers.filter((c) => c.id !== id); emit('fleet'); save(); }
export function assign(id, patch) {
  const c = S.fleet.couriers.find((x) => x.id === id); if (!c) return false;
  if (patch.district && !S.districts[patch.district]) return false;
  if (patch.veh) {
    if (patch.veh !== c.veh && !(c.own && patch.veh === c.ownVeh) && freeVehicles(patch.veh) <= 0) return false;
    c.own = false;
  }
  Object.assign(c, patch); emit('fleet'); save(); return true;
}
export function trainCost(c) { return Math.round(200 * Math.pow(2.1, c.skill) / 10) * 10; }
export function train(id) {
  const c = S.fleet.couriers.find((x) => x.id === id); if (!c || c.skill >= 5) return false;
  if (!spend(trainCost(c))) return false;
  c.skill++; emit('fleet'); save(); return true;
}
// Accrue fleet income. Returns { offline: $ added since last visit if > 1 min away }.
export function tickFleet(now = Date.now(), offlineCheck = false) {
  const f = S.fleet;
  if (!f.office || !f.couriers.length || !(f.last > 1.6e12)) { f.last = now; return null; }
  let mins = Math.max(0, (now - f.last) / 60000);
  const capMin = officeLevel().cap * 60;
  const away = mins;
  mins = Math.min(mins, capMin);
  const gain = fleetPerMin() * mins;
  f.bank = Math.min(f.bank + gain, fleetPerMin() * capMin + 1);
  f.last = now;
  S.today.fleet += gain;
  emit('fleetbank');
  if (offlineCheck && away > 1) return { gain, away, capped: away > capMin };
  return null;
}
export function collectFleet() {
  const n = Math.floor(S.fleet.bank);
  if (n <= 0) return 0;
  S.fleet.bank -= n; earn(n, 'fleet'); return n;
}

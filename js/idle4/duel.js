// Ferdi's (idle4.html): the cook-offs. Victor's chain has a Gristle Burger on every corner of the city; the crew (the
// managers: sim.js) cooks against each branch in front of a jury, district by district, and a district won gets a
// Ferdi's of its own (a branch: more on every bill). Pure rules, like sim.js: no clock of their own (the tickets take
// `now`, ms, from the caller) and a seeded dice, so a cook-off plays the same twice.
//
// A cook-off: up to DUEL.team of the crew against the branch's cooks, each side sending plates to the jury. A plate
// scores its cook's taste (ours: × the dish it is, and DUEL.weak times that when the branch is weak against it) and
// rattles the cook across the counter (their calm goes down by the plate's score; at 0 they panic and are out for a
// while). A good menu steadies the crew: their calm goes up with the dishes they bring, as their plates do.
// The first side at the stage's goal wins; when the time is up, the side ahead. Everyone has a skill that charges up:
// ours are fired with a tap (or by themselves, on auto), the rival bosses' by themselves.
// What the crew can do comes from the restaurant: a manager's level (chef's hats) and their room's level raise taste
// and calm, a dish scores by the level of its station. A win pays cash, chef's hats and, at a boss, gems.
import * as S from './sim.js';

// lv: the restaurant level the city opens at; dur: s; par: s a cook-off takes when both sides are as strong (sets the
// goal); team, dishes: how many go; weak: × for a dish the branch is weak against; tix: tickets (one a cook-off), regen:
// s for one to come back, refill: gems for a full set; panic: s out, back: the share of calm they come back with;
// jitter: how uneven the plates come; lvK, roomK: taste and calm for each crew level / room level over 1; stK: a
// dish's score for each level of its station; replay: the share of the hats and cash a branch already beaten pays;
// star3: gems for the first three stars at a branch; stars: the rival's share of the goal under which a win is worth
// 3 and 2 stars
export const DUEL = {
  lv: S.MGR_LV, dur: 90, par: 55, team: 3, dishes: 3, weak: 2, tix: 5, regen: 20 * 60, refill: 20, panic: 6, back: 0.6, jitter: 0.12,
  lvK: 0.22, roomK: 0.08, stK: 0.04, replay: { hats: 0.4, cash: 0.5 }, star3: 2, stars: [0.5, 0.8],
};
// the crew as cooks: taste (a plate's points), pace (s between plates), calm, and their skill
export const HEROES = {
  kitchen: { taste: 16, pace: 3, calm: 90, skill: 'flambe' },
  dining: { taste: 9, pace: 1.8, calm: 80, skill: 'express' },
  entrance: { taste: 10, pace: 2.8, calm: 150, skill: 'charm' },
  cashier: { taste: 11, pace: 2.6, calm: 110, skill: 'tipjar' },
  terrace: { taste: 13, pace: 2.6, calm: 90, skill: 'showstopper' },
  staff: { taste: 8, pace: 2.8, calm: 130, skill: 'peptalk' },
  bay: { taste: 10, pace: 2, calm: 85, skill: 'rush' },
};
// cd: s to charge. The last three are the rival bosses'.
export const SKILLS = {
  flambe: { name: 'Flambé', cd: 14, n: 3, what: 'Three plates at once' },
  express: { name: 'Express service', cd: 16, secs: 5, x: 2, what: 'The whole team cooks twice as fast for 5 s' },
  charm: { name: 'Charm the jury', cd: 18, secs: 4, what: 'The jury ignores the rival\'s plates for 4 s' },
  tipjar: { name: 'Tip jar', cd: 15, n: 4, x: 1.75, what: 'The team\'s next 4 plates score 75% more' },
  showstopper: { name: 'Showstopper', cd: 16, x: 3, shake: 0.25, what: 'One plate worth three, and it rattles every rival' },
  peptalk: { name: 'Pep talk', cd: 18, what: 'Everyone calms down and is back at the stove' },
  rush: { name: 'Rush order', cd: 14, what: 'Everyone sends a plate right now' },
  salt: { name: 'Salt shaker', cd: 15, shake: 0.3, what: 'Rattles your whole team' },
  smoke: { name: 'Smoke', cd: 17, secs: 5, x: 0.5, what: 'Your team cooks half as fast for 5 s' },
  bribe: { name: 'Envelope', cd: 18, secs: 4, what: 'The jury ignores your plates for 4 s' },
};
// Victor's people (faces: assets/ui4/faces)
export const RIVALS = {
  todd: { name: 'Todd', taste: 10, pace: 2.6, calm: 90 },
  pip: { name: 'Pip', taste: 7, pace: 1.8, calm: 80 },
  brick: { name: 'Brick', taste: 12, pace: 3.2, calm: 150 },
  kyle: { name: 'Kyle', taste: 8, pace: 2, calm: 70 },
  sharp: { name: 'Mrs. Sharp', taste: 14, pace: 3, calm: 100 },
  sly: { name: 'Sly', taste: 11, pace: 2.4, calm: 110 },
  dolores: { name: 'Dolores Vane', title: 'District manager', taste: 15, pace: 2.4, calm: 160, skill: 'salt' },
  baron: { name: 'Chef Baron', title: 'Gristle\'s star chef', taste: 18, pace: 2.6, calm: 200, skill: 'smoke' },
  victor: { name: 'Victor Gristle', title: 'The boss', taste: 20, pace: 2.2, calm: 240, skill: 'bribe' },
};
export const DISTRICTS = [
  { id: 'oldtown', name: 'Old Town' },
  { id: 'harbour', name: 'Harbour' },
  { id: 'uptown', name: 'Uptown' },
];
// the branches, in the order they're fought (five a district, the last its boss): cooks, k (× their taste and calm),
// the dish they're weak against, and what a first win pays (hats, pay: minutes of the restaurant's income, gems)
const B = (name, cooks, k, weak, hats, pay, more) => ({ name, cooks, k, weak, hats, pay, ...more });
export const STAGES = [
  B('Market Street', ['todd'], 1.3, 'burger', 3, 2),
  B('Fountain Square', ['pip', 'todd'], 0.9, 'hotdog', 3, 3),
  B('Clock Tower', ['kyle', 'brick'], 1.6, 'doner', 4, 4),
  B('Old Bridge', ['todd', 'sly', 'pip'], 1.4, 'hotdog', 4, 5),
  B('Old Town head office', ['kyle', 'dolores', 'brick'], 1.7, 'pizza', 8, 10, { boss: true, gems: 10 }),
  B('Fish Market', ['sly', 'sharp', 'pip'], 2.0, 'doner', 6, 6),
  B('Pier 7', ['brick', 'todd', 'sharp'], 2.5, 'pizza', 6, 7),
  B('The Lighthouse', ['kyle', 'sly', 'sharp'], 2.7, 'noodle', 7, 8),
  B('Dockside', ['sharp', 'brick', 'sly'], 3.1, 'burger', 8, 10),
  B('Harbour head office', ['sly', 'baron', 'brick'], 2.8, 'fish', 14, 20, { boss: true, gems: 20 }),
  B('Park Avenue', ['sharp', 'sly', 'todd'], 3.8, 'noodle', 10, 12),
  B('Glass Gallery', ['brick', 'sharp', 'kyle'], 4.4, 'pizza', 10, 14),
  B('Opera Square', ['sly', 'sharp', 'brick'], 4.4, 'sushi', 12, 16),
  B('Sky Lounge', ['sharp', 'dolores', 'sly'], 4.0, 'fish', 13, 20),
  B('Gristle Tower', ['baron', 'victor', 'dolores'], 2.7, 'burger', 25, 45, { boss: true, gems: 40 }),
].map((s, i) => ({ ...s, id: i, district: Math.floor(i / 5) }));

// ---------------------------------------------------------------- the crew as cooks
const grow = (G, room) => (1 + DUEL.lvK * (S.crewLv(G, room) - 1)) * (1 + DUEL.roomK * Math.max(0, S.lvOf(G, room) - 1));
export function hero(G, room) {
  const h = HEROES[room], k = grow(G, room);
  return { id: room, name: S.MANAGERS[room].name, taste: h.taste * k, pace: h.pace, calm: h.calm * k, skill: h.skill };
}
export function rival(stage, id) {
  const r = RIVALS[id];
  return { id, name: r.name, taste: r.taste * stage.k, pace: r.pace, calm: r.calm * stage.k, skill: r.skill || null };
}
export const dishK = (G, dish) => 1 + DUEL.stK * S.itemOf(G, 'kitchen', `st:${dish}`);
// the dishes sent: what each scores (weak: the branch is weak against it)
const plates = (G, stage, dishes) => dishes.map((id) => ({ id, weak: id === stage.weak, k: dishK(G, id) * (id === stage.weak ? DUEL.weak : 1) }));
// a side's strength: the points a second it sends with nothing going on (ours: with the dishes it brings)
const rate = (cooks, k = 1) => cooks.reduce((n, c) => n + c.taste / c.pace, 0) * k;
export const rivalStrength = (stage) => rate(stage.cooks.map((id) => rival(stage, id)));
const menuK = (p) => (p.length ? p.reduce((n, d) => n + d.k, 0) / p.length : 1);
export const teamStrength = (G, stage, team, dishes) => (dishes.length ? rate(team.map((room) => hero(G, room)), menuK(plates(G, stage, dishes))) : 0);
// the crew as they'd stand at this branch with these dishes (calm: × what the dishes score)
export function lineup(G, stage, team, dishes) {
  const k = menuK(plates(G, stage, dishes));
  return team.map((room) => { const h = hero(G, room); return { ...h, calm: h.calm * k }; });
}
// who would go, and with what: the strongest of the crew, the dishes that score most here
export const bestTeam = (G) => Object.keys(HEROES).filter((r) => S.hasMgr(G, r)).sort((a, b) => { const x = hero(G, a), y = hero(G, b); return y.taste / y.pace - x.taste / x.pace; }).slice(0, DUEL.team);
export const bestDishes = (G, stage) => plates(G, stage, S.menu(G)).sort((a, b) => b.k - a.k).slice(0, DUEL.dishes).map((d) => d.id);

// ---------------------------------------------------------------- tickets, and which branch is next
// the tickets come back one by one on the real clock (now: ms); G.duel.at: when the one on its way started
export function sync(G, now) {
  const d = G.duel;
  if (d.tix >= DUEL.tix) { d.at = null; return d; }
  if (d.at == null || d.at > now) d.at = now;
  const n = Math.floor((now - d.at) / (DUEL.regen * 1000));
  if (n > 0) { d.tix = Math.min(DUEL.tix, d.tix + n); d.at = d.tix >= DUEL.tix ? null : d.at + n * DUEL.regen * 1000; }
  return d;
}
// s until the next ticket (0: full)
export const nextTix = (G, now) => (sync(G, now).at == null ? 0 : Math.max(0, DUEL.regen - (now - G.duel.at) / 1000));
export function refill(G, now) {
  if (sync(G, now).tix >= DUEL.tix || !S.spendGems(G, DUEL.refill)) return false;
  G.duel.tix = DUEL.tix; G.duel.at = null;
  return true;
}
export const open = (G) => S.restaurantLv(G) >= DUEL.lv;
export const starsOf = (G, id) => G.duel.won[id] || 0;
export const stageOpen = (G, id) => id === 0 || starsOf(G, id - 1) > 0;
// the branch to fight next (null: the city is yours)
export const nextStage = (G) => STAGES.find((s) => !starsOf(G, s.id)) || null;
export const wonCount = (G) => STAGES.filter((s) => starsOf(G, s.id)).length;
// what a win pays (the first time; after that DUEL.replay of the hats and the cash, and no gems)
export function pays(G, stage) {
  const first = !starsOf(G, stage.id), cash = Math.round(S.perMin(G) * stage.pay);
  return first ? { first, cash, hats: stage.hats, gems: stage.gems || 0 } : { first, cash: Math.round(cash * DUEL.replay.cash), hats: Math.max(1, Math.round(stage.hats * DUEL.replay.hats)), gems: 0 };
}
// why this cook-off can't start → null, or 'lv' | 'locked' | 'team' | 'dishes' | 'tix'
export function block(G, id, team, dishes, now) {
  const stage = STAGES[id];
  if (!open(G)) return 'lv';
  if (!stage || !stageOpen(G, id)) return 'locked';
  if (!team.length || team.length > DUEL.team || new Set(team).size !== team.length || team.some((r) => !HEROES[r] || !S.hasMgr(G, r))) return 'team';
  const m = S.menu(G);
  if (!dishes.length || dishes.length > DUEL.dishes || new Set(dishes).size !== dishes.length || dishes.some((d) => !m.includes(d))) return 'dishes';
  return sync(G, now).tix < 1 ? 'tix' : null;
}

// ---------------------------------------------------------------- a cook-off
function dice(D) {
  let t = (D.seed = (D.seed + 0x6d2b79f5) | 0);
  t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const gap = (D, c) => c.pace * (1 + (dice(D) * 2 - 1) * DUEL.jitter);
const side = (D, cooks, first) => ({
  pts: 0, n: 0, fx: {}, // (plates sent; fx: what's on, by skill: s left, or plates left)
  cooks: cooks.map((c, i) => ({ ...c, max: c.calm, t: c.pace * (first + 0.25 * i) * (0.9 + 0.2 * dice(D)), out: 0, charge: 0, sent: 0 })),
});
// start one (a ticket) → the cook-off, or null. seed: for its dice.
export function start(G, id, team, dishes, now, seed = 1) {
  if (block(G, id, team, dishes, now)) return null;
  const stage = STAGES[id], d = G.duel;
  d.tix--; if (d.at == null) d.at = now;
  d.team = [...team]; d.dishes = [...dishes];
  const D = { stage: id, t: 0, dur: DUEL.dur, seed: seed | 0, over: null, auto: false, dishes: plates(G, stage, dishes) };
  D.us = side(D, lineup(G, stage, team, dishes), 0.5); D.them = side(D, stage.cooks.map((c) => rival(stage, c)), 0.6);
  D.goal = Math.round(rivalStrength(stage) * DUEL.par);
  return D;
}
const up = (c) => c.out <= 0;
// who a plate from cook i rattles: the one across the counter, else the nearest still at the stove
function across(S2, i) {
  const st = S2.cooks.map((c, j) => [c, j]).filter(([c]) => up(c));
  return st.length ? st.sort((a, b) => Math.abs(a[1] - i) - Math.abs(b[1] - i))[0][0] : null;
}
function rattle(D, who, c, by, ev) {
  if (!c || !up(c)) return;
  c.calm -= by;
  if (c.calm <= 0) { c.calm = 0; c.out = DUEL.panic; c.charge = 0; ev.push({ kind: 'panic', who, i: D[who].cooks.indexOf(c) }); }
}
// cook i of a side sends a plate (x: a skill's ×)
function plate(D, who, i, ev, x = 1) {
  if (D.over) return;
  const A = D[who], other = who === 'us' ? 'them' : 'us', Bs = D[other], c = A.cooks[i];
  const dish = who === 'us' ? D.dishes[A.n % D.dishes.length] : null;
  let tip = false;
  if (A.fx.tipjar > 0) { A.fx.tipjar--; tip = true; }
  const ignored = (who === 'us' ? Bs.fx.bribe : Bs.fx.charm) > 0;
  const worth = c.taste * (dish ? dish.k : 1) * x, pts = ignored ? 0 : worth * (tip ? SKILLS.tipjar.x : 1);
  A.n++; c.sent++; A.pts += pts;
  ev.push({ kind: 'plate', who, i, pts, dish: dish?.id || null, weak: !!dish?.weak, big: x > 1 || tip, ignored });
  rattle(D, other, across(Bs, i), worth, ev);
  if (A.pts >= D.goal) end(D, ev);
}
function end(D, ev) {
  if (D.over) return;
  D.over = D.us.pts > D.them.pts ? 'win' : 'lose';
  ev.push({ kind: 'over', won: D.over === 'win' });
}
function fire(D, who, i, ev) {
  const A = D[who], Bs = D[who === 'us' ? 'them' : 'us'], c = A.cooks[i], k = SKILLS[c.skill];
  if (D.over || !k || !up(c) || c.charge < 1) return false;
  c.charge = 0;
  ev.push({ kind: 'skill', who, i, skill: c.skill });
  const shake = (S2, f) => { for (const x of [...S2.cooks]) rattle(D, S2 === D.us ? 'us' : 'them', x, x.max * f, ev); };
  switch (c.skill) {
    case 'flambe': for (let n = 0; n < k.n; n++) plate(D, who, i, ev); break;
    case 'showstopper': plate(D, who, i, ev, k.x); shake(Bs, k.shake); break;
    case 'rush': A.cooks.forEach((x, j) => { if (up(x)) plate(D, who, j, ev); }); break;
    case 'peptalk': for (const x of A.cooks) { if (!up(x)) ev.push({ kind: 'back', who, i: A.cooks.indexOf(x) }); x.out = 0; x.calm = x.max; } break;
    case 'tipjar': A.fx.tipjar = k.n; break;
    case 'salt': shake(Bs, k.shake); break;
    default: A.fx[c.skill] = k.secs; // (express, charm, smoke, bribe: on for a while)
  }
  return true;
}
// a tap on cook i of ours → did it fire
export function skill(D, i) { const ev = []; return fire(D, 'us', i, ev) ? ev : null; }
export const ready = (D, i) => !D.over && up(D.us.cooks[i]) && D.us.cooks[i].charge >= 1;
// dt seconds on → what happened: { kind: 'plate' | 'panic' | 'back' | 'skill' | 'over', who: 'us' | 'them', i, … }
export function tick(D, dt) {
  const ev = [];
  if (D.over) return ev;
  D.t += dt;
  for (const who of ['us', 'them']) {
    const A = D[who], Bs = D[who === 'us' ? 'them' : 'us'];
    const fast = (A.fx.express > 0 ? SKILLS.express.x : 1) * (Bs.fx.smoke > 0 ? SKILLS.smoke.x : 1);
    A.cooks.forEach((c, i) => {
      if (D.over) return;
      if (!up(c)) { c.out -= dt; if (c.out <= 0) { c.out = 0; c.calm = c.max * DUEL.back; c.t = c.pace * 0.5; ev.push({ kind: 'back', who, i }); } return; }
      if (c.skill) { c.charge = Math.min(1, c.charge + dt / SKILLS[c.skill].cd); if (c.charge >= 1 && (who === 'them' || D.auto)) fire(D, who, i, ev); }
      c.t -= dt * fast;
      if (c.t <= 0 && !D.over) { plate(D, who, i, ev); c.t += gap(D, c); }
    });
    for (const k of ['express', 'charm', 'smoke', 'bribe']) if (A.fx[k] > 0) A.fx[k] = Math.max(0, A.fx[k] - dt);
  }
  if (!D.over && D.t >= D.dur) end(D, ev);
  return ev;
}
// a win's stars: by how far the rival got
export const stars = (D) => (D.over !== 'win' ? 0 : 1 + DUEL.stars.filter((f) => D.them.pts < D.goal * f).length);
// walking out: the jury gives it to the rival
export function forfeit(D) { if (!D.over) { D.over = 'lose'; D.left = true; } }
// the end of a cook-off: what it paid → { won, stars, first, cash, hats, gems, branch (the district that got its
// Ferdi's, or null); and how it went: ours, theirs (the scores), team (how many went), weakUsed, left (walked
// out) }. Once: D.paid.
export function claim(G, D) {
  if (!D.over || D.paid) return null;
  D.paid = true;
  const stage = STAGES[D.stage], n = stars(D);
  const how = { ours: Math.round(D.us.pts), theirs: Math.round(D.them.pts), team: D.us.cooks.length, weakUsed: D.dishes.some((d) => d.weak), left: !!D.left };
  if (!n) return { won: false, stars: 0, first: false, cash: 0, hats: 0, gems: 0, branch: null, ...how };
  const p = pays(G, stage), had = starsOf(G, stage.id);
  if (n >= 3 && had < 3) p.gems += DUEL.star3;
  G.duel.won[stage.id] = Math.max(had, n);
  G.cash += p.cash; S.addHats(G, p.hats); S.addGems(G, p.gems); G.stats.duels++;
  let branch = null;
  if (p.first && stage.boss) { G.duel.branches++; branch = DISTRICTS[stage.district]; }
  return { won: true, stars: n, ...p, branch, ...how };
}

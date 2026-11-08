// Plays the idle mode's economy (js/idle/econ.js) headless with a greedy bot, to check the pacing.
//   node tools/idlesim.mjs [hours=3] [tapUptime=0.6]
// The bot taps idle kitchens the way a player would (about `tapUptime` of the time) until a district has a manager,
// and buys whatever adds the most income per dollar. It franchises once the pending stars would double its stars.
import * as E from '../js/idle/econ.js';

const HOURS = +(process.argv[2] || 3), UP = +(process.argv[3] || 0.6), DT = 0.25;
const G = E.fresh(); G.last = 0;
const clone = (g) => JSON.parse(JSON.stringify(g));
const fmt = (s) => `${Math.floor(s / 60)}m${String(Math.floor(s % 60)).padStart(2, '0')}s`;
const log = [];
const note = (t, s) => { log.push(`${fmt(t).padStart(8)}  ${s}`); };

// income with every kitchen cooking (what automation would make)
const potential = (g) => E.DISTRICTS.reduce((a, d) => a + (g.dist[d.id] ? E.potentialPerSec(g, d.id) : 0), 0);
// a new kitchen is judged with its first LOOKN levels bought too (a player levels a new one at once)
const LOOKN = 24, LOOK = (r) => r.base * r.g * (Math.pow(r.g, LOOKN) - 1) / (r.g - 1);
function candidates(g) {
  const c = [];
  for (const r of E.IREST) {
    if (!g.dist[r.district]) continue;
    if (E.level(g, r.id)) {
      c.push({ k: 'lvl', id: r.id, cost: E.levelBuy(g, r.id, 1).cost, act: (h) => E.levelUp(h, r.id, 1) });
      // (a level the couriers can't carry is worth nothing alone: also try it with one more courier)
      c.push({ k: 'lvl', id: r.id, split: { lvl: E.levelBuy(g, r.id, 1).cost, hire: E.hireBuy(g, r.district, 1).cost }, cost: E.levelBuy(g, r.id, 1).cost + E.hireBuy(g, r.district, 1).cost, act: (h) => { E.levelUp(h, r.id, 1); E.hire(h, r.district, 1); } });
    }
    else c.push({ k: 'partner', id: r.id, cost: r.c + LOOK(r), act: (h) => { E.partner(h, r.id); E.levelUp(h, r.id, LOOKN); } });
  }
  for (const d of E.DISTRICTS) {
    const s = g.dist[d.id];
    if (!s) {
      const f = E.restOf(d.id)[0];
      c.push({ k: 'unlock', id: d.id, cost: E.IDIST[d.id].unlock + f.c + LOOK(f), act: (h) => { h.cash += 1e300; E.unlock(h, d.id); E.partner(h, f.id); E.levelUp(h, f.id, LOOKN); } });
      break; // (only the next one)
    }
    c.push({ k: 'hire', id: d.id, cost: E.hireBuy(g, d.id, 1).cost, act: (h) => E.hire(h, d.id, 1) });
    if (s.veh < E.VEH_MULT.length - 1) c.push({ k: 'veh', id: d.id, cost: E.vehCost(d.id, s.veh + 1), act: (h) => E.upgradeVehicle(h, d.id) });
    if (!s.mgr) c.push({ k: 'mgr', id: d.id, cost: E.IDIST[d.id].mgr, mgr: true });
  }
  let nd = 0;
  for (const x of E.DEALS) { if (g.deals[x.id] || !E.dealOpen(g, x)) continue; c.push({ k: 'deal', id: x.id, cost: x.cost, act: (h) => E.buyDeal(h, x.id) }); if (++nd >= 6) break; }
  return c;
}
function gainOf(g, cand, P0) {
  if (cand.mgr) return E.potentialPerSec(g, cand.id) * (1 - UP) + 1e-9;
  const h = clone(g); h.cash = 1e300; cand.act(h);
  return potential(h) - P0;
}

let t = 0, nextBuy = 0, firstFr = null;
const spent = {};
const marks = [5, 10, 20, 30, 45, 60, 90, 120, 180, 240, 300, 360].map((m) => m * 60);
while (t < HOURS * 3600) {
  // taps
  for (const r of E.IREST) if (E.level(G, r.id) && !E.hasMgr(G, r.district) && !G.run[r.id] && Math.random() < DT / (r.t * (1 / UP - 1) + 0.3)) E.cook(G, r.id);
  E.tick(G, DT, t * 1000);
  t += DT;
  if (E.goal(G).done(G)) E.claimGoal(G);
  if (t >= nextBuy) {
    nextBuy = t + 1;
    for (let guard = 0; guard < 40; guard++) {
      const P0 = potential(G);
      // time to pay it off, counting the wait to afford it
      const I = Math.max(1e-6, E.incomePerSec(G, { now: t * 1000 }) || P0 * UP);
      const cs = candidates(G).map((c) => ({ ...c, score: Math.max(0, c.cost - G.cash) / I + c.cost / Math.max(1e-12, gainOf(G, c, P0)) }));
      cs.sort((a, b) => a.score - b.score);
      const best = cs[0]; if (!best || best.cost > G.cash) break;
      if (best.mgr) { spent.mgr = (spent.mgr || 0) + best.cost; E.hireManager(G, best.id); note(t, `manager ${best.id}  (${E.money(best.cost)})`); continue; }
      const before = clone(G);
      best.act(G);
      G.cash = before.cash - best.cost; // (unlock's act gave itself cash)
      for (const [k, v] of Object.entries(best.split || { [best.k]: best.cost })) spent[k] = (spent[k] || 0) + v;
      if (best.k === 'unlock') note(t, `unlock ${best.id}  (${E.money(best.cost)})`);
      if (best.k === 'partner') note(t, `partner ${best.id}  (${E.money(best.cost)})`);
      if (best.k === 'veh') note(t, `vehicle ${best.id} → ${E.VEH_LIST[G.dist[best.id].veh]}  (${E.money(best.cost)})`);
    }
    if (G.office < E.OFFICE.length - 1 && G.cash > E.OFFICE[G.office + 1].cost * 20) { E.upgradeOffice(G); note(t, `office → ${E.OFFICE[G.office].h} h`); }
    const pend = E.pendingStars(G);
    if (pend >= 1 && firstFr == null) { firstFr = t; note(t, `first star available`); }
    if (pend >= Math.max(10, G.stars)) {
      const tot = Object.values(spent).reduce((a, b) => a + b, 0);
      note(t, 'spent: ' + Object.entries(spent).map(([k, v]) => `${k} ${Math.round(v / tot * 100)}%`).join(' ')); for (const k in spent) delete spent[k]; note(t, `FRANCHISE +${pend} stars (had ${G.stars}) · run earned ${E.money(G.earned)}`); E.franchise(G); }
  }
  if (marks.length && t >= marks[0]) {
    marks.shift();
    const lv = E.IREST.filter((r) => E.level(G, r.id)).map((r) => `${r.id}:${E.level(G, r.id)}`).join(' ');
    const ds = Object.entries(G.dist).map(([d, s]) => `${d} n${s.n} v${s.veh}${s.mgr ? ' M' : ''} r${E.ratio(G, d, true).toFixed(2)}`).join(' | ');
    { const tot = Object.values(spent).reduce((a, b) => a + b, 0) || 1; note(t, '   spent: ' + Object.entries(spent).map(([k, v]) => `${k} ${Math.round(v / tot * 100)}%`).join(' ')); }
    note(t, `== ${E.money(E.incomePerSec(G, { now: t * 1000 }))}/s · cash ${E.money(G.cash)} · stars ${G.stars}+${E.pendingStars(G)} · deals ${Object.keys(G.deals).length} · goal ${G.quest}\n            ${ds}\n            ${lv}`);
  }
}
console.log(log.join('\n'));

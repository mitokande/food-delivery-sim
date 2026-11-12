// Players that play Ferdi's (sim.js) by themselves, to check the pacing: when the staff, the stations (dishes) and the
// room levels come, and what the place earns along the way. Nobody taps in this game, so a player is only a buyer:
// "cheap" buys the cheapest thing it can afford; "plan" renovates a room as soon as it can (and saves up for it), hires
// staff and builds stations as soon as there is room for them, else buys the cheapest thing. Used by tools/idle4sim.mjs.
import * as S from './sim.js';

const afford = (G) => S.prices(G).filter((p) => p.cost <= G.cash);
const cheapest = (list) => list.sort((a, b) => a.cost - b.cost)[0] || null;
const BUY = {
  cheap(G) { return cheapest(afford(G)); },
  plan(G) {
    const all = S.prices(G), ok = afford(G);
    // staff and new stations first (they take work off you and the cooks), then a renovation as soon as it can (the
    // office first: it gates the rest), tables, else the cheapest thing; while a renovation within reach waits for
    // cash (under three minutes of income), only small things
    const hire = cheapest(ok.filter((p) => ['cooks', 'waiters', 'registers'].includes(p.id) || ((p.id || '').startsWith('st:') && S.itemOf(G, p.room, p.id) === 0)));
    if (hire) return hire;
    const ups = all.filter((p) => p.a === 'up').sort((a, b) => (a.room === 'office' ? -1 : 0) - (b.room === 'office' ? -1 : 0) || a.cost - b.cost);
    const u = ups[0];
    if (u && u.cost <= G.cash) return u;
    const tables = cheapest(ok.filter((p) => p.id === 'tables' || p.id === 'benches'));
    if (tables && (!u || tables.cost < u.cost * 0.2)) return tables;
    const rate = G.stats.earned / Math.max(60, G.t) * 60;
    if (u && u.cost < rate * 3) return cheapest(ok.filter((p) => p.cost < u.cost * 0.1));
    return cheapest(ok);
  },
};
export const PLAYERS = { cheap: 'cheap', plan: 'plan' };

const label = (G, p) => {
  if (p.a === 'up') return `${p.room}→${S.lvOf(G, p.room) + 1}`;
  const n = S.itemOf(G, p.room, p.id);
  if (p.id === 'cooks' || p.id === 'waiters' || p.id === 'registers') return `${p.id}${n + 1}`;
  if (p.id.startsWith('st:') && n === 0) return `DISH:${p.id.slice(3)}`;
  return null;
};
// Plays `minutes` from a new game. → { G, marks: { what: s }, buys, mins: [a row a minute], diag, gone }
export function play(name, minutes) {
  const G = S.fresh();
  const marks = {}, buys = [], mins = [], diag = {}, gone = [];
  let lastE = 0;
  for (let t = 0; t < minutes * 60; t += 0.5) {
    for (let i = 0; i < 6; i++) {
      const p = BUY[PLAYERS[name]](G); if (!p) break;
      const key = label(G, p);
      if (!S.act(G, p.a, p.room, p.id)) break;
      if (key && !(key in marks)) marks[key] = G.t;
      buys.push({ t: G.t, ...p });
    }
    S.tick(G, 0.5);
    const k = S.diagnose(G).kind; diag[k] = (diag[k] || 0) + 1;
    if (Math.abs(G.t % 60) < 0.01 || Math.abs((G.t % 60) - 60) < 0.01) {
      const m = Math.round(G.t / 60);
      if ([10, 30, 60].includes(m)) gone.push({ m, earned: S.away(structuredClone(G), S.AWAY.max).earned });
      mins.push({ m, earned: G.stats.earned - lastE, lv: S.officeLv(G), menu: S.menu(G).length, cooks: S.nCooks(G), waiters: S.nWaiters(G),
        rooms: S.ROOM_IDS.map((r) => S.lvOf(G, r)).join(''), lost: G.stats.lost });
      lastE = G.stats.earned;
    }
  }
  return { name, G, marks, buys, mins, diag, gone };
}

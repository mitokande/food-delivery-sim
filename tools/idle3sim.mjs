// Plays Uncle's Diner (js/idle3/sim.js) headless, to check the pacing: when the first cook, the first courier and the
// motors come, and what the diner earns along the way.
//   node tools/idle3sim.mjs [minutes=40] [bot=all] [--log]
// Bots: a tapper (taps whenever the grill is free, ~0.4 s to react) who stops tapping after `active` minutes, combined
// with a buyer: "cheap" buys the cheapest thing it can afford; "plan" fixes what diagnose() says holds the diner back.
import { generateCity } from '../js/city/gen.js';
import * as S from '../js/idle3/sim.js';

const MIN = +(process.argv[2] || 40), ONLY = process.argv[3] && !process.argv[3].startsWith('--') ? process.argv[3] : 'all';
const LOG = process.argv.includes('--log');
const city = generateCity();
const W = S.createWorld(city);
console.log(`zone: ${W.zone.length} doors within ${S.DELIV.radius} m, avg ${Math.round(W.zone.reduce((s, z) => s + z.d, 0) / W.zone.length)} m`);
const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

const afford = (G) => S.prices(G).filter((p) => p.cost <= G.cash);
const cheapest = (list) => list.sort((a, b) => a.cost - b.cost)[0] || null;
const BUY = {
  cheap(G) { return cheapest(afford(G)); },
  plan(G) {
    const d = S.diagnose(G), all = S.prices(G);
    const pick = (f) => cheapest(all.filter(f));
    let want;
    if (!G.cooks.length) want = pick((p) => p.a === 'cook');
    else if (!G.couriers.length) want = pick((p) => p.a === 'courier');
    else if (d.kind === 'grill') { // (the most burgers a minute per dollar: a new cook, or a faster one)
      const gain = (p) => (p.a === 'cook' ? 60 / S.COOK.make : 60 / S.cookTime(G.cooks.find((c) => c.id === p.id)) * (1 / S.SPEED_K - 1));
      want = all.filter((p) => p.a === 'cook' || (p.a === 'skill' && p.sk === 'speed' && p.id !== 'you')).sort((x, y) => gain(y) / y.cost - gain(x) / x.cost)[0];
    }
    else if (d.kind === 'bags') want = pick((p) => p.a === 'courier' || p.a === 'motor' || (p.a === 'skill' && (p.sk === 'ride' || p.sk === 'bag')));
    else if (d.kind === 'quiet') want = pick((p) => p.a === 'courier' || p.a === 'motor' || (p.a === 'skill' && (p.sk === 'quality' || p.sk === 'charm')));
    else want = pick((p) => p.a === 'skill' && (p.sk === 'quality' || p.sk === 'charm' || p.sk === 'speed') || p.a === 'motor');
    if (want && want.cost <= G.cash) return want;
    // (saving for it; meanwhile something under a fifth of the cash)
    const small = cheapest(afford(G).filter((p) => p.cost < G.cash * 0.2 && (!want || p.cost < want.cost * 0.25)));
    return small;
  },
};
const PLAYERS = { 'cheap-active': ['cheap', 99], 'plan-active': ['plan', 99], 'plan-5min': ['plan', 5], 'plan-idle': ['plan', 1] };

function run(name) {
  const [buyer, active] = PLAYERS[name];
  const G = S.fresh();
  const marks = {}, mark = (k) => { if (!(k in marks)) marks[k] = G.t; };
  let react = 0;
  const rows = [];
  let lastE = 0;
  for (let t = 0; t < MIN * 60; t += 0.25) {
    if (G.t < active * 60) {
      if (S.canSmash(G) === 'ok') { react += 0.25; if (react >= 0.4) { S.act(G, 'smash'); react = 0; } } else react = 0;
    }
    for (let i = 0; i < 6; i++) {
      const p = BUY[buyer](G); if (!p) break;
      if (!S.act(G, p.a, p.id, p.sk)) break;
      const key = p.a === 'cook' ? `cook${G.cooks.length}` : p.a === 'courier' ? `courier${G.couriers.length}` : p.a === 'motor' ? `motor:${S.MOTORS[G.couriers.find((c) => c.id === p.id).motor].id}` : null;
      if (key) mark(key);
      if (LOG) console.log(`${fmt(G.t)} ${p.a}${p.sk ? ':' + p.sk : ''}${p.id != null ? ' ' + p.id : ''} $${p.cost}`);
    }
    for (const e of S.tick(G, W, 0.25)) if (e.kind === 'fame') mark(`fame${e.level}`);
    if (Math.abs(G.t % 60) < 0.01 || Math.abs((G.t % 60) - 60) < 0.01) {
      const m = Math.round(G.t / 60);
      if ([1, 2, 3, 5, 8, 10, 15, 20, 30, 40, 60].includes(m)) rows.push(`${m}m $${Math.round(G.stats.earned - lastE)}/min F${S.fameLevel(G)} c${G.cooks.length} r${G.couriers.length}`);
      lastE = G.stats.earned;
    }
  }
  const st = G.stats;
  console.log(`\n== ${name}: earned $${Math.round(st.earned)} · fame ${S.fameLevel(G)} (${G.served}) · walk-ins ${st.walkins} (lost ${st.lostWalk}) · deliveries ${st.deliveries} (lost ${st.lostOrders}) · taps ${st.taps} · cash left $${Math.round(G.cash)}`);
  console.log('   ' + Object.entries(marks).map(([k, v]) => `${k}@${fmt(v)}`).join('  '));
  console.log('   ' + rows.join(' | '));
  console.log(`   cooks: ${G.cooks.map((c) => `s${c.speed}q${c.quality}`).join(' ')} · you: s${G.you.speed}q${G.you.quality} · couriers: ${G.couriers.map((c) => `${S.MOTORS[c.motor].id}/r${c.ride}c${c.charm}b${c.bag}`).join(' ')}`);
}
for (const n of Object.keys(PLAYERS)) if (ONLY === 'all' || ONLY === n) run(n);

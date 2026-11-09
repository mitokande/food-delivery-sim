// Plays Uncle's Diner (js/idle3/sim.js) headless, to check the pacing: when the cooks (and their dishes), the
// couriers, the motors and the restaurant's stages come, and what the place earns along the way.
//   node tools/idle3sim.mjs [minutes=60] [player=all] [--log]
// Players: a tapper (cooks the next ticket whenever the button is free, ~0.4 s to react) who stops tapping after
// `active` minutes, with a buyer: "cheap" buys the cheapest thing it can afford; "plan" fixes what diagnose() says
// holds the restaurant back and saves up for the next stage.
import { generateCity } from '../js/city/gen.js';
import * as S from '../js/idle3/sim.js';

const MIN = +(process.argv[2] || 60), ONLY = process.argv[3] && !process.argv[3].startsWith('--') ? process.argv[3] : 'all';
const LOG = process.argv.includes('--log');
const city = generateCity();
const W = S.createWorld(city);
console.log(`zone: ${W.zone.length} doors within ${S.DELIV.radius} m, avg ${Math.round(W.zone.reduce((s, z) => s + z.d, 0) / W.zone.length)} m · next door: lot ${W.next?.id}`);
const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

const afford = (G) => S.prices(G).filter((p) => p.cost <= G.cash);
const cheapest = (list) => list.sort((a, b) => a.cost - b.cost)[0] || null;
const BUY = {
  cheap(G) { return cheapest(afford(G)); },
  plan(G) {
    const d = S.diagnose(G).kind, all = S.prices(G);
    const pick = (f) => cheapest(all.filter(f));
    const has = (a) => all.find((p) => p.a === a) || null;
    const speedUp = () => { // the most dishes a minute per dollar: a new cook, or a faster one
      const gain = (p) => (p.a === 'cook' ? 60 / S.avgTime(G) : 60 / (S.avgTime(G) * S.speedK(S.whoOf(G, p.id).speed)) * (1 / S.SPEED_K - 1));
      return all.filter((p) => p.a === 'cook' || (p.a === 'skill' && p.sk === 'speed' && p.id !== 'you')).sort((x, y) => gain(y) / y.cost - gain(x) / x.cost)[0];
    };
    let want;
    if (!G.cooks.length) want = has('cook');
    else if (!G.couriers.length) want = has('courier');
    else if (has('cook')) want = has('cook'); // (a new cook = a new dish on the menu)
    else if (has('expand') && (d === 'seats' || d === 'quiet' || !S.roomFor(G, 'cook') || (d === 'bags' && !S.roomFor(G, 'courier')))) want = has('expand');
    else if (d === 'kitchen') want = speedUp();
    else if (d === 'seats') want = has('cook') || pick((p) => p.a === 'skill' && p.sk === 'quality');
    else if (d === 'bags') want = pick((p) => p.a === 'courier' || p.a === 'motor' || (p.a === 'skill' && (p.sk === 'ride' || p.sk === 'bag')));
    else if (d === 'quiet') want = has('cook') || has('expand') || pick((p) => p.a === 'courier' || p.a === 'motor' || (p.a === 'skill' && p.sk === 'quality'));
    else want = has('cook') || pick((p) => (p.a === 'skill' && (p.sk === 'quality' || p.sk === 'charm')) || p.a === 'motor');
    if (want && want.cost <= G.cash) return want;
    // (saving for it; meanwhile something small, less so while saving for a bigger restaurant)
    const k = want?.a === 'expand' ? 0.05 : 0.2;
    return cheapest(afford(G).filter((p) => p.a !== 'expand' && p.cost < G.cash * 0.2 && (!want || p.cost < want.cost * k)));
  },
};
const PLAYERS = { 'cheap-active': ['cheap', 99], 'plan-active': ['plan', 99], 'plan-5min': ['plan', 5], 'plan-idle': ['plan', 1] };

function run(name) {
  const [buyer, active] = PLAYERS[name];
  const G = S.fresh();
  const marks = {}, mark = (k) => { if (!(k in marks)) marks[k] = G.t; };
  let react = 0, lastE = 0;
  const rows = [], diag = {};
  for (let t = 0; t < MIN * 60; t += 0.25) {
    if (G.t < active * 60) {
      if (S.canCook(G) === 'ok') { react += 0.25; if (react >= 0.4) { S.act(G, 'cook-tap'); react = 0; } } else react = 0;
    }
    for (let i = 0; i < 6; i++) {
      const p = BUY[buyer](G); if (!p) break;
      if (!S.act(G, p.a, p.id, p.sk)) break;
      const key = p.a === 'cook' ? `cook${G.cooks.length}:${G.menu.at(-1)}` : p.a === 'courier' ? `courier${G.couriers.length}` : p.a === 'expand' ? `STAGE${G.stage + 1}`
        : p.a === 'motor' ? `motor:${S.MOTORS[G.couriers.find((c) => c.id === p.id).motor].id}` : null;
      if (key) mark(key);
      if (LOG) console.log(`${fmt(G.t)} ${p.a}${p.sk ? ':' + p.sk : ''}${p.id != null ? ' ' + p.id : ''} $${p.cost}`);
    }
    S.tick(G, W, 0.25);
    const k = S.diagnose(G).kind; diag[k] = (diag[k] || 0) + 1;
    if (Math.abs(G.t % 60) < 0.01 || Math.abs((G.t % 60) - 60) < 0.01) {
      const m = Math.round(G.t / 60);
      if ([1, 2, 3, 5, 10, 15, 20, 30, 40, 50, 60, 90].includes(m)) rows.push(`${m}m $${Math.round(G.stats.earned - lastE)}/min S${G.stage + 1} F${S.fameLevel(G)} c${G.cooks.length} r${G.couriers.length}`);
      lastE = G.stats.earned;
    }
  }
  const st = G.stats, n = Object.values(diag).reduce((a, b) => a + b, 0);
  console.log(`\n== ${name}: earned $${Math.round(st.earned)} · stage ${G.stage + 1} · fame ${S.fameLevel(G)} (${G.served}) · menu ${G.menu.length} · tables ${st.tables} (lost ${st.lostWalk}) · deliveries ${st.deliveries} (lost ${st.lostOrders}) · taps ${st.taps} · cash $${Math.round(G.cash)}`);
  console.log('   ' + Object.entries(marks).map(([k, v]) => `${k}@${fmt(v)}`).join('  '));
  console.log('   ' + rows.join(' | '));
  console.log('   banner: ' + Object.entries(diag).map(([k, v]) => `${k} ${Math.round(v / n * 100)}%`).join(', '));
}
for (const n of Object.keys(PLAYERS)) if (ONLY === 'all' || ONLY === n) run(n);

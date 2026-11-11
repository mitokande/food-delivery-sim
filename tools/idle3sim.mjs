// Plays Idle Restaurant Manager (js/idle3/sim.js) headless, to check the pacing: when the cooks (and their dishes), the
// couriers, the motors and the restaurant's stages come, and what the place earns along the way.
//   node tools/idle3sim.mjs [minutes=60] [player=all] [--log]
// The players are js/idle3/bot.js (the balance lab, idle3-lab.html, runs the same ones in the browser). Also: what
// closing the game for AWAY.max would bring.
import { generateCity } from '../js/city/gen.js';
import * as S from '../js/idle3/sim.js';
import { PLAYERS, play } from '../js/idle3/bot.js';

const MIN = +(process.argv[2] || 60), ONLY = process.argv[3] && !process.argv[3].startsWith('--') ? process.argv[3] : 'all';
const LOG = process.argv.includes('--log');
const city = generateCity();
const W = S.createWorld(city);
console.log(`zone: ${W.zone.length} doors within ${S.DELIV.radius} m, avg ${Math.round(W.zone.reduce((s, z) => s + z.d, 0) / W.zone.length)} m · next door: lot ${W.next?.id}`);
const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

function run(name) {
  const { G, marks, buys, mins, gone, diag } = play(W, name, MIN);
  if (LOG) for (const p of buys) console.log(`${fmt(p.t)} ${p.a}${p.sk ? ':' + p.sk : ''}${p.id != null ? ' ' + p.id : ''} $${p.cost}`);
  const rows = mins.filter((r) => [1, 2, 3, 5, 10, 15, 20, 30, 40, 50, 60, 90].includes(r.m)).map((r) => `${r.m}m $${Math.round(r.earned)}/min S${r.stage} F${r.fame} c${r.cooks} r${r.couriers}`);
  const st = G.stats, n = Object.values(diag).reduce((a, b) => a + b, 0);
  console.log(`\n== ${name}: earned $${Math.round(st.earned)} · stage ${G.stage + 1} · fame ${S.fameLevel(G)} (${G.served}) · menu ${G.menu.length} · tables ${st.tables} (lost ${st.lostWalk}) · deliveries ${st.deliveries} (lost ${st.lostOrders}) · taps ${st.taps} · cash $${Math.round(G.cash)}`);
  console.log('   ' + Object.entries(marks).map(([k, v]) => `${k}@${fmt(v)}`).join('  '));
  console.log('   ' + rows.join(' | '));
  console.log(`   closed for ${S.AWAY.max / 3600} h at: ${gone.map((g) => `${g.m}m +$${Math.round(g.earned)}`).join(' | ')}`);
  console.log('   banner: ' + Object.entries(diag).map(([k, v]) => `${k} ${Math.round(v / n * 100)}%`).join(', '));
}
for (const n of Object.keys(PLAYERS)) if (ONLY === 'all' || ONLY === n) run(n);

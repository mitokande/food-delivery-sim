// Plays Ferdi's (js/idle4/sim.js) headless, to check the pacing: when the staff, the dishes and the room levels come,
// and what the place earns along the way. Also: what closing the game for AWAY.max would bring.
//   node tools/idle4sim.mjs [minutes=60] [player=all] [--log]
import * as S from '../js/idle4/sim.js';
import { PLAYERS, play } from '../js/idle4/bot.js';

const MIN = +(process.argv[2] || 60), ONLY = process.argv[3] && !process.argv[3].startsWith('--') ? process.argv[3] : 'all';
const LOG = process.argv.includes('--log');
const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

function run(name) {
  const t0 = Date.now();
  const { G, marks, buys, mins, diag, gone, quests, events } = play(name, MIN);
  if (LOG) for (const p of buys) console.log(`${fmt(p.t)} ${p.a === 'up' ? 'UP ' + p.room : p.room + '.' + p.id} $${p.cost}`);
  const rows = mins.filter((r) => [1, 2, 3, 5, 10, 15, 20, 30, 40, 50, 60, 90, 120].includes(r.m)).map((r) => `${r.m}m $${Math.round(r.earned)}/min L${r.lv} [${r.rooms}] m${r.menu} c${r.cooks} w${r.waiters} team ${r.team} lost${r.lost}`);
  const st = G.stats, n = Object.values(diag).reduce((a, b) => a + b, 0);
  console.log(`\n== ${name}: earned $${Math.round(st.earned)} · served ${st.served} · lost ${st.lost} of ${st.walkins} · cash $${Math.round(G.cash)} · ${Date.now() - t0} ms`);
  console.log('   rooms ' + S.ROOM_IDS.map((r) => `${r} ${S.lvOf(G, r)}`).join(', '));
  console.log('   ' + Object.entries(marks).map(([k, v]) => `${k}@${fmt(v)}`).join('  '));
  console.log('   ' + rows.join('\n   '));
  console.log(`   closed for ${S.AWAY.max / 3600} h at: ${gone.map((g) => `${g.m}m +$${Math.round(g.earned)}`).join(' | ')}`);
  console.log('   holding back: ' + Object.entries(diag).map(([k, v]) => `${k} ${Math.round(v / n * 100)}%`).join(', '));
  console.log(`   quests: ${quests.length} done, $${quests.reduce((a, q) => a + q.cash, 0)} in rewards · tips ${st.tips} ($${Math.round(st.tipCash)}) · letters ${st.letters}`);
  if (LOG) for (const q of quests) console.log(`   ${fmt(q.t)} quest: ${q.text} +$${q.cash}`);
  console.log('   events: ' + events.map((e) => `${fmt(e.t)} ${e.kind}${e.kind === 'threat' ? `(${e.need})` : ''}:${e.grade || (e.stars ? e.stars + '*' : e.ok ? 'ok' : 'no')}${e.cash ? ' +$' + e.cash : ''}`).join('  '));
}
for (const n of Object.keys(PLAYERS)) if (ONLY === 'all' || ONLY === n) run(n);

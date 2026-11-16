// Ferdi's (idle4.html): the cook-offs' balance (js/idle4/duel.js). Seven players, from one manager to a full crew at
// level 5, fight every branch 40 times with their best team and dishes, skills on Auto: win % / 3-star % / seconds.
//   node tools/idle4duel.mjs [manual|str]   (manual: skills never used; str: the strengths only)
const root = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const S = await import(root + '/js/idle4/sim.js'), D = await import(root + '/js/idle4/duel.js');
const dishes = S.DISHES.map((d) => d.id);
// progression states: [label, managers(room:lv), room lv, station lv, n dishes]
const states = [
  ['A start lv3', { kitchen: 1 }, 2, 5, 3],
  ['B 2 mgr', { kitchen: 1, dining: 1 }, 3, 8, 4],
  ['C 3 mgr lv2', { kitchen: 2, dining: 2, entrance: 1 }, 3, 11, 5],
  ['D 4 mgr lv3', { kitchen: 3, dining: 2, entrance: 2, cashier: 2 }, 4, 14, 6],
  ['E 5 mgr lv3-4', { kitchen: 4, dining: 3, entrance: 3, cashier: 3, terrace: 3 }, 4, 17, 7],
  ['F 7 mgr lv4', { kitchen: 4, dining: 4, entrance: 4, cashier: 4, terrace: 4, staff: 3, bay: 3 }, 5, 21, 8],
  ['G max', { kitchen: 5, dining: 5, entrance: 5, cashier: 5, terrace: 5, staff: 5, bay: 5 }, 5, 25, 8],
];
for (const [label, mgr, rl, sl, nd] of states) {
  const G = S.fresh();
  for (const r of S.ROOM_IDS) G.rooms[r].lv = rl;
  for (const d of dishes.slice(0, nd)) G.rooms.kitchen.it['st:' + d] = sl;
  G.mgr = Object.fromEntries(Object.entries(mgr).map(([r, lv]) => [r, { lv }]));
  G.rooms.office.lv = Math.max(3, rl);
  let row = label.padEnd(16);
  if (process.argv[2] === 'str') { console.log(row + D.STAGES.map((st) => (D.teamStrength(G, st, D.bestTeam(G), D.bestDishes(G, st)) / (D.rivalStrength(st) / st.k)).toFixed(1)).join(' ')); continue; }
  for (const st of D.STAGES) {
    let w = 0, s3 = 0, T = 0; const N = 40;
    for (let n = 0; n < N; n++) {
      G.duel.tix = 5; for (let i = 0; i < st.id; i++) G.duel.won[i] = 1;
      const team = D.bestTeam(G), ds = D.bestDishes(G, st);
      const X = D.start(G, st.id, team, ds, 0, n * 7919 + 1); if (!X) { row += ' ?? '; break; }
      X.auto = process.argv[2] !== 'manual';
      while (!X.over) D.tick(X, 0.1);
      if (X.over === 'win') w++; if (D.stars(X) === 3) s3++; T += X.t;
    }
    row += ` ${String(Math.round(w / N * 100)).padStart(3)}/${String(Math.round(s3 / N * 100)).padStart(3)}/${String(Math.round(T / N)).padStart(2)}`;
    if (st.boss) row += ' |';
  }
  console.log(row);
}
console.log('win%/3star%/secs per stage');

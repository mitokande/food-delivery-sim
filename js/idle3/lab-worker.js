// The balance lab's worker (idle3-lab.html): plays the game headless with the numbers it is sent (bot.js on sim.js),
// off the page's thread. One run at a time; the city is made once.
import { generateCity } from '../city/gen.js';
import * as S from './sim.js';
import { play } from './bot.js';

const city = generateCity();
onmessage = (e) => {
  const { id, over, player, minutes } = e.data;
  try {
    S.tune(over);
    const W = S.createWorld(city);
    if (!W.zone.length) throw new Error('no door inside the delivery zone');
    const r = play(W, player, minutes), st = r.G.stats;
    postMessage({ id, run: {
      marks: r.marks, mins: r.mins, gone: r.gone, diag: r.diag,
      buys: r.buys.map((b) => b.t),
      earned: st.earned, tables: st.tables, deliveries: st.deliveries, lostWalk: st.lostWalk, lostOrders: st.lostOrders, taps: st.taps,
      stage: r.G.stage + 1, fame: S.fameLevel(r.G), menu: r.G.menu.length, cooks: r.G.cooks.length, couriers: r.G.couriers.length,
      doors: W.zone.length,
    } });
  } catch (err) { postMessage({ id, error: String(err?.message || err) }); }
};
postMessage({ ready: true });

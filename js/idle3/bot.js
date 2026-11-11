// Players that play Idle Restaurant Manager (sim.js) by themselves, to check the pacing: when the cooks (and their
// dishes), the couriers, the motors and the restaurant's stages come, and what the place earns along the way.
// A tapper (cooks the next ticket whenever the button is free, ~0.4 s to react) who stops tapping after `active`
// minutes, with a buyer: "cheap" buys the cheapest thing it can afford; "plan" fixes what diagnose() says holds the
// restaurant back and saves up for the next stage. Used by tools/idle3sim.mjs and the balance lab (idle3-lab.html).
import * as S from './sim.js';

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
// name → [buyer, minutes of tapping]
export const PLAYERS = { 'cheap-active': ['cheap', 99], 'plan-active': ['plan', 99], 'plan-5min': ['plan', 5], 'plan-idle': ['plan', 1] };

// Plays `minutes` from a new game. → { G, marks: { what: s it came }, buys: [{ t, a, id, sk, cost, key }],
// mins: [a row per minute: earned in it, stage, fame, cooks, couriers], gone: [what closing the game at 10, 30 and
// 60 min for AWAY.max would bring], diag: { what held the place back: quarter-seconds } }
export function play(W, name, minutes) {
  const [buyer, active] = PLAYERS[name];
  const G = S.fresh();
  const marks = {}, buys = [], mins = [], gone = [], diag = {};
  let react = 0, lastE = 0;
  for (let t = 0; t < minutes * 60; t += 0.25) {
    if (G.t < active * 60) {
      if (S.canCook(G) === 'ok') { react += 0.25; if (react >= 0.4) { S.act(G, 'cook-tap'); react = 0; } } else react = 0;
    }
    for (let i = 0; i < 6; i++) {
      const p = BUY[buyer](G); if (!p) break;
      if (!S.act(G, p.a, p.id, p.sk)) break;
      const key = p.a === 'cook' ? `cook${G.cooks.length}:${G.menu.at(-1)}` : p.a === 'courier' ? `courier${G.couriers.length}` : p.a === 'expand' ? `STAGE${G.stage + 1}`
        : p.a === 'motor' ? `motor:${S.MOTORS[G.couriers.find((c) => c.id === p.id).motor].id}` : null;
      if (key && !(key in marks)) marks[key] = G.t;
      buys.push({ t: G.t, a: p.a, id: p.id, sk: p.sk, cost: p.cost, key });
    }
    S.tick(G, W, 0.25);
    const k = S.diagnose(G).kind; diag[k] = (diag[k] || 0) + 1;
    if (Math.abs(G.t % 60) < 0.01 || Math.abs((G.t % 60) - 60) < 0.01) {
      const m = Math.round(G.t / 60);
      if ([10, 30, 60].includes(m)) gone.push({ m, earned: S.away(structuredClone(G), W, S.AWAY.max).earned });
      mins.push({ m, earned: G.stats.earned - lastE, stage: G.stage + 1, fame: S.fameLevel(G), cooks: G.cooks.length, couriers: G.couriers.length });
      lastE = G.stats.earned;
    }
  }
  return { name, G, marks, buys, mins, gone, diag };
}

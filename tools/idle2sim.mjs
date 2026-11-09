// Plays one Hot Chain stage (js/idle2/sim.js) headless with several bots, to check the pacing and that the choices matter.
//   node tools/idle2sim.mjs [seeds=5] [bot=all] [--log]
// The design's gate: "cheap" (always buys the cheapest thing it can afford, the old idle habit) must end well behind
// the planned bots ("neck" fixes whatever holds the chain back; "plan" also gets ready for the rushes and the heat).
import { generateCity } from '../js/city/gen.js';
import * as S from '../js/idle2/sim.js';

const SEEDS = +(process.argv[2] || 5), ONLY = process.argv[3] && !process.argv[3].startsWith('--') ? process.argv[3] : 'all';
const LOG = process.argv.includes('--log');
const city = generateCity();
const W = S.createWorld(city);
const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

// ---------------------------------------------------------------- bots: each returns the purchase it wants now (or null)
const affordable = (G) => S.prices(G).filter((p) => p.cost <= G.cash);
const BOTS = {
  // the cheapest thing on the list, every time
  cheap(G) { const a = affordable(G).sort((x, y) => x.cost - y.cost); return a[0] || null; },
  // the old idle habit: kitchens first (cooks, partners, promos), a courier only when the kitchens are all bought out
  kitchen(G) {
    const all = S.prices(G).filter((p) => p.a !== 'hire' && p.a !== 'bags').sort((x, y) => x.cost - y.cost);
    const k = all.find((p) => p.cost <= G.cash);
    if (k) return k;
    if (!all.length || all[0].cost > G.cash * 4) { const h = S.prices(G).find((p) => p.a === 'hire' && p.id === 'zippy'); if (h.cost <= G.cash) return h; }
    return null;
  },
  // anything affordable, at random
  random(G, rng) { const a = affordable(G); return a.length && rng() < 0.3 ? a[Math.floor(rng() * a.length)] : null; },
  // fixes what diagnose() says holds the chain back; otherwise grows demand
  neck(G) { FLEET = 'auto'; return planned(G, false); },
  // neck + looks ahead to the next rush, buys heat gear, moves the stand
  plan(G) { FLEET = 'auto'; return planned(G, true); },
  'plan-z'(G) { FLEET = 'z'; return planned(G, true); },
  'plan-v'(G) { FLEET = 'v'; return planned(G, true); },
  'plan-m'(G) { FLEET = 'm'; return planned(G, true); },
};

let FLEET = 'auto'; // (plan-v / plan-m: the same planner with one vehicle policy)
function fleetPick(G) {
  if (FLEET !== 'auto') {
    const want = FLEET === 'v' ? ['vespetta', 'zippy'] : FLEET === 'm' ? (Object.keys(G.kit).length >= 2 ? ['mule', 'vespetta', 'zippy'] : ['vespetta', 'zippy']) : ['zippy'];
    const v = want[0];
    return { a: 'hire', id: v, cost: S.hireCost(G, v) };
  }
  // a courier for the kitchens: Vespettas when food piles up (two at a time pays), Mules when it really piles up
  let racks = 0, n = 0; for (const id in G.kit) { racks += G.kit[id].rack.length; n++; }
  const pile = racks / Math.max(1, n);
  const order = pile >= 3 ? ['mule', 'vespetta', 'zippy'] : pile >= 1.2 ? ['vespetta', 'zippy'] : ['zippy'];
  // (the food is waiting: take the best one the cash allows now rather than save up)
  const v = order.find((x) => S.hireCost(G, x) <= G.cash) || order[order.length - 1];
  return { a: 'hire', id: v, cost: S.hireCost(G, v) };
}
// the stand spot nearest the kitchens, weighted by their orders
function bestStand(G) {
  let best = null, bc = Infinity;
  for (const sp of W.stands) {
    let c = 0; for (const id in G.kit) c += S.demandRate(G, id) * W.dist(sp.lot.door, W.kitchenDoor(id));
    if (c < bc) { bc = c; best = sp; }
  }
  let cur = 0; for (const id in G.kit) cur += S.demandRate(G, id) * W.dist(W.standOf(G.stand).lot.door, W.kitchenDoor(id));
  return best && best.id !== G.stand && cur - bc > 25 * Object.keys(G.kit).length ? best : null;
}
function planned(G, ahead) {
  const d = S.diagnose(G), clock = S.clockOf(G);
  const p = S.prices(G);
  const find = (a, id) => p.find((x) => x.a === a && (id === undefined || x.id === id));
  const ok = (w) => (w && w.cost <= G.cash ? w : null);
  // 1. what holds the chain back right now
  if (d.kind === 'shelf') return ok(fleetPick(G));
  if (d.kind === 'kitchen') return ok(find('cook', d.id) || find('shelf', d.id));
  if (d.kind === 'heat' && !G.bags) return ok(find('bags'));
  // 2. ahead: the next rush against the cooks and the fleet; the stand where the kitchens are
  const nr = S.nextRush(clock), soon = ahead && nr && nr.from - clock < 40;
  if (ahead) {
    const sp = bestStand(G); if (sp && G.cash >= S.MOVE_STAND) return { a: 'stand', id: sp.id, cost: S.MOVE_STAND };
    if (soon) {
      let dem = 0;
      for (const id in G.kit) {
        const need = S.demandRate(G, id) / S.dayMult(clock) * nr.m; dem += need;
        if (S.cookRate(G, id) < need) { const c = find('cook', id); if (c) return ok(c); }
      }
      if (S.fleetRate(G, W) < dem * 0.9) return ok(fleetPick(G));
    }
  }
  // 3. grow: save for the next partner; promos while saving if couriers stand around
  const next = p.filter((x) => x.a === 'partner').sort((a, b) => a.cost - b.cost)[0];
  if (next) {
    if (G.cash >= next.cost) return next;
    if (d.kind === 'demand') { const pr = p.filter((x) => x.a === 'promo').sort((a, b) => a.cost - b.cost)[0]; if (pr && pr.cost < (next.cost - G.cash) * 0.25) return ok(pr); }
    return null;
  }
  if (d.kind === 'demand' || d.kind === 'ok') { const pr = p.filter((x) => x.a === 'promo').sort((a, b) => a.cost - b.cost)[0]; return ok(pr); }
  return null;
}

// ---------------------------------------------------------------- run
function play(bot, seed) {
  const G = S.fresh({ seed });
  const r = ((s) => () => { s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), s | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; })(seed * 7 + 1);
  const buys = {}; const log = [];
  let think = 0, peakQ = 0;
  while (!G.done) {
    S.tick(G, W, 0.5);
    think += 0.5;
    if (think >= 1) {
      think = 0;
      for (let k = 0; k < 6; k++) {
        const w = BOTS[bot](G, r); if (!w) break;
        if (!S.act(G, w.a, w.id, W)) break;
        buys[w.a] = (buys[w.a] || 0) + 1;
        if (LOG && (w.a !== 'cook' && w.a !== 'promo' && w.a !== 'shelf' || k === 0)) log.push(`${fmt(G.t)} ${w.a} ${w.id || ''} $${w.cost}`);
      }
    }
    let q = 0; for (const id in G.kit) q += G.kit[id].queue.length; peakQ = Math.max(peakQ, q);
  }
  return { G, buys, log, peakQ };
}

const names = ONLY === 'all' ? Object.keys(BOTS) : ONLY.split(',');
console.log(`stage ${S.STAGE.name}: ★ at ${S.STAGE.stars.join(' / ')} hot deliveries · ${SEEDS} seeds\n`);
for (const b of names) {
  const res = []; for (let s = 1; s <= SEEDS; s++) res.push(play(b, s));
  const avg = (f) => res.reduce((a, x) => a + f(x), 0) / res.length;
  const stars = res.map((x) => S.starsFor(x.G.stats.hot));
  const G = res[0].G;
  console.log(`${b.padEnd(8)} ★ ${stars.join(' ')}  hot ${avg((x) => x.G.stats.hot).toFixed(0)}  warm ${avg((x) => x.G.stats.warm).toFixed(0)}  cold ${avg((x) => x.G.stats.cold).toFixed(0)}  lost ${avg((x) => x.G.stats.lost).toFixed(0)}  earned $${avg((x) => x.G.stats.earned).toFixed(0)}  cash left $${avg((x) => x.G.cash).toFixed(0)}`);
  console.log(`         kitchens ${Object.entries(G.kit).map(([id, k]) => `${id} c${k.cooks} s${S.shelfSize(k)} p${k.promo}${k.lamp ? ' L' : ''} ★${k.rating.toFixed(1)}`).join(' | ')}`);
  console.log(`         fleet ${G.couriers.map((c) => c.veh[0]).join('')} (${G.couriers.length})${G.bags ? ' bags' : ''} stand ${G.stand} · buys ${JSON.stringify(res[0].buys)}`);
  if (LOG) console.log(res[0].log.map((l) => '           ' + l).join('\n'));
}

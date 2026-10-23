// Measures what the autopilot really averages (m/s) per vehicle and district — calibrates order timers.
//   node tools/speed.mjs <district> <veh,veh> [rides]     env BOOST=1: hold turbo whenever there is energy; SEED=n: repeatable
import { createRequire } from 'node:module';
import { serve } from './serve.mjs';
const require = createRequire(import.meta.url);
let puppeteer; try { puppeteer = require('puppeteer-core'); } catch { puppeteer = require('/root/.npm/_npx/110f701c48e68d66/node_modules/puppeteer-core'); }
const { server, base } = await serve();
const browser = await puppeteer.launch({ executablePath: '/root/.cache/puppeteer/chrome/linux-148.0.7778.97/chrome-linux64/chrome', headless: 'new', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage();
await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
page.on('pageerror', (e) => console.log('pageerror', e.message));
// SEED=n: the same orders and traffic on every run, to compare two builds
if (process.env.SEED) await page.evaluateOnNewDocument((seed) => { let a = seed >>> 0; Math.random = () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; Date.now = () => 1792000000000; }, +process.env.SEED);
await page.goto(`${base}/index.html?noti=1&clock=600`, { waitUntil: 'networkidle0', timeout: 180000 });
await page.waitForFunction('window.ready', { timeout: 120000 });
const out = [];
for (const v of (process.argv[3] || 'rustbucket,vespetta,viper').split(',')) {
const res = await page.evaluate(async (d, v, N, BOOST) => {
  const S = game.St.S; S.vehicles[v] ||= { parts: { engine: 0, suspension: 0, box: 0, tires: 0 }, count: 1 }; S.active = v;
  S.districts = { oldtown: true, downtown: true, harbor: true, hills: true }; S.stats.deliveries = 50; S.lvl = 6;
  const R = game.ride.R, log = [];
  for (let k = 0; k < N; k++) {
    let o = null; for (let i = 0; i < 30 && !o; i++) { o = game.board.find((x) => x.district === d); if (!o) { game.board.length = 0; game.refill(); } }
    game.board = game.board.filter((x) => x !== o);
    const c = game.city, roads = c.tiles.filter((t) => t.k === 1 && t.piece === 'straight' && t.d === d), t0 = roads[(k * 37 + 11) % roads.length];
    const legs = [{ kind: 'pickup', lot: o.restLot, orders: [o.id] }, { kind: 'drop', lot: o.cust, order: o.id }];
    await game.ride.start({ orders: [o], legs }, t0.i, [0, 1, 2, 3].find((q) => t0.mask & (1 << q)));
    const blocked = {}; let stuck = 0, maxStuck = 0, t = 0;
    while (R.active && t < 400) {
      if (R.event && !R.eventDone) R.event = null;
      if (BOOST && R.phase === 'ride' && R.energy > 15 && !R.boost) game.ride.input('boost', true);
      game.sim(0.25); t += 0.25;
      if (R.phase === 'ride') {
        const k2 = R.v < 0.3 ? (R.blockedBy || (R.light && R.light.state !== 'g' ? 'light-far' : 'none')) : 'moving';
        blocked[k2] = (blocked[k2] || 0) + 0.25;
        if (R.v < 0.3) { stuck += 0.25; maxStuck = Math.max(maxStuck, stuck); if (stuck === 20) { const L = game.traffic.leaderGap ? null : null; log.push({ at: Math.round(R.s), tile: R.curTile, blockedBy: R.blockedBy, wait: R.wait, crash: R.crash, light: R.light && { st: R.light.state, d: Math.round(R.light.d) }, ot: !!R.ot }); } }
        else stuck = 0;
      }
      if (R.phase === 'scene' && R.leg === legs.length - 1) break;
      for (const sel of ['.modal.scene [data-x]', '.modal.tip [data-x]']) document.querySelector(sel)?.click();
      await new Promise((r) => setTimeout(r, 0));
    }
    log.push({ k, meters: Math.round(R.meters), time: Math.round(R.rideTime), blocked, maxStuck });
    game.ride.abort(); document.querySelectorAll('.modal').forEach((m) => m.remove());
  }
  return log;
}, process.argv[2] || 'downtown', v, +(process.argv[4] || 3), !!process.env.BOOST);
const runs = res.filter((l) => l.meters != null);
if (process.env.STALLS) for (const l of res) if (l.meters == null) console.log('stall', JSON.stringify(l));
const m = runs.reduce((a, l) => a + l.meters, 0), t = runs.reduce((a, l) => a + l.time, 0);
console.log(`${process.argv[2]} ${v} boost=${process.env.BOOST ? 1 : 0}: ${(m / t).toFixed(2)} m/s  (${m} m / ${t} s, worst stall ${Math.max(...runs.map((l) => l.maxStuck))} s)`);
}
await browser.close(); server.close();

// Manual riding (desktop): the bike waits for the pedals, lanes change on A/D, a junction turn off the GPS route re-routes
// to the same door, and a simple rider finishes a whole job.   node tools/manual.mjs [shot-prefix]
import { createRequire } from 'node:module';
import { serve } from './serve.mjs';
const require = createRequire(import.meta.url);
let puppeteer; try { puppeteer = require('puppeteer-core'); } catch { puppeteer = require('/root/.npm/_npx/110f701c48e68d66/node_modules/puppeteer-core'); }
const prefix = process.argv[2] || 'tools/shots/manual';
const { server, base } = await serve();
const browser = await puppeteer.launch({ executablePath: '/root/.cache/puppeteer/chrome/linux-148.0.7778.97/chrome-linux64/chrome', headless: 'new', protocolTimeout: 600000, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 }); // a desktop: no touch → manual riding
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
page.on('console', (m) => { if (m.type() === 'error' && !/404/.test(m.text())) errs.push(m.text()); });
await page.evaluateOnNewDocument(() => localStorage.setItem('fds_save_v1', JSON.stringify({ v: 1, lvl: 6, cash: 3000, districts: { oldtown: true, downtown: true }, seen: { rideTip: 1 }, onboard: { step: 99 },
  active: 'vespetta', vehicles: { rustbucket: { parts: { engine: 0, suspension: 0, box: 0, tires: 0 }, count: 1 }, vespetta: { parts: { engine: 1, suspension: 0, box: 0, tires: 0 }, count: 1 } } })));
await page.goto(`${base}/index.html?noti=1&clock=600`, { waitUntil: 'networkidle0', timeout: 240000 });
await page.waitForFunction('window.ready', { timeout: 120000 });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ok = (cond, label) => console.log(`${cond ? 'ok  ' : 'FAIL'} ${label}`);
await page.evaluate(() => document.querySelector('.ocard')?.click()); await sleep(300);
await page.evaluate(() => document.querySelector('#startbar .sb-go')?.click()); await sleep(800);
// the first manual ride explains the keys (even though the save has seen the auto-drive tip)
let tipText = '';
for (let i = 0; i < 60 && !tipText; i++) { tipText = await page.evaluate(() => { game.skipTween(); return document.querySelector('.modal.tip')?.textContent || ''; }); if (!tipText) await sleep(200); }
await page.evaluate(() => document.querySelector('.modal.tip [data-x]')?.click()); await sleep(300);
const R = (fn) => page.evaluate(fn);
ok(/gas/.test(tipText) && /brake/.test(tipText), 'the first manual ride shows the keys tip');
ok(await R(() => game.ride.R.manual), 'desktop rides manually');
ok(await R(() => document.querySelector('.r-keys').textContent.includes('gas')), 'key hint shows the pedals');
await R(() => game.sim(2.5));
ok(await R(() => game.ride.R.v < 0.3), 'no gas → the bike waits (v ' + (await R(() => game.ride.R.v.toFixed(2))) + ')');
// the real keys
await page.keyboard.down('KeyW'); await R(() => game.sim(2));
const v1 = await R(() => game.ride.R.v);
ok(v1 > 4, `W accelerates (v ${v1.toFixed(1)} m/s)`);
await page.keyboard.up('KeyW'); await page.keyboard.down('KeyS'); await R(() => game.sim(1.2)); await page.keyboard.up('KeyS');
ok(await R(() => game.ride.R.v < 1), 'S brakes to a stop');
// a rider: gas, brake for corners and red lights, A/D at the first junction to leave the GPS route. Runs in short chunks
// so the arrival scenes (async: modals, the NPC walking up) get the event loop between them.
await R(() => {
  const Rr = game.ride.R;
  window.__rider = { out: { reroutes: 0, laneChange: false, crashes: 0, legs: 0, t: 0, sameDest: true, junctionSeen: false }, lastLeg: Rr.leg, tookTurn: false, triedLane: false };
});
const chunk = () => R(() => {
  const r = game.ride, Rr = r.R, W = window.__rider, out = W.out;
  const dest0 = () => Rr.route.steps[Rr.route.steps.length - 1].tile;
  const blockAhead = () => Rr.hazards.some((h) => !h.done && h.lane >= 0 && ['parked', 'barrier', 'cones'].includes(h.type) && h.s - Rr.s > -4 && h.s - Rr.s < 9);
  document.querySelectorAll('.modal.scene [data-x], .modal.tip [data-x], .modal.pop [data-x], .evdock .opt, .modal.rated, .modal.receipt [data-x]').forEach((b) => { b.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); b.click(); });
  for (let i = 0; i < 20 && Rr.active; i++) {
    if (Rr.phase !== 'ride') { game.sim(0.05); continue; }
    out.t += 0.05;
    if (Rr.leg !== W.lastLeg) { W.lastLeg = Rr.leg; out.legs++; W.tookTurn = false; }
    const L = Rr.light;
    const redAhead = L && L.state !== 'g' && L.d < 14 && L.d > 0.6;
    const brake = Rr.cornerWarn || redAhead;
    r.input('gas', !brake); r.input('brake', !!brake);
    // once: a lane change on a clear stretch (and back further down)
    if (!W.triedLane && !Rr.junc && !Rr.ot && Rr.v > 5) { r.input('left'); W.triedLane = true; out.laneChange = !!(Rr.ot && Rr.ot.manual); }
    // steer round whatever blocks our lane, come back once it's behind us
    if (!Rr.ot && game.manualBlock()) r.input('left');
    else if (Rr.ot && Rr.ot.manual && Rr.ot.t >= 1 && !blockAhead()) r.input('right');
    // once per leg: leave the GPS route at a junction
    if (Rr.junc && !W.tookTurn) {
      out.junctionSeen = true;
      const d0 = dest0(), J = Rr.junc, alt = J.rels.find((x) => x !== J.cur);
      if (alt != null) {
        const before = Rr.route.path.join();
        r.input(alt < J.cur ? 'left' : 'right');
        if (Rr.route.path.join() !== before) { out.reroutes++; if (dest0() !== d0) out.sameDest = false; }
      }
      W.tookTurn = true;
    }
    const c0 = Rr.stats.crashes;
    game.sim(0.05);
    if (Rr.stats.crashes > c0) out.crashes++;
  }
  return { active: Rr.active, phase: Rr.phase, t: out.t, s: Rr.s, len: Rr.route?.length };
});
let st, guard = 0;
do { st = await chunk(); await sleep(st.phase === 'ride' ? 5 : 120); } while (st.active && st.t < 300 && ++guard < 6000);
const report = await R(() => { game.ride.input('gas', false); game.ride.input('brake', false); return { ...window.__rider.out, finished: !game.ride.R.active }; });
console.log(JSON.stringify(report));
ok(report.junctionSeen, 'a junction choice came up');
ok(report.reroutes >= 1 && report.sameDest, 'turning off the GPS route re-routes to the same door');
ok(report.laneChange, 'A moves into the other lane');
ok(report.finished, `the rider finished the job (${report.t.toFixed(0)} s sim, ${report.crashes} crashes)`);
await sleep(500);
await page.screenshot({ path: `${prefix}-end.png` });
console.log('errors', errs.length ? errs : 'none');
await browser.close(); server.close();

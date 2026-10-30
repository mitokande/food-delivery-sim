// Free riding (desktop): the bike waits for the pedals, steers on A/D, brakes and backs up on S, stops at walls instead
// of going through them, the GPS re-plans when the rider leaves its line, and a careful rider finishes a whole job.
//   node tools/manual.mjs [shot-prefix]
import { createRequire } from 'node:module';
import { serve } from './serve.mjs';
const require = createRequire(import.meta.url);
let puppeteer; try { puppeteer = require('puppeteer-core'); } catch { puppeteer = require('/root/.npm/_npx/110f701c48e68d66/node_modules/puppeteer-core'); }
const prefix = process.argv[2] || 'tools/shots/manual';
const { server, base } = await serve();
const browser = await puppeteer.launch({ executablePath: '/root/.cache/puppeteer/chrome/linux-148.0.7778.97/chrome-linux64/chrome', headless: 'new', protocolTimeout: 600000, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 }); // a desktop: no touch → riding yourself
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
page.on('console', (m) => { if (m.type() === 'error' && !/404/.test(m.text())) errs.push(m.text()); });
await page.evaluateOnNewDocument(() => localStorage.setItem('fds_save_v1', JSON.stringify({ v: 1, lvl: 6, cash: 3000, districts: { oldtown: true, downtown: true }, seen: { rideTip: 1, manualTip: 1 }, onboard: { step: 99 },
  settings: { music: 0, sfx: 0, quality: 'low', haptics: false },
  active: 'vespetta', vehicles: { rustbucket: { parts: { engine: 0, suspension: 0, box: 0, tires: 0 }, count: 1 }, vespetta: { parts: { engine: 1, suspension: 0, box: 0, tires: 0 }, count: 1 } } })));
await page.goto(`${base}/index.html?noti=1&energy=off&clock=600`, { waitUntil: 'networkidle0', timeout: 240000 });
await page.waitForFunction('window.ready', { timeout: 120000 });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let fails = 0;
const ok = (cond, label) => { if (!cond) fails++; console.log(`${cond ? 'ok  ' : 'FAIL'} ${label}`); };
const R = (fn, arg) => page.evaluate(fn, arg);
await R(() => document.querySelector('.ocard')?.click()); await sleep(300);
await R(() => document.querySelector('#startbar .sb-go')?.click()); await sleep(800);
// the first free ride explains the keys (even though the save has seen the old tips)
let tipText = '';
for (let i = 0; i < 60 && !tipText; i++) { tipText = await R(() => { game.skipTween(); return document.querySelector('.modal.tip')?.textContent || ''; }); if (!tipText) await sleep(200); }
await R(() => document.querySelector('.modal.tip [data-x]')?.click()); await sleep(300);
ok(/steer/.test(tipText) && /back up/.test(tipText), 'the first free ride shows the keys tip');
ok(await R(() => game.ride.R.manual), 'desktop rides freely');
ok(await R(() => document.querySelector('.r-keys').textContent.includes('steer')), 'key hint shows the steering');
await R(() => game.sim(2.5));
ok(await R(() => game.ride.R.v < 0.3), 'no gas → the bike waits (v ' + (await R(() => game.ride.R.v.toFixed(2))) + ')');
// the real keys
await page.keyboard.down('KeyW'); await R(() => game.sim(1.6));
const v1 = await R(() => game.ride.R.v);
ok(v1 > 4, `W accelerates (v ${v1.toFixed(1)} m/s)`);
const h0 = await R(() => game.ride.F.h);
await page.keyboard.down('KeyA'); await R(() => game.sim(0.6)); await page.keyboard.up('KeyA');
const h1 = await R(() => game.ride.F.h);
const turned = Math.atan2(Math.sin(h1 - h0), Math.cos(h1 - h0));
ok(turned > 0.2, `A steers left (heading +${turned.toFixed(2)} rad)`);
await page.keyboard.down('KeyD'); await R(() => game.sim(0.6)); await page.keyboard.up('KeyD');
const h2 = await R(() => game.ride.F.h);
ok(Math.atan2(Math.sin(h2 - h1), Math.cos(h2 - h1)) < -0.2, 'D steers right');
await page.keyboard.up('KeyW'); await page.keyboard.down('KeyS'); await R(() => game.sim(1.6));
const vStop = await R(() => game.ride.F.fv);
await R(() => game.sim(1.5)); await page.keyboard.up('KeyS');
const vRev = await R(() => game.ride.F.fv);
ok(vRev < -1, `S brakes (${vStop.toFixed(2)} m/s), then held at a stop backs up (${vRev.toFixed(2)} m/s)`);
await R(() => game.sim(1.5));
// a wall: put the bike in front of a building, facing it, and ride at it. It must stop at the wall, never inside it.
const wall = await R(() => {
  const r = game.ride, F = r.F, W = game.world, b0 = r.R.bike.root.position;
  const blds = W.buildings.filter((b) => b.h > 4).sort((a, b) => Math.hypot((a.x0 + a.x1) / 2 - b0.x, (a.z0 + a.z1) / 2 - b0.z) - Math.hypot((b.x0 + b.x1) / 2 - b0.x, (b.z0 + b.z1) / 2 - b0.z));
  const tmp = [];
  for (const b of blds.slice(0, 12)) {
    const cx = (b.x0 + b.x1) / 2, cz = (b.z0 + b.z1) / 2;
    // the four faces: a spot 7 m out, clear of everything, facing the face's middle
    for (const [x, z] of [[cx, b.z0 - 7], [cx, b.z1 + 7], [b.x0 - 7, cz], [b.x1 + 7, cz]]) {
      if (W.hits(x, z, 1.2, tmp).length || W.surface(x, z) === 'grass') continue;
      const fx = Math.sign(cx - x) * (Math.abs(cz - z) < 1 ? 1 : 0), fz = Math.sign(cz - z) * (Math.abs(cx - x) < 1 ? 1 : 0);
      const h = Math.atan2(fx, fz);
      Object.assign(F, { x, z, h, fv: 0, beta: 0, steer: 0 });
      r.R.v = 0; F.gpsT = 99; // keep the GPS still while it's tested
      return { b, x, z, h };
    }
  }
  return null;
});
ok(!!wall, 'found a building to ride at');
if (wall) {
  const c0 = await R(() => game.ride.R.stats.crashes);
  await page.keyboard.down('KeyW');
  let inside = 0;
  for (let i = 0; i < 30; i++) inside += await R((b) => { game.sim(0.1); const F = game.ride.F; return F.x > b.x0 && F.x < b.x1 && F.z > b.z0 && F.z < b.z1 ? 1 : 0; }, wall.b);
  await page.keyboard.up('KeyW');
  const end = await R((b) => { const F = game.ride.F; return { gap: Math.max(b.x0 - F.x, F.x - b.x1, b.z0 - F.z, F.z - b.z1), v: game.ride.R.v, crashes: game.ride.R.stats.crashes, bumps: game.ride.R.stats.bumps }; }, wall.b);
  ok(!inside && end.gap > 0.2, `the bike stops at the wall (${end.gap.toFixed(2)} m from it, never inside)`);
  ok(end.crashes > c0 || end.bumps > 0, `hitting it at speed hurts (crashes ${end.crashes - c0}, bumps ${end.bumps})`);
  await R(() => game.sim(2.2)); // the crash wears off
}
// off the GPS line: the route is re-planned from where the bike is, to the same door
const gps = await R(() => {
  const r = game.ride, R0 = r.R, F = r.F;
  const dest = R0.route.steps[R0.route.steps.length - 1].tile, n0 = R0.stats.reroutes;
  // somewhere a few blocks away, on a road
  const roads = game.city.tiles.filter((t) => t.k === 1 && t.piece === 'straight' && Math.hypot(t.x * 10 - F.x, t.z * 10 - F.z) > 60 && Math.hypot(t.x * 10 - F.x, t.z * 10 - F.z) < 120);
  const t = roads[0];
  const horiz = (t.mask & 0b1010) === 0b1010;
  Object.assign(F, { x: t.x * 10, z: t.z * 10 + (horiz ? 1.6 : 0), h: horiz ? -Math.PI / 2 : 0, fv: 0, beta: 0 });
  R0.v = 0; F.gpsT = 0;
  for (let i = 0; i < 20; i++) game.sim(0.05);
  const st = R0.route.steps;
  return { rerouted: R0.stats.reroutes > n0, same: st[st.length - 1].tile === dest, from: game.world.routeTile(F.x, F.z), first: st[0].tile, s: R0.s };
});
ok(gps.rerouted && gps.same, `leaving the GPS line re-plans the route to the same door (from tile ${gps.first}, bike on ${gps.from})`);
// a careful rider (ride.bot) finishes the job from here. Short chunks so the arrival scenes (async) get the event loop.
await R(() => { window.__rider = { t: 0, legs: 0, lastLeg: game.ride.R.leg, crashes: 0, scenes: [] }; });
const chunk = () => R(() => {
  const r = game.ride, Rr = r.R, W = window.__rider;
  const sc = document.querySelector('.modal.scene:not(.out)');
  if (sc && !sc.__seen) {
    sc.__seen = true;
    const leg = Rr.job.legs[Rr.leg], L = game.city.lots[leg.lot], b = Rr.bike.root.position;
    const d = L.doorPos || [game.city.tiles[L.door].x * 10, game.city.tiles[L.door].z * 10];
    W.scenes.push({ kind: leg.kind, dist: Math.hypot(b.x - d[0], b.z - d[1]) });
  }
  document.querySelectorAll('.modal.scene [data-x], .modal.tip [data-x], .modal.pop [data-x], .evdock .opt, .modal.rated, .modal.receipt [data-x]').forEach((b) => { b.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); b.click(); });
  for (let i = 0; i < 20 && Rr.active; i++) {
    if (Rr.phase !== 'ride') { game.sim(0.05); continue; }
    W.t += 0.05;
    if (Rr.leg !== W.lastLeg) { W.lastLeg = Rr.leg; W.legs++; }
    r.bot();
    const c0 = Rr.stats.crashes;
    game.sim(0.05);
    if (Rr.stats.crashes > c0) W.crashes++;
  }
  return { active: Rr.active, phase: Rr.phase, t: W.t, s: Rr.s, len: Rr.route?.length };
});
let st, guard = 0;
do { st = await chunk(); await sleep(st.phase === 'ride' ? 5 : 120); } while (st.active && st.t < 400 && ++guard < 8000);
const report = await R(() => { for (const k of ['gas', 'brake', 'left', 'right']) game.ride.input(k, false); return { ...window.__rider, finished: !game.ride.R.active, stats: game.ride.R.stats }; });
console.log(JSON.stringify({ t: report.t.toFixed(0), crashes: report.crashes, scenes: report.scenes, stats: report.stats }));
ok(report.scenes.length >= 2 && report.scenes.every((s) => s.dist < 14), `pickup and drop scenes at their doors (${report.scenes.map((s) => `${s.kind} ${s.dist.toFixed(1)} m`).join(', ')})`);
ok(report.finished, `the rider finished the job (${report.t.toFixed(0)} s sim, ${report.crashes} crashes)`);
await sleep(500);
await page.screenshot({ path: `${prefix}-end.png` });
ok(!errs.length, 'no errors' + (errs.length ? ': ' + errs.slice(0, 5).join(' | ') : ''));
await browser.close(); server.close();
process.exit(fails ? 1 : 0);

// Map drag on a phone (both games' hub camera, js/hub.js): the ground under the finger stays under it, a flick glides
// and stops, a finger that stops before lifting doesn't glide; in idle.html the open tab's icon closes and opens the sheet.
//   node tools/pan.mjs [outdir]
import { createRequire } from 'node:module';
import { serve } from './serve.mjs';
const require = createRequire(import.meta.url);
let puppeteer;
try { puppeteer = require('puppeteer-core'); } catch { puppeteer = require('/root/.npm/_npx/110f701c48e68d66/node_modules/puppeteer-core'); }
const CHROME = process.env.CHROME || '/root/.cache/puppeteer/chrome/linux-148.0.7778.97/chrome-linux64/chrome';
const OUT = process.argv[2] || new URL('./shots', import.meta.url).pathname;
const { server, base } = await serve();
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const check = (ok, what) => { console.log(ok ? 'ok  ' : 'FAIL', what); if (!ok) process.exitCode = 1; };

async function open(url) {
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${base}/${url}`, { waitUntil: 'networkidle0', timeout: 180000 });
  await page.waitForFunction('window.ready', { timeout: 90000, polling: 200 });
  await page.evaluate(() => document.querySelectorAll('#modals .modal').forEach((m) => m.remove()));
  await wait(1500);
  return { page, errors };
}
// where a ground point is on screen now
const screenOf = (page, x, z) => page.evaluate(([x, z]) => { const v = game.camera.position.clone().set(x, 0, z).project(game.camera); return [(v.x + 1) / 2 * innerWidth, (1 - v.y) / 2 * innerHeight]; }, [x, z]);
// a touch drag in steps of `ms`; `hold` ms still before lifting
async function drag(page, [x0, y0], [dx, dy], { steps = 12, ms = 30, hold = 0 } = {}) {
  await page.touchscreen.touchStart(x0, y0);
  for (let i = 1; i <= steps; i++) { await page.touchscreen.touchMove(x0 + dx * i / steps, y0 + dy * i / steps); await wait(ms); }
  if (hold) await wait(hold);
  await page.touchscreen.touchEnd();
}
const camAt = (page) => page.evaluate(() => [game.hubCam.st.x, game.hubCam.st.z]);

async function panChecks(name, url, y0) {
  const { page, errors } = await open(url);
  const [cx, cz] = await camAt(page);
  // the ground point under where the finger lands
  const start = [195, y0];
  const P = await page.evaluate(([sx, sy]) => {
    // (find the ground under a pixel by stepping the projection: good to a fraction of a metre)
    const c = game.camera, v = c.position.clone();
    let best = null, bd = 1e9;
    const st = game.hubCam.st;
    for (let x = st.x - 300; x <= st.x + 300; x += 4) for (let z = st.z - 300; z <= st.z + 300; z += 4) {
      v.set(x, 0, z).project(c); const px = (v.x + 1) / 2 * innerWidth, py = (1 - v.y) / 2 * innerHeight, d = (px - sx) ** 2 + (py - sy) ** 2;
      if (d < bd) { bd = d; best = [x, z]; }
    }
    return best;
  }, start);
  const s0 = await screenOf(page, P[0], P[1]);
  await drag(page, start, [-90, -140], { hold: 250 });
  await wait(600);
  const s1 = await screenOf(page, P[0], P[1]);
  const err = Math.hypot(s1[0] - (s0[0] - 90), s1[1] - (s0[1] - 140));
  check(err < 6, `${name}: the ground stays under the finger (off by ${err.toFixed(1)} px)`);
  const [ax, az] = await camAt(page);
  await wait(500);
  const [bx, bz] = await camAt(page);
  check(Math.hypot(bx - ax, bz - az) < 0.5, `${name}: a finger that stopped doesn't glide`);
  check(Math.hypot(ax - cx, az - cz) > 20, `${name}: the map moved (${Math.hypot(ax - cx, az - cz).toFixed(0)} m)`);
  // a flick: glides on, then stops. (Headless frames take most of a second and the touchscreen's events arrive one a
  // frame, stamped late: the flick is synthetic pointer events 16 ms apart, sent in one go.)
  await page.evaluate((y0) => {
    const el = game.renderer.domElement, ev = (type, y) => el.dispatchEvent(new PointerEvent(type, { pointerId: 7, pointerType: 'touch', clientX: 195, clientY: y, bubbles: true }));
    const spin = (ms) => { const t = performance.now(); while (performance.now() - t < ms); };
    ev('pointerdown', y0);
    for (let i = 1; i <= 5; i++) { spin(16); ev('pointermove', y0 + 32 * i); }
    spin(10); ev('pointerup', y0 + 160);
  }, y0);
  const [fx, fz] = await camAt(page);
  await wait(400);
  const [gx, gz] = await camAt(page);
  // (the game's frames are capped at 50 ms, so a headless second is a fraction of one: run the camera at 60 fps instead)
  const [hx, hz] = await page.evaluate(() => { for (let i = 0; i < 150; i++) game.hubCam.update(1 / 60); return [game.hubCam.st.x, game.hubCam.st.z]; });
  const [ix, iz] = await page.evaluate(() => { for (let i = 0; i < 30; i++) game.hubCam.update(1 / 60); return [game.hubCam.st.x, game.hubCam.st.z]; });
  check(Math.hypot(gx - fx, gz - fz) > 5, `${name}: a flick glides on (${Math.hypot(gx - fx, gz - fz).toFixed(0)} m)`);
  check(Math.hypot(ix - hx, iz - hz) < 0.5, `${name}: and stops within 2.5 s`);
  check(!errors.length, `${name}: no page errors ${errors.join(' | ')}`);
  return page;
}

await panChecks('courier game', 'index.html?noti', 300);
const page = await panChecks('idle', 'idle.html?fresh&noti', 250);
// the sheet: the open tab's icon closes it, again opens it; another tab opens on that tab
const state = () => page.evaluate(() => [document.getElementById('sheet').dataset.state, document.querySelector('.tabs .on')?.dataset.tab || null]);
check(JSON.stringify(await state()) === '["mid","kitchens"]', 'idle: sheet open on Kitchens');
await page.tap('.tabs [data-tab="kitchens"]'); await wait(500);
check(JSON.stringify(await state()) === '["closed",null]', 'idle: Kitchens icon closes it');
await page.screenshot({ path: `${OUT}/pan-closed.png` });
await page.tap('.tabs [data-tab="kitchens"]'); await wait(500);
check(JSON.stringify(await state()) === '["mid","kitchens"]', 'idle: and opens it again');
await page.tap('.tabs [data-tab="kitchens"]'); await wait(400);
await page.tap('.tabs [data-tab="deals"]'); await wait(500);
check(JSON.stringify(await state()) === '["mid","deals"]', 'idle: closed, another icon opens on that tab');
await page.tap('.tabs [data-tab="couriers"]'); await wait(400);
check(JSON.stringify(await state()) === '["mid","couriers"]', 'idle: open, another icon switches tab');
// a kitchen tapped on the map with the sheet closed cooks and leaves it closed
await page.tap('.tabs [data-tab="couriers"]'); await wait(400);
await page.evaluate(() => game.focusDistrict('oldtown')); await wait(2000);
const mk = await page.evaluate(() => { const el = document.querySelector('.mk.ik:not(.dim)'); const r = el.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; });
await page.touchscreen.tap(mk[0], mk[1]); await wait(300);
check((await state())[0] === 'closed' && await page.evaluate(() => game.G.taps >= 1), 'idle: a kitchen tapped on the map cooks, the sheet stays closed');
await page.screenshot({ path: `${OUT}/pan-idle.png` });
await browser.close(); server.close();

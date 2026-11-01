// The ride's pause menu (MIT-9), on a phone: the HUD's pause button stops the ride where it is (Resume / Settings /
// Cancel order), a hidden page pauses itself and comes back to the menu, Esc / P and Android's back open it, a pause
// asked for at a door waits for the next street, and cancelling gives the ⚡ back, costs a little rating and goes
// back to the hub without a receipt. Analytics is forced on to see the pause / ride_cancel events leave.
//   node tools/pause.mjs [shot-prefix]
import { createRequire } from 'node:module';
import { serve } from './serve.mjs';
const require = createRequire(import.meta.url);
let puppeteer; try { puppeteer = require('puppeteer-core'); } catch { puppeteer = require('/root/.npm/_npx/110f701c48e68d66/node_modules/puppeteer-core'); }
const prefix = process.argv[2] || 'tools/shots/pause';
// (the first-time hints that slow time down are marked seen)
const SAVE = { v: 1, lvl: 3, cash: 200, xp: 0, districts: { oldtown: true }, stats: { deliveries: 10 }, onboard: { step: 99 }, ratings: [5, 5, 5, 5],
  seen: { privacy: 1, lbTip_run2: 1, brakeTip: 1, rideTip2: 1, energyTip: 1, c_run_hop: 1, c_run_lane: 1, c_run_red: 1, c_run_onc: 1, c_run_coins: 1, c_run_light: 1 },
  energy: { n: 5, t: Date.now(), cups: null }, settings: { music: 0, sfx: 0, quality: 'low', haptics: false } };

const { server, base } = await serve();
const browser = await puppeteer.launch({ executablePath: '/root/.cache/puppeteer/chrome/linux-148.0.7778.97/chrome-linux64/chrome', headless: 'new', protocolTimeout: 900000,
  args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let fails = 0;
const ok = (c, label) => { if (!c) fails++; console.log(`${c ? 'ok  ' : 'FAIL'} ${label}`); };

const page = await browser.newPage();
await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
const errs = [], sent = [];
page.on('pageerror', (e) => errs.push(e.message));
page.on('console', (m) => { if (m.type() === 'error' && !/404|Failed to load resource/.test(m.text())) errs.push(m.text()); });
page.on('request', (r) => { if (r.url().includes('collect.php')) try { for (const e of JSON.parse(r.postData()).ev) sent.push(e); } catch { /* not a batch */ } });
await page.evaluateOnNewDocument((s) => { if (!sessionStorage.getItem('seeded')) { sessionStorage.setItem('seeded', 1); localStorage.setItem('fds_save_v1', s); } }, JSON.stringify(SAVE));
await page.evaluateOnNewDocument(() => { navigator.sendBeacon = () => false; }); // (analytics falls back to fetch, whose body the test can read)
await page.goto(`${base}/index.html?noti=1&clock=600&an=force`, { waitUntil: 'networkidle0', timeout: 240000 });
await page.waitForFunction('window.ready', { timeout: 120000 });
const R = (fn, arg) => page.evaluate(fn, arg);
const state = () => R(() => ({ paused: game.paused, mode: game.mode, phase: game.ride.R.phase, t: game.ride.R.rideTime, s: game.ride.R.s,
  menu: !!document.querySelector('.modal.pause:not(.out)'), top: [...document.querySelectorAll('#modals .modal:not(.out)')].pop()?.className || '' }));
const setHidden = (h) => R((h) => {
  for (const [k, v] of [['hidden', h], ['visibilityState', h ? 'hidden' : 'visible']]) Object.defineProperty(document, k, { configurable: true, get: () => v });
  document.dispatchEvent(new Event('visibilitychange'));
}, h);
const flushAn = async () => { await setHidden(true); await setHidden(false); await sleep(1500); }; // (a hide sends what's queued)

// a job near the bike, ridden a little
const e0 = await R(() => game.St.S.energy.n);
await R(async () => {
  const { makeOrder } = await import('./js/orders.js');
  const o = makeOrder(game.city, Math.random, { from: game.St.S.pos });
  game.board.push(o); game.taken = [o]; game.startJob();
});
await page.waitForFunction(() => { game.skipTween(); return game.mode === 'ride' && game.ride.R.phase === 'ride'; }, { timeout: 60000, polling: 100 });
ok((await R(() => game.St.S.energy.n)) === e0 - 1, `the job took ⚡1 (${e0} → ${e0 - 1})`);
await R(() => { for (let i = 0; i < 40; i++) { game.ride.schemeBot(); game.sim(0.05); } });
await sleep(800);

// 1. the button pauses: nothing moves on while the menu is up
ok(await R(() => !!document.querySelector('#ridehud:not([hidden]) .r-pause')), 'the ride HUD has a pause button');
await page.tap('.r-pause'); await sleep(400);
let a = await state();
ok(a.paused && a.menu, 'tapping it pauses and opens the menu');
ok(await R(() => [...document.querySelectorAll('.modal.pause [data-x]')].map((b) => b.dataset.x).join()) === 'close,settings,drop', 'Resume / Settings / Cancel order');
await page.screenshot({ path: `${prefix}-menu.png` });
await sleep(1500);
let b = await state();
ok(b.t === a.t && b.s === a.s, `the ride stands still under it (ride time ${a.t.toFixed(2)} → ${b.t.toFixed(2)} s, ${a.s.toFixed(1)} → ${b.s.toFixed(1)} m)`);

// 2. Settings opens over the menu and closes back to it
await page.click('.modal.pause [data-x="settings"]'); await sleep(400);
ok((await state()).top.includes('settings'), 'Settings opens over the pause menu');
await page.click('.modal.settings [data-x="close"]'); await sleep(400);
b = await state();
ok(b.paused && b.top.includes('pause'), 'closing it leaves the ride paused, the menu on top');

// 3. Resume: the ride goes on
await page.click('.modal.pause [data-x="close"]'); await sleep(1500);
b = await state();
ok(!b.paused && !b.menu && b.t > a.t, `Resume closes the menu and the ride goes on (ride time ${a.t.toFixed(2)} → ${b.t.toFixed(2)} s)`);

// 4. a hidden page pauses itself and comes back to the menu
await setHidden(true); await sleep(200);
a = await state();
ok(a.paused && a.menu, 'hiding the page pauses the ride');
await setHidden(false); await sleep(1200);
b = await state();
ok(b.paused && b.menu && b.t === a.t, 'coming back shows the menu, the ride still where it was');
await page.click('.modal.pause [data-x="close"]'); await sleep(300);

// 5. Esc / P on a keyboard, Android's back ('appback' from js/native.js)
await page.keyboard.press('Escape'); await sleep(300);
ok((await state()).paused, 'Esc pauses');
await page.keyboard.press('KeyP'); await sleep(300);
ok(!(await state()).paused, 'P resumes');
const backTaken = await R(() => !dispatchEvent(new Event('appback', { cancelable: true })));
await sleep(300);
ok(backTaken && (await state()).paused, "Android's back opens the menu in a ride (instead of sending the app away)");
await page.click('.modal.pause [data-x="close"]'); await sleep(300);

// 6. at a door: the pause waits for the next street
await R(() => { for (let i = 0; i < 4000 && game.ride.R.phase === 'ride'; i++) { if (game.ride.R.event && !game.ride.R.event.fired) game.ride.R.event = null; game.ride.schemeBot(); game.sim(0.05); } });
a = await state();
if (a.phase === 'scene') {
  await R(() => game.pause('button')); await sleep(200);
  ok(!(await state()).paused, 'at the restaurant door the pause waits');
  await page.waitForFunction(() => { game.sim(0.1); return game.ride.R.phase === 'ride'; }, { timeout: 60000, polling: 200 });
  await sleep(500);
  b = await state();
  ok(b.paused && b.menu, 'and comes as soon as the ride goes on');
} else ok(false, `the ride reached the restaurant (phase ${a.phase})`);

// 7. Cancel order: asked twice, ⚡ back, a small rating hit, the hub, no receipt
const before = await R(() => ({ e: game.St.S.energy.n, r: game.St.S.ratings.slice(), cash: game.St.S.cash, del: game.St.S.stats.deliveries }));
if (!(await state()).paused) await page.tap('.r-pause');
await sleep(300);
await page.click('.modal.pause [data-x="drop"]'); await sleep(300);
const confirmText = await R(() => document.querySelector('.modal.pause .card').textContent.replace(/\s+/g, ' ').trim());
ok(/Cancel the order\?/.test(confirmText) && /1 back/.test(confirmText) && !!(await page.$('.modal.pause [data-x="really"]')), `it asks first: "${confirmText.slice(0, 90)}…"`);
await page.screenshot({ path: `${prefix}-cancel.png` });
await page.click('.modal.pause [data-x="really"]');
await page.waitForFunction(() => { game.skipTween(); return game.mode === 'hub'; }, { timeout: 60000, polling: 100 });
await sleep(600);
const after = await R(() => ({ e: game.St.S.energy.n, r: game.St.S.ratings.slice(), cash: game.St.S.cash, del: game.St.S.stats.deliveries, paused: game.paused,
  receipt: !!document.querySelector('.modal.receipt'), modals: document.querySelectorAll('#modals .modal:not(.out)').length, toast: document.querySelector('#toasts')?.textContent || '' }));
ok(after.e === before.e + 1 && after.e === e0, `the ⚡ came back (${before.e} → ${after.e})`);
ok(after.r.length === before.r.length + 1 && after.r.at(-1) === 2, `a small rating hit: a 2★ joins the last ratings (${before.r.join('')} → ${after.r.join('')})`);
ok(after.cash === before.cash && after.del === before.del, `nothing paid or charged, no delivery counted ($${before.cash} → $${after.cash})`);
ok(!after.receipt && !after.paused && after.modals === 0, 'back in the hub, no receipt, not paused');
ok(/cancelled/i.test(after.toast), `a toast says so ("${after.toast.trim()}")`);
await page.screenshot({ path: `${prefix}-hub.png` });

// 8. in the hub nothing pauses; analytics
ok(await R(() => dispatchEvent(new Event('appback', { cancelable: true }))), "in the hub the back button is the app's again");
await setHidden(true); await setHidden(false); await sleep(200);
ok(!(await state()).paused, 'hiding the page in the hub pauses nothing');
await flushAn();
const pauses = sent.filter((e) => e.n === 'pause').map((e) => e.p.why), cancels = sent.filter((e) => e.n === 'ride_cancel');
ok(['button', 'hidden', 'key', 'back'].every((w) => pauses.includes(w)), `pause events sent: ${pauses.join(', ')}`);
ok(cancels.length === 1 && cancels[0].p.n === 1 && cancels[0].p.energy === 1 && cancels[0].p.picked === 1, `ride_cancel sent: ${JSON.stringify(cancels[0]?.p)}`);

ok(!errs.length, errs.length ? 'errors: ' + errs.join(' | ') : 'no errors');
console.log(fails ? `\n${fails} failed` : '\nall ok');
await browser.close(); server.close();
process.exit(fails ? 1 : 0);

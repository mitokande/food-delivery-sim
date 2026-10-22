// D2 UI check: ride with food on board + flow + a context button, rating card, level-up card, pickup card,
// receipt mid-animation + coins in flight, toasts, intro.
//   node tools/d2shots.mjs [prefix]
import { createRequire } from 'node:module';
import { serve } from './serve.mjs';
const require = createRequire(import.meta.url);
let puppeteer; try { puppeteer = require('puppeteer-core'); } catch { puppeteer = require('/root/.npm/_npx/110f701c48e68d66/node_modules/puppeteer-core'); }
const prefix = process.argv[2] || 'tools/shots/d2';
const { server, base } = await serve();
const browser = await puppeteer.launch({ executablePath: '/root/.cache/puppeteer/chrome/linux-148.0.7778.97/chrome-linux64/chrome', headless: 'new', protocolTimeout: 600000, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage();
await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
page.on('pageerror', (e) => console.log('pageerror', e.message));
await page.goto(`${base}/index.html?noti=1&clock=990`, { waitUntil: 'networkidle0', timeout: 240000 });
await page.waitForFunction('window.ready', { timeout: 120000 });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
await sleep(1500);
await page.evaluate(() => { game.hubCam?.snap?.(0, 0); });
await page.screenshot({ path: `${prefix}-hub.png` });
await page.evaluate(() => document.querySelector('.ocard')?.click()); await sleep(300);
await page.evaluate(() => document.querySelector('#startbar .sb-go')?.click()); await sleep(600);
await page.evaluate(() => { game.skipTween(); document.querySelector('.modal.tip [data-x]')?.click(); }); await sleep(600);
// ride until the food is on board, then fake a flow combo and a context button
for (let i = 0; i < 40; i++) {
  const st = await page.evaluate(() => { document.querySelectorAll('.modal.tip [data-x], .modal.scene [data-x]').forEach((b) => b.click()); game.sim(1); const R = game.ride.R; return R.orders.some((x) => x.picked) ? 'picked' : R.phase; });
  if (st === 'picked') break;
}
await page.evaluate(() => { document.querySelectorAll('.modal').forEach((m) => m.remove()); const R = game.ride.R; R.flow = Object.assign(R.flow || {}, { n: 4, mult: 1.6, t: 4.5 }); game.sim(0.2);
  document.querySelector('.r-ctx').innerHTML = '<button class="ctx risky"><img class="ic" src="assets/icons/ui-traffic-light.webp">Run it!</button>'; });
await sleep(1200);
await page.screenshot({ path: `${prefix}-ride.png` });
await page.evaluate(() => { game.ui.rated({ name: 'Hugo' }, { stars: 5, pay: 13, bonus: 1.95, tip: 5.8, early: true, flow: 1.6, cond: 96 }); });
await sleep(900);
await page.screenshot({ path: `${prefix}-rated.png` });
await page.evaluate(() => { document.querySelectorAll('.modal').forEach((m) => m.remove()); game.ui.levelUp(8, ['Express orders', 'Viper 600 in the Garage']); });
await sleep(900);
await page.screenshot({ path: `${prefix}-level.png` });
// pickup card, then a receipt caught mid-celebration and its coins mid-flight
await page.evaluate(() => { document.querySelectorAll('.modal').forEach((m) => m.remove()); const o = game.ride.R.orders[0].o; game.ui.pickup([o], game.ride.R); });
await sleep(700);
await page.screenshot({ path: `${prefix}-pickup.png` });
await page.evaluate(() => { document.querySelectorAll('.modal').forEach((m) => m.remove());
  game.ui.receipt({ lines: [{ label: 'Sunny Burger → Hugo ★★★★★', amount: 14.95 }, { label: 'Tip from Hugo', amount: 5.8, cls: 'pos' }, { label: 'Fuel (0.39 km)', amount: -0.4, cls: 'neg' }], total: 20.35, xp: 42, avgStars: 5, goals: '' }); });
await sleep(700);
await page.screenshot({ path: `${prefix}-receipt-mid.png` });
await sleep(1500);
await page.evaluate(() => document.querySelector('.modal.receipt [data-x]').click());
await sleep(320);
await page.screenshot({ path: `${prefix}-coins.png` });
// toasts + settings
await page.evaluate(() => { document.querySelectorAll('.modal').forEach((m) => m.remove()); game.ui.toast('Contract goal done — claim it on the City tab', 'good'); game.ui.toast('+$42 from your fleet', ''); });
await sleep(400);
await page.screenshot({ path: `${prefix}-toast.png` });
// a fresh player sees the intro
const ctx2 = await browser.createBrowserContext(); const p2 = await ctx2.newPage();
await p2.setViewport({ width: 390, height: 844, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
await p2.goto(`${base}/index.html`, { waitUntil: 'networkidle0', timeout: 240000 });
await p2.waitForFunction('window.ready', { timeout: 120000 }); await sleep(1500);
await p2.screenshot({ path: `${prefix}-intro.png` });
await p2.evaluate(() => { for (let i = 0; i < 3; i++) document.querySelector('#intro [data-i="next"]')?.click(); }); await sleep(600);
await p2.screenshot({ path: `${prefix}-intro-pick.png` });
await browser.close(); server.close();
console.log('done');

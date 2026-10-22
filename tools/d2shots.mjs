// D2 UI check: ride with food on board + flow + a context button, rating card, level-up card, hub markers.
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
await browser.close(); server.close();
console.log('done');

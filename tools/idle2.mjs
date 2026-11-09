// Headless check of Hot Chain (idle2.html): welcome, the day running, orders and couriers on the map, purchases in
// each tab, the stuck banner, the end of the day, replay, save + reload.
//   node tools/idle2.mjs [outdir=tools/shots]   (phone viewport; screenshots idle2-*.png)
import { createRequire } from 'node:module';
import { serve } from './serve.mjs';
const require = createRequire(import.meta.url);
let puppeteer;
try { puppeteer = require('puppeteer-core'); } catch { puppeteer = require('/root/.npm/_npx/110f701c48e68d66/node_modules/puppeteer-core'); }
const CHROME = process.env.CHROME || '/root/.cache/puppeteer/chrome/linux-148.0.7778.97/chrome-linux64/chrome';
const OUT = process.argv[2] || new URL('./shots', import.meta.url).pathname;
const { server, base } = await serve();
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage();
await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error' && !m.text().startsWith('Failed to load resource')) errors.push(m.text()); });
page.on('response', (r) => { if (r.status() >= 400 && !/fonts\.g|favicon/.test(r.url())) errors.push(`${r.status()} ${r.url()}`); });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const shot = async (n) => { await wait(700); await page.screenshot({ path: `${OUT}/idle2-${n}.png` }); console.log('shot', n); };
const ev = (js) => page.evaluate(js);
const check = (ok, what) => { console.log(ok ? 'ok  ' : 'FAIL', what); if (!ok) process.exitCode = 1; };
const boot = async (url) => { await page.goto(`${base}/${url}`, { waitUntil: 'networkidle0', timeout: 180000 }); await page.waitForFunction('window.ready', { timeout: 90000, polling: 200 }); };
const simT = () => ev('game.G.t');

await boot('idle2.html?fresh&speed=6');
await page.waitForSelector('.modal .btn', { timeout: 10000 });
await shot('0-welcome');
const t0 = await simT(); await wait(1500);
check(await simT() === t0, 'the day waits under the welcome card');
await page.click('.modal [data-x="ok"]');
await page.waitForFunction('game.G.stats.deliveries >= 2', { timeout: 60000, polling: 250 });
check(await ev('game.G.t > 5'), `the day runs (t=${(await simT()).toFixed(0)} s)`);
check(await ev('document.querySelectorAll(".mk.pin").length > 0 || game.G.stats.deliveries > 0'), 'orders show at the doors');
check(await ev('[...game.bikes.values()].some((b) => b.bike && b.bike.root.visible)'), 'a courier bike is on the map');
check(await ev('!!document.querySelector(".mk.ck .shelf")'), 'the kitchen marker shows its shelf');
check(await ev('document.querySelector(".neckb").textContent.length > 5'), `the banner says something: "${await ev('document.querySelector(".neckb").textContent')}"`);
await shot('1-running');

// purchases from the Kitchens tab
await ev('game.G.cash = 5000');
const cooks = await ev('game.G.kit.sunny.cooks');
await page.click('.kcard[data-id="sunny"] [data-act="cook"]'); await wait(200);
check(await ev('game.G.kit.sunny.cooks') === cooks + 1, 'a cook bought');
await page.click('.kcard[data-id="sultan"] [data-act="partner"]'); await wait(300);
check(await ev('!!game.G.kit.sultan'), 'Sultan Döner partnered');
await page.click('.kcard[data-id="sunny"] [data-act="promo"]'); await wait(200);
check(await ev('game.G.kit.sunny.promo') === 1, 'a promo bought');
await page.click('.kcard[data-id="sunny"] [data-act="lamp"]'); await wait(200);
check(await ev('game.G.kit.sunny.lamp'), 'a heat lamp bought');
await shot('2-kitchens');
// the Couriers tab: hire, bags, the stand (spots appear on the map)
await page.click('.tabs [data-tab="fleet"]'); await wait(300);
const n0 = await ev('game.G.couriers.length');
await page.click('[data-act="hire"][data-id="vespetta"]'); await wait(200);
check(await ev('game.G.couriers.length') === n0 + 1 && await ev('game.G.couriers.at(-1).veh') === 'vespetta', 'a Vespetta courier hired');
await page.click('[data-act="bags"]'); await wait(200);
check(await ev('game.G.bags'), 'thermal bags bought');
check(await ev('document.querySelectorAll(".mk.spot").length') >= 2, 'stand spots show on the map');
await ev('document.querySelector(".mk.spot").click()'); await wait(300); // (the spot may sit under the sheet)
check(await ev('game.G.stand !== "garage"'), `the stand moved (${await ev('game.G.stand')})`);
await shot('3-couriers');
// the banner leads somewhere
await page.click('.tabs [data-tab="day"]'); await wait(300);
await shot('4-day');
await page.click('.neckb'); await wait(300);
check(await ev('game.ui.tab') !== 'day' || await ev('document.querySelector(".neckb").classList.contains("ok")'), `the banner opens a tab (${await ev('game.ui.tab')})`);
// tab icon toggles the sheet
const tb = await ev('game.ui.tab');
await page.click(`.tabs [data-tab="${tb}"]`); await wait(300);
check(await ev('!game.ui.open'), 'the open tab icon closes the sheet');
await shot('5-map');
await page.click('.tabs [data-tab="kitchens"]'); await wait(300);

// save + reload keeps the day
await ev('game.save()');
const tSaved = await simT();
await boot('idle2.html?speed=6');
check(await ev('game.G.t') >= tSaved - 0.01 && await ev('!!game.G.kit.sultan'), 'reload keeps the day');
check(await ev('!document.querySelector(".modal")'), 'no welcome card on a returning visit');

// closing time
await ev('game.G.stats.hot = 180; game.G.t = 898');
await page.waitForSelector('.modal.end', { timeout: 30000 });
check(await ev('game.G.done'), 'the day ends at 22:00');
check(await ev('document.querySelectorAll(".modal.end .es.on").length') === 2, '180 hot = two stars');
await shot('6-end');
await page.click('.modal [data-x="again"]'); await wait(800);
check(await ev('!game.G.done && game.G.t < 20 && !game.G.kit.sultan && game.G.best >= 180'), 'a new day starts, the best day is kept');

check(!errors.length, `no errors${errors.length ? ': ' + errors.slice(0, 5).join(' | ') : ''}`);
await browser.close(); server.close();

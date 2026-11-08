// Headless check of the idle mode (idle.html): a fresh start, taps, purchases, each tab, offline earnings, a franchise.
//   node tools/idle.mjs [outdir=tools/shots]   (phone viewport; screenshots idle-*.png)
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
const shot = async (n) => { await wait(700); await page.screenshot({ path: `${OUT}/idle-${n}.png` }); console.log('shot', n); };
const ev = (js) => page.evaluate(js);
const check = (ok, what) => { console.log(ok ? 'ok  ' : 'FAIL', what); if (!ok) process.exitCode = 1; };
const boot = async (url) => { await page.goto(`${base}/${url}`, { waitUntil: 'networkidle0', timeout: 180000 }); await page.waitForFunction('window.ready', { timeout: 90000, polling: 200 }); };

await boot('idle.html?fresh');
await page.waitForSelector('.modal .btn', { timeout: 10000 });
await shot('0-welcome');
await page.click('.modal [data-x="ok"]');
await wait(400);
// tap Sunny Burger a few times: batches pay
for (let i = 0; i < 4; i++) { await page.click('.irow[data-id="sunny"] .cookb'); await wait(1150); }
const c1 = await ev('game.G.cash');
check(c1 >= 2.5, `taps paid (about $1 a batch) (got ${c1.toFixed(2)})`);
const taps = await ev('game.G.taps'); check(taps >= 3, `taps counted (${taps})`);
await page.click('.goalpill'); await wait(300);
check(await ev('game.G.quest') === 1, 'first goal claimed');
await shot('1-tapped');
// level up with the cash
await ev('game.G.cash = 2000');
await page.click('.irow[data-id="sunny"] [data-act="lvl"]'); await wait(200);
check(await ev('game.E.level(game.G, "sunny")') === 2, 'level bought');
await page.click('.irow[data-id="sultan"] [data-act="partner"]'); await wait(200);
check(await ev('game.E.level(game.G, "sultan")') === 1, 'Sultan Döner partnered');
await page.click('[data-act="amt"]'); await wait(100);
await page.click('.irow[data-id="sunny"] [data-act="lvl"]'); await wait(200);
check(await ev('game.E.level(game.G, "sunny")') === 12, '×10 bought (level 12)');
await shot('2-cold'); // 12 sunny levels × 2 orders: one courier can't carry them
check(await ev('game.E.ratio(game.G, "oldtown", true) < 1'), 'couriers are the bottleneck now');
await page.click('.tabs [data-tab="couriers"]'); await wait(300);
await page.click('[data-act="hire"]'); await wait(200);
check(await ev('game.G.dist.oldtown.n') > 1, 'couriers hired');
await page.click('.row.mgr [data-act="mgr"]'); await wait(300);
check(await ev('!!game.G.dist.oldtown.mgr'), 'manager hired');
await wait(2500);
check(await ev('game.E.cooking(game.G, "sunny") && game.E.cooking(game.G, "sultan")'), 'the manager keeps the kitchens cooking');
await shot('3-couriers');
await page.click('.row.mgr [data-act="surge"]'); await wait(300);
check(await ev('game.G.dist.oldtown.mgr.surgeUntil > Date.now()'), 'surge on');
// deals + office
await ev('game.G.cash = 5e5'); await page.click('.tabs [data-tab="deals"]'); await wait(300);
await shot('4-deals');
await page.click('.row.deal [data-act="deal"]'); await wait(200);
check(await ev('Object.keys(game.G.deals).length') === 1, 'deal signed');
// a new district from its chip
await ev('game.G.cash = 1e6'); await page.click('.tabs [data-tab="kitchens"]'); await wait(300);
await page.click('[data-act="unlock"][data-id="downtown"]'); await page.waitForSelector('.modal [data-x="ok"]'); await wait(300);
await shot('5-unlock');
await page.click('.modal [data-x="ok"]'); await wait(1500);
check(await ev('!!game.G.dist.downtown'), 'Downtown licensed');
await shot('6-downtown');
// franchise: give lifetime earnings for stars
await ev('game.G.earnedAll = 5e11'); await page.click('.tabs [data-tab="franchise"]'); await wait(300);
await shot('7-franchise');
await page.click('[data-act="franchise"]'); await page.waitForSelector('.modal [data-x="ok"]'); await wait(300);
await page.click('.modal [data-x="ok"]'); await wait(800);
check(await ev('game.G.stars') === 7, 'franchise: 7 stars');
check(await ev('Object.keys(game.G.dist).join() === "oldtown" && game.G.cash === 0'), 'branch reset');
// offline: pretend the last save was 3 hours ago with a manager in Old Town
await ev(`(() => { const G = game.G; G.rest.sunny = 50; G.dist.oldtown.n = 60; G.dist.oldtown.mgr = { name: 'Ada', char: 'female-a', surgeUntil: 0, cdUntil: 0 }; G.office = 1; G.last = Date.now() - 3 * 3600e3; localStorage.setItem(game.E.KEY, JSON.stringify(G)); localStorage.setItem = () => {}; })()`); // (so the page's own save on leaving keeps this one)
await boot('idle.html');
await page.waitForSelector('.modal [data-x="ok"]', { timeout: 10000 });
await shot('8-offline');
const before = await ev('game.G.cash');
await page.click('.modal [data-x="ok"]'); await wait(400);
const got = (await ev('game.G.cash')) - before;
check(got > 0, `offline earnings collected (${got.toFixed(0)}, capped at 2 h)`);
check(errors.length === 0, 'no page errors' + (errors.length ? ': ' + errors.join(' | ') : ''));
await browser.close(); server.close();

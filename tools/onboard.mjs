// Walk the first-time experience from an empty save: intro → courier pick → guided first delivery → first upgrade,
// then reset progress with the hold button and check the intro comes back.  node tools/onboard.mjs [WxH]
import { createRequire } from 'node:module';
import { serve } from './serve.mjs';
const require = createRequire(import.meta.url);
let puppeteer;
try { puppeteer = require('puppeteer-core'); } catch { puppeteer = require('/root/.npm/_npx/110f701c48e68d66/node_modules/puppeteer-core'); }
const CHROME = process.env.CHROME || '/root/.cache/puppeteer/chrome/linux-148.0.7778.97/chrome-linux64/chrome';
const [W, H] = (process.argv[2] || '390x844').split('x').map(Number);
const { server, base } = await serve();
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 600000, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage();
await page.setViewport({ width: W, height: H, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
const errs = []; page.on('pageerror', (e) => errs.push(e.message));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const shot = (n) => page.screenshot({ path: `tools/shots/ob/${n}.png` });
const step = () => page.evaluate(() => ({ step: game.St.S.onboard.step, guide: !document.getElementById('guide').hidden, bubble: document.querySelector('#guide .g-bubble p')?.textContent.slice(0, 40), op: getComputedStyle(document.querySelector('#guide .g-bubble')).opacity }));
const click = (sel) => page.evaluate((s) => { const b = document.querySelector(s); if (b) { b.click(); return true; } return false; }, sel);
const waitFor = (js, ms = 120000) => page.waitForFunction(js, { timeout: ms, polling: 200 });
const sim = (sec) => page.evaluate((s) => game.sim(s), sec);

await page.goto(`${base}/index.html`, { waitUntil: 'networkidle0', timeout: 180000 });
await waitFor('window.ready');
await waitFor(() => !!document.getElementById('intro'));
await sleep(500); await shot('01-intro'); console.log('intro shown');
for (let i = 0; i < 3; i++) { await click('#intro [data-i="next"]'); await sleep(250); }
await click('#intro [data-c="female-b"]'); await click('#intro [data-h="#2ec4b6"]');
await page.type('#intro input', 'Defne');
await sleep(300); await shot('02-pick');
await click('#intro [data-i="go"]'); await sleep(900);
console.log('after intro', await step(), await page.evaluate(() => ({ name: game.St.S.name, look: game.St.S.look })));
await shot('03-step1');
await click('.sheet-body .ocard'); await sleep(500);
console.log('after take', await step()); await shot('04-step2');
await click('#startbar .sb-go');
await sleep(2500); await page.evaluate(() => game.skipTween()); await sleep(2500);
await click('.modal.tip [data-x]'); await sleep(300);
console.log('riding', await step());
await page.evaluate(() => { game.ride.R.event = null; });
for (let i = 0; i < 80 && !(await page.evaluate(() => !!document.querySelector('.modal.scene'))); i++) await sim(1);
await sleep(600); console.log('pickup', await step()); await shot('05-pickup');
// (the door scenes play by themselves: the bag changes hands, then the ride goes on)
await waitFor(() => game.ride.R.phase === 'ride' && !document.querySelector('.modal.scene:not(.out)'), 30000);
for (let i = 0; i < 120 && !(await page.evaluate(() => !!document.querySelector('.modal.scene:not(.out)'))); i++) { await page.evaluate(() => { if (game.ride.R.event && !game.ride.R.event.fired) game.ride.R.event = null; }); await sim(1); }
await sleep(600); console.log('drop', await step()); await shot('06-drop');
await waitFor(() => !!document.querySelector('.modal.rated'), 30000).catch(() => {}); await sleep(400); await click('.modal.rated');
await waitFor(() => !!document.querySelector('.modal.receipt'), 30000); await sleep(600);
console.log('receipt', await step(), 'next order offered:', await page.evaluate(() => !!document.querySelector('.modal.receipt [data-next]'))); await shot('07-receipt');
await click('.modal.receipt [data-x]');
await sleep(1500); await page.evaluate(() => game.skipTween());
await waitFor(() => game.mode === 'hub', 60000); await sleep(800);
console.log('hub', await step()); await shot('08-garage-hint');
await click('.tabs [data-tab="garage"]'); await sleep(1200); await page.evaluate(() => game.skipTween()); await sleep(1200);
console.log('garage', await step(), await page.evaluate(() => game.St.S.cash)); await shot('09-upgrade-hint');
await click('.rows [data-act="part"]:not([disabled])') || await click('#guide .g-act button');
await sleep(600); console.log('after upgrade', await step()); await shot('10-city-hint');
await click('.tabs [data-tab="city"]'); await sleep(1500); await page.evaluate(() => game.skipTween()); await sleep(800);
console.log('done', await step()); await shot('11-done');
// reset progress: settings → Reset → hold
await click('.gear'); await sleep(400); await click('.modal.settings [data-x="reset"]'); await sleep(500); await shot('12-reset');
const r = await page.evaluate(() => { const b = document.querySelector('.modal.reset .hold').getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; });
await page.touchscreen.touchStart(r.x, r.y); await sleep(700); await shot('13-holding'); await sleep(1400);
await page.touchscreen.touchEnd().catch(() => {});
await page.waitForNavigation({ timeout: 60000 }).catch(() => {});
await waitFor('window.ready'); await sleep(800);
console.log('after reset', await page.evaluate(() => ({ intro: !!document.getElementById('intro'), cash: game.St.S.cash, lvl: game.St.S.lvl, step: game.St.S.onboard.step, deliveries: game.St.S.stats.deliveries })));
console.log('errors', errs.length ? errs : 'none');
await browser.close(); server.close();

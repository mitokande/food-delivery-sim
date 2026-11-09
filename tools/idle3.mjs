// Headless check of Uncle's Diner (idle3.html): the story, tapping SMASH, walk-ins buying, hiring a cook and a courier,
// deliveries on the map, skill and motor upgrades, the banner, the sheet, save + reload.
//   node tools/idle3.mjs [outdir=tools/shots]   (phone viewport; screenshots idle3-*.png)
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
const shot = async (n) => { await wait(700); await page.screenshot({ path: `${OUT}/idle3-${n}.png` }); console.log('shot', n); };
const ev = (js) => page.evaluate(js);
const check = (ok, what) => { console.log(ok ? 'ok  ' : 'FAIL', what); if (!ok) process.exitCode = 1; };
const boot = async (url) => { await page.goto(`${base}/${url}`, { waitUntil: 'networkidle0', timeout: 180000 }); await page.waitForFunction('window.ready', { timeout: 90000, polling: 200 }); };
// (a tap on something in the sheet: scrolled clear of the SMASH button first, as a player would)
const tap = async (sel) => {
  await ev(`document.querySelector('${sel}').scrollIntoView({ block: 'center' })`); await wait(150);
  // (cash set by the test shows on the buttons at the next live() update: a slow headless frame or two)
  await page.waitForFunction(`!document.querySelector('${sel}').disabled`, { timeout: 5000, polling: 50 }).catch(() => {});
  const hit = await ev(`(() => { const b = document.querySelector('${sel}'), r = b.getBoundingClientRect(), e = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return b.disabled ? 'disabled, cash ' + game.G.cash.toFixed(1) : b.contains(e) ? '' : (e?.className || e?.tagName) + ' @' + Math.round(r.top); })()`);
  if (hit) console.log('  (covered by', hit + ')');
  await page.click(sel);
};
// (the sheet slides open: wait until it has, the headless renderer is slow)
const sheetOpen = () => page.waitForFunction('document.querySelector("#sheet").getBoundingClientRect().height > 250', { timeout: 10000, polling: 100 });
const smash = () => ev('document.querySelector(".smash").dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }))');

await boot('idle3.html?fresh&speed=4');
await page.waitForSelector('.modal.story .btn', { timeout: 10000 });
await shot('0-story');
const t0 = await ev('game.G.t'); await wait(1200);
check(await ev('game.G.t') === t0, 'the diner waits under the story');
for (let i = 0; i < 4; i++) { await page.waitForSelector('.modal.story.in [data-x="next"]', { timeout: 10000 }); await page.click('.modal.story.in [data-x="next"]'); await wait(400); }
await wait(400);
check(await ev('game.G.seen.intro && !document.querySelector(".modal.in")'), 'the four story cards play through');
check(await ev('document.querySelector(".neckb").textContent.includes("SMASH")'), 'the banner says to tap SMASH');

// tapping: one burger a tap, the tap waits out the make time
await smash(); await wait(50);
check(await ev('game.G.you.left > 0 && document.querySelector(".smash").classList.contains("busy")'), 'a tap starts a burger (the button shows its ring)');
await smash();
check(await ev('game.G.stats.taps') === 1, 'a second tap while it cooks does nothing');
for (let i = 0; i < 14; i++) { await ev('game.G.you.left > 0 ? 0 : 1') && await smash(); await wait(250); }
await page.waitForFunction('game.G.stats.walkins >= 2', { timeout: 30000, polling: 200 });
check(await ev('game.G.stats.earned > 0 && game.G.cash > 0'), `walk-ins buy burgers ($${(await ev('game.G.cash')).toFixed(1)})`);
check(await ev('!!document.querySelector(".mk.diner .cnt")'), 'the diner marker is on the map');
await shot('1-smashing');

// the first cook from the Kitchen tab
await ev('game.G.cash = Math.max(game.G.cash, 45)');
await page.click('.tabs [data-tab="kitchen"]'); await sheetOpen();
await tap('[data-act="cook"]'); await wait(300);
check(await ev('game.G.cooks.length') === 1, 'a cook hired');
await page.waitForFunction('game.G.cooks[0].made >= 1', { timeout: 30000, polling: 200 });
check(true, 'the cook makes burgers on their own');
await ev('game.G.cash += 60');
await tap('[data-act="skill"][data-id="you"][data-sk="speed"]'); await wait(200);
check(await ev('game.G.you.speed') === 1, 'your speed levelled');
const cid = await ev('game.G.cooks[0].id');
await tap(`[data-act="skill"][data-id="${cid}"][data-sk="quality"]`); await wait(200);
check(await ev('game.G.cooks[0].quality') === 1, "the cook's quality levelled");
await shot('2-kitchen');

// the scooter: a story beat when a courier becomes affordable, then hiring one
await page.click('.tabs [data-tab="kitchen"]'); await wait(300); // (closes the sheet)
await ev('game.G.cash = 80'); await wait(400);
await page.waitForSelector('.modal.story.in [data-x="go"]', { timeout: 5000 });
check(true, 'the scooter card shows when a courier is affordable');
await shot('3-scooter');
await page.click('.modal.story.in [data-x="go"]'); await sheetOpen();
check(await ev('game.ui.tab === "couriers" && game.ui.open'), 'it opens the Couriers tab');
await shot('4-couriers-locked');
await tap('[data-act="courier"]'); await wait(400);
check(await ev('game.G.couriers.length === 1 && game.G.couriers[0].motor === 0'), "a courier hired on Uncle's Rust Bucket");
await page.click('.tabs [data-tab="couriers"]'); await wait(300); // (close the sheet to see the map)
await page.waitForFunction('Object.keys(game.G.orders).length > 0 || game.G.stats.deliveries > 0', { timeout: 60000, polling: 250 });
check(true, 'delivery orders come in');
await page.waitForFunction('[...game.bikes.values()].some((b) => b.bike && b.bike.root.visible)', { timeout: 30000, polling: 250 });
check(true, 'the courier bike is on the map');
await ev('for (let i = 0; i < 40; i++) if (game.S.canSmash(game.G) === "ok") game.S.act(game.G, "smash")');
await page.waitForFunction('game.G.stats.deliveries >= 1', { timeout: 90000, polling: 250 });
check(true, `a delivery paid (+tip ${(await ev('game.G.stats.tips')).toFixed(1)})`);
check(await ev('document.querySelector(".neckb").textContent.length > 5'), `the banner says something: "${await ev('document.querySelector(".neckb").textContent')}"`);
await shot('5-delivering');

// motor + courier skills
await ev('game.G.cash = 5000');
await page.click('.tabs [data-tab="couriers"]'); await sheetOpen();
await tap('[data-act="motor"]'); await wait(400);
check(await ev('game.S.motorOf(game.G.couriers[0]).id') === 'zippy', 'the motor upgraded to a Zippy');
const rid = await ev('game.G.couriers[0].id');
for (const sk of ['ride', 'bag', 'charm']) { await tap(`[data-act="skill"][data-id="${rid}"][data-sk="${sk}"]`); await wait(250); }
check(await ev('game.G.couriers[0].ride === 1 && game.G.couriers[0].bag === 1 && game.G.couriers[0].charm === 1'), 'riding, bag and charm levelled');
await page.waitForFunction(`(() => { const b = game.bikes.get(${rid}); return b && b.veh === 'zippy' && b.bike; })()`, { timeout: 30000, polling: 250 });
check(true, 'the bike on the map is the new motor');
await shot('6-couriers');
await page.click('.who'); await wait(300);
check(await ev('game.ui.tab') === 'diner', 'the top-left button opens the Diner tab');
await shot('7-diner');

// save + reload keeps the diner, no story the second time
await ev('game.save()');
const sold = await ev('game.G.served');
await boot('idle3.html?speed=4');
check(await ev(`game.G.served >= ${sold} && game.G.cooks.length === 1 && game.G.couriers.length === 1`), 'reload keeps the diner');
check(await ev('!document.querySelector(".modal")'), 'no story on a returning visit');

check(!errors.length, `no errors${errors.length ? ': ' + errors.slice(0, 5).join(' | ') : ''}`);
await browser.close(); server.close();

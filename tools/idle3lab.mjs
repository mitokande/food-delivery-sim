// Headless check of the balance lab (idle3-lab.html) and the playtest it starts (idle3.html?lab): the lab plays the
// shipped game, a changed number is kept, outlined and compared, values out of range are pulled back, paste / reset /
// undo, the lengths; the playtest takes the lab's numbers on a save of its own, its bar (speed, cash, skip), numbers
// changed while it runs, and the game without ?lab never sees any of it.
//   node tools/idle3lab.mjs [outdir=tools/shots]   (screenshots idle3lab-*.png)
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
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error' && !m.text().startsWith('Failed to load resource')) errors.push(m.text()); });
page.on('response', (r) => { if (r.status() >= 400 && !/fonts\.g|favicon/.test(r.url())) errors.push(`${r.status()} ${r.url()}`); });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const shot = async (n, full = false) => { await wait(500); await page.screenshot({ path: `${OUT}/idle3lab-${n}.png`, fullPage: full }); console.log('shot', n); };
const ev = (js) => page.evaluate(js);
const check = (ok, what) => { console.log(ok ? 'ok  ' : 'FAIL', what); if (!ok) process.exitCode = 1; };
const TUNE = 'fds_idle3_tune';
// (the lab is done once the bot's games for what is on the page have come back)
const settled = async () => { await wait(400); await page.waitForFunction('document.body.dataset.state === "ready"', { timeout: 60000, polling: 100 }); };
const lab = async () => { await page.goto(`${base}/idle3-lab.html`, { waitUntil: 'networkidle0', timeout: 60000 }); await settled(); };
const type = async (p, text) => { await page.focus(`input[data-p="${p}"]`); await ev(`document.querySelector('input[data-p="${p}"]').select()`); await page.keyboard.type(text); };
const game = async (url) => { await page.goto(`${base}/${url}`, { waitUntil: 'networkidle0', timeout: 180000 }); await page.waitForFunction('window.ready', { timeout: 90000, polling: 200 }); };
const sim = (js) => ev(`import('./js/idle3/sim.js').then((S) => ${js})`);

// ---------------------------------------------------------------- the lab
await page.setViewport({ width: 1360, height: 900, deviceScaleFactor: 1 });
await lab();
const n = await ev('Object.keys(lab.LABEL).length');
check(n > 120 && await ev(`document.querySelectorAll('#params input[data-p]').length`) === n, `the lab lists the game's numbers (${n} fields)`);
check(await ev('!!lab.view.base && !lab.view.mine && !lab.view.err'), 'a bot plays the shipped game');
check(await ev(`document.querySelectorAll('#tiles .tile').length === 6 && document.querySelectorAll('.chart path.line').length === 1 && document.querySelectorAll('#marks tbody tr').length > 8`), 'tiles, one line, the milestones');
const earned0 = await ev('lab.view.base.earned');
await shot('1-shipped');

await type('WALK.rate', '12'); await settled();
check(await ev(`lab.over['WALK.rate'] === 12 && localStorage.getItem('${TUNE}') === '{"WALK.rate":12}'`), 'a changed number is kept for the playtest');
check(await ev(`document.querySelector('input[data-p="WALK.rate"]').classList.contains('chg') && document.querySelectorAll('#changes .chg-row').length === 1`), 'it is outlined and listed');
check(await ev(`!!lab.view.mine && lab.view.mine.earned !== ${earned0} && lab.view.base.earned === ${earned0} && document.querySelectorAll('.chart path.line').length === 2`),
  `the bot plays it against the shipped game ($${Math.round(earned0)} → $${Math.round(await ev('lab.view.mine.earned'))})`);
check(await ev(`document.querySelectorAll('#marks thead th').length === 4 && document.querySelectorAll('#held .bar.mine').length === 5`), 'the tables and bars compare the two');
await page.hover('.chart svg'); await wait(200);
check(await ev(`!document.querySelector('.tip').hidden && document.querySelectorAll('.tip .r').length === 2`), 'the crosshair lists both games for a minute');
await shot('2-changed');

await type('DISHES.pizza.price', '99999'); await page.keyboard.press('Tab'); await settled();
check(await ev(`lab.over['DISHES.pizza.price'] === 500 && document.querySelector('input[data-p="DISHES.pizza.price"]').value === '500'`), 'a number out of range is pulled back');
await type('STAGES.fixed.seats', '11'); await page.keyboard.press('Tab'); await settled();
check(await ev(`lab.over['STAGES.fixed.seats'] === 12`), 'seats come two a table');
await type('AWAY.max', '3'); await page.keyboard.press('Tab'); await settled();
check(await ev(`lab.over['AWAY.max'] === 10800`), 'hours away are kept in seconds');
await page.click('#changes [data-undo="DISHES.pizza.price"]'); await settled();
check(await ev(`!('DISHES.pizza.price' in lab.over) && document.querySelector('input[data-p="DISHES.pizza.price"]').value === '11'`), '✕ puts the shipped value back');
await type('WALK.rate', '8'); await page.keyboard.press('Tab'); await settled();
check(await ev(`!('WALK.rate' in lab.over)`), 'typing the shipped value is no change');

await page.click('[data-act="reset"]'); await settled();
check(await ev(`!Object.keys(lab.over).length && localStorage.getItem('${TUNE}') === null && !lab.view.mine`), 'Reset all: the shipped game again');
await page.click('#toast button'); await settled();
check(await ev(`Object.keys(lab.over).length === 2`), 'Undo brings the changes back');
await page.click('[data-act="paste"]');
await page.type('#paste textarea', '{ "DELIV.rate": 6, "MOTORS.zippy.speed": 12, "NOPE.x": 3, "FAME.0": 5, "YOU_K": 99 }');
await page.click('#paste [value=ok]'); await settled();
check(await ev(`JSON.stringify(lab.over) === '{"DELIV.rate":6,"MOTORS.zippy.speed":12,"YOU_K":1}'`), 'pasted values replace the changes (unknown ones left out, the rest in range)');
await page.click('[data-seg="minutes"] [data-v="30"]'); await settled();
check(await ev(`lab.view.minutes === 30 && lab.view.base.mins.length === 30 && lab.view.mine.mins.length === 30`), 'a 30 minute game');
await page.select('#player', 'plan-idle'); await settled();
check(await ev(`lab.view.base.taps < 200 && !!lab.view.mine`), 'the player who stops tapping');
await ev(`localStorage.setItem('${TUNE}', '{"DELIV.radius":60}')`);
await lab();
check(await ev(`!!lab.view.base && (!!lab.view.mine || !!lab.view.err)`), `the smallest delivery zone: ${await ev('lab.view.err ? "the lab says why it cannot be played (" + lab.view.err + ")" : "played, " + lab.view.mine.doors + " doors"')}`);

await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await ev(`localStorage.setItem('${TUNE}', '{"WALK.rate":16,"DISHES.burger.price":9}')`);
await lab();
check(await ev(`document.documentElement.scrollWidth <= innerWidth && getComputedStyle(document.querySelector('#mini')).display !== 'none' && document.querySelector('#mini').textContent.startsWith('Yours')`), 'on a phone: no sideways scroll, the strip at the bottom says what the changes did');
await shot('3-phone'); await shot('3-phone-full', true);

// ---------------------------------------------------------------- the playtest
await game('idle3.html?lab&noti&fresh&speed=2');
check(await ev(`!!document.querySelector('#labbar') && !location.search.includes('fresh')`), 'the playtest has its bar (and a reload goes on with it)');
check(await sim('S.WALK.rate === 16 && S.DISH.burger.price === 9'), "it plays the lab's numbers");
await ev('game.G.cash = 5; document.dispatchEvent(new Event("visibilitychange"))'); await ev('dispatchEvent(new Event("pagehide"))');
check(await ev(`!!localStorage.getItem('fds_idle3_v2_lab') && !localStorage.getItem('fds_idle3_v2')`), 'on a save of its own');
await page.click('#labbar .lb-chip');
check(await ev(`document.querySelector('#labbar').classList.contains('open') && document.querySelector('#labbar .lb-sum').textContent.includes('2 changed')`), 'the bar opens, and says how many numbers differ');
await page.click('#labbar [data-lb="speed"][data-v="10"]');
const c0 = await ev('game.G.cash'), t0 = await ev('game.G.t');
await page.click('#labbar [data-lb="cash"][data-v="1000"]');
check(await ev(`game.G.cash >= ${c0} + 1000`), 'cash from the bar');
await wait(1000);
check(await ev(`game.G.t - ${t0}`) > 5, `×10 (${(await ev(`game.G.t - ${t0}`)).toFixed(1)} s of game in a second)`);
await shot('4-playtest');
const t1 = await ev('game.G.t');
await page.click('#labbar [data-lb="skip"][data-v="600"]');
check(await ev(`game.G.t - ${t1}`) >= 595, 'skipping 10 minutes plays them through');
if (await ev('!!document.querySelector(".modal.awaycard.in")')) { await page.click('.modal.in [data-x="ok"]'); await wait(400); }
// the lab changes a number in its tab: the playtest takes it
await ev(`localStorage.setItem('${TUNE}', '{"WALK.rate":3}'); dispatchEvent(new StorageEvent('storage', { key: '${TUNE}' }))`);
check(await sim('S.WALK.rate === 3 && S.DISH.burger.price === 4') && await ev(`document.querySelector('#labbar .lb-sum').textContent.includes('1 changed')`), 'a number changed in the lab reaches the running playtest');
const t2 = await ev('game.G.t');
await Promise.all([page.waitForNavigation({ timeout: 60000 }), ev(`localStorage.setItem('${TUNE}', '{"STAGES.rundown.seats":12}'); dispatchEvent(new StorageEvent('storage', { key: '${TUNE}' }))`)]);
await page.waitForFunction('window.ready', { timeout: 90000, polling: 200 });
check(await sim('S.STAGES[0].seats === 12') && await ev(`game.G.t >= ${t2} && game.inside.layout.seats.length === 12`), 'changed seats: the playtest reloads with the room laid out again, the save kept');

// ---------------------------------------------------------------- the game itself
await game('idle3.html?noti&fresh');
check(await sim('S.STAGES[0].seats === 6 && S.WALK.rate === 8') && await ev(`!document.querySelector('#labbar')`), "without ?lab the game is the shipped one, whatever the lab holds");

check(!errors.length, `no errors${errors.length ? ': ' + errors.slice(0, 5).join(' | ') : ''}`);
await browser.close(); server.close();

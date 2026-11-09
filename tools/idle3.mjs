// Headless check of Idle Restaurant Manager (idle3.html): the story, the restaurant from the inside (customers at the tables, a
// tap in the kitchen cooks, the map behind a button), tapping COOK, tables paying, a cook bringing a dish to the
// menu, skills, the scooter card, a courier and deliveries on the map, motor and courier skills, expanding the
// restaurant (the building on the map is rebuilt; at stage 4 it takes the lot next door), save + reload, and the
// restaurant running while the game is closed (the "while you were away" card; a sleeping tab catches up too).
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
// (a tap on something in the sheet: scrolled clear of the COOK button first, as a player would)
const tap = async (sel) => {
  await ev(`document.querySelector('${sel}').scrollIntoView({ block: 'center' })`); await wait(150);
  // (cash set by the test shows on the buttons at the next live() update: a slow headless frame or two)
  await page.waitForFunction(`!document.querySelector('${sel}').disabled`, { timeout: 5000, polling: 50 }).catch(() => {});
  await page.click(sel);
};
// (the sheet slides open: wait until it has, the headless renderer is slow)
const sheetOpen = () => page.waitForFunction('document.querySelector("#sheet").getBoundingClientRect().height > 250', { timeout: 10000, polling: 100 });
const openTab = async (t) => { if (!(await ev(`game.ui.open && game.ui.tab === '${t}'`))) await page.click(`.tabs [data-tab="${t}"]`); await sheetOpen(); };
const closeSheet = async () => { if (await ev('game.ui.open')) { await page.click(`.tabs [data-tab="${await ev('game.ui.tab')}"]`); await wait(400); } };
const cookTap = () => ev('document.querySelector(".smash").dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }))');
const closeModal = async (x) => { await page.waitForSelector(`.modal.in [data-x="${x}"]`, { timeout: 10000 }); await page.click(`.modal.in [data-x="${x}"]`); await wait(500); };

await boot('idle3.html?fresh&speed=4');
await page.waitForSelector('.modal.story .btn', { timeout: 10000 });
await shot('0-story');
const t0 = await ev('game.G.t'); await wait(1200);
check(await ev('game.G.t') === t0, 'the restaurant waits under the story');
for (let i = 0; i < 4; i++) await closeModal('next');
check(await ev('game.G.seen.intro && !document.querySelector(".modal.in")'), 'the four story cards play through');
check(await ev('document.querySelector(".neckb").textContent.includes("COOK")'), 'the banner says to tap COOK');
check(await ev('document.body.dataset.view === "inside" && game.inside.peek().stations.join() === "burger"'), 'the game opens inside the restaurant, a grill in the kitchen');

// customers sit down and order; one tap cooks one order
await page.waitForFunction('game.G.tickets.length > 0', { timeout: 30000, polling: 100 });
check(await ev('game.G.tables.length > 0'), 'a customer takes a table and orders');
await page.waitForFunction('game.inside.peek().guests.some((g) => g.mode === "sit") && document.querySelector("#inmarkers .mk.order")', { timeout: 30000, polling: 200 });
check(true, 'they walk in and sit at a table, the order in a bubble');
await cookTap(); await wait(50);
check(await ev('!!game.G.you.job && document.querySelector(".smash").classList.contains("busy")'), 'a tap cooks the order (the button shows its ring)');
await cookTap();
check(await ev('game.G.stats.taps') === 1, 'a second tap while it cooks does nothing');
for (let i = 0; i < 30 && await ev('game.G.stats.tables < 2'); i++) { await cookTap(); await wait(300); }
check(await ev('game.G.stats.tables >= 2 && game.G.cash > 0'), `tables pay when their food arrives ($${(await ev('game.G.cash')).toFixed(1)})`);
check(await ev('!!document.querySelector(".mk.diner .art")'), 'the restaurant marker shows the place');
// a tap on yourself in the kitchen cooks too
await page.waitForFunction('game.S.canCook(game.G) === "ok" && !game.G.you.job', { timeout: 30000, polling: 100 });
const taps0 = await ev('game.G.stats.taps');
const [yx, yy] = await ev('(() => { const y = game.inside.peek().staff.find((s) => s.id === "you"); return game.inside.screenOf(y.x, 0.9, y.z); })()');
await page.mouse.click(yx, yy);
await wait(200);
check(await ev(`game.G.stats.taps === ${taps0} + 1`), 'a tap on yourself in the kitchen cooks the next order');
await shot('1-cooking');

// the first cook brings the hot dog to the menu
await ev('game.G.cash = Math.max(game.G.cash, 35)');
await openTab('kitchen');
await tap('[data-act="cook"]'); await wait(300);
check(await ev('game.G.cooks.length === 1 && game.G.menu.includes("hotdog")'), 'a cook hired, and the hot dog is on the menu');
await wait(300);
check(await ev('game.inside.peek().stations.join() === "burger,hotdog" && game.inside.peek().staff.length === 2'), 'inside: the cook in the kitchen, a hot dog station next to the grill');
await page.waitForFunction('game.G.cooks[0].made >= 1', { timeout: 40000, polling: 200 });
check(true, 'the cook cooks orders on their own');
await ev('game.G.cash += 60');
await tap('[data-act="skill"][data-id="you"][data-sk="speed"]'); await wait(200);
check(await ev('game.G.you.speed') === 1, 'your speed levelled');
const cid = await ev('game.G.cooks[0].id');
await tap(`[data-act="skill"][data-id="${cid}"][data-sk="quality"]`); await wait(200);
check(await ev('game.G.cooks[0].quality') === 1, "the cook's quality levelled");
check(await ev('!!document.querySelector(".tabs [data-tab=menu] .dot:not([hidden])")'), 'the Menu tab shows a dot for the new dish');
await shot('2-kitchen');
await openTab('menu');
check(await ev('document.querySelectorAll(".dish.on").length') === 2 && await ev('document.querySelectorAll(".dish.off").length') === 6, 'the Menu shows 2 dishes on, 6 to come');
await shot('3-menu');

// the scooter: a story card once a courier is affordable, then hiring one
await closeSheet();
await ev('game.G.cash = 80'); await wait(400);
await page.waitForSelector('.modal.story.in [data-x="go"]', { timeout: 5000 });
check(true, 'the scooter card shows when a courier is affordable');
await closeModal('go'); await sheetOpen();
check(await ev('game.ui.tab === "couriers" && game.ui.open'), 'it opens the Couriers tab');
await tap('[data-act="courier"]'); await wait(400);
check(await ev('game.G.couriers.length === 1 && game.G.couriers[0].motor === 0'), "a courier hired on Uncle's Rust Bucket");
await closeSheet();
await page.waitForFunction('Object.keys(game.G.orders).length > 0', { timeout: 60000, polling: 250 });
check(true, 'delivery orders come in');
await page.click('.viewbtn'); await wait(300);
check(await ev('document.body.dataset.view === "city" && getComputedStyle(document.getElementById("markers")).display !== "none" && document.getElementById("inmarkers").hidden'), 'the Map button shows the city');
await page.waitForFunction('[...game.bikes.values()].some((b) => b.bike && b.bike.root.visible)', { timeout: 30000, polling: 250 });
check(true, 'the courier bike is on the map');
// the order board: one chip per pair of hands on the stove, one ticket per waiting order, deliveries the couriers can't take yet dimmed
await openTab('kitchen'); await wait(400);
check(await ev('document.querySelectorAll(".board .pot").length === game.G.cooks.length + 1'), 'the board shows you and each cook on the stove');
check(await ev('(() => { game.ui.live(); const q = game.S.queueView(game.G).slice(0, 12); const el = [...document.querySelectorAll(".board .tickets .t")]; return el.length === q.length && q.every((t, i) => el[i].classList.contains("held") === t.held && el[i].classList.contains(t.kind)); })()'),
  `the board lists the waiting orders, table or delivery, held ones dimmed (${await ev('game.S.queueView(game.G).map((t) => t.dish + (t.held ? "*" : "")).join(" ")')})`);
await closeSheet();
for (let i = 0; i < 200 && await ev('game.G.stats.deliveries < 1'); i++) { await cookTap(); await wait(400); }
check(await ev('game.G.stats.deliveries >= 1'), `a delivery paid (+tip ${(await ev('game.G.stats.tips')).toFixed(1)})`);
await shot('4-delivering');

// motor + courier skills
await ev('game.G.cash = 5000');
await openTab('couriers');
await tap('[data-act="motor"]'); await wait(400);
check(await ev('game.S.motorOf(game.G.couriers[0]).id') === 'zippy', 'the motor upgraded to a Zippy');
const rid = await ev('game.G.couriers[0].id');
for (const sk of ['ride', 'bag', 'charm']) { await tap(`[data-act="skill"][data-id="${rid}"][data-sk="${sk}"]`); await wait(250); }
check(await ev('game.G.couriers[0].ride === 1 && game.G.couriers[0].bag === 1 && game.G.couriers[0].charm === 1'), 'riding, bag and charm levelled');
await page.waitForFunction(`(() => { const b = game.bikes.get(${rid}); return b && b.veh === 'zippy' && b.bike; })()`, { timeout: 30000, polling: 250 });
check(true, 'the bike on the map is the new motor');
await shot('5-couriers');
await closeSheet();
await ev('document.querySelector(".mk.diner").click()'); await wait(300);
check(await ev('document.body.dataset.view === "inside"'), "the restaurant's marker on the map goes back inside");

// expanding: fame first, then the money; the building on the map is rebuilt
await ev('game.G.served = 5'); // (fame 1)
await openTab('restaurant'); await wait(300);
check(await ev('document.querySelector("[data-act=expand]").disabled'), 'expanding waits for fame');
await shot('6-restaurant');
const g0 = await ev('game.restaurant().group.uuid');
await ev('game.G.served = Math.max(game.G.served, 25); game.ui.render()'); await wait(300);
await tap('[data-act="expand"]'); await wait(400);
check(await ev('game.G.stage') === 1, 'the restaurant expands to stage 2');
check(await ev(`game.restaurant().group.uuid !== '${g0}'`), 'the building on the map is rebuilt');
await page.waitForSelector('.modal.story.in [data-x="ok"]', { timeout: 5000 });
await shot('7-expanded');
await closeModal('ok');
check(await ev('game.S.stageOf(game.G).seats') === 10 && await ev('game.S.roomFor(game.G, "cook")'), 'more tables and room for a second cook');
await wait(500);
check(await ev('game.inside.peek().tables') === 5, 'inside: the room has 5 tables now');
// on to the end: the place takes over the shop next door
await ev('game.G.served = 600; game.G.cash = 1e6; for (let i = 0; i < 2; i++) game.S.act(game.G, "expand"); game.changed()'); await wait(300);
await openTab('restaurant');
await tap('[data-act="expand"]'); await wait(400);
await closeModal('ok');
check(await ev('game.G.stage') === 4, 'stage 5: the grand restaurant');
check(await ev('game.restaurant().parts.length === 2 && game.restaurant().parts[1].spec.sign === "Ferdi\'s Kitchen"'), 'the shop next door is part of it now');
await closeSheet(); await wait(800);
check(await ev('game.inside.peek().tables === 20 && game.inside.layout.w === 16 && game.inside.layout.terrace === 6'), 'inside: two rooms wide, 20 tables, 6 on the terrace');
await shot('8-grand-inside');
await ev('game.setView("city"); game.focusDiner(); game.hubCam.st.tdist = 200'); await wait(1500);
await shot('8-grand');
await ev('game.setView("inside")');

// save + reload keeps the restaurant, no story the second time
await ev('game.save()');
const sold = await ev('game.G.served');
await boot('idle3.html?speed=4');
check(await ev(`game.G.served >= ${sold} && game.G.stage === 4 && game.G.cooks.length === 1 && game.G.couriers.length === 1`), 'reload keeps the restaurant');
check(await ev('!document.querySelector(".modal") && game.restaurant().parts.length === 2'), 'no story on a returning visit, the grand building is back');

// the restaurant runs while the game is closed: two hours played through on the next visit, then the card
await ev('game.save()');
const b4 = await ev('({ cash: game.G.cash, t: game.G.t, tables: game.G.stats.tables, del: game.G.stats.deliveries })');
await boot('idle3.html?speed=4&away=7200');
await page.waitForSelector('.modal.awaycard.in [data-x="ok"]', { timeout: 10000 });
check(await ev(`game.G.t - ${b4.t} >= 7199 && game.G.stats.tables + game.G.stats.deliveries > ${b4.tables + b4.del} + 50`),
  `two hours away: the cook and the courier kept working (+${await ev(`game.G.stats.tables - ${b4.tables}`)} tables, +${await ev(`game.G.stats.deliveries - ${b4.del}`)} deliveries)`);
check(await ev(`(() => { const m = document.querySelector('.awaycard .awaycash b').textContent; return game.G.cash > ${b4.cash} && m.startsWith('+$'); })()`),
  `the card shows the takings (${await ev('document.querySelector(".awaycard .awaycash b").textContent')})`);
await shot('9-away');
await closeModal('ok');
check(await ev('!game.paused'), 'Collect closes it and the restaurant runs on');
// a hidden tab or a locked phone: a long gap between frames is played through the same way
const t1 = await ev('game.G.t');
await ev('(() => { const now = Date.now; Date.now = () => now() + 600e3; })()');
await page.waitForSelector('.modal.awaycard.in', { timeout: 10000 });
check(await ev(`game.G.t - ${t1} >= 595`), `a tab asleep for 10 minutes catches up (${Math.round(await ev(`game.G.t - ${t1}`))} s)`);
await closeModal('ok');

check(!errors.length, `no errors${errors.length ? ': ' + errors.slice(0, 5).join(' | ') : ''}`);
await browser.close(); server.close();

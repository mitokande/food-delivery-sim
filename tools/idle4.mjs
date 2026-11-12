// Headless check of Ferdi's (idle4.html), the building: the story (with the rival), the building from above with its
// room labels, you doing every job at first, a cook and a waiter taking jobs off you (you go and sit in the office once
// it's fixed up), a tap on a room opening its panel, repairing a room (the builder, the timer, the room rebuilt),
// benches, a new station bringing a dish, the cashier and a register (people pay on their way out), renovation rules
// (items at their caps, the office first), save + reload, the restaurant running while the game is closed.
//   node tools/idle4.mjs [outdir=tools/shots]   (phone viewport; screenshots idle4-*.png)
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
const shot = async (n) => { await wait(700); await page.screenshot({ path: `${OUT}/idle4-${n}.png` }); console.log('shot', n); };
const ev = (js) => page.evaluate(js);
const check = (ok, what) => { console.log(ok ? 'ok  ' : 'FAIL', what); if (!ok) process.exitCode = 1; };
const boot = async (url) => { await page.goto(`${base}/${url}`, { waitUntil: 'networkidle0', timeout: 180000 }); await page.waitForFunction('window.ready', { timeout: 90000, polling: 200 }); };
const until = (js, ms = 30000) => page.waitForFunction(js, { timeout: ms, polling: 100 }).then(() => true, () => false);
const buy = (a, room, id) => ev(`game.act('${a}', '${room}', ${id ? `'${id}'` : 'undefined'})`).then((r) => !!r);
const cash = (n) => ev(`game.G.cash = ${n}`);

await boot('idle4.html?fresh&speed=4');
await page.waitForSelector('.modal.story .btn', { timeout: 10000 });
await shot('0-story');
check(await ev('document.querySelector(".modal.story .ferdi img").naturalWidth > 0'), "the letter shows Uncle Ferdi's portrait");
const t0 = await ev('game.G.t'); await wait(1000);
check(await ev('game.G.t') === t0, 'the restaurant waits under the story');
const titles = [];
for (let i = 0; i < 4; i++) {
  await page.waitForSelector('.modal.in [data-x="next"]', { timeout: 10000 });
  titles.push(await ev('document.querySelector(".modal.in h2").textContent'));
  if (i === 2) { await wait(400); check(await ev('document.querySelector(".modal.in .storyimg img").naturalWidth > 0'), 'the rival, Victor Gristle, has a picture'); await shot('1-rival'); }
  await page.click('.modal.in [data-x="next"]'); await wait(450);
}
check(titles.join() === 'A letter,Everything,A visitor,The menu' && await ev('game.G.seen.intro'), 'four story cards: the letter, the building, the rival, the menu');

// the building: labels on every room, the ruins, the hint
check(await ev('document.querySelectorAll("#markers .mk.rlab").length') === 8, 'every room has a label');
check(await ev('document.querySelector("#markers .rl.ruin") && document.querySelectorAll("#markers .rl.soon").length === 2'), 'ruined rooms show a repair price, the later phases\' rooms "coming soon"');
check(await ev('document.querySelector(".hint .ht").textContent.includes("cook")'), 'the hint says to hire a cook');
// you do everything: cook, carry, bring the bill
check(await until('game.G.staff[0].job && game.G.staff[0].job.kind === "cook"', 60000), 'you cook the first order yourself');
check(await until('game.G.stats.served > 0', 90000), 'and serve it and bring the bill: the first customer paid');
await shot('2-alone');

// a tap on the kitchen opens its panel
await ev('game.world.focus("kitchen", 26)'); await wait(900);
const kp = await ev(`(() => { const R = { x: 14, z: 3.5 }; const v = new game.world.camera.position.constructor(R.x, 0, R.z).project(game.world.camera); return [(v.x + 1) / 2 * innerWidth, (1 - v.y) / 2 * innerHeight]; })()`);
await page.touchscreen.tap(kp[0], kp[1]); await wait(600);
check(await ev('game.ui.room === "kitchen" && document.querySelector("#sheet").dataset.state === "open"'), 'a tap on the kitchen opens its panel');
await cash(40);
await page.click('#sheet [data-act="item"][data-id="cooks"]'); await wait(300);
check(await ev('game.S.nCooks(game.G) === 1 && game.G.staff.some((s) => s.role === "cook")'), 'hiring a cook from the panel');
await shot('3-kitchen-panel');
check(await until('game.G.staff.find((s) => s.role === "cook").job?.kind === "cook"', 40000), 'the cook takes the next order');
check(await ev('!game.S.youCook(game.G) && game.S.youServe(game.G)'), 'you only wait tables now');
await page.click('#sheet [data-act="close"]'); await wait(400);
check(await ev('!game.ui.room && !document.querySelector(".hint").hidden'), 'the panel closes, the hint is back');
await cash(50); check(await buy('item', 'dining', 'waiters'), 'hiring a waiter');
check(await until('game.G.staff[0].at === "host"', 30000), 'nobody needs you on the floor: you wait at the door (the office is in ruins)');

// repairs: the entrance (a builder, a timer), benches; the office (you sit down in it, the restaurant level)
await cash(100);
check(await buy('up', 'entrance'), 'repairing the entrance');
check(await until('game.G.build?.room === "entrance" && !!document.querySelector("#markers .rl.busy")', 3000), 'the label shows the work going on');
check(!(await buy('up', 'office')), 'one room at a time');
await wait(800); await shot('4-repairing');
check(await until('game.S.lvOf(game.G, "entrance") === 1', 30000), 'the entrance is repaired when the timer runs out');
await cash(100); check(await buy('item', 'entrance', 'benches'), 'a bench in the entrance');
await cash(200); check(await buy('up', 'office'), 'fixing up the office');
check(await until('game.S.officeLv(game.G) === 1', 40000), 'the office is fixed up: restaurant level 1');
check(await until('game.G.staff[0].at === "office"', 40000), 'and you sit down in it');
check(await ev('document.querySelector(".lvb b").textContent') === '1', 'the top bar shows the restaurant level');

// a station brings a dish; the cashier and a register
await cash(100); check(await buy('item', 'kitchen', 'st:hotdog') && await ev('game.S.menu(game.G).join()') === 'burger,hotdog', 'a sausage grill brings Hot Dog to the menu');
await cash(300); check(await buy('up', 'cashier') && await until('game.S.lvOf(game.G, "cashier") === 1', 30000), 'the cashier is repaired');
await cash(100); check(await buy('item', 'cashier', 'registers'), 'a register (and a cashier)');
const paidBefore = await ev('game.G.stats.served');
check(await until('game.G.cust.some((c) => c.st === "queue" || c.st === "pay")', 90000), 'people line up to pay on their way out');
check(await until(`game.G.stats.served > ${paidBefore}`, 60000), 'and pay at the register');

// renovation: not before everything in the room is at its cap; never above the office + 1
check(await ev('game.S.upBlock(game.G, "dining")') === 'items', 'the dining hall waits for everything in it to be maxed');
await ev(`(() => { const g = game.G; g.cash = 1e6; for (const id of ['tables', 'waiters', 'comfort', 'service']) while (game.S.itemCost(g, 'dining', id) != null) game.S.act(g, 'item', 'dining', id); })()`);
check(await ev('game.S.upBlock(game.G, "dining")') === null, 'maxed: it can be renovated');
await ev('game.openRoom("dining")'); await wait(500);
check(await ev('!!document.querySelector("#sheet .reno.ready [data-act=up]")'), 'the panel offers the renovation');
await shot('5-dining-ready');
await page.click('#sheet .reno [data-act="up"]');
check(await until('game.S.lvOf(game.G, "dining") === 2', 60000), 'the dining hall goes to level 2');
await ev(`(() => { const g = game.G; for (const id of ['tables', 'waiters', 'comfort', 'service']) while (game.S.itemCost(g, 'dining', id) != null) game.S.act(g, 'item', 'dining', id); })()`);
check(await ev('game.S.upBlock(game.G, "dining")') === 'office', 'level 3 waits for the office to go up first');
check(await ev('document.querySelectorAll("#sheet .irow").length >= 4 && document.querySelector("#sheet .reno .why").textContent.includes("Office")'), 'the panel says so');
await ev('game.ui.closeRoom()');

// a busier restaurant (played on fast) and how it looks
await ev(`(() => { const g = game.G, S = game.S; for (let t = 0; t < 900; t += 0.5) { for (let i = 0; i < 4; i++) { const p = S.prices(g).filter((x) => x.cost <= g.cash).sort((a, b) => a.cost - b.cost)[0]; if (!p || !S.act(g, p.a, p.room, p.id)) break; } S.tick(g, 0.5); } game.world.snap(); })()`);
await wait(1500);
check(await ev('game.G.cust.length > 8 && game.world.peek().views > 12'), 'a full house: people and staff on screen');
await shot('6-busy');

// save + reload
await ev('game.save()');
const before = await ev('({ rooms: JSON.stringify(game.G.rooms), cash: game.G.cash, served: game.G.stats.served })');
await boot('idle4.html?speed=4');
// (the reload takes a few seconds, which the restaurant plays through: it only earns more)
const after = await ev('({ rooms: JSON.stringify(game.G.rooms), cash: game.G.cash, served: game.G.stats.served })');
check(after.rooms === before.rooms && after.cash >= before.cash - 0.01 && after.served >= before.served, 'save + reload keep the rooms, the cash and the stats');
check(await ev('!document.querySelector(".modal.story")'), 'no story the second time');

// closed for two hours
await ev('game.save()');
await boot('idle4.html?away=7200');
check(await until('!!document.querySelector(".modal.awaycard.in")', 10000), 'two hours away: the card');
check(await ev('game.G.stats.served') > 0 && await ev('/\\$/.test(document.querySelector(".awaygrid b").textContent)'), 'it says what the restaurant earned');
await shot('7-away');
await page.click('.modal.in [data-x="ok"]'); await wait(400);

check(!errors.length, 'no errors' + (errors.length ? ': ' + errors.slice(0, 5).join(' | ') : ''));
await browser.close(); server.close();

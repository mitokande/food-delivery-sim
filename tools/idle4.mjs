// Headless check of Ferdi's (idle4.html), the building: the story (with the rival), the building from above with its
// room labels, you doing every job at first, a cook and a waiter taking jobs off you (you go and sit in the office once
// it's fixed up), a tap on a room opening its panel, repairing a room (the builder, the timer, the room rebuilt),
// benches, a new station bringing a dish, the cashier and a register (people pay on their way out), renovation rules
// (items at their caps, the office first), save + reload, the restaurant running while the game is closed.
// Phase 2: the quest bar (progress, claim, the next one), tips by the chairs (a tap picks one up), the mailbox (a
// letter with a gift; the takings of a long absence), the team's cap and the staff room (lockers), the locked features.
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
check(await ev('document.querySelector("#markers .rl.ruin") && document.querySelectorAll("#markers .rl.soon").length === 1'), 'ruined rooms show a repair price, the courier bay "coming soon"');
check(await ev('document.querySelector(".quest .qtext").textContent.includes("Hire a cook (0/1)")'), 'the first quest: hire a cook (0/1)');
check(await ev('document.querySelector(".teamv").textContent') === '0/5', 'the top bar shows the team: 0/5');
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
check(await ev('!game.ui.room && !document.querySelector(".quest").hidden'), 'the panel closes, the quest bar is back');
check(await ev('document.querySelector(".quest").classList.contains("done") && document.querySelector(".quest .claim") != null'), 'the quest is done: Claim');
const c0 = await ev('game.G.cash');
await page.click('.quest'); await wait(400);
check(await ev('game.G.quest.i') === 1 && await ev('game.G.cash') >= c0 + 10 - 0.01 && await ev('document.querySelector(".quest .qtext").textContent.includes("Hire a waiter")'), 'claiming pays $10, the next quest comes');
await shot('2b-quest');
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
// the post: the health office writes when the office is fixed up (with a gift)
check(await until('game.S.unread(game.G) > 0 && !document.querySelector(".slot.mail .badge").hidden', 5000), 'a letter: the mailbox shows it');
await page.click('.slot.mail'); await wait(500);
check(await ev('document.querySelectorAll(".modal.mailbox .mrow").length') >= 1, 'the mailbox lists it');
await page.click('.modal.mailbox .mrow'); await wait(500);
check(await ev('document.querySelector(".modal.lettercard .letter h2").textContent') === 'Inspection passed', 'the letter opens');
await shot('4b-letter');
const c1 = await ev('game.G.cash');
await page.click('.modal.lettercard [data-x="ok"]'); await wait(400);
check(await ev('game.G.cash') >= c1 + 40 - 0.01 && await ev('game.G.stats.letters') === 1 && await ev('game.S.unread(game.G)') === 0, 'Collect: its gift is in the cash');
// a tip by a chair: a tap picks it up
await ev('game.G.tips.length = 0'); await wait(200); await ev('game.G.tips.push({ id: 99999, seat: "d:0:0", amount: 7 })'); await ev('game.world.focus("dining", 20)'); await wait(1200);
check(await ev('!!document.querySelector("#markers .mk.tipm")'), 'a tip by a chair shows');
const c2 = await ev('game.G.cash');
await ev('document.querySelector("#markers .mk.tipm").click()'); await wait(300);
check(await ev('game.G.cash') >= c2 + 7 - 0.01 && await ev('game.G.stats.tips') === 1 && !(await ev('game.G.tips.some((t) => t.id === 99999)')), 'a tap picks it up: +$7');
// a locked feature
await page.click('.slot.locked[data-f="map"]'); await wait(300);
check(await ev('[...document.querySelectorAll(".toast")].some((t) => t.textContent.includes("City map: opens at restaurant level 4"))'), 'a locked feature says when it opens');
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
await ev(`(() => { const g = game.G; g.cash = 1e6; for (const id of ['tables', 'waiters', 'comfort', 'service']) while (game.S.itemCost(g, 'dining', id) != null && game.S.act(g, 'item', 'dining', id)); })()`);
check(await ev('game.S.upBlock(game.G, "dining")') === null, 'maxed: it can be renovated');
await ev('game.openRoom("dining")'); await wait(500);
check(await ev('!!document.querySelector("#sheet .reno.ready [data-act=up]")'), 'the panel offers the renovation');
await shot('5-dining-ready');
await page.click('#sheet .reno [data-act="up"]');
check(await until('game.S.lvOf(game.G, "dining") === 2', 60000), 'the dining hall goes to level 2');
await ev(`(() => { const g = game.G; for (const id of ['tables', 'waiters', 'comfort', 'service']) while (game.S.itemCost(g, 'dining', id) != null && game.S.act(g, 'item', 'dining', id)); })()`);
check(await ev('game.S.upBlock(game.G, "dining")') === 'office', 'level 3 waits for the office to go up first');
check(await ev('document.querySelectorAll("#sheet .irow").length >= 4 && document.querySelector("#sheet .reno .why").textContent.includes("Office")'), 'the panel says so');
await ev('game.ui.closeRoom()');

// the team: full at 5 without a staff room; its lockers make room for more (a new hire changes at one first)
await wait(300);
const team = await ev('[game.S.staffCount(game.G), document.querySelector(".teamv").textContent, game.G.staff.map((s) => s.role).join()]');
check(team[0] === 5 && team[1] === '5/5', 'a team of 5: full without a staff room' + (team[0] === 5 && team[1] === '5/5' ? '' : ': ' + team.join(' | ')));
await cash(1e5);
check(!(await buy('item', 'kitchen', 'cooks')) && await ev('game.S.itemBlock(game.G, "kitchen", "cooks")') === 'staff', 'no sixth hire');
await ev('game.openRoom("kitchen")'); await wait(500);
check(await ev('!!document.querySelector("#sheet .buy.teamfull")'), 'the kitchen panel says the team is full');
await page.click('#sheet .buy.teamfull'); await wait(500);
check(await ev('game.ui.room') === 'staff', 'which leads to the staff room');
await page.click('#sheet [data-act="up"]');
check(await until('game.S.lvOf(game.G, "staff") === 1', 60000), 'the staff room is repaired');
check(await buy('item', 'staff', 'lockers') && await ev('game.S.staffCap(game.G)') === 6, 'a locker: room for 6');
check(await buy('item', 'kitchen', 'cooks') && await ev('game.G.staff.at(-1).job?.kind') === 'locker', 'the new cook changes at a locker first');
await ev('game.ui.closeRoom()'); await ev('game.world.focus("staff", 16)'); await wait(1500);
await shot('5b-staff');

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
const held = await ev('(game.G.mail.find((m) => m.kind === "away" && !m.read) || {}).cash || 0'), c3 = await ev('game.G.cash');
check(held > 0, 'the takings wait in the mailbox');
await shot('7-away');
await page.click('.modal.in [data-x="ok"]'); await wait(400);
check(await ev('game.G.cash') >= c3 + held - 0.01 && !(await ev('game.G.mail.some((m) => m.kind === "away" && !m.read)')), 'Collect: they are in the cash');

check(!errors.length, 'no errors' + (errors.length ? ': ' + errors.slice(0, 5).join(' | ') : ''));
await browser.close(); server.close();

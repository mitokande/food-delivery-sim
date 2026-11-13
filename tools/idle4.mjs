// Headless check of Ferdi's (idle4.html), the building: the story (with the rival), the building from above with its
// room labels, you doing every job at first, a cook and a waiter taking jobs off you (you go and sit in the office once
// it's fixed up), a tap on a room opening its panel, repairing a room (the builder, the timer, the room rebuilt),
// benches, a new station bringing a dish, the cashier and a register (people pay on their way out), renovation rules
// (items at their caps, the office first), save + reload, the restaurant running while the game is closed.
// Phase 2: the quest bar (progress, claim, the next one), tips by the chairs (a tap picks one up), the mailbox (a
// letter with a gift; the takings of a long absence), the team's cap and the staff room (lockers), the locked features.
// Phase 3: the clock and the night, the events button (locked before restaurant level 2), Victor's truck (the banner,
// the camera to it, paying to move it on), a critic with a tag over his head, nothing new while the game is closed.
// Phase 4: the courier bay (repair, a courier, a delivery order cooked, bagged and ridden out on a motor, paid), tables
// left dirty and cleared, managers (locked before level 3, the card, hiring one, standing in the room, buying things for
// you, the switch).
// Phase 10: gems in the top bar, the shop (packs, prices, cash for gems, free gems for the stand-in ad, ?iap=test
// purchases, the starter pack once), finishing building work with gems.
// Phase 6: reviews and the mood (the mailbox's Reviews tab), each day's rewards, the daily gift.
// Phase 7: Rita the guide (after the story: her lines, the arrow), the fame in the top bar and on the card.
// Phase 5: the building work: scaffolding over the room, the timer over it (a tap lends a hand, up to a third of the
// time), the card when it's done (a picture of the room, what the level brings, what the office opens), the gold
// arrow on a room whose renovation is within reach.
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
// the card when a renovation is done: wait for it (→ its text), then a tap closes it
const upCard = async () => { if (!(await until('!!document.querySelector(".modal.upcard.in")', 6000))) return ''; await wait(800); return ev('document.querySelector(".modal.upcard").innerText'); };
const closeCard = async () => { await ev('document.querySelector(".modal.upcard")?.click()'); await wait(400); };

await boot('idle4.html?fresh&speed=4&adms=400');
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
// phase 7: Rita says hello (her face, her name, the line typing itself out), a tap goes on, an arrow shows what's next
check(await until('!!document.querySelector(".modal.talkm.in .tbox")', 5000), 'Rita says hello after the story');
check(await ev('document.querySelector(".talk .tname").textContent === "Rita" && document.querySelector(".talk .rita").naturalWidth > 0 && game.paused'), 'her name, her face; the restaurant waits');
await shot('1b-rita');
for (let i = 0; i < 8 && await ev('!!document.querySelector(".modal.talkm")'); i++) { await ev('document.querySelector(".modal.talkm").click()'); await wait(450); }
check(await ev('!document.querySelector(".modal.talkm") && !game.paused && game.G.seen["g:hello"]'), 'taps take her through her lines and away');
check(await until('!!document.querySelector(".pointer") && document.querySelector(".pointer").dataset.sel === ".quest"', 2000), 'an arrow points at the quest bar');
await ev('game.ui.skipGuide()'); // (the rest of her lines would only be in the way)
check(await ev('+document.querySelector(".famev").textContent.replace(/,/g, "") === game.S.fame(game.G) && game.S.fame(game.G) > 0'), 'the top bar shows the fame');

// the building: labels on every room, the ruins, the hint
check(await ev('document.querySelectorAll("#markers .mk.rlab").length') === 8, 'every room has a label');
check(await ev('document.querySelector("#markers .rl.ruin") && !document.querySelector("#markers .rl.soon") && [...document.querySelectorAll("#markers .rl.ruin")].some((e) => e.textContent.includes("Courier Bay") && e.textContent.includes("Restaurant Lv 2"))'), 'ruined rooms show a repair price (the courier bay: from restaurant level 2)');
check(await ev('document.querySelector(".quest .qtext").textContent.includes("Hire a cook (0/1)")'), 'the first quest: hire a cook (0/1)');
check(await ev('document.querySelector(".teamv").textContent') === '0/5', 'the top bar shows the team: 0/5');
check(await ev('document.querySelector(".gemsv").textContent') === String(await ev('game.S.GEMS.start')), 'and the gems a new restaurant starts with');
check(/^0[89]:\d\d$/.test(await ev('document.querySelector(".clk").textContent')), 'the clock: morning');
await page.click('.slot.events'); await wait(300);
check(await ev('document.querySelector(".slot.events").classList.contains("locked") && [...document.querySelectorAll(".toast")].some((t) => t.textContent.includes("Events: opens at restaurant level 2"))'), 'events: locked before restaurant level 2');
await page.click('.slot.managers'); await wait(300);
check(await ev('document.querySelector(".slot.managers").classList.contains("locked") && [...document.querySelectorAll(".toast")].some((t) => t.textContent.includes("Managers: opens at restaurant level 3"))'), 'managers: locked before restaurant level 3');
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
// (held still while the timer is looked at)
await ev('game.paused = true');
check(await until('game.world.peek().scaffold === "entrance"', 3000), 'scaffolding goes up over the entrance');
check(await until('/^\\d\\d:\\d\\d$/.test(document.querySelector("#markers .mk.bmk .bt")?.textContent || "")', 3000), 'a timer over it (mm:ss)');
const dur0 = await ev('game.G.build.dur');
for (let i = 0; i < 2; i++) await ev('document.querySelector("#markers .mk.bmk").click()');
const [dur1, help1] = await ev('[game.G.build.dur, game.G.build.help]');
check(Math.abs(dur0 - dur1 - 2) < 0.01 && Math.abs(help1 - 2) < 0.01, 'two taps on the timer: 2 s off');
await ev('game.G.build.help = game.G.build.dur / 2'); // (a third of the whole work done by tapping)
await ev('document.querySelector("#markers .mk.bmk").click()');
check(Math.abs(await ev('game.G.build.dur') - dur1) < 0.01 && await until('!!document.querySelector("#markers .mk.bmk.maxed")', 2000), 'no more than a third of it: the timer stops taking taps');
await ev('game.paused = false');
await wait(800); await shot('4-repairing');
check(await until('game.S.lvOf(game.G, "entrance") === 1', 30000), 'the entrance is repaired when the timer runs out');
const card1 = await upCard();
check(card1.includes('Entrance repaired') && card1.includes('Open again!') && card1.includes('Waiting benches'), 'the card: Entrance repaired, what it holds now' + (card1 ? '' : ' (no card)'));
check(await ev(`(() => { const c = document.querySelector(".modal.upcard .uppic canvas"); if (!c) return false; const d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data; let lo = 255, hi = 0; for (let i = 0; i < d.length; i += 4 * 97) { const v = d[i] + d[i + 1] + d[i + 2]; lo = Math.min(lo, v); hi = Math.max(hi, v); } return hi - lo > 120; })()`), 'with a picture of the room');
check(await ev('game.world.peek().scaffold === null && !document.querySelector("#markers .mk.bmk")'), 'the scaffolding and the timer are gone');
await shot('4c-upcard');
await closeCard();
check(await ev('!document.querySelector(".modal.upcard")'), 'a tap closes the card');
await cash(100); check(await buy('item', 'entrance', 'benches'), 'a bench in the entrance');
await cash(200); check(await buy('up', 'office'), 'fixing up the office');
check(await until('game.S.officeLv(game.G) === 1', 40000), 'the office is fixed up: restaurant level 1');
const card2 = await upCard();
check(card2.includes('Restaurant Lv 1!') && card2.includes('Unlocked') && await ev('!!document.querySelector(".modal.upcard .tile[data-room=staff] canvas")'), 'its card: restaurant level 1, the staff room unlocked (with a picture)');
await closeCard();
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
await upCard(); await closeCard();
await cash(100); check(await buy('item', 'cashier', 'registers'), 'a register (and a cashier)');
const paidBefore = await ev('game.G.stats.served');
check(await until('game.G.cust.some((c) => c.st === "queue" || c.st === "pay")', 90000), 'people line up to pay on their way out');
check(await until(`game.G.stats.served > ${paidBefore}`, 60000), 'and pay at the register');

// renovation: not before everything in the room is at its cap; never above the office + 1
check(await ev('game.S.upBlock(game.G, "dining")') === 'items', 'the dining hall waits for everything in it to be maxed');
await ev(`(() => { const g = game.G; g.cash = 1e6; for (const id of Object.keys(game.S.ROOMS.dining.items)) while (game.S.itemCost(g, 'dining', id) != null && game.S.act(g, 'item', 'dining', id)); })()`);
check(await ev('game.S.upBlock(game.G, "dining")') === null, 'maxed: it can be renovated');
check(await until('/Lv 2/.test(document.querySelector("#markers .rl .lvup")?.textContent || "")', 2000), 'its label: a gold arrow, Lv 2');
await ev('game.openRoom("dining")'); await wait(500);
check(await ev('!!document.querySelector("#sheet .reno.ready [data-act=up]")'), 'the panel offers the renovation');
await shot('5-dining-ready');
await page.click('#sheet .reno [data-act="up"]');
check(await until('game.S.lvOf(game.G, "dining") === 2', 60000), 'the dining hall goes to level 2');
const card3 = await upCard();
check(card3.includes('Upgrade complete!') && /Tables\s*4\s*6/.test(card3) && /Upgrades up to\s*Lv 5\s*Lv 10/.test(card3), 'its card: tables 4 → 6, upgrades up to Lv 10');
check(/Fame\s*[\d.,K]+\s*[\d.,K]+/.test(card3), 'and the fame before → after');
await closeCard();
// (from here on the cards would only be in the way)
await ev('game.ui.upCard = game.ui.upgraded; game.ui.upgraded = () => {}');
await ev(`(() => { const g = game.G; for (const id of Object.keys(game.S.ROOMS.dining.items)) while (game.S.itemCost(g, 'dining', id) != null && game.S.act(g, 'item', 'dining', id)); })()`);
check(await ev('game.S.upBlock(game.G, "dining")') === 'office', 'level 3 waits for the office to go up first');
check(await ev('document.querySelectorAll("#sheet .irow").length >= 4 && document.querySelector("#sheet .reno .why").textContent.includes("Office")'), 'the panel says so');
await ev('game.ui.closeRoom()');

// phase 10: the shop (gem packs: no store on the web; cash for gems; free gems for the stand-in ad), finishing building
// work with gems or an ad
await ev('game.G.gems = 100'); await wait(200);
await page.click('.nav4 .slot.shop'); await wait(600);
check(await ev('document.querySelectorAll(".modal.shopcard .pack").length === 5 && !!document.querySelector(".modal.shopcard .offer")'), 'the shop: five gem packs and the starter pack');
check(await until('[...document.querySelectorAll(".modal.shopcard .price")].every((e) => e.textContent === "In the app")', 3000), 'no store on the web: "In the app"');
const sk = await ev('[game.G.cash, game.S.skipCash(game.G, "skip30")]');
await page.click('.modal.shopcard [data-skip="skip30"]'); await wait(400);
check(await ev('game.G.gems') === 80 && await ev('game.G.cash') >= sk[0] + sk[1] * 0.9, '30 minutes of income for 20 gems');
await page.click('.nav4 .slot.shop'); await wait(600);
await shot('9e-shop');
await page.click('.modal.shopcard [data-x="adgems"]'); await wait(300);
check(await ev('!!document.querySelector(".modal.adcard .adring") && game.paused'), 'free gems: the stand-in ad plays (and the restaurant waits)');
check(await until('game.G.gems === 85 && !document.querySelector(".modal.adcard")', 3000), 'watched to the end: +5 gems');
check(await ev('game.S.adsLeft(game.G, "gems", game.today())') === 2, 'two more today');
await ev('document.querySelectorAll(".modal").forEach((m) => m.remove()); game.paused = false');
await ev('(() => { const g = game.G; g.build = null; g.build = { room: "entrance", to: game.S.lvOf(g, "entrance") + 1, t0: g.t, dur: 200 }; game.openRoom("entrance"); })()'); await wait(600);
const fin = await ev('[game.S.buildGems(game.G), game.S.lvOf(game.G, "entrance"), game.G.gems]');
check(fin[0] >= 6 && fin[0] <= 7 && await ev('!!document.querySelector("#sheet [data-act=finish]") && !!document.querySelector("#sheet [data-act=adbuild]")'), 'building work: Finish now for gems, or an ad');
await page.click('#sheet [data-act="finish"]');
check(await until(`game.S.lvOf(game.G, "entrance") === ${fin[1] + 1}`, 3000) && await ev('game.G.gems') === fin[2] - fin[0], 'finished at once, for its gems');
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

// phase 6: reviews and the mood; the days and their rewards; the daily gift
check(await ev('game.G.rep.reviews.length > 0 && game.G.rep.mood > 0 && game.G.rep.mood < 1 && game.G.rep.reviews.every((r) => typeof r.text === "string" && /^c[1-8]$/.test(r.face))'), 'people leave reviews; the mood moves');
await ev('game.ui.mailbox()'); await wait(500);
await page.click('.modal.mailbox [data-tab="reviews"]'); await wait(400);
check(await ev('document.querySelectorAll(".modal.mailbox .rv").length') === Math.min(30, await ev('game.G.rep.reviews.length')) && /^\d+%$/.test(await ev('document.querySelector(".mtrack b").textContent')), 'the mailbox\'s Reviews tab: the mood bar, what people wrote');
check(await ev('game.G.rep.seen > 0 && game.G.rep.reviews.filter((r) => r.id <= game.G.rep.seen).length > 0'), 'and they count as read');
await shot('6c-reviews');
await page.click('.modal.mailbox [data-x="days"]'); await wait(600);
check(await ev('document.querySelectorAll(".modal.dayscard .cb").length >= 1 && document.querySelectorAll(".modal.dayscard .tier").length === 5 && /\\d\\d:\\d\\d:\\d\\d/.test(document.querySelector(".dleft").textContent)'), 'Daily rewards: the days, the five tiers, the time left today');
await ev('document.querySelector(".modal.dayscard [data-x=close]").click()'); await wait(400);
await ev('(() => { game.realToday = game.today; const d = game.G.rep.day; d.sum = 0.8 * Math.max(1, d.n); d.n = Math.max(1, d.n); game.today = () => "2099-01-02"; game.checkDay(); })()');
check(await ev('(() => { const m = game.G.mail.find((x) => x.kind === "daily"); return !!m && m.cash > 0 && m.tier === 3 && game.G.rep.hist.length > 0 && game.G.rep.day.key === "2099-01-02"; })()'), 'a new day: yesterday\'s mood (a happy day) sends a reward by mail');
const c4 = await ev('game.G.cash'), gift1 = await ev('game.S.signinCash(game.G, 0)');
await ev('game.ui.signin()'); await wait(500);
check(await ev('!!document.querySelector(".modal.signin .stile.today") && document.querySelectorAll(".modal.signin .stile").length === 7'), 'the daily gift: seven days, today\'s lit');
await shot('6d-signin');
await page.click('.modal.signin [data-x="claim"]'); await wait(500);
const claimed = await ev('[game.G.cash, game.G.daily.n, game.S.signinDue(game.G, "2099-01-02")]');
check(claimed[0] >= c4 + gift1 * 0.9 && claimed[1] === 1 && !claimed[2], 'claimed: the cash, and not again today' + (claimed[1] === 1 ? '' : `: ${JSON.stringify({ claimed, c4, gift1 })}`));
await ev('(() => { game.today = game.realToday; game.ui.skipGuide(); document.querySelectorAll(".modal").forEach((m) => m.remove()); game.paused = false; })()');

// the office at level 2: the terrace, the courier bay and the events open
await ev('(() => { const g = game.G; if (g.rooms.office.lv < 2) g.rooms.office.lv = 2; game.ui.upCard("office", 2); })()');
const card4 = await upCard();
check(card4.includes('Restaurant Lv 2!') && ['Terrace', 'Courier Bay', 'Events'].every((x) => card4.includes(x)) && await ev('document.querySelectorAll(".modal.upcard .tile").length') === 3, 'the office\'s card at level 2: Terrace, Courier Bay and Events unlocked');
await shot('6b-office2');
await closeCard();

// events: Victor's truck (the banner, the camera to it, paying to move it on), a critic
await ev('(() => { const g = game.G; if (g.rooms.office.lv < 2) g.rooms.office.lv = 2; g.event = null; g.cash = Math.max(g.cash, 1e6); game.S.startEvent(g, "threat"); })()'); await wait(800);
check(await ev('!document.querySelector(".evbar").hidden && document.querySelector(".evbar").classList.contains("threat") && !document.querySelector(".slot.events").classList.contains("locked")'), 'Victor\'s truck: the banner, the events button open');
await page.click('.evbar'); await wait(1800);
check(await ev('game.world.peek().cars[0].on && game.world.peek().cam.z > 22'), 'a tap on the banner: the camera goes to the truck in the street');
await shot('8-truck');
await page.click('.slot.events'); await wait(500);
check(await ev('!!document.querySelector(".modal.eventscard [data-x=repel]")'), 'the events card offers to move it on');
await shot('8b-events');
await page.click('.modal.eventscard [data-x="repel"]'); await wait(500);
check(await ev('!game.G.event && game.G.evLog[0].kind === "threat" && game.G.evLog[0].paid > 0'), 'paid: the truck moves on');
await ev('game.S.startEvent(game.G, "critic")');
check(await until('!!document.querySelector("#markers .mk.viptag .vt.critic")', 5000), 'a critic walks in with a tag over his head');
// the courier bay: repair it, hire a courier; an order from the app is cooked, bagged, ridden out on a motor and paid
await ev('(() => { const g = game.G; g.event = null; g.evNext = g.t + 9999; g.cash = Math.max(g.cash, 1e7); })()');
// (the busy restaurant above may have done it already)
if (!(await ev('game.S.lvOf(game.G, "bay")'))) await until('!game.G.build', 60000), await buy('up', 'bay');
check(await until('game.S.lvOf(game.G, "bay") >= 1', 60000), 'the courier bay is repaired');
if (!(await ev('game.S.nCouriers(game.G)'))) await buy('item', 'bay', 'couriers');
check(await ev('game.G.staff.some((s) => s.role === "courier")'), 'a courier');
check(await until('game.G.staff.some((s) => s.role === "courier" && s.job?.kind === "deliver" && s.st === "work" && s.anim === "ride")', 120000), 'a delivery order cooked, bagged and taken out');
check(await until('game.world.peek().bikes.some((b) => b.on && b.x > 27)', 8000), 'the courier rides out of the garage on a motor');
await ev('game.world.lookAt(27, 8, 18)'); await wait(1200); await shot('9-courier');
check(await until('game.G.stats.delivered > 0', 60000), 'delivered and paid');
// tables left dirty are cleared by the waiters
check(await ev('game.G.stats.cleared') > 0, 'waiters clear the tables people leave');
// managers: locked before restaurant level 3; then hire the head chef, who stands in the kitchen and buys things
await ev('(() => { const g = game.G; if (g.rooms.office.lv < 3) g.rooms.office.lv = 3; g.mgr = {}; })()'); await wait(300);
await page.click('.slot.managers'); await wait(500);
check(await ev('document.querySelectorAll(".modal.managerscard .mgrrow").length') === 7, 'the managers card: one for each room');
await shot('9b-managers');
await page.click('.modal.managerscard [data-act="mgr"][data-room="kitchen"]'); await wait(600);
check(await ev('!!game.G.mgr.kitchen && game.G.mgr.kitchen.auto'), 'the head chef is hired (and buys for you)');
await page.click('.modal.managerscard [data-x="close"]'); await wait(300);
check(await until('game.world.peek().managers === 1', 3000), 'and stands in the kitchen');
await ev('(() => { const g = game.G; g.rooms.kitchen.it["st:burger"] = 1; g.cash = Math.max(g.cash, 1e7); })()'); // (something to buy)
const kit0 = await ev('Object.values(game.G.rooms.kitchen.it).reduce((a, b) => a + b, 0)');
check(await until(`Object.values(game.G.rooms.kitchen.it).reduce((a, b) => a + b, 0) > ${kit0}`, 8000), 'the head chef buys things in the kitchen');
await ev('game.openRoom("kitchen")'); await wait(500);
check(await ev('!!document.querySelector("#sheet .mgrrow.on")'), 'the kitchen panel shows the head chef');
await page.click('#sheet [data-act="mgrauto"]'); await wait(300);
check(await ev('game.G.mgr.kitchen.auto === false'), 'the switch: no more buying');
await ev('game.ui.closeRoom()');
// the night
await ev('(() => { const g = game.G, h = game.S.hourOf(g); g.t += ((23 - h + 24) % 24) / 24 * game.S.DAY.len; })()'); await wait(800);
check(await ev('game.world.scene.background.getHSL({}).l < 0.25 && document.querySelector(".clk").textContent.startsWith("23")'), 'at 23:00 it is night');
await shot('8c-night');

// save + reload
await ev('game.save()');
const before = await ev('({ rooms: JSON.stringify(game.G.rooms), cash: game.G.cash, served: game.G.stats.served })');
await boot('idle4.html?speed=4&iap=test');
// (the reload takes a few seconds, which the restaurant plays through: it only earns more)
const after = await ev('({ rooms: JSON.stringify(game.G.rooms), cash: game.G.cash, served: game.G.stats.served })');
check(after.rooms === before.rooms && after.cash >= before.cash - 0.01 && after.served >= before.served, 'save + reload keep the rooms, the cash and the stats');
check(await ev('!document.querySelector(".modal.story")'), 'no story the second time');
// gem packs, bought (?iap=test: the purchase always goes through, as the store would say)
await ev('(() => { game.ui.skipGuide(); document.querySelectorAll(".modal").forEach((m) => m.remove()); game.paused = false; })()');
const gm0 = await ev('game.G.gems');
await page.click('.nav4 .slot.shop'); await wait(600);
check(await until('document.querySelector(".modal.shopcard .price").textContent === "$1.99"', 3000), 'test mode: the packs have prices');
await page.click('.modal.shopcard [data-pack="ferdis_gems_80"]');
check(await until(`game.G.gems === ${gm0 + 80} && !document.querySelector(".modal.shopcard")`, 3000), 'a gem pack bought: +80 gems');
await page.click('.nav4 .slot.shop'); await wait(600);
await page.click('.modal.shopcard [data-pack="ferdis_starter"]');
check(await until(`game.G.gems === ${gm0 + 380} && game.G.shop.starter`, 3000), 'the starter pack: +300 gems (and its cash)');
await page.click('.nav4 .slot.shop'); await wait(600);
check(await ev('!document.querySelector(".modal.shopcard .offer")'), 'once only: the offer is gone');
await ev('document.querySelectorAll(".modal").forEach((m) => m.remove()); game.paused = false; game.save()');

// closed for two hours (an event is due when it closes: nothing new may start while it is)
await ev('(() => { const g = game.G; g.event = null; g.evNext = g.t; g.evLog.length = 0; g.cust = g.cust.filter((c) => !c.vip); })()');
await ev('game.save()');
await boot('idle4.html?away=7200');
check(await until('!!document.querySelector(".modal.awaycard.in")', 10000), 'two hours away: the card');
check(await ev('game.G.stats.served') > 0 && await ev('/\\$/.test(document.querySelector(".awaygrid b").textContent)'), 'it says what the restaurant earned');
const held = await ev('(game.G.mail.find((m) => m.kind === "away" && !m.read) || {}).cash || 0'), c3 = await ev('game.G.cash');
check(held > 0, 'the takings wait in the mailbox');
await shot('7-away');
await page.click('.modal.in [data-x="ok"]'); await wait(400);
check(await ev('game.G.cash') >= c3 + held - 0.01 && !(await ev('game.G.mail.some((m) => m.kind === "away" && !m.read)')), 'Collect: they are in the cash');
check(await ev('game.G.evLog.length === 0 && !game.G.event'), 'no new event started while the game was closed');

check(!errors.length, 'no errors' + (errors.length ? ': ' + errors.slice(0, 5).join(' | ') : ''));
await browser.close(); server.close();

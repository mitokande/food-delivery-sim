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
// Phase 8: the city (locked before level 3; the map, its pins, the tickets), a Gristle Burger's panel (who cooks there,
// who goes with which dishes), a cook-off (the game paused, a skill, the win: stars, cash and chef's hats; a loss: the
// tips), tickets for gems, a district's head office beaten (a Ferdi's there: every bill pays more), training a manager
// with hats (the bonus grows), a save from before the new quests keeping its place.
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
// (a repair: the ruin counts as cleared out by hand already, with nothing found in it; that step has its own checks)
const buy = (a, room, id) => ev(`(() => { const r = game.G.rooms['${room}']; if (${a === 'up'} && game.S.needsFix(game.G, '${room}')) r.fix = 0; return game.act('${a}', '${room}', ${id ? `'${id}'` : 'undefined'}); })()`).then((r) => !!r);
const cash = (n) => ev(`game.G.cash = ${n}`);
// the card when a renovation is done: wait for it (→ its text), then a tap closes it
const upCard = async () => { if (!(await until('!!document.querySelector(".modal.upcard.in")', 6000))) return ''; await wait(800); return ev('document.querySelector(".modal.upcard").innerText'); };
// the mini game on screen, played through its peek() by `move` (what peek() shows, the stage's box → a point to tap or
// null) until the card with its stars is up: → the taps made (-1: no card); `name`: a screenshot after a few taps
const playMini = async (move, name) => {
  const box = await ev('(() => { const r = document.querySelector(".mstage").getBoundingClientRect(); return [r.left, r.top, r.width, r.height]; })()');
  for (let t0 = Date.now(), n = 0, shown = !name; Date.now() - t0 < 45000;) {
    const s = await ev('({ res: !!document.querySelector(".modal.mres.in"), peek: game.ui.playing?.peek?.() ?? null })');
    if (s.res) return n;
    const at = s.peek && move(s.peek, box);
    if (at) { await page.touchscreen.tap(at[0], at[1]); n++; }
    if (!shown && n >= 3) { shown = true; await wait(150); await page.screenshot({ path: `${OUT}/idle4-${name}.png` }); console.log('shot', name); }
    await wait(25);
  }
  return -1;
};
// a repair game with no room at stake (game.fix(room, true)), played by `move` (what peek() shows, the stage's box:
// it makes its own touches) until its card is up: → the stars on the card (-1: no card)
const playFix = async (room, move, name) => {
  ev(`game.fix('${room}', true)`);
  if (!(await until('!!document.querySelector(".mstage .fix") && document.querySelector(".mcount").hidden', 15000))) return -1;
  const box = await ev('(() => { const r = document.querySelector(".mstage").getBoundingClientRect(); return [r.left, r.top, r.width, r.height]; })()');
  for (let t0 = Date.now(), n = 0; Date.now() - t0 < 40000; n++) {
    const s = await ev('({ res: !!document.querySelector(".modal.mres.in"), on: !!document.querySelector(".modal.minim.in"), peek: game.ui.playing?.peek?.() ?? null })');
    if (s.res) break;
    if (s.on && !(await ev('!!document.querySelector(".mini.won") || !document.querySelector(".mcount").hidden'))) await move(s.peek, box, n);
    if (n === 2) { await page.screenshot({ path: `${OUT}/idle4-${name}.png` }); console.log('shot', name); }
    await wait(30);
  }
  if (!(await until('!!document.querySelector(".modal.mres.in")', 3000))) return -1;
  await wait(900);
  const stars = await ev('document.querySelectorAll(".modal.mres .mstars span.on").length');
  await ev('document.querySelector(".modal.mres [data-x=close]").click()'); await wait(450);
  return stars;
};
const drag = async (pts) => { await page.touchscreen.touchStart(pts[0][0], pts[0][1]); for (const [x, y] of pts.slice(1)) { await page.touchscreen.touchMove(x, y); } await page.touchscreen.touchEnd(); };
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
await ev('game.ui.skipGuide(); game.ui.guideOff = true'); // (the rest of her lines would only be in the way; nor the inspector's offer, till its turn)
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
check(await ev('document.querySelector(".slot.managers").classList.contains("locked") && [...document.querySelectorAll(".toast")].some((t) => t.textContent.includes("Crew: opens at restaurant level 3"))'), 'managers: locked before restaurant level 3');
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
// first a ruin is cleared out by hand (fix.js): the entrance's boards, from its panel
await cash(100);
check(!(await ev('!!game.S.act(game.G, "up", "entrance")')) && await ev('game.S.upBlock(game.G, "entrance") === "fix" && !game.G.build'), 'a ruin can\'t be repaired before it is cleared out by hand');
check(await until('[...document.querySelectorAll("#markers .rfix.byhand")].length >= 3 && !!document.querySelector("#markers .rfix.locked")', 3000), 'the ruins say "Fix it up!" (not the ones the office gates)');
await ev('game.openRoom("entrance")'); await wait(600);
check(await ev('!!document.querySelector("#sheet [data-act=fix]") && !document.querySelector("#sheet [data-act=up]") && document.querySelectorAll("#sheet .mtiers > span").length === 3 && !document.querySelector("#sheet [data-act=fixskip]")'), 'its panel: the game first, what the stars find, no repair button yet');
check(await ev('document.querySelector("#sheet .mtiers").textContent.replace(/\\s/g, "") === "+$5+$10+$15"'), 'the entrance: $5, $10, $15 in the mess');
await shot('4a-fix-panel');
await page.click('#sheet [data-act="fix"]');
check(await until('document.querySelectorAll(".mstage .fp").length === 5 && document.querySelectorAll(".mstage .fn").length === 10 && document.querySelector(".mstage .msurf").naturalWidth > 0', 10000) && await ev('game.paused'), 'the boards over the door: five, two nails each, the game paused');
const pulls = await playMini((list) => list[0] && [list[0].x, list[0].y], '4b-planks');
check(pulls >= 10 && pulls <= 20, `every nail pulled, the rusty ones twice (${pulls} taps)`);
check(await ev('game.G.rooms.entrance.fix === 3 && Math.abs(game.G.cash - 115) < 0.01 && game.G.stats.fixes === 1 && /\\+\\$15/.test(document.querySelector(".modal.fixres").textContent)'), 'three stars: $15 found in the mess');
await shot('4c-fix-done');
await page.click('.modal.fixres [data-x="room"]'); await wait(700);
check(await ev('game.ui.room === "entrance" && !!document.querySelector("#sheet [data-act=up]") && !!document.querySelector("#sheet .fixed") && !document.querySelector("#sheet [data-act=fix]")'), 'back in its panel: cleared, now the builders (Repair)');
check(await ev('game.S.fixRoom(game.G, "entrance", 1) === null'), 'once only');
await shot('4d-fix-repair');
await page.click('#sheet [data-act="close"]'); await wait(400);
// (the rules: too little is a try again, two of those and the crew can do it; the gate; what the stars are worth)
check(await ev(`(() => { const S = game.S, g = JSON.parse(JSON.stringify(game.G)); const a = S.fixRoom(g, 'cashier', 0.1), skip0 = S.canSkipFix(g, 'cashier'), b = S.fixRoom(g, 'cashier', 0.2), skip1 = S.canSkipFix(g, 'cashier'), c0 = g.cash, c = S.fixRoom(g, 'cashier', null);
  return !a.done && !skip0 && !b.done && skip1 && c.done && c.cash === 0 && g.cash === c0 && g.rooms.cashier.fix === 0 && S.upBlock(g, 'cashier') !== 'fix'; })()`), 'under one star: try again; after two tries the crew can do it (for nothing)');
check(await ev(`(() => { const S = game.S, g = JSON.parse(JSON.stringify(game.G)); return !S.canFix(g, 'terrace') && S.fixRoom(g, 'terrace', 1) === null && S.upBlock(g, 'terrace') === 'gate' && !S.needsFix(g, 'kitchen') && [1, 2, 3].map((t) => S.fixCash('bay', t)).join() === '200,375,625' && S.fixTier('office', 0.96) === 2 && S.fixTier('office', 0.97) === 3; })()`), 'not before the office lets the room be repaired; the stars pay a share of the repair');
// the other five, for a try
check(await playFix('cashier', async (list) => { const w = list?.[0]; if (w) await drag([[w.from.x, w.from.y], [(w.from.x + w.to.x) / 2, w.to.y - 20], [w.to.x, w.to.y]]); }, '4e-wires') === 3, 'the wires: each dragged to its colour, three stars');
check(await playFix('office', async (_, [L, T, W, H], n) => { const y = T + H * (0.04 + (n % 14) * 0.072); await drag([[L + W * 0.1, y], [L + W * 0.35, y], [L + W * 0.65, y], [L + W * 0.9, y], [L + W * 0.5, y + 6], [L + W * 0.1, y + 6]]); }, '4f-paint') >= 2, 'the paint: the wall rolled over');
check(await playFix('staff', async (list) => { if (list?.[0]) await page.touchscreen.tap(list[0].x, list[0].y); }, '4g-leaks') === 3, 'the leaks: every one shut in time, three stars');
check(await playFix('terrace', async (list) => { const w = list?.[0]; if (w) await drag([[w.x, w.y], [w.x + 30, w.y - 30], [w.x + 70, w.y - 70], [w.x + 90, w.y - 90]]); }, '4h-weeds') === 3, 'the weeds: all swiped away, three stars');
check(await playFix('bay', async (list) => { const b = list?.[0]; if (b) await drag([...Array(14)].map((_, i) => [b.x + Math.cos(i) * b.r, b.y + Math.sin(i) * b.r])); }, '4i-bolts') === 3, 'the bolts: turned tight, three stars');
check(await ev('game.G.stats.fixes === 1 && game.G.rooms.cashier.fix == null && !game.paused'), 'a try changes nothing');
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
await page.click('.slot.city.locked'); await wait(300);
check(await ev('[...document.querySelectorAll(".toast")].some((t) => t.textContent.includes("The city: opens at restaurant level 3"))'), 'a locked feature says when it opens');
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
// (cleared out by hand first: the leaks, for the room this time)
await page.click('#sheet [data-act="fix"]');
await until('!!document.querySelector(".mstage .fix.leaks")', 15000);
const cf = await ev('game.G.cash');
await playMini((list) => list[0] && [list[0].x, list[0].y]);
check(await ev('game.G.rooms.staff.fix === 3 && Math.abs(game.G.cash - ' + (cf + 75) + ') < 0.01'), 'the staff room\'s leaks shut: three stars, $75 in the mess');
await page.click('.modal.fixres [data-x="room"]'); await wait(700);
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

// events: Victor's truck (the banner; its mini game: flyers handed out in the street, the people won over count as
// served; then the camera to it, paying to move it on), a critic (his plate cooked by hand; the review's card)
await ev('(() => { const g = game.G; if (g.rooms.office.lv < 2) g.rooms.office.lv = 2; g.event = null; g.cash = Math.max(g.cash, 1e6); game.S.startEvent(g, "threat"); })()'); await wait(800);
check(await ev('!document.querySelector(".evbar").hidden && document.querySelector(".evbar").classList.contains("threat") && !document.querySelector(".slot.events").classList.contains("locked")'), 'Victor\'s truck: the banner, the events button open');
check(await ev('game.S.miniOf(game.G) === "threat" && document.querySelector(".evbar").classList.contains("play") && /flyers/i.test(document.querySelector(".evbar small").textContent)'), 'the banner offers its mini game: flyers');
await page.click('.evbar');
check(await until('!!document.querySelector(".modal.minim.k-threat .mstage .flyers")', 8000) && await ev('game.paused && document.querySelector(".mstage .msurf").naturalWidth > 0'), 'a tap on the banner: the street, the restaurant waits');
{
  // (a flyer to everyone walking by; and one, by mistake, to one of Victor's crew)
  let crew = 0;
  const taps = await playMini((list) => { const w = list.find((q) => q.at > 0.22 && q.at < 0.8 && (!q.crew || !crew)); if (w && w.crew) crew++; return w && [w.x, w.y]; }, '8a-flyers');
  await wait(900);
  const fl = await ev('(() => { const e = game.G.event, S = game.S; return { mini: e?.mini, won: e?.won, need: e?.need, tier: S.miniTier("threat", e?.mini ?? 0), cut: S.MINI.threat.cut, stars: document.querySelectorAll(".modal.mres .mstars .on").length, text: document.querySelector(".modal.mres").innerText, can: S.miniOf(game.G), paused: game.paused }; })()');
  check(taps > 8 && fl.mini >= 0.65 && fl.tier >= 2 && fl.stars === fl.tier && /took a flyer/.test(fl.text) && (!crew || /wasted/.test(fl.text)), `${taps} taps: ${fl.text.match(/\d+\/\d+/)?.[0]} took a flyer${crew ? ', one wasted on his crew' : ''}: ${fl.tier} stars`);
  check(fl.won === Math.ceil(fl.need * fl.cut[fl.tier]) && fl.won > 0 && !fl.can && fl.paused, `they count as served: +${fl.won} of the ${fl.need}; once a truck`);
  await shot('8a2-flyers-stars');
  await page.click('.modal.mres [data-x="close"]'); await wait(500);
  check(await ev(`!game.paused && !document.querySelector(".evbar").classList.contains("play") && +document.querySelector(".evbar small b").textContent.split("/")[0] >= ${fl.won}`), 'the game goes on; the banner counts them');
}
await page.click('.evbar'); await wait(1800);
check(await ev('game.world.peek().cars[0].on && game.world.peek().cam.z > 22'), 'a tap on the banner: the camera goes to the truck in the street');
await shot('8-truck');
await page.click('.slot.events'); await wait(500);
check(await ev('!!document.querySelector(".modal.eventscard [data-x=repel]")'), 'the events card offers to move it on');
await shot('8b-events');
await page.click('.modal.eventscard [data-x="repel"]'); await wait(500);
check(await ev('!game.G.event && game.G.evLog[0].kind === "threat" && game.G.evLog[0].paid > 0'), 'paid: the truck moves on');
await ev('game.ui.guideOff = false; game.S.startEvent(game.G, "critic")');
check(await until('!!document.querySelector(".modal.offer.k-critic.in [data-x=go]")', 5000) && await ev('game.paused && document.querySelector(".modal.offer .rsay img").naturalWidth > 0'), 'a critic: an offer to cook his plate yourself, the restaurant waits');
await shot('8c-critic');
await page.click('.modal.offer [data-x="no"]'); await wait(500);
await ev('game.ui.guideOff = true');
check(await until('!!document.querySelector("#markers .mk.viptag .vt.critic")', 5000), 'he walks in with a tag over his head');
check(await ev('game.S.miniOf(game.G) === "critic" && document.querySelector(".evbar").classList.contains("play") && /cook/i.test(document.querySelector(".evbar small").textContent)'), '"Leave it to the kitchen": the banner still offers it');
// (what the stove is asked to sound like: the names played, and the sizzle's level as the needle runs)
await ev(`(() => { const a = game.audio, play = a.play, voice = a.voice, log = window.__snd = { play: [], loop: [], live: 0, sets: 0, top: 0, stops: 0 };
  a.play = (n, o) => { log.play.push(n); return play(n, o); };
  a.voice = (n, o) => { const v = voice(n, o); log.loop.push(n); if (v) log.live++; return { set(x) { log.sets++; log.top = Math.max(log.top, x?.vol ?? 0); v?.set(x); }, stop(f) { log.stops++; v?.stop(f); } }; }; })()`);
await page.click('.evbar');
check(await until('!!document.querySelector(".modal.minim.k-critic .mstage .cook")', 8000) && await ev('game.paused && document.querySelector(".mstage .msurf").naturalWidth > 0'), 'a tap on the banner: the stove, the restaurant waits');
{
  // (each thing taken off the heat as the needle comes into the green)
  const taps = await playMini((k, [L, T, W, H]) => (k.phase === 'cook' && k.p >= k.z - k.hw * 0.5 ? [L + W / 2, T + H * 0.6] : null), '8d-cook');
  await wait(900);
  const ck = await ev('(() => { const e = game.G.event, S = game.S; return { mini: e?.mini, tier: S.miniTier("critic", e?.mini ?? 0), stars: document.querySelectorAll(".modal.mres .mstars .on").length, text: document.querySelector(".modal.mres").innerText, can: S.miniOf(game.G), paused: game.paused }; })()');
  check(taps === 5 && ck.mini >= 0.65 && ck.tier >= 2 && ck.stars === ck.tier && /perfect/.test(ck.text) && !ck.can && ck.paused, `five things off the heat in the green (${ck.text.match(/\d+ perfect · \d+ good/)?.[0]}): ${ck.tier} stars; once a critic`);
  await shot('8e-cook-stars');
  const snd = await ev(`(async () => { const l = window.__snd, n = (k) => l.play.filter((x) => x === k).length, m = await (await fetch('assets/audio/manifest.json')).json(), ac = new AudioContext();
    const len = await Promise.all(['sizzle', 'drop', 'flip', 'take', 'burnt', 'ignite', 'bell'].map(async (f) => (m['cook-' + f] ? (await ac.decodeAudioData(await (await fetch('assets/audio/cook-' + f + '.mp3')).arrayBuffer())).duration : 0)));
    return { loop: l.loop.join(), live: l.live, sets: l.sets, top: l.top, stops: l.stops, ignite: n('cook-ignite'), drop: n('cook-drop'), flip: n('cook-flip'), take: n('cook-take'), bell: n('cook-bell'), hop: n('hop'), len, ready: game.audio.ready }; })()`);
  check(snd.ready && snd.loop === 'cook-sizzle' && snd.live === 1 && snd.sets > 50 && snd.top > 0.6 && snd.top <= 1.2 && snd.stops === 1, `the skillet sizzles with the needle (a recorded loop, steered ${snd.sets} times, up to ${snd.top.toFixed(2)}) and goes quiet with the plate`);
  check(snd.ignite === 1 && snd.drop === 4 && snd.flip === 1 && snd.take === 5 && snd.bell === 1 && snd.hop === 1 && snd.len.every((d) => d > 0.3) && snd.len[0] >= 6, `and around it: the burner, ${snd.drop} things landing, a flip, ${snd.take} off with the spatula, the bell (seven recordings, all decode)`);
  await page.click('.modal.mres [data-x="close"]'); await wait(400);
  check(await until('!!document.querySelector(".modal.review.in")', 150000), 'he has eaten: the review gets a card');
  await wait(900);
  const rv = await ev('({ log: game.G.evLog[0], on: document.querySelectorAll(".modal.review .mstars.row .on").length, face: document.querySelector(".modal.review .rsay img").naturalWidth > 0, text: document.querySelector(".modal.review").innerText })');
  check(rv.log.kind === 'critic' && rv.log.mini === ck.tier && rv.on === rv.log.stars && rv.log.stars >= 3 && rv.face && /\$/.test(rv.text), `${rv.log.stars} stars on the review (never under three after a good plate), what it pays`);
  await shot('8f-review');
  await page.click('.modal.review [data-x="close"]'); await wait(400);
}
// the mini game: the health inspector comes, the offer to scrub the kitchen first; the banner offers it too; rubbing
// wipes the dirt away (the bar, its stars); the stars' card; the grade's card when he has looked
await ev('(() => { const g = game.G; g.event = null; g.cust = g.cust.filter((c) => !c.vip); game.S.MINI.inspector.dur = 8; game.ui.guideOff = false; game.S.startEvent(g, "inspector"); })()');
check(await until('!!document.querySelector(".modal.offer.in [data-x=go]")', 5000) && await ev('game.paused && document.querySelector(".modal.offer .rsay img").naturalWidth > 0'), 'the inspector comes: an offer to scrub the kitchen first, the restaurant waits');
await shot('9-offer');
await page.click('.modal.offer [data-x="no"]'); await wait(600);
check(await ev('!game.paused && game.S.miniOf(game.G) === "inspector" && document.querySelector(".evbar").classList.contains("play") && /scrub/i.test(document.querySelector(".evbar small").textContent)'), '"Let him look": the game goes on, the banner still offers it');
await ev('game.ui.guideOff = true');
await page.click('.evbar');
check(await until('!!document.querySelector(".modal.minim .mstage .msponge")', 8000) && await ev('game.paused'), 'a tap on the banner: the mini game, the restaurant waits');
await wait(1300);
{
  const [L, T, W, H] = await ev('(() => { const r = document.querySelector(".mstage").getBoundingClientRect(); return [r.left, r.top, r.width, r.height]; })()');
  // (what's left of the stains, the bar, the stars lit: read while the game is still on screen)
  const look = () => ev('(() => { const c = document.querySelector(".mstage .mstain"); if (!c) return null; const d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data; let a = 0; for (let i = 3; i < d.length; i += 4) a += d[i]; return { a, bar: parseFloat(document.querySelector(".mbar u").style.width) || 0, stars: document.querySelectorAll(".mbar i.on").length, won: !!document.querySelector(".mini.won") }; })()');
  const first = await look(); let last = first;
  await page.mouse.move(L + W * 0.1, T + H * 0.06); await page.mouse.down();
  rub: for (let pass = 0, i = 0; pass < 3; pass++) {
    for (let r = 0; r < 10; r++, i++) {
      await page.mouse.move(L + W * (i % 2 ? 0.92 : 0.08), T + H * (0.06 + 0.88 * r / 9), { steps: 8 });
      const now = await look();
      if (!now) break rub;
      last = now;
      if (now.won) break rub;
      if (pass === 0 && r === 5) await shot('9b-scrub');
    }
  }
  await page.mouse.up();
  check(first.a > 0 && last.a < first.a * 0.6 && last.bar >= 35 && last.stars >= 1, `rubbing wipes the stains away (${Math.round(100 - 100 * last.a / first.a)}% gone), the bar fills (${last.bar}%), ${last.stars} star${last.stars > 1 ? 's' : ''} lit`);
}
check(await until('!!document.querySelector(".modal.mres.in")', 15000), 'time is up: the card with the stars');
await wait(900);
const sc = await ev('({ clean: game.G.event?.mini, tier: game.S.miniTier("inspector", game.G.event?.mini ?? 0), stars: document.querySelectorAll(".modal.mres .mstars .on").length, can: game.S.miniOf(game.G), paused: game.paused })');
check(sc.clean >= 0.35 && sc.tier >= 1 && sc.stars === sc.tier && !sc.can && sc.paused, `the kitchen is ${Math.round(sc.clean * 100)}% clean: ${sc.tier} star${sc.tier > 1 ? 's' : ''}; once an inspection`);
await shot('9c-stars');
await page.click('.modal.mres [data-x="close"]'); await wait(400);
check(await ev('!game.paused'), 'the game goes on: he takes his look');
check(await until('!!document.querySelector(".modal.grade.in")', 90000), 'he has looked: the grade gets a card');
await wait(900);
const gr = await ev('({ log: game.G.evLog[0], src: document.querySelector(".modal.grade .gstamp img").getAttribute("src"), ok: document.querySelector(".modal.grade .gstamp img").naturalWidth > 0, text: document.querySelector(".modal.grade").innerText })');
check(gr.log.kind === 'inspector' && gr.log.mini === sc.tier && gr.ok && gr.src.endsWith(`/${gr.log.grade.toLowerCase()}.webp`) && (sc.tier < 2 || gr.log.grade !== 'C') && (!gr.log.cash || /\$/.test(gr.text)), `grade ${gr.log.grade} on its badge, what it pays`);
await shot('9d-grade');
await page.click('.modal.grade [data-x="close"]'); await wait(400);
// what a scrub is worth (the same inspection, five ways: left alone, then cleaner and cleaner)
const five = await ev(`(() => { const S = game.S, run = (clean) => { const g = JSON.parse(JSON.stringify(game.G)); g.event = null; g.cust = g.cust.filter((c) => !c.vip); S.startEvent(g, 'inspector'); const t = clean == null ? null : S.playMini(g, clean); for (let i = 0; i < 6000 && g.event; i++) S.tick(g, 0.1, 1); return { ...g.evLog[0], t, again: S.playMini(g, 1) }; }; return [null, 0.2, 0.5, 0.7, 1].map(run); })()`);
{
  const [no, t0, t1, t2, t3] = five, gi = (r) => 'ABC'.indexOf(r.grade);
  check(five.every((r) => r.kind === 'inspector' && gi(r) >= 0 && r.again == null) && no.mini === undefined && t0.t === 0 && t1.t === 1 && t2.t === 2 && t3.t === 3, `the inspection alone: grade ${no.grade}; the tiers 0…3`);
  check(t0.grade === no.grade && t0.cash === no.cash && t1.grade === no.grade && t1.cash > no.cash, 'too little changes nothing; one star: a tip');
  check(gi(t2) === Math.min(1, gi(no)) && t2.cash > t1.cash - 0.01 && gi(t3) === Math.max(0, gi(no) - 1) && t3.cash > t2.cash && (gi(no) > 0 || t3.mod.dur > no.mod.dur), `two stars: never a C (${t2.grade}); three: a grade better (${t3.grade})`);
}
// what a plate cooked by hand is worth (the same critic, five ways), and what the flyers are
const crit = await ev(`(() => { const S = game.S, run = (score) => { const g = JSON.parse(JSON.stringify(game.G)); g.event = null; g.cust = g.cust.filter((c) => !c.vip); S.startEvent(g, 'critic'); const t = score == null ? null : S.playMini(g, score); for (let i = 0; i < 9000 && g.event; i++) S.tick(g, 0.1, 1); return { ...g.evLog[0], t, again: S.playMini(g, 1) }; }; return [null, 0.2, 0.5, 0.7, 1].map(run); })()`);
{
  const [no, t0, t1, t2, t3] = crit;
  check(crit.every((r) => r.kind === 'critic' && r.stars >= 1 && r.again == null) && no.stars > 1 && no.mini === undefined && t0.t === 0 && t1.t === 1 && t2.t === 2 && t3.t === 3, `the critic alone: ${no.stars} stars; the tiers 0…3`);
  check(t0.stars === no.stars && t0.cash === no.cash && !t0.up && t1.stars === no.stars && t1.cash > no.cash, 'too little changes nothing; one star: a tip');
  check(t2.stars === Math.max(3, no.stars) && t2.cash > t1.cash && t3.stars === Math.min(5, no.stars + 1) && t3.cash > t2.cash && t3.up && (no.stars < 5 || t3.mod.dur > no.mod.dur), `two stars: never under three (${t2.stars}); three: a star more (${t3.stars})${no.stars === 5 ? ', a rave' : ''}`);
}
const thr = await ev(`(() => { const S = game.S, run = (score) => { const g = JSON.parse(JSON.stringify(game.G)); g.event = null; g.cust = g.cust.filter((c) => !c.vip); S.startEvent(g, 'threat'); const e = g.event, base = e.base, t = score == null ? null : S.playMini(g, score); return { t, need: e.need, won: e.won, cut: base - e.base, again: S.playMini(g, 1) }; }; return [null, 0.2, 0.5, 0.7, 1].map(run); })()`);
check(thr[0].won === undefined && thr[1].won === 0 && thr.slice(1).every((r, i) => r.t === i && r.cut === r.won && r.won === Math.ceil(r.need * [0, 0.1, 0.2, 0.3][i]) && r.again == null), `the flyers: +${thr.slice(2).map((r) => r.won).join(', +')} of the ${thr[0].need} to serve`);
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
// the city: a cook-off against a Gristle Burger, chef's hats, training
await ev('(() => { const g = game.G; g.hats = 0; g.gems = Math.max(g.gems, 40); g.rooms.office.lv = 3; g.duel = { tix: 5, at: null, won: {}, branches: 0, team: [], dishes: [], auto: false }; g.stats.duels = 0; })()'); await wait(600);
check(await ev('!document.querySelector(".slot.city").classList.contains("locked") && document.querySelector(".slot.city .lock").hidden && !document.querySelector(".slot.city .badge").hidden'), 'the City button is open, with a badge: tickets to spend');
await page.click('.slot.city'); await wait(600);
check(await ev('document.querySelectorAll(".citym .pin").length === 15 && document.querySelectorAll(".citym .pin.now").length === 1 && document.querySelectorAll(".citym .pin.shut").length === 14 && document.querySelectorAll(".citym .pin.boss").length === 3 && document.querySelector(".citym .tix b").textContent === "5/5"'), 'the map: 15 Gristle Burgers (3 head offices), the first one open, 5 tickets');
await shot('9c-city');
await page.click('.citym .pin[data-stage="1"]'); await wait(300);
check(await ev('document.querySelector(".citym .stage").hidden && [...document.querySelectorAll(".toast")].some((t) => t.textContent.includes("Beat Market Street first"))'), 'the second one: beat the first one first');
await page.click('.citym .pin.now'); await wait(400);
check(await ev('(() => { const p = document.querySelector(".citym .stage"); return !p.hidden && p.querySelectorAll(".rv").length === game.D.STAGES[0].cooks.length && p.querySelectorAll(".cchip.on").length === 1 && p.querySelector(".cchip.on").dataset.crew === "kitchen" && p.querySelectorAll(".dchip.on").length >= 1 && p.querySelectorAll(".dchip.on").length <= 3 && !!p.querySelector(".dchip.weak.on") && !p.querySelector(\'[data-x="go"]\').disabled && p.querySelector(".pays").textContent.includes("3"); })()'), 'its panel: who cooks there, the head chef goes, the weak dish is picked, what a win pays');
await shot('9d-stage');
await page.click('.citym .cchip.on'); await wait(200);
check(await ev('document.querySelector(\'.citym [data-x="go"]\').disabled && document.querySelector(\'.citym [data-x="go"]\').textContent === "Pick your team"'), 'nobody picked: no cook-off');
await page.click('.citym .cchip'); await wait(200);
const dc0 = await ev('game.G.cash');
await page.click('.citym [data-x="go"]'); await wait(1600);
check(await ev('!!document.querySelector(".modal.duelm.in") && game.paused && game.G.duel.tix === 4 && !!game.ui.arena.cur && document.querySelectorAll(".duelm .dc.us").length === 1 && document.querySelectorAll(".duelm .dsk").length === 1'), 'the cook-off: its own window, the game paused, a ticket spent');
await until('game.ui.arena.cur.D.us.pts > 0 && game.ui.arena.cur.D.them.pts > 0', 15000);
check(await ev('parseInt(document.querySelector(".duelm .dbar.us b").textContent) > 0 && document.querySelector(".duelm .dbar.us i").style.width !== "0%"'), 'plates go to the jury: the scores climb');
await ev('game.ui.arena.cur.D.us.cooks[0].charge = 1'); await wait(120);
check(await ev('document.querySelector(".duelm .dsk").classList.contains("ready")'), 'the head chef\'s skill is ready');
await page.click('.duelm .dsk'); await wait(250);
check(await ev('game.ui.arena.cur.D.us.cooks[0].charge < 0.5 && document.querySelector(".duelm .dcall").textContent.includes("Flambé")'), 'a tap: Flambé!');
await shot('9e-duel');
await ev('(() => { const c = game.ui.arena.cur; c.D.us.pts = c.D.goal - 0.01; c.D.them.pts = 0; c.skip(); })()');
check(await until('!!document.querySelector(".modal.dres.won.in")', 6000) && await ev('!document.querySelector(".modal.duelm.in") && !game.paused && game.G.duel.won[0] === 3 && game.G.hats === 3 && game.G.stats.duels === 1') && await ev('game.G.cash') > dc0, 'won with three stars: cash and 3 chef\'s hats, the game goes on');
await shot('9f-duel-won');
await page.click('.modal.dres [data-x="next"]'); await wait(500);
check(await ev('(() => { const p = document.querySelector(".citym .stage"); return !p.hidden && p.querySelector(".sthead b").textContent === game.D.STAGES[1].name && document.querySelector(\'.citym .pin[data-stage="0"]\').classList.contains("won") && document.querySelectorAll(\'.citym .pin[data-stage="0"] .pst img:not(.off)\').length === 3; })()'), 'next: the second one\'s panel; the first pin is a Ferdi\'s flag with 3 stars');
// (out of tickets: a full set for gems; then a loss)
await ev('(() => { const g = game.G; g.duel.tix = 0; g.duel.at = Date.now(); })()'); await wait(1200);
const dg0 = await ev('game.G.gems');
check(await ev('document.querySelector(\'.citym [data-x="go"]\').dataset.why === "tix" && /\\d:\\d\\d/.test(document.querySelector(".citym .tix small").textContent)'), 'no tickets: the button offers a set, the bar counts down to the next one');
await page.click('.citym [data-x="go"]'); await wait(400);
await page.click('.modal.tixm [data-x="buy"]'); await wait(500);
check(await ev('game.G.duel.tix === 5') && await ev('game.G.gems') === dg0 - 20, '5 tickets for 20 gems');
await page.click('.citym [data-x="go"]'); await wait(1500);
await ev('(() => { const c = game.ui.arena.cur; c.D.them.pts = c.D.goal - 0.01; c.D.us.pts = 0; c.skip(); })()');
check(await until('!!document.querySelector(".modal.dres.lost.in")', 6000) && await ev('game.G.duel.tix === 4 && game.G.stats.duels === 1 && !game.G.duel.won[1] && document.querySelectorAll(".modal.dres .tipsl li").length === 3'), 'a loss: the ticket is gone, nothing won, three tips');
await shot('9g-duel-lost');
await page.click('.modal.dres [data-x="crew"]'); await wait(600);
check(await ev('!document.querySelector(".modal.citym.in") && !!document.querySelector(".modal.managerscard.in") && document.querySelector(\'[data-act="train"][data-room="kitchen"]\').disabled && document.querySelector(".hbal b").textContent === "3" && !!document.querySelector(".mgrrow.on .cstat .sk")'), 'to the crew card: training costs 4 hats, not yet; each one\'s cook-off numbers and skill');
await ev('game.G.hats = 4'); await page.click('.modal.managerscard [data-act="mgrauto"][data-room="kitchen"]'); await page.click('.modal.managerscard [data-act="mgrauto"][data-room="kitchen"]'); await wait(300);
const ct0 = await ev('game.S.cookTime(game.G, "burger")'), ht0 = await ev('game.D.hero(game.G, "kitchen").taste');
await page.click('.modal.managerscard [data-act="train"][data-room="kitchen"]'); await wait(400);
check(await ev('game.G.mgr.kitchen.lv === 2 && game.G.hats === 0') && await ev('game.S.cookTime(game.G, "burger")') < ct0 && await ev('game.D.hero(game.G, "kitchen").taste') > ht0 && await ev('document.querySelector(".modal.managerscard .mgrrow.on .mt > small").textContent.includes("15%")'), 'the head chef is level 2: cooks work 15% faster, and she cooks better in the city');
await shot('9h-crew-trained');
await page.click('.modal.managerscard [data-x="close"]'); await wait(300);
// (a district's head office)
check(await ev('(() => { const g = game.G, D = game.D, p0 = game.S.priceOf(g, "burger", "dining"); g.duel.won = { 0: 3, 1: 1, 2: 1, 3: 1 }; g.duel.tix = 5; const X = game.duelStart(4, ["kitchen"], ["burger"]); if (!X) return "no start"; X.us.pts = X.goal - 0.01; while (!X.over) D.tick(X, 0.1); const r = game.duelClaim(X); return r.won && r.branch?.name === "Old Town" && r.gems === 10 + (r.stars === 3 ? 2 : 0) && g.duel.branches === 1 && Math.abs(game.S.priceOf(g, "burger", "dining") / p0 - 1.08) < 0.02 && game.duelClaim(X) === null; })()') === true, 'Old Town\'s head office beaten: 10 gems, a Ferdi\'s there, every bill 8% up; paid once');
check(await ev('import("./js/idle4/quests.js").then((Q) => { const a = { quest: { i: 34 } }, b = { quest: { i: 33 } }, c = { quest: { i: 5, v: 2 } }; Q.migrate(a); Q.migrate(b); Q.migrate(c); return a.quest.i === 35 && Q.questAt(35).text === "Have a team of 10" && b.quest.i === 33 && Q.questAt(33).k === "duels" && c.quest.i === 5; })'), 'an older save keeps its place in the longer quest chain');
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

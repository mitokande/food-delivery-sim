// The real calendar, with the clock moved: daily goals renew at local midnight (not when the in-game day ends), the
// daily gift opens by itself on a day's first visit and climbs with days in a row, a missed day starts it again, weekly
// contracts renew on Monday, and a clock set back doesn't give anything twice. Saves from before keep their goals.
//   node tools/daily.mjs [shot-prefix]
import { createRequire } from 'node:module';
import { serve } from './serve.mjs';
const require = createRequire(import.meta.url);
let puppeteer; try { puppeteer = require('puppeteer-core'); } catch { puppeteer = require('/root/.npm/_npx/110f701c48e68d66/node_modules/puppeteer-core'); }
const prefix = process.argv[2] || 'tools/shots/daily';
const TZ = 'Europe/Istanbul'; // UTC+3 all year: local midnight is 21:00 UTC
const at = (s) => Date.parse(s + '+03:00');
// a career from before the real calendar: goals of in-game day 3, a contract begun on day 1, no `cal`
const GOALS = [{ id: 'deliver', n: 6, p: 2, reward: 40, claimed: false }, { id: 'five', n: 3, p: 3, reward: 50, claimed: false }, { id: 'overtake', n: 5, p: 0, reward: 30, claimed: false }];
const WEEK = { from: 1, list: [{ id: 'deliver', n: 31, p: 9, d: null, reward: 160, claimed: false }, { id: 'five', n: 15, p: 4, d: null, reward: 160, claimed: false }, { id: 'early', n: 12, p: 1, d: null, reward: 160, claimed: false }],
  bonus: { cash: 400 }, bonusClaimed: false };
const SAVE = { v: 1, lvl: 4, cash: 400, xp: 0, day: 3, districts: { oldtown: true }, stats: { deliveries: 12 }, goals: { day: 3, list: GOALS }, week: WEEK,
  seen: { lbTip_run2: 1, brakeTip: 1, rideTip2: 1, energyTip: 1, privacy: 1 }, onboard: { step: 99 },
  settings: { music: 0, sfx: 0, quality: 'low', haptics: false }, active: 'vespetta',
  vehicles: { rustbucket: { parts: { engine: 0, suspension: 0, box: 0, tires: 0 }, count: 1 }, vespetta: { parts: { engine: 0, suspension: 0, box: 0, tires: 0 }, count: 1 } } };

const { server, base } = await serve();
const browser = await puppeteer.launch({ executablePath: '/root/.cache/puppeteer/chrome/linux-148.0.7778.97/chrome-linux64/chrome', headless: 'new', protocolTimeout: 300000,
  args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let fails = 0;
const ok = (c, label) => { if (!c) fails++; console.log(`${c ? 'ok  ' : 'FAIL'} ${label}`); };

const page = await browser.newPage();
await page.emulateTimezone(TZ);
await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
page.on('console', (m) => { if (m.type() === 'error' && !/404|Failed to load resource/.test(m.text())) errs.push(m.text()); });
await page.evaluateOnNewDocument((s) => {
  // a movable clock: Date.now() and new Date() run `shift` ms off the real one (kept across reloads)
  const RD = Date, real = RD.now.bind(RD), shift = () => +sessionStorage.getItem('shift') || 0;
  window.Date = class extends RD { constructor(...a) { if (a.length) super(...a); else super(real() + shift()); } static now() { return real() + shift(); } };
  window.__realNow = real;
  if (!sessionStorage.getItem('seeded')) { sessionStorage.setItem('seeded', 1); localStorage.setItem('fds_save_v1', s); }
}, JSON.stringify(SAVE));
const R = (fn, arg) => page.evaluate(fn, arg);
const setNow = (t) => R((t) => sessionStorage.setItem('shift', String(t - window.__realNow())), t);
// the game's own state module (a dynamic import in the page shares its instance); every economy action lands in __acts
const St = (fn, arg) => R(async ([f, a]) => { const St = await import('./js/state.js'); return new Function('St', 'a', `return (${f})(St, a)`)(St, a); }, [fn.toString(), arg]);
const load = async (t, qs = '') => {
  if (!page.url().startsWith(base)) await page.goto(`${base}/privacy/index.html`); // (sessionStorage needs the origin)
  await setNow(t);
  await page.goto(`${base}/index.html?clock=600${qs}`, { waitUntil: 'networkidle0', timeout: 240000 });
  await page.waitForFunction('window.ready', { timeout: 120000 });
  await R(async () => { const St = await import('./js/state.js'); window.__acts = []; St.on((w, d) => { if (w === 'act' && (d.ev === 'streak' || d.ev === 'daily_gift')) window.__acts.push(d); }); });
  await sleep(600);
};
const acts = () => R(() => window.__acts.splice(0));
const giftCard = () => R(() => { const m = document.querySelector('.modal.gift:not(.out)'); return m && { p: m.querySelector('p').textContent, now: m.querySelector('.gd.now small')?.textContent, got: m.querySelectorAll('.gd.got').length, tiles: [...m.querySelectorAll('.gd .gv')].map((b) => b.textContent) }; });
const collect = async () => { await R(() => document.querySelector('.modal.gift [data-x="ok"]').click()); await sleep(400); };
const city = () => R(() => { game.ui?.render?.(); document.querySelector('.tabs [data-tab="garage"]').click(); document.querySelector('.tabs [data-tab="city"]').click();
  const heads = [...document.querySelectorAll('.sec-head')].map((h) => h.textContent.replace(/\s+/g, ' ').trim());
  const row = document.querySelector('.goal.gift, .goal.streak');
  return { today: heads.find((h) => h.startsWith('Today')), contract: heads.find((h) => h.startsWith('Contract')), row: row && { cls: row.className, text: row.textContent.replace(/\s+/g, ' ').trim(), open: !!row.querySelector('[data-act="gift"]') } }; });
// goals and contracts renew when the game next looks at them (the City tab, a goal or a contract making progress), as here
const cal = () => St((St) => {
  const ready = St.giftReady(), goals = St.ensureGoals(), week = St.ensureWeek();
  return { ...St.S.cal, today: St.dayNum(), ready, goalsDay: goals.day, goals: goals.list.map((g) => `${g.id}:${g.p}/${g.n}`).join(' '), wk: week.wk,
    week: week.list.map((c) => `${c.id}:${c.p}`).join(' '), cash: St.S.cash, energy: St.tickEnergy() };
});

// ---- Wednesday 4 Nov, 10:00: an old save opens on the real calendar
const WED = at('2026-11-04T10:00:00');
await load(WED);
let c = await cal();
const d0 = c.today;
ok(c.goalsDay === d0 && c.goals === 'deliver:2/6 five:3/3 overtake:0/5', `an old save keeps its goals, now as today's (${c.goals}, day ${c.goalsDay} = ${d0})`);
ok(c.week === 'deliver:9 five:4 early:1' && c.wk === Math.floor((d0 + 3) / 7), `…and its contract, as this week's (${c.week}, week ${c.wk})`);
let g = await giftCard();
ok(g && g.now === 'Day 1' && g.got === 0 && g.tiles.length === 7 && /every day/.test(g.p), `the first visit opens the daily gift at day 1 (${JSON.stringify(g)})`);
await page.screenshot({ path: `${prefix}-day1.png` });
const pay = await St((St) => St.typicalPay()), cash0 = c.cash;
await collect();
c = await cal();
const a1 = await acts();
const v1 = Math.round(pay / 5) * 5;
ok(!(await giftCard()) && c.streak === 1 && c.gift === d0 && Math.abs(c.cash - cash0 - v1) < 0.01, `Collect: +$${v1} (a typical delivery), a 1-day run (cash ${c.cash}, ${JSON.stringify({ streak: c.streak, gift: c.gift })})`);
ok(a1.length === 2 && a1[0].ev === 'streak' && a1[0].n === 1 && !a1[0].lost && a1[1].ev === 'daily_gift' && a1[1].day === 1 && a1[1].cash === v1 && a1[1].mult === 1,
  `analytics: streak {n: 1} and daily_gift {day: 1, cash, mult: 1} (${JSON.stringify(a1)})`);
let v = await city();
ok(/1 day in a row/.test(v.row?.text) && /Tomorrow's gift: 3/.test(v.row?.text) && !v.row.open, `the City tab shows the run and tomorrow's gift ("${v.row?.text}")`);
ok(/New goals in 13 h 59 min|New goals in 14 h 00 min/.test(v.today) && /5 days left/.test(v.contract), `…new goals at midnight, the contract until Sunday ("${v.today}", "${v.contract}")`);
await page.screenshot({ path: `${prefix}-city.png` });

// ---- the in-game day ends: goals and the contract stay
c = await St((St) => { const before = JSON.stringify([St.S.goals, St.S.week]); St.newDay(); St.ensureGoals(); St.ensureWeek(); return { same: before === JSON.stringify([St.S.goals, St.S.week]), day: St.S.day }; });
ok(c.same && c.day === 4, `the in-game day ending (now day ${c.day}) leaves goals and the contract alone`);

// ---- 23:59:30 the same day: nothing new yet
await setNow(at('2026-11-04T23:59:30'));
c = await cal(); v = await city();
ok(c.goalsDay === d0 && !c.ready && /New goals in 0:3\d/.test(v.today), `23:59:30: same goals, no gift yet ("${v.today}")`);

// ---- 00:00:30 Thursday, the game still open (a phone back from the pocket): new goals, the gift opens by itself
await setNow(at('2026-11-05T00:00:30'));
c = await cal();
ok(c.goalsDay === d0 + 1 && c.goals !== 'deliver:2/6 five:3/3 overtake:0/5' && /^(\w+:0\/\d+ ?){3}$/.test(c.goals) && c.ready, `midnight: a fresh set of goals (${c.goals}) and a gift waiting`);
await R(() => document.dispatchEvent(new Event('visibilitychange')));
await sleep(500);
g = await giftCard();
ok(g && g.now === 'Day 2' && g.got === 1 && /2 days in a row/.test(g.p), `coming back to the open game shows day 2 (${JSON.stringify(g)})`);
const e2 = await St((St) => St.tickEnergy());
await collect();
c = await cal();
ok(c.streak === 2 && c.energy === e2 + 3, `day 2's gift: +3 ⚡ (${e2} → ${c.energy}), a 2-day run`);

// ---- Friday 6 Nov: a fresh launch opens it on boot
await load(at('2026-11-06T09:00:00'));
g = await giftCard();
ok(g && g.now === 'Day 3' && g.got === 2, `Friday's launch opens day 3 with days 1–2 ticked (${JSON.stringify(g)})`);
await page.screenshot({ path: `${prefix}-day3.png` });
await collect();
const t3 = await R(() => document.querySelector('#toasts').textContent);
ok((await cal()).streak === 3 && /3 days in a row/.test(t3), `…collected: 3 days in a row ("${t3.trim()}")`);

// ---- Saturday missed; Sunday 8 Nov: the run starts again; the contract's last day
await load(at('2026-11-08T12:00:00'));
g = await giftCard();
ok(g && g.now === 'Day 1' && g.got === 0 && /missed a day/.test(g.p), `a missed day: back to day 1, and it says why (${JSON.stringify(g)})`);
await collect();
const a2 = await acts();
c = await cal();
ok(c.streak === 1 && a2[0]?.ev === 'streak' && a2[0].n === 1 && a2[0].lost === 3, `streak {n: 1, lost: 3} (${JSON.stringify(a2[0])})`);
v = await city();
ok(/last day/.test(v.contract) && c.week === 'deliver:9 five:4 early:1', `Sunday is the contract's last day, progress kept ("${v.contract}", ${c.week})`);
const sun = c.today, sunGoals = c.goals;

// ---- the clock set back to Saturday: the calendar holds on Sunday
await setNow(at('2026-11-07T12:00:00'));
c = await cal();
ok(c.today === sun - 1 && c.day === sun && c.goalsDay === sun && c.goals === sunGoals && !c.ready, `clock set back a day: still Sunday's goals, no gift (${JSON.stringify({ today: c.today, day: c.day, ready: c.ready })})`);

// ---- Monday 9 Nov, 00:00:30: a new week of contracts; the run goes on from Sunday
await setNow(at('2026-11-09T00:00:30'));
c = await St((St) => { const wk = St.S.week.wk; St.weekProgress('overtake', 1); return { was: wk, now: St.S.week.wk }; }); // (no contract counts overtakes: the new list stays at 0)
ok(c.now === c.was + 1, `a ride's progress crossing Monday midnight lands in the new week (week ${c.was} → ${c.now})`);
c = await cal(); v = await city();
ok(c.wk === Math.floor((sun + 1 + 3) / 7) && c.wk === Math.floor((d0 + 3) / 7) + 1 && /^(\w+:0 ?){3}$/.test(c.week) && /7 days left/.test(v.contract), `Monday: new contracts (${c.week}, "${v.contract}")`);
ok(v.row?.open && /Day 2 of 7/.test(v.row.text), `the gift row offers day 2 ("${v.row?.text}")`);
await R(() => document.querySelector('.goal.gift [data-act="gift"]').click());
await sleep(400);
g = await giftCard();
ok(g && g.now === 'Day 2', `its Open button shows the card (${g?.now})`);
await collect();
ok((await cal()).streak === 2, 'Sunday + Monday: a 2-day run');

// ---- the clock trick: forward to take Tuesday's gift, back, and forward again
await setNow(at('2026-11-10T10:00:00'));
await R(() => game.ui.gift()); await collect();
const tue = await cal();
await setNow(at('2026-11-09T10:00:00'));
c = await cal();
ok(tue.streak === 3 && !c.ready && c.goalsDay === tue.goalsDay && c.goals === tue.goals, `Tuesday's gift taken early, clock back to Monday: no gift, Tuesday's goals kept (${c.goals})`);
await setNow(at('2026-11-10T20:00:00'));
ok(!(await cal()).ready, 'real Tuesday comes: nothing twice');
await setNow(at('2026-11-11T08:00:00'));
c = await cal();
ok(c.ready, 'Wednesday: the next gift');
await R(() => game.ui.gift()); await collect();
const wed = await cal();
ok(wed.streak === 4, `…a 4-day run (${wed.streak})`);

// ---- a clock that was ten days ahead, now fixed: the game carries on from the real date
await setNow(at('2026-11-01T10:00:00'));
c = await cal();
ok(c.day === c.today && c.goalsDay === c.today && !c.ready && c.streak === 4, `ten days back is a fixed clock: today's date, fresh goals, today's gift counted as taken (${JSON.stringify({ day: c.day, today: c.today, ready: c.ready })})`);
await setNow(at('2026-11-02T10:00:00'));
c = await St((St) => St.giftToday());
ok(c.streak === 5 && !c.taken, `the next day the run goes on (day ${c.i + 1}, streak ${c.streak})`);

// ---- day 7: the big gift, then round again
await St((St) => { St.S.cal.streak = 6; });
await R(() => game.ui.gift());
g = await giftCard();
const v7 = await St((St) => St.giftValue(6));
ok(g && g.now === 'Day 7' && g.got === 6 && /big one/.test(g.p) && v7.cash === Math.round(pay * 6 / 5) * 5 && v7.energy === 10, `seven in a row: day 7, $${v7.cash} + 10 ⚡ (${JSON.stringify(g)})`);
await page.screenshot({ path: `${prefix}-day7.png` });
await collect();
await setNow(at('2026-11-03T10:00:00'));
c = await St((St) => St.giftToday());
ok(c.i === 0 && c.streak === 8, `day 8 goes round to day 1's gift, the run counts on (i ${c.i}, streak ${c.streak})`);

// ---- tests (?noti) get no card, only the row
await load(at('2026-11-03T11:00:00'), '&noti=1');
v = await city();
ok(!(await giftCard()) && v.row?.open, `with ?noti the card doesn't open by itself; the row is there (${v.row?.text})`);

ok(!errs.length, `no errors${errs.length ? ': ' + errs.slice(0, 3).join(' | ') : ''}`);
console.log(fails ? `${fails} FAILED` : 'all ok');
await browser.close(); server.close();
process.exit(fails ? 1 : 0);

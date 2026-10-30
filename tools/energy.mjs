// Energy on a phone: an order costs ⚡ (paid at Start), an order or Start without enough of it opens the energy panel
// instead, it comes back with real time (also while the game is closed), a level-up fills the tank, a daily goal adds to
// it, Stamina makes the tank bigger, and coffee buys more (dearer with each cup, three a day).
//   node tools/energy.mjs [shot-prefix]
import { createRequire } from 'node:module';
import { serve } from './serve.mjs';
const require = createRequire(import.meta.url);
let puppeteer; try { puppeteer = require('puppeteer-core'); } catch { puppeteer = require('/root/.npm/_npx/110f701c48e68d66/node_modules/puppeteer-core'); }
const prefix = process.argv[2] || 'tools/shots/energy';
const SAVE = { v: 1, lvl: 4, cash: 400, xp: 0, districts: { oldtown: true }, stats: { deliveries: 12 }, seen: { brakeTip: 1, rideTip2: 1, energyTip: 1 }, onboard: { step: 99 },
  settings: { music: 0, sfx: 0, quality: 'low', haptics: false }, active: 'vespetta',
  vehicles: { rustbucket: { parts: { engine: 0, suspension: 0, box: 0, tires: 0 }, count: 1 }, vespetta: { parts: { engine: 0, suspension: 0, box: 0, tires: 0 }, count: 1 } } };

const { server, base } = await serve();
const browser = await puppeteer.launch({ executablePath: '/root/.cache/puppeteer/chrome/linux-148.0.7778.97/chrome-linux64/chrome', headless: 'new', protocolTimeout: 300000,
  args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let fails = 0;
const ok = (c, label) => { if (!c) fails++; console.log(`${c ? 'ok  ' : 'FAIL'} ${label}`); };

const page = await browser.newPage();
await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
page.on('console', (m) => { if (m.type() === 'error' && !/404|Failed to load resource/.test(m.text())) errs.push(m.text()); });
await page.evaluateOnNewDocument((s) => { if (!sessionStorage.getItem('seeded')) { sessionStorage.setItem('seeded', 1); localStorage.setItem('fds_save_v1', s); } }, JSON.stringify(SAVE));
const load = async () => {
  await page.goto(`${base}/index.html?noti=1&clock=600`, { waitUntil: 'networkidle0', timeout: 240000 });
  await page.waitForFunction('window.ready', { timeout: 120000 });
};
await load();
const R = (fn, arg) => page.evaluate(fn, arg);
// the game's own state module (a dynamic import in the page shares its instance)
const St = (fn, arg) => R(async ([f, a]) => { const St = await import('./js/state.js'); return new Function('St', 'a', `return (${f})(St, a)`)(St, a); }, [fn.toString(), arg]);
const chip = () => R(() => ({ v: document.querySelector('.topbar .energy .env').textContent, t: document.querySelector('.topbar .energy .ent').textContent }));
const closeModals = () => R(() => document.querySelectorAll('#modals .modal').forEach((m) => m.remove()));
const MIN = 60000;

// ---- a fresh tank
let c = await chip();
ok(c.v === '10/10' && c.t === '', `a new career starts with a full tank, no countdown (${c.v} "${c.t}")`);

// ---- the Start bar shows what a job costs
await R(() => { game.refill(); const o = game.board[0]; game.toggleOrder(o.id); game.ui?.render?.(); });
await R(() => document.querySelector('.tabs [data-tab="city"]').click());
await sleep(300);
let sb = await R(() => ({ cost: document.querySelector('#startbar .sb-cost')?.textContent.trim(), short: document.querySelector('#startbar').classList.contains('short') }));
ok(sb.cost === '1' && !sb.short, `one order taken: the Start bar asks ⚡1 (${JSON.stringify(sb)})`);
await page.screenshot({ path: `${prefix}-hub.png` });

// ---- Start spends it
await R(() => { game.startJob(); });
await sleep(200);
let st = await St((St) => ({ n: St.S.energy.n, mode: null }));
let mode = await R(() => game.mode);
ok(st.n === 9 && mode !== 'hub', `Start spends ⚡1 and the ride begins (⚡${st.n}, mode ${mode})`);
for (let i = 0; i < 60 && (await R(() => { game.skipTween(); return game.mode; })) !== 'ride'; i++) await sleep(150);
await R(() => { game.ride.R.timeScale = 1; document.querySelectorAll('.modal.tip [data-x]').forEach((b) => b.click()); });
// leave the ride without finishing it (a reload: the tank is saved)
await St((St) => St.save(true));
await load();
c = await chip();
ok(c.v === '9/10' && /^[56]:\d\d$/.test(c.t), `after a reload the tank is still 9/10, counting down to the next one (${c.v} "${c.t}")`);

// ---- regen from timestamps: 13 min after the tank was at 3 → 5, the next one 5 min away; 2 h away → full
st = await St((St, MIN) => { St.S.energy.n = 3; St.S.energy.t = Date.now() - 13 * MIN; const n = St.tickEnergy(); return { n, eta: St.energyEta() }; }, MIN);
ok(st.n === 5 && Math.abs(st.eta.next - 5 * MIN) < 3000 && Math.abs(st.eta.full - (5 + 4 * 6) * MIN) < 3000, `13 min at 1 per 6 min: 3 → 5, next in ~5 min, full in ~29 min (${st.n}, ${Math.round(st.eta.next / 1000)} s, ${Math.round(st.eta.full / 1000)} s)`);
st = await St((St, MIN) => { St.S.energy.n = 0; St.S.energy.t = Date.now() - 120 * MIN; return { n: St.tickEnergy(), eta: St.energyEta() }; }, MIN);
ok(st.n === 10 && st.eta.next === 0, `two hours away: the tank fills, and only to the top (${st.n})`);
st = await St((St, MIN) => { St.S.energy.n = 4; St.S.energy.t = Date.now() + 30 * MIN; return { n: St.tickEnergy(), t: St.S.energy.t <= Date.now() }; }, MIN);
ok(st.n === 4 && st.t, `a clock set back doesn't break the countdown (${JSON.stringify(st)})`);

// ---- out of energy: an order can't be taken, the panel opens instead
await R(() => { game.taken = []; game.ui?.render?.(); });
await St((St) => { St.S.energy.n = 0; St.S.energy.t = Date.now(); St.emit('energy'); });
await R(() => { game.refill(); document.querySelector('.tabs [data-tab="city"]').click(); });
await sleep(200);
await R(() => document.querySelector('.sheet-body .ocard')?.click());
await sleep(500);
let pan = await R(() => { const m = document.querySelector('.modal.energy'); return m && { h: m.querySelector('h2').textContent, bar: m.querySelector('.en-bar b').textContent, eta: m.querySelector('.en-eta').textContent, coffee: !!m.querySelector('[data-x="coffee"]') }; });
let taken = await R(() => game.taken.length);
ok(pan?.h === 'Out of energy!' && taken === 0, `with ⚡0 an order isn't taken: "Out of energy!" opens (${JSON.stringify(pan)}, taken ${taken})`);
ok(/Next .* in 6:00|Next .* in 5:5\d/.test(pan?.eta || '') && pan?.coffee, `…with the countdown and a coffee to buy ("${pan?.eta}")`);
await page.screenshot({ path: `${prefix}-out.png` });
await sleep(1200);
const eta2 = await R(() => document.querySelector('.modal.energy .en-eta').textContent);
ok(eta2 !== pan.eta, `the panel's countdown ticks ("${pan.eta}" → "${eta2}")`);

// ---- coffee: +5, dearer each cup, three a day
const pay = await St((St) => St.typicalPay());
const cash0 = await St((St) => St.S.cash);
await R(() => document.querySelector('.modal.energy [data-x="coffee"]').click());
await sleep(300);
st = await St((St) => ({ n: St.S.energy.n, cash: St.S.cash, next: St.coffeePrice(), left: St.coffeeLeft() }));
const p1 = Math.round(pay * 2 / 5) * 5;
ok(st.n === 5 && Math.abs(cash0 - st.cash - p1) < 0.01 && st.next === Math.round(pay * 4 / 5) * 5 && st.left === 2, `a coffee: +5 for $${p1} (2× a typical delivery), the next one $${st.next} (${JSON.stringify(st)})`);
pan = await R(() => document.querySelector('.modal.energy .en-bar b').textContent);
ok(pan === '5 / 10', `the panel shows the new tank (${pan})`);
await page.screenshot({ path: `${prefix}-coffee.png` });
st = await St((St) => { St.S.cash = 5000; const a = St.buyCoffee(), b = St.buyCoffee(), c = St.buyCoffee(); return { a, b, c, n: St.S.energy.n, price: St.coffeePrice(), left: St.coffeeLeft() }; });
ok(st.a && st.b && !st.c && st.n === 15 && st.price === null && st.left === 0, `three cups a day, and coffee may fill past the tank (${JSON.stringify(st)})`);
st = await St((St) => { St.S.energy.cups.day = 'yesterday'; return { price: St.coffeePrice(), left: St.coffeeLeft() }; });
ok(st.left === 3 && st.price === p1, `a new day opens the café again at the first cup's price (${JSON.stringify(st)})`);
await closeModals();

// ---- a job needs ⚡ for every order in it
st = await R(async () => {
  const St = await import('./js/state.js');
  St.S.energy.n = 1; St.S.energy.t = Date.now();
  game.refill();
  const [a, b] = game.board.filter((o) => o.size === 1);
  game.toggleOrder(a.id);
  const one = game.taken.length;
  game.toggleOrder(b.id);
  const panel = !!document.querySelector('.modal.energy');
  return { one, two: game.taken.length, panel, n: St.S.energy.n };
});
ok(st.one === 1 && st.two === 1 && st.panel, `with ⚡1 a second order for the Vespetta's box isn't taken (${JSON.stringify(st)})`);
await closeModals();
st = await R(async () => {
  const St = await import('./js/state.js');
  St.S.energy.n = 2; const [b] = game.board.filter((o) => o.size === 1 && !game.taken.includes(o)); game.toggleOrder(b.id);
  St.S.energy.n = 1; St.emit('energy'); // (spent somewhere else meanwhile)
  const short = document.querySelector('#startbar').classList.contains('short');
  await game.startJob();
  return { taken: game.taken.length, short, mode: game.mode, panel: document.querySelector('.modal.energy h2')?.textContent, n: St.S.energy.n };
});
ok(st.taken === 2 && st.short && st.mode === 'hub' && st.panel === 'Out of energy!' && st.n === 1, `two orders and ⚡1: the Start bar greys out, Start opens the panel and nothing is spent (${JSON.stringify(st)})`);
await page.screenshot({ path: `${prefix}-short.png` });
await closeModals();
st = await R(() => {
  document.querySelectorAll('#toasts > *').forEach((t) => t.remove());
  const c = game.board.find((o) => o.size === 1 && !game.taken.includes(o)); game.toggleOrder(c.id);
  return { taken: game.taken.length, panel: !!document.querySelector('.modal.energy'), toast: document.querySelector('#toasts')?.textContent };
});
ok(st.taken === 2 && !st.panel && /Box full/.test(st.toast), `a full box says so first, short of energy or not (${JSON.stringify(st)})`);

// ---- a level-up fills the tank; a daily goal adds +2; Stamina makes the tank bigger
st = await St((St) => { St.S.energy.n = 2; St.addXP(St.xpNeed()); return { n: St.S.energy.n, max: St.energyMax(), lvl: St.S.lvl }; });
ok(st.n === st.max && st.lvl === 5, `a level-up fills the tank (${JSON.stringify(st)})`);
st = await St((St) => { St.S.energy.n = 12; St.addXP(St.xpNeed()); return St.S.energy.n; });
ok(st === 12, `…and never takes away what's over the top (${st})`);
st = await St((St) => { St.S.energy.n = 3; const g = St.ensureGoals().list[0]; g.p = g.n; g.claimed = false; St.claimGoal(0); return St.S.energy.n; });
ok(st === 5, `a claimed daily goal adds ⚡2 (3 → ${st})`);
await R(() => { document.querySelector('.tabs [data-tab="city"]').click(); });
await St((St) => { const g = St.S.goals.list[1]; g.p = g.n; g.claimed = false; });
await R(() => { document.querySelector('.tabs [data-tab="garage"]').click(); document.querySelector('.tabs [data-tab="city"]').click(); });
const gbtn = await R(() => document.querySelector('.goal [data-act="claim"]')?.textContent.trim());
ok(/\+2/.test(gbtn || ''), `the goal's claim button shows the energy too ("${gbtn}")`);
st = await St((St) => { St.S.skills.stamina = 2; St.S.energy.n = 10; St.S.energy.t = Date.now(); return { max: St.energyMax(), n: St.tickEnergy(), next: St.energyEta().next }; });
ok(st.max === 14 && st.n === 10 && st.next > 0, `Stamina 2: a 14 tank, and the 10 there now starts filling (${JSON.stringify(st)})`);
await St((St) => { St.emit('energy'); });
await sleep(300);
c = await chip();
ok(c.v === '10/14' && /^\d:\d\d$/.test(c.t), `the chip follows (${c.v} "${c.t}")`);

// ---- the chip opens the panel
await R(() => document.querySelector('.topbar .energy').click());
await sleep(400);
pan = await R(() => document.querySelector('.modal.energy h2')?.textContent);
ok(pan === 'Energy', `tapping ⚡ opens the energy panel ("${pan}")`);
await page.screenshot({ path: `${prefix}-panel.png` });

ok(!errs.length, `no errors${errs.length ? ': ' + errs.slice(0, 3).join(' | ') : ''}`);
console.log(fails ? `${fails} FAILED` : 'all ok');
await browser.close(); server.close();
process.exit(fails ? 1 : 0);

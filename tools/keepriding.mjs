// Keep riding, on a phone: the door scenes play by themselves (no button, the bag changes hands at the bike), the
// rating is a short beat that lets touches through, and the receipt offers an order near the customer's door —
// "Collect & ride on" (one ⚡) starts it right there, with no trip to the hub, and "Collect & back to hub" goes back.
// Short of energy, the offer says so and opens the energy panel instead.
//   node tools/keepriding.mjs [shot-prefix]
import { createRequire } from 'node:module';
import { serve } from './serve.mjs';
const require = createRequire(import.meta.url);
let puppeteer; try { puppeteer = require('puppeteer-core'); } catch { puppeteer = require('/root/.npm/_npx/110f701c48e68d66/node_modules/puppeteer-core'); }
const prefix = process.argv[2] || 'tools/shots/keep';
// (the first-time hints that slow time down are marked seen)
const SAVE = { v: 1, lvl: 3, cash: 200, xp: 0, districts: { oldtown: true }, stats: { deliveries: 10 }, onboard: { step: 99 },
  seen: { lbTip_run2: 1, brakeTip: 1, rideTip2: 1, energyTip: 1, c_run_hop: 1, c_run_lane: 1, c_run_red: 1, c_run_onc: 1, c_run_coins: 1, c_run_light: 1 },
  energy: { n: 5, t: Date.now(), cups: null }, settings: { music: 0, sfx: 0, quality: 'low', haptics: false } };

const { server, base } = await serve();
const browser = await puppeteer.launch({ executablePath: '/root/.cache/puppeteer/chrome/linux-148.0.7778.97/chrome-linux64/chrome', headless: 'new', protocolTimeout: 900000,
  args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let fails = 0;
const ok = (c, label) => { if (!c) fails++; console.log(`${c ? 'ok  ' : 'FAIL'} ${label}`); };

const page = await browser.newPage();
await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
page.on('console', (m) => { if (m.type() === 'error' && !/404|Failed to load resource/.test(m.text())) errs.push(m.text()); });
await page.evaluateOnNewDocument((s) => { if (!sessionStorage.getItem('seeded')) { sessionStorage.setItem('seeded', 1); localStorage.setItem('fds_save_v1', s); } }, JSON.stringify(SAVE));
await page.goto(`${base}/index.html?noti=1&clock=600`, { waitUntil: 'networkidle0', timeout: 240000 });
await page.waitForFunction('window.ready', { timeout: 120000 });
const R = (fn, arg) => page.evaluate(fn, arg);
ok((await R(() => game.ctl)) === 'run', 'a phone rides the courier run');

// ride the job under way to its receipt (the careful bot), watching the door scenes; the receipt is left open
async function rideToReceipt() {
  await R(() => { window.__K = { scenes: [], rated: [], modes: new Set() }; });
  const wall = Date.now();
  let st = null;
  while (Date.now() - wall < 300000) {
    st = await R(() => {
      const r = game.ride, Rr = r.R, K = window.__K;
      game.skipTween(); K.modes.add(game.mode);
      document.querySelectorAll('.modal.tip [data-x], .modal.pop [data-x], .modal.day [data-x], .modal.ach [data-x]').forEach((b) => b.click());
      document.querySelectorAll('.evdock.in .opt').forEach((b, i) => { if (i === 0) b.click(); });
      const sc = document.querySelector('.modal.scene:not(.out)');
      if (sc && !sc.__seen) { sc.__seen = true; K.scenes.push({ kind: Rr.job.legs[Rr.leg].kind, buttons: sc.querySelectorAll('button').length, text: sc.textContent.replace(/\s+/g, ' ').trim().slice(0, 70) }); }
      const rt = document.querySelector('.modal.rated:not(.out)');
      if (rt && !rt.__seen) { rt.__seen = true; K.rated.push(getComputedStyle(rt).pointerEvents); }
      const rc = document.querySelector('.modal.receipt:not(.out)');
      if (rc) {
        const b = Rr.bike.root.position;
        K.receipt = { offer: !!rc.querySelector('.rnext'), offerText: rc.querySelector('.rnext')?.textContent.replace(/\s+/g, ' ').trim(), next: rc.querySelector('[data-next]')?.textContent.trim(),
          short: !!rc.querySelector('[data-next].short'), hub: rc.querySelector('[data-x]')?.textContent.trim(), bike: [b.x, b.z], picked: Rr.orders.every((x) => x.picked), done: Rr.orders.every((x) => x.done) };
        return { receipt: true };
      }
      if (Rr.phase === 'ride') for (let i = 0; i < 20 && Rr.phase === 'ride'; i++) { if (Rr.event && !Rr.event.fired) Rr.event = null; r.schemeBot(); game.sim(0.05); }
      else if (Rr.active) game.sim(0.1);
      return { receipt: false, phase: Rr.phase };
    });
    if (st.receipt) break;
    await sleep(st.phase === 'ride' ? 5 : 100);
  }
  await sleep(700); // (the count-up)
  return R(() => ({ ...window.__K, modes: [...window.__K.modes], energy: game.St.S.energy.n, del: game.St.S.stats.deliveries, cash: game.St.S.cash }));
}

// job 1: an order near the bike, started from the hub (one ⚡)
const e0 = await R(() => game.St.S.energy.n), d0 = await R(() => game.St.S.stats.deliveries);
await R(async () => {
  const { makeOrder } = await import('./js/orders.js');
  const o = makeOrder(game.city, Math.random, { from: game.St.S.pos });
  game.board.push(o); game.taken = [o]; game.startJob();
});
const j1 = await rideToReceipt();
console.log(`  job 1: scenes ${JSON.stringify(j1.scenes)}, offer "${j1.receipt.offerText}" · "${j1.receipt.next}" / "${j1.receipt.hub}"`);
ok(j1.scenes.length === 2 && j1.scenes.every((s) => s.buttons === 0), 'pickup and drop cards have no button (the scenes play by themselves)');
ok(j1.receipt.picked && j1.receipt.done, 'the food was picked up and handed over without a tap');
ok(j1.rated.length === 1 && j1.rated[0] === 'none', `the rating showed and lets touches through (pointer-events ${j1.rated[0]})`);
ok(j1.receipt.offer && /ride on/i.test(j1.receipt.next) && /1/.test(j1.receipt.next) && !j1.receipt.short, 'the receipt offers a next order nearby, "Collect & ride on" for ⚡1');
ok(/back to hub/i.test(j1.receipt.hub), 'and "Collect & back to hub"');
ok(j1.energy === e0 - 1, `Start spent one ⚡ (${e0} → ${j1.energy})`);
await page.screenshot({ path: `${prefix}-receipt.png` });

// ride on: the offered order starts where the bike stands — no hub, no camera flight
const bike1 = j1.receipt.bike, cash1 = j1.cash;
// (every screen the game switches to on the way, and every mode it passes through)
await R(() => {
  window.__M = []; const sm = game.ui.setMode; game.ui.setMode = (m) => { window.__M.push('ui:' + m); return sm(m); };
  window.__mi = setInterval(() => { if (window.__M.at(-1) !== game.mode) window.__M.push(game.mode); }, 5);
  document.querySelector('.modal.receipt [data-next]').click();
});
await page.waitForFunction(() => game.ride.R.active && game.ride.R.phase === 'ride', { timeout: 30000 });
const on = await R(() => { clearInterval(window.__mi); const Rr = game.ride.R, b = Rr.bike.root.position; return { modes: window.__M, n: Rr.job.orders.length, bike: [b.x, b.z], energy: game.St.S.energy.n, cash: game.St.S.cash, hubHidden: document.getElementById('hubui').hidden }; });
ok(on.n === 1 && on.modes.includes('ui:ride') && !on.modes.some((m) => /hub|tween|busy/.test(m)) && on.hubHidden, `"ride on" starts the next order without the hub (${on.modes.join(' → ')})`);
const jump = Math.hypot(on.bike[0] - bike1[0], on.bike[1] - bike1[1]);
ok(jump < 3, `the bike starts from the customer's door (moved ${jump.toFixed(1)} m)`);
ok(on.energy === j1.energy - 1, `riding on spends one ⚡ (${j1.energy} → ${on.energy})`);
ok(on.cash > cash1 - 0.01 && cash1 > 200, `the pay was collected ($${cash1.toFixed(2)})`);
await sleep(400);
await page.screenshot({ path: `${prefix}-rideon.png` });

// job 2 to its receipt, then back to the hub
const j2 = await rideToReceipt();
ok(j2.receipt.done && j2.del === d0 + 2, `the second order is delivered too (deliveries +${j2.del - d0})`);
ok(j2.receipt.offer, 'and its receipt offers another');
await R(() => document.querySelector('.modal.receipt [data-x]').click());
await page.waitForFunction(() => game.mode === 'hub', { timeout: 30000 });
ok(true, '"Collect & back to hub" goes back to the hub');

// short of energy: the offer says so, and opens the energy panel; a coffee lights it up again
await sleep(800);
const sh = await R(async () => {
  const St = game.St, { makeOrder } = await import('./js/orders.js');
  St.S.energy.n = 0; St.S.energy.t = Date.now(); St.S.cash = 500;
  const o = makeOrder(game.city, Math.random, { from: St.S.pos });
  window.__how = null;
  game.ui.receipt({ lines: [{ label: 'test', amount: 10 }], total: 10, xp: 5, avgStars: 5, next: { o, need: game.energyFor(1) } }).then((h) => { window.__how = h; });
  await new Promise((r) => setTimeout(r, 300));
  const nb = document.querySelector('.modal.receipt [data-next]');
  const a = { short: nb.classList.contains('short'), text: nb.textContent.trim() };
  nb.click(); await new Promise((r) => setTimeout(r, 400));
  a.panel = !!document.querySelector('.modal.energy:not(.out)');
  document.querySelector('.modal.energy [data-x="coffee"]')?.click(); await new Promise((r) => setTimeout(r, 400));
  a.after = { short: nb.classList.contains('short'), text: nb.textContent.trim(), energy: St.S.energy.n };
  document.querySelectorAll('.modal.energy [data-x]').forEach((b) => { if (!/coffee/.test(b.dataset.x)) b.click(); });
  return a;
});
ok(sh.short && /out of energy/i.test(sh.text), `with no ⚡ the offer says so ("${sh.text}")`);
ok(sh.panel, 'and tapping it opens the energy panel');
ok(!sh.after.short && /ride on/i.test(sh.after.text), `a coffee lights it up again (⚡${sh.after.energy}, "${sh.after.text}")`);
await page.screenshot({ path: `${prefix}-short.png` });
await R(() => document.querySelector('.modal.receipt [data-x]')?.click());
await sleep(500);
ok((await R(() => window.__how)) === 'hub', 'the hub button resolves the receipt as "hub"');

ok(!errs.length, `no errors${errs.length ? ': ' + errs.slice(0, 3).join(' | ') : ''}`);
console.log(fails ? `\n${fails} FAILED` : '\nall ok');
await browser.close(); server.close();
process.exit(fails ? 1 : 0);

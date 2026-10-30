// The autopilot's STOP on a phone (behind ?ctl=stop since the brake became the phone's way of riding, 2026-10-28): the scooter no longer stops by itself for a red light, someone crossing or the door;
// a STOP button comes up for each, and a tap brings the bike to rest there. Checks the first-ride card, the button
// (no "Run it!" any more), a stop at a red and the roll-on at green, a red run, a pedestrian scare and a door ridden
// past (backed up to) when nobody taps, a camera fine for every red run at a light that has one, and whole jobs with a careful rider (ride.autoBot) and hands off — no soft-locks.
// The careful and hands-off riders ride the same orders from the same spot (events off), so the two can be compared.
//   node tools/stop.mjs [shot-prefix]    env: JOBS=n (jobs per rider, default 3)
import { createRequire } from 'node:module';
import { serve } from './serve.mjs';
const require = createRequire(import.meta.url);
let puppeteer; try { puppeteer = require('puppeteer-core'); } catch { puppeteer = require('/root/.npm/_npx/110f701c48e68d66/node_modules/puppeteer-core'); }
const prefix = process.argv[2] || 'tools/shots/stop';
const JOBS = +(process.env.JOBS || 3);
// (the first-time hints that slow time down are marked seen, so the timings below hold; the new ride card is not)
const SAVE = { v: 1, lvl: 6, cash: 3000, xp: 0, districts: { oldtown: true, downtown: true }, stats: { deliveries: 30 },
  seen: { rideTip: 1, c_stop_light: 1, c_stop_ped: 1, c_stop_door: 1, c_hop: 1, c_overtake: 1, c_shortcut: 1, c_boost: 1 }, onboard: { step: 99 },
  settings: { music: 0, sfx: 0, quality: 'low', haptics: false }, active: 'vespetta',
  vehicles: { rustbucket: { parts: { engine: 0, suspension: 0, box: 0, tires: 0 }, count: 1 }, vespetta: { parts: { engine: 1, suspension: 0, box: 0, tires: 0 }, count: 1 } } };

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
await page.evaluateOnNewDocument((s) => localStorage.setItem('fds_save_v1', s), JSON.stringify(SAVE));
await page.goto(`${base}/index.html?noti=1&energy=off&clock=600&ctl=stop`, { waitUntil: 'networkidle0', timeout: 240000 });
await page.waitForFunction('window.ready', { timeout: 120000 });
const R = (fn, arg) => page.evaluate(fn, arg);
ok(!(await R(() => game.ctl)) && !(await R(() => game.manual())), '?ctl=stop: a phone rides on the autopilot');
// the paired runs' orders, made once from the starting spot (each run rides a copy)
await R(async (n) => {
  const S = game.St.S, { makeOrder } = await import('./js/orders.js'), { mulberry32 } = await import('./js/rng.js');
  window.__start = { pos: S.pos, dir: S.posDir, orders: Array.from({ length: n }, (_, j) => makeOrder(game.city, mulberry32(1000 + j * 37), { from: S.pos })) };
}, JOBS);

// one job, ridden out. rider: 'careful' (ride.autoBot, taps STOP in the perfect second), 'none' (hands off), 'probe'
// (hands off, but taps the HUD's STOP button for red lights and watches what the bike does). peds: jaywalkers put in
// front of the bike on each leg. seed: paired order number j (ridden from the test's starting spot, with no events).
async function job({ rider, peds = 0, shots = false, seed = null }) {
  await R(async (seed) => {
    const { makeOrder } = await import('./js/orders.js');
    let o;
    if (seed != null) { const S = game.St.S, A = window.__start; S.pos = A.pos; S.posDir = A.dir; o = { ...A.orders[seed], id: 'pair' + seed + '-' + Math.random(), born: performance.now() }; }
    else o = makeOrder(game.city, Math.random, { from: game.St.S.pos });
    window.__T = { receipt: null, scenes: [], del0: game.St.S.stats.deliveries, lights: [], tip: '', runIt: 0, shown: {}, labels: new Set(), legPeds: -1, stopFrames: 0, peds: [] };
    window.__T.order = `${o.rest}→${o.name} ${o.type} ${o.eta.toFixed(0)}s`;
    game.board.push(o); game.taken = [o]; game.startJob();
  }, seed);
  for (let i = 0; i < 80; i++) {
    const m = await R(() => { game.skipTween(); const t = document.querySelector('.modal.tip'); if (t) window.__T.tip = t.textContent; return { mode: game.mode, tip: !!t }; });
    if (m.mode === 'ride' && (m.tip || i > 20)) break;
    await sleep(150);
  }
  if (shots) await page.screenshot({ path: `${prefix}-tip.png` });
  await R(() => document.querySelectorAll('.modal.tip [data-x]').forEach((b) => b.click()));
  let st = null, n = 0, shot = 0;
  const wall = Date.now();
  while (Date.now() - wall < 300000) {
    st = await R(({ rider, peds, seed }) => {
      const r = game.ride, Rr = r.R, T = window.__T;
      const sc = document.querySelector('.modal.scene:not(.out)');
      if (sc && !sc.__seen) {
        sc.__seen = true;
        const leg = Rr.job.legs[Rr.leg], L = game.city.lots[leg.lot], d = L.doorPos || [game.city.tiles[L.door].x * 10, game.city.tiles[L.door].z * 10], b = Rr.bike.root.position;
        T.scenes.push({ kind: leg.kind, dist: Math.hypot(b.x - d[0], b.z - d[1]) });
        setTimeout(() => sc.querySelector('[data-x]')?.click(), 150);
      }
      document.querySelectorAll('.modal.tip [data-x], .modal.rated').forEach((b) => b.click());
      document.querySelectorAll('.evdock.in .opt, .evdock.in .btn').forEach((b, i) => { if (i === 0) { b.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); b.click(); } });
      const rc = document.querySelector('.modal.receipt:not(.out)');
      if (rc && !T.receipt) {
        T.receipt = true; T.stats = { ...Rr.stats }; T.flashed = document.getElementById('ridehud').classList.contains('flash-camera'); T.time = Rr.rideTime; T.fines = Rr.fines;
        const x = Rr.orders[0]; T.result = x && x.result && { stars: x.result.stars, cond: Math.round(x.result.cond), tip: x.result.tip, late: !!x.result.late, early: !!x.result.early, earned: x.result.pay + x.result.bonus + x.result.tip - Rr.fines };
        setTimeout(() => rc.querySelector('[data-x]')?.click(), 150);
      }
      document.querySelectorAll('.modal.pop [data-x], .modal.day [data-x], .modal.ach [data-x]').forEach((b) => b.click());
      const btn = document.querySelector('.r-btn.stop');
      const tapBtn = () => { btn.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerType: 'touch' })); btn.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerType: 'touch' })); };
      for (let i = 0; i < 20 && Rr.phase === 'ride'; i++) {
        if (seed != null && Rr.event && !Rr.event.fired) Rr.event = null;
        if (Rr.crash > 1.75 && !T.crashSeen) { T.crashSeen = true; (T.crashes ??= []).push([...document.querySelectorAll('#toasts .toast.bad')].map((t) => t.textContent).pop() || '?'); if (Rr.tboned >= 0) (T.tb ??= []).push(Rr.tboned); } else if (Rr.crash <= 0) T.crashSeen = false;
        // jaywalkers: one per leg, once the bike is under way
        if (peds && T.legPeds !== Rr.leg && Rr.s > 15 && Rr.route.length - Rr.s > 60) { T.legPeds = Rr.leg; if (r.testPed(38)) T.peds.push({ h: Rr.hazards[Rr.hazards.length - 1], s: null }); }
        // each one as the bike reaches it: still in its path and not scared would be riding through them
        for (const P of T.peds) if (P.s == null && Rr.hazards.includes(P.h) && Rr.s > P.h.s - 0.5) P.s = { scared: !!P.h.scared, through: !P.h.scared && !P.h.done && P.h.walking && Math.abs(P.h.px - Rr.lat) < 1.3 };
        if (rider === 'careful') r.autoBot();
        if (document.querySelector('.r-ctx [data-ride="go"]')) T.runIt++;
        const U = Rr.stopUi;
        // what the button shows, checked against the ride (the HUD is updated on every ride frame, game.sim's too)
        if (U && Rr.crash <= 0) { T.stopFrames++; T.shown[U.kind] = true; if (!btn.hidden) T.labels.add(btn.querySelector('small').textContent.replace(/\d+/, 'n')); else T.hiddenWhileUp = (T.hiddenWhileUp || 0) + 1; }
        if (rider === 'probe') {
          // red lights: tap the button in its perfect second, then watch the stop, the wait and the roll-on
          if (U && U.kind === 'light' && U.timing === 'now' && !btn.hidden) { tapBtn(); T.lights.push({ tile: Rr.stopP?.id ?? Rr.stops[Rr.stops.length - 1]?.id, tapped: Rr.stops.length > 0, halted: null, state: null, rolled: false, ran: false, reds0: Rr.stats.reds }); }
          const Lp = T.lights[T.lights.length - 1];
          if (Lp && !Lp.done) {
            const S = Rr.stops.find((x) => x.kind === 'light');
            if (S && S.halted && Lp.halted == null) { Lp.halted = +(S.s - Rr.s).toFixed(2); Lp.state = Rr.light?.state; Lp.t = Rr.rideTime; }
            if (Lp.halted != null && !S && Rr.v > 2) { Lp.rolled = true; Lp.greenAt = Rr.rideTime - Lp.t; Lp.done = true; Lp.ran = Rr.stats.reds > Lp.reds0; }
            if (Rr.leg !== Lp.leg && Lp.leg != null) Lp.done = true;
            Lp.leg = Rr.leg;
          }
        }
        game.sim(0.05);
      }
      if (Rr.phase !== 'ride' && Rr.active) game.sim(0.1);
      return { mode: game.mode, phase: Rr.phase, receipt: !!T.receipt };
    }, { rider, peds, seed });
    if (shots && st.phase === 'ride' && n++ % 30 === 15 && shot < 3) await page.screenshot({ path: `${prefix}-${rider}-ride${shot++}.png` });
    if (st.receipt && st.mode === 'hub') break;
    await sleep(st.phase === 'ride' ? 5 : 100);
  }
  if (!(st && st.receipt)) console.log('  stuck:', await R(() => { const Rr = game.ride.R, L = Rr.light;
    return JSON.stringify({ phase: Rr.phase, leg: Rr.leg, s: +Rr.s.toFixed(1), len: +Rr.route.length.toFixed(1), v: +Rr.v.toFixed(2), crash: +Rr.crash.toFixed(1), wait: +Rr.wait.toFixed(1), over: Rr.over, stops: Rr.stops.map((x) => x.kind), ui: Rr.stopUi,
      light: L && L.state + L.d.toFixed(1), blocked: Rr.blockedBy, modals: [...document.querySelectorAll('.modal, .evdock')].map((m) => m.className).join('|') }); }));
  return R(() => ({ ...window.__T, peds: window.__T.peds.map((P) => P.s || { missed: true }), labels: [...window.__T.labels], del1: game.St.S.stats.deliveries, mode: game.mode }));
}

const report = (label, res) => {
  const s = res.stats || {}, o = res.result;
  console.log(`  ${label}: ${res.time ? res.time.toFixed(0) + ' s' : '?'}${o ? ` (${o.stars}★, food ${o.cond}%, $${o.earned} after $${res.fines} fines${o.late ? ', late' : o.early ? ', early' : ''})` : ''}, STOPs ${s.halts} (perfect ${s.stops}), reds run ${s.reds}, camera fines ${s.tickets}, doors overshot ${s.overshoots}, pedestrians scared ${s.pedHits}, crashes ${s.crashes}, bumps ${s.bumps}`);
  if (res.crashes) console.log(`    crashes: ${res.crashes.join(' · ')}`);
  if (res.tb) ok(new Set(res.tb).size === res.tb.length, `${label}: a red run is T-boned at most once (${res.tb.length} at ${new Set(res.tb).size} junctions)`);
  ok(res.receipt && res.mode === 'hub', `${label}: reached the receipt and the hub`);
  ok(res.del1 - res.del0 === 1, `${label}: delivered (+${res.del1 - res.del0})`);
  const far = res.scenes.filter((x) => x.dist > 14);
  ok(res.scenes.length === 2 && !far.length, `${label}: pickup and drop-off at their doors (${res.scenes.map((x) => `${x.kind} ${x.dist.toFixed(1)} m`).join(', ')})`);
  ok(!res.runIt, `${label}: no "Run it!" button`);
  ok(!res.hiddenWhileUp, `${label}: STOP is on screen whenever there's something to stop for (${res.stopFrames} frames, hidden ${res.hiddenWhileUp || 0})`);
};

// 1. the first ride on the new rules explains STOP; then a probe rider taps the HUD's button for red lights
console.log('--- STOP button (probe rider: taps STOP for red lights, nothing else)');
const sum = { careful: [], none: [] };
const probe = [];
for (let j = 0; j < JOBS; j++) {
  const res = await job({ rider: 'probe', shots: j === 0 });
  if (j === 0) ok(/stopping is your job/.test(res.tip) && /STOP/.test(res.tip) && !/run lights/.test(res.tip), 'the first ride since STOP came in explains it (and no longer offers to run lights)');
  report(`probe ${j + 1}`, res);
  probe.push(...res.lights.filter((x) => x.tapped));
  if (j === 0) console.log(`  labels seen: ${res.labels.join(' · ') || '–'}`);
}
const halted = probe.filter((x) => x.halted != null);
console.log(`  red lights tapped for: ${probe.length}, ${probe.map((x) => `stopped ${x.halted}m before the line (${x.state}), rolled on ${x.rolled ? `after ${x.greenAt.toFixed(1)} s` : 'no'}${x.ran ? ', RAN IT' : ''}`).join(' · ')}`);
if (probe.length) {
  ok(halted.length >= Math.ceil(probe.length / 2), `tapping STOP stops the bike at the light (${halted.length}/${probe.length}; the rest went green before it stood still)`);
  ok(halted.every((x) => x.halted > -0.7 && x.halted < 3 && x.state !== 'g'), 'it stands at the stop line, on red or yellow');
  ok(halted.every((x) => x.rolled && !x.ran), 'and rolls on by itself once it is green, without counting as a red run');
} else console.log('  (no red light came up on these routes)');

// 2. the same orders hands off and with a careful rider. Hands off: reds are run, every door goes by and the bike backs
// up to it, jaywalkers get a fright — and it all still finishes
const seeds = Array.from({ length: JOBS }, (_, j) => j);
console.log('--- hands off (jaywalkers on each leg)');
// (a camera at every light here: the district's odds are set to 1, then put back)
const setCams = (v) => R(async (v) => {
  const { DPROFILE } = await import('./js/data.js');
  window.__cams ??= Object.fromEntries(Object.entries(DPROFILE).map(([k, p]) => [k, p.cams]));
  for (const k in DPROFILE) DPROFILE[k].cams = v ?? window.__cams[k];
}, v);
await setCams(1);
for (let j = 0; j < JOBS; j++) { const res = await job({ rider: 'none', peds: 1, shots: j === 0, seed: seeds[j] }); report(`hands off ${j + 1}`, res); sum.none.push(res); }
await setCams(null);
const tot = (list, k) => list.reduce((a, x) => a + (x.stats?.[k] || 0), 0);
ok(tot(sum.none, 'overshoots') === 2 * sum.none.length, `every door is ridden past and backed up to (${tot(sum.none, 'overshoots')} / ${2 * sum.none.length})`);
ok(tot(sum.none, 'halts') === 0 && tot(sum.none, 'stops') === 0, `…which still ends at the door (no STOP, no perfect stops: ${tot(sum.none, 'halts')} / ${tot(sum.none, 'stops')})`);
// (whether a jaywalker is still in the road when the bike gets there depends on the traffic in front of it)
const jw = sum.none.flatMap((x) => x.peds);
ok(tot(sum.none, 'pedHits') > 0 && !jw.some((x) => x.through), `jaywalkers nobody stopped for get a fright, and nobody is ridden through (${jw.length} put out: ${jw.filter((x) => x.scared).length} scared, ${jw.filter((x) => x.through).length} ridden through, the rest had crossed)`);
ok(tot(sum.none, 'reds') > 0, `red lights are run, not waited at (${tot(sum.none, 'reds')} in ${sum.none.length} jobs)`);
ok(tot(sum.none, 'tickets') === tot(sum.none, 'reds') && sum.none.every((x) => !x.stats?.tickets || (x.fines > 0 && x.flashed)), `…and with a camera at every light, it flashes and fines every one of them (${tot(sum.none, 'tickets')} fines for ${tot(sum.none, 'reds')} reds, $${sum.none.map((x) => x.fines).join(' / $')})`);

// 3. a careful rider: STOP in the perfect second for every light, crossing and door
console.log('--- careful rider (ride.autoBot, jaywalkers on each leg)');
for (let j = 0; j < JOBS; j++) { const res = await job({ rider: 'careful', peds: 1, shots: j === 0, seed: seeds[j] }); report(`careful ${j + 1}`, res); sum.careful.push(res); }
ok(sum.careful.every((x, j) => x.order === sum.none[j].order), `(the two rode the same orders: ${sum.careful.map((x) => x.order).join(', ')})`);
ok(tot(sum.careful, 'overshoots') === 0 && tot(sum.careful, 'stops') >= 2 * sum.careful.length, `pulls up in the ring at every door, perfectly (${tot(sum.careful, 'stops')} perfect stops, ${tot(sum.careful, 'overshoots')} overshoots)`);
ok(tot(sum.careful, 'pedHits') === 0, `stops for every jaywalker (${tot(sum.careful, 'pedHits')} scared)`);
ok(tot(sum.careful, 'reds') <= 1, `runs no reds (${tot(sum.careful, 'reds')})`);
const avg = (list, f) => list.reduce((a, x) => a + f(x), 0) / Math.max(1, list.length);
const stars = (x) => x.result?.stars || 0, cond = (x) => x.result?.cond || 0, time = (x) => x.time || 0, earned = (x) => x.result?.earned || 0;
const line = (l) => `${avg(l, stars).toFixed(1)}★, food ${avg(l, cond).toFixed(0)}%, $${avg(l, earned).toFixed(1)}, ${avg(l, time).toFixed(0)} s`;
console.log(`  same orders — careful: ${line(sum.careful)} · hands off: ${line(sum.none)}`);
ok(avg(sum.careful, cond) > avg(sum.none, cond) + 5, 'tapping STOP keeps the food in better shape than hands off');
ok(avg(sum.careful, stars) >= avg(sum.none, stars) && avg(sum.careful, earned) > avg(sum.none, earned), 'and earns at least as many stars, and more money');

ok(!errs.length, `no page errors${errs.length ? ': ' + errs.slice(0, 3).join(' | ') : ''}`);
await browser.close(); server.close();
console.log(fails ? `${fails} FAILED` : 'all ok');
process.exit(fails ? 1 : 0);

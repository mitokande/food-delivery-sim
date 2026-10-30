// The brake (?ctl=b, the phone's ride 2026-10-28 to -30) and the lane run (?ctl=a) prototypes on a phone: the HUD has
// no power buttons, a finger held on the screen brakes (on the lane run a swipe changes lane; on the brake a swipe only
// takes a junction's other street, and a thumb drifting on the brake keeps braking), and whole jobs finish both with a
// careful rider (ride.schemeBot) and with nobody touching the screen at all (no soft-locks: stuck behind a parked car,
// past the door, after crashes).
// The courier run (a phone's way of riding since 2026-10-30: 'run', no ?ctl needed): the road rides itself, the
// traffic is the rider's — a BRAKE button of its own (a finger held anywhere else does nothing), left / right is a
// lane, up a hop; the streets around the route are busy.
// On the brake and the run, the careful and hands-off riders also ride the same orders from the same spot (events off,
// a jaywalker put out on each leg), so the two can be compared.
//   node tools/ctl.mjs [a|b|run|both|all] [shot-prefix]    env: JOBS=n (careful jobs per scheme, default 2), PAIRS=n
//   (paired orders on the brake and the run, default 3)
import { createRequire } from 'node:module';
import { serve } from './serve.mjs';
const require = createRequire(import.meta.url);
let puppeteer; try { puppeteer = require('puppeteer-core'); } catch { puppeteer = require('/root/.npm/_npx/110f701c48e68d66/node_modules/puppeteer-core'); }
const SCHEMES = { both: ['a', 'b'], all: ['a', 'b', 'run'] }[process.argv[2] || 'both'] || [process.argv[2]];
const prefix = process.argv[3] || 'tools/shots/ctl';
const JOBS = +(process.env.JOBS || 2), PAIRS = +(process.env.PAIRS || 3);
// (the first-time hints that slow time down are marked seen, so the timings below hold)
const SAVE = { v: 1, lvl: 6, cash: 3000, xp: 0, districts: { oldtown: true, downtown: true }, stats: { deliveries: 30 },
  seen: { rideTip: 1, freeTip: 1, c_lb_brake: 1, c_lb_zone: 1, c_lb_round: 1, c_lb_draft: 1, c_lb_ring: 1, c_lb_shortcut: 1,
    c_run_hop: 1, c_run_lane: 1, c_run_red: 1, c_run_onc: 1, c_run_coins: 1, c_run_light: 1 }, onboard: { step: 99 },
  settings: { music: 0, sfx: 0, quality: 'low', haptics: false }, active: 'vespetta',
  vehicles: { rustbucket: { parts: { engine: 0, suspension: 0, box: 0, tires: 0 }, count: 1 }, vespetta: { parts: { engine: 1, suspension: 0, box: 0, tires: 0 }, count: 1 } } };

const { server, base } = await serve();
const browser = await puppeteer.launch({ executablePath: '/root/.cache/puppeteer/chrome/linux-148.0.7778.97/chrome-linux64/chrome', headless: 'new', protocolTimeout: 900000,
  args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let fails = 0;
const ok = (c, label) => { if (!c) fails++; console.log(`${c ? 'ok  ' : 'FAIL'} ${label}`); };

for (const scheme of SCHEMES) {
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/404|Failed to load resource/.test(m.text())) errs.push(m.text()); });
  await page.evaluateOnNewDocument((s) => localStorage.setItem('fds_save_v1', s), JSON.stringify(SAVE));
  await page.goto(`${base}/index.html?noti=1&energy=off&clock=600&ctl=${scheme === 'run' ? 'off' : scheme}`, { waitUntil: 'networkidle0', timeout: 240000 });
  await page.waitForFunction('window.ready', { timeout: 120000 });
  const R = (fn, arg) => page.evaluate(fn, arg);
  console.log(`--- scheme ${scheme} (game.ctl ${await R(() => game.ctl)}, riding freely: ${await R(() => game.manual())})`);
  ok((await R(() => game.ctl)) === scheme, scheme === 'run' ? 'a phone rides the courier run by default' : `?ctl=${scheme} switches the prototype on`);

  // one job: start it (an order near the bike), then ride it out. bot: the careful rider, or hands off. resume: ride
  // out the job already under way
  // seed: paired order number j, ridden from the test's starting spot
  // every district's red-light camera odds set to v (null: back to the real ones)
  const setCams = (v) => R(async (v) => {
    const { DPROFILE } = await import('./js/data.js');
    window.__cams ??= Object.fromEntries(Object.entries(DPROFILE).map(([k, p]) => [k, p.cams]));
    for (const k in DPROFILE) DPROFILE[k].cams = v ?? window.__cams[k];
  }, v);
  const startJob = (seed = null) => R(async (seed) => {
    const { makeOrder } = await import('./js/orders.js');
    let o;
    if (seed != null) { const S = game.St.S, A = window.__start; S.pos = A.pos; S.posDir = A.dir; o = { ...A.orders[seed], id: 'pair' + seed + '-' + Math.random(), born: performance.now() }; }
    else o = makeOrder(game.city, Math.random, { from: game.St.S.pos });
    window.__T = { receipt: null, scenes: [], del0: game.St.S.stats.deliveries, order: `${o.rest}→${o.name} ${o.type} ${o.eta.toFixed(0)}s`, legPeds: -1 };
    game.board.push(o); game.taken = [o]; game.startJob();
  }, seed);
  async function job({ bot, gestures = false, shots = false, resume = false, seed = null }) {
    if (!resume) await startJob(seed);
    let tip = '';
    for (let i = 0; i < 80 && !resume; i++) {
      const m = await R(() => { game.skipTween(); return { mode: game.mode, tip: document.querySelector('.modal.tip')?.textContent || '' }; });
      if (m.tip) tip = m.tip;
      if (m.mode === 'ride' && (tip || i > 20)) break;
      await sleep(150);
    }
    if (shots && tip) await page.screenshot({ path: `${prefix}-${scheme}-tip.png` });
    await R(() => document.querySelectorAll('.modal.tip [data-x]').forEach((b) => b.click()));
    if (gestures && scheme === 'run') {
      ok(/rides itself/.test(tip) && /traffic is yours/.test(tip) && /BRAKE/.test(tip) && /[Ss]wipe/.test(tip) && !/Hold anywhere/.test(tip), 'the first ride explains it: the road rides itself, the traffic is yours (BRAKE, swipes)');
      ok(/hop/.test(tip) && /coins/.test(tip) && /ruined/.test(tip) && /red/.test(tip), "…and what's the run's own (hops, coins, the food's life, the red light)");
    } else if (gestures) {
      ok(/always on/.test(tip) && /Hold anywhere/.test(tip) && (scheme === 'a' ? /change lane/.test(tip) : /one thing/.test(tip) && !/change lane/.test(tip)), scheme === 'a' ? 'the first ride explains the two moves' : 'the first ride explains the one move');
      ok(scheme === 'a' ? /draft/.test(tip) : /ring/.test(tip) && /gear/.test(tip) && /crossing/.test(tip) && /potholes/.test(tip), `…and what's this scheme's own (${scheme === 'a' ? 'draft' : 'ring, gears, people crossing, potholes'})`);
    }
    if (gestures) {
      const hud = await R(() => {
        const vis = (s) => { const e = document.querySelector(s); return !!e && !e.hidden && getComputedStyle(e).display !== 'none' && e.getBoundingClientRect().width > 0; };
        return { lb: document.getElementById('ridehud').classList.contains('lb'), turbo: vis('.r-btn.boost'), hop: vis('.r-btn.hop'), horn: vis('.r-btn.horn'), brake: vis('.r-btn.brake'), lanes: vis('.r-lanes .row'), gear: vis('.r-speed .gear'), proto: document.querySelector('.r-proto').textContent };
      });
      ok(hud.lb && !hud.turbo && !hud.hop && !hud.horn, `no turbo / hop / horn buttons (turbo ${hud.turbo}, hop ${hud.hop}, horn ${hud.horn})`);
      ok(scheme === 'run' ? hud.brake : !hud.brake, scheme === 'run' ? 'a BRAKE button of its own' : 'no brake button (the whole screen is the brake)');
      const lanes = scheme === 'a';
      ok(lanes ? hud.lanes && !hud.gear : scheme === 'b' ? hud.gear && !hud.lanes : !hud.gear && !hud.lanes, `scheme HUD: ${lanes ? 'lanes' : scheme === 'b' ? 'gear' : 'neither lanes nor gear'} shown (lanes ${hud.lanes}, gear ${hud.gear}) · "${hud.proto}"`);
      ok(scheme === 'a' ? /Prototype A/.test(hud.proto) : scheme === 'b' ? /Prototype B/.test(hud.proto) : !hud.proto, `prototype label: ${scheme === 'run' ? 'none (it is the game now)' : 'shown'}`);
      // up to speed (in one piece), then a finger held on the screen brakes, and lifting it lets go
      const g = await R(async () => {
        const c = document.getElementById('gl'), r = game.ride.R, ev = (type, x, y, id = 11) => c.dispatchEvent(new PointerEvent(type, { pointerId: id, clientX: x, clientY: y, bubbles: true, pointerType: 'touch' }));
        r.event = null; // (no event card in the middle of the test)
        const ready = () => r.v > 6 && r.crash <= 0 && r.phase === 'ride' && !r.lc && !r.junc && !r.hop && r.lane === 0 && !r.route.steps[r.sampled[3]].alley; // (not in a junction's turn window)
        // (getting up to speed with the careful rider, so the job's stats stay the careful rider's)
        const settle = (n) => { for (let i = 0; i < n && !ready(); i++) { game.ride.schemeBot(); game.sim(0.05); } game.ride.input('brake', false); };
        settle(240);
        const out = { v0: r.v };
        ev('pointerdown', 195, 560); out.held = r.ctl.brake;
        game.sim(0.9); out.v1 = r.v;
        ev('pointerup', 195, 560); out.released = !r.ctl.brake;
        settle(120);
        // the run: the BRAKE button brakes while it's held (and lets go when the thumb comes off it)
        if (r.scheme === 'run') {
          const btn = document.querySelector('.r-btn.brake'), bb = btn.getBoundingClientRect(), bev = (type) => btn.dispatchEvent(new PointerEvent(type, { pointerId: 30, clientX: bb.x + bb.width / 2, clientY: bb.y + bb.height / 2, bubbles: true, pointerType: 'touch' }));
          out.b0 = r.v; bev('pointerdown'); out.bHeld = r.ctl.brake; game.sim(0.9); out.b1 = r.v; bev('pointerup'); out.bReleased = !r.ctl.brake; game.sim(0.6); out.b2 = r.v;
          settle(120);
        }
        // the run: a swipe up is a hop
        if (game.ride.R.scheme === 'run') { ev('pointerdown', 200, 620, 20); ev('pointermove', 201, 590, 20); ev('pointermove', 202, 560, 20); out.hop = !!r.hop; ev('pointerup', 202, 560, 20); game.sim(1); settle(120); }
        // a swipe: the brake that bit on touch lets go, and the bike changes lane (left: the oncoming lane is always there).
        // On the brake there are no lanes: away from a junction the thumb drifting sideways keeps braking
        for (let k = 0; k < 400 && r.lane !== 0; k++) { game.ride.schemeBot(); game.sim(0.05); } game.ride.input('brake', false);
        const lane0 = r.lane;
        ev('pointerdown', 220, 600, 12); ev('pointermove', 190, 602, 12); ev('pointermove', 150, 604, 12);
        out.swipeLeft = r.lane - lane0; out.brakeAfterSwipe = r.ctl.brake;
        ev('pointerup', 150, 604, 12);
        if (game.ride.R.scheme === 'b') return out;
        game.sim(0.5); out.lat = r.lat;
        // and back (once nothing's alongside in our lane)
        // (on the run the bike may be passing the car it was following: back in once it's clear of it)
        for (let k = 0; k < 14 && r.lane !== 0; k++) { ev('pointerdown', 150, 600, 13 + k); ev('pointermove', 200, 600, 13 + k); ev('pointerup', 200, 600, 13 + k); if (r.lane !== 0) game.sim(0.3); }
        out.swipeBack = r.lane;
        game.sim(0.6); out.lat2 = r.lat;
        return out;
      });
      if (scheme === 'run') {
        ok(!g.held, `on the run a finger held down on the road doesn't brake (brake ${g.held}, ${(g.v0 * 3.6).toFixed(0)} → ${(g.v1 * 3.6).toFixed(0)} km/h)`);
        ok(g.bHeld && g.b1 < g.b0 - 3, `holding BRAKE brakes (${(g.b0 * 3.6).toFixed(0)} → ${(g.b1 * 3.6).toFixed(0)} km/h)`);
        ok(g.bReleased && g.b2 > g.b1, `letting go of it rides on (${(g.b1 * 3.6).toFixed(0)} → ${(g.b2 * 3.6).toFixed(0)} km/h)`);
      }
      else {
        ok(g.held && g.v1 < g.v0 - 3, `holding a finger down brakes (${(g.v0 * 3.6).toFixed(0)} → ${(g.v1 * 3.6).toFixed(0)} km/h)`);
        ok(g.released, 'lifting it lets go of the brake');
      }
      if (scheme === 'run') ok(g.hop, 'a swipe up hops');
      if (scheme === 'b') ok(g.swipeLeft === 0 && g.brakeAfterSwipe, `no lanes on the brake: a sideways drift keeps the lane and the brake (lane ${g.swipeLeft}, brake ${g.brakeAfterSwipe})`);
      else {
        ok(g.swipeLeft === -1 && !g.brakeAfterSwipe && g.lat < -2.5, `a swipe left changes lane and doesn't keep braking (lane ${g.swipeLeft}, across ${g.lat.toFixed(1)} m)`);
        ok(g.swipeBack === 0 && Math.abs(g.lat2) < 0.3, `a swipe right brings it back (lane ${g.swipeBack}, across ${g.lat2.toFixed(1)} m)`);
      }
    }
    let st = null, n = 0, shot = 0;
    const wall = Date.now();
    while (Date.now() - wall < 300000) {
      st = await R(({ bot, seed }) => {
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
          T.receipt = true; T.stats = { ...Rr.stats }; T.time = Rr.rideTime;
          const x = Rr.orders[0]; T.result = x && x.result && { stars: x.result.stars, cond: Math.round(x.result.cond), tip: x.result.tip, late: !!x.result.late, early: !!x.result.early, ratio: x.result.ratio, earned: x.result.pay + x.result.bonus + x.result.tip - Rr.fines };
          T.fines = Rr.fines;
          setTimeout(() => rc.querySelector('[data-x]')?.click(), 150);
        }
        document.querySelectorAll('.modal.pop [data-x], .modal.day [data-x], .modal.ach [data-x]').forEach((b) => b.click());
        if (Rr.phase === 'ride') for (let i = 0; i < 20 && Rr.phase === 'ride'; i++) {
          // paired runs: no events, and a jaywalker on each leg once the bike is under way
          if (seed != null && Rr.event && !Rr.event.fired) Rr.event = null;
          if (seed != null && T.legPeds !== Rr.leg && Rr.s > 15 && Rr.route.length - Rr.s > 60) { T.legPeds = Rr.leg; r.testPed(38); }
          if (bot) r.schemeBot(); game.sim(0.05);
          // what each crash was (the toast it put up)
          if (Rr.crash > 1.7 && !T.crashSeen) { T.crashSeen = true; (T.crashes ??= []).push([...document.querySelectorAll('#toasts .toast.bad')].map((t) => t.textContent).pop() || '?'); } else if (Rr.crash <= 0) T.crashSeen = false;
        }
        else if (Rr.active) game.sim(0.1);
        // (the run: how busy the 160 m of route ahead is — cars our way, cars coming)
        if (Rr.phase === 'ride' && Rr.scheme === 'run' && Rr.route.length - Rr.s > 160) {
          const steps = Rr.route.steps; let own = 0, onc = 0;
          for (let k = Rr.sampled[3]; k < steps.length && steps[k].s0 < Rr.s + 160; k++) { const x = steps[k]; for (const a of game.traffic.byTile.get(x.tile) || []) if (a.kind === 'car') { if (a.din === x.din) own++; else if (a.din === ((x.dout + 2) & 3)) onc++; } }
          (T.dense ??= []).push([own, onc]);
        }
        return { mode: game.mode, phase: Rr.phase, receipt: !!T.receipt, s: Rr.s, len: Rr.route?.length };
      }, { bot, seed });
      if (shots && st.phase === 'ride' && n++ % 40 === 20 && shot < 3) await page.screenshot({ path: `${prefix}-${scheme}-ride${shot++}.png` });
      if (st.receipt && st.mode === 'hub') break;
      await sleep(st.phase === 'ride' ? 5 : 100);
    }
    await R(() => game.ride.input('brake', false));
    if (!(st && st.receipt)) console.log('  stuck:', await R(() => { const Rr = game.ride.R, L = Rr.light;
      const hz = Rr.hazards.filter((h) => !h.done && h.s - Rr.s > -3 && h.s - Rr.s < 25).map((h) => `${h.type}@${(h.s - Rr.s).toFixed(1)}/${h.lane}`).join(' ');
      return JSON.stringify({ phase: Rr.phase, leg: Rr.leg, s: +Rr.s.toFixed(1), len: +Rr.route.length.toFixed(1), v: +Rr.v.toFixed(2), lane: Rr.lane, lat: +Rr.lat.toFixed(2), crash: +Rr.crash.toFixed(1), wait: +Rr.wait.toFixed(1),
        over: Rr.over, stuckT: Rr.stuckT, light: L && L.state + L.d.toFixed(1), hz, modals: [...document.querySelectorAll('.modal, .evdock')].map((m) => m.className).join('|') }); }));
    return R(() => ({ ...window.__T, del1: game.St.S.stats.deliveries, mode: game.mode }));
  }

  const report = (label, res) => {
    const s = res.stats || {}, o = res.result;
    console.log(`  ${label}: ${res.time ? res.time.toFixed(0) + ' s' : '?'}${o ? ` (${o.stars}★, food ${o.cond}%, tip $${o.tip}${o.late ? ', late' : o.early ? ', early' : ''})` : ''}, crashes ${s.crashes}, bumps ${s.bumps}, lanes ${s.lanes}, overtakes ${s.overtakes}, near misses ${s.nearMisses}, red lights run ${s.reds}, brake ${s.brakeT?.toFixed(1)} s` +
      (scheme === 'run' ? `, slingshots ${s.slings}, sidewalk ${Math.round(s.walkM || 0)} m, hops ${s.hops} (perfect ${s.perfect}), coins ${s.coins} ($${s.cash}), camera fines ${s.tickets}, pedestrians scared ${s.pedHits}, ruined ${s.ruined}${o ? `, earned $${o.earned} (fines $${res.fines}), ${(o.ratio * 100).toFixed(0)}% of the timer` : ''}`
        : scheme === 'a' ? `, slingshots ${s.slings}, sidewalk ${Math.round(s.walkM || 0)} m` : `, perfect corners ${s.corners}, slid wide ${s.wide}, perfect stops ${s.stops}, overshoots ${s.overshoots}, best gear ${s.gearMax}, waves ${s.waves}, camera fines ${s.tickets}, pedestrians scared ${s.pedHits}, smooth ${s.smooth}${o ? `, earned $${o.earned} (fines $${res.fines}), ${(o.ratio * 100).toFixed(0)}% of the timer` : ''}`));
    if (res.crashes) console.log(`    crashes: ${res.crashes.join(' · ')}`);
    ok(res.receipt && res.mode === 'hub', `${label}: reached the receipt and the hub`);
    ok(res.del1 - res.del0 === 1, `${label}: delivered (+${res.del1 - res.del0})`);
    const far = res.scenes.filter((x) => x.dist > 14);
    ok(res.scenes.length === 2 && !far.length, `${label}: pickup and drop-off at their doors (${res.scenes.map((x) => `${x.kind} ${x.dist.toFixed(1)} m`).join(', ')})`);
  };
  // lane run: the draft fills behind a car and a lane change spends it on a slingshot; the sidewalk lane rides up the
  // kerb, along the walking line and back down before the corner
  async function mechanicsA() {
    await startJob();
    for (let i = 0; i < 80 && (await R(() => { game.skipTween(); return game.mode; })) !== 'ride'; i++) await sleep(150);
    const m = await R(() => {
      const r = game.ride, Rr = r.R, tr = game.traffic, out = {};
      Rr.event = null;
      const st = () => Rr.route.steps[Rr.sampled[3]];
      const straight = (ahead) => { const k = Rr.sampled[3]; for (let j = k; j < Rr.route.steps.length && Rr.route.steps[j].s0 < Rr.s + ahead; j++) { const x = Rr.route.steps[j]; if (x.din !== x.dout || x.alley) return false; } return Rr.route.length - Rr.s > ahead + 25; };
      const ready = (ahead) => Rr.phase === 'ride' && Rr.v > 5 && Rr.crash <= 0 && !Rr.lc && Rr.lane === 0 && straight(ahead);
      for (let i = 0; i < 300 && !ready(30); i++) { game.sim(0.1); if (Rr.phase !== 'ride') break; }
      if (!ready(30)) return { skipped: 'no straight 30 m stretch' };
      // a car 8 m ahead in our lane, going a bit slower than us
      const car = tr.agents.find((a) => a.kind === 'car' && Math.hypot(a.pos[0] - Rr.bike.root.position.x, a.pos[1] - Rr.bike.root.position.z) > 60);
      const s = st(), into = Rr.s - s.s0;
      tr.placeAgent(car, s.tile, s.din, s.din, into + 8); car.v = car.vmax = Math.max(7.5, Rr.v * 0.8); car.next = null; car.wait = 0;
      game.sim(0.05);
      // hold the distance on the brake for a couple of seconds (the car keeps to our route)
      const steps = Rr.route.steps;
      const gap = () => { const k = Rr.sampled[3]; for (let j = k; j < Math.min(steps.length, k + 3); j++) { const x = steps[j]; if ((tr.byTile.get(x.tile) || []).includes(car)) return x.s0 + car.s - Rr.s - (car.len + 2.2) / 2; } return Infinity; };
      // (and on past any junction whose turn window is open: a swipe there would be the turn, not the lane)
      for (let i = 0; i < 50 || (i < 260 && (Rr.junc || Rr.draft < 0.9)); i++) {
        const j = steps.findIndex((x) => x.tile === car.tile); car.next = j >= 0 && steps[j + 1] ? steps[j + 1].dout : null;
        r.input('brake', gap() < 4); game.sim(0.05);
        if (Rr.phase !== 'ride' || Rr.crash > 0) break;
      }
      r.input('brake', false);
      out.draft = Rr.draft; out.v0 = Rr.v; out.sl0 = Rr.stats.slings;
      r.input('lane-left');
      out.sling = Rr.sling; out.boost = Rr.boost; out.v1 = Rr.v; out.slings = Rr.stats.slings - out.sl0;
      game.sim(0.6);
      for (let k = 0; k < 12 && Rr.lane !== 0; k++) { r.input('lane-right'); game.sim(0.3); }
      // the sidewalk: up the kerb, along it, and back down before the corner
      for (let i = 0; i < 300 && !(ready(0) && Rr.lane === 0); i++) game.sim(0.1);
      let tries = 0;
      for (; tries < 150 && Rr.lane !== 1 && Rr.phase === 'ride'; tries++) { if (ready(0)) r.input('lane-right'); if (Rr.lane !== 1) game.sim(0.2); }
      out.walkUp = Rr.lane === 1;
      if (out.walkUp) {
        game.sim(0.5);
        const b = Rr.bike.root.position;
        out.lat = Rr.lat; out.y = b.y; out.surface = game.world.surface(b.x, b.z);
        const m0 = Rr.stats.walkM;
        let downAt = null;
        for (let i = 0; i < 160 && Rr.phase === 'ride'; i++) { game.sim(0.05); if (Rr.lane !== 1 && downAt == null) downAt = Rr.s; if (downAt != null && !Rr.lc) break; }
        out.walkM = Rr.stats.walkM - m0; out.down = downAt != null; out.latEnd = Rr.lat; out.vEnd = Rr.v; out.crash = Rr.stats.crashes;
        if (!out.down) { r.input('lane-left'); game.sim(0.6); }
      }
      return out;
    });
    if (m.skipped) { console.log('  (mechanics skipped: ' + m.skipped + ')'); return { ...(await job({ bot: true, resume: true })), skipped: true }; }
    else {
      ok(m.draft > 0.9, `riding close behind a car fills the draft (${(m.draft * 100).toFixed(0)}%)`);
      ok(m.slings === 1 && m.sling > 1 && m.boost && m.v1 > m.v0 + 2, `pulling out spends it on a slingshot (${(m.v0 * 3.6).toFixed(0)} → ${(m.v1 * 3.6).toFixed(0)} km/h, ${m.sling.toFixed(1)} s)`);
      if (m.walkUp) {
        ok(m.lat > 3.5 && m.surface === 'walk' && m.y > 0.15, `a swipe right takes the bike up onto the sidewalk (across ${m.lat?.toFixed(1)} m, on '${m.surface}', ${m.y?.toFixed(2)} m up)`);
        ok(m.down || m.vEnd < 0.5, `…it rides along it (${m.walkM?.toFixed(0)} m) and comes back down before the corner, or stops at what's in the way (down ${m.down}, ${(m.vEnd * 3.6).toFixed(0)} km/h)`);
      } else console.log('  (sidewalk part skipped: no long enough stretch of sidewalk on this route)');
    }
    // and ride that job out
    return { ...(await job({ bot: true, resume: true })), skipped: !m.walkUp };
  }
  // junctions and lights: the arrows come up before a junction with another street to take, a swipe takes it and the
  // GPS re-routes to the same door (on the run no arrows come up: the GPS takes the junction); the countdown over the
  // next light agrees with the light's own cycle
  async function junctions() {
    await startJob();
    for (let i = 0; i < 80 && (await R(() => { game.skipTween(); return game.mode; })) !== 'ride'; i++) await sleep(150);
    const m = await R(() => {
      const r = game.ride, Rr = r.R, tr = game.traffic, out = {};
      Rr.event = null;
      // the countdown: the seconds it shows run out exactly when the light changes
      for (let i = 0; i < 600 && !(Rr.light && Rr.light.d < 60 && Rr.light.d > 20 && Rr.lightLeft > 1.5 && Rr.phase === 'ride'); i++) { r.schemeBot(); game.sim(0.05); }
      if (Rr.light && Rr.light.d < 60) {
        const L = Rr.light, head = tr.headAt(L.tile, L.din), sp = r.countdown, left = Rr.lightLeft, st0 = L.state;
        out.cd = { visible: sp.visible, nearHead: head ? Math.hypot(sp.position.x - head[0], sp.position.z - head[1]) : -1, left: +left.toFixed(2), state: st0 };
        const t0 = tr.time; let changedAt = null;
        for (let i = 0; i < 1000 && changedAt == null; i++) { tr.update(0.02); if (tr.light(L.tile, L.din) !== st0) changedAt = tr.time - t0; }
        out.cd.changedAt = changedAt == null ? null : +changedAt.toFixed(2);
      }
      // the run: ride through the next junction, no arrows on the way
      if (Rr.scheme === 'run') {
        const steps = Rr.route.steps, k = steps.findIndex((st, i) => i > Rr.sampled[3] + 1 && game.city.tiles[st.tile].junction);
        if (k < 0) return { ...out, skipped: 'no junction ahead' };
        const hud = document.querySelector('.r-turn');
        out.run = { junc: 0, shown: 0 };
        for (let i = 0; i < 2500 && Rr.phase === 'ride' && Rr.sampled[3] <= k; i++) { r.schemeBot(); game.sim(0.05); if (Rr.junc) out.run.junc++; if (!hud.hidden) out.run.shown++; }
        out.run.passed = Rr.sampled[3] > k;
        return out;
      }
      // a junction with another way: swipe toward it
      let J = null;
      for (let i = 0; i < 2500 && Rr.phase === 'ride'; i++) {
        r.schemeBot(); game.sim(0.05);
        const j = Rr.junc;
        if (j && j.dist > (Rr.scheme === 'run' ? 14 : 6) && Rr.crash <= 0 && !Rr.blockHz) { const alt = j.rels.find((x) => x !== j.cur && j.exits[x]); if (alt != null) { J = { ...j, alt }; break; } }
      }
      if (!J) return { ...out, skipped: 'no junction with another street found' };
      const hud = document.querySelector('.r-turn'), btns = [...hud.querySelectorAll('button')].filter((b) => !b.hidden);
      out.hud = { shown: !hud.hidden, n: btns.length, on: btns.find((b) => b.classList.contains('on'))?.dataset.r, labels: btns.map((b) => b.querySelector('small').textContent) };
      const path0 = Rr.route.path.slice(), t0 = Rr.stats.turns;
      const d = J.alt < 0 ? (J.din + 3) & 3 : J.alt > 0 ? (J.din + 1) & 3 : J.din;
      const want = J.tile + [[0, -1], [1, 0], [0, 1], [-1, 0]][d][0] + [[0, -1], [1, 0], [0, 1], [-1, 0]][d][1] * game.city.W;
      r.input(J.alt < 0 ? 'lane-left' : J.alt > 0 ? 'lane-right' : 'swipe-up');
      const path1 = Rr.route.path, k = path1.indexOf(J.tile);
      out.turn = { turns: Rr.stats.turns - t0, changed: path1.join() !== path0.join(), after: k >= 0 ? path1[k + 1] : null, want, sameDoor: path1[path1.length - 1] === path0[path0.length - 1], lane: Rr.lane, label: J.exits[J.alt].label };
      // and through it, on the new way
      for (let i = 0; i < 400 && Rr.phase === 'ride' && !(Rr.route.steps[Rr.sampled[3]].tile === want); i++) { r.schemeBot(); game.sim(0.05); }
      out.turn.reached = Rr.route.steps[Rr.sampled[3]].tile === want;
      return out;
    });
    if (m.cd) {
      ok(m.cd.visible && m.cd.nearHead >= 0 && m.cd.nearHead < 1, `the countdown hangs over the next light's signal head (${m.cd.nearHead.toFixed(2)} m off)`);
      ok(m.cd.changedAt != null && Math.abs(m.cd.changedAt - m.cd.left) < 0.08, `its seconds run out when the light changes (showed ${m.cd.left} s, changed after ${m.cd.changedAt} s, was '${m.cd.state}')`);
    } else console.log('  (no light came up within range: countdown not checked)');
    if (m.skipped) console.log('  (junction part skipped: ' + m.skipped + ')');
    else if (m.run) ok(m.run.passed && !m.run.junc && !m.run.shown, `on the run no turn arrows come up: the GPS takes the junction (passed ${m.run.passed}, chooser frames ${m.run.junc}, arrows shown ${m.run.shown})`);
    else {
      ok(m.hud.shown && m.hud.n >= 2 && m.hud.on != null, `the turn arrows show before the junction (${m.hud.n} ways, GPS on ${m.hud.on}: ${m.hud.labels.join(' / ')})`);
      ok(m.turn.turns === 1 && m.turn.changed && m.turn.after === m.turn.want && m.turn.sameDoor, `a swipe takes the other street and the GPS re-routes to the same door (${m.turn.label}, lane ${m.turn.lane})`);
      ok(m.turn.reached, 'the bike rides through the junction that way');
    }
    return { ...(await job({ bot: true, resume: true })), skipped: !!m.skipped };
  }
  // the run: the scooter doesn't stop for a red on its own; held from the brake point, BRAKE stops it before the line,
  // and once it's green, let go and it rides on through
  async function redBrake() {
    await startJob();
    for (let i = 0; i < 80 && (await R(() => { game.skipTween(); return game.mode; })) !== 'ride'; i++) await sleep(150);
    const m = await R(() => {
      const r = game.ride, Rr = r.R, btn = document.querySelector('.r-btn.brake');
      const press = (type) => { const bb = btn.getBoundingClientRect(); btn.dispatchEvent(new PointerEvent(type, { pointerId: 41, clientX: bb.x + bb.width / 2, clientY: bb.y + bb.height / 2, bubbles: true, pointerType: 'touch' })); };
      Rr.event = null;
      // (the careful rider up to a light that's red with a while to go, nothing of ours in front of it)
      const L0 = () => Rr.light && Rr.light.state === 'r' && Rr.light.d > 22 && Rr.light.d < 45 && Rr.lightLeft > 6 && Rr.v > 5 && Rr.lane === 0 && !Rr.lc && Rr.crash <= 0;
      for (let i = 0; i < 4000 && Rr.phase === 'ride' && !L0(); i++) { r.schemeBot(); game.sim(0.05); }
      if (!L0()) return { skipped: 'no red light came up' };
      r.input('brake', false);
      const tile = Rr.light.tile, reds = Rr.stats.reds, out = { d: Rr.light.d, v: Rr.v };
      // ride on hands off to just past the brake point (full brake ×0.8), then hold BRAKE
      for (let i = 0; i < 400 && Rr.light?.tile === tile && Rr.light.d > (Rr.v * Rr.v) / (2 * 9.5 * 0.8) + 2; i++) game.sim(0.02);
      press('pointerdown'); out.held = Rr.ctl.brake;
      for (let i = 0; i < 300 && Rr.v > 0.05; i++) game.sim(0.02);
      out.stopD = Rr.light?.tile === tile ? Rr.light.d : -9; out.stopV = Rr.v;
      for (let i = 0; i < 600 && Rr.light?.tile === tile && Rr.light.state !== 'g'; i++) game.sim(0.05);
      out.held2 = Rr.ctl.brake; out.v2 = Rr.v;
      press('pointerup');
      // (judged at this light: on past it, the careful rider again)
      for (let i = 0; i < 120 && Rr.light?.tile === tile; i++) game.sim(0.05);
      out.through = Rr.light?.tile !== tile; out.reds = Rr.stats.reds - reds;
      return out;
    });
    if (m.skipped) console.log('  (red light part skipped: ' + m.skipped + ')');
    else {
      ok(m.held && m.stopV < 0.1 && m.stopD > -0.5 && m.stopD < 12, `held from the brake point, BRAKE stops the scooter at a red (${m.stopD.toFixed(1)} m short of the line, from ${(m.v * 3.6).toFixed(0)} km/h)`);
      ok(m.held2 && m.v2 < 0.1, 'it stays stopped while BRAKE is held');
      ok(m.through && m.reds === 0, `let go on the green, it rides on through — no red run (${m.reds})`);
    }
    return { ...(await job({ bot: true, resume: true })), skipped: !!m.skipped };
  }
  for (let j = 0; j < JOBS; j++) report(`careful rider #${j + 1}`, await job({ bot: true, gestures: j === 0, shots: j === 0 }));
  if (scheme === 'run') { let done = false; for (let k = 0; k < 3 && !done; k++) { const res = await redBrake(); report('red light job', res); done = !res.skipped; } ok(done, 'a red light was braked for'); }
  { let done = false; for (let k = 0; k < 3 && !done; k++) { const res = await junctions(); report('junctions job', res); done = !res.skipped; } ok(done, 'a turn at a junction was tried out'); }
  // (a route may be too short or twisty for the draft or the sidewalk: try a few jobs)
  if (scheme === 'a') {
    let done = false;
    for (let k = 0; k < 4 && !done; k++) { const res = await mechanicsA(); report('mechanics job', res); done = !res.skipped; }
    ok(done, 'the draft and the sidewalk were both tried out');
  }
  if (scheme === 'a') { const hands = await job({ bot: false }); report('hands off', hands); }
  else {
    // the same orders, careful and hands off: the brake has to be worth it
    await R(async (n) => {
      const S = game.St.S, { makeOrder } = await import('./js/orders.js'), { mulberry32 } = await import('./js/rng.js');
      window.__start = { pos: S.pos, dir: S.posDir, orders: Array.from({ length: n }, (_, j) => makeOrder(game.city, mulberry32(1000 + j * 37), { from: S.pos })) };
    }, PAIRS);
    const sum = { careful: [], none: [] };
    // (hands off, the first order is ridden with no camera at any light and the rest with one at every light)
    for (const rider of ['careful', 'none']) for (let j = 0; j < PAIRS; j++) {
      if (rider === 'none') await setCams(j === 0 ? 0 : 1);
      const res = await job({ bot: rider === 'careful', seed: j }); report(`${rider === 'careful' ? 'careful' : 'hands off'} (pair ${j + 1}: ${res.order})`, res); sum[rider].push(res);
    }
    await setCams(null);
    const avg = (l, f) => l.reduce((a, x) => a + f(x), 0) / Math.max(1, l.length), tot = (l, k) => l.reduce((a, x) => a + (x.stats?.[k] || 0), 0);
    const stars = (x) => x.result?.stars || 0, cond = (x) => x.result?.cond || 0, time = (x) => x.time || 0, late = (x) => (x.result?.late ? 1 : 0), earned = (x) => x.result?.earned || 0;
    const line = (l) => `${avg(l, stars).toFixed(1)}★, food ${avg(l, cond).toFixed(0)}%, $${avg(l, earned).toFixed(1)}, ${avg(l, time).toFixed(0)} s (${(avg(l, (x) => x.result?.ratio || 0) * 100).toFixed(0)}% of the timer), late ${l.filter(late).length}/${l.length}, crashes ${tot(l, 'crashes')}, reds ${tot(l, 'reds')}, scared ${tot(l, 'pedHits')}` +
      (scheme === 'run' ? `, hops ${tot(l, 'hops')}, bumps ${tot(l, 'bumps')}, coins ${tot(l, 'coins')}, ruined ${tot(l, 'ruined')}` : `, overshoots ${tot(l, 'overshoots')}, slid wide ${tot(l, 'wide')}`);
    console.log(`  same orders — careful: ${line(sum.careful)}\n               hands off: ${line(sum.none)}`);
    if (scheme === 'run') {
      const dn = [...sum.careful, ...sum.none].flatMap((x) => x.dense || []), dAvg = (i) => dn.reduce((a, x) => a + x[i], 0) / Math.max(1, dn.length);
      console.log(`  traffic on the 160 m ahead: ${dAvg(0).toFixed(1)} cars our way, ${dAvg(1).toFixed(1)} coming (${dn.length} samples)`);
      ok(dAvg(0) >= 2.5 && dAvg(1) >= 2, `the streets are busy: ${dAvg(0).toFixed(1)} cars our way and ${dAvg(1).toFixed(1)} coming on the 160 m ahead`);
      ok(tot(sum.none, 'crashes') + tot(sum.none, 'reds') + tot(sum.none, 'pedHits') > 0, `hands off, the traffic is nobody's: the scooter crashes, runs reds or scares people (crashes ${tot(sum.none, 'crashes')}, reds ${tot(sum.none, 'reds')}, scared ${tot(sum.none, 'pedHits')})`);
      ok(tot(sum.careful, 'overtakes') > tot(sum.none, 'overtakes'), `careful: weaves past the cars (${tot(sum.careful, 'overtakes')} overtakes vs ${tot(sum.none, 'overtakes')} hands off)`);
      // (busy streets: a careful rider still gets caught out now and then — far less than nobody riding)
      ok(tot(sum.careful, 'crashes') <= PAIRS && tot(sum.careful, 'crashes') * 4 <= tot(sum.none, 'crashes'), `careful: braking and gaps keep it out of most crashes (${tot(sum.careful, 'crashes')} vs ${tot(sum.none, 'crashes')} hands off)`);
      ok(tot(sum.careful, 'hops') > 0 && tot(sum.careful, 'bumps') < tot(sum.none, 'bumps'), `careful: hops what's in the lane (${tot(sum.careful, 'hops')} hops; bumps ${tot(sum.careful, 'bumps')} vs ${tot(sum.none, 'bumps')} hands off)`);
    } else ok(tot(sum.none, 'overshoots') > 0 || tot(sum.none, 'crashes') > 0, 'hands off on the brake: the doors and corners punish it (overshoots / crashes)');
    const noCam = sum.none.slice(0, 1), cams = sum.none.slice(1);
    ok(tot(noCam, 'tickets') === 0, `hands off with no camera at the lights: no red run is fined (${tot(noCam, 'reds')} reds, ${tot(noCam, 'tickets')} fines)`);
    ok(tot(cams, 'reds') === tot(cams, 'tickets'), `…and with one at every light, every one is (${tot(cams, 'tickets')} for ${tot(cams, 'reds')})`);
    ok(tot(sum.careful, 'reds') === 0 && tot(sum.careful, 'pedHits') === 0 && tot(sum.careful, 'overshoots') === 0, 'careful: no reds run, nobody scared, no door overshot');
    // (on the run hands off rams the cars and runs the reds: about as quick, but it pays in food and fines)
    if (scheme === 'run') {
      ok(avg(sum.careful, cond) > avg(sum.none, cond) + 10, `riding keeps the food in much better shape than hands off (${avg(sum.careful, cond).toFixed(0)}% vs ${avg(sum.none, cond).toFixed(0)}%; ${avg(sum.careful, time).toFixed(0)} vs ${avg(sum.none, time).toFixed(0)} s)`);
      ok(avg(sum.careful, earned) > avg(sum.none, earned) + 15, `…and earns far more (no fines, no ruined food): $${avg(sum.careful, earned).toFixed(1)} vs $${avg(sum.none, earned).toFixed(1)}`);
    } else ok(avg(sum.careful, cond) > avg(sum.none, cond) + 10, 'braking keeps the food in better shape than hands off');
    ok(avg(sum.careful, stars) >= avg(sum.none, stars) && avg(sum.careful, earned) > avg(sum.none, earned), 'and earns at least as many stars, and more money');
    ok(sum.careful.filter(late).length <= Math.floor(PAIRS / 3), `careful riders are on time (late ${sum.careful.filter(late).length}/${PAIRS})`);
  }
  ok(!errs.length, `no errors${errs.length ? ': ' + errs.slice(0, 5).join(' | ') : ''}`);
  await page.close();
}
console.log(fails ? `\n${fails} FAILED` : '\nall ok');
await browser.close(); server.close();
process.exit(fails ? 1 : 0);

// Pickup / drop-off scenarios: single and batched jobs (same restaurant, several restaurants, two orders to one door,
// starting at the restaurant), an event card left open at the door, a hop at the door, and the same on a keyboard
// (riding freely: stopping in the far lane, or up on the sidewalk in front of the door). Every job must reach the receipt with each order picked up at its
// restaurant and delivered at its door, paid once, with nothing left behind in the scene.
//   node tools/legs.mjs [touch|desktop|both] [scenario,...]
import { createRequire } from 'node:module';
import { serve } from './serve.mjs';
const require = createRequire(import.meta.url);
let puppeteer; try { puppeteer = require('puppeteer-core'); } catch { puppeteer = require('/root/.npm/_npx/110f701c48e68d66/node_modules/puppeteer-core'); }
const MODES = (process.argv[2] || 'both') === 'both' ? ['touch', 'desktop'] : [process.argv[2]];
const ONLY = process.argv[3] ? process.argv[3].split(',') : null;
const SAVE = { v: 1, lvl: 10, cash: 5000, xp: 0, districts: { oldtown: true, downtown: true, harbor: true, hills: true }, stats: { deliveries: 60 },
  seen: { rideTip: 1, manualTip: 1, freeTip: 1 }, onboard: { step: 99 }, settings: { music: 0, sfx: 0, quality: 'low', haptics: false }, active: 'mule',
  vehicles: { rustbucket: { parts: { engine: 0, suspension: 0, box: 0, tires: 0 }, count: 1 }, mule: { parts: { engine: 3, suspension: 0, box: 0, tires: 0 }, count: 1 } } };

// scenario setup runs in the page: returns the orders for the job (and may move the player)
const SCEN = {
  single: `const o = mk(); return [o];`,
  sameRest: `const a = mk(); const b = mk({ restId: a.rest }); return [a, b];`,
  threeRests: `const a = mk(); let b, c; for (let i = 0; i < 30; i++) { b = mk(); if (b.restLot !== a.restLot) break; }
    for (let i = 0; i < 30; i++) { c = mk(); if (c.restLot !== a.restLot && c.restLot !== b.restLot) break; } return [a, b, c];`,
  sameDoor: `const a = mk(); const b = mk({ restId: a.rest }); b.cust = a.cust; b.name = a.name + ' (2)'; return [a, b];`,
  atRestaurant: `const o = mk(); game.St.S.pos = game.city.lots[o.restLot].door; game.St.S.posDir = null; return [o];`,
  eventAtDoor: `window.__evAtDoor = true; return [mk()];`,
  hopAtDoor: `window.__hopAtDoor = true; return [mk()];`,
  // riding freely: where in the door's ring the rider pulls up (m from its middle, + = toward the far lane)
  farLane: `window.__stopAt = 3.6; return [mk()];`,
  sidewalk: `window.__stopAt = -2.4; return [mk()];`,
  // a customer whose character downloads slowly / not at all (phones only preload a few people)
  slowChar: `const o = mk(); o.char = 'male-b'; return [o];`,
  charFails: `const o = mk(); o.char = 'male-f'; return [o];`,
};
const NET = { slowChar: { match: 'character-male-b', delay: 5000 }, charFails: { match: 'character-male-f', fail: true } };
const PLAN = {
  touch: ['slowChar', 'charFails', 'single', 'sameRest', 'threeRests', 'sameDoor', 'atRestaurant', 'eventAtDoor', 'hopAtDoor'],
  desktop: ['single', 'sameRest', 'sameDoor', 'atRestaurant', 'farLane', 'sidewalk'],
};

const { server, base } = await serve();
const browser = await puppeteer.launch({ executablePath: '/root/.cache/puppeteer/chrome/linux-148.0.7778.97/chrome-linux64/chrome', headless: 'new', protocolTimeout: 900000,
  args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let fails = 0;
const ok = (c, label) => { if (!c) fails++; console.log(`${c ? 'ok  ' : 'FAIL'} ${label}`); };

for (const mode of MODES) {
  const page = await browser.newPage();
  if (mode === 'touch') await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
  else await page.setViewport({ width: 1280, height: 720 });
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/404|Failed to load resource/.test(m.text())) errs.push(m.text()); });
  await page.evaluateOnNewDocument((s) => localStorage.setItem('fds_save_v1', s), JSON.stringify(SAVE));
  await page.goto(`${base}/index.html?noti=1&energy=off&clock=600`, { waitUntil: 'networkidle0', timeout: 240000 });
  await page.waitForFunction('window.ready', { timeout: 120000 });
  console.log(`--- ${mode} (riding freely: ${await page.evaluate(() => game.manual())})`);
  for (const name of PLAN[mode]) {
    if (ONLY && !ONLY.includes(name)) continue;
    const e0 = errs.length;
    // network trouble for this scenario's character download
    const net = NET[name];
    const onReq = (req) => { if (net && req.url().includes(net.match)) { if (net.fail) req.abort(); else setTimeout(() => req.continue(), net.delay); } else req.continue(); };
    if (net) { await page.setRequestInterception(true); page.on('request', onReq); }
    // set the job up and start it
    const setup = await page.evaluate(async (src) => {
      const { makeOrder } = await import('./js/orders.js');
      const mk = (opt = {}) => makeOrder(game.city, Math.random, { from: game.St.S.pos, ...opt });
      window.__evAtDoor = window.__hopAtDoor = false; window.__stopAt = null;
      const orders = new Function('mk', src)(mk);
      const S = game.St.S;
      const chars0 = []; game.scene.traverse((o) => { if (/^character-/.test(o.name) && o.parent === game.scene) chars0.push(o.name); });
      window.__T = { orders: orders.map((o) => o.id), cash0: S.cash, del0: S.stats.deliveries, scenes: [], receipt: null, chars0, notes: [] };
      game.board.push(...orders.filter((o) => !game.board.includes(o)));
      game.taken = orders.slice();
      game.startJob();
      return { n: orders.length, rests: new Set(orders.map((o) => o.restLot)).size, custs: new Set(orders.map((o) => o.cust)).size };
    }, SCEN[name]);
    for (let i = 0; i < 80; i++) { const m = await page.evaluate(() => { game.skipTween(); document.querySelectorAll('.modal.tip [data-x]').forEach((b) => b.click()); return game.mode; }); if (m === 'ride') break; await sleep(150); }
    // ride it out: short chunks so the async arrival scenes get the event loop
    let st = null, wall = Date.now();
    while (Date.now() - wall < 240000) {
      st = await page.evaluate(() => {
        const r = game.ride, R = r.R, T = window.__T;
        const door = (lot) => { const L = game.city.lots[lot]; if (L.doorPos) return L.doorPos; const t = game.city.tiles[L.door]; return [t.x * 10, t.z * 10]; };
        if (!T.p0 && R.bike) T.p0 = [R.bike.root.position.x, R.bike.root.position.z];
        if (R.phase === 'scene' && T.t0 == null) T.t0 = performance.now();
        if (R.phase === 'ride') T.t0 = null;
        const sc = document.querySelector('.modal.scene:not(.out)');
        if (sc && !sc.__seen) {
          sc.__seen = true;
          const wait = T.t0 == null ? 0 : performance.now() - T.t0;
          const leg = R.job.legs[R.leg], b = R.bike.root.position, d = door(leg.lot);
          T.scenes.push({ wait, x: b.x, z: b.z, fromStart: T.p0 ? Math.hypot(b.x - T.p0[0], b.z - T.p0[1]) : null, kind: leg.kind, lot: leg.lot, dist: Math.hypot(b.x - d[0], b.z - d[1]), y: b.y, toEnd: R.route.length - R.s, ot: !!R.ot, ev: !!document.querySelector('.evdock.in'),
            text: sc.textContent.replace(/\s+/g, ' ').slice(0, 90), picked: R.orders.filter((x) => x.picked).length, done: R.orders.filter((x) => x.done).length });
          setTimeout(() => sc.querySelector('[data-x]')?.click(), 250);
        }
        document.querySelectorAll('.modal.tip [data-x], .modal.rated').forEach((b) => b.click());
        // the event card at the door is left alone until the scene is over, then answered
        if (!window.__evAtDoor || R.phase !== 'ride') document.querySelectorAll('.evdock.in .opt').forEach((b, i) => { if (i === 0) b.click(); });
        const rc = document.querySelector('.modal.receipt:not(.out)');
        if (rc && !T.receipt) { T.receipt = { text: rc.textContent.replace(/\s+/g, ' '), lines: rc.querySelectorAll('.rl').length }; setTimeout(() => rc.querySelector('[data-x]')?.click(), 200); }
        document.querySelectorAll('.modal.pop [data-x], .modal.day [data-x], .modal.ach [data-x]').forEach((b) => b.click());
        if (R.phase === 'ride') {
          const toEnd = R.route.length - R.s;
          if (R.light && R.light.state !== 'g' && R.runLight !== R.light.tile && !R.manual) r.input('go');
          if (window.__evAtDoor && !T.evFired && toEnd < 14 && toEnd > 6) { T.evFired = true; game.testEvent('ketchup', 0.5); }
          if (window.__hopAtDoor && toEnd < 1.6 && !T.hopped) { T.hopped = true; r.input('hop'); }
          // riding freely: a careful rider on the keys (ride.bot), pulling up where the scenario says
          const stopAt = () => { if (window.__stopAt == null) return null; const L = game.city.lots[R.job.legs[R.leg].lot], f = [[0, -1], [1, 0], [0, 1], [-1, 0]][L.front]; return { x: R.ring.x + f[0] * window.__stopAt, z: R.ring.z + f[1] * window.__stopAt }; };
          for (let i = 0; i < 20 && R.phase === 'ride'; i++) { if (R.manual) r.bot({ stop: stopAt() }); game.sim(0.05); }
        } else if (R.active) {
          // a person who moves must be walking: how far each one slides with no walk cycle playing
          for (let i = 0; i < 4; i++) {
            const n = r.npc, p0 = n && n.c.obj.position.clone();
            // the cook's bag changes hands at the bike: how far from it they were when it left their hands
            if (n && n.bag && !n.bag.visible && n.handAt == null) {
              n.handAt = Math.hypot(n.c.obj.position.x - R.bike.root.position.x, n.c.obj.position.z - R.bike.root.position.z);
              T.handAt = Math.max(T.handAt || 0, n.handAt);
            }
            game.sim(0.025);
            if (!n || n !== r.npc) continue;
            const mv = Math.hypot(n.c.obj.position.x - p0.x, n.c.obj.position.z - p0.z);
            const w = (a) => (a && a.isRunning() ? a.getEffectiveWeight() : 0), walkW = w(n.c.actions.walk) + w(n.c.actions['walk-hold']);
            if (mv > 0.001 && walkW < 0.5) { n.slid = (n.slid || 0) + mv; T.slide = Math.max(T.slide || 0, n.slid);
              T.slideAnim = Object.entries(n.c.actions).filter(([, a]) => w(a) > 0.5).map(([k]) => k).join('+') || 'bind pose'; }
          }
        }
        return { mode: game.mode, active: R.active, phase: R.phase, leg: R.leg, receipt: !!T.receipt };
      });
      if (st.receipt && st.mode === 'hub') break;
      await sleep(st.phase === 'ride' ? 5 : 120);
    }
    if (!(st && st.receipt)) console.log('  stuck:', await page.evaluate(() => { const R = game.ride.R, L = R.light;
      const hz = R.hazards.filter((h) => !h.done && h.s - R.s > -3 && h.s - R.s < 25).map((h) => `${h.type}@${(h.s - R.s).toFixed(1)}${h.lane < 0 ? 'L' : ''}`).join(' ');
      return JSON.stringify({ phase: R.phase, leg: R.leg, s: +R.s.toFixed(1), len: +R.route.length.toFixed(1), v: +R.v.toFixed(2), crash: +R.crash.toFixed(1), wait: +R.wait.toFixed(1), hop: !!R.hop,
        ev: !!R.eventCam, ot: R.ot && { t: +R.ot.t.toFixed(2), dir: R.ot.dir, hz: !!R.ot.hz }, light: L && L.state + L.d.toFixed(1), blocked: R.blockedBy, hz,
        free: R.manual && { x: +game.ride.F.x.toFixed(1), z: +game.ride.F.z.toFixed(1), fv: +game.ride.F.fv.toFixed(2), ring: Math.hypot(R.ring.x - game.ride.F.x, R.ring.z - game.ride.F.z).toFixed(1) },
        gas: R.ctl.gas, brake: R.ctl.brake, left: R.ctl.left, right: R.ctl.right, modals: [...document.querySelectorAll('.modal, .evdock')].map((m) => m.className).join('|') }); }));
    await page.evaluate(() => { for (const k of ['gas', 'brake', 'left', 'right']) game.ride.input(k, false); });
    if (net) { page.off('request', onReq); await page.setRequestInterception(false); }
    const res = await page.evaluate(() => {
      const T = window.__T, S = game.St.S;
      const npcs = []; game.scene.traverse((o) => { if (/^character-/.test(o.name) && o.parent === game.scene) npcs.push(o.name); });
      return { ...T, cash1: S.cash, del1: S.stats.deliveries, mode: game.mode, modals: [...document.querySelectorAll('.modal')].map((m) => m.className).join('|'),
        npcs, orders: game.ride.R.orders.map((x) => ({ picked: x.picked, done: x.done, res: !!x.result })) };
    });
    const legs = res.scenes;
    console.log(`\n[${mode}] ${name}: ${setup.n} order(s), ${setup.rests} restaurant(s), ${setup.custs} door(s) — scenes: ${legs.map((s) => `${s.kind}@${s.dist.toFixed(1)}m ${(s.wait / 1000).toFixed(1)}s${s.ot ? ' otherlane' : ''}${s.ev ? ' +event' : ''}${s.y > 0.3 ? ' airborne' : ''}`).join(', ')}`);
    ok(res.receipt, 'reached the receipt');
    ok(res.mode === 'hub', `back in the hub (mode ${res.mode})`);
    ok(legs.filter((s) => s.kind === 'pickup').length === setup.rests, `one pickup scene per restaurant (${legs.filter((s) => s.kind === 'pickup').length}/${setup.rests})`);
    ok(legs.filter((s) => s.kind === 'drop').length === setup.n, `one drop scene per order (${legs.filter((s) => s.kind === 'drop').length}/${setup.n})`);
    // the door can sit up to ~11 m from the middle of its road tile, plus the lane we stop in
    const far = legs.filter((s) => s.dist > 14);
    ok(!far.length, `every scene happens at its door${far.length ? ' — far: ' + far.map((s) => `${s.kind} ${s.dist.toFixed(1)} m`).join(', ') : ''}`);
    ok(res.orders.every((x) => x.picked && x.done && x.res), 'every order picked up, delivered and scored');
    ok(!legs.some((s) => s.ev), 'no scene opens over an event card');
    ok(!legs.some((s) => s.ot), 'every scene happens in our own lane');
    if (name === 'sameDoor') { const d = legs.filter((s) => s.kind === 'drop'); ok(d.length === 2 && Math.hypot(d[0].x - d[1].x, d[0].z - d[1].z) < 1, `both deliveries to one door happen on the spot (${d.length === 2 ? Math.hypot(d[0].x - d[1].x, d[0].z - d[1].z).toFixed(1) : '?'} m apart)`); }
    if (name === 'atRestaurant') { const p = legs.find((s) => s.kind === 'pickup'); ok(p && p.fromStart < 2, `starting at the restaurant, the pickup happens where the bike stands (${p?.fromStart?.toFixed(1)} m)`); }
    ok(!legs.some((s) => s.y > 0.3), 'the bike is on the ground for every scene');
    const slow = legs.filter((s) => s.wait > 2600);
    ok(!slow.length, `the card shows within ~2 s of stopping${slow.length ? ' — waited ' + slow.map((s) => (s.wait / 1000).toFixed(1) + ' s').join(', ') : ''}`);
    ok(res.del1 - res.del0 === setup.n, `deliveries +${res.del1 - res.del0} (want +${setup.n})`);
    ok(res.receipt && res.receipt.lines >= setup.n, `receipt lists every order (${res.receipt?.lines} lines)`);
    ok(!(res.slide > 0.6), `nobody slides along without walking${res.slide > 0.6 ? ` — slid ${res.slide.toFixed(1)} m playing ${res.slideAnim}` : ''}`);
    ok(!(res.handAt > 2.4), `the bag is handed over at the bike${res.handAt != null ? ` (${res.handAt.toFixed(1)} m away)` : ' (no bag seen)'}`);
    ok(res.npcs.length <= res.chars0.length, `no NPC left in the scene (${res.chars0.length} people before, ${res.npcs.length} after)`);
    ok(!res.modals, `no modal left open${res.modals ? ': ' + res.modals : ''}`);
    ok(errs.length === e0, `no errors${errs.length > e0 ? ': ' + errs.slice(e0).join(' | ') : ''}`);
  }
  await page.close();
}
console.log(`\n${fails ? fails + ' FAILED' : 'all passed'}`);
await browser.close(); server.close();
process.exit(fails ? 1 : 0);

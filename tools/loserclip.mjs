// Trend edit for Tame Impala's "Loser", doomer → hopecore. This stage records the shots: real game footage, frame-exact
// in virtual time like fleetclip.mjs, each shot into its own folder and a little longer than the edit needs (the cut to
// the song's beat grid comes after). Doomer: day one, 23:47, rain, the Rust Bucket — a lonely ride, the engine stalling,
// a red run past the junction's camera, a late hand-over. Hopecore: weeks later in the sun on the Vespetta — waiting for
// a grandma to cross, a perfect stop, extra ketchup, a fan's selfie, five stars at golden hour, then the fleet, your old
// Rust Bucket ridden by your first courier. Everything on screen is the game playing itself; no audio is recorded (the
// song is added in the app, see DOCS.md).
//   node tools/loserclip.mjs [out-dir]
//   env: SHOTS=d-night,h-granny (keep only these; their reels still play through) · STILLS=1 (every 20th frame, for a look)
//        SCALE=2 (720×1280; 3 = 1080×1920) · CHROME=<browser binary> · PUPPETEER=<puppeteer-core dir>
// The default out-dir is outside the web root: this folder is served as is.
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
const HERE = dirname(fileURLToPath(import.meta.url)), GAME = resolve(HERE, '..');
const [OUT = '/var/www/vhosts/mithatck.com/fds-trailer'] = process.argv.slice(2);
const SCALE = +(process.env.SCALE || 2), FPS = 30, STILLS = process.env.STILLS === '1';
const ONLY = process.env.SHOTS ? new Set(process.env.SHOTS.split(',')) : null;
const { serve } = await import(resolve(GAME, 'tools/serve.mjs'));

// ---- browser (as fleetclip.mjs) ----
const require = createRequire(HERE + '/x.js');
const npx = (home) => { try { return readdirSync(home + '/.npm/_npx').map((d) => `${home}/.npm/_npx/${d}/node_modules/puppeteer-core`); } catch { return []; } };
let puppeteer;
for (const p of [process.env.PUPPETEER, 'puppeteer-core', ...npx('/root'), ...npx(homedir())].filter(Boolean)) {
  try { puppeteer = require(p); break; } catch { /* next candidate */ }
}
if (!puppeteer) throw new Error('puppeteer-core not found; set PUPPETEER=<path to puppeteer-core>');
const builds = (dir, sub) => { try { return readdirSync(dir).sort().reverse().map((v) => join(dir, v, sub)); } catch { return []; } };
const CHROME = [process.env.CHROME, '/root/.cache/puppeteer/chrome/linux-148.0.7778.97/chrome-linux64/chrome',
  ...builds(homedir() + '/.cache/puppeteer/chrome', 'chrome-linux64/chrome'),
  ...builds(homedir() + '/.cache/puppeteer/chrome-headless-shell', 'chrome-headless-shell-linux64/chrome-headless-shell'),
  ...builds(homedir() + '/.cache/hyperframes/chrome/chrome-headless-shell', 'chrome-headless-shell-linux64/chrome-headless-shell')].find((p) => p && existsSync(p));
if (!CHROME) throw new Error('no Chrome found; set CHROME=<browser binary>');
const SHIM = readFileSync(HERE + '/vtime-shim.js', 'utf8');
const D0 = 1792000000000;

// ---- saves ----
const veh = (count, lv = 3) => ({ parts: { engine: lv, suspension: lv, box: lv, tires: lv }, paint: null, box: null, count });
const SEEN = { rideTip: 1, rideTip2: 1, manualTip: 1, freeTip: 1, c_stop_light: 1, c_stop_ped: 1, c_stop_door: 1, c_boost: 1, c_hop: 1, c_overtake: 1, c_shortcut: 1 };
const QUIET = { seen: SEEN, onboard: { step: 99 }, look: { char: 'male-a', helmet: '#e8432f' },
  settings: { music: 0, sfx: 0, quality: 'high', haptics: false, autodrive: true } };
// day one on the Rust Bucket, past the two deliveries where a red only gets a warning
const DAY1 = { v: 1, created: D0, cash: 25, xp: 0, lvl: 1, day: 1, clock: 1427, districts: { oldtown: true }, active: 'rustbucket', pos: null,
  vehicles: { rustbucket: veh(1, 0) }, stats: { deliveries: 2 }, ...QUIET };
// weeks later: the Vespetta with its suspension and box done up, Downtown open, level 6 (a fan can spot you from level 4)
const LATER = { v: 1, created: D0 - 12 * 864e5, cash: 2400, xp: 0, lvl: 6, ratings: Array(20).fill(5), day: 9, clock: 530,
  districts: { oldtown: true, downtown: true }, active: 'vespetta', pos: null,
  vehicles: { rustbucket: veh(1, 0), vespetta: veh(1, 4) }, skills: { riding: 2, navigation: 2, charm: 4, reflexes: 2, stamina: 2 },
  stats: { deliveries: 60 }, ...QUIET };
// the fleet: every district, an office at its top level (ten slots), as fleetclip.mjs
const BOSS = { v: 1, created: D0 - 30 * 864e5, cash: 52400, xp: 0, lvl: 16, ratings: Array(30).fill(5), day: 14, clock: 1050,
  districts: { oldtown: true, downtown: true, harbor: true, hills: true }, active: 'viper', pos: null,
  vehicles: { rustbucket: veh(2), zippy: veh(2), vespetta: veh(2), volt: veh(2), mule: veh(1), viper: veh(3) },
  skills: { riding: 4, navigation: 4, charm: 4, reflexes: 3, stamina: 3 },
  fleet: { office: true, level: 4, couriers: [], last: D0, bank: 0, applicants: [], events: [] }, stats: { deliveries: 420 }, ...QUIET };

const { server, base } = await serve();
const browser = await puppeteer.launch({ executablePath: CHROME, headless: CHROME.includes('headless-shell') ? 'shell' : true, protocolTimeout: 900000,
  args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-background-timer-throttling', '--disable-renderer-backgrounding'] });

// a fresh page on a save, the same orders, traffic and hazards on every run; `__tr` holds the helpers the reels share
async function open(save, { rain = 0 } = {}) {
  const page = await browser.newPage();
  await page.setViewport({ width: 360, height: 640, deviceScaleFactor: SCALE, isMobile: true, hasTouch: true });
  page.on('pageerror', (e) => console.log('pageerror', e.message));
  page.on('console', (m) => { if (m.type() === 'error' || m.text().startsWith('clip')) console.log(m.text().slice(0, 240)); });
  await page.evaluateOnNewDocument((D0) => {
    let a = 0x51a7e3; Math.random = () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    Date.now = () => D0;
  }, D0);
  await page.evaluateOnNewDocument(SHIM);
  await page.evaluateOnNewDocument((s) => { localStorage.setItem('fds_save_v1', s); localStorage.setItem('fds_an', 'off'); }, JSON.stringify(save));
  await page.goto(`${base}/index.html?noti=1&energy=off&clock=${save.clock}`, { waitUntil: 'networkidle0', timeout: 300000 });
  await page.waitForFunction('window.ready', { timeout: 300000, polling: 300 });
  await page.evaluate(async (rain, FPS) => {
    await document.fonts.ready;
    const { W } = await import('./js/weather.js');
    W.windows = []; W.forcedUntil = rain ? 1e9 : -1; W.rain = W.target = rain;
    document.head.insertAdjacentHTML('beforeend', `<style>#boot { display: none !important; }
      body.cine #ridehud, body.cine #toasts, body.cine #markers { display: none !important; }</style>`);
    const sleep = (ms) => new Promise((r) => __V.realST(r, ms));
    const clear = () => document.querySelectorAll('.modal.tip [data-x], .modal.scene [data-x], .modal.pop [data-x], .modal.rated, .evdock .opt').forEach((b) => b.click());
    window.__tr = {
      FPS, sleep, clear, marks: [], clock: null,
      ease: (x) => { x = Math.max(0, Math.min(1, x)); return x * x * (3 - 2 * x); },
      lerp: (a, b, k) => a + (b - a) * k,
      mark: (k) => window.__tr.marks.push(k),
      // an order from a restaurant (or district), ridden from wherever the bike is, at least `minM` long (room for the
      // reel's shots)
      async job({ rest, district, type = 'standard', seed = 7, minM = 0 }) {
        const { makeOrder } = await import('./js/orders.js'), { mulberry32 } = await import('./js/rng.js'), { RESTAURANTS } = await import('./js/data.js');
        const restId = rest || RESTAURANTS.find((r) => r.district === district && game.city.restaurants.some((x) => x.id === r.id))?.id;
        let o;
        for (let k = 0; k < 60; k++) { o = makeOrder(game.city, mulberry32(seed + k), { from: game.St.S.pos, restId, type }); if (o.pickM + o.dropM >= minM) break; }
        game.board.push(o); game.taken = [o]; game.startJob();
        for (let i = 0; i < 300 && game.mode !== 'ride'; i++) { game.skipTween(); clear(); __V.step(1000 / 30); await sleep(20); }
        game.ride.R.event = null;
        console.log('clip job', `${o.rest} → ${o.name}`, o.type, `${Math.round(o.pickM + o.dropM)} m`, `eta ${o.eta.toFixed(0)} s`);
        return o;
      },
      // ride on at sim speed, no events, like a careful rider (STOP in the perfect second), until `until()` holds
      async skip(until, { careful = true, max = 1200 } = {}) {
        const R = game.ride.R;
        for (let i = 0; i < max && !until(R); i++) {
          if (R.event && !R.event.fired) R.event = null;
          if (careful) game.ride.autoBot({ hop: true });
          if (window.__tr.clock != null) game.St.S.clock = window.__tr.clock;
          game.sim(0.1); __V.step(1000 / 60); clear();
          if (i % 20 === 0) await sleep(10);
        }
        if (!until(R)) console.error('clip skip ran out', `leg ${R.leg} ${R.phase} s ${R.s.toFixed(0)}/${R.route?.length.toFixed(0)}`);
      },
      // the next light on the route (45–90 m on) turns red for us before we get there. It would on some cycle anyway;
      // this picks the cycle, so the shot doesn't wait on luck. Lights cycle 17 s: north-south green 0–7, yellow to
      // 8.5, red to 17; east-west red 0–8.5. Aimed 3 s into the red, so arriving a little early or late still finds it
      // red. Once per light.
      forced: new Set(),
      redAhead() {
        const R = game.ride.R, L = R.light, light = L && game.traffic.lightAt.get(L.tile), T = window.__tr;
        if (!light || L.d < 45 || L.d > 90 || T.forced.has(L.tile)) return false;
        const v = Math.max(R.v, 0.8 * (R.vs?.top || 8)), ta = game.traffic.time + L.d / v, want = L.din === 0 || L.din === 2 ? 11.5 : 3;
        light.phase = (((want - ta) % 17) + 17) % 17;
        T.forced.add(L.tile);
        return true;
      },
      // lane hazards off (coins stay, unless `coins` is false): nothing to hop in a shot that's about something else
      tidy(coins = true) {
        game.ride.R.hazards.forEach((h) => { if (h.lane >= 0 && h.type !== 'ped' && !(coins && ['cash', 'energy'].includes(h.type))) { h.done = true; if (h.obj) h.obj.visible = false; } });
      },
      // a camera of our own around the bike: back / side / up from it, looking `ahead` down its heading (smoothed so
      // corners don't whip it round); `null` hands the camera back to the ride's chase cam
      yaw: null,
      cine(c, dt) {
        const R = game.ride.R, cam = game.camera;
        if (!c) { R.takeCamera = true; window.__tr.yaw = null; document.body.classList.remove('cine'); return; }
        R.takeCamera = false; document.body.classList.add('cine');
        const b = R.bike.root.position, hd = R.bike.root.rotation.y, T = window.__tr;
        if (T.yaw == null) T.yaw = hd;
        let dy = hd - T.yaw; while (dy > Math.PI) dy -= 2 * Math.PI; while (dy < -Math.PI) dy += 2 * Math.PI;
        T.yaw += dy * Math.min(1, dt * 2.6);
        const fx = Math.sin(T.yaw), fz = Math.cos(T.yaw), sx = fz, sz = -fx;
        cam.position.set(b.x - fx * c.back + sx * c.side, c.up, b.z - fz * c.back + sz * c.side);
        cam.lookAt(b.x + fx * c.ahead + sx * (c.lookSide || 0), c.lookY ?? 1, b.z + fz * c.ahead + sz * (c.lookSide || 0));
        if (c.roll) cam.rotateZ(c.roll);
        cam.fov = c.fov || 50; cam.updateProjectionMatrix();
      },
      // the player's finger on a ride button or an event option
      press(el) {
        if (!el) return false;
        el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true }));
        el.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true }));
        el.click?.();
        return true;
      },
    };
    // frames that aren't kept aren't drawn (the simulation still runs)
    const r = game.renderer, r0 = r.render.bind(r); r.render = (a, b) => { if (window.__draw) r0(a, b); };
    // virtual time from here on: the game moves only when the script steps it, so every run is the same run
    await game.ride.ensureBike();
    __V.enable();
  }, rain, FPS);
  return page;
}

// ---- capture: one shot = the frames from its script's start until it says 'end' ----
mkdirSync(OUT + '/shots', { recursive: true });
const t0 = Date.now(), done = [];
async function shot(page, name, script, arg) {
  const keep = !ONLY || ONLY.has(name), dir = `${OUT}/shots/${name}`;
  if (keep) { rmSync(dir, { recursive: true, force: true }); mkdirSync(dir, { recursive: true }); }
  await page.evaluate(() => document.getElementById('toasts')?.replaceChildren());
  await page.evaluate(script, arg);
  await page.evaluate(() => new Promise((r) => __V.realRAF(() => __V.realRAF(() => r()))));
  const marks = [];
  let f = 0;
  for (; f < 30 * 40; f++) {
    const draw = keep && (!STILLS || f % 20 === 0);
    const go = await page.evaluate(async (f, draw) => {
      window.__draw = draw; let r;
      try { r = await window.__onFrame(f); } catch (e) { console.error('clip onFrame', e.message); r = 'end'; }
      if (r !== 'end') __V.step((1000 / 30) * (window.__speed || 1));
      return r;
    }, f, draw);
    if (go === 'end') break;
    for (const k of await page.evaluate(() => window.__tr.marks.splice(0))) marks.push({ f, k });
    if (draw) {
      await page.evaluate(() => new Promise((r) => __V.realRAF(() => r())));
      await page.screenshot({ path: `${dir}/${String(f).padStart(4, '0')}.jpg`, type: 'jpeg', quality: 92 });
    }
    if (f % 60 === 0) console.log('clip', name, 'frame', f, `${((Date.now() - t0) / 1000).toFixed(0)} s`);
  }
  if (keep) writeFileSync(`${dir}.json`, JSON.stringify({ name, frames: f, fps: FPS, speed: await page.evaluate(() => window.__speed || 1), marks }, null, 1));
  console.log('clip shot', name, `${f} frames`, marks.map((m) => `${m.k}@${m.f}`).join(' '));
  done.push(name);
}

// ================================================= doomer: day one, 23:47, rain =================================================
{
  const p = await open(DAY1, { rain: 1 });
  await p.evaluate(async () => {
    const T = window.__tr; T.clock = 1427;
    await T.job({ rest: 'mamma', type: 'rush', seed: 11 });
    await T.skip((R) => R.phase === 'ride' && R.s > 25);
    T.tidy(false);
  });

  // a lonely ride, slowed down: behind the bike and a little to its side, creeping closer
  await shot(p, 'd-night', () => {
    const T = window.__tr, R = game.ride.R; window.__speed = 0.6;
    window.__onFrame = (f) => {
      const t = f / T.FPS; if (t >= 6.5) { T.cine(null); return 'end'; }
      game.St.S.clock = T.clock;
      const k = T.ease(t / 6.5);
      T.cine({ back: T.lerp(7.5, 5.2, k), side: T.lerp(0.9, 0.6, k), up: T.lerp(2.3, 1.75, k), ahead: 10, lookY: 1.3, fov: 52, roll: -0.025 }, (1 / 30) * 0.6);
    };
  });

  // a red ahead and STOP up, untouched: through the junction, the camera flashes, the fine
  await p.evaluate(async () => {
    const T = window.__tr;
    // a light 45–90 m on (riding on through the pickup if need be), red when we get there
    await T.skip((R) => R.phase === 'ride' && R.light && R.light.d > 45 && R.light.d < 90 && !R.stopUi);
    T.redAhead(); T.tidy(false);
  });
  await shot(p, 'd-red', () => {
    const T = window.__tr, R = game.ride.R; window.__speed = 1;
    const st = { flash: -1, t0: R.stats.tickets };
    window.__onFrame = (f) => {
      const t = f / T.FPS; game.St.S.clock = T.clock;
      if (R.event && !R.event.fired) R.event = null;
      if (st.flash < 0 && !R.stopUi) T.redAhead(); // that one didn't hold (a car waiting at it, or we were early): the next
      if (st.flash < 0 && R.stats.tickets > st.t0) { st.flash = t; T.mark('flash'); }
      if (st.flash >= 0 && t > st.flash + 2) return 'end';
      if (t > 30) { console.error('clip d-red: no red run', R.stopUi?.kind, R.stopUi?.timing); return 'end'; }
    };
  });

  // the engine dies (the real event): the needle swings, the kick lands on the green
  await shot(p, 'd-stall', () => {
    const T = window.__tr, R = game.ride.R; window.__speed = 1;
    const st = { at: -1, kick: -1, gone: -1 };
    game.testEvent('stall', Math.max(1.5, R.v * 0.3));
    window.__onFrame = (f) => {
      const t = f / T.FPS; game.St.S.clock = T.clock;
      if (t > 14) { console.error('clip d-stall stuck'); return 'end'; }
      if (R.stopUi?.kind === 'light') game.ride.autoBot({ hop: true });
      const card = document.querySelector('#ridehud .evdock'), needle = card?.querySelector('.needle');
      if (needle && st.at < 0) { st.at = t; T.mark('stall'); }
      const x = parseFloat(needle?.style.left) / 100;
      if (needle && st.kick < 0 && t > st.at + 1 && x > 0.65 && x < 0.77) { T.press(card.querySelector('button')); st.kick = t; T.mark('kick'); }
      if (st.kick >= 0 && !card && st.gone < 0) st.gone = t;
      if (st.gone >= 0 && t > st.gone + 1.2) return 'end';
    };
  });

  // the door, late: STOP tapped early (no perfect stop), the hand-over, the rating
  await p.evaluate(async () => {
    const T = window.__tr;
    await T.skip((R) => R.leg === 1 && R.phase === 'ride' && R.route.length - R.s < 55);
    T.tidy(false);
  });
  await shot(p, 'd-door', () => {
    const T = window.__tr, R = game.ride.R; window.__speed = 1;
    const st = { tapped: false, scene: -1, handed: -1, rated: -1 };
    window.__onFrame = (f) => {
      const t = f / T.FPS; game.St.S.clock = T.clock;
      if (t > 25) { console.error('clip d-door stuck', R.phase); return 'end'; }
      if (R.event && !R.event.fired) R.event = null;
      if (!st.tapped && R.stopUi?.kind === 'door') { game.rideInput('stop', true); st.tapped = true; }
      if (R.stopUi?.kind === 'light' && R.stopUi.timing !== 'early') game.rideInput('stop', true);
      const b = document.querySelector('.modal.scene [data-x]'), npc = game.ride.npc;
      if (b && st.scene < 0) { st.scene = t; T.mark('door'); }
      if (b && st.handed < 0 && t > st.scene + 0.6 && ((npc && !npc.walking) || t > st.scene + 1.8)) { b.click(); st.handed = t; }
      if (st.rated < 0 && document.querySelector('.modal.rated')) {
        st.rated = t; T.mark('rated');
        const r = R.orders[0].result; console.log('clip d-door', `${r.stars}★ $${(r.pay + r.bonus).toFixed(0)} + $${r.tip.toFixed(0)} tip`, r.late ? 'late' : 'on time', `food ${r.cond.toFixed(0)}%`, `fines $${R.fines}`);
      }
      if (st.rated >= 0 && t > st.rated + 2.2) return 'end';
    };
  });
  await p.close();
}

// shared by the hopecore reels: an event card, read for a moment, its first option tapped
const EVENT_SHOT = ({ id, read = 1.1, hold = 1.6, lead = 2.5 }) => {
  const T = window.__tr, R = game.ride.R; window.__speed = 1;
  const st = { card: -1, tap: -1, gone: -1 };
  game.testEvent(id, Math.max(lead, R.v * 0.35));
  window.__onFrame = (f) => {
    const t = f / T.FPS; if (T.clock != null) game.St.S.clock = T.clock;
    if (t > 16) { console.error('clip event stuck', id); return 'end'; }
    game.ride.autoBot({ hop: true });
    const card = document.querySelector('#ridehud .evdock:not(.out)'), opt = card?.querySelector('.opt');
    if (opt && st.card < 0) { st.card = t; T.mark('card'); }
    if (opt && st.tap < 0 && t > st.card + read) { T.press(opt); st.tap = t; T.mark('tap'); }
    if (st.tap >= 0 && !card && st.gone < 0) st.gone = t;
    if (st.gone >= 0 && t > st.gone + hold) return 'end';
  };
};

// ================================================= hopecore, morning: Old Town in the sun =================================================
{
  const p = await open({ ...LATER, clock: 530 });
  await p.evaluate(async () => {
    const T = window.__tr; T.clock = 530;
    await T.job({ rest: 'bean', seed: 23, minM: 600 });
    await T.skip((R) => R.phase === 'ride' && R.s > 20 && R.route.length - R.s > 80);
    T.tidy();
  });
  // a grandma crossing: wait & wave, she waves back
  await shot(p, 'h-granny', EVENT_SHOT, { id: 'granny', read: 1.3, hold: 1.8 });
  // a red and STOP tapped in its green second: PERFECT STOP
  await p.evaluate(async () => {
    const T = window.__tr;
    await T.skip((R) => R.phase === 'ride' && R.light && R.light.d > 45 && R.light.d < 90 && !R.stopUi);
    T.redAhead(); T.tidy();
  });
  await shot(p, 'h-perfect', () => {
    const T = window.__tr, R = game.ride.R; window.__speed = 1;
    const st = { tap: -1, halt: -1, s0: R.stats.stops };
    window.__onFrame = (f) => {
      const t = f / T.FPS; game.St.S.clock = T.clock;
      if (t > 30) { console.error('clip h-perfect stuck'); return 'end'; }
      if (R.event && !R.event.fired) R.event = null;
      if (st.tap < 0 && !R.stopUi) T.redAhead();
      if (st.tap < 0 && R.stopUi?.kind === 'light' && R.stopUi.timing === 'now') { T.press(document.querySelector('.r-btn.stop')); st.tap = t; T.mark('tap'); }
      if (st.halt < 0 && R.stats.stops > st.s0) { st.halt = t; T.mark('perfect'); }
      if (st.halt >= 0 && t > st.halt + 1.6) return 'end';
    };
  });
  // the customer asks for extra ketchup: sure!
  await p.evaluate(async () => {
    const T = window.__tr;
    await T.skip((R) => R.leg === 1 && R.phase === 'ride' && R.s > 20);
    T.tidy();
  });
  await shot(p, 'h-ketchup', EVENT_SHOT, { id: 'ketchup', read: 1.2, hold: 1.4 });
  await p.close();
}

// ================================================= hopecore, golden hour: Downtown =================================================
{
  const p = await open({ ...LATER, clock: 1115 });
  await p.evaluate(async () => {
    const T = window.__tr; T.clock = 1115;
    await T.job({ district: 'downtown', seed: 31, minM: 650 });
    await T.skip((R) => R.phase === 'ride' && R.s > 20 && R.route.length - R.s > 120);
    T.tidy();
  });
  // the new scooter in the low sun: in front of it, a little to the side, looking back at it, easing away and up
  await shot(p, 'h-ride', () => {
    const T = window.__tr; window.__speed = 0.8;
    window.__onFrame = (f) => {
      const t = f / T.FPS; if (t >= 6) { T.cine(null); return 'end'; }
      game.St.S.clock = T.clock; game.ride.autoBot({ hop: true });
      const k = T.ease(t / 6);
      T.cine({ back: T.lerp(-3.6, -6.2, k), side: T.lerp(1.5, 1.0, k), up: T.lerp(0.95, 1.7, k), ahead: T.lerp(-0.6, -1.4, k), lookY: 1.05, fov: 48 }, (1 / 30) * 0.8);
    };
  });
  // a fan wants a selfie
  await shot(p, 'h-fan', EVENT_SHOT, { id: 'fan', read: 1.2, hold: 1.6 });
  // five stars at the door: STOP in the perfect second, the hand-over, the rating
  await p.evaluate(async () => {
    const T = window.__tr;
    await T.skip((R) => R.leg === 1 && R.phase === 'ride' && R.route.length - R.s < 60);
    T.tidy();
  });
  await shot(p, 'h-door', () => {
    const T = window.__tr, R = game.ride.R; window.__speed = 1;
    const st = { scene: -1, handed: -1, rated: -1 };
    window.__onFrame = (f) => {
      const t = f / T.FPS; game.St.S.clock = T.clock;
      if (t > 25) { console.error('clip h-door stuck', R.phase); return 'end'; }
      if (R.event && !R.event.fired) R.event = null;
      if (R.phase === 'ride') game.ride.autoBot({ hop: true });
      const b = document.querySelector('.modal.scene [data-x]'), npc = game.ride.npc;
      if (b && st.scene < 0) { st.scene = t; T.mark('door'); }
      if (b && st.handed < 0 && t > st.scene + 0.6 && ((npc && !npc.walking) || t > st.scene + 1.8)) { b.click(); st.handed = t; }
      if (st.rated < 0 && document.querySelector('.modal.rated')) {
        st.rated = t; T.mark('rated');
        const r = R.orders[0].result; console.log('clip h-door', `${r.stars}★ $${(r.pay + r.bonus).toFixed(0)} + $${r.tip.toFixed(0)} tip`, r.late ? 'late' : 'on time', `food ${r.cond.toFixed(0)}%`);
      }
      if (st.rated >= 0 && t > st.rated + 2.2) return 'end';
    };
  });
  await p.close();
}

// ================================================= hopecore: the fleet at golden hour =================================================
// as fleetclip.mjs part two, without its overlay: ride along with your first courier (on your old Rust Bucket), pull
// back over the city as the hires fill it, the sun going down
const HIRES = [
  [0.0, 'Mert', 'male-b', 'rustbucket', 'oldtown', 0], [3.2, 'Emma', 'female-a', 'zippy', 'oldtown', 1],
  [4.6, 'Kaan', 'male-d', 'zippy', 'oldtown', 1], [5.9, 'Zeynep', 'female-c', 'vespetta', 'downtown', 2],
  [7.0, 'Leo', 'male-e', 'vespetta', 'downtown', 2], [8.0, 'Ayla', 'female-e', 'volt', 'harbor', 3],
  [8.9, 'Omar', 'male-c', 'volt', 'harbor', 3], [9.7, 'Mia', 'female-b', 'mule', 'harbor', 3],
  [10.4, 'Can', 'male-f', 'viper', 'hills', 4], [11.0, 'Sofia', 'female-d', 'viper', 'hills', 5],
];
{
  const p = await open(BOSS);
  await shot(p, 'h-fleet', async (HIRES) => {
    const T = window.__tr, { lerp, ease, sleep } = T, St = game.St; window.__speed = 1;
    document.head.insertAdjacentHTML('beforeend', `<style>#hubui, #ridehud, #sheet, #startbar, #toasts { display: none !important; }
      #markers .marker:not(.fleet) { display: none !important; }</style>`);
    document.querySelectorAll('.modal').forEach((m) => m.remove());
    const riders = () => game.traffic.agents.filter((a) => a.kind === 'rider');
    const st = { hired: 0, r0: null, t0: 0 };
    async function hire(i) {
      const [, name, char, veh, district, skill] = HIRES[i];
      St.S.fleet.couriers.push({ id: 'tr' + i, name, char, skill, veh, own: false, district, hired: Date.now() });
      St.emit('fleet');
      for (let w = 0; w < 400 && riders().length <= i; w++) await sleep(25); // the rider's bike model loads in real time
      if (i === 0) st.r0 = riders()[0];
      T.mark('hire' + i);
    }
    // ride along with the first courier low and close, then up and back over the whole city, turning slowly
    function camera(t) {
      const p = st.r0?.pos || [9 * 8, 31 * 8];
      const P = { x: p[0], z: p[1], d: 70 }, B = { x: 92, z: 196, d: 300 }, C = { x: 176, z: 168, d: 1050 };
      const k1 = ease((t - 2.6) / 3.6), k2 = ease((t - 6) / 6.8);
      const x = lerp(lerp(P.x, B.x, k1), C.x, k2), z = lerp(lerp(P.z, B.z, k1), C.z, k2);
      const d = Math.exp(lerp(lerp(Math.log(P.d), Math.log(B.d), k1), Math.log(C.d), k2));
      const yaw = Math.PI / 4 + 0.5 * ease(t / 14);
      game.hubCam.snap(x, z, d); game.hubCam.st.yaw = yaw;
    }
    await hire(st.hired++); T.marks.length = 0;
    for (let i = 0; i < 60; i++) game.sim(0.05); // Mert rides off first
    window.__onFrame = async (f) => {
      const t = f / T.FPS;
      if (t >= 14) return 'end';
      while (st.hired < HIRES.length && HIRES[st.hired][0] <= t + 1e-6) await hire(st.hired++);
      camera(t);
      St.S.clock = lerp(17.75 * 60, 19.4 * 60, ease(t / 14)); // golden hour into sunset
      document.querySelectorAll('.modal').forEach((m) => m.remove());
    };
  }, HIRES);
  // the end card over the city at sunset: the game's logo and where to play it
  await shot(p, 'end', () => {
    const T = window.__tr; window.__speed = 1;
    document.body.insertAdjacentHTML('beforeend', `<div id="trend" style="position: fixed; inset: 0; z-index: 50; display: flex; flex-direction: column;
      align-items: center; justify-content: center; gap: 18px; opacity: 0; text-align: center;
      background: radial-gradient(120% 90% at 50% 30%, rgba(255, 214, 150, .86), rgba(243, 154, 91, .8) 50%, rgba(120, 70, 110, .9))">
      <div class="logo"><span class="l1">Food</span><span class="l2">Delivery</span><span class="l3">Simulator</span></div>
      <div style="font-family: var(--display); font-size: 25px; color: #fff; -webkit-text-stroke: 5px #3a1d24; paint-order: stroke fill; margin-top: 14px">play free in your browser</div>
      <div style="font-family: var(--display); font-size: 16px; color: #3a1d24; background: rgba(255, 247, 232, .85); padding: 3px 12px; border-radius: 10px">mithatck.com/food-delivery-sim</div></div>`);
    const el = document.getElementById('trend');
    el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 450, fill: 'forwards' });
    el.querySelector('.logo').animate([{ transform: 'rotate(-4deg) scale(.4)' }, { transform: 'rotate(-4deg) scale(1)' }], { duration: 700, easing: 'cubic-bezier(.2, 1.5, .4, 1)', fill: 'forwards' });
    window.__onFrame = (f) => { game.St.S.clock = 19.4 * 60; if (f >= 120) return 'end'; };
  });
  await p.close();
}

await browser.close(); server.close();
console.log(`clip done: ${done.join(', ')} in ${((Date.now() - t0) / 1000).toFixed(0)} s → ${OUT}/shots`);

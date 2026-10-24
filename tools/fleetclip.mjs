// Fleet ad: a 9:16 clip of the rise from courier to fleet boss. Part one, you are the courier: a ride on the Rust Bucket
// with an order in the box, its engine stalling (the real kick-start event), a five-star hand-over at the door. Part two,
// the fleet: from one rider on your old Rust Bucket to a full ten-courier office across all four districts, dusk falls,
// the game's own "Your drivers kept working!" screen pays out, and an end card closes it. Everything on screen is the
// game itself: the game plays the ride, the event and the door scene, the numbers come from its formulas
// (St.fleetPerMin, ui.offline), and the hires stay inside what an office can hold. Recorded frame-exact in virtual time
// like feelclip.mjs; ffmpeg mixes in the game's music and sounds.
//   node tools/fleetclip.mjs [game-root] [out.mp4]
//   env: SCALE=2 (720×1280; 3 = 1080×1920) · STILLS=30,300,600 (render only these frames to <out>-stills/, for a quick look)
//        AUDIO=0 (silent) · CHROME=<browser binary> · PUPPETEER=<puppeteer-core dir>
import { createRequire } from 'node:module';
import { readFileSync, readdirSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, resolve, join } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
const HERE = dirname(fileURLToPath(import.meta.url));
const [GAME = resolve(HERE, '..'), OUT = HERE + '/shots/fleet-ad.mp4'] = process.argv.slice(2);
const SCALE = +(process.env.SCALE || 2), FPS = 30;
const STILLS = process.env.STILLS ? new Set(process.env.STILLS.split(',').map(Number)) : null;
const { serve } = await import(resolve(GAME, 'tools/serve.mjs'));

// ---- script (seconds) ----
// part one: when the engine stalls, how long it rides on after the kick-start, how long the door scene holds after the stars
const RIDE = { stall: 1.4, read: 0.8, after: 0.7, hold: 1.4 };
// part two hires: when, name, character, vehicle, district, skill. Ten couriers = office level 4, the top level.
const HIRES = [
  [0.0, 'Mert', 'male-b', 'rustbucket', 'oldtown', 0],
  [2.8, 'Emma', 'female-a', 'zippy', 'oldtown', 1],
  [4.3, 'Kaan', 'male-d', 'zippy', 'oldtown', 1],
  [5.8, 'Zeynep', 'female-c', 'vespetta', 'downtown', 2],
  [7.1, 'Leo', 'male-e', 'vespetta', 'downtown', 2],
  [8.3, 'Ayla', 'female-e', 'volt', 'harbor', 3],
  [9.4, 'Omar', 'male-c', 'volt', 'harbor', 3],
  [10.4, 'Mia', 'female-b', 'mule', 'harbor', 3],
  [11.3, 'Can', 'male-f', 'viper', 'hills', 4],
  [12.1, 'Sofia', 'female-d', 'viper', 'hills', 5],
];
// part two: counter appears, offline screen, tap Collect, end card, length
const T = { count: 1.4, off: 16.4, tap: 18.3, end: 19.7, len: 24.5 };
const AWAY_MIN = 8 * 60; // "slept 8 hours" (office level 4 caps offline earnings at 12 h)

// ---- browser ----
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
const veh = (count, lv = 3) => ({ parts: { engine: lv, suspension: lv, box: lv, tires: lv }, paint: null, box: null, count });
const QUIET = { seen: { rideTip: 1, manualTip: 1 }, onboard: { step: 99 }, look: { char: 'male-a', helmet: '#e8432f' },
  settings: { music: 0, sfx: 0, quality: 'high', haptics: false, autodrive: true } };
// day one: the Rust Bucket and $25, two deliveries in (past the tutorial street)
const COURIER_SAVE = { v: 1, created: D0, cash: 25, xp: 0, lvl: 1, day: 1, clock: 570, districts: { oldtown: true }, active: 'rustbucket', pos: null,
  vehicles: { rustbucket: veh(1, 0) }, stats: { deliveries: 2 }, ...QUIET };
// weeks later: every district, a garage to lend the couriers, an office at its top level (ten slots)
const BOSS_SAVE = { v: 1, created: D0 - 30 * 864e5, cash: 52400, xp: 0, lvl: 16, ratings: Array(30).fill(5), day: 14, clock: 900,
  districts: { oldtown: true, downtown: true, harbor: true, hills: true }, active: 'viper', pos: null,
  vehicles: { rustbucket: veh(2), zippy: veh(2), vespetta: veh(2), volt: veh(2), mule: veh(1), viper: veh(3) },
  skills: { riding: 4, navigation: 4, charm: 4, reflexes: 3, stamina: 3 },
  fleet: { office: true, level: 4, couriers: [], last: D0, bank: 0, applicants: [], events: [] }, stats: { deliveries: 420 }, ...QUIET };

// the overlay both parts share: a headline block at the top, the counter + income + hire chip, the logo, a tap ripple, the end card
const STYLE = `
  #toasts, #boot { display: none !important; }
  #ad.courier .top { top: 128px; padding: 0 16px; background: none; } #ad.courier .brand { display: none; } /* under the ride HUD's top row, clear of its buttons */
  #ad { position: fixed; inset: 0; z-index: 6; pointer-events: none; font-family: var(--font); }
  #ad .top { position: absolute; left: 0; right: 0; top: 0; padding: 18px 16px 70px; text-align: center;
    background: linear-gradient(rgba(19, 28, 48, .82), rgba(19, 28, 48, .55) 60%, rgba(19, 28, 48, 0)); }
  #ad .kick { display: inline-block; font-family: var(--display); font-size: 20px; color: #3a1d24; background: #ffcf3f; padding: 2px 14px; border-radius: 10px;
    box-shadow: 0 3px 0 rgba(60, 20, 30, .45); transform: rotate(-3deg); margin-bottom: 8px; }
  #ad .head { font-family: var(--display); font-size: 38px; line-height: 1.02; color: #fff4dc; -webkit-text-stroke: 6px #3a1d24; paint-order: stroke fill;
    filter: drop-shadow(0 4px 0 rgba(60, 20, 30, .35)); }
  #ad .head em { font-style: normal; color: #ffcf3f; }
  #ad .n { font-family: var(--display); font-size: 92px; line-height: .95; color: #ffcf3f; -webkit-text-stroke: 7px #3a1d24; paint-order: stroke fill;
    filter: drop-shadow(0 5px 0 rgba(60, 20, 30, .35)); display: inline-block; }
  #ad .l { font-family: var(--display); font-size: 21px; letter-spacing: .04em; color: #fff4dc; -webkit-text-stroke: 4px #3a1d24; paint-order: stroke fill; margin-top: 2px; }
  #ad .rate { display: inline-flex; align-items: center; gap: 6px; margin-top: 9px; padding: 4px 14px 4px 8px; border-radius: 20px; background: var(--hud);
    box-shadow: var(--hud-edge); font-family: var(--display); font-size: 22px; color: var(--cash); }
  #ad .rate .ic { width: 28px; height: 28px; } #ad .rate small { font-family: var(--font); font-weight: 600; font-size: 14px; color: #cfd8ea; }
  #ad .hire { display: inline-flex; align-items: center; gap: 7px; margin-top: 10px; padding: 3px 12px 3px 3px; border-radius: 18px; background: rgba(255, 250, 240, .95);
    color: var(--ink); font-weight: 600; font-size: 14px; box-shadow: 0 3px 0 rgba(0, 0, 0, .25); }
  #ad .hire .ic { width: 28px; height: 28px; border-radius: 50%; background: #2ec4b6; object-fit: cover; object-position: 50% 0; }
  #ad .hire b { font-family: var(--display); font-weight: 400; font-size: 16px; } #ad .hire i { font-style: normal; color: var(--ink-2); }
  #ad .brand { position: absolute; left: 0; right: 0; bottom: 16px; display: flex; justify-content: center; }
  #ad .brand .logo { transform: rotate(-4deg) scale(.5); transform-origin: 50% 100%; }
  #adtap { position: fixed; z-index: 100; pointer-events: none; width: 64px; height: 64px; margin: -32px 0 0 -32px; border-radius: 50%; border: 4px solid #fff; background: rgba(255, 255, 255, .35); opacity: 0; }
  #ad .end { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 16px; opacity: 0;
    background: radial-gradient(120% 90% at 50% 20%, rgba(255, 210, 138, .97) 0%, rgba(243, 154, 91, .97) 45%, rgba(143, 79, 110, .98) 100%); text-align: center; }
  #ad .end .tag { font-family: var(--display); font-size: 25px; line-height: 1.15; color: #fff; -webkit-text-stroke: 5px #3a1d24; paint-order: stroke fill; margin-top: 18px; }
  #ad .end .btn { width: auto; font-size: 26px; padding: 14px 42px; border-radius: 18px; margin-top: 6px; }
  #ad .end .sub { font-weight: 600; font-size: 15px; color: #fff7e8; text-shadow: 0 2px 0 rgba(60, 20, 30, .4); }
  #ad .end .url { font-family: var(--display); font-size: 17px; color: #3a1d24; background: rgba(255, 247, 232, .85); padding: 3px 12px; border-radius: 10px; }
  .mk.fleet.adpop .bub { animation: adpop .7s cubic-bezier(.2, 1.6, .4, 1) both; }
  .mk.fleet.adpop .bub::before { content: ''; position: absolute; inset: -4px; border-radius: 50%; border: 3px solid #ffcf3f; animation: adring .8s ease-out both; }
  @keyframes adpop { from { transform: scale(0); } to { transform: scale(1); } }
  @keyframes adring { from { transform: scale(.6); opacity: 1; } to { transform: scale(2.6); opacity: 0; } }`;
const LOGO = '<div class="logo"><span class="l1">Food</span><span class="l2">Delivery</span><span class="l3">Simulator</span></div>';

const { server, base } = await serve();
const browser = await puppeteer.launch({ executablePath: CHROME, headless: CHROME.includes('headless-shell') ? 'shell' : true, protocolTimeout: 900000,
  args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-background-timer-throttling', '--disable-renderer-backgrounding'] });
// a fresh page on a given save, the same orders, traffic and hazards on every run
async function open(save, clock) {
  const page = await browser.newPage();
  await page.setViewport({ width: 360, height: 640, deviceScaleFactor: SCALE, isMobile: true, hasTouch: true });
  page.on('pageerror', (e) => console.log('pageerror', e.message));
  page.on('console', (m) => { if (m.type() === 'error' || m.text().startsWith('clip')) console.log(m.text().slice(0, 200)); });
  await page.evaluateOnNewDocument((D0) => {
    let a = 0x2f6b9e1; Math.random = () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    Date.now = () => D0;
  }, D0);
  await page.evaluateOnNewDocument(SHIM);
  await page.evaluateOnNewDocument((s) => { localStorage.setItem('fds_save_v1', s); localStorage.setItem('fds_an', 'off'); }, JSON.stringify(save));
  await page.goto(`${base}/index.html?noti=1&clock=${clock}`, { waitUntil: 'networkidle0', timeout: 300000 });
  await page.waitForFunction('window.ready', { timeout: 300000, polling: 300 });
  await page.evaluate(async (STYLE, LOGO, FPS) => {
    await document.fonts.ready;
    const { W } = await import('./js/weather.js'); W.windows = []; W.forcedUntil = -1; W.rain = 0;
    document.head.insertAdjacentHTML('beforeend', `<style>${STYLE}</style>`);
    const ad = document.createElement('div'); ad.id = 'ad';
    ad.innerHTML = `<div class="top"></div><div class="brand">${LOGO}</div>`;
    const tapEl = document.createElement('div'); tapEl.id = 'adtap'; // above the modals and the ride HUD
    document.body.append(ad, tapEl);
    // shared helpers for the part scripts
    window.__ad = {
      $: (s) => ad.querySelector(s), FPS, cue: [],
      sleep: (ms) => new Promise((r) => __V.realST(r, ms)),
      lerp: (a, b, k) => a + (b - a) * k,
      ease: (x) => { x = Math.max(0, Math.min(1, x)); return x * x * (3 - 2 * x); },
      pop: (el, from = 1.35) => el?.animate([{ transform: `scale(${from})`, opacity: 0.4 }, { transform: 'scale(1)', opacity: 1 }], { duration: 380, easing: 'cubic-bezier(.2, 1.6, .4, 1)' }),
      // a finger tap on a button: a ripple on it and the button squashing
      tap: (b) => {
        const r = b.getBoundingClientRect(), rp = tapEl;
        rp.style.left = r.left + r.width / 2 + 'px'; rp.style.top = r.top + r.height / 2 + 'px';
        rp.animate([{ transform: 'scale(.4)', opacity: 0 }, { transform: 'scale(.8)', opacity: 1, offset: 0.35 }, { transform: 'scale(1.6)', opacity: 0 }], { duration: 600, easing: 'ease-out' });
        b.animate([{ transform: 'scale(1)' }, { transform: 'scale(.92)' }, { transform: 'scale(1)' }], { duration: 260 });
      },
    };
    window.__cues = () => window.__ad.cue.splice(0);
  }, STYLE, LOGO, FPS);
  return page;
}

// ---- capture: step virtual time a frame at a time until the part's script says 'end' ----
const dir = OUT.replace(/\.mp4$/, '') + (STILLS ? '-stills' : '-frames'); rmSync(dir, { recursive: true, force: true }); mkdirSync(dir, { recursive: true });
const cues = [], parts = [];
const lastStill = STILLS ? Math.max(...STILLS) : Infinity;
let g = 0;
const t0 = Date.now();
async function record(page) {
  if (g > lastStill) return;
  parts.push(g);
  // stills: skip rendering the frames in between (the simulation still runs every frame)
  if (STILLS) await page.evaluate(() => { const r = game.renderer, r0 = r.render.bind(r); r.render = (a, b) => { if (window.__draw) r0(a, b); }; });
  await page.evaluate(() => new Promise((r) => { __V.enable(); __V.realRAF(() => __V.realRAF(() => r())); }));
  for (let f = 0; g <= lastStill; f++) {
    const shoot = !STILLS || STILLS.has(g);
    const go = await page.evaluate(async (f, shoot) => {
      window.__draw = shoot; let r; try { r = await window.__onFrame(f); } catch (e) { console.error('onFrame', e.message); }
      if (r !== 'end') __V.step(1000 / 30); return r;
    }, f, shoot);
    if (go === 'end') break;
    for (const c of await page.evaluate(() => window.__cues())) cues.push({ g, ...c });
    if (shoot) {
      await page.evaluate(() => new Promise((r) => __V.realRAF(() => r())));
      await page.screenshot({ path: `${dir}/${String(g).padStart(4, '0')}.jpg`, type: 'jpeg', quality: 92 });
    }
    if (g % 30 === 0 || (STILLS && shoot)) console.log('clip frame', g, `${((Date.now() - t0) / 1000).toFixed(0)} s`);
    g++;
  }
  await page.close();
}

// ---- part one: the courier ----
const p1 = await open(COURIER_SAVE, 570);
await p1.evaluate(async () => {
  const { sleep } = window.__ad;
  const clear = () => document.querySelectorAll('.modal.tip [data-x], .modal.scene [data-x], .modal.pop [data-x], .evdock .opt').forEach((b) => b.click());
  document.querySelector('.ocard')?.click(); await sleep(400);
  document.querySelector('#startbar .sb-go')?.click(); await sleep(700);
  for (let i = 0; i < 60 && game.mode !== 'ride'; i++) { game.skipTween(); clear(); await sleep(200); }
  // ride the pickup leg at sim speed, through the pickup scene, onto the drop leg: the clip opens with the order in the box
  const R = game.ride.R;
  for (let i = 0; i < 800 && !(R.leg === 1 && R.phase === 'ride' && R.s > 40); i++) {
    if (R.event && !R.event.fired) R.event = null;
    game.sim(0.25); clear(); await sleep(20);
  }
  R.event = null;
  R.hazards.forEach((h) => { if (h.lane >= 0 && !['cash', 'energy'].includes(h.type)) { h.done = true; if (h.obj) h.obj.visible = false; } });
  document.querySelectorAll('.modal').forEach((m) => m.remove());
  console.log('clip courier', `leg ${R.leg} s ${R.s.toFixed(0)}/${R.route.length.toFixed(0)} m`);
});
await p1.evaluate((RIDE) => {
  const A = window.__ad, { $ } = A, R = game.ride.R;
  $('.top').parentElement.classList.add('courier');
  $('.top').innerHTML = '<div class="kick">DAY 1</div><div class="head">I STARTED<br>AS A <em>COURIER</em></div>';
  const head = (html) => { $('.head').innerHTML = html; A.pop($('.head')); };
  const st = { stage: 'ride', evAt: -1, pressAt: -1, goneAt: -1, arrAt: -1, clicked: -1, ratedAt: -1 };
  A.cue.push({ n: 'engine-moped', vol: 0.5, loop: 'eng' });
  window.__onFrame = async (f) => {
    const t = f / A.FPS;
    if (t > 25) { console.error('clip courier part stuck in', st.stage); return 'end'; }
    document.querySelectorAll('.modal.tip').forEach((m) => m.remove());
    if (st.stage === 'ride' && t >= RIDE.stall) { game.testEvent('stall', Math.max(1.5, R.v * 0.25)); st.stage = 'stall'; }
    if (st.stage === 'stall') {
      const card = document.querySelector('#ridehud .evdock'), needle = card?.querySelector('.needle');
      if (needle && st.evAt < 0) { st.evAt = t; head('ON A JUNK<br><em>SCOOTER</em>'); A.cue.push({ end: 'eng' }, { n: 'engine-stall', vol: 0.9 }); }
      // kick when the needle swings into the green, after the card has been read for a moment
      const x = parseFloat(needle?.style.left) / 100;
      if (needle && st.pressAt < 0 && t > st.evAt + RIDE.read && x > 0.65 && x < 0.77) {
        const b = card.querySelector('button'); A.tap(b); b.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true }));
        st.pressAt = t; A.cue.push({ n: 'qte-good', vol: 0.8 }, { n: 'engine-start', vol: 0.9 });
      }
      if (st.pressAt >= 0 && !card && st.goneAt < 0) { st.goneAt = t; A.cue.push({ n: 'engine-moped', vol: 0.5, loop: 'eng' }); }
      if (st.goneAt >= 0 && t > st.goneAt + RIDE.after) {
        // cut: the rest of the way at sim speed, no events, up to the customer's door. Ridden the way a player in a hurry
        // rides it (turbo when charged, through the reds) so the clock the cut skips doesn't make the order late.
        A.cue.push({ end: 'eng' });
        for (let i = 0; i < 600 && R.phase === 'ride'; i++) {
          if (R.event && !R.event.fired) R.event = null;
          if (R.light && R.light.state !== 'g' && R.light.d < 18 && R.runLight !== R.light.tile) game.rideInput('go', true);
          if (!R.boost && R.energy > R.energyMax * 0.5) game.rideInput('boost', true);
          game.sim(0.25);
        }
        game.rideInput('boost', false);
        game.sim(0.4); await A.sleep(80);
        st.stage = 'door'; st.arrAt = t; head('ONE ORDER<br>AT A <em>TIME</em>');
        A.cue.push({ n: 'doorbell', vol: 0.8 }, { n: 'door-open', vol: 0.5, at: 0.9 });
      }
    }
    if (st.stage === 'door') {
      const npc = game.ride.npc, b = document.querySelector('.modal.scene [data-x]');
      if (b && st.clicked < 0 && t > st.arrAt + 0.6 && ((npc && !npc.walking) || t > st.arrAt + 1.8)) { A.tap(b); b.click(); st.clicked = t; A.cue.push({ n: 'bag-rustle', vol: 0.9 }); }
      if (st.ratedAt < 0 && document.querySelector('.modal.rated')) {
        st.ratedAt = t; A.cue.push({ n: 'order-complete', vol: 0.9 });
        const r = R.orders[0].result; console.log('clip courier delivered', `${r.stars}★ $${(r.pay + r.bonus).toFixed(0)} + $${r.tip.toFixed(0)} tip`, r.late ? 'late' : 'on time', `food ${r.cond.toFixed(0)}%`);
      }
      if (st.ratedAt >= 0 && t > st.ratedAt + RIDE.hold) return 'end';
    }
  };
}, RIDE);
await record(p1);

// ---- part two: the fleet ----
const p2 = await open(BOSS_SAVE, 900);
await p2.evaluate(async (HIRES, T, AWAY_MIN) => {
  const A = window.__ad, { $, lerp, ease, sleep } = A;
  const { VEHICLE, DISTRICT } = await import('./js/data.js');
  const St = game.St;
  document.head.insertAdjacentHTML('beforeend', `<style>
    #hubui, #ridehud, #sheet, #startbar { display: none !important; }
    #markers .marker:not(.fleet) { display: none !important; }
    #ad .top.pre .count { display: none; } #ad .top:not(.pre) .head { display: none; }</style>`);
  $('.top').classList.add('pre');
  $('.top').innerHTML = `<div class="head">THEN I STARTED<br><em>HIRING</em></div>
    <div class="count"><div class="n">1</div><div class="l">COURIER ON THE ROAD</div>
    <div><span class="rate"><img class="ic" src="assets/icons/ui-cash.webp" alt=""><b>$0</b><small>/ hour</small></span></div></div>
    <div><span class="hire"></span></div>`;
  document.getElementById('ad').insertAdjacentHTML('beforeend', `<div class="end">${document.querySelector('#ad .brand').innerHTML}
    <div class="tag">Start on a junk scooter.<br>Build a delivery empire.</div>
    <button class="btn green big">Play free</button>
    <div class="sub">No download · plays in your browser</div><div class="url">mithatck.com/food-delivery-sim</div></div>`);
  // the Collect button's coins fly to the income pill instead of the hidden top bar
  const cash = document.querySelector('.topbar .cash'); if (cash) cash.getBoundingClientRect = () => $('.rate').getBoundingClientRect();
  const fmt = (v) => '$' + Math.round(v).toLocaleString('en-US');
  const riders = () => game.traffic.agents.filter((a) => a.kind === 'rider');
  const st = { hired: 0, rate: 0, shown: 0, r0: null };
  // camera: ride along with the first courier, pull back over Old Town + Downtown, then the whole city, turning slowly
  function camera(t) {
    const p = st.r0?.pos || [9 * 8, 31 * 8];
    const P = { x: p[0], z: p[1], d: 44 }, B = { x: 92, z: 196, d: 300 }, C = { x: 176, z: 168, d: 1050 };
    const k1 = ease((t - 1.9) / 3.6), k2 = ease((t - 5.4) / 6.8);
    const x = lerp(lerp(P.x, B.x, k1), C.x, k2), z = lerp(lerp(P.z, B.z, k1), C.z, k2);
    const d = Math.exp(lerp(lerp(Math.log(P.d), Math.log(B.d), k1), Math.log(C.d), k2));
    const yaw = Math.PI / 4 + 0.45 * ease(t / T.end), off = d * 0.13; // aim past the subject so it sits below the counter
    game.hubCam.snap(x - Math.sin(yaw) * off, z - Math.cos(yaw) * off, d);
    game.hubCam.st.yaw = yaw;
  }
  async function hire(i) {
    const [, name, char, veh, district, skill] = HIRES[i];
    St.S.fleet.couriers.push({ id: 'ad' + i, name, char, skill, veh, own: false, district, hired: Date.now() });
    St.emit('fleet');
    for (let w = 0; w < 400 && riders().length <= i; w++) await sleep(25); // the rider's bike model loads in real time
    const a = riders()[i]; if (i === 0) st.r0 = a;
    game.markers.list.find((m) => m.data === a)?.el.classList.add('adpop');
    st.rate = St.fleetPerMin() * 60;
    const n = St.S.fleet.couriers.length;
    $('.n').textContent = n; $('.l').textContent = n === 1 ? 'COURIER ON THE ROAD' : 'COURIERS ON THE ROAD';
    if (i) A.pop($('.n'), 1.45);
    $('.hire').innerHTML = `<img class="ic" src="assets/icons/char-${char}.webp" alt=""><b>${name}</b> hired · ${VEHICLE[veh].name} · <i>${DISTRICT[district].name}</i>`;
    $('.hire').animate([{ transform: 'translateY(-10px) scale(.85)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 260, easing: 'ease-out' });
    A.cue.push(i ? { n: 'event-pop', vol: 0.7 } : { n: 'engine-start', vol: 0.6 });
  }
  const at = (t, x) => Math.abs(t - x) < 0.5 / A.FPS;
  window.__onFrame = async (f) => {
    const t = f / A.FPS;
    if (t >= T.len) return 'end';
    while (st.hired < HIRES.length && HIRES[st.hired][0] <= t + 1e-6) await hire(st.hired++);
    camera(t);
    St.S.clock = lerp(15 * 60, 20 * 60 + 5, ease(t / (T.off + 0.4))); // golden hour into dusk, city lights half on
    if (t < T.off) document.querySelectorAll('.modal').forEach((m) => m.remove());
    if (at(t, T.count)) { $('.top').classList.remove('pre'); A.pop($('.count'), 1.3); A.cue.push({ n: 'ui-purchase', vol: 0.7 }); }
    st.shown = lerp(st.shown, st.rate, f ? 0.2 : 1);
    $('.rate b').textContent = fmt(st.shown);
    if (at(t, T.off)) {
      const gain = St.fleetPerMin() * AWAY_MIN;
      St.S.fleet.bank = gain;
      game.ui.offline({ away: AWAY_MIN, gain, capped: false });
      A.cue.push({ n: 'ui-open', vol: 0.8 });
    }
    if (at(t, T.tap)) { const b = document.querySelector('.modal [data-x="ok"]'); if (b) A.tap(b); }
    if (at(t, T.tap + 0.25)) { document.querySelector('.modal [data-x="ok"]')?.click(); A.cue.push({ n: 'ui-coins', vol: 1 }); }
    if (at(t, T.end)) {
      $('.end').animate([{ opacity: 0 }, { opacity: 1 }], { duration: 450, fill: 'forwards' });
      $('.end .logo').animate([{ transform: 'rotate(-4deg) scale(.3)' }, { transform: 'rotate(-4deg) scale(1)' }], { duration: 650, easing: 'cubic-bezier(.2, 1.5, .4, 1)', fill: 'forwards' });
      $('.end .btn').animate([{ transform: 'scale(1)' }, { transform: 'scale(1.07)' }, { transform: 'scale(1)' }], { duration: 900, delay: 700, iterations: Infinity });
      A.cue.push({ n: 'ui-unlock', vol: 0.8 });
    }
  };
  document.querySelectorAll('.modal').forEach((m) => m.remove());
}, HIRES, T, AWAY_MIN);
await record(p2);
await browser.close(); server.close();
if (STILLS) { console.log(`clip stills → ${dir}`); process.exit(0); }

// ---- encode: ride music under part one, hub music under part two, the game's sounds on their frames ----
const len = g / FPS, cut = (parts[1] ?? g) / FPS;
const A = (n) => resolve(GAME, 'assets/audio', n + '.mp3');
const sounds = [];
for (const c of cues) {
  if (c.end) continue;
  const at = c.g / FPS + (c.at || 0);
  // a loop runs until its matching end cue (or the end of its part)
  const stop = c.loop ? (cues.find((e) => e.end === c.loop && e.g > c.g)?.g ?? (c.g < (parts[1] ?? g) ? parts[1] ?? g : g)) / FPS : null;
  sounds.push({ file: A(c.n), at, vol: c.vol ?? 1, dur: stop != null ? stop - at : null });
}
const args = ['-y', '-loglevel', 'error', '-framerate', String(FPS), '-i', `${dir}/%04d.jpg`];
if (process.env.AUDIO !== '0') {
  const ins = [{ file: A('music-ride'), loop: true }, { file: A('music-hub'), loop: true }, ...sounds.map((s) => ({ ...s, loop: s.dur != null }))];
  for (const i of ins) { if (i.loop) args.push('-stream_loop', '-1'); args.push('-i', i.file); }
  const ms = (s) => Math.round(s * 1000);
  const filter = [
    `[1:a]volume=0.5,atrim=0:${cut.toFixed(3)},afade=t=out:st=${Math.max(0, cut - 0.35).toFixed(3)}:d=0.35[m1]`,
    `[2:a]volume=0.55,atrim=0:${(len - cut).toFixed(3)},afade=t=in:d=0.3,afade=t=out:st=${Math.max(0, len - cut - 1.2).toFixed(3)}:d=1.2,adelay=${ms(cut)}|${ms(cut)}[m2]`,
    ...sounds.map((s, i) => `[${i + 3}:a]volume=${s.vol}${s.dur != null ? `,atrim=0:${s.dur.toFixed(3)},afade=t=out:st=${Math.max(0, s.dur - 0.15).toFixed(3)}:d=0.15` : ''},adelay=${ms(s.at)}|${ms(s.at)}[s${i}]`),
    `[m1][m2]${sounds.map((_, i) => `[s${i}]`).join('')}amix=inputs=${sounds.length + 2}:normalize=0:duration=longest,atrim=0:${len.toFixed(3)}[a]`].join(';');
  args.push('-filter_complex', filter, '-map', '0:v', '-map', '[a]', '-c:a', 'aac', '-b:a', '160k');
}
args.push('-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-t', len.toFixed(3), OUT);
execFileSync('ffmpeg', args);
console.log(`clip done ${g} frames (${len.toFixed(1)} s, fleet from ${cut.toFixed(1)} s) in ${((Date.now() - t0) / 1000).toFixed(0)} s → ${OUT}`);

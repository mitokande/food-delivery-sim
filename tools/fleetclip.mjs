// Fleet timelapse ad: a 9:16 clip of the city map while the courier fleet grows from one rider on the Rust Bucket to a full
// ten-courier office across all four districts, dusk falls, the game's own "Your drivers kept working!" screen pays out,
// then an end card. Every number on screen comes from the game itself (St.fleetPerMin, ui.offline), the couriers are the
// real fleet riders, and the hires stay inside what an office can hold. Recorded frame-exact in virtual time like
// feelclip.mjs, with the game's hub music and UI sounds mixed in by ffmpeg.
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
// hires: when, name, character, vehicle, district, skill. Ten couriers = office level 4, the top level.
const HIRES = [
  [0.0, 'Mert', 'male-b', 'rustbucket', 'oldtown', 0],
  [2.6, 'Emma', 'female-a', 'zippy', 'oldtown', 1],
  [4.3, 'Kaan', 'male-d', 'zippy', 'oldtown', 1],
  [5.8, 'Zeynep', 'female-c', 'vespetta', 'downtown', 2],
  [7.1, 'Leo', 'male-e', 'vespetta', 'downtown', 2],
  [8.3, 'Ayla', 'female-e', 'volt', 'harbor', 3],
  [9.4, 'Omar', 'male-c', 'volt', 'harbor', 3],
  [10.4, 'Mia', 'female-b', 'mule', 'harbor', 3],
  [11.3, 'Can', 'male-f', 'viper', 'hills', 4],
  [12.1, 'Sofia', 'female-d', 'viper', 'hills', 5],
];
const T = { off: 16.4, tap: 18.3, end: 19.7, len: 24.5 }; // offline screen, tap Collect, end card, clip length
const AWAY_MIN = 8 * 60; // "slept 8 hours" (office level 4 caps offline earnings at 12 h)
const FRAMES = Math.round(T.len * FPS);

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
const veh = (count) => ({ parts: { engine: 3, suspension: 2, box: 2, tires: 2 }, paint: null, box: null, count });
const SAVE = { v: 1, created: D0 - 30 * 864e5, cash: 52400, xp: 0, lvl: 16, ratings: Array(30).fill(5), day: 14, clock: 900,
  districts: { oldtown: true, downtown: true, harbor: true, hills: true }, active: 'viper', pos: null,
  vehicles: { rustbucket: veh(2), zippy: veh(2), vespetta: veh(2), volt: veh(2), mule: veh(1), viper: veh(3) },
  skills: { riding: 4, navigation: 4, charm: 4, reflexes: 3, stamina: 3 },
  fleet: { office: true, level: 4, couriers: [], last: D0, bank: 0, applicants: [], events: [] },
  stats: { deliveries: 420 }, seen: { rideTip: 1, manualTip: 1 }, onboard: { step: 99 }, look: { char: 'male-a', helmet: '#e8432f' },
  settings: { music: 0, sfx: 0, quality: 'high', haptics: false, autodrive: true } };

const { server, base } = await serve();
const browser = await puppeteer.launch({ executablePath: CHROME, headless: CHROME.includes('headless-shell') ? 'shell' : true, protocolTimeout: 900000,
  args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-background-timer-throttling', '--disable-renderer-backgrounding'] });
const page = await browser.newPage();
await page.setViewport({ width: 360, height: 640, deviceScaleFactor: SCALE, isMobile: true, hasTouch: true });
page.on('pageerror', (e) => console.log('pageerror', e.message));
page.on('console', (m) => { if (m.type() === 'error' || m.text().startsWith('clip')) console.log(m.text().slice(0, 200)); });
await page.evaluateOnNewDocument((D0) => {
  let a = 0x2f6b9e1; Math.random = () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  Date.now = () => D0;
}, D0);
await page.evaluateOnNewDocument(SHIM);
await page.evaluateOnNewDocument((s) => { localStorage.setItem('fds_save_v1', s); localStorage.setItem('fds_an', 'off'); }, JSON.stringify(SAVE));
await page.goto(`${base}/index.html?noti=1&clock=900`, { waitUntil: 'networkidle0', timeout: 300000 });
await page.waitForFunction('window.ready', { timeout: 300000, polling: 300 });
await page.evaluate(() => document.fonts.ready);

// ---- overlay: counter, income, hire chip, logo, tap ripple, end card ----
await page.evaluate(async (HIRES, T, AWAY_MIN, FPS) => {
  const sleep = (ms) => new Promise((r) => __V.realST(r, ms));
  const { W } = await import('./js/weather.js'); W.windows = []; W.forcedUntil = -1; W.rain = 0;
  const { VEHICLE, DISTRICT } = await import('./js/data.js');
  const St = game.St;
  document.head.insertAdjacentHTML('beforeend', `<style>
    #hubui, #ridehud, #sheet, #startbar, #toasts, #boot { display: none !important; }
    #markers .marker:not(.fleet) { display: none !important; }
    .mk.fleet.adpop .bub { animation: adpop .7s cubic-bezier(.2, 1.6, .4, 1) both; }
    .mk.fleet.adpop .bub::before { content: ''; position: absolute; inset: -4px; border-radius: 50%; border: 3px solid #ffcf3f; animation: adring .8s ease-out both; }
    @keyframes adpop { from { transform: scale(0); } to { transform: scale(1); } }
    @keyframes adring { from { transform: scale(.6); opacity: 1; } to { transform: scale(2.6); opacity: 0; } }
    #ad { position: fixed; inset: 0; z-index: 6; pointer-events: none; font-family: var(--font); }
    #ad .top { position: absolute; left: 0; right: 0; top: 0; padding: 18px 16px 70px; text-align: center;
      background: linear-gradient(rgba(19, 28, 48, .82), rgba(19, 28, 48, .55) 60%, rgba(19, 28, 48, 0)); }
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
    #ad .ripple { position: absolute; width: 64px; height: 64px; margin: -32px 0 0 -32px; border-radius: 50%; border: 4px solid #fff; background: rgba(255, 255, 255, .35); opacity: 0; }
    #ad .end { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 16px; opacity: 0;
      background: radial-gradient(120% 90% at 50% 20%, rgba(255, 210, 138, .97) 0%, rgba(243, 154, 91, .97) 45%, rgba(143, 79, 110, .98) 100%); text-align: center; }
    #ad .end .tag { font-family: var(--display); font-size: 25px; line-height: 1.15; color: #fff; -webkit-text-stroke: 5px #3a1d24; paint-order: stroke fill; margin-top: 18px; }
    #ad .end .btn { width: auto; font-size: 26px; padding: 14px 42px; border-radius: 18px; margin-top: 6px; }
    #ad .end .sub { font-weight: 600; font-size: 15px; color: #fff7e8; text-shadow: 0 2px 0 rgba(60, 20, 30, .4); }
    #ad .end .url { font-family: var(--display); font-size: 17px; color: #3a1d24; background: rgba(255, 247, 232, .85); padding: 3px 12px; border-radius: 10px; }
  </style>`);
  const ad = document.createElement('div'); ad.id = 'ad';
  ad.innerHTML = `<div class="top"><div class="n">1</div><div class="l">COURIER ON THE ROAD</div>
      <div><span class="rate"><img class="ic" src="assets/icons/ui-cash.webp" alt=""><b>$0</b><small>/ hour</small></span></div>
      <div><span class="hire"></span></div></div>
    <div class="brand"><div class="logo"><span class="l1">Food</span><span class="l2">Delivery</span><span class="l3">Simulator</span></div></div>
    <div class="ripple"></div>
    <div class="end"><div class="logo"><span class="l1">Food</span><span class="l2">Delivery</span><span class="l3">Simulator</span></div>
      <div class="tag">Start on a junk scooter.<br>Build a delivery empire.</div>
      <button class="btn green big">Play free</button>
      <div class="sub">No download · plays in your browser</div><div class="url">mithatck.com/food-delivery-sim</div></div>`;
  document.body.append(ad);
  const $ = (s) => ad.querySelector(s);
  // the Collect button's coins fly to the income pill instead of the hidden top bar
  const cash = document.querySelector('.topbar .cash'); if (cash) cash.getBoundingClientRect = () => $('.rate').getBoundingClientRect();
  const fmt = (v) => '$' + Math.round(v).toLocaleString('en-US');

  const lerp = (a, b, k) => a + (b - a) * k, clamp = (x) => Math.max(0, Math.min(1, x));
  const ease = (x) => { x = clamp(x); return x * x * (3 - 2 * x); };
  const riders = () => game.traffic.agents.filter((a) => a.kind === 'rider');
  const st = { hired: 0, rate: 0, shown: 0, r0: null, cue: [] };
  // camera: ride along with the first courier, pull back over Old Town + Downtown, then the whole city, turning slowly
  function camera(t) {
    const p = st.r0?.pos || [9 * 8, 31 * 8];
    const A = { x: p[0], z: p[1], d: 44 }, B = { x: 92, z: 196, d: 300 }, C = { x: 176, z: 168, d: 1050 };
    const k1 = ease((t - 1.9) / 3.6), k2 = ease((t - 5.4) / 6.8);
    const x = lerp(lerp(A.x, B.x, k1), C.x, k2), z = lerp(lerp(A.z, B.z, k1), C.z, k2);
    const d = Math.exp(lerp(lerp(Math.log(A.d), Math.log(B.d), k1), Math.log(C.d), k2));
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
    if (i) $('.n').animate([{ transform: 'scale(1.45)' }, { transform: 'scale(1)' }], { duration: 380, easing: 'cubic-bezier(.2, 1.6, .4, 1)' });
    $('.hire').innerHTML = `<img class="ic" src="assets/icons/char-${char}.webp" alt=""><b>${name}</b> ${i ? 'hired' : ''} · ${VEHICLE[veh].name} · <i>${DISTRICT[district].name}</i>`;
    $('.hire').animate([{ transform: 'translateY(-10px) scale(.85)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 260, easing: 'ease-out' });
    st.cue.push(['hire', i]);
  }
  window.__onFrame = async (f) => {
    const t = f / FPS;
    while (st.hired < HIRES.length && HIRES[st.hired][0] <= t + 1e-6) await hire(st.hired++);
    camera(t);
    St.S.clock = lerp(15 * 60, 20 * 60 + 5, ease(t / (T.off + 0.4))); // golden hour into dusk, city lights half on
    if (t < T.off) document.querySelectorAll('.modal').forEach((m) => m.remove());
    st.shown = lerp(st.shown, st.rate, f ? 0.2 : 1);
    $('.rate b').textContent = fmt(st.shown);
    if (Math.abs(t - T.off) < 0.5 / FPS) {
      const gain = St.fleetPerMin() * AWAY_MIN;
      St.S.fleet.bank = gain;
      game.ui.offline({ away: AWAY_MIN, gain, capped: false });
      st.cue.push(['offline']);
    }
    if (Math.abs(t - T.tap) < 0.5 / FPS) {
      const b = document.querySelector('.modal [data-x="ok"]');
      if (b) {
        const r = b.getBoundingClientRect(), rp = $('.ripple');
        rp.style.left = r.left + r.width / 2 + 'px'; rp.style.top = r.top + r.height / 2 + 'px';
        rp.animate([{ transform: 'scale(.4)', opacity: 0 }, { transform: 'scale(.8)', opacity: 1, offset: 0.35 }, { transform: 'scale(1.6)', opacity: 0 }], { duration: 600, easing: 'ease-out' });
        b.animate([{ transform: 'scale(1)' }, { transform: 'scale(.92)' }, { transform: 'scale(1)' }], { duration: 260 });
      }
    }
    if (Math.abs(t - (T.tap + 0.25)) < 0.5 / FPS) { document.querySelector('.modal [data-x="ok"]')?.click(); st.cue.push(['collect']); }
    if (Math.abs(t - T.end) < 0.5 / FPS) {
      $('.end').animate([{ opacity: 0 }, { opacity: 1 }], { duration: 450, fill: 'forwards' });
      $('.end .logo').animate([{ transform: 'rotate(-4deg) scale(.3)' }, { transform: 'rotate(-4deg) scale(1)' }], { duration: 650, easing: 'cubic-bezier(.2, 1.5, .4, 1)', fill: 'forwards' });
      $('.end .btn').animate([{ transform: 'scale(1)' }, { transform: 'scale(1.07)' }, { transform: 'scale(1)' }], { duration: 900, delay: 700, iterations: Infinity });
      st.cue.push(['end']);
    }
  };
  window.__cues = () => st.cue.splice(0);
  document.querySelectorAll('.modal').forEach((m) => m.remove());
  console.log('clip ready');
}, HIRES, T, AWAY_MIN, FPS);

// stills: skip rendering the frames in between (the simulation still runs every frame)
if (STILLS) await page.evaluate(() => { const r = game.renderer, r0 = r.render.bind(r); r.render = (a, b) => { if (window.__draw) r0(a, b); }; });
await page.evaluate(() => new Promise((r) => { __V.enable(); __V.realRAF(() => __V.realRAF(() => r())); }));
const dir = OUT.replace(/\.mp4$/, '') + (STILLS ? '-stills' : '-frames'); rmSync(dir, { recursive: true, force: true }); mkdirSync(dir, { recursive: true });
const cues = [];
const t0 = Date.now();
const last = STILLS ? Math.max(...STILLS) + 1 : FRAMES;
for (let f = 0; f < last; f++) {
  const shoot = !STILLS || STILLS.has(f);
  await page.evaluate(async (f, shoot) => { window.__draw = shoot; try { await window.__onFrame(f); } catch (e) { console.error('onFrame', e.message); } __V.step(1000 / 30); }, f, shoot);
  for (const c of await page.evaluate(() => window.__cues())) cues.push([f, ...c]);
  if (!shoot) continue;
  await page.evaluate(() => new Promise((r) => __V.realRAF(() => r())));
  await page.screenshot({ path: `${dir}/${String(f).padStart(4, '0')}.jpg`, type: 'jpeg', quality: 92 });
  if (f % 30 === 0 || STILLS) console.log('clip frame', f, `${((Date.now() - t0) / 1000).toFixed(0)} s`);
}
await browser.close(); server.close();
if (STILLS) { console.log(`clip stills → ${dir}`); process.exit(0); }

// ---- encode: game music under the whole clip, a pop per hire, coins on Collect ----
const A = (n) => resolve(GAME, 'assets/audio', n + '.mp3');
const sfx = cues.flatMap(([f, k, i]) => ({ hire: [[i ? 'event-pop' : 'engine-start', 0.7]], offline: [['ui-open', 0.8]], collect: [['ui-coins', 1]], end: [['ui-unlock', 0.8]] }[k] || [])
  .map(([n, vol]) => ({ n, vol, ms: Math.round(f * 1000 / FPS) })));
const args = ['-y', '-loglevel', 'error', '-framerate', String(FPS), '-i', `${dir}/%04d.jpg`];
let filter = null;
if (process.env.AUDIO !== '0') {
  args.push('-stream_loop', '-1', '-i', A('music-hub'));
  sfx.forEach((s) => args.push('-i', A(s.n)));
  filter = [`[1:a]volume=0.55,afade=t=in:d=0.3,afade=t=out:st=${(T.len - 1.2).toFixed(2)}:d=1.2[m]`,
    ...sfx.map((s, i) => `[${i + 2}:a]volume=${s.vol},adelay=${s.ms}|${s.ms}[s${i}]`),
    `[m]${sfx.map((_, i) => `[s${i}]`).join('')}amix=inputs=${sfx.length + 1}:normalize=0:duration=first,atrim=0:${T.len}[a]`].join(';');
  args.push('-filter_complex', filter, '-map', '0:v', '-map', '[a]', '-c:a', 'aac', '-b:a', '160k');
}
args.push('-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-t', String(T.len), OUT);
execFileSync('ffmpeg', args);
console.log(`clip done ${FRAMES} frames in ${((Date.now() - t0) / 1000).toFixed(0)} s → ${OUT}`);

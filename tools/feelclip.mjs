// Ride-feel clip: a phone-sized ride recorded frame-exact in virtual time (tools/vtime-shim.js), for before/after
// comparisons of the bike's motion and camera. Take-off from rest, corners, a pothole hit (no hop), a turbo burst after a red light,
// red lights stopped at and then run.   node tools/feelclip.mjs <game-root> <out.mp4> [frames=270]
import { createRequire } from 'node:module';
import { readFileSync, mkdirSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const HERE = dirname(fileURLToPath(import.meta.url));
const [GAME = resolve(HERE, '..'), OUT = HERE + '/shots/feel.mp4', FRAMES = '270'] = process.argv.slice(2);
const { serve } = await import(resolve(GAME, 'tools/serve.mjs'));
const require = createRequire(HERE + '/x.js');
let puppeteer; try { puppeteer = require('puppeteer-core'); } catch { puppeteer = require('/root/.npm/_npx/110f701c48e68d66/node_modules/puppeteer-core'); }
const SHIM = readFileSync(HERE + '/vtime-shim.js', 'utf8');
const SAVE = { v: 1, cash: 12450, xp: 400, lvl: 7, ratings: [5, 5, 4, 5, 5, 5], districts: { oldtown: true, downtown: true }, stats: { deliveries: 60 },
  seen: { rideTip: 1, manualTip: 1 }, onboard: { step: 99 }, settings: { music: 0, sfx: 0, quality: 'high', haptics: false }, active: 'vespetta',
  vehicles: { rustbucket: { parts: { engine: 2, suspension: 1, box: 0, tires: 0 }, count: 1 }, vespetta: { parts: { engine: 2, suspension: 1, box: 1, tires: 1 }, count: 1 } } };
const { server, base } = await serve();
const browser = await puppeteer.launch({ executablePath: '/root/.cache/puppeteer/chrome/linux-148.0.7778.97/chrome-linux64/chrome', headless: 'new', protocolTimeout: 900000,
  args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-background-timer-throttling', '--disable-renderer-backgrounding'] });
const page = await browser.newPage();
await page.setViewport({ width: 360, height: 640, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
page.on('pageerror', (e) => console.log('pageerror', e.message));
page.on('console', (m) => { if (m.type() === 'error' || m.text().startsWith('clip')) console.log(m.text().slice(0, 200)); });
// the same orders, traffic and hazards on every run
await page.evaluateOnNewDocument(() => {
  let a = 0x2f6b9e1; Math.random = () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const D0 = 1792000000000; Date.now = () => D0;
});
await page.evaluateOnNewDocument(SHIM);
await page.evaluateOnNewDocument((s) => localStorage.setItem('fds_save_v1', s), JSON.stringify(SAVE));
// (scripted on the brake ride, the phone's ride when this was made; ?ctl=b keeps it there now that phones ride the run)
await page.goto(`${base}/index.html?noti=1&energy=off&ctl=b&clock=610`, { waitUntil: 'networkidle0', timeout: 300000 });
await page.waitForFunction('window.ready', { timeout: 300000, polling: 300 });
await page.evaluate(async () => {
  const sleep = (ms) => new Promise((r) => __V.realST(r, ms));
  const clear = () => document.querySelectorAll('.modal.tip [data-x], .modal.scene [data-x], .evdock .opt').forEach((b) => b.click());
  const { W } = await import('./js/weather.js'); W.windows = []; W.forcedUntil = -1; W.rain = 0;
  document.querySelector('.ocard')?.click(); await sleep(400);
  document.querySelector('#startbar .sb-go')?.click(); await sleep(700);
  for (let i = 0; i < 60 && game.mode !== 'ride'; i++) { game.skipTween(); clear(); await sleep(200); }
  clear(); await sleep(200);
  document.querySelectorAll('.modal').forEach((m) => m.remove()); document.getElementById('toasts').innerHTML = '';
  game.ride.R.hazards.forEach((h) => { if (h.lane >= 0 && !['cash', 'energy'].includes(h.type)) { h.done = true; if (h.obj) h.obj.visible = false; } }); // only the scripted pothole
  console.log('clip start', game.ride.R.route.length.toFixed(0), 'm');
});
await page.evaluate(() => {
  window.__onFrame = async (f) => {
    const R = game.ride.R;
    document.querySelectorAll('#toasts .toast, .modal.tip').forEach((t) => t.remove());
    // stop for a red, then run it after a beat so the clip keeps moving
    if (R.light && R.light.state !== 'g' && R.v < 0.3 && R.light.d < 3) { window.__wait = (window.__wait || 0) + 1; if (window.__wait > 20) { game.rideInput('go'); window.__wait = 0; } }
    if (f === 95) {
      const { makeHazardMesh } = await import('./js/ride/hazards.js');
      const h = { type: 'pothole', s: R.s + Math.max(6, R.v * 1.2), lane: 1, tile: R.route.steps[R.sampled[3]].tile };
      h.obj = makeHazardMesh(h); game.scene.add(h.obj);
      const o = game.sampleRoute(R.route, h.s, [0, 0, 0, 0]);
      h.x = o[0]; h.z = o[1]; h.hd = o[2]; h.obj.position.set(h.x, h.obj.position.y, h.z); h.obj.rotation.y = o[2];
      R.hazards.push(h);
    }
    if (f === 222) { R.energy = R.energyMax; game.rideInput('boost', true); }
    if (f === 266) game.rideInput('boost', false);
  };
});
await page.evaluate(() => new Promise((r) => { __V.enable(); __V.realRAF(() => __V.realRAF(() => r())); }));
const dir = OUT.replace(/\.mp4$/, '') + '-frames'; rmSync(dir, { recursive: true, force: true }); mkdirSync(dir, { recursive: true });
const t0 = Date.now();
for (let f = 0; f < +FRAMES; f++) {
  await page.evaluate(async (f) => { try { await window.__onFrame?.(f); } catch (e) { console.error('onFrame', e.message); } __V.step(1000 / 30); }, f);
  await page.evaluate(() => new Promise((r) => __V.realRAF(() => r())));
  await page.screenshot({ path: `${dir}/${String(f).padStart(4, '0')}.jpg`, type: 'jpeg', quality: 90 });
  if (f % 30 === 0) console.log('clip frame', f, await page.evaluate(() => { const R = game.ride.R; return `v ${R.v.toFixed(1)} s ${R.s.toFixed(0)} phase ${R.phase}`; }));
}
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', '30', '-i', `${dir}/%04d.jpg`, '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', OUT]);
console.log(`clip done ${FRAMES} frames in ${((Date.now() - t0) / 1000).toFixed(0)} s → ${OUT}`);
await browser.close(); server.close();

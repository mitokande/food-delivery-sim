// Automated play-through: take the first order, start, take screenshots during the ride,
// click through pickup / delivery / receipt. Reports console errors.
//   node tools/play.mjs [W H] [shots-prefix]   env: STEPS=…, PRESS=boost,hop (spam inputs), SAVE=json (localStorage seed)
import { createRequire } from 'node:module';
import { serve } from './serve.mjs';
const require = createRequire(import.meta.url);
let puppeteer;
try { puppeteer = require('puppeteer-core'); } catch { puppeteer = require('/root/.npm/_npx/110f701c48e68d66/node_modules/puppeteer-core'); }
const CHROME = process.env.CHROME || '/root/.cache/puppeteer/chrome/linux-148.0.7778.97/chrome-linux64/chrome';
const [W = 390, H = 844, prefix = 'tools/shots/play'] = process.argv.slice(2);
const { server, base } = await serve();
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage();
await page.setViewport({ width: +W, height: +H, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error' && !/404|Failed to load resource/.test(m.text())) errors.push(m.text()); if (process.env.LOG) console.log('[console]', m.text()); });
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
if (process.env.SAVE) await page.evaluateOnNewDocument((s) => localStorage.setItem('fds_save_v1', s), process.env.SAVE);
await page.goto(`${base}/index.html?noti=1&clock=${process.env.CLOCK || 1000}`, { waitUntil: 'networkidle0', timeout: 180000 });
await page.waitForFunction('window.ready', { timeout: 90000 });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const shot = async (n) => { await page.screenshot({ path: `${prefix}-${n}.png` }); console.log('shot', n); };
const clickSel = async (sel) => page.evaluate((s) => { const b = document.querySelector(s); if (b) { b.click(); return true; } return false; }, sel);
await sleep(800);
await clickSel('.ocard');
await sleep(500);
await shot('0-taken');
await clickSel('#startbar .sb-go');
await sleep(2200);
await clickSel('.modal.tip [data-x]');
const t0 = Date.now();
let n = 1, lastShot = 0;
const press = (process.env.PRESS || '').split(',').filter(Boolean);
while (Date.now() - t0 < +(process.env.MAXMS || 150000)) {
  const st = await page.evaluate(() => { const R = game.ride.R; return { mode: game.mode, phase: R.phase, s: Math.round(R.s), len: Math.round(R.route?.length || 0), v: +R.v.toFixed(1), leg: R.leg, blocked: R.blockedBy, modal: [...document.querySelectorAll('.modal')].map((m) => m.className).join('|'), ctx: [...document.querySelectorAll('.r-ctx .ctx')].map((b) => b.dataset.ride).join(',') }; });
  if (Date.now() - lastShot > +(process.env.EVERY || 6000)) { lastShot = Date.now(); console.log(JSON.stringify(st)); await shot(n++); }
  if (st.modal.includes('event')) { await shot('event' + n++); await page.evaluate(() => { const b = document.querySelector('.modal.event .opt, .modal.event .btn'); if (b) { b.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); b.click(); } }); }
  if (st.modal.includes('scene')) { await sleep(700); await shot('scene' + n++); await clickSel('.modal.scene [data-x]'); }
  if (st.modal.includes('rated')) { await sleep(600); await shot('rated' + n++); await clickSel('.modal.rated'); }
  if (st.modal.includes('receipt')) { await sleep(500); await shot('receipt'); await clickSel('.modal.receipt [data-x]'); }
  if (st.modal.includes('tip')) { await shot('tip' + n++); await clickSel('.modal.tip [data-x]'); }
  if (st.modal.includes('pop')) { await sleep(400); await shot('pop' + n++); await clickSel('.modal.pop [data-x]'); }
  if (st.mode === 'hub' && Date.now() - t0 > 5000) { await sleep(1500); await shot('back-hub'); break; }
  for (const k of press) await page.evaluate((k) => game.ride.input(k, true), k);
  if (st.ctx && process.env.CTX) await page.evaluate(() => { const b = document.querySelector('.r-ctx .ctx'); if (b) game.ride.input(b.dataset.ride, true); });
  if (process.env.SIM) await page.evaluate((x) => game.sim(x), +process.env.SIM);
  await sleep(250);
}
const fin = await page.evaluate(() => ({ cash: game.St.S.cash, xp: game.St.S.xp, lvl: game.St.S.lvl, del: game.St.S.stats.deliveries, clock: game.St.S.clock }));
console.log('final', JSON.stringify(fin));
console.log('errors', errors.length ? errors.slice(0, 10).join('\n') : 'none');
await browser.close(); server.close();

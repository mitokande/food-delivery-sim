// Screenshot each hub tab at a phone size (or given size).  node tools/tabs.mjs [W H] [prefix]   env SAVE=json
import { createRequire } from 'node:module';
import { serve } from './serve.mjs';
const require = createRequire(import.meta.url);
let puppeteer;
try { puppeteer = require('puppeteer-core'); } catch { puppeteer = require('/root/.npm/_npx/110f701c48e68d66/node_modules/puppeteer-core'); }
const CHROME = process.env.CHROME || '/root/.cache/puppeteer/chrome/linux-148.0.7778.97/chrome-linux64/chrome';
const [W = 390, H = 844, prefix = 'tools/shots/tab'] = process.argv.slice(2);
const { server, base } = await serve();
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage();
const touch = +W < +H;
await page.setViewport({ width: +W, height: +H, deviceScaleFactor: 1, isMobile: touch, hasTouch: touch });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error' && !/404|Failed to load/.test(m.text())) errors.push(m.text()); });
if (process.env.SAVE) await page.evaluateOnNewDocument((s) => localStorage.setItem('fds_save_v1', s), process.env.SAVE);
await page.goto(`${base}/index.html?noti=1&clock=${process.env.CLOCK || 1050}`, { waitUntil: 'networkidle0', timeout: 180000 });
await page.waitForFunction('window.ready', { timeout: 90000 });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
await sleep(1500);
await page.evaluate(() => document.querySelectorAll('.modal').forEach((m) => m.remove()));
for (const t of (process.env.TABS || 'city,garage,courier,jobs,fleet').split(',')) {
  await page.evaluate((t) => game.ui.setTab(t), t);
  await sleep(t === 'garage' ? 9000 : 1300);
  await page.screenshot({ path: `${prefix}-${t}.png` });
  console.log('shot', t);
}
console.log('errors', errors.length ? errors.join('\n') : 'none');
await browser.close(); server.close();

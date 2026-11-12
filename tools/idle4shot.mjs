// Quick look at Ferdi's (idle4.html): boots it on a phone viewport, optionally runs JS, takes screenshots.
//   node tools/idle4shot.mjs <outdir> [url-query] [js-after-boot] [wait-ms] [shots]
import { createRequire } from 'node:module';
import { serve } from './serve.mjs';
const require = createRequire(import.meta.url);
let puppeteer;
try { puppeteer = require('puppeteer-core'); } catch { puppeteer = require('/root/.npm/_npx/110f701c48e68d66/node_modules/puppeteer-core'); }
const CHROME = process.env.CHROME || '/root/.cache/puppeteer/chrome/linux-148.0.7778.97/chrome-linux64/chrome';
const [OUT, QS = 'fresh&noti', JS = '', WAIT = '4000', N = '1', VW = '390', VH = '844'] = process.argv.slice(2);
const { server, base } = await serve();
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage();
await page.setViewport({ width: +VW, height: +VH, deviceScaleFactor: 1, isMobile: +VW < 800, hasTouch: +VW < 800 });
page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.log('console', m.type(), m.text()); });
page.on('response', (r) => { if (r.status() >= 400 && !/fonts\.g|favicon/.test(r.url())) console.log('HTTP', r.status(), r.url()); });
await page.goto(`${base}/idle4.html?${QS}`, { waitUntil: 'networkidle0', timeout: 180000 });
await page.waitForFunction('window.ready', { timeout: 90000, polling: 200 });
if (JS) console.log('js →', JSON.stringify(await page.evaluate(JS)));
for (let i = 0; i < +N; i++) {
  await new Promise((r) => setTimeout(r, +WAIT));
  await page.screenshot({ path: `${OUT}/idle4-${i}.png` });
  console.log('shot', i, JSON.stringify(await page.evaluate('({ t: game.G.t.toFixed(1), cash: game.G.cash.toFixed(1), cust: game.G.cust.length, peek: game.world.peek().views })')));
}
await browser.close(); server.close();

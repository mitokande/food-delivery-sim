// Screenshot any page of the project in headless Chrome.
//   node tools/shot.mjs <path?query> <out.png> [W H] [eval-js]
//   env: TOUCH=1 (mobile emulation), DPR, WAIT (ms after ready), READY (js expr to wait for, default window.ready)
import { createRequire } from 'node:module';
import { serve } from './serve.mjs';
const require = createRequire(import.meta.url);
let puppeteer;
try { puppeteer = require('puppeteer-core'); } catch { puppeteer = require('/root/.npm/_npx/110f701c48e68d66/node_modules/puppeteer-core'); }
const CHROME = process.env.CHROME || '/root/.cache/puppeteer/chrome/linux-148.0.7778.97/chrome-linux64/chrome';
const [path, out, W = 390, H = 844, js] = process.argv.slice(2);
const { server, base } = await serve();
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage();
const touch = !!process.env.TOUCH;
await page.setViewport({ width: +W, height: +H, deviceScaleFactor: +(process.env.DPR || 1), isMobile: touch, hasTouch: touch });
page.on('console', (m) => console.log(`[${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => console.log(`[pageerror] ${e.message}`));
page.on('requestfailed', (r) => console.log(`[reqfail] ${r.url()} ${r.failure()?.errorText}`));
await page.goto(`${base}/${path}`, { waitUntil: 'networkidle0', timeout: 180000 });
await page.waitForFunction(process.env.READY || 'window.ready', { timeout: 60000, polling: 100 }).catch(() => console.log('not ready'));
if (js) { const r = await page.evaluate(js); if (r !== undefined) console.log('eval:', JSON.stringify(r)); }
await new Promise((r) => setTimeout(r, +(process.env.WAIT || 1200)));
await page.screenshot({ path: out });
console.log('saved', out);
await browser.close(); server.close();

// Contact sheet of ride particle effects: triggers each effect beside the parked scooter and screenshots it.
//   node tools/fxshots.mjs [out-prefix]
import { createRequire } from 'node:module';
import { serve } from './serve.mjs';
const require = createRequire(import.meta.url);
let puppeteer; try { puppeteer = require('puppeteer-core'); } catch { puppeteer = require('/root/.npm/_npx/110f701c48e68d66/node_modules/puppeteer-core'); }
const prefix = process.argv[2] || 'tools/shots/fx';
const { server, base } = await serve();
const browser = await puppeteer.launch({ executablePath: '/root/.cache/puppeteer/chrome/linux-148.0.7778.97/chrome-linux64/chrome', headless: 'new', protocolTimeout: 300000, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage();
await page.setViewport({ width: 420, height: 420, deviceScaleFactor: 1 });
page.on('pageerror', (e) => console.log('pageerror', e.message));
await page.goto(`${base}/index.html?noti=1&clock=${process.env.CLOCK || 960}`, { waitUntil: 'networkidle0' });
await page.waitForFunction('window.ready');
await page.evaluate(() => game.peek(12, 24, 1));
await new Promise((r) => setTimeout(r, 1500));
const SHOTS = {
  exhaust: 'for (let i = 0; i < 70; i++) { f.exhaust(x - 0.9, 0.45, z, 1, 0, { dirty: false, speed: 6 }); f.update(1 / 30); for (let k = 0; k < 2; k++) f.update(1 / 60); }',
  junk: 'for (let i = 0; i < 70; i++) { f.exhaust(x - 0.9, 0.45, z, 1, 0, { dirty: true, speed: 6 }); f.update(1 / 20); }',
  turbo: 'f.boostStart(x - 0.9, 0.45, z, 1, 0, false); for (let i = 0; i < 9; i++) { f.turbo(x - 0.9, 0.45, z, 1, 0, 9, false); f.update(1 / 45); }',
  electric: 'for (let i = 0; i < 9; i++) { f.turbo(x - 0.9, 0.45, z, 1, 0, 9, true); f.update(1 / 45); }',
  hop: 'f.hopLand(x + 2, z, true); for (let i = 0; i < 9; i++) f.update(1 / 30);',
  splash: 'f.splash(x + 2.5, z, true); for (let i = 0; i < 7; i++) f.update(1 / 30);',
  crash: 'f.crash(x + 2.5, z, 1, 0); for (let i = 0; i < 6; i++) f.update(1 / 30);',
  cash: 'f.cash(x + 2, 1.2, z); for (let i = 0; i < 9; i++) f.update(1 / 30);',
  celebrate: 'f.celebrate(x + 3, z + 1.5, { stars: 5, tip: 9 }); for (let i = 0; i < 16; i++) f.update(1 / 30);',
  bump: 'f.bump(x + 2, z); for (let i = 0; i < 7; i++) f.update(1 / 30);',
  rain: 'for (let i = 0; i < 40; i++) { f.spray(x - 0.8, z, -4, 0); f.update(1 / 30); }',
  whoosh: 'f.whoosh(x, z, 1, 0, -1); f.whoosh(x, z, 1, 0, 1); for (let i = 0; i < 3; i++) f.update(1 / 30);',
};
for (const [name, code] of Object.entries(SHOTS)) {
  await page.evaluate((code) => {
    const f = game.ride.fx; f.clear();
    const p = game.ride.R.bike.root.position, x = p.x, z = p.z;
    // look at the scooter from the side, a little above
    game.camera.position.set(x + 2.2, 2.3, z + 6.5); game.camera.lookAt(x + 1.6, 0.9, z); game.camera.fov = 55; game.camera.updateProjectionMatrix();
    new Function('f', 'x', 'z', code)(f, x, z);
  }, code);
  await new Promise((r) => setTimeout(r, 900));
  await page.screenshot({ path: `${prefix}-${name}.png` });
  console.log('shot', name);
}
await browser.close(); server.close();

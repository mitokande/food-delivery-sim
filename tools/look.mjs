// Street-level screenshots for art work: rider's-eye views of a few streets (game.peek) + the hub.
//   node tools/look.mjs [prefix] [views]   views = comma list of names below (default: all)
//   env: CLOCK (minute of day, default 990), W, H, WAIT (ms per view)
import { createRequire } from 'node:module';
import { serve } from './serve.mjs';
const require = createRequire(import.meta.url);
let puppeteer;
try { puppeteer = require('puppeteer-core'); } catch { puppeteer = require('/root/.npm/_npx/110f701c48e68d66/node_modules/puppeteer-core'); }
const CHROME = process.env.CHROME || '/root/.cache/puppeteer/chrome/linux-148.0.7778.97/chrome-linux64/chrome';
const [prefix = 'tools/shots/look', only] = process.argv.slice(2);
const VIEWS = {
  oldtown: [-1, -1], oldtown2: [-1, -1], downtown: [-1, -1], downtown2: [-1, -1], harbor: [-1, -1], harbor2: [-1, -1], harborfront: [26, 44, 1], hills: [-1, -1],
};
const W = +(process.env.W || 390), H = +(process.env.H || 844);
const { server, base } = await serve();
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage();
await page.setViewport({ width: W, height: H, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(m.text()); if (process.env.LOG) console.log('[console]', m.text()); });
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
const t0 = Date.now();
await page.goto(`${base}/index.html?noti=1&energy=off&clock=${process.env.CLOCK || 990}`, { waitUntil: 'networkidle0', timeout: 240000 });
await page.waitForFunction('window.ready', { timeout: 120000 });
console.log('ready in', ((Date.now() - t0) / 1000).toFixed(1) + 's');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const names = only ? only.split(',') : ['hub', ...Object.keys(VIEWS)];
for (const n of names) {
  if (n === 'hub') { await sleep(1500); }
  else if (n.startsWith('ride')) {
    // a real delivery: take the first order, start, skip the camera move, ride a few seconds
    const secs = +(n.slice(4) || 4);
    await page.evaluate(() => document.querySelector('.ocard')?.click());
    await sleep(400);
    await page.evaluate(() => document.querySelector('#startbar .sb-go')?.click());
    await sleep(600);
    await page.evaluate(() => { game.skipTween(); document.querySelector('.modal.tip [data-x]')?.click(); });
    await sleep(800);
    await page.evaluate((s) => { document.querySelector('.modal.tip [data-x]')?.click(); game.sim(s); }, secs);
    await sleep(+(process.env.WAIT || 2500));
  }
  else if (n.startsWith('cam_')) {
    // cam_x_y_z_tx_ty_tz: free camera
    const [x, y, z, tx, ty, tz] = n.slice(4).split('_').map(Number);
    await page.evaluate((a) => { game.peek(22, 0, 1, { bike: false }); setTimeout(() => { game.camera.position.set(a[0], a[1], a[2]); game.camera.lookAt(a[3], a[4], a[5]); game.camera.fov = 55; game.camera.updateProjectionMatrix(); }, 300); }, [x, y, z, tx, ty, tz]);
    await sleep(+(process.env.WAIT || 2500));
  }
  else {
    let v = VIEWS[n] || n.split(':').map(Number);
    if (n.startsWith('rest-')) v = await page.evaluate((id) => {
      // stand on the restaurant's street a few tiles back, looking along the road so it is on the right
      const c = game.city, D = [[0, -1], [1, 0], [0, 2], [-1, 0]].map((d, i) => i === 2 ? [0, 1] : d);
      const r = c.restaurants.find((x) => x.id === id); const lot = c.lots[r.lot]; const door = c.tiles[lot.door];
      // travel direction with the lot on the right: right of heading h is DIRS[(h+1)&3]; lot is at -front from door
      for (let h = 0; h < 4; h++) { if (((h + 1) & 3) !== ((lot.front + 2) & 3)) continue; return [door.x - D[h][0] * 2, door.z - D[h][1] * 2, h]; }
      return [door.x, door.z, 1];
    }, n.slice(5));
    // find a straight road in the district with a long view ahead (k-th best)
    v = await page.evaluate((v, n) => {
      const c = game.city, D = [[0, -1], [1, 0], [0, 1], [-1, 0]];
      const isRoad = (x, z) => x >= 0 && z >= 0 && x < c.W && z < c.H && c.tiles[z * c.W + x].k === 1;
      const t0 = c.tiles[v[1] * c.W + v[0]];
      if (t0 && t0.k === 1 || n.startsWith('rest-')) return v;
      const want = n.replace(/\d+$/, ''), k = +(n.match(/\d+$/)?.[0] || 1) - 1;
      const cands = [];
      const inner = (t, d) => { const s = D[(d + 1) & 3]; const a = c.tiles[(t.z + s[1]) * c.W + t.x + s[0]], b = c.tiles[(t.z - s[1]) * c.W + t.x - s[0]]; return a && b && a.k !== 1 && b.k !== 1 && t.x > 0 && t.z > 0 && t.x < c.W - 1 && t.z < c.H - 1; };
      for (const t of c.tiles) if (t.k === 1 && t.piece === 'straight' && t.d === want) for (let d = 0; d < 4; d++) {
        if (!(t.mask & (1 << d)) || !inner(t, d)) continue;
        let run = 0; while (isRoad(t.x + D[d][0] * (run + 1), t.z + D[d][1] * (run + 1)) && run < 30) run++;
        cands.push([run, t.x, t.z, d]);
      }
      cands.sort((a, b) => b[0] - a[0] || a[1] - b[1] || a[2] - b[2]);
      const pick = cands[Math.min(cands.length - 1, k * 7)];
      return pick ? [pick[1], pick[2], pick[3]] : v;
    }, v, n);
    await page.evaluate((v) => game.peek(v[0], v[1], v[2]), v);
    if (n.startsWith('rest-')) await page.evaluate((id) => {
      // look straight at the shopfront from across the street
      const c = game.city, T = 10, D = [[0, -1], [1, 0], [0, 1], [-1, 0]];
      const r = c.restaurants.find((x) => x.id === id); const lot = c.lots[r.lot]; const door = c.tiles[lot.door];
      const f = D[lot.front];
      const tx = door.x * T - f[0] * 5, tz = door.z * T - f[1] * 5;
      game.camera.position.set(door.x * T + f[0] * 9 + f[1] * 6, 3.2, door.z * T + f[1] * 9 - f[0] * 6);
      game.camera.lookAt(tx, 6, tz); game.camera.fov = 70; game.camera.updateProjectionMatrix();
    }, n.slice(5));
    await sleep(+(process.env.WAIT || 2500));
  }
  if (process.env.EVAL) { await page.evaluate(process.env.EVAL); await sleep(1200); }
  const info = await page.evaluate(() => ({ calls: game.renderer.info.render.calls, tris: game.renderer.info.render.triangles }));
  await page.screenshot({ path: `${prefix}-${n.replace(/:/g, '_')}.png` });
  console.log('shot', n, JSON.stringify(info));
}
console.log('errors', errors.length ? [...new Set(errors)].slice(0, 12).join('\n') : 'none');
await browser.close(); server.close();

// Layout sweep: hub tabs, ride HUD and modals at phone/tablet sizes. Reports UI that spills off screen,
// clipped button text and ride buttons overlapping each other.  node tools/sweep.mjs [WxH,...]   env SHOTS=1
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { serve } from './serve.mjs';
const require = createRequire(import.meta.url);
let puppeteer;
try { puppeteer = require('puppeteer-core'); } catch { puppeteer = require('/root/.npm/_npx/110f701c48e68d66/node_modules/puppeteer-core'); }
const CHROME = process.env.CHROME || '/root/.cache/puppeteer/chrome/linux-148.0.7778.97/chrome-linux64/chrome';
const sizes = (process.argv[2] || '360x640,375x667,390x844,412x915,430x932,360x560,844x390,768x1024,1280x720').split(',').map((s) => s.split('x').map(Number));
const SAVE = JSON.stringify({ v: 1, cash: 12450, xp: 400, lvl: 7, skills: { riding: 2, navigation: 1, charm: 1, reflexes: 0, stamina: 0 }, districts: { oldtown: true, downtown: true, harbor: true },
  stats: { deliveries: 60 }, seen: { rideTip: 1, manualTip: 1 }, active: 'vespetta', vehicles: { rustbucket: { parts: { engine: 2, suspension: 1, box: 0, tires: 0 }, count: 1 }, vespetta: { parts: { engine: 1, suspension: 0, box: 0, tires: 0 }, count: 2 } },
  fleet: { office: true, level: 1, couriers: [{ id: 'x1', name: 'Mert', char: 'male-c', skill: 2, veh: 'rustbucket', own: true, ownVeh: 'rustbucket', district: 'oldtown' }, { id: 'x2', name: 'Zeynep', char: 'female-a', skill: 4, veh: 'vespetta', own: false, district: 'downtown' }], last: Date.now(), bank: 42, applicants: [{ id: 'a1', name: 'Lena', char: 'female-b', skill: 2, fee: 180, ownVeh: 'rustbucket' }] } });
const { server, base } = await serve();
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const screens = {
  city: () => { game.ui.setTab('city'); document.querySelectorAll('.ocard')[1]?.click(); },
  scrolled: () => { const b = document.querySelector('.sheet-body'); b.scrollTop = 99999; document.querySelector('.ocard:not(.taken)')?.click(); return b.scrollTop; },
  garage: () => game.ui.setTab('garage'),
  courier: () => game.ui.setTab('courier'),
  jobs: () => game.ui.setTab('jobs'),
  fleet: () => game.ui.setTab('fleet'),
  ride: () => { game.ui.setTab('city'); document.querySelector('.ocard')?.click(); game.startJob(); return 1; },
  event: () => { game.testEvent('granny', 1); game.sim(0.4); },
  receipt: () => { game.ui.receipt({ lines: [{ label: 'Sunny Burger → Emma ★★★★★', amount: 12 }, { label: 'Tip from Emma', amount: 3.5, cls: 'pos' }, { label: 'Fuel (0.42 km)', amount: -0.46, cls: 'neg' }], total: 15.04, xp: 34, avgStars: 5, goals: '1 goal done!' }); },
};
let bad = 0;
for (const [w, h] of sizes) {
  const page = await browser.newPage();
  const touch = w < 700 || h > w;
  await page.setViewport({ width: w, height: h, isMobile: touch, hasTouch: touch, deviceScaleFactor: 1 });
  await page.evaluateOnNewDocument((s) => localStorage.setItem('fds_save_v1', s), SAVE);
  await page.goto(`${base}/index.html?noti=1`, { waitUntil: 'networkidle0', timeout: 180000 });
  await page.waitForFunction('window.ready', { timeout: 90000, polling: 200 });
  await page.evaluate(() => document.querySelectorAll('.modal').forEach((m) => m.remove()));
  for (const [name, fn] of Object.entries(screens)) {
    await page.evaluate(`(${fn})()`);
    if (name === 'ride') { await sleep(1500); await page.evaluate(() => game.skipTween()); await page.waitForFunction(() => game.mode === 'ride', { timeout: 60000, polling: 200 }); await sleep(800); }
    else await sleep(500);
    const issues = await page.evaluate(() => {
      const out = [];
      const W = innerWidth, H = innerHeight;
      const vis = (el) => { const s = getComputedStyle(el); const r = el.getBoundingClientRect(); return s.display !== 'none' && s.visibility !== 'hidden' && r.width > 0 && r.height > 0 && !el.closest('[hidden]'); };
      const nm = (el) => el.id ? '#' + el.id : '.' + String(el.className).split(' ').filter(Boolean).join('.');
      for (const el of document.querySelectorAll('#startbar, .sb-go, .topbar > *, .tabs button, .sheet, .r-top > *, .r-btn, .r-map, .r-speed, .ctx, .modal .card, .modal .btn, .clockbar > *')) {
        if (!vis(el)) continue;
        const r = el.getBoundingClientRect();
        if (r.left < -1 || r.top < -1 || r.right > W + 1 || r.bottom > H + 1) out.push(`${nm(el)} off screen [${r.left | 0},${r.top | 0},${r.right | 0},${r.bottom | 0}]`);
      }
      for (const el of document.querySelectorAll('button, .oinfo b, .r-what b, .res b')) {
        if (!vis(el) || el.closest('.vcards, .marker, .r-btn')) continue;
        if (el.scrollWidth > el.clientWidth + 2 && getComputedStyle(el).textOverflow !== 'ellipsis') out.push(`text clipped in ${nm(el)}: "${el.textContent.trim().slice(0, 24)}"`);
      }
      const rb = [...document.querySelectorAll('#ridehud .r-btn, #ridehud .r-speed, #ridehud .ctx, #ridehud .r-map, #ridehud .r-top > *')].filter(vis);
      for (let i = 0; i < rb.length; i++) for (let j = i + 1; j < rb.length; j++) {
        const a = rb[i].getBoundingClientRect(), b = rb[j].getBoundingClientRect();
        if (a.left < b.right - 2 && a.right > b.left + 2 && a.top < b.bottom - 2 && a.bottom > b.top + 2) out.push(`overlap ${nm(rb[i])} × ${nm(rb[j])}`);
      }
      if (document.documentElement.scrollWidth > W + 1) out.push('page scrolls sideways');
      return [...new Set(out)];
    });
    if (issues.length) bad++;
    console.log(`${String(w + 'x' + h).padEnd(9)} ${name.padEnd(8)} ${issues.length ? issues.join('; ') : 'ok'}`);
    if (process.env.SHOTS) await page.screenshot({ path: `tools/shots/sw-${w}x${h}-${name}.png` });
    if (name === 'event' || name === 'receipt') await page.evaluate(() => document.querySelectorAll('.modal').forEach((m) => m.remove()));
  }
  await page.close();
}
console.log(bad ? `${bad} screens with issues` : 'all clear');
await browser.close(); server.close();

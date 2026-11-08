// Idle + manager mode (idle.html): boot, the 3D city as a living map, the loop. Rules: econ.js; interface: ui.js.
// The city, its traffic, sky, weather and the courier bikes are the courier game's own modules; nothing here reads or
// writes the courier game's save.
import * as THREE from 'three';
import { generateCity } from '../city/gen.js';
import { buildCityView, waterTime, cullChunks, setCityNight, lampUni, cityMaterials } from '../city/view.js';
import { createWeather, W as WEATHER } from '../weather.js';
import { createTraffic, createPeds } from '../city/traffic.js';
import { createProps, toyUni } from '../city/props.js';
import { bakePeople, peopleSpots } from '../city/people.js';
import { createBackdrop } from '../city/backdrop.js';
import { createTrain } from '../city/train.js';
import { carUni } from '../city/cars.js';
import { createSky } from '../sky.js';
import { installGrade, makeEnvironment, setEnvNight } from '../look.js';
import { createHubCamera, createMarkers } from '../hub.js';
import { setProgress } from '../assets.js';
import { makeBike } from '../ride/vehicle.js';
import { createAudio } from '../audio.js';
import { S as courierSave } from '../state.js'; // (audio.js reads its volumes from there: set in memory, never saved)
import { TILE, FOODS, CHAR_IDS } from '../data.js';
import * as E from './econ.js';
import { createIdleUI, ICON } from './ui.js';

window.__started = true;
const q = new URLSearchParams(location.search);
const isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;

// ---------------------------------------------------------------- the save (its own key)
let G = E.fresh();
let fresh = true;
try {
  const raw = q.has('fresh') ? null : localStorage.getItem(E.KEY);
  if (raw) { const d = JSON.parse(raw); const f = E.fresh(); G = { ...f, ...d, settings: { ...f.settings, ...d.settings }, seen: { ...d.seen } }; fresh = false; }
} catch (e) { console.warn('idle save load failed', e); }
const save = () => { G.last = Date.now(); try { localStorage.setItem(E.KEY, JSON.stringify(G)); } catch { /* private mode */ } };

// ---------------------------------------------------------------- renderer + city (as the courier game's hub)
const canvas = document.getElementById('gl');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap;
installGrade(renderer);
const scene = new THREE.Scene();
makeEnvironment(renderer);
const camera = new THREE.PerspectiveCamera(30, 1, 1, 5000);
function quality() {
  const qv = G.settings.quality === 'auto' ? (isTouch ? 'medium' : 'high') : G.settings.quality;
  renderer.setPixelRatio(Math.min(devicePixelRatio, qv === 'low' ? 1 : qv === 'medium' ? 1.5 : 2));
  renderer.shadowMap.enabled = qv !== 'low';
  return qv;
}
let QV = quality();
function resize() { renderer.setSize(innerWidth, innerHeight, false); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); }
addEventListener('resize', resize); resize();

const fill = document.getElementById('boot-fill'), bootMsg = document.getElementById('boot-msg');
setProgress((f) => { fill.style.width = Math.round(10 + f * 70) + '%'; });
bootMsg.textContent = 'Opening the dispatch office…';
const sky = createSky(scene);
sky.sun.shadow.mapSize.set(QV === 'high' ? 2048 : 1024, QV === 'high' ? 2048 : 1024);
const city = generateCity();
const view = await buildCityView(city, scene);
const people = await bakePeople(peopleSpots(view.arch.props));
const props = await createProps(scene, [...view.arch.props, ...people.list], { extra: people.extra });
const backdrop = await createBackdrop(scene, city, sky);
const train = await createTrain(scene);
bootMsg.textContent = 'Waking up the kitchens…';
const traffic = await createTraffic(city, scene);
const peds = await createPeds(city, scene, { count: isTouch ? 8 : 12, ids: isTouch ? ['female-c', 'male-e', 'female-d', 'male-c', 'female-a'] : undefined });
const weather = createWeather(scene, cityMaterials);
cullChunks(view, 0, 0, null);
fill.style.width = '88%';

const audio = createAudio();
const applyVolumes = () => { courierSave.settings.music = G.settings.music; courierSave.settings.sfx = G.settings.sfx; audio.apply?.(); };
applyVolumes();
addEventListener('pointerdown', () => { if (!audio.ready) { audio.init(); applyVolumes(); audio.loop('music', 'music-hub'); } }, { capture: true });

const hubCam = createHubCamera(camera, canvas, city);
const markers = createMarkers(document.getElementById('markers'), camera);
const DCENTER = { downtown: [11, 9], hills: [33, 9], oldtown: [9, 31], harbor: [31, 31] };
const restLot = Object.fromEntries(city.restaurants.map((r) => [r.id, city.lots[r.lot]]));

// ---------------------------------------------------------------- the game object (what ui.js calls)
const game = {
  G, audio,
  save,
  changed: () => { save(); ui.render(); syncMap(); },
  focusDistrict(d) { const c = DCENTER[d]; hubCam.lookAt(c[0] * TILE, c[1] * TILE + 40, 420); },
  applySettings() { applyVolumes(); const nq = quality(); if (nq !== QV) { QV = nq; resize(); } },
  reset() { try { localStorage.removeItem(E.KEY); } catch { /* fine */ } location.reload(); },
  // a purchase or a tap from the sheet; returns what the economy said
  act(a, id, amt = 1, el) {
    let r = false;
    if (a === 'cook') { r = E.cook(G, id); if (r) audio.play('ui-tap'); else if (E.hasMgr(G, E.IREST_BY[id].district)) ui.toast('Your manager keeps this kitchen cooking'); return r; }
    if (a === 'cookall') { let n = 0; for (const x of E.restOf(id)) if (E.cook(G, x.id)) n++; if (n) audio.play('ui-tap'); return n; }
    if (a === 'surge') { r = E.surge(G, id); if (r) { audio.play('pickup-bonus'); ui.toast(`${ICON('ui-nitro')} Surge! ×${E.SURGE.mult} in ${E.IDIST[id].name}`, 'warn'); ui.live(); save(); } return r; }
    if (a === 'lvl') r = E.levelUp(G, id, amt);
    else if (a === 'partner') r = E.partner(G, id);
    else if (a === 'hire') r = E.hire(G, id, amt);
    else if (a === 'veh') r = E.upgradeVehicle(G, id);
    else if (a === 'mgr') r = E.hireManager(G, id);
    else if (a === 'unlock') r = E.unlock(G, id);
    else if (a === 'deal') r = E.buyDeal(G, id);
    else if (a === 'office') r = E.upgradeOffice(G);
    else if (a === 'franchise') r = E.franchise(G);
    if (!r) { audio.play('ui-error'); ui.toast('Not enough cash', 'bad'); return false; }
    // feedback: a milestone, a new partner, a manager…
    if (a === 'lvl') { const L = E.level(G, id), before = L - r; if (E.msCount(L) > E.msCount(before)) { audio.play('ui-levelup'); ui.toast(`${ICON(FOODS[E.IREST_BY[id].food].icon)} ${E.IREST_BY[id].name}: orders ×2!`, 'good'); } else audio.play('ui-purchase', { vol: 0.6 }); }
    else if (a === 'partner') { audio.play('ui-levelup'); ui.toast(`${ICON(FOODS[E.IREST_BY[id].food].icon)} ${E.IREST_BY[id].name} joined!`, 'good'); }
    else if (a === 'mgr') { const m = G.dist[id].mgr; audio.play('ui-levelup'); ui.toast(`${ICON('char-' + m.char)} ${m.name} runs ${E.IDIST[id].name} now`, 'good'); }
    else if (a === 'unlock') { audio.play('ui-levelup'); ui.toast(`${ICON('ui-building')} ${E.IDIST[id].name} is open!`, 'good'); }
    else if (a === 'franchise') { audio.play('crowd-cheer'); ui.toast(`${ICON('ui-star')} +${r} Stars! A new branch opens`, 'good'); ui.selectDistrict('oldtown'); }
    else audio.play('ui-purchase');
    if (el && a !== 'franchise') coinsFrom(el);
    game.changed();
    return r;
  },
};
const ui = createIdleUI(game);
game.ui = ui;
function coinsFrom(el) {
  el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump');
}

// ---------------------------------------------------------------- the map: kitchens, locked districts, popups, bubbles
const mk = {}; // restaurant id → marker
function syncMap() {
  markers.clear();
  for (const k in mk) delete mk[k];
  for (const r of E.IREST) {
    const lot = restLot[r.id]; if (!lot) continue;
    const open = !!G.dist[r.district], L = E.level(G, r.id);
    if (!open) continue;
    const m = markers.add({ x: lot.cx * TILE, y: 22, z: lot.cz * TILE, cls: `mk ik ${L ? '' : 'dim'}`,
      html: `<span class="bub" style="--mc:${r.color}"><i class="ring"></i>${ICON(FOODS[r.food].icon)}${L ? `<i class="cnt">${L}</i>` : `<i class="cnt buy">+</i>`}</span>${L ? '' : `<em class="price">${E.money(r.c)}</em>`}`,
      onTap: () => {
        ui.selectDistrict(r.district, false);
        if (ui.tab !== 'kitchens') ui.setTab('kitchens');
        if (!L) { const row = document.querySelector(`.irow[data-id="${r.id}"]`); row?.scrollIntoView({ block: 'center', behavior: 'smooth' }); return; }
        if (!E.hasMgr(G, r.district)) game.act('cook', r.id);
      } });
    mk[r.id] = m;
  }
  for (const d of E.DISTRICTS) {
    if (G.dist[d.id]) continue;
    const prev = E.DISTRICTS[E.IDIST[d.id].i - 1];
    if (!G.dist[prev.id]) continue;
    const [x, z] = DCENTER[d.id];
    markers.add({ x: x * TILE, y: 40, z: z * TILE, cls: 'mk lock', html: `<span class="bub">${ICON('ui-lock')} ${d.name}<small>License ${E.money(E.IDIST[d.id].unlock)}</small></span>`,
      onTap: () => { ui.setTab('kitchens'); document.querySelector(`[data-act="unlock"][data-id="${d.id}"]`)?.click(); } });
  }
  if (bubble) bubble.m = markers.add({ x: bubble.x, y: 34, z: bubble.z, cls: 'mk bigorder', html: `<span class="bub">${ICON('ui-package')}<b>BIG ORDER</b><small>${E.money(bubble.amount)}</small></span>`, onTap: takeBubble });
  syncBikes();
}
// "+$12" over a kitchen when a batch pays (at most one every 0.7 s per kitchen; the rest add up)
const popAcc = {};
function pop(id, amount) {
  const a = (popAcc[id] ||= { sum: 0, t: 0 });
  a.sum += amount;
  const now = performance.now();
  if (now - a.t < 700) return;
  a.t = now;
  const lot = restLot[id], n = a.sum; a.sum = 0;
  if (!lot || document.hidden) return;
  const m = markers.add({ x: lot.cx * TILE, y: 30, z: lot.cz * TILE, cls: 'mk paypop', html: `<b>+${E.money(n)}</b>` });
  m.el.style.pointerEvents = 'none';
  setTimeout(() => { m.el.remove(); const i = markers.list.indexOf(m); if (i >= 0) markers.list.splice(i, 1); }, 1100);
}

// big orders: now and then a gold bubble pops up over a kitchen; a tap takes it (about 40 s of income)
let bubble = null, bubbleT = 25 + Math.random() * 20;
function spawnBubble() {
  const open = E.IREST.filter((r) => E.level(G, r.id) && restLot[r.id]);
  if (!open.length) return;
  const r = open[Math.floor(Math.random() * open.length)], lot = restLot[r.id];
  const amount = Math.max(20, Math.round(Math.max(E.incomePerSec(G), E.potentialPerSec(G, r.district) * 0.5) * 40));
  bubble = { id: r.id, x: lot.cx * TILE, z: lot.cz * TILE, amount, until: performance.now() + 20000 };
  bubble.m = markers.add({ x: bubble.x, y: 34, z: bubble.z, cls: 'mk bigorder', html: `<span class="bub">${ICON('ui-package')}<b>BIG ORDER</b><small>${E.money(amount)}</small></span>`, onTap: takeBubble });
  audio.play('notif-order', { vol: 0.6 });
}
function dropBubble() {
  if (!bubble) return;
  bubble.m?.el.remove(); const i = markers.list.indexOf(bubble.m); if (i >= 0) markers.list.splice(i, 1);
  bubble = null; bubbleT = 45 + Math.random() * 45;
}
function takeBubble() {
  if (!bubble) return;
  E.earn(G, bubble.amount);
  audio.play('ui-coins');
  ui.toast(`${ICON('ui-package')} Big order delivered! +${E.money(bubble.amount)}`, 'good');
  dropBubble(); save(); ui.live();
}

// ---------------------------------------------------------------- couriers on the streets: a few bikes per district
const bikes = new Map(); // key → { bike, agent }
const bikeKey = new Map(); // district → key it was built for
async function syncBikes() {
  for (const d of E.DISTRICTS) {
    const s = G.dist[d.id];
    const n = s ? Math.min(4, 1 + Math.floor(Math.log2(s.n))) : 0;
    const key = s ? `${n}|${s.veh}` : '';
    if (bikeKey.get(d.id) === key) continue;
    bikeKey.set(d.id, key);
    for (const [k, b] of bikes) if (k.startsWith(d.id + '|')) { if (b.agent) traffic.removeAgent(b.agent); b.bike?.root.removeFromParent(); bikes.delete(k); }
    for (let i = 0; i < n; i++) {
      const k = `${d.id}|${key}|${i}`;
      bikes.set(k, {});
      const bike = await makeBike(E.VEH_LIST[s.veh], { char: CHAR_IDS[(i * 5 + d.id.length) % CHAR_IDS.length], helmet: ['#2ec4b6', '#f2a541', '#2f6fd6', '#43b34a'][i % 4] });
      if (!bikes.has(k) || bikeKey.get(d.id) !== key) continue; // (changed again while it loaded)
      scene.add(bike.root);
      const agent = traffic.addRider(bike.root, d.id, (dt, v, dh) => bike.update(dt, v, THREE.MathUtils.clamp(dh * 6, -0.4, 0.4)));
      bikes.set(k, { bike, agent });
    }
  }
}

// ---------------------------------------------------------------- hub view offset: the map sits in the space the sheet leaves
const vo = { x: 0, y: 0 };
const sheetEl = document.getElementById('sheet'), topEl = document.querySelector('.topbar');
function updateViewOffset(dt) {
  const W = innerWidth, H = innerHeight, r = sheetEl.getBoundingClientRect(), top = topEl.getBoundingClientRect().bottom + 30;
  let tx = 0, ty = 0;
  if (r.width > W * 0.8) ty = H / 2 - (top + r.top) / 2; else tx = -(r.right + 10) / 2;
  const k = 1 - Math.exp(-dt * 8);
  vo.x += (tx - vo.x) * k; vo.y += (ty - vo.y) * k;
  camera.setViewOffset(W, H, vo.x, vo.y, W, H);
}
// adaptive quality (auto): step down on slow frames
const perf = { acc: 0, n: 0, step: 0 };
function adapt(dt) {
  if (G.settings.quality !== 'auto') return;
  perf.acc += dt; perf.n++;
  if (perf.acc < 4) return;
  const ms = perf.acc / perf.n * 1000; perf.acc = 0; perf.n = 0;
  if (ms > 38 && perf.step < 3) {
    perf.step++;
    if (perf.step === 1) renderer.setPixelRatio(Math.min(devicePixelRatio, 1.15));
    if (perf.step === 2) { renderer.setPixelRatio(1); sky.sun.shadow.mapSize.set(1024, 1024); sky.sun.shadow.map?.dispose(); sky.sun.shadow.map = null; }
    if (perf.step === 3) { renderer.shadowMap.enabled = false; scene.traverse((o) => { if (o.material) o.material.needsUpdate = true; }); }
    resize();
  }
}

// ---------------------------------------------------------------- boot finish
const oc = DCENTER.oldtown;
hubCam.snap(oc[0] * TILE, oc[1] * TILE + 40, 420);
document.body.dataset.mode = 'hub'; // (game.css places toasts and markers by mode)
ui.setTab('kitchens');
syncMap();
sky.set(G.clock);
fill.style.width = '100%';
document.getElementById('boot').classList.add('out');
async function comeBack() {
  const off = E.offline(G);
  if (off && off.gain >= 1) { await ui.offline(off); E.collectOffline(G, off); audio.play('ui-coins'); save(); ui.render(); }
}

// ---------------------------------------------------------------- loop
const timer = new THREE.Timer();
let lastNight = -1, liveT = 0, saveT = 0;
function frame() {
  timer.update();
  const raw = timer.getDelta(), dt = Math.min(0.05, raw);
  waterTime.value += dt; toyUni.uTime.value += dt; backdrop.update(dt); train.update(dt);
  traffic.update(dt);
  hubCam.update(dt);
  updateViewOffset(dt);
  const fx = hubCam.st.x, fz = hubCam.st.z;
  peds.update(dt, fx, fz, 160);
  props.update(fx, fz, Math.min(260, Math.max(120, hubCam.st.dist * 0.95)));
  sky.focus(fx, fz, Math.min(900, hubCam.st.dist * 1.7), camera);
  weather.update(dt, G.clock, G.day, camera);
  sky.state.rain = weather.rain; sky.set(G.clock);
  scene.fog.near = hubCam.st.dist * 1.6 * (1 - 0.3 * weather.rain); scene.fog.far = hubCam.st.dist * 5.5 * (1 - 0.3 * weather.rain);
  if (sky.state.night !== lastNight) { lastNight = sky.state.night; setCityNight(lastNight); props.setNight(lastNight); carUni.uNight.value = lastNight; lampUni.uNight.value = lastNight; renderer.toneMappingExposure = 1.0 + lastNight * 0.25; setEnvNight(lastNight); }
  const amb = weather.rain > 0.3 ? 'amb-rain' : null;
  if (amb !== game.amb && audio.ready) { game.amb = amb; audio.loop('amb', amb); }

  // the economy
  G.rain = WEATHER.rain > 0.35;
  for (const p of E.tick(G, Math.min(1, raw))) pop(p.id, p.pay); // (real time, so a slow phone earns the same; longer gaps are the offline path)
  for (const id in mk) {
    const m = mk[id], cooking = E.cooking(G, id);
    m.el.style.setProperty('--p', cooking ? (G.prog[id] || 0).toFixed(3) : 0);
    m.el.classList.toggle('idle', !cooking && E.level(G, id) > 0);
  }
  if (bubble) { if (performance.now() > bubble.until) dropBubble(); }
  else if ((bubbleT -= dt) <= 0) spawnBubble();
  markers.update(innerWidth, innerHeight);
  liveT += dt; if (liveT > 0.1) { liveT = 0; ui.live(); }
  saveT += dt; if (saveT > 5) { saveT = 0; save(); }
  adapt(dt);
  renderer.render(scene, camera);
}
renderer.setAnimationLoop(frame);
document.addEventListener('visibilitychange', () => { if (document.hidden) save(); else comeBack(); });
addEventListener('pagehide', save);
window.game = Object.assign(game, { scene, camera, renderer, hubCam, markers, E, traffic });
window.ready = true;
// (the loop runs under these cards)
if (fresh) { G.last = Date.now(); save(); if (!q.has('noti')) ui.welcome(); }
else comeBack();

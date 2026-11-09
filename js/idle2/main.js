// Hot Chain (idle2.html): boot, the 3D city as the board, couriers riding real routes, the loop.
// Rules: sim.js (pure); interface: ui.js. The city, traffic, sky and weather are the courier game's own modules;
// nothing here reads or writes the courier game's save or the first idle prototype's.
import * as THREE from 'three';
import { generateCity, DIRS } from '../city/gen.js';
import { buildCityView, waterTime, cullChunks, setCityNight, lampUni, cityMaterials } from '../city/view.js';
import { createWeather } from '../weather.js';
import { createTraffic, createPeds } from '../city/traffic.js';
import { createProps, toyUni } from '../city/props.js';
import { bakePeople, peopleSpots } from '../city/people.js';
import { createBackdrop } from '../city/backdrop.js';
import { createTrain } from '../city/train.js';
import { carUni } from '../city/cars.js';
import { buildRoute, sampleRoute } from '../city/graph.js';
import { createSky } from '../sky.js';
import { installGrade, makeEnvironment, setEnvNight } from '../look.js';
import { createHubCamera, createMarkers } from '../hub.js';
import { setProgress } from '../assets.js';
import { makeBike } from '../ride/vehicle.js';
import { createAudio } from '../audio.js';
import { S as courierSave } from '../state.js'; // (audio.js reads its volumes from there: set in memory, never saved)
import { TILE, FOODS, RESTAURANTS } from '../data.js';
import * as S from './sim.js';
import { createChainUI, ICON } from './ui.js';

window.__started = true;
const q = new URLSearchParams(location.search);
const isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
const SPEED = Math.max(0.25, Math.min(20, +(q.get('speed') || 1)));

// ---------------------------------------------------------------- the save (its own key)
let G = S.fresh();
let fresh = true;
try {
  const raw = q.has('fresh') ? null : localStorage.getItem(S.KEY);
  if (raw) {
    const d = JSON.parse(raw);
    if (d && d.v === 1 && d.stage === S.STAGE.id) { const f = S.fresh(); G = { ...f, ...d, settings: { ...f.settings, ...d.settings }, seen: { ...d.seen } }; fresh = false; }
  }
} catch (e) { console.warn('idle2 save load failed', e); }
const save = () => { try { localStorage.setItem(S.KEY, JSON.stringify(G)); } catch { /* private mode */ } };

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
bootMsg.textContent = 'Opening the kitchens…';
const sky = createSky(scene);
sky.sun.shadow.mapSize.set(QV === 'high' ? 2048 : 1024, QV === 'high' ? 2048 : 1024);
const city = generateCity();
const W = S.createWorld(city);
const view = await buildCityView(city, scene);
const people = await bakePeople(peopleSpots(view.arch.props));
const props = await createProps(scene, [...view.arch.props, ...people.list], { extra: people.extra });
const backdrop = await createBackdrop(scene, city, sky);
const train = await createTrain(scene);
bootMsg.textContent = 'Fuelling the scooters…';
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
const lotPos = (lot, y = 0) => [lot.cx * TILE, y, lot.cz * TILE];
const doorPos = (tile) => [city.tiles[tile].x * TILE, city.tiles[tile].z * TILE];
const KCOLOR = Object.fromEntries(RESTAURANTS.map((r) => [r.id, r.color]));
const KNAME = Object.fromEntries(RESTAURANTS.map((r) => [r.id, r.name]));
const KFOOD = Object.fromEntries(RESTAURANTS.map((r) => [r.id, r.food]));

// ---------------------------------------------------------------- the game object (what ui.js calls)
const game = {
  G, W, S, audio, save, paused: false,
  act(a, id, el) {
    const r = S.act(G, a, id, W);
    if (!r) { audio.play('ui-error'); ui.toast('Not enough cash', 'bad'); return false; }
    if (a === 'partner') { audio.play('ui-levelup'); ui.toast(`${ICON(FOODS[KFOOD[id]].icon)} ${KNAME[id]} joined! Orders start coming in`, 'good'); }
    else if (a === 'hire') { const c = G.couriers[G.couriers.length - 1]; audio.play('ui-purchase'); ui.toast(`${ICON('char-' + c.char)} ${c.name} joins on a ${S.VEH[c.veh].name}`, 'good'); }
    else if (a === 'stand') { audio.play('ui-unlock'); ui.toast(`${ICON('ui-route')} The courier stand moved: ${W.standOf(id).name}`, 'good'); }
    else if (a === 'bags' || a === 'lamp') { audio.play('ui-levelup'); ui.toast(`${ICON('ui-thermo')} ${a === 'bags' ? 'Thermal bags for every courier' : `${KNAME[id]}: heat lamp on the shelf`}`, 'good'); }
    else audio.play('ui-purchase', { vol: 0.7 });
    if (el) { el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump'); }
    game.changed();
    return true;
  },
  changed() { save(); ui.render(); syncMap(); },
  focusKitchen(id) { const l = W.kitchenLot[id]; if (l) hubCam.lookAt(l.cx * TILE, l.cz * TILE + 30, Math.min(hubCam.st.dist, 360)); },
  focusStand() { const l = W.standOf(G.stand).lot; hubCam.lookAt(l.cx * TILE, l.cz * TILE + 30, Math.min(hubCam.st.dist, 360)); },
  applySettings() { applyVolumes(); const nq = quality(); if (nq !== QV) { QV = nq; resize(); } },
  newDay() { G = S.replay(G); game.G = G; ui.setG(G); for (const [, b] of bikes) b.bike?.root.removeFromParent(); bikes.clear(); pins.clear(); save(); game.changed(); ui.toast(`${ICON('ui-sun')} A new day in Old Town`, 'good'); },
  reset() { try { localStorage.removeItem(S.KEY); } catch { /* fine */ } location.reload(); },
};
const ui = createChainUI(game);
game.ui = ui;

// ---------------------------------------------------------------- the map: kitchens, the stand, orders at the doors
const mk = {}; // kitchen id → marker
let standMk = null;
function syncMap() {
  markers.clear();
  for (const k in mk) delete mk[k];
  pins.clear();
  for (const id of S.KIDS) {
    const lot = W.kitchenLot[id]; if (!lot) continue;
    const k = G.kit[id], info = S.STAGE.kitchens[id];
    const [x, , z] = lotPos(lot);
    const html = k
      ? `<span class="bub" style="--mc:${KCOLOR[id]}"><i class="ring"></i>${ICON(FOODS[KFOOD[id]].icon)}<i class="cnt">${k.cooks}</i></span><span class="kst"><i class="kq" hidden></i><span class="shelf"></span></span>`
      : `<span class="bub">${ICON(FOODS[KFOOD[id]].icon)}<i class="cnt buy">+</i></span><em class="price">${S.money(info.partner)}</em>`;
    mk[id] = markers.add({ x, y: 22, z, cls: `mk ik ck ${k ? '' : 'dim'}`, html, onTap: () => { ui.showKitchen(id); } });
  }
  const sp = W.standOf(G.stand), [sx, , sz] = lotPos(sp.lot);
  standMk = markers.add({ x: sx, y: 16, z: sz, cls: 'mk stand', html: `<span class="bub">${ICON('ui-route')}<i class="cnt idle">0</i></span><em class="sname">Stand</em>`, onTap: () => ui.setTab('fleet') });
  // other stand spots, while the Couriers tab is open
  if (ui.open && ui.tab === 'fleet') {
    for (const s of W.stands) {
      if (s.id === G.stand) continue;
      const [x, , z] = lotPos(s.lot);
      markers.add({ x, y: 12, z, cls: 'mk spot', html: `<span class="bub">${ICON('ui-route')}</span><em class="price">Move ${S.money(S.MOVE_STAND)}</em>`, onTap: () => game.act('stand', s.id) });
    }
  }
}
ui.onTab = () => syncMap();

// orders: a pin at each waiting door (grey while the food is cooking, coloured by heat once it's on a bike)
const pins = new Map(); // order id → marker
pins.clear = (() => { const c = Map.prototype.clear; return function () { for (const [, m] of this) { m.el.remove(); const i = markers.list.indexOf(m); if (i >= 0) markers.list.splice(i, 1); } c.call(this); }; })();
function dropPin(id) {
  const m = pins.get(id); if (!m) return;
  m.el.remove(); const i = markers.list.indexOf(m); if (i >= 0) markers.list.splice(i, 1);
  pins.delete(id);
}
function syncPins() {
  for (const [id] of pins) if (!G.orders[id]) dropPin(id);
  for (const id in G.orders) {
    const o = G.orders[id];
    let m = pins.get(+id);
    if (!m) {
      const [x, z] = doorPos(o.door);
      m = markers.add({ x, y: 4, z, cls: 'mk pin wait', html: `<span class="pdot">${ICON(FOODS[KFOOD[o.k]].icon)}</span>` });
      m.el.tabIndex = -1; m.el.style.pointerEvents = 'none';
      pins.set(+id, m);
    }
    const cls = o.st === 'b' ? S.heatClass(o.heat) : 'wait';
    if (m.el.dataset.h !== cls) { m.el.dataset.h = cls; m.el.className = `marker mk pin ${cls}`; }
  }
}
// "+$24" over the door when an order is paid (hot: orange, warm: white, cold: blue)
function pop(door, text, cls) {
  if (document.hidden) return;
  const [x, z] = doorPos(door);
  const m = markers.add({ x, y: 10, z, cls: `mk paypop ${cls}`, html: `<b>${text}</b>` });
  m.el.style.pointerEvents = 'none';
  setTimeout(() => { m.el.remove(); const i = markers.list.indexOf(m); if (i >= 0) markers.list.splice(i, 1); }, 1100);
}

// ---------------------------------------------------------------- couriers on the streets: one bike each, on its route
const bikes = new Map(); // courier id → { bike, key, route, h }
const MAXB = isTouch ? 16 : 24;
const routes = new Map();
const routeFor = (a, b) => { const key = a * 4096 + b; let r = routes.get(key); if (!r) { r = buildRoute(city, W.path(a, b)); routes.set(key, r); } return r; };
const HELMETS = ['#2ec4b6', '#f2a541', '#2f6fd6', '#43b34a', '#e8432f', '#9b5de5'];
let loading = 0;
const out = [0, 0, 0, 0, 0];
function drawBikes(dt) {
  const sp = W.standOf(G.stand).lot, f = DIRS[sp.front], r = DIRS[(sp.front + 1) & 3];
  let parked = 0;
  for (const c of G.couriers.slice(0, MAXB)) {
    let b = bikes.get(c.id);
    if (!b) {
      if (loading > 2) continue;
      b = { bike: null, key: '', route: null, h: 0 }; bikes.set(c.id, b); loading++;
      makeBike(c.veh, { char: c.char, helmet: HELMETS[c.id % HELMETS.length] }).then((bike) => { loading--; if (bikes.get(c.id) !== b) return; b.bike = bike; scene.add(bike.root); });
      continue;
    }
    if (!b.bike) continue;
    const root = b.bike.root;
    if (c.leg) {
      const key = c.leg.a * 4096 + c.leg.b;
      if (b.key !== key) { b.key = key; b.route = routeFor(c.leg.a, c.leg.b); }
      const rt = b.route, fr = Math.max(0, Math.min(1, c.leg.t / c.leg.d));
      if (rt.length > 0.5) sampleRoute(rt, fr * rt.length, out);
      else { const [x, z] = doorPos(c.leg.b); out[0] = x; out[1] = z; out[2] = root.rotation.y; }
      root.visible = true;
      root.position.set(out[0], 0.1, out[1]);
      let dh = out[2] - root.rotation.y; while (dh > Math.PI) dh -= 2 * Math.PI; while (dh < -Math.PI) dh += 2 * Math.PI;
      root.rotation.y += dh * Math.min(1, dt * 12);
      const v = c.leg.t > 0 && fr < 1 ? rt.length / c.leg.d : 0;
      b.bike.update(dt, v, THREE.MathUtils.clamp(dh * 6, -0.4, 0.4));
    } else if (c.st === 'idle') {
      // parked on the pavement in front of the stand (a few; the rest are inside)
      if (parked < 4) {
        const side = (parked - 1.5) * 2.4, [lx, , lz] = lotPos(sp);
        root.visible = true;
        root.position.set(lx + f[0] * TILE * 0.36 + r[0] * side, 0.1, lz + f[1] * TILE * 0.36 + r[1] * side);
        root.rotation.y = Math.atan2(r[0], r[1]);
        b.bike.update(dt, 0, 0);
        b.key = '';
      } else root.visible = false;
      parked++;
    } else b.bike.update(dt, 0, 0); // (at a counter or a door: stays where the leg ended)
  }
}

// ---------------------------------------------------------------- live map numbers
function liveMap() {
  const d = S.diagnose(G);
  for (const id in mk) {
    const k = G.kit[id], m = mk[id]; if (!k) continue;
    const busy = k.cooking.length / k.cooks;
    m.el.style.setProperty('--p', busy.toFixed(3));
    const kq = m.el.querySelector('.kq');
    kq.hidden = !k.queue.length; if (k.queue.length) kq.textContent = k.queue.length;
    const sh = m.el.querySelector('.shelf'), n = S.shelfSize(k);
    let html = '';
    for (let i = 0; i < n; i++) { const oid = k.rack[i]; html += oid ? `<i class="${S.heatClass(G.orders[oid].heat)}"></i>` : '<i></i>'; }
    if (sh.dataset.h !== html) { sh.dataset.h = html; sh.innerHTML = html; }
    m.el.classList.toggle('neck', (d.kind === 'kitchen' || d.kind === 'shelf') && d.id === id);
    m.el.classList.toggle('neckk', d.kind === 'kitchen' && d.id === id);
  }
  if (standMk) {
    const idle = G.couriers.filter((c) => c.st === 'idle').length;
    const cnt = standMk.el.querySelector('.cnt'); if (cnt.textContent !== String(idle)) cnt.textContent = idle;
    standMk.el.classList.toggle('lazy', d.kind === 'demand');
  }
  syncPins();
}

// ---------------------------------------------------------------- hub view offset: the map sits in the space the sheet leaves
const vo = { x: 0, y: 0 };
const sheetEl = document.getElementById('sheet'), topEl = document.querySelector('.topbar');
function updateViewOffset(dt) {
  const Wd = innerWidth, H = innerHeight, r = sheetEl.getBoundingClientRect(), top = topEl.getBoundingClientRect().bottom + 30;
  let tx = 0, ty = 0;
  if (r.width > Wd * 0.8) ty = H / 2 - (top + r.top) / 2;
  else if (sheetEl.dataset.state !== 'closed') tx = -(r.right + 10) / 2;
  const k = 1 - Math.exp(-dt * 8);
  vo.x += (tx - vo.x) * k; vo.y += (ty - vo.y) * k;
  camera.setViewOffset(Wd, H, vo.x, vo.y, Wd, H);
}
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
hubCam.snap(9 * TILE, 31 * TILE + 40, 430); // (Old Town's middle: all four kitchens in view)
document.body.dataset.mode = 'hub';
ui.setTab('kitchens');
syncMap();
sky.set(S.clockOf(G));
fill.style.width = '100%';
document.getElementById('boot').classList.add('out');

// ---------------------------------------------------------------- loop
const timer = new THREE.Timer();
let lastNight = -1, liveT = 0, saveT = 0, coinT = 0, rushSeen = null;
function frame() {
  timer.update();
  const raw = timer.getDelta(), dt = Math.min(0.05, raw);
  const clock = S.clockOf(G);
  waterTime.value += dt; toyUni.uTime.value += dt; backdrop.update(dt); train.update(dt);
  traffic.update(dt);
  hubCam.update(dt);
  updateViewOffset(dt);
  const fx = hubCam.st.x, fz = hubCam.st.z;
  peds.update(dt, fx, fz, 160);
  props.update(fx, fz, Math.min(260, Math.max(120, hubCam.st.dist * 0.95)));
  sky.focus(fx, fz, Math.min(900, hubCam.st.dist * 1.7), camera);
  weather.update(dt, clock, 1, camera);
  sky.state.rain = weather.rain; sky.set(clock);
  scene.fog.near = hubCam.st.dist * 1.6 * (1 - 0.3 * weather.rain); scene.fog.far = hubCam.st.dist * 5.5 * (1 - 0.3 * weather.rain);
  if (sky.state.night !== lastNight) { lastNight = sky.state.night; setCityNight(lastNight); props.setNight(lastNight); carUni.uNight.value = lastNight; lampUni.uNight.value = lastNight; renderer.toneMappingExposure = 1.0 + lastNight * 0.25; setEnvNight(lastNight); }

  // the day (real time: a slow phone runs the same day; the day waits while a card is open or the tab is hidden)
  if (!game.paused && !G.done) {
    const ev = S.tick(G, W, Math.min(1, raw) * SPEED, SPEED);
    coinT -= raw;
    for (const e of ev) {
      if (e.kind === 'paid') {
        pop(e.door, `+${S.money(e.amount)}`, e.heat);
        if (coinT <= 0) { audio.play(e.heat === 'hot' ? 'ui-coins' : 'bag-rustle', { vol: e.heat === 'hot' ? 0.35 : 0.5 }); coinT = 0.6; }
      } else if (e.kind === 'lost') { pop(e.door, '✕', 'lost'); audio.play('order-late', { vol: 0.4 }); }
      else if (e.kind === 'end') { save(); ui.render(); ui.endDay(); }
    }
    const rush = S.rushAt(clock)?.name || null;
    if (rush !== rushSeen) { if (rush && rushSeen !== undefined) { audio.play('notif-order'); ui.toast(`${ICON('ui-clock')} ${rush}! Orders ×${S.rushAt(clock).m}`, 'warn'); } rushSeen = rush; }
  }
  drawBikes(dt);
  markers.update(innerWidth, innerHeight);
  liveT += dt; if (liveT > 0.1) { liveT = 0; ui.live(); liveMap(); }
  saveT += dt; if (saveT > 5) { saveT = 0; save(); }
  adapt(dt);
  renderer.render(scene, camera);
}
rushSeen = S.rushAt(S.clockOf(G))?.name || null;
renderer.setAnimationLoop(frame);
document.addEventListener('visibilitychange', () => { if (document.hidden) save(); });
addEventListener('pagehide', save);
window.game = Object.assign(game, { scene, camera, renderer, hubCam, markers, traffic, bikes });
window.ready = true;
// (the loop runs under these cards; the day waits for the first one)
if (fresh) { save(); if (!q.has('noti')) ui.welcome(); }
else if (G.done) ui.endDay();

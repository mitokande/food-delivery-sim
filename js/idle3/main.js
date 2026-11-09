// Uncle's Diner (idle3.html): boot, the 3D city around the restaurant (rebuilt as it grows), couriers riding real
// routes, the loop.
// Rules: sim.js (pure); interface: ui.js. The city, traffic, sky and weather are the courier game's own modules;
// nothing here reads or writes the courier game's save or the other idle prototypes'.
import * as THREE from 'three';
import { generateCity, DIRS } from '../city/gen.js';
import { buildCityView, buildLotView, waterTime, cullChunks, setCityNight, lampUni, cityMaterials } from '../city/view.js';
import { addSign } from '../city/arch.js';
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
import { TILE, RESTAURANT } from '../data.js';
import * as S from './sim.js';
import { createDinerUI, ICON } from './ui.js';

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
    if (d && d.v === 2) { const f = S.fresh(); G = { ...f, ...d, settings: { ...f.settings, ...d.settings }, stats: { ...f.stats, ...d.stats }, seen: { ...d.seen } }; fresh = false; }
  }
} catch (e) { console.warn('idle3 save load failed', e); }
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
bootMsg.textContent = 'Finding the diner…';
const sky = createSky(scene);
sky.sun.shadow.mapSize.set(QV === 'high' ? 2048 : 1024, QV === 'high' ? 2048 : 1024);
const city = generateCity();
const W = S.createWorld(city);
// the restaurant's lot and the one next door are left empty: buildRestaurant() puts the right building there per stage
const SIGN = 'Ferdi\'s Diner', SIGN2 = 'Ferdi\'s Kitchen', BRAND = '#c4480f';
addSign(SIGN, BRAND, '#fff3d6'); addSign(SIGN2, '#2f6f5b', '#fff3d6');
const view = await buildCityView(city, scene, { skip: new Set([W.lot.id, W.next?.id].filter((x) => x != null)) });
const people = await bakePeople(peopleSpots(view.arch.props));
const props = await createProps(scene, [...view.arch.props, ...people.list], { extra: people.extra });
const backdrop = await createBackdrop(scene, city, sky);
const train = await createTrain(scene);
bootMsg.textContent = 'Kicking the old scooter…';
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
const dl = W.lot, DX = dl.cx * TILE, DZ = dl.cz * TILE;
const NX = W.next ? W.next.cx * TILE : DX, NZ = W.next ? W.next.cz * TILE : DZ;
const doorPos = (tile) => [city.tiles[tile].x * TILE, city.tiles[tile].z * TILE];

// ---------------------------------------------------------------- the game object (what ui.js calls)
let coinT = 0, bellT = 0, popT = 0;
const game = {
  G, W, S, audio, save, paused: false,
  cook() {
    const r = S.canCook(G);
    if (r === 'ok') { S.act(G, 'cook-tap'); audio.play('land', { vol: 0.5, rate: 1.25 }); ui.tapped(); return true; }
    if (r === 'none') { audio.play('ui-error', { vol: 0.4 }); ui.toast(`${ICON('ui-clock')} No orders waiting`, 'warn'); }
    ui.nudge();
    return false;
  },
  act(a, id, sk, el) {
    const r = S.act(G, a, id, sk);
    if (!r) { audio.play('ui-error'); ui.toast('Not enough cash', 'bad'); return false; }
    if (a === 'cook') {
      const c = G.cooks[G.cooks.length - 1], d = S.DISH[c.dish]; audio.play('ui-levelup');
      ui.toast(d ? `${ICON('char-' + c.char)} ${c.name} joins and brings ${ICON(d.icon)} ${d.name}!` : `${ICON('char-' + c.char)} ${c.name} joins the kitchen!`, 'good');
      if (d) ui.newDish(d.id);
    } else if (a === 'courier') {
      const c = G.couriers[G.couriers.length - 1]; audio.play('ui-unlock');
      ui.toast(G.couriers.length === 1 ? `${ICON('char-' + c.char)} ${c.name} takes Uncle's scooter: delivery orders are on!` : `${ICON('char-' + c.char)} ${c.name} joins on a beat-up scooter`, 'good');
    } else if (a === 'motor') { const c = G.couriers.find((x) => x.id === +id); audio.play('ui-levelup'); ui.toast(`${ICON('ui-wrench')} ${c.name} rides a ${S.motorOf(c).name} now`, 'good'); }
    else if (a === 'expand') { audio.play('ui-unlock'); setTimeout(() => audio.play('crowd-cheer', { vol: 0.6 }), 500); buildRestaurant(G.stage, true); game.focusDiner(); ui.stageUp(G.stage); }
    else audio.play('ui-purchase', { vol: 0.7 });
    if (el) { el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump'); }
    game.changed();
    return true;
  },
  changed() { save(); ui.render(); syncMap(); },
  focusDiner() { const two = G.stage >= 3; hubCam.lookAt(two ? (DX + NX) / 2 : DX, two ? (DZ + NZ) / 2 : DZ, Math.min(hubCam.st.dist, 340)); },
  applySettings() { applyVolumes(); const nq = quality(); if (nq !== QV) { QV = nq; resize(); } },
  reset() { try { localStorage.removeItem(S.KEY); } catch { /* fine */ } location.reload(); },
};
const ui = createDinerUI(game);
game.ui = ui;

// ---------------------------------------------------------------- the restaurant: a building per stage on its lot (and next door from stage 4)
const BRANDED = { wall: '#f4e1bf', brand: BRAND, awning: '#e2382b', shop: true, special: 'restaurant' };
const LOOKS = [
  { main: { floors: 2, wall: '#c9bca6', brand: '#7d6f60', awning: null, sign: null, rest: null, shop: true, balMask: 0 }, next: null, props: 0 }, // run-down
  { main: { ...BRANDED, floors: 2, sign: SIGN, rest: RESTAURANT.sunny, balMask: 0 }, next: null, props: 1 }, // fixed up
  { main: { ...BRANDED, floors: 2, sign: SIGN, rest: RESTAURANT.sunny, balMask: 0 }, next: null, props: 2 }, // + terrace
  { main: { ...BRANDED, floors: 3, sign: SIGN, rest: RESTAURANT.sunny, balMask: 1, balPat: 1 }, next: { ...BRANDED, floors: 3, sign: SIGN2, rest: null, balMask: 1, balPat: 1 }, props: 2 },
  { main: { ...BRANDED, floors: 4, sign: SIGN, rest: RESTAURANT.sunny, balMask: 3, balPat: 1 }, next: { ...BRANDED, floors: 4, sign: SIGN2, rest: RESTAURANT.mamma, balMask: 3, balPat: 1 }, props: 2 },
];
let rest = null; // { group, parts, grow }
function buildRestaurant(stage, grow = false) {
  const L = LOOKS[stage];
  if (rest) { rest.group.removeFromParent(); for (const p of rest.parts) p.dispose(); }
  const group = new THREE.Group(); group.name = 'restaurant';
  const parts = [buildLotView(city, W.lot, L.main)];
  if (W.next) parts.push(buildLotView(city, W.next, L.next || {}));
  const list = [];
  parts.forEach((p, i) => {
    group.add(p.group);
    for (const pr of p.props) {
      const cafe = /^cafe_set/.test(pr.type);
      // the run-down diner has nothing outside; fixed up: a chalkboard; the terrace: tables (next door: its own things until it's ours)
      if (i === 0 ? (cafe ? L.props >= 2 : L.props >= 1) : (!L.next || !cafe || L.props >= 2)) list.push(pr);
    }
  });
  // (more tables on the terrace than the street furniture rule gives)
  if (L.props >= 2) {
    const f = DIRS[dl.front], r = DIRS[(dl.front + 1) & 3], lots = L.next ? [[DX, DZ], [NX, NZ]] : [[DX, DZ]];
    for (const [x, z] of lots) for (const k of [-1, 1]) list.push({ type: k < 0 ? 'cafe_set_a' : 'cafe_set_b', x: x + f[0] * TILE * 0.34 + r[0] * k * 2.7, z: z + f[1] * TILE * 0.34 + r[1] * k * 2.7, rot: Math.atan2(f[0], f[1]) + k * 0.3 });
  }
  scene.add(group);
  rest = { group, parts, grow: grow ? 0 : 1 };
  createProps(group, list).then((pr) => { if (rest?.group === group) pr.update(DX, DZ, 120, null, true); });
}
function growRestaurant(dt) {
  if (!rest || rest.grow >= 1) return;
  rest.grow = Math.min(1, rest.grow + dt / 1.1);
  const t = rest.grow, e = 1 - Math.pow(1 - t, 3) + Math.sin(t * Math.PI) * 0.08; // (ease out with a little overshoot)
  rest.group.scale.set(1, Math.max(0.02, e), 1); // (the geometry is in world space with the ground at y 0: it rises from the ground)
}

// ---------------------------------------------------------------- the map: the restaurant, orders at the doors
let dinerMk = null;
const stageArt = (i) => `assets/story/${i === 0 ? 'diner' : 'stage' + (i + 1)}.webp`;
function syncMap() {
  if (!dinerMk) {
    dinerMk = markers.add({ x: DX, y: 9, z: DZ, cls: 'mk diner',
      html: `<span class="bub"><i class="ring"></i><img class="art" alt=""><i class="cnt">0</i></span><span class="dst"><i class="seats">${ICON('ui-people')}<b>0</b></i><i class="wq">${ICON('ui-clock')}<b>0</b></i></span><em class="dname">${SIGN}</em>`,
      onTap: () => ui.setTab('restaurant') });
  }
  const img = dinerMk.el.querySelector('.art'), src = stageArt(G.stage);
  if (img.getAttribute('src') !== src) img.setAttribute('src', src);
  const two = G.stage >= 3;
  dinerMk.pos.set(two ? (DX + NX) / 2 : DX, 9 + G.stage * 1.5, two ? (DZ + NZ) / 2 : DZ);
  dinerMk.el.querySelector('.dname').textContent = S.stageOf(G).name;
}
// orders: a pin at each door (grey: in the kitchen, gold: packed, waiting for a courier, green: on the way)
const pins = new Map(); // order id → marker
function dropMarker(m) { m.el.remove(); const i = markers.list.indexOf(m); if (i >= 0) markers.list.splice(i, 1); }
function syncPins() {
  for (const [id, m] of pins) if (!G.orders[id]) { dropMarker(m); pins.delete(id); }
  for (const id in G.orders) {
    const o = G.orders[id];
    let m = pins.get(+id);
    if (!m) {
      const [x, z] = doorPos(o.door);
      m = markers.add({ x, y: 4, z, cls: 'mk pin open', html: `<span class="pdot">${ICON(S.DISH[o.dish].icon)}</span>` });
      m.el.tabIndex = -1; m.el.style.pointerEvents = 'none';
      pins.set(+id, m);
    }
    if (m.el.dataset.st !== o.st) { m.el.dataset.st = o.st; m.el.className = `marker mk pin ${o.st}`; }
  }
}
// "+$4" over the diner or a door
function pop(x, z, text, cls, y = 10) {
  if (document.hidden) return;
  const m = markers.add({ x, y, z, cls: `mk paypop ${cls}`, html: `<b>${text}</b>` });
  m.el.style.pointerEvents = 'none';
  setTimeout(() => dropMarker(m), 1100);
}
const popDoor = (door, text, cls) => { const [x, z] = doorPos(door); pop(x, z, text, cls); };

// ---------------------------------------------------------------- couriers on the streets: one bike each, on its route
const bikes = new Map(); // courier id → { bike, veh, key, route }
const routes = new Map();
const routeFor = (a, b) => { const key = a * 4096 + b; let r = routes.get(key); if (!r) { r = buildRoute(city, W.path(a, b)); routes.set(key, r); } return r; };
const HELMETS = ['#e8432f', '#2ec4b6', '#f2a541', '#2f6fd6', '#43b34a', '#9b5de5'];
const out = [0, 0, 0, 0, 0];
function drawBikes(dt) {
  const f = DIRS[dl.front], r = DIRS[(dl.front + 1) & 3];
  let parked = 0;
  for (const c of G.couriers) {
    const veh = S.motorOf(c).id;
    let b = bikes.get(c.id);
    if (b && b.veh !== veh && b.bike) { b.bike.root.removeFromParent(); bikes.delete(c.id); b = null; } // (a new motor)
    if (!b) {
      b = { bike: null, veh, key: '', route: null }; bikes.set(c.id, b);
      makeBike(veh, { char: c.char, helmet: HELMETS[c.id % HELMETS.length] }).then((bike) => { if (bikes.get(c.id) !== b) return; b.bike = bike; scene.add(bike.root); });
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
    } else if (c.st === 'idle' || c.st === 'wait') {
      // parked at the curb in front of the restaurant (the terrace is between them and the door)
      const side = (parked - (Math.min(G.couriers.length, 4) - 1) / 2) * 2.2 - 2.5;
      root.visible = parked < 4;
      root.position.set(DX + f[0] * TILE * 0.5 + r[0] * side, 0.1, DZ + f[1] * TILE * 0.5 + r[1] * side);
      root.rotation.y = Math.atan2(r[0], r[1]);
      b.bike.update(dt, 0, 0);
      b.key = '';
      parked++;
    } else b.bike.update(dt, 0, 0);
  }
}

// ---------------------------------------------------------------- live map numbers
function liveMap() {
  if (dinerMk) {
    const el = dinerMk.el, j = G.you.job;
    el.style.setProperty('--p', (j ? 1 - j.left / j.total : 0).toFixed(3));
    const set = (sel, v) => { const e = el.querySelector(sel); if (e.textContent !== String(v)) e.textContent = v; };
    set('.cnt', G.tickets.length);
    set('.seats b', `${G.tables.length}/${S.stageOf(G).seats}`);
    const wq = el.querySelector('.wq'); set('.wq b', G.door.length);
    wq.hidden = !G.door.length; wq.classList.toggle('long', G.door.length >= S.WALK.door - 1);
    el.querySelector('.seats').classList.toggle('full', S.seatsFree(G) <= 0);
  }
  syncPins();
}

// ---------------------------------------------------------------- hub view offset: the map sits in the space the sheet leaves
const vo = { x: 0, y: 0 };
const sheetEl = document.getElementById('sheet'), topEl = document.querySelector('.hud2') || document.querySelector('.topbar');
function updateViewOffset(dt) {
  const Wd = innerWidth, H = innerHeight, r = sheetEl.getBoundingClientRect(), top = topEl.getBoundingClientRect().bottom + 20;
  let tx = 0, ty = 0;
  if (sheetEl.dataset.state === 'closed') ty = H / 2 - (top + H - 90) / 2;
  else if (r.width > Wd * 0.8) ty = H / 2 - (top + r.top) / 2;
  else tx = -(r.right + 10) / 2;
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
buildRestaurant(G.stage);
hubCam.snap(G.stage >= 3 ? (DX + NX) / 2 : DX, G.stage >= 3 ? (DZ + NZ) / 2 : DZ, innerWidth < innerHeight ? 430 : 340); // (far enough out to see most of the delivery zone)
document.body.dataset.mode = 'hub';
syncMap();
const CLOCK = 15 * 60; // (a fixed sunny afternoon: the day/night of the courier game isn't part of this one)
sky.set(CLOCK);
fill.style.width = '100%';
document.getElementById('boot').classList.add('out');
ui.render();

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
  weather.update(dt, CLOCK, 1, camera);
  sky.state.rain = weather.rain; sky.set(CLOCK);
  scene.fog.near = hubCam.st.dist * 1.6 * (1 - 0.3 * weather.rain); scene.fog.far = hubCam.st.dist * 5.5 * (1 - 0.3 * weather.rain);
  if (sky.state.night !== lastNight) { lastNight = sky.state.night; setCityNight(lastNight); props.setNight(lastNight); carUni.uNight.value = lastNight; lampUni.uNight.value = lastNight; renderer.toneMappingExposure = 1.0 + lastNight * 0.25; setEnvNight(lastNight); }

  // the diner runs in real time (and waits while a story card is open)
  if (!game.paused) {
    const ev = S.tick(G, W, Math.min(1, raw) * SPEED, SPEED);
    coinT -= raw; bellT -= raw; popT -= raw;
    for (const e of ev) {
      if (e.kind === 'served') {
        if (popT <= 0) { pop(DX, DZ, `+${S.money(e.amount)}`, 'cash', 3); popT = 0.3; }
        if (coinT <= 0) { audio.play('ui-coins', { vol: 0.3 }); coinT = 0.45; }
      } else if (e.kind === 'paid') {
        popDoor(e.door, `+${S.money(e.amount)}`, e.tip >= S.DELIV.tip ? 'tip' : 'cash');
        audio.play('order-complete', { vol: 0.35 });
      } else if (e.kind === 'seat') { if (bellT <= 0) { audio.play('doorbell', { vol: 0.18 }); bellT = 2.5; } }
      else if (e.kind === 'order') audio.play('notif-order', { vol: 0.45 });
      else if (e.kind === 'depart') audio.play('engine-start', { vol: 0.3 });
      else if (e.kind === 'stall') { audio.play('engine-stall', { vol: 0.5 }); pop(DX, DZ, 'Won\'t start!', 'stall', 3); }
      else if (e.kind === 'lostWalk') {
        if (popT <= 0) { pop(DX, DZ, e.full || e.door ? 'No table!' : 'Left hungry', 'lost', 3); popT = 0.6; }
        if (!e.full) audio.play('order-late', { vol: 0.2 });
      } else if (e.kind === 'lostOrder') { popDoor(e.door, 'Cancelled', 'lost'); audio.play('order-late', { vol: 0.3 }); }
      else if (e.kind === 'cooked') ui.cooked(e.dish);
      else if (e.kind === 'fame') { audio.play('crowd-cheer', { vol: 0.5 }); ui.fameUp(e.level); }
    }
  }
  drawBikes(dt);
  growRestaurant(raw);
  markers.update(innerWidth, innerHeight);
  liveT += dt; if (liveT > 0.08) { liveT = 0; ui.live(); liveMap(); }
  saveT += dt; if (saveT > 5) { saveT = 0; save(); }
  adapt(dt);
  renderer.render(scene, camera);
}
renderer.setAnimationLoop(frame);
document.addEventListener('visibilitychange', () => { if (document.hidden) save(); });
addEventListener('pagehide', save);
window.game = Object.assign(game, { scene, camera, renderer, hubCam, markers, traffic, bikes, restaurant: () => rest });
window.ready = true;
// (the loop runs under the story cards; the diner waits for them)
if (fresh || !G.seen.intro) { save(); if (!q.has('noti')) ui.story(); else G.seen.intro = true; }

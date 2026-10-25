// Boot + main loop + mode router (hub ⇄ ride).
import * as An from './analytics.js'; // first, so boot errors are reported too
import * as THREE from 'three';
import { generateCity, DIRS, OPP } from './city/gen.js';
import { buildCityView, waterTime, cullChunks, setCityNight, lampUni, cityMaterials } from './city/view.js';
import { createWeather, W as WEATHER } from './weather.js';
import { findPath, buildRoute, sampleRoute, dirBetween } from './city/graph.js';
import { createTraffic, createPeds } from './city/traffic.js';
import { createProps, toyUni } from './city/props.js';
import { bakePeople, peopleSpots } from './city/people.js';
import { createBackdrop } from './city/backdrop.js';
import { createTrain } from './city/train.js';
import { carUni } from './city/cars.js';
import { createSky } from './sky.js';
import { installGrade, makeEnvironment, setEnvNight } from './look.js';
import { createHubCamera, createMarkers } from './hub.js';
import { setProgress } from './assets.js';
import { createRide } from './ride/ride.js';
import { createWorld } from './ride/world.js';
import { buildRibbon, ribbonTime } from './ride/ribbon.js';
import { EVENT } from './ride/events.js';
import { makeBike } from './ride/vehicle.js';
import { createUI, ICON } from './ui/ui.js';
import { checkAchievements } from './career.js';
import { createOnboarding } from './ui/onboard.js';
import { createAudio } from './audio.js';
import { makeOrder, refreshOrder, etaFor, pathMeters } from './orders.js';
import * as St from './state.js';
import { S } from './state.js';
import { TILE, DISTRICTS, DISTRICT, RESTAURANT, FOODS, GAME_MIN_PER_SEC, DAY_END, FLEET, ORDER_TYPES } from './data.js';
import { mulberry32 } from './rng.js';

window.__started = true;
const q = new URLSearchParams(location.search);
const isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
const canvas = document.getElementById('gl');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
installGrade(renderer);
const scene = new THREE.Scene();
makeEnvironment(renderer); // reflections for glossy toy materials only (scene.environment would also light Lambert)
const camera = new THREE.PerspectiveCamera(30, 1, 1, 5000);

const fresh = !St.load();
function quality() {
  const qv = S.settings.quality === 'auto' ? (isTouch ? 'medium' : 'high') : S.settings.quality;
  renderer.setPixelRatio(Math.min(devicePixelRatio, qv === 'low' ? 1 : qv === 'medium' ? 1.5 : 2));
  renderer.shadowMap.enabled = qv !== 'low';
  return qv;
}
let QV = quality();
function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h; camera.updateProjectionMatrix();
}
addEventListener('resize', resize); resize();

const fill = document.getElementById('boot-fill'), bootMsg = document.getElementById('boot-msg');
setProgress((f) => { fill.style.width = Math.round(10 + f * 70) + '%'; });
const say = (t) => { bootMsg.textContent = t; };

say('Drawing the streets of Saffron Bay…');
const sky = createSky(scene);
sky.sun.shadow.mapSize.set(QV === 'high' ? 2048 : 1024, QV === 'high' ? 2048 : 1024);
const city = generateCity();
const view = await buildCityView(city, scene);
const people = await bakePeople(peopleSpots(view.arch.props));
const props = await createProps(scene, [...view.arch.props, ...people.list], { extra: people.extra });
const backdrop = await createBackdrop(scene, city, sky);
const train = await createTrain(scene);
say('Starting the traffic…');
const traffic = await createTraffic(city, scene);
const peds = await createPeds(city, scene, { count: isTouch ? 8 : 12, ids: isTouch ? ['female-c', 'male-e', 'female-d', 'male-c', 'female-a'] : undefined });
fill.style.width = '88%';

const audio = createAudio();
const weather = createWeather(scene, cityMaterials);
const rng = mulberry32(Date.now() & 0xffffff);
const garageLot = city.lots[city.specials.garage];
const officeLot = city.lots[city.specials.office];
const hubCam = createHubCamera(camera, canvas, city);
const markers = createMarkers(document.getElementById('markers'), camera);

// ---------------------------------------------------------------- game object
const game = {
  city, audio, board: [], taken: [], selOrder: null, mode: 'hub', isTouch,
  // on a keyboard the player rides the bike freely (steer, gas, brake, reverse) unless they switch auto-drive on in Settings
  manual: () => !isTouch && S.settings.autodrive !== true,
  sampleRoute,
  rideInput: (k, d) => ride.input(k, d),
  canOvertake: () => ride.canOvertake(),
};
const ui = createUI(game);
const ob = createOnboarding(game, ui);
game.ob = ob;
const world = createWorld(city, view.arch, people.list);
const ride = createRide({ scene, camera, renderer, city, traffic, world, peds, sky, audio, ui, weather, manual: () => game.manual(), onFinish: (s) => finishJob(s) });
game.ride = ride; game.world = world;

const playerTile = () => (S.pos != null && city.tiles[S.pos]?.k === 1 ? S.pos : garageLot.door);
const playerDir = () => (S.pos != null && S.posDir != null && city.tiles[S.pos]?.k === 1 && city.tiles[S.pos].mask & (1 << S.posDir) ? S.posDir : -1);

// ---------------------------------------------------------------- order board
function boardSize() { return 4 + Object.keys(S.districts).length + (St.rushMult().m > 1 ? 2 : 0); }
function fillBoard(all = false) {
  const now = performance.now();
  game.board = game.board.filter((o) => game.taken.includes(o) || (now - o.born) / 1000 < o.life);
  let added = 0, guard = 0;
  while (game.board.length < boardSize() && (all || added < 1) && guard++ < 40) {
    const o = makeOrder(city, rng, { from: playerTile() });
    if (o.size > St.vehStats().cap) continue;
    if (game.board.filter((x) => x.rest === o.rest).length >= 2) continue;
    game.board.push(o); added++;
  }
  game.board.sort((a, b) => a.pickM - b.pickM);
  if (added && !all && game.mode === 'hub') audio.play('notif-order', { vol: 0.5 });
  return added;
}
game.toggleOrder = (id) => {
  const o = game.board.find((x) => x.id === id); if (!o) return;
  const i = game.taken.indexOf(o);
  if (i >= 0) { game.taken.splice(i, 1); audio.play('ui-back'); }
  else {
    const cap = St.vehStats().cap, used = game.taken.reduce((a, x) => a + x.size, 0);
    if (used + o.size > cap) {
      if (cap === 1 && game.taken.length === 1) { game.taken = [o]; audio.play('ui-tap'); }
      else { ui.toast(cap === 1 ? 'Your bike carries one order' : `Box full (${cap})`, 'bad'); audio.play('ui-error'); return; }
    } else { game.taken.push(o); audio.play('ui-tap'); }
    ob.event('taken');
  }
  game.selOrder = o.id;
  const r = city.lots[o.restLot];
  hubCam.lookAt(r.cx * TILE, r.cz * TILE + 30, Math.max(hubCam.st.tdist, 260));
  updatePreview(); updateMarkers();
};

// ---------------------------------------------------------------- job planning
function planLegs(orders) {
  const legs = [];
  let at = playerTile();
  const restLots = [...new Set(orders.map((o) => o.restLot))];
  const dist = (a, lot) => { const t = city.tiles[a], l = city.lots[lot]; return Math.abs(t.x - l.cx) + Math.abs(t.z - l.cz); };
  const pend = [...restLots];
  while (pend.length) {
    pend.sort((a, b) => dist(at, a) - dist(at, b));
    const lot = pend.shift();
    legs.push({ kind: 'pickup', lot, orders: orders.filter((o) => o.restLot === lot).map((o) => o.id) });
    at = city.lots[lot].door;
  }
  const drops = [...orders];
  while (drops.length) {
    drops.sort((a, b) => dist(at, a.cust) - dist(at, b.cust));
    const o = drops.shift();
    legs.push({ kind: 'drop', lot: o.cust, order: o.id });
    at = city.lots[o.cust].door;
  }
  return legs;
}

// route preview ribbons in the hub
let previewMeshes = [];
function updatePreview() {
  for (const m of previewMeshes) { m.removeFromParent(); m.geometry.dispose(); }
  previewMeshes = [];
  const show = game.taken.length ? game.taken : game.board.filter((o) => o.id === game.selOrder);
  if (!show.length) return;
  const legs = planLegs(show);
  let at = playerTile(), dir = playerDir();
  for (const leg of legs) {
    const to = city.lots[leg.lot].door;
    const p = findPath(city, at, to, { noBack: dir >= 0 ? OPP(dir) : -1 }) || findPath(city, at, to);
    if (p && p.length > 1) {
      const r = buildRoute(city, p, { startDir: dir });
      const m = buildRibbon(r, { width: 3.2, y: 0.45, step: 2, color: leg.kind === 'pickup' ? '#ffd56b' : '#4fd4ff', chevrons: false });
      scene.add(m); previewMeshes.push(m);
      dir = r.steps[r.steps.length - 1].din;
    }
    at = to;
  }
}

// ---------------------------------------------------------------- markers
const DCENTER = { downtown: [11, 9], hills: [33, 9], oldtown: [9, 31], harbor: [31, 31] };
function updateMarkers() {
  markers.clear();
  const counts = {};
  for (const o of game.board) counts[o.rest] = (counts[o.rest] || 0) + 1;
  for (const r of city.restaurants) {
    const R = RESTAURANT[r.id], lot = city.lots[r.lot];
    const open = !!S.districts[R.district];
    const n = counts[r.id] || 0;
    markers.add({ x: lot.cx * TILE, y: 22, z: lot.cz * TILE, cls: `mk ${open ? '' : 'dim'}`,
      html: `<span class="bub" style="--mc:${R.color}">${ICON(FOODS[R.food].icon)}${open ? '' : ICON('ui-lock')}${n && open ? `<i class="cnt">${n}</i>` : ''}</span>`,
      onTap: () => {
        if (!open) { ui.toast(`${DISTRICT[R.district].name} is locked — see Jobs`, 'warn'); return; }
        const o = game.board.find((x) => x.rest === r.id && !game.taken.includes(x));
        ui.setTab('city');
        if (o) { game.toggleOrder(o.id); ui.render(); } else ui.toast(`No orders from ${R.name} right now`);
      } });
  }
  for (const d of DISTRICTS) {
    if (S.districts[d.id]) continue;
    const [x, z] = DCENTER[d.id];
    const st = St.districtStatus(d.id);
    markers.add({ x: x * TILE, y: 40, z: z * TILE, cls: 'mk lock', html: `<span class="bub">${ICON('ui-lock')} ${d.name}<small>${st.canApply ? 'Apply in Jobs!' : st.miss.slice(0, 2).join(' · ')}</small></span>`, onTap: () => ui.setTab('jobs') });
  }
  markers.add({ x: garageLot.cx * TILE, y: 16, z: garageLot.cz * TILE, cls: 'mk', html: `<span class="bub" style="--mc:#8a8f9c">${ICON('ui-wrench')}</span>`, onTap: () => ui.setTab('garage') });
  if (S.fleet.office) markers.add({ x: officeLot.cx * TILE, y: 18, z: officeLot.cz * TILE, cls: 'mk', html: `<span class="bub" style="--mc:#2ec4b6">${ICON('ui-building')}</span>`, onTap: () => ui.setTab('fleet') });
  const t = city.tiles[playerTile()];
  markers.add({ x: t.x * TILE, y: 9, z: t.z * TILE, cls: 'mk me', html: `<span class="bub" style="--mc:#e8432f">${ICON('char-' + S.look.char)}<em>You</em></span>` });
  for (const o of game.taken) { const l = city.lots[o.cust]; markers.add({ x: l.cx * TILE, y: 14, z: l.cz * TILE, cls: 'mk cust', html: `<span class="bub">${ICON('char-' + o.char)}<em>${o.name}</em></span>` }); }
  fleetMarkers = [];
  for (const c of S.fleet.couriers) {
    const r = [...riders.entries()].find(([k]) => k.startsWith(c.id + '|'))?.[1];
    if (!r || !r.agent) continue;
    fleetMarkers.push(markers.add({ x: 0, y: 7, z: 0, cls: 'mk fleet', html: `<span class="bub">${ICON('char-' + c.char)}</span>`, data: r.agent, onTap: () => ui.setTab('fleet') }));
  }
}
let fleetMarkers = [];

// ---------------------------------------------------------------- parked bike + fleet riders
async function parkBike() {
  const b = await ride.ensureBike();
  scene.add(b.root);
  const tile = playerTile(), t = city.tiles[tile];
  let d = playerDir(); if (d < 0) d = [1, 2, 3, 0].find((k) => t.mask & (1 << k));
  const r = DIRS[(d + 1) & 3];
  b.root.position.set(t.x * TILE + r[0] * 3.0, 0.1, t.z * TILE + r[1] * 3.0);
  b.root.rotation.set(0, Math.atan2(DIRS[d][0], DIRS[d][1]), 0);
  b.update(0.016, 0);
  b.rider?.play('drive', 0);
  return b;
}
game.previewVehicle = async () => { if (game.mode !== 'hub') return; await parkBike(); };
const riders = new Map();
async function syncFleetRiders() {
  const want = new Set(S.fleet.couriers.map((c) => c.id + '|' + c.veh + '|' + c.district));
  for (const [k, r] of riders) if (!want.has(k) && r.bike) { traffic.removeAgent(r.agent); r.bike.root.removeFromParent(); riders.delete(k); }
  for (const c of S.fleet.couriers) {
    const k = c.id + '|' + c.veh + '|' + c.district;
    if (riders.has(k)) continue;
    riders.set(k, { pending: true });
    const bike = await makeBike(c.veh, { char: c.char, helmet: ['#2ec4b6', '#f2a541', '#2f6fd6', '#43b34a'][c.name.length % 4] });
    scene.add(bike.root);
    const agent = traffic.addRider(bike.root, c.district, (dt, v, dh) => bike.update(dt, v, THREE.MathUtils.clamp(dh * 6, -0.4, 0.4)));
    riders.set(k, { bike, agent });
  }
  updateMarkers();
}
St.on((w) => {
  if (w === 'fleet') syncFleetRiders();
  if (w === 'districts' || w === 'fleet') updateMarkers();
  if ((w === 'look' || w === 'vehicles') && game.mode === 'hub') parkBike();
});

// ---------------------------------------------------------------- camera tween
let tween = null;
function tweenCam(toPos, toQuat, toFov, dur = 1.4) {
  return new Promise((res) => {
    tween = { t: 0, dur, fromPos: camera.position.clone(), fromQuat: camera.quaternion.clone(), fromFov: camera.fov, toPos, toQuat, toFov, res };
  });
}
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

// ---------------------------------------------------------------- start / finish a job
game.startJob = async () => {
  if (!game.taken.length || game.mode !== 'hub') return;
  audio.init();
  const orders = game.taken.slice();
  ob.event('start');
  for (const o of orders) refreshOrder(city, o, playerTile());
  const job = { orders, legs: planLegs(orders) };
  // batched orders: each one's timer covers the whole trip up to its own door (never shorter than promised)
  if (orders.length > 1) {
    let at = playerTile(), cum = 0, stops = 0;
    for (const leg of job.legs) {
      const to = city.lots[leg.lot].door;
      cum += at === to ? 0 : pathMeters(city, at, to); at = to;
      if (leg.kind === 'drop') { const o = orders.find((x) => x.id === leg.order); o.eta = Math.max(o.eta, etaFor(cum, o.district, ORDER_TYPES[o.type].eta) + stops * 6); }
      stops++;
    }
  }
  An.track('job_start', { n: orders.length, veh: S.active, lvl: S.lvl, manual: game.manual() ? 1 : 0, clock: Math.round(S.clock), rain: Math.round(WEATHER.rain * 100) / 100, rush: St.rushMult().m,
    orders: orders.map((o) => ({ type: o.type, food: o.food, rest: o.rest, d: o.district, m: Math.round(o.pickM + o.dropM), eta: Math.round(o.eta), pay: o.base })) });
  game.board = game.board.filter((o) => !orders.includes(o));
  game.taken = []; game.selOrder = null; updatePreview();
  showroom.on = false;
  game.mode = 'tween'; ui.setMode('busy'); markers.clear();
  hubCam.st.enabled = false;
  const from = playerTile();
  const first = city.lots[job.legs[0].lot].door;
  const p = findPath(city, from, first, { noBack: playerDir() >= 0 ? OPP(playerDir()) : -1 }) || findPath(city, from, first);
  const dir0 = p && p.length > 1 ? dirBetween(city, p[0], p[1]) : playerDir();
  ride.camReset();
  const pose = await ride.stage(from, dir0);
  ride.R.bike.rider?.play('drive', 0.3);
  audio.loop('music', 'music-ride');
  ride.R.takeCamera = false;
  await tweenCam(pose.pos, pose.quat, pose.fov, 1.5);
  ride.R.takeCamera = true;
  game.mode = 'ride'; ui.setMode('ride');
  await ride.start(job, from, dir0);
  // the controls tip, once per way of riding (a desktop player who rode on auto-drive still needs the keys)
  const tip = ride.R.manual ? 'freeTip' : 'rideTip';
  if (!S.seen[tip]) {
    S.seen[tip] = 1; St.save();
    ride.R.timeScale = 0;
    await ui.tutorial(ride.R.manual
      ? `You ride the scooter — go anywhere you like.<br><br>${ICON('ui-speed')} <b>W</b> / <b>↑</b> gas, <b>S</b> / <b>↓</b> brake (hold it when stopped to back up).<br>${ICON('ui-route')} <b>A</b> / <b>D</b> steer. The blue arrows are the GPS: take another street and it finds a new way. Stop in the glowing ring at the door.<br>${ICON('ui-jump')} <b>Space</b> hops potholes, <b>Shift</b> is turbo, <b>E</b> takes the button that pops up. Walls, poles and cars hurt — so do corners taken too fast.`
      : `Your scooter <b>drives itself</b>.<br><br>${ICON('ui-nitro')} Hold <b>TURBO</b> to go faster.<br>${ICON('ui-jump')} Tap <b>HOP</b> to jump potholes.<br>${ICON('ui-overtake')} Buttons pop up to <b>overtake</b>, <b>run lights</b> and take <b>shortcuts</b>.<br>${ICON('ui-route')} <b>Drag</b> the screen to look around.`, { at: 'top', btn: "Let's ride!" });
    ride.R.timeScale = 1;
  }
};

const LEVEL_UNLOCKS = {
  2: ['Skill upgrades'], 3: ['Downtown job application', 'Rival couriers'], 4: ['VIP orders', 'Skills up to level 2'],
  5: ['Fleet: rent a dispatch office and hire couriers'], 6: ['Harbor job application', 'Skills up to level 3'], 8: ['Skills up to level 4', 'EXPRESS orders: double pay, very tight timers'], 10: ['Green Hills job application', 'Skills up to level 5'],
};
async function finishJob(sum) {
  const lines = [];
  let total = 0, starsSum = 0, xp = 0, tipsT = 0;
  const goalsHit = [], levels = [], empNews = [];
  const unsub = St.on((w, g) => { if (w === 'goal') goalsHit.push(g); if (w === 'levelup') levels.push(g); });
  for (const x of sum.orders) {
    const r = x.result; if (!r) continue;
    const o = x.o;
    lines.push({ label: `${ICON(FOODS[o.food].icon)} ${o.restName} → ${o.name} <span class="rs">${'★'.repeat(r.stars)}</span>`, amount: r.pay + r.bonus });
    if (r.tip) lines.push({ label: `${ICON('ui-coin')} Tip from ${o.name}`, amount: r.tip, cls: 'pos' });
    total += r.pay + r.bonus + r.tip; tipsT += r.tip; starsSum += r.stars;
    xp += Math.round((14 + o.dropM / 35 + r.stars * 3 + (r.early ? 6 : 0)) * (0.8 + 0.2 * DISTRICT[o.district].pay));
    St.addRating(r.stars);
    empNews.push(...St.empRecord(o.district, r.stars));
    S.stats.deliveries++; S.today.deliveries++;
    const ctx = { d: o.district };
    if (r.stars === 5) { S.stats.fiveStars++; St.goalProgress('five', 1, ctx); }
    if (r.early) { S.stats.early++; St.goalProgress('early', 1, ctx); }
    if (r.cond >= 99) St.goalProgress('nodamage', 1, ctx);
    if (o.type === 'express') { S.stats.express++; St.weekProgress('express', 1, ctx); }
    if (o.type === 'vip') { S.stats.vip++; St.weekProgress('vip', 1, ctx); }
    if (WEATHER.rain > 0.35) S.stats.rainy++;
    if (S.clock >= 20.5 * 60 || S.clock < 6 * 60) S.stats.night++;
    St.goalProgress('deliver', 1, ctx);
    S.stats.bestTip = Math.max(S.stats.bestTip, r.tip);
  }
  if (sum.stats.cash) { lines.push({ label: `${ICON('ui-cash')} Cash found on the road`, amount: sum.stats.cash, cls: 'pos' }); total += sum.stats.cash; }
  if (sum.fuel > 0) { lines.push({ label: `${ICON('ui-fuel')} Fuel (${(sum.meters / 1000).toFixed(2)} km)`, amount: -sum.fuel, cls: 'neg' }); total -= sum.fuel; }
  if (sum.fines) { lines.push({ label: `${ICON('ui-police')} Fines`, amount: -sum.fines, cls: 'neg' }); total -= sum.fines; }
  total = Math.round(total * 100) / 100;
  xp += sum.xpBonus + sum.stats.perfect * 2 + sum.stats.overtakes;
  S.stats.meters += sum.meters; S.stats.overtakes += sum.stats.overtakes; S.stats.perfectHops += sum.stats.perfect; S.stats.shortcuts += sum.stats.shortcuts;
  S.today.earned += total; S.today.fuel += sum.fuel; S.today.tips += tipsT;
  const n = sum.orders.filter((x) => x.result).length || 1;
  St.earn(total, 'job');
  if (total > 0) St.weekProgress('earn', Math.round(total));
  S.stats.maxFlow = Math.max(S.stats.maxFlow || 1, sum.stats.bestFlow || 1);
  St.addXP(xp);
  const dayOver = St.advanceClock(sum.time * GAME_MIN_PER_SEC + 3 * n);
  unsub();
  An.track('job_end', { secs: Math.round(sum.time), m: Math.round(sum.meters), total, xp, fuel: sum.fuel, fines: sum.fines, cash: sum.stats.cash, levels: levels.length, dayOver: dayOver ? 1 : 0,
    veh: S.active, lvl: S.lvl, manual: ride.R.manual ? 1 : 0, stats: { ...sum.stats, boostT: Math.round(sum.stats.boostT * 10) / 10, stopT: Math.round(sum.stats.stopT * 10) / 10 },
    orders: sum.orders.filter((x) => x.result).map(({ o, result: r }) => ({ type: o.type, food: o.food, rest: o.rest, d: o.district, stars: r.stars, early: r.early ? 1 : 0, late: r.late ? 1 : 0,
      ratio: Math.round(r.ratio * 100) / 100, pay: r.pay, tip: r.tip, bonus: r.bonus, cond: Math.round(r.cond) })) });
  await new Promise((r) => setTimeout(r, 350));
  await ui.receipt({ lines, total, xp, avgStars: starsSum / n, goals: goalsHit.length ? `${goalsHit.length} goal${goalsHit.length > 1 ? 's' : ''} done!` : '' });
  for (const l of levels) await ui.levelUp(l, LEVEL_UNLOCKS[l] || []);
  for (const n of empNews) ui.employerNews(n);
  for (const a of checkAchievements()) ui.achievement(a);
  if (dayOver) { const rep = St.newDay(); An.track('day_end', { ...rep, earned: Math.round(rep.earned), fuel: Math.round(rep.fuel), tips: Math.round(rep.tips), fleet: Math.round(rep.fleet) }); await ui.dayReport(rep); }
  St.save(true);
  backToHub();
}
async function backToHub() {
  game.mode = 'tween';
  audio.loop('music', 'music-hub');
  const b = await parkBike();
  const x = b.root.position.x, z = b.root.position.z;
  const pose = hubCam.pose(x, z, 230);
  ride.R.takeCamera = false;
  cullChunks(view, 0, 0, null);
  sky.set(S.clock);
  await tweenCam(pose.pos, pose.quat, 30, 1.3);
  hubCam.snap(x, z, 230); hubCam.st.enabled = true;
  game.mode = 'hub'; ui.setMode('hub'); ui.setTab('city');
  game.board.forEach((o) => refreshOrder(city, o, playerTile()));
  fillBoard(true);
  updateMarkers(); updatePreview();
  ob.event('hub');
}

// ---------------------------------------------------------------- tabs → camera
// garage showroom: a street-level camera that orbits the parked bike (drag to turn)
const showroom = { on: false, yaw: 0.9, vyaw: 0, drag: null };
function showroomPose() {
  const b = ride.R.bike.root, hd = b.rotation.y;
  const a = hd + showroom.yaw, d = innerHeight > innerWidth ? 13 : 9;
  const c = new THREE.PerspectiveCamera(36, camera.aspect, 0.5, 4000);
  c.position.set(b.position.x + Math.sin(a) * d, d * 0.36, b.position.z + Math.cos(a) * d);
  c.lookAt(b.position.x, 0.9, b.position.z);
  return { pos: c.position, quat: c.quaternion, fov: 36 };
}
canvas.addEventListener('pointerdown', (e) => { if (showroom.on) showroom.drag = { x: e.clientX }; });
canvas.addEventListener('pointermove', (e) => { if (showroom.on && showroom.drag) { const dx = e.clientX - showroom.drag.x; showroom.drag.x = e.clientX; showroom.yaw -= dx * 0.008; showroom.vyaw = -dx * 0.5; } });
addEventListener('pointerup', () => { showroom.drag = null; });
async function enterShowroom() {
  await parkBike();
  hubCam.st.enabled = false; showroom.on = true; showroom.yaw = 0.9;
  const p = showroomPose(); await tweenCam(p.pos.clone(), p.quat.clone(), p.fov, 0.9);
}
async function leaveShowroom() {
  if (!showroom.on) return;
  showroom.on = false;
  const b = ride.R.bike.root.position;
  hubCam.snap(b.x, b.z, 200);
  const p = hubCam.pose(b.x, b.z, 200);
  await tweenCam(p.pos, p.quat, 30, 0.9);
  hubCam.st.enabled = true;
}
game.onTab = async (t) => {
  if (game.mode !== 'hub') return;
  ob.event('tab:' + t);
  An.track('tab', { tab: t });
  if (t === 'garage') return enterShowroom();
  await leaveShowroom();
  if (t === 'fleet' && S.fleet.office) hubCam.lookAt(officeLot.cx * TILE, officeLot.cz * TILE + 20, 160);
  else if (t === 'city') { const tt = city.tiles[playerTile()]; hubCam.lookAt(tt.x * TILE, tt.z * TILE, 230); }
};
game.focusDistrict = (id) => {
  const c = DCENTER[id];
  hubCam.lookAt(c[0] * TILE, c[1] * TILE + 60, 520);
  ui.setSheet('min');
};
// (auto-drive switched mid-ride takes effect from the next job: the bike can't jump between riding freely and the rail)
game.applySettings = () => { audio.apply(); const nq = quality(); if (nq !== QV) { QV = nq; resize(); } };

// ---------------------------------------------------------------- ride free look: drag to orbit, pinch / wheel to zoom
const rideLook = { ptrs: new Map(), last: null, start: null, t0: 0, snap: null, pinch: 0, zoom0: 1 };
const lookAllowed = () => game.mode === 'ride' && !document.getElementById('ridehud').classList.contains('evmode') && !document.querySelector('.modal');
canvas.addEventListener('pointerdown', (e) => {
  if (!lookAllowed()) return;
  rideLook.ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
  try { canvas.setPointerCapture(e.pointerId); } catch { /* synthetic or already-ended pointer */ }
  if (rideLook.ptrs.size === 1) { rideLook.last = { x: e.clientX, y: e.clientY }; rideLook.start = { ...rideLook.last }; rideLook.t0 = performance.now(); rideLook.snap = ride.camSnap(); ride.camHold(true); }
  if (rideLook.ptrs.size === 2) { const [a, b] = [...rideLook.ptrs.values()]; rideLook.pinch = Math.hypot(a.x - b.x, a.y - b.y); rideLook.zoom0 = ride.free.zoom; }
});
canvas.addEventListener('pointermove', (e) => {
  if (!rideLook.ptrs.has(e.pointerId) || game.mode !== 'ride') return;
  rideLook.ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (rideLook.ptrs.size >= 2) { const [a, b] = [...rideLook.ptrs.values()]; const d = Math.hypot(a.x - b.x, a.y - b.y); if (rideLook.pinch > 0) ride.camZoom(rideLook.zoom0 * rideLook.pinch / d); return; }
  if (!rideLook.last) return;
  ride.camDrag(e.clientX - rideLook.last.x, e.clientY - rideLook.last.y);
  rideLook.last = { x: e.clientX, y: e.clientY };
});
const lookUp = (e) => {
  if (!rideLook.ptrs.has(e.pointerId)) return;
  rideLook.ptrs.delete(e.pointerId);
  if (rideLook.ptrs.size === 1) { const p = [...rideLook.ptrs.values()][0]; rideLook.last = { x: p.x, y: p.y }; rideLook.pinch = 0; return; }
  if (rideLook.ptrs.size > 0) return;
  ride.camHold(false);
  // a quick flick left is the overtake gesture, not a look: undo what it did to the camera
  const dx = e.clientX - (rideLook.start?.x ?? e.clientX), dy = e.clientY - (rideLook.start?.y ?? e.clientY);
  if (performance.now() - rideLook.t0 < 450 && dx < -60 && Math.abs(dx) > Math.abs(dy) * 1.5) ride.camRestore(rideLook.snap);
  rideLook.last = null;
};
canvas.addEventListener('pointerup', lookUp); canvas.addEventListener('pointercancel', lookUp);
canvas.addEventListener('wheel', (e) => { if (game.mode !== 'ride') return; e.preventDefault(); ride.camZoom(ride.free.zoom * Math.exp(e.deltaY * 0.0012)); ride.free.idle = 0; }, { passive: false });

// ---------------------------------------------------------------- keyboard
const KEYS = { Space: 'boost', KeyW: 'hop', ArrowUp: 'hop', KeyH: 'horn', KeyA: 'overtake', ArrowLeft: 'overtake', KeyG: 'go', KeyS: 'shortcut' };
// riding yourself: pedals on W/S (or the arrows), steering on A/D, hop on Space, turbo on Shift
const KEYS_RIDE = { KeyW: 'gas', ArrowUp: 'gas', KeyS: 'brake', ArrowDown: 'brake', KeyA: 'left', ArrowLeft: 'left', KeyD: 'right', ArrowRight: 'right',
  Space: 'hop', ShiftLeft: 'boost', ShiftRight: 'boost', KeyH: 'horn' };
const HELD = new Set(['gas', 'brake', 'boost', 'left', 'right']);
const keyMap = () => (ride.R.manual ? KEYS_RIDE : KEYS);
addEventListener('keydown', (e) => {
  if (game.mode !== 'ride') return;
  const k = keyMap()[e.code];
  // pedals and steering keep working under an event card (the ride goes on in slow motion); everything else waits for it
  if (document.querySelector('.modal, .evdock') && !(k === 'gas' || k === 'brake' || k === 'left' || k === 'right')) return;
  if (e.code === 'KeyE') { const b = document.querySelector('.r-ctx .ctx'); if (b) ride.input(b.dataset.ride, true); e.preventDefault(); return; }
  if (!k) return;
  e.preventDefault();
  if (e.repeat && (k !== 'boost' || ride.R.manual)) return;
  ride.input(k, true);
});
addEventListener('keyup', (e) => { const k = keyMap()[e.code]; if (HELD.has(k)) ride.input(k, false); });
addEventListener('blur', () => { for (const k of HELD) ride.input(k, false); });
addEventListener('pointerdown', () => { if (!audio.ready) { audio.init(); audio.loop('music', game.mode === 'ride' ? 'music-ride' : 'music-hub'); game.amb = undefined; } }, { capture: true });

// ---------------------------------------------------------------- boot finish
St.ensureGoals(); St.ensureWeek();
fillBoard(true);
// achievements can also come from shopping, hiring and applying for jobs
St.on((w) => { if (['vehicles', 'fleet', 'districts'].includes(w)) for (const a of checkAchievements()) ui.achievement(a); });
await parkBike();
const startT = city.tiles[playerTile()];
hubCam.snap(startT.x * TILE, startT.z * TILE, q.get('dist') ? +q.get('dist') : 230);
if (q.get('clock')) S.clock = +q.get('clock'); // test hook: start the day at this minute
sky.set(S.clock);
ui.setMode('hub'); ui.setTab('city');
updateMarkers(); syncFleetRiders();
fill.style.width = '100%';
document.getElementById('boot').classList.add('out');

const off = St.tickFleet(Date.now(), true);
if (off && off.gain >= 1) { ui.offline(off); An.track('offline_earn', { gain: Math.round(off.gain), away: Math.round(off.away), capped: off.capped ? 1 : 0 }); }
// first launch: intro + guided first delivery (tests pass ?noti to skip it)
if (q.has('noti')) { if (S.onboard.step < 99) S.onboard.step = 99; }
else ob.start();
// careers from before achievements existed get theirs at once, in one note
{ const got = checkAchievements(); if (got.length && !fresh) setTimeout(() => ui.toast(`🏆 ${got.length} achievement${got.length > 1 ? 's' : ''} unlocked from your career so far — see Courier`, 'good'), 1800); }

// ---------------------------------------------------------------- hub view offset: centre the map in the area the sheet leaves free
const vo = { x: 0, y: 0 };
const sheetEl = document.getElementById('sheet'), topEl = document.querySelector('.topbar');
function updateViewOffset(dt) {
  let tx = 0, ty = 0;
  if (game.mode === 'hub' || (game.mode === 'tween' && !ride.R.active)) {
    const W = innerWidth, H = innerHeight, r = sheetEl.getBoundingClientRect(), top = topEl.getBoundingClientRect().bottom + 30;
    if (r.width > W * 0.8) ty = H / 2 - (top + r.top) / 2; // sheet at the bottom
    else tx = -(r.right + 10) / 2; // sheet on the left (landscape)
  }
  const k = 1 - Math.exp(-dt * 8);
  vo.x += (tx - vo.x) * k; vo.y += (ty - vo.y) * k;
  if (Math.abs(vo.x) + Math.abs(vo.y) < 0.5 && tx === 0 && ty === 0) { if (camera.view) camera.clearViewOffset(); return; }
  camera.setViewOffset(innerWidth, innerHeight, vo.x, vo.y, innerWidth, innerHeight);
}

// ---------------------------------------------------------------- adaptive quality (auto mode): watch frame times
const perf = { acc: 0, n: 0, step: 0 };
function adapt(dt) {
  if (S.settings.quality !== 'auto') return;
  perf.acc += dt; perf.n++;
  if (perf.acc < 4) return;
  const ms = perf.acc / perf.n * 1000; perf.acc = 0; perf.n = 0;
  if (ms > 38 && perf.step < 3) {
    perf.step++;
    if (perf.step === 1) renderer.setPixelRatio(Math.min(devicePixelRatio, 1.15));
    if (perf.step === 2) { renderer.setPixelRatio(1); sky.sun.shadow.mapSize.set(1024, 1024); sky.sun.shadow.map?.dispose(); sky.sun.shadow.map = null; }
    if (perf.step === 3) { renderer.shadowMap.enabled = false; scene.traverse((o) => { if (o.material) o.material.needsUpdate = true; }); }
    resize(); console.log('quality step', perf.step, ms.toFixed(1) + 'ms');
    An.track('quality_step', { step: perf.step, ms: Math.round(ms * 10) / 10, mode: game.mode });
  }
}
if (q.has('fps')) { const el = document.createElement('div'); el.style.cssText = 'position:fixed;left:4px;bottom:70px;z-index:99;font:12px monospace;background:#000a;color:#0f0;padding:2px 4px'; document.body.append(el); let f = 0, t0 = performance.now(); setInterval(() => { el.textContent = `${Math.round(f * 1000 / (performance.now() - t0))} fps · ${renderer.info.render.calls} calls · ${(renderer.info.render.triangles / 1000).toFixed(0)}k tris · step ${perf.step}`; f = 0; t0 = performance.now(); }, 1000); renderer.info.autoReset = true; const r0 = renderer.render.bind(renderer); renderer.render = (a, b) => { f++; r0(a, b); }; }

// ---------------------------------------------------------------- loop
const timer = new THREE.Timer();
let boardT = 0, fleetT = 0, lastNight = -1, lifeT = 0, topT = 0;
function frame() {
  timer.update();
  const dt = Math.min(0.05, timer.getDelta());
  waterTime.value += dt; toyUni.uTime.value += dt; backdrop.update(dt); train.update(dt * (game.mode === 'ride' ? ride.R.timeScale : 1));
  ribbonTime.value += dt;
  const ts = game.mode === 'ride' ? ride.R.timeScale : 1;
  traffic.update(dt * ts);
  if (tween) {
    tween.t += dt / tween.dur;
    const e = ease(Math.min(1, tween.t));
    camera.position.lerpVectors(tween.fromPos, tween.toPos, e);
    camera.quaternion.slerpQuaternions(tween.fromQuat, tween.toQuat, e);
    camera.fov = tween.fromFov + (tween.toFov - tween.fromFov) * e; camera.updateProjectionMatrix();
    if (tween.t >= 1) { const r = tween.res; tween = null; r(); }
  }
  updateViewOffset(dt);
  if (game.mode === 'ride' || (game.mode === 'tween' && ride.R.active)) {
    ride.update(dt);
    const b = ride.R.bike.root.position;
    peds.update(dt * ts, b.x, b.z, 110);
    cullChunks(view, b.x, b.z, QV === 'low' ? 220 : 380);
    props.update(b.x, b.z, QV === 'low' ? 120 : 180, camera);
    sky.focus(b.x, b.z, 90, camera);
    const clk = Math.min(DAY_END - 1, S.clock + ride.R.rideTime * GAME_MIN_PER_SEC);
    weather.update(dt * ts, clk, S.day, camera);
    const wr = weather.rain;
    scene.fog.near = (QV === 'low' ? 45 : 60) * (1 - 0.45 * wr); scene.fog.far = (QV === 'low' ? 230 : 420) * (1 - 0.45 * wr);
    sky.state.rain = wr;
    sky.set(clk);
    audio.engineSpeed(ride.R.v / Math.max(1, ride.R.vs?.top || 10), ride.R.boost, ride.R.load, ride.R.v, ride.R.slip);
  } else if (game.mode === 'peek') {
    // test camera: a fixed rider's-eye view of one street (tools/look.mjs)
    const b = ride.R.bike?.root.position || camera.position;
    peds.update(dt, b.x, b.z, 110);
    cullChunks(view, b.x, b.z, QV === 'low' ? 220 : 380);
    props.update(b.x, b.z, QV === 'low' ? 120 : 180, camera);
    sky.focus(b.x, b.z, 90, camera);
    weather.update(dt, S.clock, S.day, camera);
    sky.state.rain = weather.rain; sky.set(S.clock);
    scene.fog.near = (QV === 'low' ? 45 : 60); scene.fog.far = (QV === 'low' ? 230 : 420);
    if (ride.R.bike) ride.R.bike.update(dt, 0);
  } else {
    if (game.mode === 'hub') hubCam.update(dt);
    if (game.mode === 'hub' && showroom.on && !tween && ride.R.bike) {
      if (!showroom.drag) { showroom.yaw += showroom.vyaw * dt * 0.02 + dt * 0.12; showroom.vyaw *= Math.exp(-dt * 3); }
      const p = showroomPose(); camera.position.copy(p.pos); camera.quaternion.copy(p.quat); camera.fov = p.fov; camera.updateProjectionMatrix();
    }
    if (ride.R.bike) ride.R.bike.update(dt, 0);
    const fx = hubCam.st.x, fz = hubCam.st.z;
    peds.update(dt, fx, fz, 160);
    props.update(fx, fz, Math.min(260, Math.max(120, hubCam.st.dist * 0.95)));
    sky.focus(fx, fz, Math.min(900, hubCam.st.dist * 1.7), camera);
    weather.update(dt, S.clock, S.day, camera);
    sky.state.rain = weather.rain; sky.set(S.clock);
    scene.fog.near = hubCam.st.dist * 1.6 * (1 - 0.3 * weather.rain); scene.fog.far = hubCam.st.dist * 5.5 * (1 - 0.3 * weather.rain);
    if (game.mode === 'hub') {
      document.getElementById('markers').hidden = showroom.on;
      for (const m of fleetMarkers) m.pos.set(m.data.pos[0], 7, m.data.pos[1]);
      markers.update(innerWidth, innerHeight);
      lifeT += dt; if (lifeT > 1) { lifeT = 0; const now = performance.now(); for (const el of document.querySelectorAll('.ocard')) { const o = game.board.find((x) => x.id === +el.dataset.id); if (o && !game.taken.includes(o)) el.querySelector('.olife').style.width = Math.max(0, 100 - (now - o.born) / 10 / o.life) + '%'; } }
      topT += dt; if (topT > 1) { topT = 0; ui.refreshTop(); }
      boardT += dt; if (boardT > 4) { boardT = 0; if (fillBoard()) { updateMarkers(); if (ui.tab === 'city' && !document.querySelector('.modal')) ui.render(); } }
    }
  }
  fleetT += dt; if (fleetT > 1) { fleetT = 0; St.tickFleet(Date.now(), false, game.mode === 'ride' ? FLEET.dispatch : 1); }
  if (sky.state.night !== lastNight) { lastNight = sky.state.night; setCityNight(lastNight); props.setNight(lastNight); carUni.uNight.value = lastNight; lampUni.uNight.value = lastNight; ride.setNight?.(lastNight); renderer.toneMappingExposure = 1.0 + lastNight * 0.25; setEnvNight(lastNight); }
  // rain sound follows the weather (ride: city / night ambience otherwise)
  const ambWant = weather.rain > 0.3 ? 'amb-rain' : game.mode === 'ride' ? (sky.state.night > 0.5 ? 'amb-night' : 'amb-city') : null;
  if (ambWant !== game.amb) { game.amb = ambWant; audio.loop('amb', ambWant); }
  adapt(dt);
  renderer.render(scene, camera);
}
renderer.setAnimationLoop(frame);
document.addEventListener('visibilitychange', () => { if (document.hidden) St.save(true); });
// headless test hook: advance the simulation without rendering
game.skipTween = () => { if (tween) tween.t = 1; };
game.refill = () => fillBoard(true);
// order board filter changed: drop orders from other districts (unless already taken) and refill
game.refocus = () => {
  if (S.focus) game.board = game.board.filter((o) => game.taken.includes(o) || o.district === S.focus);
  fillBoard(true); updateMarkers(); updatePreview();
};
game.testEvent = (id, lead) => { if (ride.R.active) ride.testEvent(EVENT[id], lead); };
game.sim = (sec, step = 1 / 30) => { for (let t = 0; t < sec; t += step) { traffic.update(step * (game.mode === 'ride' ? ride.R.timeScale : 1)); if (ride.R.active) ride.update(step); } };
// test hook: look down the street at road tile (tx,tz) heading d (0 N, 1 E, 2 S, 3 W) from the ride camera's spot
game.peek = async (tx, tz, d = 1, { back = 8, up = 4.3, ahead = 10, fov = 62, bike = true } = {}) => {
  const b = await ride.ensureBike(); scene.add(b.root);
  const f = DIRS[d], r = DIRS[(d + 1) & 3];
  const x = tx * TILE + r[0] * 1.6, z = tz * TILE + r[1] * 1.6;
  b.root.position.set(x, 0.1, z); b.root.rotation.set(0, Math.atan2(f[0], f[1]), 0); b.root.visible = bike;
  b.rider?.play('drive', 0);
  game.mode = 'peek'; ui.setMode('ride'); document.getElementById('ui').hidden = true; document.getElementById('markers').hidden = true;
  if (camera.view) camera.clearViewOffset();
  camera.position.set(x - f[0] * back, up, z - f[1] * back);
  camera.lookAt(x + f[0] * ahead, 1.1, z + f[1] * ahead);
  camera.fov = fov; camera.updateProjectionMatrix();
};
window.game = Object.assign(game, { scene, camera, renderer, view, sky, hubCam, St, traffic, peds, ui, markers, props, train, backdrop });
window.ready = true;
// analytics: where the player is right now (quit points, errors)
An.ready({ fresh, gl: renderer.getContext(), at: () => {
  if (document.getElementById('intro')) return 'intro';
  const m = document.querySelector('.modal');
  if (m) return 'modal:' + (m.classList[1] || '?');
  if (game.mode === 'ride') return 'ride:' + ride.R.phase;
  return game.mode === 'hub' ? 'hub:' + ui.tab : game.mode;
} });

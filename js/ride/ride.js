// Delivery ride: the bike drives itself along the route (or, riding freely on desktop, the player steers it anywhere
// in the city and the route is only the GPS). On a phone it rides the courier run ('run'): the autopilot keeps the
// pace and takes the corners, the busy traffic, people crossing and red lights are the rider's (the BRAKE pedal, lane
// swipes, a swipe up to hop). For QA, `?ctl=b` is the late brake (gas always open, hold anywhere to brake: corners
// too), `?ctl=a` the lane run (brake and change lanes) and `?ctl=stop` the autopilot with powers and a STOP button.
import * as THREE from 'three';
import { TILE, FOODS, GAME_MIN_PER_SEC, VEHICLE, DISTRICT, DPROFILE } from '../data.js';
import { DIRS, OPP, RIGHT, LEFT, K } from '../city/gen.js';
import { findPath, buildRoute, sampleRoute, LANE, laneCurve, dirBetween, routeArcs } from '../city/graph.js';
import { planHazards, makeHazardMesh, freeHazard, HZ, warmPeds } from './hazards.js';
import { Y as GROUND, boxHit } from './world.js';
import { pickEvent } from './events.js';
import { makeBike } from './vehicle.js';
import { buildRibbon } from './ribbon.js';
import { createFx } from './fx.js';
import { makeDog, makeBird, makeBall, makeDoorCar, makePoliceCar, makePerson } from './actors.js';
import { buzz } from '../haptics.js';
import { makeChar, loadChar, loadKit, hasKit, pieceParts } from '../assets.js';
import { scoreOrder } from '../orders.js';
import * as St from '../state.js';
import { mulberry32 } from '../rng.js';
import { track } from '../analytics.js';

const A_LAT = 8.5, B_DEC = 7.5, ROAD_Y = 0.1; // asphalt top (kit 0.01 × 10 m)
// lanes & brake: where each lane is, across the road from the middle of ours (+ = right): the oncoming lane, ours, and
// the sidewalk's walking line (5.5 m off the road's middle, between the tree line and the café tables)
const LAT = { [-1]: -2 * LANE, 0: 0, 1: 3.9 };
const KERB = 2.4, BRAKE = 9.5, LC_T = 0.36, RING_B = 2.6; // our lane → kerb (m), full brake (m/s²), lane change (s), door ring
const SMOOTH_V = 4.5; // the brake: over a pothole or a puddle at this (16 km/h) or less, the springs take it
const COIN = 0.15; // the courier run: a coin, × the district's pay
const v3 = new THREE.Vector3(), v3b = new THREE.Vector3();
const ahead = [0, 0, 0, 0, 0], camAhead = [0, 0, 0, 0, 0];
const look_ = new THREE.Vector3();
const KAP_OFFS = [-3, -1.5, 0, 1.5, 3];

export function createRide(ctx) {
  const { scene, camera, city, traffic, world } = ctx;
  const rng = mulberry32((Date.now() & 0xffff) ^ 0x5eed);
  const R = {
    active: false, phase: 'idle', timeScale: 1, job: null, leg: 0, route: null, s: 0, v: 0, energy: 100, energyMax: 100,
    boost: false, hop: null, ot: null, runLight: -1, wait: 0, crash: 0, hazards: [], event: null, eventDone: false,
    orders: [], legMeters: 0, meters: 0, stats: null, shake: 0, camFov: 60, bike: null, agent: null, offer: null, hornCd: 0,
    lean: 0, steer: 0, lat: 0, sampled: [0, 0, 0, 0, 0], recentEvents: [], arcs: [], blend: null, yawOff: 0, camYaw: null, fines: 0, rideTime: 0,
    manual: false, ctl: { gas: false, brake: false, left: false, right: false }, cornerWarn: false, ring: null, kap: 0,
    // feel: smoothed longitudinal acceleration (m/s²), throttle load 0–1, corner grip used (manual), brake ramp, camera springs
    accS: 0, load: 0, slip: 0, brk: 0, hardBrake: false, camG: 0, camKy: 0, camKv: 0,
    // lanes & brake: the scheme ('a' lane run, 'b' late brake), the lane and a change under way, the slide out of a
    // corner taken too fast, the draft behind a car and the slingshot out of it, the gear, the brake zone ahead
    // the autopilot (phones, and desktop with Auto-drive): what the rider tapped STOP for, and what the button offers
    auto: false, stops: [], stopP: null, stopUi: null,
    scheme: null, lane: 0, lc: null, laneLat: 0, wide: 0, wideT: 0, draft: 0, sling: 0, gear: 1, bz: null, brakeT: 9, over: null, junc: null, lightLeft: Infinity,
  };
  const pfx = createFx(scene); // particles (R.fx is the skill table)
  // ---- Flow: chaining stunts builds a tip multiplier (×2 max) and refills turbo; mistakes break it ----
  const FLOW_TIME = 7;
  function flow(label, pts = 1) {
    const F = R.flow;
    F.n += pts; F.t = FLOW_TIME; F.mult = Math.min(2, 1 + 0.1 * Math.floor(F.n));
    R.stats.bestFlow = Math.max(R.stats.bestFlow, F.mult);
    R.energy = Math.min(R.energyMax, R.energy + 7 * pts);
    ctx.ui.flowPop?.(label, F);
    ctx.audio?.play('qte-good', { vol: 0.35, rate: 1 + Math.min(0.6, F.n * 0.05) });
    R.bike?.cheer?.();
    buzz(18);
  }
  function flowBreak() {
    const F = R.flow;
    if (F.n >= 3) ctx.ui.flowPop?.('FLOW LOST', F, true);
    F.n = 0; F.t = 0; F.mult = 1;
  }
  const wp = new THREE.Vector3();
  const agent = { kind: 'player', tile: 0, din: 0, dout: 0, s: 0, v: 0, len: 2.2, off: LANE, pos: [0, 0, 0], curve: null, cx: 0, cz: 0 };
  R.agent = agent;
  let bikeId = null;

  // headlight for night rides
  const head = new THREE.SpotLight(0xfff0d0, 0, 38, 0.55, 0.6, 1.2);
  head.position.set(0, 1.1, 0.6); head.target.position.set(0, 0, 9);
  let nightLvl = 0;
  function setNight(n) { nightLvl = n; head.intensity = n * 60; head.visible = n > 0.05; pfx.setNight(n); }
  async function ensureBike() {
    const vs = St.vehStats();
    const want = `${St.S.active}|${vs.paint}|${vs.boxColor}|${St.S.look.char}|${St.S.look.helmet}`;
    if (bikeId === want && R.bike) return R.bike;
    if (R.bike) R.bike.root.removeFromParent();
    R.bike = await makeBike(St.S.active, { paint: vs.paint, box: vs.boxColor, char: St.S.look.char, helmet: St.S.look.helmet });
    R.bike.root.add(head, head.target);
    bikeId = want;
    return R.bike;
  }

  // ---------- job flow ----------
  async function start(job, fromTile, fromDir) {
    await Promise.all([ensureBike(), warmPeds(), loadKit('roads')]);
    loadKit('food').catch(() => {}); // the takeaway bag the restaurant hands over; ready long before the first door
    const vs = St.vehStats();
    const fx = St.skillFx();
    R.vs = vs; R.fx = fx;
    R.job = job; R.leg = 0; R.active = true; R.timeScale = 1; R.fines = 0; R.rideTime = 0;
    R.scheme = ctx.scheme?.() || null;
    R.manual = !R.scheme && !!ctx.manual?.() && !!world; R.auto = !R.scheme && !R.manual; R.accS = 0; R.load = 0; R.slip = 0; R.brk = 0; R.camG = 0; R.camKy = 0; R.camKv = 0; R.cornerWarn = false;
    R.energyMax = 100 * fx.energy; R.energy = R.energyMax;
    // the people we'll meet at the doors: fetch them now (phones only preload a few), not when the bike pulls up
    for (const id of new Set(['female-c', ...job.orders.map((o) => o.char), ...(job.orders.some((o) => o.rest === 'sultan') ? ['male-d'] : [])])) loadChar(id).catch(() => {});
    R.orders = job.orders.map((o) => ({ o, elapsed: 0, heat: 100, integrity: 100, picked: false, done: false, tipMult: 1, ratingAdj: 0, result: null }));
    R.stats = { overtakes: 0, perfect: 0, shortcuts: 0, crashes: 0, bumps: 0, events: 0, cash: 0, meters: 0, nearMisses: 0, bestFlow: 1, hops: 0, horns: 0, boostT: 0, stopT: 0, skids: 0, reroutes: 0 };
    // lanes & brake: time on the brake, lane changes, slingshots, perfect corners, corners slid wide, perfect stops at
    // the door, doors overshot, best gear, metres on the sidewalk, red lights run (on the brake also: camera fines,
    // pedestrians given a fright, potholes taken smoothly)
    if (R.scheme) Object.assign(R.stats, { brakeT: 0, lanes: 0, slings: 0, corners: 0, wide: 0, stops: 0, overshoots: 0, gearMax: 1, walkM: 0, reds: 0, turns: 0, waves: 0 });
    if (R.scheme === 'b') Object.assign(R.stats, { tickets: 0, pedHits: 0, smooth: 0 });
    // the courier run: camera fines, pedestrians given a fright, coins picked up, orders ruined
    if (R.scheme === 'run') Object.assign(R.stats, { tickets: 0, pedHits: 0, coins: 0, ruined: 0 });
    // the autopilot: stops made with STOP (of them perfect), red lights run, doors ridden past, pedestrians given a
    // fright, cross traffic that had to brake for us
    if (R.auto) Object.assign(R.stats, { halts: 0, stops: 0, reds: 0, overshoots: 0, pedHits: 0, tickets: 0, waves: 0 });
    R.flow = { n: 0, t: 0, mult: 1 };
    R.meters = 0; R.wideTold = false;
    scene.add(R.bike.root);
    if (!traffic.agents.includes(agent)) traffic.addAgent(agent);
    if (!ringMk.parent) scene.add(ringMk);
    R.curTile = fromTile; R.curDir = fromDir;
    if (R.manual) initFree();
    beginLeg();
  }

  function legTarget(leg) { return city.lots[leg.lot].door; }
  function beginLeg() {
    const leg = R.job.legs[R.leg];
    const to = legTarget(leg);
    let path = findPath(city, R.curTile, to, { noBack: R.curDir >= 0 ? OPP(R.curDir) : -1 });
    if (!path) path = findPath(city, R.curTile, to);
    // already at this door (two orders for one building, or a job that starts at the restaurant): the scene plays
    // right here. A one-tile route still gets built so everything that reads R.route keeps working.
    if (R.manual) R.ring = legRing(leg);
    R.here = path.length < 2 || (R.manual && Math.hypot(F.x - R.ring.x, F.z - R.ring.z) < RING_R);
    if (path.length < 2) {
      const t = city.tiles[R.curTile]; const d = [0, 1, 2, 3].find((k) => t.mask & (1 << k));
      path = [R.curTile, R.curTile + DIRS[d][0] + DIRS[d][1] * city.W];
    }
    R.route = buildRoute(city, path, { startDir: R.curDir });
    R.arcs = routeArcs(R.route);
    setRibbon();
    R.s = 0; R.v = R.leg === 0 ? 0 : R.v; R.ot = null; R.hop = null; R.runLight = -1; R.wait = 0; R.crash = 0; R.offer = null; R.lat = 0;
    R.sampled[3] = 0; R.prevLat = 0; R.yawOff = 0;
    if (R.scheme) schemeLeg();
    if (R.auto) autoLeg();
    // after resetting s: ease the bike from where it stands onto the start of the new route (riding freely, the bike
    // stays where the rider left it and the GPS finds it there)
    if (R.manual) { project(40); F.ringIn = false; F.told = false; F.gpsT = 0.6; F.offT = F.wrongT = 0; }
    else if (R.leg > 0) startBlend();
    // hazards
    for (const h of R.hazards) freeHazard(h);
    const tutorial = St.S.stats.deliveries < 2;
    // veterans meet a busier street: hazards and events ramp up with courier level
    const lvlP = Math.min(1.5, 1 + 0.04 * (St.S.lvl - 1));
    R.hazards = plan(R.route, { density: tutorial ? 0.6 : lvlP, tutorial, rain: ctx.weather?.rain || 0 });
    for (const h of R.hazards) { h.obj = makeHazardMesh(h); scene.add(h.obj); placeHazard(h); }
    // event
    const isDrop = leg.kind === 'drop';
    const evD = city.tiles[R.route.steps[0].tile].d;
    const p = St.S.stats.deliveries < 1 ? 0 : (isDrop ? 0.5 : 0.22) * (DPROFILE[evD]?.ev ?? 1) * Math.min(1.35, 1 + 0.025 * (St.S.lvl - 1));
    R.event = null; R.eventDone = false;
    if (rng() < p && R.route.length > 90) {
      const foods = R.orders.filter((x) => x.picked && !x.done).map((x) => x.o.food);
      const ev = pickEvent(rng, { district: city.tiles[R.route.steps[0].tile].d, lvl: St.S.lvl, hasFood: foods.length > 0, foods, skills: St.S.skills,
        breakdown: R.vs.breakdown, clock: St.S.clock, recent: R.recentEvents, raining: (ctx.weather?.rain || 0) > 0.2, noLight: R.auto || R.scheme === 'b' || R.scheme === 'run' }); // (the autopilot's lights are STOP's, the brake's and the run's the rider's)
      if (ev) R.event = { ev, s: R.route.length * (0.3 + rng() * 0.35) };
    }
    // forced breakdown chance for junk bikes
    if (!R.event && rng() < R.vs.breakdown * (isDrop ? 0.6 : 0.3) && St.S.stats.deliveries >= 1) {
      const ev = pickEvent(() => 0, { district: 'oldtown', lvl: 1, hasFood: true, foods: [], skills: {}, breakdown: 1, clock: St.S.clock, recent: [] });
      if (ev && ev.breakdown) R.event = { ev, s: R.route.length * (0.25 + rng() * 0.4) };
    }
    clearActors();
    if (R.event && R.event.ev.pre) prePlace(R.event);
    R.phase = 'ride';
    if (ribbon) ribbon.visible = true;
    ctx.ui.rideLeg(leg, R);
    ctx.audio?.engine(true, St.S.active);
  }

  // ease the bike from its current pose onto the start of a new route (leg changes, shortcuts)
  function startBlend() {
    if (!R.bike) return;
    const o = sampleRoute(R.route, R.s, [0, 0, 0, 0, 0]), b = R.bike.root;
    let dh = b.rotation.y - o[2]; while (dh > Math.PI) dh -= 2 * Math.PI; while (dh < -Math.PI) dh += 2 * Math.PI;
    const dx = b.position.x - o[0], dz = b.position.z - o[1];
    R.blend = Math.hypot(dx, dz) < 8 ? { dx, dz, dh, t: 1 } : null;
  }
  let ribbon = null;
  function setRibbon() {
    if (ribbon) { ribbon.removeFromParent(); ribbon.geometry.dispose(); }
    ribbon = buildRibbon(R.route, { width: 2.5, y: 0.16, step: 1, color: '#4cc9ff', chevrons: true });
    scene.add(ribbon);
  }
  // hazards for a route; with lanes & brake there's no turbo to fill (energy cans become cash), and on the lane run
  // some of the cash waits on the sidewalk. The brake has no lanes to go round a double-parked car or road works, so
  // there they're cones: another thing to brake for.
  function plan(route, opts) {
    const list = planHazards(route, city, rng, opts);
    if (R.scheme) for (const h of list) {
      if (h.type === 'energy') h.type = 'cash';
      if (R.scheme === 'b' && (h.type === 'parked' || h.type === 'barrier')) h.type = 'cones';
      if ((R.scheme === 'a' || R.scheme === 'run') && h.type === 'cash' && h.lane > 0 && rng() < 0.4 && walkRun(h.s - 6, route) > 12) h.lane = 2;
    }
    if (R.scheme === 'run') list.push(...coinTrails(route, list));
    return list;
  }
  // the courier run: lines of coins down the straights, longer out in the risky lanes (the oncoming lane, the sidewalk)
  function coinTrails(route, list) {
    const steps = route.steps, arcs = route === R.route ? R.arcs : routeArcs(route), out = [];
    let last = 24;
    for (let k = 1; k < steps.length - 2; k++) {
      const st = steps[k];
      if (st.alley || st.din !== st.dout || city.tiles[st.tile].junction) continue;
      const s0 = st.s0 + 1 + rng() * 3;
      if (s0 - last < 16 || route.length - s0 < 30 || rng() > 0.5) continue;
      const r = rng(), lane = r < 0.3 ? 1 : r < 0.65 || walkRun(s0 - 2, route) < 18 ? -1 : 2, n = lane === 1 ? 5 : 7;
      if (arcs.some((a) => a.s1 > s0 - 2 && a.s0 < s0 + n * 2.2 + 2)) continue;
      for (let i = 0; i < n; i++) {
        const s = s0 + i * 2.2;
        if (!list.some((h) => Math.abs(h.s - s) < (HZ[h.type].len || 1) / 2 + 2)) out.push({ type: 'coin', s, lane, tile: st.tile });
      }
      last = s0 + n * 2.2;
    }
    return out;
  }
  function placeHazard(h) {
    const o = sampleRoute(R.route, h.s, [0, 0, 0, 0]);
    const hd = o[2];
    const rx = -Math.cos(hd), rz = Math.sin(hd);
    const off = h.lane < 0 ? -2 * LANE : h.lane === 2 ? LAT[1] : 0;
    h.x = o[0] + rx * off; h.z = o[1] + rz * off; h.hd = hd;
    h.obj.position.set(h.x, h.obj.position.y, h.z);
    h.obj.rotation.y = hd;
    if (h.type === 'ped') { h.cross = -1; h.bx = o[0]; h.bz = o[1]; h.obj.position.set(o[0] - rx * 4.2, 0.12, o[1] - rz * 4.2); h.px = -4.2; h.obj.rotation.y = hd + Math.PI / 2; h.walking = false; }
  }

  // ---------- helpers ----------
  const stepAt = () => R.route.steps[R.sampled[3]];
  function leaderAhead() {
    // nearest car in our lane ahead along the route (m, bumper to bumper)
    let best = Infinity, who = null;
    const k0 = R.sampled[3];
    for (let k = k0; k < Math.min(R.route.steps.length, k0 + 4); k++) {
      const st = R.route.steps[k];
      const list = traffic.byTile.get(st.tile); if (!list) continue;
      for (const a of list) {
        if (a === agent || a.off < 0 && a.kind !== 'car') continue;
        if (a.din !== st.din || a.off <= 0) continue;
        const d = st.s0 + a.s - R.s - (a.len + agent.len) / 2;
        if (d > -1 && d < best) { best = d; who = a; }
      }
    }
    return { gap: best, who };
  }
  function oncoming() {
    // nearest oncoming car in the opposite lane ahead (distance, closing speed): one riding our way back (a car turning
    // off at a junction, or in, isn't coming down our lane)
    let best = Infinity, who = null;
    const k0 = R.sampled[3];
    for (let k = k0; k < Math.min(R.route.steps.length, k0 + 6); k++) {
      const st = R.route.steps[k];
      const list = traffic.byTile.get(st.tile); if (!list) continue;
      for (const a of list) {
        if (a.kind !== 'car' || a.din !== OPP(st.dout) || a.dout !== OPP(st.din)) continue;
        const d = st.s0 + (st.len - a.s) - R.s - (a.len + agent.len) / 2;
        if (d > -2 && d < best) { best = d; who = a; }
      }
    }
    return { dist: best, who };
  }
  // (skip: hazards to leave out — the autopilot doesn't wait for jaywalkers)
  function blockingHazard(skip = null) {
    let best = null, bd = Infinity;
    for (const h of R.hazards) {
      if (h.done || !HZ[h.type].block || skip?.(h)) continue;
      if (h.lane < 0) continue;
      const d = h.s - R.s - (HZ[h.type].len || 1) / 2 - 1.2;
      if (d > -1.5 && d < bd) { bd = d; best = h; }
    }
    return { h: best, d: bd };
  }
  function nextLight(n = 3) {
    // distance to the stop line of the next junction with a signal (and its state), up to n tiles on
    const k0 = R.sampled[3];
    for (let k = k0; k < Math.min(R.route.steps.length, k0 + n); k++) {
      const st = R.route.steps[k + 1]; if (!st) break;
      if (!traffic.lightAt.has(st.tile)) continue;
      // stop before the turn starts: a corner arc can begin a few metres before the junction tile
      let line = st.s0;
      for (const a of R.arcs) if (a.s0 < line && a.s1 > line - 0.1) line = a.s0;
      const d = line - R.s - 0.8;
      if (d < -0.5) continue;
      return { tile: st.tile, d, din: st.din, state: traffic.light(st.tile, st.din) };
    }
    return null;
  }

  // ---------- input ----------
  function input(what, down = true) {
    // pedals and steering are held keys: remember them even between legs, so a key released during a scene is not stuck
    if (what === 'gas' || what === 'brake' || what === 'left' || what === 'right') { R.ctl[what] = down; return; }
    if (!R.active || R.phase !== 'ride') return;
    // lanes & brake: a swipe is the only other thing the rider does (no powers); a junction's arrows can be tapped too
    if (R.scheme && what.startsWith('turn-')) { if (down && R.junc && R.crash <= 0 && R.wait <= 0) chooseTurn({ 'turn-left': -1, 'turn-straight': 2, 'turn-right': 1 }[what]); return; }
    if (R.scheme) { if (down) laneInput({ 'lane-left': -1, 'lane-right': 1, 'swipe-up': 2 }[what] || 0); return; }
    if (what === 'boost') {
      const was = R.boost; R.boost = down && R.energy > 4;
      if (R.boost && !was) {
        ctx.audio?.play('boost', { vol: 0.7 });
        R.bike?.wheelie?.(Math.max(0.35, 1 - R.v / (R.vs.top * 1.3))); buzz(18);
        if (R.bike && R.phase === 'ride') { const b = R.bike.root, hd = b.rotation.y; if (R.bike.exhaust) R.bike.exhaust.getWorldPosition(wp); else wp.set(b.position.x - Math.sin(hd) * 0.9, 0.45, b.position.z - Math.cos(hd) * 0.9); pfx.boostStart(wp.x, wp.y, wp.z, Math.sin(hd), Math.cos(hd), R.vs.v.engine === 'engine-electric'); }
      }
      return;
    }
    if (!down) return;
    if (what === 'hop') return doHop();
    if (what === 'horn') return doHorn();
    if (what === 'overtake') return doOvertake();
    if (what === 'stop') return doStop();
    if (what === 'shortcut') return takeShortcut();
  }
  // swap the route ahead (shortcut): keep the bike where it is, re-plan hazards, move an event still to come
  function replaceRoute(path) {
    const cur = R.route.steps[R.sampled[3]];
    const into = R.s - cur.s0;
    const route = buildRoute(city, path, { startDir: cur.din, firstFull: true });
    R.route = route; R.s = Math.max(0, Math.min(into, route.steps[1] ? route.steps[1].s0 - 0.5 : into)); R.sampled[3] = 0;
    R.arcs = routeArcs(route);
    // (lanes & brake: back on the new route's line — the blend below carries the bike over from whichever lane it was in)
    if (R.scheme) { R.lane = 0; R.lc = null; R.laneLat = R.lat = R.wide = R.wideT = 0; R.arcIn = null; R.autoBack = null; R.junc = null; }
    R.stops = []; R.stopP = null; // (what STOP was tapped for sat on the old route)
    startBlend();
    for (const h of R.hazards) freeHazard(h);
    R.hazards = plan(route, { startS: R.s + 20 }).filter((h) => h.s > R.s + 15);
    for (const h of R.hazards) { h.obj = makeHazardMesh(h); scene.add(h.obj); placeHazard(h); }
    moveEvent();
    setRibbon();
    ctx.ui.routeChanged(R);
  }
  // a new route under an event still to come: it moves down the new way (with its props), or drops if too near
  function moveEvent() {
    if (!R.event || R.event.fired || !R.event.ev) return;
    if (R.event.prop) { disposeActor(R.event.prop); const i = actors.indexOf(R.event.prop); if (i >= 0) actors.splice(i, 1); R.event.prop = null; }
    R.event.s = Math.min(R.s + 45, R.route.length * 0.7);
    if (R.event.s < R.s + 6 || R.route.length - R.event.s < 30) R.event = null; // too close to come up properly, or to the door
    else if (R.event.ev.pre) prePlace(R.event);
  }
  function doHop() {
    if (R.hop || R.crash > 0) return;
    const T = 0.62 * (1 + 0.04 * (St.S.vehicles[St.S.active].parts.tires || 0));
    R.hop = { t: 0, T, s0: R.s };
    R.stats.hops++;
    ctx.audio?.play('hop');
    { const p = R.bike.root.position; pfx.hopTakeoff(p.x, p.z); }
    // judge against the nearest hoppable hazard (riding freely: the nearest one in front of the wheel)
    let best = null, bd = Infinity;
    for (const h of R.hazards) {
      if (h.done || !HZ[h.type].hop) continue;
      if (R.manual || R.scheme ? !h.inPath : h.lane < 0 && !R.ot) continue;
      const d = R.manual ? h.ahead : h.s - R.s; if (d > -0.5 && d < bd) { bd = d; best = h; }
    }
    const v = Math.max(R.v, 2);
    if (best && bd < v * T * 0.95 + 1) {
      best.hopped = true;
      const perfect = bd > v * 0.16 && bd < v * T * 0.62;
      if (perfect) { R.stats.perfect++; R.energy = Math.min(R.energyMax, R.energy + 15); St.goalProgress('perfect'); R.hop.perfect = true; R.hop.sparkle = true; }
    }
  }
  function doHorn() {
    if (R.hornCd > 0) return;
    R.hornCd = 1.2;
    R.stats.horns++;
    ctx.audio?.play(VEHICLE[St.S.active].horn || 'horn-scooter');
    for (const h of R.hazards) if (h.type === 'ped' && !h.done && h.ahead < 30 && h.ahead > -2) { h.hurry = true; if (h.ped) h.ped.c.play('sprint', 0.1); }
    const L = R.manual ? carAhead(18) : leaderAhead(); if (L.who && L.gap < 18 && L.who.kind === 'car') { L.who.vmax += 2.5; L.who.wait = 0; }
  }
  function canOvertake() {
    if (R.ot || R.crash > 0) return null;
    const L = leaderAhead(); const B = blockingHazard();
    const carSlow = L.who && L.gap < 16 && L.who.v < R.vs.top * 0.85;
    const blocked = B.h && B.d < 18 && B.h.type !== 'ped' && (HZ[B.h.type].overtake || HZ[B.h.type].block);
    if (!carSlow && !blocked) return null;
    const st = stepAt();
    if (st.alley) return null;
    const target = carSlow && (!blocked || L.gap < B.d) ? { car: L.who } : { hz: B.h };
    const on = oncoming();
    const closing = Math.max(1, R.v + (on.who ? on.who.v : 0));
    const need = (target.car ? L.gap + target.car.len + 8 : B.d + 8) / Math.max(4, R.vs.top);
    const ttc = on.dist / closing;
    target.risk = ttc < need + 0.6 ? (ttc < need * 0.6 ? 2 : 1) : 0;
    return target;
  }
  function doOvertake() {
    const t = canOvertake(); if (!t) return;
    R.ot = { t: 0, dir: 1, car: t.car || null, hz: t.hz || null, until: 0, time: 0, clean: true };
    R.bike?.lookBack?.();
    R.stats.overtakes++; St.goalProgress('overtake');
    ctx.audio?.play('boost', { vol: 0.4, rate: 1.2 });
  }
  function shortcutOffer() {
    if (!R.fx.shortcuts) return null;
    const k0 = R.sampled[3];
    const steps = R.route.steps;
    for (let k = k0 + 1; k <= Math.min(steps.length - 3, k0 + 2); k++) {
      const T = steps[k].tile;
      for (const sc of city.shortcuts) {
        const e = sc.ends.indexOf(T); if (e < 0) continue;
        const other = sc.ends[1 - e];
        const tiles = e === 0 ? sc.tiles : [...sc.tiles].reverse();
        // the first alley tile must be adjacent to T and not where we came from
        const dIn = dirBetween(city, T, tiles[0]); if (dIn < 0) continue;
        if (dIn === OPP(steps[k].din)) continue;
        const dest = steps[steps.length - 1].tile;
        const rest = findPath(city, other, dest, { noBack: OPP(dirBetween(city, tiles[tiles.length - 1], other)) });
        if (!rest) continue;
        const via = tiles.length + rest.length;
        const cur = steps.length - k - 1;
        if (via > cur + 1) continue;
        const curT = steps.slice(k).map((x) => x.tile), viaT = [T, ...tiles, ...rest];
        const lights = curT.slice(1).filter((t) => traffic.lightAt.has(t)).length - rest.filter((t) => traffic.lightAt.has(t)).length;
        const tA = turnsOf(curT) - turnsOf(viaT);
        if (lights >= 1 || tA >= 1 || via < cur - 1) {
          const save = Math.round((cur - via) * TILE);
          const label = save >= 15 ? `−${save} m` : lights >= 1 ? `skip ${lights} light${lights > 1 ? 's' : ''}` : 'no traffic';
          return { k, tiles, rest, save, label, sc };
        }
      }
    }
    return null;
  }
  // first-time hints: slow time and point at the right button
  const COACH = {
    hop: { text: 'Pothole ahead! Tap <b>HOP</b> to jump it.', btn: 'hop' },
    overtake: { text: 'Slow car! Tap <b>Overtake</b> — green means the other lane is clear.', btn: 'overtake' },
    stop_light: { text: "Red light! Your scooter won't stop for it — tap <b>STOP</b>.", btn: 'stop' },
    stop_ped: { text: "Someone's crossing! Tap <b>STOP</b> — or <b>Honk</b> to hurry them.", btn: 'stop' },
    stop_door: { text: 'Tap <b>STOP</b> to pull up in the ring at the door.', btn: 'stop' },
    shortcut: { text: 'Your Navigation skill found a <b>shortcut</b>! Tap it to cut through.', btn: 'shortcut' },
    boost: { text: 'Open road! Hold <b>TURBO</b> to fly.', btn: 'boost' },
  };
  let coachOn = null, coachT = 0;
  function coach(dt) {
    if (R.scheme === 'run') return coachRun(dt);
    if (R.scheme) return coachLB(dt);
    const seen = St.S.seen;
    if (coachOn) {
      coachT -= dt / Math.max(0.05, R.timeScale);
      // (STOP's hint holds the slow motion until the tap, or until it's too late for a calm one)
      const U = R.stopUi;
      const done = coachOn === 'hop' ? !!R.hop : coachOn === 'overtake' ? !!R.ot : coachOn.startsWith('stop') ? !U || U.timing === 'on' || U.timing === 'late' || U.timing === 'gone' : coachOn === 'boost' ? R.boost : coachOn === 'shortcut' ? !R.offer : false;
      if (done || coachT <= 0) { R.timeScale = R.event && R.event.fired && document.querySelector('.modal.event') ? R.timeScale : 1; ctx.ui.coach(null); coachOn = null; }
      return;
    }
    if (R.timeScale < 1) return;
    let want = null;
    // STOP is new to everyone, veterans included
    const U = R.auto ? R.stopUi : null;
    if (U && (U.timing === 'early' || U.timing === 'now') && U.d < U.c + R.v * 1.8 + 4 && !seen['c_stop_' + U.kind]) want = 'stop_' + U.kind;
    else if (St.S.stats.deliveries > 12) return;
    else if (!seen.c_hop && R.hazards.some((h) => !h.done && HZ[h.type].hop && h.inPath && h.ahead > 4 && h.ahead < Math.max(10, R.v * 1.4))) want = 'hop';
    else if (!R.manual && !seen.c_overtake && canOvertake()?.risk === 0) want = 'overtake';
    else if (!seen.c_shortcut && R.offer) want = 'shortcut';
    else if (!seen.c_boost && R.v > R.vs.top * 0.9 && !R.boost && R.energy > R.energyMax * 0.8 && St.S.stats.deliveries >= 1) want = 'boost';
    if (!want) return;
    seen['c_' + want] = 1; St.save();
    coachOn = want; coachT = want.startsWith('stop') ? 6 : 3.2;
    R.timeScale = want === 'boost' ? 1 : 0.22;
    ctx.ui.coach(COACH[want]);
  }
  function turnsOf(tiles) { let n = 0; for (let i = 2; i < tiles.length; i++) if (dirBetween(city, tiles[i - 2], tiles[i - 1]) !== dirBetween(city, tiles[i - 1], tiles[i])) n++; return n; }
  function takeShortcut() {
    const o = R.offer; if (!o) return;
    const steps = R.route.steps, k0 = R.sampled[3];
    const path = [];
    for (let k = k0; k <= o.k; k++) path.push(steps[k].tile);
    path.push(...o.tiles, ...o.rest);
    // riding yourself, the button only puts the alley on the GPS: the shortcut counts once you've ridden through it
    if (R.manual) { R.offer = null; adoptRoute(buildRoute(city, path, { startDir: steps[k0].din, firstFull: true })); ctx.ui.toast(`Shortcut on the GPS · ${o.label}`, 'good'); return; }
    replaceRoute(path);
    R.offer = null; R.stats.shortcuts++; St.goalProgress('shortcut');
    flow('SHORTCUT!');
    ctx.ui.toast(`Shortcut! ${o.label}`, 'good');
  }

  // ---------- damage ----------
  // the guided first delivery's food takes knocks but always arrives (35% at worst: fewer stars, the pay stays), so a
  // new rider's first pay is never a ruined order and the guide's first upgrade stays in reach
  const foodFloor = () => (St.S.stats.deliveries < 1 ? 35 : 0);
  function hurtFood(amount, why) {
    for (const x of R.orders) if (x.picked && !x.done) x.integrity = Math.max(foodFloor(), x.integrity - amount * x.o.fragile * R.vs.bump);
    if (R.scheme === 'run') for (const x of R.orders) if (x.picked && !x.done && x.integrity <= 0 && !x.ruined) ruin(x);
    if (amount > 0) { R.stats.bumps++; kick(Math.min(1.6, 0.35 + amount / 9)); ctx.ui.flash?.('bump'); buzz(amount > 12 ? 60 : 30); }
  }
  // a jolt through the bike: springs bounce, the camera dips and recovers
  function kick(k) { R.bike?.bump?.(k); R.camKv -= 1.1 * k; }
  function crash(why) {
    if (R.crash > 0) return;
    ctx.audio?.play('skid', { vol: 0.8 });
    R.crash = 1.8; R.v = 0; R.stats.crashes++; F.fv = 0; F.beta = 0;
    track('crash', { why: why || 'Crash!', d: city.tiles[stepAt().tile].d, ot: R.ot ? 1 : 0, manual: R.manual ? 1 : 0, ctl: R.scheme, lvl: St.S.lvl, veh: St.S.active });
    if (R.ot) R.ot.clean = false;
    flowBreak();
    hurtFood(20, why);
    R.shake = 1;
    ctx.audio?.play('crash');
    if (R.bike) { const p = R.bike.root.position; pfx.crash(p.x, p.z, Math.sin(R.bike.root.rotation.y), Math.cos(R.bike.root.rotation.y)); for (let i = 0; i < 4; i++) pfx.skidMark(p.x + Math.sin(R.bike.root.rotation.y) * i * 0.4, p.z + Math.cos(R.bike.root.rotation.y) * i * 0.4, R.bike.root.rotation.y + 0.4); }
    buzz([80, 40, 120]);
    ctx.ui.toast(why || 'Crash!', 'bad');
    if (R.ot) R.ot.dir = -1;
  }

  // ---------- events ----------
  async function runEvent(e) {
    R.event.fired = true;
    if (e.actor === 'light') { const L = nextLight(); if (!L || L.d > 45 || L.d < 6) return; R.event.light = L; }
    R.stats.events++;
    R.recentEvents.push(e.id); if (R.recentEvents.length > 4) R.recentEvents.shift();
    R.timeScale = 0.12;
    R.boost = false;
    if (e.spawn === 'ped') {
      // put the actor in front of the bike so the card has something to look at
      const h = { type: 'ped', s: Math.min(R.route.length - 3, R.s + Math.max(9, R.v * 1.2)), lane: 1, tile: stepAt().tile, slow: true };
      h.obj = makeHazardMesh(h);
      if (h.ped) { scene.add(h.obj); placeHazard(h); h.walking = true; h.px = -3; R.hazards.push(h); }
    }
    const actor = stageEvent(e, R.event);
    ctx.audio?.play(e.sfx || 'event-pop');
    buzz(40);
    R.eventCam = true;
    const res = await ctx.ui.event(e, R);
    track('ride_event', { id: e.id, d: city.tiles[stepAt().tile].d, opt: res?.__opt ?? null, act: res?.__act ?? null, good: res?.__good ? 1 : res?.__bad ? 0 : null, auto: res?.__auto ? 1 : 0, manual: R.manual ? 1 : 0, ctl: R.scheme, lvl: St.S.lvl, veh: St.S.active });
    R.eventCam = false;
    R.timeScale = 1;
    actor?.resolve?.(res || {});
    if (e.actor === 'light' && res?.__act === 'go' && R.event.light) { R.runLight = R.event.light.tile; R.runLightState = 'y'; R.lightJudged = true; }
    applyEffect(res || {});
  }

  // ---------- event actors: the event happens in the street, not only on the card ----------
  const actors = [];
  function along(sAbs, lat) {
    const o = sampleRoute(R.route, Math.max(0, Math.min(R.route.length, sAbs)), [0, 0, 0, 0, 0]);
    const rx = -Math.cos(o[2]), rz = Math.sin(o[2]);
    return { x: o[0] + rx * lat, z: o[1] + rz * lat, h: o[2] };
  }
  function addActor(a) { a.t = 0; actors.push(a); return a; }
  function disposeActor(a) { for (const o of a.objs || [a.obj]) o?.removeFromParent(); }
  function clearActors() { for (const a of actors) disposeActor(a); actors.length = 0; }
  function updateActors(dt) {
    for (let i = actors.length - 1; i >= 0; i--) {
      const a = actors[i];
      a.t += dt; a.update?.(dt);
      if (a.dead || (a.s != null && R.s - a.s > 45) || a.t > (a.ttl || 90)) { disposeActor(a); actors.splice(i, 1); }
    }
  }
  const place = (obj, p, lat = 0, y = ROAD_Y, turn = 0) => { obj.position.set(p.x, y, p.z); obj.rotation.y = p.h + turn; scene.add(obj); };
  // props that must already be visible down the road before the event fires
  function onStraight(s0, s1) { return !R.arcs.some((a) => a.s1 > s0 && a.s0 < s1); }
  function prePlace(E) {
    const ev = E.ev;
    if (!onStraight(E.s + ev.pre - 6, E.s + ev.pre + 6)) {
      // slide the event (and its prop) to the nearest stretch of straight road
      let best = null;
      for (let d = 2; d < 60 && best == null; d += 2) for (const sg of [1, -1]) { const s = E.s + sg * d; if (s > 8 && s + ev.pre + 8 < R.route.length && onStraight(s + ev.pre - 6, s + ev.pre + 6)) { best = s; break; } }
      if (best == null) { E.ev = { ...ev, actor: null, pre: 0 }; return; }
      E.s = best;
    }
    // a parked car is solid for a rider steering freely
    const solid = (p) => ({ x: p.x, z: p.z, c: Math.cos(p.h), s: Math.sin(p.h), hx: 0.95, hz: 2.2 });
    if (ev.actor === 'door') {
      const car = makeDoorCar(rng() < 0.5 ? 'sedan' : 'taxi'), p = along(E.s + ev.pre, 2.9);
      place(car.obj, p);
      E.prop = addActor({ obj: car.obj, s: E.s + ev.pre, car, solid: solid(p), update: (dt) => car.animate(dt) });
    } else if (ev.actor === 'police') {
      const car = makePoliceCar(), p = along(E.s + ev.pre, 2.9);
      place(car.obj, p);
      const a = E.prop = addActor({ obj: car.obj, objs: [car.obj], s: E.s + ev.pre, car, solid: solid(p), update(dt) { car.animate(dt); if (a.cop) { a.cop.mixer.update(dt); a.walk?.(dt); } } });
      makePerson('male-c').then((cop) => { if (!actors.includes(a)) return; a.cop = cop; a.objs.push(cop.obj); place(cop.obj, along(E.s + ev.pre - 3.5, 0.3), 0, ROAD_Y, Math.PI); });
    } else if (ev.actor === 'works') {
      const h = { type: 'barrier', s: E.s + ev.pre, lane: 1, tile: stepAt().tile };
      h.obj = makeHazardMesh(h); scene.add(h.obj); placeHazard(h); R.hazards.push(h);
      const a = E.prop = addActor({ objs: [], s: E.s + ev.pre, h, update(dt) { if (a.man) { a.man.mixer.update(dt); a.walk?.(dt); } } });
      makePerson('male-b').then((man) => { if (!actors.includes(a)) return; a.man = man; a.objs.push(man.obj); place(man.obj, along(E.s + ev.pre + 0.6, 2.7), 0, 0.2, -Math.PI / 2); });
    } else if (ev.actor === 'birds') {
      const birds = [];
      const a = E.prop = addActor({ objs: [], s: E.s + ev.pre, fly: false, birds, update(dt) {
        for (const b of birds) {
          if (a.fly) { b.v.y += 2.5 * dt; b.obj.position.x += b.v.x * dt; b.obj.position.y += b.v.y * dt; b.obj.position.z += b.v.z * dt; }
          b.bird.animate(dt, a.fly);
        }
      } });
      for (let i = 0; i < 7; i++) {
        const bird = makeBird(), p = along(E.s + ev.pre + rng() * 4, -1.4 + rng() * 2.8);
        place(bird.obj, p, 0, ROAD_Y, rng() * 6.28);
        birds.push({ bird, obj: bird.obj, v: new THREE.Vector3((rng() - 0.5) * 6, 2 + rng() * 2, (rng() - 0.5) * 6) });
        a.objs.push(bird.obj);
      }
    }
  }
  // returns { resolve(result) } for the card's outcome
  function stageEvent(e, E) {
    const p = E.prop;
    switch (e.actor) {
      case 'door': p?.car.setOpen(1); return { resolve(r) { if (r.__good) R.dodge = { lat: -1.8, s1: E.s + e.pre + 4 }; setTimeout(() => p?.car.setOpen(0), 2500); } };
      case 'police': return { resolve() {
        const cop = p?.cop; if (!cop) return;
        const from = cop.obj.position.clone(), to = along(E.s + e.pre - 3.5, 3.6); let t = 0;
        cop.play('walk'); cop.obj.rotation.y = to.h - Math.PI / 2;
        p.walk = (dt) => { t = Math.min(1, t + dt / 1.6); cop.obj.position.set(from.x + (to.x - from.x) * t, ROAD_Y, from.z + (to.z - from.z) * t); if (t >= 1 && !p.walked) { p.walked = true; cop.play('idle'); cop.obj.rotation.y = to.h + Math.PI / 2; } };
      } };
      case 'works': return { resolve(r) {
        if (!p) return;
        if (r.__act === 'sidewalk') { p.h.done = true; R.dodge = { lat: 3.1, s1: p.s + 5 }; return; }
        // waiting: the worker drags the barrier to the kerb when the wait is over
        const obj = p.h.obj, from = obj.position.clone(), to = along(p.s, 3.2); let t = -5.5;
        p.man?.play('walk');
        p.walk = (dt) => { t += dt; if (t < 0) return; const k = Math.min(1, t / 1.5); obj.position.set(from.x + (to.x - from.x) * k, from.y, from.z + (to.z - from.z) * k); if (k >= 1 && !p.h.done) { p.h.done = true; p.man?.play('idle'); } };
      } };
      case 'birds': return { resolve(r) { if (!p) return; if (r.__good) p.fly = true; else setTimeout(() => { p.fly = true; }, 3500); } };
      case 'dog': {
        const d = makeDog(rng());
        const a = addActor({ obj: d.obj, mode: 'chase', y: 0, vy: 0, sp: 0, bark: 0, barkT: 0.6, update(dt) {
          const b = R.bike.root, hd = b.rotation.y, fx = Math.sin(hd), fz = Math.cos(hd), rx = -Math.cos(hd), rz = Math.sin(hd);
          const o = d.obj.position;
          let tx = b.position.x + fx * 0.3 + rx * 1.5, tz = b.position.z + fz * 0.3 + rz * 1.5, max = Math.max(7.5, R.v * 1.08); // runs beside the bike, barking
          if (a.mode === 'giveup') max = Math.max(0, a.sp - 6 * dt);
          if (a.mode === 'jump') { tx = b.position.x - fx * 0.6; tz = b.position.z - fz * 0.6; max = R.v + 4; }
          const dx = tx - o.x, dz = tz - o.z, dist = Math.hypot(dx, dz);
          a.sp = a.mode === 'giveup' ? max : Math.min(max, dist * 4);
          if (dist > 0.05 && a.sp > 0.05) { const k = Math.min(dist, a.sp * dt) / dist; o.x += dx * k; o.z += dz * k; d.obj.rotation.y = Math.atan2(dx, dz); }
          if (a.mode === 'jump') { a.vy -= 20 * dt; a.y = Math.max(0, a.y + a.vy * dt); if (a.y === 0 && a.vy < 0) a.mode = 'giveup'; }
          o.y = 0.2 + a.y;
          a.barkT -= dt; if (a.mode === 'chase' && a.barkT <= 0) { a.barkT = 1.4; a.bark = 0.4; ctx.audio?.play('dog-bark', { vol: 0.5 }); }
          a.bark = Math.max(0, a.bark - dt);
          d.animate(dt, a.sp, { sit: a.mode === 'giveup' && a.sp < 0.3 ? 1 : 0, bark: a.bark });
        }, ttl: 25 });
        place(d.obj, along(R.s + 0.5, 3.4), 0, 0.2);
        return { resolve(r) { if (r.__good) { a.mode = 'giveup'; a.ttl = a.t + 6; } else { a.mode = 'jump'; a.vy = 6; a.ttl = a.t + 8; ctx.audio?.play('dog-bark'); } } };
      }
      case 'ball': {
        const ball = makeBall();
        const sB = R.s + Math.max(10, R.v * 1.3);
        const a = addActor({ obj: ball.obj, s: sB, lat: 4.6, hopWhen: false, bonk: false, update(dt) {
          a.lat -= 4.2 * dt;
          const p2 = along(sB, a.lat);
          const bounce = Math.abs(Math.sin(a.t * 6)) * 0.6;
          ball.obj.position.set(p2.x, ROAD_Y + 0.34 + bounce, p2.z); ball.obj.rotation.x += dt * 8;
          const ahead = sB - R.s;
          if (a.hopWhen && ahead < Math.max(2.4, R.v * 0.32) && ahead > 0) { a.hopWhen = false; doHop(); }
          if (a.lat < -7) a.dead = true;
        }, ttl: 12 });
        scene.add(ball.obj);
        return { resolve(r) { if (r.__good) a.hopWhen = true; } };
      }
      case 'rival': {
        const a = addActor({ objs: [], rs: R.s + 1.2, v: R.v, mode: 'ride', ttl: 30, update(dt) {
          if (!a.bike) return;
          a.v = a.mode === 'ride' ? R.v : a.mode === 'lose' ? Math.max(0, a.v - 3 * dt) : a.v + 4 * dt;
          a.rs += a.v * dt;
          if (a.rs > R.route.length - 2 || a.rs - R.s > 70 || R.s - a.rs > 30) { a.dead = true; return; }
          const o = sampleRoute(R.route, a.rs, [0, 0, 0, 0, 0]), rx = -Math.cos(o[2]), rz = Math.sin(o[2]);
          a.bike.root.position.set(o[0] - rx * 2.1, ROAD_Y, o[1] - rz * 2.1); a.bike.root.rotation.y = o[2];
          a.bike.update(dt, a.v, -Math.atan(a.v * a.v * o[4] / 9.81) * 0.8, 0);
          if (a.bike.pose) a.bike.pose.tuck = a.mode === 'win' ? 1 : 0;
        } });
        makeBike(rng() < 0.5 ? 'viper' : 'zippy', { paint: '#43b34a', box: '#2b2f38', char: 'male-e', helmet: '#43b34a' }).then((bk) => { if (!actors.includes(a)) return; a.bike = bk; a.objs.push(bk.root); scene.add(bk.root); });
        return { resolve(r) { a.mode = r.__act === 'race' && r.__good ? 'lose' : 'win'; if (a.mode === 'win') ctx.audio?.play('boost', { vol: 0.5 }); } };
      }
      case 'rain': ctx.weather?.startRain?.(); return null;
      case 'stall': R.stall = true; R.wobble = 1; return { resolve(r) { R.stall = false; if (r.__good) { const b = R.bike.root.position; pfx.restart(b.x, 0.7, b.z); } } };
      case 'flat': R.wobble = 2.6; return null;
    }
    return null;
  }
  function applyEffect(f) {
    if (f.wait) R.wait = Math.max(R.wait, f.wait);
    if (f.time) for (const x of R.orders) if (!x.done) x.elapsed = Math.max(0, x.elapsed + f.time);
    if (f.dmg) hurtFood(f.dmg / Math.max(0.6, R.vs.bump));
    if (f.heat) for (const x of R.orders) if (x.picked && !x.done) x.heat = Math.max(0, Math.min(100, x.heat + f.heat));
    if (f.cash) { R.fines -= f.cash; }
    if (f.tip) for (const x of R.orders) if (!x.done) x.tipMult *= f.tip;
    if (f.rating) for (const x of R.orders) if (!x.done) x.ratingAdj += f.rating;
    if (f.energy) R.energy = Math.max(0, Math.min(R.energyMax, R.energy + f.energy));
    if (f.xp) R.xpBonus = (R.xpBonus || 0) + f.xp;
    if (f.crash) crash(f.say);
    else if (f.say) ctx.ui.toast(f.say, f.dmg || f.cash < 0 ? 'bad' : 'good');
    if (f.sfx) ctx.audio?.play(f.sfx === 'horn' ? 'horn-scooter' : f.sfx);
  }

  // ---------- arrival scenes ----------
  let npc = null;
  async function arrive() {
    const leg = R.job.legs[R.leg];
    R.phase = 'scene'; R.v = 0; R.boost = false; cdown.sp.visible = false; R.junc = null;
    if (ribbon) ribbon.visible = false;
    ctx.audio?.engine(false);
    const lot = city.lots[leg.lot];
    ringMk.visible = false;
    // (a scene at the spot we already stood on keeps the tile and heading we had; riding freely, wherever the bike stopped)
    const rt = R.manual ? world.routeTile(F.x, F.z, true) : -1;
    if (rt >= 0) { R.curTile = rt; R.curDir = cardinal(F.h); }
    else if (!R.here) { R.curTile = R.route.steps[R.route.steps.length - 1].tile; R.curDir = R.route.steps[R.route.steps.length - 1].din; }
    // where the NPC comes from: the lot's front tile edge
    const door = city.tiles[lot.doorFrom];
    const f = DIRS[lot.front];
    let dx = (door.x + f[0] * 0.42) * TILE, dz = (door.z + f[1] * 0.42) * TILE;
    if (lot.doorPos) { dx = lot.doorPos[0]; dz = lot.doorPos[1]; } // the building's real front door
    const bx = R.bike.root.position.x, bz = R.bike.root.position.z;
    if (leg.kind === 'pickup') {
      const orders = R.orders.filter((x) => leg.orders.includes(x.o.id));
      npc = await spawnNpc(orders[0].o.rest === 'sultan' ? 'male-d' : 'female-c', dx, dz, bx, bz, true);
      sceneCam(dx, dz);
      await ctx.ui.pickup(orders.map((x) => x.o), R);
      await reachBike(npc); // the bag changes hands at the bike, even when Confirm Pickup came early
      R.bike.openLid(true); ctx.audio?.play('bag-rustle');
      for (const x of orders) x.picked = true;
      await walkAway(npc, dx, dz);
      R.bike.openLid(false);
    } else {
      const x = R.orders.find((y) => y.o.id === leg.order);
      npc = await spawnNpc(x.o.char, dx, dz, bx, bz, false);
      sceneCam(dx, dz);
      ctx.audio?.play('doorbell');
      setTimeout(() => ctx.audio?.play('door-open', { vol: 0.6 }), 900);
      await ctx.ui.drop(x.o, R, x);
      R.bike.openLid(true); ctx.audio?.play('bag-rustle');
      x.done = true;
      x.flow = R.flow.mult;
      x.result = scoreOrder(x.o, { elapsed: x.elapsed, heat: x.heat, integrity: x.integrity, tipMult: x.tipMult * R.flow.mult, ratingAdj: x.ratingAdj });
      x.result.flow = R.flow.mult;
      if (x.ruined) Object.assign(x.result, { ruined: true, stars: 1, pay: 0, tip: 0, bonus: 0, early: false });
      // a customer still on the way keeps walking and reacts once they reach the bike
      if (npc) { npc.emote = x.result.stars >= 4 ? 'emote-yes' : 'emote-no'; if (!npc.walking) npc.c.play(npc.emote, 0.2, { once: true }); }
      if (x.result.stars >= 4) { const at = npc ? { x: npc.tx, z: npc.tz } : R.bike.root.position; pfx.celebrate(at.x, at.z, { stars: x.result.stars, tip: x.result.tip }); }
      ctx.audio?.play(x.result.stars >= 3 ? 'order-complete' : 'order-late');
      await ctx.ui.rated(x.o, x.result, R);
      R.bike.openLid(false);
      if (npc) { npc.c.obj.removeFromParent(); npc = null; }
    }
    if (npc) { npc.c.obj.removeFromParent(); npc = null; }
    R.leg++;
    if (R.leg < R.job.legs.length) { R.camMode = 'chase'; beginLeg(); }
    else finish();
  }
  async function spawnNpc(char, x, z, bx, bz, carrying) {
    // normally loaded long ago (start() asks for them); on a slow or dropped connection the scene goes on without them
    const c = await Promise.race([makeChar(char).catch(() => null), new Promise((r) => setTimeout(() => r(null), 2000))]);
    if (!c) return null;
    c.obj.scale.setScalar(2.2);
    c.obj.position.set(x, 0.2, z);
    scene.add(c.obj);
    let bag = null;
    if (carrying && hasKit('food')) {
      const parts = pieceParts('food', 'bag');
      if (parts.length) { bag = new THREE.Mesh(parts[0].geometry, parts[0].material); bag.scale.setScalar(0.45); bag.position.set(0, 0.16, 0.16); c.obj.add(bag); }
    }
    const n = { c, bag, tx: bx, tz: bz, walking: true };
    // walk to ~1.4 m from the bike
    const d = Math.hypot(bx - x, bz - z);
    n.tx = x + (bx - x) * Math.max(0, (d - 1.5) / d); n.tz = z + (bz - z) * Math.max(0, (d - 1.5) / d);
    c.play(carrying ? 'walk-hold' : 'walk');
    return n;
  }
  // in game time, not wall time: on a slow phone the walk takes longer and the bag still changes hands at the bike
  function reachBike(n) {
    return new Promise((res) => { if (!n || !n.walking) return res(); n.onArrive = res; });
  }
  function walkAway(n, x, z) {
    return new Promise((res) => { if (!n) return res(); if (n.bag) n.bag.visible = false; n.tx = x; n.tz = z; n.walking = true; n.c.play('walk'); n.onArrive = () => { n.c.obj.removeFromParent(); res(); }; setTimeout(() => { n.onArrive?.(); }, 2500); });
  }
  function updateNpc(dt) {
    if (!npc) return;
    const o = npc.c.obj;
    const dx = npc.tx - o.position.x, dz = npc.tz - o.position.z, d = Math.hypot(dx, dz);
    if (npc.walking) {
      if (!(d >= 0.15)) { // (a target that came out NaN counts as reached, so nothing waits on it forever)
        npc.walking = false;
        if (npc.emote) npc.c.play(npc.emote, 0.2, { once: true });
        else npc.c.play(npc.bag && npc.bag.visible ? 'holding-both' : 'idle');
        const cb = npc.onArrive; npc.onArrive = null; cb?.();
      }
      else { const sp = Math.min(d, 2.6 * dt); o.position.x += dx / d * sp; o.position.z += dz / d * sp; o.rotation.y = Math.atan2(dx, dz); }
    } else {
      const bx = R.bike.root.position.x - o.position.x, bz = R.bike.root.position.z - o.position.z; o.rotation.y = Math.atan2(bx, bz);
    }
    npc.c.mixer.update(dt);
  }
  function sceneCam(dx, dz) {
    const b = R.bike.root.position;
    R.camMode = 'scene';
    const mx = (b.x + dx) / 2, mz = (b.z + dz) / 2;
    // stand on the road side, look at the bike + door
    const hx = Math.sin(R.bike.root.rotation.y), hz = Math.cos(R.bike.root.rotation.y);
    const sx = dx - b.x, sz = dz - b.z; const sl = Math.hypot(sx, sz) || 1;
    R.sceneCam = { pos: new THREE.Vector3(mx - sx / sl * 7.5 - hx * 3.5, 3.4, mz - sz / sl * 7.5 - hz * 3.5), look: new THREE.Vector3(mx, 1.3, mz) };
  }

  function finish() {
    R.phase = 'done'; R.active = false;
    leaveFree(); cdown.sp.visible = false;
    pfx.clear(); pfx.clearSkids(); clearActors(); R.dodge = null; R.dodgeLat = 0; R.stall = false; R.wobble = 0;
    if (ribbon) { ribbon.removeFromParent(); ribbon = null; }
    for (const h of R.hazards) freeHazard(h); R.hazards = [];
    ctx.audio?.engine(false);
    traffic.removeAgent(agent); calmTraffic();
    St.S.pos = R.curTile; St.S.posDir = R.curDir;
    const fuel = Math.round(R.meters / 1000 * R.vs.fuel * 100) / 100;
    ctx.onFinish({ orders: R.orders, stats: R.stats, fuel, fines: R.fines, meters: R.meters, time: R.rideTime, xpBonus: R.xpBonus || 0 });
    R.xpBonus = 0;
  }
  function abort() {
    clearActors();
    if (ribbon) { ribbon.removeFromParent(); ribbon = null; }
    for (const h of R.hazards) freeHazard(h); R.hazards = [];
    if (npc) { npc.c.obj.removeFromParent(); npc = null; }
    leaveFree(); cdown.sp.visible = false;
    R.active = false; R.phase = 'idle'; traffic.removeAgent(agent); calmTraffic(); R.bike?.root.removeFromParent(); ctx.audio?.engine(false);
  }

  // ======================================================================================================
  // STOP is the rider's (the autopilot: phones, and desktop with Auto-drive). The scooter steers itself, takes the
  // corners and keeps its distance in traffic, but it doesn't stop on its own for a red light, someone crossing or the
  // door: a STOP button comes up for each, and a tap brings the bike to rest there (it rolls on once the light is
  // green or the way is clear). Tapped just before the brake has to go on (where the GPS arrows turn red) it's a
  // perfect stop; later, a hard one. Not tapped: the red is run (the junction's camera catches it), the pedestrian
  // gets a fright and the food a jolt, the door goes by and the bike backs up to it.
  // ======================================================================================================
  const HARD = 11, PED_W = 1.3; // the autopilot's hardest braking (m/s²); half the width of the bike's path (m)
  function autoLeg() {
    R.stops = []; R.stopP = null; R.stopUi = null; R.over = null; R.rev = 0;
    R.lightPrev = null; R.redSeen = -1; R.minV = 0; R.lightLeft = Infinity; cdown.sp.visible = false;
  }
  // a jaywalker in the bike's path by the time it gets there (event pedestrians are the card's: the autopilot waits).
  // On the brake the gas is always on: let go and the bike gets there sooner than its speed says.
  function pedThreat(h) {
    if (h.type !== 'ped' || h.done || h.slow || !h.walking || h.px > PED_W || h.ahead < 0.5) return false;
    const a = R.vs.accel * 1.3, d = Math.max(0, h.ahead - 1.3);
    const sp = h.hurry ? 3.2 : 1.15, tArr = R.scheme === 'b' || R.scheme === 'run' ? (Math.sqrt(R.v * R.v + 2 * a * d) - R.v) / a : h.ahead / Math.max(R.v, 2);
    const tIn = Math.max(0, (-PED_W - 0.3 - h.px) / sp), tOut = (PED_W - h.px) / sp;
    return tOut > tArr - 0.3 && tIn < tArr + 0.4;
  }
  // what there is to stop for ahead, nearest first: a light that will be red when we get there (unless a car in front
  // is waiting at it for us), someone about to cross our path, the door
  function stopPoints() {
    const out = [], L = R.light;
    if (L && L.tile !== R.runLight && L.state !== 'g') {
      const left = traffic.lightLeft(L.tile, L.din), eta = L.d / Math.max(R.v, 4), lead = leaderAhead();
      const clear = L.state === 'r' ? left < eta - 0.5 : eta < left; // (green by then, or through on the yellow)
      if (!clear && !(lead.who && lead.gap < L.d - 1)) out.push({ kind: 'light', id: L.tile, s: R.s + L.d, secs: left });
    }
    for (const h of R.hazards) if (pedThreat(h)) out.push({ kind: 'ped', id: h, s: h.s - 2.6 });
    if (!R.over && R.route.length - R.s < 70) out.push({ kind: 'door', id: R.route, s: R.route.length });
    return out.sort((a, b) => a.s - b.s);
  }
  // how a tap now goes for a stop d metres ahead: early (fine), now (the last second before the brake point: perfect),
  // late (a hard brake that knocks the food), gone (it can't stop there any more)
  const brakeAt = () => (R.v * R.v) / (2 * B_DEC);
  function stopTiming(d) {
    const c = brakeAt();
    if (d > c + R.v + 2) return 'early';
    if (d > c - 0.5) return 'now';
    if (d + 0.6 > (R.v * R.v) / (2 * HARD)) return 'late';
    return 'gone';
  }
  function doStop() {
    const P = R.stopP;
    if (!R.auto || !P || R.over || R.crash > 0) return;
    const t = stopTiming(P.s - R.s);
    R.stops.push({ kind: P.kind, id: P.id, s: P.s, secs: P.secs, perfect: t === 'now', halted: false });
    R.stopP = null;
    if (t === 'late' || t === 'gone') { hurtFood(3); ctx.ui.toast('Hard brake!', 'warn'); }
    ctx.audio?.play('ui-tap', { vol: 0.5 }); buzz(14);
  }
  // each frame: follow what STOP was tapped for (a light gone green or a crossing cleared lets the bike go), say what the
  // button offers next, and paint the brake zone on the GPS arrows. Returns the speed the stops allow.
  function autoStop() {
    let cap = Infinity;
    const L = R.light;
    R.stops = R.stops.filter((S) => {
      if (S.kind === 'light') { if (!L || L.tile !== S.id || L.state === 'g') return false; S.s = R.s + L.d; S.secs = traffic.lightLeft(L.tile, L.din); }
      else if (S.kind === 'ped') { const h = S.id; if (h.done || !h.walking || h.px > 1 || !R.hazards.includes(h)) return false; }
      return true;
    });
    for (const S of R.stops) {
      const d = S.s - R.s;
      cap = Math.min(cap, S.kind === 'door' ? Math.min(Math.sqrt(2 * B_DEC * Math.max(0, d - 0.4)), Math.max(0, d - 0.4) * 3.2) : stopV(d));
      if (S.kind !== 'door' && !S.halted && R.v < 0.3 && d < 3) { S.halted = true; R.stats.halts++; if (S.perfect) { R.stats.stops++; flow('PERFECT STOP!'); } }
    }
    const c = brakeAt(), reach = c + R.v * 2.2 + 8;
    const P = stopPoints().find((p) => p.s - R.s < reach && !R.stops.some((S) => S.kind === p.kind && S.id === p.id));
    const t = P && stopTiming(P.s - R.s);
    R.stopP = P && (t !== 'gone' || P.kind === 'door') ? P : null;
    if (R.stopP) R.stopUi = { kind: P.kind, timing: t, d: P.s - R.s, c, secs: P.secs ?? 0 };
    else if (R.stops.length) { const S = R.stops.reduce((a, b) => (a.s < b.s ? a : b)); R.stopUi = { kind: S.kind, timing: 'on', d: S.s - R.s, c, secs: S.secs ?? 0 }; }
    else R.stopUi = null;
    ribbon?.userData.setBrake?.(R.stopP ? R.stopP.s - c : -1, R.stopP ? R.stopP.s : -1);
    return cap;
  }
  // the door: a ring on the road. Tapped for, the bike pulls up in it; ridden past, it skids to a halt and backs up.
  function autoDoor(dt) {
    const L = R.route.length, off = R.s - L;
    ringMk.visible = off > -45;
    if (ringMk.visible) { sampleRoute(R.route, L, probe); ringMk.position.set(probe[0], 0, probe[1]); ringMk.scale.set(RING_B / RING_R, 1, RING_B / RING_R); }
    if (R.crash > 0 || R.eventCam || R.hop) return;
    if (R.over) {
      if (!R.over.back && R.v < 0.2) { R.over.back = true; R.v = 0; }
      if (R.over.back) { R.rev = 2.4; R.s = Math.max(L, R.s - R.rev * dt); if (R.s <= L + 0.05) { R.rev = 0; R.over = null; arrive(); } }
      return;
    }
    const S = R.stops.find((x) => x.kind === 'door');
    if (!S) {
      if (off > 0.3 && R.v > 0.5) { R.over = { back: false }; R.stats.overshoots++; flowBreak(); hurtFood(4); ctx.audio?.play('skid', { vol: 0.6 }); ctx.ui.toast('Missed the door! Backing up…', 'bad'); }
      return;
    }
    if (R.v < 0.6) {
      if (Math.abs(off) < RING_B) { R.stats.halts++; if (S.perfect) { R.stats.stops++; flow('PERFECT STOP!'); } arrive(); }
      else if (off > 0) R.over = { back: true };
    }
  }
  // a jaywalker the bike didn't stop for: they leap clear, the rider swerves, the food takes the jolt
  function pedScare(h) {
    h.scared = true; h.hurry = true; h.px += 0.8;
    h.ped?.c.play('sprint', 0.1);
    R.v *= 0.35; R.dodge = { lat: h.px < R.lat ? 0.9 : -0.9, s1: R.s + 3 }; R.stats.pedHits++;
    kick(1.2); hurtFood(9); flowBreak();
    ctx.audio?.play('skid', { vol: 0.6 }); ctx.audio?.play(VEHICLE[St.S.active].horn || 'horn-scooter', { vol: 0.5 });
    ctx.ui.toast('Watch the crossing!', 'bad');
  }
  // a red the rider didn't stop for: the flow is over, and if the junction has a camera (the district's odds) it
  // flashes — a small fine (only a warning in the first two deliveries, while STOP is new); with none, nothing is said.
  // Cross traffic is left to the city: a car that's really there is the T-bone in drive.
  function redCamera(st, cam) {
    flowBreak();
    if (!cam) return;
    ctx.audio?.play('camera-shutter'); ctx.ui.flash?.('camera'); buzz(40);
    if (St.S.stats.deliveries < 2) return ctx.ui.toast('Red-light camera! Just a warning this time', 'warn');
    const fine = Math.round(1 + 2 * (DISTRICT[city.tiles[st.tile].d]?.pay || 1));
    R.fines += fine; R.stats.tickets++;
    ctx.ui.toast(`Red-light camera! −$${fine}`, 'bad');
  }
  // test hook (tools/stop.mjs): a careful rider on the autopilot — taps STOP in the perfect second (or as soon as it
  // shows when that's already gone), hops what's in the lane, honks at someone crossing if asked to
  function autoBot({ honk = false, hop = true } = {}) {
    if (!R.auto || !R.active || R.phase !== 'ride') return null;
    const U = R.stopUi;
    if (U && (U.timing === 'now' || U.timing === 'late' || U.timing === 'gone')) input('stop');
    if (honk && U?.kind === 'ped' && U.timing === 'early') input('horn');
    if (hop && !R.hop && R.hazards.some((h) => !h.done && HZ[h.type].hop && h.inPath && h.ahead > R.v * 0.2 && h.ahead < R.v * 0.5)) input('hop');
    return U;
  }

  // ======================================================================================================
  // Lanes & brake (phones, `?ctl=a|b` prototype for QA). The gas is always open; the rider holds anywhere to brake and
  // swipes to change lane — nothing else. 'a' lane run: the autopilot steers and takes the corners, but the car in
  // front, red lights, people crossing and whatever stands in the lane are the rider's. Three lanes: oncoming, ours,
  // the sidewalk. Tucking in behind a car fills a draft; pulling out turns it into a slingshot. 'b' late brake: the
  // autopilot keeps its distance in traffic, but the corners, red lights and the door are the rider's. Every corner
  // has a speed limit (the GPS arrows turn red where the brake has to go on), a red light wants a stop, and the bike
  // has to come to rest in the ring at the door. Rolling through junctions without stopping climbs the gears.
  // ======================================================================================================
  function schemeLeg() {
    R.lane = 0; R.lc = null; R.laneLat = 0; R.wide = R.wideT = 0; R.draft = 0; R.sling = 0; R.boost = false; R.rev = 0;
    R.gear = 1; R.gearRun = true; R.gearTile = -1; R.moved = false; R.arcIn = null; R.arcLim = Infinity; R.bz = null; R.over = null;
    R.lightPrev = null; R.redSeen = -1; R.minV = 0; R.autoBack = null; R.stuckT = 0; R.junc = null; R.lightLeft = Infinity;
    R.juncSeen = new Set(); R.juncGps = new Map(); cdown.sp.visible = false; R.coinChain = 0; R.coinT = -9; R.backUp = 0; R.faceT = 0; R.headOn = false; R.denseT = 0;
    { const i = traffic.blockers.indexOf(blocker); if (i >= 0) traffic.blockers.splice(i, 1); }
  }
  // a stretch with a sidewalk on our right, straight through (no junction, alley or corner)
  function walkable(st) {
    const t = city.tiles[st.tile];
    if (st.alley || st.din !== st.dout || t.junction || t.piece !== 'straight') return false;
    const r = DIRS[RIGHT(st.din)], n = city.tiles[(t.z + r[1]) * city.W + t.x + r[0]];
    return !n || n.k !== K.ROAD;
  }
  // metres of sidewalk ahead of s before the next corner, junction or the last stretch to the door
  function walkRun(s, route = R.route) {
    const steps = route.steps;
    let k = 0; while (k < steps.length - 1 && steps[k + 1].s0 <= s) k++;
    let end = s;
    for (; k < steps.length && walkable(steps[k]); k++) end = steps[k].s0 + steps[k].len;
    for (const a of route === R.route ? R.arcs : routeArcs(route)) if (a.s1 > s) { end = Math.min(end, a.s0 - 2); break; }
    return Math.min(end, route.length - 20) - s;
  }
  // a swipe: one lane over — or, with a shortcut on offer, into its alley (a swipe up when it's straight on)
  function laneInput(dir) {
    if (!dir || R.crash > 0 || R.over || R.wait > 0) return;
    if (R.offer && offerSide(R.offer) === dir) { takeShortcut(); return; }
    // coming up to a junction, a swipe is the turn (straight on: a swipe up). Not on the run: there the traffic makes a
    // swipe always the lane (or the hop), and a junction's other street is an arrow to tap
    if (R.junc && R.scheme !== 'run') { chooseTurn(dir); return; }
    if (dir === 2) { if (R.scheme === 'run') doHop(); return; }
    // (the brake has no lanes: the autopilot goes round what blocks ours)
    if (R.scheme === 'b') { R.bike?.bump?.(0.2); buzz(25); return; }
    const to = R.lane + dir;
    const ok = to >= -1 && to <= (R.scheme === 'b' ? 0 : 1) && !stepAt().alley && (to !== 1 || walkRun(R.s) > Math.max(12, R.v * 1.2));
    if (!ok) { R.bike?.bump?.(0.2); buzz(25); return; } // no lane that way: a wiggle
    if (!laneFree(to)) { R.bike?.bump?.(0.4); hurtFood(1.5); ctx.audio?.play('bump', { vol: 0.35 }); return; } // something alongside: a scrape
    setLane(to);
    buzz(8);
  }
  function setLane(to) {
    if (to === R.lane) return;
    if (R.scheme !== 'b' && R.lane === 0 && R.draft > 0.35) slingshot(); // pulling out of a car's slipstream
    R.lc = { from: R.laneLat, to: LAT[to], t: 0 };
    R.lane = to; R.stats.lanes++;
    if (to < 0) R.bike?.lookBack?.();
  }
  // nothing right beside the bike in that lane (a parked or moving car in ours, people and furniture on the sidewalk)
  function laneFree(to) {
    if (to === 0) {
      if (R.hazards.some((h) => h.type === 'parked' && !h.done && Math.abs(h.s - R.s) < HZ.parked.len / 2 + 1.2)) return false;
      // (a car alongside, on this tile or across the line into the next or the last one)
      const k0 = R.sampled[3], steps = R.route.steps;
      for (let k = Math.max(0, k0 - 1); k <= Math.min(steps.length - 1, k0 + 1); k++) {
        const st = steps[k];
        for (const a of traffic.byTile.get(st.tile) || []) if (a !== agent && a.din === st.din && a.off > 0 && Math.abs(st.s0 + a.s - R.s) < (a.len + agent.len) / 2) return false;
      }
    }
    if (to === 1) {
      sampleRoute(R.route, R.s, probe);
      const x = probe[0] - Math.cos(probe[2]) * LAT[1], z = probe[1] + Math.sin(probe[2]) * LAT[1];
      if (world.hits(x, z, 0.5, contacts).some((c) => c.what !== 'edge')) return false;
    }
    return true;
  }
  // the way a swipe takes the shortcut on offer: −1 left, 1 right, 2 straight on
  function offerSide(o) {
    const st = R.route.steps[o.k], d = dirBetween(city, st.tile, o.tiles[0]);
    return d === RIGHT(st.din) ? 1 : d === LEFT(st.din) ? -1 : 2;
  }
  function schemeTop(st) {
    let k = st.alley ? 0.72 : 1;
    if (R.scheme !== 'b') {
      const run = R.scheme === 'run';
      if (R.lat > KERB) k *= run ? 0.9 : 0.8; // slower going on the sidewalk
      if (R.sling > 0) k *= 1 + 0.3 * R.vs.boost;
      k *= 1 + (run ? 0.2 : 0.12) * (R.flow.mult - 1); // a flow streak opens the throttle further (on the run: the rising pace)
    } else k *= 1 + 0.04 * (R.gear - 1);
    return R.vs.top * k;
  }
  // the throttle is always open; holding the brake overrides it (it bites in over ~0.15 s). Inside a corner (late
  // brake) the tyres won't take more than the corner allows, and past the door the bike skids to a halt.
  function schemeSpeed(dt, target, top, acc) {
    R.brakeT += dt;
    if (R.over) { R.v = Math.max(0, R.v - 11 * dt); R.brk = 11; R.load = 0; return; }
    if (R.v > R.arcLim) R.v = Math.max(R.arcLim, R.v - 7 * dt);
    if (R.ctl.brake) {
      R.brakeT = 0; R.stats.brakeT += dt;
      R.brk = Math.min(BRAKE, R.brk + 60 * dt);
      R.v = Math.max(0, R.v - R.brk * dt);
      R.load += (0 - R.load) * Math.min(1, dt * 10);
      return;
    }
    autoSpeed(dt, Math.min(target, R.arcLim), top, acc);
  }
  function schemeTick(dt, st, ds) {
    laneTick(dt);
    if (R.lat > KERB) R.stats.walkM += ds;
    // in the oncoming lane (or slid into it) a car coming the other way is a head-on
    // (face to face at a stand is nobody's crash; after one, oncoming cars stop short of the bike while it's out there)
    if (R.lat < -LANE && R.crash <= 0) { const on = oncoming(); if (on.dist < 1.2 && R.v + (on.who?.v || 0) > 1.5) { crash('Head-on! Oops.'); R.headOn = true; if (on.who) on.who.wait = 2; } }
    lightTick();
    updateJunction();
    stuckTick(dt);
    passes();
    if (R.scheme === 'b') { cornerTick(dt); brakeZone(); gearTick(st); }
    else draftTick(dt);
    if (R.scheme === 'run') denseTick(dt);
  }
  // where the bike is across the road: the lane (easing over during a change) plus a slide out of a corner
  function laneTick(dt) {
    if (R.lc) { R.lc.t = Math.min(1, R.lc.t + dt / LC_T); R.laneLat = R.lc.from + (R.lc.to - R.lc.from) * smooth(R.lc.t); if (R.lc.t >= 1) R.lc = null; }
    else R.laneLat = LAT[R.lane];
    R.wide += (R.wideT - R.wide) * Math.min(1, dt * (R.wideT ? 4 : 1.5));
    const was = R.lat;
    R.lat = R.laneLat + R.wide;
    // up or down the kerb: a jolt through the springs, and a knock to the food if taken fast
    if ((was > KERB) !== (R.lat > KERB) && R.v > 1.5) { kick(Math.min(1, 0.3 + R.v / 16)); if (R.v > 7) hurtFood(1 + R.v * 0.15); else ctx.audio?.play('bump', { vol: 0.3 }); }
    // the sidewalk runs out before the corner (and the door): back down onto the road in time (ctlBlock holds the bike
    // at its end while the road beside is taken); alleys have one lane, and the door is in ours
    // (on the run, only with room behind the car in front: cutting in on it is a rear-end nobody chose)
    if (R.lane === 1 && walkRun(R.s) < R.v * LC_T + 3 && laneFree(0) && roomAhead()) setLane(0);
    if (R.lane < 0 && !R.autoBack && (R.route.length - R.s < 15 || stepAt().alley) && laneFree(0) && (stepAt().alley || roomAhead())) setLane(0);
    // round whatever blocked the lane (on our own, after a long wait): back in once past it
    if (R.autoBack && R.s > R.autoBack.s + (HZ[R.autoBack.type].len || 2) / 2 + 3 && laneFree(0)) { R.autoBack = null; if (R.lane < 0) setLane(0); }
  }
  // room to pull into our lane behind the car in front of it (the closing speed braked away, with a little to spare)
  function roomAhead() {
    if (R.scheme !== 'run') return true;
    const L = leaderAhead();
    return !L.who || L.gap > Math.max(2, Math.max(0, R.v - L.who.v) ** 2 / (2 * BRAKE) + 1.5);
  }
  // is a hazard across the part of the road the bike is on
  function laneHit(h) {
    const S = HZ_SHAPE[h.type], at = h.lane < 0 ? LAT[-1] : h.lane === 2 ? LAT[1] : 0;
    return Math.abs(R.lat - at) < (S ? S[0] : 1) + 0.35;
  }
  // what stops the bike: the car in front (nobody keeps the distance for you on the lane run), a double-parked car,
  // someone crossing, and up on the sidewalk the street furniture, café tables, people and the sidewalk's end. Ridden
  // into fast enough it's a crash, otherwise a knock and a stop. Returns how far the bike may go this frame.
  const WHY = { oncoming: 'Head-on! Oops.', car: 'Rear-ended a car!', parked: 'Hit a parked car!', person: 'Watch out for pedestrians!', pole: 'Hit a pole!', small: 'Wiped out on the sidewalk!', wall: 'Hit a wall!' };
  const probe = [0, 0, 0, 0, 0];
  function ctlBlock(ds) {
    if (R.crash > 0 || ds <= 0) return ds;
    const lat = R.lat, s1 = R.s + ds;
    let hit = null;
    const at = (s, kind, rel, who = null, hz = null) => { if (!hit || s < hit.s) hit = { s, kind, rel, who, hz }; };
    if (lat > -LANE && lat < KERB) {
      const L = leaderAhead();
      if (L.who && L.gap < ds) at(R.s + Math.max(0, L.gap), 'car', R.v - L.who.v, L.who);
      for (const h of R.hazards) {
        if (h.type !== 'parked' || h.done || Math.abs(lat) > 1.4) continue;
        const back = h.s - HZ.parked.len / 2 - 1.1;
        if (R.s <= back + 0.3 && s1 > back) at(back, 'parked', R.v, null, h);
      }
      if (R.scheme === 'a') for (const h of R.hazards) {
        if (h.type !== 'ped' || h.done || !h.walking || Math.abs(h.px - lat) > 0.75) continue;
        const front = h.s - 0.9;
        if (R.s <= front + 0.3 && s1 > front) at(front, 'person', R.v);
      }
    }
    // out in the oncoming lane, a car standing in front of the bike stops it (ridden into, it's a head-on)
    if (lat <= -LANE) { const on = oncoming(); if (on.who && on.who.v < 0.5 && on.dist < ds + 0.6) at(R.s + Math.max(0, on.dist - 0.6), 'oncoming', R.v); }
    // (riding the sidewalk lane, not while hopping the kerb: the rider threads between the trees; nor sliding wide out
    // of a corner onto the kerb)
    if (R.lane === 1 && lat >= KERB && !R.lc) {
      const run = walkRun(R.s);
      if (run < ds) at(R.s + Math.max(0, run), 'small', 0);
      sampleRoute(R.route, Math.min(R.route.length, s1 + 0.6), probe);
      const x = probe[0] - Math.cos(probe[2]) * lat, z = probe[1] + Math.sin(probe[2]) * lat;
      for (const c of world.hits(x, z, 0.42, contacts)) if (c.what !== 'edge') at(R.s, c.kind, R.v);
      for (const p of ctx.peds?.peds || []) { const q = p.c.obj.position; if (Math.hypot(q.x - x, q.z - z) < 0.74) at(R.s, 'person', R.v); }
    }
    if (!hit) return ds;
    if (hit.rel > (CRASH_AT[hit.kind] ?? 6)) crash(WHY[hit.kind] || 'Crash!');
    else if (hit.rel > 1.2) { hurtFood(Math.min(8, hit.rel * 1.2)); ctx.audio?.play('bump', { vol: Math.min(1, hit.rel / 6) }); if (hit.rel > 3) flowBreak(); }
    R.v = hit.who ? Math.max(0, Math.min(R.v, hit.who.v - 0.3)) : 0;
    if (hit.hz) R.blockHz = hit.hz;
    return Math.max(0, hit.s - R.s);
  }
  // stuck behind something in the lane: after a while the bike goes round it on its own once the oncoming lane is
  // clear — it costs time, it never strands the courier. (On the brake nothing on the plan blocks the lane — only the
  // road works card's barrier, which the worker moves — so there it's a fallback, and while the bike is out in the
  // oncoming lane a car coming the other way sees it and brakes.)
  function stuckTick(dt) {
    // (stopped short of what blocks the lane counts too — on the lane run nobody else notices it)
    if (!R.blockHz && R.v < 0.5 && R.lane === 0) { const B = blockingHazard(); if (B.h && B.d < 4 && B.h.type !== 'ped' && (R.scheme !== 'run' || B.h.type === 'parked')) R.blockHz = B.h; }
    R.stuckT = R.blockHz && R.v < 0.5 && R.lane === 0 && R.wait <= 0 ? R.stuckT + dt : 0;
    if (R.stuckT > 6 && oncoming().dist > (R.scheme === 'a' ? 25 : 40) && passFits()) { R.autoBack = R.blockHz; R.stuckT = 0; setLane(-1); }
    // face to face with a car in the oncoming lane and no way back in beside the bike (a double-parked car): it backs
    // up until there is one, and pulls in
    if (R.backUp) {
      R.v = 0; R.rev = 2.4; R.s = Math.max(0, R.s - R.rev * dt); R.backUp -= dt;
      if (laneFree(0) || R.backUp <= 0 || R.s <= 0) { R.backUp = 0; R.rev = 0; R.faceT = 0; R.autoBack = null; if (laneFree(0)) setLane(0); }
    } else if (R.lane < 0 && !R.lc && R.v < 0.3 && R.crash <= 0) {
      const on = oncoming();
      R.faceT = on.who && on.dist < 4 ? (R.faceT || 0) + dt : 0;
      if (R.faceT > 1.2) { if (laneFree(0)) { R.faceT = 0; R.autoBack = null; setLane(0); } else R.backUp = 8; }
    } else R.faceT = 0;
    if (R.lat > -LANE) R.headOn = false;
    // oncoming cars see the bike out in their lane on the autopilot's own pass, and after a head-on (otherwise the
    // oncoming lane the rider picks is the rider's risk)
    const i = traffic.blockers.indexOf(blocker);
    // (and on the run a bike that has all but stopped out there: a car brakes for a scooter standing in its way, not for one
    // riding at it)
    // (stopping a little further off than the head-on check's 1.2 m, so a car that has braked for the bike isn't one)
    if (R.lat < -LANE && (R.scheme === 'b' || R.autoBack || R.headOn || R.backUp || (R.scheme === 'run' && R.v < 2.5))) { const b = R.bike.root.position; blocker.x = b.x; blocker.z = b.z; blocker.pad = 0.8; if (i < 0) traffic.blockers.push(blocker); }
    else if (i >= 0) traffic.blockers.splice(i, 1);
  }
  // the pass round what blocks the lane has to be over before a light that could hold the bike out there
  function passFits() {
    const h = R.blockHz, end = h.s + (HZ[h.type].len || 2) / 2 + 3 - R.s, L = R.light;
    return !L || L.d > end + 2 || (L.state === 'g' && traffic.lightLeft(L.tile, L.din) > end / 3 + 2);
  }
  // through a stop line: on red it's the rider's call now (the camera — see drive); on lanes &
  // brake, reaching a light that had been red just as it turns green, without having stopped, is a green wave (the
  // autopilot rolls up to lights on its own, so there it's no feat). Also the autopilot's.
  // (a light that went red in the last half second before the line was crossed was entered on the amber: no red run)
  function lightTick() {
    const L = R.light, P = R.lightPrev;
    if (L && L.state !== 'g' && L.d < 40 && R.redSeen !== L.tile) { R.redSeen = L.tile; R.minV = R.v; }
    if (L && L.tile === R.redSeen) R.minV = Math.min(R.minV, R.v);
    if (L && L.state === 'y') R.amber = { tile: L.tile, t: R.rideTime };
    if (P && P.tile !== R.runLight && (!L || L.tile !== P.tile) && P.d < Math.max(2, R.v * 0.3) && R.v > 0.5) {
      if (P.state === 'r' && R.amber?.tile === P.tile && R.rideTime - R.amber.t < 0.5) { /* through on the amber */ }
      else if (P.state === 'r') { R.runLight = P.tile; R.runLightState = 'r'; R.lightJudged = false; R.stats.reds++; ctx.ui.toast('Running the red!', 'warn'); }
      else if (P.state === 'g' && R.redSeen === P.tile && R.minV > 1.5 && !R.auto) { R.stats.waves++; flow('GREEN WAVE!'); }
    }
    R.lightPrev = L && L.d < 30 ? { tile: L.tile, state: L.state, d: L.d } : null;
    R.lightLeft = L ? traffic.lightLeft(L.tile, L.din) : Infinity;
    countdown(L);
  }
  // the rhythm of the lights: a countdown above the signal head of the next light on the route (seconds until it
  // changes), so a rider can time the brake — or the detour — instead of guessing
  const cdown = (() => {
    const cv = document.createElement('canvas'); cv.width = cv.height = 96;
    const tex = new THREE.CanvasTexture(cv);
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, toneMapped: false }));
    sp.scale.set(1.9, 1.9, 1); sp.renderOrder = 5; sp.visible = false;
    return { cv, tex, sp, key: '' };
  })();
  function countdown(L) {
    const show = !!L && L.d < 70 && R.phase === 'ride';
    cdown.sp.visible = show;
    if (!show) return;
    if (!cdown.sp.parent) scene.add(cdown.sp);
    const head = traffic.headAt(L.tile, L.din);
    if (!head) { cdown.sp.visible = false; return; }
    cdown.sp.position.set(head[0], 4.45, head[1]);
    const n = Math.max(1, Math.ceil(R.lightLeft)), key = L.state + n;
    if (key === cdown.key) return;
    cdown.key = key;
    const c = cdown.cv.getContext('2d'), col = { r: '#ff3b30', y: '#ffc23a', g: '#46ff6a' }[L.state];
    c.clearRect(0, 0, 96, 96);
    c.beginPath(); c.arc(48, 48, 42, 0, Math.PI * 2); c.fillStyle = 'rgba(16, 24, 42, .9)'; c.fill();
    c.lineWidth = 6; c.strokeStyle = col; c.stroke();
    c.fillStyle = col; c.font = "bold 50px 'Lilita One', 'Fredoka', sans-serif"; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText(String(n), 48, 51);
    cdown.tex.needsUpdate = true;
  }
  // ---- the turn at the junction ahead: the GPS's way unless the rider swipes another (within a window that opens a
  // couple of seconds out and closes where the turn begins). Each exit is costed against the GPS's way, so the arrows
  // can say what a detour buys (or costs). The courier run has none: the GPS takes every turn.
  function updateJunction() {
    // only from our own lane: in another lane a swipe is the way back in, not a turn
    if (R.scheme === 'run' || R.lane !== 0 || R.lc || R.blockHz) { R.junc = null; return; }
    const steps = R.route.steps, k0 = R.sampled[3];
    const reach = Math.max(16, R.v * 2.2);
    let J = null;
    for (let k = k0 + 1; k < Math.min(steps.length - 1, k0 + 5); k++) {
      const t = city.tiles[steps[k].tile];
      if (!t.junction) continue;
      let lock = steps[k].s0 - 1;
      for (const a of R.arcs) if (a.s0 < lock && a.s1 > steps[k].s0 - 0.1) lock = a.s0 - 0.5;
      const dist = lock - R.s;
      if (dist < 0) continue; // committed to this one
      if (dist > reach) break;
      const din = steps[k].din;
      const dirOf = (r) => (r < 0 ? LEFT(din) : r > 0 ? RIGHT(din) : din);
      const rels = [-1, 0, 1].filter((r) => t.mask & (1 << dirOf(r)));
      if (rels.length < 2) break;
      const dout = steps[k].dout, cur = dout === din ? 0 : dout === LEFT(din) ? -1 : 1;
      if (R.junc && R.junc.tile === t.i && R.junc.route === R.route) { J = R.junc; J.dist = dist; break; }
      const gps = R.juncGps.get(t.i) ?? cur; R.juncGps.set(t.i, gps);
      // what each exit buys: metres and lights against the way the GPS has now
      const dest = steps[steps.length - 1].tile, curT = steps.slice(k + 1).map((x) => x.tile);
      const curLights = curT.filter((x) => traffic.lightAt.has(x)).length;
      const exits = {};
      for (const r of rels) {
        const d = dirOf(r), n = t.i + DIRS[d][0] + DIRS[d][1] * city.W;
        if (r === cur) { exits[r] = { rest: curT, save: 0, lights: 0, label: r === gps ? 'GPS' : 'chosen' }; continue; }
        const rest = findPath(city, n, dest, { noBack: OPP(d) });
        if (!rest) continue;
        const save = (curT.length - rest.length) * TILE, lights = curLights - rest.filter((x) => traffic.lightAt.has(x)).length;
        exits[r] = { rest, save, lights, label: save >= 10 ? `−${Math.round(save)} m` : lights >= 1 ? `skip ${lights} light${lights > 1 ? 's' : ''}` : save <= -10 ? `+${Math.round(-save)} m` : 'same' };
      }
      J = { k, tile: t.i, din, rels, cur, gps, dist, exits, route: R.route };
      break;
    }
    R.junc = J;
    if (J && !R.juncSeen.has(J.tile)) { R.juncSeen.add(J.tile); if (Object.values(J.exits).some((e) => e.save >= 10 || e.lights >= 1)) ctx.audio?.play('ui-tap', { vol: 0.25, rate: 1.4 }); }
  }
  function chooseTurn(dir) {
    const J = R.junc, rel = dir === 2 ? 0 : dir;
    const E = J.exits[rel];
    if (!E) { R.bike?.bump?.(0.2); buzz(25); return; } // no street that way
    if (rel === J.cur) return;
    const steps = R.route.steps, k0 = R.sampled[3];
    const path = [];
    for (let k = k0; k <= J.k; k++) path.push(steps[k].tile);
    path.push(...E.rest);
    replaceRoute(path);
    R.stats.turns++;
    ctx.audio?.play('ui-tap', { vol: 0.6 });
    buzz(10);
    if (E.save >= 10 || E.lights >= 1) flow('SMART TURN!');
    else if (rel !== J.gps) ctx.ui.toast(`Rerouting… ${E.label}`, '');
    updateJunction();
  }
  // lane run: riding close behind a car going our way fills the draft (wind streaks past the rider); pulling out
  // spends it on a slingshot
  function draftTick(dt) {
    let on = false;
    if (R.lane === 0 && !R.lc && R.v > 3) { const L = leaderAhead(); on = !!L.who && L.who.kind === 'car' && L.gap < 10 && L.who.v > 3; }
    R.draft = on ? Math.min(1, R.draft + dt / 1.2) : Math.max(0, R.draft - dt / 1.5);
    R.drafting = on;
    if (on && (R.windT = (R.windT || 0) - dt) <= 0) { R.windT = 0.2; const b = R.bike.root.position, hd = R.bike.root.rotation.y; pfx.whoosh(b.x, b.z, Math.sin(hd), Math.cos(hd), rng() < 0.5 ? 1 : -1); }
    if (R.sling > 0 && (R.sling -= dt) <= 0) R.boost = false;
  }
  function slingshot() {
    const k = R.draft;
    R.sling = 0.9 + 1.6 * k; R.v += 1.2 + 2.2 * k; R.boost = true; R.draft = 0; R.stats.slings++;
    ctx.audio?.play('boost', { vol: 0.6 }); buzz(18);
    R.bike?.wheelie?.(0.45);
    const b = R.bike.root, hd = b.rotation.y;
    if (R.bike.exhaust) R.bike.exhaust.getWorldPosition(wp); else wp.set(b.position.x - Math.sin(hd) * 0.9, 0.45, b.position.z - Math.cos(hd) * 0.9);
    pfx.boostStart(wp.x, wp.y, wp.z, Math.sin(hd), Math.cos(hd), R.vs.v.engine === 'engine-electric');
    if (k > 0.85) flow('SLINGSHOT!');
  }
  // ---- the courier run (the phone's ride since 2026-10-30): the road rides itself, the traffic is the rider's. The
  // autopilot keeps the pace and takes the corners (and pulls up at the door); the cars in front, a double-parked car, people crossing and red
  // lights are the rider's: hold BRAKE (the button, ↓ / S / Space) or swipe to another lane — the oncoming lane and the
  // sidewalk are quicker and hold the coins. The streets are busy: slow cars in our lane, a stream coming the other way,
  // so getting anywhere means slipping between them. A swipe up hops what's low in the lane (potholes, puddles, cones,
  // road works, crates); rolled over slowly on the brake it's only a jolt. The food is the life bar: knocked to nothing,
  // the order is ruined.
  // something to hop just ahead in the bike's lane (a swipe up then is the hop, whatever else it could mean)
  function hopNow() {
    const v = Math.max(R.v, 2);
    return R.hazards.some((h) => !h.done && HZ[h.type].hop && h.inPath && h.ahead > -0.5 && h.ahead < v * 0.62 + 2);
  }
  // the run's traffic: the city's cars gather round the route. Every 0.4 s, while the 160 m ahead holds fewer than the
  // district's share (less on a new rider's first two runs), the car furthest from the bike (out of sight, 170 m+) is lifted and put down on the route 105–160 m
  // on (inside the fog): in our lane at a crawl, or coming the other way. They keep that pace until the ride is over.
  const DENSE = { own: 30, onc: 40 }; // metres between cars ahead in Downtown's traffic (quieter districts: further apart)
  function denseTick(dt) {
    if ((R.denseT -= dt) > 0) return;
    R.denseT = 0.4;
    const steps = R.route.steps, k0 = R.sampled[3], reach = Math.min(160, R.route.length - R.s);
    if (reach < 110) return;
    let own = 0, onc = 0;
    for (let k = k0; k < steps.length && steps[k].s0 < R.s + reach; k++) {
      const st = steps[k];
      for (const a of traffic.byTile.get(st.tile) || []) if (a.kind === 'car') { if (a.din === st.din) own++; else if (a.din === OPP(st.dout)) onc++; }
    }
    // (a new rider's first two runs are quieter: half the cars, then three quarters)
    const busy = (0.45 + 0.55 * (DISTRICT[city.tiles[stepAt().tile].d]?.traffic ?? 0.7)) * Math.min(1, 0.5 + 0.25 * St.S.stats.deliveries);
    const mine = own < Math.floor(reach * busy / DENSE.own);
    if (!mine && onc >= Math.floor(reach * busy / DENSE.onc)) return;
    const at = R.s + 105 + rng() * Math.min(55, reach - 105);
    let k = k0; while (k < steps.length - 1 && steps[k + 1].s0 <= at) k++;
    const st = steps[k];
    if (st.alley || st.din !== st.dout || city.tiles[st.tile].junction || !steps[k - 1] || !steps[k + 1]) return;
    const din = mine ? st.din : OPP(st.din), into = mine ? at - st.s0 : TILE - (at - st.s0);
    if ((traffic.byTile.get(st.tile) || []).some((b) => b.din === din && Math.abs(b.s - into) < 9)) return;
    const bp = R.bike.root.position;
    let car = null, far = 170;
    for (const a of traffic.agents) { if (a.kind !== 'car' || a.obj) continue; const d = Math.hypot(a.pos[0] - bp.x, a.pos[1] - bp.z); if (d > far) { far = d; car = a; } }
    if (!car) return;
    traffic.placeAgent(car, st.tile, din, din, Math.max(0.5, Math.min(TILE - 0.5, into)));
    // (on along the route, ours or back towards the bike, at least as far as the next tile)
    car.next = mine ? steps[k + 1].dout : OPP(steps[k - 1].din);
    car.vmax0 ??= car.vmax;
    car.vmax = car.v = mine ? 3 + rng() * 3.5 : 5 + rng() * 3; car.wait = 0;
  }
  function calmTraffic() { for (const a of traffic.agents) if (a.vmax0 != null) { a.vmax = a.vmax0; delete a.vmax0; } }
  function ruin(x) {
    x.ruined = true; R.stats.ruined++;
    flowBreak(); kick(1.4); buzz([60, 40, 90]);
    ctx.audio?.play('order-late');
    ctx.ui.pop?.('FOOD RUINED', 'lost');
    ctx.ui.toast(`${x.o.name}'s order is ruined — no pay for it`, 'bad');
  }
  // late brake: a corner's speed limit on the line through it (wider round the outside of the turn, tighter inside)
  const vLimit = (a, lat) => Math.sqrt(A_LAT * R.vs.corner * (1 - 0.2 * (ctx.weather?.rain || 0)) * Math.max(1.5, a.r - a.sgn * lat));
  // the speed a corner is taken at: a hair under the limit after braking is perfect; over it the bike slides wide
  // (across the oncoming lane, or toward the kerb on a left turn), well over it the bike goes down
  function cornerTick(dt) {
    const a = R.arcs.find((x) => x.s0 <= R.s && x.s1 > R.s) || null;
    if (a && a !== R.arcIn) {
      R.arcIn = a;
      const k = R.v / vLimit(a, R.lat);
      if (k > 1.45) { R.stats.wide++; crash('Took the corner too fast!'); }
      else if (k > 1.06) {
        // (out to the left it can cross the oncoming lane; out to the right it fetches up against the kerb)
        R.wideT = Math.min(-a.sgn * Math.min(3.4, (k - 1.06) * 10), KERB + 0.3 - R.laneLat); R.stats.wide++;
        hurtFood((k - 1) * 22); flowBreak(); ctx.audio?.play('skid', { vol: 0.6 });
        if (!R.wideTold) { R.wideTold = true; ctx.ui.toast('Too fast — sliding wide!', 'warn'); }
      } else if (k > 0.86 && R.brakeT < 2.5) { R.stats.corners++; flow('PERFECT CORNER!'); }
    } else if (!a && R.arcIn) { R.arcIn = null; R.wideT = 0; }
    R.arcLim = a ? vLimit(a, R.lat - R.wide) : Infinity;
    // rubber on the road while it slides
    if (a && R.wideT && R.v > 3 && (R.skidT = (R.skidT || 0) - dt) <= 0) { R.skidT = 0.05; const b = R.bike.root; pfx.skidMark(b.position.x - Math.sin(b.rotation.y) * 0.66, b.position.z - Math.cos(b.rotation.y) * 0.66, b.rotation.y); }
  }
  const BUMPS = new Set(['pothole', 'puddle', 'cones', 'crates']); // the brake: what to slow down over
  // late brake: where the brake has to go on (at 80% of full braking) for the nearest corner, red light (one that will
  // still be red when we get there, with no car waiting at it in front of us), someone crossing, pothole or puddle in
  // our way, or the door ahead — the GPS arrows turn red from there to the spot, and the speed dial warns once it's late
  function brakeZone() {
    let best = null;
    const v2 = R.v * R.v, B = BRAKE * 0.8;
    const want = (kind, s, vt, h = null) => { if (R.v <= vt + 0.3) return; const at = s - (v2 - vt * vt) / (2 * B); if (!best || at < best.at) best = { kind, s, vt, at, h }; };
    for (const a of R.arcs) { if (a.s0 < R.s) continue; if (a.s0 > R.s + 90) break; want('corner', a.s0, vLimit(a, LAT[R.lane])); }
    const L = R.light;
    if (L && L.tile !== R.runLight && L.state !== 'g') {
      const left = traffic.lightLeft(L.tile, L.din), eta = L.d / Math.max(R.v, 4), lead = leaderAhead();
      const clear = L.state === 'r' ? left < eta - 0.5 : eta < left; // (green by then, or through on the yellow)
      if (!clear && !(lead.who && lead.gap < L.d - 1)) want('light', R.s + Math.max(0, L.d), 0);
    }
    for (const h of R.hazards) {
      if (pedThreat(h)) want('ped', h.s - 2.6, 0, h);
      else if (BUMPS.has(h.type) && !h.done && h.inPath && h.s > R.s + 1.2 && h.s < R.s + 60) want('bump', h.s - 1.2, SMOOTH_V, h); // (it's felt 1.2 m out)
    }
    if (!R.over) want('door', R.route.length, 0);
    R.bz = best;
    R.cornerWarn = !!best && best.at < R.s - 1 && !R.ctl.brake;
    ribbon?.userData.setBrake?.(best && best.at < R.s + 45 ? best.at : -1, best ? best.s : -1);
  }
  // late brake: every junction rolled through without a full stop since the last one is a gear up (a little more top
  // speed); coming to a stand drops back to first
  function gearTick(st) {
    if (R.v > 3) R.moved = true;
    if (R.v < 1 && R.moved && R.wait <= 0) { R.moved = false; R.gearRun = false; if (R.gear > 1) { R.gear = 1; ctx.ui.pop?.('GEAR LOST', 'lost'); } }
    if (st.tile !== R.gearTile && city.tiles[st.tile].junction) {
      R.gearTile = st.tile;
      if (R.gearRun && R.gear < 5) { R.gear++; R.stats.gearMax = Math.max(R.stats.gearMax, R.gear); ctx.ui.pop?.(`GEAR ${R.gear}`, 'gear'); ctx.audio?.play('qte-good', { vol: 0.25, rate: 0.8 + R.gear * 0.1 }); }
      R.gearRun = true;
    }
  }
  // late brake: the door is a ring on the road; come to rest inside it (dead centre: a perfect stop). Past it, the bike
  // skids to a halt and backs up to it.
  function doorTick(dt) {
    const L = R.route.length, off = R.s - L;
    sampleRoute(R.route, L, probe);
    ringMk.visible = true; ringMk.position.set(probe[0], 0, probe[1]); ringMk.scale.set(RING_B / RING_R, 1, RING_B / RING_R);
    if (R.crash > 0 || R.eventCam || R.hop) return;
    if (!R.over && off > RING_B && R.v > 0.5) { R.over = { back: false }; R.stats.overshoots++; flowBreak(); ctx.audio?.play('skid', { vol: 0.6 }); ctx.ui.toast('Overshot the door!', 'bad'); }
    if (R.over) {
      if (!R.over.back && R.v < 0.2) { R.over.back = true; R.v = 0; }
      if (R.over.back) { R.rev = 2.4; R.s = Math.max(L, R.s - R.rev * dt); if (R.s <= L + 0.05) { R.rev = 0; arrive(); } }
      return;
    }
    if (Math.abs(off) < RING_B && R.v < 0.8) {
      if (Math.abs(off) < 0.9) { R.stats.stops++; flow('PERFECT STOP!'); }
      arrive();
    }
  }
  // first-time hints for the two moves (no buttons to point at); time slows while the rider reads
  const COACH_LB = {
    brake: 'The gas is always on. <b>Hold anywhere</b> to brake — or <b>swipe</b> into another lane.',
    zone: 'Red arrows: <b>hold anywhere</b> to brake before they run out. Corners, red lights, people crossing, potholes and the door are yours.',
    round: 'Something blocks your lane: <b>swipe left</b> to go round it.',
    draft: "You're in its slipstream! <b>Swipe out</b> now to slingshot past.",
    ring: 'Stop inside the <b>ring</b> at the door — dead centre is a perfect stop.',
    shortcut: 'Your Navigation skill found a <b>shortcut</b>! <b>Swipe</b> toward it to cut through.',
    turn: 'A junction: do nothing and the GPS turns for you — or <b>swipe</b> to take another street. The arrows say what it buys.',
    light: 'The number over the light counts down to its change. Time your brake — or <b>swipe</b> off before it.',
  };
  function coachLB(dt) {
    const seen = St.S.seen;
    if (coachOn) {
      coachT -= dt / Math.max(0.05, R.timeScale);
      const done = { brake: R.ctl.brake || !!R.lc, zone: R.ctl.brake, round: !!R.lc, draft: !!R.lc, ring: false, shortcut: !R.offer, turn: !R.junc, light: false }[coachOn];
      if (done || coachT <= 0) { R.timeScale = R.event && R.event.fired && document.querySelector('.evdock') ? R.timeScale : 1; ctx.ui.coach(null); coachOn = null; }
      return;
    }
    if (R.timeScale < 1) return;
    let want = null;
    const L = R.scheme === 'a' && R.lane === 0 ? leaderAhead() : null, Lt = R.light;
    if (!seen.c_lb_brake && R.scheme === 'a' && ((L?.who && L.gap < 12 && R.v > L.who.v + 2) || (Lt && Lt.state === 'r' && Lt.d < 22 && R.v > 4))) want = 'brake';
    else if (!seen.c_lb_zone && R.scheme === 'b' && R.bz && R.bz.kind !== 'door' && R.bz.at - R.s < 6) want = 'zone';
    else if (!seen.c_lb_round && R.scheme === 'a' && R.stuckT > 1.2) want = 'round';
    else if (!seen.c_lb_draft && R.draft > 0.7) want = 'draft';
    else if (!seen.c_lb_ring && R.scheme === 'b' && R.route.length - R.s < 40 && R.v > 3) want = 'ring';
    else if (!seen.c_lb_shortcut && R.offer) want = 'shortcut';
    else if (!seen.c_lb_turn && R.junc && R.junc.dist > 8 && Object.values(R.junc.exits).some((e) => e.save >= 10 || e.lights >= 1)) want = 'turn';
    else if (!seen.c_lb_light && R.light && R.light.d < 45 && R.light.d > 15 && R.light.state === 'r' && R.lightLeft < 5) want = 'light';
    if (!want) return;
    seen['c_lb_' + want] = 1; St.save();
    coachOn = want; coachT = 3.2;
    R.timeScale = want === 'ring' || want === 'shortcut' || want === 'light' ? 1 : 0.25;
    ctx.ui.coach({ text: COACH_LB[want] });
  }
  // the courier run's first-time hints (the draft and a shortcut are the lane run's)
  const COACH_RUN = {
    hop: '<b>Swipe up</b> to hop it!',
    lane: 'Your scooter won\'t stop for it! <b>Swipe left / right</b> to slip past — or hold <b>BRAKE</b>.',
    red: 'Red light — hold <b>BRAKE</b> to stop. Run it and a camera may fine you.',
    onc: 'Coming at you! Back in your lane — or <b>BRAKE</b>: they stop for a scooter standing still.',
    coins: 'Coins! <b>Swipe</b> into their lane to grab them. The risky lanes have the most.',
    light: 'The number over the light counts down to green: ease off with <b>BRAKE</b> and roll through as it changes.',
  };
  function coachRun(dt) {
    const seen = St.S.seen;
    if (coachOn) {
      coachT -= dt / Math.max(0.05, R.timeScale);
      const done = { hop: !!R.hop, lane: !!R.lc || R.ctl.brake, red: R.ctl.brake, onc: !!R.lc || R.ctl.brake, coins: !!R.lc, draft: !!R.lc, shortcut: !R.offer, light: false }[coachOn];
      if (done || coachT <= 0) { R.timeScale = R.event && R.event.fired && document.querySelector('.evdock') ? R.timeScale : 1; ctx.ui.coach(null); coachOn = null; }
      return;
    }
    if (R.timeScale < 1) return;
    const ahead = (f, far) => R.hazards.some((h) => !h.done && f(h) && h.ahead > 3 && h.ahead < Math.max(far, R.v * 1.6));
    let want = null;
    const L = R.lane === 0 ? leaderAhead() : null, Lt = R.light;
    if (!seen.c_run_hop && ahead((h) => HZ[h.type].hop && h.inPath, 10)) want = 'hop';
    else if (!seen.c_run_lane && R.lane === 0 && ((L.who && L.gap < 16 && R.v > L.who.v + 2.5) || ahead((h) => (h.type === 'parked' && h.inPath) || pedThreat(h), 18))) want = 'lane';
    else if (!seen.c_run_red && Lt && Lt.state === 'r' && Lt.d < 30 && Lt.d > 8 && R.v > 4 && R.lightLeft > 2.5 && !R.ctl.brake) want = 'red';
    else if (!seen.c_run_onc && R.lane < 0 && !R.lc && oncoming().dist < 32) want = 'onc';
    else if (!seen.c_run_coins && ahead((h) => h.type === 'coin' && !h.inPath, 22)) want = 'coins';
    else if (!seen.c_lb_draft && R.draft > 0.7) want = 'draft';
    else if (!seen.c_lb_shortcut && R.offer) want = 'shortcut';
    else if (!seen.c_run_light && R.light && R.light.d < 45 && R.light.d > 15 && R.light.state === 'r' && R.lightLeft < 5) want = 'light';
    if (!want) return;
    seen[(COACH_RUN[want] ? 'c_run_' : 'c_lb_') + want] = 1; St.save();
    coachOn = want; coachT = 3.2;
    R.timeScale = want === 'coins' || want === 'shortcut' || want === 'light' ? 1 : 0.25;
    ctx.ui.coach({ text: COACH_RUN[want] || COACH_LB[want], btn: want === 'lane' || want === 'red' || want === 'onc' ? 'brake' : null });
  }
  // test hook (tools/ctl.mjs): a careful rider for lanes & brake — brakes for what it would hit (on the late brake also
  // for corners, red lights and the door), pulls out round what blocks the lane when the oncoming lane is clear, and on
  // the lane run spends a full draft on a slingshot
  function schemeBot() {
    if (!R.scheme || !R.active || R.phase !== 'ride') return null;
    if (R.scheme === 'run') return runBot();
    let target = Infinity;
    const stopAt = (d, vt = 0) => { target = Math.min(target, Math.sqrt(vt * vt + 2 * 6 * Math.max(0, d))); };
    const L = R.lat > -LANE && R.lat < KERB ? leaderAhead() : { gap: Infinity, who: null };
    const B = blockingHazard(), on = oncoming(), Lt = R.light;
    // a light: on the amber, through only if it's made before the red (or it's too late to stop); on red, slow just enough
    // to roll up as it turns green (a green wave), or stop at the line when that would mean crawling
    if (Lt && Lt.tile !== R.runLight && Lt.state !== 'g') {
      const left = traffic.lightLeft(Lt.tile, Lt.din), eta = Lt.d / Math.max(R.v, 1);
      if (Lt.state === 'y') { if (!(eta < left - 0.1 || Lt.d < (R.v * R.v) / (2 * BRAKE) + 0.5)) stopAt(Lt.d - 1.5); }
      else { const vWave = Lt.d / (left + 0.4); if (vWave > 2.5 && left < 8) target = Math.min(target, vWave); else stopAt(Lt.d - 1.5); }
    }
    if (R.scheme === 'a') {
      if (L.who) target = Math.min(target, L.who.v + Math.sqrt(2 * 6 * Math.max(0, L.gap - 3)));
      for (const h of R.hazards) {
        if (h.done || h.ahead < -1) continue;
        if (h.type === 'parked' && Math.abs(R.lat) < 1.4) stopAt(h.ahead - HZ.parked.len / 2 - 2);
        if (h.type === 'ped' && h.walking && Math.abs(h.px - R.lat) < 1.6) stopAt(h.ahead - 3);
      }
    } else {
      for (const a of R.arcs) { if (a.s1 < R.s) continue; if (a.s0 > R.s + 80) break; stopAt(a.s0 - R.s, vLimit(a, LAT[R.lane]) * 0.97); }
      for (const h of R.hazards) {
        if (h.done || h.ahead < -1) continue;
        if (h.type === 'ped' && !h.slow && h.walking && (pedThreat(h) || (R.v < 1 && Math.abs(h.px - R.lat) < 1.6))) stopAt(h.ahead - 3);
        if (BUMPS.has(h.type) && h.inPath && h.ahead > 1.2) stopAt(h.ahead - 1.6, SMOOTH_V * 0.85);
      }
      stopAt(R.route.length - R.s);
    }
    // round whatever blocks our lane when the oncoming lane is clear for long enough; back in once past it (judged
    // from our lane, wherever the bike is across the road)
    const L0 = leaderAhead();
    const blocked = (B.h && B.d < 16 && B.h.type !== 'ped') || (L0.who && L0.gap < 14 && L0.who.v < R.vs.top * 0.7);
    if (R.scheme === 'b') { /* (no lanes: the autopilot goes round) */ }
    else if (R.lane === 0 && !R.lc && !R.junc && blocked && on.dist > 60 && R.route.length - R.s > 30) laneInput(-1);
    else if (R.lane < 0 && !R.lc && laneFree(0) && (!blocked || on.dist < 30)) laneInput(1);
    else if (R.scheme === 'a' && R.lane === 0 && !R.lc && !R.junc && R.draft > 0.95 && on.dist > 60) laneInput(-1);
    // (stopped for a red light, it keeps the brake held instead of creeping over the line)
    input('brake', R.v > target + (R.scheme === 'b' ? 0.25 : 0.5) || (R.ctl.brake && (R.v > target + 0.1 || target < 1)));
    return { target, lane: R.lane, brake: R.ctl.brake };
  }

  // the courier run's careful rider: hops what's in the lane just before it; slips past a slow car, a double-parked car
  // or someone crossing by the oncoming lane when there's a gap in the cars coming (back in once past, with room in
  // front); brakes for what it can't get round (the car in front, someone crossing, a red light) and never runs a red.
  // Caught out there by a car coming with no way back in yet, it stops: the car stops for a scooter standing in its way,
  // and the bike creeps on past what blocked its lane
  function runBot() {
    const v = Math.max(R.v, 2), on = oncoming(), Lt = R.light;
    if (!R.hop && R.hazards.some((h) => !h.done && HZ[h.type].hop && h.inPath && h.ahead > v * 0.18 && h.ahead < v * 0.34)) laneInput(2);
    let target = Infinity;
    const stopAt = (d, vt = 0) => { target = Math.min(target, Math.sqrt(vt * vt + 2 * 6 * Math.max(0, d))); };
    if (Lt && Lt.tile !== R.runLight && Lt.state !== 'g') {
      const left = traffic.lightLeft(Lt.tile, Lt.din), eta = Lt.d / Math.max(R.v, 1);
      if (Lt.state === 'y') { if (!(eta < left - 0.1 || Lt.d < (R.v * R.v) / (2 * BRAKE) + 0.5)) stopAt(Lt.d - 1.5); }
      else { const vWave = Lt.d / (left + 0.4); if (vWave > 2.5 && left < 8) target = Math.min(target, vWave); else stopAt(Lt.d - 1.5); }
    }
    const at = (h, lat) => Math.abs(lat - (h.lane < 0 ? LAT[-1] : h.lane === 2 ? LAT[1] : 0)) < (HZ_SHAPE[h.type]?.[0] ?? 1) + 0.35;
    const L = leaderAhead();
    // (behind a car: as close as its speed allows, but never closer than a stop if it stops dead for a light — a car
    // brakes at up to 9 m/s²)
    if (R.lat > -LANE && R.lat < KERB && L.who) target = Math.min(target, L.who.v + Math.sqrt(2 * 6 * Math.max(0, L.gap - 3)), Math.sqrt(2 * 5.5 * Math.max(0, L.gap - 3.5 + L.who.v ** 2 / 18)));
    for (const h of R.hazards) {
      if (h.done || h.ahead < -1) continue;
      if (h.type === 'parked' && at(h, R.lat)) stopAt(h.ahead - HZ.parked.len / 2 - 2);
      if (h.type === 'ped' && h.walking && !h.scared && (pedThreat(h) || Math.abs(h.px - R.lat) < 1.8)) stopAt(h.ahead - 3);
    }
    // back into our lane: nothing alongside, nothing in it that the brake couldn't stop for, and room behind the car in
    // front (merged in right behind a slower car, it's a rear-end)
    const stopFor = (R.v * R.v) / (2 * 8) + R.v * 0.3 + 5;
    const clear = (lat) => !R.hazards.some((h) => !h.done && h.ahead > -1 && h.ahead < stopFor && (h.type === 'parked' ? at(h, lat) : h.type === 'ped' && h.walking && !h.scared && Math.abs(h.px - lat) < PED_W + 0.5));
    const room = !L.who || L.gap > Math.max(4, Math.max(0, R.v - L.who.v) ** 2 / (2 * 6) + 3);
    // (any car of ours still alongside or just ahead: back in only a length clear of it)
    const beside = () => { const k0 = R.sampled[3], steps = R.route.steps; for (let k = Math.max(0, k0 - 1); k <= Math.min(steps.length - 1, k0 + 1); k++) { const st = steps[k]; for (const a of traffic.byTile.get(st.tile) || []) { if (a === agent || a.din !== st.din || a.off <= 0) continue; const d = st.s0 + a.s - R.s; if (d > -(a.len / 2 + 2.5) && d < a.len / 2 + 4) return true; } } return false; };
    const back = laneFree(0) && clear(0) && room && !beside();
    // out in the oncoming lane with a car coming and no way back in yet: stop short of it (once it has stopped for the
    // bike, creep on)
    if (R.lat < -LANE && on.who && on.dist < 45 && !back) { if (on.who.v < 0.5 && R.v < 2.5) target = Math.min(target, on.dist > 3 ? 2 : 0); else stopAt(on.dist - 6 - on.who.v * 1.2); }
    if (!R.lc && R.crash <= 0) {
      const reach = Math.max(18, v * 2.2);
      const blocked = (lat) => R.hazards.some((h) => !h.done && h.ahead > -3 && h.ahead < reach && (h.type === 'parked' ? at(h, lat) : h.type === 'ped' && h.walking && !h.scared && h.px > lat - PED_W - 2.5 && h.px < lat + PED_W + 0.3));
      const slow = L.who && L.gap < 16 && L.who.v < R.vs.top * 0.7;
      // the gap in the oncoming cars: long enough to get past what's in front — pulling out the bike pulls away from it
      // (from its speed, at the bike's acceleration), while what's coming closes in
      const rel = slow ? L.gap + L.who.len + 6 : 14, vb = slow ? L.who.v : R.v;
      const t = R.v > vb + 2 ? rel / (R.v - vb) : Math.sqrt((2 * rel) / Math.max(1, R.vs.accel));
      const gap = on.dist > vb * t + rel + (on.who?.v || 0) * t + 10;
      if (R.lane === 0 && (blocked(0) || slow) && gap && !blocked(LAT[-1]) && R.route.length - R.s > 30 && !stepAt().alley) laneInput(-1);
      else if (R.lane < 0 && back && (!blocked(0) || on.dist < 30 || blocked(LAT[-1]))) laneInput(1);
    }
    // (held like a thumb holds it — until a little under the speed it wants, not in taps — and kept on when stopped for a
    // red light instead of creeping over the line)
    input('brake', R.v > target + 0.3 || (R.ctl.brake && (R.v > target - 0.6 || target < 1)));
    return { target, lane: R.lane, brake: R.ctl.brake };
  }

  // ---------- per-frame ----------
  function update(dtReal) {
    if (!R.active) return;
    const dt = dtReal * R.timeScale;
    R.hornCd -= dtReal;
    updateNpc(dtReal);
    if (R.phase === 'ride') {
      R.rideTime += dt;
      for (const x of R.orders) if (!x.done) {
        x.elapsed += dt;
        if (x.picked) {
          const F = FOODS[x.o.food];
          const rate = (F.melts ? 0.75 : F.cold ? 0.22 : 0.42) * R.vs.heat;
          x.heat = Math.max(0, x.heat - rate * dt);
        }
      }
      if (R.manual) freeDrive(dt); else drive(dt);
    }
    if (R.phase !== 'ride') { R.accS *= Math.exp(-dt * 6); R.load = 0; R.slip = 0; }
    if (R.bike) {
      R.bike.update(dt, R.manual && F.fv < 0 ? F.fv : R.rev ? -R.rev : R.v, R.lean, R.steer, R.accS);
      R.bike.setBrake?.(R.phase === 'ride' && (R.manual ? R.ctl.brake && F.fv > 0.3 : R.brk > 1.5 || (!!R.scheme && R.ctl.brake)));
    }
    if (ringMk.visible) { const p = 0.5 + 0.5 * Math.sin(R.rideTime * 4.5); ringMk.userData.mat.opacity = 0.55 + 0.35 * p; ringMk.userData.wmat.opacity = 0.28 + 0.2 * p; }
    if (ctx.renderer) pfx.update(dt, camera, ctx.renderer);
    updateActors(dt);
    camUpdate(dtReal);
    ctx.ui.rideFrame(R);
  }

  function drive(dt) {
    const route = R.route;
    sampleRoute(route, R.s, R.sampled);
    if (R.here) { R.v = 0; arrive(); R.here = false; return; } // arrive() reads R.here before its first await
    const st = stepAt();
    agent.tile = st.tile; agent.din = st.din; agent.dout = st.dout; agent.s = R.s - st.s0; agent.v = R.v; agent.curve = st.c;
    agent.off = (R.scheme ? R.lat < -LANE : R.ot && R.ot.t > 0.3) ? -LANE : LANE;
    if (R.scheme && R.lat > KERB) agent.tile = -1; // up on the sidewalk: off the road, nothing queues behind the bike
    // ---- target speed ----
    const top = R.scheme ? schemeTop(st) : R.vs.top * (R.boost ? 1.45 * R.vs.boost : 1) * (st.alley ? 0.72 : 1);
    let target = top;
    const corner = R.vs.corner * (R.boost ? 1.22 : 1) * (1 - 0.2 * (ctx.weather?.rain || 0)); // wet roads grip less
    // (late brake: the corners are the rider's; the lane run's autopilot rounds them on the line of the lane it's in)
    if (R.scheme !== 'b') for (const a of R.arcs) {
      if (a.s1 < R.s) continue;
      if (a.s0 > R.s + 80) break;
      const vt = Math.sqrt(A_LAT * corner * (R.scheme ? Math.max(1.5, a.r - a.sgn * LAT[R.lane]) : a.r));
      const d = Math.max(0, a.s0 - R.s);
      target = Math.min(target, Math.sqrt(vt * vt + 2 * B_DEC * 0.75 * d));
    }
    const toEnd = route.length - R.s;
    // (the autopilot pulls up at the door only once STOP is tapped for it — see autoStop)
    if (R.scheme === 'a' || R.scheme === 'run') target = Math.min(target, Math.sqrt(2 * B_DEC * 0.8 * Math.max(0, toEnd - 0.4)), Math.max(0, toEnd - 0.4) * 3.2);
    let blockedBy = null;
    R.blockHz = null;
    // the autopilot keeps its distance in traffic (late brake too, while in our lane); on the lane run and the courier
    // run that's the rider's
    if (R.scheme ? R.scheme === 'b' && R.lat > -LANE : !R.ot) {
      const L = leaderAhead();
      if (L.gap < 40) { const vt = stopV(L.gap - 2.4); if (vt < target) { target = vt; blockedBy = L.gap < 14 ? 'car' : null; } }
      // (on the brake people crossing, cones and crates are the rider's)
      const B = blockingHazard(R.auto ? (h) => h.type === 'ped' && !h.slow : R.scheme === 'b' ? (h) => (h.type === 'ped' && !h.slow) || h.type === 'cones' || h.type === 'crates' : null);
      if (B.h && B.d < 40) {
        const passable = B.h.type === 'cones' || B.h.type === 'crates';
        const stop = stopV(B.d);
        if (passable) { if (B.d < 3) target = Math.min(target, 2.2); else target = Math.min(target, Math.max(2.2, stop)); }
        else if (!(B.h.hopped && R.hop)) target = Math.min(target, stop);
        if (B.d < 14) blockedBy = B.h.type;
        // stuck in front of a double-parked car or road works (no hop): the autopilot squeezes past slowly once the
        // other lane is clear — it costs time, it never strands the courier
        if ((B.h.type === 'parked' || (!passable && HZ[B.h.type].block)) && B.d < 4 && R.v < 0.5) {
          if (R.scheme) { if (B.h.type !== 'ped') R.blockHz = B.h; } // (the rider swipes round it — or stuckTick does, after a while; someone crossing is waited out)
          else {
            B.h.waited = (B.h.waited || 0) + dt;
            const clear = oncoming().dist > (B.h.waited > 12 ? 16 : 30);
            if (B.h.waited > (B.h.type === 'parked' ? 4.5 : 5) && clear) { R.ot = { t: 0, dir: 1, hz: B.h, until: 0, time: 0, slow: true }; }
          }
        }
      }
    }
    // (the autopilot's own pass round a double-parked car yields to a car coming the other way: stopped face to face,
    // the bike backs into its lane — see stuckTick)
    if (R.scheme && R.autoBack && R.lat < -LANE) { const on = oncoming(); if (on.who && on.dist < 25) target = Math.min(target, stopV(on.dist - 3)); }
    R.light = nextLight(R.auto ? 6 : 3);
    // the autopilot doesn't stop for a red light, someone crossing or the door on its own: only where STOP was tapped
    if (R.auto) { const cap = autoStop(); if (cap < target) { target = cap; if (cap < 2) blockedBy = blockedBy || 'stop'; } }
    if (R.backUp) target = 0; // (backing out of a face-off in the oncoming lane: see stuckTick)
    const hold = R.wait > 0 || R.crash > 0;
    if (R.wait > 0) { R.wait -= dt; target = 0; }
    if (R.crash > 0) { R.crash -= dt; target = 0; }
    R.blockedBy = blockedBy;
    // ---- integrate ----
    const vBefore = R.v;
    const acc = R.vs.accel * (R.boost ? 1.7 : 1);
    R.slip = 0;
    if (R.scheme) schemeSpeed(dt, target, top, acc);
    else if (R.over) { R.v = Math.max(0, R.v - HARD * dt); R.brk = HARD; R.load = 0; } // (past the door: skidding to a halt)
    else autoSpeed(dt, target, top, acc);
    feel(dt, vBefore);
    const ds = R.scheme ? ctlBlock(R.v * dt) : R.v * dt;
    R.s += ds; R.meters += ds;
    if (R.v < 0.5) R.stats.stopT += dt;
    if (R.scheme) schemeTick(dt, st, ds); else { energyTick(dt); lightTick(); }
    // ---- overtake lateral motion ----
    if (R.ot) {
      const ot = R.ot;
      ot.time += dt;
      ot.t = Math.max(0, Math.min(1, ot.t + ot.dir * dt / (ot.slow ? 1.0 : 0.42)));
      // pull in to the kerb for the door, unless something parked still blocks our lane before it (then the autopilot
      // stays out until it's past)
      const passing = R.hazards.some((h) => !h.done && h.lane >= 0 && h.type !== 'ped' && HZ[h.type].block && h.s + (HZ[h.type].len || 2) / 2 + 2 > R.s && h.s - R.s < 14);
      if (ot.dir > 0 && !ot.hz && route.length - R.s < 12 && !passing) ot.dir = -1;
      if (ot.dir > 0 && ot.t >= 1) {
        let until = R.s + 2;
        if (ot.car && ot.car.tile != null) {
          const k = route.steps.findIndex((x, i) => i >= R.sampled[3] && x.tile === ot.car.tile);
          until = k >= 0 ? route.steps[k].s0 + ot.car.s + ot.car.len / 2 + 3.5 : R.s;
        }
        if (ot.hz) until = ot.hz.s + (HZ[ot.hz.type].len || 2) / 2 + 3;
        if (R.s > until || ot.time > 7) ot.dir = -1;
      }
      if (ot.dir < 0 && ot.t <= 0) {
        if (ot.clean && !ot.slow) flow('OVERTAKE!');
        R.ot = null;
      }
      // head-on check
      if (R.ot && R.ot.t > 0.5) { const on = oncoming(); if (on.dist < 1.2) { crash('Head-on! Oops.'); if (on.who) on.who.wait = 2; } }
    }
    if (!R.scheme) R.lat = R.ot ? -2 * LANE * smooth(R.ot.t) : 0;
    // running a red: cross traffic check
    if (R.runLight >= 0 && st.tile === R.runLight) {
      const list = traffic.byTile.get(st.tile) || [];
      // (once per red: after that the cross traffic there stops short of the bike until it's clear, instead of hitting
      // it again as it pulls away)
      const hit = R.tboned === st.tile;
      for (const a of list) if (a.kind === 'car' && a.v > 1 && (a.din & 1) !== (st.din & 1) && Math.hypot(a.pos[0] - R.bike.root.position.x, a.pos[1] - R.bike.root.position.z) < (hit ? 8 : 3.2)) {
        if (hit) { a.wait = Math.max(a.wait, 1); continue; }
        crash('T-boned at the junction!'); R.tboned = st.tile; a.wait = 3.5;
        break;
      }
      if (!R.lightJudged) {
        R.lightJudged = true;
        // (a red run meets a camera at the district's odds: most of Downtown's lights have one, few of Green Hills'.
        // On the autopilot, the brake and the run it's a red the rider didn't stop for)
        const cam = R.runLightState === 'r' && rng() < (DPROFILE[city.tiles[st.tile].d]?.cams ?? 0.35);
        if (R.runLightState === 'r' && (R.auto || R.scheme === 'b' || R.scheme === 'run')) redCamera(st, cam);
        else if (cam) { const fine = Math.round(3 + 4 * (DISTRICT[city.tiles[st.tile].d]?.pay || 1)); R.fines += fine; ctx.audio?.play('camera-shutter'); ctx.ui.toast(`Red-light camera! −$${fine}`, 'bad'); }
      }
    } else if (R.runLight >= 0 && route.steps[R.sampled[3]].s0 > 0 && st.tile !== R.runLight && R.lightJudged) { if (R.runLightState === 'r' && R.crash <= 0 && R.scheme === 'a') flow('RED RUNNER!'); R.runLight = -1; R.lightJudged = false; R.tboned = -1; }
    const y = hopTick(dt);
    // ---- hazards ----
    for (const h of R.hazards) {
      if (h.done) continue;
      const d = h.s - R.s;
      h.ahead = d; h.inPath = R.scheme ? laneHit(h) : h.lane >= 0;
      if (h.spin) h.spin.rotation.y += dt * 3;
      if (h.blink) { const on = (performance.now() / 400 | 0) % 2 === 0; for (const l of h.blink) l.visible = on; }
      if (h.type === 'ped') updatePed(h, d < 32 && d > 4, dt);
      if ((R.auto || R.scheme === 'b' || R.scheme === 'run') && h.type === 'ped' && !h.done && h.walking && !h.slow && !h.scared && Math.abs(d) < 1.3 && Math.abs(h.px - R.lat) < PED_W && R.crash <= 0) pedScare(h);
      const inMyLane = R.scheme ? h.inPath : h.lane === 0 || (h.lane > 0 && (!R.ot || R.ot.t < 0.5)) || (h.lane < 0 && R.ot && R.ot.t > 0.5);
      if (Math.abs(d) < 1.2) {
        const H = HZ[h.type];
        if (H.pickup) {
          if (inMyLane) {
            h.done = true; h.obj.visible = false;
            const bp = R.bike.root.position;
            if (h.type === 'cash') { const n = Math.max(1, Math.round((1 + rng() * 2) * (St.S.lvl > 4 ? 2 : 1))); R.stats.cash += n; ctx.audio?.play('pickup-bonus'); ctx.ui.toast(`+$${n}`, 'cash'); pfx.cash(bp.x, 1.2, bp.z); buzz(12); if (R.flow.n > 0) { R.flow.n += 0.5; R.flow.t = FLOW_TIME; } }
            else if (h.type === 'coin') {
              // (a line of them rings higher and higher; a coin keeps a flow streak alive)
              R.coinChain = R.rideTime - R.coinT < 1.2 ? R.coinChain + 1 : 0; R.coinT = R.rideTime;
              R.stats.cash = Math.round((R.stats.cash + COIN * (DISTRICT[city.tiles[h.tile].d]?.pay || 1)) * 100) / 100; R.stats.coins++;
              ctx.audio?.play('pickup-bonus', { vol: 0.3, rate: 1.1 + Math.min(0.9, R.coinChain * 0.12) }); buzz(5);
              if (R.flow.n > 0) R.flow.t = FLOW_TIME;
            }
            else { R.energy = Math.min(R.energyMax, R.energy + 40); ctx.audio?.play('pickup-bonus', { rate: 1.3 }); ctx.ui.toast('+Energy', 'good'); pfx.energy(bp.x, 1.2, bp.z); buzz(12); }
          }
        } else if (h.type !== 'ped' && h.type !== 'parked') {
          if (!inMyLane) { h.done = true; continue; }
          h.done = true;
          if (R.hop && h.hopped) continue;
          if (R.hop && y > 0.5) continue;
          // the brake: slow enough over it and the springs take it (braked for it: a smooth one, for the flow; the road
          // works card's barrier the autopilot waits at doesn't count)
          if ((R.scheme === 'b' || R.scheme === 'run') && R.v <= SMOOTH_V + 0.2) {
            kick(0.3); ctx.audio?.play(H.sfx || 'bump', { vol: 0.35 });
            if (h.type === 'puddle') pfx.splash(h.x, h.z, false);
            if (BUMPS.has(h.type) && R.brakeT < 3) { R.stats.smooth++; flow('SMOOTH!'); }
            continue;
          }
          // (on the run an obstacle not hopped is a stumble: the bike nearly stops and the food takes half again)
          const run = R.scheme === 'run';
          hurtFood((H.dmg || 6) * (run ? 1.5 : 1));
          R.v *= run ? (h.type === 'puddle' ? 0.6 : 0.35) : H.slow || 0.6;
          if (run && h.type !== 'puddle') R.wobble = Math.max(R.wobble || 0, 0.8);
          ctx.audio?.play(H.sfx || 'bump');
          if (h.type !== 'puddle') flowBreak();
          if (h.type === 'puddle') pfx.splash(h.x, h.z, true);
          else pfx.bump(h.x, h.z);
          if (h.type === 'cones' || h.type === 'barrier' || h.type === 'crates') { for (const c of h.obj.children) { c.rotation.z = (rng() - 0.5) * 2; c.position.x += (rng() - 0.5) * 2; } }
        }
      }
      if (d < -25) { h.done = true; freeHazard(h); }
    }
    routeTick(dt);
    // ---- pose ----
    // the path is a smooth chain of lines and circular arcs: heading is its tangent, lean follows the physics
    // of a turning bike (tan lean = v² κ / g), started a little early so the rider leans into the corner.
    const hd = R.sampled[2];
    const rx = -Math.cos(hd), rz = Math.sin(hd);
    const b = R.bike.root;
    // curvature averaged over a few metres around (and a bit ahead of) the bike: the lean rolls in and out
    // gradually instead of switching on at the start of the arc
    let kap = 0;
    const lead = Math.max(1, R.v * 0.2);
    for (const o of KAP_OFFS) { sampleRoute(route, R.s + lead + o, ahead); kap += ahead[4]; }
    kap /= KAP_OFFS.length;
    // lane changes (overtaking) turn the nose toward the new lane
    if (R.dodge && R.s > R.dodge.s1) R.dodge = null;
    R.dodgeLat = (R.dodgeLat || 0) + ((R.dodge ? R.dodge.lat : 0) - (R.dodgeLat || 0)) * Math.min(1, dt * 3.5);
    const latT = R.lat + R.dodgeLat;
    const dLat = latT - (R.prevLat ?? latT); R.prevLat = latT;
    // (a quick swipe across at low speed would swing the nose right round: lanes & brake keeps it to a swerve)
    const yawT = ds > 1e-4 ? THREE.MathUtils.clamp(-Math.atan2(dLat, ds), R.scheme ? -0.5 : -9, R.scheme ? 0.5 : 9) : 0;
    R.yawOff += (yawT - R.yawOff) * Math.min(1, dt * 10);
    let px = R.sampled[0] + rx * latT, pz = R.sampled[1] + rz * latT, ph = hd + R.yawOff;
    // past the door (a late brake overshoot): on along the last heading
    if (R.s > route.length) { const e = R.s - route.length; px += Math.sin(hd) * e; pz += Math.cos(hd) * e; }
    if (R.blend && R.blend.t > 0) {
      R.blend.t = Math.max(0, R.blend.t - dt / 0.8);
      const e = smooth(R.blend.t);
      px += R.blend.dx * e; pz += R.blend.dz * e; ph += R.blend.dh * e;
    }
    // (up the kerb, the sidewalk is a step higher)
    const walk = R.scheme ? THREE.MathUtils.clamp((R.lat - KERB) / 0.5 + 0.5, 0, 1) * (GROUND.walk - GROUND.asphalt) : 0;
    b.position.set(px, y + ROAD_Y + walk, pz);
    b.rotation.y = ph;
    const leanAngle = Math.atan(R.v * R.v * kap / 9.81) * 0.85 - R.yawOff * 1.4;
    R.lean = -THREE.MathUtils.clamp(leanAngle, -0.5, 0.5);
    R.steer = THREE.MathUtils.clamp(-Math.atan(1.4 * kap) * 1.3 + R.yawOff * 1.2, -0.45, 0.45);
    R.kap = R.sampled[4];
    poseTick(dt, ds, (vBefore - R.v) / Math.max(dt, 1e-4));
    // ---- arrival ----
    if (R.scheme === 'b') doorTick(dt);
    else if (R.auto) autoDoor(dt);
    else if (toEnd < 0.6 && R.v < 0.6 && R.crash <= 0 && !R.eventCam && !R.hop) arrive();
  }
  // ---- shared by both ways of riding ----
  // what the body, camera and engine feel: acceleration smoothed over a few frames
  function feel(dt, vBefore) {
    const aNow = THREE.MathUtils.clamp((R.v - vBefore) / Math.max(dt, 1e-4), -14, 9);
    R.accS += (aNow - R.accS) * Math.min(1, dt * 7);
    if (!R.hardBrake && R.accS < -8 && R.v > 4) { R.hardBrake = true; ctx.audio?.play('brake', { vol: 0.55, rate: 0.95 + Math.random() * 0.1 }); buzz(22); }
    else if (R.hardBrake && R.accS > -3) R.hardBrake = false;
  }
  function energyTick(dt) {
    if (R.boost) { R.stats.boostT += dt; R.energy -= 26 / R.fx.boostDur * dt; if (R.energy <= 0) { R.energy = 0; R.boost = false; } }
    else R.energy = Math.min(R.energyMax, R.energy + 5.5 * R.fx.regen * dt);
  }
  // the hop's arc (m above the road) and its landing
  function hopTick(dt) {
    if (!R.hop) return 0;
    R.hop.t += dt;
    const f = R.hop.t / R.hop.T;
    if (f < 1) return 4 * 1.05 * f * (1 - f);
    if (!R.hop.perfect && R.orders.some((x) => x.picked && !x.done)) hurtFood(2.5 * R.vs.land);
    ctx.audio?.play('land'); kick(R.hop.perfect ? 0.6 : 1); buzz(15);
    const p = R.bike.root.position; pfx.hopLand(p.x, p.z, R.hop.perfect);
    if (R.hop.perfect) flow('PERFECT HOP!');
    R.hop = null;
    return 0;
  }
  // the GPS line, the coach, a shortcut on offer, an event coming up
  function routeTick(dt) {
    if (ribbon) ribbon.userData.setWindow(R.s + 2.5, R.s + 55, 52);
    coach(dt);
    if (!R.offerT || performance.now() - R.offerT > 400) { R.offerT = performance.now(); R.offer = shortcutOffer(); }
    if (R.event && !R.event.fired && R.s > R.event.s && R.crash <= 0) runEvent(R.event.ev);
  }
  function poseTick(dt, ds, decel) {
    const b = R.bike.root;
    if (R.crash > 0) { b.rotation.z = Math.sin(R.crash * 20) * 0.1 * R.crash; }
    else if (R.wobble > 0) { R.wobble -= dt; b.rotation.z = Math.sin(R.rideTime * 26) * 0.07 * Math.min(1, R.wobble); }
    else b.rotation.z = 0;
    emit(dt, ds, decel);
    nearMisses(dt);
    // (the streak holds while the bike waits where STOP was tapped, or stands on the brake: a red light is nobody's fault)
    if (R.flow.n > 0 && !(R.auto && R.stops.some((x) => x.halted)) && !(R.scheme === 'b' && R.v < 0.3)) { R.flow.t -= dt; if (R.flow.t <= 0) { R.flow.n = 0; R.flow.mult = 1; } }
    if (R.bike.pose) R.bike.pose.tuck = R.boost ? 1 : 0;
    if (R.slowmo > 0) { R.slowmo -= dt / Math.max(0.05, R.timeScale); if (R.slowmo <= 0 && !document.querySelector('.evdock')) R.timeScale = 1; }
  }
  // braking target that eases the last metre in instead of planting the bike on the line
  const stopV = (d) => (d <= 0 ? 0 : Math.min(Math.sqrt(2 * B_DEC * d), d * 3.2));
  // the autopilot rides like a person: strong off the line and easing into its cruising speed, brakes that bite in
  // over a few tenths (at once when it's urgent)
  function autoSpeed(dt, target, top, acc) {
    const gap = target - R.v;
    if (gap > 0.02) {
      // same average pull as a flat ramp, front-loaded: 1.3× off the line, 0.8× near the top; eases into the cruise
      const a = acc * (1.3 - 0.5 * Math.min(1, R.v / Math.max(1, top)) ** 2) * Math.min(1, 0.3 + gap / 1.1);
      R.v = Math.min(target, R.v + a * dt);
      R.brk = Math.max(0, R.brk - 40 * dt);
      R.load += ((gap > 0.4 ? 1 : 0.5) - R.load) * Math.min(1, dt * 8);
    } else if (gap > -0.05) {
      R.v = Math.max(0, target); R.brk = Math.max(0, R.brk - 40 * dt);
      R.load += ((R.v > 0.5 ? 0.45 : 0) - R.load) * Math.min(1, dt * 6);
    } else {
      R.brk = Math.min(11, R.brk + (gap < -2 ? 70 : 26) * dt);
      R.v = Math.max(target, R.v - Math.max(R.brk, gap < -2.5 ? 11 : 1.5) * dt);
      R.load += (0 - R.load) * Math.min(1, dt * 10);
    }
  }
  // ======================================================================================================
  // Free riding (desktop): the rider steers anywhere the city lets a scooter go; the route is only the GPS
  // ======================================================================================================
  // F: where the bike is and how it moves. h = where it points, fv = speed along it (negative = reversing),
  // beta = slide angle (the way it actually travels is h − beta), steer = handlebar angle, yawV = how fast the
  // direction of travel turns (what the rider leans against)
  const F = { x: 0, z: 0, h: 0, fv: 0, beta: 0, steer: 0, yawV: 0, demand: 0, y: ROAD_Y, surf: 'asphalt', tile: -1, revT: 0, load: 0,
    offT: 0, wrongT: 0, gpsT: 0, ringIn: false, told: false, slide: false, slideCd: 0, curbCd: 0, bumpCd: 0, skid: 0, alley: null, hit: null };
  const WB = 1.3, BIKE_R = 0.42, BIKE_HALF = 0.6; // wheelbase; the bike's two collision circles, ahead of and behind its middle
  const blocker = { x: 0, z: 0, r: 0.7 }; // where traffic sees the bike
  const contacts = [], pj = [0, 0, 0, 0, 0];
  const toward = (v, t, d) => (v < t ? Math.min(t, v + d) : Math.max(t, v - d));
  const wrap = (a) => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };
  // the compass direction nearest a heading (0 = +Z south, π/2 = +X east)
  const cardinal = (h) => [2, 1, 0, 3][(((Math.round(h / (Math.PI / 2))) % 4) + 4) % 4];
  function initFree() {
    const b = R.bike.root;
    Object.assign(F, { x: b.position.x, z: b.position.z, h: b.rotation.y, fv: 0, beta: 0, steer: 0, yawV: 0, y: b.position.y, revT: 0, load: 0, offT: 0, wrongT: 0, gpsT: 0, slide: false, curbCd: 0, bumpCd: 0, alley: null, hit: null });
    F.surf = world.surface(F.x, F.z); F.tile = world.tileAt(F.x, F.z)?.i ?? -1;
    ringMk.scale.setScalar(1); // (late brake shrinks it onto the lane)
    agent.tile = -1; // traffic finds the bike through its blockers, not the road graph
    blocker.x = F.x; blocker.z = F.z; blocker.pad = 0;
    if (!traffic.blockers.includes(blocker)) traffic.blockers.push(blocker);
    for (const a of traffic.agents) a.passT = 0;
  }
  function leaveFree() {
    const i = traffic.blockers.indexOf(blocker); if (i >= 0) traffic.blockers.splice(i, 1);
    ringMk.visible = false;
    R.ctl.left = R.ctl.right = false;
  }
  // the stop at the door: a ring on the street in front of the building, over both lanes and the sidewalk
  const RING_R = 4.6;
  function legRing(leg) {
    const lot = city.lots[leg.lot], t = city.tiles[lot.door], f = DIRS[lot.front];
    return { x: t.x * TILE - f[0] * 2.2, z: t.z * TILE - f[1] * 2.2 };
  }
  const ringMk = (() => {
    const g = new THREE.Group();
    const rg = new THREE.RingGeometry(RING_R - 0.4, RING_R, 56); rg.rotateX(-Math.PI / 2);
    const mat = new THREE.MeshBasicMaterial({ color: 0xffb238, transparent: true, opacity: 0.8, depthWrite: false, toneMapped: false });
    const ring = new THREE.Mesh(rg, mat); ring.position.y = 0.23; ring.renderOrder = 2;
    // a soft wall of light rising from the ring, fading upward
    const cv = document.createElement('canvas'); cv.width = 4; cv.height = 64;
    const c2 = cv.getContext('2d'), gr = c2.createLinearGradient(0, 0, 0, 64);
    gr.addColorStop(0, '#000'); gr.addColorStop(1, '#fff'); c2.fillStyle = gr; c2.fillRect(0, 0, 4, 64);
    const wmat = new THREE.MeshBasicMaterial({ color: 0xffb238, alphaMap: new THREE.CanvasTexture(cv), transparent: true, opacity: 0.4, depthWrite: false, side: THREE.DoubleSide, toneMapped: false, blending: THREE.AdditiveBlending });
    const wall = new THREE.Mesh(new THREE.CylinderGeometry(RING_R, RING_R, 2.4, 56, 1, true), wmat); wall.position.y = 1.4;
    g.add(ring, wall); g.visible = false; g.userData = { mat, wmat };
    return g;
  })();

  function freeDrive(dt) {
    if (R.here) { R.v = 0; F.fv = 0; arrive(); R.here = false; return; } // arrive() reads R.here before its first await
    // something else changed the speed (a crash, a pothole, the scene at the door): carry it into the bike's motion
    if (Math.abs(Math.abs(F.fv) - R.v) > 1e-6) F.fv = (F.fv < 0 ? -1 : 1) * R.v;
    const hold = R.wait > 0 || R.crash > 0;
    if (R.wait > 0) R.wait -= dt;
    if (R.crash > 0) R.crash -= dt;
    const vBefore = R.v, px = F.x, pz = F.z;
    // ---- physics, in sub-steps short enough that a lamp post can't be skipped ----
    F.hit = null;
    const n = Math.min(8, Math.max(1, Math.ceil(Math.abs(F.fv) * dt / 0.35)));
    for (let i = 0; i < n; i++) freeStep(dt / n, hold);
    if (F.hit) impact(F.hit);
    R.v = Math.abs(F.fv);
    R.load += (F.load - R.load) * Math.min(1, dt * 10);
    feel(dt, vBefore);
    const ds = Math.hypot(F.x - px, F.z - pz);
    R.meters += ds;
    if (R.v < 0.5) R.stats.stopT += dt;
    energyTick(dt);
    blocker.x = F.x; blocker.z = F.z;
    // ---- the street under the wheels, the tile we're on, the GPS ----
    groundTick(dt);
    gpsTick(dt);
    R.light = nextLight();
    const y = hopTick(dt);
    freeHazards(dt, y, px, pz);
    passes();
    routeTick(dt);
    // ---- pose: heading is where the bike points; lean follows the turn it's actually making (tan lean = a / g) ----
    const b = R.bike.root;
    b.position.set(F.x, F.y + y, F.z);
    b.rotation.y = F.h;
    R.lean = THREE.MathUtils.clamp(Math.atan(F.fv * F.yawV / 9.81) * 0.85, -0.5, 0.5);
    const inp = (R.ctl.left ? 1 : 0) - (R.ctl.right ? 1 : 0);
    R.steer = THREE.MathUtils.clamp(F.steer + (R.v < 2 ? inp * 0.35 * (1 - R.v / 2) : 0), -0.45, 0.45);
    R.kap = -F.yawV / Math.max(0.5, R.v);
    slideTick(dt, ds);
    poseTick(dt, ds, (vBefore - R.v) / Math.max(dt, 1e-4));
    // ---- the door: stop inside the ring ----
    const rd = Math.hypot(F.x - R.ring.x, F.z - R.ring.z), inR = rd < RING_R;
    if (inR && !F.ringIn && !F.told && R.v > 3) { F.told = true; ctx.ui.toast(R.job.legs[R.leg].kind === 'pickup' ? 'Stop here to pick up' : 'Stop here to deliver', ''); }
    F.ringIn = inR;
    ringMk.visible = true; ringMk.position.set(R.ring.x, 0, R.ring.z);
    if (inR && R.v < 0.8 && !R.ctl.gas && R.crash <= 0 && !R.eventCam && !R.hop) arrive();
  }

  function freeStep(dt, hold) {
    const c = R.ctl, vs = R.vs, grass = F.surf === 'grass';
    const top = vs.top * (R.boost ? 1.45 * vs.boost : 1) * (grass ? 0.6 : 1);
    const acc = vs.accel * (R.boost ? 1.7 : 1);
    let fv = F.fv;
    // ---- pedals: gas, brake, and (still holding the brake once stopped) reverse ----
    F.load = 0;
    if (hold) fv = toward(fv, 0, 14 * dt);
    else if (c.brake && fv > 0.3) { fv = toward(fv, 0, 9.5 * dt); F.revT = 0; }
    else if (c.brake) { F.revT += dt; if (F.revT > 0.3) { fv = Math.max(-2.8, fv - 2.6 * dt); F.load = 0.45; } else fv = toward(fv, 0, 9.5 * dt); }
    else if ((c.gas || R.boost) && fv < -0.2) fv = toward(fv, 0, 9.5 * dt);
    else if (c.gas || R.boost) { fv = fv < top ? Math.min(top, fv + acc * (1 - 0.5 * (Math.max(0, fv) / top) ** 2) * dt) : Math.max(top, fv - 3 * dt); F.load = 1; }
    else { fv = toward(fv, 0, (0.8 + 0.01 * fv * fv + (grass ? 2.2 : 0)) * dt); F.load = 0.12; }
    if (!c.brake) F.revT = 0;
    // inside the door's ring with the gas off, the bike pulls up by itself
    if (F.ringIn && !c.gas && !R.boost && fv > 0) fv = toward(fv, 0, 6 * dt);
    // ---- steering: full lock gets smaller with speed, so the tightest turn at any speed sits just past the grip ----
    const inp = hold && R.crash > 0 ? 0 : (c.left ? 1 : 0) - (c.right ? 1 : 0);
    const v = Math.abs(fv);
    const grip = 11 * vs.corner * (R.boost ? 1.22 : 1) * (1 - 0.2 * (ctx.weather?.rain || 0)) * (grass ? 0.7 : 1);
    const lock = Math.min(0.6, Math.atan(1.15 * grip * WB / Math.max(1, v * v)));
    F.steer = toward(F.steer, inp * lock, (inp ? 3.2 : 5.5) * dt);
    let yaw = fv * Math.tan(F.steer) / WB;
    // at walking pace the rider just turns the bike round with their feet (backing up, the nose swings the other way)
    if (v < 2) { const k = v / 2; yaw = yaw * k + inp * 1.3 * (1 - k) * (fv < -0.05 ? -1 : 1); }
    F.demand = Math.abs(fv * yaw) / grip;
    // ---- grip: the tyres turn the bike's travel only as hard as they hold; beyond that it slides ----
    const b0 = F.beta;
    if (fv > 2) {
      const maxYv = grip / fv;
      const yawV = THREE.MathUtils.clamp(yaw + F.beta * 5, -maxYv, maxYv);
      let beta = F.beta + (yaw - yawV) * dt;
      if (Math.abs(beta) > 0.6) { const lim = Math.sign(beta) * 0.6; yaw -= (beta - lim) / dt; beta = lim; }
      F.beta = beta;
      fv = Math.max(0, fv - Math.abs(beta) * 7 * dt); // a sliding tyre scrubs speed
    } else F.beta = toward(F.beta, 0, 2.5 * dt);
    F.yawV = yaw - (F.beta - b0) / dt;
    F.h = wrap(F.h + yaw * dt);
    const th = F.h - F.beta;
    F.x += fv * Math.sin(th) * dt; F.z += fv * Math.cos(th) * dt;
    F.fv = fv;
    collideBike();
  }

  // ---- what the bike runs into: buildings, street furniture, cars, people; push out, lose the speed going into it ----
  const CRASH_AT = { wall: 7, pole: 6.5, small: 6, person: 2.4, car: 4.5, parked: 4.5, oncoming: 3 };
  function contact(h, ovx, ovz, info) {
    F.x += h.nx * h.depth; F.z += h.nz * h.depth;
    const th = F.h - F.beta;
    let vx = F.fv * Math.sin(th), vz = F.fv * Math.cos(th);
    const rel = (vx - ovx) * h.nx + (vz - ovz) * h.nz; // < 0: closing on it
    if (rel >= 0) return;
    vx -= rel * h.nx; vz -= rel * h.nz;
    // what's left of the motion, along the way the bike points (the tyres don't roll sideways)
    F.fv = vx * Math.sin(F.h) + vz * Math.cos(F.h);
    F.beta *= 0.5;
    if (!F.hit || -rel > F.hit.imp) F.hit = { imp: -rel, kind: info.kind, what: info.what, car: info.car || null, by: info.by || false };
  }
  const hz2 = { kind: 'parked' }, carInfo = { kind: 'car' };
  const pedInfo = { kind: 'person', what: 'ped' }, walkerInfo = { kind: 'person', what: 'walker' }, round = { nx: 0, nz: 0, depth: 0 };
  // a round obstacle (a person) against the circle at cx, cz
  function person(cx, cz, x, z, r, info) {
    const dx = cx - x, dz = cz - z, d = Math.hypot(dx, dz);
    if (d >= BIKE_R + r || d < 1e-4) return;
    round.nx = dx / d; round.nz = dz / d; round.depth = BIKE_R + r - d;
    contact(round, 0, 0, info);
  }
  function collideBike() {
    const fx = Math.sin(F.h), fz = Math.cos(F.h);
    let cx = 0, cz = 0;
    for (let it = 0; it < 2; it++) for (const o of [BIKE_HALF, -BIKE_HALF]) {
      const at = () => { cx = F.x + fx * o; cz = F.z + fz * o; }; // every push moves the bike: measure again
      at();
      for (const h of world.hits(cx, cz, BIKE_R, contacts)) { contact(h, 0, 0, h); at(); }
      // traffic: cars and the fleet's couriers
      for (const a of traffic.agents) {
        if (a === agent || (a.kind !== 'car' && a.kind !== 'rider')) continue;
        const dx = a.pos[0] - cx, dz = a.pos[1] - cz;
        if (dx * dx + dz * dz > 36) continue;
        const ah = a.pos[2], h = boxHit(cx, cz, BIKE_R, a.pos[0], a.pos[1], a.kind === 'rider' ? 0.4 : 0.95, a.len / 2, Math.cos(ah), Math.sin(ah));
        if (!h) continue;
        const ovx = Math.sin(ah) * a.v, ovz = Math.cos(ah) * a.v;
        carInfo.car = a; carInfo.by = ovx * h.nx + ovz * h.nz > 2; carInfo.what = a.kind;
        contact(h, ovx, ovz, carInfo); at();
      }
      // double-parked cars, an event's parked car, someone crossing, people walking the sidewalks
      for (const z of R.hazards) {
        if (z.type === 'parked') { const h = boxHit(cx, cz, BIKE_R, z.x, z.z, 0.95, 2.2, Math.cos(z.hd), Math.sin(z.hd)); if (h) { contact(h, 0, 0, hz2); at(); } }
        else if (z.type === 'ped' && z.ped && !z.done) { const p = z.obj.position; person(cx, cz, p.x, p.z, 0.38, pedInfo); at(); }
      }
      for (const a of actors) if (a.solid) { const S = a.solid, h = boxHit(cx, cz, BIKE_R, S.x, S.z, S.hx, S.hz, S.c, S.s); if (h) { contact(h, 0, 0, hz2); at(); } }
      for (const p of ctx.peds?.peds || []) {
        const q = p.c.obj.position;
        if (Math.abs(cx - q.x) > 1 || Math.abs(cz - q.z) > 1) continue;
        person(cx, cz, q.x, q.z, 0.32, walkerInfo); at();
      }
    }
  }
  function impact(h) {
    if (R.crash > 0) return;
    if (h.imp > CRASH_AT[h.kind]) {
      const why = h.kind === 'person' ? 'Watch out for pedestrians!' : h.kind === 'car' ? (h.by ? 'Hit by a car!' : 'Crashed into a car!')
        : h.kind === 'parked' ? 'Hit a parked car!' : h.kind === 'pole' ? (/tree|palm/.test(h.what) ? 'Hit a tree!' : 'Hit a pole!') : h.kind === 'small' ? 'Wiped out on the sidewalk!' : 'Hit a wall!';
      crash(why);
      if (h.car) h.car.wait = 2;
    } else if (h.imp > 2.2 && F.bumpCd <= 0) {
      F.bumpCd = 0.4;
      hurtFood(Math.min(8, h.imp * 0.9));
      ctx.audio?.play('bump', { vol: Math.min(1, h.imp / 6) });
      pfx.bump(F.x + Math.sin(F.h) * 0.9, F.z + Math.cos(F.h) * 0.9);
      if (h.imp > 4) flowBreak();
    }
  }

  // ---- kerbs, grass, red lights, alleys ----
  function groundTick(dt) {
    const s = world.surface(F.x, F.z);
    F.curbCd -= dt; F.bumpCd -= dt;
    if (s !== F.surf) {
      // up or down a kerb: a jolt through the springs, and a knock to the food if taken fast
      if (Math.abs(GROUND[s] - GROUND[F.surf]) > 0.05 && R.v > 2.5 && F.curbCd <= 0 && !R.hop) {
        F.curbCd = 0.3; kick(Math.min(1, 0.25 + R.v / 16));
        if (R.v > 7) hurtFood(1 + R.v * 0.15); else ctx.audio?.play('bump', { vol: 0.3 });
      }
      F.surf = s;
    }
    F.y += (GROUND[s] - F.y) * Math.min(1, dt * 18);
    // grass shakes the bike about
    if (s === 'grass' && R.v > 3 && Math.random() < dt * R.v * 0.4) R.bike.bump?.(0.15 + Math.random() * 0.2);
    const t = world.tileAt(F.x, F.z), ti = t ? t.i : -1;
    if (ti !== F.tile) { onTile(F.tile, ti); F.tile = ti; }
  }
  function onTile(prev, next) {
    const t = next >= 0 ? city.tiles[next] : null;
    // out of a junction we ran on red, still in one piece
    if (R.runLight >= 0 && prev === R.runLight) { if (R.runLightState === 'r' && R.crash <= 0) flow('RED RUNNER!'); R.runLight = -1; }
    // into a junction whose light is red for the way we came in
    if (t && t.k === K.ROAD && traffic.lightAt.has(next) && R.v > 1.5) {
      let din = prev >= 0 ? dirBetween(city, prev, next) : -1;
      if (din < 0) din = cardinal(F.h);
      if (traffic.light(next, din) === 'r') {
        R.runLight = next; R.runLightState = 'r';
        ctx.ui.toast('Running the red!', 'warn');
        if (rng() < 0.22) { const fine = Math.round(3 + 4 * (DISTRICT[t.d]?.pay || 1)); R.fines += fine; ctx.audio?.play('camera-shutter'); ctx.ui.toast(`Red-light camera! −$${fine}`, 'bad'); }
      }
    }
    // through an alley from one street to the next: that's a shortcut
    const pt = prev >= 0 ? city.tiles[prev] : null;
    if (t && t.k === K.ALLEY && pt && pt.k === K.ROAD) F.alley = { sc: t.sc, from: prev };
    else if (t && t.k === K.ROAD && F.alley) {
      const sc = city.shortcuts[F.alley.sc];
      if (pt && pt.k === K.ALLEY && sc.ends.includes(next) && next !== F.alley.from && R.crash <= 0) { R.stats.shortcuts++; St.goalProgress('shortcut'); flow('SHORTCUT!'); }
      F.alley = null;
    }
  }

  // ---- GPS: the route is re-planned from wherever the rider takes the bike ----
  // the closest point of the route near where the bike was last found
  function project(span = 30) {
    const route = R.route, L = route.length;
    let best = R.s, bd = Infinity;
    const s0 = Math.max(0, R.s - 12), s1 = Math.min(L, R.s + span);
    const test = (s) => { sampleRoute(route, s, pj); const d = (pj[0] - F.x) ** 2 + (pj[1] - F.z) ** 2; if (d < bd) { bd = d; best = s; } };
    for (let s = s0; s < s1; s += 1) test(s);
    test(s1);
    const c = best;
    for (let s = Math.max(0, c - 1); s <= Math.min(L, c + 1); s += 0.1) test(s);
    R.s = best;
    sampleRoute(route, R.s, R.sampled);
    return Math.sqrt(bd);
  }
  function gpsTick(dt) {
    const off = project();
    // well off the line, or riding against it for a while: the rider wants another way, so the GPS finds one
    F.offT = off > 6.5 ? F.offT + dt : 0;
    F.wrongT = Math.cos(F.h - R.sampled[2]) < -0.3 && F.fv > 1.5 ? F.wrongT + dt : 0;
    F.gpsT -= dt;
    if ((F.offT > 0.35 || F.wrongT > 1) && F.gpsT <= 0) regps();
  }
  function regps() {
    F.gpsT = 1.2; F.offT = F.wrongT = 0;
    const to = legTarget(R.job.legs[R.leg]);
    const from = world.routeTile(F.x, F.z);
    if (from < 0 || from === to) return;
    const d = cardinal(F.h);
    const path = findPath(city, from, to, { noBack: OPP(d) }) || findPath(city, from, to);
    if (!path || path.length < 2) return;
    adoptRoute(buildRoute(city, path, { startDir: d }));
    R.stats.reroutes++;
  }
  // a new GPS route: hazards already in the street stay where they are, a few more get planned down the new way
  function adoptRoute(route) {
    R.route = route; R.arcs = routeArcs(route); R.s = 0; R.sampled[3] = 0;
    project(40);
    if (R.hazards.filter((h) => !h.done).length < 8) {
      for (const h of planHazards(route, city, rng, { startS: R.s + 30 })) {
        if (h.s < R.s + 35) continue;
        h.obj = makeHazardMesh(h); placeHazard(h);
        if (R.hazards.some((o) => Math.hypot(o.x - h.x, o.z - h.z) < 18)) { freeHazard(h); continue; }
        scene.add(h.obj); R.hazards.push(h);
      }
    }
    moveEvent();
    setRibbon();
    ctx.ui.routeChanged(R);
  }

  // ---- hazards are things in the street: ride into them, round them, or hop them ----
  // [half-width across the road, half-length along it, ellipse?] around each hazard's middle
  const HZ_SHAPE = { pothole: [1.05, 0.72, true], puddle: [1.75, 1.1, true], cones: [1.3, 0.55], barrier: [1.6, 0.5], crates: [0.95, 0.6], cash: [1.2, 1.2, true], energy: [1.2, 1.2, true], coin: [0.9, 0.6, true] };
  function freeHazards(dt, y, px, pz) {
    const fx = Math.sin(F.h), fz = Math.cos(F.h), air = y > 0.3;
    for (let i = R.hazards.length - 1; i >= 0; i--) {
      const h = R.hazards[i];
      const dx = h.x - F.x, dz = h.z - F.z, dist = Math.hypot(dx, dz);
      if (dist > 110) { freeHazard(h); R.hazards.splice(i, 1); continue; }
      if (h.done) continue;
      h.ahead = dx * fx + dz * fz;
      h.inPath = Math.abs(dx * fz - dz * fx) < (h.type === 'ped' ? 6 : 2);
      if (h.spin) h.spin.rotation.y += dt * 3;
      if (h.blink) { const on = (performance.now() / 400 | 0) % 2 === 0; for (const l of h.blink) l.visible = on; }
      if (h.type === 'ped') { updatePed(h, dist < 30 && h.ahead > 3, dt); continue; }
      const S = HZ_SHAPE[h.type]; if (!S) continue;
      // the nearest the bike came to it this frame, in the hazard's own frame
      const sx = F.x - px, sz = F.z - pz, sl = sx * sx + sz * sz;
      const k = sl > 1e-6 ? Math.max(0, Math.min(1, ((h.x - px) * sx + (h.z - pz) * sz) / sl)) : 1;
      const qx = px + sx * k - h.x, qz = pz + sz * k - h.z, c = Math.cos(h.hd), s = Math.sin(h.hd);
      const lx = qx * c - qz * s, lz = qx * s + qz * c;
      const hit = S[2] ? (lx / (S[0] + 0.3)) ** 2 + (lz / (S[1] + 0.3)) ** 2 < 1 : Math.abs(lx) < S[0] + 0.35 && Math.abs(lz) < S[1] + 0.35;
      if (!hit) continue;
      const H = HZ[h.type];
      h.done = true;
      if (H.pickup) {
        h.obj.visible = false;
        if (h.type === 'cash') { const n = Math.max(1, Math.round((1 + rng() * 2) * (St.S.lvl > 4 ? 2 : 1))); R.stats.cash += n; ctx.audio?.play('pickup-bonus'); ctx.ui.toast(`+$${n}`, 'cash'); pfx.cash(F.x, 1.2, F.z); buzz(12); if (R.flow.n > 0) { R.flow.n += 0.5; R.flow.t = FLOW_TIME; } }
        else { R.energy = Math.min(R.energyMax, R.energy + 40); ctx.audio?.play('pickup-bonus', { rate: 1.3 }); ctx.ui.toast('+Energy', 'good'); pfx.energy(F.x, 1.2, F.z); buzz(12); }
        continue;
      }
      if (air) continue; // cleared it
      hurtFood(H.dmg || 6);
      R.v *= H.slow || 0.7;
      ctx.audio?.play(H.sfx || 'bump');
      if (h.type !== 'puddle') flowBreak();
      if (h.type === 'puddle') pfx.splash(h.x, h.z, true);
      else pfx.bump(h.x, h.z);
      if (h.type === 'cones' || h.type === 'barrier' || h.type === 'crates') { for (const o of h.obj.children) { o.rotation.z = (rng() - 0.5) * 2; o.position.x += (rng() - 0.5) * 2; } }
    }
  }
  // overtaking: a car going our way that was ahead of us is now behind, and we got past in one piece (riding freely,
  // and on lanes & brake)
  function passes() {
    const b = R.bike.root.position, h = R.bike.root.rotation.y, fx = Math.sin(h), fz = Math.cos(h), now = R.rideTime;
    for (const a of traffic.agents) {
      if (a.kind !== 'car' && a.kind !== 'rider') continue;
      const dx = a.pos[0] - b.x, dz = a.pos[1] - b.z;
      if (dx * dx + dz * dz > 400 || Math.cos(a.pos[2] - h) < 0.8 || Math.abs(dx * fz - dz * fx) > 5.5) { a.passT = 0; continue; }
      const lon = dx * fx + dz * fz;
      if (lon > a.len / 2 + 1) a.passT = now;
      else if (a.passT && lon < -(a.len / 2 + 1.5)) {
        if (now - a.passT < 8 && R.crash <= 0 && R.v > a.v + 0.5) { flow('OVERTAKE!'); R.stats.overtakes++; St.goalProgress('overtake'); R.bike?.lookBack?.(); }
        a.passT = 0;
      }
    }
  }
  // sliding: rubber on the road, a squeal, and the food sloshing about
  function slideTick(dt, ds) {
    const sb = Math.abs(F.beta);
    R.slip = Math.max(F.demand, sb > 0.05 ? 1.03 + sb : 0);
    R.cornerWarn = sb > 0.15;
    F.slideCd -= dt;
    if (!F.slide && sb > 0.2 && R.v > 4) {
      F.slide = true; R.stats.skids++;
      ctx.audio?.play('skid', { vol: 0.5 });
      if (sb > 0.3 && F.slideCd <= 0) { F.slideCd = 5; flowBreak(); ctx.ui.toast('Sliding! Ease off before corners', 'warn'); }
    } else if (F.slide && sb < 0.1) F.slide = false;
    if (sb > 0.1 && R.v > 3) {
      for (const x of R.orders) if (x.picked && !x.done) x.integrity = Math.max(foodFloor(), x.integrity - sb * R.v * 0.12 * dt * x.o.fragile * R.vs.bump);
      F.skid += ds;
      if (F.skid > 0.3) { F.skid = 0; pfx.skidMark(F.x - Math.sin(F.h) * 0.66, F.z - Math.cos(F.h) * 0.66, F.h - F.beta * 0.5); }
    }
  }
  // the nearest car in front of the bike, in its way (m, bumper to bumper)
  function carAhead(range) {
    const fx = Math.sin(F.h), fz = Math.cos(F.h);
    let gap = Infinity, who = null;
    for (const a of traffic.agents) {
      if (a.kind !== 'car' && a.kind !== 'rider') continue;
      const dx = a.pos[0] - F.x, dz = a.pos[1] - F.z, lon = dx * fx + dz * fz;
      if (lon < 0 || lon > range + a.len || Math.abs(dx * fz - dz * fx) > 1.8) continue;
      const g = lon - a.len / 2 - 1; if (g < gap) { gap = g; who = a; }
    }
    return { gap, who };
  }
  // close calls: a car slides past within a lane's width while we're moving fast
  function nearMisses() {
    if (R.crash > 0 || R.v < 6) return;
    const b = R.bike.root.position, hd = R.bike.root.rotation.y, fx = Math.sin(hd), fz = Math.cos(hd), now = R.rideTime;
    for (const a of traffic.agents) {
      if (a.kind !== 'car' && a.kind !== 'rider') continue;
      const rx = a.pos[0] - b.x, rz = a.pos[1] - b.z;
      if (rx * rx + rz * rz > 16) continue;
      const lon = rx * fx + rz * fz, lat = Math.abs(rx * fz - rz * fx);
      const ahd = a.pos[2], rel = Math.hypot(Math.sin(ahd) * a.v - fx * R.v, Math.cos(ahd) * a.v - fz * R.v);
      if (Math.abs(lon) < 1.8 && lat < 2.5 && lat > 0.9 && rel > 5 && !(a.nm > now - 4)) {
        a.nm = now; R.stats.nearMisses++;
        flow('CLOSE CALL!', 2);
        pfx.whoosh(b.x, b.z, fx, fz, (rx * fz - rz * fx) > 0 ? 1 : -1);
        if (R.timeScale === 1) { R.timeScale = 0.35; R.slowmo = 0.35; }
      }
    }
  }
  // exhaust smoke / turbo flame / skid marks / rain spray
  let smokeT = 0, skidAcc = 0, sprayT = 0, turboT = 0, stallT = 0;
  function emit(dt, ds, decel) {
    const b = R.bike.root, hd = b.rotation.y, fx = Math.sin(hd), fz = Math.cos(hd);
    const electric = R.vs.v.engine === 'engine-electric', junk = St.S.active === 'rustbucket';
    if (R.bike.exhaust) R.bike.exhaust.getWorldPosition(wp); else wp.set(b.position.x - fx * 0.9, 0.45, b.position.z - fz * 0.9);
    if (!electric) {
      smokeT -= dt;
      if (smokeT <= 0) {
        smokeT = (junk ? 0.085 : 0.13) / (0.7 + R.v / 12 + (R.boost ? 0.8 : 0));
        pfx.exhaust(wp.x, wp.y, wp.z, fx, fz, { dirty: junk, speed: R.v, boost: R.boost });
      }
    }
    if (R.stall) { stallT -= dt; if (stallT <= 0) { stallT = 0.07; pfx.stall(wp.x, wp.y, wp.z); } }
    if (R.boost) { turboT -= dt; while (turboT <= 0) { turboT += 1 / 45; pfx.turbo(wp.x, wp.y, wp.z, fx, fz, R.v, electric); } }
    // rubber on the road: hard braking, or turbo through a corner
    if ((decel > 8.5 && R.v > 2) || (R.boost && Math.abs(R.kap) > 0.06 && R.v > 9)) {
      skidAcc += ds;
      if (skidAcc > 0.32) { skidAcc = 0; pfx.skidMark(b.position.x - fx * 0.66, b.position.z - fz * 0.66, hd); }
    }
    const rain = ctx.weather?.rain || 0;
    if (rain > 0.25 && R.v > 3) {
      sprayT -= dt;
      if (sprayT <= 0) { sprayT = 0.035 / rain; pfx.spray(b.position.x - fx * 0.8, b.position.z - fz * 0.8, -fx * R.v * 0.3, -fz * R.v * 0.3); }
    }
  }
  // near: the bike is close enough (and coming) for them to step out
  function updatePed(h, near, dt) {
    if (!h.ped) { h.done = true; return; }
    const o = h.obj;
    if (!h.walking && near) { h.walking = true; }
    if (h.walking) {
      const sp = (h.hurry ? 3.2 : h.slow ? 0.6 : 1.15) * dt;
      h.px += sp;
      const hd = h.hd, rx = -Math.cos(hd), rz = Math.sin(hd);
      o.position.set(h.bx + rx * h.px, 0.12, h.bz + rz * h.px);
      o.rotation.y = Math.atan2(rx, rz);
      h.ped.c.mixer.update(dt * (h.hurry ? 1.6 : 1));
      if (h.px > 5.5) { h.done = true; freeHazard(h); return; }
      // blocks while in our half of the road
      HZ.ped.block = true;
      h.lane = Math.abs(h.px - LANE) < 1.8 || (h.px > -1 && h.px < LANE + 1.5) ? 1 : -1;
    } else h.lane = -1;
  }

  // ---------- camera ----------
  const camPos = new THREE.Vector3(), camLook = new THREE.Vector3();
  let camInit = false;
  // default chase framing: a bit higher and further back, looking slightly down at the road
  const CAM = {
    portrait: { back: 7.2, up: 4.3, ahead: 10, lookY: 1.1, fov: 62 },
    landscape: { back: 6.6, up: 3.8, ahead: 9, lookY: 1.1, fov: 52 },
  };
  // player look-around: drag orbits the camera round the bike, pinch / wheel zooms; it eases back when left alone
  const free = { yaw: 0, pitch: 0, zoom: 1, hold: false, idle: 9 };
  function camDrag(dx, dy) {
    free.yaw = THREE.MathUtils.clamp(free.yaw - dx * 0.009, -2.8, 2.8);
    free.pitch = THREE.MathUtils.clamp(free.pitch + dy * 0.006, -0.35, 0.9);
    free.idle = 0;
  }
  function camZoom(z) { free.zoom = THREE.MathUtils.clamp(z, 0.65, 1.8); free.idle = 0; }
  function camHold(on) { free.hold = on; free.idle = 0; }
  const camSnap = () => ({ yaw: free.yaw, pitch: free.pitch, zoom: free.zoom });
  function camRestore(s) { if (s) Object.assign(free, s); }
  function camReset() { free.yaw = 0; free.pitch = 0; free.zoom = 1; free.idle = 9; }
  function camUpdate(dt) {
    if (!R.bike) return;
    const b = R.bike.root.position, hd = R.bike.root.rotation.y;
    const fx = Math.sin(hd), fz = Math.cos(hd);
    const portrait = camera.aspect < 1;
    let pos, look;
    if (R.camMode === 'scene' && R.sceneCam) { pos = R.sceneCam.pos; look = R.sceneCam.look; }
    else {
      // while an event card is docked at the bottom, pull up and back so the bike and the action sit above it
      R.evCamK = (R.evCamK || 0) + ((R.eventCam ? 1 : 0) - (R.evCamK || 0)) * Math.min(1, dt * 3);
      const ek = R.evCamK;
      const cc = portrait ? CAM.portrait : CAM.landscape;
      // the camera hangs off the bike on a soft spring: it drops back when the bike pulls away and closes in under
      // braking (slower than the bike's own pitch, so the two read separately)
      R.camG += (R.accS - R.camG) * Math.min(1, dt * 2.5);
      const surge = THREE.MathUtils.clamp(R.camG * 0.085, -0.45, 0.55);
      const back = cc.back + ek * 1.8 + surge, up = cc.up + ek * 1.5 - surge * 0.25, aheadD = cc.ahead - ek * 5;
      // the camera swings round behind the bike with a little lag instead of being bolted to it
      if (R.camYaw == null || R.snapCam) R.camYaw = hd;
      let dy = hd - R.camYaw; while (dy > Math.PI) dy -= 2 * Math.PI; while (dy < -Math.PI) dy += 2 * Math.PI;
      R.camYaw += dy * Math.min(1, dt * 3.8);
      // free look drifts home a moment after the finger lifts
      if (!free.hold) {
        free.idle += dt;
        if (free.idle > 1.3) { const kk = 1 - Math.exp(-dt * 2.4); free.yaw -= free.yaw * kk; free.pitch -= free.pitch * kk; free.zoom += (1 - free.zoom) * kk; }
      }
      const side = Math.abs(Math.sin(free.yaw)); // looking from the side: come closer and a bit higher so walls don't get in the way
      const yaw = R.camYaw + free.yaw;
      const horiz = back * free.zoom * (1 - 0.22 * side), height = Math.max(1.1, up * free.zoom + free.pitch * 6 + side * 2.2);
      const cx = Math.sin(yaw), cz = Math.cos(yaw);
      // bumps kick the camera down and it springs back; a fine road buzz grows with speed
      R.camKv += (-95 * R.camKy - 10 * R.camKv) * dt; R.camKy += R.camKv * dt;
      R.camKy = THREE.MathUtils.clamp(R.camKy, -0.3, 0.3);
      const buzzA = R.phase === 'ride' ? 0.016 * Math.min(1.3, R.v / Math.max(1, R.vs?.top || 10)) ** 1.5 : 0, tt = R.rideTime;
      pos = v3.set(b.x - cx * horiz + Math.sin(tt * 41) * buzzA * 0.5, height + b.y * 0.4 + R.camKy + (Math.sin(tt * 37) * 0.6 + Math.sin(tt * 59 + 1.3) * 0.4) * buzzA, b.z - cz * horiz);
      // look at the road ahead (so the view turns into a corner before the bike does); riding freely, where the bike points
      let lx2, ly2, lz2;
      if (R.route && R.phase === 'ride' && !R.manual) {
        sampleRoute(R.route, Math.min(R.route.length, R.s + aheadD), camAhead);
        const lx = b.x + fx * aheadD, lz = b.z + fz * aheadD;
        lx2 = lx * 0.45 + camAhead[0] * 0.55; ly2 = cc.lookY - ek * 1.2; lz2 = lz * 0.45 + camAhead[1] * 0.55;
      } else { lx2 = b.x + fx * aheadD; ly2 = cc.lookY; lz2 = b.z + fz * aheadD; }
      // the further you swing round, the more the camera looks at the bike instead of down the road
      const w = Math.min(1, Math.abs(free.yaw) / 0.7 + Math.max(0, free.pitch) * 0.6);
      look_.set(lx2 + (b.x - lx2) * w, ly2 + (1.1 - ly2) * w, lz2 + (b.z - lz2) * w);
      look = look_;
    }
    const k = 1 - Math.exp(-dt * (R.camMode === 'scene' ? 2.5 : 8));
    if (!camInit || R.snapCam) { camPos.copy(pos); camLook.copy(look); camInit = true; R.snapCam = false; }
    else { camPos.lerp(pos, k); camLook.lerp(look, 1 - Math.exp(-dt * 9)); }
    if (R.takeCamera === false) return;
    camera.position.copy(camPos);
    if (R.shake > 0) { camera.position.x += (Math.random() - 0.5) * R.shake * 0.35; camera.position.y += (Math.random() - 0.5) * R.shake * 0.35; R.shake = Math.max(0, R.shake - dt * 2.5); }
    camera.lookAt(camLook);
    // the horizon tips a few degrees with the bike's lean (less as the player swings the view round)
    if (R.camMode !== 'scene') {
      const rollT = (R.bike.st?.lean || 0) * 0.15 * (1 - Math.min(1, Math.abs(free.yaw) / 0.5));
      R.camRoll = (R.camRoll || 0) + (rollT - (R.camRoll || 0)) * Math.min(1, dt * 5);
      camera.rotateZ(R.camRoll);
    }
    const fov0 = (portrait ? CAM.portrait : CAM.landscape).fov;
    const fovT = fov0 + (R.boost ? 9 : 0) + Math.min(6, R.v * 0.25) + THREE.MathUtils.clamp(R.camG * 0.55, -1.5, 3.5);
    camera.fov += (fovT - camera.fov) * Math.min(1, dt * 4);
    camera.updateProjectionMatrix();
  }
  function chasePose() {
    const b = R.bike.root.position, hd = R.bike.root.rotation.y, fx = Math.sin(hd), fz = Math.cos(hd);
    const portrait = camera.aspect < 1;
    const { back, up, ahead, lookY, fov } = portrait ? CAM.portrait : CAM.landscape;
    const c = new THREE.PerspectiveCamera(); c.position.set(b.x - fx * back, up, b.z - fz * back); c.lookAt(b.x + fx * ahead, lookY, b.z + fz * ahead);
    return { pos: c.position.clone(), quat: c.quaternion.clone(), fov };
  }
  // place the bike at the start of the first leg (used before the camera tween)
  async function stage(fromTile, fromDir) {
    await ensureBike();
    scene.add(R.bike.root);
    const t = city.tiles[fromTile];
    const d = fromDir >= 0 ? fromDir : [0, 1, 2, 3].find((k) => t.mask & (1 << k));
    const c = laneCurve(d, d, 'start');
    const o = [0, 0, 0];
    const sample = (cv, s) => { const p = cv.pts[0]; return [t.x * TILE + p[0], t.z * TILE + p[1], Math.atan2(DIRS[d][0], DIRS[d][1])]; };
    const [x, z, h] = sample(c, 0);
    R.bike.root.position.set(x, ROAD_Y, z); R.bike.root.rotation.set(0, h, 0);
    R.camMode = 'chase'; R.snapCam = true;
    return chasePose();
  }

  // test hook: schedule an event a little ahead (props placed like a real one)
  function testEvent(ev, lead = 2) { R.event = { ev, s: R.s + lead }; if (ev.pre) prePlace(R.event); }
  // test hook (tools/stop.mjs): a jaywalker `ahead` metres down the road, who steps out as the bike comes
  function testPed(ahead = 40) {
    const h = { type: 'ped', s: Math.min(R.route.length - 8, R.s + ahead), lane: 1, tile: stepAt().tile };
    h.obj = makeHazardMesh(h);
    if (!h.ped) return false;
    scene.add(h.obj); placeHazard(h); R.hazards.push(h);
    return true;
  }
  // test hook (tools/manual.mjs, tools/legs.mjs): riding freely, hold the keys a careful rider would — follow the GPS
  // line, brake for corners, red lights and traffic, swing round anything in the lane, and pull up where the line ends
  // (always inside the door's ring), or at `stop`
  const bp = [0, 0, 0, 0, 0], BOT = { dodge: null };
  const blocky = (h) => h.type === 'parked' || h.type === 'barrier' || h.type === 'cones' || h.type === 'crates';
  function bot({ stop = null } = {}) {
    if (!R.manual || !R.active || R.phase !== 'ride') return null;
    const toEnd = R.route.length - R.s, rd = stop ? Math.hypot(stop.x - F.x, stop.z - F.z) : toEnd;
    const look = Math.max(4.5, R.v * 0.9);
    let tx = stop?.x, tz = stop?.z;
    if (!stop || rd > 10) {
      sampleRoute(R.route, Math.min(R.route.length, R.s + look), bp); tx = bp[0]; tz = bp[1];
      if (BOT.dodge && (!R.hazards.includes(BOT.dodge) || BOT.dodge.done || BOT.dodge.ahead < -3.5)) BOT.dodge = null;
      if (!BOT.dodge) BOT.dodge = R.hazards.find((h) => !h.done && blocky(h) && h.inPath && h.ahead > 0 && h.ahead < 14) || null;
      if (BOT.dodge) { tx += Math.cos(bp[2]) * 2 * LANE; tz -= Math.sin(bp[2]) * 2 * LANE; } // the other lane, till we're past
    }
    const err = wrap(Math.atan2(tx - F.x, tz - F.z) - F.h) - F.yawV * 0.15;
    let target = R.vs.top;
    for (const a of R.arcs) { if (a.s1 < R.s) continue; if (a.s0 > R.s + 50) break; const vt = Math.sqrt(7 * a.r); target = Math.min(target, Math.sqrt(vt * vt + 2 * 4.5 * Math.max(0, a.s0 - R.s - 2))); }
    target = Math.min(target, Math.sqrt(2 * 3.5 * Math.max(0, rd - 0.3)));
    if (Math.abs(err) > 0.7) target = Math.min(target, 3);
    const L = R.light;
    if (L && L.state !== 'g' && L.d > 0.2 && L.d < 30 && !(L.state === 'y' && L.d < R.v * 0.7)) target = Math.min(target, stopV(L.d - 0.3));
    const A = carAhead(25); if (A.who) target = Math.min(target, Math.max(0, A.who.v) + stopV(A.gap - 2));
    for (const h of R.hazards) if (h.type === 'ped' && !h.done && h.inPath && h.ahead > 0 && h.ahead < 12) target = Math.min(target, stopV(h.ahead - 3));
    input('gas', R.v < target - 0.25);
    input('brake', R.v > target + 0.9 && R.v > 0.3);
    input('left', err > 0.04); input('right', err < -0.04);
    return { target, err, rd };
  }
  return { R, F, fx: pfx, start, update, input, abort, stage, chasePose, canOvertake, bot, schemeBot, autoBot, offerSide, countdown: cdown.sp, ensureBike, setNight, testEvent, testPed, camDrag, camZoom, camHold, camSnap, camRestore, camReset, free, get offer() { return R.offer; }, get npc() { return npc; } };
}
const smooth = (t) => t * t * (3 - 2 * t);

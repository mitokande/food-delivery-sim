// Delivery ride: the bike drives itself along the route; the player uses powers and answers events.
import * as THREE from 'three';
import { TILE, FOODS, GAME_MIN_PER_SEC, VEHICLE, DISTRICT } from '../data.js';
import { DIRS, OPP, RIGHT, K } from '../city/gen.js';
import { findPath, buildRoute, sampleRoute, LANE, laneCurve, dirBetween, routeArcs } from '../city/graph.js';
import { planHazards, makeHazardMesh, freeHazard, HZ, warmPeds } from './hazards.js';
import { pickEvent } from './events.js';
import { makeBike } from './vehicle.js';
import { buildRibbon } from './ribbon.js';
import { makeChar, loadKit, pieceParts } from '../assets.js';
import { scoreOrder } from '../orders.js';
import * as St from '../state.js';
import { mulberry32 } from '../rng.js';

const A_LAT = 8.5, B_DEC = 7.5, ROAD_Y = 0.1; // asphalt top (kit 0.01 × 10 m)
const v3 = new THREE.Vector3(), v3b = new THREE.Vector3();
const ahead = [0, 0, 0, 0, 0], camAhead = [0, 0, 0, 0, 0];
const KAP_OFFS = [-3, -1.5, 0, 1.5, 3];

export function createRide(ctx) {
  const { scene, camera, city, traffic } = ctx;
  const rng = mulberry32((Date.now() & 0xffff) ^ 0x5eed);
  const R = {
    active: false, phase: 'idle', timeScale: 1, job: null, leg: 0, route: null, s: 0, v: 0, energy: 100, energyMax: 100,
    boost: false, hop: null, ot: null, runLight: -1, wait: 0, crash: 0, hazards: [], event: null, eventDone: false,
    orders: [], legMeters: 0, meters: 0, stats: null, shake: 0, camFov: 60, bike: null, agent: null, offer: null, hornCd: 0,
    lean: 0, steer: 0, lat: 0, sampled: [0, 0, 0, 0, 0], recentEvents: [], arcs: [], blend: null, yawOff: 0, camYaw: null, fines: 0, rideTime: 0,
  };
  const agent = { kind: 'player', tile: 0, din: 0, dout: 0, s: 0, v: 0, len: 2.2, off: LANE, pos: [0, 0, 0], curve: null, cx: 0, cz: 0 };
  R.agent = agent;
  let bikeId = null;

  // headlight for night rides
  const head = new THREE.SpotLight(0xfff0d0, 0, 38, 0.55, 0.6, 1.2);
  head.position.set(0, 1.1, 0.6); head.target.position.set(0, 0, 9);
  let nightLvl = 0;
  function setNight(n) { nightLvl = n; head.intensity = n * 60; head.visible = n > 0.05; }
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
    const vs = St.vehStats();
    const fx = St.skillFx();
    R.vs = vs; R.fx = fx;
    R.job = job; R.leg = 0; R.active = true; R.timeScale = 1; R.fines = 0; R.rideTime = 0;
    R.energyMax = 100 * fx.energy; R.energy = R.energyMax;
    R.orders = job.orders.map((o) => ({ o, elapsed: 0, heat: 100, integrity: 100, picked: false, done: false, tipMult: 1, ratingAdj: 0, result: null }));
    R.stats = { overtakes: 0, perfect: 0, shortcuts: 0, crashes: 0, bumps: 0, events: 0, cash: 0, meters: 0 };
    R.meters = 0;
    scene.add(R.bike.root);
    if (!traffic.agents.includes(agent)) traffic.addAgent(agent);
    R.curTile = fromTile; R.curDir = fromDir;
    beginLeg();
  }

  function legTarget(leg) { return city.lots[leg.lot].door; }
  function beginLeg() {
    const leg = R.job.legs[R.leg];
    const to = legTarget(leg);
    let path = findPath(city, R.curTile, to, { noBack: R.curDir >= 0 ? OPP(R.curDir) : -1 });
    if (!path) path = findPath(city, R.curTile, to);
    if (path.length < 2) {
      // already at the door: make a tiny loop-less route by nudging one tile along the road
      const t = city.tiles[R.curTile]; const d = [0, 1, 2, 3].find((k) => t.mask & (1 << k));
      const n = R.curTile + DIRS[d][0] + DIRS[d][1] * city.W;
      path = [R.curTile, n]; leg.lotDoorOverride = n;
    }
    R.route = buildRoute(city, path, { startDir: R.curDir });
    R.arcs = routeArcs(R.route);
    setRibbon();
    R.s = 0; R.v = R.leg === 0 ? 0 : R.v; R.ot = null; R.hop = null; R.runLight = -1; R.wait = 0; R.crash = 0; R.offer = null; R.lat = 0;
    R.sampled[3] = 0; R.prevLat = 0; R.yawOff = 0;
    // after resetting s: ease the bike from where it stands onto the start of the new route
    if (R.leg > 0) startBlend();
    // hazards
    for (const h of R.hazards) freeHazard(h);
    const tutorial = St.S.stats.deliveries < 2;
    R.hazards = planHazards(R.route, city, rng, { density: tutorial ? 0.6 : 1, tutorial });
    for (const h of R.hazards) { h.obj = makeHazardMesh(h); scene.add(h.obj); placeHazard(h); }
    // event
    const isDrop = leg.kind === 'drop';
    const p = St.S.stats.deliveries < 1 ? 0 : isDrop ? 0.5 : 0.22;
    R.event = null; R.eventDone = false;
    if (rng() < p && R.route.length > 90) {
      const foods = R.orders.filter((x) => x.picked && !x.done).map((x) => x.o.food);
      const ev = pickEvent(rng, { district: city.tiles[R.route.steps[0].tile].d, lvl: St.S.lvl, hasFood: foods.length > 0, foods, skills: St.S.skills,
        breakdown: R.vs.breakdown, clock: St.S.clock, recent: R.recentEvents });
      if (ev) R.event = { ev, s: R.route.length * (0.3 + rng() * 0.35) };
    }
    // forced breakdown chance for junk bikes
    if (!R.event && rng() < R.vs.breakdown * (isDrop ? 0.6 : 0.3) && St.S.stats.deliveries >= 1) {
      const ev = pickEvent(() => 0, { district: 'oldtown', lvl: 1, hasFood: true, foods: [], skills: {}, breakdown: 1, clock: St.S.clock, recent: [] });
      if (ev && ev.breakdown) R.event = { ev, s: R.route.length * (0.25 + rng() * 0.4) };
    }
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
    ribbon = buildRibbon(R.route, { width: 2.0, y: 0.16, step: 1, color: '#46c8ff', chevrons: true });
    scene.add(ribbon);
  }
  function placeHazard(h) {
    const o = sampleRoute(R.route, h.s, [0, 0, 0, 0]);
    const hd = o[2];
    const rx = -Math.cos(hd), rz = Math.sin(hd);
    const off = h.lane < 0 ? -2 * LANE : h.lane === 0 ? 0 : 0;
    h.x = o[0] + rx * off; h.z = o[1] + rz * off; h.hd = hd;
    h.obj.position.set(h.x, h.obj.position.y, h.z);
    h.obj.rotation.y = hd;
    if (h.type === 'ped') { h.cross = -1; h.obj.position.set(o[0] - rx * 4.2, 0.12, o[1] - rz * 4.2); h.px = -4.2; h.obj.rotation.y = hd + Math.PI / 2; h.walking = false; }
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
    // nearest oncoming car in the opposite lane ahead (distance, closing speed)
    let best = Infinity, who = null;
    const k0 = R.sampled[3];
    for (let k = k0; k < Math.min(R.route.steps.length, k0 + 6); k++) {
      const st = R.route.steps[k];
      const list = traffic.byTile.get(st.tile); if (!list) continue;
      for (const a of list) {
        if (a.kind !== 'car' || a.din !== OPP(st.dout)) continue;
        const d = st.s0 + (st.len - a.s) - R.s - (a.len + agent.len) / 2;
        if (d > -2 && d < best) { best = d; who = a; }
      }
    }
    return { dist: best, who };
  }
  function blockingHazard() {
    let best = null, bd = Infinity;
    for (const h of R.hazards) {
      if (h.done || !HZ[h.type].block) continue;
      if (h.lane < 0) continue;
      const d = h.s - R.s - (HZ[h.type].len || 1) / 2 - 1.2;
      if (d > -1.5 && d < bd) { bd = d; best = h; }
    }
    return { h: best, d: bd };
  }
  function nextLight() {
    // distance to the stop line of the next junction with a signal (and its state)
    const k0 = R.sampled[3];
    for (let k = k0; k < Math.min(R.route.steps.length, k0 + 3); k++) {
      const st = R.route.steps[k + 1]; if (!st) break;
      if (!traffic.lightAt.has(st.tile)) continue;
      // stop before the turn starts: a corner arc can begin a few metres before the junction tile
      let line = st.s0;
      for (const a of R.arcs) if (a.s0 < line && a.s1 > line - 0.1) line = a.s0;
      const d = line - R.s - 0.8;
      if (d < -0.5) continue;
      return { tile: st.tile, d, state: traffic.light(st.tile, st.din) };
    }
    return null;
  }

  // ---------- input ----------
  function input(what, down = true) {
    if (!R.active || R.phase !== 'ride') return;
    if (what === 'boost') { const was = R.boost; R.boost = down && R.energy > 4; if (R.boost && !was) ctx.audio?.play('boost', { vol: 0.7 }); return; }
    if (!down) return;
    if (what === 'hop') return doHop();
    if (what === 'horn') return doHorn();
    if (what === 'overtake') return doOvertake();
    if (what === 'go') { const L = nextLight(); if (L) { R.runLight = L.tile; R.runLightState = L.state; ctx.ui.toast(L.state === 'r' ? 'Running the red!' : 'Go go go!', 'warn'); } return; }
    if (what === 'shortcut') return takeShortcut();
  }
  function doHop() {
    if (R.hop || R.crash > 0) return;
    const T = 0.62 * (1 + 0.04 * (St.S.vehicles[St.S.active].parts.tires || 0));
    R.hop = { t: 0, T, s0: R.s };
    ctx.audio?.play('hop');
    // judge against the nearest hoppable hazard
    let best = null, bd = Infinity;
    for (const h of R.hazards) { if (h.done || !HZ[h.type].hop || h.lane < 0 && !R.ot) continue; const d = h.s - R.s; if (d > -0.5 && d < bd) { bd = d; best = h; } }
    const v = Math.max(R.v, 2);
    if (best && bd < v * T * 0.95 + 1) {
      best.hopped = true;
      const perfect = bd > v * 0.16 && bd < v * T * 0.62;
      if (perfect) { R.stats.perfect++; R.energy = Math.min(R.energyMax, R.energy + 15); ctx.ui.toast('PERFECT HOP!', 'good'); St.goalProgress('perfect'); R.hop.perfect = true; }
    }
  }
  function doHorn() {
    if (R.hornCd > 0) return;
    R.hornCd = 1.2;
    ctx.audio?.play(VEHICLE[St.S.active].horn || 'horn-scooter');
    for (const h of R.hazards) if (h.type === 'ped' && !h.done && h.s - R.s < 30 && h.s > R.s - 2) { h.hurry = true; if (h.ped) h.ped.c.play('sprint', 0.1); }
    const L = leaderAhead(); if (L.who && L.gap < 18 && L.who.kind === 'car') { L.who.vmax += 2.5; L.who.wait = 0; }
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
    R.ot = { t: 0, dir: 1, car: t.car || null, hz: t.hz || null, until: 0, time: 0 };
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
    hop: { text: 'Pothole ahead! Tap <b>HOP</b> (or swipe up) to jump it.', btn: 'hop' },
    overtake: { text: 'Slow car! Tap <b>Overtake</b> — green means the other lane is clear.', btn: 'overtake' },
    go: { text: 'Red light. Wait… or tap <b>Run it!</b> (cameras sometimes fine you).', btn: 'go' },
    shortcut: { text: 'Your Navigation skill found a <b>shortcut</b>! Tap it to cut through.', btn: 'shortcut' },
    boost: { text: 'Open road! Hold <b>TURBO</b> to fly.', btn: 'boost' },
  };
  let coachOn = null, coachT = 0;
  function coach(dt) {
    const seen = St.S.seen;
    if (coachOn) {
      coachT -= dt / Math.max(0.05, R.timeScale);
      const done = coachOn === 'hop' ? !!R.hop : coachOn === 'overtake' ? !!R.ot : coachOn === 'go' ? R.runLight >= 0 : coachOn === 'boost' ? R.boost : coachOn === 'shortcut' ? !R.offer : false;
      if (done || coachT <= 0) { R.timeScale = R.event && R.event.fired && document.querySelector('.modal.event') ? R.timeScale : 1; ctx.ui.coach(null); coachOn = null; }
      return;
    }
    if (R.timeScale < 1 || St.S.stats.deliveries > 12) return;
    let want = null;
    if (!seen.c_hop && R.hazards.some((h) => !h.done && HZ[h.type].hop && h.lane >= 0 && h.s - R.s > 4 && h.s - R.s < Math.max(10, R.v * 1.4))) want = 'hop';
    else if (!seen.c_overtake && canOvertake()?.risk === 0) want = 'overtake';
    else if (!seen.c_go && R.light && R.light.state === 'r' && R.light.d < 10 && R.v < 2) want = 'go';
    else if (!seen.c_shortcut && R.offer) want = 'shortcut';
    else if (!seen.c_boost && R.v > R.vs.top * 0.9 && !R.boost && R.energy > R.energyMax * 0.8 && St.S.stats.deliveries >= 1) want = 'boost';
    if (!want) return;
    seen['c_' + want] = 1; St.save();
    coachOn = want; coachT = 3.2;
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
    const cur = steps[k0];
    const into = R.s - cur.s0;
    const route = buildRoute(city, path, { startDir: cur.din, firstFull: true });
    R.route = route; R.s = Math.max(0, Math.min(into, route.steps[1] ? route.steps[1].s0 - 0.5 : into)); R.sampled[3] = 0;
    R.arcs = routeArcs(route);
    startBlend();
    R.offer = null; R.stats.shortcuts++; St.goalProgress('shortcut');
    // hazards: drop ones from the old route, plan for the new tail
    for (const h of R.hazards) freeHazard(h);
    R.hazards = planHazards(route, city, rng, { startS: R.s + 20 }).filter((h) => h.s > R.s + 15);
    for (const h of R.hazards) { h.obj = makeHazardMesh(h); scene.add(h.obj); placeHazard(h); }
    setRibbon();
    ctx.ui.toast(`Shortcut! ${o.label}`, 'good');
    ctx.ui.routeChanged(R);
  }

  // ---------- damage ----------
  function hurtFood(amount, why) {
    for (const x of R.orders) if (x.picked && !x.done) x.integrity = Math.max(0, x.integrity - amount * x.o.fragile * R.vs.bump);
    if (amount > 0) { R.stats.bumps++; R.shake = Math.min(1, R.shake + amount / 25); ctx.ui.flash?.('bump'); }
  }
  function crash(why) {
    if (R.crash > 0) return;
    ctx.audio?.play('skid', { vol: 0.8 });
    R.crash = 1.8; R.v = 0; R.stats.crashes++;
    hurtFood(20, why);
    R.shake = 1;
    ctx.audio?.play('crash');
    ctx.ui.toast(why || 'Crash!', 'bad');
    if (R.ot) R.ot.dir = -1;
  }

  // ---------- events ----------
  async function runEvent(e) {
    R.event.fired = true;
    R.stats.events++;
    R.recentEvents.push(e.id); if (R.recentEvents.length > 4) R.recentEvents.shift();
    R.timeScale = 0.08;
    R.boost = false;
    if (e.spawn === 'ped') {
      // put the actor in front of the bike so the card has something to look at
      const h = { type: 'ped', s: Math.min(R.route.length - 3, R.s + Math.max(9, R.v * 1.2)), lane: 1, tile: stepAt().tile, slow: true };
      h.obj = makeHazardMesh(h);
      if (h.ped) { scene.add(h.obj); placeHazard(h); h.walking = true; h.px = -3; R.hazards.push(h); }
    }
    ctx.audio?.play(e.sfx || 'event-pop');
    const res = await ctx.ui.event(e, R);
    R.timeScale = 1;
    applyEffect(res || {});
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
    R.phase = 'scene'; R.v = 0; R.boost = false;
    if (ribbon) ribbon.visible = false;
    ctx.audio?.engine(false);
    const lot = city.lots[leg.lot];
    R.curTile = R.route.steps[R.route.steps.length - 1].tile; R.curDir = R.route.steps[R.route.steps.length - 1].din;
    // where the NPC comes from: the lot's front tile edge
    const door = city.tiles[lot.doorFrom];
    const f = DIRS[lot.front];
    const dx = (door.x + f[0] * 0.42) * TILE, dz = (door.z + f[1] * 0.42) * TILE;
    const bx = R.bike.root.position.x, bz = R.bike.root.position.z;
    if (leg.kind === 'pickup') {
      const orders = R.orders.filter((x) => leg.orders.includes(x.o.id));
      npc = await spawnNpc(orders[0].o.rest === 'sultan' ? 'male-d' : 'female-c', dx, dz, bx, bz, true);
      sceneCam(dx, dz);
      await ctx.ui.pickup(orders.map((x) => x.o), R);
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
      x.result = scoreOrder(x.o, { elapsed: x.elapsed, heat: x.heat, integrity: x.integrity, tipMult: x.tipMult, ratingAdj: x.ratingAdj });
      if (npc) npc.c.play(x.result.stars >= 4 ? 'emote-yes' : 'emote-no', 0.2, { once: true });
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
    const c = await makeChar(char);
    c.obj.scale.setScalar(2.2);
    c.obj.position.set(x, 0.2, z);
    scene.add(c.obj);
    let bag = null;
    if (carrying) {
      const parts = pieceParts('food', 'bag');
      if (parts.length) { bag = new THREE.Mesh(parts[0].geometry, parts[0].material); bag.scale.setScalar(0.55); bag.position.set(0, 0.25, 0.14); c.obj.add(bag); }
      c.play('holding-both');
    } else c.play('walk');
    const n = { c, bag, tx: bx, tz: bz, walking: true };
    // walk to ~1.4 m from the bike
    const d = Math.hypot(bx - x, bz - z);
    n.tx = x + (bx - x) * Math.max(0, (d - 1.5) / d); n.tz = z + (bz - z) * Math.max(0, (d - 1.5) / d);
    c.play(carrying ? 'holding-both' : 'walk');
    return n;
  }
  function walkAway(n, x, z) {
    return new Promise((res) => { if (!n) return res(); if (n.bag) n.bag.visible = false; n.tx = x; n.tz = z; n.walking = true; n.c.play('walk'); n.onArrive = () => { n.c.obj.removeFromParent(); res(); }; setTimeout(() => { n.onArrive?.(); }, 2500); });
  }
  function updateNpc(dt) {
    if (!npc) return;
    const o = npc.c.obj;
    const dx = npc.tx - o.position.x, dz = npc.tz - o.position.z, d = Math.hypot(dx, dz);
    if (npc.walking) {
      if (d < 0.15) { npc.walking = false; npc.c.play(npc.bag && npc.bag.visible ? 'holding-both' : 'idle'); const cb = npc.onArrive; npc.onArrive = null; cb?.(); }
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
    const hx = Math.sin(R.sampled[2]), hz = Math.cos(R.sampled[2]);
    const sx = dx - b.x, sz = dz - b.z; const sl = Math.hypot(sx, sz) || 1;
    R.sceneCam = { pos: new THREE.Vector3(mx - sx / sl * 7.5 - hx * 3.5, 3.4, mz - sz / sl * 7.5 - hz * 3.5), look: new THREE.Vector3(mx, 1.3, mz) };
  }

  function finish() {
    R.phase = 'done'; R.active = false;
    if (ribbon) { ribbon.removeFromParent(); ribbon = null; }
    for (const h of R.hazards) freeHazard(h); R.hazards = [];
    ctx.audio?.engine(false);
    traffic.removeAgent(agent);
    St.S.pos = R.curTile; St.S.posDir = R.curDir;
    const fuel = Math.round(R.meters / 1000 * R.vs.fuel * 100) / 100;
    ctx.onFinish({ orders: R.orders, stats: R.stats, fuel, fines: R.fines, meters: R.meters, time: R.rideTime, xpBonus: R.xpBonus || 0 });
    R.xpBonus = 0;
  }
  function abort() {
    if (ribbon) { ribbon.removeFromParent(); ribbon = null; }
    for (const h of R.hazards) freeHazard(h); R.hazards = [];
    if (npc) { npc.c.obj.removeFromParent(); npc = null; }
    R.active = false; R.phase = 'idle'; traffic.removeAgent(agent); R.bike?.root.removeFromParent(); ctx.audio?.engine(false);
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
      drive(dt);
    }
    if (R.bike) R.bike.update(dt, R.v, R.lean, R.steer);
    camUpdate(dtReal);
    ctx.ui.rideFrame(R);
  }

  function drive(dt) {
    const route = R.route;
    sampleRoute(route, R.s, R.sampled);
    const st = stepAt();
    agent.tile = st.tile; agent.din = st.din; agent.dout = st.dout; agent.s = R.s - st.s0; agent.v = R.v; agent.curve = st.c;
    agent.off = R.ot && R.ot.t > 0.3 ? -LANE : LANE;
    // ---- target speed ----
    let top = R.vs.top * (R.boost ? 1.45 * R.vs.boost : 1) * (st.alley ? 0.72 : 1);
    let target = top;
    const corner = R.vs.corner * (R.boost ? 1.22 : 1);
    for (const a of R.arcs) {
      if (a.s1 < R.s) continue;
      if (a.s0 > R.s + 80) break;
      const vt = Math.sqrt(A_LAT * corner * a.r);
      const d = Math.max(0, a.s0 - R.s);
      target = Math.min(target, Math.sqrt(vt * vt + 2 * B_DEC * 0.75 * d));
    }
    const toEnd = route.length - R.s;
    target = Math.min(target, Math.sqrt(2 * B_DEC * 0.8 * Math.max(0, toEnd - 0.4)));
    let blockedBy = null;
    if (!R.ot) {
      const L = leaderAhead();
      if (L.gap < 40) { const vt = Math.sqrt(2 * B_DEC * Math.max(0, L.gap - 2.4)); if (vt < target) { target = vt; blockedBy = L.gap < 14 ? 'car' : null; } }
      const B = blockingHazard();
      if (B.h && B.d < 40) {
        const passable = B.h.type === 'cones' || B.h.type === 'crates';
        const stop = Math.sqrt(2 * B_DEC * Math.max(0, B.d));
        if (passable) { if (B.d < 3) target = Math.min(target, 2.2); else target = Math.min(target, Math.max(2.2, stop)); }
        else if (!(B.h.hopped && R.hop)) target = Math.min(target, stop);
        if (B.d < 14) blockedBy = B.h.type;
        // a double-parked car leaves after a while; autopilot squeezes past it slowly when clear
        if (B.h.type === 'parked' && B.d < 3 && R.v < 0.5) { B.h.waited = (B.h.waited || 0) + dt; if (B.h.waited > 4.5 && oncoming().dist > 30) { R.ot = { t: 0, dir: 1, hz: B.h, until: 0, time: 0, slow: true }; } }
      }
    }
    const L2 = nextLight();
    R.light = L2;
    if (L2 && L2.tile !== R.runLight && L2.state !== 'g') {
      if (!(L2.state === 'y' && L2.d < R.v * 0.8)) { target = Math.min(target, Math.sqrt(2 * B_DEC * Math.max(0, L2.d))); if (L2.d < 18) blockedBy = blockedBy || 'light'; }
    }
    if (R.wait > 0) { R.wait -= dt; target = 0; }
    if (R.crash > 0) { R.crash -= dt; target = 0; }
    R.blockedBy = blockedBy;
    // ---- integrate ----
    const acc = R.vs.accel * (R.boost ? 1.7 : 1);
    if (target > R.v) R.v = Math.min(target, R.v + acc * dt);
    else R.v = Math.max(target, R.v - 11 * dt);
    const ds = R.v * dt;
    R.s += ds; R.meters += ds;
    // energy
    if (R.boost) { R.energy -= 26 / R.fx.boostDur * dt; if (R.energy <= 0) { R.energy = 0; R.boost = false; } }
    else R.energy = Math.min(R.energyMax, R.energy + 5.5 * R.fx.regen * dt);
    // ---- overtake lateral motion ----
    if (R.ot) {
      const ot = R.ot;
      ot.time += dt;
      ot.t = Math.max(0, Math.min(1, ot.t + ot.dir * dt / (ot.slow ? 1.0 : 0.42)));
      if (ot.dir > 0 && ot.t >= 1) {
        let until = R.s + 2;
        if (ot.car && ot.car.tile != null) {
          const k = route.steps.findIndex((x, i) => i >= R.sampled[3] && x.tile === ot.car.tile);
          until = k >= 0 ? route.steps[k].s0 + ot.car.s + ot.car.len / 2 + 3.5 : R.s;
        }
        if (ot.hz) until = ot.hz.s + (HZ[ot.hz.type].len || 2) / 2 + 3;
        if (R.s > until || ot.time > 7) ot.dir = -1;
      }
      if (ot.dir < 0 && ot.t <= 0) R.ot = null;
      // head-on check
      if (R.ot && R.ot.t > 0.5) { const on = oncoming(); if (on.dist < 1.2) { crash('Head-on! Oops.'); if (on.who) on.who.wait = 2; } }
    }
    R.lat = R.ot ? -2 * LANE * smooth(R.ot.t) : 0;
    // running a red: cross traffic check
    if (R.runLight >= 0 && st.tile === R.runLight) {
      const list = traffic.byTile.get(st.tile) || [];
      for (const a of list) if (a.kind === 'car' && a.v > 1 && (a.din & 1) !== (st.din & 1) && Math.hypot(a.pos[0] - R.bike.root.position.x, a.pos[1] - R.bike.root.position.z) < 3.2) { crash('T-boned at the junction!'); a.wait = 2; break; }
      if (!R.lightJudged) { R.lightJudged = true; if (R.runLightState === 'r' && rng() < 0.22) { const fine = Math.round(3 + 4 * (DISTRICT[city.tiles[st.tile].d]?.pay || 1)); R.fines += fine; ctx.audio?.play('camera-shutter'); ctx.ui.toast(`Red-light camera! −$${fine}`, 'bad'); } }
    } else if (R.runLight >= 0 && route.steps[R.sampled[3]].s0 > 0 && st.tile !== R.runLight && R.lightJudged) { R.runLight = -1; R.lightJudged = false; }
    // ---- hop ----
    let y = 0;
    if (R.hop) {
      R.hop.t += dt;
      const f = R.hop.t / R.hop.T;
      y = 4 * 1.05 * f * (1 - f);
      if (f >= 1) { y = 0; if (!R.hop.perfect && R.orders.some((x) => x.picked && !x.done)) hurtFood(2.5 * R.vs.land); ctx.audio?.play('land'); R.hop = null; R.shake = Math.max(R.shake, 0.25); }
    }
    // ---- hazards ----
    for (const h of R.hazards) {
      if (h.done) continue;
      const d = h.s - R.s;
      if (h.spin) h.spin.rotation.y += dt * 3;
      if (h.blink) { const on = (performance.now() / 400 | 0) % 2 === 0; for (const l of h.blink) l.visible = on; }
      if (h.type === 'ped') updatePed(h, d, dt);
      const inMyLane = h.lane === 0 || (h.lane > 0 && (!R.ot || R.ot.t < 0.5)) || (h.lane < 0 && R.ot && R.ot.t > 0.5);
      if (Math.abs(d) < 1.2) {
        const H = HZ[h.type];
        if (H.pickup) {
          if (inMyLane) {
            h.done = true; h.obj.visible = false;
            if (h.type === 'cash') { const n = Math.max(1, Math.round((1 + rng() * 2) * (St.S.lvl > 4 ? 2 : 1))); R.stats.cash += n; ctx.audio?.play('pickup-bonus'); ctx.ui.toast(`+$${n}`, 'cash'); }
            else { R.energy = Math.min(R.energyMax, R.energy + 40); ctx.audio?.play('pickup-bonus', { rate: 1.3 }); ctx.ui.toast('+Energy', 'good'); }
          }
        } else if (h.type !== 'ped' && h.type !== 'parked') {
          if (!inMyLane) { h.done = true; continue; }
          h.done = true;
          if (R.hop && h.hopped) continue;
          if (R.hop && y > 0.5) continue;
          hurtFood(H.dmg || 6);
          R.v *= H.slow || 0.6;
          ctx.audio?.play(H.sfx || 'bump');
          if (h.type === 'cones' || h.type === 'barrier' || h.type === 'crates') { for (const c of h.obj.children) { c.rotation.z = (rng() - 0.5) * 2; c.position.x += (rng() - 0.5) * 2; } }
        }
      }
      if (d < -25) { h.done = true; freeHazard(h); }
    }
    if (ribbon) ribbon.userData.setWindow(R.s + 2.5, R.s + 55, 52);
    coach(dt);
    // ---- shortcut offer ----
    if (!R.offerT || performance.now() - R.offerT > 400) { R.offerT = performance.now(); R.offer = shortcutOffer(); }
    // ---- event ----
    if (R.event && !R.event.fired && R.s > R.event.s && R.crash <= 0) runEvent(R.event.ev);
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
    const dLat = R.lat - (R.prevLat ?? R.lat); R.prevLat = R.lat;
    const yawT = ds > 1e-4 ? -Math.atan2(dLat, ds) : 0;
    R.yawOff += (yawT - R.yawOff) * Math.min(1, dt * 10);
    let px = R.sampled[0] + rx * R.lat, pz = R.sampled[1] + rz * R.lat, ph = hd + R.yawOff;
    if (R.blend && R.blend.t > 0) {
      R.blend.t = Math.max(0, R.blend.t - dt / 0.8);
      const e = smooth(R.blend.t);
      px += R.blend.dx * e; pz += R.blend.dz * e; ph += R.blend.dh * e;
    }
    b.position.set(px, y + ROAD_Y, pz);
    b.rotation.y = ph;
    const leanAngle = Math.atan(R.v * R.v * kap / 9.81) * 0.85 - R.yawOff * 1.4;
    R.lean = -THREE.MathUtils.clamp(leanAngle, -0.5, 0.5);
    R.steer = THREE.MathUtils.clamp(-Math.atan(1.4 * kap) * 1.3 + R.yawOff * 1.2, -0.45, 0.45);
    if (R.crash > 0) { b.rotation.z = Math.sin(R.crash * 20) * 0.1 * R.crash; }
    else b.rotation.z = 0;
    // ---- arrival ----
    if (toEnd < 0.6 && R.v < 0.6 && R.crash <= 0) arrive();
  }
  function updatePed(h, d, dt) {
    if (!h.ped) { h.done = true; return; }
    const o = h.obj;
    if (!h.walking && d < 32 && d > 4) { h.walking = true; }
    if (h.walking) {
      const sp = (h.hurry ? 3.2 : h.slow ? 0.6 : 1.15) * dt;
      h.px += sp;
      const hd = h.hd, rx = -Math.cos(hd), rz = Math.sin(hd);
      const base = sampleRoute(R.route, h.s, [0, 0, 0, 0]);
      o.position.set(base[0] + rx * h.px, 0.12, base[1] + rz * h.px);
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
  function camUpdate(dt) {
    if (!R.bike) return;
    const b = R.bike.root.position, hd = R.bike.root.rotation.y;
    const fx = Math.sin(hd), fz = Math.cos(hd);
    const portrait = camera.aspect < 1;
    let pos, look;
    if (R.camMode === 'scene' && R.sceneCam) { pos = R.sceneCam.pos; look = R.sceneCam.look; }
    else {
      const back = portrait ? 6.6 : 6.0, up = portrait ? 3.15 : 2.8, aheadD = portrait ? 10 : 9;
      // the camera swings round behind the bike with a little lag instead of being bolted to it
      if (R.camYaw == null || R.snapCam) R.camYaw = hd;
      let dy = hd - R.camYaw; while (dy > Math.PI) dy -= 2 * Math.PI; while (dy < -Math.PI) dy += 2 * Math.PI;
      R.camYaw += dy * Math.min(1, dt * 3.8);
      const cx = Math.sin(R.camYaw), cz = Math.cos(R.camYaw);
      pos = v3.set(b.x - cx * back, up + b.y * 0.4, b.z - cz * back);
      // look at the road ahead (so the view turns into a corner before the bike does)
      if (R.route && R.phase === 'ride') {
        sampleRoute(R.route, Math.min(R.route.length, R.s + aheadD), camAhead);
        const lx = b.x + fx * aheadD, lz = b.z + fz * aheadD;
        look = v3b.set(lx * 0.45 + camAhead[0] * 0.55, 1.5, lz * 0.45 + camAhead[1] * 0.55);
      } else look = v3b.set(b.x + fx * aheadD, 1.5, b.z + fz * aheadD);
    }
    const k = 1 - Math.exp(-dt * (R.camMode === 'scene' ? 2.5 : 8));
    if (!camInit || R.snapCam) { camPos.copy(pos); camLook.copy(look); camInit = true; R.snapCam = false; }
    else { camPos.lerp(pos, k); camLook.lerp(look, 1 - Math.exp(-dt * 9)); }
    if (R.takeCamera === false) return;
    camera.position.copy(camPos);
    if (R.shake > 0) { camera.position.x += (Math.random() - 0.5) * R.shake * 0.35; camera.position.y += (Math.random() - 0.5) * R.shake * 0.35; R.shake = Math.max(0, R.shake - dt * 2.5); }
    camera.lookAt(camLook);
    const fov0 = portrait ? 62 : 52;
    const fovT = fov0 + (R.boost ? 9 : 0) + Math.min(6, R.v * 0.25);
    camera.fov += (fovT - camera.fov) * Math.min(1, dt * 4);
    camera.updateProjectionMatrix();
  }
  function chasePose() {
    const b = R.bike.root.position, hd = R.bike.root.rotation.y, fx = Math.sin(hd), fz = Math.cos(hd);
    const portrait = camera.aspect < 1;
    const back = portrait ? 6.6 : 6.0, up = portrait ? 3.15 : 2.8, ahead = portrait ? 10 : 9;
    const c = new THREE.PerspectiveCamera(); c.position.set(b.x - fx * back, up, b.z - fz * back); c.lookAt(b.x + fx * ahead, 1.5, b.z + fz * ahead);
    return { pos: c.position.clone(), quat: c.quaternion.clone(), fov: portrait ? 62 : 52 };
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

  return { R, start, update, input, abort, stage, chasePose, canOvertake, ensureBike, setNight, get offer() { return R.offer; } };
}
const smooth = (t) => t * t * (3 - 2 * t);

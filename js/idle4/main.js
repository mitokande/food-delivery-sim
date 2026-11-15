// Ferdi's (idle4.html): boot, the save, the loop. The remake of Idle Restaurant Manager as a building of rooms seen from
// above (phase 1 of the remake: the building). Rules: sim.js (pure) on the floor plan (plan.js); the view: world.js;
// the interface: ui.js. Its own save; nothing here reads or writes the other games' saves.
import * as THREE from 'three';
import { installGrade, makeEnvironment } from '../look.js';
import { setProgress } from '../assets.js';
import { createAudio } from '../audio.js';
import { S as courierSave } from '../state.js'; // (audio.js reads its volumes from there: set in memory, never saved)
import { keep, restore } from '../native.js';
import { buzz } from '../haptics.js';
import * as S from './sim.js';
import * as Q from './quests.js';
import { createUI } from './ui.js';
import { createWorld } from './world.js';

window.__started = true;
const q = new URLSearchParams(location.search);
const isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
let SPEED = Math.max(0.25, Math.min(20, +(q.get('speed') || 1)));
// trying another size for the interface (?ui=1): the CSS variable in idle4.css. (The fonts tried for it came from
// Google Fonts, which the store apps can't load: the pick, Rubik, ships with the game.)
if (q.has('ui')) document.documentElement.style.setProperty('--ui', String(Math.max(0.5, Math.min(1.3, +q.get('ui') || 1))));

// ---------------------------------------------------------------- the save (its own key)
await restore(S.KEY);
let G = S.fresh();
let fresh = true;
try {
  const raw = q.has('fresh') ? null : localStorage.getItem(S.KEY);
  if (raw) {
    const d = JSON.parse(raw);
    if (d && d.v === 1) { const f = S.fresh(); G = S.migrate({ ...f, ...d, settings: { ...f.settings, ...d.settings }, stats: { ...f.stats, ...d.stats }, seen: { ...d.seen } }); fresh = false; }
  }
} catch (e) { console.warn('idle4 save load failed', e); }
let wiped = false;
const save = () => { if (wiped) return; G.at = Date.now(); const j = JSON.stringify(G); keep(S.KEY, j); try { localStorage.setItem(S.KEY, j); } catch { /* private mode */ } };
const gone = q.has('away') ? +q.get('away') || 0 : !fresh && G.at ? Math.max(0, (Date.now() - G.at) / 1000) : 0;

// ---------------------------------------------------------------- renderer
const canvas = document.getElementById('gl');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
installGrade(renderer);
makeEnvironment(renderer);
function quality() {
  const qv = G.settings.quality === 'auto' ? (isTouch ? 'medium' : 'high') : G.settings.quality;
  renderer.setPixelRatio(Math.min(devicePixelRatio, qv === 'low' ? 1 : qv === 'medium' ? 1.75 : 2));
  renderer.shadowMap.enabled = qv !== 'low';
  return qv;
}
let QV = quality();
let world = null;
function resize() { renderer.setSize(innerWidth, innerHeight, false); world?.resize(innerWidth, innerHeight); }
addEventListener('resize', resize); resize();

const fill = document.getElementById('boot-fill'), bootMsg = document.getElementById('boot-msg');
setProgress((f) => { fill.style.width = Math.round(10 + f * 70) + '%'; });
bootMsg.textContent = 'Unlocking the old building…';

const audio = createAudio();
const applyVolumes = () => { courierSave.settings.music = G.settings.music; courierSave.settings.sfx = G.settings.sfx; courierSave.settings.haptics = G.settings.haptics; audio.apply?.(); };
applyVolumes();
addEventListener('pointerdown', () => { if (!audio.ready) { audio.init(); applyVolumes(); audio.loop('music', 'music-hub'); } }, { capture: true });

// ---------------------------------------------------------------- the game object (what ui.js and world.js call)
const game = {
  G, S, audio, save, canvas, paused: false,
  act(a, room, id) {
    const hadYou = !S.youCook(G) || !S.youServe(G);
    const r = S.act(G, a, room, id);
    if (!r) { audio.play('ui-error'); ui.toast(G.build && a === 'up' ? 'Another room is being worked on' : 'Not enough cash', 'bad'); return false; }
    if (r.hire) { buzz(25); audio.play('ui-levelup', { vol: 0.8 }); ui.hired(r.hire); if (hadYou && !S.youCook(G) && !S.youServe(G)) setTimeout(() => ui.youFree(), 900); }
    else if (r.up) { buzz(30); audio.play('ui-purchase'); setTimeout(() => audio.play('hop', { vol: 0.4 }), 150); }
    else if (r.mgr) { buzz(30); audio.play('ui-levelup'); ui.managerJoined(r.mgr); }
    else if (r.auto) audio.play('ui-tap', { vol: 0.5 });
    else { buzz(12); audio.play('ui-purchase', { vol: 0.7 }); }
    save(); ui.renderRoom();
    return true;
  },
  // a tap on a tip by a chair; the quest bar's Claim; a letter's (or the takings') Collect
  collectTip(id) {
    const a = S.collectTip(G, id);
    if (!a) return;
    world.event({ kind: 'tipped', tip: id, amount: a });
    audio.play('ui-coins', { vol: 0.55 }); buzz(10); ui.live();
  },
  claimQuest() {
    const q = Q.claim(G);
    if (!q) return;
    audio.play('ui-levelup'); setTimeout(() => audio.play('ui-coins', { vol: 0.6 }), 200); buzz(30);
    ui.claimed(q); save(); ui.live(); ui.renderRoom();
  },
  openMail(id) {
    const m = S.openMail(G, id);
    if (!m) return;
    if (m.cash) { audio.play('ui-coins'); buzz(20); }
    save(); ui.live(); ui.renderRoom();
  },
  openMailbox() { ui.mailbox(); },
  // today, by the calendar (the daily gift, each day's reviews)
  today() { const d = new Date(), p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; },
  // a new calendar day: yesterday's reviews bring their reward (into the mailbox)
  checkDay() { const m = S.newDay(G, game.today()); if (m) { save(); ui.live(); } return m; },
  claimSignin() {
    const r = S.claimSignin(G, game.today());
    if (r) { audio.play('ui-coins'); setTimeout(() => audio.play('ui-levelup', { vol: 0.6 }), 150); buzz(25); save(); ui.live(); }
    return r;
  },
  // a tap on the timer over a room being worked on: lend the builder a hand
  hurry() {
    const x = S.hurry(G);
    world.hurried(x);
    if (x) { audio.play('bump', { vol: 0.45 }); buzz(8); } else audio.play('ui-tap', { vol: 0.3 });
  },
  // pay to have Victor's truck moved on
  repel() {
    const ev = [];
    if (!S.repel(G, ev)) { audio.play('ui-error'); ui.toast('Not enough cash', 'bad'); return; }
    audio.play('ui-purchase'); buzz(20);
    for (const e of ev) ui.eventNote(e);
    save(); ui.live();
  },
  openRoom(room) {
    if (ui.room === room) { ui.closeRoom(); return; }
    ui.openRoom(room);
    world.focus(room, innerWidth < innerHeight ? 26 : 22);
  },
  applySettings() { applyVolumes(); const nq = quality(); if (nq !== QV) { QV = nq; resize(); } },
  async reset() {
    wiped = true;
    try { localStorage.removeItem(S.KEY); } catch { /* fine */ }
    await Promise.race([keep(S.KEY, null), new Promise((r) => setTimeout(r, 1500))]);
    location.reload();
  },
};
const ui = createUI(game);
game.ui = ui;
bootMsg.textContent = 'Sweeping the floor…';
world = await createWorld(game, document.getElementById('markers'));
// the room panel covers the lower part of the screen: the building moves up into the space above it
ui.onSheet = (open) => world.setShift(open ? Math.min(innerHeight * 0.2, 190) : 0);
resize();
fill.style.width = '100%';
document.getElementById('boot').classList.add('out');

// ---------------------------------------------------------------- while the game was closed (or the phone asleep)
function catchUp(secs) {
  const r = S.away(G, secs);
  world.snap(); ui.renderRoom(); save();
  if (secs >= S.AWAY.card && !document.querySelector('.modal.awaycard')) ui.away(r);
  return r;
}
let lastWall = Date.now();

// ---------------------------------------------------------------- loop
const timer = new THREE.Timer();
let liveT = 0, saveT = 0, coinT = 0, bellT = 0, appT = 0, dayT = 0;
function frame() {
  timer.update();
  const raw = timer.getDelta(), dt = Math.min(0.05, raw);
  const wall = Date.now(), gap = (wall - lastWall) / 1000; lastWall = wall;
  if (gap > 3) catchUp(gap);
  else if (!game.paused) {
    const ev = S.tick(G, Math.min(1, raw) * SPEED, SPEED);
    coinT -= raw; bellT -= raw; appT -= raw;
    for (const e of ev) {
      world.event(e);
      if (e.kind === 'paid') { if (coinT <= 0) { audio.play('ui-coins', { vol: 0.3 }); coinT = 0.4; } }
      else if (e.kind === 'order') { if (bellT <= 0) { audio.play('doorbell', { vol: 0.15 }); bellT = 3; } }
      else if (e.kind === 'lost' && e.why !== 'full') audio.play('order-late', { vol: 0.2 });
      else if (e.kind === 'tip') audio.play('pickup-bonus', { vol: 0.25 });
      else if (e.kind === 'delivered') { if (coinT <= 0) { audio.play('ui-coins', { vol: 0.35 }); coinT = 0.4; } }
      else if (e.kind === 'online') { if (appT <= 0) { audio.play('notif-order', { vol: 0.12 }); appT = 6; } }
      else if (e.kind === 'mgrbuy' && e.hire) ui.hired(e.hire);
      else if (e.kind === 'event') {
        ui.eventNote(e);
        if (e.on === 'start') { audio.play({ threat: 'siren-short', critic: 'doorbell', star: 'crowd-cheer', inspector: 'notif-order', van: 'horn-moped' }[e.e.kind], { vol: 0.6 }); buzz(30); }
        else audio.play(e.res.ok ? 'order-complete' : 'order-late', { vol: 0.6 });
        save();
      }
      else if (e.kind === 'built') {
        // (the scaffolding drops, the room pops up new; then the card, with a picture of it)
        audio.play('ui-unlock'); buzz(40); ui.built(e.room, e.lv); save();
        setTimeout(() => { audio.play('crowd-cheer', { vol: 0.5 }); ui.upgraded(e.room, e.lv); }, 900);
      }
    }
  }
  world.update(Math.min(0.25, raw) * (game.paused ? 0 : Math.min(SPEED, 3)) || dt * 0.0001, innerWidth, innerHeight);
  liveT += dt; if (liveT > 0.1) { liveT = 0; ui.live(); }
  saveT += dt; if (saveT > 5) { saveT = 0; save(); }
  dayT -= dt; if (dayT <= 0) { dayT = 30; game.checkDay(); }
  renderer.render(world.scene, world.camera);
}
renderer.setAnimationLoop(frame);
document.addEventListener('visibilitychange', () => { if (document.hidden) save(); });
addEventListener('appback', (e) => { if (ui.room) { e.preventDefault(); ui.closeRoom(); } });
addEventListener('pagehide', save);
window.game = Object.assign(game, { renderer, world, catchUp, speed: (v) => (v == null ? SPEED : (SPEED = v)) });
window.ready = true;
if (fresh || !G.seen.intro) { save(); if (!q.has('noti')) ui.story(); else G.seen.intro = true; }
else if (gone > 2) catchUp(gone);

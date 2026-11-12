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
import { createUI } from './ui.js';
import { createWorld } from './world.js';

window.__started = true;
const q = new URLSearchParams(location.search);
const isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
let SPEED = Math.max(0.25, Math.min(20, +(q.get('speed') || 1)));

// ---------------------------------------------------------------- the save (its own key)
await restore(S.KEY);
let G = S.fresh();
let fresh = true;
try {
  const raw = q.has('fresh') ? null : localStorage.getItem(S.KEY);
  if (raw) {
    const d = JSON.parse(raw);
    if (d && d.v === 1) { const f = S.fresh(); G = { ...f, ...d, settings: { ...f.settings, ...d.settings }, stats: { ...f.stats, ...d.stats }, seen: { ...d.seen } }; fresh = false; }
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
    else { buzz(12); audio.play('ui-purchase', { vol: 0.7 }); }
    save(); ui.renderRoom();
    return true;
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
let liveT = 0, saveT = 0, coinT = 0, bellT = 0;
function frame() {
  timer.update();
  const raw = timer.getDelta(), dt = Math.min(0.05, raw);
  const wall = Date.now(), gap = (wall - lastWall) / 1000; lastWall = wall;
  if (gap > 3) catchUp(gap);
  else if (!game.paused) {
    const ev = S.tick(G, Math.min(1, raw) * SPEED, SPEED);
    coinT -= raw; bellT -= raw;
    for (const e of ev) {
      world.event(e);
      if (e.kind === 'paid') { if (coinT <= 0) { audio.play('ui-coins', { vol: 0.3 }); coinT = 0.4; } }
      else if (e.kind === 'order') { if (bellT <= 0) { audio.play('doorbell', { vol: 0.15 }); bellT = 3; } }
      else if (e.kind === 'lost' && e.why !== 'full') audio.play('order-late', { vol: 0.2 });
      else if (e.kind === 'built') { audio.play('ui-unlock'); setTimeout(() => audio.play('crowd-cheer', { vol: 0.5 }), 400); buzz(40); ui.built(e.room, e.lv); save(); }
    }
  }
  world.update(Math.min(0.25, raw) * (game.paused ? 0 : Math.min(SPEED, 3)) || dt * 0.0001, innerWidth, innerHeight);
  liveT += dt; if (liveT > 0.1) { liveT = 0; ui.live(); }
  saveT += dt; if (saveT > 5) { saveT = 0; save(); }
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

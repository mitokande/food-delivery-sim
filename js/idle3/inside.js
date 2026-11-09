// Uncle's Diner (idle3.html): the restaurant from the inside, the main view. A cut-away room (no front or right
// wall, a knee wall with the door at the front) seen from above its front-right corner: the kitchen along the back
// wall (a station per dish on the menu), the pass, the tables, the door at the front left, the sidewalk and the street
// in front. Everything follows the sim's state (sim.js): customers come along the sidewalk, sit at a table with their
// order in a bubble and eat when it comes; the cooks walk to the station of the dish they cook; couriers take the bags
// out of the door. The room is rebuilt for each stage of the restaurant (more tables, a terrace, the shop next door).
// The city map (main.js) is the other view.
import * as THREE from 'three';
import { makeChar, loadKit, getNode } from '../assets.js';
import { createMarkers } from '../hub.js';
import * as S from './sim.js';
import { ICON } from './ui.js';

const CH = 2.0; // character scale (Kenney mini characters, 0.8 tall → 1.6 m, big heads)
const H = { counter: 0.62, table: 0.48, seat: 0.27, wall: 3.0 }; // (furniture sized for the characters' short legs)
const SIT = { y: 0.06, back: 0.06 }; // the 'sit' pose on a chair: lift, and how far back from the chair's centre
const YAW = 0.22, PITCH = 0.84, FOV = 26; // (nearly from the front: the room's width fills a phone held upright)
const CHARS = ['female-a', 'male-b', 'female-c', 'male-d', 'female-e', 'male-f', 'female-b', 'male-a', 'female-d', 'male-e', 'female-f', 'male-c'];
const YOU_CHAR = 'male-c';
// the room per stage: size, look, tables on the terrace (the rest of stage seats / 2 are inside)
const ROOMS = [
  { w: 9, d: 11, look: 'rundown', terrace: 0 },
  { w: 9, d: 11, look: 'diner', terrace: 0 },
  { w: 9, d: 11, look: 'diner', terrace: 3 },
  { w: 16, d: 11, look: 'two', terrace: 4 },
  { w: 16, d: 13, look: 'grand', terrace: 6 },
];
// what each dish looks like on a plate (food kit pieces, size in m)
const PLATED = { burger: ['burger', 0.24], hotdog: ['hot-dog', 0.3], doner: ['sandwich', 0.26], pizza: ['pizza', 0.34], noodle: ['bowl-broth', 0.26],
  fish: ['fish', 0.24], sushi: ['maki-salmon', 0.1], icecream: ['sundae', 0.2] };

// ---------------------------------------------------------------- little builders
const mats = new Map();
function M(color, o = {}) {
  const k = color + JSON.stringify(o);
  if (!mats.has(k)) mats.set(k, new THREE.MeshStandardMaterial({ color, roughness: 0.82, ...o }));
  return mats.get(k);
}
function box(w, h, d, mat, x, y, z, parent) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y + h / 2, z); m.castShadow = true; m.receiveShadow = true; parent.add(m); return m;
}
function cyl(r0, r1, h, mat, x, y, z, parent, seg = 14) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r0, r1, h, seg), mat);
  m.position.set(x, y + h / 2, z); m.castShadow = true; m.receiveShadow = true; parent.add(m); return m;
}
function canvasTex(w, h, draw, repeat) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); }
  return t;
}
const iconTex = new Map();
function iconTexture(name) {
  if (!iconTex.has(name)) {
    const t = new THREE.TextureLoader().load(`assets/icons/${name}.webp`, undefined, undefined, () => { t.image = null; });
    t.colorSpace = THREE.SRGBColorSpace; iconTex.set(name, t);
  }
  return iconTex.get(name);
}
// a food kit piece scaled to `size` m across
const foodBox = new Map();
function food(name, size) {
  const src = getNode('food', name);
  if (!src) return new THREE.Group();
  if (!foodBox.has(name)) { const b = new THREE.Box3().setFromObject(src), s = b.getSize(new THREE.Vector3()); foodBox.set(name, Math.max(s.x, s.z) || 1); }
  const n = src.clone(true);
  n.position.set(0, 0, 0); n.rotation.set(0, 0, 0); n.scale.multiplyScalar(size / foodBox.get(name));
  n.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; o.userData.keep = true; } }); // (the kit's geometry: shared)
  const g = new THREE.Group(); g.add(n); return g;
}
function chefHat(band) {
  const g = new THREE.Group(), w = M('#ffffff', { roughness: 0.95 });
  const c = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.17, 0.13, 16), w); c.position.y = 0.065;
  const p = new THREE.Mesh(new THREE.SphereGeometry(0.2, 16, 10), w); p.scale.set(1, 0.72, 1); p.position.y = 0.19;
  g.add(c, p);
  if (band) { const b = new THREE.Mesh(new THREE.CylinderGeometry(0.172, 0.176, 0.05, 16), M(band)); b.position.y = 0.03; g.add(b); }
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}
function cap(color) {
  const g = new THREE.Group(), m = M(color, { roughness: 0.6 });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(0.235, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), m); dome.scale.y = 0.62;
  const brim = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.025, 0.2), m); brim.position.set(0, 0.01, 0.2);
  g.add(dome, brim); g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}

// ---------------------------------------------------------------- the layout of a stage (pure numbers)
function layout(stage) {
  const R = ROOMS[stage], { w, d } = R;
  const nT = S.STAGES[stage].seats / 2, nTer = Math.min(R.terrace, nT), nIn = nT - nTer;
  const door = { x: -w / 2 + 0.9, z: d / 2 };
  const L = { ...R, stage, door, stZ: -d / 2 + 0.5, laneZ: -d / 2 + 1.35, passZ: -d / 2 + 2.1, walkZ: d / 2 + 4.1, streetZ: d / 2 + 5.0 };
  // inside: a grid of table slots, taken in a checker order (spread out), none in front of the door
  const rows = []; for (let z = -d / 2 + 3.15; z <= d / 2 - 0.8 + 1e-6; z += 1.9) rows.push(z);
  const nc = Math.max(2, Math.round((w - 2.6) / 2.3)), x0 = -w / 2 + 2.05, x1 = w / 2 - 1.05;
  const cols = Array.from({ length: nc }, (_, i) => x0 + (x1 - x0) * i / (nc - 1));
  const slots = [];
  rows.forEach((z, r) => cols.forEach((x, c) => { if (Math.hypot(x - door.x, z - door.z) > 2.3) slots.push({ x, z, r, c, k: (r + c) % 2 }); }));
  slots.sort((a, b) => a.k - b.k || a.r - b.r || a.c - b.c);
  const tables = slots.slice(0, nIn).map((s) => ({ x: s.x, z: s.z, lane: s.z + 0.95, terrace: false }));
  // the terrace: one row in front, clear of the way to the door
  if (nTer) {
    const tx0 = -w / 2 + 3.0, tx1 = w / 2 - 1.2, tz = d / 2 + 1.55;
    for (let i = 0; i < nTer; i++) tables.push({ x: nTer === 1 ? (tx0 + tx1) / 2 : tx0 + (tx1 - tx0) * i / (nTer - 1), z: tz, lane: tz + 1.15, terrace: true });
  }
  // seats: two a table (left, right); filled one a table first
  L.tables = tables;
  L.seats = [];
  tables.forEach((t, i) => { for (const side of [0, 1]) L.seats[i * 2 + side] = { t: i, side, x: t.x + (side ? 0.8 : -0.8), z: t.z, ry: side ? -Math.PI / 2 : Math.PI / 2 }; });
  L.seatOrder = [...tables.map((_, i) => i * 2), ...tables.map((_, i) => i * 2 + 1)];
  // the kitchen: a station per dish slot along the back wall
  const sx0 = -w / 2 + 1.75, room = Math.floor((w - 2.0) / 1.55);
  L.stationX = (i) => sx0 + i * 1.55;
  L.maxStations = Math.min(S.DISHES.length, room);
  L.shelf = { x: -w / 2 + 0.85, z: -d / 2 + 2.1 };
  L.box = { x0: -w / 2 - 0.4, x1: w / 2 + 0.4, z0: -d / 2 - 0.4, z1: d / 2 + (nTer ? 3.2 : 1.6) };
  return L;
}

// ---------------------------------------------------------------- the view
export async function createInside(game, canvas, markerEl) {
  const G = game.G;
  await loadKit('food');
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#a9c7d6');
  scene.fog = new THREE.Fog('#a9c7d6', 70, 160);
  const camera = new THREE.PerspectiveCamera(FOV, innerWidth / innerHeight, 0.5, 400);
  const hemi = new THREE.HemisphereLight('#fff8ee', '#a08c76', 1.9); scene.add(hemi);
  const sun = new THREE.DirectionalLight('#fff1dc', 2.3);
  sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.03;
  scene.add(sun, sun.target);
  const markers = createMarkers(markerEl, camera);
  const world = new THREE.Group(); scene.add(world); // the ground, the street: rebuilt with the room (it moves with the width)
  const room = new THREE.Group(); scene.add(room);
  const actors = new THREE.Group(); scene.add(actors);
  let L = null, active = true;
  const pick = []; // meshes a tap can hit: userData.pick = 'kitchen' | 'you' | 'cook' | 'couriers' | 'next'
  const grow = []; // pieces popping in after an expansion: { o, t0 }
  let growT = 0;

  // ---------- the room ----------
  function hitBox(w, h, d, x, y, z, what, parent) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshBasicMaterial({ visible: false }));
    m.position.set(x, y + h / 2, z); m.userData.pick = what; parent.add(m); pick.push(m); return m;
  }
  function floorTex(look) {
    if (look === 'rundown') return canvasTex(256, 256, (g, w, h) => {
      g.fillStyle = '#a3876b'; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? '#9a7e63' : '#ab8f72'; g.fillRect(0, i * 32, w, 31); g.fillStyle = '#6b5442'; g.fillRect(0, i * 32 + 31, w, 1); g.fillRect((i * 97) % w, i * 32, 2, 32); }
      for (let i = 0; i < 6; i++) { g.fillStyle = 'rgba(60,45,30,.25)'; g.beginPath(); g.ellipse((i * 71) % w, (i * 113) % h, 22 + i * 3, 12 + i * 2, i, 0, 7); g.fill(); }
    }, [L.w / 4, L.d / 4]);
    const [a, b] = look === 'grand' ? ['#f4ead6', '#2f3a4a'] : ['#f6ecd8', '#c4482f'];
    return canvasTex(64, 64, (g) => { g.fillStyle = a; g.fillRect(0, 0, 64, 64); g.fillStyle = b; g.fillRect(0, 0, 32, 32); g.fillRect(32, 32, 32, 32); }, [L.w / 1.1, L.d / 1.1]);
  }
  function wallTex(look) {
    const [up, low, line] = look === 'rundown' ? ['#ddd1ba', '#ad9f88', '#867868'] : look === 'grand' ? ['#f4e6c8', '#6a2e1f', '#d4a640'] : ['#f4e1bf', '#c4480f', '#7a2a00'];
    return canvasTex(256, 256, (g, w, h) => {
      g.fillStyle = up; g.fillRect(0, 0, w, h);
      g.fillStyle = low; g.fillRect(0, h * 0.66, w, h * 0.34);
      g.fillStyle = line; g.fillRect(0, h * 0.64, w, h * 0.03);
      if (look === 'rundown') for (let i = 0; i < 9; i++) { g.fillStyle = `rgba(90,70,50,${0.08 + (i % 3) * 0.04})`; g.beginPath(); g.ellipse((i * 59) % w, (i * 37) % (h * 0.6), 18 + i * 2, 26, 0, 0, 7); g.fill(); }
    });
  }
  function signTex(text, bg, fg, faded) {
    return canvasTex(512, 128, (g, w, h) => {
      g.fillStyle = bg; g.beginPath(); g.roundRect(4, 4, w - 8, h - 8, 26); g.fill();
      g.strokeStyle = faded ? '#6d6253' : '#fff3d6'; g.lineWidth = 6; g.stroke();
      g.font = 'bold 64px "Lilita One", "Arial Black", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillStyle = fg; g.globalAlpha = faded ? 0.55 : 1; g.fillText(text, w / 2, h / 2 + 4);
    });
  }
  const builtStations = [];
  function buildRoom(stage, popIn) {
    for (const o of [...room.children, ...world.children]) { o.removeFromParent(); o.traverse((m) => { if (m.geometry && !m.userData.keep) m.geometry.dispose(); }); }
    builtStations.length = 0; grow.length = 0;
    L = layout(stage);
    const { w, d, look } = L, two = look === 'two' || look === 'grand';
    // outside: pavement in front of the place, the street beyond, the city floor around
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(240, 240), M('#b8a991')); ground.rotation.x = -Math.PI / 2; ground.position.y = -0.02; ground.receiveShadow = true; world.add(ground);
    const walk = new THREE.Mesh(new THREE.PlaneGeometry(240, 4.4), M('#d6cbb8')); walk.rotation.x = -Math.PI / 2; walk.position.set(0, -0.01, d / 2 + 2.2 + (L.terrace ? 1.0 : 0)); walk.receiveShadow = true; world.add(walk);
    const road = new THREE.Mesh(new THREE.PlaneGeometry(240, 9), M('#555a63')); road.rotation.x = -Math.PI / 2; road.position.set(0, -0.005, L.streetZ + 4.5 + (L.terrace ? 1.0 : 0)); road.receiveShadow = true; world.add(road);
    for (let x = -60; x < 60; x += 4) box(2.2, 0.01, 0.18, M('#e8e2d4'), x, 0, L.streetZ + 4.5 + (L.terrace ? 1.0 : 0), world);
    box(240, 0.12, 0.25, M('#a39985'), 0, 0, L.streetZ + (L.terrace ? 1.0 : 0), world); // the curb
    // the floor slab and the floor
    box(w + 0.4, 0.14, d + 0.2, M('#6f6253'), 0, -0.14, 0, room);
    const fl = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshStandardMaterial({ map: floorTex(look), roughness: 0.75 }));
    fl.rotation.x = -Math.PI / 2; fl.position.y = 0.002; fl.receiveShadow = true; room.add(fl);
    if (two) { // the shop next door: its half of the floor in its own colours
      const f2 = new THREE.Mesh(new THREE.PlaneGeometry(w / 2, d), new THREE.MeshStandardMaterial({ map: canvasTex(64, 64, (g) => { g.fillStyle = '#eef3e8'; g.fillRect(0, 0, 64, 64); g.fillStyle = '#2f6f5b'; g.fillRect(0, 0, 32, 32); g.fillRect(32, 32, 32, 32); }, [w / 2.2, d / 1.1]), roughness: 0.75 }));
      f2.rotation.x = -Math.PI / 2; f2.position.set(w / 4, 0.004, 0); f2.receiveShadow = true; room.add(f2);
    }
    // walls: the back and the left; a knee wall at the front with the door; the right side open
    const wm = new THREE.MeshStandardMaterial({ map: wallTex(look), roughness: 0.9 });
    box(w + 0.2, H.wall, 0.2, wm, 0, 0, -d / 2 - 0.1, room);
    box(0.2, H.wall, d, wm, -w / 2 - 0.1, 0, 0, room);
    const knee = M(look === 'rundown' ? '#8f8270' : look === 'grand' ? '#6a2e1f' : '#c4480f');
    box(w - 1.7, 0.42, 0.18, knee, (-w / 2 + 1.7 + w / 2) / 2, 0, d / 2 - 0.09, room);
    box(0.18, 0.42, d, knee, w / 2 + 0.09, 0, 0, room);
    box(0.18, 2.4, 0.22, M('#5b4636'), -w / 2 + 1.6, 0, d / 2 - 0.09, room); // the door frame
    const mat = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.8), M(look === 'rundown' ? '#6d5a45' : '#8a1f12')); mat.rotation.x = -Math.PI / 2; mat.position.set(L.door.x, 0.01, d / 2 - 0.5); room.add(mat);
    if (look === 'grand') box(w + 0.2, 0.14, 0.26, M('#d4a640', { metalness: 0.6, roughness: 0.35 }), 0, H.wall - 0.14, -d / 2 - 0.08, room);
    // windows in the left wall (the run-down one boarded up)
    for (const z of [-d / 2 + 2.6, -d / 2 + 5.2].filter((z) => z < d / 2 - 1)) {
      box(0.06, 1.1, 1.5, M('#5b4636'), -w / 2 + 0.02, 1.05, z, room);
      const gl = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 0.9), M('#bfe3f5', { emissive: '#7fb6d6', emissiveIntensity: 0.35, roughness: 0.2 }));
      gl.rotation.y = Math.PI / 2; gl.position.set(-w / 2 + 0.06, 1.6, z); room.add(gl);
      if (look === 'rundown' && z < 0) for (const k of [-1, 1]) { const p = box(0.05, 0.14, 1.6, M('#a5855f'), -w / 2 + 0.1, 1.45 + k * 0.22, z, room); p.rotation.x = k * 0.12; }
    }
    // the sign on the back wall (the run-down one lost its letters)
    const sg = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 0.8), new THREE.MeshStandardMaterial({ roughness: 0.6,
      map: look === 'rundown' ? signTex('F RDI \'S D NER', '#8b8070', '#efe6d4', true) : signTex('Ferdi\'s Diner', '#c4480f', '#fff3d6'),
      emissive: '#ffffff', emissiveIntensity: look === 'rundown' ? 0 : 0.12 }));
    sg.material.emissiveMap = sg.material.map;
    sg.position.set(two ? -w / 4 : 0.6, 2.45, -d / 2 + 0.02); room.add(sg);
    if (two) { const s2 = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 0.8), new THREE.MeshStandardMaterial({ map: signTex('Ferdi\'s Kitchen', '#2f6f5b', '#fff3d6'), roughness: 0.6 })); s2.position.set(w / 4, 2.45, -d / 2 + 0.02); room.add(s2); }
    // the pass (plates go out here) and the pick-up shelf for the couriers by the door
    box(w - 2.0, H.counter + 0.1, 0.5, M(look === 'rundown' ? '#8d7f6d' : '#e9e2d4'), (-w / 2 + 1.6 + w / 2 - 0.4) / 2, 0, L.passZ, room);
    box(w - 2.0, 0.05, 0.6, M(look === 'rundown' ? '#6f6253' : '#c4480f'), (-w / 2 + 1.6 + w / 2 - 0.4) / 2, H.counter + 0.1, L.passZ, room);
    box(1.3, 0.9, 0.5, M('#a0703f'), L.shelf.x, 0, L.shelf.z, room);
    box(1.3, 0.05, 0.5, M('#7a5230'), L.shelf.x, 0.45, L.shelf.z, room);
    hitBox(1.6, 1.4, 1.2, L.shelf.x, 0, L.shelf.z + 0.3, 'couriers', room);
    hitBox(w - 1.6, 2.0, 2.0, 0.6, 0, -d / 2 + 1.0, 'kitchen', room); // (a tap in the kitchen cooks)
    // kitchen tiles behind the stations
    box(w - 1.4, 1.3, 0.04, M(look === 'rundown' ? '#b9b2a5' : '#ffffff', { roughness: 0.4 }), 0.5, 0, -d / 2 + 0.02, room);
    // tables, chairs (and parasols on the terrace)
    const tm = M(look === 'rundown' ? '#8a6d4f' : look === 'grand' ? '#5a3424' : '#a0703f'), cm = M(look === 'rundown' ? '#6b5442' : look === 'grand' ? '#c4482f' : '#2f6f5b');
    const top = look === 'rundown' ? M('#b9a98e') : M('#fbf6ec');
    L.tables.forEach((t, i) => {
      const g = new THREE.Group(); g.position.set(t.x, 0, t.z); room.add(g);
      cyl(0.06, 0.08, H.table, tm, 0, 0, 0, g, 8);
      cyl(0.56, 0.56, 0.05, top, 0, H.table - 0.03, 0, g, 22);
      for (const side of [-1, 1]) {
        const c = new THREE.Group(); c.position.set(side * 0.8, 0, 0); g.add(c);
        box(0.42, 0.06, 0.42, cm, 0, H.seat - 0.06, 0, c);
        for (const [a, b] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) box(0.05, H.seat - 0.06, 0.05, cm, a * 0.17, 0, b * 0.17, c);
        box(0.06, 0.42, 0.42, cm, side * 0.2, H.seat, 0, c);
      }
      if (t.terrace) {
        cyl(0.03, 0.03, 2.4, M('#e8e2d4'), 0, 0, 0, g, 6);
        const pm = new THREE.Mesh(new THREE.ConeGeometry(0.85, 0.36, 10, 1, true), new THREE.MeshStandardMaterial({ side: THREE.DoubleSide, roughness: 0.8,
          map: canvasTex(128, 16, (gg, w) => { for (let k = 0; k < 10; k++) { gg.fillStyle = k % 2 ? '#fff3d6' : '#e2382b'; gg.fillRect(k * w / 10, 0, w / 10 + 1, 16); } }) }));
        pm.position.y = 2.55; pm.castShadow = true; g.add(pm);
      }
      if (popIn) grow.push({ o: g, t0: 0.15 + i * 0.05 });
    });
    if (L.terrace) { // planters along the front of the terrace
      for (let x = -w / 2 + 2.6; x < w / 2 - 0.4; x += 1.6) {
        const p = new THREE.Group(); p.position.set(x, 0, d / 2 + 2.85); room.add(p);
        box(1.1, 0.4, 0.4, M('#8a5a3c'), 0, 0, 0, p);
        const b = new THREE.Mesh(new THREE.SphereGeometry(0.32, 10, 8), M('#4f9a3a')); b.scale.set(1.5, 0.75, 0.9); b.position.y = 0.48; b.castShadow = true; p.add(b);
        if (popIn) grow.push({ o: p, t0: 0.3 });
      }
    }
    // the run-down place: crates and a broken chair in a corner; later: plants
    if (look === 'rundown') {
      box(0.7, 0.6, 0.7, M('#a5855f'), w / 2 - 0.8, 0, -d / 2 + 3.0, room); box(0.55, 0.45, 0.55, M('#9a7a55'), w / 2 - 0.85, 0.6, -d / 2 + 3.0, room).rotation.y = 0.4;
      const bc = box(0.42, 0.06, 0.42, M('#6b5442'), w / 2 - 1.0, 0, d / 2 - 0.9, room); bc.rotation.set(0.2, 0.6, 1.2);
    } else {
      for (const [x, z] of [[w / 2 - 0.5, -d / 2 + 2.9], [w / 2 - 0.5, d / 2 - 0.6], ...(two ? [[0, d / 2 - 0.5]] : [])]) {
        const p = new THREE.Group(); p.position.set(x, 0, z); room.add(p);
        cyl(0.2, 0.16, 0.4, M('#c46a3f'), 0, 0, 0, p, 10);
        const b = new THREE.Mesh(new THREE.SphereGeometry(0.38, 10, 8), M('#3f8a3a')); b.position.y = 0.75; b.scale.y = 1.25; b.castShadow = true; p.add(b);
      }
    }
    if (popIn) { growT = 0; for (const p of grow) p.o.scale.setScalar(0.001); }
    buildStations();
    // light and shadow to the size of the room
    const R = Math.max(w, d + 5) * 0.75;
    sun.position.set(w * 0.35 + 9, 16, d * 0.2 + 10); sun.target.position.set(0, 0, 1.5);
    Object.assign(sun.shadow.camera, { left: -R, right: R, top: R, bottom: -R, near: 1, far: 60 }); sun.shadow.camera.updateProjectionMatrix();
    fit(true);
  }

  // the kitchen: a station per dish on the menu, a grey one for the dish the next cook brings
  let stationKey = '';
  const stationGroup = new THREE.Group(); room.add(stationGroup);
  function stationModel(dish) {
    const g = new THREE.Group(), look = L.look;
    const steel = M('#c4ccd5', { metalness: 0.45, roughness: 0.38 }), dark = M('#33363d', { roughness: 0.5 }), top = H.counter;
    box(1.36, top, 0.8, look === 'rundown' ? M('#a39b8e') : steel, 0, 0, 0, g);
    const put = (name, size, x, z, y = top, ry = 0) => { const n = food(name, size); n.position.set(x, y, z); n.rotation.y = ry; g.add(n); return n; };
    switch (dish) {
      case 'burger': box(1.25, 0.05, 0.62, dark, 0, top, 0, g); put('meat-patty', 0.26, -0.32, 0.02, top + 0.05); put('meat-patty', 0.26, 0.0, -0.08, top + 0.05); put('burger', 0.26, 0.36, 0.06, top + 0.05); break;
      case 'hotdog': box(1.1, 0.1, 0.5, steel, 0, top, 0, g); for (let i = 0; i < 6; i++) { const r = cyl(0.035, 0.035, 0.9, M('#b9bec6', { metalness: 0.7, roughness: 0.3 }), 0, 0, 0, g, 8); r.rotation.z = Math.PI / 2; r.position.set(0, top + 0.13, -0.18 + i * 0.07); } put('hot-dog', 0.34, 0.1, 0.05, top + 0.16, 0.2); break;
      case 'doner': box(0.5, 0.9, 0.12, dark, -0.15, top, -0.3, g); cyl(0.02, 0.02, 0.85, steel, 0.1, top, -0.05, g, 6); cyl(0.13, 0.2, 0.6, M('#9b5a2e', { roughness: 0.7 }), 0.1, top + 0.12, -0.05, g, 12); put('sandwich', 0.26, 0.45, 0.2, top, 0.4); break;
      case 'pizza': { const o = new THREE.Mesh(new THREE.SphereGeometry(0.55, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), M('#b5542f', { roughness: 0.9 })); o.scale.set(1.15, 0.9, 0.7); o.position.set(0, top, -0.05); o.castShadow = true; g.add(o);
        const m = new THREE.Mesh(new THREE.CircleGeometry(0.2, 16, 0, Math.PI), M('#2a1a12', { emissive: '#ff6a1a', emissiveIntensity: 0.7 })); m.position.set(0, top + 0.02, 0.33); g.add(m);
        put('pizza', 0.42, 0.35, 0.28, top, 0); break; }
      case 'noodle': cyl(0.22, 0.22, 0.06, dark, -0.2, top, 0, g, 16); put('frying-pan', 0.5, -0.2, 0.05, top + 0.06, -0.6); put('chinese', 0.22, 0.4, 0.05, top); break;
      case 'fish': box(0.7, 0.16, 0.6, steel, -0.25, top, 0, g); box(0.6, 0.02, 0.5, M('#e6b43a', { roughness: 0.25, emissive: '#6a4a00', emissiveIntensity: 0.3 }), -0.25, top + 0.16, 0, g); put('fries', 0.2, 0.3, 0.05, top); put('fish', 0.26, 0.45, -0.15, top, 1.2); break;
      case 'sushi': box(1.3, 0.06, 0.7, M('#c49a62'), 0, top, 0, g); put('cutting-board-japanese', 0.55, -0.2, 0, top + 0.06); for (let i = 0; i < 3; i++) put('maki-salmon', 0.1, -0.35 + i * 0.13, 0.05, top + 0.1); put('sushi-salmon', 0.12, 0.38, 0.05, top + 0.06); break;
      case 'icecream': box(1.3, 0.35, 0.7, M('#ffffff', { roughness: 0.5 }), 0, top - 0.1, 0, g); box(1.2, 0.03, 0.6, M('#bfe3f5', { transparent: true, opacity: 0.55, roughness: 0.1 }), 0, top + 0.25, 0, g); put('ice-cream', 0.18, -0.25, 0.05, top + 0.28); put('ice-cream-cup', 0.16, 0.25, 0.05, top + 0.28); break;
      default: break;
    }
    // its sign on the wall: the dish's icon
    const sg = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.62), new THREE.MeshBasicMaterial({ map: iconTexture(S.DISH[dish].icon), transparent: true, alphaTest: 0.1 }));
    sg.position.set(0, 1.62, -0.38); g.add(sg);
    return g;
  }
  let ghostMk = null;
  function buildStations(popIn = false) {
    stationGroup.removeFromParent(); room.add(stationGroup);
    for (const o of [...stationGroup.children]) o.removeFromParent();
    builtStations.length = 0;
    G.menu.forEach((dish, i) => {
      if (i >= L.maxStations) return;
      const g = stationModel(dish); g.position.set(L.stationX(i), 0, L.stZ); stationGroup.add(g);
      builtStations.push({ dish, x: L.stationX(i), g });
      if (popIn && i === G.menu.length - 1) { g.scale.setScalar(0.001); grow.push({ o: g, t0: growT + 0.1 }); }
    });
    const nd = S.nextDish(G), gi = G.menu.length;
    if (ghostMk) { dropMk(ghostMk); ghostMk = null; }
    if (nd && gi < L.maxStations) {
      const g = new THREE.Group(); g.position.set(L.stationX(gi), 0, L.stZ); stationGroup.add(g);
      const m = new THREE.Mesh(new THREE.BoxGeometry(1.4, H.counter, 0.8), new THREE.MeshStandardMaterial({ color: '#ffffff', transparent: true, opacity: 0.28, depthWrite: false }));
      m.position.y = H.counter / 2; g.add(m);
      hitBox(1.4, 1.4, 1.0, L.stationX(gi), 0, L.stZ, 'next', stationGroup);
      ghostMk = markers.add({ x: L.stationX(gi), y: 1.5, z: L.stZ, cls: 'mk inmk ghost', html: `<span class="gh">${ICON('ui-lock')}${ICON(nd.icon)}</span><em>Next cook</em>`, onTap: () => game.ui.setTab('kitchen') });
    }
    stationKey = G.menu.join() + '|' + G.stage;
  }
  const stationOf = (dish) => builtStations.find((s) => s.dish === dish) || builtStations[0];

  // ---------- people ----------
  const pool = new Map(); // char id → [free chars] (customers only: the staff wear hats)
  const eatClips = new Map();
  function addEat(c) {
    const sit = c.actions.sit?.getClip(), eat = c.actions['interact-right']?.getClip();
    if (!sit || !eat) return;
    if (!eatClips.has(c.id)) {
      const arms = new Set(eat.tracks.filter((t) => /arm|hand/i.test(t.name)).map((t) => t.name));
      eatClips.set(c.id, new THREE.AnimationClip('sit-eat', eat.duration, [...sit.tracks.filter((t) => !arms.has(t.name)), ...eat.tracks.filter((t) => arms.has(t.name))]));
    }
    c.actions['sit-eat'] = c.mixer.clipAction(eatClips.get(c.id));
  }
  function getChar(id, cb, reuse = true) {
    const free = reuse && pool.get(id);
    if (free?.length) { const c = free.pop(); c.obj.visible = true; actors.add(c.obj); cb(c); return; }
    makeChar(id).then((c) => {
      c.obj.scale.setScalar(CH); c.id = id; c.reuse = reuse;
      c.obj.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = false; } });
      addEat(c);
      actors.add(c.obj); cb(c);
    }).catch(() => {});
  }
  function freeChar(c) {
    if (!c) return;
    c.obj.removeFromParent(); c.obj.visible = false;
    if (!c.reuse) return;
    if (!pool.has(c.id)) pool.set(c.id, []);
    pool.get(c.id).push(c);
  }
  function dropMk(m) { if (!m) return; m.el.remove(); const i = markers.list.indexOf(m); if (i >= 0) markers.list.splice(i, 1); }
  // a walker: x, z, heading; a path of [x, z] points; the char follows when loaded
  function step(v, dt, speed) {
    let s = speed * dt;
    while (v.path.length && s > 1e-6) {
      const [tx, tz] = v.path[0], dx = tx - v.x, dz = tz - v.z, l = Math.hypot(dx, dz);
      if (l > 0.01) v.ry = Math.atan2(dx, dz);
      if (l <= s) { v.x = tx; v.z = tz; v.path.shift(); s -= l; } else { v.x += dx / l * s; v.z += dz / l * s; s = 0; }
    }
    return !v.path.length;
  }
  function pose(v, dt, y = 0) {
    if (!v.c) return;
    const o = v.c.obj;
    o.position.set(v.x, y, v.z);
    let dh = v.ry - o.rotation.y; while (dh > Math.PI) dh -= 2 * Math.PI; while (dh < -Math.PI) dh += 2 * Math.PI;
    o.rotation.y += dh * Math.min(1, dt * 10);
    v.c.mixer.update(dt);
  }

  // customers: one per G.tables entry (and the line at the door); seats are kept while they're there
  const guests = new Map(); // table id → guest
  const queue = new Map(); // door entry id → walker
  let leaving = []; // walkers on their way out
  const seatOf = new Map(); // seat index → table id
  const spawnX = () => -L.w / 2 - 7, exitX = () => L.w / 2 + 7;
  const sideZ = () => L.walkZ + (L.terrace ? 1.0 : 0);
  function pathIn(seat) {
    const t = L.tables[L.seats[seat].t], st = L.seats[seat], wz = sideZ();
    if (t.terrace) return [[L.door.x - 0.4, wz], [L.door.x - 0.4, t.lane], [st.x, t.lane], [st.x, st.z]];
    return [[L.door.x, wz], [L.door.x, L.door.z + 0.6], [L.door.x, L.door.z - 0.6], [L.door.x - 0.2, t.lane], [st.x, t.lane], [st.x, st.z]];
  }
  function pathOut(v) {
    const wz = sideZ();
    if (v.seat == null) return [[v.x + 1.2, wz], [exitX(), wz]];
    const t = L.tables[L.seats[v.seat].t], st = L.seats[v.seat];
    if (t.terrace) return [[st.x, t.lane], [st.x + 0.6, wz], [exitX(), wz]];
    return [[st.x, t.lane], [L.door.x + 0.2, t.lane], [L.door.x + 0.3, L.door.z - 0.6], [L.door.x + 0.3, L.door.z + 0.6], [L.door.x + 0.9, wz], [exitX(), wz]];
  }
  const queueSpot = (k) => [L.door.x, L.door.z + 0.9 + k * 0.75];
  function newWalker(cid, x, z) { const v = { cid, c: null, x, z, ry: 0, path: [], mk: null, gone: false }; getChar(cid, (c) => { if (v.gone) { freeChar(c); return; } v.c = c; c.play('walk'); c.obj.position.set(v.x, 0, v.z); }); return v; }
  function bubble(v, html, cls) { if (!v.mk) { v.mk = markers.add({ x: v.x, y: 2.2, z: v.z, cls: 'mk inmk ' + cls, html }); v.mk.el.style.pointerEvents = 'none'; } else { v.mk.el.className = 'marker mk inmk ' + cls; v.mk.el.innerHTML = html; } }
  function leave(v, angry) {
    if (v.plate) { v.plate.removeFromParent(); v.plate = null; }
    dropMk(v.mk); v.mk = null;
    if (angry) { bubble(v, `<span class="mad">${ICON('ui-clock')}</span>`, 'madmk'); setTimeout(() => { dropMk(v.mk); v.mk = null; }, 1600); }
    v.path = pathOut(v); v.mode = 'out'; v.c?.play('walk', 0.15);
    if (v.seat != null && seatOf.get(v.seat) === v.id) seatOf.delete(v.seat);
    leaving.push(v);
  }
  function syncGuests(snap) {
    const live = new Set();
    const fromQueue = [];
    const qLive = new Set(G.door.map((e) => e.id));
    for (const [id, v] of queue) if (!qLive.has(id)) { queue.delete(id); fromQueue.push(v); }
    for (const tb of G.tables) {
      live.add(tb.id);
      let v = guests.get(tb.id);
      if (!v) {
        let seat = L.seatOrder.find((s) => !seatOf.has(s));
        if (seat == null) seat = L.seatOrder[0];
        seatOf.set(seat, tb.id);
        const q = fromQueue.shift();
        v = q || newWalker(CHARS[(tb.id * 7) % CHARS.length], spawnX(), sideZ());
        Object.assign(v, { id: tb.id, seat, mode: 'in', served: false, plate: null, dish: tb.dish });
        v.path = pathIn(seat);
        if (q) v.path.shift(); // (from the line at the door: straight in)
        if (snap) { const st = L.seats[seat]; v.x = st.x; v.z = st.z; v.path = []; }
        v.c?.play('walk', 0.15);
        guests.set(tb.id, v);
      }
      if (tb.st === 'wait' && !v.mkOn) { v.mkOn = true; bubble(v, `<span class="ob">${ICON(S.DISH[tb.dish].icon)}<i class="pat"></i></span>`, 'order'); }
      if (tb.st === 'eat' && !v.served) { v.served = true; dropMk(v.mk); v.mk = null; v.mkOn = false; serve(v, snap); }
      if (v.mk && tb.st === 'wait') { const p = Math.min(1, (G.t - tb.t0) / S.WALK.patience); v.mk.el.style.setProperty('--p', p.toFixed(3)); v.mk.el.classList.toggle('late', p > 0.66); }
    }
    for (const [id, v] of guests) if (!live.has(id)) { guests.delete(id); leave(v, !v.served); }
    // whoever left the line without a table walked off
    for (const v of fromQueue) { v.seat = null; v.served = false; leave(v, true); }
    // the line at the door
    G.door.forEach((e, k) => {
      let v = queue.get(e.id);
      if (!v) { v = newWalker(CHARS[(e.id * 5 + 3) % CHARS.length], spawnX(), sideZ()); v.mode = 'queue'; queue.set(e.id, v); }
      const [qx, qz] = queueSpot(k);
      if (snap) { v.x = qx; v.z = qz; v.path = []; v.qk = k; }
      else if (v.qk !== k) { v.qk = k; v.path = Math.abs(v.z - sideZ()) < 0.2 ? [[qx, sideZ()], [qx, qz]] : [[qx, qz]]; }
    });
  }
  // the plate: from the pass to the table (a little arc), the dish on it
  const flying = [];
  function serve(v, snap) {
    const st = L.seats[v.seat], t = L.tables[st.t];
    const g = new THREE.Group();
    const pl = food('plate', 0.36); g.add(pl);
    const [name, size] = PLATED[v.dish] || PLATED.burger;
    const f = food(name, size); f.position.y = 0.03; g.add(f);
    if (v.dish === 'sushi') for (const k of [-1, 1]) { const s = food(name, size); s.position.set(k * 0.09, 0.03, 0.03); g.add(s); }
    const to = new THREE.Vector3(t.x + (st.side ? 0.26 : -0.26), H.table + 0.005, t.z);
    room.add(g); v.plate = g;
    if (snap) { g.position.copy(to); return; }
    const s = stationOf(v.dish), from = new THREE.Vector3(s ? s.x : 0, H.counter + 0.12, L.passZ);
    g.position.copy(from);
    flying.push({ g, from, to, t: 0 });
  }
  function fly(dt) {
    for (let i = flying.length - 1; i >= 0; i--) {
      const f = flying[i]; f.t = Math.min(1, f.t + dt / 0.55);
      f.g.position.lerpVectors(f.from, f.to, f.t); f.g.position.y += Math.sin(f.t * Math.PI) * 1.1;
      if (f.t >= 1) flying.splice(i, 1);
    }
  }
  function updateGuests(dt) {
    const sp = 2.3;
    for (const v of guests.values()) {
      if (v.mode === 'in') {
        if (step(v, dt, sp)) { v.mode = 'sit'; const st = L.seats[v.seat]; v.ry = st.ry; v.c?.play('sit', 0.2); }
        else v.c?.play('walk', 0.15);
      }
      if (v.mode === 'sit') {
        const st = L.seats[v.seat];
        v.x = st.x + (st.side ? SIT.back : -SIT.back); v.z = st.z; v.ry = st.ry;
        if (v.c) v.c.play(v.served && v.c.actions['sit-eat'] ? 'sit-eat' : 'sit', 0.25);
        pose(v, dt, H.seat + SIT.y);
      } else pose(v, dt);
      if (v.mk) v.mk.pos.set(v.x, v.mode === 'sit' ? 2.0 : 2.3, v.z);
    }
    for (const v of queue.values()) {
      const done = step(v, dt, sp);
      if (done) { v.ry = Math.PI; v.c?.play('idle', 0.2); } else v.c?.play('walk', 0.15);
      pose(v, dt);
    }
    leaving = leaving.filter((v) => {
      step(v, dt, sp * 1.1); v.c?.play('walk', 0.15); pose(v, dt);
      if (v.mk) v.mk.pos.set(v.x, 2.3, v.z);
      if (v.path.length) return true;
      v.gone = true; freeChar(v.c); v.c = null; dropMk(v.mk); return false;
    });
  }

  // the kitchen staff: you and the cooks, each at the station of what they cook
  const staff = new Map(); // 'you' | cook id → walker
  function syncStaff(dt, snap) {
    const people = [['you', G.you, YOU_CHAR], ...G.cooks.map((c) => [c.id, c, c.char])];
    const live = new Set();
    const used = new Map();
    for (const [id, p, cid] of people) {
      live.add(id);
      let v = staff.get(id);
      const dish = p.job ? p.job.dish : id === 'you' ? 'burger' : p.dish;
      const s = stationOf(dish);
      const n = used.get(s) || 0; used.set(s, n + 1);
      const tx = (s ? s.x : 0) + [0, -0.5, 0.5, 0][n % 4], tz = L.laneZ + (n >= 3 ? 0.5 : 0);
      if (!v) {
        v = { id, c: null, x: tx, z: tz, ry: Math.PI, path: [], mk: null, gone: false };
        staff.set(id, v);
        getChar(cid, (c) => {
          if (v.gone) { freeChar(c); return; }
          v.c = c; c.obj.position.set(v.x, 0, v.z);
          let head = c.head; if (head) { const h = id === 'you' ? chefHat('#e2382b') : chefHat(); h.position.set(0, 0.4, 0.02); head.add(h); c.hat = h; }
          hitBox(0.5, 0.9, 0.5, 0, 0, 0, id === 'you' ? 'you' : 'cook', c.obj).userData.who = id;
        }, false);
        if (id !== 'you' && !snap && staff.size > 1) { v.x = L.door.x; v.z = L.passZ + 0.8; } // (a new cook comes in)
      }
      const at = Math.abs(v.x - tx) < 0.05 && Math.abs(v.z - tz) < 0.05;
      if (snap) { v.x = tx; v.z = tz; v.path = []; } else if (!at && (!v.path.length || v.path.at(-1)[0] !== tx)) {
        v.path = Math.abs(v.z - L.laneZ) > 0.6 ? [[v.x, L.laneZ + 0.6], [tx, L.laneZ + 0.6], [tx, tz]] : [[tx, tz]];
      }
      const done = step(v, dt, 2.6);
      if (!done) v.c?.play('walk', 0.12);
      else { v.ry = Math.PI; v.c?.play(p.job ? 'interact-right' : 'idle', 0.2); }
      pose(v, dt);
      // the ring over whoever is cooking; "tap" over you when there's an order and your hands are free
      const job = p.job;
      const can = id === 'you' && !job && S.canCook(G) === 'ok';
      if (job || can) {
        const html = job ? `<span class="cb"><i class="ring"></i>${ICON(S.DISH[job.dish].icon)}</span>` : `<span class="tapme">TAP</span>`;
        const key = job ? 'job' + job.dish : 'tap';
        if (!v.mk) { v.mk = markers.add({ x: v.x, y: 2.4, z: v.z, cls: 'mk inmk staff', html, onTap: id === 'you' ? () => game.cook() : () => game.ui.setTab('kitchen') }); v.mkKey = key; }
        else if (v.mkKey !== key) { v.mk.el.innerHTML = html; v.mkKey = key; }
        v.mk.pos.set(v.x, 2.45, v.z);
        if (job) v.mk.el.style.setProperty('--p', (1 - job.left / job.total).toFixed(3));
      } else if (v.mk) { dropMk(v.mk); v.mk = null; v.mkKey = null; }
    }
    for (const [id, v] of staff) if (!live.has(id)) { staff.delete(id); v.gone = true; freeChar(v.c); dropMk(v.mk); }
  }

  // couriers: at the pick-up shelf when in, out of the door with the bags, back in when they return
  const riders = new Map();
  function syncRiders(dt, snap) {
    let k = 0;
    const live = new Set();
    for (const c of G.couriers) {
      live.add(c.id);
      let v = riders.get(c.id);
      const home = c.st === 'idle' || c.st === 'wait';
      const spot = [L.shelf.x + (k % 3) * 0.55 - 0.2, L.shelf.z + 0.85 + Math.floor(k / 3) * 0.6];
      if (home) k++;
      if (!v) {
        v = { id: c.id, c: null, x: home ? spot[0] : spawnX(), z: home ? spot[1] : sideZ(), ry: Math.PI, path: [], mk: null, out: !home, gone: false };
        riders.set(c.id, v);
        getChar(c.char, (ch) => {
          if (v.gone) { freeChar(ch); return; }
          v.c = ch; ch.obj.position.set(v.x, 0, v.z); ch.obj.visible = !v.out;
          if (ch.head) { const h = cap(['#e8432f', '#2ec4b6', '#f2a541', '#2f6fd6', '#43b34a', '#9b5de5'][c.id % 6]); h.position.set(0, 0.36, 0.02); ch.head.add(h); }
          hitBox(0.5, 0.9, 0.5, 0, 0, 0, 'couriers', ch.obj);
        }, false);
      }
      if (snap) { v.path = []; v.out = !home; if (home) { v.x = spot[0]; v.z = spot[1]; } }
      if (home) {
        if (v.leavingNow) { v.leavingNow = false; v.path = [spot]; }
        if (v.out) { v.out = false; v.x = L.door.x + 0.8; v.z = sideZ(); v.path = [[L.door.x + 0.3, L.door.z + 0.6], [L.door.x + 0.3, L.door.z - 0.6], spot]; }
        else if (!v.path.length && (Math.abs(v.x - spot[0]) > 0.05 || Math.abs(v.z - spot[1]) > 0.05)) v.path = [spot];
        if (v.c) v.c.obj.visible = true;
        const done = step(v, dt, 2.6);
        if (done) { v.ry = Math.PI; v.c?.play(c.st === 'wait' ? 'holding-both' : 'idle', 0.2); } else v.c?.play('walk', 0.12);
      } else {
        if (!v.out && !v.leavingNow) { v.leavingNow = true; v.path = [[L.door.x + 0.3, L.door.z - 0.6], [L.door.x + 0.3, L.door.z + 0.6], [L.door.x + 0.6, sideZ()], [spawnX(), sideZ()]]; }
        if (v.leavingNow) {
          v.c?.play('walk-hold', 0.12);
          if (step(v, dt, 3.2)) { v.leavingNow = false; v.out = true; if (v.c) v.c.obj.visible = false; }
        }
      }
      pose(v, dt);
    }
    for (const [id, v] of riders) if (!live.has(id)) { riders.delete(id); v.gone = true; freeChar(v.c); }
  }
  // bags waiting on the shelf; a count of delivery orders over it
  const bags = [];
  let shelfMk = null;
  function syncBags() {
    const n = Math.min(6, S.packedN(G));
    while (bags.length < n) { const b = food('bag', 0.24); room.add(b); bags.push(b); }
    while (bags.length > n) bags.pop().removeFromParent();
    bags.forEach((b, i) => b.position.set(L.shelf.x - 0.42 + (i % 3) * 0.42, i < 3 ? 0.9 : 0.5, L.shelf.z + (i < 3 ? 0 : 0.0)));
    const open = Object.values(G.orders).filter((o) => o.st !== 'bike').length;
    if (G.couriers.length && open) {
      if (!shelfMk) shelfMk = markers.add({ x: L.shelf.x, y: 2.0, z: L.shelf.z, cls: 'mk inmk shelfmk', html: `<span class="sh">${ICON('ui-package')}<b>0</b></span>`, onTap: () => game.ui.setTab('couriers') });
      shelfMk.pos.set(L.shelf.x, 2.0, L.shelf.z);
      const b = shelfMk.el.querySelector('b'); if (b.textContent !== String(open)) b.textContent = open;
    } else if (shelfMk) { dropMk(shelfMk); shelfMk = null; }
  }

  // ---------- camera: fits the room; drag to look around, pinch / wheel to zoom ----------
  const cam = { x: 0, z: 0, dist: 40, tdist: 40, fitD: 40, tx: 0, tz: 0, fx: 0, fz: 0 };
  const v3 = new THREE.Vector3();
  function place(c, x, z, dist) {
    const h = Math.sin(PITCH) * dist, r = Math.cos(PITCH) * dist;
    c.position.set(x + Math.sin(YAW) * r, h + 0.6, z + Math.cos(YAW) * r);
    c.lookAt(x, 0.6, z);
    c.updateMatrixWorld(); c.updateProjectionMatrix();
  }
  function fit(reset) {
    if (!L) return;
    const B = L.box;
    const pts = []; for (const x of [B.x0, B.x1]) for (const z of [B.z0, B.z1]) for (const y of [0, H.wall]) pts.push([x, y, z]);
    const probe = camera.clone(); probe.clearViewOffset(); probe.aspect = innerWidth / innerHeight; probe.updateProjectionMatrix();
    // the room as big as fits between the top bar and the tab bar, its picture centred (the camera looks at it from
    // the side, so the middle of the room isn't the middle of its picture)
    let cx = (B.x0 + B.x1) / 2, cz = (B.z0 + B.z1) / 2, hi = 300;
    const range = (d) => { place(probe, cx, cz, d); let x0 = 9, x1 = -9, y0 = 9, y1 = -9; for (const [x, y, z] of pts) { v3.set(x, y, z).project(probe); x0 = Math.min(x0, v3.x); x1 = Math.max(x1, v3.x); y0 = Math.min(y0, v3.y); y1 = Math.max(y1, v3.y); } return [x0, x1, y0, y1]; };
    const fits = (d) => { const [x0, x1, y0, y1] = range(d); return x0 > -0.97 && x1 < 0.97 && y0 > -0.6 && y1 < 0.62; };
    const tanV = Math.tan(THREE.MathUtils.degToRad(FOV) / 2);
    for (let it = 0; it < 3; it++) {
      let lo = 5; hi = 300; for (let i = 0; i < 24; i++) { const m = (lo + hi) / 2; if (fits(m)) hi = m; else lo = m; }
      const [x0, x1, y0, y1] = range(hi), mx = (x0 + x1) / 2, my = (y0 + y1) / 2 - 0.01;
      const kx = hi * tanV * probe.aspect * 0.9, ky = hi * tanV / Math.sin(PITCH) * 0.9;
      cx += Math.cos(YAW) * mx * kx - Math.sin(YAW) * my * ky; cz += -Math.sin(YAW) * mx * kx - Math.cos(YAW) * my * ky;
    }
    cam.fitD = hi; cam.fx = cx; cam.fz = cz;
    // (a big room on a phone: start closer and let the player look around)
    const px = innerWidth / (2 * hi * Math.tan(THREE.MathUtils.degToRad(FOV) / 2) * (innerWidth / innerHeight));
    const close = px < 26 ? hi * px / 26 : hi;
    if (reset) { cam.tx = cam.x = cx; cam.tz = cam.z = cz; cam.tdist = cam.dist = close; }
    cam.tdist = Math.min(cam.tdist, hi);
  }
  function clampCam() {
    const B = L.box, k = 1 - cam.tdist / cam.fitD; // (zoomed out all the way: no room to move)
    const hx = (B.x1 - B.x0) / 2 * k, hz = (B.z1 - B.z0) / 2 * k;
    cam.tx = THREE.MathUtils.clamp(cam.tx, cam.fx - hx - 0.01, cam.fx + hx + 0.01); cam.tz = THREE.MathUtils.clamp(cam.tz, cam.fz - hz - 0.01, cam.fz + hz + 0.01);
  }
  const ptrs = new Map();
  let drag = null, pinch0 = 0, d0 = 0;
  canvas.addEventListener('pointerdown', (e) => {
    if (!active) return;
    ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (ptrs.size === 1) drag = { x: e.clientX, y: e.clientY, tx: cam.tx, tz: cam.tz, moved: 0, t: performance.now() };
    if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; pinch0 = Math.hypot(a.x - b.x, a.y - b.y); d0 = cam.tdist; drag = null; }
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!active || !ptrs.has(e.pointerId)) return;
    ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (ptrs.size === 2 && pinch0) { const [a, b] = [...ptrs.values()]; cam.tdist = THREE.MathUtils.clamp(d0 * pinch0 / Math.max(20, Math.hypot(a.x - b.x, a.y - b.y)), cam.fitD * 0.4, cam.fitD); clampCam(); return; }
    if (!drag) return;
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y; drag.moved = Math.max(drag.moved, Math.hypot(dx, dy));
    const k = 2 * cam.dist * Math.tan(THREE.MathUtils.degToRad(FOV) / 2) / innerHeight;
    cam.tx = drag.tx - (dx * Math.cos(YAW) + dy * Math.sin(YAW) / Math.sin(PITCH)) * k;
    cam.tz = drag.tz - (-dx * Math.sin(YAW) + dy * Math.cos(YAW) / Math.sin(PITCH)) * k;
    clampCam(); cam.x = cam.tx; cam.z = cam.tz;
  });
  const up = (e) => {
    if (!ptrs.has(e.pointerId)) return;
    ptrs.delete(e.pointerId);
    if (ptrs.size < 2) pinch0 = 0;
    if (drag && e.type === 'pointerup' && drag.moved < 10 && performance.now() - drag.t < 600) tap(e.clientX, e.clientY);
    if (!ptrs.size) drag = null;
  };
  canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up);
  canvas.addEventListener('wheel', (e) => { if (!active) return; e.preventDefault(); cam.tdist = THREE.MathUtils.clamp(cam.tdist * Math.exp(e.deltaY * 0.0012), cam.fitD * 0.4, cam.fitD); clampCam(); }, { passive: false });
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  function hitAt(cx, cy) {
    const r = canvas.getBoundingClientRect();
    ndc.set((cx - r.left) / r.width * 2 - 1, -(cy - r.top) / r.height * 2 + 1);
    ray.setFromCamera(ndc, camera);
    for (let i = pick.length - 1; i >= 0; i--) { let o = pick[i]; while (o && o !== scene) o = o.parent; if (!o) pick.splice(i, 1); }
    const hits = ray.intersectObjects(pick, false);
    // (people before the room behind them)
    const order = { you: 0, cook: 1, couriers: 2, next: 3, kitchen: 4 };
    hits.sort((a, b) => (order[a.object.userData.pick] - order[b.object.userData.pick]) || a.distance - b.distance);
    return hits[0]?.object || null;
  }
  function tap(cx, cy) {
    const o = hitAt(cx, cy); if (!o) return;
    const what = o.userData.pick;
    if (what === 'you' || what === 'kitchen') game.cook();
    else if (what === 'cook' || what === 'next') game.ui.setTab('kitchen');
    else if (what === 'couriers') game.ui.setTab('couriers');
  }

  // ---------- pops ("+$4" over a table) ----------
  function pop(x, y, z, text, cls) {
    if (document.hidden) return;
    const m = markers.add({ x, y, z, cls: `mk paypop ${cls}`, html: `<b>${text}</b>` });
    m.el.style.pointerEvents = 'none';
    setTimeout(() => dropMk(m), 1100);
  }
  function event(e) {
    if (e.kind === 'served') {
      const v = guests.get(e.table);
      if (v) pop(v.x, 2.2, v.z, `+${S.money(e.amount)}`, 'cash');
    } else if (e.kind === 'lostWalk' && (e.full || e.door)) pop(L.door.x, 2.2, L.door.z + 0.8, 'No table!', 'lost');
    else if (e.kind === 'lostWalk' && e.table != null) { const v = guests.get(e.table); if (v) pop(v.x, 2.2, v.z, 'Left hungry', 'lost'); }
    else if (e.kind === 'paid') pop(L.door.x + 1.2, 2.0, L.door.z + 1.0, `+${S.money(e.amount)}`, e.tip >= S.DELIV.tip ? 'tip' : 'cash');
    else if (e.kind === 'stall') pop(L.door.x + 1.2, 2.2, L.door.z + 1.4, 'Won\'t start!', 'stall');
    else if (e.kind === 'lostOrder') pop(L.shelf.x, 2.2, L.shelf.z, 'Cancelled', 'lost');
  }

  // ---------- each frame ----------
  let stageNow = -1;
  function build(stage, popIn = false) {
    // everyone is put back in place after a rebuild (the tables moved)
    for (const v of [...guests.values(), ...queue.values(), ...leaving]) { v.gone = true; freeChar(v.c); dropMk(v.mk); if (v.plate) v.plate.removeFromParent(); }
    guests.clear(); queue.clear(); leaving = []; seatOf.clear();
    for (const f of flying) f.g.removeFromParent(); flying.length = 0;
    stageNow = stage;
    buildRoom(stage, popIn);
    snapAll();
  }
  function snapAll() { syncGuests(true); syncStaff(0, true); syncRiders(0, true); }
  function update(dt, w, h) {
    if (G.stage !== stageNow) build(G.stage, true);
    if (stationKey !== G.menu.join() + '|' + G.stage) buildStations(true);
    syncGuests(false); updateGuests(dt);
    syncStaff(dt, false); syncRiders(dt, false); syncBags(); fly(dt);
    if (grow.length) {
      growT += dt;
      for (const p of grow) { const t = THREE.MathUtils.clamp((growT - p.t0) / 0.45, 0, 1); const e = t < 1 ? 1 - Math.pow(1 - t, 3) + Math.sin(t * Math.PI) * 0.15 : 1; p.o.scale.setScalar(Math.max(0.001, e)); }
      if (grow.every((p) => growT - p.t0 > 0.45)) grow.length = 0;
    }
    const k = 1 - Math.exp(-dt * 10);
    cam.x += (cam.tx - cam.x) * k; cam.z += (cam.tz - cam.z) * k; cam.dist += (cam.tdist - cam.dist) * k;
    place(camera, cam.x, cam.z, cam.dist);
    if (active) markers.update(w, h);
  }
  function resize(w, h) { camera.aspect = w / h; camera.updateProjectionMatrix(); fit(false); }
  function setActive(on) { active = on; markerEl.hidden = !on; if (!on) { ptrs.clear(); drag = null; } }

  build(G.stage);
  return {
    scene, camera, markers, update, resize, setActive, event, snap: snapAll, build, fit: () => fit(true),
    get layout() { return L; },
    look: (x, z, d) => { cam.tx = cam.x = x; cam.tz = cam.z = z; cam.tdist = cam.dist = d; },
    // (for the tests: where things are)
    peek: () => ({ guests: [...guests.values()].map((v) => ({ id: v.id, mode: v.mode, seat: v.seat, served: v.served, c: !!v.c, x: +v.x.toFixed(2), z: +v.z.toFixed(2), ox: v.c ? +v.c.obj.position.x.toFixed(2) : null, oz: v.c ? +v.c.obj.position.z.toFixed(2) : null, vis: v.c ? v.c.obj.visible && !!v.c.obj.parent : null, plate: v.plate ? [+v.plate.position.x.toFixed(2), +v.plate.position.z.toFixed(2), !!v.plate.parent] : null })), staff: [...staff.values()].map((v) => ({ id: v.id, x: v.x, z: v.z, c: !!v.c })),
      riders: [...riders.values()].map((v) => ({ id: v.id, out: v.out })), stations: builtStations.map((s) => s.dish), tables: L.tables.length, queue: queue.size, leaving: leaving.length }),
    screenOf: (x, y, z) => { v3.set(x, y, z).project(camera); return [(v3.x + 1) / 2 * innerWidth, (1 - v3.y) / 2 * innerHeight]; },
  };
}

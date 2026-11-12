// Ferdi's (idle4.html): the building, seen from above at an angle (an orthographic, isometric camera), cut away so every
// room shows: floors and walls per room and level (in ruins at level 0: planks, crates, dust), the furniture the room
// has bought, the street in front. Everyone in it follows the rules (sim.js) exactly: customers and staff stand at
// their spots or walk the routes of the floor plan (plan.js) at the times the sim gives. Rooms carry a label with their
// name, level badge and a green arrow when something in them is affordable; a tap on a room opens it (ui.js).
import * as THREE from 'three';
import { makeChar, loadKit, getNode } from '../assets.js';
import { createMarkers } from '../hub.js';
import * as S from './sim.js';
import * as P from './plan.js';

const YAW = Math.PI / 4, ELEV = 0.76; // (looking from the front right, 44° down)
const CH = 2.0; // character scale (Kenney mini characters, 0.8 tall → 1.6 m)
const WALL = { in: 1.5, back: 2.7, low: 0.55, t: 0.3 };
const H = { counter: 0.7, table: 0.55, seat: 0.27 };
// furniture kits → metres here: KayKit's (1 unit = a seat's height, about half a metre for these characters), the
// kitchen's appliances a size up (KST), Kenney's Furniture Kit (small units, its origin in a corner)
const KK = 0.55, KST = 0.63, KN = 2.3;
const SIT = { y: 0.06, back: 0.06 };
const CHARS = ['female-a', 'male-b', 'female-c', 'male-d', 'female-e', 'male-f', 'female-b', 'male-a', 'female-d', 'male-e', 'female-f', 'male-c'];
const YOU_CHAR = 'male-c';
const PLATED = { burger: ['burger', 0.24], hotdog: ['hot-dog', 0.3], doner: ['sandwich', 0.26], pizza: ['pizza', 0.34], noodle: ['bowl-broth', 0.26],
  fish: ['fish', 0.24], sushi: ['maki-salmon', 0.1], icecream: ['sundae', 0.2] };
const ART = (n) => `assets/story/${n}.webp`;

// ---------------------------------------------------------------- the look of each room per level (0: in ruins)
// floor: a pattern key; wall: [upper, lower, trim] on the room's side of its walls
const RUIN = { floor: 'dust', wall: ['#d8cfbf', '#a59a88', '#857a6a'] };
const STYLE = {
  entrance: [RUIN, { floor: 'tiles:#dcd6c8:#c4bcab', wall: ['#efe4cf', '#a8957a', '#7a6a55'] }, { floor: 'checker:#f4ecdc:#38455c', wall: ['#f6e7cb', '#c4480f', '#7a2a00'] },
    { floor: 'checker:#f4ecdc:#38455c', wall: ['#f6e7cb', '#c4480f', '#ffcf3f'] }, { floor: 'marble:#f2ede4', wall: ['#fbf0dc', '#7a2232', '#d4a640'] }, { floor: 'marble:#f2ede4', wall: ['#fbf0dc', '#5a1828', '#e8bd4f'] }],
  dining: [RUIN, { floor: 'planks:#a3876b:worn', wall: ['#e9dcc3', '#9c7e5c', '#6f5640'] }, { floor: 'checker:#f6ecd8:#c4482f', wall: ['#f6e3c2', '#c4480f', '#7a2a00'] },
    { floor: 'planks:#c08a55', wall: ['#f8e8c8', '#2f6f5b', '#d4a640'] }, { floor: 'checker:#f4ead6:#2f3a4a', wall: ['#fbefd8', '#6a2e1f', '#d4a640'] }, { floor: 'marble:#efe6d6', wall: ['#fdf3e0', '#5a1f2c', '#e8bd4f'] }],
  kitchen: [RUIN, { floor: 'tiles:#b9b6ad:#9d998f', wall: ['#e2ddd2', '#b9b2a5', '#8d867a'] }, { floor: 'tiles:#e9e9e4:#c9cbc8', wall: ['#f7f7f2', '#d8dde0', '#9aa4ab'] },
    { floor: 'tiles:#dfe9ef:#9fb7c6', wall: ['#ffffff', '#cfe0ea', '#3f7fa8'] }, { floor: 'tiles:#f2f2ee:#d14a3a', wall: ['#ffffff', '#e8e8e8', '#c4482f'] }, { floor: 'tiles:#f4f4f0:#2f3a4a', wall: ['#ffffff', '#e8e4dc', '#d4a640'] }],
  cashier: [RUIN, { floor: 'planks:#b58f68', wall: ['#ece0c8', '#8f7a60', '#6a5640'] }, { floor: 'tiles:#d6efe9:#9fd2c6', wall: ['#f2efe2', '#2ec4b6', '#167f75'] },
    { floor: 'tiles:#d6efe9:#9fd2c6', wall: ['#f2efe2', '#167f75', '#ffcf3f'] }, { floor: 'marble:#eef0ea', wall: ['#fbf6e8', '#1f5f59', '#d4a640'] }, { floor: 'marble:#eef0ea', wall: ['#fbf6e8', '#164a46', '#e8bd4f'] }],
  office: [RUIN, { floor: 'carpet:#5f7a52', wall: ['#e6dcc4', '#7d6447', '#5d4733'] }, { floor: 'planks:#9c6b43', wall: ['#efe2c6', '#6e4b2e', '#d4a640'] },
    { floor: 'carpet:#7a2f2f', wall: ['#f3e6c8', '#4e3424', '#d4a640'] }, { floor: 'carpet:#2f3f6a', wall: ['#f6ead0', '#2f2a3a', '#e8bd4f'] }, { floor: 'carpet:#5a1f3a', wall: ['#f8eed6', '#2a1f2a', '#f0c75a'] }],
  terrace: [{ floor: 'rubble', wall: RUIN.wall }, { floor: 'pavers:#cfc6b3', wall: ['#e8dcc4', '#a08a6c', '#7a6a55'] }, { floor: 'deck:#b07f52', wall: ['#f1e2c4', '#b4532d', '#7a2a00'] },
    { floor: 'deck:#b07f52', wall: ['#f1e2c4', '#2f6f5b', '#d4a640'] }, { floor: 'deck:#9a6a42', wall: ['#f6e8cc', '#6a2e1f', '#d4a640'] }, { floor: 'deck:#9a6a42', wall: ['#f8ecd2', '#5a1f2c', '#e8bd4f'] }],
  bay: [{ floor: 'dust', wall: RUIN.wall }], staff: [{ floor: 'dust', wall: RUIN.wall }],
};
const styleOf = (room, lv) => { const s = STYLE[room]; return s[Math.min(lv, s.length - 1)]; };
const FACADE = ['#c98c63', '#a76445', '#6e3b28']; // (brick: the outside of the building)

// ---------------------------------------------------------------- little builders
const mats = new Map();
function M(color, o = {}) {
  const k = color + JSON.stringify(o);
  if (!mats.has(k)) mats.set(k, new THREE.MeshStandardMaterial({ color, roughness: 0.82, ...o }));
  return mats.get(k);
}
const geos = new Map();
const boxGeo = (w, h, d) => { const k = `b${w},${h},${d}`; if (!geos.has(k)) geos.set(k, new THREE.BoxGeometry(w, h, d)); return geos.get(k); };
const cylGeo = (a, b, h, s) => { const k = `c${a},${b},${h},${s}`; if (!geos.has(k)) geos.set(k, new THREE.CylinderGeometry(a, b, h, s)); return geos.get(k); };
function box(w, h, d, mat, x, y, z, parent, cast = true) {
  const m = new THREE.Mesh(boxGeo(w, h, d), mat);
  m.position.set(x, y + h / 2, z); m.castShadow = cast; m.receiveShadow = true; parent.add(m); return m;
}
function cyl(r0, r1, h, mat, x, y, z, parent, seg = 14) {
  const m = new THREE.Mesh(cylGeo(r0, r1, h, seg), mat);
  m.position.set(x, y + h / 2, z); m.castShadow = true; m.receiveShadow = true; parent.add(m); return m;
}
function ball(r, mat, x, y, z, parent, sx = 1, sy = 1, sz = 1) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(r, 12, 9), mat);
  m.position.set(x, y, z); m.scale.set(sx, sy, sz); m.castShadow = true; parent.add(m); return m;
}
function canvasTex(w, h, draw, repeat) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); }
  return t;
}
const imgTex = new Map();
function artTexture(name) {
  if (!imgTex.has(name)) { const t = new THREE.TextureLoader().load(ART(name)); t.colorSpace = THREE.SRGBColorSpace; imgTex.set(name, t); }
  return imgTex.get(name);
}
const foodBox = new Map();
function food(name, size) {
  const src = getNode('food', name);
  if (!src) return new THREE.Group();
  if (!foodBox.has(name)) { const b = new THREE.Box3().setFromObject(src), s = b.getSize(new THREE.Vector3()); foodBox.set(name, Math.max(s.x, s.z) || 1); }
  const n = src.clone(true);
  n.position.set(0, 0, 0); n.rotation.set(0, 0, 0); n.scale.multiplyScalar(size / foodBox.get(name));
  n.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; o.userData.keep = true; } });
  const g = new THREE.Group(); g.add(n); return g;
}
// a piece of a furniture kit ('rbits', 'fbits': KayKit; 'furniture': Kenney), centred on its footprint, scaled (a
// number or [x, y, z]) and turned (ry; KayKit pieces face +z)
const pieceMid = new Map();
function piece(kit, name, s, ry = 0) {
  const g = new THREE.Group(), src = getNode(kit, name);
  if (!src) return g;
  if (!pieceMid.has(kit + name)) { src.updateMatrixWorld(true); const b = new THREE.Box3().setFromObject(src); pieceMid.set(kit + name, [-(b.min.x + b.max.x) / 2, -(b.min.z + b.max.z) / 2]); }
  const n = src.clone(true);
  if (kit === 'furniture') { const [ox, oz] = pieceMid.get(kit + name); n.position.set(ox, 0, oz); }
  n.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  g.add(n);
  if (Array.isArray(s)) g.scale.set(s[0], s[1], s[2]); else g.scale.setScalar(s);
  g.rotation.y = ry;
  return g;
}
function plated(dish) {
  const g = new THREE.Group();
  g.add(food('plate', 0.34));
  const [name, size] = PLATED[dish] || PLATED.burger;
  const f = food(name, size); f.position.y = 0.03; g.add(f);
  if (dish === 'sushi') for (const k of [-1, 1]) { const s = food(name, size); s.position.set(k * 0.09, 0.03, 0.03); g.add(s); }
  return g;
}
function hat(kind, color) {
  const g = new THREE.Group();
  if (kind === 'chef') {
    const w = M('#ffffff', { roughness: 0.95 });
    const c = new THREE.Mesh(cylGeo(0.16, 0.17, 0.13, 16), w); c.position.y = 0.065;
    const p = new THREE.Mesh(new THREE.SphereGeometry(0.2, 16, 10), w); p.scale.set(1, 0.72, 1); p.position.y = 0.19;
    g.add(c, p);
    if (color) { const b = new THREE.Mesh(cylGeo(0.172, 0.176, 0.05, 16), M(color)); b.position.y = 0.03; g.add(b); }
  } else {
    const m = M(color, { roughness: 0.6 });
    const dome = new THREE.Mesh(new THREE.SphereGeometry(0.235, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), m); dome.scale.y = kind === 'hard' ? 0.8 : 0.62;
    const brim = new THREE.Mesh(boxGeo(0.3, 0.025, 0.2), m); brim.position.set(0, 0.01, 0.2);
    g.add(dome, brim);
  }
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}

// ---------------------------------------------------------------- floor patterns
const floorCache = new Map();
function floorMat(key, w, d) {
  const [kind, a, b] = key.split(':');
  const ts = { tiles: 1.2, checker: 1.6, planks: 2.4, carpet: 3, marble: 3, deck: 2.4, pavers: 2, dust: 4, rubble: 4 }[kind] || 2;
  const ck = key;
  if (!floorCache.has(ck)) {
    const tex = canvasTex(128, 128, (g, W, Hh) => {
      if (kind === 'tiles') { g.fillStyle = b; g.fillRect(0, 0, W, Hh); g.fillStyle = a; for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) g.fillRect(x * 32 + 2, y * 32 + 2, 28, 28); }
      else if (kind === 'checker') { g.fillStyle = a; g.fillRect(0, 0, W, Hh); g.fillStyle = b; g.fillRect(0, 0, 64, 64); g.fillRect(64, 64, 64, 64); }
      else if (kind === 'planks' || kind === 'deck') {
        const base = new THREE.Color(a);
        for (let i = 0; i < 6; i++) {
          const c = base.clone().offsetHSL(0, 0, ((i * 37) % 7 - 3) * 0.012);
          g.fillStyle = '#' + c.getHexString(); g.fillRect(0, i * 21.33, W, 21.33);
          g.fillStyle = 'rgba(60,35,15,.35)'; g.fillRect(0, i * 21.33 + 20, W, 1.5); g.fillRect((i * 53) % W, i * 21.33, 1.5, 21.33);
        }
        if (b === 'worn') for (let i = 0; i < 7; i++) { g.fillStyle = 'rgba(60,40,25,.18)'; g.beginPath(); g.ellipse((i * 41) % W, (i * 67) % Hh, 14 + i * 2, 8 + i, i, 0, 7); g.fill(); }
        if (kind === 'deck') { g.fillStyle = 'rgba(0,0,0,.25)'; for (let i = 0; i < 6; i++) g.fillRect(0, i * 21.33 + 19, W, 3); }
      } else if (kind === 'carpet') {
        g.fillStyle = a; g.fillRect(0, 0, W, Hh);
        for (let i = 0; i < 900; i++) { g.fillStyle = `rgba(${i % 2 ? '255,255,255' : '0,0,0'},.05)`; g.fillRect((i * 73) % W, (i * 131) % Hh, 2, 2); }
        g.strokeStyle = 'rgba(255,220,140,.25)'; g.lineWidth = 3; g.strokeRect(8, 8, W - 16, Hh - 16);
      } else if (kind === 'marble') {
        g.fillStyle = a; g.fillRect(0, 0, W, Hh);
        g.strokeStyle = 'rgba(120,110,100,.18)'; g.lineWidth = 1.5;
        for (let i = 0; i < 6; i++) { g.beginPath(); g.moveTo((i * 29) % W, 0); g.bezierCurveTo(40 + i * 9, 40, 90 - i * 7, 80, (i * 47) % W, Hh); g.stroke(); }
        g.fillStyle = 'rgba(0,0,0,.08)'; g.fillRect(0, 63, W, 2); g.fillRect(63, 0, 2, Hh);
      } else if (kind === 'pavers') {
        g.fillStyle = '#9e9584'; g.fillRect(0, 0, W, Hh);
        for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) { const c = new THREE.Color(a).offsetHSL(0, 0, (((x + y * 3) * 17) % 5 - 2) * 0.015); g.fillStyle = '#' + c.getHexString(); g.fillRect(x * 32 + (y % 2) * 16 + 2, y * 32 + 2, 28, 28); }
      } else { // dust / rubble: concrete, cracks, dirt
        g.fillStyle = kind === 'rubble' ? '#a59d8c' : '#b4aa98'; g.fillRect(0, 0, W, Hh);
        for (let i = 0; i < 14; i++) { g.fillStyle = `rgba(80,65,50,${0.06 + (i % 4) * 0.03})`; g.beginPath(); g.ellipse((i * 47) % W, (i * 83) % Hh, 10 + (i % 5) * 5, 6 + (i % 3) * 4, i, 0, 7); g.fill(); }
        g.strokeStyle = 'rgba(60,50,40,.45)'; g.lineWidth = 1.2;
        for (let i = 0; i < 4; i++) { g.beginPath(); let x = (i * 37) % W, y = (i * 59) % Hh; g.moveTo(x, y); for (let k = 0; k < 5; k++) { x += ((k * 13 + i * 7) % 21) - 10; y += 9; g.lineTo(x, y); } g.stroke(); }
        if (kind === 'rubble') for (let i = 0; i < 10; i++) { g.fillStyle = '#5f8a3f'; g.fillRect((i * 29) % W, (i * 71) % Hh, 4, 3); }
      }
    });
    floorCache.set(ck, { tex, ts });
  }
  const { tex, ts: t } = floorCache.get(ck);
  const tx = tex.clone(); tx.needsUpdate = true; tx.repeat.set(w / t, d / t);
  return new THREE.MeshStandardMaterial({ map: tx, roughness: kind === 'marble' ? 0.45 : 0.8 });
}
const wallCache = new Map();
function wallMat(up, low, trim, height) {
  const k = [up, low, trim, height].join();
  if (!wallCache.has(k)) {
    const f = Math.min(0.62, 0.95 / height); // (the lower band is about knee to hip high, whatever the wall's height)
    const tex = canvasTex(8, 128, (g, W, Hh) => {
      g.fillStyle = up; g.fillRect(0, 0, W, Hh);
      g.fillStyle = low; g.fillRect(0, Hh * (1 - f), W, Hh * f);
      g.fillStyle = trim; g.fillRect(0, Hh * (1 - f) - 5, W, 5);
    });
    wallCache.set(k, new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9 }));
  }
  return wallCache.get(k);
}

// ---------------------------------------------------------------- walls from the floor plan
// Walk every room edge on a half-metre grid, note the room on each side; doors cut gaps, the pass is a counter.
// → [{ x0, z0, x1, z1, axis, neg, pos, kind: 'wall' | 'pass' }] (neg / pos: the room on the low / high side, null outside)
function roomAt(x, z) { for (const id in P.ROOMS) { if (id === 'street') continue; const r = P.ROOMS[id]; if (x > r.x0 && x < r.x1 && z > r.z0 && z < r.z1) return id; } return null; }
function wallSegments() {
  const segs = [];
  const lines = { z: new Set(), x: new Set() };
  for (const id in P.ROOMS) { if (id === 'street') continue; const r = P.ROOMS[id]; lines.z.add(r.z0); lines.z.add(r.z1); lines.x.add(r.x0); lines.x.add(r.x1); }
  const U = 0.5;
  const doorAt = (axis, c, u) => P.DOORS.some((d) => d.axis === axis && Math.abs((axis === 'z' ? d.z : d.x) - c) < 1e-6 && Math.abs((axis === 'z' ? d.x : d.z) - u) < d.w / 2);
  for (const axis of ['z', 'x']) {
    for (const c of lines[axis]) {
      let run = null;
      const flush = () => { if (run) segs.push(run); run = null; };
      for (let u = -1; u < 45; u += U) {
        const m = u + U / 2;
        const neg = axis === 'z' ? roomAt(m, c - 0.25) : roomAt(c - 0.25, m), pos = axis === 'z' ? roomAt(m, c + 0.25) : roomAt(c + 0.25, m);
        if (neg === pos || doorAt(axis, c, m)) { flush(); continue; }
        const kind = axis === 'z' && c === P.PASS.z && m > P.PASS.x0 && m < P.PASS.x1 ? 'pass' : 'wall';
        if (run && run.neg === neg && run.pos === pos && run.kind === kind) { run.u1 = u + U; continue; }
        flush(); run = { axis, c, u0: u, u1: u + U, neg, pos, kind };
      }
      flush();
    }
  }
  return segs;
}

// ---------------------------------------------------------------- the view
export async function createWorld(game, markerEl) {
  const G = () => game.G;
  await Promise.all([loadKit('food'), loadKit('suburban'), loadKit('roads'), loadKit('rbits'), loadKit('fbits'), loadKit('furniture')]);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#9cc3d3');
  const camera = new THREE.OrthographicCamera(-10, 10, 10, -10, 1, 300);
  const hemi = new THREE.HemisphereLight('#fff6ea', '#9a8a76', 1.7); scene.add(hemi);
  const sun = new THREE.DirectionalLight('#fff0d8', 2.4);
  sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.03;
  sun.position.set(30, 34, 30); sun.target.position.set(14, 0, 11);
  Object.assign(sun.shadow.camera, { left: -26, right: 26, top: 26, bottom: -26, near: 1, far: 100 });
  scene.add(sun, sun.target);
  const markers = createMarkers(markerEl, camera);
  const outside = new THREE.Group(); scene.add(outside);
  const wallsG = new THREE.Group(); scene.add(wallsG);
  const roomsG = new THREE.Group(); scene.add(roomsG);
  const actors = new THREE.Group(); scene.add(actors);
  const dyn = new THREE.Group(); scene.add(dyn); // (plates)
  const floors = []; // pickable floor meshes (userData.room)
  const SEGS = wallSegments();

  // ---------- outside: the street, the pavement, the neighbours ----------
  function buildOutside() {
    const plane = (w, d, mat, x, z, y = 0) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat); m.rotation.x = -Math.PI / 2; m.position.set(x, y, z); m.receiveShadow = true; outside.add(m); return m; };
    plane(200, 200, M('#b9ad96'), 14, 12, -0.03);
    plane(70, 4.0, floorMat('pavers:#d9d2c3', 70, 4), 14, P.BUILDING.z1 + 2.0, -0.005);
    box(70, 0.12, 0.25, M('#a39985'), 14, -0.03, P.BUILDING.z1 + 4.0, outside, false); // the curb
    plane(70, 9, M('#5a5f68'), 14, P.BUILDING.z1 + 8.6, -0.02);
    for (let x = -20; x < 50; x += 4) box(2.2, 0.01, 0.18, M('#e8e2d4'), x, -0.015, P.BUILDING.z1 + 8.6, outside, false);
    plane(70, 4, floorMat('pavers:#d0c8b8', 70, 4), 14, P.BUILDING.z1 + 15.1, -0.005);
    // the side alley on the right
    plane(4, 30, floorMat('pavers:#c3baa8', 4, 30), P.BUILDING.x1 + 2, 9, -0.006);
    // neighbours behind and to the left (tall: they never stand between the camera and the rooms)
    const nb = (x, z, w, d, h, col) => {
      box(w, h, d, M(col), x, 0, z, outside);
      box(w + 0.3, 0.3, d + 0.3, M('#7d6f63'), x, h, z, outside);
      const win = M('#9fc3d6', { emissive: '#3c5a6a', emissiveIntensity: 0.25, roughness: 0.3 });
      for (let fy = 1.4; fy < h - 1; fy += 2.6) for (let k = -w / 2 + 1.2; k < w / 2 - 0.8; k += 2.2) { if (z < 0) box(1.1, 1.2, 0.05, win, x + k, fy, z + d / 2 + 0.01, outside, false); }
      for (let fy = 1.4; fy < h - 1; fy += 2.6) for (let k = -d / 2 + 1.2; k < d / 2 - 0.8; k += 2.2) { if (x < 0) box(0.05, 1.2, 1.1, win, x + w / 2 + 0.01, fy, z + k, outside, false); }
    };
    nb(-4.6, -5, 9, 10, 9.5, '#d9b99a'); nb(5, -5.2, 10, 10.4, 8.0, '#c7a383'); nb(16, -5, 12, 10, 10.5, '#e2c8a8'); nb(27.5, -5.3, 11, 10.6, 7.5, '#bf9b7c'); nb(38, -5, 10, 10, 9, '#d6b796');
    nb(-5, 5, 9.6, 10, 7, '#cfae8e'); nb(-5, 16, 9.6, 12, 8.5, '#dcc0a2');
    // trees and lamps along the pavement, a low wall and a dumpster in the alley
    const put = (kit, name, x, z, s, ry = 0) => { const src = getNode(kit, name); if (!src) return; const n = src.clone(true); n.position.set(x, 0, z); n.scale.multiplyScalar(s); n.rotation.y = ry; n.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } }); outside.add(n); };
    for (const x of [-6, 9, 24.5, 36]) put('suburban', 'tree-large', x, P.BUILDING.z1 + 3.4, 6.5);
    for (const x of [1.5, 17, 31]) put('roads', 'light-square', x, P.BUILDING.z1 + 3.7, 6, Math.PI);
    box(0.4, 0.6, 22, M('#b7a58c'), P.BUILDING.x1 + 4.2, 0, 11, outside);
    box(1.6, 1.2, 1.0, M('#3f6b4a', { roughness: 0.6 }), P.BUILDING.x1 + 2.2, 0, 1.4, outside);
  }

  // ---------- walls ----------
  const lvNow = (room) => (room && G().rooms[room] ? G().rooms[room].lv : 0);
  function sideMat(room, height) {
    if (!room) return wallMat(FACADE[0], FACADE[1], FACADE[2], height);
    const st = styleOf(room, lvNow(room)).wall;
    return wallMat(st[0], st[1], st[2], height);
  }
  function buildWalls() {
    for (const o of [...wallsG.children]) o.removeFromParent();
    const cap = M('#f4ecdc', { roughness: 0.7 }), passTop = M('#e6dccb', { roughness: 0.5 }), passBody = M('#a87d56');
    for (const s of SEGS) {
      const len = s.u1 - s.u0, mid = (s.u0 + s.u1) / 2;
      const outerFront = (!s.pos && s.neg) || (s.pos === 'terrace' && s.axis === 'z' && false);
      const exterior = !s.neg || !s.pos;
      const terraceSide = s.neg === 'terrace' || s.pos === 'terrace';
      let h = WALL.in;
      if (exterior) h = s.neg ? WALL.low : WALL.back; // (back / left outside walls tall, front / right ones cut low)
      if (exterior && s.neg === 'terrace') h = 0.0; // (the terrace has a fence instead)
      if (h <= 0) continue;
      const g = new THREE.Group(); wallsG.add(g);
      const at = (along, across, y, w, hh, d, mat, cast = true) => (s.axis === 'z' ? box(w, hh, d, mat, along, y, s.c + across, g, cast) : box(d, hh, w, mat, s.c + across, y, along, g, cast));
      if (s.kind === 'pass') { // a counter: the kitchen's side and top, the dining hall's side
        at(mid, 0, 0, len, H.counter, 0.42, passBody);
        at(mid, 0, H.counter, len, 0.07, 0.62, passTop);
        continue;
      }
      const t = WALL.t / 2;
      at(mid, -t / 2, 0, len, h, t, sideMat(s.neg, h));
      at(mid, t / 2, 0, len, h, t, sideMat(s.pos, h));
      at(mid, 0, h, len + 0.02, 0.1, WALL.t + 0.08, cap, false);
      if (terraceSide && !exterior && h > 1) { // windows onto the terrace
        const gl = M('#bfe3f5', { emissive: '#7fb6d6', emissiveIntensity: 0.25, roughness: 0.15, transparent: true, opacity: 0.75 });
        for (let u = s.u0 + 1.5; u < s.u1 - 1; u += 2.6) at(u, 0, 0.75, 1.4, 0.6, WALL.t + 0.04, gl, false);
      }
      void outerFront;
    }
    // door posts on every door (the street door gets a frame and an open door leaf)
    for (const d of P.DOORS) {
      if (d.a === 'bay' || d.b === 'bay' || d.a === 'staff' || d.b === 'staff') continue;
      const post = M('#7a5a40');
      const h = d.front ? 2.2 : WALL.in;
      for (const k of [-1, 1]) {
        if (d.axis === 'z') box(0.16, h, WALL.t + 0.1, post, d.x + k * d.w / 2, 0, d.z, wallsG);
        else box(WALL.t + 0.1, h, 0.16, post, d.x, 0, d.z + k * d.w / 2, wallsG);
      }
      if (d.front) {
        box(d.w + 0.3, 0.18, WALL.t + 0.1, post, d.x, h, d.z, wallsG);
        const leaf = box(0.08, 2.0, d.w * 0.9, M('#c4480f'), d.x - d.w / 2 + 0.05, 0, d.z - d.w * 0.45, wallsG); leaf.rotation.y = 0;
      }
    }
    // the shop window either side of the front door
    const glass = M('#cfe8f5', { roughness: 0.1, transparent: true, opacity: 0.35, emissive: '#9fd0ea', emissiveIntensity: 0.15 });
    const fr = M('#5b4636');
    for (const [x0, x1] of [[0.2, 2.1], [3.9, 10.8]]) {
      box(x1 - x0, 1.45, 0.05, glass, (x0 + x1) / 2, WALL.low + 0.1, P.BUILDING.z1, wallsG, false);
      box(x1 - x0, 0.08, 0.12, fr, (x0 + x1) / 2, WALL.low + 1.55, P.BUILDING.z1, wallsG);
      for (let x = x0; x <= x1 + 0.01; x += (x1 - x0) / Math.max(1, Math.round((x1 - x0) / 2.2))) box(0.08, 1.5, 0.1, fr, x, WALL.low, P.BUILDING.z1, wallsG);
    }
  }

  // ---------- rooms: floor + furniture per level and items ----------
  const roomGroups = {}; // room → { g, sig, tags }
  const pops = []; // { o, t }
  function sigOf(room) { const r = G().rooms[room]; return r.lv + '|' + Object.values(r.it).join(',') + '|' + (room === 'kitchen' ? S.menu(G()).length : ''); }
  function rebuildRoom(room, animate) {
    const R = P.ROOMS[room], old = roomGroups[room];
    const oldTags = old ? old.tags : null;
    if (old) { old.g.removeFromParent(); const i = floors.indexOf(old.floor); if (i >= 0) floors.splice(i, 1); }
    const g = new THREE.Group(); roomsG.add(g);
    const lv = lvNow(room), st = styleOf(room, lv);
    const w = R.x1 - R.x0, d = R.z1 - R.z0;
    const fl = new THREE.Mesh(new THREE.PlaneGeometry(w, d), floorMat(st.floor, w, d));
    fl.rotation.x = -Math.PI / 2; fl.position.set((R.x0 + R.x1) / 2, 0.005, (R.z0 + R.z1) / 2); fl.receiveShadow = true; fl.userData.room = room;
    g.add(fl); floors.push(fl);
    box(w, 0.14, d, M('#6f6253'), (R.x0 + R.x1) / 2, -0.14, (R.z0 + R.z1) / 2, g, false);
    const tags = new Set();
    const tag = (o, t) => { o.userData.tag = t; tags.add(t); return o; };
    FURNISH[room]?.(g, lv, G().rooms[room].it, tag);
    if (lv === 0) ruins(g, room);
    roomGroups[room] = { g, sig: sigOf(room), tags, floor: fl };
    if (animate) for (const o of g.children) if (o.userData.tag && (!oldTags || !oldTags.has(o.userData.tag))) { o.userData.s = o.scale.clone(); o.scale.setScalar(0.001); pops.push({ o, t: -Math.random() * 0.15 }); }
  }
  function popTick(dt) {
    for (let i = pops.length - 1; i >= 0; i--) {
      const p = pops[i]; p.t += dt / 0.45;
      const t = Math.max(0, Math.min(1, p.t)), e = 1 + Math.sin(t * Math.PI) * 0.25 * (1 - t) * 2 - (1 - t) * (1 - t) * 1.0;
      p.o.scale.copy(p.o.userData.s).multiplyScalar(Math.max(0.001, t < 1 ? e : 1));
      if (p.t >= 1) { p.o.scale.copy(p.o.userData.s); pops.splice(i, 1); }
    }
  }

  // furniture pieces
  // a table for two: a small square one at first, round wooden ones, then the diner's round tables (a white cloth
  // on them indoors from level 4, a candle)
  function table(lv, outdoor) {
    const g = new THREE.Group();
    if (lv <= 1) g.add(piece('fbits', 'table_small', [0.9, KK, 0.9]));
    else if (lv === 2 || (outdoor && lv === 3)) g.add(piece('rbits', 'table_round_B', [0.33, KK, 0.33]));
    else g.add(piece('rbits', 'table_round_A_small', [0.64, KK, 0.64]));
    if (lv >= 4 && !outdoor) {
      cyl(0.5, 0.5, 0.03, M('#ffffff'), 0, H.table - 0.005, 0, g, 22); cyl(0.51, 0.53, 0.15, M('#ffffff', { roughness: 0.95 }), 0, H.table - 0.15, 0, g, 22);
      cyl(0.04, 0.05, 0.16, M('#d4a640', { metalness: 0.6, roughness: 0.3 }), 0, H.table, 0, g, 8); ball(0.07, M('#e2382b'), 0, H.table + 0.2, 0, g);
    }
    if (outdoor) {
      cyl(0.025, 0.025, 2.3, M('#e8e2d4'), 0, 0, 0, g, 6);
      const pm = new THREE.Mesh(new THREE.ConeGeometry(0.95, 0.4, 10, 1, true), new THREE.MeshStandardMaterial({ side: THREE.DoubleSide, roughness: 0.8,
        map: canvasTex(128, 16, (gg, W) => { for (let k = 0; k < 10; k++) { gg.fillStyle = k % 2 ? '#fff3d6' : (lv >= 3 ? '#2f6f5b' : '#e2382b'); gg.fillRect(k * W / 10, 0, W / 10 + 1, 16); } }) }));
      pm.position.y = 2.45; pm.castShadow = true; g.add(pm);
    }
    return g;
  }
  // a chair at a table, facing it (side: -1 left of the table, 1 right); better chairs with the comfort upgrades
  const CHAIRS = [['fbits', 'chair_A_wood'], ['rbits', 'chair_B'], ['rbits', 'chair_A'], ['fbits', 'chair_C']];
  function chair(lv, side, comfy) {
    const [kit, name] = CHAIRS[Math.min(3, Math.floor(comfy / 5))];
    return piece(kit, name, KK, -side * Math.PI / 2);
  }
  // a potted plant; with flowers, a flowering bush in a pot
  function plant(g, x, z, s = 1, flowers = null) {
    let p;
    if (flowers) {
      p = new THREE.Group();
      cyl(0.2 * s, 0.16 * s, 0.4 * s, M('#c46a3f'), 0, 0, 0, p, 10);
      ball(0.36 * s, M('#3f8a3a'), 0, 0.72 * s, 0, p, 1, 1.25, 1);
      for (let i = 0; i < 5; i++) ball(0.07 * s, M(flowers), Math.cos(i * 1.3) * 0.22 * s, 0.85 * s + (i % 2) * 0.12 * s, Math.sin(i * 1.3) * 0.22 * s, p);
    } else p = piece('furniture', 'pottedPlant', KN * s, x * 0.7);
    p.position.set(x, 0, z); g.add(p);
    return p;
  }
  // a box left lying about: a cardboard box (open or shut) or a crate with its lid
  function crate(g, x, z, s = 0.6, ry = 0, y = 0) {
    const k = Math.round(x * 3 + z * 7) % 3;
    const c = k === 2 ? piece('rbits', 'crate', s / 2, ry) : piece('furniture', k ? 'cardboardBoxOpen' : 'cardboardBoxClosed', s / 0.28, ry);
    if (k === 2) { const lid = piece('rbits', 'crate_lid', 1); lid.position.y = 0.8; c.add(lid); }
    c.position.set(x, y, z); g.add(c);
    return c;
  }
  function plank(g, x, z, len, ry, tilt = 0.1, y = 0.05) { const p = box(len, 0.06, 0.22, M('#9c7a52'), x, y, z, g); p.rotation.set(0, ry, tilt); return p; }
  function ruins(g, room) {
    const R = P.ROOMS[room], w = R.x1 - R.x0, d = R.z1 - R.z0, cx = (R.x0 + R.x1) / 2, cz = (R.z0 + R.z1) / 2;
    const rnd = (i) => ((Math.sin(i * 91.7 + cx * 7.3 + cz * 3.1) + 1) / 2);
    for (let i = 0; i < 4 + Math.floor(w * d / 18); i++) plank(g, R.x0 + 0.8 + rnd(i) * (w - 1.6), R.z0 + 0.8 + rnd(i + 50) * (d - 1.6), 1.2 + rnd(i + 9), rnd(i + 3) * 3, (rnd(i + 7) - 0.5) * 0.4);
    for (let i = 0; i < 2 + Math.floor(w * d / 30); i++) { const s = 0.45 + rnd(i + 20) * 0.35; crate(g, R.x0 + 0.9 + rnd(i + 30) * (w - 1.8), R.z0 + 0.9 + rnd(i + 40) * (d - 1.8), s, rnd(i + 11)); }
    for (let i = 0; i < 3; i++) { const m = new THREE.Mesh(new THREE.SphereGeometry(0.45, 9, 6, 0, Math.PI * 2, 0, Math.PI / 2), M('#8f8576')); m.scale.set(1.3, 0.35, 1); m.position.set(R.x0 + 1 + rnd(i + 60) * (w - 2), 0, R.z0 + 1 + rnd(i + 70) * (d - 2)); g.add(m); }
    if (R.outdoor) for (let i = 0; i < 8; i++) ball(0.18, M('#6f9a43'), R.x0 + 0.5 + rnd(i + 80) * (w - 1), 0.05, R.z0 + 0.5 + rnd(i + 90) * (d - 1), g, 1.4, 0.6, 1.2);
    // tape across the way in
    const tape = M('#f2c230', { roughness: 0.5 });
    for (const dr of P.DOORS) if (dr.a === room || dr.b === room) {
      const o = dr.a === room ? dr.b : dr.a; if (o === 'street' || (lvNow(o) === 0 && !(dr.a === 'staff' || dr.b === 'staff'))) continue;
      const t = dr.axis === 'z' ? box(dr.w + 0.1, 0.08, 0.03, tape, dr.x, 0.9, dr.z, g, false) : box(0.03, 0.08, dr.w + 0.1, tape, dr.x, 0.9, dr.z, g, false);
      t.rotation[dr.axis === 'z' ? 'z' : 'x'] = 0.15;
    }
  }

  const FURNISH = {
    entrance(g, lv, it, tag) {
      const nb = lv > 0 ? it.benches : 0;
      // benches: seats 0-5 along the left wall (three benches), 6-9 along the back (two)
      for (let b = 0; b < nb; b++) {
        const s0 = P.BENCH_SEATS[b * 2], s1 = P.BENCH_SEATS[b * 2 + 1];
        const bg = tag(new THREE.Group(), `bench:${b}`); g.add(bg);
        const x = (s0.x + s1.x) / 2, z = (s0.z + s1.z) / 2, along = b < 3;
        bg.position.set(x, 0, z);
        // (a sofa for two against the wall: plain, then with cushions)
        const sofa = piece('fbits', lv >= 3 ? 'couch_pillows' : 'couch', [0.9 * KK, KK, KK], along ? Math.PI / 2 : 0);
        sofa.position.set(along ? 0.05 : 0, 0, along ? 0 : 0.05); bg.add(sofa);
      }
      if (!lv) return;
      // the host stand, a rug, plants (flowers with the decor level), a menu board and a menu stand by the door
      box(0.7, 0.8, 0.45, M(lv >= 3 ? '#5a3424' : '#8a6d4f'), 7.2, 0, 21.4, g); box(0.8, 0.05, 0.55, M('#3a2a20'), 7.2, 0.8, 21.4, g);
      const rug = piece('fbits', lv >= 2 ? 'rug_rectangle_stripes_A' : 'rug_rectangle_B', [1.2, 0.3, 1.3], Math.PI / 2); rug.position.set(3, 0.004, 20.4); g.add(rug);
      const stand = piece('rbits', 'menu', KK * 1.8, -0.5); stand.position.set(4.5, 0, 22.3); g.add(stand);
      const dec = it.decor;
      const spots = [[0.6, 22.5], [10.3, 17.6], [10.3, 22.4], [4.6, 17.6], [8.8, 22.4]];
      spots.slice(0, 1 + Math.min(4, Math.floor(dec / 3))).forEach(([x, z], i) => tag(plant(g, x, z, 1, dec >= 2 ? ['#ff6fae', '#ffcf3f', '#ffffff', '#e2382b', '#9b5de5'][i] : null), `plant:${i}`));
      const mb = box(0.08, 1.0, 0.75, M('#2b2a2a'), 10.75, 0.8, 19.2, g); mb.castShadow = false;
    },
    dining(g, lv, it, tag) {
      const n = Math.min(it.tables, P.TABLES.dining.length);
      for (let i = 0; i < n; i++) {
        const t = P.TABLES.dining[i];
        const tg = tag(new THREE.Group(), `table:${i}`); tg.position.set(t.x, 0, t.z); g.add(tg);
        tg.add(table(lv, false));
        for (const s of [-1, 1]) { const c = chair(lv, s, it.comfort); c.position.set(s * 0.72, 0, 0); tg.add(c); }
      }
      // plants and pictures by level; the waiters' station by the pass
      if (lv >= 2) for (const [x, z] of [[7.6, 16.4], [20.4, 16.4]]) plant(g, x, z, 1);
      if (lv >= 3) for (const [x, z] of [[7.6, 12.0], [20.4, 12.6]]) plant(g, x, z, 0.8, '#ffcf3f');
      // pictures on the side walls
      if (lv >= 2) for (const [x, z, ry, name] of [[7.16, 10.6, Math.PI / 2, 'pictureframe_large_A'], [7.16, 14.4, Math.PI / 2, 'pictureframe_medium'], [20.84, 14.2, -Math.PI / 2, 'pictureframe_large_A'], [20.84, 15.6, -Math.PI / 2, 'pictureframe_small_A']]) {
        const pic = piece('fbits', name, KK * 1.1, ry); pic.position.set(x, 0.95, z); g.add(pic);
      }
      if (lv >= 4) { const ch = new THREE.Group(); ch.position.set(14, 2.9, 12.5); g.add(ch); for (const x of [-3.5, 0, 3.5]) { cyl(0.01, 0.01, 0.9, M('#333'), x, -0.9, 0, ch, 4); ball(0.22, M('#ffe7a8', { emissive: '#ffcf6b', emissiveIntensity: 0.8 }), x, -0.95, 0, ch, 1, 0.7, 1); } }
    },
    kitchen(g, lv, it, tag) {
      // the stations along the pass (one per dish on the menu), a grey one where the next can go
      const menu = S.menu(G());
      S.DISHES.forEach((d, i) => {
        const L = it[`st:${d.id}`];
        if (!L) {
          if (i === menu.length && S.capOf(G(), 'kitchen', `st:${d.id}`) > 0) {
            const gh = new THREE.Mesh(boxGeo(2 * KST, KST, 2 * KST), new THREE.MeshStandardMaterial({ color: '#ffffff', transparent: true, opacity: 0.3, depthWrite: false }));
            gh.position.set(P.STATION_X(i), KST / 2, P.STATION_Z - 0.07); g.add(gh);
          }
          return;
        }
        const s = tag(stationModel(d.id, lv, L), `st:${d.id}`); s.position.set(P.STATION_X(i), 0, P.STATION_Z); g.add(s);
      });
      // the back of the kitchen (against the wall, facing the room): fridges, counters with a sink, a shelf, crates of
      // vegetables, a prep table; a little more of everything with the level
      const back = (name, x, ry = 0, z = 0.15 + KST, s = KST) => { const p = piece('rbits', name, s, ry); p.position.set(x, 0, z); g.add(p); return p; };
      back(lv >= 3 ? 'fridge_A_decorated' : lv >= 2 ? 'fridge_A' : 'fridge_B', 20.15);
      if (lv >= 2) back(lv >= 4 ? 'fridge_A_decorated' : 'fridge_B', 18.85);
      back(lv >= 3 ? 'kitchencounter_straight_A_decorated' : 'kitchencounter_straight_A', 17.55);
      back(lv >= 2 ? 'kitchencounter_sink_backsplash' : 'kitchencounter_sink', 16.29);
      back(lv >= 2 ? 'kitchencounter_straight_decorated' : 'kitchencounter_straight_B', 15.03);
      if (lv >= 2) { back('kitchencounter_straight_B', 13.77); back('dishrack_plates', 13.77, 0, 0.75, KST * 0.8).position.y = KST; }
      const shelf = back(lv >= 3 ? 'shelf_papertowel_decorated' : 'shelf_papertowel', 15.6, 0, 0.16); shelf.position.y = 1.75;
      for (const [k, name] of ['crate_tomatoes', 'crate_lettuce', 'crate_onions', 'crate_potatoes'].entries()) {
        if (k >= 1 + lv) break;
        back(name, 7.75 + (k % 2) * 0.72, 0, 0.55 + Math.floor(k / 2) * 0.72, 0.34).position.y = 0;
      }
      back(lv >= 2 ? 'kitchentable_A_large_decorated' : 'kitchentable_A_large', 9.6, 0, 3.15);
      if (lv >= 3) { back('kitchencounter_straight_A', 12.51); back('pot_large', 12.51, 0.3, 0.75, KST * 0.55).position.y = KST; back('kitchencabinet', 12.51, 0, 0.16); back('kitchencabinet', 13.77, 0, 0.16); }
    },
    cashier(g, lv, it, tag) {
      if (!lv) return;
      // the counter: four kitchen counters in a row, facing the cashiers behind it
      const ctop = 1.0 * 0.62;
      for (let k = 0; k < 4; k++) {
        const c = piece('rbits', k === 1 && lv >= 3 ? 'kitchencounter_straight_A' : 'kitchencounter_straight_B', [0.675, 0.62, 0.44], -Math.PI / 2);
        c.position.set(1.6, 0, 9.775 + k * 1.35); g.add(c);
      }
      for (let r = 0; r < Math.min(it.registers, P.REGISTERS.length); r++) {
        const rg = tag(new THREE.Group(), `reg:${r}`); rg.position.set(1.55, ctop, P.REGISTERS[r]); g.add(rg);
        box(0.42, 0.22, 0.4, M('#3a3f4a'), 0, 0, 0, rg); box(0.36, 0.2, 0.06, M('#9fe3a0', { emissive: '#2f8a3a', emissiveIntensity: 0.5 }), 0, 0.22, -0.1, rg).rotation.x = -0.4;
      }
      if (lv >= 2) { const k = piece('rbits', 'ketchup', KK * 0.7); k.position.set(1.75, ctop, 9.25); g.add(k); const m = piece('rbits', 'mustard', KK * 0.7); m.position.set(1.55, ctop, 9.3); g.add(m); }
      if (it.upsell > 0) {
        const cd = tag(new THREE.Group(), 'cakes'); cd.position.set(1.6, ctop, 14.9); g.add(cd);
        box(0.7, 0.45, 0.6, M('#e8f6ff', { transparent: true, opacity: 0.45, roughness: 0.1 }), 0, 0, 0, cd, false);
        const c = food(it.upsell >= 5 ? 'cake-birthday' : 'cake', 0.3); c.position.set(0, 0.02, 0); cd.add(c);
      }
      // the line: posts and a rope
      for (let k = 0; k < 4; k++) cyl(0.05, 0.07, 0.9, M(lv >= 3 ? '#d4a640' : '#555c66', { metalness: 0.5, roughness: 0.4 }), 5.1, 0, 11.0 + k * 1.3, g, 8);
      plant(g, 6.4, 9.0, 0.9, lv >= 2 ? '#ff6fae' : null);
    },
    office(g, lv) {
      if (!lv) { // a dust sheet over the desk, boxes
        box(1.9, 0.85, 0.95, M('#d8d2c4', { roughness: 1 }), 3.2, 0, 3.2, g);
        return;
      }
      const at = (kit, name, s, x, z, ry = 0, y = 0) => { const p = piece(kit, name, s, ry); p.position.set(x, y, z); g.add(p); return p; };
      if (lv >= 2) at('fbits', lv % 2 ? 'rug_oval_B' : 'rug_oval_A', [1.3, 0.3, 1.3], 3.2, 3.4);
      // the desk with a computer (you sit behind it, facing the room)
      at('furniture', 'desk', KN, 3.2, 3.45, Math.PI);
      at('furniture', 'computerScreen', KN * 0.8, 2.85, 3.55, Math.PI, 0.87);
      at('furniture', 'computerKeyboard', KN * 0.8, 2.85, 3.2, Math.PI, 0.87);
      const cup = food('cup-coffee', 0.12); cup.position.set(3.85, 0.87, 3.4); g.add(cup);
      at('furniture', 'chairDesk', KN * 0.95, 3.2, 2.05);
      // a bookcase on the back wall, Uncle Ferdi's portrait above the desk, a safe, a plant, a lamp
      at('furniture', 'bookcaseClosedWide', KN, 5.5, 0.47, Math.PI);
      if (lv >= 2) at('furniture', 'books', KN, 5.2, 0.45, Math.PI, 1.83);
      const fr = new THREE.Mesh(new THREE.PlaneGeometry(0.95, 0.95), new THREE.MeshStandardMaterial({ map: artTexture('ferdi'), roughness: 0.7 }));
      fr.position.set(2.4, 1.85, 0.17); g.add(fr);
      box(1.1, 1.1, 0.06, M('#d4a640', { metalness: 0.5, roughness: 0.35 }), 2.4, 1.3, 0.13, g, false);
      box(0.7, 0.8, 0.6, M('#3a3f4a', { metalness: 0.4, roughness: 0.4 }), 0.6, 0, 6.8, g);
      plant(g, 6.3, 7.3, 1);
      at('fbits', 'lamp_standing', KK, 0.65, 0.75);
      if (lv >= 3) { at('fbits', 'armchair_pillows', KK, 1.0, 4.6, Math.PI / 2); at('fbits', 'table_low', [KK * 0.6, KK, KK * 0.6], 1.05, 3.3, Math.PI / 2); }
      if (lv >= 4) at('furniture', 'televisionVintage', KN, 6.5, 2.6, -Math.PI / 2);
    },
    terrace(g, lv, it, tag) {
      if (!lv) return;
      const n = Math.min(it.tables, P.TABLES.terrace.length);
      for (let i = 0; i < n; i++) {
        const t = P.TABLES.terrace[i];
        const tg = tag(new THREE.Group(), `table:${i}`); tg.position.set(t.x, 0, t.z); g.add(tg);
        tg.add(table(lv, true));
        for (const s of [-1, 1]) { const c = chair(lv, s, it.parasols * 2); c.position.set(s * 0.72, 0, 0); tg.add(c); }
      }
      // a fence with planters along the street and the alley
      for (let x = 11.6; x < 27.6; x += 2.0) { box(1.6, 0.42, 0.42, M('#8a5a3c'), x + 0.8, 0, 22.7, g); ball(0.32, M('#4f9a3a'), x + 0.8, 0.5, 22.7, g, 2.2, 0.75, 0.9); }
      for (let z = 17.6; z < 22; z += 2.0) { box(0.42, 0.42, 1.6, M('#8a5a3c'), 27.7, 0, z + 0.8, g); ball(0.32, M('#4f9a3a'), 27.7, 0.5, z + 0.8, g, 0.9, 0.75, 2.2); }
      if (lv >= 2) { // string lights
        const bulb = M('#fff2b0', { emissive: '#ffd56b', emissiveIntensity: 1.2 });
        for (let x = 12; x < 27.5; x += 0.9) ball(0.06, bulb, x, 2.6 - Math.sin(((x - 12) / 15.5) * Math.PI * 3) * 0.15, 20.25, g);
        for (const x of [11.6, 27.6]) cyl(0.04, 0.04, 2.7, M('#4a3a2c'), x, 0, 20.25, g, 6);
      }
    },
    bay(g) { soonRoom(g, 'bay'); },
    staff(g) { soonRoom(g, 'staff'); },
  };
  function soonRoom(g, room) {
    const R = P.ROOMS[room], cx = (R.x0 + R.x1) / 2, cz = (R.z0 + R.z1) / 2;
    // scaffolding: the next phases' rooms
    const pole = M('#8a8f99', { metalness: 0.4, roughness: 0.5 }), board = M('#b08a5a');
    for (const [dx, dz] of [[-1.2, -0.8], [1.2, -0.8], [-1.2, 0.8], [1.2, 0.8]]) cyl(0.05, 0.05, 2.6, pole, cx + dx, 0, cz + dz, g, 6);
    for (const y of [1.2, 2.5]) { box(2.6, 0.06, 0.5, board, cx, y, cz - 0.8, g); box(2.6, 0.06, 0.5, board, cx, y, cz + 0.8, g); }
    for (const [y, sc, ry] of [[0, 0.7, 0.3], [0.7, 0.5, 0.8]]) { const b = piece('furniture', 'cardboardBoxClosed', sc / 0.28, ry); b.position.set(cx + 1.9, y, cz + 1.6); g.add(b); }
  }

  // a station: a stove, an oven, a counter or a prep table (its front to the cook, its back to the pass), the dish's
  // things on it
  const ST_BASE = { burger: 'stove_multi', noodle: 'stove_single', pizza: 'oven', sushi: 'kitchentable_A', doner: 'kitchencounter_straight_A' };
  function stationModel(dish, lv, L) {
    const g = new THREE.Group(), base = ST_BASE[dish] || 'kitchencounter_straight_B';
    g.add(piece('rbits', base, KST, Math.PI));
    const top = (base === 'oven' ? 2.02 : base.startsWith('stove') ? 1.2 : 1.0) * KST;
    const steel = M('#c4ccd5', { metalness: 0.45, roughness: 0.38 }), dark = M('#33363d', { roughness: 0.5 });
    const put = (name, size, x, z, y = top, ry = 0) => { const n = food(name, size); n.position.set(x, y, z); n.rotation.y = ry; g.add(n); return n; };
    switch (dish) {
      case 'burger': put('meat-patty', 0.26, -0.27, -0.25, top - 0.02); put('meat-patty', 0.26, 0.27, 0.25, top - 0.02); put('meat-patty', 0.26, 0.27, -0.25, top - 0.02); break;
      case 'hotdog': box(1.1, 0.1, 0.5, steel, 0, top, 0, g); for (let i = 0; i < 6; i++) { const r = cyl(0.035, 0.035, 0.9, M('#b9bec6', { metalness: 0.7, roughness: 0.3 }), 0, 0, 0, g, 8); r.rotation.z = Math.PI / 2; r.position.set(0, top + 0.13, -0.18 + i * 0.07); } put('hot-dog', 0.34, 0.1, -0.05, top + 0.16, 0.2); break;
      case 'doner': box(0.5, 0.9, 0.12, dark, -0.15, top, 0.3, g); cyl(0.02, 0.02, 0.85, steel, 0.1, top, 0.05, g, 6); cyl(0.13, 0.2, 0.6, M('#9b5a2e', { roughness: 0.7 }), 0.1, top + 0.12, 0.05, g, 12); put('sandwich', 0.26, 0.45, -0.2, top, 0.4); break;
      case 'pizza': put('pizza', 0.5, 0, 0, top, 0); break;
      case 'noodle': put('frying-pan', 0.5, 0, -0.05, top - 0.02, 0.6); put('chinese', 0.22, 0.4, 0.3, top - 0.05); break;
      case 'fish': box(0.7, 0.16, 0.6, steel, -0.25, top, 0, g); box(0.6, 0.02, 0.5, M('#e6b43a', { roughness: 0.25, emissive: '#6a4a00', emissiveIntensity: 0.3 }), -0.25, top + 0.16, 0, g); put('fries', 0.2, 0.3, -0.05, top); put('fish', 0.26, 0.45, 0.15, top, 1.2); break;
      case 'sushi': put('cutting-board-japanese', 0.55, -0.2, 0, top); for (let i = 0; i < 3; i++) put('maki-salmon', 0.1, -0.35 + i * 0.13, -0.05, top + 0.04); put('sushi-salmon', 0.12, 0.38, -0.05, top); break;
      case 'icecream': box(1.1, 0.3, 0.9, M('#ffffff', { roughness: 0.5 }), 0, top, 0, g); box(1.0, 0.03, 0.8, M('#bfe3f5', { transparent: true, opacity: 0.55, roughness: 0.1 }), 0, top + 0.3, 0, g); put('ice-cream', 0.18, -0.25, -0.05, top + 0.33); put('ice-cream-cup', 0.16, 0.25, -0.05, top + 0.33); break;
      default: break;
    }
    // the dish's picture on a little post at the back
    cyl(0.025, 0.025, 1.0, steel, 0, top, 0.5, g, 6);
    const sg = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.5), new THREE.MeshBasicMaterial({ map: artTexture('dish-' + dish), transparent: true, alphaTest: 0.1 }));
    sg.position.set(0, top + 1.2, 0.5); g.add(sg);
    void L;
    return g;
  }

  // ---------- markers: room labels ----------
  const labels = {}; // room → marker
  function labelPos(room) {
    const R = P.ROOMS[room];
    const k = room === 'kitchen' ? 0.18 : 0.3;
    return [R.x0 + (R.x1 - R.x0) * k + 0.6, 2.2, R.z0 + (R.z1 - R.z0) * 0.22 + 0.4];
  }
  // the little counters on a label: people seated / seats, waiting / bench seats, in line to pay
  function count(g, room) {
    if (room === 'dining' || room === 'terrace') { const n = S.nTables(g, room) * 2; if (!n) return ''; let k = 0; for (const s in g.seats) if ((s[0] === 'd') === (room === 'dining')) k++; return `${k}/${n}`; }
    if (room === 'entrance') { const n = S.nBenchSeats(g); return n ? `${Object.keys(g.benches).length}/${n}` : ''; }
    if (room === 'cashier') return S.cashierOpen(g) ? `${g.queue.length}/${S.QMAX}` : '';
    if (room === 'kitchen') return g.tickets.length ? `${g.tickets.length} order${g.tickets.length > 1 ? 's' : ''}` : '';
    return '';
  }
  function syncLabels() {
    const g = G();
    for (const room of S.ROOM_IDS) {
      const R = S.ROOMS[room], lv = g.rooms[room].lv, b = S.building(g, room);
      let m = labels[room];
      if (!m) {
        const [x, y, z] = labelPos(room);
        m = markers.add({ x, y, z, cls: 'mk rlab', html: '', onTap: () => game.openRoom(room) });
        labels[room] = m;
      }
      const ruin = lv === 0, soon = !!R.soon;
      const up = !soon && !b && S.affordable(g, room);
      const block = S.upBlock(g, room);
      const cnt = count(g, room);
      const key = [lv, ruin, soon, !!b, up, block, ruin ? S.upCost(g, room) : 0, cnt].join('|');
      if (m.key !== key) {
        m.key = key;
        const name = `<span class="rname">${R.name}</span>`;
        if (soon) m.el.innerHTML = `<span class="rl soon">${name}<small>Coming soon</small></span>`;
        else if (b) m.el.innerHTML = `<span class="rl busy"><span class="rbadge prog"><i class="ring"></i><b>${b.to}</b></span>${name}<small class="eta"></small></span>`;
        else if (ruin) m.el.innerHTML = `<span class="rl ruin">${name}<span class="rfix ${block === 'gate' ? 'locked' : up ? 'can' : ''}">${block === 'gate' ? `Restaurant Lv ${R.gate}` : `Repair ${S.money(S.upCost(g, room))}`}</span></span>`;
        else m.el.innerHTML = `<span class="rl"><span class="rbadge"><b>${lv}</b></span>${name}${cnt ? `<small class="cnt">${cnt}</small>` : ''}${up ? '<i class="uparrow"></i>' : ''}</span>`;
      }
      if (b) {
        const f = Math.min(1, (g.t - b.t0) / Math.max(0.01, b.dur));
        m.el.style.setProperty('--p', f.toFixed(3));
        const eta = m.el.querySelector('.eta'); const left = Math.max(0, Math.ceil(b.t0 + b.dur - g.t));
        const txt = left >= 60 ? `${Math.floor(left / 60)}m ${left % 60}s` : `${left}s`;
        if (eta && eta.textContent !== txt) eta.textContent = txt;
      }
    }
  }

  // ---------- people ----------
  const pool = new Map(); // char id → [free chars]
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
    c.cur = null;
    pool.get(c.id).push(c);
  }
  function dropMk(m) { if (!m) return; m.el.remove(); const i = markers.list.indexOf(m); if (i >= 0) markers.list.splice(i, 1); }
  const tmp = [0, 0, 0];
  // where someone is now: walking a route (exact, from the sim's clock) or at a spot
  function placeOnRoute(a, b, t0, dur, out) {
    const r = P.route(a, b), f = dur > 0 ? Math.max(0, Math.min(1, (G().t - t0) / dur)) : 1;
    P.along(r, f * r.len, out);
    return f < 1;
  }
  const views = new Map(); // 'c' + id | 's' + id → view
  function view(key, charId, onMake) {
    let v = views.get(key);
    if (!v) {
      v = { key, c: null, x: 0, z: 0, ry: 0, y: 0, anim: 'idle', mk: null, mkKey: null, carry: null, carryKey: null, gone: false, seen: 0, placed: false };
      views.set(key, v);
      getChar(charId, (c) => { if (v.gone) { freeChar(c); return; } v.c = c; onMake?.(v, c); c.obj.position.set(v.x, v.y, v.z); c.obj.rotation.y = v.ry; }, !onMake);
    }
    return v;
  }
  function setPose(v, x, z, ry, anim, y = 0, dt = 0, snap = false) {
    if (!v.placed || snap) { v.x = x; v.z = z; v.ry = ry; v.placed = true; }
    else {
      // (spots that move under someone, the line at the cashier: they walk over)
      const dx = x - v.x, dz = z - v.z, l = Math.hypot(dx, dz);
      if (anim !== 'walk' && anim !== 'walk-hold' && l > 0.05) {
        const s = Math.min(l, 2.0 * dt); v.x += dx / l * s; v.z += dz / l * s; ry = Math.atan2(dx, dz); anim = 'walk';
      } else { v.x = x; v.z = z; }
    }
    v.y = y;
    if (!v.c) return;
    const o = v.c.obj;
    o.position.set(v.x, v.y, v.z);
    let dh = ry - o.rotation.y; while (dh > Math.PI) dh -= 2 * Math.PI; while (dh < -Math.PI) dh += 2 * Math.PI;
    o.rotation.y += dh * Math.min(1, dt * 12 || 1);
    if (v.c.cur !== anim) { v.c.play(anim, 0.18); v.c.cur = anim; }
    v.c.mixer.update(dt);
  }
  function bubble(v, html, cls, y = 2.1) {
    if (!v.mk) { v.mk = markers.add({ x: v.x, y, z: v.z, cls: 'mk ib ' + cls, html }); v.mk.el.style.pointerEvents = 'none'; v.mkKey = cls + html; }
    else if (v.mkKey !== cls + html) { v.mk.el.className = 'marker mk ib ' + cls; v.mk.el.innerHTML = html; v.mkKey = cls + html; }
    v.mk.pos.set(v.x, y, v.z);
  }
  function unbubble(v) { if (v.mk) { dropMk(v.mk); v.mk = null; v.mkKey = null; } }
  function carry(v, dish) {
    const key = dish || null;
    if (v.carryKey === key) return;
    if (v.carry) { v.carry.removeFromParent(); v.carry = null; }
    v.carryKey = key;
    if (!dish || !v.c) return;
    const p = plated(dish); p.scale.setScalar(1 / CH); p.position.set(0, 0.5, 0.2); v.c.obj.add(p); v.carry = p;
  }
  const DICON = (id) => `<img class="ic" src="${ART('dish-' + id)}" alt="">`;

  function syncCustomers(dt, snap) {
    const g = G(), live = new Set();
    for (const c of g.cust) {
      const key = 'c' + c.id; live.add(key);
      const v = view(key, CHARS[c.ch % CHARS.length]);
      let x, z, ry, anim = 'idle', y = 0;
      if (c.st === 'go') {
        placeOnRoute(c.a, c.b, c.t0, c.dur, tmp); [x, z, ry] = tmp; anim = 'walk';
      } else {
        const spotId = c.st === 'bench' ? c.bench : c.st === 'queue' ? `q:${Math.max(0, g.queue.indexOf(c.id))}` : c.st === 'pay' ? `reg:${c.reg}` : c.seat || c.at;
        const sp = P.SPOTS[spotId] || P.SPOTS.front;
        x = sp.x; z = sp.z; ry = sp.ry;
        if (sp.sit) { anim = c.st === 'eat' && v.c?.actions['sit-eat'] ? 'sit-eat' : 'sit'; y = (spotId[0] === 'b' ? 0.27 : H.seat) + SIT.y; x -= Math.sin(ry) * SIT.back; z -= Math.cos(ry) * SIT.back; }
        else if (c.st === 'pay') anim = 'interact-right';
      }
      setPose(v, x, z, ry, anim, y, dt, snap);
      // the order in a bubble with the patience running out; a coin when they want to pay at the table
      if (c.st === 'wait') {
        const p = Math.min(1, (g.t - c.t0) / S.PATIENCE.food);
        bubble(v, `<span class="ob"><i class="ring"></i>${DICON(c.dish)}</span>`, 'order' + (p > 0.66 ? ' late' : ''), 2.0);
        v.mk.el.style.setProperty('--p', (1 - p).toFixed(3));
      } else if (c.st === 'bill' && !S.cashierOpen(g)) bubble(v, '<span class="ob bill">$</span>', 'billb', 2.0);
      else if (c.st === 'bench' && g.t - c.t0 > S.benchPatience(g) * 0.5) {
        const p = Math.min(1, (g.t - c.t0) / S.benchPatience(g));
        bubble(v, '<span class="ob wait"><i class="ring"></i><b>…</b></span>', 'order' + (p > 0.75 ? ' late' : ''), 2.0);
        v.mk.el.style.setProperty('--p', (1 - p).toFixed(3));
      } else if (c.mood === 'mad' && c.st === 'go') bubble(v, '<span class="ob mad">!</span>', 'madb', 2.3);
      else unbubble(v);
      // their food in front of them while they eat
      const eating = c.st === 'eat' ? c.dish : null;
      if (v.plateKey !== eating) {
        if (v.plate) { v.plate.removeFromParent(); v.plate = null; }
        v.plateKey = eating;
        if (eating) {
          const sp = P.SPOTS[c.seat], t = (c.seat[0] === 'd' ? P.TABLES.dining : P.TABLES.terrace)[+c.seat.split(':')[1]];
          v.plate = plated(eating); v.plate.position.set(t.x + (sp.x < t.x ? -0.24 : 0.24), H.table + 0.005, t.z); dyn.add(v.plate);
        }
      }
    }
    for (const [key, v] of views) if (key[0] === 'c' && !live.has(key)) { views.delete(key); v.gone = true; freeChar(v.c); unbubble(v); if (v.plate) v.plate.removeFromParent(); }
  }

  const ROLE_LOOK = {
    you: (v, c) => { const h = hat('chef', '#e2382b'); h.position.set(0, 0.4, 0.02); c.head?.add(h); v.hat = h; },
    cook: (v, c) => { const h = hat('chef'); h.position.set(0, 0.4, 0.02); c.head?.add(h); },
    waiter: (v, c) => { const b = new THREE.Mesh(boxGeo(0.14, 0.06, 0.04), M('#1d1d24')); b.position.set(0, -0.03, 0.17); c.head?.add(b); },
    cashier: (v, c) => { const h = hat('cap', '#2ec4b6'); h.position.set(0, 0.36, 0.02); c.head?.add(h); },
    builder: (v, c) => { const h = hat('hard', '#ffc53d'); h.position.set(0, 0.36, 0.02); c.head?.add(h); },
  };
  function syncStaff(dt, snap) {
    const g = G(), live = new Set();
    for (const s of g.staff) {
      const key = 's' + s.id; live.add(key);
      const charId = s.role === 'you' ? YOU_CHAR : CHARS[(s.id * 5 + 2) % CHARS.length];
      const v = view(key, charId, ROLE_LOOK[s.role]);
      let x, z, ry, anim = 'idle', y = 0;
      if (s.st === 'go') { placeOnRoute(s.a, s.b, s.t0, s.dur, tmp); [x, z, ry] = tmp; anim = s.carry ? 'walk-hold' : 'walk'; }
      else {
        const sp = P.SPOTS[s.at] || P.SPOTS.front;
        x = sp.x; z = sp.z; ry = sp.ry;
        if (s.st === 'work') anim = 'interact-right';
        else if (sp.sit) { anim = 'sit'; y = H.seat + 0.2 + SIT.y; }
        else if (s.carry) anim = 'holding-both';
      }
      setPose(v, x, z, ry, anim, y, dt, snap);
      if (v.hat) v.hat.visible = S.youCook(g);
      carry(v, s.carry);
      // a ring over a cook at work
      if (s.st === 'work' && s.job?.kind === 'cook' && s.job.steps[s.job.i]?.on === 'cooked') {
        bubble(v, `<span class="cb"><i class="ring"></i>${DICON(s.job.dish)}</span>`, 'cookb', 2.35);
        v.mk.el.style.setProperty('--p', Math.min(1, (g.t - s.t0) / Math.max(0.01, s.dur)).toFixed(3));
      } else unbubble(v);
    }
    // the builder, while a room is being fixed up
    const b = g.build;
    if (b) {
      const R = P.ROOMS[b.room]; live.add('builder');
      const v = view('builder', 'male-e', ROLE_LOOK.builder);
      const t = g.t * 0.25;
      setPose(v, (R.x0 + R.x1) / 2 + Math.sin(t) * 1.2, (R.z0 + R.z1) / 2 + 0.6, Math.PI * 0.25, 'attack-melee-right', 0, dt, !v.placed);
      dust(dt, R);
    }
    for (const [key, v] of views) if (key[0] !== 'c' && !live.has(key)) { views.delete(key); v.gone = true; freeChar(v.c); unbubble(v); }
  }
  // dust puffs while a room is worked on
  const puffs = [];
  const puffMat = new THREE.MeshBasicMaterial({ color: '#e9e0cf', transparent: true, opacity: 0.6, depthWrite: false });
  let puffT = 0;
  function dust(dt, R) {
    puffT -= dt;
    if (puffT <= 0 && puffs.length < 14) {
      puffT = 0.25;
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.35, 8, 6), puffMat.clone());
      m.position.set(R.x0 + 0.8 + Math.random() * (R.x1 - R.x0 - 1.6), 0.2, R.z0 + 0.8 + Math.random() * (R.z1 - R.z0 - 1.6));
      dyn.add(m); puffs.push({ m, t: 0 });
    }
  }
  function puffTick(dt) {
    for (let i = puffs.length - 1; i >= 0; i--) {
      const p = puffs[i]; p.t += dt;
      p.m.position.y += dt * 0.8; p.m.scale.setScalar(1 + p.t * 1.6); p.m.material.opacity = Math.max(0, 0.6 - p.t * 0.5);
      if (p.t > 1.2) { p.m.removeFromParent(); p.m.material.dispose(); puffs.splice(i, 1); }
    }
  }
  // plates waiting on the pass, in front of their station
  const passPlates = new Map(); // plate id → mesh
  function syncPass() {
    const g = G(), live = new Set();
    const n = {};
    for (const p of g.pass) {
      live.add(p.id);
      let m = passPlates.get(p.id);
      if (!m) { m = plated(p.dish); dyn.add(m); passPlates.set(p.id, m); }
      const i = S.DISHES.findIndex((d) => d.id === p.dish), k = n[p.dish] = (n[p.dish] || 0) + 1;
      m.position.set(P.STATION_X(i) - 0.35 + ((k - 1) % 3) * 0.35, H.counter + 0.07, P.PASS.z + (k > 3 ? 0.15 : 0));
    }
    for (const [id, m] of passPlates) if (!live.has(id)) { m.removeFromParent(); passPlates.delete(id); }
  }

  // ---------- pops: "+$12" where someone paid, "Full!" at the door ----------
  const popsUI = [];
  function pop(x, z, html, cls, y = 2.2) {
    if (document.hidden) return;
    const m = markers.add({ x, y, z, cls: `mk paypop ${cls}`, html });
    m.el.style.pointerEvents = 'none';
    popsUI.push({ m, t: 0 });
  }
  function popsTick(dt) {
    for (let i = popsUI.length - 1; i >= 0; i--) { const p = popsUI[i]; p.t += dt; p.m.pos.y += dt * 0.9; if (p.t > 1.1) { dropMk(p.m); popsUI.splice(i, 1); } }
  }
  let fullT = 0;
  function event(e) {
    if (e.kind === 'paid') { const v = views.get('c' + e.cust); if (v) pop(v.x, v.z, `+${S.money(e.amount)}`, 'cash'); }
    else if (e.kind === 'lost' && e.why === 'full') { if (fullT <= 0) { pop(P.SPOTS.front.x + 1.2, P.SPOTS.front.z, 'Full!', 'lost', 1.8); fullT = 1.2; } }
    else if (e.kind === 'built') { rebuildRoom(e.room, true); buildWalls(); burst(e.room); }
  }
  function burst(room) {
    const R = P.ROOMS[room];
    for (let i = 0; i < 18; i++) {
      const m = new THREE.Mesh(boxGeo(0.12, 0.12, 0.04), new THREE.MeshBasicMaterial({ color: ['#ffcf3f', '#ff6fae', '#5bd13b', '#3fa9ff', '#ffffff'][i % 5] }));
      m.position.set((R.x0 + R.x1) / 2, 1.2, (R.z0 + R.z1) / 2); dyn.add(m);
      const a = i / 18 * Math.PI * 2;
      confetti.push({ m, vx: Math.cos(a) * (2 + Math.random() * 2), vz: Math.sin(a) * (2 + Math.random() * 2), vy: 4 + Math.random() * 3, t: 0 });
    }
  }
  const confetti = [];
  function confettiTick(dt) {
    for (let i = confetti.length - 1; i >= 0; i--) {
      const c = confetti[i]; c.t += dt; c.vy -= 9 * dt;
      c.m.position.x += c.vx * dt; c.m.position.z += c.vz * dt; c.m.position.y = Math.max(0.05, c.m.position.y + c.vy * dt);
      c.m.rotation.x += dt * 6; c.m.rotation.y += dt * 4;
      if (c.t > 2.2) { c.m.removeFromParent(); confetti.splice(i, 1); }
    }
  }

  // ---------- camera: iso, drag to pan (with a glide), pinch / wheel to zoom, tap a room to open it ----------
  const cam = { x: 14, z: 11, vh: 30, tvh: 30, vx: 0, vz: 0, aim: null, shift: 0, tshift: 0 };
  const BOUNDS = { x0: -2, x1: 30, z0: -1, z1: 27 };
  const RIGHT = new THREE.Vector3(Math.cos(YAW), 0, -Math.sin(YAW)), FWD = new THREE.Vector3(-Math.sin(YAW), 0, -Math.cos(YAW));
  let W = innerWidth, Hh = innerHeight;
  function applyCam() {
    const a = W / Hh, vh = cam.vh;
    camera.left = -vh * a / 2; camera.right = vh * a / 2; camera.top = vh / 2; camera.bottom = -vh / 2;
    const d = 80;
    camera.position.set(cam.x + Math.sin(YAW) * Math.cos(ELEV) * d, Math.sin(ELEV) * d, cam.z + Math.cos(YAW) * Math.cos(ELEV) * d);
    camera.lookAt(cam.x, 0, cam.z);
    camera.setViewOffset(W, Hh, 0, cam.shift, W, Hh);
    camera.updateProjectionMatrix();
  }
  const clampCam = () => { cam.x = Math.max(BOUNDS.x0, Math.min(BOUNDS.x1, cam.x)); cam.z = Math.max(BOUNDS.z0, Math.min(BOUNDS.z1, cam.z)); };
  function panBy(dx, dy) { // screen pixels → ground
    const upp = cam.vh / Hh;
    cam.x -= (RIGHT.x * dx - FWD.x * dy / Math.sin(ELEV)) * upp;
    cam.z -= (RIGHT.z * dx - FWD.z * dy / Math.sin(ELEV)) * upp;
    clampCam();
  }
  const ZOOM = { min: 12, max: 56 };
  function defaultVh() { return W / Hh < 0.8 ? 30 : 24; }
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  function roomAtScreen(px, py) {
    ndc.set(px / W * 2 - 1, -(py / Hh) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const hit = ray.intersectObjects(floors, false)[0];
    return hit ? hit.object.userData.room : null;
  }
  const canvasEl = game.canvas;
  const ptrs = new Map();
  let drag = null, pinch = null;
  canvasEl.addEventListener('pointerdown', (e) => {
    canvasEl.setPointerCapture?.(e.pointerId);
    ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    cam.aim = null;
    if (ptrs.size === 1) { drag = { x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY, t: performance.now(), moved: false, lx: e.clientX, ly: e.clientY, lt: performance.now() }; cam.vx = cam.vz = 0; }
    if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), vh: cam.vh, mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 }; if (drag) drag.moved = true; }
  });
  canvasEl.addEventListener('pointermove', (e) => {
    const p = ptrs.get(e.pointerId); if (!p) return;
    p.x = e.clientX; p.y = e.clientY;
    if (pinch && ptrs.size >= 2) {
      const [a, b] = [...ptrs.values()], d = Math.hypot(a.x - b.x, a.y - b.y), mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      cam.vh = cam.tvh = Math.max(ZOOM.min, Math.min(ZOOM.max, pinch.vh * pinch.d / Math.max(20, d)));
      panBy(mx - pinch.mx, my - pinch.my); pinch.mx = mx; pinch.my = my;
      return;
    }
    if (!drag) return;
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if (!drag.moved && Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) > 7) drag.moved = true;
    if (drag.moved) {
      panBy(dx, dy);
      const now = performance.now(), dtm = Math.max(1, now - drag.lt) / 1000;
      const upp = cam.vh / Hh;
      cam.vx = cam.vx * 0.6 + 0.4 * (-(RIGHT.x * (e.clientX - drag.lx) - FWD.x * (e.clientY - drag.ly) / Math.sin(ELEV)) * upp / dtm);
      cam.vz = cam.vz * 0.6 + 0.4 * (-(RIGHT.z * (e.clientX - drag.lx) - FWD.z * (e.clientY - drag.ly) / Math.sin(ELEV)) * upp / dtm);
      drag.lx = e.clientX; drag.ly = e.clientY; drag.lt = now;
    }
    drag.x = e.clientX; drag.y = e.clientY;
  });
  const up = (e) => {
    const p = ptrs.get(e.pointerId); ptrs.delete(e.pointerId);
    if (ptrs.size < 2) pinch = null;
    if (!drag || ptrs.size) { if (!ptrs.size) drag = null; return; }
    if (!drag.moved && performance.now() - drag.t < 450 && p) {
      const room = roomAtScreen(p.x, p.y);
      if (room) game.openRoom(room); else game.ui?.closeRoom?.();
      cam.vx = cam.vz = 0;
    } else if (performance.now() - drag.lt > 80) { cam.vx = cam.vz = 0; }
    drag = null;
  };
  canvasEl.addEventListener('pointerup', up);
  canvasEl.addEventListener('pointercancel', up);
  canvasEl.addEventListener('wheel', (e) => { e.preventDefault(); cam.tvh = Math.max(ZOOM.min, Math.min(ZOOM.max, cam.tvh * Math.pow(1.0015, e.deltaY))); }, { passive: false });
  function camTick(dt) {
    if (!drag && !pinch && (cam.vx || cam.vz)) {
      cam.x += cam.vx * dt; cam.z += cam.vz * dt; clampCam();
      const k = Math.exp(-dt * 5); cam.vx *= k; cam.vz *= k;
      if (Math.hypot(cam.vx, cam.vz) < 0.05) cam.vx = cam.vz = 0;
    }
    if (cam.aim) { const k = 1 - Math.exp(-dt * 6); cam.x += (cam.aim[0] - cam.x) * k; cam.z += (cam.aim[1] - cam.z) * k; if (Math.hypot(cam.aim[0] - cam.x, cam.aim[1] - cam.z) < 0.02) cam.aim = null; }
    if (!pinch) cam.vh += (cam.tvh - cam.vh) * (1 - Math.exp(-dt * 10));
    cam.shift += (cam.tshift - cam.shift) * (1 - Math.exp(-dt * 8));
    applyCam();
  }
  function focus(room, zoom) {
    const R = P.ROOMS[room];
    cam.aim = [(R.x0 + R.x1) / 2, (R.z0 + R.z1) / 2];
    if (zoom) cam.tvh = Math.max(ZOOM.min, Math.min(cam.tvh, zoom));
    cam.vx = cam.vz = 0;
  }

  // ---------- update ----------
  let lastSig = {};
  function update(dt, w, h) {
    W = w; Hh = h;
    const g = G();
    for (const room of S.ROOM_IDS) { const sg = sigOf(room); if (lastSig[room] !== sg) { const first = lastSig[room] == null; const lvChanged = !first && lastSig[room].split('|')[0] !== sg.split('|')[0]; lastSig[room] = sg; rebuildRoom(room, !first); if (lvChanged) buildWalls(); } }
    syncCustomers(dt, false);
    syncStaff(dt, false);
    syncPass();
    syncLabels();
    fullT -= dt;
    popTick(dt); puffTick(dt); popsTick(dt); confettiTick(dt);
    camTick(dt);
    markers.update(w, h);
    void g;
  }
  function snap() { for (const v of views.values()) v.placed = false; }

  buildOutside();
  buildWalls();
  cam.vh = cam.tvh = defaultVh();
  applyCam();
  return {
    scene, camera, update, event, focus, snap, markers,
    setShift(px) { cam.tshift = px; },
    resize(w, h) { W = w; Hh = h; applyCam(); },
    rebuildWalls: buildWalls,
    peek: () => ({ views: views.size, cam: { ...cam }, rooms: Object.fromEntries(Object.entries(roomGroups).map(([k, v]) => [k, v.sig])), pass: passPlates.size }),
  };
}

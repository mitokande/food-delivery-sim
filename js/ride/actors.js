// Event actors that act the event out in the street: a dog that chases the bike, a ball rolling across,
// a parked car whose door swings open, pigeons, a rival courier, a police stop, road works.
// Blocky procedural models in the Kenney style (no extra downloads). Pure three.js; the ride drives them.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { pieceParts, makeChar } from '../assets.js';
import { CAR_SCALE } from '../city/traffic.js';

const lam = (c) => new THREE.MeshLambertMaterial({ color: c });
const box = (w, h, d, mat, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); m.castShadow = true; return m; };

// ---------------- dog ----------------
const DOG_COATS = [[0xc98b4f, 0xf3e3c8], [0x3b3330, 0xd9d1c7], [0xe8d6b0, 0xffffff], [0x8a5a3c, 0x2b2420]];
export function makeDog(seed = Math.random()) {
  const [c1, c2] = DOG_COATS[Math.floor(seed * DOG_COATS.length)];
  const fur = lam(c1), belly = lam(c2), dark = lam(0x1d1b1f), tongue = lam(0xe8607a);
  const g = new THREE.Group(), body = new THREE.Group();
  g.add(body);
  body.add(box(0.42, 0.36, 0.78, fur, 0, 0.52, 0), box(0.38, 0.1, 0.62, belly, 0, 0.36, 0));
  const head = new THREE.Group(); head.position.set(0, 0.78, 0.44); body.add(head);
  head.add(box(0.42, 0.38, 0.38, fur), box(0.24, 0.18, 0.2, belly, 0, -0.08, 0.26), box(0.1, 0.08, 0.06, dark, 0, -0.02, 0.37),
    box(0.06, 0.06, 0.02, dark, -0.11, 0.06, 0.2), box(0.06, 0.06, 0.02, dark, 0.11, 0.06, 0.2), box(0.08, 0.02, 0.12, tongue, 0, -0.19, 0.3));
  const earL = box(0.12, 0.22, 0.08, dark, -0.17, 0.2, -0.04), earR = box(0.12, 0.22, 0.08, dark, 0.17, 0.2, -0.04);
  head.add(earL, earR);
  const tail = new THREE.Group(); tail.position.set(0, 0.66, -0.38); tail.add(box(0.08, 0.08, 0.3, fur, 0, 0.06, -0.12)); body.add(tail);
  const legs = [];
  for (const [x, z] of [[-0.14, 0.26], [0.14, 0.26], [-0.14, -0.26], [0.14, -0.26]]) {
    const l = new THREE.Group(); l.position.set(x, 0.42, z); l.add(box(0.12, 0.38, 0.12, fur, 0, -0.19, 0), box(0.13, 0.06, 0.15, belly, 0, -0.36, 0.02));
    body.add(l); legs.push(l);
  }
  g.scale.setScalar(1.25);
  let ph = 0;
  // speed = m/s along its facing; sit = 0..1
  function animate(dt, speed, { sit = 0, bark = 0 } = {}) {
    ph += dt * (4 + speed * 2.2);
    const sw = Math.min(1, speed / 2) * 0.75;
    legs.forEach((l, i) => { l.rotation.x = Math.sin(ph + (i === 0 || i === 3 ? 0 : Math.PI)) * sw; });
    body.position.y = Math.abs(Math.sin(ph)) * 0.06 * Math.min(1, speed / 2);
    body.rotation.x = -0.45 * sit;
    tail.rotation.y = Math.sin(ph * 2.5) * 0.7;
    head.rotation.x = bark > 0 ? -0.25 * Math.abs(Math.sin(bark * 20)) : 0;
    earL.rotation.z = 0.2 + Math.sin(ph) * 0.15 * sw; earR.rotation.z = -0.2 - Math.sin(ph) * 0.15 * sw;
  }
  return { obj: g, animate };
}

// ---------------- pigeons ----------------
export function makeBird() {
  const grey = lam(0x8d93a3), dark = lam(0x5b6170), beak = lam(0xe0a63a), neck = lam(0x5fa39a);
  const g = new THREE.Group();
  g.add(box(0.16, 0.14, 0.28, grey, 0, 0.14, 0), box(0.12, 0.12, 0.12, neck, 0, 0.26, 0.12), box(0.04, 0.03, 0.06, beak, 0, 0.25, 0.2));
  const wl = box(0.2, 0.03, 0.18, dark, -0.12, 0.18, -0.02), wr = box(0.2, 0.03, 0.18, dark, 0.12, 0.18, -0.02);
  g.add(wl, wr);
  g.scale.setScalar(2.1);
  let ph = Math.random() * 6;
  function animate(dt, flying) {
    ph += dt * (flying ? 28 : 3);
    const f = flying ? Math.sin(ph) * 0.9 : 0;
    wl.rotation.z = f; wr.rotation.z = -f;
    if (!flying) g.children[1].position.y = 0.26 + Math.max(0, Math.sin(ph)) * 0.04; // pecking bob
  }
  return { obj: g, animate };
}

// ---------------- beach ball ----------------
let ballTex = null;
export function makeBall() {
  if (!ballTex) {
    const c = document.createElement('canvas'); c.width = 128; c.height = 64; const x = c.getContext('2d');
    const cols = ['#e8432f', '#ffffff', '#2f6fd6', '#ffffff', '#ffd84d', '#ffffff'];
    cols.forEach((col, i) => { x.fillStyle = col; x.fillRect(i * 128 / 6, 0, 128 / 6 + 1, 64); });
    ballTex = new THREE.CanvasTexture(c); ballTex.colorSpace = THREE.SRGBColorSpace;
  }
  const m = new THREE.Mesh(new THREE.SphereGeometry(0.34, 18, 12), new THREE.MeshLambertMaterial({ map: ballTex }));
  m.castShadow = true;
  return { obj: m };
}

// ---------------- parked car with an opening door ----------------
export function makeDoorCar(type = 'sedan') {
  const parts = pieceParts('cars', type);
  const g = new THREE.Group();
  if (parts.length) {
    const geo = mergeGeometries(parts.map((p) => p.geometry.clone()));
    geo.scale(CAR_SCALE, CAR_SCALE, CAR_SCALE); geo.computeBoundingBox(); geo.translate(0, -geo.boundingBox.min.y, 0);
    const m = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ map: parts[0].material.map })); m.castShadow = true; g.add(m);
  }
  // driver's door on the car's left (+X in its local frame faces the road when parked on the right curb)
  const hinge = new THREE.Group(); hinge.position.set(1.12, 0.35, 0.55); g.add(hinge);
  const door = box(0.08, 0.95, 1.15, lam(0xd8e2ef), 0.04, 0.48, -0.58); hinge.add(door);
  hinge.add(box(0.06, 0.4, 0.9, new THREE.MeshLambertMaterial({ color: 0x9cc8ea, emissive: 0x223344 }), 0.06, 0.95, -0.6));
  let open = 0, target = 0;
  return { obj: g, setOpen: (v) => { target = v; }, animate: (dt) => { open += (target - open) * Math.min(1, dt * 9); hinge.rotation.y = -open * 1.15; } };
}

// ---------------- police car with flashing light bar ----------------
export function makePoliceCar() {
  const c = makeDoorCar('police');
  const red = new THREE.MeshBasicMaterial({ color: 0xff2a2a, toneMapped: false }), blue = new THREE.MeshBasicMaterial({ color: 0x2a6bff, toneMapped: false });
  const lr = box(0.32, 0.12, 0.18, red, -0.3, 2.05, 0), lb = box(0.32, 0.12, 0.18, blue, 0.3, 2.05, 0);
  c.obj.add(lr, lb);
  let t = 0;
  const base = c.animate;
  c.animate = (dt) => { base(dt); t += dt; const on = Math.floor(t * 6) % 2 === 0; lr.visible = on; lb.visible = !on; };
  return c;
}

// ---------------- characters that stand in the street ----------------
export async function makePerson(id, anim = 'idle') {
  const c = await makeChar(id);
  c.obj.scale.setScalar(2.2);
  c.play(anim, 0);
  return c;
}

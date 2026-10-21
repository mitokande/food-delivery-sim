// The elevated metro: three cars shuttling along the viaduct (arch.js RAIL), out of the western haze and into the
// tunnel in the eastern hill, then back. Models from cars.glb (train_head / train_mid) or simple stand-ins.
import * as THREE from 'three';
import { loadKit, getNode } from '../assets.js';
import { RAIL } from './arch.js';
import { useEnv } from '../look.js';

function standIn(head) {
  const g = new THREE.Group();
  const body = new THREE.MeshStandardMaterial({ color: 0xf4f1ea, roughness: 0.4 }), band = new THREE.MeshStandardMaterial({ color: 0xf08a3c, roughness: 0.5 }), glass = new THREE.MeshStandardMaterial({ color: 0x2d4b63, roughness: 0.15 });
  const b = new THREE.Mesh(new THREE.BoxGeometry(2.7, 3.0, head ? 11 : 12), body); b.position.y = 1.9; g.add(b);
  const s = new THREE.Mesh(new THREE.BoxGeometry(2.74, 0.35, head ? 11 : 12), band); s.position.y = 1.2; g.add(s);
  const w = new THREE.Mesh(new THREE.BoxGeometry(2.76, 0.9, head ? 9 : 10.6), glass); w.position.y = 2.4; g.add(w);
  if (head) { const n = new THREE.Mesh(new THREE.SphereGeometry(1.4, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), body); n.scale.set(0.97, 1.4, 1.2); n.rotation.x = Math.PI / 2; n.position.set(0, 1.9, 5.5); g.add(n); }
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}

export async function createTrain(scene) {
  await loadKit('toycars');
  const mk = (name, head) => {
    const src = getNode('toycars', name);
    if (!src) return standIn(head);
    const o = src.clone(true);
    o.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; if (m.material?.isMeshStandardMaterial) { m.material = m.material.clone(); useEnv(m.material, 0.8); } } });
    return o;
  };
  // [head →][mid][← head], 12 m cars, 0.6 m gaps
  const cars = [mk('train_head', true), mk('train_mid', false), mk('train_head', true)];
  const group = new THREE.Group(); group.name = 'train';
  const L = 12.6;
  cars[0].position.z = L; cars[2].position.z = -L; cars[2].rotation.y = Math.PI;
  for (const c of cars) group.add(c);
  scene.add(group);
  const zc = (RAIL.z0 + RAIL.z1) / 2 + 0.6, y = RAIL.y + 1.16;
  const st = { x: RAIL.x0 - 40, dir: 1, wait: 0, v: 0 };
  group.position.set(st.x, y, zc); group.rotation.y = Math.PI / 2;
  function update(dt) {
    if (st.wait > 0) { st.wait -= dt; group.visible = false; return; }
    group.visible = true;
    st.v = Math.min(16, st.v + dt * 3);
    st.x += st.v * st.dir * dt;
    if ((st.dir > 0 && st.x > RAIL.x1 + 30) || (st.dir < 0 && st.x < RAIL.x0 - 40)) { st.dir *= -1; st.wait = 9; st.v = 9; }
    group.position.x = st.x; group.rotation.y = st.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
  }
  return { group, update, st };
}

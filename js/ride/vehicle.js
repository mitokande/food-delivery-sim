// The player's (and fleet couriers') scooter: vehicles.glb node (or a placeholder) + Kenney rider + helmet.
import * as THREE from 'three';
import { loadKit, getNode, makeChar } from '../assets.js';
import { VEHICLE } from '../data.js';

let vehKit = null;
export async function loadVehicles() {
  if (!vehKit) vehKit = await loadKit('vehicles');
  return vehKit;
}

function placeholder(id) {
  const v = VEHICLE[id];
  const g = new THREE.Group();
  const paint = new THREE.MeshStandardMaterial({ color: v.paint, roughness: 0.45, name: 'paint' });
  const dark = new THREE.MeshStandardMaterial({ color: 0x2a2d35, roughness: 0.8 });
  const boxM = new THREE.MeshStandardMaterial({ color: v.box, roughness: 0.6, name: 'box' });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.45, 1.5), paint); body.position.set(0, 0.55, -0.05);
  const shield = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.7, 0.18), paint); shield.position.set(0, 0.85, 0.62); shield.rotation.x = -0.25;
  const seat = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.12, 0.6), dark); seat.position.set(0, 0.84, -0.25);
  const wheelG = new THREE.CylinderGeometry(0.27, 0.27, 0.18, 16); wheelG.rotateZ(Math.PI / 2);
  const wf = new THREE.Mesh(wheelG, dark); wf.name = 'wheel_front'; wf.position.set(0, 0.27, 0.72);
  const wr = new THREE.Mesh(wheelG, dark); wr.name = 'wheel_rear'; wr.position.set(0, 0.27, -0.72);
  const steer = new THREE.Group(); steer.name = 'steer'; steer.position.set(0, 0, 0.7);
  const bar = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.06, 0.06), dark); bar.position.set(0, 1.2, -0.08);
  steer.add(bar); wf.position.set(0, 0.27, 0.02); steer.add(wf);
  const box = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.55, 0.6), boxM); box.name = 'box'; box.position.set(0, 1.2, -0.72);
  const seatE = new THREE.Object3D(); seatE.name = 'seat'; seatE.position.set(0, 0.48, -0.15);
  g.add(body, shield, seat, wr, steer, box, seatE);
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return g;
}

// Build a ridable vehicle object. Returns { root, model, rider, wheels, steer, box, setColors(), update(dt, speed, lean) }
export async function makeBike(id, { paint, box, char = 'male-a', helmet = '#e8432f', rider = true } = {}) {
  await loadVehicles();
  const src = getNode('vehicles', id);
  const model = src ? src.clone(true) : placeholder(id);
  // own materials so colours can change per bike
  model.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = true; o.receiveShadow = true;
    if (Array.isArray(o.material)) o.material = o.material.map((m) => m.clone()); else o.material = o.material.clone();
  });
  const root = new THREE.Group();
  const lean = new THREE.Group(); // rolls around the contact line
  root.add(lean); lean.add(model);
  // GLTFLoader suffixes duplicate node names (wheel_front_1…), so look parts up by userData.part
  const parts = {};
  model.traverse((o) => { const k = o.userData?.part || o.name; if (k && !(k in parts)) parts[k] = o; });
  const find = (n) => parts[n] || model.getObjectByName(n);
  const wheels = ['wheel_front', 'wheel_rear', 'wheel_rear_l', 'wheel_rear_r'].map(find).filter(Boolean);
  const steer = find('steer'), boxNode = find('box'), lid = find('box_lid'), seat = find('seat'), exhaust = find('exhaust');
  function setColors(p, b) {
    model.traverse((o) => {
      if (!o.isMesh) return;
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
        if (p && m.name === 'paint') m.color.set(p);
        if (b && m.name === 'box') m.color.set(b);
      }
    });
  }
  setColors(paint, box);
  let ch = null, helm = null;
  if (rider) {
    ch = await makeChar(char);
    ch.obj.scale.setScalar(2.2);
    if (seat) { seat.updateMatrixWorld(true); ch.obj.position.copy(seat.position); seat.parent.add(ch.obj); ch.obj.position.copy(seat.position); }
    else { ch.obj.position.set(0, 0.5, -0.1); model.add(ch.obj); }
    ch.play('drive', 0);
    const hsrc = getNode('vehicles', 'helmet');
    if (hsrc && ch.head) {
      helm = hsrc.clone(true);
      // long hair / caps poke through on some characters — give them a roomier helmet
      const roomy = { 'female-f': 1.17, 'male-c': 1.15, 'female-a': 1.12, 'female-c': 1.12, 'female-d': 1.12, 'female-e': 1.12, 'male-b': 1.04, 'male-d': 1.04 }[char];
      if (roomy) helm.scale.setScalar(roomy);
      helm.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.material = o.material.clone(); if (o.material.name === 'helmet_paint') o.material.color.set(helmet); } });
      helm.position.set(0, 0, 0); helm.rotation.set(0, 0, 0);
      if (roomy) helm.position.y = -0.01;
      ch.head.add(helm);
    }
  }
  const st = { spin: 0, lean: 0, pitch: 0, bob: 0 };
  // rider reactions are small bone offsets layered on the 'drive' clip. The mixer skips bones whose keyframes don't
  // change, so offsets are undone before every mixer update and re-applied after it.
  const bones = {};
  if (ch) ch.obj.traverse((o) => { if (o.isBone) bones[o.name] = o; });
  const pose = { tuck: 0, tuckV: 0, cheer: 0, look: 0 };
  const saved = [];
  const qa = new THREE.Quaternion(), ax = new THREE.Vector3(1, 0, 0), ay = new THREE.Vector3(0, 1, 0);
  function offset(bone, axis, ang) { if (!bone || Math.abs(ang) < 1e-4) return; saved.push([bone, bone.quaternion.clone()]); bone.quaternion.multiply(qa.setFromAxisAngle(axis, ang)); }
  function applyPose(dt) {
    pose.tuckV += (pose.tuck - pose.tuckV) * Math.min(1, dt * 6);
    pose.cheer = Math.max(0, pose.cheer - dt); pose.look = Math.max(0, pose.look - dt);
    const ch1 = pose.cheer > 0 ? Math.min(1, (0.9 - pose.cheer) / 0.2, pose.cheer / 0.25) : 0; // raise, hold, lower
    const lk = pose.look > 0 ? Math.sin(Math.PI * (1 - pose.look / 0.9)) : 0;
    offset(bones.torso, ax, 0.32 * pose.tuckV);
    offset(bones.head, ax, -0.22 * pose.tuckV);
    offset(bones['arm-right'], ax, -2.2 * ch1);
    offset(bones.head, ay, 1.1 * lk);
  }
  function undoPose() { while (saved.length) { const [b, q] = saved.pop(); b.quaternion.copy(q); } }
  function update(dt, speed, leanTarget = 0, steerAng = 0) {
    st.spin += speed * dt / 0.27;
    for (const w of wheels) w.rotation.x = st.spin;
    if (steer) steer.rotation.y += (steerAng - steer.rotation.y) * Math.min(1, dt * 10);
    st.lean += (leanTarget - st.lean) * Math.min(1, dt * 4.5);
    lean.rotation.z = -st.lean;
    st.bob += dt * (6 + speed * 0.6);
    model.position.y = Math.sin(st.bob) * 0.012 * Math.min(1, speed / 3);
    if (ch) { undoPose(); ch.mixer.update(dt); applyPose(dt); }
  }
  const cheer = () => { if (pose.cheer <= 0.2) pose.cheer = 0.9; };
  const lookBack = () => { pose.look = 0.9; };
  function openLid(open) { if (lid) lid.rotation.x = open ? -1.2 : 0; }
  return { root, lean, model, rider: ch, helmet: helm, wheels, steer, box: boxNode, lid, seat, exhaust, setColors, update, openLid, st, id, pose, cheer, lookBack };
}

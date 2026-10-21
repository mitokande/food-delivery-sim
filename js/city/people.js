// Street life on the cheap: Kenney mini characters baked into static poses (sitting at café tables, standing,
// chatting) once at load, then drawn as instanced props — no skinning, no mixers.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { clone as skClone } from 'three/addons/utils/SkeletonUtils.js';
import { loadChar } from '../assets.js';
import { mulberry32 } from '../rng.js';

const IDS = ['female-c', 'male-e', 'female-d', 'male-c', 'female-a']; // the pedestrian set phones load anyway
const POSES = { sit: ['sit', 0.6], stand: ['idle', 0.4], chat: ['emote-yes', 0.35], hold: ['holding-right', 0.3] };

async function bake(id, anim, t) {
  const c = await loadChar(id);
  const obj = skClone(c.scene);
  const clip = c.clips.find((k) => k.name === anim) || c.clips.find((k) => k.name === 'idle');
  const mixer = new THREE.AnimationMixer(obj);
  if (clip) { mixer.clipAction(clip).play(); mixer.setTime(t); }
  obj.updateMatrixWorld(true);
  const geos = []; let map = null;
  const v = new THREE.Vector3();
  obj.traverse((o) => {
    if (!o.isSkinnedMesh) return;
    o.skeleton.update();
    const g = new THREE.BufferGeometry();
    const src = o.geometry, pos = src.attributes.position;
    const out = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) { v.fromBufferAttribute(pos, i); o.applyBoneTransform(i, v); v.applyMatrix4(o.matrixWorld); out.set([v.x, v.y, v.z], i * 3); }
    g.setAttribute('position', new THREE.BufferAttribute(out, 3));
    g.setAttribute('uv', src.attributes.uv.clone());
    if (src.index) g.setIndex(src.index.clone());
    geos.push(g.toNonIndexed());
    map = map || o.material.map;
  });
  const g = mergeGeometries(geos);
  g.scale(2.2, 2.2, 2.2);
  g.computeBoundingBox(); g.translate(0, -g.boundingBox.min.y, 0); // feet (or seat) on the ground
  g.computeVertexNormals();
  return { geo: g, map };
}

// spots: [{pose, x, z, rot}] → instanced types for createProps' `extra`
export async function bakePeople(spots) {
  const rng = mulberry32(77);
  const need = new Set();
  const list = spots.map((s) => { const id = IDS[Math.floor(rng() * IDS.length)]; const type = `person:${s.pose}:${id}`; need.add(type); return { ...s, type }; });
  const extra = {};
  let mat = null;
  await Promise.all([...need].map(async (type) => {
    const [, pose, id] = type.split(':');
    const [anim, t] = POSES[pose];
    const b = await bake(id, anim, t);
    if (!mat) { mat = new THREE.MeshLambertMaterial({ map: b.map }); mat.name = 'people'; }
    extra[type] = { geo: b.geo, mat };
  }));
  return { list, extra };
}

// where people go: two seats at some café tables, a few standing by shop doors / chatting on the pavement
export function peopleSpots(props, rng = mulberry32(99)) {
  const spots = [];
  for (const p of props) {
    if (p.type === 'cafe_set_a' || p.type === 'cafe_set_b') {
      const c = Math.cos(p.rot || 0), s = Math.sin(p.rot || 0);
      for (const side of [-1, 1]) {
        if (rng() > 0.55) continue;
        const lx = side * 0.66, lz = 0;
        spots.push({ pose: 'sit', x: p.x + lx * c + lz * s, z: p.z - lx * s + lz * c, rot: (p.rot || 0) - side * Math.PI / 2, y: 0.2 });
      }
    } else if (p.type === 'chalkboard' && rng() < 0.5) {
      spots.push({ pose: rng() < 0.5 ? 'chat' : 'stand', x: p.x + Math.sin(p.rot) * 0.9, z: p.z + Math.cos(p.rot) * 0.9, rot: p.rot + Math.PI, y: 0.2 });
    } else if ((p.type === 'planter' || p.type === 'flower_pot' || p.type === 'bench') && rng() < 0.3) {
      const a = (p.rot || 0) + (rng() - 0.5) * 2;
      spots.push({ pose: rng() < 0.4 ? 'hold' : 'stand', x: p.x + Math.sin(p.rot || 0) * 0.9 + (rng() - 0.5), z: p.z + Math.cos(p.rot || 0) * 0.9 + (rng() - 0.5), rot: a, y: 0.2 });
    }
  }
  return spots;
}

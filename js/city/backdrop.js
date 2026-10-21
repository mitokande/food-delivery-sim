// Scenery around the playable city: hazy mountain ranges on the horizon, a green hillside dotted with houses
// east of town, the bay to the south (breakwater + lighthouse, a pier with a Ferris wheel, sailboats), and the
// Old Town clock tower. Static except the wheel and the boats.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { TILE } from '../data.js';
import { K } from './gen.js';
import { pieceParts, getNode, loadKit } from '../assets.js';
import { toyMaterial, lodGeometry } from './props.js';
import { mulberry32 } from '../rng.js';
import { carModel, PAINTS, loadCars } from './cars.js';

const T = TILE;

function n1(x) { const i = Math.floor(x), f = x - i; const h = (k) => { const s = Math.sin(k * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); }; const w = f * f * (3 - 2 * f); return h(i) * (1 - w) + h(i + 1) * w; }
function n2(x, z) { const s = (a, b) => { const v = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return v - Math.floor(v); }; const ix = Math.floor(x), iz = Math.floor(z), fx = x - ix, fz = z - iz; const wx = fx * fx * (3 - 2 * fx), wz = fz * fz * (3 - 2 * fz);
  return (s(ix, iz) * (1 - wx) + s(ix + 1, iz) * wx) * (1 - wz) + (s(ix, iz + 1) * (1 - wx) + s(ix + 1, iz + 1) * wx) * wz; }

export async function createBackdrop(scene, city, sky) {
  const group = new THREE.Group(); group.name = 'backdrop';
  scene.add(group);
  const W = city.W * T, cx = W / 2 - T / 2, cz = W / 2 - T / 2;
  const E1 = (city.W - 0.5) * T;

  // ---------------- mountain ranges: two jagged skirts, coloured toward the horizon colour (aerial haze) ----------------
  const hazeUni = { uHor: { value: new THREE.Color() }, uTop: { value: new THREE.Color() }, uNight: { value: 0 } };
  const rangeMat = new THREE.ShaderMaterial({
    uniforms: hazeUni, fog: false, side: THREE.DoubleSide,
    vertexShader: 'attribute float aH; attribute float aFar; varying float vH; varying float vFar; varying float vY; void main(){ vH = aH; vFar = aFar; vY = position.y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform vec3 uHor, uTop; uniform float uNight; varying float vH; varying float vFar; varying float vY;
      void main(){
        vec3 land = mix(vec3(0.33, 0.52, 0.36), vec3(0.5, 0.62, 0.5), vFar);
        land = mix(land, vec3(0.72, 0.74, 0.76), smoothstep(0.75, 1.0, vH) * 0.5); // pale, rocky tops
        float haze = mix(0.5, 0.74, vFar) + (1.0 - vH) * 0.1;
        vec3 c = mix(land * (0.8 + 0.25 * vH), uHor, haze);
        c = mix(c, uHor * 0.55 + uTop * 0.2, uNight * 0.6);
        gl_FragColor = vec4(c, 1.0);
        #include <colorspace_fragment>
      }`,
  });
  const ranges = [];
  for (const [R, hMax, far, seed] of [[1250, 170, 0, 3.1], [1650, 260, 1, 7.7]]) {
    const N = 220, pos = [], aH = [], aF = [], idx = [];
    for (let i = 0; i <= N; i++) {
      const a = (i / N) * Math.PI * 2;
      const dx = Math.sin(a), dz = Math.cos(a); // a = 0 → +z (south, the sea)
      const sea = Math.max(0, dz); // open water to the south
      let h = (n1(a * 6 + seed) * 0.6 + n1(a * 17 + seed * 3) * 0.3 + n1(a * 41) * 0.1);
      h = Math.pow(h, 1.4) * hMax * (1 - Math.pow(sea, 0.6) * 0.92) + 8;
      pos.push(cx + dx * R, -30, cz + dz * R, cx + dx * R, h, cz + dz * R);
      aH.push(0, Math.min(1, h / hMax)); aF.push(far, far);
      if (i < N) { const b = i * 2; idx.push(b, b + 2, b + 1, b + 1, b + 2, b + 3); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('aH', new THREE.Float32BufferAttribute(aH, 1));
    g.setAttribute('aFar', new THREE.Float32BufferAttribute(aF, 1));
    g.setIndex(idx);
    const m = new THREE.Mesh(g, rangeMat); m.frustumCulled = false; m.renderOrder = -5;
    group.add(m); ranges.push(m);
  }

  // ---------------- east hillside: green slope rising from the edge of town, dotted with houses and trees ----------------
  const hx0 = E1 + 170, hx1 = E1 + 600, hz0 = -260, hz1 = E1 - 6; // begins behind the outskirts (arch.js OUT_DEPTH)
  const height = (x, z) => {
    const t = THREE.MathUtils.smoothstep(x, hx0, hx0 + 260);
    const sea = THREE.MathUtils.smoothstep(z, hz1 - 80, hz1); // dips to the shore in the south
    return (t * (45 + 55 * n2(x * 0.006, z * 0.006)) + n2(x * 0.02, z * 0.02) * 6 * t) * (1 - sea * 0.85) - 0.3;
  };
  {
    const NX = 46, NZ = 56, pos = [], col = [], idx = [];
    for (let j = 0; j <= NZ; j++) for (let i = 0; i <= NX; i++) {
      const x = hx0 - 40 + (hx1 - hx0 + 40) * i / NX, z = hz0 + (hz1 - hz0) * j / NZ;
      const y = height(x, z);
      pos.push(x, y, z);
      const k = n2(x * 0.03, z * 0.03), k2 = n2(x * 0.11 + 5, z * 0.11);
      const c = new THREE.Color().setRGB(0.34 + k * 0.14 + k2 * 0.05, 0.56 + k * 0.12, 0.26 + k * 0.05, THREE.SRGBColorSpace);
      if (k2 > 0.72) c.multiplyScalar(0.82);
      col.push(c.r, c.g, c.b);
    }
    for (let j = 0; j < NZ; j++) for (let i = 0; i < NX; i++) { const a = j * (NX + 1) + i, b = a + 1, c = a + NX + 1, d = c + 1; idx.push(a, c, b, b, c, d); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setIndex(idx); g.computeVertexNormals();
    const m = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ vertexColors: true }));
    m.receiveShadow = true; group.add(m);
  }
  await Promise.all([loadKit('props'), loadCars([])]);
  const toy = toyMaterial();
  const rng = mulberry32(2026);
  const inst = (type, list, lod = false) => {
    const parts = pieceParts('props', type); if (!parts.length || !list.length) return null;
    const im = new THREE.InstancedMesh(lod ? lodGeometry(type) : parts[0].geometry, toy, list.length);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
    list.forEach((p, i) => { q.setFromAxisAngle(up, p.rot); im.setMatrixAt(i, m4.compose(new THREE.Vector3(p.x, p.y, p.z), q, new THREE.Vector3(p.s, p.s, p.s))); });
    im.castShadow = false; im.receiveShadow = true;
    group.add(im); return im;
  };
  {
    const houses = { hill_house_a: [], hill_house_b: [], hill_house_c: [] }, trees = [];
    for (let i = 0; i < 1500; i++) {
      // denser low on the slope (a town climbing the hill), thinning out toward the top
      const u = Math.pow(rng(), 1.6);
      const x = hx0 + 6 + u * 330, z = hz0 + 40 + rng() * (hz1 - hz0 - 60);
      const y = height(x, z);
      if (y < 1.2) continue;
      if (rng() < 0.7 - u * 0.4) houses[['hill_house_a', 'hill_house_b', 'hill_house_c'][Math.floor(rng() * 3)]].push({ x, y: y - 0.5, z, rot: -Math.PI / 2 + (rng() - 0.5) * 0.7, s: 1.25 + rng() * 0.45 });
      else if (rng() < 0.7) trees.push({ x, y: y - 0.2, z, rot: rng() * 6.28, s: 1.0 + rng() * 0.6 });
    }
    for (const k in houses) inst(k, houses[k]);
    inst('tree_round_a', trees.filter((_, i) => i % 2 === 0), true); inst('tree_round_c', trees.filter((_, i) => i % 2 === 1), true);
  }

  // ---------------- the bay: breakwater + lighthouse, pier + Ferris wheel ----------------
  const stone = new THREE.MeshLambertMaterial({ color: 0xc9bfae });
  const deck = new THREE.MeshLambertMaterial({ color: 0xbfa888 });
  const quayZ = city.H * T - T / 2;
  const bw = new THREE.Mesh(new THREE.BoxGeometry(8, 3, 110), stone); bw.position.set(E1 - 30, -0.4, quayZ + 55); bw.receiveShadow = true; group.add(bw);
  const lhBase = new THREE.Mesh(new THREE.CylinderGeometry(7, 8, 3, 14), stone); lhBase.position.set(E1 - 30, -0.3, quayZ + 112); group.add(lhBase);
  const place = (type, x, y, z, rot = 0, s = 1) => {
    const node = getNode('props', type); if (!node) return null;
    const o = node.clone(true); o.traverse((m) => { if (m.isMesh) { m.material = toy; m.castShadow = true; m.receiveShadow = true; } });
    o.position.set(x, y, z); o.rotation.y = rot; o.scale.setScalar(s); group.add(o); return o;
  };
  place('lighthouse', E1 - 30, 1.2, quayZ + 112, 0, 1.2);
  const pierX = cx + 90, pierZ = quayZ + 42;
  const pier = new THREE.Mesh(new THREE.BoxGeometry(46, 1.2, 46), deck); pier.position.set(pierX, 0.1, pierZ); pier.receiveShadow = true; group.add(pier);
  const walk = new THREE.Mesh(new THREE.BoxGeometry(10, 1.2, 24), deck); walk.position.set(pierX, 0.1, quayZ + 9); group.add(walk);
  place('ferris_wheel', pierX, 0.7, pierZ, 0, 1);
  const rotor = place('ferris_wheel_rotor', pierX, 0.7 + (getNode('props', 'ferris_wheel_rotor')?.position.y || 15.6), pierZ, 0, 1);

  // ---------------- boats on the bay: sailboats tacking slowly, a few motor boats (one instanced mesh per type) ----------------
  const boats = [], fleets = [];
  for (const [type, n] of [['sailboat', 7], ['boat_small', 4]]) {
    const cm = carModel(type); if (!cm) continue;
    const im = new THREE.InstancedMesh(cm.geo, cm.mat, n);
    im.castShadow = false; im.frustumCulled = false; im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    for (let i = 0; i < n; i++) {
      im.setColorAt(i, PAINTS[(i * 5 + n) % PAINTS.length]);
      const bx = 60 + rng() * (W - 80), bz = quayZ + 70 + rng() * 380;
      boats.push({ im, i, x: bx, z: bz, a: rng() * 6.28, v: type === 'sailboat' ? 1.2 + rng() : 3 + rng() * 2, ph: rng() * 6, r: 40 + rng() * 60 });
    }
    group.add(im); fleets.push(im);
  }
  const bm = new THREE.Matrix4(), bq = new THREE.Quaternion(), be = new THREE.Euler(), bp = new THREE.Vector3(), bs = new THREE.Vector3(1, 1, 1);

  // ---------------- the clock tower (tile chosen in arch.js) ----------------
  if (city.clockTower >= 0) { const t = city.tiles[city.clockTower]; place('clock_tower', t.x * T, 0.1, t.z * T, 0, 1.15); }
  else place('clock_tower', -40, 0, 300, Math.PI / 2, 1.3);

  function update(dt) {
    hazeUni.uHor.value.copy(sky.uni.hor.value); hazeUni.uTop.value.copy(sky.uni.top.value); hazeUni.uNight.value = sky.state.night;
    if (rotor) rotor.rotation.z += dt * 0.06;
    for (const b of boats) {
      // drift along a slow circle, rock on the swell
      b.ph += dt; b.a += dt * b.v / b.r;
      bp.set(b.x + Math.cos(b.a) * b.r * 0.5, -0.55 + Math.sin(b.ph * 0.9) * 0.12, b.z + Math.sin(b.a) * b.r * 0.3);
      bq.setFromEuler(be.set(0, -b.a + Math.PI, Math.sin(b.ph * 1.3) * 0.05, 'YXZ'));
      b.im.setMatrixAt(b.i, bm.compose(bp, bq, bs));
    }
    for (const im of fleets) im.instanceMatrix.needsUpdate = true;
  }
  return { group, update, height };
}

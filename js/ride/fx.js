// Ride effects: soft particles (exhaust, turbo flame, dust, splashes, sparks, sparkles), skid marks.
// Two Points draw calls (normal + additive blending), CPU-simulated, pooled.
import * as THREE from 'three';

const TYPES = {
  smoke: { blend: 0, life: [0.7, 1.1], size: [0.35, 1.4], color: [0.86, 0.86, 0.88], alpha: 0.45, drag: 2.2, grav: -0.6 },
  smokeBlack: { blend: 0, life: [0.8, 1.3], size: [0.4, 1.7], color: [0.22, 0.21, 0.22], alpha: 0.55, drag: 2.0, grav: -0.5 },
  flame: { blend: 1, life: [0.12, 0.22], size: [0.55, 0.12], color: [1.0, 0.55, 0.15], alpha: 0.95, drag: 1, grav: 0 },
  dust: { blend: 0, life: [0.45, 0.8], size: [0.35, 1.5], color: [0.74, 0.66, 0.55], alpha: 0.55, drag: 3.5, grav: -0.3 },
  splash: { blend: 0, life: [0.35, 0.6], size: [0.18, 0.1], color: [0.78, 0.9, 1.0], alpha: 0.8, drag: 0.6, grav: 9 },
  spark: { blend: 1, life: [0.25, 0.45], size: [0.16, 0.05], color: [1.0, 0.82, 0.35], alpha: 1, drag: 0.8, grav: 9 },
  cash: { blend: 1, life: [0.5, 0.8], size: [0.3, 0.05], color: [0.55, 1.0, 0.45], alpha: 1, drag: 1.5, grav: -1 },
  star: { blend: 1, life: [0.5, 0.9], size: [0.35, 0.05], color: [1.0, 0.92, 0.5], alpha: 1, drag: 1.8, grav: -0.5 },
};

function makeSystem(max, additive) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(max * 3), 3).setUsage(THREE.DynamicDrawUsage));
  g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(max * 3), 3).setUsage(THREE.DynamicDrawUsage));
  g.setAttribute('aAlpha', new THREE.BufferAttribute(new Float32Array(max), 1).setUsage(THREE.DynamicDrawUsage));
  g.setAttribute('aSize', new THREE.BufferAttribute(new Float32Array(max), 1).setUsage(THREE.DynamicDrawUsage));
  g.setDrawRange(0, 0);
  const mat = new THREE.ShaderMaterial({
    uniforms: { uScale: { value: 400 } },
    transparent: true, depthWrite: false, fog: false,
    blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    vertexShader: `attribute float aAlpha; attribute float aSize; attribute vec3 color; uniform float uScale; varying float vA; varying vec3 vC;
      void main(){ vA = aAlpha; vC = color; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv; gl_PointSize = aSize * uScale / max(0.5, -mv.z); }`,
    fragmentShader: `varying float vA; varying vec3 vC;
      void main(){ float d = length(gl_PointCoord - 0.5); float a = smoothstep(0.5, ${additive ? '0.05' : '0.25'}, d) * vA; if (a < 0.01) discard; gl_FragColor = vec4(vC, a);
      #include <colorspace_fragment>
      }`,
  });
  const pts = new THREE.Points(g, mat);
  pts.frustumCulled = false; pts.renderOrder = 3;
  return { pts, g, mat, max, n: 0 };
}

export function createFx(scene) {
  const sys = [makeSystem(700, false), makeSystem(400, true)];
  for (const s of sys) scene.add(s.pts);
  const parts = []; // {sys, x,y,z, vx,vy,vz, t, life, s0, s1, r,g,b, a, drag, grav}
  const free = [];

  function spawn(type, x, y, z, { vx = 0, vy = 0, vz = 0, spread = 0.3, n = 1, color, size = 1, up = 0.5 } = {}) {
    const T = TYPES[type];
    for (let i = 0; i < n; i++) {
      const p = free.pop() || {};
      p.sys = T.blend; p.x = x + (Math.random() - 0.5) * spread; p.y = y + Math.random() * spread * 0.4; p.z = z + (Math.random() - 0.5) * spread;
      p.vx = vx + (Math.random() - 0.5) * spread * 4; p.vy = vy + Math.random() * up * 3; p.vz = vz + (Math.random() - 0.5) * spread * 4;
      p.t = 0; p.life = T.life[0] + Math.random() * (T.life[1] - T.life[0]);
      p.s0 = T.size[0] * size; p.s1 = T.size[1] * size;
      const c = color || T.color; p.r = c[0]; p.g = c[1]; p.b = c[2];
      p.a = T.alpha; p.drag = T.drag; p.grav = T.grav;
      parts.push(p);
    }
    if (parts.length > 1000) parts.splice(0, parts.length - 1000).forEach((q) => free.push(q));
  }

  // skid marks: a ring buffer of dark quads lying on the road
  const SK = 160;
  const skGeo = new THREE.PlaneGeometry(0.22, 0.9); skGeo.rotateX(-Math.PI / 2);
  const skid = new THREE.InstancedMesh(skGeo, new THREE.MeshBasicMaterial({ color: 0x1a1a1e, transparent: true, opacity: 0.55, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3 }), SK);
  skid.count = 0; skid.frustumCulled = false; scene.add(skid);
  let skI = 0;
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), v = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1);
  function skidMark(x, z, heading) {
    q.setFromAxisAngle(up, heading); v.set(x, 0.12, z);
    skid.setMatrixAt(skI, m4.compose(v, q, one)); skI = (skI + 1) % SK; skid.count = Math.max(skid.count, skI === 0 ? SK : skI);
    skid.instanceMatrix.needsUpdate = true;
  }
  function clearSkids() { skid.count = 0; skI = 0; }

  function update(dt, camera, renderer) {
    const scale = renderer.getDrawingBufferSize(new THREE.Vector2()).y / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2));
    for (const s of sys) { s.mat.uniforms.uScale.value = scale; s.n = 0; }
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      p.t += dt;
      if (p.t >= p.life) { free.push(p); parts[i] = parts[parts.length - 1]; parts.pop(); continue; }
      const k = Math.exp(-p.drag * dt);
      p.vx *= k; p.vz *= k; p.vy = p.vy * k - p.grav * dt;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      if (p.y < 0.12 && p.grav > 0) { p.y = 0.12; p.vy *= -0.3; }
      const s = sys[p.sys];
      if (s.n >= s.max) continue;
      const f = p.t / p.life, j = s.n++;
      const P = s.g.attributes.position.array, C = s.g.attributes.color.array, A = s.g.attributes.aAlpha.array, Z = s.g.attributes.aSize.array;
      P[j * 3] = p.x; P[j * 3 + 1] = p.y; P[j * 3 + 2] = p.z;
      C[j * 3] = p.r; C[j * 3 + 1] = p.g; C[j * 3 + 2] = p.b;
      A[j] = p.a * (f < 0.15 ? f / 0.15 : 1 - (f - 0.15) / 0.85);
      Z[j] = p.s0 + (p.s1 - p.s0) * f;
    }
    for (const s of sys) {
      s.g.setDrawRange(0, s.n);
      for (const k of ['position', 'color', 'aAlpha', 'aSize']) s.g.attributes[k].needsUpdate = true;
    }
  }
  function clear() { while (parts.length) free.push(parts.pop()); }
  return { spawn, update, skidMark, clearSkids, clear };
}

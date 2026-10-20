// Weather: rain that comes and goes over the in-game day. Shader rain (no per-frame CPU work), wet city, grey sky,
// rain pay bonus. Pure state is in `W` so the economy can read it; visuals attach to the scene.
import * as THREE from 'three';
import { mulberry32 } from './rng.js';

export const RAIN_PAY = 1.25;
export const W = { rain: 0, target: 0, forcedUntil: -1, day: -1, windows: [] };
export const rainBonus = () => (W.rain > 0.35 ? RAIN_PAY : 1);

// one or two rain windows on some days, seeded by the day number so a reload keeps the same weather
function planDay(day) {
  const r = mulberry32(day * 7919 + 13);
  const w = [];
  if (day >= 2 && r() < 0.45) { const s = (9 + r() * 10) * 60; w.push([s, s + (60 + r() * 150)]); }
  if (day >= 3 && r() < 0.2) { const s = (16 + r() * 6) * 60; w.push([s, s + (45 + r() * 90)]); }
  return w;
}

export function createWeather(scene, cityMaterials) {
  // rain streaks: instanced thin quads; the vertex shader drops them through a box that follows the camera
  const N = 1800, BOX = 46, H = 26;
  const base = new THREE.PlaneGeometry(0.035, 1.1);
  const geo = new THREE.InstancedBufferGeometry();
  geo.index = base.index; geo.setAttribute('position', base.getAttribute('position')); geo.setAttribute('uv', base.getAttribute('uv'));
  const off = new Float32Array(N * 4);
  for (let i = 0; i < N; i++) { off[i * 4] = Math.random() * BOX; off[i * 4 + 1] = Math.random() * H; off[i * 4 + 2] = Math.random() * BOX; off[i * 4 + 3] = 0.7 + Math.random() * 0.6; }
  geo.setAttribute('aOff', new THREE.InstancedBufferAttribute(off, 4));
  geo.instanceCount = N;
  const uni = { uTime: { value: 0 }, uCam: { value: new THREE.Vector3() }, uRain: { value: 0 }, uWind: { value: new THREE.Vector2(1.6, 0.8) } };
  const mat = new THREE.ShaderMaterial({
    uniforms: uni, transparent: true, depthWrite: false, fog: false,
    vertexShader: `attribute vec4 aOff; uniform float uTime, uRain; uniform vec3 uCam; uniform vec2 uWind; varying float vA; varying vec2 vUv;
      void main(){
        float B = ${BOX.toFixed(1)}, Hh = ${H.toFixed(1)};
        float fall = uTime * 17.0 * aOff.w;
        vec3 c;
        c.y = mod(aOff.y - fall, Hh) + uCam.y - Hh * 0.55;
        c.x = uCam.x + mod(aOff.x + uWind.x * fall * 0.06 - uCam.x, B) - B * 0.5;
        c.z = uCam.z + mod(aOff.z + uWind.y * fall * 0.06 - uCam.z, B) - B * 0.5;
        // face the camera around the vertical axis, lean with the wind
        vec3 toCam = normalize(vec3(uCam.x - c.x, 0.0, uCam.z - c.z));
        vec3 side = vec3(toCam.z, 0.0, -toCam.x);
        vec3 p = c + side * position.x + vec3(uWind.x * 0.06, 1.0, uWind.y * 0.06) * position.y * aOff.w;
        // only some of the streaks show in light rain
        vA = step(fract(aOff.w * 7.31), uRain) * 0.55;
        vUv = uv;
        gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
      }`,
    fragmentShader: `varying float vA; varying vec2 vUv; void main(){ if (vA < 0.01) discard; float a = vA * smoothstep(0.0, 0.35, vUv.y) * smoothstep(1.0, 0.6, vUv.y); gl_FragColor = vec4(0.78, 0.86, 0.95, a); }`,
  });
  const rain = new THREE.Mesh(geo, mat);
  rain.frustumCulled = false; rain.renderOrder = 4; rain.visible = false;
  scene.add(rain);

  const wet = new THREE.Color(0.66, 0.7, 0.8), white = new THREE.Color(1, 1, 1);
  let lastWet = -1;
  function update(dt, clock, day, camera) {
    if (W.day !== day) { W.day = day; W.windows = planDay(day); W.forcedUntil = -1; }
    W.clock = clock;
    const scheduled = W.windows.some(([a, b]) => clock >= a && clock < b);
    W.target = scheduled || clock < W.forcedUntil ? 1 : 0;
    W.rain += (W.target - W.rain) * Math.min(1, dt * 0.35);
    if (W.rain < 0.002) W.rain = 0;
    uni.uTime.value += dt; uni.uRain.value = W.rain; uni.uCam.value.copy(camera.position);
    rain.visible = W.rain > 0.01;
    // wet streets: darker, cooler colours
    if (Math.abs(W.rain - lastWet) > 0.01) {
      lastWet = W.rain;
      for (const m of cityMaterials.values()) m.color.copy(white).lerp(wet, W.rain * 0.85);
    }
  }
  function startRain(gameMinutes = 120) { W.forcedUntil = (W.clock || 0) + gameMinutes; W.rain = Math.max(W.rain, 0.35); }
  return { update, startRain, get rain() { return W.rain; }, W };
}

// Sky dome, sun/moon, hemisphere light, fog — all driven by the in-game clock.
import * as THREE from 'three';

const KEYS = [ // minute of day → look
  { t: 6 * 60, top: '#24345e', hor: '#e8a07a', sun: '#ffb27a', si: 1.2, hemiS: '#8aa0d0', hemiG: '#6a5a50', hi: 0.7, elev: 2, fog: '#d9a690' },
  { t: 8 * 60, top: '#6fb7ea', hor: '#ffe3bf', sun: '#ffe7c4', si: 2.5, hemiS: '#cfe6ff', hemiG: '#a48a66', hi: 1.15, elev: 22, fog: '#f2dcc0' },
  { t: 12 * 60, top: '#4ea9ea', hor: '#cfeaff', sun: '#fffaf0', si: 2.9, hemiS: '#d8eeff', hemiG: '#9c8a6a', hi: 1.25, elev: 58, fog: '#cfe3f2' },
  { t: 16 * 60, top: '#5aa6e4', hor: '#ffe0b3', sun: '#ffe2b0', si: 2.7, hemiS: '#d6e8ff', hemiG: '#a08460', hi: 1.15, elev: 34, fog: '#f0dcc0' },
  { t: 18 * 60, top: '#5d8fd0', hor: '#ffb77a', sun: '#ffb46a', si: 2.5, hemiS: '#c8d4f0', hemiG: '#9a7454', hi: 1.0, elev: 14, fog: '#f2c49a' },
  { t: 19.5 * 60, top: '#3a4f8f', hor: '#ff8a5c', sun: '#ff8a50', si: 1.7, hemiS: '#a8a8d8', hemiG: '#7a5a50', hi: 0.85, elev: 4, fog: '#d98a76' },
  { t: 20.75 * 60, top: '#1c2650', hor: '#7a4f88', sun: '#9fb0ff', si: 0.55, hemiS: '#6c78b8', hemiG: '#3e3448', hi: 0.6, elev: 30, fog: '#4c3f6a', night: 1 },
  { t: 23 * 60, top: '#0a1230', hor: '#27305e', sun: '#9fb0ff', si: 0.5, hemiS: '#4c5a9a', hemiG: '#2a2a40', hi: 0.55, elev: 45, fog: '#1e2448', night: 1 },
  { t: 26 * 60, top: '#0a1230', hor: '#27305e', sun: '#9fb0ff', si: 0.5, hemiS: '#4c5a9a', hemiG: '#2a2a40', hi: 0.55, elev: 45, fog: '#1e2448', night: 1 },
];
const C = (h) => new THREE.Color(h);
const keys = KEYS.map((k) => ({ ...k, top: C(k.top), hor: C(k.hor), sun: C(k.sun), hemiS: C(k.hemiS), hemiG: C(k.hemiG), fog: C(k.fog) }));

export function createSky(scene) {
  const uni = { top: { value: new THREE.Color() }, hor: { value: new THREE.Color() }, sunDir: { value: new THREE.Vector3(0, 1, 0) }, sunCol: { value: new THREE.Color() }, night: { value: 0 } };
  const dome = new THREE.Mesh(new THREE.SphereGeometry(1800, 32, 16), new THREE.ShaderMaterial({
    uniforms: uni, side: THREE.BackSide, depthWrite: false, fog: false,
    vertexShader: 'varying vec3 vD; void main(){ vD = normalize(position); vec4 p = modelViewMatrix*vec4(position,1.0); gl_Position = projectionMatrix*p; gl_Position.z = gl_Position.w; }',
    fragmentShader: `uniform vec3 top, hor, sunDir, sunCol; uniform float night; varying vec3 vD;
      float hash(vec3 p){ return fract(sin(dot(p, vec3(12.9898,78.233,45.164)))*43758.5453); }
      void main(){
        float h = clamp(vD.y, -0.2, 1.0);
        vec3 c = mix(hor, top, pow(smoothstep(-0.02, 0.6, h), 0.8));
        float s = max(dot(normalize(vD), normalize(sunDir)), 0.0);
        c += sunCol * (pow(s, 600.0) * 4.0 * (1.0 - night*0.5) + pow(s, 12.0) * 0.35 * (1.0 - night*0.7));
        if (night > 0.0) { vec3 q = floor(vD * 260.0); float st = step(0.9965, hash(q)) * smoothstep(0.05, 0.4, h); c += vec3(st) * night * 0.9; }
        c = mix(c, hor*0.85, smoothstep(0.0, -0.2, vD.y));
        gl_FragColor = vec4(c, 1.0);
        #include <colorspace_fragment>
      }`,
  }));
  dome.renderOrder = -10; dome.frustumCulled = false;
  scene.add(dome);

  const hemi = new THREE.HemisphereLight(0xffffff, 0x888888, 1);
  const sun = new THREE.DirectionalLight(0xffffff, 2.5);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.6;
  const sc = sun.shadow.camera; sc.near = 1; sc.far = 600;
  scene.add(hemi, sun, sun.target);
  scene.fog = new THREE.Fog(0xffffff, 80, 400);

  const tmp = { top: new THREE.Color(), hor: new THREE.Color(), sun: new THREE.Color(), hemiS: new THREE.Color(), hemiG: new THREE.Color(), fog: new THREE.Color() };
  const state = { night: 0, clock: 480, rain: 0 };
  const RAIN = { top: new THREE.Color(0x6c7787), hor: new THREE.Color(0x9ca5b2), fog: new THREE.Color(0x8f98a5), sun: new THREE.Color(0xc9d0da) };
  const rc = new THREE.Color();
  function set(clock) {
    let m = clock; if (m < keys[0].t) m += 24 * 60;
    let a = keys[0], b = keys[1];
    for (let i = 0; i < keys.length - 1; i++) if (m >= keys[i].t && m <= keys[i + 1].t) { a = keys[i]; b = keys[i + 1]; break; }
    const f = (m - a.t) / Math.max(1, b.t - a.t);
    for (const k of ['top', 'hor', 'sun', 'hemiS', 'hemiG', 'fog']) tmp[k].copy(a[k]).lerp(b[k], f);
    const si = a.si + (b.si - a.si) * f, hi = a.hi + (b.hi - a.hi) * f, elev = a.elev + (b.elev - a.elev) * f;
    const night = (a.night || 0) + ((b.night || 0) - (a.night || 0)) * f;
    // sun travels east → west over the day; moon from the east again at night
    const dayF = THREE.MathUtils.clamp((clock - 6 * 60) / (14.5 * 60), 0, 1);
    const az = night > 0.5 ? -0.9 : THREE.MathUtils.lerp(-1.9, 1.9, dayF);
    const el = THREE.MathUtils.degToRad(Math.max(3, elev));
    state.dir = new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el) * 0.6 + 0.4).normalize();
    const r = state.rain || 0;
    if (r > 0) {
      const dark = 1 - 0.65 * night;
      for (const k of ['top', 'hor', 'fog']) tmp[k].lerp(rc.copy(RAIN[k]).multiplyScalar(dark), r * 0.8);
      tmp.sun.lerp(RAIN.sun, r * 0.7);
    }
    uni.top.value.copy(tmp.top); uni.hor.value.copy(tmp.hor); uni.sunCol.value.copy(tmp.sun); uni.sunDir.value.copy(state.dir); uni.night.value = night;
    sun.color.copy(tmp.sun); sun.intensity = si * (1 - 0.62 * r);
    hemi.color.copy(tmp.hemiS); hemi.groundColor.copy(tmp.hemiG); hemi.intensity = hi * (1 - 0.1 * r);
    scene.fog.color.copy(tmp.fog);
    state.night = night; state.clock = clock;
  }
  // keep the shadow frustum around a focus point
  function focus(x, z, size, cam) {
    const d = state.dir || new THREE.Vector3(0.3, 0.8, 0.4);
    sun.target.position.set(x, 0, z);
    sun.position.set(x + d.x * 300, d.y * 300, z + d.z * 300);
    const s = size / 2;
    if (sc.right !== s) { sc.left = -s; sc.right = s; sc.top = s; sc.bottom = -s; sc.updateProjectionMatrix(); }
    if (cam) dome.position.copy(cam.position);
  }
  set(480);
  return { dome, sun, hemi, set, focus, state, uni };
}

// Sky dome, sun/moon, hemisphere light, fog — all driven by the in-game clock.
import * as THREE from 'three';

const KEYS = [ // minute of day → look (saturated "toy city" palette: deep blue sky, warm sun, cool bluish fill)
  { t: 6 * 60, top: '#34539c', hor: '#ffc19a', sun: '#ffb27a', si: 1.4, hemiS: '#9fb4e6', hemiG: '#7a5e50', hi: 1.0, elev: 3, fog: '#f2bca0', cl: '#ffd2b8', cs: '#a08aa8' },
  { t: 8 * 60, top: '#2f7fe0', hor: '#cdeaff', sun: '#ffe6bf', si: 2.5, hemiS: '#cfe0f7', hemiG: '#c09a70', hi: 1.5, elev: 24, fog: '#cfe5f7', cl: '#ffffff', cs: '#a9bcd8' },
  { t: 12 * 60, top: '#2477de', hor: '#c2e3fb', sun: '#fff1da', si: 2.7, hemiS: '#d0e2f8', hemiG: '#b8966e', hi: 1.55, elev: 52, fog: '#c6e1f6', cl: '#ffffff', cs: '#a4b8d6' },
  { t: 16 * 60, top: '#2c7ddb', hor: '#d6ebfa', sun: '#ffe2b0', si: 2.65, hemiS: '#d2e0f5', hemiG: '#bf9466', hi: 1.5, elev: 34, fog: '#d3e6f4', cl: '#fffaf0', cs: '#acb9d4' },
  { t: 18 * 60, top: '#3f74c8', hor: '#ffcf96', sun: '#ffbc72', si: 2.45, hemiS: '#c4cdf0', hemiG: '#a07454', hi: 1.35, elev: 13, fog: '#f4cfa2', cl: '#ffe2bd', cs: '#b39aa8' },
  { t: 19.5 * 60, top: '#34468a', hor: '#ff9160', sun: '#ff8a50', si: 1.8, hemiS: '#a8a8d8', hemiG: '#7a5a50', hi: 0.85, elev: 4, fog: '#de8e78', cl: '#ffb08a', cs: '#7a6890' },
  { t: 20.75 * 60, top: '#1c2650', hor: '#7a4f88', sun: '#9fb0ff', si: 0.55, hemiS: '#6c78b8', hemiG: '#3e3448', hi: 0.6, elev: 30, fog: '#4c3f6a', cl: '#8a7aa0', cs: '#3c3658', night: 1 },
  { t: 23 * 60, top: '#0a1230', hor: '#27305e', sun: '#9fb0ff', si: 0.5, hemiS: '#4c5a9a', hemiG: '#2a2a40', hi: 0.55, elev: 45, fog: '#1e2448', cl: '#4a5278', cs: '#1c2240', night: 1 },
  { t: 26 * 60, top: '#0a1230', hor: '#27305e', sun: '#9fb0ff', si: 0.5, hemiS: '#4c5a9a', hemiG: '#2a2a40', hi: 0.55, elev: 45, fog: '#1e2448', cl: '#4a5278', cs: '#1c2240', night: 1 },
];
const C = (h) => new THREE.Color(h);
const COLS = ['top', 'hor', 'sun', 'hemiS', 'hemiG', 'fog', 'cl', 'cs'];
const keys = KEYS.map((k) => { const o = { ...k }; for (const c of COLS) o[c] = C(k[c]); return o; });

export function createSky(scene) {
  const uni = { top: { value: new THREE.Color() }, hor: { value: new THREE.Color() }, sunDir: { value: new THREE.Vector3(0, 1, 0) }, sunCol: { value: new THREE.Color() }, night: { value: 0 },
    cl: { value: new THREE.Color() }, cs: { value: new THREE.Color() }, uTime: { value: 0 }, uCover: { value: 0.5 } };
  const dome = new THREE.Mesh(new THREE.SphereGeometry(1800, 48, 24), new THREE.ShaderMaterial({
    uniforms: uni, side: THREE.BackSide, depthWrite: false, fog: false,
    vertexShader: 'varying vec3 vD; void main(){ vD = normalize(position); vec4 p = modelViewMatrix*vec4(position,1.0); gl_Position = projectionMatrix*p; gl_Position.z = gl_Position.w; }',
    fragmentShader: `precision highp float;
      uniform vec3 top, hor, sunDir, sunCol, cl, cs; uniform float night, uTime, uCover; varying vec3 vD;
      float hash(vec3 p){ return fract(sin(dot(p, vec3(12.9898,78.233,45.164)))*43758.5453); }
      float h2(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
      float vn(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f*f*(3.0-2.0*f);
        return mix(mix(h2(i), h2(i+vec2(1.0,0.0)), u.x), mix(h2(i+vec2(0.0,1.0)), h2(i+vec2(1.0,1.0)), u.x), u.y); }
      float fbm(vec2 p){ float a = 0.5, s = 0.0; for (int i = 0; i < 5; i++){ s += a * vn(p); p = p * 2.07 + vec2(3.1, 1.7); a *= 0.5; } return s; }
      void main(){
        vec3 d = normalize(vD);
        float h = clamp(d.y, -0.2, 1.0);
        vec3 c = mix(hor, top, pow(smoothstep(-0.02, 0.62, h), 0.75));
        float s = max(dot(d, normalize(sunDir)), 0.0);
        c += sunCol * (pow(s, 900.0) * 5.0 * (1.0 - night*0.5) + pow(s, 14.0) * 0.28 * (1.0 - night*0.7) + pow(s, 3.0) * 0.08);
        if (night > 0.0) { vec3 q = floor(d * 260.0); float st = step(0.9965, hash(q)) * smoothstep(0.05, 0.4, h); c += vec3(st) * night * 0.9; }
        // puffy cumulus: a flat cloud deck seen in perspective, thickest just above the skyline
        if (d.y > 0.0) {
          vec2 cp = d.xz / (d.y + 0.12) * 0.55 + vec2(uTime * 0.006, uTime * 0.0025);
          float base = fbm(cp * 0.9);
          float detail = fbm(cp * 3.1 + 7.0);
          float n = base * 0.78 + detail * 0.3;
          float thr = 0.62 - uCover * 0.2;
          float cov = smoothstep(thr, thr + 0.09, n);
          float band = smoothstep(0.015, 0.09, d.y) * (1.0 - smoothstep(0.32, 0.75, d.y) * 0.75);
          cov *= band;
          // self-shadowing: denser toward the sun = lit rims, darker bellies
          float n2 = fbm((cp + normalize(sunDir.xz + 1e-4) * 0.05) * 0.9) * 0.78 + detail * 0.3;
          float lit = clamp(0.62 + (n - n2) * 5.0 + (n - thr) * 1.6, 0.0, 1.0);
          vec3 cc = mix(cs, cl, lit);
          cc += sunCol * pow(s, 8.0) * 0.25 * (1.0 - cov);
          c = mix(c, cc, cov * 0.97);
        }
        c = mix(c, hor*0.9, smoothstep(0.0, -0.2, vD.y));
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

  const tmp = {}; for (const c of COLS) tmp[c] = new THREE.Color();
  const state = { night: 0, clock: 480, rain: 0 };
  const RAIN = { top: new THREE.Color(0x6c7787), hor: new THREE.Color(0x9ca5b2), fog: new THREE.Color(0x8f98a5), sun: new THREE.Color(0xc9d0da) };
  const rc = new THREE.Color();
  function set(clock) {
    let m = clock; if (m < keys[0].t) m += 24 * 60;
    let a = keys[0], b = keys[1];
    for (let i = 0; i < keys.length - 1; i++) if (m >= keys[i].t && m <= keys[i + 1].t) { a = keys[i]; b = keys[i + 1]; break; }
    const f = (m - a.t) / Math.max(1, b.t - a.t);
    for (const k of COLS) tmp[k].copy(a[k]).lerp(b[k], f);
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
      tmp.cl.lerp(rc.copy(RAIN.hor).multiplyScalar(dark), r * 0.7); tmp.cs.lerp(rc.copy(RAIN.top).multiplyScalar(dark * 0.8), r * 0.8);
    }
    uni.cl.value.copy(tmp.cl); uni.cs.value.copy(tmp.cs); uni.uCover.value = 0.45 + r * 0.55;
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
    uni.uTime.value = performance.now() / 1000;
  }
  set(480);
  return { dome, sun, hemi, set, focus, state, uni };
}

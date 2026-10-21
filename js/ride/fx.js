// Ride effects in the game's toy style: puffy cartoon smoke, layered turbo flames, glowing spark streaks, water drops,
// coins and banknotes, sparkles and stars, confetti, debris, ground ripples and a comic crash burst — plus skid marks.
//
// One sprite sheet (drawn on a canvas at start-up) and two instanced draw calls (normal + additive blending). Each
// particle is a camera-facing quad that can spin, flip like a coin, stretch along its velocity (sparks, drops,
// speed lines) or lie flat on the road (ripples, dust rings). CPU simulation with pooling; smoke dims at night.
import * as THREE from 'three';

// ---------------------------------------------------------------- sprite sheet (4 × 4 cells)
const CELL = 128, GRID = 4;
export const SPR = { puffA: 0, puffB: 1, soft: 2, flame: 3, streak: 4, twinkle: 5, star: 6, coin: 7, bill: 8, drop: 9, ring: 10, confetti: 11, chunk: 12, line: 13, pow: 14, heart: 15 };
let sheet = null;
function makeSheet() {
  if (sheet) return sheet;
  const c = document.createElement('canvas'); c.width = c.height = CELL * GRID;
  const g = c.getContext('2d');
  const rr = (x, y, w, h, r) => { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); };
  const cell = (i, draw) => { g.save(); g.translate((i % GRID) * CELL + CELL / 2, Math.floor(i / GRID) * CELL + CELL / 2); draw(); g.restore(); };
  const rad = (r0, r1, stops) => { const gr = g.createRadialGradient(0, 0, r0, 0, 0, r1); for (const [o, col] of stops) gr.addColorStop(o, col); return gr; };
  // cartoon smoke: overlapping blobs, lit from the top-left, a soft darker belly, feathered edge
  const puff = (blobs) => {
    const shape = (shrink = 0) => { g.beginPath(); for (const [x, y, r] of blobs) { g.moveTo(x + r - shrink, y); g.arc(x, y, r - shrink, 0, Math.PI * 2); } };
    g.save();
    shape(); g.clip();
    const gr = g.createLinearGradient(-30, -45, 25, 50); gr.addColorStop(0, '#ffffff'); gr.addColorStop(0.55, '#e9ecf2'); gr.addColorStop(1, '#a9b0bd');
    g.fillStyle = gr; g.fillRect(-64, -64, 128, 128);
    for (const [x, y, r] of blobs) { g.fillStyle = rad(0, r, [[0, 'rgba(255,255,255,0.55)'], [1, 'rgba(255,255,255,0)']]); g.beginPath(); g.arc(x - r * 0.3, y - r * 0.35, r * 0.75, 0, Math.PI * 2); g.fill(); }
    g.restore();
    // soften the outline: a few shrinking alpha passes
    g.globalCompositeOperation = 'destination-out';
    for (let k = 0; k < 4; k++) { g.lineWidth = 2; g.strokeStyle = `rgba(0,0,0,${0.32 - k * 0.07})`; shape(k * 1.5 - 1); g.stroke(); }
    g.globalCompositeOperation = 'source-over';
  };
  cell(SPR.puffA, () => puff([[-18, 8, 30], [14, 10, 28], [-2, -14, 32], [24, -10, 20], [-30, -6, 18]]));
  cell(SPR.puffB, () => puff([[-14, 12, 26], [16, 4, 30], [0, -16, 28], [-26, -10, 20]]));
  cell(SPR.soft, () => { g.fillStyle = rad(0, 60, [[0, 'rgba(255,255,255,1)'], [0.45, 'rgba(255,255,255,0.55)'], [1, 'rgba(255,255,255,0)']]); g.fillRect(-64, -64, 128, 128); });
  // flame tongue pointing +x (the stretched axis): hot core, soft edge; greyscale, coloured per particle
  cell(SPR.flame, () => {
    g.rotate(Math.PI / 2);
    g.beginPath(); g.moveTo(0, -58); g.bezierCurveTo(26, -18, 34, 18, 0, 46); g.bezierCurveTo(-34, 18, -26, -18, 0, -58);
    const gr = g.createLinearGradient(0, 46, 0, -58); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.45, 'rgba(255,255,255,0.75)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fill();
    g.fillStyle = rad(0, 24, [[0, 'rgba(255,255,255,1)'], [1, 'rgba(255,255,255,0)']]); g.beginPath(); g.arc(0, 18, 24, 0, Math.PI * 2); g.fill();
  });
  // spark streak (stretched along velocity in the shader)
  cell(SPR.streak, () => { g.scale(1, 0.22); g.fillStyle = rad(0, 60, [[0, 'rgba(255,255,255,1)'], [0.25, 'rgba(255,255,255,0.9)'], [1, 'rgba(255,255,255,0)']]); g.beginPath(); g.arc(0, 0, 60, 0, Math.PI * 2); g.fill(); });
  // four-point twinkle
  cell(SPR.twinkle, () => {
    g.fillStyle = rad(0, 26, [[0, 'rgba(255,255,255,1)'], [1, 'rgba(255,255,255,0)']]); g.beginPath(); g.arc(0, 0, 26, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#fff';
    for (const a of [0, Math.PI / 2]) { g.save(); g.rotate(a); g.beginPath(); g.moveTo(0, -58); g.quadraticCurveTo(5, -5, 58, 0); g.quadraticCurveTo(5, 5, 0, 58); g.quadraticCurveTo(-5, 5, -58, 0); g.quadraticCurveTo(-5, -5, 0, -58); g.fill(); g.restore(); }
  });
  // cartoon star with a soft shade and outline (white; tinted per particle)
  cell(SPR.star, () => {
    g.beginPath(); for (let i = 0; i < 10; i++) { const r = i % 2 ? 22 : 52, a = -Math.PI / 2 + i * Math.PI / 5; g.lineTo(Math.cos(a) * r, Math.sin(a) * r + 4); } g.closePath();
    const gr = g.createLinearGradient(-20, -40, 20, 50); gr.addColorStop(0, '#ffffff'); gr.addColorStop(1, '#d7d7d7'); g.fillStyle = gr; g.fill();
    g.lineJoin = 'round'; g.lineWidth = 5; g.strokeStyle = 'rgba(120,90,40,0.35)'; g.stroke();
    g.fillStyle = 'rgba(255,255,255,0.9)'; g.beginPath(); g.ellipse(-10, -12, 9, 5, -0.6, 0, Math.PI * 2); g.fill();
  });
  // gold coin (drawn in colour)
  cell(SPR.coin, () => {
    g.fillStyle = '#b8771a'; g.beginPath(); g.arc(0, 4, 48, 0, Math.PI * 2); g.fill();
    const gr = g.createLinearGradient(-30, -40, 30, 40); gr.addColorStop(0, '#fff2a8'); gr.addColorStop(0.5, '#ffcf3a'); gr.addColorStop(1, '#e89a1c');
    g.fillStyle = gr; g.beginPath(); g.arc(0, 0, 48, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#d68a16'; g.lineWidth = 5; g.beginPath(); g.arc(0, 0, 36, 0, Math.PI * 2); g.stroke();
    g.fillStyle = '#c17812'; g.font = 'bold 54px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('$', 0, 3);
    g.fillStyle = 'rgba(255,255,255,0.7)'; g.beginPath(); g.ellipse(-18, -22, 12, 6, -0.7, 0, Math.PI * 2); g.fill();
  });
  // banknote (drawn in colour)
  cell(SPR.bill, () => {
    g.fillStyle = '#3f9a3a'; rr(-56, -30, 112, 60, 8); g.fill();
    g.fillStyle = '#8fe07a'; rr(-50, -24, 100, 48, 5); g.fill();
    g.fillStyle = '#4fb04a'; g.beginPath(); g.arc(0, 0, 17, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#ffffff'; g.font = 'bold 26px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('$', 0, 1);
  });
  // water drop pointing +x (stretched along velocity)
  cell(SPR.drop, () => {
    g.rotate(-Math.PI / 2);
    g.beginPath(); g.moveTo(0, -50); g.bezierCurveTo(22, -8, 30, 22, 0, 40); g.bezierCurveTo(-30, 22, -22, -8, 0, -50);
    const gr = g.createLinearGradient(-20, -30, 20, 40); gr.addColorStop(0, 'rgba(235,250,255,0.95)'); gr.addColorStop(1, 'rgba(120,190,235,0.9)');
    g.fillStyle = gr; g.fill(); g.fillStyle = 'rgba(255,255,255,0.95)'; g.beginPath(); g.ellipse(-8, 10, 6, 10, 0.3, 0, Math.PI * 2); g.fill();
  });
  cell(SPR.ring, () => {
    for (let k = 0; k < 3; k++) { g.lineWidth = 10 - k * 3; g.strokeStyle = `rgba(255,255,255,${0.35 + k * 0.3})`; g.beginPath(); g.arc(0, 0, 50, 0, Math.PI * 2); g.stroke(); }
  });
  cell(SPR.confetti, () => { g.fillStyle = '#fff'; rr(-34, -20, 68, 40, 6); g.fill(); g.fillStyle = 'rgba(0,0,0,0.12)'; g.fillRect(-34, 6, 68, 14); });
  cell(SPR.chunk, () => {
    g.beginPath(); const pts = [[-30, -26], [8, -40], [36, -12], [28, 26], [-6, 36], [-38, 10]];
    g.moveTo(pts[0][0], pts[0][1]); for (const p of pts.slice(1)) g.lineTo(p[0], p[1]); g.closePath();
    const gr = g.createLinearGradient(-30, -40, 30, 40); gr.addColorStop(0, '#ffffff'); gr.addColorStop(1, '#9a9a9a'); g.fillStyle = gr; g.fill();
  });
  cell(SPR.line, () => { g.scale(1, 0.12); g.fillStyle = rad(0, 62, [[0, 'rgba(255,255,255,0.95)'], [1, 'rgba(255,255,255,0)']]); g.beginPath(); g.arc(0, 0, 62, 0, Math.PI * 2); g.fill(); });
  // comic impact burst (drawn in colour)
  cell(SPR.pow, () => {
    const burst = (r0, r1, n) => { g.beginPath(); for (let i = 0; i < n * 2; i++) { const r = i % 2 ? r0 : r1 * (0.85 + ((i * 37) % 10) / 50), a = i * Math.PI / n; g.lineTo(Math.cos(a) * r, Math.sin(a) * r); } g.closePath(); };
    burst(30, 60, 11); g.fillStyle = '#ff4b2b'; g.fill();
    burst(22, 46, 11); g.fillStyle = '#ffd23f'; g.fill();
    g.fillStyle = '#fffbe6'; g.beginPath(); g.arc(0, 0, 20, 0, Math.PI * 2); g.fill();
  });
  cell(SPR.heart, () => {
    g.beginPath(); g.moveTo(0, 40); g.bezierCurveTo(-60, 0, -36, -48, 0, -20); g.bezierCurveTo(36, -48, 60, 0, 0, 40);
    const gr = g.createLinearGradient(0, -40, 0, 40); gr.addColorStop(0, '#ff8fb8'); gr.addColorStop(1, '#ff3d7a'); g.fillStyle = gr; g.fill();
    g.fillStyle = 'rgba(255,255,255,0.8)'; g.beginPath(); g.ellipse(-18, -16, 9, 6, -0.6, 0, Math.PI * 2); g.fill();
  });
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace; tex.minFilter = THREE.LinearMipmapLinearFilter;
  sheet = tex;
  return tex;
}

// ---------------------------------------------------------------- GPU side
const VERT = `
attribute vec3 iPos; attribute vec3 iVel; attribute vec4 iCol; attribute vec4 iMisc; // misc: size, rot, sprite, mode
attribute float iFlip;
uniform float uStretch; varying vec2 vUv; varying vec4 vCol;
void main(){
  float size = iMisc.x, rot = iMisc.y, spr = iMisc.z, mode = iMisc.w; // mode 0 billboard, 1 stretched along velocity, 2 flat on the ground
  vec2 c = position.xy;
  c.x *= iFlip;
  float cs = cos(rot), sn = sin(rot);
  vec4 mv;
  if (mode > 1.5) {
    vec2 r = vec2(c.x * cs - c.y * sn, c.x * sn + c.y * cs) * size;
    mv = viewMatrix * vec4(iPos + vec3(r.x, 0.0, r.y), 1.0);
  } else {
    mv = viewMatrix * vec4(iPos, 1.0);
    if (mode > 0.5) {
      vec2 v = (viewMatrix * vec4(iVel, 0.0)).xy; float l = length(v);
      vec2 ax = l > 1e-4 ? v / l : vec2(1.0, 0.0), ay = vec2(-ax.y, ax.x);
      float len = size * (1.0 + min(3.0, l * uStretch));
      mv.xy += ax * c.x * len + ay * c.y * size * 0.55;
    } else {
      mv.xy += vec2(c.x * cs - c.y * sn, c.x * sn + c.y * cs) * size;
    }
  }
  gl_Position = projectionMatrix * mv;
  vec2 cell = vec2(mod(spr, ${GRID}.0), floor(spr / ${GRID}.0));
  vUv = vec2(cell.x + position.x + 0.5, ${GRID}.0 - (cell.y + 0.5 - position.y)) / ${GRID}.0;
  vCol = iCol;
}`;
const FRAG = (additive) => `
uniform sampler2D uSheet; uniform float uLight; varying vec2 vUv; varying vec4 vCol;
void main(){
  vec4 t = texture2D(uSheet, vUv);
  float a = t.a * vCol.a;
  if (a < 0.004) discard;
  vec3 col = t.rgb * vCol.rgb${additive ? '' : ' * uLight'};
  gl_FragColor = vec4(col, a);
  #include <colorspace_fragment>
}`;

function makeSystem(max, additive) {
  const base = new THREE.PlaneGeometry(1, 1);
  const geo = new THREE.InstancedBufferGeometry();
  geo.index = base.index; geo.setAttribute('position', base.getAttribute('position'));
  const att = (name, n) => { const a = new THREE.InstancedBufferAttribute(new Float32Array(max * n), n); a.setUsage(THREE.DynamicDrawUsage); geo.setAttribute(name, a); return a; };
  const A = { pos: att('iPos', 3), vel: att('iVel', 3), col: att('iCol', 4), misc: att('iMisc', 4), flip: att('iFlip', 1) };
  geo.instanceCount = 0;
  const mat = new THREE.ShaderMaterial({
    uniforms: { uSheet: { value: makeSheet() }, uLight: { value: 1 }, uStretch: { value: 0.07 } },
    vertexShader: VERT, fragmentShader: FRAG(additive),
    transparent: true, depthWrite: false, fog: false,
    blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false; mesh.renderOrder = additive ? 4 : 3;
  return { mesh, geo, mat, A, max, n: 0 };
}

// ---------------------------------------------------------------- particle kinds
// life [min,max] s · size start→end (m) · col: colour stops over life (rgb 0..1) · a: peak alpha · drag · grav (m/s²
// down; negative rises) · spin rad/s · spr sprite (or list) · mode 0 billboard / 1 stretched / 2 flat · add: additive ·
// bounce · flip: coin-spin rate · ease: size curve
const K = {
  smoke: { life: [0.8, 1.3], size: [0.28, 1.15], col: [[0.97, 0.97, 0.99], [0.86, 0.87, 0.9]], a: 0.62, drag: 2.2, grav: -0.55, spin: 0.8, spr: [SPR.puffA, SPR.puffB], ease: 'out' },
  smokeBlack: { life: [0.85, 1.35], size: [0.32, 1.2], col: [[0.36, 0.35, 0.36], [0.22, 0.22, 0.24]], a: 0.72, drag: 2.0, grav: -0.5, spin: 0.7, spr: [SPR.puffA, SPR.puffB], ease: 'out' },
  tireSmoke: { life: [0.7, 1.1], size: [0.3, 1.3], col: [[0.93, 0.93, 0.95], [0.8, 0.81, 0.84]], a: 0.5, drag: 3, grav: -0.35, spin: 0.6, spr: [SPR.puffA, SPR.puffB], ease: 'out' },
  dust: { life: [0.5, 0.9], size: [0.3, 1.25], col: [[0.88, 0.78, 0.62], [0.8, 0.72, 0.6]], a: 0.7, drag: 3.6, grav: -0.25, spin: 0.9, spr: [SPR.puffA, SPR.puffB], ease: 'out' },
  flameCore: { life: [0.09, 0.14], size: [0.62, 0.24], col: [[1, 1, 0.92], [1, 0.82, 0.4]], a: 1, drag: 1, grav: -1, spin: 0, spr: SPR.flame, add: true, mode: 1 },
  flame: { life: [0.13, 0.24], size: [0.85, 0.2], col: [[1, 0.78, 0.3], [1, 0.42, 0.08], [0.75, 0.12, 0.05]], a: 0.95, drag: 1.2, grav: -1.5, spin: 0, spr: SPR.flame, add: true, mode: 1 },
  ember: { life: [0.3, 0.6], size: [0.14, 0.04], col: [[1, 0.85, 0.4], [1, 0.4, 0.1]], a: 1, drag: 1.5, grav: -1, spin: 0, spr: SPR.streak, add: true, mode: 1 },
  spark: { life: [0.3, 0.55], size: [0.17, 0.05], col: [[1, 0.95, 0.7], [1, 0.62, 0.2]], a: 1, drag: 0.8, grav: 9, spin: 0, spr: SPR.streak, add: true, mode: 1, bounce: 0.35 },
  drop: { life: [0.45, 0.75], size: [0.24, 0.13], col: [[0.95, 0.99, 1], [0.8, 0.92, 1]], a: 1, drag: 0.5, grav: 11, spin: 0, spr: SPR.drop, mode: 1 },
  mist: { life: [0.4, 0.75], size: [0.35, 1.2], col: [[0.9, 0.96, 1], [0.84, 0.93, 1]], a: 0.45, drag: 3, grav: -0.2, spin: 0.5, spr: SPR.soft },
  ripple: { life: [0.55, 0.85], size: [0.3, 1.9], col: [[0.95, 0.99, 1], [0.75, 0.9, 1]], a: 0.95, drag: 0, grav: 0, spin: 0, spr: SPR.ring, mode: 2, ease: 'out' },
  dustRing: { life: [0.35, 0.55], size: [0.4, 2.2], col: [[0.93, 0.85, 0.72], [0.87, 0.79, 0.66]], a: 0.55, drag: 0, grav: 0, spin: 0, spr: SPR.ring, mode: 2, ease: 'out' },
  chunk: { life: [0.5, 0.9], size: [0.17, 0.13], col: [[0.66, 0.62, 0.56], [0.55, 0.52, 0.48]], a: 1, drag: 0.6, grav: 12, spin: 9, spr: SPR.chunk, bounce: 0.3 },
  twinkle: { life: [0.4, 0.75], size: [0.38, 0.05], col: [[1, 0.98, 0.8], [1, 0.85, 0.4]], a: 1, drag: 2.5, grav: -0.6, spin: 2.5, spr: SPR.twinkle, add: true },
  star: { life: [0.6, 1.0], size: [0.34, 0.1], col: [[1, 0.88, 0.3], [1, 0.75, 0.2]], a: 1, drag: 2.2, grav: 1.2, spin: 4, spr: SPR.star },
  coin: { life: [0.8, 1.15], size: [0.42, 0.3], col: [[1, 1, 1], [1, 1, 1]], a: 1, drag: 1.2, grav: 7, spin: 0, spr: SPR.coin, flip: 14 },
  bill: { life: [0.9, 1.4], size: [0.48, 0.4], col: [[1, 1, 1], [1, 1, 1]], a: 1, drag: 3.2, grav: 1.6, spin: 3, spr: SPR.bill, flip: 6 },
  energy: { life: [0.4, 0.75], size: [0.34, 0.05], col: [[0.75, 0.95, 1], [0.3, 0.7, 1]], a: 1, drag: 2.5, grav: -0.8, spin: 2.5, spr: SPR.twinkle, add: true },
  flash: { life: [0.12, 0.18], size: [0.6, 2.2], col: [[1, 0.95, 0.8], [1, 0.8, 0.5]], a: 0.9, drag: 0, grav: 0, spin: 0, spr: SPR.soft, add: true, ease: 'out' },
  pow: { life: [0.42, 0.5], size: [0.4, 1.9], col: [[1, 1, 1], [1, 1, 1]], a: 1, drag: 0, grav: 0, spin: 0.6, spr: SPR.pow, ease: 'pop' },
  dizzy: { life: [1.2, 1.4], size: [0.24, 0.2], col: [[1, 0.9, 0.3], [1, 0.85, 0.3]], a: 1, drag: 0, grav: 0, spin: 3, spr: SPR.star },
  confetti: { life: [1.3, 2.0], size: [0.24, 0.2], col: [[1, 1, 1], [1, 1, 1]], a: 1, drag: 2.2, grav: 3.2, spin: 7, spr: SPR.confetti, flip: 9 },
  heart: { life: [1.0, 1.4], size: [0.26, 0.5], col: [[1, 1, 1], [1, 1, 1]], a: 1, drag: 2, grav: -1.4, spin: 0.6, spr: SPR.heart },
  speedLine: { life: [0.18, 0.28], size: [0.5, 0.35], col: [[1, 1, 1], [0.9, 0.95, 1]], a: 0.7, drag: 0, grav: 0, spin: 0, spr: SPR.line, mode: 1 },
  boostRing: { life: [0.28, 0.36], size: [0.5, 2.6], col: [[1, 0.85, 0.5], [1, 0.5, 0.2]], a: 0.8, drag: 0, grav: 0, spin: 0, spr: SPR.ring, add: true, ease: 'out' },
};
const CONFETTI = [[1, 0.36, 0.3], [1, 0.8, 0.2], [0.3, 0.8, 0.4], [0.3, 0.6, 1], [0.9, 0.4, 0.9], [1, 0.6, 0.2]];

export function createFx(scene) {
  const sys = [makeSystem(1400, false), makeSystem(900, true)];
  for (const s of sys) scene.add(s.mesh);
  const parts = [], free = [];
  const MAXP = 2200;
  const rnd = (a, b) => a + Math.random() * (b - a);

  // one particle of kind `k`
  function add(k, x, y, z, vx = 0, vy = 0, vz = 0, o = {}) {
    const T = K[k]; if (!T) return null;
    const p = free.pop() || {};
    p.T = T; p.add = !!T.add;
    p.x = x; p.y = y; p.z = z; p.vx = vx; p.vy = vy; p.vz = vz;
    p.t = 0; p.life = rnd(T.life[0], T.life[1]) * (o.life || 1);
    const sz = o.size || 1; p.s0 = T.size[0] * sz * rnd(0.85, 1.15); p.s1 = T.size[1] * sz * rnd(0.85, 1.15);
    p.rot = Math.random() * Math.PI * 2; p.spin = (T.spin || 0) * rnd(-1, 1);
    p.spr = Array.isArray(T.spr) ? T.spr[(Math.random() * T.spr.length) | 0] : T.spr;
    p.col = o.col || null; // colour stops override
    p.a = T.a * (o.alpha ?? 1);
    p.flipPh = Math.random() * 6; p.flip = T.flip || 0;
    p.orbit = o.orbit || null;
    parts.push(p);
    if (parts.length > MAXP) free.push(...parts.splice(0, parts.length - MAXP));
    return p;
  }
  // a cloud of `n` particles with random spread / velocity jitter
  function cloud(k, x, y, z, { n = 1, spread = 0.3, vx = 0, vy = 0, vz = 0, jitter = 1, up = 0.5, size = 1, col, alpha, life } = {}) {
    for (let i = 0; i < n; i++) {
      add(k, x + rnd(-spread, spread), y + Math.random() * spread * 0.4, z + rnd(-spread, spread),
        vx + rnd(-1, 1) * jitter, vy + Math.random() * up * 3, vz + rnd(-1, 1) * jitter, { size, col: typeof col === 'function' ? col() : col, alpha, life });
    }
  }
  // a radial burst in the ground plane (with some lift)
  function ring(k, x, y, z, { n = 10, speed = 3, lift = 1, size = 1, col, life } = {}) {
    for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2 + Math.random() * 0.4, s = speed * rnd(0.7, 1.2); add(k, x, y, z, Math.cos(a) * s, lift * rnd(0.5, 1.2), Math.sin(a) * s, { size, col: typeof col === 'function' ? col() : col, life }); }
  }

  // ---------------- effects the ride calls ----------------
  // exhaust puff: (x,y,z) pipe, (fx,fz) forward; dirty = the junk bike (black smoke, the odd backfire)
  function exhaust(x, y, z, fx, fz, { dirty = false, speed = 0, boost = false } = {}) {
    add(dirty ? 'smokeBlack' : 'smoke', x + rnd(-0.05, 0.05), y, z + rnd(-0.05, 0.05), -fx * (1 + speed * 0.05) + rnd(-0.25, 0.25), 0.35 + Math.random() * 0.25, -fz * (1 + speed * 0.05) + rnd(-0.25, 0.25), { size: (dirty ? 1.05 : 0.75) * (boost ? 1.3 : 1) });
    if (dirty && Math.random() < 0.025) {
      add('flash', x - fx * 0.2, y, z - fz * 0.2, 0, 0, 0, { size: 0.5 });
      for (let i = 0; i < 4; i++) add('ember', x, y, z, -fx * rnd(2, 4) + rnd(-1, 1), rnd(0.5, 2), -fz * rnd(2, 4) + rnd(-1, 1));
      add('smokeBlack', x, y + 0.1, z, -fx, 0.6, -fz, { size: 1.6 });
    }
  }
  // turbo: a layered flame tongue + embers (electric bikes: blue plasma)
  const ELEC_HOT = [[0.85, 1, 1], [0.4, 0.85, 1]], ELEC_BODY = [[0.45, 0.85, 1], [0.25, 0.5, 1], [0.15, 0.2, 0.8]], ELEC_EMBER = [[0.8, 1, 1], [0.3, 0.6, 1]];
  function turbo(x, y, z, fx, fz, speed, electric) {
    const back = 5 + speed * 0.4;
    add('flameCore', x, y, z, -fx * back * 0.6, 0, -fz * back * 0.6, { col: electric ? ELEC_HOT : null });
    for (let i = 0; i < 2; i++) add('flame', x + rnd(-0.04, 0.04), y + rnd(-0.03, 0.03), z + rnd(-0.04, 0.04), -fx * back + rnd(-0.4, 0.4), rnd(-0.1, 0.3), -fz * back + rnd(-0.4, 0.4), { col: electric ? ELEC_BODY : null });
    if (Math.random() < 0.35) add('ember', x, y, z, -fx * back * 0.8 + rnd(-1.5, 1.5), rnd(0.2, 1.8), -fz * back * 0.8 + rnd(-1.5, 1.5), { col: electric ? ELEC_EMBER : null });
  }
  function boostStart(x, y, z, fx, fz, electric) {
    add('boostRing', x, y + 0.2, z, 0, 0, 0, { col: electric ? ELEC_EMBER : null });
    add('flash', x - fx * 0.3, y, z - fz * 0.3, 0, 0, 0, { size: 0.9, col: electric ? ELEC_HOT : null });
    for (let i = 0; i < 10; i++) add('ember', x, y, z, -fx * rnd(3, 6) + rnd(-2, 2), rnd(0.5, 2.5), -fz * rnd(3, 6) + rnd(-2, 2), { col: electric ? ELEC_EMBER : null });
  }
  function hopTakeoff(x, z) { ring('dust', x, 0.18, z, { n: 6, speed: 1.6, lift: 0.4, size: 0.7 }); }
  function hopLand(x, z, perfect) {
    add('dustRing', x, 0.16, z, 0, 0, 0);
    ring('dust', x, 0.2, z, { n: 9, speed: 2.4, lift: 0.5, size: 0.85 });
    if (perfect) {
      ring('star', x, 1.1, z, { n: 7, speed: 2.4, lift: 3.2, size: 1.1 });
      cloud('twinkle', x, 1.3, z, { n: 12, spread: 0.9, up: 1, jitter: 1.4 });
      add('flash', x, 1.0, z, 0, 0, 0, { size: 0.8, col: [[1, 0.95, 0.7], [1, 0.85, 0.4]] });
    }
  }
  function splash(x, z, big = true) {
    add('ripple', x, 0.15, z, 0, 0, 0, { size: big ? 1 : 0.6 });
    if (big) add('ripple', x, 0.15, z, 0, 0, 0, { size: 1.5, life: 1.4, alpha: 0.6 });
    ring('drop', x, 0.25, z, { n: big ? 18 : 6, speed: big ? 2.8 : 1.6, lift: big ? 3.4 : 2.2, size: big ? 1 : 0.8 });
    if (big) cloud('mist', x, 0.35, z, { n: 4, spread: 0.6, up: 0.4, jitter: 0.8 });
  }
  function spray(x, z, vx, vz) { // rain spray off the rear wheel
    add('drop', x + rnd(-0.15, 0.15), 0.25, z + rnd(-0.15, 0.15), vx + rnd(-0.6, 0.6), rnd(1.2, 2.6), vz + rnd(-0.6, 0.6), { size: 0.75 });
    if (Math.random() < 0.3) add('mist', x, 0.3, z, vx * 0.5, 0.4, vz * 0.5, { size: 0.7, alpha: 0.7 });
  }
  function bump(x, z) { // pothole thump: dust + grit
    ring('dust', x, 0.2, z, { n: 7, speed: 1.8, lift: 0.6, size: 0.75 });
    cloud('chunk', x, 0.2, z, { n: 6, spread: 0.3, up: 1.2, jitter: 1.6, size: 0.9 });
  }
  function crash(x, z, fx = 0, fz = 1) {
    add('pow', x + fx * 0.4, 1.0, z + fz * 0.4, 0, 0, 0);
    add('flash', x, 0.8, z, 0, 0, 0, { size: 1.2 });
    for (let i = 0; i < 26; i++) { const a = Math.random() * Math.PI * 2, s = rnd(2.5, 6.5); add('spark', x, 0.6, z, Math.cos(a) * s, rnd(1, 5), Math.sin(a) * s); }
    ring('dust', x, 0.25, z, { n: 10, speed: 2.6, lift: 0.7, size: 1.1 });
    cloud('chunk', x, 0.4, z, { n: 8, spread: 0.4, up: 1.8, jitter: 2.6, size: 1.1, col: () => [[0.85, 0.3, 0.25], [0.6, 0.2, 0.18]] });
    // cartoon stars circling the rider's head
    for (let i = 0; i < 5; i++) add('dizzy', x, 1.9, z, 0, 0, 0, { orbit: { cx: x, cz: z, y: 1.95, r: 0.42, a: (i / 5) * Math.PI * 2, w: 3.4 } });
  }
  function cash(x, y, z) {
    ring('coin', x, y, z, { n: 8, speed: 1.6, lift: 3.2 });
    cloud('bill', x, y + 0.2, z, { n: 3, spread: 0.3, up: 1.4, jitter: 1.2 });
    cloud('twinkle', x, y + 0.2, z, { n: 10, spread: 0.7, up: 0.8, jitter: 1.2, size: 0.8 });
  }
  function energy(x, y, z) {
    add('boostRing', x, y, z, 0, 0, 0, { col: ELEC_EMBER, size: 0.7 });
    cloud('energy', x, y, z, { n: 16, spread: 0.6, up: 1.2, jitter: 1.6 });
  }
  function stall(x, y, z) { // engine trouble: thick black smoke and a few embers
    add('smokeBlack', x + rnd(-0.1, 0.1), y + 0.2, z + rnd(-0.1, 0.1), rnd(-0.3, 0.3), rnd(0.6, 1.1), rnd(-0.3, 0.3), { size: 1.5 });
    if (Math.random() < 0.2) add('ember', x, y, z, rnd(-0.8, 0.8), rnd(1, 2.5), rnd(-0.8, 0.8));
  }
  function restart(x, y, z) { // the engine catches: a cough of smoke and a flash
    add('flash', x, y, z, 0, 0, 0, { size: 0.7 });
    cloud('smokeBlack', x, y, z, { n: 8, spread: 0.4, up: 0.8, jitter: 1.2, size: 1.3 });
  }
  // near miss: wind lines streaming past the side of the scooter (side +1 right, −1 left)
  function whoosh(x, z, fx, fz, side) {
    const rx = fz * side, rz = -fx * side;
    for (let i = 0; i < 5; i++) { const o = 0.5 + Math.random() * 0.9, h = 0.4 + Math.random() * 1.3, ahead = rnd(0.5, 3); add('speedLine', x + rx * o + fx * ahead, h, z + rz * o + fz * ahead, -fx * 16, 0, -fz * 16, { size: rnd(0.8, 1.3) }); }
  }
  // at the customer's door: confetti (and hearts for five stars), coins for a tip
  function celebrate(x, z, { stars = 5, tip = 0 } = {}) {
    for (let i = 0; i < (stars >= 5 ? 46 : 26); i++) {
      const a = Math.random() * Math.PI * 2, s = rnd(1, 3.2), c = CONFETTI[(Math.random() * CONFETTI.length) | 0];
      add('confetti', x, 1.8, z, Math.cos(a) * s, rnd(3, 6.5), Math.sin(a) * s, { col: [c, c.map((v) => v * 0.85)] });
    }
    if (stars >= 5) cloud('heart', x, 1.6, z, { n: 6, spread: 0.5, up: 0.8, jitter: 0.9 });
    if (tip > 0) ring('coin', x, 1.4, z, { n: Math.min(10, 3 + Math.round(tip / 3)), speed: 1.4, lift: 3.4 });
    cloud('twinkle', x, 1.6, z, { n: 10, spread: 0.8, up: 0.7, jitter: 1.4 });
  }

  // backward-compatible entry point: spawn(type, x, y, z, opts)
  function spawn(type, x, y, z, { vx = 0, vy = 0, vz = 0, spread = 0.3, n = 1, color, size = 1, up = 0.5 } = {}) {
    const k = type === 'cash' ? 'coin' : K[type] ? type : 'smoke';
    cloud(k, x, y, z, { n, spread, vx, vy, vz, jitter: spread * 4, up, size, col: color ? [color, color] : undefined });
  }

  // skid marks: a ring buffer of dark quads lying on the road (+ a little tyre smoke)
  const SK = 160;
  const skGeo = new THREE.PlaneGeometry(0.22, 0.9); skGeo.rotateX(-Math.PI / 2);
  const skidM = new THREE.InstancedMesh(skGeo, new THREE.MeshBasicMaterial({ color: 0x1a1a1e, transparent: true, opacity: 0.5, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3 }), SK);
  skidM.count = 0; skidM.frustumCulled = false; scene.add(skidM);
  let skI = 0;
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), v = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1);
  function skidMark(x, z, heading) {
    q.setFromAxisAngle(up, heading); v.set(x, 0.12, z);
    skidM.setMatrixAt(skI, m4.compose(v, q, one)); skI = (skI + 1) % SK; skidM.count = Math.max(skidM.count, skI === 0 ? SK : skI);
    skidM.instanceMatrix.needsUpdate = true;
    if (Math.random() < 0.6) add('tireSmoke', x + rnd(-0.1, 0.1), 0.25, z + rnd(-0.1, 0.1), rnd(-0.4, 0.4), 0.3, rnd(-0.4, 0.4));
  }
  function clearSkids() { skidM.count = 0; skI = 0; }

  // ---------------- simulate + upload ----------------
  const cc = [0, 0, 0];
  const lerp3 = (stops, f) => {
    const n = stops.length - 1, x = Math.min(0.9999, f) * n, i = Math.floor(x), t = x - i, a = stops[i], b = stops[Math.min(n, i + 1)];
    cc[0] = a[0] + (b[0] - a[0]) * t; cc[1] = a[1] + (b[1] - a[1]) * t; cc[2] = a[2] + (b[2] - a[2]) * t;
  };
  function update(dt) {
    for (const s of sys) s.n = 0;
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i], T = p.T;
      p.t += dt;
      if (p.t >= p.life) { free.push(p); parts[i] = parts[parts.length - 1]; parts.pop(); continue; }
      const f = p.t / p.life;
      if (p.orbit) {
        const o = p.orbit; o.a += o.w * dt;
        p.x = o.cx + Math.cos(o.a) * o.r; p.z = o.cz + Math.sin(o.a) * o.r; p.y = o.y + Math.sin(o.a * 2) * 0.05;
      } else {
        const k = Math.exp(-T.drag * dt);
        p.vx *= k; p.vz *= k; p.vy = p.vy * k - T.grav * dt;
        p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
        if (p.y < 0.14 && T.grav > 0) { p.y = 0.14; if (T.bounce) { p.vy = -p.vy * T.bounce; p.vx *= 0.6; p.vz *= 0.6; } else { p.vy = 0; p.vx *= 0.5; p.vz *= 0.5; } }
      }
      p.rot += p.spin * dt;
      const s = sys[p.add ? 1 : 0];
      if (s.n >= s.max) continue;
      const j = s.n++;
      // size easing: puffs swell fast then settle; pops overshoot
      const e = T.ease === 'out' ? 1 - (1 - f) * (1 - f) : T.ease === 'pop' ? Math.min(1, f * 4) * (1 + 0.25 * Math.sin(Math.min(1, f * 4) * Math.PI)) : f;
      const size = p.s0 + (p.s1 - p.s0) * e;
      // alpha: quick fade-in, hold, fade-out
      const al = p.a * (f < 0.08 ? f / 0.08 : f > 0.6 ? 1 - (f - 0.6) / 0.4 : 1);
      lerp3(p.col || T.col, f);
      const A = s.A, P = A.pos.array, V = A.vel.array, C = A.col.array, M = A.misc.array;
      P[j * 3] = p.x; P[j * 3 + 1] = p.y; P[j * 3 + 2] = p.z;
      V[j * 3] = p.vx; V[j * 3 + 1] = p.vy; V[j * 3 + 2] = p.vz;
      C[j * 4] = cc[0]; C[j * 4 + 1] = cc[1]; C[j * 4 + 2] = cc[2]; C[j * 4 + 3] = al;
      M[j * 4] = size; M[j * 4 + 1] = p.rot; M[j * 4 + 2] = p.spr; M[j * 4 + 3] = T.mode || 0;
      A.flip.array[j] = p.flip ? Math.cos(p.flipPh + p.t * p.flip) : 1;
    }
    for (const s of sys) { s.geo.instanceCount = s.n; for (const k in s.A) s.A[k].needsUpdate = true; }
  }
  function clear() { while (parts.length) free.push(parts.pop()); }
  function setNight(n) { sys[0].mat.uniforms.uLight.value = 1 - 0.55 * n; }
  return { spawn, update, skidMark, clearSkids, clear, setNight, add, cloud, ring,
    exhaust, turbo, boostStart, hopTakeoff, hopLand, splash, spray, bump, crash, cash, energy, stall, restart, whoosh, celebrate };
}

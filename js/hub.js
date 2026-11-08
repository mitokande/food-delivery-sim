// Hub: isometric-ish city camera (drag to pan, pinch / wheel to zoom), map markers, route preview.
import * as THREE from 'three';
import { TILE } from './data.js';

const YAW = Math.PI / 4, PITCH = THREE.MathUtils.degToRad(52);

export function createHubCamera(camera, dom, city) {
  const st = { x: 10 * TILE, z: 30 * TILE, dist: 260, tx: 10 * TILE, tz: 30 * TILE, tdist: 260, enabled: true, vx: 0, vz: 0, dragging: false, moved: 0, yaw: YAW };
  const minD = 70, maxD = 720;
  const W = city.W * TILE, H = city.H * TILE;
  const pointers = new Map();
  let pinch0 = 0, dist0 = 0, anchor = null, samples = [];
  // Drag: the spot of ground under the finger stays under it (1:1, no lag while the finger is down). A flick glides on
  // with the speed of the last ~100 ms, easing out; a finger that stopped before lifting doesn't glide.
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), hit = new THREE.Vector3();
  function groundAt(cx, cy) {
    apply(camera, st.x, st.z, st.dist); camera.updateMatrixWorld();
    const r = dom.getBoundingClientRect();
    ndc.set((cx - r.left) / r.width * 2 - 1, -(cy - r.top) / r.height * 2 + 1);
    ray.setFromCamera(ndc, camera);
    return ray.ray.intersectPlane(ground, hit) ? [hit.x, hit.z] : null;
  }
  const clampT = () => { st.tx = THREE.MathUtils.clamp(st.tx, -TILE, W); st.tz = THREE.MathUtils.clamp(st.tz, -TILE, H); };
  // (times are the input events' own: on a slow frame the events come late and bunched, the finger's speed doesn't change)
  function grab(p, t) { st.tx = st.x; st.tz = st.z; anchor = groundAt(p.x, p.y); samples = [[t, st.x, st.z]]; }
  dom.addEventListener('pointerdown', (e) => {
    if (!st.enabled) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY });
    try { dom.setPointerCapture(e.pointerId); } catch { /* synthetic or already-ended pointer */ }
    st.vx = st.vz = 0;
    if (pointers.size === 1) { st.dragging = true; st.moved = 0; grab(pointers.get(e.pointerId), e.timeStamp); }
    if (pointers.size === 2) { const [a, b] = [...pointers.values()]; pinch0 = Math.hypot(a.x - b.x, a.y - b.y); dist0 = st.tdist; anchor = null; }
  });
  dom.addEventListener('pointermove', (e) => {
    if (!st.enabled || !pointers.has(e.pointerId)) return;
    const p = pointers.get(e.pointerId);
    st.moved += Math.abs(e.clientX - p.x) + Math.abs(e.clientY - p.y);
    p.x = e.clientX; p.y = e.clientY;
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()]; const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinch0 > 0) st.tdist = THREE.MathUtils.clamp(dist0 * pinch0 / d, minD, maxD);
      st.moved += 10; return;
    }
    if (!anchor) return;
    const g = groundAt(p.x, p.y); if (!g) return;
    st.tx += anchor[0] - g[0]; st.tz += anchor[1] - g[1]; clampT();
    st.x = st.tx; st.z = st.tz;
    const now = e.timeStamp;
    samples.push([now, st.x, st.z]);
    while (samples.length > 2 && now - samples[0][0] > 100) samples.shift();
  });
  const up = (e) => {
    if (!pointers.delete(e.pointerId)) return;
    if (pointers.size === 0) {
      st.dragging = false; anchor = null;
      const now = e.timeStamp, a = samples[0], b = samples[samples.length - 1];
      if (a && b && b[0] > a[0] + 8 && now - b[0] < 60) {
        const dt = (b[0] - a[0]) / 1000, cap = st.dist * 4; // (at most a few screens a second)
        st.vx = THREE.MathUtils.clamp((b[1] - a[1]) / dt, -cap, cap); st.vz = THREE.MathUtils.clamp((b[2] - a[2]) / dt, -cap, cap);
      }
      samples = [];
    }
    if (pointers.size === 1) { pinch0 = 0; grab([...pointers.values()][0], e.timeStamp); } // (one finger left after a pinch: it drags from here)
  };
  dom.addEventListener('pointerup', up); dom.addEventListener('pointercancel', up);
  dom.addEventListener('wheel', (e) => { if (!st.enabled) return; e.preventDefault(); st.tdist = THREE.MathUtils.clamp(st.tdist * Math.exp(e.deltaY * 0.0012), minD, maxD); }, { passive: false });

  function update(dt) {
    if (!st.dragging && (st.vx || st.vz)) {
      st.tx += st.vx * dt; st.tz += st.vz * dt;
      st.x += st.vx * dt; st.z += st.vz * dt; // (the glide moves the view itself, not a target it eases toward)
      const k = Math.exp(-dt * 4); st.vx *= k; st.vz *= k;
      if (Math.abs(st.vx) + Math.abs(st.vz) < 2) st.vx = st.vz = 0;
    }
    clampT();
    const k = 1 - Math.exp(-dt * 12);
    if (!st.dragging) { st.x += (st.tx - st.x) * k; st.z += (st.tz - st.z) * k; }
    st.dist += (st.tdist - st.dist) * k;
    if (st.enabled) apply(camera, st.x, st.z, st.dist, st.yaw);
  }
  function apply(cam, x, z, dist, yaw = st.yaw) {
    const h = Math.sin(PITCH) * dist, r = Math.cos(PITCH) * dist;
    cam.position.set(x + Math.sin(yaw) * r, h, z + Math.cos(yaw) * r);
    cam.lookAt(x, 0, z);
  }
  function lookAt(x, z, dist) { st.tx = x; st.tz = z; if (dist) st.tdist = dist; st.vx = st.vz = 0; }
  function snap(x, z, dist) { st.tx = st.x = x; st.tz = st.z = z; if (dist) st.tdist = st.dist = dist; }
  // pose for a given focus (used for camera transitions)
  function pose(x, z, dist) { const c = new THREE.PerspectiveCamera(); apply(c, x, z, dist); return { pos: c.position.clone(), quat: c.quaternion.clone() }; }
  return { st, update, lookAt, snap, pose, apply };
}

// ---- floating markers (restaurants, garage, office) rendered as HTML labels projected from 3D ----
export function createMarkers(container, camera) {
  const list = [];
  const v = new THREE.Vector3();
  function add({ x, y, z, html, cls = '', onTap, data }) {
    const el = document.createElement('button');
    el.className = 'marker ' + cls; el.innerHTML = html; el.type = 'button';
    if (onTap) el.addEventListener('click', (e) => { e.stopPropagation(); onTap(data); });
    container.append(el);
    const m = { el, pos: new THREE.Vector3(x, y, z), data, visible: true };
    list.push(m); return m;
  }
  function update(w, h) {
    for (const m of list) {
      v.copy(m.pos).project(camera);
      const on = m.visible && v.z < 1 && v.x > -1.2 && v.x < 1.2 && v.y > -1.2 && v.y < 1.3;
      m.el.hidden = !on;
      if (on) m.el.style.transform = `translate3d(${((v.x + 1) / 2 * w).toFixed(1)}px, ${((1 - v.y) / 2 * h).toFixed(1)}px, 0) translate(-50%, -100%)`;
    }
  }
  function clear() { for (const m of list) m.el.remove(); list.length = 0; }
  return { add, update, clear, list };
}

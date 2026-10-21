// Hub: isometric-ish city camera (drag to pan, pinch / wheel to zoom), map markers, route preview.
import * as THREE from 'three';
import { TILE } from './data.js';

const YAW = Math.PI / 4, PITCH = THREE.MathUtils.degToRad(52);

export function createHubCamera(camera, dom, city) {
  const st = { x: 10 * TILE, z: 30 * TILE, dist: 260, tx: 10 * TILE, tz: 30 * TILE, tdist: 260, enabled: true, vx: 0, vz: 0, dragging: false, moved: 0, yaw: YAW };
  const minD = 70, maxD = 720;
  const W = city.W * TILE, H = city.H * TILE;
  const pointers = new Map();
  let pinch0 = 0, dist0 = 0, last = null, lastT = 0;
  const panScale = () => st.dist * 0.0021 * (900 / Math.max(500, dom.clientHeight));
  const toWorld = (dx, dy) => {
    // screen drag → ground motion, rotated by the camera yaw
    const k = panScale();
    const c = Math.cos(st.yaw), s = Math.sin(st.yaw);
    const rx = -dx * k, rz = -dy * k / Math.sin(PITCH);
    return [rx * c + rz * s, -rx * s + rz * c];
  };
  dom.addEventListener('pointerdown', (e) => {
    if (!st.enabled) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    try { dom.setPointerCapture(e.pointerId); } catch { /* synthetic or already-ended pointer */ }
    if (pointers.size === 1) { last = { x: e.clientX, y: e.clientY }; st.dragging = true; st.moved = 0; st.vx = st.vz = 0; lastT = performance.now(); }
    if (pointers.size === 2) { const [a, b] = [...pointers.values()]; pinch0 = Math.hypot(a.x - b.x, a.y - b.y); dist0 = st.tdist; }
  });
  dom.addEventListener('pointermove', (e) => {
    if (!st.enabled || !pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()]; const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinch0 > 0) st.tdist = THREE.MathUtils.clamp(dist0 * pinch0 / d, minD, maxD);
      st.moved += 10; return;
    }
    if (!last) return;
    const dx = e.clientX - last.x, dy = e.clientY - last.y;
    st.moved += Math.abs(dx) + Math.abs(dy);
    const [wx, wz] = toWorld(dx, dy);
    st.tx += wx; st.tz += wz;
    const now = performance.now(), dt = Math.max(1, now - lastT) / 1000; lastT = now;
    st.vx = wx / dt; st.vz = wz / dt;
    last = { x: e.clientX, y: e.clientY };
  });
  const up = (e) => {
    pointers.delete(e.pointerId);
    if (pointers.size === 0) { st.dragging = false; last = null; if (performance.now() - lastT > 80) st.vx = st.vz = 0; }
    if (pointers.size === 1) { const p = [...pointers.values()][0]; last = { x: p.x, y: p.y }; pinch0 = 0; }
  };
  dom.addEventListener('pointerup', up); dom.addEventListener('pointercancel', up);
  dom.addEventListener('wheel', (e) => { if (!st.enabled) return; e.preventDefault(); st.tdist = THREE.MathUtils.clamp(st.tdist * Math.exp(e.deltaY * 0.0012), minD, maxD); }, { passive: false });

  function update(dt) {
    if (!st.dragging && (st.vx || st.vz)) {
      st.tx += st.vx * dt; st.tz += st.vz * dt;
      const k = Math.exp(-dt * 5); st.vx *= k; st.vz *= k;
      if (Math.abs(st.vx) + Math.abs(st.vz) < 0.5) st.vx = st.vz = 0;
    }
    st.tx = THREE.MathUtils.clamp(st.tx, -TILE, W); st.tz = THREE.MathUtils.clamp(st.tz, -TILE, H);
    const k = 1 - Math.exp(-dt * 12);
    st.x += (st.tx - st.x) * k; st.z += (st.tz - st.z) * k; st.dist += (st.tdist - st.dist) * k;
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

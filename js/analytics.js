// Gameplay analytics: an anonymous player id per device, one session per visit, events batched to api/collect.php
// (seen in admin/). No DOM beyond page visibility; game code calls track(name, props).
// URL flags (remembered on this device): ?an=dev marks it as the developer's (kept out of the stats),
// ?an=off stops sending, ?an=on back to normal. Headless test runs send nothing unless ?an=force.
import * as St from './state.js';
import { S } from './state.js';

const ENDPOINT = new URL('../api/collect.php', import.meta.url).href;
const FLUSH_MS = 15000, PING_MS = 30000, NEW_SESSION_MS = 30 * 60000, BATCH = 200, MAX_QUEUE = 1000;

const store = {
  get: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* private mode */ } },
  del: (k) => { try { localStorage.removeItem(k); } catch { /* private mode */ } },
};
const flag = new URLSearchParams(location.search).get('an');
if (flag === 'dev' || flag === 'off') store.set('fds_an', flag);
else if (flag === 'on') store.del('fds_an');
const mode = store.get('fds_an');
const enabled = flag === 'force' || (mode !== 'off' && !navigator.webdriver);
const dev = mode === 'dev';

const rid = (p) => p + (crypto.randomUUID ? crypto.randomUUID().replace(/-/g, '') : Math.random().toString(36).slice(2) + Date.now().toString(36));
let pid = store.get('fds_pid');
if (!pid) { pid = rid('p'); store.set('fds_pid', pid); }

let sid = '', seq = 0, queue = [], ctxSent = false, sending = false, lastSend = 0;
let activeMs = 0, visSince = performance.now(), hiddenAt = 0;
let playBase = +store.get('fds_play') || 0; // this device's visible play time before this session (ms)
let where = () => 'boot', gpu = '', hints = {};
// Chromium hides the phone model and real OS version from the user agent; it still tells the page when asked
navigator.userAgentData?.getHighEntropyValues?.(['model', 'platformVersion']).then((h) => { hints = h; }).catch(() => { /* not offered */ });
const errSeen = new Set();

const activeNow = () => activeMs + (document.hidden ? 0 : performance.now() - visSince);
// minutes this device has played in total, for "how long until …" charts
export const playMinutes = () => Math.round((playBase + activeNow()) / 6000) / 10;

export function track(n, p) {
  if (!enabled) return;
  queue.push({ i: seq++, t: Date.now(), n, p });
  if (queue.length > MAX_QUEUE) queue.splice(0, queue.length - MAX_QUEUE);
}

function snapshot() {
  return {
    lvl: S.lvl, xp: S.xp, cash: Math.round(S.cash), del: S.stats.deliveries, earned: Math.round(S.stats.earned), day: S.day, veh: S.active,
    dist: Object.keys(S.districts).filter((d) => S.districts[d]).join(','), r: Math.round(St.rating() * 100) / 100, name: S.name || '',
    ob: S.onboard.step, fleet: S.fleet.couriers.length, where: safeWhere(), vis: document.hidden ? 0 : 1,
  };
}
function safeWhere() { try { return where(); } catch { return '?'; } }
function context() {
  let ref = '';
  try { ref = document.referrer ? new URL(document.referrer).host : ''; } catch { /* odd referrer */ }
  return {
    ua: navigator.userAgent, lang: navigator.language, tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
    scr: `${screen.width}x${screen.height}`, vp: `${innerWidth}x${innerHeight}`, dpr: devicePixelRatio,
    touch: matchMedia('(pointer: coarse)').matches ? 1 : 0, pwa: matchMedia('(display-mode: standalone)').matches || navigator.standalone ? 1 : 0,
    ref, gpu, mem: navigator.deviceMemory, cores: navigator.hardwareConcurrency, model: hints.model || undefined, osv: hints.platformVersion || undefined,
  };
}

// ---------- frame rate: average and worst 5 s window between sends ----------
let frames = 0, winT0 = performance.now(), wins = [];
function countFrame() { frames++; requestAnimationFrame(countFrame); }
function closeWindow() {
  const t = performance.now(), secs = (t - winT0) / 1000;
  if (!document.hidden && secs > 2) wins.push(frames / secs);
  frames = 0; winT0 = t;
}
function takeFps() {
  if (!wins.length) return undefined;
  const avg = wins.reduce((a, b) => a + b, 0) / wins.length, min = Math.min(...wins);
  wins = [];
  return [Math.round(avg * 10) / 10, Math.round(min * 10) / 10];
}

// ---------- sending ----------
function body(ev) {
  return JSON.stringify({ v: 1, pid, sid, now: Date.now(), dev: dev ? 1 : 0, active: Math.round(activeNow()), fps: takeFps(), st: snapshot(), ctx: ctxSent ? undefined : context(), ev });
}
async function flush(unloading = false) {
  if (!enabled || sending) return;
  const ev = queue.slice(0, BATCH);
  if (!ev.length && Date.now() - lastSend < PING_MS) return;
  sending = true; lastSend = Date.now();
  store.set('fds_play', String(Math.round(playBase + activeNow())));
  try {
    const b = body(ev);
    // keepalive only when the page is going away (it has a small shared quota, and it is what sendBeacon falls back to)
    const r = await fetch(ENDPOINT, { method: 'POST', body: b, keepalive: unloading && b.length < 60000, headers: { 'Content-Type': 'text/plain' } });
    // 4xx = the server will never take this batch: drop it rather than retry forever
    if (r.ok || (r.status >= 400 && r.status < 500)) { queue.splice(0, ev.length); ctxSent ||= r.ok; }
  } catch { /* offline: keep the queue, try again next tick */ }
  sending = false;
  if (queue.length >= BATCH) setTimeout(flush, 500);
}
// page is going away (or to the background): hand everything to sendBeacon, which outlives the page
function flushNow() {
  if (!enabled) return;
  store.set('fds_play', String(Math.round(playBase + activeNow())));
  do {
    const ev = queue.slice(0, BATCH);
    const ok = navigator.sendBeacon?.(ENDPOINT, new Blob([body(ev)], { type: 'text/plain' }));
    if (!ok) { flush(true); return; }
    queue.splice(0, ev.length); ctxSent = true; lastSend = Date.now();
  } while (queue.length);
}

function newSession(why, extra = {}) {
  playBase += activeNow();
  sid = rid('s'); seq = 0; ctxSent = false; activeMs = 0; visSince = performance.now();
  track('session_start', { why, ...extra });
}

// ---------- wiring ----------
if (enabled) {
  window.__an = track; // index.html's boot-error guard reports through this when the module loaded
  newSession('boot', { saved: !!store.get('fds_save_v1') });
  requestAnimationFrame(countFrame);
  setInterval(closeWindow, 5000);
  setInterval(() => { if (!document.hidden) flush(); }, FLUSH_MS);
  setTimeout(flush, 20000); // ready() sends the first batch; this one covers a boot that never finishes
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      activeMs += performance.now() - visSince; hiddenAt = Date.now();
      closeWindow();
      track('app_hide', { where: safeWhere() });
      flushNow();
    } else {
      visSince = performance.now(); frames = 0; winT0 = visSince;
      const away = Date.now() - hiddenAt;
      if (hiddenAt && away > NEW_SESSION_MS) newSession('resume', { away: Math.round(away / 60000) });
      else if (hiddenAt) track('app_show', { away: Math.round(away / 1000) }); // (none for a page that opened in a background tab)
      flush();
    }
  });
  addEventListener('pagehide', () => { if (!document.hidden) { track('app_hide', { where: safeWhere(), unload: 1 }); flushNow(); } });
  const report = (msg, src, line, col, stack) => {
    const key = String(msg).slice(0, 200);
    if (errSeen.has(key) || errSeen.size >= 15) return;
    errSeen.add(key);
    track('error', { msg: key, src: String(src || '').replace(location.origin, '').slice(0, 200), line, col, stack: String(stack || '').slice(0, 1500), where: safeWhere() });
  };
  addEventListener('error', (e) => { if (e.message) report(e.message, e.filename, e.lineno, e.colno, e.error?.stack); });
  addEventListener('unhandledrejection', (e) => report('unhandled: ' + (e.reason?.message || e.reason), '', 0, 0, e.reason?.stack));

  // the economy reports its own actions (state.js emits 'act'); milestones come from the same channel
  St.on((w, d) => {
    if (w === 'act') { const { ev, ...p } = d; track(ev, { ...p, lvl: S.lvl, cash: Math.round(S.cash) }); }
    else if (w === 'levelup') track('level_up', { lvl: d, pm: playMinutes(), del: S.stats.deliveries, day: S.day });
    else if (w === 'goal') track('goal_done', { id: d.id, n: d.n });
    else if (w === 'contract') track('contract_done', { id: d.id, n: d.n, d: d.d });
    else if (w === 'fleetevent') track('fleet_event', { kind: d.kind });
    else if (w === 'reset') track('save_reset', {});
  });
}

// main.js, once the game is on screen: where the player is (for quit points and errors) and the GPU name
export function ready({ fresh, gl, at }) {
  if (!enabled) return;
  where = at;
  try { const x = gl.getExtension('WEBGL_debug_renderer_info'); gpu = String(gl.getParameter(x ? x.UNMASKED_RENDERER_WEBGL : gl.RENDERER)).slice(0, 160); } catch { /* no GL info */ }
  track('boot', { ms: Math.round(performance.now()), fresh: !!fresh, lvl: S.lvl, del: S.stats.deliveries, pm: playMinutes() });
  flush();
}

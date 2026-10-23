// Virtual time for frame-exact capture. Injected before the game loads; passes through to real time until
// __V.enable(). After that requestAnimationFrame, setTimeout/setInterval, performance.now and every CSS / Web
// Animation advance only when __V.step(ms) is called, so a slow software renderer still yields smooth 30 fps footage.
(() => {
  const realRAF = window.requestAnimationFrame.bind(window), realCAF = window.cancelAnimationFrame.bind(window);
  const realST = window.setTimeout.bind(window), realCT = window.clearTimeout.bind(window);
  const realSI = window.setInterval.bind(window), realCI = window.clearInterval.bind(window);
  const realNow = performance.now.bind(performance);
  const V = (window.__V = { on: false, t: 0, base: 0, raf: [], timers: [], id: 1e7, realRAF, realST });
  window.requestAnimationFrame = (cb) => { if (!V.on) return realRAF(cb); const id = ++V.id; V.raf.push({ id, cb }); return id; };
  window.cancelAnimationFrame = (id) => { if (id > 1e7) V.raf = V.raf.filter((r) => r.id !== id); else realCAF(id); };
  window.setTimeout = (fn, ms = 0, ...a) => { if (!V.on) return realST(fn, ms, ...a); const id = ++V.id; V.timers.push({ id, at: V.t + Math.max(0, +ms || 0), fn, a }); return id; };
  window.setInterval = (fn, ms = 0, ...a) => { if (!V.on) return realSI(fn, ms, ...a); const id = ++V.id, every = Math.max(1, +ms || 1); V.timers.push({ id, at: V.t + every, fn, a, every }); return id; };
  window.clearTimeout = (id) => { if (id > 1e7) V.timers = V.timers.filter((x) => x.id !== id); else realCT(id); };
  window.clearInterval = (id) => { if (id > 1e7) V.timers = V.timers.filter((x) => x.id !== id); else realCI(id); };
  performance.now = () => (V.on ? V.base + V.t : realNow());
  V.enable = () => { V.base = realNow(); V.t = 0; V.on = true; };
  // CSS animations, transitions and element.animate() follow the virtual clock from the moment they first appear
  V.sync = () => {
    for (const a of document.getAnimations()) {
      if (a.__v0 == null) { a.__v0 = V.t; a.pause(); }
      if (a.__done) continue;
      const end = a.effect?.getComputedTiming().endTime, ct = V.t - a.__v0;
      if (end != null && Number.isFinite(end) && ct >= end) { a.__done = true; try { a.finish(); } catch { /* infinite or removed */ } continue; }
      a.currentTime = Math.max(0, ct);
    }
  };
  V.step = (ms) => {
    V.t += ms;
    for (let g = 0; g < 500; g++) {
      V.timers.sort((x, y) => x.at - y.at || x.id - y.id);
      const t = V.timers[0];
      if (!t || t.at > V.t) break;
      if (t.every) t.at += t.every; else V.timers.shift();
      try { if (typeof t.fn === 'function') t.fn(...t.a); } catch (e) { console.error('timer', e); }
    }
    const q = V.raf; V.raf = [];
    for (const r of q) { try { r.cb(V.base + V.t); } catch (e) { console.error('raf', e); } }
    V.sync();
  };
})();

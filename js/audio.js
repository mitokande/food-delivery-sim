// WebAudio: sample one-shots + loops from assets/audio/manifest.json, synthesized fallbacks,
// an engine voice whose pitch follows speed and whose tone follows the throttle, and the rush of a ride (road roar,
// wind, tyres at the limit, pops on the overrun).
import { S } from './state.js';

export function createAudio() {
  const AC = window.AudioContext || window.webkitAudioContext;
  let ctx = null, master, sfxBus, musicBus, engineBus;
  const buffers = new Map(), loading = new Map();
  let manifest = {};
  let music = null, musicName = null, amb = null, ambName = null;
  const eng = { src: null, gain: null, osc: null, lp: null, on: false, name: null, rate: 1, target: 0.0, base: 0.5, load: 0, popT: 0 };
  let rush = null; // { road, wind, squeal } noise / sample layers, built on the first ride

  fetch('assets/audio/manifest.json').then((r) => (r.ok ? r.json() : {})).then((m) => { manifest = m || {}; }).catch(() => {});

  // A trip to the background leaves the context 'suspended', or on iOS 'interrupted' (WebKit's own state), and only a
  // resume() brings it back; iOS may take that only inside a tap, and a touch counts as one on the way up, not down.
  // Hidden, the context is put to sleep on purpose, so nothing plays behind the home screen.
  function wake() { if (ctx && ctx.state !== 'running' && ctx.state !== 'closed' && !document.hidden) ctx.resume().catch(() => {}); }
  document.addEventListener('visibilitychange', () => { if (!ctx) return; if (document.hidden) ctx.suspend().catch(() => {}); else wake(); });
  for (const ev of ['pointerup', 'touchend', 'click', 'keydown']) addEventListener(ev, wake, { capture: true, passive: true });
  addEventListener('pageshow', wake); addEventListener('focus', wake);

  function init() {
    if (ctx) { wake(); return; }
    ctx = new AC();
    master = ctx.createGain(); master.connect(ctx.destination);
    sfxBus = ctx.createGain(); sfxBus.connect(master);
    musicBus = ctx.createGain(); musicBus.connect(master);
    engineBus = ctx.createGain(); engineBus.connect(sfxBus);
    apply();
    // preload the common ones
    for (const n of ['ui-tap', 'hop', 'land', 'bump', 'boost', 'pickup-bonus', 'ui-coins', 'horn-scooter', 'horn-moped', 'crash', 'qte-good', 'qte-bad', 'event-pop', 'doorbell', 'order-complete']) load(n);
  }
  function apply() {
    if (!ctx) return;
    sfxBus.gain.value = S.settings.sfx;
    // the slider's 0.5 puts the music about level with the engine at cruise, ~15 dB under the UI sounds
    musicBus.gain.value = S.settings.music * 1.75;
  }
  async function load(name) {
    if (buffers.has(name)) return buffers.get(name);
    if (loading.has(name)) return loading.get(name);
    const ent = manifest[name];
    const file = ent?.file || `${name}.mp3`;
    const p = fetch(`assets/audio/${file}`).then((r) => { if (!r.ok) throw 0; return r.arrayBuffer(); })
      .then((ab) => new Promise((res, rej) => ctx.decodeAudioData(ab, res, rej)))
      .then((b) => { buffers.set(name, b); return b; })
      .catch(() => { buffers.set(name, null); return null; });
    loading.set(name, p);
    return p;
  }
  function play(name, { vol = 1, rate = 1 } = {}) {
    if (!ctx) return;
    const b = buffers.get(name);
    if (b === undefined) { load(name).then((bb) => bb && fire(bb, name, vol, rate)); return; }
    if (b) fire(b, name, vol, rate); else synth(name, vol, rate);
  }
  function fire(b, name, vol, rate) {
    const s = ctx.createBufferSource(); s.buffer = b; s.playbackRate.value = rate;
    const g = ctx.createGain(); g.gain.value = vol * (manifest[name]?.gain ?? 0.8);
    s.connect(g); g.connect(sfxBus); s.start();
  }
  // tiny synth fallbacks so the game is never silent
  function synth(name, vol, rate) {
    const t = ctx.currentTime;
    const g = ctx.createGain(); g.connect(sfxBus);
    const o = ctx.createOscillator();
    let f = 440, d = 0.12, type = 'sine';
    if (name.startsWith('horn')) { f = name === 'horn-moped' ? 380 : 520; d = 0.32; type = 'square'; }
    else if (name === 'hop') { f = 300; d = 0.18; } else if (name === 'land' || name === 'bump') { f = 90; d = 0.15; type = 'triangle'; }
    else if (name === 'crash') { f = 70; d = 0.4; type = 'sawtooth'; } else if (name.includes('coin') || name === 'pickup-bonus' || name === 'ui-purchase') { f = 1100; d = 0.15; }
    else if (name === 'qte-bad' || name === 'order-late' || name === 'ui-error') { f = 180; d = 0.3; type = 'triangle'; }
    else if (name === 'ui-tap') { f = 700; d = 0.05; }
    o.type = type; o.frequency.setValueAtTime(f * rate, t);
    if (name === 'hop') o.frequency.exponentialRampToValueAtTime(700, t + d);
    if (name.includes('coin') || name === 'pickup-bonus') o.frequency.setValueAtTime(f * 1.5, t + d * 0.5);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.18 * vol, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    o.connect(g); o.start(t); o.stop(t + d + 0.02);
  }
  // if the decoded buffer is longer than the manifest length, the encoder padding survived: loop only the real part
  function loopTrim(src, name) {
    const dur = manifest[name]?.dur, b = src.buffer;
    if (!dur || !b) return 0;
    const pad = (b.duration - dur) / 2;
    if (pad > 0.005) { src.loopStart = pad; src.loopEnd = pad + dur; return pad; }
    return 0;
  }
  // looping music / ambience
  async function loop(kind, name) {
    if (!ctx) return;
    const cur = kind === 'music' ? music : amb;
    if ((kind === 'music' ? musicName : ambName) === name) return;
    if (cur) { const g = cur.g; g.gain.setTargetAtTime(0, ctx.currentTime, 0.4); setTimeout(() => cur.s.stop(), 1500); }
    if (kind === 'music') { music = null; musicName = name; } else { amb = null; ambName = name; }
    if (!name) return;
    const b = await load(name); if (!b) return;
    if ((kind === 'music' ? musicName : ambName) !== name) return;
    const s = ctx.createBufferSource(); s.buffer = b; s.loop = true;
    const off = loopTrim(s, name);
    const g = ctx.createGain(); g.gain.value = 0; s.connect(g); g.connect(kind === 'music' ? musicBus : sfxBus);
    g.gain.setTargetAtTime((manifest[name]?.gain ?? 0.6) * (kind === 'amb' ? 0.5 : 1), ctx.currentTime, 0.6);
    s.start(0, off);
    if (kind === 'music') music = { s, g }; else amb = { s, g };
  }
  // A phone speaker plays almost nothing below ~400 Hz, where these engine recordings keep nearly all their energy, so on a
  // phone only the wind noise was left. A soft clip adds the upper harmonics that carry the putt there. (The moped
  // recording is bright already; the electric one is a clean synth.)
  const DRIVE = { 'engine-scooter': 6, 'engine-sport': 6, 'engine-cargo': 6 };
  // tanh(k·x) over the sample's own peak, scaled back to that peak: the same level in, the harmonics added
  function clipper(k, peak, to) {
    const pre = ctx.createGain(); pre.gain.value = 1 / peak;
    const ws = ctx.createWaveShaper(), n = 1024, c = new Float32Array(n);
    for (let i = 0; i < n; i++) c[i] = Math.tanh(k * (i / (n - 1) * 2 - 1)) / Math.tanh(k) * peak;
    ws.curve = c; ws.oversample = '2x';
    pre.connect(ws); ws.connect(to);
    return pre;
  }
  // engine voice
  async function engine(on, vehId) {
    if (!ctx) return;
    if (!on) {
      if (eng.gain) eng.gain.gain.setTargetAtTime(0, ctx.currentTime, 0.15);
      if (rush) for (const k in rush) rush[k].g.gain.setTargetAtTime(0, ctx.currentTime, 0.12);
      eng.on = false; return;
    }
    if (!rush) makeRush();
    const map = { rustbucket: 'engine-moped', zippy: 'engine-scooter', vespetta: 'engine-scooter', volt: 'engine-electric', mule: 'engine-cargo', viper: 'engine-sport' };
    const name = map[vehId] || 'engine-scooter';
    eng.on = true;
    if (eng.name === name && eng.gain) { eng.gain.gain.setTargetAtTime(eng.base, ctx.currentTime, 0.2); return; }
    if (eng.src) { try { eng.src.stop(); } catch {} eng.src = null; }
    eng.name = name;
    const b = await load(name);
    const g = ctx.createGain(); g.gain.value = 0; g.connect(engineBus);
    // the throttle opens this filter: on the gas the engine is bright and loud, off it the note goes dull
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2500; lp.Q.value = 0.5; lp.connect(g);
    let src;
    let off = 0;
    if (b) {
      src = ctx.createBufferSource(); src.buffer = b; src.loop = true; off = loopTrim(src, name);
      const k = DRIVE[name];
      src.connect(k ? clipper(k, 10 ** ((manifest[name]?.peak ?? -10) / 20), lp) : lp);
    }
    else {
      // synthesized putt: sawtooth through a lowpass, amplitude-modulated
      src = ctx.createOscillator(); src.type = 'sawtooth'; src.frequency.value = 38;
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 420;
      const lp0 = ctx.createBiquadFilter(); lp0.type = 'lowpass'; lp0.frequency.value = 420;
      src.connect(lp0); lp0.connect(lp);
      eng.osc = src;
    }
    src.start(0, off);
    eng.src = src; eng.gain = g; eng.lp = lp;
    eng.base = 0.5 * (manifest[name]?.gain ?? 0.7);
    g.gain.setTargetAtTime(eng.base, ctx.currentTime, 0.2);
  }
  // two seconds of white noise, shared by the road and wind layers
  function makeRush() {
    const n = ctx.sampleRate * 2, buf = ctx.createBuffer(1, n, ctx.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    const layer = (type, f, q, b = buf) => {
      const src = ctx.createBufferSource(); src.buffer = b; src.loop = true;
      const fl = ctx.createBiquadFilter(); fl.type = type; fl.frequency.value = f; fl.Q.value = q;
      const g = ctx.createGain(); g.gain.value = 0;
      src.connect(fl); fl.connect(g); g.connect(engineBus); src.start(0, Math.random() * b.duration * 0.5);
      return { src, fl, g };
    };
    rush = { road: layer('lowpass', 300, 0.7), wind: layer('bandpass', 850, 0.55) };
    // tyres at the limit: the middle of the skid sample, looped
    load('skid').then((b) => {
      if (!b || rush.squeal) return;
      rush.squeal = layer('highpass', 500, 0.5, b);
      rush.squeal.src.loopStart = 0.25; rush.squeal.src.loopEnd = 0.8; rush.squeal.src.playbackRate.value = 1.08;
    });
  }
  // a few dull cracks from the exhaust when the throttle snaps shut at speed
  function pops(n, vol) {
    let t = ctx.currentTime + 0.04;
    for (let i = 0; i < n; i++) {
      const len = Math.floor(ctx.sampleRate * 0.035), b = ctx.createBuffer(1, len, ctx.sampleRate), d = b.getChannelData(0);
      for (let j = 0; j < len; j++) d[j] = (Math.random() * 2 - 1) * Math.exp(-j / (len * 0.18));
      const s = ctx.createBufferSource(); s.buffer = b;
      const fl = ctx.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.value = 700 + Math.random() * 500;
      const g = ctx.createGain(); g.gain.value = vol * (0.6 + Math.random() * 0.4);
      s.connect(fl); fl.connect(g); g.connect(engineBus); s.start(t);
      t += 0.05 + Math.random() * 0.11;
    }
  }
  // ratio: speed / top speed; load: throttle 0–1; v: m/s; slip: corner speed / grip limit (riding yourself)
  function engineSpeed(ratio, boost, load = 0.5, v = 0, slip = 0) {
    if (!ctx || !eng.src) return;
    const t = ctx.currentTime;
    const r = 0.75 + ratio * 0.95 + (boost ? 0.22 : 0) + load * 0.05;
    if (eng.osc) eng.osc.frequency.setTargetAtTime(30 + ratio * 70 + (boost ? 20 : 0) + load * 4, t, 0.08);
    else eng.src.playbackRate.setTargetAtTime(r, t, 0.08);
    if (eng.on) {
      eng.lp.frequency.setTargetAtTime(700 + load * 3800 + ratio * 1500 + (boost ? 2000 : 0), t, 0.06);
      eng.gain.gain.setTargetAtTime(eng.base * (0.62 + 0.38 * load + (boost ? 0.15 : 0)), t, 0.07);
      // overrun pops: the throttle shuts at speed (not on the electric one)
      eng.popT = Math.max(0, eng.popT - 1 / 60);
      if (eng.load > 0.75 && load < 0.35 && ratio > 0.55 && eng.popT <= 0 && eng.name !== 'engine-electric') {
        eng.popT = 1.5; pops(eng.name === 'engine-sport' ? 3 + (Math.random() * 3 | 0) : 1 + (Math.random() * 2 | 0), eng.name === 'engine-sport' ? 0.5 : 0.28);
      }
    }
    eng.load = load;
    if (rush && eng.on) {
      // kept under the engine: at cruise the wind sits 4–11 dB below it on a phone speaker (closest on the fast bikes)
      rush.road.g.gain.setTargetAtTime(0.066 * Math.min(1, v / 12), t, 0.1);
      rush.road.fl.frequency.setTargetAtTime(180 + v * 14, t, 0.1);
      rush.wind.g.gain.setTargetAtTime(0.03 * Math.min(1.3, (v / 15) ** 2) + (boost ? 0.01 : 0), t, 0.12);
      rush.wind.fl.frequency.setTargetAtTime(600 + v * 40, t, 0.12);
      if (rush.squeal) rush.squeal.g.gain.setTargetAtTime(0.32 * Math.min(1, Math.max(0, (slip - 1.03) / 0.15)), t, 0.05);
    }
  }
  return { init, play, loop, engine, engineSpeed, apply, get ready() { return !!ctx; } };
}

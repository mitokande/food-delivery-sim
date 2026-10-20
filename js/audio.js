// WebAudio: sample one-shots + loops from assets/audio/manifest.json, synthesized fallbacks,
// an engine voice whose pitch follows speed.
import { S } from './state.js';

export function createAudio() {
  const AC = window.AudioContext || window.webkitAudioContext;
  let ctx = null, master, sfxBus, musicBus, engineBus;
  const buffers = new Map(), loading = new Map();
  let manifest = {};
  let music = null, musicName = null, amb = null, ambName = null;
  const eng = { src: null, gain: null, osc: null, on: false, name: null, rate: 1, target: 0.0 };

  fetch('assets/audio/manifest.json').then((r) => (r.ok ? r.json() : {})).then((m) => { manifest = m || {}; }).catch(() => {});

  function init() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
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
    musicBus.gain.value = S.settings.music * 0.55;
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
  // engine voice
  async function engine(on, vehId) {
    if (!ctx) return;
    if (!on) { if (eng.gain) eng.gain.gain.setTargetAtTime(0, ctx.currentTime, 0.15); eng.on = false; return; }
    const map = { rustbucket: 'engine-moped', zippy: 'engine-scooter', vespetta: 'engine-scooter', volt: 'engine-electric', mule: 'engine-cargo', viper: 'engine-sport' };
    const name = map[vehId] || 'engine-scooter';
    eng.on = true;
    if (eng.name === name && eng.gain) { eng.gain.gain.setTargetAtTime(0.5, ctx.currentTime, 0.2); return; }
    if (eng.src) { try { eng.src.stop(); } catch {} eng.src = null; }
    eng.name = name;
    const b = await load(name);
    const g = ctx.createGain(); g.gain.value = 0; g.connect(engineBus);
    let src;
    let off = 0;
    if (b) { src = ctx.createBufferSource(); src.buffer = b; src.loop = true; off = loopTrim(src, name); src.connect(g); }
    else {
      // synthesized putt: sawtooth through a lowpass, amplitude-modulated
      src = ctx.createOscillator(); src.type = 'sawtooth'; src.frequency.value = 38;
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 420;
      src.connect(lp); lp.connect(g);
      eng.osc = src;
    }
    src.start(0, off);
    eng.src = src; eng.gain = g;
    g.gain.setTargetAtTime(0.5 * (manifest[name]?.gain ?? 0.7), ctx.currentTime, 0.2);
  }
  function engineSpeed(ratio, boost) {
    if (!ctx || !eng.src) return;
    const r = 0.75 + ratio * 0.95 + (boost ? 0.22 : 0);
    if (eng.osc) eng.osc.frequency.setTargetAtTime(30 + ratio * 70 + (boost ? 20 : 0), ctx.currentTime, 0.08);
    else eng.src.playbackRate.setTargetAtTime(r, ctx.currentTime, 0.08);
  }
  return { init, play, loop, engine, engineSpeed, apply, get ready() { return !!ctx; } };
}

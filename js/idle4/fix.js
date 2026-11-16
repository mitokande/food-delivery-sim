// Ferdi's (idle4.html): the repairs by hand. A room in ruins is cleared out in a mini game before the builders are paid
// to come, one game to a room, all played in mini.js's frame:
// - planks (the entrance): the door is boarded up; a tap pulls a nail, a board with no nails left falls,
// - wires (the cashier): six wires, each dragged to the knob of its colour on the other side,
// - paint (the office): the old wall painted over with the roller,
// - leaks (the staff room): the pipes spring leaks; a tap shuts one before it floods,
// - weeds (the terrace): weeds and rubbish pulled off the paving with a swipe,
// - bolts (the courier bay): the bolts of the garage door turned tight, a finger going round them.
// What a result is worth is sim.js's business (FIX); the window and the cards are ui.js's. The art is in assets/ui4/fix.
import { IMG, load, rnd } from './mini.js';

const clamp = (x) => Math.max(0, Math.min(1, x));
const img = (n, cls) => { const im = document.createElement('img'); im.src = IMG(n); im.className = cls; im.alt = ''; im.draggable = false; return im; };
const div = (cls, html = '') => { const d = document.createElement('div'); d.className = cls; d.innerHTML = html; return d; };
const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
// (what every game here starts from: the picture it's played on, a layer over it, the pointer in the stage's own px)
async function scene(stage, bg, cls, art = []) {
  const [b] = await Promise.all([load(IMG(`fix/${bg}`)), ...art.map((n) => load(IMG(n)))]);
  if (b) { b.className = 'msurf'; b.alt = ''; b.draggable = false; stage.prepend(b); }
  const el = div(`fix ${cls}`); stage.append(el);
  return { el, W: stage.clientWidth, H: stage.clientHeight };
}
const at = (stage, e, W, H) => { const r = stage.getBoundingClientRect(); return [(e.clientX - r.left) * W / r.width, (e.clientY - r.top) * H / r.height]; };
const client = (stage, x, y) => { const r = stage.getBoundingClientRect(); return { x: r.left + x * r.width, y: r.top + y * r.height }; }; // (x, y: of the stage)
const listen = (stage, on, h) => { for (const k in h) stage[on ? 'addEventListener' : 'removeEventListener'](k, h[k]); };
// a picture that pops up at a point and goes (dust, a sparkle, a clod of earth)
function puff(el, name, x, y, w, cls = '') {
  const p = img(name, `fpuff ${cls}`); p.style.cssText = `left:${x * 100}%;top:${y * 100}%;width:${w * 100}%`;
  el.append(p); p.addEventListener('animationend', () => p.remove());
}

// ---------------------------------------------------------------- the boards over the door
// Five boards nailed across the door, two nails each; a rusty nail takes two taps (the first only works it loose).
const PLANKS = { at: [[0.54, 0.27, -7], [0.53, 0.38, 5], [0.55, 0.49, -4], [0.53, 0.6, 8], [0.54, 0.71, -5]], w: 0.8, nail: 0.4, rusty: 4, r: 0.13 }; // (x, y of the stage, degrees; a nail's reach, of the width)

export function planksGame({ sfx = () => {}, buzz = () => {} } = {}) {
  let stage, el, W, H, on = false, off = 0;
  const list = [];

  async function setup(s) {
    stage = s;
    ({ el, W, H } = await scene(s, 'door', 'planks', ['fix/plank1', 'fix/plank2', 'fix/plank3', 'fix/plank4', 'fix/nail', 'fix/dust', 'fix/crowbar']));
    const rusty = new Set(shuffle([...Array(PLANKS.at.length * 2).keys()]).slice(0, PLANKS.rusty)), art = shuffle([1, 2, 3, 4]);
    PLANKS.at.forEach(([x, y, deg], i) => {
      const d = div('fp', `<img src="${IMG(`fix/plank${art[i % 4]}`)}" alt="" draggable="false">`), a = (deg + rnd(-2, 2)) * Math.PI / 180;
      d.style.cssText = `left:${x * 100}%;top:${y * 100}%;width:${PLANKS.w * 100}%;--r:${a}rad`;
      const p = { el: d, x, y, nails: [], gone: false };
      for (const side of [-1, 1]) {
        const L = PLANKS.w * PLANKS.nail * side, n = { x: x + Math.cos(a) * L, y: y + Math.sin(a) * L * W / H, hp: rusty.has(i * 2 + (side > 0)) ? 2 : 1, el: img('fix/nail', 'fn') };
        n.el.style.left = `${50 + PLANKS.nail * 100 * side}%`; if (n.hp > 1) n.el.classList.add('rusty');
        d.append(n.el); p.nails.push(n);
      }
      el.append(d); list.push(p);
    });
    el.append(img('fix/crowbar', 'ftool'));
  }
  function onDown(e) {
    if (!on) return;
    e.preventDefault();
    const [px, py] = at(stage, e, W, H);
    let best = null, bd = PLANKS.r * W;
    for (const p of list) for (const n of p.nails) { const d = Math.hypot(n.x * W - px, n.y * H - py); if (n.hp > 0 && d < bd) { bd = d; best = [p, n]; } }
    if (!best) return;
    const [p, n] = best, tool = el.querySelector('.ftool');
    tool.style.left = `${n.x * 100}%`; tool.style.top = `${n.y * 100}%`; tool.classList.remove('go'); void tool.offsetWidth; tool.classList.add('go');
    if (--n.hp > 0) { n.el.classList.remove('rusty'); n.el.classList.add('loose'); sfx('ui-tap', { vol: 0.6 }); buzz(8); return; }
    n.el.classList.add('out'); sfx('event-pop', { vol: 0.5 }); buzz(12);
    if (p.nails.every((q) => q.hp <= 0)) {
      p.gone = true; off++; p.el.classList.add('fall'); p.el.style.setProperty('--d', n.x > p.x ? 1 : -1);
      puff(el, 'fix/dust', p.x, p.y, 0.5); sfx('land', { vol: 0.6 }); buzz(25);
    }
  }
  const h = { pointerdown: onDown };
  return { hint: 'Tap the nails to pull the boards off the door', go: 'Pull!', won: 'Door\'s open!', setup,
    start() { on = true; listen(stage, true, h); }, stop() { on = false; if (stage) listen(stage, false, h); }, tick() {},
    score: () => off / list.length, over: () => off >= list.length, tally: () => `<b>${off}/${list.length}</b> boards off`,
    peek: () => list.flatMap((p) => p.nails.filter((n) => n.hp > 0).map((n) => client(stage, n.x, n.y))) };
}

// ---------------------------------------------------------------- the wires
// Six wires hang from the knobs on the left; each goes to the knob of its colour on the right (never straight across).
// Into the wrong one: a spark, and a moment before the next try.
const WIRES = { cols: ['red', 'yellow', 'blue', 'green', 'purple', 'orange'], ink: { red: '#e8402f', yellow: '#f5c21b', blue: '#2f86e8', green: '#3fbf3a', purple: '#a04be0', orange: '#f58a1f' },
  x: [0.17, 0.83], y0: 0.13, dy: 0.148, r: 0.12, zap: 0.5 };

export function wiresGame({ sfx = () => {}, buzz = () => {} } = {}) {
  let stage, el, W, H, k, cv, on = false, drag = null, lock = 0, done = 0, t = 0;
  const left = [], right = [];

  async function setup(s) {
    stage = s;
    ({ el, W, H } = await scene(s, 'box', 'wires', [...WIRES.cols.map((c) => `fix/${c}`), 'scrub/sparkle']));
    k = Math.min(2, devicePixelRatio || 1);
    cv = document.createElement('canvas'); cv.width = Math.round(W * k); cv.height = Math.round(H * k); el.append(cv);
    const a = shuffle([...WIRES.cols]);
    let b; do { b = shuffle([...WIRES.cols]); } while (b.some((c, i) => c === a[i]));
    [a, b].forEach((cols, side) => cols.forEach((c, i) => {
      const n = { c, x: WIRES.x[side], y: WIRES.y0 + WIRES.dy * i, in: false, el: img(`fix/${c}`, 'fk') };
      n.el.style.cssText = `left:${n.x * 100}%;top:${n.y * 100}%`; el.append(n.el); (side ? right : left).push(n);
    }));
    draw();
  }
  // a wire from a to b (px), sagging a little: a dark coat, its colour, a highlight
  function wire(c, x0, y0, x1, y1, ink) {
    const sag = Math.min(H * 0.1, Math.abs(x1 - x0) * 0.25 + 8), mx = (x0 + x1) / 2;
    for (const [w, col] of [[11, 'rgba(20,24,34,.85)'], [7, ink], [2, 'rgba(255,255,255,.55)']]) {
      c.beginPath(); c.moveTo(x0, y0 - (w === 2 ? 2 : 0)); c.bezierCurveTo(mx, y0 + sag, mx, y1 + sag, x1, y1 - (w === 2 ? 2 : 0));
      c.lineWidth = w * W / 320; c.strokeStyle = col; c.lineCap = 'round'; c.stroke();
    }
  }
  function draw() {
    const c = cv.getContext('2d'); c.setTransform(k, 0, 0, k, 0, 0); c.clearRect(0, 0, W, H);
    for (const n of left) {
      const ink = WIRES.ink[n.c], x = n.x * W, y = n.y * H;
      if (n.in) { const m = right.find((q) => q.c === n.c); wire(c, x, y, m.x * W, m.y * H, ink); }
      else if (drag?.n === n) wire(c, x, y, drag.x, drag.y, ink);
      else wire(c, x, y, x + W * 0.1, y + H * 0.035 + Math.sin(t * 3 + n.y * 20) * 2, ink); // (a loose end, swaying)
    }
  }
  const near = (list, px, py) => list.map((n) => [n, Math.hypot(n.x * W - px, n.y * H - py)]).filter(([, d]) => d < WIRES.r * W).sort((p, q) => p[1] - q[1])[0]?.[0];
  function onDown(e) {
    if (!on || drag || lock > 0) return;
    e.preventDefault();
    const [x, y] = at(stage, e, W, H), n = near(left.filter((q) => !q.in), x, y);
    if (!n) return;
    stage.setPointerCapture?.(e.pointerId); drag = { id: e.pointerId, n, x, y }; n.el.classList.add('held'); sfx('ui-tap', { vol: 0.5 });
  }
  function onMove(e) { if (drag && e.pointerId === drag.id) { e.preventDefault(); [drag.x, drag.y] = at(stage, e, W, H); } }
  function onUp(e) {
    if (!drag || e.pointerId !== drag.id) return;
    const { n, x, y } = drag, m = near(right.filter((q) => !q.in), x, y);
    drag = null; n.el.classList.remove('held');
    if (!m) return;
    if (m.c === n.c) {
      n.in = m.in = true; done++; m.el.classList.add('in'); n.el.classList.add('in');
      puff(el, 'scrub/sparkle', m.x, m.y, 0.3, 'spin'); sfx('pickup-bonus', { vol: 0.5 }); buzz(15);
    } else {
      lock = WIRES.zap; el.classList.remove('zap'); void el.offsetWidth; el.classList.add('zap');
      m.el.classList.remove('no'); void m.el.offsetWidth; m.el.classList.add('no'); sfx('qte-bad', { vol: 0.5 }); buzz(40);
    }
  }
  const h = { pointerdown: onDown, pointermove: onMove, pointerup: onUp, pointercancel: onUp };
  return { hint: 'Drag each wire to the knob of its colour', go: 'Wire it!', won: 'Power\'s on!', setup,
    start() { on = true; listen(stage, true, h); }, stop() { on = false; drag = null; if (stage) listen(stage, false, h); if (cv) draw(); },
    tick(dt) { t += dt; lock -= dt; draw(); },
    score: () => done / left.length, over: () => done >= left.length, tally: () => `<b>${done}/${left.length}</b> wires in`,
    peek: () => left.filter((n) => !n.in).map((n) => { const m = right.find((q) => q.c === n.c); return { from: client(stage, n.x, n.y), to: client(stage, m.x, m.y), wrong: client(stage, ...((q) => [q.x, q.y])(right.find((q) => q.c !== n.c && !q.in) || m)) }; }) };
}

// ---------------------------------------------------------------- the paint
// The wall as it will be lies under the wall as it is; the roller takes the old one away where it goes. How much of
// it is left is read from a small copy every now and then.
const PAINT = { r: 0.17, a: 0.92, full: 0.97, ink: ['#8fae7c', '#a4c08f', '#7d9c6c'] }; // (the roller's half width, of the stage's; a pass; this much painted is all of it)

export function paintGame({ sfx = () => {}, buzz = () => {} } = {}) {
  let stage, el, W, H, k, old, fx, brush, probe, roller, a0 = 1, cover = 0, probeT = 0, rustleT = 0, on = false, down = null;
  const drops = [];

  async function setup(s) {
    stage = s;
    const im = await load(IMG('fix/wall-old'));
    ({ el, W, H } = await scene(s, 'wall-new', 'paint', ['fix/roller']));
    k = Math.min(2, devicePixelRatio || 1);
    const layer = () => { const c = document.createElement('canvas'); c.width = Math.round(W * k); c.height = Math.round(H * k); el.append(c); return c; };
    old = layer(); fx = layer();
    const c = old.getContext('2d'); c.scale(k, k);
    if (im) { const q = Math.max(W / im.width, H / im.height); c.drawImage(im, (W - im.width * q) / 2, (H - im.height * q) / 2, im.width * q, im.height * q); } else { c.fillStyle = '#cdbb98'; c.fillRect(0, 0, W, H); }
    // the roller's mark: wide and flat, soft at the ends
    brush = document.createElement('canvas'); brush.width = 96; brush.height = 48;
    const b = brush.getContext('2d'), g = b.createLinearGradient(0, 0, 0, 48);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(0.25, 'rgba(0,0,0,1)'); g.addColorStop(0.75, 'rgba(0,0,0,1)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    b.fillStyle = g; b.beginPath(); b.roundRect(2, 0, 92, 48, 10); b.fill();
    probe = document.createElement('canvas'); probe.width = 32; probe.height = 48;
    read(); a0 = a0 || 1;
    roller = img('fix/roller', 'froller idle'); roller.style.transform = `translate(${W / 2}px, ${H * 0.75}px)`; el.append(roller);
  }
  function read() {
    const p = probe.getContext('2d', { willReadFrequently: true }); p.clearRect(0, 0, 32, 48); p.drawImage(old, 0, 0, 32, 48);
    const d = p.getImageData(0, 0, 32, 48).data; let a = 0;
    for (let i = 3; i < d.length; i += 4) a += d[i];
    if (!on && !cover) a0 = a;
    cover = clamp(1 - a / a0); if (cover >= PAINT.full) cover = 1;
  }
  function roll(x0, y0, x1, y1) {
    const R = W * PAINT.r, d = Math.hypot(x1 - x0, y1 - y0), n = Math.max(1, Math.ceil(d / (R * 0.3))), c = old.getContext('2d');
    c.save(); c.globalCompositeOperation = 'destination-out'; c.globalAlpha = PAINT.a;
    for (let i = 1; i <= n; i++) { const x = x0 + (x1 - x0) * i / n, y = y0 + (y1 - y0) * i / n; c.drawImage(brush, x - R, y - R * 0.5, R * 2, R); }
    c.restore();
    for (let i = 0; i < n && drops.length < 50; i++) if (Math.random() < 0.35) drops.push({ x: x1 + rnd(-R, R), y: y1 + rnd(-6, 6), r: rnd(1.5, 4), vx: rnd(-20, 20), vy: rnd(10, 60), t: 0, life: rnd(0.4, 0.8), ink: PAINT.ink[drops.length % 3] });
    if (d > 3 && rustleT <= 0) { sfx('bag-rustle', { vol: 0.16 }); rustleT = 0.3; }
  }
  const place = (x, y) => { roller.style.transform = `translate(${x}px, ${y}px)`; };
  function onDown(e) {
    if (!on || down) return;
    e.preventDefault(); stage.setPointerCapture?.(e.pointerId);
    const [x, y] = at(stage, e, W, H); down = { id: e.pointerId, x, y };
    roller.classList.remove('idle'); roll(x, y, x, y); place(x, y);
  }
  function onMove(e) {
    if (!down || e.pointerId !== down.id) return;
    e.preventDefault();
    for (const p of e.getCoalescedEvents?.().length ? e.getCoalescedEvents() : [e]) { const [x, y] = at(stage, p, W, H); roll(down.x, down.y, x, y); place(x, y); down.x = x; down.y = y; }
  }
  function onUp(e) { if (down && e.pointerId === down.id) down = null; }
  function draw(dt) {
    const c = fx.getContext('2d'); c.setTransform(k, 0, 0, k, 0, 0); c.clearRect(0, 0, W, H);
    for (let i = drops.length - 1; i >= 0; i--) {
      const d = drops[i]; d.t += dt;
      if (d.t >= d.life) { drops.splice(i, 1); continue; }
      d.x += d.vx * dt; d.y += d.vy * dt; d.vy += 240 * dt;
      c.globalAlpha = 1 - d.t / d.life; c.fillStyle = d.ink; c.beginPath(); c.arc(d.x, d.y, d.r, 0, 7); c.fill();
    }
    c.globalAlpha = 1;
  }
  const h = { pointerdown: onDown, pointermove: onMove, pointerup: onUp, pointercancel: onUp };
  return { hint: 'Roll fresh paint over the old wall with your finger', go: 'Paint!', won: 'Good as new!', setup,
    start() { on = true; listen(stage, true, h); }, stop() { on = false; down = null; if (stage) listen(stage, false, h); if (fx) { read(); draw(0.016); } },
    tick(dt) { rustleT -= dt; probeT -= dt; if (probeT <= 0) { probeT = 0.12; const was = cover; read(); if (cover === 1 && was < 1) buzz(20); } draw(dt); },
    score: () => cover, over: () => cover >= 1, tally: () => `<b>${Math.round(cover * 100)}%</b> painted` };
}

// ---------------------------------------------------------------- the leaks
// The pipes spring one leak after another, at their joints, faster as it goes. A tap shuts one (a clamp round the
// pipe); one left too long is water on the floor.
const LEAKS = { at: [[0.14, 0.13, 50], [0.76, 0.13, 140], [0.77, 0.38, 180], [0.13, 0.48, 320], [0.53, 0.49, 300], [0.13, 0.79, 60], [0.82, 0.77, 120], [0.54, 0.78, 90], [0.45, 0.12, 80]], // (x, y of the stage; the way it sprays, degrees)
  n: 14, life: [2.4, 1.5], r: 0.14, rise: 0.4 };

export function leaksGame({ sfx = () => {}, buzz = () => {} } = {}) {
  let stage, el, W, H, water, on = false, t = 0, shut = 0, lost = 0;
  const plan = [], live = [];

  async function setup(s, dur) {
    stage = s;
    ({ el, W, H } = await scene(s, 'pipes', 'leaks', ['fix/spray', 'fix/clamp', 'fix/wrench']));
    water = div('fwater'); el.append(water); el.append(img('fix/wrench', 'ftool'));
    const span = dur - LEAKS.life[1] - 0.8;
    for (let j = 0; j < LEAKS.n; j++) { const f = j / (LEAKS.n - 1); plan.push({ t: Math.max(0, f * span + (j ? rnd(-0.2, 0.2) : 0)), life: LEAKS.life[0] + (LEAKS.life[1] - LEAKS.life[0]) * f }); }
  }
  function spring(q) {
    const free = LEAKS.at.map((_, i) => i).filter((i) => !live.some((l) => l.i === i));
    const i = free[Math.floor(Math.random() * free.length)], [x, y, deg] = LEAKS.at[i];
    const d = div('fl', `<img src="${IMG('fix/spray')}" alt="" draggable="false">`); d.style.cssText = `left:${x * 100}%;top:${y * 100}%;--r:${deg}deg`;
    el.append(d); live.push({ i, x, y, t: 0, life: q.life, el: d }); sfx('splash', { vol: 0.25 });
  }
  function onDown(e) {
    if (!on) return;
    e.preventDefault();
    const [px, py] = at(stage, e, W, H);
    const l = live.map((q) => [q, Math.hypot(q.x * W - px, q.y * H - py)]).filter(([, d]) => d < LEAKS.r * W).sort((a, b) => a[1] - b[1])[0]?.[0];
    if (!l) return;
    live.splice(live.indexOf(l), 1); shut++;
    const tool = el.querySelector('.ftool'); tool.style.left = `${l.x * 100}%`; tool.style.top = `${l.y * 100}%`; tool.classList.remove('go'); void tool.offsetWidth; tool.classList.add('go');
    l.el.innerHTML = `<img src="${IMG('fix/clamp')}" alt="" draggable="false">`; l.el.className = 'fl shut'; l.el.addEventListener('animationend', () => l.el.remove());
    sfx('qte-good', { vol: 0.4 }); buzz(12);
  }
  function tick(dt) {
    t += dt;
    while (plan.length && plan[0].t <= t) spring(plan.shift());
    for (let i = live.length - 1; i >= 0; i--) {
      const l = live[i]; l.t += dt;
      l.el.style.setProperty('--f', (l.t / l.life).toFixed(2));
      if (l.t < l.life) continue;
      live.splice(i, 1); lost++; l.el.remove(); water.style.height = `${lost / LEAKS.n * LEAKS.rise * 100}%`;
      el.classList.remove('oops'); void el.offsetWidth; el.classList.add('oops'); sfx('qte-bad', { vol: 0.4 }); buzz(30);
    }
  }
  const h = { pointerdown: onDown };
  return { hint: 'Tap the leaks to shut them before the room floods', go: 'Plug them!', won: 'Dry as a bone!', done: 'That\'s the lot!', setup,
    start() { on = true; listen(stage, true, h); }, stop() { on = false; if (stage) listen(stage, false, h); }, tick,
    score: () => shut / LEAKS.n, over: () => !plan.length && !live.length, tally: () => `<b>${shut}/${LEAKS.n}</b> leaks shut`,
    peek: () => live.map((l) => client(stage, l.x, l.y)) };
}

// ---------------------------------------------------------------- the weeds
// Weeds, a can and a broken pot on the paving. A finger down on one and a pull far enough, any way, has it out.
const WEEDS = { n: 10, art: ['w1', 'w2', 'w3', 'w4', 'w5', 'w1', 'w3', 'w5', 'can', 'pot'], r: 0.15, pull: 0.15, gap: 0.24 }; // (how near a finger has to be, how far the pull, how far apart they stand: of the stage's width)

export function weedsGame({ sfx = () => {}, buzz = () => {} } = {}) {
  let stage, el, W, H, on = false, down = null, out = 0;
  const list = [];

  async function setup(s) {
    stage = s;
    ({ el, W, H } = await scene(s, 'terrace', 'weeds', [...new Set(WEEDS.art)].map((n) => `fix/${n}`).concat('fix/dirt', 'fix/glove')));
    for (const art of shuffle([...WEEDS.art])) {
      let x, y, n = 0;
      do { x = rnd(0.15, 0.85); y = rnd(0.2, 0.92); } while (n++ < 60 && list.some((w) => Math.hypot((w.x - x) * W, (w.y - y) * H) < WEEDS.gap * W));
      const w = { x, y, art, gone: false, el: img(`fix/${art}`, `fw2 ${art.startsWith('w') ? '' : 'junk'}`) };
      w.el.style.cssText = `left:${x * 100}%;top:${y * 100}%;z-index:${Math.round(y * 100)}`; list.push(w);
    }
    list.sort((a, b) => a.y - b.y).forEach((w) => el.append(w.el));
    el.append(img('fix/glove', 'fglove'));
  }
  const glove = (x, y, held) => { const g = el.querySelector('.fglove'); g.style.transform = `translate(${x}px, ${y}px)`; g.classList.toggle('on', held); };
  function onDown(e) {
    if (!on || down) return;
    e.preventDefault();
    const [x, y] = at(stage, e, W, H);
    // (a weed is held by its leaves: a little above where it stands)
    const w = list.filter((q) => !q.gone).map((q) => [q, Math.hypot(q.x * W - x, (q.y - 0.05) * H - y)]).filter(([, d]) => d < WEEDS.r * W).sort((a, b) => a[1] - b[1])[0]?.[0];
    glove(x, y, !!w);
    if (!w) return;
    stage.setPointerCapture?.(e.pointerId); down = { id: e.pointerId, w, x, y }; w.el.classList.add('held'); sfx('bag-rustle', { vol: 0.2 });
  }
  function onMove(e) {
    if (!down || e.pointerId !== down.id) return;
    e.preventDefault();
    const [x, y] = at(stage, e, W, H), dx = x - down.x, dy = y - down.y, d = Math.hypot(dx, dy), w = down.w;
    glove(x, y, true);
    if (d < WEEDS.pull * W) { w.el.style.setProperty('--x', `${dx * 0.5}px`); w.el.style.setProperty('--y', `${dy * 0.5}px`); return; }
    w.gone = true; out++; down = null;
    w.el.classList.remove('held'); w.el.classList.add('out'); w.el.style.setProperty('--x', `${dx / d * W * 0.9}px`); w.el.style.setProperty('--y', `${dy / d * W * 0.9}px`);
    w.el.addEventListener('transitionend', () => w.el.remove(), { once: true });
    puff(el, 'fix/dirt', w.x, w.y, 0.26); sfx('event-pop', { vol: 0.5 }); buzz(14); el.querySelector('.fglove').classList.remove('on');
  }
  function onUp(e) {
    if (!down || e.pointerId !== down.id) return;
    const w = down.w; down = null;
    w.el.classList.remove('held'); w.el.style.setProperty('--x', '0px'); w.el.style.setProperty('--y', '0px'); el.querySelector('.fglove').classList.remove('on');
  }
  const h = { pointerdown: onDown, pointermove: onMove, pointerup: onUp, pointercancel: onUp };
  return { hint: 'Swipe the weeds and the rubbish off the terrace', go: 'Clear it!', won: 'All clear!', setup,
    start() { on = true; listen(stage, true, h); }, stop() { on = false; down = null; if (stage) listen(stage, false, h); }, tick() {},
    score: () => out / list.length, over: () => out >= list.length, tally: () => `<b>${out}/${list.length}</b> cleared`,
    peek: () => list.filter((w) => !w.gone).map((w) => client(stage, w.x, w.y - 0.05)) };
}

// ---------------------------------------------------------------- the bolts
// Four loose bolts on the garage door's plate. A finger going round one, clockwise, turns it in (the other way the
// wrench only clicks back, like a ratchet); `turns` round and it's tight.
const BOLTS = { at: [[0.31, 0.27], [0.69, 0.27], [0.31, 0.73], [0.69, 0.73]], turns: [1.25, 1.5, 1.5, 1.75], dead: 0.05, click: Math.PI / 3 }; // (dead: too near the middle to tell which way, of the width)

export function boltsGame({ sfx = () => {}, buzz = () => {} } = {}) {
  let stage, el, W, H, wrench, on = false, down = null;
  const list = [];

  async function setup(s) {
    stage = s;
    ({ el, W, H } = await scene(s, 'garage', 'bolts', ['fix/bolt', 'fix/wrench', 'scrub/sparkle']));
    const turns = shuffle([...BOLTS.turns]);
    BOLTS.at.forEach(([x, y], i) => {
      const d = div('fb', `<i class="fring"></i><img src="${IMG('fix/bolt')}" alt="" draggable="false">`); d.style.cssText = `left:${x * 100}%;top:${y * 100}%`;
      el.append(d); list.push({ x, y, need: turns[i] * Math.PI * 2, a: 0, tick: 0, done: false, el: d, rot: rnd(0, 1) });
    });
    wrench = img('fix/wrench', 'fwrench'); el.append(wrench);
    list.forEach(look);
  }
  const prog = (b) => clamp(b.a / b.need);
  function look(b) { b.el.style.setProperty('--p', prog(b).toFixed(3)); b.el.style.setProperty('--a', `${(b.rot + b.a).toFixed(3)}rad`); }
  const hold = (b, ang) => { wrench.style.transform = `translate(${b.x * W}px, ${b.y * H}px) rotate(${ang}rad)`; wrench.classList.add('on'); };
  function onDown(e) {
    if (!on || down) return;
    e.preventDefault();
    const [x, y] = at(stage, e, W, H);
    const b = list.filter((q) => !q.done).map((q) => [q, Math.hypot(q.x * W - x, q.y * H - y)]).sort((p, q) => p[1] - q[1])[0]?.[0];
    if (!b) return;
    stage.setPointerCapture?.(e.pointerId);
    down = { id: e.pointerId, b, ang: Math.atan2(y - b.y * H, x - b.x * W) }; b.el.classList.add('now'); hold(b, down.ang);
  }
  function onMove(e) {
    if (!down || e.pointerId !== down.id) return;
    e.preventDefault();
    const b = down.b;
    for (const p of e.getCoalescedEvents?.().length ? e.getCoalescedEvents() : [e]) {
      const [x, y] = at(stage, p, W, H), dx = x - b.x * W, dy = y - b.y * H;
      if (Math.hypot(dx, dy) < BOLTS.dead * W) continue;
      const ang = Math.atan2(dy, dx); let d = ang - down.ang;
      if (d > Math.PI) d -= Math.PI * 2; else if (d < -Math.PI) d += Math.PI * 2;
      down.ang = ang;
      if (d <= 0) continue;
      b.a += d; b.tick += d;
      if (b.tick >= BOLTS.click) { b.tick = 0; sfx('ui-tap', { vol: 0.35 }); buzz(5); }
      if (b.a >= b.need) { tight(b); return; }
    }
    hold(b, down.ang); look(b);
  }
  function tight(b) {
    b.a = b.need; b.done = true; look(b); b.el.classList.remove('now'); b.el.classList.add('done'); wrench.classList.remove('on'); down = null;
    puff(el, 'scrub/sparkle', b.x, b.y, 0.34, 'spin'); sfx('land', { vol: 0.6 }); sfx('qte-good', { vol: 0.4 }); buzz(25);
  }
  function onUp(e) { if (down && e.pointerId === down.id) { down.b.el.classList.remove('now'); wrench.classList.remove('on'); down = null; } }
  const h = { pointerdown: onDown, pointermove: onMove, pointerup: onUp, pointercancel: onUp };
  const tightN = () => list.filter((b) => b.done).length;
  return { hint: 'Circle each bolt clockwise with your finger till it\'s tight', go: 'Tighten!', won: 'Rock solid!', setup,
    start() { on = true; listen(stage, true, h); }, stop() { on = false; down = null; wrench?.classList.remove('on'); if (stage) listen(stage, false, h); }, tick() {},
    score: () => list.reduce((s, b) => s + prog(b), 0) / list.length, over: () => list.every((b) => b.done), tally: () => `<b>${tightN()}/${list.length}</b> bolts tight`,
    peek: () => list.filter((b) => !b.done).map((b) => ({ ...client(stage, b.x, b.y), r: stage.getBoundingClientRect().width * 0.16, left: b.need - b.a })) };
}

export const GAMES = { planks: planksGame, wires: wiresGame, paint: paintGame, leaks: leaksGame, weeds: weedsGame, bolts: boltsGame };

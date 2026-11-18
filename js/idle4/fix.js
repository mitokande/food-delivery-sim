// Ferdi's (idle4.html): the repairs by hand. A room in ruins is cleared out in a mini game before the builders are paid
// to come, one game to a room, all played in mini.js's frame:
// - wash (the entrance): the front washed with a pressure washer, the grime, the graffiti and the old posters off it
//   (no clock: a tank of water),
// - coins (the cashier): the till's spilled coins sorted into stacks of one kind, in as few moves as can be (no clock),
// - photo (the office): Uncle Ferdi's torn photo of the opening day put back together in its frame,
// - pipes (the staff room): the pipe tiles turned till the water runs from the tap to the basin,
// - mow (the terrace): the lawn mowed in one go, every patch once, round the pots,
// - park (the courier bay): the junk slid out of the way to get the scooter out of the garage.
// None has a clock: they count the water, the moves or the mistakes it took.
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

// ---------------------------------------------------------------- the front, washed
// The front as it was after years of neglect lies over the front as it is (an edit of the same picture, every brick
// where it was): the jet takes the grime away where it goes, in one pass. On it, the mess that takes longer (a few
// passes, or the jet held on it): graffiti, posters, moss…, and two old tarps nailed over the sign (the jet tears
// them off; till then it's washing the tarp, not the wall). The tank runs while the jet does; the game is over when
// the front is clean or the tank is dry.
const WASH = {
  r: 0.085, mark: 0.035, pop: 0.3, full: 0.96, // (the jet's reach, of the stage's width; what a dab takes of a mark; a mark nearly gone comes off; this much of the grime is all of it)
  tank: 30, low: 0.2, share: 0.55, n: 6, // (seconds of water; the tank is low below this; the grime's share of the score, the mess's the rest; how many bits of mess)
  tarps: [[0.27, 0.14, -4], [0.74, 0.135, 5]], tarp: [0.52, 0.85], // (x, y of the stage, degrees; a tarp's width of the stage's, the seconds of jet that tear it off)
  marks: { tag1: [0.15, 0.81, 0.27, -6], tag2: [0.85, 0.81, 0.27, 4], poster1: [0.5, 0.73, 0.19, -5], poster2: [0.84, 0.51, 0.2, 6],
    moss: [0.27, 0.88, 0.2, 0], web: [0.1, 0.45, 0.2, 0], mud: [0.72, 0.95, 0.24, 10], soot: [0.5, 0.49, 0.24, 0] }, // (x, y, width, degrees)
  gun: 0.13, // (the gun's width, of the stage's)
};

export function washGame({ sfx = () => {}, buzz = () => {}, loop = () => null } = {}) {
  let stage, el, W, H, k, grime, marks, fx, probe, brush, gun, splash, drop, jet = null;
  let a0 = 1, clean = 0, water = 1, probeT = 0, dry = 0, lowSaid = false, on = false, down = null, gx = 0, ang = 0;
  const list = [], tarps = [], drops = [];

  async function setup(s) {
    stage = s;
    const names = shuffle(Object.keys(WASH.marks)).slice(0, WASH.n);
    const [dirty, ...ims] = await Promise.all([load(IMG('fix/front-dirty')), ...names.map((n) => load(IMG(`fix/${n}`)))]);
    ({ el, W, H } = await scene(s, 'front', 'wash', ['fix/gun', 'fix/splash', 'fix/drop', 'fix/tarp', 'fix/foam', 'scrub/sparkle']));
    k = Math.min(2, devicePixelRatio || 1);
    const layer = () => { const c = document.createElement('canvas'); c.width = Math.round(W * k); c.height = Math.round(H * k); el.append(c); return c; };
    grime = layer(); marks = layer();
    let c = grime.getContext('2d'); c.scale(k, k);
    if (dirty) c.drawImage(dirty, 0, 0, W, H); else { c.fillStyle = 'rgba(90, 76, 58, .8)'; c.fillRect(0, 0, W, H); }
    c = marks.getContext('2d'); c.scale(k, k);
    names.forEach((n, i) => {
      const im = ims[i]; if (!im) return;
      const [x, y, w, deg] = WASH.marks[n], m = { n, x: x * W, y: y * H, w: w * W, h: w * W * im.height / im.width, rot: (deg + rnd(-4, 4)) * Math.PI / 180, a0: 1, a: 1, gone: false };
      c.save(); c.translate(m.x, m.y); c.rotate(m.rot); c.drawImage(im, -m.w / 2, -m.h / 2, m.w, m.h); c.restore();
      list.push(m);
    });
    for (const [x, y, deg] of WASH.tarps) {
      const t = { x, y, hp: WASH.tarp[1], gone: false, el: img('fix/tarp', 'ftarp') };
      t.el.style.cssText = `left:${x * 100}%;top:${y * 100}%;width:${WASH.tarp[0] * 100}%;--r:${deg}deg`; el.append(t.el); tarps.push(t);
    }
    fx = layer();
    splash = img('fix/splash', 'fsplash'); gun = img('fix/gun', 'fgun'); el.append(splash, gun);
    drop = await load(IMG('fix/drop'));
    // the jet's dab: a hard middle, soft at the edge
    brush = document.createElement('canvas'); brush.width = brush.height = 64;
    const b = brush.getContext('2d'), g = b.createRadialGradient(32, 32, 10, 32, 32, 32);
    g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(0.6, 'rgba(0,0,0,1)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    b.fillStyle = g; b.fillRect(0, 0, 64, 64);
    probe = document.createElement('canvas'); probe.width = 36; probe.height = Math.round(36 * H / W);
    read(); a0 = a0 || 1; list.forEach((m) => { m.a0 = m.a || 1; }); read();
    gx = W / 2; aimAt(W / 2, H * 0.62);
  }
  // what's left: the grime's alpha, each mark's in its own box
  function read() {
    const p = probe.getContext('2d', { willReadFrequently: true }), pw = probe.width, ph = probe.height, q = pw / W;
    p.clearRect(0, 0, pw, ph); p.drawImage(grime, 0, 0, pw, ph);
    let d = p.getImageData(0, 0, pw, ph).data, a = 0;
    for (let i = 3; i < d.length; i += 4) a += d[i];
    if (!on && !clean) a0 = a;
    clean = clamp((1 - a / a0) / WASH.full);
    p.clearRect(0, 0, pw, ph); p.drawImage(marks, 0, 0, pw, ph); d = p.getImageData(0, 0, pw, ph).data;
    for (const m of list) {
      if (m.gone) continue;
      const rr = Math.max(m.w, m.h) / 2, X0 = Math.max(0, Math.floor((m.x - rr) * q)), X1 = Math.min(pw, Math.ceil((m.x + rr) * q)), Y0 = Math.max(0, Math.floor((m.y - rr) * q)), Y1 = Math.min(ph, Math.ceil((m.y + rr) * q));
      let s = 0; for (let y = Y0; y < Y1; y++) for (let x = X0; x < X1; x++) s += d[(y * pw + x) * 4 + 3];
      m.a = s;
      if (on && s < m.a0 * WASH.pop) off(m);
    }
  }
  // a bit of mess nearly washed away comes off at once
  function off(m) {
    m.gone = true;
    const c = marks.getContext('2d'); c.save(); c.globalCompositeOperation = 'destination-out';
    c.translate(m.x, m.y); c.rotate(m.rot); c.fillRect(-m.w / 2 - 4, -m.h / 2 - 4, m.w + 8, m.h + 8); c.restore();
    puff(el, 'fix/foam', m.x / W, m.y / H, 0.26); puff(el, 'scrub/sparkle', m.x / W, m.y / H, 0.3, 'spin');
    sfx('event-pop', { vol: 0.55 }); buzz(18);
  }
  const tarpAt = (x, y) => tarps.find((t) => !t.gone && Math.abs(x - t.x * W) < W * WASH.tarp[0] * 0.46 && Math.abs(y - t.y * H) < W * WASH.tarp[0] * 0.3);
  // the jet from (x0, y0) to (x1, y1) over dt seconds
  function spray(x0, y0, x1, y1, dt) {
    const R = W * WASH.r, d = Math.hypot(x1 - x0, y1 - y0), n = Math.max(1, Math.ceil(d / (R * 0.3)));
    const t = tarpAt(x1, y1);
    if (t) { hitTarp(t, dt); return; }
    const g = grime.getContext('2d'), m = marks.getContext('2d');
    g.save(); g.globalCompositeOperation = 'destination-out';
    m.save(); m.globalCompositeOperation = 'destination-out'; m.globalAlpha = 1 - (1 - WASH.mark) ** Math.max(1, dt * 60 / n);
    for (let i = 1; i <= n; i++) {
      const x = x0 + (x1 - x0) * i / n, y = y0 + (y1 - y0) * i / n;
      if (tarpAt(x, y)) continue;
      g.drawImage(brush, x - R, y - R, R * 2, R * 2); m.drawImage(brush, x - R * 1.3, y - R * 1.3, R * 2.6, R * 2.6);
    }
    g.restore(); m.restore();
  }
  function hitTarp(t, dt) {
    t.hp -= dt; t.el.classList.add('hit'); t.hitT = 0.12;
    if (t.hp > 0) return;
    t.gone = true; t.el.classList.remove('hit'); t.el.classList.add('off');
    puff(el, 'fix/splash', t.x, t.y, 0.4); sfx('land', { vol: 0.6 }); buzz(30);
  }
  // the gun stands at the bottom and turns to where the jet goes; its nozzle → [x, y]
  function aimAt(x, y) {
    const gw = W * WASH.gun, gh = gw * 384 / 126, L = gh * 0.82;
    gx += (x * 0.55 + W * 0.225 - gx) * 0.35;
    const by = H + gh * 0.1;
    ang = Math.max(-0.9, Math.min(0.9, Math.atan2(x - gx, by - y)));
    gun.style.transform = `translate(${gx - gw / 2}px, ${by - gh * 0.85}px) rotate(${ang}rad)`;
    return [gx + Math.sin(ang) * L, by - Math.cos(ang) * L];
  }
  function onDown(e) {
    if (!on || down || water <= 0) return;
    e.preventDefault(); stage.setPointerCapture?.(e.pointerId);
    const [x, y] = at(stage, e, W, H); down = { id: e.pointerId, x, y, px: x, py: y };
    el.classList.add('on'); jet?.set({ vol: 0.9 }); buzz(8);
  }
  function onMove(e) {
    if (!down || e.pointerId !== down.id) return;
    e.preventDefault(); [down.x, down.y] = at(stage, e, W, H);
  }
  function onUp(e) { if (down && e.pointerId === down.id) { down = null; el.classList.remove('on'); jet?.set({ vol: 0 }); } }
  const score = () => WASH.share * clean + (1 - WASH.share) * (list.filter((m) => m.gone).length + tarps.filter((t) => t.gone).length) / (list.length + tarps.length);
  function draw(dt, tip) {
    const c = fx.getContext('2d'); c.setTransform(k, 0, 0, k, 0, 0); c.clearRect(0, 0, W, H);
    if (down) { // the jet: a white core in a pale blue spray, a little wobble at the end
      const [tx, ty] = tip, x = down.x + rnd(-1.5, 1.5), y = down.y + rnd(-1.5, 1.5), mx = (tx + x) / 2, my = (ty + y) / 2 + Math.abs(x - tx) * 0.08;
      for (const [w, col] of [[11, 'rgba(160, 215, 255, .4)'], [6, 'rgba(225, 245, 255, .85)'], [2.5, '#fff']]) {
        c.beginPath(); c.moveTo(tx, ty); c.quadraticCurveTo(mx, my, x, y); c.lineWidth = w * W / 360; c.strokeStyle = col; c.lineCap = 'round'; c.stroke();
      }
      for (let i = 0; i < 3 && drops.length < 60; i++) drops.push({ x, y, vx: rnd(-170, 170), vy: rnd(-230, -30), r: rnd(3, 6.5) * W / 360, t: 0, life: rnd(0.35, 0.7) });
      splash.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%) rotate(${rnd(-20, 20)}deg) scale(${rnd(0.85, 1.1)})`;
    }
    for (let i = drops.length - 1; i >= 0; i--) {
      const d = drops[i]; d.t += dt;
      if (d.t >= d.life) { drops.splice(i, 1); continue; }
      d.x += d.vx * dt; d.y += d.vy * dt; d.vy += 900 * dt;
      c.globalAlpha = 1 - d.t / d.life;
      if (drop) c.drawImage(drop, d.x - d.r, d.y - d.r * 1.5, d.r * 2, d.r * 3); else { c.fillStyle = '#bfe6ff'; c.beginPath(); c.arc(d.x, d.y, d.r, 0, 7); c.fill(); }
    }
    c.globalAlpha = 1;
  }
  const h = { pointerdown: onDown, pointermove: onMove, pointerup: onUp, pointercancel: onUp };
  return { hint: 'Hold and drag to wash · blast the stubborn spots', go: 'Wash!', won: 'Sparkling!', done: 'Out of water!', setup,
    meter: { icon: 'fix/tank', text: () => `${Math.ceil(water * 100)}%` }, low: () => water < WASH.low,
    start() { on = true; listen(stage, true, h); jet = loop('wash-jet', { vol: 0 }); },
    stop() { on = false; down = null; el?.classList.remove('on'); jet?.stop(); jet = null; if (stage) listen(stage, false, h); },
    tick(dt) {
      for (const t of tarps) if (t.hitT > 0 && (t.hitT -= dt) <= 0) t.el.classList.remove('hit');
      const tip = aimAt(down ? down.x : W / 2, down ? down.y : H * 0.62);
      if (down) {
        spray(down.px, down.py, down.x, down.y, dt); down.px = down.x; down.py = down.y;
        water = Math.max(0, water - dt / WASH.tank);
        if (water < WASH.low && !lowSaid) { lowSaid = true; sfx('countdown-tick', { vol: 0.5 }); }
        if (water <= 0) { down = null; el.classList.remove('on'); jet?.set({ vol: 0 }); sfx('qte-bad', { vol: 0.4 }); }
      }
      if (water <= 0) dry += dt;
      probeT -= dt; if (probeT <= 0) { probeT = 0.12; const was = clean; read(); if (clean === 1 && was < 1) buzz(20); }
      draw(dt, tip);
    },
    score, over: () => score() >= 0.999 || dry > 0.5, tally: () => `<b>${Math.round(score() * 100)}%</b> clean`,
    peek: () => ({ tarps: tarps.filter((t) => !t.gone).map((t) => client(stage, t.x, t.y)), marks: list.filter((m) => !m.gone).map((m) => client(stage, m.x / W, m.y / H)),
      box: stage.getBoundingClientRect().toJSON(), water }) };
}

// ---------------------------------------------------------------- the coins
// The old till spilled its coins: they lie in stacks on dishes, every kind mixed up. A tap lifts the top of a stack
// (the coins of one kind on top of it), a tap on another dish puts them there: on an empty dish or on the same kind,
// as many as fit. Four alike roll up and go back into the till, and their dish is free again. Three rounds, each
// bigger than the last; what counts is the moves it took, against the fewest it could have (coinPar).
const COINS = {
  cap: 4, kinds: ['c1', 'c2', 'c3', 'c4', 'c5', 'c6'],
  rounds: [{ kinds: 2, dishes: 3, par: [4, 5] }, { kinds: 3, dishes: 5, par: [7, 9] }, { kinds: 4, dishes: 6, par: [10, 12] }], // (filled dishes hold four each; the rest start empty)
  spare: [4, 12], cap3: [1, 0.8, 0.55], // (moves over the fewest for three stars, for two; what the score can reach with three, two, one)
  at: { 3: [[0.2, 0.66], [0.5, 0.66], [0.8, 0.66]], 5: [[0.2, 0.55], [0.5, 0.55], [0.8, 0.55], [0.35, 0.85], [0.65, 0.85]], 6: [[0.2, 0.55], [0.5, 0.55], [0.8, 0.55], [0.2, 0.85], [0.5, 0.85], [0.8, 0.85]] },
  dish: 0.27, coin: 0.21, step: 0.033, till: [0.5, 0.07], // (widths of the stage's; a coin over the one under it, of the height; the till's drawer)
};
// the moves from the dishes `st` (each bottom → top): [from, to, the dishes after]; four alike roll away. (Moving a
// whole stack of one kind onto an empty dish changes nothing, and isn't one.)
function coinMoves(st) {
  const out = [];
  st.forEach((s, i) => {
    if (!s.length) return;
    const top = s[s.length - 1]; let run = 0;
    while (run < s.length && s[s.length - 1 - run] === top) run++;
    st.forEach((d, j) => {
      if (i === j || d.length >= COINS.cap || (d.length ? d[d.length - 1] !== top : run === s.length)) return;
      const n = Math.min(run, COINS.cap - d.length), nx = st.map((q) => q.slice());
      nx[j].push(...nx[i].splice(s.length - n, n));
      if (nx[j].length === COINS.cap && nx[j].every((c) => c === top)) nx[j] = [];
      out.push([i, j, nx]);
    });
  });
  return out;
}
// the fewest moves that clear `st` (null: never), the first move of such a way, and whether any way leads to a dead end
export function coinPar(st) {
  const key = (q) => q.map((d) => d.join('.')).sort().join('|');
  const seen = new Set([key(st)]); let front = [[st, null]], n = 0, stuck = false, first = null;
  while (front.length) {
    const next = [];
    for (const [q, f] of front) {
      if (q.every((d) => !d.length)) { if (first == null) first = { par: n, next: f }; continue; }
      const ms = coinMoves(q); if (!ms.length) stuck = true;
      for (const [i, j, nx] of ms) { const kk = key(nx); if (!seen.has(kk)) { seen.add(kk); next.push([nx, f || [i, j]]); } }
    }
    if (first) return { ...first, stuck };
    front = next; n++;
  }
  return { par: null, next: null, stuck: true };
}
// a round's dishes: the coins dealt at random, till it takes as many moves as it should and can't get stuck
function deal(r) {
  let best = null;
  for (let t = 0; t < 60; t++) {
    const bag = shuffle(Array.from({ length: r.kinds * COINS.cap }, (_, i) => Math.floor(i / COINS.cap)));
    const st = Array.from({ length: r.dishes }, (_, i) => (i < r.kinds ? bag.slice(i * COINS.cap, (i + 1) * COINS.cap) : []));
    if (st.some((d) => d.length && d.every((c) => c === d[0]))) continue;
    const p = coinPar(st);
    if (p.par == null || p.stuck) continue;
    best = { st, par: p.par };
    if (p.par >= r.par[0] && p.par <= r.par[1]) break;
  }
  return best;
}

export function coinsGame({ sfx = () => {}, buzz = () => {} } = {}) {
  let stage, el, W, H, on = false, round = -1, st = [], par = 0, moves = 0, rolled = 0, sel = null, busy = 0, done = false, kinds = [];
  const total = COINS.rounds.reduce((a, r) => a + r.kinds * COINS.cap, 0), dishes = [], coins = []; // (coins: { el, k, d, i })
  let rounds = [];

  async function setup(s) {
    stage = s;
    ({ el, W, H } = await scene(s, 'till', 'coins', [...COINS.kinds.map((c) => `fix/${c}`), 'fix/dish', 'fix/roll', 'scrub/sparkle']));
    rounds = COINS.rounds.map(deal); par = rounds.reduce((a, r) => a + r.par, 0);
    next();
  }
  const limit = () => par + COINS.spare[moves <= par + COINS.spare[0] ? 0 : 1];
  const score = () => (rolled / total) * COINS.cap3[moves <= par + COINS.spare[0] ? 0 : moves <= par + COINS.spare[1] ? 1 : 2];
  // where a coin sits: on its dish, one coin's step over the one under it
  const spot = (d, i) => [dishes[d].x, dishes[d].y - 0.012 - i * COINS.step];
  function put(c, lift = 0) {
    const [x, y] = spot(c.d, c.i);
    c.el.style.left = `${x * 100}%`; c.el.style.top = `${(y - lift) * 100}%`; c.el.style.zIndex = String(Math.round(dishes[c.d].y * 100) * 10 + c.i + 1);
  }
  // the next round: its dishes pop in, its coins drop onto them
  function next() {
    round++; sel = null;
    for (const d of dishes.splice(0)) d.el.remove();
    const r = rounds[round]; st = r.st.map((d) => d.slice()); kinds = shuffle([...COINS.kinds]).slice(0, COINS.rounds[round].kinds);
    COINS.at[st.length].forEach(([x, y], i) => {
      const d = { x, y, el: img('fix/dish', 'fd') }; d.el.style.cssText = `left:${x * 100}%;top:${y * 100}%;width:${COINS.dish * 100}%;animation-delay:${i * 60}ms`;
      el.append(d.el); dishes.push(d);
    });
    st.forEach((s, d) => s.forEach((k, i) => {
      const c = { el: img(`fix/${kinds[k]}`, 'fc drop'), k, d, i }; c.el.style.width = `${COINS.coin * 100}%`; c.el.style.animationDelay = `${180 + d * 60 + i * 45}ms`;
      c.el.addEventListener('animationend', () => c.el.classList.remove('drop'), { once: true });
      put(c); el.append(c.el); coins.push(c);
    }));
    if (round) { const b = div('fround', `${round + 1}/${COINS.rounds.length}`); el.append(b); b.addEventListener('animationend', () => b.remove()); }
    busy = 0.5; sfx('ui-coins', { vol: 0.3 });
  }
  const stackOf = (d) => coins.filter((c) => c.d === d).sort((a, b) => a.i - b.i);
  const runOf = (d) => { const s = stackOf(d), top = s[s.length - 1]; const r = []; for (let i = s.length - 1; i >= 0 && s[i].k === top.k; i--) r.push(s[i]); return r; };
  function lift(d, up) { if (d == null) return; for (const c of runOf(d)) { c.el.classList.toggle('up', up); put(c, up ? 0.045 : 0); } }
  function pick(d) { lift(sel, false); sel = d; lift(d, true); sfx('ui-tap', { vol: 0.5 }); buzz(6); }
  function no(d) { const e = dishes[d].el; e.classList.remove('no'); void e.offsetWidth; e.classList.add('no'); sfx('ui-error', { vol: 0.3 }); buzz(20); }
  function move(from, to) {
    const run = runOf(from), dst = stackOf(to), n = Math.min(run.length, COINS.cap - dst.length);
    lift(from, false);
    run.slice(0, n).forEach((c, j) => { c.d = to; c.i = dst.length + j; c.el.style.transitionDelay = `${j * 45}ms`; put(c); });
    st[to].push(...st[from].splice(st[from].length - n, n));
    moves++; sel = null; busy = 0.18 + n * 0.045;
    for (let j = 0; j < n; j++) setTimeout(() => sfx('coin-drop', { vol: 0.45 }), 200 + j * 45);
    const s = st[to];
    if (s.length === COINS.cap && s.every((k) => k === s[0])) { st[to] = []; busy = 1; setTimeout(() => roll(to), 380); }
  }
  // four alike: they roll up, and the roll flies into the till
  function roll(d) {
    const four = coins.filter((c) => c.d === d);
    for (const c of four) { c.el.classList.add('gone'); coins.splice(coins.indexOf(c), 1); setTimeout(() => c.el.remove(), 400); }
    const r = img('fix/roll', 'froll'), [x, y] = spot(d, 1);
    r.style.cssText = `left:${x * 100}%;top:${y * 100}%;width:${COINS.coin * 100}%`; el.append(r);
    sfx('pickup-bonus', { vol: 0.5 }); buzz(25); rolled += COINS.cap;
    setTimeout(() => { r.classList.add('fly'); r.style.left = `${COINS.till[0] * 100}%`; r.style.top = `${COINS.till[1] * 100}%`; }, 260);
    setTimeout(() => {
      r.remove(); puff(el, 'scrub/sparkle', COINS.till[0], COINS.till[1] + 0.03, 0.3, 'spin'); sfx('ui-coins', { vol: 0.45 });
      if (coins.length) { busy = 0; return; }
      if (round + 1 < COINS.rounds.length) { setTimeout(next, 250); return; }
      el.classList.add('cha'); sfx('ui-purchase', { vol: 0.7 }); setTimeout(() => { done = true; }, 700);
    }, 800);
  }
  function onDown(e) {
    if (!on || busy > 0) return;
    e.preventDefault();
    const [px, py] = at(stage, e, W, H);
    const d = dishes.map((q, i) => [i, Math.hypot((q.x * W - px) * 1.3, q.y * H - 0.07 * H - py)]).filter(([, r]) => r < W * 0.19).sort((a, b) => a[1] - b[1])[0]?.[0];
    if (d == null) { lift(sel, false); sel = null; return; }
    if (sel == null) { if (st[d].length) pick(d); else no(d); return; }
    if (sel === d) { lift(d, false); sel = null; sfx('ui-tap', { vol: 0.3 }); return; }
    const top = st[sel][st[sel].length - 1], to = st[d];
    if (to.length < COINS.cap && (!to.length || to[to.length - 1] === top)) move(sel, d);
    else if (to.length) pick(d); else no(d);
  }
  const h = { pointerdown: onDown };
  return { hint: 'Tap a stack, then a dish: four alike roll away', go: 'Sort!', won: 'Ka-ching!', setup,
    meter: { icon: 'fix/c3', text: () => `${moves}/${limit()}` },
    start() { on = true; listen(stage, true, h); }, stop() { on = false; if (stage) listen(stage, false, h); },
    tick(dt) { busy -= dt; },
    score, over: () => done, tally: () => `<b>${moves}</b> moves · the fewest: ${par}`,
    // (for the tests: the dishes of the best next move, as points on the page)
    peek: () => { if (busy > 0 || done) return null; const p = coinPar(st); if (!p.next) return null; const pt = (d) => client(stage, dishes[d].x, dishes[d].y - 0.05); return { from: pt(p.next[0]), to: pt(p.next[1]), f: p.next[0], sel }; } };
}

// (the puzzles with no clock count what they took against the fewest it could have taken: `spare` over it for three
// stars, for two; `cap` what the score can reach with three, two, one)
const tierCap = (over, spare) => (over <= spare[0] ? 1 : over <= spare[1] ? 0.8 : 0.55);

// ---------------------------------------------------------------- the photo
// Uncle Ferdi's photo of the opening day lies torn on his desk. Each piece is dragged into the frame where it belongs:
// near enough to its place it snaps in; dropped on another place in the frame it's a mistake and slides back. On the
// desk it stays where it was put. The tears are a grid of points shaken a little, each edge a jagged line the two
// pieces either side of it share.
const PHOTO = {
  cols: 3, rows: 4, frame: [0.5, 0.315, 0.6], mat: [0.1562, 0.1484, 0.8457, 0.8516], // (the frame: middle x, y and width, of the stage's; its mat, of the frame: tools/genart-mini.py measures it)
  snap: 0.5, desk: [0.12, 0.7, 0.88, 0.93], spare: [1, 4], // (a piece snaps in within this much of a cell; where the pieces lie, their middles; mistakes for three stars, for two)
};

export function photoGame({ sfx = () => {}, buzz = () => {} } = {}) {
  let stage, el, W, H, k, pic, on = false, drag = null, placed = 0, wrong = 0, done = false, z = 10;
  const list = [];
  let mx, my, mw, mh, cw, ch; // (the mat on the stage, px; a cell)

  async function setup(s) {
    stage = s;
    ({ el, W, H } = await scene(s, 'desk', 'photo', ['fix/frame', 'scrub/sparkle']));
    pic = await load(IMG('fix/photo'));
    k = Math.min(2, devicePixelRatio || 1);
    const [fx, fy, fw] = PHOTO.frame, fh = fw * W * 1.5 / H; // (the frame is 2:3)
    const frame = img('fix/frame', 'fframe'); frame.style.cssText = `left:${fx * 100}%;top:${fy * 100}%;width:${fw * 100}%`; el.append(frame);
    mx = (fx - fw / 2 + fw * PHOTO.mat[0]) * W; mw = fw * (PHOTO.mat[2] - PHOTO.mat[0]) * W;
    my = (fy - fh / 2 + fh * PHOTO.mat[1]) * H; mh = fh * (PHOTO.mat[3] - PHOTO.mat[1]) * H;
    cw = mw / PHOTO.cols; ch = mh / PHOTO.rows;
    // the tears: the points (the mat's edges stay straight), then each edge's jagged line
    const C = PHOTO.cols, R = PHOTO.rows, pt = [];
    for (let j = 0; j <= R; j++) for (let i = 0; i <= C; i++) pt.push([i * cw + (i > 0 && i < C ? rnd(-0.12, 0.12) * cw : 0), j * ch + (j > 0 && j < R ? rnd(-0.12, 0.12) * ch : 0)]);
    const P = (i, j) => pt[j * (C + 1) + i], edges = new Map();
    const edge = (a, b, inner) => { // (a → b, jagged when it's a tear)
      const key = `${a}|${b}`, back = `${b}|${a}`;
      if (edges.has(back)) return edges.get(back).slice().reverse();
      const [x0, y0] = a, [x1, y1] = b, n = inner ? 7 : 1, len = Math.hypot(x1 - x0, y1 - y0), nx = -(y1 - y0) / len, ny = (x1 - x0) / len, line = [a];
      for (let q = 1; q < n; q++) { const t = q / n, d = rnd(-0.05, 0.05) * Math.min(cw, ch); line.push([x0 + (x1 - x0) * t + nx * d, y0 + (y1 - y0) * t + ny * d]); }
      line.push(b); edges.set(key, line); return line;
    };
    for (let j = 0; j < R; j++) for (let i = 0; i < C; i++) {
      const poly = [...edge(P(i, j), P(i + 1, j), j > 0), ...edge(P(i + 1, j), P(i + 1, j + 1), i < C - 1).slice(1), ...edge(P(i + 1, j + 1), P(i, j + 1), j < R - 1).slice(1), ...edge(P(i, j + 1), P(i, j), i > 0).slice(1, -1)];
      const xs = poly.map((p) => p[0]), ys = poly.map((p) => p[1]), bx = Math.min(...xs) - 3, by = Math.min(...ys) - 3, bw = Math.max(...xs) + 3 - bx, bh = Math.max(...ys) + 3 - by;
      const cv = document.createElement('canvas'); cv.className = 'fpc'; cv.width = Math.ceil(bw * k); cv.height = Math.ceil(bh * k);
      cv.style.width = `${bw}px`; cv.style.height = `${bh}px`;
      const c = cv.getContext('2d'); c.scale(k, k); c.translate(-bx, -by);
      c.beginPath(); poly.forEach(([x, y], q) => (q ? c.lineTo(x, y) : c.moveTo(x, y))); c.closePath();
      c.save(); c.clip(); if (pic) c.drawImage(pic, 0, 0, mw, mh); else { c.fillStyle = '#c9a77a'; c.fill(); } c.restore();
      c.lineWidth = 1.6; c.strokeStyle = 'rgba(255, 248, 230, .9)'; c.stroke();
      const p = { cv, bw, bh, hx: mx + bx + bw / 2, hy: my + by + bh / 2, x: 0, y: 0, rot: 0, in: false }; // (h: its middle, in its place)
      el.append(cv); list.push(p);
    }
    // scattered over the desk, turned this way and that
    const spots = shuffle(list.map((_, q) => q));
    list.forEach((p, q) => {
      const col = spots[q] % 4, row = Math.floor(spots[q] / 4), [x0, y0, x1, y1] = PHOTO.desk;
      p.x = (x0 + (x1 - x0) * (col + 0.5 + rnd(-0.25, 0.25)) / 4) * W; p.y = (y0 + (y1 - y0) * (row + rnd(-0.2, 0.2)) / 2) * H; p.rot = rnd(-28, 28);
      p.rest = [p.x, p.y, p.rot]; put(p);
    });
  }
  function put(p, anim = false) {
    p.cv.classList.toggle('go', anim);
    p.cv.style.transform = `translate(${p.x - p.bw / 2}px, ${p.y - p.bh / 2}px) rotate(${p.rot}deg)`;
  }
  const hit = (x, y) => list.filter((p) => !p.in).sort((a, b) => +b.cv.style.zIndex - +a.cv.style.zIndex).find((p) => {
    const a = -p.rot * Math.PI / 180, dx = x - p.x, dy = y - p.y, ux = dx * Math.cos(a) - dy * Math.sin(a), uy = dx * Math.sin(a) + dy * Math.cos(a);
    return Math.abs(ux) < p.bw / 2 && Math.abs(uy) < p.bh / 2;
  });
  function onDown(e) {
    if (!on || drag || done) return;
    const [x, y] = at(stage, e, W, H), p = hit(x, y);
    if (!p) return;
    e.preventDefault(); stage.setPointerCapture?.(e.pointerId);
    drag = { id: e.pointerId, p, dx: p.x - x, dy: p.y - y };
    p.cv.style.zIndex = String(++z); p.cv.classList.add('held'); p.rot = 0; put(p, true);
    sfx('bag-rustle', { vol: 0.25 }); buzz(6);
  }
  function onMove(e) {
    if (!drag || e.pointerId !== drag.id) return;
    e.preventDefault();
    const [x, y] = at(stage, e, W, H), p = drag.p; p.x = x + drag.dx; p.y = y + drag.dy; put(p);
  }
  function onUp(e) {
    if (!drag || e.pointerId !== drag.id) return;
    const { p } = drag; drag = null; p.cv.classList.remove('held');
    if (Math.hypot(p.x - p.hx, p.y - p.hy) < PHOTO.snap * Math.min(cw, ch)) { // in its place
      p.in = true; p.x = p.hx; p.y = p.hy; p.cv.style.zIndex = '1'; p.cv.classList.add('in'); put(p, true); placed++;
      puff(el, 'scrub/sparkle', p.hx / W, p.hy / H, 0.22, 'spin'); sfx('pickup-bonus', { vol: 0.45 }); buzz(15);
      if (placed === list.length) { el.classList.add('whole'); sfx('ui-levelup', { vol: 0.4 }); setTimeout(() => { done = true; }, 900); }
    } else if (p.x > mx && p.x < mx + mw && p.y > my && p.y < my + mh) { // in the frame, but not its place
      wrong++; [p.x, p.y, p.rot] = p.rest; put(p, true);
      p.cv.classList.remove('no'); void p.cv.offsetWidth; p.cv.classList.add('no'); sfx('qte-bad', { vol: 0.4 }); buzz(30);
    } else { // somewhere on the desk: it stays there
      p.x = Math.max(p.bw / 3, Math.min(W - p.bw / 3, p.x)); p.y = Math.max(H * 0.5, Math.min(H - p.bh / 3, p.y)); p.rot = rnd(-8, 8); p.rest = [p.x, p.y, p.rot]; put(p, true);
      sfx('ui-tap', { vol: 0.3 });
    }
  }
  const score = () => (placed / list.length) * tierCap(wrong, PHOTO.spare);
  const h = { pointerdown: onDown, pointermove: onMove, pointerup: onUp, pointercancel: onUp };
  return { hint: 'Drag each piece into the frame where it belongs', go: 'Mend it!', won: 'Like new!', setup,
    meter: { icon: 'fix/frame', text: () => `${placed}/${list.length}` },
    start() { on = true; listen(stage, true, h); }, stop() { on = false; drag = null; if (stage) listen(stage, false, h); }, tick() {},
    score, over: () => done, tally: () => `<b>${placed}/${list.length}</b> pieces · ${wrong ? `${wrong} in the wrong place` : 'not one in the wrong place'}`,
    // (for the tests: a piece still out, where it is and where it goes, and the place of another piece)
    peek: () => { const p = list.find((q) => !q.in); if (!p || drag) return null; const o = list.find((q) => q !== p && !q.in) || p; return { from: client(stage, p.x / W, p.y / H), to: client(stage, p.hx / W, p.hy / H), wrong: client(stage, o.hx / W, o.hy / H) }; } };
}

// ---------------------------------------------------------------- the pipes
// The staff room's pipes are all twisted. A tap turns a tile a quarter round; when the pipes run from the tap on the
// left to the basin under the grid, the water flows. The way the water should go is laid first (a winding path); the
// other tiles are pieces that go nowhere. Two rounds, the second bigger.
const PIPES = {
  rounds: [{ cols: 4, rows: 5, len: [7, 9] }, { cols: 5, rows: 6, len: [11, 15] }], spare: [3, 10],
  box: [0.16, 0.04, 0.82, 0.7], // (the grid's box: left, top, width, height of the stage's; its cells are square)
  kinds: { straight: 10, elbow: 12, tee: 14, cross: 15 }, decoy: [['straight', 0.35], ['elbow', 0.4], ['tee', 0.2], ['cross', 0.05]], // (openings: N 1, E 2, S 4, W 8, as drawn)
};
const DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0]]; // (N E S W: the opening 1 << d)
const turn = (m, r) => { for (let i = 0; i < ((r % 4) + 4) % 4; i++) m = ((m << 1) | (m >> 3)) & 15; return m; };
// a winding way from the left of (0, r0) to the bottom of (c1, rows - 1), `len` cells long
function pipePath(C, R, [lo, hi]) {
  for (let t = 0; t < 400; t++) {
    const r0 = Math.floor(Math.random() * R), c1 = Math.floor(Math.random() * C), path = [[0, r0]], seen = new Set([`0,${r0}`]);
    let budget = 3000;
    const go = () => {
      const [x, y] = path[path.length - 1];
      if (x === c1 && y === R - 1) return path.length >= lo;
      if (path.length >= hi || --budget < 0) return false;
      for (const [dx, dy] of shuffle([...DIRS])) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= C || ny >= R || seen.has(`${nx},${ny}`)) continue;
        seen.add(`${nx},${ny}`); path.push([nx, ny]);
        if (go()) return true;
        path.pop(); seen.delete(`${nx},${ny}`);
      }
      return false;
    };
    if (go()) return path;
  }
  return null;
}
function pipeRound({ cols: C, rows: R, len }) {
  const path = pipePath(C, R, len), cells = [];
  const dirTo = (a, b) => DIRS.findIndex(([dx, dy]) => a[0] + dx === b[0] && a[1] + dy === b[1]);
  for (let y = 0; y < R; y++) for (let x = 0; x < C; x++) {
    const i = path.findIndex(([px, py]) => px === x && py === y);
    if (i < 0) { // a piece that goes nowhere
      let r = Math.random(), kind = 'straight'; for (const [kk, w] of PIPES.decoy) { if (r < w) { kind = kk; break; } r -= w; }
      cells.push({ x, y, kind, rot: Math.floor(Math.random() * 4), need: 0 });
      continue;
    }
    const a = i ? dirTo(path[i], path[i - 1]) : 3, b = i < path.length - 1 ? dirTo(path[i], path[i + 1]) : 2, need = (1 << a) | (1 << b);
    const kind = (a + 2) % 4 === b ? 'straight' : 'elbow', good = [0, 1, 2, 3].filter((r) => turn(PIPES.kinds[kind], r) === need);
    let rot; do { rot = Math.floor(Math.random() * 4); } while (good.includes(rot) && Math.random() < 0.85);
    cells.push({ x, y, kind, rot, need, good });
  }
  const par = cells.reduce((s, c) => s + (c.need ? Math.min(...c.good.map((g) => (g - c.rot + 4) % 4)) : 0), 0);
  return { C, R, cells, path, par, r0: path[0][1], c1: path[path.length - 1][0] };
}

export function pipesGame({ sfx = () => {}, buzz = () => {} } = {}) {
  let stage, el, W, H, on = false, round = -1, rounds = [], cur, cell, gx, gy, taps = 0, fixed = 0, busy = 0, done = false, valve, sink;
  const par = () => rounds.reduce((s, r) => s + r.par, 0);
  const total = () => rounds.reduce((s, r) => s + r.path.length, 0);

  async function setup(s) {
    stage = s;
    ({ el, W, H } = await scene(s, 'tilewall', 'pipes', ['fix/p-straight', 'fix/p-elbow', 'fix/p-tee', 'fix/p-cross', 'fix/valve', 'fix/sink', 'fix/splash']));
    rounds = PIPES.rounds.map(pipeRound);
    valve = img('fix/valve', 'fvalve'); sink = img('fix/sink', 'fsink'); el.append(valve, sink);
    next();
  }
  function next() {
    round++; cur = rounds[round];
    for (const c of el.querySelectorAll('.ft')) c.remove();
    const [bx, by, bw, bh] = PIPES.box;
    cell = Math.min(bw * W / cur.C, bh * H / cur.R); gx = bx * W + (bw * W - cell * cur.C) / 2; gy = by * H;
    cur.cells.forEach((c, i) => {
      c.el = div('ft', `<img src="${IMG(`fix/p-${c.kind}`)}" alt="" draggable="false">`); c.turns = c.rot;
      c.el.style.cssText = `left:${gx + c.x * cell}px;top:${gy + c.y * cell}px;width:${cell}px;height:${cell}px;animation-delay:${i * 18}ms`;
      c.el.firstChild.style.transform = `rotate(${c.rot * 90}deg)`; el.append(c.el);
    });
    valve.style.cssText = `left:${gx - cell * 0.8}px;top:${gy + (cur.r0 + 0.5) * cell}px;width:${cell * 0.85}px`;
    sink.style.cssText = `left:${gx + (cur.c1 + 0.5) * cell}px;top:${gy + cur.R * cell + cell * 0.02}px;width:${cell * 1.35}px`;
    sink.classList.remove('full');
    if (round) { const b = div('fround', `${round + 1}/${rounds.length}`); el.append(b); b.addEventListener('animationend', () => b.remove()); }
    flow(); busy = 0.4;
  }
  const at2 = (x, y) => cur.cells[y * cur.C + x];
  // where the water gets from the tap: the cells it reaches, in order (and whether it gets to the basin)
  function flow() {
    const first = at2(0, cur.r0), seen = new Set(), order = [];
    if (turn(PIPES.kinds[first.kind], first.rot) & 8) { seen.add(first); order.push(first); }
    for (let q = 0; q < order.length; q++) {
      const c = order[q], m = turn(PIPES.kinds[c.kind], c.rot);
      DIRS.forEach(([dx, dy], d) => {
        if (!(m & (1 << d))) return;
        const n = at2(c.x + dx, c.y + dy);
        if (!n || n.x !== c.x + dx || c.x + dx < 0 || c.x + dx >= cur.C || seen.has(n)) return;
        if (turn(PIPES.kinds[n.kind], n.rot) & (1 << ((d + 2) % 4))) { seen.add(n); order.push(n); }
      });
    }
    for (const c of cur.cells) c.el.classList.toggle('wet', seen.has(c));
    const end = at2(cur.c1, cur.R - 1);
    return { order, out: seen.has(end) && !!(turn(PIPES.kinds[end.kind], end.rot) & 4) };
  }
  function onDown(e) {
    if (!on || busy > 0 || done) return;
    e.preventDefault();
    const [x, y] = at(stage, e, W, H), cx = Math.floor((x - gx) / cell), cy = Math.floor((y - gy) / cell);
    if (cx < 0 || cy < 0 || cx >= cur.C || cy >= cur.R) return;
    const c = at2(cx, cy); c.rot = (c.rot + 1) % 4; c.turns++; taps++;
    c.el.firstChild.style.transform = `rotate(${c.turns * 90}deg)`; sfx('ui-tap', { vol: 0.45 }); buzz(6);
    const f = flow();
    if (!f.out) return;
    // the water runs: tile after tile, into the basin
    busy = 9; fixed += cur.path.length;
    f.order.forEach((c2, q) => setTimeout(() => { c2.el.classList.add('flow'); if (q % 3 === 0) sfx('splash', { vol: 0.18 }); }, 200 + q * 70));
    setTimeout(() => {
      sink.classList.add('full'); puff(el, 'fix/splash', (gx + (cur.c1 + 0.5) * cell) / W, (gy + cur.R * cell + cell * 0.3) / H, 0.3);
      sfx('pickup-bonus', { vol: 0.5 }); buzz(25);
      setTimeout(() => { if (round + 1 < rounds.length) { next(); } else done = true; }, 900);
    }, 300 + f.order.length * 70);
  }
  const score = () => (fixed / total()) * tierCap(taps - par(), PIPES.spare);
  const h = { pointerdown: onDown };
  return { hint: 'Tap a pipe to turn it: get the water to the basin', go: 'Turn!', won: 'Water\'s on!', setup,
    meter: { icon: 'fix/valve', text: () => `${taps}/${par() + PIPES.spare[taps - par() <= PIPES.spare[0] ? 0 : 1]}` },
    start() { on = true; listen(stage, true, h); }, stop() { on = false; if (stage) listen(stage, false, h); },
    tick(dt) { busy -= dt; }, score, over: () => done, tally: () => `<b>${taps}</b> turns · the fewest: ${par()}`,
    // (for the tests: a tile on the way the water should go that isn't turned right yet)
    peek: () => { if (busy > 0 || done) return null; const c = cur.cells.find((q) => q.need && !q.good.includes(q.rot)); return c ? client(stage, (gx + (c.x + 0.5) * cell) / W, (gy + (c.y + 0.5) * cell) / H) : null; } };
}

// ---------------------------------------------------------------- the lawn
// The terrace's lawn is a jungle. The mower goes from patch to patch after the finger, and every patch must be
// mowed once, in one go, round the pots and the gnome: a patch it has been over can't be crossed again, so a dead end
// means backing up (dragging back over the way it came, or a tap on a patch it mowed: it backs up to there). The
// pots stand where a way through every other patch was found first.
const MOW = { cols: 5, rows: 7, things: [4, 6], spare: [2, 8], art: ['fpot', 'gnome', 'birdbath', 'sprinkler', 'wcan', 'stone'] };
// the pots first, then a way through every other patch from a patch of the bottom row (a search that tries the
// patches with the fewest ways on first). A grid is a chessboard: a way through every patch only exists when the two
// colours left free are as many (or the start's one more), so other pots aren't even tried. (None found: no pots, and
// the way snakes up from the corner.)
function mowLevel(C, R, n) {
  const N = C * R, nb = (i) => DIRS.map(([dx, dy]) => [i % C + dx, Math.floor(i / C) + dy]).filter(([x, y]) => x >= 0 && y >= 0 && x < C && y < R).map(([x, y]) => y * C + x);
  const colour = (i) => (i % C + Math.floor(i / C)) % 2;
  for (let t = 0; t < 400; t++) {
    const start = (R - 1) * C + Math.floor(Math.random() * C), free = new Array(N).fill(true);
    for (const i of shuffle([...Array(N).keys()].filter((q) => q !== start && !nb(start).includes(q))).slice(0, n)) free[i] = false;
    const mine = free.filter((f, i) => f && colour(i) === colour(start)).length, other = free.filter((f, i) => f && colour(i) !== colour(start)).length;
    if (mine !== other && mine !== other + 1) continue;
    const need = mine + other, seen = new Array(N).fill(false), path = [start]; seen[start] = true;
    let budget = 4000;
    const exits = (q) => nb(q).filter((j) => free[j] && !seen[j]).length;
    const go = (i) => {
      if (path.length === need) return true;
      if (--budget < 0) return false;
      for (const j of shuffle(nb(i).filter((q) => free[q] && !seen[q])).sort((x, y) => exits(x) - exits(y))) { seen[j] = true; path.push(j); if (go(j)) return true; path.pop(); seen[j] = false; }
      return false;
    };
    if (go(start)) return { free, way: path };
  }
  const way = []; for (let y = R - 1; y >= 0; y--) for (let x = 0; x < C; x++) way.push(y * C + ((R - 1 - y) % 2 ? C - 1 - x : x));
  return { free: new Array(N).fill(true), way };
}

export function mowGame({ sfx = () => {}, buzz = () => {}, loop = () => null } = {}) {
  let stage, el, W, H, k, wild, wildPic, mower, cell, gy, lvl, on = false, down = null, backs = 0, done = false, engine = null, rev = 0;
  const path = [], things = [];
  const C = MOW.cols, R = MOW.rows;

  async function setup(s) {
    stage = s;
    ({ el, W, H } = await scene(s, 'lawn', 'mow', ['fix/mower', 'fix/clippings', ...MOW.art.map((a) => `fix/${a}`)]));
    wildPic = await load(IMG('fix/lawn-wild'));
    k = Math.min(2, devicePixelRatio || 1); cell = W / C; gy = (H - cell * R) / 2;
    wild = document.createElement('canvas'); wild.width = Math.round(W * k); wild.height = Math.round(H * k); el.append(wild);
    const c = wild.getContext('2d'); c.scale(k, k); if (wildPic) c.drawImage(wildPic, 0, 0, W, H); else { c.fillStyle = '#4f8a2a'; c.fillRect(0, 0, W, H); }
    lvl = mowLevel(C, R, MOW.things[0] + Math.floor(Math.random() * (MOW.things[1] - MOW.things[0] + 1)));
    const start = lvl.way[0];
    const art = shuffle([...MOW.art]);
    lvl.free.forEach((f, i) => { if (f) return; const t = img(`fix/${art[things.length % art.length]}`, 'fthing'); const [x, y] = mid(i); t.style.cssText = `left:${x}px;top:${y}px;width:${cell * 0.86}px;--r:${rnd(-12, 12)}deg`; el.append(t); things.push(t); });
    mower = img('fix/mower', 'fmower'); mower.style.width = `${cell * 0.62}px`; el.append(mower);
    path.push(start); mow(start, null); place(0);
  }
  const mid = (i) => [(i % C + 0.5) * cell, gy + (Math.floor(i / C) + 0.5) * cell];
  const cellAt = (x, y) => { const cx = Math.floor(x / cell), cy = Math.floor((y - gy) / cell); return cx >= 0 && cy >= 0 && cx < C && cy < R ? cy * C + cx : -1; };
  const near = (a, b) => Math.abs(a % C - b % C) + Math.abs(Math.floor(a / C) - Math.floor(b / C)) === 1;
  // a patch mowed (the long grass over it gone, a strip from the patch it came from), or grown back when backing up
  function mow(i, from) {
    const c = wild.getContext('2d'), [x, y] = mid(i);
    c.save(); c.globalCompositeOperation = 'destination-out'; c.fillRect(x - cell * 0.47, y - cell * 0.47, cell * 0.94, cell * 0.94);
    if (from != null) { const [fx, fy] = mid(from); c.fillRect(Math.min(x, fx) - cell * 0.47, Math.min(y, fy) - cell * 0.47, Math.abs(x - fx) + cell * 0.94, Math.abs(y - fy) + cell * 0.94); }
    c.restore();
  }
  function grow(i) {
    const c = wild.getContext('2d'), [x, y] = mid(i), a = path[path.length - 1], [ax, ay] = mid(a);
    c.save(); c.beginPath(); c.rect(x - cell * 0.5, y - cell * 0.5, cell, cell);
    c.rect(Math.min(x, ax) - cell * 0.47, Math.min(y, ay) - cell * 0.47, Math.abs(x - ax) + cell * 0.94, Math.abs(y - ay) + cell * 0.94); c.clip();
    if (wildPic) c.drawImage(wildPic, 0, 0, W, H); c.restore();
    mow(a, null); // (the patch it backed up to stays mowed)
  }
  function place(dir) {
    const [x, y] = mid(path[path.length - 1]);
    mower.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%) rotate(${dir}deg)`;
  }
  const dirOf = (a, b) => { const dx = b % C - a % C, dy = Math.floor(b / C) - Math.floor(a / C); return dx > 0 ? 90 : dx < 0 ? -90 : dy > 0 ? 180 : 0; };
  function step(i) {
    const a = path[path.length - 1];
    path.push(i); mow(i, a); place(dirOf(a, i)); rev = 0.35;
    puff(el, 'fix/clippings', mid(i)[0] / W, mid(i)[1] / H, 0.24); if (path.length % 2) sfx('bag-rustle', { vol: 0.15 });
    if (path.length === lvl.way.length) { done = true; sfx('pickup-bonus', { vol: 0.5 }); buzz(30); return; }
    if (!lvl.free.some((f, q) => f && near(q, i) && !path.includes(q))) { el.classList.remove('stuck'); void el.offsetWidth; el.classList.add('stuck'); sfx('qte-bad', { vol: 0.35 }); buzz(25); }
  }
  function back(to) { // (backing up to the patch `to` of the way it came)
    while (path.length > 1 && path[path.length - 1] !== to) { const i = path.pop(); grow(i); backs++; }
    place(path.length > 1 ? dirOf(path[path.length - 2], path[path.length - 1]) : 0); sfx('ui-back', { vol: 0.4 }); buzz(10);
  }
  function go(i) {
    if (i < 0 || done) return;
    const head = path[path.length - 1];
    if (i === head) return;
    const j = path.indexOf(i);
    if (j >= 0) { back(i); return; }
    if (!lvl.free[i]) return;
    // (a straight run of fresh patches, as far as the finger went)
    const hx = head % C, hy = Math.floor(head / C), ix = i % C, iy = Math.floor(i / C);
    if (hx !== ix && hy !== iy) return;
    const sx = Math.sign(ix - hx), sy = Math.sign(iy - hy), run = [];
    for (let x = hx + sx, y = hy + sy; ; x += sx, y += sy) { const q = y * C + x; if (!lvl.free[q] || path.includes(q)) return; run.push(q); if (q === i) break; }
    for (const q of run) step(q);
  }
  function onDown(e) {
    if (!on || down) return;
    e.preventDefault(); stage.setPointerCapture?.(e.pointerId);
    down = e.pointerId; const [x, y] = at(stage, e, W, H); go(cellAt(x, y));
  }
  function onMove(e) { if (down === e.pointerId) { e.preventDefault(); const [x, y] = at(stage, e, W, H); go(cellAt(x, y)); } }
  function onUp(e) { if (down === e.pointerId) down = null; }
  const score = () => ((path.length) / lvl.way.length) * tierCap(backs, MOW.spare);
  const h = { pointerdown: onDown, pointermove: onMove, pointerup: onUp, pointercancel: onUp };
  return { hint: 'Mow every patch once · stuck? drag back', go: 'Mow!', won: 'Neat as a pin!', setup,
    meter: { icon: 'fix/mower', text: () => (lvl ? `${path.length}/${lvl.way.length}` : '') },
    start() { on = true; listen(stage, true, h); engine = loop('engine-moped', { vol: 0.08, rate: 1.5 }); },
    stop() { on = false; down = null; engine?.stop(); engine = null; if (stage) listen(stage, false, h); },
    tick(dt) { rev = Math.max(0, rev - dt); engine?.set({ vol: rev > 0 ? 0.3 : 0.08, rate: rev > 0 ? 1.75 : 1.5 }); },
    score, over: () => done, tally: () => `<b>${path.length}/${lvl.way.length}</b> patches · ${backs ? `backed up ${backs}×` : 'never backed up'}`,
    // (for the tests: the next patch of the way that was found first, while the mower is on it; where it started)
    peek: () => { const n = path.length; if (!lvl || done || path.some((q, i) => q !== lvl.way[i])) return null; const pt = (i) => client(stage, mid(i)[0] / W, mid(i)[1] / H); return { to: pt(lvl.way[n]), head: pt(path[n - 1]), first: pt(lvl.way[0]), n }; } };
}

// ---------------------------------------------------------------- the yard
// The courier bay is blocked with junk: cars, a van, crates, tyres, drums, each only able to slide the way it lies.
// The scooter must get out of the open door on the right. A drag slides a thing as far as the finger goes (or till
// it hits something); the fewest moves are found by a search over where everything can be. Two rounds.
const PARK = {
  n: 6, row: 2, rounds: [{ blocks: 5, par: [3, 5] }, { blocks: 9, par: [6, 10] }], spare: [3, 10],
  box: [0.04, 0.2, 0.84], art: { 2: ['car', 'crates', 'tyres'], 3: ['van', 'drums'] }, // (the grid: left, top, width of the stage's)
};
// blocks: [x, y, length, across] (the first is the scooter, across on PARK.row); → the fewest moves to get it to the
// right edge (null: never) and the first of them [block, to x or y]
export function parkPar(blocks) {
  const N = PARK.n, key = (b) => b.map((q) => q[0] * 10 + q[1]).join(',');
  const grid = (b) => { const g = new Array(N * N).fill(-1); b.forEach(([x, y, l, h], k) => { for (let i = 0; i < l; i++) g[(y + (h ? 0 : i)) * N + x + (h ? i : 0)] = k; }); return g; };
  const seen = new Set([key(blocks)]); let front = [[blocks, null]], d = 0;
  while (front.length) {
    const next = [];
    for (const [b, f] of front) {
      if (b[0][0] === N - b[0][2]) return { par: d, next: f };
      const g = grid(b);
      b.forEach(([x, y, l, h], k) => {
        for (const dir of [-1, 1]) for (let s = 1; ; s++) {
          const nx = h ? x + dir * s : x, ny = h ? y : y + dir * s, cx = h ? (dir > 0 ? nx + l - 1 : nx) : nx, cy = h ? ny : (dir > 0 ? ny + l - 1 : ny);
          if (cx < 0 || cy < 0 || cx >= N || cy >= N || g[cy * N + cx] !== -1) break;
          const nb = b.map((q) => q.slice()); nb[k][0] = nx; nb[k][1] = ny;
          const kk = key(nb); if (!seen.has(kk)) { seen.add(kk); next.push([nb, f || [k, h ? nx : ny]]); }
        }
      });
    }
    front = next; d++;
  }
  return { par: null, next: null };
}
function parkRound({ blocks: n, par: [lo, hi] }) {
  const N = PARK.n; let best = null;
  for (let t = 0; t < 3000; t++) {
    const g = new Array(N * N).fill(-1), b = [[Math.floor(Math.random() * 3), PARK.row, 2, true]];
    g[PARK.row * N + b[0][0]] = g[PARK.row * N + b[0][0] + 1] = 0;
    for (let fail = 0; b.length < n && fail < 60;) {
      const h = Math.random() < 0.5, l = Math.random() < 0.3 ? 3 : 2, x = Math.floor(Math.random() * (h ? N + 1 - l : N)), y = Math.floor(Math.random() * (h ? N : N + 1 - l));
      const cells = [...Array(l)].map((_, i) => (y + (h ? 0 : i)) * N + x + (h ? i : 0));
      if ((h && y === PARK.row) || cells.some((c) => g[c] !== -1)) { fail++; continue; } // (nothing else lies along the scooter's row)
      cells.forEach((c) => { g[c] = b.length; }); b.push([x, y, l, h]);
    }
    const p = parkPar(b);
    if (p.par != null && p.par >= lo && p.par <= hi) return { blocks: b, par: p.par };
    if (p.par != null && p.par > 0 && (!best || p.par > best.par)) best = { blocks: b, par: p.par };
  }
  return best;
}

export function parkGame({ sfx = () => {}, buzz = () => {} } = {}) {
  let stage, el, W, H, on = false, round = -1, rounds = [], cur, cell, gx, gy, moves = 0, out = 0, busy = 0, done = false, drag = null, door;
  const list = [];
  const par = () => rounds.reduce((s, r) => s + r.par, 0);

  async function setup(s) {
    stage = s;
    ({ el, W, H } = await scene(s, 'floor', 'park', ['fix/scooter', 'fix/car', 'fix/van', 'fix/crates', 'fix/tyres', 'fix/drums', 'up', 'scrub/sparkle']));
    rounds = PARK.rounds.map(parkRound);
    const [bx, by, bw] = PARK.box; cell = bw * W / PARK.n; gx = bx * W; gy = by * H;
    const yard = div('fyard'); yard.style.cssText = `left:${gx}px;top:${gy}px;width:${cell * PARK.n}px;height:${cell * PARK.n}px`; el.append(yard);
    door = img('up', 'fdoor'); door.style.cssText = `left:${gx + cell * PARK.n + cell * 0.08}px;top:${gy + (PARK.row + 0.5) * cell}px;width:${cell * 0.62}px`; el.append(door);
    next();
  }
  function next() {
    round++; cur = rounds[round].blocks.map((q) => q.slice());
    for (const b of list.splice(0)) b.el.remove();
    cur.forEach(([x, y, l, h], i) => {
      const name = i ? shuffle([...PARK.art[l]])[0] : 'scooter', b = { i, el: div(`fblk ${i ? '' : 'me'} ${h ? '' : 'up'}`, `<img src="${IMG(`fix/${name}`)}" alt="" draggable="false">`) };
      b.el.style.width = `${(h ? l : 1) * cell}px`; b.el.style.height = `${(h ? 1 : l) * cell}px`; b.el.style.animationDelay = `${i * 50}ms`;
      const im = b.el.firstChild; im.style.width = `${l * cell}px`; im.style.height = `${cell}px`;
      el.append(b.el); list.push(b); put(b);
    });
    if (round) { const t = div('fround', `${round + 1}/${rounds.length}`); el.append(t); t.addEventListener('animationend', () => t.remove()); }
    busy = 0.4;
  }
  function put(b, off = 0) {
    const [x, y, , h] = cur[b.i];
    b.el.style.transform = `translate(${gx + (x + (h ? off : 0)) * cell}px, ${gy + (y + (h ? 0 : off)) * cell}px)`;
  }
  function room(i) { // how far block i can slide back and forth
    const N = PARK.n, g = new Array(N * N).fill(-1);
    cur.forEach(([x, y, l, h], k) => { for (let q = 0; q < l; q++) g[(y + (h ? 0 : q)) * N + x + (h ? q : 0)] = k; });
    const [x, y, l, h] = cur[i]; let lo = 0, hi = 0;
    for (;;) { const cx = h ? x + lo - 1 : x, cy = h ? y : y + lo - 1; if (cx < 0 || cy < 0 || g[cy * N + cx] !== -1) break; lo--; }
    for (;;) { const cx = h ? x + l + hi : x, cy = h ? y : y + l + hi; if (cx >= N || cy >= N || g[cy * N + cx] !== -1) break; hi++; }
    return [lo, hi];
  }
  function onDown(e) {
    if (!on || busy > 0 || done || drag) return;
    const [px, py] = at(stage, e, W, H), cx = (px - gx) / cell, cy = (py - gy) / cell;
    const i = cur.findIndex(([x, y, l, h]) => cx >= x && cy >= y && cx < x + (h ? l : 1) && cy < y + (h ? 1 : l));
    if (i < 0) return;
    e.preventDefault(); stage.setPointerCapture?.(e.pointerId);
    drag = { id: e.pointerId, i, px, py, room: room(i), off: 0 }; list[i].el.classList.add('held'); sfx('ui-tap', { vol: 0.4 }); buzz(5);
  }
  function onMove(e) {
    if (!drag || e.pointerId !== drag.id) return;
    e.preventDefault();
    const [px, py] = at(stage, e, W, H), h = cur[drag.i][3], d = (h ? px - drag.px : py - drag.py) / cell;
    const off = Math.max(drag.room[0], Math.min(drag.room[1], d));
    if ((off === drag.room[0] || off === drag.room[1]) && Math.abs(off - drag.off) > 0.05 && off !== 0) buzz(4);
    drag.off = off; put(list[drag.i], off);
  }
  function onUp(e) {
    if (!drag || e.pointerId !== drag.id) return;
    const { i, off } = drag, b = list[i], s = Math.round(off); drag = null; b.el.classList.remove('held');
    if (s) { if (cur[i][3]) cur[i][0] += s; else cur[i][1] += s; moves++; sfx('land', { vol: 0.25 }); }
    put(b);
    if (cur[0][0] !== PARK.n - 2) return;
    // the scooter is at the door: off it goes
    busy = 9; out++; b.el.classList.add('away'); sfx('horn-scooter', { vol: 0.4 }); buzz(30);
    setTimeout(() => { b.el.style.transform = `translate(${gx + (PARK.n + 1.5) * cell}px, ${gy + PARK.row * cell}px)`; puff(el, 'scrub/sparkle', (gx + PARK.n * cell) / W, (gy + (PARK.row + 0.5) * cell) / H, 0.3, 'spin'); }, 120);
    setTimeout(() => { if (round + 1 < rounds.length) next(); else done = true; }, 1100);
  }
  const score = () => (out / rounds.length) * tierCap(moves - par(), PARK.spare);
  const h = { pointerdown: onDown, pointermove: onMove, pointerup: onUp, pointercancel: onUp };
  return { hint: 'Slide the junk: get the scooter out', go: 'Slide!', won: 'Off it goes!', setup,
    meter: { icon: 'fix/scooter', text: () => `${moves}/${par() + PARK.spare[moves - par() <= PARK.spare[0] ? 0 : 1]}` },
    start() { on = true; listen(stage, true, h); }, stop() { on = false; drag = null; if (stage) listen(stage, false, h); },
    tick(dt) { busy -= dt; }, score, over: () => done, tally: () => `<b>${moves}</b> moves · the fewest: ${par()}`,
    // (for the tests: the best next slide, from the middle of the thing to where it goes)
    peek: () => {
      if (busy > 0 || done || drag) return null;
      const p = parkPar(cur); if (!p.next) return null;
      const [i, to] = p.next, [x, y, l, h] = cur[i], m = (bx2, by2) => client(stage, (gx + bx2 * cell) / W, (gy + by2 * cell) / H);
      return { from: m(x + (h ? l / 2 : 0.5), y + (h ? 0.5 : l / 2)), to: m((h ? to : x) + (h ? l / 2 : 0.5), (h ? y : to) + (h ? 0.5 : l / 2)) };
    } };
}

export const GAMES = { wash: washGame, coins: coinsGame, photo: photoGame, pipes: pipesGame, mow: mowGame, park: parkGame };

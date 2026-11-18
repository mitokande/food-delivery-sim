// Ferdi's (idle4.html): the repairs by hand. A room in ruins is cleared out in a mini game before the builders are paid
// to come, one game to a room, all played in mini.js's frame:
// - wash (the entrance): the front washed with a pressure washer, the grime, the graffiti and the old posters off it
//   (no clock: a tank of water),
// - coins (the cashier): the till's spilled coins sorted into stacks of one kind, in as few moves as can be (no clock),
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

export const GAMES = { wash: washGame, coins: coinsGame, paint: paintGame, leaks: leaksGame, weeds: weedsGame, bolts: boltsGame };

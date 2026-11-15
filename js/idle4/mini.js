// Ferdi's (idle4.html): the mini games. A frame they share (the count-in, the clock running down, the bar that fills
// with a star at each tier, the end) and the games played in it. The first: scrubbing the kitchen before the health
// inspector looks (a painted surface under a film of grime and a few stains; rubbing wipes them away). What a result is
// worth is sim.js's business (SCRUB); the window round the frame, and the card with the result, are ui.js's.
// The art is in assets/ui4/scrub.

const IMG = (n) => `assets/ui4/scrub/${n}.webp`;
const load = (src) => new Promise((res) => { const im = new Image(); im.onload = () => res(im); im.onerror = () => res(null); im.src = src; });
const rnd = (a, b) => a + Math.random() * (b - a);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// The frame. Builds itself in `host` and plays `game` for `dur` seconds. `done` resolves with the score (0..1) when
// the time is up or the game says it's over, or with null when it's left before it began; leave() ends it now.
// A game: { hint, go, setup(stage) (a promise), start(), tick(dt), score(), over(), stop() }.
export function play(host, game, { dur, tiers, sfx = () => {}, buzz = () => {} }) {
  host.innerHTML = `<div class="mini">
    <div class="mtop">
      <span class="mclock"><img src="assets/ui4/stopwatch.webp" alt="" draggable="false"><b></b></span>
      <span class="mbar"><u></u>${tiers.map((t) => `<i style="left:${t * 100}%"><img src="assets/ui4/star.webp" alt="" draggable="false"></i>`).join('')}</span>
    </div>
    <div class="mstage"><b class="mcount" hidden></b></div>
    <p class="mhint">${game.hint}</p>
  </div>`;
  const el = host.firstElementChild, stage = el.querySelector('.mstage'), count = el.querySelector('.mcount');
  const clock = el.querySelector('.mclock b'), fill = el.querySelector('.mbar u'), stars = [...el.querySelectorAll('.mbar i')];
  let state = 'setup', left = dur, last = 0, lit = 0, raf = 0, finish;
  const done = new Promise((r) => { finish = r; });
  const say = (t) => { count.hidden = !t; count.textContent = t || ''; if (t) { count.style.animation = 'none'; void count.offsetWidth; count.style.animation = ''; } };
  const show = () => {
    const s = game.score(), n = tiers.filter((t) => s >= t).length;
    clock.textContent = String(Math.ceil(left)); el.classList.toggle('hurry', left <= 3);
    fill.style.width = `${Math.round(s * 100)}%`;
    if (n > lit) { sfx('qte-good', { vol: 0.5 }); buzz(15); }
    lit = n; stars.forEach((x, i) => x.classList.toggle('on', i < n));
  };
  async function end(why) {
    if (state !== 'play') return;
    state = 'end'; cancelAnimationFrame(raf); game.stop(); show();
    say(why === 'over' ? game.won || 'Done!' : why === 'time' ? 'Time!' : '');
    if (why === 'over') { el.classList.add('won'); sfx('ui-levelup', { vol: 0.7 }); buzz(40); } else if (why === 'time') sfx('order-complete', { vol: 0.5 });
    if (why !== 'left') await wait(why === 'over' ? 1100 : 800);
    finish(game.score());
  }
  function frame(now) {
    const dt = Math.min(0.1, (now - last) / 1000); last = now;
    const was = Math.ceil(left);
    left = Math.max(0, left - dt); game.tick(dt); show();
    if (left <= 3 && Math.ceil(left) < was && left > 0) sfx('countdown-tick', { vol: 0.5 });
    if (game.over()) end('over'); else if (left <= 0) end('time'); else raf = requestAnimationFrame(frame);
  }
  (async () => {
    clock.textContent = String(dur);
    await game.setup(stage);
    if (state !== 'setup') return;
    state = 'count'; say('Ready?'); await wait(800);
    if (state !== 'count') return;
    say(game.go || 'Go!'); sfx('hop', { vol: 0.5 }); setTimeout(() => { if (state === 'play') say(''); }, 600);
    state = 'play'; game.start(); last = performance.now(); raf = requestAnimationFrame(frame);
  })();
  return { done, leave() { if (state === 'play') end('left'); else if (state !== 'end') { state = 'end'; game.stop(); finish(null); } } };
}

// ---------------------------------------------------------------- scrubbing the kitchen
// Two layers over the surface: a film of grime (one pass of the sponge takes it) and stains (they take three or four).
// What's left of them is read from a small copy every now and then; a stain nearly gone pops with a sparkle.
export const SURFACES = ['counter', 'grill', 'floor', 'tiles'];
const STAINS = 12, FILM_W = 0.25; // (d1…d12; the film's share of the score)
const BRUSH = { r: 0.12, film: 0.5, stain: 0.2, pop: 0.16 }; // (radius: of the stage's width; how much a dab takes; a stain pops below this)

export function scrubGame({ surface = SURFACES[Math.floor(Math.random() * SURFACES.length)], stains = 8, sfx = () => {}, buzz = () => {} } = {}) {
  let stage, W, H, k, film, stain, fx, probe, brush, sponge, sparkle;
  let list = [], film0 = 1, filmNow = 1, clean = 0, probeT = 0, rustleT = 0, on = false, down = null;
  const bubbles = [], sparks = [];
  const layer = (cls) => { const c = document.createElement('canvas'); c.className = cls; c.width = Math.round(W * k); c.height = Math.round(H * k); stage.append(c); return c; };

  async function setup(el) {
    stage = el;
    const names = [...Array(STAINS)].map((_, i) => `d${i + 1}`).filter((n) => n !== 'd9' || surface === 'floor').sort(() => Math.random() - 0.5).slice(0, stains);
    if (surface === 'floor' && !names.includes('d9')) names[0] = 'd9'; // (a muddy shoe print: on the floor only, and always)
    const [bg, sp, ...ims] = await Promise.all([load(IMG(surface)), load(IMG('sparkle')), ...names.map((n) => load(IMG(n)))]);
    sparkle = sp;
    W = stage.clientWidth; H = stage.clientHeight; k = Math.min(2, devicePixelRatio || 1); // (its laid-out size: the window may still be growing in)
    if (bg) { bg.className = 'msurf'; bg.alt = ''; bg.draggable = false; stage.prepend(bg); }
    film = layer('mfilm'); stain = layer('mstain'); fx = layer('mfx');
    sponge = document.createElement('img'); sponge.className = 'msponge'; sponge.src = IMG('sponge'); sponge.alt = ''; sponge.draggable = false; stage.append(sponge);
    // the film: a dull brown wash, blotches, specks
    let c = film.getContext('2d'); c.scale(k, k);
    c.fillStyle = 'rgba(98, 74, 42, .34)'; c.fillRect(0, 0, W, H);
    for (let i = 0; i < 46; i++) {
      const x = rnd(0, W), y = rnd(0, H), rr = W * rnd(0.12, 0.3), g = c.createRadialGradient(x, y, 0, x, y, rr);
      const col = ['92, 64, 30', '72, 82, 40', '58, 48, 40'][i % 3];
      g.addColorStop(0, `rgba(${col}, ${rnd(0.12, 0.28)})`); g.addColorStop(1, `rgba(${col}, 0)`);
      c.fillStyle = g; c.fillRect(x - rr, y - rr, rr * 2, rr * 2);
    }
    c.fillStyle = 'rgba(40, 30, 20, .4)';
    for (let i = 0; i < 160; i++) { c.beginPath(); c.arc(rnd(0, W), rnd(0, H), rnd(0.6, 2.4), 0, 7); c.fill(); }
    // the stains: apart from each other, each turned its own way
    c = stain.getContext('2d'); c.scale(k, k);
    ims.forEach((im) => {
      if (!im) return;
      let x, y, n = 0;
      do { x = rnd(0.16, 0.84) * W; y = rnd(0.12, 0.88) * H; } while (n++ < 40 && list.some((s) => Math.hypot(s.x - x, s.y - y) < W * 0.27));
      const w = W * rnd(0.3, 0.4), s = { im, x, y, w, h: w * im.height / im.width, rot: rnd(-Math.PI, Math.PI), a0: 1, a: 1, gone: false };
      list.push(s); stamp(c, s);
    });
    // the sponge's dab: soft at the edge
    brush = document.createElement('canvas'); brush.width = brush.height = 64;
    const b = brush.getContext('2d'), g = b.createRadialGradient(32, 32, 6, 32, 32, 32);
    g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(0.7, 'rgba(0,0,0,.7)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    b.fillStyle = g; b.fillRect(0, 0, 64, 64);
    probe = document.createElement('canvas'); probe.width = 40; probe.height = Math.round(40 * H / W);
    read(); film0 = filmNow || 1; list.forEach((s) => { s.a0 = s.a || 1; }); read();
    sponge.style.transform = `translate(${W / 2}px, ${H * 0.78}px)`; sponge.classList.add('idle');
  }
  function stamp(c, s) { c.save(); c.translate(s.x, s.y); c.rotate(s.rot); c.drawImage(s.im, -s.w / 2, -s.h / 2, s.w, s.h); c.restore(); }
  // what's left: the film's alpha, each stain's in its own box → the score
  function read() {
    const p = probe.getContext('2d', { willReadFrequently: true }), pw = probe.width, ph = probe.height, q = pw / W;
    const sum = (src, x0, y0, x1, y1) => {
      p.clearRect(0, 0, pw, ph); p.drawImage(src, 0, 0, pw, ph);
      const X0 = Math.max(0, Math.floor(x0 * q)), Y0 = Math.max(0, Math.floor(y0 * q)), w = Math.min(pw, Math.ceil(x1 * q)) - X0, h = Math.min(ph, Math.ceil(y1 * q)) - Y0;
      if (w <= 0 || h <= 0) return 0;
      const d = p.getImageData(X0, Y0, w, h).data; let a = 0;
      for (let i = 3; i < d.length; i += 4) a += d[i];
      return a;
    };
    filmNow = sum(film, 0, 0, W, H);
    // (one copy of the stains for all of them)
    p.clearRect(0, 0, pw, ph); p.drawImage(stain, 0, 0, pw, ph);
    const d = p.getImageData(0, 0, pw, ph).data;
    for (const s of list) {
      if (s.gone) continue;
      const rr = Math.max(s.w, s.h) / 2, X0 = Math.max(0, Math.floor((s.x - rr) * q)), X1 = Math.min(pw, Math.ceil((s.x + rr) * q)), Y0 = Math.max(0, Math.floor((s.y - rr) * q)), Y1 = Math.min(ph, Math.ceil((s.y + rr) * q));
      let a = 0;
      for (let y = Y0; y < Y1; y++) for (let x = X0; x < X1; x++) a += d[(y * pw + x) * 4 + 3];
      s.a = a;
    }
    const left = list.length ? list.reduce((t, s) => t + (s.gone ? 0 : Math.min(1, s.a / s.a0)), 0) / list.length : 0;
    clean = Math.max(0, Math.min(1, 1 - ((1 - FILM_W) * left + FILM_W * Math.min(1, filmNow / film0))));
    if (list.every((s) => s.gone) && filmNow / film0 < 0.06) clean = 1;
  }
  function pop(s) {
    s.gone = true;
    const c = stain.getContext('2d');
    c.save(); c.globalCompositeOperation = 'destination-out';
    for (let i = 0; i < 3; i++) stamp(c, s); // (its own shape, till nothing of it is left)
    c.restore();
    sparks.push({ x: s.x, y: s.y, t: 0, r: s.w * 0.5 });
    for (let i = 0; i < 4; i++) sparks.push({ x: s.x + rnd(-0.4, 0.4) * s.w, y: s.y + rnd(-0.4, 0.4) * s.h, t: -rnd(0, 0.2), r: s.w * rnd(0.14, 0.24) });
    sfx('event-pop', { vol: 0.5 }); buzz(12);
  }
  // a rub from one point to the next: dabs along the way, suds behind
  function rub(x0, y0, x1, y1) {
    const R = W * BRUSH.r, d = Math.hypot(x1 - x0, y1 - y0), n = Math.max(1, Math.ceil(d / (R * 0.5)));
    for (const [cv, a] of [[film, BRUSH.film], [stain, BRUSH.stain]]) {
      const c = cv.getContext('2d');
      c.save(); c.globalCompositeOperation = 'destination-out'; c.globalAlpha = a;
      for (let i = 1; i <= n; i++) { const x = x0 + (x1 - x0) * i / n, y = y0 + (y1 - y0) * i / n; c.drawImage(brush, x - R, y - R, R * 2, R * 2); }
      c.restore();
    }
    for (let i = 0; i < n && bubbles.length < 70; i++) if (Math.random() < 0.5) bubbles.push({ x: x1 + rnd(-R, R) * 0.8, y: y1 + rnd(-R, R) * 0.8, r: rnd(2.5, 8), vx: rnd(-12, 12), vy: rnd(-26, -6), t: 0, life: rnd(0.5, 1.1) });
    if (d > 3 && rustleT <= 0) { sfx('bag-rustle', { vol: 0.18 }); rustleT = 0.32; }
  }
  const at = (e) => { const r = stage.getBoundingClientRect(); return [(e.clientX - r.left) * W / r.width, (e.clientY - r.top) * H / r.height]; };
  function onDown(e) {
    if (!on || down) return;
    e.preventDefault(); stage.setPointerCapture?.(e.pointerId);
    const [x, y] = at(e); down = { id: e.pointerId, x, y };
    sponge.classList.remove('idle'); sponge.classList.add('on'); rub(x, y, x, y); place(x, y, 0);
  }
  function onMove(e) {
    if (!down || e.pointerId !== down.id) return;
    e.preventDefault();
    for (const p of e.getCoalescedEvents?.().length ? e.getCoalescedEvents() : [e]) {
      const [x, y] = at(p);
      rub(down.x, down.y, x, y); place(x, y, x - down.x); down.x = x; down.y = y;
    }
  }
  function onUp(e) { if (down && e.pointerId === down.id) { down = null; sponge.classList.remove('on'); } }
  const place = (x, y, dx) => { sponge.style.transform = `translate(${x}px, ${y}px) rotate(${Math.max(-18, Math.min(18, dx * 1.5))}deg)`; };

  function start() {
    on = true;
    stage.addEventListener('pointerdown', onDown); stage.addEventListener('pointermove', onMove);
    stage.addEventListener('pointerup', onUp); stage.addEventListener('pointercancel', onUp);
  }
  function stop() {
    on = false; down = null;
    stage?.removeEventListener('pointerdown', onDown); stage?.removeEventListener('pointermove', onMove);
    stage?.removeEventListener('pointerup', onUp); stage?.removeEventListener('pointercancel', onUp);
    sponge?.classList.remove('on');
    if (fx) draw(0.016);
  }
  function tick(dt) {
    rustleT -= dt; probeT -= dt;
    if (probeT <= 0) {
      probeT = 0.12; read();
      for (const s of list) if (!s.gone && s.a / s.a0 < BRUSH.pop) pop(s);
      if (list.some((s) => s.gone)) read();
    }
    draw(dt);
  }
  // the suds and the sparkles
  function draw(dt) {
    const c = fx.getContext('2d');
    c.setTransform(k, 0, 0, k, 0, 0); c.clearRect(0, 0, W, H);
    for (let i = bubbles.length - 1; i >= 0; i--) {
      const b = bubbles[i]; b.t += dt;
      if (b.t >= b.life) { bubbles.splice(i, 1); continue; }
      b.x += b.vx * dt; b.y += b.vy * dt;
      const f = 1 - b.t / b.life;
      c.globalAlpha = Math.min(1, f * 1.6);
      c.fillStyle = 'rgba(255,255,255,.82)'; c.beginPath(); c.arc(b.x, b.y, b.r, 0, 7); c.fill();
      c.strokeStyle = 'rgba(140,190,240,.7)'; c.lineWidth = 1; c.stroke();
      c.fillStyle = '#fff'; c.beginPath(); c.arc(b.x - b.r * 0.3, b.y - b.r * 0.3, b.r * 0.25, 0, 7); c.fill();
    }
    for (let i = sparks.length - 1; i >= 0; i--) {
      const s = sparks[i]; s.t += dt;
      if (s.t < 0) continue;
      if (s.t >= 0.7) { sparks.splice(i, 1); continue; }
      const f = s.t / 0.7, sc = Math.sin(Math.min(1, f * 1.6) * Math.PI / 2) * (1 - f * 0.3);
      c.globalAlpha = 1 - f * f;
      if (sparkle) { const w = s.r * 2 * sc; c.save(); c.translate(s.x, s.y); c.rotate(f * 0.8); c.drawImage(sparkle, -w / 2, -w / 2, w, w * sparkle.height / sparkle.width); c.restore(); }
    }
    c.globalAlpha = 1;
  }
  return { hint: 'Rub the dirt away with your finger', go: 'Scrub!', won: 'Spotless!', setup, start, stop, tick, score: () => clean, over: () => clean >= 1, surface };
}

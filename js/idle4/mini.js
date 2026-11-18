// Ferdi's (idle4.html): the mini games. A frame they share (the count-in, the clock running down, the bar that fills
// with a star at each tier, the end) and the games played in it, one to an event:
// - scrub: the kitchen scrubbed before the health inspector looks (a painted surface under a film of grime and a few
//   stains; rubbing wipes them away),
// - cook: the critic's plate cooked by hand (one thing after another in the skillet; a tap takes it off, and the
//   needle says how well done it was),
// - flyers: flyers handed out in the street while Victor's truck is on its way (a tap on the people walking to it;
//   not on his crew).
// What a result is worth is sim.js's business (MINI); the window round the frame, and the cards with the result, are
// ui.js's. The art is in assets/ui4/scrub, cook and flyers.

export const IMG = (n) => `assets/ui4/${n}.webp`;
export const load = (src) => new Promise((res) => { const im = new Image(); im.onload = () => res(im); im.onerror = () => res(null); im.src = src; });
export const rnd = (a, b) => a + Math.random() * (b - a);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// The frame. Builds itself in `host` and plays `game` for `dur` seconds. `done` resolves with the score (0..1) when
// the time is up or the game says it's over, or with null when it's left before it began; leave() ends it now.
// A game: { hint, go, won, done, setup(stage, dur) (a promise), start(), tick(dt), score(), over(), stop(), tally() }
// (won: what it says when it's over with every star, done: with fewer; tally: the result in a few words).
// With no `dur` there is no clock: the game ends itself, and its own meter stands where the clock would
// (meter: { icon, text() }, low(): it's running out).
export function play(host, game, { dur, tiers, sfx = () => {}, buzz = () => {} }) {
  const timed = dur > 0, meter = game.meter;
  host.innerHTML = `<div class="mini ${timed ? '' : 'untimed'}">
    <div class="mtop">
      <span class="mclock"><img src="${timed || !meter ? 'assets/ui4/stopwatch.webp' : IMG(meter.icon)}" alt="" draggable="false"><b></b></span>
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
    clock.textContent = timed ? String(Math.ceil(left)) : meter?.text() ?? ''; el.classList.toggle('hurry', timed ? left <= 3 : !!game.low?.());
    fill.style.width = `${Math.round(s * 100)}%`;
    if (n > lit) { sfx('qte-good', { vol: 0.5 }); buzz(15); }
    lit = n; stars.forEach((x, i) => x.classList.toggle('on', i < n));
  };
  async function end(why) {
    if (state !== 'play') return;
    state = 'end'; cancelAnimationFrame(raf); game.stop(); show();
    const top = why === 'over' && game.score() >= tiers[tiers.length - 1];
    say(why === 'over' ? (top ? game.won : game.done) || 'Done!' : why === 'time' ? 'Time!' : '');
    if (top) { el.classList.add('won'); sfx('ui-levelup', { vol: 0.7 }); buzz(40); } else if (why !== 'left') sfx('order-complete', { vol: 0.5 });
    if (why !== 'left') await wait(why === 'over' ? 1100 : 800);
    finish(game.score());
  }
  function frame(now) {
    const dt = Math.min(0.1, (now - last) / 1000); last = now;
    const was = Math.ceil(left);
    if (timed) left = Math.max(0, left - dt);
    game.tick(dt); show();
    if (timed && left <= 3 && Math.ceil(left) < was && left > 0) sfx('countdown-tick', { vol: 0.5 });
    if (game.over()) end('over'); else if (timed && left <= 0) end('time'); else raf = requestAnimationFrame(frame);
  }
  (async () => {
    clock.textContent = timed ? String(dur) : meter?.text() ?? '';
    await game.setup(stage, dur);
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
    const [bg, sp, ...ims] = await Promise.all([load(IMG(`scrub/${surface}`)), load(IMG('scrub/sparkle')), ...names.map((n) => load(IMG(`scrub/${n}`)))]);
    sparkle = sp;
    W = stage.clientWidth; H = stage.clientHeight; k = Math.min(2, devicePixelRatio || 1); // (its laid-out size: the window may still be growing in)
    if (bg) { bg.className = 'msurf'; bg.alt = ''; bg.draggable = false; stage.prepend(bg); }
    film = layer('mfilm'); stain = layer('mstain'); fx = layer('mfx');
    sponge = document.createElement('img'); sponge.className = 'msponge'; sponge.src = IMG('scrub/sponge'); sponge.alt = ''; sponge.draggable = false; stage.append(sponge);
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
  return { hint: 'Rub the dirt away with your finger', go: 'Scrub!', won: 'Spotless!', setup, start, stop, tick, score: () => clean, over: () => clean >= 1, tally: () => `<b>${Math.round(clean * 100)}%</b> clean`, surface };
}

// ---------------------------------------------------------------- cooking the critic's plate
// One thing after another in the skillet. The needle runs from raw to burnt; a tap takes the thing off, and how near
// the needle was to the middle of the green is what it's worth. Left alone it burns.
// The skillet is heard as well: a recorded sizzle that rises with the needle and spits when the thing burns.
const COOK = [ // (t: s from raw to burnt; hw: half the green's width, of the meter; siz: how loud it fries, and how high)
  { item: 'patty', say: 'Sear the patty!', t: 2.6, hw: 0.1, siz: [1, 1] },
  { item: 'patty', flip: true, say: 'Flip!', t: 2.3, hw: 0.09, siz: [1, 1.03] },
  { item: 'bun', say: 'Toast the bun!', t: 2.1, hw: 0.085, siz: [0.5, 1.14] },
  { item: 'bacon', say: 'Bacon!', t: 1.9, hw: 0.075, siz: [1.1, 1.08] },
  { item: 'onion', say: 'Onions!', t: 1.7, hw: 0.07, siz: [0.85, 0.95] },
];
const DONE = { core: 0.45, near: 2.2, rest: 0.55 }; // (the perfect middle and the near miss, in half widths; s between two things)
const SIZZLE = { raw: 0.3, heat: 0.55, burn: 0.35, max: 1.2, hold: 0.3, idle: 0.1, bend: [0.94, 0.1, 0.14] }; // (its level raw, + at the green, + burning; with a patty waiting, with nothing in; its pitch the same way)
const COOK_SFX = ['cook-sizzle', 'cook-drop', 'cook-flip', 'cook-take', 'cook-burnt', 'cook-ignite', 'cook-bell'];
const clamp = (x) => Math.max(0, Math.min(1, x));

// (loop: a looping sound to steer, → { set({ vol, rate }), stop() } or null; warm: sounds to have ready)
export function cookGame({ sfx = () => {}, buzz = () => {}, loop = () => null, warm = () => {} } = {}) {
  let stage, el, pan, zone, needle, word, dots, imgs, siz = null;
  let on = false, i = -1, p = 0, z = 0.7, phase = 'rest', restT = 0.3, total = 0;
  const got = [];

  async function setup(s) {
    stage = s; warm(...COOK_SFX);
    const names = [...new Set(COOK.map((c) => c.item))].flatMap((n) => [0, 1, 2].map((k) => `cook/${n}${k}`));
    const [bg] = await Promise.all([load(IMG('cook/stove')), ...names.map((n) => load(IMG(n))), load(IMG('cook/burger'))]);
    if (bg) { bg.className = 'msurf'; bg.alt = ''; bg.draggable = false; stage.prepend(bg); }
    el = document.createElement('div'); el.className = 'cook';
    el.innerHTML = `<div class="csteps">${COOK.map(() => '<i></i>').join('')}</div>
      <div class="cmeter"><span><i class="czone"><i></i></i></span><u class="cneedle"></u><img class="cflame" src="${IMG('cook/flame')}" alt="" draggable="false"></div>
      <div class="cpan"><img class="c0" alt="" draggable="false"><img class="c1" alt="" draggable="false"><img class="c2" alt="" draggable="false">
        <img class="csteam" src="${IMG('cook/steam')}" alt="" draggable="false"><img class="csmoke" src="${IMG('cook/smoke')}" alt="" draggable="false"></div>
      <img class="cspat" src="${IMG('cook/spatula')}" alt="" draggable="false"><img class="cplate" src="${IMG('cook/burger')}" alt="" draggable="false" hidden>
      <b class="cword" hidden></b>`;
    stage.append(el);
    pan = el.querySelector('.cpan'); zone = el.querySelector('.czone'); needle = el.querySelector('.cneedle'); word = el.querySelector('.cword');
    dots = [...el.querySelectorAll('.csteps i')]; imgs = [0, 1, 2].map((k) => pan.querySelector(`.c${k}`));
    el.classList.add('wait');
    sfx('cook-ignite', { vol: 0.6 }); // (the burner catches while the frame counts in)
  }
  const say = (t, cls) => { word.hidden = false; word.textContent = t; word.className = `cword ${cls}`; word.style.animation = 'none'; void word.offsetWidth; word.style.animation = ''; };
  // the next thing into the skillet (or, after the last, the plate)
  function next() {
    i++;
    if (i >= COOK.length) {
      phase = 'over'; el.classList.add('wait'); pan.className = 'cpan'; word.hidden = true; el.querySelector('.cplate').hidden = false;
      siz?.stop(0.2); siz = null; sfx('cook-bell', { vol: 0.55 });
      return;
    }
    const c = COOK[i];
    z = rnd(0.5, 0.82); p = 0; phase = 'cook';
    imgs.forEach((im, k) => { im.src = IMG(`cook/${c.item}${k}`); });
    zone.style.left = `${(z - c.hw) * 100}%`; zone.style.width = `${c.hw * 200}%`;
    zone.firstElementChild.style.width = `${DONE.core * 100}%`;
    el.classList.remove('wait'); pan.className = `cpan in ${c.flip ? 'flip' : ''}`;
    dots[i].className = 'now';
    say(c.say, 'call'); sfx(c.flip ? 'cook-flip' : 'cook-drop', { vol: 0.75 * Math.min(1, 0.4 + c.siz[0] * 0.6) });
    look();
  }
  function look() {
    const c = COOK[i]; if (!c) return;
    needle.style.left = `${clamp(p) * 100}%`;
    imgs[1].style.opacity = clamp((p - 0.08) / Math.max(0.05, z - c.hw - 0.08));
    imgs[2].style.opacity = clamp((p - z - c.hw) / Math.max(0.05, 1 - z - c.hw) * 1.25);
    const heat = clamp(p / z), burn = +imgs[2].style.opacity;
    pan.style.setProperty('--heat', heat.toFixed(2)); pan.style.setProperty('--burn', burn);
    siz?.set({ vol: Math.min(SIZZLE.max, c.siz[0] * (SIZZLE.raw + SIZZLE.heat * heat + SIZZLE.burn * burn)), rate: c.siz[1] * (SIZZLE.bend[0] + SIZZLE.bend[1] * heat + SIZZLE.bend[2] * burn) });
  }
  // off the heat: how well done it was
  function take(burnt) {
    const c = COOK[i], d = Math.abs(p - z) / c.hw, raw = p < z;
    const [a, t, cls] = burnt ? [0, 'Burnt!', 'bad'] : d <= DONE.core ? [1, 'Perfect!', 'best'] : d <= 1 ? [0.7, 'Good!', 'good'] : d <= DONE.near ? [0.35, raw ? 'A bit raw' : 'A bit dark', 'so'] : [0, raw ? 'Raw!' : 'Burnt!', 'bad'];
    got.push(a); total += a; dots[i].className = cls;
    phase = 'rest'; restT = DONE.rest;
    pan.className = `cpan ${a && COOK[i + 1]?.flip ? 'hold' : a ? 'out' : 'lost'}`; el.classList.add('wait'); // (a patty to flip stays in the skillet)
    if (a) { const sp = el.querySelector('.cspat'); sp.classList.remove('go'); void sp.offsetWidth; sp.classList.add('go'); }
    say(t, cls);
    // the spatula under it; a thing left too long flares up; the skillet hisses on, low (lower with nothing in it)
    const held = a && COOK[i + 1]?.flip;
    siz?.set({ vol: held ? SIZZLE.hold * c.siz[0] : SIZZLE.idle, rate: SIZZLE.bend[0] });
    if (burnt || (!a && !raw)) sfx('cook-burnt', { vol: 0.7 }); else sfx('cook-take', { vol: 0.6 });
    if (a >= 0.7) { sfx('qte-good', { vol: a === 1 ? 0.5 : 0.3 }); buzz(a === 1 ? 25 : 12); } else if (!a) { sfx('qte-bad', { vol: 0.4 }); buzz(30); }
  }
  function onDown(e) { if (!on || phase !== 'cook') return; e.preventDefault(); take(false); }
  function start() { on = true; stage.addEventListener('pointerdown', onDown); siz = loop('cook-sizzle', { vol: SIZZLE.idle, rate: SIZZLE.bend[0] }); }
  function stop() { on = false; stage?.removeEventListener('pointerdown', onDown); siz?.stop(); siz = null; }
  function tick(dt) {
    if (phase === 'cook') { p += dt / COOK[i].t; look(); if (p >= 1) take(true); }
    else if (phase === 'rest') { restT -= dt; if (restT <= 0) next(); }
  }
  const count = (a) => got.filter((x) => x === a).length;
  return { hint: 'Tap to take it off the heat when the needle is in the green', go: 'Cook!', won: 'Chef\'s kiss!', done: 'Order up!', setup, start, stop, tick,
    score: () => total / COOK.length, over: () => phase === 'over', tally: () => `<b>${count(1)}</b> perfect · <b>${count(0.7)}</b> good`,
    peek: () => ({ phase, p, z, hw: COOK[i]?.hw ?? 0, step: i }) };
}

// ---------------------------------------------------------------- handing out flyers
// The street between Ferdi's door (up) and Victor's truck (down). People walk down to the truck; a tap hands one a
// flyer and they turn back to Ferdi's. Victor's crew, in red, walk among them: a flyer handed to one of them is one
// thrown away (and half of another).
const WALK = { top: 0.13, end: 0.85, lanes: [0.25, 0.42, 0.59, 0.76], h: 0.2, cross: [3.4, 2.5], wrong: 0.5 }; // (of the stage; cross: s down the street, first and last)

export function flyersGame({ people = 14, crew = 5, sfx = () => {}, buzz = () => {} } = {}) {
  let stage, el, W, H, on = false, t = 0, hits = 0, wrong = 0, gone = 0;
  const plan = [], list = [];

  async function setup(s, dur) {
    stage = s;
    const kinds = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'v1', 'v2'];
    const [bg] = await Promise.all([load(IMG('flyers/street')), ...kinds.map((n) => load(IMG(`flyers/${n}`))), load(IMG('flyers/love')), load(IMG('flyers/angry')), load(IMG('flyers/flyer'))]);
    if (bg) { bg.className = 'msurf'; bg.alt = ''; bg.draggable = false; stage.prepend(bg); }
    el = document.createElement('div'); el.className = 'flyers';
    el.innerHTML = `<img class="fhand" src="${IMG('flyers/hand')}" alt="" draggable="false">`;
    stage.append(el);
    W = stage.clientWidth; H = stage.clientHeight;
    // who comes when: the crew somewhere after the first two, never two in a row; the times spread over the game,
    // so that the last one is down the street as the clock runs out
    const n = people + crew, who = Array(n).fill(false);
    for (let k = 0, tries = 0; k < crew && tries < 200; tries++) { const j = 2 + Math.floor(Math.random() * (n - 2)); if (!who[j] && !who[j - 1] && !who[j + 1]) { who[j] = true; k++; } }
    const span = dur - WALK.cross[1] - 0.6; let lane = -1, pp = Math.floor(Math.random() * 6);
    for (let j = 0; j < n; j++) {
      let l; do { l = Math.floor(Math.random() * WALK.lanes.length); } while (l === lane); lane = l;
      const f = j / (n - 1);
      plan.push({ at: Math.max(0, f * span + (j ? rnd(-0.18, 0.18) : 0)), crew: who[j], art: who[j] ? `v${1 + Math.floor(Math.random() * 2)}` : `p${1 + pp++ % 6}`,
        x: WALK.lanes[l] + rnd(-0.03, 0.03), cross: WALK.cross[0] + (WALK.cross[1] - WALK.cross[0]) * f });
    }
  }
  function spawn(q) {
    const d = document.createElement('div'); d.className = `fw ${q.crew ? 'crew' : ''}`;
    d.innerHTML = `<img src="${IMG(`flyers/${q.art}`)}" alt="" draggable="false" style="animation-delay:-${rnd(0, 0.4).toFixed(2)}s">`;
    el.append(d);
    const w = { ...q, el: d, y: WALK.top, st: 'walk', t: 0 }; list.push(w); place(w);
  }
  function place(w) {
    const f = (w.y - WALK.top) / (WALK.end - WALK.top), k = 0.82 + 0.3 * f;
    w.el.style.transform = `translate(${w.x * W}px, ${w.y * H}px) translate(-50%, -100%) scale(${k.toFixed(3)})`;
    w.el.style.zIndex = String(Math.round(w.y * 100));
    w.k = k;
  }
  const bubble = (w, n) => { const b = document.createElement('img'); b.className = 'fbub'; b.src = IMG(`flyers/${n}`); b.alt = ''; b.draggable = false; w.el.append(b); };
  const out = (w) => { w.st = 'gone'; w.el.remove(); gone++; };
  // a flyer from the hand to them
  function fly(w) {
    const f = document.createElement('img'); f.className = 'ffly'; f.src = IMG('flyers/flyer'); f.alt = ''; f.draggable = false; el.append(f);
    const x = w.x * W, y = (w.y - WALK.h * w.k * 0.5) * H;
    f.animate([{ transform: `translate(${W * 0.84}px, ${H * 0.9}px) scale(.9) rotate(-30deg)` }, { transform: `translate(${x}px, ${y}px) scale(.45) rotate(200deg)` }], { duration: 170, easing: 'ease-out' }).onfinish = () => f.remove();
  }
  function onDown(e) {
    if (!on) return;
    e.preventDefault();
    const r = stage.getBoundingClientRect(), x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
    // (the one in front, of those under the finger: a little wider than they're painted)
    const w = list.filter((q) => q.st === 'walk' && Math.abs(x - q.x) < 0.115 * q.k && y < q.y + 0.03 && y > q.y - WALK.h * q.k - 0.03).sort((a, b) => b.y - a.y)[0];
    if (!w) return;
    fly(w);
    if (w.crew) { w.st = 'mad'; wrong++; w.el.classList.add('mad'); bubble(w, 'angry'); sfx('qte-bad', { vol: 0.5 }); buzz(30); el.classList.remove('oops'); void el.offsetWidth; el.classList.add('oops'); }
    else { w.st = 'got'; w.t = 0; hits++; w.el.classList.add('got'); bubble(w, 'love'); sfx('pickup-bonus', { vol: 0.45 }); buzz(12); }
  }
  function start() { on = true; stage.addEventListener('pointerdown', onDown); }
  function stop() { on = false; stage?.removeEventListener('pointerdown', onDown); }
  function tick(dt) {
    t += dt;
    while (plan.length && plan[0].at <= t) spawn(plan.shift());
    for (const w of list) {
      if (w.st === 'gone') continue;
      const v = (WALK.end - WALK.top) / w.cross;
      if (w.st === 'got') { w.t += dt; if (w.t > 0.3) w.y -= v * 2.6 * dt; if (w.y <= WALK.top) { out(w); continue; } } // (a look at the flyer, then back up to Ferdi's)
      else { w.y += v * dt; if (w.y >= WALK.end) { out(w); continue; } }
      w.el.style.opacity = clamp(Math.min((w.y - WALK.top + 0.01) / 0.04, (WALK.end - w.y) / 0.04));
      place(w);
    }
  }
  const score = () => clamp((hits - WALK.wrong * wrong) / people);
  return { hint: 'Tap people to hand them a flyer. Not Victor\'s crew in red!', go: 'Flyers!', won: 'Full house!', done: 'That\'s everyone!', setup, start, stop, tick,
    score, over: () => !plan.length && gone >= people + crew, tally: () => `<b>${hits}/${people}</b> took a flyer${wrong ? ` · <b>${wrong}</b> wasted` : ''}`,
    peek: () => list.filter((w) => w.st === 'walk').map((w) => { const r = stage.getBoundingClientRect(); return { crew: w.crew, x: r.left + w.x * r.width, y: r.top + (w.y - WALK.h * w.k * 0.4) * r.height, at: w.y }; }) };
}

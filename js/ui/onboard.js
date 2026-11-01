// First-time experience: intro slides + courier pick, then a spotlight guide through the first delivery and the
// first upgrade. Later milestone nudges (Jobs, Fleet). Progress lives in S.onboard.step (99 = done).
import * as St from '../state.js';
import { S } from '../state.js';
import { CHAR_IDS, PAINTS, DISTRICT, FLEET } from '../data.js';
import { ICON, PRIVACY } from './ui.js';
import { track } from '../analytics.js';

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// step → what to point at and what to say. `on` = the game event that completes the step.
const STEPS = {
  1: { target: '.sheet-body .ocard', text: 'Tap an order to take it.<br><small>Short ones are easiest on your old scooter.</small>', on: 'taken', place: 'above' },
  2: { target: '#startbar .sb-go', text: 'Now tap <b>Start</b> and hop on!', on: 'start', place: 'above' },
  // (the door scenes play by themselves: nothing to tap, so no hand)
  3: { target: '.modal.scene .card', text: 'The cook brings the food out to your scooter.', on: 'picked', place: 'above', waitFor: 'pickup', noHand: true },
  4: { target: '.modal.scene .card', text: 'Hand it over — and hope for a tip!', on: 'dropped', place: 'above', waitFor: 'drop', noHand: true },
  5: { target: '.modal.receipt [data-x]', text: 'Your first pay! Fast, careful rides earn bigger tips.', on: 'hub', place: 'above', waitFor: 'receipt' },
  6: { target: '.tabs [data-tab="garage"]', text: 'Spend it! Open the <b>Garage</b>.', on: 'tab:garage', place: 'above' },
  7: { target: '.rows [data-act="part"]', text: 'A faster engine = shorter deliveries.', on: 'part', place: 'above', fallback: true },
  8: { target: '.tabs [data-tab="city"]', text: 'Back to the city — more orders are waiting.', on: 'tab:city', place: 'above' },
};

export function createOnboarding(game, ui) {
  const root = document.getElementById('ui');
  const guide = document.createElement('div');
  guide.id = 'guide'; guide.hidden = true;
  guide.innerHTML = `<div class="g-hole"></div><div class="g-hand">👆</div><div class="g-bubble"><p></p><div class="g-act"></div><button class="g-skip" type="button">Skip tutorial</button></div>`;
  root.append(guide);
  const hole = guide.querySelector('.g-hole'), hand = guide.querySelector('.g-hand'), bubble = guide.querySelector('.g-bubble'), text = bubble.querySelector('p'), act = bubble.querySelector('.g-act');
  guide.querySelector('.g-skip').addEventListener('click', () => finish(true));
  let raf = 0, cur = null, waiting = null;
  const step = () => S.onboard.step;
  const setStep = (n) => { if (n !== S.onboard.step) track('onboard_step', { step: n, from: S.onboard.step }); S.onboard.step = n; St.save(); };

  // ---------- intro: three slides, then pick your courier ----------
  function intro() {
    return new Promise((resolve) => {
      const el = document.createElement('div');
      el.id = 'intro';
      let look = { char: S.look.char, helmet: S.look.helmet }, name = S.name || '', skipped = false;
      const slides = [
        { art: `<img src="assets/icons/veh-rustbucket.png" class="ia big" alt="">`, h: 'Welcome to Saffron Bay', p: 'Your uncle left you his old scooter. It rattles, it smokes, it\'s <b>yours</b>. You have <b>$25</b> and big dreams.' },
        game.ctl === 'b' // (the brake, ?ctl=b)
          ? { art: `<span class="ia-row">${ICON('food-burger', 'ia')}<i>→</i>${ICON('ui-speed', 'ia')}<i>→</i>${ICON('ui-cash', 'ia')}</span>`, h: 'The gas is always on', p: 'Your scooter steers itself. You <b>hold</b> the screen to brake — for corners, red lights and the door. Brake late, ride smooth, earn big tips.' }
          : game.ctl === 'run' // (the courier run: phones, and keyboards on auto-drive)
            ? { art: `<span class="ia-row">${ICON('food-burger', 'ia')}<i>→</i>${ICON('ui-jump', 'ia')}<i>→</i>${ICON('ui-coin', 'ia')}</span>`, h: 'Weave through traffic', p: 'Your scooter rides itself, but it won\'t stop for anything. <b>Swipe</b> between the cars, hold <b>BRAKE</b> for the rest — grab the coins, keep the food in one piece.' }
            : game.ctl // (the lane run, ?ctl=a)
              ? { art: `<span class="ia-row">${ICON('food-burger', 'ia')}<i>→</i>${ICON('ui-overtake', 'ia')}<i>→</i>${ICON('ui-cash', 'ia')}</span>`, h: 'The gas is always on', p: 'You <b>hold</b> the screen to brake and <b>swipe</b> to change lanes. Fast, careful deliveries earn big tips.' }
              : { art: `<span class="ia-row">${ICON('food-burger', 'ia')}<i>→</i>${ICON('ui-nitro', 'ia')}<i>→</i>${ICON('ui-cash', 'ia')}</span>`, h: 'The scooter rides itself', p: 'You choose when to <b>turbo</b>, <b>hop</b> over potholes and <b>overtake</b>. Fast, careful deliveries earn big tips.' },
        { art: `<span class="ia-row">${ICON('ui-building', 'ia')}${ICON('ui-people', 'ia')}${ICON('ui-trophy', 'ia')}</span>`, h: 'Build a delivery empire', p: 'Buy faster bikes, get hired in better districts, and hire your own couriers who earn while you sleep.' },
      ];
      let i = 0;
      const render = () => {
        if (i < slides.length) {
          const sl = slides[i];
          el.innerHTML = `<div class="i-card"><div class="i-art">${sl.art}</div><h2>${sl.h}</h2><p>${sl.p}</p>
            <div class="i-dots">${slides.map((_, k) => `<i class="${k === i ? 'on' : ''}"></i>`).join('')}<i></i></div>
            <div class="i-btns">${i === 0 ? '<button class="btn ghost sm" data-i="skip">Skip</button>' : '<button class="btn ghost sm" data-i="back">Back</button>'}<button class="btn green big" data-i="next">${i === slides.length - 1 ? 'Choose my courier' : 'Next'}</button></div>
            ${i === 0 ? `<p class="i-legal">No account, no ads. The game sends anonymous play data to help us fix and balance it (<a href="${PRIVACY}" target="_blank" rel="noopener">privacy</a>); you can turn it off in Settings.</p>` : ''}</div>`;
        } else {
          el.innerHTML = `<div class="i-card pick"><h2>Who's riding?</h2>
            <div class="i-preview">${ICON('char-' + look.char, 'ip')}<span class="i-helm" style="--c:${look.helmet}"></span></div>
            <div class="i-chars">${CHAR_IDS.map((c) => `<button class="pchar ${look.char === c ? 'on' : ''}" data-c="${c}">${ICON('char-' + c)}</button>`).join('')}</div>
            <div class="i-label">Helmet</div>
            <div class="swatches">${PAINTS.map((c) => `<button class="sw ${look.helmet === c ? 'on' : ''}" style="--c:${c}" data-h="${c}"></button>`).join('')}</div>
            <label class="i-name"><span>Your name</span><input maxlength="14" placeholder="Courier" value="${esc(name)}" autocomplete="off" spellcheck="false"></label>
            <button class="btn green big" data-i="go">${ICON('ui-nitro')} Start my first shift</button></div>`;
          el.querySelector('input').addEventListener('input', (e) => { name = e.target.value.slice(0, 14); });
        }
      };
      el.addEventListener('click', (e) => {
        const b = e.target.closest('button'); if (!b) return;
        game.audio?.init(); game.audio?.play('ui-tap');
        if (b.dataset.c) { look.char = b.dataset.c; render(); return; }
        if (b.dataset.h) { look.helmet = b.dataset.h; render(); return; }
        const a = b.dataset.i;
        if (a === 'next') { i++; render(); }
        if (a === 'back') { i = Math.max(0, i - 1); render(); }
        if (a === 'skip') { i = slides.length; skipped = true; render(); }
        if (a === 'go') {
          S.look.char = look.char; S.look.helmet = look.helmet; S.name = name.trim(); S.seen.privacy = 1; // (the first slide's note)
          track('intro_done', { char: look.char, helmet: look.helmet, named: S.name ? 1 : 0, skipped: skipped ? 1 : 0 });
          St.save(true); St.emit('look');
          el.classList.add('out'); setTimeout(() => el.remove(), 350);
          resolve();
        }
      });
      render();
      document.body.append(el);
    });
  }

  // ---------- spotlight guide ----------
  function show(n) {
    const def = STEPS[n];
    cur = def ? { n, ...def } : null;
    if (!cur) return hide();
    if (cur.waitFor && waiting !== cur.waitFor) { hide(); return; } // appears when that screen shows up
    guide.hidden = false;
    text.innerHTML = cur.text;
    act.innerHTML = '';
    cancelAnimationFrame(raf);
    const loop = () => { position(); raf = requestAnimationFrame(loop); };
    loop();
  }
  function hide() { guide.hidden = true; cancelAnimationFrame(raf); }
  function position() {
    if (!cur) return;
    const t = document.querySelector(cur.target);
    const vis = t && t.offsetParent !== null && !t.closest('[hidden]');
    if (!vis) {
      if (cur.fallback && cur.n === 7) {
        // can't afford an upgrade yet: say so and let them continue
        hole.style.opacity = 0; hand.style.opacity = 0;
        if (!act.innerHTML) { text.innerHTML = `Upgrades cost cash — keep delivering and come back soon.`; act.innerHTML = '<button class="btn green sm" data-g="ok">Got it</button>'; act.querySelector('button').onclick = () => advance(); }
        bubble.style.left = '50%'; bubble.style.top = '40%'; bubble.style.transform = 'translate(-50%, -50%)';
      } else { hole.style.opacity = 0; hand.style.opacity = 0; bubble.style.opacity = 0; }
      return;
    }
    // bring a target inside a scrolling list into view once
    if (!cur.scrolled) { cur.scrolled = true; const sc = t.closest('.sheet-body'); if (sc) { const a = t.getBoundingClientRect(), b = sc.getBoundingClientRect(); if (a.bottom > b.bottom - 90 || a.top < b.top) t.scrollIntoView({ block: 'center', behavior: 'smooth' }); } }
    const r = t.getBoundingClientRect(), pad = 6;
    hole.style.opacity = 1; hand.style.opacity = cur.noHand ? 0 : 1; bubble.style.opacity = 1;
    Object.assign(hole.style, { left: r.left - pad + 'px', top: r.top - pad + 'px', width: r.width + pad * 2 + 'px', height: r.height + pad * 2 + 'px', borderRadius: Math.min(22, r.height / 2 + pad) + 'px' });
    hand.style.left = r.left + r.width * 0.5 + 'px'; hand.style.top = r.top + r.height * 0.55 + 'px';
    const bw = Math.min(innerWidth - 24, 300), bh = bubble.offsetHeight || 80;
    let bx = r.left + r.width / 2 - bw / 2; bx = Math.max(12, Math.min(innerWidth - bw - 12, bx));
    let by = cur.place === 'above' ? r.top - bh - 18 : r.bottom + 18;
    if (by < 70) by = r.bottom + 18;
    if (by + bh > innerHeight - 8) by = Math.max(70, r.top - bh - 18);
    Object.assign(bubble.style, { left: bx + 'px', top: by + 'px', width: bw + 'px', transform: 'none' });
  }
  function advance() {
    const n = step();
    const next = n + 1;
    if (!STEPS[next]) return finish(false);
    setStep(next);
    show(next);
  }
  function finish(skipped) {
    track('onboard_done', { skipped: skipped ? 1 : 0, at: step() });
    setStep(99); hide(); cur = null;
    if (!skipped) ui.toast("You're on your own now — good luck out there!", 'good');
  }

  // game → guide: something happened
  function event(name) {
    if (name === 'pickup' || name === 'drop' || name === 'receipt') { waiting = name; if (cur && cur.waitFor === name) show(cur.n); return; }
    if (name === 'hidden') { waiting = null; hide(); return; }
    // the guided first ride was cancelled from the pause menu: back to "tap an order"
    if (name === 'cancel') { if (step() >= 2 && step() <= 5) { waiting = null; setStep(1); show(1); } return; }
    if (step() >= 99) { milestone(name); return; }
    if (cur && name === cur.on) { waiting = null; advance(); }
    else if (step() >= 1 && step() < 99 && STEPS[step()] && !cur) show(step());
  }

  // later nudges (once each): a district is ready to apply for, the fleet opens
  function milestone(name) {
    if (name !== 'hub') return;
    const seen = S.seen;
    const ready = ['downtown', 'harbor', 'hills'].find((d) => !S.districts[d] && St.districtStatus(d).canApply && !seen['ms_' + d]);
    if (ready) { seen['ms_' + ready] = 1; St.save(); nudge('.tabs [data-tab="jobs"]', `<b>${DISTRICT[ready].name}</b> is hiring! Apply in <b>Jobs</b> — orders there pay ×${DISTRICT[ready].pay}.`, 'tab:jobs'); return; }
    if (S.lvl >= FLEET.unlockLvl && !S.fleet.office && !seen.ms_fleet) { seen.ms_fleet = 1; St.save(); nudge('.tabs [data-tab="fleet"]', 'You can rent a <b>dispatch office</b> now and hire couriers who earn for you — even offline.', 'tab:fleet'); }
  }
  function nudge(target, html, on) {
    cur = { n: -1, target, text: html, on, place: 'above' };
    guide.hidden = false; text.innerHTML = html; act.innerHTML = '<button class="btn ghost sm" data-g="later">Later</button>';
    act.querySelector('button').onclick = () => { hide(); cur = null; };
    cancelAnimationFrame(raf);
    const loop = () => { position(); raf = requestAnimationFrame(loop); }; loop();
  }
  const baseEvent = event;
  function eventWithNudge(name) {
    if (cur && cur.n === -1) { if (name === cur.on) { hide(); cur = null; } return; }
    baseEvent(name);
  }

  async function start() {
    if (step() >= 99) return;
    if (step() === 0) { await intro(); setStep(1); }
    show(step() > 8 ? 8 : step());
  }
  function replay() { setStep(0); location.reload(); }

  return { start, event: eventWithNudge, replay, get active() { return step() < 99; } };
}

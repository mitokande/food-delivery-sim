// Ferdi's (idle4.html): the interface. The top bar (you, the restaurant's level, income, cash), the hint at the bottom
// (what to do next), the room panel that slides up when a room is tapped (what it holds, what to buy, its renovation),
// the story cards, the "while you were away" card, settings, toasts. Numbers that change every frame are patched by
// live(); renderRoom() rebuilds the panel.
import * as S from './sim.js';
import { app } from '../native.js';

const ICON = (n, cls = '') => `<img class="ic ${cls}" src="assets/icons/${n}.webp" alt="" draggable="false" onerror="this.onerror=null;this.src='assets/icons/${n}.png'">`;
const ART = (n) => `assets/story/${n}.webp`;
const DICON = (id) => `<img class="ic" src="${ART('dish-' + id)}" alt="" draggable="false">`;
const FERDI = `<span class="ferdi"><img src="${ART('ferdi')}" alt="Uncle Ferdi" draggable="false"></span>`;
const $ = (sel, root = document) => root.querySelector(sel);
const M = S.money;
const pct = (x) => `${Math.round(x * 100)}%`;
const secs = (s) => (s < 10 ? `${s.toFixed(1)}s` : s < 60 ? `${Math.round(s)}s` : `${Math.floor(s / 60)}m ${Math.round(s % 60)}s`);
const GEAR = '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M19.4 13a7.6 7.6 0 0 0 0-2l2.1-1.6-2-3.5-2.5 1a7.4 7.4 0 0 0-1.7-1L15 3.3h-4l-.4 2.6a7.4 7.4 0 0 0-1.7 1l-2.5-1-2 3.5L6.6 11a7.6 7.6 0 0 0 0 2l-2.1 1.6 2 3.5 2.5-1c.5.4 1.1.7 1.7 1l.4 2.6h4l.4-2.6c.6-.3 1.2-.6 1.7-1l2.5 1 2-3.5zM13 15.5A3.5 3.5 0 1 1 13 8.5a3.5 3.5 0 0 1 0 7z" transform="translate(-1 0)"/></svg>';
const X = '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M6.4 4.9 12 10.6l5.6-5.7 1.5 1.5-5.7 5.6 5.7 5.6-1.5 1.5-5.6-5.7-5.6 5.7-1.5-1.5 5.7-5.6-5.7-5.6z"/></svg>';

// what each thing for sale looks like, and what it does now → next
const ITEM_ICON = {
  benches: ICON('ui-clock'), sign: ICON('ui-star'), decor: ICON('ui-heart'), tables: ICON('ui-people'), waiters: ICON('char-female-b'), comfort: ICON('ui-heart'),
  service: ICON('ui-speed'), cooks: ICON('char-male-d'), registers: ICON('ui-cash'), speed: ICON('ui-bolt'), upsell: ICON('food-cake'), ledger: ICON('ui-coin'),
  ads: ICON('ui-pin'), training: ICON('ui-xp'), parasols: ICON('ui-sun'),
};
const STAFF = { cooks: 1, waiters: 1, registers: 1 };
function effect(G, room, id) {
  const it = S.ROOMS[room].items[id], n = S.itemOf(G, room, id), st = S.STEP[id];
  const plus = (k) => `+${Math.round(st * k * 100)}%`;
  switch (id) {
    case 'benches': return [`${n * 2} waiting seats`, `${n * 2 + 2}`];
    case 'tables': return [`${n * 2} seats`, `${n * 2 + 2}`];
    case 'waiters': case 'cooks': case 'registers': return [`${n} at work`, `${n + 1}`];
    case 'speed': { const t = (L) => S.CHECKOUT * Math.pow(1 - S.STEP.speed, L); return [`paying takes ${secs(t(n))}`, secs(t(n + 1))]; }
    case 'decor': return [`wait ${Math.round(S.PATIENCE.bench * (1 + st * n))}s on a bench`, `${Math.round(S.PATIENCE.bench * (1 + st * (n + 1)))}s`];
    default: break;
  }
  if (it.kind === 'st') {
    const d = S.DISH[it.dish];
    if (!n) return [`Adds <b>${d.name}</b> to the menu`, `$${d.price}`];
    const p = (L) => M(d.price * S.stPrice(L)), t = (L) => secs(S.stTime(it.dish, L));
    return [`${p(n)} a plate · ${t(n)}`, `${p(n + 1)} · ${t(n + 1)}`];
  }
  return [`${plus(n)} ${{ sign: 'walk-ins', ads: 'walk-ins', comfort: 'price', service: 'waiter speed', ledger: 'all prices', training: 'staff speed', upsell: 'at the register', parasols: 'price outside' }[id] || ''}`, plus(n + 1)];
}

// the story: shown on the first visit (and from the office)
const STORY = [
  { img: 'letter', ferdi: true, title: 'A letter', text: 'Your great-uncle Ferdi, whom you met exactly once at a wedding, has passed away. To everyone\'s surprise, he left everything he owned <b>to you</b>.' },
  { img: 'diner', title: 'Everything', text: 'Everything turns out to be a whole building in Old Town: a restaurant, or what is left of one. Two rooms still work. The rest are planks, crates and dust.' },
  { img: 'rival', title: 'A visitor', text: 'A man in a shiny suit is already waiting at the door. <b>Victor Gristle</b>, owner of the Gristle Burger chain. "I\'ll take this dump off your hands." You say no. He smiles. "We\'ll see."' },
  { img: 'smash', title: 'The menu', text: 'You are no chef. You know exactly one thing: <b>the smash burger</b>. So you cook it, you serve it, you bring the bill.<br>Hire a cook and a waiter, fix up the rooms one by one, and make Ferdi\'s the best place in Old Town.' },
];
const BUILT_TEXT = {
  entrance: 'The entrance is open: people who find every table taken now wait on a bench.',
  office: 'Ferdi\'s office, dusted off. His photo is still on the wall. This is where the restaurant is run from now.',
  cashier: 'The cashier is back: once you have a register, people pay on their way out and free their table sooner.',
  terrace: 'The terrace is open: tables outside, in the sun.',
};
const BLOCK_TEXT = {
  office: (G) => `Upgrade Ferdi's Office to Lv ${S.officeLv(G) + 1} first`,
  build: () => 'Another room is being worked on',
  gate: (G, room) => `Needs restaurant level ${S.ROOMS[room].gate}`,
  max: () => 'As good as it gets (for now)',
  soon: (G, room) => `Coming in a later update (${S.ROOMS[room].soon})`,
};

export function createUI(game) {
  const G = () => game.G;
  const root = document.getElementById('ui');
  root.innerHTML = `
  <div id="hud" class="hud4">
    <header class="top">
      <button class="me" data-act="room" data-room="office" aria-label="Ferdi's Office"><span class="ava">${ICON('char-male-c')}</span><span class="lvb"><b class="rlv">1</b></span></button>
      <span class="name"><b>Ferdi's</b><small class="ipm">$0/min</small></span>
      <span class="res cash">${ICON('ui-cash')}<b class="cashv">$0</b></span>
      <button class="gear" data-act="settings" aria-label="Settings">${GEAR}</button>
    </header>
    <button class="hint" data-act="hint"><span class="hic"></span><span class="ht"></span><i class="go">›</i></button>
    <section id="sheet" class="rsheet" data-state="closed">
      <div class="sh-head"></div>
      <div class="sh-body"></div>
    </section>
  </div>
  <div id="modals"></div>
  <div id="toasts"></div>`;
  const hud = $('#hud'), sheet = $('#sheet'), head = $('.sh-head', sheet), body = $('.sh-body', sheet), modals = $('#modals'), toasts = $('#toasts'), hintEl = $('.hint', hud);
  const sfx = (n, o) => game.audio?.play(n, o);
  let room = null; // the open room
  let hintRoom = null;
  const api = {};

  // ---------- generic ----------
  function toast(text, kind = '') {
    const el = document.createElement('div');
    el.className = 'toast ' + kind; el.innerHTML = text;
    toasts.append(el);
    setTimeout(() => el.classList.add('out'), 2400); setTimeout(() => el.remove(), 2900);
    while (toasts.children.length > 3) toasts.firstChild.remove();
  }
  function modal(html, { cls = '', dismiss = false, pause = false, onClose } = {}) {
    const wrap = document.createElement('div');
    wrap.className = 'modal ' + cls; wrap.innerHTML = `<div class="card">${html}</div>`;
    modals.append(wrap);
    requestAnimationFrame(() => wrap.classList.add('in'));
    if (pause) game.paused = true;
    const close = () => { wrap.classList.remove('in'); wrap.classList.add('out'); setTimeout(() => wrap.remove(), 250); if (pause) game.paused = false; onClose?.(); };
    if (dismiss) { wrap.dataset.dismiss = ''; wrap.addEventListener('click', (e) => { if (e.target === wrap) close(); }); }
    return { el: wrap, card: wrap.firstElementChild, close };
  }

  // ---------- the room panel ----------
  function openRoom(r) {
    room = r; sheet.dataset.state = 'open'; sheet.dataset.room = r;
    renderRoom(); sfx('ui-open', { vol: 0.4 });
    api.onSheet?.(true);
  }
  function closeRoom() {
    if (!room) return;
    room = null; sheet.dataset.state = 'closed';
    api.onSheet?.(false);
  }
  function itemRow(g, r, id) {
    const it = S.ROOMS[r].items[id], n = S.itemOf(g, r, id), cap = S.capOf(g, r, id), cost = S.itemCost(g, r, id);
    if (!cap && !n) return ''; // (a station the kitchen has no room for yet)
    const [now, next] = effect(g, r, id);
    const icon = it.kind === 'st' ? DICON(it.dish) : ITEM_ICON[id] || ICON('ui-star');
    const lvTxt = it.kind === 'n' ? `${n}/${cap}` : it.kind === 'st' && !n ? 'new' : `Lv ${n}/${cap}`;
    const full = n >= cap;
    const fill = cap ? Math.min(1, n / cap) : 0;
    const btn = full ? `<span class="maxb">MAX</span>`
      : `<button class="btn ${it.kind === 'n' || (it.kind === 'st' && !n) ? 'gold' : 'green'} sm buy" data-act="item" data-room="${r}" data-id="${id}" data-cost="${cost}"><small>${it.kind === 'n' ? (STAFF[id] ? 'Hire' : 'Add') : it.kind === 'st' && !n ? 'Build' : 'Upgrade'}</small><b>${M(cost)}</b></button>`;
    const nm = it.kind === 'st' ? `${it.name} <i class="dn">${S.DISH[it.dish].name}</i>` : it.name;
    return `<div class="irow ${full ? 'full' : ''}" data-id="${id}">
      <span class="iic">${icon}</span>
      <span class="itx"><b>${nm}<i class="lv">${lvTxt}</i></b><small>${now}${full ? '' : ` → <em>${next}</em>`}</small><span class="ibar"><u style="width:${pct(fill)}"></u></span></span>
      ${btn}</div>`;
  }
  function renderRoom() {
    if (!room) return;
    const g = G(), R = S.ROOMS[room], lv = S.lvOf(g, room), b = S.building(g, room), block = S.upBlock(g, room);
    const [done, of] = S.readiness(g, room);
    head.innerHTML = `<span class="rbadge big ${lv ? '' : 'ruin'}"><b>${lv || '!'}</b></span>
      <span class="rt"><b>${R.name}</b><small>${R.soon ? 'Coming soon' : lv ? `Level ${lv} of ${S.MAXLV}` : 'In ruins'}</small></span>
      <button class="xb" data-act="close" aria-label="Close">${X}</button>`;
    let html = '';
    if (R.soon) html = `<div class="note">${BLOCK_TEXT.soon(g, room)}. ${room === 'bay' ? 'Couriers will ride from here.' : 'More staff will fit in with lockers and a break room.'}</div>`;
    else if (lv === 0) {
      const cost = S.upCost(g, room);
      html = `<div class="repair"><p>${R.blurb}</p>
        ${b ? `<div class="prog"><span class="pbar"><u data-live="build"></u></span><small data-live="eta"></small></div>`
          : block ? `<button class="btn big" disabled>${BLOCK_TEXT[block](g, room)}</button>`
          : `<button class="btn gold big" data-act="up" data-room="${room}" data-cost="${cost}">Repair · ${M(cost)}<small>${secs(S.upTime(g, room))}</small></button>`}</div>`;
    } else {
      html += `<p class="blurb">${R.blurb}</p>`;
      if (b) html += `<div class="prog"><b>Renovating to Lv ${b.to}</b><span class="pbar"><u data-live="build"></u></span><small data-live="eta"></small></div>`;
      html += `<div class="items">${Object.keys(R.items).map((id) => itemRow(g, room, id)).join('')}</div>`;
      if (!b && lv < S.MAXLV && R.up[lv]?.[0]) {
        const cost = S.upCost(g, room);
        const why = block === 'items' ? `Max out everything here first (${done}/${of})` : block ? BLOCK_TEXT[block](g, room) : '';
        html += `<div class="reno ${block ? '' : 'ready'}">
          <span class="rt"><b>Renovate to Lv ${lv + 1}</b><small>${room === 'office' ? 'Raises the restaurant level: every room can go one level higher' : 'Raises every cap in this room'}</small>
            <span class="ibar"><u style="width:${pct(of ? done / of : 0)}"></u></span></span>
          ${block ? `<span class="why">${why}</span>` : `<button class="btn gold sm buy" data-act="up" data-room="${room}" data-cost="${cost}"><small>${secs(S.upTime(g, room))}</small><b>${M(cost)}</b></button>`}
        </div>`;
      }
    }
    body.innerHTML = html;
    live();
  }

  // ---------- the hint: what to do next ----------
  function hint() {
    const g = G(), k = S.nCooks(g), w = S.nWaiters(g);
    if (!k) return ['kitchen', ICON('char-male-d'), 'Hire a cook: you\'re doing everything yourself'];
    if (!w) return ['dining', ICON('char-female-b'), 'Hire a waiter, so you can step back'];
    if (!S.lvOf(g, 'entrance') && !S.building(g, 'entrance')) return ['entrance', ICON('ui-wrench'), 'Repair the Entrance: benches for people to wait'];
    if (!S.lvOf(g, 'office') && !S.building(g, 'office')) return ['office', ICON('ui-wrench'), 'Fix up Ferdi\'s Office'];
    if (!S.itemOf(g, 'kitchen', 'st:hotdog')) return ['kitchen', DICON('hotdog'), 'Build a sausage grill: Hot Dog joins the menu'];
    if (!S.lvOf(g, 'cashier') && !S.building(g, 'cashier')) return ['cashier', ICON('ui-wrench'), 'Repair the Cashier'];
    if (S.lvOf(g, 'cashier') && !S.nRegisters(g)) return ['cashier', ICON('ui-cash'), 'Put a register in the Cashier'];
    const ready = S.ROOM_IDS.find((r) => S.lvOf(g, r) > 0 && !S.upBlock(g, r));
    if (ready) return [ready, ICON('ui-building'), `${S.ROOMS[ready].name} is ready: renovate to Lv ${S.lvOf(g, ready) + 1}`];
    const repair = S.ROOM_IDS.find((r) => S.lvOf(g, r) === 0 && !S.upBlock(g, r));
    if (repair) return [repair, ICON('ui-wrench'), `Repair the ${S.ROOMS[repair].name}`];
    const d = S.diagnose(g).kind;
    if (d === 'food') return ['kitchen', ICON('ui-clock'), 'Tables wait for their food: upgrade the Kitchen'];
    if (d === 'plates') return ['dining', ICON('char-female-b'), 'Plates wait on the pass: more or faster waiters'];
    if (d === 'seats') return ['dining', ICON('ui-people'), 'People walk past: you need more tables'];
    if (d === 'pay') return ['cashier', ICON('ui-cash'), 'A line to pay: the Cashier needs help'];
    if (d === 'quiet') return ['entrance', ICON('ui-star'), 'Empty tables: a better sign brings people in'];
    // else: the room closest to its next renovation
    let best = null, bf = -1;
    for (const r of S.ROOM_IDS) { if (!S.lvOf(g, r) || S.ROOMS[r].soon) continue; const [a, o] = S.readiness(g, r); const f = o ? a / o : 0; if (f < 1 && f > bf) { bf = f; best = r; } }
    if (best) return [best, ICON('ui-building'), `Max out the ${S.ROOMS[best].name} to renovate it`];
    return ['office', ICON('ui-star'), 'Business is good'];
  }
  let hintKey = '';
  function updateHint() {
    const [r, ic, text] = hint();
    hintRoom = r;
    const key = r + text;
    if (key !== hintKey) { hintKey = key; $('.hic', hintEl).innerHTML = ic; $('.ht', hintEl).innerHTML = text; hintEl.classList.remove('pop'); void hintEl.offsetWidth; hintEl.classList.add('pop'); }
    hintEl.hidden = !!room;
  }

  // ---------- live numbers ----------
  let ipm = 0, lastE = null, lastT = null;
  function live() {
    const g = G();
    $('.cashv', hud).textContent = M(g.cash);
    $('.rlv', hud).textContent = S.restaurantLv(g);
    // income: a running average of the last minute or so
    if (lastE == null) { lastE = g.stats.earned; lastT = g.t; }
    if (g.t - lastT >= 2) { const r = (g.stats.earned - lastE) / (g.t - lastT) * 60; ipm = ipm ? ipm + (r - ipm) * 0.2 : r; lastE = g.stats.earned; lastT = g.t; $('.ipm', hud).textContent = `${M(ipm)}/min`; }
    for (const b of root.querySelectorAll('[data-cost]')) { const c = +b.dataset.cost; const no = g.cash + 1e-9 < c; if (b.disabled !== no && !b.dataset.locked) b.disabled = no; }
    if (room) {
      const bd = S.building(g, room);
      const u = body.querySelector('[data-live="build"]'), eta = body.querySelector('[data-live="eta"]');
      if (bd && u) { u.style.width = pct(Math.min(1, (g.t - bd.t0) / Math.max(0.01, bd.dur))); eta.textContent = `${secs(Math.max(0, bd.t0 + bd.dur - g.t))} left`; }
    }
    updateHint();
  }

  // ---------- cards ----------
  function story(i = 0, onDone) {
    const c = STORY[i];
    const m = modal(`<div class="storyimg"><img src="${ART(c.img)}" alt="" onerror="this.parentNode.classList.add('noimg')">${c.ferdi ? FERDI : ''}</div><h2>${c.title}</h2><p>${c.text}</p>
      <button class="btn big" data-x="next">${i < STORY.length - 1 ? 'Next' : 'Open the doors'}</button>`, { cls: 'story', pause: true });
    m.card.querySelector('[data-x="next"]').addEventListener('click', () => {
      m.close(); sfx('ui-tap', { vol: 0.5 });
      if (i < STORY.length - 1) setTimeout(() => story(i + 1, onDone), 180);
      else { G().seen.intro = true; game.save(); onDone?.(); }
    });
  }
  function built(r, lv) {
    const R = S.ROOMS[r];
    if (lv === 1 && BUILT_TEXT[r]) toast(`${ICON('ui-wrench')} ${R.name} repaired!`, 'good');
    else toast(`${ICON('ui-building')} ${R.name} is now Lv ${lv}!`, 'good');
    if (r === 'office') toast(`${ICON('ui-star')} Restaurant level ${lv}: every room can go to Lv ${lv + 1}`, 'warn');
    if (room === r) renderRoom();
  }
  function away(r) {
    const h = Math.floor(r.secs / 3600), m = Math.round((r.secs % 3600) / 60);
    const t = h ? `${h} h ${m} min` : `${m} min`;
    const mm = modal(`<div class="storyimg"><img src="${ART('away')}" alt=""></div><h2>While you were away</h2>
      <p>You were gone for <b>${t}</b>. Ferdi's kept going:</p>
      <div class="awaygrid"><span>${ICON('ui-cash')}<b>${M(r.earned)}</b><small>earned</small></span><span>${ICON('ui-people')}<b>${r.served}</b><small>served</small></span><span>${ICON('ui-clock')}<b>${r.lost}</b><small>walked away</small></span></div>
      ${r.built.length ? `<p class="small">Finished: ${r.built.map((b) => `${S.ROOMS[b.room].name} Lv ${b.lv}`).join(', ')}</p>` : ''}
      ${r.capped ? `<p class="small">(The restaurant runs for ${S.AWAY.max / 3600} hours at most while you're away.)</p>` : ''}
      <button class="btn big" data-x="ok">Collect</button>`, { cls: 'awaycard', pause: true });
    mm.card.querySelector('[data-x="ok"]').addEventListener('click', () => { mm.close(); sfx('ui-coins'); });
  }
  function settings() {
    const s = G().settings;
    const m = modal(`<h2>Settings</h2>
      <div class="set"><span>Music</span><button class="btn sm ${s.music ? 'green' : 'ghost'}" data-s="music">${s.music ? 'On' : 'Off'}</button></div>
      <div class="set"><span>Sounds</span><button class="btn sm ${s.sfx ? 'green' : 'ghost'}" data-s="sfx">${s.sfx ? 'On' : 'Off'}</button></div>
      ${app ? `<div class="set"><span>Vibration</span><button class="btn sm ${s.haptics ? 'green' : 'ghost'}" data-s="haptics">${s.haptics ? 'On' : 'Off'}</button></div>` : ''}
      <div class="set"><span>Graphics</span><button class="btn sm blue" data-s="quality">${s.quality}</button></div>
      <button class="btn ghost" data-s="story">${FERDI}Read Uncle Ferdi's letter again</button>
      <button class="btn ghost danger" data-s="reset">Start over</button>
      <p class="small">Prototype: the building, phase 1 of the remake. ${app ? '' : '<a class="link" href="idle3.html">Idle Restaurant Manager</a> · <a class="link" href="index.html">The courier game</a>'}</p>
      <button class="btn big" data-x="close">Done</button>`, { cls: 'settings', dismiss: true });
    m.card.addEventListener('click', (e) => {
      const b = e.target.closest('[data-s]'); if (!b) return;
      const k = b.dataset.s;
      if (k === 'music' || k === 'sfx' || k === 'haptics') { s[k] = s[k] ? 0 : (k === 'music' ? 0.5 : 1); if (k === 'haptics') s[k] = !!s[k]; }
      else if (k === 'quality') s.quality = { auto: 'high', high: 'medium', medium: 'low', low: 'auto' }[s.quality];
      else if (k === 'story') { m.close(); story(); return; }
      else if (k === 'reset') { if (b.dataset.sure) { game.reset(); return; } b.dataset.sure = '1'; b.textContent = 'Tap again to erase everything'; return; }
      game.applySettings(); game.save(); m.close(); settings();
    });
    m.card.querySelector('[data-x="close"]').addEventListener('click', () => m.close());
  }

  // ---------- clicks ----------
  root.addEventListener('click', (e) => {
    const el = e.target.closest('[data-act]'); if (!el) return;
    const a = el.dataset.act;
    if (a === 'close') { closeRoom(); sfx('ui-back', { vol: 0.4 }); }
    else if (a === 'room') game.openRoom(el.dataset.room);
    else if (a === 'hint') { if (hintRoom) game.openRoom(hintRoom); }
    else if (a === 'settings') settings();
    else if (a === 'item' || a === 'up') {
      if (game.act(a, el.dataset.room, el.dataset.id)) { el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump'); }
    }
  });

  Object.defineProperty(api, 'room', { get: () => room }); // (the open room, or null)
  Object.assign(api, {
    toast, modal, story, built, away, live, openRoom, closeRoom, renderRoom,
    hired(s) { toast(`${ICON(s.role === 'cook' ? 'char-male-d' : s.role === 'waiter' ? 'char-female-b' : 'ui-cash')} ${s.name} joins as a ${s.role}!`, 'good'); },
    youFree() { toast(`${ICON('char-male-c')} Nobody needs you on the floor: off to the office!`, 'warn'); },
  });
  return api;
}

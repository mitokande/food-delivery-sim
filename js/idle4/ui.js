// Ferdi's (idle4.html): the interface. The top bar (you, the restaurant's level, income, the team, cash), the clock
// (the rushes), the event on now in a banner under it, the buttons down the right side (settings, the mailbox, the
// events card, the managers card, the features still to come, locked), the quest bar at the bottom (one
// quest at a time: where it takes you, what holds it up, its reward to claim), the room panel that slides up when a
// room is tapped (what it holds, what to buy, its renovation), the mailbox and its letters, the story cards, the "while
// you were away" card, settings, toasts. Numbers that change every frame are patched by live(); renderRoom() rebuilds
// the panel.
import * as S from './sim.js';
import * as Q from './quests.js';
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
  ads: ICON('ui-pin'), training: ICON('ui-xp'), parasols: ICON('ui-sun'), lockers: ICON('ui-people'), coffee: ICON('food-coffee'), uniforms: ICON('ui-gift'),
  couriers: ICON('helmet'), motors: ICON('veh-zippy'), app: ICON('ui-route'), bags: ICON('ui-package'), tubs: ICON('ui-wrench'),
};
// the features of the later phases, locked for now (the restaurant level they're planned to open at)
const FEATURES = [
  { f: 'map', name: 'City map', icon: 'ui-pin', lv: 4 },
  { f: 'shop', name: 'Shop', icon: 'ui-gem', lv: 2 },
];
const MAIL_ICON = '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M3 6.5A2.5 2.5 0 0 1 5.5 4h13A2.5 2.5 0 0 1 21 6.5v11a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 17.5zm2.2-.3 6.8 5.3 6.8-5.3zM19 8.3l-7 5.4-7-5.4v9.2c0 .3.2.5.5.5h13c.3 0 .5-.2.5-.5z"/></svg>';
const STAFF = { cooks: 1, waiters: 1, registers: 1, couriers: 1 };
function effect(G, room, id) {
  const it = S.ROOMS[room].items[id], n = S.itemOf(G, room, id), st = S.STEP[id];
  const plus = (k) => `+${Math.round(st * k * 100)}%`;
  switch (id) {
    case 'benches': return [`${n * 2} waiting seats`, `${n * 2 + 2}`];
    case 'tables': return [`${n * 2} seats`, `${n * 2 + 2}`];
    case 'waiters': case 'cooks': case 'registers': return [`${n} at work`, `${n + 1}`];
    case 'couriers': return [`${n} riding`, `${n + 1}`];
    case 'motors': { const t = (L) => secs(S.DELIVERY.ride * Math.pow(1 - st, L)); return [`a ride takes ${t(n)}`, t(n + 1)]; }
    case 'tubs': { const t = (L) => secs(S.CLEAR * Math.pow(1 - st, L)); return [`clearing a table: ${t(n)}`, t(n + 1)]; }
    case 'speed': { const t = (L) => S.CHECKOUT * Math.pow(1 - S.STEP.speed, L); return [`paying takes ${secs(t(n))}`, secs(t(n + 1))]; }
    case 'decor': return [`wait ${Math.round(S.PATIENCE.bench * (1 + st * n))}s on a bench`, `${Math.round(S.PATIENCE.bench * (1 + st * (n + 1)))}s`];
    case 'lockers': return [`room for ${S.STAFF_BASE + n} on the team`, `${S.STAFF_BASE + n + 1}`];
    case 'uniforms': { const c = (L) => `${Math.round(S.TIPS.chance * (1 + st * L) * 100)}%`; return [`${c(n)} leave a tip`, c(n + 1)]; }
    default: break;
  }
  if (it.kind === 'st') {
    const d = S.DISH[it.dish];
    if (!n) return [`Adds <b>${d.name}</b> to the menu`, `$${d.price}`];
    const p = (L) => M(d.price * S.stPrice(L)), t = (L) => secs(S.stTime(it.dish, L));
    return [`${p(n)} a plate · ${t(n)}`, `${p(n + 1)} · ${t(n + 1)}`];
  }
  return [`${plus(n)} ${{ sign: 'walk-ins', ads: 'walk-ins', comfort: 'price', service: 'waiter speed', ledger: 'all prices', training: 'staff speed', upsell: 'at the register', parasols: 'price outside', coffee: 'walking speed', app: 'delivery orders', bags: 'a delivery' }[id] || ''}`, plus(n + 1)];
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
  staff: 'The staff room is open: every locker you put in is room for one more on the team.',
};
const BLOCK_TEXT = {
  office: (G) => `Upgrade Ferdi's Office to Lv ${S.officeLv(G) + 1} first`,
  build: () => 'Another room is being worked on',
  gate: (G, room) => `Needs restaurant level ${S.ROOMS[room].gate}`,
  max: () => 'As good as it gets (for now)',
  soon: (G, room) => `Coming in a later update (${S.ROOMS[room].soon})`,
};
const STAFF_ROOM = (G) => (S.lvOf(G, 'staff') ? 'add a locker in the Staff Room' : 'repair the Staff Room');

export function createUI(game) {
  const G = () => game.G;
  const root = document.getElementById('ui');
  root.innerHTML = `
  <div id="hud" class="hud4">
    <header class="top">
      <button class="me" data-act="room" data-room="office" aria-label="Ferdi's Office"><span class="ava">${ICON('char-male-c')}</span><span class="lvb"><b class="rlv">1</b></span></button>
      <span class="name"><b>Ferdi's</b><small class="ipm">$0/min</small></span>
      <button class="res team" data-act="room" data-room="staff" aria-label="The team">${ICON('ui-people')}<b class="teamv">0/5</b></button>
      <span class="res cash">${ICON('ui-cash')}<b class="cashv">$0</b></span>
    </header>
    <button class="clock" data-act="events" aria-label="The clock"><span class="cic"></span><b class="clk">08:00</b><small class="rush"></small></button>
    <button class="evbar" data-act="evfocus" hidden></button>
    <nav class="side">
      <button class="slot gear" data-act="settings" aria-label="Settings">${GEAR}</button>
      <button class="slot mail" data-act="mail" aria-label="Mailbox"><span class="sic">${MAIL_ICON}</span><i class="badge" hidden></i><small>Mail</small></button>
      <button class="slot events locked" data-act="events" aria-label="Events">${ICON('ui-calendar')}<i class="lock">${ICON('ui-lock')}</i><i class="badge" hidden>!</i><small>Lv ${S.EVENT_LV}</small></button>
      <button class="slot managers locked" data-act="managers" aria-label="Managers">${ICON('char-male-f')}<i class="lock">${ICON('ui-lock')}</i><i class="badge" hidden></i><small>Lv ${S.MGR_LV}</small></button>
      ${FEATURES.map((f) => `<button class="slot locked" data-act="locked" data-f="${f.f}" aria-label="${f.name} (locked)">${ICON(f.icon)}<i class="lock">${ICON('ui-lock')}</i><small>Lv ${f.lv}</small></button>`).join('')}
    </nav>
    <button class="quest" data-act="quest"><span class="qic"></span><span class="qt"><b class="qtext"></b><small class="qhelp"></small><span class="qbar"><u></u></span></span><span class="qr"></span></button>
    <section id="sheet" class="rsheet" data-state="closed">
      <div class="sh-head"></div>
      <div class="sh-body"></div>
    </section>
  </div>
  <div id="modals"></div>
  <div id="toasts"></div>`;
  const hud = $('#hud'), sheet = $('#sheet'), head = $('.sh-head', sheet), body = $('.sh-body', sheet), modals = $('#modals'), toasts = $('#toasts'), questEl = $('.quest', hud);
  const sfx = (n, o) => game.audio?.play(n, o);
  let room = null; // the open room
  let questGo = null; // where a tap on the quest bar takes you
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
      : S.itemBlock(g, r, id) === 'staff' ? `<button class="btn sm buy teamfull" data-act="room" data-room="staff"><small>Team full</small><b>${ICON('ui-people')}</b></button>`
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
      if (S.MANAGERS[room]) html += mgrRow(g, room);
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

  // ---------- managers ----------
  const MGR_IC = (room) => ICON('char-' + S.MANAGERS[room].char);
  // the manager's line in a room's panel: hire, or what they do and their switch
  function mgrRow(g, room) {
    const m = S.MANAGERS[room], on = S.hasMgr(g, room);
    if (on) return `<div class="mgrrow on"><span class="mi">${MGR_IC(room)}</span><span class="mt"><b>${m.name} · ${m.title}</b><small>${m.what}${g.mgr[room].auto ? '. Buys things here for you' : ''}</small></span>
      <button class="btn sm ${g.mgr[room].auto ? 'green' : 'ghost'} auto" data-act="mgrauto" data-room="${room}"><small>Buys for you</small><b>${g.mgr[room].auto ? 'ON' : 'OFF'}</b></button></div>`;
    if (S.restaurantLv(g) < S.MGR_LV) return `<div class="mgrrow locked"><span class="mi">${ICON('ui-lock')}</span><span class="mt"><b>A manager</b><small>Managers come at restaurant level ${S.MGR_LV}</small></span></div>`;
    return `<div class="mgrrow"><span class="mi">${MGR_IC(room)}</span><span class="mt"><b>Hire ${m.name}, ${m.title.toLowerCase()}</b><small>${m.what}, and buys things here for you</small></span>
      <button class="btn gold sm buy" data-act="mgr" data-room="${room}" data-cost="${m.cost}"><small>Hire</small><b>${M(m.cost)}</b></button></div>`;
  }
  function managersCard() {
    const g = G();
    if (S.restaurantLv(g) < S.MGR_LV) { toast(`${ICON('ui-lock')} Managers: opens at restaurant level ${S.MGR_LV}`); sfx('ui-error', { vol: 0.4 }); return; }
    const rows = Object.keys(S.MANAGERS).map((room) => {
      const m = S.MANAGERS[room], R = S.ROOMS[room], on = S.hasMgr(g, room), open = S.lvOf(g, room) > 0;
      const act = on ? `<button class="btn sm ${g.mgr[room].auto ? 'green' : 'ghost'} auto" data-act="mgrauto" data-room="${room}"><small>Buys for you</small><b>${g.mgr[room].auto ? 'ON' : 'OFF'}</b></button>`
        : open ? `<button class="btn gold sm buy" data-act="mgr" data-room="${room}" data-cost="${m.cost}" ${g.cash >= m.cost ? '' : 'disabled'}><small>Hire</small><b>${M(m.cost)}</b></button>`
        : `<span class="why">Repair the ${R.name} first</span>`;
      return `<div class="mgrrow ${on ? 'on' : ''}"><span class="mi">${MGR_IC(room)}</span><span class="mt"><b>${m.name} · ${m.title}</b><small>${R.name}: ${m.what}</small></span>${act}</div>`;
    }).join('');
    const mm = modal(`<h2>${ICON('char-male-f')} Managers</h2><p class="small">One for each room. Each one helps the room, and buys its things for you when they cost at most half your cash (switch it off to save up).</p>
      <div class="mgrlist">${rows}</div><button class="btn big" data-x="close">Close</button>`, { cls: 'managerscard', dismiss: true });
    mm.card.addEventListener('click', (e) => {
      const b = e.target.closest('[data-act]');
      if (b && (b.dataset.act === 'mgr' || b.dataset.act === 'mgrauto')) { e.stopPropagation(); if (game.act(b.dataset.act === 'mgr' ? 'mgr' : 'auto', b.dataset.room)) { mm.close(); managersCard(); } return; }
      if (e.target.closest('[data-x="close"]')) mm.close();
    });
  }

  // ---------- the day, the events ----------
  const hhmm = (h) => `${String(Math.floor(h)).padStart(2, '0')}:${String(Math.floor((h % 1) * 60 / 15) * 15).padStart(2, '0')}`;
  const RUSH = { lunch: 'Lunch rush', dinner: 'Dinner rush', night: 'Night' };
  const mmss = (t) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
  const EV = {
    threat: { icon: '🚚', title: 'Victor\'s truck is coming', cls: 'threat' },
    critic: { icon: '★', title: 'A food critic is here', cls: 'critic' },
    star: { icon: '✦', title: 'A celebrity walked in', cls: 'star' },
    inspector: { icon: '✚', title: 'Health inspection', cls: 'inspector' },
    van: { icon: '🚐', title: 'A tour van stopped', cls: 'van' },
  };
  const MOD = { truck: 'Victor\'s truck outside', review: 'The review', fans: 'Fans', gossip: 'Bad gossip', grade: 'A on the door' };
  const pctMod = (x) => `${x >= 1 ? '+' : '−'}${Math.round(Math.abs(x - 1) * 100)}% walk-ins`;
  // the banner's line under the title, for the event on now
  function evLine(g, e) {
    if (e.kind === 'threat') { const n = Math.min(e.need, g.stats.served - e.base); return [`Serve ${e.need} before it gets here: <b>${n}/${e.need}</b>`, n / e.need, Math.max(0, e.t0 + e.dur - g.t)]; }
    const c = g.cust.find((x) => x.id === e.cust);
    if (e.kind === 'van') return [`${S.EVENTS.van} tourists, all hungry at once`, Math.min(1, (g.t - e.t0) / e.dur), null];
    if (e.kind === 'inspector') return [c?.st === 'inspect' ? 'Looking round the kitchen…' : 'On the way to the kitchen', c?.st === 'inspect' ? Math.min(1, (g.t - c.t0) / c.dur) : 0, null];
    const st = !c ? '' : c.st === 'wait' ? `Waiting for the food: ${Math.round(g.t - c.t0)}s` : c.st === 'eat' ? 'Eating…' : c.st === 'bench' ? 'Waiting for a table!' : c.st === 'go' && !c.seat ? 'At the door' : '';
    return [`${e.kind === 'critic' ? 'Serve them fast: the stars count the seconds' : `Pays ${S.STAR_PAYS}× and tips big; fans follow`}${st ? ` · ${st}` : ''}`, c?.st === 'wait' ? Math.min(1, (g.t - c.t0) / 45) : 0, null];
  }
  let evKey = '';
  function updateEvents(g) {
    // the clock
    const h = S.hourOf(g), rush = S.rushOf(g), night = h < 6 || h >= 20.5;
    const ck = $('.clk', hud), ct = hhmm(h);
    if (ck.textContent !== ct) { ck.textContent = ct; $('.rush', hud).textContent = RUSH[rush] || ''; $('.clock', hud).className = `clock ${rush || ''}`; $('.cic', hud).innerHTML = ICON(night ? 'ui-moon' : 'ui-sun'); }
    // the events and managers buttons
    const on = S.restaurantLv(g) >= S.EVENT_LV, eb = $('.slot.events', hud);
    eb.classList.toggle('locked', !on); $('.lock', eb).hidden = on; $('small', eb).textContent = on ? 'Events' : `Lv ${S.EVENT_LV}`;
    $('.badge', eb).hidden = !g.event;
    const mon = S.restaurantLv(g) >= S.MGR_LV, mb = $('.slot.managers', hud), canHire = mon && Object.keys(S.MANAGERS).some((r) => S.mgrOpen(g, r) && g.cash >= S.MANAGERS[r].cost);
    mb.classList.toggle('locked', !mon); $('.lock', mb).hidden = mon; $('small', mb).textContent = mon ? 'Managers' : `Lv ${S.MGR_LV}`;
    $('.badge', mb).hidden = !canHire; $('.badge', mb).textContent = canHire ? '!' : '';
    // the banner: the event on now, else a boost or a slump
    const bar = $('.evbar', hud), e = g.event, mod = g.mods.find((m) => g.t < m.until);
    if (e) {
      const [line, f, left] = evLine(g, e), d = EV[e.kind];
      const k = `${e.id}|${line}|${left == null ? '' : Math.ceil(left)}`;
      if (k !== evKey) { evKey = k; bar.className = `evbar ${d.cls}`; bar.innerHTML = `<span class="ei">${d.icon}</span><span class="et"><b>${d.title}${left != null ? ` <i>${mmss(left)}</i>` : ''}</b><small>${line}</small><span class="ebar"><u style="width:${pct(f)}"></u></span></span>`; }
      bar.hidden = !!room;
    } else if (mod) {
      const k = `m|${mod.why}|${Math.ceil(mod.until - g.t)}`;
      if (k !== evKey) { evKey = k; bar.className = `evbar mod ${mod.x >= 1 ? 'up' : 'down'}`; bar.innerHTML = `<span class="ei">${mod.x >= 1 ? '▲' : '▼'}</span><span class="et"><b>${MOD[mod.why] || 'Boost'} <i>${mmss(mod.until - g.t)}</i></b><small>${pctMod(mod.x)}</small></span>`; }
      bar.hidden = !!room;
    } else bar.hidden = true;
  }
  // the events card: the day, what's on, boosts, what happened
  function eventsCard() {
    const g = G();
    if (S.restaurantLv(g) < S.EVENT_LV) { toast(`${ICON('ui-lock')} Events: opens at restaurant level ${S.EVENT_LV}`); sfx('ui-error', { vol: 0.4 }); return; }
    const h = S.hourOf(g), e = g.event;
    const segs = [[12, 14.5, 'lunch'], [19, 21.5, 'dinner'], [0, 6, 'night'], [20.5, 24, 'night']].map(([a, b, k]) => `<i class="${k}" style="left:${pct(a / 24)};width:${pct((b - a) / 24)}"></i>`).join('');
    let now = '<p class="small">Nothing on right now. Something happens every few minutes.</p>';
    if (e) {
      const [line] = evLine(g, e), d = EV[e.kind];
      now = `<div class="evcard ${d.cls}"><b>${d.icon} ${d.title}</b><small>${line}</small>
        ${e.kind === 'threat' ? `<button class="btn ${g.cash >= e.cost ? 'gold' : ''}" data-x="repel" ${g.cash >= e.cost ? '' : 'disabled'}>Pay to move it on · ${M(e.cost)}</button>` : ''}</div>`;
    }
    const mods = g.mods.filter((m) => g.t < m.until).map((m) => `<li class="${m.x >= 1 ? 'up' : 'down'}">${MOD[m.why] || 'Boost'}: ${pctMod(m.x)} · ${mmss(m.until - g.t)}</li>`).join('');
    const RES = (r) => r.kind === 'threat' ? (r.paid ? `Victor's truck moved on (paid ${M(r.paid)})` : r.ok ? `Victor's truck turned round${r.cash ? ` · +${M(r.cash)}` : ''}` : 'Victor\'s truck parked outside')
      : r.kind === 'critic' ? `Critic: ${'★'.repeat(r.stars)}${'☆'.repeat(5 - r.stars)}${r.cash ? ` · +${M(r.cash)}` : ''}`
      : r.kind === 'star' ? (r.ok ? 'A celebrity loved it: fans are coming' : 'A celebrity walked out') : r.kind === 'inspector' ? `Inspection: grade ${r.grade}${r.cash ? ` · +${M(r.cash)}` : ''}` : 'A tour van came by';
    const m = modal(`<h2>${ICON('ui-calendar')} Day ${S.dayOf(g)} · ${hhmm(h)}</h2>
      <div class="daybar">${segs}<u style="left:${pct(h / 24)}"></u></div>
      <p class="small daykey"><i class="lunch"></i>Lunch 12–14:30 <i class="dinner"></i>Dinner 19–21:30: twice the people · <i class="night"></i>quiet nights</p>
      ${now}
      ${mods ? `<ul class="mods">${mods}</ul>` : ''}
      ${g.evLog.length ? `<h3>Lately</h3><ul class="evlog">${g.evLog.map((r) => `<li class="${r.ok ? 'ok' : 'no'}">${RES(r)}</li>`).join('')}</ul>` : ''}
      <button class="btn big" data-x="close">Close</button>`, { cls: 'eventscard', dismiss: true });
    m.card.addEventListener('click', (ev) => {
      if (ev.target.closest('[data-x="repel"]')) { m.close(); game.repel(); }
      else if (ev.target.closest('[data-x="close"]')) m.close();
    });
    sfx('ui-open', { vol: 0.5 });
  }
  // a note when an event starts or ends
  function eventNote(x) {
    const d = EV[x.e.kind];
    if (x.on === 'start') {
      const t = { threat: 'Victor\'s food truck is on its way! Serve fast to keep your customers', critic: 'A food critic just walked in!', star: 'A celebrity is here!', inspector: 'The health inspector is here', van: 'A tour van just stopped outside!' }[x.e.kind];
      toast(`<b class="evi">${d.icon}</b> ${t}`, x.e.kind === 'threat' ? 'bad' : 'warn');
      return;
    }
    const r = x.res;
    const t = x.e.kind === 'threat' ? (r.paid ? 'The truck moved on' : r.ok ? `Victor's truck turned round! +${M(r.cash)}` : 'Victor\'s truck parked across the street…')
      : x.e.kind === 'critic' ? `The review: ${'★'.repeat(r.stars)}${'☆'.repeat(5 - r.stars)}${r.cash ? ` +${M(r.cash)}` : ''}`
      : x.e.kind === 'star' ? (r.ok ? 'The celebrity loved it: fans are on their way!' : 'The celebrity walked out…')
      : x.e.kind === 'inspector' ? `Inspection: grade ${r.grade}${r.cash ? ` +${M(r.cash)}` : ''}` : 'The tourists are back on their van';
    if (x.e.kind !== 'van') toast(`<b class="evi">${d.icon}</b> ${t}`, r.ok ? 'good' : 'bad');
  }

  // ---------- advice: what holds the restaurant back now → [room, text] ----------
  function advice(g) {
    const d = S.diagnose(g).kind;
    if (d === 'food') return ['kitchen', 'Tables wait for their food: upgrade the Kitchen'];
    if (d === 'plates') return ['dining', 'Plates wait on the pass: more or faster waiters'];
    if (d === 'seats') return ['dining', 'People walk past: you need more tables'];
    if (d === 'pay') return ['cashier', 'A line to pay: the Cashier needs help'];
    if (d === 'quiet') return ['entrance', 'Empty tables: a better sign brings people in'];
    return null;
  }
  // what stands between you and the quest → [room, text] or null
  function questHelp(g, q) {
    const room = q.room;
    const roomBlock = (r, lv) => {
      if (S.building(g, r)) return [r, 'Being worked on'];
      if (g.build) return [g.build.room, 'Another room is being worked on'];
      const b = S.upBlock(g, r);
      if (b === 'gate') return ['office', `Needs restaurant level ${S.ROOMS[r].gate}: upgrade Ferdi's Office`];
      if (b === 'office') return ['office', `Upgrade Ferdi's Office to Lv ${S.officeLv(g) + 1} first`];
      if (b === 'items') { const [a, o] = S.readiness(g, r); return [r, `Max out everything in the ${S.ROOMS[r].name} first (${a}/${o})`]; }
      if (!b && lv) return [r, lv === 1 && !S.lvOf(g, r) ? 'Ready to repair' : 'Ready to renovate'];
      return null;
    };
    if (q.k === 'lv') return roomBlock(room, q.n);
    if (q.k === 'item') {
      if (!S.lvOf(g, room)) return roomBlock(room, 1) || [room, `Repair the ${S.ROOMS[room].name} first`];
      if (S.capOf(g, room, q.id) < q.n) return roomBlock(room, S.lvOf(g, room) + 1);
      if (S.itemBlock(g, room, q.id) === 'staff') return ['staff', `The team is full: ${STAFF_ROOM(g)}`];
      return null;
    }
    if (q.k === 'staff' && S.staffCount(g) >= S.staffCap(g)) return ['staff', `The team is full: ${STAFF_ROOM(g)}`];
    if (q.k === 'staff') return [S.nCooks(g) <= S.nWaiters(g) ? 'kitchen' : 'dining', 'Hire cooks and waiters'];
    if (q.k === 'tips') return g.tips.length ? null : ['dining', 'Tips turn up by the chairs: tap them'];
    if (q.k === 'letters') return S.unread(g) ? ['mail', 'Tap the mailbox by the front door'] : null;
    if (q.k === 'served') return advice(g);
    if (q.k === 'threats') return S.restaurantLv(g) < S.EVENT_LV ? ['office', `Events start at restaurant level ${S.EVENT_LV}`] : g.event?.kind === 'threat' ? ['events', 'Serve fast: the truck is coming!'] : ['events', 'Victor\'s truck comes now and then: be ready'];
    if (q.k === 'managers') return S.restaurantLv(g) < S.MGR_LV ? ['office', `Managers come at restaurant level ${S.MGR_LV}`] : ['managers', 'Hire them in the Managers card'];
    if (q.k === 'delivered') return !S.lvOf(g, 'bay') ? ['bay', 'Open the Courier Bay first'] : !S.nCouriers(g) ? ['bay', 'Hire a courier'] : null;
    if (q.k === 'stars') return g.event?.kind === 'critic' ? ['events', 'The critic is here: serve them fast!'] : ['events', 'Critics come now and then: fast food, more stars'];
    return null;
  }
  const QICON = { item: (q) => (q.id?.startsWith('st:') ? DICON(q.id.slice(3)) : ITEM_ICON[q.id] || ICON('ui-star')), lv: () => ICON('ui-building'), served: () => ICON('ui-people'),
    tips: () => ICON('ui-coin'), letters: () => `<span class="mic">${MAIL_ICON}</span>`, staff: () => ICON('ui-people'), menu: () => ICON('food-burger'),
    threats: () => '<b class="qemo">🚚</b>', stars: () => ICON('ui-star'), delivered: () => ICON('helmet'), managers: () => ICON('char-male-f') };
  let questKey = '';
  function updateQuest() {
    const g = G(), q = Q.current(g), [a, n] = Q.progress(g, q), done = a >= n;
    const help = done ? null : questHelp(g, q);
    questGo = done ? null : help ? help[0] : q.room;
    const key = [g.quest.i, a, done, help?.[1]].join('|');
    if (key !== questKey) {
      const fresh = !questKey.startsWith(g.quest.i + '|');
      questKey = key;
      $('.qic', questEl).innerHTML = (QICON[q.k] || QICON.lv)(q);
      $('.qtext', questEl).innerHTML = `${q.text} <i>(${a.toLocaleString('en-US')}/${n.toLocaleString('en-US')})</i>`;
      $('.qhelp', questEl).textContent = help ? help[1] : '';
      $('.qbar u', questEl).style.width = pct(n ? a / n : 0);
      $('.qr', questEl).innerHTML = done ? `<span class="claim">Claim<b>${M(q.cash)}</b></span>` : `${ICON('ui-cash')}<b>${M(q.cash)}</b>`;
      questEl.classList.toggle('done', done);
      if (fresh) { questEl.classList.remove('pop'); void questEl.offsetWidth; questEl.classList.add('pop'); }
    }
    questEl.hidden = !!room;
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
    // the team, the mailbox, the locked features
    const tv = `${S.staffCount(g)}/${S.staffCap(g)}`, te = $('.teamv', hud);
    if (te.textContent !== tv) { te.textContent = tv; te.parentNode.classList.toggle('full', S.staffCount(g) >= S.staffCap(g)); }
    const nm = S.unread(g), bd = $('.slot.mail .badge', hud);
    if (+bd.textContent !== nm || bd.hidden !== !nm) { bd.hidden = !nm; bd.textContent = nm; }
    if (nm > lastMail && lastMail >= 0) { toast(`<span class="mic">${MAIL_ICON}</span> You've got mail!`, 'warn'); sfx('notif-order', { vol: 0.6 }); }
    lastMail = nm;
    if (room) {
      const bd = S.building(g, room);
      const u = body.querySelector('[data-live="build"]'), eta = body.querySelector('[data-live="eta"]');
      if (bd && u) { u.style.width = pct(Math.min(1, (g.t - bd.t0) / Math.max(0.01, bd.dur))); eta.textContent = `${secs(Math.max(0, bd.t0 + bd.dur - g.t))} left`; }
    }
    updateQuest();
    updateEvents(g);
  }
  let lastMail = -1;

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
  // what the restaurant earned while you were away (from the catch-up, or later from the mailbox): Collect takes it
  function away(r) {
    const h = Math.floor(r.secs / 3600), m = Math.round((r.secs % 3600) / 60);
    const t = h ? `${h} h ${m} min` : `${m} min`;
    const mm = modal(`<div class="storyimg"><img src="${ART('away')}" alt=""></div><h2>While you were away</h2>
      <p>You were gone for <b>${t}</b>. Ferdi's kept going, and the takings are in the mailbox:</p>
      <div class="awaygrid"><span>${ICON('ui-cash')}<b>${M(r.earned)}</b><small>earned</small></span><span>${ICON('ui-people')}<b>${r.served}</b><small>served</small></span><span>${ICON('ui-clock')}<b>${r.lost}</b><small>walked away</small></span></div>
      ${r.built?.length ? `<p class="small">Finished: ${r.built.map((b) => `${S.ROOMS[b.room].name} Lv ${b.lv}`).join(', ')}</p>` : ''}
      ${r.capped ? `<p class="small">(The restaurant runs for ${S.AWAY.max / 3600} hours at most while you're away.)</p>` : ''}
      <button class="btn big gold" data-x="ok">Collect ${M(r.earned)}</button>`, { cls: 'awaycard', pause: true });
    mm.card.querySelector('[data-x="ok"]').addEventListener('click', () => { mm.close(); if (r.mail != null) game.openMail(r.mail); else sfx('ui-coins'); });
  }
  // ---------- the mailbox ----------
  const mailFrom = (m) => (m.kind === 'away' ? 'Ferdi\'s' : S.LETTER[m.key]?.from || '');
  const mailTitle = (m) => (m.kind === 'away' ? 'While you were away' : S.LETTER[m.key]?.title || '');
  function mailbox() {
    const g = G(), list = [...g.mail].reverse().sort((a, b) => a.read - b.read);
    const mm = modal(`<h2><span class="mic big">${MAIL_ICON}</span> Mailbox</h2>
      ${list.length ? `<div class="mlist">${list.map((m) => `<button class="mrow ${m.read ? 'read' : ''}" data-m="${m.id}">
        <span class="mi">${m.kind === 'away' ? ICON('ui-cash') : m.key.startsWith('victor') ? `<img src="${ART('rival')}" alt="">` : m.key === 'ferdi' ? `<img src="${ART('ferdi')}" alt="">` : `<span class="mic">${MAIL_ICON}</span>`}</span>
        <span class="mt"><b>${mailTitle(m)}</b><small>${mailFrom(m)}</small></span>
        ${m.read ? '' : m.cash ? `<span class="gift">${ICON('ui-cash')}${M(m.cash)}</span>` : '<span class="gift new">New</span>'}</button>`).join('')}</div>`
        : '<p>No mail yet. People write as the restaurant grows.</p>'}
      <button class="btn big" data-x="close">Close</button>`, { cls: 'mailbox', dismiss: true });
    mm.card.addEventListener('click', (e) => {
      const b = e.target.closest('[data-m]');
      if (b) { mm.close(); setTimeout(() => letter(+b.dataset.m), 160); return; }
      if (e.target.closest('[data-x="close"]')) mm.close();
    });
    sfx('ui-open', { vol: 0.5 });
  }
  function letter(id) {
    const g = G(), m = g.mail.find((x) => x.id === id);
    if (!m) return;
    if (m.kind === 'away') { if (m.read) mailbox(); else away({ secs: m.secs, earned: m.cash, served: m.served, lost: m.lost, mail: m.id }); return; }
    const L = S.LETTER[m.key], pic = m.key.startsWith('victor') ? 'rival' : m.key === 'ferdi' ? 'ferdi' : null;
    const mm = modal(`<div class="letter">${pic ? `<img class="lpic" src="${ART(pic)}" alt="">` : ''}<small class="from">From: ${L.from}</small><h2>${L.title}</h2><p>${L.text}</p></div>
      <button class="btn big ${m.cash && !m.read ? 'gold' : ''}" data-x="ok">${m.cash && !m.read ? `Collect ${M(m.cash)}` : 'Close'}</button>`, { cls: 'lettercard', pause: !m.read });
    mm.card.querySelector('[data-x="ok"]').addEventListener('click', () => { mm.close(); if (!m.read) game.openMail(m.id); });
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
      <p class="small">Prototype: phase 4 of the remake (the courier bay, managers, clearing tables). ${app ? '' : '<a class="link" href="idle3.html">Idle Restaurant Manager</a> · <a class="link" href="index.html">The courier game</a>'}</p>
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
    else if (a === 'quest') {
      if (Q.done(G())) game.claimQuest();
      else if (questGo === 'mail') mailbox();
      else if (questGo === 'events') eventsCard();
      else if (questGo === 'managers') managersCard();
      else if (questGo) game.openRoom(questGo);
    }
    else if (a === 'mail') mailbox();
    else if (a === 'events') eventsCard();
    else if (a === 'managers') managersCard();
    else if (a === 'mgr' || a === 'mgrauto') game.act(a === 'mgr' ? 'mgr' : 'auto', el.dataset.room);
    else if (a === 'evfocus') { if (!game.world?.focusEvent()) eventsCard(); }
    else if (a === 'locked') {
      const f = FEATURES.find((x) => x.f === el.dataset.f);
      toast(`${ICON('ui-lock')} ${f.name}: ${S.restaurantLv(G()) < f.lv ? `opens at restaurant level ${f.lv}` : 'coming in a later update'}`);
      sfx('ui-error', { vol: 0.4 });
    }
    else if (a === 'settings') settings();
    else if (a === 'item' || a === 'up') {
      if (game.act(a, el.dataset.room, el.dataset.id)) { el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump'); }
    }
  });

  Object.defineProperty(api, 'room', { get: () => room }); // (the open room, or null)
  Object.assign(api, {
    toast, modal, story, built, away, mailbox, letter, eventsCard, eventNote, live, openRoom, closeRoom, renderRoom,
    claimed(q) { toast(`${ICON('ui-star')} Quest done: +${M(q.cash)}`, 'good'); questEl.classList.remove('pop'); void questEl.offsetWidth; questEl.classList.add('pop'); },
    hired(s) { toast(`${ICON(s.role === 'cook' ? 'char-male-d' : s.role === 'waiter' ? 'char-female-b' : s.role === 'courier' ? 'helmet' : 'ui-cash')} ${s.name} joins as a ${s.role}!`, 'good'); },
    managerJoined(room) { const m = S.MANAGERS[room]; toast(`${MGR_IC(room)} ${m.name} joins as ${m.title.toLowerCase()} of the ${S.ROOMS[room].name}!`, 'good'); },
    managersCard,
    youFree() { toast(`${ICON('char-male-c')} Nobody needs you on the floor: off to the office!`, 'warn'); },
  });
  return api;
}

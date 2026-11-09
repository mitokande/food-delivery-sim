// Hot Chain (idle2.html): the interface. Top bar, the day's clock and stars, the "what's stuck" banner, the bottom
// sheet (Kitchens, Couriers, Day), cards. Numbers that change every frame are patched by live(); render() rebuilds a tab.
import * as S from './sim.js';
import { FOODS, RESTAURANTS } from '../data.js';

export const ICON = (n, cls = '') => `<img class="ic ${cls}" src="assets/icons/${n}.webp" alt="" draggable="false" onerror="this.onerror=null;this.src='assets/icons/${n}.png'">`;
const VICON = (id) => `<img class="ic" src="assets/icons/veh-${id}.png" alt="" draggable="false">`; // (vehicle icons are png only)
const $ = (sel, root = document) => root.querySelector(sel);
const M = S.money;
const NAME = Object.fromEntries(RESTAURANTS.map((r) => [r.id, r.name]));
const FOOD = Object.fromEntries(RESTAURANTS.map((r) => [r.id, r.food]));
const FICON = (id) => ICON(FOODS[FOOD[id]].icon);
const clockStr = (m) => `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(Math.floor(m % 60)).padStart(2, '0')}`;
const mmss = (s) => { const n = Math.max(0, Math.ceil(s)); return `${Math.floor(n / 60)}:${String(n % 60).padStart(2, '0')}`; };
const perMin = (n) => `${(Math.round(n * 10) / 10).toString()}/min`;
const GEAR = '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M19.4 13a7.6 7.6 0 0 0 0-2l2.1-1.6-2-3.5-2.5 1a7.4 7.4 0 0 0-1.7-1L15 3.3h-4l-.4 2.6a7.4 7.4 0 0 0-1.7 1l-2.5-1-2 3.5L6.6 11a7.6 7.6 0 0 0 0 2l-2.1 1.6 2 3.5 2.5-1c.5.4 1.1.7 1.7 1l.4 2.6h4l.4-2.6c.6-.3 1.2-.6 1.7-1l2.5 1 2-3.5zM13 15.5A3.5 3.5 0 1 1 13 8.5a3.5 3.5 0 0 1 0 7z" transform="translate(-1 0)"/></svg>';
const VDESC = {
  zippy: 'Carries 1 order. Cheap, quick through the alleys.',
  vespetta: 'Carries 2 from the same kitchen. Faster. Pays when food piles up.',
  mule: 'Carries 4. Slow, and the last door gets it colder.',
};
const STATUS = { idle: 'at the stand', go: 'to the kitchen', drop: 'delivering', home: 'riding back' };

export function createChainUI(game) {
  let G = game.G;
  const root = document.getElementById('ui');
  root.innerHTML = `
  <div id="hubui" class="idle chain">
    <header class="topbar">
      <button class="who" data-act="tab" data-tab="day"><span class="ava">${ICON('char-male-c')}</span>
        <span class="lvlbox"><small class="nm">${S.STAGE.name}</small><span class="ipsbar"><b class="ips">$0/min</b></span></span></button>
      <span class="res cash">${ICON('ui-cash')}<b class="cashv">$0</b></span>
      <button class="gear" data-act="settings" aria-label="Settings">${GEAR}</button>
    </header>
    <div class="clockbar"><span class="clockchip"><span class="tod"></span><b class="clock">09:00</b><span class="day left"></span></span><span class="rush" hidden></span></div>
    <div class="hud2">
      <button class="starbar" data-act="tab" data-tab="day" aria-label="Hot deliveries and stars">
        <span class="sb-track"><u class="sb-fill"></u>${S.STAGE.stars.map((s, i) => `<i class="sb-tick" style="left:${(s / S.STAGE.stars[2] * 100).toFixed(1)}%" data-i="${i}">${ICON('ui-star')}</i>`).join('')}</span>
        <span class="sb-text">${ICON('ui-thermo')}<b class="hotn">0</b> hot</span>
      </button>
      <button class="neckb" data-act="neck"><span class="nt"></span></button>
    </div>
    <section id="sheet" class="sheet" data-state="mid"><div class="sheet-rib ribwrap" data-act="grab"><span class="ribbon"></span></div><div class="grab" data-act="grab"><i></i></div><div class="sheet-body"></div></section>
    <nav class="tabs">
      <button data-act="tab" data-tab="kitchens">${ICON('ui-building')}<span>Kitchens</span><i class="dot" hidden></i></button>
      <button data-act="tab" data-tab="fleet">${ICON('ui-people')}<span>Couriers</span><i class="dot" hidden></i></button>
      <button data-act="tab" data-tab="day">${ICON('ui-star')}<span>Day</span></button>
    </nav>
  </div>
  <div id="modals"></div>
  <div id="toasts"></div>`;
  const hub = $('#hubui'), sheet = $('#sheet'), body = $('.sheet-body'), modals = $('#modals'), toasts = $('#toasts');
  let tab = 'kitchens';
  const api = {};

  // ---------- generic ----------
  function toast(text, kind = '') {
    const el = document.createElement('div');
    el.className = 'toast ' + kind; el.innerHTML = text;
    toasts.append(el);
    setTimeout(() => el.classList.add('out'), 1900); setTimeout(() => el.remove(), 2400);
    while (toasts.children.length > 3) toasts.firstChild.remove();
  }
  function modal(html, { cls = '', dismiss = false, pause = false, onClose } = {}) {
    const wrap = document.createElement('div');
    wrap.className = 'modal ' + cls; wrap.innerHTML = `<div class="card">${html}</div>`;
    modals.append(wrap);
    requestAnimationFrame(() => wrap.classList.add('in'));
    if (pause) game.paused = true;
    const close = () => { wrap.classList.remove('in'); wrap.classList.add('out'); setTimeout(() => wrap.remove(), 250); if (pause) game.paused = false; onClose?.(); };
    if (dismiss) wrap.addEventListener('click', (e) => { if (e.target === wrap) close(); });
    return { el: wrap, card: wrap.firstElementChild, close };
  }
  const sfx = (n, o) => game.audio?.play(n, o);

  // ---------- tabs (the open tab's own icon closes the sheet; again opens it) ----------
  const isClosed = () => sheet.dataset.state === 'closed';
  function setTab(t) {
    tab = t;
    for (const b of hub.querySelectorAll('.tabs button')) b.classList.toggle('on', b.dataset.tab === t);
    sheet.dataset.tab = t;
    if (sheet.dataset.state === 'min' || isClosed()) sheet.dataset.state = 'mid';
    render(); api.onTab?.();
  }
  function closeSheet() {
    sheet.dataset.state = 'closed';
    for (const b of hub.querySelectorAll('.tabs button')) b.classList.remove('on');
    api.onTab?.();
  }
  let renderedTab = null;
  function render() {
    const fn = { kitchens: renderKitchens, fleet: renderFleet, day: renderDay }[tab];
    const keep = renderedTab === tab ? body.scrollTop : 0;
    body.innerHTML = fn();
    body.scrollTop = keep;
    const rib = $('.sheet-rib .ribbon', sheet), title = body.querySelector('.sec-head h2')?.textContent || '';
    if (rib.textContent !== title) { rib.textContent = title; rib.classList.remove('pop'); void rib.offsetWidth; rib.classList.add('pop'); }
    renderedTab = tab;
    live();
  }
  function showKitchen(id) {
    if (tab !== 'kitchens' || isClosed()) setTab('kitchens');
    const card = body.querySelector(`.kcard[data-id="${id}"]`);
    if (card) { card.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); card.classList.remove('flash'); void card.offsetWidth; card.classList.add('flash'); }
  }

  // ---------- Kitchens ----------
  const coolSec = (id, lamp) => Math.round((100 - S.HEAT.hot) / (S.STAGE.kitchens[id].decay * (lamp ? S.LAMP : 1)));
  function kitchenCard(id) {
    const k = G.kit[id], s = S.STAGE.kitchens[id];
    if (!k) {
      return `<div class="kcard lockd" data-id="${id}">
        <div class="khead">${FICON(id)}<span class="kt"><b>${NAME[id]}</b><small>${FOODS[FOOD[id]].name} · ${M(s.value)} an order · about ${perMin(s.demand)} · ${s.cook} s to cook</small></span>
        <button class="btn gold sm" data-act="partner" data-id="${id}" data-cost="${s.partner}">Partner<small>${M(s.partner)}</small></button></div></div>`;
    }
    const btn = (a, label, cost, sub) => cost == null ? `<span class="kb max"><b>${label}</b><small>${sub}</small></span>`
      : `<button class="btn ${a === 'promo' ? 'gold' : a === 'lamp' ? 'red' : a === 'shelf' ? 'blue' : 'green'} sm kb" data-act="${a}" data-id="${id}" data-cost="${cost}"><b>${label}</b><small>${M(cost)}</small><em>${sub}</em></button>`;
    const full = k.shelf >= S.SHELF.length - 1;
    return `<div class="kcard" data-id="${id}">
      <div class="khead">${FICON(id)}<span class="kt"><b>${NAME[id]}</b><small>${M(s.value)} an order · <span data-live="rate">★ ${k.rating.toFixed(1)}</span> · hot for ${coolSec(id, k.lamp)} s on the shelf</small></span></div>
      <div class="kflow">
        <span class="kf" data-f="dem">${ICON('ui-pin')}<small>Orders</small><b data-live="dem"></b></span><i class="ka">›</i>
        <span class="kf" data-f="cook">${ICON('ui-clock')}<small>Cooks ×${k.cooks}</small><b data-live="cook"></b></span><i class="ka">›</i>
        <span class="kf" data-f="shelf">${ICON('ui-package')}<small>Shelf</small><b data-live="shelf"></b></span>
      </div>
      <div class="kbtns">
        ${btn('cook', 'Cook +1', k.cooks < S.MAX_COOKS ? S.cookCost(id, k.cooks) : null, k.cooks < S.MAX_COOKS ? `+${perMin(60 / s.cook)}` : 'Full kitchen')}
        ${btn('shelf', 'Shelf', full ? null : S.shelfCost(id, k.shelf), full ? `${S.shelfSize(k)} slots` : `${S.SHELF[k.shelf]} → ${S.SHELF[k.shelf + 1]} slots`)}
        ${btn('promo', 'Promo', k.promo < S.MAX_PROMO ? S.promoCost(id, k.promo) : null, k.promo < S.MAX_PROMO ? `+${Math.round(S.PROMO_STEP * 100)}% orders` : 'Everyone knows')}
        ${btn('lamp', 'Heat lamp', k.lamp ? null : S.lampCost(id), k.lamp ? 'On' : 'Shelf keeps heat ×3')}
      </div>
    </div>`;
  }
  function renderKitchens() {
    return `<div class="sec-head"><h2>Kitchens</h2><span class="sub">${Object.keys(G.kit).length} of ${S.KIDS.length}</span></div>
      <div class="rows kcards">${S.KIDS.map(kitchenCard).join('')}</div>
      <div class="hint">Orders › cooks › shelf › couriers › door. The slowest link sets the pace, and food cools while it waits.</div>`;
  }

  // ---------- Couriers ----------
  function renderFleet() {
    const sp = W().standOf(G.stand);
    return `<div class="sec-head"><h2>Couriers</h2><span class="sub">${G.couriers.length} on the team</span></div>
      <div class="fsum"><span>${ICON('ui-people')}<b data-live="busy"></b><small>busy</small></span><span>${ICON('ui-route')}<b data-live="idle"></b><small>at the stand</small></span><span>${ICON('ui-thermo')}<b data-live="hotsh"></b><small>arrive hot</small></span></div>
      <div class="rows">
        ${Object.entries(S.VEH).map(([v, x]) => `<div class="row vrow">${VICON(v)}<span class="rt"><b>${x.name}</b><small>${VDESC[v]}</small></span>
          <button class="btn green sm buy" data-act="hire" data-id="${v}" data-cost="${S.hireCost(G, v)}"><span>Hire</span><small>${M(S.hireCost(G, v))}</small></button></div>`).join('')}
        <div class="row">${ICON('ui-thermo')}<span class="rt"><b>Thermal bags</b><small>Food loses heat ${Math.round((1 - S.BAGS.m) * 100)}% slower on every bike</small></span>
          ${G.bags ? '<i class="max">ON</i>' : `<button class="btn red sm" data-act="bags" data-cost="${S.BAGS.cost}">Buy<small>${M(S.BAGS.cost)}</small></button>`}</div>
      </div>
      <div class="sec-head small"><h3>Courier stand</h3></div>
      <div class="rows">
        <div class="row stand-now">${ICON('ui-route')}<span class="rt"><b>${sp.name}</b><small>Free couriers wait here; every job starts from here</small></span><button class="btn ghost sm" data-act="seestand">Show</button></div>
        ${W().stands.filter((s) => s.id !== G.stand).map((s) => `<div class="row">${s.kitchen ? FICON(s.kitchen) : ICON('ui-building')}<span class="rt"><b>${s.name}</b><small data-live="sd-${s.id}"></small></span>
          <button class="btn blue sm" data-act="stand" data-id="${s.id}" data-cost="${S.MOVE_STAND}">Move<small>${M(S.MOVE_STAND)}</small></button></div>`).join('')}
      </div>
      <div class="sec-head small"><h3>The team</h3></div>
      <div class="team">${G.couriers.map((c) => `<span class="cchip" data-c="${c.id}">${ICON('char-' + c.char)}<b>${c.name}</b>${VICON(c.veh)}<small data-live="st-${c.id}"></small></span>`).join('')}</div>`;
  }
  const W = () => game.W;

  // ---------- Day ----------
  function renderDay() {
    const st = G.stats, stars = S.starsFor(st.hot);
    return `<div class="sec-head"><h2>Day</h2><span class="sub">${G.plays ? `day ${G.plays + 1}` : 'first day'}</span></div>
      <div class="daystars">${S.STAGE.stars.map((s, i) => `<span class="ds ${i < stars ? 'on' : ''}">${ICON(i < stars ? 'ui-star' : 'ui-star-empty')}<small>${s} hot</small></span>`).join('')}</div>
      <div class="rlines daylines">
        <div class="rl"><span>${ICON('ui-thermo')} Hot deliveries (×${S.PAY.hot})</span><b data-live="hot" class="good"></b></div>
        <div class="rl"><span>Warm (×${S.PAY.warm})</span><b data-live="warm"></b></div>
        <div class="rl"><span>Cold (×${S.PAY.cold})</span><b data-live="cold"></b></div>
        <div class="rl"><span>Customers who gave up</span><b data-live="lost"></b></div>
        <div class="rl"><span>${ICON('ui-cash')} Earned today</span><b data-live="earned"></b></div>
        <div class="rl"><span>Best day</span><b>${G.best ? `${G.best} hot` : '—'}</b></div>
      </div>
      <div class="sec-head small"><h3>Rush hours</h3></div>
      <div class="rlines">${S.RUSH.map((r) => `<div class="rl"><span>${ICON('ui-clock')} ${r.name}</span><b>${clockStr(r.from)}–${clockStr(r.to)} · orders ×${r.m}</b></div>`).join('')}
        <div class="rl"><span>${ICON('ui-moon')} Closing time</span><b>${clockStr(S.DAY.to)}</b></div></div>
      <button class="btn ghost" data-act="restart">${ICON('ui-sun')}Start the day over</button>
      <div class="hint">Stage 1 of the new idle game (prototype). <a class="link" href="idle.html">The first idle prototype</a> · <a class="link" href="index.html">The courier game</a></div>`;
  }

  // ---------- live numbers ----------
  const earn = []; // [t, earned] samples for $/min
  function setBtn(btn, cost) { const ok = G.cash + 1e-9 >= cost; if (btn.disabled === ok) btn.disabled = !ok; }
  let neckKey = '';
  function neckInfo(d) {
    if (d.kind === 'kitchen') return { cls: 'bad', html: `${FICON(d.id)}<span><b>${NAME[d.id]}</b>: the cooks can't keep up</span>`, go: () => showKitchen(d.id) };
    if (d.kind === 'shelf') return { cls: 'bad', html: `${FICON(d.id)}<span>Food waits at <b>${NAME[d.id]}</b>: no courier free</span>`, go: () => setTab('fleet') };
    if (d.kind === 'demand') return { cls: 'warn', html: `${ICON('ui-people')}<span>Couriers stand around: the kitchens need more orders</span>`, go: () => setTab('kitchens') };
    if (d.kind === 'heat') return { cls: 'warn', html: `${ICON('ui-thermo')}<span>Food arrives warm: speed up the chain</span>`, go: () => setTab('fleet') };
    return { cls: 'ok', html: `${ICON('ui-star')}<span>The chain is flowing</span>`, go: null };
  }
  let neckGo = null;
  function live() {
    const clock = S.clockOf(G);
    $('.cashv', hub).textContent = M(G.cash);
    earn.push([G.t, G.stats.earned]); while (earn.length > 2 && G.t - earn[0][0] > 30) earn.shift();
    const span = G.t - earn[0][0];
    $('.ips', hub).textContent = `${M(span > 1 ? (G.stats.earned - earn[0][1]) / span * 60 : 0)}/min`;
    $('.clock', hub).textContent = clockStr(clock);
    $('.left', hub).textContent = G.done ? 'closed' : `${mmss(S.DAY.sec - G.t)} left`;
    const night = clock >= 20 * 60, tod = $('.tod', hub);
    if (tod.dataset.n !== String(night)) { tod.dataset.n = String(night); tod.innerHTML = ICON(night ? 'ui-moon' : 'ui-sun'); }
    const rush = S.rushAt(clock), nr = S.nextRush(clock), rs = $('.rush', hub);
    const soon = !rush && nr && (nr.from - clock) / S.GMPS < 75;
    rs.hidden = !rush && !soon;
    if (rush) { rs.textContent = `${rush.name} ×${rush.m}`; rs.classList.remove('soon'); }
    else if (soon) { rs.textContent = `${nr.name} in ${mmss((nr.from - clock) / S.GMPS)}`; rs.classList.add('soon'); }
    // stars
    const hot = G.stats.hot, top = S.STAGE.stars[2];
    $('.hotn', hub).textContent = hot;
    $('.sb-fill', hub).style.width = `${Math.min(100, hot / top * 100).toFixed(1)}%`;
    for (const t of hub.querySelectorAll('.sb-tick')) t.classList.toggle('on', hot >= S.STAGE.stars[+t.dataset.i]);
    // what's stuck
    const d = G.done ? { kind: 'done' } : S.diagnose(G), key = d.kind + (d.id || '');
    if (key !== neckKey) {
      neckKey = key;
      const nb = $('.neckb', hub);
      if (d.kind === 'done') { nb.className = 'neckb ok'; nb.innerHTML = `${ICON('ui-moon')}<span>Closed for the day</span>`; neckGo = () => api.endDay(); }
      else { const n = neckInfo(d); nb.className = 'neckb ' + n.cls; nb.innerHTML = n.html; neckGo = n.go; }
    }
    // tab dots
    $('.tabs [data-tab="kitchens"] .dot', hub).hidden = !(d.kind === 'kitchen' || d.kind === 'demand');
    $('.tabs [data-tab="fleet"] .dot', hub).hidden = !(d.kind === 'shelf' || d.kind === 'heat');
    // the sheet
    for (const btn of body.querySelectorAll('[data-cost]')) setBtn(btn, +btn.dataset.cost);
    if (tab === 'kitchens') {
      for (const card of body.querySelectorAll('.kcard:not(.lockd)')) {
        const id = card.dataset.id, k = G.kit[id]; if (!k) continue;
        const dem = S.demandRate(G, id), cook = S.cookRate(G, id);
        $('[data-live="dem"]', card).textContent = perMin(dem);
        $('[data-live="cook"]', card).textContent = perMin(cook);
        $('[data-live="shelf"]', card).textContent = `${k.rack.length}/${S.shelfSize(k)}`;
        $('[data-live="rate"]', card).textContent = `★ ${k.rating.toFixed(1)}`;
        card.querySelector('[data-f="cook"]').classList.toggle('bad', d.kind === 'kitchen' && d.id === id);
        card.querySelector('[data-f="shelf"]').classList.toggle('bad', d.kind === 'shelf' && d.id === id);
        card.querySelector('[data-f="dem"]').classList.toggle('warn', d.kind === 'demand');
        card.classList.toggle('neck', (d.kind === 'kitchen' || d.kind === 'shelf') && d.id === id);
      }
    }
    if (tab === 'fleet') {
      const busy = G.couriers.filter((c) => c.st !== 'idle').length;
      const b = $('[data-live="busy"]', body); if (b) b.textContent = busy;
      const i = $('[data-live="idle"]', body); if (i) i.textContent = G.couriers.length - busy;
      const h = $('[data-live="hotsh"]', body); if (h) h.textContent = G.stats.deliveries ? `${Math.round(G.ema.hotShare * 100)}%` : '—';
      for (const c of G.couriers) { const el = $(`[data-live="st-${c.id}"]`, body); if (el) el.textContent = c.st === 'drop' ? `delivering ${c.load.length}` : STATUS[c.st]; }
      for (const s of W().stands) {
        const el = $(`[data-live="sd-${s.id}"]`, body); if (!el) continue;
        let sum = 0, n = 0; for (const id in G.kit) { sum += W().dist(s.lot.door, W().kitchenDoor(id)); n++; }
        el.textContent = `${Math.round(sum / Math.max(1, n))} m to your kitchens on average`;
      }
    }
    if (tab === 'day') {
      for (const k of ['hot', 'warm', 'cold', 'lost']) { const el = $(`[data-live="${k}"]`, body); if (el) el.textContent = G.stats[k]; }
      const e = $('[data-live="earned"]', body); if (e) e.textContent = M(G.stats.earned);
    }
  }

  // ---------- actions ----------
  root.addEventListener('click', (e) => {
    const el = e.target.closest('[data-act]'); if (!el || el.disabled) return;
    const a = el.dataset.act, id = el.dataset.id;
    if (a === 'tab') { sfx('ui-tap'); if (el.closest('.tabs') && el.dataset.tab === tab && !isClosed()) closeSheet(); else setTab(el.dataset.tab); return; }
    if (a === 'grab') { const s = sheet.dataset.state; sheet.dataset.state = s === 'mid' ? 'big' : 'mid'; return; }
    if (a === 'settings') { settings(); return; }
    if (a === 'neck') { sfx('ui-tap'); neckGo?.(); return; }
    if (a === 'seestand') { sfx('ui-tap'); game.focusStand(); return; }
    if (a === 'restart') { restartModal(); return; }
    game.act(a, id, el);
  });

  function restartModal() {
    const c = modal(`<h2>Start the day over?</h2><p>Back to 09:00 with one kitchen and one courier. Your best day is kept.</p>
      <button class="btn red big" data-x="y">Start over</button><button class="btn ghost" data-x="n">Keep going</button>`, { cls: 'pop', dismiss: true });
    c.card.addEventListener('click', (ev) => { const y = ev.target.closest('[data-x]')?.dataset.x; if (y === 'y') game.newDay(); if (y) c.close(); });
  }
  function welcome() {
    const m = modal(`<div class="ribwrap"><span class="ribbon">Opening day</span></div>
      <p>You run the delivery company for Old Town's kitchens. Today is one business day: <b>09:00 to 22:00</b>, about 15 minutes.</p>
      <div class="rlines">
        <div class="rl"><span>${ICON('food-burger')} Customers order, cooks cook, couriers carry it to the door</span></div>
        <div class="rl"><span>${ICON('ui-thermo')} Food cools from the moment it's ready. Hot at the door pays ×${S.PAY.hot}</span></div>
        <div class="rl"><span>${ICON('ui-star')} ${S.STAGE.stars.join(' / ')} hot deliveries by closing time: ★ / ★★ / ★★★</span></div>
        <div class="rl"><span>${ICON('ui-route')} The banner shows where the chain is stuck. How you fix it is up to you</span></div></div>
      <button class="btn green big" data-x="ok">Open the kitchens!</button>`, { cls: 'pop', pause: true });
    m.card.querySelector('[data-x]').onclick = () => { m.close(); sfx('ui-tap'); };
  }
  function endDay() {
    const st = G.stats, stars = S.starsFor(st.hot), best = Math.max(G.best || 0, st.hot);
    const m = modal(`<div class="ribwrap"><span class="ribbon">${stars ? 'Day done!' : 'Closing time'}</span></div>
      <div class="endstars">${[0, 1, 2].map((i) => `<span class="es ${i < stars ? 'on' : ''}" style="--d:${i * 0.35}s">${ICON(i < stars ? 'ui-star' : 'ui-star-empty')}</span>`).join('')}</div>
      <p class="endhot"><b>${st.hot}</b> hot deliveries${stars < 3 ? ` · ${S.STAGE.stars[stars]} for ${'★'.repeat(stars + 1)}` : ''}</p>
      <div class="rlines">
        <div class="rl"><span>Warm / cold</span><b>${st.warm} / ${st.cold}</b></div>
        <div class="rl"><span>Customers who gave up</span><b>${st.lost}</b></div>
        <div class="rl"><span>${ICON('ui-cash')} Earned</span><b>${M(st.earned)}</b></div>
        <div class="rl"><span>Best day</span><b>${best} hot</b></div></div>
      <button class="btn green big" data-x="again">${ICON('ui-sun')}Play the day again</button>
      <button class="btn ghost" data-x="look">Look around</button>`, { cls: 'pop end' });
    if (stars) sfx('crowd-cheer');
    m.card.addEventListener('click', (e) => {
      const x = e.target.closest('[data-x]')?.dataset.x; if (!x) return;
      m.close(); if (x === 'again') game.newDay();
    });
  }
  function settings() {
    const s = G.settings;
    const m = modal(`<h2>Settings</h2>
      <label class="set">Music<input type="range" min="0" max="1" step="0.05" value="${s.music}" data-k="music"></label>
      <label class="set">Sounds<input type="range" min="0" max="1" step="0.05" value="${s.sfx}" data-k="sfx"></label>
      <label class="set">Graphics<select data-k="quality">${['auto', 'low', 'medium', 'high'].map((q) => `<option ${q === s.quality ? 'selected' : ''}>${q}</option>`).join('')}</select></label>
      <a class="btn blue" href="index.html">Ride as a courier (original game)</a>
      <button class="btn ghost danger" data-x="reset">Erase this game's save</button>
      <button class="btn green big" data-x="ok">Done</button>`, { cls: 'settings', dismiss: true, pause: true });
    m.card.addEventListener('input', (e) => { const k = e.target.dataset.k; if (!k) return; s[k] = k === 'quality' ? e.target.value : +e.target.value; game.applySettings(); });
    m.card.addEventListener('click', (e) => {
      const x = e.target.closest('[data-x]')?.dataset.x;
      if (x === 'ok') { m.close(); game.save(); }
      if (x === 'reset') { m.close(); const c = modal(`<h2>Erase the save?</h2><p>Today's progress and your best day go. This can't be undone.</p><button class="btn red big" data-x="y">Erase</button><button class="btn ghost" data-x="n">Cancel</button>`, { cls: 'pop', dismiss: true });
        c.card.addEventListener('click', (ev) => { const y = ev.target.closest('[data-x]')?.dataset.x; if (y === 'y') game.reset(); if (y) c.close(); }); }
    });
  }

  Object.assign(api, { render, live, toast, modal, setTab, closeSheet, showKitchen, welcome, endDay, setG: (g) => { G = g; neckKey = ''; earn.length = 0; } });
  Object.defineProperties(api, { tab: { get: () => tab }, open: { get: () => !isClosed() } }); // (live getters: Object.assign would copy values)
  return api;
}

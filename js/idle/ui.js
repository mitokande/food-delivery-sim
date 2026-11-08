// Idle + manager mode: the interface (top bar, goal, the bottom sheet's tabs, modals, toasts). The numbers that change
// every frame (cash, cycle bars, prices) are patched in place by live(); render() rebuilds a tab when its shape changes.
import * as E from './econ.js';
import { VEHICLE, FOODS } from '../data.js';

export const ICON = (n, cls = '') => `<img class="ic ${cls}" src="assets/icons/${n}.webp" alt="" draggable="false" onerror="this.onerror=null;this.src='assets/icons/${n}.png'">`;
const VICON = (id) => `<img class="ic" src="assets/icons/veh-${id}.png" alt="" draggable="false">`; // (vehicle icons are png only)
const $ = (sel, root = document) => root.querySelector(sel);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const M = E.money;
const per = (n) => `${M(n)}/s`;
const ord = (n) => `${E.short(n * 60)}/min`;
const clockStr = (m) => `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(Math.floor(m % 60)).padStart(2, '0')}`;
const mmss = (s) => { const n = Math.max(0, Math.ceil(s)); return `${Math.floor(n / 60)}:${String(n % 60).padStart(2, '0')}`; };
const dur = (s) => { const h = Math.floor(s / 3600), m = Math.round(s % 3600 / 60); return h ? `${h} h ${m} min` : `${m} min`; };
const GEAR = '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M19.4 13a7.6 7.6 0 0 0 0-2l2.1-1.6-2-3.5-2.5 1a7.4 7.4 0 0 0-1.7-1L15 3.3h-4l-.4 2.6a7.4 7.4 0 0 0-1.7 1l-2.5-1-2 3.5L6.6 11a7.6 7.6 0 0 0 0 2l-2.1 1.6 2 3.5 2.5-1c.5.4 1.1.7 1.7 1l.4 2.6h4l.4-2.6c.6-.3 1.2-.6 1.7-1l2.5 1 2-3.5zM13 15.5A3.5 3.5 0 1 1 13 8.5a3.5 3.5 0 0 1 0 7z" transform="translate(-1 0)"/></svg>';

export function createIdleUI(game) {
  const { G } = game;
  const root = document.getElementById('ui');
  root.innerHTML = `
  <div id="hubui" class="idle">
    <header class="topbar">
      <button class="who" data-act="tab" data-tab="franchise"><span class="ava">${ICON('char-male-c')}</span>
        <span class="lvwrap"><span class="shield"><b class="starsv">0</b></span></span>
        <span class="lvlbox"><small class="nm">Saffron Bay Delivery Co.</small><span class="ipsbar"><b class="ips">$0/s</b></span></span></button>
      <span class="res cash">${ICON('ui-cash')}<b class="cashv">$0</b></span>
      <button class="gear" data-act="settings" aria-label="Settings">${GEAR}</button>
    </header>
    <div class="clockbar"><span class="clockchip"><span class="tod"></span><b class="clock">09:00</b><span class="day">Day 1</span></span><span class="rush" hidden></span><span class="rainchip" hidden>${ICON('ui-rain')}Rain ×1.25</span></div>
    <button class="goalpill" data-act="goal"><span class="gt"></span><em class="gr"></em></button>
    <section id="sheet" class="sheet" data-state="mid"><div class="sheet-rib ribwrap" data-act="grab"><span class="ribbon"></span></div><div class="grab" data-act="grab"><i></i></div><div class="sheet-body"></div></section>
    <nav class="tabs">
      <button data-act="tab" data-tab="kitchens">${ICON('ui-building')}<span>Kitchens</span></button>
      <button data-act="tab" data-tab="couriers">${ICON('ui-people')}<span>Couriers</span><i class="dot" hidden></i></button>
      <button data-act="tab" data-tab="deals">${ICON('ui-gift')}<span>Deals</span><i class="dot" hidden></i></button>
      <button data-act="tab" data-tab="franchise">${ICON('ui-star')}<span>Franchise</span><i class="dot" hidden></i></button>
    </nav>
  </div>
  <div id="modals"></div>
  <div id="toasts"></div>`;
  const hub = $('#hubui'), sheet = $('#sheet'), body = $('.sheet-body'), modals = $('#modals'), toasts = $('#toasts');
  let tab = 'kitchens';
  const st = { d: 'oldtown', amt: 1 };

  // ---------- generic ----------
  function toast(text, kind = '') {
    const el = document.createElement('div');
    el.className = 'toast ' + kind; el.innerHTML = text;
    toasts.append(el);
    setTimeout(() => el.classList.add('out'), 1700); setTimeout(() => el.remove(), 2200);
    while (toasts.children.length > 3) toasts.firstChild.remove();
  }
  function modal(html, { cls = '', dismiss = false } = {}) {
    const wrap = document.createElement('div');
    wrap.className = 'modal ' + cls; wrap.innerHTML = `<div class="card">${html}</div>`;
    modals.append(wrap);
    requestAnimationFrame(() => wrap.classList.add('in'));
    const close = () => { wrap.classList.remove('in'); wrap.classList.add('out'); setTimeout(() => wrap.remove(), 250); };
    if (dismiss) wrap.addEventListener('click', (e) => { if (e.target === wrap) close(); });
    return { el: wrap, card: wrap.firstElementChild, close };
  }
  const sfx = (n, o) => game.audio?.play(n, o);

  // ---------- tabs ----------
  function setTab(t) {
    tab = t;
    for (const b of hub.querySelectorAll('.tabs button')) b.classList.toggle('on', b.dataset.tab === t);
    sheet.dataset.tab = t;
    if (sheet.dataset.state === 'min') sheet.dataset.state = 'mid';
    render();
  }
  function selectDistrict(d, fly = true) {
    if (!G.dist[d]) return;
    st.d = d; render();
    if (fly) game.focusDistrict(d);
  }
  let renderedTab = null;
  function render() {
    const fn = { kitchens: renderKitchens, couriers: renderCouriers, deals: renderDeals, franchise: renderFranchise }[tab];
    const keep = renderedTab === tab ? body.scrollTop : 0;
    body.innerHTML = fn();
    body.scrollTop = keep;
    const rib = $('.sheet-rib .ribbon', sheet), title = body.querySelector('.sec-head h2')?.textContent || '';
    if (rib.textContent !== title) { rib.textContent = title; rib.classList.remove('pop'); void rib.offsetWidth; rib.classList.add('pop'); }
    renderedTab = tab;
    live(true);
  }

  // the district chips (Kitchens and Couriers share the chosen district); a locked one shows its license
  function chips() {
    return `<div class="dfilter dchips">${E.DISTRICTS.map((d) => {
      const s = G.dist[d.id];
      if (s) return `<button class="${st.d === d.id ? 'on' : ''}" style="--dc:${d.color}" data-act="dist" data-id="${d.id}">${d.name}${s.mgr ? '' : ` <small class="nomgr">no manager</small>`}</button>`;
      const prev = E.DISTRICTS[E.IDIST[d.id].i - 1];
      if (!G.dist[prev.id]) return '';
      return `<button class="lockchip" style="--dc:${d.color}" data-act="unlock" data-id="${d.id}">${ICON('ui-lock')}${d.name} <small data-cost="${E.IDIST[d.id].unlock}">${M(E.IDIST[d.id].unlock)}</small></button>`;
    }).join('')}</div>`;
  }
  const amtBtn = () => `<button class="amt" data-act="amt">×${st.amt === 'max' ? 'MAX' : st.amt}</button>`;

  // ---------- Kitchens ----------
  function deliveryCard(d) {
    const s = G.dist[d], dm = E.demand(G, d, true), cap = E.capacity(G, d), r = E.ratio(G, d, true);
    return `<div class="dcard ${r < 0.999 ? 'cold' : ''}" data-act="tab" data-tab="couriers">
      <div class="dline"><span>${ICON('ui-building')}Kitchens <b data-live="dem">${ord(dm)}</b></span><span>${VICON(E.VEH_LIST[s.veh])}Couriers <b data-live="cap">${ord(cap)}</b></span></div>
      <i class="dbar"><u data-live="ratio" style="width:${Math.round(r * 100)}%"></u></i>
      <small data-live="rtext">${r < 0.999 ? `${Math.round((1 - r) * 100)}% of the food goes cold — hire couriers` : 'Every order reaches its door'}</small>
    </div>`;
  }
  function restRow(r) {
    const L = E.level(G, r.id), food = FOODS[r.food];
    if (!L) {
      return `<div class="row irow lockd" data-id="${r.id}">${ICON(food.icon)}<span class="rt"><b>${esc(r.name)}</b><small>${food.name} · batch every ${r.t} s · ${r.o > 1 ? `${r.o} orders a level` : '1 order a level'}</small></span>
        <button class="btn gold sm" data-act="partner" data-id="${r.id}" data-cost="${r.c}">Partner<small>${M(r.c)}</small></button></div>`;
    }
    const auto = E.hasMgr(G, r.district), nx = E.nextMs(L);
    return `<div class="row irow" data-id="${r.id}">
      <button class="cookb ${auto ? 'auto' : ''}" data-act="cook" data-id="${r.id}" aria-label="Cook">${ICON(food.icon)}<i class="lvb">${L}</i>${auto ? '' : '<em class="tapme">TAP</em>'}</button>
      <span class="rt"><b>${esc(r.name)}</b>
        <span class="pbar"><u data-live="prog"></u><em data-live="bpay"></em></span>
        <small>${nx ? `<span data-live="ms">${nx - L} to Lv ${nx}: orders ×2</span>` : 'Max milestone'} · ${r.t} s</small></span>
      <button class="btn green sm buy" data-act="lvl" data-id="${r.id}"><span data-live="bn">+1</span><small data-live="bc"></small></button></div>`;
  }
  function renderKitchens() {
    const d = st.d, s = G.dist[d];
    const mgr = s.mgr ? `<div class="mgrline">${ICON('char-' + s.mgr.char, 'cava sm')}<span><b>${esc(s.mgr.name)}</b> runs ${E.IDIST[d].name}'s kitchens</span></div>`
      : `<div class="mgrline nom">${ICON('ui-lock')}<span>No manager: kitchens cook only when you tap them</span><button class="btn blue sm" data-act="mgr" data-id="${d}" data-cost="${E.IDIST[d].mgr}">Hire<small>${M(E.IDIST[d].mgr)}</small></button></div>`;
    return `<div class="sec-head"><h2>Kitchens</h2>${amtBtn()}</div>${chips()}${deliveryCard(d)}${mgr}
      ${s.mgr ? '' : `<button class="btn ghost cookall" data-act="cookall" data-id="${d}">${ICON('ui-clock')}Cook all</button>`}
      <div class="rows">${E.restOf(d).map(restRow).join('')}</div>`;
  }

  // ---------- Couriers ----------
  function renderCouriers() {
    const d = st.d, s = G.dist[d], V = VEHICLE[E.VEH_LIST[s.veh]], nv = E.VEH_LIST[s.veh + 1];
    const nx = E.nextMs(s.n, E.TEAM_MS), now = Date.now();
    const m = s.mgr;
    const mgrCard = m
      ? `<div class="row mgr">${ICON('char-' + m.char, 'cava')}<span class="rt"><b>${esc(m.name)}</b><small>Manager: keeps every kitchen cooking, even while you're away. <b class="sg">Surge</b>: orders ×${E.SURGE.mult} for ${E.SURGE.sec} s.</small></span>
        <button class="btn gold sm" data-act="surge" data-id="${d}"><span data-live="sg">Surge!</span></button></div>`
      : `<div class="row mgr">${ICON('ui-lock')}<span class="rt"><b>Hire a manager</b><small>Without one, ${E.IDIST[d].name}'s kitchens cook only when you tap them, and nothing is earned while you're away.</small></span>
        <button class="btn blue sm" data-act="mgr" data-id="${d}" data-cost="${E.IDIST[d].mgr}">Hire<small>${M(E.IDIST[d].mgr)}</small></button></div>`;
    return `<div class="sec-head"><h2>Couriers</h2>${amtBtn()}</div>${chips()}${deliveryCard(d)}
      <div class="rows">
        ${mgrCard}
        <div class="row">${ICON('ui-people')}<span class="rt"><b>${s.n} courier${s.n > 1 ? 's' : ''}</b><small>Each carries ${E.short(E.Q * E.VEH_MULT[s.veh] * 60)} orders/min on a ${V.name}${nx ? ` · ${nx - s.n} more to ${nx}: routes ×2` : ''}</small></span>
          <button class="btn green sm buy" data-act="hire" data-id="${d}"><span data-live="hn">Hire</span><small data-live="hc"></small></button></div>
        ${nv ? `<div class="row">${VICON(nv)}<span class="rt"><b>${VEHICLE[nv].name}s for all</b><small>Couriers carry ×${(E.VEH_MULT[s.veh + 1] / E.VEH_MULT[s.veh]).toFixed(2).replace(/\.?0+$/, '')} more</small></span>
          <button class="btn blue sm" data-act="veh" data-id="${d}" data-cost="${E.vehCost(d, s.veh + 1)}">Upgrade<small>${M(E.vehCost(d, s.veh + 1))}</small></button></div>` : `<div class="row">${VICON(V.id)}<span class="rt"><b>${V.name}s</b><small>The fastest fleet in Saffron Bay</small></span><i class="max">MAX</i></div>`}
      </div>
      <div class="hint">Every kitchen milestone doubles its orders: keep the couriers ahead of the kitchens.</div>`;
  }

  // ---------- Deals ----------
  function renderDeals() {
    const open = E.DEALS.filter((x) => !G.deals[x.id] && E.dealOpen(G, x)).slice(0, 12);
    const nx = E.OFFICE[G.office + 1];
    const kindTxt = (x) => x.kind === 'all' ? `All income ×${x.m}` : x.kind === 'rest' ? `${E.IREST_BY[x.target].name} ×${x.m}` : `Courier capacity ×${x.m}`;
    const icon = (x) => x.kind === 'all' ? 'ui-trophy' : x.kind === 'rest' ? FOODS[E.IREST_BY[x.target].food].icon : 'ui-package';
    const owned = Object.keys(G.deals).length;
    return `<div class="sec-head"><h2>Deals</h2><span class="sub">${owned} signed</span></div>
      <div class="rows">
        <div class="row">${ICON('ui-moon')}<span class="rt"><b>Office: ${E.OFFICE[G.office].h} h away</b><small>Managers keep earning for up to ${E.OFFICE[G.office].h} h while the game is closed${nx ? ` · next: ${nx.h} h` : ''}</small></span>
          ${nx ? `<button class="btn blue sm" data-act="office" data-cost="${nx.cost}">Upgrade<small>${M(nx.cost)}</small></button>` : '<i class="max">MAX</i>'}</div>
        ${open.map((x) => `<div class="row deal">${ICON(icon(x))}<span class="rt"><b>${esc(x.name)}</b><small>${kindTxt(x)}</small></span>
          <button class="btn gold sm" data-act="deal" data-id="${x.id}" data-cost="${x.cost}">Sign<small>${M(x.cost)}</small></button></div>`).join('') || '<div class="hint">Partner with more restaurants for new deals.</div>'}
      </div>`;
  }

  // ---------- Franchise ----------
  function renderFranchise() {
    const pend = E.pendingStars(G), nextAt = Math.pow(E.starsFor(G.earnedAll) + 1, 2) * E.STAR_UNIT;
    return `<div class="sec-head"><h2>Franchise</h2><span class="sub">${G.franchises ? `${G.franchises} sold` : ''}</span></div>
      <div class="bank star"><span>${ICON('ui-star')}<b>${G.stars} ★</b><small>+${Math.round(G.stars * E.STAR_BONUS * 100)}% on all income, for good</small></span></div>
      <div class="frbox">
        <p>Sell Saffron Bay Delivery Co. to a franchise group and start a new branch from scratch: cash, kitchens, couriers, managers and deals go; your <b>Stars</b> stay, each one +${Math.round(E.STAR_BONUS * 100)}% income.</p>
        <div class="rlines"><div class="rl"><span>Stars you'd get now</span><b data-live="pend">+${pend}</b></div>
          <div class="rl"><span>Next star at lifetime earnings of</span><b data-live="nst">${M(nextAt)}</b></div>
          <div class="rl"><span>Earned this branch</span><b data-live="erun">${M(G.earned)}</b></div>
          <div class="rl"><span>Best income</span><b>${per(G.best)}</b></div></div>
        <button class="btn gold big" data-act="franchise" ${pend < 1 ? 'disabled' : ''}>${ICON('ui-star')}Franchise · +<span data-live="pend2">${pend}</span> ★</button>
      </div>
      <div class="hint"><a class="link" href="index.html">Ride as a courier instead (the original game)</a></div>`;
  }

  // ---------- live numbers ----------
  let liveT = 0;
  function setBtn(btn, cost) { const ok = G.cash + 1e-9 >= cost; if (btn.disabled === ok) btn.disabled = !ok; }
  function live(force = false) {
    const now = Date.now();
    $('.cashv', hub).textContent = M(G.cash);
    $('.ips', hub).textContent = per(E.incomePerSec(G, { now }));
    $('.starsv', hub).textContent = G.stars;
    $('.clock', hub).textContent = clockStr(G.clock);
    $('.day', hub).textContent = `Day ${G.day}`;
    const night = G.clock >= 20.5 * 60 || G.clock < 6 * 60, tod = $('.tod', hub);
    if (tod.dataset.n !== String(night)) { tod.dataset.n = String(night); tod.innerHTML = ICON(night ? 'ui-moon' : 'ui-sun'); }
    const rush = E.rushAt(G.clock), rs = $('.rush', hub);
    rs.hidden = !rush; if (rush) rs.textContent = `${rush.name} ×${rush.m}`;
    $('.rainchip', hub).hidden = !G.rain;
    // the goal
    const g = E.goal(G), done = g.done(G), pill = $('.goalpill', hub);
    pill.classList.toggle('done', done);
    $('.gt', pill).textContent = g.text;
    $('.gr', pill).textContent = done ? `Claim ${M(E.goalReward(G, g))}` : `+${M(E.goalReward(G, g))}`;
    // tab dots: something to do there
    const anyMgr = E.DISTRICTS.some((d) => G.dist[d.id] && !G.dist[d.id].mgr && G.cash >= E.IDIST[d.id].mgr);
    const cold = Object.keys(G.dist).some((d) => E.ratio(G, d, true) < 0.95);
    $('.tabs [data-tab="couriers"] .dot', hub).hidden = !(anyMgr || cold);
    $('.tabs [data-tab="deals"] .dot', hub).hidden = !E.DEALS.some((x) => !G.deals[x.id] && E.dealOpen(G, x) && G.cash >= x.cost);
    $('.tabs [data-tab="franchise"] .dot', hub).hidden = E.pendingStars(G) < Math.max(1, G.stars);
    // the sheet
    for (const btn of body.querySelectorAll('[data-cost]')) setBtn(btn, +btn.dataset.cost);
    if (tab === 'kitchens') {
      for (const row of body.querySelectorAll('.irow:not(.lockd)')) {
        const id = row.dataset.id, r = E.IREST_BY[id];
        const cooking = E.cooking(G, id);
        $('[data-live="prog"]', row).style.width = `${cooking ? Math.min(100, (G.prog[id] || 0) * 100) : 0}%`;
        $('[data-live="bpay"]', row).textContent = `${M(E.batchPay(G, id, now, true))} a batch`;
        row.querySelector('.cookb').classList.toggle('idle', !cooking);
        const b = E.levelBuy(G, id, st.amt), btn = $('[data-act="lvl"]', row);
        $('[data-live="bn"]', row).textContent = `Lv +${b.n}`;
        $('[data-live="bc"]', row).textContent = M(b.cost);
        setBtn(btn, b.cost);
        void r;
      }
    }
    if (tab === 'kitchens' || tab === 'couriers') {
      const d = st.d, r = E.ratio(G, d, true);
      const u = $('[data-live="ratio"]', body); if (u) u.style.width = `${Math.round(r * 100)}%`;
      const dm = $('[data-live="dem"]', body); if (dm) dm.textContent = ord(E.demand(G, d, true));
      const cp = $('[data-live="cap"]', body); if (cp) cp.textContent = ord(E.capacity(G, d));
      const rt = $('[data-live="rtext"]', body); if (rt) { rt.textContent = r < 0.999 ? `${Math.round((1 - r) * 100)}% of the food goes cold — hire couriers` : 'Every order reaches its door'; rt.parentElement.classList.toggle('cold', r < 0.999); }
    }
    if (tab === 'couriers') {
      const d = st.d, h = E.hireBuy(G, d, st.amt), hb = $('[data-act="hire"]', body);
      if (hb) { $('[data-live="hn"]', body).textContent = `Hire ${h.n}`; $('[data-live="hc"]', body).textContent = M(h.cost); setBtn(hb, h.cost); }
      const m = G.dist[d].mgr, sb = $('[data-act="surge"]', body);
      if (m && sb) {
        const on = m.surgeUntil > now, cd = m.cdUntil > now;
        $('[data-live="sg"]', sb).textContent = on ? `×${E.SURGE.mult} ${mmss((m.surgeUntil - now) / 1000)}` : cd ? mmss((m.cdUntil - now) / 1000) : 'Surge!';
        sb.disabled = cd; sb.classList.toggle('on', on);
      }
    }
    if (tab === 'franchise') {
      const p = E.pendingStars(G);
      for (const k of ['pend']) { const el = $(`[data-live="${k}"]`, body); if (el) el.textContent = `+${p}`; }
      const p2 = $('[data-live="pend2"]', body); if (p2) p2.textContent = p;
      const er = $('[data-live="erun"]', body); if (er) er.textContent = M(G.earned);
      const fb = $('[data-act="franchise"]', body); if (fb) fb.disabled = p < 1;
    }
    void force;
  }

  // ---------- actions ----------
  root.addEventListener('click', (e) => {
    const el = e.target.closest('[data-act]'); if (!el || el.disabled) return;
    const a = el.dataset.act, id = el.dataset.id;
    if (a === 'tab') { sfx('ui-tap'); setTab(el.dataset.tab); return; }
    if (a === 'grab') { const s = sheet.dataset.state; sheet.dataset.state = s === 'min' ? 'mid' : s === 'mid' ? 'big' : 'min'; return; }
    if (a === 'dist') { sfx('ui-tap'); selectDistrict(id); return; }
    if (a === 'amt') { sfx('ui-tap'); st.amt = st.amt === 1 ? 10 : st.amt === 10 ? 100 : st.amt === 100 ? 'max' : 1; render(); return; }
    if (a === 'settings') { settings(); return; }
    if (a === 'goal') { const n = E.claimGoal(G); if (n) { sfx('ui-coins'); toast(`${ICON('ui-cash')} +${M(n)}`, 'good'); game.changed(); } else { sfx('ui-tap'); toast(E.goal(G).text); } return; }
    if (a === 'unlock') return unlockModal(id);
    if (a === 'franchise') return franchiseModal();
    game.act(a, id, st.amt, el);
  });

  function unlockModal(d) {
    const D = E.IDIST[d], first = E.restOf(d)[0];
    const m = modal(`<div class="ribwrap"><span class="ribbon">${D.name}</span></div>
      <p>${esc(D.desc)}</p>
      <div class="rlines"><div class="rl"><span>${ICON('ui-building')} City license (+1 courier)</span><b>${M(D.unlock)}</b></div>
        <div class="rl"><span>${ICON(FOODS[first.food].icon)} Then partner with ${esc(first.name)}</span><b>${M(first.c)}</b></div>
        <div class="rl"><span>${ICON('ui-cash')} An order pays</span><b>${M(first.v)} (Old Town: ${M(E.IREST[0].v)})</b></div></div>
      <button class="btn green big" data-x="ok" ${G.cash < D.unlock ? 'disabled' : ''}>Buy license · ${M(D.unlock)}</button>
      <button class="btn ghost" data-x="no">Not yet</button>`, { cls: 'pop', dismiss: true });
    m.card.addEventListener('click', (e) => {
      const x = e.target.closest('[data-x]')?.dataset.x; if (!x) return;
      if (x === 'ok' && game.act('unlock', d)) { st.d = d; m.close(); setTab('kitchens'); game.focusDistrict(d); }
      else if (x === 'no') m.close();
    });
  }
  function franchiseModal() {
    const p = E.pendingStars(G);
    const m = modal(`<h2>Franchise?</h2><p>You sell this branch for <b>+${p} ★</b> (income +${Math.round((G.stars + p) * E.STAR_BONUS * 100)}% in total). Cash, kitchens, couriers, managers and deals start over.</p>
      <button class="btn gold big" data-x="ok">${ICON('ui-star')}Sell · +${p} ★</button><button class="btn ghost" data-x="no">Keep going</button>`, { cls: 'pop', dismiss: true });
    m.card.addEventListener('click', (e) => {
      const x = e.target.closest('[data-x]')?.dataset.x; if (!x) return;
      m.close(); if (x === 'ok') game.act('franchise');
    });
  }
  function offline(info) {
    return new Promise((resolve) => {
      const m = modal(`<div class="zz">${ICON('ui-moon', 'big')}</div><h2>Your managers kept the kitchens going!</h2>
        <div class="rlines"><div class="rl"><span>${ICON('ui-cash')} Earned while away</span><b class="good">+${M(info.gain)}</b></div>
        <div class="rl"><span>${ICON('ui-clock')} Away</span><b>${dur(info.away)}${info.capped ? ` (office pays ${E.OFFICE[G.office].h} h)` : ''}</b></div></div>
        <button class="btn green big" data-x="ok">Collect</button>`, { cls: 'pop' });
      m.card.querySelector('[data-x]').onclick = () => { m.close(); resolve(); };
    });
  }
  function welcome() {
    return new Promise((resolve) => {
      const m = modal(`<div class="ribwrap"><span class="ribbon">Welcome, boss</span></div>
        <p>You run <b>Saffron Bay Delivery Co.</b> Restaurants cook batches of orders, your couriers carry them to the doors.</p>
        <div class="rlines">
          <div class="rl"><span>${ICON('food-burger')} Tap a kitchen to cook a batch</span></div>
          <div class="rl"><span>${ICON('ui-people')} More orders need more couriers, or the food goes cold</span></div>
          <div class="rl"><span>${ICON('ui-building')} Hire a manager: the kitchens cook by themselves, even offline</span></div>
          <div class="rl"><span>${ICON('ui-star')} Sell a franchise for Stars and grow faster next time</span></div></div>
        <button class="btn green big" data-x="ok">Let's go!</button>`, { cls: 'pop' });
      m.card.querySelector('[data-x]').onclick = () => { m.close(); resolve(); };
    });
  }
  function settings() {
    const s = G.settings;
    const m = modal(`<h2>Settings</h2>
      <label class="set">Music<input type="range" min="0" max="1" step="0.05" value="${s.music}" data-k="music"></label>
      <label class="set">Sounds<input type="range" min="0" max="1" step="0.05" value="${s.sfx}" data-k="sfx"></label>
      <label class="set">Graphics<select data-k="quality">${['auto', 'low', 'medium', 'high'].map((q) => `<option ${q === s.quality ? 'selected' : ''}>${q}</option>`).join('')}</select></label>
      <a class="btn blue" href="index.html">Ride as a courier (original game)</a>
      <button class="btn ghost danger" data-x="reset">Start the company over</button>
      <button class="btn green big" data-x="ok">Done</button>`, { cls: 'settings', dismiss: true });
    m.card.addEventListener('input', (e) => { const k = e.target.dataset.k; if (!k) return; s[k] = k === 'quality' ? e.target.value : +e.target.value; game.applySettings(); });
    m.card.addEventListener('click', (e) => {
      const x = e.target.closest('[data-x]')?.dataset.x;
      if (x === 'ok') { m.close(); game.save(); }
      if (x === 'reset') { m.close(); const c = modal(`<h2>Start over?</h2><p>Everything goes, Stars too. This can't be undone.</p><button class="btn red big" data-x="y">Start over</button><button class="btn ghost" data-x="n">Cancel</button>`, { cls: 'pop', dismiss: true });
        c.card.addEventListener('click', (ev) => { const y = ev.target.closest('[data-x]')?.dataset.x; if (y === 'y') game.reset(); if (y) c.close(); }); }
    });
  }

  return { render, live, toast, modal, setTab, selectDistrict, offline, welcome, get tab() { return tab; }, get d() { return st.d; } };
}

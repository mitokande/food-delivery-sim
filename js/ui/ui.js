// DOM UI: hub (top bar, tabs, sheets), ride HUD, modals, toasts.
import * as St from '../state.js';
import { S } from '../state.js';
import { VEHICLES, VEHICLE, PARTS, PART_MAX, partCost, SKILLS, SKILL_MAX, skillCost, DISTRICTS, DISTRICT, DPROFILE, FOODS, ORDER_TYPES, RESTAURANT, RANKS, PREMIUM, ACHIEVEMENTS, CONTRACTS, CONTRACT_DAYS,
  FLEET, fleetRate, PAINTS, PAINT_COST, CHAR_IDS, DAY_END, ENERGY } from '../data.js';
import { HZ } from '../ride/hazards.js';
import { W as WEATHER, RAIN_PAY } from '../weather.js';
import { autoSpeed } from '../orders.js';
import { achValue, achDone } from '../career.js';
import { track } from '../analytics.js';

export const ICON = (n, cls = '') => `<img class="ic ${cls}" src="assets/icons/${n}.webp" alt="" draggable="false" onerror="this.onerror=null;this.src='assets/icons/${n}.png'">`;
// pointer capture throws for pointers that already ended (and for synthetic ones): never let that break input
const capture = (el, e) => { try { el.setPointerCapture(e.pointerId); } catch { /* fine without */ } };
export const money = (n, dec = false) => {
  const a = Math.abs(n), sg = n < 0 ? '−' : '';
  if (a >= 1e6) return `${sg}$${(a / 1e6).toFixed(a >= 1e7 ? 1 : 2)}M`;
  if (a >= 1e4) return `${sg}$${(a / 1e3).toFixed(1)}K`;
  return `${sg}$${dec ? a.toFixed(2) : Math.round(a).toLocaleString('en-US')}`;
};
const clockStr = (m) => { const h = Math.floor(m / 60) % 24, mm = Math.floor(m % 60); return `${String(h).padStart(2, '0')}:${String(mm).padStart(2, '0')}`; };
const mmss = (s) => { const n = Math.max(0, Math.ceil(s)); return `${Math.floor(n / 60)}:${String(n % 60).padStart(2, '0')}`; };
const hmm = (s) => { const n = Math.ceil(s); return n >= 3600 ? `${Math.floor(n / 3600)} h ${String(Math.floor(n % 3600 / 60)).padStart(2, '0')} min` : mmss(n); }; // a longer wait
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const $ = (sel, root = document) => root.querySelector(sel);
const stars = (n, max = 5) => Array.from({ length: max }, (_, i) => ICON(i < n ? 'ui-star' : 'ui-star-empty', 'st')).join('');
const pips = (n, max) => `<span class="pips">${Array.from({ length: max }, (_, i) => `<i class="${i < n ? 'on' : ''}"></i>`).join('')}</span>`;
// the courier run's brake: a car's brake pedal seen from the seat — the arm up into the footwell on a bolted clevis, a
// steel plate leaning away (narrower at the top, its thickness showing below), a ribbed rubber pad. Held, it tips
// forward on its pivot (game.css)
const PEDAL_PLATE = 'M18 26h64a8 8 0 0 1 8 7.4l6 81.6a9 9 0 0 1-9 9.6H13a9 9 0 0 1-9-9.6l6-81.6A8 8 0 0 1 18 26z';
const PEDAL = `<svg viewBox="0 0 100 132" aria-hidden="true"><defs>
  <linearGradient id="pd-arm" x2="1"><stop offset="0" stop-color="#23272d"/><stop offset=".45" stop-color="#9aa3af"/><stop offset="1" stop-color="#1f2328"/></linearGradient>
  <linearGradient id="pd-rim" x2="0" y2="1"><stop offset="0" stop-color="#f5f7fa"/><stop offset=".55" stop-color="#a3acb8"/><stop offset="1" stop-color="#dfe3e8"/></linearGradient>
  <linearGradient id="pd-rub" x2="0" y2="1"><stop offset="0" stop-color="#363b43"/><stop offset="1" stop-color="#121418"/></linearGradient>
  <linearGradient id="pd-rib" x2="0" y2="1"><stop offset="0" stop-color="#6b7380"/><stop offset=".35" stop-color="#454b55"/><stop offset="1" stop-color="#262a30"/></linearGradient></defs>
  <path d="M45 0h10l1 24H44z" fill="url(#pd-arm)"/>
  <rect x="37" y="16" width="26" height="13" rx="3.5" fill="url(#pd-arm)" stroke="#16191d" stroke-width="1.2"/><circle cx="50" cy="22.5" r="3.2" fill="#c9cfd6" stroke="#22262b" stroke-width="1.2"/>
  <path d="${PEDAL_PLATE}" transform="translate(0 5)" fill="#4b525c" stroke="#16191d" stroke-width="2"/>
  <path d="${PEDAL_PLATE}" fill="url(#pd-rim)" stroke="#262b33" stroke-width="2"/>
  <path d="M20 28.6h60" stroke="#fff" stroke-opacity=".8" stroke-width="1.6" stroke-linecap="round"/>
  <path d="M22 33h56a5 5 0 0 1 5 4.6l5 69.8a6 6 0 0 1-6 6.6H18a6 6 0 0 1-6-6.6l5-69.8a5 5 0 0 1 5-4.6z" fill="url(#pd-rub)"/>
  ${[41, 50, 59, 68, 77, 86].map((y) => { const x = 21 - (y - 37) * 0.07; return `<rect x="${x.toFixed(1)}" y="${y}" width="${(100 - 2 * x).toFixed(1)}" height="5.5" rx="2.75" fill="url(#pd-rib)"/>`; }).join('')}
  <text x="50" y="106" text-anchor="middle">BRAKE</text></svg>`;
const km = (m) => m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m / 10) * 10} m`;

export function createUI(game) {
  const root = document.getElementById('ui');
  root.innerHTML = `
  <div id="hubui">
    <header class="topbar">
      <button class="who" data-act="tab" data-tab="courier"><span class="ava">${ICON('char-' + S.look.char)}</span>
        <span class="lvwrap"><span class="shield"><b class="lvl">1</b></span></span>
        <span class="lvlbox"><small class="nm"></small><span class="xpbar"><i></i><em class="xptext"></em></span></span></button>
      <button class="res energy" data-act="energy" aria-label="Energy">${ICON('ui-bolt')}<b class="env">10</b><small class="ent"></small></button>
      <span class="res cash">${ICON('ui-cash')}<b class="cashv">$0</b></span>
      <button class="gear" data-act="settings" aria-label="Settings"><svg viewBox="0 0 24 24"><path fill="currentColor" d="M19.4 13a7.6 7.6 0 0 0 0-2l2.1-1.6-2-3.5-2.5 1a7.4 7.4 0 0 0-1.7-1L15 3.3h-4l-.4 2.6a7.4 7.4 0 0 0-1.7 1l-2.5-1-2 3.5L6.6 11a7.6 7.6 0 0 0 0 2l-2.1 1.6 2 3.5 2.5-1c.5.4 1.1.7 1.7 1l.4 2.6h4l.4-2.6c.6-.3 1.2-.6 1.7-1l2.5 1 2-3.5zM13 15.5A3.5 3.5 0 1 1 13 8.5a3.5 3.5 0 0 1 0 7z" transform="translate(-1 0)"/></svg></button>
    </header>
    <div class="clockbar"><span class="clockchip"><span class="tod"></span><b class="clock">08:00</b><span class="day">Day 1</span></span><span class="rush" hidden></span><span class="rainchip" hidden>${ICON('ui-rain')}Rain pay ×${RAIN_PAY}</span><button class="fleetbank" data-act="collect" hidden>${ICON('ui-cash')}<b></b></button><span class="res rate">${ICON('ui-star')}<b class="ratev">4.5</b></span></div>
    <section id="sheet" class="sheet"><div class="sheet-rib ribwrap" data-act="grab"><span class="ribbon"></span></div><div class="grab" data-act="grab"><i></i></div><div class="sheet-body"></div></section>
    <div id="startbar" hidden></div>
    <nav class="tabs">
      <button data-act="tab" data-tab="city">${ICON('ui-pin')}<span>City</span></button>
      <button data-act="tab" data-tab="garage">${ICON('ui-wrench')}<span>Garage</span></button>
      <button data-act="tab" data-tab="courier">${ICON('ui-speed')}<span>Courier</span></button>
      <button data-act="tab" data-tab="jobs">${ICON('ui-building')}<span>Jobs</span></button>
      <button data-act="tab" data-tab="fleet">${ICON('ui-people')}<span>Fleet</span><i class="dot" hidden></i></button>
    </nav>
  </div>
  <div id="ridehud" hidden>
    <div id="speedlines"></div>
    <div class="r-flow" hidden><b>FLOW <em>×1.0</em></b><i><u></u></i></div>
    <div class="r-pops"></div>
    <div class="r-top">
      <div class="r-order"><span class="r-food"></span><span class="r-what"><small class="r-verb">Pick up at</small><b class="r-name"></b></span><span class="r-dist"></span></div>
      <div class="r-timer"><span class="tw"><span><b>0:00</b><small>left</small></span></span></div>
    </div>
    <div class="r-sub">
      <div class="r-cond" hidden><span class="m heat">${ICON('ui-thermo')}<i><u></u></i></span><span class="m integ">${ICON('ui-package')}<i><u></u></i></span></div>
      <canvas class="r-map" width="240" height="240"></canvas>
    </div>
    <div class="r-ctx"></div>
    <div class="r-speed"><svg viewBox="0 0 72 40" aria-hidden="true"><path class="trk" d="M6 36a30 30 0 0 1 60 0" pathLength="100"/><path class="val" d="M6 36a30 30 0 0 1 60 0" pathLength="100"/></svg><b>0</b><small>km/h</small><em class="gear" hidden></em></div>
    <div class="r-limit" hidden><b></b><small></small></div>
    <div class="r-lanes" hidden><div class="draft"><u></u><span>DRAFT</span></div><div class="row"><i data-l="-1"></i><i data-l="0"></i><i data-l="1"></i></div></div>
    <div class="r-hint" hidden></div>
    <div class="r-turn" hidden><button data-r="-1"><i>⬅</i><small></small></button><button data-r="0"><i>⬆</i><small></small></button><button data-r="1"><i>➡</i><small></small></button></div>
    <div class="r-proto" hidden></div>
    <button class="r-btn horn" data-ride="horn" aria-label="Horn">${ICON('ui-horn')}</button>
    <button class="r-btn hop" data-ride="hop" aria-label="Hop">${ICON('ui-jump')}<span>HOP</span></button>
    <button class="r-btn boost" data-ride="boost" aria-label="Turbo"><i class="ring"></i>${ICON('ui-nitro')}<span>TURBO</span></button>
    <button class="r-btn stop" data-ride="stop" aria-label="Stop" hidden><b>STOP</b><small></small></button>
    <button class="r-btn brake" data-ride="brake" aria-label="Brake">${PEDAL}</button>
    <div class="r-keys">Space turbo · W hop · S stop · E action · H horn · drag to look</div>
  </div>
  <div id="modals"></div>
  <div id="toasts"></div>`;

  const hub = $('#hubui'), hud = $('#ridehud'), sheet = $('#sheet'), body = $('.sheet-body'), modals = $('#modals'), toasts = $('#toasts'), startbar = $('#startbar');
  let tab = 'city';
  let sheetState = 'mid'; // min | mid | max
  const state = { selVeh: S.active };

  // ---------- generic ----------
  function toast(text, kind = '') {
    const el = document.createElement('div');
    el.className = 'toast ' + kind; el.innerHTML = text;
    toasts.append(el);
    setTimeout(() => el.classList.add('out'), kind === 'cash' ? 900 : 1700);
    setTimeout(() => el.remove(), kind === 'cash' ? 1300 : 2200);
    while (toasts.children.length > 4) toasts.firstChild.remove();
  }
  function modal(html, { cls = '', dismiss = false } = {}) {
    const wrap = document.createElement('div');
    wrap.className = 'modal ' + cls;
    wrap.innerHTML = `<div class="card">${html}</div>`;
    modals.append(wrap);
    requestAnimationFrame(() => wrap.classList.add('in'));
    const close = () => { wrap.classList.remove('in'); wrap.classList.add('out'); setTimeout(() => wrap.remove(), 250); };
    if (dismiss) { wrap.dataset.dismiss = ''; wrap.addEventListener('click', (e) => { if (e.target === wrap) close(); }); } // (the app's back button too)
    return { el: wrap, card: wrap.firstElementChild, close };
  }
  const tap = () => game.audio?.play('ui-tap');

  // ---------- motion ----------
  const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const fly = document.createElement('div'); fly.id = 'fly'; document.body.append(fly);
  // coins burst out of a button and land on the cash counter (or where it sits while the hub is hidden)
  function coinsTo(from, n = 8) {
    if (calm || !from || !from.isConnected) return;
    const a = from.getBoundingClientRect(), cash = $('.topbar .cash', hub);
    const b = !hub.hidden && cash ? cash.getBoundingClientRect() : { left: innerWidth - 120, top: 14, height: 34 };
    const x0 = a.left + a.width / 2, y0 = a.top + a.height / 2, x1 = b.left + 10, y1 = b.top + b.height / 2;
    for (let i = 0; i < n; i++) {
      const c = document.createElement('img'); c.className = 'flycoin'; c.src = 'assets/icons/ui-coin.webp'; c.alt = '';
      fly.append(c);
      const ang = Math.random() * Math.PI * 2, r = 30 + Math.random() * 45;
      const xm = x0 + Math.cos(ang) * r, ym = y0 + Math.sin(ang) * r * 0.7 - 24;
      c.animate([
        { transform: `translate(${x0}px, ${y0}px) scale(.4)`, opacity: 0 },
        { transform: `translate(${xm}px, ${ym}px) scale(1.15)`, opacity: 1, offset: 0.3 },
        { transform: `translate(${x1}px, ${y1}px) scale(.5)`, opacity: 1 },
      ], { duration: 650 + i * 55, delay: i * 25, easing: 'cubic-bezier(.45,0,.7,1)', fill: 'both' }).onfinish = () => c.remove();
    }
  }
  // the cash counter rolls up to new money (once it is on screen); spending updates it at once
  let shownCash = S.cash, cashRaf = 0;
  function setCash() {
    const el = $('.cashv', hub);
    if (S.cash <= shownCash || calm) { cancelAnimationFrame(cashRaf); cashRaf = 0; shownCash = S.cash; el.textContent = money(S.cash); return; }
    if (hub.hidden || cashRaf) return;
    const from = shownCash, t0 = performance.now(), box = $('.topbar .cash', hub);
    box.classList.remove('gain'); void box.offsetWidth; box.classList.add('gain');
    const step = () => {
      const f = Math.min(1, (performance.now() - t0) / 800);
      el.textContent = money(from + (S.cash - from) * (1 - Math.pow(1 - f, 3)));
      if (f < 1) cashRaf = requestAnimationFrame(step); else { cashRaf = 0; shownCash = S.cash; el.textContent = money(S.cash); }
    };
    cashRaf = requestAnimationFrame(step);
  }

  // the ⚡ chip: energy / tank, and while it fills the time to the next one
  let shownEnergy = null;
  function setEnergy() {
    const n = St.tickEnergy(), max = St.energyMax(), eta = St.energyEta(), chip = $('.topbar .energy', hub);
    if (shownEnergy != null && n > shownEnergy && !hub.hidden) { chip.classList.remove('bump'); void chip.offsetWidth; chip.classList.add('bump'); }
    shownEnergy = n;
    $('.env', chip).textContent = `${n}/${max}`;
    $('.ent', chip).textContent = eta.next ? mmss(eta.next / 1000) : '';
    chip.classList.toggle('low', n < game.energyFor(1) * 2);
    chip.classList.toggle('over', n > max);
  }

  // ---------- top bar ----------
  function refreshTop() {
    $('.lvl', hub).textContent = S.lvl;
    $('.nm', hub).textContent = S.name || `Level ${S.lvl}`;
    const night = S.clock >= 20.5 * 60 || S.clock < 6 * 60, tod = $('.tod', hub);
    if (tod.dataset.n !== String(night)) { tod.dataset.n = String(night); tod.innerHTML = ICON(night ? 'ui-moon' : 'ui-sun'); }
    const need = St.xpNeed();
    $('.xpbar i', hub).style.width = `${Math.min(100, S.xp / need * 100)}%`;
    $('.xptext', hub).textContent = `${S.xp}/${need}`;
    setCash(); setEnergy();
    $('.ratev', hub).textContent = St.rating().toFixed(1);
    $('.ava', hub).innerHTML = ICON('char-' + S.look.char);
    $('.day', hub).textContent = `Day ${S.day}`;
    $('.clock', hub).textContent = clockStr(S.clock);
    const r = St.rushMult(); const rs = $('.rush', hub);
    rs.hidden = r.m <= 1; rs.textContent = `${r.name} ×${r.m}`;
    $('.rainchip', hub).hidden = !(WEATHER.rain > 0.35);
    const fb = $('.fleetbank', hub);
    const bank = Math.floor(S.fleet.bank);
    fb.hidden = !(S.fleet.office && bank >= 1);
    $('b', fb).textContent = '+' + money(bank);
    $('.tabs .dot', hub).hidden = !((S.lvl >= FLEET.unlockLvl && !S.fleet.office) || (S.fleet.events || []).length);
  }

  // ---------- tabs ----------
  function setTab(t) {
    tab = t;
    for (const b of hub.querySelectorAll('.tabs button')) b.classList.toggle('on', b.dataset.tab === t);
    sheet.dataset.tab = t;
    sheetState = t === 'city' ? (sheetState === 'min' ? 'min' : 'mid') : 'big';
    sheet.dataset.state = sheetState;
    render();
    game.onTab?.(t);
  }
  let renderedTab = null;
  function render() {
    const fn = { city: renderCity, garage: renderGarage, courier: renderCourier, jobs: renderJobs, fleet: renderFleet }[tab];
    const keep = renderedTab === tab ? body.scrollTop : 0;
    body.innerHTML = fn();
    body.scrollTop = keep;
    // the tab's title rides on the ribbon over the sheet's top edge (and pops in when it changes)
    const rib = $('.sheet-rib .ribbon', sheet), title = body.querySelector('.sec-head h2')?.textContent || '';
    if (rib.textContent !== title) { rib.textContent = title; rib.classList.remove('pop'); void rib.offsetWidth; rib.classList.add('pop'); }
    renderedTab = tab;
    refreshStartbar();
  }
  // taken orders + Start button, always on screen just above the tab bar
  let startKey = '';
  function refreshStartbar() {
    const show = tab === 'city' && game.taken.length > 0 && !hub.hidden;
    startbar.hidden = !show;
    sheet.classList.toggle('has-start', show);
    if (!show) { startKey = ''; return; }
    const cap = St.vehStats().cap, used = game.taken.reduce((a, o) => a + o.size, 0);
    const pay = game.taken.reduce((a, o) => a + o.base, 0);
    const need = game.energyFor(game.taken.length), short = need > St.tickEnergy();
    startbar.classList.toggle('short', short);
    const key = game.taken.map((o) => o.id).join(',') + '|' + cap + '|' + need + short;
    if (key === startKey) return;
    const grew = startKey && key.split('|')[0].split(',').length > startKey.split('|')[0].split(',').length;
    startKey = key;
    startbar.dataset.act = 'start';
    startbar.innerHTML = `<i class="sb-n">${game.taken.length}</i><span class="sb-foods">${game.taken.map((o) => ICON(FOODS[o.food].icon)).join('')}</span>
      <span class="sb-info"><b>${game.taken.length === 1 ? esc(game.taken[0].restName) : `${game.taken.length} orders`}</b><small>${money(pay)} + tips · box ${used}/${cap}</small></span>
      <button class="sb-go" data-act="start">${ICON('ui-nitro')}START!</button>${need ? `<em class="sb-cost">${ICON('ui-bolt')}${need}</em>` : ''}`;
    if (grew) { startbar.classList.remove('bump'); void startbar.offsetWidth; startbar.classList.add('bump'); }
  }

  // ---------- City: order board ----------
  function orderCard(o, taken) {
    const T = ORDER_TYPES[o.type];
    const d = DISTRICT[o.district];
    const left = Math.max(0, o.life - (performance.now() - o.born) / 1000);
    const est = Math.round((o.pickM + o.dropM) / autoSpeed(o.district) + 5); // autopilot alone, no turbo
    const badges = `${T.badge ? `<em class="badge b-${o.type}">${T.badge}</em>` : ''}${o.rain ? '<em class="badge b-rain">RAIN</em>' : ''}${o.size > 1 ? `<em class="badge">${o.size} slots</em>` : ''}`;
    return `<div class="ocard ${taken ? 'taken' : ''} ${game.selOrder === o.id ? 'sel' : ''}" data-act="order" data-id="${o.id}">
      <span class="ofood">${ICON(FOODS[o.food].icon)}</span>
      <span class="oinfo"><b><span class="onm">${esc(o.restName)}</span>${badges}</b><small>to ${esc(o.name)} · <i style="color:${d.color}">${d.name}</i></small>
        <span class="ometa"><span>${ICON('ui-route')}${km(o.pickM + o.dropM)}</span><span>${ICON('ui-clock')}${mmss(o.eta)}</span><i class="est ${est <= o.eta * 0.85 ? 'fast' : est > o.eta ? 'slow' : ''}">you ~${mmss(est)}</i></span></span>
      <span class="opay"><span class="price">${ICON('ui-cash')}${money(o.base)}</span><span class="otake">${taken ? '✓ Taken' : 'Take'}</span></span>
      <i class="olife" style="width:${Math.min(100, left / o.life * 100)}%"></i>
    </div>`;
  }
  function renderCity() {
    const cap = St.vehStats().cap;
    const used = game.taken.reduce((a, o) => a + o.size, 0);
    const list = game.board;
    const start = game.taken.length
      ? ''
      : `<div class="hint">${list.length ? `Tap an order to take it. Your ${VEHICLE[S.active].name} carries <b>${cap}</b>.` : 'No orders right now — new ones pop up every few seconds.'}</div>`;
    const goals = St.ensureGoals().list.map((g, i) => `<div class="goal ${g.p >= g.n ? 'done' : ''}">${ICON(g.p >= g.n ? 'ui-gift' : 'ui-trophy')}<span>${goalText(g)}<i><u style="width:${g.p / g.n * 100}%"></u></i></span>
      ${g.claimed ? '<em>✓</em>' : g.p >= g.n ? `<button class="btn gold sm" data-act="claim" data-i="${i}">${money(g.reward)}<small class="gen">+${ENERGY.goal}${ICON('ui-bolt')}</small></button>` : `<small>${g.p}/${g.n}</small>`}</div>`).join('');
    // work one district only, or all of them
    const open = DISTRICTS.filter((d) => S.districts[d.id]);
    const focus = S.focus && S.districts[S.focus] ? S.focus : '';
    const filter = open.length > 1 ? `<div class="dfilter"><button class="${focus ? '' : 'on'}" data-act="focus" data-d="">All</button>${open.map((d) => `<button class="${focus === d.id ? 'on' : ''}" style="--dc:${d.color}" data-act="focus" data-d="${d.id}">${d.name}<small>×${d.pay}</small></button>`).join('')}</div>` : '';
    return `<div class="sec-head"><h2>Orders</h2><span class="sub">${St.rushMult().m > 1 ? `${ICON('ui-nitro')} ${St.rushMult().name}` : `${list.length} nearby`}</span></div>
      ${filter}
      <div class="orders">${list.map((o) => orderCard(o, game.taken.includes(o))).join('')}</div>
      ${start}
      <div class="sec-head"><h2>Today</h2><span class="sub">Day ${S.day} goals</span></div><div class="goals">${goals}</div>
      ${renderWeek()}`;
  }
  function renderWeek() {
    const w = St.ensureWeek(); if (!w) return '';
    const left = w.from + CONTRACT_DAYS - S.day;
    const rows = w.list.map((c, i) => {
      const T = CONTRACTS.find((x) => x.id === c.id);
      const text = T ? T.text(c.n, c.d ? DISTRICT[c.d].name : '') : c.id;
      return `<div class="goal ${c.p >= c.n ? 'done' : ''}">${ICON(c.p >= c.n ? 'ui-gift' : 'ui-trophy')}<span>${text}<i><u style="width:${c.p / c.n * 100}%"></u></i></span>
        ${c.claimed ? '<em>✓</em>' : c.p >= c.n ? `<button class="btn gold sm" data-act="contract" data-i="${i}">${money(c.reward)}</button>` : `<small>${c.id === 'earn' ? money(c.p) : c.p}/${c.id === 'earn' ? money(c.n) : c.n}</small>`}</div>`;
    }).join('');
    const prem = w.bonus.paint && PREMIUM.find((p) => p.id === w.bonus.paint);
    const all = w.list.every((c) => c.claimed);
    const bonus = `<div class="goal bonus ${all ? 'done' : ''}"><span class="sw prem" style="--c:${prem ? prem.color : '#ffd56b'}"></span><span>All three: <b>${prem ? prem.name + ' finish' : money(w.bonus.cash)}</b></span>
      ${w.bonusClaimed ? '<em>✓</em>' : all ? `<button class="btn gold sm" data-act="weekbonus">Claim</button>` : ''}</div>`;
    return `<div class="sec-head"><h2>Contract</h2><span class="sub">${left > 1 ? `${left} days left` : 'last day'}</span></div><div class="goals">${rows}${bonus}</div>`;
  }
  function goalText(g) {
    const t = { deliver: `Deliver ${g.n} orders`, five: `Get ${g.n} five-star ratings`, shortcut: `Take ${g.n} shortcuts`, overtake: `Overtake ${g.n} cars`, perfect: `Land ${g.n} perfect hops`, early: `Deliver ${g.n} orders early`, nodamage: `${g.n} deliveries with no damage` };
    return t[g.id] || g.id;
  }

  // ---------- Garage ----------
  function stat(label, v, max, txt) { return `<div class="stat"><span>${label}</span><i><u style="width:${Math.min(100, v / max * 100)}%"></u></i><b>${txt}</b></div>`; }
  // premium finishes: owned ones apply like paint; others show a price (or a trophy when they are won, not bought)
  function premiumSwatches(cur, which, vid) {
    return PREMIUM.map((p) => {
      const own = St.hasPaint(p.id);
      const act = own ? (which === 'helmet' ? `data-act="helmet" data-c="${p.color}"` : `data-act="paint" data-w="${which}" data-c="${p.color}" data-id="${vid}"`) : p.award ? 'data-act="premiuminfo"' : `data-act="buypaint" data-id="${p.id}"`;
      return `<button class="sw prem ${own ? '' : 'locked'} ${cur === p.color ? 'on' : ''} ${p.glow ? 'glow' : ''} ${p.metal ? 'metal' : ''}" style="--c:${p.color}" ${act} title="${p.name}">
        ${own ? '' : `<small>${p.award ? '🏆' : money(p.price)}</small>`}</button>`;
    }).join('');
  }
  function renderGarage() {
    const sel = VEHICLE[state.selVeh] ? state.selVeh : S.active;
    const v = VEHICLE[sel], own = St.owned(sel), vs = St.vehStats(sel);
    const cards = VEHICLES.map((x) => `<button class="vcard ${x.id === sel ? 'sel' : ''} ${St.owned(x.id) ? 'own' : ''}" data-act="veh" data-id="${x.id}">
      <img src="assets/icons/veh-${x.id}.png" alt="" onerror="this.style.opacity=0">
      <b>${x.name}</b><small>${St.owned(x.id) ? (S.active === x.id ? 'Riding' : `Owned${St.owned(x.id) > 1 ? ' ×' + St.owned(x.id) : ''}`) : money(x.price)}</small></button>`).join('');
    let actions = '';
    if (!own) actions = `<button class="btn green big" data-act="buyveh" data-id="${sel}" ${S.cash < v.price ? 'disabled' : ''}>Buy ${money(v.price)}</button>`;
    else if (S.active !== sel) actions = `<button class="btn blue big" data-act="ride" data-id="${sel}" ${St.freeVehicles(sel) + (S.active === sel ? 1 : 0) <= 0 ? 'disabled' : ''}>Ride this one</button>
      <button class="btn ghost" data-act="buyveh" data-id="${sel}">Buy another for the fleet · ${money(v.price)}</button>`;
    else actions = `<div class="riding">${ICON('ui-helmet') ? '' : ''}You are riding this one${S.fleet.office ? ` · <button class="link" data-act="buyveh" data-id="${sel}">buy another for the fleet (${money(v.price)})</button>` : ''}</div>`;
    const parts = own ? PARTS.map((p) => {
      const lv = S.vehicles[sel].parts[p.id] || 0, cost = partCost(v, p.id, lv);
      return `<div class="row">${ICON(p.icon)}<span class="rt"><b>${p.name}</b><small>${p.desc}</small>${pips(lv, PART_MAX)}</span>
        ${lv >= PART_MAX ? '<em class="max">MAX</em>' : `<button class="btn green sm" data-act="part" data-id="${sel}" data-p="${p.id}" ${S.cash < cost ? 'disabled' : ''}>${ICON('ui-coin')} ${money(cost)}</button>`}</div>`;
    }).join('') : '';
    const paint = own ? `<div class="sec-head"><h3>Paint</h3><span class="sub">${money(PAINT_COST)} each</span></div>
      <div class="swatches">${PAINTS.map((c) => `<button class="sw ${vs.paint === c ? 'on' : ''}" style="--c:${c}" data-act="paint" data-w="paint" data-c="${c}" data-id="${sel}"></button>`).join('')}</div>
      <div class="swatches prem-row">${premiumSwatches(vs.paint, 'paint', sel)}</div>
      <div class="sec-head"><h3>Delivery box</h3></div>
      <div class="swatches">${PAINTS.map((c) => `<button class="sw box ${vs.boxColor === c ? 'on' : ''}" style="--c:${c}" data-act="paint" data-w="box" data-c="${c}" data-id="${sel}"></button>`).join('')}</div>
      <div class="swatches prem-row">${premiumSwatches(vs.boxColor, 'box', sel)}</div>` : '';
    return `<div class="sec-head"><h2>Garage</h2><span class="sub">${money(S.cash)} to spend</span></div>
      <div class="vcards">${cards}</div>
      <div class="vdetail"><h3>${v.name}</h3><p class="desc">${v.desc}</p>
        ${stat('Top speed', vs.top * 3.6, 90, Math.round(vs.top * 3.6) + ' km/h')}
        ${stat('Capacity', vs.cap, 5, vs.cap + (vs.cap > 1 ? ' orders' : ' order'))}
        ${stat('Smoothness', 2 - vs.bump, 1.6, Math.round((2 - vs.bump) / 1.6 * 100) + '%')}
        ${stat('Fuel', 5 - vs.fuel, 5, '$' + vs.fuel.toFixed(2) + '/km')}
        ${v.breakdown ? stat('Reliability', 1 - vs.breakdown, 1, Math.round((1 - vs.breakdown) * 100) + '%') : ''}
        <div class="actions">${actions}</div></div>
      ${own ? `<div class="sec-head"><h3>Upgrades</h3></div><div class="rows">${parts}</div>${paint}` : ''}`;
  }

  // ---------- Courier ----------
  function renderCourier() {
    const rows = SKILLS.map((k) => {
      const lv = St.skill(k.id), cost = skillCost(lv), req = St.skillReq(k.id);
      const locked = S.lvl < req;
      return `<div class="row">${ICON(k.icon)}<span class="rt"><b>${k.name}</b><small>${k.desc}</small>${pips(lv, SKILL_MAX)}</span>
        ${lv >= SKILL_MAX ? '<em class="max">MAX</em>' : locked ? `<em class="req">${ICON('ui-lock')} Lv ${req}</em>` : `<button class="btn green sm" data-act="skill" data-id="${k.id}" ${S.cash < cost ? 'disabled' : ''}>${ICON('ui-coin')} ${money(cost)}</button>`}</div>`;
    }).join('');
    const chars = CHAR_IDS.map((c) => `<button class="pchar ${S.look.char === c ? 'on' : ''}" data-act="char" data-c="${c}">${ICON('char-' + c)}</button>`).join('');
    const helm = PAINTS.map((c) => `<button class="sw ${S.look.helmet === c ? 'on' : ''}" style="--c:${c}" data-act="helmet" data-c="${c}"></button>`).join('');
    const st = S.stats;
    return `<div class="sec-head"><h2>Courier</h2><span class="sub">Level ${S.lvl} · ★ ${St.rating().toFixed(2)}</span></div>
      <div class="rows">${rows}</div>
      <div class="sec-head"><h3>Look</h3><span class="sub">free</span></div>
      <div class="pchars">${chars}</div>
      <div class="sec-head"><h3>Helmet</h3></div><div class="swatches">${helm}</div><div class="swatches prem-row">${premiumSwatches(S.look.helmet, 'helmet')}</div>
      <div class="sec-head"><h3>Career</h3></div>
      <div class="career"><span><b>${st.deliveries}</b>deliveries</span><span><b>${money(st.earned)}</b>earned</span><span><b>${st.fiveStars}</b>five stars</span>
        <span><b>${(st.meters / 1000).toFixed(1)} km</b>ridden</span><span><b>${st.overtakes}</b>overtakes</span><span><b>${money(st.bestTip)}</b>best tip</span></div>
      <div class="sec-head"><h3>Achievements</h3><span class="sub">${ACHIEVEMENTS.filter(achDone).length}/${ACHIEVEMENTS.length}</span></div>
      <div class="achs">${ACHIEVEMENTS.map((a) => { const done = achDone(a), v = Math.min(a.n, achValue(a)); const prem = a.paint && PREMIUM.find((p) => p.id === a.paint);
        return `<div class="ach ${done ? 'done' : ''}">${ICON(done ? 'ui-trophy' : 'ui-star')}<span><b>${a.name}</b><small>${a.desc}</small>${done ? '' : `<i><u style="width:${v / a.n * 100}%"></u></i>`}</span>
          <em>${prem ? `<span class="sw prem mini" style="--c:${prem.color}"></span>` : money(a.cash)}</em></div>`; }).join('')}</div>`;
  }

  // ---------- Jobs ----------
  function empBlock(d) {
    const e = St.empState(d.id);
    const next = e.next ? `<small>${e.del}/${e.next.del} deliveries${e.next.rating ? ` · ★${e.next.rating.toFixed(1)}+` : ''} → <b>${e.next.name}</b></small><i class="rk"><u style="width:${Math.min(100, e.del / e.next.del * 100)}%"></u></i>` : '<small>Top rank. Legend.</small>';
    const warn = e.suspended ? `<div class="emp-warn bad">${ICON('ui-lock')} Suspended for today — rating here ★${e.avg.toFixed(1)}. Orders return tomorrow.</div>`
      : e.probation ? `<div class="emp-warn">${ICON('ui-star')} On probation: keep ★${e.req.toFixed(1)}+ here (now ★${e.avg.toFixed(1)}). Rank perks paused.</div>` : '';
    return `<div class="hired rank-${e.rank.id}">${ICON('ui-star')} ${e.rank.name}${e.n ? ` · ★${e.avg.toFixed(1)} here` : ''}${e.rank.perk ? ` · <span class="perk">${e.rank.perk}</span>` : ''}</div>
      <div class="rankbar">${next}</div>${warn}`;
  }
  function renderJobs() {
    const cards = DISTRICTS.map((d) => {
      const s = St.districtStatus(d.id);
      const req = [];
      if (d.req.lvl > 1) req.push([`Level ${d.req.lvl}`, S.lvl >= d.req.lvl]);
      if (d.req.rating) req.push([`★ ${d.req.rating.toFixed(1)} rating`, St.rating() >= d.req.rating]);
      if (d.req.tier) req.push(['A real scooter (not the Rust Bucket)', Object.keys(S.vehicles).some((v) => VEHICLE[v].tier >= d.req.tier)]);
      if (d.req.speed) req.push([`A ${d.req.speed}+ km/h vehicle`, Object.keys(S.vehicles).some((v) => VEHICLE[v].speed >= d.req.speed)]);
      return `<div class="dcard ${s.open ? 'open' : ''}" style="--dc:${d.color}" data-act="district" data-id="${d.id}">
        <div class="dh"><b>${d.name}</b><span class="mult">×${d.pay} pay</span></div>
        <small class="emp">${d.employer}</small><p>${d.desc}</p>
        <div class="traits">${(DPROFILE[d.id]?.traits || []).map((t) => `<span>${t}</span>`).join('')}</div>
        ${s.open ? empBlock(d) : `<ul class="reqs">${req.map(([t, ok]) => `<li class="${ok ? 'ok' : ''}">${ok ? '✓' : '✗'} ${t}</li>`).join('')}</ul>
        <button class="btn ${s.canApply ? 'green' : 'locked'}" data-act="apply" data-id="${d.id}" ${s.canApply && S.cash >= d.fee ? '' : 'disabled'}>${s.canApply ? `Apply · ${money(d.fee)}` : `${ICON('ui-lock')} Locked`}</button>`}
      </div>`;
    }).join('');
    return `<div class="sec-head"><h2>Jobs</h2><span class="sub">Better districts pay more</span></div><div class="dcards">${cards}</div>`;
  }

  // ---------- Fleet ----------
  function renderFleet() {
    const f = S.fleet;
    if (S.lvl < FLEET.unlockLvl) return `<div class="sec-head"><h2>Fleet</h2></div><div class="empty">${ICON('ui-lock', 'big')}<b>Unlocks at Level ${FLEET.unlockLvl}</b>
      <p>Rent a dispatch office and hire freelance couriers. They deliver while you ride — and even while you're away.</p></div>`;
    if (!f.office) return `<div class="sec-head"><h2>Fleet</h2></div><div class="empty">${ICON('ui-building', 'big')}<b>Dispatch Office</b>
      <p>Hire freelance couriers who earn money for you every minute, even offline.</p>
      <button class="btn green big" data-act="office" ${S.cash < FLEET.officeCost ? 'disabled' : ''}>Rent office · ${money(FLEET.officeCost)}</button></div>`;
    const L = St.officeLevel(), next = FLEET.levels[f.level + 1];
    const perMin = St.fleetPerMin();
    const opts = (cur, list) => list.map(([v, t]) => `<option value="${v}" ${v === cur ? 'selected' : ''}>${t}</option>`).join('');
    const couriers = f.couriers.map((c) => {
      const vehOpts = [[c.veh, VEHICLE[c.veh].name + (c.own ? ' (own)' : '')], ...VEHICLES.filter((v) => v.id !== c.veh && St.freeVehicles(v.id) > 0).map((v) => [v.id, `${v.name} (company)`])];
      return `<div class="crow">${ICON('char-' + c.char, 'cava')}<span class="rt"><b>${esc(c.name)}</b>${pips(c.skill, 5)}
        <span class="sel"><select data-act="cdist" data-id="${c.id}">${opts(c.district, DISTRICTS.filter((d) => S.districts[d.id]).map((d) => [d.id, d.name]))}</select>
        <select data-act="cveh" data-id="${c.id}">${opts(c.veh, vehOpts)}</select></span>
        <small>${c.benched >= S.day ? 'benched today' : `${money(St.courierRate(c), true)}/min`}${c.boostUntil > Date.now() ? ' · catering ×2.5' : ''} · cut ${Math.round((c.cut ?? FLEET.commission) * 100)}% · ${money(St.courierWage(c))}/day</small></span>
        <span class="cbtns">${c.skill < 5 ? `<button class="btn blue sm" data-act="train" data-id="${c.id}" ${S.cash < St.trainCost(c) ? 'disabled' : ''}>Train ${money(St.trainCost(c))}</button>` : ''}
        <button class="btn ghost sm" data-act="fire" data-id="${c.id}">Let go</button></span></div>`;
    }).join('') || '<div class="hint">No couriers yet — hire one below.</div>';
    const apps = (f.applicants || []).map((a) => `<div class="crow app">${ICON('char-' + a.char, 'cava')}<span class="rt"><b>${esc(a.name)}</b>${pips(a.skill, 5)}<small>Brings a ${VEHICLE[a.ownVeh].name} · ~${money(fleetRate('oldtown', a.ownVeh, a.skill) * 0.8, true)}/min</small></span>
      <button class="btn green sm" data-act="hire" data-id="${a.id}" ${S.cash < a.fee || f.couriers.length >= L.slots ? 'disabled' : ''}>Hire ${money(a.fee)}</button></div>`).join('');
    const evs = (f.events || []).map((ev) => fleetEventCard(ev)).join('');
    const wages = f.couriers.reduce((a, c) => a + St.courierWage(c), 0);
    return `<div class="sec-head"><h2>Fleet</h2><span class="sub">${f.couriers.length}/${L.slots} couriers</span></div>
      ${evs ? `<div class="fevs">${evs}</div>` : ''}
      <div class="bank"><span>${ICON('ui-cash')}<b>${money(Math.floor(f.bank))}</b><small>${money(perMin, true)}/min · ×${FLEET.dispatch} while you ride · offline up to ${L.cap} h${wages ? ` · wages ${money(wages)}/day` : ''}</small></span>
        <button class="btn gold" data-act="collect" ${f.bank < 1 ? 'disabled' : ''}>Collect</button></div>
      ${next ? `<div class="row">${ICON('ui-building')}<span class="rt"><b>Office level ${f.level + 1}</b><small>Next: ${next.slots} couriers, ${next.cap} h offline</small></span><button class="btn green sm" data-act="officeup" ${S.cash < next.cost ? 'disabled' : ''}>${money(next.cost)}</button></div>` : ''}
      <div class="sec-head"><h3>Your couriers</h3></div><div class="crows">${couriers}</div>
      <div class="sec-head"><h3>Applicants</h3><button class="link" data-act="reroll">new applicants · $20</button></div><div class="crows">${apps}</div>`;
  }

  function fleetEventCard(ev) {
    const c = S.fleet.couriers.find((x) => x.id === ev.cid);
    const names = (ev.cids || []).map((id) => S.fleet.couriers.find((x) => x.id === id)?.name).filter(Boolean).join(' & ');
    const T = {
      crash: [`${esc(c?.name || 'A courier')} scraped the ${VEHICLE[c?.veh || 'rustbucket'].name}`, 'Pay for repairs, or bench them until tomorrow.', `Repair ${money(ev.cost)}`, 'Bench'],
      raise: [`${esc(c?.name || 'A courier')} wants a bigger cut`, `+5% commission for them, or they walk.`, 'Agree', 'Refuse'],
      star: [`${esc(c?.name || 'A courier')} is on a roll`, 'Pay for a training course: +1 skill.', `Train ${money(ev.cost)}`, 'Skip'],
      catering: [`Catering job for ${esc(names)}`, `${money(ev.pay)} up front and ×2.5 earnings for an hour.`, 'Accept', 'Decline'],
    }[ev.kind];
    if (!T) return '';
    const need = ev.cost && S.cash < ev.cost;
    return `<div class="fev">${ICON('ui-people')}<span class="rt"><b>${T[0]}</b><small>${T[1]}</small></span>
      <span class="cbtns"><button class="btn green sm" data-act="fev" data-id="${ev.id}" data-c="a" ${need ? 'disabled' : ''}>${T[2]}</button><button class="btn ghost sm" data-act="fev" data-id="${ev.id}" data-c="b">${T[3]}</button></span></div>`;
  }

  // ---------- events (delegation) ----------
  root.addEventListener('click', (e) => {
    const b = e.target.closest('[data-act]'); if (!b || b.disabled) return;
    const a = b.dataset.act, id = b.dataset.id;
    if (a !== 'order') tap();
    switch (a) {
      case 'tab':
        if (b.dataset.tab === tab && !hub.hidden) {
          // tapping the tab you're already on opens / closes its sheet
          sheetState = sheetState === 'min' ? (tab === 'city' ? 'mid' : 'big') : 'min';
          sheet.style.height = ''; sheet.dataset.state = sheetState;
        } else setTab(b.dataset.tab);
        game.audio?.play('ui-open', { vol: 0.6 });
        break;
      case 'grab': if (performance.now() - drag.endT < 350) break; sheetState = sheetState === 'min' ? 'mid' : sheetState === 'mid' ? (tab === 'city' ? 'min' : 'big') : 'min'; sheet.dataset.state = sheetState; break;
      case 'settings': settings(); break;
      case 'energy': energy(); break;
      case 'order': game.toggleOrder(+id); render(); break;
      case 'start': game.startJob(); break;
      case 'claim': if (St.claimGoal(+b.dataset.i)) { game.audio?.play('ui-coins'); coinsTo(b, 6); render(); } break;
      case 'focus': S.focus = b.dataset.d || null; St.save(); game.refocus?.(); render(); break;
      case 'contract': if (St.claimContract(+b.dataset.i)) { game.audio?.play('ui-coins'); coinsTo(b, 8); render(); } break;
      case 'weekbonus': { const bn = St.claimWeekBonus(); if (bn) { game.audio?.play('ui-unlock'); toast(bn.paint ? `New finish: ${PREMIUM.find((p) => p.id === bn.paint).name}! Try it in the Garage.` : `+${money(bn.cash)} contract bonus`, 'good'); render(); } break; }
      case 'buypaint': if (St.buyPaint(id)) { game.audio?.play('ui-purchase'); toast(`${PREMIUM.find((p) => p.id === id).name} finish unlocked`, 'good'); render(); } else toast(`Costs ${money(PREMIUM.find((p) => p.id === id).price)}`, 'bad'); break;
      case 'premiuminfo': toast('Won through achievements and contracts', ''); break;
      case 'fev': { const msg = St.resolveFleetEvent(id, b.dataset.c); if (msg) { toast(msg, 'good'); refreshTop(); render(); } else toast('Not enough cash', 'bad'); break; }
      case 'veh': state.selVeh = id; game.previewVehicle?.(id); render(); break;
      case 'buyveh': if (St.buyVehicle(id)) { game.audio?.play('ui-purchase'); toast(`${VEHICLE[id].name} is yours!`, 'good'); if (St.owned(id) === 1) { St.setActive(id); game.previewVehicle?.(id); } render(); } break;
      case 'ride': if (St.setActive(id)) { game.previewVehicle?.(id); render(); } break;
      case 'part': if (St.upgradePart(id, b.dataset.p)) { game.audio?.play('ui-purchase'); render(); game.ob?.event('part'); } break;
      case 'paint': if (St.paintVehicle(id, b.dataset.w, b.dataset.c)) { game.previewVehicle?.(id); render(); } break;
      case 'skill': if (St.upgradeSkill(id)) { game.audio?.play('ui-unlock'); toast(`${SKILLS.find((k) => k.id === id).name} up!`, 'good'); render(); } break;
      case 'char': S.look.char = b.dataset.c; St.save(); St.emit('look'); render(); break;
      case 'helmet': S.look.helmet = b.dataset.c; St.save(); St.emit('look'); render(); break;
      case 'district': game.focusDistrict?.(id); break;
      case 'apply': if (St.applyDistrict(id)) { game.audio?.play('ui-unlock'); modalUnlock(id); render(); } break;
      case 'office': if (St.openOffice()) { game.audio?.play('ui-unlock'); render(); } break;
      case 'officeup': if (St.upgradeOffice()) { game.audio?.play('ui-purchase'); render(); } break;
      case 'hire': if (St.hire(id)) { game.audio?.play('ui-purchase'); St.rollApplicants(); render(); } break;
      case 'fire': St.fire(id); render(); break;
      case 'train': if (St.train(id)) { game.audio?.play('ui-unlock'); render(); } break;
      case 'reroll': if (St.spend(20)) { track('buy', { k: 'reroll', cost: 20, lvl: S.lvl, cash: Math.round(S.cash) }); St.rollApplicants(); render(); } break;
      case 'collect': { const n = St.collectFleet(); if (n) { game.audio?.play('ui-coins'); coinsTo(b, 8); toast(`+${money(n)} from your fleet`, 'cash'); if (tab === 'fleet') render(); } break; }
    }
  });
  root.addEventListener('change', (e) => {
    const s = e.target; if (s.tagName !== 'SELECT') return;
    if (s.dataset.act === 'cdist') St.assign(s.dataset.id, { district: s.value });
    if (s.dataset.act === 'cveh') { if (!St.assign(s.dataset.id, { veh: s.value })) toast('No free vehicle of that type', 'bad'); }
    render();
  });

  // ---------- bottom sheet: drag to resize ----------
  // Grab the handle or the first heading (or pull the list down when it is scrolled to the top) and the sheet follows
  // the finger; on release it snaps to min / mid / big, with a quick flick counting toward its direction.
  const drag = { on: false, endT: 0, y0: 0, h0: 0, hs: null, samples: [], live: true };
  const STATES = ['min', 'mid', 'big'];
  function measureStates() {
    const keep = sheet.dataset.state, out = {};
    sheet.classList.add('dragging'); sheet.style.height = '';
    for (const st of STATES) { sheet.dataset.state = st; out[st] = sheet.getBoundingClientRect().height; }
    sheet.dataset.state = keep;
    return out;
  }
  function dragStart(y) {
    drag.on = true; drag.y0 = y; drag.samples = [[performance.now(), y]];
    drag.live = sheet.getBoundingClientRect().width > innerWidth * 0.8; // side panel (landscape) only snaps
    drag.hs = measureStates();
    drag.h0 = sheet.getBoundingClientRect().height;
    if (drag.live) sheet.style.height = drag.h0 + 'px';
  }
  function dragMove(y) {
    if (!drag.on) return;
    drag.samples.push([performance.now(), y]); if (drag.samples.length > 6) drag.samples.shift();
    if (!drag.live) return;
    const h = Math.max(drag.hs.min, Math.min(drag.hs.big, drag.h0 - (y - drag.y0)));
    sheet.style.height = h + 'px';
  }
  function dragEnd() {
    if (!drag.on) return;
    drag.on = false; drag.endT = performance.now();
    const a = drag.samples[0], b = drag.samples[drag.samples.length - 1];
    const vel = (b[1] - a[1]) / Math.max(1, b[0] - a[0]); // px/ms, + = downward
    const moved = b[1] - drag.y0;
    let next = sheetState;
    if (drag.live) {
      const h = sheet.getBoundingClientRect().height - vel * 220; // where a flick would carry it
      next = STATES.reduce((best, st) => (Math.abs(drag.hs[st] - h) < Math.abs(drag.hs[best] - h) ? st : best), 'mid');
    } else if (moved > 40 || vel > 0.5) next = 'min';
    else if (moved < -40 || vel < -0.5) next = sheetState === 'min' ? 'mid' : 'big';
    if (Math.abs(moved) < 6 && Math.abs(vel) < 0.3) { sheet.classList.remove('dragging'); sheet.style.height = ''; drag.endT = 0; return; } // a tap
    sheetState = next;
    sheet.classList.remove('dragging');
    void sheet.offsetHeight; // let the height transition run from the dragged height
    sheet.dataset.state = next;
    sheet.style.height = '';
  }
  sheet.addEventListener('pointerdown', (e) => {
    const h = e.target.closest('.grab, .sheet-rib, .sheet-body > .sec-head:first-child');
    if (!h || e.target.closest('button, a, select, input')) return;
    e.preventDefault();
    capture(sheet, e);
    dragStart(e.clientY);
  });
  sheet.addEventListener('pointermove', (e) => { if (drag.on && !drag.touch) dragMove(e.clientY); });
  sheet.addEventListener('pointerup', () => { if (!drag.touch) dragEnd(); });
  sheet.addEventListener('pointercancel', () => { if (!drag.touch) dragEnd(); });
  // pulling the list down while it is already at the top collapses the sheet
  let pull = null;
  body.addEventListener('touchstart', (e) => { const t = e.touches[0]; pull = body.scrollTop <= 0 && e.touches.length === 1 ? { x: t.clientX, y: t.clientY, on: false } : null; }, { passive: true });
  body.addEventListener('touchmove', (e) => {
    if (!pull) return;
    const t = e.touches[0], dy = t.clientY - pull.y, dx = t.clientX - pull.x;
    if (!pull.on) {
      if (dy < -4 || Math.abs(dx) > Math.abs(dy) * 1.3 + 4) { pull = null; return; }
      if (dy > 0 && body.scrollTop <= 0) e.preventDefault(); // at the top a downward move can't scroll anyway: keep it for the sheet
      if (dy > 8 && body.scrollTop <= 0) { pull.on = true; drag.touch = true; dragStart(pull.y); } else return;
    }
    e.preventDefault();
    dragMove(t.clientY);
  }, { passive: false });
  const pullEnd = () => { if (pull?.on) { dragEnd(); drag.touch = false; } pull = null; };
  body.addEventListener('touchend', pullEnd); body.addEventListener('touchcancel', pullEnd);

  // ---------- settings ----------
  function settings() {
    const m = modal(`<h2>Settings</h2>
      <label class="set">Music<input type="range" min="0" max="1" step="0.05" value="${S.settings.music}" data-k="music"></label>
      <label class="set">Sound<input type="range" min="0" max="1" step="0.05" value="${S.settings.sfx}" data-k="sfx"></label>
      <label class="set">Graphics<select data-k="quality">${['auto', 'low', 'medium', 'high'].map((q) => `<option ${S.settings.quality === q ? 'selected' : ''}>${q}</option>`).join('')}</select></label>
      <label class="set">Vibration<input type="checkbox" data-k="haptics" ${S.settings.haptics ? 'checked' : ''}></label>
      ${game.isTouch ? '' : `<label class="set">Auto-drive <small>(on: it rides, you brake with ↓ and dodge with ← →; off: you ride with the keyboard)</small><input type="checkbox" data-k="autodrive" ${S.settings.autodrive === true ? 'checked' : ''}></label>`}
      <p class="small">Progress is saved on this device. Use a save code to move it to another phone.</p>
      <div class="set-more"><button class="btn ghost sm" data-x="export">Copy save code</button><button class="btn ghost sm" data-x="import">Load save code</button></div>
      <div class="set-more"><button class="btn ghost sm" data-x="replay">Replay tutorial</button><button class="btn ghost sm danger" data-x="reset">Reset progress</button></div>
      <button class="btn green big" data-x="close">Done</button>`, { dismiss: true, cls: 'settings' });
    m.card.addEventListener('input', (e) => { const k = e.target.dataset.k; if (!k) return; S.settings[k] = e.target.type === 'range' ? +e.target.value : e.target.type === 'checkbox' ? e.target.checked : e.target.value; St.save(); game.applySettings?.(); });
    m.card.addEventListener('change', (e) => { const k = e.target.dataset.k; if (k) track('setting', { k, v: S.settings[k] }); });
    m.card.addEventListener('click', (e) => {
      const x = e.target.closest('[data-x]')?.dataset.x;
      if (x === 'close') m.close();
      if (x === 'replay') { m.close(); game.ob?.replay(); }
      if (x === 'reset') { m.close(); confirmReset(); }
      if (x === 'export') { m.close(); saveCode(); }
      if (x === 'import') { m.close(); loadCode(); }
    });
  }
  function saveCode() {
    St.save(true);
    const code = St.exportCode();
    track('save_export', { lvl: S.lvl });
    const m = modal(`<h2>Save code</h2><p class="small">Copy this and paste it into <b>Load save code</b> on another device.</p>
      <textarea class="code" readonly>${code}</textarea>
      <button class="btn green big" data-x="copy">Copy</button><button class="btn ghost" data-x="close">Close</button>`, { dismiss: true, cls: 'codebox' });
    const ta = m.card.querySelector('textarea');
    ta.addEventListener('focus', () => ta.select());
    m.card.querySelector('[data-x="copy"]').onclick = async () => {
      tap(); ta.select();
      try { await navigator.clipboard.writeText(code); toast('Save code copied', 'good'); } catch { try { document.execCommand('copy'); toast('Save code copied', 'good'); } catch { toast('Select the text and copy it', ''); } }
    };
    m.card.querySelector('[data-x="close"]').onclick = () => { tap(); m.close(); };
  }
  function loadCode() {
    const m = modal(`<h2>Load save code</h2><p class="small">This replaces the career on this device.</p>
      <textarea class="code" placeholder="FDS1.…" autocomplete="off" spellcheck="false"></textarea>
      <button class="btn green big" data-x="load">Load</button><button class="btn ghost" data-x="close">Cancel</button>`, { dismiss: true, cls: 'codebox' });
    const ta = m.card.querySelector('textarea');
    m.card.querySelector('[data-x="load"]').onclick = () => {
      tap();
      if (St.importCode(ta.value)) { track('save_import', { from_lvl: S.lvl }); toast('Career loaded', 'good'); setTimeout(() => location.reload(), 400); }
      else toast("That code doesn't look right", 'bad');
    };
    m.card.querySelector('[data-x="close"]').onclick = () => { tap(); m.close(); };
  }
  // erasing a career needs a deliberate hold, not a stray tap
  function confirmReset() {
    const st = S.stats;
    const m = modal(`<div class="warn-ic">${ICON('ui-lock', 'big')}</div><h2>Start over?</h2>
      <p>This erases <b>everything</b> on this device and can't be undone:</p>
      <ul class="lose"><li>${money(S.cash)} cash · Level ${S.lvl}</li><li>${Object.values(S.vehicles).reduce((a, v) => a + (v.count || 0), 0)} vehicles and their upgrades</li>
        <li>${Object.keys(S.districts).length} district job${Object.keys(S.districts).length > 1 ? 's' : ''} · ${S.fleet.couriers.length} courier${S.fleet.couriers.length === 1 ? '' : 's'}</li><li>${st.deliveries} deliveries of career stats</li></ul>
      <button class="btn red big hold" data-x="hold"><i></i><span>Hold to erase</span></button>
      <button class="btn ghost" data-x="cancel">Keep my progress</button>`, { dismiss: true, cls: 'reset' });
    const btn = m.card.querySelector('.hold'), fill = btn.querySelector('i'), label = btn.querySelector('span');
    let t0 = 0, raf = 0;
    const HOLD = 1600;
    const tick = () => {
      const f = Math.min(1, (performance.now() - t0) / HOLD);
      fill.style.width = f * 100 + '%';
      if (f >= 1) { label.textContent = 'Erasing…'; game.audio?.play('ui-error'); St.wipe(); setTimeout(() => location.reload(), 250); return; }
      raf = requestAnimationFrame(tick);
    };
    const down = (e) => { e.preventDefault(); capture(btn, e); t0 = performance.now(); label.textContent = 'Keep holding…'; cancelAnimationFrame(raf); tick(); };
    const up = () => { if (fill.style.width === '100%') return; cancelAnimationFrame(raf); fill.style.width = '0%'; label.textContent = 'Hold to erase'; };
    btn.addEventListener('pointerdown', down); btn.addEventListener('pointerup', up); btn.addEventListener('pointercancel', up); btn.addEventListener('lostpointercapture', up);
    m.card.querySelector('[data-x="cancel"]').addEventListener('click', () => { tap(); m.close(); });
  }
  function modalUnlock(id) {
    const d = DISTRICT[id];
    game.audio?.play('crowd-cheer', { vol: 0.7 });
    const m = modal(`<div class="burst" style="--dc:${d.color}"></div><h2>Hired!</h2><p><b>${d.employer}</b> took you on in <b style="color:${d.color}">${d.name}</b>.</p><p class="small">Orders there pay ×${d.pay}. ${(DPROFILE[d.id]?.traits || []).join(' · ')}</p>
      <button class="btn green big" data-x="ok">Let's ride</button>`, { cls: 'pop' });
    m.card.querySelector('[data-x]').onclick = () => { tap(); m.close(); };
    game.focusDistrict?.(id);
  }

  // =====================================================================
  // Ride HUD
  // =====================================================================
  const rh = {
    name: $('.r-name', hud), verb: $('.r-verb', hud), food: $('.r-food', hud), dist: $('.r-dist', hud), timer: $('.r-timer b', hud), timerBox: $('.r-timer', hud),
    cond: $('.r-cond', hud), heat: $('.heat u', hud), integ: $('.integ u', hud), speed: $('.r-speed b', hud), ctx: $('.r-ctx', hud),
    boost: $('.boost', hud), hop: $('.hop', hud), map: $('.r-map', hud), timerLbl: $('.r-timer small', hud), dial: $('.r-speed .val', hud),
    speedBox: $('.r-speed', hud), keys: $('.r-keys', hud), stop: $('.r-btn.stop', hud), stopL: $('.r-btn.stop small', hud), brake: $('.r-btn.brake', hud),
    // lanes & brake (?ctl): the gear in the dial, the next corner's limit, the lanes + draft, the shortcut swipe hint
    gear: $('.r-speed .gear', hud), limit: $('.r-limit', hud), limitV: $('.r-limit b', hud), limitL: $('.r-limit small', hud),
    lanes: $('.r-lanes', hud), draft: $('.r-lanes .draft', hud), draftU: $('.r-lanes .draft u', hud), hint: $('.r-hint', hud), proto: $('.r-proto', hud), turn: $('.r-turn', hud),
  };
  let vTop = 9; // the active bike's top speed (m/s), for the speed dial
  const mapCtx = rh.map.getContext('2d');
  const flowEl = $('.r-flow', hud), flowMult = $('.r-flow em', hud), flowBar = $('.r-flow u', hud), pops = $('.r-pops', hud), speedEl = $('#speedlines', hud);
  function flowPop(label, F, lost = false) {
    const el = document.createElement('div');
    el.className = 'pop' + (lost ? ' lost' : '');
    el.innerHTML = lost ? label : `${label}<small>×${F.mult.toFixed(1)}</small>`;
    pops.append(el);
    setTimeout(() => el.remove(), 1100);
    while (pops.children.length > 3) pops.firstChild.remove();
    if (!lost) { flowEl.classList.remove('hit'); void flowEl.offsetWidth; flowEl.classList.add('hit'); }
  }
  // a plain call-out in the same spot (gears)
  function pop(label, kind = '') {
    const el = document.createElement('div');
    el.className = 'pop ' + kind;
    el.textContent = label;
    pops.append(el);
    setTimeout(() => el.remove(), 1100);
    while (pops.children.length > 3) pops.firstChild.remove();
  }
  let ctxKey = '';
  // ride buttons: pointer events (hold for turbo)
  hud.addEventListener('pointerdown', (e) => {
    const t = e.target.closest('.r-turn button'); if (t) { e.preventDefault(); game.rideInput({ '-1': 'turn-left', 0: 'turn-straight', 1: 'turn-right' }[t.dataset.r], true); return; }
    const b = e.target.closest('[data-ride]'); if (!b) return;
    e.preventDefault();
    b.classList.add('down');
    game.rideInput(b.dataset.ride, true);
    if (b.dataset.ride === 'boost' || b.dataset.ride === 'brake') { capture(b, e); }
  });
  const rideUp = (e) => { const b = e.target.closest('[data-ride]'); if (!b) return; b.classList.remove('down'); if (b.dataset.ride === 'boost' || b.dataset.ride === 'brake') game.rideInput(b.dataset.ride, false); };
  hud.addEventListener('pointerup', rideUp); hud.addEventListener('pointercancel', rideUp); hud.addEventListener('lostpointercapture', rideUp);
  // swipe left anywhere on the road = overtake (no swipe-up hop: an upward drag moves the camera; HOP is the button).
  // With lanes & brake the swipes are main.js's.
  let sw = null;
  document.getElementById('gl').addEventListener('pointerdown', (e) => { if (!hud.hidden && !game.ride?.R.scheme) sw = { x: e.clientX, y: e.clientY, t: performance.now() }; });
  document.getElementById('gl').addEventListener('pointerup', (e) => {
    if (!sw || hud.hidden) return;
    const dy = e.clientY - sw.y, dx = e.clientX - sw.x;
    if (dx < -60 && Math.abs(dx) > Math.abs(dy) * 1.5 && performance.now() - sw.t < 450) game.rideInput('overtake', true);
    sw = null;
  });

  function rideLeg(leg, R) {
    const o = leg.kind === 'pickup' ? R.orders.find((x) => leg.orders.includes(x.o.id)).o : R.orders.find((x) => x.o.id === leg.order).o;
    rh.verb.textContent = leg.kind === 'pickup' ? 'Pick up at' : 'Deliver to';
    rh.name.textContent = leg.kind === 'pickup' ? o.restName : o.name;
    rh.food.innerHTML = leg.kind === 'pickup' ? ICON(FOODS[o.food].icon) : ICON('char-' + o.char);
    rh.cond.hidden = !R.orders.some((x) => x.picked && !x.done);
    vTop = St.vehStats().top || 9;
    rh.keys.textContent = R.scheme === 'run' ? '← / → change lane · ↓ / S / Space brake (hold) · ↑ / W hop — it rides itself, the traffic is yours'
      : R.scheme === 'b' ? '↓ / S / Space brake (hold) · ← / ↑ / → another street at a junction — the gas is always on'
      : R.scheme ? '← / → change lane, or the turn at a junction (↑ straight on) · ↓ / S / Space brake — the gas is always on'
      : R.manual ? 'W/↑ gas · S/↓ brake & reverse · A/D steer · Space hop · Shift turbo · E action · H horn · drag to look'
        : 'Space turbo · W hop · S stop · A overtake · D shortcut · E action · H horn · drag to look';
    hud.classList.toggle('lb', !!R.scheme);
    hud.classList.toggle('run', R.scheme === 'run');
    hud.classList.toggle('auto', !!R.auto);
    rh.lanes.hidden = R.scheme !== 'a' && R.scheme !== 'run';
    rh.lanes.querySelector('.row').hidden = R.scheme === 'run'; // the run shows only the draft
    rh.gear.hidden = R.scheme !== 'b';
    if (R.scheme !== 'b') rh.limit.hidden = true;
    rh.proto.hidden = R.scheme !== 'a' && R.scheme !== 'b'; // (the run is the game: the label is for the ?ctl prototypes)
    rh.proto.textContent = R.scheme === 'a' ? 'Prototype A · lane run' : R.scheme === 'b' ? 'Prototype B · brake' : '';
    routeChanged(R);
  }
  let mapPts = [];
  function routeChanged(R) {
    mapPts = [];
    const o = [0, 0, 0, 0];
    for (let s = 0; s <= R.route.length; s += 4) { game.sampleRoute(R.route, s, o); mapPts.push([o[0], o[1]]); }
    game.sampleRoute(R.route, R.route.length, o); mapPts.push([o[0], o[1]]);
  }
  function drawMap(R) {
    const W = rh.map.width, H = rh.map.height, c = mapCtx;
    const b = R.bike.root.position, hd = R.bike.root.rotation.y;
    c.clearRect(0, 0, W, H);
    c.save();
    c.beginPath(); c.arc(W / 2, H / 2, W / 2 - 3, 0, Math.PI * 2); c.clip();
    c.fillStyle = '#26375a'; c.fillRect(0, 0, W, H);
    const sc = 1.15;
    c.translate(W / 2, H / 2); c.rotate(Math.PI + hd); c.scale(sc, sc); c.translate(-b.x, -b.z);
    // streets near the player
    c.strokeStyle = '#3d5583'; c.lineWidth = 6.4; c.lineCap = 'round';
    const city = game.city, T = 10, cx = Math.round(b.x / T), cz = Math.round(b.z / T);
    c.beginPath();
    for (let z = cz - 12; z <= cz + 12; z++) for (let x = cx - 12; x <= cx + 12; x++) {
      const t = city.tiles[z * city.W + x]; if (!t || x < 0 || x >= city.W || t.k !== 1) continue;
      if (t.mask & 2) { c.moveTo(x * T, z * T); c.lineTo(x * T + T, z * T); }
      if (t.mask & 4) { c.moveTo(x * T, z * T); c.lineTo(x * T, z * T + T); }
    }
    c.stroke();
    // route
    c.strokeStyle = '#4fd4ff'; c.lineWidth = 3.6; c.beginPath();
    mapPts.forEach((p, i) => (i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1]))); c.stroke();
    const end = mapPts[mapPts.length - 1];
    if (end) { c.fillStyle = '#ff9d2e'; c.beginPath(); c.arc(end[0], end[1], 5.5, 0, Math.PI * 2); c.fill(); c.strokeStyle = '#fff'; c.lineWidth = 2; c.stroke(); }
    c.restore();
    // player arrow
    c.fillStyle = '#fff'; c.strokeStyle = '#1d2a44'; c.lineWidth = 3;
    c.beginPath(); c.moveTo(W / 2, H / 2 - 14); c.lineTo(W / 2 + 10, H / 2 + 10); c.lineTo(W / 2, H / 2 + 4); c.lineTo(W / 2 - 10, H / 2 + 10); c.closePath(); c.stroke(); c.fill();
  }
  let mapT = 0, lastTick = 0;
  function rideFrame(R) {
    if (hud.hidden || !R.route) return;
    const left = R.route.length - R.s;
    rh.dist.textContent = km(left);
    // timer = the most urgent unfinished order
    const live = R.orders.filter((x) => !x.done);
    if (live.length) {
      const u = live.reduce((a, b) => (a.o.eta - a.elapsed < b.o.eta - b.elapsed ? a : b));
      const rem = u.o.eta - u.elapsed;
      rh.timer.textContent = rem >= 0 ? mmss(rem) : '+' + mmss(-rem);
      rh.timerBox.style.setProperty('--p', Math.max(0, Math.min(1, rem / u.o.eta)).toFixed(3));
      rh.timerLbl.textContent = rem < 0 ? 'late' : 'left';
      const sec = Math.ceil(rem);
      if (sec !== lastTick && sec <= 10 && sec >= 1 && R.phase === 'ride' && R.timeScale === 1) { lastTick = sec; game.audio?.play('countdown-tick', { vol: 0.7 }); }
      rh.timerBox.classList.toggle('late', rem < 0);
      rh.timerBox.classList.toggle('warn', rem >= 0 && rem < 10);
      const carried = live.filter((x) => x.picked);
      if (carried.length) {
        const h = Math.min(...carried.map((x) => x.heat)), g = Math.min(...carried.map((x) => x.integrity));
        rh.heat.style.setProperty('--v', h + '%'); rh.integ.style.setProperty('--v', g + '%');
        rh.heat.parentNode.parentNode.classList.toggle('low', h < 50); rh.integ.parentNode.parentNode.classList.toggle('low', g < 50);
        rh.cond.hidden = false;
      }
    }
    rh.speed.textContent = Math.round(R.v * 3.6);
    rh.dial.style.strokeDasharray = `${Math.min(100, R.v / (vTop * 1.35) * 100).toFixed(1)} 100`;
    rh.speedBox.classList.toggle('warn', !!R.cornerWarn);
    const F = R.flow;
    if (F) {
      flowEl.hidden = !(F.n > 0);
      if (F.n > 0) { flowMult.textContent = '×' + F.mult.toFixed(1); flowBar.style.width = Math.max(0, F.t / 7 * 100) + '%'; flowEl.classList.toggle('max', F.mult >= 2); }
    }
    const sp = R.phase === 'ride' ? Math.max(0, Math.min(1, (R.v - 6.5) / 7)) * (R.boost ? 1 : 0.35) : 0;
    speedEl.style.opacity = sp.toFixed(2);
    const e = R.energy / R.energyMax;
    rh.boost.style.setProperty('--e', (e * 100).toFixed(1) + '%');
    rh.boost.classList.toggle('empty', R.energy < 5);
    rh.boost.classList.toggle('on', R.boost);
    if (R.scheme) schemeFrame(R);
    stopFrame(R);
    // context actions (lanes & brake has none: a shortcut is a swipe, see schemeFrame; a red light is STOP's)
    const acts = [];
    if (R.phase === 'ride' && R.crash <= 0 && !R.scheme) {
      const ot = !R.manual && game.canOvertake();
      if (ot) acts.push(['overtake', `${ICON('ui-overtake')}<span>Overtake</span>`, ['safe', 'risky', 'danger'][ot.risk]]);
      // riding yourself, the shortcut button puts the alley on the GPS
      if (R.offer) acts.push(['shortcut', `${ICON('ui-shortcut')}<span>${R.manual ? 'GPS shortcut' : 'Shortcut'} <small>${R.offer.label}</small></span>`, 'safe']);
      if (R.hazards.some((h) => h.type === 'ped' && !h.done && h.walking && h.ahead > 0 && h.ahead < 28)) acts.push(['horn', `${ICON('ui-horn')}<span>Honk!</span>`, 'safe']);
    }
    const key = acts.map((a) => a[0] + a[2]).join();
    if (key !== ctxKey) {
      ctxKey = key;
      rh.ctx.innerHTML = acts.map(([k, html, cls]) => `<button class="ctx ${cls}" data-ride="${k}">${html}</button>`).join('');
    }
    // hop hint: glow when a hoppable hazard is ahead
    const hz = R.hazards.find((h) => !h.done && HZ[h.type].hop && h.inPath && h.ahead > 0 && h.ahead < Math.max(8, R.v * 1.3));
    rh.hop.classList.toggle('hint', !!hz);
    if (hz) { const d = hz.ahead; rh.hop.classList.toggle('perfect', d > R.v * 0.16 && d < R.v * 0.38); } else rh.hop.classList.remove('perfect');
    mapT += 1; if (mapT % 2 === 0) drawMap(R);
  }
  // the autopilot's STOP: up for a red light, someone crossing or the door. It glows in the perfect second (just before
  // the GPS arrows turn red), shakes once it's late, and dims while the bike waits there.
  let stopKey = '';
  const STOP_FOR = { light: 'red light', ped: 'crossing', door: 'door' };
  function stopFrame(R) {
    const U = R.auto && R.phase === 'ride' && R.crash <= 0 ? R.stopUi : null;
    rh.stop.hidden = !U;
    const secs = U && U.kind === 'light' && U.secs < 60 ? Math.max(1, Math.ceil(U.secs)) : 0, rolling = R.v > 1;
    const k = U ? `${U.kind}|${U.timing}|${secs}|${rolling}` : '';
    if (k === stopKey) return;
    stopKey = k;
    if (!U) return;
    for (const c of ['now', 'late', 'on']) rh.stop.classList.toggle(c, U.timing === c || (c === 'late' && U.timing === 'gone'));
    rh.stopL.textContent = U.timing === 'on' ? (U.kind === 'door' ? 'pulling in' : rolling ? 'stopping' : secs ? `wait · ${secs} s` : 'waiting') : STOP_FOR[U.kind] + (secs ? ` · ${secs} s` : '');
  }
  // lanes & brake: the dial glows red on the brake; lane run shows the lane and the draft, late brake the gear and the
  // limit of what's coming (a corner's or a pothole's speed, a red light, someone crossing, the door); a shortcut on
  // offer says which way to swipe
  let laneKey = '', limitKey = '', hintKey = '', turnKey = '';
  function schemeFrame(R) {
    rh.speedBox.classList.toggle('brk', R.ctl.brake && R.phase === 'ride');
    rh.brake.classList.toggle('down', R.ctl.brake && R.phase === 'ride'); // (the pedal goes down for the keys too)
    if (R.scheme !== 'b') {
      const k = `${R.lane}|${R.draft >= 0.95}`;
      if (k !== laneKey) { laneKey = k; for (const i of rh.lanes.querySelectorAll('i')) i.classList.toggle('on', +i.dataset.l === R.lane); rh.draft.classList.toggle('full', R.draft >= 0.95); }
      rh.draft.hidden = !(R.draft > 0.02);
      rh.draftU.style.width = (R.draft * 100).toFixed(0) + '%';
    } else {
      rh.gear.textContent = 'G' + R.gear;
      rh.gear.classList.toggle('top', R.gear >= 5);
      const z = R.phase === 'ride' && R.bz && R.bz.at - R.s < 60 ? R.bz : null;
      rh.limit.hidden = !z;
      if (z) {
        const speed = z.kind === 'corner' || z.kind === 'bump', k = speed ? String(Math.round(z.vt * 3.6)) : z.kind;
        const secs = z.kind === 'light' && R.lightLeft < 60 ? Math.max(1, Math.ceil(R.lightLeft)) : 0, kk = k + '|' + secs + '|' + (z.h?.type || '');
        if (kk !== limitKey) {
          limitKey = kk;
          rh.limitV.textContent = speed ? k : z.kind === 'light' || z.kind === 'ped' ? 'STOP' : '◎';
          rh.limitL.textContent = z.kind === 'corner' ? 'corner' : z.kind === 'bump' ? (HZ[z.h.type].label || 'bump').toLowerCase() : z.kind === 'light' ? (secs ? `red · ${secs} s` : 'red light') : z.kind === 'ped' ? 'crossing' : 'door';
          rh.limit.dataset.kind = z.kind;
        }
        rh.limit.classList.toggle('late', !!R.cornerWarn);
      }
    }
    // the junction ahead: three arrows, the GPS's lit, the others saying what they buy; a swipe picks one
    const J = R.phase === 'ride' ? R.junc : null;
    rh.turn.hidden = !J;
    const tk = J ? `${J.tile}|${J.cur}|${J.gps}` : '';
    if (tk !== turnKey) {
      turnKey = tk;
      if (J) for (const b of rh.turn.querySelectorAll('button')) {
        const r = +b.dataset.r, e = J.exits[r];
        b.hidden = !e;
        if (!e) continue;
        b.classList.toggle('on', r === J.cur); b.classList.toggle('gps', r === J.gps); b.classList.toggle('good', e.save >= 10 || e.lights >= 1);
        b.querySelector('small').textContent = r === J.cur ? (r === J.gps ? 'GPS' : 'chosen') : e.label;
      }
    }
    const side = R.offer ? (game.ride?.offerSide?.(R.offer) ?? 1) : 0;
    rh.hint.hidden = !side || R.phase !== 'ride';
    const hk = side ? side + R.offer.label : '';
    if (hk !== hintKey) { hintKey = hk; if (side) rh.hint.innerHTML = `${ICON('ui-shortcut')}<span>Swipe ${side === 1 ? 'right ➡' : side === -1 ? '⬅ left' : 'up ⬆'} for the shortcut <small>${R.offer.label}</small></span>`; }
  }
  let coachEl = null;
  function coach(c) {
    for (const b of hud.querySelectorAll('.coached')) b.classList.remove('coached');
    if (coachEl) { coachEl.remove(); coachEl = null; }
    if (!c) return;
    coachEl = document.createElement('div'); coachEl.className = 'coach'; coachEl.innerHTML = c.text;
    hud.append(coachEl);
    const mark = () => { const b = hud.querySelector(`[data-ride="${c.btn}"]`); if (b) b.classList.add('coached'); };
    mark(); setTimeout(mark, 60);
  }
  function flash(kind) { hud.classList.remove('flash-' + kind); void hud.offsetWidth; hud.classList.add('flash-' + kind); }

  // ---------- event cards / QTE ----------
  function dock(html) {
    const wrap = document.createElement('div');
    wrap.className = 'evdock';
    wrap.innerHTML = `<div class="card">${html}</div>`;
    hud.append(wrap); hud.classList.add('evmode');
    requestAnimationFrame(() => wrap.classList.add('in'));
    const close = () => { wrap.classList.remove('in'); wrap.classList.add('out'); setTimeout(() => { wrap.remove(); if (!hud.querySelector('.evdock')) hud.classList.remove('evmode'); }, 220); };
    return { el: wrap, card: wrap.firstElementChild, close };
  }
  function event(ev, R) {
    return new Promise((resolve) => {
      const react = St.skillFx().react;
      const opts = ev.options;
      const qte = ev.qte;
      // the card docks at the bottom of the screen so the street (where the event happens) stays visible
      const m = dock(`<div class="ev-head">${ICON(ev.icon || 'ui-bolt', 'evi')}<h2 class="ribbon">${esc(ev.title)}</h2></div><p>${esc(ev.text)}</p>
        <div class="ev-body"></div><div class="ev-timer"><i></i></div>`);
      const bodyEl = m.card.querySelector('.ev-body'), bar = m.card.querySelector('.ev-timer i');
      let done = false, raf = 0, keyH = null, picked = null, auto = false;
      const cleanups = [];
      const finish = (res) => {
        if (done) return; done = true; cancelAnimationFrame(raf);
        if (res) { res.__opt = picked; res.__auto = auto; } // for analytics: which option, or the timer chose
        if (keyH) removeEventListener('keydown', keyH);
        for (const f of cleanups) f();
        if (res && (res.__good || res.__bad)) m.card.classList.add(res.__good ? 'good' : 'bad');
        setTimeout(() => { m.close(); resolve(res); }, res && (res.__good || res.__bad) ? 450 : 120);
      };
      const timed = (secs, onTimeout) => {
        const t0 = performance.now(), T = secs * 1000 * react;
        const loop = () => { const f = 1 - (performance.now() - t0) / T; bar.style.width = Math.max(0, f * 100) + '%'; if (f <= 0) onTimeout(); else raf = requestAnimationFrame(loop); };
        raf = requestAnimationFrame(loop);
      };
      let act = null;
      const outcome = (ok, okFx, failFx) => { game.audio?.play(ok ? 'qte-good' : 'qte-bad'); finish({ ...(ok ? okFx : failFx), __good: ok, __bad: !ok, __act: act }); };
      const runQte = (q, okFx, failFx) => {
        bodyEl.innerHTML = '';
        if (q.kind === 'mash') {
          let n = 0;
          bodyEl.innerHTML = `<button class="btn green big qte-mash">TAP! TAP! TAP!</button><div class="qbar"><i></i></div>`;
          const fill = bodyEl.querySelector('.qbar i'), btn = bodyEl.querySelector('button');
          const hit = () => { n++; fill.style.width = Math.min(100, n / q.n * 100) + '%'; btn.classList.remove('pulse'); void btn.offsetWidth; btn.classList.add('pulse'); if (q.sfx) game.audio?.play(q.sfx); else game.audio?.play('ui-tap', { rate: 1 + n * 0.03 }); if (n >= q.n) outcome(true, okFx, failFx); };
          btn.addEventListener('pointerdown', (e) => { e.preventDefault(); hit(); });
          keyH = (e) => { if (e.code === 'Space' || e.code === 'Enter') { e.preventDefault(); hit(); } }; addEventListener('keydown', keyH);
          timed(q.time, () => outcome(false, okFx, failFx));
        } else if (q.kind === 'timing') {
          let tries = q.tries || 1;
          bodyEl.innerHTML = `<div class="gauge"><span class="zone" style="left:${q.zone[0] * 100}%;width:${(q.zone[1] - q.zone[0]) * 100}%"></span><i class="needle"></i></div><button class="btn green big">KICK! <small>${tries} tries</small></button>`;
          const needle = bodyEl.querySelector('.needle'), btn = bodyEl.querySelector('button');
          let t0 = performance.now(), x = 0;
          const anim = () => { x = (Math.sin((performance.now() - t0) / 1000 * 3.1 / react) + 1) / 2; needle.style.left = x * 100 + '%'; if (!done) requestAnimationFrame(anim); };
          anim();
          const press = () => {
            if (x >= q.zone[0] && x <= q.zone[1]) outcome(true, okFx, failFx);
            else { tries--; game.audio?.play('engine-stall', { vol: 0.5 }); btn.innerHTML = `KICK! <small>${tries} tries</small>`; if (tries <= 0) outcome(false, okFx, failFx); }
          };
          btn.addEventListener('pointerdown', (e) => { e.preventDefault(); press(); });
          keyH = (e) => { if (e.code === 'Space' || e.code === 'Enter') { e.preventDefault(); press(); } }; addEventListener('keydown', keyH);
          timed(q.time, () => outcome(false, okFx, failFx));
        } else if (q.kind === 'swipe') {
          const arrow = { left: '⬅', right: '➡', up: '⬆' }[q.dir];
          bodyEl.innerHTML = `<div class="swipe-pad"><span class="arr">${arrow}</span><small>Swipe ${q.dir}${q.dir === 'up' ? '' : ''} (or press the arrow key)</small></div>`;
          const pad = bodyEl.querySelector('.swipe-pad');
          let s0 = null;
          // swipe anywhere on the screen
          const dn = (e) => { s0 = { x: e.clientX, y: e.clientY }; };
          const upH = (e) => {
            if (!s0) return; const dx = e.clientX - s0.x, dy = e.clientY - s0.y; s0 = null;
            const dir = Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 'left' : 'right') : (dy < 0 ? 'up' : 'down');
            if (Math.hypot(dx, dy) < 30) { pad.classList.add('nudge'); return; }
            outcome(dir === q.dir, okFx, failFx);
          };
          addEventListener('pointerdown', dn, true); addEventListener('pointerup', upH, true);
          cleanups.push(() => { removeEventListener('pointerdown', dn, true); removeEventListener('pointerup', upH, true); });
          keyH = (e) => { const map = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', KeyA: 'left', KeyD: 'right', KeyW: 'up' }; if (map[e.code]) { e.preventDefault(); outcome(map[e.code] === q.dir, okFx, failFx); } };
          addEventListener('keydown', keyH);
          timed(q.time, () => outcome(false, okFx, failFx));
        } else if (q.kind === 'hold') {
          let held = 0, down = false, last = performance.now();
          bodyEl.innerHTML = `<button class="btn blue big qte-hold">HOLD</button><div class="qbar"><i></i></div>`;
          const btn = bodyEl.querySelector('button'), fill = bodyEl.querySelector('.qbar i');
          const tick = () => { const now = performance.now(); if (down) held += (now - last) / 1000; last = now; fill.style.width = Math.min(100, held / q.need * 100) + '%'; if (held >= q.need) return outcome(true, okFx, failFx); if (!done) requestAnimationFrame(tick); };
          tick();
          btn.addEventListener('pointerdown', (e) => { e.preventDefault(); down = true; capture(btn, e); if (q.sfx) game.audio?.play('horn-scooter'); });
          btn.addEventListener('pointerup', () => (down = false)); btn.addEventListener('pointercancel', () => (down = false));
          keyH = (e) => { if (e.code === 'Space') { e.preventDefault(); down = e.type === 'keydown'; } };
          addEventListener('keydown', keyH); addEventListener('keyup', keyH);
          timed(q.time, () => outcome(false, okFx, failFx));
        }
      };
      if (qte) runQte(qte, ev.ok, ev.fail);
      else {
        bodyEl.innerHTML = `<div class="ev-opts">${opts.map((o, i) => `<button class="btn ${i === 0 ? 'green' : 'blue'} opt" data-i="${i}"><b>${esc(o.label)}</b>${o.sub ? `<small>${esc(o.sub)}</small>` : ''}<kbd>${i + 1}</kbd></button>`).join('')}</div>`;
        const choose = (i) => {
          const o = opts[i]; if (!o) return;
          tap();
          act = o.act || null; picked = i;
          if (o.qte) { cancelAnimationFrame(raf); if (keyH) removeEventListener('keydown', keyH); runQte(o.qte, o.ok, o.fail); return; }
          if (o.risk) { const bad = Math.random() < o.risk.p; game.audio?.play(bad ? 'qte-bad' : 'qte-good'); finish({ ...(bad ? o.risk.bad : o.risk.good), __good: !bad, __bad: bad, __act: act }); return; }
          finish({ ...(o.effect || {}), __act: act });
        };
        bodyEl.addEventListener('click', (e) => { const b = e.target.closest('[data-i]'); if (b) choose(+b.dataset.i); });
        keyH = (e) => { const n = +e.key; if (n >= 1 && n <= opts.length) choose(n - 1); }; addEventListener('keydown', keyH);
        // undecided → the last (safe/plain) option
        timed(7, () => { auto = true; choose(opts.length - 1); });
      }
    });
  }

  function pickup(orders, R) {
    return new Promise((resolve) => {
      const o = orders[0];
      const m = modal(`<div class="ribwrap top"><span class="ribbon">Pick up</span></div><div class="sc-row">${ICON(FOODS[o.food].icon, 'scf')}<span><small>Pick up order${orders.length > 1 ? 's' : ''}</small><b>${esc(o.restName)}</b>
        <em>${orders.map((x) => `${FOODS[x.food].name} for ${esc(x.name)}`).join(' · ')}</em></span></div>
        <button class="btn green big" data-x="ok">Confirm Pickup</button>`, { cls: 'scene' });
      game.ob?.event('pickup');
      const go = () => { tap(); removeEventListener('keydown', kh); m.close(); game.ob?.event('picked'); resolve(); };
      const kh = (e) => { if (e.code === 'Space' || e.code === 'Enter' || e.code === 'KeyE') go(); };
      addEventListener('keydown', kh);
      m.card.querySelector('[data-x]').onclick = go;
    });
  }
  function drop(o, R) {
    return new Promise((resolve) => {
      const m = modal(`<div class="ribwrap top"><span class="ribbon">Delivery</span></div><div class="sc-row">${ICON('char-' + o.char, 'scc')}<span><small>Deliver to</small><b>${esc(o.name)}</b><em>${FOODS[o.food].name} from ${esc(o.restName)}</em></span><span class="check">✓</span></div>
        <button class="btn green big" data-x="ok">Complete Delivery</button>`, { cls: 'scene' });
      game.ob?.event('drop');
      const go = () => { tap(); removeEventListener('keydown', kh); m.close(); game.ob?.event('dropped'); resolve(); };
      const kh = (e) => { if (e.code === 'Space' || e.code === 'Enter' || e.code === 'KeyE') go(); };
      addEventListener('keydown', kh);
      m.card.querySelector('[data-x]').onclick = go;
    });
  }
  function rated(o, r) {
    return new Promise((resolve) => {
      const lines = [];
      if (r.early) lines.push(`<span class="good">Early bonus +${money(r.bonus)}</span>`);
      if (r.flow > 1) lines.push(`<span class="good">Flow ×${r.flow.toFixed(1)} on the tip</span>`);
      if (r.late) lines.push(`<span class="bad">Late${r.latePenalty ? ` −${money(r.latePenalty)}` : ''}</span>`);
      if (r.cond < 85) lines.push(`<span class="bad">Food ${r.cond < 35 ? 'ruined' : r.cond < 60 ? 'damaged' : 'a bit shaken'}</span>`);
      const quote = r.stars >= 5 ? ['Perfect, thank you!!', 'Still hot! You\'re the best.', 'Wow, that was fast!'] : r.stars >= 4 ? ['Thanks!', 'Great, cheers!'] : r.stars >= 3 ? ['Okay… thanks.', 'Bit late, but fine.'] : ['Seriously?', 'It\'s all cold…', 'What happened to my food?!'];
      const m = modal(`<div class="stars big">${stars(r.stars)}</div><p class="quote">“${quote[Math.floor(Math.random() * quote.length)]}” <small>— ${esc(o.name)}</small></p>
        <div class="paid"><span>${money(r.pay + r.bonus)}</span>${r.tip ? `<span class="tip">+ ${money(r.tip)} tip</span>` : ''}</div><div class="notes">${lines.join('')}</div>`, { cls: 'rated', dismiss: true });
      m.el.querySelectorAll('.stars .st').forEach((s, i) => { s.style.animationDelay = i * 0.08 + 's'; });
      const t = setTimeout(done, 2300);
      function done() { clearTimeout(t); m.close(); resolve(); }
      m.el.addEventListener('click', done);
    });
  }

  function receipt(sum) {
    return new Promise((resolve) => {
      const rows = sum.lines.map((l) => `<div class="rl ${l.cls || ''}"><span>${l.label}</span><b>${l.amount >= 0 ? '+' : ''}${money(l.amount, Math.abs(l.amount) < 10 && l.amount % 1 !== 0)}</b></div>`).join('');
      // XP bar: what you had before this run (gold) and what it added (blue); a level-up starts the new level's bar
      const need = St.xpNeed(), before = S.xp - sum.xp, up = before < 0;
      const w0 = up ? 0 : before / need * 100, w1 = Math.min(100 - w0, (up ? S.xp : sum.xp) / need * 100);
      const m = modal(`<div class="ribwrap top"><span class="ribbon">${sum.total >= 0 ? 'Delivered!' : 'Rough ride'}</span></div>
        <div class="stars arc">${stars(Math.round(sum.avgStars))}</div>
        <div class="ramt ${sum.total < 0 ? 'neg' : ''}">${sum.total >= 0 ? '+' : ''}${money(sum.total, Math.abs(sum.total) < 100)}</div>
        <div class="rlines">${rows}</div>
        <div class="rxp2"><span class="shield"><b>${S.lvl}</b></span><span class="bar"><u style="width:${w0.toFixed(1)}%"></u><s style="left:${w0.toFixed(1)}%;width:${w1.toFixed(1)}%"></s><em>+${sum.xp} XP${up ? ' · Level up!' : ''}</em></span><span class="shield next"><b>${S.lvl + 1}</b></span></div>
        ${sum.goals ? `<div class="rgoal">${ICON('ui-trophy')} ${sum.goals}</div>` : ''}
        <button class="btn green big" data-x="ok">${ICON('ui-cash')} Collect</button>`, { cls: 'receipt' });
      game.ob?.event('receipt');
      const amt = m.card.querySelector('.ramt');
      if (!calm && sum.total > 0) {
        const t0 = performance.now() + 350, dec = Math.abs(sum.total) < 100;
        const step = () => { const f = Math.max(0, Math.min(1, (performance.now() - t0) / 900)); amt.textContent = '+' + money(sum.total * (1 - Math.pow(1 - f, 3)), dec); if (f < 1 && amt.isConnected) requestAnimationFrame(step); };
        step();
      }
      const go = () => { game.audio?.play('ui-coins'); if (sum.total > 0) coinsTo(m.card.querySelector('[data-x]'), 10); removeEventListener('keydown', kh); m.close(); resolve(); };
      const kh = (e) => { if (e.code === 'Space' || e.code === 'Enter') go(); };
      addEventListener('keydown', kh);
      m.card.querySelector('[data-x]').onclick = go;
    });
  }
  function levelUp(lvl, unlocks) {
    return new Promise((resolve) => {
      const m = modal(`<div class="burst"></div><div class="lvshield"><span class="shield"><b>${lvl}</b></span></div><div class="ribwrap"><span class="ribbon">Level up!</span></div><p class="lvcash">${ICON('ui-cash')} +${money(St.levelReward())} bonus</p><p class="lvcash en">${ICON('ui-bolt')} Energy full</p>${unlocks.length ? `<ul class="unl">${unlocks.map((u) => `<li>${u}</li>`).join('')}</ul>` : ''}
        <button class="btn green big" data-x="ok">Nice!</button>`, { cls: 'pop' });
      game.audio?.play('ui-levelup');
      m.card.querySelector('[data-x]').onclick = (e) => { tap(); coinsTo(e.currentTarget, 8); m.close(); resolve(); };
    });
  }
  function offline(info) {
    return new Promise((resolve) => {
      const h = Math.floor(info.away / 60), mi = Math.round(info.away % 60);
      const m = modal(`<div class="zz">${ICON('ui-moon', 'big')}</div><h2>Your drivers kept working!</h2>
        <div class="rlines"><div class="rl"><span>${ICON('ui-cash')} Offline earnings</span><b class="good">+${money(info.gain)}</b></div>
        <div class="rl"><span>${ICON('ui-clock')} Away</span><b>${h ? h + ' h ' : ''}${mi} min${info.capped ? ' (capped)' : ''}</b></div></div>
        <button class="btn green big" data-x="ok">Collect</button>`, { cls: 'pop' });
      m.card.querySelector('[data-x]').onclick = (e) => { St.collectFleet(); game.audio?.play('ui-coins'); coinsTo(e.currentTarget, 10); m.close(); resolve(); };
    });
  }
  function dayReport(r) {
    return new Promise((resolve) => {
      const m = modal(`<div class="ribwrap"><span class="ribbon">End of Day ${r.day}</span></div><p class="small">The city goes to sleep. Tomorrow starts at 08:00.</p>
        <div class="rlines"><div class="rl"><span>Deliveries</span><b>${r.deliveries}</b></div><div class="rl"><span>Earned riding</span><b>${money(r.earned)}</b></div>
        <div class="rl"><span>Tips</span><b>${money(r.tips)}</b></div><div class="rl"><span>Fuel</span><b class="bad">−${money(r.fuel, true)}</b></div>
        ${r.fleet ? `<div class="rl"><span>Fleet income</span><b class="good">+${money(r.fleet)}</b></div>` : ''}
        ${r.wages ? `<div class="rl"><span>Courier wages</span><b class="bad">−${money(r.wages)}</b></div>` : ''}
        ${r.quit ? `<div class="rl"><span>${esc(r.quit)} quit — wages unpaid</span><b class="bad">!</b></div>` : ''}</div>
        <button class="btn green big" data-x="ok">${ICON('ui-sun')} Next day</button>`, { cls: 'pop' });
      m.card.querySelector('[data-x]').onclick = () => { tap(); m.close(); resolve(); };
    });
  }
  function employerNews(n) {
    const d = DISTRICT[n.d];
    if (n.kind === 'promoted') { game.audio?.play('ui-levelup', { vol: 0.7 }); toast(`${d.employer}: promoted to ${n.rank.name}! ${n.rank.perk}`, 'good'); }
    if (n.kind === 'probation') toast(`${d.employer}: on probation — get your ${d.name} rating back to ★${n.req.toFixed(1)}`, 'bad');
    if (n.kind === 'cleared') toast(`${d.employer}: probation over. Perks are back.`, 'good');
    if (n.kind === 'suspended') toast(`${d.employer} suspended you for today. ${d.name} orders return tomorrow.`, 'bad');
  }
  let achQ = Promise.resolve();
  function achievement(a) {
    achQ = achQ.then(() => new Promise((r) => {
      const prem = a.paint && PREMIUM.find((p) => p.id === a.paint);
      game.audio?.play('ui-unlock', { vol: 0.7 });
      toast(`${ICON('ui-trophy')} ${a.name} — ${prem ? `${prem.name} finish unlocked` : `+${money(a.cash)}`}`, 'good');
      setTimeout(r, 1600);
    }));
  }
  // the energy panel: the ⚡ chip opens it, and so does an order or Start there isn't enough energy for (`need`)
  function energy({ need = 0 } = {}) {
    if ($('.modal.energy', modals)) return;
    const bolt = ICON('ui-bolt', 'eb');
    const m = modal('', { cls: 'pop energy', dismiss: true });
    const draw = () => {
      const n = St.tickEnergy(), max = St.energyMax(), short = need > n, price = St.coffeePrice(), left = St.coffeeLeft();
      m.card.innerHTML = `<div class="en-icon">${ICON('ui-bolt')}</div><h2>${short ? 'Out of energy!' : 'Energy'}</h2>
        <p class="small">${short ? `That takes ${bolt}<b>${need}</b> — you have <b>${n}</b>.` : `Every order costs ${bolt}<b>${ENERGY.order}</b>, paid when you start.`}</p>
        <div class="en-bar"><i style="width:${Math.min(100, n / max * 100)}%"></i><b>${n} / ${max}</b></div>
        <p class="en-eta small"></p>
        <div class="rlines en-ways">
          <div class="rl"><span>${ICON('ui-clock')} Rest</span><b>+1 every ${ENERGY.regenMin} min</b></div>
          <div class="rl"><span>${ICON('ui-xp')} Level up</span><b>full tank</b></div>
          <div class="rl"><span>${ICON('ui-trophy')} Daily goal</span><b>+${ENERGY.goal} ${bolt}</b></div>
          <div class="rl"><span>${ICON('ui-bolt')} Stamina skill</span><b>+${ENERGY.stamina} tank / level</b></div>
          ${S.fleet.office ? `<div class="rl"><span>${ICON('ui-people')} Your fleet</span><b>earns while you rest</b></div>` : ''}
        </div>
        ${price != null
          ? `<button class="btn gold big" data-x="coffee" ${S.cash < price ? 'disabled' : ''}>${ICON('food-coffee')} Coffee +${ENERGY.coffee.n}${bolt}<small>${money(price)}</small></button>
             <p class="small en-cups">${left} cup${left > 1 ? 's' : ''} left today${left < ENERGY.coffee.price.length ? ' · each one costs more' : ''}</p>`
          : `<p class="small en-cups">${ICON('food-coffee')} The café is closed for today — back tomorrow.</p>`}
        <button class="btn ${short ? 'ghost' : 'green big'}" data-x="ok">${short ? 'Wait' : 'OK'}</button>`;
      tick();
    };
    // the countdowns tick without redrawing the buttons
    const tick = () => {
      const eta = St.energyEta(), el = $('.en-eta', m.card);
      if (el) el.innerHTML = eta.next ? `Next ${ICON('ui-bolt', 'eb')} in <b>${mmss(eta.next / 1000)}</b> · full in <b>${hmm(eta.full / 1000)}</b>` : 'Full tank — go ride!';
    };
    let last = St.tickEnergy();
    const iv = setInterval(() => { if (!m.el.isConnected) return clearInterval(iv); const n = St.tickEnergy(); if (n !== last) { last = n; draw(); } else tick(); }, 1000);
    m.card.addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.dataset.x === 'coffee') {
        if (St.buyCoffee()) { game.audio?.play('ui-purchase'); toast(`${ICON('food-coffee')} +${ENERGY.coffee.n} energy`, 'good'); last = St.tickEnergy(); draw(); refreshStartbar(); }
        else toast('Not enough cash', 'bad');
      }
      if (b.dataset.x === 'ok') { tap(); m.close(); }
    });
    draw();
  }
  function tutorial(text, { at = 'center', btn = 'Got it' } = {}) {
    return new Promise((resolve) => {
      const m = modal(`<p>${text}</p><button class="btn green" data-x="ok">${btn}</button>`, { cls: 'tip at-' + at });
      m.card.querySelector('[data-x]').onclick = () => { tap(); m.close(); resolve(); };
    });
  }

  function setMode(mode) {
    hub.hidden = mode !== 'hub';
    hud.hidden = mode !== 'ride';
    document.body.dataset.mode = mode;
    if (mode === 'hub') { refreshTop(); render(); }
    refreshStartbar();
  }
  St.on((what, data) => {
    if (['cash', 'xp', 'rating', 'clock', 'fleetbank', 'look', 'vehicles', 'skills', 'districts', 'fleet', 'fleetevent', 'energy'].includes(what)) refreshTop();
    if (what === 'energy') refreshStartbar();
    if (what === 'fleetevent' && !hub.hidden) { toast('Your dispatch office needs a decision — see Fleet', ''); if (tab === 'fleet') render(); }
    if (what === 'contract' && data) toast('Contract goal done — claim it on the City tab', 'good');
  });

  return {
    setMode, setTab, render, refreshTop, toast, modal, event, pickup, drop, rated, receipt, levelUp, offline, dayReport, tutorial, employerNews, achievement, energy,
    rideLeg, rideFrame, routeChanged, flash, coach, flowPop, pop, get tab() { return tab; },
    sheetState: () => sheetState, setSheet: (s) => { sheetState = s; sheet.dataset.state = s; },
  };
}

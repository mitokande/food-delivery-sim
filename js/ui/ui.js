// DOM UI: hub (top bar, tabs, sheets), ride HUD, modals, toasts.
import * as St from '../state.js';
import { S } from '../state.js';
import { VEHICLES, VEHICLE, PARTS, PART_MAX, partCost, SKILLS, SKILL_MAX, skillCost, DISTRICTS, DISTRICT, FOODS, ORDER_TYPES, RESTAURANT,
  FLEET, fleetRate, PAINTS, PAINT_COST, CHAR_IDS, DAY_END } from '../data.js';
import { HZ } from '../ride/hazards.js';
import { W as WEATHER, RAIN_PAY } from '../weather.js';

export const ICON = (n, cls = '') => `<img class="ic ${cls}" src="assets/icons/${n}.webp" alt="" draggable="false" onerror="this.onerror=null;this.src='assets/icons/${n}.png'">`;
export const money = (n, dec = false) => {
  const a = Math.abs(n), sg = n < 0 ? '−' : '';
  if (a >= 1e6) return `${sg}$${(a / 1e6).toFixed(a >= 1e7 ? 1 : 2)}M`;
  if (a >= 1e4) return `${sg}$${(a / 1e3).toFixed(1)}K`;
  return `${sg}$${dec ? a.toFixed(2) : Math.round(a).toLocaleString('en-US')}`;
};
const clockStr = (m) => { const h = Math.floor(m / 60) % 24, mm = Math.floor(m % 60); return `${String(h).padStart(2, '0')}:${String(mm).padStart(2, '0')}`; };
const mmss = (s) => { const n = Math.max(0, Math.ceil(s)); return `${Math.floor(n / 60)}:${String(n % 60).padStart(2, '0')}`; };
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const $ = (sel, root = document) => root.querySelector(sel);
const stars = (n, max = 5) => Array.from({ length: max }, (_, i) => ICON(i < n ? 'ui-star' : 'ui-star-empty', 'st')).join('');
const pips = (n, max) => `<span class="pips">${Array.from({ length: max }, (_, i) => `<i class="${i < n ? 'on' : ''}"></i>`).join('')}</span>`;
const km = (m) => m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m / 10) * 10} m`;

export function createUI(game) {
  const root = document.getElementById('ui');
  root.innerHTML = `
  <div id="hubui">
    <header class="topbar">
      <button class="who" data-act="tab" data-tab="courier"><span class="ava">${ICON('char-' + S.look.char)}</span>
        <span class="lvlbox"><small class="nm"></small><b class="lvl">Lv. 1</b><span class="xpbar"><i></i><em class="xptext"></em></span></span></button>
      <span class="res cash">${ICON('ui-cash')}<b class="cashv">$0</b></span>
      <span class="res rate">${ICON('ui-star')}<b class="ratev">4.5</b></span>
      <button class="gear" data-act="settings" aria-label="Settings"><svg viewBox="0 0 24 24"><path fill="currentColor" d="M19.4 13a7.6 7.6 0 0 0 0-2l2.1-1.6-2-3.5-2.5 1a7.4 7.4 0 0 0-1.7-1L15 3.3h-4l-.4 2.6a7.4 7.4 0 0 0-1.7 1l-2.5-1-2 3.5L6.6 11a7.6 7.6 0 0 0 0 2l-2.1 1.6 2 3.5 2.5-1c.5.4 1.1.7 1.7 1l.4 2.6h4l.4-2.6c.6-.3 1.2-.6 1.7-1l2.5 1 2-3.5zM13 15.5A3.5 3.5 0 1 1 13 8.5a3.5 3.5 0 0 1 0 7z" transform="translate(-1 0)"/></svg></button>
    </header>
    <div class="clockbar"><span class="day">Day 1</span><b class="clock">08:00</b><span class="rush" hidden></span><span class="rainchip" hidden>${ICON('ui-rain')}Rain pay ×${RAIN_PAY}</span><button class="fleetbank" data-act="collect" hidden>${ICON('ui-cash')}<b></b></button></div>
    <section id="sheet" class="sheet"><div class="grab" data-act="grab"><i></i></div><div class="sheet-body"></div></section>
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
      <div class="r-timer">${ICON('ui-clock')}<b>0:00</b></div>
    </div>
    <div class="r-sub">
      <div class="r-cond" hidden><span class="m heat">${ICON('ui-thermo')}<i><u></u></i></span><span class="m integ">${ICON('ui-package')}<i><u></u></i></span></div>
      <canvas class="r-map" width="240" height="240"></canvas>
    </div>
    <div class="r-ctx"></div>
    <div class="r-speed"><b>0</b><small>km/h</small></div>
    <button class="r-btn horn" data-ride="horn" aria-label="Horn">${ICON('ui-horn')}</button>
    <button class="r-btn hop" data-ride="hop" aria-label="Hop">${ICON('ui-jump')}<span>HOP</span></button>
    <button class="r-btn boost" data-ride="boost" aria-label="Turbo"><svg class="ring" viewBox="0 0 100 100"><circle cx="50" cy="50" r="45" class="bg"/><circle cx="50" cy="50" r="45" class="fg"/></svg>${ICON('ui-nitro')}<span>TURBO</span></button>
    <div class="r-keys">Space turbo · W hop · E action · H horn · drag to look</div>
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
    if (dismiss) wrap.addEventListener('click', (e) => { if (e.target === wrap) close(); });
    return { el: wrap, card: wrap.firstElementChild, close };
  }
  const tap = () => game.audio?.play('ui-tap');

  // ---------- top bar ----------
  function refreshTop() {
    $('.lvl', hub).textContent = `Lv. ${S.lvl}`;
    const nm = $('.nm', hub); nm.textContent = S.name || ''; nm.hidden = !S.name;
    const need = St.xpNeed();
    $('.xpbar i', hub).style.width = `${Math.min(100, S.xp / need * 100)}%`;
    $('.xptext', hub).textContent = `${S.xp}/${need}`;
    $('.cashv', hub).textContent = money(S.cash);
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
    $('.tabs .dot', hub).hidden = !(S.lvl >= FLEET.unlockLvl && !S.fleet.office);
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
    const key = game.taken.map((o) => o.id).join(',') + '|' + cap;
    if (key === startKey) return;
    const grew = startKey && key.split('|')[0].split(',').length > startKey.split('|')[0].split(',').length;
    startKey = key;
    startbar.innerHTML = `<span class="sb-foods">${game.taken.map((o) => ICON(FOODS[o.food].icon)).join('')}</span>
      <span class="sb-info"><b>${game.taken.length === 1 ? esc(game.taken[0].restName) : `${game.taken.length} orders`}</b><small>${money(pay)} + tips · box ${used}/${cap}</small></span>
      <button class="btn green sb-go" data-act="start">Start ${ICON('ui-nitro')}</button>`;
    if (grew) { startbar.classList.remove('bump'); void startbar.offsetWidth; startbar.classList.add('bump'); }
  }

  // ---------- City: order board ----------
  function orderCard(o, taken) {
    const T = ORDER_TYPES[o.type];
    const d = DISTRICT[o.district];
    const left = Math.max(0, o.life - (performance.now() - o.born) / 1000);
    const est = Math.round((o.pickM + o.dropM) / (St.vehStats().top * 0.66) + 10);
    return `<div class="ocard ${taken ? 'taken' : ''} ${game.selOrder === o.id ? 'sel' : ''}" data-act="order" data-id="${o.id}">
      <span class="ofood">${ICON(FOODS[o.food].icon)}</span>
      <span class="oinfo"><b>${esc(o.restName)}</b><small>to ${esc(o.name)} · <i style="color:${d.color}">${d.name}</i></small>
        <span class="ometa">${ICON('ui-route')}${km(o.pickM + o.dropM)} ${ICON('ui-clock')}${mmss(o.eta)} <i class="est ${est <= o.eta * 0.85 ? 'fast' : est > o.eta ? 'slow' : ''}">you ~${mmss(est)}</i>${T.badge ? `<em class="badge b-${o.type}">${T.badge}</em>` : ''}${o.rain ? '<em class="badge b-rain">RAIN</em>' : ''}${o.size > 1 ? `<em class="badge">${o.size} slots</em>` : ''}</span></span>
      <span class="opay"><b>${money(o.base)}</b><small>+ tips</small><span class="otake">${taken ? '✓' : '+'}</span></span>
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
      ${g.claimed ? '<em>✓</em>' : g.p >= g.n ? `<button class="btn gold sm" data-act="claim" data-i="${i}">${money(g.reward)}</button>` : `<small>${g.p}/${g.n}</small>`}</div>`).join('');
    return `<div class="sec-head"><h2>Orders</h2><span class="sub">${St.rushMult().m > 1 ? `🔥 ${St.rushMult().name}` : `${list.length} nearby`}</span></div>
      <div class="orders">${list.map((o) => orderCard(o, game.taken.includes(o))).join('')}</div>
      ${start}
      <div class="sec-head"><h2>Today</h2><span class="sub">Day ${S.day} goals</span></div><div class="goals">${goals}</div>`;
  }
  function goalText(g) {
    const t = { deliver: `Deliver ${g.n} orders`, five: `Get ${g.n} five-star ratings`, shortcut: `Take ${g.n} shortcuts`, overtake: `Overtake ${g.n} cars`, perfect: `Land ${g.n} perfect hops`, early: `Deliver ${g.n} orders early`, nodamage: `${g.n} deliveries with no damage` };
    return t[g.id] || g.id;
  }

  // ---------- Garage ----------
  function stat(label, v, max, txt) { return `<div class="stat"><span>${label}</span><i><u style="width:${Math.min(100, v / max * 100)}%"></u></i><b>${txt}</b></div>`; }
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
      <div class="sec-head"><h3>Delivery box</h3></div>
      <div class="swatches">${PAINTS.map((c) => `<button class="sw box ${vs.boxColor === c ? 'on' : ''}" style="--c:${c}" data-act="paint" data-w="box" data-c="${c}" data-id="${sel}"></button>`).join('')}</div>` : '';
    return `<div class="sec-head"><h2>Garage</h2><span class="sub">${money(S.cash)} to spend</span></div>
      <div class="vcards">${cards}</div>
      <div class="vdetail"><h3>${v.name}</h3><p class="desc">${v.desc}</p>
        ${stat('Top speed', vs.top * 3.6, 90, Math.round(vs.top * 3.6) + ' km/h')}
        ${stat('Capacity', vs.cap, 5, vs.cap + (vs.cap > 1 ? ' orders' : ' order'))}
        ${stat('Smoothness', 2 - vs.bump, 1.6, Math.round((2 - vs.bump) / 1.6 * 100) + '%')}
        ${stat('Fuel', 1.6 - vs.fuel, 1.6, '$' + vs.fuel.toFixed(2) + '/km')}
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
      <div class="sec-head"><h3>Helmet</h3></div><div class="swatches">${helm}</div>
      <div class="sec-head"><h3>Career</h3></div>
      <div class="career"><span><b>${st.deliveries}</b>deliveries</span><span><b>${money(st.earned)}</b>earned</span><span><b>${st.fiveStars}</b>five stars</span>
        <span><b>${(st.meters / 1000).toFixed(1)} km</b>ridden</span><span><b>${st.overtakes}</b>overtakes</span><span><b>${money(st.bestTip)}</b>best tip</span></div>`;
  }

  // ---------- Jobs ----------
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
        ${s.open ? `<div class="hired">${ICON('ui-star')} You work here</div>` : `<ul class="reqs">${req.map(([t, ok]) => `<li class="${ok ? 'ok' : ''}">${ok ? '✓' : '✗'} ${t}</li>`).join('')}</ul>
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
        <small>${money(fleetRate(c.district, c.veh, c.skill) * (c.own ? 0.8 : 1), true)}/min</small></span>
        <span class="cbtns">${c.skill < 5 ? `<button class="btn blue sm" data-act="train" data-id="${c.id}" ${S.cash < St.trainCost(c) ? 'disabled' : ''}>Train ${money(St.trainCost(c))}</button>` : ''}
        <button class="btn ghost sm" data-act="fire" data-id="${c.id}">Let go</button></span></div>`;
    }).join('') || '<div class="hint">No couriers yet — hire one below.</div>';
    const apps = (f.applicants || []).map((a) => `<div class="crow app">${ICON('char-' + a.char, 'cava')}<span class="rt"><b>${esc(a.name)}</b>${pips(a.skill, 5)}<small>Brings a ${VEHICLE[a.ownVeh].name} · ~${money(fleetRate('oldtown', a.ownVeh, a.skill) * 0.8, true)}/min</small></span>
      <button class="btn green sm" data-act="hire" data-id="${a.id}" ${S.cash < a.fee || f.couriers.length >= L.slots ? 'disabled' : ''}>Hire ${money(a.fee)}</button></div>`).join('');
    return `<div class="sec-head"><h2>Fleet</h2><span class="sub">${f.couriers.length}/${L.slots} couriers</span></div>
      <div class="bank"><span>${ICON('ui-cash')}<b>${money(Math.floor(f.bank))}</b><small>${money(perMin, true)}/min · offline up to ${L.cap} h</small></span>
        <button class="btn gold" data-act="collect" ${f.bank < 1 ? 'disabled' : ''}>Collect</button></div>
      ${next ? `<div class="row">${ICON('ui-building')}<span class="rt"><b>Office level ${f.level + 1}</b><small>Next: ${next.slots} couriers, ${next.cap} h offline</small></span><button class="btn green sm" data-act="officeup" ${S.cash < next.cost ? 'disabled' : ''}>${money(next.cost)}</button></div>` : ''}
      <div class="sec-head"><h3>Your couriers</h3></div><div class="crows">${couriers}</div>
      <div class="sec-head"><h3>Applicants</h3><button class="link" data-act="reroll">new applicants · $20</button></div><div class="crows">${apps}</div>`;
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
      case 'order': game.toggleOrder(+id); render(); break;
      case 'start': game.startJob(); break;
      case 'claim': if (St.claimGoal(+b.dataset.i)) { game.audio?.play('ui-coins'); render(); } break;
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
      case 'reroll': if (St.spend(20)) { St.rollApplicants(); render(); } break;
      case 'collect': { const n = St.collectFleet(); if (n) { game.audio?.play('ui-coins'); toast(`+${money(n)} from your fleet`, 'cash'); if (tab === 'fleet') render(); } break; }
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
    const h = e.target.closest('.grab, .sheet-body > .sec-head:first-child');
    if (!h || e.target.closest('button, a, select, input')) return;
    e.preventDefault();
    sheet.setPointerCapture?.(e.pointerId);
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
      <p class="small">Progress is saved on this device.</p>
      <div class="set-more"><button class="btn ghost sm" data-x="replay">Replay tutorial</button><button class="btn ghost sm danger" data-x="reset">Reset progress</button></div>
      <button class="btn green big" data-x="close">Done</button>`, { dismiss: true, cls: 'settings' });
    m.card.addEventListener('input', (e) => { const k = e.target.dataset.k; if (!k) return; S.settings[k] = e.target.type === 'range' ? +e.target.value : e.target.type === 'checkbox' ? e.target.checked : e.target.value; St.save(); game.applySettings?.(); });
    m.card.addEventListener('click', (e) => {
      const x = e.target.closest('[data-x]')?.dataset.x;
      if (x === 'close') m.close();
      if (x === 'replay') { m.close(); game.ob?.replay(); }
      if (x === 'reset') { m.close(); confirmReset(); }
    });
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
    const down = (e) => { e.preventDefault(); btn.setPointerCapture?.(e.pointerId); t0 = performance.now(); label.textContent = 'Keep holding…'; cancelAnimationFrame(raf); tick(); };
    const up = () => { if (fill.style.width === '100%') return; cancelAnimationFrame(raf); fill.style.width = '0%'; label.textContent = 'Hold to erase'; };
    btn.addEventListener('pointerdown', down); btn.addEventListener('pointerup', up); btn.addEventListener('pointercancel', up); btn.addEventListener('lostpointercapture', up);
    m.card.querySelector('[data-x="cancel"]').addEventListener('click', () => { tap(); m.close(); });
  }
  function modalUnlock(id) {
    const d = DISTRICT[id];
    game.audio?.play('crowd-cheer', { vol: 0.7 });
    const m = modal(`<div class="burst" style="--dc:${d.color}"></div><h2>Hired!</h2><p><b>${d.employer}</b> took you on in <b style="color:${d.color}">${d.name}</b>.</p><p class="small">Orders there pay ×${d.pay}.</p>
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
    ring: $('.boost .fg', hud), boost: $('.boost', hud), hop: $('.hop', hud), map: $('.r-map', hud),
  };
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
  let ctxKey = '';
  // ride buttons: pointer events (hold for turbo)
  hud.addEventListener('pointerdown', (e) => {
    const b = e.target.closest('[data-ride]'); if (!b) return;
    e.preventDefault();
    b.classList.add('down');
    game.rideInput(b.dataset.ride, true);
    if (b.dataset.ride === 'boost') { b.setPointerCapture?.(e.pointerId); }
  });
  const rideUp = (e) => { const b = e.target.closest('[data-ride]'); if (!b) return; b.classList.remove('down'); if (b.dataset.ride === 'boost') game.rideInput('boost', false); };
  hud.addEventListener('pointerup', rideUp); hud.addEventListener('pointercancel', rideUp); hud.addEventListener('lostpointercapture', rideUp);
  // swipe up anywhere on the road = hop
  let sw = null;
  document.getElementById('gl').addEventListener('pointerdown', (e) => { if (!hud.hidden) sw = { x: e.clientX, y: e.clientY, t: performance.now() }; });
  document.getElementById('gl').addEventListener('pointerup', (e) => {
    if (!sw || hud.hidden) return;
    const dy = e.clientY - sw.y, dx = e.clientX - sw.x;
    if (dy < -45 && Math.abs(dx) < Math.abs(dy) && performance.now() - sw.t < 450) game.rideInput('hop', true);
    else if (dx < -60 && Math.abs(dx) > Math.abs(dy) * 1.5 && performance.now() - sw.t < 450) game.rideInput('overtake', true);
    sw = null;
  });

  function rideLeg(leg, R) {
    const o = leg.kind === 'pickup' ? R.orders.find((x) => leg.orders.includes(x.o.id)).o : R.orders.find((x) => x.o.id === leg.order).o;
    rh.verb.textContent = leg.kind === 'pickup' ? 'Pick up at' : 'Deliver to';
    rh.name.textContent = leg.kind === 'pickup' ? o.restName : o.name;
    rh.food.innerHTML = leg.kind === 'pickup' ? ICON(FOODS[o.food].icon) : ICON('char-' + o.char);
    rh.cond.hidden = !R.orders.some((x) => x.picked && !x.done);
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
      const sec = Math.ceil(rem);
      if (sec !== lastTick && sec <= 10 && sec >= 1 && R.phase === 'ride' && R.timeScale === 1) { lastTick = sec; game.audio?.play('countdown-tick', { vol: 0.7 }); }
      rh.timerBox.classList.toggle('late', rem < 0);
      rh.timerBox.classList.toggle('warn', rem >= 0 && rem < 10);
      const carried = live.filter((x) => x.picked);
      if (carried.length) {
        const h = Math.min(...carried.map((x) => x.heat)), g = Math.min(...carried.map((x) => x.integrity));
        rh.heat.style.width = h + '%'; rh.integ.style.width = g + '%';
        rh.heat.parentNode.parentNode.classList.toggle('low', h < 50); rh.integ.parentNode.parentNode.classList.toggle('low', g < 50);
        rh.cond.hidden = false;
      }
    }
    rh.speed.textContent = Math.round(R.v * 3.6);
    const F = R.flow;
    if (F) {
      flowEl.hidden = !(F.n > 0);
      if (F.n > 0) { flowMult.textContent = '×' + F.mult.toFixed(1); flowBar.style.width = Math.max(0, F.t / 7 * 100) + '%'; flowEl.classList.toggle('max', F.mult >= 2); }
    }
    const sp = R.phase === 'ride' ? Math.max(0, Math.min(1, (R.v - 6.5) / 7)) * (R.boost ? 1 : 0.35) : 0;
    speedEl.style.opacity = sp.toFixed(2);
    const e = R.energy / R.energyMax;
    rh.ring.style.strokeDashoffset = String(283 * (1 - e));
    rh.boost.classList.toggle('empty', R.energy < 5);
    rh.boost.classList.toggle('on', R.boost);
    // context actions
    const acts = [];
    if (R.phase === 'ride' && R.crash <= 0) {
      const ot = game.canOvertake();
      if (ot) acts.push(['overtake', `${ICON('ui-overtake')}<span>Overtake</span>`, ['safe', 'risky', 'danger'][ot.risk]]);
      if (R.light && R.light.state !== 'g' && R.light.d < 16 && R.runLight !== R.light.tile) acts.push(['go', `${ICON('ui-traffic-light')}<span>Run it!</span>`, 'risky']);
      if (R.offer) acts.push(['shortcut', `${ICON('ui-shortcut')}<span>Shortcut <small>${R.offer.label}</small></span>`, 'safe']);
      if (R.hazards.some((h) => h.type === 'ped' && !h.done && h.walking && h.s - R.s < 28 && h.s > R.s)) acts.push(['horn', `${ICON('ui-horn')}<span>Honk!</span>`, 'safe']);
    }
    const key = acts.map((a) => a[0] + a[2]).join();
    if (key !== ctxKey) {
      ctxKey = key;
      rh.ctx.innerHTML = acts.map(([k, html, cls]) => `<button class="ctx ${cls}" data-ride="${k}">${html}</button>`).join('');
    }
    // hop hint: glow when a hoppable hazard is ahead
    const hz = R.hazards.find((h) => !h.done && HZ[h.type].hop && h.lane >= 0 && h.s - R.s > 0 && h.s - R.s < Math.max(8, R.v * 1.3));
    rh.hop.classList.toggle('hint', !!hz);
    if (hz) { const d = hz.s - R.s; rh.hop.classList.toggle('perfect', d > R.v * 0.16 && d < R.v * 0.38); } else rh.hop.classList.remove('perfect');
    mapT += 1; if (mapT % 2 === 0) drawMap(R);
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
      const m = dock(`<div class="ev-head">${ICON(ev.icon || 'ui-bolt', 'evi')}<h2>${esc(ev.title)}</h2></div><p>${esc(ev.text)}</p>
        <div class="ev-body"></div><div class="ev-timer"><i></i></div>`);
      const bodyEl = m.card.querySelector('.ev-body'), bar = m.card.querySelector('.ev-timer i');
      let done = false, raf = 0, keyH = null;
      const cleanups = [];
      const finish = (res) => {
        if (done) return; done = true; cancelAnimationFrame(raf);
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
          btn.addEventListener('pointerdown', (e) => { e.preventDefault(); down = true; btn.setPointerCapture?.(e.pointerId); if (q.sfx) game.audio?.play('horn-scooter'); });
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
          act = o.act || null;
          if (o.qte) { cancelAnimationFrame(raf); if (keyH) removeEventListener('keydown', keyH); runQte(o.qte, o.ok, o.fail); return; }
          if (o.risk) { const bad = Math.random() < o.risk.p; game.audio?.play(bad ? 'qte-bad' : 'qte-good'); finish({ ...(bad ? o.risk.bad : o.risk.good), __good: !bad, __bad: bad, __act: act }); return; }
          finish({ ...(o.effect || {}), __act: act });
        };
        bodyEl.addEventListener('click', (e) => { const b = e.target.closest('[data-i]'); if (b) choose(+b.dataset.i); });
        keyH = (e) => { const n = +e.key; if (n >= 1 && n <= opts.length) choose(n - 1); }; addEventListener('keydown', keyH);
        // undecided → the last (safe/plain) option
        timed(7, () => choose(opts.length - 1));
      }
    });
  }

  function pickup(orders, R) {
    return new Promise((resolve) => {
      const o = orders[0];
      const m = modal(`<div class="sc-row">${ICON(FOODS[o.food].icon, 'scf')}<span><small>Pick up order${orders.length > 1 ? 's' : ''}</small><b>${esc(o.restName)}</b>
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
      const m = modal(`<div class="sc-row">${ICON('char-' + o.char, 'scc')}<span><small>Deliver to</small><b>${esc(o.name)}</b><em>${FOODS[o.food].name} from ${esc(o.restName)}</em></span><span class="check">✓</span></div>
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
      const m = modal(`<h2>Delivery complete!</h2><div class="stars">${stars(Math.round(sum.avgStars))}</div>
        <div class="rlines">${rows}</div><div class="rtotal"><span>Total</span><b>${money(sum.total, Math.abs(sum.total) < 100)}</b></div>
        <div class="rxp">${ICON('ui-xp')} +${sum.xp} XP${sum.goals ? ` · ${sum.goals}` : ''}</div>
        <button class="btn green big" data-x="ok">${ICON('ui-cash')} Collect</button>`, { cls: 'receipt' });
      game.ob?.event('receipt');
      const go = () => { game.audio?.play('ui-coins'); removeEventListener('keydown', kh); m.close(); resolve(); };
      const kh = (e) => { if (e.code === 'Space' || e.code === 'Enter') go(); };
      addEventListener('keydown', kh);
      m.card.querySelector('[data-x]').onclick = go;
    });
  }
  function levelUp(lvl, unlocks) {
    return new Promise((resolve) => {
      const m = modal(`<div class="burst"></div><div class="lvbig">${lvl}</div><h2>Level up!</h2>${unlocks.length ? `<ul class="unl">${unlocks.map((u) => `<li>${u}</li>`).join('')}</ul>` : ''}
        <button class="btn green big" data-x="ok">Nice!</button>`, { cls: 'pop' });
      game.audio?.play('ui-levelup');
      m.card.querySelector('[data-x]').onclick = () => { tap(); m.close(); resolve(); };
    });
  }
  function offline(info) {
    return new Promise((resolve) => {
      const h = Math.floor(info.away / 60), mi = Math.round(info.away % 60);
      const m = modal(`<div class="zz">${ICON('ui-moon', 'big')}</div><h2>Your drivers kept working!</h2>
        <div class="rlines"><div class="rl"><span>${ICON('ui-cash')} Offline earnings</span><b class="good">+${money(info.gain)}</b></div>
        <div class="rl"><span>${ICON('ui-clock')} Away</span><b>${h ? h + ' h ' : ''}${mi} min${info.capped ? ' (capped)' : ''}</b></div></div>
        <button class="btn green big" data-x="ok">Collect</button>`, { cls: 'pop' });
      m.card.querySelector('[data-x]').onclick = () => { St.collectFleet(); game.audio?.play('ui-coins'); m.close(); resolve(); };
    });
  }
  function dayReport(r) {
    return new Promise((resolve) => {
      const m = modal(`<h2>End of Day ${r.day}</h2><p class="small">The city goes to sleep. Tomorrow starts at 08:00.</p>
        <div class="rlines"><div class="rl"><span>Deliveries</span><b>${r.deliveries}</b></div><div class="rl"><span>Earned riding</span><b>${money(r.earned)}</b></div>
        <div class="rl"><span>Tips</span><b>${money(r.tips)}</b></div><div class="rl"><span>Fuel</span><b class="bad">−${money(r.fuel, true)}</b></div>
        ${r.fleet ? `<div class="rl"><span>Fleet income</span><b class="good">+${money(r.fleet)}</b></div>` : ''}</div>
        <button class="btn green big" data-x="ok">${ICON('ui-sun')} Next day</button>`, { cls: 'pop' });
      m.card.querySelector('[data-x]').onclick = () => { tap(); m.close(); resolve(); };
    });
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
  St.on((what) => {
    if (['cash', 'xp', 'rating', 'clock', 'fleetbank', 'look', 'vehicles', 'skills', 'districts', 'fleet'].includes(what)) refreshTop();
  });

  return {
    setMode, setTab, render, refreshTop, toast, modal, event, pickup, drop, rated, receipt, levelUp, offline, dayReport, tutorial,
    rideLeg, rideFrame, routeChanged, flash, coach, flowPop, get tab() { return tab; },
    sheetState: () => sheetState, setSheet: (s) => { sheetState = s; sheet.dataset.state = s; },
  };
}

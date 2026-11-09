// Uncle's Diner (idle3.html): the interface. Top bar, the fame bar, the "what's holding you back" banner, the SMASH
// button in the middle of the tab bar, the bottom sheet (Kitchen, Couriers, Diner) and the story cards.
// Numbers that change every frame are patched by live(); render() rebuilds a tab.
import * as S from './sim.js';

export const ICON = (n, cls = '') => `<img class="ic ${cls}" src="assets/icons/${n}.webp" alt="" draggable="false" onerror="this.onerror=null;this.src='assets/icons/${n}.png'">`;
const VICON = (id) => `<img class="ic veh" src="assets/icons/veh-${id}.png" alt="" draggable="false">`; // (vehicle icons are png only)
const ART = (n) => `assets/story/${n}.webp`;
const $ = (sel, root = document) => root.querySelector(sel);
const M = S.money;
const perMin = (n) => `${(Math.round(n * 10) / 10).toString()}/min`;
const sec = (s) => `${s < 10 ? s.toFixed(1) : Math.round(s)} s`;
const GEAR = '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M19.4 13a7.6 7.6 0 0 0 0-2l2.1-1.6-2-3.5-2.5 1a7.4 7.4 0 0 0-1.7-1L15 3.3h-4l-.4 2.6a7.4 7.4 0 0 0-1.7 1l-2.5-1-2 3.5L6.6 11a7.6 7.6 0 0 0 0 2l-2.1 1.6 2 3.5 2.5-1c.5.4 1.1.7 1.7 1l.4 2.6h4l.4-2.6c.6-.3 1.2-.6 1.7-1l2.5 1 2-3.5zM13 15.5A3.5 3.5 0 1 1 13 8.5a3.5 3.5 0 0 1 0 7z" transform="translate(-1 0)"/></svg>';
const YOU_CHAR = 'male-c';
const STATUS = { idle: 'at the diner', wait: 'waiting for a bag', drop: 'delivering', home: 'riding back' };
const MOTOR_NOTE = {
  rustbucket: 'Uncle\'s. Starts on the third kick.',
  zippy: 'Second-hand, honest, starts every time.',
  vespetta: 'The classic. Two orders a trip.',
  volt: 'Silent and quick. Two orders a trip.',
  viper: 'Stupidly fast.',
};

// the story: shown on the first visit (and from the Diner tab)
const STORY = [
  { img: 'letter', title: 'A letter', text: 'Your great-uncle Ferdi, whom you met exactly once at a wedding, has passed away. To everyone\'s surprise, he left everything he owned <b>to you</b>.' },
  { img: 'diner', title: 'Everything', text: 'Everything turns out to be one tired little diner in Old Town. The awning is torn, a window is boarded up, and the sign lost its letters years ago.' },
  { img: 'scooter', title: '…and a scooter', text: 'In the back alley stands his old delivery scooter. Rust, tape, and a black puff of smoke. It starts on the third kick. Usually.' },
  { img: 'smash', title: 'The menu', text: 'You are no chef. In your student years you learned exactly one thing: <b>the smash burger</b>. So that\'s the menu.<br>Tap <b>SMASH</b> to make one. People will come.' },
];

export function createDinerUI(game) {
  let G = game.G;
  const root = document.getElementById('ui');
  root.innerHTML = `
  <div id="hubui" class="idle diner">
    <header class="topbar">
      <button class="who" data-act="tab" data-tab="diner"><span class="ava">${ICON('char-' + YOU_CHAR)}</span>
        <span class="lvlbox"><small class="nm">Ferdi's Diner</small><span class="ipsbar"><b class="ips">$0/min</b></span></span></button>
      <span class="res cash">${ICON('ui-cash')}<b class="cashv">$0</b></span>
      <button class="gear" data-act="settings" aria-label="Settings">${GEAR}</button>
    </header>
    <div class="hud2">
      <button class="famebar" data-act="tab" data-tab="diner" aria-label="Fame">
        <span class="fm-lv">${ICON('ui-star')}<b class="famen">1</b></span>
        <span class="fm-track"><u class="fm-fill"></u></span>
        <span class="fm-text"><b class="soldn">0</b> sold</span>
      </button>
      <button class="neckb" data-act="neck"><span class="nt"></span></button>
    </div>
    <section id="sheet" class="sheet" data-state="closed"><div class="sheet-rib ribwrap" data-act="grab"><span class="ribbon"></span></div><div class="grab" data-act="grab"><i></i></div><div class="sheet-body"></div></section>
    <nav class="tabs">
      <button data-act="tab" data-tab="kitchen">${ICON('ui-building')}<span>Kitchen</span><i class="dot" hidden></i></button>
      <button class="smash ready" type="button" aria-label="Smash a burger"><span class="sm-ring"></span><span class="sm-face"><img src="${ART('smash-btn')}" alt="" draggable="false"></span><b class="sm-n">0/${S.COUNTER}</b><em>SMASH</em></button>
      <button data-act="tab" data-tab="couriers">${VICON('rustbucket')}<span>Couriers</span><i class="dot" hidden></i></button>
    </nav>
  </div>
  <div id="modals"></div>
  <div id="toasts"></div>`;
  const hub = $('#hubui'), sheet = $('#sheet'), body = $('.sheet-body'), modals = $('#modals'), toasts = $('#toasts'), fab = $('.smash', hub);
  let tab = 'kitchen';
  const api = {};
  const sfx = (n, o) => game.audio?.play(n, o);

  // ---------- generic ----------
  function toast(text, kind = '') {
    const el = document.createElement('div');
    el.className = 'toast ' + kind; el.innerHTML = text;
    toasts.append(el);
    setTimeout(() => el.classList.add('out'), 2200); setTimeout(() => el.remove(), 2700);
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

  // ---------- tabs (the open tab's own icon closes the sheet; again opens it) ----------
  const isClosed = () => sheet.dataset.state === 'closed';
  function setTab(t) {
    tab = t;
    for (const b of hub.querySelectorAll('.tabs button[data-tab]')) b.classList.toggle('on', b.dataset.tab === t);
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
    if (isClosed()) { renderedTab = null; live(); return; }
    const fn = { kitchen: renderKitchen, couriers: renderCouriers, diner: renderDiner }[tab];
    const keep = renderedTab === tab ? body.scrollTop : 0;
    body.innerHTML = fn();
    body.scrollTop = keep;
    const rib = $('.sheet-rib .ribbon', sheet), title = body.querySelector('.sec-head h2')?.textContent || '';
    if (rib.textContent !== title) { rib.textContent = title; rib.classList.remove('pop'); void rib.offsetWidth; rib.classList.add('pop'); }
    renderedTab = tab;
    live();
  }

  // ---------- skill buttons ----------
  function skillBtn(p, id, sk, label, now, next, color) {
    const cost = S.priceOfSkill(G, id, sk), L = p[sk];
    if (cost == null) return `<span class="kb max"><b>${label}</b><small>Lv ${L} · max</small></span>`;
    return `<button class="btn ${color} sm kb" data-act="skill" data-id="${id}" data-sk="${sk}" data-cost="${cost}"><b>${label} <i class="lv">Lv ${L}</i></b><small>${M(cost)}</small><em>${now} → ${next}</em></button>`;
  }

  // ---------- Kitchen ----------
  function personCard(p, role) {
    const id = role === 'you' ? 'you' : p.id, t = role === 'you' ? S.youTime(G) : S.cookTime(p);
    const price = S.PRICE * S.qualMult(p.quality), nextPrice = S.PRICE * S.qualMult(p.quality + 1);
    return `<div class="pcard ${role}" data-id="${id}">
      <div class="phead"><span class="pava">${ICON('char-' + (role === 'you' ? YOU_CHAR : p.char))}</span>
        <span class="kt"><b>${role === 'you' ? 'You' : p.name}</b><small>${role === 'you' ? `By hand: one burger a tap, ${sec(t)} each` : `Smashes on their own: ${perMin(60 / t)}`} · ${M(price)} a burger</small></span>
        <span class="made"><b data-live="made-${id}">${p.made}</b><small>made</small></span></div>
      <span class="pbar"><u data-live="pb-${id}"></u></span>
      <div class="kbtns two">
        ${skillBtn(p, id, 'speed', 'Speed', sec(t), sec(t * S.SPEED_K), 'blue')}
        ${skillBtn(p, id, 'quality', 'Quality', M(price), M(nextPrice), 'gold')}
      </div>
    </div>`;
  }
  function renderKitchen() {
    const cost = S.cookHireCost(G);
    return `<div class="sec-head"><h2>Kitchen</h2><span class="sub">${G.cooks.length + 1} at the grill</span></div>
      <div class="counter"><span class="slots" data-live="slots"></span>
        <span class="cq"><span>${ICON('ui-people')}<b data-live="inline">0</b><small>in line</small></span><span>${ICON('ui-package')}<b data-live="owait">0</b><small>orders</small></span></span></div>
      <div class="rows pcards">
        ${personCard(G.you, 'you')}
        ${G.cooks.map((c) => personCard(c, 'cook')).join('')}
        ${cost != null ? `<div class="row hire">${ICON('ui-people')}<span class="rt"><b>Hire a cook</b><small>${G.cooks.length ? 'Another pair of hands at the grill' : 'Makes burgers on their own, even when you don\'t tap'} · ${sec(S.COOK.make)} a burger to start</small></span>
          <button class="btn green sm buy" data-act="cook" data-cost="${cost}"><span>Hire</span><small>${M(cost)}</small></button></div>`
          : `<div class="hint">The kitchen is full: ${S.COOK.max} cooks and you.</div>`}
      </div>
      <div class="hint">Burgers go to whoever has waited longest: a walk-in at the counter or a delivery order. The counter holds ${S.COUNTER}.</div>`;
  }

  // ---------- Couriers ----------
  function courierCard(c) {
    const m = S.motorOf(c), nx = S.MOTORS[c.motor + 1], mc = S.motorCost(c), sp = S.speedOf(c);
    const tip = S.DELIV.tip * (1 + S.CHARM_STEP * c.charm);
    return `<div class="pcard rider" data-id="${c.id}">
      <div class="phead"><span class="pava">${ICON('char-' + c.char)}</span>
        <span class="kt"><b>${c.name}</b><small data-live="st-${c.id}"></small></span>
        <span class="made"><b>${c.trips}</b><small>trips</small></span></div>
      <div class="motor">${VICON(m.id)}<span class="rt"><b>${m.name}</b><small>${sp.toFixed(1)} m/s · carries ${S.capOf(c)}${m.stall ? ` · stalls ${Math.round(m.stall * 100)}% of the time` : ''}</small></span>
        ${nx ? `<button class="btn red sm buy" data-act="motor" data-id="${c.id}" data-cost="${mc}"><span>${nx.name}</span><small>${M(mc)}</small></button>` : '<i class="max">TOP</i>'}</div>
      ${nx ? `<div class="mnote">${VICON(nx.id)}<small>${MOTOR_NOTE[nx.id]} ${nx.speed} m/s${nx.cap > m.cap ? `, carries ${nx.cap}` : ''}${m.stall && !nx.stall ? ', never stalls' : ''}</small></div>` : ''}
      <div class="kbtns three">
        ${skillBtn(c, c.id, 'ride', 'Riding', `${sp.toFixed(1)}`, `${(S.MOTORS[c.motor].speed * (1 + S.RIDE_STEP * (c.ride + 1))).toFixed(1)} m/s`, 'blue')}
        ${skillBtn(c, c.id, 'bag', 'Bag', `${S.capOf(c)}`, `${S.capOf(c) + 1} orders`, 'green')}
        ${skillBtn(c, c.id, 'charm', 'Charm', M(tip), `${M(S.DELIV.tip * (1 + S.CHARM_STEP * (c.charm + 1)))} tips`, 'gold')}
      </div>
    </div>`;
  }
  function renderCouriers() {
    const cost = S.courierHireCost(G);
    if (!G.couriers.length) {
      return `<div class="sec-head"><h2>Couriers</h2><span class="sub">no one yet</span></div>
        <div class="scoot"><img src="${ART('scooter')}" alt="Uncle Ferdi's old scooter">
          <span class="pbar goal"><u data-live="cgoal"></u><em data-live="cgoalt"></em></span>
          <button class="btn green big" data-act="courier" data-cost="${cost}">Hire a courier · ${M(cost)}</button>
          <p>Uncle Ferdi's scooter is still in the back alley. Hire someone to ride it and the phone starts ringing: <b>delivery orders</b> from doors up to ${S.DELIV.radius} m away, paying about three times a walk-in, plus tips.</p></div>`;
    }
    return `<div class="sec-head"><h2>Couriers</h2><span class="sub">${G.couriers.length} on the road</span></div>
      <div class="fsum"><span>${ICON('ui-package')}<b data-live="ow">0</b><small>orders waiting</small></span><span>${ICON('ui-route')}<b data-live="ontheway">0</b><small>on the way</small></span><span>${ICON('ui-speed')}<b data-live="cap"></b><small>can carry</small></span></div>
      <div class="rows pcards">
        ${G.couriers.map(courierCard).join('')}
        ${cost != null ? `<div class="row hire">${VICON('rustbucket')}<span class="rt"><b>Hire a courier</b><small>Comes with a beat-up scooter of their own</small></span>
          <button class="btn green sm buy" data-act="courier" data-cost="${cost}"><span>Hire</span><small>${M(cost)}</small></button></div>` : '<div class="hint">That\'s all the couriers the diner can manage for now.</div>'}
      </div>
      <div class="hint">Orders come from doors within ${S.DELIV.radius} m: farther ones pay more. Quick deliveries get the full tip.</div>`;
  }

  // ---------- Diner ----------
  function renderDiner() {
    const L = S.fameLevel(G);
    return `<div class="sec-head"><h2>Ferdi's Diner</h2><span class="sub">Fame ${L}</span></div>
      <div class="famebig">${ICON('ui-star')}<span><b>Fame ${L}</b><small>Customers ×${S.fameMult(G).toFixed(2)} · ${perMin(S.walkRate(G))} walk-ins${G.couriers.length ? `, ${perMin(S.delivRate(G))} orders` : ''}</small>
        <span class="pbar"><u data-live="fame"></u><em data-live="famet"></em></span></span></div>
      <div class="rlines">
        <div class="rl"><span>${ICON('ui-people')} Walk-ins served</span><b data-live="walkins"></b></div>
        <div class="rl"><span>Left hungry</span><b data-live="lostWalk"></b></div>
        <div class="rl"><span>${ICON('ui-package')} Deliveries</span><b data-live="deliveries"></b></div>
        <div class="rl"><span>Cancelled orders</span><b data-live="lostOrders"></b></div>
        <div class="rl"><span>${ICON('ui-heart')} Tips</span><b data-live="tips"></b></div>
        <div class="rl"><span>${ICON('food-burger')} Burgers you smashed</span><b data-live="youmade"></b></div>
        <div class="rl"><span>${ICON('ui-cash')} Earned</span><b data-live="earned"></b></div>
      </div>
      <button class="btn ghost" data-act="story">${ICON('ui-gift')}Read Uncle Ferdi's letter again</button>
      <div class="hint">Prototype, phase 1. Every burger sold makes the diner better known: more walk-ins and more orders.<br>
        <a class="link" href="idle2.html">Hot Chain</a> · <a class="link" href="idle.html">The first idle prototype</a> · <a class="link" href="index.html">The courier game</a></div>`;
  }

  // ---------- the banner: what to do next ----------
  function guide() {
    const d = S.diagnose(G);
    const cook = S.cookHireCost(G), cour = S.courierHireCost(G);
    if (!G.cooks.length && G.stats.burgers < 3) return { k: 'start', cls: 'ok', html: `${ICON('food-burger')}<span>Tap <b>SMASH</b> to make a burger: customers buy them at the counter</span>` };
    if (!G.cooks.length && G.cash >= cook) return { k: 'cook', cls: 'go', html: `${ICON('ui-people')}<span>You can hire a cook: they smash burgers on their own</span>`, go: () => setTab('kitchen') };
    if (!G.couriers.length && G.cash >= cour) return { k: 'courier', cls: 'go', html: `${VICON('rustbucket')}<span>Uncle's scooter is waiting: hire a courier for deliveries</span>`, go: () => setTab('couriers') };
    if (d.kind === 'grill') return { k: 'grill', cls: 'bad', html: `${ICON('ui-people')}<span>Customers wait for burgers: smash, or get the kitchen faster</span>`, go: () => setTab('kitchen') };
    if (d.kind === 'bags') return { k: 'bags', cls: 'bad', html: `${ICON('ui-package')}<span>Delivery orders wait: the couriers can't keep up</span>`, go: () => setTab('couriers') };
    if (d.kind === 'courier') return { k: 'quietc', cls: 'warn', html: `${ICON('food-burger')}<span>The counter's full. Deliveries would bring more customers</span>`, go: () => setTab('couriers') };
    if (d.kind === 'quiet') return { k: 'quiet', cls: 'warn', html: `${ICON('ui-star')}<span>Burgers wait for customers: fame brings more of them</span>`, go: () => setTab('diner') };
    return { k: 'ok', cls: 'ok', html: `${ICON('ui-star')}<span>Business is smooth</span>` };
  }

  // ---------- live numbers ----------
  const earn = []; // [t, earned] samples for $/min
  let neckKey = '', neckGo = null;
  function setBtn(btn, cost) { const ok = G.cash + 1e-9 >= cost; if (btn.disabled === ok) btn.disabled = !ok; }
  function live() {
    $('.cashv', hub).textContent = M(G.cash);
    earn.push([G.t, G.stats.earned]); while (earn.length > 2 && G.t - earn[0][0] > 30) earn.shift();
    const span = G.t - earn[0][0];
    $('.ips', hub).textContent = `${M(span > 2 ? (G.stats.earned - earn[0][1]) / span * 60 : 0)}/min`;
    // fame
    const L = S.fameLevel(G), next = S.fameNext(G), prev = S.FAME[L - 1] || 0;
    $('.famen', hub).textContent = L;
    $('.fm-fill', hub).style.width = `${next ? Math.min(100, (G.served - prev) / (next - prev) * 100).toFixed(1) : 100}%`;
    $('.soldn', hub).textContent = next ? `${G.served}/${next}` : G.served;
    // the SMASH button
    const r = S.canSmash(G), y = G.you;
    const cls = r === 'ok' ? 'ready' : r === 'busy' ? 'busy' : 'full';
    if (!fab.classList.contains(cls)) { fab.classList.remove('ready', 'busy', 'full'); fab.classList.add(cls); }
    fab.style.setProperty('--p', (y.left > 0 ? 1 - y.left / S.youTime(G) : y.held != null ? 1 : 0).toFixed(3));
    const n = `${G.counter.length + S.packedN(G)}/${S.COUNTER}`; const nb = $('.sm-n', fab); if (nb.textContent !== n) nb.textContent = n;
    // the banner
    const g = guide();
    if (g.k !== neckKey) { neckKey = g.k; const nb2 = $('.neckb', hub); nb2.className = 'neckb ' + g.cls; nb2.innerHTML = g.html; neckGo = g.go || null; }
    // tab dots
    $('.tabs [data-tab="kitchen"] .dot', hub).hidden = !(g.k === 'cook' || g.k === 'grill');
    $('.tabs [data-tab="couriers"] .dot', hub).hidden = !(g.k === 'courier' || g.k === 'bags' || g.k === 'quietc');
    // story beat: the scooter, the first time a courier is affordable
    if (!G.seen.scooter && !G.couriers.length && G.cash >= S.courierHireCost(G) && !modals.children.length) scooterBeat();
    if (isClosed()) return;
    for (const btn of body.querySelectorAll('[data-cost]')) setBtn(btn, +btn.dataset.cost);
    if (tab === 'kitchen') {
      const sl = $('[data-live="slots"]', body);
      if (sl) {
        const p = S.packedN(G); let h = '';
        for (let i = 0; i < S.COUNTER; i++) h += i < G.counter.length ? `<i class="b">${ICON('food-burger')}</i>` : i < G.counter.length + p ? `<i class="p">${ICON('ui-package')}</i>` : '<i></i>';
        if (sl.dataset.h !== h) { sl.dataset.h = h; sl.innerHTML = h; }
        $('[data-live="inline"]', body).textContent = G.walk.length;
        $('[data-live="owait"]', body).textContent = Object.values(G.orders).filter((o) => o.st === 'open').length;
      }
      for (const p of [{ id: 'you', o: G.you, t: S.youTime(G) }, ...G.cooks.map((c) => ({ id: c.id, o: c, t: S.cookTime(c) }))]) {
        const u = $(`[data-live="pb-${p.id}"]`, body); if (!u) continue;
        const f = p.o.held != null ? 1 : p.o.left > 0 ? 1 - p.o.left / p.t : 0;
        u.style.width = `${(f * 100).toFixed(1)}%`; u.classList.toggle('held', p.o.held != null);
        const m = $(`[data-live="made-${p.id}"]`, body); if (m) m.textContent = p.o.made;
      }
    }
    if (tab === 'couriers') {
      const cg = $('[data-live="cgoal"]', body);
      if (cg) { const c = S.courierHireCost(G); cg.style.width = `${Math.min(100, G.cash / c * 100).toFixed(1)}%`; $('[data-live="cgoalt"]', body).textContent = G.cash >= c ? 'Ready!' : `${M(G.cash)} of ${M(c)}`; }
      const ow = $('[data-live="ow"]', body);
      if (ow) {
        ow.textContent = Object.values(G.orders).filter((o) => o.st !== 'bike').length;
        $('[data-live="ontheway"]', body).textContent = Object.values(G.orders).filter((o) => o.st === 'bike').length;
        $('[data-live="cap"]', body).textContent = perMin(S.deliveryRate(G, game.W));
      }
      for (const c of G.couriers) {
        const el = $(`[data-live="st-${c.id}"]`, body); if (!el) continue;
        const stalled = c.leg && c.leg.t < -S.PICKUP - 0.01 && c.st === 'drop' && c.load.length && c.leg.a === game.W.door;
        el.textContent = stalled ? 'kick-starting the engine…' : c.st === 'drop' ? `delivering ${c.load.length}` : STATUS[c.st];
      }
    }
    if (tab === 'diner') {
      const fb = $('[data-live="fame"]', body);
      if (fb) { fb.style.width = `${next ? Math.min(100, (G.served - prev) / (next - prev) * 100).toFixed(1) : 100}%`; $('[data-live="famet"]', body).textContent = next ? `${G.served} of ${next} sold for Fame ${L + 1}` : 'Famous!'; }
      for (const k of ['walkins', 'lostWalk', 'deliveries', 'lostOrders']) { const el = $(`[data-live="${k}"]`, body); if (el) el.textContent = G.stats[k]; }
      const tp = $('[data-live="tips"]', body); if (tp) tp.textContent = M(G.stats.tips);
      const ym = $('[data-live="youmade"]', body); if (ym) ym.textContent = G.you.made;
      const e = $('[data-live="earned"]', body); if (e) e.textContent = M(G.stats.earned);
    }
  }

  // ---------- the SMASH button (pointerdown: no click delay; space bar on a keyboard) ----------
  fab.addEventListener('pointerdown', (e) => { e.preventDefault(); game.smash(); });
  addEventListener('keydown', (e) => { if (e.code === 'Space' && !e.repeat && !modals.children.length && !(e.target instanceof HTMLInputElement)) { e.preventDefault(); game.smash(); } });
  function smashed() { fab.classList.remove('hit', 'first'); void fab.offsetWidth; fab.classList.add('hit'); live(); }
  function nudge() { fab.classList.remove('no'); void fab.offsetWidth; fab.classList.add('no'); }
  function made(by) {
    if (by !== 'you') return;
    const f = document.createElement('i'); f.className = 'sm-pop'; f.innerHTML = `+1${ICON('food-burger')}`;
    fab.append(f); setTimeout(() => f.remove(), 800);
  }
  function fameUp(level) {
    toast(`${ICON('ui-star')} Fame ${level}! Word gets around: more customers`, 'good');
    const fb = $('.famebar', hub); fb.classList.remove('up'); void fb.offsetWidth; fb.classList.add('up');
    if (tab === 'diner' && !isClosed()) render();
  }

  // ---------- actions ----------
  root.addEventListener('click', (e) => {
    const el = e.target.closest('[data-act]'); if (!el || el.disabled) return;
    const a = el.dataset.act;
    if (a === 'tab') { sfx('ui-tap'); if (el.closest('.tabs') && el.dataset.tab === tab && !isClosed()) closeSheet(); else setTab(el.dataset.tab); return; }
    if (a === 'grab') { const s = sheet.dataset.state; sheet.dataset.state = s === 'mid' ? 'big' : 'mid'; return; }
    if (a === 'settings') { settings(); return; }
    if (a === 'neck') { sfx('ui-tap'); neckGo?.(); return; }
    if (a === 'story') { story(); return; }
    game.act(a, el.dataset.id, el.dataset.sk, el);
  });

  // ---------- story ----------
  function story(i = 0) {
    const p = STORY[i], last = i === STORY.length - 1;
    const m = modal(`<div class="storyimg"><img src="${ART(p.img)}" alt=""></div>
      <div class="ribwrap"><span class="ribbon">${p.title}</span></div>
      <p class="storyp">${p.text}</p>
      <div class="dots">${STORY.map((_, j) => `<i class="${j === i ? 'on' : ''}"></i>`).join('')}</div>
      <button class="btn ${last ? 'green' : 'blue'} big" data-x="next">${last ? 'Fire up the grill!' : 'Next'}</button>`, { cls: 'pop story', pause: true });
    m.card.querySelector('[data-x]').onclick = () => {
      sfx('ui-tap');
      m.close();
      if (!last) story(i + 1);
      else if (!G.seen.intro) { G.seen.intro = true; game.save(); fab.classList.add('first'); }
    };
  }
  function scooterBeat() {
    G.seen.scooter = true; game.save();
    const m = modal(`<div class="storyimg"><img src="${ART('scooter')}" alt=""></div>
      <div class="ribwrap"><span class="ribbon">The scooter</span></div>
      <p class="storyp">You have ${M(S.courierHireCost(G))}. That's enough to hire someone to ride Uncle Ferdi's old scooter. Then the diner can take <b>delivery orders</b> from the whole neighbourhood.</p>
      <button class="btn green big" data-x="go">Find a courier</button><button class="btn ghost" data-x="later">Later</button>`, { cls: 'pop story', pause: true });
    sfx('ui-unlock');
    m.card.addEventListener('click', (e) => { const x = e.target.closest('[data-x]')?.dataset.x; if (!x) return; m.close(); if (x === 'go') setTab('couriers'); });
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
      if (x === 'reset') { m.close(); const c = modal(`<h2>Erase the save?</h2><p>The diner, the staff and the money go. Uncle Ferdi's letter arrives again. This can't be undone.</p><button class="btn red big" data-x="y">Erase</button><button class="btn ghost" data-x="n">Cancel</button>`, { cls: 'pop', dismiss: true });
        c.card.addEventListener('click', (ev) => { const y = ev.target.closest('[data-x]')?.dataset.x; if (y === 'y') game.reset(); if (y) c.close(); }); }
    });
  }

  Object.assign(api, { render, live, toast, modal, setTab, closeSheet, story, smashed, nudge, made, fameUp });
  Object.defineProperties(api, { tab: { get: () => tab }, open: { get: () => !isClosed() } }); // (live getters: Object.assign would copy values)
  return api;
}

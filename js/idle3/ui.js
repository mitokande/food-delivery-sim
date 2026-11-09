// Uncle's Diner (idle3.html): the interface. Top bar, the fame bar, the "what's holding you back" banner, the COOK
// button in the middle of the tab bar, the bottom sheet (Restaurant, Kitchen, Menu, Couriers) and the story cards.
// Numbers that change every frame are patched by live(); render() rebuilds a tab.
import * as S from './sim.js';

export const ICON = (n, cls = '') => `<img class="ic ${cls}" src="assets/icons/${n}.webp" alt="" draggable="false" onerror="this.onerror=null;this.src='assets/icons/${n}.png'">`;
const VICON = (id) => `<img class="ic veh" src="assets/icons/veh-${id}.png" alt="" draggable="false">`; // (vehicle icons are png only)
const ART = (n) => `assets/story/${n}.webp`;
const STAGE_ART = (i) => ART(i === 0 ? 'diner' : `stage${i + 1}`);
const DICON = (id) => ICON(S.DISH[id].icon);
const $ = (sel, root = document) => root.querySelector(sel);
const M = S.money;
const perMin = (n) => `${(Math.round(n * 10) / 10).toString()}/min`;
const sec = (s) => `${s < 10 ? s.toFixed(1) : Math.round(s)} s`;
const GEAR = '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M19.4 13a7.6 7.6 0 0 0 0-2l2.1-1.6-2-3.5-2.5 1a7.4 7.4 0 0 0-1.7-1L15 3.3h-4l-.4 2.6a7.4 7.4 0 0 0-1.7 1l-2.5-1-2 3.5L6.6 11a7.6 7.6 0 0 0 0 2l-2.1 1.6 2 3.5 2.5-1c.5.4 1.1.7 1.7 1l.4 2.6h4l.4-2.6c.6-.3 1.2-.6 1.7-1l2.5 1 2-3.5zM13 15.5A3.5 3.5 0 1 1 13 8.5a3.5 3.5 0 0 1 0 7z" transform="translate(-1 0)"/></svg>';
const YOU_CHAR = 'male-c';
const STATUS = { idle: 'at the restaurant', wait: 'waiting for a bag', drop: 'delivering', home: 'riding back' };
const MOTOR_NOTE = {
  zippy: 'Second-hand, honest, starts every time.',
  vespetta: 'The classic. Two orders a trip.',
  volt: 'Silent and quick. Two orders a trip.',
  viper: 'Stupidly fast.',
};
// what each expansion says when it's done
const STAGE_TEXT = [
  '',
  'Fresh paint, new glass, a proper sign. Ferdi\'s Diner is open for real, and people notice.',
  'Tables outside under the parasols. People stop just to look, and then they sit down.',
  'You took over the shop next door. Twice the room, twice the kitchen, a second floor full of tables.',
  'Three floors, a rooftop terrace and a line around the block. Uncle Ferdi would be proud.',
];

// the story: shown on the first visit (and from the Restaurant tab)
const STORY = [
  { img: 'letter', title: 'A letter', text: 'Your great-uncle Ferdi, whom you met exactly once at a wedding, has passed away. To everyone\'s surprise, he left everything he owned <b>to you</b>.' },
  { img: 'diner', title: 'Everything', text: 'Everything turns out to be one tired little diner in Old Town. The awning is torn, a window is boarded up, and the sign lost its letters years ago.' },
  { img: 'scooter', title: '…and a scooter', text: 'In the back alley stands his old delivery scooter. Rust, tape, and a black puff of smoke. It starts on the third kick. Usually.' },
  { img: 'smash', title: 'The menu', text: 'You are no chef. In your student years you learned exactly one thing: <b>the smash burger</b>. So that\'s the menu, for now.<br>Tap <b>COOK</b> to cook each order. Every cook you hire brings a dish of their own.' },
];

export function createDinerUI(game) {
  let G = game.G;
  const root = document.getElementById('ui');
  root.innerHTML = `
  <div id="hubui" class="idle diner">
    <header class="topbar">
      <button class="who" data-act="tab" data-tab="restaurant"><span class="ava">${ICON('char-' + YOU_CHAR)}</span>
        <span class="lvlbox"><small class="nm">Ferdi's Diner</small><span class="ipsbar"><b class="ips">$0/min</b></span></span></button>
      <span class="res cash">${ICON('ui-cash')}<b class="cashv">$0</b></span>
      <button class="gear" data-act="settings" aria-label="Settings">${GEAR}</button>
    </header>
    <div class="hud2">
      <button class="famebar" data-act="tab" data-tab="restaurant" aria-label="Fame">
        <span class="fm-lv">${ICON('ui-star')}<b class="famen">1</b></span>
        <span class="fm-track"><u class="fm-fill"></u></span>
        <span class="fm-text"><b class="soldn">0</b> sold</span>
      </button>
      <button class="neckb" data-act="neck"><span class="nt"></span></button>
    </div>
    <section id="sheet" class="sheet" data-state="closed"><div class="sheet-rib ribwrap" data-act="grab"><span class="ribbon"></span></div><div class="grab" data-act="grab"><i></i></div><div class="sheet-body"></div></section>
    <nav class="tabs">
      <button data-act="tab" data-tab="restaurant">${ICON('ui-building')}<span>Restaurant</span><i class="dot" hidden></i></button>
      <button data-act="tab" data-tab="kitchen">${ICON('ui-people')}<span>Kitchen</span><i class="dot" hidden></i></button>
      <button class="smash ready" type="button" aria-label="Cook the next order"><span class="sm-ring"></span><span class="sm-face"><img src="${ART('cook-btn')}" alt="" draggable="false"></span><b class="sm-n">0</b><i class="sm-dish"></i><em>COOK</em></button>
      <button data-act="tab" data-tab="menu">${ICON('food-burger')}<span>Menu</span><i class="dot" hidden></i></button>
      <button data-act="tab" data-tab="couriers">${VICON('rustbucket')}<span>Couriers</span><i class="dot" hidden></i></button>
    </nav>
  </div>
  <div id="modals"></div>
  <div id="toasts"></div>`;
  const hub = $('#hubui'), sheet = $('#sheet'), body = $('.sheet-body'), modals = $('#modals'), toasts = $('#toasts'), fab = $('.smash', hub);
  let tab = 'kitchen';
  const api = {};
  const sfx = (n, o) => game.audio?.play(n, o);
  const seenDish = new Set(G.menu); // (the Menu tab's dot: a new dish nobody has looked at yet)

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
    if (t === 'menu') for (const d of G.menu) seenDish.add(d);
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
    const fn = { restaurant: renderRestaurant, kitchen: renderKitchen, menu: renderMenu, couriers: renderCouriers }[tab];
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
  const noRoom = (what) => `<div class="row noroom">${ICON('ui-lock')}<span class="rt"><b>No room for another ${what}</b><small>${S.nextStage(G) ? `${S.nextStage(G).name} has room for ${what === 'cook' ? S.nextStage(G).cooks : S.nextStage(G).couriers}` : 'This is as big as it gets for now'}</small></span>
    ${S.nextStage(G) ? '<button class="btn gold sm" data-act="tab" data-tab="restaurant">Expand</button>' : ''}</div>`;

  // ---------- Restaurant ----------
  function renderRestaurant() {
    const st = S.stageOf(G), nx = S.nextStage(G), L = S.fameLevel(G);
    const chip = (ic, v, label) => `<span>${ICON(ic)}<b>${v}</b><small>${label}</small></span>`;
    return `<div class="sec-head"><h2>${st.name}</h2><span class="sub">stage ${G.stage + 1} of ${S.STAGES.length}</span></div>
      <div class="hero"><img src="${STAGE_ART(G.stage)}" alt="${st.name}"></div>
      <div class="fsum four">${chip('ui-people', st.seats, 'tables')}${chip('ui-star', `${G.cooks.length}/${st.cooks}`, 'cooks')}${chip('ui-route', `${G.couriers.length}/${st.couriers}`, 'couriers')}${chip('ui-heart', `×${st.appeal}`, 'appeal')}</div>
      ${nx ? `<div class="nextst">
          <div class="nxtop"><img src="${STAGE_ART(G.stage + 1)}" alt="">
          <span class="rt"><small>Next</small><b>${nx.name}</b>
            <small class="gains">+${nx.seats - st.seats} tables · room for ${nx.cooks - st.cooks} more cook${nx.cooks - st.cooks > 1 ? 's' : ''} and ${nx.couriers - st.couriers} courier${nx.couriers - st.couriers > 1 ? 's' : ''} · draws ×${(nx.appeal / st.appeal).toFixed(2)} customers</small>
            ${L < nx.fame ? `<small class="needs">${ICON('ui-lock')} Needs Fame ${nx.fame} (now ${L})</small>` : ''}</span></div>
          <button class="btn gold big" data-act="expand" data-cost="${nx.cost}" ${L < nx.fame ? 'disabled data-locked="1"' : ''}>${L < nx.fame ? `Fame ${nx.fame} needed` : 'Expand'} · ${M(nx.cost)}</button>
        </div>` : '<div class="hint">The grandest restaurant in Old Town. More is coming in the next phase.</div>'}
      <div class="famebig">${ICON('ui-star')}<span><b>Fame ${L}</b><small>Customers ×${S.fameMult(G).toFixed(2)} from fame · ×${S.varietyMult(G).toFixed(2)} from ${G.menu.length} dish${G.menu.length > 1 ? 'es' : ''} · ${perMin(S.walkRate(G))} walk in</small>
        <span class="pbar"><u data-live="fame"></u><em data-live="famet"></em></span></span></div>
      <div class="rlines">
        <div class="rl"><span>${ICON('ui-people')} Tables served</span><b data-live="tables"></b></div>
        <div class="rl"><span>Walked out (no table, or too slow)</span><b data-live="lostWalk"></b></div>
        <div class="rl"><span>${ICON('ui-package')} Deliveries</span><b data-live="deliveries"></b></div>
        <div class="rl"><span>Cancelled orders</span><b data-live="lostOrders"></b></div>
        <div class="rl"><span>${ICON('ui-heart')} Tips</span><b data-live="tips"></b></div>
        <div class="rl"><span>${ICON('ui-cash')} Earned</span><b data-live="earned"></b></div>
      </div>
      <button class="btn ghost" data-act="story">${ICON('ui-gift')}Read Uncle Ferdi's letter again</button>
      <div class="hint">Prototype, phase 1. <a class="link" href="idle2.html">Hot Chain</a> · <a class="link" href="idle.html">The first idle prototype</a> · <a class="link" href="index.html">The courier game</a></div>`;
  }

  // ---------- Kitchen ----------
  function personCard(p, role) {
    const id = role === 'you' ? 'you' : p.id, sk = S.speedK(p.speed);
    const base = role === 'you' ? S.YOU_K : 1, t = S.avgTime(G) * base * sk;
    const brought = role === 'cook' && p.dish ? `<span class="brought">${DICON(p.dish)}${S.DISH[p.dish].name}</span>` : '';
    return `<div class="pcard ${role}" data-id="${id}">
      <div class="phead"><span class="pava">${ICON('char-' + (role === 'you' ? YOU_CHAR : p.char))}</span>
        <span class="kt"><b>${role === 'you' ? 'You' : p.name}${brought}</b><small>${role === 'you' ? 'One order per tap of COOK' : 'Cooks the next order on their own'} · about ${sec(t)} a dish · price ×${S.qualMult(p.quality).toFixed(2)}</small></span>
        <span class="made"><b data-live="made-${id}">${p.made}</b><small>cooked</small></span></div>
      <span class="pbar job"><u data-live="pb-${id}"></u><em data-live="pj-${id}"></em></span>
      <div class="kbtns two">
        ${skillBtn(p, id, 'speed', 'Speed', sec(t), sec(t * S.SPEED_K), 'blue')}
        ${skillBtn(p, id, 'quality', 'Quality', `×${S.qualMult(p.quality).toFixed(2)}`, `×${S.qualMult(p.quality + 1).toFixed(2)}`, 'gold')}
      </div>
    </div>`;
  }
  function renderKitchen() {
    const cost = S.cookHireCost(G), dish = S.nextDish(G);
    const hire = cost == null ? '<div class="hint">Every cook in town works here now.</div>'
      : !S.roomFor(G, 'cook') ? noRoom('cook')
      : `<div class="row hire">${dish ? DICON(dish.id) : ICON('ui-people')}<span class="rt"><b>Hire a cook</b><small>${dish ? `Brings <b>${dish.name}</b> to the menu ($${dish.price}): more dishes bring more customers` : 'Another pair of hands'}</small></span>
          <button class="btn green sm buy" data-act="cook" data-cost="${cost}"><span>Hire</span><small>${M(cost)}</small></button></div>`;
    return `<div class="sec-head"><h2>Kitchen</h2><span class="sub">${G.cooks.length} cook${G.cooks.length === 1 ? '' : 's'} and you</span></div>
      <div class="board">
        <div class="brow"><b class="blabel">${ICON('ui-clock')}On the stove</b><small class="bnote">Tables <b data-live="seated">0</b> · at the door <b data-live="atdoor">0</b></small></div>
        <div class="stove" data-live="stove"></div>
        <div class="brow"><b class="blabel">${ICON('ui-package')}Orders waiting <i class="qn" data-live="qn">0</i></b><small class="bnote">cooked oldest first →</small></div>
        <div class="tickets" data-live="tickets"></div>
        <div class="legend"><span><i class="k">${ICON('ui-people')}</i>at a table</span><span><i class="k dv">${VICON('rustbucket')}</i>delivery</span><span><i class="sw"></i>waits for a free courier</span></div>
      </div>
      <div class="rows pcards">
        ${hire}
        ${personCard(G.you, 'you')}
        ${G.cooks.map((c) => personCard(c, 'cook')).join('')}
      </div>
      <div class="hint">A table pays when its food arrives. Delivery orders are cooked only as fast as the couriers can take them, so the food never waits on the counter.</div>`;
  }

  // ---------- Menu ----------
  function renderMenu() {
    const next = S.nextDish(G);
    return `<div class="sec-head"><h2>Menu</h2><span class="sub">${G.menu.length} of ${S.DISHES.length} dishes</span></div>
      <div class="variety">${ICON('ui-people')}<span>${G.menu.length} dish${G.menu.length > 1 ? 'es' : ''} bring <b>×${S.varietyMult(G).toFixed(2)}</b> customers. Each new one: +${Math.round(S.VARIETY * 100)}%.</span></div>
      <div class="dishes">${S.DISHES.map((d) => {
        const on = G.menu.includes(d.id), isNext = next && next.id === d.id;
        return `<div class="dish ${on ? 'on' : 'off'} ${isNext ? 'next' : ''}">${ICON(d.icon)}<b>${d.name}</b>
          ${on ? `<small>${M(d.price)} · ${sec(d.time)}</small><em>${G.sold[d.id] || 0} sold</em>` : `<small>${M(d.price)}</small><em>${isNext ? 'the next cook brings it' : 'a later cook'}</em>`}</div>`;
      }).join('')}</div>
      <div class="hint">Customers pick from the menu at random. Pricier dishes take longer to cook.</div>`;
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
          <p>Uncle Ferdi's scooter is still in the back alley. Hire someone to ride it and the phone starts ringing: <b>delivery orders</b> from doors up to ${S.DELIV.radius} m away, from the whole menu, plus a delivery fee and tips.</p></div>`;
    }
    const hire = cost == null ? '' : !S.roomFor(G, 'courier') ? noRoom('courier')
      : `<div class="row hire">${VICON('rustbucket')}<span class="rt"><b>Hire a courier</b><small>Comes with a beat-up scooter of their own</small></span>
          <button class="btn green sm buy" data-act="courier" data-cost="${cost}"><span>Hire</span><small>${M(cost)}</small></button></div>`;
    return `<div class="sec-head"><h2>Couriers</h2><span class="sub">${G.couriers.length} on the road</span></div>
      <div class="fsum"><span>${ICON('ui-package')}<b data-live="ow">0</b><small>orders waiting</small></span><span>${ICON('ui-route')}<b data-live="ontheway">0</b><small>on the way</small></span><span>${ICON('ui-speed')}<b data-live="cap"></b><small>can carry</small></span></div>
      <div class="rows pcards">
        ${G.couriers.map(courierCard).join('')}
        ${hire}
      </div>
      <div class="hint">Orders come from doors within ${S.DELIV.radius} m: farther ones pay more. Quick deliveries get the full tip.</div>`;
  }

  // ---------- the banner: what to do next ----------
  function guide() {
    const d = S.diagnose(G), nx = S.nextStage(G);
    const cook = S.cookHireCost(G), cour = S.courierHireCost(G), nd = S.nextDish(G);
    const canEx = nx && S.canExpand(G) && G.cash >= nx.cost;
    if (!G.cooks.length && G.stats.tables < 3) return { k: 'start', cls: 'ok', html: `${ICON('ui-people')}<span>Customers are at the tables: tap <b>COOK</b> to cook their orders</span>` };
    if (!G.cooks.length && G.cash >= cook) return { k: 'cook', cls: 'go', html: `${DICON(nd.id)}<span>Hire a cook: they bring <b>${nd.name}</b> to the menu</span>`, go: () => setTab('kitchen') };
    if (!G.couriers.length && G.cash >= cour) return { k: 'courier', cls: 'go', html: `${VICON('rustbucket')}<span>Uncle's scooter is waiting: hire a courier for deliveries</span>`, go: () => setTab('couriers') };
    if (canEx) return { k: 'expand', cls: 'go', html: `${ICON('ui-building')}<span>You can expand: <b>${nx.name}</b></span>`, go: () => setTab('restaurant') };
    if (cook != null && nd && S.roomFor(G, 'cook') && G.cash >= cook) return { k: 'cook', cls: 'go', html: `${DICON(nd.id)}<span>Hire a cook: <b>${nd.name}</b> joins the menu</span>`, go: () => setTab('kitchen') };
    if (d.kind === 'kitchen') return { k: 'kitchen', cls: 'bad', html: `${ICON('ui-clock')}<span>Tables wait for their food: ${S.roomFor(G, 'cook') ? 'cook, hire or train cooks' : 'cook, train cooks, or expand for more'}</span>`, go: () => setTab(S.roomFor(G, 'cook') || !nx ? 'kitchen' : 'restaurant') };
    if (d.kind === 'seats') return { k: 'seats', cls: 'bad', html: `${ICON('ui-people')}<span>No free tables: customers walk away. ${nx ? 'Expand the restaurant' : 'Cook faster'}</span>`, go: () => setTab(nx ? 'restaurant' : 'kitchen') };
    if (d.kind === 'bags') return { k: 'bags', cls: 'bad', html: `${ICON('ui-package')}<span>Delivery orders wait: ${S.roomFor(G, 'courier') ? 'another courier or a faster motor' : 'faster motors, or expand for more couriers'}</span>`, go: () => setTab('couriers') };
    if (d.kind === 'quiet') return { k: 'quiet', cls: 'warn', html: `${ICON('ui-star')}<span>Cooks stand around: new dishes, fame and a bigger place bring customers</span>`, go: () => setTab('menu') };
    return { k: 'ok', cls: 'ok', html: `${ICON('ui-star')}<span>Business is smooth</span>` };
  }

  // ---------- live numbers ----------
  const earn = []; // [t, earned] samples for $/min
  let neckKey = '', neckGo = null;
  function setBtn(btn, cost) { const ok = G.cash + 1e-9 >= cost && !btn.dataset.locked; if (btn.disabled === ok) btn.disabled = !ok; }
  function live() {
    $('.cashv', hub).textContent = M(G.cash);
    earn.push([G.t, G.stats.earned]); while (earn.length > 2 && G.t - earn[0][0] > 30) earn.shift();
    const span = G.t - earn[0][0];
    $('.ips', hub).textContent = `${M(span > 2 ? (G.stats.earned - earn[0][1]) / span * 60 : 0)}/min`;
    const nm = $('.nm', hub), sn = S.stageOf(G).name; if (nm.textContent !== sn) nm.textContent = sn;
    // fame
    const L = S.fameLevel(G), next = S.fameNext(G), prev = S.FAME[L - 1] || 0;
    $('.famen', hub).textContent = L;
    $('.fm-fill', hub).style.width = `${next ? Math.min(100, (G.served - prev) / (next - prev) * 100).toFixed(1) : 100}%`;
    $('.soldn', hub).textContent = next ? `${G.served}/${next}` : G.served;
    // the COOK button
    const r = S.canCook(G), j = G.you.job;
    const cls = r === 'ok' ? 'ready' : r === 'busy' ? 'busy' : 'full';
    if (!fab.classList.contains(cls)) { fab.classList.remove('ready', 'busy', 'full'); fab.classList.add(cls); }
    fab.style.setProperty('--p', (j ? 1 - j.left / j.total : 0).toFixed(3));
    const n = String(G.tickets.length), nb = $('.sm-n', fab); if (nb.textContent !== n) nb.textContent = n;
    nb.hidden = !G.tickets.length;
    const dish = j ? j.dish : S.peekTicket(G)?.dish || '', sd = $('.sm-dish', fab);
    if (sd.dataset.d !== dish) { sd.dataset.d = dish; sd.innerHTML = dish ? DICON(dish) : ''; }
    // the banner
    const g = guide();
    if (g.k !== neckKey) { neckKey = g.k; const nb2 = $('.neckb', hub); nb2.className = 'neckb ' + g.cls; nb2.innerHTML = g.html; neckGo = g.go || null; }
    // tab dots
    $('.tabs [data-tab="restaurant"] .dot', hub).hidden = !(g.k === 'expand' || g.k === 'seats');
    $('.tabs [data-tab="kitchen"] .dot', hub).hidden = !(g.k === 'cook' || g.k === 'kitchen');
    $('.tabs [data-tab="menu"] .dot', hub).hidden = !G.menu.some((d) => !seenDish.has(d));
    $('.tabs [data-tab="couriers"] .dot', hub).hidden = !(g.k === 'courier' || g.k === 'bags');
    // story beat: the scooter, the first time a courier is affordable (after the first cook)
    if (!G.seen.scooter && !G.couriers.length && G.cooks.length && G.cash >= S.courierHireCost(G) && !modals.children.length) scooterBeat();
    if (isClosed()) return;
    for (const btn of body.querySelectorAll('[data-cost]')) setBtn(btn, +btn.dataset.cost);
    if (tab === 'kitchen') {
      const tk = $('[data-live="tickets"]', body);
      if (tk) {
        // on the stove: who cooks what (the bars move every frame; the chips change only when someone starts or stops)
        const st = $('[data-live="stove"]', body), people = [{ id: 'you', p: G.you, ch: YOU_CHAR, nm: 'You' }, ...G.cooks.map((c) => ({ id: c.id, p: c, ch: c.char, nm: c.name }))];
        const key = people.map((x) => `${x.id}:${x.p.job ? x.p.job.dish + x.p.job.kind : '-'}`).join('|');
        if (st.dataset.k !== key) {
          st.dataset.k = key;
          st.innerHTML = people.map((x) => { const jb = x.p.job; return `<span class="pot ${jb ? 'on' : 'off'}"><span class="pa">${ICON('char-' + x.ch)}</span>${jb
            ? `${DICON(jb.dish)}<i class="k ${jb.kind === 'deliv' ? 'dv' : ''}">${jb.kind === 'deliv' ? VICON('rustbucket') : ICON('ui-people')}</i>` : `<small>${x.id === 'you' ? 'tap COOK' : 'free'}</small>`}<u></u></span>`; }).join('');
        }
        st.querySelectorAll('.pot > u').forEach((u, i) => { const jb = people[i]?.p.job; u.style.width = `${jb ? ((1 - jb.left / jb.total) * 100).toFixed(1) : 0}%`; });
        // waiting: oldest first; the next one up is marked, held deliveries are dimmed
        const q = S.queueView(G), nextId = q.find((t) => !t.held)?.id;
        let h = q.slice(0, 12).map((t) => `<i class="t ${t.kind} ${t.held ? 'held' : ''} ${t.id === nextId ? 'next' : ''}">${DICON(t.dish)}<i class="k">${t.kind === 'deliv' ? VICON('rustbucket') : ICON('ui-people')}</i></i>`).join('');
        if (q.length > 12) h += `<i class="more">+${q.length - 12}</i>`;
        if (!h) h = '<small class="none">No orders right now</small>';
        if (tk.dataset.h !== h) { tk.dataset.h = h; tk.innerHTML = h; }
        $('[data-live="qn"]', body).textContent = q.length;
        $('.legend', body).hidden = !q.length;
        $('[data-live="seated"]', body).textContent = `${G.tables.length}/${S.stageOf(G).seats}`;
        $('[data-live="atdoor"]', body).textContent = G.door.length;
      }
      for (const p of [{ id: 'you', o: G.you }, ...G.cooks.map((c) => ({ id: c.id, o: c }))]) {
        const u = $(`[data-live="pb-${p.id}"]`, body); if (!u) continue;
        const jb = p.o.job;
        u.style.width = `${(jb ? (1 - jb.left / jb.total) * 100 : 0).toFixed(1)}%`;
        const e = $(`[data-live="pj-${p.id}"]`, body), txt = jb ? `${S.DISH[jb.dish].name}${jb.kind === 'deliv' ? ' (delivery)' : ''}` : p.id === 'you' ? 'Tap COOK' : 'waiting for an order';
        if (e.textContent !== txt) e.textContent = txt;
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
        const stalled = c.leg && c.leg.t < -S.PICKUP - 0.01 && c.st === 'drop' && c.leg.a === game.W.door;
        el.textContent = stalled ? 'kick-starting the engine…' : c.st === 'drop' ? `delivering ${c.load.length}` : STATUS[c.st];
      }
    }
    if (tab === 'restaurant') {
      const fb = $('[data-live="fame"]', body);
      if (fb) { fb.style.width = `${next ? Math.min(100, (G.served - prev) / (next - prev) * 100).toFixed(1) : 100}%`; $('[data-live="famet"]', body).textContent = next ? `${G.served} of ${next} sold for Fame ${L + 1}` : 'Famous!'; }
      for (const k of ['tables', 'lostWalk', 'deliveries', 'lostOrders']) { const el = $(`[data-live="${k}"]`, body); if (el) el.textContent = G.stats[k]; }
      const tp = $('[data-live="tips"]', body); if (tp) tp.textContent = M(G.stats.tips);
      const e = $('[data-live="earned"]', body); if (e) e.textContent = M(G.stats.earned);
    }
  }

  // ---------- the COOK button (pointerdown: no click delay; space bar on a keyboard) ----------
  fab.addEventListener('pointerdown', (e) => { e.preventDefault(); game.cook(); });
  addEventListener('keydown', (e) => { if (e.code === 'Space' && !e.repeat && !modals.children.length && !(e.target instanceof HTMLInputElement)) { e.preventDefault(); game.cook(); } });
  function tapped() { fab.classList.remove('hit', 'first'); void fab.offsetWidth; fab.classList.add('hit'); live(); }
  function nudge() { fab.classList.remove('no'); void fab.offsetWidth; fab.classList.add('no'); }
  function cooked(dish) {
    const f = document.createElement('i'); f.className = 'sm-pop'; f.innerHTML = `+1${DICON(dish)}`;
    fab.append(f); setTimeout(() => f.remove(), 800);
  }
  function fameUp(level) {
    toast(`${ICON('ui-star')} Fame ${level}! Word gets around: more customers`, 'good');
    const fb = $('.famebar', hub); fb.classList.remove('up'); void fb.offsetWidth; fb.classList.add('up');
    if (tab === 'restaurant' && !isClosed()) render();
  }
  function newDish() { if (tab === 'menu' && !isClosed()) for (const d of G.menu) seenDish.add(d); }
  function stageUp(i) {
    const st = S.STAGES[i];
    const m = modal(`<div class="storyimg"><img src="${STAGE_ART(i)}" alt=""></div>
      <div class="ribwrap"><span class="ribbon">${st.name}</span></div>
      <p class="storyp">${STAGE_TEXT[i]}</p>
      <div class="rlines"><div class="rl"><span>${ICON('ui-people')} Tables</span><b>${st.seats}</b></div><div class="rl"><span>${ICON('ui-star')} Room for cooks</span><b>${st.cooks}</b></div><div class="rl"><span>${ICON('ui-route')} Room for couriers</span><b>${st.couriers}</b></div></div>
      <button class="btn green big" data-x="ok">Open the doors!</button>`, { cls: 'pop story', pause: true });
    m.card.querySelector('[data-x]').onclick = () => { sfx('ui-tap'); m.close(); };
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
      <button class="btn ${last ? 'green' : 'blue'} big" data-x="next">${last ? 'Open the doors!' : 'Next'}</button>`, { cls: 'pop story', pause: true });
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
      <p class="storyp">You have ${M(S.courierHireCost(G))}. That's enough to hire someone to ride Uncle Ferdi's old scooter. Then the restaurant can take <b>delivery orders</b> from the whole neighbourhood.</p>
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
      if (x === 'reset') { m.close(); const c = modal(`<h2>Erase the save?</h2><p>The restaurant, the staff and the money go. Uncle Ferdi's letter arrives again. This can't be undone.</p><button class="btn red big" data-x="y">Erase</button><button class="btn ghost" data-x="n">Cancel</button>`, { cls: 'pop', dismiss: true });
        c.card.addEventListener('click', (ev) => { const y = ev.target.closest('[data-x]')?.dataset.x; if (y === 'y') game.reset(); if (y) c.close(); }); }
    });
  }

  // ---------- back after a while: what the staff did without you (S.away) ----------
  const HELD_TIP = {
    kitchen: 'Orders piled up in the kitchen. Another cook, or faster ones, earn more while you\'re gone.',
    seats: 'People waited for a table. A bigger restaurant seats more of them.',
    bags: 'Delivery orders waited for a courier. More couriers or faster motors deliver more.',
    quiet: 'The cooks often had nothing to do. More dishes, fame or a bigger restaurant bring more customers.',
  };
  const dur = (s) => {
    if (s >= 86400) { const d = Math.floor(s / 86400); return `${d} day${d > 1 ? 's' : ''}`; }
    const h = Math.floor(s / 3600), m = Math.round((s % 3600) / 60);
    return h ? `${h} h${m ? ` ${m} min` : ''}` : `${Math.max(1, m)} min`;
  };
  function away(r) {
    if (!r.cooks) { toast(`${ICON('ui-clock')} Nobody cooked while you were away. Hire a cook and the diner runs without you.`, 'warn'); return; }
    const names = G.cooks.map((c) => c.name);
    const who = names.length === 1 ? names[0] : names.length === 2 ? `${names[0]} and ${names[1]}` : `Your ${names.length} cooks`;
    const m = modal(`<div class="storyimg"><img src="${ART('away')}" alt=""></div>
      <div class="ribwrap"><span class="ribbon">While you were away</span></div>
      <p class="storyp">You were gone for <b>${dur(r.secs)}</b>. ${who} kept the kitchen going${r.couriers ? ' and the couriers kept riding' : ''}.</p>
      <div class="awaycash">${ICON('ui-cash')}<b>+${M(r.earned)}</b></div>
      <div class="rlines">
        <div class="rl"><span>${ICON('ui-people')} Tables served</span><b>${r.tables}</b></div>
        ${r.couriers ? `<div class="rl"><span>${ICON('ui-route')} Deliveries</span><b>${r.deliveries}</b></div>` : ''}
        ${r.fameTo > r.fameFrom ? `<div class="rl"><span>${ICON('ui-star')} Fame</span><b>${r.fameFrom} → ${r.fameTo}</b></div>` : ''}
      </div>
      ${r.capped ? `<p class="awaynote">${ICON('ui-clock')} The staff run the place for up to ${dur(S.AWAY.max)} without you.</p>` : ''}
      ${r.held ? `<p class="awaynote">${HELD_TIP[r.held]}</p>` : ''}
      <button class="btn green big" data-x="ok">Collect</button>`, { cls: 'pop story awaycard', pause: true });
    m.card.querySelector('[data-x]').onclick = () => {
      sfx('ui-coins', { vol: 0.7 }); m.close();
      const c = $('.res.cash', hub); c.classList.remove('bump'); void c.offsetWidth; c.classList.add('bump');
    };
    return m;
  }

  Object.assign(api, { render, live, toast, modal, setTab, closeSheet, story, tapped, nudge, cooked, fameUp, newDish, stageUp, away });
  Object.defineProperties(api, { tab: { get: () => tab }, open: { get: () => !isClosed() } }); // (live getters: Object.assign would copy values)
  return api;
}

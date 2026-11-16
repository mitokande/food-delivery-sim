// Ferdi's (idle4.html): the city and its cook-offs (the rules: duel.js). The city card: the painted map with a pin on
// every Gristle Burger (won: a Ferdi's flag and its stars; the next one bounces; a district's head office wears a
// crown), the tickets and the chef's hats over it. A pin opens the branch: who cooks there, the dish they're weak
// against, what a win pays, and who goes with which dishes. The cook-off itself plays in its own window, the game
// behind it paused: the two counters, plates flying to the jury, the two scores racing to the goal, our skills on
// buttons under the crew. ui.js makes this with its own helpers (modal, toast, the art).
import * as S from './sim.js';
import * as D from './duel.js';

// where each branch's pin stands on the map (% of its width and height), in the order of D.STAGES
const PINS = [[38, 88], [63, 80], [29, 75], [50, 69], [67, 62], [50, 55], [35, 49], [57, 45], [66, 38], [44, 33], [37, 26], [52, 21], [71, 21], [45, 14], [55, 8]];
const LABELS = [[80, 93], [20, 42], [22, 12]]; // (the districts' names)
const BOSS_SAYS = {
  dolores: 'Old Town has eaten Gristle for twenty years. It will not start chewing now.',
  baron: 'I have cooked for kings. You have cooked for... a queue.',
  victor: 'You should have sold when I asked nicely. My tower, my jury, my rules.',
};
const RIVAL_FOOD = 'burger';
const pw = (x) => Math.round(x * 10);

export function arena({ game, G, modal, toast, sfx, buzz, UI, FACE, DICON, M, MGR_FACE, STARS, crew }) {
  const DU = (n, cls = '') => UI(`duel/${n}`, cls);
  const face = (n) => `<img class="face" src="${FACE(n)}" alt="" draggable="false">`;
  const mmss = (t) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
  const stars3 = (n) => `<i class="pst">${[1, 2, 3].map((i) => UI('star', i <= n ? '' : 'off')).join('')}</i>`;
  const api = { cur: null }; // (cur: the cook-off on now: { D, skip() })

  // ---------- the city ----------
  function city(at = null) {
    const g = G();
    if (!D.open(g)) { toast(`${UI('lock')} The city: opens at restaurant level ${D.DUEL.lv}`); sfx('ui-error', { vol: 0.4 }); return null; }
    let sel = null; // (the branch open: { id, team, dishes })
    const m = modal(`<h2>${UI('map')} The city</h2>
      <div class="cbar"><button class="cres tix" data-x="refill">${DU('ticket')}<b></b><small></small></button><span class="cres hats">${UI('chef')}<b></b></span><span class="cres brs">${DU('pin-ours')}<b></b></span></div>
      <div class="cmap"><img class="bg" src="assets/ui4/duel/map.webp" alt="" draggable="false">
        ${D.DISTRICTS.map((d, i) => `<span class="dn" style="left:${LABELS[i][0]}%;top:${LABELS[i][1]}%">${d.name}</span>`).join('')}<div class="pins"></div></div>
      <div class="stage" hidden></div>`, { cls: 'citym', dismiss: true, onClose: () => clearInterval(timer) });
    const pins = m.card.querySelector('.pins'), panel = m.card.querySelector('.stage');
    const bar = () => {
      const now = Date.now(), d = D.sync(g, now), left = D.nextTix(g, now);
      m.card.querySelector('.tix b').textContent = `${d.tix}/${D.DUEL.tix}`;
      m.card.querySelector('.tix small').textContent = left ? mmss(Math.ceil(left)) : '';
      m.card.querySelector('.hats b').textContent = g.hats.toLocaleString('en-US');
      m.card.querySelector('.brs b').textContent = `${g.duel.branches}/${D.DISTRICTS.length}`;
    };
    const timer = setInterval(() => { bar(); if (sel) go(); }, 1000);
    function drawPins() {
      const next = D.nextStage(g);
      pins.innerHTML = D.STAGES.map((s) => {
        const n = D.starsOf(g, s.id), open = D.stageOpen(g, s.id);
        return `<button class="pin ${n ? 'won' : open ? 'next' : 'shut'} ${s.boss ? 'boss' : ''} ${next?.id === s.id ? 'now' : ''}" data-stage="${s.id}" style="left:${PINS[s.id][0]}%;top:${PINS[s.id][1]}%" aria-label="${s.name}">
          ${DU(n ? 'pin-ours' : s.boss ? 'pin-boss' : 'pin-rival')}${n ? stars3(n) : ''}</button>`;
      }).join('');
    }
    // the Start button and the power meter of the open branch (the tickets tick while it's open)
    function go() {
      const s = D.STAGES[sel.id], why = D.block(g, sel.id, sel.team, sel.dishes, Date.now());
      const ours = D.teamStrength(g, s, sel.team, sel.dishes), theirs = D.rivalStrength(s);
      const mt = panel.querySelector('.vmeter');
      mt.className = `vmeter ${ours >= theirs ? 'ok' : ours >= theirs * 0.8 ? 'near' : 'low'}`;
      mt.querySelector('i').style.width = `${Math.max(8, Math.min(92, ours / (ours + theirs || 1) * 100))}%`;
      mt.querySelector('.po').textContent = pw(ours); mt.querySelector('.pt').textContent = pw(theirs);
      const b = panel.querySelector('[data-x="go"]');
      b.disabled = !!why && why !== 'tix';
      b.dataset.why = why || '';
      b.className = `btn big ${why === 'tix' ? 'blue' : 'gold'}`;
      b.innerHTML = why === 'tix' ? `<span>${DU('ticket')} 5 tickets</span><small>${UI('gems')}${D.DUEL.refill} · or wait ${mmss(Math.ceil(D.nextTix(g, Date.now())))}</small>` : why === 'team' ? 'Pick your team' : why === 'dishes' ? 'Pick your dishes' : `<span>${DU('emblem')} Cook-off!</span><small>${DU('ticket')}1</small>`;
    }
    function drawStage() {
      if (!sel) { panel.hidden = true; return; }
      const s = D.STAGES[sel.id], p = D.pays(g, s), onMenu = S.menu(g), weakOn = onMenu.includes(s.weak);
      const boss = s.boss ? s.cooks.find((c) => D.RIVALS[c].skill && (c === 'victor' || !s.cooks.includes('victor'))) : null;
      const rivals = s.cooks.map((c) => {
        const r = D.rival(s, c), R = D.RIVALS[c];
        return `<span class="rv ${R.skill ? 'boss' : ''}"><span class="mi">${face(c)}</span><b>${R.name}</b><small>${DU('taste')}${Math.round(r.taste)} ${DU('calm')}${Math.round(r.calm)}</small>${R.skill ? `<em>${DU(R.skill)}${D.SKILLS[R.skill].name}</em>` : ''}</span>`;
      }).join('');
      const crewChips = Object.keys(D.HEROES).filter((r) => S.hasMgr(g, r)).map((r) => {
        const h = D.hero(g, r);
        return `<button class="cchip ${sel.team.includes(r) ? 'on' : ''}" data-crew="${r}"><span class="mi">${face(MGR_FACE[r])}</span><i class="sk">${DU(h.skill)}</i><b>${h.name}</b><small>${DU('taste')}${Math.round(h.taste)} ${DU('pace')}${h.pace}s</small></button>`;
      }).join('');
      const dishChips = onMenu.map((d) => `<button class="dchip ${sel.dishes.includes(d) ? 'on' : ''} ${d === s.weak ? 'weak' : ''}" data-dish="${d}">${DICON(d)}<b>×${(D.dishK(g, d) * (d === s.weak ? D.DUEL.weak : 1)).toFixed(1)}</b>${d === s.weak ? '<em>Weak!</em>' : ''}</button>`).join('');
      const skills = sel.team.map((r) => { const k = D.SKILLS[D.HEROES[r].skill]; return `<li>${DU(D.HEROES[r].skill)}<span><b>${S.MANAGERS[r].name}: ${k.name}</b><small>${k.what}</small></span></li>`; }).join('');
      panel.hidden = false;
      panel.innerHTML = `<div class="sthead ${s.boss ? 'boss' : ''}">${DU(s.boss ? 'pin-boss' : 'pin-rival')}<span><b>${s.name}</b><small>${D.DISTRICTS[s.district].name} · ${s.boss ? 'Gristle head office' : `Gristle Burger no. ${s.id + 1}`}</small></span><button class="btn ghost sm" data-x="back">Map</button></div>
        <div class="stbody">
        ${boss ? `<div class="rsay bad"><img src="${FACE(boss)}" alt=""><p><b>${D.RIVALS[boss].name}, ${D.RIVALS[boss].title.toLowerCase()}:</b> ${BOSS_SAYS[boss]}</p></div>` : ''}
        <div class="rvs">${rivals}</div>
        <p class="weakl ${weakOn ? '' : 'off'}">${DICON(s.weak)}<span>Weak against <b>${S.DISH[s.weak].name}</b>: it scores ×${D.DUEL.weak} here${weakOn ? '' : '. Not on your menu yet'}</span></p>
        <h3 class="sh">Your team</h3>
        ${crewChips ? `<div class="cchips">${crewChips}</div><ul class="skl">${skills}</ul>` : '<p class="small">Nobody to send yet: hire a manager in the Crew card.</p>'}
        <h3 class="sh">Your dishes</h3>
        <div class="dchips">${dishChips}</div>
        <div class="vmeter"><i></i><em><span>${UI('chef')}<u class="po"></u></span><small>power</small><span><u class="pt"></u>${DU('pin-rival')}</span></em></div>
        <div class="pays"><small>${p.first ? 'A win pays' : 'Again pays'}</small><i>${UI('cash')}${M(p.cash)}</i><i>${UI('chef')}${p.hats}</i>${p.gems ? `<i>${UI('gems')}${p.gems}</i>` : ''}${D.starsOf(g, s.id) < 3 ? `<i class="s3">${UI('star')}×3: ${UI('gems')}${D.DUEL.star3}</i>` : ''}</div>
        </div>
        <button class="btn gold big" data-x="go"></button>`;
      go();
    }
    function openStage(id) {
      const s = D.STAGES[id];
      if (!D.stageOpen(g, id)) { toast(`${UI('lock')} Beat ${D.STAGES[id - 1].name} first`); sfx('ui-error', { vol: 0.4 }); return; }
      const had = g.duel.team.filter((r) => S.hasMgr(g, r));
      sel = { id, team: had.length ? had.slice(0, D.DUEL.team) : D.bestTeam(g), dishes: D.bestDishes(g, s) };
      sfx('ui-open', { vol: 0.4 }); drawStage();
    }
    const redraw = () => { bar(); drawPins(); drawStage(); };
    m.card.addEventListener('click', async (e) => {
      const pin = e.target.closest('.pin'); if (pin) { openStage(+pin.dataset.stage); return; }
      const c = e.target.closest('[data-crew]'), d = e.target.closest('[data-dish]');
      if (c || d) { // (one more than may go: the first one picked steps out)
        const list = c ? sel.team : sel.dishes, v = c ? c.dataset.crew : d.dataset.dish, max = c ? D.DUEL.team : D.DUEL.dishes;
        if (list.includes(v)) list.splice(list.indexOf(v), 1); else { list.push(v); if (list.length > max) list.shift(); }
        sfx('ui-tap', { vol: 0.5 }); drawStage(); return;
      }
      const x = e.target.closest('[data-x]')?.dataset.x;
      if (x === 'back') { sel = null; sfx('ui-back', { vol: 0.4 }); drawStage(); }
      else if (x === 'refill') { if (D.sync(g, Date.now()).tix >= D.DUEL.tix) toast(`${DU('ticket')} A cook-off takes a ticket. One comes back every ${D.DUEL.regen / 60} minutes`); else refillAsk(redraw); }
      else if (x === 'go') {
        if (e.target.closest('[data-x]').dataset.why === 'tix') { refillAsk(redraw); return; }
        const id = sel.id; m.el.classList.add('under');
        const r = await fight(id, sel.team, sel.dishes); m.el.classList.remove('under');
        if (!r) { redraw(); return; }
        sel = null; redraw();
        const next = await result(D.STAGES[id], r);
        if (next === 'crew') { m.close(); crew(); } else if (next === 'again') openStage(id); else if (next === 'next' && D.nextStage(g)) openStage(D.nextStage(g).id);
      }
    });
    redraw();
    if (at != null) openStage(at);
    sfx('ui-open', { vol: 0.5 });
    return m;
  }
  // a full set of tickets for gems
  function refillAsk(then) {
    const g = G();
    const m = modal(`<h2>${DU('ticket')} Out of tickets</h2>
      <p class="small">A cook-off takes a ticket. One comes back every ${D.DUEL.regen / 60} minutes, up to ${D.DUEL.tix}.</p>
      <button class="btn blue big" data-x="buy" ${g.gems >= D.DUEL.refill ? '' : 'disabled'}><span>${DU('ticket')} ${D.DUEL.tix} tickets</span><small>${UI('gems')}${D.DUEL.refill}</small></button>
      <button class="btn ghost" data-x="no">Later</button>`, { cls: 'offer tixm', dismiss: true });
    m.card.addEventListener('click', (e) => {
      const x = e.target.closest('[data-x]')?.dataset.x;
      if (x === 'buy' && game.duelRefill()) { toast(`${DU('ticket')} ${D.DUEL.tix} tickets!`, 'good'); m.close(); then?.(); }
      else if (x === 'no') m.close();
    });
  }

  // ---------- a cook-off ----------
  // → what it paid (game.duelClaim), or null when it couldn't start
  function fight(id, team, dishes) {
    const X = game.duelStart(id, team, dishes);
    if (!X) return Promise.resolve(null);
    const g = G(), s = D.STAGES[id];
    const cook = (c, who, i) => `<div class="dc ${who}" data-who="${who}" data-i="${i}"><span class="mi">${face(who === 'us' ? MGR_FACE[c.id] : c.id)}<i class="pan">${DU('panic')}</i></span><span class="calm"><i></i></span><b>${c.name.split(' ').pop()}</b>${who === 'them' && c.skill ? `<span class="rsk">${DU(c.skill)}<i></i></span>` : ''}</div>`;
    const m = modal(`<h2>${DU('emblem')} ${s.name}</h2>
      <div class="darena"><img class="bg" src="assets/ui4/duel/arena.webp" alt="" draggable="false">
        <div class="dscore"><div class="dbar them"><i></i><b>0</b>${DU('pin-rival')}</div><div class="dbar us"><i></i><b>0</b>${DU('pin-ours')}</div><em>First to <u>${X.goal}</u> · <span class="dtime"></span></em></div>
        <div class="drow them">${X.them.cooks.map((c, i) => cook(c, 'them', i)).join('')}</div>
        <div class="dfxs them"></div>
        <div class="djury">${UI('cloche')}</div>
        <div class="dfxs us"></div>
        <div class="drow us">${X.us.cooks.map((c, i) => cook(c, 'us', i)).join('')}</div>
        <div class="dfly"></div><div class="dcall"></div>
      </div>
      <div class="dskills">${X.us.cooks.map((c, i) => `<button class="dsk" data-skill="${i}" aria-label="${D.SKILLS[c.skill].name}"><span class="ring"></span>${DU(c.skill)}<small>${D.SKILLS[c.skill].name}</small></button>`).join('')}
        <button class="dauto" data-x="auto"><small>Auto</small><b>OFF</b></button></div>`, { cls: 'duelm', pause: true });
    const card = m.card, ar = card.querySelector('.darena'), fly = card.querySelector('.dfly'), call = card.querySelector('.dcall');
    const cell = (who, i) => card.querySelector(`.dc[data-who="${who}"][data-i="${i}"]`);
    const centre = (el) => { const a = ar.getBoundingClientRect(), b = el.getBoundingClientRect(); return [b.left + b.width / 2 - a.left, b.top + b.height / 2 - a.top]; };
    const jury = card.querySelector('.djury');
    let lastPlate = 0, raf = 0, last = 0, left = false, done;
    const out = new Promise((r) => { done = r; });
    X.auto = !!g.duel.auto;
    const shout = (html, cls) => { const el = document.createElement('span'); el.className = `call ${cls}`; el.innerHTML = html; call.append(el); setTimeout(() => el.remove(), 1500); while (call.children.length > 2) call.firstChild.remove(); };
    function show(ev) {
      for (const e of ev) {
        const el = e.i != null ? cell(e.who, e.i) : null;
        if (e.kind === 'plate') {
          const [x0, y0] = centre(el), [x1, y1] = centre(jury), f = document.createElement('span');
          f.className = `fly ${e.who} ${e.big ? 'big' : ''}`; f.innerHTML = DICON(e.dish || RIVAL_FOOD);
          fly.append(f);
          f.animate([{ transform: `translate(${x0}px, ${y0}px) scale(.6)` }, { transform: `translate(${(x0 + x1) / 2}px, ${(y0 + y1) / 2 - 14}px) scale(1.15)`, offset: 0.55 }, { transform: `translate(${x1}px, ${y1}px) scale(.5)`, opacity: 0.2 }], { duration: 420, easing: 'ease-in' }).onfinish = () => f.remove();
          const n = document.createElement('span');
          n.className = `pt ${e.who} ${e.ignored ? 'no' : e.weak || e.big ? 'big' : ''}`; n.textContent = e.ignored ? 'no!' : `+${Math.round(e.pts)}`;
          n.style.left = `${30 + Math.random() * 40}%`;
          setTimeout(() => { card.querySelector(`.dfxs.${e.who}`).append(n); setTimeout(() => n.remove(), 800); }, 380);
          el.classList.remove('send'); void el.offsetWidth; el.classList.add('send');
          const now = performance.now();
          if (now - lastPlate > 140) { lastPlate = now; sfx(e.who === 'us' ? 'cook-take' : 'hop', { vol: e.who === 'us' ? 0.3 : 0.12, rate: e.big ? 1.3 : 1 }); }
        } else if (e.kind === 'panic') { el.classList.add('out'); sfx('qte-bad', { vol: 0.35 }); if (e.who === 'us') buzz(20); }
        else if (e.kind === 'back') el.classList.remove('out');
        else if (e.kind === 'skill') {
          const k = D.SKILLS[e.skill], c = X[e.who].cooks[e.i];
          shout(`${DU(e.skill)}<span><b>${k.name}!</b><small>${c.name}</small></span>`, e.who);
          el.classList.remove('cast'); void el.offsetWidth; el.classList.add('cast');
          sfx(e.who === 'us' ? 'boost' : 'event-pop', { vol: 0.5 }); if (e.who === 'us') buzz(15);
        }
      }
    }
    function paint() {
      for (const who of ['us', 'them']) {
        const A = X[who], b = card.querySelector(`.dbar.${who}`);
        b.querySelector('i').style.width = `${Math.min(100, A.pts / X.goal * 100)}%`; b.querySelector('b').textContent = Math.round(A.pts);
        A.cooks.forEach((c, i) => {
          const el = cell(who, i);
          el.querySelector('.calm i').style.width = `${c.calm / c.max * 100}%`;
          const r = el.querySelector('.rsk i'); if (r) r.style.height = `${c.charge * 100}%`;
        });
        ar.classList.toggle(`slow-${who}`, (who === 'us' ? X.them.fx.smoke : 0) > 0);
        ar.classList.toggle(`fast-${who}`, A.fx.express > 0);
        ar.classList.toggle(`mute-${who}`, (who === 'us' ? X.them.fx.bribe : X.us.fx.charm) > 0);
      }
      card.querySelector('.dtime').textContent = mmss(Math.max(0, Math.ceil(X.dur - X.t)));
      X.us.cooks.forEach((c, i) => {
        const b = card.querySelector(`.dsk[data-skill="${i}"]`), ok = D.ready(X, i);
        b.classList.toggle('ready', ok); b.classList.toggle('down', c.out > 0);
        b.querySelector('.ring').style.setProperty('--p', c.charge);
      });
      const a = card.querySelector('.dauto'); a.classList.toggle('on', X.auto); a.querySelector('b').textContent = X.auto ? 'ON' : 'OFF';
    }
    function end() {
      cancelAnimationFrame(raf); api.cur = null;
      paint();
      const won = X.over === 'win' && !left;
      if (!left) { ar.classList.add(won ? 'won' : 'lost'); shout(`<span><b>${won ? 'The jury loves it!' : 'The jury chose Gristle…'}</b></span>`, won ? 'us end' : 'them end'); sfx(won ? 'crowd-cheer' : 'order-late', { vol: 0.5 }); }
      setTimeout(() => { m.close(); done(game.duelClaim(X)); }, left ? 0 : 1300);
    }
    function frame(t) {
      const dt = Math.min(0.1, (t - last) / 1000); last = t;
      show(D.tick(X, dt)); paint();
      if (X.over) end(); else raf = requestAnimationFrame(frame);
    }
    card.addEventListener('click', (e) => {
      const b = e.target.closest('.dsk');
      if (b) { const ev = D.skill(X, +b.dataset.skill); if (ev) show(ev); else sfx('ui-error', { vol: 0.25 }); return; }
      if (e.target.closest('[data-x="auto"]')) { X.auto = !X.auto; g.duel.auto = X.auto; sfx('ui-tap', { vol: 0.5 }); paint(); }
    });
    const x = document.createElement('button'); x.className = 'xr'; x.type = 'button'; x.setAttribute('aria-label', 'Give up'); x.innerHTML = '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M6.4 4.9 12 10.6l5.6-5.7 1.5 1.5-5.7 5.6 5.7 5.6-1.5 1.5-5.6-5.7-5.6 5.7-1.5-1.5 5.7-5.6-5.7-5.6z"/></svg>';
    x.addEventListener('click', () => { if (X.over) return; left = true; D.forfeit(X); sfx('ui-back', { vol: 0.4 }); end(); }); card.append(x);
    // (skip: the rest of it at once, for the tests)
    api.cur = { D: X, skip: () => { while (!X.over) D.tick(X, 0.1); } };
    paint();
    shout('<span><b>Ready… cook!</b></span>', 'us end'); sfx('cook-bell', { vol: 0.5 });
    setTimeout(() => { if (!X.over) { last = performance.now(); raf = requestAnimationFrame(frame); } }, 900);
    return out;
  }

  // ---------- how it went ----------
  // → 'next' | 'again' | 'crew' | null (what the card's button asks for)
  function result(s, r) {
    const g = G();
    return new Promise((res) => {
      let html;
      if (r.won) {
        const all = !D.nextStage(g);
        html = `<h2>${DU('emblem')} ${r.stars === 3 ? 'A clean sweep!' : 'You won!'}</h2>${STARS(r.stars)}
          <p class="mpct">${s.name}</p>
          ${r.branch ? `<div class="gup brn">${DU('pin-ours')}<span><b>${r.branch.name} is yours!</b> ${all ? 'Gristle Tower closes its doors: the whole city eats at Ferdi\'s.' : 'A Ferdi\'s opens there.'} +${Math.round(S.BRANCH * 100)}% on every bill, for good.</span></div>` : ''}
          <div class="gwin">${r.cash ? `<span>${UI('cash')}<b>+${M(r.cash)}</b></span>` : ''}<span>${UI('chef')}<b>+${r.hats}</b></span>${r.gems ? `<span>${UI('gems')}<b>+${r.gems}</b></span>` : ''}</div>
          <p class="small">${r.stars < 3 ? 'Three stars: reach the goal before they get halfway.' : 'Chef\'s hats train the crew, in the Crew card.'}</p>
          <button class="btn gold big" data-x="${all ? 'close' : 'next'}">${all ? 'Back to the city' : 'Next branch'}</button><button class="btn ghost" data-x="crew">Train the crew</button>`;
      } else if (r.left) {
        html = `<h2>${DU('emblem')} You walked out</h2><p class="small">The jury gave it to Gristle. The ticket is gone.</p><button class="btn big" data-x="close">Back to the city</button>`;
      } else {
        const tips = [];
        if (!r.weakUsed) tips.push(S.menu(g).includes(s.weak) ? `Bring the <b>${S.DISH[s.weak].name}</b>: it scores ×${D.DUEL.weak} here` : `Put <b>${S.DISH[s.weak].name}</b> on the menu: Gristle here is weak against it`);
        if (r.team < D.DUEL.team) tips.push(`Send ${D.DUEL.team} of the crew: hire more managers`);
        tips.push('Train the crew with chef\'s hats', 'Upgrade the stations of the dishes you bring', 'Renovate the rooms your crew looks after');
        html = `<h2>${DU('emblem')} Not this time…</h2>${STARS(0)}
          <p class="mpct">${s.name}: <b>${r.ours}</b> to ${r.theirs}</p>
          <ul class="tipsl">${tips.slice(0, 3).map((t) => `<li>${UI('up')}<span>${t}</span></li>`).join('')}</ul>
          <button class="btn gold big" data-x="crew">Train the crew</button><button class="btn ghost" data-x="again">Try again</button>`;
      }
      const m = modal(html, { cls: `mres dres ${r.won ? 'won' : 'lost'}`, dismiss: true, onClose: () => res(ask) });
      let ask = null;
      m.card.addEventListener('click', (e) => { const x = e.target.closest('[data-x]')?.dataset.x; if (x) { ask = x === 'close' ? null : x; m.close(); } });
      if (r.won) { [1, 2, 3].forEach((i) => { if (i <= r.stars) setTimeout(() => sfx('qte-good', { vol: 0.5 }), 250 * i); }); setTimeout(() => sfx(r.branch ? 'ui-unlock' : 'ui-coins', { vol: 0.6 }), 900); }
    });
  }
  // the nav button's badge: a branch to fight and a full set of tickets
  const badge = (g) => (D.open(g) && D.nextStage(g) && Object.keys(g.mgr).length && D.sync(g, Date.now()).tix >= D.DUEL.tix ? '!' : '');
  return Object.assign(api, { city, badge });
}

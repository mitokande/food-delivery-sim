// The balance lab (idle3-lab.html): every number the balance of Idle Restaurant Manager is made of (sim.js tunables()),
// next to what a bot's game looks like with them against the shipped game (lab-worker.js: bot.js on sim.js): what it
// earns a minute, when the cooks, couriers, motors and stages come, what held the place back, what closing the game
// brings. What differs from the shipped game is kept in localStorage[S.TUNE] as { path: value } ("Copy changes" gives
// the same text): a playtest (idle3.html?lab) plays with it, and takes changes while it is open in another tab.
// The page itself never tunes its own copy of sim.js: S.* here is the shipped game.
import * as S from './sim.js';

window.name = 'idle3-lab'; // (the playtest's "Balance lab" link comes back to this tab)
const UI_KEY = 'fds_idle3_lab_ui';
const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const read = (k) => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch { return null; } };
const write = (k, v) => { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode: the page still works */ } };
const clock = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

// ---------------------------------------------------------------- what a number may be
// (stored units; scale: the field shows value / scale. Seats: two a table, and no more than the room of that stage has
// place for, inside.js layout())
const SEAT_MAX = [24, 24, 30, 56, 72];
const MONEY = { min: 0, max: 1e7, step: 10 }; // (prices: a hire, a stage, a motor, a bag)
const RULES = [
  [/^DISHES\.\w+\.price$/, { min: 0.5, max: 500, step: 0.5 }],
  [/^DISHES\.\w+\.time$/, { min: 1, max: 120, step: 0.5 }],
  [/^VARIETY$/, { min: 0, max: 1, step: 0.01 }],
  [/^YOU_K$/, { min: 0.05, max: 1, step: 0.05 }],
  [/^QUAL_STEP$/, { min: 0, max: 1, step: 0.01 }],
  [/^SPEED_K$/, { min: 0.5, max: 1, step: 0.01 }],
  [/^FAME_STEP$/, { min: 0, max: 2, step: 0.05 }],
  [/^STALL$/, { min: 0, max: 60, step: 0.5 }],
  [/^(PICKUP|HANDOVER)$/, { min: 0, max: 30, step: 0.5 }],
  [/^RIDE_STEP$/, { min: 0, max: 0.5, step: 0.01 }],
  [/^CHARM_STEP$/, { min: 0, max: 2, step: 0.05 }],
  [/^STAGES\.\w+\.seats$/, { min: 2, max: 72, step: 2, even: true }],
  [/^STAGES\.\w+\.cooks$/, { min: 1, max: S.COOK_HIRE.length, step: 1, int: true }],
  [/^STAGES\.\w+\.couriers$/, { min: 1, max: S.COURIER_HIRE.length, step: 1, int: true }],
  [/^STAGES\.\w+\.appeal$/, { min: 0.1, max: 5, step: 0.05 }],
  [/^STAGES\.\w+\.fame$/, { min: 0, max: S.FAME.length, step: 1, int: true }],
  [/^WALK\.rate$/, { min: 0, max: 200, step: 0.5 }],
  [/^WALK\.door$/, { min: 0, max: 30, step: 1, int: true }],
  [/^WALK\.(doorPatience|patience)$/, { min: 1, max: 600, step: 1 }],
  [/^WALK\.eat$/, { min: 1, max: 120, step: 1 }],
  [/^DELIV\.rate$/, { min: 0, max: 100, step: 0.5 }],
  [/^DELIV\.patience$/, { min: 5, max: 900, step: 5 }],
  [/^DELIV\.radius$/, { min: 60, max: 600, step: 10 }],
  [/^DELIV\.(fee|tip)$/, { min: 0, max: 100, step: 0.5 }],
  [/^DELIV\.perM$/, { min: 0, max: 1, step: 0.005 }],
  [/^FAME\.\d+$/, { min: 1, max: 1e7, step: 10, int: true }],
  [/^MOTORS\.\w+\.speed$/, { min: 1, max: 60, step: 0.5 }],
  [/^MOTORS\.\w+\.cap$/, { min: 1, max: 3, step: 1, int: true }],
  [/^MOTORS\.\w+\.stall$/, { min: 0, max: 1, step: 0.05 }],
  [/^SKILLS\.bag\.max$/, { min: 0, max: 2, step: 1, int: true }],
  [/^SKILLS\.\w+\.max$/, { min: 0, max: 10, step: 1, int: true }],
  [/^SKILLS\.\w+\.base$/, { min: 1, max: 1e6, step: 1 }],
  [/^SKILLS\.\w+\.(g|hire)$/, { min: 1, max: 5, step: 0.05 }],
  [/^AWAY\.max$/, { min: 1800, max: 86400, step: 1800, scale: 3600 }],
  [/^AWAY\.card$/, { min: 0, max: 3600, step: 10 }],
];
function rule(p) {
  const r = RULES.find(([re]) => re.test(p))?.[1] || MONEY;
  const m = /^STAGES\.(\w+)\.seats$/.exec(p);
  return m ? { ...r, max: SEAT_MAX[S.STAGES.findIndex((s) => s.id === m[1])] } : r;
}
function norm(p, v) {
  const r = rule(p);
  v = Math.min(r.max, Math.max(r.min, v));
  return r.even ? Math.round(v / 2) * 2 : r.int ? Math.round(v) : Math.round(v * 1e4) / 1e4;
}
const shown = (p, v) => Math.round(v / (rule(p).scale || 1) * 1e4) / 1e4;

// ---------------------------------------------------------------- the numbers, in the groups a player meets them
const LABEL = {}; // path → what the field is called (the paths the lab edits)
const inp = (p, name) => {
  LABEL[p] = name;
  const r = rule(p), k = r.scale || 1;
  return `<input type="number" inputmode="decimal" data-p="${p}" min="${r.min / k}" max="${r.max / k}" step="${r.step / k}" aria-label="${esc(name)}">`;
};
const field = (p, name, hint = '', full = name) => `<label class="f"><span>${esc(name)}</span>${inp(p, full)}${hint ? `<small>${esc(hint)}</small>` : ''}</label>`;
const fields = (list, tight = false) => `<div class="fields${tight ? ' tight' : ''}">${list.join('')}</div>`;
// rows: { name, note, path(col key) → path | null }
const grid = (corner, cols, rows) => `<div class="scroll"><table class="pt"><thead><tr><th>${corner}</th>${cols.map(([, hd]) => `<th>${hd}</th>`).join('')}</tr></thead><tbody>${rows.map((r) =>
  `<tr><th>${esc(r.name)}${r.note ? `<small>${esc(r.note)}</small>` : ''}</th>${cols.map(([k, hd]) => { const p = r.path(k); return p ? `<td>${inp(p, `${r.name} · ${hd}`)}</td>` : '<td class="na">–</td>'; }).join('')}</tr>`).join('')}</tbody></table></div>`;
const group = (title, about, body) => `<details class="group" open><summary>${title}<span class="n"></span></summary><p>${about}</p>${body}</details>`;
const SKILL_COLS = [['max', 'Levels'], ['base', 'First level $'], ['g', '× per level'], ['hire', '× per later hire']];
const skills = (list) => grid('Training', SKILL_COLS, list.map(([sk, name]) => ({ name, path: (k) => `SKILLS.${sk}.${k}` })));

function buildParams() {
  $('#params').innerHTML = [
    group('Menu', 'You start with the first dish; every cook you hire brings the next one.',
      grid('Dish', [['price', 'Price $'], ['time', 'Cooking time s']], S.DISHES.map((d, i) => ({ name: d.name, note: i ? `comes with cook ${i}` : 'yours from the start', path: (k) => `DISHES.${d.id}.${k}` })))
      + fields([field('VARIETY', 'Customers per extra dish', 'customers × (1 + this × the dishes after the first)')])),
    group('Kitchen', 'How fast dishes come out, and what cooks cost to hire and train.',
      fields([
        field('YOU_K', 'Your cooking time', 'share of a new cook\'s time: 0.4 = you are 2.5× as fast'),
        field('SPEED_K', 'A speed level', 'cooking time × this per level (lower = stronger)'),
        field('QUAL_STEP', 'A quality level', 'the dish sells for this much more per level (0.12 = +12%)'),
      ])
      + '<h3>Hiring a cook ($)</h3>' + fields(S.COOK_HIRE.map((_, i) => field(`COOK_HIRE.${i}`, `Cook ${i + 1}`, S.DISHES[i + 1]?.name || '', `Cook ${i + 1} · hire $`)), true)
      + '<h3>Training (you and the cooks)</h3>' + skills([['speed', 'Cooking speed'], ['quality', 'Quality']])),
    group('Restaurant', 'The five stages: tables, room for staff, how much the place draws people in, and what the next one asks for.',
      grid('Stage', [['seats', 'Seats'], ['cooks', 'Cooks'], ['couriers', 'Couriers'], ['appeal', 'Appeal ×'], ['cost', 'Price $'], ['fame', 'Fame needed']],
        S.STAGES.map((s, i) => ({ name: `${i + 1} · ${s.name}`, path: (k) => (!i && (k === 'cost' || k === 'fame') ? null : `STAGES.${s.id}.${k}`) })))),
    group('Customers', 'Who walks in, how long they wait, and how fame (dishes sold) brings more of them.',
      fields([
        field('WALK.rate', 'Walk-ins a minute', 'at fame 1 with one dish'),
        field('WALK.door', 'Line at the door', 'how many wait for a table; the rest walk on'),
        field('WALK.doorPatience', 'Patience at the door (s)'),
        field('WALK.patience', 'Patience at the table (s)', 'waiting for the food before they walk out'),
        field('WALK.eat', 'Eating (s)', 'the table is taken this long after the food comes'),
        field('FAME_STEP', 'A fame level', 'customers × (1 + this × the levels after the first)'),
      ])
      + '<h3>Dishes sold to reach a fame level</h3>' + fields(S.FAME.slice(1).map((_, i) => field(`FAME.${i + 1}`, `Level ${i + 2}`, '', `Fame level ${i + 2} · dishes sold`)), true)),
    group('Delivery', 'Orders from the doors nearby, the couriers, their motors and their training.',
      fields([
        field('DELIV.rate', 'Orders a minute', 'at fame 1 with one dish, once there is a courier'),
        field('DELIV.patience', 'An order waits (s)', 'to be picked up, before it is lost'),
        field('DELIV.radius', 'Delivery zone (m of road)', 'a running playtest reloads to redraw it'),
        field('DELIV.fee', 'Delivery fee ($)', 'on top of the dish'),
        field('DELIV.perM', 'Fee per metre ($)'),
        field('DELIV.tip', 'Tip ($)', 'for a quick delivery, before charm'),
        field('PICKUP', 'At the counter (s)'),
        field('HANDOVER', 'At each door (s)'),
        field('STALL', 'A stalled engine costs (s)'),
        field('RIDE_STEP', 'A riding level', 'speed + this share per level (0.07 = +7%)'),
        field('CHARM_STEP', 'A charm level', 'tips + this share per level'),
      ])
      + '<h3>Hiring a courier ($)</h3>' + fields(S.COURIER_HIRE.map((_, i) => field(`COURIER_HIRE.${i}`, `Courier ${i + 1}`, '', `Courier ${i + 1} · hire $`)), true)
      + '<h3>Motors</h3>' + grid('Motor', [['speed', 'Speed m/s'], ['cap', 'Orders a trip'], ['stall', 'Stall chance'], ['cost', 'Price $']],
        S.MOTORS.map((m, i) => ({ name: m.name, path: (k) => (!i && k === 'cost' ? null : `MOTORS.${m.id}.${k}`) })))
      + '<h3>Training (couriers)</h3>' + skills([['ride', 'Riding'], ['charm', 'Charm']])
      + grid('Bigger bag', [['max', 'Levels'], ['costs.0', 'Level 1 $'], ['costs.1', 'Level 2 $'], ['hire', '× per later hire']], [{ name: '+1 order a trip', path: (k) => `SKILLS.bag.${k}` }])),
    group('While the game is closed', 'The time away is played through when the player comes back (nobody taps).',
      fields([
        field('AWAY.max', 'Longest time away that counts (h)'),
        field('AWAY.card', 'Card after (s)', 'away at least this long to get the "while you were away" card'),
      ])),
  ].join('');
}

// ---------------------------------------------------------------- state
let over = {}; // path → value: what differs from the shipped game
const ui = { player: 'plan-active', minutes: 60, scale: 'log', ...read(UI_KEY) };
const base = new Map(); // "player|minutes" → the shipped game's run
let view = { base: null, mine: null, err: null, minutes: ui.minutes };
let inputs = [], undo = null;

// what a pasted / stored object holds for the lab → [set, entries left out]
function take(obj) {
  const set = {}; let out = 0;
  for (const p in obj || {}) {
    const v = +obj[p];
    if (!(p in LABEL) || !Number.isFinite(v)) { out++; continue; }
    const n = norm(p, v); if (n !== S.SHIPPED[p]) set[p] = n;
  }
  return [set, out];
}
const val = (p) => (p in over ? over[p] : S.SHIPPED[p]);
function sync() { // the fields ← over
  for (const i of inputs) {
    const p = i.dataset.p, on = p in over;
    if (document.activeElement !== i) i.value = shown(p, val(p));
    i.classList.toggle('chg', on); i.title = on ? `shipped: ${shown(p, S.SHIPPED[p])}` : '';
  }
  for (const g of document.querySelectorAll('.group')) { const n = g.querySelectorAll('input.chg').length; $('.n', g).textContent = n ? `${n} changed` : ''; }
}
function changed(now = false) {
  write(S.TUNE, Object.keys(over).length ? over : null);
  sync(); drawChanges();
  if (now) refresh(); else later();
}

// ---------------------------------------------------------------- the bot's games (one worker, one game at a time)
let worker = null, seq = 0, waiting = null;
function ask(o, player, minutes) {
  return new Promise((ok, fail) => {
    if (!worker) {
      worker = new Worker(new URL('./lab-worker.js', import.meta.url), { type: 'module' });
      worker.onmessage = ({ data }) => {
        if (!waiting || data.id !== waiting.id) return;
        const w = waiting; waiting = null; clearTimeout(w.timer);
        if (data.error) w.fail(new Error(data.error)); else w.ok(data.run);
      };
      worker.onerror = (e) => { e.preventDefault?.(); const w = waiting; waiting = null; worker = null; if (w) { clearTimeout(w.timer); w.fail(new Error(e.message || 'the bot could not start in this browser')); } };
    }
    const id = ++seq;
    // (numbers the game never ends with: drop the worker, the next game gets a new one)
    const timer = setTimeout(() => { worker?.terminate(); worker = null; waiting = null; fail(new Error('the game took too long to play')); }, 20000);
    waiting = { id, ok, fail, timer };
    worker.postMessage({ id, over: o, player, minutes });
  });
}
let busy = false, again = false, timer = 0;
const later = () => { clearTimeout(timer); timer = setTimeout(refresh, 250); };
async function refresh() {
  clearTimeout(timer);
  if (busy) { again = true; return; }
  busy = true; status();
  do {
    again = false;
    const { player, minutes } = ui, key = `${player}|${minutes}`, o = { ...over };
    try {
      if (!base.has(key)) base.set(key, await ask({}, player, minutes));
      view = { base: base.get(key), mine: Object.keys(o).length ? await ask(o, player, minutes) : null, err: null, minutes };
    } catch (e) { view = { base: base.get(key) || null, mine: null, err: e.message, minutes }; }
    draw();
  } while (again);
  busy = false; status();
}
function status() {
  document.body.dataset.state = busy ? 'busy' : 'ready';
  $('.status').textContent = busy ? 'The bot is playing…' : view.err ? '' : view.mine ? `Your values against the shipped game, ${view.minutes} min each.` : `The shipped game, ${view.minutes} min. Change a number to compare.`;
}

// ---------------------------------------------------------------- the results
const PLAYERS = [['plan-active', 'Plans ahead, taps the whole time'], ['plan-5min', 'Plans ahead, taps 5 min then watches'], ['plan-idle', 'Plans ahead, taps 1 min then watches'], ['cheap-active', 'Buys the cheapest thing, taps the whole time']];
const HELD = [['ok', 'Nothing: all running'], ['kitchen', 'Tables wait for their food'], ['seats', 'No free table'], ['bags', 'Delivery orders wait'], ['quiet', 'Cooks stand around']];
const KEY = (mine) => `<span class="key${mine ? ' mine' : ''}"></span>`;
const seg = (name, opts, cur) => `<span class="seg" role="group" data-seg="${name}">${opts.map(([v, t]) => `<button type="button" data-v="${v}" aria-pressed="${String(v) === String(cur)}">${t}</button>`).join('')}</span>`;

function buildResults() {
  $('#results').innerHTML = `
    <div class="card controls">
      <label>Player <select id="player">${PLAYERS.map(([v, t]) => `<option value="${v}"${v === ui.player ? ' selected' : ''}>${t}</option>`).join('')}</select></label>
      <label>Length ${seg('minutes', [[30, '30 min'], [60, '60 min'], [120, '2 h']], ui.minutes)}</label>
      <span class="status" role="status"></span>
    </div>
    <div class="note bad" id="err" hidden></div>
    <div class="tiles" id="tiles"></div>
    <div class="card">
      <div class="chart-head"><h2>Earned a minute</h2><div class="legend"></div>${seg('scale', [['log', 'Log'], ['lin', 'Linear']], ui.scale)}</div>
      <div class="chart"><svg tabindex="0" role="img"></svg><div class="tip" hidden></div></div>
      <details class="tv"><summary>Show as a table</summary><div class="scroll"><table class="rt" id="tv"></table></div></details>
    </div>
    <div class="card"><h2>When things come</h2><div class="scroll"><table class="rt" id="marks"></table></div></div>
    <div class="card"><h2>What held the restaurant back <small>share of the game</small></h2><div class="held" id="held"></div></div>
    <div class="card"><h2>While the game is closed <small id="awaynote"></small></h2><div class="scroll"><table class="rt" id="away"></table></div></div>
    <div class="card"><h2>Your changes <small id="nchg"></small></h2><div class="changes" id="changes"></div><div class="warn" id="warn" hidden></div></div>`;
  document.body.appendChild(Object.assign(document.createElement('button'), { id: 'mini', type: 'button' }));
}

// what a run comes down to
function sum(r, minutes) {
  const lost = r.lostWalk + r.lostOrders, all = r.tables + r.deliveries + lost, tail = r.mins.slice(-3);
  let gap = 0, prev = 0; for (const t of [...r.buys, minutes * 60]) { gap = Math.max(gap, t - prev); prev = t; }
  return { earned: r.earned, rate: tail.reduce((s, m) => s + m.earned, 0) / Math.max(1, tail.length), stage: r.stage, stageAt: r.marks['STAGE' + r.stage], fame: r.fame, lost: all ? lost / all : 0, gap };
}
const pct = (a, b) => { if (!a) return ''; const d = Math.round((b - a) / a * 100); return d ? `${d > 0 ? '+' : '−'}${Math.abs(d)}%` : 'same'; };
const steps = (a, b) => (a === b ? 'same' : `${b > a ? '+' : '−'}${Math.abs(b - a)}`);
const when = (a, b, [less, more]) => { const d = b - a; return Math.abs(d) < 1 ? 'same' : `${clock(Math.abs(d))} ${d < 0 ? less : more}`; };
const SOON = ['sooner', 'later'];
const stageAt = (s) => (s.stageAt != null ? ` at ${clock(s.stageAt)}` : '');
function drawTiles() {
  const a = sum(view.base, view.minutes), b = view.mine && sum(view.mine, view.minutes), s = b || a;
  const T = [
    [`Earned in ${view.minutes} min`, S.money(s.earned), b && [S.money(a.earned), pct(a.earned, b.earned)]],
    ['Earning at the end', `${S.money(s.rate)}/min`, b && [`${S.money(a.rate)}/min`, pct(a.rate, b.rate)]],
    ['Restaurant', `Stage ${s.stage}`, b && [`stage ${a.stage}${stageAt(a)}`, a.stage !== b.stage ? steps(a.stage, b.stage) : a.stageAt != null && b.stageAt != null ? when(a.stageAt, b.stageAt, SOON) : 'same'], s.stageAt != null ? `reached at ${clock(s.stageAt)}` : ''],
    ['Fame level', s.fame, b && [a.fame, steps(a.fame, b.fame)]],
    ['Customers lost', `${(s.lost * 100).toFixed(1)}%`, b && [`${(a.lost * 100).toFixed(1)}%`, Math.abs(b.lost - a.lost) < 0.0005 ? 'same' : `${b.lost > a.lost ? '+' : '−'}${(Math.abs(b.lost - a.lost) * 100).toFixed(1)} pts`]],
    ['Longest wait for something to buy', clock(s.gap), b && [clock(a.gap), when(a.gap, b.gap, ['shorter', 'longer'])]],
  ];
  $('#tiles').innerHTML = T.map(([k, v, d, note]) => `<div class="tile"><div class="k">${esc(k)}</div><div class="v">${esc(v)}</div><div class="d">${[note && esc(note), d && `shipped ${esc(d[0])} · <b>${esc(d[1])}</b>`].filter(Boolean).join('<br>') || '&nbsp;'}</div></div>`).join('');
  const m = $('#mini');
  m.innerHTML = b ? `${KEY(1)}<span>Yours: <b>${S.money(b.earned)}</b> (${pct(a.earned, b.earned)}) · stage ${b.stage}${stageAt(b)}${a.stage === b.stage && a.stageAt != null && b.stageAt != null ? ` (${when(a.stageAt, b.stageAt, SOON)})` : ''}</span>`
    : `${KEY(0)}<span>Shipped: <b>${S.money(a.earned)}</b> in ${view.minutes} min · stage ${a.stage}${stageAt(a)}</span>`;
}

// ---- earned a minute: the shipped game and yours on one axis
const NS = 'http://www.w3.org/2000/svg';
const sv = (tag, at = {}, text = null) => { const e = document.createElementNS(NS, tag); for (const k in at) e.setAttribute(k, at[k]); if (text != null) e.textContent = text; return e; };
let hover = null; // (the minute under the crosshair)
function drawChart() {
  const box = $('.chart'), svg = $('svg', box), tip = $('.tip', box);
  const series = [['Shipped', 'var(--ship)', view.base], ...(view.mine ? [['Yours', 'var(--mine)', view.mine]] : [])];
  $('.legend').innerHTML = series.map(([n], i) => `<span>${KEY(i)}${n}</span>`).join('');
  const W = Math.max(260, box.clientWidth), wide = W >= 520, H = wide ? 280 : 220, M = { l: 44, r: wide ? 70 : 12, t: 10, b: 24 };
  const pw = W - M.l - M.r, ph = H - M.t - M.b, N = view.minutes, log = ui.scale === 'log';
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`); svg.setAttribute('height', H); svg.replaceChildren();
  svg.setAttribute('aria-label', `Earned a minute over ${N} minutes${view.mine ? ', the shipped game against your values' : ', the shipped game'}. Arrow keys read it minute by minute.`);
  const all = series.flatMap((s) => s[2].mins.map((r) => r.earned)), top = Math.max(1, ...all);
  let lo = 0, hi, ticks;
  if (log) {
    const s125 = []; for (let e = 0; e < 10; e++) for (const k of [1, 2, 5]) s125.push([k * 10 ** e, k === 1]);
    const low = Math.max(1, Math.min(...all.filter((v) => v > 0), top));
    lo = s125.filter(([v]) => v <= low).at(-1)[0]; hi = s125.find(([v]) => v >= top && v > lo)[0];
    ticks = s125.filter(([v]) => v >= lo && v <= hi);
    if (ticks.length > 7) ticks = ticks.filter(([, ten]) => ten);
    ticks = ticks.map(([v]) => v);
  } else {
    const raw = top / 4, p10 = 10 ** Math.floor(Math.log10(raw)), st = [1, 2, 5, 10].map((k) => k * p10).find((v) => v >= raw);
    hi = Math.ceil(top / st) * st; ticks = []; for (let v = 0; v <= hi + 1e-9; v += st) ticks.push(v);
  }
  const x = (m) => M.l + pw * (m - 1) / Math.max(1, N - 1);
  const y = (v) => M.t + ph * (1 - (log ? Math.log(Math.max(v, lo) / lo) / Math.log(hi / lo) : v / hi));
  for (const v of ticks) {
    svg.append(sv('line', { class: 'grid', x1: M.l, x2: M.l + pw, y1: y(v), y2: y(v) }), sv('text', { class: 'axis', x: M.l - 8, y: y(v) + 4, 'text-anchor': 'end' }, S.money(v)));
  }
  const xs = N / (wide ? 6 : 3);
  for (let m = xs; m <= N; m += xs) svg.append(sv('text', { class: 'axis', x: x(m), y: H - 6, 'text-anchor': m === N ? 'end' : 'middle' }, `${m} min`));
  const ends = [];
  for (const [name, color, r] of series) {
    svg.append(sv('path', { class: 'line', style: `stroke:${color}`, d: r.mins.map((p, i) => `${i ? 'L' : 'M'}${x(p.m).toFixed(1)} ${y(p.earned).toFixed(1)}`).join('') }));
    const e = r.mins.at(-1); ends.push({ name, color, x: x(e.m), y: y(e.earned) });
  }
  for (const e of ends) svg.append(sv('circle', { class: 'dot', cx: e.x, cy: e.y, r: 4, style: `fill:${e.color}` }));
  if (wide) { // (the names at the line ends, pushed apart when the lines end together)
    const lab = ends.map((e) => ({ ...e, ly: e.y })).sort((p, q) => p.ly - q.ly);
    if (lab.length > 1 && lab[1].ly - lab[0].ly < 15) { const mid = (lab[0].ly + lab[1].ly) / 2; lab[0].ly = mid - 7.5; lab[1].ly = mid + 7.5; }
    for (const l of lab) svg.append(sv('text', { class: 'end', x: l.x + 9, y: l.ly + 4 }, l.name));
  }
  // the crosshair: the nearest minute, every series in one tooltip
  const cross = sv('g', { visibility: 'hidden' });
  const cl = sv('line', { class: 'cross', y1: M.t, y2: M.t + ph });
  const dots = series.map(([, color]) => sv('circle', { class: 'dot', r: 4.5, style: `fill:${color}` }));
  cross.append(cl, ...dots); svg.append(cross);
  function show(m) {
    hover = m;
    if (m == null) { cross.setAttribute('visibility', 'hidden'); tip.hidden = true; return; }
    cross.setAttribute('visibility', 'visible'); cl.setAttribute('x1', x(m)); cl.setAttribute('x2', x(m));
    tip.replaceChildren(Object.assign(document.createElement('div'), { className: 't', textContent: `Minute ${m}` }));
    series.forEach(([name, , r], i) => {
      const p = r.mins[m - 1]; if (!p) return;
      dots[i].setAttribute('cx', x(m)); dots[i].setAttribute('cy', y(p.earned));
      const row = Object.assign(document.createElement('div'), { className: 'r' });
      const k = document.createElement('span'); k.className = `key${i ? ' mine' : ''}`;
      row.append(k, name, Object.assign(document.createElement('i'), { textContent: `stage ${p.stage}` }), Object.assign(document.createElement('b'), { textContent: `${S.money(p.earned)}/min` }));
      tip.append(row);
    });
    tip.hidden = false;
    const tw = tip.offsetWidth, left = x(m) + 14 + tw > W ? x(m) - 14 - tw : x(m) + 14;
    tip.style.transform = `translate(${Math.max(0, left)}px, ${M.t}px)`;
  }
  const at = (e) => { const b = svg.getBoundingClientRect(); return Math.max(1, Math.min(N, Math.round((e.clientX - b.left - M.l) / pw * (N - 1)) + 1)); };
  svg.onpointermove = svg.onpointerdown = (e) => show(at(e));
  svg.onpointerleave = () => show(null);
  svg.onblur = () => show(null);
  svg.onkeydown = (e) => {
    const d = { ArrowLeft: -1, ArrowRight: 1, PageUp: -10, PageDown: 10 }[e.key];
    if (d) show(Math.max(1, Math.min(N, (hover ?? (d > 0 ? 0 : N + 1)) + d)));
    else if (e.key === 'Home') show(1); else if (e.key === 'End') show(N); else if (e.key === 'Escape') show(null); else return;
    e.preventDefault();
  };
  show(hover != null && hover <= N && document.activeElement === svg ? hover : null);

  const two = !!view.mine;
  $('#tv').innerHTML = `<thead><tr><th>Minute</th><th>${KEY(0)}Shipped $/min</th>${two ? `<th>${KEY(1)}Yours $/min</th>` : ''}<th>Stage${two ? ' (shipped)' : ''}</th>${two ? '<th>Stage (yours)</th>' : ''}</tr></thead><tbody>${
    view.base.mins.map((p, i) => { const q = view.mine?.mins[i]; return `<tr><th>${p.m}</th><td>${S.money(p.earned)}</td>${two ? `<td>${q ? S.money(q.earned) : '–'}</td>` : ''}<td>${p.stage}</td>${two ? `<td>${q ? q.stage : '–'}</td>` : ''}</tr>`; }).join('')}</tbody>`;
}

function markName(k) {
  let m;
  if ((m = /^cook(\d+):(.*)$/.exec(k))) return `Cook ${m[1]} · ${S.DISH[m[2]]?.name || m[2]}`;
  if ((m = /^courier(\d+)$/.exec(k))) return `Courier ${m[1]}`;
  if ((m = /^STAGE(\d+)$/.exec(k))) return `Stage ${m[1]} · ${S.STAGES[m[1] - 1]?.name || ''}`;
  if ((m = /^motor:(.*)$/.exec(k))) return `First ${S.MOTORS.find((x) => x.id === m[1])?.name || m[1]}`;
  return k;
}
function drawMarks() {
  const a = view.base.marks, b = view.mine?.marks, keys = [...new Set([...Object.keys(a), ...Object.keys(b || {})])];
  keys.sort((p, q) => (a[p] ?? b[p]) - (a[q] ?? b[q]));
  const t = (v) => (v != null ? clock(v) : '–');
  $('#marks').innerHTML = `<thead><tr><th>Comes at (min:s)</th><th>${KEY(0)}Shipped</th>${b ? `<th>${KEY(1)}Yours</th><th>Difference</th>` : ''}</tr></thead><tbody>${keys.map((k) =>
    `<tr${k.startsWith('STAGE') ? ' class="big"' : ''}><th>${esc(markName(k))}</th><td>${t(a[k])}</td>${b ? `<td>${t(b[k])}</td><td class="dl">${a[k] == null ? 'only with yours' : b[k] == null ? 'never comes' : when(a[k], b[k], SOON)}</td>` : ''}</tr>`).join('')}</tbody>`;
}
function drawHeld() {
  const share = (r, k) => (r.diag[k] || 0) / Math.max(1, Object.values(r.diag).reduce((s, v) => s + v, 0));
  const bar = (v, mine) => `<div class="bar${mine ? ' mine' : ''}" style="width:${(v * 100).toFixed(1)}%"></div><div class="pc">${Math.round(v * 100)}%</div>`;
  $('#held').innerHTML = HELD.map(([k, name]) => `<div class="lab${view.mine ? '' : ' one'}">${name}</div>${bar(share(view.base, k), 0)}${view.mine ? bar(share(view.mine, k), 1) : ''}`).join('<div class="gap"></div>');
}
function drawAway() {
  const a = view.base.gone, b = view.mine?.gone, h = (s) => `${Math.round(s / 360) / 10} h`;
  $('#awaynote').textContent = `nobody taps; at most ${h(S.SHIPPED['AWAY.max'])}${'AWAY.max' in over && b ? ` (yours ${h(over['AWAY.max'])})` : ''} counts`;
  $('#away').innerHTML = `<thead><tr><th>Closed after playing</th><th>${KEY(0)}Shipped</th>${b ? `<th>${KEY(1)}Yours</th><th>Difference</th>` : ''}</tr></thead><tbody>${a.map((g, i) =>
    `<tr><th>${g.m} min</th><td>${S.money(g.earned)}</td>${b ? `<td>${b[i] ? S.money(b[i].earned) : '–'}</td><td class="dl">${b[i] ? pct(g.earned, b[i].earned) : ''}</td>` : ''}</tr>`).join('')}</tbody>`;
}
function drawChanges() {
  const ps = Object.keys(over).sort((p, q) => inputs.findIndex((i) => i.dataset.p === p) - inputs.findIndex((i) => i.dataset.p === q));
  $('#nchg').textContent = ps.length ? `${ps.length}` : '';
  $('#changes').innerHTML = ps.length ? ps.map((p) => `<div class="chg-row"><div class="nm">${esc(LABEL[p])}<code>${p}</code></div><div class="val">${shown(p, S.SHIPPED[p])} → <b>${shown(p, over[p])}</b></div><button type="button" data-undo="${p}" aria-label="Back to the shipped value: ${esc(LABEL[p])}">✕</button></div>`).join('')
    : '<p class="muted">Nothing yet: these are the shipped values. Changed numbers get an orange outline, and "New playtest" plays the game with them.</p>';
  let w = '';
  for (let i = 1; i < S.FAME.length && !w; i++) if (val(`FAME.${i}`) <= val(`FAME.${i - 1}`)) w = `Fame level ${i + 1} asks for no more dishes than level ${i}: the levels should rise.`;
  for (let i = 1; i < S.STAGES.length && !w; i++) if (val(`STAGES.${S.STAGES[i].id}.seats`) < val(`STAGES.${S.STAGES[i - 1].id}.seats`)) w = `Stage ${i + 1} has fewer seats than stage ${i}.`;
  $('#warn').textContent = w; $('#warn').hidden = !w;
}
function draw() {
  const e = $('#err');
  e.hidden = !view.err;
  if (view.err) e.innerHTML = `<b>The bot could not play ${view.base ? 'your values' : 'the game'}:</b> ${esc(view.err)}.${view.base ? ' Showing the shipped game.' : ''}`;
  if (!view.base) return;
  drawTiles(); drawChart(); drawMarks(); drawHeld(); drawAway();
}

// ---------------------------------------------------------------- hands
let toastT = 0;
function toast(text, back = null) {
  const t = $('#toast'); undo = back;
  t.replaceChildren(text, ...(back ? [Object.assign(document.createElement('button'), { type: 'button', textContent: 'Undo' })] : []));
  t.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('on'), back ? 7000 : 2500);
}
async function copy(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch { /* no permission, or not https: the old way */ }
  const ta = Object.assign(document.createElement('textarea'), { value: text }); document.body.appendChild(ta); ta.select();
  let ok = false; try { ok = document.execCommand('copy'); } catch { /* fine */ } ta.remove(); return ok;
}
function wire() {
  const P = $('#params');
  P.addEventListener('input', (e) => { // while typing: take what is a number, leave the field alone
    const i = e.target.closest('input[data-p]'); if (!i || i.value.trim() === '' || !Number.isFinite(+i.value)) return;
    const p = i.dataset.p, v = norm(p, +i.value * (rule(p).scale || 1));
    if (v === S.SHIPPED[p]) delete over[p]; else over[p] = v;
    changed();
  });
  P.addEventListener('change', (e) => { // done typing: the field shows what was taken (an empty one: the shipped value)
    const i = e.target.closest('input[data-p]'); if (!i) return;
    const p = i.dataset.p;
    if (i.value.trim() === '' || !Number.isFinite(+i.value)) { delete over[p]; changed(); }
    i.value = shown(p, val(p));
  });
  P.addEventListener('focusin', (e) => e.target.closest('input[data-p]')?.select()); // (typing replaces the number)
  $('#results').addEventListener('click', (e) => {
    const b = e.target.closest('[data-seg] button'), u = e.target.closest('[data-undo]');
    if (b) {
      const s = b.parentElement, k = s.dataset.seg;
      ui[k] = k === 'minutes' ? +b.dataset.v : b.dataset.v; write(UI_KEY, ui);
      for (const o of s.children) o.setAttribute('aria-pressed', o === b);
      if (k === 'scale') { if (view.base) drawChart(); } else refresh();
    } else if (u) { delete over[u.dataset.undo]; changed(true); }
  });
  $('#player').addEventListener('change', (e) => { ui.player = e.target.value; write(UI_KEY, ui); refresh(); });
  $('#mini').addEventListener('click', () => $('#tiles').scrollIntoView({ behavior: 'smooth', block: 'start' }));
  $('#toast').addEventListener('click', (e) => { if (e.target.closest('button') && undo) { over = undo; undo = null; $('#toast').classList.remove('on'); changed(true); } });
  const dlg = $('#paste'), ta = $('textarea', dlg), err = $('.err', dlg);
  $('.top .actions').addEventListener('click', async (e) => {
    const a = e.target.closest('[data-act]')?.dataset.act, n = Object.keys(over).length;
    if (a === 'copy') toast(!n ? 'Nothing changed yet' : (await copy(JSON.stringify(over, null, 2))) ? `Copied ${n} change${n === 1 ? '' : 's'}` : 'Could not copy here');
    else if (a === 'paste') { ta.value = ''; err.hidden = true; dlg.showModal(); ta.focus(); }
    else if (a === 'reset') { if (!n) return toast('These are the shipped values'); const was = over; over = {}; changed(true); toast(`${n} value${n === 1 ? '' : 's'} back to shipped`, was); }
  });
  $('[value=ok]', dlg).addEventListener('click', (e) => {
    let obj = null;
    try { obj = JSON.parse(ta.value); } catch { /* said below */ }
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) { e.preventDefault(); err.textContent = 'That is not the text "Copy changes" gives: { "WALK.rate": 10 }'; err.hidden = false; return; }
    const was = over, [set, out] = take(obj), n = Object.keys(set).length;
    over = set; changed(true);
    toast(`${n} value${n === 1 ? '' : 's'} taken${out ? `, ${out} left out (not a number of this game)` : ''}`, was);
  });
  // (another lab tab changed the numbers)
  addEventListener('storage', (e) => { if (e.key === S.TUNE) { [over] = take(read(S.TUNE)); sync(); drawChanges(); refresh(); } });
  new ResizeObserver(() => { if (view.base) drawChart(); }).observe($('.chart'));
}

buildParams(); buildResults();
inputs = [...document.querySelectorAll('#params input[data-p]')];
[over] = take(read(S.TUNE));
wire(); sync(); drawChanges(); refresh();
window.lab = { get over() { return over; }, get view() { return view; }, LABEL };

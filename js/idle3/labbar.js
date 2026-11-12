// The playtest bar (idle3.html?lab, loaded by main.js only then): a chip in the corner that opens a small panel to run
// the game faster, hand out cash, skip time (played through like a closed game, with its card), start over, and go
// back to the balance lab (idle3-lab.html). While the lab is open in another tab, its numbers arrive here as they
// change. A playtest has its own save: the player's real restaurant is never touched.
import * as S from './sim.js';

const CSS = `
#labbar { position: absolute; left: 0; top: calc(100% + 6px); z-index: 55;
  font: 600 13px/1.25 Fredoka, system-ui, sans-serif; color: #eef2fb; -webkit-user-select: none; user-select: none; touch-action: manipulation; }
#labbar button, #labbar a { font: inherit; color: inherit; border: 0; cursor: pointer; text-decoration: none; }
#labbar .lb-chip { display: flex; align-items: center; gap: 6px; padding: 5px 10px 5px 8px; border-radius: 14px; background: #182338;
  box-shadow: 0 0 0 2px #d95926, 0 3px 10px rgba(0,0,0,.4); }
#labbar .lb-chip i { width: 8px; height: 8px; border-radius: 50%; background: #d95926; }
#labbar .lb-chip b { font-weight: 700; }
#labbar .lb-chip span { color: #9fb0cf; font-weight: 500; }
#labbar .lb-panel { margin-top: 8px; width: 236px; padding: 10px; border-radius: 14px; background: rgba(24,35,56,.96); box-shadow: 0 0 0 1px #33456b, 0 8px 24px rgba(0,0,0,.5); }
#labbar:not(.open) .lb-panel { display: none; }
#labbar .lb-read { margin-bottom: 8px; color: #c8d3ea; font-weight: 500; font-variant-numeric: tabular-nums; }
#labbar .lb-read b { color: #fff; font-weight: 700; }
#labbar .lb-row { display: flex; align-items: center; gap: 4px; margin-top: 6px; }
#labbar .lb-row > span { width: 44px; flex: none; color: #9fb0cf; font-weight: 500; }
#labbar .lb-row button, #labbar .lb-row a { flex: 1; min-height: 32px; padding: 0 4px; border-radius: 9px; background: #2a3a5c; display: grid; place-items: center; white-space: nowrap; }
#labbar .lb-row button:active, #labbar .lb-row a:active { background: #3a4f7a; }
#labbar .lb-row button.on { background: #d95926; color: #fff; }
#labbar .lb-note { margin-top: 8px; color: #9fb0cf; font-weight: 500; font-size: 12px; }
`;
const SPEEDS = [1, 2, 5, 10, 20];
const CASH = [100, 1000, 10000];
const SKIPS = [[60, '1 min'], [600, '10 min'], [7200, '2 h']];
const clock = (s) => { const m = Math.floor(s / 60); return m >= 60 ? `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}` : `${m}:${String(Math.floor(s % 60)).padStart(2, '0')}`; };

export function createLabBar(game, { tuning, catchUp, syncMap, save, speed }) {
  const G = game.G;
  document.head.appendChild(Object.assign(document.createElement('style'), { textContent: CSS }));
  const el = document.createElement('div');
  el.id = 'labbar';
  el.innerHTML = `<button class="lb-chip" data-lb="toggle" aria-expanded="false"><i></i><b>LAB</b><span class="lb-sum"></span></button>
    <div class="lb-panel">
      <div class="lb-read"></div>
      <div class="lb-row"><span>Speed</span>${SPEEDS.map((v) => `<button data-lb="speed" data-v="${v}">×${v}</button>`).join('')}</div>
      <div class="lb-row"><span>Cash</span>${CASH.map((v) => `<button data-lb="cash" data-v="${v}">+${S.money(v)}</button>`).join('')}</div>
      <div class="lb-row"><span>Skip</span>${SKIPS.map(([v, t]) => `<button data-lb="skip" data-v="${v}">${t}</button>`).join('')}</div>
      <div class="lb-row"><a href="idle3-lab.html" target="idle3-lab">Balance lab</a><button data-lb="restart">Start over</button></div>
      <div class="lb-note"></div>
    </div>`;
  document.querySelector('.hud2').appendChild(el); // (under the fame bar and the banner, whatever their height; out of their flow)
  const sum = el.querySelector('.lb-sum'), read = el.querySelector('.lb-read'), note = el.querySelector('.lb-note');
  let changed = 0;

  // (a tap on the bar is not a tap on the restaurant behind it)
  for (const t of ['pointerdown', 'pointerup', 'click', 'touchstart', 'wheel']) el.addEventListener(t, (e) => e.stopPropagation());
  el.addEventListener('click', (e) => {
    const b = e.target.closest('[data-lb]'); if (!b) return;
    const v = +b.dataset.v;
    if (b.dataset.lb === 'toggle') { el.classList.toggle('open'); b.setAttribute('aria-expanded', el.classList.contains('open')); }
    else if (b.dataset.lb === 'speed') speed(v);
    else if (b.dataset.lb === 'cash') { G.cash += v; game.changed(); }
    else if (b.dataset.lb === 'skip') catchUp(v);
    else if (b.dataset.lb === 'restart') game.reset();
    draw();
  });

  // $ a minute over the last minute of game time
  const hist = [];
  function rate() {
    hist.push([G.t, G.stats.earned]);
    while (hist.length > 2 && hist[1][0] <= G.t - 60) hist.shift();
    const [t0, e0] = hist[0], dt = G.t - t0;
    return dt > 1 ? (G.stats.earned - e0) / dt * 60 : 0;
  }
  function draw() {
    const sp = speed();
    sum.textContent = `${sp === 1 ? '' : `×${sp} · `}${changed ? `${changed} changed` : 'shipped values'}`;
    for (const b of el.querySelectorAll('[data-lb="speed"]')) b.classList.toggle('on', +b.dataset.v === sp);
    read.innerHTML = `<b>${clock(G.t)}</b> played · <b>${S.money(rate())}</b>/min<br>Stage <b>${G.stage + 1}</b> · Fame <b>${S.fameLevel(G)}</b> · <b>${G.cooks.length}</b> cooks · <b>${G.couriers.length}</b> couriers`;
    note.textContent = changed ? `Playing with ${changed} value${changed === 1 ? '' : 's'} from the lab, on a playtest save.` : 'Playing the shipped values, on a playtest save.';
  }
  // the lab changed its numbers (in another tab, or this one came back from it): take them and redraw. The room's
  // tables and the delivery zone are laid out when the page loads, so a change to those reloads it (the save is kept)
  const built = () => S.STAGES.map((st) => st.seats).join() + '|' + S.DELIV.radius;
  let was = built();
  function retune() {
    changed = Object.keys(tuning()).length;
    if (built() !== was) { was = built(); save(); location.reload(); return; }
    game.ui.render(); syncMap(); draw();
  }
  addEventListener('storage', (e) => { if (e.key === S.TUNE || e.key === null) retune(); });
  addEventListener('pageshow', (e) => { if (e.persisted) retune(); });
  changed = Object.keys(tuning()).length;
  draw();
  setInterval(draw, 500);
  return { el, retune };
}

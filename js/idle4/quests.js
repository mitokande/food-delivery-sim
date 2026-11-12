// Ferdi's (idle4.html): the quests. One at a time in the bar at the bottom of the screen ("Repair the Staff Room
// (0/1)"); done, it pays out when you claim it, and the next one comes. A hand-made chain that walks you through the
// restaurant, then an endless tail. Pure: reads the rules' state (sim.js), never the DOM.
import * as S from './sim.js';

// k: what is counted. 'item' (room, id: how many / its level), 'lv' (a room's level), 'served' (customers, all
// together), 'tips' (picked up), 'letters' (read), 'staff' (the team), 'menu' (dishes on it), 'threats' (Victor's
// truck driven off by serving fast enough), 'stars' (the best review). room: where the bar takes you ('mail': the
// mailbox, 'events': the events card). cash: the reward.
const Q = (k, n, cash, room, text, o = {}) => ({ k, n, cash, room, text, ...o });
const st = (dish, cash, text) => Q('item', 1, cash, 'kitchen', text, { id: `st:${dish}` });
export const CHAIN = [
  Q('item', 1, 10, 'kitchen', 'Hire a cook', { id: 'cooks' }),
  Q('item', 1, 15, 'dining', 'Hire a waiter', { id: 'waiters' }),
  st('hotdog', 25, 'Build a sausage grill'),
  Q('served', 15, 25, 'dining', 'Serve 15 customers'),
  Q('lv', 1, 50, 'office', 'Fix up Ferdi\'s Office'),
  Q('letters', 1, 20, 'mail', 'Read your mail'),
  Q('lv', 1, 40, 'entrance', 'Repair the Entrance'),
  Q('item', 1, 25, 'entrance', 'Add a waiting bench', { id: 'benches' }),
  Q('tips', 3, 30, 'dining', 'Pick up 3 tips'),
  Q('item', 4, 60, 'dining', 'Have 4 tables in the Dining Hall', { id: 'tables' }),
  Q('lv', 1, 100, 'cashier', 'Repair the Cashier'),
  Q('item', 1, 100, 'cashier', 'Put in a register', { id: 'registers' }),
  Q('item', 3, 80, 'kitchen', 'Upgrade the Grill to Lv 3', { id: 'st:burger' }),
  Q('lv', 1, 150, 'staff', 'Repair the Staff Room'),
  Q('lv', 2, 200, 'dining', 'Renovate the Dining Hall to Lv 2'),
  Q('staff', 6, 200, 'staff', 'Have a team of 6'),
  Q('lv', 2, 250, 'kitchen', 'Renovate the Kitchen to Lv 2'),
  st('doner', 300, 'Put Döner on the menu'),
  Q('lv', 2, 500, 'office', 'Upgrade Ferdi\'s Office to Lv 2'),
  Q('lv', 1, 600, 'terrace', 'Open the Terrace'),
  Q('threats', 1, 700, 'events', 'Drive off Victor\'s food truck'),
  Q('item', 3, 800, 'terrace', 'Have 3 tables on the Terrace', { id: 'tables' }),
  Q('lv', 2, 1000, 'staff', 'Renovate the Staff Room to Lv 2'),
  Q('lv', 2, 1000, 'cashier', 'Renovate the Cashier to Lv 2'),
  Q('served', 500, 1500, 'dining', 'Serve 500 customers'),
  st('pizza', 2000, 'Build a pizza oven'),
  Q('lv', 3, 2500, 'dining', 'Renovate the Dining Hall to Lv 3'),
  Q('lv', 3, 5000, 'office', 'Upgrade Ferdi\'s Office to Lv 3'),
  Q('stars', 4, 5000, 'events', 'Get a 4-star review from a critic'),
  Q('staff', 10, 5000, 'staff', 'Have a team of 10'),
  st('noodle', 6000, 'Put Noodles on the menu'),
  Q('tips', 50, 6000, 'dining', 'Pick up 50 tips'),
  Q('lv', 4, 12000, 'kitchen', 'Renovate the Kitchen to Lv 4'),
  st('fish', 15000, 'Build a fryer'),
  Q('lv', 4, 25000, 'office', 'Upgrade Ferdi\'s Office to Lv 4'),
  Q('lv', 4, 25000, 'staff', 'Renovate the Staff Room to Lv 4'),
  Q('served', 3000, 40000, 'dining', 'Serve 3,000 customers'),
  st('sushi', 50000, 'Open a sushi bar'),
  Q('lv', 5, 60000, 'dining', 'Renovate the Dining Hall to Lv 5'),
  st('icecream', 80000, 'Build an ice cream bar'),
  Q('lv', 5, 120000, 'office', 'Upgrade Ferdi\'s Office to Lv 5'),
];
// after the chain: serve more and more people
function tail(j) {
  const n = 4000 + j * 1500;
  return Q('served', n, Math.round(100000 * Math.pow(1.15, j) / 1000) * 1000, 'dining', `Serve ${n.toLocaleString('en-US')} customers`);
}
export const questAt = (i) => (i < CHAIN.length ? CHAIN[i] : tail(i - CHAIN.length));
export const current = (G) => questAt(G.quest.i);

// → [have, need]
export function progress(G, q = current(G)) {
  let have = 0;
  switch (q.k) {
    case 'item': have = S.lvOf(G, q.room) > 0 ? S.itemOf(G, q.room, q.id) : 0; break;
    case 'lv': have = S.lvOf(G, q.room); break;
    case 'served': have = G.stats.served; break;
    case 'tips': have = G.stats.tips; break;
    case 'letters': have = G.stats.letters; break;
    case 'staff': have = S.staffCount(G); break;
    case 'menu': have = S.menu(G).length; break;
    case 'threats': have = G.stats.threats; break;
    case 'stars': have = G.stats.stars; break;
    default: break;
  }
  return [Math.min(have, q.n), q.n];
}
export const done = (G) => { const [a, b] = progress(G); return a >= b; };
// claim the reward of the quest you're on (if it's done) → the quest, or null
export function claim(G) {
  if (!done(G)) return null;
  const q = current(G);
  G.cash += q.cash; G.quest.i++;
  return q;
}

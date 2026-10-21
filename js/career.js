// Long-term goals: achievements read from the save. Pure (no three.js, no DOM).
import { ACHIEVEMENTS, DISTRICTS, VEHICLES } from './data.js';
import * as St from './state.js';
import { S } from './state.js';

export function achValue(a) {
  switch (a.stat) {
    case 'km': return Math.floor(S.stats.meters / 1000);
    case 'districts': return DISTRICTS.filter((d) => S.districts[d.id]).length;
    case 'stars': return DISTRICTS.filter((d) => St.empRank(d.id).id === 'star').length;
    case 'couriers': return S.fleet.couriers.length;
    case 'vehicles': return VEHICLES.filter((v) => St.owned(v.id) > 0).length;
    default: return S.stats[a.stat] || 0;
  }
}
export const achDone = (a) => !!S.ach[a.id];

// unlock whatever was just reached; rewards are paid at once. Returns the newly unlocked list.
let busy = false;
export function checkAchievements() {
  if (busy) return [];
  busy = true;
  const out = [];
  try {
    for (const a of ACHIEVEMENTS) {
      if (S.ach[a.id] || achValue(a) < a.n) continue;
      S.ach[a.id] = Date.now();
      if (a.paint && !S.unlocked.paints.includes(a.paint)) S.unlocked.paints.push(a.paint);
      if (a.cash) St.earn(a.cash, 'achievement');
      out.push(a);
    }
    if (out.length) St.save();
  } finally { busy = false; }
  return out;
}

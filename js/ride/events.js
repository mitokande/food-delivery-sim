// Random ride events: choice cards and quick-time events. Pure data + a picker.
// effect fields: wait (s the bike stops), time (s added to the order clock), dmg (food damage 0..100),
// heat (+/- food temperature), cash (+/-), tip (multiplier on this order's tip), rating (+/- stars on this order),
// energy (+/-), xp, crash (bool → crash animation), say (toast text), sfx.
// qte: { kind: 'mash' | 'timing' | 'swipe' | 'hold', n / zone / dir, time } — success/fail effects.
import { DPROFILE } from '../data.js';

export const EVENTS = [
  {
    id: 'dog', title: 'A dog is chasing you!', icon: 'ui-dog', sfx: 'dog-bark', where: ['hills', 'oldtown', 'harbor'], w: 3, actor: 'dog',
    text: 'A very excited terrier wants your burger. Tap fast to outrun it!',
    qte: { kind: 'mash', n: 14, time: 3.2 },
    ok: { say: 'Lost him!', xp: 8, energy: -10 }, fail: { say: 'It got a fry. Or five.', dmg: 18, time: 3 },
  },
  {
    id: 'yellow', title: 'Light turning yellow', icon: 'ui-traffic-light', where: ['downtown', 'oldtown', 'harbor'], w: 3, actor: 'light',
    text: 'The junction ahead is about to go red.',
    options: [
      { label: 'Floor it', sub: 'Fast. Risky.', act: 'go', risk: { p: 0.35, bad: { say: 'Flash! Speed camera fine.', cash: -15, sfx: 'camera-shutter' }, good: { say: 'Made it!', time: -3 } } },
      { label: 'Brake', sub: '+4 s', effect: { wait: 4, say: 'Safe and patient.' } },
    ],
  },
  {
    id: 'ketchup', title: 'Customer message', icon: 'ui-package', sfx: 'notif-order', w: 2, needsOrder: true,
    text: '“Hiii could you grab extra ketchup on the way?? 🙏”',
    options: [
      { label: 'Sure!', sub: '+5 s · bigger tip', effect: { wait: 3, time: 2, tip: 1.6, say: 'Ketchup secured.' } },
      { label: 'Ignore', sub: 'no time lost', effect: { tip: 0.8 } },
    ],
  },
  {
    id: 'granny', title: 'Grandma crossing', icon: 'ui-heart', where: ['oldtown', 'hills'], w: 2, spawn: 'ped',
    text: 'A grandma with a shopping trolley is crossing very, very slowly.',
    options: [
      { label: 'Wait & wave', sub: '+5 s · good karma', effect: { wait: 5, rating: 0.3, xp: 10, say: 'She waved back ❤' } },
      { label: 'Honk', sub: 'rude', effect: { wait: 1.5, rating: -0.4, say: 'She shook her umbrella at you.', sfx: 'horn' } },
    ],
  },
  {
    id: 'roadworks', title: 'Road works ahead', icon: 'ui-wrench', where: ['downtown', 'harbor', 'oldtown'], w: 2, actor: 'works', pre: 15,
    text: 'The lane is closed. A worker shrugs at you.',
    options: [
      { label: 'Sidewalk!', sub: 'quick but bumpy', act: 'sidewalk', effect: { dmg: 12, time: 1, say: 'Bumpity bump.' } },
      { label: 'Wait for the gap', sub: '+6 s', effect: { wait: 6 } },
    ],
  },
  {
    id: 'door', title: 'Car door!', icon: 'ui-overtake', where: ['downtown', 'oldtown'], w: 2, actor: 'door', pre: 8,
    text: 'A parked car door swings open! Swipe to dodge!',
    qte: { kind: 'swipe', dir: 'left', time: 1.4 },
    ok: { say: 'Dodged!', xp: 10 }, fail: { say: 'Ouch. Sorry, sir!', crash: true, dmg: 22, time: 3 },
  },
  {
    id: 'ball', title: 'Ball on the road!', icon: 'ui-jump', where: ['hills', 'oldtown'], w: 2, actor: 'ball',
    text: 'A football bounces into the street. Hop over it!',
    qte: { kind: 'swipe', dir: 'up', time: 1.3 },
    ok: { say: 'Nice hop!', xp: 10, energy: 15 }, fail: { say: 'Boing.', dmg: 14 },
  },
  {
    id: 'stall', title: 'Engine stalled!', icon: 'ui-wrench', sfx: 'engine-stall', w: 4, breakdown: true, actor: 'stall',
    text: 'The Rust Bucket coughs and dies. Kick-start it — tap when the needle is in the green!',
    qte: { kind: 'timing', zone: [0.62, 0.8], time: 4.5, tries: 3 },
    ok: { say: 'Vroom! Back in business.', sfx: 'engine-start' }, fail: { say: 'Pushed it for a while…', wait: 6, energy: -20 },
  },
  {
    id: 'flat', title: 'Flat tyre!', icon: 'ui-wrench', sfx: 'tire-pop', w: 2, breakdown: true, actor: 'flat',
    text: 'Pssssht. Pump it back up — tap as fast as you can!',
    qte: { kind: 'mash', n: 18, time: 4.5, sfx: 'pump' },
    ok: { say: 'Good as new (ish).', wait: 1.5 }, fail: { say: 'Wobbly ride to go.', wait: 4, dmg: 10 },
  },
  {
    id: 'rival', title: 'Rival courier!', icon: 'ui-nitro', where: ['downtown', 'harbor'], w: 2, minLvl: 3, actor: 'rival',
    text: 'A courier in a green jacket revs next to you. “Race you to the next corner?”',
    options: [
      { label: 'Race!', sub: 'mash to win', act: 'race', qte: { kind: 'mash', n: 16, time: 3 }, ok: { say: 'You win! +$10', cash: 10, xp: 15, time: -3 }, fail: { say: 'He smirks and zooms off.', energy: -20 } },
      { label: 'Nah', sub: 'stay cool', effect: {} },
    ],
  },
  {
    id: 'rain', title: 'It starts to rain', icon: 'ui-rain', sfx: 'rain-start', w: 2, minLvl: 2, actor: 'rain', dry: true,
    text: 'Big fat drops. The road is getting slippery.',
    options: [
      { label: 'Slow down', sub: 'safe · +4 s', effect: { wait: 0, time: 4, say: 'Steady wins.' } },
      { label: 'Keep it fast', sub: 'risk a slide', risk: { p: 0.45, bad: { say: 'Wheee— whoops.', dmg: 20, crash: true }, good: { say: 'Smooth!', xp: 10 } } },
    ],
  },
  {
    id: 'police', title: 'Police check', icon: 'ui-police', sfx: 'siren-short', where: ['downtown', 'harbor'], w: 1, minLvl: 3, actor: 'police', pre: 16,
    text: '“License and registration, please.” The officer eyes your box.',
    options: [
      { label: 'Smile & hand over', sub: '+6 s', effect: { wait: 6, say: '“Drive safe.”' } },
      { label: 'Offer a fry', sub: 'cheeky', risk: { p: 0.5, bad: { say: 'Not amused. $20 fine.', cash: -20, wait: 6 }, good: { say: '“…Carry on.” He took two.', wait: 2, dmg: 8 } } },
    ],
  },
  {
    id: 'fan', title: 'A fan spotted you!', icon: 'ui-star', sfx: 'camera-shutter', w: 1, minLvl: 4,
    text: '“OMG are you the 5-star courier from the app?!” They want a selfie.',
    options: [
      { label: 'Selfie!', sub: '+3 s · fame', effect: { wait: 3, xp: 20, rating: 0.2, say: 'Posted. 1.2k likes.' } },
      { label: 'Sorry, hot food!', sub: 'keep going', effect: {} },
    ],
  },
  {
    id: 'pigeons', title: 'Pigeons!', icon: 'ui-horn', where: ['oldtown', 'downtown'], w: 2, actor: 'birds', pre: 10,
    text: 'A whole squad of pigeons is having a meeting on the road. Hold the horn!',
    qte: { kind: 'hold', time: 2.5, need: 1.1, sfx: 'horn' },
    ok: { say: 'Flap flap flap!' }, fail: { say: 'They did not move. You did.', wait: 3 },
  },
  {
    id: 'shortcutTip', title: 'Local tip', icon: 'ui-shortcut', w: 1, needsSkill: 'navigation',
    text: 'A street vendor yells: “Through the market is faster!”',
    options: [
      { label: 'Trust him', sub: 'maybe -6 s', risk: { p: 0.3, bad: { say: 'It was closed. +5 s', time: 5 }, good: { say: 'He was right!', time: -6, xp: 8 } } },
      { label: 'Stick to GPS', sub: '', effect: {} },
    ],
  },
  {
    id: 'soup', title: 'Lid is loose!', icon: 'ui-package', w: 2, needsFood: ['noodle', 'coffee'],
    text: 'You hear sloshing from the box. Balance it — hold steady!',
    qte: { kind: 'hold', time: 3, need: 1.8 },
    ok: { say: 'Not a drop spilled.', xp: 10 }, fail: { say: 'Some… spilled.', dmg: 20 },
  },
  {
    id: 'melt', title: 'It is hot today', icon: 'ui-sun', w: 2, needsFood: ['icecream'], minClock: 11 * 60, maxClock: 18 * 60,
    text: 'The ice cream is sweating. Use your turbo to get there faster?',
    options: [
      { label: 'Turbo!', sub: 'uses energy', effect: { energy: -35, time: -4, heat: 10, say: 'Brain freeze speed!' } },
      { label: 'It will be fine', sub: '', effect: { heat: -15 } },
    ],
  },
];
export const EVENT = Object.fromEntries(EVENTS.map((e) => [e.id, e]));

export function pickEvent(rng, ctx) {
  const c = EVENTS.filter((e) => {
    if (e.where && !e.where.includes(ctx.district)) return false;
    if (e.minLvl && ctx.lvl < e.minLvl) return false;
    if (e.needsOrder && !ctx.hasFood) return false;
    if (e.needsFood && !e.needsFood.some((f) => ctx.foods.includes(f))) return false;
    if (e.needsSkill && !ctx.skills[e.needsSkill]) return false;
    if (e.breakdown && !(rng() < ctx.breakdown * 2.5)) return false;
    if (e.minClock && (ctx.clock < e.minClock || ctx.clock > e.maxClock)) return false;
    if (e.dry && ctx.raining) return false;
    if (ctx.recent.includes(e.id)) return false;
    return true;
  });
  if (!c.length) return null;
  // each district has its usual suspects (dogs in the hills, police downtown…)
  const mult = DPROFILE[ctx.district]?.evW || {};
  const w = (e) => e.w * (mult[e.id] ?? 1);
  let t = 0; for (const e of c) t += w(e); let r = rng() * t;
  for (const e of c) { r -= w(e); if (r <= 0) return e; }
  return c[c.length - 1];
}

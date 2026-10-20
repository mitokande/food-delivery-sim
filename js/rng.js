// Small seeded RNG helpers.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export const pick = (rng, arr) => arr[Math.floor(rng() * arr.length)];
export const range = (rng, a, b) => a + rng() * (b - a);
export const irange = (rng, a, b) => a + Math.floor(rng() * (b - a + 1));
export function weighted(rng, entries) { // [[item, weight], ...]
  let t = 0; for (const [, w] of entries) t += w;
  let r = rng() * t;
  for (const [it, w] of entries) { r -= w; if (r <= 0) return it; }
  return entries[entries.length - 1][0];
}
export function shuffle(rng, arr) {
  for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; }
  return arr;
}

// Ferdi's (idle4.html): the gem packs, bought with real money through Adapty in the store apps. The products come from
// the paywall at the placement PLACEMENT (Adapty dashboard); each pack's id is its store product id, the same in App
// Store Connect, the Play Console and Adapty. Until those exist (or on the web, which has no store) the shop shows the
// packs without a price; ?iap=test makes every purchase succeed for free, to try the shop. The rewarded ads: no ad
// network yet, so on the web a stand-in plays (ui.js) and in the store apps the offers stay hidden.
import { adapty, app } from '../native.js';

export const PLACEMENT = 'ferdis_shop';
export const PACKS = [
  { id: 'ferdis_gems_80', gems: 80, usd: 0.99 },
  { id: 'ferdis_gems_500', gems: 500, usd: 4.99, tag: 'Popular' },
  { id: 'ferdis_gems_1200', gems: 1200, usd: 9.99 },
  { id: 'ferdis_gems_2600', gems: 2600, usd: 19.99 },
  { id: 'ferdis_gems_7000', gems: 7000, usd: 49.99, tag: 'Best value' },
];
// once only: gems and two hours of income
export const STARTER = { id: 'ferdis_starter', gems: 300, cashMin: 120, usd: 1.99, once: true };
export const packOf = (id) => (id === STARTER.id ? STARTER : PACKS.find((p) => p.id === id));

const q = new URLSearchParams(location.search);
export const testMode = q.get('iap') === 'test';
// rewarded ads: offered at all? (the web's stand-in; nothing in the apps until a network is in)
export const adsOn = !app;
export const AD_MS = Math.max(300, +(q.get('adms') || 5000)); // (how long the stand-in plays; the tests shorten it)

// the store's products, by id (null: no store here, or they couldn't be loaded; asked again next time)
let loading = null;
export function products() {
  if (testMode) return Promise.resolve(new Map());
  if (!adapty) return Promise.resolve(null);
  loading ||= (async () => {
    const a = await adapty;
    if (!a) return null;
    const flow = await a.getFlow({ placementId: PLACEMENT });
    const list = await a.getPaywallProducts({ flow });
    return new Map(list.map((p) => [p.vendorProductId, p]));
  })().catch((e) => { console.warn('store:', e); loading = null; return null; });
  return loading;
}
// a pack's price as the store shows it ("$4.99", "₺189,99"), or null
export async function priceOf(id) {
  if (testMode) return `$${packOf(id)?.usd}`;
  const m = await products();
  return m?.get(id)?.price?.localizedString || null;
}
// buying a pack → 'success' | 'cancelled' | 'pending' | 'unavailable' | 'error' (only 'success' gives the gems)
export async function buy(id) {
  if (testMode) return 'success';
  try {
    const m = await products(), p = m?.get(id);
    if (!p) return 'unavailable';
    const a = await adapty;
    const r = await a.makePurchase({ product: p });
    return r.type === 'success' ? 'success' : r.type === 'user_cancelled' ? 'cancelled' : 'pending';
  } catch (e) { console.warn('store: buy', e); return 'error'; }
}

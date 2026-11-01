// The store apps (mobile/, Capacitor) run this same game from files on the phone. This is the little they need on
// top: the phone's own haptics (iOS has no navigator.vibrate), the Android back button, a second copy of the
// career, the site's address and the in-app purchase SDK. On the web `app` is null and nothing here loads;
// @capacitor/core and @adapty/capacitor are only in the apps' import map.
const cap = globalThis.Capacitor;
export const app = cap?.isNativePlatform?.() ? cap.getPlatform() : null; // 'android' | 'ios' | null
export const SITE = 'https://mithatck.com/food-delivery-sim/';

const plugins = app ? import('@capacitor/core').then(({ registerPlugin }) => ({
  Haptics: registerPlugin('Haptics'), App: registerPlugin('App'), Preferences: registerPlugin('Preferences') })) : null;

// a navigator.vibrate pattern as the phone's taps: a single buzz is a light / medium / heavy impact, a pattern a crash
export function vibrate(pattern) {
  plugins?.then(({ Haptics }) => (Array.isArray(pattern) ? Haptics.notification({ type: 'ERROR' })
    : Haptics.impact({ style: pattern < 15 ? 'LIGHT' : pattern < 35 ? 'MEDIUM' : 'HEAVY' }))).catch(() => { /* no haptics */ });
}

// iOS may empty a web view's storage when the phone runs short of space: the apps also keep the save in their own
// preferences (keep; null drops it) and put it back before the game loads it (restore)
export function keep(key, value) {
  plugins?.then(({ Preferences }) => (value == null ? Preferences.remove({ key }) : Preferences.set({ key, value }))).catch(() => { /* not kept */ });
}
export async function restore(key) {
  if (!plugins) return;
  try {
    if (localStorage.getItem(key)) return;
    const { value } = await (await plugins).Preferences.get({ key });
    if (value) localStorage.setItem(key, value);
  } catch { /* nothing kept */ }
}

// Android's back: closes the card on top the way its own close / cancel would; with none, the game may take it (an
// 'appback' event it cancels: in a ride, the pause menu), else it goes to the background (it saves when hidden)
// instead of quitting
plugins?.then(({ App }) => App.addListener('backButton', () => {
  const m = [...document.querySelectorAll('#modals .modal:not(.out)')].pop();
  if (m?.dataset.dismiss != null) return m.click();
  const b = m?.querySelector('[data-x="close"], [data-x="cancel"]');
  if (b) return b.click();
  if (!m && dispatchEvent(new Event('appback', { cancelable: true }))) App.minimizeApp();
})).catch(() => { /* no App plugin */ });

// In-app purchases go through Adapty, activated once at launch; `adapty` resolves to the ready SDK, or null. The key is
// the app's Public SDK key (Adapty dashboard → App settings → General → API keys), which ships inside the app anyway.
// Emptied, the SDK stays in the apps but never starts, so nothing reaches Adapty.
const ADAPTY_KEY = 'public_live_E7wjUVcL.eLd0terUotkYycyN61yC';
export const adapty = app && ADAPTY_KEY ? import('@adapty/capacitor').then(async ({ adapty }) => {
  // verbose (Xcode / Logcat only) is what Adapty asks for until the first release is out. The SDK stays activated
  // natively when the game reloads its page (a career import or wipe, the tutorial replay); the __ flag skips that
  // second activate instead of failing it. No advertising IDs (IDFA, Google's Advertising ID): the game has no ads or
  // attribution, and the privacy page and store forms say so (the Android manifest also drops Adapty's AD_ID permission)
  await adapty.activate({ apiKey: ADAPTY_KEY, params: { logLevel: 'verbose', __ignoreActivationOnFastRefresh: true,
    ios: { idfaCollectionDisabled: true }, android: { adIdCollectionDisabled: true } } });
  return adapty;
}).catch((e) => { console.warn('adapty:', e); return null; }) : null;

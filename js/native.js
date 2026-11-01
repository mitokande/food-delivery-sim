// The store apps (mobile/, Capacitor) run this same game from files on the phone. This is the little they need on
// top: the phone's own haptics (iOS has no navigator.vibrate), the Android back button, a second copy of the
// career and the site's address. On the web `app` is null and nothing here loads; @capacitor/core is only in the
// apps' import map.
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

// Short vibrations on Android (iOS Safari has no Vibration API). Off when the player turns haptics off.
import { S } from './state.js';
let last = 0;
export function buzz(pattern) {
  if (!S.settings.haptics || !navigator.vibrate) return;
  const now = performance.now();
  if (now - last < 60) return; // don't stack buzzes every frame
  last = now;
  try { navigator.vibrate(pattern); } catch { /* not allowed before a user gesture */ }
}

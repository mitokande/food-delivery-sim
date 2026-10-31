# Store apps (Android + iOS)

The web game wrapped as native apps with [Capacitor 8](https://capacitorjs.com). The game itself stays where it is
(`../index.html`, `../js`, `../css`, `../assets`); nothing here is a second copy to maintain.

- `scripts/build-web.mjs` builds `www/` (not in git): the game's files, with what the site loads from CDNs (three.js
  and its addons, the Draco decoder, es-module-shims, the Google fonts in `fonts/`) taken from `node_modules` instead,
  so the apps start and play offline. It stops if anything would still come from a CDN, or if the game moved to a
  three.js version this folder doesn't have.
- `../js/native.js` is the game's only app-specific code: haptics through the phone (iOS has no `navigator.vibrate`),
  the Android back button (closes the top card, else sends the game to the background), a second copy of the save in
  the app's own preferences (put back if the web view's storage is ever emptied), and the site's address for analytics.
  On the web it does nothing.
- `android/`, `ios/` are the native projects (in git). The app id is `com.mitokande.fooddeliverysim`; the home-screen
  name is "Delivery Sim" (`android/app/src/main/res/values/strings.xml`, `CFBundleDisplayName` in `ios/App/App/Info.plist`).
- This folder is in the web root, so `.htaccess` keeps it off the site.

Settings: portrait only, full screen (the status / navigation bars only show on a swipe from the edge), iPhone only
(it still runs on iPads in iPhone mode), Android 7+ (API 24), iOS 15+.

## Day to day

Needs Node 22. Android also needs JDK 21 and the Android SDK (platform 36); iOS needs a Mac with a current Xcode.

```sh
cd mobile
npm ci
npm run android          # build www/ from the game, copy it into android/
npm run ios              # same for ios/ (on the Mac)
npx cap open android     # or: npx cap open ios
```

Any change to the game reaches the apps only through a new build. The site updates the moment a file changes;
store users keep the version they installed until the next release.

Debug builds can be inspected from desktop Chrome (`chrome://inspect`, Android) or Safari's Develop menu (iOS).
A quick Android check without Android Studio:

```sh
cd mobile/android && ./gradlew assembleDebug      # app/build/outputs/apk/debug/app-debug.apk
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

## Releasing

Before each release, raise the version in both projects:

- Android: `versionCode` (+1 every upload) and `versionName` in `android/app/build.gradle`
- iOS: `MARKETING_VERSION` (e.g. 1.0.1) and `CURRENT_PROJECT_VERSION` (+1 every upload) in Xcode → target App → General

### Google Play

1. Once: make an upload key and keep it (and its passwords) somewhere safe, **outside** the repo and the web root.
   Play App Signing holds the real signing key; this upload key can be reset through Play support if it's lost.

   ```sh
   keytool -genkeypair -v -keystore ~/fds-upload.jks -alias upload -keyalg RSA -keysize 2048 -validity 10000
   ```

   Then write `android/keystore.properties` (git ignores it):

   ```properties
   storeFile=/home/you/fds-upload.jks
   storePassword=...
   keyAlias=upload
   keyPassword=...
   ```

2. `npm run android`, then `cd android && ./gradlew bundleRelease` →
   `app/build/outputs/bundle/release/app-release.aab`.
3. Upload it in Play Console (start with *Internal testing*). New personal developer accounts must run a closed test
   with at least 12 testers for 14 days before production.

### App Store

1. On the Mac: `git pull`, then `cd mobile && npm ci && npm run ios && npx cap open ios`.
2. In Xcode: target App → Signing & Capabilities → choose your team (automatic signing).
3. Product → Archive, then Distribute App → App Store Connect. Test it with TestFlight, then submit.

`Info.plist` already sets `ITSAppUsesNonExemptEncryption = NO` (HTTPS only), so there are no export-compliance
questions. `ios/App/App/PrivacyInfo.xcprivacy` declares the UserDefaults use (the save copy) and what analytics collects.

## Store listing checklist

- **Privacy policy URL**: both stores require one, because the game sends analytics (anonymous gameplay events, error
  reports, device model / OS / screen, the IP address; see `js/analytics.js` and `api/`). It needs a page on the site.
- **Play Data safety / App Store privacy**: app activity (gameplay interactions), app info and performance (crash logs,
  diagnostics), device or other IDs (a random per-install id). Not linked to the player's identity, no tracking, no ads
  SDK, nothing shared with third parties. Data is encrypted in transit.
- **Content rating**: cartoon scooter crashes, no blood, no purchases with real money (yet), no chat.
- **Screenshots**: Play needs 2–8 phone screenshots and a 1024×500 feature graphic. The App Store needs 6.9" iPhone
  screenshots (1320×2868). The headless tools in `../tools/` (`shot.mjs`, `play.mjs`) can make them at any size.
- **Name / description**: the store name can be the full "Food Delivery Simulator"; the home-screen label stays short.

## Icon and splash

The icon is the courier on the red Vespetta, rendered in Blender by the game's vehicle pipeline. It sits on the boot
screen's sunset gradient, with the logo's ink outline. To remake it:

```sh
blender -b --factory-startup -P tools/blender/vehicles_render.py -- --mode appicon --only vespetta --samples 128 --out /tmp/fds-app
python3 mobile/scripts/icon.py /tmp/fds-app/app-vespetta.png     # writes mobile/assets/*.png
cd mobile && npm run assets                                      # every Android / iOS size and splash
```

To use your own art instead, replace the PNGs in `assets/` (icon-only 1024², icon-foreground / icon-background 1024²,
splash 2732²) and run `npm run assets`.

## Fonts

`fonts/` holds Fredoka and Lilita One (SIL OFL 1.1, licenses alongside), exactly the files Google Fonts serves the site.
If `index.html` ever asks Google Fonts for other families or weights, fetch that stylesheet with a modern browser's
user agent, download its `woff2` files here and point `fonts.css` at them.

# Store apps (Android + iOS)

The web game wrapped as native apps with [Capacitor 8](https://capacitorjs.com). The apps are **Idle Restaurant Manager**, the
idle restaurant manager (`../idle3.html`, which becomes the apps' `index.html`); the courier game (`../index.html`) and
the earlier idle prototypes are on the site only. The game itself stays where it is (`../idle3.html`, `../js`, `../css`,
`../assets`); nothing here is a second copy to maintain.

- `scripts/build-web.mjs` builds `www/` (not in git): the game's files, with what the site loads from CDNs (three.js
  and its addons, the Draco decoder, es-module-shims, the Google fonts in `fonts/`) taken from `node_modules` instead,
  so the apps start and play offline. It stops if anything would still come from a CDN, if the page names a file
  that isn't in `www/`, or if the game moved to a three.js version this folder doesn't have. To ship another page,
  change `PAGE` (and `GAME` / `NOT`) at its top.
- `../js/native.js` is the game's only app-specific code: haptics through the phone (iOS has no `navigator.vibrate`),
  the Android back button (closes the top card, then the open sheet, then the city map, else sends the game to the
  background), a second copy of the save (`fds_idle3_v2`) in the app's own preferences (put back if the web view's
  storage is ever emptied), and the in-app purchase SDK ([below](#in-app-purchases-adapty)). On the web it does
  nothing. In the apps the diner's Settings have a Vibration switch and no link to the courier game.
- `android/`, `ios/` are the native projects (in git). The app id is `com.mithatcanturan.fooddeliverysim`; the home-screen
  name is "Idle Restaurant Manager" (iOS shortens a label this long on the home screen; `android/app/src/main/res/values/strings.xml`, `CFBundleDisplayName` in `ios/App/App/Info.plist`).
- This folder is in the web root, so `.htaccess` keeps it off the site.

Settings: portrait only, full screen (the status / navigation bars only show on a swipe from the edge), iPhone only
(it still runs on iPads in iPhone mode), Android 7+ (API 24), iOS 15+.

## Day to day

Needs Node 22. Android also needs JDK 21 and the Android SDK (platform 36); iOS needs a Mac with Xcode 26 or later
(Adapty's iOS SDK is built with Swift 6.2).

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

- **Idle Restaurant Manager sends no analytics** (`js/analytics.js` is the courier game's and never loads in the apps): from
  the list below only Adapty's part applies now. The privacy page and `PrivacyInfo.xcprivacy` still describe the
  courier game's analytics, which overstates what the apps collect; trim them and the store forms together before a
  release, or leave them if analytics is coming to the diner.
- **Privacy policy URL**: `https://mithatck.com/food-delivery-sim/privacy/` (`../privacy/index.html`, English and
  Turkish). Both stores require one, because the game sends analytics (`js/analytics.js`, `api/`). The page, the forms
  below and `PrivacyInfo.xcprivacy` must say the same thing: change them together.
- **Play Data safety / App Store privacy**, all of it *not linked to the player's identity*, no tracking, no ads SDK,
  no advertising ID, encrypted in transit. Adapty is a service provider (processor), so nothing counts as *shared*:
  - personal info: name (the optional courier name typed in the intro)
  - device or other IDs: the random per-install player id, and Adapty's per-install id (+ IDFV on iOS)
    — purposes analytics and app functionality
  - financial info (Play) / purchases (App Store): purchase history, through Adapty — app functionality, analytics
  - app activity: gameplay interactions (and Adapty's app opens / purchase screens)
  - app info and performance: crash logs, diagnostics, performance (load time, frame rate)
  - the game's own analytics is collected by default and the player can turn it off in Settings → Share play data;
    Adapty's is required (purchases need it). Deletion: by email with the Player ID that Settings shows
    (`php api/cli.php forget <id>`), or for Adapty the store order number (delete the profile in Adapty's dashboard);
    IPs go after 30 days, the rest 2 years after the last visit.
  - Play also asks whether the app uses an advertising ID: **no**. The manifest removes the `AD_ID` permission
    Adapty's SDK asks for, and `js/native.js` turns IDFA / Advertising ID collection off. Keep both if that changes.
- **Content rating**: cartoon scooter crashes, no blood, no chat. No purchases with real money *yet*: Adapty is in,
  but switch the answers (Play: in-app purchases; IARC: digital purchases; App Store: in-app purchases) once the first
  product is on sale.
- **Screenshots**: Play needs 2–8 phone screenshots and a 1024×500 feature graphic. The App Store needs 6.9" iPhone
  screenshots (1320×2868). The headless tools in `../tools/` (`shot.mjs`, `play.mjs`) can make them at any size.
- **Name / description**: "Idle Restaurant Manager" in the stores and on the home screen.

## In-app purchases (Adapty)

The apps carry [Adapty's Capacitor SDK](https://adapty.io/docs/sdk-installation-capacitor) (`@adapty/capacitor`, pinned
like every other package here; raise it with `npm i -E @adapty/capacitor@x.y.z`, then `npm run sync`).

- The game has no bundler, so `build-web.mjs` turns the SDK's one-file build into `www/vendor/adapty-capacitor.js` and
  maps `@adapty/capacitor` to it. Game code imports it the way Adapty's docs show (`import { adapty } from
  '@adapty/capacitor'`), from `../js/native.js` or behind its `app` check, never on the web.
- `../js/native.js` activates it once at launch and exports `adapty`, a promise of the ready SDK (null on the web, on
  failure, or with no key). Wait for it before any other Adapty call.
- `ADAPTY_KEY` there is the app's **Public SDK key** (Adapty dashboard → App settings → General → API keys; it is not a
  secret). With it the apps send purchase and device data to Adapty: the privacy page has a section on it and the
  store forms above list it. Emptied, the SDK ships but never starts.
- Android: `MainActivity` is `singleTop`, not Capacitor's default `singleTask`, which would close Google Play's purchase
  sheet when the player leaves mid-purchase and comes back from the icon.
- iOS: Adapty supports Swift Package Manager only, which `ios/` already uses (`CapApp-SPM`). After an SDK change, run
  `npm run ios` on the Mac and let Xcode resolve packages, then commit the updated `Package.resolved`.

## Icon and splash

The icon is Idle Restaurant Manager's (below). Before it, it was the courier on the red Vespetta, rendered in Blender by the
game's vehicle pipeline, on the boot screen's sunset gradient with the logo's ink outline. To make that one again:

```sh
blender -b --factory-startup -P tools/blender/vehicles_render.py -- --mode appicon --only vespetta --samples 128 --out /tmp/fds-app
python3 mobile/scripts/icon.py /tmp/fds-app/app-vespetta.png     # writes mobile/assets/*.png
cd mobile && npm run assets                                      # every Android / iOS size and splash
```

The Idle Restaurant Manager icon, the one in the apps now (a smash burger in a chef hat under the diner's awning), is AI-generated
like the story art (OpenAI `gpt-image-2.6-flare`, 2026-11-09; `tools/genart.mjs`, entry `app-icon`: only the subject, on
a transparent background) and goes on the same gradient. `npm run assets` also reflows `AndroidManifest.xml`'s first
line; `git checkout` that file afterwards:

```sh
OPENAI_API_KEY=… node tools/genart.mjs /tmp/fds-art app-icon
node mobile/scripts/icon-diner.mjs /tmp/fds-art/app-icon.png     # writes mobile/assets/*.png
cd mobile && npm run assets
```

To use your own art instead, replace the PNGs in `assets/` (icon-only 1024², icon-foreground / icon-background 1024²,
splash 2732²) and run `npm run assets`.

## Fonts

`fonts/` holds Fredoka and Lilita One (SIL OFL 1.1, licenses alongside), exactly the files Google Fonts serves the site.
If `idle3.html` ever asks Google Fonts for other families or weights, fetch that stylesheet with a modern browser's
user agent, download its `woff2` files here and point `fonts.css` at them.

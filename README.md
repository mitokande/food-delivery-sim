# Food Delivery Simulator

A mobile-first 3D food-delivery game for the web, built with three.js (no build step).
Start broke on a junk scooter in **Saffron Bay**, deliver orders, upgrade your ride and yourself,
get hired in better districts, and grow your own courier fleet.

**Play:** https://mithatck.com/food-delivery-sim/

- **Courier run** — on phones the road rides itself (pace, corners, the door) and the busy traffic is yours: hold the BRAKE pedal for the car in front, people crossing and red lights, swipe left / right to slip between the cars (the oncoming lane or the sidewalk), swipe up to hop potholes; grab the coins, keep the food in one piece, and react to random events.
- **Keep riding** — pickups and hand-overs play out at the bike by themselves, and the receipt offers an order near the customer's door: "Collect & ride on" (1 ⚡) starts it right there, no trip back to the hub.
- **Free riding on desktop** — steer anywhere in the city with the keyboard (W/S gas, brake and reverse, A/D steer); walls, poles, cars and people are solid, the GPS re-plans when you take another street, and you stop in the ring at the door.
- **Progression** — 6 vehicles with 4 upgradeable parts and paint, 5 courier skills, 4 districts to unlock, day/night cycle with rush hours.
- **Coming back** — on the real calendar: three daily goals that renew at local midnight, a daily gift that grows over a 7-day streak, weekly contracts that renew on Monday.
- **Energy** — every order costs 1 ⚡ at Start; it refills one every 6 minutes (even while the game is closed), a level-up fills the tank, daily goals, the daily gift and coffee top it up.
- **Fleet** — rent a dispatch office, hire freelance couriers who ride around the city and earn money even while you're away.

## Idle + manager prototype

`idle.html` is the same city as a full idle tycoon: you run Saffron Bay Delivery Co., restaurants cook batches and your couriers
carry them (too few couriers and the food goes cold), managers automate districts and earn offline, deals multiply, a franchise
resets the city for Stars. Its own save (`fds_idle_v1`), no analytics. Design and balance notes: DOCS.md §11.

`idle2.html` is **Hot Chain**, phase 1 of the redesigned idle game: one 15-minute business day in Old Town where orders flow
kitchen → shelf → courier → door and cool down on the way; hot deliveries earn the day's stars. Its own save (`fds_idle2_v1`),
no analytics. Notes and balance: DOCS.md §12.

`idle3.html` is **Idle Restaurant Manager**: your distant uncle left you a run-down diner and an old
scooter, and all you can cook is a smash burger. Customers take a table and order; tap COOK to cook an order yourself, hire
cooks (each brings a new dish to the menu) and couriers, level their skills and motors, and expand the place in five
stages, from the run-down diner to a grand two-building restaurant. You watch it from the inside (customers walk in, sit
and eat, the cooks work the stations of their dishes); the Map button shows the city, where the building is rebuilt
for each stage and the couriers ride. The staff keep the
place running while the game is closed (up to 2 hours, shown on a "while you were away" card). Its own save
(`fds_idle3_v2`), no analytics. It is the game the store apps ship (below). The story and stage art in `assets/story/` is AI-generated (`tools/genart.mjs`). Notes and
balance: DOCS.md §13.

## Run locally

Any static file server works, e.g. `npx serve .` or `python3 -m http.server`, then open `index.html`.
Useful URL flags: `?fps` (frame-rate meter), `?clock=1260` (sky time), `?noti` (skip the welcome card), `?energy=off` (orders cost no energy),
`?an=dev` (mark this device as the developer's so it stays out of the analytics; `?an=off` / `?an=on`),
`?ctl=b` / `?ctl=a` / `?ctl=stop` / `?ctl=run` (other ways to ride, for QA: `b` the brake — gas always on, hold anywhere
to brake for corners, lights and the door (the phone's ride before the courier run); `a` the lane run — hold to brake,
swipe to change lane; `stop` the earlier autopilot with turbo, hop and a STOP button; `run` the courier run on a keyboard
too; it sticks to the device until `?ctl=off`).

## Store apps

`mobile/` wraps **Idle Restaurant Manager** (`idle3.html`) as Android and iOS apps with Capacitor: the same files, bundled to play
offline, plus native haptics, the Android back button and a backup of the save. Build and release steps: [mobile/README.md](mobile/README.md).

## Analytics

The game reports gameplay events (with the session's IP address and device) to `api/collect.php` (PHP + SQLite); the password-protected panel is at `admin/`.
Server setup: `php api/cli.php init <data dir outside the web root>` writes `api/config.local.php` and prints the panel password.
Locally: `php -S 127.0.0.1:8000` from the repo root (static server alone has no backend; events are then simply dropped).
What players are told is `privacy/` (the privacy policy, also the stores' privacy URL); players can turn sending off in
Settings. IPs are cleared after 30 days and players gone for 2 years are deleted (`housekeep()` in `api/lib.php`);
a deletion request: `php api/cli.php forget <player id from Settings>`.

## Project layout

- `js/` — game code (ES modules): `main.js` boot + loop, `city/` generator, roads, traffic, `ride/` delivery ride, `ui/` interface.
- `assets/` — packed models, icons, audio (all CC0 or made for this project, see `CREDITS.md`); `assets/src/kenney/` holds the source kits.
- `tools/` — asset build scripts (Blender, gltf-transform, audio) and headless test tools (`play.mjs`, `sweep.mjs`, `tabs.mjs`).
- `api/`, `admin/` — analytics collector and admin panel (PHP 8 + SQLite, no dependencies).
- `privacy/` — the privacy policy page (English + Turkish).
- `mobile/` — the store apps (Capacitor 8 project; `js/native.js` is the game's side of it).
- `DOCS.md` — design document and code map (Turkish).
- `design/ad-research.md` — ad research: competitor ad teardowns, idle ad formats, ideas for our own ads (Turkish).

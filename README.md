# Food Delivery Simulator

A mobile-first 3D food-delivery game for the web, built with three.js (no build step).
Start broke on a junk scooter in **Saffron Bay**, deliver orders, upgrade your ride and yourself,
get hired in better districts, and grow your own courier fleet.

**Play:** https://mithatck.com/food-delivery-sim/

- **One-touch deliveries** — on phones the scooter steers itself and the gas is always on; you hold anywhere to brake for corners, red lights, people crossing, potholes and the door (brake late for perfect corners and stops, catch the green without stopping), swipe at a junction to take another street, and react to random events.
- **Free riding on desktop** — steer anywhere in the city with the keyboard (W/S gas, brake and reverse, A/D steer); walls, poles, cars and people are solid, the GPS re-plans when you take another street, and you stop in the ring at the door.
- **Progression** — 6 vehicles with 4 upgradeable parts and paint, 5 courier skills, 4 districts to unlock, daily goals, day/night cycle with rush hours.
- **Energy** — every order costs 1 ⚡ at Start; it refills one every 6 minutes (even while the game is closed), a level-up fills the tank, daily goals and coffee top it up.
- **Fleet** — rent a dispatch office, hire freelance couriers who ride around the city and earn money even while you're away.

## Run locally

Any static file server works, e.g. `npx serve .` or `python3 -m http.server`, then open `index.html`.
Useful URL flags: `?fps` (frame-rate meter), `?clock=1260` (sky time), `?noti` (skip the welcome card), `?energy=off` (orders cost no energy),
`?an=dev` (mark this device as the developer's so it stays out of the analytics; `?an=off` / `?an=on`),
`?ctl=run` / `?ctl=a` / `?ctl=b` / `?ctl=stop` (other ways to ride, for QA: `run` the courier run — the road rides itself,
the busy traffic is yours: a BRAKE button, left / right a lane, up a hop, coins in the lanes, the food is the life bar;
`a` the lane run — hold to brake, swipe to change lane;
`b` the phone's brake on a keyboard too; `stop` the earlier autopilot with turbo, hop and a STOP button; it sticks to the
device until `?ctl=off`).

## Analytics

The game reports gameplay events (with the session's IP address and device) to `api/collect.php` (PHP + SQLite); the password-protected panel is at `admin/`.
Server setup: `php api/cli.php init <data dir outside the web root>` writes `api/config.local.php` and prints the panel password.
Locally: `php -S 127.0.0.1:8000` from the repo root (static server alone has no backend; events are then simply dropped).

## Project layout

- `js/` — game code (ES modules): `main.js` boot + loop, `city/` generator, roads, traffic, `ride/` delivery ride, `ui/` interface.
- `assets/` — packed models, icons, audio (all CC0 or made for this project, see `CREDITS.md`); `assets/src/kenney/` holds the source kits.
- `tools/` — asset build scripts (Blender, gltf-transform, audio) and headless test tools (`play.mjs`, `sweep.mjs`, `tabs.mjs`).
- `api/`, `admin/` — analytics collector and admin panel (PHP 8 + SQLite, no dependencies).
- `DOCS.md` — design document and code map (Turkish).
- `design/ad-research.md` — ad research: competitor ad teardowns, idle ad formats, ideas for our own ads (Turkish).

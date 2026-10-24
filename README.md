# Food Delivery Simulator

A mobile-first 3D food-delivery game for the web, built with three.js (no build step).
Start broke on a junk scooter in **Saffron Bay**, deliver orders, upgrade your ride and yourself,
get hired in better districts, and grow your own courier fleet.

**Play:** https://mithatck.com/food-delivery-sim/

- **Auto-riding deliveries** — the scooter drives itself; you use powers (turbo, hop, overtake, run the light, horn, shortcuts) and react to random events and quick-time events.
- **Progression** — 6 vehicles with 4 upgradeable parts and paint, 5 courier skills, 4 districts to unlock, daily goals, day/night cycle with rush hours.
- **Fleet** — rent a dispatch office, hire freelance couriers who ride around the city and earn money even while you're away.

## Run locally

Any static file server works, e.g. `npx serve .` or `python3 -m http.server`, then open `index.html`.
Useful URL flags: `?fps` (frame-rate meter), `?clock=1260` (sky time), `?noti` (skip the welcome card),
`?an=dev` (mark this device as the developer's so it stays out of the analytics; `?an=off` / `?an=on`).

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

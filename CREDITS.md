# Food Delivery Simulator — credits

Everything shipped with the game is **CC0 1.0 / public domain** or was made for this project (scripts in `tools/`),
except the code library and fonts below. Nothing requires attribution; it is all listed anyway.
No real brands, restaurants or delivery apps appear in the game (Sunny Burger, ZipEats, Saffron Bay … are invented).

## Code and fonts (loaded from CDNs; the store apps in `mobile/` bundle the same files)

| What | Author | Licence | URL |
|---|---|---|---|
| three.js 0.186.1 (renderer, GLTFLoader, DRACOLoader, SkeletonUtils) | three.js authors | MIT | https://github.com/mrdoob/three.js |
| es-module-shims 1.10.0 (import maps on older Safari) | Guy Bedford | MIT | https://github.com/guybedford/es-module-shims |
| Lilita One (titles, numbers) | Juan Montoreano | SIL OFL 1.1 | https://fonts.google.com/specimen/Lilita+One |
| Fredoka (UI text) | Milena Brandão, Hafontia | SIL OFL 1.1 | https://fonts.google.com/specimen/Fredoka |
| Capacitor 8 and its App, Haptics, Preferences, Splash Screen plugins (store apps only) | Ionic | MIT | https://github.com/ionic-team/capacitor |

## Assets

| Area | Source | Licence | Details |
|---|---|---|---|
| Buildings (townhouses, shopfronts, towers, warehouses, villas, outskirts, viaduct) | generated in code at load time (`js/city/arch.js`, shader `js/city/archmat.js`) | own work | — |
| Street props: trees, palms, lanterns, traffic lights, café sets, planters, benches, signs, clock tower, lighthouse, Ferris wheel, hill houses | modelled in Blender for this project from code (`tools/blender/props.py`) | own work | [assets/models/CREDITS-props.md](assets/models/CREDITS-props.md) |
| Traffic cars, metro train, boats | modelled in Blender for this project from code (`tools/blender/cars.py`); Kenney Car Kit is the fallback | own work | [assets/models/CREDITS-cars.md](assets/models/CREDITS-cars.md) |
| City: roads, ground tiles, some yard props | Kenney — City Kit (Roads, Commercial 2.1, Suburban 2.0, Industrial 2.0) | CC0 1.0 | [assets/models/CREDITS-city.md](assets/models/CREDITS-city.md) |
| Cones, fallback cars | Kenney — Car Kit | CC0 1.0 | same |
| Food items (signs, bags, icons) | Kenney — Food Kit | CC0 1.0 | same |
| Characters (riders, customers, pedestrians, café guests baked into static poses, portraits) | Kenney — Mini Characters (with animations) | CC0 1.0 | same |
| District colour palettes | recoloured Kenney colormaps (`tools/palettes.py`) | CC0 1.0 | [assets/models/tex/README.md](assets/models/tex/README.md) |
| Restaurants, garage, dispatch office | modelled in Blender for this project (`tools/blender/restaurants.py`); rooftop food signs from the Kenney Food Kit | CC0 1.0 | [assets/models/CREDITS-city.md](assets/models/CREDITS-city.md) |
| Player vehicles (6) and helmet | modelled in Blender for this project from code (`tools/blender/vehicles.py`) | own work | [assets/models/CREDITS-vehicles.md](assets/models/CREDITS-vehicles.md) |
| Icons (food, portraits, UI) | rendered in Blender (`tools/blender/icons.py`) from Kenney Food Kit / Mini Characters + own models | CC0 1.0 | [assets/icons/CREDITS-icons.md](assets/icons/CREDITS-icons.md) |
| Sound effects, ambience, music | Freesound (CC0 items), Kenney audio packs, OpenGameArt (CC0 music: "happy lofi day" by Tarush Singhal, "Wednesday Night [Funk Fusion]" by Zane Little Music), plus sounds synthesised here | CC0 1.0 | [assets/audio/CREDITS-audio.md](assets/audio/CREDITS-audio.md) |

Asset search used 3d.shep.bot (searches Kenney, Poly Haven, BlenderKit, OpenGameArt and more with licence info).
Concept art in `design/` was supplied by the project owner.

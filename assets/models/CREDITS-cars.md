# cars.glb — credits & build notes

**Everything in `cars.glb` was modelled for this project from code** (Blender 5.2 Python, `tools/blender/cars.py`).
No third-party meshes, textures or downloads are in it, so it ships without attribution.
The style targets were `design/style-target-1..3.jpg` (the project's own concept images).

| Item | What it is | How it was made |
|---|---|---|
| `sedan` | 4.3 m three-box toy sedan, re-tintable paint, grey bumpers | Lofted rounded body + greenhouse, procedural |
| `taxi` | Sedan body in fixed yellow, black checker band, glowing TAXI roof sign with pixel letters | same |
| `police` | 4.4 m sedan, white top with dark-blue sides, POLICE letters, red/blue light bar (id 10), push bar | same |
| `hatchback-sports` | 3.9 m sporty hatch: sloped hatch, roof spoiler, dark rims, twin exhausts | same |
| `compact` | 3.4 m round city car (Fiat 500 feel): round chrome-ringed headlights, chrome bumpers, white roof (id 8) | same |
| `suv` | 4.5 m tall SUV with dark plastic cladding and roof rails | same |
| `suv-luxury` | 4.7 m SUV with chrome grille, chrome rails and chrome wheels | same |
| `sedan-sports` | 4.2 m low coupe: long hood, fastback, rear wing, twin exhausts | same |
| `van` | 4.8 m white panel van: big windshield, cab-door windows only, sliding-door seam, rear windows | same |
| `delivery` | 5.4 m box truck: blue cab, cream box with blue/orange stripes, wide rear tyres | Car-style cab + rounded box, procedural |
| `truck` | 6.2 m flatbed: red cab, wooden bed with crates and a green tarp load | same |
| `garbage-truck` | 6.6 m green rear-loader, tandem rear axle, hazard-striped hopper, CITY letters | same |
| `ambulance` | 5.4 m box ambulance: white, red stripes and crosses, red/white/blue light bar and red corner beacons (id 10) | same |
| `train_head` | 12 m elevated-metro front car: raked rounded nose (front = +Z), big windshield, amber destination display (id 10), orange + teal stripes, 2 doors per side, bogies | Lofted section with per-band colours, procedural |
| `train_mid` | 12 m middle car of the same train, gangways at both ends | same |
| `sailboat` | 8.6 m sloop: white hull with navy boot stripe, teak deck, cabin, 10 m mast, white main + coral jib (two-sided) | Lofted hull, procedural |
| `boat_small` | 6 m fishing boat: blue/white/yellow hull, wheelhouse with orange roof, life rings, crates, fenders | same |

Conventions (all models): metres, glTF +Y up, front +Z, origin on the ground at the footprint centre
(boats: y = 0 is the waterline, hull and keel go below it). One mesh per node, one material `toy`, colour in
COLOR_0 (linear in the file, authored as sRGB hex), material id in UV0 `u = (id + 0.5) / 16`.

Rebuild everything (GLB, validation, contact sheet) with `tools/blender/cars_build.sh [raw_dir]`.
The scripts are `cars.py` (build and export), `cars_check.py` (re-imports the GLB and validates it),
`cars_render.py` (EEVEE cells, mimics the runtime shader per material id) and `cars_sheet.py` (contact sheet).

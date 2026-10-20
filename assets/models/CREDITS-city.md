# City asset credits

All third-party content used for the city is **CC0 1.0 (public domain)** — no attribution required,
credited anyway. Licence text: http://creativecommons.org/publicdomain/zero/1.0/

| Pack | Version | Author | Licence | Used in |
|---|---|---|---|---|
| City Kit Roads | 2.2 | Kenney (www.kenney.nl) | CC0 | `kit-roads.glb`, `tex/roads-warm.png` |
| City Kit Commercial | 2.1 | Kenney | CC0 | `kit-commercial.glb`, `tex/commercial-*.png` |
| City Kit Suburban | 2.0 | Kenney | CC0 | `kit-suburban.glb`, `tex/suburban-*.png` |
| City Kit Industrial | 2.0 | Kenney | CC0 | `kit-industrial.glb`, `tex/industrial-harbor.png` |
| Car Kit | 3.1 | Kenney | CC0 | `kit-cars.glb` |
| Food Kit | 2.0 | Kenney | CC0 | `kit-food.glb`; giant rooftop food + sign icons in `restaurants.glb` |
| Mini Characters | 1.0 | Kenney | CC0 | `chars/character-*.glb` (unchanged copies) |

Original source archives: `assets/src/kenney/` (each with its `License.txt`).

## Made for this project

- `restaurants.glb` — the 12 landmarks (buildings, awnings, sign boards, frames, tables, parasols,
  lanterns, the döner spit, garage, office, the `props` palette texture) were modelled procedurally
  in `tools/blender/restaurants.py` for Food Delivery Simulator. Only the food items are Kenney's.
- `tex/*.png` palette variants — recoloured from Kenney's colormaps by `tools/palettes.py`.
- Packing (`tools/pack-kits.mjs`) is a lossless re-organisation of Kenney's geometry (Draco-compressed).

Tools: Blender 5.2 (GPL, tool only), glTF-Transform (MIT), Draco (Apache-2.0), three.js (MIT).

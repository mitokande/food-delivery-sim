# vehicles.glb — credits & build notes

**Everything in `vehicles.glb` was modelled for this project from code.** No third-party meshes or textures are in it.
The licence is the same as the rest of the project's own assets, and the file can be shipped without attribution.

| Item | What it is | How it was made |
|---|---|---|
| `rustbucket` | Starting junk moped ("külüstür"): faded mint paint, rust patches, a grey primer patch, dented front mudguard, duct-taped seat and right grip, one bent mirror plus a snapped stub, a crooked small round headlight, and a battered cardboard box tied on with rope | Procedural, Blender 5.2 Python (`tools/blender/vehicles.py`) |
| `zippy` | Cheap second-hand 50cc scooter: white/grey plastic, small faded-red box | same |
| `vespetta` | The concept-art hero: curvy classic red scooter with chrome trim, a leg shield with a horn-grille "tie", mirrors, and a red box with the white fork-and-knife emblem | same |
| `volt` | Angular electric scooter: white, teal emissive light strips, insulated blue box with a glowing band, hub-motor cover | same |
| `mule` | Cargo trike: one front wheel, two rear wheels, a big orange box on a cargo deck, bumper, mud flaps | same |
| `viper` | Green sport bike: nose fairing, dark screen, tank, tail, angled side silencer, sporty black box | same |
| `helmet` | Full-face courier helmet in the Kenney mini character's native units, built to be parented to the `head` bone | same |

Third-party material used **only as a reference** (none of it is in the GLB):
- **Kenney Mini Characters** (CC0 1.0, kenney.nl): `character-male-a.glb` with its `drive` / `idle` animations. It was used to measure the seat, grip, foot and head positions and appears in the check renders.
- **Kenney Car Kit** (CC0 1.0, kenney.nl): its palette (`colormap.png`) supplied the flat colours, e.g. tyre `#38383d`, plastic `#4f5260`, metal `#a0a8c9` and the red/orange/blue values. It was also the target for scale and chunkiness.
- Concept art `design/concept-1.webp` and `design/concept-2.webp` (project's own).

Rebuild everything (GLB, validation, icons, contact sheets) with `tools/blender/vehicles_build.sh [raw_dir]`.
The scripts involved are `vehicles.py` (build and export), `vehicles_check.py` (glTF-space validator), `vehicles_render.py` (icons and cells) and `vehicles_sheet.py` (downscale and contact sheets).

# Furniture asset credits (Ferdi's, idle4.html)

All of it is **CC0 1.0 (public domain)**: no attribution required, credited anyway.
Licence text: http://creativecommons.org/publicdomain/zero/1.0/

| Pack | Version | Author | Licence | Used in |
|---|---|---|---|---|
| Restaurant Bits | 1.0 | Kay Lousberg (www.kaylousberg.com), KayKit | CC0 | `kit-restaurant-bits.glb` |
| Furniture Bits | 1.0 | Kay Lousberg (www.kaylousberg.com), KayKit | CC0 | `kit-furniture-bits.glb` |
| Furniture Kit | 2.0 | Kenney (www.kenney.nl) | CC0 | `kit-furniture.glb` |

Sources: github.com/KayKit-Game-Assets (KayKit-Restaurant-Bits-1.0, KayKit-Furniture-Bits-1.0) and
kenney.nl/assets/furniture-kit, downloaded 2026-11-12. Only the pieces the game uses are kept, in
`assets/src/kaykit/restaurant-bits/`, `assets/src/kaykit/furniture-bits/` and
`assets/src/kenney/kenney_furniture-kit/`, each with the pack's licence file.

Packing (`tools/pack-kits.mjs`) is a lossless re-organisation of the geometry, Draco-compressed. KayKit's atlas
texture is kept as it is. Kenney's unlit flat colours become lit materials, one per colour name.

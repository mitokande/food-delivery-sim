# Icon credits

All icons in this folder (except `veh-*` and `helmet`, made by the vehicle pipeline) are rendered by
`tools/blender/icons.py` (Blender 5.2, EEVEE) and finished by `tools/blender/icons_post.py`
(crop/frame, ink outline, downsample, PNG + WebP). Rebuild:

```
blender -b --factory-startup -P tools/blender/icons.py -- --raw /tmp/fds-icons/raw
python3 tools/blender/icons_post.py --raw /tmp/fds-icons/raw
```

## Kenney — CC0 1.0 (public domain)

Created/distributed by Kenney (www.kenney.nl), https://creativecommons.org/publicdomain/zero/1.0/
Credit is not required; given here as thanks.

**Food Kit 2.0** (`assets/src/kenney/kenney_food-kit`), re-lit, re-posed and outlined:

| Icon | Kenney models |
|---|---|
| food-burger | burger |
| food-pizza | pizza (one slice pulled out) |
| food-sushi | sushi-salmon + 2 × maki-salmon |
| food-coffee | cup-tea on cup-saucer |
| food-donut | donut-sprinkles |
| food-taco | taco |
| food-noodle | chinese |
| food-fish | fries + fish (recoloured as golden batter) |
| food-icecream | ice-cream |
| food-soda | soda |
| food-cake | cake (one slice pulled out) |
| food-salad | salad |
| food-hotdog | hot-dog |

**Mini Characters 1.0** (`assets/src/kenney/kenney_mini-characters`): `char-male-a … f`,
`char-female-a … f` are head-and-shoulders renders of `character-{male,female}-{a..f}.glb`,
pose `emote-yes` frame 4, identical camera for all twelve.

## Original work (this project)

Modelled from primitives / extruded curves in `tools/blender/icons.py`; same licence as the game:

- `food-doner` — döner cone on a spit (procedural mesh + vertex colours).
- All `ui-*` icons: cash, coin, gem, star, star-empty, clock, bolt, package, fuel, thermo, wrench,
  trophy, pin, lock, gift, xp, heart, speed, route, building, people, calendar, sun, moon, rain, dog,
  police, horn, jump, overtake, traffic-light, shortcut, nitro.

Font used for the "XP" and "$" glyphs: DejaVu Sans Bold (Bitstream Vera licence, free to embed);
the glyphs are baked into the images, the font itself is not shipped.

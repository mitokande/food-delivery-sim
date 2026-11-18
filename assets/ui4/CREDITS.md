# Interface art (Ferdi's, idle4.html)

Everything here is AI-generated. It was made on 2026-11-13 with GPT Image 2.6 through Higgsfield (model `gpt_image_2_6`,
quality medium, 2k, transparent background). Each set was one sheet, cut into files by a script, so that the whole set
shares one style and one light.

- `*.webp` (16 icons): one 4×4 sheet. The prompt asked for "premium casual mobile game icon art, stylized 3D with soft
  painted shading, chunky rounded toy-like shapes, glossy highlights, warm key light from the top-left, a thin darker
  edge line". The icons, in order: `cash`, `gems`, `coin`, `sun`, `chef`, `mail`, `gift`, `calendar`, `map`, `lock`,
  `hammer`, `trophy`, `quest`, `cloche`, `up`, `stopwatch`.
- `faces/*.webp` (9 head-and-shoulders portraits): one 3×3 sheet, with `assets/story/ferdi.webp` and
  `assets/story/rival.webp` as style references. In order: `you` (the player), `guide` (a head waitress, for a guide
  later), then the managers `rosa`, `marco`, `aiko`, `patel`, `lou`, `greta`, `dex`.
- `faces/victor.webp`: cropped from `assets/story/rival.webp`.
- `items/*.webp` (25 icons for the things in the rooms): one 5×5 sheet, made the same way on 2026-11-13. In order:
  `bench`, `sign`, `flowers`, `table`, `tray`, `armchair`, `sneaker`, `tub`, `pan`, `register`, `card`, `cake`,
  `ledger`, `flyers`, `whistle`, `terrace`, `parasol`, `locker`, `coffee`, `uniform`, `helmet`, `scooter`, `app`,
  `bag`, `roller`.
- `faces/inspector`, `okafor`, `bruno`, `reporter` (the letter writers) and `faces/c1`…`c8` (customers, for their
  reviews later): one 4×3 sheet, made the same way on 2026-11-13, with the same two style references.
  `faces/guide.webp` (Rita) was cut again from its sheet at 384 px for her dialogue box.
- `mood/m0`…`m4` (furious → delighted), `thumbup`, `thumbdown`, `star`, `daily`: one 3×3 sheet, made the same way on
  2026-11-13, for the reviews, each day's mood and the daily gift.
- `scrub/*.webp` (the scrub mini game): made on 2026-11-15 with OpenAI's image API (model `gpt-image-2.6-flare`, quality
  medium), the prompts in `tools/genart.mjs` (the `scrub-*` names), cut by `tools/genart-scrub.py`. Four surfaces seen
  from above, one picture each: `counter`, `grill`, `floor`, `tiles`. One 4×3 sheet of stains, in order: `d1` grease,
  `d2` burnt crust, `d3` ketchup, `d4` mustard, `d5` coffee ring, `d6` crumbs, `d7` sauce, `d8` mold, `d9` shoe print,
  `d10` egg, `d11` soot, `d12` jam. One 3×2 sheet: `sponge`, `spray`, `foam`, `sparkle`, `glove`, `clipboard`. One row
  of grade badges: `a`, `b`, `c`.
- `cook/*.webp`, `flyers/*.webp` and `faces/critic.webp` (the cook and flyers mini games): made on 2026-11-15 the same
  way, the prompts in `tools/genart.mjs` (the `cook-*`, `flyers-*` and `face-critic` names), cut by
  `tools/genart-mini.py`. `cook/stove` and `flyers/street` are one picture each (the backgrounds). One 4×3 sheet of
  what's cooked, a column each, raw / done / burnt: `patty0`…`2`, `bun0`…`2`, `bacon0`…`2`, `onion0`…`2`. One 3×2
  sheet: `spatula`, `bell`, `burger`, `steam`, `smoke`, `flame`. One 4×2 sheet of people: `p1`…`p6` (townspeople),
  `v1`, `v2` (Victor's crew, in red). One 3×2 sheet: `flyer`, `hand`, `love`, `angry`, `truck`, `megaphone`.
- `duel/*.webp` and the faces `todd`, `pip`, `brick`, `kyle`, `sharp`, `sly`, `dolores`, `baron` (the city and its
  cook-offs): made on 2026-11-16 the same way, the prompts in `tools/genart.mjs` (the `duel-*` names), cut by
  `tools/genart-mini.py`. `duel/map` and `duel/arena` are one picture each. One 4×2 sheet of the rivals' faces. One
  4×3 sheet of skills: `flambe`, `express`, `charm`, `tipjar`, `showstopper`, `peptalk`, `rush`, `salt`, `smoke`,
  `bribe`, `panic`, `crit`. One 4×2 sheet: `taste`, `pace`, `calm`, `ticket`, `emblem`, `pin-rival`, `pin-ours`,
  `pin-boss`.
- `fix/hammer.webp`, `fix/tin.webp` (the label over a ruin, the cash found in the mess): made on 2026-11-16 the same
  way, two pictures of one 4×3 sheet of tools (`fix-tools` in `tools/genart.mjs`; its other ten were for the first
  repair games, and are no longer cut).
- `fix/*.webp` of the entrance's and the cashier's second games (the front washed, the coins sorted): made on
  2026-11-18 the same way. Three pictures: `front`, `front-dirty` (an edit of `front`, so every brick is in the same
  place) and `till`. One 4×2 sheet of mess: `tag1`, `tag2`, `poster1`, `poster2`, `moss`, `web`, `mud`, `soot`. One
  3×2 sheet: `gun`, `splash`, `drop`, `tarp`, `foam`, `tank`. One 4×2 sheet: the coins `c1`…`c6`, `dish`, `roll`.
- `fix/*.webp` of the office's, the staff room's, the terrace's and the courier bay's second games (the photo, the
  pipes, the lawn, the yard): made on 2026-11-18 the same way. Pictures: `desk`, `photo` (cut to the frame's mat by
  `tools/genart-mini.py`), `tilewall`, `lawn`, `lawn-wild` (an edit of `lawn`), `floor`; `frame` (one picture, on
  nothing). One 3×2 sheet: the pipe tiles `p-straight`, `p-elbow`, `p-tee`, `p-cross`, `valve`, `sink`. One 4×2 sheet:
  `mower`, `fpot`, `gnome`, `birdbath`, `sprinkler`, `clippings`, `wcan`, `stone`. One 3×2 sheet: `scooter`, `car`,
  `van`, `crates`, `tyres`, `drums`.

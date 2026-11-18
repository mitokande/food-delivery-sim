// Generates the story and UI art for Idle Restaurant Manager (idle3.html) with OpenAI's image API, then the page uses the
// webp copies in assets/story/. The key is read from the environment and never written anywhere. The restaurant's
// stages are edits of the picture before them (images/edits), so they stay the same building.
//   OPENAI_API_KEY=… node tools/genart.mjs <outdir> [name …]
// Writes <outdir>/<name>.png (raw, 1536×1024 or 1024×1024); tools/genart-webp.py makes the small webp copies.
// Also the art of Ferdi's mini games: the scrub-* names (tools/genart-scrub.py cuts those into assets/ui4/scrub), and
// the cook-*, flyers-* and face-critic names (tools/genart-mini.py: assets/ui4/cook, flyers and faces/critic.webp),
// and the duel-* names of the cook-offs (tools/genart-mini.py too: assets/ui4/duel and the rivals' faces),
// and the fix-* names of the repairs by hand (tools/genart-mini.py: assets/ui4/fix).
import fs from 'node:fs';
import path from 'node:path';

const MODEL = 'gpt-image-2.6-flare';
const STYLE = 'Stylized 3D cartoon illustration for a cozy mobile tycoon game. Chunky rounded shapes, soft shadows, warm light, '
  + 'bright saturated palette, clean plain white background. No text, no letters, no numbers, no logos.';
// (Ferdi's interface art: its look; a surface seen from above; a sheet of things to cut apart)
const UI4 = 'Premium casual mobile game art, stylized 3D with soft painted shading, chunky rounded toy-like shapes, glossy highlights, '
  + 'warm key light from the top-left, bright saturated palette.';
const TOP = 'Seen straight from above (a flat top-down view, no perspective), filling the whole picture edge to edge with no border and no background around it. '
  + 'Perfectly clean, freshly polished and shiny. The large middle of the picture is empty surface. Portrait. No text, no letters, no people, no hands, no dirt.';
const SHEET = 'Transparent background, no ground shadows, no text, no outline frames. Each one separate, centered in its cell, the same size, '
  + 'with generous empty space between them so that none touch.';
export const ART = {
  letter: { size: '1536x1024', prompt: `${STYLE} On an old wooden desk: a cream envelope opened with a broken red wax seal, a folded letter, `
    + 'a heavy brass key on a ring with a little burger-shaped keychain, and a faded instant photo of a smiling round old man with a big grey moustache '
    + 'in a red apron standing in front of a small diner. Nostalgic, a little dusty.' },
  diner: { size: '1536x1024', prompt: `${STYLE} A small run-down corner diner on a cobbled old-town street: faded red and cream striped awning with torn edges, `
    + 'one boarded-up window, dusty glass door, a crooked blank sign board, a big coffee cup ornament on the roof, weeds by the step, '
    + 'an empty chalkboard stand. Warm afternoon light and charm. No people.' },
  scooter: { size: '1536x1024', prompt: `${STYLE} An old, battered mint-green moped scooter with a scuffed tan delivery box on the back, `
    + 'parked in a narrow back alley. Patches of rust, silver duct tape on the seat and the box, one bent mirror, a soft front tire, '
    + 'a puff of black smoke from the exhaust. Lovable junk that still runs. No people.' },
  smash: { size: '1536x1024', prompt: `${STYLE} A close view of a hot flat-top griddle in a small diner kitchen: a pair of hands with a sturdy metal spatula `
    + 'pressing a ball of beef flat into a sizzling smash burger patty, crispy lacy edges, steam and sizzle sparks, '
    + 'a slice of melting cheese and toasted soft buns waiting next to it. Appetizing, energetic.' },
  // the restaurant growing: each stage is an edit of the one before, so it stays the same building
  stage2: { size: '1536x1024', from: 'diner', prompt: 'The same corner diner, same angle and framing, after a renovation: fresh cream and red paint, '
    + 'a brand-new red and cream striped awning, the boarded window replaced with clean glass, a glowing blank sign board, '
    + 'flower boxes, a clean step and a chalkboard stand. Same stylized 3D cartoon look, plain white background. No text, no letters.' },
  stage3: { size: '1536x1024', from: 'stage2', prompt: 'The same diner, same angle and framing, now with a cosy terrace in front on the cobbles: '
    + 'three small round tables with chairs, two striped parasols, potted plants, warm string lights over the terrace. '
    + 'Same stylized 3D cartoon look, plain white background. No text, no letters, no people.' },
  stage4: { size: '1536x1024', from: 'stage3', prompt: 'The same diner, same style, now expanded into the building next door on the left: '
    + 'two connected shopfronts under one long matching awning, a second floor with windows above both, a bigger terrace with more tables '
    + 'and parasols, a larger glowing blank sign. Pull the view back a little so both buildings fit. Plain white background. No text, no letters, no people.' },
  stage5: { size: '1536x1024', from: 'stage4', prompt: 'The same restaurant grown into a grand, successful two-building restaurant: three floors, '
    + 'a rooftop terrace with parasols and lights, a big illuminated blank sign, potted trees, golden warm windows, a wide terrace '
    + 'full of tables, festive bunting. Same stylized 3D cartoon look, plain white background. No text, no letters, no people.' },
  // the card when the game opens again: the staff kept the place running
  away: { size: '1536x1024', prompt: `${STYLE} Early morning inside a small cosy diner: behind the counter a cheerful young cook in a white chef hat `
    + 'and apron proudly holds up a big glass jar stuffed with banknotes and coins, a courier in a red cap leans on the counter with a delivery bag '
    + 'giving a thumbs up, a tall stack of clean plates, an order rail full of finished tickets, a round wall clock, warm sunrise light through the window.' },
  'cook-btn': { size: '1024x1024', background: 'transparent', prompt: 'Game UI icon, stylized 3D cartoon, chunky and glossy: a white chef hat '
    + 'leaning on a sizzling frying pan with a small flame under it, a few sizzle sparks. Centered, fills most of the frame, transparent background, '
    + 'no text, no letters, no outline frame, no shadow on the ground.' },
  // Uncle Ferdi's portrait (the letter and the expansion cards); tools/genart-webp.py cuts him out of the white
  ferdi: { size: '1024x1024', prompt: 'Stylized 3D cartoon character portrait for a cozy mobile tycoon game. Chunky rounded shapes, soft shadows, warm light, '
    + 'bright saturated palette, clean plain white background. Uncle Ferdi: a round, kind old man with a big bushy grey moustache, rosy cheeks, twinkling eyes, '
    + 'a red apron over a cream shirt with rolled sleeves, holding a spatula, giving a warm wink and a thumbs up. Head and upper body, centered. '
    + 'No text, no letters, no numbers, no logos.' },
  // the rival in Ferdi's (idle4.html): Victor Gristle of the Gristle Burger chain, at the boarded-up door (a story card)
  rival: { size: '1536x1024', prompt: `${STYLE} A smug villainous restaurant-chain tycoon standing in front of the boarded-up door of a small run-down `
    + 'old-town diner: a portly middle-aged man in a shiny purple-grey suit, slicked-back black hair, thin pencil moustache, gold pinky ring, a toothpick '
    + 'in his grin, arms crossed, one eyebrow raised; a sleek black car parked behind him. Comic, charming, not scary. Waist-up, centered, room around him.' },
  // icon sheets: every dish, and every motor, on one picture so they share a look; tools/genart-webp.py cuts them apart.
  // The order is sim.js's (DISHES, MOTORS), and the motors' colours are those of the 3D models on the map.
  dishes: { size: '1536x1024', background: 'transparent', prompt: 'Game UI icon sheet, stylized 3D cartoon, chunky and glossy food icons, soft shading, '
    + 'bright appetizing colors. Eight separate dishes arranged in a neat grid of 4 columns and 2 rows with generous empty space between them, '
    + 'each one centered in its cell and the same size: a smash burger with melting cheese, a hot dog with mustard, a döner kebab wrap, '
    + 'a pizza with a slice pulled away, a bowl of noodles with chopsticks, fish and chips in a paper cone, a sushi set on a small wooden board, '
    + 'an ice cream cone with two scoops. Transparent background, no text, no letters, no outline frames, no ground shadows.' },
  vehicles: { size: '1536x1024', background: 'transparent', prompt: 'Game UI vehicle upgrade sheet, stylized 3D cartoon, chunky and glossy, soft shading, '
    + 'bright colors. Five delivery vehicles side by side in one row, all facing right, the same scale, evenly spaced with clear empty space between them '
    + 'so that none of them touch or overlap, each with a delivery box on the back, getting better from left to right: '
    + '1) a battered old pastel mint-green moped with rust patches and silver duct tape, a tan cardboard box strapped on the back; '
    + '2) a small plain white 50cc scooter with a black seat and a coral-red delivery box; '
    + '3) a stylish bright red retro Italian-style scooter with a red delivery box; '
    + '4) a sleek white electric scooter with glowing cyan light strips and a blue delivery box; '
    + '5) a fast bright lime-green sport motorbike with a black delivery box. '
    + 'Transparent background, no smoke, no text, no letters, no numbers, no ground shadows.' },
  // the store apps' icon: only the subject, mobile/scripts/icon-diner.mjs puts it on the boot screen's gradient
  'app-icon': { size: '1024x1024', background: 'transparent', prompt: 'Mobile game app icon subject, stylized 3D cartoon, chunky, rounded and glossy: '
    + 'a big juicy smash cheeseburger with melting cheese, lettuce and a sesame bun, wearing a puffy white chef hat tilted to one side, '
    + 'under a small red and cream striped diner awning, a few golden sparkles around it. One bold, simple shape that reads at a tiny size. '
    + 'Centered, fills most of the frame, nothing cut off at the edges, transparent background, no text, no letters, no outline frame, '
    + 'no shadow on the ground.' },
  // Ferdi's (idle4.html), the scrub mini game: four surfaces to clean (portrait, from above), a sheet of stains, a sheet
  // of tools and one of grade badges. tools/genart-scrub.py cuts them into assets/ui4/scrub.
  'scrub-counter': { size: '1024x1536', prompt: `${UI4} A stainless steel prep counter in a diner kitchen: brushed steel with soft reflections. ${TOP} `
    + 'Only small props at the very edges, cut off by the frame: the corner of a wooden cutting board at the top-left, a steel bowl at the top-right, a red salt shaker at the bottom-right corner.' },
  'scrub-grill': { size: '1024x1536', prompt: `${UI4} A flat-top griddle in a diner kitchen: a wide dark shiny steel hotplate inside a brushed steel rim, a narrow grease gutter along the bottom. ${TOP} `
    + 'Only at the very edges, cut off by the frame: three red control knobs along the bottom edge, the tip of a metal spatula at the top-right corner.' },
  'scrub-floor': { size: '1024x1536', prompt: `${UI4} A diner kitchen floor: big cream and terracotta-red checkered tiles with thin pale grout, glossy and spotless. ${TOP} `
    + 'Only at the very edges, cut off by the frame: the corner of a black rubber mat at the top-left, one steel table leg at the top-right corner.' },
  'scrub-tiles': { size: '1024x1536', prompt: `${UI4} The white tiled wall behind a diner stove (the splashback): glossy square white ceramic tiles with thin pale grey grout, seen flat, front on. ${TOP} `
    + 'Only at the very edges, cut off by the frame: a steel shelf edge with two hanging ladles along the top, a strip of steel worktop along the bottom.' },
  'scrub-dirt': { size: '1536x1024', background: 'transparent', prompt: `${UI4} Game sprite sheet: twelve kitchen stains seen straight from above, each lying flat like a decal, `
    + 'in a neat grid of 4 columns and 3 rows: a brown greasy puddle, a black burnt-on crust patch, a red ketchup splat, a yellow mustard splat, '
    + 'a brown coffee ring with drips, a scatter of bread crumbs, a sticky orange sauce smear, a fuzzy green mold patch, a muddy shoe print, '
    + `a spilled egg with a broken yolk, a dark soot smudge, a purple jam blob. Thick, opaque, a little glossy and gross but cute. ${SHEET}` },
  'scrub-tools': { size: '1536x1024', background: 'transparent', prompt: `${UI4} Game UI icon sheet, six icons in a neat grid of 3 columns and 2 rows: `
    + 'a yellow kitchen sponge with a green scouring pad and soap suds on it; a blue spray bottle of cleaner; a fluffy white blob of soap foam with a few bubbles; '
    + `a big four-pointed white and gold sparkle star; a yellow rubber glove giving a thumbs up; a brown clipboard with a checklist of green ticks and a pencil. ${SHEET}` },
  'scrub-stamps': { size: '1536x1024', background: 'transparent', prompt: `${UI4} Game UI sheet, three round rubber-stamp grade badges side by side in one row, each tilted a few degrees, `
    + 'a thick ring with small stars around a single big bold capital letter: a green one with the letter A, an amber-yellow one with the letter B, a red one with the letter C. '
    + 'Chunky, glossy enamel badges with a darker edge line. No other text. Transparent background, no ground shadows, evenly spaced so that none touch.' },
  // Ferdi's cook and flyers mini games: the stove and the street they're played on (portrait), sheets of what's cooked
  // (raw, done, burnt), of the people walking by and of the tools, and the critic's face. tools/genart-mini.py cuts
  // them into assets/ui4/cook, assets/ui4/flyers and assets/ui4/faces/critic.webp.
  'cook-stove': { size: '1024x1536', prompt: `${UI4} A diner stove seen straight from above (a flat top-down view, no perspective), filling the whole picture edge to edge with no border, portrait. `
    + 'A brushed steel stove top with one big round black cast-iron skillet on a gas burner: the skillet is empty, with a thin shine of hot oil, and a ring of small blue flames shows round its rim. '
    + 'The skillet sits a little below the middle of the picture and is about three quarters of the picture wide; its short handle points to the bottom-right corner. '
    + 'Above the skillet there is a wide empty strip of clean steel. Only small props at the very edges, cut off by the frame: two red control knobs at the bottom-left corner, a pepper mill at the top-left corner. '
    + 'No food, no text, no letters, no people, no hands.' },
  'cook-food': { size: '1536x1024', background: 'transparent', prompt: `${UI4} Game sprite sheet of burger ingredients seen straight from above, in a neat grid of 4 columns and 3 rows. `
    + 'Each column is one ingredient at three stages of cooking: top row raw, middle row perfectly cooked, bottom row burnt. '
    + 'Column 1: a round thick beef burger patty (top: raw pink-red minced beef; middle: juicy golden-brown with grill marks; bottom: charred black and cracked). '
    + 'Column 2: the two halves of a burger bun side by side, cut side up (top: pale soft bread; middle: golden toasted; bottom: burnt dark brown and black). '
    + 'Column 3: three strips of bacon side by side (top: raw pink with white fat; middle: crisp golden red-brown; bottom: shrivelled and black). '
    + 'Column 4: a small heap of sliced onion rings (top: raw white; middle: caramelised golden; bottom: burnt dark brown). '
    + `The same shape and the same size down each column. ${SHEET}` },
  'cook-tools': { size: '1536x1024', background: 'transparent', prompt: `${UI4} Game UI icon sheet, six icons in a neat grid of 3 columns and 2 rows: `
    + 'a steel kitchen spatula with a red handle; a silver service bell (an order-up desk bell); a finished cheeseburger on a white plate with a small paper flag pick in it; '
    + `a fluffy white puff of steam; a dark grey puff of smoke with a few orange sparks; an orange and yellow cartoon flame. ${SHEET}` },
  'face-critic': { size: '1024x1024', background: 'transparent', prompt: `${UI4} Character portrait for a game dialogue, head and shoulders, facing the viewer and turned a little to one side: `
    + 'a snooty but lovable food critic, a thin middle-aged man with a long nose, a thin curled pencil moustache, slicked dark hair with a grey streak and a round gold monocle; '
    + 'a burgundy velvet jacket, a cream shirt and a spotted bow tie; one eyebrow raised, lips pursed, holding up a silver fork. Big expressive animated-film face. '
    + 'Transparent background, no text, no frame.' },
  'flyers-street': { size: '1024x1536', prompt: `${UI4} A wide city pavement seen from high above at a steep angle (almost top-down), running from the top of the picture to the bottom and filling it edge to edge, portrait. `
    + 'Pale warm stone paving slabs. Along the left edge: the bottoms of shop fronts with potted plants and a bench. Along the right edge: a kerb, a strip of asphalt road and a street lamp. '
    + 'At the very bottom edge, cut off by the frame: the roof and the red and black striped serving awning of a food truck parked across the pavement. '
    + 'At the very top edge, cut off by the frame: the orange and cream striped awning of a diner door with a doormat. '
    + 'The large middle of the picture is empty pavement in soft afternoon light. No people, no text, no letters, no signs with writing.' },
  'flyers-people': { size: '1536x1024', background: 'transparent', prompt: `${UI4} Game sprite sheet: eight full-body cartoon townspeople in a neat grid of 4 columns and 2 rows, `
    + 'each seen from the front and a little from above, in mid-stride walking toward the viewer, cheerful: '
    + 'a young woman with headphones and a yellow jacket; an old man with a walking stick and a green cardigan; a businesswoman in a blue suit with a coffee cup; '
    + 'a boy with a skateboard and a striped shirt; a mother in a purple coat carrying a shopping bag; a bearded man in a teal hoodie with a backpack; '
    + 'and last, two workers of a rival burger truck, both in the same bright red cap, red polo shirt and black apron, with a smug grin: a tall thin one carrying a red megaphone, a short round one carrying a red paper bag. '
    + `Big heads, short legs, the same height. ${SHEET}` },
  'flyers-tools': { size: '1536x1024', background: 'transparent', prompt: `${UI4} Game UI icon sheet, six icons in a neat grid of 3 columns and 2 rows: `
    + 'a paper flyer, cream with an orange border, with a picture of a burger and a gold star on it and no writing; a hand holding a fanned stack of the same flyers; '
    + 'a white thought bubble with a burger and a red heart in it; a red angry scribble cloud with a lightning bolt; '
    + `a red and black food truck with a striped awning, seen from a three-quarter view; an orange megaphone. ${SHEET}` },
  // the cook-offs against Victor's chain (the city map and the duel): the stage they're fought on and the map
  // (portrait), sheets of the rival cooks' faces, of the skills and of the icons. tools/genart-mini.py cuts them into
  // assets/ui4/duel and assets/ui4/faces.
  'duel-arena': { size: '1024x1536', prompt: `${UI4} A cook-off stage built on a town square at dusk, seen from high above at a steep angle (almost top-down), filling the whole picture edge to edge, portrait. `
    + 'Across the top third: a long kitchen counter in glossy red and black with two steel stoves and red banners behind it (the rival burger chain\'s side). '
    + 'Across the bottom third: a long kitchen counter in warm orange and cream with two steel stoves and striped orange and cream bunting (the home diner\'s side). '
    + 'Between them, across the middle: a wooden stage floor with a round spotlight on it, warm string lights along the left and right edges and a few potted plants. '
    + 'The counters are empty: no cooks. Festive, a little dramatic. No people, no text, no letters, no signs with writing.' },
  'duel-map': { size: '1024x1536', prompt: `${UI4} A painted game world map of a small seaside city seen from above at an angle, portrait, filling the whole picture edge to edge with no border. `
    + 'The bottom third is a cosy old town: terracotta roofs, a cobbled square with a fountain, market stalls. '
    + 'The middle third is a harbour: wooden docks, fishing boats, brick warehouses and blue water along the right side. '
    + 'The top third is a rich uptown: shiny glass towers, a green park and a big dark red and black skyscraper at the very top. '
    + 'One wide pale sand-coloured road winds in big gentle S-curves from the bottom edge all the way up to the skyscraper, with clear open space along it. '
    + 'Miniature, toy-like, soft daylight. No people, no cars, no text, no letters, no labels, no map pins.' },
  'duel-rivals': { size: '1536x1024', background: 'transparent', prompt: `${UI4} Character portrait sheet for a game: eight head-and-shoulders portraits in a neat grid of 4 columns and 2 rows, `
    + 'each facing the viewer and turned a little to one side, big expressive animated-film faces, smug and cocky but comic, not scary. '
    + 'The first six work for a rival burger chain and all wear the same bright red cap, red polo shirt and black apron: '
    + '1) a tall thin young man with a long chin and a crooked grin; 2) a short round woman with two pigtails blowing a pink bubble of gum; '
    + '3) a big muscular man with a buzz cut and a square jaw; 4) a freckled teenager with messy ginger hair and headphones round his neck; '
    + '5) a stern older woman with pointed glasses and a grey hair bun; 6) a man with big black sideburns chewing a toothpick. '
    + 'The last two are their bosses: 7) a sharp district manager, a woman with a sleek black bob, red lipstick, a red blazer and one raised eyebrow; '
    + '8) a huge celebrity chef with a tall black chef hat, a black chef jacket with red buttons, a curled red moustache and a gold medal. '
    + `${SHEET}` },
  'duel-skills': { size: '1536x1024', background: 'transparent', prompt: `${UI4} Game UI skill icon sheet, twelve icons in a neat grid of 4 columns and 3 rows: `
    + 'a black frying pan with a tall orange flame bursting out of it; a silver serving tray with a cloche and two small white wings; a red heart with a red rose across it and a sparkle; '
    + 'a glass jar brimming with gold coins; a golden plate with a towering fancy dessert and two lit sparklers; a golden whistle on a red and white lanyard with sound lines; '
    + 'a red delivery bag with a yellow lightning bolt on it; a giant salt shaker tipped over pouring out a heap of salt; a dark grey smoke cloud rising from a burnt black pan; '
    + 'a fat cream envelope stuffed with green banknotes; a blue dizzy swirl with sweat drops and little stars; a golden starburst with a crossed fork and knife on it. '
    + `${SHEET}` },
  'duel-icons': { size: '1536x1024', background: 'transparent', prompt: `${UI4} Game UI icon sheet, eight icons in a neat grid of 4 columns and 2 rows: `
    + 'a golden fork with a glossy red heart on its tip; a yellow lightning bolt with a small white wing; a light blue shield with a white snowflake on it; '
    + 'an orange admission ticket with a gold star and a crossed spatula and whisk on it and no writing; a round badge, half red and half orange, with a crossed spatula and whisk over it; '
    + 'a map pin: a tiny red and black burger shop standing on a round red base; a map pin: a tiny orange and cream diner with a striped awning and a little flag standing on a round orange base; '
    + `a map pin: a tiny dark tower with red banners and a golden crown standing on a round black base. ${SHEET}` },
  // the repairs by hand (a mini game per room in ruins, before its repair is paid for): what each is played on
  // (portrait) and sheets of the things in them. tools/genart-mini.py cuts them into assets/ui4/fix.
  'fix-tools': { size: '1536x1024', background: 'transparent', prompt: `${UI4} Game UI icon sheet, twelve icons in a neat grid of 4 columns and 3 rows: `
    + 'the round flat head of a big rusty iron nail seen from straight in front; a red steel crowbar; a paint roller with a wooden handle, its roll covered in wet sage green paint; '
    + 'a chunky steel adjustable wrench with a red handle; a jet of blue water spraying out in a fan with white foam and droplets; a grey steel pipe repair clamp with two bolts and a strip of black rubber; '
    + 'a brown leather gardening glove, open hand; a soft beige puff of dust cloud; a big steel hexagonal bolt head on a round washer seen from straight above; '
    + `a red metal toolbox with a hammer and a wrench sticking out of it; a claw hammer with a wooden handle; a small crumpled heap of green banknotes and gold coins in a dusty open tin box. ${SHEET}` },
  // (the second round of repairs: the entrance washed, the cashier's coins sorted)
  'fix-front': { size: '1024x1536', prompt: `${UI4} The front of a small charming corner diner seen flat, front on (no perspective), filling the whole picture edge to edge, portrait. `
    + 'Freshly cleaned and bright: a wall of warm red bricks and cream painted trim, over the door a big wooden sign board with the name FERDI\'S in chunky cream retro letters on red, '
    + 'under it a red and cream striped awning, a glass door with a brass handle in the middle, a window with a flower box on each side of it, '
    + 'a worn stone step and a strip of pale pavement tiles along the very bottom. Everything clean and sparkling. No people, no other text, no letters except FERDI\'S.' },
  'fix-front-dirty': { size: '1024x1536', from: 'fix-front', prompt: 'The very same diner front, exactly the same framing, every shape in exactly the same place, '
    + 'but filthy after years of neglect: everything covered in a dull layer of grey-brown grime and soot, dark streaks running down from the sign and the window sills, '
    + 'green moss in the brick joints, dusty clouded glass, the colours faded and dirty. Nothing added and nothing moved. Same stylized painted game art look. No people, no other text.' },
  'fix-grime': { size: '1536x1024', background: 'transparent', prompt: `${UI4} Game sprite sheet: eight kinds of mess on a wall, seen flat from the front, in a neat grid of 4 columns and 2 rows: `
    + 'a messy pink and purple spray paint graffiti swirl (an abstract scribble, no letters); a green and blue spray paint graffiti zigzag (abstract, no letters); '
    + 'a torn faded paper poster hanging crooked with a blank pale picture on it; a torn red poster of a mean-looking cartoon burger with sharp teeth (no text); '
    + `a fuzzy patch of green moss; a big grey dusty cobweb; a dark brown mud splash; a black smudge of soot. ${SHEET}` },
  'fix-wash': { size: '1536x1024', background: 'transparent', prompt: `${UI4} Game sprite sheet, six things in a neat grid of 3 columns and 2 rows: `
    + 'a bright yellow pressure washer spray gun with a long black lance, pointing straight up; a burst of white and light blue water splash with droplets; '
    + 'a single big glossy light blue water drop; a dusty grey canvas cloth tied with brown rope, a wide rectangle hanging flat as if covering a sign; '
    + `a cluster of white soap foam bubbles; a chunky blue plastic water tank with a white cap. ${SHEET}` },
  'fix-till': { size: '1024x1536', prompt: `${UI4} An old shop counter seen from above at a steep angle, filling the whole picture edge to edge, portrait. `
    + 'Along the very top edge the bottom of an old brass cash register with its empty drawer pulled open. The rest is a worn wooden counter top '
    + 'with a big worn dark green felt mat on it that fills most of the picture; the mat is completely empty: no coins, no objects. A little dust. '
    + 'No people, no hands, no text, no letters, no numbers.' },
  'fix-coins': { size: '1536x1024', background: 'transparent', prompt: `${UI4} Game sprite sheet, eight things in a neat grid of 4 columns and 2 rows, all seen from the same angle: from above at a steep three-quarter angle. `
    + 'Six thick chunky coins lying flat, so each shows its top face as a wide oval with its thick rim as a band under it; all six exactly the same shape, size and angle, only the colour and emblem differ: '
    + 'a copper coin with a star; a silver coin with a burger; a gold coin with a crown; a blue enamel coin with a heart; a green enamel coin with a four-leaf clover; a red enamel coin with a chef\'s hat. '
    + `Then an empty shallow round wooden dish, wider than a coin; and a fat roll of coins wrapped in brown paper, lying on its side. No numbers, no letters. ${SHEET}` },  // (the office's photo, the staff room's pipes, the terrace's lawn, the courier bay's yard)
  'fix-desk': { size: '1024x1536', prompt: `${UI4} An old wooden office desk seen straight from above (a flat top-down view, no perspective), filling the whole picture edge to edge, portrait. `
    + 'Warm dark walnut wood with a worn green leather writing pad in the lower half; along the very edges a few small things: a brass desk lamp in the top left corner, '
    + 'a cold cup of coffee and a pen at the right edge, two paper clips. The large middle of the desk is empty. Dusty, cosy. No people, no hands, no paper, no photos, no text, no letters.' },
  'fix-frame': { size: '1024x1536', background: 'transparent', prompt: `${UI4} An empty ornate carved golden wooden picture frame, portrait, seen flat from the front, filling most of the picture, `
    + 'the inside of the frame a plain flat smooth cream mat board with nothing on it. A little dusty. Transparent background around the frame, no shadow, no text.' },
  'fix-photo': { size: '1024x1536', prompt: `${UI4} A faded old photograph from the 1970s, portrait: a cheerful round young man with a big black moustache and a red apron `
    + 'stands proudly with his arms wide open in front of his brand-new small corner diner on its opening day: a red and cream striped awning, a sign board reading FERDI\'S, '
    + 'a red ribbon across the door, balloons, two happy neighbours clapping. Warm faded colours, soft vignette, the stylized painted game art look. No other text.' },
  'fix-tilewall': { size: '1024x1536', prompt: `${UI4} A wall of pale blue-grey square ceramic tiles in a staff washroom seen flat, front on (no perspective), filling the whole picture edge to edge, portrait. `
    + 'Clean grout lines, a few chipped tiles, a little old. Nothing on the wall: no pipes, no sink, no mirror, no people, no text.' },
  'fix-plumb': { size: '1536x1024', background: 'transparent', prompt: `${UI4} Game sprite sheet, six things in a neat grid of 3 columns and 2 rows, seen flat from the front. `
    + 'The first four are square puzzle tiles of the same size: each a dark slate grey square plate with softly rounded corners and four tiny rivets, carrying a thick shiny copper pipe: '
    + '1) a straight pipe from the middle of the left edge to the middle of the right edge; 2) an elbow from the middle of the left edge to the middle of the bottom edge; '
    + '3) a T-piece joining the middle of the left, right and bottom edges; 4) a cross joining the middle of all four edges. The pipes always reach the very edge of the plate. '
    + `Then: a red round tap wheel on a short copper pipe stub pointing right; a small white ceramic washbasin seen from the front. ${SHEET}` },
  'fix-lawn': { size: '1024x1536', prompt: `${UI4} A lawn seen straight from above (a flat top-down view, no perspective), filling the whole picture edge to edge with no border, portrait. `
    + 'Freshly mowed short bright green grass in neat wide light and dark green stripes running across. Nothing on it: no paths, no plants, no objects, no people, no text.' },
  'fix-lawn-wild': { size: '1024x1536', from: 'fix-lawn', prompt: 'The very same lawn, same framing, but badly overgrown: long wild shaggy uncut grass in darker greens and yellows, '
    + 'tufts, dandelions, clover and a few weeds, no stripes left. Seen straight from above. Same stylized painted game art look. No objects, no people, no text.' },
  'fix-garden': { size: '1536x1024', background: 'transparent', prompt: `${UI4} Game sprite sheet, eight things in a neat grid of 4 columns and 2 rows, all seen straight from above (top-down): `
    + 'a red push lawn mower with its handle pointing down; a terracotta flower pot with red geraniums; a garden gnome with a red hat; a round stone birdbath with water; '
    + `a yellow garden sprinkler; a burst of flying grass clippings; a green watering can; a big round grey stone. ${SHEET}` },
  'fix-floor': { size: '1024x1536', prompt: `${UI4} The concrete floor of an old garage seen straight from above (a flat top-down view, no perspective), filling the whole picture edge to edge, portrait. `
    + 'Grey concrete with cracks and a few oil stains, faded yellow painted lines along the edges, the large middle empty. No vehicles, no objects, no people, no text, no letters.' },
  'fix-yard': { size: '1536x1024', background: 'transparent', prompt: `${UI4} Game sprite sheet, six things in a neat grid of 3 columns and 2 rows, all seen straight from above (top-down), each lying left to right: `
    + 'a mint green delivery scooter with a tan delivery box, pointing right; a small rusty old junk car, pointing right; a long rusty old van, pointing right, half again as long as the car; '
    + `two wooden crates side by side; two stacks of old tyres side by side; three rusty oil drums in a row. ${SHEET}` },
};

async function gen(name, outdir) {
  const a = ART[name];
  let res;
  if (a.from) { // an edit of another picture (outdir/<from>.png)
    const fd = new FormData();
    fd.append('model', MODEL); fd.append('prompt', a.prompt); fd.append('size', a.size); fd.append('quality', 'medium');
    fd.append('image', new Blob([fs.readFileSync(path.join(outdir, `${a.from}.png`))], { type: 'image/png' }), `${a.from}.png`);
    res = await fetch('https://api.openai.com/v1/images/edits', { method: 'POST', headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` }, body: fd });
  } else {
    const body = { model: MODEL, prompt: a.prompt, size: a.size, quality: 'medium', n: 1 };
    if (a.background) { body.background = a.background; body.output_format = 'png'; }
    res = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST', headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
  }
  const d = await res.json();
  if (d.error) throw new Error(`${name}: ${d.error.message}`);
  fs.writeFileSync(path.join(outdir, `${name}.png`), Buffer.from(d.data[0].b64_json, 'base64'));
  console.log('ok', name);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  if (!process.env.OPENAI_API_KEY) { console.error('set OPENAI_API_KEY'); process.exit(1); }
  const outdir = process.argv[2]; fs.mkdirSync(outdir, { recursive: true });
  const names = process.argv.length > 3 ? process.argv.slice(3) : Object.keys(ART);
  // (edits wait for their source; the rest run side by side)
  const done = new Map();
  const run = (n) => { if (!done.has(n)) done.set(n, (ART[n].from && names.includes(ART[n].from) ? run(ART[n].from) : Promise.resolve()).then(() => gen(n, outdir))); return done.get(n); };
  const r = await Promise.allSettled(names.map(run));
  for (const x of r) if (x.status === 'rejected') console.error(x.reason.message);
}

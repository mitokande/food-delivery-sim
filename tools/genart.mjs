// Generates the story and UI art for Idle Restaurant Manager (idle3.html) with OpenAI's image API, then the page uses the
// webp copies in assets/story/. The key is read from the environment and never written anywhere. The restaurant's
// stages are edits of the picture before them (images/edits), so they stay the same building.
//   OPENAI_API_KEY=… node tools/genart.mjs <outdir> [name …]
// Writes <outdir>/<name>.png (raw, 1536×1024 or 1024×1024); tools/genart-webp.py makes the small webp copies.
import fs from 'node:fs';
import path from 'node:path';

const MODEL = 'gpt-image-2.6-flare';
const STYLE = 'Stylized 3D cartoon illustration for a cozy mobile tycoon game. Chunky rounded shapes, soft shadows, warm light, '
  + 'bright saturated palette, clean plain white background. No text, no letters, no numbers, no logos.';
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
  // the store apps' icon: only the subject, mobile/scripts/icon-diner.mjs puts it on the boot screen's gradient
  'app-icon': { size: '1024x1024', background: 'transparent', prompt: 'Mobile game app icon subject, stylized 3D cartoon, chunky, rounded and glossy: '
    + 'a big juicy smash cheeseburger with melting cheese, lettuce and a sesame bun, wearing a puffy white chef hat tilted to one side, '
    + 'under a small red and cream striped diner awning, a few golden sparkles around it. One bold, simple shape that reads at a tiny size. '
    + 'Centered, fills most of the frame, nothing cut off at the edges, transparent background, no text, no letters, no outline frame, '
    + 'no shadow on the ground.' },
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

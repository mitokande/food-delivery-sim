// Generates the story and UI art for Uncle's Diner (idle3.html) with OpenAI's image API, then the page uses the
// webp copies in assets/story/. The key is read from the environment and never written anywhere.
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
  'smash-btn': { size: '1024x1024', background: 'transparent', prompt: 'Game UI icon, stylized 3D cartoon, chunky and glossy: a metal burger spatula '
    + 'smashing a juicy beef patty with melted cheese, small sizzle sparks around it. Centered, fills most of the frame, transparent background, '
    + 'no text, no letters, no outline frame, no shadow on the ground.' },
};

async function gen(name, outdir) {
  const a = ART[name];
  const body = { model: MODEL, prompt: a.prompt, size: a.size, quality: 'medium', n: 1 };
  if (a.background) { body.background = a.background; body.output_format = 'png'; }
  const res = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST', headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  const d = await res.json();
  if (d.error) throw new Error(`${name}: ${d.error.message}`);
  fs.writeFileSync(path.join(outdir, `${name}.png`), Buffer.from(d.data[0].b64_json, 'base64'));
  console.log('ok', name);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  if (!process.env.OPENAI_API_KEY) { console.error('set OPENAI_API_KEY'); process.exit(1); }
  const outdir = process.argv[2]; fs.mkdirSync(outdir, { recursive: true });
  const names = process.argv.length > 3 ? process.argv.slice(3) : Object.keys(ART);
  const r = await Promise.allSettled(names.map((n) => gen(n, outdir)));
  for (const x of r) if (x.status === 'rejected') console.error(x.reason.message);
}

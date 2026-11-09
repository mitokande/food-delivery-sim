// The store apps' icon and splash for Idle Restaurant Manager, from the AI-generated subject (tools/genart.mjs 'app-icon': a
// transparent 1024 PNG). It goes on the boot screen's sunset gradient (css/game.css #boot), like the courier icon
// before it (icon.py). Writes the sources @capacitor/assets turns into every Android / iOS size:
//
//   OPENAI_API_KEY=… node tools/genart.mjs /tmp/fds-art app-icon
//   node mobile/scripts/icon-diner.mjs /tmp/fds-art/app-icon.png     [outdir=mobile/assets]
//   cd mobile && npm run assets
//
// icon-only.png        1024, opaque: iOS and the old Android icons (the phone rounds the corners)
// icon-foreground.png  1024, transparent, the subject inside the adaptive icon's safe circle
// icon-background.png  1024, the gradient
// splash.png, splash-dark.png   2732, the gradient with a smaller subject
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const src = process.argv[2], OUT = path.resolve(process.argv[3] || path.join(HERE, '..', 'assets'));
if (!src || !fs.existsSync(src)) { console.error('icon-diner: give the subject PNG (tools/genart.mjs <outdir> app-icon)'); process.exit(1); }
fs.mkdirSync(OUT, { recursive: true });

// radial-gradient(120% 90% at 50% 20%, #ffd28a, #f39a5b 45%, #8f4f6e) as CSS draws it on an n × n box
const gradient = (n) => sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${n}" height="${n}">
  <defs><radialGradient id="g" gradientUnits="userSpaceOnUse" cx="0" cy="0" r="1" gradientTransform="translate(${n * 0.5} ${n * 0.2}) scale(${n * 1.2} ${n * 0.9})">
    <stop offset="0" stop-color="#ffd28a"/><stop offset=".45" stop-color="#f39a5b"/><stop offset="1" stop-color="#8f4f6e"/></radialGradient></defs>
  <rect width="${n}" height="${n}" fill="url(#g)"/></svg>`)).png().toBuffer();

// the subject cropped to what is drawn, with the boot logo's soft drop shadow under it
const art = await sharp(src).ensureAlpha().trim({ threshold: 1 }).toBuffer();
const { width: aw, height: ah } = await sharp(art).metadata();
if (!(await sharp(art).stats()).channels[3] || (await sharp(art).stats()).channels[3].min > 250) { console.error('icon-diner: the subject has no transparent background'); process.exit(1); }
async function placed(n, frac, cy) { // the subject fitted in frac of an n box, its centre at height cy (0 top .. 1 bottom), with its shadow
  const box = Math.round(n * frac), k = Math.min(box / aw, box / ah), w = Math.round(aw * k), h = Math.round(ah * k);
  const a = await sharp(art).resize(w, h).toBuffer();
  const left = Math.round((n - w) / 2), top = Math.round(n * cy - h / 2), off = Math.round(n * 0.014);
  const shadow = await sharp(a).ensureAlpha().linear([0, 0, 0, 0.35], [60, 20, 30, 0]).blur(Math.max(1, n * 0.012)).toBuffer(); // (rgba(60,20,30,.35))
  return [{ input: shadow, left, top: top + off }, { input: a, left, top }];
}
const clear = (n) => sharp({ create: { width: n, height: n, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } });
const save = (img, name) => img.toFile(path.join(OUT, name));

await save(sharp(await gradient(1024)).composite(await placed(1024, 0.82, 0.5)).removeAlpha().png(), 'icon-only.png');
// adaptive icons: @capacitor/assets insets both layers to the 72 dp a launcher shows, whose masks can cut that down
// to a 66 dp circle: the subject stays inside it
await save(clear(1024).composite(await placed(1024, 0.62, 0.5)).png(), 'icon-foreground.png');
await save(sharp(await gradient(1024)).removeAlpha().png(), 'icon-background.png');
const splash = await sharp(await gradient(2732)).composite(await placed(2732, 0.26, 0.5)).removeAlpha().png().toBuffer();
fs.writeFileSync(path.join(OUT, 'splash.png'), splash); fs.writeFileSync(path.join(OUT, 'splash-dark.png'), splash);
console.log('wrote', OUT + ':', 'icon-only.png, icon-foreground.png, icon-background.png, splash.png, splash-dark.png');

// Builds mobile/www: the web game as the store apps ship it. The game's own files are copied unchanged; what the
// site loads from CDNs (three.js and its addons, the Draco decoder, es-module-shims, the Google fonts) comes from
// node_modules / mobile/fonts instead, so the apps start and play offline. @capacitor/core joins the import map for
// js/native.js. Anything that changes shape here (index.html, the three version) stops the build instead of
// shipping a half-offline app.
//
//   node scripts/build-web.mjs        (npm run web; npm run android / ios also sync the native projects)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const MOBILE = path.resolve(HERE, '..'), ROOT = path.resolve(MOBILE, '..'), WWW = path.join(MOBILE, 'www');
const NM = path.join(MOBILE, 'node_modules');
// the game's files the page loads (assets/src holds the raw kits the packed GLBs were made from: only a fallback)
const GAME = ['index.html', 'css', 'js', 'assets/audio', 'assets/icons', 'assets/models'];
const SITE = 'https://mithatck.com/food-delivery-sim/';
const CDN = /cdn\.jsdelivr\.net|unpkg\.com|cdnjs\.cloudflare\.com|fonts\.googleapis\.com|fonts\.gstatic\.com/;

const die = (msg) => { console.error('build-web: ' + msg); process.exit(1); };
const copy = (from, to) => fs.cpSync(from, to, { recursive: true });
const read = (f) => fs.readFileSync(f, 'utf8');
function swap(text, from, to, what) {
  if (!text.includes(from)) die(`${what}: expected to find ${JSON.stringify(from.slice(0, 80))} (did index.html change? update this script)`);
  return text.split(from).join(to);
}

fs.rmSync(WWW, { recursive: true, force: true });
for (const p of GAME) copy(path.join(ROOT, p), path.join(WWW, p));

// ---- three.js: the version the site's import map names, from node_modules
let html = read(path.join(WWW, 'index.html'));
const ver = html.match(/three@([\d.]+)\/build\/three\.module\.js/)?.[1] || die('no three@x.y.z in the import map');
const have = JSON.parse(read(path.join(NM, 'three/package.json'))).version;
if (have !== ver) die(`the game uses three ${ver}, mobile/ has ${have}: run  npm i -E three@${ver}  in mobile/`);
const THREE = path.join(NM, 'three'), VT = path.join(WWW, 'vendor/three');
copy(path.join(THREE, 'build/three.module.js'), path.join(VT, 'build/three.module.js'));
copy(path.join(THREE, 'build/three.core.js'), path.join(VT, 'build/three.core.js'));
copy(path.join(THREE, 'examples/jsm/libs/draco/gltf'), path.join(VT, 'examples/jsm/libs/draco/gltf'));
// the addons the game imports, and what they import in turn
const jsFiles = (dir) => fs.readdirSync(dir, { recursive: true }).filter((f) => f.endsWith('.js')).map((f) => path.join(dir, f));
const todo = new Set();
for (const f of jsFiles(path.join(WWW, 'js'))) for (const m of read(f).matchAll(/from\s+['"]three\/addons\/([^'"]+)['"]/g)) todo.add(m[1]);
for (const rel of todo) {
  const src = path.join(THREE, 'examples/jsm', rel);
  if (!fs.existsSync(src)) die(`three/addons/${rel} is not in three ${ver}`);
  copy(src, path.join(VT, 'examples/jsm', rel));
  for (const m of read(src).matchAll(/(?:from|import)\s*['"](\.{1,2}\/[^'"]+)['"]/g)) todo.add(path.posix.join(path.posix.dirname(rel), m[1]));
}

// ---- the rest of the CDN: es-module-shims (iOS before 16.4 has no import maps), fonts, @capacitor/core
const V = path.join(WWW, 'vendor');
copy(path.join(NM, 'es-module-shims/dist/es-module-shims.js'), path.join(V, 'es-module-shims.js'));
copy(path.join(NM, '@capacitor/core/dist/index.js'), path.join(V, 'capacitor-core.js'));
copy(path.join(MOBILE, 'fonts'), path.join(WWW, 'fonts'));

// ---- index.html
const CDN_THREE = `https://cdn.jsdelivr.net/npm/three@${ver}/`;
html = html.replace(/<link rel="preconnect"[^>]*>\n/g, '');
html = html.replace(/<link rel="manifest"[^>]*>\n/, ''); // an app, not an installable page
html = html.replace(/<link rel="stylesheet" href="https:\/\/fonts\.googleapis\.com\/[^"]*">/, '<link rel="stylesheet" href="fonts/fonts.css">');
html = html.replace(/<script async src="https:\/\/cdn\.jsdelivr\.net\/npm\/es-module-shims@[^"]*"><\/script>/, '<script async src="vendor/es-module-shims.js"></script>');
html = swap(html, `"three": "${CDN_THREE}build/three.module.js",`, `"three": "./vendor/three/build/three.module.js",\n  "@capacitor/core": "./vendor/capacitor-core.js",`, 'import map');
html = swap(html, `"three/addons/": "${CDN_THREE}examples/jsm/"`, '"three/addons/": "./vendor/three/examples/jsm/"', 'import map');
html = swap(html, "'api/collect.php'", `'${SITE}api/collect.php'`, 'boot beacon'); // a failed start still reaches the site
fs.writeFileSync(path.join(WWW, 'index.html'), html);

// ---- the game's own CDN links (the Draco decoder path)
for (const f of jsFiles(path.join(WWW, 'js'))) {
  const s = read(f);
  if (s.includes(CDN_THREE)) fs.writeFileSync(f, s.split(CDN_THREE).join('vendor/three/'));
}

// ---- nothing may still come from a CDN
const left = [path.join(WWW, 'index.html'), ...jsFiles(path.join(WWW, 'js')), ...fs.readdirSync(path.join(WWW, 'css')).map((f) => path.join(WWW, 'css', f))]
  .flatMap((f) => read(f).split('\n').map((l, i) => [f, i + 1, l])).filter(([, , l]) => CDN.test(l));
if (left.length) die('still loaded from a CDN:\n' + left.map(([f, i, l]) => `  ${path.relative(WWW, f)}:${i}  ${l.trim().slice(0, 140)}`).join('\n'));

const size = (d) => fs.readdirSync(d, { recursive: true, withFileTypes: true }).filter((e) => e.isFile()).reduce((n, e) => n + fs.statSync(path.join(e.parentPath, e.name)).size, 0);
console.log(`www: ${(size(WWW) / 1048576).toFixed(1)} MB (three ${ver}, ${[...todo].length} addon files)`);

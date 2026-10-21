// Validates assets/models/props.glb (Draco) in glTF space.   node tools/props-check.mjs [assets/models/props.glb] [--json out.json]
// Per top-level node: translation, bbox (glTF axes, node space incl. translation), triangles, material ids decoded from
// TEXCOORD_0.u ((id+0.5)/16), COLOR_0 presence, material name; checks one mesh/one primitive/material `toy`, no
// children, every triangle single-id (=> faces with different ids never share vertices), origin on the ground.
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import draco3d from 'draco3dgltf';
import fs from 'node:fs';

const args = process.argv.slice(2);
const file = args.find((a) => a.endsWith('.glb')) || new URL('../assets/models/props.glb', import.meta.url).pathname;
const jsonOut = args.includes('--json') ? args[args.indexOf('--json') + 1] : null;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'draco3d.decoder': await draco3d.createDecoderModule() });
const doc = await io.read(file);
const root = doc.getRoot();
const scene = root.getDefaultScene() || root.listScenes()[0];
const raw = JSON.parse((() => { const b = fs.readFileSync(file); const n = b.readUInt32LE(12); return b.subarray(20, 20 + n).toString(); })());
const out = {};
let problems = 0;
const fail = (m) => { problems++; console.log('  FAIL ' + m); };
const f2 = (v) => v.map((x) => x.toFixed(2)).join(', ');
console.log(`${file}  ${(fs.statSync(file).size / 1024).toFixed(1)} KB  draco=${(raw.extensionsUsed || []).includes('KHR_draco_mesh_compression')}`);
console.log('name                   size x,y,z (m)        min y   tris  ids          COLOR_0  extras');
for (const node of scene.listChildren()) {
  const name = node.getName();
  const mesh = node.getMesh();
  const t = node.getTranslation();
  if (node.listChildren().length) fail(`${name}: has child nodes`);
  if (!mesh) { fail(`${name}: no mesh`); continue; }
  const prims = mesh.listPrimitives();
  if (prims.length !== 1) fail(`${name}: ${prims.length} primitives`);
  let tris = 0; const ids = new Set(); let hasCol = true; let mixed = 0;
  const lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9];
  let colSample = null;
  for (const p of prims) {
    const mat = p.getMaterial();
    if (!mat || mat.getName() !== 'toy') fail(`${name}: material ${mat && mat.getName()}`);
    const pos = p.getAttribute('POSITION'), uv = p.getAttribute('TEXCOORD_0'), col = p.getAttribute('COLOR_0');
    if (!col) { hasCol = false; fail(`${name}: no COLOR_0`); }
    if (!uv) { fail(`${name}: no TEXCOORD_0`); continue; }
    const P = pos.getArray(), U = uv.getArray();
    for (let i = 0; i < P.length; i += 3) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], P[i + k] + t[k]); hi[k] = Math.max(hi[k], P[i + k] + t[k]); }
    const idOf = (v) => Math.floor(U[v * 2] * 16);
    const ind = p.getIndices() ? p.getIndices().getArray() : [...Array(P.length / 3).keys()];
    tris += ind.length / 3;
    for (let i = 0; i < ind.length; i += 3) {
      const a = idOf(ind[i]), b = idOf(ind[i + 1]), c = idOf(ind[i + 2]);
      ids.add(a); if (a !== b || a !== c) mixed++;
    }
    for (let v = 0; v < U.length / 2; v++) { if (Math.abs(U[v * 2 + 1] - 0.5) > 0.01) { fail(`${name}: v != 0.5`); break; } }
    if (col) { colSample = { size: col.getElementSize(), type: col.getComponentType(), normalized: col.getNormalized(), first: col.getElement(0, []).map((x) => +x.toFixed(4)) }; }
  }
  if (mixed) fail(`${name}: ${mixed} triangles mix material ids`);
  const size = [hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]];
  const extras = node.getExtras();
  out[name] = { translation: t, min: lo, max: hi, size, tris, ids: [...ids].sort((a, b) => a - b), color0: hasCol, colSample, extras };
  if (name !== 'ferris_wheel_rotor' && Math.abs(lo[1]) > 0.02) fail(`${name}: lowest point y=${lo[1].toFixed(3)} (origin should be on the ground)`);
  console.log(`${name.padEnd(22)} ${f2(size).padEnd(22)} ${lo[1].toFixed(2).padStart(6)} ${String(tris).padStart(6)}  ${JSON.stringify(out[name].ids).padEnd(12)} ${hasCol ? 'yes' : 'NO '}      ${Object.keys(extras).join(',')}` +
    (t.some((x) => Math.abs(x) > 1e-6) ? `  translation=[${f2(t)}]` : ''));
}
// colour-space check: bus_stop base slab is authored #808080 -> expect linear ~0.216
const bs = scene.listChildren().find((n) => n.getName() === 'bus_stop');
if (bs) {
  const acc = bs.getMesh().listPrimitives()[0].getAttribute('COLOR_0');
  let best = null;
  for (let i = 0; i < acc.getCount(); i++) { const g = acc.getElement(i, []); const d = Math.abs(g[0] - g[1]) + Math.abs(g[1] - g[2]) + Math.abs(g[0] - 0.216); if (!best || d < best.d) best = { d, g }; }
  console.log(`COLOR_0 check: #808080 (bus_stop base) reads ${best.g.map((x) => x.toFixed(4)).join(', ')} (expect ~0.216 linear); ` +
    `accessor ${acc.getComponentType()} normalized=${acc.getNormalized()} size=${acc.getElementSize()}`);
  if (Math.abs(best.g[0] - 0.216) > 0.01) fail('COLOR_0 is not linear');
}
// orientation: front = +Z
const centroid = (name, pred) => {
  const n = scene.listChildren().find((x) => x.getName() === name); if (!n) return null;
  const p = n.getMesh().listPrimitives()[0]; const P = p.getAttribute('POSITION').getArray(), U = p.getAttribute('TEXCOORD_0').getArray();
  const s = [0, 0, 0]; let c = 0;
  for (let i = 0; i < P.length / 3; i++) { const v = [P[i * 3], P[i * 3 + 1], P[i * 3 + 2]]; if (pred(v, Math.floor(U[i * 2] * 16))) { s[0] += v[0]; s[1] += v[1]; s[2] += v[2]; c++; } }
  return c ? s.map((x) => x / c) : null;
};
const orient = [
  ['traffic_light lenses face +Z', () => ['lens_red', 'lens_yellow', 'lens_green'].every((k) => out.traffic_light.extras[k][2] > 0.1)
    && out.traffic_light.extras.lens_red[1] > out.traffic_light.extras.lens_green[1]],
  ['traffic_light glass lenses in front of the head', () => centroid('traffic_light', (v, id) => id === 2)[2] > 0.1],
  ['sign boards face +Z', () => out.sign_post.extras.boards.every((b) => b.normal[2] > 0.99 && b.center[2] > 0)],
  ['chalkboard front faces +Z (tilted back)', () => out.chalkboard.extras.board_front.normal[2] > 0.9],
  ['bench backrest at -Z (sits facing +Z)', () => centroid('bench', (v, id) => id === 0 && v[1] > 0.6)[2] < -0.05],
  ['bus_stop glass back at -Z (open to +Z)', () => centroid('bus_stop', (v, id) => id === 2 && v[0] > -1.3)[2] < -0.3],
  ['railing origin at left end, runs +X', () => Math.abs(out.railing.min[0]) < 0.2 && out.railing.max[0] > 1.95],
  ['ferris rotor node at hub height', () => Math.abs(out.ferris_wheel_rotor.translation[1] - out.ferris_wheel_rotor.extras.hub_height) < 1e-3],
];
for (const [label, fn] of orient) { let ok = false; try { ok = fn(); } catch (e) { ok = false; } console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}`); if (!ok) problems++; }
const mats = root.listMaterials().map((m) => m.getName());
console.log(`materials: ${JSON.stringify(mats)}  textures: ${root.listTextures().length}  top-level nodes: ${scene.listChildren().length}`);
if (mats.length !== 1 || mats[0] !== 'toy') fail('expected exactly one material `toy`');
if (root.listTextures().length) fail('image textures present');
console.log(problems ? `PROBLEMS: ${problems}` : 'ALL OK');
if (jsonOut) fs.writeFileSync(jsonOut, JSON.stringify(out, null, 1));

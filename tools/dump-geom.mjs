// Dumps world-space geometry (per top-level node, children flattened at rest pose) of a GLB to JSON,
// used by tools/build-manifest.py.   node tools/dump-geom.mjs <in.glb> <out.json> [--src-dir <kenney GLB dir>]
// With --src-dir, the input is a directory of Kenney source GLBs (one piece per file) instead.
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import draco3d from 'draco3dgltf';
import fs from 'node:fs';
import path from 'node:path';

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'draco3d.decoder': await draco3d.createDecoderModule() });

const mul = (a, b) => { const r = new Array(16); for (let c = 0; c < 4; c++) for (let row = 0; row < 4; row++) { let s = 0; for (let k = 0; k < 4; k++) s += a[k * 4 + row] * b[c * 4 + k]; r[c * 4 + row] = s; } return r; };
const I = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
function inv3T(m) { // normal matrix = inverse transpose of upper 3x3 (column-major m)
  const a = [m[0], m[1], m[2], m[4], m[5], m[6], m[8], m[9], m[10]]; // columns
  const [a00, a01, a02, a10, a11, a12, a20, a21, a22] = a;
  const b01 = a22 * a11 - a12 * a21, b11 = -a22 * a10 + a12 * a20, b21 = a21 * a10 - a11 * a20;
  const det = a00 * b01 + a01 * b11 + a02 * b21;
  const inv = [b01, -a22 * a01 + a02 * a21, a12 * a01 - a02 * a11, b11, a22 * a00 - a02 * a20, -a12 * a00 + a02 * a10, b21, -a21 * a00 + a01 * a20, a11 * a00 - a01 * a10].map((v) => v / det);
  // inv is column-major inverse; transpose it
  return [inv[0], inv[3], inv[6], inv[1], inv[4], inv[7], inv[2], inv[5], inv[8]];
}
function collect(rootNodes, base = I) {
  const P = [], N = [], UV = [], IDX = []; const parts = [];
  const walk = (n, parent) => {
    const w = mul(parent, n.getMatrix());
    const mesh = n.getMesh();
    if (mesh) {
      const nm = inv3T(w);
      for (const p of mesh.listPrimitives()) {
        const pos = p.getAttribute('POSITION').getArray(), nor = p.getAttribute('NORMAL')?.getArray(), uv = p.getAttribute('TEXCOORD_0')?.getArray();
        const ind = p.getIndices() ? p.getIndices().getArray() : [...Array(pos.length / 3).keys()];
        const off = P.length / 3;
        for (let i = 0; i < pos.length; i += 3) {
          const x = pos[i], y = pos[i + 1], z = pos[i + 2];
          P.push(w[0] * x + w[4] * y + w[8] * z + w[12], w[1] * x + w[5] * y + w[9] * z + w[13], w[2] * x + w[6] * y + w[10] * z + w[14]);
          if (nor) { const a = nor[i], b = nor[i + 1], c = nor[i + 2];
            let nx = nm[0] * a + nm[3] * b + nm[6] * c, ny = nm[1] * a + nm[4] * b + nm[7] * c, nz = nm[2] * a + nm[5] * b + nm[8] * c;
            const l = Math.hypot(nx, ny, nz) || 1; N.push(nx / l, ny / l, nz / l); } else N.push(0, 1, 0);
          if (uv) UV.push(uv[(i / 3) * 2], uv[(i / 3) * 2 + 1]); else UV.push(-1, -1);
        }
        for (const k of ind) IDX.push(k + off);
        parts.push({ node: n.getName(), material: p.getMaterial()?.getName() || null, tris: ind.length / 3 });
      }
    }
    for (const c of n.listChildren()) walk(c, w);
  };
  for (const r of rootNodes) walk(r, base);
  return { P, N, UV, IDX, parts };
}
const args = process.argv.slice(2);
const out = {};
if (args[2] === '--src-dir') {
  const dir = args[0];
  for (const f of fs.readdirSync(dir).filter((f) => f.endsWith('.glb')).sort()) {
    const doc = await io.read(path.join(dir, f));
    const sc = doc.getRoot().getDefaultScene() || doc.getRoot().listScenes()[0];
    out[f.slice(0, -4)] = collect(sc.listChildren());
  }
} else {
  const doc = await io.read(args[0]);
  const sc = doc.getRoot().getDefaultScene() || doc.getRoot().listScenes()[0];
  for (const top of sc.listChildren()) {
    const g = collect([top]);
    g.children = top.listChildren().map((c) => ({ name: c.getName(), translation: c.getTranslation(), rotation: c.getRotation(), scale: c.getScale(), children: c.listChildren().map((cc) => cc.getName()) }));
    g.matrix = top.getMatrix();
    g.extras = top.getExtras();
    out[top.getName()] = g;
  }
}
fs.writeFileSync(args[1], JSON.stringify(out));
console.log('dumped', Object.keys(out).length, 'pieces ->', args[1]);

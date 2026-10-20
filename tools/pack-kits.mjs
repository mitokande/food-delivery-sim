// Packs the Kenney CC0 kits (assets/src/kenney) into one Draco GLB per kit.
//
//   node tools/pack-kits.mjs            (run from anywhere; paths are resolved from this file)
//
// Per kit: ONE material (named after the kit) + ONE embedded colormap PNG shared by every piece,
// every piece a top-level node named exactly like the Kenney file, node transform identity,
// geometry in kit units as in the source.
//   - city kits + food: all sub-nodes are baked into a single mesh per piece (positions/normals
//     transformed exactly, UVs untouched), so the game can merge pieces per chunk.
//     Exception: windmill / windmill-low keep their `blades` child (pivot at the hub) so it can spin.
//   - cars: hierarchy kept (body, wheel-front-left, … door/arm/spoiler…) under an identity root node.
//   - TANGENT attributes are dropped (no normal maps; Kenney exports them for Unity).
//   - industrial "colormap-specular" (identical PBR params, same texture) is merged into `industrial`.
//   - food glass lids keep a second material `food-glass` (transparent), only on 2 pieces.
// Texture sampler: mag LINEAR, min LINEAR_MIPMAP_LINEAR (see assets/models/tex/README.md).

import { Document, NodeIO, TextureInfo, PropertyType } from '@gltf-transform/core';
import { ALL_EXTENSIONS, KHRDracoMeshCompression } from '@gltf-transform/extensions';
import { mergeDocuments, transformPrimitive, joinPrimitives, dedup, prune, draco } from '@gltf-transform/functions';
import draco3d from 'draco3dgltf';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'assets/src/kenney');
const OUT = path.join(ROOT, 'assets/models');

const KITS = [
  { out: 'kit-roads.glb', mat: 'roads', dir: 'kenney_city-kit-roads' },
  { out: 'kit-commercial.glb', mat: 'commercial', dir: 'kenney_city-kit-commercial_2.1' },
  { out: 'kit-suburban.glb', mat: 'suburban', dir: 'kenney_city-kit-suburban_20' },
  { out: 'kit-industrial.glb', mat: 'industrial', dir: 'kenney_city-kit-industrial_2.0', keepChildren: ['windmill', 'windmill-low'] },
  {
    out: 'kit-cars.glb', mat: 'cars', dir: 'kenney_car-kit', hierarchy: true,
    only: ['ambulance', 'delivery', 'delivery-flat', 'firetruck', 'garbage-truck', 'hatchback-sports', 'police', 'sedan',
      'sedan-sports', 'suv', 'suv-luxury', 'taxi', 'truck', 'truck-flat', 'van', 'cone', 'cone-flat', 'box'],
  },
  { out: 'kit-food.glb', mat: 'food', dir: 'kenney_food-kit' },
];

const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'draco3d.encoder': await draco3d.createEncoderModule(), 'draco3d.decoder': await draco3d.createDecoderModule() });

// Smallest lossless PNG of the palette (RGBA with constant alpha → RGB).
function palettePNG(file) {
  const tmp = path.join(fs.mkdtempSync('/tmp/fds-pack-'), 'p.png');
  execFileSync('python3', ['-I', '-c', `
import sys
from PIL import Image
im = Image.open(sys.argv[1])
if im.mode == 'RGBA' and im.getextrema()[3] == (255, 255):
    im.convert('RGB').save(sys.argv[2], optimize=True)
else:
    im.save(sys.argv[2], optimize=True)
`, file, tmp]);
  const a = fs.readFileSync(file), b = fs.readFileSync(tmp);
  fs.rmSync(path.dirname(tmp), { recursive: true });
  return b.length < a.length ? b : a;
}

// Column-major 4x4 helpers (glTF convention).
const mat4 = {
  create: () => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
  multiply(out, a, b) {
    const r = new Array(16);
    for (let c = 0; c < 4; c++) for (let row = 0; row < 4; row++) {
      let s = 0;
      for (let k = 0; k < 4; k++) s += a[k * 4 + row] * b[c * 4 + k];
      r[c * 4 + row] = s;
    }
    for (let i = 0; i < 16; i++) out[i] = r[i];
    return out;
  },
};
function localMatrix(node) { return node.getMatrix(); }
function worldMatrixWithin(node, stopAt) {
  // world matrix of `node` relative to the scene root (stopAt = null)
  const chain = [];
  for (let n = node; n && n !== stopAt; n = n.getParentNode()) chain.unshift(n);
  const m = mat4.create();
  for (const n of chain) mat4.multiply(m, m, localMatrix(n));
  return m;
}
function isIdentity(m) { const I = mat4.create(); return m.every((v, i) => Math.abs(v - I[i]) < 1e-9); }

function detachedCopy(doc, prim) {
  // Copy a primitive with private accessors (so transforms never touch shared data).
  const p = doc.createPrimitive().setMode(prim.getMode()).setMaterial(prim.getMaterial());
  for (const sem of prim.listSemantics()) {
    if (sem === 'TANGENT') continue;
    p.setAttribute(sem, prim.getAttribute(sem).clone());
  }
  if (prim.getIndices()) p.setIndices(prim.getIndices().clone());
  return p;
}

for (const kit of KITS) {
  const dir = path.join(SRC, kit.dir, 'Models/GLB format');
  const names = fs.readdirSync(dir).filter((f) => f.endsWith('.glb')).map((f) => f.slice(0, -4)).sort()
    .filter((n) => !kit.only || kit.only.includes(n));
  if (kit.only) for (const n of kit.only) if (!names.includes(n)) throw new Error(`${kit.out}: missing ${n}`);

  const doc = new Document();
  const buffer = doc.createBuffer();
  const scene = doc.createScene(kit.mat);
  doc.getRoot().setDefaultScene(scene);

  const tex = doc.createTexture('colormap-' + kit.mat).setMimeType('image/png').setURI(kit.mat + '.png')
    .setImage(palettePNG(path.join(dir, 'Textures/colormap.png')));
  const material = doc.createMaterial(kit.mat)
    .setBaseColorTexture(tex).setBaseColorFactor([1, 1, 1, 1])
    .setMetallicFactor(0).setRoughnessFactor(1).setDoubleSided(true);
  material.getBaseColorTextureInfo()
    .setMagFilter(TextureInfo.MagFilter.LINEAR).setMinFilter(TextureInfo.MinFilter.LINEAR_MIPMAP_LINEAR)
    .setWrapS(TextureInfo.WrapMode.REPEAT).setWrapT(TextureInfo.WrapMode.REPEAT);
  let glass = null; // food-kit transparent lids

  const srcMaterialFor = (m) => {
    if (!m) return material;
    const n = m.getName();
    if (n === 'colormap' || n === 'colormap-specular') return material;
    if (n === 'glass') {
      if (!glass) {
        glass = doc.createMaterial(kit.mat + '-glass')
          .setBaseColorFactor(m.getBaseColorFactor()).setMetallicFactor(m.getMetallicFactor())
          .setRoughnessFactor(m.getRoughnessFactor()).setEmissiveFactor(m.getEmissiveFactor())
          .setAlphaMode(m.getAlphaMode()).setDoubleSided(m.getDoubleSided());
      }
      return glass;
    }
    throw new Error('unexpected material ' + n);
  };

  for (const name of names) {
    const src = await io.read(path.join(dir, name + '.glb'));
    const srcScene = src.getRoot().getDefaultScene() || src.getRoot().listScenes()[0];
    const map = mergeDocuments(doc, src);
    const mScene = map.get(srcScene);
    const roots = mScene.listChildren();
    // Everything merged lives in the single buffer.
    for (const b of doc.getRoot().listBuffers()) if (b !== buffer) {
      for (const a of doc.getRoot().listAccessors()) if (a.getBuffer() === b) a.setBuffer(buffer);
      b.dispose();
    }

    const top = doc.createNode(name);
    scene.addChild(top);

    const keepKids = kit.hierarchy || (kit.keepChildren || []).includes(name);
    if (keepKids) {
      // Single identity root named like the file → reuse its mesh on `top`, keep its children.
      // Otherwise (cars: several roots) → roots become children of `top` with their local transforms.
      if (roots.length === 1 && roots[0].getName() === name && isIdentity(roots[0].getMatrix())) {
        const r = roots[0];
        if (r.getMesh()) top.setMesh(r.getMesh());
        for (const c of r.listChildren()) top.addChild(c);
        mScene.removeChild(r); r.dispose();
      } else {
        for (const r of roots) { mScene.removeChild(r); top.addChild(r); }
      }
      // Fix up materials, drop tangents, give meshes unique names. three.js' GLTFLoader de-duplicates node names
      // across the file (2nd "wheel-front-left" becomes "wheel-front-left_1"), so the original part name is
      // also stored in node extras -> object.userData.part.
      top.traverse((n) => {
        if (n !== top) n.setExtras({ ...n.getExtras(), part: n.getName() });
        const m = n.getMesh(); if (!m) return;
        m.setName(n === top ? name : `${name}:${n.getName()}`);
        for (const p of m.listPrimitives()) {
          p.setMaterial(srcMaterialFor(p.getMaterial()));
          if (p.getAttribute('TANGENT')) p.setAttribute('TANGENT', null);
        }
      });
    } else {
      // Bake every mesh in the source scene into one mesh on `top` (grouped by material).
      const byMat = new Map();
      for (const r of roots) r.traverse((n) => {
        const m = n.getMesh(); if (!m) return;
        const world = worldMatrixWithin(n, null);
        for (const p of m.listPrimitives()) {
          const c = detachedCopy(doc, p);
          if (!isIdentity(world)) transformPrimitive(c, world);
          const mat = srcMaterialFor(p.getMaterial());
          c.setMaterial(mat);
          if (!byMat.has(mat)) byMat.set(mat, []);
          byMat.get(mat).push(c);
        }
      });
      const mesh = doc.createMesh(name);
      for (const [mat, prims] of byMat) {
        const joined = prims.length === 1 ? prims[0] : joinPrimitives(prims);
        joined.setMaterial(mat);
        mesh.addPrimitive(joined);
        if (prims.length > 1) prims.forEach((p) => p.dispose());
      }
      top.setMesh(mesh);
      for (const r of roots) { mScene.removeChild(r); r.dispose(); }
    }
    mScene.dispose();
  }

  // Remove everything that came from the sources but is no longer used (old materials, textures…).
  for (const m of doc.getRoot().listMaterials()) if (m !== material && m !== glass) m.dispose();
  for (const t of doc.getRoot().listTextures()) if (t !== tex) t.dispose();
  for (const s of doc.getRoot().listScenes()) if (s !== scene) s.dispose();
  for (const e of doc.getRoot().listExtensionsUsed()) e.dispose();

  await doc.transform(
    prune({ keepLeaves: true, keepAttributes: true }),
    dedup({ propertyTypes: [PropertyType.ACCESSOR, PropertyType.MESH] }),
    prune({ keepLeaves: true, keepAttributes: true }),
    draco({ method: 'edgebreaker', encodeSpeed: 5, decodeSpeed: 5, quantizePosition: 16, quantizeNormal: 12,
      quantizeTexcoord: 14, quantizeGeneric: 12, quantizationVolume: 'scene' }),
  );
  doc.createExtension(KHRDracoMeshCompression).setRequired(true);

  // Sanity: one top-level node per file, identity, named like the file.
  const tops = scene.listChildren();
  if (tops.length !== names.length) throw new Error(`${kit.out}: ${tops.length} tops vs ${names.length}`);
  for (const t of tops) if (!isIdentity(t.getMatrix())) throw new Error(`${kit.out}: ${t.getName()} not identity`);

  const outPath = path.join(OUT, kit.out);
  await io.write(outPath, doc);
  const mats = doc.getRoot().listMaterials().map((m) => m.getName());
  console.log(`${kit.out}: ${names.length} pieces, materials [${mats}], ${(fs.statSync(outPath).size / 1024).toFixed(1)} KB`);
}

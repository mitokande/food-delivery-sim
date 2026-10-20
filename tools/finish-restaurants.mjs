// Post-processes the Blender export of tools/blender/restaurants.py into assets/models/restaurants.glb
//   node tools/finish-restaurants.mjs [/tmp/restaurants-raw.glb]
// - material names: "brand@rest-burger" -> "brand" (Blender needs unique names, the game wants plain ones)
// - food colormap sampler (mag LINEAR, min LINEAR_MIPMAP_LINEAR), dedupe, prune
// - checks: one identity top-level node per landmark, footprint <= 0.96, height, tris, materials
// - Draco (same settings as the kits)
import { NodeIO, TextureInfo, PropertyType } from '@gltf-transform/core';
import { ALL_EXTENSIONS, KHRDracoMeshCompression } from '@gltf-transform/extensions';
import { dedup, prune, draco, getBounds } from '@gltf-transform/functions';
import draco3d from 'draco3dgltf';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const IN = process.argv[2] || '/tmp/restaurants-raw.glb';
const OUT = path.join(ROOT, 'assets/models/restaurants.glb');
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'draco3d.encoder': await draco3d.createEncoderModule(), 'draco3d.decoder': await draco3d.createDecoderModule() });

const doc = await io.read(IN);
const root = doc.getRoot();
for (const m of root.listMaterials()) {
  m.setName(m.getName().split('@')[0]);
  const ti = m.getBaseColorTextureInfo();
  if (m.getBaseColorTexture() && ti) {
    ti.setMagFilter(TextureInfo.MagFilter.LINEAR).setMinFilter(TextureInfo.MinFilter.LINEAR_MIPMAP_LINEAR);
  }
}
for (const t of root.listTextures()) if (t.getName() === '' || /colormap/.test(t.getName())) t.setName('colormap-food');

await doc.transform(dedup({ propertyTypes: [PropertyType.ACCESSOR, PropertyType.TEXTURE] }), prune());
// (materials are NOT deduped: brand and awning stay separate even when they share a colour)

const scene = root.getDefaultScene() || root.listScenes()[0];
let ok = true;
for (const n of scene.listChildren()) {
  const m = n.getMatrix();
  const ident = m.every((v, i) => Math.abs(v - [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1][i]) < 1e-6);
  const { min, max } = getBounds(n);
  let tris = 0; const mats = new Set();
  n.traverse((c) => { const me = c.getMesh(); if (!me) return; for (const p of me.listPrimitives()) { tris += p.getIndices().getCount() / 3; mats.add(p.getMaterial().getName()); } });
  const fx = Math.max(-min[0], max[0]) * 2, fz = Math.max(-min[2], max[2]) * 2;
  const warn = [];
  if (!ident) warn.push('NOT IDENTITY');
  if (fx > 0.961 || fz > 0.961) warn.push(`FOOTPRINT ${fx.toFixed(3)}x${fz.toFixed(3)}`);
  if (max[1] > 1.65) warn.push(`HEIGHT ${max[1].toFixed(2)}`);
  if (tris > 6000) warn.push('TRIS');
  if (mats.size > 8) warn.push('MATERIALS');
  if (warn.length) ok = false;
  console.log(`${n.getName().padEnd(14)} tris ${String(tris).padStart(5)}  mats ${mats.size} [${[...mats].sort()}]  bbox x ${min[0].toFixed(3)}..${max[0].toFixed(3)} y ${min[1].toFixed(3)}..${max[1].toFixed(3)} z ${min[2].toFixed(3)}..${max[2].toFixed(3)}  children [${n.listChildren().map((c) => c.getName())}] ${warn.join(' ')}`);
}
await doc.transform(draco({ method: 'edgebreaker', encodeSpeed: 5, decodeSpeed: 5, quantizePosition: 16, quantizeNormal: 12,
  quantizeTexcoord: 14, quantizeGeneric: 12, quantizationVolume: 'scene' }));
doc.createExtension(KHRDracoMeshCompression).setRequired(true);
await io.write(OUT, doc);
console.log(`${ok ? 'OK' : 'CHECK WARNINGS'} -> ${OUT} ${(fs.statSync(OUT).size / 1024).toFixed(1)} KB, materials: ${root.listMaterials().map((m) => m.getName())}`);

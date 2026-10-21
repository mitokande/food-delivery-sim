// Car models for traffic, parked hazards and event props. Prefers the glossy toy cars (cars.glb, one mesh per type
// with a per-face material id in uv.x) and falls back to the Kenney car kit. Paint varies per instance through
// instanceColor (only faces with id 1 take it); lights glow at night.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { loadKit, pieceParts, getNode } from '../assets.js';
import { useEnv } from '../look.js';

export const CAR_SCALE = 1.6; // Kenney kit only
export const PAINTS = ['#e8483a', '#2f7fd8', '#f2c230', '#3fae5a', '#f6f4ee', '#2b2f3a', '#8a5cc8', '#ff8a3d', '#4fc3d6', '#c8ccd2', '#d94f8a', '#1f5fa8'].map((h) => new THREE.Color(h));
export const carUni = { uNight: { value: 0 } };
let toyOK = null;

export async function loadCars(types) {
  await Promise.all([loadKit('toycars'), loadKit('cars', [...types, 'cone'])]);
  toyOK = !!getNode('toycars', 'sedan');
  return toyOK;
}

let mat = null;
function toyCarMaterial() {
  if (mat) return mat;
  mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.4, metalness: 0 });
  mat.name = 'toycar';
  useEnv(mat, 0.85);
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uNight = carUni.uNight;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying float vCid;')
      .replace('#include <color_vertex>', `#include <color_vertex>
        vCid = floor(uv.x * 16.0);
        #ifdef USE_INSTANCING_COLOR
          // three multiplies every vertex by the instance colour; only the paint (id 1) should take it
          if (abs(vCid - 1.0) < 0.5) vColor.xyz = color.xyz * instanceColor.xyz * 1.08; else vColor.xyz = color.xyz;
        #endif`);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vCid; uniform float uNight;')
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        if (abs(vCid - 2.0) < 0.5) roughnessFactor = 0.06;
        else if (abs(vCid - 1.0) < 0.5 || abs(vCid - 8.0) < 0.5) roughnessFactor = 0.24;
        else if (abs(vCid - 5.0) < 0.5) roughnessFactor = 0.16;
        else if (abs(vCid - 6.0) < 0.5) roughnessFactor = 0.92;
        else roughnessFactor = 0.55;`)
      .replace('#include <metalnessmap_fragment>', `#include <metalnessmap_fragment>
        if (abs(vCid - 5.0) < 0.5) metalnessFactor = 0.85;`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        if (abs(vCid - 3.0) < 0.5) totalEmissiveRadiance += vec3(1.0, 0.92, 0.75) * (0.12 + 1.4 * uNight);
        if (abs(vCid - 4.0) < 0.5) totalEmissiveRadiance += vec3(1.0, 0.15, 0.1) * (0.2 + 1.1 * uNight);
        if (abs(vCid - 10.0) < 0.5) totalEmissiveRadiance += diffuseColor.rgb * 1.2;`);
  };
  mat.customProgramCacheKey = () => 'toycar1';
  return mat;
}

const cache = new Map();
// { geo, mat, len, width, toy }
export function carModel(type) {
  if (cache.has(type)) return cache.get(type);
  let r = null;
  const node = toyOK ? getNode('toycars', type) : null;
  if (node) {
    const parts = pieceParts('toycars', type);
    const geo = parts.length === 1 ? parts[0].geometry : mergeGeometries(parts.map((p) => p.geometry));
    geo.computeBoundingBox();
    const b = geo.boundingBox;
    r = { geo, mat: toyCarMaterial(), len: b.max.z - b.min.z, width: b.max.x - b.min.x, toy: true };
  } else {
    const parts = pieceParts('cars', type);
    if (parts.length) {
      const geo = mergeGeometries(parts.map((p) => p.geometry.clone()));
      geo.scale(CAR_SCALE, CAR_SCALE, CAR_SCALE); geo.computeBoundingBox(); geo.translate(0, -geo.boundingBox.min.y, 0);
      const b = geo.boundingBox;
      r = { geo, mat: new THREE.MeshStandardMaterial({ map: parts[0].material.map, color: 0xffffff, roughness: 0.55, metalness: 0.05 }), len: b.max.z - b.min.z, width: b.max.x - b.min.x, toy: false };
    }
  }
  cache.set(type, r);
  return r;
}

// a single car as a one-instance InstancedMesh, so the paint tint works the same as in traffic
export function carObject(type, paint = PAINTS[Math.floor(Math.random() * PAINTS.length)]) {
  const m = carModel(type); if (!m) return null;
  const im = new THREE.InstancedMesh(m.geo, m.mat, 1);
  im.setMatrixAt(0, new THREE.Matrix4()); im.setColorAt(0, paint instanceof THREE.Color ? paint : new THREE.Color(paint));
  im.castShadow = true; im.receiveShadow = true; im.frustumCulled = false;
  return im;
}

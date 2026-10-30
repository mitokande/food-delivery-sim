// Glowing chevron ribbon laid on the road along a route (ride guidance + hub route preview).
import * as THREE from 'three';
import { sampleRoute } from '../city/graph.js';

const uni = { uTime: { value: 0 }, uFrom: { value: 0 }, uTo: { value: 1e9 }, uFade: { value: 0 } };
export const ribbonTime = uni.uTime;

function makeMat(color, chevrons) {
  return new THREE.ShaderMaterial({
    uniforms: { ...uni, uColor: { value: new THREE.Color(color) }, uChev: { value: chevrons ? 1 : 0 } },
    transparent: true, depthWrite: false, fog: false,
    polygonOffset: true, polygonOffsetFactor: -4,
    vertexShader: 'attribute float aS; attribute float aV; varying float vS; varying float vV; void main(){ vS=aS; vV=aV; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
    fragmentShader: `uniform vec3 uColor; uniform float uTime, uFrom, uTo, uFade, uChev, uB0, uB1; varying float vS; varying float vV;
      void main(){
        if (vS < uFrom || vS > uTo) discard;
        float a;
        // a brake zone (late brake) turns its stretch of arrows red
        vec3 base = vS > uB0 && vS < uB1 ? vec3(1.0, 0.27, 0.2) : uColor;
        vec3 col = base;
        if (uChev > 0.5) {
          // chunky arcade chevrons: dark-blue rim, bright body, pale core
          float p = fract((vS - uTime * 6.0) / 2.7);
          float x = abs(vV - 0.5) * 2.0;
          float ad = abs(p - 0.56 + x * 0.34);
          float edge = smoothstep(1.0, 0.82, x);
          a = smoothstep(0.205, 0.175, ad) * edge * 0.95;
          col = mix(base * vec3(0.32, 0.55, 0.85), base, smoothstep(0.18, 0.15, ad));
          col = mix(col, vec3(0.86, 0.98, 1.0), smoothstep(0.075, 0.0, ad - 0.01 * x) * 0.6);
        } else {
          float edge = smoothstep(0.0, 0.18, vV) * smoothstep(1.0, 0.82, vV);
          float dash = 0.55 + 0.45 * step(0.5, fract((vS - uTime * 8.0) / 5.0));
          a = edge * dash * 0.9;
        }
        float fadeNear = uFade > 0.0 ? smoothstep(uFrom, uFrom + 3.0, vS) * (1.0 - smoothstep(uFrom + uFade * 0.6, uFrom + uFade, vS)) : 1.0;
        gl_FragColor = vec4(col, a * fadeNear);
        #include <colorspace_fragment>
      }`,
  });
}

export function buildRibbon(route, { width = 1.6, y = 0.12, step = 1.2, color = '#4fd4ff', chevrons = true, from = 0, to = Infinity } = {}) {
  const pos = [], aS = [], aV = [], idx = [];
  const o = [0, 0, 0, 0];
  const end = Math.min(route.length, to);
  let n = 0;
  for (let s = from; s <= end + 0.001; s += step) {
    sampleRoute(route, Math.min(s, end), o);
    const hd = o[2], rx = -Math.cos(hd), rz = Math.sin(hd);
    pos.push(o[0] - rx * width / 2, y, o[1] - rz * width / 2, o[0] + rx * width / 2, y, o[1] + rz * width / 2);
    aS.push(s, s); aV.push(0, 1);
    if (n > 0) { const a = (n - 1) * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    n++;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aS', new THREE.Float32BufferAttribute(aS, 1));
  g.setAttribute('aV', new THREE.Float32BufferAttribute(aV, 1));
  g.setIndex(idx);
  const mat = makeMat(color, chevrons);
  const m = new THREE.Mesh(g, mat);
  m.renderOrder = 2; m.frustumCulled = false;
  m.userData.setWindow = (a, b, fade = 0) => { mat.uniforms.uFrom.value = a; mat.uniforms.uTo.value = b; mat.uniforms.uFade.value = fade; };
  m.userData.setBrake = (a, b) => { mat.uniforms.uB0.value = a; mat.uniforms.uB1.value = b; };
  // per-mesh copies of the window uniforms so several ribbons can coexist
  mat.uniforms.uFrom = { value: 0 }; mat.uniforms.uTo = { value: 1e9 }; mat.uniforms.uFade = { value: 0 };
  mat.uniforms.uB0 = { value: -1 }; mat.uniforms.uB1 = { value: -1 };
  return m;
}

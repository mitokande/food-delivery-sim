// Art direction: the global colour grade (a custom tone-mapping curve every material runs through) and a soft
// outdoor environment map for the glossy "toy" materials (cars, scooter paint, helmets).
import * as THREE from 'three';

// Saturated, warm-highlight / cool-shadow grade on top of a Khronos-neutral style shoulder.
// Runs inside every lit material's fragment shader (no extra render pass).
const GRADE = `vec3 CustomToneMapping( vec3 color ) {
  color *= toneMappingExposure;
  float l = dot( color, vec3( 0.2126, 0.7152, 0.0722 ) );
  color = max( mix( vec3( l ), color, 1.24 ), 0.0 );
  color *= mix( vec3( 0.93, 0.98, 1.08 ), vec3( 1.04, 1.0, 0.94 ), smoothstep( 0.02, 0.55, l ) );
  const float StartCompression = 0.8 - 0.04;
  const float Desaturation = 0.12;
  float x = min( color.r, min( color.g, color.b ) );
  float offset = x < 0.08 ? x - 6.25 * x * x : 0.04;
  color -= offset;
  float peak = max( color.r, max( color.g, color.b ) );
  if ( peak >= StartCompression ) {
    float d = 1. - StartCompression;
    float newPeak = 1. - d * d / ( peak + d - StartCompression );
    color *= newPeak / peak;
    float g = 1. - 1. / ( Desaturation * ( peak - newPeak ) + 1. );
    color = mix( color, vec3( newPeak ), g );
  }
  vec3 s = pow( clamp( color, 0.0, 1.0 ), vec3( 1.0 / 2.2 ) );
  s = mix( s, s * s * ( 3.0 - 2.0 * s ), 0.22 );
  return pow( s, vec3( 2.2 ) );
}`;

export function installGrade(renderer) {
  const ch = THREE.ShaderChunk;
  if (!ch.tonemapping_pars_fragment.includes('Desaturation = 0.12')) ch.tonemapping_pars_fragment = ch.tonemapping_pars_fragment.replace('vec3 CustomToneMapping( vec3 color ) { return color; }', GRADE);
  renderer.toneMapping = THREE.CustomToneMapping;
  renderer.toneMappingExposure = 1.0;
}

// Environment for reflections: sky gradient above, warm street bounce below, a bright sun patch.
export function makeEnvironment(renderer) {
  const sc = new THREE.Scene();
  const geo = new THREE.SphereGeometry(10, 32, 16);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false,
    vertexShader: 'varying vec3 vD; void main(){ vD = normalize(position); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
    fragmentShader: `varying vec3 vD;
      void main(){
        float y = vD.y;
        vec3 sky = mix(vec3(0.80,0.90,1.0), vec3(0.30,0.55,0.95), smoothstep(0.0, 0.7, y));
        vec3 ground = mix(vec3(0.62,0.55,0.48), vec3(0.32,0.30,0.30), smoothstep(0.0, -0.5, y));
        vec3 c = y > 0.0 ? sky : ground;
        // buildings ring the horizon: a warm band
        c = mix(c, vec3(0.92,0.78,0.62), (1.0 - smoothstep(0.0, 0.22, abs(y - 0.06))) * 0.55);
        float s = max(dot(normalize(vD), normalize(vec3(0.5,0.7,0.35))), 0.0);
        c += vec3(1.0,0.92,0.8) * pow(s, 64.0) * 6.0;
        gl_FragColor = vec4(c, 1.0);
      }`,
  });
  sc.add(new THREE.Mesh(geo, mat));
  const pm = new THREE.PMREMGenerator(renderer);
  const rt = pm.fromScene(sc, 0.02);
  pm.dispose(); geo.dispose(); mat.dispose();
  ENV.map = rt.texture;
  for (const m of envUsers) { m.envMap = ENV.map; m.needsUpdate = true; }
  return rt.texture;
}

// glossy materials register here; they get the env map (and dim it at night)
export const ENV = { map: null, night: 0 };
const envUsers = new Set();
export function useEnv(m, intensity = 1) {
  m.userData.envI = intensity; m.envMap = ENV.map; m.envMapIntensity = intensity * (1 - 0.75 * ENV.night);
  envUsers.add(m); return m;
}
export function setEnvNight(n) { ENV.night = n; for (const m of envUsers) m.envMapIntensity = m.userData.envI * (1 - 0.75 * n); }

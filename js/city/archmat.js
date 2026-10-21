// The one material every procedural building is drawn with. Geometry stays simple (boxes, roofs, awnings);
// this shader paints the detail: plaster/brick, string courses, windows with frames, glass, curtains and
// shutters, shopfronts with fascia boards, roof tiles, striped scalloped awnings, glass curtain walls,
// corrugated sheds, railings, and lit windows at night. Built on MeshLambertMaterial so lights, shadows and
// fog stay standard.
//
// Per-vertex attributes (see arch.js):
//   color  wall / base colour          aFac  (u m, v m, face width m, kind)
//   aWin   (floor h, bay w, ground floor h, seed)    aOpt (balcony floor mask, balcony pattern, window style, shutters)
//   aAlt   accent colour (shutters, shop frame, awning stripe, railing)       uv  sign-atlas coords (kind 4)
import * as THREE from 'three';

export const KIND = { PLAIN: 0, FACADE: 1, ROOF: 2, AWNING: 3, SIGN: 4, CURTAIN: 5, FLAT: 6, CORR: 7, RAIL: 8, TRIM: 10, VALANCE: 11, SHOP: 12, ENTRY: 13, GLOW: 14, PAVE: 15 };

export const archUni = { uNight: { value: 0 }, uSigns: { value: null } };

const VERT_HEAD = `
attribute vec4 aFac; attribute vec4 aWin; attribute vec4 aOpt; attribute vec3 aAlt;
varying vec4 vFac; varying vec4 vWin; varying vec4 vOpt; varying vec3 vAlt; varying vec3 vWp; varying vec2 vSignUv;
`;
const VERT_BODY = `
vFac = aFac; vWin = aWin; vOpt = aOpt; vAlt = aAlt; vSignUv = uv;
vWp = (modelMatrix * vec4(transformed, 1.0)).xyz;
`;

const FRAG_HEAD = `
varying vec4 vFac; varying vec4 vWin; varying vec4 vOpt; varying vec3 vAlt; varying vec3 vWp; varying vec2 vSignUv;
uniform float uNight; uniform sampler2D uSigns;
float ah(vec2 p){ p = fract(p * vec2(233.34, 851.73)); p += dot(p, p + 23.45); return fract(p.x * p.y); }
float avn(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 w = f*f*(3.0-2.0*f);
  return mix(mix(ah(i), ah(i+vec2(1.0,0.0)), w.x), mix(ah(i+vec2(0.0,1.0)), ah(i+vec2(1.0,1.0)), w.x), w.y); }
float box2(vec2 p, vec2 c, vec2 h){ vec2 d = abs(p - c) - h; return max(d.x, d.y); } // <0 inside
vec3 archEmit = vec3(0.0);

// glass pane: q = 0..1 inside the pane, sz = pane size in m, h = per-window hash
vec3 archGlass(vec2 q, vec2 sz, float h, float lit, float interior) {
  vec3 top = vec3(0.70, 0.86, 0.96), bot = vec3(0.17, 0.31, 0.45);
  vec3 g = mix(bot, top, smoothstep(0.05, 1.1, q.y) * 0.85);
  g += vec3(0.22) * smoothstep(0.09, 0.0, abs(q.x * 0.8 - q.y * 0.55 + 0.1 - h * 0.45)) * (0.5 + h);
  if (interior > 0.5) g = mix(g, vec3(0.95, 0.80, 0.55) * (0.55 + 0.4 * q.y), 0.55);
  // curtains on some windows
  float hc = fract(h * 13.7);
  if (interior < 0.5 && hc > 0.45) {
    vec3 cc = hc > 0.8 ? vec3(0.95, 0.93, 0.88) : hc > 0.65 ? vec3(0.93, 0.72, 0.62) : vec3(0.75, 0.86, 0.80);
    float side = step(q.x, 0.2 + 0.08 * sin(q.y * 9.0)) + step(0.8 - 0.08 * sin(q.y * 9.0), q.x);
    g = mix(g, cc * (0.75 + 0.25 * q.y), side * 0.9);
  }
  // recess shadow: the frame shades the top and left of the glass
  float sh = smoothstep(0.16, 0.0, (1.0 - q.y) * sz.y) * 0.45 + smoothstep(0.09, 0.0, q.x * sz.x) * 0.3;
  g *= 1.0 - sh;
  archEmit += (lit > 0.5 ? vec3(1.0, 0.72, 0.38) * (0.65 + 0.35 * q.y) : vec3(0.0)) * uNight;
  return g;
}

void archFacade(inout vec3 col, float kind) {
  float u = vFac.x, v = vFac.y, W = vFac.z;
  float fh = vWin.x, bay = vWin.y, gh = vWin.z, seed = vWin.w;
  float mask = vOpt.x, bpat = vOpt.y, wst = vOpt.z, shut = vOpt.w;
  vec3 wall = col;
  float lum = dot(wall, vec3(0.3, 0.55, 0.15));
  vec3 trim = lum > 0.72 ? wall * 0.86 : mix(vec3(1.0, 0.97, 0.9), wall, 0.12);
  vec3 acc = vAlt;
  // wall surface: plaster blotches, or brick courses
  float n = avn(vec2(u, v) * 0.8 + seed * 40.0) * 0.6 + avn(vec2(u, v) * 3.1 + 9.0) * 0.4;
  if (wst > 4.5) { // brick
    float row = floor(v / 0.22), by = fract(v / 0.22), bx = fract(u / 0.5 + row * 0.5);
    float mortar = step(by, 0.12) + step(bx, 0.06);
    col = wall * (0.86 + 0.22 * ah(vec2(floor(u / 0.5 + row * 0.5), row)));
    col = mix(col, vec3(0.86, 0.82, 0.76), clamp(mortar, 0.0, 1.0) * 0.75);
  } else col = wall * (0.93 + n * 0.12);
  // corner quoins on plaster styles
  float edge = min(u, W - u);
  if (wst < 2.5 && v > 0.4) { float qb = step(0.5, fract(v / 0.7)); if (edge < 0.46 - 0.16 * qb) col = trim * (fract(v / 0.35) < 0.07 ? 0.8 : 0.97); }
  // plinth
  if (v < 0.42) col = mix(wall, vec3(0.55, 0.52, 0.5), 0.55) * (0.9 + n * 0.1);

  float nb = max(1.0, floor((W - 0.6) / bay));
  float m = (W - nb * bay) * 0.5;
  float bu = u - m, bi = floor(bu / bay), bx = bu - (bi + 0.5) * bay;
  bool inb = bu > 0.0 && bi < nb;
  float wh_ = fract(sin(bi * 12.9898 + floor((v - gh) / fh) * 78.233 + seed * 43.1) * 43758.5453);

  if (v < gh) {
    // ---------------- ground floor ----------------
    if (kind == 12.0) {
      // shopfront: framed display windows, a door in one bay, fascia board above
      float doorBay = floor(nb * 0.5 + (seed > 0.5 ? 0.0 : -0.4));
      if (doorBay < 0.0) doorBay = 0.0;
      if (inb && v > 0.42 && v < gh - 0.9 && abs(bx) < bay * 0.45) {
        float hw = bay * 0.45, top = gh - 0.9;
        bool door = bi == doorBay && abs(bx) < 0.62;
        if (door) {
          vec2 q = vec2((bx + 0.62) / 1.24, (v - 0.0) / (top));
          col = acc * 0.8;
          if (abs(bx) < 0.48 && v > top * 0.35 && v < top - 0.12) col = archGlass(vec2((bx + 0.48) / 0.96, (v - top * 0.35) / (top * 0.65 - 0.12)), vec2(0.96, top * 0.65), wh_, 1.0, 1.0);
          if (abs(abs(bx) - 0.62) < 0.05) col = acc * 0.65;
        } else {
          float fr = 0.09;
          col = acc;
          vec2 lo = vec2(-hw + fr, 0.42 + fr * 1.6), hi = vec2(hw - fr, top - fr);
          if (bx > lo.x && bx < hi.x && v > lo.y && v < hi.y) {
            vec2 q = (vec2(bx, v) - lo) / (hi - lo);
            col = archGlass(q, hi - lo, wh_ + 0.37, 1.0, 1.0);
            // shelves / goods silhouettes inside
            float shelf = step(0.92, fract(q.y * 3.0)) * step(0.1, q.x) * step(q.x, 0.9);
            col = mix(col, vec3(0.45, 0.3, 0.2), shelf * 0.6);
            if (abs(q.x - 0.5) * (hi.x - lo.x) < 0.035) col = acc * 0.9; // mullion
          }
          if (v < 0.42 + fr * 1.6 && v > 0.42) col = acc * 0.75; // stall riser
        }
      } else if (v > gh - 0.86 && v < gh - 0.1 && u > m - 0.15 && u < W - m + 0.15) {
        // fascia board
        col = acc * 1.05;
        float b = min(v - (gh - 0.86), (gh - 0.1) - v);
        if (b < 0.06) col = trim;
        if (v < gh - 0.8 && v > gh - 0.86) col = acc * 0.6;
      } else if (inb) {
        col = mix(col, acc * 0.9 + wall * 0.1, 0.45); // pilasters painted to match
      }
      archEmit += (v > 0.5 && v < gh - 0.95 && inb && abs(bx) < bay * 0.4 ? vec3(1.0, 0.78, 0.45) * 0.6 : vec3(0.0)) * uNight;
    } else {
      // residential ground floor: windows, and a front door in the middle bay of the entrance face
      float doorBay = floor(nb * 0.5);
      if (kind == 13.0 && bi == doorBay && abs(bx) < 0.7 && v < 2.55) {
        col = trim;
        if (abs(bx) < 0.56 && v < 2.42) { col = acc * 0.85; if (abs(bx) < 0.4 && v > 1.3 && v < 2.2) col = archGlass(vec2((bx + 0.4) / 0.8, (v - 1.3) / 0.9), vec2(0.8, 0.9), wh_, 0.0, 0.0); }
        if (v < 0.12) col = vec3(0.6, 0.58, 0.55);
      } else if (inb && gh > 2.5) {
        float y0 = 0.95, wh = min(1.5, gh - 1.4), ww = bay * 0.42;
        if (abs(bx) < ww * 0.5 && v > y0 && v < y0 + wh) {
          vec2 q = vec2((bx + ww * 0.5) / ww, (v - y0) / wh);
          col = archGlass(q, vec2(ww, wh), wh_, step(0.55, wh_), 0.0);
          if (abs(bx) > ww * 0.5 - 0.07 || v > y0 + wh - 0.07 || v < y0 + 0.07) col = trim;
        } else if (abs(bx) < ww * 0.5 + 0.1 && v > y0 - 0.12 && v < y0) col = trim * 0.92;
      }
    }
    // string course over the ground floor
    if (v > gh - 0.1 && wst < 3.5) col = trim * 0.95;
    return;
  }

  // ---------------- upper floors ----------------
  float fv = v - gh, fi = floor(fv / fh), fy = fv - fi * fh;
  if (wst < 2.5 && fy < 0.11) { col = trim * (fy < 0.03 ? 0.8 : 0.97); return; }
  if (wst > 2.5 && wst < 3.5) {
    // modern: continuous ribbon windows with mullions
    float y0 = 0.85, y1 = fh - 0.45;
    if (fy > y0 && fy < y1 && u > 0.35 && u < W - 0.35) {
      float mx = fract((u - 0.35) / 1.3);
      col = archGlass(vec2(mx, (fy - y0) / (y1 - y0)), vec2(1.3, y1 - y0), ah(vec2(floor((u - 0.35) / 1.3), fi + seed)), step(0.5, ah(vec2(floor(u / 1.3), fi * 3.0 + seed))), 0.0);
      if (mx < 0.04) col = vec3(0.85, 0.87, 0.9);
    }
    if (fy < 0.18) col = trim * 0.9;
    return;
  }
  if (!inb) return;
  bool balc = mod(floor(mask / pow(2.0, fi)), 2.0) > 0.5 && (bpat > 0.5 && (bpat < 1.5 || (bpat < 2.5 && mod(bi, 2.0) < 0.5 && nb > 1.5) || (bpat > 2.5 && bi == floor(nb * 0.5))));
  float ww = bay * (wst > 3.5 && wst < 4.5 ? 0.55 : 0.42);
  float y0 = balc ? 0.12 : fh * 0.3, wh = fh * 0.86 - y0 - 0.25;
  float hx = ww * 0.5, fr = 0.075;
  float yy = fy - y0;
  bool arched = wst > 0.5 && wst < 1.5;
  // shutters beside the window
  float sw = ww * 0.5;
  if (shut > 0.5 && abs(bx) > hx + 0.03 && abs(bx) < hx + 0.03 + sw && yy > 0.0 && yy < wh) {
    col = acc * (0.86 + 0.18 * step(0.45, fract(yy / 0.09)));
    if (abs(abs(bx) - (hx + 0.03 + sw * 0.5)) > sw * 0.5 - 0.035) col = acc * 0.7;
    return;
  }
  // window opening
  bool inside = abs(bx) < hx && yy > 0.0 && yy < wh;
  if (arched && yy > wh - hx) inside = inside && length(vec2(bx, yy - (wh - hx))) < hx;
  if (inside) {
    bool closed = shut > 0.5 && wh_ > 0.86;
    if (closed) { col = acc * (0.86 + 0.18 * step(0.45, fract(yy / 0.09))); if (abs(bx) < 0.025) col = acc * 0.6; return; }
    float dEdge = min(hx - abs(bx), min(yy, wh - yy));
    if (arched && yy > wh - hx) dEdge = min(dEdge, hx - length(vec2(bx, yy - (wh - hx))));
    if (dEdge < fr) { col = vec3(0.97, 0.96, 0.93); return; }
    vec2 q = vec2((bx + hx) / ww, yy / wh);
    col = archGlass(q, vec2(ww, wh), wh_, step(0.58, wh_), 0.0);
    // glazing bars: one vertical, one transom
    if (abs(bx) < 0.025 || abs(yy - wh * 0.68) < 0.022) col = vec3(0.95, 0.94, 0.9);
    return;
  }
  // frame surround, sill and lintel
  if (abs(bx) < hx + 0.1 && yy < 0.0 && yy > -0.13) { col = trim * (yy < -0.1 ? 0.75 : 0.95); return; }
  if (wst < 0.5 && abs(bx) < hx + 0.14 && yy > wh && yy < wh + 0.2) { col = trim * (yy > wh + 0.16 ? 0.82 : 1.0); return; }
  if (abs(bx) < hx + 0.07 && yy > -0.01 && yy < wh + 0.07 && !arched) col = mix(col, trim, 0.85);
  if (arched && abs(bx) < hx + 0.08 && yy > 0.0 && (yy < wh - hx || length(vec2(bx, yy - (wh - hx))) < hx + 0.08)) col = mix(col, trim, 0.85);
}

void archShade(inout vec4 dc) {
  float kind = floor(vFac.w + 0.5);
  vec3 col = dc.rgb;
  float u = vFac.x, v = vFac.y;
  if (kind == 1.0 || kind == 12.0 || kind == 13.0) archFacade(col, kind);
  else if (kind == 0.0) col *= 0.94 + avn(vec2(u, v) * 0.9) * 0.1;
  else if (kind == 2.0) { // clay roof tiles (u along the eave, v up the slope)
    float row = floor(v / 0.32), ry = fract(v / 0.32), cxi = floor(u / 0.27 + row * 0.5), cx = fract(u / 0.27 + row * 0.5);
    col *= 0.86 + 0.2 * ah(vec2(cxi, row));
    col *= mix(0.66, 1.0, smoothstep(0.0, 0.3, ry));
    col *= 0.9 + 0.1 * sin(cx * 3.14159);
  } else if (kind == 3.0 || kind == 11.0) { // awning canvas: stripes; valance with a scalloped hem
    float st = step(0.5, fract(u / 0.5));
    vec3 c2 = vWin.w > 0.72 ? vAlt * 0.88 : vec3(0.98, 0.96, 0.92);
    col = mix(c2, vAlt, st);
    if (kind == 11.0) {
      float sc = 0.2 + 0.08 * abs(sin(u * 3.14159 / 0.5));
      if (v > sc) discard;
      col *= 0.92;
    } else col *= 0.9 + 0.1 * v;
  } else if (kind == 4.0) { // sign board from the atlas
    vec4 t = texture2D(uSigns, vSignUv);
    col = t.rgb;
    archEmit += t.rgb * 0.35 * uNight;
  } else if (kind == 5.0) { // glass curtain wall
    float fh = vWin.x, pw = vWin.y;
    float px = fract(u / pw), py = fract(v / fh), pi = floor(u / pw), fi = floor(v / fh);
    float hsh = ah(vec2(pi, fi + vWin.w * 17.0));
    vec3 glass = mix(vAlt * 0.55, mix(vec3(0.75, 0.88, 0.97), vAlt, 0.35), smoothstep(-20.0, 90.0, v) * 0.7 + hsh * 0.25);
    glass += vec3(0.25) * smoothstep(0.06, 0.0, abs(px - py * 0.4 - 0.3 - hsh * 0.2)) * step(0.6, hsh);
    col = glass;
    if (py < 0.2) col = mix(vAlt * 0.45, vec3(0.3, 0.33, 0.38), 0.5);
    if (px < 0.035 || px > 0.965 || py < 0.025) col = dc.rgb;
    archEmit += (py > 0.2 && hsh > 0.55 ? vec3(0.95, 0.85, 0.65) * 0.55 : vec3(0.0)) * uNight;
  } else if (kind == 6.0) { // flat roof: gravel / membrane
    col *= 0.86 + 0.18 * avn(vWp.xz * 1.7) + 0.06 * ah(floor(vWp.xz * 9.0));
  } else if (kind == 7.0) { // corrugated sheet
    col *= 0.84 + 0.16 * sin(u * 6.2832 / 0.32);
    col *= 0.92 + 0.12 * avn(vec2(u * 0.5, v * 2.0));
  } else if (kind == 8.0) { // railing bars
    float bar = step(fract(u / 0.15), 0.2), rail = step(v, 0.06) + step(0.9, v);
    if (bar + rail < 0.5) discard;
    col = vAlt;
  } else if (kind == 15.0) { // paving slabs
    vec2 g = vWp.xz / 0.8; vec2 f = fract(g);
    float grout = clamp(step(f.x, 0.04) + step(f.y, 0.04), 0.0, 1.0);
    col *= 0.93 + ah(floor(g)) * 0.12;
    col = mix(col, col * 0.7, grout * 0.6);
  } else if (kind == 14.0) { // lit lamp / neon
    archEmit += col * (0.25 + 1.4 * uNight);
  }
  // contact darkening near the ground (cheap ambient occlusion)
  if (kind != 4.0) col *= mix(0.72, 1.0, smoothstep(0.0, 1.4, vWp.y));
  dc.rgb = col;
}
`;

let mat = null;
export function archMaterial() {
  if (mat) return mat;
  mat = new THREE.MeshLambertMaterial({ vertexColors: true });
  mat.name = 'arch';
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uNight = archUni.uNight; sh.uniforms.uSigns = archUni.uSigns;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\n' + VERT_HEAD).replace('#include <begin_vertex>', '#include <begin_vertex>\n' + VERT_BODY);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\n' + FRAG_HEAD)
      .replace('#include <color_fragment>', '#include <color_fragment>\narchShade(diffuseColor);')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += archEmit;');
  };
  mat.customProgramCacheKey = () => 'arch1';
  return mat;
}

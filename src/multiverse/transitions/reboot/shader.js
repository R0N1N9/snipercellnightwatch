// KERNEL PANIC — two passes.
//   SCREEN  the text-mode display: a grid of character cells (glyph atlas + cell data texture)
//           over a picture layer that is either the old world's last frame coming apart cell
//           by cell (glitch glyphs, ASCII shading, columns dripping down the glass) or the next
//           world arriving the same way in reverse (ASCII art, then the real pixels, cell by
//           cell). The grid sits on the flat face of the tube, behind the same barrel the TTY
//           world's monitor uses (K = 0.024), so its text curves like the world's did.
//   TUBE    the glass: bloom from a quarter-size copy, scanlines, the curved mask, the power-off
//           squeeze to a line and a dot, the power-on degauss wobble, and the final fade.
// Both are the identity at t = 0 (the old frame to the texel) and at the end (the new one).
import { GLSL_NOISE } from '../../kit.js';

const WARP = `
  // flat face (n in -1..1) -> glass, the TTY world's own barrel
  vec2 toGlass(vec2 n, float k) { return n * (1.0 - k * dot(n, n)) / (1.0 - k); }
  vec2 toFlat(vec2 g, float k) {
    vec2 n = g * (1.0 - k);
    for (int i = 0; i < 3; i++) n = g * (1.0 - k) / (1.0 - k * dot(n, n));
    return n;
  }`;

export const SCREEN_FRAG = `
  precision highp float;
  varying vec2 vUv;
  uniform sampler2D tFrom, tTo, tAtlas, tCells, tRows, tPal;
  uniform vec2 uRes, uCell, uGrid, uMax, uAtlasN, uPad;
  uniform float uK, uT, uSeed, uScroll, uTextK;
  uniform float uFromK, uFromBright, uCor0, uSpread, uDrip, uTear, uGlyphK;
  uniform vec2 uFocus, uFromRange, uToRange;
  uniform float uToK, uRast0, uRastRate, uRef0, uRefSpan, uOrder, uRampN, uBlock;
  ${GLSL_NOISE}
  ${WARP}

  vec3 pal(float i) { return texture2D(tPal, vec2((i + 0.5) / 16.0, 0.25)).rgb; }
  float rampGlyph(float i) { return floor(texture2D(tPal, vec2((i + 0.5) / 16.0, 0.75)).r * 255.0 + 0.5); }
  float glyph(float idx, vec2 l) {
    vec2 slot = vec2(mod(idx, uAtlasN.x), floor(idx / uAtlasN.x));
    vec2 inner = uPad + clamp(l, 0.0, 1.0) * (1.0 - 2.0 * uPad);
    return texture2D(tAtlas, (slot + inner) / uAtlasN).r;
  }
  // CSS px, y down <-> texture uv
  vec3 img(sampler2D t, vec2 p) { return texture2D(t, vec2(p.x / uRes.x, 1.0 - p.y / uRes.y)).rgb; }
  vec2 glassOf(vec2 q) { // flat-face px -> glass px
    vec2 n = toGlass(q / uRes * 2.0 - 1.0, uK * 0.024);
    return (n * 0.5 + 0.5) * uRes;
  }
  vec3 cellAvg(sampler2D t, vec2 cell) {
    vec2 a = glassOf((cell + vec2(0.3, 0.3)) * uCell), b = glassOf((cell + vec2(0.7, 0.7)) * uCell);
    return (img(t, a) + img(t, b) + img(t, vec2(a.x, b.y)) + img(t, vec2(b.x, a.y)) + 2.0 * img(t, (a + b) * 0.5)) / 6.0;
  }
  float luma(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }
  // A cell drawn as text: the density ramp picks a character, the cell's own colour lights it.
  vec3 lit(vec3 avg) { return avg / max(0.22, max(avg.r, max(avg.g, avg.b))) * mix(0.55, 1.0, luma(avg)); }
  // range: the picture's own dark and bright luma, so any world fills the whole ramp
  vec3 asText(vec3 avg, vec2 l, float block, vec2 range) {
    float y = clamp((luma(avg) - range.x) / max(0.05, range.y - range.x), 0.0, 1.0);
    float i = clamp(floor(pow(y, 0.85) * uRampN * 1.05), 0.0, uRampN - 1.0);
    return lit(avg) * glyph(block > 0.5 ? uBlock : rampGlyph(i), l);
  }

  // The old world's last frame, coming apart cell by cell.
  vec3 fromLayer(vec2 p, vec2 cell, vec2 l) {
    vec2 src = cell;
    float fade = 1.0;
    // a row slips sideways by whole cells for a beat
    float rowH = hash21(vec2(cell.y, floor(uT * 9.0) + uSeed));
    if (rowH < uTear) src.x += floor((hash21(vec2(cell.y + 3.1, floor(uT * 9.0))) - 0.5) * 18.0);
    // columns drip: below a start row the same cell repeats down the glass, dimmer as it goes
    float hc = hash21(vec2(src.x, uSeed));
    if (hc < uDrip) {
      float t0 = uCor0 + 0.12 + hash21(vec2(src.x, uSeed + 1.0)) * 0.9 + abs((src.x + 0.5) * uCell.x - uFocus.x) / uRes.x * 0.5;
      float sp = mix(7.0, 38.0, hash21(vec2(src.x, uSeed + 2.0)));
      float r0 = floor(hash21(vec2(src.x, uSeed + 3.0)) * uGrid.y * 0.8);
      float len = max(0.0, uT - t0) * sp;
      if (cell.y > r0 && cell.y < r0 + len) { fade = 1.0 - 0.5 * (cell.y - r0) / max(1.0, len); src.y = r0; }
    }
    vec2 cc = (src + 0.5) * uCell;
    vec2 gc = glassOf(cc);
    float age = uT - uCor0 - length((gc - uFocus) / uRes.y) * uSpread - hash21(src + uSeed) * 0.35;
    vec3 c;
    if (age < 0.0 && src == cell) c = img(tFrom, p);
    else if (age < 0.0) c = img(tFrom, p + glassOf(cc) - glassOf((cell + 0.5) * uCell));
    else {
      vec3 avg = cellAvg(tFrom, src);
      // Character memory scrambled: a lit cell shows the wrong character (or its shade) in its
      // own colour; dark cells stay dark, so the picture's shape survives as garbage text.
      float flick = age < 0.16 ? 1.0 : step(hash21(src + floor(uT * 14.0) * 0.37), 0.05);
      float gi = 1.0 + floor(hash21(src + flick * floor(uT * 22.0) * 1.3 + uSeed) * 93.0);
      float y = luma(avg);
      vec3 g = hash21(src + uSeed * 3.1) < 0.4 ? asText(avg, l, 0.0, uFromRange) : lit(avg) * glyph(gi, l);
      if (flick > 0.5) g = (avg * 1.4 + 0.08) * glyph(gi, l);
      float on = smoothstep(0.06, 0.11, y);
      g *= on + (1.0 - on) * step(hash21(src + 7.7 + floor(uT * 3.0)), 0.05) * 0.5;
      c = mix(img(tFrom, p), g, uGlyphK);
    }
    return c * fade * uFromBright;
  }

  // The next world: rows of ASCII art printed down from the loader bar, then each cell
  // refining into the real picture.
  vec3 toLayer(vec2 p, vec2 cell, vec2 l) {
    float tr = uRast0 + (cell.y - 1.0) * uRastRate;
    if (cell.y > 0.5 && uT < tr) return pal(0.0);
    vec2 cn = (cell + 0.5) / uGrid;
    float d = uOrder < 0.5 ? hash21(cell + uSeed * 1.7)
      : uOrder < 1.5 ? length((cn - 0.5) * vec2(uGrid.x / uGrid.y, 1.0)) * 1.2 + hash21(cell) * 0.25
      : (cn.x * 0.6 + cn.y * 0.4) * 0.85 + hash21(cell) * 0.2;
    float age = uT - max(uRef0 + clamp(d, 0.0, 1.0) * uRefSpan, tr + 0.08);
    vec3 real = img(tTo, p);
    if (age >= 0.14) return real;
    vec3 txt = asText(cellAvg(tTo, cell), l, cell.y < 0.5 ? 1.0 : 0.0, uToRange);
    float pop = cell.y > 0.5 ? exp(-max(0.0, uT - tr) * 14.0) : 0.0; // a freshly printed row flares
    txt *= 1.0 + pop * 0.8;
    return mix(txt, real, smoothstep(0.0, 0.14, age));
  }

  void main() {
    vec2 p = vec2(vUv.x, 1.0 - vUv.y) * uRes;           // glass, CSS px, y down
    vec2 q = (toFlat(p / uRes * 2.0 - 1.0, uK * 0.024) * 0.5 + 0.5) * uRes; // the flat face
    vec2 cell = floor(q / uCell), l = fract(q / uCell);
    vec3 col = pal(0.0) * uTextK; // the tube's black is the phosphor's dark, not true black
    if (uFromK > 0.0) col = fromLayer(p, cell, l) * uFromK;
    if (uToK > 0.0) col = mix(col, toLayer(p, cell, l), uToK);
    // the text layer, scrolled smoothly by uScroll rows
    float ry = q.y / uCell.y + uScroll;
    float row = floor(ry);
    vec4 ra = texture2D(tRows, vec2((row + 0.5) / uMax.y, 0.5));
    float sc = max(1.0, floor(ra.r * 255.0 + 0.5)), part = floor(ra.g * 255.0 + 0.5), gain = ra.b * 2.0;
    float lc = floor(q.x / (uCell.x * sc));
    vec2 gl = vec2(fract(q.x / (uCell.x * sc)), (part + fract(ry)) / sc);
    vec4 cd = texture2D(tCells, (vec2(lc, row) + 0.5) / uMax);
    float gIdx = floor(cd.r * 255.0 + 0.5), cb = floor(cd.g * 255.0 + 0.5);
    float ci = mod(cb, 16.0), fl = floor(cb / 16.0);
    float inv = mod(fl, 2.0), bar = mod(floor(fl / 2.0), 2.0), blink = mod(floor(fl / 4.0), 2.0);
    vec3 fg = pal(ci) * cd.b * gain;
    if (bar > 0.5) fg = lit(cellAvg(tTo, vec2(lc, 0.0)));
    float bgA = cd.a * uTextK;
    float cov = glyph(gIdx, gl);
    if (blink > 0.5 && fract(uT * 1.7) > 0.62) cov = 0.0;
    vec3 ink = pal(0.0);
    if (inv > 0.5) {
      vec3 bgc = fg;
      fg = luma(bgc) > 0.45 ? ink : vec3(1.0);
      col = mix(col, bgc, bgA);
    } else col = mix(col, ink, bgA);
    if (row >= 0.0 && row < uMax.y && lc < uMax.x) col = mix(col, fg, cov * uTextK);
    gl_FragColor = vec4(col, 1.0);
  }`;

// Quarter-size copy for the bloom: a 4-tap box on the way down.
export const DOWN_FRAG = `
  precision highp float;
  varying vec2 vUv;
  uniform sampler2D tSrc;
  uniform vec2 uTexel;
  void main() {
    vec3 c = texture2D(tSrc, vUv + uTexel * vec2(-1.0, -1.0)).rgb + texture2D(tSrc, vUv + uTexel * vec2(1.0, -1.0)).rgb
      + texture2D(tSrc, vUv + uTexel * vec2(-1.0, 1.0)).rgb + texture2D(tSrc, vUv + uTexel * vec2(1.0, 1.0)).rgb;
    gl_FragColor = vec4(c * 0.25, 1.0);
  }`;

export const TUBE_FRAG = `
  precision highp float;
  varying vec2 vUv;
  uniform sampler2D tA, tB;
  uniform vec2 uRes, uBTexel;
  uniform float uK, uMask, uScan, uBloom, uSqY, uSqX, uDot, uBeam, uBright, uAlpha, uWobble, uT, uNoise;
  uniform vec3 uPhos;
  ${GLSL_NOISE}
  ${WARP}
  void main() {
    vec2 uv = vUv;
    // the degauss: the picture swims sideways for a moment after power-on
    uv.x += sin(uv.y * 23.0 + uT * 41.0) * 0.012 * uWobble + sin(uv.y * 71.0 - uT * 90.0) * 0.004 * uWobble;
    // the power-off: everything squeezes into a line, then the line into a dot
    vec2 c = uv - 0.5;
    c.y /= uSqY;
    c.x /= uSqX;
    vec2 su = c + 0.5;
    float inside = step(abs(c.x), 0.5) * step(abs(c.y), 0.5);
    vec3 col = texture2D(tA, su).rgb;
    if (uBloom > 0.0) {
      vec3 b = texture2D(tB, su).rgb * 0.3;
      b += (texture2D(tB, su + uBTexel * vec2(2.5, 0.0)).rgb + texture2D(tB, su - uBTexel * vec2(2.5, 0.0)).rgb
        + texture2D(tB, su + uBTexel * vec2(0.0, 2.5)).rgb + texture2D(tB, su - uBTexel * vec2(0.0, 2.5)).rgb) * 0.12;
      b += (texture2D(tB, su + uBTexel * vec2(4.0, 4.0)).rgb + texture2D(tB, su - uBTexel * vec2(4.0, 4.0)).rgb
        + texture2D(tB, su + uBTexel * vec2(4.0, -4.0)).rgb + texture2D(tB, su - uBTexel * vec2(4.0, -4.0)).rgb) * 0.055;
      col += b * uBloom;
    }
    col *= inside * uBright;
    // a squeezed raster is the same energy in less glass: it burns brighter, whiter
    float squeeze = 1.0 - min(uSqY, 1.0);
    col = mix(col, vec3(1.0) * max(col.r, max(col.g, col.b)), squeeze * 0.6);
    // the squeezed raster as one white-hot line, then the last dot
    vec2 px = (vUv - 0.5) * uRes;
    vec3 hot = uPhos * 0.5 + 0.55;
    if (uBeam > 0.0) {
      float hw = 0.5 * uSqX * uRes.x, th = max(1.1, uSqY * uRes.y * 0.45);
      float ax = 1.0 - smoothstep(hw - 8.0, hw + 2.0, abs(px.x));
      col += hot * (exp(-pow(px.y / th, 2.0)) * 1.5 + exp(-abs(px.y) / (th * 5.0 + 5.0)) * 0.35) * ax * uBeam;
    }
    if (uDot > 0.0) {
      float r = length(px) / uRes.y;
      col += hot * uDot * (exp(-r * r * 6000.0) * 2.0 + exp(-r * 30.0) * 0.4);
    }
    // scanlines (3 CSS px pitch, as on the TTY world's glass) and a whisper of noise
    float sl = 0.5 + 0.5 * cos(vUv.y * uRes.y * 6.2831853 / 3.0);
    col *= 1.0 - uScan * 0.28 * sl;
    col += (hash21(vUv * uRes + floor(uT * 30.0) * 17.0) - 0.5) * uNoise;
    // the curved mask: black where the barrel pulls the picture off the corners, and a vignette
    if (uMask > 0.0) {
      vec2 n = vUv * 2.0 - 1.0;
      vec2 f = toFlat(n, uK * 0.024);
      float edge = max(abs(f.x), abs(f.y));
      float m = 1.0 - smoothstep(0.995, 1.004, edge);
      float vig = 1.0 - 0.45 * smoothstep(0.55, 1.45, length(n * vec2(1.0, 0.9)));
      col *= mix(1.0, m * vig, uMask);
    }
    gl_FragColor = vec4(max(col, 0.0) * uAlpha, uAlpha);
  }`;

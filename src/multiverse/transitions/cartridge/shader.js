// BLOW ON IT — the tube. One pass draws whatever the little television is showing, inside
// the rectangle its glass projects to (the room around it is the 2D layer's): the canyon's
// last frame crashing like a dirty cartridge, the picture collapsing when the power goes,
// snow, the boot card, and the next world rolling into vertical hold. Full-screen and flat,
// it is the old frame to the texel (frame 0) and the new one to the texel (the end).
import { GLSL_NOISE } from '../../kit.js';

export const TUBE_FRAG = `
  precision highp float;
  varying vec2 vUv;
  uniform sampler2D tFrom, tTo, tLogo, tText;
  uniform vec2 uRes;          // stage, CSS px
  uniform vec4 uRect;         // the glass, CSS px (x0, y0, x1, y1), y down
  uniform float uCurve, uScan, uLines, uAlpha, uBright, uGlow;
  // what is on the tube
  uniform float uFromK, uOff, uSnow, uBoot, uToK, uRoll, uJit, uT;
  // the crash
  uniform vec2 uGridO;        // the canyon's pixel grid: origin and size of one pixel, CSS px
  uniform float uCell, uStep, uSeed, uTear, uSmear, uGarb, uSpread, uJump, uPalOn, uText, uTextRow, uDark;
  uniform vec2 uFocusT;       // impact point, in 8-pixel tiles
  uniform vec2 uTiles;        // tiles across / down
  uniform vec3 uPal[16];
  uniform vec3 uSwap[16];
  uniform vec2 uTextSize;     // tText in px
  uniform vec3 uInk, uCream;
  uniform vec2 uLogoAsp;      // logo w / h, screen w / h
  ${GLSL_NOISE}

  vec2 hash22(vec2 p) { return vec2(hash21(p), hash21(p + 19.19)); }

  vec3 img(sampler2D t, vec2 u) { return texture2D(t, vec2(u.x, 1.0 - u.y)).rgb; }

  // The nearest of the canyon's sixteen colours, swapped for another of them.
  vec3 palSwap(vec3 c) {
    float best = 1e9;
    vec3 o = c;
    for (int i = 0; i < 16; i++) {
      vec3 d = c - uPal[i];
      float e = dot(d, d);
      if (e < best) { best = e; o = uSwap[i]; }
    }
    return o;
  }

  // The canyon's last frame, read the way a console with a dirty edge connector reads it:
  // whole 8x8 tiles fetched from the wrong address, rows slipping sideways, columns of
  // sprites repeating down the screen, the palette pointing at the wrong colours.
  vec3 crash(vec2 u) {
    vec2 P = u * uRes;
    vec2 g = (P - uGridO) / uCell;
    g.y = mod(g.y + uJump * 8.0, uTiles.y * 8.0);
    vec2 g0 = g;
    vec2 tile = floor(g / 8.0);
    vec2 inT = g - tile * 8.0;
    float hit = step(0.001, abs(uJump));
    float st = uStep;
    // rows slip
    float rh = hash21(vec2(tile.y * 1.37 + uSeed, floor(st * 0.5)));
    if (rh < uTear) { tile.x = mod(tile.x + floor((hash21(vec2(tile.y, st + uSeed)) - 0.5) * 14.0), uTiles.x); hit = 1.0; }
    // columns smear: below a row, the same strip of pixels over and over
    float ch = hash21(vec2(tile.x * 2.71 + uSeed, 7.0));
    if (ch < uSmear) {
      float top = floor(hash21(vec2(tile.x, uSeed + 3.0)) * uTiles.y * 0.7) * 8.0;
      float per = 4.0 + floor(hash21(vec2(tile.x, uSeed + 5.0)) * 3.0) * 4.0;
      if (g.y > top) { g.y = top - per + mod(g.y - top, per); tile = floor(g / 8.0); inT = g - tile * 8.0; hit = 1.0; }
    }
    // garbage tiles, spreading out from the impact
    float d = length((tile - uFocusT) * vec2(1.0, 1.4));
    float gh = hash21(tile * 1.13 + vec2(floor(st) * 0.37, uSeed));
    if (gh < uGarb * smoothstep(uSpread, uSpread - 5.0, d)) {
      vec2 r = hash22(tile + floor(st) * 0.71 + uSeed);
      tile = floor(r * uTiles);
      if (r.x > 0.6) inT.x = 7.0 - inT.x;
      if (r.y > 0.75) inT.y = 7.0 - inT.y;
      hit = 1.0;
    }
    vec3 c;
    if (hit > 0.5) {
      vec2 Q = uGridO + (tile * 8.0 + floor(inT) + 0.5) * uCell;
      c = img(tFrom, Q / uRes);
    } else c = img(tFrom, u);
    if (uPalOn > 0.0) {
      float ph = hash21(vec2(tile.y * 0.13 + uSeed, floor(st * 0.25)));
      c = mix(c, palSwap(c), uPalOn * step(ph, uPalOn * 1.2));
    }
    // the kill label, stuck in a loop across one row of tiles (read clean: it is the joke)
    float trow = floor(g0.y / 8.0);
    if (uText > 0.0 && trow >= uTextRow && trow < uTextRow + 1.0) {
      vec2 tp = vec2(mod(g0.x + floor(st) * 3.0, uTextSize.x), g0.y - uTextRow * 8.0);
      vec2 tu = (floor(tp) + 0.5) / uTextSize;
      float a = texture2D(tText, vec2(tu.x, 1.0 - tu.y)).a; // canvas textures arrive flipped
      c = mix(c, mix(uInk, uCream, step(0.5, a)), uText);
    }
    return c * (1.0 - uDark);
  }

  vec3 snow(vec2 u) {
    vec2 cell = floor(u * vec2(uRes.y * (uRect.z - uRect.x) / max(1.0, uRect.w - uRect.y), uRes.y) * 0.5);
    float f = floor(uT * 30.0);
    float n = hash21(cell + vec2(f * 13.7, f * 7.1));
    float band = 0.75 + 0.25 * sin(u.y * 9.0 + uT * 13.0);
    return vec3(n * n * 1.1 * band);
  }

  vec3 boot(vec2 u) {
    // the console's card: its name on black, in a box the logo's own shape
    float hgt = 0.3;
    float wdt = hgt * uLogoAsp.x / uLogoAsp.y;
    vec2 q = (u - vec2(0.5 - wdt * 0.5, 0.5 - hgt * 0.5)) / vec2(wdt, hgt);
    vec4 l = (q.x > 0.0 && q.x < 1.0 && q.y > 0.0 && q.y < 1.0) ? texture2D(tLogo, vec2(q.x, 1.0 - q.y)) : vec4(0.0);
    return vec3(0.02, 0.015, 0.04) + l.rgb * l.a;
  }

  vec3 toRoll(vec2 u) {
    // vertical hold: frames sliding up through the tube with the blanking bar between them
    float y = u.y + uRoll;
    float f = fract(y);
    float bar = 0.07 * step(0.0005, abs(uRoll) + uJit);
    vec2 v = vec2(u.x + uJit * (hash21(vec2(floor(u.y * 90.0), floor(uT * 24.0))) - 0.5) * 0.04, f);
    vec3 c = img(tTo, v);
    if (bar > 0.0 && f < bar) c = vec3(0.01) + vec3(0.25) * step(0.45, f / bar) * step(f / bar, 0.52);
    return c;
  }

  void main() {
    vec2 P = vec2(vUv.x, 1.0 - vUv.y) * uRes;
    vec2 sz = uRect.zw - uRect.xy;
    vec2 q = (P - uRect.xy) / sz;
    if (q.x < -0.002 || q.y < -0.002 || q.x > 1.002 || q.y > 1.002) { gl_FragColor = vec4(0.0); return; }
    // the bulge: the picture is pinched toward the middle of the glass, the corners fall away
    vec2 c = q * 2.0 - 1.0;
    float inside = 1.0;
    if (uCurve > 0.0005) {
      c *= 1.0 + uCurve * (0.11 * c.yx * c.yx + 0.02 * dot(c, c));
      vec2 e = 1.0 - abs(c);
      float px = 2.0 / max(8.0, sz.y);
      inside = smoothstep(0.0, px * 1.5, min(e.x, e.y));
      // round the corners of the lit area
      vec2 k = max(abs(c) - (1.0 - 0.12 * uCurve), 0.0) / (0.12 * uCurve + 1e-4);
      inside *= 1.0 - smoothstep(0.85, 1.0, length(k));
    }
    vec2 u = c * 0.5 + 0.5;

    // the power going off: the picture squeezes to a line, the line to a dot
    float sy = 1.0, sx = 1.0, boost = 0.0;
    if (uOff > 0.0) {
      sy = mix(1.0, 0.004, smoothstep(0.0, 0.45, uOff));
      sx = mix(1.0, 0.006, smoothstep(0.42, 0.78, uOff));
      boost = smoothstep(0.0, 0.4, uOff) * 1.8;
    }
    vec2 uo = vec2(0.5 + (u.x - 0.5) / sx, 0.5 + (u.y - 0.5) / sy);
    vec3 col = vec3(0.0);
    if (uFromK > 0.0) col += crash(clamp(uo, 0.0, 1.0)) * uFromK;
    if (uOff > 0.0) {
      float lit = step(abs(uo.y - 0.5), 0.5) * step(abs(uo.x - 0.5), 0.5);
      col = (col + boost * vec3(0.8, 0.85, 1.0)) * lit;
      // what is left of the dot
      vec2 dd = (u - 0.5) * vec2(sz.x / sz.y, 1.0);
      float dot1 = exp(-dot(dd, dd) * 2600.0) * smoothstep(0.42, 0.7, uOff) * (1.0 - smoothstep(0.7, 1.0, uOff)) * 2.5;
      col += vec3(0.85, 0.9, 1.0) * dot1;
      col *= 1.0 - smoothstep(0.78, 1.0, uOff) * 0.9;
    }
    if (uSnow > 0.0) col = mix(col, snow(u), uSnow);
    if (uBoot > 0.0) col = mix(col, boot(u), uBoot);
    if (uToK > 0.0) col = mix(col, toRoll(u), uToK);
    col *= uBright;

    // the glass: scanlines, the tube's own falloff, a breath of glow
    if (uScan > 0.0005) {
      float sl = 0.5 + 0.5 * cos(6.2831853 * u.y * uLines);
      col *= 1.0 - uScan * 0.42 * sl;
      vec2 cc = c;
      col *= 1.0 - uScan * 0.35 * dot(cc * cc, cc * cc);
      col += uGlow * vec3(0.05, 0.06, 0.09) * (1.0 - dot(cc, cc) * 0.5);
    }
    // between the lit area and the bezel, the dark glass of the tube
    vec3 glass = vec3(0.025, 0.03, 0.045) + uGlow * vec3(0.03, 0.035, 0.05);
    col = mix(glass, col, inside);
    gl_FragColor = vec4(clamp(col, 0.0, 1.0) * uAlpha, uAlpha);
  }`;

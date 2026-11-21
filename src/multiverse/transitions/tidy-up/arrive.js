// TIDY-UP TIME — what comes out of the box: the next world, as a toy. Built at the swap, when
// the next world's first frame exists, and printed with it: the lid of a game box, the spread of
// a pop-up book, or the scene inside a snow globe. Each knows where its picture is, so the lens
// can dive into it until it fills the screen exactly.
import { clamp, smoothstep, makeCanvas, roundRect, rgba, mixHex, shade, contrastOn, makeRng, rand, TAU } from '../../kit.js';
import { softPatch } from './hands.js';
import { LABEL_FONT } from './room.js';

const TITLE_FONT = '"Arial Rounded MT Bold", "Futura", "Trebuchet MS", "Rajdhani", sans-serif';

// The next world's picture, cover-fitted into a rect of a canvas.
function drawPicture(g, img, x, y, w, h) {
  const iw = img.width || 1, ih = img.height || 1, s = Math.max(w / iw, h / ih);
  const sw = w / s, sh = h / s;
  g.drawImage(img, (iw - sw) / 2, (ih - sh) / 2, sw, sh, x, y, w, h);
}

// A title: the world's name in fat rounded letters with a thick outline and a drop shadow.
function title(g, text, cx, cy, maxW, px, pal) {
  g.font = `900 ${px}px ${TITLE_FONT}`;
  const mw = g.measureText(text).width, size = mw > maxW ? px * maxW / mw : px;
  g.font = `900 ${size}px ${TITLE_FONT}`;
  g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round';
  g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillText(text, cx + size * 0.05, cy + size * 0.08);
  g.strokeStyle = pal.accent; g.lineWidth = size * 0.2; g.strokeText(text, cx, cy);
  g.strokeStyle = shade(pal.bg, -0.4); g.lineWidth = size * 0.07; g.strokeText(text, cx, cy);
  g.fillStyle = pal.fg; g.fillText(text, cx, cy);
  return size;
}

function badge(g, x, y, r, col, lines) {
  g.save();
  g.translate(x, y); g.rotate(-0.22);
  g.fillStyle = 'rgba(0,0,0,0.25)'; g.beginPath(); g.arc(3, 5, r, 0, TAU); g.fill();
  g.fillStyle = col; g.beginPath();
  for (let k = 0; k < 28; k++) { const a = (k / 28) * TAU, rr = k & 1 ? r * 0.9 : r; g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); }
  g.fill();
  g.fillStyle = contrastOn(col); g.textAlign = 'center'; g.textBaseline = 'middle';
  lines.forEach((l, i) => { g.font = `900 ${r * (i ? 0.26 : 0.36)}px ${TITLE_FONT}`; g.fillText(l, 0, (i - (lines.length - 1) / 2) * r * 0.4); });
  g.restore();
}

/**
 * o = { kind: 'box'|'book'|'globe', img, to: DimensionMeta, aspect, U, Q, seed, M, sticker }
 * Returns { group, kind, size, set(state), picture(out) — world rect of the picture —, glassFade, dispose }.
 */
export function makeArrival(THREE, o) {
  const own = [];
  const keep = (x) => { own.push(x); return x; };
  const pal = o.to.palette, name = String(o.to.name || '').toUpperCase(), persp = String(o.to.perspective || '').toUpperCase();
  const rng = makeRng(o.seed ^ 0xa7717e);
  const mat = (p, soft = {}) => keep(softPatch(new THREE.MeshStandardMaterial({ metalness: 0, roughness: 0.5, ...p }), o.U, { wrap: 0.35, ...soft }));
  const tex = (canvas, aniso = 4) => { const t = keep(new THREE.CanvasTexture(canvas)); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = aniso; return t; };
  const group = new THREE.Group();
  const inner = new THREE.Group();
  group.add(inner);
  const A = o.aspect;
  const pic = { c: new THREE.Vector3(), n: new THREE.Vector3(0, 1, 0), up: new THREE.Vector3(0, 0, -1), h: 1, obj: null };
  const st = { cover: 0, pop: 0, snow: 0, glass: 1 };
  let update = () => {};

  if (o.kind === 'box') {
    // ---- a game box: the lid printed with the next world, a title band across the top ----
    const PW = 13.2, PH = PW / A, B = 0.55, TB = clamp(PH * 0.42, 2.6, 4.4), LW = PW + B * 2, LD = PH + TB + B, H = 2.3;
    const cw = 1024, chh = Math.round((cw * LD) / LW), k = cw / LW, c = makeCanvas(cw, chh), g = c.g;
    g.fillStyle = pal.bg; g.fillRect(0, 0, cw, chh);
    // a burst of the accent behind the title
    g.save(); g.globalAlpha = 0.22; g.fillStyle = pal.accent;
    for (let i = 0; i < 18; i++) { const a = (i / 18) * TAU; g.beginPath(); g.moveTo(cw / 2, TB * k * 0.55); g.lineTo(cw / 2 + Math.cos(a) * cw, TB * k * 0.55 + Math.sin(a) * cw); g.lineTo(cw / 2 + Math.cos(a + 0.12) * cw, TB * k * 0.55 + Math.sin(a + 0.12) * cw); g.fill(); }
    g.restore();
    drawPicture(g, o.img, B * k, TB * k, PW * k, PH * k);
    g.strokeStyle = pal.fg; g.lineWidth = 5; g.strokeRect(B * k - 2.5, TB * k - 2.5, PW * k + 5, PH * k + 5);
    const ts = title(g, name, cw / 2, TB * k * 0.45, cw * 0.74, TB * k * 0.44, pal);
    g.font = `800 ${Math.max(12, ts * 0.26)}px ${TITLE_FONT}`;
    g.fillStyle = pal.fg; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(persp, cw / 2, TB * k * 0.45 + ts * 0.62, cw * 0.6);
    badge(g, cw * 0.89, TB * k * 0.5, TB * k * 0.34, pal.accent, o.sticker);
    g.fillStyle = rgba(pal.fg, 0.85); g.font = `800 ${TB * k * 0.11}px ${TITLE_FONT}`; g.textAlign = 'left';
    g.fillText('2 SNIPERS', B * k * 1.4, TB * k * 0.86); g.textAlign = 'right'; g.fillText('AGES 7–99', cw - B * k * 1.4, TB * k * 0.86);
    const lidTex = tex(c.canvas, 8);
    const lidMat = mat({ map: lidTex, roughness: 0.42 });
    // the sides: the accent, with the name along them
    const sc = makeCanvas(512, 64), sg = sc.g;
    sg.fillStyle = pal.accent; sg.fillRect(0, 0, 512, 64);
    sg.fillStyle = pal.bg; sg.fillRect(0, 50, 512, 14);
    sg.fillStyle = contrastOn(pal.accent); sg.font = `900 30px ${TITLE_FONT}`; sg.textAlign = 'center'; sg.textBaseline = 'middle'; sg.fillText(name, 256, 26, 480);
    const sideMat = mat({ map: tex(sc.canvas), roughness: 0.5 });
    const geo = keep(new THREE.BoxGeometry(LW, H, LD));
    const lid = new THREE.Mesh(geo, [sideMat, sideMat, lidMat, sideMat, sideMat, sideMat]);
    lid.position.y = H / 2;
    lid.castShadow = lid.receiveShadow = true;
    // the bottom tray shows as a thin darker line under the lid's overhang
    const tray = new THREE.Mesh(keep(new THREE.BoxGeometry(LW - 0.3, 0.5, LD - 0.3)), mat({ color: shade(pal.bg, -0.2) }));
    tray.position.y = 0.25;
    inner.add(lid, tray);
    pic.c.set(0, H + 0.001, -LD / 2 + TB + PH / 2); pic.h = PH; pic.obj = inner;
    Object.assign(st, { LW, LD, H, grip: LW / 2 + 0.35 });
  } else if (o.kind === 'book') {
    // ---- a pop-up book: the spread is the next world; a title card stands up in the fold ----
    const PW = 13.2, PH = PW / A, half = PW / 2, T = 0.18, MARG = 0.35;
    const cw = 1024, chh = Math.round(cw / A);
    const sp = makeCanvas(cw, chh);
    drawPicture(sp.g, o.img, 0, 0, cw, chh);
    // the gutter's shadow is printed in, as it would be
    const gg = sp.g.createLinearGradient(cw / 2 - 40, 0, cw / 2 + 40, 0);
    gg.addColorStop(0, 'rgba(0,0,0,0)'); gg.addColorStop(0.5, 'rgba(0,0,0,0.28)'); gg.addColorStop(1, 'rgba(0,0,0,0)');
    sp.g.fillStyle = gg; sp.g.fillRect(cw / 2 - 40, 0, 80, chh);
    const spread = tex(sp.canvas, 8);
    const pageMat = (left) => { const m = mat({ map: spread, roughness: 0.7 }); return m; };
    const pageGeo = (left) => {
      const g = keep(new THREE.PlaneGeometry(half, PH).rotateX(-Math.PI / 2));
      const uv = g.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setX(i, left ? uv.getX(i) * 0.5 : 0.5 + uv.getX(i) * 0.5);
      g.translate(left ? -half / 2 : half / 2, 0, 0);
      return g;
    };
    const coverCol = mixHex(pal.bg, pal.accent, 0.25);
    const cc = makeCanvas(512, Math.round(512 * PH / half)), cg = cc.g;
    cg.fillStyle = coverCol; cg.fillRect(0, 0, 512, cc.canvas.height);
    cg.strokeStyle = pal.fg; cg.lineWidth = 6; cg.strokeRect(22, 22, 468, cc.canvas.height - 44);
    drawPicture(cg, o.img, 70, cc.canvas.height * 0.42, 372, cc.canvas.height * 0.4);
    title(cg, name, 256, cc.canvas.height * 0.22, 420, 80, pal);
    const coverTex = tex(cc.canvas);
    coverTex.center.set(0.5, 0.5); coverTex.rotation = Math.PI;
    const coverMat = mat({ map: coverTex, roughness: 0.45 });
    const boardMat = mat({ color: shade(coverCol, -0.15), roughness: 0.5 });
    const paperMat = mat({ color: '#f3ecdc', roughness: 0.9 });
    // left half: board + page block + the left page
    const left = new THREE.Group();
    const lb = new THREE.Mesh(keep(new THREE.BoxGeometry(half + MARG, T, PH + MARG * 2)), boardMat); lb.position.set(-(half + MARG) / 2, T / 2, 0);
    const lpBlock = new THREE.Mesh(keep(new THREE.BoxGeometry(half - 0.1, 0.5, PH - 0.1)), paperMat); lpBlock.position.set(-half / 2, T + 0.25, 0);
    const lp = new THREE.Mesh(pageGeo(true), pageMat(true)); lp.position.y = T + 0.51;
    left.add(lb, lpBlock, lp);
    // right half (hinged on the spine): page on its top, board under, cover printed on the board's outside
    const right = new THREE.Group();
    right.position.set(0, T + 0.51, 0);
    const rp = new THREE.Mesh(pageGeo(false), pageMat(false)); rp.position.y = 0.0;
    const rBlock = new THREE.Mesh(keep(new THREE.BoxGeometry(half - 0.1, 0.5, PH - 0.1)), paperMat); rBlock.position.set(half / 2, -0.26, 0);
    const rb = new THREE.Mesh(keep(new THREE.BoxGeometry(half + MARG, T, PH + MARG * 2)), [boardMat, boardMat, boardMat, coverMat, boardMat, boardMat]); rb.position.set((half + MARG) / 2, -0.51 - T / 2, 0);
    // (the cover face is the board's underside: -y, which faces up when the book is shut)
    right.add(rp, rBlock, rb);
    for (const m of [lb, lpBlock, lp, rp, rBlock, rb]) { m.castShadow = true; m.receiveShadow = true; }
    // the spine
    const spine = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.5, 0.5, PH + MARG * 2, 12, 1, false, Math.PI, Math.PI).rotateX(Math.PI / 2)), boardMat);
    spine.position.set(0, 0.5, 0); spine.rotation.z = Math.PI / 2;
    // the pop-up: a title card standing in the fold, on two little tabs
    const pc = makeCanvas(1024, 300), pg = pc.g;
    pg.fillStyle = pal.bg; roundRect(pg, 8, 20, 1008, 260, 40); pg.fill();
    pg.strokeStyle = pal.accent; pg.lineWidth = 14; roundRect(pg, 18, 30, 988, 240, 34); pg.stroke();
    const ts = title(pg, name, 512, 132, 900, 150, pal);
    pg.font = `800 ${Math.max(14, ts * 0.24)}px ${TITLE_FONT}`; pg.fillStyle = pal.fg; pg.textAlign = 'center'; pg.fillText(persp, 512, 132 + ts * 0.66, 860);
    const popW = Math.min(PW * 0.62, 8.5), popH = popW * 300 / 1024;
    const pop = new THREE.Mesh(keep(new THREE.PlaneGeometry(popW, popH).translate(0, popH / 2, 0)), mat({ map: tex(pc.canvas), transparent: true, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.6 }));
    pop.castShadow = true;
    const popPivot = new THREE.Group();
    popPivot.position.set(0, T + 0.52, PH * 0.12);
    popPivot.add(pop);
    inner.add(left, right, spine, popPivot);
    pic.c.set(0, T + 0.515, 0); pic.h = PH; pic.obj = inner;
    Object.assign(st, { half, PH, T, right, popPivot, grip: half });
    update = () => {
      // cover: 0 shut (the right half folded over the left), 1 flat open
      right.rotation.z = Math.PI * (1 - st.cover);
      const p = st.pop * smoothstep(0.55, 1, st.cover);
      // (folding away, it sinks into the fold rather than lying on the picture)
      popPivot.rotation.x = -(1 - p) * Math.PI / 2 * 0.9 - 0.1 * p;
      popPivot.scale.set(1, Math.max(0.001, p), 1);
      popPivot.visible = st.cover > 0.4 && p > 0.02;
    };
  } else {
    // ---- a snow globe: the next world on a card inside the glass, snow, a wooden base ----
    const R = 4.4, BH = 2.1, CY = BH + R * 0.84, PW = Math.min(R * 1.42, 3.6 * A), PHH = PW / A;
    const base = new THREE.Mesh(keep(new THREE.LatheGeometry([[0, 0], [3.95, 0], [4.05, 0.18], [3.8, 1.1], [3.35, 1.85], [3.1, BH], [0, BH]].map(([x, y]) => new THREE.Vector2(x, y)), 48)), mat({ color: '#5e3a22', roughness: 0.3 }, { rim: [0.05, 0.03, 0.02] }));
    base.castShadow = base.receiveShadow = true;
    // a strip of label tape round the base, with the name
    const lc = makeCanvas(1024, 96), lg = lc.g;
    lg.clearRect(0, 0, 1024, 96);
    lg.font = `800 56px ${LABEL_FONT}`;
    const tw = Math.min(1000, lg.measureText(name).width + 70);
    lg.fillStyle = pal.accent; roundRect(lg, 512 - tw / 2, 12, tw, 72, 8); lg.fill();
    lg.fillStyle = 'rgba(255,255,255,0.25)'; lg.fillRect(512 - tw / 2 + 6, 16, tw - 12, 4);
    lg.fillStyle = 'rgba(0,0,0,0.3)'; lg.textAlign = 'center'; lg.textBaseline = 'middle'; lg.fillText(name, 512, 52, tw - 50);
    lg.fillStyle = contrastOn(pal.accent); lg.fillText(name, 512, 49, tw - 50);
    const tape = new THREE.Mesh(keep(new THREE.CylinderGeometry(3.62, 3.9, 0.62, 48, 1, true, -1.15, 2.3)), mat({ map: tex(lc.canvas), transparent: true, alphaTest: 0.3, roughness: 0.4 }));
    tape.position.y = 0.95;
    const card = new THREE.Mesh(keep(new THREE.PlaneGeometry(PW, PHH)), keep(new THREE.MeshBasicMaterial({ map: tex((() => { const c = makeCanvas(1024, Math.round(1024 / A)); drawPicture(c.g, o.img, 0, 0, 1024, Math.round(1024 / A)); return c.canvas; })(), 8) })));
    const cy = CY - 0.25;
    card.position.set(0, cy, -0.3);
    // its back, and a little snow drift at its feet
    const back = new THREE.Mesh(keep(new THREE.PlaneGeometry(PW, PHH).rotateY(Math.PI)), mat({ color: shade(pal.bg, -0.1) }));
    back.position.copy(card.position).z -= 0.02;
    const drift = new THREE.Mesh(keep(new THREE.SphereGeometry(1, 32, 12, 0, TAU, 0, Math.PI / 2)), mat({ color: '#c9d3e2', roughness: 0.95 }, { wrap: 0.9, rim: [0.04, 0.05, 0.06] }));
    drift.scale.set(R * 0.5, 0.45, R * 0.34); drift.position.set(0, BH + 0.02, -0.5);
    // snow: flakes in the water, stirred by a shake and settling
    const N = 160, sp = new Float32Array(N * 3), sd = new Float32Array(N * 4);
    for (let i = 0; i < N; i++) { const a = rand(rng, 0, TAU), r = Math.sqrt(rng()) * R * 0.8; sp[i * 3] = Math.cos(a) * r; sp[i * 3 + 1] = rand(rng, 0, R * 1.5); sp[i * 3 + 2] = Math.sin(a) * r; for (let k = 0; k < 4; k++) sd[i * 4 + k] = rng(); }
    const sg = keep(new THREE.BufferGeometry());
    sg.setAttribute('position', new THREE.BufferAttribute(sp, 3)); sg.setAttribute('aSeed', new THREE.BufferAttribute(sd, 4));
    const snowMat = keep(new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, uniforms: { uT: { value: 0 }, uStir: { value: 0 }, uPx: { value: 1 }, uR: { value: R }, uC: { value: CY }, uB: { value: BH + 0.6 } },
      vertexShader: `attribute vec4 aSeed; uniform float uT, uStir, uPx, uR, uC, uB; varying float vA;
void main() {
  vec3 p = position;
  float fall = mod(p.y - uT * (0.3 + aSeed.w * 0.45) + aSeed.x * 3.0, uR * 1.5);
  p.y = uB + fall;
  float sw = uT * (1.0 + aSeed.y) + aSeed.z * 6.28;
  p.x += sin(sw) * (0.2 + uStir * 1.2) + uStir * sin(uT * 3.0 + aSeed.y * 9.0);
  p.z += cos(sw * 0.8) * (0.2 + uStir * 1.2);
  vec3 c = p - vec3(0.0, uC, 0.0);
  if (length(c) > uR * 0.9) p = vec3(0.0, uC, 0.0) + normalize(c) * uR * 0.9;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  vA = (0.55 + 0.45 * aSeed.y) * smoothstep(1.2, 3.5, -mv.z); // (none drifting into the lens)
  gl_Position = projectionMatrix * mv;
  gl_PointSize = min((0.07 + aSeed.w * 0.09) * uPx / -mv.z, 14.0);
}`,
      fragmentShader: 'precision highp float; varying float vA; void main() { float d = length(gl_PointCoord - 0.5); if (d > 0.5) discard; gl_FragColor = vec4(vec3(1.0), vA * smoothstep(0.5, 0.15, d)); }',
    }));
    const snow = new THREE.Points(sg, snowMat);
    snow.frustumCulled = false;
    // the glass: a fresnel shell, a thin bright rim and two soft window reflections
    const glassMat = keep(new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, side: THREE.FrontSide, uniforms: { uA: { value: 1 }, uKey: o.U.keyDir },
      vertexShader: 'varying vec3 vN; varying vec3 vV; void main() { vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }',
      fragmentShader: `precision highp float; uniform float uA; uniform vec3 uKey; varying vec3 vN; varying vec3 vV;
void main() {
  vec3 n = normalize(vN), v = normalize(vV);
  float f = pow(1.0 - max(dot(n, v), 0.0), 2.6);
  vec3 h = normalize(uKey + v);
  float s = pow(max(dot(n, h), 0.0), 260.0) * 1.6;
  vec3 r = reflect(-v, n);
  float win = smoothstep(0.955, 0.985, dot(r, normalize(vec3(-0.45, 0.75, 0.48)))) * 0.28 + smoothstep(0.975, 0.995, dot(r, normalize(vec3(0.6, 0.55, 0.58)))) * 0.15;
  gl_FragColor = vec4(vec3(0.92, 0.96, 1.0) * (f * 0.7 + s + win), (0.03 + f * 0.55 + s + win) * uA);
}`,
    }));
    const glass = new THREE.Mesh(keep(new THREE.SphereGeometry(R, 48, 32)), glassMat);
    glass.position.y = CY;
    glass.renderOrder = 10;
    inner.add(base, tape, drift, back, card, snow, glass);
    pic.c.set(0, cy, -0.3); pic.n.set(0, 0, 1); pic.up.set(0, 1, 0); pic.h = PHH; pic.obj = inner;
    Object.assign(st, { R, top: CY + R, centre: CY, grip: R });
    update = (t) => {
      snowMat.uniforms.uT.value = t;
      snowMat.uniforms.uStir.value = st.snow;
      snowMat.uniforms.uPx.value = o.px || 600;
      glassMat.uniforms.uA.value = st.glass;
      glass.visible = st.glass > 0.01;
    };
  }

  return {
    group, inner, kind: o.kind, st,
    set(t) { update(t); },
    // The picture's rect in world space: centre, facing normal, up, height.
    picture(out) {
      pic.obj.updateMatrixWorld(true);
      out.c.copy(pic.c).applyMatrix4(pic.obj.matrixWorld);
      out.n.copy(pic.n).transformDirection(pic.obj.matrixWorld);
      out.up.copy(pic.up).transformDirection(pic.obj.matrixWorld);
      out.h = pic.h;
      return out;
    },
    dispose() { for (const x of own) x.dispose(); },
  };
}

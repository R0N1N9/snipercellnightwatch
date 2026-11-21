// NightWatch menu: a topographic briefing map of the real Kestrel Ridge map (drawn from the
// game's own height function), with the drop points you can pick. North is up (-z).
import { terrainHeight, drawX, FENCE, BUILDING, SPOTS, DROPS, CLIFF } from './facility.js';

const X0 = -175, X1 = 175, Z0 = -150, Z1 = 335, STEP = 3;
let grid = null;

function heights() {
  if (grid) return grid;
  const nx = Math.round((X1 - X0) / STEP) + 1, nz = Math.round((Z1 - Z0) / STEP) + 1;
  const H = new Float32Array(nx * nz);
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) H[j * nx + i] = terrainHeight(X0 + i * STEP, Z0 + j * STEP);
  return (grid = { H, nx, nz });
}

// Draw into `canvas` (sized to its parent). sel: the chosen drop ('draw' | 'ridge').
// Returns a hit-test function (clientX, clientY) -> drop key or null.
export function drawCellMap(canvas, sel = 'draw', t = 0) {
  const wrap = canvas.parentElement;
  const W = wrap.clientWidth, Hh = wrap.clientHeight;
  if (!W || !Hh) return () => null;
  const dpr = Math.min(devicePixelRatio, 2);
  if (canvas.width !== Math.round(W * dpr) || canvas.height !== Math.round(Hh * dpr)) { canvas.width = Math.round(W * dpr); canvas.height = Math.round(Hh * dpr); }
  const c = canvas.getContext('2d');
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  c.clearRect(0, 0, W, Hh);
  const { H, nx, nz } = heights();
  const s = Math.min(W / (X1 - X0), Hh / (Z1 - Z0)) * 0.96;
  const ox = (W - (X1 - X0) * s) / 2, oy = (Hh - (Z1 - Z0) * s) / 2;
  const mx = (x) => ox + (x - X0) * s;
  const my = (z) => oy + (z - Z0) * s; // -z (north) up
  // Hillshade.
  const img = c.createImageData(nx, nz);
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const h = H[j * nx + i];
    const hx = H[j * nx + Math.min(i + 1, nx - 1)] - H[j * nx + Math.max(i - 1, 0)];
    const hz = H[Math.min(j + 1, nz - 1) * nx + i] - H[Math.max(j - 1, 0) * nx + i];
    const shade = Math.max(0, Math.min(1, 0.55 + (-hx + hz) * 0.12));
    const e = Math.min(1, Math.max(0, h / 45));
    const k = (j * nx + i) * 4;
    img.data[k] = 13 + e * 20 + shade * 24;
    img.data[k + 1] = 15 + e * 20 + shade * 24;
    img.data[k + 2] = 22 + e * 22 + shade * 28;
    img.data[k + 3] = 255;
  }
  const off = document.createElement('canvas');
  off.width = nx; off.height = nz;
  off.getContext('2d').putImageData(img, 0, 0);
  c.imageSmoothingEnabled = true;
  c.drawImage(off, mx(X0), my(Z0), (X1 - X0) * s, (Z1 - Z0) * s);
  // Contours (marching squares), every 3 m; every 15 m brighter.
  c.lineWidth = 1;
  for (let L = 1.5; L < 70; L += 3) {
    c.strokeStyle = Math.round(L - 1.5) % 15 === 0 ? 'rgba(190,196,220,0.32)' : 'rgba(170,176,200,0.13)';
    c.beginPath();
    for (let j = 0; j < nz - 1; j++) for (let i = 0; i < nx - 1; i++) {
      const a = H[j * nx + i], b = H[j * nx + i + 1], d = H[(j + 1) * nx + i], e = H[(j + 1) * nx + i + 1];
      const idx = (a > L ? 1 : 0) | (b > L ? 2 : 0) | (e > L ? 4 : 0) | (d > L ? 8 : 0);
      if (idx === 0 || idx === 15) continue;
      const x = X0 + i * STEP, z = Z0 + j * STEP;
      const pt = (p, q, hp, hq) => { const f = (L - hp) / (hq - hp); return [p[0] + (q[0] - p[0]) * f, p[1] + (q[1] - p[1]) * f]; };
      const A = [x, z], B = [x + STEP, z], E = [x + STEP, z + STEP], D = [x, z + STEP];
      const top = pt(A, B, a, b), right = pt(B, E, b, e), bot = pt(D, E, d, e), left = pt(A, D, a, d);
      const segs = { 1: [[left, top]], 2: [[top, right]], 3: [[left, right]], 4: [[right, bot]], 5: [[left, top], [right, bot]], 6: [[top, bot]], 7: [[left, bot]], 8: [[left, bot]], 9: [[top, bot]], 10: [[top, right], [left, bot]], 11: [[right, bot]], 12: [[left, right]], 13: [[top, right]], 14: [[left, top]] }[idx];
      for (const [p, q] of segs) { c.moveTo(mx(p[0]), my(p[1])); c.lineTo(mx(q[0]), my(q[1])); }
    }
    c.stroke();
  }
  // The draw's tree line: a stipple of dark crowns.
  c.fillStyle = 'rgba(70,120,90,0.55)';
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 520; i++) {
    const z = 148 + rnd() * 180, side = rnd() < 0.5 ? -1 : 1, o = 8 + Math.pow(rnd(), 0.7) * 28;
    const x = drawX(z) + side * o;
    if (z < 156 && Math.abs(x - 2) < 16) continue;
    c.beginPath(); c.arc(mx(x), my(z), 1.4 + rnd() * 1.2, 0, Math.PI * 2); c.fill();
  }
  // Cliff edge.
  c.strokeStyle = 'rgba(255,200,120,0.45)';
  c.setLineDash([2, 3]);
  c.beginPath(); c.moveTo(mx(-84), my(CLIFF.z + 2)); c.lineTo(mx(X1), my(CLIFF.z + 2)); c.stroke();
  c.setLineDash([]);
  // Compound: fence, building, gate, barracks, drone bay, towers at the corners.
  c.strokeStyle = 'rgba(255,80,96,0.85)';
  c.setLineDash([6, 4]);
  c.strokeRect(mx(-FENCE.x), my(-FENCE.z), FENCE.x * 2 * s, FENCE.z * 2 * s);
  c.setLineDash([]);
  c.fillStyle = 'rgba(160,170,190,0.55)';
  c.fillRect(mx(BUILDING.x0), my(BUILDING.z0), (BUILDING.x1 - BUILDING.x0) * s, (BUILDING.z1 - BUILDING.z0) * s);
  c.strokeStyle = 'rgba(220,226,240,0.8)';
  c.strokeRect(mx(BUILDING.x0), my(BUILDING.z0), (BUILDING.x1 - BUILDING.x0) * s, (BUILDING.z1 - BUILDING.z0) * s);
  for (const [x, z] of [[-FENCE.x, -FENCE.z], [FENCE.x, -FENCE.z], [-FENCE.x, FENCE.z], [FENCE.x, FENCE.z]]) { c.fillStyle = '#ff5060'; c.fillRect(mx(x) - 3, my(z) - 3, 6, 6); }
  const small = (txt, x, z, col, dy = -7) => { c.fillStyle = col; c.font = '600 9px JetBrains Mono, monospace'; c.textAlign = 'center'; c.fillText(txt, mx(x), my(z) + dy); };
  small('KESTREL RIDGE · DC-3', 0, (BUILDING.z0 + BUILDING.z1) / 2, '#e8eaf2', 3);
  c.fillStyle = 'rgba(255,150,80,0.8)'; c.fillRect(mx(SPOTS.barracks.x) - 3, my(SPOTS.barracks.z) - 3, 6, 6); small('BARRACKS', SPOTS.barracks.x, SPOTS.barracks.z, 'rgba(255,170,110,0.9)');
  c.fillStyle = 'rgba(255,150,80,0.8)'; c.fillRect(mx(SPOTS.droneBay.x) - 3, my(SPOTS.droneBay.z) - 3, 6, 6); small('DRONE BAY', SPOTS.droneBay.x, SPOTS.droneBay.z, 'rgba(255,170,110,0.9)');
  small('GATE', SPOTS.gate.x, SPOTS.gate.z, 'rgba(255,120,130,0.9)', 12);
  // Exfil van on the east track.
  c.strokeStyle = '#30ff90'; c.beginPath(); c.arc(mx(SPOTS.lz.x), my(SPOTS.lz.z), 6, 0, Math.PI * 2); c.stroke();
  small('EXFIL', SPOTS.lz.x, SPOTS.lz.z, '#30ff90', -10);
  // Perches.
  for (const p of SPOTS.perches) { c.fillStyle = '#f2b35b'; c.beginPath(); c.moveTo(mx(p.x), my(p.z) - 6); c.lineTo(mx(p.x) + 5, my(p.z) + 4); c.lineTo(mx(p.x) - 5, my(p.z) + 4); c.closePath(); c.fill(); small(p.name, p.x, p.z, 'rgba(242,179,91,0.9)', 15); }
  // Known pickets in the draw.
  for (const [z, o] of [[230, 6], [166, -9], [214, 2], [236, -2]]) { const x = drawX(z) + o; c.strokeStyle = '#ff5060'; c.beginPath(); c.moveTo(mx(x) - 3, my(z) - 3); c.lineTo(mx(x) + 3, my(z) + 3); c.moveTo(mx(x) + 3, my(z) - 3); c.lineTo(mx(x) - 3, my(z) + 3); c.stroke(); }
  small('PICKETS', drawX(214) + 16, 214, 'rgba(255,100,110,0.9)', 3);
  // Routes from each drop point to the cliff.
  const route = (pts, on) => {
    c.strokeStyle = on ? 'rgba(0,255,224,0.9)' : 'rgba(0,255,224,0.3)';
    c.lineWidth = on ? 2 : 1;
    c.setLineDash([5, 5]);
    c.lineDashOffset = -t * 20;
    c.beginPath();
    pts.forEach(([x, z], i) => (i ? c.lineTo(mx(x), my(z)) : c.moveTo(mx(x), my(z))));
    c.stroke();
    c.setLineDash([]); c.lineWidth = 1;
  };
  const drawRoute = [];
  for (let z = DROPS.draw.insert[0].z; z > 150; z -= 6) drawRoute.push([drawX(z), z]);
  drawRoute.push([2, 146], [2, SPOTS.perches[0].z + 2]);
  route(drawRoute, sel === 'draw');
  route([[6, DROPS.ridge.insert[0].z], [2, SPOTS.perches[0].z + 2]], sel === 'ridge');
  // HALO drops: the transport's run-in, from off the map onto the knoll.
  for (const [k, D] of Object.entries(DROPS)) {
    if (!D.air) continue;
    const L = D.insert[0], f = Math.hypot(D.from[0], D.from[1]);
    const fx = D.from[0] / f, fz = D.from[1] / f;
    route([[L.x + fx * 120, L.z + fz * 120], [L.x, L.z]], sel === k);
    c.save();
    c.translate(mx(L.x + fx * 40), my(L.z + fz * 40));
    c.rotate(Math.atan2(-fz, -fx));
    c.fillStyle = sel === k ? 'rgba(0,255,224,0.9)' : 'rgba(0,255,224,0.35)';
    c.beginPath(); c.moveTo(8, 0); c.lineTo(-6, -6); c.lineTo(-3, 0); c.lineTo(-6, 6); c.closePath(); c.fill();
    c.restore();
  }
  // Drop points.
  const hits = [];
  for (const [k, D] of Object.entries(DROPS)) {
    const p = D.insert[0], x = mx(p.x), y = my(p.z), on = k === sel;
    const r = on ? 9 + Math.sin(t * 4) * 1.5 : 7;
    c.save(); c.translate(x, y); c.rotate(Math.PI / 4);
    c.fillStyle = on ? '#00ffe0' : 'rgba(0,30,34,0.9)';
    c.strokeStyle = '#00ffe0'; c.lineWidth = 2;
    c.fillRect(-r / 1.4, -r / 1.4, (r / 1.4) * 2, (r / 1.4) * 2); c.strokeRect(-r / 1.4, -r / 1.4, (r / 1.4) * 2, (r / 1.4) * 2);
    c.restore();
    c.font = '700 11px JetBrains Mono, monospace';
    const left = k === 'ridge' || k === 'east'; // keep clear of the perch labels
    const dy = D.air || k === 'ridge' ? -14 : 4;
    c.textAlign = left ? 'right' : 'left';
    c.fillStyle = on ? '#00ffe0' : 'rgba(0,255,224,0.6)';
    c.fillText(`${D.air ? 'HALO' : 'DROP'} · ${D.name}${on ? ' ✓' : ''}`, x + (left ? -14 : 14), y + dy);
    hits.push({ k, x, y });
  }
  // North arrow and scale.
  c.fillStyle = '#e8eaf2'; c.font = '700 10px JetBrains Mono, monospace'; c.textAlign = 'center';
  c.beginPath(); c.moveTo(W - 22, 14); c.lineTo(W - 16, 30); c.lineTo(W - 28, 30); c.closePath(); c.fill();
  c.fillText('N', W - 22, 42);
  const bar = 100 * s;
  c.strokeStyle = '#e8eaf2'; c.beginPath(); c.moveTo(W - 20 - bar, Hh - 16); c.lineTo(W - 20, Hh - 16); c.moveTo(W - 20 - bar, Hh - 20); c.lineTo(W - 20 - bar, Hh - 12); c.moveTo(W - 20, Hh - 20); c.lineTo(W - 20, Hh - 12); c.stroke();
  c.fillText('100 M', W - 20 - bar / 2, Hh - 22);
  return (cx, cy) => {
    const r = canvas.getBoundingClientRect();
    const px = cx - r.left, py = cy - r.top;
    let best = null, bd = 30;
    for (const h of hits) { const d = Math.hypot(h.x - px, h.y - py); if (d < bd) { bd = d; best = h.k; } }
    return best;
  };
}

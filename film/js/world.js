// The painted world: every background is painted procedurally (gouache-style dabs on canvas), baked once into
// textures, then softened with a Kuwahara pass so it reads as hand-painted. Also builds the sprite atlas.
import { rng, clamp, lerp } from './core.js';
import { HZ, WALL, capY, baseY, unitScale, PLACE, VP, TREE } from './space.js';

const mk = (w, h) => { const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h)); return c; };
const rgbS = (c, a = 1) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;
const hx = c => { const n = parseInt(c.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255]; };
const mixC = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t].map(Math.round);

// ---------- painter helpers (all coordinates in world units; the context carries the world->canvas transform)
function painter(rect, res) {
  const [x0, y0, x1, y1] = rect, c = mk((x1 - x0) * res, (y1 - y0) * res), ctx = c.getContext('2d');
  ctx.setTransform(res, 0, 0, res, -x0 * res, -y0 * res); ctx.lineJoin = ctx.lineCap = 'round';
  return { c, ctx, res, rect };
}
// fill a path, then layer soft dabs inside it: colour drifts from light (sun side) to shade with noise – the gouache look
function gouache(P, path, base, o = {}) {
  const { ctx, res } = P, r = o.r || 6, n = o.n || 200, R = rng(o.seed || 1), bb = o.bb;
  const B = hx(base), L = o.light ? hx(o.light) : mixC(B, [255, 236, 210], 0.35), D = o.dark ? hx(o.dark) : mixC(B, [70, 40, 90], 0.3);
  ctx.fillStyle = rgbS(B); ctx.fill(path);
  if (!bb) return;
  ctx.save(); ctx.clip(path);
  const lx = o.lx == null ? -1 : o.lx;
  for (let i = 0; i < n; i++) {
    const x = bb[0] + R() * (bb[2] - bb[0]), y = bb[1] + R() * (bb[3] - bb[1]);
    const u = (x - bb[0]) / (bb[2] - bb[0] || 1), v = (y - bb[1]) / (bb[3] - bb[1] || 1);
    let lt = lx < 0 ? 1 - u : u; if (o.vert) lt = lt * 0.5 + (1 - v) * 0.5;
    const t = clamp(lt + (R() - 0.5) * 0.6, 0, 1), col = t > 0.5 ? mixC(B, L, (t - 0.5) * 2) : mixC(D, B, t * 2);
    ctx.fillStyle = rgbS(col, (o.a || 0.22) * (0.5 + R() * 0.7));
    const rr = r * (0.5 + R()), ang = (o.ang || 0) + (R() - 0.5) * (o.angJ == null ? 0.8 : o.angJ);
    ctx.beginPath(); ctx.ellipse(x, y, rr * (o.sx || 1.8), rr * (o.sy || 0.7), ang, 0, 7); ctx.fill();
  }
  ctx.restore();
}
function grain(P, k = 0.06) { // paper tooth on painted areas only
  const { c, ctx } = P, g = mk(160, 160), gx = g.getContext('2d'), d = gx.createImageData(160, 160), R = rng(3);
  for (let i = 0; i < d.data.length; i += 4) { const v = 128 + (R() - 0.5) * 255; d.data[i] = d.data[i + 1] = d.data[i + 2] = v; d.data[i + 3] = 255; }
  gx.putImageData(d, 0, 0);
  ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalCompositeOperation = 'source-atop'; ctx.globalAlpha = k; ctx.fillStyle = ctx.createPattern(g, 'repeat'); ctx.fillRect(0, 0, c.width, c.height); ctx.restore();
}
const poly = pts => { const p = new Path2D(); pts.forEach((q, i) => (i ? p.lineTo(q[0], q[1]) : p.moveTo(q[0], q[1]))); p.closePath(); return p; };
const ell = (x, y, rx, ry, a = 0) => { const p = new Path2D(); p.ellipse(x, y, rx, ry, a, 0, 7); return p; };

// ---------------------------------------------------------------- the far shore: headland, lighthouse, town, beach
function farLayer(res) {
  const rect = [-1400, 360, 2600, 560], P = painter(rect, res), E = painter(rect, res), { ctx } = P, R = rng(11);
  const shore = x => (x < 760 ? HZ + 1 : 482 + (x - 760) * 0.03);
  // headland and hills across the bay (lavender, hazy)
  gouache(P, poly([[-1400, HZ + 1], [-1400, HZ - 40], [-1100, HZ - 58], [-760, HZ - 36], [-420, HZ - 30], [-80, HZ - 16], [210, HZ - 4], [260, HZ + 1]]), '#C9A6CF', { bb: [-1400, HZ - 60, 260, HZ], n: 260, r: 9, light: '#F2C8C8', dark: '#A88CC0', seed: 2 });
  gouache(P, poly([[-1400, HZ + 1], [-1400, HZ - 22], [-900, HZ - 30], [-500, HZ - 14], [-200, HZ - 6], [40, HZ + 1]]), '#B595C6', { bb: [-1400, HZ - 30, 40, HZ], n: 160, r: 7, seed: 3 });
  // lighthouse on the headland
  ctx.fillStyle = '#F4E6E0'; ctx.fillRect(118, HZ - 34, 7, 30); ctx.fillStyle = '#D9708A'; ctx.fillRect(118, HZ - 26, 7, 4); ctx.fillRect(118, HZ - 16, 7, 4);
  ctx.fillStyle = '#7A5A7A'; ctx.fillRect(116, HZ - 37, 11, 4);
  // the town along the curving shore on the right
  let x = 770; const cols = ['#F4C7C3', '#F6DDB8', '#C9C3E6', '#F3B8CB', '#E9D5C9', '#BFD8E3', '#F0CFA8'];
  while (x < 2580) {
    const d = (x - 770) / 1800, w = 14 + R() * 30, h = (20 + R() * 64) * (1 - d * 0.45), y = shore(x) - 3, c = cols[(R() * cols.length) | 0];
    gouache(P, poly([[x, y], [x, y - h], [x + w, y - h], [x + w, y]]), c, { bb: [x, y - h, x + w, y], n: 6, r: 4, seed: x | 0, light: '#FFF2DC' });
    ctx.fillStyle = 'rgba(255,240,220,.35)'; ctx.fillRect(x, y - h, w * 0.3, h);                       // sunlit side
    if (R() > 0.6) { ctx.fillStyle = 'rgba(120,80,110,.35)'; ctx.beginPath(); ctx.moveTo(x - 2, y - h); ctx.lineTo(x + w / 2, y - h - 8); ctx.lineTo(x + w + 2, y - h); ctx.fill(); }
    // windows (painted dim; their night glow goes in the emissive layer)
    for (let wy = y - h + 5; wy < y - 5; wy += 7) for (let wx = x + 3; wx < x + w - 3; wx += 6) {
      ctx.fillStyle = 'rgba(120,100,130,.28)'; ctx.fillRect(wx, wy, 2.2, 3);
      if (R() > 0.45) { E.ctx.fillStyle = `rgba(255,${200 + (R() * 40) | 0},${120 + (R() * 60) | 0},${0.6 + R() * 0.4})`; E.ctx.fillRect(wx - 0.4, wy - 0.4, 3, 3.8); }
    }
    if (R() > 0.75) { const tx = x + R() * w; ctx.fillStyle = '#7FAE84'; ctx.beginPath(); ctx.arc(tx, y - 5, 5 + R() * 4, 0, 7); ctx.fill(); }
    x += w + R() * 5;
  }
  // beach strip in front of the town
  const beach = new Path2D(); beach.moveTo(740, HZ + 4); for (let bx = 740; bx <= 2600; bx += 40) beach.lineTo(bx, shore(bx) + 1); for (let bx = 2600; bx >= 740; bx -= 40) beach.lineTo(bx, shore(bx) + 6 + (bx - 740) * 0.01); beach.closePath();
  gouache(P, beach, '#F5D9B6', { bb: [740, HZ, 2600, 560], n: 120, r: 6, seed: 9 });
  grain(P, 0.05);
  return { name: 'far', ...P, em: E.c, kind: 'ground', grid: [64, 6], gyFn: (x, y) => Math.max(y, shore(x)), fog: 0.25 };
}

// ---------------------------------------------------------------- the promenade: floor, sea wall, far end, launcher, shadows
function groundLayer(res) {
  const rect = [-700, 470, 2100, 1600], P = painter(rect, res), { ctx } = P, R = rng(21);
  const [c0, c1] = WALL.cap, [b0, b1] = WALL.base;
  // floor (reaches well past the frame on every side, so wider framings never find its edges)
  const floor = poly([[-700, baseY(-700) - 4], [b1[0], b1[1]], [2100, 482], [2100, 1600], [-700, 1600]]);
  const fg = ctx.createLinearGradient(0, 482, 0, 1600); fg.addColorStop(0, '#F4D8C6'); fg.addColorStop(0.27, '#EBC4B4'); fg.addColorStop(0.6, '#D8A9A3'); fg.addColorStop(1, '#CC9C9A');
  ctx.fillStyle = fg; ctx.fill(floor);
  ctx.save(); ctx.clip(floor);
  // sun-warmed area and painterly variation
  const lg = ctx.createRadialGradient(560, 640, 0, 560, 640, 900); lg.addColorStop(0, 'rgba(255,224,182,.45)'); lg.addColorStop(1, 'rgba(255,224,182,0)'); ctx.fillStyle = lg; ctx.fillRect(-700, 470, 2800, 1130);
  for (let i = 0; i < 1700; i++) {
    const y = 482 + Math.pow(R(), 0.8) * 1118, x = -700 + R() * 2800, s = (y - HZ) / 530;
    ctx.fillStyle = R() > 0.5 ? `rgba(255,236,214,${0.08 + R() * 0.1})` : `rgba(170,110,140,${0.05 + R() * 0.07})`;
    ctx.beginPath(); ctx.ellipse(x, y, (10 + R() * 26) * s, (1.6 + R() * 2.4) * s, (R() - 0.5) * 0.15, 0, 7); ctx.fill();
  }
  // tiles converging to the vanishing point
  ctx.strokeStyle = 'rgba(140,90,120,.10)'; ctx.lineWidth = 1.2;
  for (let x = -3000; x < 5000; x += 230) { ctx.beginPath(); ctx.moveTo(VP[0], VP[1]); ctx.lineTo(VP[0] + (x - VP[0]) * (1600 - VP[1]) / (1150 - VP[1]), 1600); ctx.stroke(); }
  for (let k = 1; k < 19; k++) { const y = HZ + 680 / (1 + 12 / (k * k * 0.16 + 0.4)) * 0.97; ctx.lineWidth = 0.4 + (y - 480) / 320; ctx.beginPath(); ctx.moveTo(-700, y); ctx.lineTo(2100, y); ctx.stroke(); }
  // the big tree's soft moon shadow (the moon is high on the left, over the sea): the canopy falls to the right of its bed
  { const tu = unitScale(TREE.gy), g = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
    g.addColorStop(0, 'rgba(70,36,96,.30)'); g.addColorStop(0.6, 'rgba(70,36,96,.16)'); g.addColorStop(1, 'rgba(70,36,96,0)');
    ctx.save(); ctx.translate(TREE.x + 120 * tu, TREE.gy + 9 * tu); ctx.scale(200 * tu, 22 * tu); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, 1, 0, 7); ctx.fill(); ctx.restore();
    // fallen bracts on the paving round the bed, thinning out with distance
    for (let i = 0; i < 160; i++) { const a = R() * 6.283, d = 0.95 + Math.pow(R(), 1.6) * 1.9, x = TREE.x + (6 + Math.cos(a) * 82 * d) * tu, y = TREE.gy + (-4 + Math.sin(a) * 10.5 * d) * tu + (R() - 0.5) * 3 * tu;
      if (y < TREE.gy - 14 * tu * 0.3 && Math.abs(x - TREE.x) < 90 * tu) continue;
      ctx.fillStyle = R() > 0.5 ? 'rgba(214,52,112,.85)' : 'rgba(250,128,176,.85)'; ctx.beginPath(); ctx.ellipse(x, y, 1.5 * tu, 0.8 * tu, R() * 3, 0, 7); ctx.fill(); } }
  ctx.restore();
  // far end of the promenade: tiny trees, kiosks and lamps near the vanishing point
  for (let i = 0; i < 12; i++) {
    const d = i / 12, y = 486 + Math.pow(1 - d, 2) * 34, x = 800 + d * 360 + (1 - d) * 60, s = (y - HZ) / 530 * 6.8;
    if (i % 3 === 0) { ctx.fillStyle = '#5E8F72'; ctx.beginPath(); ctx.arc(x, y - 9 * s, 5 * s, 0, 7); ctx.fill(); ctx.fillStyle = '#6B4A4E'; ctx.fillRect(x - 0.4 * s, y - 6 * s, 0.8 * s, 6 * s); }
    else if (i % 3 === 1) { ctx.fillStyle = ['#E2447C', '#3FA0D8', '#F2B33D'][i % 3]; ctx.fillRect(x - 4 * s, y - 7 * s, 8 * s, 2 * s); ctx.fillStyle = '#EED9C9'; ctx.fillRect(x - 3.4 * s, y - 5 * s, 6.8 * s, 5 * s); }
  }
  grain(P, 0.05);
  const E = litPools(P, rect, res, [[600, 604, 170, 44, 0.55], [150, 860, 300, 80, 0.5], [640, 690, 560, 130, 0.32], [TEA.x, TEA.y + 2, 120 * unitScale(TEA.y) / 4.3, 22 * unitScale(TEA.y) / 4.3, 0.8], [330, 742, 150, 36, 0.5], [1000, 575, 120, 26, 0.3],
    [TREE.x - 20 * unitScale(TREE.gy), TREE.gy + 4, 120 * unitScale(TREE.gy), 16 * unitScale(TREE.gy), 0.32]]);
  return { name: 'ground', ...P, em: E, kind: 'ground', grid: [56, 50], gyFn: (x, y) => Math.max(y, 482), fog: 0.5 };
}
// the sea wall on its own layer: every point of it shares the depth of its base line, so it stays upright when the camera moves
function wallLayer(res) {
  const rect = [-800, 470, 760, 1320], P = painter(rect, res), { ctx } = P;
  const [, c1] = WALL.cap, [, b1] = WALL.base, c0 = [-800, capY(-800)], b0 = [-800, baseY(-800)], d0 = 28 + 25 * 500 / 1040;   // extended towards the camera
  // the sea wall face
  const face = poly([c0, c1, b1, b0]);
  gouache(P, face, '#DDB3AA', { bb: [-800, 478, 745, 1260], n: 900, r: 9, light: '#F3D2C2', dark: '#B48694', lx: 1, seed: 5, a: 0.18 });
  ctx.save(); ctx.clip(face);
  ctx.strokeStyle = 'rgba(110,60,90,.22)'; ctx.lineWidth = 1.5;
  for (let i = 0; i < 34; i++) { const u = Math.pow(i / 34, 1.6), x = -800 + u * 1540; ctx.beginPath(); ctx.moveTo(x, capY(x)); ctx.lineTo(x, baseY(x)); ctx.stroke(); }
  ctx.beginPath(); for (let x = -800; x <= 740; x += 10) { const y = (capY(x) * 0.55 + baseY(x) * 0.45); x === -800 ? ctx.moveTo(x, y) : ctx.lineTo(x, y); } ctx.stroke();
  const sh = ctx.createLinearGradient(0, 480, 0, 1260); sh.addColorStop(0, 'rgba(100,50,110,0)'); sh.addColorStop(1, 'rgba(100,50,110,.3)'); ctx.fillStyle = sh; ctx.fillRect(-800, 470, 1600, 850);
  ctx.restore();
  // cap of the wall, catching the sun
  const cap = poly([[c0[0], c0[1] - d0], [c1[0], c1[1] - 3], c1, c0]);
  gouache(P, cap, '#F6DCCB', { bb: [-800, 470, 740, 1000], n: 220, r: 6, light: '#FFF0DE', seed: 6 });
  ctx.strokeStyle = 'rgba(255,244,226,.9)'; ctx.lineWidth = 2.2; ctx.beginPath(); ctx.moveTo(c0[0], c0[1] - d0); ctx.lineTo(c1[0], c1[1] - 3); ctx.stroke();
  // her birthday garland: warm fairy lights looped along the wall face just under the cap, from the lamp to beyond Jessi
  const G = garland(); ctx.lineWidth = 0.9; ctx.strokeStyle = 'rgba(50,36,48,.7)';
  for (const sp of G.spans) { ctx.beginPath(); sp.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.stroke(); }
  for (const [x, y, gy, k] of G.bulbs) { const r = 0.95 * unitScale(gy); ctx.fillStyle = ['#FFF3D2', '#FFD9E6', '#FFE6B0'][k]; ctx.beginPath(); ctx.arc(x, y + r * 0.6, r, 0, 7); ctx.fill(); ctx.fillStyle = '#4A3A48'; ctx.fillRect(x - r * 0.45, y - r * 0.5, r * 0.9, r * 0.7); }
  // a few tiny people sitting on the far wall
  for (const x of [560, 610, 640, 700, 716]) { const y = capY(x) - 1.5, s = unitScale(baseY(x)); ctx.fillStyle = 'rgba(90,60,100,.75)'; ctx.beginPath(); ctx.ellipse(x, y - 8 * s, 2.6 * s, 6 * s, 0, 0, 7); ctx.fill(); ctx.beginPath(); ctx.arc(x, y - 16 * s, 2.4 * s, 0, 7); ctx.fill(); }
  grain(P, 0.05);
  const jx = PLACE.jar.x, E = litPools(P, rect, res, [[jx, capY(jx) - 2, 60, 34, 0.7], [jx - 6, capY(jx) + 30, 46, 40, 0.3], [560, capY(560) + 4, 70, 30, 0.6], [60, capY(60) + 10, 110, 50, 0.5],
    ...G.bulbs.filter((_, i) => i % 4 === 0).map(([x, y, gy]) => [x, y + 4 * unitScale(gy), 9 * unitScale(gy), 7 * unitScale(gy), 0.42])]);
  { const ex = E.getContext('2d');
    ex.fillStyle = 'rgba(150,160,215,.16)'; ex.fill(cap);                                                        // moonlight on the top of the wall
    ex.strokeStyle = 'rgba(215,222,255,.6)'; ex.lineWidth = 2.4; ex.beginPath(); ex.moveTo(c0[0], c0[1]); ex.lineTo(c1[0], c1[1]); ex.stroke();   // its front edge
    ex.strokeStyle = 'rgba(200,210,250,.28)'; ex.lineWidth = 1.4; ex.beginPath(); ex.moveTo(c0[0], c0[1] - d0); ex.lineTo(c1[0], c1[1] - 3); ex.stroke();
    const fg = ex.createLinearGradient(0, 480, 0, 1260); fg.addColorStop(0, 'rgba(120,120,170,.10)'); fg.addColorStop(1, 'rgba(120,120,170,0)'); ex.fillStyle = fg; ex.fill(face);
    for (const [x, y, gy, k] of G.bulbs) { const s = unitScale(gy), r = 2.5 * s, c = [[255, 222, 160], [255, 196, 214], [255, 214, 140]][k];
      ex.fillStyle = radial(ex, x, y + 0.6 * s, r, [[0, `rgba(${c},.75)`], [0.22, `rgba(${c},.3)`], [1, `rgba(${c},0)`]]); ex.fillRect(x - r, y + 0.6 * s - r, r * 2, r * 2); } }
  return { name: 'wall', ...P, em: E, kind: 'ground', grid: [54, 4], gyFn: (x) => baseY(Math.min(x, 745)), fog: 0.5 };
}

// her birthday garland along the sea wall's face: hooks at even steps along the wall (in depth), drooping spans, bulbs
export function garland() {
  const [b0, b1] = WALL.base, xOfGy = gy => b0[0] + (gy - b0[1]) * (b1[0] - b0[0]) / (b1[1] - b0[1]), spans = [], bulbs = [];
  const hook = Z => { const gy = HZ + 2400 / Z, x = xOfGy(gy); return [x, capY(x) + 0.12 * (baseY(x) - capY(x)), gy]; };
  for (let Z = 7, i = 0; Z < 19.9; Z += 1.29, i++) {   // strung between the two lamps (x ≈ 100 … 550)
    const a = hook(Z), b = hook(Z + 1.29), sag = 0.3 * (baseY((a[0] + b[0]) / 2) - capY((a[0] + b[0]) / 2)), pts = [];
    for (let k = 0; k <= 12; k++) { const u = k / 12; pts.push([lerp(a[0], b[0], u), lerp(a[1], b[1], u) + sag * 4 * u * (1 - u)]); }
    spans.push(pts);
    for (const u of [0.2, 0.4, 0.6, 0.8]) bulbs.push([lerp(a[0], b[0], u), lerp(a[1], b[1], u) + sag * 4 * u * (1 - u), lerp(a[2], b[2], u), (i * 4 + Math.round(u * 5)) % 3]);
  }
  return { spans, bulbs };
}
// night: the painted surface lit warm by lamps, lanterns and string lights, kept only inside soft pools (emissive layer)
function litPools(P, rect, res, pools, warm = '#FFB878') {
  const E = painter(rect, res), M = painter(rect, res), ex = E.ctx, mx = M.ctx;
  ex.save(); ex.setTransform(1, 0, 0, 1, 0, 0); ex.drawImage(P.c, 0, 0); ex.globalCompositeOperation = 'multiply'; ex.fillStyle = warm; ex.fillRect(0, 0, E.c.width, E.c.height); ex.restore();
  for (const [x, y, rx, ry, a] of pools) { mx.save(); mx.translate(x, y); mx.scale(1, ry / rx); const g = mx.createRadialGradient(0, 0, 0, 0, 0, rx); g.addColorStop(0, `rgba(0,0,0,${a})`); g.addColorStop(0.45, `rgba(0,0,0,${a * 0.5})`); g.addColorStop(1, 'rgba(0,0,0,0)'); mx.fillStyle = g; mx.fillRect(-rx, -rx, rx * 2, rx * 2); mx.restore(); }
  ex.save(); ex.setTransform(1, 0, 0, 1, 0, 0); ex.globalCompositeOperation = 'destination-in'; ex.drawImage(M.c, 0, 0); ex.restore();
  return E.c;
}
function jarLantern(res) {
  const x = PLACE.jar.x, by = capY(x) - 1, gy = baseY(x), s = unitScale(gy);
  return bill('jar', [x - 14 * s, by - 18 * s, x + 14 * s, by + 2], gy, res, (P, E) => {
    const { ctx } = P;
    ctx.fillStyle = 'rgba(40,20,50,.35)'; ctx.beginPath(); ctx.ellipse(x + 1.5 * s, by, 4.2 * s, 1 * s, 0, 0, 7); ctx.fill();
    // glass jar with a candle inside
    ctx.fillStyle = 'rgba(210,225,240,.35)'; ctx.beginPath(); ctx.roundRect(x - 2.8 * s, by - 7.6 * s, 5.6 * s, 7.6 * s, 1.3 * s); ctx.fill();
    ctx.fillStyle = '#FFF1D6'; ctx.fillRect(x - 1.1 * s, by - 3.6 * s, 2.2 * s, 3.4 * s);
    ctx.fillStyle = '#FFE7A8'; ctx.beginPath(); ctx.ellipse(x, by - 4.5 * s, 0.55 * s, 1.0 * s, 0, 0, 7); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,.55)'; ctx.lineWidth = 0.35 * s; ctx.beginPath(); ctx.moveTo(x - 2.1 * s, by - 6.6 * s); ctx.lineTo(x - 2.1 * s, by - 1.2 * s); ctx.stroke();
    ctx.fillStyle = '#5A4A58'; ctx.fillRect(x - 3 * s, by - 8.4 * s, 6 * s, 1 * s);
    ctx.strokeStyle = '#5A4A58'; ctx.lineWidth = 0.3 * s; ctx.beginPath(); ctx.arc(x, by - 8.4 * s, 2.8 * s, Math.PI, 0); ctx.stroke();
    const g = E.ctx.createRadialGradient(x, by - 4 * s, 0, x, by - 4 * s, 9 * s); g.addColorStop(0, 'rgba(255,214,140,.85)'); g.addColorStop(0.25, 'rgba(255,180,100,.4)'); g.addColorStop(1, 'rgba(255,160,90,0)');
    E.ctx.fillStyle = g; E.ctx.fillRect(x - 13 * s, by - 17 * s, 26 * s, 19 * s);
    E.ctx.fillStyle = 'rgba(255,250,225,1)'; E.ctx.beginPath(); E.ctx.ellipse(x, by - 4.5 * s, 0.7 * s, 1.2 * s, 0, 0, 7); E.ctx.fill();
  }, { em: true, light: [x, by - 4.2 * s] });
}

// ---------------------------------------------------------------- after the cake: her little birthday corner on the wall, left of her
// Each piece stands on the wall cap at its own depth and is painted in character units (u) around its base.
// The jar lantern (to their right) lights them warm; the moon rims them from the upper left.
function onWall(name, x, inset, U, res, paint, extra = {}) {
  const by = capY(x) - inset, gy = baseY(x), s = unitScale(gy), rect = [x + U[0] * s, by + U[1] * s, x + U[2] * s, by + U[3] * s];
  const L = bill(name, rect, gy, res * 1.5, (P, E) => {
    for (const c of [P.ctx, E.ctx]) { c.translate(x, by); c.scale(s, s); }
    paint(P, E, s);
    rimLight(P, E, [-0.5 * s * res * 1.5, -0.7 * s * res * 1.5], [160, 175, 240], 0.3);
  }, { em: true, ...extra });
  L.base = [x, by]; L.s = s; return L;
}
const radial = (c, x, y, r, stops) => { const g = c.createRadialGradient(x, y, 0, x, y, r); stops.forEach(([o, col]) => g.addColorStop(o, col)); return g; };
const CAKE_K = 0.74, GIFT_K = 1;   // the party pieces are drawn at these scales of their sketch sizes
// the cake: a little two-tier pink cake on a white stand, one striped candle (the one she just blew out), a slice cut and plated
function cake(res) {
  const x = PLACE.party.cake;
  return onWall('cake', x, 7, [-11, -21, 11, 3.5], res, (P, E) => {
    const ctx = P.ctx, ex = E.ctx; ctx.scale(CAKE_K, CAKE_K); ex.scale(CAKE_K, CAKE_K);
    ctx.fillStyle = 'rgba(40,20,50,.35)'; ctx.beginPath(); ctx.ellipse(1, 0.2, 10.5, 1.5, 0, 0, 7); ctx.fill();
    // stand: foot, stem, plate
    const wh = (x0, x1) => { const g = ctx.createLinearGradient(x0, 0, x1, 0); g.addColorStop(0, '#FFFFFF'); g.addColorStop(0.55, '#EDE6EE'); g.addColorStop(1, '#BFB2C6'); return g; };
    ctx.fillStyle = wh(-4, 4); ctx.beginPath(); ctx.ellipse(0, -0.6, 4.2, 1.1, 0, 0, 7); ctx.fill(); ctx.fillRect(-0.9, -5.4, 1.8, 4.8);
    ctx.beginPath(); ctx.ellipse(0, -5.9, 8.6, 1.7, 0, 0, 7); ctx.fill(); ctx.fillStyle = '#FFFFFF'; ctx.beginPath(); ctx.ellipse(0, -6.3, 8.2, 1.4, 0, 0, 7); ctx.fill();
    // two tiers of pink frosting with white drips and piping
    const tier = (y0, h, r, seed) => { const R = rng(seed), g = ctx.createLinearGradient(-r, 0, r, 0); g.addColorStop(0, '#FFD3E2'); g.addColorStop(0.45, '#F7A9C6'); g.addColorStop(1, '#C9708F');
      ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(0, y0, r, r * 0.2, 0, 0, Math.PI); ctx.lineTo(-r, y0 - h); ctx.ellipse(0, y0 - h, r, r * 0.2, 0, Math.PI, 0, true); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#F6CADB'; ctx.beginPath(); ctx.ellipse(0, y0 - h, r, r * 0.2, 0, 0, 7); ctx.fill();
      ctx.fillStyle = '#F8E2EA'; for (let i = 0; i <= 10; i++) { const a = Math.PI * i / 10, dx = -Math.cos(a) * r, dy = Math.sin(a) * r * 0.2, l = 0.8 + R() * 1.6; ctx.beginPath(); ctx.ellipse(dx, y0 - h + dy + l * 0.5, 0.42, l * 0.6, 0, 0, 7); ctx.fill(); }
      for (let i = 0; i <= 12; i++) { const a = Math.PI * i / 12, dx = -Math.cos(a) * r, dy = Math.sin(a) * r * 0.2; ctx.beginPath(); ctx.arc(dx, y0 + dy - 0.2, 0.5, 0, 7); ctx.fill(); }
      for (let i = 0; i < 9; i++) { ctx.fillStyle = ['#FFD27A', '#8EC9FF', '#B9A3FF', '#FF7EB0'][i % 4]; ctx.fillRect((R() - 0.5) * r * 1.5, y0 - h + (R() - 0.5) * r * 0.25, 0.7, 0.3); } };
    tier(-6.6, 4.4, 6.6, 3); tier(-11.2, 3.4, 4.4, 4);
    // a slice already cut: the notch shows the layers
    ctx.fillStyle = '#FBE7C8'; ctx.beginPath(); ctx.moveTo(2.2, -11.2); ctx.lineTo(5.8, -10.3); ctx.lineTo(5.8, -6.1); ctx.lineTo(2.2, -6.9); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#E86A93'; for (const yy of [-9.6, -8.2]) { ctx.beginPath(); ctx.moveTo(2.2, yy); ctx.lineTo(5.8, yy + 0.8); ctx.lineTo(5.8, yy + 1.3); ctx.lineTo(2.2, yy + 0.5); ctx.fill(); }
    // the candle, striped like the one she blew out, its wick black now
    const cg = ctx.createLinearGradient(-0.6, 0, 0.6, 0); cg.addColorStop(0, '#E9D7FF'); cg.addColorStop(0.5, '#FFFFFF'); cg.addColorStop(1, '#C8B4F0'); ctx.fillStyle = cg; ctx.fillRect(-0.6, -21.4, 1.2, 7);
    ctx.save(); ctx.beginPath(); ctx.rect(-0.6, -21.4, 1.2, 7); ctx.clip(); ctx.fillStyle = '#FF9EC4'; for (let i = 0; i < 5; i++) { ctx.save(); ctx.translate(0, -21 + i * 1.5); ctx.rotate(-0.5); ctx.fillRect(-1.4, 0, 2.8, 0.45); ctx.restore(); } ctx.restore();
    ctx.strokeStyle = '#2A1E24'; ctx.lineWidth = 0.28; ctx.beginPath(); ctx.moveTo(0, -21.4); ctx.quadraticCurveTo(0.3, -22.1, 0.1, -22.6); ctx.stroke();
    // the slice on a little plate in front, with a fork
    ctx.fillStyle = '#FFFFFF'; ctx.beginPath(); ctx.ellipse(8.6, 2, 3.6, 0.9, 0, 0, 7); ctx.fill(); ctx.fillStyle = '#D9CFE0'; ctx.beginPath(); ctx.ellipse(8.6, 2.2, 2.4, 0.5, 0, 0, 7); ctx.fill();
    ctx.fillStyle = '#FBE7C8'; ctx.beginPath(); ctx.moveTo(6.6, 1.8); ctx.lineTo(10.4, 1.4); ctx.lineTo(10.4, -1.6); ctx.lineTo(6.6, -0.9); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#E86A93'; ctx.fillRect(6.6, 0.1, 3.8, 0.45); ctx.fillStyle = '#F7A9C6'; ctx.beginPath(); ctx.moveTo(6.6, -0.9); ctx.lineTo(10.4, -1.6); ctx.lineTo(9.6, -2.2); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#C9C2D2'; ctx.lineWidth = 0.3; ctx.beginPath(); ctx.moveTo(10.9, 2.1); ctx.lineTo(13.2, 0.9); ctx.stroke();
    // night: the jar lantern's warm light on the right of the cake, a dull ember at the wick
    ex.fillStyle = radial(ex, 10, -8, 16, [[0, 'rgba(255,190,120,.3)'], [0.5, 'rgba(255,170,100,.12)'], [1, 'rgba(255,160,90,0)']]); ex.save(); ex.globalCompositeOperation = 'source-over'; ex.fillRect(-14, -27, 28, 31); ex.restore();
    ex.save(); ex.globalCompositeOperation = 'destination-in'; ex.setTransform(1, 0, 0, 1, 0, 0); ex.drawImage(P.c, 0, 0); ex.restore();
    ex.fillStyle = radial(ex, 0.1, -22.5, 1.2, [[0, 'rgba(255,120,60,.8)'], [1, 'rgba(255,90,40,0)']]); ex.fillRect(-1.5, -24, 3, 3);
  }, { smoke: true });
}
// her presents: a pale-blue box with a pink ribbon and bow (the balloons are tied to it) and a small gold one
function gifts(res) {
  return onWall('gifts', PLACE.party.gift, 5, [-10, -13, 10, 2.5], res, (P, E) => {
    const ctx = P.ctx, ex = E.ctx; ctx.scale(GIFT_K, GIFT_K); ex.scale(GIFT_K, GIFT_K);
    ctx.fillStyle = 'rgba(40,20,50,.35)'; ctx.beginPath(); ctx.ellipse(1.5, 0.3, 11, 1.6, 0, 0, 7); ctx.fill();
    const box = (x0, w, h, d, col, side, top, rib, tilt) => {   // a box seen a little from above and from its left
      ctx.save(); ctx.translate(x0, 0); ctx.rotate(tilt);
      ctx.fillStyle = col; ctx.fillRect(-w / 2, -h, w, h);
      ctx.fillStyle = side; ctx.beginPath(); ctx.moveTo(w / 2, 0); ctx.lineTo(w / 2 + d, -d * 0.45); ctx.lineTo(w / 2 + d, -h - d * 0.45); ctx.lineTo(w / 2, -h); ctx.fill();
      ctx.fillStyle = top; ctx.beginPath(); ctx.moveTo(-w / 2, -h); ctx.lineTo(w / 2, -h); ctx.lineTo(w / 2 + d, -h - d * 0.45); ctx.lineTo(-w / 2 + d, -h - d * 0.45); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,.18)'; ctx.fillRect(-w / 2, -h, w * 0.22, h);
      ctx.fillStyle = rib; ctx.fillRect(-w * 0.09, -h, w * 0.18, h); ctx.beginPath(); ctx.moveTo(w / 2, -h * 0.55); ctx.lineTo(w / 2 + d, -h * 0.55 - d * 0.45); ctx.lineTo(w / 2 + d, -h * 0.55 - d * 0.45 + 0.9); ctx.lineTo(w / 2, -h * 0.55 + 0.9); ctx.fill();
      ctx.beginPath(); ctx.moveTo(-w * 0.09 + d * 0.5, -h - d * 0.22); ctx.lineTo(w * 0.09 + d * 0.5, -h - d * 0.22); ctx.lineTo(w * 0.09, -h); ctx.lineTo(-w * 0.09, -h); ctx.fill();
      // the bow: two loops and two tails
      const bx = d * 0.5, byy = -h - d * 0.25; ctx.fillStyle = rib;
      for (const sg of [-1, 1]) { ctx.beginPath(); ctx.ellipse(bx + sg * w * 0.16, byy - 1.2, w * 0.17, w * 0.1, sg * 0.45, 0, 7); ctx.fill(); ctx.beginPath(); ctx.moveTo(bx, byy); ctx.lineTo(bx + sg * w * 0.2, byy + 2.4); ctx.lineTo(bx + sg * w * 0.13, byy + 2.6); ctx.fill(); }
      ctx.fillStyle = 'rgba(255,255,255,.35)'; for (const sg of [-1, 1]) { ctx.beginPath(); ctx.ellipse(bx + sg * w * 0.18, byy - 1.6, w * 0.06, w * 0.03, sg * 0.45, 0, 7); ctx.fill(); }
      ctx.fillStyle = rib; ctx.beginPath(); ctx.arc(bx, byy - 0.6, w * 0.06, 0, 7); ctx.fill();
      ctx.restore();
    };
    box(1.5, 10.5, 8.2, 3.2, '#8FB8E2', '#6A90BE', '#B4D4F0', '#F26FA4', 0);
    box(-7.2, 5.6, 4.4, 1.8, '#F2C14E', '#C9962E', '#FBDD8E', '#FFFFFF', -0.06);
    ex.fillStyle = radial(ex, 12, -6, 15, [[0, 'rgba(255,190,120,.22)'], [1, 'rgba(255,160,90,0)']]); ex.fillRect(-12, -16, 24, 19);
    ex.save(); ex.globalCompositeOperation = 'destination-in'; ex.setTransform(1, 0, 0, 1, 0, 0); ex.drawImage(P.c, 0, 0); ex.restore();
  }, { tie: true });
}
// four balloons on long ribbons tied to the bow, swaying in the sea breeze (the billboard's sway bends them from the knot up)
function balloons(res) {
  const gy = baseY(PLACE.party.gift), s = unitScale(gy), tie = [PLACE.party.gift + 3.1 * GIFT_K * s, capY(PLACE.party.gift) - 5 - 10.2 * GIFT_K * s];
  const B = [[-9, -50, '#F4A6BC', 0], [2, -57, '#F5C451', 0], [10, -47, '#B9A0E8', 0], [-2, -42, '#FF6FA6', 1]];
  const rect = [tie[0] - 16 * s, tie[1] - 64 * s, tie[0] + 17 * s, tie[1] + 1 * s];
  return bill('balloons', rect, gy, res * 1.5, (P, E) => {
    const ctx = P.ctx, ex = E.ctx;
    for (const c of [ctx, ex]) { c.translate(tie[0], tie[1]); c.scale(s, s); }
    for (const [bx, byy, col, heart] of B) { ctx.save(); ex.save();
      ctx.strokeStyle = 'rgba(240,236,250,.75)'; ctx.lineWidth = 0.22; ctx.beginPath(); ctx.moveTo(0, 0); ctx.bezierCurveTo(bx * 0.2, byy * 0.35, bx * 0.9 + 1.5, byy * 0.7, bx, byy + 7.5); ctx.stroke();
      const c = hx(col), g = ctx.createRadialGradient(bx - 2, byy - 2.5, 0.4, bx, byy, 8.5); g.addColorStop(0, rgbS(mixC(c, [255, 255, 255], 0.65))); g.addColorStop(0.35, col); g.addColorStop(1, rgbS(mixC(c, [60, 30, 80], 0.45)));
      ctx.fillStyle = g; ctx.beginPath();
      if (heart) { ctx.moveTo(bx, byy + 7); ctx.bezierCurveTo(bx - 9, byy, bx - 6.5, byy - 8.5, bx, byy - 4.2); ctx.bezierCurveTo(bx + 6.5, byy - 8.5, bx + 9, byy, bx, byy + 7); }
      else ctx.ellipse(bx, byy, 6, 7.2, 0, 0, 7);
      ctx.fill(); ctx.fillStyle = rgbS(mixC(c, [60, 30, 80], 0.3)); ctx.beginPath(); ctx.moveTo(bx - 0.8, byy + 7.8); ctx.lineTo(bx + 0.8, byy + 7.8); ctx.lineTo(bx, byy + 6.8); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,.75)'; ctx.beginPath(); ctx.ellipse(bx - 2.4, byy - 3.2, 1.1, 1.9, -0.5, 0, 7); ctx.fill();
      // night: a warm reflection of her jar lantern on the right of each balloon
      ex.fillStyle = radial(ex, bx + 3.5, byy + 1.5, 4.5, [[0, 'rgba(255,200,140,.42)'], [1, 'rgba(255,180,120,0)']]); ex.beginPath(); ex.ellipse(bx, byy, 6, 7.2, 0, 0, 7); ex.fill();
      ctx.restore(); ex.restore();
    }
    rimLight(P, E, [-0.5 * s * res * 1.5, -0.7 * s * res * 1.5], [170, 185, 245], 0.5);
  }, { em: true, sway: 0.03, swayY0: 1 });
}
function bill(name, rect, gy, res, paint, extra = {}) { const P = painter(rect, res), E = extra.em ? painter(rect, res) : null; paint(P, E); grain(P, 0.045); return { name, ...P, ...extra, em: E ? E.c : null, kind: 'bill', gy }; }
function lamp(x, res) {
  const by = capY(x), gy = baseY(x), s = unitScale(gy), h = 150 * s;
  return bill('lamp' + x, [x - 14 * s, by - h - 14 * s, x + 14 * s, by + 2], gy, res, (P, E) => {
    const { ctx } = P;
    ctx.fillStyle = '#3E3247'; ctx.fillRect(x - 1.6 * s, by - h, 3.2 * s, h); ctx.fillRect(x - 3.2 * s, by - 6 * s, 6.4 * s, 6 * s);
    ctx.strokeStyle = 'rgba(255,214,170,.55)'; ctx.lineWidth = 0.7 * s; ctx.beginPath(); ctx.moveTo(x - 1.2 * s, by - 4); ctx.lineTo(x - 1.2 * s, by - h); ctx.stroke();
    ctx.fillStyle = '#3E3247'; ctx.beginPath(); ctx.moveTo(x - 6 * s, by - h); ctx.quadraticCurveTo(x, by - h - 12 * s, x + 6 * s, by - h); ctx.fill();
    ctx.fillStyle = '#FFE8BC'; ctx.beginPath(); ctx.arc(x, by - h - 4.5 * s, 4.2 * s, 0, 7); ctx.fill();
    const g = E.ctx.createRadialGradient(x, by - h - 4.5 * s, 0, x, by - h - 4.5 * s, 12 * s); g.addColorStop(0, 'rgba(255,226,160,1)'); g.addColorStop(1, 'rgba(255,226,160,0)');
    E.ctx.fillStyle = g; E.ctx.beginPath(); E.ctx.arc(x, by - h - 4.5 * s, 12 * s, 0, 7); E.ctx.fill();
  }, { em: true, light: [x, by - h - 4.5 * s] });
}
const TEA = { x: 920, y: 526 };            // the chai cart, now at the far end of the promenade (people gather there)
function teaCart(res) {
  const { x, y } = TEA, s = unitScale(y) * 1.05;
  return bill('tea', [x - 40 * s, y - 80 * s, x + 40 * s, y + 6 * s], y, res, (P, E) => {
    const { ctx } = P;
    ctx.fillStyle = 'rgba(100,55,110,.25)'; ctx.beginPath(); ctx.ellipse(x, y, 32 * s, 4 * s, 0, 0, 7); ctx.fill();
    for (const wx of [-17, 17]) { ctx.strokeStyle = '#4A3443'; ctx.lineWidth = 1.8 * s; ctx.beginPath(); ctx.arc(x + wx * s, y - 6 * s, 6 * s, 0, 7); ctx.stroke(); }
    gouache(P, poly([[x - 27 * s, y - 34 * s], [x + 27 * s, y - 34 * s], [x + 27 * s, y - 10 * s], [x - 27 * s, y - 10 * s]]), '#3FA0D8', { bb: [x - 27 * s, y - 34 * s, x + 27 * s, y - 10 * s], n: 40, r: 3 * s, seed: 4 });
    ctx.fillStyle = '#F2B33D'; ctx.fillRect(x - 27 * s, y - 34 * s, 54 * s, 4 * s);
    ctx.fillStyle = '#8A5A3E'; ctx.fillRect(x - 25 * s, y - 68 * s, 2.4 * s, 34 * s); ctx.fillRect(x + 22.6 * s, y - 68 * s, 2.4 * s, 34 * s);
    for (let i = 0; i < 6; i++) { ctx.fillStyle = i % 2 ? '#FFF6EE' : '#E2447C'; ctx.beginPath(); ctx.moveTo(x - 31 * s + i * 10.4 * s, y - 68 * s); ctx.lineTo(x - 20.6 * s + i * 10.4 * s, y - 68 * s); ctx.lineTo(x - 18.6 * s + i * 10.4 * s, y - 60 * s); ctx.quadraticCurveTo(x - 23.6 * s + i * 10.4 * s, y - 56.5 * s, x - 28.6 * s + i * 10.4 * s, y - 60 * s); ctx.closePath(); ctx.fill(); }
    ctx.fillStyle = '#C0C4CC'; ctx.beginPath(); ctx.roundRect(x - 15 * s, y - 47 * s, 9 * s, 13 * s, 2 * s); ctx.fill();
    for (let i = 0; i < 3; i++) { ctx.fillStyle = 'rgba(255,240,220,.9)'; ctx.fillRect(x + 2 * s + i * 6 * s, y - 41 * s, 4 * s, 7 * s); }
    for (let i = 0; i < 5; i++) { const bx = x - 22 * s + i * 11 * s, byy = y - 60 * s; ctx.fillStyle = '#FFE7B0'; ctx.beginPath(); ctx.arc(bx, byy, 1.3 * s, 0, 7); ctx.fill();
      const g = E.ctx.createRadialGradient(bx, byy, 0, bx, byy, 6 * s); g.addColorStop(0, 'rgba(255,214,140,1)'); g.addColorStop(1, 'rgba(255,214,140,0)'); E.ctx.fillStyle = g; E.ctx.beginPath(); E.ctx.arc(bx, byy, 6 * s, 0, 7); E.ctx.fill(); }
  }, { em: true, steam: [x - 10.5 * s, y - 48 * s] });
}
function balloonSeller(res) {
  const x = 930, y = 640, s = unitScale(y);
  return bill('seller', [x - 12 * s, y - 96 * s, x + 12 * s, y + 4 * s], y, res, (P) => {
    const { ctx } = P;
    ctx.fillStyle = 'rgba(100,55,110,.22)'; ctx.beginPath(); ctx.ellipse(x, y, 9 * s, 2 * s, 0, 0, 7); ctx.fill();
    ctx.fillStyle = '#3E4A6A'; ctx.fillRect(x - 4 * s, y - 46 * s, 3.4 * s, 46 * s); ctx.fillRect(x + 0.6 * s, y - 46 * s, 3.4 * s, 46 * s);
    gouache(P, poly([[x - 6.5 * s, y - 80 * s], [x + 6.5 * s, y - 80 * s], [x + 7 * s, y - 44 * s], [x - 7 * s, y - 44 * s]]), '#F2B33D', { bb: [x - 7 * s, y - 80 * s, x + 7 * s, y - 44 * s], n: 25, r: 2 * s, seed: 12 });
    ctx.fillStyle = '#8A5A3E'; ctx.beginPath(); ctx.arc(x, y - 87 * s, 5.4 * s, 0, 7); ctx.fill();
    ctx.fillStyle = '#F4F1EA'; ctx.beginPath(); ctx.ellipse(x, y - 91 * s, 6.6 * s, 2.4 * s, 0, 0, 7); ctx.fill();
    ctx.strokeStyle = '#8A5A3E'; ctx.lineWidth = 2.6 * s; ctx.beginPath(); ctx.moveTo(x + 5 * s, y - 76 * s); ctx.lineTo(x + 8 * s, y - 70 * s); ctx.stroke();
  }, { hand: [x + 8.5 * s, y - 70 * s] });
}
function canopy(P, cx, cy, rx, ry, n, seed, big) {
  const { ctx } = P, R = rng(seed);
  for (let i = 0; i < n * 0.55; i++) { // leaves
    const a = R() * Math.PI * 2, d = Math.sqrt(R()), x = cx + Math.cos(a) * rx * d, y = cy + Math.sin(a) * ry * d * 0.8 + (R() - 0.4) * ry * 0.3, r = (big ? 16 : 7) + R() * (big ? 20 : 8);
    const g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.4, 1, x, y, r); g.addColorStop(0, R() > 0.5 ? '#78B87C' : '#5FA06C'); g.addColorStop(1, R() > 0.5 ? '#2F7550' : '#255F43');
    ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(x, y, r, r * 0.68, R() * 3, 0, 7); ctx.fill();
  }
  for (let i = 0; i < n; i++) { // bougainvillea bracts in papery clusters
    const a = R() * Math.PI * 2, d = Math.sqrt(R()), x = cx + Math.cos(a) * rx * d * 1.02, y = cy + Math.sin(a) * ry * d * 0.85 + (d > 0.85 && Math.sin(a) > 0 ? R() * ry * 0.35 : 0), r = (big ? 6 : 3) + R() * (big ? 11 : 5);
    const c = ['#E2447C', '#F0609A', '#C9306A', '#FF86B5', '#F7A1C4'][(R() * 5) | 0];
    const g = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, 0.5, x, y, r * 1.4); g.addColorStop(0, '#FFE3EE'); g.addColorStop(0.35, c); g.addColorStop(1, '#8E1F4E');
    ctx.fillStyle = g; ctx.beginPath(); for (let k = 0; k < 5; k++) { const aa = k * 1.26 + R(), px = x + Math.cos(aa) * r * 0.5, py = y + Math.sin(aa) * r * 0.45; ctx.moveTo(px + r * 0.55, py); ctx.arc(px, py, r * 0.55, 0, 7); } ctx.fill();
  }
  // sun catching the canopy rim (sun is on the left, low)
  ctx.save(); ctx.globalCompositeOperation = 'source-atop'; const sg = ctx.createLinearGradient(cx - rx, 0, cx + rx * 0.2, 0); sg.addColorStop(0, 'rgba(255,214,160,.35)'); sg.addColorStop(1, 'rgba(255,214,160,0)'); ctx.fillStyle = sg; ctx.fillRect(cx - rx * 1.2, cy - ry * 1.3, rx * 2.4, ry * 2.6); ctx.restore();
}
// ---------------------------------------------------------------- the big bougainvillea tree he hides behind
// Painted in character units around its trunk base (TREE in space.js) and baked sharp enough for the close shots of
// the man (≈ 5 px per character unit on high). A braided, fluted multi-stem trunk wide enough to hide a standing man,
// three big limbs, a deep canopy of papery magenta bracts in layered clumps with hanging cascades, a raised stone
// planting bed with roots and fallen petals. Night: fairy lights wound round the trunk and limbs glow warm on the bark
// and bracts, and the moon (upper left) rims the canopy – both in the emissive layer.
const smoothPath = (pts, closed = true) => {   // Catmull-Rom through the points
  const p = new Path2D(), n = pts.length, Q = i => pts[closed ? (i + n) % n : clamp(i, 0, n - 1)];
  p.moveTo(pts[0][0], pts[0][1]);
  for (let i = 0; i < (closed ? n : n - 1); i++) { const a = Q(i - 1), b = Q(i), c = Q(i + 1), d = Q(i + 2); p.bezierCurveTo(b[0] + (c[0] - a[0]) / 6, b[1] + (c[1] - a[1]) / 6, c[0] - (d[0] - b[0]) / 6, c[1] - (d[1] - b[1]) / 6, c[0], c[1]); }
  if (closed) p.closePath(); return p;
};
const TRUNK = [[-52, 3], [-39, 0], [-29.5, -6], [-24, -19], [-21.5, -38], [-20.5, -58], [-19.6, -78], [-19.8, -94],
  [-25, -108], [-44, -124], [-74, -139], [-108, -153], [-140, -167], [-160, -176], [-163, -185], [-140, -180], [-106, -166], [-72, -152], [-42, -138], [-22, -128],
  [-12, -138], [-15, -168], [-21, -204], [-26, -240], [-23, -262], [-15, -262], [-10, -238], [-5, -205], [0, -170],
  [9, -142], [36, -150], [72, -161], [112, -169], [152, -173], [194, -170], [214, -166], [216, -158], [194, -160], [152, -163], [112, -158], [74, -148], [40, -133], [22, -116],
  [18.5, -98], [18.6, -80], [19.6, -60], [21, -38], [24.5, -18], [32, -5], [43, 0], [58, 3]];
const TWIGS = [[[-74, -145], [-88, -180], [-96, -214], 6.5], [[-120, -162], [-138, -190], [-150, -210], 5], [[60, -156], [74, -196], [82, -230], 6.5], [[130, -168], [146, -200], [154, -226], 5],
  [[-18, -200], [-40, -236], [-52, -264], 5], [[-14, -236], [8, -264], [20, -292], 4.5], [[176, -170], [196, -196], [214, -214], 4.5], [[-40, -134], [-48, -170], [-62, -200], 4.5]];
const BCOL = ['#4A0D2A', '#8E1446', '#C8185A', '#E8417F', '#F57BA8', '#FFC2DA'].map(hx);
const bractCol = v => { const t = clamp(v, 0, 1) * (BCOL.length - 1), i = Math.min(BCOL.length - 2, Math.floor(t)); return mixC(BCOL[i], BCOL[i + 1], t - i); };
function bracts(ctx, R, x, y, r, lit, cool) {   // one cluster: three papery bracts and sometimes the tiny cream flower
  for (let k = 0; k < 3; k++) {
    const a = k * 2.09 + R() * 0.8, px = x + Math.cos(a) * r * 0.42, py = y + Math.sin(a) * r * 0.36, v = lit + (R() - 0.5) * 0.22 - (k === 2 ? 0.06 : 0);
    let c = bractCol(v); if (cool) c = mixC(c, [70, 50, 110], cool);
    ctx.fillStyle = rgbS(c); ctx.beginPath(); ctx.ellipse(px, py, r * (0.52 + R() * 0.16), r * (0.4 + R() * 0.12), a + 1.2, 0, 7); ctx.fill();
  }
  if (lit > 0.55 && R() > 0.72) { ctx.fillStyle = 'rgba(255,246,222,.9)'; ctx.beginPath(); ctx.arc(x, y, r * 0.13, 0, 7); ctx.fill(); }
}
function clump(ctx, R, cx, cy, rx, ry, layer) {
  const cool = [0.3, 0.1, 0][layer], lift = [-0.16, 0, 0.1][layer];
  // the shadowy leafy heart of the clump (kept inside, so the edge is all bracts)
  for (let i = 0; i < 14; i++) { const a = R() * 6.283, d = Math.sqrt(R()) * 0.55, x = cx + Math.cos(a) * rx * d, y = cy + Math.sin(a) * ry * d + ry * 0.1, r = Math.min(rx, ry) * (0.28 + R() * 0.22);
    ctx.fillStyle = rgbS(mixC([40, 54, 46], [82, 26, 56], R() * 0.7)); ctx.beginPath(); ctx.ellipse(x, y, r * 1.25, r, 0, 0, 7); ctx.fill(); }
  // leaves
  const nl = (rx * ry) / 34;
  for (let i = 0; i < nl; i++) { const a = R() * 6.283, d = Math.sqrt(R()) * 0.95, x = cx + Math.cos(a) * rx * d, y = cy + Math.sin(a) * ry * d, nx = (x - cx) / rx, ny = (y - cy) / ry, lt = clamp(0.5 - 0.35 * nx - 0.45 * ny + lift, 0, 1);
    ctx.fillStyle = rgbS(mixC(mixC([24, 58, 44], [96, 150, 96], lt), [60, 70, 110], cool)); ctx.beginPath(); ctx.ellipse(x, y, 2.6 + R() * 1.6, 1.3 + R() * 0.7, R() * 3, 0, 7); ctx.fill(); }
  // bract clusters, lit from the upper left, darker underneath
  const nb = (rx * ry) * 0.09 * (layer === 2 ? 1.15 : 1);
  for (let i = 0; i < nb; i++) { const a = R() * 6.283, d = Math.pow(R(), 0.42) * 1.04, x = cx + Math.cos(a) * rx * d, y = cy + Math.sin(a) * ry * d * (Math.sin(a) > 0 ? 1.08 : 1), nx = (x - cx) / rx, ny = (y - cy) / ry;
    const lt = 0.52 - 0.3 * nx - 0.45 * ny + lift + (R() - 0.5) * 0.25 - Math.max(0, d - 0.9) * 0.3;
    bracts(ctx, R, x, y, 2.2 + R() * 1.6, lt, cool); }
}
function cascade(ctx, R, x0, y0, dx, len, layer) {   // a hanging strand of bracts
  for (let i = 0; i < len; i++) { const t = i / len, x = x0 + dx * t + Math.sin(t * 5 + x0) * 2, y = y0 + i * 1.5 + len * 0.6 * t * t, r = (2.6 - t * 1.2) * (0.8 + R() * 0.4);
    if (R() < 0.3) { ctx.fillStyle = rgbS([30, 66, 48]); ctx.beginPath(); ctx.ellipse(x + (R() - 0.5) * 4, y, 2.2, 1.1, R() * 3, 0, 7); ctx.fill(); }
    bracts(ctx, R, x + (R() - 0.5) * 3, y, r, 0.58 - t * 0.25 + [-0.15, 0, 0.08][layer] - (dx > 0 ? 0.12 : 0), [0.3, 0.1, 0][layer]); }
}
function twig(ctx, [a, b, c, w], col) {   // a tapering branch reaching up into the canopy
  for (let i = 0; i < 10; i++) { const u0 = i / 10, u1 = (i + 1) / 10, q = u => [(1 - u) * (1 - u) * a[0] + 2 * (1 - u) * u * b[0] + u * u * c[0], (1 - u) * (1 - u) * a[1] + 2 * (1 - u) * u * b[1] + u * u * c[1]];
    const p0 = q(u0), p1 = q(u1); ctx.strokeStyle = col; ctx.lineWidth = w * (1 - u0 * 0.7); ctx.beginPath(); ctx.moveTo(p0[0], p0[1]); ctx.lineTo(p1[0], p1[1]); ctx.stroke(); }
}
function bigTree(res) {
  const tu = unitScale(TREE.gy), X0 = TREE.x, G = TREE.gy, U = [-182, -320, 266, 18];      // bounds in character units
  const rect = [X0 + U[0] * tu, G + U[1] * tu, X0 + U[2] * tu, G + U[3] * tu];
  const tres = Math.min(res * 2.6, 4000 / (rect[2] - rect[0]), 4000 / (rect[3] - rect[1]));
  const W = (lx, ly) => [X0 + lx * tu, G + ly * tu], lights = [];
  const L = bill('tree', rect, G, tres, (P, E) => {
    const { ctx } = P, ex = E.ctx, R = rng(41);
    ctx.translate(X0, G); ctx.scale(tu, tu); ex.translate(X0, G); ex.scale(tu, tu);
    // ---- the raised planting bed: back half of the stone kerb and the soil
    const bed = { x: 6, y: -4, rx: 82, ry: 10.5, h: 9 };
    ctx.fillStyle = 'rgba(60,30,60,.32)'; ctx.beginPath(); ctx.ellipse(bed.x + 8, bed.y + 8, bed.rx * 1.12, bed.ry * 1.25, 0, 0, 7); ctx.fill();   // contact shadow
    gouache(P, ell(bed.x, bed.y - bed.h, bed.rx, bed.ry), '#B7A49C', { bb: [bed.x - bed.rx, bed.y - bed.h - bed.ry, bed.x + bed.rx, bed.y - bed.h + bed.ry], n: 120, r: 3, light: '#E2D3C8', dark: '#857078', seed: 7 });
    gouache(P, ell(bed.x, bed.y - bed.h + 0.6, bed.rx - 4, bed.ry - 2.2), '#4A3438', { bb: [bed.x - bed.rx, bed.y - bed.h - bed.ry, bed.x + bed.rx, bed.y - bed.h + bed.ry], n: 160, r: 3, light: '#6E5048', dark: '#2E2028', seed: 8 });  // soil
    // ---- the back canopy (darker, cooler)
    for (const c of [[-60, -252, 84, 48], [42, -284, 98, 38], [150, -252, 82, 48], [-120, -214, 52, 40], [208, -212, 46, 38], [-22, -300, 60, 24], [96, -300, 50, 20]]) clump(ctx, R, ...c, 0);
    // ---- trunk, limbs and branches
    const bark = '#6E5050', barkD = '#4A3240';
    for (const tw of TWIGS) twig(ctx, tw, barkD);
    const tr = smoothPath(TRUNK);
    gouache(P, tr, bark, { bb: [-165, -265, 218, 4], n: 1300, r: 3.2, light: '#B08C7E', dark: '#3A2634', seed: 31, ang: Math.PI / 2, sx: 2.6, sy: 0.45, a: 0.3, vert: true });
    ctx.save(); ctx.clip(tr);
    // round the trunk: a lit band left of centre, a core shadow on the right, a little bounce light at the right edge
    const sh = ctx.createLinearGradient(-21, 0, 21, 0); sh.addColorStop(0, 'rgba(40,20,50,.18)'); sh.addColorStop(0.22, 'rgba(230,200,190,.16)'); sh.addColorStop(0.42, 'rgba(230,200,190,0)'); sh.addColorStop(0.72, 'rgba(36,16,44,.42)'); sh.addColorStop(0.92, 'rgba(36,16,44,.5)'); sh.addColorStop(1, 'rgba(120,90,140,.25)');
    ctx.fillStyle = sh; ctx.fillRect(-40, -170, 90, 180);
    // limbs (left and right of the column): moonlit tops, dark undersides
    const lg = ctx.createLinearGradient(0, -185, 0, -125); lg.addColorStop(0, 'rgba(220,200,220,.16)'); lg.addColorStop(0.55, 'rgba(40,20,50,0)'); lg.addColorStop(1, 'rgba(30,14,40,.42)');
    ctx.fillStyle = lg; ctx.fillRect(-175, -195, 152, 80); ctx.fillRect(20, -195, 210, 80);
    // three braided stems twisting round each other: deep grooves with a lit ridge on each stem's left
    for (let s = 0; s < 3; s++) {
      const fq = [0.82, 1.04, 0.93][s], am = [12.5, 14, 11][s], pts = [];
      for (let i = 0; i <= 14; i++) { const t = i / 14, y = 2 - t * 112; pts.push([Math.sin(t * 6.283 * fq + s * 2.094 + Math.sin(t * 9 + s) * 0.35) * am * (1 - t * 0.22) + Math.sin(t * 17 + s * 4) * 1.4 + (t > 0.8 ? (s - 1) * (t - 0.8) * 60 : 0), y]); }
      const p = smoothPath(pts, false);
      ctx.strokeStyle = 'rgba(30,12,30,.7)'; ctx.lineWidth = 3.2; ctx.stroke(p);
      ctx.save(); ctx.translate(-2.6, -0.4); ctx.strokeStyle = 'rgba(206,176,160,.42)'; ctx.lineWidth = 1.6; ctx.stroke(p); ctx.restore();
      ctx.save(); ctx.translate(2.4, 0.2); ctx.strokeStyle = 'rgba(30,12,30,.28)'; ctx.lineWidth = 2.4; ctx.stroke(p); ctx.restore();
    }
    for (let i = 0; i < 90; i++) { const y = -R() * 112, x = (R() - 0.5) * 36; ctx.strokeStyle = R() > 0.5 ? 'rgba(36,18,32,.32)' : 'rgba(206,176,160,.24)'; ctx.lineWidth = 0.6; ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(x + (R() - 0.5) * 3, y - 3, x + (R() - 0.5) * 2, y - 5 - R() * 6); ctx.stroke(); }
    for (const [kx, ky, kr] of [[-7, -70, 3.2], [9, -96, 2.6], [-11, -34, 2.2], [-70, -146, 2.4], [96, -160, 2.2]]) { ctx.fillStyle = 'rgba(36,16,30,.65)'; ctx.beginPath(); ctx.ellipse(kx, ky, kr, kr * 1.4, 0.2, 0, 7); ctx.fill(); ctx.strokeStyle = 'rgba(206,172,154,.45)'; ctx.lineWidth = 0.7; ctx.beginPath(); ctx.ellipse(kx - 0.5, ky - 0.4, kr * 1.5, kr * 1.9, 0.2, 0, 7); ctx.stroke(); }
    ctx.restore();
    // moonlit left edge of the trunk and the tops of the limbs
    ctx.strokeStyle = 'rgba(206,196,226,.6)'; ctx.lineWidth = 1.8; ctx.stroke(smoothPath([[-38, 0], [-25, -12], [-21.8, -36], [-20.8, -58], [-20, -80], [-21, -100], [-34, -116], [-60, -132], [-96, -147], [-134, -163], [-160, -178]], false));
    ctx.strokeStyle = 'rgba(206,196,226,.38)'; ctx.lineWidth = 1.4; ctx.stroke(smoothPath([[10, -144], [38, -153], [74, -164], [114, -172], [154, -176], [196, -173]], false)); ctx.stroke(smoothPath([[-14, -142], [-17, -170], [-23, -205], [-27, -238]], false));
    // roots running into the soil
    for (const [x0, x1, dy] of [[-30, -58, -1], [-16, -34, 3], [24, 52, 0], [34, 70, 4], [8, 18, 5]]) { ctx.strokeStyle = '#5E4348'; ctx.lineWidth = 4.2; ctx.beginPath(); ctx.moveTo(x0 * 0.6, -8 + dy * 0.2); ctx.quadraticCurveTo((x0 + x1) / 2, -4 + dy, x1, -6 + dy * 1.2); ctx.stroke(); ctx.strokeStyle = 'rgba(206,182,170,.35)'; ctx.lineWidth = 1.1; ctx.beginPath(); ctx.moveTo(x0 * 0.6, -9.5 + dy * 0.2); ctx.quadraticCurveTo((x0 + x1) / 2, -6 + dy, x1, -7.5 + dy * 1.2); ctx.stroke(); }
    // ---- mid and front canopy (with puffs along the top and the underside so the silhouette is never a flat line), then the cascades
    for (const c of [[-24, -242, 92, 50], [92, -246, 88, 50], [-104, -224, 62, 40], [180, -224, 58, 42], [30, -214, 70, 34], [140, -270, 64, 30], [-152, -198, 34, 24], [224, -194, 30, 22], [-60, -282, 50, 24]]) clump(ctx, R, ...c, 1);
    for (const x of [-96, -46, 6, 58, 112, 166]) clump(ctx, R, x + R() * 12, -304 - R() * 8, 20 + R() * 8, 12 + R() * 4, 1);
    for (const c of [[-66, -218, 56, 34], [56, -216, 62, 34], [132, -208, 58, 32], [-6, -268, 56, 32], [100, -278, 50, 26], [-126, -198, 36, 26], [198, -198, 38, 26], [160, -236, 40, 26], [-90, -250, 40, 24]]) clump(ctx, R, ...c, 2);
    for (const x of [-108, -52, 4, 66, 122, 176]) clump(ctx, R, x + R() * 10, -184 + R() * 6, 18 + R() * 8, 10 + R() * 3, 2);
    for (const [x0, y0, dx, n, l] of [[-156, -180, -8, 22, 1], [-134, -176, -4, 26, 2], [-108, -178, 2, 18, 1], [-80, -176, -2, 12, 2], [210, -176, 10, 24, 1], [228, -186, 6, 20, 2], [178, -172, 4, 16, 2], [150, -176, -2, 10, 1], [100, -174, 0, 9, 2], [36, -174, 0, 7, 2], [-30, -176, 0, 8, 1]])
      cascade(ctx, R, x0, y0, dx, n, l);
    // ---- the front of the kerb, small plants and fallen petals on the soil
    for (let i = 0; i < 26; i++) { const a = Math.PI * (0.06 + R() * 0.88), x = bed.x + Math.cos(a) * (bed.rx - 6) * (0.4 + R() * 0.6), y = bed.y - bed.h + Math.sin(a) * (bed.ry - 2.4) * (0.2 + R() * 0.8) - 0.4;
      if (Math.abs(x) < 26) continue; ctx.fillStyle = rgbS(mixC([40, 84, 58], [118, 168, 104], R())); for (let k = 0; k < 4; k++) { ctx.beginPath(); ctx.ellipse(x + (k - 1.5) * 1.6, y - 2 - R() * 2, 0.9, 3 + R() * 2, (k - 1.5) * 0.35, 0, 7); ctx.fill(); } }
    for (let i = 0; i < 60; i++) { const a = R() * 6.283, d = Math.sqrt(R()), x = bed.x + Math.cos(a) * (bed.rx - 5) * d, y = bed.y - bed.h + Math.sin(a) * (bed.ry - 2.5) * d; if (Math.abs(x) < 20 && y < bed.y - bed.h + 2) continue; ctx.fillStyle = rgbS(bractCol(0.3 + R() * 0.6)); ctx.beginPath(); ctx.ellipse(x, y, 1.4, 0.8, R() * 3, 0, 7); ctx.fill(); }
    const kerbF = new Path2D(); kerbF.ellipse(bed.x, bed.y - bed.h, bed.rx, bed.ry, 0, 0, Math.PI); kerbF.lineTo(bed.x - bed.rx, bed.y); kerbF.ellipse(bed.x, bed.y, bed.rx, bed.ry, 0, Math.PI, 0, true); kerbF.closePath();
    gouache(P, kerbF, '#C9B3A6', { bb: [bed.x - bed.rx, bed.y - bed.h, bed.x + bed.rx, bed.y + bed.ry], n: 260, r: 2.6, light: '#EEDFD2', dark: '#8E7782', seed: 9, lx: -1 });
    ctx.save(); ctx.clip(kerbF); ctx.strokeStyle = 'rgba(90,60,80,.4)'; ctx.lineWidth = 0.6;   // stone joints
    for (let a = 0.08; a < Math.PI; a += 0.19) { const x = bed.x + Math.cos(a) * bed.rx, y = bed.y + Math.sin(a) * bed.ry; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y - bed.h); ctx.stroke(); }
    ctx.beginPath(); ctx.ellipse(bed.x, bed.y - bed.h * 0.5, bed.rx, bed.ry, 0, 0, Math.PI); ctx.stroke();
    const kg = ctx.createLinearGradient(-bed.rx, 0, bed.rx, 0); kg.addColorStop(0, 'rgba(255,240,230,.1)'); kg.addColorStop(1, 'rgba(50,24,60,.32)'); ctx.fillStyle = kg; ctx.fillRect(-bed.rx - 2, -30, bed.rx * 2 + 30, 40);
    ctx.restore();
    ctx.strokeStyle = 'rgba(240,230,240,.55)'; ctx.lineWidth = 0.9; ctx.beginPath(); ctx.ellipse(bed.x, bed.y - bed.h, bed.rx, bed.ry, 0, Math.PI * 0.55, Math.PI * 1.05); ctx.stroke();
    for (let i = 0; i < 14; i++) { const x = bed.x + (R() - 0.5) * bed.rx * 1.8, y = bed.y - bed.h + bed.ry * Math.sqrt(Math.max(0, 1 - Math.pow((x - bed.x) / bed.rx, 2))) - 0.3; ctx.fillStyle = rgbS(bractCol(0.4 + R() * 0.5)); ctx.beginPath(); ctx.ellipse(x, y, 1.5, 0.8, R() * 3, 0, 7); ctx.fill(); }
    // ---- fairy lights wound loosely round the trunk and out along the limbs, a few dropping into the canopy
    const wire = [], wires = [];
    for (let i = 0; i <= 20; i++) { const t = i / 20, a = t * 6.283 * 1.15 + 0.9, y = -40 - t * 66 + Math.cos(a) * 4; if (Math.cos(a) > -0.25) wire.push([Math.sin(a) * (19.5 - t * 1.2), y]); else if (wire.length) { wires.push(wire.splice(0)); } } if (wire.length) wires.push(wire);
    const limbs = [[[-22, -118], [-46, -133], [-76, -146], [-110, -160], [-142, -172]], [[18, -122], [40, -139], [76, -152], [114, -161], [154, -165], [196, -162]], [[-10, -150], [-16, -185], [-22, -220]],
      [[-90, -158], [-98, -190]], [[140, -169], [150, -204]], [[64, -158], [76, -198]]];
    ctx.lineWidth = 0.5; ctx.strokeStyle = 'rgba(30,24,30,.7)';
    const bulbAt = (x, y, k) => { ctx.fillStyle = '#FFF1C8'; ctx.beginPath(); ctx.arc(x, y, 1.05, 0, 7); ctx.fill(); lights.push([...W(x, y), G, k]); };
    for (const w of wires) if (w.length > 1) { ctx.stroke(smoothPath(w, false)); w.forEach(([x, y], i) => { if (i % 2 === 1) bulbAt(x, y, i % 3); }); }
    for (const l of limbs) { const p = smoothPath(l, false); ctx.stroke(p); for (let i = 0; i < l.length - 1; i++) for (let u = 0; u < 1; u += 0.5) bulbAt(l[i][0] + (l[i + 1][0] - l[i][0]) * u, l[i][1] + (l[i + 1][1] - l[i][1]) * u + 1.2, (i + Math.round(u * 3)) % 3); }
    // ---- night light (emissive): warm on the bracts and bark round the bulbs, the bulbs themselves, the moon's rim
    ctx.setTransform(1, 0, 0, 1, 0, 0); ex.setTransform(1, 0, 0, 1, 0, 0);
    const pools = lights.filter((_, i) => i % 3 === 0).map(([x, y]) => [x, y, 15 * tu, 15 * tu, 0.5]);
    ex.drawImage(litPools(P, rect, tres, pools, '#FFB070'), 0, 0);
    ex.setTransform(tres, 0, 0, tres, -rect[0] * tres, -rect[1] * tres);
    for (const [x, y, , k] of lights) { const r = 3.4 * tu, g = ex.createRadialGradient(x, y, 0, x, y, r), c = [[255, 214, 150], [255, 190, 200], [255, 226, 170]][k];
      g.addColorStop(0, `rgba(${c[0]},${c[1]},${c[2]},.8)`); g.addColorStop(0.22, `rgba(${c[0]},${c[1]},${c[2]},.34)`); g.addColorStop(1, `rgba(${c[0]},${c[1]},${c[2]},0)`); ex.fillStyle = g; ex.fillRect(x - r, y - r, r * 2, r * 2); }
    rimLight(P, E, [-0.9 * tu * tres, -1.2 * tu * tres], [150, 166, 236], 0.5);
  }, { em: true, sway: 0.0045, swayY0: 0.5 });
  L.lights = lights;                                                  // [x, y, gy, colour] of every fairy-light bulb (world)
  L.light = W(-10, -100);                                             // where a warm point light for the man could sit
  return L;
}
// a cool moonlit rim along the upper-left edges of a painted billboard (into its emissive layer)
function rimLight(P, E, off, col, a) {
  const w = P.c.width, h = P.c.height, m = mk(w, h), mx = m.getContext('2d');
  mx.drawImage(P.c, 0, 0); mx.globalCompositeOperation = 'destination-out'; mx.drawImage(P.c, -off[0], -off[1]);
  mx.globalCompositeOperation = 'source-in'; const g = mx.createLinearGradient(0, 0, w * 0.8, h); g.addColorStop(0, `rgba(${col[0]},${col[1]},${col[2]},${a})`); g.addColorStop(0.55, `rgba(${col[0]},${col[1]},${col[2]},${a * 0.45})`); g.addColorStop(1, `rgba(${col[0]},${col[1]},${col[2]},0)`);
  mx.fillStyle = g; mx.fillRect(0, 0, w, h);
  const ex = E.ctx; ex.save(); ex.setTransform(1, 0, 0, 1, 0, 0); ex.filter = `blur(${Math.max(1, Math.abs(off[0]) * 0.6)}px)`; ex.drawImage(m, 0, 0); ex.filter = 'none'; ex.restore();
}
function planter(res) {
  const { x, y } = PLACE.planter, s = unitScale(y);
  return bill('planter', [x - 46 * s, y - 112 * s, x + 46 * s, y + 3 * s], y, res, (P) => {
    const { ctx } = P;
    gouache(P, poly([[x - 13 * s, y - 20 * s], [x + 13 * s, y - 20 * s], [x + 10 * s, y], [x - 10 * s, y]]), '#C0765E', { bb: [x - 13 * s, y - 20 * s, x + 13 * s, y], n: 30, r: 2 * s, seed: 14, light: '#E5A383' });
    ctx.fillStyle = '#5A3E46'; ctx.fillRect(x - 1.5 * s, y - 50 * s, 3 * s, 30 * s);
    canopy(P, x, y - 72 * s, 38 * s, 32 * s, 150, 15, false);
  }, { sway: 0.012, swayY0: 0.72 });
}
// the fireworks launcher, set up at a safe distance: a tall display mortar wrapped in red paper with gold spiral bands and
// stars (the one big shell is inside), a smaller royal-blue mortar behind it, and an 8-shot "cake" box (red with gold trim,
// a cream label with a burst on it, tube mouths on top), all bedded in a little sand mound with two bricks steadying the
// mortar. The long green fuse is drawn live by Fireworks (particles.js) from PLACE.fuse (his end) to `fuseIn` (the mortar's
// base). Baked at a resolution high enough for close-ups even when the launcher stands far down the promenade.
function crate(res) {
  const { x, y } = PLACE.launcher, s = unitScale(y), F = PLACE.fuse, sg = Math.sign(F ? F[0][0] - x : VP[0] - x) || 1, sv = Math.sign(VP[0] - x) || 1, R = res * Math.max(1, 10 / (s * res));
  const u = (cx, cy) => [x + cx * s * sg, y + cy * s];     // character units -> world (mirrored so the mortar faces the fuse side)
  const M = { cx: 6, r: 4.4, top: -28.5, bot: -1.5 }, m2 = { cx: -0.8, r: 3.2, top: -20.5, bot: -2 }, B = { x0: -21, x1: -3.2, top: -13.5, bot: -1.2, dx: 1.6, dy: -2.8 };
  const rect = [x - 26 * s, y - 34 * s, x + 26 * s, y + 7 * s];
  const shade = (c, k) => rgbS(k >= 0 ? mixC(hx(c), [255, 240, 220], k) : mixC(hx(c), [12, 6, 24], -k));
  const star5 = (ctx, cx, cy, r, rot) => { ctx.beginPath(); for (let i = 0; i < 10; i++) { const a = rot + i * Math.PI / 5 - Math.PI / 2, rr = i & 1 ? r * 0.45 : r; ctx.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr); } ctx.closePath(); ctx.fill(); };
  // a paper-wrapped cardboard tube (cylinder) with a curved gold band, spiral stripes and star prints; mouth on top
  const tube = (ctx, T, base, stripe, seed, em) => {
    const [cx, top] = u(T.cx, T.top), bot = u(0, T.bot)[1], r = T.r * s, e = r * 0.36;
    const body = new Path2D(); body.moveTo(cx - r, top); body.lineTo(cx - r, bot); body.ellipse(cx, bot, r, e, 0, Math.PI, 0, true); body.lineTo(cx + r, top); body.closePath();
    if (em === 'mask') { ctx.fill(body); ctx.beginPath(); ctx.ellipse(cx, top, r, e, 0, 0, 7); ctx.fill(); return; }
    if (!em) { const g = ctx.createLinearGradient(cx - r, 0, cx + r, 0); g.addColorStop(0, shade(base, -0.45)); g.addColorStop(0.3, shade(base, 0.22)); g.addColorStop(0.62, base); g.addColorStop(1, shade(base, -0.6)); ctx.fillStyle = g; ctx.fill(body); }
    ctx.save(); ctx.clip(body);
    const Rn = rng(seed); ctx.strokeStyle = stripe; ctx.lineWidth = r * 0.42; ctx.globalAlpha = em ? 0.55 : 0.9;
    for (let k = -3; k < 8; k++) { const y0 = top + k * r * 1.3; ctx.beginPath(); ctx.moveTo(cx - r * 1.1, y0 + r * 0.9); ctx.lineTo(cx + r * 1.1, y0 - r * 0.2); ctx.stroke(); }
    ctx.globalAlpha = 1; ctx.fillStyle = em ? 'rgba(255,214,120,.65)' : '#FFE08A';
    for (let k = 0; k < 9; k++) star5(ctx, cx + (Rn() - 0.5) * r * 1.5, top + r * 0.8 + Rn() * (bot - top - r * 1.2), r * (0.16 + Rn() * 0.1), Rn());
    // the gold foil band just under the rim, curved like the tube
    const b0 = top + r * 0.22, b1 = top + r * 0.62, band = new Path2D(); band.moveTo(cx - r, b0); band.lineTo(cx - r, b1); band.ellipse(cx, b1, r, e, 0, Math.PI, 0, true); band.lineTo(cx + r, b0); band.ellipse(cx, b0, r, e, 0, 0, Math.PI, false); band.closePath();
    const bg = ctx.createLinearGradient(cx - r, 0, cx + r, 0); bg.addColorStop(0, em ? 'rgba(255,200,110,.3)' : '#9C7424'); bg.addColorStop(0.3, em ? 'rgba(255,236,170,.9)' : '#FFE7A0'); bg.addColorStop(1, em ? 'rgba(255,190,90,.25)' : '#8A6420'); ctx.fillStyle = bg; ctx.fill(band);
    ctx.restore();
    if (!em) {   // rim and dark mouth
      ctx.fillStyle = '#E8D6B0'; ctx.beginPath(); ctx.ellipse(cx, top, r, e, 0, 0, 7); ctx.fill();
      ctx.fillStyle = '#140A0E'; ctx.beginPath(); ctx.ellipse(cx, top + e * 0.06, r * 0.76, e * 0.7, 0, 0, 7); ctx.fill();
      ctx.strokeStyle = 'rgba(120,40,40,.8)'; ctx.lineWidth = r * 0.07; ctx.beginPath(); ctx.ellipse(cx, top + e * 0.06, r * 0.66, e * 0.58, 0, Math.PI * 0.05, Math.PI * 0.95); ctx.stroke();
      ctx.strokeStyle = 'rgba(40,10,20,.55)'; ctx.lineWidth = r * 0.06; ctx.beginPath(); ctx.moveTo(cx - r, top); ctx.lineTo(cx - r, bot); ctx.moveTo(cx + r, top); ctx.lineTo(cx + r, bot); ctx.stroke();
    } else { ctx.fillStyle = 'rgba(255,236,190,.55)'; ctx.beginPath(); ctx.ellipse(cx, top, r, e, 0, 0, 7); ctx.fill(); ctx.fillStyle = 'rgba(0,0,0,1)'; ctx.globalCompositeOperation = 'destination-out'; ctx.beginPath(); ctx.ellipse(cx, top + e * 0.06, r * 0.76, e * 0.7, 0, 0, 7); ctx.fill(); ctx.globalCompositeOperation = 'source-over'; }
    return [cx, top + e * 0.06, y];
  };
  // the cake: front face, the side facing the camera axis, the top with 8 tube mouths
  const cake = (ctx, em) => {
    const [fx0, ft] = u(B.x0, B.top), [fx1, fb] = u(B.x1, B.bot), xa = Math.min(fx0, fx1), xb = Math.max(fx0, fx1), dx = B.dx * s * sv, dy = B.dy * s, sx = sv > 0 ? xb : xa;
    const front = poly([[xa, ft], [xb, ft], [xb, fb], [xa, fb]]), side = poly([[sx, ft], [sx + dx, ft + dy], [sx + dx, fb + dy], [sx, fb]]), topF = poly([[xa, ft], [xb, ft], [xb + dx, ft + dy], [xa + dx, ft + dy]]);
    if (em === 'mask') { ctx.fill(front); ctx.fill(side); ctx.fill(topF); return; }
    const mouths = [];
    if (!em) {
      gouache({ ctx, res: R }, front, '#B71E34', { bb: [xa, ft, xb, fb], n: 50, r: 1.2 * s, seed: 61, light: '#E04A5A', dark: '#6E1028', ang: 0, sx: 2.4, sy: 0.5 });
      ctx.fillStyle = '#7E1426'; ctx.fill(side); ctx.fillStyle = '#C9A877'; ctx.fill(topF);
      ctx.fillStyle = '#E3C27A'; for (const yy of [ft, fb - 1.4 * s]) ctx.fillRect(xa, yy, xb - xa, 1.4 * s);
      ctx.strokeStyle = 'rgba(40,8,20,.6)'; ctx.lineWidth = 0.25 * s; ctx.stroke(front); ctx.stroke(side);
      // the label: a cream panel with a little painted burst on it
      const lx = (xa + xb) / 2, ly = (ft + fb) / 2 + 0.2 * s, lw = (xb - xa) * 0.5, lh = (fb - ft) * 0.52;
      ctx.fillStyle = '#F6E9CC'; ctx.beginPath(); ctx.roundRect(lx - lw / 2, ly - lh / 2, lw, lh, 0.8 * s); ctx.fill();
      ctx.strokeStyle = '#D9A441'; ctx.lineWidth = 0.3 * s; ctx.stroke();
      const cols = ['#E2447C', '#3F7FE0', '#F2B33D', '#8A4FE0'];
      for (let k = 0; k < 16; k++) { const a = k / 16 * Math.PI * 2; ctx.strokeStyle = cols[k % 4]; ctx.lineWidth = 0.35 * s; ctx.beginPath(); ctx.moveTo(lx + Math.cos(a) * lh * 0.12, ly + Math.sin(a) * lh * 0.12); ctx.lineTo(lx + Math.cos(a) * lh * 0.4, ly + Math.sin(a) * lh * 0.4); ctx.stroke(); ctx.fillStyle = cols[(k + 1) % 4]; ctx.beginPath(); ctx.arc(lx + Math.cos(a) * lh * 0.44, ly + Math.sin(a) * lh * 0.44, 0.28 * s, 0, 7); ctx.fill(); }
    }
    ctx.fillStyle = em ? 'rgba(255,214,120,.6)' : '#FFD86A'; const Rn = rng(77);
    for (let k = 0; k < 10; k++) { const px = xa + (0.06 + Rn() * 0.88) * (xb - xa), py = ft + (0.18 + Rn() * 0.64) * (fb - ft); if (Math.abs(px - (xa + xb) / 2) < (xb - xa) * 0.28 && Math.abs(py - (ft + fb) / 2) < (fb - ft) * 0.3) continue; star5(ctx, px, py, (0.55 + Rn() * 0.35) * s, Rn()); }
    if (em) { ctx.fillStyle = 'rgba(255,220,140,.55)'; for (const yy of [ft, fb - 1.4 * s]) ctx.fillRect(xa, yy, xb - xa, 1.4 * s); }
    for (let j = 0; j < 2; j++) for (let i = 0; i < 4; i++) {   // the tube mouths on top (dark, with a pale cardboard rim)
      const px = xa + (i + 0.5) / 4 * (xb - xa) + dx * (j + 0.5) / 2, py = ft + dy * (j + 0.5) / 2, rx = (xb - xa) / 4 * 0.34, ry = Math.abs(dy) / 2 * 0.36;
      if (!em) { ctx.fillStyle = '#EADBB8'; ctx.beginPath(); ctx.ellipse(px, py, rx * 1.25, ry * 1.25, 0, 0, 7); ctx.fill(); ctx.fillStyle = '#160B0E'; ctx.beginPath(); ctx.ellipse(px, py, rx, ry, 0, 0, 7); ctx.fill(); }
      mouths.push([px, py, y]);
    }
    return mouths;
  };
  let top = null, top2 = null, mouths = null;
  const out = bill('crate', rect, y, R, (P, E) => {
    const { ctx } = P;
    // shadow and the sand mound
    ctx.fillStyle = 'rgba(30,14,40,.38)'; ctx.beginPath(); ctx.ellipse(x - 2 * s * sg, y + 1.2 * s, 24 * s, 3.4 * s, 0, 0, 7); ctx.fill();
    top2 = tube(ctx, m2, '#2C49B8', '#F2C14E', 5, false);
    mouths = cake(ctx, false);
    top = tube(ctx, M, '#C4243A', '#F2C14E', 9, false);
    const mound = new Path2D(), [m0x] = u(-24, 0), [m1x] = u(13, 0); mound.moveTo(m0x, y + 1.6 * s); mound.bezierCurveTo(m0x + (m1x - m0x) * 0.12, y - 2.4 * s, m0x + (m1x - m0x) * 0.4, y - 3.4 * s, (m0x + m1x) / 2, y - 3 * s); mound.bezierCurveTo(m0x + (m1x - m0x) * 0.7, y - 3.6 * s, m0x + (m1x - m0x) * 0.9, y - 2.2 * s, m1x, y + 1.6 * s); mound.closePath();
    gouache(P, mound, '#B99A6E', { bb: [Math.min(m0x, m1x), y - 4 * s, Math.max(m0x, m1x), y + 2 * s], n: 90, r: 0.9 * s, seed: 23, light: '#E6CFA0', dark: '#6E5A44', sx: 1.6, sy: 0.8 });
    // two bricks steadying the big mortar
    for (const [bx0, rot] of [[M.cx - M.r - 3.4, -0.18], [M.cx + M.r + 0.4, 0.2]]) { const [px, py] = u(bx0 + 1.5, -1.8); ctx.save(); ctx.translate(px, py); ctx.rotate(rot * sg); ctx.fillStyle = '#8E4E3E'; ctx.fillRect(-1.6 * s, -1.4 * s, 3.2 * s, 2.8 * s); ctx.fillStyle = 'rgba(255,200,170,.25)'; ctx.fillRect(-1.6 * s, -1.4 * s, 3.2 * s, 0.5 * s); ctx.strokeStyle = 'rgba(40,16,16,.5)'; ctx.lineWidth = 0.2 * s; ctx.strokeRect(-1.6 * s, -1.4 * s, 3.2 * s, 2.8 * s); ctx.restore(); }
    // a short green chain fuse from the mortar's base to the cake
    const [ax, ay] = u(M.cx - M.r * 0.8, -2.2), [bx, by] = u(B.x1 + 0.4, -3);
    ctx.strokeStyle = '#1E5A33'; ctx.lineWidth = 0.75 * s; ctx.beginPath(); ctx.moveTo(ax, ay); ctx.quadraticCurveTo((ax + bx) / 2, ay + 1.6 * s, bx, by); ctx.stroke();
    ctx.strokeStyle = 'rgba(120,200,140,.6)'; ctx.lineWidth = 0.25 * s; ctx.beginPath(); ctx.moveTo(ax, ay - 0.2 * s); ctx.quadraticCurveTo((ax + bx) / 2, ay + 1.4 * s, bx, by - 0.2 * s); ctx.stroke();
    // night: the paper keeps its colour (a faint warm copy) and the gold foil catches the light
    const ex = E.ctx, H = painter(rect, R), hc = H.ctx, cut = f => { hc.save(); hc.globalCompositeOperation = 'destination-out'; hc.fillStyle = '#000'; f(); hc.restore(); };
    tube(hc, m2, '#2C49B8', '#F2C14E', 5, true); cut(() => cake(hc, 'mask')); cake(hc, true); cut(() => tube(hc, M, 0, 0, 9, 'mask')); tube(hc, M, '#C4243A', '#F2C14E', 9, true); cut(() => hc.fill(mound));
    ex.save(); ex.setTransform(1, 0, 0, 1, 0, 0); ex.globalAlpha = 0.24; ex.drawImage(P.c, 0, 0); ex.globalAlpha = 1; ex.drawImage(H.c, 0, 0); ex.restore();
  }, { em: true });
  const inlet = u(M.cx + M.r + 0.2, -2.6);
  return Object.assign(out, { top, mouths: [...mouths, top2], fuseIn: [inlet[0], inlet[1], y], fusePts: F || null, fuse: F ? [F[0][0], F[0][1], F[0][1]] : [inlet[0] + 30 * s * sg, y + 2 * s, y + 2 * s], light: [top[0], top[1] - 3 * s] });
}
function wires(res) {
  return bill('wires', [0, 160, 1290, 470], 720, res, (P) => {
    const { ctx } = P;
    ctx.strokeStyle = 'rgba(70,50,70,.6)'; ctx.lineWidth = 1.3;
    for (const [a, b, sag] of WIRES) { const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2 + Math.abs(b[0] - a[0]) * sag; ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.quadraticCurveTo(mx, my, b[0], b[1]); ctx.stroke(); }
  });
}
export const WIRES = [[[1172, 262], [760, 330], 0.15], [[760, 330], [480, 300], 0.12], [[480, 300], [120, 352], 0.11]];
export function wireBulbs() {
  const out = [];
  for (const [a, b, sag] of WIRES) { const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2 + Math.abs(b[0] - a[0]) * sag;
    for (let i = 1; i < 13; i++) { const u = i / 13; out.push([(1 - u) * (1 - u) * a[0] + 2 * (1 - u) * u * mx + u * u * b[0], (1 - u) * (1 - u) * a[1] + 2 * (1 - u) * u * my + u * u * b[1] + 4, i % 3]); } }
  return out;
}
function foreground(res) {
  return bill('fg', [1500, 1000, 2200, 1500], 1420, res, (P) => {
    const { ctx } = P, R = rng(51);
    ctx.filter = 'blur(6px)';
    for (let i = 0; i < 22; i++) { const x = 1540 + R() * 620, y = 1040 + R() * 440, r = 40 + R() * 70; ctx.fillStyle = R() > 0.72 ? '#C9306A' : R() > 0.5 ? '#2A5E44' : '#1F4A36'; ctx.beginPath(); ctx.ellipse(x, y, r, r * 0.5, R() * 3, 0, 7); ctx.fill(); }
    ctx.filter = 'none';
  });
}

// ---------------------------------------------------------------- sprite atlas (petals, leaves, confetti, lantern, balloon, smoke, people, heart, glint)
export function makeAtlas() {
  const S = 1024, c = mk(S, 512), x = c.getContext('2d'), uv = {}, cell = (n, px, py, w, h) => { uv[n] = [px / S, py / 512, w / S, h / 512]; };
  x.fillStyle = '#fff'; x.fillRect(2, 2, 28, 28); cell('white', 8, 8, 16, 16);
  const petal = (px, py, col, k) => { x.save(); x.translate(px + 32, py + 32); const g = x.createRadialGradient(-6, -6, 1, 0, 0, 26); g.addColorStop(0, '#FFF0F6'); g.addColorStop(0.4, col); g.addColorStop(1, '#9E2456'); x.fillStyle = g; x.beginPath(); x.moveTo(0, -24); x.bezierCurveTo(20 * k, -18, 18, 14, 0, 24); x.bezierCurveTo(-18, 14, -20 * k, -18, 0, -24); x.fill(); x.restore(); };
  petal(64, 0, '#E2447C', 1); cell('petal0', 64, 0, 64, 64); petal(128, 0, '#FF86B5', 0.8); cell('petal1', 128, 0, 64, 64);
  petal(192, 0, '#F7A1C4', 1.1); cell('petal2', 192, 0, 64, 64); petal(256, 0, '#FFD27A', 0.9); cell('petal3', 256, 0, 64, 64);
  const leaf = (px, py, col) => { x.save(); x.translate(px + 32, py + 32); x.rotate(0.6); x.fillStyle = col; x.beginPath(); x.moveTo(0, -26); x.quadraticCurveTo(16, 0, 0, 26); x.quadraticCurveTo(-16, 0, 0, -26); x.fill(); x.strokeStyle = 'rgba(255,255,255,.35)'; x.lineWidth = 1.5; x.beginPath(); x.moveTo(0, -22); x.lineTo(0, 22); x.stroke(); x.restore(); };
  leaf(320, 0, '#5FA06C'); cell('leaf0', 320, 0, 64, 64); leaf(384, 0, '#8CC56B'); cell('leaf1', 384, 0, 64, 64);
  x.fillStyle = '#fff'; x.fillRect(458, 18, 20, 30); cell('confetti', 456, 16, 24, 34);
  // paper lantern
  { x.save(); x.translate(560, 70); const g = x.createRadialGradient(0, 0, 4, 0, 0, 52); g.addColorStop(0, '#FFF6D8'); g.addColorStop(0.5, '#FFC46B'); g.addColorStop(1, '#E2793A'); x.fillStyle = g; x.beginPath(); x.moveTo(-26, -40); x.quadraticCurveTo(-46, 0, -22, 44); x.lineTo(22, 44); x.quadraticCurveTo(46, 0, 26, -40); x.closePath(); x.fill(); x.strokeStyle = 'rgba(160,70,30,.4)'; x.lineWidth = 2; for (let i = -2; i <= 2; i++) { x.beginPath(); x.moveTo(i * 9, -40); x.quadraticCurveTo(i * 15, 0, i * 8, 44); x.stroke(); } x.fillStyle = '#7A3A2A'; x.fillRect(-20, -46, 40, 7); x.fillRect(-18, 43, 36, 6); x.restore(); cell('lantern', 512, 16, 96, 108); }
  // balloon (white, tinted per instance)
  { x.save(); x.translate(688, 64); const g = x.createRadialGradient(-12, -16, 3, 0, 0, 52); g.addColorStop(0, '#FFFFFF'); g.addColorStop(0.35, '#F1F1F1'); g.addColorStop(1, '#B8B8C4'); x.fillStyle = g; x.beginPath(); x.ellipse(0, 0, 36, 44, 0, 0, 7); x.fill(); x.fillStyle = '#C8C8D2'; x.beginPath(); x.moveTo(-5, 43); x.lineTo(5, 43); x.lineTo(0, 50); x.fill(); x.fillStyle = 'rgba(255,255,255,.9)'; x.beginPath(); x.ellipse(-14, -18, 7, 11, -0.5, 0, 7); x.fill(); x.restore(); cell('balloon', 640, 12, 96, 104); }
  // smoke puff
  { const g = x.createRadialGradient(832, 64, 2, 832, 64, 60); g.addColorStop(0, 'rgba(255,255,255,.9)'); g.addColorStop(0.5, 'rgba(255,255,255,.45)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(768, 0, 128, 128); cell('smoke', 768, 0, 128, 128); }
  // heart
  { x.save(); x.translate(944, 34); x.fillStyle = '#fff'; x.beginPath(); x.moveTo(0, 22); x.bezierCurveTo(-30, 2, -22, -24, 0, -10); x.bezierCurveTo(22, -24, 30, 2, 0, 22); x.fill(); x.restore(); cell('heart', 912, 4, 64, 64); }
  // glint (4-point star)
  { x.save(); x.translate(992, 96); const g = x.createRadialGradient(0, 0, 0, 0, 0, 30); g.addColorStop(0, '#fff'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.beginPath(); for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2; x.moveTo(0, 0); x.lineTo(Math.cos(a - 0.12) * 30, Math.sin(a - 0.12) * 30); x.lineTo(Math.cos(a + 0.12) * 30, Math.sin(a + 0.12) * 30); } x.fill(); x.restore(); cell('glint', 962, 66, 60, 60); }
  // background people: 6 looks x 2 walking frames (64 x 128 each) on the second row
  const looks = [['#E2447C', '#2B2F3A', 0], ['#3FA0D8', '#5A4E7A', 1], ['#F2B33D', '#3E8E5A', 0], ['#7CC47A', '#2B2F3A', 1], ['#9B7BD6', '#E9D5C9', 1], ['#F28B3C', '#2B2F3A', 0]];
  looks.forEach(([c1, c2, hair], i) => {
    for (let f = 0; f < 2; f++) {
      const px = (i * 2 + f) * 64, py = 160; x.save(); x.translate(px + 32, py + 124);
      x.strokeStyle = c2; x.lineWidth = 9; x.lineCap = 'round'; const sw = f ? 1 : -1;
      x.beginPath(); x.moveTo(-4, -50); x.lineTo(-4 + sw * 8, -4); x.moveTo(4, -50); x.lineTo(4 - sw * 8, -4); x.stroke();
      x.fillStyle = c1; x.beginPath(); x.moveTo(-12, -92); x.quadraticCurveTo(-17, -66, -15, hair ? -38 : -44); x.lineTo(15, hair ? -38 : -44); x.quadraticCurveTo(17, -66, 12, -92); x.closePath(); x.fill();
      x.fillStyle = 'rgba(255,236,200,.35)'; x.fillRect(-12, -92, 5, 48);
      x.strokeStyle = c1; x.lineWidth = 7; x.beginPath(); x.moveTo(-13, -88); x.lineTo(-15 + sw * 5, -62); x.moveTo(13, -88); x.lineTo(15 - sw * 5, -62); x.stroke();
      x.fillStyle = '#9C5E3E'; x.beginPath(); x.ellipse(0, -102, 9, 11, 0, 0, 7); x.fill();
      x.fillStyle = '#1B1418'; x.beginPath(); x.ellipse(0, -107, 10, 7.5, 0, Math.PI, 0); x.fill();
      if (hair) { x.beginPath(); x.ellipse(-7, -94, 4.5, 14, 0.15, 0, 7); x.fill(); }
      x.restore(); cell('walker' + i + '_' + f, px, py, 64, 128);
    }
  });
  return { canvas: c, uv };
}

// ---------------------------------------------------------------- bake everything
// a soft, pre-blurred half-resolution copy of a painted layer: depth of field blends towards it
export function blurCopy(c, px) {
  const b = mk(Math.max(1, c.width / 2), Math.max(1, c.height / 2)), x = b.getContext('2d');
  x.filter = `blur(${px}px)`; x.drawImage(c, 0, 0, b.width, b.height); return b;
}
// the fuse cord: a thin cord on the paving from his hand by the tree to the launcher (PLACE.fuse); a ground layer
function fuseCord(res) {
  const F = PLACE.fuse, xs = F.map(p => p[0]), ys = F.map(p => p[1]), rect = [Math.min(...xs) - 20, Math.min(...ys) - 12, Math.max(...xs) + 20, Math.max(...ys) + 12], P = painter(rect, res * 1.4), { ctx } = P;
  const path = smoothPath(F, false);
  ctx.strokeStyle = 'rgba(30,22,30,.6)'; ctx.lineWidth = 0.4 * unitScale(F[0][1]); ctx.stroke(path);
  ctx.strokeStyle = 'rgba(200,190,210,.12)'; ctx.lineWidth = 0.2 * unitScale(F[0][1]); ctx.save(); ctx.translate(0, -0.3); ctx.stroke(path); ctx.restore();
  for (const [x, y] of F.slice(1, -1)) { const s = unitScale(y); ctx.fillStyle = '#4A3A40'; ctx.fillRect(x - 0.3 * s, y - 2.2 * s, 0.6 * s, 2.4 * s); }   // little stakes holding it down
  return { name: 'fuse', ...P, em: null, kind: 'ground', grid: [24, 3], gyFn: (x, y) => Math.max(y, 482), fog: 0.5, path: F };
}

// ---------------------------------------------------------------- runtime touches for the painted world (call once per frame)
// thin smoke from the blown-out birthday candle (fades over the first ~20 s), and a slow twinkle on the garland and the
// tree's fairy lights. lists = film.js sprite lists, LY = layers by name, t = sim time, T = story time, k = emissive (night) strength.
let FX = null;
export function worldFx(LY, lists, atlas, t, T, k = 1) {
  if (!FX) FX = { g: garland().bulbs, tree: (LY.tree && LY.tree.lights) || [] };
  const ck = LY.cake;
  if (ck && T < 24) {
    const a0 = 1 - clamp((T - 6) / 16, 0, 1), s = ck.s, wx = ck.base[0] + 0.1 * CAKE_K * s, wy = ck.base[1] - 22.8 * CAKE_K * s;
    for (let i = 0; i < 7; i++) { const ph = (t * 0.22 + i / 7) % 1, curl = Math.sin(ph * 7 + i * 1.3 + t * 0.6) * (0.6 + ph * 3.2) * s;
      lists.mid.push(wx + curl, wy - ph * 26 * s, ck.gy, ph * 2 + i, (0.9 + ph * 3.2) * s, (1.6 + ph * 4.5) * s, 0, 0, 0.86, 0.84, 0.94, a0 * (1 - ph) * Math.min(1, ph * 6) * 0.62, atlas.uv.smoke); }
  }
  if (k < 0.05) return;
  FX.g.forEach(([x, y, gy, c], i) => { const s = unitScale(gy), tw = 0.55 + 0.45 * Math.sin(t * (1.3 + (i % 5) * 0.37) + i * 2.1), col = [[1, 0.88, 0.62], [1, 0.76, 0.84], [1, 0.84, 0.55]][c];
    lists.lights.push(x, y + 0.6 * s, gy, 0, 1.1 * s, 1.1 * s, 0, 0, 1, 0.97, 0.88, 0.45 * k * tw); lists.lights.push(x, y + 0.6 * s, gy, 0, 3.4 * s, 3.4 * s, 0, 0, col[0], col[1], col[2], 0.1 * k * tw); });
  FX.tree.forEach(([x, y, gy, c], i) => { const s = unitScale(gy), tw = 0.6 + 0.4 * Math.sin(t * (1.1 + (i % 7) * 0.29) + i * 1.7), col = [[1, 0.84, 0.58], [1, 0.74, 0.8], [1, 0.88, 0.66]][c];
    lists.lights.push(x, y, gy, 0, 1.5 * s, 1.5 * s, 0, 0, 1, 0.96, 0.86, 0.85 * k * tw); lists.lights.push(x, y, gy, 0, 4.5 * s, 4.5 * s, 0, 0, col[0], col[1], col[2], 0.16 * k * tw); });
}

export function bakeWorld(res) {
  const L = [farLayer(res * 0.75), groundLayer(res), wallLayer(res), lamp(60, res), lamp(560, res), jarLantern(res), cake(res), gifts(res), balloons(res), teaCart(res), wires(res), planter(res), crate(res), fuseCord(res), bigTree(res), foreground(res * 0.4)];
  for (const l of L) { l.blur = blurCopy(l.c, 7); if (l.em) l.emBlur = blurCopy(l.em, 7); }
  return L;
}

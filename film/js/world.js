// The painted world: every background is painted procedurally (gouache-style dabs on canvas), baked once into
// textures, then softened with a Kuwahara pass so it reads as hand-painted. Also builds the sprite atlas.
import { rng, clamp, lerp } from './core.js';
import { HZ, WALL, capY, baseY, unitScale, PLACE, VP } from './space.js';

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
  const rect = [-400, 470, 2000, 1150], P = painter(rect, res), { ctx } = P, R = rng(21);
  const [c0, c1] = WALL.cap, [b0, b1] = WALL.base;
  // floor
  const floor = poly([[b0[0] - 100, b0[1] + 60], [b0[0], b0[1]], [b1[0], b1[1]], [2000, 482], [2000, 1150], [-400, 1150]]);
  const fg = ctx.createLinearGradient(0, 482, 0, 1150); fg.addColorStop(0, '#F4D8C6'); fg.addColorStop(0.45, '#EBC4B4'); fg.addColorStop(1, '#D8A9A3');
  ctx.fillStyle = fg; ctx.fill(floor);
  ctx.save(); ctx.clip(floor);
  // sun-warmed area and painterly variation
  const lg = ctx.createRadialGradient(560, 640, 0, 560, 640, 900); lg.addColorStop(0, 'rgba(255,224,182,.45)'); lg.addColorStop(1, 'rgba(255,224,182,0)'); ctx.fillStyle = lg; ctx.fillRect(-400, 470, 2400, 700);
  for (let i = 0; i < 1300; i++) {
    const y = 482 + Math.pow(R(), 0.8) * 668, x = -400 + R() * 2400, s = (y - HZ) / 530;
    ctx.fillStyle = R() > 0.5 ? `rgba(255,236,214,${0.08 + R() * 0.1})` : `rgba(170,110,140,${0.05 + R() * 0.07})`;
    ctx.beginPath(); ctx.ellipse(x, y, (10 + R() * 26) * s, (1.6 + R() * 2.4) * s, (R() - 0.5) * 0.15, 0, 7); ctx.fill();
  }
  // tiles converging to the vanishing point
  ctx.strokeStyle = 'rgba(140,90,120,.10)'; ctx.lineWidth = 1.2;
  for (let x = -3000; x < 5000; x += 230) { ctx.beginPath(); ctx.moveTo(VP[0], VP[1]); ctx.lineTo(x, 1150); ctx.stroke(); }
  for (let k = 1; k < 16; k++) { const y = HZ + 680 / (1 + 12 / (k * k * 0.16 + 0.4)) * 0.97; ctx.lineWidth = 0.4 + (y - 480) / 320; ctx.beginPath(); ctx.moveTo(-400, y); ctx.lineTo(2000, y); ctx.stroke(); }
  // long evening shadows (sun low behind, over the sea): tree canopy and trunk fall towards us on the right
  ctx.fillStyle = 'rgba(105,60,125,.20)';
  { const T = PLACE.tree; ctx.beginPath(); ctx.moveTo(T.x - 30, T.y); ctx.bezierCurveTo(T.x + 60, T.y + 30, T.x + 220, T.y + 70, T.x + 420, T.y + 140); ctx.lineTo(T.x + 600, T.y + 150); ctx.bezierCurveTo(T.x + 420, T.y + 60, T.x + 200, T.y + 10, T.x + 40, T.y - 6); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.ellipse(T.x + 520, T.y + 150, 210, 60, 0.15, 0, 7); ctx.fill(); }
  ctx.beginPath(); ctx.ellipse(PLACE.planter.x + 90, PLACE.planter.y + 34, 110, 20, 0.25, 0, 7); ctx.fill();          // planter
  // fallen petals
  for (let i = 0; i < 70; i++) { const x = PLACE.tree.x - 200 + R() * 700, y = PLACE.tree.y - 20 + R() * 200; ctx.fillStyle = R() > 0.5 ? 'rgba(226,68,124,.8)' : 'rgba(255,134,181,.8)'; ctx.beginPath(); ctx.ellipse(x, y, 4, 2.2, R() * 3, 0, 7); ctx.fill(); }
  ctx.restore();
  // far end of the promenade: tiny trees, kiosks and lamps near the vanishing point
  for (let i = 0; i < 12; i++) {
    const d = i / 12, y = 486 + Math.pow(1 - d, 2) * 34, x = 800 + d * 360 + (1 - d) * 60, s = (y - HZ) / 530 * 6.8;
    if (i % 3 === 0) { ctx.fillStyle = '#5E8F72'; ctx.beginPath(); ctx.arc(x, y - 9 * s, 5 * s, 0, 7); ctx.fill(); ctx.fillStyle = '#6B4A4E'; ctx.fillRect(x - 0.4 * s, y - 6 * s, 0.8 * s, 6 * s); }
    else if (i % 3 === 1) { ctx.fillStyle = ['#E2447C', '#3FA0D8', '#F2B33D'][i % 3]; ctx.fillRect(x - 4 * s, y - 7 * s, 8 * s, 2 * s); ctx.fillStyle = '#EED9C9'; ctx.fillRect(x - 3.4 * s, y - 5 * s, 6.8 * s, 5 * s); }
  }
  grain(P, 0.05);
  return { name: 'ground', ...P, kind: 'ground', grid: [48, 34], gyFn: (x, y) => Math.max(y, 482), fog: 0.5 };
}
// the sea wall on its own layer: every point of it shares the depth of its base line, so it stays upright when the camera moves
function wallLayer(res) {
  const rect = [-400, 470, 760, 1080], P = painter(rect, res), { ctx } = P;
  const [c0, c1] = WALL.cap, [b0, b1] = WALL.base;
  // the sea wall face
  const face = poly([c0, c1, b1, b0]);
  gouache(P, face, '#DDB3AA', { bb: [-400, 478, 745, 1010], n: 700, r: 9, light: '#F3D2C2', dark: '#B48694', lx: 1, seed: 5, a: 0.18 });
  ctx.save(); ctx.clip(face);
  ctx.strokeStyle = 'rgba(110,60,90,.22)'; ctx.lineWidth = 1.5;
  for (let i = 0; i < 28; i++) { const u = Math.pow(i / 28, 1.6), x = -300 + u * 1040; ctx.beginPath(); ctx.moveTo(x, capY(x)); ctx.lineTo(x, baseY(x)); ctx.stroke(); }
  ctx.beginPath(); for (let x = -300; x <= 740; x += 10) { const y = (capY(x) * 0.55 + baseY(x) * 0.45); x === -300 ? ctx.moveTo(x, y) : ctx.lineTo(x, y); } ctx.stroke();
  const sh = ctx.createLinearGradient(0, 480, 0, 1010); sh.addColorStop(0, 'rgba(100,50,110,0)'); sh.addColorStop(1, 'rgba(100,50,110,.28)'); ctx.fillStyle = sh; ctx.fillRect(-400, 470, 1200, 560);
  ctx.restore();
  // cap of the wall, catching the sun
  const cap = poly([[c0[0], c0[1] - 28], [c1[0], c1[1] - 3], c1, c0]);
  gouache(P, cap, '#F6DCCB', { bb: [-300, 470, 740, 830], n: 160, r: 6, light: '#FFF0DE', seed: 6 });
  ctx.strokeStyle = 'rgba(255,244,226,.9)'; ctx.lineWidth = 2.2; ctx.beginPath(); ctx.moveTo(c0[0], c0[1] - 28); ctx.lineTo(c1[0], c1[1] - 3); ctx.stroke();
  // a few tiny people sitting on the far wall
  for (const x of [560, 610, 640, 700, 716]) { const y = capY(x) - 1.5, s = unitScale(baseY(x)); ctx.fillStyle = 'rgba(90,60,100,.75)'; ctx.beginPath(); ctx.ellipse(x, y - 8 * s, 2.6 * s, 6 * s, 0, 0, 7); ctx.fill(); ctx.beginPath(); ctx.arc(x, y - 16 * s, 2.4 * s, 0, 7); ctx.fill(); }
  grain(P, 0.05);
  return { name: 'wall', ...P, kind: 'ground', grid: [40, 4], gyFn: (x) => baseY(Math.min(x, 745)), fog: 0.5 };
}

// ---------------------------------------------------------------- billboards (single depth): lamps, tea cart, balloon seller, trees, wires, foreground
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
function teaCart(res) {
  const x = 1560, y = 700, s = unitScale(y) * 1.05;
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
function bigTree(res) {
  const { x, y: gy } = PLACE.tree, k = unitScale(gy) / unitScale(1004), y = 1004;
  const rect = [x - 366 * k, gy - 1164 * k, x + 514 * k, gy + 8 * k];
  return bill('tree', rect, gy, res, (P) => {
    const { ctx } = P;
    ctx.translate(x, gy); ctx.scale(k, k); ctx.translate(-x, -y);
    const tr = new Path2D(`M${x - 58} 1004 C${x - 44} 880 ${x - 30} 760 ${x - 34} 640 C${x - 38} 540 ${x - 52} 440 ${x - 78} 342 C${x - 108} 300 ${x - 150} 270 ${x - 192} 250 L${x - 180} 226 C${x - 130} 244 ${x - 70} 278 ${x - 22} 314 C${x + 12} 288 ${x + 72} 260 ${x + 154} 244 L${x + 162} 266 C${x + 94} 290 ${x + 46} 322 ${x + 26} 354 C${x + 38} 440 ${x + 48} 560 ${x + 52} 660 C${x + 56} 780 ${x + 66} 880 ${x + 80} 1004 Z`);
    gouache(P, tr, '#7A5254', { bb: [x - 200, 220, x + 170, 1004], n: 420, r: 7, light: '#B98272', dark: '#4A3040', seed: 31, ang: Math.PI / 2, sx: 2.2, sy: 0.5, a: 0.25 });
    ctx.strokeStyle = 'rgba(255,214,170,.55)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(x - 54, 998); ctx.bezierCurveTo(x - 40, 880, x - 26, 760, x - 30, 640); ctx.bezierCurveTo(x - 34, 540, x - 48, 440, x - 74, 344); ctx.stroke();
    ctx.strokeStyle = 'rgba(60,30,50,.35)'; ctx.lineWidth = 1.6; for (const [y0, y1, xx] of [[930, 780, x + 14], [700, 560, x], [520, 400, x - 16], [860, 720, x + 36]]) { ctx.beginPath(); ctx.moveTo(xx, y0); ctx.quadraticCurveTo(xx + 8, (y0 + y1) / 2, xx - 2, y1); ctx.stroke(); }
    ctx.strokeStyle = '#5A3E46'; ctx.lineWidth = 10; ctx.beginPath(); ctx.moveTo(x - 186, 238); ctx.quadraticCurveTo(x - 266, 200, x - 346, 190); ctx.stroke();
    ctx.lineWidth = 8; ctx.beginPath(); ctx.moveTo(x + 158, 255); ctx.quadraticCurveTo(x + 274, 220, x + 414, 200); ctx.stroke();
    canopy(P, x - 30, 90, 470, 230, 520, 41, true);
  }, { sway: 0.006, swayY0: 0.36 });
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
function crate(res) {
  const { x, y } = PLACE.launcher, s = unitScale(y);
  return bill('crate', [x - 16 * s, y - 64 * s, x + 16 * s, y + 3 * s], y, res, (P) => {
    const { ctx } = P;
    ctx.fillStyle = 'rgba(100,55,110,.25)'; ctx.beginPath(); ctx.ellipse(x + 4 * s, y, 15 * s, 3 * s, 0, 0, 7); ctx.fill();
    for (const [y0, h] of [[y - 24 * s, 24 * s], [y - 47 * s, 23 * s]]) {
      gouache(P, poly([[x - 11 * s, y0], [x + 11 * s, y0], [x + 11 * s, y0 + h], [x - 11 * s, y0 + h]]), '#A9744F', { bb: [x - 11 * s, y0, x + 11 * s, y0 + h], n: 40, r: 2 * s, seed: y0 | 0, light: '#D9A27A', ang: 0, sx: 2.5, sy: 0.4 });
      ctx.strokeStyle = 'rgba(80,40,30,.45)'; ctx.lineWidth = 0.6 * s; for (let k = 1; k < 4; k++) { ctx.beginPath(); ctx.moveTo(x - 11 * s, y0 + h * k / 4); ctx.lineTo(x + 11 * s, y0 + h * k / 4); ctx.stroke(); }
      ctx.strokeRect(x - 11 * s, y0, 22 * s, h);
    }
    for (let i = 0; i < 4; i++) { const tx = x - 8 * s + i * 5.3 * s; ctx.fillStyle = ['#E2447C', '#F2B33D', '#7C5CD6', '#3FA0D8'][i]; ctx.fillRect(tx, y - 61 * s, 3.8 * s, 14 * s); ctx.fillStyle = 'rgba(255,255,255,.35)'; ctx.fillRect(tx, y - 61 * s, 1 * s, 14 * s); ctx.fillStyle = '#2A1F2A'; ctx.fillRect(tx + 0.6 * s, y - 61.6 * s, 2.6 * s, 1 * s); }
    ctx.strokeStyle = '#D9C6A0'; ctx.lineWidth = 0.5 * s; ctx.beginPath(); ctx.moveTo(x - 6 * s, y - 49 * s); ctx.quadraticCurveTo(x - 12 * s, y - 52 * s, x - 11.5 * s, y - 56 * s); ctx.stroke();
  }, { top: [x, y - 62 * s, y], fuse: [x - 11.5 * s, y - 56 * s] });
}
function wires(res) {
  return bill('wires', [0, 180, 1240, 470], 720, res, (P) => {
    const { ctx } = P;
    ctx.strokeStyle = 'rgba(70,50,70,.6)'; ctx.lineWidth = 1.3;
    for (const [a, b, sag] of WIRES) { const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2 + Math.abs(b[0] - a[0]) * sag; ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.quadraticCurveTo(mx, my, b[0], b[1]); ctx.stroke(); }
  });
}
export const WIRES = [[[1060, 270], [760, 330], 0.16], [[760, 330], [480, 300], 0.12], [[480, 300], [120, 352], 0.11]];
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
export function bakeWorld(res) {
  const L = [farLayer(res * 0.75), groundLayer(res), wallLayer(res), lamp(60, res), lamp(560, res), balloonSeller(res), teaCart(res), wires(res), planter(res), crate(res), bigTree(res * 0.9), foreground(res * 0.4)];
  for (const l of L) { l.blur = blurCopy(l.c, 7); if (l.em) l.emBlur = blurCopy(l.em, 7); }
  return L;
}

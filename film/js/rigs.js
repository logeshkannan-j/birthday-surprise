// The characters. ONE reusable rig per character (skeleton + IK + Verlet hair/cloth), drawn with soft cel shading and
// thin warm outlines. Character space: feet (or seat, for Helen) at (0,0), up is -y, ~100 units = a standing adult.
import { clamp, lerp, rng, noise2 } from './core.js';
import { Chain, Hem, Spring } from './physics.js';

// ---------------------------------------------------------------- drawing helpers
const P2 = s => new Path2D(s);
function smooth(pts, closed) {
  const n = pts.length; let d = `M${pts[0][0].toFixed(2)} ${pts[0][1].toFixed(2)}`; const seg = closed ? n : n - 1;
  for (let i = 0; i < seg; i++) {
    const p1 = pts[i], p2 = pts[(i + 1) % n], p0 = closed ? pts[(i - 1 + n) % n] : pts[Math.max(0, i - 1)], p3 = closed ? pts[(i + 2) % n] : pts[Math.min(n - 1, i + 2)];
    d += `C${(p1[0] + (p2[0] - p0[0]) / 6).toFixed(2)} ${(p1[1] + (p2[1] - p0[1]) / 6).toFixed(2)} ${(p2[0] - (p3[0] - p1[0]) / 6).toFixed(2)} ${(p2[1] - (p3[1] - p1[1]) / 6).toFixed(2)} ${p2[0].toFixed(2)} ${p2[1].toFixed(2)}`;
  }
  return new Path2D(closed ? d + 'Z' : d);
}
function ribbon(pts, wd) {
  const L = [], R = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)]; let dx = b[0] - a[0], dy = b[1] - a[1]; const l = Math.hypot(dx, dy) || 1; dx /= l; dy /= l;
    const w = wd[i] / 2; L.push([pts[i][0] - dy * w, pts[i][1] + dx * w]); R.push([pts[i][0] + dy * w, pts[i][1] - dx * w]);
  }
  return { path: smooth(L.concat(R.reverse()), true), L, R: R.reverse() };
}
function capsule(a, b, w1, w2) {
  let dx = b[0] - a[0], dy = b[1] - a[1]; const l = Math.hypot(dx, dy) || 1; dx /= l; dy /= l; const nx = -dy, ny = dx, p = new Path2D();
  p.moveTo(a[0] + nx * w1 / 2, a[1] + ny * w1 / 2); p.lineTo(b[0] + nx * w2 / 2, b[1] + ny * w2 / 2);
  p.arc(b[0], b[1], w2 / 2, Math.atan2(ny, nx), Math.atan2(ny, nx) + Math.PI, true); p.lineTo(a[0] - nx * w1 / 2, a[1] - ny * w1 / 2);
  p.arc(a[0], a[1], w1 / 2, Math.atan2(-ny, -nx), Math.atan2(-ny, -nx) + Math.PI, true); p.closePath(); return p;
}
const ell = (x, y, rx, ry, r = 0) => { const p = new Path2D(); p.ellipse(x, y, rx, ry, r, 0, 7); return p; };
const hx = c => { const n = parseInt(c.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255]; };
const mixc = (a, b, t) => { const A = hx(a), B = hx(b); return `rgb(${Math.round(A[0] + (B[0] - A[0]) * t)},${Math.round(A[1] + (B[1] - A[1]) * t)},${Math.round(A[2] + (B[2] - A[2]) * t)})`; };
const rgba = (c, a) => { const v = hx(c); return `rgba(${v[0]},${v[1]},${v[2]},${a})`; };
// soft cel shading: lit side warm, shade side cool, thin warm outline. Light comes from the upper left (the low sun).
function cel(ctx, path, base, x0, x1, o = {}) {
  const g = ctx.createLinearGradient(x0, o.y0 || 0, x1, o.y1 || 0);
  g.addColorStop(0, mixc(mixc(base, '#FFE8CF', 0.2), base, 0.15)); g.addColorStop(o.mid || 0.55, base); g.addColorStop(1, mixc(base, o.shade || '#6E4E8C', 0.24));
  ctx.fillStyle = g; ctx.fill(path);
  if (o.line !== false) { ctx.lineWidth = o.lw || 0.2; ctx.strokeStyle = o.lc || rgba(mixc(base, '#5A2632', 0.7), 0.8); ctx.stroke(path); }
}
const fill = (ctx, p, c) => { ctx.fillStyle = c; ctx.fill(p); };
const line = (ctx, p, c, w) => { ctx.lineWidth = w; ctx.strokeStyle = c; ctx.stroke(p); };
function ik(a, tg, l1, l2, bend) {
  const dx = tg[0] - a[0], dy = tg[1] - a[1], d = Math.min(Math.hypot(dx, dy), l1 + l2 - 1e-3), ang = Math.atan2(dy, dx);
  const off = Math.acos(clamp((l1 * l1 + d * d - l2 * l2) / (2 * l1 * d), -1, 1)) * bend;
  return [a, [a[0] + Math.cos(ang + off) * l1, a[1] + Math.sin(ang + off) * l1], [a[0] + Math.cos(ang) * d, a[1] + Math.sin(ang) * d]];
}
function hand(ctx, b, c, skin, s, out) {
  const ang = Math.atan2(c[1] - b[1], c[0] - b[0]);
  ctx.save(); ctx.translate(c[0], c[1]); ctx.rotate(ang); ctx.scale(s, s);
  cel(ctx, P2('M-0.5 -0.8 C0.6 -1.0 1.7 -0.9 2.6 -0.55 C3.3 -0.25 3.35 0.4 2.65 0.6 C1.8 0.85 0.6 0.95 -0.4 0.75 C-0.8 0.3 -0.8 -0.45 -0.5 -0.8 Z'), skin, -0.6, 3.3, { lw: 0.1, lc: out });
  cel(ctx, ell(0.9, -0.88, 0.78, 0.34, -0.5), skin, 0, 1.6, { lw: 0.08, lc: out });
  ctx.restore();
}

// a shaped limb through a -> b -> c (shoulder/hip, elbow/knee, wrist/ankle). prof: widths at [a, mid-upper, b, mid-lower, c].
// One smooth outline (no stick joints), shaded across its width: lit side warm, shade side cool.
function limbPath(a, b, c, prof) {
  const L = [], R = [], seg = (p, q, t0, t1, w0, wm, w1, n) => {
    const dx = q[0] - p[0], dy = q[1] - p[1], l = Math.hypot(dx, dy) || 1, nx = -dy / l, ny = dx / l;
    for (let i = 0; i <= n; i++) { const u = i / n; if (t0 > 0 && i === 0) continue;
      const w = (u < 0.5 ? lerp(w0, wm, u * 2) : lerp(wm, w1, (u - 0.5) * 2)) / 2, x = p[0] + dx * u, y = p[1] + dy * u;
      L.push([x + nx * w, y + ny * w]); R.push([x - nx * w, y - ny * w]); }
    return [dx / l, dy / l];
  };
  const d0 = seg(a, b, 0, 0.5, prof[0], prof[1], prof[2], 4), d1 = seg(b, c, 0.5, 1, prof[2], prof[3], prof[4], 4);
  const cap = (p, d, w, k) => { const out = []; for (let i = 1; i < 4; i++) { const an = Math.atan2(d[1], d[0]) + (k ? -Math.PI / 2 + i * Math.PI / 4 : Math.PI / 2 + i * Math.PI / 4); out.push([p[0] + Math.cos(an) * w / 2, p[1] + Math.sin(an) * w / 2]); } return out; };
  return smooth(L.concat(cap(c, d1, prof[4], true), R.reverse(), cap(a, d0, prof[0], false)), true);
}
function limb(ctx, a, b, c, prof, base, out, o = {}) {
  const p = limbPath(a, b, c, prof), m = [(a[0] + 2 * b[0] + c[0]) / 4, (a[1] + 2 * b[1] + c[1]) / 4];
  const dx = c[0] - a[0], dy = c[1] - a[1], l = Math.hypot(dx, dy) || 1, nx = -dy / l, ny = dx / l, w = Math.max(...prof) * 0.7, sgn = nx < 0 ? 1 : -1;   // light from the upper left
  const g = ctx.createLinearGradient(m[0] + nx * w * sgn, m[1] + ny * w * sgn, m[0] - nx * w * sgn, m[1] - ny * w * sgn);
  g.addColorStop(0, mixc(base, o.light || '#FFE8CF', 0.22)); g.addColorStop(0.5, base); g.addColorStop(1, mixc(base, o.shade || '#6E4E8C', 0.3));
  ctx.fillStyle = g; ctx.fill(p);
  if (out !== false) { ctx.lineWidth = o.lw || 0.2; ctx.strokeStyle = out || rgba(mixc(base, '#5A2632', 0.7), 0.8); ctx.stroke(p); }
  return p;
}
// a hand: palm, thumb and four fingers (soft, slightly curled). dir = forearm direction; s = size; side flips the thumb.
function hand2(ctx, wrist, dir, skin, s, out, side = 1, curl = 0.3) {
  const ang = Math.atan2(dir[1], dir[0]);
  ctx.save(); ctx.translate(wrist[0], wrist[1]); ctx.rotate(ang); ctx.scale(s, s * side);
  const palm = P2('M-0.3 -0.85 C0.6 -1.05 1.6 -1.0 2.2 -0.75 C2.5 -0.3 2.5 0.45 2.15 0.85 C1.4 1.05 0.4 1.0 -0.3 0.8 C-0.6 0.3 -0.6 -0.4 -0.3 -0.85 Z');
  const fing = [[-0.62, 1.25], [-0.2, 1.42], [0.22, 1.36], [0.6, 1.1]];
  for (const [fy, fl] of fing) { const f = new Path2D(); f.moveTo(2.0, fy); f.quadraticCurveTo(2.0 + fl * 0.7, fy + curl * 0.35, 2.0 + fl * (1 - curl * 0.25), fy + curl * 0.75); ctx.lineCap = 'round'; ctx.lineWidth = 0.52; ctx.strokeStyle = out; ctx.stroke(f); ctx.lineWidth = 0.38; ctx.strokeStyle = skin; ctx.stroke(f); }
  cel(ctx, palm, skin, -0.4, 2.5, { lw: 0.08, lc: out });
  const th = new Path2D(); th.moveTo(0.5, -0.75); th.quadraticCurveTo(1.2, -1.55, 1.95, -1.45);
  ctx.lineWidth = 0.62; ctx.strokeStyle = out; ctx.stroke(th); ctx.lineWidth = 0.46; ctx.strokeStyle = skin; ctx.stroke(th);
  ctx.restore();
}

// big expressive anime eye
function animeEye(ctx, cx, cy, w, h, st, P, gx, gy, lights) {
  const lash = P.lash;
  if (st === 'closed' || st === 'happy') {
    const p = new Path2D(), up = st === 'happy' ? -1 : 1;
    p.moveTo(cx - w / 2, cy + h * 0.05); p.quadraticCurveTo(cx, cy + up * h * 0.42, cx + w / 2, cy - h * 0.02);
    line(ctx, p, lash, w * 0.12);
    for (let i = 0; i < 2; i++) { const q = new Path2D(), x = cx + w * (0.3 + i * 0.16), y = cy + up * h * (0.14 - i * 0.05); q.moveTo(x, y); q.lineTo(x + w * 0.14, y - h * 0.12); line(ctx, q, lash, w * 0.05); }
    return;
  }
  const o = st === 'wide' ? 1.15 : st === 'soft' ? 0.82 : 1;
  const top = cy - h * 0.55 * o, bot = cy + h * 0.45;
  const shape = new Path2D();
  shape.moveTo(cx - w * 0.5, cy + h * 0.02);
  shape.bezierCurveTo(cx - w * 0.42, top, cx + w * 0.3, top - h * 0.04, cx + w * 0.5, cy - h * 0.22 * o);
  shape.bezierCurveTo(cx + w * 0.48, cy + h * 0.25, cx + w * 0.2, bot, cx - w * 0.05, bot);
  shape.bezierCurveTo(cx - w * 0.32, bot, cx - w * 0.48, cy + h * 0.25, cx - w * 0.5, cy + h * 0.02);
  ctx.fillStyle = '#FFF8F4'; ctx.fill(shape);
  ctx.save(); ctx.clip(shape);
  const ix = cx + gx * w * 0.16, iy = cy + h * 0.02 + gy * h * 0.18, rx = w * 0.36, ry = h * 0.42;
  const ig = ctx.createLinearGradient(ix, iy - ry, ix, iy + ry); ig.addColorStop(0, mixc(P.iris, '#000000', 0.55)); ig.addColorStop(0.55, P.iris); ig.addColorStop(1, mixc(P.iris, P.irisL || '#E8A060', 0.7));
  ctx.fillStyle = ig; ctx.beginPath(); ctx.ellipse(ix, iy, rx, ry, 0, 0, 7); ctx.fill();
  ctx.fillStyle = rgba(P.iris, 1); ctx.beginPath(); ctx.ellipse(ix, iy + ry * 0.05, rx * 0.5, ry * 0.52, 0, 0, 7); ctx.fillStyle = 'rgba(20,8,10,.85)'; ctx.fill();
  if (lights) for (const L of lights) { ctx.fillStyle = `rgba(${L[2]},${L[3]},${L[4]},${L[5] ?? 0.9})`; ctx.beginPath(); ctx.ellipse(ix + L[0] * rx, iy + L[1] * ry, rx * (L[6] || 0.16), ry * (L[6] || 0.16), 0, 0, 7); ctx.fill(); }
  ctx.fillStyle = 'rgba(255,255,255,.96)'; ctx.beginPath(); ctx.ellipse(ix + rx * 0.32, iy - ry * 0.42, rx * 0.3, ry * 0.24, -0.3, 0, 7); ctx.fill();
  ctx.beginPath(); ctx.ellipse(ix - rx * 0.4, iy + ry * 0.38, rx * 0.14, ry * 0.11, 0, 0, 7); ctx.fill();
  if (st === 'teary') { ctx.fillStyle = 'rgba(255,255,255,.55)'; ctx.beginPath(); ctx.ellipse(ix, iy + ry * 0.6, rx * 0.8, ry * 0.18, 0, 0, 7); ctx.fill(); }
  ctx.fillStyle = 'rgba(90,40,60,.22)'; ctx.fillRect(cx - w, top - h * 0.2, w * 2, h * 0.38);
  ctx.restore();
  const lid = new Path2D();
  lid.moveTo(cx - w * 0.56, cy + h * 0.06); lid.bezierCurveTo(cx - w * 0.44, top - h * 0.02, cx + w * 0.3, top - h * 0.07, cx + w * 0.52, cy - h * 0.24 * o);
  lid.quadraticCurveTo(cx + w * 0.64, cy - h * 0.3 * o, cx + w * 0.7, cy - h * 0.45 * o);
  line(ctx, lid, lash, w * 0.13);
  const low = new Path2D(); low.moveTo(cx - w * 0.3, bot - h * 0.04); low.quadraticCurveTo(cx + w * 0.1, bot + h * 0.03, cx + w * 0.42, cy + h * 0.24);
  line(ctx, low, rgba(lash, 0.35), w * 0.05);
}

// =====================================================================================  HELEN (seated on the sea wall)
const HC = { skin: '#CF8E68', skinD: '#A9664A', hair: '#1A1220', hairHi: '#4E3F6A', sheen: '#A595D0', dress: '#9CCBF2', dressD: '#6FA0D8', dressL: '#D2E9FC',
  collar: '#FFFDF8', sash: '#FF9EC4', sashD: '#E46B9E', shoe: '#FFF8F4', lip: '#B5505A', blush: '#F27E90', iris: '#5A2E1C', irisL: '#E2A060', lash: '#1E1015', out: 'rgba(110,50,60,.75)' };
export class Helen {
  constructor() {
    this.hair = []; for (let i = 0; i < 9; i++) this.hair.push(new Chain(9, 3.5 + (i % 3) * 0.25, { drag: 1.5, grav: 300, bend: 0.8, iter: 4, lift: 0.03 }));
    this.locks = [new Chain(6, 2.9, { drag: 2.4, grav: 240, bend: 0.8 }), new Chain(6, 3.0, { drag: 2.4, grav: 240, bend: 0.8 })];
    this.bowT = [new Chain(4, 1.7, { drag: 2.8, grav: 180, bend: 0.5 }), new Chain(4, 1.9, { drag: 2.8, grav: 180, bend: 0.5 })];
    this.sashT = [new Chain(6, 2.1, { drag: 2.6, grav: 200, bend: 0.5 }), new Chain(6, 2.4, { drag: 2.6, grav: 200, bend: 0.5 })];
    this.hem = new Hem(9, { drag: 3.2, grav: 200, stiff: 0.3 });
    this.blinkT = 2; this.blink = 0; this.look = new Spring(30, 9); this.laugh = new Spring(16, 7);
    this.bounds = [-34, -56, 40, 32];
  }
  // st: { t, dt, wind (local units/s), expr: calm|joyful|surprised|teary, lookUp 0..1, pet: [lx,ly]|null, eyeLights }
  update(st) {
    const dt = st.dt, t = st.t;
    this.blinkT -= dt; if (this.blinkT < 0) { this.blink = 0.14; this.blinkT = 2.2 + Math.random() * 3.4; } this.blink = Math.max(0, this.blink - dt);
    const lu = this.look.step(dt, st.lookUp || 0), la = this.laugh.step(dt, st.expr === 'joyful' ? 1 : 0);
    const head = this.headXf(t, lu, la), w = st.wind;
    // hair roots around the back of the head (in head space) -> body space
    const roots = [];
    for (let i = 0; i < 9; i++) { const a = -2.55 + i * 0.2; roots.push(head.p(0.4 + Math.cos(a) * 5.4, -38.6 + Math.sin(a) * 5.6)); }
    const col = (c, i) => { const x = c.x[i], y = c.y[i]; if (y > -27 && y < 0 && x > -6.2 && x < 6.6) { c.x[i] = x < 0.2 ? Math.min(x, -6.2) : Math.max(x, 6.6); } if (y > 2) c.y[i] = 2; };
    this.hair.forEach((c, i) => c.step(dt, roots[i][0], roots[i][1], w * 0.45, t + i * 0.3, col));   // long hair: heavy, sways rather than flies
    const l0 = head.p(-5.3, -39.8), l1 = head.p(6.1, -39.6);
    this.locks[0].step(dt, l0[0], l0[1], w * 0.6, t); this.locks[1].step(dt, l1[0], l1[1], w * 0.6, t + 1);
    const bw = head.p(-5.4, -43.6); this.bowT[0].step(dt, bw[0], bw[1], w, t + 2); this.bowT[1].step(dt, bw[0] + 0.3, bw[1] + 0.2, w, t + 2.5);
    this.sashT[0].step(dt, 6.6, -11.4, w * 0.8, t + 3); this.sashT[1].step(dt, 6.9, -11.2, w * 0.8, t + 3.4);
    const anch = [], rest = [];
    for (let i = 0; i < 9; i++) { const u = i / 8, a = [lerp(-15.0, -1.4, u), lerp(4.6, 7.4, u) + Math.sin(u * Math.PI) * 0.8]; anch.push(a); rest.push([a[0] - 0.5, a[1] + 4.4 + Math.sin(u * Math.PI) * 0.9]); }
    this.hem.step(dt, anch, rest, w * 0.5, t);
    this.headX = head; this.lu = lu; this.la = la;
  }
  headXf(t, lu, la) {
    const piv = [0.6, -29.6], bob = -Math.abs(Math.sin(t * 9)) * 0.55 * la + Math.sin(t * 1.6) * 0.15;
    const ang = -0.17 * lu + 0.05 * la * Math.sin(t * 9) + Math.sin(t * 0.8) * 0.015 - 0.04 * la;
    const c = Math.cos(ang), s = Math.sin(ang);
    return { ang, bob, p: (x, y) => { const dx = x - piv[0], dy = y - piv[1]; return [piv[0] + dx * c - dy * s, piv[1] + bob + dx * s + dy * c]; }, apply(ctx) { ctx.translate(piv[0], piv[1] + bob); ctx.rotate(ang); ctx.translate(-piv[0], -piv[1]); } };
  }
  draw(ctx, st) {
    const C = HC, t = st.t, la = this.la || 0, lu = this.lu || 0, breathe = Math.sin(t * 1.6) * 0.22 - Math.abs(Math.sin(t * 9)) * 0.4 * la;
    // ---- back hair (behind everything): thick tapered ribbons per strand + the back of the skull
    const head = this.headX;
    ctx.save(); head.apply(ctx); fill(ctx, ell(0.5, -38.6, 7.0, 7.3), C.hair); ctx.restore();
    const strands = this.hair.map(c => { const pts = []; for (let i = 0; i < c.n; i++) pts.push([c.x[i], c.y[i]]); return pts; });
    for (let k = 0; k < strands.length; k++) {
      const pts = strands[k], wd = pts.map((_, i) => 4.0 * (1 - i / pts.length * 0.7)); const r = ribbon(pts, wd);
      cel(ctx, r.path, C.hair, -10, 14, { line: false, shade: '#000000' });
    }
    for (let k = 0; k < strands.length; k += 2) line(ctx, smooth(strands[k], false), rgba(C.hairHi, 0.5), 0.3);
    // hair bow tails (behind head)
    for (const c of this.bowT) { const pts = []; for (let i = 0; i < c.n; i++) pts.push([c.x[i], c.y[i]]); cel(ctx, ribbon(pts, pts.map((_, i) => 1.1 - i * 0.12)).path, C.sash, -8, 0, { lw: 0.1 }); }
    // sash tails
    for (const c of this.sashT) { const pts = []; for (let i = 0; i < c.n; i++) pts.push([c.x[i], c.y[i]]); cel(ctx, ribbon(pts, pts.map((_, i) => 1.5 + i * 0.08)).path, C.sash, 4, 14, { lw: 0.12 }); }
    // ---- legs: knees to the side over the edge of the wall, calves hanging down its face, idly swinging
    for (const [kx, ky, ph, len] of [[-11.8, 4.2, 0, 15.6], [-3.6, 6.4, 1.7, 15.2]]) {
      const ax = kx + 0.5 + Math.sin(t * 1.25 + ph) * 0.9, ay = ky + len - Math.abs(Math.sin(t * 1.25 + ph)) * 0.6;
      limb(ctx, [kx, ky - 1.2], [lerp(kx, ax, 0.38), lerp(ky, ay, 0.38)], [ax, ay - 0.4], [2.9, 2.85, 2.5, 1.8, 1.35], C.skin, C.out, { lw: 0.16 });
      const sh = P2(`M${ax - 1.6} ${ay - 0.6} C${ax - 1.9} ${ay + 1.4} ${ax + 0.6} ${ay + 2.2} ${ax + 2.3} ${ay + 1.4} C${ax + 2.6} ${ay + 0.2} ${ax + 1.4} ${ay - 1} ${ax - 1.6} ${ay - 0.6} Z`);
      cel(ctx, sh, C.shoe, ax - 2, ax + 2.4, { lc: C.out, lw: 0.14 });
      line(ctx, P2(`M${ax - 1.2} ${ay - 0.2} L${ax + 1.4} ${ay - 0.4}`), C.sash, 0.4);
    }
    // ---- skirt: over the lap and knees, hanging hem simulated as cloth
    const H = this.hem, hp = []; for (let i = 0; i < H.n; i++) hp.push([H.x[i], H.y[i]]);
    const skirtPts = [[-6.0, -11.4], [-9.0, -7.0], [-12.0, -3.0], [-14.8, 0.8], [-15.6, 4.2]].concat(hp, [[0.6, 7.0], [4.6, 3.6], [8.8, 1.8], [10.2, -2.4], [9.3, -7.0], [6.2, -11.4]]);
    const skirt = smooth(skirtPts, true);
    cel(ctx, skirt, C.dress, -15, 10.5, { lc: C.out, shade: '#4A5AA8' });
    ctx.save(); ctx.clip(skirt);
    // the tops of her thighs catch the light; the fabric falls into shade over the knees and below
    const lap = ctx.createLinearGradient(2, -9, -6, 9); lap.addColorStop(0, 'rgba(255,255,255,0)'); lap.addColorStop(0.45, 'rgba(255,255,255,.3)'); lap.addColorStop(0.7, 'rgba(255,255,255,.08)'); lap.addColorStop(1, 'rgba(50,60,140,.28)');
    ctx.fillStyle = lap; ctx.fillRect(-17, -12, 30, 26);
    line(ctx, P2('M3.5 -6 C0 -2 -4 1 -9 2.4'), 'rgba(255,255,255,.3)', 0.6);                       // where her thighs meet
    line(ctx, P2('M5.5 1.4 C3 3.6 0 5.4 -2.2 7.2'), 'rgba(60,70,150,.35)', 0.45);                    // the fabric resting on the ledge
    for (let i = 0; i < 6; i++) { const u = i / 5, k = hp[Math.round(u * 8)], x = lerp(-13.6, -2.4, u); line(ctx, P2(`M${x} ${lerp(3.6, 6.4, u)} C${x - 0.2} ${lerp(6, 9, u)} ${k[0]} ${k[1] - 2} ${k[0]} ${k[1] - 0.6}`), i % 2 ? 'rgba(255,255,255,.25)' : 'rgba(60,70,150,.28)', 0.45); }
    ctx.restore();
    // lace trim
    const lace = ribbon(hp, hp.map(() => 1.3)); fill(ctx, lace.path, C.collar);
    for (let i = 0; i < hp.length - 1; i++) { const a = hp[i], b = hp[i + 1]; for (let k = 0; k < 2; k++) { const u = (k + 0.5) / 2; line(ctx, ell(lerp(a[0], b[0], u), lerp(a[1], b[1], u) + 0.55, 0.55, 0.35), 'rgba(200,170,190,.6)', 0.1); } }
    // ---- torso (bodice), sash, collar, sleeves
    ctx.save(); ctx.translate(0, breathe * 0.5);
    cel(ctx, P2('M-1.8 -31.4 L-2.0 -26.4 C-0.8 -25.6 1.6 -25.6 2.6 -26.2 L2.2 -31.0 Z'), C.skin, -2, 2.6, { line: false });
    fill(ctx, ell(0.5, -30.6, 2.6, 0.9), 'rgba(110,50,40,.3)');
    const bod = smooth([[-2.8, -27.6], [-6.0, -27.1], [-7.4, -25.6], [-7.3, -21.5], [-6.6, -16.5], [-5.7, -11.6], [5.9, -11.6], [6.9, -16.5], [7.7, -21.5], [7.8, -25.6], [6.4, -27.1], [3.4, -27.6], [0.4, -25.4]], true);
    cel(ctx, bod, C.dress, -7.4, 7.8, { lc: C.out, shade: '#4A5AA8' });
    line(ctx, P2('M-3.4 -24 C-3.0 -19 -3.4 -15 -3.6 -11.8'), 'rgba(60,70,150,.3)', 0.32); line(ctx, P2('M4.4 -24 C4.0 -19 4.4 -15 4.6 -11.8'), 'rgba(60,70,150,.3)', 0.32);
    cel(ctx, P2('M-6.2 -12.8 L6.4 -12.8 L6.6 -10.4 L-6.0 -10.4 Z'), C.sash, -6, 6.6, { lc: C.out, lw: 0.15 });
    // bow at her right hip
    ctx.save(); ctx.translate(6.6, -11.6);
    cel(ctx, P2('M0 0 C-1.2 -2.2 -3.4 -2.0 -3.0 0.2 C-2.8 1.6 -1.2 1.0 0 0 Z'), C.sash, -3.4, 0, { lc: C.out, lw: 0.12 });
    cel(ctx, P2('M0 0 C1.4 -2.4 3.8 -2.0 3.3 0.3 C3.0 1.8 1.2 1.1 0 0 Z'), C.sash, 0, 3.8, { lc: C.out, lw: 0.12 });
    fill(ctx, ell(0, 0, 0.75, 0.65), C.sashD); ctx.restore();
    cel(ctx, P2('M-2.9 -27.7 C-3.6 -25.6 -2.4 -24.2 -0.6 -24.4 C0.0 -24.8 0.3 -25.2 0.4 -25.5 C-0.7 -26.0 -1.9 -26.8 -2.9 -27.7 Z'), C.collar, -3.6, 0.4, { lc: C.out, lw: 0.12 });
    cel(ctx, P2('M3.5 -27.7 C4.3 -25.6 3.1 -24.2 1.3 -24.4 C0.7 -24.8 0.45 -25.2 0.4 -25.5 C1.5 -26.0 2.6 -26.8 3.5 -27.7 Z'), C.collar, 0.4, 4.3, { lc: C.out, lw: 0.12 });
    ctx.restore();
    // ---- Snowki in her lap (drawn by the film with his own rig, so he is the same teddy when he comes alive)
    if (st.lap) st.lap(ctx);
    // ---- head
    ctx.save(); head.apply(ctx);
    this.drawHead(ctx, st);
    ctx.restore();
    // front side-locks (simulated) over the shoulders
    for (const c of this.locks) { const pts = []; for (let i = 0; i < c.n; i++) pts.push([c.x[i], c.y[i]]); cel(ctx, ribbon(pts, pts.map((_, i) => 2.2 * (1 - i / c.n * 0.6))).path, C.hair, -6, 8, { line: false, shade: '#000000' }); line(ctx, smooth(pts, false), rgba(C.hairHi, 0.6), 0.25); }
    // ---- arms: left hugs Snowki, right pets Jessi (IK) or meets the other hand in wonder
    const sL = [-7.0, -25.2 + breathe * 0.5], sR = [7.4, -25.2 + breathe * 0.5];
    let aL = st.lap ? [sL, [-11.4, -16.6], [-9.0, -10.8]] : [sL, [-10.8, -15.6], [-5.6, -6.4]];
    let aR = st.pet ? ik(sR, st.pet, 10.8, 9.8, 1) : st.lap ? [sR, [10.0, -16.0], [3.4, -9.8]] : [sR, [9.8, -15.6], [2.6, -5.8]];
    if (st.expr === 'surprised' || st.expr === 'teary') { const k = clamp(lu, 0, 1); aR = [sR, [lerp(aR[1][0], 8.4, k), lerp(aR[1][1], -16.5, k)], [lerp(aR[2][0], 1.6, k), lerp(aR[2][1], -20.5, k)]]; }
    for (const [j, side] of [[aL, -1], [aR, 1]]) {
      const [a, b, c] = j;
      limb(ctx, a, b, c, [2.6, 2.5, 2.05, 2.1, 1.45], C.skin, C.out, { lw: 0.16 });
      { const d = [c[0] - b[0], c[1] - b[1]], l = Math.hypot(d[0], d[1]) || 1; hand2(ctx, [c[0] - d[0] / l * 0.25, c[1] - d[1] / l * 0.25], d, C.skin, 0.92, C.out, side < 0 ? -1 : 1, st.pet && side > 0 ? 0.1 : 0.45); }
      // puff sleeve
      const m = [a[0] + (b[0] - a[0]) * 0.32, a[1] + (b[1] - a[1]) * 0.32];
      cel(ctx, ell(m[0], m[1] - 0.4, 2.6, 2.9, Math.atan2(b[1] - a[1], b[0] - a[0]) - Math.PI / 2), C.dressL, m[0] - 2.6, m[0] + 2.6, { lc: C.out, lw: 0.15 });
      const e = [a[0] + (b[0] - a[0]) * 0.55, a[1] + (b[1] - a[1]) * 0.55], ang = Math.atan2(b[1] - a[1], b[0] - a[0]) + Math.PI / 2;
      line(ctx, P2(`M${e[0] - Math.cos(ang) * 1.5} ${e[1] - Math.sin(ang) * 1.5} L${e[0] + Math.cos(ang) * 1.5} ${e[1] + Math.sin(ang) * 1.5}`), C.collar, 0.5);
    }
  }
  drawHead(ctx, st) {
    const C = HC, t = st.t, ex = st.expr || 'calm', lu = this.lu || 0;
    // ear (mostly hidden by hair)
    cel(ctx, P2('M-4.6 -38.4 C-6.0 -38.6 -6.2 -35.9 -4.9 -35.0 C-4.5 -34.8 -4.2 -35.5 -4.2 -36.0 Z'), C.skin, -6.2, -4.2, { lc: C.out, lw: 0.14 });
    const face = smooth([[-4.6, -41.5], [-5.0, -38.5], [-4.8, -35.4], [-3.6, -32.8], [-1.4, -31.2], [0.9, -30.5], [3.0, -31.4], [4.6, -33.2], [5.6, -35.8], [5.8, -39.0], [4.8, -42.4], [1.6, -44.1], [-1.8, -43.8]], true);
    cel(ctx, face, C.skin, -5, 5.8, { lc: C.out, lw: 0.2 });
    ctx.save(); ctx.clip(face);
    const sh = ctx.createLinearGradient(0, -44, 0, -30); sh.addColorStop(0, 'rgba(90,30,50,.30)'); sh.addColorStop(0.3, 'rgba(90,30,50,0)'); ctx.fillStyle = sh; ctx.fillRect(-6, -45, 13, 16);
    const bl = ex === 'joyful' || ex === 'teary' || ex === 'surprised' ? 0.55 : 0.4;
    for (const [bx, by, r] of [[-2.4, -35.4, 1.8], [4.0, -35.6, 1.3]]) { const g = ctx.createRadialGradient(bx, by, 0, bx, by, r); g.addColorStop(0, rgba(C.blush, bl)); g.addColorStop(1, rgba(C.blush, 0)); ctx.fillStyle = g; ctx.fillRect(bx - r, by - r, r * 2, r * 2);
      for (let k = 0; k < 3; k++) line(ctx, P2(`M${bx - r * 0.5 + k * r * 0.4} ${by + r * 0.25} L${bx - r * 0.25 + k * r * 0.4} ${by - r * 0.25}`), rgba('#E0566C', bl * 0.8), 0.12); }
    ctx.restore();
    // eyes
    const blinkNow = this.blink > 0, gy = ex === 'surprised' ? -1.0 : lu * -0.8;
    let es = ex === 'joyful' ? 'happy' : ex === 'surprised' ? 'wide' : ex === 'teary' ? 'teary' : ex === 'closed' ? 'closed' : 'open';
    if (blinkNow && es !== 'happy') es = 'closed';
    const lights = st.eyeLights || null;
    animeEye(ctx, -1.7, -37.2, 3.4, 3.9, es, C, 0.15, gy, lights);
    animeEye(ctx, 3.45, -37.3, 2.8, 3.6, es, C, 0.15, gy, lights);
    if (ex === 'teary') { // a tear catching the light
      const ty = -35.0 + ((t * 0.35) % 1) * 2.2;
      ctx.fillStyle = 'rgba(210,235,255,.85)'; ctx.beginPath(); ctx.ellipse(-0.6, ty, 0.32, 0.5, 0, 0, 7); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,1)'; ctx.beginPath(); ctx.arc(-0.7, ty - 0.18, 0.12, 0, 7); ctx.fill();
    }
    const bu = ex === 'surprised' ? -0.6 : ex === 'teary' ? -0.25 : 0;
    fill(ctx, P2(`M-3.6 ${-40.4 + bu} C-2.6 ${-41.3 + bu} -1.2 ${-41.5 + bu} 0.0 ${-41.0 + bu} C-1.2 ${-41.1 + bu} -2.5 ${-40.95 + bu} -3.6 ${-40.4 + bu} Z`), '#2A161C');
    fill(ctx, P2(`M2.2 ${-41.1 + bu} C3.2 ${-41.5 + bu} 4.3 ${-41.3 + bu} 5.0 ${-40.5 + bu} C4.2 ${-40.9 + bu} 3.2 ${-41.0 + bu} 2.2 ${-41.1 + bu} Z`), '#2A161C');
    line(ctx, P2('M2.25 -35.6 C2.45 -35.0 2.35 -34.7 2.0 -34.6'), rgba(C.skinD, 0.85), 0.18);
    fill(ctx, ell(2.4, -35.3, 0.18, 0.4, 0.3), 'rgba(255,230,210,.5)');
    if (ex === 'joyful') {
      cel(ctx, P2('M0.0 -33.4 C0.9 -33.0 2.2 -33.0 3.0 -33.4 C2.8 -31.8 1.9 -31.3 1.4 -31.35 C0.6 -31.4 0.15 -32.2 0.0 -33.4 Z'), '#7A2434', 0, 3, { lw: 0.12, lc: C.out });
      fill(ctx, P2('M0.25 -33.25 C1.0 -33.0 2.1 -33.0 2.75 -33.25 L2.6 -32.85 C1.9 -32.7 0.9 -32.7 0.4 -32.85 Z'), '#FFF6EE');
      fill(ctx, ell(1.5, -31.95, 0.7, 0.28), '#E2707E');
    } else if (ex === 'surprised') { fill(ctx, ell(1.5, -32.6, 0.55, 0.62), '#7A2434'); fill(ctx, ell(1.5, -32.45, 0.3, 0.2), '#E2707E'); }
    else { line(ctx, P2('M0.3 -33.0 C0.9 -32.5 2.0 -32.4 2.8 -32.9'), C.lip, 0.3); fill(ctx, P2('M0.8 -32.62 C1.3 -32.3 1.9 -32.3 2.3 -32.62 C1.9 -32.45 1.3 -32.45 0.8 -32.62 Z'), rgba(C.lip, 0.55)); }
    // front hair: anime fringe of pointed locks, side volume, crown sheen ("angel ring") and the little pink bow
    const fx = Math.sin(t * 1.9) * 0.15 + (st.wind || 0) * 0.0015;
    const fringe = smooth([[-5.6, -36.6], [-6.1, -40.2], [-5.4, -43.6], [-3.4, -45.9], [-0.4, -46.9], [2.8, -46.6], [5.2, -45.0], [6.5, -42.0], [6.6, -38.2], [6.2, -35.0],
      [5.4, -38.0 + fx], [4.8, -40.6], [3.6, -38.9 + fx], [2.5, -41.4], [1.2, -39.6 + fx], [0.0, -41.6], [-1.4, -39.8 + fx], [-2.6, -41.6], [-3.6, -39.4 + fx], [-4.4, -40.8], [-4.9, -38.2]], true);
    cel(ctx, fringe, C.hair, -6, 7, { lc: 'rgba(40,20,40,.8)', lw: 0.18, shade: '#000000' });
    ctx.save(); ctx.clip(fringe);
    const ring = P2('M-4.6 -43.0 C-2.6 -44.6 1.6 -45.0 5.0 -43.6 L4.8 -42.6 L4.0 -43.2 L3.3 -42.4 L2.4 -43.3 L1.6 -42.5 L0.6 -43.4 L-0.4 -42.6 L-1.4 -43.3 L-2.4 -42.6 L-3.3 -43.2 L-4.2 -42.4 Z');
    fill(ctx, ring, rgba(C.sheen, 0.75));
    for (let i = 0; i < 6; i++) line(ctx, P2(`M${-4 + i * 1.8} -45.5 Q${-4.2 + i * 1.8} -42 ${-3.6 + i * 1.8} -39.8`), rgba(C.hairHi, 0.6), 0.16);
    ctx.restore();
    ctx.save(); ctx.translate(-5.3, -43.8); ctx.rotate(-0.4);
    cel(ctx, P2('M0 0 C-1.0 -1.8 -2.8 -1.6 -2.5 0.2 C-2.3 1.4 -1.0 0.9 0 0 Z'), C.sash, -2.8, 0, { lc: C.out, lw: 0.1 });
    cel(ctx, P2('M0 0 C1.0 -1.8 2.8 -1.6 2.5 0.2 C2.3 1.4 1.0 0.9 0 0 Z'), C.sash, 0, 2.8, { lc: C.out, lw: 0.1 });
    fill(ctx, ell(0, 0, 0.6, 0.55), C.sashD); ctx.restore();
  }
}

// =====================================================================================  THE BOY (standing / hiding / lighting / walking)
const BC = { skin: '#A8694A', skinD: '#7E4A30', hair: '#141011', hairHi: '#4E3A32', shirt: '#F6F3EC', shirtD: '#C5BDD2', pant: '#2B2F3A', shoe: '#1E1A1C', lip: '#7A3A34', iris: '#3A1F15', irisL: '#C08050', lash: '#130A0A', out: 'rgba(90,45,40,.75)' };
export class Boy {
  constructor() { this.hem = new Hem(7, { drag: 3.5, grav: 150, stiff: 0.45 }); this.blinkT = 3; this.blink = 0; this.curl = new Spring(40, 6); this.bounds = [-26, -116, 26, 6]; this.walkPh = 0; }
  update(st) {
    const dt = st.dt; this.blinkT -= dt; if (this.blinkT < 0) { this.blink = 0.13; this.blinkT = 2.6 + Math.random() * 3; } this.blink = Math.max(0, this.blink - dt);
    this.curl.step(dt, (st.wind || 0) * 0.004);
    if (st.pose === 'walk') this.walkPh += dt * 4.4;
    const pose = this.pose(st), anch = [], rest = [];
    for (let i = 0; i < 7; i++) { const u = i / 6; anch.push([lerp(-8.8, 8.9, u), -59]); rest.push([lerp(-9.3, 9.4, u), -45.8 + Math.sin(u * Math.PI) * 0.5]); }
    this.hem.step(dt, anch, rest, (st.wind || 0) * 0.55, st.t);
    this.P = pose;
  }
  pose(st) {
    const t = st.t, P = { hip: [0, -46.5], lean: 0, headTilt: 0, crouch: 0 };
    const leg = (hx, foot, bend) => { const hip = [P.hip[0] + hx, P.hip[1]]; return ik(hip, foot, 22.5, 21.6, bend); };
    if (st.pose === 'light') {
      P.lean = 0.25; P.headTilt = 0.3;
      P.legs = [leg(-3.9, [-5.6, -0.2], -1), leg(4.1, [6.2, -0.2], -1)];
    } else if (st.pose === 'walk') {
      const ph = this.walkPh, sway = Math.sin(ph) * 0.9, bob = (1 - Math.abs(Math.cos(ph))) * 1.1;
      P.hip = [sway, -46.5 - bob]; P.back = true; P.lean = Math.sin(ph) * 0.018;
      const side = (hx, p) => { const lift = Math.max(0, Math.sin(p)), stance = Math.max(0, -Math.sin(p)), hip = [P.hip[0] + hx, P.hip[1]];
        const kn = [hip[0] + hx * 0.06 + lift * 0.4, hip[1] + 22.5 - lift * 2.2 + stance * 0.2], an = [kn[0] - lift * 0.3, Math.min(-0.2, kn[1] + 21.6 * (1 - lift * 0.5) - lift * 1.5)];
        return [hip, kn, an, lift]; };
      P.legs = [side(-3.8, ph), side(4.0, ph + Math.PI)];
    } else P.legs = [leg(-3.9, [-4.4, -0.2], -1), leg(4.1, [4.8, -0.2], -1)];
    P.c = Math.cos(P.lean); P.s = Math.sin(P.lean);
    P.tp = (x, y) => { const dx = x - 0, dy = y + 46.5; return [P.hip[0] + dx * P.c - dy * P.s, P.hip[1] + dx * P.s + dy * P.c]; };     // torso space -> body
    const sL = P.tp(-9.6, -80.2), sR = P.tp(9.8, -80.2);
    if (st.pose === 'light') { P.arms = [ik(sL, P.tp(-6, -56), 14.2, 12.4, -1), st.reach ? ik(sR, st.reach, 14.2, 12.4, 1) : ik(sR, [20, -20], 14.2, 12.4, 1)]; }
    else if (st.pose === 'walk') { const s = Math.sin(this.walkPh), h = P.hip[0]; P.arms = [[sL, [-12.4 + h, -67.2 - s * 0.8], [-12.1 + h, -55.4 - s * 2.2]], [sR, [12.6 + h, -67.2 + s * 0.8], [12.3 + h, -55.4 + s * 2.2]]]; }
    else if (st.pose === 'hide' || st.pose === 'watch') {
      P.arms = [[sL, P.tp(-12.8, -66.6), P.tp(-12.6, -54.6)], st.reach ? ik(sR, st.reach, 14.2, 12.4, 1) : [sR, P.tp(12.9, -66.4), P.tp(12.5, -54.4)]];
    } else P.arms = [[sL, P.tp(-12.7, -66.6), P.tp(-12.4, -54.6)], [sR, P.tp(12.9, -66.4), P.tp(12.5, -54.4)]];
    P.head = P.tp(0.3, -86);
    return P;
  }
  arm(ctx, j, side) {
    const C = BC, [a, b, c] = j;
    ctx.save(); ctx.translate(-(side || 1) * 0.9, 0.7); ctx.fillStyle = 'rgba(70,50,100,.22)'; ctx.fill(limbPath(a, b, c, [4.4, 4.4, 4, 3.6, 2.8])); ctx.restore();   // the arm's shadow on the shirt
    limb(ctx, a, b, c, [3.6, 3.5, 3.0, 3.1, 2.2], C.skin, C.out, { lw: 0.18 });
    { const d = [c[0] - b[0], c[1] - b[1]], l = Math.hypot(d[0], d[1]) || 1; hand2(ctx, [c[0] - d[0] / l * 0.3, c[1] - d[1] / l * 0.3], d, C.skin, 1.18, C.out, side || 1, 0.4); }
    const e = [a[0] + (b[0] - a[0]) * 1.06, a[1] + (b[1] - a[1]) * 1.06], mid = [(a[0] + e[0]) / 2, (a[1] + e[1]) / 2];
    limb(ctx, a, mid, e, [4.6, 4.5, 4.3, 4.3, 4.5], C.shirt, C.out, { shade: '#8C7EA8', lw: 0.18 });
    const cd = [b[0] - a[0], b[1] - a[1]], cl = Math.hypot(cd[0], cd[1]) || 1, cn = [-cd[1] / cl * 2.4, cd[0] / cl * 2.4], cu = [cd[0] / cl * 0.9, cd[1] / cl * 0.9];
    const cuff = P2(`M${e[0] + cn[0] - cu[0]} ${e[1] + cn[1] - cu[1]} L${e[0] + cn[0] + cu[0]} ${e[1] + cn[1] + cu[1]} L${e[0] - cn[0] + cu[0]} ${e[1] - cn[1] + cu[1]} L${e[0] - cn[0] - cu[0]} ${e[1] - cn[1] - cu[1]} Z`);
    cel(ctx, cuff, '#EDE8F2', e[0] - 2.4, e[0] + 2.4, { lc: C.out, lw: 0.14, shade: '#8C7EA8' });
  }
  legs(ctx) {
    const C = BC;
    for (const [hip, kn, an, lift] of this.P.legs) {
      limb(ctx, hip, kn, an, [7.0, 6.4, 5.4, 5.0, 4.5], C.pant, 'rgba(10,10,20,.8)', { shade: '#000000', light: '#8A90A8', lw: 0.22 });
      line(ctx, P2(`M${lerp(hip[0], kn[0], 0.3)} ${lerp(hip[1], kn[1], 0.3)} L${lerp(kn[0], an[0], 0.8)} ${lerp(kn[1], an[1], 0.8)}`), 'rgba(255,255,255,.07)', 0.5);
      if (lift > 0.05 && this.P.back) { const so = P2(`M${an[0] - 2.6} ${an[1] - 0.6} C${an[0] - 2.8} ${an[1] + 1.6} ${an[0] + 2.8} ${an[1] + 1.6} ${an[0] + 2.6} ${an[1] - 0.6} C${an[0] + 1.6} ${an[1] - 1.8} ${an[0] - 1.6} ${an[1] - 1.8} ${an[0] - 2.6} ${an[1] - 0.6} Z`);
        cel(ctx, so, '#3A3236', an[0] - 2.6, an[0] + 2.6, { lc: 'rgba(0,0,0,.6)' }); fill(ctx, P2(`M${an[0] - 1.9} ${an[1] + 0.2} C${an[0] - 1.6} ${an[1] + 1.2} ${an[0] + 1.6} ${an[1] + 1.2} ${an[0] + 1.9} ${an[1] + 0.2} Z`), 'rgba(200,190,180,.55)'); continue; }
      const sh = P2(`M${an[0] - 2.4} ${an[1] - 1.2} C${an[0] - 2.8} ${an[1] + 1.8} ${an[0] + 5.0} ${an[1] + 2.4} ${an[0] + 4.8} ${an[1] + 0.4} C${an[0] + 3.4} ${an[1] - 1.6} ${an[0] + 1} ${an[1] - 2} ${an[0] - 2.4} ${an[1] - 1.2} Z`);
      cel(ctx, sh, C.shoe, an[0] - 2.6, an[0] + 5, { lc: 'rgba(0,0,0,.6)', shade: '#000000' });
    }
  }
  shirt(ctx, t, back) {
    const C = BC, H = this.hem, hp = []; for (let i = 0; i < H.n; i++) hp.push([H.x[i], H.y[i]]);
    const pts = [[-3.4, -84.6], [-7.2, -83.4], [-10.4, -81.0], [-10.9, -77.2], [-10.2, -72], [-9.2, -64], [-8.8, -58]].concat(hp, [[8.9, -58], [9.3, -64], [10.4, -72], [11.1, -77.2], [10.6, -81.0], [7.6, -83.4], [3.8, -84.6], back ? [0.3, -83.8] : [0.5, -77.8]]);
    const sh = smooth(pts, true);
    cel(ctx, sh, C.shirt, -10.3, 10.5, { lc: C.out, shade: '#8C7EA8' });
    ctx.save(); ctx.clip(sh);
    const g = ctx.createLinearGradient(0, -80, 0, -45); g.addColorStop(0, 'rgba(150,130,190,0)'); g.addColorStop(1, 'rgba(150,130,190,.3)'); ctx.fillStyle = g; ctx.fillRect(-12, -85, 24, 42);
    for (const [x0, x1] of [[-6.5, -7.2], [6.8, 7.4], [-3, -3.8], [3.4, 4.0]]) line(ctx, P2(`M${x0} -73 C${x0 + 0.4} -64 ${x1} -56 ${x1 - 0.2} -47`), 'rgba(140,125,170,.45)', 0.25);
    { const sg = ctx.createRadialGradient(0, -70, 2, 0, -66, 13); sg.addColorStop(0, 'rgba(255,255,255,0)'); sg.addColorStop(1, 'rgba(110,95,150,.22)'); ctx.fillStyle = sg; ctx.fillRect(-12, -86, 24, 42); }
    line(ctx, P2('M-8.6 -50.5 C-3 -49.6 3 -49.6 8.8 -50.5'), 'rgba(140,125,170,.35)', 0.3);
    ctx.restore();
    if (back) { line(ctx, P2('M-9.4 -76.4 C-3 -74.8 3 -74.8 9.8 -76.4'), 'rgba(140,125,170,.6)', 0.22); line(ctx, P2('M-3.4 -83.8 C-1 -85.0 1.4 -85.0 3.8 -83.8'), 'rgba(140,125,170,.9)', 0.55); return; }
    ctx.fillStyle = rgba(C.skinD, 0.95); ctx.beginPath(); ctx.moveTo(-2.9, -83.3); ctx.quadraticCurveTo(-0.6, -80.4, 0.5, -77.9); ctx.quadraticCurveTo(1.6, -80.4, 3.4, -83.3); ctx.closePath(); ctx.fill();
    line(ctx, P2('M0.5 -77.8 L0.8 -47'), 'rgba(140,125,170,.9)', 0.2);
    for (let i = 0; i < 4; i++) fill(ctx, ell(1.25, -73.5 + i * 7, 0.34, 0.34), '#E3DCE6');
    cel(ctx, P2('M-3.4 -83.8 C-3.8 -82.4 -3.2 -80.6 -0.2 -77.9 L-1.4 -82.2 L-2.0 -84.4 Z'), C.shirt, -3.8, -0.2, { lc: C.out, lw: 0.14 });
    cel(ctx, P2('M3.9 -83.8 C4.3 -82.4 3.7 -80.6 1.2 -77.7 L2.0 -82.2 L2.7 -84.4 Z'), C.shirt, 1.2, 4.3, { lc: C.out, lw: 0.14 });
  }
  curls(ctx, t, cx, cy, back) {
    const C = BC, jig = this.curl.x + Math.sin(t * 1.8) * 0.05, base = [];
    const a0 = back ? 0.25 : Math.PI * 1.03, a1 = back ? Math.PI * 2.75 : Math.PI * 2.02, N = back ? 15 : 12;
    for (let i = 0; i <= N; i++) { const a = a0 + (a1 - a0) * i / N; base.push([cx + Math.cos(a) * 6.4 + jig * (1 - Math.sin(a)) * 6, cy + Math.sin(a) * 5.8]); }
    const hl = back ? [[cx + 3.4, cy + 5.4], [cx, cy + 6.2], [cx - 3.4, cy + 5.4]] : [[5.0, -95.4], [3.4, -96.9], [1.6, -97.4], [-0.3, -97.3], [-2.2, -97.5], [-3.8, -96.6], [-4.9, -94.6]];
    const path = new Path2D(); path.moveTo(base[0][0], base[0][1]);
    for (let i = 1; i < base.length; i++) { const p = base[i - 1], q = base[i], mx = (p[0] + q[0]) / 2, my = (p[1] + q[1]) / 2, dx = mx - cx, dy = my - cy, d = Math.hypot(dx, dy) || 1, k = 1.25 + 0.25 * Math.sin(i * 2.3); path.quadraticCurveTo(mx + dx / d * k * 1.6, my + dy / d * k * 1.6, q[0], q[1]); }
    for (let i = 0; i < hl.length; i++) { const p = i ? hl[i - 1] : base[base.length - 1], q = hl[i]; path.quadraticCurveTo((p[0] + q[0]) / 2, (p[1] + q[1]) / 2 + 0.7, q[0], q[1]); }
    path.closePath();
    cel(ctx, path, C.hair, cx - 7, cx + 7, { lc: 'rgba(40,25,25,.8)', lw: 0.2, shade: '#000000' });
    ctx.save(); ctx.clip(path); const R = rng(17);
    for (let i = 0; i < 26; i++) { const a = R() * 6.283, d = Math.sqrt(R()) * 5.6, x = cx + Math.cos(a) * d, y = cy + Math.sin(a) * d * 0.9 - 0.8, rr = 0.55 + R() * 0.4, s0 = R() * 6, q = new Path2D(); q.arc(x + jig, y, rr, s0, s0 + 3.2); line(ctx, q, rgba(i % 3 ? C.hairHi : '#806A5C', i % 3 ? 0.45 : 0.32), 0.17); }
    const sg = ctx.createRadialGradient(cx - 2, cy - 3.5, 0, cx - 2, cy - 3.5, 4); sg.addColorStop(0, 'rgba(150,120,110,.35)'); sg.addColorStop(1, 'rgba(150,120,110,0)'); ctx.fillStyle = sg; ctx.fillRect(cx - 7, cy - 8, 12, 9);
    ctx.restore();
  }
  face(ctx, st) {
    const C = BC, ex = st.expr || 'watching';
    cel(ctx, P2('M-4.4 -94.0 C-5.9 -94.4 -6.2 -91.3 -4.8 -90.2 C-4.4 -90.0 -4.1 -90.6 -4.1 -91.3 Z'), C.skin, -6, -4, { lc: C.out, lw: 0.14 });
    const face = smooth([[-4.6, -97.0], [-4.9, -93.5], [-4.6, -90.0], [-3.4, -87.2], [-1.1, -85.4], [1.2, -85.0], [3.2, -85.8], [4.7, -88.4], [5.4, -92.0], [5.3, -95.8], [4.2, -98.8], [1.6, -100.4], [-1.8, -100.2], [-3.9, -98.8]], true);
    cel(ctx, face, C.skin, -4.9, 5.4, { lc: C.out });
    ctx.save(); ctx.clip(face); const sh = ctx.createLinearGradient(0, -100, 0, -85); sh.addColorStop(0, 'rgba(40,15,20,.32)'); sh.addColorStop(0.28, 'rgba(40,15,20,0)'); ctx.fillStyle = sh; ctx.fillRect(-6, -101, 12, 16);
    const g = ctx.createRadialGradient(-2.6, -90.8, 0, -2.6, -90.8, 1.7); g.addColorStop(0, 'rgba(220,90,90,.22)'); g.addColorStop(1, 'rgba(220,90,90,0)'); ctx.fillStyle = g; ctx.fillRect(-4.6, -93, 4, 4); ctx.restore();
    let es = ex === 'contentment' ? 'soft' : ex === 'farewell' ? 'happy' : 'open'; if (this.blink > 0 && es !== 'happy') es = 'closed';
    const gx = st.look || 0, gy = st.gazeY || 0;
    animeEye(ctx, -1.55, -93.1, 2.9, 3.0, es, C, gx, gy, st.eyeLights);
    animeEye(ctx, 2.95, -93.2, 2.45, 2.85, es, C, gx, gy, st.eyeLights);
    const bu = ex === 'watching' ? -0.15 : 0;
    fill(ctx, P2(`M-3.4 ${-95.6 + bu} C-2.3 ${-96.8 + bu} -0.6 ${-96.9 + bu} 0.35 ${-96.25 + bu} L0.25 ${-95.65 + bu} C-0.8 ${-96.15 + bu} -2.3 ${-95.95 + bu} -3.4 ${-95.6 + bu} Z`), '#150D0D');
    fill(ctx, P2(`M1.75 ${-96.3 + bu} C2.7 ${-96.95 + bu} 4.0 ${-96.75 + bu} 4.75 ${-95.7 + bu} L4.6 ${-95.3 + bu} C3.8 ${-96.05 + bu} 2.7 ${-95.95 + bu} 1.75 ${-95.7 + bu} Z`), '#150D0D');
    line(ctx, P2('M2.3 -92.0 C2.8 -90.9 3.2 -90.1 2.75 -89.5 C2.25 -89.0 1.5 -89.2 1.15 -89.5'), rgba(C.skinD, 1), 0.24);
    const sm = ex === 'watching' ? 0.15 : ex === 'contentment' ? 0.7 : 0.9;
    line(ctx, P2(`M-0.3 ${-87.9} C0.6 ${-87.9 + 0.65 * sm} 1.9 ${-87.9 + 0.65 * sm} 2.75 ${-87.95}`), C.lip, 0.34);
    line(ctx, P2('M0.4 -86.9 C0.9 -86.7 1.5 -86.7 2.0 -86.9'), rgba(C.skinD, 0.6), 0.16);
  }
  draw(ctx, st) {
    const C = BC, P = this.P, t = st.t, back = st.pose === 'walk';
    if (back) { // walking away, seen from behind; may glance back over his shoulder
      this.legs(ctx); P.arms.forEach((a, i) => this.arm(ctx, a, i ? 1 : -1)); ctx.save(); ctx.translate(P.hip[0], P.hip[1] + 46.5); ctx.rotate(P.lean); this.shirt(ctx, t, true);
      cel(ctx, P2('M-2.3 -87.2 L-2.4 -82.4 L2.9 -82.4 L2.8 -87.2 Z'), C.skin, -2.4, 2.9, { line: false });
      const lb = st.lookBack || 0;
      ctx.save(); ctx.translate(0.3, -86); ctx.rotate(-0.08 * lb); ctx.translate(-0.3, 86);
      cel(ctx, ell(0.3 - lb * 1.4, -93.8, 4.9, 6.0), C.skin, -4.6, 5.2, { lc: C.out });
      if (lb > 0.05) { // lost profile: the edge of his cheek, an eye and a smile appear on the left
        ctx.globalAlpha = clamp(lb * 1.4, 0, 1);
        cel(ctx, P2('M-4.0 -97 C-6.2 -95.6 -6.5 -92 -5.6 -89.6 C-4.8 -87.6 -3.0 -86.6 -1.4 -87.2 C-2.6 -90 -3.4 -94 -4.0 -97 Z'), C.skin, -6.5, -1.4, { lc: C.out });
        line(ctx, P2('M-5.4 -93.3 C-4.9 -93.9 -4.3 -93.9 -3.9 -93.4'), C.lash, 0.3);
        line(ctx, P2('M-5.3 -89.6 C-4.8 -89.0 -4.1 -89.0 -3.6 -89.4'), C.lip, 0.28);
        ctx.globalAlpha = 1;
      }
      cel(ctx, P2('M5.3 -94.4 C6.6 -94.6 6.8 -91.6 5.5 -90.8 Z'), C.skin, 5.3, 6.8, { lc: C.out, lw: 0.12 });
      this.curls(ctx, t, 0.3 - lb * 0.6, -97.6, true);
      ctx.restore(); ctx.restore();
      return;
    }
    this.legs(ctx);
    ctx.save(); ctx.translate(P.hip[0], P.hip[1]); ctx.rotate(P.lean); ctx.translate(0, 46.5);
    cel(ctx, P2('M-2.1 -86.8 L-2.3 -82.2 L2.9 -82.0 L2.7 -86.4 Z'), C.skin, -2.3, 2.9, { line: false });
    this.shirt(ctx, t, false);
    ctx.translate(0.3, -86); ctx.rotate(P.headTilt + Math.sin(t * 0.8) * 0.01); ctx.translate(-0.3, 86);
    this.face(ctx, st); this.curls(ctx, t, 0.3, -98.8, false);
    ctx.restore();
    this.arm(ctx, P.arms[0], -1);
    this.arm(ctx, P.arms[1], 1);
    if (st.pose === 'light' && st.flame) { // a tiny lighter flame in his hand
      const c = P.arms[1][2], f = 1 + 0.15 * Math.sin(t * 31) + 0.1 * Math.sin(t * 17);
      const g = ctx.createRadialGradient(c[0] + 1.5, c[1] - 1.5, 0, c[0] + 1.5, c[1] - 1.5, 4 * f); g.addColorStop(0, 'rgba(255,250,220,1)'); g.addColorStop(0.3, 'rgba(255,190,90,.9)'); g.addColorStop(1, 'rgba(255,140,40,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(c[0] + 1.5, c[1] - 1.5, 4 * f, 0, 7); ctx.fill();
    }
  }
}

// =====================================================================================  JESSI (sitting, facing left towards Helen when flipped)
const DC = { fur: '#1E1D26', furHi: '#4C4D66', nose: '#0E0D12', tongue: '#E2687E', collar: '#E2447C', tag: '#D9A441', out: 'rgba(10,10,20,.85)' };
export class Jessi {
  constructor() { this.ear = new Spring(70, 7); this.tail = 0; this.headA = new Spring(20, 7); this.bounds = [-20, -46, 16, 3]; this.twitchT = 1.5; }
  update(st) {
    const dt = st.dt; this.tail += dt * (st.happy ? 13 : 7);
    this.twitchT -= dt; let kick = 0; if (this.twitchT < 0) { kick = 0.9; this.twitchT = 2 + Math.random() * 3; }
    this.ear.v += kick * 6; this.ear.step(dt, (st.pet ? 0.35 : 0) + (st.wind || 0) * 0.0006);
    this.headA.step(dt, st.lookUp ? -0.72 : st.pet ? 0.12 : 0);
  }
  draw(ctx, st) {
    const C = DC, t = st.t, ha = this.headA.x;
    ctx.save(); ctx.translate(-9.6, -3.5); ctx.rotate(-0.4 + Math.sin(this.tail) * (st.happy ? 0.45 : 0.3));
    cel(ctx, capsule([0, 0], [-7, -2.5], 2.2, 0.9), C.fur, -7, 0, { lc: C.out, shade: '#000000' }); ctx.restore();
    cel(ctx, ell(-5.6, -8.2, 6.6, 7.6, -0.15), C.fur, -12, 1, { lc: C.out, shade: '#000000' });
    cel(ctx, P2('M-10.6 -6 C-11.2 -14 -8.6 -21 -3.2 -27.5 C-1.4 -30 2.2 -31 4.4 -28 C6.2 -25 5.8 -18 4.8 -12 C4.4 -7 4.4 -3 4.6 0 L-3 0 C-6.6 -0.6 -10 -2 -10.6 -6 Z'), C.fur, -11, 6, { lc: C.out, shade: '#000000' });
    for (const x of [0.6, 3.0]) cel(ctx, capsule([x, -14], [x + 0.3, -0.8], 2.4, 2.0), C.fur, x - 1.4, x + 1.6, { lc: C.out, shade: '#000000' });
    for (const x of [1.2, 3.6]) cel(ctx, ell(x + 0.2, -0.5, 1.6, 0.8), C.fur, x - 1.4, x + 1.8, { lc: C.out, shade: '#000000' });
    line(ctx, P2('M-8.5 -14 C-9.2 -10 -8.8 -6 -7.6 -3.4'), rgba(C.furHi, 0.6), 0.4);
    ctx.save(); ctx.translate(2.6, -29.5); ctx.rotate(ha + Math.sin(t * 1.1) * 0.03); ctx.translate(-2.6, 29.5);
    fill(ctx, P2('M-0.6 -28.4 C1.6 -27.0 4.2 -27.0 5.6 -28.8 L5.4 -30.0 C3.8 -28.6 1.4 -28.6 -0.4 -29.8 Z'), C.collar); fill(ctx, ell(3.6, -27.3, 0.6, 0.6), C.tag);
    cel(ctx, P2('M-1.2 -34.5 C-1.2 -38.6 2 -40.6 5 -40 C7.6 -39.4 8.6 -37.4 9.2 -36.2 C10.8 -35.8 12.2 -35 12.4 -33.6 C12.6 -32 11.6 -31 10 -30.8 C8.4 -30.6 6.8 -30.8 5.4 -30.2 C3 -29.4 0.2 -30 -0.8 -32 C-1.1 -32.8 -1.2 -33.6 -1.2 -34.5 Z'), C.fur, -1.2, 12.4, { lc: C.out, shade: '#000000' });
    fill(ctx, ell(12.0, -34.2, 0.9, 0.7), C.nose); fill(ctx, ell(11.8, -34.5, 0.22, 0.22), 'rgba(255,255,255,.5)');
    line(ctx, P2('M11.6 -32.6 C10.6 -31.6 9 -31.8 8.2 -32.4'), '#08070A', 0.25);
    if (st.happy !== false) fill(ctx, P2('M9.4 -31.6 C9.4 -30 10.6 -29.4 11.0 -30.4 C11.2 -31 10.8 -31.6 10.6 -31.9 Z'), C.tongue);
    if (st.pet) line(ctx, P2('M5.6 -36.6 C6.2 -37.2 7.0 -37.1 7.4 -36.5'), '#0A0A10', 0.35);   // eyes closed in bliss
    else { fill(ctx, ell(6.4, -36.4, 0.85, 0.95), '#2A1810'); fill(ctx, ell(6.7 + (st.lookUp ? 0.1 : 0), -36.8 - (st.lookUp ? 0.25 : 0), 0.3, 0.3), '#FFFFFF'); }
    line(ctx, P2('M5.2 -37.8 C6 -38.4 7 -38.3 7.6 -37.6'), rgba(C.furHi, 0.8), 0.25);
    ctx.save(); ctx.translate(2.4, -38.2); ctx.rotate(this.ear.x + Math.sin(t * 2.2) * 0.05 + 0.05);
    cel(ctx, P2('M-0.6 0 C1.6 -0.8 3.6 0.2 3.4 2.6 C3.2 5.2 2.2 7.6 0.8 8.0 C-0.6 8.2 -1.4 5 -1.4 2.6 C-1.4 1.2 -1.2 0.4 -0.6 0 Z'), '#17161E', -1.4, 3.6, { lc: C.out, shade: '#000000' });
    ctx.restore(); ctx.restore();
  }
}

// =====================================================================================  teddies (Snowki in her lap; his gift teddy)
export const TEDDY_BLUE = { fur: '#A9CBEA', belly: '#D6E7F6', pink: '#F29BB8', bow: '#E85A8C', eye: '#1C1622' };
export const TEDDY_CREAM = { fur: '#E9D2B0', belly: '#F7EAD6', pink: '#F2A0A8', bow: '#E2445C', eye: '#2A1A14', heart: true };
export function drawTeddy(ctx, x, y, s, t, C, partial) {
  ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
  const out = 'rgba(90,60,80,.6)';
  if (partial) { ctx.beginPath(); ctx.rect(-12, -20, 8, 22); ctx.clip(); }
  for (const k of [-1, 1]) { cel(ctx, ell(k * 3.3, -1.6, 2.2, 1.7), C.fur, k * 3.3 - 2.2, k * 3.3 + 2.2, { lc: out, lw: 0.15 }); fill(ctx, ell(k * 3.7, -1.3, 1.0, 0.85), C.pink); }
  cel(ctx, ell(0, -5.4, 4.4, 4.6), C.fur, -4.4, 4.4, { lc: out, lw: 0.15 }); fill(ctx, ell(0, -4.6, 2.6, 2.9), C.belly);
  if (C.heart) fill(ctx, P2('M0 -3.2 C-1.6 -4.4 -1.4 -6.2 0 -5.4 C1.4 -6.2 1.6 -4.4 0 -3.2 Z'), '#E2445C');
  for (const k of [-1, 1]) cel(ctx, ell(k * 4.2, -6.4, 1.4, 2.4, k * 0.5), C.fur, k * 4.2 - 1.4, k * 4.2 + 1.4, { lc: out, lw: 0.15 });
  for (const k of [-1, 1]) { cel(ctx, ell(k * 3.0, -15.6, 1.6, 1.6), C.fur, k * 3 - 1.6, k * 3 + 1.6, { lc: out, lw: 0.15 }); fill(ctx, ell(k * 3.0, -15.6, 0.85, 0.85), C.pink); }
  cel(ctx, ell(0, -12.2, 4.0, 3.7), C.fur, -4, 4, { lc: out, lw: 0.15 });
  fill(ctx, ell(0, -11.0, 1.8, 1.35), C.belly); fill(ctx, ell(0, -11.6, 0.55, 0.4), C.eye);
  for (const k of [-1, 1]) { fill(ctx, ell(k * 1.55, -12.9, 0.42, 0.42), C.eye); fill(ctx, ell(k * 1.55 + 0.14, -13.05, 0.13, 0.13), '#fff'); }
  line(ctx, P2('M-0.6 -10.6 C-0.2 -10.2 0.2 -10.2 0.6 -10.6'), C.eye, 0.15);
  ctx.save(); ctx.translate(0, -8.6); ctx.rotate(Math.sin(t * 2) * 0.05); ctx.fillStyle = C.bow;
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.bezierCurveTo(-1.2, -1.6, -3.0, -1.2, -2.6, 0.2); ctx.bezierCurveTo(-2.4, 1.2, -1, 0.9, 0, 0); ctx.fill();
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.bezierCurveTo(1.2, -1.6, 3.0, -1.2, 2.6, 0.2); ctx.bezierCurveTo(2.4, 1.2, 1, 0.9, 0, 0); ctx.fill();
  fill(ctx, ell(0, 0, 0.55, 0.55), mixc(C.bow, '#000000', 0.2)); ctx.restore();
  ctx.restore();
}

// =====================================================================================  optional drop-in art (config.assets)
export class ImageActor {
  constructor(spec) { this.spec = spec; this.img = new Image(); this.ok = false; this.img.onload = () => { this.ok = true; }; this.img.src = spec.src; const h = spec.height || 75, w = h * 0.6; this.bounds = [-w, -h * 1.05, w, h * 0.06]; }
  update() {}
  draw(ctx, st) {
    if (!this.ok) return; const s = this.spec, h = s.height || 75, w = h * this.img.width / this.img.height, br = 1 + Math.sin(st.t * 1.6) * 0.006;
    ctx.save(); ctx.scale(1, br); ctx.drawImage(this.img, -w * (s.anchorX ?? 0.5), -h * (s.anchorY ?? 1), w, h); ctx.restore();
  }
}

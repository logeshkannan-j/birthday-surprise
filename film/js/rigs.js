// The characters. ONE reusable rig per character (skeleton + IK + Verlet hair/cloth), drawn with soft cel shading and
// thin warm outlines. Character space: feet (or seat, for Helen) at (0,0), up is -y, ~100 units = a standing adult.
import { clamp, lerp, rng, noise2 } from './core.js';
import { Chain, Hem, Spring } from './physics.js';
import { foot as gaitFoot, hipRise, armSwing, DUTY } from './gait.js';
const HELEN_STRIDE = 58, HUA = 13.8, HFA = 11.8;   // her upper arm and forearm (hands then reach mid-thigh)   // one full stride of Helen's walk in her units (film.js: walkPhase = 2π · distance / CU / 58)

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
// point at u along a -> b, pushed n units along the normal (-dy, dx); smoothstep on 0..1
const mid = (a, b, u = 0.5, n = 0) => { const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1; return [a[0] + dx * u - dy / l * n, a[1] + dy * u + dx / l * n]; };
const ss = x => { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); };
const hx = c => { if (c[0] !== '#') return c.match(/[\d.]+/g).slice(0, 3).map(Number); const n = parseInt(c.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255]; };   // '#rrggbb' or 'rgb(r,g,b)'
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
  // round end caps, walked from the L side to the R side (end) and back (start) so the outline never loops on itself
  const cap = (p, d, w, k) => { const out = []; for (let i = 1; i < 4; i++) { const an = Math.atan2(d[1], d[0]) + (k ? Math.PI / 2 - i * Math.PI / 4 : -Math.PI / 2 - i * Math.PI / 4); out.push([p[0] + Math.cos(an) * w / 2, p[1] + Math.sin(an) * w / 2]); } return out; };
  return smooth(L.concat(cap(c, d1, prof[4], true), R.reverse(), cap(a, d0, prof[0], false)), true);
}
function limb(ctx, a, b, c, prof, base, out, o = {}) {
  const p = limbPath(a, b, c, prof), m = [(a[0] + 2 * b[0] + c[0]) / 4, (a[1] + 2 * b[1] + c[1]) / 4];
  const dx = c[0] - a[0], dy = c[1] - a[1], l = Math.hypot(dx, dy) || 1, nx = -dy / l, ny = dx / l, w = Math.max(...prof) * 0.7, sgn = nx < 0 ? 1 : -1;   // light from the upper left
  const g = ctx.createLinearGradient(m[0] + nx * w * sgn, m[1] + ny * w * sgn, m[0] - nx * w * sgn, m[1] - ny * w * sgn);
  g.addColorStop(0, mixc(base, o.light || '#FFE8CF', 0.22)); g.addColorStop(0.5, base); g.addColorStop(1, mixc(base, o.shade || '#6E4E8C', 0.3));
  ctx.fillStyle = g; ctx.fill(p); if (o.gradOut) o.gradOut.g = g;
  if (out !== false) { ctx.lineWidth = o.lw || 0.2; ctx.strokeStyle = out || rgba(mixc(base, '#5A2632', 0.7), 0.8); ctx.stroke(p); }
  return p;
}
// a hand with real proportions (about 9 units from the wrist crease to the middle fingertip at s = 1.25, about as long as the face):
// a palm that widens from the wrist to the knuckles, four fingers side by side, a thumb that leaves the palm at an angle.
// dir = forearm direction, s = size, side = +1 puts the thumb on the -y side (forward when the arm hangs and he faces +x), curl 0..1 closes the fingers toward the thumb.
function hand2(ctx, wrist, dir, skin, s, out, side = 1, curl = 0.3) {
  const ang = Math.atan2(dir[1], dir[0]), u = s * 0.8;
  ctx.save(); ctx.translate(wrist[0], wrist[1]); ctx.rotate(ang); ctx.scale(u, u * side); ctx.lineCap = ctx.lineJoin = 'round';
  const F = [[-1.55, 3.9, 1.05], [-0.5, 4.35, 1.1], [0.55, 3.95, 1.0], [1.55, 3.1, 0.9]], k = curl * 1.6;   // knuckle y, length, width
  const fp = (fy, fl) => { const p = new Path2D(); p.moveTo(4.55, fy); p.bezierCurveTo(4.55 + fl * 0.45, fy - k * 0.12, 4.55 + fl * 0.8, fy - k * 0.5, 4.55 + fl * (1 - curl * 0.2), fy - k * 1.1); return p; };
  const th = new Path2D(); th.moveTo(1.2, -1.3); th.bezierCurveTo(2.1, -2.5, 3.2, -3.1, 4.3, -3.0 + curl * 1.2);
  // the palm starts under the end of the forearm and is outlined only along its sides: no line across the wrist
  const palm = new Path2D('M-0.9 -1.58 L0 -1.55 C1.4 -1.95 3.2 -2.05 4.75 -1.95 L4.85 2.05 C3.4 2.15 1.5 1.85 0 1.55 L-0.9 1.58 Z'), palmL = new Path2D('M-0.9 -1.58 L0 -1.55 C1.4 -1.95 3.2 -2.05 4.75 -1.95 M4.85 2.05 C3.4 2.15 1.5 1.85 0 1.55 L-0.9 1.58');
  const ow = 0.19 / u;   // the outline as fine as the forearm's (it used to be three times heavier, so the hands read as dark blobs)
  ctx.strokeStyle = out; ctx.lineWidth = 1.15 + ow; ctx.stroke(th); for (const [fy, fl, w] of F) { ctx.lineWidth = w + ow; ctx.stroke(fp(fy, fl)); } ctx.lineWidth = ow; ctx.stroke(palmL);   // outlines first (so no lines run between the fingers and the palm)
  ctx.strokeStyle = skin; ctx.lineWidth = 1.15; ctx.stroke(th); for (const [fy, fl, w] of F) { ctx.lineWidth = w; ctx.stroke(fp(fy, fl)); }
  const g = ctx.createLinearGradient(0, -2, 0, 2); g.addColorStop(0, mixc(skin, '#FFE8CF', 0.2)); g.addColorStop(0.55, skin); g.addColorStop(1, mixc(skin, '#6E4E8C', 0.2)); ctx.fillStyle = g; ctx.fill(palm);
  ctx.strokeStyle = rgba(mixc(skin, '#5A2632', 0.6), 0.55); ctx.lineWidth = 0.16;                                   // the gaps between the fingers, the crease of the thumb
  for (const y of [-1.02, 0.03, 1.07]) { ctx.beginPath(); ctx.moveTo(4.6, y); ctx.lineTo(4.6 + 2.2, y - k * 0.28); ctx.stroke(); }
  ctx.beginPath(); ctx.moveTo(1.5, -1.0); ctx.quadraticCurveTo(2.6, -0.8, 3.6, -1.35); ctx.stroke();
  ctx.restore();
}

// A relaxed hand seen from the thumb side – how hands hang at the sides of a figure seen from the front (palms toward the thighs):
// the back of the hand is the outer edge, the fingers curl gently toward the palm (the inner edge), the thumb lies in front along
// the index finger, its nail toward us. x runs from the wrist along dir; +y is the palm side (side = -1 / +1 for the arm on the
// body's -x / +x side keeps the palm toward the body). About 9 units from the wrist to the fingertips at s = 1.18 (mid-thigh).
// The hand starts under the end of the forearm and its outline is open there, so there is no seam at the wrist.
// o.gift: a small gift box held in the curled fingers – the index finger wraps its back edge, the thumb presses its front.
const RH = {
  // the hand's outline: back of the hand, the index finger curving down, its tip, the middle and ring fingertips curled a little
  // more toward the palm (each finger curls more than the one before it), the edge of the palm back to the wrist
  mass: 'M-1.0 -1.55 C1.2 -1.56 3.2 -1.6 4.9 -1.55 C6.3 -1.55 7.5 -1.3 8.45 -0.72 C9.25 -0.2 9.8 0.5 9.75 1.25 C9.72 1.75 9.4 2.0 9.0 1.92 C8.95 2.25 8.6 2.48 8.15 2.42 C7.85 2.4 7.65 2.3 7.5 2.15 C7.35 2.4 7.0 2.52 6.6 2.45 C5.6 2.4 4.9 2.3 4.2 2.12 C2.9 1.95 1.6 1.62 0.4 1.55 L-1.0 1.55',
  index: 'M5.0 -1.55 C6.3 -1.55 7.5 -1.3 8.45 -0.72 C9.25 -0.2 9.8 0.5 9.75 1.25 C9.72 1.75 9.4 2.0 9.0 1.92 C8.5 1.35 7.75 0.9 6.85 0.64 C6.2 0.45 5.6 0.2 5.0 -0.05',
  indexEdge: 'M5.0 -1.55 C6.3 -1.55 7.5 -1.3 8.45 -0.72 C9.25 -0.2 9.8 0.5 9.75 1.25 C9.72 1.75 9.4 2.0 9.0 1.92',
  indexIn: 'M9.0 1.92 C8.5 1.35 7.75 0.9 6.85 0.64 C6.3 0.48 5.8 0.3 5.35 0.12',
  // the thumb: its root is the ball of the thumb (no outline there), its free part lies along the index finger, nail toward us
  thumb: 'M0.9 0.6 C2.4 0.48 4.0 0.62 5.3 0.92 C6.15 1.12 6.55 1.55 6.35 1.95 C6.12 2.32 5.5 2.36 4.9 2.22 C3.8 2.0 2.4 1.78 1.2 1.45 Z',
  thumbEdge: 'M2.7 0.53 C3.6 0.6 4.5 0.74 5.3 0.92 C6.15 1.12 6.55 1.55 6.35 1.95 C6.12 2.32 5.5 2.36 4.9 2.22 C4.4 2.12 3.9 2.04 3.4 1.95'
};
function relaxHand(ctx, wrist, dir, skin, s, out, side = 1, o = {}) {
  const ang = Math.atan2(dir[1], dir[0]), S = s / 1.27, lw = (o.lw || 0.18) / S;   // (about 9 units from the wrist to the fingertip at s = 1.18)
  ctx.save(); ctx.translate(wrist[0], wrist[1]); ctx.rotate(ang); ctx.scale(S, S * side); ctx.lineCap = ctx.lineJoin = 'round';
  const litIn = -side * Math.sin(ang) < 0, g = ctx.createLinearGradient(0, litIn ? 2.4 : -1.6, 0, litIn ? -1.6 : 2.4);   // light from the upper left, like the forearm
  g.addColorStop(0, mixc(skin, '#FFE8CF', 0.22)); g.addColorStop(0.5, skin); g.addColorStop(1, mixc(skin, '#6E4E8C', 0.3));
  const crease = rgba(mixc(skin, '#5A2632', 0.6), 0.6);
  ctx.fillStyle = g; ctx.fill(P2(RH.mass + ' Z')); ctx.lineWidth = lw; ctx.strokeStyle = out; ctx.stroke(P2(RH.mass));
  line(ctx, P2('M7.5 2.15 C7.1 1.9 6.6 1.74 6.1 1.64'), crease, 0.1 / S);                                          // middle finger / ring finger
  if (o.gift) { // the box sits in the curl of the fingers (they wrap round behind it), its top against the heel of the hand
    const gb = ctx.createLinearGradient(5.2, -0.3, 9.8, 4.1); gb.addColorStop(0, '#FF9DC0'); gb.addColorStop(1, '#D9437A');
    fill(ctx, ell(4.75, 1.25, 0.48, 0.78, 0.55), '#FFE4A0'); fill(ctx, ell(4.75, 2.55, 0.48, 0.78, -0.55), '#FFE4A0');   // the bow's loops on top
    const box = P2('M5.2 -0.3 L9.8 -0.3 L9.8 4.1 L5.2 4.1 Z'); ctx.fillStyle = gb; ctx.fill(box);
    fill(ctx, P2('M5.2 1.45 L9.8 1.45 L9.8 2.35 L5.2 2.35 Z M7.05 -0.3 L7.95 -0.3 L7.95 4.1 L7.05 4.1 Z'), '#FFE4A0');
    fill(ctx, ell(5.25, 1.9, 0.36, 0.42), '#F2C46E');
    ctx.lineWidth = 0.12 / S; ctx.strokeStyle = 'rgba(150,40,80,.7)'; ctx.stroke(box);
  }
  // the index finger (in front of the others; over the box when he holds it)
  ctx.fillStyle = g; ctx.fill(P2(RH.index + ' Z')); ctx.lineWidth = lw; ctx.strokeStyle = out; ctx.stroke(P2(RH.indexEdge));
  line(ctx, P2(RH.indexIn), o.gift ? out : crease, o.gift ? lw : 0.12 / S);
  line(ctx, P2('M8.02 -0.6 Q8.24 -0.4 8.14 -0.16'), crease, 0.09 / S);                                              // its middle knuckle
  line(ctx, P2('M2.6 -1.08 C3.6 -1.18 4.5 -1.22 5.3 -1.16'), rgba(mixc(skin, '#FFE8CF', 0.5), 0.35), 0.28 / S);   // light along the back of the hand
  // the thumb, nearest to us
  const tg = ctx.createLinearGradient(0, litIn ? 2.4 : 0.4, 0, litIn ? 0.4 : 2.4); tg.addColorStop(0, mixc(skin, '#FFE8CF', 0.24)); tg.addColorStop(1, mixc(skin, '#6E4E8C', 0.12));
  ctx.fillStyle = tg; ctx.fill(P2(RH.thumb)); ctx.lineWidth = lw; ctx.strokeStyle = out; ctx.stroke(P2(RH.thumbEdge));
  const nail = ell(5.86, 1.42, 0.46, 0.26, 0.42); fill(ctx, nail, mixc(skin, '#FFE2D2', 0.45)); line(ctx, nail, rgba(mixc(skin, '#5A2632', 0.5), 0.5), 0.07 / S);
  line(ctx, P2('M4.3 0.8 Q4.47 1.02 4.4 1.24'), crease, 0.08 / S);                                                   // the thumb's knuckle
  ctx.restore();
}

// A palm-up hand seen from the thumb side, supporting something from below (his offering hands): the back of the hand along
// the bottom, the palm a shallow cup, the fingers reaching forward with their tips curling up, the thumb rising in front.
// dir = where the fingers point (keep it near level: the wrist bends); screen-up is always the palm side. ~9 units at s = 1.22.
function palmUpHand(ctx, wrist, dir, skin, s, out) {
  const ang = Math.atan2(dir[1], dir[0]), fy = Math.cos(ang) < 0 ? -1 : 1, S = s / 1.31, lw = 0.18 / S;
  ctx.save(); ctx.translate(wrist[0], wrist[1]); ctx.rotate(ang); ctx.scale(S, S * fy); ctx.lineCap = ctx.lineJoin = 'round';
  const g = ctx.createLinearGradient(0, -1.4, 0, 1.5); g.addColorStop(0, mixc(skin, '#FFE8CF', 0.22)); g.addColorStop(0.5, skin); g.addColorStop(1, mixc(skin, '#6E4E8C', 0.3));
  const crease = rgba(mixc(skin, '#5A2632', 0.6), 0.6);
  const M = 'M-1.0 1.55 C1.5 1.6 4.0 1.5 5.6 1.35 C7.0 1.2 8.4 0.95 9.3 0.5 C9.9 0.15 10.0 -0.6 9.6 -0.95 C9.3 -1.2 8.9 -1.05 8.75 -0.75 C8.55 -1.0 8.15 -1.05 7.9 -0.8 C7.4 -0.35 6.6 -0.2 5.9 -0.18 C4.5 -0.25 3.2 -0.6 2.2 -1.0 C1.2 -1.45 0.2 -1.55 -1.0 -1.55';
  ctx.fillStyle = g; ctx.fill(P2(M + ' Z')); ctx.lineWidth = lw; ctx.strokeStyle = out; ctx.stroke(P2(M));
  line(ctx, P2('M5.8 0.42 C7.0 0.35 8.2 0.15 9.15 -0.3'), crease, 0.1 / S);                                        // index finger / middle finger
  line(ctx, P2('M8.72 -0.72 C8.6 -0.5 8.45 -0.36 8.2 -0.3'), crease, 0.09 / S);                                     // a fingertip behind the index
  line(ctx, P2('M1.0 1.0 C2.6 1.14 4.0 1.16 5.2 1.06'), rgba(mixc(skin, '#6E4E8C', 0.5), 0.25), 0.3 / S);         // shade under the back of the hand
  const T = 'M1.0 -1.25 C2.3 -1.6 3.6 -2.0 4.8 -2.15 C5.4 -2.22 5.75 -1.92 5.55 -1.6 C5.25 -1.25 4.5 -1.18 3.8 -1.05 C3.0 -0.92 2.2 -0.86 1.4 -0.84 Z';
  const tg = ctx.createLinearGradient(0, -2.2, 0, -0.8); tg.addColorStop(0, mixc(skin, '#FFE8CF', 0.26)); tg.addColorStop(1, skin);
  ctx.fillStyle = tg; ctx.fill(P2(T)); ctx.lineWidth = lw; ctx.strokeStyle = out; ctx.stroke(P2('M2.4 -1.55 C3.3 -1.86 4.1 -2.08 4.8 -2.15 C5.4 -2.22 5.75 -1.92 5.55 -1.6 C5.25 -1.25 4.5 -1.18 3.8 -1.05 C3.4 -0.98 3.0 -0.93 2.6 -0.9'));
  const nail = ell(5.02, -1.9, 0.4, 0.21, -0.14); fill(ctx, nail, mixc(skin, '#FFE2D2', 0.45)); line(ctx, nail, rgba(mixc(skin, '#5A2632', 0.5), 0.5), 0.07 / S);
  ctx.restore();
}

// Fingers curled round the edge of a tree trunk, seen from the front: the hand is behind the trunk's side, so only the backs of
// the four fingers show, lying on the bark from the edge inward (toward -x in the rig's space, the trunk's side), each a little
// shorter than the middle one, nails at the tips, the knuckles bulging round the edge. w = the wrist, at the edge.
function gripFingers(ctx, w, skin, out) {
  const g = ctx.createLinearGradient(w[0] - 3.5, w[1] - 2.4, w[0] + 1.2, w[1] + 2.4); g.addColorStop(0, mixc(skin, '#FFE8CF', 0.2)); g.addColorStop(0.6, skin); g.addColorStop(1, mixc(skin, '#6E4E8C', 0.28));
  const crease = rgba(mixc(skin, '#5A2632', 0.6), 0.6), F = [[-1.62, 2.55, 0.98], [-0.56, 2.95, 1.04], [0.5, 2.8, 1.0], [1.52, 2.25, 0.9]];
  // the knuckles round the edge
  const kn = P2(`M${w[0] + 0.9} ${w[1] - 2.3} C${w[0] - 0.2} ${w[1] - 2.5} ${w[0] - 0.9} ${w[1] - 1.6} ${w[0] - 0.9} ${w[1]} C${w[0] - 0.9} ${w[1] + 1.6} ${w[0] - 0.2} ${w[1] + 2.4} ${w[0] + 0.9} ${w[1] + 2.2} Z`);
  ctx.fillStyle = g; ctx.fill(kn); ctx.lineWidth = 0.18; ctx.strokeStyle = out; ctx.stroke(kn);
  for (const [dy, L, wd] of F) {
    const y = w[1] + dy, x0 = w[0] - 0.5, x1 = x0 - L, f = P2(`M${x0} ${y - wd / 2} L${x1 + wd / 2} ${y - wd / 2 + 0.05} C${x1 - 0.05} ${y - wd / 2 + 0.05} ${x1 - 0.05} ${y + wd / 2 - 0.05} ${x1 + wd / 2} ${y + wd / 2} L${x0} ${y + wd / 2} Z`);
    ctx.fillStyle = g; ctx.fill(f); ctx.lineWidth = 0.16; ctx.strokeStyle = out; ctx.stroke(f);
    const nail = ell(x1 + 0.62, y, 0.42, wd * 0.3); fill(ctx, nail, mixc(skin, '#FFE2D2', 0.4)); line(ctx, nail, rgba(mixc(skin, '#5A2632', 0.5), 0.45), 0.06);
    line(ctx, P2(`M${x0 - L * 0.48} ${y - wd * 0.32} L${x0 - L * 0.48} ${y + wd * 0.32}`), crease, 0.08);   // the middle knuckle
  }
}

// a palm-up hand seen from the side, cupped to carry something: fingers out along dir, tips curling up, thumb on top.
// "Up" (the open side of the palm) is always screen-up, whichever way the forearm points.
function cupHand(ctx, wrist, dir, skin, s, out) {
  const ang = Math.atan2(dir[1], dir[0]), fy = Math.cos(ang) < 0 ? -1 : 1;
  ctx.save(); ctx.translate(wrist[0], wrist[1]); ctx.rotate(ang); ctx.scale(s * 1.5, s * 1.5 * fy);
  cel(ctx, P2('M-0.3 -0.75 C0.8 -0.95 1.9 -0.8 2.6 -0.62 C3.3 -0.5 3.9 -0.62 4.25 -1.15 C4.45 -0.6 4.2 0.2 3.5 0.5 C2.5 0.85 1.0 0.95 -0.3 0.78 C-0.6 0.3 -0.6 -0.35 -0.3 -0.75 Z'), skin, -0.5, 4.3, { lw: 0.09, lc: out });
  line(ctx, P2('M2.75 -0.25 Q3.45 -0.1 3.95 -0.6'), rgba(mixc(skin, '#5A2632', 0.6), 0.6), 0.08); line(ctx, P2('M2.6 0.2 Q3.3 0.38 3.75 -0.05'), rgba(mixc(skin, '#5A2632', 0.6), 0.5), 0.08);
  const th = P2('M0.5 -0.7 Q1.25 -1.5 2.15 -1.2'); ctx.lineWidth = 0.62; ctx.strokeStyle = out; ctx.stroke(th); ctx.lineWidth = 0.46; ctx.strokeStyle = skin; ctx.stroke(th);
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

// white sneakers with laces and a sole
function sneaker(ctx, ax, ay, C) {
  const sh = P2(`M${ax - 1.9} ${ay - 0.9} C${ax - 2.2} ${ay + 1.2} ${ax - 1.2} ${ay + 1.9} ${ax + 0.8} ${ay + 1.9} L${ax + 2.9} ${ay + 1.8} C${ax + 3.4} ${ay + 1.2} ${ax + 2.6} ${ay - 0.3} ${ax + 1.2} ${ay - 0.7} C${ax + 0.3} ${ay - 1.4} ${ax - 1.2} ${ay - 1.5} ${ax - 1.9} ${ay - 0.9} Z`);
  cel(ctx, sh, C.shoe, ax - 2.2, ax + 3.4, { lc: C.out, lw: 0.14, shade: '#8A96C0' });
  line(ctx, P2(`M${ax - 2.0} ${ay + 1.25} L${ax + 3.1} ${ay + 1.15}`), 'rgba(160,170,210,.9)', 0.35);
  for (let i = 0; i < 3; i++) line(ctx, P2(`M${ax - 0.2 + i * 0.6} ${ay - 0.9 + i * 0.2} L${ax + 0.6 + i * 0.6} ${ay - 0.4 + i * 0.2}`), '#9DB4E6', 0.18);
}

// a white sneaker seen from behind: the heel cup and its tab, the sole; when the heel is up (toe-off) the underside of the sole shows
function sneakerBack(ctx, ax, ay, pitch, C) {
  const up = Math.max(0, -pitch), k = 1 - up * 0.18;
  if (up > 0.15) fill(ctx, P2(`M${ax - 2.1} ${ay + 0.9} C${ax - 2.1} ${ay + 2.6 + up} ${ax + 2.1} ${ay + 2.6 + up} ${ax + 2.1} ${ay + 0.9} Z`), '#C9CBDD');   // the sole, tilted toward us
  const sh = P2(`M${ax - 2.2 * k} ${ay - 1.7} C${ax - 2.6 * k} ${ay + 0.6} ${ax - 2.0 * k} ${ay + 1.6} ${ax} ${ay + 1.7} C${ax + 2.0 * k} ${ay + 1.6} ${ax + 2.6 * k} ${ay + 0.6} ${ax + 2.2 * k} ${ay - 1.7} Z`);
  cel(ctx, sh, C.shoe, ax - 2.6, ax + 2.6, { lc: C.out, lw: 0.14, shade: '#8A96C0' });
  line(ctx, P2(`M${ax - 2.3 * k} ${ay + 1.2} L${ax + 2.3 * k} ${ay + 1.2}`), 'rgba(160,170,210,.9)', 0.4); line(ctx, P2(`M${ax} ${ay - 1.6} L${ax} ${ay + 0.4}`), 'rgba(150,160,205,.7)', 0.3);
}

// =====================================================================================  HELEN (seated on the sea wall)
// Helen after the user's photo (2026-11-23): warm brown skin, big dark-brown eyes with soft kohl, a small bindi, silver jhumka
// earrings, loose wavy near-black hair parted in the middle and falling to her chest, a gentle smile; a cream long-sleeve top
// with a round neck and a small print of yellow flowers on green sprigs; high-waisted wide-leg blue jeans, white sneakers, a watch
const HC = { skin: '#CF9467', skinD: '#A46A43', hair: '#1D1311', hairHi: '#5E4234', sheen: '#9C735C', top: '#F8F4EA', topD: '#D8D1C1', topL: '#FFFEF8',
  jean: '#5276AE', jeanD: '#3A5A8E', jeanL: '#7898CC', stitch: '#D2A65C', strap: '#6B4226', flowers: ['#E8B53A', '#F2C94C', '#DDA22C', '#F5D667'], leaf: '#6F8C3F',
  dress: '#F8F4EA', dressL: '#FFFEF8', collar: '#EFE8DA', shoe: '#FBFBFF', lip: '#B85C5E', blush: '#E07A80', iris: '#3A2216', irisL: '#B8804E', lash: '#120C0A', out: 'rgba(84,46,32,.72)',
  silver: '#DCDCE6', silverD: '#9A98AA', bindi: '#2A0E12' };
// a few little flowers of the print, clipped to a garment path by the caller
function floralPrint(ctx, x0, y0, x1, y1, n, seed, s = 0.55) {
  let r = seed * 9301 + 49297;
  const rnd = () => { r = (r * 9301 + 49297) % 233280; return r / 233280; };
  for (let i = 0; i < n; i++) {
    const x = x0 + (x1 - x0) * rnd(), y = y0 + (y1 - y0) * rnd(), c = HC.flowers[Math.floor(rnd() * 4)];
    const a = rnd() * 6.28, b = a + 2.2 + rnd() * 0.8;   // the sprig first: a thin stem and two leaves
    line(ctx, P2(`M${x} ${y} L${x + Math.cos(a) * s * 2.2} ${y + Math.sin(a) * s * 2.2}`), rgba('#4F6A2C', 0.8), s * 0.16);
    fill(ctx, ell(x + Math.cos(a) * s * 1.55, y + Math.sin(a) * s * 1.55, s * 0.62, s * 0.26, a), HC.leaf); fill(ctx, ell(x + Math.cos(b) * s * 1.35, y + Math.sin(b) * s * 1.35, s * 0.55, s * 0.24, b), HC.leaf);
    for (let k = 0; k < 5; k++) { const q = k * 1.2566 + rnd(); fill(ctx, ell(x + Math.cos(q) * s * 0.72, y + Math.sin(q) * s * 0.72, s * 0.5, s * 0.5), c); }
    fill(ctx, ell(x, y, s * 0.3, s * 0.3), '#9A6418');
  }
}
// a back pocket of the jeans: a pentagon with gold top-stitching
function jeanPocket(ctx, cx, cy, w, h) {
  const p = P2(`M${cx - w / 2} ${cy - h / 2} L${cx + w / 2} ${cy - h / 2} L${cx + w * 0.46} ${cy + h * 0.28} L${cx} ${cy + h / 2} L${cx - w * 0.46} ${cy + h * 0.28} Z`);
  fill(ctx, p, rgba(HC.jeanD, 0.35)); line(ctx, p, HC.stitch, 0.16);
}
// wavy hair: offset a strand's centre line sideways with a soft wave that grows toward the tip
function waveStrand(pts, amp, ph) {
  return pts.map((q, i) => { const u = i / Math.max(1, pts.length - 1); return [q[0] + Math.sin(u * 7.0 + ph) * amp * (0.25 + 0.75 * u), q[1]]; });
}
// a silver jhumka: a small stud, a domed bell with a fringe of tiny pearls; it sways with her head
function jhumka(ctx, x, y, k, t) {
  const sw = Math.sin(t * 2.3) * 0.12; ctx.save(); ctx.translate(x, y); ctx.rotate(sw); ctx.scale(k, k);
  fill(ctx, ell(0, 0, 0.32, 0.32), HC.silver); line(ctx, P2('M0 0.3 L0 0.75'), HC.silverD, 0.1);
  const bell = P2('M-0.75 1.85 C-0.75 1.1 -0.4 0.75 0 0.75 C0.4 0.75 0.75 1.1 0.75 1.85 Z'); fill(ctx, bell, HC.silver); line(ctx, bell, HC.silverD, 0.08);
  fill(ctx, P2('M-0.45 1.3 C-0.3 1.0 -0.1 0.95 0 0.95 C-0.12 1.1 -0.25 1.3 -0.3 1.6 Z'), 'rgba(255,255,255,.8)');
  for (let i = 0; i < 5; i++) fill(ctx, ell(-0.6 + i * 0.3, 2.08, 0.15, 0.15), i % 2 ? '#FFFFFF' : '#EDEAF4');
  ctx.restore();
}
// the flashback poses (front view, standing): [elbow, wrist] per arm (near = her right arm, screen left), the teddy's
// seat p, finger curl, palm-up cupped hands, head tilt toward the teddy
const STAND_POSES = {
  // receiving: elbows bent and low by her sides, forearms forward, both palms up side by side under the teddy (the elbows are
  // given, not solved: a solved arm folded up with its elbow sticking out sideways)
  standReceive: { near: [[-5.4, -12.6], [5.6, -14.0]], far: [[8.8, -12.4], [19.4, -14.8]], p: [14.4, -15.4], curl: [0.4, 0.4], cup: true, tilt: 0.04, fixed: true },
  standHug: { near: [[-8.6, -14.6], [2.6, -12.8]], far: [[9.6, -16.4], [0.2, -17.6]], p: [2.6, -13.2], curl: [0.85, 0.85], cup: false, tilt: 0.12, farOver: true }
};
export class Helen {
  static RECEIVE_P = STAND_POSES.standReceive.p;   // where the teddy sits in her receiving hands (the film hands it over to here)
  static STAND_GROUND = 43;   // standing (st.stand): the soles of her sneakers, in her units (seated: the seat is y = 0)
  constructor() {
    this.hair = []; for (let i = 0; i < 9; i++) this.hair.push(new Chain(8, 2.75 + (i % 3) * 0.2, { drag: 1.5, grav: 300, bend: 0.8, iter: 4, lift: 0.03 }));
    this.locks = [new Chain(6, 2.9, { drag: 2.4, grav: 240, bend: 0.8 }), new Chain(6, 3.0, { drag: 2.4, grav: 240, bend: 0.8 })];
    this.bowT = [new Chain(4, 1.7, { drag: 2.8, grav: 180, bend: 0.5 }), new Chain(4, 1.9, { drag: 2.8, grav: 180, bend: 0.5 })];
    this.sashT = [new Chain(6, 2.1, { drag: 2.6, grav: 200, bend: 0.5 }), new Chain(6, 2.4, { drag: 2.6, grav: 200, bend: 0.5 })];
    this.hem = new Hem(9, { drag: 3.2, grav: 200, stiff: 0.3 });
    this.blinkT = 2; this.blink = 0; this.look = new Spring(30, 9); this.laugh = new Spring(16, 7); this.turnS = new Spring(22, 8.5); this.gzS = new Spring(70, 14); this.hcS = new Spring(20, 8); this.huS = new Spring(26, 9); this.hu = 0;
    this.bounds = [-34, -56, 40, 47]; this.tn = 0; this.gz = 0; this.hc = 0;
    // back view: per-lock breeze sway, head / body turn and smile (springs, so a stepped st value still moves softly)
    this.bk = { sw: Array.from({ length: 9 }, () => new Spring(24, 4.4)), ht: new Spring(14, 7.4), bt: new Spring(10, 6.2), sm: new Spring(14, 7.2) };
    this.ht = 0; this.bt = 0; this.sm = 0; this.thS = new Spring(14, 7.2); this.th = 0;
  }
  // st: { t, dt, wind (local units/s), expr: calm|smile|joyful|surprised|teary|closed, lookUp 0..1, pet: [lx,ly]|null, eyeLights,
  //       back: true = seen from behind, sitting on the wall facing the sea (drawBack)
  //       headTurn 0..1, bodyTurn 0..1, turnDir +1|-1, smile 0..1   (back view: turning toward someone on her right (+1) / left (-1);
  //            headTurn 1 = lost profile (cheek line, lashes, a hint of nose), bodyTurn adds a little shoulder turn; smile shows on the cheek)
  //       cradle: fn(ctx, p, o) – Snowki held in her lap / arms, both views (replaces st.lap). The callback translates to p = [x, y]
  //            (his seat, Helen units) and scales by SN * o.s (o.s = 0.72: a little smaller than beside her, so he sits in her lap);
  //            o.back = true when she is drawn from behind. Drawing him FACING US reads best in both views (from behind his face peeks
  //            out beside her right arm; her forearm lies across him, her hand on his side). Her arms are posed for it automatically.
  //       stand: true + pose 'standReceive' | 'standHug' + held: fn(ctx, p, o) (same contract, o.s = 0.72) – the flashback, standing,
  //            facing screen right; her soles are at y = +32.4 (Helen.STAND_GROUND). See standArms().
  //       headTilt (front view, radians, + = toward screen right); front view also: turn -1..1 (+ = toward screen right), gaze -1..1,
  //            handChest, handsUp, armT: [[x,y],[x,y]] }
  update(st) {
    const dt = st.dt, t = st.t;
    { const B = this.bk, h = clamp(dt, 0, 0.05), wv = clamp((st.wind || 0) * 0.011, -2.2, 2.2);
      this.ht = B.ht.step(h, clamp(st.headTurn || 0, 0, 1)); this.bt = B.bt.step(h, clamp(st.bodyTurn || 0, 0, 1));
      this.sm = B.sm.step(h, clamp(st.smile != null ? st.smile : st.expr === 'smile' || st.expr === 'joyful' ? 1 : 0, 0, 1));
      B.sw.forEach((s, i) => s.step(h, wv * (0.55 + 0.45 * noise2(i * 0.73, t * 0.45 + i * 1.7))));
      this.th = this.thS.step(h, st.stand && STAND_POSES[st.pose] ? STAND_POSES[st.pose].tilt : st.headTilt || 0); }
    this.blinkT -= dt; if (this.blinkT < 0) { this.blink = 0.14; this.blinkT = 2.2 + Math.random() * 3.4; } this.blink = Math.max(0, this.blink - dt);
    const lu = this.look.step(dt, st.lookUp || 0), la = this.laugh.step(dt, st.expr === 'joyful' ? 1 : 0);
    this.tn = this.turnS.step(dt, st.turn || 0); this.gz = this.gzS.step(dt, st.gaze != null ? st.gaze : (st.turn || 0)); this.hc = this.hcS.step(dt, st.handChest || 0); this.hu = this.huS.step(dt, st.handsUp || 0);
    const head = this.headXf(t, lu, la, this.tn), w = st.wind;
    // hair roots around the back of the head (in head space) -> body space
    const roots = [];
    for (let i = 0; i < 9; i++) { const a = -2.55 + i * 0.2; roots.push(head.p(0.4 + Math.cos(a) * 5.4, -38.6 + Math.sin(a) * 5.6)); }
    const col = st.back ? (c, i) => { if (c.y[i] > -4) c.y[i] = -4; } : (c, i) => { const x = c.x[i], y = c.y[i]; if (y > -27 && y < 0 && x > -6.2 && x < 6.6) { c.x[i] = x < 0.2 ? Math.min(x, -6.2) : Math.max(x, 6.6); } if (y > 2) c.y[i] = 2; };
    // long hair: heavy, sways rather than flies. On the first frame and whenever the view flips (back <-> front: a cut), the
    // strands are settled into the new pose without inertia – otherwise the collision would fling them out like wings.
    const settle = this.lastBack !== !!st.back; this.lastBack = !!st.back;
    for (let it = 0, n = settle ? 36 : 1; it < n; it++) {
      this.hair.forEach((c, i) => c.step(settle ? 1 / 60 : dt, roots[i][0], roots[i][1], w * 0.45, t + i * 0.3, col));
      if (settle) this.hair.forEach(c => { c.px.set(c.x); c.py.set(c.y); });
    }
    const l0 = head.p(-5.3, -39.8), l1 = head.p(6.1, -39.6);
    { const f = this.tn * 1.3;   // the side-locks frame her face: they never swing across it
      this.locks[0].step(dt, l0[0], l0[1], w * 0.6, t, (c, i) => { const y = c.y[i], lim = (y < -31 ? -5.4 : -4.7) + f; if (y < -26 && c.x[i] > lim) c.x[i] = lim; });
      this.locks[1].step(dt, l1[0], l1[1], w * 0.6, t + 1, (c, i) => { const y = c.y[i], lim = (y < -31 ? 6.4 : 5.6) + f; if (y < -26 && c.x[i] < lim) c.x[i] = lim; }); }
    const bw = head.p(-5.4, -43.6); this.bowT[0].step(dt, bw[0], bw[1], w, t + 2); this.bowT[1].step(dt, bw[0] + 0.3, bw[1] + 0.2, w, t + 2.5);
    this.sashT[0].step(dt, 6.6, -11.4, w * 0.8, t + 3); this.sashT[1].step(dt, 6.9, -11.2, w * 0.8, t + 3.4);
    const anch = [], rest = [];
    for (let i = 0; i < 9; i++) { const u = i / 8, a = [lerp(-15.0, -1.4, u), lerp(4.6, 7.4, u) + Math.sin(u * Math.PI) * 0.8]; anch.push(a); rest.push([a[0] - 0.5, a[1] + 6.4 + Math.sin(u * Math.PI) * 0.9]); }
    this.hem.step(dt, anch, rest, w * 0.5, t);
    this.headX = head; this.lu = lu; this.la = la;
  }
  headXf(t, lu, la, tn = 0) {
    const piv = [0.6, -29.6], bob = -Math.abs(Math.sin(t * 9)) * 0.55 * la + Math.sin(t * 1.6) * 0.15;
    const ang = -0.17 * lu + 0.05 * la * Math.sin(t * 9) + Math.sin(t * 0.8) * 0.015 - 0.04 * la + tn * 0.07 + (this.th || 0);
    const c = Math.cos(ang), s = Math.sin(ang);
    return { ang, bob, p: (x, y) => { const dx = x - piv[0], dy = y - piv[1]; return [piv[0] + dx * c - dy * s, piv[1] + bob + dx * s + dy * c]; }, apply(ctx) { ctx.translate(piv[0], piv[1] + bob); ctx.rotate(ang); ctx.translate(-piv[0], -piv[1]); } };
  }
  draw(ctx, st) {
    if (st.back) { this.drawBack(ctx, st); return; }
    const C = HC, t = st.t, la = this.la || 0, lu = this.lu || 0, breathe = Math.sin(t * 1.6) * 0.22 - Math.abs(Math.sin(t * 9)) * 0.4 * la;
    // ---- back hair (behind everything): thick tapered ribbons per strand + the back of the skull
    const head = this.headX;
    ctx.save(); head.apply(ctx); fill(ctx, ell(0.5, -38.6, 7.0, 7.3), C.hair); ctx.restore();
    const strands = this.hair.map((c, k) => { const pts = []; for (let i = 0; i < c.n; i++) pts.push([c.x[i], c.y[i]]); return waveStrand(pts, 1.3, k * 1.3); });
    for (let k = 0; k < strands.length; k++) {
      const pts = strands[k], wd = pts.map((_, i) => 4.7 * (1 - i / pts.length * 0.62)); const r = ribbon(pts, wd);
      cel(ctx, r.path, k % 2 ? C.hair : mixc(C.hair, '#3B2620', 0.6), -10, 14, { line: false, shade: '#120806' });
    }
    for (let k = 0; k < strands.length; k += 2) line(ctx, smooth(strands[k], false), rgba(C.hairHi, 0.5), 0.3);
    if (st.stand) this.standLower(ctx, t, st);
    else {
    // ---- legs in wide-leg jeans: knees to the side over the edge of the wall, the hems swinging idly over the sneakers
    for (const [kx, ky, ph, len] of [[-11.8, 4.2, 0, 15.6], [-3.6, 6.4, 1.7, 15.2]]) {
      const ax = kx + 0.5 + Math.sin(t * 1.25 + ph) * 0.9, ay = ky + len - Math.abs(Math.sin(t * 1.25 + ph)) * 0.6;
      limb(ctx, [kx, ky - 1.2], [lerp(kx, ax, 0.38), lerp(ky, ay, 0.38)], [ax, ay - 0.9], [4.7, 4.4, 4.3, 4.7, 5.3], C.jean, C.out, { lw: 0.16 });   // (wide-leg jeans: as wide as the knee, flaring to the hem)
      line(ctx, P2(`M${kx + 1.2} ${ky} L${ax + 1.4} ${ay - 1.2}`), rgba(C.jeanL, 0.55), 0.35);                    // the crease catching the light
      sneaker(ctx, ax, ay + 0.3, C);
    }
    // ---- the lap: high-waisted jeans over her thighs, knees turned to the side
    const lapP = smooth([[-6.4, -11.6], [-8.6, -7.4], [-11.6, -3.4], [-14.4, 0.6], [-14.6, 4.4], [-11.0, 5.2], [-5.6, 7.4], [-1.8, 7.6], [1.4, 5.2], [5.4, 2.4], [8.8, 0.8], [9.8, -3.0], [8.6, -7.4], [6.4, -11.6]], true);
    cel(ctx, lapP, C.jean, -14.6, 9.8, { lc: C.out, shade: '#2C3E72' });
    ctx.save(); ctx.clip(lapP);
    const lap = ctx.createLinearGradient(2, -9, -6, 9); lap.addColorStop(0, 'rgba(255,255,255,0)'); lap.addColorStop(0.45, 'rgba(200,220,255,.28)'); lap.addColorStop(0.7, 'rgba(255,255,255,.06)'); lap.addColorStop(1, 'rgba(20,30,80,.3)');
    ctx.fillStyle = lap; ctx.fillRect(-17, -12, 30, 26);
    line(ctx, P2('M3.5 -6 C0 -2 -4 1 -9 2.4'), rgba(C.jeanD, 0.85), 0.42);                          // where her thighs meet
    line(ctx, P2('M5.2 -10.4 C4.8 -7 2.8 -4.6 0.6 -3.4'), C.stitch, 0.16);                             // front pocket and fly stitching
    line(ctx, P2('M0.6 -10.6 C0.4 -8 0.2 -6.4 -0.4 -5.0'), C.stitch, 0.14);
    for (const [x0, y0, x1, y1] of [[-12.0, -0.6, -9.2, 2.8], [-6.2, 2.8, -3.0, 5.4]]) line(ctx, P2(`M${x0} ${y0} Q${(x0 + x1) / 2 - 0.6} ${(y0 + y1) / 2 + 0.8} ${x1} ${y1}`), rgba(C.jeanL, 0.6), 0.32);   // folds at the knees
    ctx.restore();
    }
    // ---- torso: the cream top (crew neck, long sleeves, little flowers), tucked into the jeans' waistband
    ctx.save(); ctx.translate(st.stand ? this.lowSway || 0 : 0, breathe * 0.5);
    cel(ctx, P2('M-1.8 -31.4 L-2.0 -26.4 C-0.8 -25.6 1.6 -25.6 2.6 -26.2 L2.2 -31.0 Z'), C.skin, -2, 2.6, { line: false });
    fill(ctx, ell(0.5, -30.6, 2.6, 0.9), 'rgba(110,50,40,.3)');
        const bod = smooth([[-2.8, -27.6], [-6.2, -27.2], [-7.5, -25.8], [-7.7, -22.6], [-7.3, -19.0], [-6.2, -15.8], [-5.5, -13.2], [-5.7, -11.6], [5.9, -11.6], [5.7, -13.2], [6.5, -15.8], [7.7, -19.0], [8.1, -22.6], [8.0, -25.8], [6.4, -27.2], [3.4, -27.6], [0.4, -26.6]], true);
    cel(ctx, bod, C.top, -7.4, 7.8, { lc: C.out, shade: '#8F8098' });
    ctx.save(); ctx.clip(bod);
    floralPrint(ctx, -7, -26.5, 8, -12.6, 16, 3);
    line(ctx, P2('M-3.4 -24 C-3.0 -19 -3.4 -15 -3.6 -11.8'), rgba(C.topD, 0.8), 0.32); line(ctx, P2('M4.4 -24 C4.0 -19 4.4 -15 4.6 -11.8'), rgba(C.topD, 0.8), 0.32);
    ctx.restore();
    line(ctx, P2('M-2.9 -27.5 C-1.6 -26.2 1.6 -26.0 3.5 -27.5'), C.topD, 0.45);                              // the crew neckline
    // the jeans' high waistband with its button and belt loops
    cel(ctx, P2('M-5.8 -13.4 Q0.4 -12.9 6.3 -13.4 L7.1 -10.2 Q0.4 -9.7 -7.0 -10.2 Z'), C.jean, -6, 6.6, { lc: C.out, lw: 0.15, shade: '#2C3E72' });
    line(ctx, P2('M-6.4 -11.8 Q0.4 -11.3 6.7 -11.8'), C.stitch, 0.12);
    for (const x of [-4.4, 4.6]) fill(ctx, P2(`M${x - 0.3} -13.2 L${x + 0.3} -13.2 L${x + 0.3} -10.3 L${x - 0.3} -10.3 Z`), C.jeanD);
    fill(ctx, ell(0.9, -11.7, 0.42, 0.42), '#C8A060');
    ctx.restore();
    // ---- Snowki in her lap (drawn by the film with his own rig, so he is the same teddy when he comes alive)
    if (st.lap) st.lap(ctx);
    if (st.cradle && !st.stand) st.cradle(ctx, [-4.6, -3.0], { back: false, s: 0.72 });   // on her thighs, held in both arms (see the arms below)
    // ---- head
    ctx.save(); head.apply(ctx);
    this.drawHead(ctx, st);
    ctx.restore();
    // front side-locks (simulated) over the shoulders
    for (const [li, c] of this.locks.entries()) { let pts = []; for (let i = 0; i < c.n; i++) pts.push([c.x[i], c.y[i]]); pts = waveStrand(pts, 0.75, li * 2.1 + 0.6); cel(ctx, ribbon(pts, pts.map((_, i) => 1.9 * (1 - i / (c.n - 1) * 0.85))).path, C.hair, -6, 8, { line: false, shade: '#000000' }); line(ctx, smooth(pts.slice(0, -1), false), rgba(C.hairHi, 0.45), 0.2); }
    // ---- arms: left hugs Snowki, right pets Jessi (IK) or meets the other hand in wonder
    const sL = [-7.0, -25.2 + breathe * 0.5], sR = [7.4, -25.2 + breathe * 0.5];
    const crd = st.cradle && !st.stand;   // cradling Snowki: her right hand round his far side, her left forearm across him, the hand on his side
    let aL = crd ? [sL, [-11.8, -16.2], [-9.8, -7.4]] : st.lap ? [sL, [-11.4, -16.6], [-9.0, -10.8]] : ik(sL, [-6.4, -3.6], HUA, HFA, 1);
    let aR = st.pet ? ik(sR, st.pet, HUA, HFA, 1) : crd ? [sR, [8.4, -16.4], [1.4, -9.0]] : st.lap ? [sR, [10.0, -16.0], [3.4, -9.8]] : ik(sR, [-2.2, -5.0], HUA, HFA, -1);
    if (st.armT) { aL = ik(sL, st.armT[0], HUA, HFA, 1); aR = ik(sR, st.armT[1], HUA, HFA, -1); }
    { const k = clamp(Math.max(this.hc, st.expr === 'surprised' || st.expr === 'teary' ? lu : 0), 0, 1); aR = [sR, [lerp(aR[1][0], 8.4, k), lerp(aR[1][1], -16.5, k)], [lerp(aR[2][0], 1.6, k), lerp(aR[2][1], -20.5, k)]]; }
    { const k = clamp(this.hu, 0, 1), tw = Math.sin(t * 7) * 0.25 * k;   // both hands up to her mouth in excitement
      if (k > 0.01) { aL = [sL, [lerp(aL[1][0], -8.8, k), lerp(aL[1][1], -17.6, k)], [lerp(aL[2][0], -1.4, k), lerp(aL[2][1], -31.2 + tw, k)]]; aR = [sR, [lerp(aR[1][0], 9.0, k), lerp(aR[1][1], -17.6, k)], [lerp(aR[2][0], 3.4, k), lerp(aR[2][1], -31.0 - tw, k)]]; } }
    if (st.stand && STAND_POSES[st.pose]) { this.standArms(ctx, st, sL, sR); return; }
    this.frontArm(ctx, aL, -1, 0.45); this.frontArm(ctx, aR, 1, st.pet ? 0.1 : 0.45);
  }
  // one front-view arm: shaped limb, a hand (hand2, or a palm-up cupped hand), the puff sleeve and its band
  frontArm(ctx, j, side, curl = 0.45, cup = false) {   // a long cream sleeve to the wrist (a soft cuff), the hand; her watch on the left wrist
    const C = HC, [a, b, c] = j;
    const d = [c[0] - b[0], c[1] - b[1]], l = Math.hypot(d[0], d[1]) || 1, w = [c[0] - d[0] / l * 0.25, c[1] - d[1] / l * 0.25];
    if (cup) palmUpHand(ctx, w, [d[0] >= 0 ? 1 : -1, -0.12], C.skin, 0.95, C.out); else hand2(ctx, w, d, C.skin, 0.92, C.out, side < 0 ? -1 : 1, curl);
    const cuff = [c[0] - d[0] / l * 1.0, c[1] - d[1] / l * 1.0];
    limb(ctx, a, b, cuff, [3.7, 3.45, 3.0, 2.85, 2.45], C.top, C.out, { lw: 0.16 });
    const ang = Math.atan2(d[1], d[0]) + Math.PI / 2, ca = Math.cos(ang), sa = Math.sin(ang);
    line(ctx, P2(`M${cuff[0] - ca * 1.3} ${cuff[1] - sa * 1.3} L${cuff[0] + ca * 1.3} ${cuff[1] + sa * 1.3}`), C.topD, 0.5);
    if (side > 0) { const wp = [c[0] - d[0] / l * 0.45, c[1] - d[1] / l * 0.45];
      const dn = [d[0] / l, d[1] / l]; line(ctx, P2(`M${wp[0] - ca * 1.1} ${wp[1] - sa * 1.1} Q${wp[0] + dn[0] * 0.4} ${wp[1] + dn[1] * 0.4} ${wp[0] + ca * 1.1} ${wp[1] + sa * 1.1}`), C.strap, 0.5);   // the strap round her wrist
      fill(ctx, ell(wp[0] + ca * 0.15 + dn[0] * 0.25, wp[1] + sa * 0.15 + dn[1] * 0.25, 0.55, 0.55), '#2A2A30'); }
    const m = [a[0] + (b[0] - a[0]) * 0.4, a[1] + (b[1] - a[1]) * 0.4];
    ctx.save(); ctx.clip(limbPath(a, b, cuff, [3.7, 3.45, 3.0, 2.85, 2.45])); floralPrint(ctx, m[0] - 3, m[1] - 4, m[0] + 3, m[1] + 6, 3, side + 7, 0.45); ctx.restore();
  }
  // The flashback, standing and facing screen right (3/4): st.pose 'standReceive' – both hands forward together at chest
  // height, palms up, carrying the teddy; 'standHug' – hugging it to her chest (use expr 'joyful' or 'smile').
  // st.held(ctx, p, o) draws the teddy with its seat at p (Helen units), o = { s: 0.72 } (scale relative to the film's
  // Snowki). Draw order: far arm, teddy, near arm – so her fingers really wrap / support him.
  standArms(ctx, st, sL, sR) {
    const P = STAND_POSES[st.pose], held = st.held, far = P.fixed ? [sR, P.far[0], P.far[1]] : ik(sR, P.far[1], HUA, HFA, -1), near = P.fixed ? [sL, P.near[0], P.near[1]] : ik(sL, P.near[1], HUA, HFA, 1);
    if (!P.farOver) this.frontArm(ctx, far, 1, P.curl[1], P.cup);
    if (held) held(ctx, P.p, { s: 0.72, back: false });
    if (P.farOver) this.frontArm(ctx, far, 1, P.curl[1], P.cup);   // hugging: both arms wrap over him
    this.frontArm(ctx, near, -1, P.curl[0], P.cup);
  }
  // ------------------------------------------------------------------ BACK VIEW
  // Seated: her knees turn right and her legs hang out of sight. Standing uses standBackLower so her feet remain visible.
  // Her half-up hair and blue bow frame separate locks to the waist; head/body turn gradually reveals her profile.
  drawBack(ctx, st) {
    const C = HC, t = st.t, B = this.bk, dir = st.turnDir === -1 ? -1 : 1, ht = this.ht || 0, bt = this.bt || 0, sm = this.sm || 0;
    const lu = this.lu || 0, la = this.la || 0, breathe = Math.sin(t * 1.6) * 0.22, sh = breathe * 0.5, cr = st.cradle;
    const phi = (ht * 0.98 + bt * 0.3) * dir, ph = Math.abs(phi), bs = bt * dir, sx = -1.3 * bs;   // head yaw (rad, + = toward screen right), body yaw, spine shift
    const k = ss((ph - 0.12) / 0.8), kn = clamp((ph - 0.95) / 0.3, 0, 1), sw = i => B.sw[i].x;
    const hc = [0.5 + sx * 0.35, -38.8 + lu * 0.9 - Math.abs(Math.sin(t * 9)) * 0.4 * la + Math.sin(t * 1.6) * 0.12 + sh];
    const sL = [-7.2 - bs * 0.2 + sx * 0.3, -25.2 + sh], sR = [7.7 - bs * 0.6 + sx * 0.3, -25.2 + sh];
    // left hand planted on the wall beside her hip; right hand resting on her right thigh (or round Snowki)
    // (arms: seen from behind a bent arm is foreshortened, so the elbow sits near the middle of the shoulder -> wrist line)
    const mid = (a, b, s) => [lerp(a[0], b[0], 0.5) + s * 1.7, lerp(a[1], b[1], 0.5) - 0.4];
    let eL, wL, eR, wR, hsL = 0.92, hsR = 0.92;
    if (st.stand && cr) { eL = [-8.4 + sx * 0.15, -18.2]; wL = [-3.6, -18.5]; eR = [8.4 + sx * 0.2, -18.2]; wR = [3.6, -18.5]; }
    else if (st.stand) {   // standing / walking away: the arms swing from the shoulder against the legs; a forward swing shows as the hand riding higher
      const u = (Number.isFinite(st.walkPhase) ? st.walkPhase : 0) / (Math.PI * 2), amp = st.walking ? 0.32 : 0.03;
      const swing = (sh, s, ph) => { const A = armSwing(ph, amp, 0.25), z1 = HUA * Math.sin(A.sh), y1 = HUA * Math.cos(A.sh), z2 = z1 + HFA * Math.sin(A.sh + A.el), y2 = y1 + HFA * Math.cos(A.sh + A.el);
        return [[sh[0] + s * 2.1, sh[1] + y1 - 0.21 * z1], [sh[0] + s * 2.9, sh[1] + y2 - 0.21 * z2]]; };
      [eL, wL] = swing(sL, -1, u + 0.5); [eR, wR] = swing(sR, 1, u);
    } else {   // sitting: both hands rest on the coping beside her hips (the near / left side of the slanted seat is lower), fingers toward the edge
      wL = [-10.6 + sx * 0.15, -1.6]; eL = mid(sL, wL, -1); hsL = 0.78;
      if (cr) { eR = [9.0 + sx * 0.2, -14.4]; wR = [15.0, -6.6]; } else { wR = [10.6 + sx * 0.2 - bs * 0.3, -5.4]; eR = mid(sR, wR, 1); hsR = 0.78; }
    }
    // Snowki on her lap (over her right thigh): farther from us than her back, so her skirt, body and arm come over him –
    // his head and ears peek out beside her arm, her forearm lies across his tummy / back below his head
    if (cr) cr(ctx, st.stand ? [0, -18.5] : [12.8, -1.6], { back: true, s: 0.72 });
    // (her forearms point forward into her lap, straight away from us: hidden behind the elbows and her body)
    // ---- the skirt on the wall, bulging over her right thigh toward the knee
    if (st.stand) this.standBackLower(ctx, t, st);
    else {
      // sitting on the wall's coping. The wall runs along our line of sight, so its top recedes to the right: the seat line is slanted
      // (her left hip nearer and lower, her right hip farther and higher). She rests on it with her thighs running away from us under her back
      // and her legs hanging on the sea side, out of sight – nothing hangs out over the face of the wall.
      const yb = x => 2.2 - 0.3385 * x;
      { const sg = ctx.createRadialGradient(0, 0, 0, 0, 0, 14); sg.addColorStop(0, 'rgba(40,24,70,.42)'); sg.addColorStop(1, 'rgba(40,24,70,0)'); ctx.save(); ctx.translate(0, 1.4); ctx.transform(1, -0.3385, 0, 0.3, 0, 0); ctx.fillStyle = sg; ctx.fillRect(-15, -15, 30, 30); ctx.restore(); }
      const hipP = smooth([[-5.5, -13.3], [6.2, -13.3], [7.9, -9.0], [8.7, -4.0], [8.5, yb(8.5) - 0.3], [5.0, yb(5) - 1.2], [0, yb(0) - 0.6], [-5.0, yb(-5) - 0.5], [-8.2, yb(-8.2) - 0.4], [-9.1, yb(-9) - 3.2], [-8.9, -3.5], [-8.1, -8.6]], true);
      cel(ctx, hipP, C.jean, -9.2, 8.8, { lc: C.out, shade: '#2C3E72', lw: 0.16 });
      ctx.save(); ctx.clip(hipP);
      { const g = ctx.createLinearGradient(0, -13, 0, -5); g.addColorStop(0, 'rgba(20,30,80,.28)'); g.addColorStop(1, 'rgba(20,30,80,0)'); ctx.fillStyle = g; ctx.fillRect(-10, -14, 20, 9); }
      line(ctx, P2('M0.3 -13 C0.4 -8 0.3 -2 0.2 3.2'), rgba(C.jeanD, 0.9), 0.32);                                // centre seam
      jeanPocket(ctx, -3.4, -6.4, 4.4, 4.6); jeanPocket(ctx, 4.0, -6.4, 4.4, 4.6);
      line(ctx, P2('M-5.9 -12.9 L0.3 -9.6 L6.4 -12.9'), C.stitch, 0.14);                                       // the yoke
      for (const [x0, y0, x1, y1] of [[-8.6, -9, -5.4, -7.2], [8.4, -8, 5.4, -6.4]]) line(ctx, P2(`M${x0} ${y0} Q${(x0 + x1) / 2} ${(y0 + y1) / 2 + 0.8} ${x1} ${y1}`), rgba(C.jeanD, 0.45), 0.3);   // the folds where she sits
      line(ctx, P2(`M-8.4 ${yb(-8.4) - 0.9} Q0 ${yb(0) + 0.3} 8.6 ${yb(8.6) - 1.0}`), rgba(C.jeanD, 0.7), 0.35);   // where the seat meets the stone
      line(ctx, P2('M-8.0 -7 C-8.7 -4 -8.4 -1 -7.2 1.2'), 'rgba(255,255,255,.2)', 0.5);                       // moonlight on her left hip
      ctx.restore();
    }
    // ---- bodice (turns a little with her shoulders), collar, belt
    ctx.save(); ctx.translate(sx * 0.4 + 0.5 + (st.stand ? this.lowSway || 0 : 0), sh); ctx.scale(1 - Math.abs(bs) * 0.05, 1); ctx.translate(-0.5, 0);
        const bod = smooth([[-2.9, -28.0], [-5.9, -27.5], [-7.4, -25.9], [-7.6, -22.6], [-7.3, -18.8], [-6.3, -15.6], [-5.6, -13.0], [-5.8, -11.8], [6.2, -11.8], [6.0, -13.0], [6.7, -15.6], [7.6, -18.8], [8.2, -22.6], [8.2, -25.9], [6.6, -27.5], [3.6, -28.0], [0.5, -28.5]], true);
    cel(ctx, bod, C.top, -7.4, 8.0, { lc: C.out, shade: '#8F8098' });
    ctx.save(); ctx.clip(bod);
    { const g = ctx.createLinearGradient(0, -20, 0, -11.5); g.addColorStop(0, 'rgba(60,50,90,0)'); g.addColorStop(1, 'rgba(60,50,90,.18)'); ctx.fillStyle = g; ctx.fillRect(-8, -20, 17, 9); }
    floralPrint(ctx, -7.4, -28, 8, -12.6, 16, 11);
    line(ctx, P2('M-4.2 -27.4 C-3.4 -22 -3.8 -16 -3.4 -12'), rgba(C.topD, 0.7), 0.26); line(ctx, P2('M5.2 -27.4 C4.4 -22 4.8 -16 4.4 -12'), rgba(C.topD, 0.7), 0.26);
    line(ctx, P2('M-7.0 -24.5 C-6.2 -21 -6.4 -17 -6.0 -13'), 'rgba(255,255,255,.2)', 0.5);                   // moonlight on her left side
    ctx.restore();
    line(ctx, P2('M-3.2 -28.6 C-1.2 -27.9 2.2 -27.9 4.2 -28.6'), C.topD, 0.4);                               // the back of the crew neck
    // the waistband of her jeans with belt loops (the top is tucked in)
    cel(ctx, P2('M-5.8 -13.4 Q0.5 -12.9 6.4 -13.4 L7.2 -10.2 Q0.5 -9.7 -7.0 -10.2 Z'), C.jean, -6, 6.6, { lc: C.out, lw: 0.15, shade: '#2C3E72' });
    line(ctx, P2('M-6.4 -11.8 Q0.5 -11.3 6.8 -11.8'), C.stitch, 0.12);
    for (const x of [-4.6, 0.5, 5.6]) fill(ctx, P2(`M${x - 0.32} -13.2 L${x + 0.32} -13.2 L${x + 0.32} -10.3 L${x - 0.32} -10.3 Z`), C.jeanD);
    ctx.restore();
    // ---- arms (shoulder, elbow, wrist, a real hand), puff sleeves over the shoulders. With Snowki her right forearm
    // goes across his back and the hand curls round his side.
    for (const [s, e, w, side, hs] of [[sL, eL, wL, -1, hsL], [sR, eR, wR, 1, hsR]]) {
      const d = [w[0] - e[0], w[1] - e[1]], l = Math.hypot(d[0], d[1]) || 1;   // palm down: the thumb lies on the inner side
      hand2(ctx, [w[0] - d[0] / l * 0.3, w[1] - d[1] / l * 0.3], d, C.skin, hs, C.out, -side, cr && side > 0 ? 0.9 : 0.35);
      const cuff = [w[0] - d[0] / l * 1.1, w[1] - d[1] / l * 1.1], prof = [3.6, 3.35, 2.95, 2.8, 2.4];
      limb(ctx, s, e, cuff, prof, C.top, C.out, { lw: 0.16 });
      const an = Math.atan2(d[1], d[0]) + Math.PI / 2, ca = Math.cos(an), sa = Math.sin(an);
      line(ctx, P2(`M${cuff[0] - ca * 1.3} ${cuff[1] - sa * 1.3} L${cuff[0] + ca * 1.3} ${cuff[1] + sa * 1.3}`), C.topD, 0.5);
      if (side < 0) { const wp = [w[0] - d[0] / l * 0.5, w[1] - d[1] / l * 0.5]; line(ctx, P2(`M${wp[0] - ca * 1.05} ${wp[1] - sa * 1.05} Q${wp[0] + d[0] / l * 0.4} ${wp[1] + d[1] / l * 0.4} ${wp[0] + ca * 1.05} ${wp[1] + sa * 1.05}`), C.strap, 0.5); }
      ctx.save(); ctx.clip(limbPath(s, e, cuff, prof)); floralPrint(ctx, Math.min(s[0], cuff[0]) - 2, Math.min(s[1], cuff[1]) - 1, Math.max(s[0], cuff[0]) + 2, Math.max(s[1], cuff[1]) + 1, 4, side + 20, 0.45); ctx.restore();
      line(ctx, P2(`M${s[0] - 1.6} ${s[1] - 0.6} Q${s[0]} ${s[1] - 1.6} ${s[0] + 1.6} ${s[1] - 0.6}`), rgba(C.topD, 0.8), 0.3);   // the shoulder seam
    }
    // ---- head and hair (the head is drawn in its own frame, mirrored when she turns to her left)
    const inHead = fn => { ctx.save(); ctx.translate(hc[0], hc[1]); if (dir < 0) ctx.scale(-1, 1); fn(); ctx.restore(); };
    const earP = (x, y, s) => P2(`M${x - 0.5 * s} ${y - 1.7} C${x + 0.7 * s} ${y - 2.3} ${x + 1.3 * s} ${y - 0.6} ${x + 0.9 * s} ${y + 0.9} C${x + 0.6 * s} ${y + 1.8} ${x - 0.1 * s} ${y + 2.0} ${x - 0.5 * s} ${y + 1.3} Z`);
    const re = [lerp(6.6, 3.7, k), 0.7], rs = lerp(0.6, 1, k);
    inHead(() => {
      fill(ctx, ell(-0.3, 1.0, 6.9, 7.4), '#1A100C');   // the hair at the back of her skull, under everything (no gaps behind the ear when she turns)
      cel(ctx, ell(-6.7 + 2.6 * k, 0.8, 0.9 * (1 - k * 0.6), 1.5), C.skin, -7.6, -5.8, { lc: C.out, lw: 0.12 });   // her left ear turns away behind the hair
      cel(ctx, earP(re[0], re[1], rs), C.skin, re[0] - 0.6, re[0] + 1.3, { lc: C.out, lw: 0.12 });
      if (k > 0.01) { // the lost profile: cheek, jaw and the side of her neck come round as she turns
        const F = [[5.1, -5.4], [6.2, -3.8], [6.75, -1.6], [6.6, 0.2], [6.85, 1.8], [6.85 + 0.55 * kn, 2.9], [6.5 + 0.3 * sm, 3.7 - 0.25 * sm], [5.5, 5.8], [3.9, 7.5], [2.2, 8.0], [2.0, 8.8], [0.4, 8.8], [0.4, 7.2], [2.0, 4.0], [2.9, 0.0], [4.0, -3.4]];
        const face = smooth(F.map(([x, y]) => [x * lerp(0.7, 1, k), y]), true);
        const fg = ctx.createLinearGradient(1.5, 0, 7.2, 0); fg.addColorStop(0, mixc(C.skin, C.skinD, 0.55)); fg.addColorStop(0.6, C.skin); fg.addColorStop(1, mixc(C.skin, '#FFE8CF', 0.18));
        ctx.fillStyle = fg; ctx.fill(face); line(ctx, face, C.out, 0.16);
        ctx.save(); ctx.clip(face);
        { const g = ctx.createLinearGradient(0, 6.8, 0, 8.8); g.addColorStop(0, 'rgba(90,40,50,0)'); g.addColorStop(0.3, 'rgba(90,40,50,.35)'); g.addColorStop(1, 'rgba(90,40,50,.15)'); ctx.fillStyle = g; ctx.fillRect(0, 6.8, 7, 2.2); }   // under the jaw
        { const r = 1.5, g = ctx.createRadialGradient(5.7, 2.7, 0, 5.7, 2.7, r); g.addColorStop(0, rgba(C.blush, (0.22 + 0.3 * sm) * k)); g.addColorStop(1, rgba(C.blush, 0)); ctx.fillStyle = g; ctx.fillRect(5.7 - r, 2.7 - r, r * 2, r * 2); }
        ctx.restore();
        const a = ss((k - 0.45) / 0.4);
        if (a > 0.01) { ctx.globalAlpha = a;
          line(ctx, P2('M5.6 -2.3 Q6.3 -2.55 6.85 -2.2'), '#2A161C', 0.36);                                                        // the end of her brow
          fill(ctx, P2(`M6.1 ${-0.15 - 0.1 * sm} Q6.5 ${-0.4 - 0.12 * sm} 6.8 ${-0.08 - 0.1 * sm} Q6.62 ${0.38 - 0.15 * sm} 6.2 ${0.32 - 0.12 * sm} Z`), '#2A1410');   // a sliver of her eye, edge on
          fill(ctx, ell(6.55, -0.08 - 0.1 * sm, 0.1, 0.1), 'rgba(255,255,255,.85)');
          line(ctx, P2(`M6.0 ${0.05 - 0.1 * sm} Q6.45 ${-0.25 - 0.15 * sm} 6.8 ${-0.05 - 0.1 * sm}`), C.lash, 0.34);                         // lid
          for (const [x0, y0, x1, y1] of [[6.45, -0.15, 7.45, -0.85], [6.6, -0.02, 7.6, -0.38]]) line(ctx, P2(`M${x0} ${y0 - 0.15 * sm} Q${(x0 + x1) / 2 + 0.1} ${(y0 + y1) / 2 + 0.15 - 0.2 * sm} ${x1} ${y1 - 0.3 * sm}`), C.lash, 0.3);   // lashes past the cheek
          if (sm > 0.02) { ctx.globalAlpha = a * sm; line(ctx, P2('M5.0 5.55 Q5.55 5.6 5.95 4.95'), C.lip, 0.26); line(ctx, P2('M5.85 3.5 Q6.3 3.2 6.6 3.4'), rgba(C.skinD, 0.6), 0.16); }   // the corner of a smile, the cheek lifting
          ctx.globalAlpha = 1; }
      }
    });
    // ---- the lower hair: from the middle parting, round the back of her head, down to her shoulder blades in soft wavy locks
    // (outer locks first, so the inner ones lie over them; one shared gradient so it reads as one head of hair)
    const LK = [[-1.15, 2.9, -4.2, [[-4.1, -30.2], [-4.6, -27.9], [-4.6, -25.4], [-4.0, -23.4], [-3.4, -22.0]]], [1.15, 2.9, 4.7, [[4.9, -30.4], [5.6, -28.1], [5.6, -25.6], [5.0, -23.6], [4.4, -22.3]]],
      [-0.6, 3.1, -2.2, [[-2.0, -30.2], [-2.4, -27.7], [-2.5, -25.0], [-2.1, -22.4], [-1.5, -20.8]]], [0.6, 3.1, 2.8, [[2.8, -30.2], [3.2, -27.7], [3.3, -25.0], [3.0, -22.4], [2.5, -20.9]]], [0, 3.3, 0.3, [[0.4, -30.2], [0.4, -27.6], [0.4, -24.6], [0.6, -21.6], [0.8, -19.8]]]];
    const lockPts = [], hairAll = new Path2D(), lockPaths = [];
    const hg = ctx.createLinearGradient(hc[0] - 3, hc[1] + 1, hc[0] + 3, -13); hg.addColorStop(0, '#1C120E'); hg.addColorStop(0.35, C.hair); hg.addColorStop(0.55, '#3A261E'); hg.addColorStop(1, '#130B08');
    LK.forEach(([th, w, nx, p], i) => {
      const a0 = clamp(th, -1.5, 1.5), a1 = clamp(th - phi, -1.5, 1.5), d = 4.6 * (Math.sin(a1) - Math.sin(a0)) * 0.85;
      const pts = [[hc[0] + 6.4 * Math.sin(a1), hc[1] - 0.6 + (1 - Math.cos(a1)) * 1.1], [hc[0] + nx + d, hc[1] + 7.0]];
      p.forEach(([x, y], j) => pts.push([x + d * [0.75, 0.42, 0.18, 0.06, 0][j] + sx * [0.2, 0.5, 0.75, 0.9, 1][j] + sw(i) * 1.3 * ((j + 1) / 5) ** 2 + Math.sin(j * 1.6 + i * 1.7) * 0.85 * (j / 4), y + (j < 2 ? sh : 0)]));
      lockPts.push(pts);
      const r = ribbon(pts, [w, w * 0.88, w * 0.95, w, w * 0.92, w * 0.6, 0.12]); lockPaths.push(r.path); hairAll.addPath(r.path);
      ctx.fillStyle = hg; ctx.fill(r.path); line(ctx, r.path, 'rgba(5,2,8,.5)', 0.13);
      line(ctx, smooth(pts.slice(1, 6).map(q => [q[0] - w * 0.2, q[1]]), false), rgba(C.hairHi, 0.32), 0.14);   // a strand catching the light
      if (i === 4) line(ctx, smooth(pts.slice(1, 6).map(q => [q[0] + w * 0.25, q[1]]), false), rgba(C.hairHi, 0.22), 0.12);
      // glossy streaks where this lock curves over her shoulder blade (each at its own height, so they never read as a band)
      const hd = [pts[3][0] - pts[2][0], pts[3][1] - pts[2][1]], hn = Math.hypot(hd[0], hd[1]) || 1, ux = hd[0] / hn, uy = hd[1] / hn;
      ctx.save(); ctx.clip(r.path);
      for (let q = 0; q < 3; q++) { const o = (q - 1) * w * 0.22 - w * 0.08, c0 = [lerp(pts[2][0], pts[3][0], 0.3) + o, lerp(pts[2][1], pts[3][1], 0.3) + [0.6, 0.9, -0.2, 0.2, -0.6][i] + (q === 1 ? -0.5 : 0.3)], L = q === 1 ? 2.2 : 1.4;
        line(ctx, P2(`M${c0[0] - ux * L} ${c0[1] - uy * L} L${c0[0] + ux * L} ${c0[1] + uy * L}`), rgba(C.sheen, q === 1 ? 0.3 : 0.2), q === 1 ? 0.2 : 0.14); }
      ctx.restore();
    });
    // ---- the back of her head: the crown, the hair falling loose from it
    inHead(() => {
      const Q = [-6.1 * Math.sin(ph) * 0.92, -2.6 + 0.5 * lu], rc = [lerp(6.6, 3.3, k), lerp(1.3, -0.2, k)];
      const capPts = [[-0.25 * k, -8.1], [-5.2, -5.75], [-7.35, -0.6], [-6.5, 1.3], [(-6.5 + Q[0]) / 2 - 0.3, (1.3 + Q[1]) / 2 + 0.9], [Q[0], Q[1] + 0.8], [(rc[0] + Q[0]) / 2 + 0.3, (rc[1] + Q[1]) / 2 + 0.9], rc, [lerp(7.35, 4.5, k), lerp(-0.6, -2.4, k)], [lerp(5.2, 5.0, k), lerp(-5.75, -5.2, k)], [2.8, -7.6]];
      const cap = smooth(capPts, true);
      const cg = ctx.createRadialGradient(-2.6, -4.8, 0.5, 0, -2, 9.5); cg.addColorStop(0, '#5A3E30'); cg.addColorStop(0.6, C.hair); cg.addColorStop(1, '#1A100C');
      ctx.fillStyle = cg; ctx.fill(cap); line(ctx, cap, 'rgba(8,4,12,.22)', 0.12);
      line(ctx, smooth([capPts[3], capPts[2], capPts[1], capPts[0], capPts[10], capPts[9], capPts[8], capPts[7]], false), 'rgba(8,4,12,.6)', 0.14);   // the outer silhouette
      ctx.save(); ctx.clip(cap);
      ctx.lineCap = 'butt';
      for (const [a0, a1, r0] of [[1.14, 1.3, 6.3], [1.35, 1.6, 6.45], [1.65, 1.84, 6.3]]) { ctx.beginPath(); ctx.arc(-0.3 * k, -0.9, r0, Math.PI * a0, Math.PI * a1); ctx.strokeStyle = rgba(C.sheen, 0.2); ctx.lineWidth = 0.7; ctx.stroke(); }   // the shine on the crown
      ctx.lineCap = 'round';
      const top = [capPts[2], capPts[1], capPts[0], capPts[10], capPts[9], capPts[8]], seg = [];
      for (let i = 1; i < top.length; i++) seg.push(Math.hypot(top[i][0] - top[i - 1][0], top[i][1] - top[i - 1][1]));
      const tot = seg.reduce((a, b) => a + b, 0);
      for (let i = 0; i < 10; i++) { // strands swept from her hairline back to the clip
        let d = tot * (i + 0.5) / 10, j = 0; while (j < seg.length - 1 && d > seg[j]) { d -= seg[j]; j++; }
        const u = clamp(d / seg[j], 0, 1), S = [lerp(top[j][0], top[j + 1][0], u) * 0.96, lerp(top[j][1], top[j + 1][1], u) * 0.96], E = [lerp(S[0], Q[0], 0.72), lerp(S[1], Q[1], 0.72)];
        line(ctx, P2(`M${S[0]} ${S[1]} Q${(S[0] + E[0]) * 0.5 + S[0] * 0.16} ${(S[1] + E[1]) * 0.5 + S[1] * 0.1} ${E[0]} ${E[1]}`), rgba(C.hairHi, i % 2 ? 0.22 : 0.34), 0.14);
      }
      fill(ctx, P2(`M-7.1 0.2 Q-5.8 -4.4 ${Q[0] - 0.6} ${Q[1] - 0.6} Q-4.6 -1.6 -7.1 0.2 Z`), rgba(C.sheen, 0.12));
      ctx.beginPath(); ctx.arc(0, -0.4, 7.1, Math.PI * 0.95, Math.PI * 1.32); ctx.strokeStyle = 'rgba(170,160,225,.22)'; ctx.lineWidth = 0.4; ctx.stroke();   // moonlit rim
      ctx.restore();
      // her right ear in front of the hair behind it, and a few hairs in front of it, once she has turned
      if (k > 0.1) { ctx.globalAlpha = ss((k - 0.1) / 0.3);
        cel(ctx, earP(re[0], re[1], rs), C.skin, re[0] - 0.6, re[0] + 1.3, { lc: C.out, lw: 0.12 }); line(ctx, P2(`M${re[0] + 0.05 * rs} ${re[1] - 1.0} C${re[0] + 0.7 * rs} ${re[1] - 0.9} ${re[0] + 0.6 * rs} ${re[1] + 0.6} ${re[0] + 0.2 * rs} ${re[1] + 0.9}`), rgba(C.skinD, 0.7), 0.15);
        jhumka(ctx, re[0] + 0.2 * rs, re[1] + 1.4, 0.95, t);   // her earring catches the light as she turns
        const sl = [[4.6, -4.8], [4.95, -3.2], [4.9, -1.6], [4.6 + sw(5) * 0.15, -0.4]];   // a few hairs at her temple
        cel(ctx, ribbon(sl, [0.6, 0.55, 0.35, 0.06]).path, C.hair, 4, 5.6, { line: false, shade: '#000000' });
        ctx.globalAlpha = 1; }
    });
    // ---- a few fine strands lifting in the breeze (small: never a sheet of hair)
    { const s1 = sw(6), s2 = sw(7), e = lockPts[1], b = [e[2][0] + dir * 0.6, e[2][1] - 0.6];
      const f1 = smooth([b, [b[0] + dir * 0.5 + s1 * 0.6, b[1] + 3.4], [b[0] + dir * 0.4 + s1 * 1.5, b[1] + 6.6]], false);
      line(ctx, f1, C.hair, 0.26); line(ctx, f1, rgba(C.hairHi, 0.4), 0.08);
      const p4 = e[5], f2 = smooth([[p4[0] - 0.3, p4[1] - 2.2], [p4[0] + 0.5 + s2 * 0.6, p4[1] + 0.6], [p4[0] + 0.8 + s2 * 1.4, p4[1] + 2.8]], false);
      line(ctx, f2, C.hair, 0.2);
      const p3 = lockPts[0][5], f3 = smooth([[p3[0] + 0.3, p3[1] - 2.0], [p3[0] - 0.5 + s1 * 0.4, p3[1] + 0.8], [p3[0] - 0.5 + s1 * 1.0, p3[1] + 2.8]], false);
      line(ctx, f3, C.hair, 0.18); }
  }
  backSleeve(ctx, s, side) {   // a puff sleeve seen from behind: gathered at the shoulder seam, a band at the hem
    const C = HC, cx = s[0] + side * 0.7, cy = s[1] + 0.9;
    const p = smooth([[cx - side * 1.9, cy - 2.6], [cx + side * 0.6, cy - 3.3], [cx + side * 2.5, cy - 1.9], [cx + side * 3.0, cy + 0.6], [cx + side * 2.2, cy + 2.6], [cx + side * 0.2, cy + 3.1], [cx - side * 1.7, cy + 2.4], [cx - side * 2.4, cy + 0.2]], true);
    cel(ctx, p, C.dressL, cx - 3, cx + 3, { lc: C.out, lw: 0.15 });
    ctx.save(); ctx.clip(p);
    for (let i = 0; i < 3; i++) line(ctx, P2(`M${cx + side * (-1.0 + i * 1.1)} ${cy - 3.2} Q${cx + side * (-0.4 + i * 1.2)} ${cy - 1.2} ${cx + side * (-0.2 + i * 1.3)} ${cy + 0.2}`), 'rgba(90,120,190,.35)', 0.22);
    ctx.restore();
    line(ctx, P2(`M${cx - side * 1.8} ${cy + 2.3} Q${cx + side * 0.4} ${cy + 3.4} ${cx + side * 2.3} ${cy + 2.4}`), C.collar, 0.55);
  }
  // standing (the memory of the day he gave her Snowki): straight legs, the skirt falling to mid-calf
  standLower(ctx, t, st) {
    const C = HC, walking = !!st.walking, phaseBase = Number.isFinite(st.walkPhase) ? st.walkPhase : t * 6;
    const walkSw = walking ? Math.sin(phaseBase) : 0, sw = Math.sin(t * 1.3) * 0.5 + walkSw * 0.8;
    this.jeanLegs(ctx, t, walking, phaseBase, false);
  }
  // high-waisted wide-leg jeans from the waist to the sneakers (front: pockets and fly; back: back pockets). ONE garment: the waist
  // flares into the hips and each leg grows out of its own half of the seat (no box, no tubes hung from a block). The gait comes from
  // gait.js: planted feet that never slide, a heel strike and a toe-off, a hip that rises and drops, a pelvis that sways and tilts
  // (seen from behind, forward/back steps show as the feet being higher/lower, because the camera looks along her path).
  jeanLegs(ctx, t, walking, phaseBase, back) {
    const C = HC, u = phaseBase / (Math.PI * 2), L1 = 25.2, L2 = 24.6, AH = 2.6, GA = Helen.STAND_GROUND - AH, S = HELEN_STRIDE * DUTY, KF = 0.21;
    const F = [0, 1].map(i => (walking ? gaitFoot(u + i * 0.5, S, 3.8) : { x: i ? 1.8 : -1.0, y: 0, p: 0, st: true }));
    const dxMax = walking ? Math.max(...F.map(f => (f.st ? Math.abs(f.x) : 0))) : 0, rise = hipRise(L1 + L2, dxMax, walking ? 0.03 : 0.004);
    const cyc = walking ? Math.cos(2 * Math.PI * (u - 0.3)) : Math.sin(t * 0.55) * 0.35, sway = -cyc * (back ? 0.9 : 0.35), tilt = cyc * (walking ? 0.03 : 0.012), hipY = GA - rise;
    this.lowSway = sway * 0.55;
    const legs = [0, 1].map(i => {
      const f = F[i], hx = (i ? 3.4 : -3.4) + sway, hy = hipY + tilt * (i ? 3.4 : -3.4), hip = [hx, hy];
      let kn, an;
      if (back) {   // the sagittal plane (z forward, y up) is solved first, then squashed onto the screen: z becomes a small climb
        const ax = hx * 1.06 + (i ? 0.5 : -0.5) * (f.st ? 0.6 : 0.2), tz = f.x, ty = GA - f.y, ik2 = ik([0, hy], [tz, ty], L1, L2, -1);
        an = [ax, ty - KF * tz]; kn = [lerp(hx, ax, 0.5) + (i ? 0.45 : -0.45), ik2[1][1] - KF * ik2[1][0]];
      } else { const I = ik(hip, [hx + f.x * 0.92, GA - f.y], L1, L2, -1); kn = I[1]; an = I[2]; }
      return { hip, kn, an, f, i, z: f.x };
    });
    const prof = [8.0, 7.2, 6.3, 6.4, 7.4];
    for (const lg of (back ? legs.slice().sort((a, b) => b.z - a.z) : legs)) {
      const { hip, kn, an, f, i } = lg, go = {};
      if (back) sneakerBack(ctx, an[0], an[1] + 0.9, f.p, C); else { ctx.save(); ctx.translate(an[0], an[1] + 1.7); ctx.rotate(-f.p); sneaker(ctx, 0, 0, C); ctx.restore(); }
      limb(ctx, hip, kn, [an[0], an[1] - 2.0], prof, C.jean, C.out, { lw: 0.16, shade: '#2C3E72', gradOut: go });
      const sgn = i ? 1 : -1;
      line(ctx, P2(`M${hip[0] - sgn * 1.3} ${hip[1] + 4} L${kn[0] - sgn * 1.2} ${kn[1]} L${an[0] - sgn * 1.3} ${an[1] - 1.4}`), rgba(C.jeanL, 0.42), 0.5);   // the light on the leg
      line(ctx, P2(`M${an[0] - 3.5} ${an[1] - 3.6} Q${an[0]} ${an[1] - 2.8} ${an[0] + 3.5} ${an[1] - 3.6}`), rgba(C.jeanD, 0.5), 0.3);   // the hem folds over the shoe
      if (!back) for (const k of [0.1, 0.22]) line(ctx, P2(`M${kn[0] - 2.8} ${kn[1] + k * 7 - 1} Q${kn[0] + 0.4} ${kn[1] + k * 7 + 0.6} ${kn[0] + 2.8} ${kn[1] + k * 7 - 1}`), rgba(C.jeanD, 0.35), 0.28);   // the creases at the knee
      lg.g = go.g;
    }
    // the seat: each half continues its leg's gradient, so the leg and the hip are one piece of denim
    const PG = ctx.createLinearGradient(-8.6 + sway, 0, 8.6 + sway, 0); PG.addColorStop(0, mixc(C.jean, '#FFE8CF', 0.2)); PG.addColorStop(0.5, C.jean); PG.addColorStop(1, mixc(C.jean, '#2C3E72', 0.3));   // one even tone across the hips
    const pel = (i, g) => { const sgn = i ? 1 : -1, hx = sgn * 3.4 + sway, X = (a, y) => [sgn * a + sway * (1 + (y + 13) * 0.02), y + tilt * sgn * a], c0 = 0.25 + sway;
      const lg = legs[i], ax = [lg.kn[0] - lg.hip[0], lg.kn[1] - lg.hip[1]], tp = [lg.hip[0] + ax[0] * 0.42, lg.hip[1] + ax[1] * 0.42], hw = 3.65;   // a point on the thigh, where the seat ends
      const pts = [[c0, -13.3], X(5.8, -13.2), X(7.1, -10), X(7.8, -6), [tp[0] + sgn * hw, tp[1] - 1.0], [tp[0] - sgn * hw * 0.9, tp[1] + 0.6], [c0 + sgn * 0.2, 2.0]];
      const path = smooth(pts, true); ctx.fillStyle = PG; ctx.fill(path);
      line(ctx, smooth(pts.slice(1, 5), false), C.out, 0.16);   // only the outer edge: the middle is one garment
      return path; };
    for (const lg of (back ? legs.slice().sort((a, b) => b.z - a.z) : legs)) lg.pel = pel(lg.i, lg.g);
    ctx.save(); ctx.clip(smooth([[-5.8, -13.3], [6.4, -13.3], [7.9, -6], [7.5, 1.4], [0.3, 3.4], [-7.5, 1.4], [-7.9, -6]], true));
    line(ctx, P2(`M${0.25 + sway} -13 C${0.35 + sway} -8 ${0.3 + sway} -2 ${0.25 + sway} 3.4`), rgba(C.jeanD, 0.85), 0.34);   // the centre seam
    if (back) { jeanPocket(ctx, -3.5 + sway, -6.3, 4.4, 4.6); jeanPocket(ctx, 4.0 + sway, -6.3, 4.4, 4.6);
      line(ctx, P2(`M${-5.9 + sway} -12.9 L${0.25 + sway} -9.6 L${6.4 + sway} -12.9`), C.stitch, 0.14);   // the yoke
      for (const sx of [-1, 1]) line(ctx, P2(`M${sx * 7.3 + sway} -8 C${sx * 7.6 + sway} -4 ${sx * 7.4 + sway} -1 ${sx * 6.8 + sway} 1.6`), 'rgba(255,255,255,.2)', 0.5); }   // moonlight on the hips
    else { line(ctx, P2(`M${5.8 + sway} -12.6 C${5.6 + sway} -9 ${3.8 + sway} -6.8 ${1.6 + sway} -6`), C.stitch, 0.14); line(ctx, P2(`M${-5.2 + sway} -12.6 C${-5 + sway} -9 ${-3.4 + sway} -6.8 ${-1.4 + sway} -6`), C.stitch, 0.14);
      line(ctx, P2(`M${0.9 + sway} -12.6 C${0.9 + sway} -9.6 ${0.7 + sway} -7 ${0.2 + sway} -3.6`), C.stitch, 0.14); }
    ctx.restore();
  }
  standBackLower(ctx, t, st) {
    const C = HC, walking = !!st.walking, phaseBase = Number.isFinite(st.walkPhase) ? st.walkPhase : t * 6;
    const sw = walking ? Math.sin(phaseBase) * 0.8 : Math.sin(t * 1.3) * 0.25;
    this.jeanLegs(ctx, t, walking, phaseBase, true);
  }
  drawHead(ctx, st) {
    const C = HC, t = st.t, ex = st.expr || 'calm', lu = this.lu || 0;
    // ear (mostly hidden by hair)
    cel(ctx, P2('M-4.6 -38.4 C-6.0 -38.6 -6.2 -35.9 -4.9 -35.0 C-4.5 -34.8 -4.2 -35.5 -4.2 -36.0 Z'), C.skin, -6.2, -4.2, { lc: C.out, lw: 0.14 });
    const face = smooth([[-4.6, -41.5], [-5.0, -38.5], [-4.8, -35.4], [-3.6, -32.8], [-1.4, -31.2], [0.9, -30.5], [3.0, -31.4], [4.6, -33.2], [5.6, -35.8], [5.8, -39.0], [4.8, -42.4], [1.6, -44.1], [-1.8, -43.8]], true);
    cel(ctx, face, C.skin, -5, 5.8, { lc: C.out, lw: 0.2 });
    ctx.save(); ctx.clip(face);
    const sh = ctx.createLinearGradient(0, -44, 0, -30); sh.addColorStop(0, 'rgba(90,30,50,.30)'); sh.addColorStop(0.3, 'rgba(90,30,50,0)'); ctx.fillStyle = sh; ctx.fillRect(-6, -45, 13, 16);
    const bl = ex === 'joyful' || ex === 'teary' || ex === 'surprised' || ex === 'smile' ? 0.55 : 0.4, ft = this.tn * 1.3;
    for (const [bx, by, r] of [[-2.4 + ft, -35.4, 1.8], [4.0 + ft, -35.6, 1.3]]) { const g = ctx.createRadialGradient(bx, by, 0, bx, by, r); g.addColorStop(0, rgba(C.blush, bl)); g.addColorStop(1, rgba(C.blush, 0)); ctx.fillStyle = g; ctx.fillRect(bx - r, by - r, r * 2, r * 2);
      for (let k = 0; k < 3; k++) line(ctx, P2(`M${bx - r * 0.5 + k * r * 0.4} ${by + r * 0.25} L${bx - r * 0.25 + k * r * 0.4} ${by - r * 0.25}`), rgba('#E0566C', bl * 0.8), 0.12); }
    ctx.restore();
    // eyes (they move first; the head follows)
    ctx.save(); ctx.translate(ft, 0);
    const blinkNow = this.blink > 0, gy = ex === 'surprised' ? -1.0 : lu * -0.8, gxe = clamp(this.gz * 0.9, -0.9, 0.9);
    let es = ex === 'joyful' ? 'happy' : ex === 'surprised' ? 'wide' : ex === 'teary' ? 'teary' : ex === 'closed' ? 'closed' : ex === 'smile' ? 'soft' : 'open';
    if (blinkNow && es !== 'happy') es = 'closed';
    const lights = st.eyeLights || null;
    ctx.save(); ctx.translate(-1.7, 0); ctx.scale(-1, 1); ctx.translate(1.7, 0); animeEye(ctx, -1.7, -37.2, 3.2 * (1 - Math.max(0, -this.tn) * 0.12), 3.9, es, C, -gxe, gy, lights && lights.map(L => [-L[0], ...L.slice(1)])); ctx.restore();
    animeEye(ctx, 3.45, -37.3, 2.8 * (1 - Math.max(0, this.tn) * 0.15), 3.6, es, C, gxe, gy, lights);
    jhumka(ctx, -5.25, -35.3, 1, t);   // her silver jhumka, swaying a little
    if (ex === 'teary') { // a tear catching the light
      const ty = -35.0 + ((t * 0.35) % 1) * 2.2;
      ctx.fillStyle = 'rgba(210,235,255,.85)'; ctx.beginPath(); ctx.ellipse(-0.6, ty, 0.32, 0.5, 0, 0, 7); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,1)'; ctx.beginPath(); ctx.arc(-0.7, ty - 0.18, 0.12, 0, 7); ctx.fill();
    }
    const bu = ex === 'surprised' ? -0.6 : ex === 'teary' ? -0.25 : 0;
    fill(ctx, P2(`M-3.6 ${-40.4 + bu} C-2.6 ${-41.3 + bu} -1.2 ${-41.5 + bu} 0.0 ${-41.0 + bu} C-1.2 ${-41.1 + bu} -2.5 ${-40.95 + bu} -3.6 ${-40.4 + bu} Z`), '#2A161C');
    fill(ctx, P2(`M2.2 ${-41.1 + bu} C3.2 ${-41.5 + bu} 4.3 ${-41.3 + bu} 5.0 ${-40.5 + bu} C4.2 ${-40.9 + bu} 3.2 ${-41.0 + bu} 2.2 ${-41.1 + bu} Z`), '#2A161C');
    fill(ctx, ell(0.95, -40.15 + bu * 0.5, 0.36, 0.36), C.bindi); fill(ctx, ell(0.86, -40.27 + bu * 0.5, 0.1, 0.1), 'rgba(255,220,220,.35)');   // the bindi
    line(ctx, P2('M2.25 -35.6 C2.45 -35.0 2.35 -34.7 2.0 -34.6'), rgba(C.skinD, 0.85), 0.18);
    fill(ctx, ell(2.4, -35.3, 0.18, 0.4, 0.3), 'rgba(255,230,210,.5)');
    if (ex === 'joyful') {
      cel(ctx, P2('M0.0 -33.4 C0.9 -33.0 2.2 -33.0 3.0 -33.4 C2.8 -31.8 1.9 -31.3 1.4 -31.35 C0.6 -31.4 0.15 -32.2 0.0 -33.4 Z'), '#7A2434', 0, 3, { lw: 0.12, lc: C.out });
      fill(ctx, P2('M0.25 -33.25 C1.0 -33.0 2.1 -33.0 2.75 -33.25 L2.6 -32.85 C1.9 -32.7 0.9 -32.7 0.4 -32.85 Z'), '#FFF6EE');
      fill(ctx, ell(1.5, -31.95, 0.7, 0.28), '#E2707E');
    } else if (ex === 'surprised') { fill(ctx, ell(1.5, -32.6, 0.55, 0.62), '#7A2434'); fill(ctx, ell(1.5, -32.45, 0.3, 0.2), '#E2707E'); }
    else if (ex === 'smile') { line(ctx, P2('M0.0 -33.15 C0.8 -32.1 2.2 -32.0 3.0 -33.05'), C.lip, 0.32); fill(ctx, P2('M0.7 -32.55 C1.3 -32.15 1.9 -32.15 2.4 -32.55 C1.9 -32.35 1.3 -32.35 0.7 -32.55 Z'), rgba(C.lip, 0.6)); line(ctx, P2('M-0.15 -33.35 L0.1 -33.0'), rgba(C.skinD, 0.6), 0.14); line(ctx, P2('M3.15 -33.25 L2.9 -32.95'), rgba(C.skinD, 0.6), 0.14); }
    else { line(ctx, P2('M0.3 -33.0 C0.9 -32.5 2.0 -32.4 2.8 -32.9'), C.lip, 0.3); fill(ctx, P2('M0.8 -32.62 C1.3 -32.3 1.9 -32.3 2.3 -32.62 C1.9 -32.45 1.3 -32.45 0.8 -32.62 Z'), rgba(C.lip, 0.55)); }
    ctx.restore();
    // front hair: parted in the middle, framing her face, partly tied back; loose strands move in the breeze
    const fx = Math.sin(t * 1.9) * 0.12 + (st.wind || 0) * 0.0015, pt = 0.6 + this.tn * 0.9;
    const front = smooth([[-6.3, -33.4], [-6.7, -38], [-6.1, -42.8], [-3.9, -46.2], [pt, -47.3], [5.0, -46.3], [7.0, -42.8], [7.2, -38], [6.7, -33.3],
      [5.7, -35.6 + fx], [5.4, -39.4], [3.7, -42.9], [pt + 0.1, -44.7], [-2.5, -43.1], [-4.5, -39.6], [-5.3, -35.7 + fx]], true);
    cel(ctx, front, C.hair, -6, 7, { lc: 'rgba(40,20,40,.8)', lw: 0.18, shade: '#000000' });
    ctx.save(); ctx.clip(front);
    fill(ctx, P2(`M-5.6 -43.6 C-3 -45.6 3.6 -45.8 6.4 -43.4 L6.2 -42.4 C3.6 -44.4 -2.8 -44.3 -5.4 -42.6 Z`), rgba(C.sheen, 0.26));   // the sheen across the crown
    for (let i = 0; i < 5; i++) { line(ctx, P2(`M${pt - 0.4} -46.4 Q${-2 - i * 0.9} -43 ${-4.6 - i * 0.3} ${-36 - i * 0.6}`), rgba(C.hairHi, 0.5), 0.15); line(ctx, P2(`M${pt + 0.4} -46.4 Q${3 + i * 0.9} -43 ${5.8 + i * 0.3} ${-36 - i * 0.6}`), rgba(C.hairHi, 0.5), 0.15); }
    ctx.restore();
    // two loose strands across her temples
    line(ctx, P2(`M-4.2 -43.2 Q${-5.6 + fx * 3} -39 ${-5.0 + fx * 4} -34.6`), C.hair, 0.35); line(ctx, P2(`M5.2 -43.0 Q${6.6 + fx * 3} -39 ${6.0 + fx * 4} -34.4`), C.hair, 0.35);
  }
}

// =====================================================================================  THE BOY (standing / hiding / lighting / walking)
const OFFER = [15.6, -62.2, 24.8, -63.6, 21.6, -64.4], CARRY = [12.6, -62.8, 21.0, -64.2, 17.4, -65.4];   // offering hands (near x,y, far x,y) and where the teddy sits on them (torso space)
const UA = 15.4, FA = 13.4, LEG1 = 25.2, LEG2 = 24.55, HIPY = -52, SHW = 10.7, SHY = -80.2;   // upper arm, forearm, thigh, shin, hip-joint height, shoulder half-width / height
const STEP_D = 34;   // one full stride (two steps) of the man's walk, in character units: the cadence follows his speed, so a planted foot never slides
// He after the user's photo (2026-11-23): warm brown skin, thick swept-up wavy near-black hair, dark eyes under strong brows,
// a thin moustache and a goatee; a black tee under an open lilac shirt (sleeves rolled), a blue patterned backpack on black straps
const BC = { skin: '#B5784D', skinD: '#87512F', hair: '#15100F', hairHi: '#5C4A40', shirt: '#C9BEE3', shirtD: '#9A8EC4', shirtS: '#5E527F', shirtL: '#F1ECFF', cuffC: '#B5A8D8',
  tee: '#1D1C22', teeL: '#3A3946', pant: '#2B3040', shoe: '#3E302A', lip: '#86463F', beard: '#1A1110', iris: '#2E1A12', irisL: '#B07848', lash: '#130A0A', out: 'rgba(80,42,34,.78)',
  bag: '#2F6FD8', bagD: '#1C4AA2', bagL: '#8CC8FF', strap: '#17171C' };
export class Boy {
  constructor() { this.hem = new Hem(7, { drag: 3.5, grav: 150, stiff: 0.45 }); this.blinkT = 3; this.blink = 0; this.curl = new Spring(40, 6); this.bounds = [-30, -116, 34, 6]; this.walkPh = 0; this.knS = new Spring(16, 7.5); this.kn = 0; this.tiltS = new Spring(20, 8); this.leanS = new Spring(12, 6.6); this.legBlend = 1; this.lastPose = null; }
  // st: { t, dt, wind, pose, expr: watching|contentment|smile|farewell, look (gaze x), gazeY, lookDown 0..1, talk, kneel, hold + held (cradle),
  //       reach: [x,y] right-hand target (lighter / the tree trunk), signal, gift, flame, lookBack (walk), armT,
  //       pose 'hide'   – hidden behind a tree trunk on his +x side: body upright and compact, head and near-trunk shoulder leaning
  //                        out a little, his left hand on the trunk at st.reach (default: head height, in front);
  //       pose 'peek'   – leaning out farther, the front foot stepping out (blend hide -> peek -> stand / walkHold: legs and lean ease);
  //       pose 'offer'  – standing, both arms forward offering the teddy: st.held(ctx, P.holdPt, { s: 0.72 }) draws it between his hands;
  //       pose 'walkHold' – walking toward +x (3/4 front view) holding the teddy in front of his chest with both hands (same held
  //                        callback); move him at st.speed char units/s (default 26) – the planted foot then never slides }
  // He faces +x (screen right); the film mirrors him (flip) to face left.
  update(st) {
    const dt = st.dt; this.blinkT -= dt; if (this.blinkT < 0) { this.blink = 0.13; this.blinkT = 2.6 + Math.random() * 3; } this.blink = Math.max(0, this.blink - dt);
    this.curl.step(dt, (st.wind || 0) * 0.004); this.kn = clamp(this.knS.step(dt, st.kneel ? 1 : 0), 0, 1.05); this.tilt = this.tiltS.step(dt, st.lookDown || 0);
    if (st.pose === 'walk') this.walkPh += dt * 4.4;
    if (st.pose === 'walkHold' && st.speed > 0.01) this.walkPh += dt * Math.PI * 2 * st.speed / STEP_D;
    if (st.pose !== this.lastPose) { this.legFrom = this.P && this.lastPose != null ? this.P.legs.map(L => L.slice(0, 3).map(q => q.slice())) : null; this.legBlend = 0; this.lastPose = st.pose; }
    this.legBlend = Math.min(1, this.legBlend + Math.max(0, dt) / 0.5);
    const pose = this.pose(st);
    if (this.legFrom && this.legBlend < 1) { const e = ss(this.legBlend); pose.legs = pose.legs.map((L, i) => L.map((q, j) => (j < 3 && this.legFrom[i] ? [lerp(this.legFrom[i][j][0], q[0], e), lerp(this.legFrom[i][j][1], q[1], e)] : q))); }
    if (this.armP && dt > 0 && dt < 0.2) { const k = 1 - Math.exp(-dt * 11); pose.arms = pose.arms.map((arm, i) => arm.map((q, j) => (j === 0 || !this.armP[i] ? q : [lerp(this.armP[i][j][0], q[0], k), lerp(this.armP[i][j][1], q[1], k)]))); }
    this.armP = pose.arms.map(a => a.map(q => q.slice()));
    this.P = pose;
  }
  pose(st) {
    const t = st.t, P = { hip: [0, HIPY], lean: 0, headTilt: 0, crouch: 0 };
    const leg = (hx, foot, bend) => { const hip = [P.hip[0] + hx, P.hip[1]]; return ik(hip, foot, LEG1, LEG2, bend); };
    if (st.pose === 'light') {
      P.lean = 0.25; P.headTilt = 0.3;
      P.legs = [leg(-3.9, [-5.6, -0.2], -1), leg(4.1, [6.2, -0.2], -1)];
    } else if (st.pose === 'walk') {
      const ph = this.walkPh, sway = Math.sin(ph) * 0.9, bob = (1 - Math.abs(Math.cos(ph))) * 1.1;
      P.hip = [sway, HIPY - bob]; P.back = true; P.lean = Math.sin(ph) * 0.018;
      const side = (hx, p) => { const lift = Math.max(0, Math.sin(p)), stance = Math.max(0, -Math.sin(p)), hip = [P.hip[0] + hx, P.hip[1]];
        const kn = [hip[0] + hx * 0.06 + lift * 0.4, hip[1] + LEG1 - lift * 2.2 + stance * 0.2], an = [kn[0] - lift * 0.3, Math.min(-0.2, kn[1] + LEG2 * (1 - lift * 0.5) - lift * 1.5)];
        return [hip, kn, an, lift]; };
      P.legs = [side(-3.8, ph), side(4.0, ph + Math.PI)];
    } else if (st.pose === 'walkHold') {   // a gentle walk toward +x: the planted foot slides back at exactly his speed, heel strike -> toe-off, the swing foot clears the ground
      const u = this.walkPh / (Math.PI * 2), S = STEP_D * DUTY, moving = st.speed > 0.01, fa = moving ? gaitFoot(u, S, 5.2) : { x: -3, y: 0, p: 0, st: true }, fb = moving ? gaitFoot(u + 0.5, S, 5.2) : { x: 3, y: 0, p: 0, st: true };
      const dx = Math.max(fa.st ? Math.abs(fa.x) : 0, fb.st ? Math.abs(fb.x) : 0), AH = 2.25;
      P.hip = [0, -(hipRise(LEG1 + LEG2, dx, 0.015) + AH)]; P.lean = moving ? 0.05 : 0.02; P.headTilt = 0.04; P.walkU = moving ? u : null;
      P.legs = [leg(-2.6, [-2.6 + fa.x, -AH - fa.y], -1), leg(2.6, [2.6 + fb.x, -AH - fb.y], -1)]; P.feet = [fa.p, fb.p]; P.legOrder = [1, 0];   // his near (right) leg in front
    } else if (st.pose === 'offer') {
      P.lean = 0.2; P.headTilt = 0.02;   // a slight bow toward her as he holds the teddy out
      P.legs = [leg(-3.9, [-3.2, -0.2], -1), leg(4.1, [8.2, -0.2], -1)];
    } else if (st.pose === 'hide' || st.pose === 'peek') {   // behind the trunk (on his +x side): upright and compact, leaning out to look
      const pk = st.pose === 'peek';
      // (trunk edge expected at local x ≈ +10: his body stays behind it; the face – centre x ≈ 11 hiding, ≈ 16 peeking – and
      // the +x shoulder lean out past it; the film should not add its own rot for these poses)
      // st.duck: pressed flat behind the trunk (she is looking his way) – upright, head in, no hand on the bark
      P.lean = st.duck ? -0.03 : pk ? 0.24 : 0.2; P.headTilt = st.duck ? -0.02 : pk ? 0.24 : 0.12;
      P.legs = [leg(-3.9, [-4.6, -0.2], -1), leg(4.1, [st.duck ? 3.8 : pk ? 7.6 : 5.0, -0.2], -1)];
    } else { const k = clamp(this.kn, 0, 1), e = k * k * (3 - 2 * k); P.hip = [e * 2, HIPY + e * 25]; P.lean = e * (st.hold || st.reach || st.armT || st.wave || st.signal ? 0.1 : 0.2);   // (hands free: he leans over his knee)
      const hipB = [P.hip[0] - 3.9, P.hip[1]], hipF = [P.hip[0] + 4.1, P.hip[1]], standB = ik(hipB, [-4.4, -0.2], LEG1, LEG2, -1), standF = ik(hipF, [4.8, -0.2], LEG1, LEG2, -1);
      if (e < 0.02) P.legs = [standB, standF];
      else { // the back knee on the ground with the shin flat behind; the front foot planted, knee up
        const kB = [hipB[0] + 0.5, -1.4], aB = [kB[0] - 23.5, -1.6], kF = [hipF[0] + 24.2, hipF[1] + 3.2], aF = [kF[0] + 0.6, -0.4];
        const mix = (A, Bq) => A.map((p, i) => [lerp(p[0], Bq[i][0], e), lerp(p[1], Bq[i][1], e)]);
        P.legs = [mix(standB, [hipB, kB, aB]), mix(standF, [hipF, kF, aF])]; } }
    if (st.pose !== 'walk') P.lean = this.leanS.step(clamp(st.dt || 0, 0, 0.05), P.lean); else this.leanS.x = P.lean;   // poses ease into each other
    P.headTilt += this.tilt * 0.28;
    P.c = Math.cos(P.lean); P.s = Math.sin(P.lean);
    P.tp = (x, y) => { const dx = x - 0, dy = y - HIPY; return [P.hip[0] + dx * P.c - dy * P.s, P.hip[1] + dx * P.s + dy * P.c]; };     // torso space -> body
    const sL = P.tp(-SHW, SHY), sR = P.tp(SHW + 0.2, SHY);
    P.holdPt = P.tp(7.6, -66.4);   // Snowki sits on the cradling forearm
    // kneeling: Snowki sits on his raised knee (on top of the thigh, just behind the knee) – where he lifts him to and talks with him
    if (this.kn > 0.5 && P.legs && P.legs[1]) { const [h, k] = P.legs[1]; P.holdPt = [lerp(h[0], k[0], 0.64), lerp(h[1], k[1], 0.64) - 3.4]; }
    // a hanging arm: the elbow a little out, the wrist a little further, the hand at mid-thigh
    const hang = s => { const sh = s < 0 ? sL : sR, ey = SHY + UA * 0.985; return [sh, P.tp(s * (SHW + 1.9), ey), P.tp(s * (SHW + 2.5), ey + FA * 0.99)]; };
    if (st.pose === 'light') { P.arms = [ik(sL, P.tp(-6, -58), UA, FA, -1), st.reach ? ik(sR, st.reach, UA, FA, 1) : ik(sR, [20, -20], UA, FA, 1)]; }
    else if (st.pose === 'walk') { P.arms = [hang(-1), hang(1)]; }
    else if (st.pose === 'walkHold' && st.armsFree) { // the same 3/4 walk with his arms swinging from the shoulder, each opposite its leg, the elbow bending as the arm comes forward
      // (seen 3/4, a swing forward is partly toward us: the near arm's hand moves forward beside the thigh, never across the body)
      const u = P.walkU ?? 0, amp = st.speed ? clamp(st.speed * 0.011, 0.1, 0.4) : 0.04, arm = (sh, ph, out, k = 1) => { const A = armSwing(ph, amp * k, 0.2), a1 = A.sh + out, a2 = A.sh + out + A.el * (0.55 + 0.45 * k);
        const e = [sh[0] + Math.sin(a1) * UA, sh[1] + Math.cos(a1) * UA]; return [sh, e, [e[0] + Math.sin(a2) * FA, e[1] + Math.cos(a2) * FA]]; };
      P.arms = [arm(sL, u + 0.5, -0.12, 0.55), arm(sR, u, 0.06, 0.9)]; }
    else if (st.pose === 'walkHold') { // carrying the teddy on both palms in front of him (elbows low by his sides, the near shoulder brought round)
      const low = (a, g) => { const A = ik(a, g, UA, FA, 1), Bq = ik(a, g, UA, FA, -1); return A[1][1] >= Bq[1][1] ? A : Bq; }, sLf = P.tp(-SHW * 0.55, SHY + 0.8);
      P.arms = [low(sLf, P.tp(CARRY[0], CARRY[1])), low(sR, P.tp(CARRY[2], CARRY[3]))]; P.holdPt = P.tp(CARRY[4], CARRY[5]); P.twoHand = true; }
    else if (st.pose === 'offer') { // arms out in front, offering the teddy on both hands
      // (elbows bent and low by his sides, forearms forward, palms up under the teddy – a straight arm across the chest read as a band)
      const low = (a, g) => { const A = ik(a, g, UA, FA, 1), Bq = ik(a, g, UA, FA, -1); return A[1][1] >= Bq[1][1] ? A : Bq; };
      // reaching forward, the near shoulder comes round toward her (protraction), so both hands reach out to the same place
      const sLf = P.tp(-SHW * 0.52, SHY + 0.8);
      // st.offerAt (body space): the teddy is moving into her hands – his hands stay under it (the same grip, carried along)
      const hp = st.offerAt || P.tp(OFFER[4], OFFER[5]), dN = [OFFER[0] - OFFER[4], OFFER[1] - OFFER[5]], dF = [OFFER[2] - OFFER[4], OFFER[3] - OFFER[5]];
      P.arms = [low(sLf, [hp[0] + dN[0], hp[1] + dN[1]]), low(sR, [hp[0] + dF[0], hp[1] + dF[1]])]; P.holdPt = hp; P.twoHand = true; }
    else if (st.armT) P.arms = [ik(sL, st.armT[0], UA, FA, -1), ik(sR, st.armT[1], UA, FA, 1)];
    else if (st.hold && this.kn > 0.5 && P.legs[0]) { // Snowki on his knee: the far arm round behind him, the hand on his far shoulder; the near hand rests on the other thigh
      const hp = P.holdPt, th = P.legs[0][1], restB = [lerp(P.hip[0], th[0], 0.5) + 1, lerp(P.hip[1], th[1], 0.5) - 3.0];
      const low = (a, g) => { const A = ik(a, g, UA, FA, 1), Bq = ik(a, g, UA, FA, -1); return A[1][1] >= Bq[1][1] ? A : Bq; };
      P.arms = [ik(sL, restB, UA, FA, 1), low(sR, [hp[0] + 7.4, hp[1] - 7.6])]; P.cradle = 'knee'; }   // (the hand at Snowki's side, below his big head)
    else if (st.hold) { P.arms = [hang(-1), [sR, P.tp(13.8, -65.6), P.tp(2.4, -64.8)]]; P.cradle = true; }
    else if (st.wave) P.arms = [hang(-1), ik(sR, P.tp(17.5 + Math.sin(st.t * 8) * 3.4, -90 + Math.sin(st.t * 4) * 1.4), UA, FA, 1)];   // a happy wave beside his head
    else if (st.signal) P.arms = [hang(-1), ik(sR, P.tp(17, -92 - st.signal * 6), UA, FA, 1)];
    else if (st.pose === 'hide' || st.pose === 'peek' || st.pose === 'watch') { // the near arm hangs out of sight; the other hand holds the trunk
      // default grip: the trunk's edge (local x ≈ 10) at chest height; the film can pass st.reach = the real edge point
      const pk = st.pose === 'peek', tr = st.duck ? null : st.reach || (st.pose === 'watch' ? null : [pk ? 11.4 : 10.4, pk ? -70 : -75]);
      const lowElbow = (a, g) => { const A = ik(a, g, UA, FA, 1), Bq = ik(a, g, UA, FA, -1); return A[1][1] >= Bq[1][1] ? A : Bq; };
      P.arms = [hang(-1), tr ? (st.pose === 'watch' ? ik(sR, tr, UA, FA, 1) : lowElbow(sR, tr)) : hang(1)];
      P.grip = !!tr && st.pose !== 'watch';
    } else if (!st.reach && this.kn > 0.35 && P.legs[1]) { // kneeling: the near forearm rests on the raised knee, the hand hanging relaxed over it;
      // the far hand rests lightly on the thigh of the kneeling leg (never through the legs)
      const k = clamp((this.kn - 0.35) / 0.5, 0, 1), kn = P.legs[1][1], th = P.legs[0][1];
      const rest = [lerp(P.hip[0], kn[0], 0.66), lerp(P.hip[1], kn[1], 0.66) - 3.6], restB = [lerp(P.hip[0], th[0], 0.5) + 1, lerp(P.hip[1], th[1], 0.5) - 3.0];
      const hb = hang(-1), hf = hang(1), mixA = (A, Bq) => A.map((p, i) => [lerp(p[0], Bq[i][0], k), lerp(p[1], Bq[i][1], k)]);
      P.arms = [mixA(hb, ik(sL, restB, UA, FA, 1)), mixA(hf, ik(sR, rest, UA, FA, 1))];
    } else { // (kneeling while the other hand reaches – for Snowki, or the fuse – the near hand rests on his thigh instead of hanging through it)
      const th = this.kn > 0.5 && P.legs[0] ? P.legs[0][1] : null, near = th ? ik(sL, [lerp(P.hip[0], th[0], 0.5) + 1, lerp(P.hip[1], th[1], 0.5) - 3.0], UA, FA, 1) : hang(-1);
      P.arms = [near, st.reach ? ik(sR, st.reach, UA, FA, 1) : hang(1)]; }
    // which hands simply hang, swing or rest (drawn relaxed, from the thumb side) and which grip, hold, wave or reach
    P.relax = [!(P.twoHand || st.armT), !(P.twoHand || P.cradle || P.grip || st.armT || st.wave || st.signal || st.reach || st.pose === 'light')];
    P.head = P.tp(0.3, -86);
    return P;
  }
  // Optional overlay for 'hide' / 'peek': only the hand gripping the trunk, to be drawn IN FRONT of the tree layer (a second
  // actor view at the tree's depth, same place / flip / rot), so his fingers curl round the front of the trunk. Draws nothing otherwise.
  drawGrip(ctx) {
    const P = this.P; if (!P || !P.grip) return;
    ctx.save(); ctx.lineJoin = ctx.lineCap = 'round'; gripFingers(ctx, P.arms[1][2], BC.skin, BC.out); ctx.restore();
  }
  arm(ctx, j, side, curl = 0.4, relax = false, gift = false, cup = false, noHand = false) {   // relax: a hanging / swinging / resting hand, drawn from the thumb side
    const C = BC, [a, b, c] = j;
    ctx.save(); ctx.translate(-(side || 1) * 0.9, 0.7); ctx.fillStyle = 'rgba(60,40,90,.2)'; ctx.fill(limbPath(a, b, c, [4.4, 4.4, 4.7, 4.4, 3.0])); ctx.restore();   // the arm's shadow on the shirt
    limb(ctx, a, b, c, [4.0, 3.8, 4.3, 4.0, 2.75], C.skin, C.out, { lw: 0.18 });   // forearm: full below the elbow, slim at the wrist
    if (!noHand) { const d = [c[0] - b[0], c[1] - b[1]], l = Math.hypot(d[0], d[1]) || 1, w = [c[0] - d[0] / l * 0.3, c[1] - d[1] / l * 0.3];
      if (relax) relaxHand(ctx, w, d, C.skin, 1.18, C.out, side || 1, { gift });
      else if (cup) palmUpHand(ctx, w, [d[0] >= 0 ? 1 : -1, -0.12], C.skin, 1.22, C.out);
      else hand2(ctx, w, d, C.skin, 1.18, C.out, side || 1, curl); }
    const e = [a[0] + (b[0] - a[0]) * 1.06, a[1] + (b[1] - a[1]) * 1.06], mid = [(a[0] + e[0]) / 2, (a[1] + e[1]) / 2];
    limb(ctx, a, mid, e, [5.6, 5.4, 5.0, 4.9, 5.0], C.shirt, C.out, { shade: C.shirtS, light: C.shirtL, lw: 0.18 });
    const cd = [b[0] - a[0], b[1] - a[1]], cl = Math.hypot(cd[0], cd[1]) || 1, cn = [-cd[1] / cl * 2.4, cd[0] / cl * 2.4], cu = [cd[0] / cl * 0.9, cd[1] / cl * 0.9];
    const cuff = P2(`M${e[0] + cn[0] - cu[0]} ${e[1] + cn[1] - cu[1]} L${e[0] + cn[0] + cu[0]} ${e[1] + cn[1] + cu[1]} L${e[0] - cn[0] + cu[0]} ${e[1] - cn[1] + cu[1]} L${e[0] - cn[0] - cu[0]} ${e[1] - cn[1] - cu[1]} Z`);
    cel(ctx, cuff, C.cuffC, e[0] - 2.4, e[0] + 2.4, { lc: C.out, lw: 0.14, shade: C.shirtS });
  }
  armUpper(ctx, j) {   // the sleeve only (drawn behind what he holds)
    const C = BC, [a, b] = j, e = [a[0] + (b[0] - a[0]) * 1.06, a[1] + (b[1] - a[1]) * 1.06], mid = [(a[0] + e[0]) / 2, (a[1] + e[1]) / 2];
    ctx.save(); ctx.translate(0.9, 0.7); ctx.fillStyle = 'rgba(70,50,100,.22)'; ctx.fill(limbPath(a, mid, b, [4.4, 4.4, 4.2, 4.2, 4.0])); ctx.restore();
    limb(ctx, a, mid, e, [4.6, 4.5, 4.3, 4.3, 4.5], C.shirt, C.out, { shade: C.shirtS, light: C.shirtL, lw: 0.18 });
  }
  armLower(ctx, j, side) {   // forearm, a hand curled around what it holds, and the rolled cuff over the elbow
    const C = BC, [a, b, c] = j, m = [(b[0] + c[0]) / 2, (b[1] + c[1]) / 2];
    limb(ctx, b, m, c, [4.3, 4.2, 4.0, 3.5, 2.75], C.skin, C.out, { lw: 0.18 });
    { const d = [c[0] - b[0], c[1] - b[1]], l = Math.hypot(d[0], d[1]) || 1; hand2(ctx, [c[0] - d[0] / l * 0.3, c[1] - d[1] / l * 0.3], [0.62, -1], C.skin, 1.18, C.out, side || 1, 1.0); }
    const e = [a[0] + (b[0] - a[0]) * 1.06, a[1] + (b[1] - a[1]) * 1.06], cd = [b[0] - a[0], b[1] - a[1]], cl = Math.hypot(cd[0], cd[1]) || 1, cn = [-cd[1] / cl * 2.4, cd[0] / cl * 2.4], cu = [cd[0] / cl * 0.9, cd[1] / cl * 0.9];
    const cuff = P2(`M${e[0] + cn[0] - cu[0]} ${e[1] + cn[1] - cu[1]} L${e[0] + cn[0] + cu[0]} ${e[1] + cn[1] + cu[1]} L${e[0] - cn[0] + cu[0]} ${e[1] - cn[1] + cu[1]} L${e[0] - cn[0] - cu[0]} ${e[1] - cn[1] - cu[1]} Z`);
    cel(ctx, cuff, C.cuffC, e[0] - 2.4, e[0] + 2.4, { lc: C.out, lw: 0.14, shade: C.shirtS });
  }
  legs(ctx) {
    const C = BC, P = this.P, L = P.legs, order = P.legOrder ? P.legOrder.map(i => [L[i], i]) : L.map((l, i) => [l, i]);
    for (const [[hip, kn, an, lift], li] of order) {
      const go = {}, sgn = li === 0 ? -1 : 1;
      limb(ctx, hip, kn, an, [8.4, 7.4, 6.0, 5.2, 4.7], C.pant, 'rgba(10,10,20,.8)', { shade: '#000000', light: '#8A90A8', lw: 0.22, gradOut: go });
      // the seat: this half of the hips continues the leg (same gradient), so the trousers are one garment from the belt to the shoe
      { const h = P.hip, c0 = h[0] + 0.3, tp = [lerp(hip[0], kn[0], 0.42), lerp(hip[1], kn[1], 0.42)], hw = 4.1;
        const pts = [[c0, h[1] - 6.0], [h[0] + sgn * 8.7, h[1] - 5.8], [h[0] + sgn * 9.5, h[1] - 1.0], [tp[0] + sgn * hw, tp[1] - 0.6], [tp[0] - sgn * hw * 0.9, tp[1] + 0.6], [c0 + sgn * 0.2, h[1] + 4.4]];
        ctx.fillStyle = go.g; ctx.fill(smooth(pts, true)); line(ctx, smooth(pts.slice(1, 4), false), 'rgba(10,10,20,.8)', 0.22); }
      line(ctx, P2(`M${lerp(hip[0], kn[0], 0.3)} ${lerp(hip[1], kn[1], 0.3)} L${lerp(kn[0], an[0], 0.8)} ${lerp(kn[1], an[1], 0.8)}`), 'rgba(255,255,255,.07)', 0.5);
      { const d = [an[0] - kn[0], an[1] - kn[1]], l = Math.hypot(d[0], d[1]) || 1, c = [an[0] - d[0] / l * 3.2, an[1] - d[1] / l * 3.2], n = [-d[1] / l * 2.5, d[0] / l * 2.5]; line(ctx, P2(`M${c[0] - n[0]} ${c[1] - n[1]} L${c[0] + n[0]} ${c[1] + n[1]}`), 'rgba(0,0,0,.35)', 0.35); }   // the hem
      if (lift > 0.05 && P.back) { const so = P2(`M${an[0] - 2.6} ${an[1] - 0.6} C${an[0] - 2.8} ${an[1] + 1.6} ${an[0] + 2.8} ${an[1] + 1.6} ${an[0] + 2.6} ${an[1] - 0.6} C${an[0] + 1.6} ${an[1] - 1.8} ${an[0] - 1.6} ${an[1] - 1.8} ${an[0] - 2.6} ${an[1] - 0.6} Z`);
        cel(ctx, so, '#3A3236', an[0] - 2.6, an[0] + 2.6, { lc: 'rgba(0,0,0,.6)' }); fill(ctx, P2(`M${an[0] - 1.9} ${an[1] + 0.2} C${an[0] - 1.6} ${an[1] + 1.2} ${an[0] + 1.6} ${an[1] + 1.2} ${an[0] + 1.9} ${an[1] + 0.2} Z`), 'rgba(200,190,180,.55)'); continue; }
      // the shoe pivots at the ankle (toes up at heel strike, heel up at toe-off); the sole stays a line
      const pit = P.feet && P.feet[li] != null ? P.feet[li] : 0;
      ctx.save(); ctx.translate(an[0], an[1] + 0.7); ctx.rotate(-pit);
      cel(ctx, P2('M-2.8 -2.3 C-3.4 0.2 -2.8 1.5 -1.0 1.9 L5.0 1.9 C6.2 1.8 6.5 0.5 5.5 -0.2 C4.3 -0.8 2.6 -1.1 1.6 -2.1 C0.4 -2.6 -1.7 -2.8 -2.8 -2.3 Z'), C.shoe, -3, 6.4, { lc: 'rgba(0,0,0,.6)', shade: '#000000' });
      fill(ctx, P2('M-3.0 1.3 L6.2 1.3 L6.3 2.0 C6.0 2.4 5.2 2.4 4.8 2.4 L-1.0 2.4 C-2.4 2.3 -3.0 1.9 -3.0 1.3 Z'), '#CFC8C0');
      line(ctx, P2('M0.8 -1.9 C1.8 -1.6 2.8 -1.1 3.8 -0.4'), 'rgba(200,190,180,.35)', 0.22);
      ctx.restore();
    }
  }
  shirt(ctx, t, back) {   // a fitted, buttoned shirt on a natural torso (shoulders, a V-taper to the waist), tucked in at a belt at his waist
    const C = BC;
    const body = smooth([[-3.8, -84.6], [-7.8, -83.9], [-11.0, -81.8], [-11.9, -77.8], [-11.2, -72.5], [-10.4, -67], [-9.5, -62.2], [-8.8, -58.4], [-9.0, -56.8], [9.4, -56.8], [9.2, -58.4], [9.9, -62.2], [10.9, -67], [11.7, -72.5], [12.3, -77.8], [11.4, -81.8], [8.2, -83.9], [4.0, -84.6], [0.3, -83.8]], true);
    cel(ctx, body, C.shirt, -11.6, 12.4, { lc: C.out, shade: C.shirtS, light: C.shirtL });
    ctx.save(); ctx.clip(body);
    { const g = ctx.createLinearGradient(0, -80, 0, -57); g.addColorStop(0, 'rgba(40,30,70,0)'); g.addColorStop(1, 'rgba(40,30,70,.2)'); ctx.fillStyle = g; ctx.fillRect(-13, -86, 27, 30); }
    { const g = ctx.createLinearGradient(-12, 0, 12.6, 0); g.addColorStop(0, 'rgba(60,45,110,.24)'); g.addColorStop(0.2, 'rgba(60,45,110,0)'); g.addColorStop(0.8, 'rgba(60,45,110,0)'); g.addColorStop(1, 'rgba(60,45,110,.3)'); ctx.fillStyle = g; ctx.fillRect(-13, -86, 27, 30); }
    for (const [x0, y0, x1, y1] of [[-8.8, -62, -4.6, -58.6], [9.2, -62, 5, -58.8], [-10.2, -70, -8.2, -64.5], [10.9, -70.5, 8.7, -64.8]]) line(ctx, P2(`M${x0} ${y0} Q${(x0 + x1) / 2 + (x1 > x0 ? 0.2 : -0.2)} ${(y0 + y1) / 2 - 0.5} ${x1} ${y1}`), rgba(C.shirtS, 0.4), 0.26);   // the pull of the tuck, the fabric over the ribs
    for (const [x0, x1, d] of [[-11.6, -10.2, 1], [12.2, 10.9, -1]]) line(ctx, P2(`M${x0} -81.4 C${x0 + d * 0.9} -77 ${x1 + d * 0.2} -74 ${x1} -69`), rgba(C.shirtS, 0.55), 0.3);   // the armhole seams
    if (!back) {
      // the black tee in the open collar, the placket with its buttons, a pocket on his left chest, the two collar flaps
      fill(ctx, P2('M-4.3 -84.2 C-2.0 -83.0 3.0 -83.0 5.2 -84.2 L0.9 -75.2 Z'), C.tee); line(ctx, P2('M-4.0 -83.7 C-2.0 -82.7 2.8 -82.7 4.9 -83.7'), 'rgba(110,108,124,.8)', 0.3);
      line(ctx, P2('M0.9 -75.4 C1.0 -68 1.0 -62 0.9 -57'), rgba(C.shirtS, 0.7), 0.34); line(ctx, P2('M1.5 -75.4 C1.6 -68 1.6 -62 1.5 -57'), rgba(C.shirtL, 0.5), 0.2);
      for (let i = 0; i < 3; i++) { const by = -71 + i * 5.8; fill(ctx, ell(0.9, by, 0.5, 0.5), '#8E82B4'); fill(ctx, ell(0.8, by - 0.12, 0.17, 0.17), 'rgba(255,255,255,.6)'); }
      const pk = P2('M6.2 -74.2 L10.0 -74.4 L10.1 -70.2 C9.1 -69.6 7.2 -69.6 6.2 -70.1 Z'); line(ctx, pk, rgba(C.shirtS, 0.8), 0.26); line(ctx, P2('M6.1 -73.4 L10.1 -73.6'), rgba(C.shirtS, 0.6), 0.22);
    } else { // the back: a yoke seam across the shoulders and a centre fold
      line(ctx, P2('M-10.6 -77.4 C-3 -75.4 3 -75.4 11.2 -77.4'), rgba(C.shirtS, 0.6), 0.28); line(ctx, P2('M0.4 -75.6 C0.5 -68 0.5 -62 0.3 -57.2'), rgba(C.shirtS, 0.45), 0.3);
    }
    ctx.restore();
    if (!back) for (const [pts, mx] of [[[[-4.6, -85.0], [-1.4, -82.4], [-3.4, -78.6], [-7.2, -82.0]], -1], [[[5.8, -85.0], [2.4, -82.2], [4.2, -78.4], [8.4, -82.1]], 1]]) {
      const f = P2(`M${pts[0][0]} ${pts[0][1]} L${pts[1][0]} ${pts[1][1]} L${pts[2][0]} ${pts[2][1]} L${pts[3][0]} ${pts[3][1]} Z`); cel(ctx, f, C.shirt, mx < 0 ? -7.2 : 2.4, mx < 0 ? -1.4 : 8.4, { lc: C.out, lw: 0.2, shade: C.shirtS, light: C.shirtL }); }
    else { cel(ctx, P2('M-3.8 -84.8 C-1.2 -86.0 1.6 -86.0 4.2 -84.8 L4.1 -82.8 C1.4 -83.8 -1.2 -83.8 -3.7 -82.8 Z'), C.shirt, -3.8, 4.2, { lc: C.out, lw: 0.2, shade: C.shirtS, light: C.shirtL }); }
    // the belt, with its buckle
    cel(ctx, P2('M-9.2 -59.4 Q0.4 -58.8 9.7 -59.4 L9.7 -56.6 Q0.4 -56.0 -9.2 -56.6 Z'), '#2A1F1B', -9.2, 9.7, { lc: 'rgba(0,0,0,.7)', lw: 0.16, shade: '#000000', light: '#5A4A42' });
    if (!back) { cel(ctx, P2('M-0.2 -59.7 L2.2 -59.7 L2.2 -56.3 L-0.2 -56.3 Z'), '#C9A66B', -0.2, 2.2, { lc: 'rgba(80,50,20,.8)', lw: 0.14 }); fill(ctx, P2('M0.3 -58.9 L1.7 -58.9 L1.7 -57.0 L0.3 -57.0 Z'), '#2A1F1B'); }
  }
  curls(ctx, t, cx, cy, back) {
    const C = BC, jig = clamp(this.curl.x, -0.16, 0.16) + Math.sin(t * 1.8) * 0.04, base = [];   // (a breeze stirs the curls; it never sweeps them into a crest)
    const a0 = back ? 0.25 : Math.PI * 1.03, a1 = back ? Math.PI * 2.75 : Math.PI * 2.02, N = back ? 18 : 16;
    for (let i = 0; i <= N; i++) { const a = a0 + (a1 - a0) * i / N, up = Math.max(0, -Math.sin(a)); base.push([cx + Math.cos(a) * (6.5 + up * 0.4) + jig * (1 - Math.sin(a)) * 6 - up * up * 0.6, cy + Math.sin(a) * (5.8 + up * 1.5) - up * 0.4]); }   // volume on top, swept back
    const hl = back ? [[cx + 3.4, cy + 5.4], [cx, cy + 6.2], [cx - 3.4, cy + 5.4]] : [[5.0, -95.4], [3.4, -96.9], [1.6, -97.4], [-0.3, -97.3], [-2.2, -97.5], [-3.8, -96.6], [-4.9, -94.6]];
    const path = new Path2D(); path.moveTo(base[0][0], base[0][1]);
    for (let i = 1; i < base.length; i++) { const p = base[i - 1], q = base[i], mx = (p[0] + q[0]) / 2, my = (p[1] + q[1]) / 2, dx = mx - cx, dy = my - cy, d = Math.hypot(dx, dy) || 1, k = (0.75 + 0.2 * Math.sin(i * 2.3)) * (back ? 1.1 : 0.9); path.quadraticCurveTo(mx + dx / d * k * 1.6 - (back ? 0 : 0.35), my + dy / d * k * 1.6, q[0], q[1]); }   // soft waves
    for (let i = 0; i < hl.length; i++) { const p = i ? hl[i - 1] : base[base.length - 1], q = hl[i]; path.quadraticCurveTo((p[0] + q[0]) / 2, (p[1] + q[1]) / 2 + 0.7, q[0], q[1]); }
    path.closePath();
    cel(ctx, path, C.hair, cx - 7, cx + 7, { lc: 'rgba(40,25,25,.8)', lw: 0.2, shade: '#000000' });
    ctx.save(); ctx.clip(path); const R = rng(17);
    for (let i = 0; i < 16; i++) { // wavy strands swept up from the hairline and back over the crown
      const u = i / 15, x0 = cx + lerp(4.8, -5.6, u) + (back ? 0 : 0.4), y0 = cy + 3.4 - Math.sin(u * Math.PI) * 1.6, x1 = x0 - 3.2 - R() * 1.6, y1 = cy - 6.6 - Math.sin(u * Math.PI) * 1.8 + R() * 1.2, w = 0.6 + R() * 0.5;
      line(ctx, P2(`M${x0 + jig} ${y0} C${x0 + w + jig} ${(y0 * 2 + y1) / 3} ${x1 - w + jig * 1.5} ${(y0 + y1 * 2) / 3} ${x1 + jig * 2} ${y1}`), rgba(i % 3 ? C.hairHi : '#857060', i % 3 ? 0.42 : 0.3), 0.18); }
    for (let i = 0; i < 9; i++) { const a = R() * 6.283, d = Math.sqrt(R()) * 4.6, x = cx + Math.cos(a) * d, y = cy + Math.sin(a) * d * 0.9 - 2.2, q = new Path2D(); q.arc(x + jig, y, 0.9 + R() * 0.5, Math.PI * 1.1, Math.PI * 1.85); line(ctx, q, rgba(C.hairHi, 0.3), 0.15); }   // a few waves
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
    let es = ex === 'contentment' || ex === 'smile' ? 'soft' : ex === 'farewell' ? 'happy' : 'open'; if (this.blink > 0 && es !== 'happy') es = 'closed';
    const gx = st.look || 0, gy = st.gazeY || 0;
    animeEye(ctx, -1.55, -93.1, 2.9, 3.0, es, C, gx, gy, st.eyeLights);
    animeEye(ctx, 2.95, -93.2, 2.45, 2.85, es, C, gx, gy, st.eyeLights);
    const bu = ex === 'watching' ? -0.15 : 0;
    fill(ctx, P2(`M-3.4 ${-95.6 + bu} C-2.3 ${-96.8 + bu} -0.6 ${-96.9 + bu} 0.35 ${-96.25 + bu} L0.25 ${-95.65 + bu} C-0.8 ${-96.15 + bu} -2.3 ${-95.95 + bu} -3.4 ${-95.6 + bu} Z`), '#150D0D');
    fill(ctx, P2(`M1.75 ${-96.3 + bu} C2.7 ${-96.95 + bu} 4.0 ${-96.75 + bu} 4.75 ${-95.7 + bu} L4.6 ${-95.3 + bu} C3.8 ${-96.05 + bu} 2.7 ${-95.95 + bu} 1.75 ${-95.7 + bu} Z`), '#150D0D');
    line(ctx, P2('M2.3 -92.0 C2.8 -90.9 3.2 -90.1 2.75 -89.5 C2.25 -89.0 1.5 -89.2 1.15 -89.5'), rgba(C.skinD, 1), 0.24);
    const sm = ex === 'watching' ? 0.15 : ex === 'contentment' ? 0.7 : ex === 'smile' ? 1.0 : 0.9;
    if (st.talk && Math.sin(st.t * 15) + Math.sin(st.t * 9.7) > 0) { fill(ctx, ell(1.25, -87.6, 1.2, 0.55 + 0.25 * Math.abs(Math.sin(st.t * 15)), 0), '#5A2026'); fill(ctx, ell(1.25, -87.3, 0.7, 0.18), '#C8606A'); }
    else line(ctx, P2(`M-0.3 ${-87.9} C0.6 ${-87.9 + 0.65 * sm} 1.9 ${-87.9 + 0.65 * sm} 2.75 ${-87.95}`), C.lip, 0.34);
    line(ctx, P2('M0.4 -86.9 C0.9 -86.7 1.5 -86.7 2.0 -86.9'), rgba(C.skinD, 0.6), 0.16);
    // facial hair: the shadow of a beard along the jaw, a thin moustache, a goatee on the chin
    ctx.save(); ctx.clip(face); { const jg = ctx.createLinearGradient(0, -90.5, 0, -85); jg.addColorStop(0, 'rgba(26,17,16,0)'); jg.addColorStop(0.55, 'rgba(26,17,16,.16)'); jg.addColorStop(1, 'rgba(26,17,16,.32)'); ctx.fillStyle = jg; ctx.fillRect(-6, -90.5, 12, 6); } ctx.restore();
    fill(ctx, P2('M-0.7 -88.35 C0.1 -88.95 0.9 -88.75 1.25 -88.5 C1.6 -88.75 2.4 -88.95 3.2 -88.35 C2.4 -88.45 1.7 -88.3 1.25 -88.15 C0.8 -88.3 0.0 -88.45 -0.7 -88.35 Z'), rgba(C.beard, 0.85));
    fill(ctx, P2('M0.15 -86.45 C0.7 -86.15 1.8 -86.15 2.35 -86.45 C2.55 -85.7 2.0 -85.05 1.25 -84.95 C0.5 -85.05 -0.05 -85.7 0.15 -86.45 Z'), rgba(C.beard, 0.9));
    line(ctx, P2('M-0.3 -87.4 C-0.4 -86.6 -0.2 -85.9 0.3 -85.5'), rgba(C.beard, 0.35), 0.22); line(ctx, P2('M2.8 -87.4 C2.9 -86.6 2.7 -85.9 2.2 -85.5'), rgba(C.beard, 0.35), 0.22);
  }
  draw(ctx, st) {
    const C = BC, P = this.P, t = st.t, back = st.pose === 'walk';
    if (back) { // walking away, seen from behind; may glance back over his shoulder
      this.legs(ctx); P.arms.forEach((a, i) => this.arm(ctx, a, i ? 1 : -1)); ctx.save(); ctx.translate(P.hip[0], P.hip[1] - HIPY); ctx.rotate(P.lean); this.shirt(ctx, t, true);
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
    ctx.save(); ctx.translate(P.hip[0], P.hip[1]); ctx.rotate(P.lean); ctx.translate(0, -HIPY);
    cel(ctx, P2('M-2.1 -86.8 L-2.3 -82.2 L2.9 -82.0 L2.7 -86.4 Z'), C.skin, -2.3, 2.9, { line: false });
    this.shirt(ctx, t, false);
    ctx.translate(0.3, -86); ctx.rotate(P.headTilt + Math.sin(t * 0.8) * 0.01); ctx.translate(-0.3, 86);
    this.face(ctx, st); this.curls(ctx, t, 0.3, -98.8, false);
    ctx.restore();
    if (P.twoHand) { // offer / walkHold: far arm, the teddy between his hands, near arm – the fingers wrap round it
      // (palms up under the teddy, the wrists bent so the hands lie level – not hanging on along the forearms)
      this.arm(ctx, P.arms[1], 1, 0.85, false, false, true); if (st.held) st.held(ctx, P.holdPt, { s: 0.72, back: false }); this.arm(ctx, P.arms[0], -1, 0.85, false, false, true);
      return;
    }
    const knee = P.cradle === 'knee' && st.held, cradle = !knee && P.cradle && st.held;
    if (knee) { // his arm behind Snowki (on his knee), then Snowki, then only the hand, its fingers over Snowki's shoulder
      this.arm(ctx, P.arms[1], 1, 0.5, false, false, false, true); st.held(ctx, P.holdPt);
      const c = P.arms[1][2]; hand2(ctx, [c[0] + 0.2, c[1] - 0.2], [-1, 0.26], BC.skin, 1.04, BC.out, -1, 0.72); }
    else if (cradle) { this.armUpper(ctx, P.arms[1]); st.held(ctx, P.holdPt); this.armLower(ctx, P.arms[1], 1); }
    else if (st.held) st.held(ctx, P.holdPt);
    this.arm(ctx, P.arms[0], -1, 0.4, P.relax[0], !!st.gift && P.relax[0]);   // (the little gift is held in this hand)
    if (!cradle && !knee) this.arm(ctx, P.arms[1], 1, P.grip ? 0.95 : 0.4, P.relax[1], false, false, !!P.grip);   // (holding the tree: the fingers are drawn in front of it by drawGrip)   // hiding: fingers curled round the trunk
    if (st.flame && !P.back) { // a tiny lighter flame in his hand
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

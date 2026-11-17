// Core math: easing, randomness, simplex + curl noise, colours, splines.
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const invLerp = (a, b, v) => clamp((v - a) / (b - a), 0, 1);
export const smooth = t => t * t * (3 - 2 * t);
export const smoothstep = (a, b, x) => smooth(invLerp(a, b, x));
export const ease = {
  inOut: t => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
  inOutCubic: t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  inOutSine: t => -(Math.cos(Math.PI * t) - 1) / 2,
  out: t => 1 - (1 - t) * (1 - t),
  outCubic: t => 1 - Math.pow(1 - t, 3),
  in: t => t * t,
  inOutExpo: t => (t === 0 ? 0 : t === 1 ? 1 : t < 0.5 ? Math.pow(2, 20 * t - 10) / 2 : (2 - Math.pow(2, -20 * t + 10)) / 2),
  outBack: t => { const c = 1.4; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); }
};
export function rng(seed = 1) { let s = seed >>> 0 || 1; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
export const R = rng(20261201);
export const rand = (a = 0, b = 1) => a + (b - a) * R();
export const pick = a => a[(R() * a.length) | 0];

// ---- simplex noise (2D / 3D), seeded
const grad3 = new Float32Array([1, 1, 0, -1, 1, 0, 1, -1, 0, -1, -1, 0, 1, 0, 1, -1, 0, 1, 1, 0, -1, -1, 0, -1, 0, 1, 1, 0, -1, 1, 0, 1, -1, 0, -1, -1]);
const perm = new Uint8Array(512), pm12 = new Uint8Array(512);
{ const p = new Uint8Array(256), r = rng(7); for (let i = 0; i < 256; i++) p[i] = i; for (let i = 255; i > 0; i--) { const j = (r() * (i + 1)) | 0; [p[i], p[j]] = [p[j], p[i]]; } for (let i = 0; i < 512; i++) { perm[i] = p[i & 255]; pm12[i] = perm[i] % 12; } }
const F2 = 0.5 * (Math.sqrt(3) - 1), G2 = (3 - Math.sqrt(3)) / 6, F3 = 1 / 3, G3 = 1 / 6;
export function noise2(xin, yin) {
  const s = (xin + yin) * F2, i = Math.floor(xin + s), j = Math.floor(yin + s), t = (i + j) * G2;
  const x0 = xin - i + t, y0 = yin - j + t, i1 = x0 > y0 ? 1 : 0, j1 = 1 - i1;
  const x1 = x0 - i1 + G2, y1 = y0 - j1 + G2, x2 = x0 - 1 + 2 * G2, y2 = y0 - 1 + 2 * G2, ii = i & 255, jj = j & 255;
  let n = 0, t0 = 0.5 - x0 * x0 - y0 * y0, g;
  if (t0 > 0) { g = pm12[ii + perm[jj]] * 3; t0 *= t0; n += t0 * t0 * (grad3[g] * x0 + grad3[g + 1] * y0); }
  let t1 = 0.5 - x1 * x1 - y1 * y1; if (t1 > 0) { g = pm12[ii + i1 + perm[jj + j1]] * 3; t1 *= t1; n += t1 * t1 * (grad3[g] * x1 + grad3[g + 1] * y1); }
  let t2 = 0.5 - x2 * x2 - y2 * y2; if (t2 > 0) { g = pm12[ii + 1 + perm[jj + 1]] * 3; t2 *= t2; n += t2 * t2 * (grad3[g] * x2 + grad3[g + 1] * y2); }
  return 70 * n;
}
export function noise3(x, y, z) {
  const s = (x + y + z) * F3, i = Math.floor(x + s), j = Math.floor(y + s), k = Math.floor(z + s), t = (i + j + k) * G3;
  const x0 = x - i + t, y0 = y - j + t, z0 = z - k + t;
  let i1, j1, k1, i2, j2, k2;
  if (x0 >= y0) { if (y0 >= z0) { i1 = 1; j1 = 0; k1 = 0; i2 = 1; j2 = 1; k2 = 0; } else if (x0 >= z0) { i1 = 1; j1 = 0; k1 = 0; i2 = 1; j2 = 0; k2 = 1; } else { i1 = 0; j1 = 0; k1 = 1; i2 = 1; j2 = 0; k2 = 1; } }
  else { if (y0 < z0) { i1 = 0; j1 = 0; k1 = 1; i2 = 0; j2 = 1; k2 = 1; } else if (x0 < z0) { i1 = 0; j1 = 1; k1 = 0; i2 = 0; j2 = 1; k2 = 1; } else { i1 = 0; j1 = 1; k1 = 0; i2 = 1; j2 = 1; k2 = 0; } }
  const x1 = x0 - i1 + G3, y1 = y0 - j1 + G3, z1 = z0 - k1 + G3, x2 = x0 - i2 + 2 * G3, y2 = y0 - j2 + 2 * G3, z2 = z0 - k2 + 2 * G3, x3 = x0 - 1 + 0.5, y3 = y0 - 1 + 0.5, z3 = z0 - 1 + 0.5;
  const ii = i & 255, jj = j & 255, kk = k & 255;
  let n = 0;
  const c = (tx, ty, tz, gi) => { let tt = 0.6 - tx * tx - ty * ty - tz * tz; if (tt < 0) return 0; const g = gi * 3; tt *= tt; return tt * tt * (grad3[g] * tx + grad3[g + 1] * ty + grad3[g + 2] * tz); };
  n += c(x0, y0, z0, pm12[ii + perm[jj + perm[kk]]]);
  n += c(x1, y1, z1, pm12[ii + i1 + perm[jj + j1 + perm[kk + k1]]]);
  n += c(x2, y2, z2, pm12[ii + i2 + perm[jj + j2 + perm[kk + k2]]]);
  n += c(x3, y3, z3, pm12[ii + 1 + perm[jj + 1 + perm[kk + 1]]]);
  return 32 * n;
}
// divergence-free 2D flow (curl of a scalar noise field) – used for sparks, motes, petals
export function curl(x, y, t, out) {
  const e = 0.01, n1 = noise3(x, y + e, t), n2 = noise3(x, y - e, t), n3 = noise3(x + e, y, t), n4 = noise3(x - e, y, t);
  out[0] = (n1 - n2) / (2 * e); out[1] = -(n3 - n4) / (2 * e); return out;
}

// ---- colours (0..1 floats)
export function hex(c) { const n = parseInt(c.slice(1), 16); return [(n >> 16) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]; }
export const mix3 = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
export const css = (c, a = 1) => `rgba(${Math.round(c[0] * 255)},${Math.round(c[1] * 255)},${Math.round(c[2] * 255)},${a})`;
export const shadeHex = (c, k) => { const v = hex(c); const t = k >= 0 ? mix3(v, [1, 1, 1], k) : mix3(v, [0, 0, 0], -k); return css(t); };
export const PALETTE = { peach: '#FFB88C', gold: '#FFD27A', pink: '#FF9EC4', lavender: '#B9A3FF', sky: '#8EC9FF', dusk: '#2A1B4D', navy: '#0B1030' };

// ---- splines
export function catmull(p0, p1, p2, p3, t, out) {
  const t2 = t * t, t3 = t2 * t;
  for (let i = 0; i < 2; i++) out[i] = 0.5 * (2 * p1[i] + (-p0[i] + p2[i]) * t + (2 * p0[i] - 5 * p1[i] + 4 * p2[i] - p3[i]) * t2 + (-p0[i] + 3 * p1[i] - 3 * p2[i] + p3[i]) * t3);
  return out;
}

// Particle systems (simulated on the CPU in typed arrays, drawn on the GPU as instanced sprites):
// fireworks that spell her name, the golden thread + fireflies, lanterns, petals, wish petals, motes, smoke,
// the constellation heart, balloons and strollers. Every system advances with the bullet-time-scaled dt.
import { clamp, lerp, rand, noise2, noise3, curl, ease } from './core.js';
import { HZ, unitScale } from './space.js';

export const SKY_GY = HZ + 9;            // depth of the fireworks / message (far, barely parallaxes)
const C2 = [0, 0];

// ---------------------------------------------------------------- CPU sprite list (shared by both renderers)
export class SpriteList {
  constructor(max) { this.max = max; this.data = new Float32Array(max * 16); this.n = 0; }
  reset() { this.n = 0; }
  push(x, y, gy, rot, w, h, sx, sy, r, g, b, a, uv) {
    if (this.n >= this.max) return; const o = this.n++ * 16, d = this.data;
    d[o] = x; d[o + 1] = y; d[o + 2] = gy; d[o + 3] = rot; d[o + 4] = w; d[o + 5] = h; d[o + 6] = sx; d[o + 7] = sy; d[o + 8] = r; d[o + 9] = g; d[o + 10] = b; d[o + 11] = a;
    if (uv) { d[o + 12] = uv[0]; d[o + 13] = uv[1]; d[o + 14] = uv[2]; d[o + 15] = uv[3]; } else { d[o + 12] = 0; d[o + 13] = 0; d[o + 14] = -1; d[o + 15] = 0; }
  }
}

// colour cooling of a spark: white -> gold -> orange -> ember
function cool(u, out) {
  if (u < 0.15) { const k = u / 0.15; out[0] = 1; out[1] = lerp(1, 0.86, k); out[2] = lerp(0.95, 0.5, k); }
  else if (u < 0.5) { const k = (u - 0.15) / 0.35; out[0] = 1; out[1] = lerp(0.86, 0.55, k); out[2] = lerp(0.5, 0.2, k); }
  else { const k = (u - 0.5) / 0.5; out[0] = lerp(1, 0.55, k); out[1] = lerp(0.55, 0.14, k); out[2] = lerp(0.2, 0.05, k); }
  return out;
}

// ---------------------------------------------------------------- fireworks
// The whole fire concept lives here. He lights the free end of a long green visco fuse lying on the ground; a fizzing,
// white-hot spark runs along it (sparks, glowing embers behind, a little smoke, orange light on the ground); it disappears
// into the mortar – a beat of anticipation (a hiss, sparks spitting from the mouth) – then the LAUNCH: a thump, a muzzle
// flash, a puff of smoke and sparks, and the shell climbs high on a glowing, crackling golden trail. High in the sky it
// bursts: chrysanthemums with sparkling tails, peonies, willows, crossettes, a heart, rings; crackle at the tips, glitter
// that twinkles and falls, smoke lit by the flashes.
// Sky particles go into the emissive list (composited behind the scene and mirrored in the sea); everything at the
// launcher (fuse, lighter flame, muzzle flash, the climbing shell and its trail, ground smoke) goes into nearL (additive)
// and nearA (alpha), which the frame draws at the launcher's depth (nearY) so it sits in front of the tree and behind
// nearer things. Light leaves the system three ways: light (characters, eyes, bloom), nearLight (the man and the launcher
// while the fuse burns / the mortar fires) and seaLights() (shimmering columns of colour on the water).
export const FW_PAL = {
  gold: [1, 0.72, 0.3], amber: [1, 0.5, 0.16], pink: [1, 0.36, 0.7], rose: [1, 0.6, 0.84], purple: [0.68, 0.34, 1], violet: [0.5, 0.36, 1],
  blue: [0.28, 0.52, 1], cyan: [0.45, 0.85, 1], silver: [0.86, 0.9, 1], white: [1, 0.96, 0.88], red: [1, 0.24, 0.28], green: [0.4, 1, 0.5]
};
const HUES = ['gold', 'pink', 'blue', 'purple'];
const colOf = c => (Array.isArray(c) ? c : typeof c === 'number' ? FW_PAL[HUES[((c % 4) + 4) % 4]] : FW_PAL[c] || FW_PAL.gold);
const mixc = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
const smst = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const TRAIL = 0, STAR = 1, POP = 3, WILLOW = 4, FUSE = 5, GLIT = 6, SPARK = 7;
const F_TRAIL = 1, F_CRACKLE = 2, F_SPLIT = 4, F_GLIT = 8, F_STROBE = 16, F_CHANGE = 32, F_NEAR = 64;
const nearU = gy => Math.max(unitScale(gy) * 0.8, 2.4); // world units per "spark unit": big at the launcher, never too small to see in the sky
const WHITE = [1, 0.97, 0.9];

// the fuse cord through ground points pts = [[x, gy], ...] (his end first; Catmull-Rom, about one point per 2 character
// units), rising at the end into the mortar's inlet b = [x, y, gy]
export function fuseThrough(pts, b) {
  const P = pts.map(p => [p[0], p[1]]); P.push([b[0], b[2]]); const out = [];
  for (let i = 0; i < P.length - 1; i++) {
    const p0 = P[Math.max(0, i - 1)], p1 = P[i], p2 = P[i + 1], p3 = P[Math.min(P.length - 1, i + 2)], len = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) / unitScale((p1[1] + p2[1]) / 2);
    const n = Math.max(3, Math.min(40, Math.round(len / 2)));
    for (let k = 0; k < n; k++) { const t = k / n, t2 = t * t, t3 = t2 * t, cr = (a, b2, c, d) => 0.5 * (2 * b2 + (c - a) * t + (2 * a - 5 * b2 + 4 * c - d) * t2 + (3 * b2 - a - 3 * c + d) * t3);
      const x = cr(p0[0], p1[0], p2[0], p3[0]), gy = cr(p0[1], p1[1], p2[1], p3[1]); out.push([x, gy - 0.35 * unitScale(gy), gy]); }
  }
  out.push([b[0], b[1], b[2]]);
  const lift = Math.max(0, b[2] - b[1]), m = Math.min(4, out.length - 1);    // the last bit climbs into the inlet
  for (let k = 1; k < m; k++) { const o = out[out.length - 1 - k]; o[1] -= lift * (1 - k / m); }
  return out;
}
// a gently curving fuse lying on the promenade from its free end a = [x, y, gy] (y = gy on the ground) to the inlet b = [x, y, gy]
export function fusePath(a, b, n = 30) {
  const out = [], lift = Math.max(0, b[2] - b[1]), s = unitScale((a[2] + b[2]) / 2);
  for (let i = 0; i < n; i++) {
    const u = i / (n - 1), gy = lerp(a[2], b[2], u) + Math.sin(u * Math.PI) * 3.2 * s + Math.sin(u * Math.PI * 3) * 0.8 * s;
    const x = lerp(a[0], b[0], u) + Math.sin(u * Math.PI * 2) * 2.4 * s;
    out.push([x, gy - 0.35 * s - lift * smst(0.82, 1, u), gy]);
  }
  return out;
}

export class Fireworks {
  constructor(max, hooks = {}) {
    this.max = max; this.hooks = hooks; this.k = clamp(max / 9100, 0.35, 1);       // quality: fewer stars and sparks on small tiers
    const F = n => new Float32Array(n);
    for (const a of ['x', 'y', 'vx', 'vy', 'life', 'ml', 'gy', 'size', 'seed', 'age', 'drag', 'grav', 'cr', 'cg', 'cb', 'dr', 'dg', 'db', 'split', 'acc']) this[a] = F(max);
    this.kind = new Uint8Array(max); this.fl = new Uint8Array(max); this.alive = new Uint8Array(max);
    this.free = []; for (let i = max - 1; i >= 0; i--) this.free.push(i);
    this.rockets = []; this.flashes = []; this.recent = []; this.smoke = []; this.queue = []; this.muz = [];
    this.light = { x: 800, y: 300, k: 0, r: 1, g: 0.85, b: 0.6 };
    this.nearLight = { x: 0, y: 0, gy: 820, k: 0, r: 1, g: 0.6, b: 0.28, rad: 46 };
    this.nearA = new SpriteList(700); this.nearL = new SpriteList(2600); this.nearY = 825;          // at the launcher's depth
    this.frontA = new SpriteList(500); this.frontL = new SpriteList(900); this.frontY = 825; this.splitGy = 825;   // nearer: his end of the fuse, the stick
    this.t = 0; this.L = null; this.uv = null; this.fuseP = null; this.fuseS = null; this.armed = null; this.flame = null;
    this.targets = null; this.letterAlpha = 1; this.shimmer = 1;
  }
  // the launcher layer (world.js crate(): top, mouths, fuse, fuseIn, fusePts, gy), the sprite atlas uvs (white, smoke) and
  // optionally his end of the fuse [x, y, gy] (otherwise the cord follows PLACE.fuse / the layer's default)
  setLauncher(L, uv, tip = null) {
    this.L = L || null; this.uv = uv || null; if (!L) return;
    this.nearY = (L.gy ?? L.top[2]) + 0.6;
    if (tip) L.fuse = tip;                                                   // his end of the fuse (where the lighting stick goes)
    this.fuseP = L.fusePts && !tip ? fuseThrough(L.fusePts, L.fuseIn) : L.fuse && L.fuseIn ? fusePath(L.fuse, L.fuseIn) : null;
    const gmax = this.fuseP ? Math.max(...this.fuseP.map(p => p[2])) : this.nearY;
    this.frontY = Math.max(this.nearY, gmax + 1.2); this.splitGy = (this.nearY + this.frontY) / 2;
  }
  spawn() { return this.free.length ? this.free.pop() : -1; }
  kill(i) { this.alive[i] = 0; this.free.push(i); }
  emit(kind, x, y, vx, vy, life, gy, size, c = 0, fl = 0, drag = 1.2, grav = 60, c2 = null) {
    if ((kind === TRAIL || kind === GLIT || kind === POP) && this.free.length < this.max * 0.15) return -1;   // keep room for the stars of the next burst
    const i = this.spawn(); if (i < 0) return -1; const a = colOf(c), b = c2 ? colOf(c2) : a;
    this.alive[i] = 1; this.kind[i] = kind; this.fl[i] = fl; this.x[i] = x; this.y[i] = y; this.vx[i] = vx; this.vy[i] = vy; this.life[i] = life; this.ml[i] = life;
    this.seed[i] = Math.random() * 100; this.age[i] = 0; this.gy[i] = gy; this.size[i] = size; this.drag[i] = drag; this.grav[i] = grav; this.split[i] = 0; this.acc[i] = Math.random();
    this.cr[i] = a[0]; this.cg[i] = a[1]; this.cb[i] = a[2]; this.dr[i] = b[0]; this.dg[i] = b[1]; this.db[i] = b[2]; return i;
  }
  puff(x, y, gy, vx, vy, r, life, near, col = null, grow = 1) { if (this.smoke.length < 160) this.smoke.push({ x, y, gy, vx, vy, r, life, age: 0, near, col, grow, rot: Math.random() * 6.28, spin: (Math.random() - 0.5) * 0.5 }); }
  schedule(delay, fn) { this.queue.push({ at: delay, fn }); }
  setTargets(pts) { this.targets = pts; }            // (the sky message is HTML now; kept for compatibility)
  formInstant() {} clearLetters() {}

  // ---- the lighting stick (a long match / portfire) in his hand. hand() -> [x, y, gy] of his hand, or null when he is not
  // lighting. Its flame comes down to his end of the fuse, touches it, and is pulled back once the fuse has caught.
  lighter(hand) { this.flame = hand; this.flameT = this.t; }
  stick(t = this.t) {
    const h = this.flame && this.flame(); if (!h || !this.L || !this.L.fuse) return null;
    const fs = this.fuseS, back = fs ? clamp((t - fs.t0 - 0.3) / 0.45, 0, 1) : 0; if (back >= 1) return null;
    const tip = this.L.fuse, s = unitScale(h[2]), dx = tip[0] - h[0], dy = tip[1] - 0.5 * s - h[1], d = Math.hypot(dx, dy) || 1;
    const down = ease.inOut(clamp((t - (this.flameT ?? t)) / 0.45, 0, 1)), len = Math.min(d, 24 * s) * lerp(0.55, 1, down) * (1 - 0.5 * back);
    const ux = lerp(0.3, dx / d, down), uy = lerp(0.95, dy / d, down), ul = Math.hypot(ux, uy) || 1;
    return { h, e: [h[0] + ux / ul * len, h[1] + uy / ul * len, h[2]], a: 1 - back, s };
  }
  // ---- the fuse: he lights the free end at film time t0 (simT); it burns to the mortar in dur seconds
  igniteFuse(dur, t0 = this.t) { this.fuseS = { dur: Math.max(0.3, dur), t0 }; this.armed = null; }
  fuseAt(u, out = [0, 0, 0]) {
    const P = this.fuseP, f = clamp(u, 0, 1) * (P.length - 1), i = Math.min(P.length - 2, Math.floor(f)), k = f - i, a = P[i], b = P[i + 1];
    out[0] = lerp(a[0], b[0], k); out[1] = lerp(a[1], b[1], k); out[2] = lerp(a[2], b[2], k); return out;
  }
  fuseU(t = this.t) { const f = this.fuseS; return f ? clamp((t - f.t0) / f.dur, 0, 1) : 0; }
  // camera helpers: where the running spark is (world [x, y, gy], null when the fuse is not burning) and the main mortar's mouth
  sparkAt() { const u = this.fuseU(); return this.fuseP && this.fuseS && this.t >= this.fuseS.t0 && u < 1 ? this.fuseAt(u) : null; }
  mortarAt() { return this.L ? this.L.top : null; }

  // ---- launch a shell from a mortar mouth `from` [x, y, gy] to burst at `to` [x, y] (sky) after dur seconds. ago > 0 starts it mid-climb (seeking).
  launch(from, to, dur, burst = {}, ago = 0) {
    const r = { x0: from[0], y0: from[1], gy0: from[2], x1: to[0], y1: to[1], t: Math.max(0, ago), dur, burst, x: from[0], y: from[1], gy: from[2], px: from[0], py: from[1], pgy: from[2], wob: Math.random() * 6, acc: 0, main: !!burst.big };
    this.rockets.push(r); this.armed = null;
    if (ago < 0.3) this.muzzle(from, r.main ? 1 : 0.55, ago);
    if (ago <= 0) { this.hooks.thump && this.hooks.thump(r.main ? 1 : 0.5); this.hooks.launch && this.hooks.launch(dur, r.main); }
    return r;
  }
  muzzle(m, k = 1, ago = 0) {
    this.muz.push({ x: m[0], y: m[1], gy: m[2], t: ago, k });
    const s = unitScale(m[2]), n = Math.round(54 * k * this.k);
    for (let i = 0; i < n; i++) { const a = -Math.PI / 2 + (Math.random() - 0.5) * 0.8, v = (50 + Math.random() * 110) * s; this.emit(SPARK, m[0] + (Math.random() - 0.5) * 2 * s, m[1], Math.cos(a) * v, Math.sin(a) * v, 0.18 + Math.random() * 0.42, m[2], (1.0 + Math.random() * 0.8) * s, Math.random() < 0.5 ? WHITE : FW_PAL.gold, F_NEAR | F_STROBE, 3.4, 80 * s); }
    for (let i = 0; i < 12 * k; i++) { const up = Math.random(); this.puff(m[0] + (Math.random() - 0.5) * 6 * s, m[1] - up * 16 * s, m[2], (Math.random() - 0.5) * 30 * s, -(10 + up * 46) * s, (6 + Math.random() * 5) * s, 3.2 + Math.random() * 2.6, true, null, 6); }
  }

  // ---- a shell bursting at (x, y) in the sky. b: { type: chrys|peony|willow|crossette|heart|ring, col, col2, pistil, R (radius, world units), n, life, size, crackle, glitter, big }
  burst(x, y, b = {}) {
    const type = b.type || (b.kind === 'willow' ? 'willow' : b.kind === 'letters' ? 'chrys' : 'peony'), K = this.k, gy = b.gy || SKY_GY;
    const R = b.R || (b.speed ? b.speed * 0.55 : 240), c1 = colOf(b.col ?? b.hue ?? 'gold'), c2 = b.col2 != null ? colOf(b.col2) : null, sz = b.size || 11;
    const big = !!b.big, fk = big ? 1.7 : 1;
    this.flashes.push({ x, y, t: 0, k: fk, R, col: mixc(c1, WHITE, 0.45) });
    this.recent.push({ x, y, t: 0, k: big ? 1.5 : 1, R, col: c2 ? mixc(c1, c2, 0.4) : c1 });
    this.hooks.burst && this.hooks.burst(big ? 1 : 0.6, x);
    if (b.crackle && this.hooks.crackle) { const h = this.hooks.crackle; this.schedule(type === 'willow' ? 2.2 : 1.35, h); if (big) this.schedule(1.75, h); }
    const sph = () => { const z = Math.random() * 2 - 1, a = Math.random() * 6.2832, r = Math.sqrt(1 - z * z); return [Math.cos(a) * r, Math.sin(a) * r]; };
    const fl0 = (c2 ? F_CHANGE : 0) | (b.crackle ? F_CRACKLE : 0) | (b.glitter ? F_GLIT : 0);
    const shell = (n, Rr, life, drag, grav, fl, col, col2, size, kind = STAR) => {
      for (let k = 0; k < n; k++) { const d = sph(), v = Rr * drag * (0.9 + Math.random() * 0.12); this.emit(kind, x, y, d[0] * v, d[1] * v, life * (0.85 + Math.random() * 0.3), gy, size * (0.85 + Math.random() * 0.3), col, fl, drag, grav, col2); }
    };
    if (type === 'chrys') {
      shell(Math.round((b.n || 190) * K), R, b.life || 2.0, 1.5, 52, fl0 | F_TRAIL, c1, c2, sz);
      if (b.pistil) shell(Math.round((b.n || 190) * 0.16 * K), R * 0.45, 1.3, 1.9, 40, F_CHANGE | F_STROBE, b.pistil, 'silver', sz * 0.6);
      if (b.ring) { const n = Math.round(60 * K), tilt = 0.35 + Math.random() * 0.25, rot = (Math.random() - 0.5) * 0.6; for (let k = 0; k < n; k++) { const a = k / n * 6.2832, ex = Math.cos(a), ey = Math.sin(a) * tilt, v = R * 0.78 * 1.6; this.emit(STAR, x, y, (ex * Math.cos(rot) - ey * Math.sin(rot)) * v, (ex * Math.sin(rot) + ey * Math.cos(rot)) * v, 1.7, gy, sz * 0.9, b.ring, F_GLIT | F_STROBE, 1.6, 40); } }
    } else if (type === 'willow') {
      shell(Math.round((b.n || 120) * K), R, b.life || 3.6, 2.1, 42, fl0 | F_TRAIL, c1, c2, sz * 0.8, WILLOW);
    } else if (type === 'crossette') {
      const n = Math.max(8, Math.round((b.n || 18) * Math.sqrt(K)));
      for (let k = 0; k < n; k++) { const a = k / n * 6.2832 + Math.random() * 0.2, v = R * 0.55 * 1.5; const i = this.emit(STAR, x, y, Math.cos(a) * v, Math.sin(a) * v, 1.0, gy, sz * 1.1, c1, F_TRAIL | F_SPLIT, 1.5, 30, c2 || c1); if (i >= 0) this.split[i] = 0.42 + Math.random() * 0.12; }
    } else if (type === 'heart') {
      const n = Math.round((b.n || 110) * K), tilt = (Math.random() - 0.5) * 0.3;
      for (let k = 0; k < n; k++) { const a = k / n * 6.2832, hx = 16 * Math.pow(Math.sin(a), 3) / 16, hy = -(13 * Math.cos(a) - 5 * Math.cos(2 * a) - 2 * Math.cos(3 * a) - Math.cos(4 * a)) / 16, v = R * 0.85 * 1.7;
        const vx = (hx * Math.cos(tilt) - hy * Math.sin(tilt)) * v, vy = (hx * Math.sin(tilt) + hy * Math.cos(tilt)) * v; this.emit(STAR, x, y, vx, vy, 2.0, gy, sz, c1, F_GLIT | (c2 ? F_CHANGE : 0), 1.7, 22, c2); }
      shell(Math.round(26 * K), R * 0.25, 1.1, 2, 30, F_STROBE, 'white', null, sz * 0.7);
    } else if (type === 'ring') {
      const n = Math.round((b.n || 80) * K), tilt = 0.3 + Math.random() * 0.3, rot = (Math.random() - 0.5) * 0.8;
      for (let k = 0; k < n; k++) { const a = k / n * 6.2832, ex = Math.cos(a), ey = Math.sin(a) * tilt, v = R * 1.6; this.emit(STAR, x, y, (ex * Math.cos(rot) - ey * Math.sin(rot)) * v, (ex * Math.sin(rot) + ey * Math.cos(rot)) * v, 1.8, gy, sz, c1, fl0, 1.6, 40, c2); }
      if (b.pistil) shell(Math.round(26 * K), R * 0.38, 1.2, 1.9, 40, F_CHANGE | F_STROBE, b.pistil, 'silver', sz * 0.6);
    } else { // peony: a bright sphere of colour-changing stars
      shell(Math.round((b.n || 170) * K), R, b.life || 1.8, 1.45, 50, fl0, c1, c2, sz);
      if (b.pistil) shell(Math.round((b.n || 170) * 0.16 * K), R * 0.42, 1.2, 1.9, 40, F_CHANGE | F_STROBE, b.pistil, 'silver', sz * 0.6);
    }
    // the shell's smoke, lit by its own flash and the next ones
    if (this.uv) for (let i = 0; i < (big ? 8 : 4); i++) { const a = Math.random() * 6.28, d = Math.sqrt(Math.random()) * R * 0.55; this.puff(x + Math.cos(a) * d, y + Math.sin(a) * d * 0.8, gy, 0, 4 + Math.random() * 4, R * (0.22 + Math.random() * 0.14), 6 + Math.random() * 3, false, c2 ? mixc(c1, c2, 0.5) : c1, 0.06 * R); }
  }
  // run the simulation forward quickly (used when the film is entered by seeking just after a burst)
  advance(sec) { for (let s = 0; s < sec; s += 1 / 30) this.update(1 / 30, this.t + 1 / 30, 0); }

  update(dt, t, wind = 0) {
    this.t = t;
    if (dt > 0 && this.queue.length) { for (const q of this.queue) q.at -= dt; const due = this.queue.filter(q => q.at <= 0); this.queue = this.queue.filter(q => q.at > 0); for (const q of due) q.fn(); }
    const NL = this.nearLight; NL.k = 0; let nk = 0;
    const addNL = (x, y, gy, k, r, g, b) => { if (k > nk) { nk = k; NL.x = x; NL.y = y; NL.gy = gy; NL.r = r; NL.g = g; NL.b = b; } NL.k = Math.min(3, NL.k + k); };
    // the lighter flame in his hand
    const st = this.stick(t); if (st) { addNL(st.e[0], st.e[1], st.e[2], 0.8 * st.a, 1, 0.66, 0.3);
      if (dt > 0) { const s = Math.max(st.s, 1.2), n = Math.round(46 * dt * st.a + Math.random() * 0.6); for (let i = 0; i < n; i++) { const a = Math.random() * 6.283, v = (10 + Math.random() * 26) * s; this.emit(FUSE, st.e[0], st.e[1] - 1.2 * s, Math.cos(a) * v, Math.sin(a) * v - 8 * s, 0.1 + Math.random() * 0.25, st.e[2], (0.5 + Math.random() * 0.5) * s, Math.random() < 0.6 ? WHITE : FW_PAL.gold, F_NEAR, 2.6, 40 * s); } } }   // the stick's tip fizzes like a sparkler
    // the fuse burning along the ground
    const fs = this.fuseS;
    if (fs && this.fuseP) {
      const u = (t - fs.t0) / fs.dur;
      if (u >= 1 && !fs.done) { fs.done = true; this.armed = fs.t0 + fs.dur; this.hooks.armed && this.hooks.armed(); }
      if (u >= 0 && !fs.caught) { fs.caught = true; if (u < 0.2 && dt > 0) {   // the fuse catches: a little flare of sparks and a puff
        const p = this.fuseP[0], s = unitScale(p[2]);
        for (let i = 0; i < 26 * Math.max(0.6, this.k); i++) { const a = -Math.PI / 2 + (Math.random() - 0.5) * 3, v = (20 + Math.random() * 50) * s; this.emit(FUSE, p[0], p[1] - 0.5 * s, Math.cos(a) * v, Math.sin(a) * v, 0.15 + Math.random() * 0.35, p[2], (0.8 + Math.random() * 0.8) * s, Math.random() < 0.5 ? WHITE : FW_PAL.gold, F_NEAR, 2.4, 60 * s); }
        this.puff(p[0], p[1] - s, p[2], 0, -10 * s, 1.4 * s, 2, true, null, 1.4); this.hooks.fizz && this.hooks.fizz(); } }
      if (u >= 0 && u < 1) {
        const p = this.fuseAt(u), s = Math.max(unitScale(p[2]), 1.5), fl = 0.8 + 0.2 * Math.sin(t * 43);
        addNL(p[0], p[1] - 2 * s, p[2], 1.1 * fl, 1, 0.6, 0.26);
        if (dt > 0) {
          const n = Math.round((70 * dt + Math.random()) * Math.max(0.6, this.k) * 1.4);
          for (let i = 0; i < n; i++) { const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.6, v = (12 + Math.random() * 36) * s; this.emit(FUSE, p[0], p[1] - 0.4 * s, Math.cos(a) * v, Math.sin(a) * v, 0.1 + Math.random() * 0.3, p[2], (0.7 + Math.random() * 0.8) * s, Math.random() < 0.6 ? WHITE : FW_PAL.gold, F_NEAR, 2.2, 55 * s); }
          if (Math.random() < dt * 9) this.puff(p[0] + (Math.random() - 0.5) * s, p[1] - s, p[2], (Math.random() - 0.5) * 6 * s, -(6 + Math.random() * 8) * s, (0.8 + Math.random() * 0.8) * s, 1.6 + Math.random() * 1.2, true, null, 1.2);
        }
      }
    }
    // anticipation: the fuse has gone into the mortar; it hisses and spits a few sparks from the mouth
    if (this.armed != null && this.L && t >= this.armed) {
      const m = this.L.top, s = unitScale(m[2]), k = clamp((t - this.armed) / 0.4, 0, 1);
      addNL(m[0], m[1], m[2], 0.5 * k, 1, 0.55, 0.22);
      if (dt > 0 && Math.random() < dt * 14 * k) { const a = -Math.PI / 2 + (Math.random() - 0.5) * 0.5, v = (20 + Math.random() * 40) * s; this.emit(SPARK, m[0], m[1], Math.cos(a) * v, Math.sin(a) * v, 0.15 + Math.random() * 0.2, m[2], 0.5 * s, WHITE, F_NEAR, 3, 60 * s); }
      if (dt > 0 && Math.random() < dt * 5 * k) this.puff(m[0], m[1] - s, m[2], (Math.random() - 0.5) * 4 * s, -10 * s, 1.2 * s, 1.8, true, null, 1.2);
    }
    // muzzle flashes
    for (const m of this.muz) { m.t += dt; addNL(m.x, m.y - 8 * unitScale(m.gy), m.gy, 3 * m.k * Math.exp(-m.t * 5), 1, 0.78, 0.5); }
    this.muz = this.muz.filter(m => m.t < 1.2);
    // shells climbing: fast off the tube, slowing at the top; from the launcher's depth to the sky's; golden crackling trail
    for (const r of this.rockets) {
      r.px = r.x; r.py = r.y; r.pgy = r.gy; r.t += dt; const u = clamp(r.t / r.dur, 0, 1);
      const e = 1 - Math.pow(1 - u, 2.15), kx = Math.pow(u, 1.45), kg = ease.inOut(clamp((u - 0.04) / 0.86, 0, 1)), s0 = nearU(r.gy);
      r.gy = lerp(r.gy0, SKY_GY, kg); r.x = lerp(r.x0, r.x1, kx) + Math.sin(r.t * 9 + r.wob) * 0.7 * s0 * (1 - u); r.y = lerp(r.y0, r.y1, e);
      if (r.t < 0.05) { r.px = r.x; r.py = r.y; r.pgy = r.gy; }
      if (dt > 0) { (r.hist || (r.hist = [])).unshift([r.x, r.y, r.gy]); if (r.hist.length > 14) r.hist.pop(); }
      if (u < 0.35) addNL(r.x, r.y, r.gy, 1.2 * (1 - u / 0.35), 1, 0.74, 0.4);
      if (dt > 0) {
        r.acc += (r.main ? 190 : 85) * this.k * dt * (1.15 - u * 0.5); let n = Math.floor(r.acc); r.acc -= n;
        while (n-- > 0) {
          const f = Math.random(), x = lerp(r.px, r.x, f), y = lerp(r.py, r.y, f), gy = lerp(r.pgy, r.gy, f), s = nearU(gy);
          this.emit(TRAIL, x + (Math.random() - 0.5) * 1.4 * s, y + (Math.random() - 0.5) * 1.4 * s, (Math.random() - 0.5) * 12 * s, (2 + Math.random() * 7) * s, (r.main ? 0.55 : 0.4) + Math.random() * (r.main ? 0.85 : 0.5), gy,
            (r.main ? 2.6 : 2.0) * s * (0.7 + Math.random() * 0.6), Math.random() < 0.3 ? WHITE : FW_PAL.gold, F_NEAR | (Math.random() < 0.45 ? F_STROBE : 0), 2.6, 16 * s);
        }
        if (Math.random() < dt * (r.main ? 18 : 6)) { const s = nearU(r.gy), d = Math.random() * 18 * s; this.emit(POP, r.x + (Math.random() - 0.5) * 7 * s, r.y + d, 0, 0, 0.06 + Math.random() * 0.07, r.gy, (1.6 + Math.random() * 1.6) * s, WHITE, F_NEAR, 0, 0); }
      }
      if (u >= 1) { r.done = true; this.burst(r.x, r.y, r.burst); }
    }
    this.rockets = this.rockets.filter(r => !r.done);
    // flashes and the light the bursts throw on the characters
    for (const f of this.flashes) f.t += dt; this.flashes = this.flashes.filter(f => f.t < 1.6);
    for (const b of this.recent) b.t += dt; this.recent = this.recent.filter(b => b.t < 6);
    let lk = 0, lx = 0, ly = 0, lr = 0, lg = 0, lb = 0;
    for (const f of this.flashes) { const k = f.k * Math.exp(-f.t * 2.6); lk += k; lx += f.x * k; ly += f.y * k; lr += f.col[0] * k; lg += f.col[1] * k; lb += f.col[2] * k; }
    for (const b of this.recent) { const k = b.k * 0.22 * Math.exp(-b.t * 0.7); lk += k; lx += b.x * k; ly += b.y * k; lr += b.col[0] * k; lg += b.col[1] * k; lb += b.col[2] * k; }
    const L = this.light; L.k = lerp(L.k, lk, dt > 0 ? 0.25 : 1);
    if (lk > 0.01) { L.x = lx / lk; L.y = ly / lk; L.r = lerp(L.r, 0.5 + 0.5 * lr / lk, 0.2); L.g = lerp(L.g, 0.5 + 0.5 * lg / lk, 0.2); L.b = lerp(L.b, 0.5 + 0.5 * lb / lk, 0.2); }
    if (dt <= 0) return;
    // particles
    const w = wind * 6;
    for (let i = 0; i < this.max; i++) {
      if (!this.alive[i]) continue;
      const k = this.kind[i], fl = this.fl[i];
      this.age[i] += dt; if (this.age[i] < 0) continue;            // delayed (crackle pops)
      if (k !== POP) {
        const d = this.drag[i]; this.vx[i] += (-this.vx[i] * d + w) * dt; this.vy[i] += (-this.vy[i] * d + this.grav[i]) * dt;
        this.x[i] += this.vx[i] * dt; this.y[i] += this.vy[i] * dt;
      }
      if (fl & F_TRAIL) {   // sparkling tails
        const wil = k === WILLOW; this.acc[i] += dt * (wil ? 26 : 19) * this.k;
        while (this.acc[i] >= 1) {
          this.acc[i] -= 1; const u = this.age[i] / this.ml[i], ch = (fl & F_CHANGE) ? smst(0.45, 0.7, u) : 0, s = this.size[i];
          this.emit(TRAIL, this.x[i] + (Math.random() - 0.5) * s * 0.6, this.y[i] + (Math.random() - 0.5) * s * 0.6, this.vx[i] * 0.06 + (Math.random() - 0.5) * 8, this.vy[i] * 0.06 + (Math.random() - 0.5) * 8,
            wil ? 0.9 + Math.random() * 0.8 : 0.32 + Math.random() * 0.3, this.gy[i], s * (wil ? 0.55 : 0.62), [lerp(this.cr[i], this.dr[i], ch), lerp(this.cg[i], this.dg[i], ch), lerp(this.cb[i], this.db[i], ch)], Math.random() < 0.5 ? F_STROBE : 0, wil ? 2.6 : 3, wil ? 16 : 28);
        }
      }
      if ((fl & F_GLIT) && this.age[i] > this.ml[i] * 0.35 && Math.random() < dt * 10 * this.k) this.emit(GLIT, this.x[i], this.y[i], this.vx[i] * 0.1, this.vy[i] * 0.1, 1.2 + Math.random() * 1.3, this.gy[i], this.size[i] * 0.55, WHITE, 0, 3.2, 26);
      if ((fl & F_SPLIT) && this.split[i] > 0 && this.age[i] >= this.split[i]) {   // crossette: the star splits into four
        const a0 = Math.atan2(this.vy[i], this.vx[i]), v = Math.hypot(this.vx[i], this.vy[i]) * 0.6 + 120, c2 = [this.dr[i], this.dg[i], this.db[i]];
        this.emit(POP, this.x[i], this.y[i], 0, 0, 0.1, this.gy[i], this.size[i] * 2.2, WHITE, 0, 0, 0);
        for (let q = 0; q < 4; q++) { const a = a0 + (q - 1.5) * 0.62; this.emit(STAR, this.x[i], this.y[i], Math.cos(a) * v, Math.sin(a) * v, 0.9 + Math.random() * 0.3, this.gy[i], this.size[i] * 0.85, c2, F_TRAIL | F_CRACKLE, 1.7, 40); }
        this.kill(i); continue;
      }
      this.life[i] -= dt;
      if (this.life[i] <= 0) {
        if ((fl & F_CRACKLE) && Math.random() < 0.8) { const s = this.size[i]; for (let q = 0; q < 3; q++) { const j = this.emit(POP, this.x[i] + (Math.random() - 0.5) * s * 4, this.y[i] + (Math.random() - 0.5) * s * 4, 0, 0, 0.05 + Math.random() * 0.06, this.gy[i], s * (1 + Math.random()), WHITE, fl & F_NEAR, 0, 0); if (j >= 0) this.age[j] = -Math.random() * 0.3; } }
        this.kill(i);
      }
    }
    for (const p of this.smoke) { p.age += dt; p.vx += ((wind * 10) - p.vx) * 0.3 * dt; p.vy *= Math.exp(-dt * (p.near ? 0.5 : 1.2)); p.x += p.vx * dt; p.y += p.vy * dt; p.r += dt * p.grow * (p.near ? unitScale(p.gy) : 1); p.rot += p.spin * dt; }
    this.smoke = this.smoke.filter(p => p.age < p.life);
  }

  // up to 4 recent bursts as lights for the sea shader: L = [screen x, screen y, intensity, half-width px] x4, C = colours x4
  seaLights(view) {
    const arr = this.recent.map(b => ({ b, k: b.k * Math.exp(-b.t * 0.8) * (1 + 0.8 * Math.exp(-b.t * 8)) })).filter(o => o.k > 0.04).sort((a, b) => b.k - a.k).slice(0, 4);
    const L = this._sl || (this._sl = new Float32Array(16)), C = this._sc || (this._sc = new Float32Array(12)), p = [0, 0]; L.fill(0); C.fill(0);
    arr.forEach((o, i) => { view.toScreen(o.b.x, o.b.y, SKY_GY, p); L[i * 4] = p[0]; L[i * 4 + 1] = p[1]; L[i * 4 + 2] = o.k * (0.85 + 0.15 * Math.sin(this.t * 23 + i)); L[i * 4 + 3] = Math.max(8, o.b.R * view.scaleAt(SKY_GY) * 0.42); C.set(o.b.col, i * 3); });
    return { L, C, n: arr.length };
  }

  // add = the emissive sky list. Fills this.nearA / this.nearL (reset here) for the launcher's depth.
  draw(add, t) {
    const uv = this.uv, sp = this.splitGy; this.nearA.reset(); this.nearL.reset(); this.frontA.reset(); this.frontL.reset();
    const A = gy => (gy > sp ? this.frontA : this.nearA), Ad = gy => (gy > sp ? this.frontL : this.nearL), NL = this.nearL;
    const col = [0, 0, 0];
    // the fuse on the ground: green cord ahead of the spark, ash behind it, embers cooling just behind the spark
    if (this.fuseP && this.cordOn !== false) {   // (the film lays the cord out only from scene 6 on)
      const P = this.fuseP, N = P.length, fs = this.fuseS, ub = this.fuseU(t), bi = ub * (N - 1), lit = fs && t >= fs.t0, wh = uv && uv.white, solid = wh && !this.flat;
      for (let i = 1; i < N; i++) {
        const p = P[i - 1], q = P[i], s = unitScale(q[2]), th = 0.85 * s, burnt = lit && i <= bi + 0.5, dx = q[0] - p[0], dy = q[1] - p[1];
        const NA = A(q[2]);
        if (!solid) { /* Canvas2D fallback: no tinted solid sprites */ } else if (burnt) NA.push(q[0], q[1], q[2], 0, th * 0.9, th * 0.8, dx, dy, 0.09, 0.085, 0.095, 0.95, wh);
        else { NA.push(q[0], q[1], q[2], 0, th, th, dx, dy, 0.07, 0.2, 0.11, 1, wh); NA.push(q[0], q[1] - th * 0.22, q[2], 0, th * 0.5, th * 0.34, dx, dy, 0.2, 0.46, 0.27, 0.9, wh); }
        if (lit && burnt && bi - i < 5 && ub < 1) { const k = 1 - (bi - i) / 5; Ad(q[2]).push(q[0], q[1], q[2], 0, th * 1.3, th * 1.3, dx, dy, 1, 0.36, 0.08, 0.75 * k * k); }
      }
      // the free end (a little frayed tip) so it reads as a fuse in close-ups
      if (!lit && solid) { const a = P[0], s = unitScale(a[2]); A(a[2]).push(a[0] - 0.6 * s, a[1] - 0.2 * s, a[2], 0.5, 0.9 * s, 0.6 * s, 0, 0, 0.28, 0.24, 0.16, 1, wh); }
      if (lit && ub < 1) { // the burning point: white-hot core, orange halo, light pooled on the ground
        const b = this.fuseAt(ub), s = Math.max(unitScale(b[2]), 1.7), f = 0.8 + 0.2 * Math.sin(t * 47) + 0.15 * Math.sin(t * 29), L = Ad(b[2]);
        L.push(b[0], b[1] - 0.5 * s, b[2], 0, 2.2 * s * f, 2.2 * s * f, 0, 0, 1, 0.97, 0.85, 1);
        L.push(b[0], b[1] - 0.5 * s, b[2], 0, 9 * s * f, 9 * s * f, 0, 0, 1, 0.58, 0.2, 0.55);
        L.push(b[0], b[1] + 0.4 * s, b[2], 0, 34 * s, 8 * s, 0, 0, 1, 0.48, 0.16, 0.26 * f);
      }
    }
    // the lighting stick in his hand and its flame
    const st = this.stick(t);
    if (st) {
      const { h, e, a, s } = st, f = 1 + 0.18 * Math.sin(t * 31) + 0.1 * Math.sin(t * 17), wh = uv && uv.white;
      const SA = A(e[2]), SL = Ad(e[2]);
      if (wh && !this.flat) { SA.push(e[0], e[1], e[2], 0, 0.5 * s, 0.5 * s, e[0] - h[0], e[1] - h[1], 0.22, 0.15, 0.11, a, wh); SA.push(e[0], e[1], e[2], 0, 0.9 * s, 0.9 * s, 0, 0, 0.12, 0.08, 0.07, a, wh); }
      const sf = Math.max(s, 1.2); SL.push(e[0], e[1] - 1.6 * sf, e[2], 0, 2.2 * sf * f, 4.2 * sf * f, 0, 0, 1, 0.93, 0.7, a);
      SL.push(e[0], e[1] - 1.2 * sf, e[2], 0, 12 * sf * f, 12 * sf * f, 0, 0, 1, 0.6, 0.24, 0.5 * a);
    }
    // anticipation glow in the mortar's mouth
    if (this.armed != null && this.L && t >= this.armed) { const m = this.L.top, s = unitScale(m[2]), k = clamp((t - this.armed) / 0.4, 0, 1) * (0.75 + 0.25 * Math.sin(t * 37)); NL.push(m[0], m[1] - 0.6 * s, m[2], 0, 6 * s, 3 * s, 0, 0, 1, 0.6, 0.25, 0.7 * k); NL.push(m[0], m[1] - 2 * s, m[2], 0, 16 * s, 16 * s, 0, 0, 1, 0.55, 0.2, 0.18 * k); }
    // muzzle flashes: a white-orange blast out of the mouth and light thrown on the ground
    for (const m of this.muz) {
      const s = unitScale(m.gy), k = Math.exp(-m.t * 10) * m.k, k2 = Math.exp(-m.t * 3.2) * m.k, g = 0.6 + m.t * 4;
      if (k > 0.01) { NL.push(m.x, m.y - 9 * s * g, m.gy, 0, 14 * s * g, 30 * s * g, 0, 0, 1, 0.92, 0.72, 1.6 * k); NL.push(m.x, m.y - 4 * s, m.gy, 0, 40 * s, 40 * s, 0, 0, 1, 0.66, 0.3, 0.8 * k); }
      NL.push(m.x, m.y + 26 * s, m.gy, 0, 90 * s, 22 * s, 0, 0, 1, 0.55, 0.22, 0.35 * k2);
    }
    // shells: a hot head with a short streak and a golden halo (sizes never drop below a visible minimum in the sky)
    for (const r of this.rockets) {
      const s = nearU(r.gy) * (r.main ? 1.3 : 1), dx = r.x - r.px, dy = r.y - r.py, ml = Math.hypot(dx, dy), st = ml > 1e-3 ? 9 * s / ml : 0;
      NL.push(r.x, r.y, r.gy, 0, 3.4 * s, 3.4 * s, dx * st, dy * st, 1, 0.95, 0.82, 1);
      NL.push(r.x, r.y, r.gy, 0, 11 * s, 11 * s, 0, 0, 1, 0.66, 0.28, 0.42);
      const H = r.hist || []; for (let k = 1; k < H.length; k++) { const a = H[k - 1], b = H[k], f = 1 - k / H.length, sk = nearU(a[2]) * (r.main ? 1.3 : 1); NL.push(a[0], a[1], a[2], 0, 2.2 * sk * (0.5 + 0.5 * f), 2.2 * sk * (0.5 + 0.5 * f), a[0] - b[0], a[1] - b[1], 1, lerp(0.5, 0.85, f), lerp(0.15, 0.5, f), 0.75 * f * f); }
    }
    // burst flashes in the sky
    for (const f of this.flashes) { const k = Math.exp(-f.t * 7) * f.k, k2 = Math.exp(-f.t * 2.2) * f.k; if (k > 0.01) add.push(f.x, f.y, SKY_GY, 0, f.R * 0.32 * (0.6 + f.t * 4), f.R * 0.32 * (0.6 + f.t * 4), 0, 0, 1, 0.95, 0.85, 0.75 * k); add.push(f.x, f.y, SKY_GY, 0, f.R * 2.6, f.R * 2.6, 0, 0, f.col[0], f.col[1], f.col[2], 0.16 * k2); }
    // particles
    for (let i = 0; i < this.max; i++) {
      if (!this.alive[i] || this.age[i] < 0) continue;
      const k = this.kind[i], fl = this.fl[i], s = this.size[i], u = clamp(this.age[i] / this.ml[i], 0, 1), list = (fl & F_NEAR) ? Ad(this.gy[i]) : add;
      let a, sz = s, stk = 0.035, cr = this.cr[i], cg = this.cg[i], cb = this.cb[i];
      if (fl & F_CHANGE) { const c = smst(0.42, 0.68, u); cr = lerp(cr, this.dr[i], c); cg = lerp(cg, this.dg[i], c); cb = lerp(cb, this.db[i], c); }
      if (k === STAR || k === WILLOW) {
        const hot = 1 - smst(0, 0.22, u); cr = lerp(cr, 1, hot * 0.75); cg = lerp(cg, 0.97, hot * 0.75); cb = lerp(cb, 0.9, hot * 0.75);
        a = (u < 0.72 ? 1 : 1 - (u - 0.72) / 0.28) * (k === WILLOW ? 0.8 : 1.1) * (0.25 + 0.75 * smst(0.03, 0.2, this.age[i])); sz = s * (1 - 0.35 * u) * (0.6 + 0.4 * smst(0, 0.2, this.age[i])); stk = 0.045 * smst(0, 0.15, this.age[i]);
        if (u > 0.6) a *= 0.7 + 0.3 * Math.sin(t * 34 + this.seed[i] * 9);
        if (((i & 1) === 0 || k === WILLOW) && this.age[i] > 0.12) list.push(this.x[i], this.y[i], this.gy[i], 0, sz * 3.4, sz * 3.4, 0, 0, cr, cg, cb, a * (k === WILLOW ? 0.1 : 0.2) * smst(0.12, 0.35, this.age[i]));
      } else if (k === TRAIL) {
        const m = smst(0, 0.6, u); cr = lerp(lerp(1, cr, 0.5), cr * 0.9 + 0.1, m); cg = lerp(lerp(0.95, cg, 0.5), cg * 0.6, m); cb = lerp(lerp(0.85, cb, 0.5), cb * 0.5, m);
        a = Math.pow(1 - u, 1.3) * 0.95; sz = s * (1 - 0.45 * u); stk = 0.03;
      } else if (k === POP) { a = (1 - u) * 1.5; sz = s * (0.6 + u * 1.3); cr = 1; cg = 0.98; cb = 0.9; stk = 0; list.push(this.x[i], this.y[i], this.gy[i], 0, sz * 3, sz * 3, 0, 0, 1, 0.9, 0.7, a * 0.18); }
      else if (k === GLIT) { const on = Math.sin(t * 26 + this.seed[i] * 13) > 0.2 ? 1 : 0.12; a = on * (1 - u * u) * 1.1; cr = 1; cg = 0.95; cb = 0.8; stk = 0.02; }
      else { // fuse / muzzle sparks
        a = (1 - u) * 1.2; cr = lerp(cr, 1, 0.3); cg = lerp(cg, 0.55, u); cb = lerp(cb, 0.2, u); stk = 0.04; sz = s * (1 - 0.4 * u);
      }
      if ((fl & F_STROBE) && Math.sin(t * 40 + this.seed[i] * 7) < -0.2) a *= 0.25;
      if (a > 0.01) list.push(this.x[i], this.y[i], this.gy[i], 0, sz, sz, this.vx[i] * stk, this.vy[i] * stk, cr, cg, cb, a);
    }
    // smoke: at the launcher a soft grey (warm while the flash lights it); in the sky a faint haze lit by the bursts
    if (uv && uv.smoke) {
      const lk = clamp(this.light.k, 0, 1.5), nk = clamp(this.nearLight.k, 0, 2);
      for (const p of this.smoke) {
        const u = p.age / p.life, a = smst(0, 0.08, u) * (1 - u) * (1 - u);
        if (p.near) { const w = clamp(nk * 0.4 * (1 - u * 2), 0, 0.7); A(p.gy).push(p.x, p.y, p.gy, p.rot, p.r * 2, p.r * 2, 0, 0, lerp(0.84, 1, w), lerp(0.82, 0.7, w), lerp(0.94, 0.45, w), a * (this.flat ? 0.18 : 0.6), uv.smoke); }
        else { const c = p.col || FW_PAL.silver, k = (0.035 + lk * 0.05) * a; add.push(p.x, p.y, p.gy, p.rot, p.r * 2, p.r * 2, 0, 0, lerp(0.5, c[0], 0.5), lerp(0.5, c[1], 0.5), lerp(0.6, c[2], 0.5), k, uv.smoke); }
      }
    }
  }
}

// sample the sky message into target points (sky-space world coords). place(sx, sy) maps canvas px -> world.
export function sampleMessage(lines, heart, count, font, place) {
  const W = 1400, H = 560, c = document.createElement('canvas'); c.width = W; c.height = H; const x = c.getContext('2d');
  const fs = 150; x.fillStyle = '#fff'; x.textAlign = 'center'; x.textBaseline = 'alphabetic';
  x.font = `700 ${fs}px ${font}`;
  const w0 = x.measureText(lines[0]).width, w1 = x.measureText(lines[1]).width + (heart ? fs * 0.9 : 0), scale = Math.min(1, (W * 0.96) / Math.max(w0, w1));
  x.font = `700 ${fs * scale}px ${font}`;
  const y0 = H * 0.42, y1 = H * 0.86;
  x.fillText(lines[0], W / 2, y0);
  const lw = x.measureText(lines[1]).width, hw = heart ? fs * scale * 0.85 : 0, sx = W / 2 - (lw + hw) / 2;
  x.textAlign = 'left'; x.fillText(lines[1], sx, y1);
  let hb = null;
  if (heart) { const hx = sx + lw + hw * 0.62, hy = y1 - fs * scale * 0.36, r = fs * scale * 0.34; x.fillStyle = '#f00'; x.beginPath(); x.moveTo(hx, hy + r * 0.95); x.bezierCurveTo(hx - r * 1.5, hy, hx - r * 1.0, hy - r * 1.25, hx, hy - r * 0.45); x.bezierCurveTo(hx + r * 1.0, hy - r * 1.25, hx + r * 1.5, hy, hx, hy + r * 0.95); x.fill(); hb = 1; }
  const d = x.getImageData(0, 0, W, H).data, all = [];
  for (let yy = 0; yy < H; yy += 2) for (let xx = 0; xx < W; xx += 2) { const o = (yy * W + xx) * 4; if (d[o + 3] > 140) all.push([xx, yy, d[o + 1] < 100 ? 1 : 0]); }
  const step = Math.max(1, all.length / count), out = [];
  for (let k = 0; k < all.length; k += step) { const p = all[Math.floor(k)]; const w = place(p[0] + (Math.random() - 0.5) * 1.5, p[1] + (Math.random() - 0.5) * 1.5, W, H); out.push([w[0], w[1], p[2]]); }
  return out;
}

// ---------------------------------------------------------------- the golden thread: his feelings as light, from his chest towards her (never touching)
export class Thread {
  constructor(n) { this.n = n; this.u = new Float32Array(n); this.ph = new Float32Array(n); for (let i = 0; i < n; i++) { this.u[i] = Math.random(); this.ph[i] = Math.random() * 6.28; } this.glow = 0; this.vis = 0; this.flies = Array.from({ length: 16 }, () => ({ u: Math.random(), ph: Math.random() * 6.28, r: 6 + Math.random() * 14, sp: 0.02 + Math.random() * 0.03 })); this.toStars = 0; this.stars = null; this.a = [0, 0, 0]; this.b = [0, 0, 0]; }
  set(a, b) { this.a = a; this.b = b; }   // [x, y, gy] endpoints (b already stops short of her)
  point(u, t, out) {
    const a = this.a, b = this.b, sag = 26 + Math.sin(t * 0.7) * 6;
    const mx = lerp(a[0], b[0], u), my = lerp(a[1], b[1], u) + Math.sin(u * Math.PI) * sag + Math.sin(t * 1.1 + u * 7) * 3 * Math.sin(u * Math.PI);
    out[0] = mx; out[1] = my; out[2] = lerp(a[2], b[2], u); return out;
  }
  update(dt, t) { for (let i = 0; i < this.n; i++) { this.u[i] += dt * (0.045 + 0.02 * Math.sin(this.ph[i])); if (this.u[i] > 1) this.u[i] -= 1; } for (const f of this.flies) { f.u += dt * f.sp; if (f.u > 1) f.u -= 1; } }
  draw(add, t) {
    if (this.vis <= 0.01) return;
    const p = [0, 0, 0], q = [0, 0, 0], g = this.glow * this.vis;
    // the thread core: short glowing segments
    for (let k = 0; k < 48; k++) {
      const u0 = k / 48, u1 = (k + 1) / 48; this.point(u0, t, p); this.point(u1, t, q);
      const s = unitScale(p[2]), fade = Math.min(1, u0 * 8) * Math.min(1, (1 - u0) * 3.2), a = (0.32 + 0.12 * Math.sin(t * 3 - u0 * 14)) * g * fade;
      add.push(q[0], q[1], p[2], 0, 1.2 * s, 1.2 * s, q[0] - p[0], q[1] - p[1], 1, 0.84, 0.45, a);
    }
    // particles flowing from him towards her
    for (let i = 0; i < this.n; i++) {
      let u = this.u[i]; this.point(u, t, p); const s = unitScale(p[2]);
      let x = p[0] + noise2(this.ph[i], t * 0.6) * 3 * s, y = p[1] + noise2(this.ph[i] + 9, t * 0.6) * 3 * s, gy = p[2];
      if (this.toStars > 0 && this.stars) { const st = this.stars[i % this.stars.length], k = ease.inOut(clamp(this.toStars * 1.3 - (i % 7) * 0.05, 0, 1)); x = lerp(x, st[0], k); y = lerp(y, st[1], k); gy = lerp(gy, SKY_GY, k); }
      const fade = Math.min(1, u * 6) * Math.min(1, (1 - u) * 2.5) * (1 - clamp(this.toStars * 1.4 - 0.4, 0, 1)), tw = 0.6 + 0.4 * Math.sin(t * 4 + this.ph[i] * 3);
      add.push(x, y, gy, 0, 1.6 * s, 1.6 * s, 0, 0, 1, 0.86, 0.5, fade * tw * g * 0.9);
      if ((i & 7) === 0) add.push(x, y, gy, 0, 7 * s, 7 * s, 0, 0, 1, 0.75, 0.4, fade * g * 0.16);
    }
    // fireflies following the thread
    for (const f of this.flies) {
      this.point(f.u, t, p); const s = unitScale(p[2]), bl = Math.max(0, Math.sin(t * 2.2 + f.ph * 4)) ** 2;
      curl(f.ph + t * 0.1, f.u * 3, t * 0.15, C2);
      add.push(p[0] + C2[0] * f.r * s * 0.5, p[1] + C2[1] * f.r * s * 0.4 - 4 * s, p[2], 0, 2.4 * s, 2.4 * s, 0, 0, 0.85, 1, 0.55, bl * this.vis * 0.9);
    }
  }
}

// ---------------------------------------------------------------- petals, wish petals, motes, lanterns, smoke, constellation, strollers, balloons
export class Ambient {
  constructor(q) {
    this.q = q;
    this.petals = Array.from({ length: q.petals }, () => this.newPetal(true));
    this.wish = []; this.lanterns = []; this.smoke = [];
    this.motes = Array.from({ length: q.motes }, () => ({ x: rand(-200, 1800), y: rand(150, 1000), gy: rand(560, 1100), p: rand(0, 6.28), s: rand(0.5, 1.6) }));
    this.walkers = Array.from({ length: 7 }, (_, i) => ({ d: rand(0, 1), lane: rand(0.05, 0.42), v: (rand() > 0.5 ? 1 : -1) * rand(0.01, 0.02), look: (rand() * 6) | 0, p: rand(0, 6) }));
    this.heart = null; this.heartDraw = 0; this.heartVis = 0; this.wishOn = 0; this.lanternOn = 0; this.petalOn = 1;
  }
  newPetal(init) { const fromTree = rand() < 0.75; return { x: fromTree ? rand(950, 1600) : rand(-40, 120), y: init ? rand(0, 1000) : fromTree ? rand(60, 360) : rand(760, 830), gy: fromTree ? rand(840, 1150) : rand(900, 940), vx: 0, vy: 0, rot: rand(0, 6.28), spin: rand(-3, 3), flip: rand(0, 6.28), fs: rand(2, 5), k: (rand() * 4) | 0, s: rand(0.7, 1.2) }; }
  update(dt, t, wind) {
    if (dt <= 0) return;
    for (const p of this.petals) { // flutter: aerodynamic drag towards the wind, rotation and flipping
      const w = wind.at(p.x).s * 60, n = noise3(p.x * 0.01, p.y * 0.01, t * 0.5);
      p.vx += ((w + n * 40) - p.vx) * 1.2 * dt; p.vy += ((22 + Math.sin(p.flip) * 14) - p.vy) * 1.5 * dt;
      p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.spin * dt; p.flip += p.fs * dt;
      if (p.y > p.gy + 30 || p.x > 2100) { if (this.petalOn > 0.2) Object.assign(p, this.newPetal(false)); else p.y = 1e5; }
    }
    for (const p of this.wish) { const w = wind.at(p.x).s * 26; p.vx += (w - p.vx) * 0.8 * dt; p.vy += (-30 - p.vy) * 0.9 * dt; p.x += (p.vx + Math.sin(t * 2 + p.ph) * 8) * dt; p.y += p.vy * dt; p.rot += p.spin * dt; p.flip += 3 * dt; p.life -= dt; }
    this.wish = this.wish.filter(p => p.life > 0);
    for (const l of this.lanterns) { l.y -= l.v * dt; l.x += (wind.at(l.x).s * 6 + Math.sin(t * 0.6 + l.p) * 3) * dt; l.life -= dt; }
    this.lanterns = this.lanterns.filter(l => l.life > 0);
    for (const m of this.motes) { curl(m.x * 0.003, m.y * 0.003, t * 0.1 + m.p, C2); m.x += (C2[0] * 10 + wind.at(m.x).s * 9) * dt; m.y += (C2[1] * 8 - 3) * dt; if (m.x > 1900) m.x -= 2100; if (m.y < 100) m.y += 900; }
    for (const s of this.smoke) { curl(s.x * 0.01, s.y * 0.01, t * 0.3 + s.p, C2); s.vx += (C2[0] * 40 - s.vx * 0.6) * dt; s.vy += (-50 - s.vy * 0.4) * dt; s.x += s.vx * dt; s.y += s.vy * dt; s.r += dt * (7 + s.r * 0.25); s.life -= dt; s.rot += s.spin * dt; }
    this.smoke = this.smoke.filter(s => s.life > 0);
    for (const w of this.walkers) { w.d = ((w.d + w.v * dt) % 1 + 1) % 1; }
  }
  spawnWish(x, y, gy, n) { for (let i = 0; i < n; i++) this.wish.push({ x: x + rand(-60, 60), y: y + rand(-10, 60), gy: gy + rand(-20, 40), vx: 0, vy: rand(-20, -40), rot: rand(0, 6.28), spin: rand(-2, 2), flip: rand(0, 6.28), ph: rand(0, 6.28), life: rand(5, 8), k: (rand() * 4) | 0, s: rand(0.6, 1.1) }); }
  spawnLantern() { const y = rand(522, 575); this.lanterns.push({ x: rand(790, 1180), y, gy: y, v: rand(10, 18), p: rand(0, 6.28), life: 40 }); }
  spawnSmoke(x, y, n) { for (let i = 0; i < n; i++) this.smoke.push({ x: x + rand(-1.5, 1.5), y: y + rand(-2, 2), vx: rand(-6, 6), vy: rand(-30, -10), r: rand(3, 6), life: rand(2.6, 4.2), ml: 4, p: rand(0, 6), rot: rand(0, 6.28), spin: rand(-0.6, 0.6) }); }
  draw(lists, atlas, t, light) {
    const { alpha, add, fgAlpha, fgAdd, mid } = lists, uv = atlas.uv;
    for (const p of this.petals) { if (p.y > 1e4) continue; const s = unitScale(p.gy) * 2.4 * p.s, fx = Math.cos(p.flip); fgAlpha.push(p.x, p.y, p.gy, p.rot, s * Math.max(0.15, Math.abs(fx)), s * 1.1, 0, 0, light[0], light[1], light[2], 0.95, uv['petal' + p.k]); }
    for (const p of this.wish) { const s = unitScale(p.gy) * 2.2 * p.s, a = Math.min(1, p.life / 1.5) * Math.min(1, (8 - p.life) * 2); fgAlpha.push(p.x, p.y, p.gy, p.rot, s * Math.max(0.2, Math.abs(Math.cos(p.flip))), s, 0, 0, 1, 0.92, 0.95, a * 0.95, uv['petal' + p.k]); fgAdd.push(p.x, p.y, p.gy, 0, s * 3, s * 3, 0, 0, 1, 0.7, 0.85, a * 0.25); }
    for (const l of this.lanterns) { const s = unitScale(l.gy) * 9, a = Math.min(1, (40 - l.life) * 0.5) * Math.min(1, l.life / 4), fl = 0.85 + 0.15 * Math.sin(t * 7 + l.p); mid.push(l.x, l.y, l.gy, Math.sin(t + l.p) * 0.08, s, s * 1.12, 0, 0, 1, 1, 1, a, uv.lantern); add.push(l.x, l.y, l.gy, 0, s * 4.5, s * 4.5, 0, 0, 1, 0.65, 0.3, a * 0.45 * fl); }
    for (const m of this.motes) { const s = unitScale(m.gy) * m.s, tw = 0.35 + 0.35 * Math.sin(t * 2 + m.p); fgAdd.push(m.x, m.y, m.gy, 0, s * 2.4, s * 2.4, 0, 0, light[0], light[1] * 0.92, light[2] * 0.75, tw * light[3]); }
    for (const s of this.smoke) { const u = 1 - s.life / s.ml, a = Math.min(1, (s.ml - s.life) * 3) * (1 - clamp(u, 0, 1)) * 0.55; alpha.push(s.x, s.y, 1000, s.rot, s.r * 2, s.r * 2, 0, 0, 0.86, 0.8, 0.95, a, uv.smoke); }
  }
  drawWalkers(list, atlas, t, amb, alpha = 1) {
    for (const w of this.walkers) { const y = 505 + Math.pow(w.d, 1.7) * 160, x = 770 + (y - 488) * (0.7 + w.lane * 2.4), s = unitScale(y), fr = Math.floor(t * 2.6 + w.p) & 1;
      list.push(x, y - 52 * s, y, 0, 26 * s * (w.v < 0 ? -1 : 1), 52 * s, 0, 0, amb[0] * 1.02, amb[1], amb[2], 0.92 * alpha, atlas.uv['walker' + w.look + '_' + fr]); }
  }
  // the final constellation: stars on a heart curve, joined slowly by thin lines
  setHeart(cx, cy, r, n) { this.heart = []; for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2, x = 16 * Math.pow(Math.sin(a), 3), y = -(13 * Math.cos(a) - 5 * Math.cos(2 * a) - 2 * Math.cos(3 * a) - Math.cos(4 * a)); this.heart.push([cx + x * r / 16, cy + y * r / 16, Math.random() * 6]); } }
  drawHeart(add, t) {
    if (!this.heart || this.heartVis <= 0) return; const H = this.heart, n = H.length, drawn = this.heartDraw * n;
    for (let i = 0; i < n; i++) { const p = H[i], tw = 0.7 + 0.3 * Math.sin(t * 2.4 + p[2]); add.push(p[0], p[1], SKY_GY, 0, 6.5, 6.5, 0, 0, 1, 0.95, 0.88, tw * this.heartVis); add.push(p[0], p[1], SKY_GY, 0, 30, 30, 0, 0, 1, 0.72, 0.86, 0.3 * this.heartVis); }
    for (let i = 0; i < Math.min(n, Math.ceil(drawn)); i++) { const a = H[i], b = H[(i + 1) % n], k = clamp(drawn - i, 0, 1); add.push(lerp(a[0], b[0], k), lerp(a[1], b[1], k), SKY_GY, 0, 1.8, 1.8, (b[0] - a[0]) * k, (b[1] - a[1]) * k, 1, 0.84, 0.92, 0.6 * this.heartVis); }
  }
}

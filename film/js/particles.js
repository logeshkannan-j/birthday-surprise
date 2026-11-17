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
export class Fireworks {
  constructor(max, hooks = {}) {
    this.max = max; this.hooks = hooks;
    const F = n => new Float32Array(n);
    this.x = F(max); this.y = F(max); this.vx = F(max); this.vy = F(max); this.life = F(max); this.ml = F(max); this.tx = F(max); this.ty = F(max);
    this.kind = new Uint8Array(max); this.alive = new Uint8Array(max); this.seed = F(max); this.age = F(max); this.gy = F(max); this.size = F(max); this.hue = new Uint8Array(max);
    this.free = []; for (let i = max - 1; i >= 0; i--) this.free.push(i);
    this.rockets = []; this.flashes = []; this.light = { x: 800, y: 300, k: 0, r: 1, g: 0.85, b: 0.6 };
    this.targets = null; this.letterAlpha = 1; this.shimmer = 1;
  }
  spawn() { return this.free.length ? this.free.pop() : -1; }
  kill(i) { this.alive[i] = 0; this.free.push(i); }
  // kinds: 0 trail ember, 1 burst spark, 2 letter spark, 3 crackle pop, 4 willow, 5 fuse spark
  emit(kind, x, y, vx, vy, life, gy, size, hue = 0) {
    const i = this.spawn(); if (i < 0) return -1;
    this.alive[i] = 1; this.kind[i] = kind; this.x[i] = x; this.y[i] = y; this.vx[i] = vx; this.vy[i] = vy; this.life[i] = life; this.ml[i] = life;
    this.seed[i] = Math.random() * 100; this.age[i] = 0; this.gy[i] = gy; this.size[i] = size; this.hue[i] = hue; return i;
  }
  // text -> target points (sky-space world coordinates)
  setTargets(pts) { this.targets = pts; }
  launch(from, to, dur, burst) { this.rockets.push({ x0: from[0], y0: from[1], gy0: from[2], x1: to[0], y1: to[1], t: 0, dur, burst, x: from[0], y: from[1], gy: from[2], wob: Math.random() * 6 }); this.hooks.launch && this.hooks.launch(dur); }
  burst(r) {
    const b = r.burst, x = r.x, y = r.y;
    this.flashes.push({ x, y, t: 0, k: b.kind === 'letters' ? 1.4 : 1.0 });
    this.hooks.burst && this.hooks.burst(b.kind === 'letters' ? 1 : 0.6, x);
    if (b.kind === 'letters') {
      for (const p of b.pts) {
        const a = Math.random() * 6.283, v = 70 + Math.random() * 260, i = this.emit(2, x, y, Math.cos(a) * v, Math.sin(a) * v, 1e9, SKY_GY, 5.2 + Math.random() * 2.2, p[2] ? 1 : 0);
        if (i >= 0) { this.tx[i] = p[0]; this.ty[i] = p[1]; }
      }
      for (let k = 0; k < 120; k++) { const a = Math.random() * 6.283, v = 140 + Math.random() * 360; this.emit(1, x, y, Math.cos(a) * v, Math.sin(a) * v, 1.4 + Math.random() * 1.2, SKY_GY, 3.2, 0); }
    } else {
      const n = b.n || 160, sp = b.speed || 240, hue = b.hue || 0;
      for (let k = 0; k < n; k++) { const a = Math.random() * 6.283, v = sp * (0.35 + 0.65 * Math.sqrt(Math.random())); this.emit(b.kind === 'willow' ? 4 : 1, x, y, Math.cos(a) * v, Math.sin(a) * v, (b.kind === 'willow' ? 3.2 : 1.6) + Math.random() * 1.0, b.gy || SKY_GY, b.size || 3.0, hue); }
    }
  }
  // instantly form the message (used when the film is entered by seek/skip after the bursts)
  formInstant() {
    if (!this.targets) return;
    for (let i = 0; i < this.max; i++) if (this.alive[i] && this.kind[i] === 2) this.kill(i);
    for (const p of this.targets) { const i = this.emit(2, p[0], p[1], 0, 0, 1e9, SKY_GY, 5.2 + Math.random() * 2.2, p[2] ? 1 : 0); if (i >= 0) { this.tx[i] = p[0]; this.ty[i] = p[1]; this.age[i] = 5; } }
  }
  clearLetters() { for (let i = 0; i < this.max; i++) if (this.alive[i] && this.kind[i] === 2) this.kill(i); }
  update(dt, t, wind) {
    // rockets: slow-motion climb with wobble, golden trails
    for (const r of this.rockets) {
      r.t += dt; const u = clamp(r.t / r.dur, 0, 1), e = ease.outCubic(u);
      r.x = lerp(r.x0, r.x1, e) + Math.sin(r.t * 7 + r.wob) * 4 * (1 - u); r.y = lerp(r.y0, r.y1, e); r.gy = lerp(r.gy0, SKY_GY, ease.inOut(u));
      const s = r.burst.big ? Math.max(unitScale(r.gy), 1.6) : unitScale(r.gy);   // his big rocket stays bright and visible all the way up
      if (dt > 0) for (let k = 0; k < (r.burst.big ? 6 : 3); k++) this.emit(0, r.x + (Math.random() - 0.5) * 2 * s, r.y + 3 * s, (Math.random() - 0.5) * 12 * s, (10 + Math.random() * 20) * s, 0.6 + Math.random() * 0.6, r.gy, 1.6 * s, 0);
      if (u >= 1) { r.done = true; this.burst(r); }
    }
    this.rockets = this.rockets.filter(r => !r.done);
    this.flashes.forEach(f => (f.t += dt)); this.flashes = this.flashes.filter(f => f.t < 1.6);
    let lk = 0, lx = 0, ly = 0;
    for (const f of this.flashes) { const k = f.k * Math.exp(-f.t * 2.6); lk += k; lx += f.x * k; ly += f.y * k; }
    const sx = 0, base = this.targets ? this.letterAlpha * 0.35 : 0;
    this.light.k = lerp(this.light.k, lk + base, 0.25); if (lk > 0.01) { this.light.x = lx / lk; this.light.y = ly / lk; }
    if (dt <= 0) return;
    const g = 60, w = wind;
    for (let i = 0; i < this.max; i++) {
      if (!this.alive[i]) continue;
      const k = this.kind[i]; this.age[i] += dt;
      if (k === 2) { // letter spark: explode, then spring into its letter with overshoot, then breathe
        const a = this.age[i];
        if (a < 0.45) { this.vx[i] *= Math.pow(0.08, dt); this.vy[i] = this.vy[i] * Math.pow(0.08, dt) + 20 * dt; }
        else {
          const K = 26 * clamp((a - 0.45) / 0.7, 0, 1), c = 2 * Math.sqrt(K + 0.01) * 0.42;
          curl(this.x[i] * 0.004, this.y[i] * 0.004, t * 0.25, C2);
          this.vx[i] += ((this.tx[i] - this.x[i]) * K - this.vx[i] * c + C2[0] * 6) * dt;
          this.vy[i] += ((this.ty[i] - this.y[i]) * K - this.vy[i] * c + C2[1] * 6) * dt;
        }
      } else if (k === 3) { /* crackle pop: static */ }
      else {
        const drag = k === 4 ? 1.6 : k === 0 ? 2.2 : 1.2;
        curl(this.x[i] * 0.006, this.y[i] * 0.006, t * 0.4 + this.seed[i], C2);
        this.vx[i] += (-this.vx[i] * drag + C2[0] * 22 + w * 6) * dt; this.vy[i] += (-this.vy[i] * drag + C2[1] * 22 + g * (k === 4 ? 0.9 : 0.6)) * dt;
        if (k === 1 && Math.random() < dt * 0.6 && this.age[i] > 0.6) { this.emit(3, this.x[i], this.y[i], 0, 0, 0.12, this.gy[i], 4.5, 0); if (Math.random() < 0.08 && this.hooks.crackle) this.hooks.crackle(); }
      }
      this.x[i] += this.vx[i] * dt; this.y[i] += this.vy[i] * dt;
      this.life[i] -= dt; if (this.life[i] <= 0) this.kill(i);
    }
  }
  draw(add, t) {
    const col = [0, 0, 0];
    for (const r of this.rockets) { const s = r.burst.big ? Math.max(unitScale(r.gy), 1.6) : unitScale(r.gy); add.push(r.x, r.y, r.gy, 0, 5 * s, 5 * s, 0, 0, 1, 0.92, 0.7, 1); add.push(r.x, r.y, r.gy, 0, 16 * s, 16 * s, 0, 0, 1, 0.7, 0.35, 0.35); }
    for (const f of this.flashes) { const k = Math.exp(-f.t * 3.5); add.push(f.x, f.y, SKY_GY, 0, 260 * (0.6 + f.t), 260 * (0.6 + f.t), 0, 0, 1, 0.85, 0.6, 0.55 * k * f.k); }
    for (let i = 0; i < this.max; i++) {
      if (!this.alive[i]) continue;
      const k = this.kind[i], s = this.size[i];
      if (k === 2) {
        const a = this.age[i], settle = clamp((a - 0.6) / 1.4, 0, 1), br = (0.75 + 0.25 * Math.sin(t * 2.1 + this.seed[i] * 3)) * (0.85 + 0.15 * Math.sin(t * 0.9 + this.x[i] * 0.01)) * this.letterAlpha;
        const heart = this.hue[i] === 1, cr = 1, cg = heart ? lerp(0.95, 0.55, settle) : lerp(1, 0.86, settle), cb = heart ? lerp(0.9, 0.72, settle) : lerp(0.95, 0.55, settle);
        const jx = (noise2(this.seed[i], t * 0.7) * 0.8) * settle * this.shimmer;
        add.push(this.x[i] + jx, this.y[i], SKY_GY, 0, s, s, -this.vx[i] * 0.03, -this.vy[i] * 0.03, cr, cg, cb, br);
        if ((i & 1) === 0) add.push(this.x[i], this.y[i], SKY_GY, 0, s * 4, s * 4, 0, 0, cr, cg * 0.85, cb * 0.7, 0.2 * br);
      } else if (k === 3) { const u = 1 - this.life[i] / this.ml[i]; add.push(this.x[i], this.y[i], this.gy[i], 0, s * (1 + u), s * (1 + u), 0, 0, 1, 0.97, 0.85, (1 - u) * 1.2); }
      else {
        const u = 1 - this.life[i] / this.ml[i]; cool(k === 0 ? 0.25 + u * 0.75 : u, col);
        if (this.hue[i] === 1) { col[0] = lerp(1, 0.95, u); col[1] = lerp(0.75, 0.4, u); col[2] = lerp(0.9, 0.7, u); }
        if (this.hue[i] === 2) { col[0] = lerp(0.8, 0.6, u); col[1] = lerp(0.75, 0.5, u); col[2] = 1; }
        if (this.hue[i] === 3) { col[0] = lerp(0.95, 0.7, u); col[1] = lerp(0.62, 0.36, u); col[2] = 1; }
        const a = k === 0 ? (1 - u) * 0.8 : (1 - u * u) * 1.1, st = k === 0 ? 0.02 : 0.045;
        add.push(this.x[i], this.y[i], this.gy[i], 0, s, s, -this.vx[i] * st, -this.vy[i] * st, col[0], col[1], col[2], a);
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

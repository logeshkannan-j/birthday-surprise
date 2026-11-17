// Real-time 2D physics: global wind field with travelling gusts + curl turbulence, Verlet spring-chains
// (hair, ribbons), a hanging cloth hem, balloons on strings. Everything takes dt already scaled by bullet-time.
import { noise2, rand, clamp } from './core.js';

// ---------------------------------------------------------------- wind
// Wind blows from the sea (left) towards the town (+x). A gust is a pressure front moving across the world, so it
// reaches the water first, then the planter tree, then Helen's hair, then the big tree and the boy's shirt.
export class Wind {
  constructor() { this.t = 0; this.gusts = []; this.next = 2.5; }
  update(simT) {
    this.t = simT;
    if (simT >= this.next) { this.gusts.push({ t0: simT, x0: -700, v: 330 + rand() * 90, a: 0.8 + rand() * 0.7, w: 230 + rand() * 80 }); this.next = simT + 6.5 + rand() * 4.5; }
    this.gusts = this.gusts.filter(g => g.x0 + g.v * (simT - g.t0) < 2600);
  }
  // wind speed (character units / second) at world x, plus gust strength 0..1
  at(x, y = 0) {
    const t = this.t; let g = 0;
    for (const q of this.gusts) { const f = q.x0 + q.v * (t - q.t0), d = (x - f) / q.w; g += q.a * Math.exp(-d * d); }
    const base = 0.42 + 0.16 * Math.sin(t * 0.23) + 0.12 * noise2(x * 0.0021, t * 0.31);
    return { s: base + g, g: clamp(g, 0, 1.5) };
  }
  front() { let best = null; for (const q of this.gusts) { const f = q.x0 + q.v * (this.t - q.t0); if (!best || q.a > best.a) best = { x: f, a: q.a }; } return best || { x: -9999, a: 0 }; }
}

// ---------------------------------------------------------------- Verlet chain (hair strands, ribbon tails)
export class Chain {
  constructor(n, seg, o = {}) {
    this.n = n; this.seg = seg; this.x = new Float32Array(n); this.y = new Float32Array(n); this.px = new Float32Array(n); this.py = new Float32Array(n);
    this.drag = o.drag ?? 2.2; this.grav = o.grav ?? 260; this.bend = o.bend ?? 0.6; this.iter = o.iter ?? 4; this.lift = o.lift ?? 0.12; this.taper = o.taper ?? 1;
    this.inited = false;
  }
  reset(ax, ay, dx = 0, dy = 1) { for (let i = 0; i < this.n; i++) { this.x[i] = this.px[i] = ax + dx * this.seg * i; this.y[i] = this.py[i] = ay + dy * this.seg * i; } this.inited = true; }
  // ax,ay: pinned root (local units). wind: speed along +x (local units/s). ext: optional extra force fn(i)->[fx,fy]
  step(dt, ax, ay, wind, t, collide) {
    if (!this.inited) this.reset(ax, ay);
    if (dt <= 0) { const dx = ax - this.x[0], dy = ay - this.y[0]; for (let i = 0; i < this.n; i++) { this.x[i] += dx; this.y[i] += dy; this.px[i] += dx; this.py[i] += dy; } return; }
    const n = this.n, dt2 = dt * dt;
    this.x[0] = this.px[0] = ax; this.y[0] = this.py[0] = ay;
    for (let i = 1; i < n; i++) {
      const vx = (this.x[i] - this.px[i]) / dt, vy = (this.y[i] - this.py[i]) / dt, u = i / (n - 1);
      const turb = noise2(i * 0.37 + t * 1.3, t * 0.9 + i * 0.11);
      const wx = wind * (1 + 0.45 * turb) * (0.4 + 0.6 * u), wy = -Math.abs(wind) * this.lift * (0.5 + turb);
      const fx = (wx - vx) * this.drag, fy = (wy - vy) * this.drag * 0.6 + this.grav;
      const nx = this.x[i] + (this.x[i] - this.px[i]) * 0.985 + fx * dt2, ny = this.y[i] + (this.y[i] - this.py[i]) * 0.985 + fy * dt2;
      this.px[i] = this.x[i]; this.py[i] = this.y[i]; this.x[i] = nx; this.y[i] = ny;
    }
    for (let k = 0; k < this.iter; k++) {
      for (let i = 1; i < n; i++) { // distance constraints
        const dx = this.x[i] - this.x[i - 1], dy = this.y[i] - this.y[i - 1], d = Math.hypot(dx, dy) || 1e-6, diff = (d - this.seg) / d;
        if (i === 1) { this.x[i] -= dx * diff; this.y[i] -= dy * diff; }
        else { this.x[i] -= dx * diff * 0.5; this.y[i] -= dy * diff * 0.5; this.x[i - 1] += dx * diff * 0.5; this.y[i - 1] += dy * diff * 0.5; }
      }
      for (let i = 2; i < n; i++) { // bending: keep i-2..i from folding
        const dx = this.x[i] - this.x[i - 2], dy = this.y[i] - this.y[i - 2], d = Math.hypot(dx, dy) || 1e-6, rest = this.seg * 2 * (0.6 + 0.38 * this.bend);
        if (d < rest) { const c = (d - rest) / d * 0.5 * this.bend; this.x[i] -= dx * c; this.y[i] -= dy * c; this.x[i - 2] += dx * c * (i - 2 ? 1 : 0); this.y[i - 2] += dy * c * (i - 2 ? 1 : 0); }
      }
      if (collide) for (let i = 1; i < n; i++) collide(this, i);
      this.x[0] = ax; this.y[0] = ay;
    }
  }
}

// ---------------------------------------------------------------- cloth hem: a row of points hanging from anchors, linked to neighbours
export class Hem {
  constructor(n, o = {}) { this.n = n; this.x = new Float32Array(n); this.y = new Float32Array(n); this.px = new Float32Array(n); this.py = new Float32Array(n); this.inited = false; this.drag = o.drag ?? 3; this.grav = o.grav ?? 220; this.stiff = o.stiff ?? 0.25; }
  // anchors: array of [x,y] top points; rest: array of [x,y] rest positions of the hem points; len: rope length per point
  step(dt, anchors, rest, wind, t) {
    const n = this.n;
    if (!this.inited) { for (let i = 0; i < n; i++) { this.x[i] = this.px[i] = rest[i][0]; this.y[i] = this.py[i] = rest[i][1]; } this.inited = true; }
    if (dt <= 0) return;
    const dt2 = dt * dt;
    for (let i = 0; i < n; i++) {
      const vx = (this.x[i] - this.px[i]) / dt, vy = (this.y[i] - this.py[i]) / dt, turb = noise2(i * 0.5 + t * 1.6, t * 1.1);
      const fx = (wind * (0.6 + 0.5 * turb) - vx) * this.drag + (rest[i][0] - this.x[i]) * 60 * this.stiff;
      const fy = (-Math.abs(wind) * 0.25 * (0.5 + turb) - vy) * this.drag + this.grav * 0.25 + (rest[i][1] - this.y[i]) * 60 * this.stiff;
      const nx = this.x[i] + (this.x[i] - this.px[i]) * 0.98 + fx * dt2, ny = this.y[i] + (this.y[i] - this.py[i]) * 0.98 + fy * dt2;
      this.px[i] = this.x[i]; this.py[i] = this.y[i]; this.x[i] = nx; this.y[i] = ny;
    }
    for (let k = 0; k < 3; k++) {
      for (let i = 0; i < n; i++) { // rope to anchor
        const a = anchors[i], L = Math.hypot(rest[i][0] - a[0], rest[i][1] - a[1]) * 1.04, dx = this.x[i] - a[0], dy = this.y[i] - a[1], d = Math.hypot(dx, dy) || 1e-6;
        if (d > L) { this.x[i] = a[0] + dx / d * L; this.y[i] = a[1] + dy / d * L; }
      }
      for (let i = 1; i < n; i++) { // neighbour spacing
        const r = Math.hypot(rest[i][0] - rest[i - 1][0], rest[i][1] - rest[i - 1][1]), dx = this.x[i] - this.x[i - 1], dy = this.y[i] - this.y[i - 1], d = Math.hypot(dx, dy) || 1e-6, c = (d - r) / d * 0.5;
        this.x[i] -= dx * c; this.y[i] -= dy * c; this.x[i - 1] += dx * c; this.y[i - 1] += dy * c;
      }
    }
  }
}

// ---------------------------------------------------------------- balloon: buoyant body on a string chain (world units)
export class Balloon {
  constructor(hand, len, color, phase) { this.chain = new Chain(7, len / 6, { drag: 1.4, grav: -55, bend: 0.3, iter: 5, lift: 0 }); this.color = color; this.phase = phase; this.hand = hand; }
  step(dt, hand, wind, t) { this.chain.step(dt, hand[0], hand[1], wind * 18, t + this.phase); }
  get top() { const c = this.chain, i = c.n - 1; return [c.x[i], c.y[i]]; }
}

// ---------------------------------------------------------------- damped spring (secondary motion: ears, curls, breathing jiggle)
export class Spring {
  constructor(k = 60, d = 8) { this.k = k; this.d = d; this.x = 0; this.v = 0; }
  step(dt, target) { if (dt <= 0) return this.x; const a = (target - this.x) * this.k - this.v * this.d; this.v += a * dt; this.x += this.v * dt; return this.x; }
}

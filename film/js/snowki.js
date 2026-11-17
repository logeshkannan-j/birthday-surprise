// Snowki – the magical light-blue teddy. ONE rig, used by the birthday page (where he guides her through every
// step) and by the film (where he comes alive in her lap). Plush look: soft gradient fur, fuzzy edges, glossy eyes.
// Local units: about 100 tall, origin = where he sits / stands, up is -y. The host positions and scales him.
//
//   const s = new Snowki();  s.act('wave');  s.update(dt, { vel: [vx, vy] });  s.draw(ctx, { aura: true });
//
// Actions: idle sit stand wave point cheer clap hug cover peek sleep kick push fly dangle spin shy think hold
//          dance yawn bow lookUp giggle blow nod. Expressions: smile happy giggle wink surprised sleepy love shy
//          determined soft sad blow oops.

const TAU = Math.PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v), lerp = (a, b, t) => a + (b - a) * t;
function rng(seed) { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

export const SNOWKI = {
  fur: '#A6CDF1', furL: '#E2F1FF', furD: '#6A9AD6', muzzle: '#F3F9FF', inner: '#F7BDD2', pad: '#F6B3CA', nose: '#2A2744',
  eye: '#17142B', bow: '#F05D95', bowD: '#B8306A', heart: '#FF6E9C', line: 'rgba(48,78,140,.55)', mouth: '#7C2944', tongue: '#FF8DB0'
};

// a critically-damped-ish spring; z < 1 gives a little overshoot (life), substepped so it is stable at any frame rate
class Spring {
  constructor(k, z, x = 0) { this.k = k; this.c = 2 * Math.sqrt(k) * z; this.x = x; this.v = 0; }
  step(dt, to) { const n = Math.max(1, Math.ceil(dt * 120)), h = dt / n; for (let i = 0; i < n; i++) { this.v += (this.k * (to - this.x) - this.c * this.v) * h; this.x += this.v * h; } return this.x; }
  set(x) { this.x = x; this.v = 0; }
}
class Spring2 {
  constructor(k, z, p = [0, 0]) { this.a = new Spring(k, z, p[0]); this.b = new Spring(k, z, p[1]); }
  step(dt, p) { return [this.a.step(dt, p[0]), this.b.step(dt, p[1])]; }
  set(p) { this.a.set(p[0]); this.b.set(p[1]); }
  get p() { return [this.a.x, this.b.x]; }
}

// fuzzy plush edge: short strokes sticking out of an ellipse outline
function tufts(n, cx, cy, rx, ry, seed, a0 = 0, a1 = TAU) {
  const R = rng(seed), out = [];
  for (let i = 0; i < n; i++) {
    const a = a0 + (a1 - a0) * (i + 0.2 + R() * 0.6) / n, px = cx + Math.cos(a) * rx, py = cy + Math.sin(a) * ry;
    let nx = Math.cos(a) * ry, ny = Math.sin(a) * rx; const l = Math.hypot(nx, ny) || 1; nx /= l; ny /= l;
    out.push([px, py, nx, ny, 0.7 + R() * 1.3, (R() - 0.5) * 0.8]);
  }
  return out;
}
function drawTufts(ctx, T, style, w) {
  ctx.strokeStyle = style; ctx.lineWidth = w; ctx.beginPath();
  for (const [x, y, nx, ny, l, tw] of T) { const c = Math.cos(tw), s = Math.sin(tw), tx = nx * c - ny * s, ty = nx * s + ny * c; ctx.moveTo(x - nx * 1.6, y - ny * 1.6); ctx.lineTo(x + tx * l, y + ty * l); }
  ctx.stroke();
}
const furGrad = (ctx, x, y, r, C) => { const g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.45, r * 0.05, x, y, r * 1.15); g.addColorStop(0, C.furL); g.addColorStop(0.5, C.fur); g.addColorStop(1, C.furD); return g; };
function heartPath(x, y, s) { const p = new Path2D(); p.moveTo(x, y + s * 0.85); p.bezierCurveTo(x - s * 1.25, y + s * 0.05, x - s * 0.95, y - s * 1.0, x, y - s * 0.38); p.bezierCurveTo(x + s * 0.95, y - s * 1.0, x + s * 1.25, y + s * 0.05, x, y + s * 0.85); p.closePath(); return p; }
function star4(ctx, x, y, r, a) { ctx.beginPath(); for (let k = 0; k < 8; k++) { const ang = a + k * Math.PI / 4, rr = k % 2 ? r * 0.28 : r; ctx.lineTo(x + Math.cos(ang) * rr, y + Math.sin(ang) * rr); } ctx.closePath(); ctx.fill(); }
// two-bone IK; picks the elbow that bulges away from the body centre
function ik2(s, t, l1, l2, away) {
  const dx = t[0] - s[0], dy = t[1] - s[1], d = clamp(Math.hypot(dx, dy), 0.01, l1 + l2 - 0.01), a = Math.atan2(dy, dx);
  const off = Math.acos(clamp((l1 * l1 + d * d - l2 * l2) / (2 * l1 * d), -1, 1));
  const e1 = [s[0] + Math.cos(a + off) * l1, s[1] + Math.sin(a + off) * l1], e2 = [s[0] + Math.cos(a - off) * l1, s[1] + Math.sin(a - off) * l1];
  const end = [s[0] + Math.cos(a) * d, s[1] + Math.sin(a) * d];
  const da = Math.hypot(e1[0] - away[0], e1[1] - away[1]), db = Math.hypot(e2[0] - away[0], e2[1] - away[1]);
  return [da > db ? e1 : e2, end];
}

const EXPR = {
  smile: { eyes: ['open', 'open'], mouth: 'w', blush: 0.45 },
  happy: { eyes: ['arc', 'arc'], mouth: 'open', blush: 0.6 },
  giggle: { eyes: ['arc', 'arc'], mouth: 'open', blush: 0.7 },
  wink: { eyes: ['arc', 'open'], mouth: 'tongue', blush: 0.55 },
  surprised: { eyes: ['big', 'big'], mouth: 'o', blush: 0.4, brows: 'up' },
  sleepy: { eyes: ['sleep', 'sleep'], mouth: 'small', blush: 0.35 },
  love: { eyes: ['heart', 'heart'], mouth: 'open', blush: 0.8 },
  shy: { eyes: ['down', 'down'], mouth: 'wavy', blush: 0.9 },
  determined: { eyes: ['open', 'open'], mouth: 'flat', blush: 0.4, brows: 'det' },
  soft: { eyes: ['soft', 'soft'], mouth: 'w', blush: 0.55 },
  sad: { eyes: ['open', 'open'], mouth: 'frown', blush: 0.35, brows: 'worry' },
  blow: { eyes: ['arc', 'arc'], mouth: 'o', blush: 0.6, puff: 1 },
  oops: { eyes: ['big', 'big'], mouth: 'wavy', blush: 0.65, brows: 'worry' }
};

export class Snowki {
  constructor(o = {}) {
    this.C = { ...SNOWKI, ...(o.colors || {}) };
    this.t = 0; this.a = 0; this.name = 'idle'; this.o = {}; this.exprOver = null; this.gaze = [0, 0]; this.vel = [0, 0];
    this.stand = !!o.stand; this.magic = 0; this.blinkT = 2 + Math.random() * 2; this.blink = 0;
    // springs: whole-body, head, limbs (offsets from the shoulders / hips), little extras
    this.s = {
      lift: new Spring(140, 0.55, this.stand ? 12 : 0), lean: new Spring(90, 0.6), tilt: new Spring(120, 0.55), turn: new Spring(70, 0.75), nod: new Spring(90, 0.7),
      squash: new Spring(320, 0.3), spin: new Spring(200, 0.8, 1), magic: new Spring(30, 1), drop: new Spring(120, 0.7),
      armL: new Spring2(170, 0.5, [-5, 19]), armR: new Spring2(170, 0.5, [5, 19]),
      legL: new Spring2(150, 0.45, [-13.5, -5]), legR: new Spring2(150, 0.45, [13.5, -5]),
      earL: new Spring(160, 0.25), earR: new Spring(160, 0.25), bow: new Spring(110, 0.3), gaze: new Spring2(60, 0.8)
    };
    this.T = { head: tufts(70, 0, -66, 31, 28, 3), body: tufts(46, 0, -21, 24.5, 21, 5, -0.25, Math.PI + 0.25), earL: tufts(16, 0, 0, 11.5, 11.5, 7, Math.PI * 0.8, Math.PI * 2.2), earR: tufts(16, 0, 0, 11.5, 11.5, 9, Math.PI * 0.8, Math.PI * 2.2) };
    this.P = { hop: 0 }; this.hearts = [];
  }
  // switch to an action. o: { dir:[x,y], hold:'heart'|'star'|'key'|'lantern', stand:bool, expr }
  act(name, o = {}) { if (name !== this.name || o.restart) this.a = 0; this.name = name; this.o = o; if (o.stand != null) this.stand = o.stand; this.exprOver = o.expr || null; return this; }
  express(e) { this.exprOver = e; return this; }
  look(gx, gy) { this.gaze = [clamp(gx, -1, 1), clamp(gy, -1, 1)]; return this; }
  burstHearts(n = 5) { for (let i = 0; i < n; i++) this.hearts.push({ x: (Math.random() - 0.5) * 30, y: -80 - Math.random() * 10, vx: (Math.random() - 0.5) * 40, vy: -40 - Math.random() * 40, life: 1.4 + Math.random() * 0.6, s: 3 + Math.random() * 3 }); }

  // target pose for the current action at time a (seconds since it started)
  pose() {
    const a = this.a, o = this.o, st = this.stand, sit = !st, P = {
      lift: st ? 12 : 0, lean: 0, tilt: Math.sin(this.t * 0.7) * 0.04, turn: this.gaze[0] * 0.45, nod: this.gaze[1] * 0.35, squash: Math.sin(this.t * 2.2) * 0.012, spin: 1, hop: 0,
      armL: [-5, 19], armR: [5, 19], legL: sit ? [-13.5, -5] : [-11, -3], legR: sit ? [13.5, -5] : [11, -3],
      expr: 'smile', palm: [false, false], cover: 0, coverL: 0, zz: false, hold: o.hold || null, shake: 0, gaze: null, drop: 0
    };
    const dir = o.dir ? (() => { const l = Math.hypot(o.dir[0], o.dir[1]) || 1; return [o.dir[0] / l, o.dir[1] / l]; })() : [1, 0];
    switch (this.name) {
      case 'idle': case 'sit': case 'stand': break;
      case 'kick': { const k = Math.sin(a * 4.2); P.legL = [-13.5, -5 - Math.max(0, k) * 4]; P.legR = [13.5, -5 - Math.max(0, -k) * 4]; P.tilt = k * 0.05; P.expr = 'smile'; break; }
      case 'wave': P.armR = [11 + Math.sin(a * 9) * 4, -20 + Math.cos(a * 9) * 1.5]; P.palm[1] = true; P.tilt = 0.08 + Math.sin(a * 9) * 0.03; P.expr = 'happy'; break;
      case 'point': { const right = dir[0] >= -0.2, v = [dir[0] * 21, dir[1] * 21]; if (right) P.armR = v; else P.armL = v; P.lean = dir[0] * 0.08; P.turn = dir[0] * 0.55; P.nod = dir[1] * 0.4; P.expr = o.expr || 'smile'; break; }
      case 'cheer': { const w = Math.sin(a * 11) * 2.5; P.armL = [-9 - w, -21]; P.armR = [9 + w, -21]; P.palm = [true, true]; P.hop = Math.abs(Math.sin(a * Math.PI * 1.7)) * 13; P.expr = 'happy'; break; }
      case 'clap': { const k = (Math.sin(a * 13) + 1) / 2; P.armL = [lerp(6.5, 15.5, k), 6]; P.armR = [-lerp(6.5, 15.5, k), 6]; P.expr = 'happy'; P.squash += k * 0.02; break; }
      case 'hug': P.armL = [17, 8]; P.armR = [-17, 8]; P.lean = Math.sin(a * 3) * 0.09; P.tilt = Math.sin(a * 3) * 0.12; P.squash += 0.03 + Math.sin(a * 6) * 0.015; P.expr = o.expr || 'love'; break;
      case 'cover': P.cover = 1; P.coverL = 1; P.expr = 'smile'; P.nod = 0.15; P.drop = 6; P.tilt = Math.sin(a * 2) * 0.05; break;
      case 'peek': { P.cover = 1; P.drop = 6; const pk = Math.sin(a * 1.6) > 0.2 ? 1 : 0; P.coverL = 1 - pk * 0.85; P.expr = 'smile'; P.tilt = -0.08 * pk; break; }
      case 'sleep': P.nod = 0.9; P.tilt = 0.2; P.lean = 0.04; P.armL = [-3, 19]; P.armR = [3, 19]; P.expr = 'sleepy'; P.zz = true; P.drop = 3; P.squash = Math.sin(this.t * 1.3) * 0.03; break;
      case 'push': { const right = dir[0] >= 0, sgn = right ? 1 : -1; P.armL = [sgn * 21 + 2, -2]; P.armR = [sgn * 21 - 2, 2]; P.lean = sgn * 0.16; P.turn = sgn * 0.5; P.expr = 'determined'; P.shake = 1; break; }
      case 'fly': {
        const vx = this.vel[0], vy = this.vel[1]; P.lift = 6; P.lean = clamp(vx * 0.0016, -0.4, 0.4); P.tilt = clamp(vx * 0.0006, -0.15, 0.15);
        const f = Math.sin(a * 7) * 2.5; P.armL = [-15, 5 + f]; P.armR = [15, 5 - f];
        P.legL = [-9 - clamp(vx * 0.01, -6, 6), 2 + clamp(-vy * 0.01, -3, 6)]; P.legR = [9 - clamp(vx * 0.01, -6, 6), 2 + clamp(-vy * 0.01, -3, 6)];
        P.turn = clamp(vx * 0.003, -0.6, 0.6); P.expr = o.expr || 'happy'; break;
      }
      case 'dangle': {
        const vx = this.vel[0]; P.lift = 10; P.armL = [-5, -22]; P.armR = [5, -22]; P.palm = [true, true];
        P.legL = [-9 - clamp(vx * 0.02, -9, 9), 0]; P.legR = [9 - clamp(vx * 0.02, -9, 9), 0]; P.lean = clamp(-vx * 0.001, -0.3, 0.3);
        P.expr = a < 0.7 ? 'surprised' : 'giggle'; break;
      }
      case 'spin': P.spin = Math.cos(a * 15); P.armL = [-20, -2]; P.armR = [20, -2]; P.expr = 'happy'; P.hop = Math.sin(clamp(a / 0.9, 0, 1) * Math.PI) * 10; break;
      case 'shy': P.armL = [13, 15]; P.armR = [-13, 15]; P.tilt = 0.16; P.turn = -0.3; P.nod = 0.45; P.expr = 'shy'; P.drop = 2; break;
      case 'think': P.armR = [-9, -6]; P.tilt = -0.12; P.nod = -0.3; P.expr = 'smile'; P.gaze = [0.4, -0.8]; break;
      case 'hold': P.armL = [13, 9]; P.armR = [-13, 9]; P.expr = o.expr || 'happy'; break;
      case 'dance': { const k = Math.sin(a * 4.4); P.lean = k * 0.14; P.tilt = -k * 0.1; P.armL = [-12, k > 0 ? -18 : 12]; P.armR = [12, k > 0 ? 12 : -18]; P.hop = Math.abs(Math.sin(a * 8.8)) * 3; P.expr = 'happy'; break; }
      case 'yawn': if (a < 1.8) { P.armL = [-8, -22]; P.armR = [8, -22]; P.squash = -0.05; P.nod = -0.4; P.expr = '_yawn'; } else P.expr = 'soft'; break;
      case 'bow': { const k = Math.sin(clamp(a / 1.2, 0, 1) * Math.PI); P.nod = k; P.squash = k * 0.08; P.armR = [-11, 10]; P.expr = 'soft'; break; }
      case 'nod': P.nod = Math.sin(a * 6) * 0.6; P.expr = 'happy'; break;
      case 'lookUp': P.nod = -1; P.gaze = [0, -1]; P.tilt = 0.06; P.expr = o.expr || 'surprised'; break;
      case 'giggle': P.lean = Math.sin(a * 22) * 0.04; P.armL = [12, 13]; P.armR = [-12, 13]; P.expr = 'giggle'; P.squash += Math.abs(Math.sin(a * 11)) * 0.04; break;
      case 'blow': P.lean = dir[0] * 0.1; P.turn = dir[0] * 0.5; P.expr = 'blow'; P.armL = [-6, 18]; P.armR = [6, 18]; break;
    }
    if (o.expr && this.name !== 'dangle') P.expr = o.expr;
    if (this.exprOver) P.expr = this.exprOver;
    return P;
  }

  // ext: { vel: [vx, vy] in host units/s (for banking and dangling), magic: 0..1 }
  update(dt, ext = {}) {
    dt = Math.min(dt, 0.1); this.t += dt; this.a += dt;
    if (ext.vel) this.vel = ext.vel;
    const P = this.pose(), s = this.s; this.P = P;
    s.lift.step(dt, P.lift); s.lean.step(dt, P.lean); const tilt0 = s.tilt.x; s.tilt.step(dt, P.tilt); s.turn.step(dt, P.turn); s.nod.step(dt, P.nod);
    s.squash.step(dt, P.squash); s.drop.step(dt, P.drop); if (this.name === 'spin' && this.a < 0.9) s.spin.set(P.spin); else s.spin.step(dt, 1); s.magic.step(dt, ext.magic != null ? ext.magic : this.magic);
    s.armL.step(dt, P.armL); s.armR.step(dt, P.armR); s.legL.step(dt, P.legL); s.legR.step(dt, P.legR); s.gaze.step(dt, P.gaze || this.gaze);
    // ears and bow react to head motion and hops (secondary motion)
    const hv = (s.tilt.x - tilt0) / Math.max(dt, 1e-3), hopV = (P.hop - (this._hop || 0)) / Math.max(dt, 1e-3); this._hop = P.hop;
    s.earL.v += (-hv * 0.6 + hopV * 0.004) * dt * 60; s.earR.v += (-hv * 0.6 - hopV * 0.004) * dt * 60; s.earL.step(dt, 0); s.earR.step(dt, 0);
    s.bow.v += -hv * 0.8 * dt * 60 + this.vel[0] * 0.0004 * dt * 60; s.bow.step(dt, 0);
    // blinking
    this.blinkT -= dt; if (this.blinkT < 0) { this.blink = 0.13; this.blinkT = 2.2 + Math.random() * 3.5; } this.blink = Math.max(0, this.blink - dt);
    for (const h of this.hearts) { h.x += h.vx * dt; h.y += h.vy * dt; h.vy += 10 * dt; h.life -= dt; } this.hearts = this.hearts.filter(h => h.life > 0);
  }

  // draw in local units at the current transform. opt: { aura: bool (warm glow behind, for the page), sparkle: bool }
  draw(ctx, opt = {}) {
    const C = this.C, s = this.s, P = this.P, lift = s.lift.x, sit = clamp(1 - lift / 10, 0, 1), mg = s.magic.x, t = this.t;
    ctx.save();
    ctx.lineCap = ctx.lineJoin = 'round';
    if (opt.aura !== false && mg > 0.01) {
      const g = ctx.createRadialGradient(0, -55 - P.hop, 4, 0, -55 - P.hop, 92); g.addColorStop(0, `rgba(255,226,150,${0.42 * mg})`); g.addColorStop(0.45, `rgba(255,190,120,${0.16 * mg})`); g.addColorStop(1, 'rgba(255,190,120,0)');
      ctx.fillStyle = g; ctx.fillRect(-100, -150 - P.hop, 200, 190);
    }
    // whole-body transform: hop, lean (about the seat), squash and spin
    const sh = P.shake ? Math.sin(t * 60) * 0.6 : 0;
    ctx.translate(sh, -P.hop); ctx.rotate(s.lean.x); ctx.scale((1 + s.squash.x) * s.spin.x, 1 - s.squash.x);
    const front = s.spin.x >= 0;
    const hipY = -8 - lift, shY = -36 - lift, neckY = -40 - lift, drop = s.drop.x;
    // legs behind the body when standing / flying
    if (sit < 0.5) this.legs(ctx, hipY, sit);
    this.body(ctx, lift, front);
    if (sit >= 0.5) this.legs(ctx, hipY, sit);
    // head (with ears), then the bow under the chin
    ctx.save(); ctx.translate(0, neckY + drop); ctx.rotate(s.tilt.x); ctx.translate(0, -neckY - lift);
    this.head(ctx, P, front);
    ctx.restore();
    this.bow(ctx, neckY + 0.5);
    // arms (IK from the shoulders), paws, held item
    const sL = [-17.5, shY], sR = [17.5, shY];
    let tL = [sL[0] + s.armL.p[0], sL[1] + s.armL.p[1]], tR = [sR[0] + s.armR.p[0], sR[1] + s.armR.p[1]];
    if (P.cover > 0) { // paws over the eyes (in head space)
      const ex = s.turn.x * 8, ey = -69 + s.nod.x * 3, c = Math.cos(s.tilt.x), n = Math.sin(s.tilt.x), hp = (x, y) => [x * c - (y + 40) * n, -40 - lift + drop + x * n + (y + 40) * c];
      const eL = hp(-12 + ex, ey + 2), eR = hp(12 + ex, ey + 2);
      tL = [lerp(tL[0], eL[0], P.coverL), lerp(tL[1], eL[1], P.coverL)]; tR = [lerp(tR[0], eR[0], P.cover), lerp(tR[1], eR[1], P.cover)];
    }
    const away = [0, -25 - lift];
    this.arm(ctx, sL, tL, away, P.palm[0] || P.cover > 0.5);
    this.arm(ctx, sR, tR, away, P.palm[1] || P.cover > 0.5);
    if (P.hold) this.item(ctx, P.hold, [(tL[0] + tR[0]) / 2, (tL[1] + tR[1]) / 2 - 4], t);
    if (P.zz) this.zz(ctx, t, lift);
    ctx.restore();
    // hearts and orbiting sparkles (screen-upright)
    for (const h of this.hearts) { ctx.globalAlpha = clamp(h.life, 0, 1); ctx.fillStyle = C.heart; ctx.fill(heartPath(h.x, h.y, h.s)); }
    ctx.globalAlpha = 1;
    if (opt.sparkle !== false && mg > 0.05) {
      const op = ctx.globalCompositeOperation; ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 6; i++) { const ang = t * 0.9 + i * TAU / 6, r = 52 + Math.sin(t * 2 + i) * 6, tw = 0.5 + 0.5 * Math.sin(t * 5 + i * 2.1);
        ctx.fillStyle = `rgba(255,${226 + i * 4},${150 + i * 12},${0.85 * mg * tw})`; star4(ctx, Math.cos(ang) * r, -55 - P.hop + Math.sin(ang) * r * 0.75, 2.2 + 2.2 * tw, t * 0.6 + i); }
      ctx.globalCompositeOperation = op;
    }
    ctx.restore();
  }

  body(ctx, lift, front) {
    const C = this.C, y0 = -lift;
    ctx.save(); ctx.translate(0, y0);
    const b = new Path2D('M0 -45 C14 -45 22.5 -37 24.5 -25 C26.5 -12 22.5 -1 0 -0.5 C-22.5 -1 -26.5 -12 -24.5 -25 C-22.5 -37 -14 -45 0 -45 Z');
    const g = furGrad(ctx, 0, -24, 28, C);
    ctx.fillStyle = g; ctx.fill(b);
    ctx.save(); ctx.clip(b); ctx.strokeStyle = 'rgba(70,105,175,.28)'; ctx.lineWidth = 5; ctx.stroke(b); ctx.restore();
    ctx.strokeStyle = C.line; ctx.lineWidth = 1.1; ctx.stroke(b);
    drawTufts(ctx, this.T.body, g, 1.7);
    if (front) {
      // belly patch with an embroidered heart
      ctx.fillStyle = C.muzzle; ctx.globalAlpha = 0.9; ctx.beginPath(); ctx.ellipse(0, -20, 15.5, 14, 0, 0, TAU); ctx.fill(); ctx.globalAlpha = 1;
      ctx.strokeStyle = 'rgba(120,150,200,.35)'; ctx.lineWidth = 0.8; ctx.setLineDash([1.6, 1.4]); ctx.beginPath(); ctx.ellipse(0, -20, 14.2, 12.7, 0, 0, TAU); ctx.stroke();
      const hp = heartPath(0, -19.5, 6.2); const hg = ctx.createLinearGradient(0, -26, 0, -13); hg.addColorStop(0, '#FF8DB3'); hg.addColorStop(1, '#E84B83'); ctx.fillStyle = hg; ctx.fill(hp);
      ctx.strokeStyle = 'rgba(255,255,255,.75)'; ctx.lineWidth = 0.7; ctx.stroke(hp); ctx.setLineDash([]);
    }
    ctx.restore();
  }

  legs(ctx, hipY, sit) {
    const C = this.C, s = this.s;
    for (const [side, sp] of [[-1, s.legL], [1, s.legR]]) {
      const hip = [side * 10.5, hipY], foot = sp.p;
      this.tube(ctx, hip, foot, null, 13.5, 12);
      // foot: sole pad facing us when sitting; a little oval when standing / flying
      ctx.save(); ctx.translate(foot[0], foot[1]); ctx.rotate(side * 0.12);
      const rx = 9.2, ry = lerp(5.4, 8.6, sit);
      const g = furGrad(ctx, 0, 0, 10, C); ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(0, 0, rx, ry, 0, 0, TAU); ctx.fill();
      ctx.strokeStyle = C.line; ctx.lineWidth = 1; ctx.stroke();
      if (sit > 0.3) {
        ctx.globalAlpha = clamp((sit - 0.3) * 2, 0, 1); ctx.fillStyle = C.pad; ctx.beginPath(); ctx.ellipse(0, 1.6, 5.2, 4.4, 0, 0, TAU); ctx.fill();
        for (const [bx, by] of [[-3.8, -4.2], [0, -5.4], [3.8, -4.2]]) { ctx.beginPath(); ctx.ellipse(bx, by, 1.6, 1.4, 0, 0, TAU); ctx.fill(); }
        ctx.globalAlpha = 1;
      }
      ctx.restore();
    }
  }

  // a soft plush tube from a to b (optionally bending through e): outline, fur, highlight
  tube(ctx, a, b, e, w0, w1) {
    const C = this.C, p = new Path2D(); p.moveTo(a[0], a[1]);
    if (e) { const c = [2 * e[0] - (a[0] + b[0]) / 2, 2 * e[1] - (a[1] + b[1]) / 2]; p.quadraticCurveTo(c[0], c[1], b[0], b[1]); } else p.lineTo(b[0], b[1]);
    const w = (w0 + w1) / 2;
    ctx.strokeStyle = 'rgba(52,84,150,.62)'; ctx.lineWidth = w + 2.2; ctx.stroke(p);
    const g = ctx.createLinearGradient(a[0] - 8, a[1] - 8, a[0] + 8, a[1] + 8); g.addColorStop(0, C.furL); g.addColorStop(0.45, C.fur); g.addColorStop(1, C.furD);
    ctx.strokeStyle = g; ctx.lineWidth = w; ctx.stroke(p);
    ctx.save(); ctx.translate(-w * 0.16, -w * 0.18); ctx.strokeStyle = 'rgba(240,248,255,.35)'; ctx.lineWidth = w * 0.32; ctx.stroke(p); ctx.restore();
  }

  arm(ctx, sh, tg, away, palm) {
    const C = this.C, [el, end] = ik2(sh, tg, 12.5, 12.5, away);
    this.tube(ctx, sh, end, el, 12.5, 10.5);
    // paw
    const g = furGrad(ctx, end[0], end[1], 7.5, C); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(end[0], end[1], 6.4, 0, TAU); ctx.fill();
    ctx.strokeStyle = 'rgba(52,84,150,.5)'; ctx.lineWidth = 0.9; ctx.beginPath(); ctx.arc(end[0], end[1], 6.4, 0, TAU); ctx.stroke();
    if (palm) { ctx.fillStyle = C.pad; ctx.beginPath(); ctx.ellipse(end[0], end[1] + 0.6, 3.4, 3.0, 0, 0, TAU); ctx.fill(); }
  }

  head(ctx, P, front) {
    const C = this.C, s = this.s, tn = s.turn.x, nd = s.nod.x, fx = tn * 8, fy = nd * 3;
    // ears (behind the head), wobbling
    for (const [side, sp, T] of [[-1, s.earL, this.T.earL], [1, s.earR, this.T.earR]]) {
      const ex = side * 22 - fx * 0.35, ey = -88.5;
      ctx.save(); ctx.translate(ex, ey + 6); ctx.rotate(sp.x * side + side * 0.05); ctx.translate(0, -6);
      const g = furGrad(ctx, 0, 0, 12, C); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, 11.5, 0, TAU); ctx.fill();
      ctx.strokeStyle = C.line; ctx.lineWidth = 1; ctx.stroke(); drawTufts(ctx, T, g, 1.5);
      if (front) { ctx.fillStyle = C.inner; ctx.beginPath(); ctx.ellipse(side * 0.6, 1.2, 6.4, 6.0, 0, 0, TAU); ctx.fill(); ctx.fillStyle = 'rgba(255,255,255,.25)'; ctx.beginPath(); ctx.ellipse(side * 0.6 - 1.6, -0.6, 2.4, 1.6, -0.5, 0, TAU); ctx.fill(); }
      ctx.restore();
    }
    // head
    const hp = new Path2D(); hp.ellipse(0, -66, 31, 28, 0, 0, TAU);
    const g = furGrad(ctx, 0, -68, 33, C); ctx.fillStyle = g; ctx.fill(hp);
    ctx.save(); ctx.clip(hp); ctx.strokeStyle = 'rgba(70,105,175,.25)'; ctx.lineWidth = 6; ctx.stroke(hp);
    ctx.fillStyle = 'rgba(255,255,255,.22)'; ctx.beginPath(); ctx.ellipse(-9, -83, 13, 6.5, -0.25, 0, TAU); ctx.fill(); ctx.restore();
    ctx.strokeStyle = C.line; ctx.lineWidth = 1.1; ctx.stroke(hp);
    drawTufts(ctx, this.T.head, g, 1.8);
    if (!front) return;
    // a little seam on the forehead (plush detail)
    ctx.strokeStyle = 'rgba(80,115,180,.35)'; ctx.lineWidth = 0.8; ctx.setLineDash([1.4, 1.6]); ctx.beginPath(); ctx.moveTo(fx * 0.6, -93); ctx.quadraticCurveTo(fx * 0.8, -86, fx * 0.9, -80); ctx.stroke(); ctx.setLineDash([]);
    const E = EXPR[P.expr] || EXPR.smile, yawn = P.expr === '_yawn';
    // cheeks
    const bl = yawn ? 0.4 : E.blush, puff = E.puff ? 1.45 : 1;
    for (const side of [-1, 1]) { const cx = side * 20 * (1 - Math.abs(tn) * 0.1) + fx * 0.8, cy = -57 + fy; const cg = ctx.createRadialGradient(cx, cy, 0, cx, cy, 6.5 * puff); cg.addColorStop(0, `rgba(255,128,170,${bl})`); cg.addColorStop(1, 'rgba(255,128,170,0)'); ctx.fillStyle = cg; ctx.fillRect(cx - 8 * puff, cy - 7 * puff, 16 * puff, 14 * puff); }
    // muzzle
    const mx = fx * 1.1, my = -56 + fy * 1.15;
    const mg = ctx.createRadialGradient(mx - 3, my - 4, 1, mx, my, 15); mg.addColorStop(0, '#FFFFFF'); mg.addColorStop(1, '#D8E9F8');
    ctx.fillStyle = mg; ctx.beginPath(); ctx.ellipse(mx, my, 13.5 * (1 - Math.abs(tn) * 0.08), 10.4, 0, 0, TAU); ctx.fill();
    ctx.strokeStyle = 'rgba(100,135,190,.35)'; ctx.lineWidth = 0.8; ctx.stroke();
    // eyes
    const gz = s.gaze.p, sp = 12.5 * (1 - Math.abs(tn) * 0.12);
    const types = yawn ? ['sleep', 'sleep'] : E.eyes;
    for (let i = 0; i < 2; i++) { const side = i ? 1 : -1; this.eye(ctx, side * sp + fx, -69 + fy, types[i], gz, side, tn); }
    if (E.brows && !yawn) this.brows(ctx, E.brows, sp, fx, fy);
    // nose + mouth
    const nx = fx * 1.22, ny = -61.2 + fy * 1.2;
    ctx.fillStyle = C.nose; ctx.beginPath(); ctx.moveTo(nx - 4.2, ny - 1.6); ctx.quadraticCurveTo(nx, ny - 3.6, nx + 4.2, ny - 1.6); ctx.quadraticCurveTo(nx + 3.6, ny + 1.6, nx, ny + 2.7); ctx.quadraticCurveTo(nx - 3.6, ny + 1.6, nx - 4.2, ny - 1.6); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.7)'; ctx.beginPath(); ctx.ellipse(nx - 1.3, ny - 1.5, 1.4, 0.7, -0.2, 0, TAU); ctx.fill();
    this.mouth(ctx, yawn ? 'yawn' : E.mouth, nx, ny);
  }

  eye(ctx, x, y, kind, gz, side, tn) {
    const C = this.C, blinking = this.blink > 0 && ['open', 'big', 'down'].includes(kind);
    ctx.lineCap = 'round';
    if (blinking) { ctx.strokeStyle = C.eye; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x - 4.4, y + 0.6); ctx.quadraticCurveTo(x, y + 2.4, x + 4.4, y + 0.6); ctx.stroke(); return; }
    if (kind === 'soft') { ctx.strokeStyle = C.eye; ctx.lineWidth = 2.1; ctx.beginPath(); ctx.moveTo(x - 4.9, y + 0.6); ctx.quadraticCurveTo(x, y - 2.8, x + 4.9, y + 0.6); ctx.stroke(); ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x + side * 4.7, y + 0.4); ctx.lineTo(x + side * 6.2, y - 0.6); ctx.stroke(); return; }
    if (kind === 'arc') { ctx.strokeStyle = C.eye; ctx.lineWidth = 2.3; ctx.beginPath(); ctx.moveTo(x - 4.8, y + 1.4); ctx.quadraticCurveTo(x, y - 4.6, x + 4.8, y + 1.4); ctx.stroke(); return; }
    if (kind === 'sleep') { ctx.strokeStyle = C.eye; ctx.lineWidth = 2.1; ctx.beginPath(); ctx.moveTo(x - 4.8, y - 0.2); ctx.quadraticCurveTo(x, y + 3.4, x + 4.8, y - 0.2); ctx.stroke();
      ctx.lineWidth = 1.1; ctx.beginPath(); ctx.moveTo(x + side * 4.6, y - 0.1); ctx.lineTo(x + side * 6.2, y - 1.2); ctx.stroke(); return; }
    if (kind === 'heart') { const hp = heartPath(x, y, 5.2); const g = ctx.createLinearGradient(x, y - 5, x, y + 5); g.addColorStop(0, '#FF7FAA'); g.addColorStop(1, '#E2306E'); ctx.fillStyle = g; ctx.fill(hp);
      ctx.fillStyle = 'rgba(255,255,255,.9)'; ctx.beginPath(); ctx.ellipse(x - 1.8, y - 1.6, 1.3, 0.9, -0.5, 0, TAU); ctx.fill(); return; }
    const big = kind === 'big', rx = big ? 5.1 : 4.4, ry = big ? 6.4 : 5.6, px = x + gz[0] * 1.6, py = y + gz[1] * 1.3 + (kind === 'down' ? 1.4 : 0);
    ctx.save();
    if (kind === 'soft') { ctx.beginPath(); ctx.rect(x - 8, y - 1.8, 16, 12); ctx.clip(); }
    const g = ctx.createRadialGradient(px, py + ry * 0.4, 0.5, px, py, ry * 1.1); g.addColorStop(0, '#3E4C8C'); g.addColorStop(0.45, '#221D3E'); g.addColorStop(1, C.eye);
    ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(px, py, rx * (1 - Math.max(0, side * tn) * 0.18), ry, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.96)'; ctx.beginPath(); ctx.ellipse(px + 1.4, py - 2.3, big ? 2.2 : 1.9, big ? 2.4 : 2.0, 0, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.arc(px - 1.7, py + 2.2, big ? 1.1 : 0.9, 0, TAU); ctx.fill();
    ctx.restore();
    if (kind === 'soft') { ctx.strokeStyle = C.eye; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(x - 5, y - 1.2); ctx.quadraticCurveTo(x, y - 3.2, x + 5, y - 1.2); ctx.stroke(); }
    if (kind === 'down') { ctx.strokeStyle = C.eye; ctx.lineWidth = 1.3; ctx.beginPath(); ctx.moveTo(x - 4.8, y - 3.4); ctx.quadraticCurveTo(x, y - 5.6, x + 4.8, y - 3.4); ctx.stroke(); }
  }

  brows(ctx, kind, sp, fx, fy) {
    ctx.strokeStyle = 'rgba(48,80,145,.9)'; ctx.lineWidth = 1.7;
    for (const side of [-1, 1]) {
      const x = side * sp + fx, y = -78 + fy; ctx.beginPath();
      if (kind === 'up') { ctx.moveTo(x - 4, y - 1); ctx.quadraticCurveTo(x, y - 4, x + 4, y - 1); }
      else if (kind === 'det') { ctx.moveTo(x - side * 4.5, y + 1.2); ctx.lineTo(x + side * 3.5, y - 2.0); }
      else { ctx.moveTo(x - side * 4.5, y - 2.2); ctx.lineTo(x + side * 3.5, y + 0.8); }
      ctx.stroke();
    }
  }

  mouth(ctx, m, nx, ny) {
    const C = this.C; ctx.strokeStyle = C.nose; ctx.lineWidth = 1.35; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(nx, ny + 2.4); ctx.lineTo(nx, ny + 5.0); ctx.stroke();
    const fillM = p => { ctx.fillStyle = C.mouth; ctx.fill(p); ctx.save(); ctx.clip(p); ctx.fillStyle = C.tongue; ctx.beginPath(); ctx.ellipse(nx, ny + 11.2, 3.4, 2.3, 0, 0, TAU); ctx.fill(); ctx.restore(); ctx.strokeStyle = C.nose; ctx.lineWidth = 1; ctx.stroke(p); };
    ctx.beginPath();
    switch (m) {
      case 'open': { const p = new Path2D(); p.moveTo(nx - 5.6, ny + 4.6); p.quadraticCurveTo(nx, ny + 5.6, nx + 5.6, ny + 4.6); p.quadraticCurveTo(nx + 4.4, ny + 12.6, nx, ny + 12.8); p.quadraticCurveTo(nx - 4.4, ny + 12.6, nx - 5.6, ny + 4.6); p.closePath(); fillM(p); return; }
      case 'yawn': { const p = new Path2D(); p.ellipse(nx, ny + 9.6, 4.6, 5.6, 0, 0, TAU); fillM(p); return; }
      case 'o': { const p = new Path2D(); p.ellipse(nx, ny + 8.4, 2.5, 3.0, 0, 0, TAU); ctx.fillStyle = C.mouth; ctx.fill(p); return; }
      case 'tongue': ctx.moveTo(nx - 5.8, ny + 4.4); ctx.quadraticCurveTo(nx - 2.9, ny + 8.4, nx, ny + 5.0); ctx.quadraticCurveTo(nx + 2.9, ny + 8.4, nx + 5.8, ny + 4.4); ctx.stroke();
        ctx.fillStyle = C.tongue; ctx.beginPath(); ctx.ellipse(nx + 2.6, ny + 7.9, 1.7, 1.9, 0.2, 0, TAU); ctx.fill(); return;
      case 'small': ctx.moveTo(nx - 2.6, ny + 6.4); ctx.quadraticCurveTo(nx, ny + 7.8, nx + 2.6, ny + 6.4); break;
      case 'flat': ctx.moveTo(nx - 3.8, ny + 6.8); ctx.lineTo(nx + 3.8, ny + 6.5); break;
      case 'wavy': ctx.moveTo(nx - 4.2, ny + 6.9); ctx.quadraticCurveTo(nx - 2.1, ny + 5.6, nx, ny + 6.9); ctx.quadraticCurveTo(nx + 2.1, ny + 8.2, nx + 4.2, ny + 6.9); break;
      case 'frown': ctx.moveTo(nx - 4.2, ny + 8.2); ctx.quadraticCurveTo(nx, ny + 5.4, nx + 4.2, ny + 8.2); break;
      default: ctx.moveTo(nx - 5.8, ny + 4.4); ctx.quadraticCurveTo(nx - 2.9, ny + 8.4, nx, ny + 5.0); ctx.quadraticCurveTo(nx + 2.9, ny + 8.4, nx + 5.8, ny + 4.4);
    }
    ctx.stroke();
  }

  bow(ctx, y) {
    const C = this.C, r = this.s.bow.x + this.s.tilt.x * 0.4;
    ctx.save(); ctx.translate(0, y); ctx.rotate(r);
    for (const side of [-1, 1]) { // ribbon tails
      ctx.save(); ctx.rotate(side * (0.35 + Math.sin(this.t * 2.4 + side) * 0.05) - r * 0.6);
      ctx.fillStyle = C.bowD; ctx.beginPath(); ctx.moveTo(-1.6, 1); ctx.lineTo(1.6, 1); ctx.lineTo(2.2, 9.5); ctx.lineTo(0, 7.8); ctx.lineTo(-2.2, 9.5); ctx.closePath(); ctx.fill(); ctx.restore();
    }
    for (const side of [-1, 1]) {
      const p = new Path2D(); p.moveTo(0, 0); p.bezierCurveTo(side * 4, -7, side * 13.5, -7.5, side * 12.6, 0.2); p.bezierCurveTo(side * 11.8, 6.6, side * 4, 4.6, 0, 0); p.closePath();
      const g = ctx.createLinearGradient(0, -7, 0, 6); g.addColorStop(0, '#FF8DB8'); g.addColorStop(1, C.bowD); ctx.fillStyle = g; ctx.fill(p);
      ctx.strokeStyle = 'rgba(140,30,80,.55)'; ctx.lineWidth = 0.8; ctx.stroke(p);
      ctx.strokeStyle = 'rgba(255,255,255,.45)'; ctx.lineWidth = 1.1; ctx.beginPath(); ctx.moveTo(side * 3.5, -3.4); ctx.quadraticCurveTo(side * 8, -5.6, side * 10.5, -3); ctx.stroke();
    }
    ctx.fillStyle = C.bow; ctx.beginPath(); ctx.ellipse(0, 0.2, 3.4, 3.8, 0, 0, TAU); ctx.fill(); ctx.strokeStyle = 'rgba(140,30,80,.6)'; ctx.lineWidth = 0.8; ctx.stroke();
    ctx.restore();
  }

  item(ctx, kind, p, t) {
    ctx.save(); ctx.translate(p[0], p[1]);
    if (kind === 'heart') { const hp = heartPath(0, 0, 9 + Math.sin(t * 5) * 0.6); const g = ctx.createLinearGradient(0, -9, 0, 9); g.addColorStop(0, '#FF9DC0'); g.addColorStop(1, '#E3346F'); ctx.fillStyle = g; ctx.fill(hp); ctx.strokeStyle = 'rgba(160,20,70,.5)'; ctx.lineWidth = 1; ctx.stroke(hp); ctx.fillStyle = 'rgba(255,255,255,.8)'; ctx.beginPath(); ctx.ellipse(-3.6, -3, 2.2, 1.3, -0.6, 0, TAU); ctx.fill(); }
    else if (kind === 'star') { const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 22); g.addColorStop(0, 'rgba(255,236,170,.9)'); g.addColorStop(1, 'rgba(255,236,170,0)'); ctx.fillStyle = g; ctx.fillRect(-22, -22, 44, 44);
      ctx.fillStyle = '#FFD86A'; ctx.beginPath(); for (let k = 0; k < 10; k++) { const a = -Math.PI / 2 + k * Math.PI / 5, r = k % 2 ? 4 : 9.5; ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r); } ctx.closePath(); ctx.fill(); ctx.strokeStyle = '#E2A532'; ctx.lineWidth = 0.9; ctx.stroke(); }
    else if (kind === 'key') { ctx.rotate(-0.5); ctx.strokeStyle = '#E8B84A'; ctx.lineWidth = 2.6; ctx.beginPath(); ctx.arc(-7, 0, 4.4, 0, TAU); ctx.moveTo(-2.6, 0); ctx.lineTo(10, 0); ctx.moveTo(6, 0); ctx.lineTo(6, 3.6); ctx.moveTo(9, 0); ctx.lineTo(9, 3); ctx.stroke(); }
    else if (kind === 'lantern') { const fl = 0.85 + 0.15 * Math.sin(t * 9); const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 30); g.addColorStop(0, `rgba(255,214,140,${0.7 * fl})`); g.addColorStop(1, 'rgba(255,214,140,0)'); ctx.fillStyle = g; ctx.fillRect(-30, -30, 60, 60);
      const lg = ctx.createRadialGradient(0, 0, 1, 0, 0, 10); lg.addColorStop(0, '#FFF6D8'); lg.addColorStop(0.6, '#FFC46B'); lg.addColorStop(1, '#E2793A'); ctx.fillStyle = lg; ctx.beginPath(); ctx.moveTo(-5, -8); ctx.quadraticCurveTo(-10, 0, -5, 9); ctx.lineTo(5, 9); ctx.quadraticCurveTo(10, 0, 5, -8); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#7A3A2A'; ctx.fillRect(-4.5, -10, 9, 2.4); ctx.fillRect(-4, 8.6, 8, 2); }
    ctx.restore();
  }

  zz(ctx, t, lift) {
    ctx.fillStyle = 'rgba(220,235,255,.9)'; ctx.font = '600 10px Georgia, serif';
    for (let i = 0; i < 3; i++) { const u = ((t * 0.45) + i / 3) % 1; ctx.globalAlpha = Math.sin(u * Math.PI); ctx.save(); ctx.translate(22 + u * 20, -96 - lift - u * 26); ctx.scale(0.6 + u * 0.7, 0.6 + u * 0.7); ctx.fillText('z', 0, 0); ctx.restore(); }
    ctx.globalAlpha = 1;
  }
}

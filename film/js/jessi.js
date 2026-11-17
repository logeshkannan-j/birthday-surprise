// Jessi – her grey puppy (pointed ears, fluffy curled tail, big eyes). ONE side-view rig used by the birthday page
// (she runs in, barks, does tricks and falls asleep dreaming of Helen) and by the film (sitting beside Helen).
// Local units: nose to tail about 80, ear tips about 58 high standing; origin = ground under her body; she faces
// +x (right). The host flips her with a negative x scale.
//
//   const j = new Jessi();  j.act('run');  j.update(dt);  j.draw(ctx);
// Actions: stand run sit bark flip spin roll bow paw lie sleep yawn wake lookUp pet happy

const TAU = Math.PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v), lerp = (a, b, t) => a + (b - a) * t;
const easeIO = t => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

export const JESSI = { fur: '#6E6D7B', furD: '#474652', furL: '#A8A6B3', pale: '#D2D0DA', nose: '#1C1A22', eye: '#1A1216', inner: '#E0B4C6', tongue: '#F27C9C', mouth: '#5A2236', collar: '#E8457A', tag: '#F2C14E', line: 'rgba(28,26,38,.6)' };

class Spring {
  constructor(k, z, x = 0) { this.k = k; this.c = 2 * Math.sqrt(k) * z; this.x = x; this.v = 0; }
  step(dt, to) { const n = Math.max(1, Math.ceil(dt * 120)), h = dt / n; for (let i = 0; i < n; i++) { this.v += (this.k * (to - this.x) - this.c * this.v) * h; this.x += this.v * h; } return this.x; }
  set(x) { this.x = x; this.v = 0; }
}
function smooth(pts) { // closed Catmull-Rom through points
  const n = pts.length, p = new Path2D(); p.moveTo(pts[0][0], pts[0][1]);
  for (let i = 0; i < n; i++) { const p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n];
    p.bezierCurveTo(p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6, p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6, p2[0], p2[1]); }
  p.closePath(); return p;
}
function ik2(s, t, l1, l2) { // the middle joint points backwards (-x) like a dog's elbow / hock
  const dx = t[0] - s[0], dy = t[1] - s[1], d = clamp(Math.hypot(dx, dy), 0.01, l1 + l2 - 0.01), a = Math.atan2(dy, dx);
  const off = Math.acos(clamp((l1 * l1 + d * d - l2 * l2) / (2 * l1 * d), -1, 1));
  const e1 = [s[0] + Math.cos(a + off) * l1, s[1] + Math.sin(a + off) * l1], e2 = [s[0] + Math.cos(a - off) * l1, s[1] + Math.sin(a - off) * l1];
  return [e1[0] < e2[0] ? e1 : e2, [s[0] + Math.cos(a) * d, s[1] + Math.sin(a) * d]];
}
const rot = (p, a) => [p[0] * Math.cos(a) - p[1] * Math.sin(a), p[0] * Math.sin(a) + p[1] * Math.cos(a)];
const HS = 1.3;   // puppy head scale

export class Jessi {
  constructor(o = {}) {
    this.C = { ...JESSI, ...(o.colors || {}) }; this.t = 0; this.a = 0; this.name = 'stand'; this.o = {}; this.ph = 0;
    this.blinkT = 2; this.blink = 0; this.look = [0, 0];
    const S = (k, z, x) => new Spring(k, z, x);
    this.s = { by: S(120, 0.6, -21), pitch: S(90, 0.6), head: S(110, 0.55), mouth: S(260, 0.6), ear: S(140, 0.35), tail: S(70, 0.5, 3.6), wagA: S(30, 1, 0.3), sit: S(90, 0.7), lie: S(90, 0.7),
      fN: [S(220, 0.7, 11), S(220, 0.7, 0)], fF: [S(220, 0.7, 8), S(220, 0.7, 0)], rN: [S(220, 0.7, -10), S(220, 0.7, 0)], rF: [S(220, 0.7, -13), S(220, 0.7, 0)], breathe: S(60, 1) };
    this.P = { feet: [], eye: 'open' }; this.wag = 0; this.roll = 0; this.hop = 0; this.face = 1;
  }
  act(name, o = {}) { if (name !== this.name || o.restart) { this.a = 0; this.ph = 0; } this.name = name; this.o = o; return this; }
  lookAt(gx, gy) { this.look = [clamp(gx, -1, 1), clamp(gy, -1, 1)]; return this; }
  headTop() { return (this.cache || this.bodyXf()).headTop; }   // where a hand pets her (local units)

  pose() {
    const a = this.a, stand = [[11, 0], [8, 0], [-10, 0], [-13, 0]];
    // tail: absolute direction (radians, canvas convention); 3.6 = up and back, 3.0 = back along the ground
    const P = { by: -21, pitch: 0, head: 0, mouth: 0, ear: 0, tail: 3.75, wagA: 0.3, wagF: 9, feet: stand, eye: 'open', roll: 0, hop: 0, face: 1, tuck: 0, breathe: 0.6, pant: 0, sit: 0, lie: 0, zz: false };
    const sitPose = () => { P.sit = 1; P.by = -11.5; P.pitch = -0.82; P.head = 0.62; P.feet = [[10.5, 0], [8, 0], [2, 0], [0, 0]]; P.tail = 3.05; P.wagA = 0.18; };
    const liePose = () => { P.lie = 1; P.by = -8.2; P.pitch = 0.02; P.head = 0.1; P.feet = [[22, -0.6], [19.5, -0.3], [-2, -0.5], [-4.5, -0.3]]; P.tail = 3.0; P.wagA = 0.1; };
    switch (this.name) {
      case 'stand': P.wagA = 0.35; P.pant = 0.4; break;
      case 'happy': sitPose(); P.wagA = 0.4; P.wagF = 13; P.pant = 1; P.eye = 'happy'; break;
      case 'run': {
        const ph = this.ph, b = Math.abs(Math.sin(ph)); P.by = -21 - b * 3.4; P.pitch = Math.sin(ph) * 0.12; P.head = -0.08 + Math.sin(ph) * 0.06; P.ear = 0.7; P.tail = 3.35; P.wagA = 0.12; P.pant = 1;
        const st = (x0, p) => [x0 + Math.cos(p) * 8, -Math.max(0, Math.sin(p)) * 6];
        P.feet = [st(12, ph), st(9, ph + 0.5), st(-11, ph + Math.PI), st(-14, ph + Math.PI + 0.5)]; break;
      }
      case 'sit': sitPose(); break;
      case 'bark': {
        if (this.o.sit) sitPose(); const k = Math.max(0, Math.sin(a * 13)); P.mouth = k * 0.95; P.head += -0.2 - k * 0.12; P.ear = -0.25; P.wagA = 0.45; P.wagF = 14; P.hop = this.o.sit ? 0 : k * 2; break;
      }
      case 'flip': { const u = clamp(a / 1.05, 0, 1); P.hop = Math.sin(u * Math.PI) * 30; P.roll = -TAU * easeIO(clamp((u - 0.12) / 0.76, 0, 1)); P.tuck = Math.sin(u * Math.PI); P.ear = 0.7; P.mouth = 0.5; P.eye = u > 0.15 && u < 0.85 ? 'happy' : 'open'; break; }
      case 'spin': P.face = Math.cos(a * 11) >= 0 ? 1 : -1; P.hop = Math.abs(Math.sin(a * 11)) * 4; P.mouth = 0.6; P.pant = 1; P.wagA = 0.6; P.wagF = 18; P.eye = 'happy'; break;
      case 'roll': { liePose(); const u = clamp(a / 1.3, 0, 1); P.roll = TAU * easeIO(u); P.by = -10; P.mouth = 0.5; P.eye = 'happy'; P.tuck = Math.sin(u * Math.PI) * 0.8; break; }
      case 'bow': P.by = -16.5; P.pitch = 0.45; P.head = -0.4; P.feet = [[20, 0], [17.5, 0], [-10, 0], [-13, 0]]; P.tail = 4.1; P.wagA = 0.6; P.wagF = 16; P.mouth = 0.45; P.pant = 1; P.ear = -0.2; break;
      case 'paw': sitPose(); P.feet = [[17, -15 - Math.sin(a * 5) * 2], [8, 0], [2, 0], [0, 0]]; P.head = 0.45; P.mouth = 0.35; P.pant = 1; P.wagA = 0.35; P.wagF = 13; break;
      case 'lie': liePose(); P.pant = 0.5; break;
      case 'sleep': liePose(); P.head = 0.55; P.eye = 'sleep'; P.ear = 0.4; P.breathe = 1.6; P.tail = 2.75; P.wagA = 0.02; P.zz = true; break;
      case 'yawn': { liePose(); const k = Math.sin(clamp(a / 1.4, 0, 1) * Math.PI); P.head = 0.1 - k * 0.45; P.mouth = k * 1.25; P.eye = k > 0.3 ? 'sleep' : 'open'; P.ear = 0.25 * k; break; }
      case 'wake': liePose(); P.head = -0.12; P.ear = -0.4; P.eye = 'wide'; P.wagA = 0.35; break;
      case 'lookUp': sitPose(); P.head = 0.25; P.eye = 'up'; P.wagA = 0.2; break;
      case 'pet': sitPose(); P.head = 0.78; P.eye = 'happy'; P.wagA = 0.5; P.wagF = 14; P.ear = 0.5; P.pant = 0.6; break;
    }
    return P;
  }

  update(dt) {
    dt = Math.min(dt, 0.1); this.t += dt; this.a += dt;
    const P = this.pose(), s = this.s; this.P = P;
    if (this.name === 'run') this.ph += dt * (this.o.speed || 14);
    s.by.step(dt, P.by); s.pitch.step(dt, P.pitch); s.head.step(dt, P.head + this.look[1] * 0.15); s.mouth.step(dt, Math.max(P.mouth, P.pant * (0.18 + 0.1 * Math.sin(this.t * 14))));
    s.ear.step(dt, P.ear); s.tail.step(dt, P.tail); s.wagA.step(dt, P.wagA); s.breathe.step(dt, P.breathe); s.sit.step(dt, P.sit); s.lie.step(dt, P.lie);
    const fast = this.name === 'run';
    [s.fN, s.fF, s.rN, s.rF].forEach((f, i) => { if (fast) { f[0].set(P.feet[i][0]); f[1].set(P.feet[i][1]); } else { f[0].step(dt, P.feet[i][0]); f[1].step(dt, P.feet[i][1]); } });
    this.wag += dt * P.wagF; this.roll = P.roll; this.hop = P.hop; this.face = P.face;
    this.blinkT -= dt; if (this.blinkT < 0) { this.blink = 0.12; this.blinkT = 2 + Math.random() * 3.5; } this.blink = Math.max(0, this.blink - dt);
    this.cache = null;
  }

  bodyXf() {
    const s = this.s, by = s.by.x, p = s.pitch.x, br = Math.sin(this.t * (this.P.zz ? 1.6 : 2.6)) * 0.35 * s.breathe.x;
    const B = (x, y) => { const r = rot([x, y], p); return [r[0], by + r[1]]; };   // body frame -> local
    const neck = B(14, -7 + br * 0.3), ha = p + s.head.x;
    const H = (x, y) => { const r = rot([x * HS, y * HS], ha); return [neck[0] + r[0], neck[1] + r[1]]; };   // head frame -> local
    return (this.cache = { B, H, ha, p, by, br, headTop: H(7, -19) });
  }

  draw(ctx) {
    const C = this.C, s = this.s, P = this.P, X = this.bodyXf(), { B, H } = X, sit = s.sit.x;
    ctx.save(); ctx.lineCap = ctx.lineJoin = 'round';
    ctx.translate(0, -this.hop);
    if (this.roll) { const c = B(0, 0); ctx.translate(c[0], c[1]); ctx.rotate(this.roll); ctx.translate(-c[0], -c[1]); }
    if (this.face < 0) ctx.scale(-1, 1);
    const tuck = P.tuck || 0;
    const legPts = near => {
      const sh = near ? B(10.5, 3.5) : B(8, 2.5), hp = near ? B(-10.5, 3.5) : B(-13, 2.5), f = near ? s.fN : s.fF, r = near ? s.rN : s.rF;
      const tg = (q, base) => [lerp(q[0].x, base[0] + 2, tuck), lerp(q[1].x, base[1] + 5, tuck)];
      return { sh, hp, fr: ik2(sh, tg(f, sh), 9.5, 9.2), rr: ik2(hp, tg(r, hp), 10, 9.4) };
    };
    // far legs (darker)
    const lie = s.lie.x;
    if (lie < 0.5) { const L = legPts(false); this.leg(ctx, L.sh, L.fr[0], L.fr[1], C.furD, 7.4, false); if (sit < 0.5) this.leg(ctx, L.hp, L.rr[0], L.rr[1], C.furD, 8.4, false); }
    this.tail(ctx, B, X);
    // body: a round puppy belly
    const body = smooth([[12, -10.5 + X.br * 0.2], [2, -11.6], [-8, -11], [-15.5, -8], [-19, -2], [-18, 5], [-12, 9.6], [-3, 10 + X.br * 0.4], [7, 10.4 + X.br * 0.4], [14, 9.4], [18.5, 3], [17.5, -5]].map(q => B(q[0], q[1])));
    const bb = B(0, -12), bt = B(0, 11), g = ctx.createLinearGradient(bb[0], bb[1], bt[0], bt[1]); g.addColorStop(0, C.furD); g.addColorStop(0.45, C.fur); g.addColorStop(1, C.furL);
    ctx.fillStyle = g; ctx.fill(body); ctx.strokeStyle = C.line; ctx.lineWidth = 0.9; ctx.stroke(body);
    const chest = smooth([[17.8, -3], [18.4, 3.5], [13.5, 9.6], [6, 10.2], [8, 3.5], [12.5, -2]].map(q => B(q[0], q[1])));
    ctx.fillStyle = C.pale; ctx.globalAlpha = 0.9; ctx.fill(chest); ctx.globalAlpha = 1;
    ctx.strokeStyle = 'rgba(255,255,255,.16)'; ctx.lineWidth = 0.8; ctx.beginPath(); for (const [x0, y0] of [[-6, -8], [-2, -9], [2, -8.6], [-11, -6]]) { const q = B(x0, y0), r = B(x0 - 1.6, y0 + 1.6); ctx.moveTo(q[0], q[1]); ctx.lineTo(r[0], r[1]); } ctx.stroke();
    // sitting: the near haunch is a round folded thigh with the hind paw resting in front of it
    { const L = legPts(true);
      if (sit >= 0.5) { const hc = B(-11.5, 1.5), pg = ctx.createRadialGradient(hc[0] - 2, hc[1] - 3, 1, hc[0], hc[1], 10); pg.addColorStop(0, C.furL); pg.addColorStop(1, C.fur);
        ctx.fillStyle = pg; ctx.beginPath(); ctx.ellipse(hc[0] + 1, hc[1], 9.4, 7.6, X.p + 0.6, 0, TAU); ctx.fill(); ctx.strokeStyle = C.line; ctx.lineWidth = 0.9; ctx.stroke();
        const rp = [s.rN[0].x, s.rN[1].x]; this.paw(ctx, rp, true); }
      else this.leg(ctx, L.hp, L.rr[0], L.rr[1], C.fur, 8.4, true); }
    this.head(ctx, H, X);
    { const L = legPts(true); this.leg(ctx, L.sh, L.fr[0], L.fr[1], C.fur, 7.4, true); }
    // collar and a little gold tag
    const c1 = B(13, -9.5), c2 = B(17.5, 2.5), cm = H(1, -3.5);
    ctx.strokeStyle = C.collar; ctx.lineWidth = 2.6; ctx.beginPath(); ctx.moveTo(c1[0] - 1, c1[1] - 1); ctx.quadraticCurveTo(cm[0] + 2, cm[1] + 3, c2[0] + 0.5, c2[1]); ctx.stroke();
    const tg = B(18, 3.8); ctx.fillStyle = C.tag; ctx.beginPath(); ctx.arc(tg[0], tg[1] + 1.4, 1.6, 0, TAU); ctx.fill();
    if (P.zz) this.zz(ctx, H(9, -21));
    ctx.restore();
  }

  paw(ctx, c, near) {
    const C = this.C; ctx.fillStyle = near ? C.furL : C.fur; ctx.beginPath(); ctx.ellipse(c[0] + 1.6, c[1] - 1.5, 4.4, 2.8, 0, 0, TAU); ctx.fill(); ctx.strokeStyle = C.line; ctx.lineWidth = 0.7; ctx.stroke();
    if (near) { ctx.strokeStyle = 'rgba(40,36,50,.5)'; ctx.lineWidth = 0.5; ctx.beginPath(); ctx.moveTo(c[0] + 2.8, c[1] - 3.2); ctx.lineTo(c[0] + 3.2, c[1] - 0.6); ctx.moveTo(c[0] + 4.6, c[1] - 2.6); ctx.lineTo(c[0] + 5, c[1] - 0.6); ctx.stroke(); }
  }
  leg(ctx, a, b, c, col, w, near) {
    const C = this.C, p = new Path2D(); p.moveTo(a[0], a[1]); const k = [2 * b[0] - (a[0] + c[0]) / 2, 2 * b[1] - (a[1] + c[1]) / 2]; p.quadraticCurveTo(k[0], k[1], c[0], c[1]);
    ctx.strokeStyle = C.line; ctx.lineWidth = w + 1.5; ctx.stroke(p);
    ctx.strokeStyle = col; ctx.lineWidth = w; ctx.stroke(p);
    ctx.strokeStyle = near ? 'rgba(255,255,255,.14)' : 'rgba(255,255,255,.05)'; ctx.lineWidth = w * 0.3; ctx.save(); ctx.translate(w * 0.18, -w * 0.12); ctx.stroke(p); ctx.restore();
    this.paw(ctx, c, near);
  }

  tail(ctx, B, X) {
    const C = this.C, s = this.s, base = B(-16.5, -6), w = Math.sin(this.wag) * s.wagA.x, ang = s.tail.x + w;
    // a fluffy plume that curls up at the end, swelling then tapering to a pale tip
    const L = 17, pts = [base], N = 8, up = s.tail.x > 3.3 ? 1.35 : 0.4;
    for (let i = 1; i <= N; i++) { const u = i / N, a = ang + u * (0.75 * up + w * 0.4); pts.push([pts[i - 1][0] + Math.cos(a) * L / N, pts[i - 1][1] + Math.sin(a) * L / N]); }
    const wd = u => (u < 0.4 ? lerp(6, 12, u / 0.4) : lerp(12, 2.5, (u - 0.4) / 0.6)), Lp = [], Rp = [];
    for (let i = 0; i <= N; i++) { const a0 = pts[Math.max(0, i - 1)], a1 = pts[Math.min(N, i + 1)], dx = a1[0] - a0[0], dy = a1[1] - a0[1], l = Math.hypot(dx, dy) || 1, ww = wd(i / N) / 2; Lp.push([pts[i][0] - dy / l * ww, pts[i][1] + dx / l * ww]); Rp.push([pts[i][0] + dy / l * ww, pts[i][1] - dx / l * ww]); }
    const path = smooth(Lp.concat(Rp.reverse()));
    const g = ctx.createLinearGradient(base[0], base[1], pts[N][0], pts[N][1]); g.addColorStop(0, C.furD); g.addColorStop(0.55, C.fur); g.addColorStop(1, C.pale);
    ctx.fillStyle = g; ctx.fill(path); ctx.strokeStyle = C.line; ctx.lineWidth = 0.8; ctx.stroke(path);
    ctx.strokeStyle = 'rgba(255,255,255,.2)'; ctx.lineWidth = 0.7; ctx.beginPath(); for (let i = 2; i < N; i += 2) { ctx.moveTo(pts[i][0], pts[i][1]); ctx.lineTo(pts[i + 1][0], pts[i + 1][1]); } ctx.stroke();
    ctx.strokeStyle = C.fur; ctx.lineWidth = 1.1; ctx.beginPath(); for (let i = 2; i < N - 1; i += 2) for (const P of [Lp[i], Rp[N - i]]) { const c = pts[i], dx = P[0] - c[0], dy = P[1] - c[1]; ctx.moveTo(P[0] - dx * 0.25, P[1] - dy * 0.25); ctx.lineTo(P[0] + dx * 0.16 - dy * 0.12, P[1] + dy * 0.16 + dx * 0.12); } ctx.stroke();   // a softly ragged edge
  }

  head(ctx, H, X) {
    const C = this.C, s = this.s, P = this.P, mo = s.mouth.x, ear = s.ear.x, k = HS;
    const earPath = (bx0, bx1, tipX, tipY, back) => { const piv = [(bx0 + bx1) / 2, -17.5], r = q => { const d = rot([q[0] - piv[0], q[1] - piv[1]], -back * 0.9); return H(piv[0] + d[0], piv[1] + d[1]); };
      return [smooth([r([bx0, -16]), r([bx0 + 0.5, -22]), r([tipX - 0.9, tipY + 1.4]), r([tipX, tipY]), r([tipX + 1.3, tipY + 1.8]), r([bx1, -21.5]), r([bx1, -16.5])]), r]; };
    { const [p] = earPath(0, 5.5, 0.8, -28.5, ear); ctx.fillStyle = C.furD; ctx.fill(p); ctx.strokeStyle = C.line; ctx.lineWidth = 0.8; ctx.stroke(p); }
    // round puppy skull
    const skull = smooth([[0.5, -14.5], [6, -19.5], [12.5, -18.5], [16.5, -13.5], [17, -8.5], [13.5, -3.2], [7, -1.4], [1, -3.6], [-1.6, -9.5]].map(q => H(q[0], q[1])));
    const hc = H(8.5, -11), g = ctx.createRadialGradient(hc[0] - 3, hc[1] - 4, 1, hc[0], hc[1], 13 * k); g.addColorStop(0, C.furL); g.addColorStop(0.55, C.fur); g.addColorStop(1, C.furD);
    ctx.fillStyle = g; ctx.fill(skull); ctx.strokeStyle = C.line; ctx.lineWidth = 0.9; ctx.stroke(skull);
    // short muzzle; the lower jaw opens for barks, pants and yawns
    const jaw = mo * 0.55, J = (x, y) => { const piv = [12.5, -4.4], d = rot([x - piv[0], y - piv[1]], jaw); return H(piv[0] + d[0], piv[1] + d[1]); };
    if (mo > 0.04) {
      ctx.fillStyle = C.mouth; ctx.fill(smooth([H(13.5, -5.6), H(21.5, -6.2), J(21, -3.4), J(14.5, -3)]));
      const tq = J(18.2, -3.6); ctx.fillStyle = C.tongue; ctx.beginPath(); ctx.ellipse(tq[0], tq[1], 3.6 * k, 1.6 * k, X.ha + jaw, 0, TAU); ctx.fill();
      const low = smooth([J(13.5, -4.8), J(20.5, -4.6), J(21, -2.6), J(17, -1.3), J(13.5, -1.8)]); ctx.fillStyle = C.pale; ctx.fill(low); ctx.strokeStyle = C.line; ctx.lineWidth = 0.7; ctx.stroke(low);
    }
    const muz = smooth([[12.5, -12], [18, -10.6], [22.6, -8.4], [23, -5.6], [20, -4.2], [15, -4], [12, -6.6]].map(q => H(q[0], q[1])));
    ctx.fillStyle = C.pale; ctx.fill(muz); ctx.strokeStyle = C.line; ctx.lineWidth = 0.8; ctx.stroke(muz);
    // pale marks above the eye and on the cheek (husky puppy mask)
    ctx.fillStyle = C.pale; ctx.globalAlpha = 0.85; { const b = H(12.4, -16.2); ctx.beginPath(); ctx.ellipse(b[0], b[1], 2.0 * k, 1.0 * k, X.ha - 0.3, 0, TAU); ctx.fill(); const ch = H(10.5, -5.6); ctx.beginPath(); ctx.ellipse(ch[0], ch[1], 3.4 * k, 2.2 * k, X.ha - 0.2, 0, TAU); ctx.fill(); } ctx.globalAlpha = 1;
    // nose + mouth line
    const nz = H(22.6, -8.2); ctx.fillStyle = C.nose; ctx.beginPath(); ctx.ellipse(nz[0], nz[1], 2.3 * k, 1.8 * k, X.ha, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.55)'; ctx.beginPath(); ctx.ellipse(nz[0] - 0.6, nz[1] - 0.8, 0.9, 0.5, X.ha, 0, TAU); ctx.fill();
    if (mo <= 0.04) { const m0 = H(22.4, -6.4), m1 = H(19.8, -4.4), m2 = H(16.6, -5.2); ctx.strokeStyle = C.nose; ctx.lineWidth = 0.75; ctx.beginPath(); ctx.moveTo(m0[0], m0[1]); ctx.quadraticCurveTo(m1[0], m1[1], m2[0], m2[1]); ctx.stroke(); }
    // big shiny puppy eye
    const e = H(12.4, -11.6), kind = this.blink > 0 && (P.eye === 'open' || P.eye === 'up') ? 'blink' : P.eye;
    ctx.strokeStyle = C.eye; ctx.lineCap = 'round';
    if (kind === 'happy') { ctx.lineWidth = 1.4; ctx.beginPath(); ctx.arc(e[0], e[1] + 1.6, 3.0 * k * 0.85, Math.PI * 1.15 + X.ha, Math.PI * 1.85 + X.ha); ctx.stroke(); }
    else if (kind === 'sleep' || kind === 'blink') { ctx.lineWidth = 1.3; ctx.beginPath(); ctx.arc(e[0], e[1] - 1.6, 3.0 * k * 0.85, Math.PI * 0.2 + X.ha, Math.PI * 0.8 + X.ha); ctx.stroke(); }
    else {
      const big = (kind === 'wide' ? 1.12 : 1) * k, gx = this.look[0] * 0.6, gy = (kind === 'up' ? -1.2 : this.look[1] * 0.6);
      const eg = ctx.createRadialGradient(e[0] + gx, e[1] + gy + 1.4, 0.3, e[0] + gx, e[1] + gy, 3.4 * big); eg.addColorStop(0, '#5A3A2E'); eg.addColorStop(1, C.eye);
      ctx.fillStyle = eg; ctx.beginPath(); ctx.ellipse(e[0] + gx * 0.4, e[1] + gy * 0.3, 2.7 * big, 3.1 * big, X.ha, 0, TAU); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(e[0] + gx + 1.0, e[1] + gy - 1.3, 1.15 * big, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.arc(e[0] + gx - 1.0, e[1] + gy + 1.2, 0.5 * big, 0, TAU); ctx.fill();
    }
    // near ear – perks up, folds back when she runs or sleeps
    { const [p, r] = earPath(5, 11.5, 7.6, -29.5, ear); const g2 = ctx.createLinearGradient(...H(8, -17), ...H(7.5, -29)); g2.addColorStop(0, C.fur); g2.addColorStop(1, C.furD);
      ctx.fillStyle = g2; ctx.fill(p); ctx.strokeStyle = C.line; ctx.lineWidth = 0.8; ctx.stroke(p);
      ctx.fillStyle = C.inner; ctx.fill(smooth([r([7, -17.5]), r([7.4, -22.5]), r([7.9, -26]), r([9, -22.8]), r([10.2, -17.8])])); }
    ctx.strokeStyle = C.furL; ctx.lineWidth = 0.9; ctx.beginPath(); for (let i = 0; i < 4; i++) { const a = H(3.5 + i * 1.6, -2.8 + Math.sin(i) * 0.4), b = H(2.6 + i * 1.6, -0.6); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); } ctx.stroke();
  }

  zz(ctx, p) {
    ctx.fillStyle = 'rgba(220,230,255,.9)'; ctx.font = '600 8px Georgia, serif';
    for (let i = 0; i < 3; i++) { const u = ((this.t * 0.4) + i / 3) % 1; ctx.globalAlpha = Math.sin(u * Math.PI); ctx.save(); ctx.translate(p[0] + 4 + u * 14, p[1] - 4 - u * 18); ctx.scale(this.face < 0 ? -1 : 1, 1); ctx.scale(0.6 + u * 0.7, 0.6 + u * 0.7); ctx.fillText('z', 0, 0); ctx.restore(); }
    ctx.globalAlpha = 1;
  }
}

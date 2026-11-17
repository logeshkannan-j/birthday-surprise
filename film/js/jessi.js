// Jessi – her all-black German Shepherd PUPPY: big upright ears, round head, short muzzle, big shiny brown eyes, a round
// little body, short legs with real dog joints (elbow back; knee forward, hock back), big paws with tiny toenails,
// a short fluffy tail, a pink collar with a gold tag. ONE side-view rig used by the birthday page (she runs in, barks,
// does tricks, falls asleep and dreams of Helen; the reveal trio) and by the film (sitting beside Helen).
// Local units: nose to rump about 46, ear tips about 54 high standing; origin = ground under her body; she faces +x.
// The host flips her with a negative x scale.
//
//   const j = new Jessi();  j.act('run', { vx: 200 });  j.update(dt);  j.draw(ctx);
// Actions: stand walk run alert sit bark flip spin roll bow paw lie sleep yawn wake lookUp pet happy
//   o.restart  restart the action      o.vx  ground speed for walk/run (units/s; 0 = in place, feet still push backward)
//   o.speed    run cadence (rad/s)     o.sit bark while sitting

const TAU = Math.PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v), lerp = (a, b, t) => a + (b - a) * t;
const easeIO = t => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
const smoothstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const frac = x => x - Math.floor(x);

export const JESSI = { fur: '#24222C', furD: '#131219', furL: '#4B4859', sheen: 'rgba(190,182,240,.20)', pale: '#2E2B37', nose: '#09080C', eye: '#160E10', iris: '#7A4626',
  inner: '#5A4352', pad: '#8A6474', nail: '#C9C3D8', tongue: '#F27C9C', mouth: '#4A1A2C', collar: '#F0559A', tag: '#F2C14E', line: 'rgba(176,166,228,.62)', lineD: 'rgba(120,112,170,.5)' };

class Spring {
  constructor(k, z, x = 0) { this.k = k; this.c = 2 * Math.sqrt(k) * z; this.x = x; this.v = 0; }
  step(dt, to) { const n = Math.max(1, Math.ceil(dt * 120)), h = dt / n; for (let i = 0; i < n; i++) { this.v += (this.k * (to - this.x) - this.c * this.v) * h; this.x += this.v * h; } return this.x; }
  set(x) { this.x = x; this.v = 0; }
}
function smooth(pts, closed = true) { // Catmull-Rom through points
  const n = pts.length, p = new Path2D(); p.moveTo(pts[0][0], pts[0][1]);
  const last = closed ? n : n - 1;
  for (let i = 0; i < last; i++) { const p0 = pts[closed ? (i - 1 + n) % n : Math.max(0, i - 1)], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[closed ? (i + 2) % n : Math.min(n - 1, i + 2)];
    p.bezierCurveTo(p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6, p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6, p2[0], p2[1]); }
  if (closed) p.closePath(); return p;
}
// two-bone IK. back = true: the middle joint bends to the back of the limb's direction (a dog's elbow, its hock);
// back = false: it bends forward (the knee / stifle)
function ik(s, t, l1, l2, back) {
  const dx = t[0] - s[0], dy = t[1] - s[1], d = clamp(Math.hypot(dx, dy), Math.abs(l1 - l2) + 0.01, l1 + l2 - 0.001), a = Math.atan2(dy, dx);
  const off = Math.acos(clamp((l1 * l1 + d * d - l2 * l2) / (2 * l1 * d), -1, 1)), b = back ? a + off : a - off;
  const m = [s[0] + Math.cos(b) * l1, s[1] + Math.sin(b) * l1], e = [s[0] + Math.cos(a) * d, s[1] + Math.sin(a) * d];
  return [m, e];
}
const rot = (p, a) => [p[0] * Math.cos(a) - p[1] * Math.sin(a), p[0] * Math.sin(a) + p[1] * Math.cos(a)];
const add = (a, b) => [a[0] + b[0], a[1] + b[1]];
const HS = 1.04;                         // head scale
const FL1 = 6.6, FL2 = 7.4, HL1 = 7.6, HL2 = 7.4;   // front: upper arm, forearm; hind: thigh, lower thigh
const PAST = { stand: [-0.7, -3.6], tuck: [2.4, -2.6], flat: [-3.6, -0.9], up: [-2.4, 2.6] };   // paw → wrist
const META = { stand: [-2.3, -4.6], tuck: [-3.4, -3.3], fold: [-5.4, -1.0] };                  // paw → hock
const STAND = [[9.4, 0, 0], [7.6, 0, 0], [-8.8, 0, 0], [-10.8, 0, 0]];   // feet: front near, front far, hind near, hind far ([x, y, flex])

export class Jessi {
  constructor(o = {}) {
    this.C = { ...JESSI, ...(o.colors || {}) }; this.t = 0; this.a = 0; this.name = 'stand'; this.o = {}; this.ph = 0; this.omega = 14;
    this.blinkT = 2; this.blink = 0; this.look = [0, 0];
    const S = (k, z, x) => new Spring(k, z, x);
    this.s = { by: S(150, 0.62, -17), pitch: S(110, 0.65), st: S(120, 0.7), head: S(120, 0.6), nf: S(110, 0.7), nd: S(110, 0.7), mouth: S(260, 0.62), ear: S(150, 0.38), perk: S(150, 0.5),
      tail: S(80, 0.55, 2.5), wagA: S(30, 1, 0.3), sit: S(100, 0.75), lie: S(100, 0.75), flat: S(100, 0.75), breathe: S(60, 1), tongue: S(60, 0.8),
      feet: STAND.map(f => [S(260, 0.72, f[0]), S(260, 0.72, f[1]), S(160, 0.8, 0)]), paw: S(120, 0.7) };
    this.P = { eye: 'open' }; this.wag = 0; this.roll = 0; this.hop = 0; this.face = 1; this.sy = 1; this.sx = 1; this.wig = 0;
  }
  act(name, o = {}) { if (name !== this.name || o.restart) { this.a = 0; this.ph = 0; } this.name = name; this.o = o; return this; }
  lookAt(gx, gy) { this.look = [clamp(gx, -1, 1), clamp(gy, -1, 1)]; return this; }
  bump(v = 40) { this.s.by.v += v; return this; }
  headTop() { return (this.cache || this.xf()).H(8, -19.5); }   // where a hand pets her (local units)

  // ------------------------------------------------------------------ pose targets for the current action
  pose() {
    const a = this.a, o = this.o;
    const P = { by: -17, pitch: 0, st: 0, head: 0, nf: 0, nd: 0, mouth: 0, ear: 0, perk: 0, tail: 2.45, wagA: 0.32, wagF: 10, eye: 'open', breathe: 0.7, pant: 0.35, tongue: 0,
      sit: 0, lie: 0, flat: 0, feet: STAND.map(f => f.slice()), set: false, hop: 0, rot: 0, sx: 1, sy: 1, wig: 0, paw: 0, zz: false };
    const sitPose = () => { P.sit = 1; P.by = -11.6; P.pitch = -0.6; P.head = 0.5; P.nf = 0.5; P.feet = [[8.8, 0, 0], [7.2, 0, 0], [1.8, 0, 0], [0, 0, 0]]; P.tail = 2.95; P.wagA = 0.18; };
    const liePose = () => { P.lie = 1; P.flat = 1; P.by = -9.4; P.pitch = -0.03; P.head = 0.08; P.feet = [[20, 0, 0], [17.8, 0, 0], [-2.2, 0, 0], [-4.2, 0, 0]]; P.tail = 2.95; P.wagA = 0.12; P.pant = 0.15; };
    const gait = (D, offs, sweepDef, lift, cad) => { // footfall engine: stance feet locked to the ground, moving backward under the body
      const vx = o.vx || 0, L = vx > 0 ? clamp(vx * D * TAU / cad, 6, 22) : sweepDef; this.omega = cad;
      const ph = frac(this.ph / TAU), x0 = [9.4, 7.6, -8.8, -10.8];
      P.feet = offs.map((off, i) => { const u = frac(ph + off);
        if (u < D) return [x0[i] + L * (0.5 - u / D), 0, 0];
        const s = (u - D) / (1 - D), e = easeIO(s); return [x0[i] - L / 2 + L * e, -lift[i] * Math.sin(Math.PI * s), Math.pow(Math.sin(Math.PI * s), 0.8)]; });
      P.set = true; return ph;
    };
    switch (this.name) {
      case 'stand': break;
      case 'alert': if (o.sit) sitPose(); P.perk = 1; P.head += -0.12 + this.look[1] * 0.2; P.tail = 3.4; P.wagA = 0.04; P.eye = 'wide'; P.pant = 0; P.nf += 0.8; break;
      case 'walk': { const vx = o.vx || 0, cad = vx > 0 ? clamp(vx / 18 * TAU / 1, 7, 13) : 10.5;
        const ph = gait(0.64, [0.5, 0, 0.75, 0.25], 12, [3.4, 3.4, 3.2, 3.2], cad);
        P.by = -17 - 0.5 * Math.cos(ph * TAU * 2); P.head = 0.05 + 0.05 * Math.sin(ph * TAU * 2); P.pitch = 0.02 * Math.sin(ph * TAU); P.wagA = 0.35; P.wagF = 9; P.pant = 0.3; break; }
      case 'run': { const vx = o.vx || 0, base = o.speed || 15, cad = vx > 0 ? Math.max(base, vx * 0.3 * TAU / 19) : base;
        const ph = gait(0.3, [0.6, 0.5, 0.08, 0], 15, [5.2, 5.2, 5.8, 5.8], cad);
        const ext = Math.cos(TAU * (ph - 0.45));
        P.st = 0.06 * ext; P.pitch = 0.1 * Math.sin(TAU * (ph - 0.47)); P.by = -13.9 - 1.1 * Math.cos(2 * TAU * (ph - 0.46)); P.head = -0.06 - 0.7 * P.pitch; P.nf = 0.6;
        P.ear = 0.5; P.tail = 3.1 + 0.1 * Math.sin(TAU * ph); P.wagA = 0.1; P.wagF = 14; P.pant = 0.8; P.tongue = 1; break; }
      case 'sit': sitPose(); break;
      case 'happy': sitPose(); P.wagA = 0.42; P.wagF = 14; P.pant = 1; P.tongue = 1; P.eye = Math.sin(a * 1.3) > 0.6 ? 'happy' : 'open'; P.head = 0.42 + Math.sin(a * 2.2) * 0.04; break;
      case 'bark': {
        if (o.sit) sitPose(); else { P.by = -16.2; P.feet[0][0] = 12; P.feet[1][0] = 10; P.pitch = 0.05; }
        let k = 0; for (const tb of [0.08, 0.44, 0.8]) k = Math.max(k, Math.exp(-Math.pow((a - tb) / 0.07, 2)));
        P.mouth = k * 1.15; P.head += -0.18 - k * 0.2; P.nf += k * 2; P.by += k * 0.6; P.perk = 0.8; P.ear = -0.15 * k; P.wagA = 0.45; P.wagF = 15; P.tail = 3.35; P.pant = 0.2; break;
      }
      case 'flip': { // crouch → spring up and back → a full backflip about her centre → land hind feet first → squash → settle
        const T = a, crouch = smoothstep(0, 0.2, T) * (1 - smoothstep(0.2, 0.3, T)), air = clamp((T - 0.27) / 0.58, 0, 1), land = smoothstep(0.85, 0.92, T) * (1 - smoothstep(0.95, 1.12, T));
        P.by = -17 + crouch * 5 + land * 3.5 - smoothstep(0.24, 0.3, T) * (1 - smoothstep(0.3, 0.4, T)) * 2;
        P.pitch = -crouch * 0.12; P.st = smoothstep(0.24, 0.3, T) * (1 - smoothstep(0.3, 0.45, T)) * 0.1;
        if (air > 0 && air < 1) { P.hop = Math.sin(air * Math.PI) * 40; P.rot = -TAU * easeIO(clamp((air - 0.04) / 0.92, 0, 1));
          const tk = Math.sin(clamp(air * 1.15, 0, 1) * Math.PI);   // tuck the legs in the air
          P.feet = [[lerp(12, 9, tk), lerp(0, -9, tk), tk], [lerp(10, 7, tk), lerp(0, -9.5, tk), tk], [lerp(-11.5, -6.5, tk), lerp(0, -8.5, tk), tk], [lerp(-13.5, -8.5, tk), lerp(0, -9, tk), tk]];
          P.head = 0.25 * tk; P.ear = 1.3; P.eye = 'happy'; P.mouth = 0.35; P.set = false; }
        else if (T >= 0.85) { P.eye = 'happy'; P.mouth = 0.3; P.pant = 0.9; P.tongue = 1; P.wagA = 0.5; P.wagF = 15; P.tail = 3.2; }
        P.tail = air > 0 && air < 1 ? 3.3 : P.tail; break; }
      case 'spin': { // chasing her tail: two quick turns, head leading, little hops
        const u = clamp(a / 1.2, 0, 1) * 4, k = Math.floor(Math.min(u, 3.999)), f = u - k, g = f < 0.5 ? 0.5 * Math.pow(2 * f, 3) : 1 - 0.5 * Math.pow(2 - 2 * f, 3), th = Math.PI * (k + (u >= 4 ? 1 : g)); P.sx = Math.cos(th); P.hop = Math.abs(Math.sin(th)) * 3.2;
        P.head = 0.15 + 0.2 * Math.abs(Math.sin(th)); P.mouth = 0.55; P.pant = 1; P.tongue = 1; P.eye = 'happy'; P.wagA = 0.7; P.wagF = 20; P.tail = 3.0; P.st = -0.05 * Math.abs(Math.sin(th));
        P.feet = [[10 + Math.sin(th * 2) * 2, -Math.max(0, Math.sin(th * 2)) * 3, 0.5 * Math.max(0, Math.sin(th * 2))], [8, 0, 0], [-9.6 - Math.sin(th * 2) * 2, -Math.max(0, -Math.sin(th * 2)) * 3, 0.4 * Math.max(0, -Math.sin(th * 2))], [-11.8, 0, 0]]; break; }
      case 'roll': { // flop down, roll onto her back (paws up, wriggle), roll back over
        liePose(); const T = a, up = smoothstep(0.28, 0.4, T) * (1 - smoothstep(1.06, 1.18, T));
        P.sy = Math.cos(up * Math.PI); P.hop = Math.sin(up * Math.PI) * 4;
        if (T > 0.2 && T < 1.14) { P.by = -11.8; P.nd = 16; P.nf = 2.5; P.head = 0.3; P.ear = 1.55; P.mouth = 0.55; P.tongue = 1; P.eye = 'happy'; P.wig = Math.sin(T * 16) * 0.06; P.flat = 0; P.sit = 0; P.lie = 1;
          const pd = Math.sin(T * 14); P.feet = [[13 + pd * 1.5, 4.5 + pd * 0.8, 1], [10.5 - pd * 1.5, 5 - pd * 0.8, 1], [-5 - pd * 1.2, 3.5, 1], [-7.5 + pd * 1.2, 4, 1]]; P.tail = 2.2; P.wagA = 0.5; P.wagF = 16; }
        else { P.eye = 'happy'; P.mouth = 0.3; }
        break; }
      case 'bow': { const b = Math.sin(a * 9) * 0.7; P.by = -12.6 + b; P.pitch = 0.42; P.st = 0.04; P.head = -0.42; P.nf = 1; P.flat = 1;
        P.feet = [[18.6, 0, 0], [16.4, 0, 0], [-9.6, 0, 0], [-11.6, 0, 0]]; P.tail = 3.95; P.wagA = 0.6; P.wagF = 17; P.mouth = 0.4; P.pant = 1; P.tongue = 1; P.perk = 0.5; P.eye = 'open'; break; }
      case 'paw': { sitPose(); const w = Math.sin(a * 6) * 1.4, lift = smoothstep(0.1, 0.45, a);
        P.feet[0] = [lerp(8.8, 21.5, lift), lerp(0, -16.5 + w, lift), 0]; P.paw = lift; P.head = 0.38; P.mouth = 0.35; P.pant = 1; P.tongue = 1; P.wagA = 0.38; P.wagF = 14; P.perk = 0.5; break; }
      case 'lie': liePose(); break;
      case 'sleep': liePose(); P.head = 0.42; P.nd = 4.2; P.nf = 1.6; P.eye = 'sleep'; P.ear = 0.55; P.breathe = 1.7; P.tail = 2.95; P.wagA = 0.02; P.pant = 0; P.zz = true; break;
      case 'yawn': { liePose(); const k = Math.sin(clamp(a / 1.5, 0, 1) * Math.PI); P.head = 0.08 - k * 0.5; P.mouth = k * 1.3; P.eye = k > 0.25 ? 'sleep' : 'open'; P.ear = 0.4 * k; P.tongue = k; P.pant = 0; break; }
      case 'wake': liePose(); P.head = -0.12; P.perk = 1; P.eye = 'wide'; P.wagA = 0.35; break;
      case 'lookUp': sitPose(); P.head = -0.12; P.nf = 0.4; P.eye = 'up'; P.wagA = 0.22; P.perk = 0.6; break;
      case 'pet': sitPose(); P.head = 0.05; P.nf = 0.6; P.eye = 'happy'; P.wagA = 0.5; P.wagF = 14; P.ear = 0.6; P.pant = 0.6; P.tongue = 0.6; break;
    }
    return P;
  }

  update(dt) {
    dt = Math.min(dt, 0.1); this.t += dt; this.a += dt;
    const P = this.pose(), s = this.s; this.P = P;
    if (this.name === 'run' || this.name === 'walk') this.ph += dt * this.omega;
    s.by.step(dt, P.by); s.pitch.step(dt, P.pitch); s.st.step(dt, P.st); s.head.step(dt, P.head + this.look[1] * 0.18); s.nf.step(dt, P.nf); s.nd.step(dt, P.nd);
    s.mouth.step(dt, Math.max(P.mouth, P.pant * (0.2 + 0.12 * Math.sin(this.t * 13)))); s.tongue.step(dt, Math.max(P.tongue, P.pant > 0.5 ? 0.8 : 0));
    s.ear.step(dt, P.ear); s.perk.step(dt, P.perk); s.tail.step(dt, P.tail); s.wagA.step(dt, P.wagA); s.breathe.step(dt, P.breathe); s.paw.step(dt, P.paw);
    s.sit.step(dt, P.sit); s.lie.step(dt, P.lie); s.flat.step(dt, P.flat);
    s.feet.forEach((f, i) => { const q = P.feet[i]; if (P.set) { f[0].set(q[0]); f[1].set(q[1]); f[2].set(q[2]); } else { f[0].step(dt, q[0]); f[1].step(dt, q[1]); f[2].step(dt, q[2]); } });
    this.wag += dt * P.wagF; this.roll = P.rot; this.hop = P.hop; this.sx = P.sx; this.sy = P.sy; this.wig = P.wig; this.face = P.sx < 0 ? -1 : 1;
    this.blinkT -= dt; if (this.blinkT < 0) { this.blink = 0.12; this.blinkT = 2 + Math.random() * 3.5; } this.blink = Math.max(0, this.blink - dt);
    this.cache = null;
  }

  // ------------------------------------------------------------------ skeleton (local units, before root transforms)
  xf() {
    const s = this.s, by = s.by.x, p = s.pitch.x, st = s.st.x, br = Math.sin(this.t * (this.P.zz ? 1.6 : 2.6)) * 0.32 * s.breathe.x;
    const B = (x, y) => { const r = rot([x * (1 + st), y], p); return [r[0], by + r[1]]; };   // body frame -> local
    const N = add(B(11.6, -7.4), [s.nf.x, s.nd.x]), ha = s.head.x + p * 0.25;
    const H = (x, y) => { const r = rot([x * HS, y * HS], ha); return [N[0] + r[0], N[1] + r[1]]; };   // head frame -> local
    return (this.cache = { B, H, N, ha, p, by, br });
  }
  legs(X) {
    const s = this.s, { B } = X, sit = s.sit.x, lie = s.lie.x, flat = s.flat.x, pawUp = s.paw.x;
    const out = [];
    for (let i = 0; i < 4; i++) {
      const front = i < 2, near = i % 2 === 0, f = s.feet[i], foot = [f[0].x, f[1].x], flex = clamp(f[2].x, 0, 1);
      if (front) {
        const sh = near ? B(8, 0.8) : B(6.2, 0.4);
        let pv = [lerp(PAST.stand[0], PAST.tuck[0], flex), lerp(PAST.stand[1], PAST.tuck[1], flex)];
        pv = [lerp(pv[0], PAST.flat[0], flat * (1 - flex)), lerp(pv[1], PAST.flat[1], flat * (1 - flex))];
        if (near && pawUp > 0) pv = [lerp(pv[0], PAST.up[0], pawUp), lerp(pv[1], PAST.up[1], pawUp)];
        const wr = add(foot, pv), [el, w2] = ik(sh, wr, FL1, FL2, true), paw = add(w2, [-pv[0], -pv[1]]);
        const ang = Math.atan2(paw[1] - w2[1], paw[0] - w2[0]) - Math.atan2(-PAST.stand[1], -PAST.stand[0]);
        const pu = near ? pawUp : 0; out.push({ front, near, top: sh, mid: el, low: w2, paw, ang: lerp(flex > 0.01 || flat > 0.01 ? ang : 0, -1.45, pu), flex: Math.max(flex, pu) });
      } else {
        const hp = near ? B(-9.4, 0.4) : B(-11.1, 0);
        const fold = Math.max(sit, lie);
        let mv = [lerp(META.stand[0], META.tuck[0], flex), lerp(META.stand[1], META.tuck[1], flex)];
        mv = [lerp(mv[0], META.fold[0], fold * (1 - flex)), lerp(mv[1], META.fold[1], fold * (1 - flex))];
        const hk = add(foot, mv), [kn, h2] = ik(hp, hk, HL1, HL2, false), paw = add(h2, [-mv[0], -mv[1]]);
        const ang = Math.atan2(paw[1] - h2[1], paw[0] - h2[0]) - Math.atan2(-META.stand[1], -META.stand[0]);
        out.push({ front, near, top: hp, mid: kn, low: h2, paw, ang: fold > 0.01 || flex > 0.01 ? ang * 0.7 : 0, flex });
      }
    }
    return out;
  }

  draw(ctx) {
    const C = this.C, s = this.s, P = this.P, X = this.xf(), { B, H } = X, L = this.legs(X);
    ctx.save(); ctx.lineCap = ctx.lineJoin = 'round';
    ctx.translate(0, -this.hop);
    const com = B(0, 1);
    if (this.roll) { ctx.translate(com[0], com[1]); ctx.rotate(this.roll); ctx.translate(-com[0], -com[1]); }
    if (this.sx !== 1) { const k = Math.sign(this.sx || 1) * Math.max(0.42, Math.abs(this.sx)); ctx.scale(k, 1); }
    if (this.sy !== 1) { const k = Math.sign(this.sy || 1) * Math.max(0.3, Math.abs(this.sy)), yc = X.by - 0.4; ctx.translate(0, yc); ctx.scale(1, k); ctx.translate(0, -yc); }
    if (this.wig) { ctx.translate(com[0], com[1]); ctx.rotate(this.wig); ctx.translate(-com[0], -com[1]); }
    // far legs, tail, body, near hind leg, head, near front leg, collar
    this.leg(ctx, L[1]); this.leg(ctx, L[3]);
    this.tail(ctx, B, X);
    this.body(ctx, X);
    this.leg(ctx, L[2]);
    this.head(ctx, X);
    this.leg(ctx, L[0]);
    this.collar(ctx, X);
    if (P.zz) this.zz(ctx, H(10, -22));
    ctx.restore();
  }

  body(ctx, X) {
    const C = this.C, { B, H, br } = X;
    const pts = [[10, -10.6], [3, -10.3], [-5, -9.6], [-11.6, -8.4], [-15.8, -4.6], [-16.8, 0.4], [-15.2, 4.6], [-10.6, 7.4], [-4, 8.8 + br * 0.4], [3, 9.6 + br * 0.4], [9, 9.8], [13.6, 7.6], [15.9, 2.6], [15.7, -3.4], [13.8, -8.2]];
    const body = smooth(pts.map(q => B(q[0] * 0.92, q[1]))); this._body = body;
    const top = B(0, -11), bot = B(0, 10), g = ctx.createLinearGradient(top[0], top[1], bot[0], bot[1]);
    g.addColorStop(0, C.furL); g.addColorStop(0.22, C.fur); g.addColorStop(1, C.furD);
    // the neck joins the head to the body
    const neck = smooth([B(7.6, -10.4), H(-1.2, -9.2), H(-0.8, -4.4), H(3.2, -0.6), B(15.6, -1.4), B(13.6, -7)]);
    ctx.fillStyle = C.fur; ctx.fill(neck); ctx.strokeStyle = C.line; ctx.lineWidth = 0.85; ctx.stroke(neck);
    ctx.fillStyle = g; ctx.fill(body); ctx.stroke(body);
    ctx.fillStyle = C.fur; ctx.fill(neck);   // hide the seam between neck and body
    ctx.save(); ctx.clip(body);
    // moonlit sheen along the back and a soft fluffy chest
    ctx.strokeStyle = C.sheen; ctx.lineWidth = 2.4; ctx.beginPath(); { const a = B(-14, -8.2), b = B(-2, -10.8), c = B(10, -9.8); ctx.moveTo(a[0], a[1]); ctx.quadraticCurveTo(b[0], b[1], c[0], c[1]); } ctx.stroke();
    ctx.restore();
    // chest ruff and belly fluff (soft tufts on the outline)
    ctx.fillStyle = C.fur; ctx.strokeStyle = C.line; ctx.lineWidth = 0.7;
    for (const [x, y, r] of [[14.4, 3.2, 2.0], [12.2, 7.4, 1.8]]) {
      const c = B(x, y), q = new Path2D(); q.moveTo(c[0] - r, c[1] - r * 0.6); q.quadraticCurveTo(c[0] + r * 0.4, c[1] + r * 1.6, c[0] + r, c[1] - r * 0.2); ctx.fill(q); ctx.stroke(q); }
    ctx.strokeStyle = 'rgba(200,192,245,.22)'; ctx.lineWidth = 0.6; ctx.beginPath();
    for (const [x, y] of [[11, -1], [11.6, 2.4]]) { const a = B(x, y), b = B(x + 1.2, y + 1.6); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); } ctx.stroke();
  }

  // a tapered limb that grows out of the body: top joint, middle joint, low joint, then the paw
  leg(ctx, l) {
    const C = this.C, near = l.near, front = l.front;
    const ch = [l.top, l.mid, l.low, l.paw], wd = front ? [8.4, 5.4, 3.7, 3.4] : [11.2, 6.4, 3.8, 3.4];
    // an extra point on long segments keeps the outline smooth; the thigh swells, the forearm stays straight
    const pts = [ch[0], [lerp(ch[0][0], ch[1][0], 0.55), lerp(ch[0][1], ch[1][1], 0.55)], ch[1], [lerp(ch[1][0], ch[2][0], 0.5), lerp(ch[1][1], ch[2][1], 0.5)], ch[2], ch[3]];
    const w = front ? [wd[0], 6.6, wd[1], 4.4, wd[2], wd[3]] : [wd[0], 9.2, wd[1], 4.6, wd[2], wd[3]];
    const Lp = [], Rp = [];
    for (let i = 0; i < pts.length; i++) { const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)], dx = b[0] - a[0], dy = b[1] - a[1], ln = Math.hypot(dx, dy) || 1, h = w[i] / 2;
      Lp.push([pts[i][0] - dy / ln * h, pts[i][1] + dx / ln * h]); Rp.push([pts[i][0] + dy / ln * h, pts[i][1] - dx / ln * h]); }
    const path = smooth(Lp.concat(Rp.reverse()));
    ctx.fillStyle = near ? C.fur : C.furD; ctx.fill(path); ctx.strokeStyle = near ? C.line : C.lineD; ctx.lineWidth = near ? 0.85 : 0.7;
    if (near && this._body) { const inv = new Path2D(); inv.rect(-400, -400, 800, 800); inv.addPath(this._body); ctx.save(); ctx.clip(inv, 'evenodd'); ctx.stroke(path); ctx.restore();
      ctx.save(); ctx.clip(this._body); ctx.strokeStyle = 'rgba(150,140,200,.28)'; ctx.lineWidth = 0.7; ctx.stroke(path); ctx.restore(); }
    else ctx.stroke(path);
    if (near) { // a soft moonlight rim down the front of the leg
      const r = new Path2D(); const side = front ? Rp : Lp; r.moveTo(side[1][0], side[1][1]); for (let i = 2; i < side.length - 1; i++) r.lineTo(side[i][0], side[i][1]);
      ctx.save(); ctx.clip(path); ctx.strokeStyle = 'rgba(200,192,250,.25)'; ctx.lineWidth = 1.6; ctx.stroke(r); ctx.restore();
      if (!front) { // fluffy "trousers" on the back of the thigh
        ctx.fillStyle = C.fur; ctx.strokeStyle = C.line; ctx.lineWidth = 0.7;
        for (const u of [0.25, 0.55, 0.85]) { const i0 = u < 0.5 ? 0 : 1, k = u < 0.5 ? u * 2 : (u - 0.5) * 2, a = Lp[i0], b = Lp[i0 + 1], c = [lerp(a[0], b[0], k), lerp(a[1], b[1], k)], d = [pts[1][0] - pts[0][0], pts[1][1] - pts[0][1]], dl = Math.hypot(d[0], d[1]) || 1;
          const nx = -d[1] / dl, ny = d[0] / dl, q = new Path2D(); q.moveTo(c[0] - d[0] / dl * 1.4, c[1] - d[1] / dl * 1.4); q.quadraticCurveTo(c[0] + nx * 2.2, c[1] + ny * 2.2, c[0] + d[0] / dl * 1.6, c[1] + d[1] / dl * 1.6); ctx.fill(q); ctx.stroke(q); }
      }
    }
    this.pawDraw(ctx, l.paw, l.ang, l.flex, near);
  }
  pawDraw(ctx, c, ang, flex, near) {
    const C = this.C;
    ctx.save(); ctx.translate(c[0], c[1]); ctx.rotate(ang);
    // a big round puppy paw: toes in front, tiny pale toenails, the pads show when the paw lifts
    const pw = new Path2D(); pw.moveTo(-2.4, 0); pw.bezierCurveTo(-3.4, -1.4, -2.6, -3.6, -0.4, -3.9); pw.bezierCurveTo(1.6, -4.4, 4.0, -3.6, 4.8, -1.8); pw.bezierCurveTo(5.4, -0.6, 4.8, 0.2, 3.6, 0.2); pw.closePath();
    ctx.fillStyle = near ? C.fur : C.furD; ctx.fill(pw); ctx.strokeStyle = near ? C.line : C.lineD; ctx.lineWidth = near ? 0.8 : 0.65; ctx.stroke(pw);
    ctx.strokeStyle = 'rgba(8,6,12,.75)'; ctx.lineWidth = 0.5; ctx.beginPath(); ctx.moveTo(1.7, -3.4); ctx.quadraticCurveTo(2.2, -2.0, 2.0, -0.4); ctx.moveTo(3.4, -2.9); ctx.quadraticCurveTo(3.9, -1.8, 3.6, -0.3); ctx.stroke();
    if (near) { ctx.strokeStyle = C.nail; ctx.lineWidth = 0.55; ctx.beginPath(); for (const [x, y] of [[2.6, -0.2], [4.2, -0.4], [5.1, -1.0]]) { ctx.moveTo(x, y); ctx.lineTo(x + 0.75, y + 0.15); } ctx.stroke(); }
    if (flex > 0.35) { ctx.globalAlpha = clamp((flex - 0.35) / 0.4, 0, 1); ctx.fillStyle = C.pad; ctx.beginPath(); ctx.ellipse(0.9, 0.3, 2.3, 1.1, 0, 0, TAU); ctx.fill(); for (const x of [2.9, 4.2]) { ctx.beginPath(); ctx.ellipse(x, 0.1, 0.75, 0.65, 0, 0, TAU); ctx.fill(); } ctx.globalAlpha = 1; }
    ctx.restore();
  }

  tail(ctx, B, X) {
    const C = this.C, s = this.s, base = B(-14.2, -5.0), w = Math.sin(this.wag) * s.wagA.x, ang = s.tail.x + w;
    // a short fluffy puppy tail that curves a little at the end
    const N = 7, Lt = 15, pts = [base];
    for (let i = 1; i <= N; i++) { const u = i / N, a = ang + u * (0.35 + w * 0.5); pts.push([pts[i - 1][0] + Math.cos(a) * Lt / N, pts[i - 1][1] + Math.sin(a) * Lt / N]); }
    const wd = u => (u < 0.4 ? lerp(5.4, 7.6, u / 0.4) : lerp(7.6, 1.6, (u - 0.4) / 0.6)), Lp = [], Rp = [];
    for (let i = 0; i <= N; i++) { const a0 = pts[Math.max(0, i - 1)], a1 = pts[Math.min(N, i + 1)], dx = a1[0] - a0[0], dy = a1[1] - a0[1], l = Math.hypot(dx, dy) || 1, ww = wd(i / N) / 2;
      Lp.push([pts[i][0] - dy / l * ww, pts[i][1] + dx / l * ww]); Rp.push([pts[i][0] + dy / l * ww, pts[i][1] - dx / l * ww]); }
    const path = smooth(Lp.concat(Rp.reverse()));
    const g = ctx.createLinearGradient(base[0], base[1], pts[N][0], pts[N][1]); g.addColorStop(0, C.furD); g.addColorStop(0.6, C.fur); g.addColorStop(1, C.furL);
    ctx.fillStyle = g; ctx.fill(path); ctx.strokeStyle = C.line; ctx.lineWidth = 0.75; ctx.stroke(path);
    ctx.strokeStyle = C.sheen; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(pts[1][0], pts[1][1] - 1); for (let i = 2; i < N; i++) ctx.lineTo(pts[i][0], pts[i][1] - 1); ctx.stroke();
  }

  head(ctx, X) {
    const C = this.C, s = this.s, P = this.P, { H } = X, mo = clamp(s.mouth.x, 0, 1.4), ear = s.ear.x - s.perk.x * 0.18, k = HS;
    // big upright puppy ears with soft rounded tips; they fold back when she runs, sleeps or rolls
    const earPath = (b0, b1, tip, back, sag) => { const piv = [(b0[0] + b1[0]) / 2, (b0[1] + b1[1]) / 2], r = q => { const d = rot([q[0] - piv[0], q[1] - piv[1]], -back * 0.95); return H(piv[0] + d[0], piv[1] + d[1]); };
      const t = [tip[0] + sag, tip[1] + Math.abs(sag) * 0.4];
      return [smooth([r(b0), r([lerp(b0[0], t[0], 0.5) - 1.0, lerp(b0[1], t[1], 0.5)]), r([t[0] - 1.7, t[1] + 2.0]), r([t[0] - 0.3, t[1] - 0.2]), r([t[0] + 1.6, t[1] + 1.8]), r([lerp(b1[0], t[0], 0.45) + 1.2, lerp(b1[1], t[1], 0.45)]), r(b1)]), r]; };
    const sag = Math.sin(this.t * 2.1) * 0.25;
    { const [p] = earPath([0.8, -14.8], [8.2, -18.8], [3.4, -30.2], ear, sag); ctx.fillStyle = C.furD; ctx.fill(p); ctx.strokeStyle = C.lineD; ctx.lineWidth = 0.7; ctx.stroke(p); }
    // round puppy skull with fluffy cheeks
    const skull = smooth([[0, -7.4], [0.4, -12.6], [3.2, -17.4], [8, -19.8], [12.6, -18.8], [15.6, -15.6], [16.6, -12], [15.8, -8.4], [13, -5.4], [8.6, -3.4], [5, -3.0], [2.4, -3.6], [0.8, -5.2]].map(q => H(q[0], q[1])));
    const hc = H(8, -12.5), g = ctx.createRadialGradient(hc[0] - 2.5, hc[1] - 4.5, 1, hc[0], hc[1], 12.5 * k); g.addColorStop(0, C.furL); g.addColorStop(0.5, C.fur); g.addColorStop(1, C.furD);
    ctx.fillStyle = g; ctx.fill(skull); ctx.strokeStyle = C.line; ctx.lineWidth = 0.9; ctx.stroke(skull);
    ctx.fillStyle = C.fur; ctx.lineWidth = 0.7; for (const [x, y] of [[3.2, -3.4], [6.4, -2.8]]) { const c = H(x, y), q = new Path2D(); q.moveTo(c[0] - 1.8, c[1] - 0.8); q.quadraticCurveTo(c[0], c[1] + 2.2, c[0] + 1.8, c[1] - 0.6); ctx.fill(q); ctx.stroke(q); }
    // short muzzle; the lower jaw opens for barks, pants and yawns
    const jaw = mo * 0.5, J = (x, y) => { const piv = [13.6, -6.6], d = rot([x - piv[0], y - piv[1]], jaw); return H(piv[0] + d[0], piv[1] + d[1]); };
    if (mo > 0.04) {
      ctx.fillStyle = C.mouth; ctx.fill(smooth([H(14, -6.6), H(21.2, -7.4), J(20.4, -5.0), J(14.6, -4.6)]));
      if (s.tongue.x > 0.05) { const tq = J(18.2, -4.6 + s.tongue.x * 0.9); ctx.fillStyle = C.tongue; ctx.beginPath(); ctx.ellipse(tq[0], tq[1], 2.5 * k, (1.2 + s.tongue.x * 0.9) * k, X.ha + jaw, 0, TAU); ctx.fill();
        ctx.strokeStyle = 'rgba(160,40,80,.5)'; ctx.lineWidth = 0.35; ctx.beginPath(); const t0 = J(18.2, -4.8), t1 = J(18.2, -3.4 + s.tongue.x); ctx.moveTo(t0[0], t0[1]); ctx.lineTo(t1[0], t1[1]); ctx.stroke(); }
      const low = smooth([J(14, -5.6), J(20, -5.8), J(20.6, -4.2), J(17, -3.2), J(14, -3.6)]); ctx.fillStyle = C.pale; ctx.fill(low); ctx.strokeStyle = C.line; ctx.lineWidth = 0.65; ctx.stroke(low);
    }
    const muz = smooth([[13.6, -13.2], [17.4, -12.6], [20.4, -11.4], [21.9, -9.6], [21.6, -7.6], [19.4, -6.4], [16, -6.0], [13.4, -7.4]].map(q => H(q[0], q[1])));
    ctx.fillStyle = C.pale; ctx.fill(muz); ctx.strokeStyle = C.line; ctx.lineWidth = 0.8; ctx.stroke(muz);
    // nose with a shine, a little smiling mouth line
    const nz = H(21.0, -10.4); ctx.fillStyle = C.nose; ctx.beginPath(); ctx.ellipse(nz[0], nz[1], 2.2 * k, 1.7 * k, X.ha, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.6)'; ctx.beginPath(); ctx.ellipse(nz[0] - 0.5, nz[1] - 0.7, 0.85, 0.45, X.ha, 0, TAU); ctx.fill();
    if (mo <= 0.04) { const m0 = H(21.0, -8.2), m1 = H(19.4, -6.4), m2 = H(16.8, -6.9); ctx.strokeStyle = C.nose; ctx.lineWidth = 0.7; ctx.beginPath(); ctx.moveTo(m0[0], m0[1]); ctx.quadraticCurveTo(m1[0], m1[1], m2[0], m2[1]); ctx.stroke(); }
    // big shiny puppy eye and a soft brow
    const e = H(11.6, -12.6), kind = this.blink > 0 && (P.eye === 'open' || P.eye === 'up' || P.eye === 'wide') ? 'blink' : P.eye;
    { const b = H(11.2, -16.4); ctx.strokeStyle = C.sheen; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(b[0], b[1] + 1.8, 2.4 * k, Math.PI * 1.15 + X.ha, Math.PI * 1.8 + X.ha); ctx.stroke(); }
    ctx.strokeStyle = C.eye; ctx.lineCap = 'round';
    if (kind === 'happy') { ctx.lineWidth = 1.3; ctx.beginPath(); ctx.arc(e[0], e[1] + 1.6, 2.6 * k * 0.85, Math.PI * 1.15 + X.ha, Math.PI * 1.85 + X.ha); ctx.stroke(); }
    else if (kind === 'sleep' || kind === 'blink') { ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(e[0], e[1] - 1.4, 2.6 * k * 0.85, Math.PI * 0.2 + X.ha, Math.PI * 0.8 + X.ha); ctx.stroke(); }
    else {
      const big = (kind === 'wide' ? 1.12 : 1) * k, gx = this.look[0] * 0.5, gy = kind === 'up' ? -1.0 : this.look[1] * 0.5;
      ctx.fillStyle = 'rgba(210,200,245,.35)'; ctx.beginPath(); ctx.ellipse(e[0], e[1], 2.95 * big, 3.35 * big, X.ha, 0, TAU); ctx.fill();   // a light rim so the eye reads on black fur
      const eg = ctx.createRadialGradient(e[0] + gx, e[1] + gy + 1.3, 0.2, e[0] + gx, e[1] + gy, 3.2 * big); eg.addColorStop(0, '#A2683E'); eg.addColorStop(0.5, C.iris); eg.addColorStop(1, C.eye);
      ctx.fillStyle = eg; ctx.beginPath(); ctx.ellipse(e[0] + gx * 0.4, e[1] + gy * 0.3, 2.5 * big, 2.9 * big, X.ha, 0, TAU); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(e[0] + gx + 0.9, e[1] + gy - 1.2, 1.05 * big, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.arc(e[0] + gx - 0.9, e[1] + gy + 1.1, 0.45 * big, 0, TAU); ctx.fill();
    }
    // near ear with a dark inner ear and soft fur tufts
    { const [p, r] = earPath([5.4, -18.9], [13.6, -17.6], [9.6, -31.2], ear, sag * 1.2);
      const g2 = ctx.createLinearGradient(...H(9, -18), ...H(9, -32)); g2.addColorStop(0, C.fur); g2.addColorStop(1, C.furD);
      ctx.fillStyle = g2; ctx.fill(p); ctx.strokeStyle = C.line; ctx.lineWidth = 0.85; ctx.stroke(p);
      ctx.fillStyle = C.inner; ctx.fill(smooth([r([7.2, -19.2]), r([7.9, -24.6]), r([9.5, -28.4]), r([11.0, -24.4]), r([12.2, -19.0])]));
      ctx.strokeStyle = 'rgba(150,135,165,.55)'; ctx.lineWidth = 0.45; ctx.beginPath(); for (let i = 0; i < 4; i++) { const a = r([8.4 + i * 0.8, -19]), b = r([8.8 + i * 0.5, -22.6 - i * 0.5]); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); } ctx.stroke(); }
  }

  collar(ctx, X) {
    const C = this.C, { B, H } = X, b0 = B(7.6, -10.4), b1 = H(-1, -8), t0 = B(15.6, -1.4), t1 = H(3.2, -0.6);
    const a = [lerp(b0[0], b1[0], 0.45), lerp(b0[1], b1[1], 0.45)], c = [lerp(t0[0], t1[0], 0.55), lerp(t0[1], t1[1], 0.55)], m = [(a[0] + c[0]) / 2 + 1.4, (a[1] + c[1]) / 2 + 0.8];
    ctx.strokeStyle = C.collar; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.quadraticCurveTo(m[0], m[1], c[0], c[1]); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,200,225,.6)'; ctx.lineWidth = 0.6; ctx.beginPath(); ctx.moveTo(a[0] + 0.3, a[1] - 0.6); ctx.quadraticCurveTo(m[0] + 0.2, m[1] - 0.8, c[0] + 0.3, c[1] - 0.8); ctx.stroke();
    ctx.fillStyle = C.tag; ctx.beginPath(); ctx.arc(c[0] + 0.3, c[1] + 1.8, 1.45, 0, TAU); ctx.fill(); ctx.fillStyle = 'rgba(255,255,255,.6)'; ctx.beginPath(); ctx.arc(c[0], c[1] + 1.4, 0.45, 0, TAU); ctx.fill();
  }

  zz(ctx, p) {
    ctx.fillStyle = 'rgba(220,230,255,.9)'; ctx.font = '600 8px Georgia, serif';
    for (let i = 0; i < 3; i++) { const u = ((this.t * 0.4) + i / 3) % 1; ctx.globalAlpha = Math.sin(u * Math.PI); ctx.save(); ctx.translate(p[0] + 4 + u * 14, p[1] - 4 - u * 18); ctx.scale(this.face < 0 ? -1 : 1, 1); ctx.scale(0.6 + u * 0.7, 0.6 + u * 0.7); ctx.fillText('z', 0, 0); ctx.restore(); }
    ctx.globalAlpha = 1;
  }
}

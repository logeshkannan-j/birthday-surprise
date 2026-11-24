// Background people on the promenade at night: couples holding hands, joggers, a mother with her little girl, a man
// walking his dog, an old man with a stick, friends, a balloon seller with glowing balloons, people at the chai cart.
// Simple 2D figures in the film's style (drawn per frame in character units, ground at y = 0, facing +x), rendered by
// film.js exactly like the main characters (ActorView -> lit quad with the moon rim and lamp light), so they read as
// soft silhouettes with a cool rim. Everything is a pure function of the story time T, so seeking works.
//
// Where they walk (floor plan X/Z from space.js): the far end of the promenade (X 1.5..9.6, Z 44..96 – strolling into
// the haze and crossing in front of the chai cart) and the far right side (X 22, Z 10..29, turning into a side street).
// Both stay clear of Helen (X -5.5, Z 10.5), Snowki's walk, the man's tree (X 13.8, Z 22) and the launcher (X -3.5, Z 34),
// and they never pass behind those spots on screen in the planned shots. Walks that would cross a keep-out zone are skipped.
//
//   import { Crowd } from './crowd.js';
//   const crowd = new Crowd();                  // or new Crowd({ avoid: [{ X, Z, r, t0, t1 }], density: 1 })
//   for (const p of crowd.at(S.T)) { ... }      // p = { slot, who, x, y, gy, flip, alpha, rig: { bounds, draw(ctx) }, lights }
import { HZ, unitScale, fromXZ, toXZ, CU, PLACE } from './space.js';
import { foot as gaitFoot, hipRise, armSwing } from './gait.js';

const TAU = Math.PI * 2, clamp = (v, a, b) => Math.max(a, Math.min(b, v)), lerp = (a, b, t) => a + (b - a) * t;
const hx = c => { if (c[0] !== '#') return c.match(/[\d.]+/g).slice(0, 3).map(Number); const n = parseInt(c.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255]; };
const shade = (c, k, to = [40, 30, 60]) => { const a = hx(c); return `rgb(${Math.round(a[0] + (to[0] - a[0]) * k)},${Math.round(a[1] + (to[1] - a[1]) * k)},${Math.round(a[2] + (to[2] - a[2]) * k)})`; };
const rgba = (c, a) => { const [r, g, b] = hx(c); return `rgba(${r},${g},${b},${a})`; };
const CHAR = 1 / CU;                                       // character units per floor unit (≈ 29.2)

// ---------------------------------------------------------------- looks (colours a little muted: they are extras at night)
const SKIN = ['#8A5A3C', '#6E4430', '#9C6A48', '#5E3A2A', '#7C4E34'];
const LOOK = {
  manShirt: { H: 96, skin: 1, hair: 'short', hc: '#17110F', top: 'shirt', tc: '#D9D2C2', bot: 'trousers', bc: '#3A3A48', shoe: '#2A2226' },
  womanSaree: { H: 90, skin: 0, hair: 'braid', hc: '#120C0C', top: 'blouse', tc: '#B8325C', bot: 'saree', bc: '#C2416A', pallu: '#E3A13B', shoe: '#6A4A3A' },
  jogger: { H: 94, skin: 2, hair: 'pony', hc: '#1A1210', top: 'tee', tc: '#4F7FB8', bot: 'shorts', bc: '#25262E', shoe: '#E8E6EA', run: true },
  jogger2: { H: 97, skin: 3, hair: 'short', hc: '#120E0E', top: 'tee', tc: '#C9C2B8', bot: 'track', bc: '#2E3550', shoe: '#D8D4DC', run: true },
  mum: { H: 89, skin: 4, hair: 'bun', hc: '#140E0D', top: 'kurti', tc: '#2F8F8A', bot: 'leggings', bc: '#E9E1D4', shoe: '#5A4036' },
  girl: { H: 56, skin: 4, hair: 'pigtails', hc: '#140E0D', top: 'frock', tc: '#F2B33D', bot: 'none', bc: '#F2B33D', shoe: '#C9406A' },
  dogMan: { H: 95, skin: 0, hair: 'short', hc: '#1C1512', top: 'shirt', tc: '#5E7FA0', bot: 'trousers', bc: '#5B4C44', shoe: '#2A2226' },
  oldMan: { H: 91, skin: 1, hair: 'grey', hc: '#C8C4C0', top: 'shirt', tc: '#E6E0D0', bot: 'veshti', bc: '#EFEBE0', shoe: '#4A3A30', stoop: 0.16, cane: true },
  friendA: { H: 88, skin: 2, hair: 'long', hc: '#140D0C', top: 'kurti', tc: '#8C5BB8', bot: 'leggings', bc: '#2A2836', shoe: '#E0D8D0', female: true, lip: '#9B4C62', facePhase: 0.3 },
  friendB: { H: 91, skin: 3, hair: 'long', hc: '#110B0A', top: 'kurti', tc: '#D86F45', bot: 'leggings', bc: '#EAE2D6', shoe: '#5A4036', female: true, lip: '#8F4054', facePhase: 1.1 },
  friendC: { H: 87, skin: 0, hair: 'bun', hc: '#120C0B', top: 'blouse', tc: '#2D6E9E', bot: 'saree', bc: '#3D86B8', pallu: '#F2D27A', shoe: '#6A4A3A', female: true, lip: '#A64D5D', facePhase: 2.0 },
  friendD: { H: 90, skin: 4, hair: 'braid', hc: '#140D0C', top: 'kurti', tc: '#31877C', bot: 'leggings', bc: '#263A43', shoe: '#E0D8D0', female: true, lip: '#94465E', facePhase: 2.8 },
  friendE: { H: 89, skin: 1, hair: 'long', hc: '#110B0B', top: 'blouse', tc: '#C77B2D', bot: 'saree', bc: '#7D4268', pallu: '#F2D27A', shoe: '#5A4036', female: true, lip: '#A04457', facePhase: 3.6 },
  friendF: { H: 92, skin: 3, hair: 'bun', hc: '#120C0B', top: 'kurti', tc: '#4566A0', bot: 'leggings', bc: '#302D49', shoe: '#E8E0DA', female: true, lip: '#8E435A', facePhase: 4.4 },
  seller: { H: 93, skin: 3, hair: 'short', hc: '#151010', top: 'shirt', tc: '#B88A4A', bot: 'veshti', bc: '#E8E2D2', shoe: '#3A2E28', balloons: true },
  phoneGuy: { H: 97, skin: 2, hair: 'short', hc: '#120D0C', top: 'tee', tc: '#3C3C46', bot: 'trousers', bc: '#5C6478', shoe: '#E0DCE4', phone: true },
  guy2: { H: 98, skin: 3, hair: 'curly', hc: '#120D0C', top: 'shirt', tc: '#7A2E3E', bot: 'trousers', bc: '#2C2C36', shoe: '#2A2226' },
  girl2: { H: 89, skin: 4, hair: 'long', hc: '#120B0B', top: 'kurti', tc: '#E7C7D6', bot: 'leggings', bc: '#3A3448', shoe: '#E8E0DA' },
  vendor: { H: 94, skin: 1, hair: 'short', hc: '#151010', top: 'vest', tc: '#E8E4DA', bot: 'veshti', bc: '#D8D0BE', shoe: '#3A2E28' },
  cust1: { H: 95, skin: 0, hair: 'curly', hc: '#120D0C', top: 'shirt', tc: '#46607E', bot: 'trousers', bc: '#3A3644', shoe: '#2A2226', cup: true },
  cust2: { H: 88, skin: 2, hair: 'braid', hc: '#110B0B', top: 'kurti', tc: '#C24F6E', bot: 'leggings', bc: '#ECE4D8', shoe: '#5A4036', cup: true }
};
const DOG = { c: '#CDA57C', c2: '#F1E4D2' };              // a fawn-and-cream Indie dog (never black: Jessi is the black one)

// ---------------------------------------------------------------- drawing helpers (character units)
function line(c, pts, w, col) { c.strokeStyle = col; c.lineWidth = w; c.beginPath(); pts.forEach((p, i) => (i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1]))); c.stroke(); }
function blob(c, x, y, rx, ry, col, a = 0) { c.fillStyle = col; c.beginPath(); c.ellipse(x, y, Math.max(rx, 0.01), Math.max(ry, 0.01), a, 0, TAU); c.fill(); }
function polyF(c, pts, col) { c.fillStyle = col; c.beginPath(); pts.forEach((p, i) => (i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1]))); c.closePath(); c.fill(); }
function ik(hip, foot, l1, l2, dir = 1) {  // two-bone limb; dir 1: the joint bends towards +x (knees), -1: towards -x (elbows)
  let dx = foot[0] - hip[0], dy = foot[1] - hip[1], d = Math.hypot(dx, dy); const m = l1 + l2 - 0.01;
  if (d > m) { dx *= m / d; dy *= m / d; d = m; }
  const a = Math.atan2(dy, dx), b = Math.acos(clamp((l1 * l1 + d * d - l2 * l2) / (2 * l1 * Math.max(d, 0.01)), -1, 1)), g = a - dir * b;
  return [[hip[0] + Math.cos(g) * l1, hip[1] + Math.sin(g) * l1], [hip[0] + dx, hip[1] + dy]];
}
const rot = (p, o, a) => { const c = Math.cos(a), s = Math.sin(a), x = p[0] - o[0], y = p[1] - o[1]; return [o[0] + x * c - y * s, o[1] + x * s + y * c]; };

// one person in profile (facing +x). g = { ph, stride (0..1.6), mode: 'walk'|'run'|'idle', hold: [x,y] for the back hand, holdF: front hand, dark }
function personSide(c, L, g) {
  const k = L.H / 95, run = g.mode === 'run', idle = g.mode === 'idle', ph = g.ph, dk = g.dark || 0;
  const skin = SKIN[L.skin], hipH = 47.5 * k, l1 = 24.3 * k, l2 = 23.6 * k;
  const time = g.t ?? ph;
  const bob = idle ? 0.22 * k * Math.sin(time * 1.5 + (L.facePhase || 0)) : run ? -2.2 * k * Math.abs(Math.sin(ph)) : 0.9 * k * (0.5 + 0.5 * Math.cos(2 * ph)) - 0.45 * k;
  const hip = [0, -hipH + bob], lean = (run ? 0.13 : 0.03) + (L.stoop || 0);
  const S = (run ? 56 : 46) * k * (g.stride ?? 1), lift = (run ? 8.5 : 4.2) * k, duty = run ? 0.36 : 0.62;
  const foot = p => { if (idle) return [p ? 3.2 * k : -2.6 * k, 0]; const u = ((p / TAU) % 1 + 1) % 1;
    if (u < duty) { const v = u / duty; return [S * (0.5 - v), 0]; } const v = (u - duty) / (1 - duty); return [S * (-0.5 + (1 - Math.cos(Math.PI * v)) / 2), -lift * Math.sin(Math.PI * v)]; };
  const legs = [ph + Math.PI, ph].map((p, i) => { const f = idle ? foot(i) : foot(p), h = [hip[0] + (i ? 1.2 : -1.2) * k, hip[1]]; const [kn, an] = ik(h, f, l1, l2); return { h, kn, an, i }; });
  const sh = rot([1.4 * k, -75.5 * k + bob], hip, lean), neck = rot([2 * k, -79 * k + bob], hip, lean), head = rot([2.6 * k, -87 * k + bob], hip, lean);
  const armAt = (i, target) => {   // i 0 = far arm, 1 = near arm
    const s = rot([sh[0] + (i ? 0.6 : -0.6) * k, sh[1]], sh, 0);
    if (target) { const d = Math.hypot(target[0] - s[0], target[1] - s[1]), m = 30 * k; const t = d > m ? [s[0] + (target[0] - s[0]) * m / d, s[1] + (target[1] - s[1]) * m / d] : target; const [e] = ik(s, t, 15.5 * k, 14.5 * k, -1); return [s, e, t]; }
    let a, e;
    if (idle) { a = 0.06 + 0.04 * Math.sin(ph * 0.5 + i); e = 0.15; if (L.cup && i) { const lift2 = 0.5 + 0.5 * Math.sin(ph * 0.35); a = 0.35 + 0.5 * lift2; e = 1.5 + 0.9 * lift2; } }
    else { const sw = Math.sin(ph + (i ? 0 : Math.PI)); a = (run ? 0.75 : 0.36) * sw + lean * 0.6; e = run ? 1.55 : 0.22 + 0.32 * Math.max(0, sw); }
    if (L.phone && i) { a = 0.25; e = 2.2; } if (L.cane && i) { a = 0.45 + 0.1 * Math.sin(ph); e = 0.15; } if (L.balloons && i) { a = 0.55; e = 1.6; }
    const el = [s[0] + Math.sin(a) * 15.5 * k, s[1] + Math.cos(a) * 15.5 * k], hd = [el[0] + Math.sin(a + e) * 14.5 * k, el[1] + Math.cos(a + e) * 14.5 * k];
    return [s, el, hd];
  };
  const back = armAt(0, g.hold), front = armAt(1, g.holdF);
  const cTop = shade(L.tc, 0.08 + dk), cTopB = shade(L.tc, 0.3 + dk), cBot = shade(L.bc, 0.1 + dk), cBotB = shade(L.bc, 0.32 + dk), cSkin = shade(skin, dk), cSkinB = shade(skin, 0.25 + dk), cShoe = shade(L.shoe, dk);
  const long = L.bot === 'saree' || L.bot === 'veshti';
  // far arm and far leg
  sideArm(c, back, L, k, dk, true);
  const legCol = (i, part) => (L.bot === 'shorts' && part ? (i ? cSkin : cSkinB) : L.bot === 'none' ? (i ? cSkin : cSkinB) : i ? cBot : cBotB);
  for (const lg of legs) { if (lg.i) continue; sideLeg(c, lg, L, k, long, legCol(0, 0), legCol(0, 1), cSkinB, shade(L.shoe, 0.3 + dk)); }
  if (L.cane) { const h = front[2]; line(c, [h, [h[0] + 6 * k + Math.sin(ph) * 2 * k, 0]], 1.3 * k, shade('#6A4A30', dk)); }
  // torso and the near leg
  const T = [[-6, -77], [5, -77.5], [7, -67], [5, -55], [6.4, -46], [-6.6, -45.5], [-5.4, -55], [-6.6, -68]].map(([x, y]) => rot([x * k, y * k + bob], hip, lean));
  for (const lg of legs) { if (!lg.i) continue; sideLeg(c, lg, L, k, long, legCol(1, 0), legCol(1, 1), cSkin, cShoe); }
  if (long) {   // saree / veshti: a long wrap to the ankles following both legs
    const a0 = legs[0].an, a1 = legs[1].an, lo = Math.min(a0[0], a1[0]) - 2.5 * k, hi = Math.max(a0[0], a1[0]) + 2.5 * k;
    polyF(c, [T[5], T[4], [hi, -3 * k], [lerp(lo, hi, 0.5), -2.2 * k], [lo, -3 * k]], cBot);
    line(c, [[lerp(T[4][0], hi, 0.3), -30 * k], [lerp(lo, hi, 0.55), -3.5 * k]], 0.8 * k, cBotB);
  } else if (L.bot === 'none' || L.top === 'frock') {
    polyF(c, [T[6], T[3], [T[4][0] + 6 * k, -27 * k], [T[5][0] - 6 * k, -27 * k]], cTop);
  }
  { const Tm = isFem(L) ? T.map((p, i) => (i === 3 || i === 6 ? [lerp(p[0], hip[0], 0.14), p[1]] : p)) : T; body(c, cr(Tm, true), cTop, Math.min(...T.map(p => p[0])), Math.max(...T.map(p => p[0])), k, 0.45); }
  if (L.top === 'kurti') polyF(c, [T[5], T[4], [T[4][0] + 3 * k, -31 * k], [T[5][0] - 3 * k, -31 * k]], cTop);
  if (L.top === 'blouse') { polyF(c, [T[6], T[3], T[4], T[5]], cBot); line(c, [T[1], [T[4][0] - 2 * k, T[4][1] + 2 * k]], 3.4 * k, shade(L.pallu || L.bc, dk)); }
  if (L.top === 'shirt') line(c, [[T[1][0] - 1 * k, T[1][1] + 1.5 * k], [T[4][0] - 1.5 * k, T[4][1]]], 0.5 * k, shade(L.tc, 0.35 + dk));
  c.fillStyle = 'rgba(255,240,230,.10)'; c.beginPath(); c.moveTo(T[7][0], T[7][1]); c.lineTo(T[0][0], T[0][1]); c.lineTo(T[0][0] + 3 * k, T[0][1]); c.lineTo(T[6][0] + 3 * k, T[6][1]); c.lineTo(T[6][0], T[6][1]); c.fill();
  // neck, head, hair
  line(c, [rot([1.2 * k, -76 * k + bob], hip, lean), neck], 4.2 * k, cSkin);
  const hr = 6.1 * k; blob(c, head[0], head[1], hr * 0.94, hr, cSkin); blob(c, head[0] + hr * 0.95, head[1] + hr * 0.15, hr * 0.22, hr * 0.18, cSkin);
  const hc = shade(L.hc, dk * 0.5);
  if (L.hair === 'short' || L.hair === 'grey' || L.hair === 'curly') { blob(c, head[0] - hr * 0.2, head[1] - hr * 0.35, hr * 0.95, hr * (L.hair === 'curly' ? 0.82 : 0.7), hc); if (L.hair === 'curly') for (let i = 0; i < 5; i++) blob(c, head[0] - hr * 0.9 + i * hr * 0.42, head[1] - hr * 0.95 + Math.sin(i * 2) * 0.6 * k, hr * 0.3, hr * 0.28, hc); }
  else { blob(c, head[0] - hr * 0.15, head[1] - hr * 0.3, hr, hr * 0.78, hc); polyF(c, [[head[0] - hr * 0.2, head[1] - hr * 0.6], [head[0] - hr * 1.05, head[1] - hr * 0.2], [head[0] - hr * 0.9, head[1] + hr * 0.7], [head[0] - hr * 0.3, head[1] + hr * 0.4]], hc);
    if (L.hair === 'braid' || L.hair === 'long') { const sway = Math.sin(ph) * 1.2 * k; line(c, [[head[0] - hr * 0.7, head[1] + hr * 0.3], [head[0] - hr * 1.0 + sway * 0.5, head[1] + hr * 2.2], [head[0] - hr * 0.95 + sway, head[1] + hr * (L.hair === 'long' ? 3.2 : 4.4)]], (L.hair === 'long' ? 3.6 : 2.2) * k, hc); }
    if (L.hair === 'bun') blob(c, head[0] - hr * 0.95, head[1] - hr * 0.1, hr * 0.45, hr * 0.42, hc);
    if (L.hair === 'pony') { const sw = Math.sin(ph * 2) * 2 * k; line(c, [[head[0] - hr * 0.8, head[1] - hr * 0.4], [head[0] - hr * 1.6, head[1] + hr * 0.1 + sw], [head[0] - hr * 1.9, head[1] + hr * 0.9 + sw]], 2.4 * k, hc); }
    if (L.hair === 'pigtails') for (const s of [-1, 1]) blob(c, head[0] - hr * 0.6 + s * 1.2 * k, head[1] + hr * 0.5, hr * 0.28, hr * 0.5, hc); }
  if (L.female) drawFaceSide(c, L, head, k, time, dk);
  // near arm (over the body)
  sideArm(c, front, L, k, dk, false);
  if (L.cup && g.mode === 'idle') { const h = front[2]; c.fillStyle = shade('#F2EEE6', dk); c.fillRect(h[0] - 0.6 * k, h[1] - 3.4 * k, 2.6 * k, 3.2 * k); }
  if (L.phone) { const h = front[2]; c.fillStyle = '#CFE4FF'; c.fillRect(h[0] - 0.4 * k, h[1] - 3 * k, 1.2 * k, 2.4 * k); }
  if (L.balloons) drawBalloonBunch(c, front[2], k, ph);
  return { hip, sh, head, front, back, k };
}
const lerp2 = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t)];
const SLEEVE = { shirt: 0.95, kurti: 0.7, tee: 0.36, blouse: 0.36, frock: 0.28, vest: 0, jacket: 0.95 };   // how much of the arm the sleeve covers
function sideArm(c, A, L, k, dk, far) {   // a shaped arm (skin) with its sleeve over it and a hand
  const cSkin = shade(SKIN[L.skin], (far ? 0.25 : 0) + dk), sf = SLEEVE[L.top] ?? 0.5, [S, E, Hh] = A, sl = L.top === 'blouse' ? shade(L.bc, (far ? 0.3 : 0.1) + dk) : shade(L.tc, (far ? 0.3 : 0.06) + dk);
  tube(c, [S, E, Hh], [4.4 * k, 3.6 * k, 2.8 * k], cSkin, k);
  if (sf > 0) { const full = sf > 0.5, m = full ? lerp2(E, Hh, (sf - 0.5) * 2) : lerp2(S, E, sf * 2); tube(c, full ? [S, E, m] : [S, m], full ? [5.4 * k, 4.8 * k, 4.4 * k] : [5.4 * k, 5 * k], sl, k); }
  blob(c, Hh[0], Hh[1] + 0.4 * k, 1.9 * k, 2.1 * k, cSkin);
}
function sideLeg(c, lg, L, k, long, col1, col2, cSkin, cShoe) {   // thigh -> knee -> ankle as one tapered limb, and a shoe that follows the ankle
  const { h, kn, an } = lg;
  if (!long) { if (L.bot === 'shorts') { tube(c, [h, kn], [8.2 * k, 6.6 * k], col1, k); tube(c, [kn, an], [5.6 * k, 4.2 * k], cSkin, k); } else tube(c, [h, kn, an], [8.4 * k, 6.4 * k, 4.6 * k], col1, k); }
  else tube(c, [kn, an], [5 * k, 3.8 * k], cSkin, k);
  c.save(); c.translate(an[0] + 1.6 * k, an[1] - 0.4 * k); c.fillStyle = cShoe; c.beginPath(); c.ellipse(0.8 * k, 0, 3.7 * k, 1.7 * k, 0, 0, TAU); c.fill(); c.fillStyle = 'rgba(220,214,208,.55)'; c.fillRect(-2.6 * k, 0.9 * k, 7.4 * k, 0.7 * k); c.restore();
}
function drawFaceSide(c, L, head, k, t, dk) {
  const x = head[0], y = head[1], blink = Math.max(0, 1 - Math.abs(Math.sin(t * 2.1 + L.facePhase)) * 30), eyeY = y - 0.55 * k;
  const eyeCol = shade('#29191C', dk * 0.35), skinCol = shade(SKIN[L.skin], 0.22 + dk);
  if (blink > 0.7) line(c, [[x + 2.8 * k, eyeY], [x + 3.5 * k, eyeY + 0.12 * k], [x + 4.2 * k, eyeY]], 0.55 * k, eyeCol);
  else {
    blob(c, x + 3.45 * k, eyeY, 0.82 * k, 0.72 * k, '#FFF0E8');
    blob(c, x + 3.7 * k, eyeY + 0.04 * k, 0.42 * k, 0.48 * k, eyeCol);
    blob(c, x + 3.82 * k, eyeY - 0.13 * k, 0.15 * k, 0.16 * k, '#FFFFFF');
    line(c, [[x + 2.7 * k, eyeY - 0.8 * k], [x + 3.5 * k, eyeY - 1.12 * k], [x + 4.35 * k, eyeY - 0.72 * k]], 0.42 * k, eyeCol);
  }
  line(c, [[x + 4.65 * k, y - 0.1 * k], [x + 6.05 * k, y + 0.75 * k], [x + 5.3 * k, y + 1.15 * k]], 0.36 * k, skinCol);
  c.strokeStyle = L.lip || '#9B4C62'; c.lineWidth = 0.46 * k; c.lineCap = 'round';
  c.beginPath(); c.moveTo(x + 4.65 * k, y + 2.0 * k); c.quadraticCurveTo(x + 5.55 * k, y + 2.35 * k, x + 6.3 * k, y + 2.05 * k); c.stroke();
  blob(c, x + 5.55 * k, y + 2.12 * k, 0.48 * k, 0.16 * k, rgba(L.lip || '#9B4C62', 0.62));
}
function drawFaceFront(c, L, x, y, k, t) {
  const blink = Math.max(0, 1 - Math.abs(Math.sin(t * 2.1 + L.facePhase)) * 30), gaze = Math.sin(t * 0.55 + L.facePhase) * 0.22 * k;
  const eyeCol = '#28181B', eyeY = y + 0.35 * k;
  for (const s of [-1, 1]) {
    const ex = x + s * 2.05 * k;
    if (blink > 0.7) line(c, [[ex - 0.86 * k, eyeY], [ex, eyeY + 0.14 * k], [ex + 0.86 * k, eyeY]], 0.55 * k, eyeCol);
    else {
      blob(c, ex, eyeY, 0.92 * k, 0.7 * k, '#FFF1E8');
      blob(c, ex + gaze, eyeY + 0.02 * k, 0.47 * k, 0.54 * k, eyeCol);
      blob(c, ex + gaze + 0.12 * k, eyeY - 0.15 * k, 0.15 * k, 0.16 * k, '#FFFFFF');
      line(c, [[ex - 1.05 * k, eyeY - 0.72 * k], [ex, eyeY - 1.12 * k], [ex + 1.02 * k, eyeY - 0.7 * k]], 0.45 * k, eyeCol);
    }
    line(c, [[ex - 0.9 * k, eyeY - 1.45 * k], [ex, eyeY - 1.72 * k], [ex + 0.82 * k, eyeY - 1.38 * k]], 0.34 * k, eyeCol);
    blob(c, x + s * 3.4 * k, y + 2.2 * k, 0.72 * k, 0.3 * k, 'rgba(230,110,125,.18)');
  }
  const skinCol = shade(SKIN[L.skin], 0.22);
  line(c, [[x - 0.06 * k, y + 1.0 * k], [x + 0.2 * k, y + 2.0 * k], [x + 0.62 * k, y + 2.12 * k]], 0.36 * k, skinCol);
  blob(c, x + 0.55 * k, y + 2.08 * k, 0.28 * k, 0.18 * k, skinCol);
  c.strokeStyle = L.lip || '#9B4C62'; c.lineWidth = 0.55 * k; c.lineCap = 'round';
  c.beginPath(); c.moveTo(x - 0.92 * k, y + 3.15 * k); c.quadraticCurveTo(x - 0.22 * k, y + 3.52 * k, x + 0.08 * k, y + 3.32 * k);
  c.quadraticCurveTo(x + 0.5 * k, y + 3.55 * k, x + 1.0 * k, y + 3.12 * k); c.stroke();
  blob(c, x + 0.04 * k, y + 3.38 * k, 0.68 * k, 0.18 * k, rgba(L.lip || '#9B4C62', 0.42));
  for (const s of [-1, 1]) blob(c, x + s * 5.0 * k, y + 1.45 * k, 0.34 * k, 0.48 * k, '#E2B84F');
}
const BAL = [['#FF6FA6', -7, -72], ['#F5C451', 5, -76], ['#7FD0F0', 0, -84], ['#B9A0E8', -11, -84], ['#FF8A5C', 10, -86], ['#9BE08A', -4, -95], ['#FF6FA6', 8, -97]];
function drawBalloonBunch(c, hand, k, ph) {
  const top = [hand[0] + 1 * k, hand[1] - 34 * k];
  line(c, [hand, top], 1.2 * k, '#8A6A44');
  for (const [col, dx, dy] of BAL) { const bx = hand[0] + dx * k + Math.sin(ph * 0.4 + dx) * 0.8 * k, by = hand[1] + (dy + 40) * k;
    line(c, [top, [bx, by + 4.6 * k]], 0.35 * k, 'rgba(230,230,240,.7)'); blob(c, bx, by, 3.8 * k, 4.6 * k, col); blob(c, bx - 1.3 * k, by - 1.8 * k, 0.9 * k, 1.4 * k, 'rgba(255,255,255,.7)'); }
}
function balloonLights(hand, k) { return BAL.map(([col, dx, dy]) => { const a = hx(col); return [hand[0] + dx * k, hand[1] + (dy + 40) * k, a[0] / 255, a[1] / 255, a[2] / 255]; }); }

// ---- shaped bodies for the people on the promenade: tapered limbs along a smoothed centre line, garments cut to the body, a gait
// from gait.js (planted feet that never slide, the hip rising and dropping, arms swinging against the legs)
const KF = 0.21;                                           // how much a step forward / back shows up as height, because the camera looks along the path
const isFem = L => !!L.female || ['bun', 'braid', 'long', 'pigtails', 'pony'].includes(L.hair) || ['kurti', 'blouse', 'frock'].includes(L.top);
function cr(pts, closed) {   // Catmull-Rom through points -> Path2D
  const n = pts.length, p = new Path2D(); p.moveTo(pts[0][0], pts[0][1]); const seg = closed ? n : n - 1;
  for (let i = 0; i < seg; i++) { const p1 = pts[i], p2 = pts[(i + 1) % n], p0 = closed ? pts[(i - 1 + n) % n] : pts[Math.max(0, i - 1)], p3 = closed ? pts[(i + 2) % n] : pts[Math.min(n - 1, i + 2)];
    p.bezierCurveTo(p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6, p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6, p2[0], p2[1]); }
  if (closed) p.closePath(); return p;
}
// a flat-shaded shape: lit on the left (the low moon), cooler on the right, and a soft darker edge
function body(c, path, col, x0, x1, k = 1, edge = 0.4) {
  const g = c.createLinearGradient(x0, 0, x1, 0); g.addColorStop(0, shade(col, 0.16, [255, 238, 218])); g.addColorStop(0.45, col); g.addColorStop(1, shade(col, 0.26));
  c.fillStyle = g; c.fill(path); if (edge) { c.lineWidth = 0.34 * k; c.strokeStyle = `rgba(40,24,50,${edge * 0.5})`; c.stroke(path); }
}
function tube(c, pts, ws, col, k = 1) {   // a limb: a ribbon along a smoothed centre line with a width at every point, round at the far end
  const n = pts.length, P = [], W = [];
  for (let i = 0; i < n - 1; i++) { const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(n - 1, i + 2)];
    for (let j = 0; j < 4; j++) { const t = j / 4, t2 = t * t, t3 = t2 * t;
      P.push([0.5 * (2 * p1[0] + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3), 0.5 * (2 * p1[1] + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3)]);
      W.push(ws[i] + (ws[i + 1] - ws[i]) * t); } }
  P.push(pts[n - 1]); W.push(ws[n - 1]);
  const L = [], R = []; let x0 = 1e9, x1 = -1e9;
  for (let i = 0; i < P.length; i++) { const a = P[Math.max(0, i - 1)], b = P[Math.min(P.length - 1, i + 1)]; let dx = b[0] - a[0], dy = b[1] - a[1]; const l = Math.hypot(dx, dy) || 1; dx /= l; dy /= l; const w = W[i] / 2;
    L.push([P[i][0] - dy * w, P[i][1] + dx * w]); R.push([P[i][0] + dy * w, P[i][1] - dx * w]); x0 = Math.min(x0, L[i][0], R[i][0]); x1 = Math.max(x1, L[i][0], R[i][0]); }
  const path = new Path2D(); path.moveTo(L[0][0], L[0][1]); for (const p of L) path.lineTo(p[0], p[1]); for (let i = R.length - 1; i >= 0; i--) path.lineTo(R[i][0], R[i][1]); path.closePath();
  body(c, path, col, x0, x1, k, 0.35); const e = P[P.length - 1]; blob(c, e[0], e[1], W[W.length - 1] / 2, W[W.length - 1] / 2, col); return path;
}
function shoeF(c, an, p, k, col, back, dk) {   // a shoe seen from behind / from the front
  c.save(); c.translate(an[0], an[1] + 0.9 * k); const up = Math.max(0, -p);
  if (back) { if (up > 0.15) blob(c, 0, 1.2 * k, 1.7 * k, 0.9 * k, shade('#C9C4C0', dk)); blob(c, 0, 0, 1.9 * k, 1.5 * k * (1 - up * 0.2), col); blob(c, 0, 1.0 * k, 1.9 * k, 0.5 * k, shade('#D8D2CC', dk + 0.1)); }
  else { blob(c, 0, 0.4 * k, 2.0 * k, 1.9 * k, col); blob(c, 0, 1.1 * k, 2.0 * k, 0.6 * k, shade('#D8D2CC', dk + 0.1)); blob(c, 0, -0.3 * k, 1.3 * k, 0.8 * k, shade(col, 0.12, [255, 240, 230])); }
  c.restore();
}

// one person seen from the front or from behind (walking towards / away from the camera)
function personFront(c, L, g) {
  const k = L.H / 95, run = g.mode === 'run', idle = g.mode === 'idle', ph = g.ph, time = g.t ?? ph, back = g.view === 'back', dk = g.dark || 0, fem = isFem(L), skin = SKIN[L.skin];
  const cSkin = shade(skin, dk), cTop = shade(L.tc, 0.08 + dk), cBot = shade(L.bc, 0.12 + dk), hc = shade(L.hc, dk * 0.5), cShoe = shade(L.shoe, dk), long = L.bot === 'saree' || L.bot === 'veshti';
  const dz = back ? -KF : KF;                              // a foot / hand that is forward shows higher up from behind, lower down from the front
  // ---- gait: both feet, and the hip height they allow
  const legLen = 45.2 * k, AH = 2.3 * k, Sd = (run ? 40 : 27) * k, u0 = ph / TAU, lift = (run ? 9 : 4.2) * k;
  const F = [0, 1].map(i => (idle ? { x: (i ? 1.4 : -1.0) * k, y: Math.max(0, Math.sin(time * 1.3 + i + (L.facePhase || 0))) * 0.15 * k, p: 0, st: true } : gaitFoot(u0 + i * 0.5, Sd, lift)));
  const dxMax = idle ? 0 : Math.max(...F.map(f => (f.st ? Math.abs(f.x) : 0)));
  const hipY = idle ? -47.5 * k + 0.22 * k * Math.sin(time * 1.5 + (L.facePhase || 0)) : run ? -47.5 * k - 2 * k * Math.abs(Math.sin(ph)) : -(AH + hipRise(legLen, dxMax, 0.02));
  const bob = hipY + 47.5 * k, swy = idle ? 0 : Math.cos(2 * Math.PI * (u0 - 0.3));   // the pelvis sways over the planted foot
  const legs = [0, 1].map(i => { const s = i ? 1 : -1, f = F[i], hx = s * 3.6 * k + swy * 0.5 * k, hip = [hx, hipY + s * swy * 0.25 * k];
    const az = -AH - f.y, I = ik([0, hip[1]], [f.x, az], legLen * 0.5, legLen * 0.5, 1), ax = hx + s * 0.35 * k * (f.st ? 1 : 0.4);
    return { hip, kn: [lerp(hx, ax, 0.5) + s * 0.4 * k, I[0][1] + dz * I[0][0]], an: [ax, az + dz * f.x], f, s, z: f.x }; });
  const ord = legs.slice().sort((a, b) => (back ? b.z - a.z : a.z - b.z));
  const legCol = L.bot === 'shorts' || L.bot === 'none' ? cSkin : cBot;
  for (const lg of ord) {
    const wTh = (fem ? 8.4 : 9.0) * k;
    if (!long) { if (L.bot === 'shorts') { tube(c, [lg.hip, lg.kn], [wTh, wTh * 0.82], cBot, k); tube(c, [lg.kn, lg.an], [5.4 * k, 4.2 * k], cSkin, k); } else tube(c, [lg.hip, lg.kn, lg.an], [wTh, 6.4 * k, 4.6 * k], legCol, k); }
    else tube(c, [[lg.an[0], lg.an[1] - 9 * k], lg.an], [4.4 * k, 3.8 * k], cSkin, k);
    shoeF(c, lg.an, lg.f.p, k, cShoe, back, dk);
  }
  // ---- torso: shoulders, a waist, hips (women narrower at the shoulders and waist); the garment is cut on it
  const sy = -76 * k + bob * 0.6, sw2 = (fem ? 7.4 : 9.4) * k, bw = (fem ? 6.8 : 8.6) * k, ww = (fem ? 5.2 : 7.4) * k, hw = 7.8 * k, wy = -57 * k + bob * 0.8, hyy = hipY + 1.5 * k;
  const top = [[-sw2 * 0.4, sy - 3.4 * k], [-sw2, sy + 0.4 * k], [-sw2 * 0.97, sy + 6 * k], [-bw, sy + 13 * k], [-ww, wy]];
  const bot = [[ww, wy], [bw, sy + 13 * k], [sw2 * 0.97, sy + 6 * k], [sw2, sy + 0.4 * k], [sw2 * 0.4, sy - 3.4 * k]];
  let mid;   // the lower body of the garment: left side, then right side
  if (L.top === 'kurti') mid = [[-hw - 0.4 * k, hyy - 2 * k], [-hw - 2.4 * k, -38 * k], [-hw - 3.4 * k, -31 * k], [hw + 3.4 * k, -31 * k], [hw + 2.4 * k, -38 * k], [hw + 0.4 * k, hyy - 2 * k]];
  else if (L.top === 'frock' || L.bot === 'none') mid = [[-hw, hyy - 4 * k], [-hw - 4.2 * k, -34 * k], [-hw - 6 * k, -27 * k], [hw + 6 * k, -27 * k], [hw + 4.2 * k, -34 * k], [hw, hyy - 4 * k]];
  else if (L.top === 'blouse') mid = [[-ww - 0.4 * k, wy + 1.4 * k], [ww + 0.4 * k, wy + 1.4 * k]];
  else mid = [[-hw, hyy + 0.5 * k], [hw, hyy + 0.5 * k]];
  if (long) {   // saree / veshti: a pleated wrap from the waist to the ankles (the feet show only below it)
    const lo = Math.min(legs[0].an[0], legs[1].an[0]) - 4.6 * k, hi = Math.max(legs[0].an[0], legs[1].an[0]) + 4.6 * k, ay = Math.max(legs[0].an[1], legs[1].an[1]) - 3.2 * k, sh2 = L.top === 'blouse' ? wy + 1 * k : hyy - 6 * k;
    const wrap = cr([[-ww - 0.8 * k, sh2], [-hw - 0.4 * k, hyy + 4 * k], [Math.min(lo, -hw - 3 * k), ay - 12 * k], [lo, ay], [hi, ay], [Math.max(hi, hw + 3 * k), ay - 12 * k], [hw + 0.4 * k, hyy + 4 * k], [ww + 0.8 * k, sh2]], true);
    body(c, wrap, cBot, lo - 4 * k, hi + 4 * k, k, 0.45);
    c.save(); c.clip(wrap); c.lineWidth = 0.5 * k; c.strokeStyle = rgba(shade(L.bc, 0.5), 0.35);
    for (let i = -3; i <= 3; i++) { c.beginPath(); c.moveTo(i * 2.1 * k, sh2 + 4 * k); c.quadraticCurveTo(i * 2.7 * k + Math.sin(ph + i) * 0.4 * k, (sh2 + ay) / 2, i * 3.5 * k + (legs[0].an[0] + legs[1].an[0]) * 0.1, ay); c.stroke(); }
    c.fillStyle = shade(L.pallu || '#E3A13B', 0.1 + dk); c.fillRect(lo - 1 * k, ay - 2.4 * k, hi - lo + 2 * k, 2.4 * k); c.restore();
  }
  const torso = cr(top.concat(mid, bot), true);
  body(c, torso, L.top === 'blouse' ? cBot : cTop, -hw - 4 * k, hw + 4 * k, k, 0.45);
  c.save(); c.clip(torso);
  if (L.top === 'kurti') { c.strokeStyle = rgba(shade(L.tc, 0.5), 0.4); c.lineWidth = 0.45 * k; c.beginPath(); c.moveTo(0, sy + 4 * k); c.lineTo(0, -33 * k); c.stroke(); c.beginPath(); c.moveTo(-hw - 2.8 * k, -33 * k); c.lineTo(-hw - 2.6 * k, -31 * k); c.moveTo(hw + 2.8 * k, -33 * k); c.lineTo(hw + 2.6 * k, -31 * k); c.stroke(); }
  if (L.top === 'shirt') { c.strokeStyle = rgba(shade(L.tc, 0.5), 0.36); c.lineWidth = 0.4 * k; c.beginPath(); if (back) { c.moveTo(-sw2 + 1 * k, sy + 5 * k); c.quadraticCurveTo(0, sy + 7.5 * k, sw2 - 1 * k, sy + 5 * k); } else { c.moveTo(0.5 * k, sy + 4 * k); c.lineTo(0.4 * k, hyy); } c.stroke(); }
  c.fillStyle = 'rgba(255,240,230,.09)'; c.fillRect(-sw2, sy, 3 * k, 36 * k);
  c.restore();
  if (L.top === 'blouse') {   // the pallu: over the left shoulder, across the back (or the chest) and round the waist
    const sd = back ? 1 : -1, pts = [[-sd * sw2 * 0.8, sy + 0.2 * k], [-sd * sw2 * 0.2, sy + 10 * k], [sd * ww * 0.6, wy + 8 * k], [sd * hw * 0.9, hyy + 8 * k]];
    tube(c, pts, [6.2 * k, 6.8 * k, 7 * k, 6 * k], shade(L.pallu || '#E3A13B', 0.06 + dk), k);
  }
  // ---- arms: they swing from the shoulder against the legs; the elbow bends as the arm comes forward; hands go where the person holds something
  const sleeveF = { shirt: 0.95, kurti: 0.7, tee: 0.36, blouse: 0.36, frock: 0.28, vest: 0, jacket: 0.95 }[L.top] ?? 0.5, Lu = 15.2 * k, Lf = 14 * k, amp = idle ? 0.04 : run ? 0.7 : 0.3;
  const armOf = s => { const S = [s * (sw2 - 0.9 * k), sy + 1.6 * k];   // the screen-right arm swings with the screen-left leg (leg 0)
    let hd = null; if (g.holdL && s < 0) hd = g.holdL; if (g.holdR && s > 0) hd = g.holdR;
    if (L.phone && s > 0) hd = [4 * k, -66 * k + bob]; if (L.balloons && s > 0) hd = [9 * k, -62 * k + bob]; if (L.cane && s > 0) hd = [10 * k, -46 * k + bob];
    if (hd) return [S, [lerp(S[0], hd[0], 0.5) + s * 1.8 * k, lerp(S[1], hd[1], 0.5) + 2.2 * k], hd];
    let a, el; if (idle) { a = 0.05 * Math.sin(time * 0.85 + s + (L.facePhase || 0)); el = 0.15; } else { const A = armSwing(u0 + (s > 0 ? 0 : 0.5), amp, run ? 1.1 : 0.2); a = A.sh; el = A.el; }
    const a2 = a + el, z1 = Lu * Math.sin(a), y1 = Lu * Math.cos(a), z2 = z1 + Lf * Math.sin(a2), y2 = y1 + Lf * Math.cos(a2);
    return [S, [S[0] + s * 1.2 * k, S[1] + y1 + dz * z1], [S[0] + s * 2.1 * k, S[1] + y2 + dz * z2]]; };
  for (const s of [-1, 1]) { const [S, E, Hh] = armOf(s);
    tube(c, [S, E, Hh], [4.4 * k, 3.6 * k, 2.8 * k], cSkin, k);
    if (sleeveF > 0) { const full = sleeveF > 0.5, m = full ? [lerp(E[0], Hh[0], (sleeveF - 0.5) * 2), lerp(E[1], Hh[1], (sleeveF - 0.5) * 2)] : [lerp(S[0], E[0], sleeveF * 2), lerp(S[1], E[1], sleeveF * 2)];
      tube(c, full ? [S, E, m] : [S, m], full ? [5.4 * k, 4.8 * k, 4.4 * k] : [5.4 * k, 5 * k], L.top === 'blouse' ? cBot : cTop, k); }
    blob(c, Hh[0], Hh[1] + 0.6 * k, 1.9 * k, 2.2 * k, cSkin); }
  if (L.cane) { const h = armOf(1)[2]; line(c, [h, [12 * k, 0]], 1.3 * k, shade('#6A4A30', dk)); }
  if (L.phone && !back) { const h = armOf(1)[2]; c.fillStyle = '#CFE4FF'; c.fillRect(h[0] - 1 * k, h[1] - 2.8 * k, 2 * k, 2.8 * k); }
  if (L.balloons) drawBalloonBunch(c, armOf(1)[2], k, ph);
  // ---- neck and head
  const hy = sy - 11 * k, hr = 6 * k;
  tube(c, [[0, sy + 1 * k], [0, hy + hr * 0.6]], [4.4 * k, 4 * k], cSkin, k);
  if (back) {   // the back of the head: hair over the skull, the style falling from it
    if (L.hair === 'long') { const sway = Math.sin(ph) * 0.8 * k, m = cr([[-hr * 0.98, hy - hr * 0.2], [-hr * 1.12, hy + hr * 1.6], [-hr * 1.0 + sway, hy + hr * 3.0], [sway, hy + hr * 3.35], [hr * 1.0 + sway, hy + hr * 3.0], [hr * 1.12, hy + hr * 1.6], [hr * 0.98, hy - hr * 0.2]], true);
      body(c, m, hc, -hr, hr, k, 0.2); c.strokeStyle = 'rgba(138,122,138,.18)'; c.lineWidth = 0.4 * k; c.beginPath(); c.moveTo(-hr * 0.4, hy + hr * 0.8); c.quadraticCurveTo(-hr * 0.6 + sway * 0.5, hy + hr * 2, -hr * 0.45 + sway, hy + hr * 3); c.stroke(); }
    if (L.hair === 'braid') { const sway = Math.sin(ph) * 1.1 * k; tube(c, [[0, hy + hr * 0.5], [sway * 0.4, hy + hr * 1.9], [sway * 0.9, hy + hr * 3.2], [sway * 1.3, hy + hr * 4.4]], [3.4 * k, 3 * k, 2.6 * k, 1.8 * k], hc, k);
      c.strokeStyle = 'rgba(138,122,138,.22)'; c.lineWidth = 0.35 * k; for (let i = 0; i < 6; i++) { const yy = hy + hr * (0.9 + i * 0.6); c.beginPath(); c.moveTo(-1.2 * k + sway * i * 0.2, yy); c.lineTo(1.2 * k + sway * i * 0.2, yy + 0.7 * k); c.stroke(); } }
    if (L.hair === 'pony') tube(c, [[0, hy - hr * 0.4], [Math.sin(ph * 2) * 1.6 * k, hy + hr * 1.2], [Math.sin(ph * 2) * 2.2 * k, hy + hr * 2.4]], [3.2 * k, 3 * k, 1.8 * k], hc, k);
    const crop = L.hair === 'grey' || L.hair === 'short' || L.hair === 'curly';
    blob(c, 0, hy, hr * 0.94, hr, crop ? cSkin : hc);
    if (crop) { blob(c, 0, hy - hr * 0.2, hr * 0.99, hr * 0.92, hc); if (L.hair === 'curly') for (let i = 0; i < 5; i++) blob(c, -hr * 0.8 + i * hr * 0.4, hy - hr * 0.8, hr * 0.3, hr * 0.28, hc); }
    if (L.hair === 'bun') blob(c, 0, hy - hr * 0.2, hr * 0.5, hr * 0.46, shade(L.hc, 0.1));
    if (L.hair === 'pigtails') for (const s of [-1, 1]) blob(c, s * hr * 1.0, hy + hr * 0.5, hr * 0.3, hr * 0.5, hc);
    blob(c, -hr * 0.55, hy - hr * 0.45, hr * 0.28, hr * 0.5, 'rgba(255,240,230,.08)');
  } else {
    if (L.hair === 'long' || L.hair === 'braid') for (const s of [-1, 1]) tube(c, [[s * hr * 0.85, hy - hr * 0.1], [s * hr * 1.0, hy + hr * 1.3], [s * hr * (L.hair === 'long' ? 1.05 : 0.9), hy + hr * (L.hair === 'long' ? 2.6 : 1.5)]], [2.8 * k, 2.6 * k, 2.2 * k], hc, k);
    blob(c, 0, hy, hr * 0.9, hr, cSkin);
    if (L.hair === 'bun') blob(c, 0, hy - hr * 0.95, hr * 0.52, hr * 0.5, hc);
    blob(c, 0, hy - hr * 0.5, hr * 0.98, hr * 0.46, hc);
    if (L.hair === 'pigtails') for (const s of [-1, 1]) blob(c, s * hr * 1.05, hy + hr * 0.4, hr * 0.3, hr * 0.5, hc);
    if (L.hair === 'curly') for (let i = 0; i < 5; i++) blob(c, -hr * 0.8 + i * hr * 0.4, hy - hr * 0.85, hr * 0.3, hr * 0.28, hc);
    blob(c, -hr * 0.92, hy + hr * 0.1, hr * 0.14, hr * 0.26, shade(skin, 0.2 + dk)); blob(c, hr * 0.92, hy + hr * 0.1, hr * 0.14, hr * 0.26, shade(skin, 0.2 + dk));
    if (L.female) drawFaceFront(c, L, 0, hy, k, time);
  }
  return { k };
}
function dogSide(c, ph, k, dk = 0) {   // a small fawn dog trotting (diagonal pairs), facing +x, feet at y = 0
  const col = shade(DOG.c, dk), col2 = shade(DOG.c2, dk), colB = shade(DOG.c, 0.3 + dk), by = -12 * k + Math.abs(Math.sin(ph * 2)) * 0.6 * k;
  const leg = (x, p, far) => { const sw = Math.sin(p) * 3.4 * k, lf = Math.max(0, Math.cos(p)) * 1.8 * k; line(c, [[x, by + 2 * k], [x + sw * 0.5, by + 7 * k], [x + sw, -lf]], 2.1 * k, far ? colB : col); };
  leg(-6.5 * k, ph + Math.PI, 1); leg(6 * k, ph, 1);
  line(c, [[-9 * k, by - 1 * k], [-13 * k, by - 6 * k + Math.sin(ph * 2) * k], [-12 * k, by - 9 * k]], 2 * k, col);   // tail up
  blob(c, 0, by, 9.5 * k, 4.4 * k, col); blob(c, 1.5 * k, by + 1.8 * k, 6 * k, 2.2 * k, col2);
  leg(-5 * k, ph, 0); leg(7.5 * k, ph + Math.PI, 0);
  line(c, [[7 * k, by - 2 * k], [10 * k, by - 6.5 * k]], 4 * k, col);
  blob(c, 12 * k, by - 8 * k, 3.6 * k, 3.1 * k, col); blob(c, 15.2 * k, by - 7 * k, 2.2 * k, 1.5 * k, col2); blob(c, 17 * k, by - 7.4 * k, 0.6 * k, 0.6 * k, '#2A1E1E');
  polyF(c, [[10.5 * k, by - 10 * k], [11.3 * k, by - 14 * k], [12.8 * k, by - 10.5 * k]], colB);
  return [10.5 * k, by - 6 * k];   // collar
}
function dogFront(c, ph, k, back, dk = 0) {
  const col = shade(DOG.c, dk), col2 = shade(DOG.c2, dk), by = -12 * k;
  for (const s of [-1, 1]) { const lf = Math.max(0, Math.sin(ph * 2 + (s > 0 ? 0 : Math.PI))) * 2 * k; line(c, [[s * 2.6 * k, by + 2 * k], [s * 2.8 * k, -lf]], 2.2 * k, col); }
  blob(c, 0, by, 4.6 * k, 4.8 * k, col);
  if (back) { line(c, [[0, by - 2 * k], [Math.sin(ph * 3) * 2 * k, by - 9 * k]], 2 * k, col); blob(c, 0, by - 6 * k, 3.4 * k, 3 * k, col); }
  else { blob(c, 0, by - 7 * k, 3.6 * k, 3.2 * k, col); blob(c, 0, by - 5.6 * k, 1.8 * k, 1.3 * k, col2); }
  for (const s of [-1, 1]) polyF(c, [[s * 1.6 * k, by - 9 * k], [s * 3.2 * k, by - 13 * k], [s * 3.6 * k, by - 8.6 * k]], col);
  return [0, by - 4 * k];
}

// ---------------------------------------------------------------- groups (what one walker slot draws)
// members: [look, offset across (front/back view), offset along (side view), phase offset]
const GROUPS = {
  couple: { m: [['womanSaree', -6.2, 8, 0.0], ['manShirt', 6.2, -6, 0.35]], hands: true, w: 24 },
  couple2: { m: [['girl2', -6, 8, 0.1], ['guy2', 6.2, -6, 0.5]], hands: true, w: 24 },
  family: { m: [['mum', -5.6, -5, 0.0], ['girl', 6.2, 10, 1.1]], hands: true, w: 24 },
  dogwalk: { m: [['dogMan', 0, 0, 0]], dog: true, w: 46 },
  jogger: { m: [['jogger', 0, 0, 0]], w: 26 },
  jogger2: { m: [['jogger2', 0, 0, 0]], w: 26 },
  oldman: { m: [['oldMan', 0, 0, 0]], w: 24 },
  friends: { m: [['friendA', -12, 12, 0.0], ['friendB', 0, 0, 0.9], ['friendC', 12, -11, 2.0]], w: 34 },
  friendsSix: { m: [['friendA', -42, 16, 0.0], ['friendB', -25, -5, 0.7], ['friendC', -9, 13, 1.5], ['friendD', 9, -12, 2.1], ['friendE', 25, 7, 2.8], ['friendF', 42, -16, 3.4]], w: 68 },
  seller: { m: [['seller', 0, 0, 0]], w: 28, tall: true },
  phone: { m: [['phoneGuy', 0, 0, 0]], w: 22 },
  vendor: { m: [['vendor', 0, 0, 0]], w: 22, idle: true },
  cust1: { m: [['cust1', 0, 0, 0]], w: 22, idle: true },
  cust2: { m: [['cust2', 0, 0, 0]], w: 22, idle: true }
};
function drawGroup(c, G, pose) {
  const { view, ph, stride, mode, t } = pose, side = view === 'side', ms = G.m;
  if (side) {
    // the farther member first (darker), joined hands between them at hip height
    const order = ms.map((m, i) => i).sort((a, b) => ms[a][2] - ms[b][2]);
    const clasp = ms.length === 2 && G.hands ? [(ms[0][2] + ms[1][2]) / 2 * (LOOK[ms[0][0]].H / 95) + 1.5, -40 * LOOK[ms[1][0]].H / 95] : null;
    for (const i of order) { const [lk, , along, po] = ms[i], L = LOOK[lk]; c.save(); c.translate(along, i === order[0] && ms.length > 1 ? -0.6 : 0);
      const near = i === order[order.length - 1], hold = clasp ? [clasp[0] - along, clasp[1]] : null;
      personSide(c, L, { ph: ph + po, stride, mode, t, dark: near ? 0 : 0.14, hold: near ? hold : null, holdF: near ? null : hold });   // the near one's far hand meets the far one's near hand
      c.restore(); }
    if (G.dog) { const L = LOOK[ms[0][0]], k = L.H / 95; c.save(); c.translate(30, 0); const col = dogSide(c, ph * 1.6, 0.95); c.restore();
      const hand = [16 * k, -47 * k]; line(c, [hand, [lerp(hand[0], col[0] + 30, 0.5), lerp(hand[1], col[1], 0.5) + 3], [col[0] + 30, col[1]]], 0.45, 'rgba(40,30,40,.9)'); }
  } else {
    const back = view === 'back', order = ms.map((m, i) => i);
    if (G.dog) { c.save(); c.translate(-14, 0); dogFront(c, ph, 0.95, back); c.restore(); }
    let holdPts = null;
    if (G.hands && ms.length === 2) { const xm = (ms[0][1] + ms[1][1]) / 2, y = -42 * LOOK[ms[1][0]].H / 95; holdPts = [xm, y]; }
    for (const i of order) { const [lk, across, , po] = ms[i], L = LOOK[lk]; c.save(); c.translate(across, 0);
      const g = { ph: ph + po, mode, view, t, dark: 0 };
      if (holdPts) { const h = [holdPts[0] - across, holdPts[1]]; if (across < 0) g.holdR = h; else g.holdL = h; }
      personFront(c, L, g); c.restore(); }
    if (G.dog) { const k = LOOK[ms[0][0]].H / 95; line(c, [[-9.8 * k, -47 * k], [-14, -16]], 0.45, 'rgba(40,30,40,.9)'); }
  }
}
function groupBounds(G, view) {
  const H = Math.max(...G.m.map(m => LOOK[m[0]].H)), top = -(G.tall ? H * 1.62 : H * 1.08) - 4;
  if (view === 'side') { const al = G.m.map(m => m[2]); return [Math.min(...al) - 26, top, Math.max(...al) + (G.dog ? 52 : 26), 4]; }
  return [-(G.w || 24) - (G.dog ? 6 : 0), top, (G.w || 24), 4];
}

// ---------------------------------------------------------------- paths (floor plan X, Z) and who walks them
const PATHS = {
  farA: [[1.4, 82], [1.4, 50], [11.6, 50], [11.6, 82]],        // the far end: out of the haze, across behind the chai cart, back into the haze
  farB: [[3.6, 82], [3.6, 57], [9.8, 57], [9.8, 82]],
  farC: [[0.8, 82], [0.8, 48.5], [12.4, 48.5], [12.4, 82]],
  right: [[22, 10.4], [22, 29], [34, 29]]                        // the far right side: along the promenade, then into a side street
};
// [group, path, reverse, speed (units/s; 1 unit ≈ 0.55 m), period (s), time offset (s)]
const WALKERS = [
  ['couple', 'farA', 0, 1.75, 72, 15], ['jogger', 'farC', 1, 4.9, 31, 7], ['family', 'farB', 0, 1.55, 84, 57],
  ['dogwalk', 'farA', 1, 2.0, 62, 27], ['seller', 'farB', 1, 1.15, 118, 90], ['friends', 'farC', 0, 1.65, 78, 23],
  ['phone', 'farA', 0, 2.05, 66, 60], ['oldman', 'right', 0, 1.35, 58, 20], ['couple2', 'right', 1, 1.8, 66, 44], ['jogger2', 'right', 1, 4.6, 39, 12]
];
// people standing at the chai cart (X 5.7, Z 42.9): [group, X, Z, faces left]
const STANDERS = [['vendor', 5.75, 44.6, 0], ['cust1', 4.0, 41.9, 0], ['cust2', 7.5, 42.1, 1]];

function pathInfo(P) { const seg = []; let L = 0; for (let i = 0; i < P.length - 1; i++) { const a = P[i], b = P[i + 1], l = Math.hypot(b[0] - a[0], b[1] - a[1]); seg.push({ a, b, l, s0: L }); L += l; } return { seg, L }; }
function pointAt(info, s) { for (const g of info.seg) if (s <= g.s0 + g.l || g === info.seg[info.seg.length - 1]) { const u = clamp((s - g.s0) / g.l, 0, 1); return { X: lerp(g.a[0], g.b[0], u), Z: lerp(g.a[1], g.b[1], u), dX: (g.b[0] - g.a[0]) / g.l, dZ: (g.b[1] - g.a[1]) / g.l }; } }

export class Crowd {
  // opt.avoid: extra keep-out zones [{ X, Z, r, t0, t1 }] (floor units / story seconds) – a walk that would enter one is skipped
  // opt.density: 0..1 keeps that share of the walkers; opt.place: positions (defaults to PLACE)
  constructor(opt = {}) {
    const place = opt.place || PLACE, d = opt.density ?? 1, z = (p, r) => { const [X, Z] = toXZ(p.x, p.y); return { X, Z, r, t0: -1e9, t1: 1e9 }; };
    this.avoid = [z(place.launcher, 4), z(place.tree, 6), z(place.meet || place.tree, 4), z(place.boyLight, 4), z({ x: place.helen.x, y: place.helen.gy }, 4), ...(opt.avoid || [])];
    this.reunionStart = opt.reunionStart;
    this.reunionRig = { bounds: groupBounds(GROUPS.friendsSix, 'back'), pose: null };
    this.reunionRig.draw = ctx => drawGroup(ctx, GROUPS.friendsSix, this.reunionRig.pose);
    this.walkers = WALKERS.filter((w, i) => i < Math.round(WALKERS.length * d)).map(([grp, path, rev, v, Tp, t0], i) => {
      const P = rev ? PATHS[path].slice().reverse() : PATHS[path], info = pathInfo(P);
      return { slot: 'crowd' + i, grp, G: GROUPS[grp], info, v, Tp: Math.max(Tp, info.L / v + 4), t0, run: GROUPS[grp].m.some(m => LOOK[m[0]].run), skip: new Set(), rig: { bounds: [-24, -110, 24, 4], pose: null } };
    });
    this.standers = STANDERS.map(([grp, X, Z, left], i) => ({ slot: 'crowdS' + i, grp, G: GROUPS[grp], X, Z, left, rig: { bounds: groupBounds(GROUPS[grp], 'side'), pose: null } }));
    for (const w of [...this.walkers, ...this.standers]) { const G = w.G, rig = w.rig; rig.draw = ctx => drawGroup(ctx, G, rig.pose); }
    // pre-check every pass in the first 4 minutes against the keep-out zones
    for (const w of this.walkers) for (let n = Math.floor((-60 - w.t0) / w.Tp); n * w.Tp + w.t0 < 240; n++) {
      const start = n * w.Tp + w.t0;
      for (let s = 0; s <= w.info.L; s += 0.5) { const p = pointAt(w.info, s), t = start + s / w.v; if (this.avoid.some(a => t >= a.t0 && t <= a.t1 && Math.hypot(p.X - a.X, p.Z - a.Z) < a.r)) { w.skip.add(n); break; } }
    }
  }
  // everyone on the promenade at story time T
  at(T) {
    const out = [];
    for (const w of this.walkers) {
      const n = Math.floor((T - w.t0) / w.Tp); if (w.skip.has(n)) continue;
      const s = ((T - w.t0) - n * w.Tp) * w.v; if (s < 0 || s > w.info.L) continue;
      const p = pointAt(w.info, s), [x, gy] = fromXZ(p.X, p.Z);
      // screen-sideways speed in character units vs. walking speed: sideways -> profile view, else front/back view
      const vNom = w.v * CHAR, vSide = (p.dX - p.X * p.dZ / p.Z) * w.v * CHAR, r = Math.abs(vSide) / vNom;
      const view = r > 0.45 ? 'side' : p.dZ > 0 ? 'back' : 'front';
      const cyc = w.run ? 56 / 0.36 : 46 / 0.62;                // body travel per gait cycle (character units)
      const ph = TAU * (T - w.t0) * vNom / cyc + n * 1.7;
      const alpha = clamp((82 - p.Z) / 15, 0, 1) * clamp(s / 1.5, 0, 1) * clamp((w.info.L - s) / 1.5, 0, 1);
      if (alpha < 0.02) continue;
      w.rig.pose = { view, ph, stride: view === 'side' ? clamp(r, 0.45, 1.6) : 1, mode: w.run ? 'run' : 'walk', t: T };
      w.rig.bounds = groupBounds(w.G, view);
      out.push({ slot: w.slot, who: w.grp, x, y: gy, gy, flip: view === 'side' ? vSide < 0 : false, alpha: Math.min(1, alpha), rig: w.rig, lights: this.lightsOf(w, x, gy, view, vSide < 0, ph) });
    }
    const reunion = this.reunionAt(T); if (reunion) out.push(reunion);
    for (const st of this.standers) {
      const [x, gy] = fromXZ(st.X, st.Z);
      st.rig.pose = { view: 'side', ph: T * 1.1 + st.X * 3, stride: 1, mode: 'idle', t: T };
      out.push({ slot: st.slot, who: st.grp, x, y: gy, gy, flip: !!st.left, alpha: 1, rig: st.rig, lights: [] });
    }
    return out;
  }
  reunionAt(T) {
    if (this.reunionStart == null) return null;
    const t = T - this.reunionStart; if (t < 0 || t > 15) return null;
    const smooth = u => { u = clamp(u, 0, 1); return u * u * (3 - 2 * u); };
    let X, Z, view;
    if (t < 4.2) {
      const u = smooth(t / 4.2); X = lerp(1.6, -2.8, u); Z = lerp(20, 12.8, u); view = 'front';
    } else if (t < 5.2) {
      X = -2.8; Z = 12.8; view = 'front';
    } else {
      const u = smooth((t - 5.2) / 8.8); X = lerp(-2.8, -3.8, u); Z = lerp(12.8, 22, u); view = 'back';
    }
    const [x, gy] = fromXZ(X, Z), alpha = smooth(t / 0.6) * (1 - smooth((t - 14.3) / 0.7));
    const arriveDistance = Math.hypot(-2.8 - 1.6, 12.8 - 20);
    const leaveDistance = Math.hypot(-3.8 + 2.8, 22 - 12.8);
    const walked = t < 4.2 ? arriveDistance * smooth(t / 4.2)
      : arriveDistance + (t < 5.2 ? 0 : leaveDistance * smooth((t - 5.2) / 8.8));
    const ph = TAU * walked * CHAR / 46, mode = t < 4.2 || (t >= 5.2 && t < 14) ? 'walk' : 'idle';
    this.reunionRig.pose = { view, ph, stride: 1, mode, t: T };
    this.reunionRig.bounds = groupBounds(GROUPS.friendsSix, view);
    return { slot: 'reunion', who: 'friendsSix', x, y: gy, gy, flip: false, alpha, rig: this.reunionRig, lights: [] };
  }
  // glowing bits as additive sprites: LED balloons, a phone screen. [x, y, gy, size, r, g, b, alpha] in world units
  lightsOf(w, x, gy, view, flip, ph) {
    const us = unitScale(gy), fl = flip ? -1 : 1, L = LOOK[w.G.m[0][0]], k = L.H / 95, out = [];
    if (L.balloons) { const hand = view === 'side' ? [16 * k, -60 * k] : [9 * k, -62 * k];
      for (const [bx, by, r, g, b] of balloonLights(hand, k)) out.push([x + bx * us * fl, gy + by * us, gy - 0.5, 15 * k * us, r, g, b, 0.22 + 0.06 * Math.sin(ph * 0.5 + bx)]); }
    if (L.phone && view !== 'back') out.push([x + (view === 'side' ? 13 : 4) * k * us * fl, gy - 66 * k * us, gy - 0.5, 9 * k * us, 0.7, 0.85, 1, 0.3]);
    return out;
  }
}
export const CROWD_PATHS = PATHS;

// for test pages: draw one group (GROUPS key) in a view ('side' | 'back' | 'front') at gait phase ph, character units
export function crowdSample(ctx, grp, view, ph, mode) {
  const G = GROUPS[grp]; if (!G) return; const L0 = LOOK[G.m[0][0]];
  drawGroup(ctx, G, { view, ph, stride: 1, mode: mode || (G.idle ? 'idle' : L0.run ? 'run' : 'walk'), t: ph });
}
export const CROWD_GROUPS = Object.keys(GROUPS);

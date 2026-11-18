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

const TAU = Math.PI * 2, clamp = (v, a, b) => Math.max(a, Math.min(b, v)), lerp = (a, b, t) => a + (b - a) * t;
const hx = c => { const n = parseInt(c.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255]; };
const shade = (c, k, to = [40, 30, 60]) => { const a = hx(c); return `rgb(${Math.round(a[0] + (to[0] - a[0]) * k)},${Math.round(a[1] + (to[1] - a[1]) * k)},${Math.round(a[2] + (to[2] - a[2]) * k)})`; };
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
  friendA: { H: 88, skin: 2, hair: 'long', hc: '#140D0C', top: 'kurti', tc: '#8C5BB8', bot: 'leggings', bc: '#2A2836', shoe: '#E0D8D0' },
  friendB: { H: 91, skin: 3, hair: 'long', hc: '#110B0A', top: 'kurti', tc: '#D86F45', bot: 'leggings', bc: '#EAE2D6', shoe: '#5A4036' },
  friendC: { H: 87, skin: 0, hair: 'bun', hc: '#120C0B', top: 'blouse', tc: '#2D6E9E', bot: 'saree', bc: '#3D86B8', pallu: '#F2D27A', shoe: '#6A4A3A' },
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
  const bob = idle ? 0.25 * k * Math.sin(ph * 0.5) : run ? -2.2 * k * Math.abs(Math.sin(ph)) : 0.9 * k * (0.5 + 0.5 * Math.cos(2 * ph)) - 0.45 * k;
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
  line(c, back, 4.2 * k, L.top === 'shirt' || L.top === 'kurti' ? cTopB : cSkinB); blob(c, back[2][0], back[2][1], 1.9 * k, 1.9 * k, cSkinB);
  if (L.top === 'shirt' || L.top === 'kurti') line(c, [back[1], back[2]], 3.6 * k, cSkinB);
  const legCol = (i, part) => (L.bot === 'shorts' && part ? (i ? cSkin : cSkinB) : L.bot === 'none' ? (i ? cSkin : cSkinB) : i ? cBot : cBotB);
  for (const lg of legs) { if (lg.i) continue; if (!long) { line(c, [lg.h, lg.kn], 7.4 * k, legCol(0, 0)); line(c, [lg.kn, lg.an], 6 * k, legCol(0, 1)); } else line(c, [lg.kn, lg.an], 4.4 * k, cSkinB); blob(c, lg.an[0] + 2.4 * k, lg.an[1] - 0.8 * k, 3.4 * k, 1.5 * k, shade(L.shoe, 0.3 + dk)); }
  if (L.cane) { const h = front[2]; line(c, [h, [h[0] + 6 * k + Math.sin(ph) * 2 * k, 0]], 1.3 * k, shade('#6A4A30', dk)); }
  // torso and the near leg
  const T = [[-6, -77], [5, -77.5], [7, -67], [5, -55], [6.4, -46], [-6.6, -45.5], [-5.4, -55], [-6.6, -68]].map(([x, y]) => rot([x * k, y * k + bob], hip, lean));
  for (const lg of legs) { if (!lg.i) continue; if (!long) { line(c, [lg.h, lg.kn], 7.6 * k, legCol(1, 0)); line(c, [lg.kn, lg.an], 6.2 * k, legCol(1, 1)); } else line(c, [lg.kn, lg.an], 4.4 * k, cSkin); blob(c, lg.an[0] + 2.4 * k, lg.an[1] - 0.8 * k, 3.5 * k, 1.6 * k, cShoe); }
  if (long) {   // saree / veshti: a long wrap to the ankles following both legs
    const a0 = legs[0].an, a1 = legs[1].an, lo = Math.min(a0[0], a1[0]) - 2.5 * k, hi = Math.max(a0[0], a1[0]) + 2.5 * k;
    polyF(c, [T[5], T[4], [hi, -3 * k], [lerp(lo, hi, 0.5), -2.2 * k], [lo, -3 * k]], cBot);
    line(c, [[lerp(T[4][0], hi, 0.3), -30 * k], [lerp(lo, hi, 0.55), -3.5 * k]], 0.8 * k, cBotB);
  } else if (L.bot === 'none' || L.top === 'frock') {
    polyF(c, [T[6], T[3], [T[4][0] + 6 * k, -27 * k], [T[5][0] - 6 * k, -27 * k]], cTop);
  }
  polyF(c, T, cTop);
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
  // near arm (over the body)
  const sleeve = L.top === 'shirt' || L.top === 'kurti' || L.top === 'jacket';
  line(c, [front[0], front[1]], 4.4 * k, sleeve ? cTop : L.top === 'tee' ? cTop : cSkin); line(c, [front[1], front[2]], 3.8 * k, sleeve ? shade(L.tc, 0.05 + dk) : cSkin);
  if (sleeve) line(c, [lerp2(front[1], front[2], 0.45), front[2]], 3.6 * k, cSkin);
  else if (L.top === 'tee') line(c, [lerp2(front[0], front[1], 0.45), front[1], front[2]], 3.6 * k, cSkin);
  blob(c, front[2][0], front[2][1], 2 * k, 2 * k, cSkin);
  if (L.cup && g.mode === 'idle') { const h = front[2]; c.fillStyle = shade('#F2EEE6', dk); c.fillRect(h[0] - 0.6 * k, h[1] - 3.4 * k, 2.6 * k, 3.2 * k); }
  if (L.phone) { const h = front[2]; c.fillStyle = '#CFE4FF'; c.fillRect(h[0] - 0.4 * k, h[1] - 3 * k, 1.2 * k, 2.4 * k); }
  if (L.balloons) drawBalloonBunch(c, front[2], k, ph);
  return { hip, sh, head, front, back, k };
}
const lerp2 = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t)];
const BAL = [['#FF6FA6', -7, -72], ['#F5C451', 5, -76], ['#7FD0F0', 0, -84], ['#B9A0E8', -11, -84], ['#FF8A5C', 10, -86], ['#9BE08A', -4, -95], ['#FF6FA6', 8, -97]];
function drawBalloonBunch(c, hand, k, ph) {
  const top = [hand[0] + 1 * k, hand[1] - 34 * k];
  line(c, [hand, top], 1.2 * k, '#8A6A44');
  for (const [col, dx, dy] of BAL) { const bx = hand[0] + dx * k + Math.sin(ph * 0.4 + dx) * 0.8 * k, by = hand[1] + (dy + 40) * k;
    line(c, [top, [bx, by + 4.6 * k]], 0.35 * k, 'rgba(230,230,240,.7)'); blob(c, bx, by, 3.8 * k, 4.6 * k, col); blob(c, bx - 1.3 * k, by - 1.8 * k, 0.9 * k, 1.4 * k, 'rgba(255,255,255,.7)'); }
}
function balloonLights(hand, k) { return BAL.map(([col, dx, dy]) => { const a = hx(col); return [hand[0] + dx * k, hand[1] + (dy + 40) * k, a[0] / 255, a[1] / 255, a[2] / 255]; }); }

// one person seen from the front or from behind (walking towards / away from the camera)
function personFront(c, L, g) {
  const k = L.H / 95, run = g.mode === 'run', ph = g.ph, back = g.view === 'back', dk = g.dark || 0, skin = SKIN[L.skin];
  const bob = run ? -2 * k * Math.abs(Math.sin(ph)) : -0.8 * k * Math.abs(Math.cos(ph));
  const hipY = -47.5 * k + bob, cTop = shade(L.tc, 0.08 + dk), cBot = shade(L.bc, 0.12 + dk), cBotB = shade(L.bc, 0.3 + dk), cSkin = shade(skin, dk), hc = shade(L.hc, dk * 0.5);
  const long = L.bot === 'saree' || L.bot === 'veshti';
  for (const s of [-1, 1]) {   // legs: each foot lifts in turn
    const p = Math.sin(ph + (s > 0 ? 0 : Math.PI)), lift = Math.max(0, p) * (run ? 9 : 3.4) * k, fx = s * 3.4 * k, fy = -lift;
    const kn = [s * 3.9 * k, lerp(hipY, fy, 0.5) - lift * 0.3];
    const col = L.bot === 'shorts' || L.bot === 'none' ? cSkin : cBot;
    if (!long) { line(c, [[s * 3.6 * k, hipY], kn], 7.2 * k, L.bot === 'shorts' ? cBot : col); line(c, [kn, [fx, fy]], 5.8 * k, col); }
    else line(c, [[fx, fy - 6 * k], [fx, fy]], 4 * k, cSkin);
    blob(c, fx, fy - 0.6 * k, 2.6 * k, 1.5 * k, shade(L.shoe, dk));
  }
  if (long) polyF(c, [[-7.4 * k, hipY + 2 * k], [7.4 * k, hipY + 2 * k], [8.6 * k, -3 * k], [-8.6 * k, -3 * k]], cBot);
  if (L.bot === 'none' || L.top === 'frock') polyF(c, [[-6.4 * k, -56 * k + bob], [6.4 * k, -56 * k + bob], [10 * k, -27 * k], [-10 * k, -27 * k]], cTop);
  if (L.top === 'kurti') polyF(c, [[-7.6 * k, hipY], [7.6 * k, hipY], [9 * k, -31 * k], [-9 * k, -31 * k]], cTop);
  // arms
  const arm = s => { const p = Math.sin(ph + (s > 0 ? Math.PI : 0)), sh = [s * 8.4 * k, -75 * k + bob];
    let hd = [s * 9.8 * k, -47 * k + bob - Math.max(0, p) * (run ? 9 : 3) * k];
    if (g.holdL && s < 0) hd = g.holdL; if (g.holdR && s > 0) hd = g.holdR;
    if (L.phone && s > 0) hd = [4 * k, -66 * k + bob]; if (L.balloons && s > 0) hd = [9 * k, -62 * k + bob]; if (L.cane && s > 0) hd = [10 * k, -46 * k + bob];
    const el = [lerp(sh[0], hd[0], 0.5) + s * 1.6 * k, lerp(sh[1], hd[1], 0.5)];
    return [sh, el, hd]; };
  const A = [arm(-1), arm(1)], sleeve = L.top === 'shirt' || L.top === 'kurti';
  const body = () => { polyF(c, [[-8.8 * k, -77 * k + bob], [8.8 * k, -77 * k + bob], [6.4 * k, -55 * k + bob], [7.6 * k, hipY], [-7.6 * k, hipY], [-6.4 * k, -55 * k + bob]], cTop);
    if (L.top === 'blouse') { polyF(c, [[-6.4 * k, -58 * k + bob], [6.4 * k, -58 * k + bob], [7.6 * k, hipY + 1 * k], [-7.6 * k, hipY + 1 * k]], cBot); line(c, [[back ? 7 * k : -7 * k, -77 * k + bob], [back ? -6 * k : 6 * k, hipY]], 4 * k, shade(L.pallu || L.bc, dk)); } };
  body();
  for (const a of A) { line(c, [a[0], a[1]], 4.4 * k, sleeve || L.top === 'tee' ? cTop : cSkin); line(c, [a[1], a[2]], 3.8 * k, sleeve ? cTop : cSkin); if (sleeve) line(c, [lerp2(a[1], a[2], 0.5), a[2]], 3.6 * k, cSkin); blob(c, a[2][0], a[2][1], 2 * k, 2 * k, cSkin); }
  if (L.cane) line(c, [A[1][2], [12 * k, 0]], 1.3 * k, shade('#6A4A30', dk));
  if (L.phone && !back) { const h = A[1][2]; c.fillStyle = '#CFE4FF'; c.fillRect(h[0] - 1 * k, h[1] - 2.8 * k, 2 * k, 2.8 * k); }
  if (L.balloons) drawBalloonBunch(c, A[1][2], k, ph);
  // head
  line(c, [[0, -76 * k + bob], [0, -80 * k + bob]], 4.4 * k, cSkin);
  const hy = -87 * k + bob, hr = 6 * k;
  if (back) {
    blob(c, 0, hy, hr * 0.95, hr, hc);
    if (L.hair === 'grey' || L.hair === 'short' || L.hair === 'curly') { blob(c, 0, hy + hr * 0.65, hr * 0.6, hr * 0.3, cSkin); blob(c, 0, hy - hr * 0.2, hr * 0.98, hr * 0.9, hc); }
    if (L.hair === 'braid') line(c, [[0, hy + hr * 0.6], [Math.sin(ph) * 0.8 * k, hy + hr * 3.2], [Math.sin(ph) * 1.4 * k, hy + hr * 4.6]], 2.2 * k, hc);
    if (L.hair === 'long') polyF(c, [[-hr, hy], [hr, hy], [hr * 1.05, hy + hr * 3], [-hr * 1.05, hy + hr * 3]], hc);
    if (L.hair === 'bun') blob(c, 0, hy + hr * 0.2, hr * 0.5, hr * 0.45, shade(L.hc, 0.1));
    if (L.hair === 'pony') line(c, [[0, hy - hr * 0.3], [Math.sin(ph * 2) * 1.6 * k, hy + hr * 1.8]], 2.6 * k, hc);
    if (L.hair === 'pigtails') for (const s of [-1, 1]) blob(c, s * hr * 1.0, hy + hr * 0.5, hr * 0.3, hr * 0.5, hc);
  } else {
    blob(c, 0, hy, hr * 0.9, hr, cSkin);
    blob(c, 0, hy - hr * 0.45, hr * 0.98, hr * 0.62, hc);
    if (L.hair === 'long' || L.hair === 'braid') { line(c, [[-hr * 0.85, hy - hr * 0.2], [-hr * 0.95, hy + hr * 1.6]], 2.4 * k, hc); line(c, [[hr * 0.85, hy - hr * 0.2], [hr * 0.95, hy + hr * (L.hair === 'long' ? 1.6 : 0.6)]], 2.4 * k, hc); }
    if (L.hair === 'pigtails') for (const s of [-1, 1]) blob(c, s * hr * 1.05, hy + hr * 0.4, hr * 0.3, hr * 0.5, hc);
    if (L.hair === 'curly') for (let i = 0; i < 5; i++) blob(c, -hr * 0.8 + i * hr * 0.4, hy - hr * 0.85, hr * 0.3, hr * 0.28, hc);
  }
  return { A, k };
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
  seller: { m: [['seller', 0, 0, 0]], w: 28, tall: true },
  phone: { m: [['phoneGuy', 0, 0, 0]], w: 22 },
  vendor: { m: [['vendor', 0, 0, 0]], w: 22, idle: true },
  cust1: { m: [['cust1', 0, 0, 0]], w: 22, idle: true },
  cust2: { m: [['cust2', 0, 0, 0]], w: 22, idle: true }
};
function drawGroup(c, G, pose) {
  const { view, ph, stride, mode } = pose, side = view === 'side', ms = G.m;
  if (side) {
    // the farther member first (darker), joined hands between them at hip height
    const order = ms.map((m, i) => i).sort((a, b) => ms[a][2] - ms[b][2]);
    const clasp = ms.length === 2 && G.hands ? [(ms[0][2] + ms[1][2]) / 2 * (LOOK[ms[0][0]].H / 95) + 1.5, -40 * LOOK[ms[1][0]].H / 95] : null;
    for (const i of order) { const [lk, , along, po] = ms[i], L = LOOK[lk]; c.save(); c.translate(along, i === order[0] && ms.length > 1 ? -0.6 : 0);
      const near = i === order[order.length - 1], hold = clasp ? [clasp[0] - along, clasp[1]] : null;
      personSide(c, L, { ph: ph + po, stride, mode, dark: near ? 0 : 0.14, hold: near ? hold : null, holdF: near ? null : hold });   // the near one's far hand meets the far one's near hand
      c.restore(); }
    if (G.dog) { const L = LOOK[ms[0][0]], k = L.H / 95; c.save(); c.translate(30, 0); const col = dogSide(c, ph * 1.6, 0.95); c.restore();
      const hand = [16 * k, -47 * k]; line(c, [hand, [lerp(hand[0], col[0] + 30, 0.5), lerp(hand[1], col[1], 0.5) + 3], [col[0] + 30, col[1]]], 0.45, 'rgba(40,30,40,.9)'); }
  } else {
    const back = view === 'back', order = ms.map((m, i) => i);
    if (G.dog) { c.save(); c.translate(-14, 0); dogFront(c, ph, 0.95, back); c.restore(); }
    let holdPts = null;
    if (G.hands && ms.length === 2) { const xm = (ms[0][1] + ms[1][1]) / 2, y = -42 * LOOK[ms[1][0]].H / 95; holdPts = [xm, y]; }
    for (const i of order) { const [lk, across, , po] = ms[i], L = LOOK[lk]; c.save(); c.translate(across, 0);
      const g = { ph: ph + po, mode, view, dark: 0 };
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
      w.rig.pose = { view, ph, stride: view === 'side' ? clamp(r, 0.45, 1.6) : 1, mode: w.run ? 'run' : 'walk' };
      w.rig.bounds = groupBounds(w.G, view);
      out.push({ slot: w.slot, who: w.grp, x, y: gy, gy, flip: view === 'side' ? vSide < 0 : false, alpha: Math.min(1, alpha), rig: w.rig, lights: this.lightsOf(w, x, gy, view, vSide < 0, ph) });
    }
    for (const st of this.standers) {
      const [x, gy] = fromXZ(st.X, st.Z);
      st.rig.pose = { view: 'side', ph: T * 1.1 + st.X * 3, stride: 1, mode: 'idle' };
      out.push({ slot: st.slot, who: st.grp, x, y: gy, gy, flip: !!st.left, alpha: 1, rig: st.rig, lights: [] });
    }
    return out;
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
  drawGroup(ctx, G, { view, ph, stride: 1, mode: mode || (G.idle ? 'idle' : L0.run ? 'run' : 'walk') });
}
export const CROWD_GROUPS = Object.keys(GROUPS);

// Snowki, the magical teddy, guides her through the birthday page: from the countdown to the reveal.
// He finds a free spot beside whatever she should look at, points, helps, reacts when she taps or drags him,
// and hides while the private album or the film is open. The page calls Guide.step(n) and Guide.on(event).
import { Snowki } from './film/js/snowki.js';

const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
const RM = matchMedia('(prefers-reduced-motion: reduce)').matches;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v)), lerp = (a, b, t) => a + (b - a) * t;
const ease = t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const cv = $('#gd'), cx = cv.getContext('2d'), hit = $('#gdHit'), bub = $('#gdSay');
const bear = new Snowki();
const NAME = (typeof CONFIG !== 'undefined' && CONFIG.bear) || 'Snowki';

let W = 0, H = 0, pr = 1, sc = 1;
function size() { pr = Math.min(devicePixelRatio || 1, 2); W = innerWidth; H = innerHeight; cv.width = Math.round(W * pr); cv.height = Math.round(H * pr); sc = clamp(Math.min(W, H) * 0.0021, 0.82, 1.3); }
size();

// ---------------------------------------------------------------- state
const G = {
  x: W / 2, y: H + 200, vis: 0, visTo: 0, step: null, home: null, homeAct: ['idle', {}], fl: null, drag: null, idle: 6, react: 0,
  trail: [], sayUntil: 0, last: performance.now(), lastTap: 0, gazeP: null, fidget: [], stepT: 0, hidden: false, after: []
};
const box = (x = G.x, y = G.y) => [x - 40 * sc, y - 112 * sc, x + 40 * sc, y + 6 * sc];

// ---------------------------------------------------------------- finding a free spot beside an element
function obstacles(sec) {
  const els = sec ? [...sec.querySelectorAll('h1,p,button,.btn,.link,.cd,.env,.card,form,input,svg.clock,label,figure,.paper')] : [];
  const out = [], rg = document.createRange();
  for (const e of els.concat([$('#mute'), $('.dots'), $('#star')])) {
    if (!e || e.closest('[hidden]')) continue;
    if (/^(P|H1)$/.test(e.tagName)) { rg.selectNodeContents(e); for (const r of rg.getClientRects()) if (r.width > 2 && r.height > 2) out.push(r); continue; }   // the words, not the empty box
    const r = e.getBoundingClientRect(); if (r.width > 2 && r.height > 2) out.push(r);
  }
  return out;
}
function overlap(b, r) { const w = Math.min(b[2], r.right) - Math.max(b[0], r.left), h = Math.min(b[3], r.bottom) - Math.max(b[1], r.top); return w > 0 && h > 0 ? w * h : 0; }
function spotNear(el, prefs) {
  const r = el.getBoundingClientRect(), sec = $('.s.on'), obs = obstacles(sec), bw = 80 * sc, bh = 118 * sc, m = 10;
  const cand = { right: [r.right + bw / 2 + m, r.bottom], left: [r.left - bw / 2 - m, r.bottom], below: [r.left + r.width / 2, r.bottom + bh + m], belowR: [r.right - bw / 2, r.bottom + bh + m],
    belowL: [r.left + bw / 2, r.bottom + bh + m], above: [r.left + r.width / 2, r.top - m], aboveR: [r.right - bw * 0.45, r.top + 4], aboveL: [r.left + bw * 0.45, r.top + 4],
    farR: [W - bw / 2 - 14, Math.min(H - 70, r.bottom + bh * 0.3)], farL: [bw / 2 + 14, Math.min(H - 70, r.bottom + bh * 0.3)],
    onBR: [r.right - bw * 0.3, r.bottom + 6], onBL: [r.left + bw * 0.3, r.bottom + 6],
    botR: [W - bw / 2 - 16, H - 46], botL: [bw / 2 + 16, H - 46], botC: [W / 2, H - 46] };
  let best = null;
  (prefs.concat(['right', 'left', 'below', 'belowR', 'belowL', 'onBR', 'farR', 'farL', 'botR', 'botL', 'botC'])).forEach((k, i) => {
    const p = cand[k]; if (!p) return; const b = box(p[0], p[1]);
    let cost = i * 250; for (const o of obs) cost += overlap(b, o) * (o.left === r.left && o.top === r.top && o.width === r.width ? 0.4 : 3);
    const out = Math.max(0, 8 - b[0]) + Math.max(0, b[2] - (W - 8)) + Math.max(0, 8 - b[1]) + Math.max(0, b[3] - (H - 8)); cost += out * 4000;
    if (!best || cost < best.cost) best = { cost, k, p };
  });
  return { el, dx: best.p[0] - r.left, dy: best.p[1] - r.top };
}
function slotOf(el) { const r = el.getBoundingClientRect(); return { el, dx: r.width / 2, dy: r.height * 0.97, slot: true }; }
function homePos() { const h = G.home; if (!h) return null; const r = h.el.getBoundingClientRect(); if (!r.width && !r.height) return null; return [r.left + h.dx, r.top + h.dy]; }

// ---------------------------------------------------------------- speech bubble
function say(text, ms = 3600) {
  if (!text) { bub.classList.remove('on'); G.sayUntil = 0; return; }
  bub.textContent = text; bub.classList.add('on'); G.sayUntil = performance.now() + ms; placeBubble();
}
function placeBubble() {
  const b = box(), w = bub.offsetWidth, h = bub.offsetHeight, mx = (b[0] + b[2]) / 2;
  // above his head unless that covers the words on screen; then beside him, then below
  if (!G.bubObs || performance.now() - G.bubObsT > 500) { G.bubObs = obstacles($('.s.on')); G.bubObsT = performance.now(); }
  const opts = [[mx - w / 2, b[1] - h - 4, 'up'], [b[2] + 4, b[1] + 6 * sc, 'side'], [b[0] - w - 4, b[1] + 6 * sc, 'side'], [mx - w / 2, b[3] + 6, 'below']];
  let best = null;
  for (const [x0, y0, k] of opts) { const x = clamp(x0, 8, W - w - 8), y = clamp(y0, 8, H - h - 8), bb = [x, y, x + w, y + h]; let c = 0; for (const o of G.bubObs) c += overlap(bb, o); c += Math.abs(x - x0) * 30 + Math.abs(y - y0) * 30;
    if (!best || c < best.c - 1) best = { c, x, y, k }; }
  bub.style.transform = `translate(${best.x}px,${best.y}px)`; bub.classList.toggle('below', best.k === 'below'); bub.classList.toggle('side', best.k === 'side');
  bub.style.setProperty('--tx', clamp(mx - best.x, 14, w - 14) + 'px');
}

// ---------------------------------------------------------------- moving
function flyTo(p, then) {
  if (!p) return;
  if (G.vis < 0.05 || RM) { G.x = p[0]; G.y = p[1]; poof(); G.fl = null; then && then(); return; }
  const d = Math.hypot(p[0] - G.x, p[1] - G.y);
  if (d < 6) { then && then(); return; }
  G.fl = { a: [G.x, G.y], b: p, c: [(G.x + p[0]) / 2 + (p[0] - G.x) * 0.1, Math.min(G.y, p[1]) - Math.min(170, d * 0.45)], t: 0, dur: clamp(d / 650, 0.75, 1.7), then };
  bear.act('fly'); bear.magic = 1;
}
function poof() { for (let i = 0; i < 26; i++) { const a = Math.random() * 6.283, v = 40 + Math.random() * 140; G.trail.push({ x: G.x, y: G.y - 55 * sc, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 30, life: 0.6 + Math.random() * 0.6, s: 2 + Math.random() * 3.5 }); } bear.magic = 1; setTimeout(() => (bear.magic = G.step === 'c' ? 0.35 : 0.25), 900); }
function settle() { const [a, o] = G.homeAct; bear.act(a, { ...o, restart: true }); bear.s.squash.v += 2.4; G.idle = 7 + Math.random() * 5; bear.magic = 0.25; }
function goHome(act, opts = {}) { G.homeAct = [act, opts]; const p = homePos(); if (G.fl) { G.fl.b = p || G.fl.b; G.fl.then = settle; } else flyTo(p, settle); }
function later(ms, f) { const s = G.step; G.after.push(setTimeout(() => { if (G.step === s) f(); }, ms)); }

// ---------------------------------------------------------------- what he does on each screen
const days = () => +(($('#cd') || {}).textContent || 0);
const STEPS = {
  c() { G.home = spotNear($('.cd'), ['below', 'belowR', 'right', 'left']); G.fidget = ['kick', 'yawn', 'wave']; goHome('sleep');
    later(2600, () => { bear.act('yawn'); later(1900, () => { bear.act('wave'); say(days() > 1 ? `${days()} more sleeps… I’m keeping your surprise safe ✦` : 'Almost time ✦'); later(2600, () => bear.act('kick')); }); }); },
  0() { const env = $('#env'); G.home = spotNear(env, ['right', 'left', 'onBR', 'aboveR']); G.fidget = ['wave', 'kick'];
    goHome('point', { dir: dirTo('#seal') }); later(1300, () => say('Press and hold the heart ♡')); },
  1() { G.home = slotOf($('.s[data-n="1"] .bear')); G.fidget = ['hug', 'kick']; goHome('hug', { expr: 'soft' }); later(2400, () => { bear.burstHearts(6); bear.act('hug', { expr: 'love' }); }); },
  p() { G.home = spotNear($('#sp h1'), ['below', 'belowR', 'right', 'left']); G.fidget = ['think', 'kick']; goHome('think'); later(1400, () => say('Only if you want to ♡')); },
  2() { G.home = spotNear($('.s[data-n="2"] .btn'), ['right', 'left', 'below']); G.fidget = ['kick', 'wave']; goHome('hold', { hold: 'heart' }); },
  3() { G.home = spotNear($('.clock'), ['right', 'left', 'below']); G.fidget = ['think']; goHome('think'); },
  4() { G.home = slotOf($('.s[data-n="4"] .bear')); G.fidget = ['hug', 'kick']; goHome('hold', { hold: 'heart' }); },
  5() { G.home = slotOf($('.s[data-n="5"] .bear')); G.fidget = ['kick']; goHome('idle'); },
  6() { hide(); },
  7() { G.home = spotNear($('.s[data-n="7"] h1'), ['right', 'left', 'below']); G.fidget = []; goHome('cheer'); later(900, () => { say('Happy birthday! ♡', 3000); bear.burstHearts(8); });
    later(4200, () => { G.home = slotOf($('.trio .tb svg')); G.fidget = ['hug', 'kick', 'wave']; goHome('hug', { expr: 'soft' }); later(2600, () => bear.burstHearts(5)); }); }
};
function dirTo(sel) { const e = $(sel), p = homePos(); if (!e || !p) return [1, 0]; const r = e.getBoundingClientRect(); return [r.left + r.width / 2 - (p[0] + 0), r.top + r.height / 2 - (p[1] - 40 * sc)]; }
const EVENTS = {
  hold() { if (G.step !== 0) return; bear.act('push', { dir: dirTo('#seal') }); say('Hold… hold… ♡', 1600); },
  release() { if (G.step !== 0) return; bear.act('point', { dir: dirTo('#seal'), expr: 'oops' }); later(900, () => bear.act('point', { dir: dirTo('#seal') })); },
  open() { if (G.step !== 0) return; say(''); bear.act('cheer'); bear.burstHearts(7); poofAt(0.5); },
  ask() { bear.act('cover'); say('I won’t peek ♡'); },
  wrong() { bear.act('peek', { expr: 'oops' }); later(1500, () => bear.act('cover')); },
  album(open) { if (open) hide(); else if (G.step != null) show(); },
  wish() { if (G.step !== 5) return; bear.act('hold', { hold: 'star' }); later(1500, () => bear.act('idle')); },
  to6() { if (G.step !== 5) return; G.home = spotNear($('#to6'), ['right', 'left', 'below']); goHome('point', { dir: dirTo('#to6') }); later(1200, () => say('Make a wish with me ✦')); },
  clockStill() { if (G.step !== 3) return; bear.act('nod'); later(1400, () => bear.act('idle', { expr: 'soft' })); }
};
function poofAt(k) { for (let i = 0; i < 18 * k + 6; i++) { const a = Math.random() * 6.283, v = 60 + Math.random() * 120; G.trail.push({ x: G.x, y: G.y - 70 * sc, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 40, life: 0.7 + Math.random() * 0.5, s: 2 + Math.random() * 3 }); } }
function hide() { G.hidden = true; say(''); if (G.vis > 0.05 && !RM) { G.fl = { a: [G.x, G.y], b: [G.x + 60, -160], c: [G.x - 40, G.y - 120], t: 0, dur: 0.8, then: () => { G.visTo = 0; G.vis = 0; } }; bear.act('fly'); bear.magic = 1; } else { G.visTo = 0; G.vis = 0; } }
function show() { G.hidden = false; G.visTo = 1; }

function step(n) {
  G.after.forEach(clearTimeout); G.after = []; say('');
  G.step = n; G.stepT = 0; G.react = 0; bear.express(null);
  if (n === 6 || window.__albumOpen) { hide(); return; }
  const wasHidden = G.vis < 0.05; show(); if (wasHidden) G.vis = 0.001;
  // wait a frame so the new screen has its layout
  requestAnimationFrame(() => requestAnimationFrame(() => { if (G.step === n && STEPS[n]) STEPS[n](); }));
}

// ---------------------------------------------------------------- touch: tap him, or pick him up and drop him
const TAPS = [['giggle', 'Hehe! ♡'], ['spin', 'Wheee!'], ['cheer', ''], ['hug', '♡'], ['dance', ''], ['wave', 'Hi! ♡'], ['shy', '']];
let tapI = 0;
function react() {
  const now = performance.now(); if (now - G.lastTap < 450) return; G.lastTap = now;
  const [a, line] = TAPS[tapI++ % TAPS.length]; bear.act(a, { restart: true }); if (a === 'hug' || a === 'shy') bear.burstHearts(4);
  if (G.step === 'c' && tapI % 3 === 1) say(days() > 1 ? `${days()} more sleeps ✦` : 'Almost ✦', 2400); else if (line) say(line, 1600);
  poofAt(0.4); G.react = a === 'spin' ? 0.95 : 1.6; G.idle = 8;
}
hit.addEventListener('pointerdown', e => { if (G.fl || G.vis < 0.5) return; e.preventDefault(); hit.setPointerCapture && hit.setPointerCapture(e.pointerId); G.drag = { id: e.pointerId, sx: e.clientX, sy: e.clientY, ox: G.x - e.clientX, oy: G.y - e.clientY, moved: false, lx: e.clientX, ly: e.clientY, lt: performance.now(), vx: 0, vy: 0 }; });
hit.addEventListener('pointermove', e => {
  const d = G.drag; if (!d || e.pointerId !== d.id) return;
  if (!d.moved && Math.hypot(e.clientX - d.sx, e.clientY - d.sy) > 7) { d.moved = true; bear.act('dangle', { restart: true }); say(''); }
  if (d.moved) { const now = performance.now(), dt = Math.max(1, now - d.lt) / 1000; d.vx = lerp(d.vx, (e.clientX - d.lx) / dt, 0.4); d.vy = lerp(d.vy, (e.clientY - d.ly) / dt, 0.4); d.lx = e.clientX; d.ly = e.clientY; d.lt = now;
    G.x = clamp(e.clientX + d.ox, 30, W - 30); G.y = clamp(e.clientY + d.oy - 30 * sc, 120 * sc, H - 10); bear.vel = [d.vx, d.vy]; }
});
function drop(e) {
  const d = G.drag; if (!d || (e && e.pointerId !== d.id)) return; G.drag = null;
  if (!d.moved) { react(); return; }
  say('Wheee!', 1200); const p = homePos(); later(250, () => flyTo(p, settle));
}
hit.addEventListener('pointerup', drop); hit.addEventListener('pointercancel', drop);
hit.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); react(); } });
addEventListener('pointermove', e => { G.gazeP = [e.clientX, e.clientY]; });
addEventListener('resize', () => { size(); if (G.step != null && STEPS[G.step] && G.step !== 6) { const s = G.step; G.after.forEach(clearTimeout); G.after = []; STEPS[s](); } });

// ---------------------------------------------------------------- loop
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - G.last) / 1000); G.last = now; if (document.hidden) return;
  G.vis = G.visTo > G.vis ? Math.min(1, G.vis + dt * 2.5) : Math.max(0, G.vis - dt * 3);
  if (window.__albumOpen && !G.hidden) hide();
  // flight along an arc
  let vel = [0, 0];
  if (G.fl) { const f = G.fl; f.t += dt / f.dur; const u = ease(clamp(f.t, 0, 1)), q = 1 - u;
    const nx = q * q * f.a[0] + 2 * q * u * f.c[0] + u * u * f.b[0], ny = q * q * f.a[1] + 2 * q * u * f.c[1] + u * u * f.b[1];
    vel = [(nx - G.x) / Math.max(dt, 1e-3), (ny - G.y) / Math.max(dt, 1e-3)]; G.x = nx; G.y = ny;
    if (Math.random() < 0.9) G.trail.push({ x: G.x + (Math.random() - 0.5) * 20 * sc, y: G.y - 50 * sc + (Math.random() - 0.5) * 30 * sc, vx: -vel[0] * 0.08 + (Math.random() - 0.5) * 30, vy: -vel[1] * 0.08 + (Math.random() - 0.5) * 30, life: 0.5 + Math.random() * 0.6, s: 1.5 + Math.random() * 3 });
    if (f.t >= 1) { G.fl = null; f.then && f.then(); } }
  else if (!G.drag && G.home && !G.hidden) { // follow the anchor (scrolling, layout changes)
    const p = homePos(); if (p) { G.x = lerp(G.x, p[0], Math.min(1, dt * 10)); G.y = lerp(G.y, p[1], Math.min(1, dt * 10)); }
  }
  // idle life: little fidgets, then back to the screen's pose
  if (!G.fl && !G.drag && G.vis > 0.5) {
    if (G.react > 0) { G.react -= dt; if (G.react <= 0) settle(); }
    else if ((G.idle -= dt) < 0 && G.fidget.length && !RM) { const f = G.fidget[(Math.random() * G.fidget.length) | 0]; bear.act(f, { restart: true }); G.react = f === 'yawn' ? 3 : 2.6; G.idle = 8 + Math.random() * 6; }
  }
  // eyes follow her finger / cursor
  if (G.gazeP && !G.drag) { const hx = G.x, hy = G.y - 66 * sc; bear.look((G.gazeP[0] - hx) / (W * 0.4), (G.gazeP[1] - hy) / (H * 0.4)); }
  bear.update(dt, { vel: G.drag ? bear.vel : vel, magic: bear.magic });
  // draw
  cx.setTransform(pr, 0, 0, pr, 0, 0); cx.clearRect(0, 0, W, H);
  if (G.vis > 0.01) {
    cx.save(); cx.globalAlpha = G.vis; cx.translate(G.x, G.y); const k = sc * (0.6 + 0.4 * G.vis); cx.scale(k, k); bear.draw(cx, { aura: true }); cx.restore();
  }
  // sparkle trail
  if (G.trail.length) {
    cx.globalCompositeOperation = 'lighter';
    for (const p of G.trail) { p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 20 * dt; p.vx *= 0.97;
      const a = clamp(p.life * 1.6, 0, 1); cx.fillStyle = `rgba(255,${220 + ((p.s * 9) | 0) % 30},${150 + ((p.s * 31) | 0) % 90},${a})`;
      cx.beginPath(); for (let k = 0; k < 8; k++) { const ang = k * Math.PI / 4 + p.life * 3, rr = k % 2 ? p.s * 0.3 : p.s; cx.lineTo(p.x + Math.cos(ang) * rr, p.y + Math.sin(ang) * rr); } cx.fill(); }
    cx.globalCompositeOperation = 'source-over'; G.trail = G.trail.filter(p => p.life > 0);
  }
  // hit area + bubble follow him
  const b = box(); hit.style.transform = `translate(${b[0]}px,${b[1]}px)`; hit.style.width = (b[2] - b[0]) + 'px'; hit.style.height = (b[3] - b[1]) + 'px';
  hit.style.pointerEvents = G.vis > 0.5 && !G.hidden ? 'auto' : 'none';
  if (G.sayUntil) { if (now > G.sayUntil || G.vis < 0.3) say(''); else placeBubble(); }
}
requestAnimationFrame(frame);

window.Guide = { step, on(e, a) { EVENTS[e] && EVENTS[e](a); }, bear };
document.documentElement.classList.add('guide');
hit.setAttribute('aria-label', `${NAME}, the teddy. Tap to play`);
if (window.__scr) { const c = window.__scr().cur; if (c != null) step(c); }

// Snowki, the magical teddy, guides her through the birthday page: from the countdown to the reveal.
// He finds a free spot beside whatever she should look at, points, helps, reacts when she taps or drags him,
// and hides while the private album or the film is open. The page calls Guide.step(n) and Guide.on(event).
import { Snowki } from './film/js/snowki.js';
import { Jessi } from './film/js/jessi.js';

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
function placeBubble(el = bub) {
  const b = box(), w = el.offsetWidth, h = el.offsetHeight, mx = (b[0] + b[2]) / 2;
  // above his head unless that covers the words on screen; then beside him, then below
  if (!G.bubObs || performance.now() - G.bubObsT > 500) { G.bubObs = obstacles($('.s.on')); G.bubObsT = performance.now(); if (J.dream > 0.1 && J.L) { const c = J.L.cloud; G.bubObs.push({ left: c[0], top: c[1], right: c[2], bottom: c[3] }); } }
  const opts = [[mx - w / 2, b[1] - h - 4, 'up'], [b[2] + 4, b[1] + 6 * sc, 'side'], [b[0] - w - 4, b[1] + 6 * sc, 'side'], [mx - w / 2, b[3] + 6, 'below']];
  let best = null;
  for (const [x0, y0, k] of opts) { const x = clamp(x0, 8, W - w - 8), y = clamp(y0, 8, H - h - 8), bb = [x, y, x + w, y + h]; let c = 0; for (const o of G.bubObs) c += overlap(bb, o); c += Math.abs(x - x0) * 30 + Math.abs(y - y0) * 30;
    if (!best || c < best.c - 1) best = { c, x, y, k }; }
  el.style.transform = `translate(${best.x}px,${best.y}px)`; el.classList.toggle('below', best.k === 'below'); el.classList.toggle('side', best.k === 'side');
  el.style.setProperty('--tx', clamp(mx - best.x, 14, w - 14) + 'px');
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
  c() { stageHome(); G.fidget = ['kick', 'wave'];
    if (J.intro) { goHome('kick'); if (J.called && J.state === 'off') later(900, () => pupEnter(true)); else if (!J.called) later(900, askJessi); return; }
    J.intro = true; goHome('sleep');
    later(2400, () => { bear.act('yawn'); later(1800, () => { bear.act('wave'); say('Hey, hi Helen! It’s me, Snowki ♡', 3400);
      later(3600, () => { bear.act('kick'); say(days() > 1 ? `${days()} more sleeps… let’s wait together ✦` : 'Almost time ✦', 2800); later(3000, askJessi); }); }); }); },
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
  G.step = n; G.stepT = 0; G.react = 0; bear.express(null); if (n !== 'c') { pupLeave(); hideAsk(); }
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
  if (G.step === 'c' && J.asked && !J.called && askEl.hidden) { askJessi(); return; }
  const [a, line] = TAPS[tapI++ % TAPS.length]; bear.act(a, { restart: true }); if (a === 'hug' || a === 'shy') bear.burstHearts(4);
  if (G.step === 'c' && tapI % 4 === 1) say(days() > 1 ? `${days()} more sleeps ✦` : 'Almost ✦', 2400); else if (line) say(line, 1600);
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
addEventListener('resize', () => { size(); if (G.step === 'c') { stageHome(); return; } if (G.step != null && STEPS[G.step] && G.step !== 6) { const s = G.step; G.after.forEach(clearTimeout); G.after = []; STEPS[s](); } });

// ---------------------------------------------------------------- the countdown: Snowki says hi and calls Jessi. She runs in from the left, barks,
// shows off her tricks, yawns, falls asleep, and dreams of Helen in a little cloud. Tap her for a trick, tap the cloud for the next dream.
const pup = new Jessi(), dPup = new Jessi(), dBear = new Snowki();
const askEl = $('#gdAsk'), pupHit = $('#gdPup'), dreamHit = $('#gdDream');
const J = { state: 'off', x: -300, face: 1, q: [], qt: 0, woofs: [], dream: 0, dreamTo: 0, scene: 0, sceneT: 0, called: false, asked: false, intro: false, L: null };
function stage() {
  const cd = $('.cd').getBoundingClientRect(), ps = clamp(sc * 1.8, 1.4, 2.3);
  const gy = clamp(Math.max(cd.bottom + 128 * sc, H - 96 * sc), cd.bottom + 96 * sc, H - 30);
  const L = { gy, ps, snowX: W / 2 + 48 * sc, pupX: W / 2 - 40 * sc - 32 * ps };
  // the dream cloud floats above Jessi, kept clear of the words on screen
  const cw = 250 * clamp(sc, 0.88, 1.25), ch = cw * 0.66, obs = obstacles($('.s[data-n="c"]'));
  let mx = L.pupX + 6 * ps; const bot = gy - 54 * ps - 14 * sc, rect = () => [mx - cw / 2, bot - ch, mx + cw / 2, bot];
  for (let i = 0; i < 80; i++) { const r = rect(); let o = 0; for (const b of obs) o += overlap(r, b); if (!o || r[0] < 10) break; mx -= 8; }
  mx = clamp(mx, cw / 2 + 8, W - cw / 2 - 8);
  L.cloud = rect(); return (J.L = L);
}
function stageHome() { const L = stage(); G.home = { el: $('.s[data-n="c"]'), dx: L.snowX, dy: L.gy }; return L; }

// a box with a question and buttons, next to Snowki
function ask(text, btns) {
  askEl.innerHTML = ''; const p = document.createElement('p'); p.textContent = text; askEl.appendChild(p);
  const row = document.createElement('div'); row.className = 'r';
  for (const [label, f, quiet] of btns) { const b = document.createElement('button'); b.type = 'button'; b.textContent = label; if (quiet) b.className = 'q'; b.onclick = () => { hideAsk(); f(); }; row.appendChild(b); }
  askEl.appendChild(row); askEl.hidden = false; requestAnimationFrame(() => { askEl.classList.add('on'); placeBubble(askEl); }); setTimeout(() => { const b = askEl.querySelector('button'); if (b && !askEl.hidden) b.focus({ preventScroll: true }); }, 80);
}
function hideAsk() { askEl.classList.remove('on'); askEl.hidden = true; }
function askJessi() { if (J.called) return; J.asked = true; say(''); G.homeAct = ['kick', {}]; bear.act('shy', { restart: true }); G.react = 0; G.idle = 30; ask('Can I call Jessi? 🐾', [['OK ♡', callJessi], ['Not now', notNow, true]]); }
function notNow() { bear.act('nod', { restart: true }); G.react = 1.4; say('Okay! Tap me whenever you want her ♡', 3200); }
function callJessi() { J.called = true; unlockAudio(); bear.act('call', { restart: true }); G.react = 0; G.idle = 99; say('Jessiii! ♡', 1500); later(650, () => pupEnter(false)); }
function pupEnter(short) {
  stage(); J.state = 'enter'; J.x = -70 * J.L.ps; J.face = 1; J.dreamTo = 0; pup.act('run', { restart: true, vx: PUP_RUN });
  J.short = short;
}
const TRICKS = { bark: ['bark', 1.3, 'cheer'], flip: ['flip', 1.15, 'clap'], spin: ['spin', 1.3, 'giggle'], roll: ['roll', 1.45, 'clap'], bow: ['bow', 1.3, 'dance'], paw: ['paw', 1.9, 'clap', 'Good girl, Jessi! ♡'],
  lie: ['lie', 1.0, 'idle'], yawn: ['yawn', 1.6, 'yawn'], sleep: ['sleep', 0, 'shh', 'Shh… she’s dreaming of you ♡'], wake: ['wake', 0.7, 'idle'] };
const SHOW = ['bark', 'flip', 'spin', 'roll', 'bow', 'paw', 'lie', 'yawn', 'sleep'];
function queue(names) { J.q = names.filter(n => !(RM && ['flip', 'spin', 'roll'].includes(n))).map(n => TRICKS[n]); J.qt = 0; J.state = 'show'; nextTrick(); }
function nextTrick() {
  const t = J.q.shift(); if (!t) return; const [a, d, b, line] = t;
  pup.act(a, { restart: true }); J.qt = d || 1e9; if (a === 'bark') woof(2);
  if (b) { bear.act(b, { restart: true }); G.react = 0; G.idle = 99; } if (line) say(line, 3400);
  if (a === 'sleep') { J.state = 'sleep'; G.idle = 6; G.homeAct = ['kick', {}]; }
}
function tapPup() {
  if (!['show', 'sleep'].includes(J.state)) return;
  const pool = RM ? ['paw', 'bow'] : ['flip', 'spin', 'roll', 'bow', 'paw'], pick = pool[(Math.random() * pool.length) | 0];
  J.dreamTo = 0; queue((J.state === 'sleep' ? ['wake'] : []).concat(['bark', pick, 'lie', 'yawn', 'sleep']));
}
function pupLeave() { if (J.state === 'off') return; J.dreamTo = 0; J.state = 'leave'; J.face = 1; pup.act('run', { restart: true, vx: PUP_RUN }); hideAsk(); }
const PUP_RUN = 220;   // her running speed in rig units/s: the rig plants each paw on the page at exactly this speed

// woof: floating words and (when her sound is on) a small synthesised bark
let AC = null;
const soundOn = () => { const m = $('#mute'); return !!m && m.getAttribute('aria-pressed') === 'true'; };
function unlockAudio() { if (!soundOn()) return; try { AC = AC || new (window.AudioContext || window.webkitAudioContext)(); AC.resume(); } catch (e) { AC = null; } }
function woof(n) {
  for (let i = 0; i < n; i++) setTimeout(() => J.woofs.push({ t: 0, k: Math.random() }), i * 280);
  if (!soundOn()) return; unlockAudio(); if (!AC) return;
  const t0 = AC.currentTime + 0.03;
  for (let i = 0; i < n; i++) { const t = t0 + i * 0.28, o = AC.createOscillator(), f = AC.createBiquadFilter(), g = AC.createGain();
    o.type = 'sawtooth'; o.frequency.setValueAtTime(700, t); o.frequency.exponentialRampToValueAtTime(300, t + 0.12); f.type = 'bandpass'; f.frequency.value = 1150; f.Q.value = 1.3;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.22, t + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.15);
    o.connect(f); f.connect(g); g.connect(AC.destination); o.start(t); o.stop(t + 0.17); }
}
function stepPup(dt) {
  if (J.state === 'off') return; const L = J.L || stage();
  if (J.state === 'enter') { J.x += PUP_RUN * L.ps * dt; if (J.x >= L.pupX) { J.x = L.pupX; pup.bump(40); queue(J.short ? ['bark', 'lie', 'yawn', 'sleep'] : SHOW); } }
  else if (J.state === 'leave') { J.x += PUP_RUN * L.ps * dt; if (J.x > W + 160) { J.state = 'off'; } }
  else { J.x = lerp(J.x, L.pupX, Math.min(1, dt * 4)); if (J.state === 'show' && (J.qt -= dt) <= 0) nextTrick(); }
  if (J.state === 'sleep' && pup.name === 'sleep' && pup.a > 1.3 && !J.dreamTo) { J.dreamTo = 1; J.scene = 0; J.sceneT = 0; setDream(); }
  pup.update(dt);
  for (const w of J.woofs) w.t += dt; J.woofs = J.woofs.filter(w => w.t < 1);
  J.dream = J.dreamTo > J.dream ? Math.min(1, J.dream + dt * 1.1) : Math.max(0, J.dream - dt * 2.5);
  if (J.dream > 0) { J.sceneT += dt; if (J.sceneT > 5.4) nextDream(); dPup.update(dt); dBear.update(dt); }
}

// ---- the dream: five little scenes of Jessi and Helen
const DREAMS = ['beach', 'ball', 'cuddle', 'sleep', 'trio'];
function setDream() { const s = DREAMS[J.scene]; dPup.act({ beach: 'run', ball: 'stand', cuddle: 'pet', sleep: 'sleep', trio: 'happy' }[s], { restart: true, speed: 15 }); dBear.act('idle', { expr: 'happy' }); }
function nextDream() { J.scene = (J.scene + 1) % DREAMS.length; J.sceneT = 0; setDream(); }
const HC = { skin: '#D39A74', hair: '#1E1424', dress: '#9CCBF2', dressD: '#6FA0D8', collar: '#FFFDF8', bow: '#FF8DB3', blush: 'rgba(255,120,150,.55)' };
function helenMini(x, y, k, pose, t) {   // a tiny chibi Helen standing on (x, y); k = px per unit (about 34 units tall)
  const c = cx; c.save(); c.translate(x, y); c.scale(k, k); c.lineCap = c.lineJoin = 'round';
  if (pose === 'lie') { c.translate(-2, -4); c.rotate(-Math.PI / 2); c.translate(0, 4); }
  const run = pose === 'run', ph = t * 9, sw = run ? Math.sin(ph) : 0;
  // hair behind
  c.fillStyle = HC.hair; c.beginPath(); c.moveTo(-5.6, -26); c.quadraticCurveTo(-7.6 - (run ? 2 : 0), -14, -5 - (run ? 3 + sw : 0), -10); c.lineTo(4.6 - (run ? 2 : 0), -10.5); c.quadraticCurveTo(7, -16, 5.6, -26); c.fill();
  // legs
  c.strokeStyle = HC.skin; c.lineWidth = 2;
  if (pose === 'sit') { c.beginPath(); c.moveTo(-1, -5); c.lineTo(5, -4); c.lineTo(6.5, 0); c.moveTo(1, -5); c.lineTo(7, -3.6); c.lineTo(8.8, 0); c.stroke(); }
  else { c.beginPath(); c.moveTo(-1.5, -7); c.lineTo(-1.5 - sw * 2.6, 0 - Math.max(0, sw) * 1.6); c.moveTo(1.5, -7); c.lineTo(1.5 + sw * 2.6, 0 - Math.max(0, -sw) * 1.6); c.stroke();
    c.fillStyle = '#FFF4F8'; for (const s of [-1, 1]) { c.beginPath(); c.ellipse(s * 1.5 + s * sw * 2.6 + 0.6, -0.2 - (s < 0 ? Math.max(0, sw) : Math.max(0, -sw)) * 1.6, 1.4, 0.8, 0, 0, 7); c.fill(); } }
  // dress
  const dg = c.createLinearGradient(-6, 0, 6, 0); dg.addColorStop(0, HC.dress); dg.addColorStop(1, HC.dressD); c.fillStyle = dg;
  c.beginPath(); c.moveTo(-3.6, -19); c.lineTo(3.6, -19); c.lineTo(pose === 'sit' ? 7 : 6.2 + sw, pose === 'sit' ? -4 : -7.4); c.quadraticCurveTo(0, pose === 'sit' ? -2.6 : -5.8, pose === 'sit' ? -4.5 : -6.2 + sw, pose === 'sit' ? -5 : -7.4); c.closePath(); c.fill();
  c.fillStyle = HC.collar; c.beginPath(); c.ellipse(0, -18.8, 2.6, 1.1, 0, 0, 7); c.fill(); c.fillStyle = HC.bow; c.fillRect(-3.4, -13.4, 6.8, 1.1);
  // arms
  c.strokeStyle = HC.skin; c.lineWidth = 1.7; c.beginPath();
  if (pose === 'throw') { const a = (t % 1.8) / 1.8, up = a < 0.4 ? a / 0.4 : Math.max(0, 1 - (a - 0.4) / 0.25); c.moveTo(3, -18); c.lineTo(3 + Math.cos(-0.4 - up * 1.8) * 6, -18 + Math.sin(-0.4 - up * 1.8) * 6); c.moveTo(-3, -18); c.lineTo(-5, -12); }
  else if (pose === 'hold' || pose === 'sit') { c.moveTo(-3, -18); c.lineTo(1, -13); c.moveTo(3, -18); c.lineTo(5.6, -13.5); }
  else { c.moveTo(-3, -18); c.lineTo(-4.4 + sw * 2.4, -12); c.moveTo(3, -18); c.lineTo(4.4 - sw * 2.4, -12); }
  c.stroke();
  // head, bangs, bow, face
  c.fillStyle = HC.skin; c.beginPath(); c.arc(0, -23.5, 4.6, 0, 7); c.fill();
  c.fillStyle = HC.hair; c.beginPath(); c.arc(0, -24.4, 4.9, Math.PI * 1.02, Math.PI * 1.98); c.quadraticCurveTo(2, -24.6, 0, -23.4); c.quadraticCurveTo(-2, -24.6, -4.9, -24); c.fill();
  c.fillStyle = HC.bow; c.beginPath(); c.ellipse(-3.6, -28, 1.3, 0.9, -0.5, 0, 7); c.ellipse(-1.8, -28.6, 1.3, 0.9, 0.4, 0, 7); c.fill();
  c.fillStyle = HC.blush; c.beginPath(); c.ellipse(-2.4, -21.8, 1, 0.6, 0, 0, 7); c.ellipse(2.6, -21.8, 1, 0.6, 0, 0, 7); c.fill();
  c.strokeStyle = '#2A1820'; c.lineWidth = 0.6;
  if (pose === 'lie' || pose === 'sit' || pose === 'run') { c.beginPath(); c.arc(-1.6, -23, 0.9, Math.PI * (pose === 'lie' ? 0.1 : 1.1), Math.PI * (pose === 'lie' ? 0.9 : 1.9)); c.moveTo(2.5, -23); c.arc(1.6, -23, 0.9, Math.PI * (pose === 'lie' ? 0.1 : 1.1), Math.PI * (pose === 'lie' ? 0.9 : 1.9)); c.stroke(); }
  else { c.fillStyle = '#2A1820'; c.beginPath(); c.arc(-1.6, -23.2, 0.7, 0, 7); c.arc(1.6, -23.2, 0.7, 0, 7); c.fill(); }
  c.beginPath(); c.arc(0, -21.6, 1, 0.2, Math.PI - 0.2); c.stroke();
  c.restore();
}
function drawDream(mx, my, w, h, t) {
  const s = DREAMS[J.scene], u = h / 44, T = J.sceneT, fade = clamp(T / 0.5, 0, 1) * clamp((5.4 - T) / 0.5, 0, 1), c = cx;
  const night = s === 'sleep', bg = c.createLinearGradient(0, my - h / 2, 0, my + h / 2);
  bg.addColorStop(0, night ? '#5A4FA8' : '#FFE0EE'); bg.addColorStop(1, night ? '#A08EE0' : '#D8C6FF'); c.fillStyle = bg; c.fillRect(mx - w / 2, my - h / 2, w, h);
  c.save(); c.globalAlpha *= fade; c.translate(mx, my);
  const g = 14 * u;   // ground line
  if (s === 'beach') { c.fillStyle = '#9FD6F0'; c.fillRect(-w / 2, g - 14 * u, w, 7 * u); c.fillStyle = '#FFE7C4'; c.fillRect(-w / 2, g - 7 * u, w, 30 * u);
    c.strokeStyle = 'rgba(255,255,255,.8)'; c.lineWidth = 1; for (let i = 0; i < 6; i++) { const x = ((i * 23 - T * 40) % (w + 20) + w + 20) % (w + 20) - w / 2 - 10; c.beginPath(); c.moveTo(x, g - 8 * u); c.quadraticCurveTo(x + 4 * u, g - 9.5 * u, x + 8 * u, g - 8 * u); c.stroke(); }
    helenMini(-12 * u, g, u * 0.95, 'run', t); }
  else if (s === 'ball') { c.fillStyle = '#BFE6B4'; c.fillRect(-w / 2, g - 3 * u, w, 30 * u);
    helenMini(-22 * u, g, u * 0.95, 'throw', t);
    const a = (t % 1.8) / 1.8, bp = a < 0.4 ? null : clamp((a - 0.4) / 0.5, 0, 1);
    if (bp != null && bp < 1) { const bx = lerp(-17, 16, bp) * u, by = (g - 22 * u) - Math.sin(bp * Math.PI) * 14 * u + bp * 4 * u; c.fillStyle = '#FF7AA5'; c.beginPath(); c.arc(bx, by, 2.2 * u, 0, 7); c.fill(); c.strokeStyle = '#fff'; c.lineWidth = 0.6; c.beginPath(); c.arc(bx, by, 2.2 * u, 0.4, 2.4); c.stroke(); } }
  else if (s === 'cuddle') { c.fillStyle = '#F7C9DE'; c.fillRect(-w / 2, g - 2 * u, w, 30 * u); helenMini(-10 * u, g, u, 'sit', t);
    for (let i = 0; i < 4; i++) { const p = ((T * 0.5 + i / 4) % 1); c.globalAlpha = Math.sin(p * Math.PI) * fade; c.fillStyle = '#FF6F9C'; heart(c, (-4 + i * 4) * u, g - 26 * u - p * 14 * u, 2 * u); } c.globalAlpha = fade; }
  else if (s === 'sleep') { c.fillStyle = '#FFF6D8'; c.beginPath(); c.arc(22 * u, -16 * u, 5 * u, 0, 7); c.fill(); c.fillStyle = '#7468C0'; c.beginPath(); c.arc(24.5 * u, -17.5 * u, 4.4 * u, 0, 7); c.fill();
    c.fillStyle = '#fff'; for (let i = 0; i < 9; i++) { const sx = ((i * 37) % 70 - 35) * u, sy = (-20 + (i * 13) % 14) * u; c.globalAlpha = fade * (0.5 + 0.5 * Math.sin(t * 3 + i)); c.fillRect(sx, sy, 1.2, 1.2); } c.globalAlpha = fade;
    c.fillStyle = '#C3B4F2'; c.fillRect(-w / 2, g - 1 * u, w, 30 * u); c.fillStyle = '#F7E3F0'; c.beginPath(); c.ellipse(-12 * u, g - 1 * u, 7 * u, 2.4 * u, 0, 0, 7); c.fill(); helenMini(-4 * u, g + 1 * u, u, 'lie', t); }
  else { c.fillStyle = '#FFD9A8'; c.fillRect(-w / 2, g - 2 * u, w, 30 * u); helenMini(-10 * u, g, u, 'hold', t);
    c.save(); c.translate(-7.6 * u, g - 9.5 * u); c.scale(0.12 * u, 0.12 * u); dBear.draw(c, { aura: false, sparkle: false }); c.restore();
    for (let i = 0; i < 14; i++) { const p = ((T * 0.35 + i * 0.13) % 1); c.fillStyle = ['#FF8DB3', '#FFD27A', '#8EC9FF', '#B9A3FF'][i % 4]; c.fillRect(((i * 29) % 60 - 30) * u, (-28 + p * 52) * u, 1.6 * u, 1 * u); } }
  // the little dog in the dream
  const dx = { beach: 9, ball: 15, cuddle: 6, sleep: -3, trio: 9 }[s] * u, a = (t % 1.8) / 1.8, hop = s === 'ball' && a > 0.62 && a < 0.92 ? Math.sin((a - 0.62) / 0.3 * Math.PI) * 9 * u : 0;
  if (s === 'ball' && hop > 0.5 * u) dPup.act('bark', {}); else if (s === 'ball') dPup.act('stand', {});
  c.save(); c.translate(dx, g - hop + (s === 'sleep' ? 1 * u : 0)); const jk = 0.34 * u; c.scale(s === 'beach' ? jk : -jk, jk); dPup.draw(c); c.restore();
  if (s === 'sleep') { c.fillStyle = 'rgba(255,255,255,.85)'; c.font = `600 ${6 * u}px Georgia, serif`; for (let i = 0; i < 3; i++) { const p = (T * 0.45 + i / 3) % 1; c.globalAlpha = Math.sin(p * Math.PI) * fade; c.fillText('z', (2 + p * 10) * u, (g - 14 * u) - p * 12 * u); } c.globalAlpha = fade; }
  c.restore();
}
function heart(c, x, y, r) { c.beginPath(); c.moveTo(x, y + r * 0.85); c.bezierCurveTo(x - r * 1.25, y, x - r, y - r, x, y - r * 0.35); c.bezierCurveTo(x + r, y - r, x + r * 1.25, y, x, y + r * 0.85); c.fill(); }
function drawCloud(t) {
  const L = J.L, a = J.dream; if (!L || a < 0.01) return;
  const [x0, y0, x1, y1] = L.cloud, w = x1 - x0, h = y1 - y0, mx = (x0 + x1) / 2, my = (y0 + y1) / 2 + Math.sin(t * 1.2) * 2;
  cx.save(); cx.globalAlpha = a;
  const hx = J.x + 14 * L.ps * J.face, hy = L.gy - 44 * L.ps;   // little thought bubbles rising from her head
  cx.fillStyle = 'rgba(250,246,255,.92)';
  for (let i = 0; i < 3; i++) { const k = (i + 1) / 4, r = (2.5 + i * 2.4) * sc * a; cx.beginPath(); cx.arc(lerp(hx, mx + w * 0.12, k), lerp(hy, y1 - 6, k) + Math.sin(t * 2 + i) * 1.5, r, 0, 6.283); cx.fill(); }
  const cloud = new Path2D(), n = 12, r0 = h * 0.24;
  for (let i = 0; i < n; i++) { const an = i / n * 6.283, bx = mx + Math.cos(an) * w * 0.36, by = my + Math.sin(an) * h * 0.3, r = r0 * (0.9 + 0.18 * Math.sin(i * 2.3 + t * 1.3)); cloud.moveTo(bx + r, by); cloud.arc(bx, by, r, 0, 6.283); }
  cloud.moveTo(mx + w * 0.4, my); cloud.ellipse(mx, my, w * 0.4, h * 0.34, 0, 0, 6.283);
  cx.shadowColor = 'rgba(190,160,255,.75)'; cx.shadowBlur = 22 * sc; cx.fillStyle = 'rgba(252,249,255,.97)'; cx.fill(cloud); cx.shadowBlur = 0;
  const inner = new Path2D(); inner.ellipse(mx, my, w * 0.39, h * 0.33, 0, 0, 6.283);
  cx.save(); cx.clip(inner); drawDream(mx, my, w * 0.8, h * 0.68, t); cx.restore();
  cx.strokeStyle = 'rgba(200,180,255,.7)'; cx.lineWidth = 1.5; cx.stroke(inner);
  cx.restore();
}
function drawPup(t) {
  if (J.state === 'off') return; const L = J.L;
  cx.save(); cx.fillStyle = 'rgba(0,0,0,.22)'; cx.beginPath(); cx.ellipse(J.x + 2 * L.ps, L.gy + 1, 24 * L.ps, 3 * L.ps, 0, 0, 6.283); cx.fill(); cx.restore();
  cx.save(); cx.translate(J.x, L.gy); cx.scale(J.face * L.ps, L.ps); pup.draw(cx); cx.restore();
  for (const w of J.woofs) { const x = J.x + (30 + w.t * 10) * L.ps * J.face, y = L.gy - (44 + w.t * 26) * L.ps;
    cx.save(); cx.globalAlpha = 1 - w.t; cx.translate(x, y); cx.rotate(-0.15 + w.k * 0.3); cx.font = `600 ${Math.round(17 * sc + 4)}px Caveat, cursive`; cx.textAlign = 'center';
    cx.lineWidth = 3; cx.strokeStyle = 'rgba(60,30,80,.6)'; cx.strokeText('Woof!', 0, 0); cx.fillStyle = '#FFF3C8'; cx.fillText('Woof!', 0, 0); cx.restore(); }
}
function pupBox() { const L = J.L; if (!L) return null; const a = J.x - 26 * L.ps, b = J.x + 32 * L.ps; return J.face > 0 ? [a, L.gy - 56 * L.ps, b, L.gy + 4] : [2 * J.x - b, L.gy - 56 * L.ps, 2 * J.x - a, L.gy + 4]; }
pupHit.addEventListener('click', tapPup); pupHit.setAttribute('aria-label', 'Jessi the puppy. Tap for a trick');
dreamHit.addEventListener('click', () => { if (J.dream > 0.5) nextDream(); }); dreamHit.setAttribute('aria-label', 'Jessi’s dream. Tap for the next dream');

// ---------------------------------------------------------------- the reveal's dog is Jessi too: the same rig, sitting and wagging beside Helensnowfia and Snowki
const tdSvg = $('.trio .td svg'), trioPup = new Jessi(); let trioC = null;
if (tdSvg) { trioC = document.createElement('canvas'); trioC.setAttribute('aria-hidden', 'true'); tdSvg.replaceWith(trioC); trioPup.act('happy'); }
function drawTrio(dt) {
  if (!trioC || G.step !== 7) return; const w = 140, h = 104, d = Math.min(devicePixelRatio || 1, 2);
  if (trioC.width !== w * d) { trioC.width = w * d; trioC.height = h * d; }
  const x = trioC.getContext('2d'); x.setTransform(d, 0, 0, d, 0, 0); x.clearRect(0, 0, w, h);
  trioPup.update(dt); x.save(); x.translate(w * 0.5, h - 3); x.scale(-1.72, 1.72); trioPup.draw(x); x.restore();
}

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
  stepPup(dt); drawTrio(dt);
  // eyes follow her finger / cursor (or Jessi while she shows off)
  if (['enter', 'show'].includes(J.state) && !G.drag && J.L) bear.look((J.x - G.x) / (W * 0.25), 0.3);
  else if (G.gazeP && !G.drag) { const hx = G.x, hy = G.y - 66 * sc; bear.look((G.gazeP[0] - hx) / (W * 0.4), (G.gazeP[1] - hy) / (H * 0.4)); }
  bear.update(dt, { vel: G.drag ? bear.vel : vel, magic: bear.magic });
  // draw
  cx.setTransform(pr, 0, 0, pr, 0, 0); cx.clearRect(0, 0, W, H);
  drawCloud(now / 1000); drawPup(now / 1000);
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
  if (!askEl.hidden) placeBubble(askEl);
  const pb = J.state !== 'off' && J.state !== 'leave' ? pupBox() : null;
  pupHit.style.pointerEvents = pb ? 'auto' : 'none'; if (pb) { pupHit.style.transform = `translate(${pb[0]}px,${pb[1]}px)`; pupHit.style.width = (pb[2] - pb[0]) + 'px'; pupHit.style.height = (pb[3] - pb[1]) + 'px'; }
  const dc = J.dream > 0.5 && J.L ? J.L.cloud : null;
  dreamHit.style.pointerEvents = dc ? 'auto' : 'none'; if (dc) { dreamHit.style.transform = `translate(${dc[0]}px,${dc[1]}px)`; dreamHit.style.width = (dc[2] - dc[0]) + 'px'; dreamHit.style.height = (dc[3] - dc[1]) + 'px'; }
}
requestAnimationFrame(frame);

window.Guide = { step, on(e, a) { EVENTS[e] && EVENTS[e](a); }, bear, pup, J };
document.documentElement.classList.add('guide');
hit.setAttribute('aria-label', `${NAME}, the teddy. Tap to play`);
if (window.__scr) { const c = window.__scr().cur; if (c != null) step(c); }

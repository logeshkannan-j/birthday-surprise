// Snowki, the magical teddy, guides her through the birthday page: from the countdown to the reveal.
// He finds a free spot beside whatever she should look at, points, helps, reacts when she taps or drags him,
// and hides while the private album or the film is open. The page calls Guide.step(n) and Guide.on(event).
import { Snowki } from './film/js/snowki.js';
import { Jessi } from './film/js/jessi.js';
import { DogVoice } from './film/js/dog.js';
import { makePlay } from './play.js';

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
  trail: [], sayUntil: 0, last: performance.now(), lastTap: 0, gazeP: null, fidget: [], stepT: 0, hidden: false, after: [], visK: 2.5, script: false,
  po: { x: 0, y: 0, r: 0, s: 1 }   // his offset from his spot while he plays with Jessi (x, y px; r roll; s scale)
};
const box = (x = G.x, y = G.y) => [x - 40 * sc, y - 112 * sc, x + 40 * sc, y + 6 * sc];

// ---------------------------------------------------------------- finding a free spot beside an element
function obstacles(sec) {
  const els = sec ? [...sec.querySelectorAll('h1,p,button,.btn,.link,.cd,.env,.card,form,input,svg.clock,label,figure,.paper')] : [];
  const out = [], rg = document.createRange();
  for (const e of els.concat([$('#mute'), $('#mus'), $('.dots'), $('#star')])) {
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
function homePos() { const h = G.home; if (!h) return null; const r = h.el.getBoundingClientRect(); if (!r.width && !r.height) return null; const o = G.step === 'c' ? G.po : null; return [r.left + h.dx + (o ? o.x : 0), r.top + h.dy + (o ? o.y : 0)]; }

// ---------------------------------------------------------------- speech bubble
function say(text, ms = 3600) {
  if (!text) { bub.classList.remove('on'); G.sayUntil = 0; return; }
  bub.textContent = text; bub.classList.add('on'); G.sayUntil = performance.now() + Math.max(ms, text.length > 14 ? 4800 : 2600); placeBubble();
}
function placeBubble(el = bub, b0 = null, bias = 0) {
  const b = b0 || box(), w = el.offsetWidth, h = el.offsetHeight, mx = (b[0] + b[2]) / 2;
  // above his head unless that covers the words on screen; then beside him, then below
  if (!G.bubObs || performance.now() - G.bubObsT > 500) { G.bubObs = obstacles($('.s.on')); G.bubObsT = performance.now(); if (J.dream > 0.1 && J.L) { const c = J.L.cloud; G.bubObs.push({ left: c[0], top: c[1], right: c[2], bottom: c[3] }); } }
  const rc = a => ({ left: a[0], top: a[1], right: a[2], bottom: a[3] }), pb = typeof pupBox === 'function' && J.L && J.state !== 'off' && J.state !== 'leave' ? pupBox() : null;
  const others = el === bubJ ? [rc(box())] : (el === bub || el === askEl) && pb ? [rc(pb)] : [];
  const opts = [[mx - w / 2 + bias * w * 0.2, b[1] - h - 4, 'up'], [b[2] + 4, b[1] + 6 * sc, 'side'], [b[0] - w - 4, b[1] + 6 * sc, 'side'], [mx - w / 2, b[3] + 6, 'below']];
  let best = null;
  for (const [x0, y0, k] of opts) { const x = clamp(x0, 8, W - w - 8), y = clamp(y0, 8, H - h - 8), bb = [x, y, x + w, y + h]; let c = 0; for (const o of G.bubObs) c += overlap(bb, o); for (const o of others) c += overlap(bb, o) * 2;   // never cover the other one's face c += Math.abs(x - x0) * 30 + Math.abs(y - y0) * 30;
    if (!best || c < best.c - 1) best = { c, x, y, k }; }
  el.style.transform = `translate(${best.x}px,${best.y}px)`; el.classList.toggle('below', best.k === 'below'); el.classList.toggle('side', best.k === 'side');
  el.style.setProperty('--tx', clamp(mx - best.x, 14, w - 14) + 'px');
}

// ---------------------------------------------------------------- moving
function flyTo(p, then) {
  if (!p) return; G.rot = G.rotTo = 0;
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
    // the very first hello. At night he is already there, asleep, and wakes (a stretch, a yawn, rubbing his eyes); by day he is simply there and awake:
    // he looks around, notices her and waves. No flying in, no landing bounce.
    J.intro = true; G.script = true; G.fl = null; G.visK = 0.9; G.react = 0;
    { const nt = isNight(); G.homeAct = [nt ? 'sleep' : 'idle', {}]; const p = homePos(); if (p) { G.x = p[0]; G.y = p[1]; } bear.act(nt ? 'sleep' : 'idle', { restart: true }); bear.magic = 0.2;
      const T = nt ? [1800, 4200, 5000, 5800, 9200, 11800] : [900, 1700, 2500, 6000, 8800]; let i = 0;
      if (nt) later(T[i++], () => bear.act('yawn', { restart: true }));
      later(T[i++], () => bear.act('alert', { restart: true, dir: [-1, -0.2], expr: 'soft' }));
      later(T[i++], () => bear.act('alert', { restart: true, dir: [0.9, -0.2], expr: 'soft' }));
      later(T[i++], () => { bear.act('wave', { restart: true }); say(hello(), 3400); bear.magic = 0.35; });
      later(T[i++], () => { bear.act('kick', { restart: true }); G.homeAct = ['kick', {}]; say(days() > 1 ? `${days()} more sleeps… let’s wait together ✦` : 'Almost time ✦', 2800); });
      later(T[i++], () => { G.script = false; G.visK = 2.5; askJessi(); }); } },
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
const tod = () => document.documentElement.dataset.tod || 'night';
const isNight = () => tod() === 'night';   // sleeping and dreaming happen only at night
function hello() { const t = tod(), h = new Date().getHours();
  return t === 'morning' ? 'Good morning, Helen! ☀ It’s me, Snowki ♡' : t === 'dusk' ? 'Good evening, Helen! It’s me, Snowki ♡'
    : t === 'night' && h < 5 ? 'Still awake, Helen? It’s me, Snowki ♡' : 'Hey, hi Helen! It’s me, Snowki ♡'; }
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
  G.after.forEach(clearTimeout); G.after = []; say(''); banterStop(); G.ph = null; G.perch = null; G.rot = G.rotTo = 0; G.rescued = false; G.restUntil = 0;
  G.step = n; G.stepT = 0; G.react = 0; G.script = false; G.visK = 2.5; bear.express(null); if (n !== 'c') { pupLeave(); hideAsk(); }
  if (n === 6 || window.__albumOpen) { hide(); return; }
  const wasHidden = G.vis < 0.05; show(); if (wasHidden) G.vis = 0.001;
  // wait a frame so the new screen has its layout
  requestAnimationFrame(() => requestAnimationFrame(() => { if (G.step === n && STEPS[n]) STEPS[n](); }));
  scheduleBanter(n); teaseLoop(n);
}

// ---------------------------------------------------------------- touch: tap him, or pick him up and drop him
const TAPS = [['giggle', 'Hehe! Okay okay, that tickles ♡'], ['spin', 'Wheee! Again? So needy!'], ['cheer', 'I’m the best. I know.'], ['hug', 'Fine, ONE hug. Don’t tell Jessi.'], ['dance', 'Ta-da! The tip jar is empty, Helen.'], ['wave', 'Hi! Yes, still me. Still here.'], ['shy', 'Stop staring, you’ll make me blush!']];
let tapI = 0;
function react() {
  const now = performance.now(); if (now - G.lastTap < 450) return; G.lastTap = now;
  if (G.perch) { scold(true); return; }
  if (G.step === 'c' && J.asked && !J.called && askEl.hidden && !G.script) { askJessi(); return; }
  if (play.on) { bear.act('giggle', { restart: true }); bear.burstHearts(4); say(['Hehe! ♡', 'That tickles!', 'Wheee! ✦'][tapI++ % 3], 1400); poofAt(0.4); return; }
  G.pokes = now - (G.pokeT || 0) < 3500 ? (G.pokes || 0) + 1 : 1; G.pokeT = now;
  if (G.pokes >= 5 && !play.on) { const n = G.pokes; bear.act(n % 2 ? 'push' : 'shy', { restart: true, dir: [1, 0] }); say(POKES[Math.min(POKES.length - 1, n - 5)], 2400); poofAt(0.3); G.react = 1.6; if (n >= 8) G.pokes = 0; return; }
  const [a, line0] = TAPS[tapI++ % TAPS.length], line = Math.random() < 0.4 ? pickLine(TEASE_S) : line0; bear.act(a, { restart: true }); if (a === 'hug' || a === 'shy') bear.burstHearts(4);
  if (G.step === 'c' && tapI % 4 === 1) say(days() > 1 ? `${days()} more sleeps ✦` : 'Almost ✦', 2400); else if (line) say(line, 1600);
  poofAt(0.4); G.react = a === 'spin' ? 0.95 : 1.6; G.idle = 8;
}
hit.addEventListener('pointerdown', e => { if (G.fl || G.vis < 0.5) return; if (G.ph) G.ph.paused = true; e.preventDefault(); hit.setPointerCapture && hit.setPointerCapture(e.pointerId); G.drag = { id: e.pointerId, sx: e.clientX, sy: e.clientY, ox: G.x - e.clientX, oy: G.y - e.clientY, moved: false, lx: e.clientX, ly: e.clientY, lt: performance.now(), vx: 0, vy: 0 }; });
hit.addEventListener('pointermove', e => {
  const d = G.drag; if (!d || e.pointerId !== d.id) return;
  if (!d.moved && Math.hypot(e.clientX - d.sx, e.clientY - d.sy) > 7) { d.moved = true; G.restUntil = 0; if (G.perch) { G.perch = null; G.rescued = true; } G.ph = null; G.rot = G.rotTo = 0; bear.express(null); bear.act('dangle', { restart: true }); say(''); }
  if (d.moved) { const now = performance.now(), dt = Math.max(1, now - d.lt) / 1000; d.vx = lerp(d.vx, (e.clientX - d.lx) / dt, 0.4); d.vy = lerp(d.vy, (e.clientY - d.ly) / dt, 0.4); d.lx = e.clientX; d.ly = e.clientY; d.lt = now;
    G.x = clamp(e.clientX + d.ox, 30, W - 30); G.y = clamp(e.clientY + d.oy - 30 * sc, 120 * sc, H - 10); bear.vel = [d.vx, d.vy]; }
});
function drop(e) {
  const d = G.drag; if (!d || (e && e.pointerId !== d.id)) return; G.drag = null;
  if (!d.moved) { if (G.ph) G.ph.paused = false; react(); return; }
  const sp = Math.hypot(d.vx || 0, d.vy || 0);
  if (sp < 450) { const t = nearText(G.x, G.y, 60 * sc); if (t) { startPerch(t, G.x); say(pickLine(SCOLD), 5600); return; } }   // let go next to the words: he stands on them (or hangs from them) and scolds
  G.ph = { vx: clamp((d.vx || 0) * 0.95, -2600, 2600), vy: clamp((d.vy || 0) * 0.95, -2600, 2400), om: clamp((d.vx || 0) * 0.004, -14, 14), n: 0, thrown: sp > 500 };   // let go anywhere else: he falls, bounces and tumbles
  bear.act('dangle', { restart: true }); G.react = 0; G.idle = 99; say(sp > 700 ? 'Wheeeeee—!' : 'Whoa—!', 1500);
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
  dogSay('pant', 5); stage(); J.state = 'enter'; J.x = -70 * J.L.ps; J.face = 1; J.dreamTo = 0; pup.act('run', { restart: true, vx: PUP_RUN });
  J.short = short;
}
const TRICKS = { bark: ['bark', 1.3, 'cheer'], flip: ['flip', 1.15, 'clap'], spin: ['spin', 1.3, 'giggle'], roll: ['roll', 1.45, 'clap'], bow: ['bow', 1.3, 'dance'], paw: ['paw', 1.9, 'clap', 'Good girl, Jessi! ♡'],
  hi: ['bark', 1.4, 'cheer', 'Jessi! Let’s play together ✦', 'excited'], lie: ['lie', 1.0, 'idle'], yawn: ['yawn', 1.6, 'yawn'], sleep: ['sleep', 0, 'shh', 'Shh… she’s dreaming of you ♡'], wake: ['wake', 0.7, 'idle'], happy: ['happy', 1.3, 'cheer'] };
const SHOW = ['bark', 'flip', 'spin', 'roll', 'bow', 'paw', 'lie', 'yawn', 'sleep'], SHOW_DAY = ['bark', 'flip', 'spin', 'roll', 'bow', 'paw', 'happy'];
function queue(names) { J.q = names.filter(n => !(RM && ['flip', 'spin', 'roll'].includes(n))).map(n => TRICKS[n]); J.qt = 0; J.state = 'show'; nextTrick(); }
function nextTrick() {
  const t = J.q.shift(); if (!t) { if (J.state === 'show' && J.wantPlay) { if (!V.cdDone && !V.busy) { V.cdDone = true; banterC(() => { if (J.state === 'show' && J.wantPlay) startPlay(); }); } else if (!V.busy) startPlay(); } return; } const [a, d, b, line, mood] = t;
  pup.act(a, { restart: true }); J.qt = d || 1e9;
  if (a === 'bark') woof(mood === 'excited' ? 4 : 2, mood || 'happy'); else if (a === 'paw') woof(1, 'happy'); else if (a === 'yawn') dogSay('yawn'); else if (a === 'sleep') dogSay('sigh'); else if (a === 'wake') dogSay('soft'); else if (a === 'bow') dogSay('soft'); else if (a === 'flip' || a === 'spin' || a === 'roll') dogSay('excited', 2);
  if (b) { bear.act(b, { restart: true }); G.react = 0; G.idle = 99; } if (line) say(line, 3400);
  if (a === 'sleep') { J.state = 'sleep'; G.idle = 6; G.homeAct = ['kick', {}]; }
}
function startPlay() { J.state = 'play'; J.wantPlay = false; G.fidget = []; G.homeAct = ['idle', {}]; G.react = 0; G.idle = 99; play.start(); }
function tapPup() {
  if (J.state === 'vsit') { jessiPoked(); return; }
  if (J.state === 'play') { play.skip(); return; }
  if (!['show', 'sleep'].includes(J.state)) return;
  const pool = RM ? ['paw', 'bow'] : ['flip', 'spin', 'roll', 'bow', 'paw'], pick = pool[(Math.random() * pool.length) | 0];
  J.dreamTo = 0; J.wantPlay = !RM; queue((J.state === 'sleep' ? ['wake'] : []).concat(isNight() ? ['bark', pick, 'lie', 'yawn', 'sleep'] : ['bark', pick, 'paw', 'happy']));
}
function pupLeave() { if (J.state === 'off') return; play.stop(); J.wantPlay = false; J.dreamTo = 0; J.state = 'leave'; J.face = 1; pup.act('run', { restart: true, vx: PUP_RUN }); hideAsk(); }
const PUP_RUN = 220;   // her running speed in rig units/s: the rig plants each paw on the page at exactly this speed

// woof: floating words and (when her sound is on) a small synthesised bark
let AC = null;
const soundOn = () => { const m = $('#mute'); return !!m && m.getAttribute('aria-pressed') === 'true'; };
function unlockAudio() { if (!soundOn()) return; try { AC = AC || new (window.AudioContext || window.webkitAudioContext)(); AC.resume(); } catch (e) { AC = null; } }
const WOOFTXT = { happy: 'Woof!', excited: 'Yip!', angry: 'WOOF!', soft: 'woof', sheepish: 'woof…', sleepy: 'wuff…', yelp: 'Yelp!' };
let DOG = null;
function dogVoice() { if (!soundOn()) return null; unlockAudio(); if (!AC) return null; if (!DOG || DOG.c !== AC) { DOG = new DogVoice(AC, AC.destination); if (window.DOGSOUNDS && window.DOGSOUNDS.length) DOG.loadSamples(window.DOGSOUNDS); } return DOG; }
function dogSay(mood, n) { const d = dogVoice(); if (d) d.say(mood, n || null); }   // yawn, sigh, pant, snore, whine… as well as the barks
// woof(n, mood): floating words and (when her sound is on) a modelled puppy bark with that feeling: happy, excited, angry (indignant), soft, sheepish, sleepy, yelp
function woof(n = 1, mood = 'happy') {
  const txt = WOOFTXT[mood]; if (txt) for (let i = 0; i < n; i++) setTimeout(() => J.woofs.push({ t: 0, k: Math.random(), w: txt }), i * (mood === 'excited' ? 170 : 280));
  dogSay(mood, n);
}
function stepPup(dt) {
  if (J.state === 'off') return; const L = J.L || stage();
  if (J.state[0] === 'v') stepVisit(dt, L);
  else if (J.state === 'enter') { J.x += PUP_RUN * L.ps * dt; if (J.x >= L.pupX) { J.x = L.pupX; pup.bump(40); if (RM) queue(J.short ? ['bark'].concat(isNight() ? ['lie', 'yawn', 'sleep'] : ['paw', 'happy']) : (isNight() ? SHOW : SHOW_DAY)); else { J.wantPlay = true; queue(J.short ? ['hi'] : ['hi', 'flip', 'paw']); } } }
  else if (J.state === 'leave') { J.x += PUP_RUN * L.ps * dt; if (J.x > W + 160) { J.state = 'off'; } }
  else if (J.state === 'play') J.x = L.pupX + (J.ox || 0);
  else { J.x = lerp(J.x, L.pupX, Math.min(1, dt * 4)); if (J.state === 'show' && (J.qt -= dt) <= 0) nextTrick(); }
  if (J.state === 'sleep' && pup.name === 'sleep' && pup.a > 1.3 && (J.zt = (J.zt ?? 6) - dt) <= 0) { J.zt = 7 + Math.random() * 6; dogSay(Math.random() < 0.5 ? 'sleepy' : 'snore'); }
  if (J.state === 'sleep' && pup.name === 'sleep' && pup.a > 1.3 && !J.dreamTo && isNight()) { J.dreamTo = 1; J.sceneT = 0; setDream(); }
  if (J.state === 'sleep') { J.slT = (J.slT || 0) + dt; if (J.slT > 17) { J.slT = 0; J.dreamTo = 0; J.wantPlay = true; queue(['wake']); } } else J.slT = 0;   // she never sleeps for long: she wakes and they play again
  J.fs = J.fs == null ? J.face : J.fs + (J.face - J.fs) * Math.min(1, dt * 12); J.fx = (J.fs >= 0 ? 1 : -1) * Math.max(0.3, Math.abs(J.fs));
  pup.update(dt);
  for (const w of J.woofs) w.t += dt; J.woofs = J.woofs.filter(w => w.t < 1);
  J.dream = J.dreamTo > J.dream ? Math.min(1, J.dream + dt * 1.1) : Math.max(0, J.dream - dt * 2.5);
  if (J.dream > 0) { J.sceneT += dt; if (J.sceneT > 5.4) nextDream(); if ((J.dogT = (J.dogT || 0) + dt) > 1.9) { J.dogT = 0; dreamDog(); } dPup.update(dt); dBear.update(dt); }
}

// ---- the dream: five little scenes of Jessi and Helen
// ---- the dreams: only while she sleeps, and she only sleeps at night. Ten places × three night moods (evening, deep night, dawn) × five poses of Helen ×
// eight things Jessi does × eight props = 9,600 different dreams, never the same place twice in a row.
const D_PLACES = ['beach', 'meadow', 'rooftop', 'kitchen', 'forest', 'fair', 'snow', 'pond', 'library', 'balcony'], D_POSES = ['run', 'throw', 'sit', 'lie', 'hold'], D_DOG = ['run', 'happy', 'spin', 'roll', 'paw', 'bow', 'bark', 'flip'], D_PROPS = ['ball', 'kite', 'balloon', 'star', 'heart', 'flower', 'bone', 'bubble'];
const dreamSlot = () => { const h = new Date().getHours(); return h >= 4 && h < 7 ? 'dawn' : h >= 18 ? 'evening' : 'deep'; };
const D_PAL = { evening: ['#4B357E', '#F2A27A', 0.2], deep: ['#1B1848', '#5A4FA8', 0.36], dawn: ['#F2A9C4', '#FFE0B0', 0] };   // sky top, sky bottom, how much the night darkens the scene
const rpick = a => a[(Math.random() * a.length) | 0];
function newDream(prev) { let d; do { d = { place: rpick(D_PLACES), pose: rpick(D_POSES), dog: rpick(D_DOG), prop: rpick(D_PROPS), slot: dreamSlot() }; } while (prev && d.place === prev.place); return d; }
function dreamDog() { const d = J.dr; if (d) dPup.act(d.dog, { restart: true, speed: 15 }); }
function setDream() { J.dr = newDream(J.dr); J.dogT = 0; dreamDog(); dBear.act('idle', { expr: 'happy' }); }
function nextDream() { J.sceneT = 0; setDream(); }
const HC = { skin: '#CF9467', hair: '#1D1311', top: '#F8F4EA', topD: '#D8D1C1', jean: '#5276AE', jeanD: '#3A5A8E', shoe: '#FBFBFF', flower: '#E8B53A', blush: 'rgba(224,122,128,.55)', lip: '#B85C5E' };
function helenMini(x, y, k, pose, t) {   // a tiny chibi Helen standing on (x, y); k = px per unit (about 34 units tall)
  const c = cx; c.save(); c.translate(x, y); c.scale(k, k); c.lineCap = c.lineJoin = 'round';
  if (pose === 'lie') { c.translate(-2, -4); c.rotate(-Math.PI / 2); c.translate(0, 4); }
  const run = pose === 'run', ph = t * 9, sw = run ? Math.sin(ph) : 0, bk = run ? 2 : 0;
  // long wavy hair behind her
  c.fillStyle = HC.hair; c.beginPath(); c.moveTo(-5.4, -26); c.quadraticCurveTo(-7.8 - bk, -18, -6.6 - bk - sw, -11.6); c.quadraticCurveTo(-5.2 - bk, -10.2, -3.6 - bk, -11.4);
  c.lineTo(3.4 - bk, -11.4); c.quadraticCurveTo(5.2 - bk, -10.4, 6.4 - bk, -11.8); c.quadraticCurveTo(7.6, -18, 5.4, -26); c.fill();
  // wide-leg jeans and white sneakers
  c.strokeStyle = HC.jean; c.lineWidth = 2.7;
  if (pose === 'sit') { c.beginPath(); c.moveTo(-1, -8); c.lineTo(5, -6.4); c.lineTo(6.5, -1.2); c.moveTo(1.2, -8); c.lineTo(7, -6); c.lineTo(8.8, -1.2); c.stroke(); c.fillStyle = HC.shoe; c.beginPath(); c.ellipse(7.2, -0.6, 1.6, 0.85, 0, 0, 7); c.ellipse(9.5, -0.6, 1.6, 0.85, 0, 0, 7); c.fill(); }
  else { c.beginPath(); c.moveTo(-1.4, -9); c.lineTo(-1.6 - sw * 2.6, -1.1 - Math.max(0, sw) * 1.6); c.moveTo(1.4, -9); c.lineTo(1.6 + sw * 2.6, -1.1 - Math.max(0, -sw) * 1.6); c.stroke();
    c.fillStyle = HC.shoe; for (const sd of [-1, 1]) { c.beginPath(); c.ellipse(sd * 1.6 + sd * sw * 2.6 + 0.6, -0.4 - (sd < 0 ? Math.max(0, sw) : Math.max(0, -sw)) * 1.6, 1.5, 0.85, 0, 0, 7); c.fill(); } }
  // high-waisted jeans, then the cream top with a few little flowers
  c.fillStyle = HC.jean; c.beginPath(); c.moveTo(-3.6, -12.4); c.lineTo(3.6, -12.4); c.lineTo(4, -8.4); c.lineTo(-4, -8.4); c.closePath(); c.fill();
  const tg = c.createLinearGradient(-4, 0, 4, 0); tg.addColorStop(0, HC.top); tg.addColorStop(1, HC.topD); c.fillStyle = tg;
  c.beginPath(); c.moveTo(-3.4, -19.4); c.quadraticCurveTo(0, -20.2, 3.4, -19.4); c.lineTo(3.8, -12); c.lineTo(-3.8, -12); c.closePath(); c.fill();
  c.fillStyle = HC.flower; for (const [fx, fy] of [[-1.8, -17.4], [1.6, -15.8], [-0.6, -13.8], [2.4, -13], [-2.6, -14.8]]) { c.beginPath(); c.arc(fx, fy, 0.45, 0, 7); c.fill(); }
  // arms in long cream sleeves, little hands
  let hl, hr;
  if (pose === 'throw') { const a = (t % 1.8) / 1.8, up = a < 0.4 ? a / 0.4 : Math.max(0, 1 - (a - 0.4) / 0.25); hr = [3 + Math.cos(-0.4 - up * 1.8) * 6, -18 + Math.sin(-0.4 - up * 1.8) * 6]; hl = [-5, -12]; }
  else if (pose === 'hold' || pose === 'sit') { hl = [1, -13]; hr = [5.6, -13.5]; }
  else { hl = [-4.4 + sw * 2.4, -12]; hr = [4.4 - sw * 2.4, -12]; }
  for (const [col, w] of [[HC.topD, 2.1], [HC.top, 1.55]]) { c.strokeStyle = col; c.lineWidth = w; c.beginPath(); c.moveTo(-3, -18); c.lineTo(hl[0], hl[1]); c.moveTo(3, -18); c.lineTo(hr[0], hr[1]); c.stroke(); }
  c.fillStyle = HC.skin; c.beginPath(); c.arc(hl[0], hl[1], 0.9, 0, 7); c.arc(hr[0], hr[1], 0.9, 0, 7); c.fill();
  // head, the middle-parted fringe, her bindi, face
  c.fillStyle = HC.skin; c.beginPath(); c.arc(0, -23.5, 4.6, 0, 7); c.fill();
  c.fillStyle = HC.hair; c.beginPath(); c.arc(0, -24.4, 4.9, Math.PI * 1.02, Math.PI * 1.98); c.quadraticCurveTo(2.4, -25, 0.4, -23.6); c.quadraticCurveTo(-2.2, -25.2, -4.9, -24); c.fill();
  c.fillStyle = HC.blush; c.beginPath(); c.ellipse(-2.4, -21.8, 1, 0.6, 0, 0, 7); c.ellipse(2.6, -21.8, 1, 0.6, 0, 0, 7); c.fill();
  c.fillStyle = '#2A0E12'; c.beginPath(); c.arc(0, -25.4, 0.45, 0, 7); c.fill();   // her bindi
  c.strokeStyle = '#2A1820'; c.lineWidth = 0.6;
  if (pose === 'lie' || pose === 'sit' || pose === 'run') { c.beginPath(); c.arc(-1.6, -23, 0.9, Math.PI * (pose === 'lie' ? 0.1 : 1.1), Math.PI * (pose === 'lie' ? 0.9 : 1.9)); c.moveTo(2.5, -23); c.arc(1.6, -23, 0.9, Math.PI * (pose === 'lie' ? 0.1 : 1.1), Math.PI * (pose === 'lie' ? 0.9 : 1.9)); c.stroke(); }
  else { c.fillStyle = '#2A1820'; c.beginPath(); c.arc(-1.6, -23.2, 0.7, 0, 7); c.arc(1.6, -23.2, 0.7, 0, 7); c.fill(); }
  c.strokeStyle = HC.lip; c.beginPath(); c.arc(0, -21.6, 1, 0.2, Math.PI - 0.2); c.stroke();
  c.restore();
}
function drawDream(mx, my, w, h, t) {
  const d = J.dr || (J.dr = newDream()), u = h / 44, T = J.sceneT, fade = clamp(T / 0.5, 0, 1) * clamp((5.4 - T) / 0.5, 0, 1), c = cx, pal = D_PAL[d.slot], g = 14 * u;
  const bg = c.createLinearGradient(0, my - h / 2, 0, my + h / 2); bg.addColorStop(0, pal[0]); bg.addColorStop(1, pal[1]); c.fillStyle = bg; c.fillRect(mx - w / 2, my - h / 2, w, h);
  c.save(); c.globalAlpha *= fade; c.translate(mx, my);
  if (d.slot !== 'dawn') { c.fillStyle = '#fff'; for (let i = 0; i < 10; i++) { c.globalAlpha = fade * (0.4 + 0.5 * Math.sin(t * 3 + i)); c.fillRect(((i * 37) % 70 - 35) * u, (-21 + (i * 13) % 12) * u, 1.2, 1.2); } c.globalAlpha = fade;
    c.fillStyle = '#FFF6D8'; c.beginPath(); c.arc(21 * u, -15 * u, 4.6 * u, 0, 7); c.fill(); c.fillStyle = pal[0]; c.beginPath(); c.arc(23.4 * u, -16.4 * u, 4 * u, 0, 7); c.fill(); }
  else { c.fillStyle = '#FFF1B8'; c.beginPath(); c.arc(-22 * u, g - 6 * u, 6 * u, 0, 7); c.fill(); }   // a low rising sun
  const gr = (col, y = 2) => { c.fillStyle = col; c.fillRect(-w / 2, g - y * u, w, 30 * u); };
  switch (d.place) {
    case 'beach': c.fillStyle = '#7FC4E8'; c.fillRect(-w / 2, g - 14 * u, w, 7 * u); gr('#FFE2B8', 7); c.strokeStyle = 'rgba(255,255,255,.8)'; c.lineWidth = 1;
      for (let i = 0; i < 6; i++) { const x = ((i * 23 - T * 40) % (w + 20) + w + 20) % (w + 20) - w / 2 - 10; c.beginPath(); c.moveTo(x, g - 8 * u); c.quadraticCurveTo(x + 4 * u, g - 9.5 * u, x + 8 * u, g - 8 * u); c.stroke(); } break;
    case 'meadow': gr('#A9D98A', 3); for (let i = 0; i < 9; i++) { c.fillStyle = ['#FF9FC0', '#FFFFFF', '#FFE27A', '#C9B5FF'][i % 4]; c.beginPath(); c.arc(((i * 29) % 60 - 30) * u, g + (2 + (i * 7) % 6) * u, 1.1 * u, 0, 7); c.fill(); } break;
    case 'rooftop': c.fillStyle = '#3B3158'; for (let i = 0; i < 8; i++) c.fillRect((-34 + i * 9) * u, g - (6 + (i * 7) % 9) * u, 8 * u, 20 * u); gr('#4A3F6B', 2); c.fillStyle = '#6B5C94'; c.fillRect(14 * u, g - 8 * u, 5 * u, 7 * u);
      c.fillStyle = '#FFE7A8'; for (let i = 0; i < 12; i++) { c.globalAlpha = fade * (0.4 + 0.4 * Math.sin(t * 2 + i)); c.fillRect((-33 + (i * 17) % 66) * u, g - (3 + (i * 5) % 9) * u, 1.1 * u, 1.1 * u); } c.globalAlpha = fade; break;
    case 'kitchen': c.fillStyle = '#FFE6C8'; c.fillRect(-w / 2, -22 * u, w, g + 22 * u); c.fillStyle = '#9FD4FF'; c.fillRect(-26 * u, -14 * u, 12 * u, 11 * u); c.strokeStyle = '#fff'; c.lineWidth = 1.2; c.strokeRect(-26 * u, -14 * u, 12 * u, 11 * u); c.beginPath(); c.moveTo(-20 * u, -14 * u); c.lineTo(-20 * u, -3 * u); c.stroke();
      c.fillStyle = '#C48A55'; c.fillRect(8 * u, g - 8 * u, 18 * u, 2 * u); c.fillRect(10 * u, g - 6 * u, 1.6 * u, 6 * u); c.fillRect(22 * u, g - 6 * u, 1.6 * u, 6 * u); gr('#D9A66C', 3); break;
    case 'forest': gr('#6FA46A', 2); for (let i = 0; i < 6; i++) { const x = (-30 + i * 12) * u; c.fillStyle = '#5A4632'; c.fillRect(x - 0.9 * u, g - 12 * u, 1.8 * u, 12 * u); c.fillStyle = i % 2 ? '#3E7A4A' : '#4C8F57'; c.beginPath(); c.moveTo(x, g - 25 * u); c.lineTo(x - 6 * u, g - 7 * u); c.lineTo(x + 6 * u, g - 7 * u); c.fill(); }
      if (d.slot !== 'dawn') { c.fillStyle = '#FFF6C8'; for (let i = 0; i < 6; i++) { c.globalAlpha = fade * (0.3 + 0.7 * Math.abs(Math.sin(t * 1.4 + i * 2))); c.beginPath(); c.arc(((i * 31) % 56 - 28 + Math.sin(t + i) * 3) * u, (-4 + (i * 11) % 14) * u, 0.9 * u, 0, 7); c.fill(); } c.globalAlpha = fade; } break;
    case 'fair': gr('#B79AD8', 2); c.save(); c.translate(17 * u, -4 * u); c.strokeStyle = '#FFE7A8'; c.lineWidth = 1.2; c.beginPath(); c.arc(0, 0, 11 * u, 0, 7); c.stroke(); c.rotate(T * 0.5);
      for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; c.beginPath(); c.moveTo(0, 0); c.lineTo(Math.cos(a) * 11 * u, Math.sin(a) * 11 * u); c.stroke(); c.fillStyle = ['#FF7AA5', '#FFD27A', '#8EC9FF', '#B9A3FF'][i % 4]; c.beginPath(); c.arc(Math.cos(a) * 11 * u, Math.sin(a) * 11 * u, 1.4 * u, 0, 7); c.fill(); } c.restore(); break;
    case 'snow': gr('#F4F8FF', 2); c.fillStyle = '#fff'; for (let i = 0; i < 18; i++) { const p = ((T * 0.3 + i * 0.137) % 1); c.beginPath(); c.arc(((i * 29) % 70 - 35 + Math.sin(T + i) * 2) * u, (-22 + p * 36) * u, 0.9 * u, 0, 7); c.fill(); } break;
    case 'pond': gr('#8FC48B', 3); c.fillStyle = '#6FB6D8'; c.beginPath(); c.ellipse(4 * u, g + 4 * u, 24 * u, 5 * u, 0, 0, 7); c.fill(); c.fillStyle = '#5FA05A'; for (const x of [-8, 6, 16]) { c.beginPath(); c.ellipse(x * u, g + 4 * u, 3 * u, 1.1 * u, 0, 0, 7); c.fill(); }
      c.strokeStyle = 'rgba(255,255,255,.55)'; c.lineWidth = 1; for (let i = 0; i < 2; i++) { const r = ((T * 0.5 + i * 0.5) % 1); c.globalAlpha = fade * (1 - r); c.beginPath(); c.ellipse(10 * u, g + 4 * u, (2 + r * 9) * u, (0.6 + r * 2) * u, 0, 0, 7); c.stroke(); } c.globalAlpha = fade; break;
    case 'library': c.fillStyle = '#7A5638'; c.fillRect(-w / 2, -22 * u, w, g + 22 * u); for (let r = 0; r < 3; r++) { c.fillStyle = '#5A3E26'; c.fillRect(-w / 2, (-18 + r * 12) * u, w, 1.4 * u); for (let i = 0; i < 16; i++) { c.fillStyle = ['#C0426E', '#4F7FC9', '#E9B44C', '#5FA05A', '#8A5FC9'][(i + r) % 5]; c.fillRect((-34 + i * 4.4) * u, (-18 + r * 12 - 8 + (i % 3)) * u, 3.4 * u, (8 - (i % 3)) * u); } } gr('#B98A5A', 2); break;
    default: /* balcony */ gr('#7A6AA8', 2); c.strokeStyle = '#E8DFFF'; c.lineWidth = 1.4; c.beginPath(); c.moveTo(-w / 2, g - 12 * u); c.lineTo(w / 2, g - 12 * u); c.stroke(); for (let i = 0; i < 9; i++) { c.beginPath(); c.moveTo((-32 + i * 8) * u, g - 12 * u); c.lineTo((-32 + i * 8) * u, g); c.stroke(); }
      c.fillStyle = '#FFE7A8'; for (let i = 0; i < 12; i++) { c.globalAlpha = fade * (0.4 + 0.4 * Math.sin(t * 2 + i)); c.fillRect((-34 + (i * 19) % 68) * u, (-6 + (i * 5) % 8) * u, 1.1 * u, 1.1 * u); } c.globalAlpha = fade;
  }
  if (pal[2]) { c.fillStyle = `rgba(14,8,50,${pal[2]})`; c.fillRect(-w / 2, -h / 2, w, h); }   // the night over everything behind them
  helenMini(-12 * u, g + (d.pose === 'lie' ? 1 * u : 0), u * 0.95, d.pose, t);
  if (d.pose === 'hold') { c.save(); c.translate(-7.6 * u, g - 9.5 * u); c.scale(0.12 * u, 0.12 * u); dBear.draw(c, { aura: false, sparkle: false }); c.restore(); }
  // the thing they play with
  const a = (t % 2.2) / 2.2, kind = d.prop;
  c.save();
  if (kind === 'ball' || kind === 'bone' || kind === 'flower') { const x = lerp(-6, 11, a) * u, y = g - 12 * u - Math.sin(a * Math.PI) * 13 * u + a * 3 * u; c.translate(x, y); c.rotate(a * 9);
    if (kind === 'ball') { c.fillStyle = '#FF7AA5'; c.beginPath(); c.arc(0, 0, 2.2 * u, 0, 7); c.fill(); c.strokeStyle = '#fff'; c.lineWidth = 0.7; c.beginPath(); c.arc(0, 0, 2.2 * u, 0.4, 2.4); c.stroke(); }
    else if (kind === 'bone') { c.fillStyle = '#F6EBD6'; c.fillRect(-2.6 * u, -0.7 * u, 5.2 * u, 1.4 * u); for (const [px, py] of [[-2.6, -0.8], [-2.6, 0.8], [2.6, -0.8], [2.6, 0.8]]) { c.beginPath(); c.arc(px * u, py * u, 0.9 * u, 0, 7); c.fill(); } }
    else { c.fillStyle = '#FF8FB8'; for (let i = 0; i < 5; i++) { const q = i * 1.2566; c.beginPath(); c.arc(Math.cos(q) * 1.2 * u, Math.sin(q) * 1.2 * u, 1.1 * u, 0, 7); c.fill(); } c.fillStyle = '#FFE27A'; c.beginPath(); c.arc(0, 0, 0.9 * u, 0, 7); c.fill(); } }
  else if (kind === 'kite') { const x = (4 + Math.sin(t * 0.9) * 5) * u, y = (-18 + Math.cos(t * 1.3) * 3) * u; c.strokeStyle = 'rgba(255,255,255,.8)'; c.lineWidth = 0.7; c.beginPath(); c.moveTo(-9 * u, g - 11 * u); c.quadraticCurveTo(-2 * u, (g + y) / 2 / u * u, x, y + 4 * u); c.stroke();
    c.translate(x, y); c.rotate(Math.sin(t * 1.4) * 0.25); c.fillStyle = '#FF6F91'; c.beginPath(); c.moveTo(0, -4.4 * u); c.lineTo(3 * u, 0); c.lineTo(0, 5 * u); c.lineTo(-3 * u, 0); c.fill(); c.fillStyle = '#FFD86A'; c.beginPath(); c.moveTo(0, -4.4 * u); c.lineTo(3 * u, 0); c.lineTo(0, 0); c.fill(); }
  else if (kind === 'balloon') { const x = (-3 + Math.sin(t * 0.8) * 3) * u, y = (-12 + Math.sin(t * 1.1) * 2.5) * u; c.strokeStyle = 'rgba(255,255,255,.7)'; c.lineWidth = 0.7; c.beginPath(); c.moveTo(-9 * u, g - 11 * u); c.lineTo(x, y + 3.6 * u); c.stroke(); c.fillStyle = '#FF7AA5'; c.beginPath(); c.ellipse(x, y, 2.6 * u, 3.2 * u, 0, 0, 7); c.fill(); c.fillStyle = 'rgba(255,255,255,.4)'; c.beginPath(); c.ellipse(x - 0.9 * u, y - 1.2 * u, 0.7 * u, 1.1 * u, -0.4, 0, 7); c.fill(); }
  else if (kind === 'star') { const x = (5 + Math.sin(t * 0.7) * 6) * u, y = (-16 + Math.sin(t * 1.5) * 3) * u; c.translate(x, y); c.rotate(t * 0.8); c.fillStyle = '#FFE27A'; c.beginPath(); for (let i = 0; i < 10; i++) { const q = i * Math.PI / 5, r = (i % 2 ? 1.5 : 3.4) * u; c.lineTo(Math.cos(q) * r, Math.sin(q) * r); } c.fill(); }
  else if (kind === 'heart') { c.fillStyle = '#FF6F9C'; for (let i = 0; i < 3; i++) { const p = ((T * 0.4 + i / 3) % 1); c.globalAlpha = Math.sin(p * Math.PI) * fade; heart(c, (-2 + i * 6) * u, g - 14 * u - p * 16 * u, 2 * u); } c.globalAlpha = fade; }
  else { c.fillStyle = 'rgba(200,230,255,.35)'; c.strokeStyle = 'rgba(255,255,255,.8)'; c.lineWidth = 0.7; for (let i = 0; i < 5; i++) { const p = ((T * 0.3 + i * 0.2) % 1), x = (-4 + i * 4 + Math.sin(t * 2 + i) * 1.5) * u, y = g - 8 * u - p * 26 * u, r = (1.2 + (i % 3) * 0.6) * u; c.beginPath(); c.arc(x, y, r, 0, 7); c.fill(); c.stroke(); } }
  c.restore();
  // the little dog in the dream, facing Helen
  const hop = (kind === 'ball' || kind === 'bone' || kind === 'flower') && a > 0.62 && a < 0.92 ? Math.sin((a - 0.62) / 0.3 * Math.PI) * 9 * u : 0;
  c.save(); c.translate(10 * u, g - hop + (d.pose === 'lie' ? 1 * u : 0)); const jk = 0.34 * u; c.scale(-jk, jk); dPup.draw(c); c.restore();
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
  if (J.state === 'off') return; const L = J.L, oy = J.state === 'play' ? (J.oy || 0) : 0, fx = J.fx || J.face, sh = 1 - Math.min(0.6, oy / (90 * L.ps));
  if (J.state[0] !== 'v') { cx.save(); cx.fillStyle = 'rgba(0,0,0,.22)'; cx.beginPath(); cx.ellipse(J.x + 2 * L.ps * fx, L.gy + 1, 24 * L.ps * Math.max(0.45, Math.abs(fx)) * sh, 3 * L.ps * sh, 0, 0, 6.283); cx.fill(); cx.restore(); }
  cx.save(); cx.translate(J.x, L.gy - oy); cx.scale(fx * L.ps, L.ps); pup.draw(cx); cx.restore();
  for (const w of J.woofs) { const x = J.x + (30 + w.t * 10) * L.ps * J.face, y = L.gy - oy - (44 + w.t * 26) * L.ps;
    cx.save(); cx.globalAlpha = 1 - w.t; cx.translate(x, y); cx.rotate(-0.15 + w.k * 0.3); cx.font = `600 ${Math.round(17 * sc + 4)}px Caveat, cursive`; cx.textAlign = 'center';
    cx.lineWidth = 3; cx.strokeStyle = 'rgba(60,30,80,.6)'; cx.strokeText(w.w || 'Woof!', 0, 0); cx.fillStyle = '#FFF3C8'; cx.fillText(w.w || 'Woof!', 0, 0); cx.restore(); }
}
function pupBox() { const L = J.L; if (!L) return null; const a = J.x - 26 * L.ps, b = J.x + 32 * L.ps, oy = J.state === 'play' ? (J.oy || 0) : 0; return J.face > 0 ? [a, L.gy - 56 * L.ps - oy, b, L.gy + 4 - oy] : [2 * J.x - b, L.gy - 56 * L.ps - oy, 2 * J.x - a, L.gy + 4 - oy]; }
pupHit.addEventListener('click', tapPup); pupHit.setAttribute('aria-label', 'Jessi the puppy. Tap for a trick');
dreamHit.addEventListener('click', () => { if (J.dream > 0.5) nextDream(); }); dreamHit.setAttribute('aria-label', 'Jessi’s dream. Tap for the next dream');

// ---------------------------------------------------------------- the ground under them (the countdown only), coloured by the time of day
const GROUND = { night: ['#2A1B47', '#130B22', 'rgba(190,170,255,.30)', 'rgba(60,40,105,.9)', 'rgba(255,236,170,.75)'],
  dusk: ['#563A6C', '#28183A', 'rgba(255,184,150,.40)', 'rgba(70,46,96,.95)', '#FFC6A8'],
  morning: ['#93CF8E', '#5A9A68', 'rgba(255,246,220,.80)', '#6FAE6E', '#FFFFFF'],
  day: ['#86CF6B', '#4D9946', 'rgba(255,255,225,.80)', '#5FAE4F', '#FFF4A8'] };
const BL = Array.from({ length: 110 }, (_, i) => ({ x: (i + Math.random() * 0.8) / 110, h: 4 + Math.random() * 7, p: Math.random() * 6.3 }));
const FLW = Array.from({ length: 16 }, (_, i) => ({ x: (i + 0.5 + (Math.random() - 0.5) * 0.7) / 16, c: ['#FF9FC0', '#FFFFFF', '#FFE27A', '#C9B5FF'][i % 4], p: Math.random() * 6.3 }));
function groundY(x) { const L = J.L; return L.gy + 2 * sc + 22 * sc * Math.pow((x - W / 2) / (W / 2), 2); }
function drawGround(t) {
  const L = J.L; if (!L) return; const [c0, c1, rim, blade, dot] = GROUND[tod()] || GROUND.night, y0 = L.gy + 2 * sc, night = tod() === 'night' || tod() === 'dusk';
  cx.save(); const g = cx.createLinearGradient(0, y0, 0, H); g.addColorStop(0, c0); g.addColorStop(1, c1); cx.fillStyle = g;
  cx.beginPath(); cx.moveTo(0, H); for (let i = 0; i <= 32; i++) { const x = W * i / 32; cx.lineTo(x, groundY(x)); } cx.lineTo(W, H); cx.closePath(); cx.fill();
  cx.strokeStyle = rim; cx.lineWidth = 1.5; cx.beginPath(); for (let i = 0; i <= 32; i++) { const x = W * i / 32; i ? cx.lineTo(x, groundY(x)) : cx.moveTo(x, groundY(x)); } cx.stroke();
  cx.strokeStyle = blade; cx.lineWidth = 1.3; cx.beginPath();
  for (const b of BL) { const x = b.x * W, y = groundY(x) + 1.5, h = b.h * sc, w = Math.sin(t * 1.2 + b.p) * 2 * sc; cx.moveTo(x, y); cx.quadraticCurveTo(x + w * 0.3, y - h * 0.6, x + w, y - h); }
  cx.stroke();
  for (const f of FLW) { const x = f.x * W, y = groundY(x) + 3 * sc; if (Math.abs(x - G.x) < 40 * sc || Math.abs(x - J.x) < 50 * L.ps) continue;
    if (night) { cx.globalAlpha = 0.45 + 0.35 * Math.sin(t * 1.6 + f.p); cx.fillStyle = dot; cx.beginPath(); cx.arc(x, y - 3 * sc, 1.3 * sc, 0, 6.283); cx.fill(); cx.globalAlpha = 1; }
    else { cx.fillStyle = f.c; for (let i = 0; i < 5; i++) { const a = i * 1.2566 + f.p; cx.beginPath(); cx.arc(x + Math.cos(a) * 2 * sc, y - 4 * sc + Math.sin(a) * 2 * sc, 1.5 * sc, 0, 6.283); cx.fill(); } cx.fillStyle = '#FFD86A'; cx.beginPath(); cx.arc(x, y - 4 * sc, 1.1 * sc, 0, 6.283); cx.fill(); } }
  cx.restore();
}
// an open spot of the sky near (x, y) for something w x h px: clear of the words on the countdown and of the two of them
function freeSpot(w, h, x, y) {
  const obs = obstacles($('.s[data-n="c"]')), L = J.L || stage(), top = 14, bot = L.gy - 40 * sc;
  const pr = { left: Math.min(J.x, G.x) - 70 * sc, top: L.gy - 150 * sc, right: Math.max(J.x, G.x) + 60 * sc, bottom: L.gy + 10 };
  let best = null;
  for (let iy = 0; iy <= 12; iy++) for (let ix = 0; ix <= 16; ix++) {
    const px = lerp(w / 2 + 8, W - w / 2 - 8, ix / 16), py = lerp(top + h / 2, Math.max(top + h / 2, bot - h / 2), iy / 12), b = [px - w / 2, py - h / 2, px + w / 2, py + h / 2];
    let c = overlap(b, pr) * 5; for (const o of obs) c += overlap(b, o) * 8; c += Math.hypot(px - x, py - y);
    if (!best || c < best.c) best = { c, p: [px, py] };
  }
  return best.p;
}
const play = makePlay({ bear, pup, G, J, say, woof, sc: () => sc, bk: () => sc * (0.6 + 0.4 * G.vis), W: () => W, H: () => H, tod, days,
  audio: () => { if (!soundOn()) return null; unlockAudio(); return AC; }, busy: () => !!(G.fl || G.drag), free: freeSpot,
  cdBottom: () => ($('.cd') ? $('.cd').getBoundingClientRect().bottom : 0),
  nap: on => { const nt = on && isNight(); J.dreamTo = nt ? 1 : 0; if (nt) { J.sceneT = 0; setDream(); } } });

// ---------------------------------------------------------------- the reveal's dog is Jessi too: the same rig, sitting and wagging beside Helensnowfia and Snowki
const tdSvg = $('.trio .td svg'), trioPup = new Jessi(); let trioC = null;
if (tdSvg) { trioC = document.createElement('canvas'); trioC.setAttribute('aria-hidden', 'true'); tdSvg.replaceWith(trioC); trioPup.act('happy'); }
function drawTrio(dt) {
  if (!trioC || G.step !== 7) return; const w = 140, h = 104, d = Math.min(devicePixelRatio || 1, 2);
  if (trioC.width !== w * d) { trioC.width = w * d; trioC.height = h * d; }
  const x = trioC.getContext('2d'); x.setTransform(d, 0, 0, d, 0, 0); x.clearRect(0, 0, w, h);
  trioPup.update(dt); x.save(); x.translate(w * 0.5, h - 3); x.scale(-1.72, 1.72); trioPup.draw(x); x.restore();
}

// ---------------------------------------------------------------- the banter: from the countdown on, and after every screen, Jessi trots in and she and Snowki tease Helen
// (kindly), squabble with each other and pick fights with her. Beats are [who ('s' Snowki | 'j' Jessi), words, action]. Bubbles never overlap: one of them talks at a time.
const bubJ = $('#gdSayJ'), V = { side: -1, token: 0, timers: [], seen: {}, visits: 0, busy: false, last: 0 };
function sayJ(text, ms = 3600) {
  if (!text) { bubJ.classList.remove('on'); J.sayUntil = 0; return; }
  bubJ.textContent = text; bubJ.classList.add('on'); J.sayUntil = performance.now() + Math.max(ms, text.length > 14 ? 4800 : 2600); placeBubble(bubJ, pupBox() || box(), V.side);
}
const BANTER = {
  c: [
    [['s', 'Helen, refreshing won’t make December come faster 😌', 'think'], ['j', 'Woof! “She’s checking AGAIN.”', 'bark'], ['s', 'Jessi! Don’t expose her!', 'shy'], ['j', 'Woof. “Eight refreshes. I counted.”', 'bark']],
    [['s', 'Psst, Helen… Jessi says you snore.', 'giggle'], ['j', 'WOOF! “I never said that!”', 'bark'], ['s', 'Her ears said it. Very loudly.', 'nod'], ['j', '…woof. “Okay, maybe a tiny bit.”', 'bow']],
    [['s', 'Helen, tell Jessi I’m the real guide.', 'point'], ['j', 'Woof! “I was here first!”', 'bark'], ['s', 'You were asleep in the corner!', 'push'], ['j', '“Resting my eyes.” Woof.', 'yawn']],
    [['j', 'Woof! “Helen, you owe me a biscuit.”', 'paw'], ['s', 'Don’t pay her, Helen. She runs a biscuit mafia.', 'talk'], ['j', 'WOOF! “Say that to my face!”', 'bark'], ['s', '…I’m saying it to your tail. Safer.', 'shy']]
  ],
  0: [
    [['s', 'Hold the heart, Helen. It’s a seal, not a hot idli!', 'point'], ['j', 'Woof! “She’s scared of a heart. Aww.”', 'bark'], ['s', 'Shh. Let her fingers warm up.', 'shh']],
    [['j', 'Woof! “She’s pressing it like a doorbell.”', 'bark'], ['s', 'HOLD, Helen. Hold! Not poke!', 'push'], ['j', '“Poking is faster.” Woof.', 'bow']]
  ],
  1: [
    [['j', 'Woof! “She reads with her lips. Look!”', 'bark'], ['s', 'Jessi, stop watching her read, she’ll get shy!', 'shy'], ['j', '“Too late, she’s blushing.” Woof.', 'bark']],
    [['s', 'Take your time, Helen. It’s a letter, not an exam.', 'nod'], ['j', 'Woof! “She’ll still be reading next birthday.”', 'yawn'], ['s', 'JESSI!!', 'push']]
  ],
  p: [
    [['s', 'Forgot the password already? I’m not telling.', 'think'], ['j', 'Woof! “I know it. I’m not telling either.”', 'paw'], ['s', 'Think, Helen. Think like a… well, like a Helen.', 'talk']],
    [['j', 'Woof! “Try ‘password’. Everyone does.”', 'bark'], ['s', 'Jessi, that is NOT a hint!', 'push'], ['j', '“It’s a lifestyle.” Woof.', 'yawn']]
  ],
  2: [
    [['j', 'Woof! “So many photos! Where’s the one where Snowki cries?”', 'bark'], ['s', 'I NEVER cried! I had… teddy dust in my eyes.', 'shy'], ['j', '“For three days.” Woof.', 'bark']],
    [['s', 'Look at them all, Helen. So serious in every one.', 'talk'], ['j', 'Woof! “Except when food arrived.”', 'bark'], ['s', 'Fair. That was the best smile.', 'giggle']]
  ],
  3: [
    [['s', 'Tick tock, Helen. Staring at the clock won’t speed it up.', 'think'], ['j', 'Woof! “Same as staring at biryani.”', 'bark'], ['s', 'Jessi, everything is about food with you!', 'push']],
    [['j', 'Woof! “Is it done yet? Is it done yet?”', 'bark'], ['s', 'Helen, please. She asks me this every ten seconds.', 'shy']]
  ],
  4: [
    [['s', 'Helen, you’re smiling. Don’t deny it, I can see it!', 'point'], ['j', 'Woof! “She hid it behind her hand!”', 'bark'], ['s', 'Caught you. Both of you!', 'giggle']],
    [['j', 'Woof! “Plot twist: she’s actually enjoying this.”', 'bark'], ['s', 'Don’t jinx it!', 'push']]
  ],
  5: [
    [['s', 'Make a wish, Helen. A good one. Not “free biryani” again.', 'talk'], ['j', 'Woof! “That is a valid wish!”', 'bark'], ['s', 'Fine. Wish biryani for Jessi too. She’ll stop barking.', 'nod']],
    [['j', 'Woof! “Wish for a bigger bone. For me.”', 'paw'], ['s', 'Wish for peace and quiet. For ME.', 'shh']]
  ],
  7: [
    [['s', 'Happy birthday, Helen! ♡ Jessi, say it too!', 'cheer'], ['j', 'Woof! “Happy birthday! Where’s my cake?”', 'bark'], ['s', 'Jessi, no cake for you yet!', 'push'], ['j', 'WOOF! “Rude!”', 'bow']],
    [['j', 'Woof! “Birthday girl! Birthday girl!”', 'spin'], ['s', 'Calm down, you’ll break the page!', 'shy'], ['j', '“Make me.” Woof.', 'flip']]
  ]
};
const ALONE = [   // the countdown when she hasn’t called Jessi
  [['s', 'Helen, a countdown is not a TV episode. No skipping.', 'think'], ['s', '…Okay, I’ll sing to pass the time. La la— no? Fine.', 'shy']],
  [['s', 'Psst, Helen. Still here? You’re very dedicated.', 'giggle'], ['s', 'Jessi would say something rude now. Lucky you.', 'nod']]
];
const SIDE = {
  s: [['s', 'HA! Told you, Jessi! Point to Snowki!', 'cheer'], ['j', 'WOOF?! “After all my belly rubs?!”', 'bark'], ['s', 'Don’t cry, Jessi. You’re still second best.', 'nod'], ['j', '“I’ll remember this at snack time.” Woof.', 'bow']],
  j: [['j', 'Woof! “Obviously. Next question.”', 'bow'], ['s', 'WHAT?! I carried your snacks!', 'push'], ['j', '“And I ate them. Thank you.” Woof.', 'bark'], ['s', '…I’m sitting in the corner now.', 'shy']],
  n: [['s', 'She’s pretending she didn’t hear us.', 'think'], ['j', 'Woof! “Classic Helen.”', 'bark'], ['s', 'We’ll ask again later. No escape!', 'point']]
};
const JPOKE = ['Woof! “Hands off the fur, Helen!”', 'Woof! “I’m working. Come back later.”', 'Woof! “That’s a paid belly rub!”'];
const POKES = ['Poke number five! I’m counting, Helen.', 'Six! Do I look like a doorbell?', 'Seven! I’m telling Jessi to sit on you.', 'Okay, okay! Truce? ♡'];
const vt = (f, ms) => V.timers.push(setTimeout(f, ms));
function banterStop() { V.again = null; V.token++; V.timers.forEach(clearTimeout); V.timers = []; V.busy = false; sayJ(''); }
function pick(list, key) { V.seen[key] = V.seen[key] == null ? (Math.random() * list.length) | 0 : V.seen[key] + 1; return list[V.seen[key] % list.length]; }
function poofAtXY(x, y) { for (let i = 0; i < 20; i++) { const a = Math.random() * 6.283, v = 40 + Math.random() * 130; G.trail.push({ x, y: y - 24 * sc, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 30, life: 0.6 + Math.random() * 0.5, s: 2 + Math.random() * 3.2 }); } }
function runBeats(beats, tok, done) {
  let i = 0;
  const next = () => {
    if (tok !== V.token) return;
    const b = beats[i++]; if (!b) { done(); return; }
    const [who, text, act] = b, ms = clamp(text.length * 70 + 2600, 4800, 8000), dirP = J.x < G.x ? -1 : 1;
    if (who === 's') { sayJ(''); say(text, ms); bear.act(act || 'talk', { restart: true, dir: [dirP, 0] }); G.react = ms / 1000 + 0.3; G.idle = 99; }
    else if (!['off', 'leave', 'vout', 'enter', 'play'].includes(J.state)) {
      say(''); const asleep = J.state === 'sleep'; sayJ(asleep ? 'Zzz… ' + text : text, ms);
      if (asleep) dogSay('sleepy');
      if (!asleep) { pup.act(act || 'bark', { restart: true, sit: true }); const md = /^WOOF[!?]/.test(text) ? (/\?!/.test(text) ? 'yelp' : 'angry') : /^…/.test(text) ? 'sheepish' : /^(Woof\.|“)/.test(text) ? 'soft' : 'happy';
        if (act === 'yawn') dogSay('yawn'); else if (act === 'bow' && md === 'happy') dogSay('soft'); else if (/woof/i.test(text) || act === 'bark' || act === 'paw') woof(md === 'angry' || (md === 'happy' && act === 'bark') ? 2 : 1, md); if (J.state === 'vsit') vt(() => { if (J.state === 'vsit') pup.act('sit', { restart: true }); }, 1700); }
    }
    vt(next, ms + 300);
  };
  next();
}
function banterC(after) {   // on the countdown: right where they are (the first time, right after Jessi arrives, before the games start)
  if (V.busy) return; V.busy = true; const tok = ++V.token, beats = J.state === 'off' ? ((V.cn = (V.cn || 0) + 1) % 2 ? pick(ALONE, 'alone') : [['s', pickLine(TEASE_S), 'giggle']]) : ((V.cn = (V.cn || 0) + 1) % 2 ? pick(BANTER.c, 'c') : randExch());
  runBeats(beats, tok, () => { V.busy = false; V.last = performance.now(); G.react = 1.2; G.idle = 6; after && after(); });
}
const visitSpot = () => { const ps = clamp(sc * 1.8, 1.4, 2.3), side = G.x > W * 0.42 ? -1 : 1; return { ps, side, x: clamp(G.x + side * (88 * sc + 32 * ps), 40 * ps, W - 40 * ps), gy: G.y + 2 }; };
function visit(key) {   // Jessi runs in from the nearest edge, sits beside him, they talk, then she runs off again
  if (V.busy || J.state !== 'off') return; V.busy = true; V.visits++; const tok = ++V.token, sp = visitSpot(); V.side = sp.side;
  J.L = { gy: sp.gy, ps: sp.ps, cloud: [0, 0, 0, 0] }; J.dream = 0; J.dreamTo = 0; J.x = sp.side < 0 ? -70 * sp.ps : W + 70 * sp.ps; J.face = J.fs = sp.side < 0 ? 1 : -1; J.state = 'vin'; J.key = key; J.tok = tok;
  pup.act('run', { restart: true, vx: PUP_RUN }); dogSay('pant', 4); bear.act('alert', { restart: true, dir: [sp.side, 0] }); G.react = 2; G.idle = 99;
}
function visitArrive() {
  const tok = J.tok, key = J.key; J.face = V.side < 0 ? 1 : -1; pup.bump(40); pup.act('sit', { restart: true }); poofAtXY(J.x, J.L.gy); woof(3, 'excited');
  V.first = V.first || {}; vt(() => runBeats(key === 'perch' ? pick(BANTER.perch, 'perch') : V.first[key] ? randExch() : (V.first[key] = true, pick(BANTER[key], key)), tok, () => { if (V.visits % 3 === 0) sidePrompt(tok); else visitLeave(tok); }), 700);
}
function visitLeave(tok) {
  if (tok !== V.token) return; sayJ(''); say(''); bear.act('wave', { restart: true }); G.react = 1.6; G.idle = 6;
  V.exit = V.side; J.face = V.exit; J.state = 'vout'; pup.act('run', { restart: true, vx: PUP_RUN }); woof(1, 'happy');
}
function sidePrompt(tok) {   // “who’s better?”: the loser fights back
  if (tok !== V.token) return; say(''); sayJ('');
  const choose = list => { if (tok === V.token) runBeats(list, tok, () => visitLeave(tok)); };
  ask('Be honest, Helen… who’s better? 😏', [[NAME + ' ♡', () => choose(SIDE.s)], ['Jessi 🐾', () => choose(SIDE.j)]]);
  vt(() => { if (!askEl.hidden && tok === V.token) { hideAsk(); choose(SIDE.n); } }, 9000);
}
function stepVisit(dt, L) {
  const sp = visitSpot(); L.gy = lerp(L.gy, sp.gy, Math.min(1, dt * 8)); L.ps = sp.ps;
  if (J.state === 'vin') { J.target = sp.x; const d = J.target - J.x, st = PUP_RUN * L.ps * dt; if (Math.abs(d) <= st * 1.2) { J.x = J.target; J.state = 'vsit'; visitArrive(); } else J.x += Math.sign(d) * st; }
  else if (J.state === 'vsit') J.x = lerp(J.x, sp.x, Math.min(1, dt * 5));
  else if (J.state === 'vout') { J.x += V.exit * PUP_RUN * L.ps * dt; if (J.x < -90 * L.ps || J.x > W + 90 * L.ps) { J.state = 'off'; V.busy = false; if (V.again) vt(V.again, 26000 + Math.random() * 18000); } }
}
function jessiPoked() {
  sayJ(JPOKE[(V.pj = (V.pj || 0) + 1) % JPOKE.length], 2600); pup.act('bark', { restart: true, sit: true }); woof(1, 'yelp');
  vt(() => { if (J.state === 'vsit') { sayJ(''); say('Don’t poke her, Helen. She bites. Words. She bites words.', 2800); bear.act('shy', { restart: true }); } }, 2000);
}
function scheduleBanter(n) {
  if (!BANTER[n]) return; const delay = { c: 22000, 0: 6500, 1: 9500, p: 6500, 2: 8500, 3: 7500, 4: 9000, 5: 9500, 7: 9500 }[n];
  const go = () => {
    if (G.step !== n) return;
    const typing = document.activeElement && /^(INPUT|TEXTAREA)$/.test(document.activeElement.tagName);
    const busy = G.script || G.fl || G.drag || play.on || !askEl.hidden || G.sayUntil > performance.now() || window.__albumOpen || G.hidden || V.busy || typing;
    if (n === 'c') { if (!busy && ['show', 'sleep', 'off'].includes(J.state) && performance.now() - V.last > 20000) banterC(); vt(go, 4000); return; }
    if (busy || J.state !== 'off') { vt(go, 2500); return; }
    visit(n);
  };
  V.again = go; vt(go, delay);
}

// ---------------------------------------------------------------- more fun: 120 teases for Helen, 35 squabbles, scolds, and real physics for picking him up
// (kind teasing only: every line is affectionate). Lines stay on screen ≥ 5 s; they never repeat until the pool has been used up.
const TEASE_S = [   // Snowki → Helen
  'Helen, you’re reading this with your mouth open. Just saying.', 'Did you just read that twice? It said the same thing, Helen.', 'Take a deep breath, Helen. And… don’t forget to breathe out!',
  'I’m a teddy and even I read faster than you 😏', 'Helen, your phone is at 3%. I can feel it. Plug in, queen.', 'Fun fact: Helen says “two minutes” and means “forty.”',
  'You’ve been on this page so long, the page is getting shy.', 'I bet Helen is about to say “I’m not hungry.” Then eat my share.', 'Helen, you can’t pause a birthday. Believe me, I tried.',
  'Is that a smile, Helen? Don’t hide it, I can see it from here!', 'Not saying you’re slow, Helen. My fluff just grew while waiting.', 'Helen’s snack drawer: 40% snacks, 40% wrappers, 20% “I’ll share, I swear.”',
  'Helen, “just checking one thing” is never one thing.', 'You blink so slowly, Helen. Are you buffering?', 'Helen: “I’m not sleepy.” Also Helen: *yawns in 4K*', 'Rumour: Helen takes 47 selfies and posts the first one.',
  'Helen walks into a room and forgets why. Very brave.', 'Helen, your hair tie is on your wrist. It was always on your wrist.', 'Helen’s idea of “on my way” is putting on socks.',
  'Spot the Helen: the one saying “five more minutes” for an hour.', 'Helen laughs like a squeaky toy. Jessi approves.', 'Helen, tap me again and I’ll start charging per tap. ♡',
  'Helen sings in the shower. The neighbours know all the wrong lyrics now.', 'Helen’s favourite exercise: jumping to conclusions. And snack runs.', 'Helen says “I’m fine” when she means “bring chocolate.”',
  'Helen has “nothing to wear” and fourteen pairs of blue jeans.', 'Look at you, Helen, smiling at a teddy bear. Adorable. Embarrassing. Mostly adorable.', 'Helen finds a dessert menu in 0.2 seconds but never her keys.',
  'Helen, your tea went cold again. It’s a tradition now.', 'Don’t tell Helen, but she’s a tiny bit bossy about the remote.', 'Helen named her cactus and still overwatered it.',
  'Helen: “I’ll start tomorrow.” Tomorrow: “I’ll start tomorrow.”', 'Helen trips over flat ground. It’s her signature move.', 'Helen, it’s not a competition, but you do argue like it is.',
  'Plot twist: Helen always gets the last word. Even after the last word.', 'Helen’s voice notes are longer than my whole bedtime story.', 'Helen cries at advertisements. The one with the puppy, right?',
  'Helen has seven alarms. She hears none of them.', 'Helen treats dessert like a separate meal. Respect.', 'Helen, don’t say “I’m not mad.” Your eyebrows are speaking.',
  'Helen asks “what’s for dinner?” while eating dinner.', 'Helen would win Olympic gold in staying under a blanket.', 'Helen, you’re my favourite human. Don’t tell the other humans. (There are none.)',
  'Helen’s map reading: “Google says left, so… right.”', 'Helen charges her phone to 100% and unplugs at 80%. Pure chaos energy.', 'Helen’s headphones get tangled even when she never uses them.',
  'Helen’s “quick call” lasted until sunset last time.', 'Helen says “I’m on a diet” while holding a samosa. Interesting.', 'Helen finishes my sentences. Wrongly. With confidence.',
  'Helen has strong opinions about pizza toppings and zero patience.', 'If clumsy were a sport, Helen would need a trophy shelf.', 'Helen sneezes like a baby dragon. Tiny. Dramatic.',
  'Helen says she’s “not a morning person” at 2 pm.', 'Helen, be honest: how many tabs are open? Sixty? Seventy?', 'Helen reads the last page of the book first. We all know it.',
  'Helen stares at the fridge hoping it changes. Same, honestly.', 'Helen is the only person who loses her glasses while wearing them.', 'I tried to count Helen’s hair clips. Ran out of paws.',
  'Helen’s “I’ll be quick” has its own time zone.', 'Helen, you say “one chocolate” and mean “the whole bar.” I respect it.', 'Helen puts her phone down “for a second.” Search party: 40 minutes.'
];
const TEASE_J = [   // Jessi → Helen
  'Woof! “Helen, I smell biryani. Where?!”', 'Woof! “She said ‘one more episode’. It was 3 am.”', 'Woof! “Helen, your socks don’t match. Again.”', 'Woof! “I stole your slipper. Fight me.”',
  'Woof! “Helen snores in three different keys.”', 'Woof! “Why is Helen talking to the fridge?”', 'Woof! “She laughs like a squeaky toy. I love it.”', 'Woof! “Helen, my belly needs a rub. It’s an emergency.”',
  'Woof! “Helen, you’re holding the phone upside down. Again.”', 'Woof! “She said ‘two minutes’. I waited two hours.”', 'Woof! “Helen, that’s my spot. Move over, queen.”',
  'Woof! “Helen has a snack radar better than mine.”', 'Woof! “She cried at the dog movie. Twice.”', 'Woof! “Helen, you walked into the same door yesterday.”', 'Woof! “The cactus told me you overwater it.”',
  'Woof! “Helen, stop checking your phone. Check ME.”', 'Woof! “Helen’s sleepy face is my favourite.”', 'Woof! “She danced in the kitchen. The kitchen needs therapy.”',
  'Woof! “Helen, I can smell the chocolate under your pillow.”', 'Woof! “Helen says she’s not hungry. Her tummy says WOOF.”', 'Woof! “She sings songs in her own words. Mostly nonsense. Mostly lovely.”',
  'Woof! “Helen: world’s slowest ‘I’m leaving now’.”', 'Woof! “Helen, I found a hair tie in my bed. Why.”', 'Woof! “She named all her plants. I named all her snacks.”',
  'Woof! “Helen pretends not to share. Then shares. Soft human.”', 'Woof! “Helen calls me her baby and then steals my blanket.”', 'Woof! “Helen, I counted your coffees today. Ran out of paws.”',
  'Woof! “She says she’ll walk me ‘in a minute’. Minute = sunset.”', 'Woof! “Helen, your tea’s cold. It’s always cold. It’s fine.”', 'Woof! “Helen has a ‘nothing to wear’ problem. Her wardrobe disagrees.”',
  'Woof! “Helen tripped on air. I saw it.”', 'Woof! “She whispers to Snowki. I hear everything.”', 'Woof! “Helen, why is your pillow warmer than me?”', 'Woof! “Helen types with two fingers and 100% confidence.”',
  'Woof! “Helen, you owe me three biscuits and an apology.”', 'Woof! “She’s pretending to be calm. Her eyebrows are wagging.”', 'Woof! “Helen, sit. Good girl. Now give me snacks.”',
  'Woof! “She said she’s going to bed early. Lie detected.”', 'Woof! “Helen, stop reading aloud. My ears are sensitive. Fine, keep going.”', 'Woof! “Helen once ate my biscuit and blamed me. Legend.”',
  'Woof! “If Helen were a dog, she’d be a very stubborn corgi.”', 'Woof! “Helen, you can’t hide the chips. I’m a German Shepherd.”', 'Woof! “‘Just one more episode’ — Helen, every night.”',
  'Woof! “Helen, yes, I see you hiding under the blanket.”', 'Woof! “Best smile in town. Don’t let it go to your head, Helen.”', 'Woof! “Helen, I licked your shoe. You’re welcome.”',
  'Woof! “Helen, you’re a little drama queen. My favourite.”', 'Woof! “She argues with the weather forecast. Poor weather.”', 'Woof! “Helen lost her keys. They’re in her hand.”',
  'Woof! “Helen, your phone’s been ringing. I’m tired.”', 'Woof! “Helen asks ‘what’s that smell?’ It’s her chocolate. I know.”', 'Woof! “Birthday girl, remember who loves you most: me.”',
  'Woof! “Helen, don’t stare at the clock. It stares back.”', 'Woof! “Helen, you forgot to blink. I counted.”', 'Woof! “Helen’s sneeze is cuter than my bark. Don’t tell anyone.”',
  'Woof! “Helen, you promised me a walk. Eat later.”', 'Woof! “Helen thinks she’s sneaky. I heard the biscuit tin from two rooms away.”', 'Woof! “Helen, your blanket is mine now. Law of the sofa.”'
];
const REPLY_S = ['Jessi, you can’t just say that! …she’s not wrong, though.', 'Ha! Good one, Jessi. Don’t tell her I laughed.', 'JESSI! Helen is right here!', 'Wow. Jessi said what we were all thinking.', 'Helen, don’t look at me, I had nothing to do with that.'];
const EXCH = [   // squabbles between the two of them (and sometimes Helen is the judge)
  [['s', 'Jessi, your breath smells like biscuit dust.', 'push'], ['j', 'Woof! “That’s my perfume.”', 'bark'], ['s', 'It’s a crime scene, Jessi.', 'shy']],
  [['j', 'Woof! “Snowki, you’re 40% fluff, 60% attitude.”', 'bark'], ['s', 'And 100% adorable, thank you!', 'cheer']],
  [['s', 'Jessi, I am the guide. You are the… tail.', 'point'], ['j', 'Woof! “The tail wags the guide.”', 'bark'], ['s', '…that makes no sense, but I hate it.', 'shy']],
  [['j', 'Woof! “Race you to that button!”', 'bark'], ['s', 'I fly, Jessi. I FLY.', 'cheer'], ['j', '“Show-off.” Woof.', 'bow']],
  [['s', 'Jessi, get off my hug.', 'hug'], ['j', 'Woof! “Your hug has a warm spot.”', 'bark'], ['s', 'That’s my heart, Jessi!', 'push']],
  [['j', 'Woof! “Snowki, do you even have legs?”', 'bark'], ['s', 'Yes! Two! Short. Fashionable.', 'kick'], ['j', '“Squishy.” Woof.', 'bow']],
  [['s', 'Jessi barked at the clock again.', 'think'], ['j', 'Woof! “It looked at me first!”', 'bark']],
  [['j', 'Woof! “Snowki hugs everything. Even the sofa.”', 'bark'], ['s', 'It hugged back!', 'hug'], ['j', '“It’s a sofa, Snowki.” Woof.', 'yawn']],
  [['s', 'Jessi, you chew everything.', 'point'], ['j', 'Woof! “Except your ears. They taste like cotton.”', 'bark'], ['s', 'JESSI!!', 'push']],
  [['j', 'Woof! “Snowki, you can’t catch a ball.”', 'bark'], ['s', 'I can! With my face.', 'giggle'], ['j', '“That’s not catching.” Woof.', 'bow']],
  [['s', 'Jessi’s tail wags louder than her bark.', 'giggle'], ['j', 'Woof! “Snowki’s bow is lopsided.”', 'bark'], ['s', 'It’s artistic!', 'shy']],
  [['j', 'Woof! “Snowki, I found your sock. I buried it.”', 'bark'], ['s', 'I don’t wear socks!', 'push'], ['j', '“Exactly. It’s a mystery.” Woof.', 'yawn']],
  [['s', 'Jessi, stop sitting on my page.', 'push'], ['j', 'Woof! “It’s a comfortable page.”', 'bark'], ['s', 'It’s MY page!', 'push']],
  [['j', 'Woof! “Snowki cried at the sunset. I saw.”', 'bark'], ['s', 'It was SO pretty!', 'shy'], ['j', '“Soft.” Woof.', 'bow']],
  [['s', 'Let’s settle this: I’m cuter!', 'cheer'], ['j', 'Woof! “I’m fluffier!”', 'bark'], ['s', 'Helen, you be the judge!', 'point'], ['j', '“Bribery!” Woof.', 'bark']],
  [['j', 'Woof! “Snowki, you snore.”', 'bark'], ['s', 'Teddies don’t snore.', 'nod'], ['j', '“Squeak-squeak-zzz. That’s a snore.” Woof.', 'yawn']],
  [['s', 'Jessi ate the biscuit I was saving for Helen!', 'push'], ['j', 'Woof! “It was an emergency.”', 'bark'], ['s', 'What emergency?!', 'push'], ['j', '“Hunger.” Woof.', 'bow']],
  [['j', 'Woof! “Let’s swap: I guide, you chase the ball.”', 'bark'], ['s', 'Deal… wait, no.', 'think']],
  [['s', 'You’re a dog, Jessi. Dogs do not lead.', 'point'], ['j', 'Woof! “Dogs lead the walk. Always.”', 'bark'], ['s', 'Fine. Lead us to the snacks.', 'nod']],
  [['j', 'Woof! “Snowki, you float too slowly.”', 'bark'], ['s', 'I glide. Elegantly.', 'cheer'], ['j', '“Slowly.” Woof.', 'yawn']],
  [['s', 'Jessi, can you not bark at the full stops?', 'think'], ['j', 'Woof! “They look like tiny balls.”', 'bark'], ['s', 'They’re punctuation!', 'push']],
  [['j', 'Woof! “Snowki, you fall asleep mid-sentence.”', 'bark'], ['s', 'I was… dramatically pausing.', 'shy'], ['j', '“With snoring.” Woof.', 'yawn']],
  [['s', 'Jessi, you left paw prints on the title!', 'push'], ['j', 'Woof! “Signature.”', 'bark'], ['s', 'Nobody asked for a signature!', 'push']],
  [['j', 'Woof! “Race to the heart? Loser carries Helen’s cake.”', 'bark'], ['s', 'You’ll eat the cake!', 'push'], ['j', '“Obviously.” Woof.', 'bow']],
  [['s', 'Jessi thinks she’s a lion.', 'giggle'], ['j', 'Woof! “Snowki thinks he’s a cloud.”', 'bark'], ['s', '…a cloud with a bow.', 'shy']],
  [['j', 'Woof! “Hey Snowki, what’s your favourite colour?”', 'bark'], ['s', 'Blue. Obviously.', 'nod'], ['j', '“Boring.” Woof.', 'yawn']],
  [['s', 'Helen, notice how Jessi pretends not to hear me?', 'point'], ['j', 'Woof! “…What?”', 'bark'], ['s', 'See!', 'push']],
  [['j', 'Woof! “Snowki, your tummy has a heart on it. Is that a target?”', 'bark'], ['s', 'It’s love!', 'hug'], ['j', '“Looks like a target.” Woof.', 'bow']],
  [['s', 'If Jessi were a pizza, she’d be all cheese.', 'giggle'], ['j', 'Woof! “If Snowki were a pizza, he’d be a pillow.”', 'bark'], ['s', '…a delicious pillow!', 'cheer']],
  [['j', 'Woof! “Snowki, quick fight!”', 'bark'], ['s', 'Pillow fight or bark fight?', 'think'], ['j', '“Hug fight.” Woof.', 'bow']],
  [['s', 'I taught Jessi to sit. She taught me nothing.', 'think'], ['j', 'Woof! “I taught you to nap.”', 'bark'], ['s', 'That… is true.', 'shy']],
  [['j', 'Woof! “Snowki, I hid your bow.”', 'bark'], ['s', 'Where?!', 'push'], ['j', '“On your head.” Woof.', 'bow']],
  [['s', 'Jessi barks at butterflies. Butterflies don’t care.', 'giggle'], ['j', 'Woof! “They SMILE at me!”', 'bark']],
  [['j', 'Woof! “Snowki, you’re so soft. Like a marshmallow.”', 'bark'], ['s', 'Don’t bite me!', 'push'], ['j', '“No promises.” Woof.', 'bow']],
  [['s', 'Jessi: 98% fur, 2% chaos.', 'point'], ['j', 'Woof! “Snowki: 98% fluff, 2% brain.”', 'bark'], ['s', 'The 2% is enough!', 'cheer']]
];
BANTER.perch = [   // Jessi finds him stuck on the words
  [['j', 'Woof! “Snowki is hanging off the sentence. Classic.”', 'bark'], ['s', 'Don’t laugh! HELEN! Get me out!', 'push'], ['j', '“Take your time, Helen.” Woof.', 'bow']],
  [['j', 'Woof! “Why is the guide on the homework?”', 'bark'], ['s', 'It’s NOT homework, it’s a poem! Help!', 'push'], ['j', '“Nice view?” Woof.', 'yawn']],
  [['j', 'Woof! “I’d help, but I have no thumbs. Sorry.”', 'bark'], ['s', 'You have TEETH, Jessi!', 'push'], ['j', '“Not for rescuing.” Woof.', 'bow']]
];
const SCOLD = ['Helen! Get me out of here!', 'I’m stuck on your words! Rescue me!', 'Helen, this is NOT a perch! Pull me off!', 'Hellooo? Teddy in trouble!', 'I’m a guide, not a bookmark!', 'You put me here! Take me down!',
  'My fluff is getting inky!', 'Helen!! I’m getting dizzy up here!', 'I trusted you with my arms!', 'If I fall it’s YOUR fault!', 'Don’t just stare! Grab me!', 'Is this how you treat the birthday guide?!',
  'I’m telling Jessi you left me stuck!', 'Helen… Helen… HELEN!!', 'One finger! Just one finger and drag me out!', 'Tick tock, Helen. Save the teddy!', 'This text is itchy!', 'I’ll give you a hug if you save me ♡',
  'Helen, the longer you wait, the fluffier my anger gets!', 'Is anybody there?! Besides a very slow Helen?'];
const SCOLD_HANG = ['My arms! My fluffy arms!', 'I’m hanging by a sentence, Helen!', 'Pull me down! Pleeease!', 'I can’t feel my paws!', 'I’m dangling off your words like laundry!', 'Helen, my bow is falling off!'];
const SCOLD_STAND = ['It’s windy up here!', 'Careful, I might step on a vowel!', 'Helen, I’m standing on your sentence! It’s wobbling!', 'How do I get down from a paragraph?!', 'I can see your whole page from here. Very messy.', 'Helen, I’m too high up on your text!'];
const THROW = ['OOF! Helen! I’m fluff, not a ball!', 'Wheeeee— THUD. Ow.', 'Did you just THROW me?! Rude!', 'I saw stars. Pretty ones. Still mad.', 'Seven out of ten. Needs more spin.', 'My ears are on backwards!',
  'Next time warn the teddy!', 'That’s plushie assault, Helen!', 'I bounced! Did you see me bounce?!', 'Helen, I’m not a stress ball. …Okay, do it again.', 'Gravity: 1. Snowki: 0.', 'I’m dizzy. The page is spinning. Is the page spinning?'];
const DROPPED = ['Whoa! Careful, Helen!', 'Soft landing. Barely.', 'You dropped me! Again?! …Okay, I’m fine.', 'Gentle, Helen! I’m a delicate teddy!'];
const RESCUE = ['Finally! Took you long enough.', 'My hero! A slow hero, but still a hero ♡', 'Phew. Thank you, Helen… now don’t do it again.', 'I’m counting that as a hug.', 'You saved me! I was seconds from crying. …Minutes. Hours.'];
const FEDUP = ['Fine! I’ll rescue myself!', 'Okay, I’m leaving! Nobody help me!', 'Too slow, Helen! Magic mode: ON.'];
const vrec = new Map();
function pickLine(arr) {   // a random line that hasn’t been used recently
  let r = vrec.get(arr) || [], i; do { i = (Math.random() * arr.length) | 0; } while (r.includes(i) && arr.length > 6);
  r.push(i); if (r.length > Math.min(40, arr.length - 3)) r.shift(); vrec.set(arr, r); return arr[i];
}
const randExch = () => { const e = EXCH[(Math.random() * EXCH.length) | 0]; return Math.random() < 0.5 ? e.concat([Math.random() < 0.5 ? ['j', pickLine(TEASE_J), 'bark'] : ['s', pickLine(TEASE_S), 'giggle']]) : e; };
const jessiHere = () => ['show', 'sleep', 'vsit'].includes(J.state);
function teaseOnce() {   // one random tease for Helen, from whoever is around
  const useJ = jessiHere() && Math.random() < 0.45;
  if (useJ) { const text = pickLine(TEASE_J); sayJ(text, 5800);
    if (J.state === 'sleep') dogSay('sleepy'); else { pup.act('bark', { restart: true, sit: true }); woof(1, 'happy'); if (J.state === 'vsit') vt(() => { if (J.state === 'vsit') pup.act('sit', { restart: true }); }, 1700); }
    if (Math.random() < 0.4) vt(() => { if (!G.perch && !G.ph && !G.drag) { say(pickLine(REPLY_S), 5200); bear.act('shy', { restart: true }); } }, 6400); }
  else { const acts = ['talk', 'giggle', 'point', 'think', 'nod', 'shy', 'wave', 'kick'], a = acts[(Math.random() * acts.length) | 0];
    say(pickLine(TEASE_S), 5800); bear.act(a, { restart: true, dir: [W / 2 - G.x, H / 2 - G.y], expr: a === 'talk' ? 'smile' : undefined }); G.react = 5.4; G.idle = 99; }
}
function teaseLoop(n) {   // on every screen, now and then, someone teases Helen
  const go = () => {
    if (G.step !== n) return;
    const typing = document.activeElement && /^(INPUT|TEXTAREA)$/.test(document.activeElement.tagName);
    const busy = G.script || G.fl || G.drag || G.ph || G.perch || play.on || !askEl.hidden || G.sayUntil > performance.now() || J.sayUntil > performance.now() || window.__albumOpen || G.hidden || V.busy || typing || G.vis < 0.5;
    if (!busy && !(n === 'c' && J.state === 'enter')) teaseOnce();
    vt(go, 11000 + Math.random() * 8000);
  };
  vt(go, 8000 + Math.random() * 5000);
}

// ---------------------------------------------------------------- real physics: pick him up and throw him; drop him on the words and he stands (or hangs) there and scolds Helen until she gets him out
Object.assign(G, { ph: null, perch: null, rot: 0, rotTo: 0, rescued: false });
const floorY = () => (G.step === 'c' && J.L ? J.L.gy : H - 8);
let PR = { t: 0, list: [] };
function perchRects() {   // the lines of text and the buttons he could stand on or hang from (screen px)
  const now = performance.now(); if (now - PR.t < 120) return PR.list; PR.t = now;
  const sec = $('.s.on'), out = [], rg = document.createRange(); if (!sec) return (PR.list = out);
  for (const el of sec.querySelectorAll('h1,p,button,.btn,.link,.cd')) {
    if (el.closest('[hidden]')) continue; const cs = getComputedStyle(el); if (cs.visibility === 'hidden' || +cs.opacity < 0.3) continue;
    if (/^(P|H1)$/.test(el.tagName)) { rg.selectNodeContents(el); [...rg.getClientRects()].forEach((r, i) => { if (r.width > 50 && r.height > 6) out.push({ el, idx: i, r }); }); }
    else { const r = el.getBoundingClientRect(); if (r.width > 50 && r.height > 6) out.push({ el, idx: 0, r }); }
  }
  return (PR.list = out);
}
function rectOf(P) { const el = P.el; if (!el.isConnected) return null; if (/^(P|H1)$/.test(el.tagName)) { const rg = document.createRange(); rg.selectNodeContents(el); const rs = [...rg.getClientRects()]; return rs[P.idx] || rs[0] || null; } return el.getBoundingClientRect(); }
function nearText(x, y, maxD) {
  const cy = y - 56 * sc; let best = null;
  for (const t of perchRects()) { const r = t.r, dx = Math.max(r.left - x, 0, x - r.right), dy = Math.max(r.top - cy, 0, cy - r.bottom), d = Math.hypot(dx, dy);
    if (d < maxD && (!best || d < best.d)) best = { ...t, d, mode: cy < (r.top + r.bottom) / 2 ? 'stand' : 'hang' }; }
  return best;
}
function landing(x, y0, y1) { for (const t of perchRects()) { const r = t.r; if (r.width >= 70 && x > r.left + 8 && x < r.right - 8 && y0 <= r.top + 2 && y1 >= r.top) return t; } return null; }
function startPerch(t, x) {
  G.ph = null; G.rotTo = 0; G.fl = null; const r = t.r;
  G.perch = { el: t.el, idx: t.idx, mode: t.mode, dx: clamp(x - r.left, 14 * sc, Math.max(14 * sc, r.width - 14 * sc)), t0: performance.now(), next: performance.now() + 700, jess: false };
  if (t.mode === 'hang') bear.act('dangle', { restart: true }); else bear.act('stand', { restart: true, stand: true });
  bear.express('oops'); G.react = 0; G.idle = 99; poofAtXY(G.x, G.y); say('');
}
function perchPos() { const P = G.perch, r = rectOf(P); if (!r) return null; return [clamp(r.left + P.dx, 24, W - 24), P.mode === 'stand' ? r.top + 1 : r.bottom + 100 * sc]; }
function scold(tap) {
  const P = G.perch; if (!P) return; const pool = Math.random() < 0.45 ? (P.mode === 'hang' ? SCOLD_HANG : SCOLD_STAND) : SCOLD;
  say(tap ? 'Don’t just poke me! PULL me out!' : pickLine(pool), 5600);
  if (P.mode === 'hang') bear.act('dangle', { restart: true }); else { const a = ['push', 'point', 'talk', 'kick', 'shy'][(Math.random() * 5) | 0]; bear.act(a, { restart: true, dir: [W / 2 - G.x, H / 2 - G.y], stand: true }); }
}
function stepPerch(dt, now) {
  const P = G.perch; if (!P) return; const p = perchPos(); if (!p) { G.perch = null; bear.express(null); return; }
  G.x = lerp(G.x, p[0], Math.min(1, dt * 14)); G.y = lerp(G.y, p[1], Math.min(1, dt * 14));
  if (now > P.next && !G.drag) { scold(); P.next = now + 5800 + Math.random() * 1400; }
  if (!P.jess && now - P.t0 > 7000 && J.state === 'off' && !V.busy && !G.drag) { P.jess = true; if (Math.random() < 0.6) visit('perch'); }
  if (now - P.t0 > 24000 && !G.drag) { G.perch = null; bear.express(null); say(pickLine(FEDUP), 4800); poofAt(0.5); later(1200, () => flyTo(homePos(), settle)); }
}
function bump(v) { if (v < 260) return; bear.s.squash.v += clamp(v / 500, 0.6, 3.5); const n = performance.now(); if (n - (G.bumpT || 0) > 160) { G.bumpT = n; poofAtXY(G.x, G.y); } }
function stepPhys(dt) {
  const P = G.ph; if (!P || P.paused) return;
  const n = Math.max(1, Math.ceil(dt / 0.008)), h = dt / n, GR = 2600, E = 0.5;
  for (let i = 0; i < n; i++) {
    const y0 = G.y; P.vy += GR * h; G.x += P.vx * h; G.y += P.vy * h; G.rot += P.om * h;
    const L = 40 * sc, R = W - 40 * sc, T = 112 * sc, FL = floorY();
    if (G.x < L) { G.x = L; P.vx = Math.abs(P.vx) * E; P.om *= -0.6; bump(Math.abs(P.vx)); } else if (G.x > R) { G.x = R; P.vx = -Math.abs(P.vx) * E; P.om *= -0.6; bump(Math.abs(P.vx)); }
    if (G.y < T) { G.y = T; P.vy = Math.abs(P.vy) * E; bump(Math.abs(P.vy)); }
    if (P.vy > 0) { const t = landing(G.x, y0, G.y); if (t) { startPerch({ ...t, mode: 'stand' }, G.x); say(pickLine(['Hey! I’m standing on your words!', 'Ooh, a sentence! It’s bouncy!', 'Helen!! Why is there a roof under me?!']), 5200); return; } }
    if (G.y >= FL) { G.y = FL; if (P.vy > 220) { bump(P.vy); P.vy = -P.vy * E; P.vx *= 0.82; P.om *= 0.55; P.n = (P.n || 0) + 1; } else { P.vy = 0; P.vx *= Math.exp(-6 * h); P.om *= Math.exp(-8 * h); } }
  }
  bear.vel = [P.vx * 0.6, P.vy * 0.6];
  if (G.y >= floorY() - 0.5 && Math.abs(P.vy) < 40 && Math.abs(P.vx) < 30) { G.ph = null; landed(P); }
}
function landed(P) {
  G.restUntil = performance.now() + 6200; G.rotTo = Math.round(G.rot / 6.2832) * 6.2832; bear.express('oops'); bear.act('shy', { restart: true }); G.react = 0; G.idle = 99;
  say(G.rescued ? pickLine(RESCUE) : P.thrown || P.n > 1 ? pickLine(THROW) : pickLine(DROPPED), 5600); G.rescued = false;
  later(6200, () => { bear.express(null); if (!G.ph && !G.perch && !G.drag && !G.fl) { poofAtXY(G.x, G.y); flyTo(homePos(), settle); } });
}

// ---------------------------------------------------------------- loop
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - G.last) / 1000); G.last = now; if (document.hidden) return;
  G.vis = G.visTo >= G.vis ? Math.min(G.visTo, G.vis + dt * G.visK) : Math.max(G.visTo, G.vis - dt * 3);   // settles exactly (no flicker or size pulse at rest)
  if (window.__albumOpen && !G.hidden) hide();
  // flight along an arc
  let vel = [0, 0];
  if (G.fl) { const f = G.fl; f.t += dt / f.dur; const u = ease(clamp(f.t, 0, 1)), q = 1 - u;
    const nx = q * q * f.a[0] + 2 * q * u * f.c[0] + u * u * f.b[0], ny = q * q * f.a[1] + 2 * q * u * f.c[1] + u * u * f.b[1];
    vel = [(nx - G.x) / Math.max(dt, 1e-3), (ny - G.y) / Math.max(dt, 1e-3)]; G.x = nx; G.y = ny;
    if (Math.random() < 0.9) G.trail.push({ x: G.x + (Math.random() - 0.5) * 20 * sc, y: G.y - 50 * sc + (Math.random() - 0.5) * 30 * sc, vx: -vel[0] * 0.08 + (Math.random() - 0.5) * 30, vy: -vel[1] * 0.08 + (Math.random() - 0.5) * 30, life: 0.5 + Math.random() * 0.6, s: 1.5 + Math.random() * 3 });
    if (f.t >= 1) { G.fl = null; f.then && f.then(); } }
  else if (!G.drag && G.home && !G.hidden && !G.ph && !G.perch && performance.now() > (G.restUntil || 0)) { // follow the anchor (scrolling, layout changes); exactly while he plays (the moves are already smooth)
    const p = homePos(), x0 = G.x, y0 = G.y, f = play.on ? 1 : Math.min(1, dt * 10); if (p) { G.x = lerp(G.x, p[0], f); G.y = lerp(G.y, p[1], f); }
    if (play.on) vel = [(G.x - x0) / Math.max(dt, 1e-3), (G.y - y0) / Math.max(dt, 1e-3)];
  }
  // idle life: little fidgets, then back to the screen's pose
  stepPhys(dt); stepPerch(dt, now); if (!G.ph && !G.drag) { G.rot += (G.rotTo - G.rot) * Math.min(1, dt * 9); if (Math.abs(G.rot - G.rotTo) < 0.01) G.rot = G.rotTo = 0; }
  if (G.perch && G.perch.mode === 'hang') vel = [Math.sin(now / 430) * 110, 0];
  if (!G.fl && !G.drag && G.vis > 0.5 && !G.script && !play.on && !G.ph && !G.perch && performance.now() > (G.restUntil || 0)) {
    if (G.react > 0) { G.react -= dt; if (G.react <= 0) settle(); }
    else if ((G.idle -= dt) < 0 && G.fidget.length && !RM) { const f = G.fidget[(Math.random() * G.fidget.length) | 0]; bear.act(f, { restart: true }); G.react = f === 'yawn' ? 3 : 2.6; G.idle = 8 + Math.random() * 6; }
  }
  stepPup(dt); drawTrio(dt);
  // eyes follow her finger / cursor (or Jessi while she shows off)
  if (play.on && !G.drag) { const lk = play.look(), hy = G.y - 66 * sc; bear.look((lk.bear[0] - G.x) / (W * 0.25), (lk.bear[1] - hy) / (H * 0.3)); pup.lookAt(clamp((lk.pup[0] - J.x) * J.face / (W * 0.3), -1, 1), clamp((lk.pup[1] - (J.L.gy - 40 * J.L.ps)) / (H * 0.3), -1, 1)); }
  else if (['enter', 'show'].includes(J.state) && !G.drag && J.L) bear.look((J.x - G.x) / (W * 0.25), 0.3);
  else if (G.gazeP && !G.drag) { const hx = G.x, hy = G.y - 66 * sc; bear.look((G.gazeP[0] - hx) / (W * 0.4), (G.gazeP[1] - hy) / (H * 0.4)); }
  bear.update(dt, { vel: G.drag ? bear.vel : vel, magic: bear.magic });
  play.update(dt);
  // draw
  cx.setTransform(pr, 0, 0, pr, 0, 0); cx.clearRect(0, 0, W, H);
  const onC = G.step === 'c' && J.L, T = now / 1000;
  if (onC) drawGround(T);
  drawCloud(T); play.drawBack(cx); drawPup(T);
  if (G.vis > 0.01) {
    const po = onC ? G.po : { r: 0, s: 1 }, k = sc * (0.6 + 0.4 * G.vis) * (po.s || 1);
    if (onC && !G.drag) { const hgt = clamp((J.L.gy - G.y) / (150 * sc), 0, 1); cx.save(); cx.globalAlpha = G.vis * 0.2 * (1 - hgt); cx.fillStyle = '#000'; cx.beginPath(); cx.ellipse(G.x, J.L.gy + 1, 30 * k * (1 - hgt * 0.5), 3.4 * k, 0, 0, 6.283); cx.fill(); cx.restore(); }
    cx.save(); cx.globalAlpha = G.vis; cx.translate(G.x, G.y); { const rr = (po.r || 0) + (G.rot || 0); if (rr) { cx.translate(0, -48 * k); cx.rotate(rr); cx.translate(0, 48 * k); } } cx.scale(k, k); bear.draw(cx, { aura: true }); cx.restore();
  }
  play.drawFront(cx);
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
  if (J.sayUntil) { if (now > J.sayUntil) sayJ(''); else placeBubble(bubJ, pupBox() || box(), V.side); }
  const pb = J.state !== 'off' && J.state !== 'leave' ? pupBox() : null;
  pupHit.style.pointerEvents = pb ? 'auto' : 'none'; if (pb) { pupHit.style.transform = `translate(${pb[0]}px,${pb[1]}px)`; pupHit.style.width = (pb[2] - pb[0]) + 'px'; pupHit.style.height = (pb[3] - pb[1]) + 'px'; }
  const dc = J.dream > 0.5 && J.L ? J.L.cloud : null;
  dreamHit.style.pointerEvents = dc ? 'auto' : 'none'; if (dc) { dreamHit.style.transform = `translate(${dc[0]}px,${dc[1]}px)`; dreamHit.style.width = (dc[2] - dc[0]) + 'px'; dreamHit.style.height = (dc[3] - dc[1]) + 'px'; }
}
requestAnimationFrame(frame);

window.Guide = { step, on(e, a) { EVENTS[e] && EVENTS[e](a); }, bear, pup, J, G, play, V, startPlay: () => { if (J.state !== 'off' && J.state !== 'leave') startPlay(); } };
document.documentElement.classList.add('guide');
hit.setAttribute('aria-label', `${NAME}, the teddy. Tap to play`);
if (window.__scr) { const c = window.__scr().cur; if (c != null) step(c); }

// "Light is the only words he has" – the film. Orchestrates world, rigs, physics, particles, camera, timeline,
// audio and rendering. Runs on WebGL2 (shaders) with a Canvas2D fallback.
import CFG from '../config.js';
import { clamp, lerp, ease, smoothstep, noise2, rand, mix3 } from './core.js';
import { View, PLACE, HZ, capY, baseY, unitScale, fOf } from './space.js';
import { bakeWorld, makeAtlas, wireBulbs } from './world.js';
import { Wind } from './physics.js';
import { Helen, Boy, ImageActor } from './rigs.js';
import { Snowki } from './snowki.js';
import { Jessi as Pup } from './jessi.js';
import { SpriteList, Fireworks, sampleMessage, Thread, Ambient, SKY_GY } from './particles.js';
import { buildTimeline, cameraAt, focusAt, timeScaleAt } from './timeline.js';
import { FilmAudio } from './audio.js';
import { GLRenderer } from './renderer-gl.js';
import { Renderer2D } from './renderer-2d.js';

const $ = s => document.querySelector(s);
const qs = new URLSearchParams(location.search);
const EMBED = qs.has('embed'), RM = matchMedia('(prefers-reduced-motion: reduce)').matches;
const NAME = CFG.recipient, fill = s => s.replace('{name}', NAME).replace('{NAME}', NAME.toUpperCase());

// ---------------------------------------------------------------- quality tiers
const TIERS = {
  high: { name: 'high', pr: Math.min(devicePixelRatio || 1, 2), sprites: 16000, letters: 2600, pool: 6500, petals: 70, motes: 90, kuwahara: true, res: 1.35, postDiv: 1, rays: 0.6, flare: 0.28, thread: 320 },
  medium: { name: 'medium', pr: Math.min(devicePixelRatio || 1, 1.5), sprites: 10000, letters: 1800, pool: 4200, petals: 45, motes: 60, kuwahara: true, res: 1.05, postDiv: 1, rays: 0.45, flare: 0, thread: 220 },
  low: { name: 'low', pr: 1, sprites: 6000, letters: 1100, pool: 2600, petals: 24, motes: 30, kuwahara: false, res: 0.8, postDiv: 2, rays: 0, flare: 0, thread: 140 }
};
function guessTier() {
  const forced = qs.get('q') || (CFG.quality !== 'auto' ? CFG.quality : null); if (forced && TIERS[forced]) return forced;
  const mobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent), cores = navigator.hardwareConcurrency || 4, mem = navigator.deviceMemory || 4;
  if (cores <= 2 || mem <= 2) return 'low'; if (mobile || cores <= 4 || mem < 4) return 'medium'; return 'high';
}
const q = { ...TIERS[guessTier()] };

// ---------------------------------------------------------------- renderer
const canvas = $('#stage');
let R = qs.has('force2d') ? null : new GLRenderer(canvas);
try { if (R && R.ok) R.init(q); else R = null; } catch (e) { console.warn('WebGL2 init failed, using Canvas2D', e); R = null; }
if (!R) { q.kuwahara = false; R = new Renderer2D(canvas).init(q); }
const GL = R instanceof GLRenderer;

// ---------------------------------------------------------------- world, rigs, systems
const layers = bakeWorld(q.res), atlas = makeAtlas();
R.setWorld(layers, atlas);
const LY = Object.fromEntries(layers.map(l => [l.name, l]));
const A = CFG.assets || {};
// Jessi: the same puppy rig as on the birthday page, sitting beside Helen (0.56 character units per rig unit)
class FilmJessi {
  constructor() { this.p = new Pup(); this.k = 0.56; this.bounds = [-21, -32, 19, 3]; this.p.act('happy'); }
  update(st) { const want = st.pet ? 'pet' : st.lookUp ? 'lookUp' : 'happy'; if (this.p.name !== want) this.p.act(want); this.p.update(st.dt); }
  draw(ctx) { ctx.save(); ctx.scale(this.k, this.k); this.p.draw(ctx); ctx.restore(); }
  headTop() { const h = this.p.headTop(); return [h[0] * this.k, h[1] * this.k]; }
}
const helen = A.helen ? new ImageActor(A.helen) : new Helen(), boy = A.boy ? new ImageActor(A.boy) : new Boy(), jessi = A.dog ? new ImageActor(A.dog) : new FilmJessi();
const snow = new Snowki(), SN = 0.2;     // Snowki, the magical teddy: 100 rig units = 20 character units
const snowRig = { bounds: [-70, -140, 70, 16], draw(ctx) { snow.draw(ctx, { aura: false, sparkle: false }); } };
const wind = new Wind(), view = new View(), audio = new FilmAudio(CFG);
const lists = { emis: new SpriteList(q.letters + q.pool + 600), mid: new SpriteList(900), lights: new SpriteList(400), thread: new SpriteList(q.thread * 2 + 200), alpha: new SpriteList(400), add: new SpriteList(600), fgAlpha: new SpriteList(600), fgAdd: new SpriteList(900) };
let fw, thread, amb;
const TL = buildTimeline(CFG);
// ---------------------------------------------------------------- optional AI clips (Seedance 2.5 / Veo 3.1), one per scene
const CLIPS = {};
function addClip(n, src) { if (!src || CLIPS[n]) return; const el = document.createElement('video'); el.src = src; el.muted = true; el.playsInline = true; el.preload = 'auto'; el.crossOrigin = 'anonymous'; CLIPS[n] = { el, ok: false }; el.addEventListener('loadeddata', () => (CLIPS[n].ok = true)); el.addEventListener('error', () => delete CLIPS[n]); }
Object.entries(CFG.clips || {}).forEach(([n, src]) => addClip(+n, src));
fetch('clips/clips.json', { cache: 'no-cache' }).then(r => (r.ok ? r.json() : {})).then(j => Object.entries(j || {}).forEach(([n, src]) => addClip(+n, src))).catch(() => {});
let clipOn = null;
function syncClip(seek) {
  const n = S.phase === 'film' && S.scene ? S.scene.n : 0, c = CLIPS[n] && CLIPS[n].ok ? CLIPS[n] : null;
  if (clipOn && clipOn !== c) clipOn.el.pause();
  if (c) { const d = c.el.duration || 1; if (clipOn !== c || seek) { try { c.el.currentTime = Math.min(S.lt, d - 0.05); } catch (e) {} } if (S.lt < d - 0.05 && !paused) c.el.play().catch(() => {}); else c.el.pause(); c.el.playbackRate = Math.max(0.0625, S.timeScale); }
  clipOn = c;
}
const bulbs = wireBulbs();

function initSystems() {
  fw = new Fireworks(q.letters + q.pool, {
    launch: d => audio.whoosh(Math.min(d, 3.4)),
    burst: (k, x) => { audio.boom(k); S.shake = Math.max(S.shake, RM ? 0 : 5 * k); },
    crackle: () => audio.crackle()
  });
  thread = new Thread(q.thread); amb = new Ambient(q);
}

// ---------------------------------------------------------------- state
const S = {
  phase: 'wish', T: 0, simT: 0, real: 0, scene: null, lt: 0, fired: new Set(), timeScale: 1, bt: null, shake: 0,
  helen: { expr: 'calm', lookUp: 0, pet: false }, boy: { pose: 'hide', expr: 'watching', flame: false, look: -0.25 }, jessi: { lookUp: false, pet: false, happy: true },
  ramps: {}, lines: [], ended: false, blowT: -1, fuseT: -99, input: [0, 0], cloudK: 1, sn: null, snMode: 'lap', snTrail: [], snPrev: null
};
const ramp = (k, to, dur, instant) => { const cur = S.ramps[k] ? S.ramps[k].v : (to === 0 ? 1 : 0); S.ramps[k] = instant ? { v: to, to, rate: 0 } : { v: cur, to, rate: Math.abs(to - cur) / Math.max(dur, 0.001) }; };
const rv = (k, d = 0) => (S.ramps[k] ? S.ramps[k].v : d);
function stepRamps(dt) { for (const r of Object.values(S.ramps)) { if (r.v < r.to) r.v = Math.min(r.to, r.v + r.rate * dt); else if (r.v > r.to) r.v = Math.max(r.to, r.v - r.rate * dt); } }
function resetState() {
  Object.assign(S, { T: 0, simT: 0, scene: null, lt: 0, fired: new Set(), timeScale: 1, bt: null, shake: 0, ramps: {}, lines: [], ended: false, fuseT: -99, cloudK: 1, sn: null, snMode: 'lap', snTrail: [], snPrev: null });
  S.helen = { expr: 'calm', lookUp: 0, pet: false }; S.boy = { pose: 'hide', expr: 'watching', flame: false, look: -0.25 }; S.jessi = { lookUp: false, pet: false, happy: true };
  initSystems(); placeMessage(); $('#lines').innerHTML = ''; $('#end').classList.remove('on'); setSub('');
}

// ---------------------------------------------------------------- the sky message: sampled from text, placed for the sky shot
function placeMessage() {
  const W = innerWidth, H = innerHeight, portrait = H > W, sk = anchor('sky', portrait), v = new View().set(W, H, { x: sk.x, y: sk.y, z: 1, roll: 0, lens: 0 });
  const box = portrait ? [0.05, 0.12, 0.95, 0.38] : [0.05, 0.1, 0.74, 0.46];
  const lines = CFG.text.skyMessage.map(fill);
  const pts = sampleMessage(lines, CFG.text.skyHeart, q.letters, '"Cinzel", Georgia, serif', (px, py, cw, ch) => {
    const sx = W * (box[0] + (box[2] - box[0]) * px / cw), sy = H * (box[1] + (box[3] - box[1]) * py / ch); return v.toWorld(sx, sy, SKY_GY);
  });
  fw.setTargets(pts);
  // heart constellation for the last scene, centred in the night framing
  const nt = anchor('night', portrait), vn = new View().set(W, H, { x: nt.x, y: nt.y, z: 1.04, roll: 0, lens: 0 }), c = vn.toWorld(W * 0.5, H * (portrait ? 0.27 : 0.3), SKY_GY), r = Math.min(W, H) * 0.15 / vn.S;
  amb.setHeart(c[0], c[1], r, 26); thread.stars = amb.heart;
  S.msgBox = { v, box, W, H };
}

// ---------------------------------------------------------------- live anchors for the camera grammar
const us = gy => unitScale(gy);
function boyPlace() {
  const sc = S.scene ? S.scene.n : 0, lt = S.lt;
  if (sc === 4 || sc === 5) return { x: PLACE.boyLight.x, y: PLACE.boyLight.y, flip: false, rot: 0 };
  if (sc === 7 || sc === 8) { const u = clamp((lt - 0.6) / (TL.scenes[6].dur - 0.6), 0, 1), e = sc === 8 ? 1 : u; return { x: lerp(PLACE.walkFrom.x, PLACE.walkTo.x, e), y: lerp(PLACE.walkFrom.y, PLACE.walkTo.y, e), flip: false, rot: 0 }; }
  const slip = sc === 3 ? ease.outCubic(clamp((lt - 0.4) / 1.8, 0, 1)) : 1;
  return { x: lerp(PLACE.boy.x + 60, PLACE.boy.x, slip), y: PLACE.boy.y, flip: true, rot: 0.2 * slip };
}
function local2world(p, lx, ly) { const s = us(p.gy ?? p.y), fl = p.flip ? -1 : 1, r = p.rot || 0; return [p.x + s * fl * (lx * Math.cos(r) - ly * Math.sin(r)), p.y + s * (lx * Math.sin(r) + ly * Math.cos(r))]; }
const HS = { x: PLACE.helen.x, y: PLACE.helen.seat, gy: PLACE.helen.gy };
const helenW = (lx, ly) => [HS.x + lx * us(HS.gy), HS.y + ly * us(HS.gy)];
function anchor(name, portrait) {
  const bp = boyPlace(), bf = local2world(bp, 0.4, -93), hf = helenW(1, -37.5), hc = helenW(0.5, -20);
  switch (name) {
    case 'wide': return portrait ? { x: 400, y: 545 } : { x: 810, y: 505 };
    case 'helenWide': return portrait ? { x: hc[0] + 30, y: hc[1] + 10, gy: HS.gy } : { x: hc[0] + 120, y: hc[1] + 6, gy: HS.gy };
    case 'helenMed': return portrait ? { x: hc[0] + 14, y: hc[1] + 12, gy: HS.gy, zk: 0.85 } : { x: hc[0] + 30, y: hc[1] + 4, gy: HS.gy };
    case 'helenUp': return { x: hf[0] + 8, y: hf[1] + 18, gy: HS.gy };
    case 'helenFace': return { x: hf[0] + (portrait ? 0 : 5), y: hf[1] + 1, gy: HS.gy };
    case 'boyFace': return { x: bf[0] - (portrait ? 0 : 10), y: bf[1] + 6, gy: bp.y };
    case 'boyMed': { const c = local2world(bp, 0.5, -76); return { x: c[0] - (portrait ? 0 : 26), y: c[1], gy: bp.y }; }
    case 'boyMeet': { const sp = snowAt(S.T), c = local2world(bp, 0.5, -84); return { x: (c[0] + sp.x) / 2 - (portrait ? 0 : 10), y: (c[1] + sp.y - 50 * SN * us(sp.gy)) / 2 + 8, gy: (bp.y + sp.gy) / 2 }; }
    case 'snowki': { const sp = snowAt(S.T); return { x: sp.x, y: sp.y - 55 * SN * us(sp.gy), gy: sp.gy }; }
    case 'crateWide': return { x: PLACE.launcher.x - 90, y: PLACE.launcher.y - 70 * us(PLACE.launcher.y), gy: PLACE.launcher.y, zk: portrait ? 0.8 : 1 };
    case 'helenSnow': { const c = helenW(0.5, -18); return { x: c[0] + (portrait ? 6 : 34), y: c[1] + 4, gy: HS.gy }; }
    case 'threadWide': return portrait ? { x: 980, y: 540, gy: 760 } : { x: 770, y: 545, gy: 760 };
    case 'launcher': return { x: PLACE.boyLight.x + (portrait ? 92 : 50), y: PLACE.boyLight.y - 60 * us(PLACE.boyLight.y), gy: PLACE.boyLight.y, zk: portrait ? 0.72 : 1 };
    case 'skyRise': return { x: 900, y: 330 };
    case 'sky': return portrait ? { x: 560, y: 240 } : { x: 600, y: 240 };
    case 'walker': return { x: bp.x + 6, y: bp.y - 70 * us(bp.y), gy: bp.y };
    case 'walkerEnd': return { x: PLACE.walkTo.x, y: PLACE.walkTo.y - 70 * us(PLACE.walkTo.y), gy: PLACE.walkTo.y };
    case 'night': return { x: 700, y: -220 };
  }
  return { x: 800, y: 500 };
}
function focusGy(name) {
  switch (name) { case 'helen': return PLACE.helen.gy; case 'snowki': return snowAt(S.T).gy; case 'boy': return boyPlace().y; case 'boyLight': return PLACE.boyLight.y; case 'walker': return boyPlace().y; case 'sky': return HZ + 12; }
  return 700;
}

// ---------------------------------------------------------------- scene events
function ripple(k) {
  const x = HS.x + rand(-30, 60), gy = baseY(x) - rand(40, 80), Z = 2400 / (gy - HZ), X = (x - 800) * Z / 900;
  S.rip = S.rip || []; S.rip.push([X, Z, S.simT, k]); if (S.rip.length > 8) S.rip.shift();
}
function fire(ev, instant) {
  const [, name, arg] = ev;
  switch (name) {
    case 'laugh': S.helen.expr = 'joyful'; S.laughUntil = S.T + 2.6; ramp('glowPulse', 1, 0.3, instant); break;
    case 'ripple': if (!instant) ripple(arg); break;
    case 'pet': S.helen.pet = true; S.jessi.pet = true; S.petUntil = S.T + 4.3; if (!instant) setTimeout(() => ripple(0.7), 600); break;
    case 'calm': S.helen.expr = 'calm'; break;
    case 'boyWatch': S.boy.pose = 'watch'; break;
    case 'threadOn': ramp('thread', 1, 2.5, instant); break;
    case 'boySmile': S.boy.expr = 'contentment'; break;
    case 'flame': S.boy.flame = true; break;
    case 'boyReach': S.boy.reachSnow = true; break;
    case 'boyLetGo': S.boy.reachSnow = false; break;
    case 'snWink': snAct('idle', { expr: 'wink' }, 2.2); break;
    case 'snWave': snAct('wave', {}, 2.2); break;
    case 'snTouch': snAct('point', { dir: [1, 0.15], expr: 'love' }, 1.6); break;
    case 'snNod': snAct('nod', {}, 1.2); break;
    case 'snCover': snAct('cover', {}, 2.6); break;
    case 'snCheer': snAct('cheer', {}, 0.9); break;
    case 'snLookUp': snAct('lookUp', { expr: 'love' }, 11); break;
    case 'snHug': snAct('hug', { expr: 'soft' }, 30); break;
    case 'fuse': S.fuseT = S.T; if (!instant) audio.noise && audio.noise(2.4, 3000, 5000, 0.03, 0.8, 'highpass'); break;
    case 'rockets': if (!instant) launchRockets(); S.boy.flame = false; break;
    case 'boyStand': S.boy.pose = 'stand'; S.boy.gazeY = -0.8; break;
    case 'formIfMissing': { let has = false; for (let i = 0; i < fw.max && !has; i++) if (fw.alive[i] && fw.kind[i] === 2) has = true; if (!has && fw.rockets.length === 0) fw.formInstant(); break; }
    case 'lanterns': amb.lanternOn = 1; if (instant) for (let i = 0; i < 6; i++) amb.spawnLantern(); break;
    case 'aurora': ramp('aurora', 1, 5, instant); audio.setIntensity && audio.setIntensity(0.75, 0.5); break;
    case 'lookUp': S.helen.lookUp = 1; S.helen.expr = 'surprised'; S.jessi.lookUp = true; break;
    case 'wish': amb.wishOn = 1; break;
    case 'bulletIn': if (!instant) { S.bt = { in: S.T, out: S.T + 5.0 }; ramp('refl', 1, 1.5); } break;
    case 'bulletOut': if (!instant) setTimeout(() => audio.heartbeat(), 350); break;
    case 'teary': S.helen.expr = 'teary'; break;
    case 'threadWarm': ramp('warm', 1, 1.5, instant); break;
    case 'lettersFade': fw.fadeLetters = true; break;
    case 'softFireworks': S.softFw = S.T; break;
    case 'line': showLine(arg, instant); break;
    case 'toStars': ramp('toStars', 1, 4.5, instant); break;
    case 'heartDraw': ramp('heartVis', 1, 2, instant); ramp('heartDraw', 1, 6.5, instant); break;
    case 'end': showEnd(); break;
  }
}
function launchRockets() {
  const pts = fw.targets; if (!pts) return;
  const n = 5, sorted = pts.slice().sort((a, b) => a[0] - b[0]), groups = [];
  for (let i = 0; i < n; i++) groups.push(sorted.slice(Math.floor(i * sorted.length / n), Math.floor((i + 1) * sorted.length / n)));
  const L = LY.crate.top;
  groups.forEach((g, i) => {
    let cx = 0, cy = 1e9; for (const p of g) { cx += p[0]; cy = Math.min(cy, p[1]); } cx /= g.length;
    setTimeout(() => fw.launch([L[0] + (i - 2) * 4, L[1], L[2]], [cx, cy - 20], 3.4, { kind: 'letters', pts: g }), i * 330 / Math.max(S.timeScale, 0.05));
  });
  setTimeout(() => { for (const [dx, dy, h] of [[-0.42, -0.08, 1], [0.44, -0.04, 2], [0, -0.16, 0]]) { const v = S.msgBox.v, w = v.toWorld(innerWidth * (0.5 + dx), innerHeight * (0.3 + dy), SKY_GY); fw.launch([L[0], L[1], L[2]], w, 3.0, { kind: 'peony', n: 150, speed: 230, hue: h }); } }, 2600);
}

// ---------------------------------------------------------------- Snowki: in her lap, then alive. Keys: [time, 'lap' | [x, y, gy], 1 hover | 2 perch]
function snowKeys() {
  const s = n => TL.scenes[n - 1].start, cr = PLACE.launcher, top = cr.y - 62 * us(cr.y) + 1;
  return [[0, 'lap'], [s(2) + 9.6, 'lap'], [s(2) + 10.5, [270, 574, 702]], [s(2) + 11.8, [286, 410, 702], 1],
    [s(3) + 1.3, [600, 520, 732]], [s(3) + 2.7, [860, 548, 762]], [s(3) + 4.0, [1052, 536, 800], 1],
    [s(3) + 8.4, [1052, 536, 800], 1], [s(3) + 9.8, [1290, 440, 820]], [s(3) + 11.2, [cr.x + 30, top, cr.y + 2], 2],
    [s(4) + 5.0, [cr.x + 30, top, cr.y + 2], 2], [s(4) + 6.4, [1330, 320, 830]], [s(4) + 8.8, [840, 330, 772]], [s(5) + 1.6, [430, 468, 710]], [s(5) + 3.0, 'lap'], [1e9, 'lap']];
}
const lapAt = () => { const p = helenW(-3.4, -2.6); return [p[0], p[1], HS.gy + 0.5]; };
function snowAt(T) {
  const K = SNK || (SNK = snowKeys()); let i = 0; while (i < K.length - 2 && T >= K[i + 1][0]) i++;
  const P = k => (k[1] === 'lap' ? lapAt() : k[1]), a = K[i], b = K[i + 1];
  if (a[1] === 'lap' && b[1] === 'lap') { const p = lapAt(); return { x: p[0], y: p[1], gy: p[2], mode: 'lap', t0: a[0] }; }
  const pa = P(a), pb = P(b);
  if (pa[0] === pb[0] && pa[1] === pb[1]) { const hover = a[2] === 1, bob = hover ? Math.sin(T * 2.3) * 3 : 0; return { x: pa[0], y: pa[1] + bob, gy: pa[2], mode: hover ? 'hover' : 'perch', t0: a[0] }; }
  const p0 = P(K[Math.max(0, i - 1)]), p3 = P(K[Math.min(K.length - 1, i + 2)]), u = clamp((T - a[0]) / (b[0] - a[0]), 0, 1), e = ease.inOutSine(u);
  const cr = (q0, q1, q2, q3) => 0.5 * (2 * q1 + (-q0 + q2) * e + (2 * q0 - 5 * q1 + 4 * q2 - q3) * e * e + (-q0 + 3 * q1 - 3 * q2 + q3) * e * e * e);
  return { x: cr(p0[0], pa[0], pb[0], p3[0]), y: cr(p0[1], pa[1], pb[1], p3[1]), gy: lerp(pa[2], pb[2], e), mode: 'fly', t0: a[0] };
}
let SNK = null;
function snAct(name, o, dur) { S.sn = { name, o, t: S.T, until: S.T + dur }; }
const SN_DEFAULT = { lap: ['sit', {}], hover: ['stand', { stand: true }], perch: ['sit', {}], fly: ['fly', {}] };
function stepSnow(dt, warm) {
  const sp = snowAt(S.T), want = S.sn && S.sn.t >= sp.t0 && S.T < S.sn.until ? [S.sn.name, S.sn.o] : SN_DEFAULT[sp.mode];
  const key = want[0] + JSON.stringify(want[1]) + sp.mode;
  if (key !== S.snKey) { S.snKey = key; snow.act(want[0], { stand: sp.mode === 'hover', ...want[1] }); }
  // velocity on screen (for banking), gaze, magic
  const sc = view.toScreen(sp.x, sp.y, sp.gy), prev = S.snPrev; S.snPrev = sc;
  const vel = prev && dt > 0 ? [(sc[0] - prev[0]) / Math.max(dt, 1e-3) * 0.5, (sc[1] - prev[1]) / Math.max(dt, 1e-3) * 0.5] : [0, 0];
  if (sp.mode === 'hover') snow.look(0.7, -0.35); else if (sp.mode === 'perch') snow.look(-0.4, -0.6); else if (sp.mode === 'lap') snow.look(want[1].expr === 'wink' ? 0 : 0.15, 0.05); else snow.look(0, 0);
  snow.update(warm ? 1 / 60 : dt, { vel: sp.mode === 'fly' ? vel : [0, 0], magic: sp.mode === 'lap' ? (S.sn && S.sn.name === 'idle' && S.T < S.sn.until ? 0.3 : 0) : 1 });
  // sparkle trail while he flies or floats
  if (sp.mode !== 'lap' && dt > 0) { const s = us(sp.gy), n = sp.mode === 'fly' ? 3 : 1; for (let i = 0; i < n; i++) S.snTrail.push({ x: sp.x + rand(-8, 8) * s * 0.4, y: sp.y - rand(30, 75) * SN * s, gy: sp.gy, vx: rand(-6, 6) * s, vy: rand(-4, 8) * s, life: rand(0.6, 1.3), ml: 1.3, r: rand(0, 6) }); }
  for (const p of S.snTrail) { p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt; }
  S.snTrail = S.snTrail.filter(p => p.life > 0); if (S.snTrail.length > 160) S.snTrail.splice(0, S.snTrail.length - 160);
  S.snP = sp;
}

// ---------------------------------------------------------------- text overlays
let subT = 0;
function setSub(t) { const el = $('#sub'); if (el.dataset.t === t) return; el.dataset.t = t; el.classList.remove('on'); clearTimeout(subT); if (t) subT = setTimeout(() => { el.textContent = t; el.classList.add('on'); }, 450); }
function showLine(i, instant) {
  const box = $('#lines'), p = document.createElement('p'); p.className = 'l l' + i; p.innerHTML = fill(CFG.text.finalLines[i]).replace(/\n/g, '<br>');
  box.appendChild(p); requestAnimationFrame(() => requestAnimationFrame(() => p.classList.add('on')));
}
function showEnd() { if (S.ended) return; S.ended = true; $('#end').classList.add('on'); $('#cont').hidden = !EMBED; }

// ---------------------------------------------------------------- per-actor canvases (drawn at screen resolution) -> textured quads
class ActorView {
  constructor(id, rig) { this.id = id; this.rig = rig; this.c = document.createElement('canvas'); this.x = this.c.getContext('2d'); }
  render(F, place, st, opt = {}) {
    const v = F.view, gy = place.gy, s = us(gy) * (opt.scale || 1), k = v.scaleAt(gy), fl = place.flip ? -1 : 1, r = place.rot || 0, b = this.rig.bounds;
    const anc = v.toScreen(place.x, place.y, gy), m = k * s, cs = Math.cos(r), sn = Math.sin(r);
    const tf = (lx, ly) => [anc[0] + m * fl * (lx * cs - ly * sn), anc[1] + m * (lx * sn + ly * cs)];
    const cr = [tf(b[0], b[1]), tf(b[2], b[1]), tf(b[0], b[3]), tf(b[2], b[3])];
    let x0 = Math.min(...cr.map(p => p[0])), x1 = Math.max(...cr.map(p => p[0])), y0 = Math.min(...cr.map(p => p[1])), y1 = Math.max(...cr.map(p => p[1]));
    const full = [x0, y0, x1, y1];
    x0 = Math.max(x0, -40); y0 = Math.max(y0, -40); x1 = Math.min(x1, F.W + 40); y1 = Math.min(y1, F.H + 40);
    if (x1 - x0 < 2 || y1 - y0 < 2) return null;
    let pr = F.pr; const maxS = 2048; pr = Math.min(pr, maxS / (x1 - x0), maxS / (y1 - y0));
    const w = Math.ceil((x1 - x0) * pr), h = Math.ceil((y1 - y0) * pr);
    if (this.c.width !== w || this.c.height !== h) { this.c.width = w; this.c.height = h; } else this.x.clearRect(0, 0, w, h);
    const p2 = m * pr; this.x.setTransform(p2 * fl * cs, p2 * sn, -p2 * fl * sn, p2 * cs, (anc[0] - x0) * pr, (anc[1] - y0) * pr);
    this.x.lineJoin = this.x.lineCap = 'round';
    this.rig.draw(this.x, st);
    const corners = [[x0, y0], [x1, y0], [x0, y1], [x1, y1]];
    // the long evening shadow: the silhouette sheared along the ground away from the light
    const ground = opt.groundY != null ? v.toScreen(place.x, opt.groundY, gy)[1] : anc[1], dir = opt.shadowDir || [0.5, 0.4], L = opt.shadowLen || 1;
    const sh = corners.map(([cx, cy]) => { const hgt = Math.max(0, ground - cy); return [cx + dir[0] * hgt * L, ground + dir[1] * hgt * L * 0.55]; });
    return { type: 'char', id: this.id, canvas: this.c, corners, gy, pr, anc, full, shadow: opt.shadowA ? { corners: sh, color: opt.shadowC || [0.32, 0.18, 0.42], alpha: opt.shadowA, blur: 6 * pr } : null };
  }
}
const views = { helen: new ActorView('helen', helen), jessi: new ActorView('jessi', jessi), boy: new ActorView('boy', boy), snow: new ActorView('snow', snowRig) };
const lapDraw = ctx => { ctx.save(); ctx.translate(-3.4, -2.6); ctx.scale(SN, SN); snow.draw(ctx, { aura: false, sparkle: false }); ctx.restore(); };

// ---------------------------------------------------------------- the wish (scene 0) overlay: candle, flame, smoke that becomes clouds
const wc = $('#wishfx'), wx = wc.getContext('2d'); let smoke = [];
const wishBear = new Snowki(); wishBear.magic = 0.6;
function drawWish(dtReal) {
  const W = innerWidth, H = innerHeight, pr = Math.min(devicePixelRatio || 1, 2);
  if (wc.width !== Math.round(W * pr)) { wc.width = Math.round(W * pr); wc.height = Math.round(H * pr); }
  const x = wx; x.setTransform(pr, 0, 0, pr, 0, 0); x.clearRect(0, 0, W, H);
  const since = !S.blown ? -1 : (performance.now() - S.blowT) / 1000, bgA = since < 0 ? 1 : clamp(1 - since / 3.4, 0, 1);
  if (since > 5.5 && !smoke.length) { wc.style.display = 'none'; return; }
  wc.style.display = 'block';
  if (bgA > 0) { const g = x.createRadialGradient(W / 2, H * 0.62, 0, W / 2, H * 0.6, Math.max(W, H) * 0.8); g.addColorStop(0, `rgba(70,40,110,${bgA})`); g.addColorStop(0.5, `rgba(42,27,77,${bgA})`); g.addColorStop(1, `rgba(14,10,36,${bgA})`); x.fillStyle = g; x.fillRect(0, 0, W, H); }
  const s = Math.min(W, H) / 520, cx = W / 2, cy = H * 0.66, t = performance.now() / 1000;
  const lit = since < 0 ? 1 : clamp(1 - since / 0.35, 0, 1), cupA = bgA;
  if (cupA > 0.01) {
    x.save(); x.translate(cx, cy); x.scale(s, s); x.globalAlpha = cupA;
    // glow on the cupcake from the flame
    if (lit > 0) { const g = x.createRadialGradient(0, -90, 0, 0, -90, 220); g.addColorStop(0, `rgba(255,190,110,${0.35 * lit})`); g.addColorStop(1, 'rgba(255,190,110,0)'); x.fillStyle = g; x.fillRect(-240, -310, 480, 480); }
    // wrapper
    const wg = x.createLinearGradient(-60, 0, 60, 0); wg.addColorStop(0, '#C9709A'); wg.addColorStop(0.45, '#F5B3CF'); wg.addColorStop(1, '#A85580');
    x.fillStyle = wg; x.beginPath(); x.moveTo(-62, -18); x.lineTo(62, -18); x.lineTo(46, 60); x.lineTo(-46, 60); x.closePath(); x.fill();
    x.strokeStyle = 'rgba(120,40,80,.35)'; x.lineWidth = 2; for (let i = -5; i <= 5; i++) { x.beginPath(); x.moveTo(i * 11.5, -18); x.lineTo(i * 8.6, 60); x.stroke(); }
    // frosting
    const fg = x.createLinearGradient(0, -70, 0, -10); fg.addColorStop(0, '#FFF3F8'); fg.addColorStop(1, '#F7C3D8');
    x.fillStyle = fg; x.beginPath(); x.moveTo(-70, -16); x.bezierCurveTo(-80, -50, -40, -62, -30, -58); x.bezierCurveTo(-28, -84, 26, -86, 30, -60); x.bezierCurveTo(52, -64, 82, -46, 70, -16); x.closePath(); x.fill();
    for (let i = 0; i < 14; i++) { x.fillStyle = ['#FFD27A', '#8EC9FF', '#FF9EC4', '#B9A3FF'][i % 4]; x.save(); x.translate(-50 + ((i * 37) % 100), -30 - ((i * 23) % 36)); x.rotate(i); x.fillRect(-4, -1.2, 8, 2.4); x.restore(); }
    // candle
    const cg = x.createLinearGradient(-6, 0, 6, 0); cg.addColorStop(0, '#E9D7FF'); cg.addColorStop(0.5, '#FFFFFF'); cg.addColorStop(1, '#C8B4F0'); x.fillStyle = cg; x.fillRect(-6, -150, 12, 84);
    x.fillStyle = '#FF9EC4'; for (let i = 0; i < 6; i++) { x.save(); x.beginPath(); x.rect(-6, -150, 12, 84); x.clip(); x.translate(0, -146 + i * 15); x.rotate(-0.5); x.fillRect(-12, 0, 24, 4.5); x.restore(); }
    x.strokeStyle = '#3A2A30'; x.lineWidth = 2; x.beginPath(); x.moveTo(0, -150); x.quadraticCurveTo(2, -156, 0, -160); x.stroke();
    if (lit > 0) { // flame
      const fl = 1 + 0.08 * Math.sin(t * 13) + 0.06 * Math.sin(t * 29), fy = -162;
      x.globalCompositeOperation = 'lighter'; const gg = x.createRadialGradient(0, fy - 10, 0, 0, fy - 10, 90 * lit); gg.addColorStop(0, `rgba(255,200,120,${0.55 * lit})`); gg.addColorStop(1, 'rgba(255,180,100,0)'); x.fillStyle = gg; x.fillRect(-100, fy - 110, 200, 200); x.globalCompositeOperation = 'source-over';
      x.save(); x.translate(0, fy); x.scale(lit * fl, lit * (0.9 + 0.15 * Math.sin(t * 7))); const f = x.createLinearGradient(0, 8, 0, -34); f.addColorStop(0, '#FFF8DA'); f.addColorStop(0.5, '#FFC860'); f.addColorStop(1, 'rgba(255,110,40,0)');
      x.fillStyle = f; x.beginPath(); x.moveTo(0, -34); x.bezierCurveTo(14, -12, 11, 6, 0, 9); x.bezierCurveTo(-11, 6, -14, -12, 0, -34); x.fill(); x.fillStyle = 'rgba(120,160,255,.6)'; x.beginPath(); x.ellipse(0, 3, 3.4, 5.2, 0, 0, 7); x.fill(); x.restore();
    }
    x.restore();
  }
  // Snowki beside the cupcake: points at the flame, shows her how to blow, cheers, then flies up into the story
  {
    const wb = wishBear, bx = cx + 150 * s, fly = since > 0.9 ? Math.pow(since - 0.9, 2) * 260 * s : 0, by = cy + 58 * s - fly, cyc = (t % 7);
    if (since < 0) { const want = cyc < 3.2 ? 'point' : cyc < 4.8 ? 'blow' : 'kick'; if (wb.name !== want) wb.act(want, { dir: [-1, -1.15] }); }
    else if (since < 0.9) { if (wb.name !== 'cheer') wb.act('cheer'); }
    else if (wb.name !== 'fly') wb.act('fly');
    wb.update(dtReal, { vel: since > 0.9 ? [40, -380] : [0, 0], magic: since < 0 ? 0.55 : 1 });
    const a = since < 0 ? 1 : clamp(1 - (since - 1.6) / 1.6, 0, 1);
    if (a > 0.01 && by > -200) { x.save(); x.globalAlpha = a; x.translate(bx, by); x.scale(s * 1.05, s * 1.05); wb.draw(x, { aura: true }); x.restore(); }
  }
  // smoke: curls up, drifts towards the sky and warms into the sunset clouds
  if (since >= 0 && since < 1.6) for (let i = 0; i < 3; i++) smoke.push({ x: cx + rand(-2, 2) * s, y: cy - 158 * s, vx: rand(-8, 8), vy: rand(-60, -30), r: rand(3, 6) * s, life: rand(3.5, 5.2), ml: 5.2, p: rand(0, 6) });
  const dt = Math.min(dtReal, 0.05);
  for (const p of smoke) { p.vx += (noise2(p.y * 0.006, t * 0.4 + p.p) * 90 - p.vx * 0.5) * dt; p.vy += (-26 - p.vy * 0.25) * dt; p.x += p.vx * dt; p.y += p.vy * dt * (1 + since * 0.5); p.r += dt * (6 + p.r * 0.35) * s; p.life -= dt; }
  smoke = smoke.filter(p => p.life > 0 && p.y > -200);
  for (const p of smoke) { const u = clamp(1 - p.y / H, 0, 1), a = Math.min(1, (p.ml - p.life) * 2) * Math.min(1, p.life / 1.5) * 0.32, c = [lerp(215, 255, u * bgA ** 0 * (1 - bgA)), lerp(205, 214, u * (1 - bgA)), lerp(235, 196, u * (1 - bgA))];
    const g = x.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r); g.addColorStop(0, `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`); g.addColorStop(1, `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},0)`); x.fillStyle = g; x.fillRect(p.x - p.r, p.y - p.r, p.r * 2, p.r * 2); }
}

// ---------------------------------------------------------------- blowing out the candle (tap or microphone)
let micStream = null;
function blow() {
  if (S.phase !== 'wish') return;
  audio.start(); audio.breath();
  if (window.DeviceOrientationEvent && DeviceOrientationEvent.requestPermission) DeviceOrientationEvent.requestPermission().catch(() => {});
  stopMic(); S.phase = 'film'; S.blown = true; S.blowT = performance.now(); $('#wish').classList.add('off');
  resetState(); S.cloudK = 0; ramp('cloudK', 1, 3.6); ramp('fadeIn', 0, 3.4); S.ramps.fadeIn.v = 1; ramp('glowPulse', 0, 1);
  audio.setIntensity(0.25, 0);
}
async function startMic() {
  const btn = $('#mic');
  try {
    micStream = await navigator.mediaDevices.getUserMedia({ audio: true }); btn.textContent = CFG.text.micListening;
    const c = new (window.AudioContext || window.webkitAudioContext)(), an = c.createAnalyser(); an.fftSize = 512; c.createMediaStreamSource(micStream).connect(an);
    const d = new Uint8Array(an.fftSize); let loud = 0;
    (function chk() { if (!micStream) { c.close(); return; } an.getByteTimeDomainData(d); let s = 0; for (const v of d) { const x = (v - 128) / 128; s += x * x; } loud = Math.sqrt(s / d.length) > 0.22 ? loud + 1 : 0; if (loud > 7) { c.close(); blow(); return; } requestAnimationFrame(chk); })();
  } catch (e) { btn.textContent = CFG.text.micUnavailable; }
}
function stopMic() { if (micStream) { micStream.getTracks().forEach(t => t.stop()); micStream = null; } }

// ---------------------------------------------------------------- seeking / skipping (state is rebuilt by replaying events instantly)
function seek(T) {
  if (S.phase === 'wish') { S.phase = 'film'; S.blown = true; S.blowT = performance.now() - 6000; $('#wish').classList.add('off'); audio.start(); }
  resetState(); S.T = clamp(T, 0, TL.duration); S.simT = S.T; S.snKey = null;
  for (const sc of TL.scenes) for (const ev of sc.ev || []) { const at = sc.start + ev[0]; if (at <= S.T) { S.fired.add(sc.n + ':' + ev[0] + ev[1] + (ev[2] ?? '')); fire(ev, true); } }
  if (S.T > TL.scenes[3].start + 9.5) fw.formInstant();
  if (S.laughUntil && S.T > S.laughUntil) S.helen.expr = S.helen.expr === 'joyful' ? 'calm' : S.helen.expr;
  if (S.petUntil && S.T > S.petUntil) { S.helen.pet = false; S.jessi.pet = false; }
  for (const k in S.ramps) S.ramps[k].v = S.ramps[k].to;
  // settle hair, cloth and particles without moving the story clock
  const T0 = S.T, sim0 = S.simT, fired0 = new Set(S.fired);
  for (let i = 0; i < 40; i++) step(1 / 60, true);
  S.T = T0; S.simT = sim0; S.fired = fired0; syncClip(true);
}
function skip() { if (S.phase === 'wish') { blow(); return; } const sc = TL.at(S.T), i = TL.scenes.indexOf(sc); if (i < TL.scenes.length - 1) seek(TL.scenes[i + 1].start + 0.01); }

// ---------------------------------------------------------------- update
const prevCam = { x: 800, y: 500, z: 1 }; let motion = [0, 0];
function step(dtReal, warm) {
  if (S.phase === 'wish') { S.simT += dtReal; wind.update(S.simT); return; }
  // master time + bullet-time
  S.T = Math.min(S.T + dtReal, TL.duration + 600);
  S.timeScale = timeScaleAt(S.bt, S.T); const dt = dtReal * S.timeScale; S.simT += dt;
  stepRamps(dtReal); wind.update(S.simT);
  const sc = TL.at(Math.min(S.T, TL.duration - 0.001)); S.scene = sc; S.lt = S.T - sc.start;
  for (const ev of sc.ev || []) { const key = sc.n + ':' + ev[0] + ev[1] + (ev[2] ?? ''); if (S.lt >= ev[0] && !S.fired.has(key)) { S.fired.add(key); fire(ev, warm); } }
  if (S.laughUntil && S.T > S.laughUntil && S.helen.expr === 'joyful') S.helen.expr = 'calm';
  if (S.petUntil && S.T > S.petUntil) { S.helen.pet = false; S.jessi.pet = false; }
  const sub = (sc.sub || []).find(s => S.lt >= s[0] && S.lt < s[0] + s[2]); if (!warm) setSub(sub ? sub[1] : '');
  // rigs
  const hw = wind.at(HS.x), bp = boyPlace(), bw = wind.at(bp.x);
  const petT = S.helen.pet ? jessiHeadLocal() : null;
  helen.update({ t: S.simT, dt, wind: hw.s * 90, expr: S.helen.expr, lookUp: S.helen.lookUp, pet: petT });
  boy.update({ t: S.simT, dt, wind: bw.s * 90 * (bp.flip ? -1 : 1), pose: boyPose(), reach: boyReach(bp) });
  jessi.update({ t: S.simT, dt, wind: hw.s * 90, pet: S.jessi.pet, lookUp: S.jessi.lookUp, happy: true });
  stepSnow(dt, warm);
  // particles
  fw.update(dt, S.simT, wind.at(800).s);
  fw.letterAlpha = 1 - smoothstep(TL.scenes[6].start + 3, TL.scenes[6].start + 10, S.T);
  thread.update(dt, S.simT); amb.update(dt, S.simT, wind);
  if (amb.lanternOn && Math.random() < dt * 1.4 && amb.lanterns.length < 40) amb.spawnLantern();
  if (amb.wishOn && S.T < TL.scenes[4].start + 15 && Math.random() < dt * 9) amb.spawnWish(HS.x + 10, HS.y - 20, HS.gy + 6, 1);
  if (S.T - S.fuseT < 2.6 && S.T > S.fuseT && dt > 0) { const f = LY.crate.fuse, s = us(PLACE.launcher.y); for (let i = 0; i < 3; i++) fw.emit(5, f[0] + rand(-1, 1) * s, f[1], rand(-30, 30) * s, rand(-40, 10) * s, rand(0.2, 0.5), PLACE.launcher.y, 1.2 * s, 0); }
  if (S.softFw != null) { const k = S.T - S.softFw; if (k > 0 && !S._sfw) S._sfw = 0; while (S._sfw < 4 && k > 0.5 + S._sfw * 3.2) { const v = S.msgBox.v, w = v.toWorld(innerWidth * rand(0.25, 0.75), innerHeight * rand(0.15, 0.3), SKY_GY); fw.launch([w[0] + rand(-40, 40), HZ + 2, SKY_GY], w, 2.2, { kind: 'willow', n: 90, speed: 150, size: 2.2, hue: S._sfw % 3 }); S._sfw++; } }
  if (S.T > TL.duration + 2 && !S.ended) showEnd();
  // camera
  const portrait = innerHeight > innerWidth, lt = Math.min(S.lt, sc.dur);
  let cam = cameraAt(sc, lt, anchor, portrait);
  if (S.T >= TL.duration) cam = cameraAt(TL.scenes[7], TL.scenes[7].dur, anchor, portrait);
  const fo = focusAt(sc, lt), focus = lerp(focusGy(fo.a), focusGy(fo.b), fo.k);
  if (!RM) { // handheld breathing, mouse / tilt parallax, firework shake
    const hk = 1 / Math.sqrt(cam.z);
    cam.x += noise2(S.real * 0.23, 1.7) * 5 * hk + S.input[0] * 14 / cam.z; cam.y += noise2(S.real * 0.19, 7.3) * 3.5 * hk + S.input[1] * 9 / cam.z; cam.roll = noise2(S.real * 0.15, 3.1) * 0.0035;
    if (S.shake > 0.05) { cam.x += (Math.random() - 0.5) * S.shake / cam.z; cam.y += (Math.random() - 0.5) * S.shake / cam.z; S.shake *= Math.exp(-dtReal * 7); }
  }
  view.set(innerWidth, innerHeight, cam);
  const mv = [(prevCam.x - cam.x) * view.S * cam.z, (prevCam.y - cam.y) * view.S * cam.z], ml = Math.hypot(mv[0], mv[1]);
  motion = !RM && ml > 6 && ml < 140 && !warm ? [clamp(mv[0] * 0.8, -60, 60), clamp(mv[1] * 0.8, -60, 60)] : [0, 0];
  Object.assign(prevCam, { x: cam.x, y: cam.y, z: cam.z });
  S.focus = focus; S.aper = sc.aper * 0.012 * (Math.max(0, cam.z - 1) + 0.2) * (portrait ? 0.85 : 1);   // depth of field grows with the push-in
  S.tod = lerp(sc.tod[0], sc.tod[1], clamp(lt / sc.dur, 0, 1));
  audio.setWind && audio.setWind(hw.g); audio.setNight && audio.setNight(clamp(S.tod - 1, 0, 1));
}
function jessiHeadLocal() { const jp = { x: PLACE.jessi.x, y: PLACE.jessi.seat, gy: PLACE.jessi.gy, flip: true }, ht = jessi.headTop ? jessi.headTop() : [4, -38.5], hd = local2world(jp, ht[0] + Math.sin(S.simT * 2.2) * 1.2, ht[1]); const s = us(HS.gy); return [(hd[0] - HS.x) / s, (hd[1] - HS.y) / s]; }
function boyPose() { const sc = S.scene ? S.scene.n : 0; if (sc === 7 || sc === 8) return 'walk'; if (sc === 4 || sc === 5) return S.boy.pose === 'stand' ? 'stand' : 'light'; if (sc === 6) return 'watch'; return S.boy.pose === 'watch' ? 'watch' : 'hide'; }
function boyReach(bp) {
  const pose = boyPose(), s = us(bp.y), fl = bp.flip ? -1 : 1, r = bp.rot || 0, toL = (wx, wy) => { const lx = (wx - bp.x) / (s * fl), ly = (wy - bp.y) / s; return [lx * Math.cos(-r) - ly * Math.sin(-r), lx * Math.sin(-r) + ly * Math.cos(-r)]; };
  if (pose === 'light') { const f = LY.crate.fuse; return toL(f[0], f[1]); }
  if (pose === 'watch' && S.boy.reachSnow) { const sp = snowAt(S.T); return toL(sp.x + 12 * SN * us(sp.gy), sp.y - 40 * SN * us(sp.gy)); }
  if (pose === 'watch') { const k = unitScale(PLACE.tree.y) / unitScale(1004); return toL(PLACE.tree.x - 46 * k, bp.y - 64 * s); }
  return null;
}

// ---------------------------------------------------------------- frame description -> renderer
const SKYC = [[1.0, 0.886, 0.69], [1.0, 0.76, 0.47], [0.98, 0.64, 0.53], [0.70, 0.43, 0.55], [0.17, 0.16, 0.34]];
const todMix = (arr, tod) => { const t = clamp(tod, 0, 2) * 2, i = Math.min(arr.length - 2, Math.floor(t)); return mix3(arr[i], arr[i + 1], t - i); };
function frame() {
  const W = innerWidth, H = innerHeight, portrait = H > W, tod = S.phase === 'wish' ? 1.74 : S.tod ?? 1.74, sun = [PLACE.sun.x, HZ - 66 + tod * 150], moon = [PLACE.moon.x, PLACE.moon.y, smoothstep(1.2, 1.6, tod)];
  const sunVis = smoothstep(0.66, 0.4, tod), night = clamp(tod - 0.9, 0, 1);
  const ambL = todMix([[1, 0.97, 0.94], [0.96, 0.84, 0.82], [0.66, 0.64, 0.86], [0.46, 0.44, 0.7], [0.34, 0.36, 0.58]], tod);
  const fogC = todMix(SKYC, tod), emK = smoothstep(0.45, 1.15, tod);
  for (const k in lists) lists[k].reset();
  const clip = clipOn && S.phase === 'film' ? { el: clipOn.el, zoom: 1 + Math.max(0, S.lt - (clipOn.el.duration || 99)) * 0.01 } : null;
  const F = { clip, view, W, H, pr: q.pr, t: S.real, simT: S.simT, tod, sun, sunVis, moon, amb: ambL, fog: fogC, fogK: 1, emK, focus: S.focus ?? 700, aper: S.aper ?? 0.01, maxBlur: 18, lists,
    sky: { aurora: rv('aurora') * (1 - smoothstep(TL.scenes[6].start + 6, TL.scenes[7].start + 4, S.T)), stars: smoothstep(1.0, 1.7, tod), cloudK: (S.phase === 'wish' ? 0 : rv('cloudK', 1)) * 0.7 },
    sea: { night, gustX: wind.front().x, gustA: wind.front().a * 0.8, waveA: S.scene && S.scene.n === 8 ? 0.7 : 1, reflK: 0.65 + 0.6 * rv('refl'), rip: new Float32Array(32) } };
  (S.rip || []).forEach((r, i) => F.sea.rip.set(r, i * 4));
  // lighting for the characters
  const fwl = fw.light, fwS = view.toScreen(fwl.x, fwl.y, SKY_GY), sunS = view.toScreen(moon[0], moon[1], HZ + 0.5);
  const keyC = [0.62, 0.7, 1.0].map(v => v * 0.7);
  const sp = S.snP || snowAt(S.T), snS = view.toScreen(sp.x, sp.y - 55 * SN * us(sp.gy), sp.gy), snK = snow.s.magic.x;
  const PR = [[LY.jar.light, LY.jar.gy, 46, 1.55, [1, 0.66, 0.36]], [LY.lamp560.light, LY.lamp560.gy, 110, 0.85, [1, 0.74, 0.46]], [LY.lamp60.light, LY.lamp60.gy, 130, 0.85, [1, 0.74, 0.46]],
    [[LY.tea.steam[0], LY.tea.steam[1] - 30], LY.tea.gy, 90, 0.7, [1, 0.7, 0.42]], [[640, 330], 721, 420, 0.28, [1, 0.8, 0.6]]];
  const charLight = (anc, extra = {}) => {
    const kd = [sunS[0] - anc[0], sunS[1] - anc[1]], kl = Math.hypot(kd[0], kd[1]) || 1;
    const near = PR.map(([p, gy, r, k, c]) => { const s = view.toScreen(p[0], p[1], gy), d = Math.hypot(s[0] - anc[0], s[1] - anc[1]); return [s[0], s[1], r * view.scaleAt(gy), k, c[0], c[1], c[2], d / (r * view.scaleAt(gy))]; }).sort((a, b) => a[7] - b[7]);
    const pls = [];
    if (fwl.k > 0.02) pls.push([fwS[0], fwS[1], Math.max(W, H) * 0.9, fwl.k * 0.6, 1, 0.84, 0.66]);
    if (extra.flame) pls.push([extra.flame[0], extra.flame[1], 60 * view.scaleAt(PLACE.boyLight.y), 1.4, 1, 0.62, 0.28]);
    if (snK > 0.1 && !extra.self) pls.push([snS[0], snS[1], 70 * view.scaleAt(sp.gy), 0.9 * snK, 1, 0.84, 0.55]);
    for (const n of near) if (pls.length < 4) pls.push(n.slice(0, 7));
    const a = mix3(ambL, [1, 0.9, 0.8], clamp(fwl.k * 0.25, 0, 0.3));
    return { amb: extra.amb || a, keyC: extra.keyC || keyC, keyDir: extra.keyDir || [kd[0] / kl, kd[1] / kl], rim: extra.rim ?? 1.0, pls };
  };
  const shadowDir = [0.35, 0.5], shA = 0.14;
  const blurOf = gy => Math.min(F.aper * Math.abs(gy - F.focus), F.maxBlur) * q.pr;
  const draw = [{ type: 'layer', layer: LY.ground, y: 0 }, { type: 'layer', layer: LY.wall, y: 1 }];
  const push = (it, y) => { if (it) { it.y = y; draw.push(it); } };
  const tight = smoothstep(2.6, 4.2, view.cam.z * fOf(HS.gy));
  const boyTight = smoothstep(1.9, 2.4, view.cam.z) * (S.scene && [3, 6].includes(S.scene.n) ? 1 : 0);
  for (const n of ['lamp60', 'lamp560', 'jar', 'tea', 'wires', 'planter', 'crate', 'tree', 'fg']) { const L = LY[n]; if ((n === 'planter' || n === 'lamp60' || n === 'fg') && tight > 0.98) continue; if (n === 'lamp60' && view.cam.y < 330) continue; if (n === 'fg' && boyTight > 0.5) continue; push({ type: 'layer', layer: L, wind: (wind.at((L.rect[0] + L.rect[2]) / 2).s - 0.45) * 0.6, sway: 1 + wind.at((L.rect[0] + L.rect[2]) / 2).g * 1.5 }, L.gy); }
  if (S.phase !== 'wish') {
    // Helen, Jessi, the gift teddy, the boy
    const hst = { t: S.simT, expr: S.helen.expr, wind: wind.at(HS.x).s * 90, eyeLights: eyeLights(), pet: S.helen.pet ? jessiHeadLocal() : null, lap: sp.mode === 'lap' ? lapDraw : null };
    const hi = views.helen.render(F, { x: HS.x, y: HS.y, gy: HS.gy }, hst, { groundY: baseY(HS.x) + 2, shadowA: shA * 0.8, shadowDir: [shadowDir[0] * 0.5, 0.9], shadowLen: 0.5 });
    if (hi) { hi.light = charLight(hi.anc); hi.blur = blurOf(HS.gy); push(hi, HS.gy); }
    const J = PLACE.jessi, ji = views.jessi.render(F, { x: J.x, y: J.seat, gy: J.gy, flip: true }, { t: S.simT, pet: S.jessi.pet, lookUp: S.jessi.lookUp, happy: true }, { shadowA: shA, shadowDir, shadowLen: 0.3 });
    if (ji) { ji.light = charLight(ji.anc); ji.blur = blurOf(J.gy); push(ji, J.gy); }
    // Snowki when he is out of her lap: flying, floating in front of the boy, perched on the crate
    if (sp.mode !== 'lap') {
      const si = views.snow.render(F, { x: sp.x, y: sp.y, gy: sp.gy }, {}, { scale: SN, shadowA: sp.mode === 'perch' ? shA : 0, shadowDir, shadowLen: 0.3 });
      if (si) { si.light = charLight(si.anc, { self: true, amb: mix3(ambL, [1, 0.94, 0.86], 0.55 * snK), rim: 1.3 }); si.blur = blurOf(sp.gy) * 0.5; push(si, sp.gy); }
    }
    const sc = S.scene ? S.scene.n : 0;
    if (sc >= 3 && sc <= 7) {
      const bp = boyPlace(), pose = boyPose(), walking = pose === 'walk';
      const lb = walking ? smoothstep(4.6, 5.6, S.lt) * (1 - smoothstep(6.8, 7.8, S.lt)) : 0, melt = walking ? smoothstep(8.6, 11.6, S.lt) : 0;
      const bst = { t: S.simT, pose, expr: walking ? 'farewell' : S.boy.expr, flame: S.boy.flame, look: bp.flip ? -0.3 : 0.3, gazeY: S.boy.gazeY || 0, lookBack: lb, eyeLights: sc === 6 ? eyeLights(0.7) : null };
      const bi = views.boy.render(F, { x: bp.x, y: bp.y, gy: bp.y, flip: bp.flip, rot: bp.rot }, bst, { shadowA: (walking ? 0.42 : shA * 1.1) * (1 - melt), shadowDir: walking ? [0.08, 1.2] : [Math.abs(shadowDir[0]) + 0.5, 0.35], shadowLen: walking ? 1.9 : 2.2 });
      if (bi) {
        let extra = {};
        if (walking) { const gS = view.toScreen(PLACE.walkTo.x - 60, HZ - 30, HZ + 0.5), d = [gS[0] - bi.anc[0], gS[1] - bi.anc[1]], l = Math.hypot(d[0], d[1]) || 1; extra = { amb: [0.2, 0.16, 0.3], keyC: [1, 0.72, 0.5].map(v => v * 1.7), keyDir: [d[0] / l, d[1] / l], rim: 1.9 }; }
        if (pose === 'light' && S.boy.flame) { const f = LY.crate.fuse; extra.flame = view.toScreen(f[0] - 6, f[1] - 4, PLACE.boyLight.y); }
        bi.light = charLight(bi.anc, extra); bi.blur = blurOf(bp.y); bi.glow = melt * 0.9; bi.alpha = 1 - smoothstep(10.4, 12.4, S.lt) * (walking ? 1 : 0);
        push(bi, bp.y);
        // the thread: from his chest towards her, stopping short
        const ch = local2world(bp, walking ? 0 : 1.5, -70);
        thread.set([ch[0], ch[1], bp.y], [sp.x, sp.y - 45 * SN * us(sp.gy), sp.gy + 1]);
      }
    }
  }
  // sprites
  const lightT = [...ambL.map(v => Math.min(1, v * 1.05)), 0.9 * (1 - night * 0.5)];
  fw.draw(lists.emis, S.simT); amb.drawHeart(lists.emis, S.simT);
  if (emK > 0.05) { const lh = [128, HZ - 34], k = 0.6 + 0.4 * Math.max(0, Math.sin(S.real * 2.2)); lists.emis.push(lh[0], lh[1], HZ + 0.5, 0, 6, 6, 0, 0, 1, 0.95, 0.75, emK * k); lists.emis.push(lh[0], lh[1], HZ + 0.5, 0, 24, 24, 0, 0, 1, 0.85, 0.6, emK * k * 0.4); }
  if (tod < 1.25) amb.drawWalkers(lists.mid, atlas, S.simT, ambL.map(v => v * (1 - night * 0.6)), 1 - smoothstep(0.95, 1.25, tod));
  if (S.phase !== 'wish' && snK > 0.03) { const s = us(sp.gy), c = [sp.x, sp.y - 55 * SN * s]; lists.add.push(c[0], c[1], sp.gy + 2, 0, 60 * SN * s, 60 * SN * s, 0, 0, 1, 0.84, 0.55, 0.32 * snK); lists.add.push(c[0], c[1], sp.gy + 2, 0, 150 * SN * s, 150 * SN * s, 0, 0, 1, 0.7, 0.45, 0.12 * snK); }
  for (const p of S.snTrail) { const s = us(p.gy), a = clamp(p.life / p.ml, 0, 1), tw = 0.6 + 0.4 * Math.sin(S.real * 9 + p.r * 3); lists.add.push(p.x, p.y, p.gy + 2, p.r + S.real, 4.2 * s * (0.4 + a), 4.2 * s * (0.4 + a), 0, 0, 1, 0.9, 0.62, a * 0.9 * tw, atlas.uv.glint); }
  const bulbK = 0.45 + emK * 0.9;
  bulbs.forEach(([x, y, k], i) => { const c = [[1, 0.84, 0.5], [1, 0.66, 0.8], [0.78, 0.9, 1]][k], fl = 0.82 + 0.18 * Math.sin(S.real * 3 + i * 1.7), s = unitScale(721); lists.lights.push(x, y, 721, 0, 1.4 * s, 1.4 * s, 0, 0, 1, 0.98, 0.9, fl * bulbK); lists.lights.push(x, y, 721, 0, 9 * s, 9 * s, 0, 0, c[0], c[1], c[2], 0.32 * fl * bulbK); });
  if (S.phase !== 'wish') { const st = LY.tea.steam; for (let i = 0; i < 3; i++) { const ph = (S.simT * 0.4 + i / 3) % 1, s = unitScale(700); lists.mid.push(st[0] + Math.sin(ph * 6 + i) * 2 * s, st[1] - ph * 26 * s, 700, ph, (3 + ph * 6) * s, (3 + ph * 6) * s, 0, 0, 1, 1, 1, (1 - ph) * 0.35, atlas.uv.smoke); } }
  thread.vis = rv('thread') * (S.scene && S.scene.n === 7 ? 1 - 0.5 * smoothstep(8, 12, S.lt) : 1);
  thread.glow = 0.75 + 0.6 * rv('glowPulse') + 0.7 * rv('warm') + clamp(fw.light.k, 0, 1) * 0.3; thread.toStars = rv('toStars');
  thread.draw(lists.thread, S.simT);
  amb.heartVis = rv('heartVis'); amb.heartDraw = rv('heartDraw');
  amb.draw(lists, atlas, S.simT, lightT);
  draw.push({ type: 'sprites', list: lists.mid, add: false, y: 662 }, { type: 'sprites', list: lists.add, add: true, y: 663 }, { type: 'sprites', list: lists.lights, add: true, y: 721 },
    { type: 'sprites', list: lists.thread, add: true, y: 1001 }, { type: 'sprites', list: lists.fgAlpha, add: false, y: 1300, overlay: true }, { type: 'sprites', list: lists.fgAdd, add: true, y: 1301, overlay: true }, { type: 'sprites', list: lists.alpha, add: false, y: 1302, overlay: true });
  draw.sort((a, b) => a.y - b.y);
  F.before = [{ type: 'layer', layer: LY.far }]; F.draw = draw;
  // post
  const bright = clamp(fw.light.k, 0, 1.5), fade = S.phase === 'wish' ? 1 : rv('fadeIn');
  const sunUV = sunVis > 0.02 ? [sunS[0] / W, 1 - sunS[1] / H] : null;
  F.post = { thresh: lerp(0.93, 0.6, night), bloomK: 0.42 + bright * 0.55 + night * 0.12, raysK: q.rays * sunVis * 0.5, sunUV, flareK: q.flare * (0.4 + bright), halK: 0.08, grain: 0.03, vig: 0.6,
    chroma: 0.006, dirtK: 0.55, sat: 1.05 + bright * 0.05, expo: 1.0 + (S.scene && S.scene.n === 7 ? 0.05 : 0), letter: S.phase === 'wish' ? 0 : (portrait ? 0.035 : 0.085) * smoothstep(0, 2.5, S.T), fade, fadeC: [0.165, 0.106, 0.302], motion };
  if (window.__postOverride) Object.assign(F.post, window.__postOverride);
  if (window.__fOverride) window.__fOverride(F);
  return F;
}
function eyeLights(k = 1) {
  if (!fw.targets || fw.light.k < 0.05) return null; const n = 7, out = [], t = S.simT;
  for (let i = 0; i < n; i++) { const tw = 0.5 + 0.5 * Math.sin(t * 3 + i * 1.9), pink = i === n - 1; out.push([-0.55 + i * 0.16 + Math.sin(i * 7.7) * 0.05, -0.35 + Math.sin(i * 3.3) * 0.12, 255, pink ? 170 : 214, pink ? 200 : 130, (0.45 + 0.4 * tw) * clamp(fw.light.k, 0.3, 1) * k * fw.letterAlpha, 0.1 + 0.05 * tw]); }
  return out;
}

// ---------------------------------------------------------------- loop, perf test, visibility, input
let last = performance.now(), paused = false, perf = { n: 0, sum: 0, done: false };
function loop(now) {
  requestAnimationFrame(loop);
  if (paused) { last = now; return; }
  const dtReal = Math.min((now - last) / 1000, 1 / 20); last = now; S.real += dtReal;
  if (S.phase === 'film' && !perf.done && S.T > 1.2) { perf.n++; perf.sum += dtReal; if (perf.n >= 90) { perf.done = true; const avg = perf.sum / perf.n; if (avg > 0.026 && q.name !== 'low') { const nt = q.name === 'high' ? 'medium' : 'low'; Object.assign(q, { name: nt, pr: TIERS[nt].pr, postDiv: TIERS[nt].postDiv, rays: TIERS[nt].rays, flare: TIERS[nt].flare }); if (GL) R.q.postDiv = q.postDiv, R.w = 0; console.info('film quality ->', nt, (avg * 1000).toFixed(1) + 'ms'); } } }
  step(dtReal); syncClip(false);
  try { R.render(frame()); } catch (e) { console.error(e); }
  if (S.phase === 'wish' || S.blown) drawWish(dtReal);
}
document.addEventListener('visibilitychange', () => { paused = document.hidden; audio.suspend(paused); });
addEventListener('resize', () => { if (fw) placeMessageKeep(); });
function placeMessageKeep() { const had = fw.targets; placeMessage(); if (had && S.T > TL.scenes[3].start + 9.5) fw.formInstant(); }
addEventListener('pointermove', e => { S.input = [(e.clientX / innerWidth - 0.5) * 2, (e.clientY / innerHeight - 0.5) * 2]; });
addEventListener('deviceorientation', e => { if (e.gamma == null) return; S.input = [clamp(e.gamma / 30, -1, 1), clamp((e.beta - 45) / 30, -1, 1)]; });
$('#wish').addEventListener('click', e => { if (e.target.id === 'mic') return; blow(); });
$('#mic').addEventListener('click', e => { e.stopPropagation(); startMic(); });
addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { if (S.phase === 'wish') { e.preventDefault(); blow(); } } });
const muteBtn = $('#mute'); const setMuteUI = () => { muteBtn.textContent = audio.muted ? '♪̸' : '♪'; muteBtn.setAttribute('aria-label', audio.muted ? CFG.text.unmute : CFG.text.mute); muteBtn.setAttribute('aria-pressed', String(audio.muted)); };
muteBtn.addEventListener('click', () => { audio.setMuted(!audio.muted); setMuteUI(); }); setMuteUI();
$('#skip').addEventListener('click', skip); $('#skip').setAttribute('aria-label', CFG.text.skip);
$('#again').textContent = CFG.text.watchAgain; $('#cont').textContent = CFG.text.continue;
$('#again').addEventListener('click', () => { S.phase = 'wish'; S.blown = false; S.blowT = -1; smoke = []; resetState(); $('#wish').classList.remove('off'); wc.style.display = 'block'; audio.setIntensity(0.25, 0); });
$('#cont').addEventListener('click', () => { try { parent.postMessage({ type: 'film-done' }, '*'); } catch (e) {} });
$('#wish .t').textContent = CFG.text.wishTitle; $('#wish .h').textContent = CFG.text.wishHint; $('#mic').textContent = CFG.text.micButton;
if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) $('#mic').hidden = true;

// test / automation API
window.__film = { seek: T => seek(T), skip, blow, state: S, q, gl: GL, timeline: TL, pause: p => (paused = p), layers, R, view, clips: CLIPS };

// ---------------------------------------------------------------- start (after the fonts the sky message is made of)
initSystems();
(document.fonts ? Promise.race([document.fonts.load('700 100px "Cinzel"'), new Promise(r => setTimeout(r, 2500))]) : Promise.resolve()).then(() => {
  placeMessage(); $('#veil').classList.add('off');
  if (qs.has('t')) seek(parseFloat(qs.get('t')));
  requestAnimationFrame(loop);
});

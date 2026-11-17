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
  constructor() { this.p = new Pup(); this.k = 0.56; this.bounds = [-23, -36, 21, 3]; this.p.act('happy'); }
  update(st) { const want = st.pet ? 'pet' : st.lookUp ? 'lookUp' : st.happy ? 'happy' : 'sit'; if (this.p.name !== want) this.p.act(want); this.p.lookAt(st.lookUp ? 0 : -0.4, 0); this.p.update(st.dt); }
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
  helen: {}, boy: {}, jessi: {},
  ramps: {}, lines: [], ended: false, blowT: -1, input: [0, 0], cloudK: 1, sn: null, snTrail: [], snPrev: null, say: null, snGift: false
};
function freshActors() {
  S.helen = { expr: 'calm', turn: -0.35, gaze: -0.6, lookUp: 0, handChest: 0 };
  S.boy = { expr: 'watching', kneel: false, hold: false, reach: false, signal: 0, lookDown: 0, gift: true, lighting: false, flame: false, gazeUp: 0, watch: false };
  S.jessi = { lookUp: false, happy: false };
}
freshActors();
const ramp = (k, to, dur, instant) => { const cur = S.ramps[k] ? S.ramps[k].v : (to === 0 ? 1 : 0); S.ramps[k] = instant ? { v: to, to, rate: 0 } : { v: cur, to, rate: Math.abs(to - cur) / Math.max(dur, 0.001) }; };
const rv = (k, d = 0) => (S.ramps[k] ? S.ramps[k].v : d);
function stepRamps(dt) { for (const r of Object.values(S.ramps)) { if (r.v < r.to) r.v = Math.min(r.to, r.v + r.rate * dt); else if (r.v > r.to) r.v = Math.max(r.to, r.v - r.rate * dt); } }
const TIMERS = [];
function resetState() {
  TIMERS.forEach(clearTimeout); TIMERS.length = 0;
  Object.assign(S, { T: 0, simT: 0, scene: null, lt: 0, fired: new Set(), timeScale: 1, bt: null, shake: 0, ramps: {}, lines: [], ended: false, cloudK: 1, sn: null, snTrail: [], snPrev: null, say: null, snGift: false, softFw: null, _sfw: 0, snKey: null, snGlow: -99, snFront: false, fuseT: -99, flashT: -99 });
  freshActors(); initSystems(); placeMessage(); $('#lines').innerHTML = ''; $('#end').classList.remove('on'); setSub(''); sayHide(); hbShow(false);
}

// ---------------------------------------------------------------- where the fireworks burst: a view of the sky shot (the message itself is HTML)
function placeMessage() {
  const W = innerWidth, H = innerHeight, portrait = H > W, sk = anchor('skyWide', portrait), v = new View().set(W, H, { x: sk.x, y: sk.y, z: 1, roll: 0, lens: 0 });
  fw.setTargets(null); S.msgBox = { v, W, H };
}

// ---------------------------------------------------------------- places and live anchors for the camera grammar
const us = gy => unitScale(gy);
const MEET = { x: 1012, y: 806 }, LIGHT = { x: 1118, y: 820 }, AWAY = { x: 1250, y: 606 }, SNF = [400, 666, 666], SNM = [966, 808, 808];
const sideAt = () => [386, capY(386) - 1, baseY(386) + 0.5];   // Snowki sits beside her on the wall
const launchPt = () => (LY.crate ? LY.crate.top : [1148, 760, 824]);
// where the man is: behind the bougainvillea tree; steps out and kneels for Snowki; goes to his crate; watches her; walks away
function boyPlace() {
  const s = n => TL.scenes[n - 1].start, T = S.T;
  if (T < s(5)) return { x: PLACE.boy.x, y: PLACE.boy.y, flip: true, rot: 0.16 };
  if (T < s(6) + 3.0) { const u = ease.inOutSine(clamp((T - s(5)) / 1.2, 0, 1)); return { x: lerp(PLACE.boy.x, MEET.x, u), y: lerp(PLACE.boy.y, MEET.y, u), flip: true, rot: lerp(0.16, 0, u) }; }
  if (T < s(9) + 3.6) { const u = ease.inOutSine(clamp((T - s(6) - 3.0) / 1.6, 0, 1)); return { x: lerp(MEET.x, LIGHT.x, u), y: lerp(MEET.y, LIGHT.y, u), flip: T >= s(9), rot: 0 }; }
  const u = clamp((T - s(9) - 3.6) / 12.4, 0, 1);
  return { x: lerp(LIGHT.x, AWAY.x, u), y: lerp(LIGHT.y, AWAY.y, u), flip: false, rot: 0, walk: true };
}
function local2world(p, lx, ly) { const s = us(p.gy ?? p.y), fl = p.flip ? -1 : 1, r = p.rot || 0; return [p.x + s * fl * (lx * Math.cos(r) - ly * Math.sin(r)), p.y + s * (lx * Math.sin(r) + ly * Math.cos(r))]; }
const HS = { x: PLACE.helen.x, y: PLACE.helen.seat, gy: PLACE.helen.gy };
const helenW = (lx, ly) => [HS.x + lx * us(HS.gy), HS.y + ly * us(HS.gy)];
const boyHead = (bp, dy = 0) => { const h = boy.P && boy.P.head ? boy.P.head : [0.3, -86]; return local2world(bp, h[0], h[1] + dy); };
function anchor(name, portrait) {
  const bp = boyPlace(), hf = helenW(1, -37.5), hc = helenW(0.5, -20), sp = snowAt(S.T), snc = [sp.x, sp.y - 55 * SN * us(sp.gy)];
  switch (name) {
    case 'wide': return portrait ? { x: 420, y: 540, gy: 700 } : { x: 660, y: 530, gy: 720 };
    case 'helenBack': return portrait ? { x: hc[0] + 8, y: hc[1] - 10, gy: HS.gy } : { x: hc[0] + 30, y: hc[1] - 14, gy: HS.gy };
    case 'manPOV': { const c = local2world(bp, 0, -70); return portrait ? { x: hc[0] + 8, y: hc[1] - 12, gy: HS.gy, zk: 1.2 } : { x: lerp(hc[0], c[0], 0.62), y: lerp(hc[1], c[1], 0.5) - 10, gy: lerp(HS.gy, bp.y, 0.6) }; }
    case 'crate': { const L = launchPt(); return { x: (LIGHT.x + L[0]) / 2 - (portrait ? 0 : 10), y: L[1] - 6, gy: L[2], zk: portrait ? 0.8 : 1 }; }
    case 'rocket': { const r = fw.rockets[fw.rockets.length - 1]; if (r) return { x: r.x, y: r.y + 60 }; const v = S.msgBox && S.msgBox.v, w = v ? v.toWorld(innerWidth * 0.5, innerHeight * 0.3, SKY_GY) : [520, 300]; return { x: w[0], y: w[1] + 120 }; }
    case 'manWatch': { const c = boyHead(bp, 12); return { x: c[0] - (portrait ? 0 : 24), y: c[1], gy: bp.y }; }
    case 'walker': { const c = local2world(bp, 0, -62); return { x: c[0], y: c[1], gy: bp.y }; }
    case 'helenMed': return portrait ? { x: hc[0] + 14, y: hc[1] + 12, gy: HS.gy, zk: 0.85 } : { x: hc[0] + 30, y: hc[1] + 4, gy: HS.gy };
    case 'helenUp': return { x: hf[0] + 8, y: hf[1] + 18, gy: HS.gy };
    case 'helenFace': return { x: hf[0] + (portrait ? 0 : 5), y: hf[1] + 1, gy: HS.gy };
    case 'helenSnow': { const c = helenW(0.5, -18); return { x: c[0] + (portrait ? 6 : 34), y: c[1] + 4, gy: HS.gy }; }
    case 'snowki': return { x: snc[0], y: snc[1], gy: sp.gy };
    case 'snowkiLow': return { x: snc[0] + (portrait ? 10 : 70) * sp.dir, y: snc[1] - 20 * us(sp.gy), gy: sp.gy };
    case 'treeMan': { const c = boyHead(bp, 4); return { x: c[0] - (portrait ? 0 : 40), y: c[1] + 10, gy: bp.y }; }
    case 'meet': { const c = boyHead(bp, 22); return { x: (c[0] + snc[0]) / 2, y: (c[1] + snc[1]) / 2 - 6, gy: (bp.y + sp.gy) / 2 }; }
    case 'meetUp': { const c = boyHead(bp, 10); return { x: c[0] - (portrait ? 0 : 14), y: c[1], gy: bp.y }; }
    case 'twoShot': { const c = local2world(bp, 0, -62); return { x: (hc[0] + c[0]) / 2, y: (hc[1] + c[1]) / 2 - 8, gy: (HS.gy + bp.y) / 2, zk: portrait ? 0.62 : 1 }; }
    case 'skyWide': return portrait ? { x: 470, y: 300 } : { x: 520, y: 320 };
    case 'finalWide': return portrait ? { x: 440, y: 470 } : { x: 620, y: 460 };
  }
  return { x: 800, y: 500 };
}
function focusGy(name) {
  switch (name) { case 'helen': return PLACE.helen.gy; case 'snowki': return snowAt(S.T).gy; case 'boy': return boyPlace().y; case 'crate': return launchPt()[2]; case 'sky': return HZ + 12; }
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
    case 'snTurn': S.snFront = true; break;
    case 'snAlert': snAct('alert', { dir: [1, -0.15] }, 2.4); break;
    case 'snAlive': snAct('idle', { expr: 'happy' }, 2.0); S.snGlow = S.T; break;
    case 'snHome': S.snFront = false; break;
    case 'boyLookDown': S.boy.lookDown = 1; break;
    case 'boySmile': S.boy.expr = 'contentment'; break;
    case 'memOn': ramp('mem', 1, 1.1, instant); break;
    case 'memOff': ramp('mem', 0, 1.1, instant); break;
    case 'boyKneel': S.boy.kneel = true; break;
    case 'boyReach': S.boy.reach = true; break;
    case 'boyHold': S.boy.reach = false; S.boy.hold = true; S.boy.lookDown = 0.6; break;
    case 'say': say(arg, S.evAt ?? S.T); break;
    case 'boyLookHelen': S.boy.lookDown = 0; break;
    case 'boyPutDown': S.boy.hold = false; S.boy.gift = false; S.snGift = true; break;
    case 'boyStand': S.boy.kneel = false; break;
    case 'boyLight': S.boy.kneel = true; S.boy.lighting = true; S.boy.lookDown = 0.7; break;
    case 'flame': S.boy.flame = true; break;
    case 'fuse': S.fuseT = S.T; if (!instant) audio.noise && audio.noise(1.8, 3000, 5000, 0.03, 0.8, 'highpass'); break;
    case 'launch': if (!instant) { const L = launchPt(), v = S.msgBox.v, w = v.toWorld(innerWidth * 0.5, innerHeight * (innerHeight > innerWidth ? 0.2 : 0.24), SKY_GY); fw.launch([L[0], L[1], L[2]], w, 2.8, { kind: 'peony', n: 360, speed: 600, hue: 0, size: 6, big: true }); } S.boy.flame = false; break;
    case 'boyBack': S.boy.kneel = false; S.boy.lighting = false; S.boy.lookDown = 0; S.boy.gazeUp = 1; break;
    case 'crack': S.flashT = S.T; S.shake = RM ? 0 : 10; hbShow(true, instant); if (!instant) fireworksShow(); audio.setIntensity && audio.setIntensity(0.8, 0.5); break;
    case 'helenLookUp': S.helen.lookUp = 1; S.helen.expr = 'surprised'; break;
    case 'jessiLookUp': S.jessi.lookUp = true; break;
    case 'messageOff': hbShow(false); break;
    case 'hSurprised': S.helen.lookUp = 1; S.helen.expr = 'surprised'; S.helen.turn = 0.1; S.helen.gaze = 0; break;
    case 'hExcited': S.helen.handsUp = 1; break;
    case 'hHappy': S.helen.handsUp = 0; S.helen.expr = 'joyful'; break;
    case 'hSmile': S.helen.expr = 'smile'; S.helen.handChest = 1; S.helen.lookUp = 0.7; break;
    case 'snLookUp': snAct('lookUp', { expr: 'love', hold: 'gift' }, 60); break;
    case 'snHold': snAct('hold', { expr: 'soft', hold: 'gift', back: true }, 60); break;
    case 'jessiHappy': S.jessi.lookUp = false; S.jessi.happy = true; break;
    case 'boyWatch': S.boy.expr = 'contentment'; S.boy.gazeUp = 0; S.boy.watch = true; break;
    case 'boyLeave': S.boy.watch = false; S.boy.expr = 'farewell'; break;
    case 'helenSky': S.helen.lookUp = 0.6; S.helen.handChest = 0; break;
    case 'softFireworks': S.softFw = S.T; S._sfw = 0; break;
    case 'line': showLine(arg, instant); break;
    case 'end': showEnd(); break;
  }
}
// his quiet birthday wish: rockets rise from far along the beach and burst over the sea in gold, pink, blue and purple
function fireworksShow() {
  const v = S.msgBox.v, W = innerWidth, H = innerHeight, portrait = H > W;
  const spots = portrait ? [[0.25, 0.34], [0.75, 0.3], [0.5, 0.42], [0.2, 0.16], [0.8, 0.12], [0.35, 0.4], [0.68, 0.38], [0.5, 0.08]]
    : [[0.2, 0.32], [0.8, 0.28], [0.36, 0.44], [0.66, 0.42], [0.12, 0.16], [0.9, 0.14], [0.5, 0.48], [0.28, 0.1]];
  spots.forEach(([fx, fy], i) => TIMERS.push(setTimeout(() => {
    if (S.phase !== 'film') return; const w = v.toWorld(W * fx, H * fy, SKY_GY);
    const L = launchPt(); fw.launch([L[0] + rand(-3, 3), L[1], L[2]], w, 1.9 + rand(0, 0.5), { kind: i % 3 === 2 ? 'willow' : 'peony', n: 220, speed: 440 + rand(0, 110), hue: (i + 1) % 4, size: 5 });
  }, 250 + i * 760)));
}

// ---------------------------------------------------------------- Snowki: in her lap; alive, he walks to the man, is held, carries the gift back. Keys: [time, place, mode of the segment that starts there]
function snowKeys() {
  const s = n => TL.scenes[n - 1].start;
  return [[0, 'side', 'side'], [s(3) + 0.3, 'side', 'fly'], [s(3) + 1.3, SNF, 'walk'], [s(3) + 8.8, SNM, 'stand'], [s(5) + 1.9, SNM, 'lift'], [s(5) + 2.8, 'held', 'held'],
    [s(6) + 0.4, 'held', 'fly'], [s(6) + 1.1, SNM, 'walk'], [s(7) + 3.5, SNF, 'fly'], [s(7) + 4.5, 'side', 'side'], [1e9, 'side', 'side']];
}
const lapAt = () => { const p = helenW(-3.4, -2.6); return [p[0], p[1], HS.gy + 0.5]; };
function heldAt() { const bp = boyPlace(), hp = boy.P && boy.P.holdPt ? boy.P.holdPt : [7, -57.4], w = local2world(bp, hp[0], hp[1]); return [w[0], w[1], bp.y + 1]; }
function snowAt(T) {
  const K = SNK || (SNK = snowKeys()); let i = 0; while (i < K.length - 2 && T >= K[i + 1][0]) i++;
  const a = K[i], b = K[i + 1], mode = a[2], P = k => (k[1] === 'side' ? sideAt() : k[1] === 'lap' ? lapAt() : k[1] === 'held' ? heldAt() : k[1]);
  const pa = P(a), u = clamp((T - a[0]) / (b[0] - a[0]), 0, 1);
  if (mode === 'lap' || mode === 'side' || mode === 'held' || mode === 'stand') return { x: pa[0], y: pa[1], gy: pa[2], mode, t0: a[0], dir: 1 };
  const pb = P(b), e = mode === 'walk' ? u : ease.inOutSine(u), hop = mode === 'fly' ? Math.sin(u * Math.PI) * 34 : 0;
  return { x: lerp(pa[0], pb[0], e), y: lerp(pa[1], pb[1], e) - hop, gy: mode === 'fly' ? Math.max(pa[2], pb[2]) : lerp(pa[2], pb[2], e), mode, t0: a[0], dir: Math.sign(pb[0] - pa[0]) || 1 };
}
let SNK = null;
function snAct(name, o, dur) { S.sn = { name, o, t: S.T, until: S.T + dur }; }
const SN_DEFAULT = { lap: ['sit', {}], side: ['sit', {}], fly: ['fly', { expr: 'happy' }], walk: ['walk', {}], stand: ['stand', {}], lift: ['sit', { expr: 'happy' }], held: ['sit', { expr: 'happy' }] };
function stepSnow(dt, warm) {
  const sp = snowAt(S.T), d = SN_DEFAULT[sp.mode], want = S.sn && S.sn.t >= sp.t0 && S.T < S.sn.until ? [S.sn.name, { ...S.sn.o }] : [d[0], { ...d[1] }];
  if (sp.mode === 'walk') want[1].dir = [sp.dir, 0];
  if (sp.mode === 'side' && !(S.scene && S.scene.rev) && !S.snFront) want[1].back = true;   // facing the sea with her
  if (S.say && S.say.who === 'snowki' && S.T < S.say.until && want[0] === 'sit') want[0] = 'talk';
  if (S.snGift && !want[1].hold && sp.mode !== 'fly') want[1].hold = 'gift';
  if (S.say && S.say.who === 'snowki' && S.T < S.say.until) want[1].talk = true;
  const key = want[0] + JSON.stringify(want[1]) + sp.mode;
  if (key !== S.snKey) { S.snKey = key; snow.act(want[0], { stand: sp.mode === 'stand' || sp.mode === 'walk', ...want[1] }); }
  const sc = view.toScreen(sp.x, sp.y, sp.gy), prev = S.snPrev; S.snPrev = sc;
  const vel = prev && dt > 0 ? [(sc[0] - prev[0]) / Math.max(dt, 1e-3) * 0.5, (sc[1] - prev[1]) / Math.max(dt, 1e-3) * 0.5] : [0, 0];
  if (sp.mode === 'stand' || sp.mode === 'lift') snow.look(0.8, -0.7); else if (sp.mode === 'held') snow.look(0.45, -0.9); else if (sp.mode === 'lap' || sp.mode === 'side') snow.look(want[0] === 'alert' ? 0.9 : 0.1, 0.05); else snow.look(sp.dir * 0.6, 0);
  const glow = S.T - S.snGlow < 3 ? 0.6 : 0;
  snow.update(warm ? 1 / 60 : dt, { vel: sp.mode === 'fly' ? vel : [0, 0], magic: sp.mode === 'lap' || sp.mode === 'side' ? glow : 0.45 });
  // a few sparkles when he moves by magic
  const rate = sp.mode === 'fly' ? 3 : sp.mode === 'walk' ? (Math.random() < 0.35 ? 1 : 0) : glow > 0 ? 1 : 0;
  if (dt > 0) { const s = us(sp.gy); for (let i = 0; i < rate; i++) S.snTrail.push({ x: sp.x + rand(-8, 8) * s * 0.4, y: sp.y - rand(30, 75) * SN * s, gy: sp.gy, vx: rand(-6, 6) * s, vy: rand(-8, 4) * s, life: rand(0.6, 1.3), ml: 1.3, r: rand(0, 6) }); }
  for (const p of S.snTrail) { p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt; }
  S.snTrail = S.snTrail.filter(p => p.life > 0); if (S.snTrail.length > 160) S.snTrail.splice(0, S.snTrail.length - 160);
  S.snP = sp;
}

// ---------------------------------------------------------------- text overlays: subtitles, speech bubbles, the birthday message, final lines
let subT = 0;
function setSub(t) { const el = $('#sub'); if (el.dataset.t === t) return; el.dataset.t = t; el.classList.remove('on'); clearTimeout(subT); if (t) subT = setTimeout(() => { el.textContent = t; el.classList.add('on'); }, 450); }
function say(key, t0 = S.T) { const d = (CFG.text.dialogue || {})[key]; if (!d || t0 + d.dur <= S.T) return; S.say = { who: d.who, until: t0 + d.dur }; const el = $('#say'); el.textContent = d.text; el.dataset.who = d.who; el.classList.add('on'); placeSay(); }
function sayHide() { S.say = null; $('#say').classList.remove('on'); }
function placeSay() {
  if (!S.say) return; if (S.T > S.say.until) { sayHide(); return; }
  const el = $('#say'); let p;
  if (S.say.who === 'snowki') { const sp = S.snP || snowAt(S.T); p = view.toScreen(sp.x + 6 * SN * us(sp.gy), sp.y - 108 * SN * us(sp.gy), sp.gy); }
  else { const bp = boyPlace(), h = local2world(bp, 0.3, -104); p = view.toScreen(h[0], h[1], bp.y); }
  const w = el.offsetWidth, h = el.offsetHeight, x = clamp(p[0] - w / 2, 10, innerWidth - w - 10), y = clamp(p[1] - h - 14, 10, innerHeight - h - 10);
  el.style.transform = `translate(${x}px,${y}px)`; el.style.setProperty('--tx', clamp(p[0] - x, 16, w - 16) + 'px');
}
function hbShow(on, instant) {
  const el = $('#hb');
  if (on) { const L = CFG.text.skyMessage.map(fill); el.querySelector('.a').textContent = L[0]; el.querySelector('.bn').textContent = L[1] || ''; el.querySelector('.h').hidden = !CFG.text.skyHeart; el.classList.toggle('now', !!instant); el.classList.add('on'); }
  else el.classList.remove('on');
}
function showLine(i, instant) {
  const box = $('#lines'); if (box.querySelector('.l' + i)) return; const p = document.createElement('p'); p.className = 'l l' + i; p.innerHTML = fill(CFG.text.finalLines[i]).replace(/\n/g, '<br>');
  box.appendChild(p); requestAnimationFrame(() => requestAnimationFrame(() => p.classList.add('on')));
}
function showEnd() { if (S.ended) return; S.ended = true; $('#end').classList.add('on'); $('#cont').hidden = !EMBED; }

// ---------------------------------------------------------------- the memory: years ago, he gives her Snowki (a warm golden flashback over the scene)
const mc = $('#mem'), mxc = mc.getContext('2d'), memHelen = new Helen(), memBoy = new Boy(), memSnow = new Snowki(); memSnow.act('idle', { expr: 'happy' });
function drawMemory(dt) {
  const a = rv('mem'); if (a < 0.003) { if (mc.style.display !== 'none') mc.style.display = 'none'; return; }
  mc.style.display = 'block';
  const W = innerWidth, H = innerHeight, pr = Math.min(devicePixelRatio || 1, 2), x = mxc, t = S.real;
  if (mc.width !== Math.round(W * pr) || mc.height !== Math.round(H * pr)) { mc.width = Math.round(W * pr); mc.height = Math.round(H * pr); }
  x.setTransform(pr, 0, 0, pr, 0, 0); x.clearRect(0, 0, W, H); x.globalAlpha = a;
  const bg = x.createRadialGradient(W * 0.5, H * 0.42, 0, W * 0.5, H * 0.5, Math.max(W, H) * 0.8); bg.addColorStop(0, '#FFEFC8'); bg.addColorStop(0.45, '#F6C68C'); bg.addColorStop(1, '#9A6440');
  x.fillStyle = bg; x.fillRect(0, 0, W, H);
  for (let i = 0; i < 26; i++) { const bx = ((i * 137.5) % 100) / 100 * W, by = ((i * 61.3) % 70) / 100 * H, r = (14 + (i * 7) % 34) * Math.min(W, H) / 900, tw = 0.5 + 0.5 * Math.sin(t * 0.8 + i);
    const g = x.createRadialGradient(bx, by, 0, bx, by, r); g.addColorStop(0, `rgba(255,248,220,${0.35 * tw})`); g.addColorStop(1, 'rgba(255,248,220,0)'); x.fillStyle = g; x.fillRect(bx - r, by - r, r * 2, r * 2); }
  const gy = H * 0.9; x.fillStyle = 'rgba(190,140,90,.45)'; x.beginPath(); x.ellipse(W * 0.5, gy + 6, W * 0.7, H * 0.08, 0, 0, 7); x.fill();
  // the two of them, younger, the teddy passing from his hands to hers
  const k = Math.min(H * 0.62 / 92, W * 0.9 / 120), hx = W * 0.5 - 16 * k, bx = hx + 30 * k, HA = [[8.5, -14.5], [14, -13.5]];
  memHelen.update({ t, dt, wind: 12, expr: 'joyful', stand: true, armT: HA });
  memBoy.update({ t, dt, wind: 8, pose: 'stand', expr: 'contentment', armT: [[15, -55.5], [17.5, -53.5]], lookDown: 0.6 });
  memSnow.update(dt, { magic: 0 });
  x.save(); x.filter = 'sepia(0.3) saturate(1.15) brightness(1.06)';
  x.save(); x.translate(hx, gy - 41.6 * k); x.scale(k, k); x.lineJoin = x.lineCap = 'round'; memHelen.draw(x, { t, wind: 12, expr: 'joyful', stand: true, armT: HA }); x.restore();
  x.save(); x.translate(bx, gy); x.scale(-k * 0.95, k * 0.95); x.lineJoin = x.lineCap = 'round'; memBoy.draw(x, { t, pose: 'stand', expr: 'contentment' }); x.restore();
  x.save(); x.translate(hx + 14 * k, gy - 41.6 * k - 11 * k); x.scale(0.2 * k, 0.2 * k); memSnow.draw(x, { aura: false, sparkle: false }); x.restore();
  x.restore();
  // the soft golden edges of a memory
  const vg = x.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.32, W / 2, H / 2, Math.max(W, H) * 0.72); vg.addColorStop(0, 'rgba(255,222,170,0)'); vg.addColorStop(1, 'rgba(255,214,160,.92)');
  x.fillStyle = vg; x.fillRect(0, 0, W, H);
  const lk = x.createLinearGradient(0, 0, W, H); lk.addColorStop(0, 'rgba(255,240,200,.35)'); lk.addColorStop(0.35, 'rgba(255,240,200,0)'); x.fillStyle = lk; x.fillRect(0, 0, W, H);
  x.globalAlpha = 1;
}

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
  for (const sc of TL.scenes) for (const ev of sc.ev || []) { const at = sc.start + ev[0]; if (at <= S.T) { S.fired.add(sc.n + ':' + ev[0] + ev[1] + (ev[2] ?? '')); S.evAt = at; fire(ev, true); } }
  S.evAt = null;
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
  for (const ev of sc.ev || []) { const key = sc.n + ':' + ev[0] + ev[1] + (ev[2] ?? ''); if (S.lt >= ev[0] && !S.fired.has(key)) { S.fired.add(key); S.evAt = sc.start + ev[0]; fire(ev, warm); S.evAt = null; } }
  const sub = (sc.sub || []).find(s => S.lt >= s[0] && S.lt < s[0] + s[2]); if (!warm) setSub(sub ? sub[1] : '');
  // rigs
  const hw = wind.at(HS.x), bp = boyPlace(), bw = wind.at(bp.x);
  helen.update({ t: S.simT, dt, wind: hw.s * 90, ...S.helen, back: !(sc && sc.rev) });
  boy.update(boySt(bp, dt, bw.s * 90 * (bp.flip ? -1 : 1)));
  jessi.update({ t: S.simT, dt, wind: hw.s * 90, ...S.jessi });
  stepSnow(dt, warm);
  // particles
  fw.update(dt, S.simT, wind.at(800).s);
  amb.update(dt, S.simT, wind);
  if (S.softFw != null) { const k = S.T - S.softFw; while (S._sfw < 4 && k > 0.5 + S._sfw * 3.2) { const v = S.msgBox.v, w = v.toWorld(innerWidth * rand(0.3, 0.8), innerHeight * rand(0.12, 0.28), SKY_GY), L = launchPt(); fw.launch([L[0], L[1], L[2]], w, 2.2, { kind: 'willow', n: 160, speed: 330, size: 4, hue: S._sfw % 4 }); S._sfw++; } }
  if (S.T - S.fuseT < 1.6 && S.T > S.fuseT && dt > 0 && LY.crate) { const f = LY.crate.fuse, s = us(PLACE.launcher.y); for (let i = 0; i < 3; i++) fw.emit(5, f[0] + rand(-1, 1) * s, f[1], rand(-30, 30) * s, rand(-40, 10) * s, rand(0.2, 0.5), PLACE.launcher.y, 1.2 * s, 0); }
  if (S.T > TL.duration + 2 && !S.ended) showEnd();
  // camera
  const portrait = innerHeight > innerWidth, lt = Math.min(S.lt, sc.dur);
  let cam = cameraAt(sc, lt, anchor, portrait);
  if (S.T >= TL.duration) { const lst = TL.scenes[TL.scenes.length - 1]; cam = cameraAt(lst, lst.dur, anchor, portrait); }
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
// the man: hiding with one hand on the trunk and the little gift in the other; then kneeling, reaching, holding Snowki, talking
function boyPose() { return S.T < TL.scenes[4].start + 0.6 ? 'hide' : boyPlace().walk ? 'walk' : 'stand'; }
function boyReach(bp) {
  const s = us(bp.y), fl = bp.flip ? -1 : 1, r = bp.rot || 0, toL = (wx, wy) => { const lx = (wx - bp.x) / (s * fl), ly = (wy - bp.y) / s; return [lx * Math.cos(-r) - ly * Math.sin(-r), lx * Math.sin(-r) + ly * Math.cos(-r)]; };
  if (S.boy.lighting && LY.crate) { const f = LY.crate.fuse; return toL(f[0] - 4, f[1] - 2); }
  if (S.boy.reach) { const sp = snowAt(S.T); return toL(sp.x + 4 * SN * us(sp.gy), sp.y - (sp.mode === 'lift' ? 30 : 88) * SN * us(sp.gy)); }
  if (boyPose() === 'hide') { const k = unitScale(PLACE.tree.y) / unitScale(1004); return toL(PLACE.tree.x - 40 * k, bp.y - 70 * s); }
  return null;
}
const heldDraw = (ctx, p) => { ctx.save(); ctx.translate(p[0], p[1]); ctx.scale(SN, SN); ctx.filter = 'brightness(1.5) saturate(1.1)'; snow.draw(ctx, { aura: false, sparkle: false }); ctx.restore(); };
function boySt(bp, dt, wind) {
  const B = S.boy, sp = S.snP || snowAt(S.T);
  const lt = S.lt, sc = S.scene ? S.scene.n : 0, walking = boyPose() === 'walk';
  return { t: S.simT, dt, wind, pose: boyPose(), reach: boyReach(bp), expr: walking ? 'farewell' : B.expr, kneel: B.kneel, hold: B.hold, signal: B.signal, lookDown: B.lookDown, gift: B.gift, flame: B.flame,
    talk: !!(S.say && S.say.who === 'man' && S.T < S.say.until), held: sp.mode === 'held' ? heldDraw : null, look: -0.3, gazeY: B.lookDown * 0.8 - B.gazeUp * 0.9,
    lookBack: walking && sc === 9 ? smoothstep(5.0, 5.6, lt) * (1 - smoothstep(6.6, 7.2, lt)) : 0 };
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
    if (extra.flame) pls.push([extra.flame[0], extra.flame[1], 60 * view.scaleAt(PLACE.launcher.y), 1.5, 1, 0.62, 0.28]);
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
  const boyTight = smoothstep(1.9, 2.4, view.cam.z) * (S.scene && [2, 3, 4, 5, 6].includes(S.scene.n) ? 1 : 0);
  for (const n of ['lamp60', 'lamp560', 'jar', 'tea', 'wires', 'crate', 'tree', 'fg']) { const L = LY[n]; if ((n === 'planter' || n === 'lamp60' || n === 'fg') && tight > 0.98) continue; if (n === 'lamp60' && view.cam.y < 330) continue; if (n === 'fg' && boyTight > 0.5) continue; push({ type: 'layer', layer: L, wind: (wind.at((L.rect[0] + L.rect[2]) / 2).s - 0.45) * 0.6, sway: 1 + wind.at((L.rect[0] + L.rect[2]) / 2).g * 1.5 }, L.gy); }
  if (S.phase !== 'wish') {
    // Helen, Jessi, the gift teddy, the boy
    const hst = { t: S.simT, ...S.helen, back: !(S.scene && S.scene.rev), wind: wind.at(HS.x).s * 90, eyeLights: eyeLights(), lap: sp.mode === 'lap' ? lapDraw : null };
    const hi = views.helen.render(F, { x: HS.x, y: HS.y, gy: HS.gy }, hst, { groundY: baseY(HS.x) + 2, shadowA: shA * 0.8, shadowDir: [shadowDir[0] * 0.5, 0.9], shadowLen: 0.5 });
    if (hi) { hi.light = charLight(hi.anc); hi.blur = blurOf(HS.gy); push(hi, HS.gy); }
    const J = PLACE.jessi, ji = views.jessi.render(F, { x: J.x, y: J.seat, gy: J.gy, flip: true }, { t: S.simT, ...S.jessi }, { shadowA: shA, shadowDir, shadowLen: 0.3 });
    if (ji) { ji.light = charLight(ji.anc); ji.blur = blurOf(J.gy); push(ji, J.gy); }
    // Snowki when he is out of her lap and not in the man's arms: hopping, walking, standing on the promenade
    if (sp.mode !== 'lap' && sp.mode !== 'held') {
      const si = views.snow.render(F, { x: sp.x, y: sp.y, gy: sp.gy }, {}, { scale: SN, shadowA: sp.mode === 'fly' || sp.mode === 'side' ? 0 : shA * 1.4, shadowDir, shadowLen: 0.3 });
      if (si) { si.light = charLight(si.anc, { self: true, amb: mix3(ambL, [1, 0.94, 0.86], 0.55 * snK), rim: 1.3 }); si.blur = blurOf(sp.gy) * 0.5; push(si, sp.gy); }
    }
    // the man, by the bougainvillea tree
    { const bp = boyPlace(), bst = { ...boySt(bp, 0, wind.at(bp.x).s * 90 * (bp.flip ? -1 : 1)), t: S.simT, eyeLights: S.scene && S.scene.n >= 7 ? eyeLights(0.7) : null }, gone = S.scene && S.scene.n === 10 ? smoothstep(5, 9, S.lt) : 0;
      const bi = views.boy.render(F, { x: bp.x, y: bp.y, gy: bp.y, flip: bp.flip, rot: bp.rot }, bst, { shadowA: shA * 1.1, shadowDir: [Math.abs(shadowDir[0]) + 0.3, 0.4], shadowLen: 1.2 });
      if (bi) { const extra = {}; if (S.boy.flame && LY.crate) { const f = LY.crate.fuse; extra.flame = view.toScreen(f[0] - 6, f[1] - 4, PLACE.launcher.y); }
        bi.light = charLight(bi.anc, extra); bi.blur = blurOf(bp.y); bi.alpha = 1 - gone; bi.glow = gone * 0.6; push(bi, bp.y); } }
  }
  // sprites
  const lightT = [...ambL.map(v => Math.min(1, v * 1.05)), 0.9 * (1 - night * 0.5)];
  fw.draw(lists.emis, S.simT);
  if (emK > 0.05) { const lh = [128, HZ - 34], k = 0.6 + 0.4 * Math.max(0, Math.sin(S.real * 2.2)); lists.emis.push(lh[0], lh[1], HZ + 0.5, 0, 6, 6, 0, 0, 1, 0.95, 0.75, emK * k); lists.emis.push(lh[0], lh[1], HZ + 0.5, 0, 24, 24, 0, 0, 1, 0.85, 0.6, emK * k * 0.4); }
  if (tod < 1.25) amb.drawWalkers(lists.mid, atlas, S.simT, ambL.map(v => v * (1 - night * 0.6)), 1 - smoothstep(0.95, 1.25, tod));
  if (S.phase !== 'wish' && snK > 0.03) { const s = us(sp.gy), c = [sp.x, sp.y - 55 * SN * s]; lists.add.push(c[0], c[1], sp.gy + 2, 0, 60 * SN * s, 60 * SN * s, 0, 0, 1, 0.84, 0.55, 0.32 * snK); lists.add.push(c[0], c[1], sp.gy + 2, 0, 150 * SN * s, 150 * SN * s, 0, 0, 1, 0.7, 0.45, 0.12 * snK); }
  for (const p of S.snTrail) { const s = us(p.gy), a = clamp(p.life / p.ml, 0, 1), tw = 0.6 + 0.4 * Math.sin(S.real * 9 + p.r * 3); lists.add.push(p.x, p.y, p.gy + 2, p.r + S.real, 4.2 * s * (0.4 + a), 4.2 * s * (0.4 + a), 0, 0, 1, 0.9, 0.62, a * 0.9 * tw, atlas.uv.glint); }
  const bulbK = 0.45 + emK * 0.9;
  bulbs.forEach(([x, y, k], i) => { const c = [[1, 0.84, 0.5], [1, 0.66, 0.8], [0.78, 0.9, 1]][k], fl = 0.82 + 0.18 * Math.sin(S.real * 3 + i * 1.7), s = unitScale(721); lists.lights.push(x, y, 721, 0, 1.4 * s, 1.4 * s, 0, 0, 1, 0.98, 0.9, fl * bulbK); lists.lights.push(x, y, 721, 0, 9 * s, 9 * s, 0, 0, c[0], c[1], c[2], 0.32 * fl * bulbK); });
  if (S.phase !== 'wish') { const st = LY.tea.steam; for (let i = 0; i < 3; i++) { const ph = (S.simT * 0.4 + i / 3) % 1, s = unitScale(700); lists.mid.push(st[0] + Math.sin(ph * 6 + i) * 2 * s, st[1] - ph * 26 * s, 700, ph, (3 + ph * 6) * s, (3 + ph * 6) * s, 0, 0, 1, 1, 1, (1 - ph) * 0.35, atlas.uv.smoke); } }
  amb.draw(lists, atlas, S.simT, lightT);
  draw.push({ type: 'sprites', list: lists.mid, add: false, y: 662 }, { type: 'sprites', list: lists.add, add: true, y: 663 }, { type: 'sprites', list: lists.lights, add: true, y: 721 },
    { type: 'sprites', list: lists.thread, add: true, y: 1001 }, { type: 'sprites', list: lists.fgAlpha, add: false, y: 1300, overlay: true }, { type: 'sprites', list: lists.fgAdd, add: true, y: 1301, overlay: true }, { type: 'sprites', list: lists.alpha, add: false, y: 1302, overlay: true });
  draw.sort((a, b) => a.y - b.y);
  F.before = [{ type: 'layer', layer: LY.far }]; F.draw = draw;
  // post
  const bright = clamp(fw.light.k, 0, 1.5), fade = S.phase === 'wish' ? 1 : rv('fadeIn');
  const sunUV = sunVis > 0.02 ? [sunS[0] / W, 1 - sunS[1] / H] : null;
  F.post = { thresh: lerp(0.93, 0.6, night), bloomK: 0.42 + bright * 0.55 + night * 0.12, raysK: q.rays * sunVis * 0.5, sunUV, flareK: q.flare * (0.4 + bright), halK: 0.08, grain: 0.03, vig: 0.6,
    chroma: 0.006, dirtK: 0.55, sat: 1.05 + bright * 0.05, expo: 1.0 + 0.7 * Math.exp(-Math.max(0, S.T - (S.flashT ?? -99)) * 5), letter: S.phase === 'wish' ? 0 : (portrait ? 0.035 : 0.085) * smoothstep(0, 2.5, S.T), fade, fadeC: [0.165, 0.106, 0.302], motion };
  if (window.__postOverride) Object.assign(F.post, window.__postOverride);
  if (window.__fOverride) window.__fOverride(F);
  return F;
}
function eyeLights(k = 1) {   // firework light reflected in the eyes
  if (fw.light.k < 0.05) return null; const n = 6, out = [], t = S.simT, L = fw.light;
  for (let i = 0; i < n; i++) { const tw = 0.5 + 0.5 * Math.sin(t * 3 + i * 1.9); out.push([-0.5 + i * 0.18 + Math.sin(i * 7.7) * 0.05, -0.35 + Math.sin(i * 3.3) * 0.12, 255, Math.round(170 + 60 * L.g), Math.round(140 + 80 * L.b), (0.4 + 0.4 * tw) * clamp(L.k, 0.3, 1) * k, 0.1 + 0.05 * tw]); }
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
  drawMemory(dtReal); placeSay();
}
document.addEventListener('visibilitychange', () => { paused = document.hidden; audio.suspend(paused); });
addEventListener('resize', () => { if (fw) placeMessageKeep(); });
function placeMessageKeep() { placeMessage(); }
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

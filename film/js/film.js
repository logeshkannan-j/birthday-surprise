// "The Memories That Never Fade" – the film. Orchestrates world, rigs, physics, particles, crowd, camera, timeline,
// audio and rendering. Runs on WebGL2 (shaders) with a Canvas2D fallback.
import CFG from '../config.js';
import { clamp, lerp, ease, smoothstep, noise2, rand, mix3 } from './core.js';
import { View, PLACE, HZ, capY, baseY, unitScale, fOf, fromXZ, toXZ, CU } from './space.js';
import { bakeWorld, makeAtlas, wireBulbs, worldFx } from './world.js';
import { Crowd } from './crowd.js';
import { Wind } from './physics.js';
import { Helen, Boy, ImageActor } from './rigs.js';
import { Snowki } from './snowki.js';
import { Jessi as Pup } from './jessi.js';
import { SpriteList, Fireworks, Thread, Ambient, SKY_GY } from './particles.js';
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
// Jessi: the same puppy rig as on the birthday page (0.56 character units per rig unit). st.act = the rig action, st.vx = her
// ground speed in rig units/s (walk / run plant the paws at it), st.look = [gx, gy] (gy < 0 lifts her head)
class FilmJessi {
  constructor() { this.p = new Pup(); this.k = 0.56; this.bounds = [-24, -38, 22, 3]; this.p.act('sit'); }
  update(st) {
    const a = st.act || 'sit', sit = !!st.sit;
    if (this.p.name !== a || this.sit !== sit) { this.p.act(a, { vx: st.vx || 0, sit }); this.sit = sit; } else { this.p.o.vx = st.vx || 0; }
    const lk = st.look || [-0.4, 0]; this.p.lookAt(lk[0], lk[1]); this.p.update(st.dt);
  }
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
    launch: (d, main) => audio.whoosh(Math.min(d, main ? 3.4 : 1.6)),                 // the shell's whistle as it climbs
    thump: k => audio.boom(0.3 * k),                                                    // the mortar's lift charge
    burst: (k, x) => { audio.boom(k); S.shake = Math.max(S.shake, RM ? 0 : 5 * k); },
    crackle: () => audio.crackle()
  });
  fw.flat = !GL; fw.setLauncher(LY.crate, atlas.uv);                                   // the fuse cord (PLACE.fuse), mortar mouths, near-ground sprites
  thread = new Thread(q.thread); amb = new Ambient(q);
}

// ---------------------------------------------------------------- state
const S = {
  phase: 'wish', T: 0, simT: 0, real: 0, scene: null, lt: 0, fired: new Set(), timeScale: 1, bt: null, shake: 0,
  helen: {}, boy: {}, jessi: {},
  ramps: {}, lines: [], ended: false, blowT: -1, input: [0, 0], cloudK: 1, sn: null, snTrail: [], snPrev: null, say: null, snGift: false
};
function freshActors() {
  S.helen = { expr: 'calm', turn: -0.35, gaze: -0.6, lookUp: 0, handChest: 0, turnDir: 1 };
  S.boy = { expr: 'watching', kneel: false, hold: false, reach: false, signal: 0, lookDown: 0, gift: true, lighting: false, flame: false, gazeUp: 0, watch: false, look: 0.2 };
  S.jessi = { lookUp: false, happy: false, alert: false };
}
freshActors();
const ramp = (k, to, dur, instant) => { const cur = S.ramps[k] ? S.ramps[k].v : (to === 0 ? 1 : 0); S.ramps[k] = instant ? { v: to, to, rate: 0 } : { v: cur, to, rate: Math.abs(to - cur) / Math.max(dur, 0.001) }; };
const rv = (k, d = 0) => (S.ramps[k] ? S.ramps[k].v : d);
function stepRamps(dt) { for (const r of Object.values(S.ramps)) { if (r.v < r.to) r.v = Math.min(r.to, r.v + r.rate * dt); else if (r.v > r.to) r.v = Math.max(r.to, r.v - r.rate * dt); } }
const TIMERS = [];
function resetState() {
  TIMERS.forEach(clearTimeout); TIMERS.length = 0;
  Object.assign(S, { T: 0, simT: 0, scene: null, lt: 0, fired: new Set(), timeScale: 1, bt: null, shake: 0, ramps: {}, lines: [], ended: false, cloudK: 1, sn: null, snTrail: [], snPrev: null, say: null, snGift: false, softFw: null, _sfw: 0, snKey: null, snGlow: -99, snFront: false, fuseT: -99, flashT: -99, jfl: null, jPrev: null });
  freshActors(); initSystems(); placeMessage(); $('#lines').innerHTML = ''; $('#end').classList.remove('on'); setSub(''); sayHide();
}

// ---------------------------------------------------------------- where the fireworks burst: a view of the sky shot
function placeMessage() {
  const W = innerWidth, H = innerHeight, portrait = H > W, sk = anchor('skyWide', portrait), v = new View().set(W, H, { x: sk.x, y: sk.y, z: sk.zk || 1, roll: 0, lens: 0 });
  fw.setTargets(null); S.msgBox = { v, W, H };
}

// ---------------------------------------------------------------- places and live anchors for the camera grammar
const us = gy => unitScale(gy);
const sc0 = n => TL.scenes[n - 1].start;                         // story time where scene n starts
const MEET = PLACE.meet, LIGHT = PLACE.boyLight, TU = unitScale(PLACE.tree.y);
const HIDE = { x: PLACE.boy.x + 9 * TU, y: PLACE.boy.y };        // fully hidden: right behind the middle of the trunk
const PEEK = PLACE.boy;                                          // at the trunk's left edge (the hide / peek poses lean out past it)
const FUSE_SCENE = 6;                                            // the fuse cord lies on the promenade from scene 6 on
const SNF = [400, 666, 666], SNM = [MEET.x - 47, MEET.y + 2, MEET.y + 2];   // Snowki: at the foot of the wall below her -> in front-left of the man
const snPath = u => [lerp(SNF[0], SNM[0], u), lerp(SNF[1], SNM[1], u), lerp(SNF[2], SNM[2], u)];
const sideAt = () => [386, capY(386) - 1, baseY(386) + 0.5];     // Snowki sits beside her on the wall
const launchPt = () => (LY.crate ? LY.crate.top : [PLACE.launcher.x, PLACE.launcher.y - 20, PLACE.launcher.y]);
// the man: hidden behind the trunk; slides to its edge and peeks; steps out and walks to Snowki; kneels; goes to his end of the
// fuse; afterwards (while she watches the sky) comes a few steps closer and stays. Walking = 'walkHold' (3/4 front, planted feet).
const WALK_SPEED = 24;                                           // character units / s
function walkSeg(T, t0, A, B, v = WALK_SPEED) {                   // a walk from A to B starting at t0 at v char units/s; returns null outside it
  const d = Math.abs(B.x - A.x) / us((A.y + B.y) / 2), dur = Math.max(0.6, d / v), u = (T - t0) / dur;
  if (u < 0 || u >= 1) return null;
  return { x: lerp(A.x, B.x, u), y: lerp(A.y, B.y, u), flip: B.x < A.x, pose: 'walkHold', speed: d / dur, free: true, dur };
}
function walkDur(A, B) { return Math.max(0.6, Math.abs(B.x - A.x) / us((A.y + B.y) / 2) / WALK_SPEED); }
function boyAt(T = S.T) {
  const s = sc0, base = (p, pose) => ({ x: p.x, y: p.y, flip: true, rot: 0, pose, speed: 0 });
  if (T < s(2) + 3.6) return base(HIDE, 'hide');
  if (T < s(2) + 4.4) { const u = ease.inOutSine((T - s(2) - 3.6) / 0.8); return { ...base(HIDE, 'hide'), x: lerp(HIDE.x, PEEK.x, u), y: lerp(HIDE.y, PEEK.y, u), grip: u > 0.7 }; }
  if (T < s(3) + 0.9) return { ...base(PEEK, 'peek'), grip: true };
  let w = walkSeg(T, s(3) + 0.9, PEEK, MEET); if (w) return { ...w, rot: 0, free: false };   // carrying the little gift
  if (T < s(6) + 1.4) return base(MEET, 'stand');
  w = walkSeg(T, s(6) + 1.4, MEET, HIDE); if (w) return { ...w, rot: 0 };
  if (T < s(7) + 0.2) return { ...base(HIDE, 'hide'), grip: true };
  w = walkSeg(T, s(7) + 0.2, HIDE, LIGHT); if (w) return { ...w, rot: 0 };
  if (T < s(7) + 5.4) return base(LIGHT, 'stand');
  w = walkSeg(T, s(7) + 5.4, LIGHT, HIDE); if (w) return { ...w, rot: 0 };
  if (T >= s(9) + 11.6 && T < s(9) + 13.4) {
    const u = smoothstep(0, 0.8, T - s(9) - 11.6);
    return { ...base({ x: lerp(HIDE.x, PEEK.x, u), y: lerp(HIDE.y, PEEK.y, u) }, u > 0.75 ? 'peek' : 'hide'), grip: true };
  }
  return { ...base(HIDE, 'hide'), grip: true };
}
const boyPlace = () => boyAt(S.T);
function local2world(p, lx, ly) { const s = us(p.gy ?? p.y), fl = p.flip ? -1 : 1, r = p.rot || 0; return [p.x + s * fl * (lx * Math.cos(r) - ly * Math.sin(r)), p.y + s * (lx * Math.sin(r) + ly * Math.cos(r))]; }
const HS = { x: PLACE.helen.x, y: PLACE.helen.seat, gy: PLACE.helen.gy };
function helenPlace(T = S.T) {
  const local = T - sc0(9), [startX, startZ] = toXZ(HS.x, HS.gy);
  let X = startX, Z = startZ;
  const walkIn = clamp((local - 6.2) / 2.2, 0, 1), walkOut = clamp((local - 8.4) / 5.2, 0, 1);
  if (local >= 6.2) { X = lerp(startX, -4.7, ease.inOutSine(walkIn)); Z = lerp(startZ, 12.6, ease.inOutSine(walkIn)); }
  if (local >= 8.4) { X = lerp(-4.7, -5.0, ease.inOutSine(walkOut)); Z = lerp(12.6, 18.5, ease.inOutSine(walkOut)); }
  const [x, gy] = local >= 5 ? fromXZ(X, Z) : [HS.x, HS.gy];
  const stand = local >= 5;
  const walked = Math.hypot(-4.7 - startX, 12.6 - startZ) * ease.inOutSine(walkIn)
    + Math.hypot(-5.0 + 4.7, 18.5 - 12.6) * ease.inOutSine(walkOut);
  const walkPhase = Math.PI * 2 * walked / CU / 46;
  return { x, y: stand ? gy - Helen.STAND_GROUND * us(gy) : HS.y, gy, stand,
    walking: local >= 6.2 && local < 13.6, walkPhase };
}
const helenW = (lx, ly) => { const p = helenPlace(); return [p.x + lx * us(p.gy), p.y + ly * us(p.gy)]; };
const boyHead = (bp, dy = 0) => { const h = boy.P && boy.P.head ? boy.P.head : [0.3, -86]; return local2world(bp, h[0], h[1] + dy); };
// a scene's reverse-angle flag: true for the whole scene, or [[from, to], …] local-time ranges (the front view of her face)
function revNow() { const sc = S.scene; if (!sc || !sc.rev) return false; if (sc.rev === true) return true; return sc.rev.some(([a, b]) => S.lt >= a && S.lt < b); }
function anchor(name, portrait) {
  const bp = boyPlace(), hp = helenPlace(), hf = helenW(1, -37.5), hc = helenW(0.5, -20), sp = snowAt(S.T), snc = [sp.x, sp.y - 55 * SN * us(sp.gy)], jp = jessiAt(S.T);
  switch (name) {
    case 'wide': return portrait ? { x: hc[0] + 40, y: hc[1] - 70, gy: HS.gy, zk: 0.9 } : { x: 560, y: 520, zk: 0.94 };
    case 'trioBack': { const cx = (hc[0] + jp.x) / 2; return portrait ? { x: cx - 8, y: hc[1] - 8, gy: HS.gy, zk: 0.82 } : { x: cx + 40, y: hc[1] - 16, gy: HS.gy }; }
    case 'pairBack': { const cx = (snc[0] + jp.x) / 2; return portrait ? { x: cx - 30, y: snc[1] - 4, gy: sp.gy, zk: 0.85 } : { x: cx - 30, y: snc[1] - 12, gy: sp.gy }; }
    case 'treeMan': { const c = boyHead(bp, 30); return portrait ? { x: c[0] + 4, y: c[1] - 6, gy: bp.y, zk: 0.9 } : { x: c[0] + 34, y: c[1] - 14, gy: bp.y }; }
    case 'treeManClose': return portrait ? { x: PLACE.tree.x - 50, y: PLACE.tree.y - 108, zk: 0.82 } : { x: PLACE.tree.x - 110, y: PLACE.tree.y - 80 };
    case 'snowFace': return portrait ? { x: lerp(hc[0], jp.x, 0.5) - 6, y: lerp(hf[1], snc[1], 0.5) + 6, gy: sp.gy, zk: 0.6 } : { x: snc[0] + 24, y: snc[1] - 4, gy: sp.gy };   // (portrait: all three, nobody sliced by the frame edge)
    case 'otsHelen': { const c = local2world(bp, 0, -60); return portrait ? { ...anchor('snowTrack', true), zk: 0.6 } : { x: lerp(hc[0], c[0], 0.5) + 10, y: lerp(hc[1], c[1], 0.45) - 8, gy: lerp(HS.gy, bp.y, 0.5) }; }
    case 'helenTurn': return portrait ? { x: hf[0] + 34, y: hf[1] + 16, gy: HS.gy, zk: 0.9 } : { x: hf[0] + 24, y: hf[1] + 14, gy: HS.gy };
    case 'helenFront': return portrait ? { x: hf[0] + 34, y: hf[1] + 10, gy: HS.gy, zk: 0.8 } : { x: hf[0] + 8, y: hf[1] + 6, gy: HS.gy };
    case 'manSmile': { const c = boyHead(bp, 14); return { x: c[0] + (portrait ? 0 : 10), y: c[1], gy: bp.y }; }
    case 'manSmile2': { const c = boyHead(bp, 14); return { x: c[0] - (portrait ? 0 : 30), y: c[1], gy: bp.y }; }   // (him on the right third: the busy chai cart stays out of the shot)
    case 'boyFront': { const c = boyHead(bp, 10); return { x: c[0] + (portrait ? -2 : 8), y: c[1] - 4, gy: bp.y, zk: portrait ? 0.88 : 1 }; }
    case 'friendsWide': { const f = crowd.reunionAt(S.T), fx = f ? f.x : 620, fy = f ? f.y : 610, fg = f ? f.gy : 650;
      return portrait ? { x: lerp(hc[0], fx, 0.48), y: lerp(hf[1], fy, 0.5) - 12, gy: lerp(hp.gy, fg, 0.5), zk: 0.76 }
        : { x: lerp(hc[0], fx, 0.52), y: lerp(hf[1], fy, 0.5) - 18, gy: lerp(hp.gy, fg, 0.5) }; }
    case 'crate': { const t = LY.crate ? LY.crate.fuse : [LIGHT.x - 14, LIGHT.y - 2]; return { x: (t[0] + LIGHT.x) / 2 - (portrait ? 0 : 6), y: LIGHT.y - 32, gy: LIGHT.y, zk: portrait ? 0.8 : 1 }; }
    case 'spark': { const p = fw.sparkAt() || fw.mortarAt() || launchPt(); return { x: p[0], y: p[1] - 20, gy: p[2] }; }
    case 'mortar': { const p = fw.mortarAt() || launchPt(); return { x: p[0] - 10, y: p[1] + 6, gy: p[2] }; }   // (a little left: the chai cart's people stay out of the close-up)
    case 'rocket': { const r = fw.rockets[fw.rockets.length - 1]; if (r) return { x: r.x, y: r.y + 60 }; const v = S.msgBox && S.msgBox.v, w = v ? v.toWorld(innerWidth * 0.5, innerHeight * 0.3, SKY_GY) : [520, 300]; return { x: w[0], y: w[1] + 120 }; }
    case 'meet': { const c = boyHead(bp, 22); return portrait ? { x: (c[0] + jp.x) / 2 + 4, y: (c[1] + snc[1]) / 2 - 2, gy: (bp.y + sp.gy) / 2, zk: 0.8 } : { x: (c[0] + snc[0]) / 2, y: (c[1] + snc[1]) / 2 - 6, gy: (bp.y + sp.gy) / 2 }; }
    case 'meetUp': { const c = boyHead(bp, 10); return { x: c[0] - (portrait ? 0 : 14), y: c[1], gy: bp.y }; }
    case 'snowki': return { x: snc[0] + (portrait ? 0 : 20) * sp.dir, y: snc[1] - 4, gy: sp.gy };
    case 'snowTrack': { let x = 0, y = 0, g = 0; for (let i = -3; i <= 3; i++) { const p = snowAt(S.T + i * 0.4); x += p.x; y += p.ground ?? p.y; g += p.gy; } x /= 7; y /= 7; g /= 7;   // a smoothed follow: no whip pans
      const k = portrait ? 0.45 : 0.25; return { x: lerp(x, jp.x, k) + (portrait ? 4 : 50), y: lerp(y, jp.y, k) - 24 * us(g), gy: lerp(g, jp.gy, k), zk: portrait ? 0.85 : 1 }; }
    case 'snowkiLow': return { x: snc[0] + (portrait ? 10 : 60) * sp.dir, y: snc[1] - 22 * us(sp.gy), gy: sp.gy };
    case 'helenUp': return portrait ? { x: hf[0] - 6, y: hf[1] + 16, gy: HS.gy, zk: 1.15 } : { x: hf[0] + 8, y: hf[1] + 18, gy: HS.gy };
    case 'helenFace': return portrait ? { x: hf[0] - 6, y: hf[1] + 4, gy: HS.gy, zk: 1.05 } : { x: hf[0] + 5, y: hf[1] + 1, gy: HS.gy };
    case 'skyWide': return portrait ? { x: 190, y: 330, zk: 0.7 } : { x: 520, y: 320 };   // (portrait: a little wider so she stays in the sky shot)
    case 'finalMed': { const c = local2world(bp, 0, -60); return portrait ? { x: hc[0] + 40, y: hc[1] - 30, gy: HS.gy, zk: 0.75 } : { x: lerp(hc[0], c[0], 0.42), y: lerp(hc[1], c[1], 0.3) - 40, gy: lerp(HS.gy, bp.y, 0.3) }; }
    case 'finalWide': return portrait ? { x: 500, y: 470, zk: 0.64 } : { x: 620, y: 460 };
  }
  return { x: 800, y: 500 };
}
function focusGy(name) {
  switch (name) { case 'helen': return helenPlace().gy; case 'snowki': return snowAt(S.T).gy; case 'boy': return boyPlace().y; case 'crate': return launchPt()[2]; case 'sky': return HZ + 12; }
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
    // Snowki notices him, recognises him, comes alive
    case 'snTurn': S.snFront = true; break;
    case 'snAlert': snAct('alert', { dir: [1, -0.15] }, 5.0); break;
    case 'snRecog': snAct('alert', { dir: [0.9, -0.1], expr: 'surprised' }, 0.9); break;
    case 'snAlive': S.snGlow = S.T; snAct('hug', { expr: 'love' }, 1.5); break;
    case 'snHappy': snAct('idle', { expr: 'happy' }, 6); break;
    case 'snHome': S.snFront = false; break;
    // the man
    case 'boyLookDown': S.boy.lookDown = 1; break;
    case 'boySmile': S.boy.expr = 'contentment'; break;
    case 'memOn': ramp('mem', 1, 1.3, instant); audio.setIntensity && audio.setIntensity(0.35, 0.8); break;   // a gentle melody over the memory
    case 'memOff': ramp('mem', 0, 1.3, instant); audio.setIntensity && audio.setIntensity(0.25, 0); break;
    case 'boyKneel': S.boy.kneel = true; break;
    case 'boyReach': S.boy.reach = true; break;
    case 'boyHold': S.boy.reach = false; S.boy.hold = true; S.boy.lookDown = 0.6; break;
    case 'say': say(arg, S.evAt ?? S.T); break;
    case 'boyLookHelen': S.boy.lookDown = 0; break;
    case 'boyPutDown': S.boy.hold = false; S.boy.gift = false; S.snGift = true; break;
    case 'boyStand': S.boy.kneel = false; break;
    case 'boySmileBack': S.boy.expr = 'smile'; S.boy.lookDown = 0; S.boy.gazeUp = 0; break;
    case 'boyHeartbreak': S.boy.expr = 'watching'; S.boy.look = -0.5; S.boy.lookDown = 0.9; S.boy.gazeUp = 0; break;
    case 'boyToLight': S.boy.expr = 'contentment'; S.boy.lookDown = 0.3; break;
    // she slowly notices him: the head first, then the shoulders; a small gentle smile
    case 'hNotice': S.helen.turnDir = 1; ramp('hTurn', 1, 1.5, instant); S.helen.turn = 0.5; S.helen.gaze = 0.85; break;   // (turn/gaze: her front view looks toward him too)
    case 'hTurnBody': ramp('hBody', 1, 1.4, instant); break;
    case 'hSmile1': ramp('hSm', 1, 1.2, instant); S.helen.expr = 'smile'; S.helen.turn = 0.55; S.helen.gaze = 0.9; break;
    case 'hSearch': S.helen.turnDir = 1; S.helen.expr = 'surprised'; S.helen.turn = 0.75; S.helen.gaze = 0.85; S.helen.lookUp = 0.25; ramp('hTurn', 0.65, 0.5, instant); ramp('hBody', 0.25, 0.7, instant); break;
    case 'hBackToSea': ramp('hTurn', 0, 1.8, instant); ramp('hBody', 0, 1.6, instant); ramp('hSm', 0.35, 2, instant); S.helen.expr = 'calm'; S.helen.turn = -0.35; S.helen.gaze = -0.6; break;
    // the fireworks
    case 'boyLight': S.boy.kneel = true; S.boy.lighting = true; S.boy.lookDown = 0.7; break;
    case 'flame': S.boy.flame = false; fw.lighter(lighterHand); break;   // a long lighting stick (the flame is drawn by fw, not in his hand)
    case 'fuse': { S.fuseT = S.T; const at = S.evAt ?? S.T, dur = Math.max(0.6, evGap('fuse', 'launch', 1.9) - 0.5);   // burns to the mortar, then a beat of anticipation
      fw.igniteFuse(dur, S.simT - (S.T - at)); if (!instant) audio.noise && audio.noise(dur + 0.4, 2600, 5200, 0.035, 0.7, 'highpass'); break; }
    case 'launch': { const at = S.evAt ?? S.T, ago = S.T - at, dur = Math.max(1.2, evGap('launch', 'crack', 2.8));   // the shell bursts exactly on 'crack'
      if (ago < dur) fw.launch(launchPt(), mainBurstAt(), dur, mainShell(), ago); S.boy.flame = false; break; }
    case 'boyHide': S.boy.kneel = false; S.boy.lighting = false; S.boy.lookDown = 0; S.boy.gazeUp = 1; break;
    case 'boyWatch': S.boy.expr = 'smile'; S.boy.look = -0.45; S.boy.lookDown = 0.35; S.boy.gazeUp = 0; break;
    case 'crack': { S.flashT = S.T; S.shake = RM ? 0 : 10; const ago = S.T - (S.evAt ?? S.T);
      if (instant && ago < 2.5 && !fw.recent.length) { const w = mainBurstAt(); fw.burst(w[0], w[1], mainShell()); fw.advance(ago); }   // entered by seeking just after the crack
      { const v = S.msgBox.v, portrait = innerHeight > innerWidth, px = v.scaleAt(SKY_GY);
        const from = mainBurstAt(), center = v.toWorld(innerWidth * (portrait ? 0.5 : 0.45), innerHeight * (portrait ? 0.23 : 0.31), SKY_GY);
        const widthPx = portrait ? innerWidth * 0.84 : Math.min(innerWidth * 0.46, innerHeight * 0.9);
        fw.message({ lines: CFG.text.skyMessage.map(fill), heart: CFG.text.skyHeart, center, from,
          width: widthPx / px, px, hold: 6.5, ago,
          colors: [[1, 0.78, 0.34], [1, 0.44, 0.7]], heartColor: [1, 0.22, 0.35], font: '"Cinzel", serif' }); }
      fireworksShow(ago); audio.setIntensity && audio.setIntensity(0.8, 0.5); break; }
    case 'helenLookUp': S.helen.lookUp = 1; S.helen.expr = 'surprised'; ramp('hSm', 0, 0.4, instant); break;
    case 'jessiLookUp': S.jessi.lookUp = true; break;
    // her face (the reverse angle)
    case 'hSurprised': S.helen.lookUp = 1; S.helen.expr = 'surprised'; S.helen.turn = 0.1; S.helen.gaze = 0; break;
    case 'hExcited': S.helen.handsUp = 1; break;
    case 'hHappy': S.helen.handsUp = 0; S.helen.expr = 'joyful'; break;
    case 'hSmile': S.helen.expr = 'smile'; S.helen.handChest = 1; S.helen.lookUp = 0.7; break;
    case 'snLookUp': snAct('lookUp', { expr: 'love', hold: 'gift' }, 60); break;
    case 'snHold': snAct('hold', { expr: 'soft', hold: 'gift' }, 60); break;
    case 'jessiHappy': S.jessi.lookUp = false; S.jessi.happy = true; break;
    // the ending: all four; she turns to him, one last gentle smile, he smiles back; back to the sky
    case 'finalPlaces': S.boy.kneel = false; S.boy.lighting = false; S.boy.lookDown = 0; S.boy.gazeUp = 0.7; S.boy.expr = 'contentment'; break;
    case 'helenSky': S.helen.lookUp = 0.6; S.helen.handChest = 0; S.helen.handsUp = 0; S.helen.expr = 'smile'; break;
    case 'hTurnHim': S.helen.turnDir = 1; ramp('hTurn', 1, 1.5, instant); ramp('hBody', 0.55, 1.7, instant); S.helen.lookUp = 0.1; S.boy.gazeUp = 0; break;
    case 'hSmileHim': ramp('hSm', 1, 1.0, instant); break;
    case 'hBackToSky': ramp('hTurn', 0.1, 2.0, instant); ramp('hBody', 0, 1.8, instant); S.helen.lookUp = 0.55; break;
    case 'softFireworks': softFireworks(S.T - (S.evAt ?? S.T)); break;
    case 'line': showLine(arg, instant); break;
    case 'fadeOut': ramp('fadeIn', 0.5, 3.5, instant); break;
    case 'end': showEnd(); break;
  }
}
// ---------------------------------------------------------------- fireworks: the lighting stick, the one big shell, the show around the message
// his hand while he lights the fuse (world [x, y, gy]); the stick's flame reaches from it to his end of the fuse
function lighterHand() { if (!S.boy.lighting || !boy.P || !boy.P.arms) return null; const bp = boyPlace(), h = boy.P.arms[1][2], w = local2world(bp, h[0], h[1]); return [w[0], w[1], bp.y + 1]; }
// seconds between two events of the scene that is firing (so the fuse / climb always fit the timeline)
function evGap(a, b, def) { const sc = S.scene || TL.at(S.evAt ?? S.T), ev = sc.ev || [], A = ev.find(e => e[1] === a), B = ev.find(e => e[1] === b); return A && B && B[0] > A[0] ? B[0] - A[0] : def; }
const skyU = () => Math.min(innerWidth, innerHeight) / S.msgBox.v.S * (innerHeight > innerWidth ? 1.25 : 1);   // sky units that fit the screen
const mainBurstAt = () => S.msgBox.v.toWorld(innerWidth * 0.5, innerHeight * (innerHeight > innerWidth ? 0.17 : 0.22), SKY_GY);   // right behind the message
const mainShell = () => ({ type: 'chrys', big: true, col: 'gold', col2: 'pink', pistil: 'blue', ring: 'purple', R: skyU() * 0.34, n: 230, crackle: true, glitter: true });
const SHELLS = {
  pinkPeony: { type: 'peony', col: 'pink', col2: 'purple', R: 0.15, glitter: true }, goldChrys: { type: 'chrys', col: 'gold', col2: 'amber', pistil: 'blue', R: 0.165, crackle: true },
  blueX: { type: 'crossette', col: 'blue', col2: 'silver', R: 0.15 }, heart: { type: 'heart', col: 'pink', col2: 'rose', R: 0.12 }, willow: { type: 'willow', col: 'gold', R: 0.17, glitter: true, crackle: true },
  ring: { type: 'ring', col: 'purple', col2: 'blue', pistil: 'gold', R: 0.14 }, violetChrys: { type: 'chrys', col: 'purple', col2: 'blue', R: 0.16, glitter: true }, bluePeony: { type: 'peony', col: 'blue', col2: 'pink', R: 0.15, crackle: true },
  softWillow: { type: 'willow', col: 'gold', R: 0.15, glitter: true }, softPeony: { type: 'peony', col: 'rose', col2: 'violet', R: 0.12, glitter: true }, softRing: { type: 'ring', col: 'cyan', col2: 'violet', R: 0.11 }
};
// plan = [[seconds after t0 when it bursts, screen x, screen y (fractions of the sky shot), shell]]; shells launch from the cake's tubes
// and climb ~1.5 s; bursts never cover the moon. ago > 0: the plan started that long ago (seeking) – past shells are skipped.
function skyShow(plan, ago = 0) {
  const v = S.msgBox.v, W = innerWidth, H = innerHeight, U = skyU(), M = fw.L && fw.L.mouths && fw.L.mouths.length ? fw.L.mouths : [launchPt()], moon = v.toScreen(PLACE.moon.x, PLACE.moon.y, HZ + 0.5);
  plan.forEach(([at, fx, fy, sh], i) => {
    const climb = 1.35 + (i % 3) * 0.15, d = at - climb - ago; if (at <= ago) return;
    fw.schedule(Math.max(0, d), () => {
      if (S.phase !== 'film') return; const b = { ...sh, R: sh.R * U }, Rpx = b.R * v.scaleAt(SKY_GY); let sx = W * fx, sy = H * fy;
      const cb = PLACE.tree && PLACE.tree.canopy; if (cb) { const a = v.toScreen(cb[0], cb[1], PLACE.tree.y), c = v.toScreen(cb[2], cb[3], PLACE.tree.y); if (a[0] > W * 0.4 && sx > a[0] - Rpx * 0.4 && sy < c[1]) sx = Math.min(sx, a[0] - Rpx * 0.5); }   // keep clear of the tree's canopy
      const dx = sx - moon[0], dy = sy - moon[1], dd = Math.hypot(dx, dy) || 1, need = Rpx * 1.2 + 36; if (dd < need) { sx = moon[0] + dx / dd * need; sy = moon[1] + dy / dd * need; }
      fw.launch(M[(i * 5 + 2) % M.length], v.toWorld(sx, sy, SKY_GY), climb, b, Math.max(0, -d));
    });
  });
}
// his birthday wish keeps going around the message (the cake box is chain-fused to the mortar)
function fireworksShow(ago = 0) {
  const P = innerHeight > innerWidth, s = SHELLS;
  skyShow(P ? [[0.8, 0.22, 0.3, s.pinkPeony], [1.4, 0.78, 0.27, s.goldChrys], [2.1, 0.5, 0.4, s.blueX], [2.7, 0.18, 0.42, s.heart], [3.5, 0.8, 0.4, s.willow], [4.3, 0.3, 0.26, s.ring],
    [5.1, 0.7, 0.3, s.violetChrys], [5.9, 0.5, 0.42, s.willow], [6.7, 0.2, 0.36, s.bluePeony], [7.5, 0.82, 0.34, s.goldChrys], [8.4, 0.42, 0.3, s.pinkPeony]]
    : [[0.8, 0.3, 0.39, s.pinkPeony], [1.4, 0.63, 0.39, s.goldChrys], [2.1, 0.5, 0.3, s.blueX], [2.7, 0.47, 0.42, s.heart], [3.5, 0.2, 0.41, s.willow], [4.2, 0.74, 0.34, s.ring],
      [5.0, 0.37, 0.42, s.violetChrys], [5.8, 0.9, 0.12, s.pinkPeony], [6.6, 0.56, 0.42, s.willow], [7.4, 0.27, 0.38, s.bluePeony], [8.3, 0.67, 0.4, s.goldChrys], [9.2, 0.43, 0.4, s.violetChrys]], ago);
}
// the ending: a few gentle bursts high in the sky, clear of the moon and the final words
function softFireworks(ago = 0) {
  const s = SHELLS; skyShow([[1.6, 0.62, 0.2, s.softWillow], [4.0, 0.34, 0.18, s.softPeony], [6.4, 0.52, 0.3, s.softRing], [8.8, 0.42, 0.15, s.softWillow], [11.0, 0.68, 0.27, s.softPeony], [13.2, 0.36, 0.22, s.softRing], [15.4, 0.6, 0.17, s.softWillow]], ago);
}

// ---------------------------------------------------------------- Snowki: beside her; alive, he goes to the man (a toddle, a magic glide, a toddle), is held,
// carries the gift back, then sits in her arms. Keys: [time, place, mode of the segment that starts there]; places: 'side' | 'lap' | 'held' | [x, y, gy]
function snowKeys() {
  const s = sc0, P = snPath;
  return [[0, 'side', 'side'],
    [s(3) + 2.6, 'side', 'fly'], [s(3) + 3.4, P(0), 'walk'], [s(3) + 4.6, P(0.03), 'glide'], [s(3) + 11.0, P(0.965), 'walk'], [s(3) + 12.4, P(1), 'stand'],   // to him
    [s(5) + 1.9, P(1), 'lift'], [s(5) + 2.8, 'held', 'held'],                                                                                           // in his arms
    [s(6) + 0.4, 'held', 'fly'], [s(6) + 1.0, P(1), 'walk'], [s(6) + 2.2, P(0.975), 'glide'], [s(6) + 6.6, P(0.025), 'walk'], [s(6) + 7.2, P(0), 'fly'], [s(6) + 8.0, 'side', 'side'],   // back to her
    [s(7) + 4.4, 'side', 'fly'], [s(7) + 5.2, 'lap', 'lap'], [1e9, 'lap', 'lap']];                                                                          // into her arms (the camera is on the launcher)
}
const lapAt = () => { const h = helenPlace(), p = helenW(12.8, -6.0); return [p[0], p[1], h.gy + 0.5]; };   // the back-view cradle seat (Helen.drawBack)
function heldAt() { const bp = boyPlace(), hp = boy.P && boy.P.holdPt ? boy.P.holdPt : [7, -57.4], w = local2world(bp, hp[0], hp[1]); return [w[0], w[1], bp.y + 1]; }
function snowAt(T) {
  const K = SNK || (SNK = snowKeys()); let i = 0; while (i < K.length - 2 && T >= K[i + 1][0]) i++;
  const a = K[i], b = K[i + 1], mode = a[2], P = k => (k[1] === 'side' ? sideAt() : k[1] === 'lap' ? lapAt() : k[1] === 'held' ? heldAt() : k[1]);
  const pa = P(a), u = clamp((T - a[0]) / (b[0] - a[0]), 0, 1);
  if (mode === 'lap' || mode === 'side' || mode === 'held' || mode === 'stand') return { x: pa[0], y: pa[1], gy: pa[2], mode, t0: a[0], dir: 1, ground: pa[1] };
  const pb = P(b), dir = Math.sign(pb[0] - pa[0]) || 1;
  if (mode === 'glide') {   // a magic glide a hand's breadth above the paving: eases in and out, floats with a little bob
    const e = ease.inOutSine(u), gy = lerp(pa[2], pb[2], e), up = smoothstep(0, 0.14, u) * (1 - smoothstep(0.86, 1, u)), y0 = lerp(pa[1], pb[1], e);
    return { x: lerp(pa[0], pb[0], e), y: y0 - up * (11 + Math.sin(T * 3.1) * 1.6) * us(gy), gy, mode, t0: a[0], dir, ground: y0, hover: up };
  }
  const e = mode === 'walk' ? u : ease.inOutSine(u), hop = mode === 'fly' ? Math.sin(u * Math.PI) * 34 : 0, y0 = lerp(pa[1], pb[1], e);
  return { x: lerp(pa[0], pb[0], e), y: y0 - hop, gy: mode === 'fly' ? Math.max(pa[2], pb[2]) : lerp(pa[2], pb[2], e), mode, t0: a[0], dir, ground: y0 };
}
let SNK = null;
function snAct(name, o, dur) { const t = S.evAt ?? S.T; S.sn = { name, o, t, until: t + dur }; }
const SN_DEFAULT = { lap: ['sit', {}], side: ['sit', {}], fly: ['fly', { expr: 'happy' }], glide: ['fly', { expr: 'happy' }], walk: ['walk', {}], stand: ['stand', {}], lift: ['sit', { expr: 'happy' }], held: ['sit', { expr: 'happy' }] };
function stepSnow(dt, warm) {
  const sp = snowAt(S.T), d = SN_DEFAULT[sp.mode], want = S.sn && S.sn.t >= sp.t0 && S.T < S.sn.until ? [S.sn.name, { ...S.sn.o }] : [d[0], { ...d[1] }];
  if (sp.mode === 'walk') want[1].dir = [sp.dir, 0];
  if (sp.mode === 'side' && !revNow() && !S.snFront) want[1].back = true;   // facing the sea with her
  if (S.say && S.say.who === 'snowki' && S.T < S.say.until && want[0] === 'sit') want[0] = 'talk';
  if (S.snGift && !want[1].hold && sp.mode !== 'fly' && sp.mode !== 'glide') want[1].hold = 'gift';
  if (S.say && S.say.who === 'snowki' && S.T < S.say.until) want[1].talk = true;
  const key = want[0] + JSON.stringify(want[1]) + sp.mode;
  if (key !== S.snKey) { S.snKey = key; snow.act(want[0], { stand: sp.mode === 'stand' || sp.mode === 'walk', ...want[1] }); }
  const sc = view.toScreen(sp.x, sp.y, sp.gy), prev = S.snPrev; S.snPrev = sc;
  const vel = prev && dt > 0 ? [(sc[0] - prev[0]) / Math.max(dt, 1e-3) * 0.5, (sc[1] - prev[1]) / Math.max(dt, 1e-3) * 0.5] : [0, 0];
  if (sp.mode === 'stand' || sp.mode === 'lift') snow.look(0.8, -0.7); else if (sp.mode === 'held') snow.look(0.45, -0.9); else if (sp.mode === 'lap' || sp.mode === 'side') snow.look(want[0] === 'alert' || want[0] === 'hug' ? 0.9 : 0.1, want[0] === 'alert' ? -0.1 : 0.05); else snow.look(sp.dir * 0.6, 0);
  const gt = S.T - S.snGlow, glow = gt > 0 && gt < 4 ? 0.75 * smoothstep(0, 0.6, gt) * (1 - smoothstep(2.6, 4, gt)) : 0;   // the recognition: a soft magic glow
  const flying = sp.mode === 'fly' || sp.mode === 'glide';
  snow.update(warm ? 1 / 60 : dt, { vel: flying ? vel : [0, 0], magic: sp.mode === 'lap' || sp.mode === 'side' ? glow : sp.mode === 'glide' ? 0.7 : 0.45 });
  // sparkles when he moves by magic (and when he recognises the man)
  const rate = sp.mode === 'fly' ? 3 : sp.mode === 'glide' ? 2 : sp.mode === 'walk' ? (Math.random() < 0.35 ? 1 : 0) : 0;
  S.snGlowK = glow;
  if (dt > 0) { const s = us(sp.gy); for (let i = 0; i < rate; i++) S.snTrail.push({ x: sp.x + rand(-8, 8) * s * 0.4, y: sp.y - rand(30, 75) * SN * s, gy: sp.gy, vx: rand(-6, 6) * s, vy: rand(-8, 4) * s, life: rand(0.6, 1.3), ml: 1.3, r: rand(0, 6) });
    if (glow > 0.05) for (let i = 0; i < 2; i++) if (Math.random() < glow) { const a = rand(0, 6.28), R = rand(40, 70) * SN * s;   // the recognition: motes of light rise around him
      S.snTrail.push({ x: sp.x + Math.cos(a) * R, y: sp.y - 50 * SN * s + Math.sin(a) * R * 0.8, gy: sp.gy, vx: -Math.cos(a) * 3 * s, vy: -rand(8, 18) * s, life: rand(0.9, 1.7), ml: 1.7, r: rand(0, 6), big: 1.7 }); } }
  for (const p of S.snTrail) { p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt; }
  S.snTrail = S.snTrail.filter(p => p.life > 0); if (S.snTrail.length > 160) S.snTrail.splice(0, S.snTrail.length - 160);
  S.snP = sp;
}
// ---------------------------------------------------------------- Jessi: sits beside Snowki; notices the man first (turns, ears up); hops down and walks after
// Snowki, sits near the man wagging; runs back with him and jumps up beside Helen. A pure function of the story time.
const JS = { x: PLACE.jessi.x, y: PLACE.jessi.seat, gy: PLACE.jessi.gy }, J1 = { x: 478, y: 676, gy: 676 }, JSIT = { x: MEET.x - 134, y: MEET.y + 16, gy: MEET.y + 16 };
// where she is on her line J1 -> JSIT when she keeps a dog's length behind (scene 3) or ahead of (scene 6) Snowki
function jessiTrail(T, lag, gap) { const xs = snowAt(T - lag).x, v = clamp((xs + gap - J1.x) / (JSIT.x - J1.x), 0, 1); return { x: lerp(J1.x, JSIT.x, v), y: lerp(J1.y, JSIT.y, v), gy: lerp(J1.gy, JSIT.gy, v) }; }
function jessiAt(T) {
  const s = sc0, at = (p, fl, act, o = {}) => ({ x: p.x, y: p.y, gy: p.gy, fl, act, ...o }), lin = (A, B, u) => ({ x: lerp(A.x, B.x, u), y: lerp(A.y, B.y, u), gy: lerp(A.gy, B.gy, u) });
  const hop = (A, B, u) => { const p = lin(A, B, ease.inOutSine(u)); p.y -= Math.sin(u * Math.PI) * 26; p.gy = Math.max(A.gy, B.gy); return p; };
  const gait = (p, q, fl, idle, o = {}) => { const v = Math.abs(q.x - p.x) / 0.05 / (us(p.gy) * 0.56); return { ...p, fl, act: v < 4 ? idle : v < 62 ? 'walk' : 'run', ...o }; };
  if (T < s(2) + 0.5) return at(JS, -1, 'sit');
  if (T < s(3) + 6.0) return at(JS, 1, 'alert', { sit: T < s(3) + 4.6, look: T < s(3) + 2.6 ? [0.7, -0.35] : [0.5, 0.2] });   // ears up, turned to the tree; then watches Snowki go
  if (T < s(3) + 6.6) return { ...hop(JS, J1, (T - s(3) - 6.0) / 0.6), fl: 1, act: 'run' };
  if (T < s(3) + 12.4) return gait(jessiTrail(T, 0.35, JSIT.x - SNM[0]), jessiTrail(T + 0.05, 0.35, JSIT.x - SNM[0]), 1, 'stand', { look: [0.5, -0.1] });   // after him, a dog's length behind
  if (T < s(3) + 12.9) return at(JSIT, 1, 'sit', { look: [0.6, -0.4] });
  if (T < s(6) + 1.2) return at(JSIT, 1, 'happy', { look: [0.5, -0.3 + 0.25 * Math.sin(T * 0.9)] });   // tail wagging, head tilting up at him
  if (T < s(6) + 1.6) return at(JSIT, -1, 'stand');
  if (T < s(6) + 6.9) return gait(jessiTrail(T, -0.5, JSIT.x - SNM[0]), jessiTrail(T + 0.05, -0.5, JSIT.x - SNM[0]), -1, 'stand');   // back to her, just ahead of Snowki
  if (T < s(6) + 7.5) return { ...hop(J1, JS, (T - s(6) - 6.9) / 0.6), fl: -1, act: 'run' };
  return at(JS, -1, S.jessi.lookUp ? 'lookUp' : S.jessi.happy ? 'happy' : 'sit', { look: S.jessi.lookUp ? [0, -0.6] : [-0.4, 0] });
}

// ---------------------------------------------------------------- text overlays: subtitles, speech bubbles, the birthday message, final lines
let subT = 0; const subEl = document.querySelector('#sub');
function setSub(t) { const el = $('#sub'); if (el.dataset.t === t) return; el.dataset.t = t; el.classList.remove('on'); clearTimeout(subT); if (t) subT = setTimeout(() => { el.textContent = t; el.classList.add('on'); }, 450); }
function say(key, t0 = S.T) { const d = (CFG.text.dialogue || {})[key]; if (!d || t0 + d.dur <= S.T) return; S.say = { who: d.who, until: t0 + d.dur }; const el = $('#say'); el.textContent = '';
  const w = document.createElement('span'); w.className = 'who'; w.textContent = d.who === 'snowki' ? 'Snowki' : 'The man'; const q = document.createElement('span'); q.className = 'q'; q.textContent = '“' + d.text + '”';
  el.append(w, q); el.dataset.who = d.who; el.classList.add('on'); }
function sayHide() { S.say = null; $('#say').classList.remove('on'); }
function placeSay() {
  if (!S.say) return; if (S.T > S.say.until) { sayHide(); return; }
  // dialogue is a cinematic subtitle at the bottom of the frame (laid out by CSS)
}
function showLine(i, instant) {
  const box = $('#lines'); if (box.querySelector('.l' + i)) return; const p = document.createElement('p'); p.className = 'l l' + i; p.innerHTML = fill(CFG.text.finalLines[i]).replace(/\n/g, '<br>');
  box.appendChild(p); requestAnimationFrame(() => requestAnimationFrame(() => p.classList.add('on')));
}
function showEnd() { if (S.ended) return; S.ended = true; $('#end').classList.add('on'); $('#cont').hidden = !EMBED; }

// ---------------------------------------------------------------- the memory: years ago, at the seaside at golden hour, he gives her little Snowki
// A real animated scene on the #mem canvas: he walks in holding the teddy, stops and offers it with both hands; she takes it
// with both hands, smiles and hugs it; he smiles at her. Its own camera (wide -> the hands -> her smile -> a two-shot), parallax
// layers (sky + sun, sea glitter, the beach, a palm, out-of-focus flowers), a warm grade, a vignette and a soft dissolve.
// Memory units: the sand under their feet is y = 0, the horizon y = -66 (behind their hands), x = 0 between them.
const mc = $('#mem'), mxc = mc.getContext('2d'), memHelen = new Helen(), memBoy = new Boy(), memSnow = new Snowki(); memSnow.act('sit', { expr: 'happy' });
const MEM = { hx: -25, bx: 14, kb: 0.95, sun: [-5, -70], walk: 3.3, offer: 3.3, give: [4.5, 5.1] };
const memCam = [[0, 6, -58, 150, 124, -64], [3.0, 6, -58, 148, 122, -64], [5.2, 2, -62, 92, 94, -68], [6.4, -4, -66, 84, 86, -70], [8.0, -6, -70, 76, 80, -72], [10, 4, -62, 112, 108, -66]];   // [t, x, y, landscape height | portrait width (units), portrait y]
let memSprite = null;
function memBokeh() {   // one soft disc sprite per colour, drawn at any size (no gradients per frame)
  const mk = (r, g, b) => { const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d'), gr = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, `rgba(${r},${g},${b},1)`); gr.addColorStop(0.55, `rgba(${r},${g},${b},.55)`); gr.addColorStop(1, `rgba(${r},${g},${b},0)`); x.fillStyle = gr; x.fillRect(0, 0, 64, 64); return c; };
  return { warm: mk(255, 236, 190), pink: mk(255, 130, 175), gold: mk(255, 200, 120) };
}
function drawMemory(dt) {
  const a = rv('mem'); subEl.classList.toggle('mem', a > 0.2);   // a darker shadow under the subtitle on the golden memory
  if (a < 0.003) { if (mc.style.display !== 'none') mc.style.display = 'none'; return; }
  mc.style.display = 'block';
  const W = innerWidth, H = innerHeight, portrait = H > W, pr = Math.min(devicePixelRatio || 1, q.name === 'high' ? 2 : q.name === 'medium' ? 1.5 : 1), x = mxc, tr = S.real;
  if (mc.width !== Math.round(W * pr) || mc.height !== Math.round(H * pr)) { mc.width = Math.round(W * pr); mc.height = Math.round(H * pr); }
  const SP = memSprite || (memSprite = memBokeh());
  const mt = S.T - sc0(4);   // memory time (story clock: seeking works)
  // ---- the camera inside the memory
  let i = 0; while (i < memCam.length - 2 && mt >= memCam[i + 1][0]) i++;
  const A = memCam[i], B = memCam[i + 1], u = ease.inOutSine(clamp((mt - A[0]) / (B[0] - A[0]), 0, 1)), cm = j => lerp(A[j], B[j], u);
  const k0 = portrait ? W / 124 : H / 150, k = (portrait ? W / cm(4) : H / cm(3)) * (1 + 0.05 * (1 - a)), cx = cm(1), cy = portrait ? cm(5) : cm(2);
  const L = p => { const kl = k0 * Math.pow(k / k0, p); return { k: kl, ox: W / 2 - cx * p * kl, oy: H / 2 - (cy * p + (-62) * (1 - p)) * kl }; };   // layer transform (p = parallax)
  const at = (l, X, Y) => [l.ox + X * l.k, l.oy + Y * l.k];
  x.setTransform(pr, 0, 0, pr, 0, 0); x.globalAlpha = 1; x.globalCompositeOperation = 'source-over'; x.clearRect(0, 0, W, H);
  // ---- sky, sun, clouds (far: p 0.15)
  const l0 = L(0.15), hz = at(l0, 0, -66)[1];
  let g = x.createLinearGradient(0, hz - 420 * l0.k / 2.4, 0, hz); g.addColorStop(0, '#C98A86'); g.addColorStop(0.45, '#F2B08A'); g.addColorStop(0.85, '#FFD9A2'); g.addColorStop(1, '#FFEBC0');
  x.fillStyle = g; x.fillRect(0, 0, W, hz + 2);
  const sn = at(l0, MEM.sun[0], MEM.sun[1]);
  g = x.createRadialGradient(sn[0], sn[1], 0, sn[0], sn[1], 95 * l0.k); g.addColorStop(0, 'rgba(255,246,214,.95)'); g.addColorStop(0.12, 'rgba(255,226,160,.7)'); g.addColorStop(0.5, 'rgba(255,190,120,.22)'); g.addColorStop(1, 'rgba(255,180,110,0)');
  x.fillStyle = g; x.fillRect(sn[0] - 95 * l0.k, sn[1] - 95 * l0.k, 190 * l0.k, 190 * l0.k);
  x.fillStyle = '#FFF8E4'; x.beginPath(); x.arc(sn[0], sn[1], 7.5 * l0.k, 0, 7); x.fill();
  for (let c = 0; c < 6; c++) { const cxp = ((c * 97 + tr * 1.5) % 420) - 210, cyp = -150 + (c % 3) * 22, p = at(l0, cxp, cyp);
    x.fillStyle = `rgba(255,${190 + c * 6},${150 + c * 5},${0.32 + (c % 2) * 0.12})`; x.beginPath(); x.ellipse(p[0], p[1], (46 + c * 9) * l0.k, (4 + c % 3) * l0.k, 0, 0, 7); x.fill(); }
  for (let b = 0; b < 3; b++) { const bxp = ((tr * 9 + b * 23) % 260) - 130, byp = -128 - b * 7 + Math.sin(tr * 0.7 + b) * 3, p = at(l0, bxp, byp), w = 2.6 * l0.k, fl = Math.sin(tr * 9 + b * 2) * 0.8;   // gulls
    x.strokeStyle = 'rgba(110,60,60,.55)'; x.lineWidth = Math.max(1, 0.5 * l0.k); x.beginPath(); x.moveTo(p[0] - w, p[1] - fl * w * 0.4); x.quadraticCurveTo(p[0] - w * 0.4, p[1] - w * 0.5, p[0], p[1]); x.quadraticCurveTo(p[0] + w * 0.4, p[1] - w * 0.5, p[0] + w, p[1] - fl * w * 0.4); x.stroke(); }
  // ---- the far headland and the sea with the sun's glitter (p 0.4)
  const l1 = L(0.4), h1 = at(l1, 0, -66)[1], sh = at(l1, 0, -40)[1];
  x.fillStyle = 'rgba(176,110,112,.55)'; x.beginPath(); { const P = [[-420, -66], [-330, -76], [-250, -84], [-190, -79], [-140, -70], [-110, -66]]; P.forEach((q, j) => { const s = at(l1, q[0], q[1]); j ? x.lineTo(s[0], s[1]) : x.moveTo(s[0], s[1]); }); } x.fill();
  g = x.createLinearGradient(0, h1, 0, sh); g.addColorStop(0, '#F6C79A'); g.addColorStop(0.4, '#E9A582'); g.addColorStop(1, '#C98774'); x.fillStyle = g; x.fillRect(0, h1, W, sh - h1 + 1);
  const ssx = at(l1, MEM.sun[0], 0)[0];
  for (let r = 0; r < 34; r++) { const v = r / 33, y = lerp(h1 + 1, sh - 2, v * v), w = (6 + v * 46) * l1.k * (0.5 + 0.5 * noise2(r * 1.7, tr * 1.3)), fl = 0.35 + 0.65 * Math.max(0, noise2(r * 3.1, tr * 2.4 + r));
    x.fillStyle = `rgba(255,244,210,${0.75 * fl * (1 - v * 0.5)})`; x.fillRect(ssx - w / 2 + noise2(r, tr * 0.8) * 8 * l1.k, y, w, Math.max(1, (0.5 + v * 1.4) * l1.k * 0.5)); }
  x.strokeStyle = 'rgba(255,230,200,.25)'; x.lineWidth = Math.max(1, 0.4 * l1.k);
  for (let w = 0; w < 5; w++) { const yy = lerp(h1, sh, (w + 0.5 + ((tr * 0.08) % 1)) / 6); x.beginPath(); x.moveTo(0, yy); for (let xx = 0; xx <= W; xx += 40) x.lineTo(xx, yy + Math.sin(xx * 0.02 + tr + w) * 1.5); x.stroke(); }
  // ---- the beach: foam, wet sand, dry sand (p 0.7) and a leaning palm, backlit
  const l2 = L(0.7), fy = at(l2, 0, -40)[1];
  g = x.createLinearGradient(0, fy, 0, H); g.addColorStop(0, '#E9B58C'); g.addColorStop(0.08, '#F0C496'); g.addColorStop(0.5, '#D9A174'); g.addColorStop(1, '#B57A58'); x.fillStyle = g; x.fillRect(0, fy, W, H - fy);
  x.fillStyle = 'rgba(255,236,206,.55)'; x.beginPath(); x.moveTo(0, fy); for (let xx = 0; xx <= W + 20; xx += 20) x.lineTo(xx, fy + (2 + Math.sin(xx * 0.013 + tr * 0.9) * 1.6) * l2.k * 0.6); x.lineTo(W, fy - 2); x.lineTo(0, fy - 2); x.fill();
  { const b = at(l2, -128, -20), t2 = at(l2, -100, -175); x.strokeStyle = '#6A4244'; x.lineWidth = 5 * l2.k; x.lineCap = 'round'; x.beginPath(); x.moveTo(b[0], b[1]); x.quadraticCurveTo(b[0] + 4 * l2.k, (b[1] + t2[1]) / 2, t2[0], t2[1]); x.stroke();
    x.fillStyle = '#6A4244'; for (let f = 0; f < 7; f++) { const an = -2.9 + f * 0.48 + Math.sin(tr * 0.6 + f) * 0.04, len = (42 + (f % 3) * 8) * l2.k; x.save(); x.translate(t2[0], t2[1]); x.rotate(an);
      x.beginPath(); x.moveTo(0, 0); x.quadraticCurveTo(len * 0.5, -len * 0.16, len, len * 0.22); x.quadraticCurveTo(len * 0.5, len * 0.02, 0, 0); x.fill(); x.restore(); } }
  // ---- the two of them, younger (p 1): he walks in, offers the teddy, she takes it and hugs it; he smiles at her
  const lc = L(1), ground = at(lc, 0, 0), walking = mt < MEM.walk, bxw = MEM.bx + Math.max(0, MEM.walk - mt) * 26 * MEM.kb;
  const giving = mt >= MEM.give[0] && mt < MEM.give[1], hers = mt >= MEM.give[1], hug = mt >= 6.6;
  const hPose = mt < 3.5 ? null : hug ? 'standHug' : 'standReceive', hExpr = mt < 2.6 ? 'calm' : mt < 3.6 ? 'surprised' : mt < 4.9 ? 'smile' : mt < 7.4 ? 'joyful' : 'smile';
  const bPose = walking ? 'walkHold' : mt < MEM.give[1] + 0.3 ? 'offer' : 'stand', bExpr = mt < 3.6 ? 'contentment' : 'smile';
  let pH = null, pB = null; const rec = w => (ctx, p) => { if (w === 'h') pH = p; else pB = p; };
  const snowDraw = (ctx, p) => { ctx.save(); ctx.translate(p[0], p[1]); ctx.scale(SN * 0.72, SN * 0.72); memSnow.draw(ctx, { aura: false, sparkle: false }); ctx.restore(); };
  const hst = { t: tr, dt, wind: 10, expr: hExpr, stand: true, pose: hPose, held: hers ? snowDraw : giving ? rec('h') : null, turn: 0.35, gaze: mt < 4.6 ? 0.75 : 0.25, armT: hPose ? null : [[0.6, -9.6], [2.6, -9.9]] };
  const bst = { t: tr, dt, wind: 8, pose: bPose, speed: walking ? 26 : 0, expr: bExpr, held: hers ? null : giving ? rec('b') : snowDraw, lookDown: walking ? 0.25 : 0.45, look: 0.2 };
  memHelen.update(hst); memBoy.update(bst); memSnow.update(dt, { magic: 0 });
  x.lineJoin = x.lineCap = 'round';
  x.save(); x.translate(at(lc, MEM.hx, 0)[0], ground[1] - Helen.STAND_GROUND * lc.k); x.scale(lc.k, lc.k); memHelen.draw(x, hst); x.restore();
  x.save(); x.translate(at(lc, bxw, 0)[0], ground[1]); x.scale(-lc.k * MEM.kb, lc.k * MEM.kb); memBoy.draw(x, bst); x.restore();
  if (giving) {   // the teddy passing from his hands into hers (his hands lower it into her cupped palms)
    const hp = memBoy.P && memBoy.P.holdPt ? memBoy.P.holdPt : [16.4, -63.8], from = [bxw - hp[0] * MEM.kb, hp[1] * MEM.kb], to = [MEM.hx + 10.6, -Helen.STAND_GROUND - 16.5];
    const v = ease.inOutSine((mt - MEM.give[0]) / (MEM.give[1] - MEM.give[0])), p = at(lc, lerp(from[0], to[0], v), lerp(from[1], to[1], v) - Math.sin(v * Math.PI) * 1.5);
    x.save(); x.translate(p[0], p[1]); x.scale(lc.k, lc.k); snowDraw(x, [0, 0]); x.restore();
  }
  // ---- the backlight: the low sun haloes them; out-of-focus flowers and floating motes in front (p 1.35)
  x.globalCompositeOperation = 'screen';
  g = x.createRadialGradient(sn[0], sn[1], 0, sn[0], sn[1], Math.max(W, H) * 0.55); g.addColorStop(0, 'rgba(255,214,150,.55)'); g.addColorStop(0.35, 'rgba(255,190,120,.18)'); g.addColorStop(1, 'rgba(255,170,100,0)');
  x.fillStyle = g; x.fillRect(0, 0, W, H);
  const l3 = L(1.35);
  for (let b = 0; b < 16; b++) { const bxp = ((b * 61.7) % 300) - 150 + Math.sin(tr * 0.3 + b) * 6, byp = -30 - ((b * 37.3 + tr * 4) % 150), p = at(l3, bxp, byp), r = (3 + (b * 7) % 9) * l3.k * 0.8, tw = 0.45 + 0.35 * Math.sin(tr * 0.9 + b * 1.3);
    x.globalAlpha = tw * 0.55; x.drawImage(b % 3 ? SP.warm : SP.gold, p[0] - r, p[1] - r, r * 2, r * 2); }
  x.globalCompositeOperation = 'source-over';
  for (let b = 0; b < 9; b++) { const side = b < 5 ? -1 : 1, bxp = side * (95 + (b * 23) % 50), byp = 18 + (b * 13) % 30, p = at(l3, bxp, byp), r = (9 + (b * 5) % 8) * l3.k;
    x.globalAlpha = 0.5; x.drawImage(b % 2 ? SP.pink : SP.gold, p[0] - r, p[1] - r, r * 2, r * 2); }
  x.globalAlpha = 1;
  // ---- the grade: warm, soft, golden edges of a memory; a bright bloom at the dissolve
  x.globalCompositeOperation = 'soft-light'; x.fillStyle = 'rgba(255,170,90,.45)'; x.fillRect(0, 0, W, H); x.globalCompositeOperation = 'source-over';
  g = x.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.max(W, H) * 0.75); g.addColorStop(0, 'rgba(120,60,40,0)'); g.addColorStop(1, 'rgba(110,52,38,.55)'); x.fillStyle = g; x.fillRect(0, 0, W, H);
  const bloom = Math.sin(clamp(a, 0, 1) * Math.PI) * 0.35; if (bloom > 0.01) { x.fillStyle = `rgba(255,236,200,${bloom})`; x.fillRect(0, 0, W, H); }
  // the film's letterbox stays on over the memory
  const lb = (portrait ? 0.035 : 0.085) * H; x.fillStyle = '#000'; x.fillRect(0, 0, W, lb); x.fillRect(0, H - lb, W, lb);
  // the dissolve: the memory's own alpha (CSS opacity keeps the canvas work independent of the fade)
  mc.style.opacity = a.toFixed(3);
}

// ---------------------------------------------------------------- per-actor canvases (drawn at screen resolution) -> textured quads
class ActorView {
  constructor(id, rig) { this.id = id; this.rig = rig; this.c = document.createElement('canvas'); this.x = this.c.getContext('2d'); }
  render(F, place, st, opt = {}) {
    const v = F.view, gy = place.gy, s = us(gy) * (opt.scale || 1), k = v.scaleAt(gy), fl = place.fl != null ? place.fl : place.flip ? -1 : 1, r = place.rot || 0, b = this.rig.bounds;
    const anc = v.toScreen(place.x, place.y, gy), m = k * s, cs = Math.cos(r), sn = Math.sin(r);
    const tf = (lx, ly) => [anc[0] + m * fl * (lx * cs - ly * sn), anc[1] + m * (lx * sn + ly * cs)];
    const cr = [tf(b[0], b[1]), tf(b[2], b[1]), tf(b[0], b[3]), tf(b[2], b[3])];
    let x0 = Math.min(...cr.map(p => p[0])), x1 = Math.max(...cr.map(p => p[0])), y0 = Math.min(...cr.map(p => p[1])), y1 = Math.max(...cr.map(p => p[1]));
    const full = [x0, y0, x1, y1];
    x0 = Math.max(x0, -40); y0 = Math.max(y0, -40); x1 = Math.min(x1, F.W + 40); y1 = Math.min(y1, F.H + 40);
    if (x1 - x0 < 2 || y1 - y0 < 2) return null;
    let pr = F.pr; const maxS = 2048; pr = Math.min(pr, maxS / (x1 - x0), maxS / (y1 - y0));
    const w = Math.ceil((x1 - x0) * pr), h = Math.ceil((y1 - y0) * pr);
    // opt.reuse: keep last frame's drawing when the canvas size is unchanged (far extras update at half rate; the quad still moves every frame)
    const fresh = !(opt.reuse && this.c.width === w && this.c.height === h);
    if (fresh) {
      if (this.c.width !== w || this.c.height !== h) { this.c.width = w; this.c.height = h; } else this.x.clearRect(0, 0, w, h);
      const p2 = m * pr; this.x.setTransform(p2 * fl * cs, p2 * sn, -p2 * fl * sn, p2 * cs, (anc[0] - x0) * pr, (anc[1] - y0) * pr);
      this.x.lineJoin = this.x.lineCap = 'round';
      this.rig.draw(this.x, st);
    }
    const corners = [[x0, y0], [x1, y0], [x0, y1], [x1, y1]];
    // the long evening shadow: the silhouette sheared along the ground away from the light
    const ground = opt.groundY != null ? v.toScreen(place.x, opt.groundY, gy)[1] : anc[1], dir = opt.shadowDir || [0.5, 0.4], L = opt.shadowLen || 1;
    const sh = corners.map(([cx, cy]) => { const hgt = Math.max(0, ground - cy); return [cx + dir[0] * hgt * L, ground + dir[1] * hgt * L * 0.55]; });
    return { type: 'char', id: this.id, canvas: this.c, fresh, corners, gy, pr, anc, full, shadow: opt.shadowA ? { corners: sh, color: opt.shadowC || [0.32, 0.18, 0.42], alpha: opt.shadowA, blur: 6 * pr } : null };
  }
}
const views = { helen: new ActorView('helen', helen), jessi: new ActorView('jessi', jessi), boy: new ActorView('boy', boy), snow: new ActorView('snow', snowRig),
  grip: new ActorView('grip', { bounds: boy.bounds, draw: ctx => boy.drawGrip && boy.drawGrip(ctx) }) };
const crowd = new Crowd({ density: q.name === 'low' ? 0.6 : 1, reunionStart: TL.scenes[8].start + 0.8,
  avoid: [{ X: 16, Z: 23, r: 8, t0: TL.scenes[1].start, t1: TL.scenes[2].start + 3 }, { X: 17, Z: 24, r: 7, t0: TL.scenes[4].start, t1: TL.scenes[5].start + 2.5 }, { X: -3.5, Z: 34, r: 10, t0: TL.scenes[6].start, t1: TL.scenes[7].start }, { X: 3, Z: 47, r: 15, t0: TL.scenes[6].start + 2, t1: TL.scenes[6].start + 7.5 }] }), crowdViews = {};   // background people on the promenade

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
  S.noEv = true; for (let i = 0; i < 40; i++) step(1 / 60, true); S.noEv = false;   // (no story events while settling: they would fire early)
  S.T = T0; S.simT = sim0; S.fired = fired0; S.jfl = null; syncClip(true);
}
function skip() { if (S.phase === 'wish') { blow(); return; } const sc = TL.at(S.T), i = TL.scenes.indexOf(sc); if (i < TL.scenes.length - 1) seek(TL.scenes[i + 1].start + 0.01); }

// ---------------------------------------------------------------- update
const prevCam = { x: 800, y: 500, z: 1 }; let motion = [0, 0];
function step(dtReal, warm) {
  if (S.phase === 'wish') { S.simT += dtReal; wind.update(S.simT); return; }
  // master time + bullet-time
  if (!S.noEv) S.T = Math.min(S.T + dtReal, TL.duration + 600);   // (while a seek settles hair and springs, the story clock stands still)
  S.timeScale = timeScaleAt(S.bt, S.T); const dt = dtReal * S.timeScale; S.simT += dt;
  stepRamps(dtReal); wind.update(S.simT);
  const sc = TL.at(Math.min(S.T, TL.duration - 0.001)); S.scene = sc; S.lt = S.T - sc.start;
  if (!S.noEv) for (const ev of sc.ev || []) { const key = sc.n + ':' + ev[0] + ev[1] + (ev[2] ?? ''); if (S.lt >= ev[0] && !S.fired.has(key)) { S.fired.add(key); S.evAt = sc.start + ev[0]; fire(ev, warm); S.evAt = null; } }
  const sub = (sc.sub || []).find(s => S.lt >= s[0] && S.lt < s[0] + s[2]); if (!warm) setSub(sub ? sub[1] : '');
  // rigs
  const hw = wind.at(HS.x), bp = boyPlace(), bw = wind.at(bp.x);
  helen.update(helenSt(dt, hw.s * 90));
  boy.update(boySt(bp, dt, bw.s * 90 * (bp.flip ? -1 : 1)));
  stepSnow(dt, warm);
  { const jp = jessiAt(S.T), jq = jessiAt(S.T + 0.05), k = us(jp.gy) * 0.56;   // her paws are planted at her real ground speed
    S.jfl = warm || S.jfl == null ? jp.fl : S.jfl + clamp(jp.fl - S.jfl, -dtReal * 7, dtReal * 7);   // she turns round (a quick squash through side-on)
    S.jP = jp; jessi.update({ t: S.simT, dt, act: jp.act, sit: jp.sit, look: jp.look, vx: Math.abs(jq.x - jp.x) / 0.05 / k }); }
  // particles
  fw.update(dt, S.simT, wind.at(800).s);
  amb.update(dt, S.simT, wind);
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
// Helen's rig state: back view except the reverse-angle shots; the slow turn toward him and the smile come from ramps
function helenSt(dt, wind) {
  const sp = S.snP || snowAt(S.T), back = !revNow(), hp = helenPlace();
  return { t: S.simT, dt, wind, ...S.helen, back, stand: hp.stand, walking: hp.walking, walkPhase: hp.walkPhase, pose: hp.stand ? 'standHug' : undefined,
    headTurn: rv('hTurn'), bodyTurn: rv('hBody'), smile: S.ramps.hSm ? rv('hSm') : undefined, cradle: sp.mode === 'lap' ? cradleDraw : null };
}
// Snowki in her arms (her rig calls this with his seat p in her units; o.s scales him a little smaller so he sits in her lap). He faces us.
const cradleDraw = (ctx, p, o = {}) => { ctx.save(); ctx.translate(p[0], p[1]); const k = SN * (o.s || 0.72); ctx.scale(k, k); snow.draw(ctx, { aura: false, sparkle: false }); ctx.restore(); };
// the man: hiding behind the trunk (one hand on it), peeking; stepping out with the little gift; kneeling, reaching, holding Snowki, talking
function boyPose() { return boyPlace().pose; }
function boyReach(bp) {
  const s = us(bp.y), fl = bp.flip ? -1 : 1, r = bp.rot || 0, toL = (wx, wy) => { const lx = (wx - bp.x) / (s * fl), ly = (wy - bp.y) / s; return [lx * Math.cos(-r) - ly * Math.sin(-r), lx * Math.sin(-r) + ly * Math.cos(-r)]; };
  if (S.boy.lighting && LY.crate) { const f = LY.crate.fuse; return toL(f[0] - 4, f[1] - 2); }
  if (S.boy.reach) { const sp = snowAt(S.T); return toL(sp.x + 4 * SN * us(sp.gy), sp.y - (sp.mode === 'lift' ? 30 : 88) * SN * us(sp.gy)); }
  if ((bp.pose === 'hide' || bp.pose === 'peek') && bp.grip) return toL(PLACE.tree.hand[0], PLACE.tree.hand[1]);   // his hand on the trunk's edge
  return null;
}
const heldDraw = (ctx, p) => { ctx.save(); ctx.translate(p[0], p[1]); ctx.scale(SN, SN); ctx.filter = 'brightness(1.28) saturate(1.05)'; snow.draw(ctx, { aura: false, sparkle: false }); ctx.restore(); };
function boySt(bp, dt, wind) {
  const B = S.boy, sp = S.snP || snowAt(S.T);
  return { t: S.simT, dt, wind, pose: bp.pose, speed: bp.speed || 0, armsFree: !!bp.free, reach: boyReach(bp), expr: B.expr, kneel: B.kneel, hold: B.hold, signal: B.signal, lookDown: B.lookDown, gift: B.gift, flame: B.flame,
    talk: !!(S.say && S.say.who === 'man' && S.T < S.say.until), held: sp.mode === 'held' ? heldDraw : null, look: B.look, gazeY: B.lookDown * 0.8 - B.gazeUp * 0.9 };
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
    sea: { night, gustX: wind.front().x, gustA: wind.front().a * 0.8, waveA: 1.25, reflK: 0.65 + 0.6 * rv('refl'), rip: new Float32Array(32) } };
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
    { const nl = fw.nearLight; if (nl.k > 0.03) { const s = view.toScreen(nl.x, nl.y, nl.gy); pls.push([s[0], s[1], nl.rad * us(nl.gy) * view.scaleAt(nl.gy), Math.min(nl.k, 2.2), nl.r, nl.g, nl.b]); } }   // the stick's flame, the burning fuse, the muzzle flash
    if (snK > 0.1 && !extra.self) pls.push([snS[0], snS[1], 70 * view.scaleAt(sp.gy), 0.9 * snK, 1, 0.84, 0.55]);
    for (const n of near) if (pls.length < 4) pls.push(n.slice(0, 7));
    const a = mix3(ambL, [1, 0.9, 0.8], clamp(fwl.k * 0.25, 0, 0.3));
    return { amb: extra.amb || a, keyC: extra.keyC || keyC, keyDir: extra.keyDir || [kd[0] / kl, kd[1] / kl], rim: extra.rim ?? 1.0, pls };
  };
  const shadowDir = [0.35, 0.5], shA = 0.14;
  const blurOf = gy => Math.min(F.aper * Math.abs(gy - F.focus), F.maxBlur) * q.pr;
  const draw = [{ type: 'layer', layer: LY.ground, y: 0 }, { type: 'layer', layer: LY.wall, y: 1 }];
  if (LY.fuse && S.phase !== 'wish' && S.scene && S.scene.n >= FUSE_SCENE) draw.push({ type: 'layer', layer: LY.fuse, y: 0.5 });   // the fuse cord: laid out only once he goes to light it
  const push = (it, y) => { if (it) { it.y = y; draw.push(it); } };
  const tight = smoothstep(2.6, 4.2, view.cam.z * fOf(HS.gy));
  const boyTight = smoothstep(1.9, 2.4, view.cam.z) * (S.scene && [2, 3, 4, 5, 6].includes(S.scene.n) ? 1 : 0);
  for (const n of ['lamp60', 'lamp560', 'jar', 'cake', 'gifts', 'balloons', 'tea', 'wires', 'crate', 'tree', 'fg']) { const L = LY[n]; if ((n === 'planter' || n === 'lamp60' || n === 'fg') && tight > 0.98) continue; if (n === 'lamp60' && view.cam.y < 330) continue; if (n === 'fg' && boyTight > 0.5) continue; push({ type: 'layer', layer: L, wind: (wind.at((L.rect[0] + L.rect[2]) / 2).s - 0.45) * 0.6, sway: 1 + wind.at((L.rect[0] + L.rect[2]) / 2).g * 1.5 }, L.gy); }
  if (S.phase !== 'wish') {
    // Helen (Snowki in her arms is drawn by her rig through st.cradle), Jessi, Snowki on his own, the man
    const hp = helenPlace(), hst = { ...helenSt(0, wind.at(hp.x).s * 90), eyeLights: eyeLights() };
    const hi = views.helen.render(F, { x: hp.x, y: hp.y, gy: hp.gy }, hst, { groundY: (hp.stand ? hp.gy : baseY(hp.x)) + 2, shadowA: shA * 0.8, shadowDir: [shadowDir[0] * 0.5, 0.9], shadowLen: 0.5 });
    if (hi) { hi.light = charLight(hi.anc); hi.blur = blurOf(hp.gy); push(hi, hp.gy); }
    { const jp = S.jP || jessiAt(S.T), fl = Math.sign(S.jfl ?? jp.fl) * Math.max(Math.abs(S.jfl ?? jp.fl), 0.12);
      const ji = views.jessi.render(F, { x: jp.x, y: jp.y, gy: jp.gy, fl }, null, { shadowA: shA, shadowDir, shadowLen: 0.3 });
      if (ji) { ji.light = charLight(ji.anc); ji.blur = blurOf(jp.gy); push(ji, jp.gy); } }
    // Snowki when he is not in her arms and not in the man's: beside her, hopping, walking, gliding, standing on the promenade
    if (sp.mode !== 'lap' && sp.mode !== 'held') {
      const si = views.snow.render(F, { x: sp.x, y: sp.y, gy: sp.gy }, {}, { scale: SN, groundY: sp.ground, shadowA: sp.mode === 'fly' || sp.mode === 'side' ? 0 : shA * 1.4 * (1 - 0.6 * (sp.hover || 0)), shadowDir, shadowLen: 0.3 });
      if (si) { si.light = charLight(si.anc, { self: true, amb: mix3(ambL, [1, 0.94, 0.86], 0.55 * snK), rim: 1.3 }); si.blur = blurOf(sp.gy) * 0.5; push(si, sp.gy); }
    }
    // the man: behind the bougainvillea tree (his gripping hand drawn again in front of the trunk), then on the promenade
    { const bp = boyPlace(), bst = { ...boySt(bp, 0, wind.at(bp.x).s * 90 * (bp.flip ? -1 : 1)), t: S.simT, eyeLights: S.scene && S.scene.n >= 7 ? eyeLights(0.7) : null };
      const place = { x: bp.x, y: bp.y, gy: bp.y, flip: bp.flip, rot: bp.rot };
      const bi = views.boy.render(F, place, bst, { shadowA: shA * 1.1, shadowDir: [Math.abs(shadowDir[0]) + 0.3, 0.4], shadowLen: 1.2 });
      if (bi) { const extra = {}; if (S.boy.flame && LY.crate) { const f = LY.crate.fuse; extra.flame = view.toScreen(f[0] - 6, f[1] - 4, PLACE.launcher.y); }
        bi.light = charLight(bi.anc, extra); bi.blur = blurOf(bp.y); push(bi, bp.y);
        if (bp.grip && boy.P && boy.P.grip) { const gi = views.grip.render(F, place, bst); if (gi) { gi.light = bi.light; gi.blur = bi.blur; push(gi, PLACE.tree.y + 0.4); } } } }
  }
  // background people: drawn like the cast (lit quads, moon rim, lamp light), sorted by depth
  if (S.phase !== 'wish' && !window.__noCrowd) for (const p of crowd.at(S.T)) {
    const cv = crowdViews[p.slot] || (crowdViews[p.slot] = new ActorView(p.slot, p.rig));
    const ci = cv.render(F, p, null, { shadowA: shA * 0.8, shadowDir, shadowLen: 0.35, reuse: (frameN + p.slot.charCodeAt(p.slot.length - 1)) % 2 === 1 });
    if (ci) { ci.light = charLight(ci.anc, { rim: 0.9, amb: ambL.map(v => v * 0.85) }); ci.blur = blurOf(p.gy); ci.alpha = p.alpha; push(ci, p.gy); }
    for (const l of p.lights) lists.add.push(l[0], l[1], l[2], 0, l[3], l[3], 0, 0, l[4], l[5], l[6], l[7] * p.alpha);
  }
  worldFx(LY, lists, atlas, S.simT, S.phase === 'wish' ? 0 : S.T, emK);   // candle smoke on the cake, twinkling garland + tree lights
  // sprites
  const lightT = [...ambL.map(v => Math.min(1, v * 1.05)), 0.9 * (1 - night * 0.5)];
  fw.cordOn = S.phase !== 'wish' && !!S.scene && S.scene.n >= FUSE_SCENE; fw.draw(lists.emis, S.simT); F.sea.fw = fw.seaLights(view);
  draw.push({ type: 'sprites', list: fw.nearA, add: false, y: fw.nearY }, { type: 'sprites', list: fw.nearL, add: true, y: fw.nearY + 0.01 }, { type: 'sprites', list: fw.frontA, add: false, y: fw.frontY }, { type: 'sprites', list: fw.frontL, add: true, y: fw.frontY + 0.01 });   // fuse, flame, launch, climbing shell at the launcher's depth
  if (emK > 0.05) { const lh = [128, HZ - 34], k = 0.6 + 0.4 * Math.max(0, Math.sin(S.real * 2.2)); lists.emis.push(lh[0], lh[1], HZ + 0.5, 0, 6, 6, 0, 0, 1, 0.95, 0.75, emK * k); lists.emis.push(lh[0], lh[1], HZ + 0.5, 0, 24, 24, 0, 0, 1, 0.85, 0.6, emK * k * 0.4); }
  if (tod < 1.25) amb.drawWalkers(lists.mid, atlas, S.simT, ambL.map(v => v * (1 - night * 0.6)), 1 - smoothstep(0.95, 1.25, tod));
  if (S.phase !== 'wish' && snK > 0.03) { const s = us(sp.gy), c = [sp.x, sp.y - 55 * SN * s]; lists.add.push(c[0], c[1], sp.gy + 2, 0, 60 * SN * s, 60 * SN * s, 0, 0, 1, 0.84, 0.55, 0.32 * snK * (1 + 1.2 * (S.snGlowK || 0))); lists.add.push(c[0], c[1], sp.gy + 2, 0, 150 * SN * s, 150 * SN * s, 0, 0, 1, 0.7, 0.45, 0.12 * snK * (1 + 2 * (S.snGlowK || 0))); }
  for (const p of S.snTrail) { const s = us(p.gy), a = clamp(p.life / p.ml, 0, 1), tw = 0.6 + 0.4 * Math.sin(S.real * 9 + p.r * 3); lists.add.push(p.x, p.y, p.gy + 2, p.r + S.real, 4.2 * s * (0.4 + a) * (p.big || 1), 4.2 * s * (0.4 + a) * (p.big || 1), 0, 0, 1, 0.9, 0.62, a * 0.9 * tw, atlas.uv.glint); }
  const bulbK = 0.45 + emK * 0.9;
  bulbs.forEach(([x, y, k], i) => { const c = [[1, 0.84, 0.5], [1, 0.66, 0.8], [0.78, 0.9, 1]][k], fl = 0.82 + 0.18 * Math.sin(S.real * 3 + i * 1.7), s = unitScale(721); lists.lights.push(x, y, 721, 0, 1.4 * s, 1.4 * s, 0, 0, 1, 0.98, 0.9, fl * bulbK); lists.lights.push(x, y, 721, 0, 9 * s, 9 * s, 0, 0, c[0], c[1], c[2], 0.32 * fl * bulbK); });
  if (S.phase !== 'wish') { const st = LY.tea.steam; for (let i = 0; i < 3; i++) { const ph = (S.simT * 0.4 + i / 3) % 1, s = unitScale(LY.tea.gy); lists.mid.push(st[0] + Math.sin(ph * 6 + i) * 2 * s, st[1] - ph * 26 * s, LY.tea.gy, ph, (3 + ph * 6) * s, (3 + ph * 6) * s, 0, 0, 1, 1, 1, (1 - ph) * 0.35, atlas.uv.smoke); } }
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
  if (S.phase !== 'wish' && revNow()) { F.post.bloomK *= 0.55; F.post.thresh = Math.max(F.post.thresh, 0.8); F.moon = [F.moon[0], F.moon[1], F.moon[2] * 0.4]; }   // her close-ups: the moon's glitter path behind her must not bloom into a white blur
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
let last = performance.now(), paused = false, perf = { n: 0, sum: 0, done: false }, frameN = 0;
function loop(now) {
  requestAnimationFrame(loop);
  if (paused) { last = now; return; }
  const dtReal = Math.min((now - last) / 1000, 1 / 20); last = now; S.real += dtReal;
  if (S.phase === 'film' && !perf.done && S.T > 1.2) { perf.n++; perf.sum += dtReal; if (perf.n >= 90) { perf.done = true; const avg = perf.sum / perf.n; if (avg > 0.026 && q.name !== 'low') { const nt = q.name === 'high' ? 'medium' : 'low'; Object.assign(q, { name: nt, pr: TIERS[nt].pr, postDiv: TIERS[nt].postDiv, rays: TIERS[nt].rays, flare: TIERS[nt].flare }); if (GL) R.q.postDiv = q.postDiv, R.w = 0; console.info('film quality ->', nt, (avg * 1000).toFixed(1) + 'ms'); } } }
  step(dtReal); syncClip(false); frameN++;
  if (!(rv('mem') > 0.995)) { try { R.render(frame()); } catch (e) { console.error(e); } }   // (the memory covers the whole screen: no need to render the night under it)
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
window.__film = { seek: T => seek(T), skip, blow, state: S, q, gl: GL, timeline: TL, pause: p => (paused = p), layers, R, view, clips: CLIPS, boy: () => boyPlace(), anchor, jessiAt, snowAt, PLACE, get fw() { return fw; }, msgBox: () => S.msgBox };

// ---------------------------------------------------------------- start (after the fonts the sky message is made of)
initSystems();
(document.fonts ? Promise.race([document.fonts.load('700 100px "Cinzel"'), new Promise(r => setTimeout(r, 2500))]) : Promise.resolve()).then(() => {
  placeMessage(); $('#veil').classList.add('off');
  if (qs.has('t')) seek(parseFloat(qs.get('t')));
  requestAnimationFrame(loop);
});

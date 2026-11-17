// The master timeline: one clock drives scenes, camera, subtitles, time of day, bullet-time, events and audio cues.
// Scene 0 (the wish) waits for her; scenes 1..8 run on the master time T (seconds since the candle went out).
import { clamp, lerp, ease, smoothstep } from './core.js';
import { fOf } from './space.js';

// camera key helpers: k(t, target, opts) – targets are anchor names resolved live (so shots follow the rigs)
const K = (t, at, o = {}) => ({ t, at, ...o });

export function buildTimeline(cfg) {
  const d = cfg.timings, scenes = [];
  const sub = n => cfg.text.subtitles[n] || '';
  // ---- 1  After the cake: Helen on the sea wall, Snowki in her lap, Jessi beside her; wide shot, then a slow push to her side
  scenes.push({ n: 1, dur: d[1], tod: [1.72, 1.74], sub: [[0.8, sub(1), 6]],
    cam: [K(0, 'wide', { z: 1.0, e: 'inOutSine' }), K(d[1], 'helenSide', { z: 1.95, lens: 0.9 })], focus: 'helen', aper: 2 });
  // ---- 2  Snowki notices someone behind the tree; his eyes, then a rack focus to the tree
  scenes.push({ n: 2, dur: d[2], tod: [1.74, 1.75], sub: [],
    cam: [K(0, 'snowki', { z: 4.0, lens: 0.95, e: 'inOutSine' }), K(4.2, 'snowki', { z: 4.3, lens: 0.95, e: 'inOutSine' }), K(d[2], 'treeMan', { z: 2.6, lens: 0.85 })],
    focus: [[0, 'snowki'], [4.6, 'snowki'], [6.2, 'boy']], aper: 3, ev: [[0.8, 'snAlert'], [2.6, 'snAlive']] });
  // ---- 3  Snowki slips off her lap and toddles to the tree; low tracking shot; the man looks down and smiles
  scenes.push({ n: 3, dur: d[3], tod: [1.75, 1.76], sub: [],
    cam: [K(0, 'snowki', { z: 3.0, lens: 0.9, e: 'inOutSine' }), K(1.8, 'snowkiLow', { z: 2.4, lens: 0.8, e: 'inOutSine' }), K(7.4, 'snowkiLow', { z: 2.5, lens: 0.8, e: 'inOutSine' }), K(d[3], 'meet', { z: 2.9, lens: 0.9 })],
    focus: [[0, 'snowki'], [7.6, 'snowki'], [8.6, 'boy']], aper: 3, ev: [[7.2, 'boyLookDown'], [7.8, 'boySmile']] });
  // ---- 4  The memory: years ago, he gives Snowki to her (warm golden flashback)
  scenes.push({ n: 4, dur: d[4], tod: [1.76, 1.76], sub: [[0.9, sub(4), 5]],
    cam: [K(0, 'meet', { z: 2.9, lens: 0.9 }), K(d[4], 'meet', { z: 3.0, lens: 0.9 })], focus: 'boy', aper: 3, ev: [[0, 'memOn'], [d[4] - 1.1, 'memOff']] });
  // ---- 5  He kneels, picks Snowki up; they talk
  scenes.push({ n: 5, dur: d[5], tod: [1.76, 1.78], sub: [],
    cam: [K(0, 'meet', { z: 3.0, lens: 0.9, e: 'inOutSine' }), K(2.8, 'meetUp', { z: 3.3, lens: 0.92, e: 'inOutSine' }), K(d[5], 'meetUp', { z: 3.5, lens: 0.92 })], focus: 'boy', aper: 3,
    ev: [[0.3, 'boyKneel'], [1.3, 'boyReach'], [2.6, 'boyHold'], [3.2, 'say', 'snowki1'], [6.9, 'say', 'man1'], [10.2, 'boyLookHelen'], [10.5, 'say', 'man2']] });
  // ---- 6  He stands; Helen notices: her eyes, then her head; a pause; a small smile. His gentle smile.
  scenes.push({ n: 6, dur: d[6], tod: [1.78, 1.8], sub: [],
    cam: [K(0, 'meetUp', { z: 3.4, lens: 0.92, e: 'inOutSine' }), K(1.8, 'helenMed', { z: 2.7, lens: 0.92, e: 'inOutSine' }), K(5.4, 'helenMed', { z: 2.9, lens: 0.92, e: 'inOutSine' }), K(7.0, 'twoShot', { z: 1.5, lens: 0.6, e: 'inOutSine' }), K(d[6], 'twoShot', { z: 1.55, lens: 0.6 })],
    focus: [[0, 'boy'], [1.6, 'helen'], [6.4, 'helen'], [7.4, 'boy']], aper: 2.5, ev: [[0.2, 'boyStand'], [2.0, 'helenNotice'], [2.5, 'helenTurn'], [4.4, 'helenSmile']] });
  // ---- 7  His quiet birthday wish: he sets Snowki down with the gift, signals; fireworks from far along the beach; the message
  scenes.push({ n: 7, dur: d[7], tod: [1.8, 1.84], sub: [],
    cam: [K(0, 'twoShot', { z: 1.55, lens: 0.6, e: 'inOutSine' }), K(2.8, 'twoShot', { z: 1.5, lens: 0.6, e: 'inOutCubic' }), K(4.8, 'skyWide', { z: 1.0, e: 'inOutSine' }), K(d[7], 'skyWide', { z: 1.04 })],
    focus: [[0, 'boy'], [3.4, 'boy'], [4.6, 'sky']], aper: 2,
    ev: [[0.5, 'boyPutDown'], [2.2, 'boySignal'], [3.0, 'rockets'], [3.4, 'boySignalDown'], [3.8, 'helenLookUp'], [4.2, 'jessiLookUp'], [7.0, 'message']] });
  // ---- 8  Her reaction: firework light in her eyes, a slow smile, her hand on her heart; Snowki back in her lap with the gift
  scenes.push({ n: 8, dur: d[8], tod: [1.84, 1.86], sub: [],
    cam: [K(0, 'helenUp', { z: 2.6, lens: 0.92, e: 'inOutSine' }), K(d[8], 'helenFace', { z: 3.9, lens: 0.95 })], focus: 'helen', aper: 3,
    ev: [[0, 'snLookUp'], [0.6, 'messageOff'], [0.9, 'helenSmile'], [1.4, 'handChest']] });
  // ---- 9  A slow pull back: Helen with Snowki and Jessi, the man by the tree, fireworks still sparkling; the words; fade
  scenes.push({ n: 9, dur: d[9], tod: [1.86, 1.95], sub: [],
    cam: [K(0, 'helenSnow', { z: 2.4, lens: 0.9, e: 'inOutCubic' }), K(6.5, 'finalWide', { z: 1.0 }), K(d[9], 'finalWide', { z: 1.03 })], focus: [[0, 'helen'], [5, 'sky']], aper: 2,
    ev: [[0, 'snHold'], [0.2, 'jessiHappy'], [0.5, 'softFireworks'], [3.0, 'line', 0], [7.5, 'line', 1], [14.0, 'end']] });

  let t = 0; for (const s of scenes) { s.start = t; t += s.dur; }
  return { scenes, duration: t, at(T) { for (let i = scenes.length - 1; i >= 0; i--) if (T >= scenes[i].start) return scenes[i]; return scenes[0]; } };
}

// evaluate a scene's camera keys at local time lt; resolve(at) -> {x, y} anchor in world units
export function cameraAt(scene, lt, resolve, portrait) {
  const keys = scene.cam; let a = keys[0], b = keys[keys.length - 1];
  for (let i = 0; i < keys.length - 1; i++) if (lt >= keys[i].t && lt <= keys[i + 1].t) { a = keys[i]; b = keys[i + 1]; break; }
  if (lt < keys[0].t) b = a; if (lt > keys[keys.length - 1].t) a = b;
  const u = b.t > a.t ? clamp((lt - a.t) / (b.t - a.t), 0, 1) : 1, e = (ease[a.e] || ease.inOutSine)(u);
  // a key frames a subject standing at depth gy: convert its position and magnification into camera space
  const conv = (k, p) => {
    const z = ((portrait && k.pz) || k.z) * (p.zk || 1), x = p.x + (k.dx || 0), y = p.y + (k.dy || 0);
    if (!p.gy) return { x, y, z };
    let f = fOf(p.gy); if (f < 1) f = 1 - (1 - f) * (1 - 0.82 * (k.lens || 0));
    return { x: 800 + (x - 800) / f, y: 500 + (y - 500) / f, z: 1 + (z - 1) / Math.min(f, 1.3) };
  };
  const A = conv(a, resolve(a.at, portrait)), B = conv(b, resolve(b.at, portrait));
  return { x: lerp(A.x, B.x, e), y: lerp(A.y, B.y, e), z: Math.exp(lerp(Math.log(A.z), Math.log(B.z), e)), lens: lerp(a.lens || 0, b.lens || 0, e), roll: 0 };
}
export function focusAt(scene, lt) {
  const f = scene.focus; if (typeof f === 'string') return { a: f, b: f, k: 0 };
  let a = f[0], b = f[f.length - 1];
  for (let i = 0; i < f.length - 1; i++) if (lt >= f[i][0] && lt <= f[i + 1][0]) { a = f[i]; b = f[i + 1]; break; }
  if (lt < f[0][0]) b = a; if (lt > f[f.length - 1][0]) a = b;
  const k = b[0] > a[0] ? smoothstep(a[0], b[0], lt) : 0; return { a: a[1], b: b[1], k };
}
// bullet-time curve: 1 -> 0.05 -> 1 with easing
export function timeScaleAt(bt, T) {
  if (!bt) return 1;
  if (T < bt.in) return 1;
  if (T < bt.in + 1.2) return lerp(1, 0.05, ease.inOutSine((T - bt.in) / 1.2));
  if (T < bt.out) return 0.05;
  if (T < bt.out + 1.0) return lerp(0.05, 1, ease.inOutSine((T - bt.out) / 1.0));
  return 1;
}

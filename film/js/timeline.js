// The master timeline: one clock drives scenes, camera, subtitles, time of day, bullet-time, events and audio cues.
// Scene 0 (the wish) waits for her; scenes 1..8 run on the master time T (seconds since the candle went out).
import { clamp, lerp, ease, smoothstep } from './core.js';
import { fOf } from './space.js';

// camera key helpers: k(t, target, opts) – targets are anchor names resolved live (so shots follow the rigs)
const K = (t, at, o = {}) => ({ t, at, ...o });

export function buildTimeline(cfg) {
  const d = cfg.timings, scenes = [];
  const sub = n => cfg.text.subtitles[n] || '';
  // ---- 1  After the cake: Helen sits on the sea wall watching the sea (seen from behind), Snowki beside her, Jessi too; the moon ahead
  scenes.push({ n: 1, dur: d[1], tod: [1.72, 1.74], sub: [[0.8, sub(1), 6]],
    cam: [K(0, 'wide', { z: 1.0, e: 'inOutSine' }), K(d[1], 'helenBack', { z: 2.1, lens: 0.85 })], focus: 'helen', aper: 2 });
  // ---- 2  Snowki turns around: someone is behind the big bougainvillea tree; rack focus to the tree
  scenes.push({ n: 2, dur: d[2], tod: [1.74, 1.75], sub: [],
    cam: [K(0, 'snowki', { z: 3.6, lens: 0.95, e: 'inOutSine' }), K(4.2, 'snowki', { z: 3.9, lens: 0.95, e: 'inOutSine' }), K(d[2], 'treeMan', { z: 1.9, lens: 0.7 })],
    focus: [[0, 'snowki'], [4.6, 'snowki'], [6.2, 'boy']], aper: 3, ev: [[0.6, 'snTurn'], [1.4, 'snAlert'], [3.2, 'snAlive']] });
  // ---- 3  Snowki hops down and toddles all the way to the tree; the man looks down and smiles
  scenes.push({ n: 3, dur: d[3], tod: [1.75, 1.76], sub: [],
    cam: [K(0, 'snowki', { z: 2.8, lens: 0.9, e: 'inOutSine' }), K(1.8, 'snowkiLow', { z: 2.2, lens: 0.8, e: 'inOutSine' }), K(7.6, 'snowkiLow', { z: 2.3, lens: 0.8, e: 'inOutSine' }), K(d[3], 'meet', { z: 2.7, lens: 0.9 })],
    focus: [[0, 'snowki'], [7.8, 'snowki'], [8.6, 'boy']], aper: 3, ev: [[7.6, 'boyLookDown'], [8.2, 'boySmile']] });
  // ---- 4  The memory: years ago, he gives Snowki to her
  scenes.push({ n: 4, dur: d[4], tod: [1.76, 1.76], sub: [[0.9, sub(4), 5]],
    cam: [K(0, 'meet', { z: 2.7, lens: 0.9 }), K(d[4], 'meet', { z: 2.8, lens: 0.9 })], focus: 'boy', aper: 3, ev: [[0, 'memOn'], [d[4] - 1.1, 'memOff']] });
  // ---- 5  He kneels, lifts Snowki into his arms; they talk
  scenes.push({ n: 5, dur: d[5], tod: [1.76, 1.78], sub: [],
    cam: [K(0, 'meet', { z: 2.8, lens: 0.9, e: 'inOutSine' }), K(2.9, 'meetUp', { z: 3.1, lens: 0.92, e: 'inOutSine' }), K(d[5], 'meetUp', { z: 3.3, lens: 0.92 })], focus: 'boy', aper: 3,
    ev: [[0.3, 'boyKneel'], [1.2, 'boyReach'], [2.8, 'boyHold'], [3.3, 'say', 'snowki1'], [7.0, 'say', 'man1'], [10.2, 'boyLookHelen'], [10.5, 'say', 'man2']] });
  // ---- 6  He gives Snowki the gift and sets him down; looks at her far away – she is watching the sea; goes to his crate
  scenes.push({ n: 6, dur: d[6], tod: [1.78, 1.8], sub: [],
    cam: [K(0, 'meetUp', { z: 3.1, lens: 0.92, e: 'inOutSine' }), K(1.9, 'manPOV', { z: 1.6, lens: 0.6, e: 'inOutSine' }), K(4.6, 'manPOV', { z: 1.65, lens: 0.6, e: 'inOutSine' }), K(d[6], 'crate', { z: 2.3, lens: 0.85 })],
    focus: [[0, 'boy'], [2, 'helen'], [4.6, 'helen'], [6.4, 'crate']], aper: 2.5, ev: [[0.4, 'boyPutDown'], [1.4, 'boyStand'], [1.8, 'boyLookHelen'], [5.0, 'boyLight']] });
  // ---- 7  He lights it himself: the rocket climbs high, cracks – and HAPPY BIRTHDAY appears in the sky
  scenes.push({ n: 7, dur: d[7], tod: [1.8, 1.84], sub: [],
    cam: [K(0, 'crate', { z: 2.4, lens: 0.85, e: 'inOutSine' }), K(2.6, 'crate', { z: 2.5, lens: 0.85, e: 'inOutSine' }), K(4.3, 'rocket', { z: 1.3, lens: 0.3, e: 'inOutSine' }), K(5.5, 'skyWide', { z: 1.0, e: 'inOutSine' }), K(d[7], 'skyWide', { z: 1.04 })],
    focus: [[0, 'crate'], [2.8, 'crate'], [4, 'sky']], aper: 2.5,
    ev: [[0.6, 'flame'], [1.0, 'fuse'], [2.6, 'launch'], [3.0, 'boyBack'], [4.5, 'snHome'], [5.4, 'crack'], [5.7, 'helenLookUp'], [6.0, 'jessiLookUp']] });
  // ---- 8  Her face: surprise, excitement, happiness (the reverse angle, from the sea side)
  scenes.push({ n: 8, dur: d[8], tod: [1.84, 1.86], sub: [], rev: true,
    cam: [K(0, 'helenUp', { z: 2.6, lens: 0.92, e: 'inOutSine' }), K(d[8], 'helenFace', { z: 3.6, lens: 0.95 })], focus: 'helen', aper: 3,
    ev: [[0, 'messageOff'], [0, 'snLookUp'], [0, 'hSurprised'], [1.5, 'hExcited'], [3.8, 'hHappy'], [6.0, 'hSmile']] });
  // ---- 9  He sees her happy face, smiles, and quietly walks away (looks back once)
  scenes.push({ n: 9, dur: d[9], tod: [1.86, 1.88], sub: [],
    cam: [K(0, 'manWatch', { z: 2.3, lens: 0.85, e: 'inOutSine' }), K(3.6, 'manWatch', { z: 2.5, lens: 0.85, e: 'inOutSine' }), K(d[9], 'walker', { z: 2.0, pz: 1.6, lens: 1 })],
    focus: 'boy', aper: 3, ev: [[0, 'boyWatch'], [3.6, 'boyLeave']] });
  // ---- 10  Pull back: Helen, Snowki and Jessi watching the sky; he is gone; the words; fade
  scenes.push({ n: 10, dur: d[10], tod: [1.88, 1.95], sub: [],
    cam: [K(0, 'walker', { z: 2.0, pz: 1.6, lens: 1, e: 'inOutCubic' }), K(4.5, 'finalWide', { z: 1.0 }), K(d[10], 'finalWide', { z: 1.03 })], focus: [[0, 'boy'], [4, 'sky']], aper: 2,
    ev: [[0, 'snHold'], [0.2, 'jessiHappy'], [0.4, 'helenSky'], [0.5, 'softFireworks'], [3.0, 'line', 0], [7.5, 'line', 1], [14.0, 'end']] });

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

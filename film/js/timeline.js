// The master timeline: one clock drives scenes, camera, subtitles, time of day, bullet-time, events and audio cues.
// Scene 0 (the wish) waits for her; scenes 1..9 run on the master time T (seconds since the candle went out).
import { clamp, lerp, ease, smoothstep } from './core.js';
import { fOf } from './space.js';

// camera key helpers: k(t, target, opts) – targets are anchor names resolved live (so shots follow the rigs)
const K = (t, at, o = {}) => ({ t, at, ...o });

export function buildTimeline(cfg) {
  const d = cfg.timings, scenes = [];
  const sub = n => cfg.text.subtitles[n] || '';
  // a cut = two keys 0.02 s apart (the camera jumps; motion blur ignores the jump)
  const C = 0.02;
  // ---- 1  Opening: night, from behind – Helen on the sea wall facing the sea and the moon, Snowki beside her, Jessi beside him;
  //          the cake, presents and balloons on the wall to her left; people far away; the big tree on the right hides the man
  scenes.push({ n: 1, dur: d[1], tod: [1.72, 1.74], sub: [[1.0, sub(1), 6.5]],
    cam: [K(0, 'wide', { z: 1.0, e: 'inOutSine' }), K(3.2, 'wide', { z: 1.04, e: 'inOutSine' }), K(d[1], 'trioBack', { z: 1.75, lens: 0.8 })], focus: 'helen', aper: 1.6 });
  // ---- 2  Jessi notices first (ears up, turns to the tree); Snowki turns too; the man peeks from behind the trunk; Snowki recognises him
  scenes.push({ n: 2, dur: d[2], tod: [1.74, 1.75], sub: [],
    cam: [K(0, 'pairBack', { z: 2.3, lens: 0.9, e: 'inOutSine' }), K(3.0, 'pairBack', { z: 2.45, lens: 0.9 }),
      K(3.0 + C, 'treeMan', { z: 2.9, pz: 2.6, lens: 0.8, e: 'inOutSine' }), K(6.2, 'treeMan', { z: 3.3, pz: 2.9, lens: 0.8 }),
      K(6.2 + C, 'snowFace', { z: 4.0, lens: 0.95, e: 'inOutSine' }), K(d[2], 'snowFace', { z: 4.5, lens: 0.95 })],
    focus: [[0, 'snowki'], [3.0, 'snowki'], [3.0 + C, 'boy'], [6.2, 'boy'], [6.2 + C, 'snowki']], aper: 2.6,
    ev: [[0.5, 'jAlert'], [1.5, 'snTurn'], [1.8, 'snAlert'], [6.6, 'snAlive']] });
  // ---- 3  He steps out from behind the tree and glances at her far away; Snowki hops down, toddles, glides by magic to him;
  //          Jessi trots after him and sits near the man, wagging
  scenes.push({ n: 3, dur: d[3], tod: [1.75, 1.76], sub: [],
    cam: [K(0, 'treeMan', { z: 2.7, lens: 0.82, e: 'inOutSine' }), K(2.6, 'treeMan', { z: 2.55, lens: 0.82 }),
      K(2.6 + C, 'snowki', { z: 2.5, lens: 0.88, e: 'inOutSine' }), K(4.6, 'snowTrack', { z: 2.2, lens: 0.84, e: 'inOutSine' }), K(10.4, 'snowTrack', { z: 2.2, lens: 0.84, e: 'inOutSine' }), K(d[3], 'meet', { z: 2.5, lens: 0.88 })],
    focus: [[0, 'boy'], [2.6, 'boy'], [2.6 + C, 'snowki'], [10.8, 'snowki'], [12.0, 'boy']], aper: 2.6, ev: [[10.8, 'boyLookDown'], [11.6, 'boySmile']] });
  // ---- 4  The memory: years ago, at the seaside at golden hour, he gives Snowki to her (the #mem canvas over the scene)
  scenes.push({ n: 4, dur: d[4], tod: [1.76, 1.76], sub: [[1.4, sub(4), 4.2]],
    cam: [K(0, 'meet', { z: 2.5, lens: 0.88 }), K(d[4], 'meet', { z: 2.7, lens: 0.88 })], focus: 'boy', aper: 2.6, ev: [[0, 'memOn'], [d[4] - 1.3, 'memOff']] });
  // ---- 5  He kneels and cradles Snowki; they talk (subtitles); Jessi sits nearby
  scenes.push({ n: 5, dur: d[5], tod: [1.76, 1.78], sub: [],
    cam: [K(0, 'meet', { z: 2.7, lens: 0.88, e: 'inOutSine' }), K(2.9, 'meetUp', { z: 2.9, lens: 0.92, e: 'inOutSine' }), K(d[5], 'meetUp', { z: 3.1, lens: 0.92 })], focus: 'boy', aper: 2.6,
    ev: [[0.3, 'boyKneel'], [1.2, 'boyReach'], [2.8, 'boyHold'], [3.3, 'say', 'snowki1'], [7.2, 'say', 'man1'], [11.0, 'say', 'man2'], [15.2, 'boyLookHelen']] });
  // ---- 6  He gives Snowki the gift and sets him down; Snowki and Jessi go back to her; she slowly notices him – head, then shoulders –
  //          recognises him, a small gentle smile (reverse angle); he smiles back
  scenes.push({ n: 6, dur: d[6], tod: [1.78, 1.8], sub: [], rev: [[8.4, 10.2]],
    cam: [K(0, 'meetUp', { z: 2.9, lens: 0.92, e: 'inOutSine' }), K(2.2, 'meet', { z: 2.5, lens: 0.88 }),
      K(2.2 + C, 'otsHelen', { z: 1.3, lens: 0.75, e: 'inOutSine' }), K(5.6, 'otsHelen', { z: 1.38, lens: 0.75 }),
      K(5.6 + C, 'helenTurn', { z: 2.6, lens: 0.9, e: 'inOutSine' }), K(8.4, 'helenTurn', { z: 2.75, lens: 0.9 }),
      K(8.4 + C, 'helenFront', { z: 3.2, lens: 0.95, e: 'inOutSine' }), K(10.2, 'helenFront', { z: 3.4, lens: 0.95 }),
      K(10.2 + C, 'manSmile', { z: 5.0, lens: 0.95, e: 'inOutSine' }), K(d[6], 'manSmile', { z: 5.3, lens: 0.95 })],
    focus: [[0, 'boy'], [2.2, 'boy'], [2.2 + C, 'snowki'], [5.6, 'snowki'], [5.6 + C, 'helen'], [10.2, 'helen'], [10.2 + C, 'boy']], aper: 2.4,
    ev: [[0.4, 'boyPutDown'], [1.4, 'boyStand'], [2.0, 'boyLookHelen'], [5.6, 'hNotice'], [7.0, 'hTurnBody'], [9.0, 'hSmile1'], [10.6, 'boySmileBack']] });
  // ---- 7  He lights the long fuse himself: the spark runs to the launcher, the shell climbs on a golden trail, cracks –
  //          HAPPY BIRTHDAY appears with the burst, more bursts, reflections on the sea; Snowki is back in her lap
  scenes.push({ n: 7, dur: d[7], tod: [1.8, 1.84], sub: [],
    cam: [K(0, 'crate', { z: 2.3, lens: 0.85, e: 'inOutSine' }), K(2.6, 'crate', { z: 2.45, lens: 0.85, e: 'inOutSine' }), K(3.7, 'spark', { z: 2.6, lens: 0.85, e: 'inOutSine' }),
      K(4.4, 'mortar', { z: 6.5, lens: 0.92, e: 'inOutSine' }), K(5.2, 'mortar', { z: 6.7, lens: 0.92, e: 'inOutSine' }), K(6.5, 'rocket', { z: 1.3, lens: 0.3, e: 'inOutSine' }),
      K(8.0, 'skyWide', { z: 1.0, e: 'inOutSine' }), K(d[7], 'skyWide', { z: 1.04 })],
    focus: [[0, 'boy'], [2.6, 'boy'], [3.7, 'crate'], [5.6, 'crate'], [6.4, 'sky']], aper: 2.4,
    ev: [[0.2, 'boyToLight'], [1.2, 'boyLight'], [1.7, 'flame'], [2.1, 'fuse'], [3.0, 'boyBack'], [5.1, 'launch'], [7.9, 'crack'], [8.2, 'helenLookUp'], [8.5, 'jessiLookUp']] });
  // ---- 8  Her face, the reverse angle from the sea side: surprise -> excitement -> happiness, Snowki in her arms, lit by the fireworks
  scenes.push({ n: 8, dur: d[8], tod: [1.84, 1.86], sub: [], rev: true,
    cam: [K(0, 'helenUp', { z: 2.6, lens: 0.92, e: 'inOutSine' }), K(d[8], 'helenFace', { z: 3.4, lens: 0.95 })], focus: 'helen', aper: 3,
    ev: [[0, 'messageOff'], [0, 'snLookUp'], [0, 'hSurprised'], [1.5, 'hExcited'], [3.8, 'hHappy'], [6.0, 'hSmile']] });
  // ---- 9  All four: she watches the fireworks with Snowki in her arms, Jessi beside her, the man at a respectful distance;
  //          she turns and gives him one last gentle smile, he smiles back; one slow pull back; the words; a gentle fade
  scenes.push({ n: 9, dur: d[9], tod: [1.86, 1.95], sub: [],
    cam: [K(0, 'finalMed', { z: 1.9, lens: 0.85, e: 'inOutSine' }), K(5.6, 'finalMed', { z: 2.05, lens: 0.85 }),
      K(5.6 + C, 'manSmile2', { z: 4.8, lens: 0.95, e: 'inOutSine' }), K(7.6, 'manSmile2', { z: 5.0, lens: 0.95 }),
      K(7.6 + C, 'finalMed', { z: 2.0, lens: 0.85, e: 'inOutSine' }), K(13.6, 'finalWide', { z: 1.0, lens: 0.5, e: 'inOutSine' }), K(d[9], 'finalWide', { z: 0.98, lens: 0.5 })],
    focus: [[0, 'helen'], [5.6, 'helen'], [5.6 + C, 'boy'], [7.6, 'boy'], [7.6 + C, 'helen'], [12, 'sky']], aper: 2,
    ev: [[0, 'snHold'], [0, 'finalPlaces'], [0.2, 'jessiHappy'], [0.4, 'helenSky'], [0.5, 'softFireworks'], [2.6, 'hTurnHim'], [3.8, 'hSmileHim'], [6.0, 'boySmileBack'],
      [7.6, 'messageOn'], [8.4, 'hBackToSky'], [14.4, 'fadeOut'], [14.6, 'messageOff'], [15.0, 'line', 0], [16.2, 'line', 1], [17.6, 'end']] });

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

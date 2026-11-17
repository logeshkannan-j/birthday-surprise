// The master timeline: one clock drives scenes, camera, subtitles, time of day, bullet-time, events and audio cues.
// Scene 0 (the wish) waits for her; scenes 1..8 run on the master time T (seconds since the candle went out).
import { clamp, lerp, ease, smoothstep } from './core.js';
import { fOf } from './space.js';

// camera key helpers: k(t, target, opts) – targets are anchor names resolved live (so shots follow the rigs)
const K = (t, at, o = {}) => ({ t, at, ...o });

export function buildTimeline(cfg) {
  const d = cfg.timings, scenes = [];
  const sub = n => cfg.text.subtitles[n] || '';
  // ---- scene 1: golden-hour seaside, slow dolly towards Helen
  scenes.push({ n: 1, dur: d[1], tod: [0.0, 0.14], sub: [[0.8, sub(1), 6.5]],
    cam: [K(0, 'wide', { z: 1.0, e: 'inOutSine' }), K(d[1], 'helenWide', { z: 1.55 })],
    focus: 'helen', aper: 3, helen: { expr: 'calm' } });
  // ---- scene 2: Helen with Jessi and Snowki; her laugh and her petting send plankton rings across the sea
  scenes.push({ n: 2, dur: d[2], tod: [0.14, 0.28], sub: [[1.0, sub(2), 5]],
    cam: [K(0, 'helenMed', { z: 2.5, e: 'inOutSine' }), K(d[2], 'helenMed', { z: 2.9, dx: -6 })],
    focus: 'helen', aper: 5,
    ev: [[2.4, 'laugh'], [2.4, 'ripple', 1.0], [5.2, 'pet'], [5.4, 'ripple', 0.8], [7.4, 'ripple', 0.6], [9.6, 'calm']],
    helen: { expr: 'calm' } });
  // ---- scene 3: whip pan to the boy hiding behind the tree; his eyes; the golden thread appears
  scenes.push({ n: 3, dur: d[3], tod: [0.28, 0.48], sub: [],
    cam: [K(0, 'helenMed', { z: 2.9, e: 'inOutExpo' }), K(0.85, 'boyFace', { z: 4.6, e: 'inOutSine' }), K(5.4, 'boyFace', { z: 5.3, e: 'inOutSine' }), K(8.6, 'threadWide', { z: 1.3, e: 'inOutSine' }), K(d[3], 'threadWide', { z: 1.36 })],
    focus: [[0, 'boy'], [8.6, 'boy'], [10.5, 'helen']], aper: 6,
    boy: { pose: 'hide', expr: 'watching' }, ev: [[2.2, 'boyWatch'], [3.4, 'threadOn'], [4.4, 'boySmile']] });
  // ---- scene 4: he lights the launcher; slow-motion rockets climb on golden trails
  scenes.push({ n: 4, dur: d[4], tod: [0.48, 0.78], sub: [[3.6, sub(4), 5.5]],
    cam: [K(0, 'launcher', { z: 2.3, e: 'inOutSine' }), K(4.6, 'launcher', { z: 2.45, e: 'inOutCubic' }), K(d[4], 'skyRise', { z: 1.0 })],
    focus: [[0, 'boyLight'], [5, 'sky']], aper: 5,
    boy: { pose: 'light', expr: 'watching', at: 'light' }, ev: [[0.8, 'flame'], [2.0, 'fuse'], [4.6, 'rockets'], [6.0, 'boyStand']] });
  // ---- scene 5: the sky spells her name; "Look up…"; bullet-time on her face
  scenes.push({ n: 5, dur: d[5], tod: [0.78, 1.0], sub: [[1.4, sub(5), 4]],
    cam: [K(0, 'sky', { z: 1.0, e: 'inOutSine' }), K(4.6, 'sky', { z: 1.03, e: 'inOutCubic' }), K(6.8, 'helenUp', { z: 2.7, e: 'inOutSine' }), K(12.6, 'helenFace', { z: 7.2, e: 'inOutSine' }), K(d[5], 'helenFace', { z: 6.4 })],
    focus: [[0, 'sky'], [5.5, 'helen']], aper: 7,
    ev: [[0, 'formIfMissing'], [2.0, 'lanterns'], [3.0, 'aurora'], [4.4, 'lookUp'], [6.2, 'wish'], [7.0, 'bulletIn'], [12.0, 'bulletOut'], [13.4, 'teary']],
    helen: { expr: 'calm' } });
  // ---- scene 6: his close-up, lit by the glow; he smiles because she smiles
  scenes.push({ n: 6, dur: d[6], tod: [1.0, 1.1], sub: [[1.4, sub(6), 5]],
    cam: [K(0, 'boyFace', { z: 4.9, e: 'inOutSine' }), K(d[6], 'boyFace', { z: 5.4 })],
    focus: 'boy', aper: 7, boy: { pose: 'watch', expr: 'contentment' }, ev: [[0, 'formIfMissing'], [0.5, 'threadWarm']] });
  // ---- scene 7: he turns and walks away – long-lens silhouette against the last of the sunset; his shadow melts into the light
  scenes.push({ n: 7, dur: d[7], tod: [1.1, 1.5], sub: [[0.5, sub(7), 4]],
    cam: [K(0, 'walker', { z: 2.5, lens: 1, e: 'inOutSine' }), K(d[7], 'walker', { z: 2.9, lens: 1 })],
    focus: 'walker', aper: 4, boy: { pose: 'walk', expr: 'farewell' }, ev: [[0, 'formIfMissing'], [3, 'lettersFade']] });
  // ---- scene 8: pull up to the night sky; the thread becomes stars that draw a heart; the final words
  scenes.push({ n: 8, dur: d[8], tod: [1.5, 2.0], sub: [],
    cam: [K(0, 'walkerEnd', { z: 1.6, lens: 0.6, e: 'inOutCubic' }), K(4.5, 'night', { z: 1.0, lens: 0 }), K(d[8], 'night', { z: 1.04 })],
    focus: 'sky', aper: 2, ev: [[0.5, 'softFireworks'], [3.0, 'line', 0], [5.0, 'toStars'], [7.5, 'line', 1], [8.0, 'heartDraw'], [12.5, 'line', 2], [15.0, 'end']] });

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

// The master timeline: one clock drives scenes, camera, subtitles, time of day, bullet-time, events and audio cues.
// Scene 0 (the wish) waits for her; scenes 1..8 run on the master time T (seconds since the candle went out).
import { clamp, lerp, ease, smoothstep } from './core.js';
import { fOf } from './space.js';

// camera key helpers: k(t, target, opts) – targets are anchor names resolved live (so shots follow the rigs)
const K = (t, at, o = {}) => ({ t, at, ...o });

export function buildTimeline(cfg) {
  const d = cfg.timings, scenes = [];
  const sub = n => cfg.text.subtitles[n] || '';
  // ---- scene 1: a quiet night by the sea – moon low over the water, string lights, her jar lantern; slow dolly to Helen
  scenes.push({ n: 1, dur: d[1], tod: [1.72, 1.75], sub: [[0.8, sub(1), 6.5]],
    cam: [K(0, 'wide', { z: 1.0, e: 'inOutSine' }), K(d[1], 'helenWide', { lens: 0.4, z: 1.55 })],
    focus: 'helen', aper: 2, helen: { expr: 'calm' } });
  // ---- scene 2: her laugh and her petting send plankton rings across the sea; Snowki winks at us, then slips out of her lap
  scenes.push({ n: 2, dur: d[2], tod: [1.75, 1.78], sub: [[1.0, sub(2), 4.6]],
    cam: [K(0, 'helenMed', { lens: 0.9, z: 2.5, e: 'inOutSine' }), K(9.2, 'helenMed', { lens: 0.9, z: 2.85, dx: -4, e: 'inOutSine' }), K(d[2], 'snowki', { lens: 0.7, z: 2.3 })],
    focus: [[0, 'helen'], [9.6, 'helen'], [11.4, 'snowki']], aper: 3,
    ev: [[2.4, 'laugh'], [2.4, 'ripple', 1.0], [5.2, 'pet'], [5.4, 'ripple', 0.8], [6.4, 'snWink'], [7.4, 'ripple', 0.6], [9.0, 'calm']],
    helen: { expr: 'calm' } });
  // ---- scene 3: Snowki flies along the promenade to the boy hiding under the bougainvillea; he smiles, the golden thread appears
  scenes.push({ n: 3, dur: d[3], tod: [1.78, 1.8], sub: [],
    cam: [K(0, 'snowki', { lens: 0.7, z: 2.3, e: 'inOutSine' }), K(3.9, 'boyMeet', { lens: 0.85, z: 2.5, e: 'inOutSine' }), K(8.2, 'boyMeet', { lens: 0.85, z: 2.75, e: 'inOutSine' }), K(10.4, 'crateWide', { lens: 0.5, z: 1.7, e: 'inOutSine' }), K(d[3], 'crateWide', { lens: 0.5, z: 1.78 })],
    focus: [[0, 'snowki'], [3.0, 'snowki'], [3.9, 'boy']], aper: 3,
    boy: { pose: 'hide', expr: 'watching' }, ev: [[3.9, 'snWave'], [4.2, 'boyWatch'], [4.8, 'boySmile'], [5.4, 'boyReach'], [5.9, 'snTouch'], [6.1, 'threadOn'], [7.4, 'snNod'], [8.0, 'boyLetGo']] });
  // ---- scene 4: he lights the crate while Snowki hides his eyes on top of it; rockets climb on golden trails, Snowki races after them
  scenes.push({ n: 4, dur: d[4], tod: [1.8, 1.82], sub: [[3.6, sub(4), 5.5]],
    cam: [K(0, 'launcher', { lens: 0.8, z: 2.3, e: 'inOutSine' }), K(4.6, 'launcher', { lens: 0.8, z: 2.45, e: 'inOutCubic' }), K(d[4], 'skyRise', { z: 1.0 })],
    focus: [[0, 'boyLight'], [4.4, 'boyLight'], [5.8, 'sky']], aper: 3,
    boy: { pose: 'light', expr: 'watching', at: 'light' }, ev: [[0.8, 'flame'], [1.5, 'snCover'], [2.0, 'fuse'], [4.6, 'rockets'], [4.65, 'snCheer'], [6.0, 'boyStand']] });
  // ---- scene 5: the sky spells her name; "Look up…"; Snowki is back in her lap, looking up with her; bullet-time on her face
  scenes.push({ n: 5, dur: d[5], tod: [1.82, 1.86], sub: [[1.4, sub(5), 4]],
    cam: [K(0, 'sky', { z: 1.0, e: 'inOutSine' }), K(4.6, 'sky', { z: 1.03, e: 'inOutCubic' }), K(6.8, 'helenUp', { lens: 0.9, z: 2.6, e: 'inOutSine' }), K(12.6, 'helenFace', { lens: 0.95, z: 4.8, e: 'inOutSine' }), K(d[5], 'helenFace', { lens: 0.95, z: 4.4 })],
    focus: [[0, 'sky'], [4.6, 'sky'], [6.4, 'helen']], aper: 4,
    ev: [[0, 'formIfMissing'], [2.0, 'lanterns'], [3.0, 'aurora'], [3.2, 'snLookUp'], [4.4, 'lookUp'], [6.2, 'wish'], [7.0, 'bulletIn'], [12.0, 'bulletOut'], [13.4, 'teary']],
    helen: { expr: 'calm' } });
  // ---- scene 6: at the tree, lit by the glow, he smiles because she smiles
  scenes.push({ n: 6, dur: d[6], tod: [1.86, 1.88], sub: [[1.4, sub(6), 5]],
    cam: [K(0, 'boyMed', { lens: 0.9, z: 2.5, e: 'inOutSine' }), K(d[6], 'boyMed', { lens: 0.9, z: 2.8 })],
    focus: 'boy', aper: 3, boy: { pose: 'watch', expr: 'contentment' }, ev: [[0, 'formIfMissing'], [0.5, 'threadWarm']] });
  // ---- scene 7: he walks away under the lamps and looks back once; in her lap, Snowki waves goodbye for her
  scenes.push({ n: 7, dur: d[7], tod: [1.88, 1.92], sub: [[0.5, sub(7), 4]],
    cam: [K(0, 'walker', { z: 2.5, pz: 1.7, lens: 1, e: 'inOutSine' }), K(7.6, 'walker', { z: 2.8, pz: 1.9, lens: 1, e: 'inOutSine' }), K(9.8, 'helenSnow', { lens: 0.9, z: 2.6, e: 'inOutSine' }), K(d[7], 'helenSnow', { lens: 0.9, z: 2.75 })],
    focus: [[0, 'walker'], [8.0, 'walker'], [9.6, 'helen']], aper: 3, boy: { pose: 'walk', expr: 'farewell' }, ev: [[0, 'formIfMissing'], [3, 'lettersFade'], [10.0, 'snWave'], [11.8, 'snHug']] });
  // ---- scene 8: pull up to the night sky; the thread becomes stars that draw a heart; the final words
  scenes.push({ n: 8, dur: d[8], tod: [1.92, 2.0], sub: [],
    cam: [K(0, 'helenSnow', { z: 2.75, lens: 0.9, e: 'inOutCubic' }), K(5.0, 'night', { z: 1.0, lens: 0 }), K(d[8], 'night', { z: 1.04 })],
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

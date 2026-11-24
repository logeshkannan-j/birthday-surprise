// Jessi's voice: a small physical model of a puppy's voice, made with Web Audio (no samples, nothing to download), used by the
// birthday page and by the film. A voiced sound is a glottal pulse train (a harmonic-rich wave whose pitch follows a contour
// with a little jitter and, for growls, a rough amplitude flutter) pushed through the formants of a dog's throat (their
// positions glide as the mouth opens and closes), plus the noisy parts: the rasp at the front of a bark, breath, a growl's rattle.
//
//   const dog = new DogVoice(audioContext, destinationNode [, reverbInputNode]);
//   dog.say('happy' | 'excited' | 'angry' | 'sheepish' | 'soft' | 'yelp' | 'sleepy' | 'whine' | 'whimper' | 'growl' | 'yawn'
//           | 'sigh' | 'pant' | 'howl' | 'snore' | 'alert' | 'awe', n?, { far: 0..1, pan: -1..1, vol, pitch, delay })
//   dog.bark(t, { mood }) · dog.whine(t) · dog.yelp(t) · dog.growl(t, dur) · dog.yawn(t) · dog.snore(t) · dog.pant(t, n) · dog.howl(t)
const TAU = Math.PI * 2, rnd = (a, b) => a + Math.random() * (b - a);
const curve = (keys, u) => { for (let i = 0; i < keys.length - 1; i++) if (u <= keys[i + 1][0]) { const [u0, v0] = keys[i], [u1, v1] = keys[i + 1]; return v0 + (v1 - v0) * (u - u0) / Math.max(1e-6, u1 - u0); } return keys[keys.length - 1][1]; };
const BASE = 560;   // a German shepherd puppy's bark starts around here (Hz)
// how each mood shapes one bark: pitch, length, loudness, pitch arc (multiples of BASE), roughness [flutter Hz, depth], tilt of the harmonics, throat size, chest weight, rasp amount
const MOODS = {
  happy: { pitch: 1, dur: 0.14, vol: 1, arc: [[0, 0.9], [0.18, 1.1], [1, 0.62]], rough: [72, 0.3], tilt: 1.1, size: 1.08, chest: 0.35, noise: 1 },
  excited: { pitch: 1.42, dur: 0.085, vol: 0.9, arc: [[0, 0.85], [0.25, 1.22], [1, 0.82]], rough: [60, 0.14], tilt: 1.0, size: 1.2, chest: 0.2, noise: 0.6 },
  angry: { pitch: 0.82, dur: 0.2, vol: 1.1, arc: [[0, 1], [0.1, 1.06], [1, 0.55]], rough: [86, 0.55], tilt: 1.25, size: 0.98, chest: 0.55, noise: 1.35 },
  soft: { pitch: 0.95, dur: 0.13, vol: 0.8, arc: [[0, 0.9], [0.2, 1.05], [1, 0.66]], rough: [70, 0.2], tilt: 1.45, size: 1.08, chest: 0.3, noise: 0.5 },
  sheepish: { pitch: 0.9, dur: 0.15, vol: 0.5, arc: [[0, 0.88], [1, 0.7]], rough: [60, 0.1], tilt: 1.7, size: 1.05, chest: 0.3, noise: 0.35 },
  sleepy: { pitch: 0.78, dur: 0.24, vol: 0.4, arc: [[0, 0.85], [0.3, 1], [1, 0.6]], rough: [55, 0.2], tilt: 2.0, size: 0.95, chest: 0.5, noise: 0.25 }
};

export class DogVoice {
  constructor(ctx, out, verb) {
    this.c = ctx; this.waves = {};
    this.bus = ctx.createGain(); this.bus.gain.value = 0.9;
    const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -16; comp.knee.value = 12; comp.ratio.value = 3.5; comp.attack.value = 0.003; comp.release.value = 0.14;
    const tone = ctx.createBiquadFilter(); tone.type = 'lowpass'; tone.frequency.value = 5200; tone.Q.value = 0.5;   // the room and the microphone: no fizz above the throat
    this.bus.connect(tone); tone.connect(comp); comp.connect(out);
    this.send = ctx.createGain(); this.send.gain.value = 0.16; this.bus.connect(this.send);
    if (verb) this.send.connect(verb);
    else { const len = Math.round(ctx.sampleRate * 0.8), ir = ctx.createBuffer(2, len, ctx.sampleRate);   // a small room: a short, dark stereo tail
      for (let ch = 0; ch < 2; ch++) { const d = ir.getChannelData(ch); let lp = 0; for (let i = 0; i < len; i++) { lp += (Math.random() * 2 - 1 - lp) * 0.35; d[i] = lp * Math.pow(1 - i / len, 2.6); } }
      const cv = ctx.createConvolver(); cv.buffer = ir; this.send.connect(cv); cv.connect(out); }
    const nb = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate), nd = nb.getChannelData(0); for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1; this.nb = nb;
  }
  // real recordings (sounds/dog/list.js -> window.DOGSOUNDS = [{ mood, src }]): when there are any for a feeling, they are used instead of the model
  async loadSamples(list, base = '') {
    this.samples = this.samples || {};
    for (const { mood, src } of list || []) { try { const r = await fetch(new URL(base + src, location.href)); if (!r.ok) continue; const buf = await this.c.decodeAudioData(await r.arrayBuffer()); (this.samples[mood] = this.samples[mood] || []).push(buf); } catch (e) {} }
  }
  wave(tilt) { const k = tilt.toFixed(2); if (this.waves[k]) return this.waves[k]; const N = 32, re = new Float32Array(N + 1), im = new Float32Array(N + 1); for (let n = 1; n <= N; n++) im[n] = 1 / Math.pow(n, tilt); return (this.waves[k] = this.c.createPeriodicWave(re, im)); }
  // where a sound goes: level, how far away it is (duller and quieter), left / right
  tap(o = {}) {
    const c = this.c, g = c.createGain(), far = o.far || 0; g.gain.value = (o.gain ?? 1) * (1 - 0.7 * far); let n = g;
    if (far > 0.05) { const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 9000 - 7200 * far; n.connect(lp); n = lp; }
    if (o.pan && c.createStereoPanner) { const p = c.createStereoPanner(); p.pan.value = o.pan; n.connect(p); n = p; }
    n.connect(this.bus); return g;
  }
  // o: dur, f0 [[u, Hz]…], pitch, jit, vib [Hz, depth], rough [Hz, depth], tilt, form [[F start, F end, Q, gain]…], size, chest, att, hold/rel, vol, tp
  voiced(t, o) {
    const c = this.c, dur = o.dur, vol = (o.vol ?? 1) * 0.5, tp = o.tp || this.tap(o);
    const osc = c.createOscillator(); osc.setPeriodicWave(this.wave(o.tilt ?? 1.15));
    const n = Math.max(16, Math.round(dur * 160)), arr = new Float32Array(n);
    for (let i = 0; i < n; i++) { const u = i / (n - 1); let f = curve(o.f0, u) * (o.pitch ?? 1); f *= 1 + (Math.random() - 0.5) * (o.jit ?? 0.02); if (o.vib) f *= 1 + o.vib[1] * Math.sin(TAU * o.vib[0] * u * dur); arr[i] = Math.max(40, f); }
    osc.frequency.setValueCurveAtTime(arr, t, dur);
    const am = c.createGain(); am.gain.value = 1 - (o.rough ? o.rough[1] / 2 : 0); osc.connect(am);
    if (o.rough) { const lfo = c.createOscillator(), lg = c.createGain(); lfo.frequency.value = o.rough[0] * rnd(0.92, 1.08); lg.gain.value = o.rough[1] / 2; lfo.connect(lg); lg.connect(am.gain); lfo.start(t); lfo.stop(t + dur + 0.05); }
    const mix = c.createGain(), sz = o.size ?? 1;
    for (const [fa, fb, q, g] of o.form) { const f = c.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = q; f.frequency.setValueAtTime(fa * sz, t); f.frequency.linearRampToValueAtTime(fb * sz, t + dur); const gg = c.createGain(); gg.gain.value = g; am.connect(f); f.connect(gg); gg.connect(mix); }
    const ch = c.createBiquadFilter(), cg = c.createGain(); ch.type = 'lowpass'; ch.frequency.value = 520; cg.gain.value = o.chest ?? 0.35; am.connect(ch); ch.connect(cg); cg.connect(mix);   // the chest: the low harmonics straight through
    const amp = c.createGain(), at = o.att ?? 0.008; amp.gain.setValueAtTime(0.0001, t); amp.gain.linearRampToValueAtTime(vol, t + at);
    if (o.hold) amp.gain.setValueAtTime(vol, t + Math.max(at, dur - (o.rel ?? dur * 0.4)));
    amp.gain.exponentialRampToValueAtTime(0.0003, t + dur);
    mix.connect(amp); amp.connect(tp); osc.start(t); osc.stop(t + dur + 0.02);
  }
  // noise through a filter: the rasp at the front of a bark, breath
  rasp(t, dur, f, q, g, o = {}) {
    const c = this.c, s = c.createBufferSource(), fl = c.createBiquadFilter(), a = c.createGain(); s.buffer = this.nb; fl.type = o.type || 'bandpass'; fl.frequency.value = f; fl.Q.value = q;
    a.gain.setValueAtTime(0.0001, t); a.gain.linearRampToValueAtTime(g, t + Math.min(o.att ?? 0.01, dur * 0.3)); a.gain.exponentialRampToValueAtTime(0.0003, t + dur);
    s.connect(fl); fl.connect(a); a.connect(o.tp || this.tap(o)); s.start(t, Math.random() * 1.2); s.stop(t + dur + 0.02);
  }
  bark(t, o = {}) {
    const m = MOODS[o.mood || 'happy'], dur = m.dur * rnd(0.9, 1.12), vol = (o.vol ?? 1) * m.vol * 1.9 * (o.first === false ? rnd(0.8, 0.95) : 1), tp = o.tp || this.tap(o);
    this.voiced(t, { dur, vol, tp, pitch: (o.pitch ?? 1) * m.pitch * rnd(0.95, 1.07), f0: m.arc.map(([u, v]) => [u, v * BASE]), tilt: m.tilt, jit: 0.025, rough: m.rough, size: m.size, chest: m.chest, att: 0.007,
      form: [[820, 560, 7, 1.0], [1500, 1050, 8, 0.7], [2800, 2500, 9, 0.35]] });
    this.rasp(t, 0.055, 1900, 0.9, 0.2 * m.noise * vol, { tp }); this.rasp(t, dur * 1.15, 1000, 0.8, 0.07 * m.noise * vol, { tp });
    return dur;
  }
  whine(t, o = {}) {
    const dur = o.dur ?? 0.9, tp = o.tp || this.tap(o), s = o.pitch ?? 1;
    this.voiced(t, { dur, vol: (o.vol ?? 1) * 0.42, tp, pitch: s, f0: o.f0 || [[0, 720], [0.3, 1050], [1, 800]], tilt: 2.0, jit: 0.012, vib: [5.8, 0.025], size: 1, chest: 0.1, att: 0.09, hold: true, rel: dur * 0.4,
      form: [[900, 1000, 6, 1], [2300, 2500, 7, 0.5]] });
    this.rasp(t, dur, 2600, 0.8, 0.06 * (o.vol ?? 1), { tp, att: dur * 0.3 });
  }
  whimper(t, o = {}) { const k = o.n ?? 3; for (let i = 0; i < k; i++) this.whine(t + i * 0.34, { ...o, dur: 0.3, vol: (o.vol ?? 1) * (1 - i * 0.2), f0: [[0, 1000 - i * 40], [1, 640 - i * 30]] }); }
  yelp(t, o = {}) {
    const tp = o.tp || this.tap(o);
    this.voiced(t, { dur: 0.12, vol: (o.vol ?? 1) * 0.95, tp, pitch: (o.pitch ?? 1) * rnd(0.97, 1.05), f0: [[0, 800], [0.25, 1500], [1, 700]], tilt: 0.95, jit: 0.02, size: 1, chest: 0.15, att: 0.006, form: [[1100, 1300, 6, 1], [2600, 2800, 7, 0.6]] });
    this.rasp(t, 0.05, 3000, 1, 0.3, { tp });
  }
  growl(t, dur = 0.6, o = {}) {
    const tp = o.tp || this.tap(o);
    this.voiced(t, { dur, vol: (o.vol ?? 1) * 0.6, tp, f0: [[0, 95], [0.3, 118], [1, 84]], tilt: 0.9, jit: 0.06, rough: [26, 0.6], size: 1, chest: 0.8, att: 0.12, hold: true, rel: dur * 0.35,
      form: [[450, 520, 5, 1], [900, 850, 6, 0.7], [2200, 2000, 7, 0.25]] });
    this.rasp(t, dur, 700, 0.7, 0.2 * (o.vol ?? 1), { tp, att: dur * 0.3 });
  }
  huff(t, o = {}) { this.rasp(t, o.dur ?? 0.35, 900, 0.5, 0.32 * (o.vol ?? 1), { ...o, type: 'lowpass', att: 0.06 }); }
  yawn(t, o = {}) {
    const tp = o.tp || this.tap(o);
    this.voiced(t, { dur: 0.75, vol: (o.vol ?? 1) * 0.36, tp, f0: [[0, 350], [0.6, 820], [0.85, 700], [1, 420]], tilt: 1.8, jit: 0.015, vib: [4, 0.02], size: 1, chest: 0.2, att: 0.12, hold: true, rel: 0.3, form: [[700, 900, 5, 1], [1800, 2200, 6, 0.4]] });
    this.huff(t + 0.62, { tp, dur: 0.5, vol: 0.9 });
  }
  snore(t, o = {}) {   // one breath in, one out: a soft rattle in the throat
    const c = this.c, tp = o.tp || this.tap(o);
    for (const [dt, dur, g] of [[0, 0.7, 0.32], [0.95, 0.6, 0.2]]) {
      const s = c.createBufferSource(), lp = c.createBiquadFilter(), am = c.createGain(), lfo = c.createOscillator(), lg = c.createGain(), env = c.createGain(), t0 = t + dt;
      s.buffer = this.nb; lp.type = 'lowpass'; lp.frequency.value = 420; am.gain.value = 0.55; lfo.frequency.value = rnd(32, 40); lg.gain.value = 0.45; lfo.connect(lg); lg.connect(am.gain);
      env.gain.setValueAtTime(0.0001, t0); env.gain.linearRampToValueAtTime(g * (o.vol ?? 1), t0 + dur * 0.4); env.gain.exponentialRampToValueAtTime(0.0003, t0 + dur);
      s.connect(lp); lp.connect(am); am.connect(env); env.connect(tp); s.start(t0, Math.random() * 1.2); s.stop(t0 + dur + 0.02); lfo.start(t0); lfo.stop(t0 + dur + 0.02);
    }
  }
  pant(t, n = 6, o = {}) { const tp = o.tp || this.tap(o); for (let i = 0; i < n; i++) { this.rasp(t + i * 0.21, 0.14, 3200, 1.1, 0.1 * (o.vol ?? 1), { tp }); this.rasp(t + i * 0.21, 0.16, 700, 0.6, 0.06 * (o.vol ?? 1), { tp, type: 'lowpass' }); } }
  howl(t, o = {}) {
    const tp = o.tp || this.tap(o);
    this.voiced(t, { dur: 2.2, vol: (o.vol ?? 1) * 0.36, tp, f0: [[0, 420], [0.3, 720], [0.7, 680], [1, 430]], tilt: 1.9, jit: 0.01, vib: [5.5, 0.035], size: 1, chest: 0.15, att: 0.25, hold: true, rel: 0.8, form: [[600, 650, 5, 1], [1100, 1050, 6, 0.6]] });
    this.rasp(t, 2.2, 2400, 0.8, 0.05 * (o.vol ?? 1), { tp, att: 0.6 });
  }
  // a whole utterance for a mood
  say(mood = 'happy', n = null, o = {}) {
    const c = this.c; if (c.state === 'suspended' && c.resume) { try { const r = c.resume(); r && r.catch && r.catch(() => {}); } catch (e) {} }
    const t0 = c.currentTime + 0.02 + (o.delay || 0), tp = this.tap(o); o = { ...o, tp };
    const S = this.samples && this.samples[mood];
    if (S && S.length && !o.synth) { const s = c.createBufferSource(); s.buffer = S[(Math.random() * S.length) | 0]; s.playbackRate.value = (o.pitch ?? 1) * rnd(0.97, 1.04); s.connect(tp); s.start(t0); return; }
    let t = t0;
    switch (mood) {
      case 'happy': case 'soft': case 'sleepy': case 'sheepish': { const k = n || (mood === 'happy' ? 2 : 1); for (let i = 0; i < k; i++) { this.bark(t, { ...o, mood, first: i === 0 ? undefined : false, pitch: (o.pitch ?? 1) * (1 + i * 0.04) }); t += rnd(0.25, 0.32); }
        if (mood === 'sheepish') this.whine(t0 + 0.2, { ...o, dur: 0.5, vol: 0.5, pitch: 0.9 });
        if (mood === 'sleepy') this.whimper(t0 + 0.34, { ...o, n: 2, vol: 0.35 }); break; }
      case 'excited': { const k = n || 4; let gap = 0.17; for (let i = 0; i < k; i++) { this.bark(t, { ...o, mood: 'excited', first: i === 0 ? undefined : false, pitch: (o.pitch ?? 1) * (1 + i * 0.03) }); t += gap * rnd(0.9, 1.1); gap *= 0.94; } this.pant(t + 0.05, 2, { ...o, vol: 0.6 }); break; }
      case 'angry': { const k = n || 2; for (let i = 0; i < k; i++) { this.bark(t, { ...o, mood: 'angry', first: i === 0 ? undefined : false }); t += 0.3; } this.growl(t - 0.05, 0.35, { ...o, vol: 0.7 }); break; }
      case 'yelp': this.yelp(t0, o); if (n > 1) this.yelp(t0 + 0.28, { ...o, pitch: 0.92, vol: 0.8 }); break;
      case 'whine': this.whine(t0, o); break;
      case 'whimper': this.whimper(t0, o); break;
      case 'growl': this.growl(t0, 0.6 + (n || 0) * 0.2, o); break;
      case 'yawn': this.yawn(t0, o); break;
      case 'sigh': this.huff(t0, { ...o, dur: 0.5 }); break;
      case 'pant': this.pant(t0, n || 6, o); break;
      case 'howl': this.howl(t0, o); break;
      case 'snore': this.snore(t0, o); break;
      case 'alert': this.bark(t0, { ...o, mood: 'soft', vol: 0.8 }); this.whine(t0 + 0.3, { ...o, dur: 0.55, vol: 0.45, f0: [[0, 650], [1, 900]] }); break;   // “…who’s that?”
      case 'awe': this.whine(t0, { ...o, dur: 0.8, vol: 0.5, f0: [[0, 600], [0.7, 1000], [1, 900]] }); break;
      default: this.bark(t0, { ...o, mood: 'happy' });
    }
  }
}

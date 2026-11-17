// Sound: a generated ambient score (piano + bell partials through a reverb tail) that swells at the message,
// layered waves and wind, firework whoosh / boom / crackle, a candle breath and one heartbeat.
// An mp3 at config.music replaces the score. Mute is remembered.
const NOTE = n => 440 * Math.pow(2, (n - 69) / 12);
// D major: Dmaj9, Bm7, Gmaj7, A(sus4->3)
const CHORDS = [[50, 62, 66, 69, 73, 76], [47, 59, 62, 66, 69, 74], [43, 55, 59, 62, 66, 71], [45, 57, 62, 64, 69, 73]];
const MELODY = [78, 76, 74, 73, 74, 76, 81, 78, 76, 74, 71, 73, 74, 69, 71, 74];

export class FilmAudio {
  constructor(cfg) {
    this.cfg = cfg; this.ctx = null; this.muted = false; this.intensity = 0.25; this.melody = 0; this.started = false;
    try { this.muted = localStorage.getItem('film-muted') === '1'; } catch (e) {}
  }
  async start() {
    if (this.started) { this.ctx && this.ctx.resume(); return; }
    this.started = true;
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    const c = this.ctx = new AC(); c.resume();
    this.master = c.createGain(); this.master.gain.value = this.muted ? 0 : 0.9; this.master.connect(c.destination);
    // reverb: generated stereo impulse with an exponential tail
    const len = c.sampleRate * 3.4, ir = c.createBuffer(2, len, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) { const d = ir.getChannelData(ch); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2); }
    this.verb = c.createConvolver(); this.verb.buffer = ir; this.verbIn = c.createGain(); this.verbIn.gain.value = 0.6; this.verbIn.connect(this.verb); this.verb.connect(this.master);
    this.music = c.createGain(); this.music.gain.value = 0.0; this.music.connect(this.master); this.music.connect(this.verbIn);
    this.sfx = c.createGain(); this.sfx.gain.value = 0.9; this.sfx.connect(this.master); this.sfxVerb = c.createGain(); this.sfxVerb.gain.value = 0.35; this.sfx.connect(this.sfxVerb); this.sfxVerb.connect(this.verbIn);
    // noise buffers
    const nb = c.createBuffer(1, c.sampleRate * 4, c.sampleRate), nd = nb.getChannelData(0); let last = 0;
    for (let i = 0; i < nd.length; i++) { const w = Math.random() * 2 - 1; last = (last + 0.02 * w) / 1.02; nd[i] = last * 3.5; } // brown noise
    this.brown = nb;
    const wb = c.createBuffer(1, c.sampleRate * 2, c.sampleRate), wd = wb.getChannelData(0); for (let i = 0; i < wd.length; i++) wd[i] = Math.random() * 2 - 1; this.white = wb;
    // waves: brown noise, low-passed, slowly breathing
    const ws = c.createBufferSource(); ws.buffer = nb; ws.loop = true; const wf = c.createBiquadFilter(); wf.type = 'lowpass'; wf.frequency.value = 520;
    this.waveG = c.createGain(); this.waveG.gain.value = 0.0; ws.connect(wf); wf.connect(this.waveG); this.waveG.connect(this.master); ws.start();
    const lfo = c.createOscillator(), lg = c.createGain(); lfo.frequency.value = 0.11; lg.gain.value = 0.05; lfo.connect(lg); lg.connect(this.waveG.gain); lfo.start();
    // wind: band-passed white noise following the gusts
    const wn = c.createBufferSource(); wn.buffer = wb; wn.loop = true; this.windF = c.createBiquadFilter(); this.windF.type = 'bandpass'; this.windF.frequency.value = 650; this.windF.Q.value = 0.7;
    this.windG = c.createGain(); this.windG.gain.value = 0; wn.connect(this.windF); this.windF.connect(this.windG); this.windG.connect(this.master); wn.start();
    this.waveG.gain.setTargetAtTime(0.11, c.currentTime, 2);
    // music: an mp3 if one is provided, otherwise the generated score
    this.useFile = false;
    if (this.cfg.music) {
      try {
        const r = await fetch(this.cfg.music, { method: 'HEAD' });
        if (r.ok && /audio|mpeg|octet/.test(r.headers.get('content-type') || '')) {
          this.el = new Audio(this.cfg.music); this.el.loop = true; this.el.crossOrigin = 'anonymous';
          const src = c.createMediaElementSource(this.el); src.connect(this.music); this.el.play().catch(() => {}); this.useFile = true;
        }
      } catch (e) {}
    }
    this.music.gain.setTargetAtTime(this.useFile ? 0.55 : 0.5, c.currentTime, 1.5);
    if (!this.useFile) { this.beat = 0; this.nextT = c.currentTime + 0.3; this.timer = setInterval(() => this.schedule(), 90); }
  }
  setMuted(m) { this.muted = m; try { localStorage.setItem('film-muted', m ? '1' : '0'); } catch (e) {} if (this.master) this.master.gain.setTargetAtTime(m ? 0 : 0.9, this.ctx.currentTime, 0.15); }
  suspend(s) { if (!this.ctx) return; s ? this.ctx.suspend() : this.ctx.resume(); if (this.el) s ? this.el.pause() : this.el.play().catch(() => {}); }
  setWind(g) { if (this.windG) { this.windG.gain.setTargetAtTime(0.012 + g * 0.05, this.ctx.currentTime, 0.4); this.windF.frequency.setTargetAtTime(520 + g * 500, this.ctx.currentTime, 0.4); } }
  setNight(n) { if (this.waveG) this.waveG.gain.setTargetAtTime(0.11 - n * 0.04, this.ctx.currentTime, 2); }
  // ---------------- generated score
  schedule() {
    const c = this.ctx; if (!c || c.state !== 'running') return;
    const spb = 0.5;                                     // 120 eighth-notes per minute (60 bpm quarter)
    while (this.nextT < c.currentTime + 0.35) {
      const b = this.beat, bar = Math.floor(b / 8) % 4, ch = CHORDS[bar], i = b % 8, I = this.intensity;
      if (i === 0) this.note(NOTE(ch[0] - 12), this.nextT, 0.16 + I * 0.08, 4.5, 'bass');
      const pat = [1, 2, 3, 4, 3, 5, 2, 3], n = ch[pat[i] % ch.length] + (i === 5 && I > 0.5 ? 12 : 0);
      if (I > 0.12 || i % 2 === 0) this.note(NOTE(n), this.nextT, (0.07 + I * 0.07) * (i % 2 ? 0.75 : 1), 2.4, 'piano');
      if (I > 0.45 && i % 4 === 0) this.note(NOTE(ch[(i / 4 + 2) % ch.length] + 12), this.nextT + 0.01, 0.035 * I, 3.2, 'bell');
      if (this.melody > 0 && i % 2 === 0) { const m = MELODY[(Math.floor(b / 2)) % MELODY.length]; if (Math.random() < 0.75) this.note(NOTE(m), this.nextT, 0.06 * this.melody, 3.0, 'bell'); }
      if (i === 0 && I > 0.55) this.pad(ch, this.nextT, spb * 8, I);
      this.nextT += spb; this.beat++;
    }
  }
  note(f, t, v, dec, kind) {
    const c = this.ctx, g = c.createGain(), lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = kind === 'bass' ? 900 : 3600;
    const pan = c.createStereoPanner ? c.createStereoPanner() : null; if (pan) pan.pan.value = (Math.random() - 0.5) * 0.5;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v, t + 0.006); g.gain.exponentialRampToValueAtTime(0.0008, t + dec);
    const parts = kind === 'bell' ? [[1, 1], [2.76, 0.32], [5.4, 0.12], [8.9, 0.05]] : kind === 'bass' ? [[1, 1], [2, 0.25]] : [[1, 1], [2, 0.32], [3, 0.12], [4.02, 0.05]];
    for (const [m, a] of parts) { const o = c.createOscillator(), og = c.createGain(); o.frequency.value = f * m; og.gain.value = a; o.connect(og); og.connect(g); o.start(t); o.stop(t + dec + 0.1); }
    g.connect(lp); (pan ? (lp.connect(pan), pan) : lp).connect(this.music);
  }
  pad(ch, t, dur, I) {
    const c = this.ctx, g = c.createGain(), lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 700 + I * 900; lp.Q.value = 0.4;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.02 * I, t + dur * 0.4); g.gain.linearRampToValueAtTime(0, t + dur * 1.05);
    for (const n of [ch[0], ch[2], ch[3]]) for (const det of [-6, 6]) { const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = NOTE(n); o.detune.value = det; o.connect(g); o.start(t); o.stop(t + dur * 1.1); }
    g.connect(lp); lp.connect(this.music);
  }
  setIntensity(i, melody = 0) { this.intensity = i; this.melody = melody; if (this.useFile && this.music) this.music.gain.setTargetAtTime(0.4 + i * 0.3, this.ctx.currentTime, 1.5); }
  // ---------------- effects
  noise(dur, f0, f1, v, q = 1, type = 'bandpass', t = 0) {
    const c = this.ctx; if (!c) return; const s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain(), t0 = c.currentTime + t;
    s.buffer = this.white; s.loop = true; f.type = type; f.Q.value = q; f.frequency.setValueAtTime(f0, t0); f.frequency.exponentialRampToValueAtTime(f1, t0 + dur);
    g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(v, t0 + dur * 0.7); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    s.connect(f); f.connect(g); g.connect(this.sfx); s.start(t0); s.stop(t0 + dur + 0.05);
  }
  whoosh(dur) { if (!this.ctx) return; this.noise(dur, 320, 2600, 0.09, 1.4); const c = this.ctx, o = c.createOscillator(), g = c.createGain(), t = c.currentTime; o.frequency.setValueAtTime(700, t); o.frequency.exponentialRampToValueAtTime(2400, t + dur); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.012, t + dur * 0.8); g.gain.exponentialRampToValueAtTime(0.0001, t + dur); o.connect(g); g.connect(this.sfx); o.start(t); o.stop(t + dur + 0.05); }
  boom(k = 1) {
    const c = this.ctx; if (!c) return; const t = c.currentTime, o = c.createOscillator(), g = c.createGain();
    o.frequency.setValueAtTime(85, t); o.frequency.exponentialRampToValueAtTime(32, t + 0.7); g.gain.setValueAtTime(0.5 * k, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.9); o.connect(g); g.connect(this.sfx); o.start(t); o.stop(t + 1);
    this.noise(1.3, 1400, 200, 0.25 * k, 0.5, 'lowpass');
  }
  crackle() { if (!this.ctx) return; for (let i = 0; i < 14; i++) this.noise(0.03, 4200, 3000, 0.05 + Math.random() * 0.05, 0.8, 'highpass', Math.random() * 0.9); }
  breath() { if (!this.ctx) return; this.noise(0.7, 900, 300, 0.12, 0.6, 'lowpass'); }
  heartbeat() {
    const c = this.ctx; if (!c) return;
    for (const dt of [0, 0.3]) { const t = c.currentTime + dt, o = c.createOscillator(), g = c.createGain(); o.frequency.setValueAtTime(62, t); o.frequency.exponentialRampToValueAtTime(38, t + 0.16); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.55 * (dt ? 0.7 : 1), t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22); o.connect(g); g.connect(this.sfx); o.start(t); o.stop(t + 0.3); }
  }
}

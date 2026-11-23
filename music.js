// The page's music (window.Music). Two kinds of songs, one playlist:
//  1. her own songs: MP3s listed in CONFIG.songs (index.html), e.g. { title: "…", src: "songs/my-song.mp3" } – played first;
//  2. a few original Carnatic-style pieces, played live by a tiny Web Audio band: tanpura drone, veena or venu (flute),
//     mridangam and a little talam cymbal. Each tune is composed in a raga (Mohanam, Hamsadhwani, Kalyani, Sindhu Bhairavi,
//     Shuddha Dhanyasi) and a birthday song in Shankarabharanam (the melody of "Happy Birthday" is public domain).
// Music.play(prefer?) / Music.stop(slow) / Music.next() / Music.title / Music.onchange = title => …
(function () {
  const R = { S: 1, R1: 16 / 15, R2: 9 / 8, G2: 6 / 5, G3: 5 / 4, M1: 4 / 3, M2: 45 / 32, P: 3 / 2, D1: 8 / 5, D2: 5 / 3, N2: 16 / 9, N3: 15 / 8 };
  const RAGA = {
    mohanam: { S: R.S, R: R.R2, G: R.G3, P: R.P, D: R.D2 },
    hamsadhwani: { S: R.S, R: R.R2, G: R.G3, P: R.P, N: R.N3 },
    kalyani: { S: R.S, R: R.R2, G: R.G3, M: R.M2, P: R.P, D: R.D2, N: R.N3 },
    sindhubhairavi: { S: R.S, R: R.R2, G: R.G2, M: R.M1, P: R.P, D: R.D1, N: R.N2 },
    shuddhadhanyasi: { S: R.S, G: R.G2, M: R.M1, P: R.P, N: R.N2 },
    shankarabharanam: { S: R.S, R: R.R2, G: R.G3, M: R.M1, P: R.P, D: R.D2, N: R.N3 }
  };
  // tunes: one line = one talam cycle. "G:2" = Ga for 2 units, ".D" = lower octave, "S'" = upper, "-:4" = rest, "@flute" = this line's instrument
  const TRACKS = [
    { id: 'nilavu', title: 'Nilavu Thaalattu · a moon lullaby (Mohanam)', raga: 'mohanam', sa: 196, bpm: 66, unit: 0.5, cyc: 16, lead: 'flute', drums: 'soft', gam: 'GD',
      tune: ["G:2 P:2 D:2 P:2 G:2 R:2 S:4", "R:2 G:2 P:2 D:2 S':3 D:1 P:4", "D:2 S':2 R':2 S':2 D:2 P:2 G:4", "P:2 G:1 R:1 G:2 P:2 R:2 G:1 R:1 S:4",
        "S':4 D:2 S':2 R':2 G':2 R':4", "S':2 D:2 P:2 D:2 S':2 D:1 P:1 G:4", "G:2 P:2 D:2 S':2 D:2 P:1 G:1 R:4", "G:2 R:1 S:1 .D:2 R:2 S:8"],
      form: [0, 1, 2, 3, 0, 1, 2, 7, 4, 5, 6, 7, 0, 1, 2, 7] },
    { id: 'kaalai', title: 'Kaalai Malar · a morning flower (Hamsadhwani)', raga: 'hamsadhwani', sa: 220, bpm: 92, unit: 0.5, cyc: 16, lead: 'veena', drums: 'bright', gam: 'RN',
      tune: ["S:1 R:1 G:1 P:1 N:2 S':2 N:1 P:1 G:2 R:2 S:2", "G:1 P:1 N:1 S':1 R':2 S':2 N:2 P:1 N:1 S':4", "R':1 S':1 N:1 P:1 G:2 P:2 N:1 P:1 G:1 R:1 G:4", "P:2 G:1 R:1 S:2 .N:2 S:2 R:2 S:4",
        "@flute P:2 N:2 S':2 R':2 G':2 R':1 S':1 N:4", "@flute S':1 N:1 P:2 N:1 P:1 G:2 P:1 G:1 R:2 G:4", "G:1 P:1 N:1 S':1 G':2 R':2 S':2 N:2 S':4", "N:1 P:1 G:1 R:1 S:2 R:2 G:1 R:1 S:6"],
      form: [0, 1, 2, 3, 0, 1, 2, 7, 4, 5, 6, 7, 4, 5, 6, 7, 0, 1, 2, 7] },
    { id: 'maalai', title: 'Maalai Kaatru · the evening breeze (Kalyani)', raga: 'kalyani', sa: 207.65, bpm: 72, unit: 0.5, cyc: 16, lead: 'flute', drums: 'soft', gam: 'GMN',
      tune: ["P:2 M:1 G:1 M:2 P:2 D:2 N:2 D:1 P:1 M:2", "G:2 M:2 P:2 D:2 N:2 D:1 P:1 M:4", "N:2 S':2 R':2 S':2 N:1 D:1 P:2 D:4", "P:2 M:2 G:2 R:2 G:2 R:2 S:4",
        "@veena G:2 M:2 D:2 N:2 S':4 N:2 S':2", "@veena R':2 G':2 R':1 S':1 N:2 D:2 N:2 S':4", "S':2 N:2 D:2 P:2 M:2 D:2 P:4", "M:2 G:2 R:2 .N:2 R:2 G:2 S:4"],
      form: [0, 1, 2, 3, 0, 1, 2, 7, 4, 5, 6, 7, 0, 1, 2, 7] },
    { id: 'ninaivu', title: 'Ninaivugal · memories (Sindhu Bhairavi)', raga: 'sindhubhairavi', sa: 196, bpm: 60, unit: 0.5, cyc: 16, lead: 'veena', drums: 'soft', gam: 'GDN',
      tune: ["S:2 R:1 G:1 M:2 P:2 D:2 P:1 M:1 G:4", "M:2 G:1 R:1 G:2 M:2 R:2 S:1 .N:1 S:4", "P:2 D:2 N:2 S':2 N:2 D:1 P:1 D:4", "P:2 M:2 G:1 M:1 P:2 G:2 R:2 S:4",
        "@flute S':2 N:2 S':2 R':2 G':2 R':1 S':1 N:4", "@flute D:2 N:2 S':2 N:1 D:1 P:2 D:2 P:4", "M:2 P:2 D:2 P:1 M:1 G:2 M:2 G:1 R:1 S:2", ".N:2 S:2 R:2 G:2 R:2 .N:2 S:4"],
      form: [0, 1, 2, 3, 4, 5, 6, 7, 0, 1, 2, 3, 4, 5, 6, 7] },
    { id: 'punnagai', title: 'Siru Punnagai · a little smile (Shuddha Dhanyasi)', raga: 'shuddhadhanyasi', sa: 220, bpm: 86, unit: 0.5, cyc: 16, lead: 'veena', drums: 'bright', gam: 'GN',
      tune: ["S:1 G:1 M:1 P:1 N:2 P:2 M:2 P:1 M:1 G:4", "G:1 M:1 P:1 N:1 S':2 N:2 P:2 M:1 P:1 N:4", "S':2 N:1 P:1 N:2 S':2 G':2 M':1 G':1 S':4", "N:2 P:2 M:2 G:2 M:2 G:1 .N:1 S:4",
        "@flute P:2 N:2 S':2 G':2 M':2 G':1 S':1 N:4", "@flute S':1 N:1 P:2 N:1 P:1 M:2 P:1 M:1 G:2 M:4", "G:2 M:2 P:2 N:2 S':2 N:2 P:4", "M:1 G:1 M:2 G:1 S:1 .N:2 S:8"],
      form: [0, 1, 2, 3, 0, 1, 2, 7, 4, 5, 6, 7, 4, 5, 6, 7, 0, 1, 2, 7] },
    { id: 'birthday', title: 'Piranthanaal Vaazhthu · happy birthday (Shankarabharanam)', raga: 'shankarabharanam', sa: 261.63, bpm: 96, unit: 0.25, cyc: 12, lead: 'veena', drums: 'rupaka', gam: '',
      tune: ["-:8 .P:3 .P:1 .D:4 .P:4 S:4 .N:8 .P:3 .P:1 .D:4 .P:4 R:4 S:8 .P:3 .P:1 P:4 G:4 S:4 .N:4 .D:4 M:3 M:1 G:4 S:4 R:4 S:12",
        "@flute -:8 P:3 P:1 D:4 P:4 S':4 N:8 P:3 P:1 D:4 P:4 R':4 S':8 P:3 P:1 P':4 G':4 S':4 N:4 D:4 M':3 M':1 G':4 S':4 R':4 S':12"],
      form: [0, 1, 0] }
  ];
  // mridangam patterns: step -> strokes (one step = one tune unit)
  const DRUMS = {
    soft: { 0: ['thom', 'ting'], 3: ['ki'], 4: ['nam'], 6: ['ki'], 8: ['dhi', 'ting'], 10: ['ki'], 12: ['nam'], 14: ['ta'] },
    bright: { 0: ['thom', 'nam', 'ting'], 2: ['ki'], 3: ['ta'], 4: ['dhi'], 6: ['nam'], 7: ['ki'], 8: ['thom', 'ting'], 10: ['ta'], 11: ['ka'], 12: ['dhi'], 14: ['nam'], 15: ['ki'] },
    rupaka: { 0: ['thom', 'ting'], 4: ['nam'], 6: ['ki'], 8: ['dhi'], 10: ['ki'] }
  };

  let ac = null, out, dry, wet, an = null, waves = {}, noise = null;
  let cfg = [], list = [], idx = -1, playing = false, el = null, timer = 0, st = null, fadeT = 0;
  const M = { onchange: null, get title() { return idx >= 0 && list[idx] ? list[idx].title : ''; }, get playing() { return playing; } };

  function ensure() {
    if (ac) return true;
    try { ac = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return false; }
    out = ac.createGain(); out.gain.value = 0; const comp = ac.createDynamicsCompressor(); comp.threshold.value = -16; comp.ratio.value = 3; out.connect(comp); comp.connect(ac.destination); an = ac.createAnalyser(); an.fftSize = 2048; comp.connect(an);
    dry = ac.createGain(); dry.gain.value = 1; dry.connect(out);
    // a soft hall: a generated impulse response
    const len = Math.floor(ac.sampleRate * 2.2), ir = ac.createBuffer(2, len, ac.sampleRate);
    for (let c = 0; c < 2; c++) { const d = ir.getChannelData(c); for (let i = 0; i < len; i++) { const t = i / ac.sampleRate; d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6) * (t < 0.012 ? t / 0.012 : 1) * 0.6; } }
    const conv = ac.createConvolver(); conv.buffer = ir; wet = ac.createGain(); wet.gain.value = 0.3; dry.connect(conv); conv.connect(wet); wet.connect(out);
    const wave = h => { const re = new Float32Array(h.length + 1), im = new Float32Array(h.length + 1); h.forEach((a, i) => { im[i + 1] = a; }); return ac.createPeriodicWave(re, im); };
    waves.veena = wave([1, 0.62, 0.46, 0.32, 0.25, 0.17, 0.12, 0.08, 0.05, 0.03]);
    waves.flute = wave([1, 0.32, 0.1, 0.04, 0.02]);
    waves.tanpura = wave([1, 0.7, 0.55, 0.45, 0.38, 0.3, 0.26, 0.2, 0.16, 0.12, 0.1, 0.08]);
    waves.drum = wave([1, 0.5, 0.33, 0.2, 0.1]);
    noise = ac.createBuffer(1, ac.sampleRate, ac.sampleRate); const nd = noise.getChannelData(0); for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
    document.addEventListener('visibilitychange', () => { if (!ac) return; if (document.hidden) { ac.suspend && ac.suspend(); if (el && !el.paused) { el.pause(); el._was = true; } } else if (playing) { ac.resume(); if (el && el._was) { el._was = false; el.play().catch(() => {}); } } });
    return true;
  }

  // ---------------------------------------------------------------- the band (each generated track plays into its own bus)
  const bus = () => (st && st.bus) || dry;
  function env(g, t, a, peak, d, hold = 0) { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + a); if (hold) g.gain.setValueAtTime(peak, t + a + hold); g.gain.exponentialRampToValueAtTime(0.0001, t + a + hold + d); }
  function lead(kind, t, f, dur, prev, gam) {
    const o = ac.createOscillator(), g = ac.createGain(); o.setPeriodicWave(waves[kind === 'flute' ? 'flute' : 'veena']);
    const slide = prev && Math.abs(Math.log(f / prev)) > 0.2;
    if (slide) { o.frequency.setValueAtTime(prev, t); o.frequency.exponentialRampToValueAtTime(f, t + 0.08); } else o.frequency.setValueAtTime(f, t);
    if (gam && dur > 0.4) {   // kampita: a slow sway up toward the next swara and back
      const n = 32, cyc = dur > 1 ? 3 : 2, c = new Float32Array(n), depth = kind === 'flute' ? 0.35 : 0.7;
      for (let i = 0; i < n; i++) c[i] = f * (1 + (gam / f - 1) * depth * 0.5 * (1 - Math.cos(2 * Math.PI * cyc * i / (n - 1))));
      try { o.frequency.setValueCurveAtTime(c, t + (slide ? 0.1 : 0.06), dur * 0.62); } catch (e) {}
    }
    if (kind === 'flute') {
      const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = f * 5; o.connect(lp); lp.connect(g);
      env(g, t, 0.07, 0.15, 0.16, Math.max(0, dur - 0.14));
      if (!gam && dur > 0.45) { const lfo = ac.createOscillator(), lg = ac.createGain(); lfo.frequency.value = 5.2; lg.gain.setValueAtTime(0, t); lg.gain.linearRampToValueAtTime(f * 0.006, t + 0.35); lfo.connect(lg); lg.connect(o.frequency); lfo.start(t); lfo.stop(t + dur + 0.3); }
      const b = ac.createBufferSource(), bf = ac.createBiquadFilter(), bg = ac.createGain(); b.buffer = noise; bf.type = 'bandpass'; bf.frequency.value = f * 2.2; bf.Q.value = 2; env(bg, t, 0.05, 0.012, 0.12, Math.max(0, dur - 0.1)); b.connect(bf); bf.connect(bg); bg.connect(bus()); b.start(t); b.stop(t + dur + 0.3);
    } else {
      const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 1.4; lp.frequency.setValueAtTime(Math.min(9000, f * 14), t); lp.frequency.exponentialRampToValueAtTime(Math.max(500, f * 3), t + 0.5); o.connect(lp); lp.connect(g);
      env(g, t, 0.004, 0.2, Math.max(0.6, dur * 1.25));
    }
    g.connect(bus()); o.start(t); o.stop(t + dur + 1.6);
  }
  function tanpura(t, f) {
    const o = ac.createOscillator(), o2 = ac.createOscillator(), lp = ac.createBiquadFilter(), g = ac.createGain();
    o.setPeriodicWave(waves.tanpura); o2.setPeriodicWave(waves.tanpura); o.frequency.value = f; o2.frequency.value = f * 1.0018;
    lp.type = 'lowpass'; lp.Q.value = 3; lp.frequency.setValueAtTime(f * 16, t); lp.frequency.exponentialRampToValueAtTime(f * 5, t + 2.6);
    o.connect(lp); o2.connect(lp); lp.connect(g); g.connect(bus()); env(g, t, 0.05, 0.035, 4.2); o.start(t); o2.start(t); o.stop(t + 4.5); o2.stop(t + 4.5);
  }
  function stroke(t, kind, sa, v = 1) {
    const tone = (f0, f1, a, d, peak, wave) => { const o = ac.createOscillator(), g = ac.createGain(); if (wave) o.setPeriodicWave(waves.drum); else o.type = 'sine'; o.frequency.setValueAtTime(f0, t); if (f1) o.frequency.exponentialRampToValueAtTime(f1, t + d * 0.6); env(g, t, a, peak * v, d); o.connect(g); g.connect(bus()); o.start(t); o.stop(t + a + d + 0.05); };
    const click = (f, d, peak) => { const b = ac.createBufferSource(), bf = ac.createBiquadFilter(), g = ac.createGain(); b.buffer = noise; bf.type = 'bandpass'; bf.frequency.value = f; bf.Q.value = 1.6; env(g, t, 0.002, peak * v, d); b.connect(bf); bf.connect(g); g.connect(bus()); b.start(t, Math.random() * 0.5); b.stop(t + d + 0.05); };
    if (kind === 'thom') tone(118, 62, 0.004, 0.42, 0.3);
    else if (kind === 'nam') { tone(sa * 2, 0, 0.003, 0.32, 0.11, true); click(2800, 0.03, 0.05); }
    else if (kind === 'dhi') { tone(sa * 2, 0, 0.003, 0.62, 0.1, true); tone(sa, 0, 0.003, 0.5, 0.05); click(2200, 0.03, 0.04); }
    else if (kind === 'ting') { for (const f of [3150, 4420, 5810]) tone(f, 0, 0.002, 0.55, 0.012); }
    else { click(kind === 'ka' ? 1800 : 2500, 0.035, 0.09); tone(sa * 4, 0, 0.002, 0.05, 0.03); }
  }

  // ---------------------------------------------------------------- parsing and scheduling a generated tune
  function parse(line, raga) {
    const notes = []; let ld = null;
    for (const tok of line.trim().split(/\s+/)) {
      if (tok[0] === '@') { ld = tok.slice(1); continue; }
      const m = /^(\.?)([SRGMPDN-])('?)(?::(\d+))?$/.exec(tok); if (!m) continue;
      const d = +(m[4] || 1); if (m[2] === '-') { notes.push({ r: 0, d }); continue; }
      const r = raga[m[2]]; if (!r) continue; notes.push({ r: r * (m[1] ? 0.5 : 1) * (m[3] ? 2 : 1), d, sw: m[2] });
    }
    return { notes, lead: ld };
  }
  function upFrom(raga, r) { const base = Object.values(raga).sort((a, b) => a - b), all = [0.25, 0.5, 1, 2, 4].flatMap(m => base.map(x => x * m)).sort((a, b) => a - b); return all.find(x => x > r * 1.001) || r * 9 / 8; }
  function startGen(tr) {
    const raga = RAGA[tr.raga], beat = 60 / tr.bpm, u = beat * tr.unit, lines = tr.tune.map(l => parse(l, raga)), t0 = ac.currentTime + 0.15;
    const b = ac.createGain(); b.gain.value = 1; b.connect(dry);
    st = { tr, raga, u, lines, li: 0, ni: 0, mt: t0 + 4.2, dt: t0 + 4.2, step: 0, tt: t0, ts: 0, prev: 0, end: 0, done: false, bus: b };
  }
  function pump() {
    if (!playing || !st || !ac) return;
    const ahead = ac.currentTime + 1.2, s = st, tr = s.tr, sa = tr.sa;
    while (s.tt < ahead && !s.end) { tanpura(s.tt, [sa * 0.75, sa, sa, sa * 0.5][s.ts % 4]); s.ts++; s.tt += 1.3; }   // Pa, Sa, Sa, low Sa
    while (!s.done && s.mt < ahead) {
      const L = s.lines[tr.form[s.li]], n = L.notes[s.ni], dur = n.d * s.u;
      if (n.r) { const f = n.r * sa, gam = tr.gam.includes(n.sw) && n.d >= 2 ? upFrom(s.raga, n.r) * sa : 0; lead(L.lead || tr.lead, s.mt, f, dur * 0.97, s.prev, gam); s.prev = f; }
      s.mt += dur; s.ni++;
      if (s.ni >= L.notes.length) { s.ni = 0; s.li++; if (s.li >= tr.form.length) { s.done = true; s.end = s.mt + 3.2; } }
    }
    const pat = DRUMS[tr.drums];
    while (s.dt < Math.min(ahead, s.done ? s.end - 2.6 : Infinity)) { const hits = pat[s.step % tr.cyc]; if (hits) for (const h of hits) stroke(s.dt, h, sa, s.step < tr.cyc ? 0.6 : 1); s.step++; s.dt += s.u; }
    if (s.done && ac.currentTime > s.end) { st = null; advance(1); }
  }

  // ---------------------------------------------------------------- the playlist
  function build() { list = cfg.filter(x => x && x.src).map(x => ({ title: x.title || x.src.split('/').pop().replace(/\.[a-z0-9]+$/i, ''), src: x.src })).concat(TRACKS); }
  function begin(i) {
    stopCurrent(); idx = ((i % list.length) + list.length) % list.length; const tr = list[idx];
    if (tr.src) {
      el = new Audio(tr.src); el.preload = 'auto'; el.volume = 0.85;
      el.onended = () => advance(1); el.onerror = () => { el = null; advance(1); };
      el.play().catch(() => {});
    } else startGen(tr);
    if (M.onchange) M.onchange(M.title);
  }
  function stopCurrent() { if (st && st.bus) { const b = st.bus; b.gain.setTargetAtTime(0, ac.currentTime, 0.08); setTimeout(() => { try { b.disconnect(); } catch (e) {} }, 1500); } st = null; if (el) { el.onended = el.onerror = null; el.pause(); el.removeAttribute('src'); try { el.load(); } catch (e) {} el = null; } }
  function advance(d) { if (!playing) return; begin(idx + d); }
  M.setSongs = songs => { cfg = Array.isArray(songs) ? songs : []; build(); };
  M.play = prefer => {
    if (!ensure()) return; ac.resume(); clearTimeout(fadeT); if (!list.length) build();
    out.gain.cancelScheduledValues(ac.currentTime); out.gain.setTargetAtTime(0.75, ac.currentTime, 0.5);
    const want = prefer ? list.findIndex(x => x.id === prefer) : -1;
    if (!playing) { playing = true; timer = setInterval(pump, 200); begin(want >= 0 ? want : idx < 0 ? 0 : idx); }
    else if (want >= 0 && want !== idx) begin(want);
    else if (el && el.paused) el.play().catch(() => {});
  };
  M.stop = slow => {
    if (!ac || !playing) return; playing = false; clearInterval(timer);
    out.gain.cancelScheduledValues(ac.currentTime); out.gain.setTargetAtTime(0, ac.currentTime, slow ? 0.6 : 0.06);
    if (el) el.pause();
    clearTimeout(fadeT); fadeT = setTimeout(() => { if (!playing) { stopCurrent(); try { ac.suspend(); } catch (e) {} } }, slow ? 2600 : 400);
  };
  M.next = () => { if (playing) begin(idx + 1); };
  M._level = () => { if (!an) return 0; const a = new Float32Array(an.fftSize); an.getFloatTimeDomainData(a); let m = 0; for (const v of a) m = Math.max(m, Math.abs(v)); return m; };   // for testing
  window.Music = M;
})();

// Snowki and Jessi play together while she waits on the countdown: 52 little games with props, particles and tiny sounds,
// and a nap (with Jessi's dream cloud) after every five. guide.js owns the two rigs and draws them; this module only directs
// them and draws the props. Tap Jessi to skip to the next game.
//
//   const play = makePlay(api); play.start(); play.update(dt); play.drawBack(ctx); play.drawFront(ctx); play.skip(); play.stop();
//
// api: { bear, pup (the rigs), G (guide state; G.po = Snowki's offset { x, y, r, s } from his spot), J (Jessi: x, face, fx, ox, oy, L),
//        say(text, ms), woof(n), sc(), bk() (Snowki's draw scale), W(), H(), tod() -> 'night'|'morning'|'day'|'dusk', days(),
//        audio() -> AudioContext|null (only while her sound is on), nap(on), busy() (he is being dragged or is flying),
//        free(w, h, x, y) -> [x, y] a spot clear of the words, cdBottom() (the bottom of the countdown digits) }

const TAU = Math.PI * 2;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v)), lerp = (a, b, t) => a + (b - a) * t;
const ease = t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2), lin = t => t;
const pick = a => a[(Math.random() * a.length) | 0];
const COLS = ['#FF7AA5', '#FFD27A', '#8EC9FF', '#B9A3FF', '#9BE37A', '#FF9F6A'];

// one soft glow sprite for fireflies, stars and the candle (no per-frame gradients)
const GLOW = (() => { if (typeof document === 'undefined') return null; const c = document.createElement('canvas'); c.width = c.height = 32; const x = c.getContext('2d'), g = x.createRadialGradient(16, 16, 0, 16, 16, 16);
  g.addColorStop(0, 'rgba(255,244,190,1)'); g.addColorStop(0.35, 'rgba(255,230,150,.55)'); g.addColorStop(1, 'rgba(255,220,140,0)'); x.fillStyle = g; x.fillRect(0, 0, 32, 32); return c; })();

export function makePlay(api) {
  const { bear, pup, G, J } = api;
  const P = { on: false, act: null, t: 0, beats: [], ticks: [], props: [], parts: [], pops: [], tw: [], n: 0, done: 0, order: [], title: '', titleT: 9, napping: false, napped: false,
    after: 0, flash: 0, look: null, ride: null, riding: false, unride: null, umb: null };
  const s = () => api.sc(), k = () => api.bk(), L = () => J.L, U = () => 40 * api.sc();
  const N = () => { const t = api.tod(); return t === 'night' || t === 'dusk'; };

  // ---------------------------------------------------------------- tweens (with an optional callback when they finish)
  function tween(o, key, to, dur, ez = ease, done) {
    P.tw = P.tw.filter(w => !(w.o === o && w.k === key));
    P.tw.push({ o, k: key, from: o[key] || 0, to, t: 0, dur: Math.max(0.01, dur), ez, done });
  }
  function tweenFn(o, key, dur, fn, done) { P.tw = P.tw.filter(w => !(w.o === o && w.k === key)); P.tw.push({ o, k: key, t: 0, dur: Math.max(0.01, dur), ez: lin, fn, done }); }
  function stepTweens(dt) {
    const fin = [];
    for (const w of P.tw) { w.t += dt / w.dur; const e = w.ez(clamp(w.t, 0, 1)); w.o[w.k] = w.fn ? w.fn(e) : lerp(w.from, w.to, e); if (w.t >= 1) fin.push(w); }
    if (fin.length) { P.tw = P.tw.filter(w => w.t < 1); for (const w of fin) if (w.done) w.done(); }
  }

  // ---------------------------------------------------------------- where things are on screen (px), through the rigs' own transforms
  function snow(x, y, mode) {   // a point on Snowki in rig units -> screen. mode: 'head' (head space), 'raw' (already lifted), else body space
    const S = bear.s, BP = bear.P || {}, lift = S.lift.x; let px = x, py = y;
    if (mode === 'head') { const c = Math.cos(S.tilt.x), n = Math.sin(S.tilt.x); px = x * c - (y + 40) * n; py = -40 - lift + S.drop.x + x * n + (y + 40) * c; }
    else if (mode !== 'raw') py = y - lift;
    const sq = S.squash.x; px *= (1 + sq) * S.spin.x; py *= 1 - sq;
    const l = S.lean.x, cl = Math.cos(l), sl = Math.sin(l), K = k() * (G.po.s || 1);
    let X = (px * cl - py * sl) * K, Y = (px * sl + py * cl - (BP.hop || 0)) * K;
    const r = G.po.r || 0; if (r) { const cy = -48 * K, c = Math.cos(r), n = Math.sin(r), dy = Y - cy, X2 = X * c - dy * n; Y = cy + X * n + dy * c; X = X2; }
    return [G.x + X, G.y + Y];
  }
  const fxB = () => bear.s.turn.x * 8, fyB = () => bear.s.nod.x * 3;
  const SN = {
    hands: () => { const S = bear.s; return snow((S.armL.p[0] + S.armR.p[0]) / 2, -36 - S.lift.x + (S.armL.p[1] + S.armR.p[1]) / 2 - 4, 'raw'); },
    handL: () => { const S = bear.s; return snow(-17.5 + S.armL.p[0], -36 - S.lift.x + S.armL.p[1], 'raw'); },
    head: () => snow(fxB() * 0.5, -66, 'head'), top: () => snow(fxB() * 0.45, -93, 'head'), above: () => snow(0, -122, 'head'),
    eyes: () => snow(fxB(), -69 + fyB(), 'head'), mouth: () => snow(fxB() * 1.22, -53 + fyB() * 1.2, 'head'),
    ang: () => bear.s.lean.x + bear.s.tilt.x + (G.po.r || 0), half: () => 32 * k() * (G.po.s || 1)
  };
  function pt(lx, ly) {   // a point on Jessi in rig units -> screen, through her hop / flip / turn / roll
    const X = pup.cache || pup.xf(), com = X.B(0, 1); let x = lx, y = ly;
    const rot = (a, c) => { const dx = x - c[0], dy = y - c[1], cs = Math.cos(a), sn = Math.sin(a); x = c[0] + dx * cs - dy * sn; y = c[1] + dx * sn + dy * cs; };
    if (pup.wig) rot(pup.wig, com);
    if (pup.sy !== 1) { const q = Math.sign(pup.sy || 1) * Math.max(0.3, Math.abs(pup.sy)), yc = X.by - 0.4; y = yc + (y - yc) * q; }
    if (pup.sx !== 1) x *= Math.sign(pup.sx || 1) * Math.max(0.42, Math.abs(pup.sx));
    if (pup.roll) rot(pup.roll, com);
    y -= pup.hop || 0;
    const l = L(); return [J.x + x * l.ps * (J.fx || J.face), l.gy - (J.oy || 0) + y * l.ps];
  }
  const JE = {
    H: (x, y) => { const p = (pup.cache || pup.xf()).H(x, y); return pt(p[0], p[1]); }, B: (x, y) => { const p = (pup.cache || pup.xf()).B(x, y); return pt(p[0], p[1]); },
    nose: () => JE.H(21, -10.4), mouth: () => JE.H(19.4, -6.6), eye: () => JE.H(11.6, -12.6), top: () => JE.H(7.2, -20.4), head: () => JE.H(8, -12.5),
    back: () => JE.B(-2, -10.4), paw: () => pt(21.5, -16.5), ang: () => ((J.fx || J.face) < 0 ? -1 : 1) * ((pup.cache || pup.xf()).ha + (pup.roll || 0) + (pup.wig || 0))
  };
  const mid = () => [(G.x + J.x) / 2, L().gy - 44 * s()];
  const gapX = () => ((J.x + 34 * L().ps) + (G.x - SN.half())) / 2;   // the open ground between her nose and him
  const free = (w, h, x, y) => api.free(w, h, x, y);                  // open sky near (x, y), clear of the words
  // the control point of a throw from a to b that rises `lift` px but never above the countdown digits
  const arcC = (a, b, lift) => { const top = Math.max(api.cdBottom() + 24 * s(), Math.min(a[1], b[1]) - lift); return [(a[0] + b[0]) / 2, 2 * top - (a[1] + b[1]) / 2]; };

  // ---------------------------------------------------------------- moving the two of them (offsets in "steps" of 40 px x scale from home)
  const bx = d => clamp(L().snowX + d * U(), 46 * s(), api.W() - 46 * s()) - L().snowX;
  const px = d => clamp(L().pupX + d * U(), 40 * L().ps, api.W() - 40 * L().ps) - L().pupX;
  function bearTo(dx, dy, dur, act = 'walk', end = 'idle', o = {}) {
    const to = bx(dx), dir = Math.sign(to - (G.po.x || 0)) || 1;
    tween(G.po, 'x', to, dur); tween(G.po, 'y', (dy || 0) * U(), dur, ease, end ? () => bear.act(end, { restart: true, ...(o.endO || {}) }) : null);
    if (act) bear.act(act, { restart: true, dir: [dir, 0], ...(o.o || {}) });
  }
  function faceBear() { J.face = G.x >= J.x ? 1 : -1; }
  function pupTo(d, dur, end = 'stand', o = {}) {
    const to = px(d), dist = to - (J.ox || 0), l = L();
    const arrive = () => { if (o.face === 'bear') faceBear(); else if (o.face) J.face = o.face; if (end) pup.act(end, { restart: true, ...(o.endO || {}) }); };
    if (Math.abs(dist) < 2) { arrive(); return; }
    if (!o.back) J.face = dist > 0 ? 1 : -1;
    const v = Math.abs(dist) / dur / l.ps;   // rig units per second: the gait plants her paws at exactly this speed
    pup.act(o.act || (v < 70 ? 'walk' : 'run'), { restart: true, vx: v });
    tween(J, 'ox', to, dur, lin, arrive);
  }
  function pupHop(h, dur) { tweenFn(J, 'oy', dur, e => Math.sin(e * Math.PI) * h * U(), () => { J.oy = 0; }); }

  // ---------------------------------------------------------------- props, particles, floating words, little sounds
  function prop(kind, o = {}) { const p = { kind, x: 0, y: 0, rot: 0, s: 1, a: 1, t: 0, vx: 0, vy: 0, g: 0, life: 1e9, layer: 'front', ...o }; P.props.push(p); return p; }
  function fade(p, d = 0.5) { if (p) p.life = Math.min(p.life, d); }
  function burst(kind, at, n = 10, o = {}) {
    const [x, y] = typeof at === 'function' ? at() : at;
    for (let i = 0; i < n && P.parts.length < 520; i++) { const a = (o.a0 ?? -Math.PI) + Math.random() * (o.spread ?? Math.PI), v = (o.v ?? 120) * (0.4 + Math.random() * 0.8) * s();
      P.parts.push({ kind, x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, g: (o.g ?? 160) * s(), life: (o.life ?? 1.2) * (0.7 + Math.random() * 0.6), t: 0, r: Math.random() * TAU, vr: (Math.random() - 0.5) * 8, c: o.c || pick(COLS), sz: (o.sz ?? 1) * (0.7 + Math.random() * 0.6), wob: Math.random() * TAU }); }
  }
  function weather(kind, t0, t1, rate) {
    P.ticks.push({ t0, t1, f: dt => { for (let i = 0; i < rate * dt && P.parts.length < 520; i++) P.parts.push({ kind, x: Math.random() * api.W(), y: -10, vx: 0, vy: (kind === 'rain' ? 560 : 45) * s(), g: 0, life: 12, t: 0, r: Math.random() * TAU, vr: (Math.random() - 0.5) * 3, c: '#fff', sz: 0.7 + Math.random() * 0.6, wob: Math.random() * TAU }); } });
  }
  function pop(text, at, o = {}) { const [x, y] = typeof at === 'function' ? at() : at; P.pops.push({ text, x, y, t: 0, life: o.life || 1.3, c: o.c || '#FFF3C8', k: Math.random() }); }
  let noiseBuf = null;
  function sfx(name) {
    const ac = api.audio(); if (!ac) return;
    try {
      const t0 = ac.currentTime + 0.01, out = ac.createGain(); out.gain.value = 0.8; out.connect(ac.destination);
      const tone = (type, f0, f1, a, d, v, at = 0) => { const o = ac.createOscillator(), g = ac.createGain(); o.type = type; o.frequency.setValueAtTime(f0, t0 + at); if (f1) o.frequency.exponentialRampToValueAtTime(f1, t0 + at + a + d * 0.8);
        g.gain.setValueAtTime(0.0001, t0 + at); g.gain.exponentialRampToValueAtTime(v, t0 + at + a); g.gain.exponentialRampToValueAtTime(0.0001, t0 + at + a + d); o.connect(g); g.connect(out); o.start(t0 + at); o.stop(t0 + at + a + d + 0.05); return o; };
      const noise = (f, q, d, v, at = 0) => { if (!noiseBuf) { noiseBuf = ac.createBuffer(1, ac.sampleRate * 0.5, ac.sampleRate); const ch = noiseBuf.getChannelData(0); for (let i = 0; i < ch.length; i++) ch[i] = Math.random() * 2 - 1; }
        const n = ac.createBufferSource(), b = ac.createBiquadFilter(), g = ac.createGain(); n.buffer = noiseBuf; b.type = 'bandpass'; b.frequency.value = f; b.Q.value = q;
        g.gain.setValueAtTime(v, t0 + at); g.gain.exponentialRampToValueAtTime(0.0001, t0 + at + d); n.connect(b); b.connect(g); g.connect(out); n.start(t0 + at); n.stop(t0 + at + d + 0.05); };
      ({
        pop: () => tone('sine', 900, 300, 0.005, 0.09, 0.12), blip: () => tone('sine', 1400, 900, 0.004, 0.06, 0.05),
        boing: () => tone('triangle', 220, 660, 0.01, 0.28, 0.09),
        whoosh: () => noise(900, 0.7, 0.4, 0.05), chime: () => { tone('sine', 1318, 0, 0.005, 0.8, 0.07); tone('sine', 1976, 0, 0.005, 0.6, 0.035, 0.08); },
        drum: () => { tone('sine', 160, 55, 0.004, 0.22, 0.22); noise(1800, 1, 0.04, 0.04); }, click: () => { noise(3000, 1, 0.05, 0.12); tone('square', 1800, 0, 0.002, 0.03, 0.03); },
        sparkle: () => { [1568, 2093, 2637].forEach((f, i) => tone('sine', f, 0, 0.005, 0.35, 0.04, i * 0.07)); },
        horn: () => tone('sawtooth', 520, 560, 0.02, 0.35, 0.04), splash: () => noise(700, 0.6, 0.35, 0.09), clap: () => { noise(1500, 0.8, 0.09, 0.2); noise(2400, 0.8, 0.07, 0.12, 0.01); },
        howl: () => { const o = tone('sine', 480, 0, 0.12, 1.1, 0.06); o.frequency.linearRampToValueAtTime(720, t0 + 0.5); o.frequency.linearRampToValueAtTime(600, t0 + 1.1); },
        crunch: () => { for (let i = 0; i < 4; i++) noise(2600, 1.2, 0.05, 0.06, i * 0.09); }, flash: () => { noise(5000, 0.5, 0.12, 0.08); tone('sine', 2400, 600, 0.005, 0.2, 0.03); }
      }[name] || (() => {}))();
    } catch (e) { /* sound is a nicety */ }
  }

  // ---------------------------------------------------------------- drawing the props (k = px per prop unit)
  const DRAW = {
    ball(c, p, k) { c.fillStyle = p.c || '#E83F78'; c.beginPath(); c.arc(0, 0, 8 * k, 0, TAU); c.fill(); c.fillStyle = 'rgba(255,255,255,.35)'; c.beginPath(); c.arc(-2.6 * k, -2.8 * k, 3.2 * k, 0, TAU); c.fill();
      c.strokeStyle = '#fff'; c.lineWidth = 1.6 * k; c.beginPath(); c.arc(0, 0, 8 * k, 0.5 + p.t * 3, 2.3 + p.t * 3); c.stroke(); },
    frisbee(c, p, k) { c.rotate(Math.sin(p.t * 9) * 0.12 * (p.wob || 0)); c.fillStyle = '#4FB9EC'; c.beginPath(); c.ellipse(0, 0, 14 * k, 4.2 * k, 0, 0, TAU); c.fill(); c.fillStyle = '#A8E2FA'; c.beginPath(); c.ellipse(0, -1 * k, 8.5 * k, 2.1 * k, 0, 0, TAU); c.fill(); },
    bubble(c, p, k) { const r = (p.r || 7) * k; c.strokeStyle = 'rgba(215,240,255,.9)'; c.lineWidth = 1.2 * k; c.fillStyle = 'rgba(190,225,255,.16)'; c.beginPath(); c.arc(0, 0, r, 0, TAU); c.fill(); c.stroke();
      c.strokeStyle = 'rgba(255,170,230,.45)'; c.beginPath(); c.arc(0, 0, r * 0.82, 2.2, 3.4); c.stroke(); c.fillStyle = 'rgba(255,255,255,.85)'; c.beginPath(); c.ellipse(-r * 0.35, -r * 0.4, r * 0.25, r * 0.15, -0.6, 0, TAU); c.fill(); },
    balloon(c, p, k) { c.strokeStyle = 'rgba(255,255,255,.65)'; c.lineWidth = 1 * k; c.beginPath(); c.moveTo(0, 13 * k); c.quadraticCurveTo(3 * k + Math.sin(p.t * 3) * 2 * k, 22 * k, 0, 32 * k); c.stroke();
      c.fillStyle = p.c || '#FF7AA5'; c.beginPath(); c.ellipse(0, 0, 11 * k, 13 * k, 0, 0, TAU); c.fill(); c.fillStyle = 'rgba(255,255,255,.4)'; c.beginPath(); c.ellipse(-4 * k, -5 * k, 3 * k, 4.5 * k, -0.4, 0, TAU); c.fill();
      c.fillStyle = p.c || '#FF7AA5'; c.beginPath(); c.moveTo(-2 * k, 12.6 * k); c.lineTo(2 * k, 12.6 * k); c.lineTo(0, 15.5 * k); c.fill(); },
    bone(c, p, k) { c.fillStyle = '#F6EBD6'; c.beginPath(); c.rect(-8 * k, -2.4 * k, 16 * k, 4.8 * k); for (const [x, y] of [[-8, -2.6], [-8, 2.6], [8, -2.6], [8, 2.6]]) { c.moveTo(x * k + 3 * k, y * k); c.arc(x * k, y * k, 3 * k, 0, TAU); } c.fill(); },
    kite(c, p, k) { if (p.glow && GLOW) c.drawImage(GLOW, -34 * k, -34 * k, 68 * k, 68 * k);
      c.fillStyle = p.glow ? '#FFB86B' : '#FF6F91'; c.beginPath(); c.moveTo(0, -17 * k); c.lineTo(12 * k, 0); c.lineTo(0, 21 * k); c.lineTo(-12 * k, 0); c.closePath(); c.fill();
      c.fillStyle = p.glow ? '#FFE7A8' : '#FFD86A'; c.beginPath(); c.moveTo(0, -17 * k); c.lineTo(12 * k, 0); c.lineTo(0, 0); c.closePath(); c.fill(); c.beginPath(); c.moveTo(0, 21 * k); c.lineTo(-12 * k, 0); c.lineTo(0, 0); c.closePath(); c.fill();
      c.strokeStyle = 'rgba(255,255,255,.75)'; c.lineWidth = 1 * k; c.beginPath(); c.moveTo(0, 21 * k); for (let i = 1; i < 7; i++) c.lineTo(Math.sin(p.t * 5 + i) * 4 * k, 21 * k + i * 7 * k); c.stroke();
      for (let i = 0; i < 3; i++) { c.fillStyle = COLS[i]; c.beginPath(); c.ellipse(Math.sin(p.t * 5 + 2 + i * 2) * 4 * k, 32 * k + i * 12 * k, 2.6 * k, 1.4 * k, 0.5, 0, TAU); c.fill(); } },
    butterfly(c, p, k) { if (p.glow && GLOW) c.drawImage(GLOW, -16 * k, -16 * k, 32 * k, 32 * k); const f = 0.25 + 0.75 * Math.abs(Math.sin(p.t * 13)); c.fillStyle = p.c || '#FFB347';
      for (const sg of [-1, 1]) { c.beginPath(); c.ellipse(sg * 5.5 * k * f, -2 * k, 5 * k * f + 0.5, 6 * k, sg * 0.3, 0, TAU); c.fill(); c.beginPath(); c.ellipse(sg * 4 * k * f, 4 * k, 3.5 * k * f + 0.5, 4 * k, -sg * 0.3, 0, TAU); c.fill(); }
      c.fillStyle = '#3A2A3A'; c.fillRect(-0.8 * k, -6 * k, 1.6 * k, 12 * k); },
    plane(c, p, k) { c.fillStyle = '#FDFBF6'; c.strokeStyle = '#9AA8C8'; c.lineWidth = 0.8 * k; c.beginPath(); c.moveTo(15 * k, 0); c.lineTo(-11 * k, -8 * k); c.lineTo(-5 * k, 0); c.lineTo(-11 * k, 8 * k); c.closePath(); c.fill(); c.stroke();
      c.fillStyle = '#E4E9F4'; c.beginPath(); c.moveTo(15 * k, 0); c.lineTo(-5 * k, 0); c.lineTo(-11 * k, 8 * k); c.closePath(); c.fill(); c.stroke(); },
    flower(c, p, k) { c.strokeStyle = '#5FA05A'; c.lineWidth = 1.6 * k; c.beginPath(); c.moveTo(0, 0); c.quadraticCurveTo(2 * k, 8 * k, 0, 15 * k); c.stroke(); c.fillStyle = '#6DB35F'; c.beginPath(); c.ellipse(3 * k, 9 * k, 3.4 * k, 1.5 * k, 0.6, 0, TAU); c.fill();
      c.fillStyle = p.c || '#FF8FB8'; for (let i = 0; i < 5; i++) { const a = i * TAU / 5 + p.t * 0.3; c.beginPath(); c.arc(Math.cos(a) * 4 * k, Math.sin(a) * 4 * k, 3.2 * k, 0, TAU); c.fill(); } c.fillStyle = '#FFD86A'; c.beginPath(); c.arc(0, 0, 2.4 * k, 0, TAU); c.fill(); },
    dandelion(c, p, k) { c.strokeStyle = '#7FAF6A'; c.lineWidth = 1.3 * k; c.beginPath(); c.moveTo(0, 0); c.lineTo(0, 16 * k); c.stroke(); const n = p.left ?? 18; c.strokeStyle = 'rgba(255,255,255,.85)'; c.lineWidth = 0.6 * k; c.fillStyle = '#fff';
      for (let i = 0; i < n; i++) { const a = i / 18 * TAU; c.beginPath(); c.moveTo(0, 0); c.lineTo(Math.cos(a) * 7 * k, Math.sin(a) * 7 * k); c.stroke(); c.beginPath(); c.arc(Math.cos(a) * 7.5 * k, Math.sin(a) * 7.5 * k, 1.1 * k, 0, TAU); c.fill(); } c.fillStyle = '#C9B98A'; c.beginPath(); c.arc(0, 0, 1.6 * k, 0, TAU); c.fill(); },
    hat(c, p, k) { c.fillStyle = p.c || '#B98CFF'; c.beginPath(); c.moveTo(-8 * k, 0); c.lineTo(8 * k, 0); c.lineTo(0, -19 * k); c.closePath(); c.fill(); c.fillStyle = 'rgba(255,255,255,.85)'; c.fillRect(-8 * k, -1.4 * k, 16 * k, 2 * k);
      c.fillStyle = '#FFD86A'; for (let i = 0; i < 3; i++) { c.beginPath(); c.arc((-3 + i * 3) * k, (-4 - i * 4.4) * k, 1.4 * k, 0, TAU); c.fill(); } c.fillStyle = '#fff'; c.beginPath(); c.arc(0, -19 * k, 2.6 * k, 0, TAU); c.fill(); },
    shades(c, p, k) { c.fillStyle = '#121019'; c.strokeStyle = '#121019'; c.lineWidth = 1.6 * k; const sp = p.sep ?? 12.5, r = p.r ?? 6.6;
      if (p.one) { c.beginPath(); c.ellipse(0, 0, r * k, r * 0.78 * k, 0, 0, TAU); c.fill(); c.beginPath(); c.moveTo(-r * k, -1 * k); c.lineTo(-r * 2.3 * k, -2.4 * k); c.stroke(); c.fillStyle = 'rgba(255,255,255,.55)'; c.fillRect((-r * 0.6) * k, -r * 0.45 * k, 2.2 * k, 1.1 * k); return; }
      for (const sg of [-1, 1]) { c.beginPath(); c.ellipse(sg * sp * k, 0, r * k, r * 0.8 * k, 0, 0, TAU); c.fill(); } c.beginPath(); c.moveTo(-sp * k + r * k, -1 * k); c.quadraticCurveTo(0, -3.5 * k, sp * k - r * k, -1 * k); c.stroke();
      c.fillStyle = 'rgba(255,255,255,.55)'; for (const sg of [-1, 1]) c.fillRect((sg * sp - r * 0.55) * k, -r * 0.45 * k, 2.4 * k, 1.1 * k); },
    book(c, p, k) { c.fillStyle = '#C0426E'; c.fillRect(-13 * k, -9 * k, 26 * k, 18 * k); c.fillStyle = '#FFF8EC'; c.fillRect(-12 * k, -8 * k, 11.5 * k, 16 * k); c.fillRect(0.5 * k, -8 * k, 11.5 * k, 16 * k);
      c.strokeStyle = 'rgba(120,90,110,.5)'; c.lineWidth = 0.6 * k; for (let i = 0; i < 4; i++) { c.beginPath(); c.moveTo(-10 * k, (-4.5 + i * 3) * k); c.lineTo(-3 * k, (-4.5 + i * 3) * k); c.moveTo(2.5 * k, (-4.5 + i * 3) * k); c.lineTo(10 * k, (-4.5 + i * 3) * k); c.stroke(); } },
    drum(c, p, k) { c.fillStyle = '#D9493E'; c.fillRect(-12 * k, -6 * k, 24 * k, 15 * k); c.fillStyle = '#F5EAD8'; c.beginPath(); c.ellipse(0, -6 * k, 12 * k, 3.6 * k, 0, 0, TAU); c.fill();
      c.strokeStyle = '#FFD27A'; c.lineWidth = 1 * k; for (let i = 0; i < 5; i++) { c.beginPath(); c.moveTo((-12 + i * 6) * k, -5 * k); c.lineTo((-9 + i * 6) * k, 9 * k); c.stroke(); } },
    camera(c, p, k) { c.fillStyle = '#3B3F57'; c.fillRect(-11 * k, -7.5 * k, 22 * k, 15 * k); c.fillStyle = '#2A2D40'; c.beginPath(); c.arc(0, 0, 6 * k, 0, TAU); c.fill(); c.fillStyle = '#9FD4FF'; c.beginPath(); c.arc(0, 0, 4.2 * k, 0, TAU); c.fill();
      c.fillStyle = '#fff'; c.beginPath(); c.arc(-1.4 * k, -1.4 * k, 1.2 * k, 0, TAU); c.fill(); c.fillStyle = '#FFE38A'; c.fillRect(5 * k, -10 * k, 4.5 * k, 2.6 * k); },
    cupcake(c, p, k) { c.fillStyle = '#E9A6C3'; c.beginPath(); c.moveTo(-8 * k, 0); c.lineTo(8 * k, 0); c.lineTo(6 * k, 9 * k); c.lineTo(-6 * k, 9 * k); c.closePath(); c.fill(); c.strokeStyle = 'rgba(180,80,120,.4)'; c.lineWidth = 0.6 * k; for (let i = -2; i <= 2; i++) { c.beginPath(); c.moveTo(i * 3 * k, 0.5 * k); c.lineTo(i * 2.4 * k, 8.5 * k); c.stroke(); }
      c.fillStyle = '#FFF4F8'; c.beginPath(); c.arc(-4 * k, -2 * k, 5 * k, 0, TAU); c.arc(4 * k, -2 * k, 5 * k, 0, TAU); c.arc(0, -6 * k, 5 * k, 0, TAU); c.fill(); c.fillStyle = '#FF7AA5'; c.beginPath(); c.arc(0, -10.5 * k, 2 * k, 0, TAU); c.fill();
      c.fillStyle = '#8EC9FF'; c.fillRect(-1 * k, -19 * k, 2 * k, 8 * k); if (!p.out) { if (GLOW) c.drawImage(GLOW, -7 * k, -29 * k, 14 * k, 14 * k); c.fillStyle = '#FFC24A'; c.beginPath(); c.ellipse(0, -21.5 * k, 1.8 * k, 3 * k + Math.sin(p.t * 20) * 0.4 * k, 0, 0, TAU); c.fill(); } },
    gift(c, p, k) { const o = p.open || 0; c.fillStyle = '#7AC4E8'; c.fillRect(-12 * k, -12 * k, 24 * k, 12 * k); c.fillStyle = '#F283B3'; c.fillRect(-2 * k, -12 * k, 4 * k, 12 * k);
      c.save(); c.translate(-8 * k * o, -12 * k - o * 22 * k); c.rotate(-o * 0.9); c.fillStyle = '#5FB0DA'; c.fillRect(-13 * k, -4 * k, 26 * k, 5 * k); c.fillStyle = '#F283B3'; c.fillRect(-2 * k, -4 * k, 4 * k, 5 * k);
      c.beginPath(); c.ellipse(-4 * k, -5.5 * k, 4.4 * k, 2.6 * k, -0.4, 0, TAU); c.ellipse(4 * k, -5.5 * k, 4.4 * k, 2.6 * k, 0.4, 0, TAU); c.fill(); c.restore(); },
    umbrella(c, p, k) { c.strokeStyle = '#4A3A4A'; c.lineWidth = 1.6 * k; c.beginPath(); c.moveTo(0, -20 * k); c.lineTo(0, 30 * k); c.arc(-3.5 * k, 30 * k, 3.5 * k, 0, Math.PI); c.stroke();
      const w = 50; c.fillStyle = '#FF7AA5'; c.beginPath(); c.moveTo(-w * k, 0); c.quadraticCurveTo(0, -46 * k, w * k, 0); for (let i = 4; i > 0; i--) { const x1 = (-w + (i - 1) * w / 2) * k, xm = (-w + (i - 0.5) * w / 2) * k; c.quadraticCurveTo(xm, -7 * k, x1, 0); } c.fill();
      c.fillStyle = 'rgba(255,255,255,.25)'; c.beginPath(); c.moveTo(-w * 0.5 * k, -5 * k); c.quadraticCurveTo(-w * 0.2 * k, -30 * k, 0, -23 * k); c.lineTo(0, -3 * k); c.fill(); },
    rainbow(c, p) { const R = p.R, a = p.grow ?? 1; c.globalAlpha *= p.pale ? 0.45 : 0.85; ['#FF6B6B', '#FFB347', '#FFE66D', '#7DDE92', '#6FB7FF', '#B28DFF'].forEach((col, i) => { c.strokeStyle = col; c.lineWidth = p.band + 0.5; c.beginPath(); c.arc(0, 0, R - i * p.band, Math.PI, Math.PI + Math.PI * a); c.stroke(); }); },
    telescope(c, p, k) { c.strokeStyle = '#4A3A4A'; c.lineWidth = 1.4 * k; c.beginPath(); for (const dx of [-7, 0, 7]) { c.moveTo(0, 0); c.lineTo(dx * k, p.h * k); } c.stroke();
      c.save(); c.rotate(-Math.PI + 0.62); c.fillStyle = '#6A5ACD'; c.fillRect(-6 * k, -3.2 * k, 34 * k, 6.4 * k); c.fillStyle = '#8A7AEF'; c.fillRect(-6 * k, -3.2 * k, 34 * k, 2 * k); c.fillStyle = '#FFD27A'; c.fillRect(26 * k, -4.4 * k, 4 * k, 8.8 * k); c.fillStyle = '#3A2F7A'; c.fillRect(-9 * k, -2.2 * k, 3.5 * k, 4.4 * k); c.restore(); },
    envelope(c, p, k) { c.fillStyle = '#FFF4F0'; c.fillRect(-10 * k, -6.5 * k, 20 * k, 13 * k); c.strokeStyle = '#E3A0B6'; c.lineWidth = 0.9 * k; c.strokeRect(-10 * k, -6.5 * k, 20 * k, 13 * k); c.beginPath(); c.moveTo(-10 * k, -6.5 * k); c.lineTo(0, 1 * k); c.lineTo(10 * k, -6.5 * k); c.stroke();
      c.fillStyle = '#E83F78'; c.beginPath(); c.moveTo(0, 3.2 * k); c.bezierCurveTo(-3 * k, 1 * k, -2 * k, -1.4 * k, 0, 0); c.bezierCurveTo(2 * k, -1.4 * k, 3 * k, 1 * k, 0, 3.2 * k); c.fill(); },
    polaroid(c, p, k) { c.fillStyle = '#FFFFFF'; c.fillRect(-15 * k, -17 * k, 30 * k, 35 * k); const g = c.createLinearGradient(0, -14 * k, 0, 10 * k); g.addColorStop(0, N() ? '#4A3A8A' : '#9FD8FF'); g.addColorStop(1, '#F7C9DE'); c.fillStyle = g; c.fillRect(-13 * k, -15 * k, 26 * k, 25 * k);
      c.fillStyle = '#A9CBEA'; c.beginPath(); c.arc(4.5 * k, 2 * k, 4.6 * k, 0, TAU); c.fill(); c.fillStyle = '#1E1D26'; c.beginPath(); c.ellipse(-5 * k, 4.6 * k, 4.6 * k, 3.2 * k, 0, 0, TAU); c.arc(-1.6 * k, 0.6 * k, 2.6 * k, 0, TAU); c.fill();
      c.fillStyle = '#C0426E'; c.font = `600 ${6 * k}px Caveat, cursive`; c.textAlign = 'center'; c.fillText('♡ for Helen', 0, 15.5 * k); },
    leaves(c, p, k) { for (let i = 0; i < 18; i++) { c.fillStyle = ['#E9A23B', '#D9663A', '#F2C14E', '#C8552E'][i % 4]; c.beginPath(); c.ellipse(((i * 7) % 13 - 6) * 3 * k, -((i * 5) % 4) * 2.6 * k - (i > 9 ? 3 * k : 0), 4.2 * k, 2.2 * k, i, 0, TAU); c.fill(); } },
    snowman(c, p, k) { c.fillStyle = '#FFFFFF'; c.strokeStyle = 'rgba(150,170,210,.6)'; c.lineWidth = 0.8 * k; c.beginPath(); c.arc(0, -9 * k, 9 * k, 0, TAU); c.fill(); c.stroke(); c.beginPath(); c.arc(0, -23 * k, 6.5 * k, 0, TAU); c.fill(); c.stroke();
      c.fillStyle = '#FF8A3D'; c.beginPath(); c.moveTo(0, -23 * k); c.lineTo(7 * k, -22 * k); c.lineTo(0, -21.4 * k); c.fill(); c.fillStyle = '#222'; c.fillRect(-3 * k, -26 * k, 1.6 * k, 1.6 * k); c.fillRect(1.6 * k, -26 * k, 1.6 * k, 1.6 * k);
      c.fillStyle = '#7FB6F0'; c.fillRect(-6 * k, -18 * k, 12 * k, 2.4 * k); },
    tophat(c, p, k) { c.fillStyle = '#2A2440'; c.fillRect(-9 * k, -17 * k, 18 * k, 16 * k); c.beginPath(); c.ellipse(0, -1 * k, 14 * k, 3 * k, 0, 0, TAU); c.fill(); c.fillStyle = '#E83F78'; c.fillRect(-9 * k, -6 * k, 18 * k, 3 * k); c.fillStyle = '#3D3560'; c.beginPath(); c.ellipse(0, -17 * k, 9 * k, 2.2 * k, 0, 0, TAU); c.fill(); },
    bunny(c, p, k) { c.fillStyle = '#FFFFFF'; c.strokeStyle = 'rgba(160,150,190,.7)'; c.lineWidth = 0.8 * k; c.beginPath(); c.ellipse(0, -6 * k, 6.5 * k, 6 * k, 0, 0, TAU); c.fill(); c.stroke(); c.beginPath(); c.arc(4 * k, -12 * k, 4.4 * k, 0, TAU); c.fill(); c.stroke();
      for (const dx of [2.4, 5.6]) { c.beginPath(); c.ellipse(dx * k, -19.5 * k, 1.5 * k, 5 * k, (dx - 4) * 0.12, 0, TAU); c.fill(); c.stroke(); } c.fillStyle = '#FFB3C8'; c.beginPath(); c.ellipse(5.6 * k, -19.5 * k, 0.7 * k, 3.4 * k, 0.2, 0, TAU); c.fill();
      c.fillStyle = '#2A1820'; c.beginPath(); c.arc(5.6 * k, -12.6 * k, 0.8 * k, 0, TAU); c.fill(); c.fillStyle = '#FF8FB0'; c.beginPath(); c.arc(8.1 * k, -11.4 * k, 0.7 * k, 0, TAU); c.fill(); },
    musicbox(c, p, k) { c.fillStyle = '#C9935A'; c.fillRect(-11 * k, -12 * k, 22 * k, 12 * k); c.fillStyle = '#E6B27A'; c.fillRect(-11 * k, -12 * k, 22 * k, 2.4 * k); c.fillStyle = '#FFE7B0'; c.fillRect(-8 * k, -8 * k, 16 * k, 4 * k);
      c.save(); c.translate(0, -12 * k); c.scale(Math.cos(p.t * 2.2), 1); c.fillStyle = '#F7B8D2'; c.beginPath(); c.moveTo(-4 * k, 0); c.lineTo(4 * k, 0); c.lineTo(0, -7 * k); c.fill(); c.beginPath(); c.arc(0, -8.5 * k, 2 * k, 0, TAU); c.fill(); c.restore(); },
    bush(c, p, k) { const cl = N() ? ['#2E4B3A', '#3B5E47', '#4A7256'] : ['#4E9A4E', '#63B25B', '#7CC66C']; const lobes = [[-26, -14, 17], [-8, -24, 20], [14, -20, 18], [28, -10, 14], [0, -8, 22], [-30, -4, 12], [32, -3, 11]];
      lobes.forEach(([x, y, r], i) => { c.fillStyle = cl[i % 3]; c.beginPath(); c.arc(x * k, y * k + Math.sin(p.t * 2 + i) * 0.3 * k, r * k, 0, TAU); c.fill(); });
      c.fillStyle = N() ? 'rgba(255,240,200,.3)' : '#FFD6E6'; for (let i = 0; i < 6; i++) { c.beginPath(); c.arc(((i * 17) % 50 - 25) * k, (-8 - (i * 11) % 26) * k, 1.8 * k, 0, TAU); c.fill(); } },
    flag(c, p, k) { c.strokeStyle = '#E9E2F2'; c.lineWidth = 1.6 * k; c.beginPath(); c.moveTo(0, 0); c.lineTo(0, -44 * k); c.stroke(); for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) { c.fillStyle = (i + j) % 2 ? '#222' : '#fff'; const w = Math.sin(p.t * 6 + i * 0.8) * 1.4 * k; c.fillRect(i * 4.5 * k, -44 * k + j * 4.5 * k + w, 4.5 * k, 4.5 * k); } },
    spots(c, p, k) { for (let i = 0; i < 3; i++) { const x = Math.sin(p.t * (0.9 + i * 0.3) + i * 2) * p.w; c.fillStyle = COLS[(i + Math.floor(p.t * 2)) % COLS.length]; c.globalAlpha *= 0.26; c.beginPath(); c.ellipse(x, 0, 34 * k, 7 * k, 0, 0, TAU); c.fill(); c.globalAlpha /= 0.26; } },
    hop(c, p, k) { c.strokeStyle = 'rgba(255,240,250,.8)'; c.lineWidth = 1.3 * k; c.font = `600 ${7 * k}px Caveat, cursive`; c.textAlign = 'center'; c.fillStyle = 'rgba(255,240,250,.9)';
      for (let i = 0; i < 4; i++) { const x = -p.step * (i + 1); c.beginPath(); c.ellipse(x, 0, p.step * 0.42, 4.5 * k, 0, 0, TAU); c.stroke(); c.fillText(String(i + 1), x, 2.4 * k); } },
    rope(c, p, k) { const [a, b] = p.ends(); c.strokeStyle = p.c || '#FF8FB8'; c.lineWidth = (p.w || 2) * k; c.beginPath(); c.moveTo(a[0] - p.x, a[1] - p.y); c.quadraticCurveTo((a[0] + b[0]) / 2 - p.x, (a[1] + b[1]) / 2 - p.y + (p.sag ?? 10) * k, b[0] - p.x, b[1] - p.y); c.stroke(); },
    jrope(c, p, k) { const [a, b] = p.ends(), l = L(), midY = (l.gy - 40 * l.ps) - 40 * l.ps * Math.cos(p.ph || 0), cy = 2 * midY - (a[1] + b[1]) / 2; c.strokeStyle = p.c || '#FFD27A'; c.lineWidth = 2.2 * k; c.beginPath(); c.moveTo(a[0] - p.x, a[1] - p.y); c.quadraticCurveTo((a[0] + b[0]) / 2 - p.x, cy - p.y, b[0] - p.x, b[1] - p.y); c.stroke(); },
    skyword(c, p, k) { const txt = p.text.slice(0, Math.max(0, Math.ceil(p.text.length * clamp(p.t / (p.dur || 2), 0, 1)))); if (!txt) return; c.font = `600 ${30 * k}px Caveat, cursive`; c.textAlign = 'center'; c.lineJoin = 'round';
      c.strokeStyle = 'rgba(255,214,150,.35)'; c.lineWidth = 7 * k; c.strokeText(txt, 0, 0); c.strokeStyle = 'rgba(120,70,140,.45)'; c.lineWidth = 2.4 * k; c.strokeText(txt, 0, 0); c.fillStyle = '#FFF1C4'; c.fillText(txt, 0, 0); },
    star(c, p, k) { if (GLOW) c.drawImage(GLOW, -14 * k, -14 * k, 28 * k, 28 * k); c.fillStyle = '#FFE58A'; c.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5 + p.t * 0.6, r = (i % 2 ? 3.2 : 7.5) * k; c.lineTo(Math.cos(a) * r, Math.sin(a) * r); } c.fill(); },
    streak(c, p, k) { c.strokeStyle = 'rgba(255,245,215,.55)'; c.lineWidth = 2.4 * k; c.beginPath(); c.moveTo(0, 0); c.lineTo(-70 * k, -28 * k); c.stroke(); c.strokeStyle = 'rgba(255,245,215,.95)'; c.beginPath(); c.moveTo(0, 0); c.lineTo(-26 * k, -10.4 * k); c.stroke(); DRAW.star(c, p, k * 0.75); },
    cloudlet(c, p, k) { c.fillStyle = N() ? 'rgba(220,210,255,.8)' : 'rgba(255,255,255,.95)'; c.beginPath(); c.arc(-8 * k, 2 * k, 7 * k, 0, TAU); c.arc(0, -3 * k, 9 * k, 0, TAU); c.arc(9 * k, 2 * k, 7 * k, 0, TAU); c.fill(); c.fillRect(-8 * k, 2 * k, 17 * k, 7 * k); }
  };
  const SHADOW = { ball: 9, frisbee: 12, bone: 8, gift: 13, tophat: 13, musicbox: 12, snowman: 10, bunny: 7, envelope: 9, book: 12 };

  // ---------------------------------------------------------------- the 52 games. f(A, T): A(t, fn) = a beat at t s; T(t0, t1, fn(dt, t)) = something every frame
  const ACTS = [
    { t: 'Fetch!', d: 8.8, f(A) { const b = prop('ball'); b.at = SN.hands;
      A(0, () => { bear.act('hold', { restart: true, hold: 'none' }); faceBear(); pup.act('bow', { restart: true }); api.say('Ready, Jessi?', 1500); P.look = () => [b.x, b.y]; });
      A(1.3, () => { b.at = null; const a = SN.hands(), tx = L().pupX + px(-3.4) - 32 * L().ps, ty = L().gy - 50 * L().ps;
        b.path = { a, c: arcC(a, [tx, ty], 170 * s()), end: JE.mouth, t: 0, dur: 1.35, spin: 9 }; bear.act('cheer', { restart: true }); sfx('whoosh'); pupTo(-3.4, 1.0, 'stand'); });
      A(2.35, () => { pupHop(0.9, 0.55); pup.act('alert', { restart: true }); });
      A(2.65, () => { b.path = null; b.at = JE.mouth; sfx('pop'); pop('Got it!', JE.top); });
      A(3.3, () => pupTo(0.7, 1.1, 'sit', { face: 'bear' }));
      A(4.6, () => { b.at = null; [b.x, b.y] = JE.mouth(); b.vx = 40 * s(); b.vy = -60 * s(); b.g = 640 * s(); b.floor = L().gy - 9 * s(); bear.act('clap', { restart: true }); api.say('Good girl! ♡', 1600); burst('heart', JE.top, 6, { v: 70, g: -40 }); pup.act('happy', { restart: true }); });
      A(7.4, () => fade(b)); } },
    { t: 'Frisbee catch', d: 7.8, f(A) { const fz = prop('frisbee'); fz.at = SN.hands;
      A(0, () => { bear.act('hold', { restart: true, hold: 'none' }); faceBear(); pup.act('alert', { restart: true }); api.say('Catch, Jessi!', 1400); P.look = () => [fz.x, fz.y]; });
      A(1.0, () => { fz.at = null; const a = SN.hands(); const cc = arcC(a, JE.mouth(), 150 * s()); fz.path = { a, c: [cc[0] + 40 * s(), cc[1]], end: JE.mouth, t: 0, dur: 1.45, spin: 0 }; fz.wob = 1; sfx('whoosh'); bear.act('point', { restart: true, dir: [-1, -1] }); pupTo(-1.4, 0.8, 'stand', { face: 1 }); });
      A(1.95, () => pup.act('flip', { restart: true }));
      A(2.45, () => { fz.path = null; fz.at = JE.mouth; fz.wob = 0; sfx('pop'); });
      A(3.2, () => { api.say('What a catch! ✦', 1600); bear.act('cheer', { restart: true }); burst('spark', JE.top, 14, { v: 140 }); });
      A(4.4, () => pupTo(0.6, 0.8, 'happy', { face: 'bear' }));
      A(5.6, () => { fz.at = null; [fz.x, fz.y] = JE.mouth(); fz.g = 520 * s(); fz.floor = L().gy - 3 * s(); fz.vx = 20 * s(); });
      A(7.0, () => fade(fz)); } },
    { t: 'Bubble chase', d: 8.4, f(A) {
      A(0, () => { bear.act('blow', { restart: true, dir: [-1, 0] }); api.say('Bubbles! ✦', 1400); faceBear(); pup.act('alert', { restart: true }); });
      for (let i = 0; i < 10; i++) A(0.3 + i * 0.3, () => { const [x, y] = SN.mouth(); prop('bubble', { x: x - 6 * s(), y, vx: (-70 - Math.random() * 70) * s(), vy: (-25 - Math.random() * 45) * s(), r: 5 + Math.random() * 5, life: 5, bob: Math.random() * 6, popOnPup: true }); sfx('blip'); });
      A(1.5, () => { pup.act('bark', { restart: true }); api.woof(1); }); A(2.3, () => { pupHop(0.9, 0.55); pup.act('alert', { restart: true }); });
      A(3.3, () => pupTo(-0.8, 0.5, 'alert')); A(3.9, () => pupHop(1.1, 0.6));
      A(5.0, () => { pupTo(0, 0.6, 'happy', { face: 'bear' }); bear.act('giggle', { restart: true }); }); } },
    { t: 'Balloon bop', d: 8.4, f(A) { const b = prop('balloon', { c: pick(COLS) }), over = () => { const t = SN.top(); return [t[0], t[1] - 18 * s()]; }; b.at = over; const hits = [over, () => { const n = JE.top(); return [n[0], n[1] - 16 * s()]; }];
      A(0, () => { faceBear(); pup.act('alert', { restart: true }); bear.act('lookUp', { restart: true, expr: 'happy' }); P.look = () => [b.x, b.y]; });
      for (let i = 0; i < 5; i++) A(0.6 + i * 1.3, () => { const from = [b.x, b.y], to = hits[(i + 1) % 2], e = to(); b.at = null;
        b.path = { a: from, c: arcC(from, e, 110 * s()), end: to, t: 0, dur: 1.25, spin: 0 }; sfx('boing');
        if (i % 2 === 0) bear.act('cheer', { restart: true }); else { pup.act('alert', { restart: true }); pupHop(0.45, 0.4); } });
      A(7.2, () => { b.path = null; b.vy = -70 * s(); b.vx = 12 * s(); api.say('Bye, balloon!', 1300); bear.act('wave', { restart: true }); pup.act('lookUp', { restart: true }); });
      A(8.2, () => fade(b, 0.4)); } },
    { t: 'Hide and seek', d: 10.8, f(A) { const bush = prop('bush', { s: 0 }); bush.sk = () => 1.4; bush.at = () => [L().pupX + px(-3.6), L().gy + 2 * s()]; tween(bush, 's', 1, 0.5);
      A(0, () => { bear.act('cover', { restart: true }); api.say('1… 2… 3…', 2600); });
      A(0.6, () => pupTo(-3.6, 1.1, 'sit', { face: 1 }));
      A(3.0, () => { bear.act('peek', { restart: true }); api.say('Ready or not…', 1500); });
      A(4.2, () => { bear.act('alert', { restart: true, dir: [1, 0] }); api.say('Where is Jessi?', 1700); });
      A(5.2, () => bear.act('alert', { restart: true, dir: [-1, 0] })); A(5.6, () => pop('wag wag', () => [bush.x + 10 * s(), bush.y - 46 * s()]));
      A(6.2, () => bearTo(-1.4, 0, 1.0, 'walk', 'alert', { endO: { dir: [-1, 0] } }));
      A(7.5, () => { pupHop(0.9, 0.5); pup.act('bark', { restart: true }); api.woof(2); pop('Boo!', JE.top); });
      A(7.8, () => bear.act('idle', { expr: 'surprised', restart: true }));
      A(8.4, () => { bear.act('giggle', { restart: true }); api.say('Found you! ♡', 1600); });
      A(8.8, () => { pupTo(0, 1.0, 'happy', { face: 'bear' }); fade(bush, 1.2); }); } },
    { t: 'Peekaboo', d: 6.8, f(A) {
      A(0, () => { faceBear(); pup.act('sit', { restart: true }); });
      for (let i = 0; i < 3; i++) { A(0.2 + i * 2, () => bear.act('cover', { restart: true })); A(1.2 + i * 2, () => { bear.act('idle', { expr: 'giggle', restart: true }); pop('Boo!', SN.top); sfx('pop'); pup.act(i === 1 ? 'bark' : 'happy', { restart: true }); if (i === 1) api.woof(1); pupHop(0.3, 0.3); }); }
      A(6.2, () => api.say('Peekaboo! ♡', 1200)); } },
    { t: 'Dance party', d: 9, f(A, T) { const sp = prop('spots', { layer: 'back' }); sp.at = () => [(G.x + J.x) / 2, L().gy + 2 * s()]; sp.w = 90 * s();
      A(0, () => { bear.act('dance', { restart: true }); pup.act('happy', { restart: true }); api.say('Dance with me, Jessi!', 1700); });
      T(0, 8.6, dt => { if (Math.random() < dt * 4) burst('note', () => [lerp(G.x, J.x, Math.random()), L().gy - 95 * s()], 1, { v: 40, g: -30, life: 2, a0: -Math.PI * 0.75, spread: Math.PI * 0.5 }); });
      A(1.8, () => pup.act('spin', { restart: true })); A(3.2, () => { pupHop(0.5, 0.4); pup.act('happy', { restart: true }); }); A(3.8, () => pupHop(0.5, 0.4));
      A(4.6, () => pup.act('spin', { restart: true })); A(6.0, () => bear.act('spin', { restart: true })); A(7.0, () => { bear.act('dance', { restart: true }); pup.act('bow', { restart: true }); });
      A(8.2, () => { bear.act('bow', { restart: true }); fade(sp, 0.7); }); } },
    { t: 'High five', d: 6.4, f(A) { const meet = () => { const a = SN.handL(), b = JE.paw(); return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]; };
      A(0, () => { bearTo(-1.1, 0, 0.8, 'walk', 'idle'); faceBear(); pup.act('sit', { restart: true }); });
      A(1.0, () => { pup.act('paw', { restart: true }); api.say('High five!', 1400); }); A(1.4, () => bear.act('point', { restart: true, dir: [-1, -0.3] }));
      A(1.9, () => { burst('spark', meet, 18, { v: 170, spread: TAU }); sfx('clap'); });
      A(2.6, () => { bear.act('cheer', { restart: true }); pup.act('happy', { restart: true }); }); A(4.2, () => bearTo(0, 0, 0.8, 'walk', 'idle')); } },
    { t: 'Tug of war', d: 8.6, f(A, T) { const r = prop('rope', { c: '#FF8FB8', w: 3 }); r.ends = () => [SN.hands(), JE.mouth()]; r.sag = 6;
      A(0, () => { faceBear(); pupTo(0.4, 0.4, 'bow', { face: 1 }); bear.act('hold', { restart: true, hold: 'none', expr: 'determined' }); api.say('Pull, Jessi!', 1300); });
      T(0.5, 6.0, (dt, t) => { const q = Math.sin(t * 2.6) * 0.32 + Math.sin(t * 6.1) * 0.05; G.po.x = bx(q); J.ox = px(0.4 + q); G.po.r = -q * 0.12; r.sag = 3 + Math.abs(Math.sin(t * 2.6)) * 7; });
      A(6.0, () => { tween(G.po, 'x', bx(-0.6), 0.35); tween(G.po, 'r', -0.32, 0.35, ease, () => tween(G.po, 'r', 0, 0.7)); bear.act('idle', { expr: 'oops', restart: true }); pupTo(-0.6, 0.35, 'happy', { back: true, act: 'bow' }); });
      A(6.4, () => { fade(r, 0.3); pop('Woof!', JE.top); api.woof(1); }); A(6.9, () => { bear.act('giggle', { restart: true }); api.say('You win, Jessi! ♡', 1700); }); } },
    { t: 'Piggyback ride', d: 9.8, f(A) {
      A(0, () => { faceBear(); pup.act('stand', { restart: true }); api.say('Can I ride, Jessi?', 1600); });
      A(1.4, () => { bear.act('fly', { restart: true }); bear.magic = 1; P.ride = { t: 0, from: { x: G.po.x, y: G.po.y } }; tween(G.po, 's', 0.74, 0.9); });
      A(2.4, () => { P.ride = null; P.riding = true; bear.act('wave', { restart: true }); });
      A(2.6, () => pupTo(2.0, 1.3, null)); A(3.9, () => pupTo(-2.0, 2.2, null)); A(6.1, () => pupTo(0, 1.0, 'stand', { face: 'bear' }));
      A(7.3, () => { P.riding = false; P.unride = { t: 0, from: { x: G.po.x, y: G.po.y } }; bear.act('fly', { restart: true }); tween(G.po, 's', 1, 0.9); });
      A(8.3, () => { P.unride = null; G.po.x = 0; G.po.y = 0; bear.act('hug', { restart: true }); burst('heart', mid, 6); api.say('Thank you! ♡', 1300); faceBear(); pup.act('happy', { restart: true }); }); } },
    { t: 'Belly rubs', d: 7.6, f(A, T) {
      A(0, () => { faceBear(); pup.act('roll', { restart: true }); bearTo(-1.0, 0, 0.8, 'walk', 'hug', { endO: { expr: 'love' } }); });
      A(1.4, () => { pup.act('lie', { restart: true }); api.say('Belly rubs! ♡', 1600); }); A(1.7, () => pup.act('roll', { restart: true })); A(3.3, () => pup.act('roll', { restart: true }));
      T(1.6, 5.4, dt => { if (Math.random() < dt * 3) burst('heart', JE.back, 1, { v: 40, g: -40 }); });
      A(5.4, () => { pup.act('happy', { restart: true }); bearTo(0, 0, 0.8, 'walk', 'idle'); }); } },
    { t: 'Treat time', d: 7.8, f(A, T) { const b = prop('bone'); b.at = SN.hands;
      A(0, () => { bear.act('hold', { restart: true, hold: 'none' }); faceBear(); api.say('Sit…', 1200); pup.act('sit', { restart: true }); });
      A(1.4, () => { api.say('Paw…', 1000); pup.act('paw', { restart: true }); });
      A(2.6, () => { api.say('Good girl!', 1200); bearTo(-0.9, 0, 0.6, 'walk', 'hold', { o: { hold: 'none' }, endO: { hold: 'none' } }); pup.act('sit', { restart: true }); });
      A(3.4, () => { b.at = JE.mouth; sfx('pop'); pup.act('happy', { restart: true }); });
      T(3.6, 6.0, dt => { if (Math.random() < dt * 6) burst('crumb', JE.mouth, 1, { v: 50, g: 300, c: '#E8D2A8', life: 0.8 }); }); A(4.2, () => sfx('crunch'));
      A(5.8, () => { fade(b, 0.4); pop('crunch!', JE.top); }); A(6.4, () => bearTo(0, 0, 0.8, 'walk', 'idle')); } },
    { t: () => (N() ? 'Glow-moth chase' : 'Butterfly chase'), d: 9.2, f(A) { const b = prop('butterfly', { c: N() ? '#BFE8FF' : pick(['#FFB347', '#B39DFF', '#7FD8FF']), glow: N() }); const s0 = free(60 * s(), 60 * s(), J.x - 70 * s(), L().gy - 170 * s());
      b.fn = tt => { const e = ease(clamp(tt / 8, 0, 1)), tg = SN.top(); return [lerp(s0[0], tg[0], e) + Math.sin(tt * 1.7) * 70 * s() * (1 - e), lerp(s0[1], tg[1] - 8 * s(), e) + Math.sin(tt * 3.1) * 28 * s() * (1 - e)]; };
      A(0.2, () => { P.look = () => [b.x, b.y]; }); A(0.5, () => { pup.act('alert', { restart: true }); pop('?', JE.top); });
      A(1.4, () => pupTo(-1.8, 0.8, 'bark')); A(2.2, () => api.woof(1)); A(3.0, () => pup.act('flip', { restart: true }));
      A(4.3, () => pupTo(0.3, 0.9, 'alert', { face: 'bear' })); A(5.4, () => pupHop(0.6, 0.45)); A(6.2, () => bear.act('lookUp', { restart: true, expr: 'happy' }));
      A(8.0, () => { bear.act('idle', { expr: 'surprised', restart: true }); api.say('It landed on my head!', 1600); burst('spark', SN.top, 6, { v: 40 }); });
      A(8.9, () => { b.fn = null; b.vx = 60 * s(); b.vy = -90 * s(); fade(b, 0.9); }); } },
    { t: () => (N() ? 'Lantern kite' : 'Kite flying'), d: 9.2, f(A) { const kt = prop('kite', { layer: 'back', glow: N() }), st = prop('rope', { layer: 'back', c: 'rgba(255,255,255,.7)', w: 0.8, sag: 26 });
      st.ends = () => [SN.hands(), [kt.x, kt.y + 20 * s()]]; const tg = free(80 * s(), 110 * s(), G.x + 170 * s(), L().gy - 270 * s());
      kt.fn = tt => { const h = SN.hands(), e = ease(clamp(tt / 3, 0, 1)); return [lerp(h[0], tg[0], e) + Math.sin(tt * 0.9) * 22 * s() * e, lerp(h[1] - 20 * s(), tg[1], e) + Math.sin(tt * 1.7) * 9 * s() * e]; };
      A(0, () => { bear.act('hold', { restart: true, hold: 'none' }); api.say('Up, up, up!', 1600); sfx('whoosh'); P.look = () => [kt.x, kt.y]; }); A(1.4, () => pup.act('lookUp', { restart: true }));
      A(3.2, () => { pupTo(0.9, 0.6, 'bark', { face: 1 }); api.woof(2); }); A(4.6, () => pupTo(0, 0.6, 'lookUp', { face: 'bear' }));
      A(6.2, () => api.say(N() ? 'A lantern kite for Helen ✦' : 'So high! ✦', 1800));
      A(8.4, () => { kt.fn = null; kt.vy = 80 * s(); fade(kt, 0.7); fade(st, 0.7); }); } },
    { t: 'Paper plane', d: 7.6, f(A) { const p = prop('plane'); p.at = SN.hands;
      A(0, () => { bear.act('hold', { restart: true, hold: 'none' }); faceBear(); api.say('Watch this, Jessi!', 1500); P.look = () => [p.x, p.y]; });
      A(1.1, () => { p.at = null; const [x, y] = SN.hands(), vx = -Math.min(170 * s(), (x - 40) / 3.4); p.flip = -1; p.t = 0;
        p.fn = tt => [x + tt * vx, y - Math.sin(clamp(tt / 3.4, 0, 1) * Math.PI) * 120 * s() + Math.sin(tt * 2.4) * 10 * s()]; p.rotFn = tt => 0.35 * Math.cos(clamp(tt / 3.4, 0, 1) * Math.PI);
        sfx('whoosh'); bear.act('point', { restart: true, dir: [-1, -0.6] }); pupTo(-2.6, 1.7, 'alert'); });
      A(3.0, () => pupHop(1.0, 0.6)); A(4.5, () => { api.say('So close, Jessi!', 1500); pupTo(0, 1.4, 'happy', { face: 'bear' }); fade(p, 1.0); }); } },
    { t: 'Magic hat', d: 7.6, f(A) { const h = prop('tophat', { s: 0 }); h.sk = () => 1.5; h.at = () => [gapX(), L().gy]; tween(h, 's', 1, 0.4);
      A(0, () => { bear.act('point', { restart: true, dir: [-1, 0.7] }); api.say('Abracadabra…', 1600); pup.act('alert', { restart: true }); faceBear(); P.look = () => [h.x, L().gy - 20 * s()]; });
      A(1.6, () => { burst('spark', () => [h.x, L().gy - 24 * s()], 22, { v: 170 }); sfx('sparkle'); bear.magic = 1; });
      A(2.0, () => { prop('bunny', { sk: () => 1.45, x: h.x, y: L().gy - 18 * s(), vy: -150 * s(), g: 380 * s(), floor: L().gy - 1 * s(), bounce: 0.25, vx: -12 * s(), life: 4.4 }); bear.act('cheer', { restart: true }); });
      A(2.4, () => { pup.act('bark', { restart: true }); api.woof(2); burst('heart', () => [h.x, L().gy - 44 * s()], 8, { v: 90, g: -30 }); });
      A(4.0, () => { pup.act('happy', { restart: true }); api.say('A bunny! ✦', 1300); }); A(6.8, () => fade(h, 0.6)); } },
    { t: 'Sing-along', d: 8, f(A, T) {
      A(0, () => { bear.act('idle', { talk: true, expr: 'happy', restart: true }); api.say('La la la ♪', 1800); });
      T(0, 6, dt => { if (Math.random() < dt * 3) burst('note', SN.mouth, 1, { v: 40, g: -40, life: 2, a0: -Math.PI * 0.8, spread: Math.PI * 0.6 }); });
      A(2.2, () => { pup.act('lookUp', { restart: true }); pop('Awoo~ ♪', JE.top, { life: 1.8 }); sfx('howl'); }); A(4.4, () => { pop('Awoooo ♪', JE.top, { life: 1.8 }); sfx('howl'); });
      A(6.3, () => { bear.act('giggle', { restart: true }); pup.act('happy', { restart: true }); }); } },
    { t: 'Drum beats', d: 7.6, f(A) { const d = prop('drum'); d.at = () => [G.x, G.y - 12 * k()];
      A(0, () => { bear.act('clap', { restart: true }); api.say('Boom, boom! ♪', 1500); pup.act('sit', { restart: true }); faceBear(); });
      for (let i = 0; i < 10; i++) A(0.4 + i * 0.55, () => { sfx('drum'); burst('note', () => [G.x, G.y - 40 * s()], 1, { v: 30, g: -50, life: 1.5 }); if (i % 2) pupHop(0.22, 0.28); if (i === 4) pup.act('happy', { restart: true }); });
      A(6.4, () => bear.act('bow', { restart: true })); A(6.8, () => fade(d, 0.5)); } },
    { t: 'Stretch time', d: 7, f(A) {
      A(0, () => { bear.act('yawn', { restart: true }); pup.act('bow', { restart: true }); api.say('Stretch… and breathe ✦', 2000); });
      A(4.0, () => { pup.act('bow', { restart: true }); bear.act('bow', { restart: true }); }); A(5.4, () => { bear.act('cheer', { restart: true }); pup.act('happy', { restart: true }); }); } },
    { t: 'Race!', d: 9.4, f(A) { const fl = prop('flag', { layer: 'back', s: 0 }); fl.at = () => [L().pupX + px(-3.4) - 46 * L().ps, L().gy]; tween(fl, 's', 1, 0.4);
      A(0, () => { api.say('Ready… set… GO!', 1600); J.face = -1; pup.act('bow', { restart: true }); bear.act('idle', { expr: 'determined', restart: true }); });
      A(1.6, () => { bearTo(-3.0, 0, 2.0, 'walk', 'idle', { o: { expr: 'determined' } }); pupTo(-3.4, 1.0, 'bark'); });
      A(2.7, () => { pop('I win!', () => { const t = JE.top(); return [t[0], t[1] - 34 * s()]; }); burst('confetti', JE.top, 16); }); A(3.1, () => api.woof(2)); A(3.7, () => { bear.act('idle', { expr: 'sleepy', restart: true }); api.say('Phew… you are fast!', 1700); });
      A(5.0, () => { bearTo(0, 0, 1.8, 'walk', 'idle'); pupTo(0, 1.6, 'sit', { face: 'bear' }); fade(fl, 1); }); } },
    { t: 'Jump rope', d: 8.6, f(A, T) { const st = prop('star', { s: 0.7 }); st.at = () => [J.x - 50 * L().ps, L().gy - 34 * s() + Math.sin(P.t * 3) * 2];
      const r = prop('jrope', { c: '#FFD27A' }); r.ends = () => [SN.handL(), [st.x, st.y]];
      A(0, () => { faceBear(); bear.act('point', { restart: true, dir: [-1, 0.4] }); api.say('Jump, jump!', 1400); pup.act('stand', { restart: true }); });
      T(0.4, 6.0, (dt, t) => { r.ph = TAU * t / 1.1; }); T(6.0, 9, () => { r.ph = 0; });
      for (let i = 0; i < 5; i++) A(0.725 + i * 1.1, () => { pupHop(0.62, 0.45); sfx('boing'); pop(String(i + 1), () => [J.x, L().gy - 80 * L().ps], { c: '#FFE7A8' }); });
      A(6.4, () => { fade(r, 0.4); fade(st, 0.4); bear.act('clap', { restart: true }); api.say('Five! ✦', 1300); pup.act('happy', { restart: true }); }); } },
    { t: 'Confetti shower', d: 6.6, f(A) {
      A(0, () => { bear.act('cheer', { restart: true }); sfx('horn'); burst('confetti', () => [J.x, L().gy - 100 * L().ps], 50, { v: 150, g: 120, life: 3, sz: 1.3 }); });
      A(1.2, () => pup.act('spin', { restart: true })); A(2.8, () => { pup.act('happy', { restart: true }); api.say('Party! ✦', 1400); burst('confetti', () => [G.x, G.y - 130 * s()], 36, { v: 140, g: 120, life: 3, sz: 1.3 }); }); } },
    { t: 'Birthday cupcake', d: 8.8, f(A) { const c = prop('cupcake'); c.at = SN.hands;
      A(0, () => { bear.act('hold', { restart: true, hold: 'none' }); faceBear(); api.say('Practice for Helen’s birthday ♡', 2000); P.look = () => [c.x, c.y]; });
      A(2.0, () => bearTo(-0.8, 0, 0.6, 'walk', 'hold', { o: { hold: 'none' }, endO: { hold: 'none' } })); A(2.8, () => { pup.act('pet', { restart: true }); pop('sniff sniff', JE.nose); });
      A(4.2, () => bear.act('blow', { restart: true, dir: [0, 1] })); A(4.7, () => { c.out = true; burst('smoke', () => [c.x, c.y - 24 * s()], 6, { v: 20, g: -40, life: 1.6, c: 'rgba(230,230,240,.7)' }); sfx('chime'); });
      A(5.2, () => { api.say('Make a wish ✦', 1800); burst('spark', SN.top, 14); bear.act('hold', { restart: true, hold: 'none' }); }); A(7.6, () => { fade(c, 0.5); bearTo(0, 0, 0.8, 'walk', 'idle'); }); } },
    { t: 'Surprise gift', d: 8, f(A) { const g = prop('gift', { open: 0 }); g.at = () => [gapX(), L().gy];
      A(0, () => { faceBear(); api.say('A present!', 1500); sfx('sparkle'); P.look = () => [g.x, g.y - 10 * s()]; bear.act('point', { restart: true, dir: [-1, 0.8] }); });
      A(1.2, () => pup.act('bow', { restart: true })); A(2.4, () => { tween(g, 'open', 1, 0.5); sfx('pop'); burst('confetti', () => [g.x, g.y - 20 * s()], 30, { v: 150 }); });
      A(2.6, () => { prop('star', { x: g.x, y: g.y - 20 * s(), vy: -70 * s(), life: 2.6 }); bear.act('cheer', { restart: true }); pup.act('happy', { restart: true }); burst('heart', () => [g.x, g.y - 30 * s()], 8, { v: 90, g: -30 }); });
      A(7.2, () => fade(g, 0.7)); } },
    { t: 'Say cheese!', d: 7.8, f(A) { const c = prop('camera', { s: 0 }); c.sk = () => 1.5; c.at = () => [gapX() + 30 * s(), L().gy - 150 * s() + Math.sin(P.t * 2) * 3]; tween(c, 's', 1.2, 0.4);
      A(0, () => { faceBear(); api.say('Say cheese!', 1500); pup.act('happy', { restart: true }); bear.act('wave', { restart: true }); P.look = () => [c.x, c.y]; });
      A(0.8, () => pop('3', () => [c.x, c.y - 20 * s()])); A(1.4, () => pop('2', () => [c.x, c.y - 20 * s()])); A(2.0, () => pop('1', () => [c.x, c.y - 20 * s()]));
      A(2.6, () => { P.flash = 1; sfx('flash'); }); A(3.1, () => { fade(c, 0.3); prop('polaroid', { sk: () => 1.7, x: c.x, y: c.y, vy: 14 * s(), vr: 0.1, rot: -0.12, life: 4.4 }); }); A(3.6, () => api.say('One for Helen ♡', 1600)); } },
    { t: () => (N() ? 'A moonbow' : 'Magic rainbow'), d: 8, f(A) { const R0 = Math.max(60 * s(), Math.min((G.x - J.x) / 2 + 70 * s(), L().gy - api.cdBottom() - 14)), band = Math.max(4, R0 * 0.07);
      const r = prop('rainbow', { R: R0, band, grow: 0, pale: N(), layer: 'back' }); r.at = () => [(G.x + J.x) / 2, L().gy];
      A(0, () => { bear.act('point', { restart: true, dir: [-0.3, -1] }); sfx('sparkle'); api.say(N() ? 'A moonbow, just for Helen ✦' : 'A rainbow! ✦', 1800); P.look = () => [(G.x + J.x) / 2, L().gy - R0]; });
      A(0.2, () => tween(r, 'grow', 1, 1.6)); A(1.4, () => pup.act('lookUp', { restart: true })); A(3.6, () => { bear.act('cheer', { restart: true }); pup.act('happy', { restart: true }); }); A(7.2, () => fade(r, 0.8)); } },
    { t: () => (N() ? 'Wish on a shooting star' : 'A wishing star'), d: 7.6, f(A) { const a = free(40, 40, api.W() * 0.18, 90), b = free(40, 40, api.W() * 0.8, 150), st = prop('streak', { layer: 'back' });
      st.fn = tt => [lerp(a[0], b[0], clamp(tt / 1.7, 0, 1)), lerp(a[1], b[1], clamp(tt / 1.7, 0, 1))]; st.rotFn = () => Math.atan2(b[1] - a[1], b[0] - a[0]) - Math.atan2(28, 70);
      A(0, () => { bear.act('lookUp', { restart: true }); pup.act('lookUp', { restart: true }); sfx('sparkle'); P.look = () => [st.x, st.y]; }); A(1.0, () => api.say(N() ? 'A shooting star! Make a wish ✦' : 'A wishing star! ✦', 2200));
      A(1.8, () => fade(st, 0.3)); A(3.0, () => { bear.act('hug', { restart: true, expr: 'soft' }); burst('spark', SN.top, 10); }); A(5, () => pup.act('happy', { restart: true })); } },
    { t: () => (N() ? 'Counting stars' : 'Counting clouds'), d: 7.8, f(A) {
      A(0, () => { bear.act('point', { restart: true, dir: [-0.4, -1] }); pup.act('lookUp', { restart: true }); });
      for (let i = 0; i < 5; i++) A(0.6 + i * 1.0, () => { const p = free(50, 40, api.W() * (0.15 + i * 0.17), 80 + (i % 2) * 70);
        if (N()) { burst('spark', p, 6, { v: 40, g: 0, spread: TAU }); prop('star', { x: p[0], y: p[1], s: 0.8, life: 3.2 - i * 0.3, layer: 'back' }); } else prop('cloudlet', { x: p[0], y: p[1], s: 1.6, life: 3.4 - i * 0.3, vx: 8 * s(), layer: 'back' });
        pop(String(i + 1), [p[0], p[1] - 20], { c: '#FFE7A8' }); api.woof(1); P.look = () => p; });
      A(6.0, () => { api.say(api.days() > 1 ? `${api.days()} more sleeps! ✦` : 'Almost time! ✦', 1600); bear.act('cheer', { restart: true }); }); } },
    { t: 'Juggling', d: 7.6, f(A) { const bs = [0, 1, 2].map(i => prop('ball', { c: COLS[i], s: 0.8 }));
      bs.forEach((b, i) => { b.fn = tt => { const ph = tt * 3.4 + i * TAU / 3, [hx, hy] = SN.hands(); return [hx + Math.cos(ph) * 24 * s(), hy - 46 * s() - Math.abs(Math.sin(ph)) * 64 * s()]; }; });
      A(0, () => { bear.act('hold', { restart: true, hold: 'none' }); api.say('Look, Jessi!', 1400); pup.act('lookUp', { restart: true }); P.look = () => [bs[0].x, bs[0].y]; }); A(2.5, () => pop('Wow!', JE.top));
      A(6.6, () => { bs.forEach(b => { b.fn = null; b.vy = -40 * s(); b.vx = (Math.random() - 0.5) * 80 * s(); b.g = 600 * s(); b.floor = L().gy - 7 * s(); }); bear.act('bow', { restart: true }); pup.act('happy', { restart: true }); });
      A(7.3, () => bs.forEach(b => fade(b, 0.3))); } },
    { t: 'Spin together', d: 6, f(A) {
      A(0, () => { bear.act('spin', { restart: true }); pup.act('spin', { restart: true }); sfx('whoosh'); }); A(1.4, () => { bear.act('spin', { restart: true }); pup.act('spin', { restart: true }); burst('spark', mid, 14, { spread: TAU }); });
      A(3, () => { bear.act('giggle', { restart: true }); pup.act('happy', { restart: true }); api.say('Dizzy! ✦', 1300); }); } },
    { t: 'A flower for Jessi', d: 8, f(A) { const fl = prop('flower', { c: pick(['#FF8FB8', '#FFD27A', '#B9A3FF']), s: 0 }); const gx = gapX(); fl.at = () => [gx, L().gy - 15 * s()];
      A(0, () => { tween(fl, 's', 1, 0.8); burst('spark', [gx, L().gy - 12 * s()], 8, { v: 40 }); sfx('sparkle'); bear.act('point', { restart: true, dir: [-1, 0.8] }); faceBear(); });
      A(1.6, () => { fl.at = SN.hands; bear.act('hold', { restart: true, hold: 'none' }); }); A(2.2, () => bearTo(-0.8, 0, 0.6, 'walk', 'hold', { o: { hold: 'none' }, endO: { hold: 'none' } }));
      A(3.0, () => { pup.act('pet', { restart: true }); pop('sniff…', JE.nose); }); A(4.4, () => { pop('Achoo!', JE.nose); sfx('pop'); burst('petal', JE.nose, 12, { c: fl.c, v: 110 }); pup.act('bark', { restart: true }); });
      A(5.2, () => { bear.act('giggle', { restart: true }); api.say('Bless you, Jessi!', 1600); }); A(7, () => { fade(fl, 0.4); bearTo(0, 0, 0.8, 'walk', 'idle'); }); } },
    { t: 'Tickle time', d: 6.8, f(A, T) {
      A(0, () => { bearTo(-1.0, 0, 0.6, 'walk', 'giggle'); faceBear(); }); A(0.8, () => { pup.act('roll', { restart: true }); api.say('Tickle tickle!', 1500); }); A(2.3, () => pup.act('roll', { restart: true }));
      T(1, 4, dt => { if (Math.random() < dt * 5) pop(pick(['hehe', 'haha', '♡']), [lerp(G.x, J.x, 0.4 + Math.random() * 0.3), L().gy - 70 * s()], { life: 1 }); });
      A(4.2, () => { pup.act('happy', { restart: true }); bearTo(0, 0, 0.8, 'walk', 'idle'); }); } },
    { t: 'Party hats', d: 6.8, f(A) { const h1 = prop('hat', { c: '#B98CFF', s: 0 }), h2 = prop('hat', { c: '#FF8FB8', s: 0 });
      h1.at = SN.top; h1.rotAt = SN.ang; h1.sk = () => k() * (G.po.s || 1) / s() * 1.15; h2.at = JE.top; h2.rotAt = () => JE.ang() * 0.6 + ((J.fx || J.face) < 0 ? 0.25 : -0.25); h2.sk = () => L().ps / s() * 0.62;
      A(0, () => { tween(h1, 's', 1, 0.4); tween(h2, 's', 1, 0.4); sfx('horn'); burst('confetti', mid, 20); }); A(0.6, () => { bear.act('cheer', { restart: true }); pup.act('happy', { restart: true }); api.say('Party time! ✦', 1500); });
      A(6.2, () => { fade(h1, 0.4); fade(h2, 0.4); }); } },
    { t: 'Cool shades', d: 6.6, f(A) { const s1 = prop('shades', { s: 0 }), s2 = prop('shades', { s: 0, one: true, r: 4.4 }); s1.at = SN.eyes; s1.rotAt = SN.ang; s1.sk = () => k() * (G.po.s || 1) / s();
      s2.at = JE.eye; s2.rotAt = JE.ang; s2.sk = () => L().ps / s(); s2.flipAt = () => ((J.fx || J.face) < 0 ? -1 : 1);
      A(0, () => { tween(s1, 's', 1, 0.35); tween(s2, 's', 1, 0.35); sfx('click'); }); A(0.6, () => { bear.act('idle', { expr: 'wink', restart: true }); pup.act('sit', { restart: true }); api.say('So cool 😎', 1500); });
      A(2.4, () => bear.act('dance', { restart: true })); A(4.4, () => bear.act('idle', { expr: 'wink', restart: true })); A(6.0, () => { fade(s1, 0.4); fade(s2, 0.4); }); } },
    { t: 'Rainy day', d: 8.2, f(A) { const um = prop('umbrella', { s: 0 }); um.at = () => [(G.x + J.x) / 2, Math.min(SN.top()[1], JE.top()[1]) - 34 * s()]; P.umb = um;
      A(0, () => weather('rain', 0, 6.4, 80)); A(0.6, () => { pup.act('alert', { restart: true }); pop('?!', JE.top); }); A(1.2, () => { bearTo(-0.6, 0, 0.6, 'walk', 'lookUp'); tween(um, 's', 1, 0.5); api.say('Under here, Jessi!', 1500); });
      A(2.0, () => pupTo(0.5, 0.5, 'happy', { face: 'bear' })); A(6.8, () => { fade(um, 0.6); bearTo(0, 0, 0.8, 'walk', 'idle'); pupTo(0, 0.4, 'spin'); burst('drop', JE.back, 12, { v: 100, c: '#BFE6FF', life: 0.7 }); });
      A(7.6, () => { P.umb = null; pup.act('happy', { restart: true }); }); } },
    { t: 'Snow day', d: 8.4, f(A) { const sm = prop('snowman', { s: 0 }); sm.at = () => [G.x + 62 * s(), L().gy]; sm.sk = () => 1.9;
      A(0, () => weather('snow', 0, 7, 32)); A(0.8, () => { pup.act('lookUp', { restart: true }); api.say('Snow! ✦', 1300); }); A(2, () => { pupHop(0.6, 0.5); pop('nom!', JE.mouth); }); A(3.2, () => pupHop(0.6, 0.5));
      A(3.6, () => { tween(sm, 's', 1, 1.2); bear.act('hold', { restart: true, hold: 'none' }); }); A(5.2, () => { api.say('A snow-Snowki! ♡', 1600); bear.act('cheer', { restart: true }); }); A(7.8, () => fade(sm, 0.6)); } },
    { t: 'Leaf pile jump', d: 7.2, f(A) { const lp = prop('leaves'); lp.at = () => [L().pupX + px(-1.6) - 30 * L().ps, L().gy]; lp.sk = () => 1.4;
      A(0, () => { J.face = -1; pup.act('bow', { restart: true }); api.say('Jump in, Jessi!', 1400); }); A(1.4, () => pupTo(-1.6, 0.5, 'stand')); A(1.9, () => pupHop(1.0, 0.6));
      A(2.45, () => { fade(lp, 0.15); burst('leaf', () => [lp.x, L().gy - 12 * s()], 30, { v: 170, g: 140, life: 2, c: '#E9A23B' }); sfx('splash'); bear.act('clap', { restart: true }); pup.act('happy', { restart: true }); });
      A(4.2, () => pupTo(0, 0.9, 'happy', { face: 'bear' })); } },
    { t: () => (N() ? 'Stargazing' : 'Cloud spotting'), d: 7.8, f(A) { const tl = prop('telescope', { s: 0, h: 64 }); tl.at = () => [G.x - 26 * k(), G.y - 64 * k()]; tl.sk = () => k() / s();
      A(0, () => { tween(tl, 's', 1, 0.4); bear.act('think', { restart: true }); api.say(N() ? 'I can see the moon!' : 'That cloud looks like a bunny!', 1900); pup.act('lookUp', { restart: true }); });
      A(2.6, () => pupTo(-0.3, 0.4, 'lookUp')); A(4, () => { const p = free(60, 50, api.W() * 0.3, 90); pop(N() ? '☾' : '☁', p, { c: '#FFF3C8', life: 2 }); bear.act('cheer', { restart: true }); }); A(7, () => fade(tl, 0.6)); } },
    { t: 'Sky writing', d: 8.6, f(A, T) { const at = free(200 * s(), 50 * s(), api.W() / 2, lerp(api.cdBottom(), L().gy, 0.3)), w = prop('skyword', { text: 'Helen ♡', dur: 2.6, layer: 'back', t: -1.2 }); w.at = () => at;
      A(0, () => { bearTo((at[0] - 80 * s() - L().snowX) / U(), (at[1] + 70 * s() - L().gy) / U(), 1.2, 'fly', 'fly'); bear.magic = 1; sfx('sparkle'); P.look = () => at; });
      T(1.2, 3.8, (dt, t) => { G.po.x = bx((at[0] - 80 * s() + t / 2.6 * 160 * s() - L().snowX) / U()); if (Math.random() < dt * 25) burst('spark', SN.hands, 1, { v: 30, g: 10 }); });
      A(1.4, () => pup.act('lookUp', { restart: true })); A(4.0, () => { bearTo(0, 0, 1.2, 'fly', 'cheer'); api.woof(2); }); A(7.8, () => fade(w, 0.8)); } },
    { t: 'A love letter', d: 8.6, f(A) { const e = prop('envelope', { s: 0 }); e.at = () => [L().pupX + px(-3.6) - 30 * L().ps, L().gy - 6 * s()];
      A(0, () => { tween(e, 's', 1.2, 0.4); burst('spark', e.at, 10, { v: 60 }); sfx('sparkle'); pup.act('alert', { restart: true }); J.face = -1; });
      A(0.6, () => pupTo(-3.6, 1.0, 'stand')); A(1.7, () => { e.at = JE.mouth; e.rot = 0.2; sfx('pop'); }); A(2.0, () => pupTo(0.6, 1.2, 'sit', { face: 'bear' }));
      A(3.4, () => { e.at = SN.hands; e.rot = 0; bear.act('hold', { restart: true, hold: 'none' }); sfx('pop'); });
      A(4.2, () => { bear.act('hold', { restart: true, hold: 'none', expr: 'love' }); burst('heart', SN.hands, 10, { v: 90, g: -30 }); api.say('A letter for Helen ♡', 1800); }); A(7.6, () => fade(e, 0.5)); } },
    { t: 'Countdown cheer', d: 6.6, f(A) {
      A(0, () => { bear.act('point', { restart: true, dir: [-0.2, -1] }); pup.act('alert', { restart: true }); }); A(0.8, () => api.say(api.days() > 1 ? `Only ${api.days()} days to go!` : 'It’s almost here!', 1800));
      A(2.2, () => { bear.act('cheer', { restart: true }); pup.act('bark', { restart: true }); api.woof(2); burst('confetti', mid, 24); }); A(4, () => pup.act('spin', { restart: true })); } },
    { t: 'Nose balance', d: 7.4, f(A) { const b = prop('ball', { c: '#8EC9FF' }); b.at = () => { const [x, y] = JE.nose(); return [x + Math.sin(P.t * 4) * 2.5 * s(), y - 9 * s()]; };
      A(0, () => { pup.act('sit', { restart: true }); J.face = 1; api.say('Steady… steady…', 1600); P.look = () => [b.x, b.y]; });
      A(3.6, () => { b.at = null; [b.x, b.y] = JE.nose(); b.y -= 9 * s(); b.vx = 50 * s(); b.vy = -90 * s(); b.g = 600 * s(); b.floor = L().gy - 9 * s(); sfx('boing'); });
      A(4, () => { bear.act('clap', { restart: true }); api.say('Bravo! ✦', 1300); pup.act('happy', { restart: true }); }); A(7, () => fade(b, 0.4)); } },
    { t: 'Roll-over contest', d: 7.4, f(A) {
      A(0, () => { pup.act('roll', { restart: true }); api.say('My turn next!', 1400); });
      A(2.0, () => { bear.act('idle', { expr: 'determined', restart: true }); tween(G.po, 'r', TAU, 1.0, ease, () => { G.po.r = 0; }); tween(G.po, 'x', bx(0.9), 1.0); });
      A(3.0, () => { bear.act('idle', { expr: 'oops', restart: true }); pop('oops!', SN.top); sfx('boing'); tween(G.po, 'r', -0.18, 0.2, ease, () => tween(G.po, 'r', 0, 0.5)); });
      A(4.2, () => { bear.act('giggle', { restart: true }); pup.act('happy', { restart: true }); api.say('You win again!', 1400); tween(G.po, 'x', 0, 0.8); }); } },
    { t: 'Flying lesson', d: 8, f(A) {
      A(0, () => { bearTo(0, -1.4, 1.0, 'fly', 'fly'); api.say('Come on, fly!', 1400); bear.magic = 1; }); A(1.4, () => pup.act('flip', { restart: true })); A(2.8, () => pup.act('flip', { restart: true }));
      A(4.0, () => bearTo(0, 0, 1.0, 'fly', 'hug')); A(5.2, () => { api.say('Paws are better ♡', 1500); pup.act('happy', { restart: true }); burst('heart', mid, 6); }); } },
    { t: 'Bedtime story', d: 9, f(A) { const b = prop('book'); b.at = SN.hands;
      A(0, () => { bear.act('hold', { restart: true, talk: true, hold: 'none' }); api.say('Once upon a time…', 2000); pup.act('lie', { restart: true }); });
      A(3.2, () => pup.act('yawn', { restart: true })); A(5, () => { pup.act('sleep', { restart: true }); bear.act('shh', { restart: true }); api.say('Shh… ♡', 1500); b.at = null; b.vy = 0; b.g = 400 * s(); b.floor = L().gy - 9 * s(); });
      A(8.2, () => { fade(b, 0.4); pup.act('wake', { restart: true }); }); } },
    { t: 'Copy me!', d: 8.4, f(A) { const seq = [['bow', 'bow'], ['spin', 'spin'], ['paw', 'wave'], ['bark', 'cheer']];
      seq.forEach(([pa, ba], i) => { A(0.6 + i * 1.9, () => { pup.act(pa, { restart: true }); if (pa === 'bark') api.woof(1); }); A(1.4 + i * 1.9, () => bear.act(ba, { restart: true })); });
      A(0, () => { api.say('I’ll copy you!', 1400); faceBear(); }); A(8, () => bear.act('giggle', { restart: true })); } },
    { t: 'Hopscotch', d: 8, f(A) { const hs = prop('hop', { layer: 'back' }); const home = L().pupX; hs.step = 0.55 * U(); hs.at = () => [home - 26 * L().ps, L().gy + 3 * s()];
      A(0, () => { J.face = -1; api.say('Hop, Jessi!', 1300); pup.act('stand', { restart: true }); });
      for (let i = 0; i < 4; i++) A(0.8 + i * 0.9, () => { pupTo(-0.55 * (i + 1), 0.5, 'stand', { act: 'stand' }); pupHop(0.5, 0.5); sfx('boing'); });
      A(4.6, () => { bear.act('clap', { restart: true }); burst('spark', JE.top, 10); pop('4!', JE.top); }); A(5.4, () => pupTo(0, 1.0, 'happy', { face: 'bear' })); A(7.4, () => fade(hs, 0.5)); } },
    { t: 'Music box', d: 8, f(A, T) { const mb = prop('musicbox'); mb.at = () => [gapX(), L().gy];
      A(0, () => { api.say('A little lullaby ♪', 1600); bear.act('dance', { restart: true }); sfx('chime'); });
      T(0, 7, dt => { if (Math.random() < dt * 2.5) burst('note', () => [mb.x, L().gy - 22 * s()], 1, { v: 30, g: -30, life: 2.2, a0: -Math.PI * 0.75, spread: Math.PI * 0.5 }); });
      A(2, () => pup.act('happy', { restart: true })); A(4.4, () => pup.act('lie', { restart: true })); A(7.4, () => fade(mb, 0.5)); } },
    { t: 'Big hug', d: 7, f(A, T) {
      A(0, () => { bearTo(-1.1, 0, 0.8, 'walk', 'idle'); faceBear(); pup.act('sit', { restart: true }); }); A(1.0, () => { bear.act('hug', { restart: true, expr: 'love' }); pup.act('pet', { restart: true }); api.say('Love you, Jessi ♡', 1600); sfx('chime'); });
      T(1.2, 4.8, dt => { if (Math.random() < dt * 4) burst('heart', mid, 1, { v: 50, g: -40 }); }); A(5, () => bearTo(0, 0, 0.8, 'walk', 'idle')); } },
    { t: 'Bubble wand', d: 6.8, f(A) {
      A(0, () => { bear.act('blow', { restart: true, dir: [-0.4, -1] }); faceBear(); });
      for (let i = 0; i < 7; i++) A(0.2 + i * 0.25, () => { const [x, y] = SN.mouth(); prop('bubble', { x, y: y - 6 * s(), vx: (Math.random() - 0.6) * 90 * s(), vy: (-50 - Math.random() * 30) * s(), r: 9 + Math.random() * 5, life: 4, popAt: 1.4 + Math.random() * 1.8 }); sfx('blip'); });
      A(1.4, () => pup.act('lookUp', { restart: true })); A(3.6, () => { pup.act('bark', { restart: true }); api.woof(1); bear.act('giggle', { restart: true }); }); } },
    { t: () => (N() ? 'Fireflies' : 'Dandelion wishes'), d: 7.8, f(A, T) {
      if (N()) {
        A(0, () => { api.say('Fireflies! ✦', 1500); bear.act('lookUp', { restart: true, expr: 'happy' }); });
        T(0.2, 6.8, dt => { if (Math.random() < dt * 10 && P.parts.length < 520) P.parts.push({ kind: 'fly', x: lerp(J.x - 120 * s(), G.x + 120 * s(), Math.random()), y: L().gy - Math.random() * 200 * s(), vx: (Math.random() - 0.5) * 20 * s(), vy: -10 * s(), g: 0, life: 2.4, t: 0, r: 0, vr: 0, c: '#FFE38A', sz: 1, wob: Math.random() * TAU }); });
        A(1.6, () => { pupHop(0.7, 0.5); pup.act('alert', { restart: true }); }); A(3.6, () => pupHop(0.7, 0.5)); A(5.6, () => { pup.act('happy', { restart: true }); bear.act('cheer', { restart: true }); });
      } else {
        const d = prop('dandelion', { left: 18 }); d.at = SN.hands;
        A(0, () => { bear.act('hold', { restart: true, hold: 'none' }); api.say('Make a wish, Jessi ✦', 1600); faceBear(); });
        A(1.6, () => { bear.act('blow', { restart: true, dir: [1, -0.4] }); sfx('whoosh'); }); T(1.8, 3.6, dt => { if (d.left > 0 && Math.random() < dt * 12) { d.left--; burst('seed', SN.hands, 1, { v: 60, g: -14, life: 3.6, a0: -0.9, spread: 0.6 }); } });
        A(2.4, () => pup.act('lookUp', { restart: true })); A(3.8, () => pupHop(0.6, 0.45)); A(5.4, () => { fade(d, 0.4); bear.act('cheer', { restart: true }); pup.act('happy', { restart: true }); });
      } } },
    { t: () => (N() ? 'Goodnight wave' : 'Hello wave'), d: 6, f(A) {
      A(0, () => { bear.act('wave', { restart: true }); pup.act('paw', { restart: true }); api.say(api.tod() === 'night' ? 'Goodnight, Helen ♡ sweet dreams!' : api.tod() === 'morning' ? 'Good morning, Helen! ☀' : 'Hi Helen! We’re waiting with you ♡', 2200); });
      A(2.4, () => burst('heart', mid, 10, { v: 80, g: -30 })); A(3.6, () => { bear.act('hug', { restart: true, expr: 'soft' }); pup.act('happy', { restart: true }); }); } }
  ];
  const title = a => (typeof a.t === 'function' ? a.t() : a.t);

  // ---------------------------------------------------------------- endless games, chosen by the time of day. Snowki does something with a prop, Jessi does something with it,
  // then a finale. 4 times of day × 10 props × 9 things Snowki does × 9 things Jessi does × 6 finales = 19,440 different games (besides the 52 above).
  const WORD = { ball: 'ball', frisbee: 'frisbee', balloon: 'balloon', bone: 'bone', kite: 'kite', butterfly: 'butterfly', plane: 'paper plane', flower: 'flower', hat: 'party hat', shades: 'sunglasses', book: 'storybook', drum: 'drum', camera: 'camera', cupcake: 'cupcake', gift: 'gift', envelope: 'love letter', polaroid: 'photo', tophat: 'top hat', bunny: 'bunny', musicbox: 'music box', umbrella: 'umbrella' };
  const FLOATY = new Set(['balloon', 'kite', 'butterfly', 'plane']);
  const POPT = { balloon: () => ({ c: pick(COLS) }), flower: () => ({ c: pick(COLS) }), hat: () => ({ c: pick(COLS) }), butterfly: () => ({ c: pick(COLS), glow: N() }), kite: () => ({ glow: N() }) };
  const TIMES = {
    morning: { fx: 'petal', props: ['ball', 'flower', 'butterfly', 'balloon', 'kite', 'cupcake', 'bunny', 'plane', 'envelope', 'hat'], places: ['dewy lawn', 'sunny porch', 'garden path', 'sunrise hill', 'breakfast corner', 'little meadow'],
      open: ['Good morning! The {place} is waking up, and look: {a}!', 'Dew on the grass… and {a} for us!', 'Rise and shine, Helen! {The} {prop} wants to play!', 'First game of the day: {the} {prop}!', 'Breakfast can wait. {A} first!', 'The birds are singing. {A} is calling!'],
      close: ['What a start to the day! ♡', 'Best morning ever, Helen!', 'Ten out of ten! Now… breakfast?', 'Sunshine and giggles ✦', 'Helen, tell me you saw that!'] },
    day: { fx: 'confetti', props: ['frisbee', 'ball', 'kite', 'plane', 'bone', 'camera', 'shades', 'balloon', 'drum', 'umbrella'], places: ['sunny field', 'shady tree', 'park bench', 'garden', 'dusty road', 'picnic blanket'],
      open: ['Sunny at the {place}! Time for {a}!', 'Helen, watch this: {the} {prop}!', 'Lunchtime games! Who wants {a}?', 'Perfect weather for a {prop} game!', 'Okay, okay: {a}. Ready?', 'Sun’s out, {prop}’s out!'],
      close: ['That was SO fun!', 'Again again again!', 'Jessi, you’re a champion!', 'Round of applause!', 'I’m exhausted. Let’s go again!'] },
    dusk: { fx: 'leaf', props: ['kite', 'polaroid', 'camera', 'book', 'envelope', 'gift', 'plane', 'bone', 'musicbox', 'tophat'], places: ['golden hill', 'quiet lane', 'old bridge', 'sunset beach', 'lantern square', 'evening porch'],
      open: ['Golden hour at the {place}… {a}!', 'The sky is all pink. Perfect for {a}.', 'One more game before the stars: {the} {prop}!', 'Sunset game: {the} {prop}!', 'Everything glows now, even {the} {prop}.', 'Let’s catch the last light with {a}!'],
      close: ['Look at those colours ♡', 'Golden hour makes everything better.', 'The day’s ending but the fun isn’t.', 'Sunset score: ten out of ten.', 'Aww, even the sky clapped.'] },
    night: { fx: 'fly', props: ['book', 'musicbox', 'butterfly', 'kite', 'cupcake', 'gift', 'envelope', 'polaroid', 'hat', 'bunny'], places: ['starry yard', 'moonlit porch', 'quiet window', 'firefly path', 'midnight garden', 'cosy corner'],
      open: ['Shh… a quiet game with {a}.', 'The stars are out. Let’s play with {a}, gently.', 'Moonlight game: {the} {prop}!', 'Helen, it’s late. We’ll be very gentle with {the} {prop}.', 'A night-time {prop} game. Whisper rules!', 'The fireflies are watching… {a}!'],
      close: ['Sweet dreams game ♡', 'The stars liked that one ✦', 'Okay… that was peaceful.', 'Nighty-night, {the} {prop}!', 'Shh… whisper-clap ♡'] }
  };
  const fmt = (tpl, kind, place) => { const w = WORD[kind], an = /^[aeiou]/.test(w) ? 'an ' : 'a ', cap = x => x[0].toUpperCase() + x.slice(1);
    return tpl.replace('{a}', an + w).replace('{A}', cap(an + w)).replace('{the}', 'the ' + w).replace('{The}', 'The ' + w).replace(/\{prop\}/g, w).replace('{place}', place).replace('{Place}', cap(place)); };
  const TFX = () => (TIMES[api.tod()] || TIMES.day).fx;
  const near = p => clamp((p.x - L().pupX) / U() - 0.9, -3.8, 2.4);
  const grab = p => { p.path = null; p.fn = null; p.at = JE.mouth; p.vx = p.vy = p.g = 0; p.floor = 0; sfx('pop'); };
  const drop = (p, from) => { p.at = null; p.path = null; p.fn = null; if (from) [p.x, p.y] = from(); if (FLOATY.has(p.kind)) { p.vx = 12 * s(); p.vy = -24 * s(); p.g = -6 * s(); p.floor = 0; } else { p.vx = 30 * s(); p.vy = -60 * s(); p.g = 640 * s(); p.floor = L().gy - 9 * s(); } };
  const throwTo = (p, end, dur, lift) => { const a = [p.x, p.y]; p.at = null; p.fn = null; p.path = { a, c: arcC(a, end(), lift * s()), end, t: 0, dur, spin: 6 }; };
  const runTo = (A, p, t) => A(t, () => { P.look = () => [p.x, p.y]; pup.act('alert', { restart: true }); pupTo(near(p), 0.9, 'stand'); });
  const BM = [   // what Snowki does with it (0.8 – 3.8 s)
    { t: n => `Tossing the ${n}`, f(A, p) { A(1.2, () => bear.act('hold', { restart: true, hold: 'none' })); A(1.8, () => { throwTo(p, () => [gapX(), L().gy - 14 * s()], 1.1, 150); bear.act('cheer', { restart: true }); sfx('whoosh'); }); A(3.2, () => drop(p)); } },
    { t: n => `Showing off the ${n}`, f(A, p) { A(1.4, () => { p.at = SN.above; bear.act('cheer', { restart: true }); sfx('chime'); burst('spark', SN.top, 10, { v: 110 }); }); A(3.4, () => { p.at = SN.hands; bear.act('hold', { restart: true, hold: 'none' }); }); } },
    { t: n => `Hiding the ${n}`, f(A, p) { A(1.0, () => { bear.act('cover', { restart: true }); p.a = 1; tween(p, 'a', 0, 0.3); }); A(2.6, () => bear.act('peek', { restart: true })); A(3.4, () => { tween(p, 'a', 1, 0.3); bear.act('cheer', { restart: true }); pop('Ta-da!', SN.top); sfx('pop'); }); } },
    { t: n => `Dancing with the ${n}`, f(A, p) { A(1.0, () => { bear.act('dance', { restart: true }); p.rotFn = t => Math.sin(t * 5) * 0.4; }); for (let i = 0; i < 4; i++) A(1.2 + i * 0.7, () => burst('note', SN.top, 2, { v: 70, g: -50 })); A(3.8, () => { p.rotFn = null; }); } },
    { t: n => `Offering the ${n}`, f(A, p) { A(1.0, () => { bearTo(-1.4, 0, 0.9, 'walk', 'hold', { endO: { hold: 'none' } }); api.say('For you, Jessi!', 1600); }); A(3.4, () => bear.act('hold', { restart: true, hold: 'none' })); } },
    { t: n => `Blowing the ${n} away`, f(A, p) { A(1.0, () => { bear.act('blow', { restart: true, dir: [-1, -0.3] }); sfx('whoosh'); }); A(1.8, () => { throwTo(p, () => [gapX() - 24 * s(), L().gy - 12 * s()], 1.2, 70); burst('seed', SN.mouth, 6, { v: 70, g: -14, life: 2 }); }); A(3.3, () => drop(p)); } },
    { t: n => `Balancing the ${n}`, f(A, p) { A(1.0, () => { p.at = SN.top; p.rotFn = t => Math.sin(t * 6) * 0.25; bear.act('idle', { restart: true, expr: 'determined' }); }); A(2.4, () => pop('Steady…', SN.above)); A(3.5, () => { p.rotFn = null; p.at = SN.hands; bear.act('cheer', { restart: true }); }); } },
    { t: n => `Cheering for the ${n}`, f(A) { A(1.0, () => { bear.act('cheer', { restart: true }); burst(TFX(), SN.top, 10, { v: 110 }); }); A(2.6, () => { bear.act('clap', { restart: true }); sfx('clap'); }); } },
    { t: n => `Pointing at the ${n}`, f(A) { A(1.0, () => { bear.act('point', { restart: true, dir: [-1, -0.5] }); api.say('Look, Jessi!', 1500); burst('spark', SN.hands, 6, { v: 80 }); }); A(2.8, () => pup.act('alert', { restart: true })); } }
  ];
  const JM = [   // what Jessi does with it (4 – 7.6 s)
    { t: 'Jessi fetches it', f(A, p) { runTo(A, p, 4.0); A(5.0, () => { grab(p); pop('Got it!', JE.top); pupTo(0.7, 1.0, 'sit', { face: 'bear' }); }); A(6.5, () => { drop(p, JE.mouth); bear.act('clap', { restart: true }); api.say('Good girl! ♡', 1500); burst('heart', JE.top, 5, { v: 70, g: -40 }); pup.act('happy', { restart: true }); }); } },
    { t: 'Jessi balances it', f(A, p) { runTo(A, p, 4.0); A(5.0, () => { grab(p); pup.act('sit', { restart: true }); }); A(5.6, () => { p.at = JE.top; p.rotFn = t => Math.sin(t * 7) * 0.3; pupHop(0.3, 0.3); pop('Careful…', JE.top); }); A(7.0, () => { p.rotFn = null; drop(p, JE.top); pup.act('happy', { restart: true }); }); } },
    { t: 'Jessi parades with it', f(A, p) { runTo(A, p, 4.0); A(5.0, () => { grab(p); pupTo(-3.2, 1.0, 'stand'); }); A(6.2, () => pupTo(1.2, 1.1, 'stand')); A(7.3, () => { pupTo(0.7, 0.6, 'sit', { face: 'bear' }); drop(p, JE.mouth); api.woof(1, 'happy'); }); } },
    { t: 'Jessi spins with it', f(A, p) { runTo(A, p, 4.0); A(5.0, () => { grab(p); pup.act('spin', { restart: true }); }); A(6.7, () => { drop(p, JE.mouth); pup.act('happy', { restart: true }); sfx('sparkle'); }); } },
    { t: 'Jessi buries it', f(A, p) { runTo(A, p, 4.0); A(5.0, () => { grab(p); pupTo(-3.4, 1.1, 'stand'); }); A(6.3, () => { drop(p, JE.mouth); pup.act('paw', { restart: true }); burst('crumb', JE.paw, 8, { v: 90, g: 400, c: '#7A5A3A' }); }); A(7.3, () => { fade(p, 0.5); pop('Shh, a secret!', JE.top); pupTo(0.7, 1.0, 'sit', { face: 'bear' }); }); } },
    { t: 'Jessi guards it', f(A, p) { runTo(A, p, 4.0); A(5.0, () => grab(p)); A(5.4, () => { p.at = JE.paw; pup.act('alert', { restart: true }); api.woof(2, 'angry'); bear.act('shy', { restart: true }); }); A(7.0, () => { drop(p, JE.paw); bear.act('giggle', { restart: true }); pup.act('happy', { restart: true }); }); } },
    { t: 'Jessi tosses it up', f(A, p) { runTo(A, p, 4.0); A(5.0, () => grab(p)); A(5.3, () => { p.at = null; [p.x, p.y] = JE.mouth(); p.vx = 0; p.vy = -330 * s(); p.g = 820 * s(); p.floor = 0; pup.act('alert', { restart: true }); }); A(6.4, () => { grab(p); pop('Caught!', JE.top); pupHop(0.5, 0.4); }); A(7.2, () => drop(p, JE.mouth)); } },
    { t: 'Jessi bows with it', f(A, p) { runTo(A, p, 4.0); A(5.0, () => grab(p)); A(5.4, () => pup.act('bow', { restart: true })); A(6.8, () => { drop(p, JE.mouth); pup.act('paw', { restart: true }); }); } },
    { t: 'Jessi rolls over', f(A, p) { runTo(A, p, 4.0); A(5.0, () => { grab(p); }); A(5.7, () => { drop(p, JE.mouth); pup.act('roll', { restart: true }); }); A(7.3, () => { pup.act('happy', { restart: true }); api.woof(1, 'excited'); }); } }
  ];
  const FIN = [   // the finale (7.6 – 9.6 s)
    { f(A) { A(7.6, () => { burst('confetti', mid, 22, { v: 160 }); bear.act('cheer', { restart: true }); pup.act('happy', { restart: true }); sfx('sparkle'); }); } },
    { f(A) { A(7.6, () => { burst('heart', mid, 10, { v: 80, g: -30 }); bear.act('hug', { restart: true, expr: 'soft' }); pup.act('happy', { restart: true }); }); } },
    { f(A) { A(7.6, () => { burst('spark', JE.top, 14, { v: 140 }); bear.act('dance', { restart: true }); pup.act('spin', { restart: true }); sfx('chime'); }); } },
    { f(A) { A(7.6, () => { burst(TFX(), mid, 16, { v: 100, g: 20 }); bear.act('giggle', { restart: true }); pup.act('happy', { restart: true }); }); } },
    { f(A) { A(7.4, () => pupTo(0.9, 0.7, 'stand', { face: 'bear' })); A(8.2, () => { bear.act('clap', { restart: true }); pup.act('paw', { restart: true }); sfx('clap'); pop('High five!', mid); }); } },
    { f(A) { A(7.8, () => { bear.act('bow', { restart: true }); pup.act('bow', { restart: true }); sfx('chime'); pop('Thank you!', mid); }); } }
  ];
  function genAct() {
    const T = TIMES[api.tod()] || TIMES.day, kind = pick(T.props), place = pick(T.places), bm = pick(BM), jm = pick(JM), fin = pick(FIN);
    return { gen: true, t: `${bm.t(WORD[kind])} · ${jm.t}`, d: 10.6, f(A) {
      const p = prop(kind, POPT[kind] ? POPT[kind]() : {}); p.at = SN.hands;
      A(0, () => { bear.act('hold', { restart: true, hold: 'none' }); faceBear(); pup.act('sit', { restart: true }); api.say(fmt(pick(T.open), kind, place), 3600); P.look = () => [p.x, p.y]; });
      bm.f(A, p); jm.f(A, p); fin.f(A, p);
      A(9.4, () => { P.look = null; api.say(fmt(pick(T.close), kind, place), 2800); }); A(10.2, () => fade(p, 0.4)); } };
  }

  // ---------------------------------------------------------------- running the games
  function shuffle() { const o = ACTS.map((_, i) => i); for (let i = o.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [o[i], o[j]] = [o[j], o[i]]; } return o; }
  function begin(i, gen) {
    const a = gen || ACTS[i]; P.act = a; P.idx = gen ? -1 : i; P.t = 0; P.beats = []; P.ticks = []; P.look = null; P.title = title(a); P.titleT = 0; P.n++;
    G.po.r = 0; G.po.s = G.po.s || 1;
    a.f((t, fn) => P.beats.push([t, fn]), (t0, t1, fn) => P.ticks.push({ t0, t1, f: fn }));
    P.beats.sort((x, y) => x[0] - y[0]);
  }
  function finish() {
    for (const p of P.props) fade(p, 0.45);
    P.ticks = []; P.beats = []; P.riding = false; P.ride = null; P.unride = null; P.umb = null; P.look = null;
    tween(G.po, 'x', 0, 0.7); tween(G.po, 'y', 0, 0.7); tween(G.po, 'r', 0, 0.4); tween(G.po, 's', 1, 0.5);
    if (Math.abs(J.ox || 0) > 2) pupTo(0, clamp(Math.abs(J.ox) / (150 * L().ps), 0.45, 1.4), 'sit', { face: 'bear' }); else { faceBear(); pup.act('sit', { restart: true }); }
    J.oy = 0; bear.act('idle', { restart: true }); P.act = null; P.done++; P.after = 1.4;
  }
  function next() {
    if (!P.order.length) P.order = shuffle();
    if (api.tod() === 'night' && P.done > 0 && P.done % 9 === 0 && !P.napped) { P.napped = true; nap(); return; }   // a short nap, and only at night
    P.napped = false; if (Math.random() < 0.72) begin(-1, genAct()); else begin(P.order.shift());
  }
  function nap() {
    P.napping = true; P.act = null; P.title = 'Nap time'; P.titleT = 0; P.t = 0; P.ticks = [];
    faceBear(); pup.act('lie', { restart: true }); bear.act('yawn', { restart: true });
    P.beats = [[1.0, () => pup.act('yawn', { restart: true })], [2.4, () => { pup.act('sleep', { restart: true }); bear.act('sleep', { restart: true }); api.say('Shh… nap time ♡', 2200); }], [3.4, () => api.nap(true)],
      [13.5, () => { api.nap(false); pup.act('wake', { restart: true }); bear.act('yawn', { restart: true }); }], [15.5, () => { P.napping = false; P.after = 0.6; pup.act('sit', { restart: true }); bear.act('idle', { restart: true }); }]];
  }

  return {
    get on() { return P.on; }, get title() { return P.title; }, get count() { return P.n; }, get napping() { return P.napping; }, get index() { return P.act ? P.idx : -1; }, get dur() { return P.act ? P.act.d : 0; }, total: ACTS.length,
    // what each of them should look at: the thing in play, else each other
    look() { const f = P.look ? P.look() : null; return { bear: f || JE.head(), pup: f || SN.head() }; },
    start() { if (P.on) return; P.on = true; P.order = shuffle(); P.after = 0.9; Object.assign(G.po, { x: 0, y: 0, r: 0, s: 1 }); J.ox = J.x - L().pupX; J.oy = 0; },
    stop() { if (P.napping) api.nap(false); Object.assign(P, { on: false, act: null, props: [], parts: [], pops: [], tw: [], beats: [], ticks: [], napping: false, riding: false, ride: null, unride: null, umb: null, look: null }); Object.assign(G.po, { x: 0, y: 0, r: 0, s: 1 }); J.ox = 0; J.oy = 0; },
    skip() { if (!P.on) return; if (P.napping) { api.nap(false); P.napping = false; P.beats = []; pup.act('wake', { restart: true }); bear.act('idle', { restart: true }); P.after = 0.8; return; } if (P.act) finish(); P.after = 0.35; },
    go(i) { if (!P.on) return; if (P.napping) { api.nap(false); P.napping = false; } if (P.act) finish(); P.props = []; P.parts = []; P.tw = []; Object.assign(G.po, { x: 0, y: 0, r: 0, s: 1 }); J.ox = 0; J.oy = 0; begin(((i % ACTS.length) + ACTS.length) % ACTS.length); },   // for testing
    update(dt) {
      if (!P.on) return;
      if (!api.busy()) {
        P.t += dt; P.titleT += dt;
        if (!P.act && !P.napping) { if ((P.after -= dt) <= 0) next(); }
        else {
          while (P.beats.length && P.beats[0][0] <= P.t) { const [, fn] = P.beats.shift(); try { fn(); } catch (e) { console.warn('play beat', e); } }
          for (const q of P.ticks) if (P.t >= q.t0 && P.t < q.t1) q.f(dt, P.t - q.t0);
          if (P.act && P.t >= P.act.d) finish();
        }
        // riding on her back: hop up in an arc, ride along, hop back down
        const back = () => { const [x, y] = JE.back(); return [x - L().snowX, y + 3 * k() * (G.po.s || 1) - L().gy]; };
        if (P.riding) { const [x, y] = back(); G.po.x = x; G.po.y = y; }
        else if (P.ride || P.unride) { const R = P.ride || P.unride; R.t += dt; const e = ease(clamp(R.t / 0.95, 0, 1)), to = P.ride ? back() : [0, 0];
          G.po.x = lerp(R.from.x, to[0], e); G.po.y = lerp(R.from.y, to[1], e) - Math.sin(e * Math.PI) * 60 * s(); }
        stepTweens(dt);
      }
      for (const p of P.props) {
        p.t += dt; if (p.life < 1e8) p.life -= dt;
        if (p.at) [p.x, p.y] = p.at();
        else if (p.fn) [p.x, p.y] = p.fn(p.t);
        else if (p.path) { const q = p.path; q.t += dt / q.dur; const e = clamp(q.t, 0, 1), m = 1 - e, b = q.end ? q.end() : q.b; p.x = m * m * q.a[0] + 2 * m * e * q.c[0] + e * e * b[0]; p.y = m * m * q.a[1] + 2 * m * e * q.c[1] + e * e * b[1]; if (q.spin) p.rot += dt * q.spin; }
        else { p.vy += p.g * dt; p.x += p.vx * dt; p.y += p.vy * dt; if (p.vr) p.rot += p.vr * dt;
          if (p.floor && p.y > p.floor) { p.y = p.floor; const hard = Math.abs(p.vy) > 60 * s(); p.vy *= -(p.bounce ?? 0.45); p.vx *= 0.7; if (hard) sfx('boing'); if (Math.abs(p.vy) < 25 * s()) p.vy = 0; }
          if (p.floor && p.y >= p.floor - 0.5) { p.vx *= Math.max(0, 1 - dt * 2.5); if (p.kind === 'ball') p.rot += p.vx * dt / (8 * s()); }
          if (p.kind === 'bubble') p.x += Math.sin(p.t * 2 + (p.bob || 0)) * 0.4; }
        if (p.rotFn) p.rot = p.rotFn(p.t);
        if (p.kind === 'bubble' && p.life > 0) { const hd = JE.head(); if ((p.popOnPup && Math.hypot(p.x - hd[0], p.y - hd[1]) < 24 * L().ps) || (p.popAt && p.t > p.popAt) || p.y < 20 || p.y > L().gy - 4) { p.life = 0; burst('pop', [p.x, p.y], 6, { v: 60, g: 0, life: 0.4, c: '#DFF4FF', spread: TAU }); sfx('pop'); } }
      }
      P.props = P.props.filter(p => p.life > 0);
      const um = P.umb && P.umb.s > 0.5 ? P.umb : null, uw = um ? 50 * s() * um.s : 0;
      for (const q of P.parts) { q.t += dt; q.vy += q.g * dt; q.x += q.vx * dt + (q.kind === 'snow' || q.kind === 'leaf' || q.kind === 'seed' ? Math.sin(q.t * 2 + q.wob) * 0.6 : 0); q.y += q.vy * dt; q.r += q.vr * dt;
        if (q.kind === 'fly') { q.x += Math.sin(q.t * 1.7 + q.wob) * 0.5; q.y += Math.cos(q.t * 1.3 + q.wob) * 0.4; }
        if (q.kind === 'confetti' || q.kind === 'petal' || q.kind === 'leaf') { q.vx *= Math.max(0, 1 - dt * 1.6); if (q.vy > 70 * s()) q.vy = lerp(q.vy, 70 * s(), Math.min(1, dt * 6)); q.x += Math.sin(q.t * 3 + q.wob) * 0.5; }
        if ((q.kind === 'rain' || q.kind === 'snow') && q.y > L().gy) q.t = q.life;
        if (um && (q.kind === 'rain' || q.kind === 'snow') && Math.abs(q.x - um.x) < uw && q.y > um.y - 16 * s() && q.y < um.y + 8 * s()) { q.t = q.life; if (Math.random() < 0.3 && P.parts.length < 520) P.parts.push({ kind: 'drop', x: q.x, y: um.y - 6 * s(), vx: (q.x - um.x) * 1.2, vy: -40 * s(), g: 600 * s(), life: 0.5, t: 0, r: 0, vr: 0, c: '#CFEBFF', sz: 0.8, wob: 0 }); } }
      P.parts = P.parts.filter(q => q.t < q.life && q.y < api.H() + 20);
      for (const w of P.pops) w.t += dt; P.pops = P.pops.filter(w => w.t < w.life);
      if (P.flash) P.flash = Math.max(0, P.flash - dt * 2.5);
    },
    drawBack(c) { if (!P.on) return; for (const p of P.props) if (p.layer === 'back') this.drawProp(c, p); },
    drawFront(c) {
      if (!P.on) return; const z0 = s();
      for (const p of P.props) if (p.layer !== 'back') this.drawProp(c, p);
      for (const q of P.parts) { const a = clamp(1 - q.t / q.life, 0, 1) * (q.kind === 'fly' ? Math.sin(Math.min(1, q.t / q.life) * Math.PI) : 1); if (a < 0.01) continue; c.save(); c.globalAlpha = a; c.translate(q.x, q.y); c.rotate(q.r); const z = q.sz * z0;
        switch (q.kind) {
          case 'heart': c.fillStyle = '#FF6F9C'; c.beginPath(); c.moveTo(0, 3 * z); c.bezierCurveTo(-5 * z, -1 * z, -3 * z, -5 * z, 0, -2 * z); c.bezierCurveTo(3 * z, -5 * z, 5 * z, -1 * z, 0, 3 * z); c.fill(); break;
          case 'confetti': c.fillStyle = q.c; c.scale(1, Math.abs(Math.sin(q.t * 9 + q.wob)) + 0.15); c.fillRect(-2.5 * z, -1.3 * z, 5 * z, 2.6 * z); break;
          case 'spark': case 'pop': c.fillStyle = q.kind === 'pop' ? q.c : '#FFF0B8'; c.beginPath(); for (let i = 0; i < 8; i++) { const an = i * Math.PI / 4, r = (i % 2 ? 1 : 3.2) * z; c.lineTo(Math.cos(an) * r, Math.sin(an) * r); } c.fill(); break;
          case 'note': { c.rotate(-q.r); c.fillStyle = '#FFE7A8'; c.strokeStyle = 'rgba(70,40,90,.5)'; c.lineWidth = 2; c.font = `600 ${13 * z}px Georgia, serif`; const nt = q.wob > 3 ? '♫' : '♪'; c.strokeText(nt, 0, 0); c.fillText(nt, 0, 0); break; }
          case 'crumb': c.fillStyle = q.c; c.fillRect(-1 * z, -1 * z, 2 * z, 2 * z); break;
          case 'smoke': c.fillStyle = q.c; c.beginPath(); c.arc(0, 0, (2 + q.t * 6) * z, 0, TAU); c.fill(); break;
          case 'petal': c.fillStyle = q.c; c.beginPath(); c.ellipse(0, 0, 3 * z, 1.6 * z, 0, 0, TAU); c.fill(); break;
          case 'leaf': c.fillStyle = ['#E9A23B', '#D9663A', '#F2C14E', '#C8552E'][Math.floor(q.wob) % 4]; c.beginPath(); c.ellipse(0, 0, 4.2 * z, 2 * z, 0, 0, TAU); c.fill(); break;
          case 'seed': c.rotate(-q.r); c.strokeStyle = 'rgba(255,255,255,.9)'; c.lineWidth = 0.8; c.beginPath(); c.moveTo(0, 0); c.lineTo(0, 5 * z); for (let i = -2; i <= 2; i++) { c.moveTo(0, 0); c.lineTo(i * 1.6 * z, -2.6 * z); } c.stroke(); break;
          case 'rain': c.rotate(-q.r); c.strokeStyle = 'rgba(190,220,255,.75)'; c.lineWidth = 1.2 * z; c.beginPath(); c.moveTo(0, 0); c.lineTo(-1.6 * z, 10 * z); c.stroke(); break;
          case 'drop': c.fillStyle = q.c; c.beginPath(); c.arc(0, 0, 1.8 * z, 0, TAU); c.fill(); break;
          case 'snow': c.fillStyle = '#FFFFFF'; c.beginPath(); c.arc(0, 0, 2.2 * z, 0, TAU); c.fill(); break;
          case 'fly': c.rotate(-q.r); if (GLOW) c.drawImage(GLOW, -7 * z, -7 * z, 14 * z, 14 * z); c.fillStyle = '#FFF6C8'; c.beginPath(); c.arc(0, 0, 1.3 * z, 0, TAU); c.fill(); break;
        } c.restore(); }
      for (const w of P.pops) { c.save(); c.globalAlpha = clamp((1 - w.t / w.life) * 3, 0, 1); c.translate(w.x, w.y - w.t * 30 * z0); c.rotate(-0.1 + w.k * 0.2); c.font = `600 ${Math.round(16 * z0 + 4)}px Caveat, cursive`; c.textAlign = 'center';
        c.lineWidth = 3; c.lineJoin = 'round'; c.strokeStyle = 'rgba(60,30,80,.6)'; c.strokeText(w.text, 0, 0); c.fillStyle = w.c; c.fillText(w.text, 0, 0); c.restore(); }
      if (P.flash > 0) { c.save(); c.fillStyle = `rgba(255,255,255,${P.flash * 0.4})`; c.fillRect(0, 0, api.W(), api.H()); c.restore(); }
      // what they are playing, small and soft, under the pair
      if (P.title && L()) { const a = clamp(P.titleT / 0.5, 0, 1) * clamp((4.4 - P.titleT) / 0.8, 0, 1); if (a > 0.01) { c.save(); c.globalAlpha = a; c.font = `600 ${Math.round(15 * z0 + 3)}px Caveat, cursive`; c.textAlign = 'center';
        const txt = P.napping ? '✦ Nap time' : P.act && P.act.gen ? `✦ ${P.title}` : `✦ ${((P.n - 1) % ACTS.length) + 1} / ${ACTS.length} · ${P.title}`, x = clamp((L().snowX + L().pupX) / 2, 90, api.W() - 90), y = Math.min(api.H() - 14, L().gy + 28 * z0);
        c.lineWidth = 3; c.lineJoin = 'round'; c.strokeStyle = 'rgba(40,20,60,.55)'; c.strokeText(txt, x, y); c.fillStyle = '#FFF0D2'; c.fillText(txt, x, y); c.restore(); } }
    },
    drawProp(c, p) {
      const d = DRAW[p.kind]; if (!d) return; const z = s(), sk = (p.s ?? 1) * (p.sk ? p.sk() : 1); if (sk < 0.01) return;
      const al = clamp(p.life / 0.45, 0, 1) * (p.a ?? 1);
      const sh = SHADOW[p.kind]; if (sh && L()) { const hgt = clamp((L().gy - p.y) / (160 * z), 0, 1); c.save(); c.globalAlpha = al * 0.22 * (1 - hgt); c.fillStyle = '#000'; c.beginPath(); c.ellipse(p.x, L().gy + 1, sh * z * sk * (1 - hgt * 0.5), 2.4 * z * sk, 0, 0, TAU); c.fill(); c.restore(); }
      c.save(); c.globalAlpha = al; c.translate(p.x, p.y); c.rotate((p.rotAt ? p.rotAt() : 0) + (p.rot || 0)); const fl = p.flipAt ? p.flipAt() : p.flip || 1; c.scale(sk * fl, sk); d(c, p, z); c.restore();
    }
  };
}

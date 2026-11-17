/* Happy Birthday Helen Darlu – 2D film toolkit: shared helpers (colour, paths, shading, camera). */
(function () {
  const F = (window.Film = window.Film || {});

  F.lerp = (a, b, t) => a + (b - a) * t;
  F.clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  F.ease = t => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
  F.smoothstep = (a, b, x) => { const t = F.clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  F.rng = seed => { let s = seed >>> 0 || 1; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); };

  // ---------- colour
  const cache = {};
  function rgb(c) {
    if (cache[c]) return cache[c];
    let r, g, b;
    if (c[0] === '#') { const n = parseInt(c.slice(1), 16); r = n >> 16; g = (n >> 8) & 255; b = n & 255; }
    else { const m = c.match(/[\d.]+/g); r = +m[0]; g = +m[1]; b = +m[2]; }
    return (cache[c] = [r, g, b]);
  }
  F.rgb = rgb;
  F.mix = (c1, c2, t) => { const a = rgb(c1), b = rgb(c2); return `rgb(${Math.round(a[0] + (b[0] - a[0]) * t)},${Math.round(a[1] + (b[1] - a[1]) * t)},${Math.round(a[2] + (b[2] - a[2]) * t)})`; };
  F.shade = (c, k) => (k >= 0 ? F.mix(c, '#ffffff', k) : F.mix(c, '#000000', -k));
  F.rgba = (c, a) => { const v = rgb(c); return `rgba(${v[0]},${v[1]},${v[2]},${a})`; };
  F.warm = (c, k) => F.mix(c, '#ff9a5a', k);

  // ---------- paths
  // smooth Catmull-Rom curve through points -> Path2D
  F.smooth = (pts, closed) => {
    const n = pts.length; let d = `M${pts[0][0].toFixed(3)} ${pts[0][1].toFixed(3)}`;
    const seg = closed ? n : n - 1;
    for (let i = 0; i < seg; i++) {
      const p1 = pts[i], p2 = pts[(i + 1) % n];
      const p0 = closed ? pts[(i - 1 + n) % n] : pts[Math.max(0, i - 1)];
      const p3 = closed ? pts[(i + 2) % n] : pts[Math.min(n - 1, i + 2)];
      const c1x = p1[0] + (p2[0] - p0[0]) / 6, c1y = p1[1] + (p2[1] - p0[1]) / 6;
      const c2x = p2[0] - (p3[0] - p1[0]) / 6, c2y = p2[1] - (p3[1] - p1[1]) / 6;
      d += `C${c1x.toFixed(3)} ${c1y.toFixed(3)} ${c2x.toFixed(3)} ${c2y.toFixed(3)} ${p2[0].toFixed(3)} ${p2[1].toFixed(3)}`;
    }
    if (closed) d += 'Z';
    return new Path2D(d);
  };
  // ribbon (cloth, tails) from a centre line and widths
  F.ribbon = (pts, widths) => {
    const L = [], R = [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
      let dx = b[0] - a[0], dy = b[1] - a[1]; const l = Math.hypot(dx, dy) || 1; dx /= l; dy /= l;
      const w = widths[i] / 2;
      L.push([pts[i][0] - dy * w, pts[i][1] + dx * w]); R.push([pts[i][0] + dy * w, pts[i][1] - dx * w]);
    }
    return { path: F.smooth(L.concat(R.reverse()), true), L, R };
  };
  // tapered capsule between two points (limbs)
  F.capsule = (a, b, w1, w2) => {
    let dx = b[0] - a[0], dy = b[1] - a[1]; const l = Math.hypot(dx, dy) || 1; dx /= l; dy /= l;
    const nx = -dy, ny = dx, p = new Path2D();
    p.moveTo(a[0] + nx * w1 / 2, a[1] + ny * w1 / 2);
    p.lineTo(b[0] + nx * w2 / 2, b[1] + ny * w2 / 2);
    p.arc(b[0], b[1], w2 / 2, Math.atan2(ny, nx), Math.atan2(ny, nx) + Math.PI, true);
    p.lineTo(a[0] - nx * w1 / 2, a[1] - ny * w1 / 2);
    p.arc(a[0], a[1], w1 / 2, Math.atan2(-ny, -nx), Math.atan2(-ny, -nx) + Math.PI, true);
    p.closePath();
    return p;
  };
  // two-bone IK: shoulder a reaches for target; bend picks the elbow side (+1 / -1). Returns [shoulder, elbow, wrist]
  F.ik = (a, tg, l1, l2, bend = 1) => {
    const dx = tg[0] - a[0], dy = tg[1] - a[1], d = Math.min(Math.hypot(dx, dy), l1 + l2 - 1e-3), ang = Math.atan2(dy, dx);
    const off = Math.acos(F.clamp((l1 * l1 + d * d - l2 * l2) / (2 * l1 * d), -1, 1)) * bend;
    return [a, [a[0] + Math.cos(ang + off) * l1, a[1] + Math.sin(ang + off) * l1], [a[0] + Math.cos(ang) * d, a[1] + Math.sin(ang) * d]];
  };
  // world point -> a character's local space (for hands reaching to things in the scene)
  F.toLocal = (o, wx, wy) => {
    const s = o.s || 1, fl = o.flip ? -1 : 1, r = o.rot || 0;
    const lx = (wx - (o.x || 0)) / (s * fl), ly = (wy - (o.y || 0)) / s;
    return [lx * Math.cos(-r) - ly * Math.sin(-r), lx * Math.sin(-r) + ly * Math.cos(-r)];
  };
  F.ellipse = (x, y, rx, ry, rot = 0) => { const p = new Path2D(); p.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2); return p; };

  // ---------- shading: the look of the film (flat fills, soft light-side gradient, thin edge, warm rim light)
  // st.L: which side the light comes from in the current local space (-1 left, +1 right)
  const st = (F.st = { L: -1, sil: null, rim: '#FFE1AE', rimA: 0.85 });
  F.paint = (ctx, path, base, x0, x1, o = {}) => {
    if (st.sil) { // silhouette against the sun
      ctx.fillStyle = st.sil; ctx.fill(path);
      if (o.rim !== false) rim(ctx, path, x0, x1, (o.rw || 0.4) * 1.3, 1);
      return;
    }
    const k = o.k == null ? 0.14 : o.k, lc = F.shade(F.warm(base, 0.06), k), dc = F.shade(base, -k * 1.3);
    const g = ctx.createLinearGradient(x0, 0, x1, 0);
    if (st.L < 0) { g.addColorStop(0, lc); g.addColorStop(1, dc); } else { g.addColorStop(0, dc); g.addColorStop(1, lc); }
    ctx.fillStyle = g; ctx.fill(path);
    if (o.edge !== false) { ctx.lineWidth = o.lw || 0.11; ctx.strokeStyle = F.rgba(F.shade(base, -0.5), o.ea || 0.4); ctx.stroke(path); }
    if (o.rim !== false) rim(ctx, path, x0, x1, o.rw || 0.26, o.ra || 0.85);
  };
  function rim(ctx, path, x0, x1, w, a) {
    const g = ctx.createLinearGradient(x0, 0, x1, 0), c = st.rim, A = st.rimA * a;
    if (st.L < 0) { g.addColorStop(0, F.rgba(c, A)); g.addColorStop(0.38, F.rgba(c, 0)); g.addColorStop(1, F.rgba(c, 0)); }
    else { g.addColorStop(0, F.rgba(c, 0)); g.addColorStop(0.62, F.rgba(c, 0)); g.addColorStop(1, F.rgba(c, A)); }
    ctx.lineWidth = w; ctx.strokeStyle = g; ctx.stroke(path);
  }
  F.fill = (ctx, path, color) => { ctx.fillStyle = st.sil ? st.sil : color; ctx.fill(path); };
  F.stroke = (ctx, path, color, w) => { if (st.sil) return; ctx.lineWidth = w; ctx.strokeStyle = color; ctx.stroke(path); };

  // character space: feet at (0,0), y up is negative, a character is ~100 units tall
  F.begin = (ctx, o) => {
    ctx.save(); ctx.translate(o.x || 0, o.y || 0);
    const s = o.s || 1, fl = o.flip ? -1 : 1;
    ctx.scale(s * fl, s);
    if (o.rot) ctx.rotate(o.rot);
    F._saved = { L: st.L, sil: st.sil, rim: st.rim, rimA: st.rimA };
    st.L = (o.light == null ? -1 : o.light) * fl; st.sil = o.sil || null;
    if (o.rimColor) st.rim = o.rimColor; if (o.rimA != null) st.rimA = o.rimA;
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    return fl;
  };
  F.end = ctx => { Object.assign(st, F._saved); ctx.restore(); };

  // film grain texture
  F.grain = (() => {
    let c = null;
    return () => {
      if (c) return c;
      c = document.createElement('canvas'); c.width = c.height = 192;
      const x = c.getContext('2d'), d = x.createImageData(192, 192), r = F.rng(7);
      for (let i = 0; i < d.data.length; i += 4) { const v = 110 + r() * 145; d.data[i] = d.data[i + 1] = d.data[i + 2] = v; d.data[i + 3] = 26; }
      x.putImageData(d, 0, 0); return c;
    };
  })();
})();

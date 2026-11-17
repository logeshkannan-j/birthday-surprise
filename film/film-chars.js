/* Happy Birthday Helen Darlu – the characters. ONE function per character; scenes only pass parameters.
   Character space: feet at (0,0), up is -y, Helen is ~100 units tall.
   Film.helen(ctx, {x, y, s, flip, rot, t, wind, view:'front'|'back', pose, expr, look, tilt, reach:[wx,wy]})
   Film.boy(ctx, {... view, pose:'stand'|'walk'|'carry'|'reach', expr, reach:[wx,wy], phase}) · Film.jessi · Film.snowki */
(function () {
  const F = window.Film, st = F.st;
  const { paint, fill, stroke, capsule, ellipse, smooth, ribbon } = F;

  // ---------- palettes (the character sheet in the skill)
  const HELEN = { skin: '#BE7650', skinD: '#94522F', hair: '#17111B', hairHi: '#54466A', saree: '#2F3FB8', sareeD: '#1E2884', sareeL: '#4A5BD6',
    blouse: '#26339E', gold: '#D9A441', goldL: '#F6D98A', bag: '#8A5A36', lip: '#93393F', blush: '#F07080', bindi: '#7E1428', iris: '#43251B', lash: '#1A0F12' };
  const BOY = { skin: '#9C5E3E', skinD: '#73402A', hair: '#140F10', hairHi: '#4A3830', shirt: '#F4F1EA', shirtD: '#C6BDD0', pant: '#2B2F3A', shoe: '#1E1A1C', lip: '#6E3530', iris: '#3A1F15', lash: '#120A0A' };
  const DOG = { fur: '#1E1D26', furHi: '#4C4D66', nose: '#0E0D12', tongue: '#E2687E', collar: '#E2447C', tag: '#D9A441' };
  const BEAR = { fur: '#A9CBEA', furD: '#7FA6CE', belly: '#D6E7F6', pink: '#F29BB8', bow: '#E85A8C', eye: '#1C1622' };

  // ---------- shared pieces
  function eye(ctx, cx, cy, w, state, gx, gy, C) {
    const h = w * 0.37, lash = C.lash;
    if (st.sil) return;
    if (state === 'closed' || state === 'smileClosed') {
      const p = new Path2D(), up = state === 'smileClosed' ? -1 : 1;
      p.moveTo(cx - w / 2, cy - 0.05); p.quadraticCurveTo(cx, cy + up * h * 0.95, cx + w / 2, cy - 0.15);
      stroke(ctx, p, lash, w * 0.13);
      for (let i = 0; i < 3; i++) { const q = new Path2D(), x = cx + w * (0.12 + i * 0.14), y = cy + up * h * (0.55 - i * 0.12); q.moveTo(x, y); q.lineTo(x + w * 0.12, y + w * 0.14); stroke(ctx, q, lash, w * 0.05); }
      return;
    }
    const o = state === 'wide' ? 1.22 : 1;
    const shape = new Path2D();
    shape.moveTo(cx - w / 2, cy + h * 0.2);
    shape.bezierCurveTo(cx - w * 0.28, cy - h * 1.25 * o, cx + w * 0.28, cy - h * 1.3 * o, cx + w / 2, cy - h * 0.1);
    shape.bezierCurveTo(cx + w * 0.26, cy + h * 0.95, cx - w * 0.26, cy + h * 0.95, cx - w / 2, cy + h * 0.2);
    ctx.fillStyle = '#FFF6EE'; ctx.fill(shape);
    ctx.save(); ctx.clip(shape);
    const ix = cx + gx * w * 0.2, iy = cy - h * 0.12 + gy * h * 0.55, r = w * 0.29;
    ctx.fillStyle = C.iris; ctx.beginPath(); ctx.arc(ix, iy, r, 0, 7); ctx.fill();
    const g = ctx.createRadialGradient(ix, iy + r * 0.5, 0, ix, iy, r); g.addColorStop(0, 'rgba(255,190,140,.45)'); g.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = g; ctx.fill();
    ctx.fillStyle = '#0B0505'; ctx.beginPath(); ctx.arc(ix, iy, r * 0.5, 0, 7); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(ix + r * 0.32, iy - r * 0.42, r * 0.32, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.arc(ix - r * 0.38, iy + r * 0.36, r * 0.13, 0, 7); ctx.fill();
    ctx.fillStyle = 'rgba(70,25,30,.22)'; ctx.fillRect(cx - w, cy - h * 2.2, w * 2, h * 1.25);
    ctx.restore();
    const lid = new Path2D();
    lid.moveTo(cx - w / 2 - w * 0.05, cy + h * 0.25);
    lid.bezierCurveTo(cx - w * 0.28, cy - h * 1.3 * o, cx + w * 0.28, cy - h * 1.36 * o, cx + w / 2 + w * 0.08, cy - h * 0.25);
    lid.quadraticCurveTo(cx + w / 2 + w * 0.2, cy - h * 0.45, cx + w / 2 + w * 0.26, cy - h * 0.75);
    stroke(ctx, lid, lash, w * 0.12);
    const crease = new Path2D(); crease.moveTo(cx - w * 0.3, cy - h * 1.35 * o); crease.quadraticCurveTo(cx + w * 0.1, cy - h * 1.75 * o, cx + w * 0.45, cy - h * 1.05 * o);
    stroke(ctx, crease, F.rgba(C.skinD || '#5a3020', 0.5), w * 0.04);
    const low = new Path2D(); low.moveTo(cx - w * 0.32, cy + h * 0.72); low.quadraticCurveTo(cx + w * 0.1, cy + h * 1.0, cx + w * 0.44, cy + h * 0.25);
    stroke(ctx, low, F.rgba(lash, 0.3), w * 0.04);
  }
  const blink = (t, base, seed) => ((t + seed) % 4.3 < 0.13 ? 'closed' : base);
  function hand(ctx, b, c, skin, size) {
    // mitten hand: palm + fingers + thumb, pointing along the forearm
    const ang = Math.atan2(c[1] - b[1], c[0] - b[0]);
    ctx.save(); ctx.translate(c[0], c[1]); ctx.rotate(ang); ctx.scale(size, size);
    const p = new Path2D('M-0.4 -0.75 C0.6 -0.95 1.6 -0.85 2.5 -0.55 C3.2 -0.3 3.3 0.35 2.6 0.55 C1.8 0.8 0.6 0.9 -0.3 0.7 C-0.7 0.3 -0.7 -0.4 -0.4 -0.75 Z');
    paint(ctx, p, skin, -0.6, 3.3, { rw: 0.18, lw: 0.09 });
    paint(ctx, ellipse(0.9, -0.85, 0.75, 0.32, -0.5), skin, 0, 1.6, { rim: false, lw: 0.08 });
    if (!st.sil) for (let i = 0; i < 3; i++) stroke(ctx, new Path2D(`M${1.7 + i * 0.05} ${-0.35 + i * 0.32} L2.7 ${-0.3 + i * 0.3}`), F.rgba(F.shade(skin, -0.4), 0.45), 0.06);
    ctx.restore();
  }
  function limb(ctx, a, b, w1, w2, color, o) { paint(ctx, capsule(a, b, w1, w2), color, Math.min(a[0], b[0]) - w1, Math.max(a[0], b[0]) + w1, o); }
  function cross(ctx, a, b, u, w, color, lw) { // a band across a limb at fraction u (sleeve borders, cuffs)
    const px = a[0] + (b[0] - a[0]) * u, py = a[1] + (b[1] - a[1]) * u, ang = Math.atan2(b[1] - a[1], b[0] - a[0]) + Math.PI / 2;
    const p = new Path2D(); p.moveTo(px - Math.cos(ang) * w / 2, py - Math.sin(ang) * w / 2); p.lineTo(px + Math.cos(ang) * w / 2, py + Math.sin(ang) * w / 2);
    ctx.lineCap = 'butt'; stroke(ctx, p, color, lw); ctx.lineCap = 'round';
  }

  // =====================================================================================  HELEN
  const HP = { // [shoulder, elbow, wrist] for the arm on the viewer's left (L) and right (R)
    stand: { L: [[-7.6, -78.2], [-9.2, -67.4], [-8.8, -57.4]], R: [[7.9, -78.2], [9.7, -67.6], [8.9, -57.8]] },
    tuck: { L: [[-7.6, -78.2], [-11.0, -84.0], [-5.4, -90.0]], R: [[7.9, -78.2], [9.7, -67.6], [8.9, -57.8]] },
    wonder: { L: [[-7.6, -78.2], [-8.6, -68.6], [-1.2, -72.4]], R: [[7.9, -78.2], [8.8, -68.8], [1.2, -72.8]] },
    heart: { L: [[-7.6, -78.2], [-9.2, -67.4], [-8.8, -57.4]], R: [[7.9, -78.2], [8.6, -68.4], [1.6, -73.6]] },
    pet: { L: [[-7.6, -78.2], [-10.2, -67.0], [-12.6, -56.6]], R: [[7.9, -78.2], [9.7, -67.6], [8.9, -57.8]] }
  };
  F.helen = (ctx, o) => {
    const fl = F.begin(ctx, o), t = o.t || 0, W = (o.wind == null ? -0.7 : o.wind) * fl;
    let P = HP[o.pose] || HP.stand;
    if (o.reach) { const tg = F.toLocal(o, o.reach[0], o.reach[1]), side = tg[0] < 0 ? 'L' : 'R'; P = { ...P, [side]: F.ik(P[side][0], tg, 10.9, 10.2, side === 'L' ? -1 : 1) }; }
    if (o.view === 'back') helenBack(ctx, o, t, W); else helenFront(ctx, o, t, W, P);
    F.end(ctx);
  };
  function helenArm(ctx, j, C, bangles) {
    const [a, b, c] = j;
    limb(ctx, b, c, 2.15, 1.6, C.skin);
    hand(ctx, b, c, C.skin, 1.0);
    limb(ctx, a, b, 2.75, 2.15, C.skin);
    const sm = [a[0] + (b[0] - a[0]) * 0.44, a[1] + (b[1] - a[1]) * 0.44];
    limb(ctx, a, sm, 3.3, 3.0, C.blouse, { k: 0.12 });
    cross(ctx, a, sm, 0.93, 3.0, C.gold, 0.55);
    if (bangles && !st.sil) for (let i = 0; i < 3; i++) {
      const u = 0.74 + i * 0.075, px = b[0] + (c[0] - b[0]) * u, py = b[1] + (c[1] - b[1]) * u, ang = Math.atan2(c[1] - b[1], c[0] - b[0]);
      const e = ellipse(px, py, 1.12, 0.34, ang + Math.PI / 2); ctx.lineWidth = 0.26; ctx.strokeStyle = i === 1 ? C.goldL : C.gold; ctx.stroke(e);
    }
  }
  function hairBack(ctx, C, t, W, wide) {
    const n = 9, Lp = [], Rp = [];
    const sway = (u, ph) => W * Math.pow(u, 1.35) * (5.2 + 1.5 * Math.sin(t * 2.1 + u * 4 + ph)) + Math.sin(t * 1.3 + u * 3 + ph) * 0.4 * u;
    const lx = wide ? [-6.0, -7.4, -9.2, -10.4, -10.8, -10.8, -10.4, -9.6, -8.2] : [-5.6, -6.6, -7.9, -9.3, -9.9, -10.1, -9.8, -9.0, -7.6];
    const rx = wide ? [6.0, 7.4, 9.2, 10.4, 10.8, 10.8, 10.4, 9.6, 8.2] : [5.9, 6.9, 7.9, 9.1, 9.7, 9.8, 9.4, 8.6, 7.2];
    for (let i = 0; i < n; i++) { const u = i / (n - 1), y = -95 + u * 45; Lp.push([lx[i] + sway(u, 0), y - Math.abs(W) * u * u * 2.2]); Rp.push([rx[i] + sway(u, 1.3), y + 0.8 - Math.abs(W) * u * u * 2.2]); }
    const tip = [(Lp[n - 1][0] + Rp[n - 1][0]) / 2 + sway(1.06, 0.6), -47.5 - Math.abs(W) * 2.6];
    const pts = [[0.3, -98.6], [-3.4, -97.9]].concat(Lp, [tip], Rp.reverse(), [[3.9, -97.9]]);
    const path = smooth(pts, true);
    paint(ctx, path, C.hair, -11, 11, { k: 0.08, rw: 0.4, ra: 0.75 });
    if (!st.sil) { // strands catching the warm light
      ctx.save(); ctx.clip(path);
      for (let s = 0; s < 9; s++) {
        const p = new Path2D(), x0 = -6 + s * 1.5;
        p.moveTo(x0 * 0.7, -95);
        for (let i = 1; i <= 9; i++) { const u = i / 9; p.lineTo(F.lerp(x0 * 0.7, x0 * 1.3, u) + sway(u, s * 0.6), -95 + u * 46 - Math.abs(W) * u * u * 2.2); }
        stroke(ctx, p, F.rgba(s % 3 ? C.hairHi : '#8E7AA8', s % 3 ? 0.32 : 0.22), 0.22);
      }
      ctx.restore();
    }
  }
  function palluTail(ctx, C, t, W, from) {
    const a = Math.abs(W), side = W <= 0 ? -1 : 1, n = 10, pts = [], wd = [];
    for (let i = 0; i < n; i++) {
      const u = i / (n - 1);
      const swing = Math.pow(u, 1.6) * (2.5 + 10 * a) * (1 + 0.18 * Math.sin(t * 1.7 - u * 3));
      pts.push([from[0] - 0.6 * u + side * swing + Math.sin(t * 2.1 - u * 4) * 0.7 * u, from[1] + u * (30 - 5 * a) + Math.sin(t * 2.6 - u * 4.6) * 1.4 * u * (0.5 + a)]);
      wd.push(3.6 + u * (1.6 + 1.2 * a) + Math.sin(t * 2.3 - u * 4) * 0.5 * u);
    }
    const r = ribbon(pts, wd);
    paint(ctx, r.path, C.saree, from[0] - 22, from[0] + 4, { k: 0.1 });
    if (st.sil) return;
    ctx.save(); ctx.clip(r.path);
    const g = ctx.createLinearGradient(pts[0][0], pts[0][1], pts[n - 1][0], pts[n - 1][1]); g.addColorStop(0, 'rgba(20,24,90,.35)'); g.addColorStop(0.5, 'rgba(20,24,90,0)'); g.addColorStop(1, 'rgba(120,140,255,.18)');
    ctx.fillStyle = g; ctx.fillRect(from[0] - 30, from[1] - 10, 40, 50);
    for (let k = 0; k < 2; k++) stroke(ctx, smooth(pts.map((p, i) => [p[0] + (k ? 1 : -1) * 0.9, p[1] + (k ? -0.6 : 0.6) * (i / n)]), false), F.rgba(k ? C.sareeL : C.sareeD, 0.45), 0.45);
    ctx.restore();
    stroke(ctx, smooth(r.R, false), C.gold, 0.85); stroke(ctx, smooth(r.R.map(p => [p[0] + 0.5, p[1] - 0.6]), false), F.rgba(C.goldL, 0.6), 0.2);
  }
  function sareeSkirt(ctx, C, t, W, back) {
    const f = Math.sin(t * 1.7) * 0.3 + W * 0.6;
    const pts = [[-5.8, -60.2], [-7.6, -55], [-8.4, -49], [-8.5, -40], [-8.6, -28], [-9.0 + f * 0.2, -14], [-9.6 + f * 0.6, -2], [-9.5 + f * 0.7, 0.2], [-4, 0.9], [2, 1.0], [7, 0.7], [10.0 + f * 0.6, 0.1], [10.2 + f * 0.5, -2], [9.4 + f * 0.2, -14], [8.8, -28], [8.6, -40], [8.6, -49], [7.9, -55], [6.0, -60.2]];
    const path = smooth(pts, true);
    paint(ctx, path, C.saree, -9.6, 10.2, { k: 0.12 });
    if (st.sil) return path;
    ctx.save(); ctx.clip(path);
    const sg = ctx.createLinearGradient(0, -60, 0, 0); sg.addColorStop(0, 'rgba(20,20,80,.25)'); sg.addColorStop(0.25, 'rgba(20,20,80,0)'); ctx.fillStyle = sg; ctx.fillRect(-12, -61, 24, 62);
    if (!back) { // pleats fanning from the waist
      const pl = new Path2D(`M0.6 -57 C0.2 -38 -1.2 -16 -2.4 1.5 L7.4 1.5 C6.2 -16 4.6 -38 3.6 -55 Z`);
      ctx.fillStyle = F.rgba(C.sareeD, 0.32); ctx.fill(pl);
      for (let i = 0; i < 6; i++) { const q = new Path2D(), x = 0.9 + i * 0.55; q.moveTo(x, -56 + i * 0.4); q.bezierCurveTo(x - 0.3, -36, x - 1.4 + i * 0.45, -16, -2.2 + i * 1.75, 1); stroke(ctx, q, F.rgba(i % 2 ? C.sareeL : C.sareeD, 0.5), 0.28); }
    } else for (let i = 0; i < 4; i++) { const q = new Path2D(); q.moveTo(-5 + i * 3.3, -54); q.bezierCurveTo(-5.4 + i * 3.4, -30, -6 + i * 3.8, -14, -7 + i * 4.6, 0.5); stroke(ctx, q, F.rgba(C.sareeD, 0.3), 0.3); }
    ctx.fillStyle = C.gold; ctx.fillRect(-12, -2.5, 24, 4);                       // hem border
    ctx.fillStyle = C.goldL; ctx.fillRect(-12, -2.5, 24, 0.35);
    if (!back) for (let i = 0; i < 6; i++) { ctx.fillStyle = F.rgba('#7A5312', 0.4); ctx.fillRect(-2.2 + i * 1.75, -2.5, 0.18, 3.5); }
    ctx.restore();
    return path;
  }
  function jhumka(ctx, x, y, t, W, C) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(Math.sin(t * 2.3) * 0.18 + W * 0.15);
    fill(ctx, ellipse(0, 0.25, 0.3, 0.3), C.gold);
    paint(ctx, new Path2D('M-0.9 2.0 C-0.85 0.95 -0.45 0.62 0 0.62 C0.45 0.62 0.85 0.95 0.9 2.0 Z'), C.gold, -0.9, 0.9, { k: 0.25, lw: 0.07, rw: 0.14 });
    if (!st.sil) for (let i = -2; i <= 2; i++) { ctx.fillStyle = i % 2 ? C.goldL : '#B9822E'; ctx.beginPath(); ctx.arc(i * 0.42, 2.25, 0.15, 0, 7); ctx.fill(); }
    ctx.restore();
  }
  function helenHead(ctx, C, t, W, o) {
    const expr = o.expr || 'smile';
    ctx.save();
    const tilt = (o.tilt || 0) + (expr === 'wonder' ? -0.11 : 0) + Math.sin(t * 0.9) * 0.012;
    ctx.translate(0.3, -84); ctx.rotate(tilt); ctx.translate(-0.3, 84);
    const face = smooth([[-4.1, -93.2], [-4.5, -90.6], [-4.3, -87.8], [-3.2, -85.3], [-1.2, -83.7], [0.8, -83.2], [2.6, -83.8], [3.9, -85.4], [4.8, -88.0], [5.0, -91.2], [4.4, -94.4], [2.6, -96.4], [0.0, -96.9], [-2.6, -96.2]], true);
    paint(ctx, face, C.skin, -4.5, 5.0, { k: 0.12, rw: 0.3 });
    if (!st.sil) {
      ctx.save(); ctx.clip(face);
      const sh = ctx.createLinearGradient(0, -96.5, 0, -83); sh.addColorStop(0, 'rgba(60,20,30,.32)'); sh.addColorStop(0.27, 'rgba(60,20,30,0)'); ctx.fillStyle = sh; ctx.fillRect(-6, -97, 12, 15);
      const jw = ctx.createLinearGradient(0, -88, 0, -83); jw.addColorStop(0, 'rgba(90,30,30,0)'); jw.addColorStop(1, 'rgba(90,30,30,.18)'); ctx.fillStyle = jw; ctx.fillRect(-6, -88, 12, 6);
      for (const [bx, by, br] of [[-2.5, -87.4, 1.6], [3.4, -87.6, 1.15]]) { const g = ctx.createRadialGradient(bx, by, 0, bx, by, br); g.addColorStop(0, F.rgba(C.blush, expr === 'teary' || expr === 'wonder' ? 0.52 : 0.38)); g.addColorStop(1, F.rgba(C.blush, 0)); ctx.fillStyle = g; ctx.fillRect(bx - br, by - br, br * 2, br * 2); }
      ctx.restore();
      const es = expr === 'closed' ? 'closed' : expr === 'laugh' ? 'smileClosed' : expr === 'wonder' ? 'wide' : blink(t, 'open', 0.7), gy = expr === 'wonder' ? -0.95 : 0, gx = o.look || 0;
      eye(ctx, -1.45, -89.7, 2.75, es, gx, gy, C);
      eye(ctx, 2.75, -89.8, 2.25, es, gx, gy, C);
      if (expr === 'teary') { ctx.fillStyle = 'rgba(255,255,255,.9)'; ctx.beginPath(); ctx.arc(-0.65, -88.8, 0.24, 0, 7); ctx.arc(3.3, -88.9, 0.2, 0, 7); ctx.fill(); }
      const bu = expr === 'wonder' ? -0.45 : 0;
      fill(ctx, new Path2D(`M-3.0 ${-91.7 + bu} C-2.1 ${-92.7 + bu} -0.8 ${-92.9 + bu} 0.1 ${-92.3 + bu} C-0.8 ${-92.45 + bu} -2.0 ${-92.3 + bu} -3.0 ${-91.7 + bu} Z`), '#24161A');
      fill(ctx, new Path2D(`M1.7 ${-92.45 + bu} C2.6 ${-92.85 + bu} 3.6 ${-92.6 + bu} 4.2 ${-91.75 + bu} C3.5 ${-92.2 + bu} 2.6 ${-92.35 + bu} 1.7 ${-92.45 + bu} Z`), '#24161A');
      stroke(ctx, new Path2D('M1.8 -89.0 C2.05 -88.0 2.45 -87.3 2.15 -86.85 C1.85 -86.55 1.3 -86.65 1.05 -86.85'), F.rgba(C.skinD, 0.85), 0.2);
      ctx.fillStyle = 'rgba(255,220,190,.35)'; ctx.beginPath(); ctx.ellipse(1.75, -87.6, 0.18, 0.5, 0.2, 0, 7); ctx.fill();
      if (expr === 'laugh') {
        fill(ctx, new Path2D('M-0.6 -85.5 C0.4 -85.15 1.65 -85.15 2.45 -85.5 C2.15 -84.0 1.3 -83.7 0.85 -83.7 C0.0 -83.8 -0.4 -84.5 -0.6 -85.5 Z'), '#6B1E2A');
        fill(ctx, new Path2D('M-0.35 -85.38 C0.5 -85.1 1.55 -85.1 2.2 -85.38 L2.05 -84.95 C1.35 -84.8 0.4 -84.8 -0.2 -84.95 Z'), '#FFF6EE');
        fill(ctx, ellipse(0.95, -84.05, 0.6, 0.25), '#D4626E');
      } else if (expr === 'wonder') fill(ctx, ellipse(0.95, -84.8, 0.55, 0.45), '#6B1E2A');
      else {
        stroke(ctx, new Path2D('M-0.5 -85.2 C0.3 -84.6 1.45 -84.5 2.35 -85.1'), C.lip, 0.32);
        fill(ctx, new Path2D('M0.05 -84.8 C0.7 -84.32 1.55 -84.32 1.95 -84.8 C1.45 -84.58 0.6 -84.58 0.05 -84.8 Z'), F.rgba(C.lip, 0.6));
        stroke(ctx, new Path2D('M-0.6 -85.25 C-0.75 -85.0 -0.75 -84.85 -0.6 -84.75'), F.rgba(C.skinD, 0.5), 0.12);
      }
      fill(ctx, ellipse(0.55, -92.95, 0.27, 0.3), C.bindi);
    }
    // front hair: one shape – crown, soft centre part, curtain down the far side, tucked behind the ear on the near side
    const fx = Math.sin(t * 1.9) * 0.18 + W * 0.3;
    const fh = smooth([[-4.7, -88.6], [-5.4, -91.4], [-5.3, -94.6], [-3.9, -97.0], [-1.2, -98.25], [1.4, -98.35], [4.0, -97.5], [5.6, -95.4], [6.1, -92.2], [6.1 + fx * 0.3, -88.0], [6.3 + fx * 0.7, -83.4], [6.9 + fx, -79.2], [5.5 + fx * 0.8, -79.6], [5.0 + fx * 0.5, -84.2], [4.75, -88.4], [4.5, -92.0], [3.5, -94.7], [1.25, -95.95], [-1.0, -95.5], [-2.9, -94.4], [-4.0, -92.6], [-4.3, -90.4]], true);
    paint(ctx, fh, C.hair, -5.5, 7, { k: 0.08, rw: 0.24, ra: 0.6 });
    if (!st.sil) {
      ctx.save(); ctx.clip(fh);
      const sh = ctx.createRadialGradient(-0.6, -97.4, 0, -0.6, -97.4, 3.6); sh.addColorStop(0, F.rgba('#8E7AA8', 0.55)); sh.addColorStop(1, F.rgba('#8E7AA8', 0)); ctx.fillStyle = sh; ctx.fillRect(-5, -100, 10, 6);
      stroke(ctx, new Path2D('M-2.9 -96.7 C-1.6 -97.6 0.4 -97.9 2.2 -97.5'), F.rgba('#B9A6D6', 0.35), 0.14);
      stroke(ctx, new Path2D('M1.3 -98.4 L1.25 -96.0'), F.rgba(C.hairHi, 0.7), 0.16);
      for (let i = 0; i < 3; i++) stroke(ctx, new Path2D(`M${4.9 + i * 0.4} -93 C${5.1 + i * 0.4} -89 ${5.3 + i * 0.5 + fx * 0.5} -84 ${5.7 + i * 0.4 + fx} -80`), F.rgba(C.hairHi, 0.4), 0.15);
      ctx.restore();
    }
    // ear in front of the tucked hair, then the jhumka
    paint(ctx, new Path2D('M-3.9 -90.9 C-5.2 -91.2 -5.5 -88.7 -4.3 -87.5 C-3.9 -87.3 -3.6 -88.0 -3.6 -88.5 Z'), C.skin, -5.3, -3.6, { rw: 0.18 });
    if (!st.sil) stroke(ctx, new Path2D('M-4.1 -90.3 C-4.7 -90.2 -4.8 -89.0 -4.3 -88.4'), F.rgba(C.skinD, 0.6), 0.12);
    jhumka(ctx, -4.4, -87.6, t, W, C);
    for (let i = 0; i < 3; i++) { // flyaways
      const p = new Path2D(), y0 = -96.4 + i * 1.5, x0 = 0.8 - i * 2;
      p.moveTo(x0, y0); p.bezierCurveTo(x0 + W * 3, y0 - 1 + Math.sin(t * 3 + i) * 0.8, x0 + W * 6, y0 + 1 + Math.sin(t * 2.6 + i * 2) * 1.2, x0 + W * (8 + i * 1.5), y0 + 2.5 + Math.sin(t * 2.2 + i) * 1.5);
      stroke(ctx, p, F.rgba(C.hair, 0.7), 0.11);
    }
    ctx.restore();
  }
  function bag(ctx, C, t, x, y) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(-0.1 + Math.sin(t * 1.6) * 0.04);
    const b = new Path2D(); b.roundRect(-2.4, -1.6, 4.8, 3.7, 0.9);
    paint(ctx, b, C.bag, -2.4, 2.4, { k: 0.16 });
    fill(ctx, new Path2D('M-2.4 -1.0 C-2.4 -1.6 -1.9 -1.6 -1.5 -1.6 L1.5 -1.6 C1.9 -1.6 2.4 -1.6 2.4 -1.0 L2.4 0.5 C0.9 1.0 -0.9 1.0 -2.4 0.5 Z'), st.sil || F.shade(C.bag, -0.2));
    fill(ctx, ellipse(0, 0.62, 0.34, 0.34), C.gold);
    ctx.restore();
  }
  function helenFront(ctx, o, t, W, P) {
    const C = HELEN;
    palluTail(ctx, C, t, W, [-8.0, -79.4]);
    hairBack(ctx, C, t, W, false);
    sareeSkirt(ctx, C, t, W, false);
    paint(ctx, new Path2D('M-1.8 -85 L-2.0 -79.4 C-0.8 -78.6 1.6 -78.6 2.6 -79.2 L2.2 -84.6 Z'), C.skin, -2.0, 2.6, { rim: false });
    if (!st.sil) { ctx.fillStyle = 'rgba(70,25,20,.35)'; ctx.beginPath(); ctx.ellipse(0.5, -84.0, 2.6, 0.9, 0, 0, 7); ctx.fill(); }
    paint(ctx, smooth([[-5.9, -65.2], [5.9, -65.2], [5.7, -62.4], [6.0, -59.6], [-5.8, -59.6], [-5.5, -62.4]], true), C.skin, -6, 6, { k: 0.1 });
    paint(ctx, smooth([[-2.7, -80.5], [-6.1, -80.1], [-8.3, -78.7], [-8.1, -75.5], [-7.7, -71.5], [-6.7, -67.5], [-5.9, -64.8], [5.9, -64.8], [6.9, -67.6], [7.9, -71.5], [8.4, -75.5], [8.6, -78.7], [6.5, -80.1], [3.0, -80.5], [0.3, -77.4]], true), C.blouse, -8.3, 8.6);
    // pallu draped across the chest from the right hip to the left shoulder
    const pc = smooth([[8.9, -58.6], [3.7, -67.6], [-1.3, -75.3], [-4.3, -81.0], [-8.5, -79.7], [-8.1, -75.0], [-4.6, -68.8], [0.6, -60.4], [5.0, -53.2], [8.7, -50.0]], true);
    paint(ctx, pc, C.saree, -8.5, 8.9, { k: 0.12 });
    if (!st.sil) {
      ctx.save(); ctx.clip(pc);
      stroke(ctx, new Path2D('M7.4 -55.6 C3 -62 -1 -69 -4.6 -77.6'), F.rgba(C.sareeD, 0.55), 0.5);
      stroke(ctx, new Path2D('M6.4 -52.8 C2.4 -58.6 -1.4 -65.2 -5.6 -73.6'), F.rgba(C.sareeL, 0.4), 0.35);
      ctx.restore();
      stroke(ctx, smooth([[8.9, -58.6], [3.7, -67.6], [-1.3, -75.3], [-4.3, -81.0]], false), C.gold, 0.7);
      stroke(ctx, smooth([[-8.4, -79.4], [-8.0, -75.0], [-4.5, -68.8], [0.7, -60.4], [5.0, -53.2], [8.7, -50.0]], false), C.gold, 0.6);
    }
    stroke(ctx, new Path2D('M6.5 -79.8 C2.5 -73 -2.5 -64.5 -6.6 -56.8'), st.sil || F.shade(C.bag, -0.12), 0.55);
    bag(ctx, C, t, -7.9, -55.0);
    helenHead(ctx, C, t, W, o);
    helenArm(ctx, P.L, C, false); helenArm(ctx, P.R, C, true);
  }
  function helenBack(ctx, o, t, W) {
    const C = HELEN;
    sareeSkirt(ctx, C, t, W, true);
    paint(ctx, smooth([[-5.9, -65.2], [5.9, -65.2], [5.7, -62.4], [6.0, -59.6], [-5.8, -59.6], [-5.5, -62.4]], true), C.skin, -6, 6);
    paint(ctx, smooth([[-8.2, -78.9], [-8.1, -75.5], [-7.7, -71.5], [-6.7, -67.5], [-5.9, -64.8], [5.9, -64.8], [6.9, -67.6], [7.9, -71.5], [8.4, -75.5], [8.5, -78.9], [4, -80.6], [-4, -80.6]], true), C.blouse, -8.3, 8.6);
    helenArm(ctx, [[-7.7, -78.2], [-9.4, -67.4], [-9.0, -57.4]], C, false);
    helenArm(ctx, [[8.0, -78.2], [9.8, -67.6], [9.2, -57.8]], C, true);
    bag(ctx, C, t, 8.2, -55.4);
    const pd = smooth([[-8.3, -79.8], [-5.2, -80.8], [-3.0, -79.6], [-0.6, -71.5], [3.6, -63.0], [7.2, -56.6], [2.2, -55.8], [-2.2, -63.4], [-5.6, -71.6]], true);
    paint(ctx, pd, C.saree, -8.3, 7.2, { k: 0.12 });
    if (!st.sil) stroke(ctx, smooth([[-3.0, -79.6], [-0.6, -71.5], [3.6, -63.0], [7.2, -56.6]], false), C.gold, 0.6);
    palluTail(ctx, C, t, W, [-7.8, -79.0]);
    paint(ctx, ellipse(0.1, -91.3, 5.7, 6.7), C.hair, -5.8, 5.8, { k: 0.08, rw: 0.35 });
    jhumka(ctx, -5.0, -86.2, t, W, C); jhumka(ctx, 5.1, -86.2, t + 1, W, C);
    hairBack(ctx, C, t, W, true);
    if (!st.sil) stroke(ctx, new Path2D('M-3.8 -95.8 C-1.6 -97.6 1.6 -97.6 3.8 -95.8'), F.rgba(C.hairHi, 0.85), 0.55);
  }

  // =====================================================================================  THE BOY
  const BP = {
    stand: { L: [[-9.2, -80.6], [-10.7, -66.6], [-10.3, -54.6]], R: [[9.4, -80.6], [11.0, -66.6], [10.6, -54.6]] },
    carry: { L: [[-9.2, -80.6], [-10.0, -69.0], [-2.8, -65.6]], R: [[9.4, -80.6], [10.2, -69.0], [2.8, -66.0]] },
    hands: { L: [[-9.2, -80.6], [-10.4, -67.0], [-7.6, -56.2]], R: [[9.4, -80.6], [10.8, -67.0], [8.0, -56.0]] } // hands near pockets
  };
  F.boy = (ctx, o) => {
    const fl = F.begin(ctx, o), t = o.t || 0, W = (o.wind == null ? -0.7 : o.wind) * fl;
    const walk = o.pose === 'walk', ph = o.phase != null ? o.phase : t * 4.2;
    if (walk) ctx.translate(0, -Math.abs(Math.sin(ph)) * 0.9);
    let P = BP[o.pose] || BP.stand;
    if (walk) { const s = Math.sin(ph) * 0.16, d = o.view === 'back' ? -1 : 1; P = { L: [[-9.2, -80.6], [-10.7 - s * 9 * d, -67], [-10.3 - s * 16 * d, -55.2]], R: [[9.4, -80.6], [11.0 + s * 9 * d, -67], [10.6 + s * 16 * d, -55.2]] }; }
    if (o.reach) { const tg = F.toLocal(o, o.reach[0], o.reach[1]), side = tg[0] < 0 ? 'L' : 'R'; P = { ...P, [side]: F.ik(P[side][0], tg, 14.2, 12.4, side === 'L' ? -1 : 1) }; }
    if (o.view === 'back') boyBack(ctx, o, t, W, walk, ph, P); else boyFront(ctx, o, t, W, walk, ph, P);
    F.end(ctx);
  };
  function boyLegs(ctx, C, walk, ph, stride = 0.1) {
    const leg = (hx, a1, a2) => { const hip = [hx, -46.5], kn = [hx + Math.sin(a1) * 22.5, -46.5 + Math.cos(a1) * 22.5], an = [kn[0] + Math.sin(a2) * 21.5, kn[1] + Math.cos(a2) * 21.5]; return [hip, kn, an]; };
    let l, r;
    if (walk) {
      // seen from front/back the legs move in depth: the lifting foot rises and the shin foreshortens
      const side = (hx, p) => { const lift = Math.max(0, Math.sin(p)), sw = Math.cos(p) * stride, hip = [hx, -46.5], kn = [hx + Math.sin(sw) * 22.5, -46.5 + 22.5 - lift * 1.6]; return [hip, kn, [kn[0], kn[1] + 21.5 * (1 - lift * 0.42)]]; };
      l = side(-3.8, ph); r = side(4.0, ph + Math.PI);
    }
    else { l = leg(-4.0, -0.03, 0.0); r = leg(4.2, 0.03, 0.02); }
    for (const [hip, kn, an] of [l, r]) {
      limb(ctx, kn, an, 5.4, 4.6, C.pant, { k: 0.16 });
      limb(ctx, hip, kn, 6.8, 5.6, C.pant, { k: 0.16 });
      if (!st.sil) stroke(ctx, new Path2D(`M${hip[0] + 0.6} ${hip[1] + 3} L${kn[0] + 0.4} ${kn[1]} L${an[0] + 0.3} ${an[1] - 1}`), 'rgba(255,255,255,.07)', 0.4);
      const sh = new Path2D(`M${an[0] - 2.4} ${an[1] - 1.2} C${an[0] - 2.8} ${an[1] + 1.8} ${an[0] + 5.0} ${an[1] + 2.4} ${an[0] + 4.8} ${an[1] + 0.4} C${an[0] + 3.4} ${an[1] - 1.6} ${an[0] + 1} ${an[1] - 2} ${an[0] - 2.4} ${an[1] - 1.2} Z`);
      paint(ctx, sh, C.shoe, an[0] - 2.6, an[0] + 5, { k: 0.22 });
    }
  }
  function boyArm(ctx, j, C) {
    const [a, b, c] = j;
    limb(ctx, b, c, 2.75, 2.15, C.skin);
    hand(ctx, b, c, C.skin, 1.2);
    limb(ctx, a, b, 4.1, 3.5, C.shirt, { k: 0.1 });
    const r0 = [a[0] + (b[0] - a[0]) * 0.8, a[1] + (b[1] - a[1]) * 0.8];
    limb(ctx, r0, b, 4.3, 4.1, C.shirt, { k: 0.2 });
    if (!st.sil) { cross(ctx, a, b, 0.86, 4.0, F.rgba(C.shirtD, 0.7), 0.18); cross(ctx, a, b, 0.93, 4.0, F.rgba(C.shirtD, 0.5), 0.14); }
  }
  function hairCurls(ctx, C, t, W, cx, cy, back) {
    // a mass of round curls: a scalloped outline (each scallop is one curl), a curly fringe and soft curl marks inside
    const jig = Math.sin(t * 1.8) * 0.06 + W * 0.1, base = [];
    const a0 = back ? 0.25 : Math.PI * 1.03, a1 = back ? Math.PI * 2.75 : Math.PI * 2.02, N = back ? 15 : 12;
    for (let i = 0; i <= N; i++) { const a = a0 + (a1 - a0) * i / N; base.push([cx + Math.cos(a) * 6.3 + jig * (1 - Math.sin(a)) * 0.5, cy + Math.sin(a) * 5.7]); }
    const line = back ? [[cx + 3.4, cy + 5.4], [cx, cy + 6.2], [cx - 3.4, cy + 5.4]] : [[5.0, -95.4], [3.4, -96.9], [1.6, -97.4], [-0.3, -97.3], [-2.2, -97.5], [-3.8, -96.6], [-4.9, -94.6]];
    const path = new Path2D(); path.moveTo(base[0][0], base[0][1]);
    for (let i = 1; i < base.length; i++) { // outward scallop between consecutive points
      const p = base[i - 1], q = base[i], mx = (p[0] + q[0]) / 2, my = (p[1] + q[1]) / 2, dx = mx - cx, dy = my - cy, d = Math.hypot(dx, dy) || 1, k = 1.25 + 0.25 * Math.sin(i * 2.3);
      path.quadraticCurveTo(mx + dx / d * k * 1.6, my + dy / d * k * 1.6, q[0], q[1]);
    }
    for (let i = 0; i < line.length; i++) { const p = i ? line[i - 1] : base[base.length - 1], q = line[i], mx = (p[0] + q[0]) / 2, my = (p[1] + q[1]) / 2; path.quadraticCurveTo(mx, my + (back ? 0.6 : 0.7), q[0], q[1]); }
    path.closePath();
    paint(ctx, path, C.hair, cx - 7, cx + 7, { k: 0.08, rw: 0.36, ra: 0.85 });
    if (st.sil) return;
    ctx.save(); ctx.clip(path);
    const r = F.rng(17);
    for (let i = 0; i < 26; i++) {
      const a = r() * Math.PI * 2, d = Math.sqrt(r()) * 5.6, x = cx + Math.cos(a) * d, y = cy + Math.sin(a) * d * 0.9 - 0.8, rr = 0.55 + r() * 0.4, s0 = r() * 6;
      const q = new Path2D(); q.arc(x + jig, y, rr, s0, s0 + 3.2); stroke(ctx, q, F.rgba(i % 3 ? C.hairHi : '#806A5C', i % 3 ? 0.42 : 0.32), 0.17);
    }
    const sh = ctx.createRadialGradient(cx - 2, cy - 3.5, 0, cx - 2, cy - 3.5, 4); sh.addColorStop(0, 'rgba(150,120,110,.35)'); sh.addColorStop(1, 'rgba(150,120,110,0)'); ctx.fillStyle = sh; ctx.fillRect(cx - 7, cy - 8, 12, 9);
    ctx.restore();
  }
  function boyFront(ctx, o, t, W, walk, ph, P) {
    const C = BOY, expr = o.expr || 'smile';
    boyLegs(ctx, C, walk, ph, o.stride);
    paint(ctx, new Path2D('M-2.1 -86.8 L-2.3 -82.2 L2.9 -82.0 L2.7 -86.4 Z'), C.skin, -2.3, 2.9, { rim: false });
    const hw = i => Math.sin(t * 3.2 + i * 1.3) * 0.45 + W * 0.9 * (i / 4);
    const shirt = smooth([[-3.3, -83.6], [-7.0, -83.0], [-9.9, -81.3], [-10.3, -76], [-9.9, -68], [-9.7, -58], [-9.9 + hw(0) * 0.5, -50], [-9.7 + hw(1), -46.3], [-4, -45.6 + hw(2) * 0.3], [3, -45.6 + hw(3) * 0.3], [9.9 + hw(4), -46.3], [10.1 + hw(4) * 0.5, -50], [9.9, -58], [10.1, -68], [10.5, -76], [10.1, -81.3], [7.4, -83.0], [3.7, -83.6], [0.5, -77.8]], true);
    paint(ctx, shirt, C.shirt, -10.3, 10.5, { k: 0.1 });
    if (!st.sil) {
      ctx.save(); ctx.clip(shirt);
      const sh = ctx.createLinearGradient(0, -80, 0, -45); sh.addColorStop(0, 'rgba(150,130,190,0)'); sh.addColorStop(1, 'rgba(150,130,190,.28)'); ctx.fillStyle = sh; ctx.fillRect(-11, -84, 22, 40);
      for (const [x0, x1] of [[-6.5, -7.2], [6.8, 7.4], [-3, -3.8]]) stroke(ctx, new Path2D(`M${x0} -73 C${x0 + 0.4} -64 ${x1} -56 ${x1 - 0.2} -47`), F.rgba(C.shirtD, 0.45), 0.25);
      ctx.restore();
      ctx.fillStyle = F.rgba(C.skinD, 0.95); ctx.beginPath(); ctx.moveTo(-2.9, -83.3); ctx.quadraticCurveTo(-0.6, -80.4, 0.5, -77.9); ctx.quadraticCurveTo(1.6, -80.4, 3.4, -83.3); ctx.closePath(); ctx.fill();
      stroke(ctx, new Path2D('M0.5 -77.8 L0.8 -46'), F.rgba(C.shirtD, 0.9), 0.2);
      for (let i = 0; i < 4; i++) { ctx.fillStyle = '#E3DCE6'; ctx.beginPath(); ctx.arc(1.25, -73.5 + i * 7, 0.34, 0, 7); ctx.fill(); }
      const pk = new Path2D('M3.6 -76.4 L7.4 -76.6 L7.4 -72.6 C6.2 -72.0 4.8 -72.0 3.6 -72.6 Z'); stroke(ctx, pk, F.rgba(C.shirtD, 0.7), 0.16);
    }
    paint(ctx, new Path2D('M-3.4 -83.8 C-3.8 -82.4 -3.2 -80.6 -0.2 -77.9 L-1.4 -82.2 L-2.0 -84.4 Z'), C.shirt, -3.8, -0.2, { k: 0.22 });
    paint(ctx, new Path2D('M3.9 -83.8 C4.3 -82.4 3.7 -80.6 1.2 -77.7 L2.0 -82.2 L2.7 -84.4 Z'), C.shirt, 1.2, 4.3, { k: 0.22 });
    // head
    ctx.save(); ctx.translate(0.3, -86); ctx.rotate((o.tilt || 0) + Math.sin(t * 0.8) * 0.01); ctx.translate(-0.3, 86);
    paint(ctx, new Path2D('M-4.4 -94.0 C-5.9 -94.4 -6.2 -91.3 -4.8 -90.2 C-4.4 -90.0 -4.1 -90.6 -4.1 -91.3 Z'), C.skin, -6, -4, { rw: 0.18 });
    const face = smooth([[-4.6, -97.0], [-4.9, -93.5], [-4.6, -90.0], [-3.4, -87.2], [-1.1, -85.4], [1.2, -85.0], [3.2, -85.8], [4.7, -88.4], [5.4, -92.0], [5.3, -95.8], [4.2, -98.8], [1.6, -100.4], [-1.8, -100.2], [-3.9, -98.8]], true);
    paint(ctx, face, C.skin, -4.9, 5.4, { k: 0.12, rw: 0.3 });
    if (!st.sil) {
      ctx.save(); ctx.clip(face);
      const sh = ctx.createLinearGradient(0, -100, 0, -85); sh.addColorStop(0, 'rgba(40,15,20,.32)'); sh.addColorStop(0.28, 'rgba(40,15,20,0)'); ctx.fillStyle = sh; ctx.fillRect(-6, -101, 12, 16);
      const jw = ctx.createLinearGradient(0, -90, 0, -85); jw.addColorStop(0, 'rgba(50,20,20,0)'); jw.addColorStop(1, 'rgba(50,20,20,.2)'); ctx.fillStyle = jw; ctx.fillRect(-6, -90, 12, 6);
      const g = ctx.createRadialGradient(-2.6, -90.8, 0, -2.6, -90.8, 1.7); g.addColorStop(0, 'rgba(220,90,90,.2)'); g.addColorStop(1, 'rgba(220,90,90,0)'); ctx.fillStyle = g; ctx.fillRect(-4.6, -93, 4, 4);
      ctx.restore();
      const es = expr === 'closed' ? 'closed' : blink(t, 'open', 2.1), gx = o.look || 0, gy = expr === 'emotional' ? -0.2 : 0;
      eye(ctx, -1.55, -93.2, 2.75, es, gx, gy, C);
      eye(ctx, 2.95, -93.3, 2.3, es, gx, gy, C);
      if (expr === 'emotional') { ctx.fillStyle = 'rgba(255,255,255,.85)'; ctx.beginPath(); ctx.arc(-0.75, -92.4, 0.21, 0, 7); ctx.fill(); }
      const bu = expr === 'emotional' ? -0.2 : 0, bt = expr === 'emotional' ? 0.25 : 0;
      fill(ctx, new Path2D(`M-3.4 ${-95.2 + bu} C-2.3 ${-96.5 + bu - bt} -0.6 ${-96.6 + bu} 0.35 ${-95.95 + bu} L0.25 ${-95.3 + bu} C-0.8 ${-95.85 + bu} -2.3 ${-95.6 + bu} -3.4 ${-95.2 + bu} Z`), '#150D0D');
      fill(ctx, new Path2D(`M1.75 ${-96.0 + bu} C2.7 ${-96.65 + bu - bt} 4.0 ${-96.45 + bu} 4.75 ${-95.4 + bu} L4.6 ${-95.0 + bu} C3.8 ${-95.75 + bu} 2.7 ${-95.65 + bu} 1.75 ${-95.4 + bu} Z`), '#150D0D');
      stroke(ctx, new Path2D('M2.3 -92.0 C2.8 -90.9 3.2 -90.1 2.75 -89.5 C2.25 -89.0 1.5 -89.2 1.15 -89.5'), F.rgba(C.skinD, 1), 0.24);
      ctx.fillStyle = 'rgba(255,210,170,.3)'; ctx.beginPath(); ctx.ellipse(2.2, -91.3, 0.2, 0.7, 0.25, 0, 7); ctx.fill();
      stroke(ctx, new Path2D('M-0.3 -87.9 C0.6 -87.25 1.9 -87.25 2.75 -87.95'), C.lip, 0.34);
      stroke(ctx, new Path2D('M0.4 -87.0 C0.9 -86.8 1.5 -86.8 2.0 -87.0'), F.rgba(C.skinD, 0.6), 0.16);
    }
    hairCurls(ctx, C, t, W, 0.3, -98.8, false);
    ctx.restore();
    boyArm(ctx, P.L, C); boyArm(ctx, P.R, C);
  }
  function boyBack(ctx, o, t, W, walk, ph, P) {
    const C = BOY;
    boyLegs(ctx, C, walk, ph + Math.PI, o.stride);
    boyArm(ctx, P.L, C); boyArm(ctx, P.R, C);
    const hw = i => Math.sin(t * 3.2 + i * 1.3) * 0.45 + W * 0.9 * (i / 4);
    const shirt = smooth([[-3.4, -83.6], [-7.0, -83.0], [-9.9, -81.3], [-10.3, -76], [-9.9, -68], [-9.7, -58], [-9.9 + hw(0) * 0.5, -50], [-9.7 + hw(1), -46.3], [-4, -45.6 + hw(2) * 0.3], [3, -45.6 + hw(3) * 0.3], [9.9 + hw(4), -46.3], [10.1 + hw(4) * 0.5, -50], [9.9, -58], [10.1, -68], [10.5, -76], [10.1, -81.3], [7.4, -83.0], [3.8, -83.6], [0.3, -82.8]], true);
    paint(ctx, new Path2D('M-2.3 -87.2 L-2.4 -82.4 L2.9 -82.4 L2.8 -87.2 Z'), C.skin, -2.4, 2.9, { rim: false });
    paint(ctx, shirt, C.shirt, -10.3, 10.5, { k: 0.1 });
    if (!st.sil) {
      ctx.save(); ctx.clip(shirt);
      const sh = ctx.createLinearGradient(0, -80, 0, -45); sh.addColorStop(0, 'rgba(150,130,190,0)'); sh.addColorStop(1, 'rgba(150,130,190,.28)'); ctx.fillStyle = sh; ctx.fillRect(-11, -84, 22, 40);
      ctx.restore();
      stroke(ctx, new Path2D('M-9.4 -76.4 C-3 -74.8 3 -74.8 9.8 -76.4'), F.rgba(C.shirtD, 0.6), 0.22);
      stroke(ctx, new Path2D('M0.3 -75 L0.4 -46'), F.rgba(C.shirtD, 0.35), 0.2);
      stroke(ctx, new Path2D('M-3.4 -83.8 C-1 -85.0 1.4 -85.0 3.8 -83.8'), F.rgba(C.shirtD, 0.9), 0.55);
    }
    paint(ctx, new Path2D('M-4.7 -94.4 C-6.0 -94.6 -6.2 -91.6 -4.9 -90.8 Z'), C.skin, -6, -4.7, { rw: 0.18 });
    paint(ctx, new Path2D('M5.3 -94.4 C6.6 -94.6 6.8 -91.6 5.5 -90.8 Z'), C.skin, 5.3, 6.8, { rw: 0.18 });
    paint(ctx, ellipse(0.3, -93.8, 4.9, 6.0), C.skin, -4.6, 5.2);
    hairCurls(ctx, C, t, W, 0.3, -97.6, true);
  }

  // =====================================================================================  JESSI (sitting, facing right)
  F.jessi = (ctx, o) => {
    F.begin(ctx, o); const t = o.t || 0, C = DOG, look = o.look || 0;
    ctx.save(); ctx.translate(-9.6, -3.5); ctx.rotate(-0.4 + Math.sin(t * 9) * 0.35);
    paint(ctx, capsule([0, 0], [-7, -2.5], 2.2, 0.9), C.fur, -7, 0, { k: 0.25 }); ctx.restore();
    paint(ctx, ellipse(-5.6, -8.2, 6.6, 7.6, -0.15), C.fur, -12, 1, { k: 0.25, rw: 0.45 });
    paint(ctx, new Path2D('M-10.6 -6 C-11.2 -14 -8.6 -21 -3.2 -27.5 C-1.4 -30 2.2 -31 4.4 -28 C6.2 -25 5.8 -18 4.8 -12 C4.4 -7 4.4 -3 4.6 0 L-3 0 C-6.6 -0.6 -10 -2 -10.6 -6 Z'), C.fur, -11, 6, { k: 0.25, rw: 0.45 });
    for (const x of [0.6, 3.0]) paint(ctx, capsule([x, -14], [x + 0.3, -0.8], 2.4, 2.0), C.fur, x - 1.4, x + 1.6, { k: 0.25 });
    for (const x of [1.2, 3.6]) paint(ctx, ellipse(x + 0.2, -0.5, 1.6, 0.8), C.fur, x - 1.4, x + 1.8, { k: 0.25 });
    paint(ctx, ellipse(-6.6, -0.6, 2.8, 0.9), C.fur, -9.4, -3.8, { k: 0.25 });
    ctx.save(); ctx.translate(2.6, -29.5); ctx.rotate(look * 0.45 + Math.sin(t * 1.1) * 0.03); ctx.translate(-2.6, 29.5);
    if (!st.sil) { ctx.fillStyle = C.collar; ctx.fill(new Path2D('M-0.6 -28.4 C1.6 -27.0 4.2 -27.0 5.6 -28.8 L5.4 -30.0 C3.8 -28.6 1.4 -28.6 -0.4 -29.8 Z')); ctx.fillStyle = C.tag; ctx.beginPath(); ctx.arc(3.6, -27.3, 0.6, 0, 7); ctx.fill(); }
    paint(ctx, new Path2D('M-1.2 -34.5 C-1.2 -38.6 2 -40.6 5 -40 C7.6 -39.4 8.6 -37.4 9.2 -36.2 C10.8 -35.8 12.2 -35 12.4 -33.6 C12.6 -32 11.6 -31 10 -30.8 C8.4 -30.6 6.8 -30.8 5.4 -30.2 C3 -29.4 0.2 -30 -0.8 -32 C-1.1 -32.8 -1.2 -33.6 -1.2 -34.5 Z'), C.fur, -1.2, 12.4, { k: 0.25, rw: 0.45 });
    if (!st.sil) {
      ctx.fillStyle = C.nose; ctx.beginPath(); ctx.ellipse(12.0, -34.2, 0.9, 0.7, 0, 0, 7); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,.5)'; ctx.beginPath(); ctx.arc(11.8, -34.5, 0.22, 0, 7); ctx.fill();
      stroke(ctx, new Path2D('M11.6 -32.6 C10.6 -31.6 9 -31.8 8.2 -32.4'), '#08070A', 0.25);
      if (o.happy !== false) { ctx.fillStyle = C.tongue; ctx.fill(new Path2D('M9.4 -31.6 C9.4 -30 10.6 -29.4 11.0 -30.4 C11.2 -31 10.8 -31.6 10.6 -31.9 Z')); }
      ctx.fillStyle = '#2A1810'; ctx.beginPath(); ctx.ellipse(6.4, -36.4, 0.85, 0.95, 0, 0, 7); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(6.7, -36.8, 0.3, 0, 7); ctx.fill();
      stroke(ctx, new Path2D('M5.2 -37.8 C6 -38.4 7 -38.3 7.6 -37.6'), F.rgba(C.furHi, 0.8), 0.25);
    }
    ctx.save(); ctx.translate(2.4, -38.2); ctx.rotate(Math.sin(t * 2.2) * 0.08 + 0.05);
    paint(ctx, new Path2D('M-0.6 0 C1.6 -0.8 3.6 0.2 3.4 2.6 C3.2 5.2 2.2 7.6 0.8 8.0 C-0.6 8.2 -1.4 5 -1.4 2.6 C-1.4 1.2 -1.2 0.4 -0.6 0 Z'), F.shade(C.fur, -0.1), -1.4, 3.6, { k: 0.2 });
    ctx.restore(); ctx.restore();
    F.end(ctx);
  };

  // =====================================================================================  SNOWKI (sitting teddy, ~17 units)
  F.snowki = (ctx, o) => {
    F.begin(ctx, o); const C = BEAR, t = o.t || 0;
    for (const s of [-1, 1]) { paint(ctx, ellipse(s * 3.3, -1.6, 2.2, 1.7), C.fur, s * 3.3 - 2.2, s * 3.3 + 2.2); if (!st.sil) { ctx.fillStyle = C.pink; ctx.beginPath(); ctx.ellipse(s * 3.7, -1.3, 1.0, 0.85, 0, 0, 7); ctx.fill(); } }
    paint(ctx, ellipse(0, -5.4, 4.4, 4.6), C.fur, -4.4, 4.4, { rw: 0.3 });
    if (!st.sil) { ctx.fillStyle = C.belly; ctx.beginPath(); ctx.ellipse(0, -4.6, 2.6, 2.9, 0, 0, 7); ctx.fill(); }
    for (const s of [-1, 1]) paint(ctx, ellipse(s * 4.2, -6.4, 1.4, 2.4, s * 0.5), C.fur, s * 4.2 - 1.4, s * 4.2 + 1.4);
    for (const s of [-1, 1]) { paint(ctx, ellipse(s * 3.0, -15.6, 1.6, 1.6), C.fur, s * 3 - 1.6, s * 3 + 1.6); if (!st.sil) { ctx.fillStyle = C.pink; ctx.beginPath(); ctx.arc(s * 3.0, -15.6, 0.85, 0, 7); ctx.fill(); } }
    paint(ctx, ellipse(0, -12.2, 4.0, 3.7), C.fur, -4, 4, { rw: 0.3 });
    if (!st.sil) {
      ctx.fillStyle = C.belly; ctx.beginPath(); ctx.ellipse(0, -11.0, 1.8, 1.35, 0, 0, 7); ctx.fill();
      ctx.fillStyle = C.eye; ctx.beginPath(); ctx.ellipse(0, -11.6, 0.55, 0.4, 0, 0, 7); ctx.fill();
      for (const s of [-1, 1]) { ctx.beginPath(); ctx.arc(s * 1.55, -12.9, 0.42, 0, 7); ctx.fill(); }
      ctx.fillStyle = '#fff'; for (const s of [-1, 1]) { ctx.beginPath(); ctx.arc(s * 1.55 + 0.14, -13.05, 0.13, 0, 7); ctx.fill(); }
      stroke(ctx, new Path2D('M-0.6 -10.6 C-0.2 -10.2 0.2 -10.2 0.6 -10.6'), C.eye, 0.15);
      ctx.fillStyle = C.bow; ctx.save(); ctx.translate(0, -8.6); ctx.rotate(Math.sin(t * 2) * 0.05);
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.bezierCurveTo(-1.2, -1.6, -3.0, -1.2, -2.6, 0.2); ctx.bezierCurveTo(-2.4, 1.2, -1, 0.9, 0, 0); ctx.fill();
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.bezierCurveTo(1.2, -1.6, 3.0, -1.2, 2.6, 0.2); ctx.bezierCurveTo(2.4, 1.2, 1, 0.9, 0, 0); ctx.fill();
      ctx.fillStyle = F.shade(C.bow, -0.2); ctx.beginPath(); ctx.arc(0, 0, 0.55, 0, 7); ctx.fill(); ctx.restore();
    }
    F.end(ctx);
  };

  F.palettes = { HELEN, BOY, DOG, BEAR };
})();

/* Happy Birthday Helen Darlu – the seaside promenade at golden hour.
   World space is 1600 x 1000 (horizon at y=478). A camera {x, y, z} picks what is on screen; layers move with parallax. */
(function () {
  const F = window.Film;
  const HZ = 478, VP = [760, 488];
  F.HZ = HZ;
  F.depth = y => 6.8 * (y - HZ) / 522;          // character scale (px per unit) for feet at world y
  const WALL = { cap: [[-260, 762], [735, 485]], base: [[-260, 935], [740, 503]] };
  const lineY = (L, x) => L[0][1] + (L[1][1] - L[0][1]) * (x - L[0][0]) / (L[1][0] - L[0][0]);
  F.wallCapY = x => lineY(WALL.cap, x); F.wallBaseY = x => lineY(WALL.base, x);

  const SKY = ['#B29FDB', '#D6ACD3', '#F4A9BC', '#FBBE9C', '#FFD3A6'];
  const SUN = [470, 432];

  F.Promenade = class {
    constructor() {
      const r = F.rng(3);
      this.clouds = Array.from({ length: 6 }, (_, i) => ({ x: -200 + i * 360 + r() * 120, y: 90 + r() * 200, s: 0.7 + r() * 0.8, v: 3 + r() * 4, seed: r() * 100 }));
      this.buildings = []; let x = 880;
      while (x < 2300) { const w = 16 + r() * 30, h = 18 + r() * 60 * (1 - (x - 880) / 2600); this.buildings.push({ x, w, h, c: ['#F4C7C3', '#F6DDB8', '#C9C3E6', '#F3B8CB', '#E9D5C9', '#BFD8E3'][(r() * 6) | 0], win: r() > 0.3 }); x += w + r() * 4; }
      this.left = []; x = -900; while (x < 140) { const w = 14 + r() * 26, h = 10 + r() * 34; this.left.push({ x, w, h, c: ['#E7C2CC', '#D9C8E6', '#F1D2BE'][(r() * 3) | 0] }); x += w + r() * 6; }
      this.glints = Array.from({ length: 170 }, () => ({ u: r(), v: Math.pow(r(), 0.7), p: r() * 10, w: 0.5 + r() }));
      this.boats = [{ x: 260, y: 520, s: 0.7, c: '#E2447C' }, { x: 120, y: 600, s: 1.1, c: '#3FA0D8' }, { x: 640, y: 505, s: 0.45, c: '#F2B33D' }, { x: -60, y: 540, s: 0.8, c: '#ffffff' }];
      this.gulls = Array.from({ length: 7 }, (_, i) => ({ x: r() * 1600, y: 120 + r() * 260, s: 0.6 + r() * 0.7, v: 14 + r() * 18, p: r() * 6 }));
      this.kites = [{ x: 330, y: 170, c: '#E2447C', c2: '#FFD25A', s: 1 }, { x: 900, y: 120, c: '#7C5CD6', c2: '#44C2C9', s: 0.7 }, { x: 1420, y: 230, c: '#F28B3C', c2: '#FFFFFF', s: 0.55 }];
      this.walkers = Array.from({ length: 11 }, (_, i) => ({ d: r(), lane: 0.08 + r() * 0.42, v: (r() > 0.5 ? 1 : -1) * (0.012 + r() * 0.01), c: ['#E2447C', '#3FA0D8', '#F2B33D', '#7CC47A', '#9B7BD6', '#F28B3C', '#FFFFFF'][(r() * 7) | 0], c2: ['#2B2F3A', '#5A4E7A', '#E9D5C9', '#3E8E5A'][(r() * 4) | 0], p: r() * 6, kid: r() > 0.75 }));
      this.leaves = []; this.flowers = [];
      for (let i = 0; i < 130; i++) { const a = r(), b = r(); this.leaves.push({ x: 860 + a * 840, y: -80 + b * 360 + Math.pow(a, 2) * 40, r: 13 + r() * 20, c: r() > 0.5 ? '#3E8E5A' : '#2F7550', p: r() * 6 }); }
      for (let i = 0; i < 190; i++) { const a = r(), b = r(); this.flowers.push({ x: 840 + a * 860, y: -60 + b * 350 + (b > 0.8 ? r() * 40 : 0), r: 6 + r() * 12, c: ['#E2447C', '#F0609A', '#C9306A', '#FF86B5'][(r() * 4) | 0], p: r() * 6 }); }
      this.petals = Array.from({ length: 26 }, () => ({ x: 950 + r() * 600, y: 760 + r() * 220, a: r() * 6, c: r() > 0.5 ? '#E2447C' : '#FF86B5' }));
      this.motes = Array.from({ length: 70 }, () => ({ x: r() * 1800 - 100, y: r() * 1000, s: 0.6 + r() * 2.2, p: r() * 6, v: 4 + r() * 10 }));
      this.drift = Array.from({ length: 16 }, () => ({ x: r() * 1800, y: r() * 900, a: r() * 6, s: 0.7 + r() * 0.8, v: 40 + r() * 50, c: r() > 0.4 ? '#E2447C' : '#FF9CC2' }));
      this.fg = null;
    }

    // ---- camera helpers
    setView(ctx, W, H, cam, f) {
      const S = Math.max(W / 1600, H / 1000), z = 1 + (cam.z - 1) * Math.min(f, 1.25), cx = 800 + (cam.x - 800) * f, cy = 500 + (cam.y - 500) * f;
      ctx.setTransform(S * z * this.dpr, 0, 0, S * z * this.dpr, (W / 2 - cx * S * z) * this.dpr, (H / 2 - cy * S * z) * this.dpr);
    }

    draw(ctx, W, H, cam, t, o = {}) {
      this.dpr = o.dpr || 1; const wind = o.wind == null ? -0.7 : o.wind;
      // depth of field: when the camera pushes in, the background is drawn off-screen and softly blurred (rack focus)
      const dof = o.dof != null ? o.dof : F.clamp((cam.z - 2.2) * 1.6, 0, 7), main = ctx;
      if (dof > 0.3) {
        if (!this.bgc || this.bgc.width !== ctx.canvas.width || this.bgc.height !== ctx.canvas.height) { this.bgc = document.createElement('canvas'); this.bgc.width = ctx.canvas.width; this.bgc.height = ctx.canvas.height; }
        ctx = this.bgc.getContext('2d'); ctx.setTransform(1, 0, 0, 1, 0, 0);
      }
      this.setView(ctx, W, H, cam, 0.05); this.sky(ctx, t);
      this.setView(ctx, W, H, cam, 0.12); this.cloudsDraw(ctx, t);
      this.setView(ctx, W, H, cam, 0.18); this.kitesDraw(ctx, t, wind); this.gullsDraw(ctx, t);
      this.setView(ctx, W, H, cam, 0.25); this.city(ctx, t);
      this.setView(ctx, W, H, cam, 0.4); this.sea(ctx, t);
      this.setView(ctx, W, H, cam, 1);
      this.promenade(ctx, t, wind);
      if (ctx !== main) { main.setTransform(1, 0, 0, 1, 0, 0); main.filter = `blur(${(dof * this.dpr).toFixed(1)}px)`; main.drawImage(this.bgc, 0, 0); main.filter = 'none'; ctx = main; this.setView(ctx, W, H, cam, 1); }
      if (o.actors) o.actors(ctx, 'mid');        // things standing on the promenade (behind the tree)
      this.tree(ctx, t, wind);
      if (o.actors) o.actors(ctx, 'front');
      this.setView(ctx, W, H, cam, 1.1); this.particles(ctx, t, wind);
      this.setView(ctx, W, H, cam, 1.35); this.foreground(ctx, t);
      // grade: warm light from the sun side, a soft vignette, film grain
      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      const g = ctx.createRadialGradient(W * 0.3, H * 0.35, 0, W * 0.3, H * 0.35, Math.max(W, H) * 0.9);
      g.addColorStop(0, 'rgba(255,214,160,0.10)'); g.addColorStop(0.6, 'rgba(255,170,150,0.0)'); g.addColorStop(1, 'rgba(70,30,80,0.28)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      if (!o.noGrain) { ctx.globalAlpha = 0.5; ctx.fillStyle = ctx.createPattern(F.grain(), 'repeat'); ctx.translate((t * 37) % 192, (t * 53) % 192); ctx.fillRect(-192, -192, W + 384, H + 384); ctx.globalAlpha = 1; }
      ctx.setTransform(1, 0, 0, 1, 0, 0);
    }

    sky(ctx, t) {
      const g = ctx.createLinearGradient(0, -400, 0, HZ + 40);
      g.addColorStop(0, SKY[0]); g.addColorStop(0.3, SKY[1]); g.addColorStop(0.55, SKY[2]); g.addColorStop(0.82, SKY[3]); g.addColorStop(1, SKY[4]);
      ctx.fillStyle = g; ctx.fillRect(-1600, -800, 4800, HZ + 840);
      ctx.fillStyle = SKY[4]; ctx.fillRect(-1600, HZ, 4800, 900);
      // sun, glow and rays
      ctx.save(); ctx.globalCompositeOperation = 'screen';
      const gl = ctx.createRadialGradient(SUN[0], SUN[1], 0, SUN[0], SUN[1], 620);
      gl.addColorStop(0, 'rgba(255,250,230,1)'); gl.addColorStop(0.1, 'rgba(255,232,180,0.8)'); gl.addColorStop(0.4, 'rgba(255,190,150,0.22)'); gl.addColorStop(1, 'rgba(255,170,150,0)');
      ctx.fillStyle = gl; ctx.fillRect(SUN[0] - 640, SUN[1] - 640, 1280, 1280);
      for (let i = 0; i < 10; i++) {
        const a = i * 0.63 + t * 0.02, w = 0.05 + (i % 3) * 0.025;
        ctx.fillStyle = `rgba(255,236,200,${0.05 + 0.03 * Math.sin(t * 0.7 + i)})`;
        ctx.beginPath(); ctx.moveTo(SUN[0], SUN[1]); ctx.arc(SUN[0], SUN[1], 1400, a, a + w); ctx.closePath(); ctx.fill();
      }
      ctx.restore();
      const dg = ctx.createRadialGradient(SUN[0], SUN[1], 0, SUN[0], SUN[1], 56); dg.addColorStop(0, '#FFFFFB'); dg.addColorStop(0.7, '#FFF8E2'); dg.addColorStop(1, '#FFE9B8'); ctx.fillStyle = dg; ctx.beginPath(); ctx.arc(SUN[0], SUN[1], 56, 0, 7); ctx.fill();
      const sg = ctx.createRadialGradient(SUN[0], SUN[1], 40, SUN[0], SUN[1], 80); sg.addColorStop(0, 'rgba(255,240,200,.7)'); sg.addColorStop(1, 'rgba(255,240,200,0)'); ctx.fillStyle = sg; ctx.beginPath(); ctx.arc(SUN[0], SUN[1], 80, 0, 7); ctx.fill();
    }
    cloudsDraw(ctx, t) {
      for (const c of this.clouds) {
        const x = ((c.x + t * c.v + 400) % 2400) - 400, y = c.y, s = c.s;
        const g = ctx.createLinearGradient(0, y - 40 * s, 0, y + 30 * s);
        g.addColorStop(0, 'rgba(255,240,228,0.9)'); g.addColorStop(0.6, 'rgba(250,206,214,0.75)'); g.addColorStop(1, 'rgba(214,180,222,0.55)');
        ctx.fillStyle = g; ctx.beginPath();
        const r = F.rng(c.seed * 1000);
        for (let i = 0; i < 7; i++) { const dx = (i - 3) * 34 * s + (r() - 0.5) * 16, dy = -Math.sin((i / 6) * Math.PI) * 22 * s + (r() - 0.5) * 8; ctx.moveTo(x + dx + 40 * s, y + dy); ctx.ellipse(x + dx, y + dy, (34 + r() * 18) * s, (22 + r() * 10) * s, 0, 0, 7); }
        ctx.fill();
      }
    }
    kitesDraw(ctx, t, wind) {
      for (const k of this.kites) {
        const x = k.x + Math.sin(t * 0.7 + k.x) * 14, y = k.y + Math.sin(t * 1.1 + k.x) * 10, s = k.s * 18, a = Math.sin(t * 0.9 + k.x) * 0.2;
        ctx.save(); ctx.translate(x, y); ctx.rotate(a);
        ctx.fillStyle = k.c; ctx.beginPath(); ctx.moveTo(0, -s); ctx.lineTo(s * 0.7, 0); ctx.lineTo(0, s * 1.2); ctx.lineTo(-s * 0.7, 0); ctx.closePath(); ctx.fill();
        ctx.fillStyle = k.c2; ctx.beginPath(); ctx.moveTo(0, -s); ctx.lineTo(s * 0.7, 0); ctx.lineTo(0, 0); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = 'rgba(90,60,90,.5)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(0, s * 1.2);
        for (let i = 1; i <= 10; i++) ctx.lineTo(Math.sin(t * 3 + i * 0.8) * 6 * k.s - wind * i * 4 * k.s, s * 1.2 + i * 7 * k.s);
        ctx.stroke();
        for (let i = 2; i <= 8; i += 3) { ctx.fillStyle = i % 2 ? k.c2 : k.c; ctx.beginPath(); ctx.ellipse(Math.sin(t * 3 + i * 0.8) * 6 * k.s - wind * i * 4 * k.s, s * 1.2 + i * 7 * k.s, 4 * k.s, 2 * k.s, 0.5, 0, 7); ctx.fill(); }
        ctx.restore();
      }
    }
    gullsDraw(ctx, t) {
      ctx.strokeStyle = 'rgba(80,60,90,0.7)'; ctx.lineCap = 'round';
      for (const g of this.gulls) {
        const x = ((g.x + t * g.v) % 1900) - 150, y = g.y + Math.sin(t * 0.8 + g.p) * 12, s = g.s * 9, f = Math.sin(t * 7 + g.p) * 0.6;
        ctx.lineWidth = 1.6 * g.s; ctx.beginPath(); ctx.moveTo(x - s, y - f * s * 0.6); ctx.quadraticCurveTo(x - s * 0.5, y - s * 0.4 - f * s * 0.3, x, y); ctx.quadraticCurveTo(x + s * 0.5, y - s * 0.4 - f * s * 0.3, x + s, y - f * s * 0.6); ctx.stroke();
      }
    }
    city(ctx, t) {
      const haze = '#F8D2C4';
      // distant headland and town on the left, across the bay
      ctx.fillStyle = F.mix('#C9A9D6', haze, 0.55); ctx.beginPath(); ctx.moveTo(-1200, HZ); ctx.quadraticCurveTo(-500, HZ - 34, 200, HZ - 6); ctx.lineTo(240, HZ); ctx.closePath(); ctx.fill();
      for (const b of this.left) { ctx.fillStyle = F.mix(b.c, haze, 0.6); ctx.fillRect(b.x, HZ - 8 - b.h, b.w, b.h + 8); }
      // the town along the curving shore on the right
      for (const b of this.buildings) {
        const d = (b.x - 880) / 1420, y = HZ - 2 + d * 26, s = 1 - d * 0.35, h = b.h * s;
        ctx.fillStyle = F.mix(b.c, haze, 0.4 + d * 0.25); ctx.fillRect(b.x, y - h, b.w * s + 1, h + 30);
        ctx.fillStyle = F.mix(F.shade(b.c, 0.4), haze, 0.3); ctx.fillRect(b.x, y - h, b.w * s * 0.28, h + 30); // sunlit side
        if (b.win && h > 24) { ctx.fillStyle = 'rgba(255,240,210,.55)'; for (let wy = y - h + 5; wy < y - 4; wy += 7) for (let wx = b.x + 3; wx < b.x + b.w * s - 3; wx += 6) ctx.fillRect(wx, wy, 2, 3); }
      }
      // beach strip in front of the town
      ctx.fillStyle = F.mix('#F3D6B2', haze, 0.3); ctx.beginPath(); ctx.moveTo(760, HZ + 4); ctx.quadraticCurveTo(1300, HZ + 12, 2300, HZ + 52); ctx.lineTo(2300, HZ + 70); ctx.quadraticCurveTo(1300, HZ + 24, 760, HZ + 8); ctx.closePath(); ctx.fill();
    }
    sea(ctx, t) {
      const g = ctx.createLinearGradient(0, HZ, 0, 1100);
      g.addColorStop(0, '#A8D6D6'); g.addColorStop(0.08, '#7CCAD0'); g.addColorStop(0.35, '#3FB8C2'); g.addColorStop(1, '#1F7E9A');
      ctx.fillStyle = g; ctx.fillRect(-1600, HZ, 4800, 900);
      // horizon glow under the sun
      const hg = ctx.createRadialGradient(SUN[0], HZ, 0, SUN[0], HZ, 700); hg.addColorStop(0, 'rgba(255,236,196,.75)'); hg.addColorStop(1, 'rgba(255,236,196,0)');
      ctx.fillStyle = hg; ctx.fillRect(-300, HZ, 1500, 260);
      // rolling wave lines (perspective rows)
      ctx.lineCap = 'round';
      for (let i = 0; i < 22; i++) {
        const u = i / 21, y = HZ + 3 + Math.pow(u, 1.9) * 520, amp = 0.6 + u * 5, sp = 18 + u * 70, ph = t * (0.6 + u * 0.6) + i * 1.7;
        ctx.strokeStyle = `rgba(232,250,248,${0.18 + u * 0.22})`; ctx.lineWidth = 0.6 + u * 2.4;
        ctx.beginPath();
        for (let x = -900; x < 2300; x += sp) {
          const seg = sp * (0.35 + 0.3 * Math.sin(x * 0.013 + i)), yy = y + Math.sin(x * 0.02 + ph) * amp;
          if (Math.sin(x * 0.031 + i * 2.1 + t * 0.3) > -0.2) { ctx.moveTo(x, yy); ctx.quadraticCurveTo(x + seg / 2, yy - amp * 0.8, x + seg, yy); }
        }
        ctx.stroke();
      }
      // sun glitter on the water
      ctx.fillStyle = '#FFF4D6';
      for (const s of this.glints) {
        const a = Math.max(0, Math.sin(t * 5 + s.p * 7)); if (a < 0.15) continue;
        const y = HZ + 2 + s.v * 330, spread = 30 + s.v * 330, x = SUN[0] + (s.u - 0.5) * spread * (1 + Math.sin(s.p) * 0.2);
        ctx.globalAlpha = a * (0.9 - s.v * 0.4); ctx.fillRect(x, y, (4 + s.v * 26) * s.w, 1 + s.v * 2.2);
      }
      ctx.globalAlpha = 1;
      // boats
      for (const b of this.boats) {
        const bob = Math.sin(t * 1.4 + b.x) * 2.5 * b.s, rk = Math.sin(t * 1.1 + b.x) * 0.06, x = b.x + Math.sin(t * 0.1 + b.x) * 20, y = b.y + bob, s = b.s * 26;
        ctx.save(); ctx.translate(x, y); ctx.rotate(rk);
        ctx.fillStyle = b.c; ctx.beginPath(); ctx.moveTo(-s, -s * 0.3); ctx.quadraticCurveTo(0, -s * 0.15, s * 1.1, -s * 0.45); ctx.quadraticCurveTo(s * 0.7, s * 0.3, 0, s * 0.3); ctx.quadraticCurveTo(-s * 0.7, s * 0.3, -s, -s * 0.3); ctx.fill();
        ctx.fillStyle = 'rgba(40,40,70,.35)'; ctx.fillRect(-s * 0.9, -s * 0.15, s * 1.9, s * 0.08);
        ctx.fillStyle = '#4A3A4A'; ctx.fillRect(-s * 0.05, -s * 1.4, s * 0.07, s * 1.1);
        ctx.fillStyle = 'rgba(255,248,236,.9)'; ctx.beginPath(); ctx.moveTo(s * 0.04, -s * 1.35); ctx.quadraticCurveTo(s * 0.7, -s * 0.9, s * 0.6, -s * 0.45); ctx.lineTo(s * 0.04, -s * 0.45); ctx.fill();
        ctx.restore();
        ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.ellipse(x, y + s * 0.32, s * 1.2, s * 0.12, 0, 0, 7); ctx.stroke();
      }
    }
    promenade(ctx, t, wind) {
      const [c0, c1] = WALL.cap, [b0, b1] = WALL.base;
      // floor
      ctx.save();
      const floor = new Path2D(); floor.moveTo(b0[0], b0[1]); floor.lineTo(b1[0], b1[1]); floor.lineTo(2400, 520); floor.lineTo(2400, 1300); floor.lineTo(-400, 1300); floor.closePath();
      const fg = ctx.createLinearGradient(0, 490, 0, 1000); fg.addColorStop(0, '#F3D9C6'); fg.addColorStop(0.5, '#E8C3B2'); fg.addColorStop(1, '#D9AFA6');
      ctx.fillStyle = fg; ctx.fill(floor);
      ctx.clip(floor);
      const lg = ctx.createRadialGradient(SUN[0] + 200, 600, 0, SUN[0] + 200, 600, 900); lg.addColorStop(0, 'rgba(255,226,180,.35)'); lg.addColorStop(1, 'rgba(255,226,180,0)'); ctx.fillStyle = lg; ctx.fillRect(-400, 480, 2800, 800);
      ctx.strokeStyle = 'rgba(150,100,120,.08)'; ctx.lineWidth = 1.2;
      for (let x = -2400; x < 4400; x += 260) { ctx.beginPath(); ctx.moveTo(VP[0], VP[1]); ctx.lineTo(x, 1300); ctx.stroke(); }
      for (let k = 1; k < 14; k++) { const y = VP[1] + 812 / (1 + 22 / (k * k * 0.18 + 0.5)) * 0.62; ctx.lineWidth = 0.5 + (y - 490) / 300; ctx.beginPath(); ctx.moveTo(-400, y); ctx.lineTo(2400, y); ctx.stroke(); }
      // long shadows of the tree and the wall falling towards the viewer
      ctx.fillStyle = 'rgba(120,70,130,.16)';
      ctx.beginPath(); ctx.moveTo(1180, 940); ctx.quadraticCurveTo(1500, 980, 1900, 1100); ctx.lineTo(1900, 1300); ctx.lineTo(1150, 1300); ctx.closePath(); ctx.fill();
      for (const p of this.petals) { ctx.fillStyle = p.c; ctx.beginPath(); ctx.ellipse(p.x, p.y, 4, 2.2, p.a, 0, 7); ctx.fill(); }
      ctx.restore();
      // the sea wall: face, then the cap
      const face = new Path2D(); face.moveTo(c0[0], c0[1]); face.lineTo(c1[0], c1[1]); face.lineTo(b1[0], b1[1]); face.lineTo(b0[0], b0[1]); face.closePath();
      const wg = ctx.createLinearGradient(-260, 0, 740, 0); wg.addColorStop(0, '#C99A98'); wg.addColorStop(1, '#E7C3B4');
      ctx.fillStyle = wg; ctx.fill(face);
      ctx.save(); ctx.clip(face); ctx.strokeStyle = 'rgba(120,70,90,.22)'; ctx.lineWidth = 1.4;
      for (let i = 0; i < 26; i++) { const u = Math.pow(i / 26, 1.7), x = -260 + u * 1000; ctx.beginPath(); ctx.moveTo(x, lineY(WALL.cap, x)); ctx.lineTo(x, lineY(WALL.base, x)); ctx.stroke(); }
      ctx.beginPath(); for (let x = -260; x < 740; x += 8) { const y = (lineY(WALL.cap, x) + lineY(WALL.base, x)) / 2; x === -260 ? ctx.moveTo(x, y) : ctx.lineTo(x, y); } ctx.stroke();
      const sh = ctx.createLinearGradient(0, 500, 0, 940); sh.addColorStop(0, 'rgba(110,60,110,0)'); sh.addColorStop(1, 'rgba(110,60,110,.22)'); ctx.fillStyle = sh; ctx.fillRect(-300, 480, 1100, 500);
      ctx.restore();
      const cap = new Path2D(); cap.moveTo(c0[0], c0[1] - 26); cap.lineTo(c1[0], c1[1] - 3); cap.lineTo(c1[0], c1[1]); cap.lineTo(c0[0], c0[1]); cap.closePath();
      ctx.fillStyle = '#F6DCCB'; ctx.fill(cap); ctx.strokeStyle = 'rgba(255,240,220,.8)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(c0[0], c0[1] - 26); ctx.lineTo(c1[0], c1[1] - 3); ctx.stroke();
      // lamp posts along the wall
      for (const x of [90, 430, 640]) {
        const yb = lineY(WALL.cap, x), s = F.depth(lineY(WALL.base, x)) / 4.5;
        ctx.fillStyle = '#3E3247'; ctx.fillRect(x - 3 * s, yb - 210 * s, 6 * s, 210 * s);
        ctx.beginPath(); ctx.arc(x, yb - 214 * s, 10 * s, 0, 7); ctx.fill();
        const lg2 = ctx.createRadialGradient(x, yb - 214 * s, 0, x, yb - 214 * s, 40 * s); lg2.addColorStop(0, 'rgba(255,230,170,.9)'); lg2.addColorStop(1, 'rgba(255,230,170,0)');
        ctx.fillStyle = lg2; ctx.beginPath(); ctx.arc(x, yb - 214 * s, 40 * s, 0, 7); ctx.fill();
      }
      this.stringLights(ctx, t);
      // promenade life, far to near: walkers, balloon seller, tea cart
      const items = [];
      for (const w of this.walkers) { const d = ((w.d + t * w.v) % 1 + 1) % 1, y = 500 + Math.pow(d, 1.8) * 175, x = VP[0] + (y - VP[1]) * (0.7 + w.lane * 2.6); items.push({ y, f: () => this.walker(ctx, x, y, w, t) }); }
      items.push({ y: 655, f: () => this.balloonSeller(ctx, 1010, 655, t, wind) });
      items.push({ y: 690, f: () => this.teaCart(ctx, 1545, 690, t) });
      items.sort((a, b) => a.y - b.y).forEach(i => i.f());
    }
    stringLights(ctx, t) {
      const strands = [[[1170, 300], [760, 372], [0.18]], [[760, 372], [420, 340], [0.12]], [[420, 340], [60, 392], [0.12]]];
      for (const [a, b, [sag]] of strands) {
        const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2 + Math.abs(b[0] - a[0]) * sag;
        ctx.strokeStyle = 'rgba(70,50,70,.55)'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.quadraticCurveTo(mx, my, b[0], b[1]); ctx.stroke();
        for (let i = 1; i < 14; i++) {
          const u = i / 14, x = (1 - u) * (1 - u) * a[0] + 2 * (1 - u) * u * mx + u * u * b[0], y = (1 - u) * (1 - u) * a[1] + 2 * (1 - u) * u * my + u * u * b[1] + 5;
          const fl = 0.75 + 0.25 * Math.sin(t * 3 + i * 1.7), c = ['255,214,120', '255,170,190', '200,230,255'][i % 3];
          const g = ctx.createRadialGradient(x, y, 0, x, y, 16); g.addColorStop(0, `rgba(${c},${0.9 * fl})`); g.addColorStop(1, `rgba(${c},0)`);
          ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, 16, 0, 7); ctx.fill();
          ctx.fillStyle = `rgba(255,250,235,${fl})`; ctx.beginPath(); ctx.arc(x, y, 2.6, 0, 7); ctx.fill();
        }
      }
    }
    walker(ctx, x, y, w, t) {
      // small, soft background people (kurta / saree / shirt shapes), hazed towards the sky colour
      const s = F.depth(y) * (w.kid ? 0.62 : 0.95), sw = Math.sin(t * 4.6 + w.p), bob = Math.abs(sw) * 0.8 * s, haze = F.clamp((690 - y) / 260, 0, 0.55);
      const col = c => F.mix(c, '#F6C9C0', haze);
      ctx.save(); ctx.translate(x, y);
      ctx.fillStyle = 'rgba(110,60,110,.16)'; ctx.beginPath(); ctx.ellipse(0, 0, 7 * s, 1.5 * s, 0, 0, 7); ctx.fill();
      ctx.fillStyle = col(w.c2); ctx.lineCap = 'round'; ctx.strokeStyle = col(w.c2); ctx.lineWidth = 4.2 * s;
      for (const k of [-1, 1]) { ctx.beginPath(); ctx.moveTo(k * 2 * s, -44 * s); ctx.lineTo(k * 2 * s + sw * k * 7 * s, -2 * s); ctx.stroke(); }
      ctx.translate(0, -bob);
      ctx.fillStyle = col(w.c); ctx.beginPath();
      ctx.moveTo(-5.6 * s, -79 * s); ctx.quadraticCurveTo(-8 * s, -60 * s, -7.4 * s, w.kid ? -40 * s : -36 * s); ctx.lineTo(7.4 * s, w.kid ? -40 * s : -36 * s); ctx.quadraticCurveTo(8 * s, -60 * s, 5.6 * s, -79 * s); ctx.closePath(); ctx.fill();
      ctx.fillStyle = 'rgba(255,230,190,.35)'; ctx.fillRect(-5.6 * s, -79 * s, 2.2 * s, 40 * s);
      ctx.strokeStyle = col(w.c); ctx.lineWidth = 3.2 * s;
      for (const k of [-1, 1]) { ctx.beginPath(); ctx.moveTo(k * 6 * s, -76 * s); ctx.lineTo(k * 7 * s - sw * k * 4 * s, -54 * s); ctx.stroke(); }
      ctx.fillStyle = col('#9C5E3E'); ctx.beginPath(); ctx.ellipse(0, -86 * s, 4.6 * s, 5.4 * s, 0, 0, 7); ctx.fill();
      ctx.fillStyle = col('#1B1418'); ctx.beginPath(); ctx.ellipse(0, -89 * s, 5 * s, 3.8 * s, 0, Math.PI, 0); ctx.fill();
      if (w.lane > 0.6 && !w.kid) { ctx.beginPath(); ctx.ellipse(-3.6 * s, -80 * s, 2.2 * s, 7 * s, 0.2, 0, 7); ctx.fill(); } // long hair
      ctx.restore();
    }
    balloonSeller(ctx, x, y, t, wind) {
      const s = F.depth(y);
      ctx.save(); ctx.translate(x, y);
      ctx.fillStyle = 'rgba(110,60,110,.2)'; ctx.beginPath(); ctx.ellipse(0, 0, 8 * s, 2 * s, 0, 0, 7); ctx.fill();
      ctx.fillStyle = '#3E4A6A'; ctx.fillRect(-4 * s, -46 * s, 3.4 * s, 46 * s); ctx.fillRect(0.6 * s, -46 * s, 3.4 * s, 46 * s);
      ctx.fillStyle = '#F2B33D'; ctx.beginPath(); ctx.roundRect(-6 * s, -80 * s, 12 * s, 36 * s, 4 * s); ctx.fill();
      ctx.fillStyle = '#8A5A3E'; ctx.beginPath(); ctx.arc(0, -87 * s, 5.4 * s, 0, 7); ctx.fill();
      ctx.fillStyle = '#F4F1EA'; ctx.beginPath(); ctx.ellipse(0, -91 * s, 6.4 * s, 2.4 * s, 0, 0, 7); ctx.fill();
      const hand = [5 * s, -74 * s], cols = ['#E2447C', '#3FA0D8', '#F2B33D', '#7CC47A', '#9B7BD6', '#F28B3C', '#FF86B5', '#44C2C9', '#FFD25A', '#E2447C', '#7C5CD6', '#3FA0D8'];
      for (let i = 0; i < cols.length; i++) {
        const a = -Math.PI / 2 + (i - cols.length / 2) * 0.16 + wind * 0.12, d = (34 + (i % 3) * 9) * s, bx = hand[0] + Math.cos(a) * d + Math.sin(t * 1.3 + i) * 1.5 * s, by = hand[1] + Math.sin(a) * d - 12 * s + Math.sin(t * 1.7 + i * 2) * 1.6 * s;
        ctx.strokeStyle = 'rgba(255,255,255,.6)'; ctx.lineWidth = 0.6; ctx.beginPath(); ctx.moveTo(hand[0], hand[1]); ctx.lineTo(bx, by + 5 * s); ctx.stroke();
        const g = ctx.createRadialGradient(bx - 1.6 * s, by - 2 * s, 0.5, bx, by, 6 * s); g.addColorStop(0, F.shade(cols[i], 0.55)); g.addColorStop(0.5, cols[i]); g.addColorStop(1, F.shade(cols[i], -0.25));
        ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(bx, by, 4.6 * s, 5.6 * s, 0, 0, 7); ctx.fill();
      }
      ctx.restore();
    }
    teaCart(ctx, x, y, t) {
      const s = F.depth(y) * 1.05;
      ctx.save(); ctx.translate(x, y);
      ctx.fillStyle = 'rgba(110,60,110,.22)'; ctx.beginPath(); ctx.ellipse(0, 0, 30 * s, 4 * s, 0, 0, 7); ctx.fill();
      for (const wx of [-17, 17]) { ctx.strokeStyle = '#4A3443'; ctx.lineWidth = 1.6 * s; ctx.beginPath(); ctx.arc(wx * s, -6 * s, 6 * s, 0, 7); ctx.stroke(); }
      ctx.fillStyle = '#3FA0D8'; ctx.beginPath(); ctx.roundRect(-26 * s, -34 * s, 52 * s, 24 * s, 2 * s); ctx.fill();
      ctx.fillStyle = '#F2B33D'; ctx.fillRect(-26 * s, -34 * s, 52 * s, 4 * s);
      ctx.fillStyle = '#8A5A3E'; ctx.fillRect(-24 * s, -66 * s, 2.4 * s, 32 * s); ctx.fillRect(21.6 * s, -66 * s, 2.4 * s, 32 * s);
      for (let i = 0; i < 6; i++) { ctx.fillStyle = i % 2 ? '#FFFFFF' : '#E2447C'; ctx.beginPath(); ctx.moveTo(-30 * s + i * 10 * s, -66 * s); ctx.lineTo(-20 * s + i * 10 * s, -66 * s); ctx.lineTo(-18 * s + i * 10 * s, -58 * s); ctx.quadraticCurveTo(-23 * s + i * 10 * s, -55 * s, -28 * s + i * 10 * s, -58 * s); ctx.closePath(); ctx.fill(); }
      ctx.fillStyle = '#C0C4CC'; ctx.beginPath(); ctx.roundRect(-14 * s, -46 * s, 9 * s, 12 * s, 2 * s); ctx.fill();
      for (let i = 0; i < 3; i++) { ctx.fillStyle = 'rgba(255,240,220,.85)'; ctx.fillRect(2 * s + i * 6 * s, -40 * s, 4 * s, 6 * s); }
      // steam
      ctx.strokeStyle = 'rgba(255,255,255,.45)'; ctx.lineWidth = 1.8 * s;
      for (let i = 0; i < 3; i++) { const ph = (t * 0.6 + i / 3) % 1; ctx.globalAlpha = 1 - ph; ctx.beginPath(); ctx.moveTo(-9.5 * s, -47 * s - ph * 30 * s); ctx.bezierCurveTo(-5 * s, -52 * s - ph * 30 * s, -14 * s, -58 * s - ph * 30 * s, -9 * s, -64 * s - ph * 30 * s); ctx.stroke(); }
      ctx.globalAlpha = 1; ctx.restore();
    }
    tree(ctx, t, wind) {
      // trunk and branches of the bougainvillea
      const sway = Math.sin(t * 0.8) * 4 + wind * 3;
      ctx.fillStyle = '#6B4A4E';
      const tr = new Path2D(`M1168 990 C1182 870 1196 760 1192 640 C1188 540 1174 440 1148 342 C1118 300 1076 270 1034 250 L1046 226 C1096 244 1156 278 1204 314 C1238 288 1298 260 1380 244 L1388 266 C1320 290 1272 322 1252 354 C1264 440 1274 560 1278 660 C1282 780 1292 880 1306 990 Z`);
      const g = ctx.createLinearGradient(1160, 0, 1300, 0); g.addColorStop(0, '#A8786C'); g.addColorStop(0.45, '#6B4A4E'); g.addColorStop(1, '#4A3240');
      ctx.fillStyle = g; ctx.fill(tr);
      ctx.strokeStyle = 'rgba(255,214,170,.5)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(1172, 985); ctx.bezierCurveTo(1186, 870, 1200, 760, 1196, 640); ctx.bezierCurveTo(1192, 540, 1178, 440, 1152, 344); ctx.stroke();
      ctx.strokeStyle = 'rgba(60,30,50,.35)'; ctx.lineWidth = 1.6; for (const [y0, y1, x] of [[900, 760, 1240], [700, 560, 1226], [520, 400, 1210]]) { ctx.beginPath(); ctx.moveTo(x, y0); ctx.quadraticCurveTo(x + 8, (y0 + y1) / 2, x - 2, y1); ctx.stroke(); }
      ctx.strokeStyle = '#5A3E46'; ctx.lineWidth = 10; ctx.beginPath(); ctx.moveTo(1040, 238); ctx.quadraticCurveTo(960 + sway, 200, 880 + sway, 190); ctx.stroke();
      ctx.lineWidth = 8; ctx.beginPath(); ctx.moveTo(1384, 255); ctx.quadraticCurveTo(1500 + sway, 220, 1640 + sway, 200); ctx.stroke();
      // canopy: leaves, then the magenta flower clusters, all swaying
      for (const l of this.leaves) {
        const x = l.x + sway * (1 - l.y / 400) + Math.sin(t * 1.4 + l.p) * 2, y = l.y + Math.cos(t * 1.1 + l.p) * 1.5;
        const gg = ctx.createRadialGradient(x - l.r * 0.3, y - l.r * 0.4, 1, x, y, l.r); gg.addColorStop(0, F.shade(l.c, 0.35)); gg.addColorStop(1, l.c);
        ctx.fillStyle = gg; ctx.beginPath(); ctx.ellipse(x, y, l.r, l.r * 0.7, l.p, 0, 7); ctx.fill();
      }
      for (const f of this.flowers) {
        const x = f.x + sway * (1 - f.y / 400) * 1.2 + Math.sin(t * 1.6 + f.p) * 2.4, y = f.y + Math.cos(t * 1.2 + f.p) * 2;
        const gg = ctx.createRadialGradient(x - f.r * 0.3, y - f.r * 0.3, 1, x, y, f.r); gg.addColorStop(0, F.shade(f.c, 0.45)); gg.addColorStop(0.7, f.c); gg.addColorStop(1, F.shade(f.c, -0.2));
        ctx.fillStyle = gg; ctx.beginPath();
        for (let k = 0; k < 5; k++) { const a = k * 1.26 + f.p, px = x + Math.cos(a) * f.r * 0.45, py = y + Math.sin(a) * f.r * 0.4; ctx.moveTo(px + f.r * 0.5, py); ctx.arc(px, py, f.r * 0.5, 0, 7); }
        ctx.fill();
      }
      // sun catching the canopy edge
      ctx.save(); ctx.globalCompositeOperation = 'screen'; const sg = ctx.createRadialGradient(950, 260, 0, 950, 260, 260); sg.addColorStop(0, 'rgba(255,214,160,.35)'); sg.addColorStop(1, 'rgba(255,214,160,0)'); ctx.fillStyle = sg; ctx.fillRect(690, 0, 520, 520); ctx.restore();
    }
    particles(ctx, t, wind) {
      ctx.save(); ctx.globalCompositeOperation = 'screen';
      for (const m of this.motes) {
        const x = ((m.x + wind * t * m.v * 2 + Math.sin(t * 0.5 + m.p) * 20) % 1900 + 1900) % 1900 - 150, y = (m.y - t * m.v + 1100) % 1100 - 50, a = 0.35 + 0.35 * Math.sin(t * 2 + m.p);
        const g = ctx.createRadialGradient(x, y, 0, x, y, m.s * 3); g.addColorStop(0, `rgba(255,236,190,${a})`); g.addColorStop(1, 'rgba(255,236,190,0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, m.s * 3, 0, 7); ctx.fill();
      }
      ctx.restore();
      for (const p of this.drift) {
        const x = ((p.x + wind * t * p.v) % 1900 + 1900) % 1900 - 150, y = (p.y + t * p.v * 0.35 + Math.sin(t + p.a) * 30) % 1000, a = p.a + t * 2;
        ctx.fillStyle = p.c; ctx.beginPath(); ctx.ellipse(x, y, 5 * p.s, 2.6 * p.s * Math.abs(Math.cos(a)) + 0.6, a * 0.5, 0, 7); ctx.fill();
      }
    }
    foreground(ctx, t) {
      if (!this.fg) { // blurred leaves framing the shot, rendered once
        const c = document.createElement('canvas'); c.width = 1800; c.height = 1100; const x = c.getContext('2d'); const r = F.rng(21);
        x.filter = 'blur(10px)';
        for (let i = 0; i < 26; i++) { const left = i < 14, px = left ? -60 + r() * 260 : 1560 + r() * 260, py = left ? -60 + r() * 240 : 820 + r() * 300, rr = 50 + r() * 70;
          x.fillStyle = r() > 0.75 ? '#C9306A' : (r() > 0.5 ? '#2A5E44' : '#1F4A36'); x.globalAlpha = 0.9; x.beginPath(); x.ellipse(px, py, rr, rr * 0.5, r() * 3, 0, 7); x.fill(); }
        this.fg = c;
      }
      const sw = Math.sin(t * 0.9) * 8;
      ctx.drawImage(this.fg, -100 + sw, -50);
    }
  };
})();

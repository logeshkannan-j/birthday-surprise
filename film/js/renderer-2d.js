// Canvas2D fallback (no WebGL2): same frame description, simplified – painted layers with parallax strips,
// gradient sky and sea with glitter, characters, glowing sprites (pre-tinted), vignette and fades. No shaders.
import { HZ, FH } from './space.js';

const SKY = [[[255, 226, 176], [255, 190, 148], [250, 163, 194], [158, 179, 245]], [[255, 194, 120], [255, 153, 135], [224, 133, 184], [133, 128, 214]], [[250, 163, 135], [199, 133, 184], [102, 99, 184], [38, 43, 107]], [[179, 110, 140], [102, 74, 138], [48, 46, 107], [19, 24, 66]], [[43, 41, 87], [28, 28, 71], [17, 20, 60], [11, 16, 48]]];
const mixA = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
const stop = (k, tod) => { const t = Math.max(0, Math.min(2, tod)) * 2, i = Math.min(3, Math.floor(t)); return mixA(SKY[i][k], SKY[i + 1][k], t - i); };
const css = (c, a = 1) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;

export class Renderer2D {
  constructor(canvas) { this.canvas = canvas; this.ctx = canvas.getContext('2d'); this.ok = !!this.ctx; this.glows = {}; }
  init(q) { this.q = q; for (const [k, c] of Object.entries({ gold: [255, 214, 140], white: [255, 250, 235], pink: [255, 170, 210], teal: [120, 255, 220], warm: [255, 170, 90] })) { const g = document.createElement('canvas'); g.width = g.height = 64; const x = g.getContext('2d'), r = x.createRadialGradient(32, 32, 0, 32, 32, 32); r.addColorStop(0, css(c, 1)); r.addColorStop(0.25, css(c, 0.5)); r.addColorStop(1, css(c, 0)); x.fillStyle = r; x.fillRect(0, 0, 64, 64); this.glows[k] = g; } return this; }
  setWorld(layers, atlas) { this.layers = layers; this.atlas = atlas.canvas; }
  resize(W, H, pr) { const w = Math.round(W * pr), h = Math.round(H * pr); if (this.canvas.width !== w || this.canvas.height !== h) { this.canvas.width = w; this.canvas.height = h; } }
  xf(F, gy) { const v = F.view, f = v.pf(gy), z = v.zf(f), s = v.S * z * F.pr, c = v.cam; return [s, (F.W / 2 - (800 + (c.x - 800) * f) * v.S * z) * F.pr, (F.H / 2 - (500 + (c.y - 500) * f) * v.S * z) * F.pr]; }
  drawLayer(F, L, alpha = 1) {
    const x = this.ctx, [x0, y0, x1, y1] = L.rect, cw = L.c.width, ch = L.c.height; x.filter = this.dim;
    if (L.kind === 'ground') { // horizontal strips, each with its own parallax
      const n = 14;
      for (let i = 0; i < n; i++) { // strips overlap generously so neighbouring parallax bands never leave gaps
        const ya = y0 + (y1 - y0) * i / n, h = (y1 - y0) / n, gy = L.gyFn((x0 + x1) / 2, ya + h / 2), [s, tx, ty] = this.xf(F, gy), ov = i ? 0.35 : 0;
        x.setTransform(s, 0, 0, s, tx, ty); x.globalAlpha = alpha; x.drawImage(L.c, 0, ch * (i / n - ov / n), cw, ch * (1 + ov + 0.35) / n, x0, ya - h * ov, x1 - x0, h * (1 + ov + 0.35)); }
    } else { const [s, tx, ty] = this.xf(F, L.gy); x.setTransform(s, 0, 0, s, tx, ty); x.globalAlpha = alpha; x.drawImage(L.c, x0, y0, x1 - x0, y1 - y0); x.filter = 'none'; if (L.em && F.emK > 0.05) { x.globalCompositeOperation = 'lighter'; x.globalAlpha = F.emK; x.drawImage(L.em, x0, y0, x1 - x0, y1 - y0); x.globalCompositeOperation = 'source-over'; } }
    x.globalAlpha = 1; x.filter = 'none';
  }
  sprites(F, list, add) {
    if (!list || !list.n) return; const x = this.ctx, d = list.data, v = F.view, a = this.atlas, pt = [0, 0];
    x.setTransform(1, 0, 0, 1, 0, 0); x.globalCompositeOperation = add ? 'lighter' : 'source-over';
    for (let i = 0; i < list.n; i++) {
      const o = i * 16, al = d[o + 11]; if (al < 0.01) continue;
      v.toScreen(d[o], d[o + 1], d[o + 2], pt); const sc = v.scaleAt(d[o + 2]) * F.pr, w = Math.abs(d[o + 4]) * sc, h = d[o + 5] * sc, px = pt[0] * F.pr, py = pt[1] * F.pr;
      if (px < -200 || py < -200 || px > this.canvas.width + 200 || py > this.canvas.height + 200) continue;
      x.globalAlpha = Math.min(1, al);
      if (d[o + 14] < 0) { const r = d[o + 8], g = d[o + 9], b = d[o + 10], k = b > 0.8 && g > 0.9 ? 'teal' : r > 0.9 && b > 0.7 ? 'pink' : g > 0.9 && b > 0.8 ? 'white' : g < 0.6 ? 'warm' : 'gold'; const sz = Math.max(w, 2) * 2.2 + Math.hypot(d[o + 6], d[o + 7]) * sc; x.drawImage(this.glows[k], px - sz / 2, py - sz / 2, sz, sz); }
      else { x.save(); x.translate(px, py); x.rotate(d[o + 3]); x.drawImage(a, d[o + 12] * a.width, d[o + 13] * a.height, d[o + 14] * a.width, d[o + 15] * a.height, -w / 2, -h / 2, w, h); x.restore(); }
    }
    x.globalAlpha = 1; x.globalCompositeOperation = 'source-over';
  }
  render(F) {
    this.resize(F.W, F.H, F.pr); const x = this.ctx, W = this.canvas.width, H = this.canvas.height, v = F.view, pr = F.pr, nk = Math.min(1, Math.max(0, (F.tod - 1.1) / 0.6));
    this.dim = nk > 0.01 ? `brightness(${(1 - nk * 0.42).toFixed(3)}) saturate(${(1 - nk * 0.2).toFixed(3)})` : 'none';
    const hz = v.toScreen(800, HZ, HZ + 0.5)[1] * pr, top = v.toScreen(800, HZ - 520, HZ + 0.5)[1] * pr;
    x.setTransform(1, 0, 0, 1, 0, 0);
    if (F.clip) { const v = F.clip.el, A = W / H, B = (v.videoWidth || 16) / (v.videoHeight || 9), z = F.clip.zoom || 1; let w = W, h = H; if (B > A) w = H * B; else h = W / B; w *= z; h *= z; x.drawImage(v, (W - w) / 2, (H - h) / 2, w, h); this.sprites(F, F.lists.emis, true); for (const it of F.draw) if (it.type === 'sprites' && it.overlay) this.sprites(F, it.list, it.add); return this.post2d(F); }
    const g = x.createLinearGradient(0, top, 0, hz); g.addColorStop(0, css(stop(3, F.tod))); g.addColorStop(0.55, css(stop(2, F.tod))); g.addColorStop(0.88, css(stop(1, F.tod))); g.addColorStop(1, css(stop(0, F.tod)));
    x.fillStyle = g; x.fillRect(0, 0, W, Math.max(hz, 1));
    const sp = v.toScreen(F.sun[0], F.sun[1], HZ + 0.5);
    if (F.sunVis > 0.01) { const r = x.createRadialGradient(sp[0] * pr, sp[1] * pr, 0, sp[0] * pr, sp[1] * pr, 300 * pr); r.addColorStop(0, `rgba(255,246,220,${0.9 * F.sunVis})`); r.addColorStop(0.15, `rgba(255,220,170,${0.5 * F.sunVis})`); r.addColorStop(1, 'rgba(255,200,160,0)'); x.fillStyle = r; x.fillRect(0, 0, W, hz); }
    if (F.moon && F.moon[2] > 0.01) { const m = v.toScreen(F.moon[0], F.moon[1], HZ + 0.5), r = 14 * v.scaleAt(HZ + 0.5) * pr, g2 = x.createRadialGradient(m[0] * pr, m[1] * pr, r * 0.8, m[0] * pr, m[1] * pr, r * 6); g2.addColorStop(0, 'rgba(190,200,255,.35)'); g2.addColorStop(1, 'rgba(190,200,255,0)'); x.fillStyle = g2; x.fillRect(0, 0, W, hz); x.fillStyle = '#FFF6E2'; x.beginPath(); x.arc(m[0] * pr, m[1] * pr, r, 0, 7); x.fill(); }
    this.sprites(F, F.lists.emis, true);
    for (const it of F.before) this.drawLayer(F, it.layer);
    const sg = x.createLinearGradient(0, hz, 0, H); const t = Math.min(F.tod, 1); sg.addColorStop(0, css(stop(0, F.tod))); sg.addColorStop(0.1, css(mixA([63, 184, 194], [40, 70, 120], t))); sg.addColorStop(1, css(mixA([20, 110, 140], [10, 20, 50], Math.min(1, F.tod / 1.6))));
    x.setTransform(1, 0, 0, 1, 0, 0); x.fillStyle = sg; x.fillRect(0, hz, W, H - hz);
    if (F.sunVis > 0.01) { x.fillStyle = `rgba(255,240,200,${0.5 * F.sunVis})`; for (let i = 0; i < 70; i++) { const yy = hz + Math.pow(i / 70, 1.5) * (H - hz) * 0.6, ww = (6 + i * 0.9) * pr; if (Math.sin(F.simT * 4 + i * 7.1) > 0) x.fillRect(sp[0] * pr + Math.sin(i * 12.9) * (10 + i * 2) * pr - ww / 2, yy, ww, 1.5 * pr); } }
    for (const it of F.draw) {
      if (it.type === 'layer') this.drawLayer(F, it.layer);
      else if (it.type === 'char' && it.canvas) { const c = it.corners; x.setTransform(1, 0, 0, 1, 0, 0); x.globalAlpha = it.alpha ?? 1; x.filter = it.id === 'snow' ? 'none' : this.dim; x.drawImage(it.canvas, c[0][0] * pr, c[0][1] * pr, (c[1][0] - c[0][0]) * pr, (c[2][1] - c[0][1]) * pr); x.filter = 'none'; x.globalAlpha = 1; }
      else if (it.type === 'sprites') this.sprites(F, it.list, it.add);
    }
    this.post2d(F);
  }
  post2d(F) {
    const x = this.ctx, W = this.canvas.width, H = this.canvas.height, P = F.post; x.setTransform(1, 0, 0, 1, 0, 0);
    const vg = x.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.75); vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, `rgba(20,8,30,${0.5 * P.vig})`); x.fillStyle = vg; x.fillRect(0, 0, W, H);
    if (P.fade > 0.003) { x.fillStyle = css(P.fadeC.map(v => Math.round(v * 255)), P.fade); x.fillRect(0, 0, W, H); }
    if (P.letter > 0) { x.fillStyle = '#000'; x.fillRect(0, 0, W, P.letter * H); x.fillRect(0, H - P.letter * H, W, P.letter * H); }
  }
}

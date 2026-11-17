// WebGL2 renderer: multiplane composite (sky, sea, painted layers, lit characters with shadows, sprites) and the
// post chain (bloom + halation, god rays, anamorphic flare, lens dirt, chroma, motion blur, grade, grain, letterbox).
import { createGL, program, texture, target, mesh } from './gl.js';
import * as SH from './shaders.js';

export class GLRenderer {
  constructor(canvas) { this.canvas = canvas; this.gl = createGL(canvas); this.ok = !!this.gl; this.charTex = new Map(); }
  init(q) {
    const gl = this.gl; this.q = q;
    const P = (vs, fs, n) => program(gl, vs, fs, n);
    this.p = {
      sky: P(SH.VS_FULL, SH.FS_SKY, 'sky'), sea: P(SH.VS_FULL, SH.FS_SEA, 'sea'), layer: P(SH.VS_LAYER, SH.FS_LAYER, 'layer'), char: P(SH.VS_QUAD, SH.FS_CHAR, 'char'),
      sprite: P(SH.VS_SPRITE, SH.FS_SPRITE, 'sprite'), copy: P(SH.VS_FULL, SH.FS_COPY, 'copy'), bright: P(SH.VS_FULL, SH.FS_BRIGHT, 'bright'), blur: P(SH.VS_FULL, SH.FS_BLUR, 'blur'),
      rays: P(SH.VS_FULL, SH.FS_RAYS, 'rays'), final: P(SH.VS_FULL, SH.FS_FINAL, 'final'), kuwa: P(SH.VS_FULL, SH.FS_KUWAHARA, 'kuwahara'), cover: P(SH.VS_FULL, SH.FS_COVER, 'cover')
    };
    // instanced sprite buffer
    this.maxSprites = q.sprites;
    this.spVao = gl.createVertexArray(); this.spBuf = gl.createBuffer();
    gl.bindVertexArray(this.spVao); gl.bindBuffer(gl.ARRAY_BUFFER, this.spBuf); gl.bufferData(gl.ARRAY_BUFFER, this.maxSprites * 64, gl.DYNAMIC_DRAW);
    for (let i = 0; i < 4; i++) { gl.enableVertexAttribArray(i); gl.vertexAttribPointer(i, 4, gl.FLOAT, false, 64, i * 16); gl.vertexAttribDivisor(i, 1); }
    gl.bindVertexArray(null);
    return this;
  }
  // upload the painted world (Kuwahara-softened on medium/high) and the sprite atlas
  setWorld(layers, atlas) {
    const gl = this.gl;
    this.atlas = texture(gl, atlas.canvas, { mip: true });
    for (const L of layers) {
      let tex;
      if (this.q.kuwahara) {
        const src = texture(gl, L.c, { mip: false }), tg = target(gl, L.c.width, L.c.height, { mip: false });
        tg.bind(); gl.disable(gl.BLEND); this.p.kuwa.use().tex('uTex', src).f('uTexel', 1 / L.c.width, 1 / L.c.height);
        gl.bindVertexArray(gl.vao); gl.drawArrays(gl.TRIANGLES, 0, 3);
        gl.deleteTexture(src.tex); gl.deleteFramebuffer(tg.fb);
        tex = { tex: tg.tex, w: L.c.width, h: L.c.height };
      } else tex = texture(gl, L.c, { mip: false });
      L.gl = { tex, texB: texture(gl, L.blur), em: L.em ? texture(gl, L.em) : null, emB: L.em ? texture(gl, L.emBlur) : null, mesh: this.layerMesh(L) };
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }
  layerMesh(L) {
    const [x0, y0, x1, y1] = L.rect, [nx, ny] = L.kind === 'ground' ? L.grid : [1, 1], v = [], idx = [];
    for (let j = 0; j <= ny; j++) for (let i = 0; i <= nx; i++) { const x = x0 + (x1 - x0) * i / nx, y = y0 + (y1 - y0) * j / ny; v.push(x, y, L.kind === 'ground' ? L.gyFn(x, y) : L.gy); }
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) { const a = j * (nx + 1) + i, b = a + 1, c = a + nx + 1, d = c + 1; idx.push(a, b, c, b, d, c); }
    return mesh(this.gl, v, idx);
  }
  resize(W, H, pr) {
    const gl = this.gl, w = Math.max(1, Math.round(W * pr)), h = Math.max(1, Math.round(H * pr));
    if (this.w === w && this.h === h) return; this.w = w; this.h = h; this.canvas.width = w; this.canvas.height = h;
    for (const k of ['scene', 'emis', 'b1', 'b1b', 'b2', 'b2b', 'b3', 'b3b', 'rays', 'flare', 'flareb']) if (this[k]) this[k].dispose();
    const hdr = true, d = this.q.postDiv;
    this.scene = target(gl, w, h, { hdr }); this.emis = target(gl, w, h, { hdr });
    const t = (k, s) => target(gl, Math.max(1, Math.ceil(w / s)), Math.max(1, Math.ceil(h / s)), { hdr });
    this.b1 = t('b1', 2 * d); this.b1b = t('b1b', 2 * d); this.b2 = t('b2', 4 * d); this.b2b = t('b2b', 4 * d); this.b3 = t('b3', 8 * d); this.b3b = t('b3b', 8 * d);
    this.rays = t('rays', 4 * d); this.flare = t('flare', 4 * d); this.flareb = t('flareb', 4 * d);
  }
  common(p, F) {
    const v = F.view, c = v.cam;
    p.f('uScreen', F.W, F.H).f('uS', v.S).f('uCam', c.x, c.y, c.z, c.lens).f('uRoll', c.roll).f('uTod', F.tod).f('uSun', F.sun[0], F.sun[1]).f('uSunVis', F.sunVis).f('uMoon', ...(F.moon || [0, 0, 0]));
    return p;
  }
  fs() { this.gl.bindVertexArray(this.gl.vao); this.gl.drawArrays(this.gl.TRIANGLES, 0, 3); }
  sprites(F, list, add) {
    if (!list || !list.n) return; const gl = this.gl, n = Math.min(list.n, this.maxSprites);
    gl.blendFunc(gl.ONE, add ? gl.ONE : gl.ONE_MINUS_SRC_ALPHA);
    this.common(this.p.sprite.use(), F).tex('uAtlas', this.atlas);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.spBuf); gl.bufferSubData(gl.ARRAY_BUFFER, 0, list.data, 0, n * 16);
    gl.bindVertexArray(this.spVao); gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, n); gl.bindVertexArray(null);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  }
  layer(F, L, o = {}) {
    const gl = this.gl, p = this.common(this.p.layer.use(), F), G = L.gl;
    p.f('uRect', ...L.rect).tex('uTex', G.tex).tex('uTexB', G.texB).f('uTexSize', G.tex.w, G.tex.h).f('uTexPx', G.tex.w / (L.rect[2] - L.rect[0]))
      .f('uFocus', F.focus).f('uAper', F.aper * (L.blurK ?? 1)).f('uMaxBlur', F.maxBlur * (L.name === 'fg' ? 2.5 : 1)).f('uAmb', ...(o.amb || F.amb)).f('uFogC', ...F.fog).f('uFogK', (L.fog || 0) * F.fogK)
      .f('uSway', L.sway ? L.sway * (o.sway ?? 1) : 0).f('uSwayY0', L.swayY0 || 1).f('uTime', F.simT).f('uWind', o.wind || 0);
    if (G.em) p.tex('uEm', G.em).tex('uEmB', G.emB).f('uEmK', F.emK * (L.emK ?? 1)); else p.tex('uEm', G.tex).tex('uEmB', G.texB).f('uEmK', 0);
    G.mesh.draw();
  }
  char(F, it) {
    const gl = this.gl, cv = it.canvas; gl.bindVertexArray(gl.vao);
    let tex = this.charTex.get(it.id); if (!tex) { tex = texture(gl, null, { mip: false }); this.charTex.set(it.id, tex); }
    tex.upload(cv);
    const p = this.common(this.p.char.use(), F).tex('uTex', tex).f('uTexSize', cv.width, cv.height);
    const flat = c => [c[0][0], c[0][1], c[1][0], c[1][1], c[2][0], c[2][1], c[3][0], c[3][1]];
    if (it.shadow && it.shadow.alpha > 0.003) {
      p.fv('uC', new Float32Array(flat(it.shadow.corners)), 2).f('uShadow', 1).f('uShadowC', ...it.shadow.color).f('uAlpha', it.shadow.alpha * (it.alpha ?? 1)).f('uBlur', it.shadow.blur);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }
    const L = it.light, pl = new Float32Array(16), plc = new Float32Array(12);
    (L.pls || []).slice(0, 4).forEach((q, i) => { pl.set([q[0], q[1], q[2], q[3]], i * 4); plc.set([q[4], q[5], q[6]], i * 3); });
    p.fv('uC', new Float32Array(flat(it.corners)), 2).f('uShadow', 0).f('uAlpha', it.alpha ?? 1).f('uBlur', it.blur || 0).f('uAmb', ...L.amb).f('uKeyC', ...L.keyC).f('uKeyDir', ...L.keyDir).f('uRim', L.rim)
      .fv('uPL', pl, 4).fv('uPLC', plc, 3).f('uNPL', Math.min(4, (L.pls || []).length)).f('uR0', ...it.corners[0]).f('uR1', ...it.corners[3]).f('uGlow', it.glow || 0);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }
  render(F) {
    const gl = this.gl, pr = F.pr; this.resize(F.W, F.H, pr);
    gl.bindVertexArray(gl.vao);
    // 1. emissive sky elements (fireworks, heart, distant lights) into their own buffer: composited + mirrored in the sea
    this.emis.bind(); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT); gl.enable(gl.BLEND);
    this.sprites(F, F.lists.emis, true);
    // 2. the scene (or an AI clip for this scene, with the light and particles still on top)
    if (F.clip) { this.clipScene(F); return this.post(F); }
    this.scene.bind(); gl.disable(gl.BLEND);
    this.common(this.p.sky.use(), F).f('uTarget', this.scene.w, this.scene.h).f('uTime', F.simT).f('uAurora', F.sky.aurora).f('uStars', F.sky.stars).f('uCloudK', F.sky.cloudK); this.fs();
    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE);
    this.p.copy.use().tex('uTex', this.emis); this.fs();
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    for (const it of F.before) this.layer(F, it.layer, it);                                   // far shore
    const s = F.sea, sp = this.common(this.p.sea.use(), F).f('uTarget', this.scene.w, this.scene.h).f('uTime', F.simT).f('uNight', s.night).f('uGustX', s.gustX).f('uGustA', s.gustA)
      .f('uWaveA', s.waveA).f('uReflK', s.reflK).fv('uRip', s.rip, 4).tex('uEmis', this.emis);
    gl.disable(gl.BLEND); this.fs(); gl.enable(gl.BLEND);
    for (const it of F.draw) {
      if (it.type === 'layer') this.layer(F, it.layer, it);
      else if (it.type === 'char') { if (it.canvas) this.char(F, it); }
      else if (it.type === 'sprites') this.sprites(F, it.list, it.add);
    }
    this.post(F);
  }
  clipScene(F) {
    const gl = this.gl, v = F.clip.el;
    if (!this.clipTex) this.clipTex = texture(gl, null, {});
    this.clipTex.upload(v);
    const A = F.W / F.H, B = (v.videoWidth || 16) / (v.videoHeight || 9), fit = B > A ? [A / B, 1] : [1, B / A];
    this.scene.bind(); gl.disable(gl.BLEND);
    this.p.cover.use().tex('uTex', this.clipTex).f('uFit', fit[0], fit[1]).f('uZoom', F.clip.zoom || 1); this.fs();
    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE); this.p.copy.use().tex('uTex', this.emis); this.fs(); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    for (const it of F.draw) if (it.type === 'sprites' && it.overlay) this.sprites(F, it.list, it.add);
  }
  post(F) {
    const gl = this.gl;
    // 3. post
    const P = F.post; gl.disable(gl.BLEND);
    this.b1.bind(); this.p.bright.use().tex('uTex', this.scene).f('uT', P.thresh); this.fs();
    const blur = (src, tmp, s) => { tmp.bind(); this.p.blur.use().tex('uTex', src).f('uDir', s / src.w, 0); this.fs(); src.bind(); this.p.blur.use().tex('uTex', tmp).f('uDir', 0, s / src.h); this.fs(); };
    blur(this.b1, this.b1b, 1);
    this.b2.bind(); this.p.copy.use().tex('uTex', this.b1); this.fs(); blur(this.b2, this.b2b, 1.5);
    this.b3.bind(); this.p.copy.use().tex('uTex', this.b2); this.fs(); blur(this.b3, this.b3b, 2); blur(this.b3, this.b3b, 3);
    this.rays.bind(); gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT);
    if (P.raysK > 0 && P.sunUV) { this.p.rays.use().tex('uTex', this.b2).f('uSunUV', ...P.sunUV).f('uDensity', 0.85).f('uWeight', 0.05).f('uDecay', 0.955); this.fs(); }
    this.flare.bind(); gl.clear(gl.COLOR_BUFFER_BIT);
    if (P.flareK > 0) { this.p.copy.use().tex('uTex', this.b2); this.fs(); for (const s of [2, 5, 11]) { this.flareb.bind(); this.p.blur.use().tex('uTex', this.flare).f('uDir', s / this.flare.w, 0); this.fs(); this.flare.bind(); this.p.blur.use().tex('uTex', this.flareb).f('uDir', s * 1.7 / this.flare.w, 0); this.fs(); } }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, this.w, this.h);
    this.p.final.use().tex('uScene', this.scene).tex('uB1', this.b1).tex('uB2', this.b2).tex('uB3', this.b3).tex('uRays', this.rays).tex('uFlare', this.flare)
      .f('uScreen', F.W, F.H).f('uMotion', P.motion[0], P.motion[1]).f('uBloomK', P.bloomK).f('uRaysK', P.raysK).f('uFlareK', P.flareK).f('uHalK', P.halK).f('uTod', F.tod)
      .f('uTime', F.t).f('uLetter', P.letter).f('uFade', P.fade).f('uFadeC', ...P.fadeC).f('uGrain', P.grain).f('uVig', P.vig).f('uChroma', P.chroma).f('uDirtK', P.dirtK).f('uSat', P.sat).f('uExpo', P.expo);
    this.fs();
  }
}

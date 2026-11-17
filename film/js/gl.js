// Small WebGL2 toolkit: programs with cached uniforms, render targets, textures, instanced sprite batch.
export function createGL(canvas) {
  const gl = canvas.getContext('webgl2', { alpha: false, antialias: false, depth: false, stencil: false, premultipliedAlpha: true, preserveDrawingBuffer: false, powerPreference: 'high-performance' });
  if (!gl) return null;
  gl.hdr = !!gl.getExtension('EXT_color_buffer_float') || !!gl.getExtension('EXT_color_buffer_half_float');
  gl.getExtension('OES_texture_float_linear');
  gl.vao = gl.createVertexArray();          // empty VAO for attribute-less full-screen / quad draws
  return gl;
}

export function program(gl, vs, fs, name = '') {
  const sh = (type, src) => {
    const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      const log = gl.getShaderInfoLog(s), lines = src.split('\n');
      const m = /ERROR: \d+:(\d+)/.exec(log || ''); const ln = m ? +m[1] : 0;
      throw new Error(`shader ${name}: ${log}\n${lines.slice(Math.max(0, ln - 3), ln + 2).join('\n')}`);
    }
    return s;
  };
  const p = gl.createProgram();
  gl.attachShader(p, sh(gl.VERTEX_SHADER, vs)); gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fs)); gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(`link ${name}: ${gl.getProgramInfoLog(p)}`);
  const loc = {}, n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < n; i++) { const u = gl.getActiveUniform(p, i), nm = u.name.replace(/\[0\]$/, ''); loc[nm] = gl.getUniformLocation(p, u.name); }
  let unit = 0;
  const api = {
    p, loc,
    use() { gl.useProgram(p); unit = 0; return api; },
    f(n, ...v) { const l = loc[n]; if (l === undefined || l === null) return api; [gl.uniform1f, gl.uniform1f, gl.uniform2f, gl.uniform3f, gl.uniform4f][v.length].call(gl, l, ...v); return api; },
    fv(n, arr, size) { const l = loc[n]; if (l == null) return api; [0, gl.uniform1fv, gl.uniform2fv, gl.uniform3fv, gl.uniform4fv][size].call(gl, l, arr); return api; },
    i(n, v) { const l = loc[n]; if (l != null) gl.uniform1i(l, v); return api; },
    tex(n, t) { const l = loc[n]; if (l == null) return api; gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, t && t.tex ? t.tex : t); gl.uniform1i(l, unit++); return api; }
  };
  return api;
}

export function texture(gl, src, { mip = false, wrap = false, flip = false } = {}) {
  const t = gl.createTexture(), o = { tex: t, w: 0, h: 0, mip };
  gl.bindTexture(gl.TEXTURE_2D, t);
  const w = wrap ? gl.REPEAT : gl.CLAMP_TO_EDGE;
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, w); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, w);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, mip ? gl.LINEAR_MIPMAP_LINEAR : gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  o.upload = (s) => {
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true); gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, flip);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, s);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false); gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    if (mip) gl.generateMipmap(gl.TEXTURE_2D);
    o.w = s.width; o.h = s.height; return o;
  };
  if (src) o.upload(src);
  return o;
}

export function target(gl, w, h, { hdr = false, mip = false, linear = true } = {}) {
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  const useF = hdr && gl.hdr;
  gl.texImage2D(gl.TEXTURE_2D, 0, useF ? gl.RGBA16F : gl.RGBA8, w, h, 0, gl.RGBA, useF ? gl.HALF_FLOAT : gl.UNSIGNED_BYTE, null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, mip ? gl.LINEAR_MIPMAP_LINEAR : (linear ? gl.LINEAR : gl.NEAREST));
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, linear ? gl.LINEAR : gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  const fb = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, fb); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  return { tex, fb, w, h, bind() { gl.bindFramebuffer(gl.FRAMEBUFFER, fb); gl.viewport(0, 0, w, h); }, dispose() { gl.deleteTexture(tex); gl.deleteFramebuffer(fb); } };
}

// static mesh of (worldX, worldY, groundY) vertices drawn as indexed triangles
export function mesh(gl, verts, idx) {
  const vao = gl.createVertexArray(); gl.bindVertexArray(vao);
  const vb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, vb); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(verts), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 12, 0);
  const ib = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(idx), gl.STATIC_DRAW);
  gl.bindVertexArray(null);
  return { vao, count: idx.length, draw() { gl.bindVertexArray(vao); gl.drawElements(gl.TRIANGLES, idx.length, gl.UNSIGNED_SHORT, 0); gl.bindVertexArray(null); } };
}

// instanced sprites: per instance [x, y, gy, rot,  w, h, sx, sy,  r, g, b, a,  u, v, uw, vh] (16 floats)
export const SPRITE_STRIDE = 16;
export function spriteBatch(gl, max) {
  const vao = gl.createVertexArray(), buf = gl.createBuffer(), data = new Float32Array(max * SPRITE_STRIDE);
  gl.bindVertexArray(vao); gl.bindBuffer(gl.ARRAY_BUFFER, buf); gl.bufferData(gl.ARRAY_BUFFER, data.byteLength, gl.DYNAMIC_DRAW);
  for (let i = 0; i < 4; i++) { gl.enableVertexAttribArray(i); gl.vertexAttribPointer(i, 4, gl.FLOAT, false, SPRITE_STRIDE * 4, i * 16); gl.vertexAttribDivisor(i, 1); }
  gl.bindVertexArray(null);
  return {
    data, max, n: 0,
    reset() { this.n = 0; },
    // x,y world; gy ground y (parallax); w,h world units; sx,sy stretch vector (world units); col [r,g,b,a]; uv [u,v,w,h] or null for a soft glow dot
    push(x, y, gy, rot, w, h, sx, sy, r, g, b, a, uv) {
      if (this.n >= max) return; const o = this.n++ * SPRITE_STRIDE, d = data;
      d[o] = x; d[o + 1] = y; d[o + 2] = gy; d[o + 3] = rot; d[o + 4] = w; d[o + 5] = h; d[o + 6] = sx; d[o + 7] = sy;
      d[o + 8] = r; d[o + 9] = g; d[o + 10] = b; d[o + 11] = a;
      if (uv) { d[o + 12] = uv[0]; d[o + 13] = uv[1]; d[o + 14] = uv[2]; d[o + 15] = uv[3]; } else { d[o + 12] = 0; d[o + 13] = 0; d[o + 14] = -1; d[o + 15] = 0; }
    },
    draw() {
      if (!this.n) return;
      gl.bindBuffer(gl.ARRAY_BUFFER, buf); gl.bufferSubData(gl.ARRAY_BUFFER, 0, data, 0, this.n * SPRITE_STRIDE);
      gl.bindVertexArray(vao); gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, this.n); gl.bindVertexArray(null);
    }
  };
}

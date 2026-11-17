// All GLSL ES 3.00 shaders for the film.
const HEAD = `#version 300 es
precision highp float;
uniform vec2 uScreen; uniform float uS; uniform vec4 uCam; uniform float uRoll;
const float HZ = 470.0, FH = 0.12, H0 = 1000.0;
float fOf(float gy) { return FH + (1.0 - FH) * (gy - HZ) / (H0 - HZ); }
float pf(float gy) { float f = fOf(gy); if (f < 1.0) f = 1.0 - (1.0 - f) * (1.0 - 0.82 * uCam.w); return f; }
float zf(float f) { return 1.0 + (uCam.z - 1.0) * min(f, 1.3); }
vec2 camC(float f) { return vec2(800.0 + (uCam.x - 800.0) * f, 500.0 + (uCam.y - 500.0) * f); }
vec2 rot2(vec2 d, float a) { float c = cos(a), s = sin(a); return vec2(d.x * c - d.y * s, d.x * s + d.y * c); }
vec2 proj(vec2 wp, float gy) { float f = pf(gy); return rot2((wp - camC(f)) * uS * zf(f), uRoll) + uScreen * 0.5; }
vec2 unproj(vec2 sp, float gy) { float f = pf(gy); return rot2(sp - uScreen * 0.5, -uRoll) / (uS * zf(f)) + camC(f); }
vec4 clipOf(vec2 sp) { return vec4(sp.x / uScreen.x * 2.0 - 1.0, 1.0 - sp.y / uScreen.y * 2.0, 0.0, 1.0); }
float hash12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float vnoise(vec2 p) { vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1, 0)), u.x), mix(hash12(i + vec2(0, 1)), hash12(i + vec2(1, 1)), u.x), u.y); }
float fbm(vec2 p) { float v = 0.0, a = 0.5; mat2 m = mat2(1.6, 1.2, -1.2, 1.6); for (int i = 0; i < 5; i++) { v += a * vnoise(p); p = m * p; a *= 0.5; } return v; }
const vec2 PD[8] = vec2[8](vec2(-0.613, 0.617), vec2(0.170, -0.040), vec2(-0.299, -0.791), vec2(0.645, 0.493), vec2(-0.326, 0.358), vec2(0.758, 0.049), vec2(-0.817, -0.271), vec2(-0.423, -0.401));
// soft blur without mip levels: a golden-angle spiral of taps at full resolution
vec4 blurTex(sampler2D t, vec2 uv, float rTex, vec2 ts) {
  if (rTex < 0.75) return texture(t, uv);
  float r = min(rTex, 14.0); vec4 a = texture(t, uv);
  for (int i = 1; i < 13; i++) { float fi = float(i), rr = sqrt(fi / 12.0) * r, an = fi * 2.39996; a += texture(t, uv + vec2(cos(an), sin(an)) * rr / ts); }
  return a / 13.0;
}
// layers: blend the sharp painting towards its pre-blurred copy (half resolution, ~14 px soft) as the blur grows
vec4 dofTex(sampler2D sharp, sampler2D soft, vec2 uv, float rTex, vec2 ts) {
  if (rTex < 0.75) return texture(sharp, uv);
  float k = smoothstep(0.75, 10.0, rTex);
  vec4 a = k < 0.999 ? blurTex(sharp, uv, min(rTex, 4.0), ts) : vec4(0.0);
  vec4 b = texture(soft, uv) * 0.4; float r = max(rTex - 10.0, 0.0) * 0.5;
  if (r > 0.5) { for (int i = 1; i < 7; i++) { float fi = float(i), an = fi * 2.39996, rr = sqrt(fi / 6.0) * r; b += texture(soft, uv + vec2(cos(an), sin(an)) * rr * 2.0 / ts) * 0.1; } } else b *= 2.5;
  return mix(a, b, k);
}
// sky palette: per time-of-day key (0 golden, .5 sunset, 1 blue hour, 1.5 dusk, 2 night): horizon, low, mid, zenith
const vec3 SKY[20] = vec3[20](
  vec3(1.0, 0.886, 0.69), vec3(1.0, 0.745, 0.58), vec3(0.98, 0.64, 0.76), vec3(0.62, 0.70, 0.96),
  vec3(1.0, 0.76, 0.47), vec3(1.0, 0.60, 0.53), vec3(0.88, 0.52, 0.72), vec3(0.52, 0.50, 0.84),
  vec3(0.98, 0.64, 0.53), vec3(0.78, 0.52, 0.72), vec3(0.40, 0.39, 0.72), vec3(0.15, 0.17, 0.42),
  vec3(0.70, 0.43, 0.55), vec3(0.40, 0.29, 0.54), vec3(0.19, 0.18, 0.42), vec3(0.075, 0.095, 0.26),
  vec3(0.17, 0.16, 0.34), vec3(0.11, 0.11, 0.28), vec3(0.065, 0.08, 0.235), vec3(0.043, 0.063, 0.188));
vec3 skyStop(int k, float tod) { float t = clamp(tod, 0.0, 2.0) * 2.0; int i = int(min(floor(t), 3.0)); return mix(SKY[i * 4 + k], SKY[(i + 1) * 4 + k], t - float(i)); }
vec3 skyGrad(float e, float tod) {
  vec3 h = skyStop(0, tod), l = skyStop(1, tod), m = skyStop(2, tod), z = skyStop(3, tod);
  return e < 0.12 ? mix(h, l, e / 0.12) : e < 0.45 ? mix(l, m, (e - 0.12) / 0.33) : mix(m, z, clamp((e - 0.45) / 0.55, 0.0, 1.0));
}
uniform float uTod; uniform vec2 uSun; uniform float uSunVis; uniform vec3 uMoon;
vec3 sunCol() { return mix(vec3(1.0, 0.88, 0.62), vec3(1.0, 0.58, 0.40), clamp(uTod * 1.6, 0.0, 1.0)); }
vec3 skyAt(vec2 wp) {
  float e = clamp((HZ - wp.y) / 520.0, 0.0, 1.0); vec3 c = skyGrad(e, uTod);
  float d = length((wp - uSun) * vec2(1.0, 1.7));
  float glow = clamp(1.0 - (uTod - 0.7) / 0.9, 0.0, 1.0);
  c += sunCol() * (0.6 * exp(-d / 80.0) + 0.38 * exp(-d / 300.0) + 0.12 * exp(-abs(wp.y - HZ) / 30.0) * exp(-abs(wp.x - uSun.x) / 900.0)) * glow * (1.0 - 0.55 * e);
  c = mix(c, skyStop(0, uTod) * 1.04, exp(-max(HZ - wp.y, 0.0) / 16.0) * 0.45);
  return c;
}
`;

export const VS_FULL = `#version 300 es
out vec2 vUV; void main() { vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2)); vUV = p; gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0); }`;

// ---------------------------------------------------------------- sky: gradient, painted clouds, sun, stars, aurora
export const FS_SKY = HEAD + `
uniform vec2 uTarget; uniform float uTime, uAurora, uStars, uCloudK;
in vec2 vUV; out vec4 o;
vec3 cloudCol(float lit, float tod, out vec3 rim) {
  vec3 L0 = vec3(1.0, 0.92, 0.80), S0 = vec3(0.96, 0.64, 0.74), L1 = vec3(1.0, 0.80, 0.56), S1 = vec3(0.84, 0.50, 0.64);
  vec3 L2 = vec3(0.98, 0.70, 0.66), S2 = vec3(0.42, 0.36, 0.64), L3 = vec3(0.30, 0.30, 0.56), S3 = vec3(0.11, 0.11, 0.26);
  float t = clamp(tod, 0.0, 2.0);
  vec3 L = t < 0.5 ? mix(L0, L1, t / 0.5) : t < 1.0 ? mix(L1, L2, (t - 0.5) / 0.5) : mix(L2, L3, (t - 1.0));
  vec3 S = t < 0.5 ? mix(S0, S1, t / 0.5) : t < 1.0 ? mix(S1, S2, (t - 0.5) / 0.5) : mix(S2, S3, (t - 1.0));
  rim = mix(vec3(1.0, 0.95, 0.80), vec3(1.0, 0.70, 0.55), clamp(t, 0.0, 1.0)) * (1.0 - clamp(t - 1.0, 0.0, 1.0) * 0.8);
  return mix(S, L, lit);
}
vec4 cloudLayer(vec2 wp, float scale, float sp, float lo, float hi, float seed) {
  float e = (HZ - wp.y) / 520.0;
  float band = smoothstep(lo - 0.08, lo + 0.06, e) * smoothstep(hi + 0.1, hi - 0.06, e);
  if (band <= 0.0) return vec4(0.0);
  vec2 q = wp * vec2(0.0021, 0.0058) * scale + vec2(uTime * sp + seed, seed * 0.37);
  float w = fbm(q * 1.6 + vec2(3.1, 1.7));
  float d = fbm(q + vec2(w * 0.85, w * 0.35));
  vec2 toSun = normalize(uSun - wp + vec2(0.0001));
  float d2 = fbm(q + vec2(w * 0.85, w * 0.35) + toSun * vec2(0.035, 0.02));
  float a = smoothstep(0.50, 0.66, d) * band;
  float lit = clamp((d - d2) * 9.0 + 0.45, 0.0, 1.0); lit = mix(lit, floor(lit * 3.0 + 0.5) / 3.0, 0.45); // gouache steps
  vec3 rim; vec3 c = cloudCol(lit, uTod, rim);
  float edge = smoothstep(0.50, 0.56, d) - smoothstep(0.56, 0.66, d);
  float sunNear = exp(-length(uSun - wp) / 420.0) * clamp(1.0 - (uTod - 0.8), 0.0, 1.0);
  c += rim * edge * (0.25 + 0.9 * sunNear) * lit;
  float moonNear = exp(-length(uMoon.xy - wp) / 260.0) * uMoon.z;
  c += vec3(0.55, 0.6, 0.8) * (edge * 0.9 + lit * 0.12) * moonNear;
  return vec4(c, a);
}
vec3 stars(vec2 wp, float cell, float thr, float rad) {
  vec2 g = wp / cell, i = floor(g), f = fract(g); float h = hash12(i + 11.0);
  if (h < thr) return vec3(0.0);
  vec2 p = vec2(hash12(i + 7.1), hash12(i + 3.3)) * 0.8 + 0.1; float b = (h - thr) / (1.0 - thr);
  float tw = 0.65 + 0.35 * sin(uTime * (1.2 + h * 3.0) + h * 50.0);
  float d = length((f - p) * cell);
  return mix(vec3(0.75, 0.82, 1.0), vec3(1.0, 0.93, 0.85), hash12(i)) * (smoothstep(rad, 0.0, d) * 1.6 + exp(-d * d / (rad * rad * 9.0)) * 0.25) * b * tw;
}
vec3 aurora(vec2 wp) {
  float e = (HZ - wp.y) / 520.0, x = wp.x * 0.0032;
  float a = fbm(vec2(x * 0.9 + uTime * 0.025, uTime * 0.04));
  float c = e - 0.50 - (a - 0.5) * 0.36;
  float curtain = exp(-c * c / 0.010) + 0.5 * exp(-(c + 0.06) * (c + 0.06) / 0.03);
  float rays = 0.55 + 0.45 * sin(wp.x * 0.07 + fbm(vec2(x * 5.0, uTime * 0.15)) * 7.0);
  vec3 col = mix(vec3(1.0, 0.62, 0.86), vec3(0.73, 0.64, 1.0), smoothstep(-0.12, 0.12, c));
  return col * curtain * rays * 0.6 * smoothstep(0.08, 0.3, e);
}
void main() {
  vec2 sp = vec2(gl_FragCoord.x, uTarget.y - gl_FragCoord.y) * uScreen / uTarget;
  vec2 wp = unproj(sp, HZ + 0.5);
  vec3 c = skyAt(wp);
  float night = clamp(uTod - 0.9, 0.0, 1.0);
  if (uStars > 0.0) { vec3 s = stars(wp, 13.0, 0.80, 0.85) + stars(wp + 77.0, 41.0, 0.86, 1.4) * 1.4; c += s * uStars * smoothstep(0.02, 0.16, (HZ - wp.y) / 520.0); }
  if (uAurora > 0.0) c += aurora(wp) * uAurora;
  // sun disc
  float sd = length(wp - uSun);
  c = mix(c, vec3(1.0, 0.98, 0.92) * 1.25, smoothstep(26.0, 23.0, sd) * uSunVis * step(wp.y, HZ));
  // the moon: a soft halo, then a disc with faint seas on it
  if (uMoon.z > 0.0) {
    vec2 mq = unproj(sp, HZ + 0.6); float md = length(mq - uMoon.xy);
    c += vec3(0.62, 0.66, 0.85) * (0.30 * exp(-md / 34.0) + 0.16 * exp(-md / 140.0) + 0.05 * exp(-md / 420.0)) * uMoon.z;
    float mare = fbm((mq - uMoon.xy) * 0.09 + 3.0);
    vec3 disc = mix(vec3(1.0, 0.97, 0.88), vec3(0.80, 0.79, 0.78), smoothstep(0.45, 0.75, mare) * 0.8) * 1.35;
    c = mix(c, disc, smoothstep(15.0, 13.5, md) * uMoon.z * step(mq.y, HZ - 2.0));
  }
  // clouds: two depth bands with their own parallax
  vec4 hi = cloudLayer(unproj(sp, HZ + 22.0), 1.0, 0.0045, 0.30, 0.78, 0.0);
  c = mix(c, hi.rgb, hi.a * 0.92 * uCloudK);
  vec4 lo = cloudLayer(unproj(sp, HZ + 8.0), 1.7, 0.0028, 0.03, 0.22, 4.7);
  c = mix(c, lo.rgb, lo.a * 0.85 * uCloudK);
  o = vec4(c, 1.0);
}`;

// ---------------------------------------------------------------- the sea: Gerstner waves, Fresnel sky, glitter, caustics, foam, plankton, reflections
export const FS_SEA = HEAD + `
uniform vec2 uTarget; uniform float uTime, uNight, uGustX, uGustA, uWaveA; uniform sampler2D uEmis; uniform vec4 uRip[8]; uniform float uReflK;
in vec2 vUV; out vec4 o;
float baseY(float x) { return 1010.0 + (x + 300.0) * (-516.0 / 1045.0); }
float solveGy(float sy) { float lo = HZ + 0.02, hi = 1700.0; for (int i = 0; i < 22; i++) { float m = 0.5 * (lo + hi); if (proj(vec2(uCam.x, m), m).y < sy) lo = m; else hi = m; } return 0.5 * (lo + hi); }
vec3 waves(vec2 p, float t, float Z) {
  vec3 r = vec3(0.0);
  vec2 D[6] = vec2[6](vec2(0.94, 0.34), vec2(0.60, -0.80), vec2(-0.30, 0.95), vec2(0.85, 0.52), vec2(-0.70, 0.71), vec2(0.20, -0.98));
  float L[6] = float[6](11.0, 6.5, 4.1, 2.6, 1.6, 1.0);
  for (int i = 0; i < 6; i++) {
    float k = 6.2832 / L[i], w = sqrt(9.8 * k), fade = smoothstep(0.0, 1.0, L[i] / (0.016 * Z + 0.04));
    float a = 0.03 * L[i] * uWaveA * fade, ph = k * dot(D[i], p) - w * t + float(i) * 1.7;
    float s = sin(ph), c = cos(ph);
    r.x += a * s; r.y += a * k * D[i].x * c; r.z += a * k * D[i].y * c;
  }
  return r;
}
float caustic(vec2 p, float t) {   // bounded, flickering light net in shallow water
  float a = sin(p.x * 1.7 + sin(p.y * 1.3 + t)) * sin(p.y * 1.9 + sin(p.x * 1.1 - t * 0.8));
  float b = sin(p.x * 2.3 - t * 0.6 + sin(p.y * 2.1)) * sin(p.y * 2.7 + t * 0.7);
  return pow(clamp(abs(a * 0.6 + b * 0.4), 0.0, 1.0), 6.0);
}
void main() {
  vec2 sp = vec2(gl_FragCoord.x, uTarget.y - gl_FragCoord.y) * uScreen / uTarget;
  float hy = proj(vec2(uCam.x, HZ), HZ).y;
  if (sp.y < hy - 0.5) discard;
  float gy = solveGy(sp.y);
  vec2 wp = unproj(sp, gy);
  float Z = 2400.0 / max(gy - HZ, 0.05);
  vec2 p = vec2((wp.x - 800.0) * Z / 900.0, Z);
  float t = uTime;
  vec3 wv = waves(p, t, Z);
  float g = exp(-pow((wp.x - uGustX) / 190.0, 2.0)) * uGustA;                          // a gust travelling across the water
  vec2 gn = vec2(vnoise(p * 1.7 + t * 1.3) - 0.5, vnoise(p * 1.9 - t * 1.1 + 4.0) - 0.5) * g * 0.9;
  vec3 n = normalize(vec3(-wv.y - gn.x, 1.0, -wv.z - gn.y));
  vec3 v = normalize(vec3(0.0, -1.7, Z));
  vec3 r = reflect(v, n);
  float fres = 0.04 + 0.96 * pow(1.0 - clamp(dot(n, -v), 0.0, 1.0), 5.0);
  float e = clamp(r.y * 2.4, 0.0, 1.0);
  vec3 refl = skyAt(vec2(wp.x + r.x * 500.0, HZ - e * 520.0));
  float day = 1.0 - clamp(uTod - 0.6, 0.0, 1.0);
  vec3 deep = mix(mix(vec3(0.10, 0.42, 0.52), vec3(0.11, 0.20, 0.40), clamp(uTod, 0.0, 1.0)), vec3(0.03, 0.05, 0.13), clamp(uTod - 1.0, 0.0, 1.0));
  vec3 shal = mix(mix(vec3(0.25, 0.70, 0.72), vec3(0.22, 0.38, 0.58), clamp(uTod, 0.0, 1.0)), vec3(0.05, 0.09, 0.19), clamp(uTod - 1.0, 0.0, 1.0));
  float shallow = 1.0 - smoothstep(0.0, 110.0, baseY(wp.x) - wp.y);
  vec3 body = mix(deep, shal, shallow * 0.8 + 0.15) * (1.0 - 0.2 * g);
  vec3 col = mix(body, refl, clamp(fres * 1.1, 0.0, 1.0));
  // sun glitter: a column under the sun that widens towards us, broken into sparkles by the wave normals
  vec3 sdir = normalize(vec3((uSun.x - wp.x) / (Z * 30.0 + 260.0), max(0.015, (HZ - uSun.y) / 700.0), 1.0));
  float spec = pow(clamp(dot(r, sdir), 0.0, 1.0), 420.0) * 7.0;
  float col2 = exp(-pow((wp.x - uSun.x) / (20.0 + (gy - HZ) * 0.85), 2.0));
  col += sunCol() * (spec * (0.4 + col2) + col2 * 0.16 * (0.6 + 0.4 * sin(p.x * 3.0 + t * 2.0))) * uSunVis * day;
  if (uMoon.z > 0.0) {
    vec3 mdir = normalize(vec3((uMoon.x - wp.x) / (Z * 30.0 + 260.0), max(0.015, (HZ - uMoon.y) / 700.0), 1.0));
    float mspec = pow(clamp(dot(r, mdir), 0.0, 1.0), 260.0) * 6.0;
    float mcol = exp(-pow((wp.x - uMoon.x) / (12.0 + (gy - HZ) * 0.55), 2.0));
    col += vec3(0.92, 0.92, 1.0) * (mspec * (0.25 + mcol * 1.4) + mcol * 0.05 * (0.5 + 0.5 * sin(p.x * 3.0 + t * 2.0))) * uMoon.z;
  }
  // reflections of fireworks, lanterns, lights and stars, broken up by the waves
  vec2 msp = vec2(sp.x + n.x * 26.0, hy - (sp.y - hy) * 1.05 + n.z * 18.0);
  vec3 em = texture(uEmis, vec2(msp.x / uScreen.x, 1.0 - msp.y / uScreen.y)).rgb;
  col += em * (0.30 + 0.55 * fres) * uReflK * smoothstep(0.0, 6.0, sp.y - hy);
  // caustic shimmer and foam where the water meets the wall
  col += vec3(0.9, 1.0, 0.95) * caustic(p * vec2(0.9, 2.4) * 0.6, t * 0.6) * shallow * 0.22 * day;
  float foam = smoothstep(0.55, 1.0, vnoise(p * vec2(1.4, 3.0) + vec2(t * 0.4, 0.0)) + wv.x * 3.0) * smoothstep(0.65, 1.0, shallow) * 0.55;
  foam += smoothstep(0.08, 0.16, wv.x + g * 0.05) * 0.25 * (0.3 + g);
  col = mix(col, mix(vec3(1.0, 0.96, 0.92), vec3(0.55, 0.58, 0.75), clamp(uTod - 0.7, 0.0, 1.0)), clamp(foam, 0.0, 0.7));
  // bioluminescent plankton: rings when she laughs or pets Jessi, a faint glow in the shallows at night
  float glowAcc = 0.0;
  for (int i = 0; i < 8; i++) {
    vec4 rp = uRip[i]; if (rp.w <= 0.0) continue;
    float age = t - rp.z; if (age < 0.0) continue;
    float d = length((p - rp.xy) * vec2(1.0, 0.55)), R = age * 2.3;
    glowAcc += (exp(-pow((d - R) / (0.55 + age * 0.18), 2.0)) + 0.6 * exp(-pow((d - R * 0.6) / 0.4, 2.0))) * exp(-age * 0.42) * rp.w + exp(-d * d / 3.0) * exp(-age * 1.2) * rp.w;
  }
  float spark = step(0.86, hash12(floor(p * vec2(3.0, 6.0)) + floor(t * 3.0)));
  vec3 pk = vec3(0.40, 1.0, 0.86);
  col += pk * glowAcc * (0.55 + 0.9 * spark) * (0.5 + uNight);
  col += pk * shallow * uNight * 0.16 * (0.3 + spark);
  // haze into the horizon
  col = mix(col, skyStop(0, uTod) * 0.98, exp(-(gy - HZ) / 9.0) * 0.85);
  // water "under" the promenade is never seen directly: keep it a quiet stone tone so soft layer edges blend cleanly
  float under = wp.x < 745.0 ? smoothstep(-3.0, 3.0, wp.y - baseY(wp.x)) : smoothstep(480.0, 486.0, wp.y);
  col = mix(col, mix(vec3(0.80, 0.64, 0.62), vec3(0.20, 0.18, 0.30), clamp(uTod - 0.5, 0.0, 1.0)), under);
  if (any(isnan(col)) || any(isinf(col))) col = skyStop(0, uTod);
  o = vec4(clamp(col, 0.0, 6.0), 1.0);
}`;

// ---------------------------------------------------------------- painted layers (ground mesh / billboards) with depth blur, wind sway, time-of-day light
export const VS_LAYER = HEAD + `
layout(location = 0) in vec3 aPos; uniform vec4 uRect;
out vec2 vUV; out float vGy;
void main() { vUV = (aPos.xy - uRect.xy) / (uRect.zw - uRect.xy); vGy = aPos.z; gl_Position = clipOf(proj(aPos.xy, aPos.z)); }`;
export const FS_LAYER = HEAD + `
in vec2 vUV; in float vGy; out vec4 o;
uniform sampler2D uTex, uEm, uTexB, uEmB; uniform vec2 uTexSize; uniform float uTexPx, uFocus, uAper, uMaxBlur, uFogK, uEmK, uSway, uTime, uWind, uSwayY0; uniform vec3 uAmb, uFogC;
void main() {
  vec2 uv = vUV;
  if (uSway > 0.0) { float k = pow(clamp((uSwayY0 - uv.y) / uSwayY0, 0.0, 1.0), 1.4); float ph = uTime * 1.7 + uv.y * 11.0 + uv.x * 7.0;
    uv.x += (sin(ph) * 0.55 + sin(ph * 2.3 + 1.0) * 0.25 + uWind) * uSway * k; uv.y += cos(uTime * 1.3 + uv.x * 9.0) * uSway * 0.35 * k; }
  float blurPx = min(uAper * abs(vGy - uFocus), uMaxBlur), rTex = blurPx / (uS * zf(pf(vGy))) * uTexPx;
  vec4 c = dofTex(uTex, uTexB, uv, rTex, uTexSize);
  c.rgb *= uAmb;
  c.rgb = mix(c.rgb, uFogC * c.a, clamp(uFogK * (1.0 - clamp(pf(vGy), 0.0, 1.0)), 0.0, 1.0));
  if (uEmK > 0.0) c.rgb += dofTex(uEm, uEmB, uv, rTex, uTexSize).rgb * uEmK;
  o = c;
}`;

// ---------------------------------------------------------------- characters: screen quads with 2D lighting (fake normals from alpha), shadows, dissolve into light
export const VS_QUAD = HEAD + `
uniform vec2 uC[4]; out vec2 vUV;
void main() { int i = gl_VertexID; vUV = vec2(float(i & 1), float(i >> 1)); gl_Position = clipOf(uC[i]); }`;
export const FS_CHAR = HEAD + `
in vec2 vUV; out vec4 o;
uniform sampler2D uTex; uniform vec2 uTexSize; uniform float uBlur, uShadow, uAlpha, uGlow, uRim, uNPL; uniform vec3 uAmb, uKeyC, uShadowC; uniform vec2 uKeyDir;
uniform vec4 uPL[4]; uniform vec3 uPLC[4]; uniform vec2 uR0, uR1;
void main() {
  vec4 c = blurTex(uTex, vUV, uBlur, uTexSize);
  if (uShadow > 0.5) { float a = blurTex(uTex, vUV, uBlur + 5.0, uTexSize).a; o = vec4(uShadowC * a, a) * uAlpha; return; }
  vec2 e = vec2(3.0) / uTexSize;
  float ax = texture(uTex, vUV + vec2(e.x, 0.0)).a - texture(uTex, vUV - vec2(e.x, 0.0)).a;
  float ay = texture(uTex, vUV + vec2(0.0, e.y)).a - texture(uTex, vUV - vec2(0.0, e.y)).a;
  vec3 N = normalize(vec3(-ax, -ay, 0.45));
  vec3 lit = uAmb;
  float rim = pow(max(dot(N.xy, uKeyDir), 0.0), 1.3) * (1.0 - N.z) * uRim;
  vec2 sp = mix(uR0, uR1, vUV);
  vec3 add = vec3(0.0);
  for (int i = 0; i < 4; i++) {
    if (float(i) >= uNPL) break;
    vec2 L = uPL[i].xy - sp; float d = length(L), att = uPL[i].w * exp(-d / uPL[i].z), nl = max(dot(N.xy, L / max(d, 1.0)), 0.0);
    lit += uPLC[i] * att * (0.45 + 0.55 * nl * (1.0 - N.z * 0.6));
    add += uPLC[i] * att * pow(nl, 3.0) * (1.0 - N.z) * 0.18;          // a little warm edge light on the lit side
  }
  vec3 alb = c.rgb / max(c.a, 0.001);
  vec3 col = c.rgb * lit + (uKeyC * rim * mix(alb, vec3(1.0), 0.55) + add) * c.a;
  col = mix(col, uKeyC * c.a * 1.6, uGlow);
  o = vec4(col, c.a) * uAlpha;
}`;

// ---------------------------------------------------------------- sprites: sparks, petals, lanterns, motes, thread, stars (instanced)
export const VS_SPRITE = HEAD + `
layout(location = 0) in vec4 aP; layout(location = 1) in vec4 aS; layout(location = 2) in vec4 aC; layout(location = 3) in vec4 aU;
out vec2 vUV; out vec4 vC; flat out float vGlow;
void main() {
  int i = gl_VertexID; vec2 q = vec2(float(i & 1), float(i >> 1)) - 0.5;
  vec2 sp = proj(aP.xy, aP.z); float sc = uS * zf(pf(aP.z));
  vec2 size = aS.xy * sc, st = aS.zw * sc; float sl = length(st); vec2 off;
  if (sl > 0.01) { vec2 d = st / sl, nr = vec2(-d.y, d.x); off = d * (q.x * (size.x + sl) - sl * 0.5) + nr * q.y * size.y; }
  else { float c = cos(aP.w), s = sin(aP.w); vec2 p = q * size; off = vec2(p.x * c - p.y * s, p.x * s + p.y * c); }
  gl_Position = clipOf(sp + rot2(off, uRoll));
  vGlow = aU.z < 0.0 ? 1.0 : 0.0; vUV = aU.z < 0.0 ? q + 0.5 : aU.xy + (q + 0.5) * aU.zw; vC = aC;
}`;
export const FS_SPRITE = `#version 300 es
precision highp float;
uniform sampler2D uAtlas; in vec2 vUV; in vec4 vC; flat in float vGlow; out vec4 o;
void main() {
  if (vGlow > 0.5) { vec2 d = vUV - 0.5; float r2 = dot(d, d) * 4.0; float a = exp(-r2 * 14.0) + 0.32 * exp(-r2 * 3.2); a *= smoothstep(1.0, 0.8, r2); o = vec4(vC.rgb, 1.0) * vC.a * a; }
  else o = texture(uAtlas, vUV) * vec4(vC.rgb, 1.0) * vC.a;
}`;

// ---------------------------------------------------------------- post
export const FS_COVER = `#version 300 es
precision highp float; uniform sampler2D uTex; uniform vec2 uFit; uniform float uZoom; in vec2 vUV; out vec4 o;
void main() { vec2 uv = 0.5 + (vUV - 0.5) * uFit / uZoom; o = vec4(texture(uTex, vec2(uv.x, 1.0 - uv.y)).rgb, 1.0); }`;
export const FS_COPY = `#version 300 es
precision highp float; uniform sampler2D uTex; in vec2 vUV; out vec4 o; void main() { o = texture(uTex, vUV); }`;
export const FS_BRIGHT = `#version 300 es
precision highp float; uniform sampler2D uTex; uniform float uT; uniform vec2 uSunUV; uniform float uSunR; in vec2 vUV; out vec4 o;
void main() { vec3 c = texture(uTex, vUV).rgb; if (any(isnan(c)) || any(isinf(c))) c = vec3(0.0); c = min(c, vec3(8.0)); float l = max(c.r, max(c.g, c.b)); o = vec4(c * max(l - uT, 0.0) / max(l, 1e-4), 1.0); }   // only the light above the threshold`;
export const FS_BLUR = `#version 300 es
precision highp float; uniform sampler2D uTex; uniform vec2 uDir; in vec2 vUV; out vec4 o;
void main() { vec4 c = texture(uTex, vUV) * 0.2270270; c += (texture(uTex, vUV + uDir * 1.3846154) + texture(uTex, vUV - uDir * 1.3846154)) * 0.3162162;
  c += (texture(uTex, vUV + uDir * 3.2307692) + texture(uTex, vUV - uDir * 3.2307692)) * 0.0702703; o = c; }`;
export const FS_RAYS = `#version 300 es
precision highp float; uniform sampler2D uTex; uniform vec2 uSunUV; uniform float uDensity, uWeight, uDecay; in vec2 vUV; out vec4 o;
void main() { vec2 d = (vUV - uSunUV) * uDensity / 36.0, uv = vUV; float il = 1.0; vec3 acc = vec3(0.0);
  for (int i = 0; i < 36; i++) { uv -= d; vec3 s = texture(uTex, uv).rgb; acc += s * il * uWeight; il *= uDecay; } o = vec4(acc, 1.0); }`;
export const FS_FINAL = `#version 300 es
precision highp float;
uniform sampler2D uScene, uB1, uB2, uB3, uRays, uFlare; uniform vec2 uScreen; uniform vec2 uMotion;
uniform float uBloomK, uRaysK, uFlareK, uHalK, uTod, uTime, uLetter, uFade, uGrain, uVig, uChroma, uDirtK, uSat, uExpo; uniform vec3 uFadeC;
in vec2 vUV; out vec4 o;
float h12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float vn(vec2 p) { vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f); return mix(mix(h12(i), h12(i + vec2(1, 0)), u.x), mix(h12(i + vec2(0, 1)), h12(i + vec2(1, 1)), u.x), u.y); }
vec3 scene(vec2 uv) {
  vec2 cu = uv - 0.5; vec2 ca = cu * dot(cu, cu) * uChroma;
  if (length(uMotion) > 0.75) { vec3 c = vec3(0.0); for (int i = 0; i < 12; i++) { vec2 m = uMotion / uScreen * (float(i) / 11.0 - 0.5); c += vec3(texture(uScene, uv + m + ca).r, texture(uScene, uv + m).g, texture(uScene, uv + m - ca).b); } return c / 12.0; }
  return vec3(texture(uScene, uv + ca).r, texture(uScene, uv).g, texture(uScene, uv - ca).b);
}
void main() {
  vec2 uv = vUV; vec3 c = scene(uv); if (any(isnan(c))) c = vec3(0.0);
  vec3 b1 = texture(uB1, uv).rgb, b2 = texture(uB2, uv).rgb, b3 = texture(uB3, uv).rgb;
  float dirt = smoothstep(0.55, 0.85, vn(uv * vec2(5.0, 3.0) + 3.7)) * 0.7 + smoothstep(0.72, 0.95, vn(uv * 23.0)) * 0.5;
  vec3 bloom = b1 * 0.45 + b2 * 0.75 + b3 * 1.0;
  c += bloom * uBloomK * (1.0 + dirt * uDirtK);
  c += b3 * vec3(1.0, 0.42, 0.22) * uHalK;
  c += texture(uRays, uv).rgb * uRaysK * (1.0 + dirt * uDirtK * 0.5);
  c += texture(uFlare, uv).rgb * vec3(0.55, 0.72, 1.0) * uFlareK;
  // grade by time of day: warm gold -> cool blue hour -> deep night
  float t = clamp(uTod, 0.0, 2.0);
  vec3 gain = t < 1.0 ? mix(vec3(1.05, 0.99, 0.93), vec3(0.95, 0.96, 1.06), t) : mix(vec3(0.95, 0.96, 1.06), vec3(0.90, 0.94, 1.10), t - 1.0);
  vec3 lift = t < 1.0 ? mix(vec3(0.018, 0.006, 0.02), vec3(0.01, 0.012, 0.04), t) : mix(vec3(0.01, 0.012, 0.04), vec3(0.008, 0.01, 0.035), t - 1.0);
  c = c * gain * uExpo + lift;
  c = mix(c, 1.0 - exp(-c * 1.35), 0.55);
  float l = dot(c, vec3(0.299, 0.587, 0.114)); c = mix(vec3(l), c, uSat);
  vec2 cu = uv - 0.5; c *= 1.0 - uVig * dot(cu * vec2(1.1, 1.3), cu * vec2(1.1, 1.3)) * 1.4;
  c += (h12(uv * uScreen + fract(uTime * 13.7) * 91.0) - 0.5) * uGrain;
  c = mix(c, uFadeC, uFade);
  float bar = uLetter; if (uv.y < bar || uv.y > 1.0 - bar) c = vec3(0.0);
  o = vec4(clamp(c, 0.0, 1.0), 1.0);
}`;
// generalized Kuwahara (4 sectors) – used once when the painted layers are baked, so backgrounds read as gouache
export const FS_KUWAHARA = `#version 300 es
precision highp float; uniform sampler2D uTex; uniform vec2 uTexel; in vec2 vUV; out vec4 o;
void main() {
  vec4 orig = texture(uTex, vUV);
  if (orig.a < 0.004) { o = vec4(0.0); return; }
  vec3 m[4]; vec3 s[4]; float am[4];
  for (int k = 0; k < 4; k++) { m[k] = vec3(0.0); s[k] = vec3(0.0); am[k] = 0.0; }
  const int R = 4;
  for (int j = -R; j <= R; j++) for (int i = -R; i <= R; i++) {
    vec4 t = texture(uTex, vUV + vec2(float(i), float(j)) * uTexel); vec3 c = t.a > 0.004 ? t.rgb / t.a : vec3(0.0);
    float w = t.a;
    if (i <= 0 && j <= 0) { m[0] += c * w; s[0] += c * c * w; am[0] += w; }
    if (i >= 0 && j <= 0) { m[1] += c * w; s[1] += c * c * w; am[1] += w; }
    if (i <= 0 && j >= 0) { m[2] += c * w; s[2] += c * c * w; am[2] += w; }
    if (i >= 0 && j >= 0) { m[3] += c * w; s[3] += c * c * w; am[3] += w; }
  }
  float best = 1e9; vec3 col = orig.rgb / max(orig.a, 0.004);
  for (int k = 0; k < 4; k++) {
    if (am[k] < 0.5) continue;
    vec3 mm = m[k] / am[k], vv = abs(s[k] / am[k] - mm * mm); float v = vv.r + vv.g + vv.b;
    if (v < best) { best = v; col = mm; }
  }
  o = vec4(col * orig.a, orig.a);
}`;

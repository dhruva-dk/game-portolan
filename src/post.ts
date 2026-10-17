// Frame pipeline: renderer, HDR targets, pass order, refraction/depth inputs for the water,
// ambient occlusion, light shafts, bloom, filmic grade, anti-aliasing, dynamic resolution.
//
// Each frame, at the dynamic render scale, into one HalfFloat colour + float depth target:
//   1. WORLD layer (shadow maps update here).
//   2. GTAO at half resolution from that depth, 4×4 bilateral denoise.
//   3. Capture for the water: copies of the opaque colour → u.tSceneColor and depth → u.tSceneDepth.
//   4. WATER, then OVER, over the opaque scene (no clear); they sample the copies, never their own target.
//   5. Bloom mip chain (five levels) of the finished HDR image; light shafts from its quarter-resolution level.
//   6. AO on opaque pixels, bloom, shafts, exposure, vignette, per-hour grade, AgX → display-encoded image.
//   7. FXAA + Catmull-Rom upscale to the canvas with film grain and dither; overlays on top at native resolution.
// MSAA was measured and rejected: ANGLE/Metal stores and reloads the multisampled buffers around the capture,
// costing ~5 ms at Retina scale. The render scale instead stays high (0.6–1.0 × device pixels), where FXAA
// plus Retina density keeps edges clean; thin geometry should still keep a one-pixel minimum width itself.
import * as THREE from 'three';
import type { Frame } from './main.ts';

/**
 * Render layers. WORLD: everything opaque plus transparents that must appear in reflections and
 * refraction (sky, glows, smoke). WATER: the ocean surface, drawn after the opaque scene is
 * captured so it can sample colour and depth. OVER: drawn after the water (trails, spray, rain,
 * foam particles, mist). GLOBE: only seen by the globe-menu camera.
 * The camera's layers are narrowed per pass: lights, and meshes that onBeforeRender hooks draw with the game
 * camera, must enable every layer (`layers.enableAll()`). Sky pixels are those left at the far plane: AO skips
 * them and light shafts shine through them. Bloom has no threshold, so glowing things (lanterns, beacons,
 * glints, trails, lightning) should write true HDR radiance, roughly 5–50× diffuse white, not clamped colour.
 */
export const LAYER = { WORLD: 0, WATER: 1, OVER: 2, GLOBE: 3 } as const;
const TRANSLUCENT = (1 << LAYER.WATER) | (1 << LAYER.OVER);

const textureLoader = new THREE.TextureLoader();
/** Load a texture bundled under src/assets (pass the URL imported from the file). */
export function loadTexture(url: string, srgb: boolean): THREE.Texture {
  const t = textureLoader.load(url);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}

// ---------------------------------------------------------------------------------------------
// Full-screen passes: one big triangle, GLSL3 RawShaderMaterials.
const VERT = /* glsl */ `
in vec3 position;
out vec2 vUv;
void main() {
  vUv = position.xy * 0.5 + 0.5;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}`;

function shader(frag: string, uniforms: Record<string, THREE.IUniform>, blending: THREE.Blending = THREE.NoBlending) {
  return new THREE.RawShaderMaterial({
    glslVersion: THREE.GLSL3, uniforms, vertexShader: VERT, blending, depthTest: false, depthWrite: false,
    fragmentShader: `precision highp float;\nprecision highp int;\nin vec2 vUv;\nlayout(location = 0) out vec4 outColor;\n${frag}`,
  });
}

function target(type: THREE.TextureDataType = THREE.HalfFloatType, format: THREE.PixelFormat = THREE.RGBAFormat) {
  return new THREE.WebGLRenderTarget(1, 1, { type, format, depthBuffer: false });
}

const LINEAR_DEPTH = /* glsl */ `
uniform float uCameraNear, uCameraFar;
float viewDepth(float d) { return uCameraNear * uCameraFar / (uCameraFar - d * (uCameraFar - uCameraNear)); }
`;

// Bilateral upsample of the half-resolution AO: bilinear weights sharpened by depth similarity, so
// occlusion never bleeds across silhouettes.
const AO_UPSAMPLE = /* glsl */ `
uniform sampler2D tAO;
uniform float uAOStrength;
float aoAt(vec2 uv, float z) {
  ivec2 size = textureSize(tAO, 0), m = size - 1;
  vec2 t = uv * vec2(size) - 0.5, f = fract(t);
  ivec2 b = ivec2(floor(t));
  vec2 s0 = texelFetch(tAO, clamp(b, ivec2(0), m), 0).rg;
  vec2 s1 = texelFetch(tAO, clamp(b + ivec2(1, 0), ivec2(0), m), 0).rg;
  vec2 s2 = texelFetch(tAO, clamp(b + ivec2(0, 1), ivec2(0), m), 0).rg;
  vec2 s3 = texelFetch(tAO, clamp(b + ivec2(1, 1), ivec2(0), m), 0).rg;
  vec4 w = vec4((1.0 - f.x) * (1.0 - f.y), f.x * (1.0 - f.y), (1.0 - f.x) * f.y, f.x * f.y);
  w /= 1e-3 + abs(vec4(s0.y, s1.y, s2.y, s3.y) - z) / z;
  return mix(1.0, dot(w, vec4(s0.x, s1.x, s2.x, s3.x)) / dot(w, vec4(1.0)), uAOStrength);
}
`;

// Ground-truth ambient occlusion (Jimenez et al. 2016, after XeGTAO) at half resolution, straight from the
// depth buffer: one slice of four steps per side, its angle and step offset from a 4×4 pattern that the
// denoise pass averages out exactly (sixteen slice directions per neighbourhood).
const GTAO_FRAG = /* glsl */ `
uniform sampler2D tDepth;
uniform vec2 uViewScale;
uniform float uPxPerUnit, uRadius, uFade;
${LINEAR_DEPTH}
const float PI = 3.14159265, HALF_PI = 1.57079633;
const int BAYER[16] = int[16](0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5);
ivec2 size, full;
vec3 viewPos(ivec2 p) {
  p = clamp(p, ivec2(0), size - 1);
  float z = viewDepth(texelFetch(tDepth, min(p * 2, full - 1), 0).r);
  return vec3(((vec2(p) + 0.5) / vec2(size) * 2.0 - 1.0) * uViewScale * z, -z);
}
void main() {
  full = textureSize(tDepth, 0);
  size = (full + 1) / 2;
  ivec2 p = ivec2(gl_FragCoord.xy);
  vec3 P = viewPos(p);
  float z = -P.z;
  // the radius grows with distance: decks keep fine contact shading, islands keep large-scale occlusion
  float radius = max(uRadius, z * 0.04);
  float rPx = min(radius * uPxPerUnit / z, float(size.y) * 0.15);
  float fade = 1.0 - smoothstep(0.5 * uFade, uFade, z);
  if (fade <= 0.0 || rPx < 2.0) { outColor = vec4(1.0, z, 0.0, 1.0); return; }
  // normal from the flatter neighbour on each axis (so silhouettes don't smear), never from off screen
  vec3 l = viewPos(p - ivec2(1, 0)), r = viewPos(p + ivec2(1, 0)), b = viewPos(p - ivec2(0, 1)), t = viewPos(p + ivec2(0, 1));
  bool useL = p.x > 0 && (p.x == size.x - 1 || abs(l.z - P.z) < abs(r.z - P.z));
  bool useB = p.y > 0 && (p.y == size.y - 1 || abs(b.z - P.z) < abs(t.z - P.z));
  vec3 N = normalize(cross(useL ? P - l : r - P, useB ? P - b : t - P));
  vec3 V = normalize(-P);
  float phi = (float(BAYER[(p.x & 3) | ((p.y & 3) << 2)]) + 0.5) / 16.0 * PI;
  float jit = (float(BAYER[((p.x + 2) & 3) | (((p.y + 1) & 3) << 2)]) + 0.5) / 16.0;
  vec3 dir = vec3(cos(phi), sin(phi), 0.0);
  vec3 ortho = dir - dot(dir, V) * V;
  vec3 axis = normalize(cross(ortho, V));
  vec3 pn = N - axis * dot(N, axis);
  float pnLen = max(length(pn), 1e-4);
  float cosN = clamp(dot(pn, V) / pnLen, 0.0, 1.0);
  float n = sign(dot(ortho, pn)) * acos(cosN);
  float low0 = cos(n + HALF_PI), low1 = cos(n - HALF_PI), h0 = low0, h1 = low1, falloff = 0.6 * radius;
  for (int k = 0; k < 4; k++) {
    float st = (float(k) + jit) / 4.0;
    ivec2 o = ivec2(round(dir.xy * (st * st * rPx + 1.3)));
    vec3 d0 = viewPos(p + o) - P, d1 = viewPos(p - o) - P;
    float l0 = max(length(d0), 1e-4), l1 = max(length(d1), 1e-4);
    h0 = max(h0, mix(low0, dot(d0, V) / l0, clamp((radius - l0) / falloff, 0.0, 1.0)));
    h1 = max(h1, mix(low1, dot(d1, V) / l1, clamp((radius - l1) / falloff, 0.0, 1.0)));
  }
  float a0 = n + clamp(-acos(h1) - n, -HALF_PI, HALF_PI), a1 = n + clamp(acos(h0) - n, -HALF_PI, HALF_PI);
  float vis = pnLen * (2.0 * cosN + 2.0 * (a0 + a1) * sin(n) - cos(2.0 * a0 - n) - cos(2.0 * a1 - n)) * 0.25;
  outColor = vec4(mix(1.0, pow(clamp(vis, 0.0, 1.0), 1.5), fade), z, 0.0, 1.0);
}`;

const DENOISE_FRAG = /* glsl */ `
uniform sampler2D tAO;
void main() {
  ivec2 p = ivec2(gl_FragCoord.xy), m = textureSize(tAO, 0) - 1;
  float z = texelFetch(tAO, p, 0).g, sum = 0.0, wsum = 0.0;
  for (int y = -2; y < 2; y++) for (int x = -2; x < 2; x++) {
    vec2 s = texelFetch(tAO, clamp(p + ivec2(x, y), ivec2(0), m), 0).rg;
    float w = max(0.0, 1.0 - abs(s.y - z) / (0.04 * z));
    sum += s.x * w;
    wsum += w;
  }
  outColor = vec4(sum / wsum, z, 0.0, 1.0);
}`;

const CAPTURE_FRAG = /* glsl */ `
layout(location = 1) out vec4 outDepth;
uniform sampler2D tColor, tDepth;
void main() {
  ivec2 p = ivec2(gl_FragCoord.xy);
  outColor = vec4(texelFetch(tColor, p, 0).rgb, 1.0);
  outDepth = vec4(texelFetch(tDepth, p, 0).r, 0.0, 0.0, 1.0);
}`;

// Bloom (Jimenez 2014): 13-tap downsample with a Karis average on the first level against fireflies,
// 3×3 tent upsample added into the level above.
const BLOOM_DOWN_FRAG = /* glsl */ `
uniform sampler2D tSrc;
uniform vec2 uTexel;
uniform bool uKaris;
vec3 tap(float x, float y) { return min(texture(tSrc, vUv + vec2(x, y) * uTexel).rgb, vec3(6e4)); }
float karis(vec3 c) { return uKaris ? 1.0 / (1.0 + dot(c, vec3(0.2126, 0.7152, 0.0722))) : 1.0; }
vec3 group(vec3 a, vec3 b, vec3 c, vec3 d) {
  float wa = karis(a), wb = karis(b), wc = karis(c), wd = karis(d);
  return (a * wa + b * wb + c * wc + d * wd) / (wa + wb + wc + wd);
}
void main() {
  vec3 a = tap(-2.0, 2.0), b = tap(0.0, 2.0), c = tap(2.0, 2.0), d = tap(-2.0, 0.0), e = tap(0.0, 0.0);
  vec3 f = tap(2.0, 0.0), g = tap(-2.0, -2.0), h = tap(0.0, -2.0), i = tap(2.0, -2.0);
  vec3 j = tap(-1.0, 1.0), k = tap(1.0, 1.0), l = tap(-1.0, -1.0), m = tap(1.0, -1.0);
  outColor = vec4(group(j, k, l, m) * 0.5 + (group(a, b, d, e) + group(b, c, e, f) + group(d, e, g, h) + group(e, f, h, i)) * 0.125, 1.0);
}`;

const BLOOM_UP_FRAG = /* glsl */ `
uniform sampler2D tSrc;
uniform vec2 uTexel;
void main() {
  vec2 x = vec2(uTexel.x, 0.0), y = vec2(0.0, uTexel.y);
  vec3 o = texture(tSrc, vUv).rgb * 4.0
    + (texture(tSrc, vUv + x).rgb + texture(tSrc, vUv - x).rgb + texture(tSrc, vUv + y).rgb + texture(tSrc, vUv - y).rgb) * 2.0
    + texture(tSrc, vUv + x + y).rgb + texture(tSrc, vUv - x - y).rgb + texture(tSrc, vUv + x - y).rgb + texture(tSrc, vUv - x + y).rgb;
  outColor = vec4(o / 16.0, 1.0);
}`;

// Light shafts: the bright sky (clouds included) around the light, then two radial blurs towards it,
// 16 × 16 effective taps along each ray.
const SHAFT_MASK_FRAG = /* glsl */ `
uniform sampler2D tColor, tAO;
uniform vec2 uLight;
uniform float uAspect, uSkyZ, uClamp;
void main() {
  float sky = smoothstep(0.9 * uSkyZ, 0.99 * uSkyZ, texture(tAO, vUv).g);
  vec2 d = (vUv - uLight) * vec2(uAspect, 1.0);
  outColor = vec4(min(texture(tColor, vUv).rgb, vec3(uClamp)) * sky * exp(-10.0 * dot(d, d)), 1.0);
}`;

const SHAFT_BLUR_FRAG = /* glsl */ `
uniform sampler2D tSrc;
uniform vec2 uLight;
uniform float uSpan, uAspect, uFalloff;
void main() {
  vec2 step = (uLight - vUv) * uSpan / 16.0, d = (vUv - uLight) * vec2(uAspect, 1.0);
  vec2 uv = vUv + step * fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
  vec3 sum = vec3(0.0);
  float w = 1.0, wsum = 0.0;
  for (int i = 0; i < 16; i++) {
    sum += texture(tSrc, uv).rgb * w;
    wsum += w;
    w *= 0.9;
    uv += step;
  }
  outColor = vec4(sum / wsum * exp(-uFalloff * dot(d, d)), 1.0); // rays thin out away from the light
}`;

// AO on pixels where the opaque scene is still what shows; exposure, bloom, shafts and vignette in
// scene-linear light; white balance, saturation, log contrast; AgX (Blender/Filament fit); split tone and
// lifted blacks in display space so shadows never crush. Main view: sRGB-encoded with luma in alpha for FXAA.
const TONEMAP_FRAG = /* glsl */ `
uniform sampler2D tScene, tDepth, tOpaqueDepth, tBloom, tShafts;
uniform float uBloom, uShaft, uExposure, uVignette, uSat, uContrast;
uniform vec3 uWhite, uLift, uShadowTint, uHighTint;
uniform bool uEncode;
${LINEAR_DEPTH}
${AO_UPSAMPLE}
const vec3 LUMA = vec3(0.2126, 0.7152, 0.0722);
vec3 agx(vec3 c) {
  const mat3 toRec2020 = mat3(0.6274, 0.0691, 0.0164, 0.3293, 0.9195, 0.0880, 0.0433, 0.0113, 0.8956);
  const mat3 fromRec2020 = mat3(1.6605, -0.1246, -0.0182, -0.5876, 1.1329, -0.1006, -0.0728, -0.0083, 1.1187);
  const mat3 inset = mat3(0.856627153315983, 0.137318972929847, 0.11189821299995, 0.0951212405381588, 0.761241990602591,
    0.0767994186031903, 0.0482516061458583, 0.101439036467562, 0.811302368396859);
  const mat3 outset = mat3(1.1271005818144368, -0.1413297634984383, -0.14132976349843826, -0.11060664309660323,
    1.157823702216272, -0.11060664309660294, -0.016493938717834573, -0.016493938717834257, 1.2519364065950405);
  c = inset * (toRec2020 * c);
  c = clamp((log2(max(c, 1e-10)) + 12.47393) / 16.5, 0.0, 1.0);
  vec3 c2 = c * c, c4 = c2 * c2;
  c = 15.5 * c4 * c2 - 40.14 * c4 * c + 31.96 * c4 - 6.868 * c2 * c + 0.4298 * c2 + 0.1191 * c - 0.00232;
  return clamp(fromRec2020 * pow(max(outset * c, 0.0), vec3(2.2)), 0.0, 1.0);
}
vec3 srgb(vec3 c) { return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }
void main() {
  ivec2 p = ivec2(gl_FragCoord.xy);
  vec4 scene = texelFetch(tScene, p, 0);
  vec3 c = scene.rgb;
  float d = texelFetch(tOpaqueDepth, p, 0).r;
  if (uAOStrength > 0.0 && d < 1.0 && d == texelFetch(tDepth, p, 0).r) c *= aoAt(vUv, viewDepth(d));
  c = mix(c, texture(tBloom, vUv).rgb, uBloom) + texture(tShafts, vUv).rgb * uShaft;
  vec2 v = (vUv - 0.5) * vec2(1.4, 1.1);
  c *= uExposure * (1.0 - uVignette * smoothstep(0.15, 0.75, length(v)));
  c *= uWhite;
  c = max(mix(vec3(dot(c, LUMA)), c, uSat), 0.0);
  c = 0.18 * pow(c / 0.18, vec3(uContrast));
  c = agx(c);
  c *= mix(uShadowTint, uHighTint, smoothstep(0.02, 0.5, dot(c, LUMA)));
  c = uLift + c * (1.0 - uLift);
  if (uEncode) {
    c = srgb(c);
    outColor = vec4(c, dot(c, LUMA));
  } else outColor = vec4(c, scene.a);
}`;

// FXAA 3.11 (quality, after Lottes) evaluated at each canvas pixel against the render-scale image, else a
// Catmull-Rom upscale (five bilinear taps); then film grain and a triangular dither of one 8-bit step so
// gradients never band.
const FINAL_FRAG = /* glsl */ `
uniform sampler2D tSrc;
uniform uint uFrame;
uniform float uGrain;
vec2 px;
float luma(vec2 uv) { return texture(tSrc, uv).a; }
vec3 catmullRom(vec2 uv) {
  vec2 size = 1.0 / px, pos = uv * size, c = floor(pos - 0.5) + 0.5, f = pos - c;
  vec2 w0 = f * (-0.5 + f * (1.0 - 0.5 * f)), w1 = 1.0 + f * f * (-2.5 + 1.5 * f);
  vec2 w2 = f * (0.5 + f * (2.0 - 1.5 * f)), w3 = f * f * (-0.5 + 0.5 * f), w12 = w1 + w2;
  vec2 t0 = (c - 1.0) * px, t3 = (c + 2.0) * px, t12 = (c + w2 / w12) * px;
  vec3 o = texture(tSrc, vec2(t12.x, t0.y)).rgb * (w12.x * w0.y) + texture(tSrc, vec2(t0.x, t12.y)).rgb * (w0.x * w12.y)
         + texture(tSrc, t12).rgb * (w12.x * w12.y) + texture(tSrc, vec2(t3.x, t12.y)).rgb * (w3.x * w12.y)
         + texture(tSrc, vec2(t12.x, t3.y)).rgb * (w12.x * w3.y);
  return o / (w12.x * w0.y + w0.x * w12.y + w12.x * w12.y + w3.x * w12.y + w12.x * w3.y);
}
vec3 fxaa(vec2 uv) {
  float m = luma(uv), n = luma(uv + vec2(0.0, px.y)), s = luma(uv - vec2(0.0, px.y));
  float e = luma(uv + vec2(px.x, 0.0)), w = luma(uv - vec2(px.x, 0.0));
  float hi = max(max(max(n, s), max(e, w)), m), lo = min(min(min(n, s), min(e, w)), m), range = hi - lo;
  if (range < max(0.0312, hi * 0.125)) return catmullRom(uv);
  float nw = luma(uv + vec2(-px.x, px.y)), ne = luma(uv + px), sw = luma(uv - px), se = luma(uv + vec2(px.x, -px.y));
  float sub = clamp(abs((2.0 * (n + s + e + w) + nw + ne + sw + se) / 12.0 - m) / range, 0.0, 1.0);
  sub = sub * sub * (3.0 - 2.0 * sub);
  sub *= sub * 0.75;
  bool horz = abs(nw + ne - 2.0 * n) + 2.0 * abs(w + e - 2.0 * m) + abs(sw + se - 2.0 * s)
           >= abs(nw + sw - 2.0 * w) + 2.0 * abs(n + s - 2.0 * m) + abs(ne + se - 2.0 * e);
  float l1 = horz ? s : w, l2 = horz ? n : e, stepLen = horz ? px.y : px.x;
  bool steep2 = abs(l2 - m) >= abs(l1 - m);
  float grad = 0.25 * max(abs(l1 - m), abs(l2 - m)), avg = 0.5 * ((steep2 ? l2 : l1) + m);
  if (!steep2) stepLen = -stepLen;
  vec2 along = horz ? vec2(px.x, 0.0) : vec2(0.0, px.y), base = uv + (horz ? vec2(0.0, stepLen) : vec2(stepLen, 0.0)) * 0.5;
  vec2 pn = base - along, pp = base + along;
  float en = luma(pn) - avg, ep = luma(pp) - avg;
  bool dn = abs(en) >= grad, dp = abs(ep) >= grad;
  const float STEPS[8] = float[8](1.5, 2.0, 2.0, 2.0, 2.0, 4.0, 8.0, 8.0);
  for (int i = 0; i < 8 && !(dn && dp); i++) {
    if (!dn) { pn -= along * STEPS[i]; en = luma(pn) - avg; dn = abs(en) >= grad; }
    if (!dp) { pp += along * STEPS[i]; ep = luma(pp) - avg; dp = abs(ep) >= grad; }
  }
  float distN = horz ? uv.x - pn.x : uv.y - pn.y, distP = horz ? pp.x - uv.x : pp.y - uv.y;
  bool good = ((distN < distP ? en : ep) < 0.0) != (m - avg < 0.0);
  float edge = good ? 0.5 - min(distN, distP) / (distN + distP) : 0.0;
  float off = max(edge, sub) * stepLen;
  return texture(tSrc, uv + (horz ? vec2(0.0, off) : vec2(off, 0.0))).rgb;
}
vec3 noise() {
  uvec3 v = uvec3(uvec2(gl_FragCoord.xy), uFrame) * 1664525u + 1013904223u;
  v.x += v.y * v.z; v.y += v.z * v.x; v.z += v.x * v.y;
  v ^= v >> 16u;
  v.x += v.y * v.z; v.y += v.z * v.x; v.z += v.x * v.y;
  return vec3(v) * (1.0 / 4294967296.0);
}
void main() {
  px = 1.0 / vec2(textureSize(tSrc, 0));
  vec3 c = clamp(fxaa(vUv), 0.0, 1.0), r = noise();
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c += (r.x - 0.5) * uGrain * 4.0 * l * (1.0 - l);
  outColor = vec4(c + (r.y + r.z - 1.0) / 255.0, 1.0);
}`;

// ---------------------------------------------------------------------------------------------
// Colour grade. Looks are keyed on the sun's elevation (degrees) along a morning and an evening track,
// so they follow the sky wherever the sun actually is; the storm look blends over the top.
// [white balance rgb, saturation, contrast, lift rgb (display), shadow tint rgb, highlight tint rgb]
type Look = readonly number[];
const NIGHT: Look = [0.82, 0.92, 1.12, 0.8, 1.22, 0.003, 0.005, 0.013, 0.85, 0.92, 1.15, 0.98, 1.0, 1.06];
const PREDAWN: Look = [0.88, 0.92, 1.1, 0.86, 1.1, 0.012, 0.012, 0.03, 0.9, 0.9, 1.1, 1.08, 0.98, 0.95];
const ROSE: Look = [1.0, 0.94, 1.04, 0.95, 1.0, 0.012, 0.008, 0.015, 0.94, 0.9, 1.1, 1.08, 0.97, 0.98];
const DAWN: Look = [1.05, 0.97, 1.0, 0.96, 0.96, 0.014, 0.01, 0.015, 0.98, 0.94, 1.08, 1.08, 1.0, 0.94];
const MORNING: Look = [1.0, 1.0, 1.0, 1.1, 1.06, 0.004, 0.006, 0.01, 0.96, 1.0, 1.04, 1.02, 1.01, 0.98];
const MIDDAY: Look = [1.0, 1.0, 1.0, 1.04, 1.12, 0.003, 0.004, 0.006, 0.97, 1.0, 1.03, 1.0, 1.0, 1.0];
const AFTERNOON: Look = [1.04, 1.0, 0.94, 1.08, 1.08, 0.004, 0.005, 0.007, 0.95, 1.0, 1.04, 1.04, 1.0, 0.95];
const GOLDEN: Look = [1.28, 1.0, 0.68, 1.22, 1.06, 0.006, 0.004, 0.003, 1.04, 0.98, 0.9, 1.12, 1.0, 0.8];
const SUNSET: Look = [1.2, 0.94, 0.82, 1.4, 1.12, 0.008, 0.003, 0.009, 0.96, 0.84, 1.1, 1.14, 0.95, 0.78];
const BLUE: Look = [0.82, 0.92, 1.2, 1.15, 1.08, 0.008, 0.012, 0.035, 0.85, 0.9, 1.2, 1.1, 0.98, 0.92];
const STORM: Look = [0.92, 1.0, 1.04, 0.75, 1.0, 0.02, 0.025, 0.03, 0.94, 1.0, 1.04, 0.96, 1.0, 1.04];
const MORNING_TRACK: [number, Look][] = [[-22, NIGHT], [-14, PREDAWN], [-5, ROSE], [3, DAWN], [25, MORNING], [50, MIDDAY]];
const EVENING_TRACK: [number, Look][] = [[-22, NIGHT], [-12, BLUE], [-2.5, SUNSET], [7, GOLDEN], [24, AFTERNOON], [45, MIDDAY]];
const DEG = 180 / Math.PI;

function addTrack(track: [number, Look][], e: number, weight: number, out: Float32Array): void {
  let i = 0;
  while (i < track.length - 2 && e > track[i + 1][0]) i++;
  const [e0, a] = track[i], [e1, b] = track[i + 1];
  const t = THREE.MathUtils.smoothstep(e, e0, e1);
  for (let k = 0; k < out.length; k++) out[k] += weight * (a[k] + (b[k] - a[k]) * t);
}

// ---------------------------------------------------------------------------------------------
/** The HDR scene target and the water's capture of it; one set per view (game, globe menu). */
class ViewTargets {
  readonly scene = new THREE.WebGLRenderTarget(1, 1, {
    type: THREE.HalfFloatType, depthTexture: new THREE.DepthTexture(1, 1, THREE.FloatType),
  });
  /** [opaque colour × AO, raw depth], so WATER/OVER never sample the target they draw into */
  readonly capture = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, depthBuffer: false, count: 2 });

  constructor() {
    const depth = this.capture.textures[1];
    depth.type = THREE.FloatType;
    depth.format = THREE.RedFormat;
    depth.minFilter = depth.magFilter = THREE.NearestFilter;
  }

  setSize(w: number, h: number): void {
    this.scene.setSize(w, h);
    this.capture.setSize(w, h);
  }
}

const MIN_STEP = 10, MAX_STEP = 20; // render scale in twentieths of the canvas resolution
const PROBE_SECONDS = 5; // after the first frame the scale climbs quickly to find what the GPU sustains
const GLOBE_EXPOSURE = 1;

export class Pipeline {
  readonly renderer: THREE.WebGLRenderer;
  /**
   * Inputs for WATER/OVER shaders, spread by reference (`uniforms: { ...ctx.pipeline.u }`); valid for the view
   * being rendered (the game, or the globe inside renderView):
   *   tSceneColor  opaque scene of this frame, linear HDR (sky included, OVER-layer clouds not)
   *   tSceneDepth  its depth, raw [0,1] perspective (1 = sky); view distance =
   *                uCameraNear * uCameraFar / (uCameraFar - d * (uCameraFar - uCameraNear))
   *   uResolution  pixel size of the scene target: uv = gl_FragCoord.xy / uResolution (≠ canvas size: dynamic scale)
   *   uCameraNear, uCameraFar  of the camera being rendered
   */
  readonly u = {
    tSceneColor: { value: null as THREE.Texture | null },
    tSceneDepth: { value: null as THREE.Texture | null },
    uResolution: { value: new THREE.Vector2(1, 1) },
    uCameraNear: { value: 0.1 },
    uCameraFar: { value: 1000 },
  };
  /**
   * Drawn after post-processing onto the canvas at full device resolution (HUD, globe menu), with autoClear
   * off. The canvas has no MSAA: give overlay shapes analytic anti-aliased edges.
   */
  readonly overlays: Array<(r: THREE.WebGLRenderer, f: Frame) => void> = [];

  private readonly view = new ViewTargets();
  private readonly globe = new ViewTargets();
  private readonly ao = [target(THREE.HalfFloatType, THREE.RGFormat), target(THREE.HalfFloatType, THREE.RGFormat)];
  private readonly shafts = [target(), target()];
  private readonly bloom = Array.from({ length: 5 }, () => target());
  private readonly ldr = target();

  private readonly quad: THREE.Mesh;
  private readonly quadCamera = new THREE.Camera();
  private readonly gtaoPass = shader(GTAO_FRAG, {
    ...this.u, tDepth: { value: null }, uViewScale: { value: new THREE.Vector2() }, uPxPerUnit: { value: 0 },
    uRadius: { value: 0.9 }, uFade: { value: 260 },
  });
  private readonly denoisePass = shader(DENOISE_FRAG, { tAO: { value: this.ao[0].texture } });
  private readonly capturePass = shader(CAPTURE_FRAG, { tColor: { value: null }, tDepth: { value: null } });
  private readonly downPass = shader(BLOOM_DOWN_FRAG, { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() }, uKaris: { value: false } });
  private readonly upPass = shader(BLOOM_UP_FRAG, { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() } }, THREE.AdditiveBlending);
  private readonly shaftMaskPass = shader(SHAFT_MASK_FRAG, {
    tColor: { value: this.bloom[1].texture }, tAO: { value: this.ao[1].texture }, uLight: { value: new THREE.Vector2() },
    uAspect: { value: 1 }, uSkyZ: { value: 1 }, uClamp: { value: 1 },
  });
  private readonly shaftBlurPass = shader(SHAFT_BLUR_FRAG, {
    tSrc: { value: null }, uLight: { value: new THREE.Vector2() }, uSpan: { value: 1 }, uAspect: { value: 1 }, uFalloff: { value: 0 },
  });
  private readonly tonemapPass = shader(TONEMAP_FRAG, {
    ...this.u, tAO: { value: this.ao[1].texture }, uAOStrength: { value: 0 }, tScene: { value: null }, tDepth: { value: null },
    tOpaqueDepth: { value: null },
    tBloom: { value: this.bloom[0].texture }, tShafts: { value: this.shafts[0].texture }, uBloom: { value: 0 }, uShaft: { value: 0 }, uExposure: { value: 1 },
    uVignette: { value: 0 }, uSat: { value: 1 }, uContrast: { value: 1 }, uWhite: { value: new THREE.Vector3(1, 1, 1) },
    uLift: { value: new THREE.Vector3() }, uShadowTint: { value: new THREE.Vector3(1, 1, 1) },
    uHighTint: { value: new THREE.Vector3(1, 1, 1) }, uEncode: { value: true },
  });
  private readonly finalPass = shader(FINAL_FRAG, { tSrc: { value: this.ldr.texture }, uFrame: { value: 0 }, uGrain: { value: 0 } });

  private readonly look = new Float32Array(14);
  private readonly up = new THREE.Vector3();
  private readonly lightView = new THREE.Vector3();
  private flash = 0; // eye adaptation to lightning: lags the flash, then dims the scene briefly
  private frame = 0;

  // Dynamic resolution from frame times (GPU timer queries on ANGLE/Metal read ~3× high, so they cannot steer it)
  private readonly native = new THREE.Vector2(1, 1);
  private step = 14;
  private clock = 0; // seconds since the first frame
  private ceiling = MAX_STEP; // a scale that dropped frames is not retried until the ceiling expires
  private ceilingTime = 0;
  private calm = 0; // seconds without a slow frame
  private sinceRise = Infinity;
  private slow = 0; // slow frames in the last half second or so (exponentially decayed count)
  private hold = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, powerPreference: 'high-performance' });
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.shadowMap.autoUpdate = false; // once per frame, in the WORLD pass
    const tri = new THREE.BufferGeometry();
    tri.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
    this.quad = new THREE.Mesh(tri);
    this.quad.frustumCulled = false;
    this.u.tSceneColor.value = this.view.capture.textures[0];
    this.u.tSceneDepth.value = this.view.capture.textures[1];
  }

  /** Canvas size in CSS pixels. */
  setSize(width: number, height: number): void {
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.setSize(width, height, false);
    this.renderer.getDrawingBufferSize(this.native);
    this.resize();
  }

  render(scene: THREE.Scene, camera: THREE.PerspectiveCamera, f: Frame): void {
    const r = this.renderer, env = f.env, view = this.view, mask = camera.layers.mask;
    this.adapt(f.dt);
    r.shadowMap.needsUpdate = true;
    this.opaque(scene, camera, view, 1 << LAYER.WORLD);

    // ambient occlusion at half resolution
    const g = this.gtaoPass.uniforms, e = camera.projectionMatrix.elements;
    g.tDepth.value = view.scene.depthTexture;
    g.uViewScale.value.set(1 / e[0], 1 / e[5]);
    g.uPxPerUnit.value = 0.5 * this.ao[0].height * e[5];
    this.draw(this.gtaoPass, this.ao[0]);
    this.draw(this.denoisePass, this.ao[1]);
    this.capture(view);
    this.translucent(scene, camera, view, TRANSLUCENT);
    camera.layers.mask = mask;

    // bloom chain; shafts read its quarter-resolution level
    const down = this.downPass.uniforms;
    for (let i = 0; i < this.bloom.length; i++) {
      const src = i === 0 ? view.scene : this.bloom[i - 1];
      down.tSrc.value = src.texture;
      down.uTexel.value.set(1 / src.width, 1 / src.height);
      down.uKaris.value = i === 0;
      this.draw(this.downPass, this.bloom[i]);
    }
    const sunE = this.elevation(env.sunDir, f.focus);
    // 0 through the morning, 1 through the evening, crossing over at noon and midnight
    const evening = THREE.MathUtils.smoothstep(Math.sin(((env.hour - 12) / 12) * Math.PI), -0.5, 0.5);
    this.lightShafts(camera, f, sunE, evening);
    const up = this.upPass.uniforms;
    r.autoClear = false;
    for (let i = this.bloom.length - 1; i > 0; i--) {
      up.tSrc.value = this.bloom[i].texture;
      up.uTexel.value.set(1 / this.bloom[i].width, 1 / this.bloom[i].height);
      this.draw(this.upPass, this.bloom[i - 1]);
    }
    r.autoClear = true;

    // grade and tone map at render scale, then anti-alias and upscale to the canvas
    this.look.fill(0);
    addTrack(MORNING_TRACK, sunE, 1 - evening, this.look);
    addTrack(EVENING_TRACK, sunE, evening, this.look);
    // the storm look is for being under it; from high up it is just weather on the globe
    const under = env.storm * (1 - THREE.MathUtils.smoothstep(camera.position.distanceTo(f.focus), 200, 500));
    for (let k = 0; k < this.look.length; k++) this.look[k] += (STORM[k] - this.look[k]) * 0.85 * under;
    this.flash += (env.lightning - this.flash) * (1 - Math.exp(-f.dt / (env.lightning > this.flash ? 0.15 : 0.9)));
    const t = this.tonemapPass.uniforms;
    t.uAOStrength.value = 0.85;
    t.uBloom.value = (0.04 + 0.05 * env.night + 0.02 * env.storm + 0.25 * env.lightning) / this.bloom.length;
    t.uVignette.value = 0.2 + 0.1 * Math.max(env.night, under);
    this.tonemap(view, env.exposure / (1 + 0.8 * this.flash), true, this.ldr);
    const fin = this.finalPass.uniforms;
    fin.uFrame.value = this.frame++;
    fin.uGrain.value = 0.012 + 0.01 * env.night;
    this.draw(this.finalPass, null);

    r.autoClear = false;
    for (const o of this.overlays) o(r, f);
    r.autoClear = true;
  }

  /**
   * Render the world from another camera (the globe menu) into `target`: lit, tone-mapped and graded like a
   * neutral day at a fixed exposure, so both hemispheres read. Draws the camera's enabled layers (WORLD/GLOBE,
   * then WATER/OVER over them) at the target's size. Writes linear display colour (sample it as-is, no further
   * tone mapping); alpha is what the scene wrote over the renderer's clear alpha.
   */
  renderView(scene: THREE.Scene, camera: THREE.PerspectiveCamera, target: THREE.WebGLRenderTarget): void {
    const view = this.globe, mask = camera.layers.mask;
    if (view.scene.width !== target.width || view.scene.height !== target.height) view.setSize(target.width, target.height);
    this.opaque(scene, camera, view, mask & ~TRANSLUCENT);
    this.capture(view);
    this.translucent(scene, camera, view, mask & TRANSLUCENT);
    camera.layers.mask = mask;
    this.look.set(MIDDAY);
    const t = this.tonemapPass.uniforms;
    t.uBloom.value = t.uShaft.value = t.uVignette.value = t.uAOStrength.value = 0;
    this.tonemap(view, GLOBE_EXPOSURE, false, target);
  }

  private opaque(scene: THREE.Scene, camera: THREE.PerspectiveCamera, view: ViewTargets, layers: number): void {
    const u = this.u;
    u.tSceneColor.value = view.capture.textures[0];
    u.tSceneDepth.value = view.capture.textures[1];
    u.uResolution.value.set(view.scene.width, view.scene.height);
    u.uCameraNear.value = camera.near;
    u.uCameraFar.value = camera.far;
    camera.layers.mask = layers;
    this.renderer.setRenderTarget(view.scene);
    this.renderer.render(scene, camera);
  }

  private capture(view: ViewTargets): void {
    const c = this.capturePass.uniforms;
    c.tColor.value = view.scene.texture;
    c.tDepth.value = view.scene.depthTexture;
    this.draw(this.capturePass, view.capture);
  }

  /** Draws over the opaque scene without clearing it; the background was drawn by the opaque pass. */
  private translucent(scene: THREE.Scene, camera: THREE.PerspectiveCamera, view: ViewTargets, layers: number): void {
    const r = this.renderer, background = scene.background;
    camera.layers.mask = layers;
    scene.background = null;
    scene.matrixWorldAutoUpdate = false;
    r.autoClear = false;
    r.setRenderTarget(view.scene);
    r.render(scene, camera);
    r.autoClear = true;
    scene.matrixWorldAutoUpdate = true;
    scene.background = background;
  }

  private tonemap(view: ViewTargets, exposure: number, encode: boolean, out: THREE.WebGLRenderTarget): void {
    const t = this.tonemapPass.uniforms, l = this.look;
    t.tScene.value = view.scene.texture;
    t.tDepth.value = view.scene.depthTexture;
    t.tOpaqueDepth.value = view.capture.textures[1];
    t.uExposure.value = exposure;
    t.uEncode.value = encode;
    t.uWhite.value.set(l[0], l[1], l[2]);
    t.uSat.value = l[3];
    t.uContrast.value = l[4];
    t.uLift.value.set(l[5], l[6], l[7]);
    t.uShadowTint.value.set(l[8], l[9], l[10]);
    t.uHighTint.value.set(l[11], l[12], l[13]);
    this.draw(this.tonemapPass, out);
  }

  private lightShafts(camera: THREE.PerspectiveCamera, f: Frame, sunE: number, evening: number): void {
    const env = f.env, t = this.tonemapPass.uniforms;
    let strength: number;
    if (sunE > -4) {
      // strongest with a low sun, still there (weaker) when it stands high; richer in the evening
      strength = THREE.MathUtils.smoothstep(sunE, -3, 2) * (1 - 0.7 * THREE.MathUtils.smoothstep(sunE, 12, 40)) * (0.75 + 0.25 * evening);
      this.lightView.copy(env.sunDir);
    } else {
      strength = 0.35 * THREE.MathUtils.smoothstep(this.elevation(env.moonDir, f.focus), 0, 8);
      this.lightView.copy(env.moonDir);
    }
    // the storm smothers them; breaks in the clearing, still-wet sky afterwards make them sing
    strength *= (1 - 0.85 * env.storm) * (1 + 1.5 * env.wet * (1 - env.storm));
    const v = this.lightView.transformDirection(camera.matrixWorldInverse);
    t.uShaft.value = strength * THREE.MathUtils.smoothstep(-v.z, 0, 0.5) * 0.35;
    if (t.uShaft.value < 1e-3) {
      t.uShaft.value = 0;
      return;
    }
    const e = camera.projectionMatrix.elements, m = this.shaftMaskPass.uniforms;
    m.uLight.value.set(0.5 - (0.5 * (e[0] * v.x + e[8] * v.z)) / v.z, 0.5 - (0.5 * (e[5] * v.y + e[9] * v.z)) / v.z);
    m.uAspect.value = camera.aspect;
    m.uSkyZ.value = camera.far;
    m.uClamp.value = 6 / Math.max(env.exposure, 1e-3);
    this.draw(this.shaftMaskPass, this.shafts[0]);
    const b = this.shaftBlurPass.uniforms;
    b.uLight.value.copy(m.uLight.value);
    b.uAspect.value = camera.aspect;
    b.tSrc.value = this.shafts[0].texture;
    b.uSpan.value = 1;
    b.uFalloff.value = 0;
    this.draw(this.shaftBlurPass, this.shafts[1]);
    b.tSrc.value = this.shafts[1].texture;
    b.uSpan.value = 1 / 16;
    b.uFalloff.value = 2.5;
    this.draw(this.shaftBlurPass, this.shafts[0]);
  }

  /** Elevation in degrees of a direction above the player's horizon. */
  private elevation(dir: THREE.Vector3, focus: THREE.Vector3): number {
    return Math.asin(THREE.MathUtils.clamp(dir.dot(this.up.copy(focus).normalize()), -1, 1)) * DEG;
  }

  private draw(material: THREE.Material, target: THREE.WebGLRenderTarget | null): void {
    this.quad.material = material;
    this.renderer.setRenderTarget(target);
    this.renderer.render(this.quad, this.quadCamera);
  }

  // -------------------------------------------------------------------------------------------
  // Dynamic resolution in 5 % steps, from frame times alone. Two slow frames within about half a second drop a
  // step at once; the scale rises a step only after 10 s without a slow frame, and a scale that failed soon
  // after a rise stays barred for a minute. In the first seconds (behind the loader and the opening shot) it
  // rises every half second of calm to find what the GPU sustains. Targets are resized, not pre-allocated:
  // measured on ANGLE/Metal, a resize costs no frame, and the sky sizes its cloud buffers from them.
  private resize(): void {
    const w = Math.max(1, Math.round((this.native.x * this.step) / MAX_STEP));
    const h = Math.max(1, Math.round((this.native.y * this.step) / MAX_STEP));
    this.view.setSize(w, h);
    this.ldr.setSize(w, h);
    const hw = Math.ceil(w / 2), hh = Math.ceil(h / 2);
    for (const t of this.ao) t.setSize(hw, hh);
    for (const t of this.shafts) t.setSize(Math.ceil(w / 4), Math.ceil(h / 4));
    for (let i = 0; i < this.bloom.length; i++) this.bloom[i].setSize(Math.max(1, w >> (i + 1)), Math.max(1, h >> (i + 1)));
  }

  private adapt(dt: number): void {
    this.clock += dt;
    // a GPU that cannot keep up misses one vsync at a time; longer frames are stalls (uploads, streaming,
    // garbage collection) that a lower resolution would not cure, and so are the frames catching up after them
    this.hold -= dt;
    if (dt >= 1 / 25) this.hold = Math.max(this.hold, 0.4);
    this.slow = this.slow * Math.exp(-dt / 0.5) + (dt > 1 / 50 && this.hold <= 0 ? 1 : 0);
    this.calm = this.slow > 0.5 ? 0 : this.calm + dt;
    this.sinceRise += dt;
    this.ceilingTime -= dt;
    if (this.ceilingTime <= 0) this.ceiling = MAX_STEP;
    let next = this.step;
    if (this.slow > 1.8 && this.step > MIN_STEP && this.hold <= 0) {
      next = this.step - 1;
      this.ceiling = next;
      this.ceilingTime = this.sinceRise < 8 && this.clock > PROBE_SECONDS ? 60 : 15;
      this.hold = 0.3; // let the frames already queued at the old scale drain before judging again
    } else if (this.calm > (this.clock < PROBE_SECONDS ? 0.5 : 10) && this.step < this.ceiling) {
      next = this.step + 1;
      this.sinceRise = 0;
    }
    if (next === this.step) return;
    this.step = next;
    this.slow = 0;
    this.calm = 0;
    this.resize();
  }
}

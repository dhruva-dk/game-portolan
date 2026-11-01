// The sea: a mirror with a planar reflection, swell the ships ride, a seabed seen through the shallows, shore foam,
// a wake map the hulls write into (it glows at night), and rain rings in a squall.
import * as THREE from 'three';
import { FLOW, HALF, type World } from '../world.ts';
import { INK } from '../territory.ts';
import { GLOBE, LAYER, U, type Textures } from './engine.ts';

// ---------------------------------------------------------------- swell, shared by the GPU and the hulls

const SWELL: [number, number, number][] = [
  // direction (radians), wavelength (m), amplitude (m)
  [0.35, 26, 0.2],
  [1.45, 15, 0.11],
  [-0.75, 9.5, 0.065],
  [2.5, 5.8, 0.035],
];
const WAVES = SWELL.map(([a, L, A]) => {
  const k = (Math.PI * 2) / L;
  return { dx: Math.cos(a), dz: Math.sin(a), k, w: Math.sqrt(9.81 * k), A };
});
export const swell = { chop: 1 };

/** Height of the swell at a point; ships ride this, the water mesh draws it. */
export function waveHeight(x: number, z: number, t: number): number {
  let h = 0;
  for (const v of WAVES) h += Math.sin((v.dx * x + v.dz * z) * v.k - v.w * t) * v.A;
  return h * swell.chop;
}

/** The slope of the swell (dh/dx, dh/dz), for pitching and rolling hulls. */
export function waveSlope(x: number, z: number, t: number): [number, number] {
  let sx = 0, sz = 0;
  for (const v of WAVES) {
    const c = Math.cos((v.dx * x + v.dz * z) * v.k - v.w * t) * v.A * v.k;
    sx += c * v.dx;
    sz += c * v.dz;
  }
  return [sx * swell.chop, sz * swell.chop];
}

const WAVE_GLSL = /* glsl */ `
const vec4 WAVE[4] = vec4[4](${WAVES.map((v) => `vec4(${v.dx.toFixed(5)}, ${v.dz.toFixed(5)}, ${v.k.toFixed(5)}, ${v.w.toFixed(5)})`).join(', ')});
const float AMP[4] = float[4](${WAVES.map((v) => v.A.toFixed(4)).join(', ')});
vec3 swellAt(vec2 p, float t, float chop, float dist) {
  float h = 0.0; vec2 s = vec2(0.0);
  for (int i = 0; i < 4; i++) {
    float L = 6.2832 / WAVE[i].z;
    float a = AMP[i] * smoothstep(L * 16.0, L * 6.0, dist); // short waves fade before the mesh coarsens
    float ph = dot(WAVE[i].xy, p) * WAVE[i].z - WAVE[i].w * t;
    h += sin(ph) * a;
    s += WAVE[i].xy * cos(ph) * a * WAVE[i].z;
  }
  return vec3(h, s) * chop;
}`;

// ---------------------------------------------------------------- the water surface

const WATER_VERT = /* glsl */ `${GLOBE}
uniform float uTime, uChop;
varying vec3 vWP, vGP;
varying vec2 vSlope;
${WAVE_GLSL}
#include <fog_pars_vertex>
void main() {
  vec3 wp = (modelMatrix * vec4(position, 1.0)).xyz;
  vec3 sw = swellAt(wp.xz, uTime, uChop, length(wp.xz - cameraPosition.xz));
  wp.y = sw.x;
  vSlope = sw.yz;
  vWP = wp;
  vGP = globePos(wp);
  vec3 globeFlat = wp;
  vec4 mvPosition = viewMatrix * vec4(vGP, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;

const WATER_FRAG = /* glsl */ `${GLOBE}
uniform sampler2D uRefl, uWake, uHeight, uRipples;
uniform sampler2DArray uTerr;
uniform mat4 uTexMat;
uniform vec3 uDeep, uShallow, uSunColor, uHemiSky, uHemiGround;
uniform float uReflect, uChop, uRain, uHalf, uNight;
uniform vec2 uDrift;
uniform vec3 uWakeRect;
uniform sampler2D uInk, uFlow;
uniform vec3 uInkCol[25];
uniform float uInkMe;
varying vec3 vWP, vGP;
varying vec2 vSlope;
#include <fog_pars_fragment>
float hash12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
vec2 rainRings(vec2 p, float t) {
  vec2 cell = floor(p), acc = vec2(0.0);
  for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
    vec2 c = cell + vec2(i, j);
    float h = hash12(c);
    vec2 o = c + vec2(hash12(c + 1.7), hash12(c + 4.3));
    float ph = fract(t * 0.9 + h);
    vec2 d = p - o;
    float dist = length(d), r = ph * 0.9;
    float ring = sin((dist - r) * 30.0) * smoothstep(0.12, 0.0, abs(dist - r)) * (1.0 - ph);
    acc += d / max(dist, 1e-3) * ring;
  }
  return acc;
}
void main() {
  vec3 wp = vWP;
  // the water is lit in its own flat frame, with the eye and the sun turned back off the globe: night falls on the far side
  vec3 toEye = cameraPosition - vGP;
  float dist = length(toEye);
  vec3 V = globeUndir(wp, toEye / dist);
  vec3 sunL = globeUndir(wp, uSunDir);
  vec2 huv = (wp.xz + uHalf) / (2.0 * uHalf);
  float bed = texture(uHeight, huv).r;
  float depth = max(-bed, 0.0);
  // ripples: two scrolling layers, calmer with distance so the far sea mirrors the land
  float near = smoothstep(420.0, 20.0, dist);
  vec2 drift = uDrift;
  vec3 r1 = texture(uRipples, wp.xz * 0.045 + drift * 0.012).xyz * 2.0 - 1.0;
  vec3 r2 = texture(uRipples, wp.xz * 0.11 - drift * 0.02 + vec2(0.37, 0.11)).xyz * 2.0 - 1.0;
  vec2 rip = (r1.xy * 0.6 + r2.xy * 0.4) * (0.25 + 0.75 * near) * uChop;
  // the currents: the flow map holds each stream's direction (scaled by its strength) and its strength
  vec4 fl = texture(uFlow, (wp.xz + ${FLOW.half}.0) / ${2 * FLOW.half}.0);
  vec2 fv = fl.rg * 2.0 - 1.0;
  float fk = fl.b, flecks = 0.0, rim = 0.0;
  if (fk > 0.01) {
    // two layers of ripple and fleck dragged along the stream, each faded out as it resets (a flow map)
    float p0 = fract(uTime * 0.2), p1 = fract(uTime * 0.2 + 0.5), mixK = abs(1.0 - 2.0 * p0);
    vec2 run = fv * ${FLOW.speed.toFixed(1)} * 5.0, dir = fv / max(length(fv), 1e-3);
    vec2 a0 = wp.xz - run * p0, a1 = wp.xz - run * p1 + vec2(17.3, 5.1);
    vec3 fr = mix(texture(uRipples, a0 * 0.07).xyz, texture(uRipples, a1 * 0.07).xyz, mixK) * 2.0 - 1.0;
    rip = mix(rip, fr.xy * (0.5 + 0.5 * near) * 1.4, fk * 0.8);
    // flecks of foam, smeared a little along the stream
    float f0 = 0.0, f1 = 0.0;
    for (int i = 0; i < 4; i++) {
      f0 += texture(uNoise, (a0 - dir * float(i) * 1.5) * 0.13).r;
      f1 += texture(uNoise, (a1 - dir * float(i) * 1.5) * 0.13).r;
    }
    flecks = smoothstep(0.64, 0.78, mix(f0, f1, mixK) / 4.0) * smoothstep(0.15, 0.6, fk) * (0.35 + 0.65 * near);
    // and a broken line of foam where the stream shears past the still water at its edges
    rim = smoothstep(0.03, 0.12, fk) * smoothstep(0.3, 0.12, fk) * smoothstep(0.45, 0.65, texture(uNoise, a0 * 0.05).g);
  }
  // the wake map: foam in red, a bump in green
  vec2 wuv = vec2(wp.x - uWakeRect.x, uWakeRect.y - wp.z) / uWakeRect.z + 0.5; // the map's v runs toward -z
  float inWake = step(0.0, wuv.x) * step(wuv.x, 1.0) * step(0.0, wuv.y) * step(wuv.y, 1.0);
  vec4 wk = texture(uWake, wuv) * inWake;
  vec2 tx = vec2(1.0 / 512.0, 0.0);
  vec2 wbump = vec2(texture(uWake, wuv + tx.xy).g - texture(uWake, wuv - tx.xy).g, texture(uWake, wuv - tx.yx).g - texture(uWake, wuv + tx.yx).g) * inWake;
  vec2 rain = uRain > 0.01 && dist < 60.0 ? rainRings(wp.xz * 1.4, uTime) * uRain * smoothstep(60.0, 20.0, dist) : vec2(0.0);
  vec3 N = normalize(vec3(-vSlope.x - rip.x * 0.22 - wbump.x * 3.0 - rain.x * 0.3, 1.0, -vSlope.y - rip.y * 0.22 - wbump.y * 3.0 - rain.y * 0.3));
  // the shallows: a seabed of sand and pebbles seen through clear water, with caustics
  float shallow = exp(-depth * 0.32);
  vec2 bedXZ = wp.xz - V.xz / max(V.y, 0.2) * depth * 0.6 + N.xz * depth * 0.4;
  float bn = texture(uNoise, bedXZ * 0.03).r;
  vec3 sand = texture(uTerr, vec3(bedXZ * 0.25, ${LAYER.sand}.0)).rgb;
  vec3 peb = texture(uTerr, vec3(bedXZ * 0.32, ${LAYER.pebbles}.0)).rgb;
  vec3 bedAlb = mix(sand, peb, smoothstep(0.45, 0.65, bn)) * vec3(0.85, 0.95, 0.9);
  float c1 = texture(uNoise, bedXZ * 0.19 + uTime * vec2(0.021, 0.013)).g;
  float c2 = texture(uNoise, bedXZ * 0.23 - uTime * vec2(0.017, 0.024)).g;
  float caustic = pow(smoothstep(0.16, 0.0, abs(c1 - c2)), 2.0) * 1.6;
  vec3 bedLit = bedAlb * (uSunColor * max(sunL.y, 0.05) * (0.7 + caustic) + uHemiSky * 0.5);
  vec3 absorb = exp(-depth * vec3(0.55, 0.2, 0.16));
  vec3 body = mix(uDeep, uShallow, shallow * 0.8);
  vec3 under = mix(body * (0.35 + 0.65 * uSunColor * max(sunL.y, 0.15) + uHemiSky * 0.3), bedLit * absorb, shallow);
  // light scattered up through the swell's crests
  under += uShallow * uSunColor * pow(max(dot(-V, sunL), 0.0), 3.0) * 0.25 * (0.5 + vSlope.x * 2.0);
  // reflection
  vec4 rp = uTexMat * vec4(globePos(vec3(wp.x, 0.0, wp.z)), 1.0);
  vec2 ruv = rp.xy / rp.w + N.xz * (0.035 + 0.04 * near);
  vec3 refl = texture(uRefl, ruv).rgb;
  float fres = 0.02 + 0.98 * pow(1.0 - max(dot(N, V), 0.0), 5.0);
  fres = mix(fres, 1.0, 0.18) * uReflect;
  // seen from high above, the open ocean shows its depth instead of the sky
  fres *= mix(1.0, 0.3, smoothstep(250.0, 1400.0, cameraPosition.y));
  vec3 col = mix(under, refl, clamp(fres, 0.0, 1.0));
  // the sun on the water: a hot glint for the bloom, a broad sheen beneath it
  vec3 H = normalize(V + sunL);
  float nh = max(dot(N, H), 0.0);
  col += uSunColor * (pow(nh, 900.0) * 60.0 + pow(nh, 90.0) * 0.6) * (1.0 - uNight * 0.7);
  // foam: the shore line, waves running in, and what the hulls write
  float fn = texture(uNoise, wp.xz * 0.11 + vec2(uTime * 0.01, 0.0)).b;
  float shoreF = smoothstep(0.3, 0.02, depth + (fn - 0.5) * 0.3) * smoothstep(0.25, 0.6, fn);
  float band = smoothstep(0.8, 1.0, sin(depth * 4.0 - uTime * 1.6 + fn * 4.0)) * smoothstep(1.8, 0.3, depth) * smoothstep(0.35, 0.7, fn);
  // a stream runs a little greener and brighter than the sea round it
  col = mix(col, col * vec3(0.9, 1.14, 1.12) + uShallow * 0.08, fk * 0.55);
  float foam = clamp(shoreF * 0.8 + band * 0.35 + wk.r * smoothstep(0.35, 0.8, fn + wk.r * 0.35) + flecks * 0.55 + rim * 0.4, 0.0, 1.0);
  vec3 foamLit = vec3(0.92, 0.95, 0.97) * (uSunColor * max(sunL.y, 0.1) * 0.9 + uHemiSky * 0.7);
  col = mix(col, foamLit, foam * 0.85);
  // the captains' ink: held water washed in their colour and hatched like a chart, a pen line round its edge, and
  // the trails laid out from it bright enough to be seen across the sea (and cut)
  vec2 iuv = (wp.xz + ${INK.half}.0) / ${2 * INK.half}.0;
  if (iuv.x > 0.0 && iuv.y > 0.0 && iuv.x < 1.0 && iuv.y < 1.0) {
    vec2 q = iuv + (texture(uNoise, wp.xz * 0.045).rg - 0.5) * ${(INK.cell * 1.1) / (2 * INK.half)};
    vec2 ids = floor(texture(uInk, q).rg * 255.0 + 0.5);
    float tex = 1.0 / ${INK.n}.0 * 0.3;
    if (ids.x > 0.5) {
      float edge = 0.0;
      edge += step(0.5, abs(floor(texture(uInk, q + vec2(tex, 0.0)).r * 255.0 + 0.5) - ids.x));
      edge += step(0.5, abs(floor(texture(uInk, q - vec2(tex, 0.0)).r * 255.0 + 0.5) - ids.x));
      edge += step(0.5, abs(floor(texture(uInk, q + vec2(0.0, tex)).r * 255.0 + 0.5) - ids.x));
      edge += step(0.5, abs(floor(texture(uInk, q - vec2(0.0, tex)).r * 255.0 + 0.5) - ids.x));
      vec3 ic = uInkCol[int(ids.x)];
      float mine = 1.0 - step(0.5, abs(ids.x - uInkMe));
      float hatch = smoothstep(0.16, 0.04, abs(fract((wp.x - wp.z) * 0.18) - 0.5)) * (0.5 + 0.5 * fn);
      // a wash of the ink's hue at the water's own brightness, so it tints the sea rather than paints over it
      float lum = dot(col, vec3(0.299, 0.587, 0.114));
      col = mix(col, ic * lum * 2.0, 0.4 + mine * 0.1);
      col *= 1.0 - hatch * 0.3;
      col = mix(col, ic * lum * 0.7, clamp(edge, 0.0, 1.0) * 0.85);
    }
    if (ids.y > 0.5) {
      vec3 tc = uInkCol[int(ids.y)];
      float pulse = 0.75 + 0.25 * sin(uTime * 5.0 - (wp.x + wp.z) * 0.35);
      col = mix(col, tc * (1.2 + uNight * 0.8) * pulse, 0.72);
    }
  }
  // at night the disturbed water glows
  col += vec3(0.1, 0.75, 1.0) * (wk.r * 2.2 + shoreF * 0.35 + band * 0.4 + flecks * 0.8) * uNight * (0.6 + fn);
  // round the globe's far side, the sun has set
  col *= mix(0.05, 1.0, clamp(smoothstep(-0.3, 0.08, sunL.y) / max(smoothstep(-0.3, 0.08, uSunDir.y), 0.05), 0.0, 1.0));
  gl_FragColor = vec4(col, 1.0);
  #include <fog_fragment>
}`;

// ---------------------------------------------------------------- the wake map

const WAKE_DECAY = /* glsl */ `
uniform sampler2D tPrev; uniform vec2 uShift; uniform float uKeep; varying vec2 vUv;
void main() {
  vec2 uv = vUv + uShift, t = vec2(1.0 / 512.0, 0.0);
  vec4 c = texture(tPrev, uv) * 0.6 + (texture(tPrev, uv + t.xy) + texture(tPrev, uv - t.xy) + texture(tPrev, uv + t.yx) + texture(tPrev, uv - t.yx)) * 0.1;
  float inside = step(0.0, uv.x) * step(uv.x, 1.0) * step(0.0, uv.y) * step(uv.y, 1.0);
  gl_FragColor = vec4(c.r * uKeep, c.g * uKeep * 0.985, 0.0, 1.0) * inside;
}`;
const STAMP_VERT = /* glsl */ `
attribute vec4 aStamp; // x, z, radius, foam
attribute float aBump;
varying vec2 vQ;
varying float vFoam;
varying float vBump;
void main() {
  vQ = position.xy;
  vFoam = aStamp.w;
  vBump = aBump;
  vec3 p = vec3(aStamp.x + position.x * aStamp.z, 0.0, aStamp.y + position.y * aStamp.z);
  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
}`;
const STAMP_FRAG = /* glsl */ `
varying vec2 vQ;
varying float vFoam;
varying float vBump;
void main() {
  float d = length(vQ);
  if (d > 1.0) discard;
  float soft = smoothstep(1.0, 0.25, d);
  float ring = smoothstep(1.0, 0.7, d) * smoothstep(0.35, 0.75, d);
  gl_FragColor = vec4(vFoam * soft, vBump * ring, 0.0, 1.0);
}`;

const FS_VERT = /* glsl */ `varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;
const MAX_STAMPS = 768;
const WAKE_SIZE = 260; // metres the wake map spans
const WAKE_RES = 512;

class WakeMap {
  rt: [THREE.WebGLRenderTarget, THREE.WebGLRenderTarget];
  cur = 0;
  readonly rect = new THREE.Vector3(0, 0, WAKE_SIZE);
  private readonly cam = new THREE.OrthographicCamera(-WAKE_SIZE / 2, WAKE_SIZE / 2, WAKE_SIZE / 2, -WAKE_SIZE / 2, -10, 10);
  private readonly decay: THREE.ShaderMaterial;
  private readonly quadScene = new THREE.Scene();
  private readonly stampScene = new THREE.Scene();
  private readonly stampAttr: THREE.InstancedBufferAttribute;
  private readonly bumpAttr: THREE.InstancedBufferAttribute;
  private readonly stampGeo: THREE.InstancedBufferGeometry;
  private n = 0;
  constructor() {
    const opts = { type: THREE.HalfFloatType, depthBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter };
    this.rt = [new THREE.WebGLRenderTarget(WAKE_RES, WAKE_RES, opts), new THREE.WebGLRenderTarget(WAKE_RES, WAKE_RES, opts)];
    this.decay = new THREE.ShaderMaterial({ vertexShader: FS_VERT, fragmentShader: WAKE_DECAY, uniforms: { tPrev: { value: null }, uShift: { value: new THREE.Vector2() }, uKeep: { value: 0.99 } }, depthTest: false, depthWrite: false });
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.decay);
    quad.frustumCulled = false;
    this.quadScene.add(quad);
    this.stampGeo = new THREE.InstancedBufferGeometry();
    this.stampGeo.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0], 3));
    this.stampGeo.setIndex([0, 2, 1, 0, 3, 2]);
    this.stampAttr = new THREE.InstancedBufferAttribute(new Float32Array(MAX_STAMPS * 4), 4);
    this.bumpAttr = new THREE.InstancedBufferAttribute(new Float32Array(MAX_STAMPS), 1);
    this.stampAttr.setUsage(THREE.DynamicDrawUsage);
    this.bumpAttr.setUsage(THREE.DynamicDrawUsage);
    this.stampGeo.setAttribute('aStamp', this.stampAttr);
    this.stampGeo.setAttribute('aBump', this.bumpAttr);
    const stampMat = new THREE.ShaderMaterial({
      vertexShader: STAMP_VERT, fragmentShader: STAMP_FRAG, depthTest: false, depthWrite: false, side: THREE.DoubleSide,
      blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor, blendEquation: THREE.MaxEquation,
    });
    const stamps = new THREE.Mesh(this.stampGeo, stampMat);
    stamps.frustumCulled = false;
    this.stampScene.add(stamps);
    this.cam.position.set(0, 5, 0);
    this.cam.up.set(0, 0, -1);
    this.cam.lookAt(0, 0, 0);
  }
  stamp(x: number, z: number, r: number, foam: number, bump = 0): void {
    if (this.n >= MAX_STAMPS) return;
    this.stampAttr.setXYZW(this.n, x, z, r, foam);
    this.bumpAttr.setX(this.n, bump);
    this.n++;
  }
  update(renderer: THREE.WebGLRenderer, focus: THREE.Vector3, dt: number): void {
    const texel = WAKE_SIZE / WAKE_RES;
    const cx = Math.round(focus.x / texel) * texel, cz = Math.round(focus.z / texel) * texel;
    const prev = this.rt[this.cur], next = this.rt[1 - this.cur];
    // the map follows the focus; the old contents shift under it
    this.decay.uniforms.tPrev.value = prev.texture;
    this.decay.uniforms.uShift.value.set((cx - this.rect.x) / WAKE_SIZE, -(cz - this.rect.y) / WAKE_SIZE);
    this.decay.uniforms.uKeep.value = Math.pow(0.55, dt);
    this.rect.set(cx, cz, WAKE_SIZE);
    renderer.setRenderTarget(next);
    renderer.render(this.quadScene, this.cam);
    if (this.n) {
      this.cam.position.set(cx, 5, cz);
      this.cam.lookAt(cx, 0, cz);
      this.cam.updateMatrixWorld();
      this.stampGeo.instanceCount = this.n;
      this.stampAttr.addUpdateRange(0, this.n * 4);
      this.bumpAttr.addUpdateRange(0, this.n);
      this.stampAttr.needsUpdate = true;
      this.bumpAttr.needsUpdate = true;
      renderer.render(this.stampScene, this.cam);
      this.n = 0;
    }
    this.cur = 1 - this.cur;
  }
  get texture(): THREE.Texture {
    return this.rt[this.cur].texture;
  }
}

// ---------------------------------------------------------------- the water itself

export class Water {
  readonly mesh: THREE.Mesh;
  readonly wake = new WakeMap();
  /** The territory, owner in red and trail in green, a texel a cell; and each captain's ink colour, by id + 1. */
  readonly ink = new THREE.DataTexture(new Uint8Array(INK.n * INK.n * 2), INK.n, INK.n, THREE.RGFormat, THREE.UnsignedByteType);
  readonly inkCol = Array.from({ length: 25 }, () => new THREE.Color());
  /** The currents, from the world: direction times strength in red and green (signed, about a half), strength in blue. */
  readonly flow: THREE.DataTexture;
  private inkVersion = -1;
  private readonly u: Record<string, THREE.IUniform>;
  private refl: THREE.WebGLRenderTarget;
  private readonly mirror = new THREE.PerspectiveCamera();
  private readonly reflScale: number;
  rain = 0;

  constructor(tex: Textures, heightTex: THREE.Texture, sky: { hemi: THREE.HemisphereLight }, reflectScale: number, world: World) {
    this.reflScale = reflectScale;
    const fd = new Uint8Array(FLOW.n * FLOW.n * 4), f = world.flow;
    for (let i = 0; i < FLOW.n * FLOW.n; i++) {
      const k = f[i * 3 + 2];
      fd[i * 4] = Math.round((f[i * 3] * k * 0.5 + 0.5) * 255);
      fd[i * 4 + 1] = Math.round((f[i * 3 + 1] * k * 0.5 + 0.5) * 255);
      fd[i * 4 + 2] = Math.round(k * 255);
      fd[i * 4 + 3] = 255;
    }
    this.flow = new THREE.DataTexture(fd, FLOW.n, FLOW.n, THREE.RGBAFormat, THREE.UnsignedByteType);
    this.flow.magFilter = this.flow.minFilter = THREE.LinearFilter;
    this.flow.needsUpdate = true;
    this.refl = new THREE.WebGLRenderTarget(16, 16, { type: THREE.HalfFloatType, depthBuffer: true });
    this.ink.magFilter = this.ink.minFilter = THREE.NearestFilter;
    this.ink.generateMipmaps = false;
    // a disc whose rings widen with distance: fine near the hulls, coarse at the horizon
    const rings = 150, segs = 256, pos: number[] = [], idx: number[] = [];
    pos.push(0, 0, 0);
    for (let k = 1; k <= rings; k++) {
      const r = 0.9 * (Math.pow(1.04, k) - 1) / 0.04; // out to ~8 km
      for (let s = 0; s < segs; s++) {
        const a = (s / segs) * Math.PI * 2 + (k % 2) * (Math.PI / segs);
        pos.push(Math.cos(a) * r, 0, Math.sin(a) * r);
      }
    }
    for (let s = 0; s < segs; s++) idx.push(0, 1 + ((s + 1) % segs), 1 + s);
    for (let k = 1; k < rings; k++) for (let s = 0; s < segs; s++) {
      const a = 1 + (k - 1) * segs + s, b = 1 + (k - 1) * segs + ((s + 1) % segs), c = a + segs, d = b + segs;
      idx.push(a, b, c, b, d, c);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setIndex(idx);
    this.u = {
      ...U,
      uRefl: { value: this.refl.texture }, uWake: { value: this.wake.texture }, uHeight: { value: heightTex }, uRipples: { value: tex.ripples },
      uTerr: { value: tex.terrain }, uTexMat: { value: new THREE.Matrix4() }, uDeep: { value: new THREE.Color() }, uShallow: { value: new THREE.Color() },
      uHemiSky: { value: sky.hemi.color }, uHemiGround: { value: sky.hemi.groundColor }, uReflect: { value: 1 }, uChop: { value: 1 }, uRain: { value: 0 },
      uHalf: { value: HALF }, uWakeRect: { value: this.wake.rect },
      uInk: { value: this.ink }, uInkCol: { value: this.inkCol }, uInkMe: { value: 0 }, uFlow: { value: this.flow },
    };
    const mat = new THREE.ShaderMaterial({ vertexShader: WATER_VERT, fragmentShader: WATER_FRAG, uniforms: this.u, fog: true });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 1;
  }

  /** Copies the territory into its texture when it has changed; `me` is the player's id + 1. */
  setInk(owner: Uint8Array, trail: Uint8Array, version: number, me: number): void {
    this.u.uInkMe.value = me;
    if (version === this.inkVersion) return;
    this.inkVersion = version;
    const d = this.ink.image.data as Uint8Array;
    for (let i = 0; i < owner.length; i++) { d[i * 2] = owner[i]; d[i * 2 + 1] = trail[i]; }
    this.ink.needsUpdate = true;
  }

  /** Foam (and a little bump) into the wake map at a point. */
  stamp(x: number, z: number, r: number, foam: number, bump = 0): void {
    this.wake.stamp(x, z, r, foam, bump);
  }

  /** Renders the wake map and the reflection; call before the main render. */
  prepare(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.PerspectiveCamera, focus: THREE.Vector3, sky: { water: { deep: THREE.Color; shallow: THREE.Color; reflect: number; chop: number } }, width: number, height: number, dt: number): void {
    const u = this.u;
    u.uDeep.value.copy(sky.water.deep);
    u.uShallow.value.copy(sky.water.shallow);
    u.uReflect.value = sky.water.reflect;
    swell.chop = sky.water.chop * (1 + this.rain * 0.8);
    u.uChop.value = swell.chop;
    u.uRain.value = this.rain;
    this.wake.update(renderer, focus, dt);
    u.uWake.value = this.wake.texture;
    // follow the eye; snapping keeps the rings from swimming over the swell
    const snap = 4;
    this.mesh.position.set(Math.round(camera.position.x / snap) * snap, 0, Math.round(camera.position.z / snap) * snap);

    // the mirror camera, with its near plane bent onto the water (an oblique frustum, as in three's Reflector)
    const w = Math.max(16, Math.round(width * this.reflScale)), h = Math.max(16, Math.round(height * this.reflScale));
    if (this.refl.width !== w || this.refl.height !== h) this.refl.setSize(w, h);
    const m = this.mirror;
    camera.updateMatrixWorld();
    const eye = camera.position;
    if (eye.y <= 0.05) return;
    m.position.set(eye.x, -eye.y, eye.z);
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
    const upv = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion);
    fwd.y = -fwd.y;
    upv.y = -upv.y;
    m.up.copy(upv);
    m.lookAt(m.position.clone().add(fwd));
    m.near = camera.near;
    m.far = camera.far;
    m.updateMatrixWorld();
    m.projectionMatrix.copy(camera.projectionMatrix);
    m.projectionMatrixInverse.copy(camera.projectionMatrixInverse);
    u.uTexMat.value.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1).multiply(m.projectionMatrix).multiply(m.matrixWorldInverse);
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0.15).applyMatrix4(m.matrixWorldInverse);
    const clip = new THREE.Vector4(plane.normal.x, plane.normal.y, plane.normal.z, plane.constant);
    const e = m.projectionMatrix.elements;
    const q = new THREE.Vector4((Math.sign(clip.x) + e[8]) / e[0], (Math.sign(clip.y) + e[9]) / e[5], -1, (1 + e[10]) / e[14]);
    clip.multiplyScalar(2 / clip.dot(q));
    e[2] = clip.x; e[6] = clip.y; e[10] = clip.z + 1; e[14] = clip.w;
    m.layers.set(0);
    this.mesh.visible = false;
    renderer.setRenderTarget(this.refl);
    renderer.setClearColor(0x000000, 1);
    renderer.clear(true, true, false);
    renderer.render(scene, m);
    this.mesh.visible = true;
  }
}

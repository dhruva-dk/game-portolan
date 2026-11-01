// The sea on the sphere, ported from the rewrite's src/gfx/water.ts: a swell the hulls ride, ripples, a planar
// reflection, the sun's glint, a wake map the hulls write foam into (it glows at night), rain rings, and the
// captains' colours on the water they hold.
//
// The surface is a sphere at sea level plus the tide, drawn as a polar grid around the point under the camera: rings
// close together near the eye and wider toward the horizon, out to the far side of the planet, so the same mesh
// holds from the deck and from orbit (where the limb is one of its rings). It is see-through: everything under the
// waterline is drawn first and darkened by the water above it (planet.ts underSea), which gives the depth colour,
// the shallows and the sea floor; the surface adds the reflection and the foam on top, by its Fresnel term.
import * as THREE from 'three';
import { GRID, R, faceDir, faceUV, type FaceUV } from '../sim/sphere.ts';
import { v3, type V3 } from '../sim/math.ts';
import { REGIONS, regionMix, type RegionId, type RegionMix } from '../sim/world/index.ts';
import { U, type Textures } from './engine.ts';
import { SWELL_GLSL, swell } from './swell.ts';

// ---------------------------------------------------------------- each region's water

/** Each region's sea: its colour in deep water (sRGB) and how clear it is (0 murky to 1 glass). */
export const REGION_WATER: Record<RegionId, [number, number]> = {
  iceCrown: [0x0e3448, 0.75], fjords: [0x0c3036, 0.5], mistwood: [0x15342c, 0.35], spires: [0x0f3a46, 0.6],
  narrows: [0x1c3c38, 0.45], basaltStacks: [0x0b2832, 0.5], kelpShallows: [0x1e3c20, 0.4], blossomRun: [0x114450, 0.65],
  glassSea: [0x1c9098, 1], jadeShoals: [0x22805e, 0.85], coralAtolls: [0x1696a8, 0.95], spiceIsles: [0x125650, 0.6],
  fireArchipelago: [0x16262c, 0.45], weepingIsle: [0x18382c, 0.4], mangroveLabyrinth: [0x32381a, 0.15], maelstrom: [0x0d1e2a, 0.4],
};

const TINT_W = 512, TINT_H = 256;

/** The sea's colour and clarity over the planet, blended across region borders like the land. */
function seaTintTexture(): THREE.DataTexture {
  const tex = new THREE.DataTexture(new Uint8Array(TINT_W * TINT_H * 4), TINT_W, TINT_H, THREE.RGBAFormat, THREE.UnsignedByteType);
  tex.magFilter = tex.minFilter = THREE.LinearFilter;
  tex.wrapS = THREE.RepeatWrapping;
  tex.colorSpace = THREE.NoColorSpace;
  return tex;
}

function fillSeaTint(tex: THREE.DataTexture): void {
  const d = tex.image.data as Uint8Array, p = v3(), mix: RegionMix = { a: 0, b: 0, t: 0 }, c = new THREE.Color(), c2 = new THREE.Color();
  // linear colours in [0, 0.25] stored ×4 so dark seas keep their precision
  const cols = REGIONS.map((r) => new THREE.Color().setHex(REGION_WATER[r.id][0]));
  for (let y = 0; y < TINT_H; y++) {
    const lat = ((y + 0.5) / TINT_H - 0.5) * Math.PI;
    for (let x = 0; x < TINT_W; x++) {
      const lon = ((x + 0.5) / TINT_W - 0.5) * Math.PI * 2;
      p.x = Math.cos(lat) * Math.cos(lon); p.y = Math.sin(lat); p.z = -Math.cos(lat) * Math.sin(lon);
      regionMix(p, mix);
      c.copy(cols[mix.a]).lerp(c2.copy(cols[mix.b]), mix.t);
      const clear = REGION_WATER[REGIONS[mix.a].id][1] * (1 - mix.t) + REGION_WATER[REGIONS[mix.b].id][1] * mix.t;
      const o = (y * TINT_W + x) * 4;
      d[o] = Math.min(255, c.r * 4 * 255); d[o + 1] = Math.min(255, c.g * 4 * 255); d[o + 2] = Math.min(255, c.b * 4 * 255);
      d[o + 3] = clear * 255;
    }
  }
  tex.needsUpdate = true;
}

// ---------------------------------------------------------------- the surface

const WATER_VERT = /* glsl */ `
uniform vec3 uNadir, uE1, uE2;
uniform float uChop;
varying vec3 vWP, vGrad;
#include <planet>
${SWELL_GLSL}
#include <fog_pars_vertex>
void main() {
  // position: x is the distance from the point under the camera along the sea, z the bearing round it
  float th = position.x / uPlanet.x, ph = position.z;
  vec3 up = cos(th) * uNadir + sin(th) * (cos(ph) * uE1 + sin(ph) * uE2);
  vec3 p = up * uPlanet.y;
  vec4 sw = swellAt(p, up, uTime, uChop, length(p - cameraPosition));
  vec3 wp = p + up * sw.x;
  vWP = wp;
  vGrad = sw.yzw;
  vec4 mvPosition = viewMatrix * vec4(wp, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;

const WATER_FRAG = /* glsl */ `
uniform sampler2D uRefl, uWake, uRipples;
uniform highp sampler2DArray uInk;
uniform vec3 uInkCol[32];
uniform float uInkMe, uInkOn;
uniform mat4 uTexMat;
uniform vec3 uZenith, uHorizon, uSunColor;
uniform float uReflect, uChop, uRain, uHasRefl;
uniform vec3 uWakeC, uWakeE1, uWakeE2;
uniform float uWakeSize;
uniform vec3 uDrift;
varying vec3 vWP, vGrad;
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
// ripple normals projected along the three axes, as a bend in world space
vec3 ripples(vec3 p, vec3 w, float s, vec2 off) {
  vec3 r = vec3(0.0);
  if (w.x > 0.02) { vec2 t = texture(uRipples, p.zy * s + off).xy * 2.0 - 1.0; r += vec3(0.0, t.y, t.x) * w.x; }
  if (w.y > 0.02) { vec2 t = texture(uRipples, p.xz * s + off).xy * 2.0 - 1.0; r += vec3(t.x, 0.0, t.y) * w.y; }
  if (w.z > 0.02) { vec2 t = texture(uRipples, p.xy * s + off).xy * 2.0 - 1.0; r += vec3(t.x, t.y, 0.0) * w.z; }
  return r;
}
float noise3(vec3 p, vec3 w, float s) {
  return texture(uNoise, p.zy * s).b * w.x + texture(uNoise, p.xz * s).b * w.y + texture(uNoise, p.xy * s).b * w.z;
}
// the cube-sphere cell texture coordinates of a direction: the simulation's equal-angle faces
vec3 cubeUV(vec3 p) {
  vec3 a = abs(p); float face; vec2 g;
  if (a.x >= a.y && a.x >= a.z) { face = p.x >= 0.0 ? 0.0 : 1.0; g = vec2(p.x >= 0.0 ? -p.z : p.z, p.y) / a.x; }
  else if (a.y >= a.z) { face = p.y >= 0.0 ? 2.0 : 3.0; g = vec2(p.x, p.y >= 0.0 ? -p.z : p.z) / a.y; }
  else { face = p.z >= 0.0 ? 4.0 : 5.0; g = vec2(p.z >= 0.0 ? p.x : -p.x, p.y) / a.z; }
  return vec3(atan(g) * (2.0 / 3.14159265) + 0.5, face);
}
void main() {
  vec3 wp = vWP;
  vec3 up = normalize(wp);
  vec3 toEye = cameraPosition - wp;
  float dist = length(toEye);
  vec3 V = toEye / dist;
  float alt = length(cameraPosition) - uPlanet.y;
  float near = smoothstep(420.0, 20.0, dist);
  vec3 tw = pow(abs(up), vec3(8.0)); tw /= tw.x + tw.y + tw.z;
  vec3 rip = ripples(wp, tw, 0.045, uDrift.xy * 0.012) * 0.6 + ripples(wp, tw, 0.11, -uDrift.xy * 0.02 + vec2(0.37, 0.11)) * 0.4;
  rip *= (0.25 + 0.75 * near) * uChop;
  // the wake map, in its own frame on the sea
  vec3 wq = wp - uWakeC;
  vec2 wxy = vec2(dot(wq, uWakeE1), dot(wq, uWakeE2));
  vec2 wuv = wxy / uWakeSize + 0.5;
  float inWake = step(0.0, wuv.x) * step(wuv.x, 1.0) * step(0.0, wuv.y) * step(wuv.y, 1.0);
  vec4 wk = texture(uWake, wuv) * inWake;
  vec2 tx = vec2(1.0 / 512.0, 0.0);
  vec2 wb = vec2(texture(uWake, wuv + tx.xy).g - texture(uWake, wuv - tx.xy).g, texture(uWake, wuv + tx.yx).g - texture(uWake, wuv - tx.yx).g) * inWake;
  vec2 rain = uRain > 0.01 && dist < 60.0 ? rainRings(wxy * 1.4, uTime) * uRain * smoothstep(60.0, 20.0, dist) : vec2(0.0);
  vec3 bend = vGrad + rip * 0.22 + (uWakeE1 * (wb.x * 3.0 + rain.x * 0.3) + uWakeE2 * (wb.y * 3.0 + rain.y * 0.3));
  bend -= up * dot(bend, up);
  vec3 N = normalize(up - bend);
  // seen from high above, the swell and ripples flatten into the sea's sheen
  N = normalize(mix(N, up, smoothstep(300.0, 1200.0, alt) * 0.6));
  // the reflection: the reflected ray, looked up in the mirror camera's picture (exact for a flat sea, and close
  // on the curve near the eye), or the sky's colours where there is no picture
  vec3 I = -V;
  vec3 rd = reflect(I, N);
  rd = normalize(rd + up * max(0.0, 0.015 - dot(rd, up)));
  float ru = max(dot(rd, up), 0.0);
  vec3 refl = mix(uHorizon, uZenith, pow(ru, 0.45));
  if (uHasRefl > 0.5) {
    vec4 rp = uTexMat * vec4(wp + rd * 40.0, 1.0);
    vec2 ruv = rp.xy / rp.w;
    float edge = smoothstep(0.0, 0.04, min(min(ruv.x, ruv.y), min(1.0 - ruv.x, 1.0 - ruv.y))) * step(0.0, rp.w);
    refl = mix(refl, texture(uRefl, clamp(ruv, 0.001, 0.999)).rgb, edge);
  }
  float fres = 0.02 + 0.98 * pow(1.0 - max(dot(N, V), 0.0), 5.0);
  fres = mix(fres, 1.0, 0.12) * uReflect;
  // from high above the open ocean shows its depth more than the sky
  fres *= mix(1.0, 0.45, smoothstep(250.0, 1400.0, alt));
  fres = clamp(fres, 0.0, 1.0);
  vec3 col = refl * fres;
  float a = fres;
  // the sun and the moon on the water: a hot glint for the bloom, a broad sheen beneath it
  float e = dot(up, uSunDir);
  vec3 H = normalize(V + uSunDir);
  float nh = max(dot(N, H), 0.0);
  float shade = planetShade(wp, uSunDir);
  col += keyAt(1, e) * shade * (pow(nh, 900.0) * 60.0 + pow(nh, 90.0) * 0.6) * smoothstep(-0.02, 0.05, e);
  vec3 Hm = normalize(V + uMoonDir);
  float nm = max(dot(N, Hm), 0.0);
  col += vec3(0.55, 0.65, 0.95) * (pow(nm, 600.0) * 6.0 + pow(nm, 60.0) * 0.06) * uNight * planetShade(wp, uMoonDir);
  // foam the hulls write, lit by the sun and the sky
  float fn = noise3(wp + vec3(uTime * 0.6, 0.0, 0.0), tw, 0.11);
  float foam = clamp(wk.r * smoothstep(0.35, 0.8, fn + wk.r * 0.35), 0.0, 1.0);
  vec3 sky = seaLight(wp) * 0.45 + keyAt(2, e) * 0.5;
  vec3 foamLit = vec3(0.92, 0.95, 0.97) * sky;
  col = mix(col, foamLit, foam * 0.85);
  a = mix(a, 1.0, foam * 0.85);
  // the captains' colours: held water washed in its holder's colour with a pen line round it, trails bright
  if (uInkOn > 0.5) {
    vec3 cu = cubeUV(up);
    vec2 cell = vec2(1.0 / ${GRID}.0);
    vec2 jit = (texture(uNoise, wxy * 0.045).rg - 0.5) * cell * 1.1;
    vec2 ids = floor(texture(uInk, vec3(cu.xy + jit, cu.z)).rg * 255.0 + 0.5);
    if (ids.x > 0.5) {
      float edge = 0.0;
      vec2 o = cell * 0.3;
      edge += step(0.5, abs(floor(texture(uInk, vec3(cu.xy + jit + vec2(o.x, 0.0), cu.z)).r * 255.0 + 0.5) - ids.x));
      edge += step(0.5, abs(floor(texture(uInk, vec3(cu.xy + jit - vec2(o.x, 0.0), cu.z)).r * 255.0 + 0.5) - ids.x));
      edge += step(0.5, abs(floor(texture(uInk, vec3(cu.xy + jit + vec2(0.0, o.y), cu.z)).r * 255.0 + 0.5) - ids.x));
      edge += step(0.5, abs(floor(texture(uInk, vec3(cu.xy + jit - vec2(0.0, o.y), cu.z)).r * 255.0 + 0.5) - ids.x));
      vec3 ic = uInkCol[int(ids.x) & 31];
      float mine = 1.0 - step(0.5, abs(ids.x - uInkMe));
      float lum = dot(sky, vec3(0.3, 0.6, 0.1)) * 0.35;
      float k = 0.32 + mine * 0.08 + clamp(edge, 0.0, 1.0) * 0.4;
      col = mix(col, ic * lum, k);
      a = mix(a, 1.0, k);
    }
    if (ids.y > 0.5) {
      vec3 tc = uInkCol[int(ids.y) & 31];
      float pulse = 0.75 + 0.25 * sin(uTime * 5.0 - dot(wxy, vec2(0.35)));
      col = mix(col, tc * (0.6 + uNight * 0.6) * pulse, 0.6);
      a = mix(a, 1.0, 0.6);
    }
  }
  // at night the disturbed water glows
  col += vec3(0.1, 0.75, 1.0) * wk.r * 2.2 * uNight * (0.6 + fn);
  // the air between: it acts on what is already premultiplied, so it is split into its scale and its glow
  vec3 fogAdd = atmosphere(vec3(0.0), wp), fogMul = atmosphere(vec3(1.0), wp) - fogAdd;
  gl_FragColor = vec4(col * fogMul + fogAdd * a, a);
}`;

// ---------------------------------------------------------------- the wake map

const FS_VERT = /* glsl */ `varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;
const WAKE_DECAY = /* glsl */ `
uniform sampler2D tPrev; uniform vec2 uShift; uniform float uKeep; varying vec2 vUv;
void main() {
  vec2 uv = vUv + uShift, t = vec2(1.0 / 512.0, 0.0);
  vec4 c = texture(tPrev, uv) * 0.6 + (texture(tPrev, uv + t.xy) + texture(tPrev, uv - t.xy) + texture(tPrev, uv + t.yx) + texture(tPrev, uv - t.yx)) * 0.1;
  float inside = step(0.0, uv.x) * step(uv.x, 1.0) * step(0.0, uv.y) * step(uv.y, 1.0);
  gl_FragColor = vec4(c.r * uKeep, c.g * uKeep * 0.985, 0.0, 1.0) * inside;
}`;
const STAMP_VERT = /* glsl */ `
attribute vec4 aStamp; // x, y in the map's frame, radius, foam
attribute float aBump;
uniform float uHalf;
varying vec2 vQ;
varying float vFoam, vBump;
void main() {
  vQ = position.xy;
  vFoam = aStamp.w;
  vBump = aBump;
  gl_Position = vec4((aStamp.xy + position.xy * aStamp.z) / uHalf, 0.0, 1.0);
}`;
const STAMP_FRAG = /* glsl */ `
varying vec2 vQ;
varying float vFoam, vBump;
void main() {
  float d = length(vQ);
  if (d > 1.0) discard;
  float soft = smoothstep(1.0, 0.25, d);
  float ring = smoothstep(1.0, 0.7, d) * smoothstep(0.35, 0.75, d);
  gl_FragColor = vec4(vFoam * soft, vBump * ring, 0.0, 1.0);
}`;

const MAX_STAMPS = 768;
const WAKE_SIZE = 260; // metres the wake map spans
const WAKE_RES = 512;

/** Foam the hulls write into the sea, in a square map on the tangent plane that follows the focus. */
class WakeMap {
  readonly rt: [THREE.WebGLRenderTarget, THREE.WebGLRenderTarget];
  cur = 0;
  /** The map's centre on the sea, and its frame along the sea. */
  readonly centre = new THREE.Vector3(0, R, 0);
  readonly e1 = new THREE.Vector3(1, 0, 0);
  readonly e2 = new THREE.Vector3(0, 0, -1);
  private readonly cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private readonly decay: THREE.ShaderMaterial;
  private readonly quadScene = new THREE.Scene();
  private readonly stampScene = new THREE.Scene();
  private readonly stampAttr: THREE.InstancedBufferAttribute;
  private readonly bumpAttr: THREE.InstancedBufferAttribute;
  private readonly stampGeo: THREE.InstancedBufferGeometry;
  private readonly pending: number[] = [];
  private readonly tmp = new THREE.Vector3();

  constructor() {
    const opts = { type: THREE.HalfFloatType, depthBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter };
    this.rt = [new THREE.WebGLRenderTarget(WAKE_RES, WAKE_RES, opts), new THREE.WebGLRenderTarget(WAKE_RES, WAKE_RES, opts)];
    this.decay = new THREE.ShaderMaterial({ vertexShader: FS_VERT, fragmentShader: WAKE_DECAY, uniforms: { tPrev: { value: null }, uShift: { value: new THREE.Vector2() }, uKeep: { value: 0.99 } }, depthTest: false, depthWrite: false });
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.decay);
    quad.frustumCulled = false;
    this.quadScene.add(quad);
    this.stampGeo = new THREE.InstancedBufferGeometry();
    this.stampGeo.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0], 3));
    this.stampGeo.setIndex([0, 1, 2, 0, 2, 3]);
    this.stampAttr = new THREE.InstancedBufferAttribute(new Float32Array(MAX_STAMPS * 4), 4);
    this.bumpAttr = new THREE.InstancedBufferAttribute(new Float32Array(MAX_STAMPS), 1);
    this.stampAttr.setUsage(THREE.DynamicDrawUsage);
    this.bumpAttr.setUsage(THREE.DynamicDrawUsage);
    this.stampGeo.setAttribute('aStamp', this.stampAttr);
    this.stampGeo.setAttribute('aBump', this.bumpAttr);
    const stampMat = new THREE.ShaderMaterial({
      vertexShader: STAMP_VERT, fragmentShader: STAMP_FRAG, uniforms: { uHalf: { value: WAKE_SIZE / 2 } }, depthTest: false, depthWrite: false, side: THREE.DoubleSide,
      blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor, blendEquation: THREE.MaxEquation,
    });
    const stamps = new THREE.Mesh(this.stampGeo, stampMat);
    stamps.frustumCulled = false;
    this.stampScene.add(stamps);
  }

  stamp(p: V3, r: number, foam: number, bump: number): void {
    if (this.pending.length >= MAX_STAMPS * 6) return;
    this.pending.push(p.x, p.y, p.z, r, foam, bump);
  }

  /** Moves the map under the focus (a point in metres), fades it, and draws the stamps since the last frame. */
  update(renderer: THREE.WebGLRenderer, focus: THREE.Vector3, dt: number): void {
    const texel = WAKE_SIZE / WAKE_RES, c = this.centre, t = this.tmp;
    // how far the focus is from the centre in the old frame, snapped to texels so the foam does not smear
    t.copy(focus).normalize().multiplyScalar(R).sub(c);
    let sx = Math.round(t.dot(this.e1) / texel) * texel, sy = Math.round(t.dot(this.e2) / texel) * texel;
    if (Math.abs(sx) > WAKE_SIZE || Math.abs(sy) > WAKE_SIZE) sx = sy = 0;
    if (t.length() > WAKE_SIZE) {
      // a jump: start afresh there
      c.copy(focus).normalize().multiplyScalar(R);
    } else if (sx || sy) {
      c.addScaledVector(this.e1, sx).addScaledVector(this.e2, sy).normalize().multiplyScalar(R);
    }
    // carry the frame along with the centre
    const n = t.copy(c).normalize();
    this.e1.addScaledVector(n, -this.e1.dot(n)).normalize();
    this.e2.crossVectors(n, this.e1);
    const prev = this.rt[this.cur], next = this.rt[1 - this.cur];
    this.decay.uniforms.tPrev.value = prev.texture;
    this.decay.uniforms.uShift.value.set(sx / WAKE_SIZE, sy / WAKE_SIZE);
    this.decay.uniforms.uKeep.value = Math.pow(0.55, dt);
    renderer.setRenderTarget(next);
    renderer.render(this.quadScene, this.cam);
    const k = this.pending.length / 6;
    if (k) {
      for (let i = 0; i < k; i++) {
        const o = i * 6;
        t.set(this.pending[o], this.pending[o + 1], this.pending[o + 2]).normalize().multiplyScalar(R).sub(c);
        this.stampAttr.setXYZW(i, t.dot(this.e1), t.dot(this.e2), this.pending[o + 3], this.pending[o + 4]);
        this.bumpAttr.setX(i, this.pending[o + 5]);
      }
      this.stampGeo.instanceCount = k;
      this.stampAttr.addUpdateRange(0, k * 4);
      this.bumpAttr.addUpdateRange(0, k);
      this.stampAttr.needsUpdate = true;
      this.bumpAttr.needsUpdate = true;
      renderer.render(this.stampScene, this.cam);
      this.pending.length = 0;
    }
    this.cur = 1 - this.cur;
  }

  get texture(): THREE.Texture {
    return this.rt[this.cur].texture;
  }
}

// ---------------------------------------------------------------- the polar grid

/** Rings round the point under the camera, from 0.9 m apart there to the far side of the planet. */
function polarGrid(segs: number): THREE.BufferGeometry {
  const rings: number[] = [];
  const end = Math.PI * R;
  for (let k = 1; ; k++) {
    const s = (0.9 * (Math.pow(1.045, k) - 1)) / 0.045;
    if (s >= end * 0.995) { rings.push(end); break; }
    rings.push(s);
  }
  const pos: number[] = [0, 0, 0], idx: number[] = [];
  rings.forEach((r, k) => {
    for (let s = 0; s < segs; s++) pos.push(r, 0, (s / segs) * Math.PI * 2 + (k % 2) * (Math.PI / segs));
  });
  for (let s = 0; s < segs; s++) idx.push(0, 1 + ((s + 1) % segs), 1 + s);
  for (let k = 1; k < rings.length; k++) for (let s = 0; s < segs; s++) {
    const a = 1 + (k - 1) * segs + s, b = 1 + (k - 1) * segs + ((s + 1) % segs), c = a + segs, d = b + segs;
    idx.push(a, b, c, b, d, c);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  return g;
}

// ---------------------------------------------------------------- the water itself

/** The territory's cells, owner in red and trail in green, as the simulation's cube grid. */
const INK_N = GRID;

export class Water {
  readonly mesh: THREE.Mesh;
  readonly wake = new WakeMap();
  /** The sea's colour and clarity by latitude and longitude (planet.ts seaTint), from REGION_WATER. */
  readonly tint = seaTintTexture();
  readonly ink: THREE.DataArrayTexture;
  /** Each captain's colour, by ship index + 1. */
  readonly inkCol = Array.from({ length: 32 }, (_, i) => new THREE.Color().setHSL((i * 0.618) % 1, 0.75, 0.5));
  rain = 0;
  private inkVersion = -1;
  private readonly u: Record<string, THREE.IUniform>;
  private readonly refl: THREE.WebGLRenderTarget;
  private readonly mirror = new THREE.PerspectiveCamera();
  private reflScale: number;
  private readonly uv: FaceUV = { face: 0, u: 0, v: 0 };
  private readonly d = v3();

  constructor(tex: Textures, reflectScale: number, segs = 256) {
    this.reflScale = reflectScale;
    fillSeaTint(this.tint);
    U.uSeaTint.value = this.tint;
    this.refl = new THREE.WebGLRenderTarget(16, 16, { type: THREE.HalfFloatType, depthBuffer: true });
    this.ink = new THREE.DataArrayTexture(new Uint8Array(INK_N * INK_N * 6 * 2), INK_N, INK_N, 6);
    this.ink.format = THREE.RGFormat;
    this.ink.type = THREE.UnsignedByteType;
    this.ink.magFilter = this.ink.minFilter = THREE.NearestFilter;
    this.ink.generateMipmaps = false;
    this.ink.needsUpdate = true;
    this.u = {
      ...U,
      uNadir: { value: new THREE.Vector3(0, 1, 0) }, uE1: { value: new THREE.Vector3(1, 0, 0) }, uE2: { value: new THREE.Vector3(0, 0, -1) },
      uRefl: { value: this.refl.texture }, uWake: { value: this.wake.texture }, uRipples: { value: tex.ripples },
      uTexMat: { value: new THREE.Matrix4() }, uZenith: { value: new THREE.Color() }, uHorizon: { value: new THREE.Color() },
      uReflect: { value: 1 }, uChop: { value: 1 }, uRain: { value: 0 }, uHasRefl: { value: 0 },
      uWakeC: { value: this.wake.centre }, uWakeE1: { value: this.wake.e1 }, uWakeE2: { value: this.wake.e2 }, uWakeSize: { value: WAKE_SIZE },
      uInk: { value: this.ink }, uInkCol: { value: this.inkCol }, uInkMe: { value: 0 }, uInkOn: { value: 0 },
    };
    const mat = new THREE.ShaderMaterial({
      vertexShader: WATER_VERT, fragmentShader: WATER_FRAG, uniforms: this.u, fog: true, transparent: true, depthWrite: true,
      blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
    });
    mat.userData.planet = true;
    this.mesh = new THREE.Mesh(polarGrid(segs), mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -1;
    this.mesh.name = 'water';
  }

  /** Changes one region's sea colour (sRGB) and clarity (0 murky, 1 glass), and refills the tint over the planet. */
  setRegionWater(region: RegionId, colour: number, clarity: number): void {
    REGION_WATER[region] = [colour, clarity];
    fillSeaTint(this.tint);
  }

  /**
   * Copies the territory into the water when it has changed: owner and trail hold ship index + 1 per cell of the
   * simulation's cube grid (sphere.ts TERRITORY), and `me` is the player's index + 1. Pass null to hide it.
   */
  setTerritory(owner: Uint8Array | null, trail: Uint8Array | null, version: number, me = 0): void {
    this.u.uInkMe.value = me;
    this.u.uInkOn.value = owner ? 1 : 0;
    if (!owner || version === this.inkVersion) return;
    this.inkVersion = version;
    const d = this.ink.image.data as Uint8Array, n = Math.min(owner.length, INK_N * INK_N * 6);
    for (let i = 0; i < n; i++) { d[i * 2] = owner[i]; d[i * 2 + 1] = trail ? trail[i] : 0; }
    this.ink.needsUpdate = true;
  }

  /** Foam (and a little bump) into the wake map at p, a point in metres in the planet's frame. */
  stamp(p: V3, r: number, foam: number, bump = 0): void {
    this.wake.stamp(p, r, foam, bump);
  }

  setReflectScale(s: number): void {
    this.reflScale = s;
  }

  /**
   * Follows the camera, fades the wakes and draws the reflection: call before the main render. `look` gives the
   * sky's colours and how the water should look where the camera is.
   */
  prepare(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.PerspectiveCamera, focus: THREE.Vector3, look: { zenith: THREE.Color; horizon: THREE.Color; reflect: number; chop: number }, width: number, height: number, dt: number): void {
    const u = this.u;
    u.uReflect.value = look.reflect;
    u.uZenith.value.copy(look.zenith);
    u.uHorizon.value.copy(look.horizon);
    swell.chop = look.chop * (1 + this.rain * 0.8);
    u.uChop.value = swell.chop;
    u.uRain.value = this.rain;
    this.wake.update(renderer, focus, dt);
    u.uWake.value = this.wake.texture;

    // the grid's centre: the cell of the simulation's grid under the camera, so the rings do not swim over the swell
    const eye = camera.position, sea = U.uPlanet.value.y;
    faceUV(eye, this.uv);
    const n = 512, f = this.uv.face;
    const cu = ((Math.floor(((this.uv.u + 1) / 2) * n) + 0.5) / n) * 2 - 1, cv = ((Math.floor(((this.uv.v + 1) / 2) * n) + 0.5) / n) * 2 - 1;
    const nadir = u.uNadir.value as THREE.Vector3, e1 = u.uE1.value as THREE.Vector3, e2 = u.uE2.value as THREE.Vector3;
    faceDir(f, cu, cv, this.d);
    nadir.set(this.d.x, this.d.y, this.d.z);
    faceDir(f, cu + 0.01, cv, this.d);
    e1.set(this.d.x, this.d.y, this.d.z).sub(nadir);
    e1.addScaledVector(nadir, -e1.dot(nadir)).normalize();
    e2.crossVectors(e1, nadir);

    // the mirror: the camera reflected in the sea's tangent plane under it, its near plane bent onto the water
    const alt = eye.length() - sea;
    u.uHasRefl.value = 0;
    if (this.reflScale <= 0 || alt < 0.05 || alt > 400) return;
    const w = Math.max(16, Math.round(width * this.reflScale)), h = Math.max(16, Math.round(height * this.reflScale));
    if (this.refl.width !== w || this.refl.height !== h) this.refl.setSize(w, h);
    const up = this.d2.copy(eye).normalize();
    const m = this.mirror;
    camera.updateMatrixWorld();
    m.position.copy(eye).addScaledVector(up, -2 * alt);
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
    const upv = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion);
    fwd.addScaledVector(up, -2 * fwd.dot(up));
    upv.addScaledVector(up, -2 * upv.dot(up));
    m.up.copy(upv);
    m.lookAt(m.position.clone().add(fwd));
    m.near = camera.near;
    m.far = camera.far;
    m.updateMatrixWorld();
    m.projectionMatrix.copy(camera.projectionMatrix);
    m.projectionMatrixInverse.copy(camera.projectionMatrixInverse);
    u.uTexMat.value.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1).multiply(m.projectionMatrix).multiply(m.matrixWorldInverse);
    const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(up, up.clone().multiplyScalar(sea - 0.15)).applyMatrix4(m.matrixWorldInverse);
    const clip = new THREE.Vector4(plane.normal.x, plane.normal.y, plane.normal.z, plane.constant);
    const e = m.projectionMatrix.elements;
    const q = new THREE.Vector4((Math.sign(clip.x) + e[8]) / e[0], (Math.sign(clip.y) + e[9]) / e[5], -1, (1 + e[10]) / e[14]);
    clip.multiplyScalar(2 / clip.dot(q));
    e[2] = clip.x; e[6] = clip.y; e[10] = clip.z + 1; e[14] = clip.w;
    this.mesh.visible = false;
    renderer.setRenderTarget(this.refl);
    renderer.setClearColor(0x000000, 1);
    renderer.clear(true, true, false);
    renderer.render(scene, m);
    this.mesh.visible = true;
    u.uHasRefl.value = 1;
  }

  private readonly d2 = new THREE.Vector3();
}

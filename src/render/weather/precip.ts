// What falls round the camera: rain streaks with dimples where they land on the sea, snowflakes, ash flakes and
// glowing embers, and wisps of fog drifting past. Each is one instanced draw whose particles live in a box that
// wraps round the eye in world space, so you sail through them with true parallax. Their positions are computed
// on the GPU from a seed and the field's accumulated drift; the CPU only moves a handful of uniforms.
import * as THREE from 'three';
import { PUFF_GLSL } from './clouds.ts';
import { FRAG_END, instancedQuad, seeds, shaderMesh, weatherMaterial, type Shared } from './common.ts';

interface Field {
  mesh: THREE.Mesh;
  u: { uOffset: { value: THREE.Vector3 }; uAmount: { value: number }; uBox: { value: number }; [k: string]: THREE.IUniform };
  amount: number;
}

// Wrap a seeded point round the eye: returns its world position, and its offset from the eye in 'rel'.
const WRAP = /* glsl */ `
attribute vec4 aSeed;
uniform vec3 uOffset;
uniform float uBox, uAmount;
vec3 wrapped(float speed, out vec3 rel) {
  vec3 p = aSeed.xyz * uBox + uOffset * speed;
  rel = mod(p - cameraPosition + 0.5 * uBox, uBox) - 0.5 * uBox;
  return cameraPosition + rel;
}
// a side vector square to 'axis' and the view
vec3 sideOf(vec3 axis, vec3 c) {
  vec3 s = cross(axis, cameraPosition - c);
  float l = length(s);
  return l > 1e-5 ? s / l : vec3(1.0, 0.0, 0.0);
}`;

const RAIN_VERT = /* glsl */ `${WRAP}
uniform vec3 uVel;
uniform float uLen, uWidth;
varying vec2 vUv;
varying float vFade;
varying vec3 vWorld;
void main() {
  vec3 rel;
  vec3 c = wrapped(0.85 + 0.3 * fract(aSeed.w * 7.13), rel);
  float dist = length(rel), h = length(c) - uRadius;
  vFade = step(aSeed.w, uAmount) * smoothstep(0.5 * uBox, 0.3 * uBox, dist) * smoothstep(-0.2, 0.5, h);
  vec3 axis = uVel * uLen * (0.8 + 0.4 * fract(aSeed.w * 3.7));
  float px = max(uWidth, dist * uPixel * 1.1);
  vFade *= uWidth / px;
  vec3 p = c + axis * position.y + sideOf(axis, c) * position.x * px;
  vUv = uv; vWorld = p;
  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
}`;

const RAIN_FRAG = /* glsl */ `
uniform vec3 uFlashC;
uniform float uAlpha;
varying vec2 vUv;
varying float vFade;
varying vec3 vWorld;
void main() {
  float x = abs(vUv.x - 0.5) * 2.0;
  float a = (1.0 - x * x) * smoothstep(0.0, 0.35, vUv.y) * smoothstep(1.0, 0.75, vUv.y) * vFade * uAlpha;
  if (a < 0.004) discard;
  vec3 up = normalize(vWorld);
  float h = length(vWorld) - uRadius;
  vec3 v = normalize(vWorld - cameraPosition);
  vec3 col = vec3(0.8, 0.86, 0.95) * (skyAmbient(up) * 1.7 + moonColor(up) + sunColor(up, h) * (0.12 + 0.6 * pow(max(dot(v, uSunDir), 0.0), 3.0))) + uFlashC;
  gl_FragColor = vec4(col * uGain, a);
  ${FRAG_END}
}`;

const DIMPLE_VERT = /* glsl */ `
attribute vec4 aSeed;
uniform float uBox, uAmount, uPeriod, uLift;
varying vec2 vQ;
varying float vLife, vFade;
varying vec3 vWorld;
void main() {
  float k = uTime / uPeriod + aSeed.w;
  vLife = fract(k);
  // a fresh spot every cycle, fixed in the world for the ring's short life
  vec3 s = hash33(aSeed.xyz * 97.0 + floor(k) * 13.17);
  vec3 rel = mod(s * uBox - cameraPosition + 0.5 * uBox, uBox) - 0.5 * uBox;
  vec3 up = normalize(cameraPosition + rel);
  vec3 c = up * (uRadius + uLift);
  vec3 foot = normalize(cameraPosition) * (uRadius + uLift);
  vFade = step(fract(aSeed.w * 7.31), uAmount) * smoothstep(0.5 * uBox, 0.28 * uBox, length(c - foot));
  vec3 e, n;
  tangents(up, e, n);
  vec3 p = c + (e * position.x + n * position.y) * 0.9;
  vQ = position.xy * 0.9;
  vWorld = p;
  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
}`;

const DIMPLE_FRAG = /* glsl */ `
uniform vec3 uFlashC;
varying vec2 vQ;
varying float vLife, vFade;
varying vec3 vWorld;
void main() {
  float r = length(vQ), life = vLife;
  float R = life * 0.4, w = 0.018 + 0.035 * life;
  float ring = exp(-pow((r - R) / w, 2.0)) * (1.0 - life) * (1.0 - life);
  float inner = exp(-pow((r - R * 0.55) / (w * 0.8), 2.0)) * (1.0 - life) * smoothstep(0.1, 0.3, life) * 0.5;
  float splash = exp(-r * r * 1400.0) * smoothstep(0.18, 0.0, life) * 2.5;
  float a = (ring + inner + splash) * vFade;
  if (a < 0.003) discard;
  vec3 up = normalize(vWorld);
  vec3 col = (skyAmbient(up) * 1.4 + sunColor(up, 0.0) * 0.18 + moonColor(up) + uFlashC) * a;
  gl_FragColor = vec4(hazeAdd(col, length(vWorld - cameraPosition)) * uGain, 1.0);
  ${FRAG_END}
}`;

const FLAKE_VERT = /* glsl */ `${WRAP}
uniform float uSize, uWobble, uSpin;
varying vec2 vQ;
varying float vFade, vSpin;
varying vec3 vWorld;
varying vec4 vSeed;
void main() {
  vec3 rel;
  float w = aSeed.w;
  vec3 c = wrapped(0.8 + 0.4 * fract(w * 5.31), rel);
  // flutter: each flake swings on its own little orbit as it falls
  float t = uTime;
  c += vec3(sin(t * (0.9 + w) + w * 40.0), sin(t * (1.3 + w * 0.5) + w * 17.0) * 0.4, cos(t * (0.8 + w * 0.7) + w * 23.0)) * uWobble;
  float dist = length(c - cameraPosition), h = length(c) - uRadius;
  vFade = step(w, uAmount) * smoothstep(0.5 * uBox, 0.3 * uBox, dist) * smoothstep(-0.1, 0.4, h) * smoothstep(0.15, 0.6, dist);
  float s = uSize * (0.6 + 0.8 * fract(w * 13.7));
  float px = max(s, dist * uPixel * 1.6);
  vFade *= (s / px) * (s / px);
  vec3 up = normalize(c), toCam = normalize(cameraPosition - c);
  vec3 right = normalize(cross(up, toCam) + vec3(1e-5, 0.0, 0.0)), bup = cross(toCam, right);
  // tumbling: the quad spins and foreshortens
  float a = t * uSpin * (0.5 + w) + w * 30.0;
  vec2 q = mat2(cos(a), -sin(a), sin(a), cos(a)) * position.xy;
  q.y *= mix(1.0, 0.25 + 0.75 * abs(cos(a * 0.7)), uSpin > 0.0 ? 1.0 : 0.0);
  vec3 p = c + (right * q.x + bup * q.y) * px;
  vQ = position.xy * 2.0; vSpin = abs(cos(a * 0.7)); vWorld = p; vSeed = aSeed;
  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
}`;

const SNOW_FRAG = /* glsl */ `
uniform vec3 uFlashC;
varying vec2 vQ;
varying float vFade, vSpin;
varying vec3 vWorld;
varying vec4 vSeed;
void main() {
  float r2 = dot(vQ, vQ);
  float a = (exp(-r2 * 3.5) * 0.85 + exp(-r2 * 18.0) * 0.4) * vFade;
  if (a < 0.004) discard;
  vec3 up = normalize(vWorld);
  float h = length(vWorld) - uRadius;
  vec3 v = normalize(vWorld - cameraPosition);
  float glint = pow(vSpin, 24.0) * 1.5;
  vec3 col = skyAmbient(up) * 1.5 + moonColor(up) * 1.2 + sunColor(up, h) * (0.55 + glint) + uFlashC;
  col *= 1.0 + 0.4 * pow(max(dot(v, uSunDir), 0.0), 4.0);
  gl_FragColor = vec4(col * uGain, a);
  ${FRAG_END}
}`;

const ASH_FRAG = /* glsl */ `
uniform vec3 uFlashC;
varying vec2 vQ;
varying float vFade, vSpin;
varying vec3 vWorld;
varying vec4 vSeed;
void main() {
  // a ragged grey flake
  float n = texture2D(uNoise, vQ * 0.18 + vSeed.xy).b;
  float r2 = dot(vQ, vQ);
  float a = smoothstep(0.75, 0.45, r2 + (n - 0.5) * 0.9) * vFade * 0.9;
  if (a < 0.004) discard;
  vec3 up = normalize(vWorld);
  float h = length(vWorld) - uRadius;
  vec3 col = vec3(0.34, 0.31, 0.29) * (skyAmbient(up) * 1.3 + moonColor(up) + sunColor(up, h) * (0.4 + 0.6 * vSpin)) + uFlashC * 0.3;
  gl_FragColor = vec4(col * uGain, a);
  ${FRAG_END}
}`;

const EMBER_VERT = /* glsl */ `${WRAP}
uniform float uSize;
varying vec2 vQ;
varying float vFade, vHeat;
varying vec3 vWorld;
void main() {
  vec3 rel;
  float w = aSeed.w, t = uTime;
  vec3 c = wrapped(0.6 + 0.8 * fract(w * 3.1), rel);
  // swirling on the hot air
  c += vec3(sin(t * 0.7 + w * 31.0) + 0.5 * sin(t * 1.9 + w * 11.0), sin(t * 0.5 + w * 13.0) * 0.6, cos(t * 0.6 + w * 19.0) + 0.5 * cos(t * 1.7 + w * 7.0)) * 0.9;
  float dist = length(c - cameraPosition), h = length(c) - uRadius;
  vHeat = 0.55 + 0.45 * sin(t * (3.0 + w * 9.0) + w * 50.0);
  vFade = step(w, uAmount) * smoothstep(0.5 * uBox, 0.3 * uBox, dist) * smoothstep(0.0, 0.5, h);
  float s = uSize * (0.5 + fract(w * 9.7));
  float px = max(s, dist * uPixel * 2.2);
  vFade *= s / px;
  vec3 toCam = normalize(cameraPosition - c), up = normalize(c);
  vec3 right = normalize(cross(up, toCam) + vec3(1e-5, 0.0, 0.0)), bup = cross(toCam, right);
  vec3 p = c + (right * position.x + bup * position.y) * px;
  vQ = position.xy * 2.0; vWorld = p;
  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
}`;

const EMBER_FRAG = /* glsl */ `
uniform float uGlow;
varying vec2 vQ;
varying float vFade, vHeat;
varying vec3 vWorld;
void main() {
  float r2 = dot(vQ, vQ);
  float core = exp(-r2 * 10.0), halo = exp(-r2 * 2.5) * 0.25;
  float a = (core + halo) * vFade * vHeat;
  if (a < 0.003) discard;
  vec3 hot = mix(vec3(1.0, 0.25, 0.04), vec3(1.0, 0.75, 0.3), core * vHeat);
  gl_FragColor = vec4(hazeAdd(hot * a * uGlow, length(vWorld - cameraPosition)) * uGain, 1.0);
  ${FRAG_END}
}`;

const WISP_VERT = /* glsl */ `${WRAP}
uniform float uSize;
varying vec2 vQ;
varying float vFade, vSeed, vS;
varying vec3 vWorld, vRight, vBup, vFwd;
void main() {
  vec3 rel;
  float w = aSeed.w;
  vec3 c = wrapped(0.7 + 0.6 * fract(w * 4.3), rel);
  // wisps lie low over the sea
  vec3 up = normalize(c);
  c = up * (uRadius + 1.0 + 11.0 * fract(w * 11.3));
  float dist = length(c - cameraPosition);
  vFade = step(w, uAmount) * smoothstep(0.5 * uBox, 0.32 * uBox, length(rel));
  float s = uSize * (0.7 + 0.6 * fract(w * 17.1));
  vec3 toCam = normalize(cameraPosition - c);
  vec3 right = normalize(cross(up, toCam) + vec3(1e-5, 0.0, 0.0)), bup = cross(toCam, right);
  vec3 p = c + right * position.x * s + bup * position.y * s * 0.45;
  vQ = position.xy * 2.0; vWorld = p; vRight = right; vBup = bup; vFwd = toCam; vSeed = w; vS = s;
  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
}`;

const WISP_FRAG = /* glsl */ `
uniform vec3 uTint;
uniform float uAlpha;
varying vec2 vQ;
varying float vFade, vSeed, vS;
varying vec3 vWorld, vRight, vBup, vFwd;
${PUFF_GLSL}
void main() {
  vec4 c = shadePuff(vQ, vSeed, 0.6, vFade * uAlpha, uTint, 0.8, vec3(0.0), 0.7, vWorld, vRight, vBup, vFwd, vS * 0.4);
  if (c.a < 0.003) discard;
  gl_FragColor = c;
  ${FRAG_END}
}`;

export interface PrecipAmounts { rain: number; snow: number; ash: number; fog: number }

export class Precip {
  readonly group = new THREE.Group();
  private readonly rain: Field;
  private readonly dimples: Field;
  private readonly snow: Field;
  private readonly ash: Field;
  private readonly embers: Field;
  private readonly wisps: Field;
  private readonly down = new THREE.Vector3();
  private readonly vel = new THREE.Vector3();
  private readonly flash = new THREE.Color();
  private readonly shared: Shared;

  constructor(shared: Shared, quality: 'high' | 'low', seed: number) {
    this.shared = shared;
    const k = quality === 'high' ? 1 : 0.5;
    const field = (count: number, box: number, vert: string, frag: string, own: Record<string, THREE.IUniform>, order: number, additive = false, s = 0): Field => {
      const g = instancedQuad(Math.round(count * k));
      g.setAttribute('aSeed', seeds(Math.round(count * k), seed + s));
      const u = { uOffset: { value: new THREE.Vector3() }, uAmount: { value: 0 }, uBox: { value: box }, ...own };
      const mesh = shaderMesh(g, weatherMaterial(shared, u, vert, frag, { additive, side: THREE.DoubleSide }), order);
      mesh.visible = false;
      this.group.add(mesh);
      return { mesh, u, amount: 0 };
    };
    const flashC = { value: this.flash };
    this.rain = field(9000, 36, RAIN_VERT, RAIN_FRAG, {
      uVel: { value: new THREE.Vector3() }, uLen: { value: 0.07 }, uWidth: { value: 0.012 }, uFlashC: flashC, uAlpha: { value: 0.32 },
    }, 8, false, 1);
    this.dimples = field(900, 34, DIMPLE_VERT, DIMPLE_FRAG, { uPeriod: { value: 0.85 }, uLift: { value: 0.12 }, uFlashC: flashC }, 2, true, 2);
    this.snow = field(6000, 34, FLAKE_VERT, SNOW_FRAG, { uSize: { value: 0.035 }, uWobble: { value: 0.35 }, uSpin: { value: 1.5 }, uFlashC: flashC }, 8, false, 3);
    this.ash = field(3000, 40, FLAKE_VERT, ASH_FRAG, { uSize: { value: 0.05 }, uWobble: { value: 0.5 }, uSpin: { value: 0.8 }, uFlashC: flashC }, 8, false, 4);
    this.embers = field(700, 46, EMBER_VERT, EMBER_FRAG, { uSize: { value: 0.045 }, uGlow: { value: 1 } }, 9, true, 5);
    this.wisps = field(40, 110, WISP_VERT, WISP_FRAG, { uSize: { value: 22 }, uTint: { value: new THREE.Color(0.9, 0.92, 0.95) }, uAlpha: { value: 0.3 } }, 5, false, 6);
  }

  /**
   * Moves every field: amounts are 0–1 at the camera; wind and the camera's velocity are world m/s.
   * Night makes the embers glow; flash lights the drops.
   */
  update(dt: number, eye: THREE.Vector3, camVel: THREE.Vector3, wind: THREE.Vector3, amounts: PrecipAmounts, night: number, flash: number): void {
    const R = this.shared.uRadius.value, h = eye.length() - R, down = this.down.copy(eye).normalize().negate();
    // nothing falls round a camera high above the clouds
    const low = 1 - Math.min(1, Math.max(0, (h - 60) / 60));
    this.flash.setRGB(0.75, 0.82, 1).multiplyScalar(flash * 1.5);
    const step = (f: Field, amount: number, vx: number, vy: number, vz: number): void => {
      f.amount += (amount - f.amount) * Math.min(1, dt * 1.5);
      f.u.uAmount.value = f.amount;
      f.mesh.visible = f.amount > 0.005;
      const o = f.u.uOffset.value;
      o.x += vx * dt; o.y += vy * dt; o.z += vz * dt;
      if (o.lengthSq() > 1e10) o.set(0, 0, 0);
    };
    const v = this.vel;
    v.copy(down).multiplyScalar(9.5).addScaledVector(wind, 0.9);
    step(this.rain, amounts.rain * low, v.x, v.y, v.z);
    (this.rain.u.uVel.value as THREE.Vector3).copy(v).sub(camVel);
    step(this.dimples, Math.min(1, amounts.rain * 1.3) * (h < 40 ? 1 : 0), 0, 0, 0);
    v.copy(down).multiplyScalar(1.1).addScaledVector(wind, 0.8);
    step(this.snow, amounts.snow * low, v.x, v.y, v.z);
    v.copy(down).multiplyScalar(0.55).addScaledVector(wind, 0.9);
    step(this.ash, amounts.ash * low, v.x, v.y, v.z);
    v.copy(down).multiplyScalar(-0.45).addScaledVector(wind, 1);
    step(this.embers, Math.min(1, amounts.ash * 1.2) * low, v.x, v.y, v.z);
    this.embers.u.uGlow.value = 1.2 + 3.5 * night;
    v.copy(wind).multiplyScalar(0.6);
    step(this.wisps, amounts.fog * low, v.x, v.y, v.z);
  }
}

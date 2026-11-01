// The weather you can see coming: each system the simulation runs is drawn where it is as a simple formation of lit
// cloud puffs (a squall's dark towers with rain hanging under them, a fog bank low on the water, a snow cloud, an ash
// plume), and inside one the air fills with rain, snow or embers. How deep the camera is in each kind also sets the
// sky's mood (sky.ts) and the sea's chop.
import * as THREE from 'three';
import { R } from '../sim/sphere.ts';
import type { WeatherKind } from '../sim/world/index.ts';
import type { V3 } from '../sim/math.ts';
import { U } from './engine.ts';

/** One weather system: its kind, where its centre is (a unit vector), its radius in metres, and how strong it is (0..1). */
export interface WeatherSystem {
  kind: WeatherKind;
  at: V3;
  radius: number;
  strength: number;
}

/** How deep the camera is in each kind of weather, 0..1. */
export type WeatherDepth = Partial<Record<WeatherKind, number>>;

export const MAX_SYSTEMS = 6;

// ---------------------------------------------------------------- the formations

interface Look { base: number; tower: number; size: number; flat: number; lit: number; shade: number; tint: [number, number, number]; curtains: number; share: number }

// base height and tower height over it (m), puff size (m), how flat the puffs are, lit and shaded brightness,
// colour, rain curtains, and the share of the quality's puffs this kind takes
const LOOKS: Partial<Record<WeatherKind, Look>> = {
  rain: { base: 110, tower: 90, size: 46, flat: 0.75, lit: 0.85, shade: 0.28, tint: [0.92, 0.95, 1.0], curtains: 6, share: 1 },
  thunder: { base: 100, tower: 210, size: 58, flat: 0.85, lit: 0.7, shade: 0.16, tint: [0.88, 0.9, 1.0], curtains: 9, share: 1.2 },
  snow: { base: 95, tower: 60, size: 50, flat: 0.7, lit: 1.0, shade: 0.5, tint: [0.95, 0.97, 1.0], curtains: 5, share: 0.9 },
  ash: { base: 80, tower: 260, size: 52, flat: 1.0, lit: 0.5, shade: 0.16, tint: [0.78, 0.68, 0.6], curtains: 0, share: 1 },
  fog: { base: 6, tower: 14, size: 70, flat: 0.32, lit: 1.0, shade: 0.72, tint: [0.92, 0.94, 0.96], curtains: 0, share: 0.9 },
};

const PUFF_VERT = /* glsl */ `
attribute vec4 aPuff;   // centre (m), size (m)
attribute vec4 aLook;   // flatness, lit, shade, kind (0 puff, 1 curtain)
attribute vec4 aTint;   // rgb, opacity
varying vec2 vQ;
varying vec4 vLook, vTint;
varying vec3 vC, vUp, vRight, vTop;
#include <planet>
varying float vFade;
#include <fog_pars_vertex>
void main() {
  vec3 c = aPuff.xyz;
  vec3 up = normalize(c);
  vec3 toCam = cameraPosition - c;
  float d = length(toCam);
  vec3 f = toCam / d;
  vec3 right, top;
  if (aLook.w < 0.5) {
    // a puff faces the camera, squashed toward the ground
    right = normalize(cross(up, f));
    if (abs(dot(up, f)) > 0.999) right = normalize(cross(vec3(0.0, 0.0, 1.0), f));
    top = cross(f, right);
  } else {
    // a curtain stands upright and turns about its axis
    right = normalize(cross(up, f));
    top = up;
  }
  float s = aPuff.w;
  vec3 wp = c + right * position.x * s + top * position.y * s * (aLook.w < 0.5 ? mix(1.0, aLook.x, abs(dot(top, up))) : 1.0);
  if (aLook.w > 0.5) wp = c + right * position.x * s * 0.45 + up * (position.y * 0.5 - 0.5) * c.y * 0.0 + up * (position.y - 1.0) * aTint.w * 0.0;
  if (aLook.w > 0.5) wp = c + right * position.x * s * 0.45 + up * (position.y + 1.0) * 0.5 * (length(c) - uPlanet.y) * -1.0;
  vQ = position.xy;
  vLook = aLook;
  vTint = aTint;
  vC = c; vUp = up; vRight = right; vTop = top;
  // puffs the camera is about to fly through fade away
  vFade = smoothstep(s * 0.4, s * 1.2, d);
  vec4 mvPosition = viewMatrix * vec4(wp, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;

const PUFF_FRAG = /* glsl */ `
uniform float uFlashSys;
varying vec2 vQ;
varying vec4 vLook, vTint;
varying vec3 vC, vUp, vRight, vTop;
varying float vFade;
#include <fog_pars_fragment>
void main() {
  vec3 wp = vFogWorld;
  float a;
  vec3 col;
  float e = dot(vUp, uSunDir);
  float shade = planetShade(wp, uSunDir);
  vec3 sun = keyAt(1, e) * shade * smoothstep(-0.05, 0.05, e);
  vec3 sky = keyAt(2, e) + vec3(0.02, 0.025, 0.04);
  if (vLook.w < 0.5) {
    float r2 = dot(vQ, vQ);
    if (r2 > 1.0) discard;
    // a soft ball: its normal from where on the disc the fragment is, lit by the sun from its side
    vec3 n = normalize(vRight * vQ.x + vTop * vQ.y + normalize(cameraPosition - vC) * sqrt(1.0 - r2));
    float nz = texture(uNoise, vQ * 0.35 + vC.xz * 0.003 + uTime * 0.002).r;
    float lit = clamp(dot(n, uSunDir) * 0.6 + 0.4, 0.0, 1.0);
    float under = clamp(dot(n, vUp) * 0.5 + 0.5, 0.0, 1.0);
    col = vTint.rgb * (sun * mix(vLook.z, vLook.y, lit) * 1.6 + sky * mix(0.35, 0.8, under) * mix(vLook.z, 1.0, 0.5));
    col += vec3(0.75, 0.8, 1.0) * uFlashSys * 2.0 * (0.4 + nz);
    a = smoothstep(1.0, 0.35, r2 + (nz - 0.5) * 0.7) * vTint.w;
  } else {
    // a rain curtain: streaks falling, thinning toward its edges and the sea
    float x = vQ.x, y = vQ.y * 0.5 + 0.5;
    float streak = texture(uNoise, vec2(x * 1.7 + vC.x * 0.01, y * 0.25 + uTime * 0.6)).g;
    a = smoothstep(1.0, 0.3, abs(x)) * smoothstep(0.0, 0.25, y) * smoothstep(1.0, 0.7, y) * (0.5 + streak) * vTint.w;
    col = vTint.rgb * (sun * 0.25 + sky * 0.55);
  }
  a *= vFade;
  gl_FragColor = vec4(col, a);
  #include <fog_fragment>
}`;

// ---------------------------------------------------------------- the air inside

const FALL_VERT = /* glsl */ `
attribute float aEnd;
uniform vec3 uE1, uUp, uE2, uVel;
uniform float uSpan, uLen, uAmount;
varying float vEnd, vA;
#include <fog_pars_vertex>
void main() {
  // drops in a box round the camera that wraps as they fall and as the camera moves
  vec3 off = vec3(dot(cameraPosition, uE1), dot(cameraPosition, uUp), dot(cameraPosition, uE2));
  vec3 q = mod(position + uVel * uTime - off, uSpan) - uSpan * 0.5;
  q += normalize(uVel) * uLen * aEnd;
  vec3 wp = cameraPosition + uE1 * q.x + uUp * q.y + uE2 * q.z;
  vEnd = aEnd;
  vA = step(position.x / uSpan, uAmount) * smoothstep(uSpan * 0.5, uSpan * 0.25, length(q));
  vec4 mvPosition = viewMatrix * vec4(wp, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  gl_PointSize = 2.0;
  #include <fog_vertex>
}`;

const FALL_FRAG = /* glsl */ `
uniform vec3 uFallColor;
uniform float uGlow;
varying float vEnd, vA;
#include <fog_pars_fragment>
void main() {
  if (vA <= 0.0) discard;
  vec3 up = normalize(vFogWorld);
  float e = dot(up, uSunDir);
  vec3 light = keyAt(2, e) + keyAt(1, e) * max(e, 0.0) * 0.5 + vec3(0.03);
  gl_FragColor = vec4(uFallColor * mix(light, vec3(1.0), uGlow), vA * mix(0.55, 0.15, vEnd));
  #include <fog_fragment>
}`;

const DROPS = 2400;

export class Weather {
  readonly group = new THREE.Group();
  /** Lightning in the thunder systems: one flicker for them all. */
  flash = 0;
  private readonly geo: THREE.InstancedBufferGeometry;
  private readonly puff: THREE.InstancedBufferAttribute;
  private readonly look: THREE.InstancedBufferAttribute;
  private readonly tint: THREE.InstancedBufferAttribute;
  private readonly mat: THREE.ShaderMaterial;
  private readonly fall: THREE.LineSegments;
  private readonly fallU: Record<string, THREE.IUniform>;
  private readonly cap: number;
  private puffs = 30;
  private readonly order: { d: number; i: number }[] = [];
  private readonly scratch = { c: new Float32Array(0), l: new Float32Array(0), t: new Float32Array(0) };

  constructor(puffsPerSystem: number) {
    this.puffs = puffsPerSystem;
    this.cap = MAX_SYSTEMS * (Math.ceil(puffsPerSystem * 1.2) + 10);
    this.geo = new THREE.InstancedBufferGeometry();
    this.geo.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0], 3));
    this.geo.setIndex([0, 1, 2, 0, 2, 3]);
    this.puff = new THREE.InstancedBufferAttribute(new Float32Array(this.cap * 4), 4).setUsage(THREE.DynamicDrawUsage);
    this.look = new THREE.InstancedBufferAttribute(new Float32Array(this.cap * 4), 4).setUsage(THREE.DynamicDrawUsage);
    this.tint = new THREE.InstancedBufferAttribute(new Float32Array(this.cap * 4), 4).setUsage(THREE.DynamicDrawUsage);
    this.geo.setAttribute('aPuff', this.puff);
    this.geo.setAttribute('aLook', this.look);
    this.geo.setAttribute('aTint', this.tint);
    this.geo.instanceCount = 0;
    this.scratch = { c: new Float32Array(this.cap * 4), l: new Float32Array(this.cap * 4), t: new Float32Array(this.cap * 4) };
    this.mat = new THREE.ShaderMaterial({
      vertexShader: PUFF_VERT, fragmentShader: PUFF_FRAG, uniforms: { ...U, uFlashSys: { value: 0 } }, fog: true,
      transparent: true, depthWrite: false, side: THREE.DoubleSide,
    });
    this.mat.userData.planet = true;
    const clouds = new THREE.Mesh(this.geo, this.mat);
    clouds.frustumCulled = false;
    clouds.renderOrder = 2;
    clouds.name = 'clouds';
    this.group.add(clouds);

    // the drops: a fixed scatter of short segments, moved and wrapped in the shader
    const pos = new Float32Array(DROPS * 6), end = new Float32Array(DROPS * 2);
    let s = 7;
    const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
    for (let i = 0; i < DROPS; i++) {
      const x = (i / DROPS) * 40, y = rnd() * 40, z = rnd() * 40;
      pos.set([x, y, z, x, y, z], i * 6);
      end[i * 2 + 1] = 1;
    }
    const fg = new THREE.BufferGeometry();
    fg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    fg.setAttribute('aEnd', new THREE.BufferAttribute(end, 1));
    this.fallU = {
      ...U, uE1: { value: new THREE.Vector3() }, uUp: { value: new THREE.Vector3() }, uE2: { value: new THREE.Vector3() },
      uVel: { value: new THREE.Vector3(0, -14, 0) }, uSpan: { value: 40 }, uLen: { value: 0.7 }, uAmount: { value: 0 },
      uFallColor: { value: new THREE.Color(0.75, 0.8, 0.9) }, uGlow: { value: 0 },
    };
    const fm = new THREE.ShaderMaterial({ vertexShader: FALL_VERT, fragmentShader: FALL_FRAG, uniforms: this.fallU, fog: true, transparent: true, depthWrite: false });
    fm.userData.planet = true;
    this.fall = new THREE.LineSegments(fg, fm);
    this.fall.frustumCulled = false;
    this.fall.renderOrder = 3;
    this.fall.visible = false;
    this.fall.name = 'precipitation';
    this.group.add(this.fall);
  }

  setPuffs(n: number): void {
    this.puffs = Math.min(n, Math.floor((this.cap / MAX_SYSTEMS - 10) / 1.2));
  }

  /**
   * Lays out each system's formation, sorts the puffs back to front, and fills the air round the camera. Returns how
   * deep the camera is in each kind of weather.
   */
  update(systems: readonly WeatherSystem[], eye: THREE.Vector3, dt: number, out: WeatherDepth = {}): WeatherDepth {
    for (const k of Object.keys(out) as WeatherKind[]) out[k] = 0;
    const { c: C, l: L, t: T } = this.scratch;
    let n = 0;
    const up = new THREE.Vector3(), e1 = new THREE.Vector3(), e2 = new THREE.Vector3(), p = new THREE.Vector3();
    const camUp = eye.clone().normalize();
    let thunder = false;
    systems.slice(0, MAX_SYSTEMS).forEach((sys, si) => {
      // how deep the camera is in it
      up.set(sys.at.x, sys.at.y, sys.at.z).normalize();
      const along = Math.acos(Math.min(1, Math.max(-1, up.dot(camUp)))) * R;
      const depth = sys.strength * smooth(sys.radius, sys.radius * 0.55, along) * smooth(500, 150, eye.length() - R);
      out[sys.kind] = Math.max(out[sys.kind] ?? 0, depth);
      if (sys.kind === 'thunder' && sys.strength > 0.3) thunder = true;
      const look = LOOKS[sys.kind];
      if (!look || sys.strength <= 0.01) return;
      // the system's own frame and a fixed scatter of puffs in it
      e1.set(0, 1, 0).cross(up);
      if (e1.lengthSq() < 1e-6) e1.set(1, 0, 0);
      e1.normalize();
      e2.crossVectors(up, e1);
      let s = (si + 1) * 9973 + sys.kind.length * 131;
      const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
      const count = Math.min(Math.round(this.puffs * look.share), Math.floor(this.cap / MAX_SYSTEMS) - look.curtains - 1);
      const rad = sys.radius * 0.8;
      const fade = Math.min(1, sys.strength * 1.4);
      for (let i = 0; i < count && n < this.cap; i++) {
        // more puffs toward the middle, the tall ones there too
        const r = Math.sqrt(rnd()) * rad, a = rnd() * Math.PI * 2, mid = 1 - r / rad;
        const tall = look.tower * mid * mid * rnd();
        const h = look.base + tall + rnd() * 18;
        const size = look.size * (0.6 + rnd() * 0.7) * (0.7 + mid * 0.5);
        p.copy(up).multiplyScalar(R + h).addScaledVector(e1, Math.cos(a) * r).addScaledVector(e2, Math.sin(a) * r);
        p.normalize().multiplyScalar(R + h);
        C.set([p.x, p.y, p.z, size], n * 4);
        const dark = sys.kind === 'thunder' || sys.kind === 'rain' ? 1 - 0.4 * (h - look.base) / Math.max(1, look.tower + 18) : 1;
        L.set([look.flat, look.lit * (2 - dark), look.shade * dark, 0], n * 4);
        T.set([look.tint[0], look.tint[1], look.tint[2], 0.92 * fade], n * 4);
        n++;
      }
      // rain hanging under the cloud
      for (let i = 0; i < look.curtains && n < this.cap; i++) {
        const r = Math.sqrt(rnd()) * rad * 0.7, a = rnd() * Math.PI * 2;
        p.copy(up).multiplyScalar(R + look.base).addScaledVector(e1, Math.cos(a) * r).addScaledVector(e2, Math.sin(a) * r);
        p.normalize().multiplyScalar(R + look.base);
        C.set([p.x, p.y, p.z, sys.radius * 0.5], n * 4);
        L.set([1, 1, 1, 1], n * 4);
        T.set(sys.kind === 'snow' ? [0.95, 0.97, 1, 0.22 * fade] : [0.6, 0.64, 0.7, 0.3 * fade], n * 4);
        n++;
      }
    });
    // back to front
    const ord = this.order;
    ord.length = 0;
    for (let i = 0; i < n; i++) {
      const dx = C[i * 4] - eye.x, dy = C[i * 4 + 1] - eye.y, dz = C[i * 4 + 2] - eye.z;
      ord.push({ d: dx * dx + dy * dy + dz * dz, i });
    }
    ord.sort((a, b) => b.d - a.d);
    const pa = this.puff.array as Float32Array, la = this.look.array as Float32Array, ta = this.tint.array as Float32Array;
    ord.forEach(({ i }, k) => {
      pa.set(C.subarray(i * 4, i * 4 + 4), k * 4);
      la.set(L.subarray(i * 4, i * 4 + 4), k * 4);
      ta.set(T.subarray(i * 4, i * 4 + 4), k * 4);
    });
    this.geo.instanceCount = n;
    for (const a of [this.puff, this.look, this.tint]) { a.clearUpdateRanges(); a.addUpdateRange(0, n * 4); a.needsUpdate = true; }
    // distant lightning inside the thunderheads
    if (thunder && Math.random() < dt / 2.5) this.flash = 1;
    this.flash = Math.max(0, this.flash - dt * 4);
    this.mat.uniforms.uFlashSys.value = this.flash > 0.6 || (this.flash > 0.25 && this.flash < 0.4) ? this.flash : 0;
    this.air(out, eye);
    return out;
  }

  /** Rain, snow or embers round the camera, by whichever it is deepest in. */
  private air(depth: WeatherDepth, eye: THREE.Vector3): void {
    const rain = Math.max(depth.rain ?? 0, depth.thunder ?? 0), snow = depth.snow ?? 0, ash = depth.ash ?? 0;
    const most = Math.max(rain, snow, ash);
    this.fall.visible = most > 0.02;
    if (!this.fall.visible) return;
    const u = this.fallU, up = u.uUp.value as THREE.Vector3, e1 = u.uE1.value as THREE.Vector3, e2 = u.uE2.value as THREE.Vector3;
    up.copy(eye).normalize();
    e1.set(0, 1, 0).cross(up);
    if (e1.lengthSq() < 1e-6) e1.set(1, 0, 0);
    e1.normalize();
    e2.crossVectors(up, e1);
    u.uAmount.value = most;
    const vel = u.uVel.value as THREE.Vector3;
    if (rain === most) { vel.set(1.5, -16, 0.8); u.uLen.value = 0.9; (u.uFallColor.value as THREE.Color).setRGB(0.7, 0.75, 0.85); u.uGlow.value = 0; }
    else if (snow === most) { vel.set(0.9, -1.6, 0.5); u.uLen.value = 0.05; (u.uFallColor.value as THREE.Color).setRGB(1, 1, 1); u.uGlow.value = 0.2; }
    else { vel.set(0.4, 0.9, 0.3); u.uLen.value = 0.08; (u.uFallColor.value as THREE.Color).setRGB(2.4, 0.9, 0.25); u.uGlow.value = 1; }
  }
}

function smooth(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

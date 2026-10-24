// The render swell: a sum of great-circle Gerstner waves (adapted from the legacy ocean) whose weights follow the
// wind over the waters in view, so the sea runs with the wind and is seamless everywhere on the sphere, poles
// included. One function in two languages: SWELL_GLSL moves the sea surface (and anything drawn on it) on the GPU,
// and Swell.displace, sample and ride are its TypeScript twin, so ships and floating things ride the surface drawn.
// The sea fields (height, coast distance, lagoon and reef) go to the GPU as one half-float cube texture whose texels
// sit on the sim's equal-angle cells, so hardware filtering is seamless across the cube's edges.
import * as THREE from 'three';
import type { V3 } from '../sim/math.ts';
import { R, TERRITORY } from '../sim/sphere.ts';
import { heightAt, ZONE, type Geography } from '../sim/world/geography.ts';
import { FLOOR } from '../sim/world/regions.ts';

const WAVES = 16;
/** World units per s²: how fast each wavelength runs (deep-water dispersion, ω² = g·k). */
export const GRAVITY = 14;
const waveA: THREE.Vector4[] = []; // axis xyz (each wave runs toward it along great circles), wavenumber k
const waveB: THREE.Vector4[] = []; // amplitude, angular frequency, phase, steepness
for (let i = 0; i < WAVES; i++) {
  const y = 1 - (2 * (i + 0.5)) / WAVES, r = Math.sqrt(1 - y * y), th = i * 2.39996323; // golden-angle spiral
  const lambda = 4 * Math.pow(8, ((i * 7) % WAVES) / (WAVES - 1)); // 4–32 u
  const k = (2 * Math.PI) / lambda;
  waveA.push(new THREE.Vector4(r * Math.cos(th), y, r * Math.sin(th), k));
  waveB.push(new THREE.Vector4(lambda * 0.03, Math.sqrt(GRAVITY * k), (i * 1.618) % (2 * Math.PI), 0.6));
}

/**
 * GLSL (vertex or fragment). vec4 seaField(dir): x height above mean sea level, y signed coast distance (u, > 0 in
 * navigable water), z lagoon, w reef. float swellAmp(depth). vec3 swell(dir, t, amp, out normal, out lift): the
 * displacement of the surface point at rest direction dir (add it to dir·(SEA_R + uSeaLevel)); lift is its height
 * in units of amp (crests > 0).
 */
export const SWELL_GLSL = /* glsl */ `
#define SEA_R ${R.toFixed(1)}
#define WAVES ${WAVES}
uniform samplerCube tSeaField;
uniform vec4 uWaveA[WAVES];
uniform vec4 uWaveB[WAVES];
uniform float uSwellAmp;
uniform vec3 uWindAxis;
uniform float uWind;
uniform float uSeaLevel;
vec4 seaField(vec3 p) {
  vec3 q = p / max(max(abs(p.x), abs(p.y)), abs(p.z)); // the texels hold equal-angle cells: warp the lookup to match
  return textureLod(tSeaField, atan(q) * 1.2732395, 0.0);
}
float swellAmp(float depth) {
  return uSwellAmp * (0.55 + 0.45 * min(uWind, 1.4)) * (0.15 + 0.85 * smoothstep(0.3, 10.0, depth));
}
vec3 swell(vec3 p, float t, float amp, out vec3 normal, out float lift) {
  vec3 wt = cross(uWindAxis, p);
  wt /= max(length(wt), 1e-4);
  float wgt[WAVES];
  float total = 1e-3;
  for (int i = 0; i < WAVES; i++) {
    vec3 D = uWaveA[i].xyz;
    float c = dot(p, D), sq = 1.0 - c * c;
    wgt[i] = sq * sq * smoothstep(-0.1, 0.9, dot(D - c * p, wt) * inversesqrt(max(sq, 1e-8)));
    total += wgt[i];
  }
  float h = 0.0, fold = 0.0;
  vec3 hv = vec3(0.0), s = vec3(0.0);
  for (int i = 0; i < WAVES; i++) {
    float w = wgt[i] / total;
    if (w < 1e-3) continue;
    vec4 A = uWaveA[i], B = uWaveB[i];
    float c = dot(p, A.xyz);
    vec3 tg = (A.xyz - c * p) * inversesqrt(max(1.0 - c * c, 1e-8));
    float a = B.x * amp * w;
    float ph = A.w * SEA_R * asin(clamp(c, -1.0, 1.0)) - B.y * t + B.z;
    float sn = sin(ph), cs = cos(ph);
    h += a * sn;
    hv += tg * (B.w * a * cs);
    s += tg * (a * A.w * cs);
    fold += B.w * a * A.w * sn;
  }
  normal = normalize(p * (1.0 - fold) - s);
  lift = h / max(amp, 1e-3);
  return p * h + hv;
}
`;

const HALF_ONE = THREE.DataUtils.toHalfFloat(1);

/**
 * The six faces of the sea-field cube (RGBA half floats: height, coast distance, lagoon, reef), in the GL cube-map
 * order and orientation: face f is the sim's face f (+x −x +y −y +z −z), s runs with the sim's u and t against v.
 */
export function seaFieldFaces(geo: Geography): Uint16Array[] {
  const N = TERRITORY.n, NN = N * N, half = THREE.DataUtils.toHalfFloat;
  const faces: Uint16Array[] = [];
  for (let f = 0; f < 6; f++) {
    const out = new Uint16Array(NN * 4);
    for (let j = 0; j < N; j++) {
      for (let i = 0; i < N; i++) {
        const c = f * NN + (N - 1 - j) * N + i, o = (j * N + i) * 4;
        out[o] = half(geo.heights[c]);
        out[o + 1] = half(geo.coast[c]);
        out[o + 2] = geo.zones[c] & ZONE.lagoon ? HALF_ONE : 0;
        out[o + 3] = geo.floor[c] === FLOOR.coral ? HALF_ONE : 0;
      }
    }
    faces.push(out);
  }
  return faces;
}

/** Bytes of GPU memory the sea-field cube takes. */
export const SEA_FIELD_BYTES = 6 * TERRITORY.n * TERRITORY.n * 8;

function seaFieldTexture(geo: Geography): THREE.CubeTexture {
  const N = TERRITORY.n;
  const faces = seaFieldFaces(geo).map((d) => new THREE.DataTexture(d, N, N, THREE.RGBAFormat, THREE.HalfFloatType));
  const cube = new THREE.CubeTexture(faces as unknown as HTMLImageElement[]);
  cube.format = THREE.RGBAFormat;
  cube.type = THREE.HalfFloatType;
  cube.minFilter = cube.magFilter = THREE.LinearFilter;
  cube.generateMipmaps = false;
  cube.needsUpdate = true;
  return cube;
}

const smoothstep = (a: number, b: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

export interface SwellSample {
  /** Height of the surface above mean sea level, the tide included, u. */
  height: number;
  readonly normal: THREE.Vector3;
}

export interface Riding {
  /** Where the hull's centre floats. */
  readonly position: THREE.Vector3;
  /** The deck's up: the plane through its bow, stern, port and starboard waterline points. */
  readonly up: THREE.Vector3;
}

export class Swell {
  readonly field: THREE.CubeTexture;
  /** Shared by every material that rides the swell (spread them in; members are shared by reference). */
  readonly uniforms = {
    tSeaField: { value: null as unknown as THREE.CubeTexture },
    uWaveA: { value: waveA },
    uWaveB: { value: waveB },
    /** Master amplitude: 1 in fair weather (calm and squall scale it). */
    uSwellAmp: { value: 1 },
    /** The wind over the waters in view, as the axis it turns round (see setWind), and its strength 0–1.4. */
    uWindAxis: { value: new THREE.Vector3(0, 1, 0) },
    uWind: { value: 0.8 },
    /** The tide: sea level above mean, u. */
    uSeaLevel: { value: 0 },
  };
  private readonly wgt = new Float64Array(WAVES);
  private readonly d = { h: 0, hv: new THREE.Vector3(), s: new THREE.Vector3(), fold: 0 };
  private readonly q = new THREE.Vector3();
  private readonly t1 = new THREE.Vector3();
  private readonly t2 = new THREE.Vector3();
  private readonly t3 = new THREE.Vector3();
  private readonly t4 = new THREE.Vector3();
  private readonly pts = [0, 1, 2, 3].map(() => new THREE.Vector3());
  private readonly one: SwellSample = { height: 0, normal: new THREE.Vector3() };

  private readonly geo: Geography;

  constructor(geo: Geography) {
    this.geo = geo;
    this.field = seaFieldTexture(geo);
    this.uniforms.tSeaField.value = this.field;
  }

  /** The wind at p blows toward the tangent `toward` with `strength`; it turns round one axis over the waters in view. */
  setWind(p: V3, toward: V3, strength: number): void {
    this.uniforms.uWindAxis.value.set(p.y * toward.z - p.z * toward.y, p.z * toward.x - p.x * toward.z, p.x * toward.y - p.y * toward.x).normalize();
    this.uniforms.uWind.value = strength;
  }

  /** The rest-direction displacement sums at unit q (the GLSL swell, less the normalisation). */
  private sums(q: THREE.Vector3, t: number): void {
    const u = this.uniforms, level = u.uSeaLevel.value, depth = level - heightAt(this.geo, q);
    const amp = u.uSwellAmp.value * (0.55 + 0.45 * Math.min(u.uWind.value, 1.4)) * (0.15 + 0.85 * smoothstep(0.3, 10, depth));
    const wt = this.t1.crossVectors(u.uWindAxis.value, q), wl = Math.max(wt.length(), 1e-4);
    let total = 1e-3;
    for (let i = 0; i < WAVES; i++) {
      const D = waveA[i], c = q.x * D.x + q.y * D.y + q.z * D.z, sq = 1 - c * c;
      const al = ((D.x - c * q.x) * wt.x + (D.y - c * q.y) * wt.y + (D.z - c * q.z) * wt.z) / wl / Math.sqrt(Math.max(sq, 1e-8));
      this.wgt[i] = sq * sq * smoothstep(-0.1, 0.9, al);
      total += this.wgt[i];
    }
    const d = this.d;
    d.h = 0; d.fold = 0; d.hv.set(0, 0, 0); d.s.set(0, 0, 0);
    for (let i = 0; i < WAVES; i++) {
      const w = this.wgt[i] / total;
      if (w < 1e-3) continue;
      const A = waveA[i], B = waveB[i], c = q.x * A.x + q.y * A.y + q.z * A.z;
      const il = 1 / Math.sqrt(Math.max(1 - c * c, 1e-8));
      const tx = (A.x - c * q.x) * il, ty = (A.y - c * q.y) * il, tz = (A.z - c * q.z) * il;
      const a = B.x * amp * w, ph = A.w * R * Math.asin(Math.max(-1, Math.min(1, c))) - B.y * t + B.z;
      const sn = Math.sin(ph), cs = Math.cos(ph), qa = B.w * a * cs, sl = a * A.w * cs;
      d.h += a * sn;
      d.hv.x += tx * qa; d.hv.y += ty * qa; d.hv.z += tz * qa;
      d.s.x += tx * sl; d.s.y += ty * sl; d.s.z += tz * sl;
      d.fold += B.w * a * A.w * sn;
    }
  }

  /** Where the sea surface point at rest direction `rest` lies at time t (the sea mesh's vertex, exactly). */
  displace(rest: V3, t: number, out: THREE.Vector3): THREE.Vector3 {
    const q = this.q.set(rest.x, rest.y, rest.z).normalize();
    this.sums(q, t);
    return out.copy(q).multiplyScalar(R + this.uniforms.uSeaLevel.value + this.d.h).add(this.d.hv);
  }

  /** The surface straight above unit direction p at time t: finds the rest point the swell carried over p. */
  sample(p: V3, t: number, out: SwellSample): SwellSample {
    const q = this.q.set(p.x, p.y, p.z).normalize(), d = this.d;
    for (let it = 0; ; it++) {
      this.sums(q, t);
      if (it === 3) break;
      q.set(p.x - d.hv.x / R, p.y - d.hv.y / R, p.z - d.hv.z / R).normalize();
    }
    out.height = this.uniforms.uSeaLevel.value + d.h;
    out.normal.copy(q).multiplyScalar(1 - d.fold).sub(d.s).normalize();
    return out;
  }

  /** A hull of `length` and `beam` at p heading along the tangent `forward`, floating on the swell at time t. */
  ride(p: V3, forward: V3, length: number, beam: number, t: number, out: Riding): Riding {
    const up = this.t2.set(p.x, p.y, p.z).normalize();
    const fwd = this.t3.set(forward.x, forward.y, forward.z).addScaledVector(up, -up.dot(forward)).normalize();
    const side = this.t4.crossVectors(up, fwd); // port
    const offs = [[length / 2, 0], [-length / 2, 0], [0, beam / 2], [0, -beam / 2]];
    let mean = 0;
    for (let i = 0; i < 4; i++) {
      const pt = this.pts[i].copy(up).multiplyScalar(R).addScaledVector(fwd, offs[i][0]).addScaledVector(side, offs[i][1]).normalize();
      const h = this.sample(pt, t, this.one).height;
      pt.multiplyScalar(R + h);
      mean += h / 4;
    }
    const [bow, stern, port, star] = this.pts;
    out.up.crossVectors(bow.sub(stern), port.sub(star)).normalize();
    out.position.copy(up).multiplyScalar(R + mean);
    return out;
  }

  dispose(): void {
    this.field.dispose();
  }
}

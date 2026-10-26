import * as THREE from 'three';
import type { V3 } from '../sim/math.ts';
import { R, TERRITORY } from '../sim/sphere.ts';
import { heightAt, ZONE, type Geography } from '../sim/world/geography.ts';
import { FLOOR } from '../sim/world/regions.ts';

const WAVES = 16;
export const GRAVITY = 14;
const waveA: THREE.Vector4[] = [];
const waveB: THREE.Vector4[] = [];
for (let i = 0; i < WAVES; i++) {
  const y = 1 - (2 * (i + 0.5)) / WAVES, r = Math.sqrt(1 - y * y), th = i * 2.39996323;
  const lambda = 4 * Math.pow(8, ((i * 7) % WAVES) / (WAVES - 1));
  const k = (2 * Math.PI) / lambda;
  waveA.push(new THREE.Vector4(r * Math.cos(th), y, r * Math.sin(th), k));
  waveB.push(new THREE.Vector4(lambda * 0.03, Math.sqrt(GRAVITY * k), (i * 1.618) % (2 * Math.PI), 0.6));
}

export const SWELL_GLSL =  `
#define SEA_R ${R.toFixed(1)}
#define WAVES ${WAVES}
uniform samplerCube tSeaField;
uniform vec4 uWaveA[WAVES];
uniform vec4 uWaveB[WAVES];
uniform float uSwellAmp;
uniform vec3 uWindAxis;
uniform float uWind;
uniform float uSeaLevel;
vec4 cubeAt(samplerCube t, vec3 p) {
  vec3 q = p / max(max(abs(p.x), abs(p.y)), abs(p.z));
  return textureLod(t, atan(q) * 1.2732395, 0.0);
}
vec4 seaField(vec3 p) { vec4 f = cubeAt(tSeaField, p); return vec4(f.xyz, max(f.w, 0.0)); }
float beachAt(vec3 p) { return max(-cubeAt(tSeaField, p).w, 0.0); }
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

function cubeFaces<A extends Uint8Array | Uint16Array>(make: (n: number) => A, put: (out: A, o: number, c: number) => void): A[] {
  const N = TERRITORY.n, NN = N * N, faces: A[] = [];
  for (let f = 0; f < 6; f++) {
    const out = make(NN * 4);
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) put(out, (j * N + i) * 4, f * NN + (N - 1 - j) * N + i);
    faces.push(out);
  }
  return faces;
}

export function seaFieldFaces(geo: Geography, beach: Float32Array): Uint16Array[] {
  const half = THREE.DataUtils.toHalfFloat;
  return cubeFaces((n) => new Uint16Array(n), (out, o, c) => {
    out[o] = half(geo.heights[c]);
    out[o + 1] = half(geo.coast[c]);
    out[o + 2] = geo.zones[c] & ZONE.lagoon ? HALF_ONE : 0;
    out[o + 3] = geo.floor[c] === FLOOR.coral ? HALF_ONE : beach[c] > 0 ? half(-beach[c]) : 0;
  });
}

export function seaFloorFaces(geo: Geography): Uint8Array[] {
  return cubeFaces((n) => new Uint8Array(n), (out, o, c) => {
    const fl = geo.floor[c];
    out[o] = fl === FLOOR.rock || fl === FLOOR.ice ? 255 : 0;
    out[o + 1] = fl === FLOOR.kelp ? 255 : 0;
    out[o + 2] = fl === FLOOR.mud ? 255 : 0;
    out[o + 3] = fl === FLOOR.blackSand ? 255 : 0;
  });
}

export const SEA_FIELD_BYTES = 6 * TERRITORY.n * TERRITORY.n * 8;
export const SEA_FLOOR_BYTES = 6 * TERRITORY.n * TERRITORY.n * 4;

export function cubeTexture(faces: (Uint8Array | Uint16Array)[], type: THREE.TextureDataType): THREE.CubeTexture {
  const N = TERRITORY.n;
  const cube = new THREE.CubeTexture(faces.map((d) => new THREE.DataTexture(d, N, N, THREE.RGBAFormat, type)) as unknown as HTMLImageElement[]);
  cube.format = THREE.RGBAFormat;
  cube.type = type;
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
  height: number;
  readonly normal: THREE.Vector3;
}

export interface Riding {
  readonly position: THREE.Vector3;
  readonly up: THREE.Vector3;
}

export class Swell {
  readonly field: THREE.CubeTexture;
  readonly uniforms = {
    tSeaField: { value: null as unknown as THREE.CubeTexture },
    uWaveA: { value: waveA },
    uWaveB: { value: waveB },
    uSwellAmp: { value: 1 },
    uWindAxis: { value: new THREE.Vector3(0, 1, 0) },
    uWind: { value: 0.8 },
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

  constructor(geo: Geography, beach: Float32Array) {
    this.geo = geo;
    this.field = cubeTexture(seaFieldFaces(geo, beach), THREE.HalfFloatType);
    this.uniforms.tSeaField.value = this.field;
  }

  setWind(p: V3, toward: V3, strength: number): void {
    this.uniforms.uWindAxis.value.set(p.y * toward.z - p.z * toward.y, p.z * toward.x - p.x * toward.z, p.x * toward.y - p.y * toward.x).normalize();
    this.uniforms.uWind.value = strength;
  }

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

  displace(rest: V3, t: number, out: THREE.Vector3): THREE.Vector3 {
    const q = this.q.set(rest.x, rest.y, rest.z).normalize();
    this.sums(q, t);
    return out.copy(q).multiplyScalar(R + this.uniforms.uSeaLevel.value + this.d.h).add(this.d.hv);
  }

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

  ride(p: V3, forward: V3, length: number, beam: number, t: number, out: Riding): Riding {
    const up = this.t2.set(p.x, p.y, p.z).normalize();
    const fwd = this.t3.set(forward.x, forward.y, forward.z).addScaledVector(up, -up.dot(forward)).normalize();
    const side = this.t4.crossVectors(up, fwd);
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

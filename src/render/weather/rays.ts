// God rays: shafts of sunlight slanting down through breaks in the cloud and through mist, brightest when you look
// toward the sun. Each shaft runs from the sea straight up toward the sun until it reaches the cloud, comes and goes
// as the cloud drifts, and is laid out on the GPU from its seed and its spot. Spots come from the caller (Mistwood,
// the Fjords' valleys) and from the edges of every rain, thunder, snow and fog system by day.
import * as THREE from 'three';
import { FRAG_END, instancedQuad, seeds, shaderMesh, weatherMaterial, type Shared } from './common.ts';
import type { WeatherSpot, WeatherSystem } from './types.ts';

const SPOTS = 10, PER = 26;

const VERT = /* glsl */ `
attribute vec4 aSeed;
uniform vec4 uSpot[${SPOTS}];  // centre, radius
uniform vec4 uSpotB[${SPOTS}]; // amount, top height
varying vec2 vUv;
varying float vA, vSeed, vLen;
varying vec3 vWorld;
void main() {
  int k = gl_InstanceID / ${PER};
  vec4 S = uSpot[k], B = uSpotB[k];
  vec3 c = normalize(S.xyz), e, n;
  tangents(c, e, n);
  float a = aSeed.x * 6.2832, d = sqrt(aSeed.y) * S.w;
  vec3 up = expMap(c, (e * cos(a) + n * sin(a)) * d);
  vec3 base = up * (uRadius - 1.0);
  float el = max(dot(uSunDir, up), 0.1);
  float len = min(B.y / el, 170.0);
  vec3 top = base + uSunDir * len;
  vec3 mid = (base + top) * 0.5;
  vec3 side = cross(uSunDir, cameraPosition - mid);
  float l = length(side);
  side = l > 1e-5 ? side / l : e;
  float w = mix(1.5, 7.0, aSeed.z * aSeed.z);
  vec3 p = mix(base, top, position.y + 0.5) + side * position.x * w;
  // shafts come and go as the cloud above them drifts
  float on = smoothstep(0.45, 0.75, texture2D(uNoise, vec2(aSeed.w * 7.0 + uTime * 0.006, aSeed.x * 3.0)).r);
  vA = B.x * on * smoothstep(-0.02, 0.12, dot(uSunDir, up));
  vUv = uv; vSeed = aSeed.w; vLen = len; vWorld = p;
  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
}`;

const FRAG = /* glsl */ `
varying vec2 vUv;
varying float vA, vSeed, vLen;
varying vec3 vWorld;
void main() {
  if (vA < 0.002) discard;
  float x = abs(vUv.x - 0.5) * 2.0, y = vUv.y;
  float across = (1.0 - x * x) * (1.0 - x * x);
  float along = smoothstep(0.0, 0.06, y) * smoothstep(1.0, 0.45, y);
  // motes and thin spots drift through the beam
  float grain = 0.7 + 0.3 * texture2D(uNoise, vec2(vUv.x * 0.6 + vSeed * 11.0, y * vLen * 0.01 - uTime * 0.01)).g;
  vec3 up = normalize(vWorld);
  float h = length(vWorld) - uRadius;
  vec3 v = normalize(vWorld - cameraPosition);
  float toward = pow(max(dot(v, uSunDir), 0.0), 3.0) * 2.2 + 0.25;
  vec3 col = sunColor(up, h) * 0.07 * across * along * grain * toward * vA;
  gl_FragColor = vec4(hazeAdd(col, length(vWorld - cameraPosition)) * uGain, 1.0);
  ${FRAG_END}
}`;

/** Where each kind's deck sits, so the shafts under it end at its base. */
const TOPS: Partial<Record<WeatherSystem['kind'], number>> = { rain: 52, thunder: 48, snow: 58, fog: 26 };

export class Rays {
  readonly mesh: THREE.Mesh;
  private readonly g: THREE.InstancedBufferGeometry;
  private readonly u = {
    uSpot: { value: Array.from({ length: SPOTS }, () => new THREE.Vector4()) },
    uSpotB: { value: Array.from({ length: SPOTS }, () => new THREE.Vector4()) },
  };

  constructor(shared: Shared, seed: number) {
    this.g = instancedQuad(0);
    this.g.setAttribute('aSeed', seeds(SPOTS * PER, seed + 31));
    this.mesh = shaderMesh(this.g, weatherMaterial(shared, this.u, VERT, FRAG, { additive: true, side: THREE.DoubleSide }), 4);
  }

  update(systems: readonly WeatherSystem[], spots: readonly WeatherSpot[] | undefined): void {
    let n = 0;
    const put = (at: { x: number; y: number; z: number }, radius: number, amount: number, top: number): void => {
      if (n >= SPOTS || amount < 0.01) return;
      this.u.uSpot.value[n].set(at.x, at.y, at.z, radius);
      this.u.uSpotB.value[n].set(amount, top, 0, 0);
      n++;
    };
    for (const s of spots ?? []) put(s.at, s.radius, s.amount, 75);
    for (const s of systems) {
      const top = TOPS[s.kind];
      if (top !== undefined) put(s.at, s.radius * 1.05, s.intensity * (s.kind === 'fog' ? 0.8 : 0.55), top);
    }
    this.g.instanceCount = n * PER;
    this.mesh.visible = n > 0;
  }
}

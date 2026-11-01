// Mist rolling out of Mistwood: low silver banks are born among the trunks and creep outward over the still water,
// spreading and thinning as they leave the forest. In the fog surge (amount near 1) they pour out past its edge.
// Every puff's life runs on the GPU from its seed; the CPU only sets where the forest is and how much it breathes.
import * as THREE from 'three';
import { PUFF_GLSL } from './clouds.ts';
import { FRAG_END, frameAt, instancedQuad, newFrame, seeds, shaderMesh, weatherMaterial, type Shared } from './common.ts';
import type { WeatherSpot } from './types.ts';

const VERT = /* glsl */ `
attribute vec4 aSeed;
uniform vec3 uC, uE, uN;
uniform float uR, uAmt;
varying vec2 vQ;
varying float vA, vSeed, vS;
varying vec3 vWorld, vRight, vBup, vFwd;
void main() {
  float life = 45.0 + 35.0 * aSeed.x;
  float age = fract(uTime / life + aSeed.y);
  float ang = aSeed.z * 6.2831853 + 0.2 * sin(uTime * 0.02 + aSeed.w * 20.0);
  // the stronger the surge, the further it rolls
  float reach = mix(0.9, 1.6, uAmt);
  float rho = (sqrt(aSeed.w) * 0.6 + age * reach) * uR;
  vec3 dir = expMap(uC, (uE * cos(ang) + uN * sin(ang)) * rho);
  float h = 1.5 + 8.0 * fract(aSeed.x * 7.7) * (1.0 - 0.5 * age);
  vec3 c = dir * (uRadius + h);
  float s = (12.0 + 20.0 * age) * (0.75 + 0.5 * fract(aSeed.y * 13.1));
  vec3 toCam = normalize(cameraPosition - c);
  vec3 right = normalize(cross(dir, toCam) + vec3(1e-5, 0.0, 0.0)), bup = cross(toCam, right);
  float squash = mix(1.0, 0.38, 1.0 - abs(dot(toCam, dir)));
  vec3 p = c + right * position.x * s + bup * position.y * s * squash;
  // a share of the puffs only shows in the surge
  vA = sin(3.14159 * age) * smoothstep(fract(aSeed.z * 5.3), fract(aSeed.z * 5.3) + 0.3, uAmt * 1.3) * 0.42;
  vQ = position.xy * 2.0; vSeed = aSeed.x; vS = s; vWorld = p; vRight = right; vBup = bup; vFwd = toCam;
  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
}`;

const FRAG = /* glsl */ `
varying vec2 vQ;
varying float vA, vSeed, vS;
varying vec3 vWorld, vRight, vBup, vFwd;
${PUFF_GLSL}
void main() {
  vec4 c = shadePuff(vQ, vSeed, 0.55, vA, vec3(0.84, 0.89, 0.9), 0.85, vec3(0.0), 0.75, vWorld, vRight, vBup, vFwd, vS * 0.35);
  if (c.a < 0.003) discard;
  gl_FragColor = c;
  ${FRAG_END}
}`;

export class Mist {
  readonly mesh: THREE.Mesh;
  private readonly u = {
    uC: { value: new THREE.Vector3(0, 1, 0) }, uE: { value: new THREE.Vector3(1, 0, 0) }, uN: { value: new THREE.Vector3(0, 0, 1) },
    uR: { value: 100 }, uAmt: { value: 0 },
  };
  private readonly frame = newFrame();

  constructor(shared: Shared, quality: 'high' | 'low', seed: number) {
    const n = quality === 'high' ? 240 : 130, g = instancedQuad(n);
    g.setAttribute('aSeed', seeds(n, seed + 29));
    this.mesh = shaderMesh(g, weatherMaterial(shared, this.u, VERT, FRAG, { side: THREE.DoubleSide }), 5);
    this.mesh.visible = false;
  }

  update(spot: WeatherSpot | undefined): void {
    this.mesh.visible = !!spot && spot.amount > 0.01;
    if (!spot || !this.mesh.visible) return;
    const f = frameAt(spot.at, this.frame);
    this.u.uC.value.copy(f.c); this.u.uE.value.copy(f.e); this.u.uN.value.copy(f.n);
    this.u.uR.value = spot.radius;
    this.u.uAmt.value = spot.amount;
  }
}

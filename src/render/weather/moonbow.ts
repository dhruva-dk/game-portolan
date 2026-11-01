// The moonbow at Moonbow Arch: spray drifts up from the surf under the arch, and where you look 42 degrees from
// the point opposite the moon, the spray carries a pale bow, red outside and violet in, with a fainter reversed
// bow beyond. By day the sun makes it a full-colour rainbow. It forms only where the geometry is right, as a real
// one does: the light behind you, the spray ahead. So that the landmark always shows it, the bow is steered: its
// light comes from behind the viewer at the height that lays the 42-degree circle across the spray, while the
// real moon (or sun) decides whether it is lit at all.
import * as THREE from 'three';
import { PUFF_GLSL } from './clouds.ts';
import { FRAG_END, frameAt, instancedQuad, newFrame, seeds, shaderMesh, smoothstep, weatherMaterial, type Shared } from './common.ts';
import type { WeatherSpot } from './types.ts';

const SPOT = /* glsl */ `
uniform vec3 uC, uE, uN;
uniform float uR, uAmt;`;

const BOW_VERT = /* glsl */ `${SPOT}
varying vec2 vQ;
varying vec3 vWorld;
void main() {
  vec3 c = uC * (uRadius + uR * 0.42);
  vec3 up = uC, toCam = normalize(cameraPosition - c);
  vec3 right = normalize(cross(up, toCam) + vec3(1e-5, 0.0, 0.0)), bup = cross(toCam, right);
  vec3 p = c + right * position.x * uR * 2.6 + bup * position.y * uR * 1.3;
  vQ = position.xy * 2.0; vWorld = p;
  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
}`;

const BOW_FRAG = /* glsl */ `${SPOT}
uniform vec3 uLight, uLightC;
uniform float uWhite;
varying vec2 vQ;
varying vec3 vWorld;
vec3 spectrum(float x) { // 0 violet .. 1 red
  return vec3(smoothstep(0.42, 0.85, x) + smoothstep(0.18, 0.0, x) * 0.55,
              smoothstep(0.12, 0.48, x) * smoothstep(0.98, 0.58, x),
              smoothstep(0.58, 0.12, x));
}
float band(float x) { return smoothstep(-0.12, 0.12, x) * smoothstep(1.12, 0.88, x); }
void main() {
  vec3 d = normalize(vWorld - cameraPosition);
  float ang = degrees(acos(clamp(dot(d, -uLight), -1.0, 1.0)));
  float x1 = (ang - 40.4) / 2.2, x2 = (53.8 - ang) / 3.4;
  vec3 bow = spectrum(x1) * band(x1) + spectrum(x2) * band(x2) * 0.32 + vec3(smoothstep(40.5, 34.0, ang) * 0.1);
  bow = mix(bow, vec3(dot(bow, vec3(0.38))), uWhite);
  // only where there is spray: a soft billowing mass rising off the surf
  vec2 q = vQ * vec2(1.0, 1.0);
  float r2 = q.x * q.x + (q.y + 0.25) * (q.y + 0.25) * 1.3;
  float spray = smoothstep(1.0, 0.15, r2) * (0.35 + 0.65 * texture2D(uNoise, q * 0.45 + vec2(0.0, -uTime * 0.035)).r);
  spray *= smoothstep(-1.0, -0.6, q.y);
  vec3 col = bow * spray * uAmt * uLightC * 3.2;
  if (dot(col, col) < 1e-7) discard;
  gl_FragColor = vec4(hazeAdd(col, length(vWorld - cameraPosition)) * uGain, 1.0);
  ${FRAG_END}
}`;

const SPRAY_VERT = /* glsl */ `${SPOT}
attribute vec4 aSeed;
varying vec2 vQ;
varying float vA, vSeed, vS;
varying vec3 vWorld, vRight, vBup, vFwd;
void main() {
  float age = fract(uTime / (6.0 + 4.0 * aSeed.x) + aSeed.y);
  float a = aSeed.z * 6.2832, d = sqrt(aSeed.w) * uR * 0.55;
  vec3 dir = expMap(uC, (uE * cos(a) + uN * sin(a)) * (d + age * 6.0));
  vec3 c = dir * (uRadius + 1.0 + age * uR * 0.75);
  float s = (5.0 + 10.0 * age) * (0.7 + 0.6 * fract(aSeed.x * 9.1));
  vec3 toCam = normalize(cameraPosition - c), up = dir;
  vec3 right = normalize(cross(up, toCam) + vec3(1e-5, 0.0, 0.0)), bup = cross(toCam, right);
  vec3 p = c + (right * position.x + bup * position.y) * s;
  vA = sin(3.14159 * age) * uAmt * 0.22;
  vQ = position.xy * 2.0; vSeed = aSeed.x; vS = s; vWorld = p; vRight = right; vBup = bup; vFwd = toCam;
  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
}`;

const SPRAY_FRAG = /* glsl */ `
varying vec2 vQ;
varying float vA, vSeed, vS;
varying vec3 vWorld, vRight, vBup, vFwd;
${PUFF_GLSL}
void main() {
  vec4 c = shadePuff(vQ, vSeed, 0.7, vA, vec3(0.95, 0.97, 1.0), 0.8, vec3(0.0), 0.8, vWorld, vRight, vBup, vFwd, vS * 0.3);
  if (c.a < 0.003) discard;
  gl_FragColor = c;
  ${FRAG_END}
}`;

export class Moonbow {
  readonly group = new THREE.Group();
  private readonly u = {
    uC: { value: new THREE.Vector3(0, 1, 0) }, uE: { value: new THREE.Vector3(1, 0, 0) }, uN: { value: new THREE.Vector3(0, 0, 1) },
    uR: { value: 30 }, uAmt: { value: 0 },
    uLight: { value: new THREE.Vector3() }, uLightC: { value: new THREE.Color() }, uWhite: { value: 0.6 },
  };
  private readonly frame = newFrame();
  private readonly bow: THREE.Mesh;
  private readonly spray: THREE.Mesh;
  private readonly shared: Shared;
  private readonly c = new THREE.Vector3();
  private readonly up = new THREE.Vector3();

  constructor(shared: Shared, quality: 'high' | 'low', seed: number) {
    this.shared = shared;
    this.bow = shaderMesh(instancedQuad(1), weatherMaterial(shared, this.u, BOW_VERT, BOW_FRAG, { additive: true, side: THREE.DoubleSide }), 7);
    const n = quality === 'high' ? 70 : 40, g = instancedQuad(n);
    g.setAttribute('aSeed', seeds(n, seed + 17));
    this.spray = shaderMesh(g, weatherMaterial(shared, this.u, SPRAY_VERT, SPRAY_FRAG, { side: THREE.DoubleSide }), 5);
    this.group.add(this.spray, this.bow);
    this.group.visible = false;
  }

  update(spot: WeatherSpot | undefined, eye: THREE.Vector3): void {
    this.group.visible = !!spot && spot.amount > 0.01;
    if (!spot || !this.group.visible) return;
    const f = frameAt(spot.at, this.frame), u = this.u, sun = this.shared.uSunDir.value, moon = this.shared.uMoonDir.value;
    u.uC.value.copy(f.c); u.uE.value.copy(f.e); u.uN.value.copy(f.n);
    u.uR.value = spot.radius;
    u.uAmt.value = spot.amount;
    // the sun makes a rainbow by day; the moon a pale bow by night
    const sunUp = f.c.dot(sun), moonUp = f.c.dot(moon);
    if (sunUp > 0.0) {
      u.uLightC.value.setRGB(1, 0.95, 0.88).multiplyScalar(0.35 * smoothstep(0, 0.1, sunUp));
      u.uWhite.value = 0;
    } else {
      u.uLightC.value.setRGB(0.75, 0.82, 1).multiplyScalar(0.55 * smoothstep(-0.02, 0.1, moonUp) * smoothstep(0, -0.15, sunUp));
      u.uWhite.value = 0.55;
    }
    // steer the light behind the viewer, at the height that puts the bow through the middle of the spray
    const up = this.up.copy(eye).normalize(), to = this.c.copy(f.c).multiplyScalar(this.shared.uRadius.value + spot.radius * 0.35).sub(eye).normalize();
    const es = Math.asin(Math.max(-1, Math.min(1, to.dot(up))));
    const el = Math.max(0.07, Math.min(0.7, (41.4 * Math.PI) / 180 - es));
    to.addScaledVector(up, -to.dot(up));
    if (to.lengthSq() < 1e-8) to.copy(f.e);
    to.normalize().negate();
    u.uLight.value.copy(to).multiplyScalar(Math.cos(el)).addScaledVector(up, Math.sin(el)).normalize();
  }
}

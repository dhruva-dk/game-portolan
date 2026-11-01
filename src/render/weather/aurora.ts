// The aurora over the Ice Crown: three folded curtains of light ringing the north pole, green at their sharp lower
// hem and fading to violet above, with fine rays rippling along them. They show wherever the sky under them is
// dark, so the Ice Crown has them in polar night and the northern ring sees them low on the horizon.
import * as THREE from 'three';
import { FRAG_END, shaderMesh, weatherMaterial, type Shared } from './common.ts';

const VERT = /* glsl */ `
uniform float uAurora;
varying float vS, vV, vBand, vVis;
varying vec3 vWorld;
void main() {
  float s = position.x, v = position.y, band = position.z;
  float phi = s * 6.2831853, t = uTime;
  // the curtain folds and slowly writhes
  float theta = 0.19 + band * 0.075
    + 0.05 * sin(phi * 3.0 + t * 0.045 + band * 2.0)
    + 0.024 * sin(phi * 7.0 - t * 0.1 + band * 5.0)
    + 0.01 * sin(phi * 19.0 + t * 0.21 + band);
  float h = mix(125.0 + band * 18.0, 330.0 + band * 25.0, v);
  vec3 dir = vec3(sin(theta) * cos(phi), cos(theta), sin(theta) * sin(phi));
  vec3 p = dir * (uRadius + h);
  vVis = nightAt(dir) * uAurora;
  vS = s; vV = v; vBand = band; vWorld = p;
  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
}`;

const FRAG = /* glsl */ `
varying float vS, vV, vBand, vVis;
varying vec3 vWorld;
void main() {
  if (vVis < 0.003) discard;
  float t = uTime;
  float rays = 0.3 + 0.7 * smoothstep(0.3, 0.85, texture2D(uNoise, vec2(vS * 11.0 + t * 0.004, vBand * 0.37 + vV * 0.03 + t * 0.002)).b);
  float patch = smoothstep(0.3, 0.75, texture2D(uNoise, vec2(vS * 2.2 - t * 0.0025, vBand * 0.53 + t * 0.001)).r);
  float pulse = 0.75 + 0.25 * sin(t * 0.6 + vS * 40.0 + vBand * 3.0);
  float v = vV;
  float hem = smoothstep(0.0, 0.035, v) * exp(-v * 3.2);
  float veil = smoothstep(0.05, 0.5, v) * (1.0 - v) * 0.22;
  vec3 green = vec3(0.12, 1.0, 0.42), violet = vec3(0.62, 0.16, 0.72);
  vec3 col = mix(green, violet, smoothstep(0.3, 0.95, v)) * (hem + veil);
  col *= rays * patch * pulse * vVis * 2.4;
  gl_FragColor = vec4(hazeAdd(col, length(vWorld - cameraPosition) * 0.3) * uGain, 1.0);
  ${FRAG_END}
}`;

function curtains(bands: number, segments: number): THREE.BufferGeometry {
  const pos: number[] = [], idx: number[] = [];
  for (let b = 0; b < bands; b++) {
    const o = pos.length / 3;
    for (let i = 0; i <= segments; i++) pos.push(i / segments, 0, b, i / segments, 1, b);
    for (let i = 0; i < segments; i++) {
      const a = o + i * 2;
      idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  return g;
}

export class Aurora {
  readonly mesh: THREE.Mesh;
  private readonly u = { uAurora: { value: 0 } };

  constructor(shared: Shared) {
    this.mesh = shaderMesh(curtains(3, 360), weatherMaterial(shared, this.u, VERT, FRAG, { additive: true, side: THREE.DoubleSide }), -1);
  }

  /** strength 0–1; the shader hides whatever part of it is in daylight. */
  update(strength: number, sunDir: THREE.Vector3): void {
    this.u.uAurora.value = strength;
    // only drawn when some of the polar sky is dark
    this.mesh.visible = strength > 0.01 && sunDir.y < 0.35;
  }
}

// Calm water: where a calm system sits, the sea goes glassy. A thin cap lies on the water under each calm system
// and adds a broken path of sun glitter (moon glitter at night) and a faint mirrored sky, over whatever water the
// host draws. The host should also still its own waves with WeatherLocal.calm.
import * as THREE from 'three';
import { FRAG_END, shaderMesh, weatherMaterial, type Shared } from './common.ts';
import type { WeatherSystem } from './types.ts';

const MAX = 6;

const VERT = /* glsl */ `
attribute vec4 aC; // centre, radius
attribute vec4 aI; // intensity, seed
varying vec3 vWorld;
varying vec2 vLocal;
varying float vEdge, vAmt;
void main() {
  vec3 c = normalize(aC.xyz), e, n;
  tangents(c, e, n);
  vec2 d = position.xy * aC.w;
  vec3 p = expMap(c, e * d.x + n * d.y) * (uRadius + 0.18);
  vLocal = d + aI.y * 300.0;
  vEdge = length(position.xy);
  vAmt = aI.x;
  vWorld = p;
  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
}`;

const FRAG = /* glsl */ `
varying vec3 vWorld;
varying vec2 vLocal;
varying float vEdge, vAmt;
void main() {
  vec3 up = normalize(vWorld), e, n;
  tangents(up, e, n);
  float t = uTime;
  // a slow, low swell
  vec2 uv = vLocal * 0.03 + vec2(t * 0.006, t * 0.004);
  float h0 = texture2D(uNoise, uv).g, hx = texture2D(uNoise, uv + vec2(0.01, 0.0)).g, hy = texture2D(uNoise, uv + vec2(0.0, 0.01)).g;
  vec3 nrm = normalize(up + (e * (h0 - hx) + n * (h0 - hy)) * 1.6);
  vec3 v = normalize(vWorld - cameraPosition);
  vec3 r = reflect(v, nrm);
  // glitter: the swell is covered in tiny facets that catch the light and let it go
  float f1 = texture2D(uNoise, vLocal * 0.55 + vec2(t * 0.09, -t * 0.06)).b;
  float f2 = texture2D(uNoise, vLocal * 0.8 + vec2(-t * 0.07, t * 0.1)).b;
  float facet = smoothstep(0.42, 0.62, f1 * f2 * 1.8);
  float s = max(dot(r, uSunDir), 0.0), m = max(dot(r, uMoonDir), 0.0);
  vec3 col = sunColor(up, 0.0) * (pow(s, 28.0) * facet * 7.0 + pow(s, 700.0) * 14.0);
  col += moonColor(up) * (pow(m, 40.0) * facet * 22.0 + pow(m, 600.0) * 30.0);
  // where the water stills it mirrors the sky
  float fres = pow(1.0 - max(dot(-v, nrm), 0.0), 5.0);
  col += skyAmbient(up) * fres * 0.4;
  col *= smoothstep(1.0, 0.65, vEdge) * vAmt;
  gl_FragColor = vec4(hazeAdd(col, length(vWorld - cameraPosition)) * uGain, 1.0);
  ${FRAG_END}
}`;

/** A unit disc as a polar grid, dense at the middle. */
function disc(rings: number, sectors: number): THREE.BufferGeometry {
  const pos: number[] = [0, 0, 0], idx: number[] = [];
  for (let i = 1; i <= rings; i++) {
    const r = Math.pow(i / rings, 1.4);
    for (let j = 0; j < sectors; j++) {
      const a = (j / sectors) * Math.PI * 2;
      pos.push(Math.cos(a) * r, Math.sin(a) * r, 0);
    }
  }
  for (let j = 0; j < sectors; j++) idx.push(0, 1 + j, 1 + ((j + 1) % sectors));
  for (let i = 1; i < rings; i++) {
    const a0 = 1 + (i - 1) * sectors, b0 = 1 + i * sectors;
    for (let j = 0; j < sectors; j++) {
      const j1 = (j + 1) % sectors;
      idx.push(a0 + j, b0 + j, b0 + j1, a0 + j, b0 + j1, a0 + j1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  return g;
}

export class Shimmer {
  readonly mesh: THREE.Mesh;
  private readonly c: THREE.InstancedBufferAttribute;
  private readonly i: THREE.InstancedBufferAttribute;
  private readonly g: THREE.InstancedBufferGeometry;

  constructor(shared: Shared) {
    const base = disc(28, 72);
    this.g = new THREE.InstancedBufferGeometry();
    this.g.index = base.index;
    this.g.setAttribute('position', base.getAttribute('position'));
    this.c = new THREE.InstancedBufferAttribute(new Float32Array(MAX * 4), 4).setUsage(THREE.DynamicDrawUsage);
    this.i = new THREE.InstancedBufferAttribute(new Float32Array(MAX * 4), 4).setUsage(THREE.DynamicDrawUsage);
    this.g.setAttribute('aC', this.c);
    this.g.setAttribute('aI', this.i);
    this.mesh = shaderMesh(this.g, weatherMaterial(shared, {}, VERT, FRAG, { additive: true }), 1);
  }

  update(systems: readonly WeatherSystem[]): void {
    let n = 0;
    const c = this.c.array as Float32Array, i = this.i.array as Float32Array;
    for (const s of systems) {
      if (s.kind !== 'calm' || s.intensity < 0.01 || n >= MAX) continue;
      const o = n++ * 4;
      c[o] = s.at.x; c[o + 1] = s.at.y; c[o + 2] = s.at.z; c[o + 3] = s.radius * 1.1;
      i[o] = s.intensity; i[o + 1] = (s.id * 0.618) % 1;
    }
    this.c.needsUpdate = this.i.needsUpdate = true;
    this.g.instanceCount = n;
    this.mesh.visible = n > 0;
  }
}

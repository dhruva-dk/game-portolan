// The shield aura: a translucent shell of hexes round the hull that brightens as the shield fills, ripples out from
// each hit, cracks as it weakens, shatters into shards with a flash when it breaks, and shimmers back into place,
// knitting up from the waterline, when it is refilled. Each state can be triggered on its own from the dev page.
import * as THREE from 'three';
import { GPU, TAU, rand } from './common.ts';
import { auraNodeMaterial } from './tsl/aura.ts';

/** The shell's size round the ship (half-axes in metres) and its centre over the hull's origin. */
export const SHELL = { x: 6.4, y: 8.2, z: 12.6, cy: 4.2 };
const HITS = 4;

const VERT = /* glsl */ `
varying vec3 vN, vV, vL;
void main() {
  vL = position;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vN = normalize(normalMatrix * normal);
  vV = -mv.xyz;
  gl_Position = projectionMatrix * mv;
}`;

const FRAG = /* glsl */ `
uniform float uFill, uCrack, uShimmer, uFlash, uTime, uVis;
uniform vec4 uHits[${HITS}];
uniform vec3 uColor;
varying vec3 vN, vV, vL;
float hexEdge(vec2 p) {
  p *= vec2(1.0, 1.1547);
  vec2 a = mod(p, vec2(1.0, 1.732)) - vec2(0.5, 0.866);
  vec2 b = mod(p - vec2(0.5, 0.866), vec2(1.0, 1.732)) - vec2(0.5, 0.866);
  vec2 g = dot(a, a) < dot(b, b) ? a : b;
  vec2 h = abs(g);
  float d = max(dot(h, vec2(0.5, 0.866)), h.x);
  return smoothstep(0.4, 0.5, d);
}
vec3 hash3(vec3 p) {
  p = vec3(dot(p, vec3(127.1, 311.7, 74.7)), dot(p, vec3(269.5, 183.3, 246.1)), dot(p, vec3(113.5, 271.9, 124.6)));
  return fract(sin(p) * 43758.5453);
}
// the gap between the nearest two cells: small along the cracks
float cracks(vec3 p) {
  vec3 i = floor(p), f = fract(p);
  float d1 = 8.0, d2 = 8.0;
  for (int z = -1; z <= 1; z++) for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
    vec3 g = vec3(float(x), float(y), float(z)), o = hash3(i + g);
    float d = length(g + o - f);
    if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) d2 = d;
  }
  return d2 - d1;
}
void main() {
  vec3 n = normalize(vN), v = normalize(vV);
  float fres = pow(clamp(1.0 - abs(dot(n, v)), 0.0, 1.0), 2.2);
  vec3 dir = normalize(vL);
  vec2 hp = vec2(atan(dir.z, dir.x) * 2.6, dir.y * 4.0);
  float hex = hexEdge(hp * 1.6);
  // a slow drift of light through the cells, stronger as the shield fills
  float drift = 0.5 + 0.5 * sin(dir.y * 9.0 - uTime * 1.7 + atan(dir.z, dir.x) * 3.0);
  float a = fres * (0.35 + 0.65 * uFill) + hex * (0.08 + 0.32 * uFill) * (0.7 + 0.3 * drift);
  // ripples out from each hit
  for (int i = 0; i < ${HITS}; i++) {
    vec4 h = uHits[i];
    if (h.w > 1.0) continue;
    float d = distance(dir, h.xyz);
    float ring = smoothstep(0.3, 0.0, abs(d - h.w * 2.6)) * (1.0 - h.w);
    float near = smoothstep(0.9, 0.0, d) * (1.0 - h.w);
    a += ring * (0.9 + hex * 2.0) + near * (0.3 + hex * 0.8);
  }
  // cracks spread through the shell as it weakens, flickering
  float c = cracks(dir * 3.2 + vec3(1.7));
  float line = smoothstep(0.06, 0.0, c - 0.02 * (1.0 - uCrack));
  float spread = smoothstep(1.0 - uCrack * 1.2, 1.0 - uCrack * 1.2 + 0.25, hash3(floor(dir * 3.2 + vec3(1.7))).x + 0.3);
  vec3 col = uColor;
  float crack = line * uCrack * (0.6 + 0.4 * spread) * (0.75 + 0.25 * sin(uTime * 23.0 + c * 40.0));
  a += crack * 1.6;
  col = mix(col, vec3(1.2, 1.6, 2.4), clamp(crack, 0.0, 1.0) * 0.6);
  // a refill knits the shell up from the waterline: unmade above the seam, a bright seam, settled below
  if (uShimmer > 0.0) {
    float h = mix(-1.15, 1.15, uShimmer), y = dir.y + 0.08 * sin(atan(dir.z, dir.x) * 5.0 + uTime * 4.0);
    float made = smoothstep(h + 0.04, h - 0.04, y);
    float seam = smoothstep(0.22, 0.0, abs(y - h));
    a = a * made + seam * (0.8 + hex * 2.5) * (1.0 - uShimmer * 0.4);
    col = mix(col, vec3(1.3, 1.9, 2.4), seam * 0.5);
  }
  a += uFlash * (1.0 + hex * 2.0);
  a *= uVis;
  gl_FragColor = vec4(col * a, 0.0);
}`;

export class Aura {
  readonly mesh: THREE.Mesh;
  private readonly u = {
    uFill: { value: 0 }, uCrack: { value: 0 }, uShimmer: { value: 0 }, uFlash: { value: 0 }, uVis: { value: 0 },
    uHits: { value: Array.from({ length: HITS }, () => new THREE.Vector4(0, 0, 1, 9)) },
    uColor: { value: new THREE.Color(0.35, 0.75, 1.6) },
    uTime: { value: 0 },
  };
  private fill = 0;
  private shimmer = -1;
  private next = 0;
  private readonly v = new THREE.Vector3();

  constructor(geo: THREE.BufferGeometry) {
    const m = GPU.on ? auraNodeMaterial(this.u, this.u.uHits.value) : new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: FRAG, uniforms: this.u, transparent: true, depthWrite: false, side: THREE.DoubleSide,
      blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor,
    });
    this.mesh = new THREE.Mesh(geo, m);
    this.mesh.renderOrder = 9;
    this.mesh.scale.set(SHELL.x, SHELL.y, SHELL.z);
    this.mesh.position.y = SHELL.cy;
    this.mesh.visible = false;
  }

  /** A ripple where a shot struck, given in world space. */
  hit(world: THREE.Vector3): void {
    this.mesh.updateWorldMatrix(true, false);
    this.mesh.worldToLocal(this.v.copy(world)).normalize();
    this.u.uHits.value[this.next].set(this.v.x, this.v.y, this.v.z, 0);
    this.next = (this.next + 1) % HITS;
  }

  /** Starts the shimmer back into place. */
  refill(): void {
    this.shimmer = 0;
  }

  /** The break's flash (the shards are thrown by the fleet's Shards). */
  flash(): void {
    this.u.uFlash.value = 1.4;
    this.shimmer = -1;
  }

  /** Follows the shield's fraction, smoothed; `alive` false lets it fade with a sinking ship. */
  update(frac: number, dt: number, t: number, alive: boolean): void {
    const u = this.u;
    u.uTime.value = t;
    this.fill += (frac - this.fill) * Math.min(1, dt * (frac > this.fill ? 3 : 8));
    if (frac <= 0.001) this.fill = Math.max(0, this.fill - dt * 4);
    u.uFill.value = this.fill;
    // cracks show from half strength down, all over the shell near empty
    u.uCrack.value = frac > 0.001 ? THREE.MathUtils.smoothstep(0.55 - frac, 0, 0.45) : 0;
    if (this.shimmer >= 0) {
      this.shimmer += dt / 0.9;
      if (this.shimmer >= 1) this.shimmer = -1;
    }
    u.uShimmer.value = Math.max(0, this.shimmer);
    u.uFlash.value = Math.max(0, u.uFlash.value - dt * 5);
    for (const h of u.uHits.value) if (h.w <= 1) h.w += dt * 1.6;
    const want = (frac > 0.001 || this.shimmer >= 0 || u.uFlash.value > 0.01) && alive ? 1 : 0;
    u.uVis.value += (want - u.uVis.value) * Math.min(1, dt * (want ? 10 : 4));
    this.mesh.visible = u.uVis.value > 0.01;
  }

  dispose(): void {
    (this.mesh.material as THREE.Material).dispose();
  }
}

// ---------------------------------------------------------------- the break's shards

interface Shard { p: THREE.Vector3; v: THREE.Vector3; q: THREE.Quaternion; w: THREE.Quaternion; life: number; age: number; s: number }

/** Shards of the broken shell, flying out, tumbling, falling to the sea and fading. One pool for the fleet. */
export class Shards {
  readonly mesh: THREE.InstancedMesh;
  private readonly list: Shard[] = [];
  private readonly tmp = new THREE.Object3D();
  private readonly mat: THREE.MeshBasicMaterial;

  constructor() {
    // a thin, sharp sliver of glass
    const g = new THREE.BufferGeometry();
    const p = [0, 0.9, 0, -0.35, -0.5, 0.05, 0.4, -0.6, -0.05, 0, 0.9, 0, 0.4, -0.6, -0.05, -0.35, -0.5, 0.05];
    g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
    g.computeVertexNormals();
    this.mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.9, 2.2, 4.2), transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });
    this.mesh = new THREE.InstancedMesh(g, this.mat, 600);
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(600 * 3), 3);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 9;
  }

  /** Throws shards out from the shell of `aura`, whose world matrix places it. */
  burst(aura: THREE.Object3D, n = 70): void {
    aura.updateWorldMatrix(true, false);
    const m = aura.matrixWorld, c = new THREE.Vector3().setFromMatrixPosition(m);
    for (let i = 0; i < n; i++) {
      if (this.list.length >= 600) this.list.shift();
      const a = Math.random() * TAU, e = Math.acos(rand(-0.6, 1));
      const local = new THREE.Vector3(Math.sin(e) * Math.cos(a), Math.cos(e), Math.sin(e) * Math.sin(a));
      const p = local.clone().applyMatrix4(m);
      const out = p.clone().sub(c).normalize();
      const v = out.multiplyScalar(rand(7, 18)).add(c.clone().normalize().multiplyScalar(rand(2, 7)));
      const w = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(rand(-1, 1), rand(-1, 1), rand(-1, 1)).normalize(), rand(4, 14));
      this.list.push({ p, v, q: new THREE.Quaternion().random(), w, life: rand(0.8, 1.6), age: 0, s: rand(0.4, 1.1) });
    }
  }

  update(dt: number): void {
    const up = new THREE.Vector3(), q = new THREE.Quaternion(), id = new THREE.Quaternion(), col = new THREE.Color();
    let n = 0;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const s = this.list[i];
      s.age += dt;
      if (s.age >= s.life) { this.list.splice(i, 1); continue; }
      up.copy(s.p).normalize();
      s.v.multiplyScalar(1 - dt * 1.2).addScaledVector(up, -14 * dt);
      s.p.addScaledVector(s.v, dt);
      q.copy(id).slerp(s.w, dt);
      s.q.multiply(q);
      const k = s.age / s.life, glow = (1 - k) * (1 - k);
      this.tmp.position.copy(s.p);
      this.tmp.quaternion.copy(s.q);
      this.tmp.scale.setScalar(s.s * (1 - k * 0.4));
      this.tmp.updateMatrix();
      this.mesh.setMatrixAt(n, this.tmp.matrix);
      this.mesh.setColorAt(n, col.setScalar(glow));
      n++;
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
}

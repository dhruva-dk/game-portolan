// Thunder: a warning glow builds in the cloud above the target and a ring tightens on the water under it, then a
// branching bolt strikes, flickers through two or three return strokes and lights the clouds, the sea and anything
// lit by the flash light. Thunder systems also flicker and throw bolts of their own for atmosphere.
import * as THREE from 'three';
import type { Flash } from './clouds.ts';
import { FRAG_END, frameAt, instancedQuad, newFrame, rng, shaderMesh, smoothstep, weatherMaterial, type Shared, type Vec3Like } from './common.ts';
import type { WeatherSystem } from './types.ts';

const BOLT_VERT = /* glsl */ `
attribute vec4 aA; // start, width
attribute vec4 aB; // end, brightness
varying vec2 vUv;
varying float vBright;
varying vec3 vWorld;
void main() {
  vec3 a = aA.xyz, b = aB.xyz;
  vec3 c = mix(a, b, position.y + 0.5);
  vec3 axis = b - a;
  vec3 side = cross(axis, cameraPosition - c);
  float l = length(side);
  side = l > 1e-5 ? side / l : vec3(1.0, 0.0, 0.0);
  float dist = length(cameraPosition - c);
  float w = max(aA.w, dist * uPixel * 4.0);
  vBright = aB.w * min(1.0, aA.w / w * 1.5);
  vec3 p = c + side * position.x * w;
  vUv = uv; vWorld = p;
  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
}`;

const BOLT_FRAG = /* glsl */ `
varying vec2 vUv;
varying float vBright;
varying vec3 vWorld;
void main() {
  float x = abs(vUv.x - 0.5) * 2.0;
  float core = exp(-x * x * 70.0), glow = exp(-x * x * 5.0);
  vec3 col = (vec3(1.0) * core * 9.0 + vec3(0.55, 0.62, 1.0) * glow * 0.9) * vBright;
  gl_FragColor = vec4(hazeAdd(col, length(vWorld - cameraPosition) * 0.5) * uGain, 1.0);
  ${FRAG_END}
}`;

const GLOW_VERT = /* glsl */ `
attribute vec4 aPos;  // centre, size
attribute vec4 aInfo; // kind (0 glow, 1 ring on the sea, 2 disc on the sea), brightness, ring radius (0-1), hue
varying vec2 vQ;
varying vec4 vInfo;
varying vec3 vWorld;
void main() {
  vec3 c = aPos.xyz, up = normalize(c);
  vec3 p;
  if (aInfo.x < 0.5) {
    vec3 toCam = normalize(cameraPosition - c);
    vec3 right = normalize(cross(up, toCam) + vec3(1e-5, 0.0, 0.0)), bup = cross(toCam, right);
    p = c + (right * position.x + bup * position.y) * aPos.w;
  } else {
    vec3 e, n;
    tangents(up, e, n);
    p = c + (e * position.x + n * position.y) * aPos.w;
  }
  vQ = position.xy * 2.0; vInfo = aInfo; vWorld = p;
  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
}`;

const GLOW_FRAG = /* glsl */ `
varying vec2 vQ;
varying vec4 vInfo;
varying vec3 vWorld;
void main() {
  float r = length(vQ), a;
  if (vInfo.x < 0.5) a = exp(-r * r * 5.0) + exp(-r * r * 40.0) * 0.8;
  else if (vInfo.x < 1.5) a = exp(-pow((r - vInfo.z) / 0.045, 2.0)) + exp(-pow((r - vInfo.z) / 0.16, 2.0)) * 0.25;
  else a = exp(-r * r * 6.0);
  vec3 col = mix(vec3(0.6, 0.62, 1.0), vec3(0.85, 0.9, 1.0), vInfo.w) * a * vInfo.y;
  if (a * vInfo.y < 0.002) discard;
  gl_FragColor = vec4(hazeAdd(col, length(vWorld - cameraPosition) * 0.6) * uGain, 1.0);
  ${FRAG_END}
}`;

interface Stroke { t: number; a: number }

interface Bolt {
  ground: THREE.Vector3;
  top: THREE.Vector3;
  warn: number;
  t: number;
  called: boolean;
  segs: number[];
  strokes: Stroke[];
  landed: boolean;
  /** An in-cloud flicker only: no channel to the sea. */
  sheet: boolean;
}

const LIFE = 0.95;

/** Brightness of a bolt tb seconds after it lands: sharp return strokes, then a fading channel. */
function envelope(b: Bolt, tb: number): number {
  if (tb < 0) return 0;
  let e = 0;
  for (const s of b.strokes) if (tb >= s.t) e += s.a * Math.exp(-(tb - s.t) / 0.04);
  return Math.min(1.4, e + 0.12 * Math.exp(-tb / 0.3)) * smoothstep(LIFE, LIFE - 0.25, tb);
}

export class Lightning {
  readonly group = new THREE.Group();
  readonly light: THREE.PointLight | null;
  /** Lightning lighting the clouds round it this frame. */
  readonly flashes: Flash[] = [];
  /** Flash brightness at the camera, 0–1. */
  flash = 0;
  private readonly bolts: Bolt[] = [];
  private readonly boltGeo: THREE.InstancedBufferGeometry;
  private readonly boltA: THREE.InstancedBufferAttribute;
  private readonly boltB: THREE.InstancedBufferAttribute;
  private readonly glowGeo: THREE.InstancedBufferGeometry;
  private readonly glowPos: THREE.InstancedBufferAttribute;
  private readonly glowInfo: THREE.InstancedBufferAttribute;
  private readonly next = new Map<number, number>();
  private readonly random: () => number;
  private readonly flashPool: Flash[] = Array.from({ length: 16 }, () => ({ pos: new THREE.Vector3(), power: 0 }));
  private readonly v = new THREE.Vector3();
  private readonly w = new THREE.Vector3();
  private readonly shared: Shared;
  private readonly ambient: boolean;
  private readonly onBolt?: (at: THREE.Vector3, distance: number, called: boolean) => void;

  constructor(shared: Shared, seed: number, light: boolean, ambient: boolean, onBolt?: (at: THREE.Vector3, distance: number, called: boolean) => void) {
    this.shared = shared;
    this.ambient = ambient;
    this.onBolt = onBolt;
    this.random = rng(seed ^ 0x1f1f1f);
    const cap = 1600;
    this.boltGeo = instancedQuad(0);
    this.boltA = new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4).setUsage(THREE.DynamicDrawUsage);
    this.boltB = new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4).setUsage(THREE.DynamicDrawUsage);
    this.boltGeo.setAttribute('aA', this.boltA);
    this.boltGeo.setAttribute('aB', this.boltB);
    const bm = weatherMaterial(shared, {}, BOLT_VERT, BOLT_FRAG, { additive: true, side: THREE.DoubleSide });
    this.group.add(shaderMesh(this.boltGeo, bm, 9));
    this.glowGeo = instancedQuad(0);
    this.glowPos = new THREE.InstancedBufferAttribute(new Float32Array(64 * 4), 4).setUsage(THREE.DynamicDrawUsage);
    this.glowInfo = new THREE.InstancedBufferAttribute(new Float32Array(64 * 4), 4).setUsage(THREE.DynamicDrawUsage);
    this.glowGeo.setAttribute('aPos', this.glowPos);
    this.glowGeo.setAttribute('aInfo', this.glowInfo);
    const gm = weatherMaterial(shared, {}, GLOW_VERT, GLOW_FRAG, { additive: true, side: THREE.DoubleSide });
    this.group.add(shaderMesh(this.glowGeo, gm, 9));
    this.light = light ? new THREE.PointLight(0xc4d0ff, 0, 0, 2) : null;
    if (this.light) this.group.add(this.light);
  }

  /**
   * Calls a strike at 'at' (a unit vector, or a world point on or above the sea). The warning glow builds for
   * 'warn' seconds, then the bolt lands. Pass warn 0 when the warning was already shown.
   */
  strike(at: Vec3Like, warn = 1.6, called = true): void {
    const R = this.shared.uRadius.value, r = this.random;
    const f = frameAt(at, newFrame()), up = f.c, e = f.e, n = f.n;
    const ground = up.clone().multiplyScalar(R);
    const a = r() * Math.PI * 2, d = 4 + r() * 12;
    const top = up.clone().multiplyScalar(R + 58 + r() * 10).addScaledVector(e, Math.cos(a) * d).addScaledVector(n, Math.sin(a) * d);
    const bolt: Bolt = { ground, top, warn, t: 0, called, segs: [], strokes: [], landed: false, sheet: false };
    this.build(bolt, e, n);
    if (this.bolts.length >= 4) this.bolts.shift();
    this.bolts.push(bolt);
  }

  private strokes(): Stroke[] {
    const r = this.random, out: Stroke[] = [{ t: 0, a: 1 }];
    let t = 0;
    const n = 1 + Math.floor(r() * 3);
    for (let k = 0; k < n; k++) {
      t += 0.06 + r() * 0.12;
      out.push({ t, a: 0.55 + r() * 0.4 });
    }
    return out;
  }

  /** Midpoint displacement from a to b, 2^levels segments, appended to the bolt; returns the points. */
  private channel(b: Bolt, a: THREE.Vector3, z: THREE.Vector3, levels: number, rough: number, width: number, bright: number, taper = true): THREE.Vector3[] {
    const r = this.random;
    let pts = [a.clone(), z.clone()];
    for (let l = 0; l < levels; l++) {
      const next: THREE.Vector3[] = [pts[0]];
      for (let i = 0; i < pts.length - 1; i++) {
        const p = pts[i], q = pts[i + 1], len = p.distanceTo(q), dir = this.v.subVectors(q, p).normalize();
        const j = this.w.set(r() - 0.5, r() - 0.5, r() - 0.5);
        j.addScaledVector(dir, -j.dot(dir)).normalize().multiplyScalar(len * rough * (0.5 + r() * 0.5));
        next.push(new THREE.Vector3().addVectors(p, q).multiplyScalar(0.5).add(j), q);
      }
      pts = next;
    }
    for (let i = 0; i < pts.length - 1; i++) {
      const f = taper ? 1 - (i / pts.length) * 0.5 : 1;
      const p = pts[i], q = pts[i + 1];
      b.segs.push(p.x, p.y, p.z, width * f, q.x, q.y, q.z, bright * f);
    }
    return pts;
  }

  private build(b: Bolt, e: THREE.Vector3, n: THREE.Vector3): void {
    const r = this.random, down = this.v.subVectors(b.ground, b.top).normalize().clone(), total = b.top.distanceTo(b.ground);
    b.strokes = this.strokes();
    const main = this.channel(b, b.top, b.ground, 7, 0.24, 0.35, 1, false);
    // branches fork downward and outward and die before the sea; a few fork again
    for (let i = 6; i < main.length - 20; i++) {
      if (r() > 0.075) continue;
      const left = 1 - i / main.length, out = new THREE.Vector3(r() - 0.5, r() - 0.5, r() - 0.5);
      out.addScaledVector(down, -out.dot(down)).normalize();
      const dir = down.clone().multiplyScalar(0.7).addScaledVector(out, 0.5 + r() * 0.6).normalize();
      const end = main[i].clone().addScaledVector(dir, total * left * (0.18 + r() * 0.3));
      const pts = this.channel(b, main[i], end, 5, 0.28, 0.28, 0.38);
      for (let k = 3; k < pts.length - 4; k++) {
        if (r() > 0.06) continue;
        const d2 = dir.clone().addScaledVector(out, r() - 0.3).normalize();
        this.channel(b, pts[k], pts[k].clone().addScaledVector(d2, total * left * 0.12), 4, 0.3, 0.22, 0.2);
      }
    }
    // crawlers spider along the cloud base
    const crawl = 2 + Math.floor(r() * 3);
    for (let k = 0; k < crawl; k++) {
      const a = r() * Math.PI * 2, end = b.top.clone().addScaledVector(e, Math.cos(a) * (20 + r() * 35)).addScaledVector(n, Math.sin(a) * (20 + r() * 35));
      end.addScaledVector(down, -4 + r() * 8);
      this.channel(b, b.top, end, 5, 0.3, 0.26, 0.32);
    }
  }

  /** In-cloud flicker without a channel, for atmosphere. */
  private sheet(at: THREE.Vector3): void {
    this.bolts.push({ ground: at.clone(), top: at.clone(), warn: 0, t: 0, called: false, segs: [], strokes: this.strokes(), landed: true, sheet: true });
    if (this.bolts.length > 6) this.bolts.shift();
  }

  update(dt: number, eye: THREE.Vector3, systems: readonly WeatherSystem[]): void {
    const R = this.shared.uRadius.value, r = this.random, time = this.shared.uTime.value;
    // thunder systems throw their own flickers and bolts
    if (this.ambient) {
      for (const s of systems) {
        if (s.kind !== 'thunder' || s.intensity < 0.45) continue;
        const due = this.next.get(s.id);
        if (due === undefined) { this.next.set(s.id, time + 1 + r() * 4); continue; }
        if (time < due) continue;
        this.next.set(s.id, time + (2.5 + r() * 7) / s.intensity);
        const { c: up, e, n } = frameAt(s.at, newFrame());
        const a = r() * Math.PI * 2, d = Math.sqrt(r()) * s.radius * 0.45;
        const p = up.clone().multiplyScalar(R).addScaledVector(e, Math.cos(a) * d).addScaledVector(n, Math.sin(a) * d);
        if (r() < 0.55) this.sheet(p.normalize().multiplyScalar(R + 70 + r() * 90));
        else this.strike(p, 0, false);
      }
    }
    this.flashes.length = 0;
    let glowN = 0, segN = 0, flash = 0, lightI = 0;
    const gp = this.glowPos.array as Float32Array, gi = this.glowInfo.array as Float32Array;
    const A = this.boltA.array as Float32Array, B = this.boltB.array as Float32Array;
    const glow = (p: THREE.Vector3, size: number, kind: number, bright: number, ring: number, hue: number): void => {
      if (glowN >= 64) return;
      const o = glowN++ * 4;
      gp[o] = p.x; gp[o + 1] = p.y; gp[o + 2] = p.z; gp[o + 3] = size;
      gi[o] = kind; gi[o + 1] = bright; gi[o + 2] = ring; gi[o + 3] = hue;
    };
    const lift = this.w;
    for (let i = this.bolts.length - 1; i >= 0; i--) {
      const b = this.bolts[i];
      b.t += dt;
      const tb = b.t - b.warn;
      if (tb > LIFE) { this.bolts.splice(i, 1); continue; }
      const far = 1 - Math.min(0.8, b.ground.distanceTo(eye) / 900);
      if (tb < 0) {
        // the warning: a glow building in the cloud, and a ring closing on the target
        const p = b.t / Math.max(b.warn, 1e-3), freq = 2 + 10 * p * p;
        const flick = 0.6 + 0.4 * Math.sin(b.t * freq * Math.PI * 2) * (r() < 0.15 ? 0 : 1);
        glow(b.top, 50, 0, (0.15 + 0.6 * p) * flick, 0, 0);
        glow(lift.copy(b.ground).normalize().multiplyScalar(R + 0.25), 16 - 12 * p, 1, 0.5 + 0.9 * p, 0.85, 0.2);
        glow(lift, 7, 2, 0.35 * p * flick, 0, 0.3);
        this.addFlash(b.top, 0.35 * p * flick);
        continue;
      }
      if (!b.landed) {
        b.landed = true;
        this.onBolt?.(b.ground.clone(), b.ground.distanceTo(eye), b.called);
      }
      const env = envelope(b, tb);
      flash = Math.max(flash, env * far);
      if (b.sheet) {
        this.addFlash(b.top, env * 2.2);
        continue;
      }
      this.addFlash(b.top, env * 2.6);
      this.addFlash(lift.copy(b.top).lerp(b.ground, 0.6), env * 1.2);
      lightI += env;
      if (this.light) this.light.position.copy(b.ground).normalize().multiplyScalar(R + 22);
      // the channel, flickering with its strokes
      const n = b.segs.length / 8;
      for (let k = 0; k < n && segN < 1600; k++, segN++) {
        const s = k * 8, o = segN * 4;
        A[o] = b.segs[s]; A[o + 1] = b.segs[s + 1]; A[o + 2] = b.segs[s + 2]; A[o + 3] = b.segs[s + 3];
        B[o] = b.segs[s + 4]; B[o + 1] = b.segs[s + 5]; B[o + 2] = b.segs[s + 6]; B[o + 3] = b.segs[s + 7] * env;
      }
      // the impact: a burst of light on the water and a ring racing out
      const g = lift.copy(b.ground).normalize().multiplyScalar(R + 2.5);
      glow(g, 16, 0, env * 2.5, 0, 1);
      glow(lift.copy(b.ground).normalize().multiplyScalar(R + 0.3), 3 + tb * 42, 1, 0.9 * (1 - tb / LIFE), 0.8, 1);
    }
    for (const a of [this.boltA, this.boltB, this.glowPos, this.glowInfo]) a.needsUpdate = true;
    this.boltGeo.instanceCount = segN;
    this.glowGeo.instanceCount = glowN;
    this.flash = Math.min(1, flash);
    if (this.light) this.light.intensity = Math.min(1.5, lightI) * 9000;
  }

  private addFlash(p: THREE.Vector3, power: number): void {
    if (power <= 0.01 || this.flashes.length >= this.flashPool.length) return;
    const f = this.flashPool[this.flashes.length];
    f.pos.copy(p);
    f.power = power;
    this.flashes.push(f);
  }

  /** True while a called strike is still warning or striking. */
  get busy(): boolean {
    return this.bolts.some((b) => b.called);
  }
}

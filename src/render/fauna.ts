// WP23: life. The animals of every region, placed from its habitats (REGIONS[].fauna) and seated on the geography:
// puffins on the stack tops and rafting below them, seals hauled out on rock and ice or bottling in the swell, otters
// on their backs in the kelp, curlews probing the Amber Shoals' flats, herons stalking the mangrove edges, turtles in
// the atolls' clear water (the shell below the surface seen through it), whales rolling and blowing in the Glass Sea,
// sounding with their flukes up and now and then breaching, dolphins leaping. No humans anywhere. Each is drawn as the
// engraver would: a silhouette in wash with an inked rim and contour hatching on an upright card facing the eye, its
// motion (wingbeats, probing, blows, leaps, ripples) in the shader. They react to ships: birds lift and fly off as a
// ship comes near and settle after it passes, seals rear and slip under, otters and turtles dive, dolphins come to ride
// the bow, whales sound when the guns start; by night puffins go to their burrows and waders roost, and the Glass
// Sea's blows and rings glow. Beyond LIFE.far, or too small to read, nothing is drawn. One draw for all of it, one for
// every gull (gull.ts).
import * as THREE from 'three';
import { cellOf, localFrame, R, TERRITORY } from '../sim/sphere.ts';
import { afloat, EVENT } from '../sim/state.ts';
import { hourOf, sunDir } from '../sim/weather.ts';
import { toWorld } from '../sim/world/geography.ts';
import { REGIONS } from '../sim/world/regions.ts';
import { inkMaterial } from '../style/glsl.ts';
import { rng } from './fx.ts';
import { GullFlock, linHex } from './gull.ts';
import { fleets } from './ships/shipView.ts';
import type { MatchFrame, RenderContext, RenderModule } from './world.ts';

export const SPECIES = ['puffin', 'seal', 'otter', 'wader', 'heron', 'turtle', 'whale', 'dolphin'] as const;
export type Animal = (typeof SPECIES)[number];
export const KIND = Object.fromEntries(SPECIES.map((s, k) => [s, k])) as Record<Animal, number>;
/** What a creature is doing: at ease; alarmed (aloft, rearing, diving, sounding); roosting. */
export const ACT = { idle: 0, alarm: 1, rest: 2 } as const;
/** Each species' drawn size (half its height, u), how near a ship may come before it shies (u; a pod comes to the bow within it), where it lives. */
const LIFE_OF: readonly { size: number; shy: number; at: 'any' | 'sea' | 'deep' | 'edge' }[] = [
  { size: 0.38, shy: 10, at: 'any' }, { size: 0.85, shy: 9, at: 'any' }, { size: 0.6, shy: 8, at: 'sea' }, { size: 0.5, shy: 12, at: 'edge' },
  { size: 0.95, shy: 9, at: 'edge' }, { size: 0.6, shy: 7, at: 'sea' }, { size: 4.2, shy: 0, at: 'deep' }, { size: 1, shy: 30, at: 'sea' },
];
/** Drawn within `far` u of the eye while size/distance ≥ `cull`, never smaller than `min` × distance; at most `cap`; whales sound at gunfire within `fire` u for `sound` s; dolphins ride `bow` u ahead. */
export const LIFE = { far: 170, cull: 0.0016, min: 0.0035, cap: 320, fire: 90, sound: 40, bow: 7 } as const;
const GLASS = REGIONS.findIndex((r) => /glass/i.test(r.name));
const BIRDS = new Set([KIND.puffin, KIND.wader, KIND.heron]);
const GUNS = new Set<number>([EVENT.broadside, EVENT.hit, EVENT.splash, EVENT.shell, EVENT.mortar]);
const TAU = 2 * Math.PI;

export interface Creature {
  readonly kind: number;
  readonly ri: number;
  /** Its place (unit), the ground's height there (u; ≤ 0 at sea), the height it is drawn at, whether it stands on land. */
  readonly home: THREE.Vector3;
  readonly ground: number;
  readonly seat: number;
  readonly land: boolean;
  readonly seed: number;
  /** Live: where it is (unit), its heading, what it is doing (ACT) and for how long, how far aloft a bird has risen (0…1). */
  readonly at: THREE.Vector3;
  readonly head: THREE.Vector3;
  act: number;
  time: number;
  lift: number;
}

const suits = (k: number, g: number): boolean => {
  const at = LIFE_OF[k].at;
  return at === 'any' || (at === 'sea' && g < -0.3) || (at === 'deep' && g < -3) || (at === 'edge' && g > -1.5 && g < 1.5);
};

/** Every region's animals (not its gulls: gull.ts), the same every time: each habitat's count sampled over its disc, re-drawn where the species cannot live. */
export function placeLife(height: (dir: THREE.Vector3) => number): Creature[] {
  const out: Creature[] = [], e = new THREE.Vector3(), n = new THREE.Vector3();
  REGIONS.forEach((region, ri) => region.fauna.forEach((h, hi) => {
    const k = SPECIES.indexOf(h.species as Animal);
    if (k < 0) return;
    const rand = rng(ri * 977 + hi * 131 + 7);
    for (let c = 0; c < h.count; c++) for (let tries = 0; tries < 10; tries++) {
      const a = rand() * TAU, r = h.r * Math.sqrt(rand()), home = new THREE.Vector3();
      toWorld(ri, h.x + r * Math.cos(a), h.y + r * Math.sin(a), home);
      const ground = height(home);
      if (!suits(k, ground)) continue;
      const land = ground > 0 && LIFE_OF[k].at !== 'sea' && LIFE_OF[k].at !== 'deep', turn = rand() * TAU;
      localFrame(home, e, n);
      out.push({ kind: k, ri, home, ground, seat: land ? ground : 0, land, seed: rand(), at: home.clone(), head: e.clone().multiplyScalar(Math.cos(turn)).addScaledVector(n, Math.sin(turn)), act: ACT.idle, time: 0, lift: 0 });
      break;
    }
  }));
  return out;
}

const E = new THREE.Vector3(), N = new THREE.Vector3(), T = new THREE.Vector3(), H = new THREE.Vector3(), W = new THREE.Vector3(), SUN = new THREE.Vector3();
const ease = (rate: number, dt: number) => 1 - Math.exp(-rate * dt);

export const faunas = new WeakMap<THREE.Object3D, Fauna>();

export class Fauna implements RenderModule {
  readonly creatures: Creature[];
  readonly gulls: GullFlock;
  readonly mesh: THREE.Mesh;
  /** 0 by day … 1 by night, over the eye. */
  night = 0;
  private readonly geo = new THREE.InstancedBufferGeometry();
  private readonly data: Float32Array[];
  private readonly attrs: THREE.InstancedBufferAttribute[];
  private readonly uniforms: Record<string, THREE.IUniform>;
  private readonly ships: THREE.Vector3[] = [];
  private readonly heads: THREE.Vector3[] = [];
  private readonly fire: THREE.Vector3[] = [];
  private clock = -1;
  private tick = -1;
  private readonly ctx: RenderContext;

  constructor(ctx: RenderContext) {
    this.ctx = ctx;
    const height = (d: THREE.Vector3) => ctx.world.geo.heights[cellOf(TERRITORY, d)];
    this.creatures = placeLife(height);
    const g = this.geo;
    g.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0], 3));
    g.setIndex([0, 1, 2, 0, 2, 3]);
    this.data = [0, 1, 2].map(() => new Float32Array(4 * LIFE.cap));
    this.attrs = ['aP', 'aF', 'aA'].map((name, k) => {
      const a = new THREE.InstancedBufferAttribute(this.data[k], 4).setUsage(THREE.DynamicDrawUsage);
      g.setAttribute(name, a);
      return a;
    });
    g.instanceCount = 0;
    const tints = (hexes: number[]) => ({ value: hexes.map(linHex) });
    this.uniforms = {
      uLifeClock: { value: 0 }, uLifeMin: { value: LIFE.min },
      uLInk: { value: linHex(0x2a2420) }, uLSea: { value: linHex(0x7fa3a6) }, uLFoam: { value: linHex(0xf4f0e6) }, uLGlow: { value: linHex(0x7ff0d0) }, uLBill: { value: linHex(0xe0782e) },
      uLCol: tints([0x2b2622, 0x8a7e70, 0x6b4a33, 0xa88a5e, 0x8b98a3, 0x6f7247, 0x46525e, 0x7d8a93]),
      uLPale: tints([0xf2ece0, 0xb9ad9c, 0xc9b393, 0xe6dcc6, 0xf0ece4, 0xa9a070, 0xd9dad6, 0xe3e4df]),
    };
    this.mesh = new THREE.Mesh(g, inkMaterial(ctx.pipeline.style, { vertexShader: VERT, fragmentShader: FRAG, uniforms: this.uniforms, inkWeight: 0.8, side: THREE.DoubleSide }));
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
    ctx.scene.add(this.mesh);
    this.gulls = new GullFlock(ctx, height);
    faunas.set(ctx.scene, this);
  }

  /** Cards drawn this frame. */
  get cards(): number {
    return this.geo.instanceCount;
  }

  /** Life's share of the frame (A9). */
  get triangles(): number {
    return 2 * this.cards + this.gulls.triangles;
  }

  get draws(): number {
    return (this.cards > 0 ? 1 : 0) + (this.gulls.count > 0 ? 1 : 0);
  }

  frame(f: MatchFrame): void {
    const st = f.state, eye = this.ctx.camera.position, dt = this.clock < 0 ? 0 : Math.min(0.1, Math.max(0, f.clock - this.clock));
    this.clock = f.clock;
    sunDir(hourOf(st), SUN);
    this.night = THREE.MathUtils.smoothstep(-SUN.dot(T.copy(eye).normalize()), -0.08, 0.12);
    this.ships.length = this.heads.length = 0;
    for (const s of st.ships) if (afloat(s)) {
      this.ships.push(new THREE.Vector3(s.was.x + (s.pos.x - s.was.x) * f.alpha, s.was.y + (s.pos.y - s.was.y) * f.alpha, s.was.z + (s.pos.z - s.was.z) * f.alpha).normalize());
      this.heads.push(new THREE.Vector3(s.head.x, s.head.y, s.head.z));
    }
    this.fire.length = 0;
    if (st.tick !== this.tick) for (const e of st.events) if (GUNS.has(e.kind)) this.fire.push(new THREE.Vector3(e.at.x, e.at.y, e.at.z).normalize());
    this.tick = st.tick;
    const [aP, aF, aA] = this.data;
    let n = 0;
    for (const c of this.creatures) {
      const d = W.copy(c.home).multiplyScalar(R).distanceTo(eye), size = LIFE_OF[c.kind].size * (0.85 + 0.3 * c.seed);
      if (d > LIFE.far) continue;
      this.live(c, dt, f.clock);
      if (size / d < LIFE.cull || n >= LIFE.cap) continue;
      if (c.kind === KIND.puffin && this.night > 0.5 && c.seed < 0.66) continue; // in their burrows
      const bird = BIRDS.has(c.kind), flying = bird && c.lift > 0.15;
      W.copy(c.at).multiplyScalar(R + c.seat + c.lift * (4 + 5 * c.seed));
      const j = 4 * n++;
      aP[j] = W.x; aP[j + 1] = W.y; aP[j + 2] = W.z; aP[j + 3] = size;
      aF[j] = c.head.x; aF[j + 1] = c.head.y; aF[j + 2] = c.head.z; aF[j + 3] = c.kind + (c.land && !flying ? 10 : 0);
      aA[j] = bird ? (flying ? ACT.alarm : c.act === ACT.rest ? ACT.rest : ACT.idle) : c.act;
      aA[j + 1] = c.time; aA[j + 2] = c.seed; aA[j + 3] = c.ri === GLASS ? this.night : 0;
    }
    this.geo.instanceCount = n;
    this.mesh.visible = n > 0;
    for (const a of this.attrs) a.needsUpdate = true;
    (this.uniforms.uLifeClock.value as number) = f.clock;
    this.gulls.frame(st, f.alpha, dt, f.clock, this.night, fleets.get(this.ctx.scene) ?? null, eye, this.ships, SUN);
  }

  dispose(): void {
    this.mesh.removeFromParent();
    this.geo.dispose();
    (this.mesh.material as THREE.Material).dispose();
    this.gulls.dispose();
  }

  /** A creature's reactions this frame: to the nearest ship, to gunfire, to the night. */
  private live(c: Creature, dt: number, clock: number): void {
    const k = c.kind, shy = LIFE_OF[k].shy;
    let near = Infinity, j = -1;
    this.ships.forEach((p, i) => { const d = p.distanceTo(c.at) * R; if (d < near) { near = d; j = i; } });
    c.time += dt;
    if (k === KIND.whale) {
      if (c.act !== ACT.alarm && this.fire.some((p) => p.distanceTo(c.home) * R < LIFE.fire)) { c.act = ACT.alarm; c.time = 0; }
      else if (c.act === ACT.alarm && c.time > LIFE.sound) { c.act = ACT.idle; c.time = 0; }
      return;
    }
    if (k === KIND.dolphin) { // to the bow of a ship within reach, or roaming its waters
      if (near < shy) {
        const p = this.ships[j], h = this.heads[j];
        T.copy(p).addScaledVector(h, LIFE.bow / R).addScaledVector(N.crossVectors(p, h), ((c.seed - 0.5) * 4) / R);
        H.copy(h);
      } else {
        localFrame(c.home, E, N);
        const a = clock * 0.08 + c.seed * TAU;
        T.copy(c.home).addScaledVector(E, (6 * Math.cos(a)) / R).addScaledVector(N, (6 * Math.sin(a)) / R);
        H.copy(E).multiplyScalar(-Math.sin(a)).addScaledVector(N, Math.cos(a));
      }
      c.at.lerp(T, ease(1.5, dt)).normalize();
      c.head.lerp(H, ease(2, dt)).addScaledVector(c.at, -c.head.dot(c.at)).normalize();
      return;
    }
    const bird = BIRDS.has(k);
    if (near < shy) {
      if (c.act !== ACT.alarm) {
        c.act = ACT.alarm;
        T.subVectors(c.at, this.ships[j]);
        T.addScaledVector(c.at, -T.dot(c.at));
        if (bird && T.lengthSq() > 1e-12) c.head.copy(T).normalize(); // off, away from the ship
      }
      c.time = Math.min(c.time, 1);
    } else if (c.act === ACT.alarm && c.time > 5 && near > shy * 1.5) c.act = ACT.idle;
    if (c.act !== ACT.alarm) c.act = this.night > 0.5 && (k === KIND.puffin || k === KIND.wader) ? ACT.rest : ACT.idle;
    if (bird) {
      const up = c.act === ACT.alarm ? 1 : 0;
      c.lift += (up - c.lift) * ease(up > c.lift ? 1.5 : 0.35, dt);
      c.at.copy(c.home).addScaledVector(c.head, (14 * c.lift) / R).normalize();
    }
  }
}

export const createFauna = (ctx: RenderContext): RenderModule => new Fauna(ctx);

const VERT = /* glsl */ `
uniform float uLifeMin;
attribute vec4 aP; // seat (world), size
attribute vec4 aF; // heading, species (+10 on land)
attribute vec4 aA; // act, its time, seed, glow
varying vec2 vQ;
varying vec4 vA;
varying float vKind;
varying vec3 vN;
void main() {
  vec3 up = normalize(aP.xyz), toEye = cameraPosition - aP.xyz;
  float dist = length(toEye);
  vec3 X = cross(up, toEye);
  float m = length(X);
  X = m > 1e-4 * dist ? X / m : aF.xyz;
  float s = max(aP.w, dist * uLifeMin);
  vec2 q = vec2(position.x * 1.05, 0.6 + 1.2 * position.y);
  vQ = vec2(dot(aF.xyz, X) < 0.0 ? -q.x : q.x, q.y);
  vA = aA;
  vKind = aF.w;
  vN = normalize(toEye / dist + up);
  gl_Position = projectionMatrix * viewMatrix * vec4(aP.xyz + (X * q.x + up * q.y) * s, 1.0);
}`;

// Each creature in card units (facing +x, the ground or waterline at y = 0, its size = 1): signed distances to its
// body (d) and inked details (m), masks for its pale parts, bill and markings, rings on the water (rip).
const FRAG = /* glsl */ `
uniform float uLifeClock;
uniform vec3 uLInk, uLSea, uLFoam, uLGlow, uLBill;
uniform vec3 uLCol[8];
uniform vec3 uLPale[8];
varying vec2 vQ;
varying vec4 vA;
varying float vKind;
varying vec3 vN;
float lHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float lNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(lHash(i), lHash(i + vec2(1.0, 0.0)), f.x), mix(lHash(i + vec2(0.0, 1.0)), lHash(i + vec2(1.0, 1.0)), f.x), f.y);
}
float sdE(vec2 p, vec2 c, vec2 r) { vec2 d = (p - c) / r; return (length(d) - 1.0) * min(r.x, r.y); }
float sdS(vec2 p, vec2 a, vec2 b, float w) { vec2 pa = p - a, ba = b - a; float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0); return length(pa - ba * h) - w; }
float smin(float a, float b, float k) { float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0); return mix(b, a, h) - k * h * (1.0 - h); }
vec2 rot(vec2 p, float a) { float c = cos(a), s = sin(a); return vec2(c * p.x - s * p.y, s * p.x + c * p.y); }
// two rings spreading on the water round a swimmer, seen low (flattened)
float ripple(vec2 q, float t, float r0, float fw) {
  float a = 0.0;
  for (int k = 0; k < 2; k++) {
    float ph = fract(t * 0.35 + float(k) * 0.5), d = abs(length(vec2(q.x, q.y * 7.0)) - r0 - 0.6 * ph);
    a = max(a, (1.0 - smoothstep(0.02, 0.02 + 2.0 * fw, d)) * (1.0 - ph));
  }
  return a * step(abs(q.y), 0.2);
}
void main() {
  int kind = int(mod(vKind, 10.0) + 0.5);
  bool land = vKind > 9.5;
  vec2 q = vQ;
  float act = vA.x, at = vA.y, seed = vA.z, glow = vA.w, t = uLifeClock + seed * 29.0, fw = fwidth(q.y) + 1e-5;
  float d = 1e3, m = 1e3, rip = 0.0, pale = 0.0, bill = 0.0, dark = 0.0, clip = -1e3, seen = 0.0;
  bool flying = act > 0.5 && act < 1.5;
  if (kind == 0) { // puffin: black back, white face and front, the striped bill, orange feet
    if (flying) {
      float body = sdE(q, vec2(0.0, 0.6), vec2(0.42, 0.17)), b = sdE(q, vec2(0.6, 0.64), vec2(0.1, 0.07));
      d = min(min(smin(body, sdE(q, vec2(0.4, 0.67), vec2(0.17, 0.15)), 0.06), sdS(q, vec2(-0.02, 0.66), vec2(-0.14, 0.66 + 0.55 * sin(t * 30.0)), 0.07)), b);
      d = min(d, sdE(q, vec2(-0.45, 0.55), vec2(0.08, 0.05)));
      bill = step(b, 0.0);
      pale = step(q.y, 0.56) * step(body, 0.0) + step(sdE(q, vec2(0.45, 0.68), vec2(0.09, 0.08)), 0.0);
    } else {
      float roost = act > 1.5 ? 1.0 : 0.0;
      vec2 o = vec2(0.0, land ? 0.0 : -0.38);
      float body = sdE(q, vec2(0.0, 0.55) + o, vec2(0.3, 0.48 - 0.06 * roost));
      vec2 hc = vec2(0.06 - 0.1 * roost, 1.1 - 0.18 * roost + 0.03 * sin(t * 1.7)) + o;
      float b = sdE(q, hc + vec2(0.27, -0.05), vec2(0.14, 0.12)), feet = land ? sdE(q, vec2(0.06, 0.04), vec2(0.15, 0.05)) : 1e3;
      d = min(min(smin(body, sdE(q, hc, vec2(0.24, 0.23)), 0.08), b), feet);
      bill = step(b, 0.0) + step(feet, 0.0);
      pale = step(body, 0.0) * step(0.02, q.x) * step(q.y, 0.95 + o.y) + step(sdE(q, hc + vec2(0.05, 0.0), vec2(0.15, 0.15)), 0.0);
      m = length(q - hc - vec2(0.09, 0.04)) - 0.035;
      if (!land) { clip = 0.0; rip = ripple(q, t, 0.4, fw); }
    }
  } else if (kind == 1) { // seal: mottled, hauled out (rearing when alarmed) or a head in the swell (slipping under)
    dark = step(0.62, lNoise(q * 9.0 + seed * 20.0));
    if (land) {
      float alert = act > 0.5 ? 1.0 : 0.0;
      vec2 hc = vec2(0.76, 0.34 + 0.3 * alert);
      float body = sdE(q, vec2(-0.05, 0.24), vec2(0.82, 0.22 * (1.0 + 0.04 * sin(t * 1.1))));
      d = smin(smin(body, sdE(q, hc, vec2(0.19, 0.16)), 0.18), sdE(q, hc + vec2(0.17, -0.03), vec2(0.1, 0.075)), 0.06);
      d = min(d, min(sdS(q, vec2(-0.75, 0.2), vec2(-1.0, 0.18 + 0.25 * alert), 0.07), sdS(q, vec2(0.3, 0.12), vec2(0.45, 0.0), 0.05)));
      m = min(length(q - hc - vec2(0.07, 0.04)) - 0.025, sdS(q, hc + vec2(0.26, -0.03), hc + vec2(0.4, 0.0), 0.004));
      pale = step(q.y, 0.12);
    } else {
      vec2 hc = vec2(0.0, 0.22 + 0.04 * sin(t * 1.3) - 0.6 * (act > 0.5 ? clamp(at * 0.8, 0.0, 1.0) : 0.0));
      d = smin(sdE(q, hc, vec2(0.22, 0.25)), sdE(q, hc + vec2(0.2, 0.05), vec2(0.12, 0.09)), 0.06);
      m = min(length(q - hc - vec2(0.08, 0.1)) - 0.03, sdS(q, hc + vec2(0.3, 0.04), hc + vec2(0.44, 0.08), 0.004));
      clip = 0.0; rip = ripple(q, t, 0.3, fw);
    }
  } else if (kind == 2) { // otter on its back, paws busy at its chest; dives when alarmed
    float y0 = 0.06 - 0.5 * (act > 0.5 ? clamp(at * 0.7, 0.0, 1.0) : 0.0);
    vec2 hc = vec2(0.66, y0 + 0.13);
    d = smin(smin(sdE(q, vec2(0.0, y0), vec2(0.6, 0.14)), sdE(q, hc, vec2(0.16, 0.14)), 0.08), sdE(q, vec2(0.3, y0 + 0.18 + 0.05 * sin(t * 7.0)), vec2(0.08, 0.06)), 0.04);
    d = min(d, min(sdE(q, vec2(-0.55, y0 + 0.12), vec2(0.08, 0.07)), sdS(q, vec2(-0.6, y0 + 0.02), vec2(-0.95, y0 + 0.05), 0.05)));
    pale = step(sdE(q, hc + vec2(0.04, 0.0), vec2(0.11, 0.1)), 0.0);
    m = length(q - hc - vec2(0.06, 0.05)) - 0.025;
    clip = 0.0; rip = ripple(q, t, 0.55, fw);
  } else if (kind == 3) { // curlew: streaked, long-legged, the down-curved bill probing; aloft, legs trailing; roosting on one leg
    if (flying) {
      d = smin(sdE(q, vec2(0.0, 0.6), vec2(0.36, 0.11)), sdE(q, vec2(0.36, 0.64), vec2(0.09, 0.08)), 0.05);
      d = min(d, sdS(q, vec2(0.02, 0.63), vec2(-0.12, 0.63 + 0.7 * sin(t * 13.0)), 0.06));
      d = min(d, min(sdS(q, vec2(0.42, 0.64), vec2(0.82, 0.55), 0.02), sdS(q, vec2(-0.3, 0.58), vec2(-0.72, 0.55), 0.018)));
      pale = step(q.y, 0.58);
    } else {
      float roost = act > 1.5 ? 1.0 : 0.0, probe = (1.0 - roost) * smoothstep(0.2, 0.8, sin(t * 1.6 + seed * 6.0));
      float body = sdE(rot(q - vec2(-0.05, 0.78), 0.2 * probe), vec2(0.0), vec2(0.34, 0.19));
      vec2 hc = mix(mix(vec2(0.32, 1.0), vec2(0.4, 0.45), probe), vec2(0.12, 0.92), roost);
      vec2 dir = mix(normalize(mix(vec2(1.0, -0.35), vec2(0.3, -1.0), probe)), vec2(-0.6, -0.4), roost);
      float b = min(sdS(q, hc + dir * 0.08, hc + dir * 0.3, 0.02), sdS(q, hc + dir * 0.3, hc + dir * 0.44 + vec2(dir.y, -dir.x) * 0.05, 0.016));
      float legs = min(sdS(q, vec2(0.02, 0.62), vec2(0.05, 0.0), 0.022), sdS(q, vec2(-0.1, 0.62), vec2(-0.14 + 0.1 * roost, 0.3 * roost), 0.022));
      d = min(min(smin(body, sdE(q, hc, vec2(0.1, 0.09)), 0.05), sdS(q, vec2(0.18, 0.84), hc, 0.06)), min(b, legs));
      pale = step(q.y, 0.7) * step(body, 0.0);
      dark = step(0.5, fract(q.x * 14.0 + q.y * 5.0)) * step(0.72, q.y) * step(body, 0.0);
      m = length(q - hc - vec2(0.04, 0.03)) - 0.018;
      if (!land) rip = ripple(q, t, 0.2, fw);
    }
  } else if (kind == 4) { // grey heron: the S of the neck, the black plume, a sudden stab; aloft, neck tucked and legs trailing
    if (flying) {
      d = smin(sdE(q, vec2(0.0, 0.8), vec2(0.42, 0.15)), sdS(q, vec2(0.3, 0.82), vec2(0.38, 0.86), 0.08), 0.05);
      d = min(d, min(sdS(q, vec2(0.44, 0.86), vec2(0.72, 0.82), 0.02), sdS(q, vec2(-0.35, 0.78), vec2(-0.98, 0.74), 0.02)));
      d = min(d, sdS(q, vec2(0.0, 0.82), vec2(-0.18, 0.82 + 0.6 * sin(t * 5.5)), 0.12));
    } else {
      float strike = pow(max(0.0, sin(t * 0.55)), 24.0), raise = step(0.7, fract(t * 0.05 + seed));
      float body = sdE(rot(q - vec2(-0.08, 1.0), 0.45), vec2(0.0), vec2(0.34, 0.19));
      vec2 n1 = vec2(0.14, 1.12), n2 = mix(vec2(0.28, 1.28), vec2(0.42, 1.08), strike), n3 = mix(vec2(0.2, 1.44), vec2(0.62, 0.95), strike), hc = mix(vec2(0.32, 1.56), vec2(0.78, 0.86), strike);
      float neck = min(min(sdS(q, n1, n2, 0.05), sdS(q, n2, n3, 0.045)), sdS(q, n3, hc, 0.04));
      vec2 dir = normalize(mix(vec2(1.0, -0.12), vec2(0.6, -0.8), strike));
      float b = sdS(q, hc + dir * 0.06, hc + dir * 0.36, 0.022);
      float legs = min(sdS(q, vec2(0.0, 0.86), vec2(0.03, 0.0), 0.025), sdS(q, vec2(-0.12, 0.86), mix(vec2(-0.16, 0.0), vec2(-0.02, 0.5), raise), 0.025));
      d = min(min(smin(body, neck, 0.06), sdE(q, hc, vec2(0.08, 0.065))), min(b, legs));
      bill = step(b, 0.0);
      pale = step(neck, 0.0) * step(n1.x, q.x);
      m = min(sdS(q, hc + vec2(-0.02, 0.05), hc + vec2(-0.26, 0.07), 0.01), length(q - hc - vec2(0.02, 0.02)) - 0.016);
      dark = step(0.5, fract((q.x + q.y) * 12.0)) * step(body, 0.0) * step(q.y, 0.95);
      if (!land) rip = ripple(q, t, 0.25, fw);
    }
  } else if (kind == 5) { // sea turtle: the scuted shell awash, the head up to breathe, flippers rowing, the rest seen through the water
    float y0 = -0.02 - 0.45 * (act > 0.5 ? clamp(at * 0.6, 0.0, 1.0) : 0.0), sw = sin(t * 2.2);
    vec2 hc = vec2(0.68, y0 + 0.02 + 0.12 * smoothstep(0.75, 0.95, fract(t / 9.0)));
    float shell = sdE(q, vec2(0.0, y0), vec2(0.55, 0.17));
    d = min(smin(shell, sdE(q, hc, vec2(0.13, 0.09)), 0.05), min(sdS(q, vec2(0.3, y0 - 0.02), vec2(0.6 + 0.06 * sw, y0 - 0.16 + 0.12 * sw), 0.06), sdS(q, vec2(-0.4, y0 - 0.02), vec2(-0.62, y0 - 0.1), 0.05)));
    m = length(q - hc - vec2(0.05, 0.03)) - 0.02;
    dark = step(abs(fract(q.x * 6.0 + 0.5 * step(0.5, fract((q.y - y0) * 9.0))) - 0.5), 0.07) * step(shell, 0.0);
    clip = 0.0; seen = 1.0; rip = ripple(q, t, 0.6, fw);
  } else if (kind == 6) { // humpback: three rolls and blows, sounding with the flukes up, a breach some cycles, then down
    float tau = mod(t, 26.0), breach = step(lHash(vec2(floor(t / 26.0), seed * 7.0)), 0.3), spout = 0.0;
    if (act > 0.5) tau = at < 4.0 ? 10.0 + at : 30.0;
    vec2 sp = vec2(0.0);
    clip = 0.0;
    if (tau < 10.0) {
      float u = mod(tau, 3.3) / 3.3;
      vec2 c = vec2(0.35 - 0.9 * u, -0.28 + 0.4 * sin(3.1416 * u));
      d = min(sdE(q, c, vec2(0.95, 0.3)), sdS(q, c + vec2(-0.45, 0.22), c + vec2(-0.6, 0.34), 0.05));
      sp = vec2(0.6 - 0.9 * u, 0.1); spout = 1.0 - smoothstep(0.1, 0.45, u);
      m = length(q - c - vec2(0.75, 0.05)) - 0.025;
    } else if (tau < 14.0) {
      float u = (tau - 10.0) / 4.0, f = sin(3.1416 * clamp((u - 0.35) / 0.65, 0.0, 1.0));
      vec2 c = vec2(0.1 - 0.5 * u, -0.25 + 0.45 * sin(3.1416 * min(1.0, u * 1.8))), st = vec2(-0.55, -0.1 + 1.1 * f);
      d = min(sdE(rot(q - c, 0.35 * u), vec2(0.0), vec2(0.9, 0.32)), sdS(q, vec2(-0.45, -0.1), st, 0.08));
      d = min(d, min(sdE(rot(q - st - vec2(-0.12, 0.08), 0.6), vec2(0.0), vec2(0.2, 0.06)), sdE(rot(q - st - vec2(0.12, 0.08), -0.6), vec2(0.0), vec2(0.2, 0.06))));
    } else if (breach > 0.5 && tau < 17.0) {
      float u = (tau - 14.0) / 3.0, a = 1.15 - 0.9 * u;
      vec2 c = vec2(0.0, -0.7 + 1.5 * sin(3.1416 * u));
      d = min(sdE(rot(q - c, a), vec2(0.0), vec2(0.8, 0.24)), sdS(q, c + rot(vec2(0.1, -0.2), a), c + rot(vec2(-0.2, -0.75), a), 0.06));
      spout = 1.4 * smoothstep(0.7, 1.0, u);
    }
    if (spout > 0.0) { // the blow: a bushy column of mist
      float h = 0.6 * spout + 0.3, blow = sdE(q, sp + vec2(0.0, h), vec2(0.12 + 0.2 * spout, h)) + 0.07 * (lNoise(q * 7.0 + vec2(0.0, -t * 2.0)) - 0.5);
      if (blow < d) { d = blow; pale = 2.0; }
    }
    rip = tau < 20.0 ? ripple(q * vec2(0.5, 1.0), t, 0.5, fw) : 0.0;
    dark = step(0.8, lHash(floor(q * 40.0))) * step(pale, 1.5);
  } else { // dolphin: leaping in arcs, pale below; rings where it goes in and comes out
    float u = fract((t + seed * 7.0) / 1.7);
    if (u < 0.5) {
      float v = u / 0.5, ang = atan(0.85 * 3.1416 * cos(3.1416 * v), 1.2);
      vec2 p = rot(q - vec2(-0.6 + 1.2 * v, 0.85 * sin(3.1416 * v) - 0.12), -ang);
      d = smin(sdE(p, vec2(0.0), vec2(0.55, 0.13)), sdS(p, vec2(0.45, 0.0), vec2(0.68, -0.02), 0.035), 0.03);
      d = min(d, min(sdS(p, vec2(0.02, 0.1), vec2(-0.12, 0.25), 0.045), min(sdS(p, vec2(-0.55, 0.0), vec2(-0.7, 0.1), 0.04), sdS(p, vec2(-0.55, 0.0), vec2(-0.7, -0.1), 0.04))));
      pale = step(p.y, -0.03);
      m = length(p - vec2(0.38, 0.03)) - 0.02;
    }
    clip = 0.0;
    rip = max(ripple(q + vec2(0.6, 0.0), u * 2.0, 0.1, fw) * step(u, 0.5), ripple(q - vec2(0.6, 0.0), u * 2.0 - 1.0, 0.15, fw) * step(0.5, u));
  }
  float inside = step(d, 0.0), rim = 1.0 - smoothstep(0.6 * fw, 1.6 * fw, abs(d)), line = 1.0 - smoothstep(0.5 * fw, 1.4 * fw, m);
  vec3 col = mix(uLCol[kind], uLPale[kind], clamp(pale, 0.0, 1.0));
  if (pale > 1.5) col = mix(uLFoam, uLGlow, glow);
  col = mix(col, uLBill, clamp(bill, 0.0, 1.0));
  col = mix(col, uLInk, 0.35 * dark) * (0.9 + 0.14 * lNoise(q * 8.0 + seed * 13.0));
  float hatch = step(0.6, fract((gl_FragCoord.x - gl_FragCoord.y) * 0.25));
  col = mix(col, uLInk, 0.22 * hatch * smoothstep(-0.12, 0.0, d)); // contour hatching inside the rim
  if (q.y < clip) {
    if (seen > 0.5 && inside > 0.5) { // seen through the clear shallows
      col = mix(mix(uLSea, col, 0.45), uLInk, 0.3 * step(0.5, fract((gl_FragCoord.x + gl_FragCoord.y) * 0.25)));
      writeInk(col, vN);
      return;
    }
    inside = 0.0; rim = 0.0; line = 0.0;
  }
  if (inside < 0.5 && rim < 0.5 && rip < 0.3) discard;
  if (inside < 0.5 && rim < 0.5) col = mix(mix(uLSea, uLInk, 0.45), uLGlow, glow);
  else col = mix(col, uLInk, max(rim, line * inside));
  writeInk(col, vN);
}`;

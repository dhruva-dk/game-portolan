// WP23: the companion gull. Every ship's gull is drawn from its sim flight (Ship.gull, src/sim/gull.ts) as a herring
// gull in ink and grey wash with black wingtips: it stands on its masthead truck (ShipView.perch) glancing about,
// preening, stretching and calling; wheels overhead in danger, calling the alarm; flies off along the bow and drops
// over the horizon; comes back low with its chest, labouring by the chest's tier, circles once and drops it; stoops
// on a rival in the dive and holds over it. Its plumage records its career: each trait level adds a mark in that
// tier's pigment (Talons: rings on the legs and, at the top, gilded feet; Wings: bars along the leading edge and a
// broader span; Eye: a bigger eye, its ring and streaks behind it; Beak: a longer bill and bands across it; Dive: a
// longer tail, bars across it and streamers), and a gull at the top of every trait has gold-leaf wingtips. The gulls
// of the regions wheel over their waters and rest on the sea and the rocks, lifting as a ship comes near and settling
// at night. One instanced draw for every gull; wingbeat, fold, head, bill, legs and the carried chest are posed in the
// vertex shader; a ship's gull never shrinks below a readable mark, out to the chart. WP28: GullFlock.cue.
import * as THREE from 'three';
import { localFrame, R } from '../sim/sphere.ts';
import { afloat, FLIGHT, type Gull, type MatchState } from '../sim/state.ts';
import { GULL } from '../sim/tables.ts';
import { toWorld } from '../sim/world/geography.ts';
import { REGIONS } from '../sim/world/regions.ts';
import { inkMaterial } from '../style/glsl.ts';
import { mix32, rng, TIER_TINT } from './fx.ts';
import type { Fleet } from './ships/shipView.ts';
import type { RenderContext } from './world.ts';

/** Heights over the sea (u) and radii the gulls fly at, and the stoop's length (s). */
export const GULL_FLY = { mast: 9, wheel: 11, wheelR: 7, out: 16, low: 1.5, back: 14, circle: 8, stoop: 0.9, hold: 4, holdR: 3 } as const;
/** A ship's gull and a wild one (× the model, 1.4 u across the wings). */
export const GULL_SIZE = { ship: 0.9, wild: 0.75 } as const;
/** How far the feet are under the gull's origin (u), so it stands on the truck. */
export const GULL_FOOT = 0.17 * GULL_SIZE.ship;
/** Instances: every ship's gull and every wild one. */
export const GULL_CAP = 128;
/** A ship's gull is never drawn smaller than this × its distance (a readable mark out to the chart). */
const GULL_READ = 0.008;
const WILD_FAR = 160, WILD_SHY = 14;
const LEGS = [GULL.legs.out, GULL.legs.away, GULL.legs.back, GULL.legs.circle];
const PART = { body: 0, head: 1, bill: 2, jaw: 3, inner: 4, outer: 5, tail: 6, streamer: 7, leg: 8, chest: 9 } as const;
const NAMES = ['aP', 'aQ', 'aW', 'aH', 'aT', 'aD'];
const TAU = 2 * Math.PI;

/** A colour given as sRGB hex, in the pipeline's linear space. */
export function linHex(hex: number): THREE.Vector3 {
  const c = (s: number) => { const v = ((hex >> s) & 255) / 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  return new THREE.Vector3(c(16), c(8), c(0));
}

/** Every trait at its top: the gull wears gold-leaf wingtips. */
export const gilded = (g: Gull): boolean =>
  g.talons >= GULL.levels.talons && g.wings >= GULL.levels.wings && g.eye >= GULL.levels.eye && g.beak >= GULL.levels.beak && g.dive >= GULL.levels.dive;

export interface Aim { readonly p: THREE.Vector3; fold: number; legs: number; carry: number; sweep: number }
export const newAim = (): Aim => ({ p: new THREE.Vector3(), fold: 0, legs: 0, carry: -1, sweep: 0 });

const E = new THREE.Vector3(), N = new THREE.Vector3(), C = new THREE.Vector3(), D = new THREE.Vector3(), T = new THREE.Vector3();
const U = new THREE.Vector3(), H = new THREE.Vector3(), X = new THREE.Vector3(), P = new THREE.Vector3(), F = new THREE.Vector3();
const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), QP = new THREE.Quaternion(), QB = new THREE.Quaternion();
const AX = new THREE.Vector3(1, 0, 0), AZ = new THREE.Vector3(0, 0, 1);
const clamp = THREE.MathUtils.clamp, smooth = THREE.MathUtils.smoothstep;
const ease = (rate: number, dt: number) => 1 - Math.exp(-rate * dt);

/** Ship i's position (unit) at the loop's alpha. */
function shipAt(state: MatchState, i: number, alpha: number, out: THREE.Vector3): THREE.Vector3 {
  const s = state.ships[i];
  return out.set(s.was.x + (s.pos.x - s.was.x) * alpha, s.was.y + (s.pos.y - s.was.y) * alpha, s.was.z + (s.pos.z - s.was.z) * alpha).normalize();
}

function over(dir: { x: number; y: number; z: number }, h: number, out: THREE.Vector3): THREE.Vector3 {
  return out.set(dir.x, dir.y, dir.z).normalize().multiplyScalar(R + h);
}

function ring(c: THREE.Vector3, r: number, h: number, a: number, out: THREE.Vector3): THREE.Vector3 {
  localFrame(c, E, N);
  return out.copy(c).multiplyScalar(R + h).addScaledVector(E, r * Math.cos(a)).addScaledVector(N, r * Math.sin(a));
}

/**
 * Where ship i's gull is drawn, `since` s into its sim flight: standing on its perch (GULL_FLY.mast over its ship when
 * the ship is not drawn), wheeling overhead, climbing out along the bow, dropping away over the horizon, back up and
 * home with the chest, once round its ship, or stooping on its prey and holding over it.
 */
export function gullAim(state: MatchState, i: number, alpha: number, perch: THREE.Vector3 | null, since: number, clock: number, out: Aim): Aim {
  const g = state.ships[i].gull, ship = shipAt(state, i, alpha, C);
  const leg = g.flight >= FLIGHT.out && g.flight <= FLIGHT.circle ? clamp(1 - g.time / Math.max(1e-3, g.span * LEGS[g.flight - FLIGHT.out]), 0, 1) : 0;
  out.fold = 0; out.legs = 0; out.carry = -1; out.sweep = 0;
  switch (g.flight) {
    case FLIGHT.mast:
      out.fold = 1; out.legs = 1;
      if (perch) out.p.copy(perch); else over(ship, GULL_FLY.mast, out.p);
      out.p.addScaledVector(U.copy(out.p).normalize(), GULL_FOOT);
      return out;
    case FLIGHT.wheel: ring(ship, GULL_FLY.wheelR, GULL_FLY.wheel, clock * 0.55 + i, out.p); return out;
    case FLIGHT.out: over(g.at, GULL_FLY.mast + (GULL_FLY.out - GULL_FLY.mast) * leg, out.p); return out;
    case FLIGHT.away: // on past its mark and down below the horizon, then round to where it comes back from
      over(g.at, GULL_FLY.out + (GULL_FLY.low - GULL_FLY.out) * Math.min(1, 2 * leg), out.p).addScaledVector(T.set(g.dir.x, g.dir.y, g.dir.z), 60 * Math.sin(Math.PI * leg));
      return out;
    case FLIGHT.back: out.legs = 1; out.carry = g.tier; over(g.at, GULL_FLY.low + (GULL_FLY.back - GULL_FLY.low) * leg, out.p); return out;
    case FLIGHT.circle: out.legs = 1; out.carry = g.tier; over(g.at, GULL_FLY.circle, out.p); return out;
    default: { // the dive: a stoop with the wings swept, then holding over the prey
      const prey = g.prey >= 0 ? shipAt(state, g.prey, alpha, D) : ship;
      if (since < GULL_FLY.stoop) { out.sweep = 1; over(prey, GULL_FLY.wheel + (1.5 - GULL_FLY.wheel) * (since / GULL_FLY.stoop), out.p); return out; }
      ring(prey, GULL_FLY.holdR, GULL_FLY.hold, clock * 1.4 + i, out.p);
      return out;
    }
  }
}

/** A drawn gull's state between frames. */
interface Bird { p: THREE.Vector3; v: THREE.Vector3; f: THREE.Vector3; bank: number; pitch: number; phase: number; amp: number; fold: number; legs: number; sweep: number; flight: number; since: number; seen: boolean; call: number; seed: number }
const bird = (seed: number): Bird => ({ p: new THREE.Vector3(), v: new THREE.Vector3(), f: new THREE.Vector3(1, 0, 0), bank: 0, pitch: 0, phase: 0, amp: 0, fold: 1, legs: 1, sweep: 0, flight: -1, since: 0, seen: false, call: -1, seed });

/** A wild gull: its home (unit) and frame, the rock or sea it rests on, its wheel, whether it is a rester, how far it has risen. */
interface Wild { home: THREE.Vector3; e: THREE.Vector3; n: THREE.Vector3; seat: number; r: number; h: number; w: number; rests: boolean; lift: number; b: Bird }

/** Moves b to `to` (at once, or easing at `rate`/s), its heading after its way, banking into turns, pitching as it climbs or sinks. */
function steer(b: Bird, to: THREE.Vector3, rate: number, dt: number): void {
  T.copy(b.p);
  if (rate === Infinity || dt <= 0) b.p.copy(to); else b.p.lerp(to, ease(rate, dt));
  if (dt <= 0) return;
  b.v.subVectors(b.p, T).divideScalar(dt);
  U.copy(b.p).normalize();
  const climb = b.v.dot(U);
  H.copy(b.v).addScaledVector(U, -climb);
  const speed = H.length();
  let yaw = 0;
  if (speed > 0.5) {
    H.divideScalar(speed);
    yaw = 6 * Math.asin(clamp(X.crossVectors(b.f, H).dot(U), -1, 1));
    b.f.lerp(H, ease(6, dt));
  }
  b.f.addScaledVector(U, -b.f.dot(U));
  if (b.f.lengthSq() < 1e-8) localFrame(U, b.f, N);
  b.f.normalize();
  b.bank += (clamp(-Math.atan((speed * yaw) / 9.8), -0.9, 0.9) - b.bank) * ease(4, dt);
  b.pitch += (clamp(-climb * 0.07, -0.5, 0.6) - b.pitch) * ease(4, dt);
}

const unit = (n: number, seed: number) => (mix32(n, Math.floor(seed * 1e6)) >>> 0) / 4294967296;
const IDLE = { yaw: 0, pitch: 0, bill: 0, stretch: 0, call: -1 };

/** A call every `every` s at these odds: the bill opens for 0.45 s and the head is thrown back (IDLE.bill, IDLE.call). */
function calling(t: number, seed: number, every: number, odds: number): void {
  const w = Math.floor(t / every), u = t - w * every, on = unit(w, seed + 1) < odds && u < 0.45;
  IDLE.bill = on ? Math.sin((Math.PI * u) / 0.45) : 0;
  IDLE.call = on ? w : -1;
  IDLE.pitch += (-0.75 - IDLE.pitch) * IDLE.bill;
}

/** A standing gull's life: sharp glances about, preening into the shoulder, a stretch of the wings now and then, calls. */
function idle(clock: number, seed: number, every: number, odds: number): typeof IDLE {
  const t = clock + seed * 37, k = Math.floor(t / 1.7), u = t / 1.7 - k, look = (m: number) => unit(m, seed) * 2 - 1;
  IDLE.yaw = THREE.MathUtils.lerp(look(k - 1), look(k), smooth(u, 0, 0.07)) * 1.2;
  IDLE.pitch = 0.12 * Math.sin(t * 0.9);
  const pr = t % 13, st = t % 19;
  if (pr < 1.6) {
    const w = Math.sin((Math.PI * pr) / 1.6);
    IDLE.yaw += ((look(k) < 0 ? -2.5 : 2.5) - IDLE.yaw) * w;
    IDLE.pitch += (0.9 - IDLE.pitch) * w;
  }
  IDLE.stretch = st < 0.9 ? Math.sin((Math.PI * st) / 0.9) : 0;
  calling(t, seed, every, odds);
  return IDLE;
}

const WING = { freq: 0, amp: 0 };
/** The wingbeat: climbing out, the chest's labour by its tier, flap-and-glide wheeling, the stoop and the hover, gliding down. */
function wingbeat(flight: number, tier: number, since: number, clock: number, seed: number, climb: number): void {
  let f = 2.6, a = (clock * 0.13 + seed) % 1 > 0.35 ? 0.08 : 0.7;
  if (flight === FLIGHT.out || flight === FLIGHT.away) { f = 3.2; a = 0.85; }
  else if (flight === FLIGHT.back || (flight === FLIGHT.circle && tier >= 0)) { f = 3 + 0.35 * Math.max(0, tier); a = 0.82 + 0.1 * Math.max(0, tier); }
  else if (flight === FLIGHT.dive) { f = 4.4; a = since < GULL_FLY.stoop ? 0 : 0.9; }
  if (climb < -1.5 && flight !== FLIGHT.dive) a *= 0.25;
  WING.freq = f;
  WING.amp = a;
}

/** The gulls of every region, from their habitats (REGIONS[].fauna 'gull'). */
function wildGulls(height: (dir: THREE.Vector3) => number): Wild[] {
  const out: Wild[] = [];
  REGIONS.forEach((region, ri) => region.fauna.forEach((h, hi) => {
    if (h.species !== 'gull') return;
    const rand = rng(ri * 613 + hi * 71 + 3);
    for (let k = 0; k < h.count; k++) {
      const a = rand() * TAU, r = h.r * Math.sqrt(rand()), home = new THREE.Vector3(), e = new THREE.Vector3(), n = new THREE.Vector3();
      toWorld(ri, h.x + r * Math.cos(a), h.y + r * Math.sin(a), home);
      localFrame(home, e, n);
      const b = bird(rand()), rests = rand() < 0.45;
      b.f.copy(e);
      out.push({ home, e, n, seat: Math.max(0, height(home)), r: 3 + 7 * rand(), h: 5 + 12 * rand(), w: (rand() < 0.5 ? -1 : 1) * (0.25 + 0.25 * rand()), rests, lift: rests ? 0 : 1, b });
    }
  }));
  return out;
}

/**
 * The gull model (x along the right wing, y up, z to the bill; 1.4 across the wings): lofted body and head, the bill
 * in two mandibles, each wing an inner panel and the primaries (front faces up), a square tail with Dive's
 * streamers, legs with webbed feet, and the chest it carries. Per vertex: its part, its side, and a surface coordinate
 * for the markings (wing: along the span, across the chord; tail and legs: along them).
 */
function buildGull(g: THREE.BufferGeometry): number {
  const pos: number[] = [], part: number[] = [], side: number[] = [], uv: number[] = [], index: number[] = [];
  const v = (x: number, y: number, z: number, pa: number, s = 0, a = 0, b = 0) => { pos.push(x, y, z); part.push(pa); side.push(s); uv.push(a, b); return part.length - 1; };
  const tri = (a: number, b: number, c: number) => { index.push(a, b, c); };
  const loft = (pa: number, rings: number[][], back: number[], front: number[]) => {
    const ids = rings.map(([z, y, rx, ry]) => Array.from({ length: 6 }, (_, k) => v(rx * Math.cos((k / 6) * TAU), y + ry * Math.sin((k / 6) * TAU), z, pa)));
    for (let i = 0; i + 1 < ids.length; i++) for (let k = 0; k < 6; k++) { const a = ids[i][k], b = ids[i][(k + 1) % 6], c = ids[i + 1][(k + 1) % 6], d = ids[i + 1][k]; tri(a, b, c); tri(a, c, d); }
    const t0 = v(0, back[1], back[0], pa), t1 = v(0, front[1], front[0], pa), last = ids[ids.length - 1];
    for (let k = 0; k < 6; k++) { tri(t0, ids[0][(k + 1) % 6], ids[0][k]); tri(t1, last[k], last[(k + 1) % 6]); }
  };
  loft(PART.body, [[-0.3, 0.02, 0.025, 0.02], [-0.18, 0.01, 0.07, 0.065], [-0.02, 0, 0.085, 0.08], [0.12, 0.01, 0.07, 0.07], [0.22, 0.04, 0.04, 0.045]], [-0.33, 0.02], [0.25, 0.05]);
  loft(PART.head, [[0.2, 0.06, 0.035, 0.04], [0.25, 0.085, 0.055, 0.055], [0.31, 0.09, 0.05, 0.05], [0.35, 0.085, 0.03, 0.03]], [0.19, 0.06], [0.365, 0.085]);
  const beak = (pa: number, y0: number, y1: number, tip: number[]) => {
    const a = v(-0.017, y0, 0.35, pa), b = v(0.017, y0, 0.35, pa), c = v(0, y1, 0.35, pa), t = v(0, tip[0], tip[1], pa);
    tri(a, b, t); tri(b, c, t); tri(c, a, t); tri(a, c, b);
  };
  beak(PART.bill, 0.088, 0.104, [0.078, 0.445]);
  beak(PART.jaw, 0.075, 0.062, [0.07, 0.43]);
  const span = (x: number) => (x - 0.06) / 0.64;
  for (const s of [-1, 1]) {
    const quad = (a: number, b: number, c: number, d: number) => { if (s > 0) { tri(a, b, c); tri(a, c, d); } else { tri(a, c, b); tri(a, d, c); } };
    const panel = (pa: number, rows: number[][]) => {
      const ids = rows.map(([x, y, l, t]) => [v(s * x, y, l, pa, s, span(x), 0), v(s * x, y - 0.01, t, pa, s, span(x), 1)]);
      for (let i = 0; i + 1 < ids.length; i++) quad(ids[i][0], ids[i + 1][0], ids[i + 1][1], ids[i][1]);
      return ids[ids.length - 1];
    };
    panel(PART.inner, [[0.06, 0.05, 0.07, -0.09], [0.21, 0.055, 0.085, -0.1], [0.36, 0.06, 0.09, -0.075]]);
    const [l, t] = panel(PART.outer, [[0.36, 0.06, 0.09, -0.075], [0.53, 0.055, 0.05, -0.095], [0.66, 0.05, 0, -0.075]]);
    const tip = v(s * 0.72, 0.048, -0.05, PART.outer, s, 1, 0.5);
    if (s > 0) tri(l, tip, t); else tri(l, t, tip);
    tri(v(s * 0.07, 0.02, -0.42, PART.streamer, s, 0, 0), v(s * 0.095, 0.02, -0.42, PART.streamer, s, 1, 0), v(s * 0.11, 0.02, -0.62, PART.streamer, s, 0.5, 1));
    const h0 = v(s * 0.025, -0.04, -0.06, PART.leg, s, 0, 0), h1 = v(s * 0.04, -0.04, -0.07, PART.leg, s, 1, 0);
    const a0 = v(s * 0.03, -0.17, -0.04, PART.leg, s, 0, 0.9), a1 = v(s * 0.042, -0.17, -0.045, PART.leg, s, 1, 0.9);
    tri(h0, h1, a1); tri(h0, a1, a0);
    tri(v(s * 0.036, -0.17, -0.04, PART.leg, s, 0.5, 0.96), v(s * 0.07, -0.178, 0.035, PART.leg, s, 1, 1), v(s * 0.002, -0.178, 0.035, PART.leg, s, 0, 1));
  }
  const c0 = v(0, 0.02, -0.28, PART.tail, 0, 0.5, 0), l0 = v(-0.035, 0.02, -0.29, PART.tail, 0, 0, 0), r0 = v(0.035, 0.02, -0.29, PART.tail, 0, 1, 0);
  const l1 = v(-0.085, 0.02, -0.42, PART.tail, 0, 0, 1), m1 = v(0, 0.02, -0.43, PART.tail, 0, 0.5, 1), r1 = v(0.085, 0.02, -0.42, PART.tail, 0, 1, 1);
  tri(c0, r0, r1); tri(c0, r1, m1); tri(c0, m1, l1); tri(c0, l1, l0);
  const box = Array.from({ length: 8 }, (_, b) => v(b & 1 ? 0.07 : -0.07, b & 2 ? -0.195 : -0.285, b & 4 ? 0.02 : -0.08, PART.chest));
  for (const [a, b, c, d] of [[0, 4, 6, 2], [1, 3, 7, 5], [0, 1, 5, 4], [2, 6, 7, 3], [0, 2, 3, 1], [4, 5, 7, 6]]) { tri(box[a], box[b], box[c]); tri(box[a], box[c], box[d]); }
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aPart', new THREE.Float32BufferAttribute(part, 1));
  g.setAttribute('aSide', new THREE.Float32BufferAttribute(side, 1));
  g.setAttribute('aUv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(index);
  return index.length / 3;
}

export type GullCue = 'call' | 'takeoff' | 'land' | 'drop' | 'dive';

/** Every gull in the scene, one instanced draw. */
export class GullFlock {
  readonly mesh: THREE.Mesh;
  /** WP28: each gull's voice and wings, by ship (index, where): a call, a takeoff, a landing, a chest dropped, a dive. */
  cue: ((cue: GullCue, ship: number, at: THREE.Vector3) => void) | null = null;
  private readonly geo = new THREE.InstancedBufferGeometry();
  private readonly data: Float32Array[];
  private readonly attrs: THREE.InstancedBufferAttribute[];
  private readonly uniforms: Record<string, THREE.IUniform>;
  private readonly tris: number;
  private readonly ships: Bird[] = [];
  private readonly slot: number[] = [];
  private readonly wild: Wild[];
  private readonly aim = newAim();

  constructor(ctx: RenderContext, height: (dir: THREE.Vector3) => number) {
    this.tris = buildGull(this.geo);
    this.data = NAMES.map(() => new Float32Array(4 * GULL_CAP));
    this.attrs = NAMES.map((name, k) => {
      const a = new THREE.InstancedBufferAttribute(this.data[k], 4).setUsage(THREE.DynamicDrawUsage);
      this.geo.setAttribute(name, a);
      return a;
    });
    this.geo.instanceCount = 0;
    this.uniforms = {
      uLifeClock: { value: 0 }, uLifeMin: { value: GULL_READ }, uLifeSun: { value: new THREE.Vector3(0, 1, 0) }, uTier: { value: TIER_TINT },
      uGWhite: { value: linHex(0xf3efe6) }, uGGrey: { value: linHex(0x9ca7ae) }, uGInk: { value: linHex(0x26211d) }, uGBill: { value: linHex(0xe9be45) },
      uGSpot: { value: linHex(0xc8402a) }, uGLeg: { value: linHex(0xdca594) }, uGIris: { value: linHex(0xf2e4a6) }, uGWood: { value: linHex(0x7a5234) },
    };
    this.mesh = new THREE.Mesh(this.geo, inkMaterial(ctx.pipeline.style, { vertexShader: VERT, fragmentShader: FRAG, uniforms: this.uniforms, side: THREE.DoubleSide }));
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
    ctx.scene.add(this.mesh);
    this.wild = wildGulls(height);
  }

  get count(): number {
    return this.geo.instanceCount;
  }

  /** Triangles drawn. */
  get triangles(): number {
    return this.count * this.tris;
  }

  /** Where ship i's gull is drawn, or null when it is not. */
  at(i: number): THREE.Vector3 | null {
    return (this.slot[i] ?? -1) >= 0 ? this.ships[i].p : null;
  }

  /** The tier of the chest ship i's gull is drawn carrying (−1 none). */
  carrying(i: number): number {
    const k = this.slot[i] ?? -1;
    return k >= 0 ? this.data[5][4 * k + 1] : -1;
  }

  finite(): boolean {
    return this.data.every((a) => a.every(Number.isFinite));
  }

  /**
   * Draws every ship's gull from its sim flight (hidden with its ship unless aloft) and the wild gulls within reach of
   * the eye: resters lift as a ship comes within WILD_SHY u, and every wild gull settles by night.
   */
  frame(st: MatchState, alpha: number, dt: number, clock: number, night: number, fleet: Fleet | null, eye: THREE.Vector3, ships: readonly THREE.Vector3[], sun: THREE.Vector3): void {
    (this.uniforms.uLifeClock.value as number) = clock;
    (this.uniforms.uLifeSun.value as THREE.Vector3).copy(sun);
    const A = this.aim;
    let n = 0;
    for (let i = 0; i < st.ships.length; i++) {
      this.slot[i] = -1;
      const s = st.ships[i], g = s.gull, view = fleet?.views[i] ?? null, aloft = g.flight >= FLIGHT.out;
      const b = this.ships[i] ?? (this.ships[i] = bird((i * 0.618) % 1));
      if ((!afloat(s) || (fleet !== null && !view?.ship.visible)) && !aloft) { b.seen = false; continue; }
      if (g.flight !== b.flight) this.turn(b, g.flight, i); else b.since += dt;
      gullAim(st, i, alpha, view ? view.perch(P) : null, b.since, clock, A);
      const perched = g.flight === FLIGHT.mast;
      if (!b.seen) { b.p.copy(A.p); b.seen = true; }
      steer(b, A.p, perched ? (b.since > 0.8 ? Infinity : 7) : 3.5, dt);
      let yaw: number, pitch: number, bill = 0, fold = A.fold, amp = 0, call = -1;
      if (perched) {
        const id = idle(clock, b.seed, 7, 0.45);
        yaw = id.yaw; pitch = id.pitch; bill = id.bill; call = id.call;
        fold = 1 - 0.55 * id.stretch; amp = 0.35 * id.stretch; b.phase = Math.PI / 2;
        U.copy(b.p).normalize();
        b.f.set(s.head.x, s.head.y, s.head.z).addScaledVector(U, -b.f.dot(U)).normalize();
        b.bank = 0; b.pitch = 0;
      } else {
        wingbeat(g.flight, A.carry, b.since, clock, b.seed, b.v.dot(U.copy(b.p).normalize()));
        amp = WING.amp;
        b.phase = (b.phase + dt * TAU * WING.freq) % TAU;
        yaw = -0.6 * b.bank; pitch = -0.6 * b.pitch;
        if (g.flight === FLIGHT.wheel) { IDLE.pitch = pitch; calling(clock + b.seed * 37, b.seed, 3, 0.8); bill = IDLE.bill; pitch = IDLE.pitch; call = IDLE.call; }
      }
      b.amp += (amp - b.amp) * ease(8, dt); b.fold += (fold - b.fold) * ease(6, dt); b.legs += (A.legs - b.legs) * ease(5, dt); b.sweep += (A.sweep - b.sweep) * ease(8, dt);
      if (call >= 0 && call !== b.call) this.cue?.('call', i, b.p);
      b.call = call;
      this.put(n, b, GULL_SIZE.ship, g, A.carry, yaw, pitch, bill, 1);
      this.slot[i] = n++;
    }
    for (const w of this.wild) {
      if (n >= GULL_CAP) break;
      if (T.copy(w.home).multiplyScalar(R).distanceTo(eye) > WILD_FAR) { w.b.seen = false; continue; }
      const near = ships.some((p) => p.distanceTo(w.home) * R < WILD_SHY), up = near || (night < 0.5 && !w.rests) ? 1 : 0;
      w.lift = clamp(w.lift + (up - w.lift) * ease(up > w.lift ? 1.2 : 0.3, dt), 0, 1);
      const th = clock * w.w + w.b.seed * TAU, k = smooth(w.lift, 0, 1);
      F.copy(w.home).multiplyScalar(R + w.h).addScaledVector(w.e, w.r * Math.cos(th)).addScaledVector(w.n, w.r * Math.sin(th));
      A.p.copy(w.home).multiplyScalar(R + w.seat + 0.02 + 0.03 * Math.sin(clock * 1.3 + w.b.seed * 9)).lerp(F, k);
      if (!w.b.seen) { w.b.p.copy(A.p); w.b.seen = true; }
      steer(w.b, A.p, Infinity, dt);
      let yaw = 0, pitch = 0, bill = 0;
      const b = w.b;
      if (k < 0.05) {
        const id = idle(clock, b.seed, 9, 0.3);
        yaw = id.yaw; pitch = id.pitch; bill = id.bill;
        b.amp = 0; b.fold += (1 - b.fold) * ease(6, dt); b.legs = 1; b.bank = 0; b.pitch = 0;
      } else {
        const rising = up > w.lift && w.lift < 0.9;
        wingbeat(FLIGHT.wheel, -1, 0, clock, b.seed, b.v.dot(U.copy(b.p).normalize()));
        b.phase = (b.phase + dt * TAU * (rising ? 3.6 : WING.freq)) % TAU;
        b.amp += ((rising ? 0.95 : WING.amp) - b.amp) * ease(8, dt);
        b.fold += (0 - b.fold) * ease(6, dt);
        b.legs += (0 - b.legs) * ease(3, dt);
        yaw = -0.6 * b.bank;
      }
      this.put(n++, b, GULL_SIZE.wild, null, -1, yaw, pitch, bill, 0);
    }
    this.geo.instanceCount = n;
    this.mesh.visible = n > 0;
    for (const a of this.attrs) a.needsUpdate = true;
  }

  dispose(): void {
    this.mesh.removeFromParent();
    this.geo.dispose();
    (this.mesh.material as THREE.Material).dispose();
  }

  /** A gull's flight changes: the cues for WP28. */
  private turn(b: Bird, flight: number, i: number): void {
    const was = b.flight;
    b.flight = flight;
    b.since = 0;
    if (was < 0) return;
    const cue: GullCue | null = flight === FLIGHT.mast ? (was === FLIGHT.circle ? 'drop' : 'land') : flight === FLIGHT.dive ? 'dive' : was === FLIGHT.mast ? 'takeoff' : null;
    if (cue) this.cue?.(cue, i, b.p);
  }

  private put(k: number, b: Bird, size: number, g: Gull | null, carry: number, yaw: number, pitch: number, bill: number, read: number): void {
    U.copy(b.p).normalize();
    X.crossVectors(U, b.f).normalize();
    M.makeBasis(X, U, b.f);
    Q.setFromRotationMatrix(M).multiply(QP.setFromAxisAngle(AX, b.pitch)).multiply(QB.setFromAxisAngle(AZ, b.bank));
    const [aP, aQ, aW, aH, aT, aD] = this.data, j = 4 * k;
    aP[j] = b.p.x; aP[j + 1] = b.p.y; aP[j + 2] = b.p.z; aP[j + 3] = size;
    aQ[j] = Q.x; aQ[j + 1] = Q.y; aQ[j + 2] = Q.z; aQ[j + 3] = Q.w;
    aW[j] = b.phase; aW[j + 1] = b.amp; aW[j + 2] = b.fold; aW[j + 3] = b.sweep;
    aH[j] = yaw; aH[j + 1] = pitch; aH[j + 2] = bill; aH[j + 3] = b.legs;
    aT[j] = g?.talons ?? 0; aT[j + 1] = g?.wings ?? 0; aT[j + 2] = g?.eye ?? 0; aT[j + 3] = g?.beak ?? 0;
    aD[j] = g?.dive ?? 0; aD[j + 1] = carry; aD[j + 2] = g && gilded(g) ? 1 : 0; aD[j + 3] = read;
  }
}

const VERT = /* glsl */ `
uniform float uLifeClock, uLifeMin;
attribute float aPart, aSide;
attribute vec2 aUv;
attribute vec4 aP, aQ, aW, aH, aT, aD; // place+size, turn, wing (phase, beat, fold, sweep), head (yaw, pitch, bill, legs), traits, (dive, chest, gilt, read)
varying vec3 vRest, vWorld;
varying vec2 vUv;
varying float vPart;
varying vec4 vT, vD;
vec3 gRotX(vec3 v, float a) { float c = cos(a), s = sin(a); return vec3(v.x, c * v.y - s * v.z, s * v.y + c * v.z); }
vec3 gRotY(vec3 v, float a) { float c = cos(a), s = sin(a); return vec3(c * v.x + s * v.z, v.y, -s * v.x + c * v.z); }
vec3 gRotZ(vec3 v, float a) { float c = cos(a), s = sin(a); return vec3(c * v.x - s * v.y, s * v.x + c * v.y, v.z); }
vec3 gTurn(vec4 q, vec3 v) { return v + 2.0 * cross(q.xyz, cross(q.xyz, v) + q.w * v); }
void main() {
  vec3 p = position;
  int part = int(aPart + 0.5);
  float side = aSide;
  vRest = p; vUv = aUv; vPart = aPart; vT = aT; vD = aD;
  if (part == 4 || part == 5) {
    float span = 1.0 + 0.07 * aT.y;
    p.x *= span;
    vec3 sh = vec3(side * 0.06 * span, 0.05, 0.0);
    float flap = aW.y * sin(aW.x) + 0.12 * (1.0 - aW.z);
    vec3 q = sh + gRotZ(p - sh, side * flap);
    if (part == 5) {
      vec3 wr = sh + gRotZ(vec3(side * 0.36 * span, 0.06, 0.0) - sh, side * flap);
      q = wr + gRotZ(q - wr, side * 0.55 * aW.y * sin(aW.x - 0.9));
    }
    q = sh + gRotY(q - sh, side * aW.w * 0.85);
    float along = clamp((abs(position.x) - 0.06) / 0.64, 0.0, 1.0);
    vec3 folded = vec3(side * (0.09 - 0.055 * along), 0.065 + 0.03 * aUv.y * (1.0 - along) + 0.012 * along, 0.06 - 0.6 * along - 0.06 * aUv.y);
    p = mix(q, folded, aW.z);
  } else if (part >= 1 && part <= 3) {
    if (part >= 2) p.z = 0.35 + (p.z - 0.35) * (1.0 + 0.14 * aT.w);
    if (part == 3) p = vec3(0.0, 0.072, 0.35) + gRotX(p - vec3(0.0, 0.072, 0.35), 0.55 * aH.z);
    vec3 pv = vec3(0.0, 0.06, 0.2);
    p = pv + gRotY(gRotX(p - pv, aH.y), aH.x);
  } else if (part == 6) {
    p.z -= 0.035 * aD.x * aUv.y;
  } else if (part == 7) {
    p.z = -0.42 - 0.035 * aD.x + (p.z + 0.42) * aD.x / 3.0;
  } else if (part == 8) {
    vec3 ankle = vec3(side * 0.035, -0.17, -0.04), hip = vec3(side * 0.03, -0.04, -0.06);
    if (aUv.y > 0.95) p = ankle + (p - ankle) * (1.0 + 0.18 * aT.x);
    p = hip + gRotX(p - hip, (1.0 - aH.w) * 1.35);
  } else if (part == 9) {
    vec3 grip = vec3(0.0, -0.18, -0.03);
    p = aD.y < -0.5 ? grip : grip + gRotZ(p - grip, 0.18 * sin(uLifeClock * 2.3));
  }
  float s = max(aP.w, aD.w * length(aP.xyz - cameraPosition) * uLifeMin);
  vWorld = aP.xyz + gTurn(aQ, p * s);
  gl_Position = projectionMatrix * viewMatrix * vec4(vWorld, 1.0);
}`;

const FRAG = /* glsl */ `
uniform float uLifeClock;
uniform vec3 uLifeSun, uGWhite, uGGrey, uGInk, uGBill, uGSpot, uGLeg, uGIris, uGWood;
uniform vec3 uTier[5];
varying vec3 vRest, vWorld;
varying vec2 vUv;
varying float vPart;
varying vec4 vT, vD;
float gHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float gNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(gHash(i), gHash(i + vec2(1.0, 0.0)), f.x), mix(gHash(i + vec2(0.0, 1.0)), gHash(i + vec2(1.0, 1.0)), f.x), f.y);
}
vec3 gTier(float k) { return uTier[int(clamp(k, 0.0, 4.0))]; }
vec3 gGilt(vec2 uv) {
  float c = gNoise(uv * 14.0), sweep = pow(max(0.0, sin(uv.x * 5.0 + uv.y * 3.0 - uLifeClock * 2.2)), 10.0);
  return mix(uTier[4] * (0.6 + 0.55 * c), vec3(1.0, 0.95, 0.8), 0.75 * sweep);
}
// a trait's level marks: level k (1…n) at t0 + step·(k − 1) along t, each in tier k's pigment
vec3 gMarks(vec3 col, float t, float t0, float stp, float width, float n) {
  for (int k = 1; k <= 4; k++) {
    float fk = float(k);
    if (fk <= n + 0.5 && abs(t - (t0 + stp * (fk - 1.0))) < width) col = gTier(fk);
  }
  return col;
}
void main() {
  vec3 n = normalize(cross(dFdx(vWorld), dFdy(vWorld)));
  if (dot(n, cameraPosition - vWorld) < 0.0) n = -n;
  int part = int(vPart + 0.5);
  vec3 r = vRest;
  bool gilt = vD.z > 0.5;
  vec3 col = uGWhite;
  if (part == 0) { // white below, the grey mantle over the back
    col = mix(uGWhite, uGGrey, smoothstep(0.035, 0.07, r.y) * smoothstep(0.2, 0.1, r.z));
  } else if (part == 1) { // the pale eye, its ring, and Eye's streaks behind it
    float d = length(vec2(r.y - 0.095, r.z - 0.305)), re = 0.011 + 0.0025 * vT.z;
    if (abs(r.x) > 0.02) {
      if (d < re * 0.45) col = uGInk;
      else if (d < re) col = uGIris;
      else if (d < re + 0.004 + 0.002 * vT.z) col = vT.z > 0.5 ? gTier(vT.z) : uGSpot;
      else if (abs(r.y - 0.1) < 0.006) col = gMarks(col, r.z, 0.283, -0.022, 0.008, vT.z);
    }
  } else if (part == 2 || part == 3) { // yellow, the red gonys spot, Beak's bands
    col = part == 3 && r.z > 0.395 ? uGSpot : uGBill;
    col = gMarks(col, r.z, 0.365, 0.012, 0.004, vT.w);
  } else if (part == 4 || part == 5) { // grey over, paler under, a white trailing edge, Wings' bars, black (or gilded) tips with white mirrors
    bool top = gl_FrontFacing;
    col = top ? uGGrey : mix(uGWhite, uGGrey, 0.25);
    if (vUv.y > 0.82 && vUv.x < 0.75) col = uGWhite;
    if (top && vUv.y < 0.28) col = gMarks(col, vUv.x, 0.12, 0.1, 0.03, vT.y);
    if (vUv.x > 0.74) {
      col = gilt ? gGilt(vUv * 3.0) : uGInk;
      if (length(vec2((vUv.x - 0.93) * 2.5, vUv.y - 0.45)) < 0.13) col = uGWhite;
    }
  } else if (part == 6) {
    col = gMarks(uGWhite, vUv.y, 0.45, 0.16, 0.05, vD.x);
  } else if (part == 7) {
    col = gilt ? gGilt(vUv * 4.0) : gTier(vD.x);
  } else if (part == 8) { // pink legs ringed by Talons; the feet gilded at the top
    col = vUv.y > 0.95 ? (vT.x > 3.5 ? gGilt(r.xz * 20.0) : mix(uGLeg, uGInk, 0.25)) : gMarks(uGLeg, vUv.y, 0.25, 0.17, 0.05, vT.x);
  } else { // the chest, banded in its tier's pigment
    col = abs(r.y + 0.24) < 0.012 ? (vD.y > 3.5 ? gGilt(r.xz * 20.0) : gTier(vD.y)) : uGWood;
  }
  float l = clamp(dot(n, normalize(uLifeSun)) * 0.5 + 0.5, 0.0, 1.0);
  col *= (0.8 + 0.25 * l) * (0.94 + 0.1 * gNoise(r.xz * 60.0 + r.y * 40.0));
  float hatch = step(0.55, fract((gl_FragCoord.x - gl_FragCoord.y) * 0.22));
  col = mix(col, uGInk, 0.28 * hatch * smoothstep(0.45, 0.2, l));
  writeInk(col, n);
}`;

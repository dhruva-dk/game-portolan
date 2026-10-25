// WP22: the match's combat and reward effects, drawn in the style rather than lit: muzzle flashes rippling down a
// battery bow to stern and banks of inked smoke drifting downwind; shot in flight as a ball of ink trailing its stroke,
// with its shadow on the sea so the arc reads; splash columns with hatched rings; splinters, ink spatter and a drawn
// impact star on a hit; a ram's crunch and spray; fire licks, embers and a rising soot column on a burning hull; mortar
// shells smoking along their arc and bursting; chests afloat glowing by pigment tier (gold leaf, the only thing that
// shines, at the top), opened in a burst graded by tier; doubloons flying to the purse; the claimed sea blooming in the
// owner's wash on a loop close; the banking flourish; the broken trail's tear; St Elmo's fire, gusts, fog and flares.
// Every effect is an instance of one pooled draw (A9), after the legacy GPU ring buffer: an event writes its particles
// once (start, velocity, birth, life, drag, gravity, wind drift) and the vertex shader flies them; what lasts across
// ticks (shot in flight, chests, kegs and coins afloat) is rewritten each frame into a short tail of the same buffer.
// Every particle is a function of the events and the clock alone (seeded per tick and event), so a replay redraws it.
import * as THREE from 'three';
import { shotAt, shotHeight } from '../sim/combat.ts';
import { newWind, seaFor, windAt, type Sea as Waters, type Wind } from '../sim/environment.ts';
import { cellDir, R, TERRITORY } from '../sim/sphere.ts';
import { AFLOAT, afloat, EVENT, TICK, type MatchState } from '../sim/state.ts';
import { BATTERY, CONSUMABLE, EFFECT } from '../sim/tables.ts';
import { PIGMENTS, TEAMS } from '../style/palette.ts';
import { inkMaterial, linearVec } from '../style/glsl.ts';
import { fleets } from './ships/shipView.ts';
import type { MatchFrame, RenderContext, RenderModule } from './world.ts';

/** Effect kinds: billboards turned to the eye below 16, decals lying on the sea from 16. */
export const FX = {
  smoke: 0, flash: 1, column: 2, spray: 3, splinter: 4, spatter: 5, flame: 6, ember: 7, coin: 8, glint: 9, glow: 10, shot: 11, chest: 12, burst: 13,
  ring: 16, bloom: 17, tear: 18, flourish: 19, streak: 20, mark: 21,
} as const;
/** Instances: the ring buffer events write into, then the tail rewritten every frame. */
export const FX_CAP = { pool: 3072, tail: 256 } as const;
/** The least a readable effect subtends, rad (scaled per kind in the shader), so a fight still reads from the chart. */
const MIN_ANGLE = 0.0045;

const lin = linearVec;
export const TINT = {
  ink: lin(PIGMENTS.ironGall), smoke: lin(PIGMENTS.umber), soot: lin(PIGMENTS.sepia), foam: lin(PIGMENTS.leadWhite), gold: lin(PIGMENTS.goldLeaf),
  ochre: lin(PIGMENTS.ochre), fire: lin(PIGMENTS.vermilion), ward: lin(PIGMENTS.verdigris), sea: lin(PIGMENTS.ultramarine), deep: lin(PIGMENTS.indigo),
};
/** A chest's tier by its pigment (PIGMENT_TIER): iron gall, verdigris, ultramarine, vermilion, gold leaf. */
export const TIER_TINT = [TINT.ink, TINT.ward, TINT.sea, TINT.fire, TINT.gold];
const TEAM_TINT = TEAMS.map((t) => lin(t.primary));
const ZERO = new THREE.Vector3();

/** mulberry32: a small deterministic generator. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export const mix32 = (a: number, b: number, c = 0): number =>
  (Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b + 0x632be5ab, 0xc2b2ae35) ^ Math.imul(c + 0x27d4eb2f, 0x165667b1)) >>> 0;

/** Gravity (u/s², along the sea's normal at the start; a decal's speed along its heading), drag (1/s), wind drift, a kind's own value, tumble (rad/s). */
export interface Opt { g?: number; drag?: number; drift?: number; par?: number; spin?: number }
type Happening = MatchState['events'][number];
interface Pose { p: THREE.Vector3; up: THREE.Vector3; f: THREE.Vector3; side: THREE.Vector3; v: THREE.Vector3; len: number; beam: number }

export const effects = new WeakMap<THREE.Object3D, Effects>();

export class Effects implements RenderModule {
  readonly mesh: THREE.Mesh;
  readonly capacity = FX_CAP.pool + FX_CAP.tail;
  /** Particles ever written into the ring buffer, and the tail's instances last frame. */
  spawned = 0;
  tail = 0;
  private readonly geo = new THREE.InstancedBufferGeometry();
  private readonly attrs: THREE.InstancedBufferAttribute[];
  private readonly data: Float32Array[];
  private readonly uniforms: Record<string, THREE.IUniform>;
  private next = 0;
  private lo = Infinity;
  private hi = -1;
  private clock = 0;
  private tick = -1;
  private seed = -1;
  private fireSlot = -1;
  private trailSlot = -1;
  private waters: Waters | null = null;
  private readonly wind: Wind = newWind();
  private rand = rng(1);
  private readonly ps: Pose = { p: new THREE.Vector3(), up: new THREE.Vector3(), f: new THREE.Vector3(), side: new THREE.Vector3(), v: new THREE.Vector3(), len: 10, beam: 3 };
  private readonly A = new THREE.Vector3();
  private readonly B = new THREE.Vector3();
  private readonly Q = new THREE.Vector3();
  private readonly V = new THREE.Vector3();
  private readonly W = new THREE.Vector3();
  private readonly T = new THREE.Vector3();
  private readonly E = new THREE.Vector3();
  private readonly N = new THREE.Vector3();
  private readonly U = new THREE.Vector3();

  private readonly ctx: RenderContext;

  constructor(ctx: RenderContext) {
    this.ctx = ctx;
    const g = this.geo, n = this.capacity;
    g.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0], 3));
    g.setIndex([0, 1, 2, 0, 2, 3]);
    this.data = [0, 1, 2, 3, 4].map(() => new Float32Array(4 * n));
    for (let i = 0; i < n; i++) this.data[0][4 * i + 3] = -1e9; // born long ago: dead
    this.attrs = ['aP', 'aV', 'aK', 'aM', 'aC'].map((name, k) => {
      const a = new THREE.InstancedBufferAttribute(this.data[k], 4).setUsage(THREE.DynamicDrawUsage);
      g.setAttribute(name, a);
      return a;
    });
    g.instanceCount = FX_CAP.pool;
    const u = (v: THREE.Vector3) => ({ value: v });
    this.uniforms = {
      uFxClock: { value: 0 }, uFxWind: { value: new THREE.Vector3() }, uFxMin: { value: MIN_ANGLE },
      uFxInk: u(TINT.ink), uFxFoam: u(TINT.foam), uFxGold: u(TINT.gold), uFxCore: u(TINT.ochre), uFxFlame: u(TINT.fire), uFxWood: u(TINT.smoke), uFxShade: u(TINT.sea),
    };
    this.mesh = new THREE.Mesh(g, inkMaterial(ctx.pipeline.style, { uniforms: this.uniforms, vertexShader: VERT, fragmentShader: FRAG, veil: true, side: THREE.DoubleSide }));
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 4;
    ctx.scene.add(this.mesh);
    effects.set(ctx.scene, this);
  }

  /** Triangles drawn. */
  get triangles(): number {
    return 2 * this.geo.instanceCount;
  }

  /** Ring-buffer particles alive at `clock`, by kind when given. */
  live(clock: number, kind = -1): number {
    const [P, V, K] = this.data;
    let n = 0;
    for (let i = 0; i < FX_CAP.pool; i++) {
      const t = clock - P[4 * i + 3];
      if (t >= 0 && t < V[4 * i + 3] && (kind < 0 || K[4 * i] === kind)) n++;
    }
    return n;
  }

  /** One particle: `kind` at p moving v (a decal: v its heading, g its speed), born `delay` s from now, living `life` s, growing s0 → s1 u. */
  put(kind: number, p: THREE.Vector3, v: THREE.Vector3, delay: number, life: number, s0: number, s1: number, c: THREE.Vector3, o: Opt = {}): void {
    const i = this.next, r = this.rand;
    this.next = (i + 1) % FX_CAP.pool;
    this.write(i, kind, p, v, this.clock + delay, life, s0, s1, c, o.g ?? 0, o.drag ?? 0, o.drift ?? 0, o.par ?? 0, (o.spin ?? 0) * (2 * r() - 1), r());
    this.lo = Math.min(this.lo, i);
    this.hi = Math.max(this.hi, i);
    this.spawned++;
  }

  frame(f: MatchFrame): void {
    const st = f.state;
    if (st.seed !== this.seed || !this.waters) {
      this.seed = st.seed;
      this.waters = seaFor(this.ctx.world, st.seed);
      for (let i = 0; i < FX_CAP.pool; i++) this.data[0][4 * i + 3] = -1e9;
      this.lo = 0;
      this.hi = FX_CAP.pool - 1;
    }
    this.clock = f.clock;
    if (st.tick !== this.tick) {
      this.tick = st.tick;
      st.events.forEach((e, k) => this.on(st, e, k));
    }
    this.burning(st, f.clock);
    this.lasting(st, f);
    windAt(this.waters, st, st.ships[0].pos, this.wind); // the smoke drifts on the wind where the player is
    const w = this.uniforms.uFxWind.value as THREE.Vector3;
    w.set(this.wind.v.x, this.wind.v.y, this.wind.v.z);
    if (w.lengthSq() > 1e-12) w.setLength(0.6 + Math.min(2, Math.max(0, this.wind.strength)));
    this.uniforms.uFxClock.value = f.clock;
    this.upload();
  }

  dispose(): void {
    this.ctx.scene.remove(this.mesh);
    this.geo.dispose();
    (this.mesh.material as THREE.Material).dispose();
  }

  private write(i: number, kind: number, p: THREE.Vector3, v: THREE.Vector3, born: number, life: number, s0: number, s1: number, c: THREE.Vector3,
    g: number, drag: number, drift: number, par: number, spin: number, seed: number): void {
    const [P, V, K, M, C] = this.data, j = 4 * i;
    P[j] = p.x; P[j + 1] = p.y; P[j + 2] = p.z; P[j + 3] = born;
    V[j] = v.x; V[j + 1] = v.y; V[j + 2] = v.z; V[j + 3] = life;
    K[j] = kind; K[j + 1] = s0; K[j + 2] = s1; K[j + 3] = seed;
    M[j] = g; M[j + 1] = drag; M[j + 2] = par; M[j + 3] = spin;
    C[j] = c.x; C[j + 1] = c.y; C[j + 2] = c.z; C[j + 3] = drift;
  }

  private upload(): void {
    const base = FX_CAP.pool, n = Math.max(this.tail, this.wasTail);
    for (const a of this.attrs) {
      a.clearUpdateRanges();
      if (this.hi >= this.lo) a.addUpdateRange(4 * this.lo, 4 * (this.hi - this.lo + 1));
      if (n > 0) a.addUpdateRange(4 * base, 4 * n);
      if (this.hi >= this.lo || n > 0) a.needsUpdate = true;
    }
    this.lo = Infinity;
    this.hi = -1;
    this.wasTail = this.tail;
    this.geo.instanceCount = base + this.tail;
  }
  private wasTail = 0;

  /** The sea's tangent frame at p into E, N (and its normal into U). */
  private tangents(p: THREE.Vector3): void {
    const u = this.U.copy(p).normalize();
    this.E.set(0, 1, 0).cross(u);
    if (this.E.lengthSq() < 1e-6) this.E.set(1, 0, 0).cross(u);
    this.E.normalize();
    this.N.crossVectors(u, this.E);
  }

  /** Ship i as drawn (fleets: riding the swell), else as the sim has her. */
  private pose(st: MatchState, i: number): Pose {
    const o = this.ps, s = st.ships[i], view = fleets.get(this.ctx.scene)?.views[i];
    if (view) { o.p.copy(view.ship.position); o.f.copy(view.forward); o.len = view.length; o.beam = view.beam; }
    else { o.p.set(s.pos.x, s.pos.y, s.pos.z).multiplyScalar(R); this.tangents(o.p); o.f.copy(this.E); o.len = 10; o.beam = 3; }
    o.up.copy(o.p).normalize();
    o.f.addScaledVector(o.up, -o.f.dot(o.up)).normalize();
    o.side.crossVectors(o.f, o.up);
    o.v.copy(o.f).multiplyScalar(s.speed);
    return o;
  }

  /** n of a kind thrown from p: out u/s across the sea, rise u/s up, each a little different. */
  private fling(kind: number, p: THREE.Vector3, n: number, out: number, rise: number, life: number, s: number, c: THREE.Vector3, o: Opt = {}, delay = 0): void {
    const r = this.rand;
    this.tangents(p);
    for (let k = 0; k < n; k++) {
      const a = r() * 2 * Math.PI, sp = out * (0.5 + 0.7 * r());
      this.V.copy(this.E).multiplyScalar(Math.cos(a) * sp).addScaledVector(this.N, Math.sin(a) * sp).addScaledVector(this.U, rise * (0.6 + 0.6 * r()));
      this.put(kind, p, this.V, delay + 0.06 * r(), life * (0.75 + 0.5 * r()), s * (0.7 + 0.6 * r()), s * (0.8 + 0.6 * r()), c, o);
    }
  }

  /** Smoke puffs rolling out of p and growing s0 → s1, drifting downwind. */
  private puffs(p: THREE.Vector3, n: number, out: number, rise: number, life: number, s0: number, s1: number, c: THREE.Vector3, delay = 0): void {
    const r = this.rand;
    this.tangents(p);
    for (let k = 0; k < n; k++) {
      const a = r() * 2 * Math.PI, sp = out * (0.4 + 0.8 * r());
      this.V.copy(this.E).multiplyScalar(Math.cos(a) * sp).addScaledVector(this.N, Math.sin(a) * sp).addScaledVector(this.U, rise * (0.5 + r()));
      this.put(FX.smoke, p, this.V, delay + 0.08 * k * r(), life * (0.8 + 0.4 * r()), s0 * (0.8 + 0.4 * r()), s1 * (0.8 + 0.5 * r()), c, { drag: 1.2, drift: 1, g: -0.12 });
    }
  }

  private sea(p: THREE.Vector3): THREE.Vector3 {
    return this.B.copy(p).setLength(R);
  }

  private lift(p: THREE.Vector3, h: number): THREE.Vector3 {
    return p.setLength(p.length() + h);
  }

  private splash(p: THREE.Vector3, scale: number): void {
    const k = Math.sqrt(scale);
    this.put(FX.column, p, ZERO, 0, 1.15 * k, 0.8 * scale, 3.6 * scale, TINT.foam);
    this.fling(FX.spray, p, Math.round(10 * scale), 2.4 * scale, 7.5 * k, 1.2, 0.26 * scale, TINT.foam, { g: 11 });
    this.put(FX.ring, p, ZERO, 0.05, 1.7, 0.5 * scale, 3.2 * scale, TINT.sea);
    this.put(FX.ring, p, ZERO, 0.35, 1.9, 0.4 * scale, 4.4 * scale, TINT.sea);
    this.puffs(p, 1, 0.5, 1.2, 2.2, scale, 2.8 * scale, TINT.foam);
  }

  private impact(p: THREE.Vector3, scale: number, c: THREE.Vector3): void {
    this.put(FX.burst, p, ZERO, 0, 0.34, 0.9 * scale, 2.4 * scale, c);
    this.fling(FX.splinter, p, Math.round(10 * scale), 6 * scale, 7, 1.1, 0.5, TINT.smoke, { g: 14, drag: 0.5, spin: 9 });
    this.fling(FX.spatter, p, 3, 1.2, 0.6, 0.55, 0.5 * scale, TINT.ink, { drag: 3 });
    this.puffs(p, 2, 1, 0.8, 3, 0.8, 2.6 * scale, TINT.soot);
  }

  /** A doubloon flying from `from` into ship o's purse, landing with a glint. */
  private coin(from: THREE.Vector3, o: Pose, delay: number, life: number): void {
    this.T.copy(o.p).addScaledVector(o.up, 1.4).addScaledVector(o.v, delay + life);
    this.toss(from, this.T, delay, life, false);
    this.put(FX.glint, this.T, ZERO, delay + life * 0.92, 0.4, 0.5, 1.0, TINT.gold);
  }

  /** A doubloon thrown from `from` to land at `to` after `life` s (into the sea: with a ring). */
  private toss(from: THREE.Vector3, to: THREE.Vector3, delay: number, life: number, sea: boolean): void {
    const g = 12;
    this.V.subVectors(to, from).multiplyScalar(1 / life).addScaledVector(this.U.copy(from).normalize(), 0.5 * g * life);
    this.put(FX.coin, from, this.V, delay, life, 0.45, 0.45, TINT.gold, { g });
    if (sea) this.put(FX.ring, to, ZERO, delay + life, 1.2, 0.2, 1.4, TINT.sea);
  }

  /** A chest opening (or landing): a wash halo in its pigment, more rays, glints and coins the rarer, gold leaf at the top. */
  private treasure(p: THREE.Vector3, tier: number, scale: number, f: THREE.Vector3): void {
    const c = TIER_TINT[tier] ?? TINT.ink;
    this.put(FX.glow, p, ZERO, 0, 1.3 + 0.35 * tier, 1.2 * scale, (3 + 1.6 * tier) * scale, c, { par: tier });
    this.put(FX.ring, this.sea(p), ZERO, 0.05, 1.4, 0.6, (3 + tier) * scale, c);
    this.fling(FX.glint, p, [0, 3, 6, 11, 20][tier] ?? 0, 1.6 + 0.3 * tier, 2.2, 1.3, 0.5 + 0.12 * tier, tier >= 3 ? TINT.gold : c, { g: 1.6, drag: 1.2 }, 0.1);
    if (tier >= 2) this.fling(FX.coin, p, 2 * tier, 2, 6, 1.1, 0.4, TINT.gold, { g: 11 }, 0.08);
    if (tier >= 4) {
      this.put(FX.flourish, this.sea(p), f, 0.15, 1.8, 2.5 * scale, 6.5 * scale, TINT.gold);
      this.fling(FX.glint, p, 14, 0.6, 5, 1.8, 0.35, TINT.gold, { g: -0.5, drag: 0.8 }, 0.3);
    }
  }

  private on(st: MatchState, e: Happening, k: number): void {
    this.rand = rng(mix32(st.seed, st.tick, k));
    const r = this.rand, P = this.A.set(e.at.x, e.at.y, e.at.z).multiplyScalar(R), ship = e.ship >= 0 && e.ship < st.ships.length;
    switch (e.kind) {
      case EVENT.broadside: if (ship) this.broadside(st, e.ship, e.amount); return;
      case EVENT.hit: this.impact(this.lift(P, 1.4), 1 + Math.min(1, e.amount / 30), TINT.ochre); return;
      case EVENT.splash:
        if (e.amount > 0) { this.puffs(P, 3, 1.5, 0.6, 3.5, 0.8, 2.6, TINT.smoke); this.fling(FX.spatter, P, 2, 1, 0.5, 0.5, 0.5, TINT.smoke); }
        else this.splash(P, 1);
        return;
      case EVENT.ram:
        this.put(FX.ring, P, ZERO, 0, 1.8, 1, 5, TINT.sea);
        this.lift(P, 1.2);
        this.impact(P, 1.8, TINT.soot);
        this.fling(FX.spray, P, 14, 4, 8, 1.3, 0.35, TINT.foam, { g: 11 });
        return;
      case EVENT.struck: case EVENT.ablaze: case EVENT.mortar: case EVENT.landed: case EVENT.bank: case EVENT.breakOff: case EVENT.thrown: case EVENT.chosen: case EVENT.used:
        if (ship) this.aboard(st, e);
        return;
      case EVENT.shell: case EVENT.kegBurst: {
        const big = e.kind === EVENT.kegBurst ? 2.2 : 1.8;
        this.splash(P, big);
        this.puffs(P, 3, 2, 2, 5, 1.2, 4.5, TINT.soot);
        this.lift(P, 1);
        this.put(FX.burst, P, ZERO, 0, 0.4, big, 2.4 * big, TINT.fire);
        this.fling(FX.ember, P, 10, 5, 7, 0.9, 0.14, TINT.fire, { g: 9, drag: 0.6 });
        if (e.kind === EVENT.kegBurst) this.fling(FX.flame, P, 6, 1.5, 0.5, 1.2, 1.4, TINT.fire, { drag: 1.5 });
        return;
      }
      case EVENT.keg: this.put(FX.ring, P, ZERO, 0, 1.2, 0.3, 2, TINT.sea); this.fling(FX.spray, P, 4, 1, 3, 0.8, 0.2, TINT.foam, { g: 10 }); return;
      case EVENT.chest:
        this.lift(P, 0.6);
        this.put(FX.glow, P, ZERO, 0, 1, 1, 3 + e.amount, TIER_TINT[e.amount] ?? TINT.ink, { par: e.amount });
        this.put(FX.ring, this.sea(P), ZERO, 0, 1.4, 0.5, 3 + e.amount, TIER_TINT[e.amount] ?? TINT.ink);
        this.fling(FX.glint, P, 3 * e.amount, 1.2, 1.5, 1, 0.5, TINT.gold, { drag: 1 });
        return;
      case EVENT.opened: if (ship) this.treasure(this.lift(P, 1.5), e.amount, 1, this.pose(st, e.ship).f); return;
      case EVENT.chestLost: this.put(FX.ring, P, ZERO, 0, 1.6, 0.4, 3, TINT.sea); this.fling(FX.spray, P, 6, 1.5, 4, 0.9, 0.22, TINT.foam, { g: 10 }); return;
      case EVENT.scoop: {
        if (!ship) return;
        if (e.by === AFLOAT.coin) this.coin(this.lift(P, 0.3), this.pose(st, e.ship), 0, 0.55);
        else this.fling(e.by === AFLOAT.bottle ? FX.glint : FX.spray, this.lift(P, 0.3), 5, 1.5, 3, 0.8, 0.3, TINT.foam, { g: e.by === AFLOAT.bottle ? 0 : 10 });
        return;
      }
      case EVENT.find: {
        this.lift(P, 0.8);
        this.fling(FX.glint, P, 8, 1.5, 2, 1.2, 0.6, TINT.gold, { drag: 1 });
        this.put(FX.ring, this.sea(P), ZERO, 0, 1.6, 0.5, 4, TINT.gold);
        if (ship) { const o = this.pose(st, e.ship); for (let c = 0; c < 6; c++) this.coin(P, o, 0.1 * c, 0.8 + 0.3 * r()); }
        return;
      }
      case EVENT.spill: case EVENT.erupt: {
        const rain = e.kind === EVENT.erupt, n = Math.round(Math.min(rain ? 40 : 18, (rain ? 10 : 4) + e.amount / (rain ? 10 : 15)));
        this.tangents(P);
        const E = this.Q.copy(this.E), N = this.W.copy(this.N), up = this.T.copy(this.U);
        for (let c = 0; c < n; c++) {
          const a = r() * 2 * Math.PI, d = rain ? 14 * Math.sqrt(r()) : 2 + 4 * r(), life = rain ? 2.2 + 0.6 * r() : 0.9 + 0.4 * r();
          const from = this.V.copy(P).addScaledVector(E, rain ? Math.cos(a) * d : 0).addScaledVector(N, rain ? Math.sin(a) * d : 0).addScaledVector(up, rain ? 26 + 8 * r() : 0.6);
          const to = this.B.copy(P).addScaledVector(E, Math.cos(a) * d).addScaledVector(N, Math.sin(a) * d).setLength(R);
          this.toss(from.clone(), to.clone(), rain ? 0.08 * c : 0.03 * c, life, true);
        }
        this.fling(FX.glint, this.lift(P, 1), rain ? 10 : 5, 2, 2, 1.2, 0.6, TINT.gold, { drag: 1 });
        return;
      }
      case EVENT.loop: if (ship) this.claim(st, e); return;
      case EVENT.broken: {
        const tint = TEAM_TINT[(ship ? e.ship : 0) % TEAM_TINT.length], h = this.W.set(0, 0, 0);
        if (e.cells.length >= 2) {
          cellDir(TERRITORY, e.cells[0], this.Q);
          cellDir(TERRITORY, e.cells[Math.min(e.cells.length - 1, 3)], this.V);
          h.subVectors(this.V, this.Q);
        }
        if (h.lengthSq() < 1e-12) { this.tangents(P); h.copy(this.E); }
        this.put(FX.tear, P, h.normalize(), 0, 2.4, 2.5, 5.5, tint);
        this.put(FX.ring, P, ZERO, 0, 1.5, 0.5, 4, tint);
        this.fling(FX.spatter, this.lift(P, 0.5), 4, 2, 1, 0.7, 0.6, TINT.ink, { drag: 3 });
        return;
      }
      case EVENT.dive: this.put(FX.ring, P, ZERO, 0, 1.3, 0.4, 3, TINT.sea); this.fling(FX.spray, P, 8, 1.5, 5, 0.9, 0.24, TINT.foam, { g: 10 }); return;
      default: return;
    }
  }

  /** Effects on one ship's deck, wherever she is drawn. */
  private aboard(st: MatchState, e: Happening): void {
    const o = this.pose(st, e.ship), r = this.rand, deck = this.Q.copy(o.p).addScaledVector(o.up, 1.4);
    switch (e.kind) {
      case EVENT.struck:
        this.impact(deck, 1.2, TINT.smoke);
        this.fling(FX.spray, this.sea(deck), 10, 3, 6, 1.1, 0.3, TINT.foam, { g: 11 });
        return;
      case EVENT.ablaze:
        this.put(FX.burst, deck, ZERO, 0, 0.3, 1, 2.6, TINT.fire);
        for (let k = 0; k < 6; k++) {
          this.B.copy(deck).addScaledVector(o.f, (r() - 0.5) * 0.6 * o.len).addScaledVector(o.side, (r() - 0.5) * o.beam);
          this.put(FX.flame, this.B, this.V.copy(o.up).multiplyScalar(0.6), 0.08 * k, 0.9 + 0.5 * r(), 0.7, 1.5 + r(), TINT.fire, { drag: 1 });
        }
        this.fling(FX.ember, deck, 10, 2, 4, 1.2, 0.14, TINT.fire, { g: -1.5, drag: 0.8, drift: 0.5 });
        return;
      case EVENT.mortar:
        this.put(FX.flash, this.B.copy(deck).addScaledVector(o.up, 0.6), this.V.copy(o.up).multiplyScalar(2), 0, 0.22, 1.4, 3, TINT.fire);
        for (let k = 0; k < 5; k++) {
          this.V.copy(o.up).multiplyScalar(5 + 3 * r()).addScaledVector(o.f, (r() - 0.5) * 2).addScaledVector(o.side, (r() - 0.5) * 2);
          this.put(FX.smoke, deck, this.V, 0.03 * k, 5 + r(), 1, 4.5, TINT.smoke, { drag: 1, drift: 1, g: -0.1 });
        }
        return;
      case EVENT.landed:
        this.treasure(this.T.copy(o.p).addScaledVector(o.up, 2), e.amount, 0.8, o.f);
        this.fling(FX.spray, deck, 6, 2, 3, 0.7, 0.22, TINT.foam, { g: 10 });
        return;
      case EVENT.chosen: this.fling(FX.glint, deck, 5, 1, 2, 1, 0.5, TIER_TINT[e.amount] ?? TINT.gold, { drag: 1 }); return;
      case EVENT.bank:
        this.put(FX.flourish, this.sea(o.p), o.f, 0, 2.0, 3, 8, TINT.gold);
        this.fling(FX.glint, deck, 12, 1.5, 3, 1.5, 0.6, TINT.gold, { drag: 1, g: -0.3 }, 0.2);
        for (let k = 0; k < 8; k++) {
          this.tangents(o.p);
          const a = r() * 2 * Math.PI;
          this.T.copy(deck).addScaledVector(this.E, 0.8 * Math.cos(a)).addScaledVector(this.N, 0.8 * Math.sin(a)).addScaledVector(o.v, 0.06 * k + 1);
          this.W.copy(deck).addScaledVector(o.up, 0.4);
          this.toss(this.W, this.T, 0.06 * k, 1, false);
        }
        return;
      case EVENT.breakOff: case EVENT.thrown:
        this.fling(FX.spray, deck, 14, 3, 6, 1.1, 0.3, TINT.foam, { g: 11 });
        this.put(FX.ring, this.sea(o.p), ZERO, 0, 1.6, 1, 6, TINT.foam);
        for (let k = 0; k < 6; k++) this.put(FX.streak, this.sea(this.W.copy(o.p).addScaledVector(o.side, (r() - 0.5) * 3 * o.beam)), o.f, 0.05 * k, 1.3, 2, 3, TINT.foam, { g: 8 });
        return;
      case EVENT.used: return this.consumable(o, e.by, deck);
      default: return;
    }
  }

  /** WP14's consumables: St Elmo's fire round the ward, the gust's streaks, the fog flask's bank, the flare, the patch kit. */
  private consumable(o: Pose, kind: number, deck: THREE.Vector3): void {
    const r = this.rand;
    switch (kind) {
      case CONSUMABLE.ward:
        this.put(FX.glow, this.B.copy(deck).addScaledVector(o.up, 3), ZERO, 0, 2.5, 3, 7, TINT.ward, { par: 1 });
        for (let k = 0; k < 24; k++) {
          this.B.copy(deck).addScaledVector(o.up, 2 + 6 * r()).addScaledVector(o.f, (r() - 0.5) * o.len * 0.6).addScaledVector(o.side, (r() - 0.5) * o.beam);
          this.put(FX.glint, this.B, this.V.copy(o.up).multiplyScalar(0.3), 0.1 * k, 0.8 + 0.6 * r(), 0.5, 0.9, TINT.ward);
        }
        return;
      case CONSUMABLE.gust:
        for (let k = 0; k < 14; k++) {
          this.B.copy(o.p).addScaledVector(o.side, (r() - 0.5) * 4 * o.beam).addScaledVector(o.f, -o.len * (0.5 + r()));
          this.put(FX.streak, this.sea(this.B), o.f, 0.04 * k, 0.9, 2, 3.5, TINT.foam, { g: 16 });
        }
        this.fling(FX.spray, this.sea(deck), 6, 2, 4, 0.8, 0.25, TINT.foam, { g: 10 });
        return;
      case CONSUMABLE.fogFlask:
        for (let k = 0; k < 14; k++) {
          this.tangents(o.p);
          const a = r() * 2 * Math.PI;
          this.V.copy(this.E).multiplyScalar(Math.cos(a) * (1 + 2 * r())).addScaledVector(this.N, Math.sin(a) * (1 + 2 * r())).addScaledVector(o.up, 0.3);
          this.put(FX.smoke, deck, this.V, 0.1 * k, 8 + 2 * r(), 2, 9 + 4 * r(), TINT.foam, { drag: 0.4, drift: 0.4 });
        }
        return;
      case CONSUMABLE.flare: {
        this.put(FX.ember, deck, this.V.copy(o.up).multiplyScalar(26), 0, 1.5, 0.35, 0.25, TINT.fire, { g: 6 });
        const top = this.B.copy(deck).addScaledVector(o.up, 26 * 1.4 - 3 * 1.4 * 1.4);
        this.put(FX.burst, top, ZERO, 1.4, 0.6, 2, 5, TINT.fire);
        this.fling(FX.glint, top, 14, 2, 0, 2.4, 0.8, TINT.fire, { g: 0.8, drag: 0.6 }, 1.45);
        this.fling(FX.ember, top, 10, 4, 1, 1.8, 0.16, TINT.fire, { g: 3, drag: 0.6 }, 1.45);
        return;
      }
      case CONSUMABLE.patchKit:
        this.fling(FX.splinter, deck, 4, 1, 3, 0.6, 0.35, TINT.smoke, { g: 10, spin: 6 });
        this.puffs(deck, 2, 0.5, 0.6, 2, 0.5, 1.6, TINT.foam);
        return;
      default: return;
    }
  }

  private broadside(st: MatchState, i: number, battery: number): void {
    const o = this.pose(st, i), r = this.rand, chase = battery === BATTERY.castle || battery === BATTERY.stern, n = chase ? 2 : 6;
    const out = this.W.copy(chase ? o.f : o.side).multiplyScalar(battery === BATTERY.port || battery === BATTERY.stern ? -1 : 1);
    for (let g = 0; g < n; g++) {
      const along = chase ? (battery === BATTERY.castle ? 0.5 : -0.5) * o.len : (0.32 - (0.64 * g) / (n - 1)) * o.len;
      const d = 0.07 * g + 0.03 * r(); // the battery ripples bow to stern
      const port = this.Q.copy(o.p).addScaledVector(o.f, along).addScaledVector(o.up, 1);
      if (chase) port.addScaledVector(o.side, (g - 0.5) * 0.5 * o.beam); else port.addScaledVector(out, 0.55 * o.beam);
      const muzzle = this.B.copy(port).addScaledVector(out, 0.5);
      this.put(FX.flash, muzzle, this.V.copy(out).multiplyScalar(3), d, 0.17, 0.8, 1.7, TINT.fire);
      for (let k = 0; k < 3; k++) {
        this.V.copy(out).multiplyScalar(4.5 + 3 * r()).addScaledVector(o.up, 0.5 + 0.8 * r()).addScaledVector(o.f, (r() - 0.5) * 1.5).addScaledVector(o.v, 0.6);
        this.put(FX.smoke, muzzle, this.V, d + 0.03 * k, 4.5 + 2 * r(), 0.9 + 0.3 * r(), 4.2 + 2 * r(), TINT.smoke, { drag: 1.4, drift: 1, g: -0.1 });
      }
      for (let k = 0; k < 2; k++) {
        this.V.copy(out).multiplyScalar(9 + 4 * r()).addScaledVector(o.up, 1 + 2 * r()).addScaledVector(o.f, (r() - 0.5) * 3);
        this.put(FX.ember, muzzle, this.V, d, 0.45 + 0.2 * r(), 0.12, 0.08, TINT.fire, { g: 9.8, drag: 0.6 });
      }
      if (g % 2 === 0) this.put(FX.ring, this.sea(this.T.copy(port).addScaledVector(out, 2.5)), ZERO, d, 1.3, 0.4, 2.2 + r(), TINT.sea);
    }
  }

  /** A loop closed: the claimed sea blooms in the owner's wash, ringed in its ink, and doubloons stream from the trail to the purse. */
  private claim(st: MatchState, e: Happening): void {
    const cells = e.cells, c = this.A.set(0, 0, 0), o = this.pose(st, e.ship), r = this.rand, tint = TEAM_TINT[e.ship % TEAM_TINT.length];
    for (const cell of cells) { cellDir(TERRITORY, cell, this.Q); c.add(this.Q); }
    if (c.lengthSq() < 1e-12) c.copy(o.p);
    c.setLength(R);
    const rad = Math.sqrt(Math.max(e.amount, 1) / Math.PI);
    this.put(FX.bloom, c, ZERO, 0, 2.6, 0.25 * rad, 1.2 * rad, tint);
    this.put(FX.bloom, c, ZERO, 0.35, 2.4, 0.15 * rad, 0.9 * rad, tint);
    this.put(FX.ring, c, ZERO, 0.1, 2, 0.3 * rad, 1.25 * rad, tint);
    const n = cells.length ? Math.min(28, 8 + Math.round(rad / 3)) : 0;
    for (let k = 0; k < n; k++) {
      cellDir(TERRITORY, cells[Math.floor((k * cells.length) / n)], this.W);
      this.coin(this.W.setLength(R + 0.5), o, 0.25 + 0.05 * k, 0.9 + 0.4 * r());
    }
  }

  /** A burning hull: embers flying and, now and then, a puff of its soot column. */
  private burning(st: MatchState, clock: number): void {
    const slot = Math.floor(clock / 0.12);
    if (slot === this.fireSlot) return;
    this.fireSlot = slot;
    st.ships.forEach((s, i) => {
      if (s.fire <= 0 || !afloat(s)) return;
      this.rand = rng(mix32(st.seed, slot, i + 77));
      const o = this.pose(st, i), r = this.rand;
      this.B.copy(o.p).addScaledVector(o.up, 1.4).addScaledVector(o.f, (r() - 0.5) * 0.6 * o.len).addScaledVector(o.side, (r() - 0.5) * o.beam);
      this.put(FX.ember, this.B, this.V.copy(o.up).multiplyScalar(2.5 + 2 * r()).addScaledVector(o.side, (r() - 0.5) * 2), 0, 0.9 + 0.6 * r(), 0.13, 0.08, TINT.fire, { g: -0.8, drag: 0.8, drift: 0.6 });
      if (slot % 4 === 0) this.put(FX.smoke, this.B, this.V.copy(o.up).multiplyScalar(1.6 + r()), 0, 6.5, 1, 5 + 2 * r(), TINT.soot, { drag: 0.15, drift: 1, g: -0.25 });
    });
  }

  /** What lasts across ticks, into the tail: shot in flight (with its shadow and trail), chests, kegs and coins afloat. */
  private lasting(st: MatchState, f: MatchFrame): void {
    const base = FX_CAP.pool, slot = Math.floor(f.clock / 0.06), trail = slot !== this.trailSlot;
    this.trailSlot = slot;
    let n = 0;
    const add = (kind: number, p: THREE.Vector3, v: THREE.Vector3, s: number, c: THREE.Vector3, par: number, seed: number) => {
      if (n < FX_CAP.tail) this.write(base + n++, kind, p, v, f.clock, 1e6, s, s, c, 0, 0, 0, par, 0, seed);
    };
    st.shots.forEach((shot, k) => {
      const age = Math.max(0, shot.age - (1 - f.alpha) * TICK), back = Math.max(0, age - 0.05), h = shotHeight(shot, age);
      shotAt(shot, back, this.Q);
      this.Q.multiplyScalar(R + 0.8 + shotHeight(shot, back));
      shotAt(shot, age, this.B);
      this.B.multiplyScalar(R + 0.8 + h);
      this.V.subVectors(this.B, this.Q).multiplyScalar(age - back > 1e-4 ? 1 / (age - back) : 0);
      const shell = shot.blast > 0, par = shell ? 3 : shot.effect === EFFECT.burn ? 1 : shot.effect === EFFECT.tear ? 2 : 0;
      add(FX.shot, this.B, this.V, shell ? 0.45 : 0.3, TINT.ink, par, (k * 0.137) % 1);
      add(FX.mark, this.W.copy(this.B).setLength(R), ZERO, 0.4 + 0.015 * h, TINT.ink, h, 0);
      if (trail && (shell || par === 1)) {
        this.rand = rng(mix32(slot, k, 5));
        if (shell) this.put(FX.smoke, this.B, ZERO, 0, 1.6, 0.3, 1.1, TINT.soot, { drift: 1 });
        else this.put(FX.ember, this.B, this.V.multiplyScalar(0.1), 0, 0.5, 0.13, 0.08, TINT.fire, { g: 2 });
      }
    });
    const bob = (at: { x: number; y: number; z: number }, k: number, h: number) =>
      this.lift(this.B.set(at.x, at.y, at.z).multiplyScalar(R), h + 0.15 * Math.sin(f.clock * 1.7 + k * 2.1));
    st.chests.forEach((c, k) => {
      const tint = TIER_TINT[c.tier] ?? TINT.ink;
      add(FX.glow, bob(c.at, k, 0.35), ZERO, 1.6 + 0.45 * c.tier, tint, c.tier, (k * 0.31) % 1);
      add(FX.chest, this.B, ZERO, 0.8, tint, c.tier, (k * 0.53) % 1);
    });
    st.kegs.forEach((g, k) => add(FX.chest, bob(g.at, k + 7, 0.2), ZERO, 0.55, TINT.fire, 5, (k * 0.71) % 1));
    st.coins.forEach((c, k) => { if (c.kind === AFLOAT.coin && c.value > 0) add(FX.coin, bob(c.at, k + 3, 0.25), ZERO, 0.38, TINT.gold, 0, (k * 0.29) % 1); });
    for (let i = n; i < this.wasTail; i++) this.data[0][4 * (base + i) + 3] = -1e9;
    this.tail = n;
  }
}

export const createEffects = (ctx: RenderContext): RenderModule => new Effects(ctx);

const VERT = /* glsl */ `
uniform float uFxClock, uFxMin;
uniform vec3 uFxWind;
attribute vec4 aP, aV, aK, aM, aC;
varying vec2 vUv;
varying vec4 vK; // kind, age, seed, the kind's own value
varying vec4 vC; // tint, stretch along the path
// how readable each kind must stay from afar (× uFxMin, rad)
const float READ[22] = float[22](0.0, 1.0, 1.0, 0.0, 0.0, 0.0, 0.6, 0.0, 0.5, 0.5, 1.4, 0.3, 1.0, 1.4, 0.0, 0.0, 0.8, 0.0, 0.0, 0.0, 0.0, 0.5);
void main() {
  float kind = aK.x, t = uFxClock - aP.w, age = t / aV.w;
  vUv = position.xy;
  vK = vec4(kind, clamp(age, 0.0, 1.0), aK.w, aM.z);
  vC = vec4(aC.rgb, 1.0);
  if (t < 0.0 || age >= 1.0) { gl_Position = vec4(0.0, 0.0, -2.0, 1.0); return; }
  vec3 up = normalize(aP.xyz);
  float s = mix(aK.y, aK.z, 1.0 - (1.0 - vK.y) * (1.0 - vK.y));
  if (kind > 15.5) {
    // decals lie on the sea along their heading, sliding at their speed (aM.x)
    vec3 h = aV.xyz - up * dot(aV.xyz, up);
    h = dot(h, h) > 1e-10 ? normalize(h) : normalize(cross(up, abs(up.y) < 0.9 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0)));
    vec3 c = aP.xyz + h * aM.x * t;
    s = max(s, length(c - cameraPosition) * uFxMin * READ[int(kind)]);
    vec2 q = position.xy * s * (abs(kind - 18.0) < 0.5 ? vec2(1.0, 0.45) : abs(kind - 20.0) < 0.5 ? vec2(1.0, 0.12) : vec2(1.0));
    gl_Position = projectionMatrix * viewMatrix * vec4(c + h * q.x + cross(up, h) * q.y + up * 0.12, 1.0);
    return;
  }
  float fly = aM.y > 0.0 ? (1.0 - exp(-aM.y * t)) / aM.y : t;
  vec3 p = aP.xyz + aV.xyz * fly + uFxWind * aC.w * t - up * (0.5 * aM.x * t * t);
  vec3 vel = aV.xyz * exp(-aM.y * t) + uFxWind * aC.w - up * aM.x * t;
  vec3 view = normalize(p - cameraPosition);
  s = max(s, length(p - cameraPosition) * uFxMin * READ[int(kind)]);
  vec3 at;
  if (abs(kind - 2.0) < 0.5 || abs(kind - 6.0) < 0.5) {
    // columns and flames stand on their foot, upright on the sea's normal, turned to the eye
    vec3 X = normalize(cross(up, view));
    float h = kind < 2.5 ? aK.z * pow(sin(3.1416 * min(1.0, vK.y * 1.25)), 0.6) + 0.2 : s * 1.8;
    float w = kind < 2.5 ? aK.y * (0.8 + 0.6 * vK.y) : s;
    at = p + X * position.x * w + up * (position.y * 0.5 + 0.5) * h;
  } else if (abs(kind - 3.0) < 0.5 || abs(kind - 7.0) < 0.5 || abs(kind - 11.0) < 0.5) {
    // what flies stretches along its path on screen, its head where it is
    vec3 a = vel - view * dot(vel, view);
    float m = length(a);
    vec3 X = m > 1e-4 ? a / m : normalize(cross(up, view)), Y = normalize(cross(view, X));
    float st = 1.0 + min(kind > 10.5 ? 4.0 : 2.5, m * 0.07);
    vC.w = st;
    at = p + X * (position.x * s * st - s * (st - 1.0)) + Y * position.y * s;
  } else {
    vec3 X = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]), Y = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
    vec2 q = position.xy;
    if (abs(kind - 4.0) < 0.5) {
      float an = aM.w * t + aK.w * 6.2832;
      q.y *= 0.35;
      q = vec2(cos(an) * q.x - sin(an) * q.y, sin(an) * q.x + cos(an) * q.y);
    }
    at = p + (X * q.x + Y * q.y) * s;
  }
  gl_Position = projectionMatrix * viewMatrix * vec4(at, 1.0);
}`;

const FRAG = /* glsl */ `
uniform float uFxClock;
uniform vec3 uFxInk, uFxFoam, uFxGold, uFxCore, uFxFlame, uFxWood, uFxShade;
varying vec2 vUv;
varying vec4 vK;
varying vec4 vC;
float fxHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float fxNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(fxHash(i), fxHash(i + vec2(1.0, 0.0)), f.x), mix(fxHash(i + vec2(0.0, 1.0)), fxHash(i + vec2(1.0, 1.0)), f.x), f.y);
}
// diagonal hatching on the page: on of each stroke's period
float fxHatch(float k, float on) { return step(1.0 - on, fract((gl_FragCoord.x - gl_FragCoord.y) * k)); }
// an inked line w wide along the zero of d
float fxLine(float d, float w) { float f = fwidth(d); return 1.0 - smoothstep(w, w + 1.5 * f, abs(d)); }
// burnished gold leaf: crinkled, flashing as the light sweeps across it
vec3 fxGilt(vec2 uv, float seed) {
  float c = fxNoise(uv * 9.0 + seed * 17.0);
  float sweep = pow(max(0.0, sin(uv.x * 2.0 + uv.y * 1.3 - uFxClock * 2.4 + seed * 6.0)), 12.0);
  return mix(uFxGold * (0.55 + 0.6 * c), vec3(1.0, 0.95, 0.8), 0.8 * sweep);
}
// a streak's head-centred frame: head at the origin, tail running back to x = 1 − 2·st
vec2 fxHead(vec2 uv, float st) { return vec2((uv.x - (1.0 - 1.0 / st)) * st, uv.y); }
void main() {
  int kind = int(vK.x + 0.5);
  float age = vK.y, seed = vK.z, par = vK.w;
  vec2 uv = vUv;
  float r = length(uv), th = atan(uv.y, uv.x);
  vec3 col = uFxInk;
  float a = 0.0;
  if (kind == 0) { // smoke: lobed and growing, a broken inked rim, a granulating wash, hatched away from the light
    float d = 1e3;
    for (int k = 0; k < 5; k++) {
      float ang = seed * 6.283 + float(k) * 1.2566 + age * 0.8;
      d = min(d, length(uv - (0.3 + 0.1 * age) * vec2(cos(ang), sin(ang))) - 0.42 - 0.12 * fxHash(vec2(seed, float(k))));
    }
    d += 0.06 * (fxNoise(uv * 5.0 + seed * 9.0) - 0.5);
    if (d > 0.04) discard;
    float inside = step(d, 0.0), shade = smoothstep(-0.3, 0.7, dot(uv, vec2(0.55, -0.83)));
    float rim = fxLine(d + 0.02, 0.018) * step(0.35 + 0.5 * age, fxNoise(vec2(th * 3.0, seed * 5.0)) + 0.2);
    float h = fxHatch(0.17, 0.35) * shade * inside;
    col = mix(mix(vC.rgb, uFxInk, 0.15 + 0.35 * shade), uFxInk, max(rim, 0.7 * h));
    a = pow(1.0 - age, 1.2) * smoothstep(0.0, 0.06, age) * max(0.85 * rim, inside * (0.45 + 0.25 * shade) * (0.75 + 0.5 * fxNoise(uv * 11.0 + seed)) + 0.25 * h);
  } else if (kind == 1) { // muzzle flash: a jagged star, white-hot core through ochre to vermilion, rimmed in ink
    float spikes = 0.45 + 0.5 * pow(abs(sin(th * 3.5 + seed * 20.0)), 5.0) * (0.6 + 0.4 * fxHash(vec2(floor(th * 1.11 + 3.5), seed)));
    float d = r - spikes * (0.75 + 0.45 * age);
    if (d > 0.05) discard;
    float rim = fxLine(d + 0.025, 0.025);
    col = mix(mix(mix(uFxFoam, uFxCore, smoothstep(0.0, 0.35, r)), uFxFlame, smoothstep(0.3, 0.75, r)), uFxInk, 0.9 * rim);
    a = (1.0 - age * age) * max(rim, 0.95 * step(d, 0.0));
  } else if (kind == 2) { // splash column: lead white, flared to a fingered crown, its far flank shaded and hatched
    float y = uv.y * 0.5 + 0.5, w = (0.35 + 0.65 * sqrt(y)) * (1.0 - 0.15 * age);
    float crown = 1.0 - 0.22 * abs(sin(uv.x * 6.0 + seed * 30.0)) * smoothstep(0.3, 1.0, abs(uv.x) + 0.3);
    float d = max(abs(uv.x) - w, y - crown);
    if (d > 0.05) discard;
    float inside = step(d, 0.0), side = smoothstep(-0.2, 1.0, uv.x);
    float rim = fxLine(d + 0.03, 0.03) * step(0.25 + 0.6 * age, fxNoise(vec2(uv.y * 6.0, uv.x * 3.0 + seed * 7.0)) + 0.3);
    float h = fxHatch(0.2, 0.3) * side * inside, fall = fxLine(fract(uv.x * 3.0 + y * 0.4 + seed) - 0.5, 0.04) * inside;
    col = mix(mix(uFxFoam, uFxShade, 0.55 * side), uFxInk, max(rim, max(0.6 * h, 0.25 * fall)));
    a = (1.0 - age) * max(0.9 * rim, inside * (0.7 + 0.2 * h));
  } else if (kind == 3) { // spray: lead-white drops ringed in ink, trailing
    float st = vC.w;
    vec2 q = fxHead(uv, st);
    float d = q.x > 0.0 ? length(q) - 0.8 : abs(q.y) - 0.8 * max(0.0, 1.0 + q.x / (2.0 * st - 1.0));
    if (d > 0.1) discard;
    float rim = fxLine(d + 0.1, 0.1);
    col = mix(uFxFoam, uFxInk, rim);
    a = (1.0 - age) * max(rim, 0.9 * step(d, 0.0));
  } else if (kind == 4) { // splinter: a tumbling plank, grained, its ends torn
    float d = max(abs(uv.x) - 0.95 + 0.15 * fxHash(vec2(floor(uv.y * 6.0), seed)), abs(uv.y) - 0.7);
    if (d > 0.06) discard;
    float rim = fxLine(d + 0.05, 0.05), grain = fxLine(fract(uv.y * 1.5 + 0.1 * sin(uv.x * 8.0 + seed * 9.0)) - 0.5, 0.06) * step(d, 0.0);
    col = mix(vC.rgb, uFxInk, max(rim, 0.5 * grain));
    a = (1.0 - age * age) * max(rim, step(d, 0.0));
  } else if (kind == 5) { // ink spatter: a spiky blot spreading, droplets flung round it
    float edge = 0.45 + 0.25 * fxNoise(vec2(th * 2.5 + seed * 13.0, seed)) + 0.35 * pow(fxNoise(vec2(th * 7.0, seed * 3.0)), 4.0);
    vec2 cell = floor(uv * 4.0), fc = fract(uv * 4.0) - 0.5;
    float drop = step(0.82, fxHash(cell + seed)) * step(length(fc), 0.18 * fxHash(cell * 1.7 + seed));
    col = mix(uFxInk, vC.rgb, 0.15);
    a = (1.0 - age) * 0.9 * max(step(r, edge * (0.6 + 0.5 * age)), drop);
  } else if (kind == 6) { // flame: a licking tongue, vermilion round an ochre core, rimmed in ink
    float y = uv.y * 0.5 + 0.5, w = 0.7 * pow(1.0 - y, 0.7) * (1.0 - 0.4 * age);
    float d = abs(uv.x + 0.2 * y * sin(9.0 * y + seed * 40.0 + uFxClock * 14.0)) - w;
    if (d > 0.06 || y < 0.03) discard;
    float rim = fxLine(d + 0.03, 0.03);
    col = mix(mix(uFxCore, uFxFlame, smoothstep(0.1, 0.55, y + abs(uv.x))), uFxInk, 0.8 * rim);
    a = (1.0 - age * age) * max(rim, 0.9 * step(d, 0.0));
  } else if (kind == 7) { // ember: a hot spark streaking
    float st = vC.w;
    vec2 q = fxHead(uv, st);
    float d = q.x > 0.0 ? length(q) - 0.7 : abs(q.y) - 0.5 * max(0.0, 1.0 + q.x / (2.0 * st - 1.0));
    if (d > 0.0) discard;
    col = mix(uFxFlame, uFxCore, step(length(q), 0.45));
    a = (1.0 - age) * (q.x > 0.0 ? 1.0 : 0.6);
  } else if (kind == 8) { // doubloon: a gilt disc spinning edge-on and back, flashing as its face meets the light
    float sp = uFxClock * (6.0 + 4.0 * seed) + seed * 6.283, ex = max(0.14, abs(cos(sp)));
    vec2 q = vec2(uv.x / ex, uv.y);
    float d = length(q) - 0.8;
    if (d * ex > 0.06) discard;
    float rim = fxLine(d, 0.09), inner = fxLine(length(q) - 0.52, 0.05);
    col = mix(fxGilt(q * 0.5, seed) * (0.8 + 0.4 * cos(sp)), uFxInk, max(rim, 0.6 * inner));
    col = mix(col, uFxFoam, 0.7 * pow(max(0.0, cos(sp)), 30.0) * step(d, 0.0));
    a = (1.0 - smoothstep(0.85, 1.0, age)) * max(rim, step(d, 0.0));
  } else if (kind == 9) { // glint: a four-point star twinkling
    vec2 dq = vec2(uv.x + uv.y, uv.x - uv.y) * 0.7071;
    float star = max(0.0, 1.0 - abs(uv.x) * 9.0 - abs(uv.y) * 1.1) + max(0.0, 1.0 - abs(uv.y) * 9.0 - abs(uv.x) * 1.1) + max(0.0, 1.0 - r * 4.0)
      + 0.5 * (max(0.0, 1.0 - abs(dq.x) * 14.0 - abs(dq.y) * 2.4) + max(0.0, 1.0 - abs(dq.y) * 14.0 - abs(dq.x) * 2.4));
    col = mix(vC.rgb, uFxFoam, smoothstep(0.4, 1.2, star));
    a = clamp(star, 0.0, 1.0) * sin(3.1416 * max(age, 0.02)) * (0.6 + 0.4 * sin(uFxClock * 11.0 + seed * 40.0));
  } else if (kind == 10) { // a chest's glow by tier: a pooled wash halo; rays from ultramarine up, turning; gold leaf at the top
    float tier = par, env = age < 1e-4 ? 1.0 : smoothstep(0.0, 0.1, age) * (1.0 - age * age);
    float edge = 0.62 + 0.08 * fxNoise(vec2(th * 2.0, seed * 7.0) + uFxClock * 0.3);
    float halo = smoothstep(edge, edge - 0.45, r) * (0.35 + 0.65 * smoothstep(edge - 0.25, edge, r)) * (0.7 + 0.5 * fxNoise(uv * 7.0 + seed * 3.0));
    float ray = pow(abs(cos(th * (2.0 + tier) + uFxClock * (0.3 + 0.15 * tier) + seed * 6.0)), 18.0 - 2.0 * tier) * smoothstep(1.0, 0.25, r) * step(0.2, r) * step(1.5, tier);
    float ring = fxLine(r - edge, 0.02) * step(0.5, fxNoise(vec2(th * 4.0, seed)) + 0.35);
    float h = fxHatch(0.22, 0.4) * smoothstep(edge, edge - 0.2, r) * step(tier, 0.5);
    col = mix(tier > 3.5 ? fxGilt(uv, seed) : vC.rgb, uFxInk, max(0.8 * ring, 0.5 * h));
    col = mix(col, tier > 3.5 ? uFxFoam : mix(vC.rgb, uFxFoam, 0.5), (tier > 3.5 ? 0.6 : 1.0) * ray);
    a = env * (0.85 + 0.15 * sin(uFxClock * 3.0 + seed * 6.0)) * (halo * (0.35 + 0.1 * tier) + ray * (0.45 + 0.1 * tier) + 0.6 * ring + 0.4 * h);
  } else if (kind == 11) { // shot: an ink ball trailing a hatched stroke (heated: glowing; chain: two balls linked; shell: smoking)
    float st = vC.w;
    vec2 q = fxHead(uv, st);
    bool chain = abs(par - 2.0) < 0.5, hot = abs(par - 1.0) < 0.5 || par > 2.5;
    float ball = chain ? min(length(q - vec2(0.0, 0.55)), length(q + vec2(0.0, 0.55))) - 0.42 : length(q) - 0.75;
    if (chain) ball = min(ball, max(abs(q.x) - 0.08, abs(q.y) - 0.55));
    float taper = clamp(1.0 + q.x / (2.0 * st - 1.0), 0.0, 1.0), tail = max(abs(q.y) - 0.55 * taper, q.x);
    if (min(ball, tail) > 0.05) discard;
    col = ball < 0.0 ? (abs(par - 1.0) < 0.5 ? mix(uFxInk, uFxFlame, 0.45) : uFxInk) : (hot ? mix(uFxFlame, uFxCore, 0.3) : uFxInk);
    a = ball < 0.0 ? 1.0 : step(tail, 0.0) * taper * (0.4 + 0.5 * fxHatch(0.3, 0.5));
  } else if (kind == 12) { // a chest afloat (tier bands and lock in its pigment, gilt at the top), or a powder keg with its fuse spitting
    float d, rim;
    vec3 body;
    if (par > 4.5) {
      d = length(uv / vec2(0.55, 0.75)) - 1.0;
      rim = fxLine(d * 0.6 + 0.03, 0.03) + fxLine(abs(uv.y) - 0.35, 0.03) * step(d, 0.0);
      body = mix(uFxWood, uFxInk, 0.3);
      float fuse = step(length(uv - vec2(0.15, 0.85)), 0.12 + 0.05 * sin(uFxClock * 30.0 + seed * 9.0));
      col = mix(mix(body, uFxInk, clamp(rim, 0.0, 1.0)), uFxCore, fuse);
      a = max(max(clamp(rim, 0.0, 1.0), step(d, 0.0)), fuse);
    } else {
      float box = max(abs(uv.x) - 0.7, max(uv.y - 0.1, -0.55 - uv.y));
      float lid = max(abs(uv.x) - 0.7, max(length(vec2(uv.x / 0.7, (uv.y - 0.1) / 0.38)) - 1.0, 0.1 - uv.y));
      d = min(box, lid);
      if (d > 0.06) discard;
      rim = clamp(fxLine(d + 0.04, 0.04) + fxLine(uv.y - 0.1, 0.03) * step(abs(uv.x), 0.7), 0.0, 1.0);
      float band = max(step(abs(abs(uv.x) - 0.42), 0.09), step(length(uv - vec2(0.0, 0.05)), 0.12)) * step(d, 0.0);
      body = mix(uFxWood, uFxInk, 0.2 + 0.25 * fxLine(fract(uv.y * 5.0) - 0.5, 0.08));
      col = mix(mix(body, par > 3.5 ? fxGilt(uv, seed) : vC.rgb, band), uFxInk, rim);
      a = max(rim, step(d, 0.0));
    }
  } else if (kind == 13) { // impact: a jagged drawn star that bursts and breaks up
    float k = floor(th / 0.6981 + 4.5), fr = fract(th / 0.6981 + 4.5);
    float spike = mix(0.38, 0.55 + 0.4 * fxHash(vec2(k, seed)), 1.0 - abs(fr - 0.5) * 2.0);
    float d = r - spike * (0.7 + 0.5 * age);
    if (d > 0.05) discard;
    float rim = fxLine(d + 0.035, 0.035);
    col = mix(mix(mix(uFxFoam, uFxCore, smoothstep(0.1, 0.45, r)), vC.rgb, smoothstep(0.35, 0.8, r)), uFxInk, rim);
    a = (1.0 - age) * max(rim, 0.9 * step(d, 0.0)) * step(1.2 * age, fxNoise(uv * 6.0 + seed * 11.0) + 0.15);
  } else if (kind == 16) { // ring: a spreading inked ring, broken as it fades, hatched inside
    float rr = 0.9 - 0.05 * age;
    float ln = fxLine(r - rr, 0.02 + 0.01 * (1.0 - age)) * step(0.3 + 0.6 * age, fxNoise(vec2(th * 5.0, seed * 9.0)) + 0.25);
    float band = step(r, rr) * step(rr - 0.12, r) * fxHatch(0.25, 0.4);
    col = mix(vC.rgb, uFxInk, 0.6);
    a = (1.0 - age) * max(0.85 * ln, 0.35 * band);
  } else if (kind == 17) { // the claim's bloom: a wash spreading wet, cauliflowered, pooling dark at its drying edge, granulating
    float edge = 0.86 + 0.07 * fxNoise(vec2(th * 3.0, seed * 5.0)) + 0.04 * fxNoise(vec2(th * 11.0, seed));
    float d = r - edge;
    if (d > 0.03) discard;
    float pool = smoothstep(-0.18, 0.0, d), ink = 0.6 * fxLine(d + 0.01, 0.006);
    col = mix(vC.rgb, uFxInk, 0.5 * ink + 0.15 * pool);
    a = smoothstep(0.0, 0.1, age) * (1.0 - smoothstep(0.55, 1.0, age)) * ((0.25 + 0.75 * pool) * (0.6 + 0.8 * fxNoise(uv * 23.0 + seed * 4.0)) * 0.45 + ink);
  } else if (kind == 18) { // the broken trail's tear: a zigzag rent opening, its lips inked, the owner's wash on the flaps
    float z = 0.45 * (abs(fract(uv.x * 3.5 + seed * 3.0) - 0.5) * 2.0 - 0.5);
    float d = abs(uv.y - z) - (0.12 + 0.2 * age) * (1.0 - uv.x * uv.x);
    float lips = fxLine(d, 0.04), flap = step(0.0, d) * smoothstep(0.35, 0.0, d) * (0.5 + 0.5 * fxNoise(uv * 9.0 + seed));
    col = d < 0.0 ? uFxFoam : mix(vC.rgb, uFxInk, lips);
    a = (1.0 - age) * (1.0 - smoothstep(0.75, 1.0, abs(uv.x))) * max(lips, max(0.5 * flap, 0.7 * step(d, 0.0)));
  } else if (kind == 19) { // the banking flourish: a gilt spiral the pen draws out, swelling and thinning
    float tt = (th + 3.1416) / 6.2832, best = 1e3, along = 0.0;
    for (int k = 0; k < 2; k++) {
      float u = (tt + float(k)) / 1.75, dd = abs(r - 0.2 - 0.7 * u);
      if (dd < best) { best = dd; along = u; }
    }
    float w = 0.02 + 0.05 * pow(sin(3.1416 * clamp(along, 0.0, 1.0)), 2.0);
    col = mix(fxGilt(uv, seed), uFxInk, 0.5 * fxLine(best - w, 0.01));
    a = fxLine(best, w) * step(along, min(1.0, age * 2.2)) * (1.0 - smoothstep(0.7, 1.0, age));
  } else if (kind == 20) { // a streak of foam or wind
    float d = abs(uv.y) - (1.0 - uv.x * uv.x) * 0.7;
    if (d > 0.0) discard;
    col = vC.rgb;
    a = sin(3.1416 * age) * (0.55 + 0.35 * fxNoise(vec2(uv.x * 4.0, seed * 9.0)));
  } else if (kind == 21) { // a shot's shadow on the sea, fainter the higher it flies
    a = (1.0 - smoothstep(0.5, 1.0, r)) * 0.4 / (1.0 + 0.15 * par);
  }
  if (a < 0.01) discard;
  writeVeil(col, min(a, 1.0));
}`;

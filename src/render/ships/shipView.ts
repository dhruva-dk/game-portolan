// WP19 — ships alive. The sim's ships drawn every frame by WP18's shipwright: each ShipView rides the swell between
// ticks (the sim's was/pos and wasHead/head at the loop's alpha), heels to leeward under a press of sail and outward in
// a turn on a spring that answers the helm at once, surges as it gathers way and pitches through chop, lists and
// settles as its hull is lost; sets and reefs its canvas as the sail step changes and trims it to the apparent wind
// (flattened close-hauled, full and drawing on a reach, billowing on a run, luffing head to wind), shivers it when hit,
// tears and slackens it as the ship is battered; streams its pennants, gilds the leader's, feeds its wake, throws bow
// spray, smokes and burns while ablaze, and hangs a stern lantern in the sky's lights that brightens in battle and
// gutters when the hull is low. Plumes draws every ship's smoke, flame and spray in one call. Fleet is the render
// module (world.ts MODULES; fleets.get(scene) for the packages that hang things on ships): a view per sim ship, levels
// through fleetLods.
import * as THREE from 'three';
import { afloat, EVENT, fullHull, SAIL, SHIPS, type Ship as Vessel } from '../../sim/state.ts';
import { newWind, seaFor, windAt, type Sea as Waters, type Wind } from '../../sim/environment.ts';
import { newSky, skyAt } from '../../sim/weather.ts';
import { PIGMENTS, TEAMS } from '../../style/palette.ts';
import { inkMaterial, linearVec, type Style } from '../../style/glsl.ts';
import { smoothstep } from '../craft.ts';
import type { Lamp, Lights } from '../light.ts';
import { seas } from '../sea.ts';
import { skies } from '../sky.ts';
import type { Riding, Swell } from '../swell.ts';
import type { MatchFrame, RenderContext, RenderModule } from '../world.ts';
import { EMBLEMS } from './emblems.ts';
import { FORMS, FORM_NAMES, type FormName } from './forms.ts';
import { trim, type Canvas, type RigState } from './rig.ts';
import { fleetLods, Ship } from './shipwright.ts';

const CANVAS: Record<number, Canvas> = { [SAIL.reefed]: 'reefed', [SAIL.plain]: 'plain', [SAIL.full]: 'full' };
const PRESS: Record<Canvas, number> = { reefed: 0.45, plain: 0.75, full: 1 };

/** How a ship moves: heel and pitch targets (rad) and the spring that chases them. */
export const MOTION = {
  wind: 0.17, // heel to leeward in a fair wind, full sail, beam on
  turn: 0.05, // heel outward per u/s² of turning (rate × speed)
  list: 0.26, // the list of a hull all but lost
  max: 0.45,
  spring: 10, // 1/s²: heel and pitch answer the helm within half a second, a little under-damped
  damp: 3.4, // 1/s
  surge: 0.05, // bow up per u/s² of gathering way
  chop: 0.01, // pitch and roll through chop per u/s of way, × the sea's roughness
  settle: 0.55, // the deck sinks this share of the draught as the hull is lost (squared)
  apparent: 0.35, // share of the ship's own way in the wind its sails and pennants see
  setRate: 1.4, // 1/s: canvas set and reefed
  shiverFade: 1.6, // 1/s
} as const;

/** The stern lantern: reach (u) in the sky's lights, brighter in battle, guttering once the hull is this far gone. */
export const LANTERN = { reach: 6, battle: 1.5, gutter: 0.6, glow: 0.4, battleGlow: 0.75 } as const;

/** What a view needs of the sea: the swell's ride (a flat stand-in in tests). */
export type Rider = Pick<Swell, 'ride'>;

/** The conditions over a ship this frame. */
export interface Conditions {
  /** The true wind's velocity over the ship, u/s tangent, and its strength, fair = 1 (sim windAt). */
  readonly wind: THREE.Vector3;
  strength: number;
  /** 1 fair, up to 2 in a squall, down to 0 in a calm: chop and spray. */
  rough: number;
  leader: boolean;
  /** Shot, rammed or aground this tick: the sails shiver. */
  hit: boolean;
  /** Reloading or ablaze: the lantern burns brighter. */
  battle: boolean;
}

const flicker = (t: number): number => 0.5 + 0.5 * Math.sin(t) * Math.sin(2.3 * t + 1.1);
const T = { a: new THREE.Vector3(), b: new THREE.Vector3(), c: new THREE.Vector3(), d: new THREE.Vector3(), m: new THREE.Matrix4(), q: new THREE.Quaternion(), e: new THREE.Euler() };

export class ShipView {
  readonly ship: Ship;
  readonly form: FormName;
  readonly length: number;
  readonly beam: number;
  readonly draft: number;
  /** In the sky's lights while afloat. */
  readonly lamp: Lamp = { pos: new THREE.Vector3(), reach: LANTERN.reach };
  /** The lights the lamp is in. */
  lit: Lights | null = null;
  /** The sails as last set. */
  readonly rig: RigState;
  /** Where the hull floats, its deck's up and its bow, interpolated between ticks. */
  readonly at = new THREE.Vector3();
  readonly up = new THREE.Vector3();
  readonly forward = new THREE.Vector3();
  /** Heel (rad, + to starboard), pitch (rad, + bow up), and the share of the hull lost, 0–1. */
  heel = 0;
  pitch = 0;
  lost = 0;
  private heelV = 0;
  private pitchV = 0;
  private speed = NaN;
  private accel = 0;
  private shiver = 0;
  private seed: number;
  private readonly side: number;
  private readonly owed = [0, 0, 0];
  private readonly bases: Record<Canvas, RigState>;
  private readonly riding: Riding = { position: new THREE.Vector3(), up: new THREE.Vector3() };
  private readonly lanternAt: THREE.Vector3;
  private readonly perchAt: THREE.Vector3;
  private readonly glow: THREE.IUniform | null;

  readonly id: number;

  constructor(style: Style, id: number, s: Vessel) {
    this.id = id;
    this.form = FORM_NAMES[s.form] ?? 'caravel';
    const team = TEAMS[s.pigment % TEAMS.length], ship = (this.ship = new Ship(style, { form: this.form, pigments: [team.primary, team.accent] }));
    // the pattern numbers the captains' emblems from 1 in EMBLEMS order (the player's gull last); 0 plain canvas
    ship.setEmblem(s.pattern > 0 ? EMBLEMS[(s.pattern - 1) % EMBLEMS.length] : null);
    ({ length: this.length, beam: this.beam, draft: this.draft } = FORMS[this.form]);
    const rig = ship.rig;
    this.bases = { reefed: rig.state('reefed'), plain: rig.state('plain'), full: rig.state('full') };
    this.rig = rig.state(CANVAS[s.sail] ?? 'plain');
    this.side = id % 2 ? 1 : -1;
    this.seed = 0x9e3779b9 ^ (id * 7919);
    this.lanternAt = new THREE.Vector3(0, rig.hull.railAft + 0.3, -0.47 * this.length);
    this.perchAt = ship.flags.reduce((top, f) => (f.root.y > top.y ? f.root : top), ship.flags[0].root).clone();
    let glow = null as THREE.IUniform | null;
    ship.traverse((o) => { const u = ((o as THREE.Mesh).material as THREE.ShaderMaterial | undefined)?.uniforms?.uLantern; if (u) glow ??= u; });
    this.glow = glow;
  }

  private rand(): number {
    this.seed = (Math.imul(this.seed, 1664525) + 1013904223) >>> 0;
    return this.seed / 2 ** 32;
  }

  /** Poses ship and sails for frame f from the sim's state s and the conditions over it, riding `rider`'s swell. */
  update(s: Vessel, f: { readonly alpha: number; readonly clock: number; readonly dt: number }, c: Conditions, rider: Rider): void {
    const dt = Math.min(Math.max(f.dt, 0), 0.1), ship = this.ship, { a, b, d } = T;
    this.at.set(s.was.x, s.was.y, s.was.z).lerp(b.set(s.pos.x, s.pos.y, s.pos.z), f.alpha).normalize();
    a.set(s.wasHead.x, s.wasHead.y, s.wasHead.z).lerp(b.set(s.head.x, s.head.y, s.head.z), f.alpha);
    const ride = rider.ride(this.at, a, this.length, this.beam, f.clock, this.riding);
    const up = this.up.copy(ride.up), fwd = this.forward.copy(a).addScaledVector(up, -up.dot(a)).normalize(), port = b.crossVectors(up, fwd);
    const full = fullHull(s.form, s.fittings);
    this.lost = full > 0 ? Math.min(Math.max(1 - s.hull / full, 0), 1) : 0;

    // the wind the canvas sees: from the bow toward port (+x) is positive
    const app = d.copy(c.wind).addScaledVector(fwd, -MOTION.apparent * s.speed);
    const toward = Math.atan2(app.dot(port), app.dot(fwd)), from = toward > 0 ? toward - Math.PI : toward + Math.PI, off = Math.abs(from);
    const breeze = Math.min(Math.max(c.strength, 0), 2), canvas = CANVAS[s.sail] ?? 'plain', base = this.bases[canvas];
    const drawing = smoothstep(0.5, 1.0, off); // head to wind nothing draws
    const shape = 0.55 + 0.35 * smoothstep(0.8, 1.4, off) + 0.1 * smoothstep(2.2, 2.8, off); // flat close-hauled … full on a run
    this.shiver = c.hit ? 1 : Math.max(0, this.shiver - MOTION.shiverFade * dt);
    const torn = Math.max(s.torn > 0 ? 0.85 : 0, 0.8 * smoothstep(0.45, 1, this.lost));
    const slack = Math.max(1 - smoothstep(0.05, 0.4, breeze), smoothstep(0.7, 1, this.lost));
    const k = 1 - Math.exp(-MOTION.setRate * dt);
    this.rig.sails.forEach((sl, i) => {
      const t = base.sails[i];
      sl.set += (t.set - sl.set) * k;
      sl.reef += (t.reef - sl.reef) * k;
      sl.fill = drawing * shape * Math.min(1, 0.3 + 0.7 * breeze) * (1 - 0.6 * slack);
      sl.slack = slack;
      sl.shiver = Math.max(this.shiver, 0.8 * (1 - drawing) * Math.min(breeze, 1));
      sl.torn = torn;
    });
    trim(ship.rig, this.rig, from);
    ship.setRig(this.rig, f.clock);
    ship.setWind(toward, Math.min(1, 0.2 + 0.55 * breeze), f.clock);
    ship.setLeader(c.leader);

    // heel: to leeward under a press of sail, outward in a turn, a list as the hull goes; pitch: surge and chop
    if (Number.isNaN(this.speed)) this.speed = s.speed;
    if (dt > 0) this.accel += ((s.speed - this.speed) / dt - this.accel) * (1 - Math.exp(-4 * dt));
    this.speed = s.speed;
    const chop = MOTION.chop * s.speed * Math.max(c.rough, 0);
    const heelTo = Math.sign(from) * MOTION.wind * PRESS[canvas] * drawing * breeze * Math.sin(off) - MOTION.turn * s.rate * s.speed
      + this.side * MOTION.list * smoothstep(0.35, 1, this.lost) + chop * Math.sin(2.7 * f.clock + this.id);
    const pitchTo = MOTION.surge * this.accel + chop * Math.sin(3.9 * f.clock + 1.7 * this.id);
    this.heelV += (MOTION.spring * (Math.min(Math.max(heelTo, -MOTION.max), MOTION.max) - this.heel) - MOTION.damp * this.heelV) * dt;
    this.pitchV += (MOTION.spring * (Math.min(Math.max(pitchTo, -0.2), 0.2) - this.pitch) - MOTION.damp * this.pitchV) * dt;
    this.heel += this.heelV * dt;
    this.pitch += this.pitchV * dt;

    ship.quaternion.setFromRotationMatrix(T.m.makeBasis(port, up, fwd)).multiply(T.q.setFromEuler(T.e.set(-this.pitch, 0, this.heel, 'XYZ')));
    ship.position.copy(ride.position).addScaledVector(up, -MOTION.settle * this.draft * this.lost * this.lost);
    ship.visible = true;
    ship.updateMatrixWorld();

    const gutter = this.lost > LANTERN.gutter ? 0.55 + 0.45 * flicker(7 * f.clock + this.id) : 1;
    ship.localToWorld(this.lamp.pos.copy(this.lanternAt));
    this.lamp.reach = LANTERN.reach * (c.battle ? LANTERN.battle : 1) * gutter;
    if (this.glow) this.glow.value = (c.battle ? LANTERN.battleGlow : LANTERN.glow) * gutter;
  }

  /** Smoke and flame while ablaze (a thin smoke once battered), spray thrown off the bows at speed. */
  exhale(plumes: Plumes, s: Vessel, c: Conditions, dt: number, clock: number): void {
    const ship = this.ship, owed = this.owed, { a, b } = T, up = this.up, wind = T.c.copy(c.wind).normalize();
    const smoke = s.fire > 0 ? 9 : 2.2 * smoothstep(0.55, 1, this.lost);
    owed[0] += smoke * dt;
    owed[1] += (s.fire > 0 ? 7 : 0) * dt;
    owed[2] += Math.max(0, s.speed - 1.5) * 3 * (0.4 + 0.6 * c.rough) * (1 + 4 * Math.max(0, -this.pitchV)) * dt;
    const deck = (y: number) => ship.localToWorld(a.set((this.rand() - 0.5) * 0.5 * this.beam, y, (this.rand() - 0.5) * 0.5 * this.length));
    for (; owed[0] >= 1; owed[0]--) {
      deck(ship.rig.hull.railAft * 0.6);
      b.copy(up).multiplyScalar(PLUME.rise * (0.8 + 0.4 * this.rand())).addScaledVector(wind, PLUME.drift * Math.min(c.strength, 2));
      plumes.spawn(SMOKE, a, b, PLUME.smokeLife * (0.8 + 0.4 * this.rand()), 0.45, s.fire > 0 ? 2.8 : 1.6, 0, clock, this.rand());
    }
    for (; owed[1] >= 1; owed[1]--) {
      deck(ship.rig.hull.railAft * 0.45);
      plumes.spawn(FLAME, a, b.copy(up).multiplyScalar(1.4).addScaledVector(wind, 0.3), 0.55 + 0.3 * this.rand(), 0.35, 0.7, 0, clock, this.rand());
    }
    for (; owed[2] >= 1; owed[2]--) {
      const side = this.rand() < 0.5 ? -1 : 1, port = T.d.crossVectors(up, this.forward);
      ship.localToWorld(a.set(side * 0.3 * this.beam, 0.15, 0.48 * this.length));
      b.copy(port).multiplyScalar(side * (1 + this.rand())).addScaledVector(up, 1.4 + 0.25 * s.speed * this.rand()).addScaledVector(this.forward, 0.5 * s.speed);
      plumes.spawn(SPRAY, a, b, 0.55 + 0.25 * this.rand(), 0.2, 0.6, 7, clock, this.rand());
    }
  }

  /** The masthead truck the companion gull perches on (WP23), in world space. */
  perch(out: THREE.Vector3): THREE.Vector3 {
    return this.ship.localToWorld(out.copy(this.perchAt));
  }
}

const SMOKE = 0, FLAME = 1, SPRAY = 2;
const PLUME = { perShip: 48, rise: 1.1, drift: 0.8, smokeLife: 3.6 } as const;
interface Puff { p: THREE.Vector3; v: THREE.Vector3; born: number; life: number; s0: number; s1: number; grav: number; kind: number; seed: number }

/** Every ship's smoke billows, flame tongues and bow spray: inked, washed and hatched billboards in one draw. */
export class Plumes {
  readonly mesh: THREE.Mesh;
  private readonly puffs: Puff[] = [];
  private next = 0;
  private readonly at: THREE.InstancedBufferAttribute;
  private readonly info: THREE.InstancedBufferAttribute;
  private readonly geo = new THREE.InstancedBufferGeometry();

  readonly capacity: number;

  constructor(style: Style, capacity = PLUME.perShip * SHIPS) {
    this.capacity = capacity;
    const g = this.geo;
    g.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0], 3));
    g.setIndex([0, 1, 2, 0, 2, 3]);
    this.at = new THREE.InstancedBufferAttribute(new Float32Array(4 * capacity), 4).setUsage(THREE.DynamicDrawUsage);
    this.info = new THREE.InstancedBufferAttribute(new Float32Array(4 * capacity), 4).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('aAt', this.at);
    g.setAttribute('aInfo', this.info);
    g.instanceCount = 0;
    const col = (p: (typeof PIGMENTS)[keyof typeof PIGMENTS]) => ({ value: linearVec(p) });
    this.mesh = new THREE.Mesh(g, inkMaterial(style, {
      uniforms: { uPInk: col(PIGMENTS.ironGall), uPSmoke: col(PIGMENTS.umber), uPFlame: col(PIGMENTS.vermilion), uPCore: col(PIGMENTS.ochre), uPSpray: col(PIGMENTS.leadWhite) },
      vertexShader: PLUME_VERT, fragmentShader: PLUME_FRAG, veil: true, side: THREE.DoubleSide,
    }));
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 3;
  }

  /** Triangles last drawn. */
  get triangles(): number {
    return 2 * this.geo.instanceCount;
  }

  spawn(kind: number, p: THREE.Vector3, v: THREE.Vector3, life: number, s0: number, s1: number, grav: number, clock: number, seed: number): void {
    const q = this.puffs[this.next] ?? (this.puffs[this.next] = { p: new THREE.Vector3(), v: new THREE.Vector3(), born: 0, life: 0, s0: 0, s1: 0, grav: 0, kind: 0, seed: 0 });
    q.p.copy(p); q.v.copy(v); q.born = clock; q.life = life; q.s0 = s0; q.s1 = s1; q.grav = grav; q.kind = kind; q.seed = seed;
    this.next = (this.next + 1) % this.capacity;
  }

  /** Lays the live puffs for render-clock time `clock`. */
  update(clock: number): void {
    const at = this.at.array as Float32Array, info = this.info.array as Float32Array, p = T.a, g = T.b;
    let n = 0;
    for (const q of this.puffs) {
      const t = clock - q.born, age = t / q.life;
      if (age < 0 || age >= 1) continue;
      p.copy(q.p).addScaledVector(q.v, t);
      if (q.grav) p.addScaledVector(g.copy(q.p).normalize(), -0.5 * q.grav * t * t);
      at.set([p.x, p.y, p.z, q.s0 + (q.s1 - q.s0) * Math.sqrt(age)], 4 * n);
      info.set([q.kind, age, q.seed, q.kind === SMOKE ? smoothstep(0, 0.12, age) : 1], 4 * n);
      n++;
    }
    this.geo.instanceCount = n;
    this.at.needsUpdate = this.info.needsUpdate = n > 0;
  }

  dispose(): void {
    this.geo.dispose();
    (this.mesh.material as THREE.Material).dispose();
  }
}

const PLUME_VERT = /* glsl */ `
attribute vec4 aAt;
attribute vec4 aInfo;
varying vec2 vUv;
varying vec4 vInfo;
void main() {
  vUv = position.xy;
  vInfo = aInfo;
  vec4 mv = modelViewMatrix * vec4(aAt.xyz, 1.0);
  mv.xy += position.xy * aAt.w * vec2(1.0, abs(aInfo.x - 1.0) < 0.5 ? 1.7 : 1.0);
  gl_Position = projectionMatrix * mv;
}`;

// smoke: three lumpy lobes with an inked rim thinning with age, an umber wash, hatching on the side away from the light;
// flame: a licking teardrop, vermilion round an ochre core, rimmed in ink; spray: lead-white flecks ringed in ink
const PLUME_FRAG = /* glsl */ `
uniform vec3 uPInk, uPSmoke, uPFlame, uPCore, uPSpray;
varying vec2 vUv;
varying vec4 vInfo;
float plumeHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
void main() {
  float kind = vInfo.x, age = vInfo.y, seed = vInfo.z, fade = vInfo.w;
  vec2 uv = vUv;
  vec3 col;
  float a;
  if (kind < 0.5) {
    float d = 1e3;
    for (int k = 0; k < 3; k++) {
      float ang = seed * 6.283 + float(k) * 2.094 + age;
      d = min(d, length(uv - 0.34 * vec2(cos(ang), sin(ang))) - 0.5 - 0.1 * plumeHash(vec2(seed, float(k))));
    }
    if (d > 0.05) discard;
    float rim = (1.0 - smoothstep(0.0, 0.05, abs(d + 0.025))) * (1.0 - 0.65 * age);
    float shade = smoothstep(-0.2, 0.6, dot(uv, vec2(0.6, -0.8)));
    float hatch = step(0.6, fract((gl_FragCoord.x - gl_FragCoord.y) * 0.16)) * shade * step(d, 0.0);
    col = mix(mix(uPSmoke, uPInk, 0.25 + 0.35 * shade), uPInk, max(rim, hatch * 0.6));
    a = fade * pow(1.0 - age, 0.8) * max(rim * 0.9, step(d, 0.0) * (0.45 + 0.3 * hatch));
  } else if (kind < 1.5) {
    float y = uv.y * 0.5 + 0.5, w = 0.75 * pow(1.0 - y, 0.7) * (1.0 - 0.4 * age);
    float d = abs(uv.x + 0.18 * y * sin(9.0 * y + seed * 40.0 + age * 12.0)) - w;
    if (d > 0.06 || y < 0.04) discard;
    float rim = 1.0 - smoothstep(0.0, 0.06, abs(d + 0.03));
    col = mix(mix(uPCore, uPFlame, smoothstep(0.1, 0.55, y + abs(uv.x))), uPInk, rim * 0.8);
    a = (1.0 - age * age) * max(rim, step(d, 0.0) * 0.85);
  } else {
    vec2 g = uv * 3.0 + seed * 17.0, cell = floor(g), f = fract(g) - 0.5;
    float r = plumeHash(cell), d = length(f) - 0.12 - 0.16 * r;
    if (r < 0.3 || d > 0.05 || length(uv) > 1.0) discard;
    col = mix(uPSpray, uPInk, 1.0 - smoothstep(0.0, 0.05, abs(d + 0.025)));
    a = 1.0 - age;
  }
  writeVeil(col, a);
}`;

/** The ships as drawn, per scene: WP22 (gunfire, hits), WP23 (the gull's perch) and WP24 (the chase camera) find them here. */
export const fleets = new WeakMap<THREE.Object3D, Fleet>();

export class Fleet implements RenderModule {
  /** By sim ship index; null until the ship is first seen. */
  readonly views: (ShipView | null)[] = [];
  readonly plumes: Plumes;
  readonly group = new THREE.Group();
  /** Triangles the ships (under fleetLods) and their plumes submitted last frame. */
  triangles = 0;
  private waters: Waters | null = null;
  private seed = -1;
  private tick = -1;
  private readonly wind: Wind = newWind();
  private readonly sky = newSky();
  private readonly hits = new Uint8Array(SHIPS);
  private readonly cond: Conditions = { wind: new THREE.Vector3(), strength: 1, rough: 1, leader: false, hit: false, battle: false };
  private readonly shown: Ship[] = [];

  private readonly ctx: RenderContext;

  constructor(ctx: RenderContext) {
    this.ctx = ctx;
    this.plumes = new Plumes(ctx.pipeline.style);
    this.group.name = 'ships';
    this.group.add(this.plumes.mesh);
    ctx.scene.add(this.group);
    fleets.set(ctx.scene, this);
  }

  private get lights(): Lights | null {
    return skies.get(this.ctx.scene)?.lights ?? null;
  }

  frame(f: MatchFrame): void {
    const st = f.state, sea = seas.get(this.ctx.scene), c = this.cond, shown = this.shown;
    if (!sea) return;
    if (st.seed !== this.seed || !this.waters) { this.seed = st.seed; this.waters = seaFor(this.ctx.world, st.seed); }
    this.hits.fill(0);
    if (st.tick !== this.tick) {
      this.tick = st.tick;
      for (const e of st.events) if (e.kind === EVENT.hit || e.kind === EVENT.ram || e.kind === EVENT.struck) this.hits[e.ship] = 1;
    }
    shown.length = 0;
    st.ships.forEach((s, i) => {
      let v = this.views[i];
      if (!afloat(s)) {
        if (v?.ship.visible) { v.ship.visible = false; sea.wakes.forget(i); v.lit?.remove(v.lamp); v.lit = null; }
        return;
      }
      if (!v) { v = this.views[i] = new ShipView(this.ctx.pipeline.style, i, s); this.group.add(v.ship); }
      const lights = this.lights;
      if (lights && v.lit !== lights) { v.lit?.remove(v.lamp); lights.add(v.lamp); v.lit = lights; }
      windAt(this.waters!, st, s.pos, this.wind);
      skyAt(st, s.pos, this.sky);
      c.wind.set(this.wind.v.x, this.wind.v.y, this.wind.v.z);
      c.strength = this.wind.strength;
      c.rough = 1 + this.sky.squall - this.sky.calm;
      c.leader = st.leader === i;
      c.hit = this.hits[i] === 1;
      c.battle = s.fire > 0 || s.reload.some((r) => r > 0);
      v.update(s, f, c, sea.swell);
      sea.wakes.feed(i, v.ship.position, v.forward, s.speed, f.clock, v.length, v.beam);
      v.exhale(this.plumes, s, c, f.dt, f.clock);
      shown.push(v.ship);
    });
    this.plumes.update(f.clock);
    this.triangles = fleetLods(shown, this.ctx.camera, this.ctx.pipeline.renderer.domElement.clientHeight || 440, f.dt) + this.plumes.triangles;
  }

  dispose(): void {
    for (const v of this.views) {
      if (!v) continue;
      v.lit?.remove(v.lamp);
      v.ship.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) { m.geometry.dispose(); (m.material as THREE.Material).dispose(); } });
    }
    this.plumes.dispose();
    this.ctx.scene.remove(this.group);
    fleets.delete(this.ctx.scene);
  }
}

export const createShips = (ctx: RenderContext): RenderModule => new Fleet(ctx);

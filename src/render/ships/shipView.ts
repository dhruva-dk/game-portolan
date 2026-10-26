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
import { Outfit, WOUND, WOUNDS, type Wound } from './outfit.ts';
import { R } from '../../sim/sphere.ts';

const CANVAS: Record<number, Canvas> = { [SAIL.reefed]: 'reefed', [SAIL.plain]: 'plain', [SAIL.full]: 'full' };
const PRESS: Record<Canvas, number> = { reefed: 0.45, plain: 0.75, full: 1 };

export const MOTION = {
  wind: 0.17,
  turn: 0.05,
  list: 0.26,
  max: 0.45,
  spring: 10,
  damp: 3.4,
  surge: 0.05,
  chop: 0.01,
  settle: 0.55,
  apparent: 0.35,
  setRate: 1.4,
  shiverFade: 1.6,
} as const;

export const LANTERN = { reach: 6, battle: 1.5, gutter: 0.6, glow: 0.4, battleGlow: 0.75 } as const;
export const SINK = { strike: 1.2, rig: 3.2, founder: 5.5, under: 10.5, gone: 11, list: 0.75, pitch: 0.42, rings: [7.6, 8.4, 9.3, 10.2, 11], chest: 8.3, mark: 60, right: 0.6, level: 0.5, depth: 0.7, ease: 1.2 } as const;
export const STRIKE = { at: 0.88, rate: 0.8 } as const;

export type Rider = Pick<Swell, 'ride'>;

export interface Conditions {
  readonly wind: THREE.Vector3;
  strength: number;
  rough: number;
  leader: boolean;
  hit: boolean;
  battle: boolean;
}

const flicker = (t: number): number => 0.5 + 0.5 * Math.sin(t) * Math.sin(2.3 * t + 1.1);
const T = { v4: new THREE.Vector4(), a: new THREE.Vector3(), b: new THREE.Vector3(), c: new THREE.Vector3(), d: new THREE.Vector3(), m: new THREE.Matrix4(), q: new THREE.Quaternion(), e: new THREE.Euler() };

export class ShipView {
  readonly ship: Ship;
  readonly form: FormName;
  readonly length: number;
  readonly beam: number;
  readonly draft: number;
  readonly lamp: Lamp = { pos: new THREE.Vector3(), reach: LANTERN.reach };
  lit: Lights | null = null;
  readonly rig: RigState;
  readonly at = new THREE.Vector3();
  readonly up = new THREE.Vector3();
  readonly forward = new THREE.Vector3();
  heel = 0;
  pitch = 0;
  lost = 0;
  sinkT = -1;
  struck = 0;
  colours: THREE.Vector4[] = [];
  readonly wounds: Wound[] = [];
  readonly outfit: Outfit;
  private colourRest: THREE.Vector4[] = [];
  private topFlag = 0;
  private worst = 0;
  private dressT = 1;
  private burnt = 0;
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
  readonly tint = new THREE.Vector4();

  constructor(style: Style, id: number, s: Vessel) {
    this.id = id;
    this.form = FORM_NAMES[s.form] ?? 'caravel';
    const team = TEAMS[s.pigment % TEAMS.length], ship = (this.ship = new Ship(style, { form: this.form, pigments: [team.primary, team.accent] }));
    ship.setEmblem(s.pattern > 0 ? EMBLEMS[(s.pattern - 1) % EMBLEMS.length] : null);
    ({ length: this.length, beam: this.beam, draft: this.draft } = FORMS[this.form]);
    const rig = ship.rig;
    this.bases = { reefed: rig.state('reefed'), plain: rig.state('plain'), full: rig.state('full') };
    this.rig = rig.state(CANVAS[s.sail] ?? 'plain');
    this.side = id % 2 ? 1 : -1;
    const tint = linearVec(team.primary);
    this.tint.set(tint.x, tint.y, tint.z, 1);
    this.seed = 0x9e3779b9 ^ (id * 7919);
    this.lanternAt = new THREE.Vector3(0, rig.hull.railAft + 0.3, -0.47 * this.length);
    this.perchAt = ship.flags.reduce((top, f) => (f.root.y > top.y ? f.root : top), ship.flags[0].root).clone();
    let glow = null as THREE.IUniform | null;
    ship.traverse((o) => { const u = ((o as THREE.Mesh).material as THREE.ShaderMaterial | undefined)?.uniforms?.uLantern; if (u) glow ??= u; });
    this.glow = glow;
    this.outfit = new Outfit(ship, rig);
    ship.traverse((o) => { const u = ((o as THREE.Mesh).material as THREE.ShaderMaterial | undefined)?.uniforms?.uFlagRoot; if (u && !this.colours.length) this.colours = u.value as THREE.Vector4[]; });
    this.colourRest = this.colours.map((q) => q.clone());
    this.topFlag = ship.flags.reduce((t, fl, i) => (fl.root.y > ship.flags[t].root.y ? i : t), 0);
  }

  get gone(): boolean {
    return this.sinkT >= SINK.gone;
  }

  struckAt(p: { readonly x: number; readonly y: number; readonly z: number }): void {
    if (this.wounds.length >= WOUNDS.cap || this.sinkT >= 0) return;
    const q = this.ship.worldToLocal(T.b.set(p.x, p.y, p.z).normalize().multiplyScalar(R));
    this.cut(q.x >= 0 ? 1 : -1, Math.min(Math.max(q.z / this.length + 0.5, 0.1), 0.9));
  }

  private cut(side: number, u = 0.12 + 0.76 * this.rand()): void {
    const rail = this.rand() < 0.25;
    this.wounds.push({ u, side, h: 0.15 + 0.7 * this.rand(), kind: rail ? WOUND.rail : WOUND.hole, size: 0.75 + 0.5 * this.rand(), seed: (this.rand() * 2 ** 31) | 0 });
  }

  private strike(): void {
    const k = this.struck * this.struck * (3 - 2 * this.struck), low = this.ship.rig.hull.railAft + 0.12;
    this.colours.forEach((q, i) => {
      const r = this.colourRest[i];
      if (i === this.topFlag || i >= this.ship.flags.length || !r) return;
      q.set(r.x, r.y + (Math.min(low, r.y) - r.y) * k, r.z, r.w * (1 - 0.65 * k));
    });
  }

  private tend(s: Vessel, dt: number): void {
    const w = this.wounds, open = w.filter((x) => x.kind === WOUND.hole || x.kind === WOUND.rail).length;
    const want = Math.round(WOUNDS.max * Math.pow(this.lost, 0.85));
    for (let n = open; n < want && w.length < WOUNDS.cap; n++) this.cut(this.rand() < 0.5 ? 1 : -1);
    if (this.lost < this.worst - 0.03) {
      let mend = open - want;
      for (let j = w.length - 1; j >= 0 && mend > 0; j--) if (w[j].kind === WOUND.hole || w[j].kind === WOUND.rail) { w[j].kind = WOUND.patch; mend--; }
      this.worst = this.lost;
    }
    this.worst = Math.max(this.worst, this.lost);
    if (s.fire > 0 && this.burnt < WOUNDS.scorch && w.length < WOUNDS.cap && this.rand() < 1.5 * dt) {
      this.burnt++;
      w.push({ u: 0.15 + 0.7 * this.rand(), side: this.rand() < 0.5 ? 1 : -1, h: 1, kind: WOUND.scorch, size: 0.8 + 0.5 * this.rand(), seed: (this.rand() * 2 ** 31) | 0 });
    }
    this.dressT += dt;
    if (this.dressT >= WOUNDS.rebuild) { this.dressT = 0; this.outfit.dress(s.fittings, w, this.id); }
  }

  private rand(): number {
    this.seed = (Math.imul(this.seed, 1664525) + 1013904223) >>> 0;
    return this.seed / 2 ** 32;
  }

  update(s: Vessel, f: { readonly alpha: number; readonly clock: number; readonly dt: number }, c: Conditions, rider: Rider): void {
    const dt = Math.min(Math.max(f.dt, 0), 0.1), ship = this.ship, { a, b, d } = T;
    if (afloat(s)) this.sinkT = -1;
    else if (this.sinkT < 0) this.sinkT = 0;
    const sinking = this.sinkT >= 0, ts = sinking ? (this.sinkT += dt) : -1;
    if (sinking && this.forward.lengthSq() > 0.5) a.copy(this.forward);
    else {
      this.at.set(s.was.x, s.was.y, s.was.z).lerp(b.set(s.pos.x, s.pos.y, s.pos.z), f.alpha).normalize();
      a.set(s.wasHead.x, s.wasHead.y, s.wasHead.z).lerp(b.set(s.head.x, s.head.y, s.head.z), f.alpha);
    }
    const ride = rider.ride(this.at, a, this.length, this.beam, f.clock, this.riding);
    const up = this.up.copy(ride.up), fwd = this.forward.copy(a).addScaledVector(up, -up.dot(a)).normalize(), port = b.crossVectors(up, fwd);
    const full = fullHull(s.form, s.fittings);
    this.lost = full > 0 ? Math.min(Math.max(1 - s.hull / full, 0), 1) : 0;
    if (sinking) this.lost = Math.max(this.lost, 0.7 + 0.3 * smoothstep(0, SINK.rig, ts));
    const strike = sinking || this.lost >= STRIKE.at ? 1 : 0;
    this.struck = strike > this.struck ? Math.min(strike, this.struck + STRIKE.rate * dt) : Math.max(strike, this.struck - STRIKE.rate * dt);
    const canvasLeft = sinking ? 1 - smoothstep(SINK.strike, SINK.rig + 0.6, ts) : 1;

    const app = d.copy(c.wind).addScaledVector(fwd, -MOTION.apparent * s.speed);
    const toward = Math.atan2(app.dot(port), app.dot(fwd)), from = toward > 0 ? toward - Math.PI : toward + Math.PI, off = Math.abs(from);
    const breeze = Math.min(Math.max(c.strength, 0), 2), canvas = CANVAS[s.sail] ?? 'plain', base = this.bases[canvas];
    const drawing = smoothstep(0.5, 1.0, off);
    const shape = 0.55 + 0.35 * smoothstep(0.8, 1.4, off) + 0.1 * smoothstep(2.2, 2.8, off);
    this.shiver = c.hit ? 1 : Math.max(0, this.shiver - MOTION.shiverFade * dt);
    const torn = Math.max(s.torn > 0 ? 0.85 : 0, 0.8 * smoothstep(0.45, 1, this.lost));
    const slack = Math.max(1 - smoothstep(0.05, 0.4, breeze), smoothstep(0.7, 1, this.lost));
    const k = 1 - Math.exp(-MOTION.setRate * dt);
    this.rig.sails.forEach((sl, i) => {
      const t = base.sails[i];
      sl.set += (t.set * canvasLeft - sl.set) * k;
      sl.reef += (t.reef - sl.reef) * k;
      sl.fill = drawing * shape * Math.min(1, 0.3 + 0.7 * breeze) * (1 - 0.6 * slack);
      sl.slack = slack;
      sl.shiver = Math.max(this.shiver, 0.8 * (1 - drawing) * Math.min(breeze, 1));
      sl.torn = torn;
    });
    trim(ship.rig, this.rig, from);
    const wx = Math.sin(toward), wz = Math.cos(toward);
    this.rig.sails.forEach((sl, i) => {
      const e = ship.rig.yardMatrix(this.rig, ship.rig.sails[i].yard, T.m).elements;
      if (e[8] * wx + e[10] * wz < 0) sl.fill = -sl.fill;
    });
    ship.setRig(this.rig, f.clock);
    ship.setWind(toward, Math.min(1, 0.2 + 0.55 * breeze), f.clock);
    ship.setLeader(c.leader);
    this.strike();
    this.tend(s, dt);

    if (Number.isNaN(this.speed)) this.speed = s.speed;
    if (dt > 0) this.accel += ((s.speed - this.speed) / dt - this.accel) * (1 - Math.exp(-4 * dt));
    this.speed = s.speed;
    const chop = MOTION.chop * s.speed * Math.max(c.rough, 0);
    const heelTo = Math.sign(from) * MOTION.wind * PRESS[canvas] * drawing * breeze * Math.sin(off) - MOTION.turn * s.rate * s.speed
      + this.side * MOTION.list * smoothstep(0.35, 1, this.lost) + chop * Math.sin(2.7 * f.clock + this.id);
    const pitchTo = MOTION.surge * this.accel + chop * Math.sin(3.9 * f.clock + 1.7 * this.id);
    const cap = sinking ? 1.2 : MOTION.max, end = this.id % 2 ? -1 : 1;
    const heelGo = sinking ? this.side * (MOTION.list + (SINK.list - MOTION.list) * smoothstep(0, SINK.rig, ts) * (1 - SINK.right * smoothstep(SINK.founder - 1, SINK.under - 2, ts))) : heelTo;
    const pitchGo = sinking ? end * SINK.pitch * smoothstep(SINK.rig, SINK.founder + 1.5, ts) * (1 - SINK.level * smoothstep(SINK.founder + 1.5, SINK.under - 1, ts)) : Math.min(Math.max(pitchTo, -0.2), 0.2);
    this.heelV += (MOTION.spring * (Math.min(Math.max(heelGo, -cap), cap) - this.heel) - MOTION.damp * this.heelV) * dt;
    this.pitchV += (MOTION.spring * (pitchGo - this.pitch) - MOTION.damp * this.pitchV) * dt;
    this.heel += this.heelV * dt;
    this.pitch += this.pitchV * dt;

    ship.quaternion.setFromRotationMatrix(T.m.makeBasis(port, up, fwd)).multiply(T.q.setFromEuler(T.e.set(-this.pitch, 0, this.heel, 'XYZ')));
    const goes = Math.min(Math.max((ts - SINK.founder + 0.5) / (SINK.under - SINK.founder + 0.5), 0), 1);
    const under = sinking ? 0.7 * this.draft * smoothstep(0, SINK.founder, ts) + SINK.depth * ship.height * (1 - Math.pow(1 - goes, SINK.ease)) : 0;
    ship.position.copy(ride.position).addScaledVector(up, -MOTION.settle * this.draft * this.lost * this.lost - under);
    ship.visible = !this.gone;
    ship.updateMatrixWorld();

    const gutter = this.lost > LANTERN.gutter ? 0.55 + 0.45 * flicker(7 * f.clock + this.id) : 1;
    ship.localToWorld(this.lamp.pos.copy(this.lanternAt));
    const drown = sinking ? 1 - smoothstep(SINK.founder, SINK.founder + 1.5, ts) : 1;
    this.lamp.reach = LANTERN.reach * (c.battle ? LANTERN.battle : 1) * gutter * drown;
    if (this.glow) this.glow.value = (c.battle ? LANTERN.battleGlow : LANTERN.glow) * gutter * drown;
  }

  exhale(plumes: Plumes, s: Vessel, c: Conditions, dt: number, clock: number): void {
    const ship = this.ship, owed = this.owed, { a, b } = T, up = this.up, wind = T.c.copy(c.wind).normalize();
    const smoke = s.fire > 0 ? 9 : 2.2 * smoothstep(0.55, 1, this.lost) * (this.sinkT < 0 ? 1 : 1 - smoothstep(0, SINK.strike, this.sinkT));
    owed[0] += smoke * dt;
    owed[1] += (s.fire > 0 ? 7 : 0) * dt;
    owed[2] += (this.sinkT < 0 ? 1 : 0) * Math.max(0, s.speed - 1.5) * 3 * (0.4 + 0.6 * c.rough) * (1 + 4 * Math.max(0, -this.pitchV)) * dt;
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
    const o = this.outfit;
    if (this.sinkT < 0 && o.chimney && this.rand() < 1.2 * dt) {
      ship.localToWorld(a.copy(o.chimney));
      plumes.spawn(SMOKE, a, b.copy(up).multiplyScalar(0.7).addScaledVector(wind, 0.4), 2.2, 0.12, 0.55, 0, clock, this.rand());
    }
    if (this.sinkT < 0 && this.lost > 0.25) for (const sp of o.spouts) if (this.rand() < 2.5 * dt) {
      ship.localToWorld(a.copy(sp));
      b.set(sp.x, 0, 0).transformDirection(ship.matrixWorld).multiplyScalar(0.9).addScaledVector(up, 0.4);
      plumes.spawn(SPRAY, a, b, 0.5, 0.1, 0.25, 7, clock, this.rand());
    }
    if (this.sinkT >= 0) this.founder(plumes, c, clock, dt);
  }

  private founder(plumes: Plumes, c: Conditions, clock: number, dt: number): void {
    const t = this.sinkT, t0 = t - Math.max(dt, 1e-6), up = this.up, L = this.length, { a, b } = T;
    const port = T.d.crossVectors(up, this.forward), wind = T.c.copy(c.wind).addScaledVector(up, -up.dot(c.wind)), sea = this.riding.position.length();
    const past = (k: number) => t0 < k && t >= k;
    const onSea = (x: number, z: number) => a.copy(this.at).multiplyScalar(sea).addScaledVector(port, x).addScaledVector(this.forward, z).normalize().multiplyScalar(sea + 0.05);
    const flotsam = (size: number, life = 45, tint: THREE.Vector4 | null = null) => plumes.spawn(FLOTSAM, a, b.copy(wind).multiplyScalar(0.1).addScaledVector(port, (this.rand() - 0.5) * 0.3), life, size, size, 0, clock, this.rand(), tint);
    const foam = (life: number, s0: number, s1: number) => plumes.spawn(FOAM, a, b.copy(wind).multiplyScalar(0.04), life, s0 * L, s1 * L, 0, clock, this.rand());
    if (past(SINK.rig)) for (let j = 0; j < 16; j++) {
      onSea(this.side * (0.2 + 0.8 * this.rand()) * 0.6 * L, (this.rand() - 0.5) * 0.8 * L);
      plumes.spawn(SPRAY, a, b.copy(up).multiplyScalar(1.4 + 1.6 * this.rand()), 0.9 + 0.4 * this.rand(), 0.3, 1.0, 7, clock, this.rand());
    }
    if (past(SINK.rig + 0.2)) for (let j = 0; j < 3; j++) { onSea(this.side * (0.25 + 0.5 * this.rand()) * L, (this.rand() - 0.5) * 0.8 * L); foam(5, 0.22, 0.45); }
    if (past(SINK.rig + 0.4)) for (let j = 0; j < 4; j++) { onSea(this.side * (0.3 + 0.7 * this.rand()) * 0.6 * L, (this.rand() - 0.5) * 0.7 * L); flotsam((0.09 + 0.06 * this.rand()) * L); }
    if (t > SINK.founder - 0.5 && t < SINK.under && this.rand() < 2.4 * dt) { onSea((this.rand() - 0.5) * 0.7 * L, (this.rand() - 0.5) * L); flotsam((0.05 + 0.07 * this.rand()) * L); }
    const end = this.id % 2 ? -1 : 1, going = smoothstep(SINK.founder, SINK.under, t);
    if (t > SINK.founder - 1.5 && t < SINK.under + 0.3 && this.rand() < (5 + 2 * Math.min(Math.max(c.rough - 1, 0), 1)) * dt) {
      const side = this.rand() < 0.5 ? -1 : 1;
      onSea(side * (0.7 + 0.7 * this.rand()) * this.beam, ((this.rand() - 0.5) * (1.1 - 0.6 * going) - 0.35 * end * going) * L);
      foam(3 + 2 * this.rand(), 0.14, 0.34 + 0.08 * this.rand());
    }
    if (t > SINK.founder - 1 && t < SINK.gone && this.rand() < 8 * dt) {
      onSea((this.rand() - 0.5) * 0.5 * L, (this.rand() - 0.5) * 0.9 * L);
      plumes.spawn(SPRAY, a, b.copy(up).multiplyScalar(0.6 + 0.8 * this.rand()), 0.6, 0.15, 0.5, 7, clock, this.rand());
    }
    if (past(SINK.founder)) for (let j = 0; j < 5; j++) { onSea((this.rand() - 0.5) * 0.5 * L, (this.rand() - 0.5) * 0.7 * L); plumes.spawn(SLICK, a, b.copy(wind).multiplyScalar(0.06), 40, 0.3 * L, 0.75 * L, 0, clock, this.rand()); }
    for (const k of SINK.rings) if (past(k)) { onSea(0, -0.25 * end * L * going); plumes.spawn(RING, a, b.set(0, 0, 0), 7, 0.25 * L, 1.6 * L, 0, clock, this.rand(), this.tint); }
    if (past(SINK.under - 0.4)) {
      onSea(0, -0.3 * end * L); foam(16, 0.35, 0.95);
      for (let j = 0; j < 12; j++) { onSea((this.rand() - 0.5) * 0.4 * L, (-0.3 * end + (this.rand() - 0.5) * 0.4) * L); plumes.spawn(SPRAY, a, b.copy(up).multiplyScalar(1.6 + 1.6 * this.rand()).addScaledVector(port, (this.rand() - 0.5) * 2), 1 + 0.4 * this.rand(), 0.3, 0.9, 7, clock, this.rand()); }
      for (let j = 0; j < 6; j++) { onSea((this.rand() - 0.5) * 0.8 * L, (-0.3 * end + (this.rand() - 0.5) * 0.8) * L); flotsam((0.06 + 0.07 * this.rand()) * L, SINK.mark); }
    }
    if (past(SINK.chest)) { onSea(this.side * 0.55 * this.beam + 0.1 * L, -0.15 * end * L); flotsam(0.11 * L, SINK.mark, CHEST); }
    if (past(SINK.gone)) { onSea(0, -0.3 * end * L); plumes.spawn(RING, a, b.set(0, 0, 0), SINK.mark, 1.25 * L, 1.25 * L, 0, clock, this.rand(), T.v4.set(this.tint.x, this.tint.y, this.tint.z, 3)); }
  }

  perch(out: THREE.Vector3): THREE.Vector3 {
    return this.ship.localToWorld(out.copy(this.perchAt));
  }
}

export const SMOKE = 0, FLAME = 1, SPRAY = 2, RING = 3, SLICK = 4, FLOTSAM = 5, FOAM = 6;
const CHEST = new THREE.Vector4(...linearVec(PIGMENTS.ochre).toArray(), 2);
const PLUME = { perShip: 48, marks: 240, rise: 1.1, drift: 0.8, smokeLife: 3.6 } as const;
interface Puff { p: THREE.Vector3; v: THREE.Vector3; born: number; life: number; s0: number; s1: number; grav: number; kind: number; seed: number; tint: THREE.Vector4 }

export class Plumes {
  readonly mesh: THREE.Mesh;
  private readonly puffs: Puff[] = [];
  private next = 0;
  private nextMark = 0;
  private readonly at: THREE.InstancedBufferAttribute;
  private readonly info: THREE.InstancedBufferAttribute;
  private readonly tints: THREE.InstancedBufferAttribute;
  private readonly ups: THREE.InstancedBufferAttribute;
  private readonly geo = new THREE.InstancedBufferGeometry();
  private readonly surface = { height: 0, normal: new THREE.Vector3() };

  readonly capacity: number;
  readonly marks: number;

  constructor(style: Style, capacity = PLUME.perShip * SHIPS, marks = PLUME.marks) {
    this.capacity = capacity;
    this.marks = marks;
    const g = this.geo, n = capacity + marks;
    g.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0], 3));
    g.setIndex([0, 1, 2, 0, 2, 3]);
    this.at = new THREE.InstancedBufferAttribute(new Float32Array(4 * n), 4).setUsage(THREE.DynamicDrawUsage);
    this.info = new THREE.InstancedBufferAttribute(new Float32Array(4 * n), 4).setUsage(THREE.DynamicDrawUsage);
    this.tints = new THREE.InstancedBufferAttribute(new Float32Array(4 * n), 4).setUsage(THREE.DynamicDrawUsage);
    this.ups = new THREE.InstancedBufferAttribute(new Float32Array(3 * n), 3).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('aAt', this.at);
    g.setAttribute('aUp', this.ups);
    g.setAttribute('aInfo', this.info);
    g.setAttribute('aTint', this.tints);
    g.instanceCount = 0;
    const col = (p: (typeof PIGMENTS)[keyof typeof PIGMENTS]) => ({ value: linearVec(p) });
    this.mesh = new THREE.Mesh(g, inkMaterial(style, {
      uniforms: { uPInk: col(PIGMENTS.ironGall), uPSmoke: col(PIGMENTS.umber), uPFlame: col(PIGMENTS.vermilion), uPCore: col(PIGMENTS.ochre), uPSpray: col(PIGMENTS.leadWhite) },
      vertexShader: PLUME_VERT, fragmentShader: PLUME_FRAG, veil: true, side: THREE.DoubleSide,
    }));
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 3;
  }

  get triangles(): number {
    return 2 * this.geo.instanceCount;
  }

  live(kind: number, clock: number): number {
    return this.puffs.filter((q) => q && q.kind === kind && clock >= q.born && clock - q.born < q.life).length;
  }

  spawn(kind: number, p: THREE.Vector3, v: THREE.Vector3, life: number, s0: number, s1: number, grav: number, clock: number, seed: number, tint: THREE.Vector4 | null = null): void {
    const mark = kind >= RING, i = mark ? this.capacity + this.nextMark : this.next;
    const q = this.puffs[i] ?? (this.puffs[i] = { p: new THREE.Vector3(), v: new THREE.Vector3(), born: 0, life: 0, s0: 0, s1: 0, grav: 0, kind: 0, seed: 0, tint: new THREE.Vector4() });
    q.p.copy(p); q.v.copy(v); q.born = clock; q.life = life; q.s0 = s0; q.s1 = s1; q.grav = grav; q.kind = kind; q.seed = seed;
    if (tint) q.tint.copy(tint); else q.tint.set(0, 0, 0, 0);
    if (mark) this.nextMark = (this.nextMark + 1) % this.marks;
    else this.next = (this.next + 1) % this.capacity;
  }

  update(clock: number, swell: Pick<Swell, 'sample'> | null = null): void {
    const at = this.at.array as Float32Array, info = this.info.array as Float32Array, tints = this.tints.array as Float32Array, ups = this.ups.array as Float32Array, p = T.a, g = T.b, sf = this.surface;
    let n = 0;
    for (const q of this.puffs) {
      if (!q) continue;
      const t = clock - q.born, age = t / q.life;
      if (age < 0 || age >= 1) continue;
      p.copy(q.p).addScaledVector(q.v, t);
      if (q.grav) p.addScaledVector(g.copy(q.p).normalize(), -0.5 * q.grav * t * t);
      if (q.kind >= RING && swell) {
        swell.sample(p.normalize(), clock, sf);
        p.multiplyScalar(R + sf.height + (q.kind === FLOTSAM ? 0.1 : 0.06));
        ups.set([sf.normal.x, sf.normal.y, sf.normal.z], 3 * n);
      } else {
        g.copy(p).normalize();
        ups.set([g.x, g.y, g.z], 3 * n);
      }
      at.set([p.x, p.y, p.z, q.s0 + (q.s1 - q.s0) * Math.sqrt(age)], 4 * n);
      info.set([q.kind, age, q.seed, q.kind === SMOKE ? smoothstep(0, 0.12, age) : 1], 4 * n);
      tints.set([q.tint.x, q.tint.y, q.tint.z, q.tint.w], 4 * n);
      n++;
    }
    this.geo.instanceCount = n;
    this.at.needsUpdate = this.info.needsUpdate = this.tints.needsUpdate = this.ups.needsUpdate = n > 0;
  }

  dispose(): void {
    this.geo.dispose();
    (this.mesh.material as THREE.Material).dispose();
  }
}

const PLUME_VERT =  `
attribute vec4 aAt;
attribute vec4 aInfo;
attribute vec4 aTint;
attribute vec3 aUp;
varying vec2 vUv;
varying vec4 vInfo;
varying vec4 vTint;
void main() {
  vUv = position.xy;
  vInfo = aInfo;
  vTint = aTint;
  if (aInfo.x > 2.5) {
    vec3 n = normalize(aUp), t1 = normalize(cross(n, abs(n.y) < 0.9 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0))), t2 = cross(n, t1);
    float ang = aInfo.z * 6.2832, r = fract(aInfo.z * 7.31);
    bool flot = aInfo.x > 4.5 && aInfo.x < 5.5;
    vec2 q = position.xy * (flot && aTint.w < 1.5 && r > 0.3 ? vec2(1.0, 0.14 + 0.2 * r) : flot && aTint.w > 1.5 ? vec2(1.0, 0.7) : flot ? vec2(0.32) : vec2(1.0));
    q = vec2(cos(ang) * q.x - sin(ang) * q.y, sin(ang) * q.x + cos(ang) * q.y) * aAt.w;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(aAt.xyz + t1 * q.x + t2 * q.y, 1.0);
  } else {
    vec4 mv = modelViewMatrix * vec4(aAt.xyz, 1.0);
    mv.xy += position.xy * aAt.w * vec2(1.0, abs(aInfo.x - 1.0) < 0.5 ? 1.7 : 1.0);
    gl_Position = projectionMatrix * mv;
  }
}`;

const PLUME_FRAG =  `
uniform vec3 uPInk, uPSmoke, uPFlame, uPCore, uPSpray;
varying vec2 vUv;
varying vec4 vInfo;
varying vec4 vTint;
float plumeHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float plumeNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(plumeHash(i), plumeHash(i + vec2(1.0, 0.0)), f.x), mix(plumeHash(i + vec2(0.0, 1.0)), plumeHash(i + vec2(1.0, 1.0)), f.x), f.y);
}
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
    vec2 dv = uv / max(length(uv), 1e-3);
    d += 0.14 * (plumeNoise(uv * 2.6 + seed * 11.0) - 0.5);
    if (d > 0.02) discard;
    float body = 1.0 - smoothstep(-0.38, 0.0, d);
    float rim = (1.0 - smoothstep(0.0, 0.022, abs(d + 0.03))) * smoothstep(0.5, 0.62, plumeNoise(dv * 2.2 + seed * 23.0 + age)) * (1.0 - 0.8 * age);
    float shade = smoothstep(-0.2, 0.6, dot(uv, vec2(0.6, -0.8)));
    float hatch = step(0.75, fract((gl_FragCoord.x - gl_FragCoord.y) * 0.16)) * shade * body;
    col = mix(mix(uPSmoke, uPInk, 0.2 + 0.3 * shade), uPInk, max(rim, hatch * 0.5));
    a = fade * pow(1.0 - age, 1.3) * max(rim * 0.55, body * (0.2 + 0.12 * hatch));
  } else if (kind < 1.5) {
    float y = uv.y * 0.5 + 0.5, w = 0.75 * pow(1.0 - y, 0.7) * (1.0 - 0.4 * age);
    float d = abs(uv.x + 0.18 * y * sin(9.0 * y + seed * 40.0 + age * 12.0)) - w;
    if (d > 0.06 || y < 0.04) discard;
    float rim = 1.0 - smoothstep(0.0, 0.06, abs(d + 0.03));
    col = mix(mix(uPCore, uPFlame, smoothstep(0.1, 0.55, y + abs(uv.x))), uPInk, rim * 0.8);
    a = (1.0 - age * age) * max(rim, step(d, 0.0) * 0.85);
  } else if (kind > 2.5) {
    float r = length(uv), th = atan(uv.y, uv.x);
    if (kind < 3.5) {
      float lasting = step(2.5, vTint.w), fw = max(fwidth(r), 1e-5);
      vec2 dv = uv / max(r, 1e-3);
      vec3 pig = vTint.w > 0.5 ? vTint.xyz : uPInk;
      float rr = 0.8 + 0.05 * sin(th * 3.0 + seed * 31.0) + 0.025 * sin(th * 7.0 - seed * 17.0) + 0.012 * sin(th * 13.0 + seed * 5.0);
      if (abs(r - rr) > 0.1 && abs(r - 0.76 * rr) > 0.1) discard;
      float line = 0.0, bleed = 0.0, lip = 0.0;
      for (int k = 0; k < 2; k++) {
        float rk = rr * (k == 0 ? 1.0 : 0.74 + 0.03 * sin(th * 2.0 + seed * 9.0)), wk = fw * uRenderPx * (k == 0 ? 0.55 : 0.4) * (1.0 + 0.5 * (1.0 - age) * (1.0 - lasting));
        float dk = r - rk;
        float on = smoothstep(0.34 + 0.18 * age * (1.0 - lasting) + 0.08 * float(k), 0.46 + 0.18 * age * (1.0 - lasting) + 0.08 * float(k), plumeNoise(dv * 2.4 + seed * 17.0 + float(k) * 5.3));
        float lk = (1.0 - smoothstep(wk, wk + fw * 1.2, abs(dk))) * on * (k == 0 ? 1.0 : 0.6 * (1.0 - age));
        line = max(line, lk);
        lip = max(lip, (1.0 - smoothstep(0.008, 0.022, abs(dk - wk - 0.025))) * on * (k == 0 ? 1.0 : 0.7 * (1.0 - age)) * (0.6 + 0.4 * plumeNoise(dv * 9.0 + seed * 3.0)));
        bleed = max(bleed, (1.0 - smoothstep(0.0, 0.045, -dk)) * step(dk, 0.0) * on * (k == 0 ? 1.0 : 1.0 - age) * (0.75 + 0.25 * plumeHash(floor(gl_FragCoord.xy * 0.5))));
      }
      if (line + bleed + lip < 0.003) discard;
      col = line > 0.05 ? uPInk * 0.7 : lip > 2.0 * bleed ? uPSpray : pig;
      a = (lasting > 0.5 ? 0.55 * (1.0 - smoothstep(0.8, 1.0, age)) : pow(1.0 - age, 1.1) * smoothstep(0.0, 0.06, age)) * max(max(line * 0.8, lip * 0.5), bleed * 0.14);
    } else if (kind > 5.5) {
      float edge = 0.7 + 0.32 * (plumeNoise(uv / max(r, 1e-3) * 1.6 + seed * 19.0) - 0.5) + 0.04 * sin(th * 9.0 - seed * 7.0);
      float d = r - edge * (0.85 + 0.15 * age);
      if (d > 0.04) discard;
      float hv = 0.6 * plumeNoise(uv * 3.6 + seed * 9.0) + 0.4 * plumeNoise(uv * 9.0 - seed * 4.0) + 0.25 * r + 0.35 * age - 0.1;
      float holes = smoothstep(0.4, 0.58, hv), fh = max(fwidth(hv), 1e-4);
      float rim = (1.0 - smoothstep(0.0, 0.025, abs(d + 0.015))) * smoothstep(0.42, 0.55, plumeNoise(uv / max(r, 1e-3) * 2.4 + seed * 5.0));
      float body = 1.0 - smoothstep(-0.35, 0.0, d), net = (1.0 - smoothstep(0.6, 1.6, abs(hv - 0.49) / fh / uRenderPx)) * body * step(0.4, plumeNoise(uv * 5.0 + seed * 2.0));
      col = mix(uPSpray, uPInk, max(rim, 0.8 * net));
      a = (1.0 - age * age) * max(max(rim * 0.7, net * 0.45), body * (1.0 - holes) * (0.78 - 0.3 * r));
    } else if (kind < 4.5) {
      float edge = 0.78 + 0.1 * sin(th * 3.0 + seed * 23.0) + 0.06 * sin(th * 7.0 + seed * 11.0);
      float br = plumeNoise(uv * 2.8 + seed * 13.0);
      if (r > edge || br < 0.3) discard;
      float gran = plumeHash(floor(gl_FragCoord.xy * 0.5));
      col = mix(uPSmoke, uPInk, 0.35);
      a = 0.13 * (1.0 - smoothstep(edge - 0.35, edge, r)) * smoothstep(0.3, 0.55, br) * (0.75 + 0.25 * gran) * (1.0 - age * age);
    } else {
      float chest = step(1.5, vTint.w), cask = step(fract(seed * 7.31), 0.3) * (1.0 - chest);
      float rag = (1.0 - chest) * 0.16 * plumeNoise(vec2(uv.y * 7.0 + sign(uv.x) * 3.0, seed * 37.0));
      vec2 bq = abs(uv) - vec2(0.8 - rag - 0.08, 0.72);
      float d = mix(length(max(bq, 0.0)) + min(max(bq.x, bq.y), 0.0) - 0.08, r - 0.74, cask);
      if (d > 0.18) discard;
      float wash = plumeNoise(uv * 2.2 + seed * 29.0), lace = step(0.45, plumeNoise(uv * 9.0 + seed * 3.0));
      float rim = 1.0 - smoothstep(0.0, 0.045, abs(d + 0.03)), hatch = step(0.55, fract((gl_FragCoord.x + gl_FragCoord.y) * 0.18));
      float ey = mix(-0.42, -0.28, chest), sideF = (1.0 - cask) * smoothstep(ey + 0.02, ey - 0.02, uv.y) * step(d, 0.0);
      float edgeL = (1.0 - cask) * (1.0 - smoothstep(0.02, 0.05, abs(uv.y - ey))) * step(d, 0.0);
      float bands = chest * (1.0 - smoothstep(0.06, 0.1, min(abs(uv.x - 0.4), abs(uv.x + 0.4))));
      float clasp = chest * sideF * (1.0 - smoothstep(0.08, 0.12, max(abs(uv.x), abs(uv.y + 0.55))));
      float awash = (1.0 - chest) * smoothstep(0.55, 0.7, wash);
      float foam = step(0.0, d) * (1.0 - smoothstep(0.04, 0.16, d)) * lace;
      vec3 body = mix(mix(uPSmoke, uPCore, 0.3) * 0.7, mix(vTint.xyz * 0.55, uPInk, 0.15), chest) * (1.0 - 0.4 * sideF);
      vec3 leaf = mix(uPCore, vec3(1.0, 0.86, 0.45), 0.5 + 0.5 * step(0.5, plumeNoise(uv * 6.0 + seed)));
      col = d > 0.0 ? uPSpray : mix(mix(body, leaf, max(bands, clasp) * (1.0 - 0.3 * sideF)), uPInk, max(0.8 * max(rim, edgeL), 0.45 * hatch * max(1.0 - chest, sideF)));
      a = (1.0 - smoothstep(0.85, 1.0, age)) * (d > 0.0 ? 0.7 * foam : max(rim * (1.0 - 0.6 * awash), 0.85 * (1.0 - 0.65 * awash)));
    }
  } else {
    vec2 g = uv * 3.4 + seed * 17.0, cell = floor(g);
    vec2 f = fract(g) - 0.5 - 0.6 * (vec2(plumeHash(cell + 1.7), plumeHash(cell + 4.3)) - 0.5);
    float r = plumeHash(cell), d = length(f) - 0.06 - 0.12 * r;
    if (r < 0.25 + 0.6 * length(uv) || d > 0.04 || length(uv) > 1.0) discard;
    col = mix(uPSpray, uPInk, 0.7 * (1.0 - smoothstep(0.0, 0.04, abs(d + 0.02))));
    a = (1.0 - age) * (0.85 - 0.25 * r) * (1.0 - smoothstep(0.55, 1.0, length(uv)));
  }
  writeVeil(col, a);
}`;

export const fleets = new WeakMap<THREE.Object3D, Fleet>();

export class Fleet implements RenderModule {
  readonly views: (ShipView | null)[] = [];
  readonly plumes: Plumes;
  readonly group = new THREE.Group();
  triangles = 0;
  private waters: Waters | null = null;
  private seed = -1;
  private tick = -1;
  private readonly wind: Wind = newWind();
  private readonly sky = newSky();
  private readonly hits = new Uint8Array(SHIPS);
  private readonly shotAt: (THREE.Vector3 | null)[] = new Array(SHIPS).fill(null);
  private readonly shotPts = Array.from({ length: SHIPS }, () => new THREE.Vector3());
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
    this.shotAt.fill(null);
    if (st.tick !== this.tick) {
      this.tick = st.tick;
      for (const e of st.events) if (e.kind === EVENT.hit || e.kind === EVENT.ram || e.kind === EVENT.struck) {
        this.hits[e.ship] = 1;
        if (e.kind === EVENT.hit) this.shotAt[e.ship] = this.shotPts[e.ship].set(e.at.x, e.at.y, e.at.z);
      }
    }
    shown.length = 0;
    st.ships.forEach((s, i) => {
      let v = this.views[i];
      const down = !afloat(s);
      if (down && !v?.ship.visible) return;
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
      const shot = this.shotAt[i];
      if (shot) v.struckAt(shot);
      if (!down) sea.wakes.feed(i, v.ship.position, v.forward, s.speed, f.clock, v.length, v.beam);
      else sea.wakes.stop(i, f.clock);
      v.exhale(this.plumes, s, c, f.dt, f.clock);
      if (v.gone) { v.ship.visible = false; sea.wakes.forget(i); v.lit?.remove(v.lamp); v.lit = null; return; }
      shown.push(v.ship);
    });
    this.plumes.update(f.clock, sea.swell);
    const lods = fleetLods(shown, this.ctx.camera, this.ctx.pipeline.renderer.domElement.clientHeight || 440, f.dt);
    let dressed = 0;
    for (const v of this.views) if (v?.ship.visible) dressed += v.outfit.extra(v.ship.lod);
    this.triangles = lods + this.plumes.triangles + dressed;
  }

  dispose(): void {
    for (const v of this.views) {
      if (!v) continue;
      v.lit?.remove(v.lamp);
      v.outfit.dispose();
      v.ship.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) { m.geometry.dispose(); (m.material as THREE.Material).dispose(); } });
    }
    this.plumes.dispose();
    this.ctx.scene.remove(this.group);
    fleets.delete(this.ctx.scene);
  }
}

export const createShips = (ctx: RenderContext): RenderModule => new Fleet(ctx);

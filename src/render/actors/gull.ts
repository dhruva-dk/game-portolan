// Gulls, ported from the rewrite's gull and drawn as one instanced flock: the wings are hinged at the shoulder and the
// wrist in the shader, so every bird flaps on its own beat in a single draw call. Small flocks wheel over the ships
// nearest the camera; a delivery gull flies in from far off with a parcel, drops it on the ship's deck, and goes.
import * as THREE from 'three';
import { GPU, TAU, patch, rand, seaRadius, smooth, tangents } from './common.ts';
import { gullNodeMaterial } from './tsl/fauna.ts';
import { RARITY_GLOW, type Effects } from './effects.ts';
import { C, Mesher } from './mesher.ts';
import { SPRITE } from './particles.ts';
import type { Juice, Rarity } from './view.ts';

/** What the gulls need to know of a ship. */
export interface ShipRef { pos: THREE.Vector3; fwd: THREE.Vector3; speed: number; alive: boolean }

const CAP = 64;

/** The rewrite's gull, nose along +z, one unit about 1 m at scale 1. Wing vertices carry their side and joint. */
function gullGeometry(): THREE.BufferGeometry {
  const white = C(0xf4f2ec), grey = C(0xb9c0c8), dark = C(0x2a2c30), beak = C(0xf2c230);
  const b = new Mesher();
  const ring = (z: number, y: number, rx: number, ry: number, col = white, up?: THREE.Color) => ({ c: new THREE.Vector3(0, y, z), rx, ry, col, up });
  b.loft([ring(-0.75, 0.05, 0.02, 0.02), ring(-0.6, 0.04, 0.12, 0.06, white, grey), ring(-0.3, 0, 0.2, 0.17, white, grey), ring(0, 0, 0.24, 0.22, white, grey), ring(0.28, 0.04, 0.2, 0.2), ring(0.42, 0.14, 0.15, 0.16), ring(0.56, 0.2, 0.13, 0.13), ring(0.66, 0.2, 0.08, 0.08)], 10);
  b.loft([ring(0.66, 0.19, 0.045, 0.04, beak), ring(0.8, 0.17, 0.03, 0.028, beak), ring(0.86, 0.15, 0.012, 0.016, C(0xd84020))], 6);
  for (const s of [-1, 1]) {
    const e = (z: number, r: number) => ({ c: new THREE.Vector3(s * 0.105, 0.25, z), rx: r, ry: r, col: C(0x111111) });
    b.loft([e(0.555, 0.001), e(0.57, 0.026), e(0.6, 0.026), e(0.615, 0.001)], 6);
  }
  b.blade([[0, -0.55], [-0.14, -0.85], [0, -0.9], [0.14, -0.85]], 0.01, () => white, new THREE.Matrix4());
  const wingColor = (x: number, z: number) => (Math.abs(x) > 0.55 && z < 0.05 ? dark : z < -0.12 ? C(0xa8b0b8) : grey);
  for (const s of [-1, 1] as const) {
    b.part = s;
    b.blade([[0, 0.12], [s * 0.62, 0.1], [s * 0.62, -0.18], [0, -0.22]], 0.012, (x, z) => wingColor(x, z), new THREE.Matrix4().makeTranslation(s * 0.14, 0.1, 0.05));
    b.part = s * 2;
    b.blade([[0, 0.1], [s * 0.5, 0.02], [s * 0.78, -0.08], [s * 0.4, -0.2], [0, -0.18]], 0.01,
      (x, z) => (Math.abs(x) > 0.25 ? (Math.abs(x) > 0.6 && z > -0.08 && z < -0.02 ? white : dark) : wingColor(x + s * 0.6, z)), new THREE.Matrix4().makeTranslation(s * 0.74, 0.1, 0.05));
  }
  b.part = 0;
  return b.build();
}

const FLAP = /* glsl */ `
float gSide = sign(aPart), gJoint = abs(aPart);
float gArm = sin(aFlap.x) * aFlap.y, gHand = sin(aFlap.x - 0.8) * aFlap.y * 0.8;
vec3 gP = position, gN = normal;
if (gJoint > 1.5) {
  float a = gSide * gHand, c = cos(a), s = sin(a);
  vec2 o = vec2(gSide * 0.74, 0.1), q = gP.xy - o;
  gP.xy = o + vec2(c * q.x - s * q.y, s * q.x + c * q.y);
  gN.xy = vec2(c * gN.x - s * gN.y, s * gN.x + c * gN.y);
}
if (gJoint > 0.5) {
  float a = gSide * gArm, c = cos(a), s = sin(a);
  vec2 o = vec2(gSide * 0.14, 0.1), q = gP.xy - o;
  gP.xy = o + vec2(c * q.x - s * q.y, s * q.x + c * q.y);
  gN.xy = vec2(c * gN.x - s * gN.y, s * gN.x + c * gN.y);
}
vec3 objectNormal = gN;
#ifdef USE_TANGENT
vec3 objectTangent = vec3(tangent.xyz);
#endif`;

interface Bird { pos: THREE.Vector3; fwd: THREE.Vector3; climb: number; bank: number; scale: number; phase: number; amp: number }

interface Flockmate { r: number; alt: number; ang: number; dir: number; w: number; seed: number; phase: number; flap: number }
interface Flock { ship: number; centre: THREE.Vector3; mates: Flockmate[]; here: number; want: number }

interface Delivery {
  ship: number; rarity: Rarity; pos: THREE.Vector3; vel: THREE.Vector3; t: number; phase: number;
  state: 'in' | 'out'; drop: number; rel0: THREE.Vector3; parcel: THREE.Mesh; flap: number; landed: boolean;
}

export class Gulls {
  readonly group = new THREE.Group();
  private readonly mesh: THREE.InstancedMesh;
  private readonly flap: THREE.InstancedBufferAttribute;
  private readonly fx: Effects;
  private readonly flocks = new Map<number, Flock>();
  private readonly deliveries: Delivery[] = [];
  private readonly parcels: THREE.Mesh[] = [];
  private readonly parcelGeo: THREE.BufferGeometry;
  private readonly m = new THREE.Matrix4();
  private readonly r = new THREE.Matrix4();
  private readonly up = new THREE.Vector3();
  private readonly a = new THREE.Vector3();
  private readonly b = new THREE.Vector3();
  private readonly f = new THREE.Vector3();
  private readonly x = new THREE.Vector3();
  private birds: Bird[] = [];
  /** How many ships nearest the camera keep a flock, and how far off they may be. */
  flocksNear = 3;
  flockRange = 240;

  constructor(fx: Effects) {
    this.fx = fx;
    const geo = gullGeometry();
    this.flap = new THREE.InstancedBufferAttribute(new Float32Array(CAP * 2), 2).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('aFlap', this.flap);
    const mat = GPU.on ? gullNodeMaterial({ vertexColors: true, roughness: 0.75 }) : patch(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75 }), 'actor-gull', (s) => {
      s.vertexShader = s.vertexShader
        .replace('#include <common>', '#include <common>\nattribute float aPart;\nattribute vec2 aFlap;')
        .replace('#include <beginnormal_vertex>', FLAP)
        .replace('#include <begin_vertex>', 'vec3 transformed = gP;');
    });
    this.mesh = new THREE.InstancedMesh(geo, mat, CAP);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = true;
    this.group.add(this.mesh);
    // the parcel: a bundle of kelp tied round something bright
    this.parcelGeo = new THREE.IcosahedronGeometry(0.75, 1);
  }

  /** A gull flies a parcel in to ship `ship`, from far off beyond it as the camera sees it. */
  deliver(ship: number, rarity: Rarity, ref: ShipRef | null, eye: THREE.Vector3): void {
    if (!ref) return;
    const up = this.up.copy(ref.pos).normalize();
    // away from the eye across the water, swung a little to one side
    const away = this.f.copy(ref.pos).sub(eye);
    away.addScaledVector(up, -away.dot(up));
    if (away.lengthSq() < 1) tangents(up, away, this.x);
    away.normalize();
    const ang = rand(0.25, 0.75) * (Math.random() < 0.5 ? -1 : 1);
    this.x.crossVectors(up, away);
    const out = away.multiplyScalar(Math.cos(ang)).addScaledVector(this.x, Math.sin(ang)).normalize().clone();
    const pos = ref.pos.clone().addScaledVector(out, 210).normalize().multiplyScalar(seaRadius(ref.pos) + 48);
    const parcel = this.parcels.pop() ?? new THREE.Mesh(this.parcelGeo, patch(new THREE.MeshStandardMaterial({ color: 0x4b6b3a, roughness: 0.9, emissive: 0xffffff, emissiveIntensity: 0.9 }), 'actor-parcel'));
    (parcel.material as THREE.MeshStandardMaterial).emissive.copy(RARITY_GLOW[rarity]).multiplyScalar(0.8);
    parcel.visible = true;
    parcel.position.copy(pos);
    this.group.add(parcel);
    this.deliveries.push({ ship, rarity, pos, vel: out.multiplyScalar(-34), t: 0, phase: rand(0, TAU), state: 'in', drop: -1, rel0: new THREE.Vector3(), parcel, flap: 1, landed: false });
  }

  /** One frame: flocks over the ships nearest `eye`, deliveries in flight. Returns juice for parcels landing on `player`. */
  update(ships: ReadonlyMap<number, ShipRef>, eye: THREE.Vector3, dt: number, t: number, player: number): Juice | null {
    let juice: Juice | null = null;
    this.birds = [];
    // which ships keep a flock
    const near = [...ships].filter(([, s]) => s.alive && s.pos.distanceTo(eye) < this.flockRange)
      .sort((p, q) => p[1].pos.distanceToSquared(eye) - q[1].pos.distanceToSquared(eye)).slice(0, this.flocksNear);
    const keep = new Set(near.map(([id]) => id));
    for (const [id] of near) if (!this.flocks.has(id)) this.flocks.set(id, this.newFlock(id, ships.get(id)!));
    for (const [id, fl] of this.flocks) {
      fl.want = keep.has(id) ? 1 : 0;
      fl.here += (fl.want - fl.here) * Math.min(1, dt * 0.8);
      if (fl.want === 0 && fl.here < 0.02) { this.flocks.delete(id); continue; }
      const s = ships.get(id);
      if (s) fl.centre.lerp(this.f.copy(s.pos).addScaledVector(s.fwd, s.speed * 1.2), Math.min(1, dt * 1.5));
      this.flock(fl, dt, t);
    }
    // deliveries
    const gup = new THREE.Vector3(), sup = new THREE.Vector3();
    for (let i = this.deliveries.length - 1; i >= 0; i--) {
      const d = this.deliveries[i], s = ships.get(d.ship), pc = d.parcel, c = RARITY_GLOW[d.rarity];
      d.t += dt;
      gup.copy(d.pos).normalize();
      if (d.state === 'in') {
        // home on a point over the deck, leading the ship a little; flap hard far out, glide down the last stretch
        const target = s ? this.x.copy(s.pos).addScaledVector(s.fwd, s.speed * 0.6).normalize().multiplyScalar(s.pos.length() + 15) : this.x.copy(d.pos);
        const to = this.f.copy(target).sub(d.pos), dist = to.length();
        d.vel.lerp(to.normalize().multiplyScalar(18 + Math.min(1, dist / 80) * 20), Math.min(1, dt * 2.2));
        d.flap = dist > 90 ? 1 : 0.15;
        pc.position.copy(d.pos).addScaledVector(gup, -1.0);
        if (!s || !s.alive || dist < 4 || d.t > 14) {
          d.state = 'out';
          d.t = 0;
          if (s && s.alive) { d.drop = 0; d.rel0.copy(pc.position).sub(s.pos); } else pc.visible = false;
        }
      } else {
        // climb away, flapping hard, and go
        d.vel.addScaledVector(gup, dt * 7).multiplyScalar(1 + dt * 0.25);
        d.flap = 1;
        if (d.t > 7) { this.deliveries.splice(i, 1); this.parcels.push(pc); this.group.remove(pc); continue; }
      }
      d.pos.addScaledVector(d.vel, dt);
      // the parcel falls to the deck, tumbling, and bursts open in its rarity's light
      if (d.drop >= 0 && !d.landed) {
        if (!s) { pc.visible = false; d.landed = true; } else {
          d.drop += dt;
          const k = Math.min(1, d.drop / 0.85);
          sup.copy(s.pos).normalize();
          pc.position.copy(s.pos).add(this.f.copy(d.rel0).lerp(this.x.copy(sup).multiplyScalar(3.2), k * k));
          pc.rotation.set(d.drop * 5, d.drop * 3, 0);
          if (k >= 1) {
            d.landed = true;
            pc.visible = false;
            const p = pc.position;
            this.fx.sparkle(p, c, 26 + d.rarity * 8, 2.5);
            this.fx.glow.emit({ x: p.x, y: p.y, z: p.z, life: 0.35, size: 5 + d.rarity, grow: 1.8, r: c.r * 3, g: c.g * 3, b: c.b * 3, frame: SPRITE.puff, fadeIn: 0 });
            this.fx.glow.emit({ x: p.x, y: p.y, z: p.z, life: 0.6, size: 2, grow: 5, r: c.r * 2.5, g: c.g * 2.5, b: c.b * 2.5, frame: SPRITE.ring, mode: 2, fadeIn: 0 });
            if (d.ship === player) juice = { shake: 0.06, haptic: 'light' };
          }
        }
      }
      if (pc.visible) this.fx.light(pc.position, 2.3, c, 1.5);
      // the bird
      const fwd = this.f.copy(d.vel), vr = fwd.dot(gup);
      fwd.addScaledVector(gup, -vr);
      const hs = fwd.length();
      d.phase += dt * (d.flap > 0.5 ? 10 : 1.4);
      this.birds.push({ pos: d.pos, fwd: fwd.clone(), climb: Math.atan2(vr, Math.max(1, hs)) * 0.7, bank: 0, scale: 2.4, phase: d.phase, amp: 0.08 + d.flap * 0.6 });
    }
    // draw
    const F = this.flap.array as Float32Array;
    let n = 0;
    for (const bd of this.birds) {
      if (n >= CAP) break;
      this.up.copy(bd.pos).normalize();
      const fwd = this.f.copy(bd.fwd).addScaledVector(this.up, -bd.fwd.dot(this.up));
      if (fwd.lengthSq() < 1e-6) tangents(this.up, fwd, this.x);
      fwd.normalize();
      this.x.crossVectors(this.up, fwd);
      this.m.makeBasis(this.x, this.up, fwd).setPosition(bd.pos);
      this.m.multiply(this.r.makeRotationZ(bd.bank)).multiply(this.r.makeRotationX(-bd.climb)).multiply(this.r.makeScale(bd.scale, bd.scale, bd.scale));
      this.mesh.setMatrixAt(n, this.m);
      F[n * 2] = bd.phase; F[n * 2 + 1] = bd.amp;
      n++;
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.flap.needsUpdate = true;
    return juice;
  }

  private newFlock(id: number, s: ShipRef): Flock {
    const n = 4 + (id % 3), dir = Math.random() < 0.5 ? 1 : -1, mates: Flockmate[] = [];
    for (let i = 0; i < n; i++) {
      const r = rand(9, 24), v = rand(8, 12);
      mates.push({ r, alt: rand(14, 30), ang: rand(0, TAU), dir: Math.random() < 0.85 ? dir : -dir, w: v / r, seed: rand(0, 100), phase: rand(0, TAU), flap: 0 });
    }
    return { ship: id, centre: s.pos.clone(), mates, here: 0, want: 1 };
  }

  private flock(fl: Flock, dt: number, t: number): void {
    const up = this.up.copy(fl.centre).normalize();
    tangents(up, this.a, this.b);
    const base = seaRadius(fl.centre);
    for (const g of fl.mates) {
      g.ang += g.w * g.dir * dt;
      // a few wingbeats now and then, gliding between
      const want = smooth(0.55, 0.8, Math.sin(t * 0.35 + g.seed) * 0.5 + 0.5 + Math.sin(t * 1.3 + g.seed * 3) * 0.15);
      g.flap += (want - g.flap) * Math.min(1, dt * 3);
      g.phase += dt * (1.3 + g.flap * 8.5);
      // birds wheel in at the start and out at the end of a flock's life
      const r = g.r * (1.6 - fl.here * 0.6), alt = g.alt + Math.sin(t * 0.5 + g.seed) * 3 + (1 - fl.here) * 25;
      const ca = Math.cos(g.ang), sa = Math.sin(g.ang);
      const pos = new THREE.Vector3().copy(up).multiplyScalar(base + alt).addScaledVector(this.a, ca * r).addScaledVector(this.b, sa * r);
      const fwd = new THREE.Vector3().copy(this.a).multiplyScalar(-sa * g.dir).addScaledVector(this.b, ca * g.dir);
      const bank = -g.dir * Math.atan((g.w * g.w * r) / 9.81) * 1.2;
      this.birds.push({ pos, fwd, climb: Math.cos(t * 0.5 + g.seed) * 0.1, bank, scale: 1.8 * Math.min(1, fl.here * 1.5), phase: g.phase, amp: 0.08 + g.flap * 0.55 });
    }
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
    this.parcelGeo.dispose();
  }
}

// The one-shot effects, ported from the rewrite's fx and laid on the sphere: muzzle flashes, splashes, splinters and
// sparks on a hull, dust off land, fireballs, the gust's spray, sparkles, smoke from the wounded, flotsam from the
// sunk and the wisp of a lost ship's lantern rising free. Every direction is worked out in the local frame (up away
// from the planet's centre), so nothing here assumes a flat sea.
import * as THREE from 'three';
import { AU, TAU, onSea, rand, tangents } from './common.ts';
import { makeParticles, SPRITE, type Particles } from './particles.ts';
import { Ribbons } from './ribbons.ts';
import { Debris } from './debris.ts';
import { Lights } from './lights.ts';
import { RIPPLES } from '../ocean/ripples.ts';
import type { Weapon } from './view.ts';
import { heat } from '../gpu/haze.ts';

export const RARITY_GLOW = [0xc9d1da, 0x55e05a, 0x3aa0ff, 0xb85cff, 0xffa21f].map((h) => new THREE.Color(h));

/** A local frame at a point: up, and two tangents across the water. */
class Local {
  readonly up = new THREE.Vector3();
  readonly a = new THREE.Vector3();
  readonly b = new THREE.Vector3();
  private readonly v = new THREE.Vector3();
  at(p: THREE.Vector3): this {
    this.up.copy(p).normalize();
    tangents(this.up, this.a, this.b);
    return this;
  }
  /** A vector out across the water at angle `ang`, `out` long, plus `lift` up. */
  vec(ang: number, out: number, lift: number): THREE.Vector3 {
    return this.v.copy(this.a).multiplyScalar(Math.cos(ang) * out).addScaledVector(this.b, Math.sin(ang) * out).addScaledVector(this.up, lift);
  }
}

interface Wisp { p: THREE.Vector3; c: THREE.Color; t: number }

const GRAV = 16;

export class Effects {
  readonly group = new THREE.Group();
  readonly glow: Particles;
  readonly smoke: Particles;
  /** The smoke shots draw behind them, and the heat they shed, as unbroken ribbons. */
  readonly trails: Ribbons;
  readonly heatTrails: Ribbons;
  private readonly L = new Local();
  private readonly L2 = new Local();
  /** Wreckage afloat: what shot knocks out of hulls and what the sunk leave behind. */
  readonly debris: Debris;
  /** The light the fight throws: lanterns, fires, gun flashes, hits and bursts (clustered point lights). */
  readonly lights = new Lights();
  private readonly wisps: Wisp[] = [];
  private readonly p = new THREE.Vector3();
  private flick = 0;

  constructor(wood: THREE.Texture) {
    const { glow, smoke } = makeParticles();
    this.glow = glow;
    this.smoke = smoke;
    this.trails = new Ribbons(72, 64, false, AU.uNoise.value!);
    this.heatTrails = new Ribbons(32, 24, true, AU.uNoise.value!);
    this.group.add(smoke.mesh, glow.mesh, this.trails.mesh, this.heatTrails.mesh);
    this.debris = new Debris(wood);
    this.debris.onSplash = (at, big) => this.plop(at, big);
    this.group.add(this.debris.group, this.lights.group);
  }

  /** Drops everything still in the air or afloat, for a new match. */
  clear(): void {
    this.glow.clear();
    this.smoke.clear();
    this.trails.clear();
    this.heatTrails.clear();
    this.debris.clear();
    this.lights.clear();
    RIPPLES.clear();
    this.wisps.length = 0;
  }

  /** Emits at a point plus an offset in the local frame. */
  private at(base: THREE.Vector3, off: THREE.Vector3): THREE.Vector3 {
    return this.p.copy(base).add(off);
  }

  // ---------------------------------------------------------------- firing

  muzzle(kind: Weapon, pos: THREE.Vector3, dir: THREE.Vector3, scale = 1): void {
    const big = kind === 'mortar' ? 1.8 : kind === 'harpoon' ? 1.2 : kind === 'repeater' ? 0.45 : kind === 'scatter' ? 1.3 : kind === 'broadside' ? 1.1 : kind === 'chain' ? 1.15 : kind === 'heated' ? 1.05 : 1;
    const s = big * scale, { x, y, z } = pos, L = this.L.at(pos);
    // the flash lights the gun's own smoke, her side and the water under the muzzle
    this.lights.flash(this.p.copy(pos).addScaledVector(dir, 0.8 * s), kind === 'repeater' ? 0xffc070 : 0xffa458, 340 * s * s, 9 + 12 * s, 0.09 + 0.05 * s);
    // the blast's heat bends the air in front of the muzzle for a moment
    heat(this.p.copy(pos).addScaledVector(dir, 1.5 * s), 2.2 * s, 0.9, 0.45);
    this.glow.emit({ x, y, z, life: 0.09, size: 1.6 * s, grow: 1.6, r: 6, g: 3.6, b: 1.4, frame: SPRITE.puff, fadeIn: 0 });
    this.glow.emit({ x: x + dir.x * 1.2 * s, y: y + dir.y * 1.2 * s, z: z + dir.z * 1.2 * s, vx: dir.x * 8, vy: dir.y * 8, vz: dir.z * 8, life: 0.08, size: 0.9 * s, grow: 2, r: 8, g: 4.5, b: 1.5, frame: SPRITE.flame, mode: 1, stretch: 0.25, fadeIn: 0 });
    const sparks = kind === 'repeater' ? 1 : 5;
    for (let i = 0; i < sparks; i++) {
      const sp = rand(15, 35), j = L.vec(rand(0, TAU), rand(0, 0.3), rand(-0.1, 0.4));
      this.glow.emit({ x, y, z, vx: (dir.x + j.x) * sp, vy: (dir.y + j.y) * sp, vz: (dir.z + j.z) * sp, life: rand(0.15, 0.35), size: 0.07 * s, r: 7, g: 4, b: 1.4, frame: SPRITE.spark, mode: 1, stretch: 0.05, grav: 9, drag: 2, fadeIn: 0 });
    }
    const puffs = kind === 'repeater' ? (Math.random() < 0.3 ? 1 : 0) : 3;
    for (let i = 0; i < puffs; i++) {
      const sp = rand(2, 7) * s, j = L.vec(rand(0, TAU), rand(0, 0.5), rand(0.3, 1.2));
      // the first of it is lit from inside by the flash, and burns out as it billows
      this.smoke.emit({ x, y, z, vx: dir.x * sp + j.x, vy: dir.y * sp + j.y, vz: dir.z * sp + j.z, life: rand(1.2, 2.2), size: 0.8 * s, grow: 4, r: 0.85, g: 0.84, b: 0.82, a: 0.45, frame: i === 0 ? SPRITE.blast : SPRITE.billow, heat: 0.9, drag: 1.4, spin: rand(-0.5, 0.5) });
    }
  }

  // ---------------------------------------------------------------- landing

  splash(where: THREE.Vector3, big: number): void {
    const L = this.L.at(where), c = onSea(where, 0.3, new THREE.Vector3());
    // a ring of waves runs out from it across the sea
    RIPPLES.ring(where, Math.min(0.9, 0.12 + big * 0.14), 0.8 + big * 0.55);
    const n = Math.round(10 + big * 22);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU, out = rand(0.5, 3) * (0.6 + big * 0.4), up = rand(5, 13) * (0.5 + big * 0.7);
      const o = this.at(c, L.vec(a, 0.6, 0)), v = L.vec(a, out, up);
      this.smoke.emit({ x: o.x, y: o.y, z: o.z, vx: v.x, vy: v.y, vz: v.z, life: rand(0.9, 1.5), size: rand(0.5, 1.1) * (0.6 + big * 0.6), grow: 2.2, r: 1.25, g: 1.32, b: 1.4, a: 0.8, frame: SPRITE.spray, grav: GRAV, drag: 0.6, float: true });
    }
    for (let i = 0; i < 4 + big * 4; i++) {
      const v = L.vec(Math.random() * TAU, 3, rand(1, 3));
      this.smoke.emit({ x: c.x, y: c.y, z: c.z, vx: v.x, vy: v.y, vz: v.z, life: rand(1.4, 2.4), size: 1.2 + big, grow: 3, r: 1.2, g: 1.25, b: 1.3, a: 0.35, frame: SPRITE.billow, drag: 1.2 });
    }
    const r = onSea(where, 0.1, new THREE.Vector3());
    this.smoke.emit({ x: r.x, y: r.y, z: r.z, life: 1.4, size: 1 + big * 2, grow: 5, r: 1.3, g: 1.35, b: 1.4, a: 0.7, frame: SPRITE.ring, mode: 2, fadeIn: 0 });
  }

  /** Something small (a plank, a cask) dropping into the sea: a few drops thrown up and a ring of foam. */
  plop(where: THREE.Vector3, big: number): void {
    const L = this.L.at(where), c = onSea(where, 0.1, new THREE.Vector3());
    RIPPLES.ring(where, 0.04 + big * 0.12, 0.5 + big * 0.5, 8);
    for (let i = 0; i < 3 + big * 6; i++) {
      const v = L.vec(Math.random() * TAU, rand(0.5, 1.5), rand(2, 4) * (0.6 + big));
      this.smoke.emit({ x: c.x, y: c.y, z: c.z, vx: v.x, vy: v.y, vz: v.z, life: rand(0.5, 0.8), size: rand(0.15, 0.3) * (0.7 + big), grow: 1.8, r: 1.25, g: 1.32, b: 1.4, a: 0.7, frame: SPRITE.spray, grav: GRAV, float: true });
    }
    this.smoke.emit({ x: c.x, y: c.y, z: c.z, life: 0.8, size: 0.25 + big * 0.5, grow: 2.4, r: 1.3, g: 1.35, b: 1.4, a: 0.16, frame: SPRITE.ring, mode: 2, fadeIn: 0 });
  }

  /**
   * Shot striking a hull: splinters, sparks, a flash, and planks of her side knocked out (`out` her side's outward
   * normal, `paint` her hull's colour) to float; crits burst gold.
   */
  hitShip(at: THREE.Vector3, crit: boolean, big: number, out?: THREE.Vector3, paint?: THREE.Color): void {
    const s = 0.7 + big * 0.8, { x, y, z } = at, L = this.L.at(at);
    if (out && paint) this.debris.shatter(at, out, paint, big * (crit ? 1.4 : 1));
    this.lights.flash(at, crit ? 0xffd27a : 0xff9a4a, 160 * s * s, 12 * s, 0.16);
    this.glow.emit({ x, y, z, life: 0.12, size: 2.2 * s, grow: 1.5, r: crit ? 6 : 5, g: crit ? 5 : 2.6, b: crit ? 1.2 : 1, frame: SPRITE.puff, fadeIn: 0 });
    for (let i = 0; i < 9 * s; i++) {
      const v = L.vec(Math.random() * TAU, rand(8, 22), rand(2, 14));
      this.glow.emit({ x, y, z, vx: v.x, vy: v.y, vz: v.z, life: rand(0.25, 0.6), size: 0.07, r: crit ? 7 : 6, g: crit ? 6 : 3, b: crit ? 1.5 : 0.8, frame: SPRITE.spark, mode: 1, stretch: 0.045, grav: 18, drag: 1.5, fadeIn: 0 });
    }
    // splinters too small to keep: dark slivers tumbling out and gone in the water (the planks are debris.ts's)
    for (let i = 0; i < 8 * s; i++) {
      const v = L.vec(Math.random() * TAU, rand(3, 10), rand(3, 9));
      this.smoke.emit({ x, y, z, vx: v.x, vy: v.y, vz: v.z, life: rand(0.6, 1.1), size: rand(0.12, 0.26), r: 0.16, g: 0.1, b: 0.06, a: 1, frame: SPRITE.shard, grav: GRAV, spin: rand(-12, 12), fadeIn: 0 });
    }
    const v = L.vec(0, 0, 1.2);
    this.smoke.emit({ x, y, z, vx: v.x, vy: v.y, vz: v.z, life: 1.6, size: 1.2 * s, grow: 3, r: 0.45, g: 0.42, b: 0.4, a: 0.55, frame: SPRITE.billow, drag: 1, spin: rand(-0.4, 0.4) });
  }

  hitLand(at: THREE.Vector3, big: number): void {
    const { x, y, z } = at, L = this.L.at(at);
    for (let i = 0; i < 4 + big * 6; i++) {
      const v = L.vec(Math.random() * TAU, rand(1, 4) * (1 + big), rand(1, 4) * (1 + big));
      this.smoke.emit({ x, y, z, vx: v.x, vy: v.y, vz: v.z, life: rand(1.2, 2.4), size: 1 + big * 1.5, grow: 2.5, r: 0.62, g: 0.55, b: 0.46, a: 0.6, frame: SPRITE.billow, drag: 1.3, grav: 1 });
    }
    for (let i = 0; i < 8 + big * 10; i++) {
      const v = L.vec(Math.random() * TAU, rand(4, 12), rand(4, 12));
      this.smoke.emit({ x, y, z, vx: v.x, vy: v.y, vz: v.z, life: rand(0.6, 1.1), size: rand(0.12, 0.28), r: 0.35, g: 0.3, b: 0.26, frame: SPRITE.spray, grav: 22, fadeIn: 0 });
    }
    for (let i = 0; i < 5; i++) {
      const v = L.vec(Math.random() * TAU, rand(6, 14), rand(3, 9));
      this.glow.emit({ x, y, z, vx: v.x, vy: v.y, vz: v.z, life: rand(0.2, 0.4), size: 0.06, r: 6, g: 3.5, b: 1.2, frame: SPRITE.spark, mode: 1, stretch: 0.04, grav: 18, fadeIn: 0 });
    }
  }

  /** A mortar landing, or a ship going down: fireball, smoke column, shockwave, spray. */
  explode(at: THREE.Vector3, size: number, onWater: boolean): void {
    const L = this.L.at(at), c = this.p.copy(at).addScaledVector(L.up, 1), { x, y, z } = c;
    this.glow.emit({ x, y, z, life: 0.14, size: 4.5 * size, grow: 1.5, r: 5, g: 3, b: 1.4, frame: SPRITE.puff, fadeIn: 0 });
    this.lights.flash(c, 0xff8a3a, 1400 * size * size, 34 * size, 0.55);
    // tongues of flame licking out of it, brief
    for (let i = 0; i < 5 * size; i++) {
      const v = L.vec(Math.random() * TAU, rand(2, 8) * size, rand(2, 9) * size);
      this.glow.emit({ x, y, z, vx: v.x, vy: v.y, vz: v.z, life: rand(0.25, 0.5), size: rand(0.9, 1.6) * size, grow: 1.6, r: 5, g: rand(1.8, 2.8), b: 0.6, frame: SPRITE.flame, drag: 2.5, spin: rand(-2, 2) });
    }
    for (let i = 0; i < 24 * size; i++) {
      const v = L.vec(Math.random() * TAU, rand(12, 34), rand(4, 26));
      this.glow.emit({ x, y, z, vx: v.x, vy: v.y, vz: v.z, life: rand(0.5, 1.2), size: 0.1, r: 7, g: 3.6, b: 1, frame: SPRITE.spark, mode: 1, stretch: 0.04, grav: 20, drag: 0.8, fadeIn: 0 });
    }
    // the fireball: billows burning from inside, their hearts cooling from yellow to red to smoke as they swell
    for (let i = 0; i < 3 + 4 * size; i++) {
      const v = L.vec(Math.random() * TAU, rand(1, 6) * size, rand(2, 7) * size), d = rand(0.18, 0.28);
      this.smoke.emit({ x, y, z, vx: v.x, vy: v.y, vz: v.z, life: rand(1.4, 2.2), size: rand(2.2, 3.2) * size, grow: 2.2, r: d, g: d * 0.9, b: d * 0.85, a: 0.95, frame: SPRITE.blast, heat: rand(1.1, 1.5), drag: 1.8, grav: -2, spin: rand(-0.6, 0.6), fadeIn: 0.04 });
    }
    for (let i = 0; i < 12 * size; i++) {
      const v = L.vec(Math.random() * TAU, rand(1, 5) * size, rand(3, 9) * size), dark = rand(0.16, 0.3);
      this.smoke.emit({ x, y, z, vx: v.x, vy: v.y, vz: v.z, life: rand(2.5, 4.5), size: rand(2, 3.5) * size, grow: 2.6, r: dark, g: dark * 0.95, b: dark * 0.9, a: 0.75, frame: SPRITE.billow, drag: 1.1, grav: -1.2, spin: rand(-0.3, 0.3), fadeIn: 0.12 });
    }
    if (onWater) {
      this.splash(at, 1.6 * size);
      const r = onSea(at, 0.15, new THREE.Vector3());
      this.smoke.emit({ x: r.x, y: r.y, z: r.z, life: 0.9, size: 2 * size, grow: 9, r: 1.4, g: 1.4, b: 1.45, a: 0.8, frame: SPRITE.ring, mode: 2, fadeIn: 0 });
    }
  }

  /** Blue sparks where a shot glances off a shield. */
  shieldSparks(at: THREE.Vector3): void {
    const { x, y, z } = at, L = this.L.at(at);
    for (let i = 0; i < 8; i++) {
      const v = L.vec(Math.random() * TAU, rand(3, 8), rand(-2, 5));
      this.glow.emit({ x, y, z, vx: v.x, vy: v.y, vz: v.z, life: rand(0.3, 0.55), size: 0.22, r: 1, g: 2.6, b: 5, frame: SPRITE.star, fadeIn: 0 });
    }
    this.glow.emit({ x, y, z, life: 0.12, size: 1.8, grow: 1.6, r: 0.8, g: 2.2, b: 4.5, frame: SPRITE.puff, fadeIn: 0 });
  }

  // ---------------------------------------------------------------- Cinder Peak

  /** The crater's ash column and the glow and cinders over it; called each frame while the peak is awake. */
  plume(crater: THREE.Vector3, strength: number, dt: number): void {
    const L = this.L.at(crater);
    // the column: dark ash boiling up and spreading as it rises, a thin thread of it while the peak is only warned
    const n = (2 + strength * 30) * dt;
    for (let i = 0; i < n || Math.random() < n - i; i++) {
      const o = this.at(crater, L.vec(Math.random() * TAU, rand(0, 6), rand(-2, 2))), v = L.vec(Math.random() * TAU, rand(0.3, 2.5), rand(16, 34) * (0.3 + strength));
      const d = rand(0.04, 0.1);
      this.smoke.emit({ x: o.x, y: o.y, z: o.z, vx: v.x, vy: v.y, vz: v.z, life: rand(7, 11), size: rand(6, 11) * (0.5 + strength * 0.8), grow: 5, r: d, g: d * 0.92, b: d * 0.88, a: 0.6 + strength * 0.35, frame: SPRITE.billow, drag: 0.25, spin: rand(-0.3, 0.3), fadeIn: 0.15 });
      if (i > 20) break;
    }
    if (strength < 0.05) return;
    // the crater's fire under it, lit from below
    const f = 0.75 + 0.25 * Math.sin(this.flick += dt * 13) * Math.sin(this.flick * 0.37);
    this.glow.emit({ x: crater.x, y: crater.y, z: crater.z, life: 0, size: 22 * strength, r: 5 * f, g: 1.6 * f, b: 0.35, frame: SPRITE.puff });
    const c = (6 * strength) * dt;
    for (let i = 0; i < c || Math.random() < c - i; i++) {
      const o = this.at(crater, L.vec(Math.random() * TAU, rand(0, 4), 1)), v = L.vec(Math.random() * TAU, rand(1, 6), rand(10, 24));
      this.glow.emit({ x: o.x, y: o.y, z: o.z, vx: v.x, vy: v.y, vz: v.z, life: rand(0.8, 1.6), size: rand(0.6, 1.4), grow: 0.3, r: 6, g: 2.4, b: 0.5, frame: SPRITE.flame, grav: 9, drag: 0.3, fadeIn: 0.05 });
      if (i > 10) break;
    }
  }

  /** A bomb in flight: a glowing clot of rock trailing fire and smoke. */
  bomb(at: THREE.Vector3, dt: number): void {
    const { x, y, z } = at;
    this.glow.emit({ x, y, z, life: 0, size: 6, r: 7, g: 2.8, b: 0.7, frame: SPRITE.puff });
    this.glow.emit({ x, y, z, life: 0.35, size: 2.6, grow: -0.6, r: 6, g: 2.2, b: 0.5, frame: SPRITE.flame, fadeIn: 0 });
    if (Math.random() < 40 * dt) {
      const d = rand(0.08, 0.16);
      this.smoke.emit({ x, y, z, life: rand(1.6, 2.6), size: rand(1.6, 2.6), grow: 2.4, r: d, g: d * 0.95, b: d * 0.9, a: 0.65, frame: SPRITE.blast, heat: 0.7, drag: 0.6, grav: -0.6, spin: rand(-0.4, 0.4), fadeIn: 0.05 });
    }
  }

  /** A bomb come down: it bursts, and on the water throws up steam; on land its cinders glow a while. */
  lavaLand(at: THREE.Vector3, onWater: boolean): void {
    this.explode(at, 0.6, onWater);
    const L = this.L.at(at);
    if (onWater) {
      const c = onSea(at, 0.3, new THREE.Vector3());
      for (let i = 0; i < 10; i++) {
        const o = this.at(c, L.vec(Math.random() * TAU, rand(0, 2), 0)), v = L.vec(Math.random() * TAU, rand(0.3, 1.5), rand(3, 7));
        this.smoke.emit({ x: o.x, y: o.y, z: o.z, vx: v.x, vy: v.y, vz: v.z, life: rand(2.5, 4), size: rand(1.5, 2.5), grow: 3.5, r: 1.15, g: 1.15, b: 1.18, a: 0.5, frame: SPRITE.billow, drag: 0.8, spin: rand(-0.4, 0.4), fadeIn: 0.1 });
      }
      return;
    }
    for (let i = 0; i < 8; i++) {
      const o = this.at(at, L.vec(Math.random() * TAU, rand(0, 3), 0.2));
      this.glow.emit({ x: o.x, y: o.y, z: o.z, life: rand(2, 4), size: rand(0.4, 0.9), grow: -0.2, r: 4.5, g: 1.4, b: 0.3, frame: SPRITE.puff, fadeIn: 0 });
    }
  }

  /** Rock coming down into the sea at a point on it: a tall sheet of spray, a ring and a pall of rock dust. */
  rockfall(at: THREE.Vector3): void {
    this.splash(at, 2.6);
    const L = this.L.at(at);
    for (let i = 0; i < 16; i++) {
      const o = this.at(at, L.vec(Math.random() * TAU, rand(0, 4), 0)), v = L.vec(Math.random() * TAU, rand(2, 6), rand(14, 26));
      this.smoke.emit({ x: o.x, y: o.y, z: o.z, vx: v.x, vy: v.y, vz: v.z, life: rand(1.2, 2), size: rand(1.5, 2.6), grow: 3, r: 1.3, g: 1.35, b: 1.4, a: 0.75, frame: SPRITE.spray, grav: GRAV, drag: 0.5, float: true });
    }
    for (let i = 0; i < 6; i++) {
      const o = this.at(at, L.vec(Math.random() * TAU, rand(0, 6), 2)), v = L.vec(Math.random() * TAU, rand(0.5, 2), rand(1, 3)), d = rand(0.5, 0.65);
      this.smoke.emit({ x: o.x, y: o.y, z: o.z, vx: v.x, vy: v.y, vz: v.z, life: rand(3, 5), size: rand(4, 7), grow: 4, r: d, g: d * 0.93, b: d * 0.85, a: 0.45, frame: SPRITE.billow, drag: 0.7, spin: rand(-0.3, 0.3), fadeIn: 0.15 });
    }
  }

  // ---------------------------------------------------------------- ships

  /** A ship lost: the fire, her wreckage, and her wisp lantern rising free into the sky. */
  sink(at: THREE.Vector3, fwd: THREE.Vector3, wisp: THREE.Color, paint: THREE.Color): void {
    this.explode(onSea(at, 2, new THREE.Vector3()), 1.4, true);
    this.debris.wreck(onSea(at, 0, new THREE.Vector3()), fwd, paint);
    this.wisps.push({ p: onSea(at, 3, new THREE.Vector3()), c: wisp.clone(), t: 0 });
  }

  /** The mainmast going: splinters and dust burst from its foot, and the rigging's tar-smoke. */
  mastBreak(foot: THREE.Vector3, top: THREE.Vector3): void {
    this.hitShip(foot, false, 1.8);
    const L = this.L.at(foot);
    for (let i = 0; i < 26; i++) {
      const k = Math.random(), x = foot.x + (top.x - foot.x) * k, y = foot.y + (top.y - foot.y) * k, z = foot.z + (top.z - foot.z) * k;
      const v = L.vec(Math.random() * TAU, rand(1, 5), rand(1, 4));
      this.smoke.emit({ x, y, z, vx: v.x, vy: v.y, vz: v.z, life: rand(0.6, 1.4), size: rand(0.15, 0.4), r: 0.16, g: 0.1, b: 0.06, a: 1, frame: SPRITE.shard, grav: GRAV, spin: rand(-10, 10), fadeIn: 0 });
    }
    // what the break tears out of the step and the partners round it, thrown clear over the side to float
    this.debris.splinter(foot, top);
    for (let i = 0; i < 6; i++) {
      const v = L.vec(Math.random() * TAU, rand(0.5, 2), rand(0.5, 2));
      this.smoke.emit({ x: foot.x, y: foot.y, z: foot.z, vx: v.x, vy: v.y, vz: v.z, life: rand(1.5, 2.5), size: 1.4, grow: 3, r: 0.6, g: 0.55, b: 0.5, a: 0.45, frame: SPRITE.billow, drag: 1 });
    }
  }

  /** A jury mast swayed up: a little dust and chips off the step. */
  juryRig(foot: THREE.Vector3): void {
    const L = this.L.at(foot);
    for (let i = 0; i < 10; i++) {
      const v = L.vec(Math.random() * TAU, rand(1, 3), rand(1, 3));
      this.smoke.emit({ x: foot.x, y: foot.y, z: foot.z, vx: v.x, vy: v.y, vz: v.z, life: rand(0.8, 1.4), size: 0.6, grow: 2.5, r: 0.75, g: 0.68, b: 0.58, a: 0.4, frame: SPRITE.billow, drag: 1.5 });
    }
  }

  /**
   * A ship on fire, per frame: flames licking along her deck between bow and stern, more of them up the canvas while
   * the mainmast stands (`sail`, its middle), embers lifting, and a dark pall of smoke.
   */
  burning(deck: THREE.Vector3, fwd: THREE.Vector3, sail: THREE.Vector3 | null, dt: number): void {
    const L = this.L.at(deck);
    // the air over her shimmers in the heat, up through the burning canvas
    heat(deck, 7, 1);
    if (sail) heat(sail, 6, 0.8);
    for (let i = 0; i < 40 * dt || Math.random() < 40 * dt - i; i++) {
      const o = this.p.copy(deck).addScaledVector(fwd, rand(-6, 6)).add(L.vec(Math.random() * TAU, rand(0, 1.4), rand(-0.3, 0.4)));
      const v = L.vec(Math.random() * TAU, rand(0, 0.6), rand(1.5, 3.5));
      this.glow.emit({ x: o.x, y: o.y, z: o.z, vx: v.x, vy: v.y, vz: v.z, life: rand(0.35, 0.7), size: rand(0.7, 1.4), grow: 0.5, r: 6, g: 2.6, b: 0.6, frame: SPRITE.flame, fadeIn: 0.1, spin: rand(-1, 1) });
      if (i > 8) break;
    }
    if (sail) for (let i = 0; i < 24 * dt || Math.random() < 24 * dt - i; i++) {
      const o = this.p.copy(sail).add(L.vec(Math.random() * TAU, rand(0, 2.5), rand(-3, 4)));
      const v = L.vec(Math.random() * TAU, rand(0, 0.8), rand(2, 4));
      this.glow.emit({ x: o.x, y: o.y, z: o.z, vx: v.x, vy: v.y, vz: v.z, life: rand(0.3, 0.6), size: rand(0.6, 1.1), grow: 0.4, r: 6.5, g: 2.4, b: 0.5, frame: SPRITE.flame, fadeIn: 0.1 });
      if (i > 6) break;
    }
    if (Math.random() < 30 * dt) {
      const o = this.p.copy(deck).addScaledVector(fwd, rand(-5, 5)), v = L.vec(Math.random() * TAU, rand(0.5, 2), rand(3, 7));
      this.glow.emit({ x: o.x, y: o.y, z: o.z, vx: v.x, vy: v.y, vz: v.z, life: rand(0.8, 1.6), size: 0.06, r: 7, g: 2.6, b: 0.4, frame: SPRITE.spark, drag: 0.8, fadeIn: 0 });
    }
    if (Math.random() < 9 * dt) {
      const o = this.p.copy(sail ?? deck).addScaledVector(fwd, rand(-3, 3)), v = L.vec(Math.random() * TAU, rand(0.5, 1.5), rand(2.5, 4.5));
      // the pall, lit from under by the fire it rises off
      this.smoke.emit({ x: o.x, y: o.y, z: o.z, vx: v.x, vy: v.y, vz: v.z, life: rand(3, 5), size: 1.6, grow: 5, r: 0.16, g: 0.15, b: 0.14, a: 0.6, frame: SPRITE.blast, heat: 0.55, drag: 0.3, spin: rand(-0.4, 0.4) });
    }
  }

  /** Fire put out, or a red-hot ball doused: a white burst of steam. */
  steam(at: THREE.Vector3, big = 1): void {
    const L = this.L.at(at);
    for (let i = 0; i < 10 * big; i++) {
      const o = this.at(at, L.vec(Math.random() * TAU, rand(0, 2) * big, 0)), v = L.vec(Math.random() * TAU, rand(0.5, 2), rand(2, 5));
      this.smoke.emit({ x: o.x, y: o.y, z: o.z, vx: v.x, vy: v.y, vz: v.z, life: rand(1.5, 2.6), size: rand(0.8, 1.4) * big, grow: 4, r: 1.25, g: 1.27, b: 1.3, a: 0.5, frame: SPRITE.billow, drag: 0.8, spin: rand(-0.5, 0.5) });
    }
  }

  /** The gust: a ring of wind round the hull, streaks blowing aft and a sheet of spray off the bow. */
  gust(pos: THREE.Vector3, fwd: THREE.Vector3): void {
    const L = this.L.at(pos), c = onSea(pos, 0, new THREE.Vector3());
    for (let i = 0; i < 26; i++) {
      const o = this.at(c, L.vec(Math.random() * TAU, rand(4, 9), rand(1, 9))), sp = rand(25, 40);
      this.glow.emit({ x: o.x, y: o.y, z: o.z, vx: -fwd.x * sp, vy: -fwd.y * sp, vz: -fwd.z * sp, life: rand(0.25, 0.5), size: 0.08, r: 1.6, g: 1.9, b: 2.2, a: 0.8, frame: SPRITE.spark, mode: 1, stretch: 0.12, fadeIn: 0 });
    }
    const side = new THREE.Vector3().crossVectors(L.up, fwd);
    const bow = c.clone().addScaledVector(fwd, 6).addScaledVector(L.up, 0.6);
    for (let i = 0; i < 22; i++) {
      const sd = i % 2 ? 1 : -1, sp = rand(5, 10);
      const v = side.clone().multiplyScalar(sd * sp).addScaledVector(fwd, 6).addScaledVector(L.up, rand(4, 8));
      this.smoke.emit({ x: bow.x, y: bow.y, z: bow.z, vx: v.x, vy: v.y, vz: v.z, life: rand(0.7, 1.2), size: 0.7, grow: 2.5, r: 1.3, g: 1.35, b: 1.4, a: 0.7, frame: SPRITE.spray, grav: 14, float: true });
    }
    const r = onSea(pos, 0.12, new THREE.Vector3());
    this.smoke.emit({ x: r.x, y: r.y, z: r.z, life: 0.8, size: 4, grow: 4, r: 1.2, g: 1.3, b: 1.4, a: 0.6, frame: SPRITE.ring, mode: 2, fadeIn: 0 });
  }

  sparkle(at: THREE.Vector3, color: THREE.Color, n = 18, spread = 2): void {
    const L = this.L.at(at);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU, o = this.at(at, L.vec(a, spread * Math.random(), rand(0, 1.5))), v = L.vec(a, rand(1, 5), rand(2, 7));
      this.glow.emit({ x: o.x, y: o.y, z: o.z, vx: v.x, vy: v.y, vz: v.z, life: rand(0.5, 1.1), size: rand(0.25, 0.6), r: color.r * 3, g: color.g * 3, b: color.b * 3, frame: SPRITE.star, drag: 2, grav: 2, fadeIn: 0.05 });
    }
  }

  /** Smoke from a hurt ship, flames from a dying one; called each frame per ship. */
  wounded(at: THREE.Vector3, hp: number, dt: number): void {
    if (hp > 0.6) return;
    const L = this.L.at(at);
    if (Math.random() < (0.6 - hp) * 14 * dt) {
      const d = 0.22 + hp * 0.4, o = this.at(at, L.vec(Math.random() * TAU, rand(0, 1), 0)), v = L.vec(Math.random() * TAU, rand(0, 0.5), rand(2, 4));
      this.smoke.emit({ x: o.x, y: o.y, z: o.z, vx: v.x, vy: v.y, vz: v.z, life: rand(2, 3.5), size: 0.8, grow: 4, r: d, g: d * 0.95, b: d * 0.92, a: 0.6, frame: SPRITE.billow, drag: 0.4, spin: rand(-0.5, 0.5) });
    }
    if (hp < 0.3 && Math.random() < (0.3 - hp) * 50 * dt) {
      const o = this.at(at, L.vec(Math.random() * TAU, rand(0, 1.2), -0.5)), v = L.vec(0, 0, rand(2, 4));
      this.glow.emit({ x: o.x, y: o.y, z: o.z, vx: v.x, vy: v.y, vz: v.z, life: rand(0.35, 0.6), size: rand(0.5, 0.9), grow: 0.4, r: 5, g: 2.2, b: 0.6, frame: SPRITE.flame, fadeIn: 0.1 });
    }
  }

  /** Spray thrown off the bow at speed. */
  bowSpray(bow: THREE.Vector3, fwd: THREE.Vector3, speed: number, dt: number): void {
    if (speed < 7 || Math.random() > (speed - 7) * 3 * dt) return;
    const L = this.L.at(bow), side = this.L2.at(bow).b.crossVectors(L.up, fwd).multiplyScalar(Math.random() < 0.5 ? -1 : 1);
    const o = onSea(bow, 0.4, new THREE.Vector3()).addScaledVector(side, 1.2), sp = rand(2, 4);
    const v = side.multiplyScalar(sp).addScaledVector(fwd, speed * 0.6).addScaledVector(L.up, rand(2, 4));
    this.smoke.emit({ x: o.x, y: o.y, z: o.z, vx: v.x, vy: v.y, vz: v.z, life: rand(0.5, 0.8), size: 0.5, grow: 2.2, r: 1.3, g: 1.35, b: 1.4, a: 0.55, frame: SPRITE.spray, grav: 12, float: true });
  }

  /** Speed lines streaming past a falling or gusting ship. */
  windAround(pos: THREE.Vector3, vel: THREE.Vector3, rate: number, dt: number): void {
    const n = rate * dt, L = this.L.at(pos);
    for (let i = 0; i < n || Math.random() < n - i; i++) {
      const o = this.at(pos, L.vec(Math.random() * TAU, rand(5, 16), rand(-2, 8)));
      this.glow.emit({ x: o.x, y: o.y, z: o.z, vx: -vel.x * 1.4, vy: -vel.y * 1.4, vz: -vel.z * 1.4, life: rand(0.2, 0.4), size: 0.04, r: 1.2, g: 1.35, b: 1.5, a: 0.35, frame: SPRITE.spark, mode: 1, stretch: 0.08, fadeIn: 0.2 });
      if (i > 60) break;
    }
  }

  /** A glow for one frame: lanterns, halos. */
  light(at: THREE.Vector3, size: number, c: THREE.Color, k: number, frame: number = SPRITE.puff): void {
    this.glow.emit({ x: at.x, y: at.y, z: at.z, life: 0, size, r: c.r * k, g: c.g * k, b: c.b * k, frame, rot: 0 });
  }

  // ---------------------------------------------------------------- per frame

  update(dt: number): void {
    this.debris.update(dt);
    this.lights.update(dt);
    const up = this.L.up, v = new THREE.Vector3();
    // wisps of the lost, rising
    for (let i = this.wisps.length - 1; i >= 0; i--) {
      const w = this.wisps[i];
      w.t += dt;
      up.copy(w.p).normalize();
      w.p.addScaledVector(up, dt * (4 + w.t * 6));
      v.copy(up).multiplyScalar(-2);
      this.glow.emit({ x: w.p.x, y: w.p.y, z: w.p.z, life: 0, size: 1.4, r: w.c.r * 6, g: w.c.g * 6, b: w.c.b * 6, frame: SPRITE.puff });
      this.glow.emit({ x: w.p.x, y: w.p.y, z: w.p.z, vx: v.x, vy: v.y, vz: v.z, life: 0.8, size: 0.5, grow: 0.2, r: w.c.r * 3, g: w.c.g * 3, b: w.c.b * 3, frame: SPRITE.star, fadeIn: 0 });
      if (w.t > 5) {
        this.wisps.splice(i, 1);
        const L = this.L.at(w.p);
        for (let k = 0; k < 30; k++) {
          const s = L.vec(Math.random() * TAU, 8, rand(-4, 4));
          this.glow.emit({ x: w.p.x, y: w.p.y, z: w.p.z, vx: s.x, vy: s.y, vz: s.z, life: 1, size: 0.3, r: w.c.r * 4, g: w.c.g * 4, b: w.c.b * 4, frame: SPRITE.star, drag: 2, fadeIn: 0 });
        }
      }
    }
    this.glow.update(dt);
    this.smoke.update(dt);
    this.trails.update(dt);
    this.heatTrails.update(dt);
  }
}

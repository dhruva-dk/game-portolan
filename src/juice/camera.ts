// The camera's response: trauma shake, kicks, punch-in zoom and FOV pulses, layered on top of whatever rig placed
// the camera this frame. It works in the camera's own frame (right, up, back), so it doesn't care that the planet is
// a sphere or which way is up.
//
// Shake follows Eiserloh's trauma model: events add trauma (0..1), trauma decays linearly, and the shake is
// trauma squared driven by smooth seeded noise, so small knocks stay small and big ones feel violent. Two bands:
// `hit` is a fast, sharp judder for impacts; `rumble` is a slow heave for gusts, whales and wins.
import type * as THREE from 'three';
import { EASE, Spring, SPRING } from './ease.ts';
import { effects } from './log.ts';
import { noise1 } from './noise.ts';

export type Band = 'hit' | 'rumble';

interface BandShape {
  /** Noise cells per second: how fast the shake moves. */
  freq: number;
  /** Trauma lost per second. */
  decay: number;
  /** Metres at full shake: right, up, back. */
  pos: readonly [number, number, number];
  /** Degrees at full shake: pitch, yaw, roll. */
  rot: readonly [number, number, number];
}

/**
 * Full shake (trauma 1) is an earthquake: no recipe asks for it. Shake goes as trauma², so trauma 0.3 is a judder
 * (9%), 0.5 a jolt (25%) and 0.7 a slam (49%). Roll gets the most because it reads best from a chase camera without
 * moving the crosshair off target; yaw and pitch are what make the far horizon jump.
 */
export const BANDS: Record<Band, BandShape> = {
  hit: { freq: 16, decay: 1.8, pos: [0.5, 0.4, 0.3], rot: [2.2, 2.2, 4] },
  rumble: { freq: 4, decay: 0.8, pos: [0.6, 0.5, 0.4], rot: [1.4, 1.6, 3] },
};

/** A knock to the camera, as the peak of its first swing. Metres camera-local, degrees. */
export interface KickSpec {
  right?: number;
  up?: number;
  /** + moves the camera back toward the viewer, - pushes it in. */
  back?: number;
  /** + looks up. */
  pitch?: number;
  /** + looks left. */
  yaw?: number;
  /** + rolls clockwise. */
  roll?: number;
  /** Metres pushed away from the source direction, when one is given. */
  away?: number;
  /** Degrees rolled away from the source direction, when one is given. */
  tilt?: number;
}

/** A field-of-view envelope in degrees: negative punches in, positive widens for speed. Times in seconds. */
export interface PulseSpec {
  deg: number;
  attack: number;
  hold: number;
  release: number;
}

export interface CameraSpec {
  shake?: number;
  band?: Band;
  kick?: KickSpec;
  fov?: PulseSpec;
  /** Metres: full strength at the first, none beyond the second. Leave out for feedback that ignores distance. */
  falloff?: readonly [number, number];
}

export interface CameraOffset {
  x: number;
  y: number;
  z: number;
  pitch: number;
  yaw: number;
  roll: number;
  fov: number;
}

interface Pulse extends PulseSpec {
  age: number;
}

const DEG = Math.PI / 180;

export class CameraJuice {
  readonly trauma: Record<Band, number> = { hit: 0, rumble: 0 };
  /** 0..1: the player's screen-shake setting. Scales shake, kicks and pulses. */
  intensity = 1;
  readonly offset: CameraOffset = { x: 0, y: 0, z: 0, pitch: 0, yaw: 0, roll: 0, fov: 0 };
  private t = 0;
  private readonly seed: number;
  private readonly springs = {
    x: new Spring(SPRING.kick),
    y: new Spring(SPRING.kick),
    z: new Spring(SPRING.kick),
    pitch: new Spring(SPRING.kick),
    yaw: new Spring(SPRING.kick),
    roll: new Spring(SPRING.kick),
  };
  private pulses: Pulse[] = [];

  constructor(seed = 1) {
    this.seed = seed;
  }

  /**
   * Plays a camera spec. `dir` is the screen direction the cause came from, radians clockwise from straight ahead
   * (0 ahead, π/2 from the right). `distance` is metres from the camera, for specs with a falloff.
   */
  play(spec: CameraSpec, strength = 1, dir?: number, distance?: number): void {
    let k = strength;
    if (spec.falloff && distance !== undefined) {
      const [near, far] = spec.falloff;
      k *= Math.max(0, Math.min(1, (far - distance) / Math.max(1e-6, far - near)));
    }
    if (k <= 0) {
      effects.add('camera', 'out of range', { distance: distance ?? -1 }, 'suppressed');
      return;
    }
    if (spec.shake) this.shake(spec.shake * k, spec.band ?? 'hit');
    if (spec.kick) this.kick(spec.kick, k, dir);
    if (spec.fov) this.pulse(spec.fov, k);
  }

  shake(amount: number, band: Band = 'hit'): void {
    const before = this.trauma[band];
    this.trauma[band] = Math.min(1, before + amount * this.intensity);
    effects.add('camera', `shake ${band}`, { add: amount, trauma: this.trauma[band] }, this.intensity > 0 ? 'played' : 'suppressed');
  }

  kick(spec: KickSpec, strength = 1, dir?: number): void {
    const k = strength * this.intensity;
    const s = this.springs;
    let right = spec.right ?? 0, back = spec.back ?? 0, roll = spec.roll ?? 0;
    if (dir !== undefined) {
      right -= Math.sin(dir) * (spec.away ?? 0);
      back += Math.cos(dir) * (spec.away ?? 0);
      roll -= Math.sin(dir) * (spec.tilt ?? 0);
    }
    s.x.kick(right * k);
    s.y.kick((spec.up ?? 0) * k);
    s.z.kick(back * k);
    s.pitch.kick((spec.pitch ?? 0) * k);
    s.yaw.kick((spec.yaw ?? 0) * k);
    s.roll.kick(roll * k);
    const d: Record<string, number> = {};
    for (const [key, v] of Object.entries({ right, up: spec.up ?? 0, back, pitch: spec.pitch ?? 0, yaw: spec.yaw ?? 0, roll }))
      if (v) d[key] = v * k;
    effects.add('camera', 'kick', d, k > 0 ? 'played' : 'suppressed');
  }

  pulse(spec: PulseSpec, strength = 1): void {
    const deg = spec.deg * strength * this.intensity;
    this.pulses.push({ ...spec, deg, age: 0 });
    effects.add('camera', spec.deg < 0 ? 'punch-in' : 'fov pulse', { deg, attack: spec.attack * 1000, hold: spec.hold * 1000, release: spec.release * 1000 });
  }

  /** Advances on real time, so the shake plays over a hit-stop's frozen frame. */
  update(dt: number): CameraOffset {
    this.t += dt;
    const o = this.offset;
    o.x = o.y = o.z = o.pitch = o.yaw = o.roll = 0;
    for (const band of ['hit', 'rumble'] as const) {
      const tr = this.trauma[band];
      if (tr <= 0) continue;
      const b = BANDS[band], amt = tr * tr, f = this.t * b.freq;
      const n = (axis: number) => noise1(f + axis * 17.3, this.seed + axis * 101 + (band === 'hit' ? 0 : 7));
      o.x += n(0) * b.pos[0] * amt;
      o.y += n(1) * b.pos[1] * amt;
      o.z += n(2) * b.pos[2] * amt;
      o.pitch += n(3) * b.rot[0] * amt;
      o.yaw += n(4) * b.rot[1] * amt;
      o.roll += n(5) * b.rot[2] * amt;
      this.trauma[band] = Math.max(0, tr - b.decay * dt);
    }
    const s = this.springs;
    o.x += s.x.step(dt);
    o.y += s.y.step(dt);
    o.z += s.z.step(dt);
    o.pitch += s.pitch.step(dt);
    o.yaw += s.yaw.step(dt);
    o.roll += s.roll.step(dt);
    o.fov = 0;
    for (const p of this.pulses) {
      p.age += dt;
      o.fov += p.deg * envelope(p);
    }
    this.pulses = this.pulses.filter((p) => p.age < p.attack + p.hold + p.release);
    return o;
  }

  /**
   * Layers this frame's offset onto a camera the rig has just placed. `baseFov` is the rig's field of view for this
   * frame; the pulse is added to it (so calling every frame never accumulates).
   */
  apply(cam: THREE.PerspectiveCamera, baseFov: number): void {
    const o = this.offset;
    cam.translateX(o.x);
    cam.translateY(o.y);
    cam.translateZ(o.z);
    cam.rotateY(o.yaw * DEG);
    cam.rotateX(o.pitch * DEG);
    cam.rotateZ(-o.roll * DEG);
    const fov = baseFov + o.fov;
    if (cam.fov !== fov) {
      cam.fov = fov;
      cam.updateProjectionMatrix();
    }
  }

  get busy(): boolean {
    return this.trauma.hit > 0 || this.trauma.rumble > 0 || this.pulses.length > 0 || !Object.values(this.springs).every((s) => s.settled());
  }

  clear(): void {
    this.trauma.hit = this.trauma.rumble = 0;
    this.pulses = [];
    for (const s of Object.values(this.springs)) s.snap(0);
  }
}

/** 0 → 1 → 1 → 0: a snappy attack, a hold and a gentle release. */
export function envelope(p: PulseSpec & { age: number }): number {
  const a = p.age;
  if (a < p.attack) return EASE.snap(a / p.attack);
  if (a < p.attack + p.hold) return 1;
  return 1 - EASE.swoop((a - p.attack - p.hold) / Math.max(1e-6, p.release));
}

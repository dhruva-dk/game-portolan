// The camera's answer to what happens: 0117's camera juice (juice/camera.ts, its recipes' camera parts in
// juice/recipes.ts and app/juice.ts), laid over the eye the chase camera has placed, and nothing else of the camera.
//
// Shake is Eiserloh's trauma model: a blow adds trauma (0…1), which drains linearly, and the eye shakes by trauma²
// along smooth seeded noise, so a knock stays small and a slam is violent. Two bands: `hit`, a fast judder, and
// `rumble`, a slow heave. A kick knocks the eye (metres along its own right, up and back; degrees of pitch, yaw and
// roll) on springs that snap home past their rest once; a pulse narrows the field of view (a punch-in) or widens it,
// over an attack, a hold and a release. A blow from a bearing kicks the eye away from it and rolls it away.
//
// Gentle enough for a phone held in the hands: everything at GENTLE of 0117's, its widest pulse held to PULSE degrees.
// Runs on real time, so the shake plays over a hit-stop's held frame (stops.ts).
//
// Pure: no three, no page.

import { blowOf, felt, type Blow, type Deed } from '../player.ts';
import type { Eye } from '../snapshot.ts';
import { hash01 } from '../world/random.ts';
import { easeInOut, lerp, smoother } from '../world/scalar.ts';
import { add, type Vec3 } from '../world/sphere.ts';
import { axisAngle, multiply, rotate, type Turn } from '../world/turn.ts';

/** All of it at this share of 0117's, and no field-of-view pulse past this many degrees either way. */
const GENTLE = 0.75, PULSE = 6;

type Band = 'hit' | 'rumble';
/** Each band: noise cells a second, trauma lost a second, metres at full shake (right, up, back), degrees (pitch, yaw,
 *  roll). 0117's: roll the most, since it reads best from a chase camera and keeps the aim where it was. */
export const BANDS: Record<Band, { freq: number; decay: number; pos: Vec3; rot: Vec3 }> = {
  hit: { freq: 16, decay: 1.8, pos: [0.5, 0.4, 0.3], rot: [2.2, 2.2, 4] },
  rumble: { freq: 4, decay: 0.8, pos: [0.6, 0.5, 0.4], rot: [1.4, 1.6, 3] },
};

/** A knock: metres along the eye's right, up and back, degrees of pitch (up), yaw (left) and roll (clockwise), and
 *  metres pushed and degrees rolled away from the blow's bearing, when there is one. */
export interface Kick { right?: number; up?: number; back?: number; pitch?: number; yaw?: number; roll?: number; away?: number; tilt?: number }
/** A pulse of the field of view, degrees (− punches in), over seconds. */
export interface Pulse { deg: number; attack: number; hold: number; release: number }
/** How the camera answers a moment: trauma added to a band, a kick, a pulse, and the metres over which it fades out
 *  with distance (full at the first, none past the second). */
export interface Answer { shake?: number; band?: Band; kick?: Kick; fov?: Pulse; falloff?: readonly [number, number] }

/** 0117's recipes' camera parts (juice/recipes.ts), by name. */
export const CAMERA = {
  fire: { shake: 0.2, kick: { back: 0.5, pitch: 0.9, roll: 0.4 } },
  hit: { shake: 0.22, fov: { deg: -1.6, attack: 0.035, hold: 0.03, release: 0.22 } },
  shieldHit: { shake: 0.18, fov: { deg: -1.2, attack: 0.035, hold: 0.02, release: 0.2 } },
  shieldBreak: { shake: 0.42, kick: { pitch: 0.7, back: 0.3 }, fov: { deg: -5, attack: 0.05, hold: 0.08, release: 0.42 } },
  shieldLost: { shake: 0.5, kick: { away: 0.7, tilt: 2.5 }, fov: { deg: -2.5, attack: 0.04, hold: 0.05, release: 0.35 } },
  hurt: { shake: 0.38, kick: { away: 0.55, tilt: 2 } },
  sink: { shake: 0.45, fov: { deg: -6, attack: 0.08, hold: 0.25, release: 0.6 } },
  sunk: { shake: 0.6, band: 'rumble', fov: { deg: -6, attack: 0.1, hold: 0.4, release: 1.2 } },
  near: { shake: 0.3, band: 'rumble', falloff: [40, 220] },
  gust: { shake: 0.3, band: 'rumble', kick: { back: 1.4, up: 0.5, pitch: -0.6 }, fov: { deg: 9, attack: 0.12, hold: 0.35, release: 0.7 } },
  shield: { fov: { deg: 1.5, attack: 0.1, hold: 0.1, release: 0.4 } },
  repair: { fov: { deg: 1, attack: 0.1, hold: 0.1, release: 0.4 } },
  pickup: [
    {}, {}, { fov: { deg: -1, attack: 0.05, hold: 0.04, release: 0.25 } },
    { shake: 0.14, band: 'rumble', fov: { deg: -2, attack: 0.05, hold: 0.06, release: 0.35 } },
    { shake: 0.28, band: 'rumble', fov: { deg: -3.5, attack: 0.06, hold: 0.12, release: 0.5 } },
  ],
} as const satisfies Record<string, Answer | readonly Answer[]>;

/** The camera's answer to a blow she dealt. */
const DEALT: Record<Blow, Answer> = { broke: CAMERA.shieldBreak, hull: CAMERA.hit, shield: CAMERA.shieldHit };

/** The camera's answer to a deed seen from `me` (her id; −1 watching another's ship: only the world's rumbles reach
 *  her), and how strongly; null for none. 0117's app/juice.ts react. */
export function answerTo(d: Deed, me: number): { answer: Answer; strength: number } | null {
  const by = d.kind === 'struck' || d.kind === 'sank' ? d.by : null;
  switch (d.kind) {
    case 'fired': return d.ship === me ? { answer: CAMERA.fire, strength: 1 } : null;
    case 'struck': {
      const points = d.shield + d.hull;
      if (by === me && d.ship !== me) return { answer: DEALT[blowOf(d)], strength: d.broke ? 1 : felt.dealt(points) };
      if (d.ship === me && points > 0) return { answer: d.broke ? CAMERA.shieldLost : CAMERA.hurt, strength: d.broke ? 1 : felt.taken(points) };
      return null;
    }
    case 'sank': return by === me && d.ship !== me ? { answer: CAMERA.sink, strength: 1 } : d.ship === me ? { answer: CAMERA.sunk, strength: 1 } : { answer: CAMERA.near, strength: 1 };
    case 'took': return d.ship === me ? { answer: CAMERA.pickup[d.rarity] ?? {}, strength: 1 } : null;
    case 'mended': return d.ship !== me ? null : { answer: d.piece === 'smallShield' || d.piece === 'bigShield' ? CAMERA.shield : CAMERA.repair, strength: 1 };
    case 'gust': return d.ship === me ? { answer: CAMERA.gust, strength: 1 } : null;
    default: return null;
  }
}

/** Smooth seeded noise in about −1…1, a lattice cell a unit of x (0117's juice/noise.ts). */
export function noise(x: number, seed: number): number {
  // a slope at each lattice point, −1…1
  const slope = (i: number) => hash01(i, seed) * 2 - 1;
  const i = Math.floor(x), f = x - i, a = slope(i) * f, b = slope(i + 1) * (f - 1);
  return lerp(a, b, smoother(f)) * 2;
}

/** A damped spring at rest at 0 (0117's juice/ease.ts SPRING.kick: 7 Hz, damping 0.55), stepped in small substeps. */
export function spring(freq = 7, damping = 0.55) {
  let x = 0, v = 0;
  const w = 2 * Math.PI * freq, k = w * w, c = 2 * damping * w;
  const step = (dt: number) => {
    for (let left = Math.min(dt, 0.25); left > 1e-9; left -= 1 / 480) {
      const h = Math.min(1 / 480, left);
      v += (-k * x - c * v) * h;
      x += v * h;
    }
    return x;
  };
  // how far its first swing carries for unit velocity, so a kick is given as its peak
  const peak = (() => {
    let p = 0;
    v = 1;
    for (let i = 0; i < 2000 && v > 0; i++) p = Math.max(p, step(1 / 1000));
    x = v = 0;
    return p;
  })();
  return {
    step,
    kick: (amount: number) => (v += amount / peak),
    clear: () => (x = v = 0),
  };
}

/** 0 → 1 → 1 → 0 over a pulse `age` seconds in: a snappy attack (expo out), the hold, a gentle release (cubic in-out). */
export function envelope(p: Pulse, age: number): number {
  if (age < p.attack) return 1 - Math.pow(2, (-10 * age) / p.attack);
  if (age < p.attack + p.hold) return 1;
  const t = Math.min(1, (age - p.attack - p.hold) / Math.max(1e-6, p.release));
  return 1 - easeInOut(t);
}

const DEG = Math.PI / 180;
/** q turned by `a` radians about its own unit axis `k`. */
const turned = (q: Turn, k: Vec3, a: number): Turn => multiply(q, axisAngle(k, a));

export function createShake(seed = 1) {
  const trauma: Record<Band, number> = { hit: 0, rumble: 0 };
  const springs = { x: spring(), y: spring(), z: spring(), pitch: spring(), yaw: spring(), roll: spring() };
  let pulses: (Pulse & { age: number })[] = [], t = 0;
  /** The offset this frame: metres along the eye's right, up and back; degrees of pitch, yaw and roll; of the fov. */
  const o = { x: 0, y: 0, z: 0, pitch: 0, yaw: 0, roll: 0, fov: 0 };

  return {
    /** An answer played `strength` strong, from `bearing` (radians clockwise from the look) `metres` away. */
    play(a: Answer, strength: number, bearing?: number, metres?: number) {
      let k = strength * GENTLE;
      if (a.falloff && metres !== undefined) k *= Math.max(0, Math.min(1, (a.falloff[1] - metres) / (a.falloff[1] - a.falloff[0])));
      if (k <= 0) return;
      if (a.shake) trauma[a.band ?? 'hit'] = Math.min(1, trauma[a.band ?? 'hit'] + a.shake * k);
      if (a.kick) {
        const s = a.kick, side = bearing === undefined ? 0 : Math.sin(bearing), ahead = bearing === undefined ? 0 : Math.cos(bearing);
        springs.x.kick(((s.right ?? 0) - side * (s.away ?? 0)) * k);
        springs.y.kick((s.up ?? 0) * k);
        springs.z.kick(((s.back ?? 0) + ahead * (s.away ?? 0)) * k);
        springs.pitch.kick((s.pitch ?? 0) * k);
        springs.yaw.kick((s.yaw ?? 0) * k);
        springs.roll.kick(((s.roll ?? 0) - side * (s.tilt ?? 0)) * k);
      }
      if (a.fov) pulses.push({ ...a.fov, deg: Math.max(-PULSE, Math.min(PULSE, a.fov.deg * k)), age: 0 });
    },
    /** dt seconds of real time on. */
    update(dt: number) {
      t += dt;
      o.x = o.y = o.z = o.pitch = o.yaw = o.roll = 0;
      for (const band of ['hit', 'rumble'] as const) {
        const tr = trauma[band];
        if (tr <= 0) continue;
        const b = BANDS[band], amount = tr * tr, f = t * b.freq;
        const n = (axis: number) => noise(f + axis * 17.3, seed + axis * 101 + (band === 'hit' ? 0 : 7)) * amount;
        o.x += n(0) * b.pos[0]; o.y += n(1) * b.pos[1]; o.z += n(2) * b.pos[2];
        o.pitch += n(3) * b.rot[0]; o.yaw += n(4) * b.rot[1]; o.roll += n(5) * b.rot[2];
        trauma[band] = Math.max(0, tr - b.decay * dt);
      }
      o.x += springs.x.step(dt); o.y += springs.y.step(dt); o.z += springs.z.step(dt);
      o.pitch += springs.pitch.step(dt); o.yaw += springs.yaw.step(dt); o.roll += springs.roll.step(dt);
      o.fov = 0;
      for (const p of pulses) o.fov += p.deg * envelope(p, (p.age += dt));
      pulses = pulses.filter((p) => p.age < p.attack + p.hold + p.release);
    },
    /** The eye as the camera placed it, knocked and shaken (three's translateX/Y/Z, rotateY, rotateX, rotateZ). */
    on(eye: Eye): Eye {
      const q = eye.orientation;
      const position = add(add(add(eye.position, rotate([1, 0, 0], q), o.x), rotate([0, 1, 0], q), o.y), rotate([0, 0, 1], q), o.z);
      const orientation = turned(turned(turned(q, [0, 1, 0], o.yaw * DEG), [1, 0, 0], o.pitch * DEG), [0, 0, 1], -o.roll * DEG);
      return { ...eye, position, orientation, fov: eye.fov + o.fov };
    },
    /** The offset now (for the tests). */
    offset: () => ({ ...o }),
    /** Trauma left in each band (for the tests). */
    trauma: () => ({ ...trauma }),
    clear() {
      trauma.hit = trauma.rumble = 0;
      pulses = [];
      Object.values(springs).forEach((s) => s.clear());
    },
  };
}

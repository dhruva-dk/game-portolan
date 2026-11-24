import { blowOf, felt, type Blow, type Deed } from './player.ts';
import type { Eye } from '../render/snapshot.ts';
import { rankOf } from '../sim/kinds.ts';
import { hash01 } from '../world/random.ts';
import { clamp, easeInOut, lerp, smoother } from '../world/scalar.ts';
import { add, type Out3, type Vec3 } from '../world/sphere.ts';
import {
  axisAngle,
  multiply,
  rotate,
  type Out4,
  type Turn,
} from '../world/turn.ts';

const GENTLE = 0.75,
  PULSE = 6;

type Band = 'hit' | 'rumble';
const BAND_NAMES: readonly Band[] = ['hit', 'rumble'];
const BANDS: Record<
  Band,
  { freq: number; decay: number; pos: Vec3; rot: Vec3 }
> = {
  hit: { freq: 16, decay: 1.8, pos: [0.5, 0.4, 0.3], rot: [2.2, 2.2, 4] },
  rumble: { freq: 4, decay: 0.8, pos: [0.6, 0.5, 0.4], rot: [1.4, 1.6, 3] },
};

interface Kick {
  right?: number;
  up?: number;
  back?: number;
  pitch?: number;
  yaw?: number;
  roll?: number;
  away?: number;
  tilt?: number;
}
interface Pulse {
  deg: number;
  attack: number;
  hold: number;
  release: number;
}
interface Answer {
  shake?: number;
  band?: Band;
  kick?: Kick;
  fov?: Pulse;
  falloff?: readonly [number, number];
}

export const CAMERA = {
  fire: { shake: 0.2, kick: { back: 0.5, pitch: 0.9, roll: 0.4 } },
  hit: {
    shake: 0.22,
    fov: { deg: -1.6, attack: 0.035, hold: 0.03, release: 0.22 },
  },
  shieldHit: {
    shake: 0.18,
    fov: { deg: -1.2, attack: 0.035, hold: 0.02, release: 0.2 },
  },
  shieldBreak: {
    shake: 0.42,
    kick: { pitch: 0.7, back: 0.3 },
    fov: { deg: -5, attack: 0.05, hold: 0.08, release: 0.42 },
  },
  shieldLost: {
    shake: 0.5,
    kick: { away: 0.7, tilt: 2.5 },
    fov: { deg: -2.5, attack: 0.04, hold: 0.05, release: 0.35 },
  },
  hurt: { shake: 0.38, kick: { away: 0.55, tilt: 2 } },
  sink: {
    shake: 0.45,
    fov: { deg: -6, attack: 0.08, hold: 0.25, release: 0.6 },
  },
  sunk: {
    shake: 0.6,
    band: 'rumble',
    fov: { deg: -6, attack: 0.1, hold: 0.4, release: 1.2 },
  },
  near: { shake: 0.3, band: 'rumble', falloff: [40, 220] },
  gust: {
    shake: 0.3,
    band: 'rumble',
    kick: { back: 1.4, up: 0.5, pitch: -0.6 },
    fov: { deg: 9, attack: 0.12, hold: 0.35, release: 0.7 },
  },
  repair: { fov: { deg: 1, attack: 0.1, hold: 0.1, release: 0.4 } },
  pickup: [
    {},
    {},
    { fov: { deg: -1, attack: 0.05, hold: 0.04, release: 0.25 } },
    {
      shake: 0.14,
      band: 'rumble',
      fov: { deg: -2, attack: 0.05, hold: 0.06, release: 0.35 },
    },
    {
      shake: 0.28,
      band: 'rumble',
      fov: { deg: -3.5, attack: 0.06, hold: 0.12, release: 0.5 },
    },
  ],
} as const satisfies Record<string, Answer | readonly Answer[]>;

const DEALT: Record<Blow, Answer> = {
  broke: CAMERA.shieldBreak,
  hull: CAMERA.hit,
  shield: CAMERA.shieldHit,
};

export function answerTo(
  d: Deed,
  me: number
): { answer: Answer; strength: number } | null {
  const by = d.kind === 'struck' || d.kind === 'sank' ? d.by : null;
  switch (d.kind) {
    case 'fired':
      return d.ship === me ? { answer: CAMERA.fire, strength: 1 } : null;
    case 'struck': {
      const points = d.shield + d.hull;
      if (by === me && d.ship !== me)
        return {
          answer: DEALT[blowOf(d)],
          strength: d.broke ? 1 : felt.dealt(points),
        };
      if (d.ship !== me || points <= 0) return null;
      return {
        answer: d.broke ? CAMERA.shieldLost : CAMERA.hurt,
        strength: d.broke ? 1 : felt.taken(points),
      };
    }
    case 'sank': {
      const answer =
        by === me && d.ship !== me
          ? CAMERA.sink
          : d.ship === me
            ? CAMERA.sunk
            : CAMERA.near;
      return { answer, strength: 1 };
    }
    case 'took':
      return d.ship === me
        ? { answer: CAMERA.pickup[rankOf(d.heal) + 1] ?? {}, strength: 1 }
        : null;
    case 'mended':
      return d.ship === me ? { answer: CAMERA.repair, strength: 1 } : null;
    case 'gust':
      return d.ship === me ? { answer: CAMERA.gust, strength: 1 } : null;
    default:
      return null;
  }
}

export function noise(x: number, seed: number): number {
  const slope = (i: number) => hash01(i, seed) * 2 - 1;
  const i = Math.floor(x),
    f = x - i,
    a = slope(i) * f,
    b = slope(i + 1) * (f - 1);
  return lerp(a, b, smoother(f)) * 2;
}

function spring(freq = 7, damping = 0.55) {
  let x = 0,
    v = 0;
  const w = 2 * Math.PI * freq,
    k = w * w,
    c = 2 * damping * w;
  const step = (dt: number) => {
    for (let left = Math.min(dt, 0.25); left > 1e-9; left -= 1 / 480) {
      const h = Math.min(1 / 480, left);
      v += (-k * x - c * v) * h;
      x += v * h;
    }
    return x;
  };
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

export function envelope(p: Pulse, age: number): number {
  if (age < p.attack) return 1 - Math.pow(2, (-10 * age) / p.attack);
  if (age < p.attack + p.hold) return 1;
  const t = Math.min(1, (age - p.attack - p.hold) / Math.max(1e-6, p.release));
  return 1 - easeInOut(t);
}

const DEG = Math.PI / 180;
const X: Vec3 = [1, 0, 0],
  Y: Vec3 = [0, 1, 0],
  Z: Vec3 = [0, 0, 1];
const about: Out4 = [0, 0, 0, 1];
const turned = (q: Turn, k: Vec3, a: number, out?: Out4): Turn =>
  multiply(q, axisAngle(k, a, about), out);
const shook = (
  f: number,
  axis: number,
  seed: number,
  band: Band,
  amount: number
) =>
  noise(f + axis * 17.3, seed + axis * 101 + (band === 'hit' ? 0 : 7)) * amount;

export function createShake(seed = 1) {
  const trauma: Record<Band, number> = { hit: 0, rumble: 0 };
  const springs = {
    x: spring(),
    y: spring(),
    z: spring(),
    pitch: spring(),
    yaw: spring(),
    roll: spring(),
  };
  const all = Object.values(springs),
    pulses: (Pulse & { age: number })[] = [];
  let t = 0;
  const o = { x: 0, y: 0, z: 0, pitch: 0, yaw: 0, roll: 0, fov: 0 };
  const shaken: Eye & { position: Out3; orientation: Out4 } = {
    kind: 'air',
    position: [0, 0, 0],
    orientation: [0, 0, 0, 1],
    fov: 0,
  };
  const axis: Out3 = [0, 0, 0];

  return {
    play(a: Answer, strength: number, bearing?: number, meters?: number) {
      let k = strength * GENTLE;
      if (a.falloff && meters !== undefined)
        k *= clamp((a.falloff[1] - meters) / (a.falloff[1] - a.falloff[0]));
      if (k <= 0) return;
      if (a.shake)
        trauma[a.band ?? 'hit'] = Math.min(
          1,
          trauma[a.band ?? 'hit'] + a.shake * k
        );
      if (a.kick) {
        const s = a.kick,
          side = bearing === undefined ? 0 : Math.sin(bearing),
          ahead = bearing === undefined ? 0 : Math.cos(bearing);
        springs.x.kick(((s.right ?? 0) - side * (s.away ?? 0)) * k);
        springs.y.kick((s.up ?? 0) * k);
        springs.z.kick(((s.back ?? 0) + ahead * (s.away ?? 0)) * k);
        springs.pitch.kick((s.pitch ?? 0) * k);
        springs.yaw.kick((s.yaw ?? 0) * k);
        springs.roll.kick(((s.roll ?? 0) - side * (s.tilt ?? 0)) * k);
      }
      if (a.fov)
        pulses.push({
          ...a.fov,
          deg: clamp(a.fov.deg * k, -PULSE, PULSE),
          age: 0,
        });
    },
    update(dt: number) {
      t += dt;
      o.x = o.y = o.z = o.pitch = o.yaw = o.roll = 0;
      for (const band of BAND_NAMES) {
        const tr = trauma[band];
        if (tr <= 0) continue;
        const b = BANDS[band],
          amount = tr * tr,
          f = t * b.freq;
        o.x += shook(f, 0, seed, band, amount) * b.pos[0];
        o.y += shook(f, 1, seed, band, amount) * b.pos[1];
        o.z += shook(f, 2, seed, band, amount) * b.pos[2];
        o.pitch += shook(f, 3, seed, band, amount) * b.rot[0];
        o.yaw += shook(f, 4, seed, band, amount) * b.rot[1];
        o.roll += shook(f, 5, seed, band, amount) * b.rot[2];
        trauma[band] = Math.max(0, tr - b.decay * dt);
      }
      o.x += springs.x.step(dt);
      o.y += springs.y.step(dt);
      o.z += springs.z.step(dt);
      o.pitch += springs.pitch.step(dt);
      o.yaw += springs.yaw.step(dt);
      o.roll += springs.roll.step(dt);
      o.fov = 0;
      let n = 0;
      for (const p of pulses) {
        o.fov += p.deg * envelope(p, (p.age += dt));
        if (p.age < p.attack + p.hold + p.release) pulses[n++] = p;
      }
      pulses.length = n;
    },
    on(eye: Eye): Eye {
      const q = eye.orientation,
        p = shaken.position,
        t = shaken.orientation;
      add(
        add(
          add(eye.position, rotate(X, q, axis), o.x, p),
          rotate(Y, q, axis),
          o.y,
          p
        ),
        rotate(Z, q, axis),
        o.z,
        p
      );
      turned(
        turned(turned(q, Y, o.yaw * DEG, t), X, o.pitch * DEG, t),
        Z,
        -o.roll * DEG,
        t
      );
      shaken.kind = eye.kind;
      shaken.fov = eye.fov + o.fov;
      return shaken;
    },
    offset: () => ({ ...o }),
    trauma: () => ({ ...trauma }),
    clear() {
      trauma.hit = trauma.rumble = 0;
      pulses.length = 0;
      for (const s of all) s.clear();
    },
  };
}

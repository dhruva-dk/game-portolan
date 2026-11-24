import {
  copyPose,
  poseOut,
  type PoseOut,
  type ShipPose,
} from '../../world/pose.ts';
import {
  add,
  cross,
  distance,
  dot,
  length,
  normalize,
  put,
  scale,
  type Out3,
  type Vec3,
} from '../../world/sphere.ts';
import { clamp, smoothstep } from '../../world/scalar.ts';
import { port } from './mount.ts';

const G = 9.81;
const EASE = 0.2;
const MOST_ACCEL = 20,
  MOST_SPINNING = 4;
const JUMP = 20;

export interface Motion {
  pose: PoseOut;
  velocity: Out3;
  accel: Out3;
  spin: Out3;
  spinning: Out3;
}

interface Feeling {
  weight: Vec3;
  spin: Vec3;
  spinning: Vec3;
}
export interface FeelingOut {
  weight: Out3;
  spin: Out3;
  spinning: Out3;
}

export const motionOut = (): Motion => ({
  pose: poseOut(),
  velocity: [0, 0, 0],
  accel: [0, 0, 0],
  spin: [0, 0, 0],
  spinning: [0, 0, 0],
});

const capped = (v: Vec3, most: number): Vec3 => {
  const l = length(v);
  return l > most ? scale(v, most / l, d) : v;
};
const ease = (from: Vec3, to: Vec3, dt: number, out: Out3): Vec3 =>
  add(from, add(to, from, -1, e), 1 - Math.exp(-dt / EASE), out);

const d: Out3 = [0, 0, 0],
  e: Out3 = [0, 0, 0],
  turned: Out3 = [0, 0, 0],
  pa: Out3 = [0, 0, 0],
  pb: Out3 = [0, 0, 0];
const velocity: Out3 = [0, 0, 0],
  spin: Out3 = [0, 0, 0];

export function moved(
  was: Motion | null,
  pose: ShipPose,
  dt: number,
  out: Motion = motionOut()
): Motion {
  if (!was || dt <= 0 || distance(was.pose.position, pose.position) > JUMP) {
    const v = was && dt <= 0 ? was.velocity : null;
    put(out.velocity, v ? v[0] : 0, v ? v[1] : 0, v ? v[2] : 0);
    put(out.accel, 0, 0, 0);
    put(out.spin, 0, 0, 0);
    put(out.spinning, 0, 0, 0);
    copyPose(pose, out.pose);
    return out;
  }
  const a = was.pose,
    b = pose;
  ease(
    was.velocity,
    scale(add(b.position, a.position, -1, d), 1 / dt, d),
    dt,
    velocity
  );
  ease(
    was.accel,
    capped(scale(add(velocity, was.velocity, -1, d), 1 / dt, d), MOST_ACCEL),
    dt,
    out.accel
  );
  add(cross(a.forward, b.forward, turned), cross(a.up, b.up, d), 1, turned);
  add(turned, cross(port(a, pa), port(b, pb), d), 1, turned);
  ease(was.spin, scale(turned, 1 / (2 * dt), turned), dt, spin);
  ease(
    was.spinning,
    capped(scale(add(spin, was.spin, -1, d), 1 / dt, d), MOST_SPINNING),
    dt,
    out.spinning
  );
  put(out.velocity, velocity[0], velocity[1], velocity[2]);
  put(out.spin, spin[0], spin[1], spin[2]);
  copyPose(pose, out.pose);
  return out;
}

const across: Out3 = [0, 0, 0];

export const inFrame = (pose: ShipPose, v: Vec3, out?: Out3): Vec3 =>
  put(out, dot(v, port(pose, across)), dot(v, pose.up), dot(v, pose.forward));

const weight: Out3 = [0, 0, 0];

export function feeling(m: Motion, out?: FeelingOut): Feeling {
  add(
    scale(normalize(m.pose.position, weight), -G, weight),
    m.accel,
    -1,
    weight
  );
  const w = inFrame(m.pose, weight, out?.weight),
    s = inFrame(m.pose, m.spin, out?.spin);
  const spinning = inFrame(m.pose, m.spinning, out?.spinning);
  return out ?? { weight: w, spin: s, spinning };
}

export const BRACED = 0.6;
const HAUL = 0.3;
export const WAY = 1.5;
const QUARTER = 0.8;
const STIR = 0.4;
const FILLS = 1.3;

const underWay = (speed: number): number => smoothstep(0, WAY, speed);

const side = (wind: Vec3, brace: number): number =>
  Math.abs(wind[0]) < 0.3 * Math.abs(wind[2]) && brace !== 0
    ? Math.sign(brace)
    : Math.sign(wind[0]) || 1;

export function trim(wind: Vec3, speed: number, brace: number): number {
  const sailing = side(wind, brace) * BRACED;
  const rest =
    wind[2] >= 0
      ? clamp(Math.atan2(wind[0], wind[2]), -BRACED, BRACED)
      : sailing;
  return rest + (sailing - rest) * underWay(speed);
}

export const hauled = (
  brace: number,
  wind: Vec3,
  speed: number,
  dt: number
): number =>
  brace + clamp(trim(wind, speed, brace) - brace, -HAUL * dt, HAUL * dt);

export function filling(
  wind: Vec3,
  speed: number,
  brace: number,
  out?: Out3
): Vec3 {
  const a = (brace / BRACED) * QUARTER,
    most = Math.hypot(length(wind), FILLS * speed);
  const gained = add(
    put(sailing, most * Math.sin(a), 0, most * Math.cos(a)),
    wind,
    -STIR,
    sailing
  );
  return add(scale(wind, STIR, out), gained, underWay(speed), out);
}
const sailing: Out3 = [0, 0, 0];

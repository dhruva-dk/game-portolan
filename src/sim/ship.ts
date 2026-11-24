import {
  add,
  cross,
  dot,
  length,
  normalize,
  scale,
  type Vec3,
} from '../world/sphere.ts';
import { GUST, SHIP, SPEC, type Handling } from './handling.ts';
import { navigate, type Depth } from './shoal.ts';

export interface ShipState {
  at: Vec3;
  heading: Vec3;
  speed: number;
  turn: number;
}

export interface Helm {
  course: Vec3 | null;
  throttle: number;
  gust?: boolean;
}

export function shipAt(at: Vec3, heading: Vec3): ShipState {
  const up = normalize(at);
  return {
    at: up,
    heading: normalize(add(heading, up, -dot(heading, up))),
    speed: 0,
    turn: 0,
  };
}

export function offCourse(s: ShipState, course: Vec3): number {
  const port = cross(s.at, s.heading);
  const ahead = dot(course, s.heading),
    across = dot(course, port);
  return ahead === 0 && across === 0 ? 0 : Math.atan2(across, ahead);
}

const bite = (speed: number) =>
  Math.min(
    1,
    SHIP.bite + ((1 - SHIP.bite) * speed) / (SHIP.fullBite * SHIP.top)
  );

const close = (rate: number, dt: number) => 1 - Math.exp(-rate * dt);

export function turned(s: ShipState, angle: number): Vec3 {
  return normalize(
    add(
      scale(s.heading, Math.cos(angle)),
      cross(s.at, s.heading),
      Math.sin(angle)
    )
  );
}

export function step(
  s: ShipState,
  helm: Helm,
  dt: number,
  depth: Depth,
  fit: Handling = SPEC
): ShipState {
  const rudder =
    helm.course && length(helm.course) > 0
      ? Math.max(-1, Math.min(1, SHIP.steer * offCourse(s, helm.course)))
      : 0;
  const turn =
    s.turn +
    (rudder * fit.turn * (helm.gust ? GUST.turn : 1) * bite(s.speed) - s.turn) *
      close(SHIP.answer, dt);
  const want = Math.max(0, Math.min(1, helm.throttle)) * fit.top;
  let speed: number;
  if (helm.gust)
    speed =
      s.speed +
      Math.max(
        -GUST.accel * dt,
        Math.min(GUST.accel * dt, want + GUST.speed - s.speed)
      );
  else if (s.speed > fit.top)
    speed = Math.max(fit.top, s.speed - GUST.shed * dt);
  else
    speed =
      s.speed +
      (want - s.speed) * close(want > s.speed ? fit.gather : SHIP.drag, dt);
  return navigate({ ...s, speed, turn }, turned(s, turn * dt), dt, depth);
}

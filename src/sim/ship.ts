// A ship under way: where she is on the sphere, which way her bow points, how fast she goes and turns, and one fixed
// step of all of it under a helm's orders. The same step for the player and for any ship a bot sails.
//
// The handling is the sea demo's (0117 src/sea/ship.ts), which felt eased rather than jumpy: way is gathered and lost
// exponentially (no reverse), the rudder bites harder the faster she goes, and her rate of turn follows the rudder
// with a lag. The helm is given a course, not a rudder: the rudder is set by how far she has still to turn, just
// short of critically damped against that lag, so she comes round onto the course without swinging past it.
//
// She moves along great circles (world/sphere.ts along), her heading carried with her, so the step is exact
// anywhere on the globe, the poles included. The shallows are shoal.ts's.
//
// Pure arithmetic: no three, so it runs in node for the tests; deterministic for the same inputs.

import { add, cross, dot, length, normalize, scale, type Vec3 } from '../world/sphere.ts';
import { SPEC, type Handling } from './fit.ts';
import { GUST, HOLDING, SHIP } from './handling.ts';
import { navigate, type Depth } from './shoal.ts';

/** One ship's state. */
export interface ShipState {
  /** Where she is: a unit vector from the planet's centre. */
  at: Vec3;
  /** Which way her bow points: a unit tangent at `at`. */
  heading: Vec3;
  /** Metres a second through the water. */
  speed: number;
  /** Radians a second, positive to port (anticlockwise seen from above). */
  turn: number;
}

/** What the helm asks. */
export interface Helm {
  /** The way to head (any vector; only its part along the surface counts), or null to leave the rudder amidships. */
  course: Vec3 | null;
  /** 0–1 of top speed. */
  throttle: number;
  /** Whether a gust fills her canvas this step (gust.ts; handling.ts GUST). */
  gust?: boolean;
  /** Whether she is in her own water this step (territory.ts; handling.ts HOLDING): her top speed is higher there. */
  home?: boolean;
  /** The share of her top the water and the wind let her make here (rule.ts: a reef's, a lee's), 1 if not given. */
  way?: number;
  /** The share of a gust's speed over her own it drives her here (rule.ts: the roots'), 1 if not given. */
  lift?: number;
}

/** A ship lying still at `at`, her bow along `heading` (made a unit tangent there). */
export function shipAt(at: Vec3, heading: Vec3): ShipState {
  const up = normalize(at);
  return { at: up, heading: normalize(add(heading, up, -dot(heading, up))), speed: 0, turn: 0 };
}

/** The angle from her heading to a course, radians, positive to port; 0 if the course has no part along the surface. */
export function offCourse(s: ShipState, course: Vec3): number {
  const port = cross(s.at, s.heading);
  const ahead = dot(course, s.heading), across = dot(course, port);
  return ahead === 0 && across === 0 ? 0 : Math.atan2(across, ahead);
}

/** How hard the rudder bites at a speed, 0–1, on a ship of top speed `top`. */
const bite = (speed: number, top: number) => Math.min(1, SHIP.bite + ((1 - SHIP.bite) * speed) / (SHIP.fullBite * top));

/** The share of a gap closed in dt at `rate` per second. */
const close = (rate: number, dt: number) => 1 - Math.exp(-rate * dt);

/** Her heading turned `angle` radians to port. */
export function turned(s: ShipState, angle: number): Vec3 {
  return normalize(add(scale(s.heading, Math.cos(angle)), cross(s.at, s.heading), Math.sin(angle)));
}

/** One step of dt seconds under `helm`, in water `depth` deep (metres at a point), by her own handling (fit.ts). */
export function step(s: ShipState, helm: Helm, dt: number, depth: Depth, fit: Handling = SPEC): ShipState {
  const rudder = helm.course && length(helm.course) > 0 ? Math.max(-1, Math.min(1, SHIP.steer * offCourse(s, helm.course))) : 0;
  const turn = s.turn + (rudder * fit.turn * (helm.gust ? GUST.turn : 1) * bite(s.speed, fit.top) - s.turn) * close(fit.answer, dt);
  const top = fit.top * (helm.home ? HOLDING.speed : 1) * (helm.way ?? 1);
  const want = Math.max(0, Math.min(1, helm.throttle)) * top;
  let speed: number;
  // a gust drives her on hard toward its speed over what she asks; after it, what she has over her top is shed at a rate
  if (helm.gust) speed = s.speed + Math.max(-GUST.accel * dt, Math.min(GUST.accel * dt, want + GUST.speed * (helm.lift ?? 1) - s.speed));
  else if (s.speed > top) speed = Math.max(top, s.speed - GUST.shed * dt);
  else speed = s.speed + (want - s.speed) * close(want > s.speed ? fit.gather : SHIP.drag, dt);
  return navigate({ ...s, speed, turn }, turned(s, turn * dt), dt, depth);
}

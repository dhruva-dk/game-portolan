import { CLOUD, toEdge, type Cap } from '../sim/storm.ts';
import { AIR_FOV, type Eye } from '../snapshot.ts';
import type { ShipPose } from '../world/pose.ts';
import { smoother } from '../world/scalar.ts';
import {
  R,
  add,
  arc,
  cross,
  distance,
  length,
  normalize,
  place,
  rotateAbout,
  scale,
  tangent,
  transport,
  type Out3,
  type Vec3,
} from '../world/sphere.ts';
import { lookAt, rotate, slerp, type Turn } from '../world/turn.ts';

export const BOOM = 60;
const FOCUS = 20,
  SHOULDER = 14;
export const PITCH = 0.43;
const HIGHEST = -0.12,
  STEEPEST = 1.0;
const TURN = 0.0056,
  TILT = 0.0046;
const ROOM = 1.5,
  LEAST = 0.15,
  STEPS = 0.05,
  IN = 6,
  OUT = 0.8;
const CLEAR = 1.5;
const SIGHT = 8;

export interface Shot {
  boom?: number;
  spin?: number;
  tilt?: number;
}

export function createChase(
  ground: (p: Vec3) => number,
  sea: (p: Vec3, time: number) => number
) {
  let position: Vec3 = [0, 0, 0],
    orientation: Turn = [0, 0, 0, 1];
  let at: Vec3 = [0, 1, 0],
    facing: Vec3 = [0, 0, -1];
  let pitch = PITCH;
  let out = 1;
  let flight: {
    from: Vec3;
    look: Turn;
    aim: Vec3;
    span: number;
    done: number;
  } | null = null;
  let spin = 0;
  let storm: Cap | null = null;

  const clouded = (eye: Vec3) =>
    !!storm &&
    storm.radius < Math.PI &&
    length(eye) - R > CLOUD.lowest &&
    toEdge(eye, storm) < CLOUD.out;

  const view = () => rotateAbout(facing, at, spin);

  const gap: Out3 = [0, 0, 0],
    point: Out3 = [0, 0, 0],
    under: Out3 = [0, 0, 0];
  const blocked = (a: Vec3, b: Vec3) => {
    const d = add(b, a, -1, gap);
    for (let i = 1; i <= SIGHT; i++) {
      const p = add(a, d, i / SIGHT, point);
      if (ground(normalize(p, under)) + ROOM > length(p) - R) return true;
    }
    return false;
  };
  const seeing: Eye = { kind: 'air', position, orientation, fov: AIR_FOV };

  function put(
    time: number,
    dt: number,
    rate: (drawing: boolean) => number,
    shot: Shot
  ) {
    const ahead = view(),
      right = cross(ahead, at),
      tilt = Math.min(STEEPEST, pitch + (shot.tilt ?? 0));
    const dir = normalize(
      add(scale(ahead, Math.cos(tilt)), at, -Math.sin(tilt))
    );
    const deck = place(at, FOCUS),
      boom = shot.boom ?? BOOM;
    const eyeAt = (k: number) =>
      add(add(deck, right, SHOULDER * k), dir, -boom * k);
    const clear = (k: number) => {
      const eye = eyeAt(k),
        under = normalize(eye);
      return (
        length(eye) - R > Math.max(ground(under), sea(under, time)) + CLEAR &&
        !clouded(eye) &&
        !blocked(deck, add(deck, right, SHOULDER * k)) &&
        !blocked(add(deck, right, SHOULDER * k), eye)
      );
    };
    let need = 1;
    while (need > LEAST && !clear(need)) need -= STEPS;
    out += (need - out) * (1 - Math.exp(-rate(need < out) * dt));
    position = eyeAt(out);
    orientation = lookAt(position, add(position, dir), normalize(position));
    if (flight) fly(dt);
  }

  function fly(dt: number) {
    const f = flight!;
    f.done = Math.min(1, f.done + dt / f.span);
    const s = smoother(f.done),
      to = position,
      r0 = length(f.from),
      r1 = length(to);
    const dir = arc(scale(f.from, 1 / r0), scale(to, 1 / r1), s),
      angle = distance(f.from, to) / R;
    const lift = Math.sin(s * Math.PI) * Math.min(angle * R * 0.5, 600);
    position = scale(
      dir,
      Math.exp(Math.log(r0) * (1 - s) + Math.log(r1) * s) + lift
    );
    const base = slerp(f.look, orientation, s),
      deck = place(at, FOCUS),
      r = length(f.aim);
    const between = scale(
      normalize(add(scale(f.aim, (1 - s) / r), deck, s / length(deck))),
      r + (length(deck) - r) * s
    );
    const up = normalize(
      add(rotate([0, 1, 0], base), rotate([0, 0, -1], base))
    );
    orientation = slerp(
      base,
      lookAt(position, between, up),
      Math.sin(Math.PI * s)
    );
    if (f.done >= 1) flight = null;
  }

  const level = (pose: ShipPose) => normalize(pose.position);

  return {
    reset(pose: ShipPose, time: number, shot: Shot = {}) {
      at = level(pose);
      facing = normalize(tangent(pose.forward, at));
      pitch = PITCH;
      out = 1;
      flight = null;
      spin = shot.spin ?? 0;
      storm = null;
      put(time, 1, () => Infinity, shot);
    },
    fly(seconds = 1.6) {
      flight = {
        from: position,
        look: orientation,
        aim: place(at, FOCUS),
        span: seconds,
        done: 0,
      };
    },
    update(
      pose: ShipPose,
      look: { x: number; y: number },
      dt: number,
      time: number,
      calm: Cap | null,
      shot: Shot = {}
    ) {
      storm = calm;
      const up = level(pose);
      facing = transport(facing, at, up);
      at = up;
      facing = normalize(tangent(facing, at));
      facing = rotateAbout(facing, at, -look.x * TURN);
      pitch = Math.min(STEEPEST, Math.max(HIGHEST, pitch + look.y * TILT));
      spin = shot.spin ?? 0;
      put(time, dt, (drawing) => (drawing ? IN : OUT), shot);
    },
    axes(): { ahead: Vec3; right: Vec3 } {
      const ahead = view();
      return { ahead, right: cross(ahead, at) };
    },
    eye(): Eye {
      seeing.position = position;
      seeing.orientation = orientation;
      return seeing;
    },
    sight: () => ({ from: position, dir: rotate([0, 0, -1], orientation) }),
  };
}

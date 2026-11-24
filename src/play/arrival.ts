import type { Eye } from '../snapshot.ts';
import type { ShipPose } from '../world/pose.ts';
import { clamp, smoother } from '../world/scalar.ts';
import { R, add, arc, length, normalize, scale } from '../world/sphere.ts';
import { lookAt, slerp } from '../world/turn.ts';

export const ARRIVAL = {
  seconds: 2.8,
  height: 1250,
  fov: 40,
  air: 200,
  onto: 0.6,
} as const;

export function arriving(t: number, ship: ShipPose, chase: Eye): Eye | null {
  if (t >= ARRIVAL.seconds) return null;
  const s = smoother(clamp(t / ARRIVAL.seconds));
  const from = normalize(ship.position),
    to = normalize(chase.position);
  const r0 = Math.log(R + ARRIVAL.height),
    r1 = Math.log(length(chase.position)),
    r = r0 + (r1 - r0) * s;
  const position = scale(arc(from, to, s), Math.exp(r));
  const air = clamp(
      (Math.log(R + ARRIVAL.air) - r) / (Math.log(R + ARRIVAL.air) - r1)
    ),
    turn = smoother(air);
  const up = normalize(
    add(scale(ship.forward, 1 - turn), normalize(position), turn)
  );
  const onto = smoother(clamp((air - ARRIVAL.onto) / (1 - ARRIVAL.onto)));
  return {
    kind: Math.exp(r) - R > ARRIVAL.air ? 'space' : 'air',
    position,
    orientation: slerp(
      lookAt(position, ship.position, up),
      chase.orientation,
      onto
    ),
    fov: ARRIVAL.fov + (chase.fov - ARRIVAL.fov) * turn,
  };
}

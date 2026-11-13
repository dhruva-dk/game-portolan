// The eye's arrival at a match's start: from space straight over her berth, the whole planet in view, down to the chase
// eye behind her (chase.ts) in ARRIVAL.seconds; her hands are on her ship once it is there (game.ts).
//
// It comes down along the line from the planet's centre through her, its distance from the centre eased in and out
// and shrinking by equal ratios (so the sea comes up steadily, neither rushing at the end nor crawling), and looks
// straight down at her, her bow up the screen, with the space eye's narrow lens. Only once it is down to `air` metres
// does it become an eye in the air: there, looking straight down, the planet's limb is out of the picture (so the dark
// past it never turns to sky), the clouds are a kilometre and more over it (so none appear), and all the air it looks
// through is the low air the space eye hazes too. Then, the rest of the way, it turns from looking down at her to the
// chase eye's own turn and widens to its lens, ending on the chase eye exactly.

import type { Eye } from '../snapshot';
import type { ShipPose } from '../world/pose';
import { R, add, dot, length, normalize, scale, type Vec3 } from '../world/sphere';
import { lookAt, slerp } from '../world/turn';

export const ARRIVAL = {
  /** Seconds from space to the chase eye. */
  seconds: 2.8,
  /** Where it starts, metres over her (from there the planet fills the view), and its lens's field, degrees. */
  height: 1250, fov: 40,
  /** Below this height over the sea, metres, it is an eye in the air (see above). */
  air: 200,
} as const;

/** Smoother step (chase.ts's). */
const smoother = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);
const clamp = (x: number) => Math.min(1, Math.max(0, x));

/** The point `f` of the way along the great circle from unit vector a to unit vector b. */
function arc(a: Vec3, b: Vec3, f: number): Vec3 {
  const c = Math.min(1, Math.max(-1, dot(a, b))), angle = Math.acos(c);
  if (angle < 1e-6) return b;
  return normalize(add(scale(a, Math.sin((1 - f) * angle)), b, Math.sin(f * angle)));
}

/** The eye `t` seconds into the arrival, coming down onto her (her pose as drawn) to `chase`, the chase eye now; null
 *  once it is there. */
export function arriving(t: number, her: ShipPose, chase: Eye): Eye | null {
  if (t >= ARRIVAL.seconds) return null;
  const s = smoother(clamp(t / ARRIVAL.seconds));
  const up = normalize(her.position), to = normalize(chase.position);
  const r0 = Math.log(R + ARRIVAL.height), r1 = Math.log(length(chase.position)), r = r0 + (r1 - r0) * s;
  const position = scale(arc(up, to, s), Math.exp(r));
  // looking straight down at her until it is in the air; from there turning to the chase eye's turn
  const turn = smoother(clamp((Math.log(R + ARRIVAL.air) - r) / (Math.log(R + ARRIVAL.air) - r1)));
  const down = lookAt(position, her.position, her.forward);
  return {
    kind: Math.exp(r) - R > ARRIVAL.air ? 'space' : 'air',
    position,
    orientation: slerp(down, chase.orientation, turn),
    fov: ARRIVAL.fov + (chase.fov - ARRIVAL.fov) * turn,
  };
}

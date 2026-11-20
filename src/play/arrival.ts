// The eye's arrival at a match's start: from space straight over her berth, the
// whole planet in view, down to the chase eye behind her (chase.ts) in
// ARRIVAL.seconds; her hands are on her ship once it is there (game.ts).
//
// It comes down along the line from the planet's centre through her, its
// distance from the centre eased in and out and shrinking by equal ratios (so
// the sea comes up steadily, neither rushing at the end nor crawling), and
// looks straight down at her, her bow up the screen, with the space eye's
// narrow lens. Only once it is down to `air` metres does it become an eye in
// the air: there, looking straight down, the planet's limb is out of the
// picture (so the dark past it never turns to sky), the clouds are a kilometre
// and more over it (so none appear), and all the air it looks through is the
// low air the space eye hazes too. Then, the rest of the way, still looking at
// her, it comes round from her bow up the screen to the sky's up and widens to
// the chase eye's lens, and at the last turns onto the chase eye's own turn,
// ending on the chase eye exactly.

import type { Eye } from '../snapshot.ts';
import type { ShipPose } from '../world/pose.ts';
import { clamp, smoother } from '../world/scalar.ts';
import { R, add, arc, length, normalize, scale } from '../world/sphere.ts';
import { lookAt, slerp } from '../world/turn.ts';

export const ARRIVAL = {
  /** Seconds from space to the chase eye. */
  seconds: 2.8,
  /**
   * Where it starts, metres over her (from there the planet fills the view),
   * and its lens's field, degrees.
   */
  height: 1250,
  fov: 40,
  /**
   * Below this height over the sea, metres, it is an eye in the air (see
   * above).
   */
  air: 200,
  /**
   * How far through the rest of the way down (by its ratio of distances) it
   * begins to turn onto the chase eye's own.
   */
  onto: 0.6,
} as const;

/**
 * The eye `t` seconds into the arrival, coming down onto her (her pose as
 * drawn) to `chase`, the chase eye now; null once it is there.
 */
export function arriving(t: number, her: ShipPose, chase: Eye): Eye | null {
  if (t >= ARRIVAL.seconds) return null;
  const s = smoother(clamp(t / ARRIVAL.seconds));
  const from = normalize(her.position),
    to = normalize(chase.position);
  const r0 = Math.log(R + ARRIVAL.height),
    r1 = Math.log(length(chase.position)),
    r = r0 + (r1 - r0) * s;
  const position = scale(arc(from, to, s), Math.exp(r));
  // looking at her all the way, her bow up the screen until it is in the air,
  // then the sky's up; the last of the way onto the chase eye's own turn (which
  // looks a little past her)
  const air = clamp(
      (Math.log(R + ARRIVAL.air) - r) / (Math.log(R + ARRIVAL.air) - r1)
    ),
    turn = smoother(air);
  const up = normalize(
    add(scale(her.forward, 1 - turn), normalize(position), turn)
  );
  const onto = smoother(clamp((air - ARRIVAL.onto) / (1 - ARRIVAL.onto)));
  return {
    kind: Math.exp(r) - R > ARRIVAL.air ? 'space' : 'air',
    position,
    orientation: slerp(
      lookAt(position, her.position, up),
      chase.orientation,
      onto
    ),
    fov: ARRIVAL.fov + (chase.fov - ARRIVAL.fov) * turn,
  };
}

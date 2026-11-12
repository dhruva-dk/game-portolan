// The chase camera's shots for the match's turns (play/chase.ts takes them): high behind the fleet's middle on the
// Gale (0117 app.ts galeCamera: RIDE), coming down onto her as she leaves it (DIVE), lengthened and tipped down to keep
// the sea in view while she glides (0117 matchFrame), and on a win drawn back and circling her (0117 app.ts victory:
// 0.22 rad/s, 9 m on its 36 m boom, eased in at 1.5/s).

import { GALE, fleetAt, type Drop, type Flyer } from '../sim/drop';
import type { ShipPose } from '../world/pose';
import { R, add, normalize, scale } from '../world/sphere';
import { BOOM, ELEVATION, type Shot } from './chase';

/** The camera on the Gale (0117 screens/gale.ts RIDE): the boom's steepness, radians, and length, metres (0117: 80 on
 *  its 36 m chase boom; here stretched as the fleet is, its seats five times as far apart, to keep it in view). */
const RIDE = { elevation: 1.05, boom: 150 } as const;
/** Coming down with her as she leaves the Gale, seconds (0117 DIVE: descent 1.4 + settle 1.4); and as she glides, the
 *  boom lengthened this much a metre of height, and tipped down to keep the sea in view (0117 app.ts matchFrame). */
const DIVE = 2.8, HIGH = 0.08;
/** The win (0117 app.ts): the boom drawn back by a quarter (9 m on 36) and turning about her, rad/s, eased in at EASE/s. */
const WIN = { back: BOOM * (9 / 36), turn: 0.22, ease: 1.5 } as const;

/** A ship in the drop as drawn: level, nosed down as she falls. */
export const flown = (f: Flyer): ShipPose => {
  const up = normalize(f.at), nose = Math.atan2(f.climb, f.speed) * 0.5, c = Math.cos(nose), s = Math.sin(nose);
  return { position: scale(up, R + f.height), forward: add(scale(f.heading, c), up, s), up: add(scale(up, c), f.heading, -s) };
};

/** What a shot is taken of: the ship followed, as drawn; the drop and her own flyer in it, if the camera is on her
 *  while she flies; whether it circles her (the win); and the fleet's size, for its middle. */
export interface Subject { pose: ShipPose; drop: Drop | null; flyer: Flyer | null; circle: boolean; ships: number }

export function createShots() {
  /** How far drawn back for a win, its turn about her, and the seconds since she left the Gale (null: not yet). */
  let pull = 0, spun = 0, left: number | null = null;
  return {
    /** A new match. */
    reset() {
      pull = spun = 0;
      left = null;
    },
    /** The pose to follow and the shot, for a frame of dt seconds. */
    take(s: Subject, dt: number): { pose: ShipPose; shot: Shot } {
      const her = s.pose;
      pull += ((s.circle ? 1 : 0) - pull) * (1 - Math.exp(-dt * WIN.ease));
      spun += dt * WIN.turn * pull;
      const height = Math.max(0, Math.hypot(...her.position) - R), dip = Math.acos(R / (R + height));
      const shot: Shot = {
        height, boom: BOOM + height * HIGH + WIN.back * pull, spin: spun,
        elevation: Math.max(ELEVATION, Math.min(RIDE.elevation, dip * 0.9 + 0.1)),
      };
      const { drop, flyer: f } = s;
      if (!drop || (!f && left === null)) return { pose: her, shot };
      // on the Gale, and the dive's first seconds: from over the fleet's middle down onto her
      left = f?.stage === 'gale' ? null : (left ?? 0) + dt;
      const x = Math.min(1, (left ?? 0) / DIVE), k = x * x * (3 - 2 * x), mix = (a: number, b: number) => a + (b - a) * k;
      if (k >= 1) return { pose: her, shot };
      const mid = fleetAt(drop.gale, drop.t, s.ships), up = normalize(her.position);
      const at = normalize(add(scale(mid.at, 1 - k), up, k)), heading = normalize(add(scale(mid.heading, 1 - k), her.forward, k));
      return {
        pose: { position: scale(at, R + mix(GALE.height, height)), forward: heading, up: at },
        shot: { ...shot, height: mix(GALE.height, height), boom: mix(RIDE.boom, shot.boom!), elevation: mix(RIDE.elevation, shot.elevation!) },
      };
    },
  };
}

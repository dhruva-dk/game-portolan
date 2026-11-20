// The camera's shot at her end of the match (play/chase.ts takes it as a Shot),
// held on her ship whatever she does:
//   sunk  her ship going down (sinking.ts): the boom drawn slowly back and up, the look tilted down onto her, and
//         turning a little about her, so the sea she fought on opens round the wreck
//   won   her ship sailing on: drawn back and circling her (0.22 rad/s about her)
// Each eases in over `rise` seconds and then holds its distance, still turning.
// The beat is how long it is shown on the live world before the screens lay her
// result over it (ui/flow.ts; the referee reports it: play/referee.ts).

import { smoother, smootherIntegral } from '../world/scalar.ts';
import { BOOM, type Shot } from './chase.ts';

export type Ending = 'sunk' | 'won';

export const FINALE = {
  /**
   * back: metres the boom is drawn back; tilt: radians the look is tilted
   * further down; turn: radians a second it turns about her once eased in;
   * rise: seconds it eases in over; beat: seconds before her result is laid
   * over it.
   */
  sunk: { back: 30, tilt: 0.32, turn: 0.1, rise: 3.2, beat: 2.6 },
  won: { back: 22, tilt: 0.12, turn: 0.22, rise: 2.4, beat: 2.4 },
} as const;

/** The shot `seconds` after her end (none while she fights: `end` null). */
export function finale(end: Ending | null, seconds: number): Shot {
  if (!end) return {};
  const f = FINALE[end],
    t = Math.max(0, seconds),
    u = Math.min(1, t / f.rise);
  // turning as it eases in, so it never jerks: the turn's rate is the ease's,
  // its angle that rate's integral
  const spin = f.turn * (u < 1 ? f.rise * smootherIntegral(u) : t - f.rise / 2);
  return {
    boom: BOOM + f.back * smoother(u),
    tilt: f.tilt * smoother(u),
    spin,
  };
}

// Utility scoring: how a captain picks what to do next. After the Infinite Axis Utility System (Mark and Lewis,
// "Building a Better Centaur: AI at Massive Scale", GDC 2015; Mark, "Behavioral Mathematics for Game AI", 2009) and
// dual-utility reasoning (Dill, "Dual-Utility Reasoning", Game AI Pro 2, 2015):
// - every option a captain could take is scored from 0 to 1 by multiplying its considerations, each one input
//   normalised to 0..1 (how near the Storm's edge is, how hurt she is, how good the loot) and put through a response
//   curve that says how the option should feel about it;
// - a product of many factors under 1 drags down an option that simply has more of them to weigh, so each factor's
//   shortfall is partly made up, by Mark's compensation factor (1 - 1/n of it, scaled by the factor itself);
// - each option carries a weight, its rank: getting out of the Storm outranks any loot, however good;
// - the option already in hand is scored up by its momentum, so a captain commits to it instead of flickering
//   between two options scored nearly alike;
// - and the choice is made as dual utility makes it: the options within a band of the best are all good enough, a
//   captain in the middle of one of them carries on with it, and otherwise it picks among them weighted by score.
//   The band widens as skill falls: a green captain is slower to see that something better has come along, and
//   sometimes takes a worse option outright. The quality of its decisions scales with skill, as the plan asks.
// Everything here is plain arithmetic on the sim's own deterministic exp, so a match replays exactly.
import { dexp, rngFloat, type Rng } from '../math.ts';

export const unit = (x: number): number => (x <= 0 ? 0 : x >= 1 ? 1 : x);

/** A ramp: 0 at `lo`, 1 at `hi` and straight between (falling, when lo > hi). */
export const ramp = (x: number, lo: number, hi: number): number => unit((x - lo) / (hi - lo));

/** A smooth ramp: as ramp, easing in and out of its ends. */
export const ease = (x: number, lo: number, hi: number): number => {
  const t = ramp(x, lo, hi);
  return t * t * (3 - 2 * t);
};

/** The logistic: 1/2 at `mid`, rising by about three quarters of its range over `width` either side. */
export const logistic = (x: number, mid: number, width: number): number => 1 / (1 + dexp((-2 * (x - mid)) / width));

/** x to a whole power: a curve that stays low until x is near 1 (k > 1), held by the sim's own arithmetic. */
export const power = (x: number, k: number): number => {
  let p = 1;
  const u = unit(x);
  for (let n = 0; n < k; n++) p *= u;
  return p;
};

/** Considerations, multiplied and made up for their number (the compensation factor). */
export function utility(...factors: number[]): number {
  const n = factors.length;
  if (n === 0) return 0;
  const make = 1 - 1 / n;
  let p = 1;
  for (const f of factors) {
    const s = unit(f);
    if (s === 0) return 0;
    p *= s + (1 - s) * make * s;
  }
  return p;
}

/** One way to spend the next few seconds, as a captain weighs it. */
export interface Option<C> {
  readonly name: string;
  /** Its rank: what its score is multiplied by. */
  readonly weight: number;
  /** How much the option wants doing now, 0..1. */
  score(ctx: C): number;
}

export const REASON = {
  /** How much the option in hand is scored up by: `fresh` just after it was taken up, easing to `held` over `settle`
   *  seconds. A choice just made is given time to show what it's worth before a near rival can unseat it (Halo 2's
   *  behaviours had the same persistence). */
  momentum: { fresh: 1.45, held: 1.12, settle: 3 },
  /** The band below the best within which an option is good enough: this share for the greenest captain, none for the
   *  sharpest. */
  band: 0.22,
} as const;

/**
 * Scores every option into `scores` (weighted, momentum included) and picks one: the one in hand if it is still good
 * enough, else one of the good enough ones by weighted chance. Options marked in `struck` are passed over. -1 when
 * nothing scores at all.
 */
/** The momentum of an option taken up `since` seconds ago. */
export const momentum = (since: number): number => {
  const m = REASON.momentum;
  return m.held + (m.fresh - m.held) * ramp(since, m.settle, 0);
};

export function choose<C>(
  options: readonly Option<C>[], ctx: C, current: number, skill: number, rng: Rng, scores: Float64Array, struck?: Uint8Array,
  held: number = REASON.momentum.held,
): number {
  let best = 0;
  for (let k = 0; k < options.length; k++) {
    const o = options[k];
    if (struck?.[k]) {
      scores[k] = 0;
      continue;
    }
    let s = o.weight * o.score(ctx);
    if (k === current) s *= held;
    scores[k] = s;
    if (s > best) best = s;
  }
  if (best <= 0) return -1;
  const floor = best * (1 - REASON.band * (1 - unit(skill)));
  if (current >= 0 && scores[current] >= floor) return current;
  let total = 0;
  for (let k = 0; k < options.length; k++) if (scores[k] >= floor) total += scores[k];
  let pick = rngFloat(rng) * total;
  for (let k = 0; k < options.length; k++) {
    if (scores[k] < floor) continue;
    pick -= scores[k];
    if (pick <= 0) return k;
  }
  for (let k = options.length - 1; k >= 0; k--) if (scores[k] >= floor) return k;
  return -1;
}

// Utility scoring: how a bot picks what to do next, after the Infinite Axis Utility System (Mark and Lewis, "Building
// a Better Centaur: AI at Massive Scale", GDC 2015; Mark, "Behavioral Mathematics for Game AI", 2009) and dual-utility
// reasoning (Dill, "Dual-Utility Reasoning", Game AI Pro 2, 2015):
// - every option is scored from 0 to 1 by multiplying its considerations, each one input normalised to 0..1 and put
//   through a response curve that says how the option should feel about it;
// - a product of many factors under 1 drags down an option that simply has more of them to weigh, so each factor's
//   shortfall is partly made up, by Mark's compensation factor (1 - 1/n of it, scaled by the factor itself);
// - each option carries a weight, its rank;
// - the option already in hand is scored up by its momentum, so a bot commits to it instead of flickering between two
//   options scored nearly alike;
// - and the choice is made as dual utility makes it: the options within a band of the best are all good enough, a bot
//   in the middle of one of them carries on with it, and otherwise it picks among them weighted by score. The band
//   widens as skill falls: a green captain is slower to see that something better has come along.
//
// Pure arithmetic: no three, so it runs in node for the tests; deterministic for the same inputs and draws.

import { clamp } from '../world/scalar.ts';

/** A ramp: 0 at `lo`, 1 at `hi` and straight between (falling, when lo > hi). */
export const ramp = (x: number, lo: number, hi: number): number => clamp((x - lo) / (hi - lo));

/** The logistic: 1/2 at `mid`, rising by about three quarters of its range over `width` either side. */
export const logistic = (x: number, mid: number, width: number): number => 1 / (1 + Math.exp((-2 * (x - mid)) / width));

/** Considerations, multiplied and made up for their number (the compensation factor). */
export function utility(...factors: number[]): number {
  const n = factors.length;
  if (n === 0) return 0;
  const make = 1 - 1 / n;
  let p = 1;
  for (const f of factors) {
    const s = clamp(f);
    if (s === 0) return 0;
    p *= s + (1 - s) * make * s;
  }
  return p;
}

/** One way to spend the next few seconds, as a bot weighs it. */
export interface Option<C> {
  readonly name: string;
  /** Its rank: what its score is multiplied by. */
  readonly weight: number;
  /** How much the option wants doing now, 0..1. */
  score(ctx: C): number;
}

export const REASON = {
  /** How much the option in hand is scored up by: `fresh` just after it was taken up, easing to `held` over `settle`
   *  seconds, so a choice just made is given time to show what it's worth before a near rival can unseat it. */
  momentum: { fresh: 1.45, held: 1.12, settle: 3 },
  /** The band below the best within which an option is good enough: this share for the greenest bot, none for the
   *  sharpest. */
  band: 0.22,
} as const;

/** The momentum of an option taken up `since` seconds ago. */
export const momentum = (since: number): number => {
  const m = REASON.momentum;
  return m.held + (m.fresh - m.held) * ramp(since, m.settle, 0);
};

/**
 * Scores every option and picks one: the one in hand (`current`, scored up by `held`) if it is still good enough, else
 * one of the good enough ones by weighted chance (`roll`, 0..1). -1 when nothing scores at all.
 */
export function choose<C>(
  options: readonly Option<C>[], ctx: C, current: number, skill: number, roll: () => number, held: number = REASON.momentum.held
): number {
  const scores = options.map((o, k) => o.weight * o.score(ctx) * (k === current ? held : 1));
  const best = Math.max(0, ...scores);
  if (best <= 0) return -1;
  const floor = best * (1 - REASON.band * (1 - clamp(skill)));
  if (current >= 0 && scores[current] >= floor) return current;
  let total = 0;
  for (const s of scores) if (s >= floor) total += s;
  let pick = roll() * total;
  for (let k = 0; k < options.length; k++) {
    if (scores[k] < floor) continue;
    pick -= scores[k];
    if (pick <= 0) return k;
  }
  for (let k = options.length - 1; k >= 0; k--) if (scores[k] >= floor) return k;
  return -1;
}

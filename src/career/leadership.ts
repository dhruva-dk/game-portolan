// What a rival manager's and a chairman's stats do, as pure functions the rivals and
// the chairmen call. A stat's u is stat / 20. Politics is read where sway is summed.

import type { Rand } from './dice.ts';
import { unit } from './roles.ts';
import { TUNING } from './tuning.ts';

export const lin = (pair: readonly [number, number], u: number): number =>
  pair[0] + pair[1] * u;
const M = TUNING.manager,
  E = TUNING.chairman;

// ---- the manager -----------------------------------------------------------------------------------------------

/** Negotiation: a rival's opening bid as a share of the person's ask. */
export const bidShare = (negotiation: number): number =>
  lin(M.negotiation, unit(negotiation));

/** Talent Eye: a candidate's worth to a rival, weighing potential over stars. */
export const worth = (
  talentEye: number,
  stars: number,
  potential: number
): number => {
  const w = lin(M.talentEye, unit(talentEye));
  return (1 - w) * stars + w * potential;
};

/** Finance: the balance a rival will commit, of what it holds above its debt floor. */
export const commitment = (
  finance: number,
  balance: number,
  floor: number
): number => Math.max(0, balance - floor) * lin(M.finance, unit(finance));

/** Development: the improvement's split by the parts' need (each ≥ 0): sharper toward the neediest the higher it is. */
export function improvementSplit(
  development: number,
  needs: readonly number[]
): number[] {
  const k = lin(M.development, unit(development));
  const w = needs.map((n) => Math.pow(Math.max(0, n), k));
  const total = w.reduce((a, b) => a + b, 0);
  return total === 0
    ? needs.map(() => 1 / Math.max(1, needs.length))
    : w.map((x) => x / total);
}

/** Tactics: whether the race plan takes its best choice, on a draw. */
export const tacticsHolds = (tactics: number, rand: Rand): boolean =>
  rand() < lin(M.tactics, unit(tactics));

/** Politics: a rival's sway in a vote, from their reputation. */
export const sway = (politics: number, reputation: number): number =>
  reputation * unit(politics);

// ---- the chairman -------------------------------------------------------------------------------------------------

/** Ambition: the target place from the expected place (1 best), moved up. */
export const targetPlace = (ambition: number, expected: number): number =>
  Math.max(1, expected - Math.round(E.ambition * unit(ambition)));

/** Patience: confidence's move after a race from the target and the standing (places, 1 best), `sailed` races into
 *  the season. At or above the target it rises; within `slack` places behind it holds; further behind it falls, scaled
 *  by 1.3 − 0.6u (the patient fall less). Early standings say little, so the move grows to full over `settle` races:
 *  only a run of poor races, not one, brings confidence down. */
export function confidenceMove(
  patience: number,
  target: number,
  standing: number,
  sailed: number
): number {
  const weight = Math.min(1, Math.max(1, sailed) / E.settle);
  const behind = standing - target;
  if (behind <= 0)
    return Math.min(E.rise, E.met + E.perPlace * -behind) * weight;
  if (behind <= E.slack) return 0;
  return (
    Math.max(E.fall, -E.perPlace * (behind - E.slack)) *
    lin(E.patience, unit(patience)) *
    weight
  );
}

/** Confidence at a season's start: moved part of the way back toward the start's (a poor season is remembered, so a
 *  second one costs more than the first). */
export const confidenceCarried = (confidence: number, start: number): number =>
  confidence + (start - confidence) * E.recover;

/** Confidence's move a race for the team's balance: below zero, and past the debt floor. */
export const debtMove = (balance: number, floor: number): number =>
  balance < floor ? E.pastFloor : balance < 0 ? E.debt : 0;

/** Generosity: money the chairman adds at the season's start. */
export const endowment = (generosity: number, budget: number): number =>
  E.generosity * unit(generosity) * budget;

/** Generosity: the debt floor (a negative balance). */
export const debtFloor = (generosity: number, budget: number): number =>
  -lin(E.floor, unit(generosity)) * budget;

/** Meddling: the chance a chairman's dilemma is the one drawn, when one qualifies. */
export const meddleChance = (meddling: number): number =>
  lin(E.meddling, unit(meddling));

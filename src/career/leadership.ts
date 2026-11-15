// What a rival manager's and an elder's stats do (Phase B sections 2.1, 6 and 7), as pure functions the rivals and
// the elders call. A stat's u is stat / 20. Politics is read where sway is summed (Phase B section 11).

import type { Rand } from './dice.ts';
import { unit } from './roles.ts';
import { TUNING } from './tuning.ts';

const lin = (pair: readonly [number, number], u: number): number => pair[0] + pair[1] * u;
const M = TUNING.manager, E = TUNING.elder;

// ---- the manager -----------------------------------------------------------------------------------------------

/** Negotiation: a rival's opening bid as a share of the gull's ask. */
export const bidShare = (negotiation: number): number => lin(M.negotiation, unit(negotiation));

/** Talent Eye: a candidate's worth to a rival, weighing potential over stars. */
export const worth = (talentEye: number, stars: number, potential: number): number => {
  const w = lin(M.talentEye, unit(talentEye));
  return (1 - w) * stars + w * potential;
};

/** Finance: the coin a rival will commit, of what it holds above its debt floor. */
export const commitment = (finance: number, coin: number, floor: number): number =>
  Math.max(0, coin - floor) * lin(M.finance, unit(finance));

/** Development: the yard's split by the parts' need (each ≥ 0): sharper toward the neediest the higher it is. */
export function yardSplit(development: number, needs: readonly number[]): number[] {
  const k = lin(M.development, unit(development));
  const w = needs.map((n) => Math.pow(Math.max(0, n), k));
  const total = w.reduce((a, b) => a + b, 0);
  return total === 0 ? needs.map(() => 1 / Math.max(1, needs.length)) : w.map((x) => x / total);
}

/** Tactics: whether the race plan takes its best choice, on a draw. */
export const tacticsHolds = (tactics: number, rand: Rand): boolean => rand() < lin(M.tactics, unit(tactics));

/** Politics: a rival's sway in a vote, from their reputation. */
export const sway = (politics: number, reputation: number): number => reputation * unit(politics);

// ---- the elder -------------------------------------------------------------------------------------------------

/** Ambition: the target place from the expected place (1 best), moved up. */
export const targetPlace = (ambition: number, expected: number): number => Math.max(1, expected - Math.round(E.ambition * unit(ambition)));

/** Patience: confidence's move after a race from the target and the standing (places, 1 best). A fall is scaled by
 *  1.3 − 0.6u (the patient fall less); a rise is not. */
export function confidenceMove(patience: number, target: number, standing: number): number {
  const move = Math.min(E.rise, Math.max(E.fall, E.perPlace * (target - standing)));
  return move < 0 ? move * lin(E.patience, unit(patience)) : move;
}

/** Confidence's move a race for the crew's coin: below zero, and past the debt floor. */
export const debtMove = (coin: number, floor: number): number => (coin < floor ? E.pastFloor : coin < 0 ? E.debt : 0);

/** Generosity: Coin the elder adds at the season's start. */
export const endowment = (generosity: number, budget: number): number => E.generosity * unit(generosity) * budget;

/** Generosity: the debt floor (a negative Coin). */
export const debtFloor = (generosity: number, budget: number): number => -lin(E.floor, unit(generosity)) * budget;

/** Meddling: the chance an elder's dilemma is the one drawn, when one qualifies. */
export const meddleChance = (meddling: number): number => lin(E.meddling, unit(meddling));

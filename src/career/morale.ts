// Morale and injury. Morale is 0 to 100, starts at 60, and shifts every role's effective stats
// by (morale − 50) / 50 points. Each move is a pure function the race's close, the market and the dilemmas call.

import type { Rand } from './dice.ts';
import { between } from './dice.ts';
import { TUNING } from './tuning.ts';

const M = TUNING.morale;

/** Morale kept to 0..100. */
export const moraleIn = (m: number): number =>
  Math.min(100, Math.max(0, Math.round(m * 10) / 10));

/** The points every effective stat shifts by at a morale. */
export const moraleShift = (morale: number): number => (morale - 50) / M.effect;

/** A race's result against the team's target: places better than the target (target − standing), to ± the most. */
export const resultMove = (target: number, standing: number): number =>
  Math.min(
    M.result,
    Math.max(-M.result, M.resultPerPlace * (target - standing))
  );

/** A race settles morale a share of the way back to where it starts. */
export const settleMove = (morale: number): number =>
  M.settle * (M.start - morale);

/** Status, for a driver who wants it: a race on ship two, or one as reserve. */
export const statusMove = (wantsStatus: boolean, sailing: boolean): number =>
  !wantsStatus ? 0 : sailing ? M.status : -M.status;

/** Contract talk: no renewal offered by the contract's last days (once), or a renewal offered. */
export const silenceMove = (): number => -M.silence;
export const renewalMove = (): number => M.renewal;

/** Wage against the person's ask, a race. */
export const wageMove = (wage: number, ask: number): number =>
  ask <= 0
    ? 0
    : Math.min(
        M.wage[1],
        Math.max(M.wage[0], M.wagePerShare * (wage / ask - 1))
      );

/** The bond's level, a race, for a mechanic and her driver. */
export const bondMove = (level: number): number => M.bond * level;

/** Below this a person asks to leave and refuses renewal. */
export const wantsOut = (morale: number): boolean => morale < M.leave;

/** A renewal's ask × this: less for the content. */
export const renewalAsk = (morale: number): number =>
  morale > M.content ? 1 - M.contentDiscount : 1;

/** Injury: a driver whose ship was sunk is unfit for this many races (0: fit), on a draw of the 'injury' stream. */
export function injury(rand: Rand): number {
  if (rand() >= TUNING.injury.chance) return 0;
  return between(rand, TUNING.injury.races[0], TUNING.injury.races[1]);
}

/** A person who cannot be picked for a race plan. */
export const unfit = (g: { unfit: number }): boolean => g.unfit > 0;

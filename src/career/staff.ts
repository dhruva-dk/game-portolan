// What a captain's Feedback, a shipwright's and a scout's stats do (Phase B section 2.1), as pure functions the
// sections that use them call (design, scouting, the market). A stat's u is stat / 20.

import type { PartType } from '../race.ts';
import type { Rand } from './dice.ts';
import { unit } from './roles.ts';
import { TUNING } from './tuning.ts';

const lin = (pair: readonly [number, number], u: number): number => pair[0] + pair[1] * u;
const W = TUNING.shipwright, S = TUNING.scout;

// ---- the captain -----------------------------------------------------------------------------------------------

/** Feedback: free performance points after each race she sailed, to her ship's fitted part furthest below its maximum. */
export const feedbackPoints = (feedback: number): number => TUNING.captain.feedback * unit(feedback);

/** Which fitted part Feedback's points go to: the one furthest below its maximum (the first of equals), or null. */
export function feedbackTarget<P extends { perf: number; perfMax: number; spec: boolean }>(fitted: readonly P[]): P | null {
  let best: P | null = null;
  for (const p of fitted) if (!p.spec && p.perfMax - p.perf > 0 && (best === null || p.perfMax - p.perf > best.perfMax - best.perf)) best = p;
  return best;
}

// ---- the shipwright --------------------------------------------------------------------------------------------

/** Sails, Rigging, Rudder, Hull, Keel, Mounts: a new design of that type starts this far above the crew's best of it. */
export const designHead = (typeStat: number): number => W.start * typeStat;

/** Innovation: the chance a finished design teaches one unknown component of an unlocked tier. */
export const innovationChance = (innovation: number): number => lin(W.innovation, unit(innovation));

/** Speed: design days × this. */
export const designSpeed = (speed: number): number => lin(W.speed, unit(speed));

/** Accuracy: the built part lands within ± this share of the projected performance and maximum. */
export const accuracyBand = (accuracy: number): number => (1 - unit(accuracy)) * W.accuracy;

/** Accuracy's draw when a design finishes: the factor its projected numbers are multiplied by. */
export const accuracyDraw = (accuracy: number, rand: Rand): number => 1 + (rand() * 2 - 1) * accuracyBand(accuracy);

/** How many components a new shipwright knows. */
export const componentsKnown = (stars: number): number => W.knows + Math.round(stars);

/** A shipwright's stat for a part type. */
export const typeStat = (stats: Readonly<Record<PartType, number>>, type: PartType): number => stats[type];

// ---- the scout -------------------------------------------------------------------------------------------------

/** Judgement: how many stars wide the range shown of an unscouted gull is. */
export const starWidth = (judgement: number): number => lin(S.width, 1 - unit(judgement));

/** Judgement: how far off the shown range's centre is, ± (1 − u), from a seeded draw (a crew's view of a gull). */
export const centreOff = (judgement: number, rand: Rand): number => (rand() * 2 - 1) * S.centre * (1 - unit(judgement));

/** Insight: how wide the potential's range is, unscouted or scouted. */
export const potentialWidth = (insight: number, scouted: boolean): number =>
  scouted ? S.potentialScouted * (1 - unit(insight)) : lin(S.width, 1 - unit(insight));

/** Insight: whether one trait shows unscouted. */
export const traitShows = (insight: number): boolean => insight >= S.traitAt;

/** Reach: whether a scout of a crew in `league` sees a gull in `theirs` (null: a free agent). */
export function inReach(reach: number, league: number, theirs: number | null): boolean {
  if (theirs === null || theirs === league) return true;
  if (reach >= S.reachAll) return true;
  return reach >= S.reachAdjacent && Math.abs(theirs - league) === 1;
}

/** Speed: days to scout a gull, by the crow's nest's level (1..3). */
export const scoutDays = (speed: number, nestLevel: number): number =>
  Math.max(1, Math.round(S.days * lin(S.speed, unit(speed)) * S.nest[Math.min(2, Math.max(0, nestLevel - 1))]));

/** Persuasion: whether the first offer made within the window of this scout's report gives the gull +1 patience, on
 *  a draw for that offer (chance u). */
export const persuades = (persuasion: number, reportDay: number, offerDay: number, rand: Rand): boolean =>
  offerDay - reportDay <= S.persuasionDays && rand() < unit(persuasion);

/** The shown range of a value: [centre − width / 2, centre + width / 2], kept to 0..5 in halves. */
export function shownRange(centre: number, width: number): readonly [number, number] {
  const half = (x: number) => Math.min(5, Math.max(0, Math.round(x * 2) / 2));
  return [half(centre - width / 2), half(centre + width / 2)];
}

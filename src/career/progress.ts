// The career after a match (progress.html A4 careerAfterMatch) and in the harbour between matches: rank and its
// unlocks, treasure, the league moving on, the form the player sails, and the gull trained with treasure.
import type { MatchResult } from '../sim/end.ts';
import { GULL, PIGMENT_TIER } from '../sim/tables.ts';
import { TRAITS, draw, leagueRound, type Trait } from './league.ts';
import { RANK, clampPoints, copyCareer, rankDeltas, tierOf, unlockedForms, type Career, type GullLevels } from './state.ts';

/**
 * The career after the match it set up (setup.ts toSetup) ended in `result`: every ship in it moves by the rank
 * formula, the player never below the tier it has reached; the player's treasure comes home; the captains who did
 * not sail race their own matches (league.ts leagueRound).
 */
export function applyResult(career: Career, result: MatchResult): Career {
  const next = copyCareer(career), sailed = draw(career), d = rankDeltas(result.ships), p = next.player;
  p.points = Math.max((p.tier - 1) * RANK.tier, clampPoints(p.points + d[0])); // the player sails ship 0
  p.tier = Math.max(p.tier, tierOf(p.points));
  p.treasure += result.ships[0].treasure;
  sailed.forEach((id, k) => {
    next.captains[id].points = clampPoints(next.captains[id].points + d[k + 1]);
  });
  leagueRound(next, sailed);
  next.match++;
  return next;
}

/** The career sailing `form` from its next match; throws unless its tier has unlocked it. */
export function chooseForm(career: Career, form: number): Career {
  if (!unlockedForms(career.player.tier).includes(form)) throw new RangeError('chooseForm: that form is not unlocked');
  const next = copyCareer(career);
  next.player.form = form;
  return next;
}

/** Treasure for each level of each of the gull's traits, the first level first (GULL.levels of them). */
export const GULL_PRICES: Readonly<Record<Trait, readonly number[]>> = {
  talons: [150, 400, 900, 1800],
  wings: [100, 250, 550, 1100],
  eye: [100, 250, 550, 1100],
  beak: [150, 450, 1000],
  dive: [200, 550, 1200],
};

/** The treasure the gull's next level of `trait` costs, or null at its top. */
export const gullPrice = (career: Career, trait: Trait): number | null => GULL_PRICES[trait][career.player.gull[trait]] ?? null;

/** The career with the gull's next level of `trait` bought; throws at the top or short of treasure. */
export function buyGull(career: Career, trait: Trait): Career {
  const price = gullPrice(career, trait);
  if (price === null || price > career.player.treasure) throw new RangeError('buyGull: at the top, or short of treasure');
  const next = copyCareer(career);
  next.player.treasure -= price;
  next.player.gull[trait]++;
  return next;
}

/** A mark in the gull's plumage: a level of a trait, in a PIGMENT_TIER. */
export interface Mark {
  readonly trait: Trait;
  readonly level: number;
  readonly pigment: number;
}

/**
 * The plumage record the renderer draws: a mark for every level trained, in TRAITS order, in that level's pigment
 * tier (iron-gall for the first, rising to vermilion at a trait's top), and gold-leaf wingtips once every trait is at
 * its top.
 */
export function plumage(gull: GullLevels): { marks: Mark[]; goldTips: boolean } {
  const marks: Mark[] = [];
  for (const trait of TRAITS) {
    const top = GULL.levels[trait];
    for (let level = 1; level <= gull[trait]; level++) marks.push({ trait, level, pigment: Math.floor(((level - 1) * PIGMENT_TIER.vermilion) / (top - 1)) });
  }
  return { marks, goldTips: TRAITS.every((t) => gull[t] === GULL.levels[t]) };
}

import type { MatchResult } from '../sim/end.ts';
import { GULL, PIGMENT_TIER } from '../sim/tables.ts';
import { remember } from './learn.ts';
import { TRAITS, draw, leagueRound, type Trait } from './league.ts';
import { RANK, clampPoints, copyCareer, rankDeltas, tierOf, unlockedForms, type Career, type GullLevels } from './state.ts';
import type { Voyage } from './voyage.ts';

export function applyResult(career: Career, result: MatchResult, voyage?: Voyage): Career {
  const next = copyCareer(career), sailed = draw(career), d = rankDeltas(result.ships), p = next.player;
  p.points = Math.max((p.tier - 1) * RANK.tier, clampPoints(p.points + d[0]));
  p.tier = Math.max(p.tier, tierOf(p.points));
  p.treasure += result.ships[0].treasure;
  sailed.forEach((id, k) => {
    next.captains[id].points = clampPoints(next.captains[id].points + d[k + 1]);
  });
  remember(next, sailed, result, voyage);
  leagueRound(next, sailed);
  next.match++;
  return next;
}

export function chooseForm(career: Career, form: number): Career {
  if (!unlockedForms(career.player.tier).includes(form)) throw new RangeError('chooseForm: that form is not unlocked');
  const next = copyCareer(career);
  next.player.form = form;
  return next;
}

export const GULL_PRICES: Readonly<Record<Trait, readonly number[]>> = {
  talons: [150, 400, 900, 1800],
  wings: [100, 250, 550, 1100],
  eye: [100, 250, 550, 1100],
  beak: [150, 450, 1000],
  dive: [200, 550, 1200],
};

export const gullPrice = (career: Career, trait: Trait): number | null => GULL_PRICES[trait][career.player.gull[trait]] ?? null;

export function buyGull(career: Career, trait: Trait): Career {
  const price = gullPrice(career, trait);
  if (price === null || price > career.player.treasure) throw new RangeError('buyGull: at the top, or short of treasure');
  const next = copyCareer(career);
  next.player.treasure -= price;
  next.player.gull[trait]++;
  return next;
}

export interface Mark {
  readonly trait: Trait;
  readonly level: number;
  readonly pigment: number;
}

export function plumage(gull: GullLevels): { marks: Mark[]; goldTips: boolean } {
  const marks: Mark[] = [];
  for (const trait of TRAITS) {
    const top = GULL.levels[trait];
    for (let level = 1; level <= gull[trait]; level++) marks.push({ trait, level, pigment: Math.floor(((level - 1) * PIGMENT_TIER.vermilion) / (top - 1)) });
  }
  return { marks, goldTips: TRAITS.every((t) => gull[t] === GULL.levels[t]) };
}

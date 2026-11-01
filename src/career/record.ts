// The record, as the screens read it: your stats, the chart of regions sailed, your rank and level, and the
// rivals page with your record against each captain and what each has learned of you.
import { REGIONS } from '../sim/world/index.ts';
import { CAPTAINS, temperament, type Captain, type Temperament } from './captains.ts';
import { careerRank, type Career } from './career.ts';
import { RIVAL_AT, leagueRank, rivalry } from './fleet.ts';
import { CARD, habitLines } from './habits.ts';
import { levelOf, type LevelProgress } from './levels.ts';
import type { Rank } from './ranks.ts';

export interface CareerStats {
  matches: number;
  wins: number;
  top5: number;
  kills: number;
  damage: number;
  /** Seconds afloat over every match. */
  survived: number;
  /** 0 before the first match. */
  bestPlace: number;
}

export const careerStats = (c: Career): CareerStats => ({
  matches: c.matches, wins: c.wins, top5: c.top5, kills: c.kills, damage: c.damage, survived: c.survived, bestPlace: c.bestPlace,
});

export interface ChartRegion {
  index: number;
  id: string;
  name: string;
  /** Matches in which you sailed it; 0 means it is still blank on your chart. */
  sailed: number;
}

export const chartOf = (c: Career): ChartRegion[] => REGIONS.map((r, index) => ({ index, id: r.id, name: r.name, sailed: c.chart[index] ?? 0 }));

export const regionsCharted = (c: Career): number => c.chart.filter((n) => n > 0).length;

export interface Standing {
  level: LevelProgress;
  rank: Rank;
}

export const standingOf = (c: Career): Standing => ({ level: levelOf(c.xp), rank: careerRank(c) });

export interface RivalCard {
  captain: Captain;
  temperament: Temperament;
  /** Its league standing, such as "Gold II". */
  rank: string;
  met: number;
  /** Matches you finished ahead of it, and behind it. */
  ahead: number;
  behind: number;
  /** Times it sank you, and you sank it. */
  sankYou: number;
  sunkByYou: number;
  grudge: number;
  /** 0 to 1. */
  rivalry: number;
  isRival: boolean;
  /** Plain lines for its card: its grudge, what it has learned, and your record together. */
  lines: string[];
}

export const recordLine = (met: number, sankYou: number, sunkByYou: number): string =>
  met === 0 ? CARD.stranger : `Sank you ${sankYou}, sunk by you ${sunkByYou}, in ${met} ${met === 1 ? 'match' : 'matches'} together.`;

export function rivalCard(c: Career, i: number): RivalCard {
  const r = c.captains[i], cap = CAPTAINS[i], level = rivalry(r);
  return {
    captain: cap,
    temperament: temperament(cap.temperament),
    rank: leagueRank(r),
    met: r.met, ahead: r.ahead, behind: r.behind, sankYou: r.sank, sunkByYou: r.sunk, grudge: r.grudge,
    rivalry: level,
    isRival: level >= RIVAL_AT,
    lines: [...(r.grudge > 0 ? [CARD.grudge[r.grudge - 1]] : []), ...habitLines(r.habits), recordLine(r.met, r.sank, r.sunk)],
  };
}

/** Every captain's card: rivals first, then those you've met most, then the rest by name. */
export function rivalsOf(c: Career): RivalCard[] {
  return CAPTAINS.map((_, i) => rivalCard(c, i)).sort(
    (a, b) => b.rivalry - a.rivalry || b.met - a.met || (a.captain.name < b.captain.name ? -1 : a.captain.name > b.captain.name ? 1 : 0),
  );
}

/** What you yourself tend to do, in the same plain lines the captains use. */
export const yourHabits = (c: Career): string[] => habitLines(c.profile).map((l) => l.replace('Has learned you ', 'You '));

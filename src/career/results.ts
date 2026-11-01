// After a match: applyMatch folds a MatchReport into the career and says what changed, for the results
// screen and the ceremonies. The rating moves; XP, levels and unlocks follow; the chart fills in; each
// captain's record, grudge and learning update; and the league plays its own heats off-screen, so captains
// rise and fall between your matches.
import { ABILITIES } from '../sim/abilities.ts';
import { hash32, rngFrom, type Rng } from '../sim/math.ts';
import { REGION_COUNT } from '../sim/world/index.ts';
import { captainIndex } from './captains.ts';
import { careerRank, copyCareer, type Career } from './career.ts';
import type { MatchChanges, MatchReport, RivalNews } from './contract.ts';
import { COSMETICS } from './cosmetics.ts';
import { captainSkills } from './fleet.ts';
import { learn, nextGrudge } from './habits.ts';
import { ABILITY_LEVEL, levelOf, matchXp } from './levels.ts';
import { reachTier } from './ranks.ts';
import { clampRating, rateMatch } from './rating.ts';
import { playSynthetic } from './synthetic.ts';

/** League points per match for captains: by place, and by sinkings. Captains also drift back toward home. */
export const LEAGUE_PLAY = { heat: 7, place: 20, sink: 5, revert: 0.05 } as const;

const ROUND_SALT = 0x6c656167;

const placePoints = (place: number, ships: number, kills: number, sunk: boolean): number =>
  Math.round((LEAGUE_PLAY.place * (ships + 1 - 2 * place)) / (ships - 1)) + LEAGUE_PLAY.sink * (kills - (sunk ? 1 : 0));

/** Throws a RangeError when the report can't be this career's match. */
function check(report: MatchReport): number[] {
  const n = report.ships.length;
  if (n < 2 || report.captains.length !== n - 1) throw new RangeError('applyMatch: need one ship per captain, plus the player');
  const ids = report.captains.map((id) => {
    const i = captainIndex(id);
    if (i < 0) throw new RangeError(`applyMatch: no captain ${id}`);
    return i;
  });
  if (ids.some((id, k) => ids.indexOf(id) !== k)) throw new RangeError('applyMatch: a captain sailed twice');
  for (const s of report.ships) {
    if (!Number.isInteger(s.place) || s.place < 1 || s.place > n) throw new RangeError('applyMatch: place out of range');
    if (!Number.isInteger(s.sunkBy) || s.sunkBy < -1 || s.sunkBy >= n) throw new RangeError('applyMatch: sunkBy out of range');
  }
  return ids;
}

/** The league's own matches: the captains you didn't meet play heats among themselves. */
function leagueRound(next: Career, met: readonly number[], rng: Rng): void {
  const rest = next.captains.map((_, i) => i).filter((i) => !met.includes(i));
  rest.sort((a, b) => next.captains[b].rating - next.captains[a].rating || a - b);
  for (let h = 0; h + 1 < rest.length; h += LEAGUE_PLAY.heat) {
    const ids = rest.slice(h, h + LEAGUE_PLAY.heat), heat = playSynthetic(rng, ids.map((i) => next.captains[i].rating));
    ids.forEach((id, k) => {
      next.captains[id].rating += placePoints(heat.place[k], ids.length, heat.kills[k], heat.sunkBy[k] >= 0);
    });
  }
  for (const r of next.captains) r.rating = Math.round(clampRating(r.rating + (r.home - r.rating) * LEAGUE_PLAY.revert));
}

export function applyMatch(career: Career, report: MatchReport): { career: Career; changes: MatchChanges } {
  const ids = check(report), next = copyCareer(career), me = report.ships[0], n = report.ships.length;
  const rankBefore = careerRank(career), levelBefore = levelOf(career.xp);

  // The hidden rating, against the skills this match's captains were given.
  next.rating = rateMatch(career.rating, career.matches, captainSkills(career, ids), me.place, me.kills);
  next.bestTier = reachTier(career.bestTier, next.rating);

  // Stats.
  next.matches++;
  if (me.place === 1) next.wins++;
  if (me.place <= 5) next.top5++;
  next.kills += me.kills;
  next.damage += Math.max(0, Math.round(me.damage));
  next.survived += Math.max(0, Math.round(me.survived));
  next.bestPlace = next.bestPlace === 0 ? me.place : Math.min(next.bestPlace, me.place);

  // The chart.
  const sailed = me.regions.filter((r, k) => Number.isInteger(r) && r >= 0 && r < REGION_COUNT && me.regions.indexOf(r) === k);
  const newRegions = sailed.filter((r) => career.chart[r] === 0).sort((a, b) => a - b);
  for (const r of sailed) next.chart[r]++;

  // XP and levels.
  const parts = matchXp(me.place, n, me.kills, me.damage, me.survived, newRegions.length);
  const total = parts.reduce((a, p) => a + p.amount, 0);
  next.xp += total;
  const levelAfter = levelOf(next.xp), gained: number[] = [];
  for (let l = levelBefore.level + 1; l <= levelAfter.level; l++) gained.push(l);

  // Rivals: the record, grudges and learning.
  const rivals: RivalNews[] = [];
  ids.forEach((i, k) => {
    const ship = report.ships[k + 1], r = next.captains[i], id = r.id;
    if (r.met === 0) rivals.push({ captain: id, what: 'firstMeeting' });
    r.met++;
    if (me.place < ship.place) r.ahead++;
    else r.behind++;
    const sunkByYou = ship.sunkBy === 0;
    if (sunkByYou) {
      r.sunk++;
      rivals.push({ captain: id, what: 'sunkByYou' });
    }
    if (me.sunkBy === k + 1) {
      r.sank++;
      rivals.push({ captain: id, what: 'sankYou' });
    }
    const was = r.grudge;
    r.grudge = nextGrudge(r.grudge, sunkByYou);
    if (r.grudge > was && r.grudge >= 2) rivals.push({ captain: id, what: 'grudge' });
  });
  learn(next.profile, report.habits);
  next.captains.forEach((r, i) => learn(r.habits, ids.includes(i) ? report.habits : null));

  // The league: the captains you met score this match; the rest play their own heats.
  ids.forEach((i, k) => {
    const ship = report.ships[k + 1];
    next.captains[i].rating += placePoints(ship.place, n, ship.kills, ship.sunkBy >= 0);
  });
  leagueRound(next, ids, rngFrom(hash32(hash32(career.seed, ROUND_SALT), career.matches)));

  // What unlocked.
  const rankAfter = careerRank(next);
  const levelUp = (l: number): boolean => l > levelBefore.level && l <= levelAfter.level;
  const abilities = ABILITIES.filter((a) => levelUp(ABILITY_LEVEL[a.id])).map((a) => a.id);
  const cosmetics = COSMETICS.filter((c) => (c.unlock.by === 'level' ? levelUp(c.unlock.level) : c.unlock.tier > career.bestTier && c.unlock.tier <= next.bestTier)).map((c) => c.id);
  const change = rankAfter.step.index > rankBefore.step.index ? 'up' : rankAfter.step.index < rankBefore.step.index ? 'down' : 'same';

  return {
    career: next,
    changes: {
      place: me.place,
      kills: me.kills,
      xp: { parts, total },
      level: { before: levelBefore, after: levelAfter, gained },
      rank: { before: rankBefore, after: rankAfter, change, newTier: next.bestTier > career.bestTier },
      rating: { before: career.rating, after: next.rating },
      unlocked: { abilities, cosmetics },
      newRegions,
      rivals,
    },
  };
}

import { clamp } from '../../world/scalar.ts';
import type { Person, Terms } from '../state.ts';
import { CONTRACTS, LEAGUE, NEGOTIATION, STARS, WANTS } from '../tuning.ts';
import { stars } from './person.ts';

export function askingWage(starCount: number, wageFactor: number): number {
  const raw =
    WANTS.askPerStar *
    Math.max(starCount, WANTS.askLeastStars) ** WANTS.askPower *
    wageFactor;
  return Math.max(
    WANTS.leastAsk,
    Math.round(raw / WANTS.askStep) * WANTS.askStep
  );
}

export const ask = (person: Pick<Person, 'stats' | 'wageFactor'>): number =>
  askingWage(stars(person.stats), person.wageFactor);

export function lowestWage(
  scoreAt: (wage: number) => number,
  target: number
): number | null {
  const { least, most, step } = NEGOTIATION.wage;
  const base = scoreAt(least);
  const perStep = scoreAt(least + step) - base;
  if (perStep <= 0) return base >= target ? least : null;
  let wage = least + Math.max(0, Math.ceil((target - base) / perStep)) * step;
  while (wage > least && scoreAt(wage - step) >= target) wage -= step;
  while (wage <= most && scoreAt(wage) < target) wage += step;
  return wage <= most ? wage : null;
}

export const standardClause = (wage: number): number =>
  Math.ceil(
    (NEGOTIATION.standardClauseRaces * wage) / NEGOTIATION.clause.step
  ) * NEGOTIATION.clause.step;

export const racesLeftOnSigning = (
  seasons: number,
  race: number,
  offseason: boolean
): number =>
  offseason
    ? seasons * LEAGUE.racesPerSeason
    : LEAGUE.racesPerSeason + 1 - race + (seasons - 1) * LEAGUE.racesPerSeason;

export const renewedRacesLeft = (racesLeft: number, seasons: number): number =>
  racesLeft + seasons * LEAGUE.racesPerSeason;

export const releaseCost = (wage: number, racesLeft: number): number =>
  Math.ceil(CONTRACTS.releaseShare * wage * racesLeft);

export type Answer = 'signs' | 'counters' | 'refuses';

export function answerTo(score: number): Answer {
  if (score >= NEGOTIATION.signs) return 'signs';
  return score >= NEGOTIATION.counters ? 'counters' : 'refuses';
}

type Wanting = Pick<Person, 'wants' | 'preferred'>;

export const moneyScore = (terms: Terms, ask: number): number =>
  (terms.wage +
    (NEGOTIATION.feeWeight * terms.fee) /
      (terms.seasons * LEAGUE.racesPerSeason)) /
  ask;

export const securityScore = (seasons: number, preferred: number): number =>
  1 - Math.abs(seasons - preferred) / NEGOTIATION.securitySpan;

export const clausePenalty = (clause: number, ask: number): number =>
  NEGOTIATION.clausePenalty * Math.max(0, clause / standardClause(ask) - 1);

export const offerScore = (
  person: Wanting,
  ask: number,
  standing: number,
  terms: Terms
): number =>
  person.wants.money * moneyScore(terms, ask) +
  person.wants.standing * standing +
  person.wants.security * securityScore(terms.seasons, person.preferred) -
  clausePenalty(terms.clause, ask);

export const expectedReputation = (starCount: number): number =>
  WANTS.expectedWorst - (WANTS.expectedSpan * starCount) / STARS.most;

export const standingScore = (starCount: number, reputation: number): number =>
  clamp(
    1 - (reputation - expectedReputation(starCount)) / WANTS.standingSpan,
    WANTS.standingScore.lo,
    WANTS.standingScore.hi
  );

export const eligible = (starCount: number, reputation: number): boolean =>
  standingScore(starCount, reputation) >= WANTS.eligible;

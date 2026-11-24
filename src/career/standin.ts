import type { MatchResult, ShipResult } from '../sim/result.ts';
import type { DriverStats, MatchSetup, ShipSpec } from '../sim/setup.ts';
import { hash } from '../world/random.ts';
import { draw } from './draw.ts';
import { DRIVER_STATS } from './state.ts';
import {
  LEVEL_VALUES,
  RACE_MONEY,
  STAND_IN_RESULT,
  STAT_SPAN,
} from './tuning.ts';

type Field = 'place' | 'sunkBy';

const LEVELED = [
  'topSpeed',
  'gather',
  'gustCapacity',
  'turnRate',
  'hullPoints',
  'spreadFactor',
  'reloadFactor',
  'damageFactor',
  'assistCone',
] satisfies readonly (keyof typeof LEVEL_VALUES)[];

const PLAYER_STATS: DriverStats = {
  gunnery: STAND_IN_RESULT.playerStat,
  helm: STAND_IN_RESULT.playerStat,
  nerve: STAND_IN_RESULT.playerStat,
  territory: STAND_IN_RESULT.playerStat,
  stormcraft: STAND_IN_RESULT.playerStat,
  lookout: STAND_IN_RESULT.playerStat,
};

const mean = (values: readonly number[]): number =>
  values.reduce((sum, x) => sum + x, 0) / values.length;

const handsStats = (ship: ShipSpec): DriverStats =>
  ship.hands === 'player' ? PLAYER_STATS : ship.hands;

export function strength(ship: ShipSpec): number {
  const levels = LEVELED.map((value) => {
    const { atZero, atHundred } = LEVEL_VALUES[value];
    return (ship[value] - atZero) / (atHundred - atZero);
  });
  const stats = handsStats(ship);
  return (
    mean(levels) + mean(DRIVER_STATS.map((s) => stats[s])) / STAT_SPAN.most
  );
}

const keyed = (setup: MatchSetup, id: number, field: Field): number =>
  draw('standin', setup.match, id, field);

function finishOrder(
  setup: MatchSetup,
  strengths: readonly number[]
): number[] {
  const time = (id: number): number =>
    strengths[id] > 0
      ? -Math.log(1 - keyed(setup, id, 'place')) / strengths[id]
      : Infinity;
  const times = strengths.map((_, id) => time(id));
  return strengths
    .map((_, id) => id)
    .sort((a, b) => times[a] - times[b] || a - b);
}

function weightedPick(
  candidates: readonly number[],
  weightOf: (id: number) => number,
  u: number
): number {
  const weights = candidates.map((id) => Math.max(0, weightOf(id)));
  const total = weights.reduce((sum, w) => sum + w, 0);
  let target = u * total;
  for (let i = 0; i < candidates.length; i++) {
    if (target < weights[i]) return candidates[i];
    target -= weights[i];
  }
  return candidates[Math.floor(u * candidates.length)];
}

const sinkingTime = (place: number, ships: number): number =>
  Math.round(
    STAND_IN_RESULT.firstSinking +
      (STAND_IN_RESULT.sinkingSpan * (ships - place)) / (ships - 1)
  );

export const shotsLanded = (gunnery: number): number =>
  Math.round(
    STAND_IN_RESULT.shotsFired *
      (STAND_IN_RESULT.landedBase +
        (STAND_IN_RESULT.landedPerGunnery * gunnery) / STAT_SPAN.most)
  );

const sampleTime = (k: number): number =>
  (STAND_IN_RESULT.seconds * k) / STAND_IN_RESULT.sampleSpacing;

export function resultHash(rest: Omit<MatchResult, 'hash'>): string {
  let h = 0;
  for (const ch of JSON.stringify(rest)) h = hash(h, ch.codePointAt(0) ?? 0);
  return h.toString(16).padStart(8, '0');
}

function seaSamples(
  setup: MatchSetup,
  strengths: readonly number[],
  sunkAt: readonly (number | null)[]
): number[][] {
  const teams = Math.max(...setup.ships.map((ship) => ship.team)) + 1;
  const samples = Array.from({ length: RACE_MONEY.seaSamples }, (_, i) => {
    const time = sampleTime(i + 1);
    const weights = Array.from({ length: teams }, () => 0);
    setup.ships.forEach((ship, id) => {
      const sank = sunkAt[id];
      if (sank !== null && sank <= time) return;
      weights[ship.team] +=
        strengths[id] + handsStats(ship).territory / STAT_SPAN.most;
    });
    const total = weights.reduce((sum, w) => sum + w, 0);
    return weights.map((w) =>
      total > 0 ? (w / total) * STAND_IN_RESULT.sea : 0
    );
  });
  return Array.from({ length: teams }, (_, team) =>
    samples.map((sample) => sample[team])
  );
}

export function standInResult(setup: MatchSetup): MatchResult {
  const { ships } = setup;
  const count = ships.length;
  const strengths = ships.map(strength);
  const order = finishOrder(setup, strengths);
  const place = ships.map(() => 0);
  order.forEach((id, index) => {
    place[id] = index + 1;
  });
  const winner = order[0];
  const teammateTop = Math.ceil(count / STAND_IN_RESULT.teammateAfloatShare);
  const afloat = (id: number): boolean =>
    id === winner ||
    (ships[id].team === ships[winner].team && place[id] <= teammateTop);
  const sunkAt = ships.map((_, id) =>
    afloat(id) ? null : sinkingTime(place[id], count)
  );
  const sunkBy = ships.map((ship, id) => {
    if (afloat(id)) return null;
    const candidates = ships
      .map((_, other) => other)
      .filter(
        (other) => ships[other].team !== ship.team && place[other] < place[id]
      );
    if (candidates.length === 0) return null;
    return weightedPick(
      candidates,
      (other) => strengths[other],
      keyed(setup, id, 'sunkBy')
    );
  });
  const phaseFourTop = Math.ceil(count / STAND_IN_RESULT.phaseFourShare);
  const results = ships.map((ship, id): ShipResult => {
    const sinkings = sunkBy.filter((by) => by === id).length;
    const sunk = sunkAt[id] !== null;
    return {
      place: place[id],
      sunkAt: sunkAt[id],
      sunkBy: sunkBy[id],
      sinkings,
      shotsFired: STAND_IN_RESULT.shotsFired,
      shotsLanded: shotsLanded(handsStats(ship).gunnery),
      damageDealt: STAND_IN_RESULT.damagePerSinking * sinkings,
      damageTaken: sunk
        ? STAND_IN_RESULT.damageSunk
        : STAND_IN_RESULT.damageAfloat,
      afloatAtPhaseFour: place[id] <= phaseFourTop,
    };
  });
  const rest = {
    seconds: STAND_IN_RESULT.seconds,
    ships: results,
    sea: seaSamples(setup, strengths, sunkAt),
  };
  return { ...rest, hash: resultHash(rest) };
}

import type { GunKind } from '../sim/kinds.ts';
import type {
  DriverStats,
  MatchSetup,
  ShipSpec,
  ShipValues,
} from '../sim/setup.ts';
import { pick, whole } from './draw.ts';
import { personOf } from './lookup.ts';
import { PLANET_NAMES } from './names.ts';
import { standings } from './rules/standing.ts';
import {
  DRIVER_STATS,
  FIRST_RACE,
  MECHANIC_STATS,
  type CareerState,
  type Team,
} from './state.ts';
import {
  LEVEL_SPAN,
  LEVEL_VALUES,
  MECHANIC_VALUES,
  RACE_RATINGS,
  STAND_IN,
} from './tuning.ts';

type LevelValue = keyof typeof LEVEL_VALUES;
type MechanicValue = keyof typeof MECHANIC_VALUES;

export type FittedLevels = Readonly<
  Record<(typeof LEVEL_VALUES)[LevelValue]['line'], number>
>;

export type MechanicStats = Readonly<
  Record<(typeof MECHANIC_VALUES)[MechanicValue]['stat'], number>
>;

export type Hands = ShipSpec['hands'];

export type FitOptions = { hands: Hands };

export type RaceOf = Pick<CareerState, 'season' | 'race' | 'phase'>;

export type Race = { season: number; race: number };

type Rating = (typeof RACE_RATINGS)[number];

const MATCH_SEEDS = 2 ** 32;

export function shipValues(
  levels: FittedLevels,
  gun: GunKind,
  mechanic: MechanicStats | null
): ShipValues {
  const leveled = (value: LevelValue): number => {
    const { line, atZero, atHundred } = LEVEL_VALUES[value];
    const f =
      (levels[line] - LEVEL_SPAN.least) / (LEVEL_SPAN.most - LEVEL_SPAN.least);
    return atZero * (1 - f) + atHundred * f;
  };
  const tended = (value: MechanicValue): number => {
    const { stat, none, base, perPoint } = MECHANIC_VALUES[value];
    return mechanic === null ? none : base + perPoint * mechanic[stat];
  };
  return {
    topSpeed: leveled('topSpeed'),
    gather: leveled('gather'),
    turnRate: leveled('turnRate'),
    hullPoints: leveled('hullPoints'),
    spreadFactor: leveled('spreadFactor'),
    reloadFactor: leveled('reloadFactor'),
    gun,
    damageFactor: leveled('damageFactor'),
    assistCone: leveled('assistCone'),
    gustCapacity: leveled('gustCapacity'),
    shieldRate: tended('shieldRate'),
    healTime: tended('healTime'),
    healFactor: tended('healFactor'),
  };
}

const driverStat = (
  stats: readonly number[],
  stat: keyof DriverStats
): number => stats[DRIVER_STATS.indexOf(stat)];

export const driverStats = (stats: readonly number[]): DriverStats => ({
  gunnery: driverStat(stats, 'gunnery'),
  helm: driverStat(stats, 'helm'),
  nerve: driverStat(stats, 'nerve'),
  territory: driverStat(stats, 'territory'),
  stormcraft: driverStat(stats, 'stormcraft'),
  lookout: driverStat(stats, 'lookout'),
});

const mechanicStat = (
  stats: readonly number[],
  stat: keyof MechanicStats
): number => stats[MECHANIC_STATS.indexOf(stat)];

export const mechanicStats = (stats: readonly number[]): MechanicStats => ({
  shield: mechanicStat(stats, 'shield'),
  healSpeed: mechanicStat(stats, 'healSpeed'),
  healAmount: mechanicStat(stats, 'healAmount'),
});

function seated(state: CareerState, id: number | null): number[] | null {
  if (id === null) return null;
  return personOf(state, id)?.stats ?? null;
}

function teamMechanic(state: CareerState, team: number): MechanicStats | null {
  const stats = seated(state, state.teams[team].seats.mechanic);
  return stats === null ? null : mechanicStats(stats);
}

function slotOneHands(state: CareerState, team: number): DriverStats {
  const stats = seated(state, state.teams[team].seats.driver);
  return stats === null ? STAND_IN : driverStats(stats);
}

function slotZeroHands(
  state: CareerState,
  team: number,
  { hands }: FitOptions
): Hands {
  if (team === 0) return hands;
  const { owner } = state.teams[team];
  return owner === null ? STAND_IN : driverStats(owner.stats);
}

function spec(
  ship: Team['ships'][number],
  mechanic: MechanicStats | null,
  place: Pick<ShipSpec, 'team' | 'slot' | 'standing' | 'hands'>
): ShipSpec {
  return { ...place, ...shipValues(ship.fitted, ship.gun, mechanic) };
}

function specsAt(
  state: CareerState,
  team: number,
  standing: number,
  options: FitOptions
): [ShipSpec, ShipSpec] {
  const { ships } = state.teams[team];
  const mechanic = teamMechanic(state, team);
  return [
    spec(ships[0], mechanic, {
      team,
      slot: 0,
      standing,
      hands: slotZeroHands(state, team, options),
    }),
    spec(ships[1], mechanic, {
      team,
      slot: 1,
      standing,
      hands: slotOneHands(state, team),
    }),
  ];
}

export const teamSpecs = (
  state: CareerState,
  team: number,
  options: FitOptions
): [ShipSpec, ShipSpec] =>
  specsAt(state, team, standings(state)[team], options);

export const nextRace = ({ season, race, phase }: RaceOf): Race =>
  phase === 'offseason'
    ? { season: season + 1, race: FIRST_RACE }
    : { season, race };

export function planetSeed(state: CareerState): string {
  const { season, race } = nextRace(state);
  return `${state.seed}/${season}/${race}`;
}

export function planetName(state: CareerState): string {
  const { season, race } = nextRace(state);
  return pick(PLANET_NAMES, state.seed, 'planet', season, race);
}

export function matchSeed(state: CareerState): number {
  const { season, race } = nextRace(state);
  return whole(0, MATCH_SEEDS - 1, state.seed, 'match', season, race);
}

function rating(state: CareerState, field: 'storm' | 'heals'): Rating {
  const { season, race } = nextRace(state);
  return pick(RACE_RATINGS, state.seed, field, season, race);
}

export const stormRating = (state: CareerState): Rating =>
  rating(state, 'storm');

export const healRating = (state: CareerState): Rating =>
  rating(state, 'heals');

export const matchSetup = (
  state: CareerState,
  options: FitOptions
): MatchSetup => ({
  planet: planetSeed(state),
  match: matchSeed(state),
  storm: stormRating(state),
  heals: healRating(state),
  ships: standings(state).flatMap((standing, team) =>
    specsAt(state, team, standing, options)
  ),
});

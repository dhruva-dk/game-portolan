// The fixture desk's Standings: three championships three races in, hers the
// Third (fourth of twenty, as Home has it); the others the same grid's names
// in another order. Prizes shared as the career shares them (spread 1: the
// first the most, by a step each place).

import type { StandingLine } from '../home.ts';
import type { Move, StandingsTable, StandingsView } from '../loop.ts';
import { HOME } from './home.ts';

/** Each championship's prize pool, the first's the most. */
const POOLS = [250000, 110000, 50000];
const NAMES = [
  'First Championship',
  'Second Championship',
  'Third Championship',
];
/** The ports the teams sail from, put before their names as the career's are (the names as long as a career's). */
const PORTS = [
  'Talanness',
  'Galermouth',
  'Varrowmouth',
  'Dunanhaven',
  'Galrock',
  'Galestow',
  'Torisholm',
  'Havenreach',
  'Porishead',
  'Balwick',
  'Wexford',
  'Dunermere',
  'Velanes',
  'Balergate',
  'Delenhythe',
  'Lorisfold',
  'Finenstead',
  'Brackwater',
  'Saltmarsh',
  'Grimhollow',
];

/** Hers: the Third. */
const MINE = 2;

/** A place's share of `pool` among `n`: (n + 1 − place) steps of the n(n + 1)/2. */
const prize = (pool: number, place: number, n: number) =>
  Math.round((pool * (n + 1 - place)) / ((n * (n + 1)) / 2));

/** Where a place moves in championship `tier` of three: the first up (but from the First), the last down (but from the Third). */
const moveOf = (tier: number, place: number, n: number): Move =>
  tier > 0 && place === 1 ? 'up' : tier < 2 && place === n ? 'down' : null;

/** Championship `tier`: Home's table, rotated by `by` for the others (none of them hers). */
function table(tier: number, by: number): StandingsTable {
  const mine = tier === MINE;
  /** `rows` turned on by `by`: the `by`th first. */
  const turned = <T extends StandingLine>(rows: readonly T[]) => [
    ...rows.slice(by),
    ...rows.slice(0, by),
  ];
  const all = HOME.standings.teams.map((t, i) => ({
    ...t,
    name: `${PORTS[i] ?? ''} ${t.name}`,
  }));
  const teams = turned(all).map((t, i) => {
    const place = i + 1,
      move = moveOf(tier, place, all.length),
      next = moveOf(tier, place + 1, all.length);
    return {
      ...t,
      place,
      points: all[i]?.points ?? 0,
      own: mine && t.own,
      ruled:
        (move === 'up' && next !== 'up') ||
        (move !== 'down' && next === 'down'),
      wins: [2, 1, 0, 0][i] ?? 0,
      podiums: Math.max(0, 3 - Math.floor(i / 2)),
      sinkings: Math.round((all[i]?.points ?? 0) / 3),
      prize: prize(POOLS[tier] ?? 0, place, all.length),
      move,
    };
  });
  const drivers = turned(HOME.standings.drivers).map((d, i) => {
    return {
      ...d,
      place: i + 1,
      points: HOME.standings.drivers[i]?.points ?? 0,
      own: mine && d.own,
      ruled: false,
      wins: [2, 1][i] ?? 0,
      podiums: [3, 2, 2, 1][i] ?? 0,
    };
  });
  return {
    championship: NAMES[tier] ?? '',
    pool: POOLS[tier] ?? 0,
    teams,
    drivers,
  };
}

export const STANDINGS: StandingsView = {
  round: HOME.next.round - 1,
  rounds: HOME.next.rounds,
  mine: MINE,
  chairman: { target: HOME.chairman.target, standing: HOME.chairman.standing },
  championships: [table(0, 7), table(1, 13), table(2, 0)],
};

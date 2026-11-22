// The fixture desk's Home: a season three races in, her team fourth of twenty,
// the two tables whole (twenty teams, their eighty drivers), three drivers
// being scouted.

import { TEAM } from '../../race.ts';
import type { HomeView, StandingLine } from '../home.ts';
import { HERS, TEAMS } from './teams.ts';

/** The teams' points, in the order they stand. */
const POINTS = [
  74, 55, 51, 48, 42, 40, 38, 35, 28, 17, 15, 12, 10, 8, 6, 4, 3, 2, 1, 0,
];

const SURNAMES = [
  'Balcazar',
  'Mori',
  'Parker',
  'White',
  'Kumar',
  'Okafor',
  'Lindqvist',
  'Duarte',
  'Hale',
  'Serrano',
  'Quill',
  'Marsh',
  'Tanaka',
  'Brandt',
  'Ferreira',
  'Nowak',
  'Ashby',
  'Calder',
  'Rousseau',
  'Voss',
];
const INITIALS = 'CLDBVAMJHSQRTEFNKGPW';

/** A driver's share of their team's points: the first of a team the most. */
const SHARES = Array.from(
  { length: TEAM },
  (_, j) => (TEAM - j) / ((TEAM * (TEAM + 1)) / 2)
);

const teams: readonly StandingLine[] = TEAMS.map((team, i) => ({
  place: i + 1,
  name: team.name,
  team,
  points: POINTS[i] ?? 0,
  own: team === HERS,
  ruled: i === 0,
}));

const drivers: readonly StandingLine[] = TEAMS.flatMap((team, i) =>
  SHARES.map((share, j) => ({
    name: `${INITIALS.charAt((i + 3 * j) % INITIALS.length)}. ${SURNAMES[(i * 3 + j * 7) % SURNAMES.length] ?? ''}`,
    team,
    points: Math.round((POINTS[i] ?? 0) * share),
  }))
)
  .sort((a, b) => b.points - a.points)
  .map((d, k) => ({
    ...d,
    place: k + 1,
    own: d.team === HERS,
    ruled: k === 0,
  }));

/** The team a scouted driver sails for: the `i`th of the table. */
const of = (i: number) => TEAMS[i] ?? HERS;

export const HOME: HomeView = {
  team: HERS,
  championship: 'Third Championship',
  drivers: drivers
    .filter((d) => d.own)
    .map(({ name, place }) => ({ name, place })),
  chairman: {
    happiness: 0.9,
    security: { label: 'Very Secure', mood: 'good' },
    target: 3,
    standing: { label: 'Below Target', mood: 'bad' },
  },
  stats: [
    { name: 'Ship', value: 0.05, best: 0.92, average: 0.55 },
    { name: 'Drivers', value: 0.48, best: 0.86, average: 0.42 },
    { name: 'Headquarters', value: 0.15, best: 0.7, average: 0.38 },
    { name: 'Staff', value: 0.77, best: 0.8, average: 0.62 },
    { name: 'Sponsors', value: 0.98, best: 0.98, average: 0.53 },
  ],
  news: {
    kind: 'building',
    headline: 'Building Unlocked',
    subject: 'Sail Loft',
    status: 'Available',
    button: 'Sail Loft',
    screen: 'hq',
  },
  work: [
    {
      kind: 'Scouting',
      jobs: [
        {
          id: 'scout-parker',
          name: 'D. Parker',
          team: of(7),
          done: 0.62,
          days: 19,
          details: 'Driver Details',
          cancels: true,
        },
        {
          id: 'scout-white',
          name: 'B. White',
          team: of(12),
          done: 0.44,
          days: 27,
          details: 'Driver Details',
          cancels: true,
        },
        {
          id: 'scout-kumar',
          name: 'V. Kumar',
          team: of(1),
          done: 0.4,
          days: 27,
          details: 'Driver Details',
          cancels: true,
        },
      ],
    },
    {
      kind: 'Part Design',
      jobs: [
        {
          id: 'part-mainsail',
          name: 'Mainsail',
          team: null,
          done: 0.3,
          days: 12,
          details: 'Part Details',
          cancels: false,
        },
      ],
    },
  ],
  next: { round: 3, rounds: 10, name: 'Brindle' },
  standings: { teams, drivers },
};

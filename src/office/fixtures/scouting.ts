// The fixture's market: drivers of other teams and free agents, some scouted
// (their stars known) and some not (a range), one contract in its closing days,
// a talk waiting on an answer and one countered, someone silent; two on the
// shortlist; her one scout at work, and the crow's nest with room for another.

import type { ScoutingRow, ScoutingView } from '../people.ts';
import { PROFILE, figure } from './profile.ts';
import { HERS, TEAMS } from './teams.ts';

/** Someone on the market: of team `of` (null: a free agent), their stars `[lo, hi]` and potential, known or not. */
const someone = (
  id: number,
  name: string,
  age: number,
  of: number | null,
  [lo, hi]: readonly [number, number],
  [plo, phi]: readonly [number, number],
  contract: string,
  ask: string,
  talk: string | null = null
): ScoutingRow => ({
  id,
  face: {
    seed: id,
    role: 'driver',
    age,
    colours: of === null ? null : { dye: of, pattern: 0 },
    emblem: of,
  },
  name,
  age,
  stars: { lo, hi, known: lo === hi },
  potential: { lo: plo, hi: phi, known: plo === phi },
  team: of === null ? 'Free agent' : (TEAMS[of]?.name ?? 'A team'),
  contract,
  ask,
  talk,
});

const ROWS: readonly ScoutingRow[] = [
  someone(40, 'R. Vance', 29, 0, [4, 4], [4.5, 4.5], 'S4', '2,400'),
  someone(
    41,
    'E. Marlow',
    24,
    1,
    [3, 4.5],
    [4, 5],
    'S3 · ending',
    '1,900',
    'Answer 14 May'
  ),
  someone(42, 'H. Okafor', 33, 2, [3.5, 3.5], [3.5, 3.5], 'S5', '1,650'),
  someone(43, 'J. Penrose', 21, null, [2, 3.5], [3, 5], 'Free', '700'),
  someone(
    44,
    'C. Abernathy',
    27,
    4,
    [3, 3],
    [3.5, 3.5],
    'S3',
    '1,100',
    'Countered'
  ),
  someone(45, 'L. Dacre', 36, 5, [3, 3], [3, 3], 'S3 · ending', '950'),
  someone(46, 'N. Ferrier', 19, null, [1.5, 3], [3, 4.5], 'Free', '400'),
  someone(
    47,
    'P. Lindqvist',
    30,
    6,
    [2.5, 4],
    [3, 4.5],
    'S4',
    '1,200',
    'Silent'
  ),
  someone(48, 'W. Achebe', 26, 7, [2.5, 2.5], [3, 3], 'S4', '800'),
  someone(49, 'G. Holloway', 41, null, [2, 2], [2, 2], 'Free', '450'),
  someone(50, 'A. Reyes', 23, 8, [1.5, 3], [2.5, 4], 'S5', '600'),
  someone(51, 'T. Brask', 28, 9, [2, 2], [2.5, 2.5], 'S3', '650'),
  someone(52, 'O. Sandoval', 31, 10, [1.5, 2.5], [2, 3], 'S4', '520'),
  someone(53, 'F. Kemp', 22, null, [1, 2], [2, 3.5], 'Free', '300'),
];

export const SCOUTING: ScoutingView = {
  top: PROFILE.top,
  filter: {
    role: 'driver',
    tier: null,
    contract: 'any',
    known: false,
    stars: 0,
  },
  roles: [
    { id: 'driver', label: 'Drivers' },
    { id: 'mechanic', label: 'Mechanics' },
    { id: 'designer', label: 'Designers' },
    { id: 'scout', label: 'Scouts' },
    { id: 'pit', label: 'Pit crew' },
  ],
  tiers: ['First Championship', 'Second Championship', 'Third Championship'],
  rows: ROWS,
  count: String(ROWS.length),
  shortlist: ROWS.filter((r) => r.id === 41 || r.id === 43),
  scouts: [
    {
      id: 16,
      face: {
        seed: 16,
        role: 'scout',
        age: 36,
        colours: PROFILE.face.colours,
        emblem: HERS.emblem,
      },
      name: 'Bel Haskett',
      stars: 3,
      reach: 'Next tier',
      on: { person: 412, name: 'J. Penrose' },
      days: figure('Scouting', [9, '9d'], 'report 19 May', [
        ['Sent', '6 May'],
        ['Report', '19 May'],
      ]),
      cancel: { ok: true, why: '' },
    },
  ],
  nest: figure("Crow's nest", [2, 'Level 2'], 'scouts 1 of 2', [
    ['Level', '2'],
    ['Scouts allowed', '2'],
    ['Scouts hired', '1'],
  ]),
};

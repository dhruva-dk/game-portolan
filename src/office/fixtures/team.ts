// The fixture's team: her on ship one, three drivers on the others and a
// reserve, a mechanic a ship (each ship's bond at another level), the designer,
// one scout and a scout's post open, six of the pit crew and the chairman; one
// driver's contract in its closing days, one driver's morale low.

import type { Role, Ship } from '../command.ts';
import type { Act, PitRow, Range, RosterRow, TeamView } from '../people.ts';
import { HOME } from './home.ts';
import { PROFILE, figure } from './profile.ts';
import { HERS } from './teams.ts';

const known = (n: number): Range => ({ lo: n, hi: n, known: true });
const shut = (why: string): Act => ({ ok: false, why });
const CLOSING = shut("Opens in the contract's last 60 days.");

/** A person of hers: their id, role, name, post, age, stars and potential, morale, wage, ends, traits, renewal. */
function person(
  id: number,
  role: Role,
  title: string,
  post: string,
  age: number,
  stars: Range,
  potential: Range,
  more: {
    morale?: number;
    wage?: string;
    ends?: string;
    tags?: readonly string[];
    renew?: Act;
    you?: boolean;
  } = {}
): RosterRow {
  return {
    kind: 'person',
    id,
    you: more.you ?? false,
    title,
    face: {
      seed: id,
      role,
      age,
      colours: PROFILE.face.colours,
      emblem: HERS.emblem,
    },
    post,
    age: String(age),
    stars,
    potential,
    morale: more.morale ?? null,
    wage: more.wage ?? '—',
    ends: more.ends ?? '—',
    tags: more.tags ?? [],
    find: null,
    renew: more.you ? null : (more.renew ?? CLOSING),
  };
}

/** A row with nothing in it: a heading's, before its title. */
const BLANK: RosterRow = {
  kind: 'head',
  id: null,
  you: false,
  title: '',
  face: null,
  post: '',
  age: '',
  stars: null,
  potential: null,
  morale: null,
  wage: '',
  ends: '',
  tags: [],
  find: null,
  renew: null,
};
const head = (title: string): RosterRow => ({ ...BLANK, title });

const driver = (i: number) => HOME.drivers[i]?.name ?? `Driver ${i}`;

const ROSTER: readonly RosterRow[] = [
  head('Drivers'),
  person(1, 'manager', 'Ada Holt (you)', 'Ship 1', 34, known(3), known(3), {
    you: true,
  }),
  person(7, 'driver', driver(1), 'Ship 2', 27, known(3.5), PROFILE.potential, {
    morale: 71,
    wage: '1,200',
    ends: 'End of Season 3',
    tags: ['Storm Specialist', 'Closer', 'Demanding'],
  }),
  person(8, 'driver', driver(2), 'Ship 3', 22, known(2.5), known(4), {
    morale: 48,
    wage: '800',
    ends: 'End of Season 4',
    tags: ['Young Gun'],
  }),
  person(9, 'driver', driver(3), 'Ship 4', 31, known(2), known(2.5), {
    morale: 19,
    wage: '650',
    ends: 'In 21 days',
    tags: ['Moody'],
    renew: { ok: true, why: '' },
  }),
  person(10, 'driver', driver(0), 'Reserve', 25, known(3), known(3.5), {
    morale: 56,
    wage: '400',
    ends: 'End of Season 3',
  }),
  head('Mechanics'),
  person(11, 'mechanic', 'Hal Merrow', 'Ship 1', 45, known(3), known(3), {
    morale: 66,
    wage: '520',
    ends: 'End of Season 4',
  }),
  person(12, 'mechanic', 'Tobin Reave', 'Ship 2', 38, known(3.5), known(4), {
    morale: 74,
    wage: '610',
    ends: 'End of Season 3',
    tags: ['Steady Hands'],
  }),
  person(13, 'mechanic', 'Iva Sorrel', 'Ship 3', 29, known(2.5), known(3.5), {
    morale: 58,
    wage: '430',
    ends: 'End of Season 5',
  }),
  person(14, 'mechanic', 'Dun Kestle', 'Ship 4', 52, known(2), known(2), {
    morale: 40,
    wage: '380',
    ends: 'End of Season 3',
  }),
  head('Designer'),
  person(15, 'designer', 'Wen Corral', 'Designer', 41, known(4), known(4), {
    morale: 63,
    wage: '1,450',
    ends: 'End of Season 5',
    tags: ['Innovator'],
  }),
  head('Scouts'),
  person(16, 'scout', 'Bel Haskett', 'Scout', 36, known(3), known(3), {
    morale: 70,
    wage: '300',
    ends: 'End of Season 4',
  }),
  {
    ...head('Scout'),
    kind: 'open',
    post: 'Open',
    find: { role: 'scout', status: 'staff' },
  },
  head('Pit crew'),
  ...[
    'Ned Fallow',
    'Pru Ostrey',
    'Cass Lund',
    'Orrin Vey',
    'Sim Tackett',
    'Lo Brannagh',
  ].map((name, i) =>
    person(
      20 + i,
      'pit',
      name,
      'Pit crew',
      24 + i * 3,
      known(2 + (i % 3) * 0.5),
      known(3),
      { morale: 50 + i * 5, wage: '120', ends: 'End of Season 3' }
    )
  ),
  head('Chairman'),
  person(
    30,
    'chairman',
    'Lord Avery Tamsin',
    'Chairman',
    63,
    known(3),
    known(3),
    { renew: shut("Chairmen and managers are the chairman's.") }
  ),
];

/** Each ship's races together, and the levels' marks (TUNING.bond.levels 5, 12, 20). */
const LEVELS = [5, 12, 20],
  TOP = 20;
const bond = (ship: Ship, races: number) => {
  const level = LEVELS.filter((at) => races >= at).length,
    next = LEVELS[level];
  return {
    ship,
    label: `Ship ${ship + 1}`,
    fill: Math.min(100, (races / TOP) * 100),
    marks: LEVELS.map((at) => at / TOP),
    level,
    bond: figure(
      'Bond',
      [races, `Level ${level} of ${LEVELS.length}`],
      next === undefined ? 'the strongest bond' : `next at ${next} races`,
      [
        ['Races together', String(races)],
        ...LEVELS.map((at, i) => [`Level ${i + 1} at`, `${at} races`] as const),
      ]
    ),
  };
};

const pit = (
  id: number,
  name: string,
  work: number,
  slip: number,
  tired: number
): PitRow => ({
  id,
  face: {
    seed: id,
    role: 'pit',
    age: 30,
    colours: PROFILE.face.colours,
    emblem: HERS.emblem,
  },
  name,
  work: figure('Work', [work, work.toFixed(2)], 'best 1.12', [
    ['Rested', '1.12'],
  ]),
  slip: figure(
    'Slip chance',
    [slip, `${Math.round(slip * 100)}%`],
    'rested 4%',
    [['From Precision and Nerve', '4%']]
  ),
  fatigue: figure('Fatigue', [tired, String(tired)], 'a day −6', [
    ['After the last race', String(tired + 12)],
  ]),
});

export const TEAM: TeamView = {
  top: PROFILE.top,
  roster: ROSTER,
  wages: figure('Wages a race', [7660, '7,660'], 'income a race 9,400', [
    ['Driver', '3,050'],
    ['Mechanic', '1,940'],
    ['Designer', '1,450'],
    ['Scout', '300'],
    ['Pit crew', '720'],
    ['Income a race', '9,400'],
  ]),
  open: [{ role: 'scout', status: 'staff', label: 'Scout' }],
  bonds: [bond(0, 14), bond(1, 11), bond(2, 3), bond(3, 22)],
  pit: [
    pit(20, 'Ned Fallow', 1.12, 0.04, 8),
    pit(21, 'Pru Ostrey', 1.05, 0.05, 14),
    pit(22, 'Cass Lund', 0.98, 0.07, 22),
    pit(23, 'Orrin Vey', 0.94, 0.06, 5),
    pit(24, 'Sim Tackett', 0.9, 0.09, 31),
    pit(25, 'Lo Brannagh', 0.86, 0.08, 12),
  ],
  stops: ([0, 1, 2, 3] as const).map((ship, i) => ({
    ship,
    pace: figure(
      'Pit stop time',
      [1, `× ${[0.97, 0.97, 1, 0.9][i]?.toFixed(2)}`],
      'spec × 1.00',
      [
        ['Bond level', String([2, 1, 0, 3][i])],
        ['Pit crew', '6'],
      ]
    ),
    slip: figure('Slip chance', [0.06, '6%'], 'a job slips', [
      ['Each job of a stop', '6%'],
    ]),
  })),
};

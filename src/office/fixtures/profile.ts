// The fixture's profile: one of her own drivers, known, on ship two beside her
// mechanic, with conditional traits among the rest and a contract in its last
// season, as a career would hand it to the screen.

import type { Figure } from '../career.ts';
import type { ProfileView, StatLine } from '../people.ts';
import { HOME } from './home.ts';
import { HERS } from './teams.ts';

/** The figure `title`, set against `against`, made of `lines`. */
export const figure = (
  title: string,
  [value, text]: readonly [number, string],
  against: string,
  lines: readonly (readonly [string, string])[]
): Figure => ({
  value,
  text,
  against: { kind: 'rival', label: 'against', text: against },
  explain: {
    title,
    lines: lines.map(([label, amount]) => ({ label, amount })),
  },
});

/** A stat at `value`, its ceiling, which way it heads. */
const stat = (
  label: string,
  value: number,
  ceiling: number,
  arrow: -1 | 0 | 1
): StatLine => ({ label, value, ceiling, arrow, text: String(value) });

const AGE = 27,
  NAME = HOME.drivers[1]?.name ?? 'Mara Quill';
/** Her team's dye, as the dyes the desk hands out with the view (desk.ts) index it. */
const COLOURS = { dye: HERS.emblem, pattern: 0 };

export const PROFILE: ProfileView = {
  top: {
    name: 'Ada Holt',
    face: {
      seed: 1,
      role: 'manager',
      age: 34,
      colours: COLOURS,
      emblem: HERS.emblem,
    },
    team: HERS.name,
    emblem: HERS.emblem,
    colours: COLOURS,
    date: '10 May 1716',
    balance: figure('Balance', [211000, '211,000'], 'last race', []),
    unread: 6,
    dilemma: false,
    go: { label: 'Continue', raceDay: false, blocker: null },
  },
  id: 7,
  known: true,
  mine: true,
  you: false,
  face: {
    seed: 7,
    role: 'driver',
    age: AGE,
    colours: COLOURS,
    emblem: HERS.emblem,
  },
  name: NAME,
  role: 'driver',
  roleName: 'Driver',
  age: AGE,
  colony: 'Brindle',
  team: HERS.name,
  tier: 'Third Championship',
  post: 'Ship 2',
  stars: { lo: 3.5, hi: 3.5, known: true },
  potential: { lo: 4, hi: 4.5, known: false },
  traits: [
    {
      name: 'Storm Specialist',
      effect: '+2 Stormcraft',
      lasts: 'When the storm runs slow',
      sense: 1,
    },
    {
      name: 'Closer',
      effect: '+1 Nerve, +1 Consistency',
      lasts: "The season's last three races",
      sense: 1,
    },
    { name: 'Demanding', effect: 'Asks 15% more', lasts: 'Always', sense: -1 },
  ],
  bond: {
    with: 'Tobin Reave',
    figure: figure('Bond', [62, 'Steady'], 'strongest', [
      ['Races together', '11'],
      ['Podiums together', '+3'],
    ]),
    share: 0.62,
  },
  morale: figure('Morale', [71, '71'], 'leaves under 25', [
    ['Now', '71'],
    ['Asks to leave under', '25'],
  ]),
  marketability: figure('Marketability', [48, '48'], 'of 100', [
    ['Raw', '44'],
    ['With traits', '+4'],
  ]),
  wants: [
    { want: 'money', label: 'Money' },
    { want: 'tier', label: 'A higher tier' },
    { want: 'security', label: 'Security' },
  ],
  stats: [
    stat('Helm', 15, 17, 1),
    stat('Gunnery', 12, 14, 0),
    stat('Seamanship', 9, 13, 1),
    stat('Nerve', 17, 18, 0),
    stat('Consistency', 7, 11, 1),
    stat('Stormcraft', 19, 20, 0),
    stat('Stamina', 13, 13, -1),
    stat('Feedback', 4, 8, 0),
    stat('Lookout', 11, 15, 1),
  ],
  statsNote: '',
  specifics: [
    {
      label: 'Feedback a race',
      figure: figure('Feedback a race', [1.4, '1.4'], 'average 2.0', [
        ['Feedback', '4'],
      ]),
    },
    {
      label: 'Fitness',
      figure: figure('Unfit', [0, 'Fit'], 'misses none', [
        ['Races to miss', '0'],
      ]),
    },
  ],
  history: [
    {
      season: 'S3',
      team: HERS.name,
      tier: 'L3',
      role: 'Driver',
      races: 3,
      best: '2',
      points: 31,
      sinkings: 4,
    },
    {
      season: 'S2',
      team: HERS.name,
      tier: 'L3',
      role: 'Driver',
      races: 8,
      best: '1',
      points: 74,
      sinkings: 9,
    },
    {
      season: 'S1',
      team: 'Petrel',
      tier: 'L3',
      role: 'Driver',
      races: 8,
      best: '5',
      points: 22,
      sinkings: 3,
    },
  ],
  contract: {
    title: `Driver, ${HERS.name}`,
    terms: [
      { label: 'Post', amount: 'Ship 2' },
      { label: 'Wage', amount: '1,200 a race' },
      { label: 'Ends', amount: 'End of Season 3' },
      { label: 'Podium bonus', amount: '400' },
      { label: 'Sinking bonus', amount: '60' },
      { label: 'Break clause', amount: 'None' },
    ],
    parties: [HERS.name, NAME],
  },
  talk: null,
  scout: { ok: false, why: 'Known.', scout: null, label: 'Scout' },
  offer: { ok: false, why: 'Already yours.' },
  renew: { ok: false, why: "Opens in the contract's last 60 days." },
  dismiss: {
    ok: true,
    why: '',
    owed: figure('Owed on dismissal', [6000, '6,000'], 'wage a race 1,200', [
      ['Wage a race', '1,200'],
      ['Races left', '5'],
    ]),
  },
};

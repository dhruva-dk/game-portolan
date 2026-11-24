// The Federation as the fixture career has it, mid-season: the storm's pace put
// to the vote, closing in nine days; a few teams have voted, the rest lean; you
// have not voted; the first proposal of the season (the sea-held point) was
// carried, so next season's rules differ from this one's there.

import type { RegulationsView, Leaning, Side } from '../regulations.ts';
import { HERS, TEAMS } from './teams.ts';

const MANAGERS = [
  'Ottoline Quarrie',
  'Bastian Fenwick-Lowe',
  'Imelda Coyle',
  'Reuben Strand',
  'Philippa Marchbanks',
  'Tobias Achterberg',
  'Clemency Hale',
  'Wystan Prowse',
  'Aurelie Danvers',
  'Gideon Thrale',
  'Morwenna Pike',
  'Lucan Ferrers',
  'Hester Vayle',
  'Caspian Rook',
  'Isolde Garrick',
  'Barnaby Quell',
  'Persephone Mallory',
  'Edwin Sallow',
  'Rosamund Teague',
  'Cyprian Holt',
];

/** Each team's side, and whether it has voted, in the standings' order. */
const SIDES: readonly (readonly [Side, boolean])[] = [
  ['for', true],
  ['against', false],
  ['for', false],
  ['against', true],
  ['abstain', false],
  ['for', false],
  ['against', false],
  ['for', true],
  ['abstain', false],
  ['against', false],
  ['for', false],
  ['abstain', false],
  ['against', true],
  ['for', false],
  ['abstain', false],
  ['for', false],
  ['against', false],
  ['abstain', false],
  ['for', false],
  ['abstain', true],
];

const TEAMS_ON: readonly Leaning[] = TEAMS.map((team, i) => {
  const you = team.id === HERS.id,
    [side, cast] = SIDES[i] ?? ['abstain', false];
  return {
    team,
    manager: {
      person: 400 + i,
      name: you ? 'Wren Ashby' : (MANAGERS[i] ?? ''),
    },
    you,
    side: you ? 'abstain' : side,
    cast: you ? false : cast,
    sway: you ? 34 : Math.round(62 - i * 2.4),
  };
});

export const ADMIRALTY: RegulationsView = {
  championship: 'Second Championship',
  season: 2029,
  rules: [
    {
      name: 'Spec parts',
      now: 'Keel',
      next: 'Keel',
      about:
        'Every team fits the one part the Federation issues of these: none of its own design.',
    },
    {
      name: 'Banned guns',
      now: 'Mortar',
      next: 'Mortar',
      about: 'No ship of the championship may mount these.',
    },
    {
      name: 'The storm’s pace',
      now: '×1.0',
      next: '×1.0',
      about:
        'Times each planet’s own: above 1 the storm closes on the sea quicker.',
    },
    {
      name: 'Points a sinking',
      now: '1',
      next: '1',
      about:
        'What a ship scores for each ship she sinks, beside her place’s points.',
    },
    {
      name: 'The sea-held point',
      now: 'Given',
      next: 'None',
      about: 'A point to the ship holding the most sea at a race’s end.',
    },
    {
      name: 'Prize money',
      now: '20.0× the last’s',
      next: '20.0× the last’s',
      about: 'The champion’s share of the prize pool against the last team’s.',
    },
    {
      name: 'Inspections',
      now: '3 of 20 teams',
      next: '3 of 20 teams',
      about:
        'Teams drawn after each race; a part found past the rules is taken, the team fined and its points struck.',
    },
  ],
  proposal: {
    id: 1,
    rule: 'The storm’s pace',
    from: '×1.0',
    to: '×1.1',
    closes: '14 July 2029',
    days: 9,
    carried: null,
    count: { for: 2, against: 2, abstain: 1 },
    teams: TEAMS_ON,
    sway: { for: 184, against: 151 },
    lobbied: { for: 0, against: 250 },
    yours: null,
    vote: { ok: true, why: '' },
    sums: [
      { balance: 100, act: { ok: true, why: '' } },
      { balance: 250, act: { ok: true, why: '' } },
      { balance: 500, act: { ok: true, why: '' } },
      {
        balance: 1000,
        act: {
          ok: false,
          why: 'The chairman will not let the balance fall that far.',
        },
      },
    ],
  },
  counted: [
    {
      id: 0,
      rule: 'The sea-held point',
      from: 'Given',
      to: 'None',
      closes: '30 April 2029',
      days: 0,
      carried: true,
      count: { for: 11, against: 7, abstain: 2 },
    },
  ],
  next: null,
};

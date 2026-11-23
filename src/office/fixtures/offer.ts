// The fixture's negotiation: a driver of another team, not yet scouted (her
// stars a range), countered once and her patience one spent; another team in
// talks with her; the draft asks her onto ship four in T. Quill's place, with a
// break clause.

import type { Offer } from '../command.ts';
import type { OfferView } from '../people.ts';
import { PROFILE, figure } from './profile.ts';
import { HERS, TEAMS } from './teams.ts';

const DRAFT: Offer = {
  role: 'driver',
  status: 'ship',
  wage: 1700,
  fee: 4000,
  seasons: 2,
  podium: 150,
  sinking: 80,
  breakClause: 12000,
  replaces: 9,
};

export const OFFER: OfferView = {
  top: PROFILE.top,
  id: 41,
  name: 'E. Marlow',
  face: {
    seed: 41,
    role: 'driver',
    age: 24,
    colours: { dye: 1, pattern: 0 },
    emblem: 1,
  },
  role: 'driver',
  roleName: 'Driver',
  stars: { lo: 3, hi: 4.5, known: false },
  team: HERS.name,
  draft: DRAFT,
  ask: { wage: 1900, fee: 6000, seasons: 3 },
  statuses: [
    { id: 'ship', label: 'Race seat' },
    { id: 'reserve', label: 'Reserve' },
  ],
  replaces: [
    { id: null, label: 'Open post' },
    { id: 7, label: 'M. Ashby' },
    { id: 8, label: 'S. White' },
    { id: 9, label: 'T. Quill' },
    { id: 10, label: 'B. Serrano' },
  ],
  most: { wage: 5700, fee: 18000, bonus: 1900, breakClause: 76000 },
  cost: {
    now: figure('Cost to sign', [5300, '5,300'], 'their ask 6,000', [
      ['Signing fee', '4,000'],
      ['Break clause', '0'],
      ['Owed the one replaced', '1,300'],
    ]),
    perRace: figure('A race', [1700, '1,700'], 'asks 1,900', [
      ['Wage', '1,700'],
      ['Podium bonus', '150'],
      ['Sinking bonus', '80'],
    ]),
    left: figure('Balance left', [205700, '205,700'], 'floor −50,000', [
      ['Balance', '211,000'],
      ['Cost to sign', '−5,300'],
    ]),
  },
  wants: [
    { want: 'money', label: 'Money', value: 0.74, text: '89%' },
    { want: 'status', label: 'A race seat', value: 0.83, text: '100%' },
    { want: 'tier', label: 'Championship', value: 0.25, text: '30%' },
    { want: 'ambition', label: 'Ambition', value: 0.5, text: '60%' },
    { want: 'security', label: 'Security', value: 0.56, text: '67%' },
  ],
  patience: { left: 2, of: 3 },
  last: 'Close, but not yet: they ask for more.',
  earlier: [
    { day: '9 May', answer: 'Close, but not yet: they ask for more.' },
    { day: '4 May', answer: 'Not interested at these terms.' },
  ],
  rivals: [TEAMS[0]?.name ?? 'Halcyon'],
  counter: { ...DRAFT, wage: 1850, fee: 5500, seasons: 3 },
  state: 'countered',
  stateText: 'Countered',
  send: { ok: true, why: '' },
  accept: { ok: true, why: '' },
  withdraw: { ok: true, why: '' },
};

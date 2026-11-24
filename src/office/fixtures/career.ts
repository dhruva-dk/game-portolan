// The fixture's player as a manager, four seasons in (1716 to 1718 behind her,
// 1719 under way), and two posts offered: one she may take, one shut. The jobs
// screen's letter as the career writes it when she is sought. Names as long as
// a career's.

import type { CareerView, JobCard, JobsView } from '../people.ts';
import { PROFILE, figure } from './profile.ts';
import { HERS, TEAMS } from './teams.ts';

/** A team's offer of its post, from the fixture's teams by place. */
const post = (
  at: number,
  chairman: [number, string],
  more: Partial<JobCard> = {}
): JobCard => {
  const t = TEAMS[at] ?? HERS;
  return {
    team: t.id,
    name: t.name,
    tier: 'Second Championship',
    colours: { dye: t.emblem, pattern: 0 },
    emblem: t.emblem,
    chairmanId: chairman[0],
    chairman: chairman[1],
    chairmanFace: {
      seed: chairman[0],
      role: 'chairman',
      age: 58,
      colours: { dye: t.emblem, pattern: 0 },
      emblem: t.emblem,
    },
    target: '6th',
    budget: figure('Budget', [640000, '640,000'], 'in hand 212,000', [
      ['A season', '640,000'],
      ['In hand', '212,000'],
    ]),
    standing: '9th of 20',
    ranks: { ships: '11th', drivers: '7th', hq: '14th' },
    expires: '24 May 1716',
    take: { ok: true, why: '' },
    decline: { ok: true, why: '' },
    ...more,
  };
};

const OFFERS: readonly JobCard[] = [
  post(2, [88, 'Aurelian Fitzwarren-Blythe']),
  post(11, [93, 'Odile Marchbank'], {
    tier: 'First Championship',
    target: '3rd',
    standing: '5th of 20',
    budget: figure('Budget', [1250000, '1,250,000'], 'in hand 480,000', [
      ['A season', '1,250,000'],
      ['In hand', '480,000'],
    ]),
    expires: '2 June 1716',
    take: { ok: false, why: 'It is race day: sail it first.' },
  }),
];

export const PLAYER: CareerView = {
  top: PROFILE.top,
  face: PROFILE.top.face,
  name: 'Ada Holt',
  teamId: HERS.id,
  team: HERS.name,
  age: 34,
  reputation: figure('Reputation', [58, '58'], 'best rival 81', [
    ['Now', '58'],
    ['First Championship posts at', '70'],
    ['Second Championship posts at', '45'],
  ]),
  rank: {
    ...figure('Rank of managers', [14, '14th'], 'of 60', [
      ['Above you', '13'],
      ['Managers', '60'],
    ]),
    against: { kind: 'rank', place: 14, of: 60 },
  },
  marketability: figure('Marketability', [46, '46'], 'of 100', [
    ['Raw', '41'],
    ['With traits', '46'],
  ]),
  confidence: figure('Chairman’s confidence', [62, '62'], 'sacked under 20', [
    ['Now', '62'],
    ['Target place', '4th'],
    ['Sacked under', '20'],
  ]),
  posts: [
    { tier: 'First Championship', at: 70, open: false },
    { tier: 'Second Championship', at: 45, open: true },
    { tier: 'Third Championship', at: 0, open: true },
  ],
  record: [
    {
      season: '1719',
      teamId: HERS.id,
      team: HERS.name,
      tier: 'Third Championship',
      role: 'Manager',
      races: 2,
      points: 31,
      honours: [],
      review: null,
    },
    {
      season: '1718',
      teamId: HERS.id,
      team: HERS.name,
      tier: 'Third Championship',
      role: 'Manager',
      races: 10,
      points: 148,
      honours: ['Race won'],
      review: 2,
    },
    {
      season: '1717',
      teamId: TEAMS[5]?.id ?? null,
      team: TEAMS[5]?.name ?? 'Free',
      tier: 'Second Championship',
      role: 'Manager',
      races: 10,
      points: 92,
      honours: ['Race won'],
      review: 1,
    },
    {
      season: '1716',
      teamId: null,
      team: 'Free',
      tier: '—',
      role: 'Manager',
      races: 0,
      points: 0,
      honours: [],
      review: null,
    },
  ],
  offers: OFFERS,
};

export const JOBS: JobsView = {
  sacked: false,
  letter: {
    from: `${OFFERS[0]?.chairman ?? ''}, chairman of ${OFFERS[0]?.name ?? ''}`,
    fromId: OFFERS[0]?.chairmanId ?? null,
    face: OFFERS[0]?.chairmanFace ?? null,
    title: `${OFFERS[0]?.name ?? ''} wants you`,
    paragraphs: ['The post is yours if you take it.'],
  },
  offers: OFFERS,
};

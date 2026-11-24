// Race day's plan as the fixture career has it: your three drivers on ships 2
// to 4, the reserve and the best free drivers to stand in, each ship's six
// parts with a spare hull and sails, one sponsor with objectives.

import { SHIPS } from '../command.ts';
import type { PlanView, Sailor } from '../loop.ts';
import type { PartLine } from '../papers.ts';
import { HOME } from './home.ts';
import { HERS } from './teams.ts';

const TYPES = [
  ['sails', 'Sails'],
  ['rigging', 'Rigging'],
  ['rudder', 'Rudder'],
  ['hull', 'Hull'],
  ['keel', 'Keel'],
  ['mounts', 'Mounts'],
] as const;

/** Each ship's parts, the first ship's best; then a spare hull and sails. */
const PARTS: readonly PartLine[] = [
  ...SHIPS.flatMap((ship) =>
    TYPES.map(
      ([type, name], t): PartLine => ({
        id: ship * 6 + t,
        type,
        name,
        perf: 640 - ship * 35 - t * 12,
        perfMax: 720 - t * 10,
        reliability: 0.82 - ship * 0.04,
        condition: 0.9 - ((ship + t) % 4) * 0.12,
        ship,
        spec: type === 'keel',
      })
    )
  ),
  {
    id: 30,
    type: 'hull',
    name: 'Hull',
    perf: 668,
    perfMax: 740,
    reliability: 0.7,
    condition: 1,
    ship: null,
    spec: false,
  },
  {
    id: 31,
    type: 'sails',
    name: 'Sails',
    perf: 590,
    perfMax: 690,
    reliability: 0.88,
    condition: 0.64,
    ship: null,
    spec: false,
  },
];

const OWN: readonly Sailor[] = HOME.drivers
  .slice(1)
  .map((d, i) => ({
    person: d.person,
    name: d.name,
    stars: 3.5 - i,
    standIn: false,
    fee: 0,
  }));

const SAILORS: readonly Sailor[] = [
  ...OWN,
  { person: 901, name: 'Tamsin Rook', stars: 2, standIn: false, fee: 0 },
  { person: 902, name: 'Josiah Pell', stars: 3, standIn: true, fee: 1400 },
  { person: 903, name: 'Mirabel Oakes', stars: 2.5, standIn: true, fee: 950 },
  { person: 904, name: 'Florian Dace', stars: 2, standIn: true, fee: 700 },
];

export const PLAN: PlanView = {
  team: HERS,
  round: HOME.next.round,
  rounds: HOME.next.rounds,
  name: HOME.next.name,
  championship: 'Third Championship',
  ships: SHIPS.map((ship) => ({
    ship,
    you: ship === 0,
    driver: ship === 0 ? null : (OWN[ship - 1] ?? null),
    parts: TYPES.map(([type, label]) => ({
      type,
      label,
      fitted: PARTS.find((p) => p.ship === ship && p.type === type) ?? null,
      others: PARTS.filter((p) => p.ship !== ship && p.type === type),
    })),
  })),
  sailors: SAILORS,
  sponsors: [
    {
      slot: 0,
      name: 'Gullhaven Salt Co.',
      bonus: 1800,
      objectives: [
        'Finish in the top ten',
        'Sink two ships',
        'Hold the most sea',
      ],
      chosen: 0,
    },
  ],
  drivers: OWN.map((d) => d.person),
  objectives: [0, null],
  set: { ok: true, why: '' },
  call: 'free',
  blocked: null,
  waiting: false,
};

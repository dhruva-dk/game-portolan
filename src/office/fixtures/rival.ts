// The fixture desk's Rival: the team second in her championship, as the
// fixture's Standings has it: a Poacher in charge, under some pressure, its
// drivers as Home's table has them, its staff half scouted.

import type { Range } from '../people.ts';
import type { RivalView } from '../rival.ts';
import { HOME } from './home.ts';
import { STANDINGS } from './standings.ts';

const hers = STANDINGS.championships[STANDINGS.mine];
const line = hers?.teams[1];
const mine = hers?.teams.find((t) => t.own);

/** Stars as a scout reads them: a range, or known. */
const range = (lo: number, hi = lo): Range => ({ lo, hi, known: lo === hi });

/** Its drivers in Home's table. */
const sailing = HOME.standings.drivers.filter(
  (d) => d.team.id === line?.team.id
);

export const RIVAL: RivalView = {
  team: line ? { ...line.team, name: line.name } : HOME.team,
  own: false,
  championship: hers?.championship ?? '',
  tier: STANDINGS.mine,
  port: 'Galermouth',
  reputation: 58,
  manager: {
    person: 301,
    name: 'Ottoline Varga',
    you: false,
    personality: 'Poacher',
    spends: 1.1,
    first: ['Poaching', 'Replacing the weakest', 'Sponsors'],
    security: { label: 'Under Pressure', mood: 'warn' },
  },
  chairman: {
    person: 302,
    name: 'Bartholomew Esk',
    target: 1,
    standing: { label: 'Below Target', mood: 'bad' },
  },
  season: {
    round: STANDINGS.round,
    rounds: STANDINGS.rounds,
    place: line?.place ?? 2,
    of: hers?.teams.length ?? 20,
    points: line?.points ?? 0,
    wins: line?.wins ?? 0,
    podiums: line?.podiums ?? 0,
    sinkings: line?.sinkings ?? 0,
    leader: hers?.teams[0]?.points ?? 0,
    hers: mine?.points ?? null,
    prize: line?.prize ?? 0,
    move: line?.move ?? null,
  },
  stats: [
    { name: 'Ship', value: 0.71, best: 0.92, average: 0.55 },
    { name: 'Drivers', value: 0.86, best: 0.86, average: 0.42 },
    { name: 'Headquarters', value: 0.4, best: 0.7, average: 0.38 },
    { name: 'Staff', value: 0.52, best: 0.8, average: 0.62 },
    { name: 'Sponsors', value: 0.61, best: 0.98, average: 0.53 },
  ],
  drivers: [
    ...sailing.map((d, i) => ({
      person: d.person ?? 0,
      name: d.name,
      post: `Ship ${i + 1}`,
      stars: i === 0 ? range(4) : range(2.5, 3.5 + (i % 2) * 0.5),
      place: d.points > 0 ? d.place : null,
      points: d.points,
    })),
    {
      person: 303,
      name: 'Wendeline Harrowgate',
      post: 'Reserve',
      stars: range(1.5, 2.5),
      place: null,
      points: 0,
    },
  ],
  staff: [
    ...['Iolo Brask', 'Femke Saltire', 'Rafe Cauldwell', 'Ines Mardle'].map(
      (name, i) => ({
        person: 310 + i,
        name,
        post: `Mechanic, Ship ${i + 1}`,
        stars: i === 1 ? range(3.5) : range(2, 3),
      })
    ),
    {
      person: 320,
      name: 'Casimir Oakenshaw',
      post: 'Designer',
      stars: range(4.5),
    },
    { person: 321, name: 'Nell Fathom', post: 'Scout', stars: range(2, 3.5) },
    { person: 322, name: 'Tobias Reed', post: 'Scout', stars: range(1.5, 2.5) },
    ...['Hob Gartner', 'Lise Ankarstrom', 'Mungo Pell', 'Agathe Rowe'].map(
      (name, i) => ({
        person: 330 + i,
        name,
        post: 'Pit Crew',
        stars: range(1.5 + (i % 3) * 0.5, 2.5 + (i % 2) * 0.5),
      })
    ),
  ],
};

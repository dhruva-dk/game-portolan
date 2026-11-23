// The fixture championship's twenty teams, in the order they stand, for the
// debug page's office (?screen=) and the tests: each a name, an emblem and one
// of the ships' dyes with the mark that stands out on it, as a ship of that dye
// is drawn. Hers is HERS.

import { linearToHex, type Rgb } from '../../colour.ts';
import {
  CERISE,
  CHARCOAL,
  CHARTREUSE,
  CORAL,
  LEMON,
  MOSS,
  MURREY,
  OCHRE,
  OLIVE,
  OXBLOOD,
  PEACH,
  PEWTER,
  ROSE,
  TANGERINE,
  UMBER,
  VERMILION,
  markOn,
} from '../../palette.ts';
import type { Team } from '../office.ts';

const DYES: readonly Rgb[] = [
  CHARCOAL,
  OCHRE,
  MOSS,
  VERMILION,
  LEMON,
  MURREY,
  ROSE,
  CORAL,
  TANGERINE,
  CHARTREUSE,
  OLIVE,
  OXBLOOD,
  UMBER,
  CERISE,
  PEACH,
  PEWTER,
];

const NAMES = [
  'Halcyon',
  'Corsair',
  'Meridian',
  'Kittiwake',
  'Tern Rock',
  'Petrel',
  'Skua',
  'Gannet',
  'Fulmar',
  'Cormorant',
  'Shearwater',
  'Sandpiper',
  'Curlew',
  'Osprey',
  'Heron',
  'Pelican',
  'Albatross',
  'Guillemot',
  'Frigatebird',
  'Razorbill',
] as const;

/** The team named `name`, the `i`th of the table: its emblem and dye by that. */
const team = (name: string, i: number): Team => {
  const dye = DYES[i % DYES.length] ?? VERMILION;
  return {
    id: i,
    name,
    emblem: i,
    colours: [linearToHex(dye), linearToHex(markOn(dye))],
  };
};

/** Where her team stands in the fixture's table (from 0). */
const HER_PLACE = 3;

export const TEAMS: readonly Team[] = NAMES.map(team);
export const HERS = TEAMS[HER_PLACE] ?? team(NAMES[HER_PLACE], HER_PLACE);

// The fixture championship's twenty teams, for the debug page's office
// (?screen=) and the tests: each a name, an emblem and one of the ships' dyes
// with the mark that stands out on it, as a ship of that dye is drawn. Hers is
// HERS.

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
  VERMILION,
  OCHRE,
  MOSS,
  ROSE,
  LEMON,
  MURREY,
  CHARCOAL,
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
  'Albatross',
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
  'Kittiwake',
  'Guillemot',
  'Frigatebird',
  'Razorbill',
] as const;

/** The team named `name`, the `i`th of the table: its emblem and dye by that. */
const team = (name: string, i: number): Team => {
  const dye = DYES[i % DYES.length] ?? VERMILION;
  return {
    name,
    emblem: i,
    colours: [linearToHex(dye), linearToHex(markOn(dye))],
  };
};

/** Where her team stands in the fixture's table (from 0), and her team. */
const HER_PLACE = 16;
export const HERS = team(NAMES[HER_PLACE], HER_PLACE);

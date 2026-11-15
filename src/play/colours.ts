// The ships' colours (snapshot.ts Look), by id: in a race, her side's from its card (race.ts Colours, the palette's
// CREW swatches), the side's first ship plain and its second banded; in a card-less match, hers, then the others'
// from the palette's dyes (palette.ts).

import type { RaceCard } from '../race.ts';
import { CHARCOAL, CREW, LEMON, MOSS, MURREY, OCHRE, ROSE, VERMILION } from '../palette.ts';
import type { Look } from '../snapshot.ts';
import type { Vec3 } from '../world/sphere.ts';

const dye = (c: readonly [number, number, number]): Vec3 => [c[0], c[1], c[2]];

/** The player's colours: vermilion paint and vermilion canvas, plain, her cross on them in cream (her paint would not
 *  show on her own canvas: ship/materials.ts UNSEEN). The only red sails at sea. */
export const LOOK: Look = { paint: dye(VERMILION), sail: dye(VERMILION), pattern: 'plain' };
/** The others': each one strong colour, her hull's paint and her canvas the same dye. None a red, none a blue or
 *  green near the sea's, none the foam's cream; neighbours in the list far apart in hue and lightness. */
const DYES: readonly Vec3[] = [OCHRE, MURREY, MOSS, ROSE, CHARCOAL, LEMON].map(dye);

/** A ship's colours by her id (0: the player's), in a card-less match. */
export const lookOf = (id: number): Look => {
  if (id === 0) return LOOK;
  const c = DYES[(id - 1) % DYES.length];
  return { paint: c, sail: c, pattern: id % 4 === 3 ? 'band' : 'plain' };
};

/** A ship's colours in a match dealt `card` (none: lookOf): her hull painted her side's first swatch, her canvas its
 *  second; the side's first ship (2k) plain, its second (2k + 1) banded. */
export const lookIn = (card: RaceCard | undefined, id: number): Look => {
  const s = card?.ships.find((k) => k.id === id);
  if (!s) return lookOf(id);
  const swatch = (i: number) => dye(CREW[((i % CREW.length) + CREW.length) % CREW.length].rgb);
  return { paint: swatch(s.colours.first), sail: swatch(s.colours.second), pattern: id % 2 === 0 ? 'plain' : 'band' };
};

/** A ship's colour on the sea she holds (snapshot.ts Sea), by her id: her canvas's dye. */
export const seaColourOf = (id: number, card?: RaceCard): Vec3 => lookIn(card, id).sail;

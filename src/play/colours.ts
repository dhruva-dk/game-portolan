// The ships' colours (snapshot.ts Look), by id: hers, then the others' from the palette's dyes (palette.ts).

import { CHARCOAL, CREAM, MOSS, MURREY, OCHRE, UMBER, VERMILION } from '../palette.ts';
import type { Look } from '../snapshot.ts';
import type { Vec3 } from '../world/sphere.ts';

const dye = (c: readonly [number, number, number]): Vec3 => [c[0], c[1], c[2]];

/** The player's colours: vermilion paint and vermilion canvas, plain, her cross on them in cream (her paint would not
 *  show on her own canvas: ship/materials.ts UNSEEN). The only red sails at sea. */
export const LOOK: Look = { paint: dye(VERMILION), sail: dye(VERMILION), pattern: 'plain' };
/** The others': each one strong colour, her hull's paint and her canvas of one family (cream canvas over an umber
 *  hull). None a red, and none a blue or green near the sea's. */
const DYES: readonly { paint: Vec3; sail: Vec3 }[] = [
  { paint: dye(OCHRE), sail: dye(OCHRE) },
  { paint: dye(MURREY), sail: dye(MURREY) },
  { paint: dye(UMBER), sail: dye(CREAM) },
  { paint: dye(CHARCOAL), sail: dye(CHARCOAL) },
  { paint: dye(MOSS), sail: dye(MOSS) },
];

/** A ship's colours by her id (0: the player's). */
export const lookOf = (id: number): Look =>
  (id === 0 ? LOOK : { ...DYES[(id - 1) % DYES.length], pattern: id % 4 === 3 ? 'band' : 'plain' });

/** A ship's colour on the sea she holds (snapshot.ts Sea), by her id: her canvas's dye. */
export const seaColourOf = (id: number): Vec3 => lookOf(id).sail;

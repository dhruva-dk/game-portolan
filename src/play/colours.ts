// The ships' colours (snapshot.ts Look), by id: hers, then the others' from a small palette.

import type { Look } from '../snapshot.ts';
import type { Vec3 } from '../world/sphere.ts';

/** The player's colours: a scarlet hull and the scarlet cross on bright, unbleached canvas, the brightest sails at sea. */
export const LOOK: Look = { paint: [0.6, 0.015, 0.03], sail: [0.95, 0.88, 0.7], band: false };
/** The others' hulls (and the marks on their sails), and their sails, each dyed a strong colour of its own (linear):
 *  woad, saffron, verdigris, madder, charcoal, murrey, ochre. */
const PAINTS: Vec3[] = [[0.6, 0.5, 0.3], [0.03, 0.06, 0.2], [0.02, 0.02, 0.02], [0.55, 0.42, 0.18], [0.3, 0.03, 0.02], [0.04, 0.12, 0.06]];
const SAILS: Vec3[] = [
  [0.1, 0.2, 0.5], [0.72, 0.42, 0.06], [0.08, 0.36, 0.26], [0.5, 0.11, 0.05], [0.1, 0.09, 0.09], [0.3, 0.08, 0.24], [0.55, 0.36, 0.12],
];

/** A ship's colours by her id (0: the player's). */
export const lookOf = (id: number): Look =>
  (id === 0 ? LOOK : { paint: PAINTS[(id - 1) % PAINTS.length], sail: SAILS[(id - 1) % SAILS.length], band: id % 4 === 3 });

/** A ship's colour on the sea she holds (snapshot.ts Sea), by her id: hers the scarlet of her hull, the others' their
 *  sails' dye. */
export const seaColourOf = (id: number): Vec3 => (id === 0 ? LOOK.paint : lookOf(id).sail);

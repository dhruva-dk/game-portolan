// The ships' colours (ship/fleet.ts Look), by id: hers, then the others' from a small palette.

import type { Look } from '../ship/fleet';
import type { Vec3 } from '../world/sphere';

/** The player's colours: a red hull under weathered canvas. */
export const LOOK: Look = { paint: [0.3, 0.03, 0.02], sail: [0.62, 0.57, 0.46], band: false };
const PAINTS: Vec3[] = [[0.03, 0.06, 0.2], [0.42, 0.28, 0.05], [0.03, 0.14, 0.06], [0.02, 0.02, 0.02], [0.3, 0.03, 0.02]];
const SAILS: Vec3[] = [[0.62, 0.57, 0.46], [0.7, 0.68, 0.6], [0.5, 0.38, 0.25]];

/** A ship's colours by her id (0: the player's). */
export const lookOf = (id: number): Look =>
  (id === 0 ? LOOK : { paint: PAINTS[(id - 1) % PAINTS.length], sail: SAILS[id % SAILS.length], band: id % 3 === 1 });

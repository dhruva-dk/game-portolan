// The ships' colours (snapshot.ts Look): one set of liveries for every ship,
// COLOURS (the palette's dyes) × PATTERNS (player.ts). Hers is her own choice,
// kept on her device (the UI's); the seed deals every bot hers from the
// same set (dealt), never her dye: her colour is hers alone at sea.
//
// Pure arithmetic: no three, so it runs in node for the tests.

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
} from '../palette.ts';
import { LIVERY, PATTERNS, type Livery } from '../player.ts';
import type { Look } from '../snapshot.ts';
import { hash } from '../world/random.ts';
import type { Vec3 } from '../world/sphere.ts';

const dye = (c: readonly [number, number, number]): Vec3 => [c[0], c[1], c[2]];

/**
 * The dyes, linear rgb: her hull's paint and her canvas both of the one dye.
 * Two rows of eight as the folio lays them out: the bright and the light (her
 * vermilion first), then the deep and the dull. None a blue, a green near the
 * sea's, the foam's cream or the storm's violet.
 */
export const COLOURS: readonly Vec3[] = [
  VERMILION,
  CORAL,
  TANGERINE,
  OCHRE,
  LEMON,
  CHARTREUSE,
  PEACH,
  ROSE,
  OXBLOOD,
  UMBER,
  OLIVE,
  MOSS,
  CERISE,
  MURREY,
  PEWTER,
  CHARCOAL,
].map(dye);

/** A livery held to the set: a dye or a pattern past it is hers by default. */
export const worn = (l: Livery): Livery => ({
  dye: within(l.dye, COLOURS.length) ? l.dye : LIVERY.dye,
  pattern: within(l.pattern, PATTERNS.length) ? l.pattern : LIVERY.pattern,
});
const within = (i: number, n: number) => Number.isInteger(i) && i >= 0 && i < n;

/**
 * A livery's colours: its dye as her paint and her canvas, and its pattern; her
 * cross on them in cream (her paint would not show on her own canvas:
 * ship/materials.ts UNSEEN).
 */
export const lookOf = (l: Livery): Look => {
  const { dye, pattern } = worn(l),
    c = COLOURS[dye];
  return { paint: c, sail: c, pattern: PATTERNS[pattern] };
};

/**
 * The livery of the bot `id` in the race of `seed`, she wearing `hers`: by
 * hash(seed, id), any of the other dyes, any pattern. The same every time for
 * the same seed and her dye.
 */
export function dealt(seed: number, id: number, hers: Livery): Livery {
  const h = hash(seed, id),
    others = COLOURS.length - 1,
    k = h % others,
    mine = worn(hers).dye;
  return {
    dye: k >= mine ? k + 1 : k,
    pattern: Math.floor(h / others) % PATTERNS.length,
  };
}

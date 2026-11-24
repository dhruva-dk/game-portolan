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
} from '../palette.ts';
import { LIVERY, PATTERNS, type Livery } from '../player.ts';
import type { Look } from '../snapshot.ts';
import { hash } from '../world/random.ts';
import type { Vec3 } from '../world/sphere.ts';

export const DYES: readonly { name: string; colour: Vec3; mark: Vec3 }[] =
  Object.entries({
    vermilion: VERMILION,
    coral: CORAL,
    tangerine: TANGERINE,
    ochre: OCHRE,
    lemon: LEMON,
    chartreuse: CHARTREUSE,
    peach: PEACH,
    rose: ROSE,
    oxblood: OXBLOOD,
    umber: UMBER,
    olive: OLIVE,
    moss: MOSS,
    cerise: CERISE,
    murrey: MURREY,
    pewter: PEWTER,
    charcoal: CHARCOAL,
  }).map(([name, c]) => ({
    name,
    colour: [c[0], c[1], c[2]],
    mark: [...markOn(c)],
  }));
export const COLOURS: readonly Vec3[] = DYES.map((d) => d.colour);

export const worn = (l: Livery): Livery => ({
  dye: within(l.dye, COLOURS.length) ? l.dye : LIVERY.dye,
  pattern: within(l.pattern, PATTERNS.length) ? l.pattern : LIVERY.pattern,
});
const within = (i: number, n: number) => Number.isInteger(i) && i >= 0 && i < n;

export const lookOf = (l: Livery): Look => {
  const { dye, pattern } = worn(l),
    c = COLOURS[dye];
  return { paint: c, sail: c, pattern: PATTERNS[pattern] };
};

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

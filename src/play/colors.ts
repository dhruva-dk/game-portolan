import type { Look } from '../render/snapshot.ts';
import {
  COLORS,
  EMBLEMS,
  LIVERY,
  PATTERNS,
  type Livery,
} from '../world/livery.ts';
import { hexToLinear } from '../world/color.ts';
import { hash } from '../world/random.ts';

export const PLAIN: Look = {
  paint: [...hexToLinear('#8C8E91')],
  sail: [...hexToLinear('#F4F0E6')],
  pattern: 'plain',
  emblem: -1,
};

export const worn = (l: Livery): Livery => ({
  dye: within(l.dye, COLORS.length) ? l.dye : LIVERY.dye,
  pattern: within(l.pattern, PATTERNS.length) ? l.pattern : LIVERY.pattern,
  ...(l.emblem !== undefined && within(l.emblem, EMBLEMS)
    ? { emblem: l.emblem }
    : {}),
});
const within = (i: number, n: number) => Number.isInteger(i) && i >= 0 && i < n;

export const lookOf = (l: Livery, otherwise = -1): Look => {
  const { dye, pattern, emblem } = worn(l),
    c = COLORS[dye];
  return {
    paint: c,
    sail: c,
    pattern: PATTERNS[pattern],
    emblem: emblem ?? otherwise,
  };
};

export function dealt(seed: number, id: number, player: Livery): Livery {
  const h = hash(seed, id),
    others = COLORS.length - 1,
    k = h % others,
    mine = worn(player).dye;
  return {
    dye: k >= mine ? k + 1 : k,
    pattern: Math.floor(h / others) % PATTERNS.length,
    emblem: Math.floor(h / others / PATTERNS.length) % EMBLEMS,
  };
}

export const dressOf = (team: { livery: Livery; emblem: number }): Livery => ({
  ...team.livery,
  emblem: team.emblem,
});

import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { evenSetup } from '../../src/sim/even.ts';
import type { GunKind } from '../../src/sim/kinds.ts';
import {
  duelFigures,
  duelTally,
  type DuelFigures,
  type DuelTally,
} from './figures.ts';
import {
  closeBerths,
  matchSeed,
  sail,
  statsAt,
  valuesAt,
  type Levels,
  type Stats,
} from './match.ts';
import { worldOf } from './world.ts';

export type DuelShip = { levels?: Levels; gun?: GunKind; stats?: Stats };

export interface DuelScenario {
  kind: 'duel';
  planet?: number;
  match?: number;
  ships: readonly [DuelShip, DuelShip];
}

export type Duel = {
  match: number;
  sides: readonly [number, number];
  hash: string;
  wallMs: number;
  figures: DuelFigures;
};

const RATING = 3,
  LEVEL = 50,
  STAT = 10;

export const SIDES = [
  [0, 1],
  [1, 0],
] as const;

export function runDuel(
  sc: DuelScenario,
  match: number,
  sides: readonly [number, number],
  dir?: string
): Duel {
  const w = worldOf(sc.planet),
    seed = matchSeed(w, match);
  const ship = (i: number) => sc.ships[sides[i]];
  const setup = evenSetup({
    planet: String(w.seed),
    match: seed,
    storm: RATING,
    heals: RATING,
    teams: 2,
    perTeam: 1,
    values: (i) => valuesAt(ship(i).levels ?? LEVEL, ship(i).gun),
    stats: (i) => statsAt(ship(i).stats ?? STAT),
  });
  const s = sail(
    setup,
    closeBerths(w, seed, setup.ships.length),
    { match },
    dir
  );
  return {
    match,
    sides,
    hash: s.hash,
    wallMs: s.wallMs,
    figures: duelFigures(s.result, s.account.fired, s.account.sunk),
  };
}

export function runDuels(
  sc: DuelScenario,
  runs: number,
  dir: string,
  each: (d: Duel) => void = () => {}
): { duels: Duel[]; tally: DuelTally } {
  const from = sc.match ?? 1,
    duels: Duel[] = [];
  for (let k = 0; k < runs; k++)
    for (const sides of SIDES) {
      const sub = join(dir, `match-${from + k}-${sides.join('')}`);
      mkdirSync(sub);
      const d = runDuel(sc, from + k, sides, sub);
      duels.push(d);
      each(d);
    }
  return { duels, tally: duelTally(duels, sc.ships.length) };
}

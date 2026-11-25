import { shipValues } from '../career/fit.ts';
import type { Rig } from '../sim/engine.ts';
import { evenSetup } from '../sim/even.ts';
import type { GunKind } from '../sim/kinds.ts';
import type { MatchSetup } from '../sim/setup.ts';
import { rulesOf } from '../sim/rules.ts';
import { createStorm } from '../sim/storm.ts';
import type { World } from '../world/environment.ts';
import { liveryAt, type Livery } from '../world/livery.ts';

const LEVEL = 50,
  STAT = 10,
  RATING = 3;

const raceShip = (gun: GunKind) =>
  shipValues(
    {
      sails: LEVEL,
      rigging: LEVEL,
      rudder: LEVEL,
      hull: LEVEL,
      keel: LEVEL,
      mounts: LEVEL,
      gun: LEVEL,
    },
    gun,
    { shield: STAT, healSpeed: STAT, healAmount: STAT }
  );

export const RACE_SHIP = raceShip('cannon');

export const RACE_STORM = rulesOf(RATING).storm;

export const RACE_DRIVER = {
  gunnery: STAT,
  helm: STAT,
  nerve: STAT,
  territory: STAT,
  stormcraft: STAT,
  lookout: STAT,
} as const;

export const raceSetup = (
  planet: string,
  match: number,
  teams?: number,
  gun: GunKind = 'cannon'
): MatchSetup =>
  evenSetup({
    planet,
    match,
    storm: RATING,
    heals: RATING,
    teams,
    values: raceShip(gun),
    stats: RACE_DRIVER,
    player: true,
  });

export function teamLiveries(setup: MatchSetup, own: Livery): Livery[] {
  const teams = Math.max(...setup.ships.map((s) => s.team)) + 1,
    all = Array.from({ length: teams }, (_, t) => liveryAt(t));
  const taken = all.findIndex(
    (l) => l.dye === own.dye && l.pattern === own.pattern
  );
  if (taken > 0) all[taken] = all[0];
  all[0] = own;
  return all;
}

export function rigOf(
  { hold }: { hold: number | null },
  world: World
): Rig | null {
  if (hold === null) return null;
  const closing = createStorm(
    world.seed,
    (p) => -world.planet.height(p),
    RACE_STORM
  );
  return { storm: () => closing(hold) };
}

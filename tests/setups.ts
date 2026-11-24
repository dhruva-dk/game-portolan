import { shipValues } from '../src/career/fit.ts';
import { evenSetup, type EvenOptions } from '../src/sim/even.ts';
import type { DriverStats, MatchSetup, ShipValues } from '../src/sim/setup.ts';

const LEVEL = 50,
  STAT = 10,
  RATING = 3;

export const EVEN_SHIP: ShipValues = shipValues(
  {
    sails: LEVEL,
    rigging: LEVEL,
    rudder: LEVEL,
    hull: LEVEL,
    keel: LEVEL,
    mounts: LEVEL,
    gun: LEVEL,
  },
  'cannon',
  { shield: STAT, healSpeed: STAT, healAmount: STAT }
);

export const TENS: DriverStats = {
  gunnery: STAT,
  helm: STAT,
  nerve: STAT,
  territory: STAT,
  stormcraft: STAT,
  lookout: STAT,
};

export const setupOf = (
  match: number,
  over: Partial<EvenOptions> = {}
): MatchSetup =>
  evenSetup({
    planet: 'test',
    match,
    storm: RATING,
    heals: RATING,
    values: EVEN_SHIP,
    stats: TENS,
    ...over,
  });

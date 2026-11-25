import { shipValues } from '../src/career/fit.ts';
import { crewOf } from '../src/sim/battle.ts';
import type { Bot, Own, Seen } from '../src/sim/bot.ts';
import { DEFAULT_BRAIN, type Brain } from '../src/sim/brain.ts';
import { driver } from '../src/sim/driver.ts';
import { evenSetup, type EvenOptions } from '../src/sim/even.ts';
import type { GunKind } from '../src/sim/kinds.ts';
import type { DriverStats, MatchSetup, ShipValues } from '../src/sim/setup.ts';

const LEVEL = 50,
  STAT = 10,
  RATING = 3;

export const valuesAt = (
  level: number,
  gun: GunKind = 'cannon',
  mechanic = STAT
): ShipValues =>
  shipValues(
    {
      sails: level,
      rigging: level,
      rudder: level,
      hull: level,
      keel: level,
      mounts: level,
      gun: level,
    },
    gun,
    { shield: mechanic, healSpeed: mechanic, healAmount: mechanic }
  );

export const EVEN_SHIP: ShipValues = valuesAt(LEVEL);
export const WORST = valuesAt(0),
  BEST = valuesAt(100);

export const UNTENDED = valuesAt(LEVEL, 'cannon', 1),
  TENDED = valuesAt(LEVEL, 'cannon', 20);

export const HANDY: ShipValues = {
  ...EVEN_SHIP,
  topSpeed: 16,
  gather: 1.3,
  turnRate: 0.6,
};

type Sighted = Omit<Seen, 'hull' | 'shield'> &
  Partial<Pick<Seen, 'hull' | 'shield'>>;

export const aboard = (s: Sighted, values: ShipValues = EVEN_SHIP): Own => {
  const crew = s.crew ?? crewOf(s.id, values);
  return {
    ...s,
    crew,
    hull: s.hull ?? crew.health.hull,
    shield: s.shield ?? crew.health.shield,
  };
};

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

export const statsWith = (over: Partial<DriverStats> = {}): DriverStats => ({
  ...TENS,
  ...over,
});

export const botOf = (
  seed: number,
  stats: DriverStats = TENS,
  brain: Brain = DEFAULT_BRAIN
): Bot => ({ seed, brain, temper: driver(stats) });

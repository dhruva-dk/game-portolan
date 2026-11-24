import { dealt, type MatchType } from './persona.ts';
import type { Spawn } from './spawn.ts';
import { createStorm, type Storm } from './storm.ts';
import type { Planet } from '../world/planet.ts';
import { STRIDE } from '../world/random.ts';
import type { Vec3 } from '../world/sphere.ts';
import type { Match } from './engine.ts';

export type Berther = (match: number) => Promise<Spawn[]>;

export function createMatches(
  seed: number,
  planet: Planet,
  hold: number | null,
  gun: Match['gun'],
  typeOf: (seed: number) => MatchType = dealt
) {
  const depth = (p: Vec3) => -planet.height(p);
  const match = (s: number): Match => {
    const type = typeOf(s),
      closing = createStorm(s, depth, type.rules.storm);
    return { seed: s, type, storm: (t) => closing(hold ?? t), gun };
  };
  let played = 0,
    berth: Berther | null = null;
  const next = () => seed + STRIDE * (played + 1);
  let ahead: { seed: number; berths: Spawn[] } | null = null;
  const prepare = () => {
    const s = next();
    void berth?.(s).then((berths) => {
      if (s === next()) ahead = { seed: s, berths };
    });
  };
  const first = match(seed);
  let own: Spawn[] | undefined;
  return {
    first,
    race: (): Match => ({ ...first, berths: own }),
    berthRace(by: Berther) {
      void by(seed).then((berths) => (own = berths));
    },
    storm: (t: number): Storm => first.storm(t),
    berthBy(by: Berther) {
      berth = by;
      prepare();
    },
    deal(): Match {
      const s = seed + STRIDE * ++played,
        berths = ahead?.seed === s ? ahead.berths : undefined;
      ahead = null;
      prepare();
      return { ...match(s), berths };
    },
  };
}

export type Matches = ReturnType<typeof createMatches>;

import { createMatch, debugOf, type Match } from '../src/sim/engine.ts';
import { STILL, type Hands } from '../src/sim/hands.ts';
import type { DriverStats } from '../src/sim/setup.ts';
import { calm, type Storm } from '../src/sim/storm.ts';
import { watersAt } from '../src/sim/waters.ts';
import { SEED } from '../src/world/environment.ts';
import { landOf, planetOf } from '../src/world/land.ts';
import {
  along,
  bearingAt,
  fromLatLon,
  type Vec3,
} from '../src/world/sphere.ts';
import { setupOf } from './setups.ts';

export const planet = planetOf(SEED, landOf(SEED)),
  waters = watersAt(planet);
export const SECOND = 30;

function widest(): Vec3 {
  let best = { reach: -1, at: planet.start.at };
  for (let lat = -1.4; lat <= 1.4; lat += 0.04)
    for (let lon = -3.1; lon <= 3.1; lon += 0.04) {
      const at = fromLatLon(lat, lon);
      let reach = 0;
      rings: for (; reach <= 300; reach += 20)
        for (let k = 0; k < 16; k++)
          if (
            waters.depth(along(at, bearingAt(at, (k * Math.PI) / 8), reach).p) <
            3
          )
            break rings;
      if (reach > best.reach) best = { reach, at };
    }
  return best.at;
}

export const OPEN = widest();

export const fighting = (): Storm => ({ ...calm(OPEN), phase: 6 });

export function smallSea(
  match: number,
  stats: (ship: number) => DriverStats,
  o: {
    teams?: number;
    perTeam?: 1 | 2;
    player?: boolean;
    storm?: (seconds: number) => Storm;
  } = {}
): Match {
  const m = createMatch(
    setupOf(match, {
      teams: o.teams ?? 8,
      perTeam: o.perTeam ?? 1,
      player: o.player ?? false,
      stats,
    }),
    waters
  );
  if (o.storm) debugOf(m).rig({ storm: o.storm });
  return m;
}

export function sail(
  m: Match,
  seconds: number,
  each?: (m: Match) => void,
  hands: (m: Match) => Hands = () => STILL
): Match {
  for (let i = 0; i < Math.round(seconds * SECOND); i++) {
    m.step(hands(m));
    each?.(m);
  }
  return m;
}

export function crowded(m: Match, reach = 80): Match {
  const n = m.result().ships.length;
  debugOf(m).atSea(
    { at: OPEN, bearing: 0 },
    Array.from({ length: n - 1 }, (_, k) => {
      const a = (2 * Math.PI * k) / (n - 1),
        at = along(OPEN, bearingAt(OPEN, a), reach).p;
      return { at, heading: bearingAt(at, a + Math.PI / 2), lashed: null };
    })
  );
  return m;
}

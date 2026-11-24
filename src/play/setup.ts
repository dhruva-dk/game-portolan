import { SHIPS } from '../sim/match.ts';
import { charted } from '../sim/route.ts';
import { dealt, type MatchType } from '../sim/persona.ts';
import type { Spawn } from '../sim/spawn.ts';
import { createStorm, type Storm } from '../sim/storm.ts';
import type { Land } from '../world/land.ts';
import type { Planet } from '../world/planet.ts';
import { STRIDE } from '../world/random.ts';
import type { Vec3 } from '../world/sphere.ts';
import type { Match, Waters } from './state.ts';

type Berther = (match: number) => Promise<Spawn[]>;
type Sounded =
  | { open: Uint8Array; clear: Uint8Array; berths: Float64Array; ms: number }
  | { match: number; spawns: Float64Array };

export function watersOf(
  seed: number,
  land: Land
): Promise<{ waters: Waters; ms: number; berth: Berther }> {
  const worker = new Worker(new URL('./sounding.ts', import.meta.url), {
    type: 'module',
  });
  const asked = new Map<number, (spawns: Spawn[]) => void>();
  const berth: Berther = (match) =>
    new Promise((resolve) => {
      asked.set(match, resolve);
      worker.postMessage({ match, count: SHIPS });
    });
  const vec = (b: Float64Array, i: number): Vec3 => [b[i], b[i + 1], b[i + 2]];
  return new Promise((resolve, reject) => {
    worker.onmessage = (e: MessageEvent<Sounded>) => {
      if ('match' in e.data) {
        const { match, spawns: b } = e.data;
        const spawn = (_: unknown, i: number): Spawn => ({
          at: vec(b, 6 * i),
          heading: vec(b, 6 * i + 3),
        });
        asked.get(match)?.(Array.from({ length: b.length / 6 }, spawn));
        asked.delete(match);
        return;
      }
      const b = e.data.berths,
        points = Array.from({ length: b.length / 3 }, (_, i) => vec(b, 3 * i));
      resolve({
        waters: { chart: charted(e.data), water: { points } },
        ms: e.data.ms,
        berth,
      });
    };
    worker.onerror = (e) => reject(new Error(e.message));
    worker.postMessage({ seed, land });
  });
}

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

import { SHIPS } from '../sim/match.ts';
import type { Berther } from '../sim/matches.ts';
import { charted } from '../sim/route.ts';
import type { Spawn } from '../sim/spawn.ts';
import type { Waters } from '../sim/waters.ts';
import type { Land } from '../world/land.ts';
import type { Vec3 } from '../world/sphere.ts';

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

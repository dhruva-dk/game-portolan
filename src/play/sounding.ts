import { berths, type Berthing } from '../sim/spawn.ts';
import { sounded } from '../sim/waters.ts';
import { planetOf, type Land } from '../world/land.ts';
import type { Vec3 } from '../world/sphere.ts';

let kept: { water: Berthing; depth: (p: Vec3) => number } | null = null;

self.onmessage = (
  e: MessageEvent<
    { seed: number; land: Land } | { match: number; count: number }
  >
) => {
  if ('match' in e.data) {
    const { match, count } = e.data;
    const dealt = kept ? berths(kept.water, match, count, kept.depth) : [];
    const spawns = Float64Array.from(
      dealt.flatMap((b) => [...b.at, ...b.heading])
    );
    self.postMessage({ match, spawns }, { transfer: [spawns.buffer] });
    return;
  }
  const t = performance.now();
  const planet = planetOf(e.data.seed, e.data.land);
  const depth = (p: Vec3) => -planet.height(p);
  const { open, clear, water } = sounded(depth);
  kept = { water, depth };
  const points = Float64Array.from(water.points.flat());
  const ms = performance.now() - t;
  self.postMessage(
    { open, clear, berths: points, ms },
    { transfer: [open.buffer, clear.buffer, points.buffer] }
  );
};

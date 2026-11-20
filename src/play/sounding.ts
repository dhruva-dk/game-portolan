// A module Worker: sounds the planet's water off the main thread, for the bots'
// chart (sim/route.ts sound) and the open water ships are berthed in at a
// match's start (sim/spawn.ts berthing), and hands both back; then, asked, the
// berths of each match dealt on it (sim/spawn.ts berths: tens of milliseconds,
// which PLAY would otherwise pay).
//   in:  { seed, land }               out: { open, clear } (sim/route.ts Soundings), berths (each open point's x, y, z), ms
//   in:  { match, count } (its seed)   out: { match, spawns (each berth's at and heading, x, y, z each) }

import { sound } from '../sim/route.ts';
import { berthing, berths, type Berthing } from '../sim/spawn.ts';
import { planetOf, type Land } from '../world/land.ts';
import type { Vec3 } from '../world/sphere.ts';

let sounded: { water: Berthing; depth: (p: Vec3) => number } | null = null;

self.onmessage = (
  e: MessageEvent<
    { seed: number; land: Land } | { match: number; count: number }
  >
) => {
  if ('match' in e.data) {
    const { match, count } = e.data;
    const dealt = sounded
      ? berths(sounded.water, match, count, sounded.depth)
      : [];
    const spawns = Float64Array.from(
      dealt.flatMap((b) => [...b.at, ...b.heading])
    );
    self.postMessage({ match, spawns }, { transfer: [spawns.buffer] });
    return;
  }
  const t = performance.now();
  const planet = planetOf(e.data.seed, e.data.land);
  const depth = (p: Vec3) => -planet.height(p);
  const { open, clear } = sound(depth);
  const water = berthing(depth);
  sounded = { water, depth };
  const points = Float64Array.from(water.points.flat());
  const ms = performance.now() - t;
  // (the options form, which a worker's postMessage and the window's that the
  // DOM types give `self` both take)
  self.postMessage(
    { open, clear, berths: points, ms },
    { transfer: [open.buffer, clear.buffer, points.buffer] }
  );
};

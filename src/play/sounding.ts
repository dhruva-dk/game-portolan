// A module Worker: sounds the planet's water off the main thread, for the bots' chart (sim/route.ts sound) and the
// open water ships are berthed in at a match's start (sim/spawn.ts berthing), and hands both back.
//   in:  { seed }
//   out: { open, clear } (sim/route.ts Soundings), berths (each open point's x, y, z), ms

import { sound } from '../sim/route';
import { berthing } from '../sim/spawn';
import { createPlanet } from '../world/planet';

self.onmessage = (e: MessageEvent<{ seed: number }>) => {
  const t = performance.now();
  const planet = createPlanet(e.data.seed);
  const depth = (p: readonly [number, number, number]) => -planet.height(p);
  const { open, clear } = sound(depth);
  const berths = Float64Array.from(berthing(depth).points.flat());
  const ms = performance.now() - t;
  // (the options form, which a worker's postMessage and the window's that the DOM types give `self` both take)
  self.postMessage({ open, clear, berths, ms }, { transfer: [open.buffer, clear.buffer, berths.buffer] });
};

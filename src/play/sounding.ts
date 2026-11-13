// A module Worker: sounds the planet's water for the bots' chart (sim/route.ts sound) off the main thread, and hands
// the soundings back.
//   in:  { seed }
//   out: { open, clear } (sim/route.ts Soundings), ms

import { sound } from '../sim/route';
import { createPlanet } from '../world/planet';

self.onmessage = (e: MessageEvent<{ seed: number }>) => {
  const t = performance.now();
  const planet = createPlanet(e.data.seed);
  const { open, clear } = sound((p) => -planet.height(p));
  const ms = performance.now() - t;
  // (the options form, which a worker's postMessage and the window's that the DOM types give `self` both take)
  self.postMessage({ open, clear, ms }, { transfer: [open.buffer, clear.buffer] });
};

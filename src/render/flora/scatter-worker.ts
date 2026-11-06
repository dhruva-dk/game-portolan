// A flora worker: bakes the planet's height grid and grows every kind's plants over it (scatter.ts), handing each
// kind's plants back as transferable arrays.
import { bakeHeights, REGION_COUNT } from '../../sim/world/index.ts';
import { scatter, type Clearing, type ScatterSpec } from './scatter.ts';

self.onmessage = (e: MessageEvent<{ specs: ScatterSpec[]; clearings: Clearing[] }>) => {
  bakeHeights();
  const out = scatter(e.data.specs, e.data.clearings, REGION_COUNT);
  (self as unknown as Worker).postMessage(out, out.flatMap((s) => [s.data.buffer, s.variant.buffer]));
};

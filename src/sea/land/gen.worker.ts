// PROTOTYPE (land look): the generator off the main thread.
import { generate } from './gen.ts';

self.onmessage = (e: MessageEvent<{ seed: number }>) => {
  const m = generate(e.data.seed);
  (self as unknown as Worker).postMessage(m, [m.height.buffer, m.colour.buffer, m.normal.buffer, m.material.buffer, m.trees.buffer, m.coarse.buffer]);
};

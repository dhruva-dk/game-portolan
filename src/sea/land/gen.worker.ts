// PROTOTYPE (archipelago look): the generator off the main thread.
import { generate } from './gen.ts';

self.onmessage = (e: MessageEvent<{ seed: number }>) => {
  const m = generate(e.data.seed);
  const moved: ArrayBuffer[] = [m.height.buffer, m.colour.buffer, m.bed.buffer, m.material.buffer, m.palms.buffer, m.rocks.buffer] as ArrayBuffer[];
  for (const t of m.tiles) for (const l of t.lods) moved.push(l.pos.buffer as ArrayBuffer, l.index.buffer as ArrayBuffer);
  (self as unknown as Worker).postMessage(m, moved);
};

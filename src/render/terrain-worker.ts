// A terrain worker: builds chunks off the main thread and hands their buffers back.
import { buildChunk, type ChunkRequest } from './terrain-build.ts';

self.onmessage = (e: MessageEvent<ChunkRequest>) => {
  const c = buildChunk(e.data);
  (self as unknown as Worker).postMessage(c, [c.position.buffer, c.normal.buffer, c.weights.buffer]);
};

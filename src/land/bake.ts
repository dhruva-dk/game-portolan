// A module Worker: bakes the planet's ground onto the cube's faces (world/planet.ts bakeFaces) off the main thread,
// heights as half floats, and hands the buffers back.
//   in:  { seed, land (world/land.ts), n }
//   out: { height: Uint16Array (6 faces of n × n, half floats), cover: Uint8Array (6 faces of n × n RGBA), ms }

import { DataUtils } from 'three/webgpu';
import { planetOf, type Land } from '../world/land.ts';
import { bakeFaces } from '../world/planet.ts';

self.onmessage = (e: MessageEvent<{ seed: number; land: Land; n: number }>) => {
  const { seed, land, n } = e.data;
  const t = performance.now();
  const faces = bakeFaces(planetOf(seed, land), n);
  const height = new Uint16Array(6 * n * n), cover = new Uint8Array(6 * n * n * 4);
  faces.height.forEach((h, f) => {
    for (let k = 0; k < h.length; k++) height[f * n * n + k] = DataUtils.toHalfFloat(h[k]);
  });
  faces.cover.forEach((c, f) => cover.set(c, f * n * n * 4));
  const ms = performance.now() - t;
  // (the options form, which a worker's postMessage and the window's that the DOM types give `self` both take)
  self.postMessage({ height, cover, ms }, { transfer: [height.buffer, cover.buffer] });
};

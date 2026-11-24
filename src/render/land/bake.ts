import { DataUtils } from 'three/webgpu';
import { planetOf, type Land } from '../../world/land.ts';
import { bakeFaces } from '../../world/planet.ts';

self.onmessage = (e: MessageEvent<{ seed: number; land: Land; n: number }>) => {
  const { seed, land, n } = e.data;
  const t = performance.now();
  const faces = bakeFaces(planetOf(seed, land), n);
  const height = new Uint16Array(6 * n * n),
    cover = new Uint8Array(6 * n * n * 4);
  faces.height.forEach((h, f) => {
    for (let k = 0; k < h.length; k++)
      height[f * n * n + k] = DataUtils.toHalfFloat(h[k]);
  });
  faces.cover.forEach((c, f) => cover.set(c, f * n * n * 4));
  const ms = performance.now() - t;
  self.postMessage(
    { height, cover, ms },
    { transfer: [height.buffer, cover.buffer] }
  );
};

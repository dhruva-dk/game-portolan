// A chart worker: bakes the world's heights and the captains' chart from them (nav.ts) away from the page, and hands
// both back to be adopted there. Built on the page, the chart held the lobby still for some 4 s on the iPad.
import { buildNav } from './nav.ts';
import { bakeHeights } from './world/index.ts';

self.onmessage = () => {
  const heights = bakeHeights(), nav = buildNav();
  (self as unknown as Worker).postMessage({ heights, nav }, [heights.buffer, ...Object.values(nav).map((a: ArrayBufferView) => a.buffer)]);
};

// A chart worker: bakes the world's heights, the captains' chart from them (nav.ts) and the coasts the planet chart
// inks (src/chart/coast.ts) away from the page, and hands them back to be adopted there. Built on the page, the chart
// held the lobby still for some 4 s on the iPad, and the coasts would hold the Gale's start.
import { traceCoasts } from '../chart/coast.ts';
import { buildNav } from './nav.ts';
import { bakeHeights, heightAt } from './world/index.ts';

self.onmessage = () => {
  const heights = bakeHeights(), nav = buildNav(), coasts = traceCoasts(heightAt);
  (self as unknown as Worker).postMessage({ heights, nav, coasts }, [
    heights.buffer, ...Object.values(nav).map((a: ArrayBufferView) => a.buffer), coasts.caps.buffer, ...coasts.chains.map((c) => c.buffer),
  ]);
};

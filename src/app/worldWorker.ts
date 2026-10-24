// The world worker: builds the geography and its navigation graph off the main thread (about 1.2 s on the dev Mac)
// while the title letters itself in, and keeps them in IndexedDB under a hash of the simulation's source
// (__WORLD_KEY__, vite.config.ts), so later launches read them back in milliseconds and a changed simulation never
// meets a stale world. The arrays move to the main thread without a copy.
import { buildGeography, type Geography } from '../sim/world/geography.ts';
import { buildNav, type Nav } from '../sim/world/nav.ts';
import { read, write } from './save.ts';

declare const __WORLD_KEY__: string;

/** The fixed world every match is sailed on. */
export interface World {
  readonly geo: Geography;
  readonly nav: Nav;
}

/** What the worker posts: the world, the milliseconds it took to get and whether it came from the cache. */
export interface WorldMessage {
  readonly world: World;
  readonly ms: number;
  readonly cached: boolean;
}

interface Cached {
  key: string;
  world: World;
}

async function load(): Promise<WorldMessage> {
  const t0 = performance.now();
  // The cache is a shortcut only: when IndexedDB is unavailable the world is built every launch.
  const hit = await read<Cached>('world', 'current').catch(() => undefined);
  if (hit?.key === __WORLD_KEY__) return { world: hit.world, ms: performance.now() - t0, cached: true };
  const geo = buildGeography();
  const world: World = { geo, nav: buildNav(geo) };
  await write('world', 'current', { key: __WORLD_KEY__, world } satisfies Cached).catch(() => undefined);
  return { world, ms: performance.now() - t0, cached: false };
}

void load().then((m) => {
  const { geo, nav } = m.world;
  const arrays = [geo.heights, geo.coast, geo.floor, geo.region, geo.zones, nav.level, nav.edge, nav.cost];
  postMessage(m, { transfer: [...new Set(arrays.map((a) => a.buffer as ArrayBuffer))] });
});

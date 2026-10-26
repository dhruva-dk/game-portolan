import type { World } from '../sim/environment.ts';
import { buildGeography } from '../sim/world/geography.ts';
import { buildNav } from '../sim/world/nav.ts';
import { read, write } from './save.ts';

declare const __WORLD_KEY__: string;

export type { World };

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

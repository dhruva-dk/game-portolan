// The terrain (world/terrain.ts) baked once into a texture over the island and its reef, on the island's chart, for
// the water: how deep it is over any point, and how sheltered.
//
//   R  height above sea level, metres
//   G  passage: the shallowest water crossed coming in from the open sea (PASSAGE_NONE outside the reef)
//
// Outside the map the texture's edge carries on: the open sea's floor, unsheltered, the whole planet round.

import { ClampToEdgeWrapping, DataTexture, DataUtils, HalfFloatType, LinearFilter, RGFormat, Vector2 } from 'three/webgpu';
import { float, texture, uniform } from 'three/tsl';
import type { View } from '../view/view';
import type { Site } from './site';

type N = any;

const SIZE = 512;
/** Stands for "no shelter": deeper than any wave could notice. */
const PASSAGE_NONE = 1000;

export interface Seabed {
  /** Where on the map world position p lies (a vec2, safe to interpolate). */
  locate(p: N): N;
  /** The ground's height above sea level at a place on the map (locate), metres. Safe in a vertex shader. */
  height(at: N): N;
  /** The shallowest water a wave crosses to reach a place on the map, metres. */
  passage(at: N): N;
}

export function createSeabed(site: Site, view: View): Seabed {
  const { island } = site;
  const chart = view.chart(site.chart);
  const size = island.reach * 2;
  const origin = [island.centre[0] - island.reach, island.centre[1] - island.reach];
  const data = new Uint16Array(SIZE * SIZE * 2);
  for (let j = 0; j < SIZE; j++) for (let i = 0; i < SIZE; i++) {
    const x = origin[0] + ((i + 0.5) / SIZE) * size, z = origin[1] + ((j + 0.5) / SIZE) * size;
    const k = (j * SIZE + i) * 2;
    data[k] = DataUtils.toHalfFloat(island.height(x, z));
    data[k + 1] = DataUtils.toHalfFloat(Math.min(island.passage(x, z), PASSAGE_NONE));
  }
  const map = new DataTexture(data, SIZE, SIZE, RGFormat, HalfFloatType);
  map.wrapS = map.wrapT = ClampToEdgeWrapping;
  map.magFilter = map.minFilter = LinearFilter;
  map.needsUpdate = true;

  const from = uniform(new Vector2(origin[0], origin[1])), span = uniform(size);
  const read = (at: N) => texture(map, at).level(float(0));
  return {
    locate: (p) => chart(p).q.sub(from).div(span),
    height: (at) => read(at).x,
    passage: (at) => read(at).y,
  };
}

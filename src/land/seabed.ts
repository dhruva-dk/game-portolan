// The terrain (terrain.ts) baked once into a texture over the island and its reef, for the water: how deep it is
// over any point, and how sheltered.
//
//   R  height above sea level, metres
//   G  passage: the shallowest water crossed coming in from the open sea (PASSAGE_NONE outside the reef)
//
// Outside the map the texture's edge carries on: the open sea's floor, unsheltered.

import { ClampToEdgeWrapping, DataTexture, DataUtils, HalfFloatType, LinearFilter, RGFormat, Vector2 } from 'three/webgpu';
import { float, texture, uniform } from 'three/tsl';
import type { Island } from './terrain';

type N = any;

const SIZE = 512;
/** Stands for "no shelter": deeper than any wave could notice. */
const PASSAGE_NONE = 1000;

export interface Seabed {
  /** The ground's height above sea level under world (x, z), metres. Safe in a vertex shader. */
  height(xz: N): N;
  /** The shallowest water a wave crosses to reach world (x, z), metres. */
  passage(xz: N): N;
}

export function createSeabed(island: Island): Seabed {
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
  const at = (xz: N) => texture(map, xz.sub(from).div(span)).level(float(0));
  return {
    height: (xz) => at(xz).x,
    passage: (xz) => at(xz).y,
  };
}

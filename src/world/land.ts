import type { Planet } from './planet.ts';
import { terrainPlanet } from './planet-terrain.ts';
import { createTerrain, type Terrain } from './terrain.ts';

export type Land = Terrain;

export const landOf = (seed: number): Land => createTerrain(seed);

export const planetOf = (seed: number, land: Land): Planet =>
  terrainPlanet(land, seed);

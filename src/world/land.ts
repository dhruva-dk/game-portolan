// What the planet's land is made of: the terrain grown over the whole planet
// (terrain.ts). It is plain data, so it is worked out once (it takes a second
// or so) and handed whole to every thread that needs the planet (the ground's
// bake, the sea's sounding), each of which makes the same Planet from it.
//
// Pure arithmetic: no three, so it runs in node for the tests.

import { levelled } from './harbour-site.ts';
import type { Planet } from './planet.ts';
import { terrainPlanet } from './planet-terrain.ts';
import { createTerrain, type Terrain } from './terrain.ts';

export type Land = Terrain;

/** The land of a planet of this seed. */
export const landOf = (seed: number): Land => createTerrain(seed);

/** The planet of this seed on its land, its harbour cut into it (harbour-site.ts). */
export const planetOf = (seed: number, land: Land): Planet =>
  levelled(terrainPlanet(land, seed));

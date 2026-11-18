// What the planet's land is made of: the islands placed on the sea floor (planet.ts), or the terrain grown over the
// whole planet (terrain.ts). Either way it is plain data, so it is worked out once (the terrain takes a second or so)
// and handed whole to every thread that needs the planet (the ground's bake, the sea's sounding), each of which makes
// the same Planet from it.
//
// Pure arithmetic: no three, so it runs in node for the tests.

import { createPlanet, type Planet } from './planet.ts';
import { terrainPlanet } from './planet-terrain.ts';
import { createTerrain, type Terrain } from './terrain.ts';

export type LandKind = 'islands' | 'terrain';
export type Land = { kind: 'islands' } | { kind: 'terrain'; terrain: Terrain };

/** The land of a planet of this seed, of this kind. */
export const landOf = (seed: number, kind: LandKind): Land =>
  kind === 'terrain' ? { kind, terrain: createTerrain(seed) } : { kind };

/** The planet of this seed on its land. */
export const planetOf = (seed: number, land: Land): Planet =>
  land.kind === 'terrain' ? terrainPlanet(land.terrain, seed) : createPlanet(seed);

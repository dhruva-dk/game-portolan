// The sea floor: a grid of rings round the point under the eye, laid on the sphere (view.rings) like the sea's and
// raised to the ground's height (ground.ts). It follows the eye, so nothing on it may depend on where the eye is:
// its look is the ground's at each pixel's world position (sand.ts), its normal the ground's there, never the
// mesh's; only its shape (which the water hides but for the parallax through it) is the grid's sampling.
//
// Near an island the island's own mesh (land.ts) shows the ground: the floor is drawn only where the ground lies
// more than SHALLOWEST metres down, and never higher than that (so a coarse far cell straddling a coast can't rise
// through the sea); the islands' meshes reach a little deeper, so the two overlap and no gap shows.
//
// The rings start half a metre out and each lies 3.5% further than the last, with 160 spokes: cells a few metres
// across at a hundred metres, about as long as wide.

import { Mesh, MeshBasicNodeMaterial } from 'three/webgpu';
import { Fn, min, positionWorld } from 'three/tsl';
import type { View } from '../view/view';
import type { Ground } from './ground';
import type { Sand } from './sand';

/** The floor is drawn where the ground is deeper than this, metres. */
export const SHALLOWEST = 1.5;
const FIRST = 0.5, GROWTH = 1.035, SPOKES = 160;

export function createSeabed(view: View, ground: Ground, sand: Sand) {
  const grid = view.rings(FIRST, GROWTH, SPOKES);
  const material = new MeshBasicNodeMaterial();
  material.positionNode = view.place(grid.up, min(ground.height(grid.up), -SHALLOWEST));
  material.maskNode = ground.height(positionWorld).lessThan(-SHALLOWEST);
  material.colorNode = Fn(() => sand(positionWorld, ground.normal(positionWorld), null))();
  const mesh = new Mesh(grid.geometry, material);
  mesh.frustumCulled = false;
  return {
    mesh,
    /** Draws the rings out to the horizon. */
    update() {
      grid.update(0);
    },
  };
}

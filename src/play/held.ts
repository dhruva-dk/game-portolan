// Who holds the sea (sim/territory.ts), as the frame and the HUD read it each
// frame (snapshot.ts Sea): the cells and the changes by reference, the ships'
// colours on the sea as they were launched. Each match's sea (its generation)
// is an object of its own, kept through the match, so a frame's reading makes
// nothing.

import type { Territory } from '../sim/territory.ts';
import type { Sea } from '../snapshot.ts';
import type { Vec3 } from '../world/sphere.ts';

export function createHeld() {
  let kept: Sea | null = null;

  /**
   * Who holds the sea now, the match's `generation` (a new number each match),
   * each ship's colour on it by id (her canvas's dye: read once a match).
   */
  return (
    territory: Territory,
    generation: number,
    colours: readonly Vec3[]
  ): Sea => {
    if (kept?.generation !== generation)
      kept = {
        generation,
        owner: territory.owner,
        seq: 0,
        changes: territory.changes(),
        colours: colours.slice(0, territory.ships),
      };
    kept.owner = territory.owner;
    kept.seq = territory.last();
    kept.changes = territory.changes();
    return kept;
  };
}

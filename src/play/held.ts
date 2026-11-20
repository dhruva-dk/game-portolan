// Who holds the sea (sim/territory.ts), as the frame and the HUD read it each
// frame (snapshot.ts Sea): the cells and the changes by reference, the ships'
// colours on the sea in a list kept, so a frame's reading makes nothing. Each
// match's sea (its generation) is an object of its own, kept through the match.

import type { Territory } from '../sim/territory.ts';
import type { Sea } from '../snapshot.ts';
import type { Vec3 } from '../world/sphere.ts';
import { seaColourOf } from './colours.ts';

export function createHeld() {
  /** Each ship's colour on the sea, by id. */
  const colours: Vec3[] = [];
  let kept: Sea | null = null;

  /**
   * Who holds the sea now, the match's `generation` (a new number each match).
   */
  return (territory: Territory, generation: number): Sea => {
    for (let id = colours.length; id < territory.ships; id++)
      colours.push(seaColourOf(id));
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

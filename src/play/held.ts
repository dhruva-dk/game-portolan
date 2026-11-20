// Who holds the sea (sim/territory.ts), as the frame and the HUD read it each
// frame (snapshot.ts Sea): the cells and the changes by reference, the open
// trails and the ships' colours on the sea in lists kept and refilled, so a
// frame's reading makes nothing. Each match's sea (its generation) is an object
// of its own, kept through the match.

import type { Territory } from '../sim/territory.ts';
import type { Sea, TrailDraw } from '../snapshot.ts';
import type { Vec3 } from '../world/sphere.ts';
import { seaColourOf } from './colours.ts';

/**
 * A match's sea as read, with the open trails' list and one entry kept for each
 * ship's trail.
 */
interface Kept {
  sea: Sea;
  trails: TrailDraw[];
  trailOf: { id: number; serial: number; points: readonly Vec3[] }[];
}

export function createHeld() {
  /** Each ship's colour on the sea, by id. */
  const colours: Vec3[] = [];
  let kept: Kept | null = null;

  /**
   * Who holds the sea now, the match's `generation` (a new number each match).
   */
  return (territory: Territory, generation: number): Sea => {
    const all = territory.trails();
    for (let id = colours.length; id < all.length; id++)
      colours.push(seaColourOf(id));
    if (kept?.sea.generation !== generation) {
      const trails: TrailDraw[] = [],
        owner = territory.owner,
        changes = territory.changes();
      kept = {
        sea: {
          generation,
          owner,
          seq: 0,
          changes,
          trails,
          colours: colours.slice(0, all.length),
        },
        trails,
        trailOf: [],
      };
    }
    const { sea, trails, trailOf } = kept;
    trails.length = 0;
    for (let id = 0; id < all.length; id++) {
      const t = all[id];
      if (!t.points.length) continue;
      const trail = (trailOf[id] ??= { id, serial: 0, points: [] });
      trail.serial = t.serial;
      trail.points = t.points;
      trails.push(trail);
    }
    sea.owner = territory.owner;
    sea.seq = territory.last();
    sea.changes = territory.changes();
    return sea;
  };
}

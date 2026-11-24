import type { Territory } from '../sim/territory.ts';
import type { Sea } from '../render/snapshot.ts';
import type { Vec3 } from '../world/sphere.ts';

type Changes = Sea['changes'];

export function createHeld() {
  let kept: Sea | null = null,
    raw: Changes | null = null,
    shifted: Changes = [];

  const timed = (changes: Changes, offset: number) => {
    if (changes !== raw) {
      raw = changes;
      shifted =
        offset === 0
          ? changes
          : changes.map((c) => ({ ...c, time: c.time + offset }));
    }
    return shifted;
  };

  return (
    territory: Territory,
    generation: number,
    colors: readonly Vec3[],
    offset = 0
  ): Sea => {
    if (kept?.generation !== generation) {
      raw = null;
      kept = {
        generation,
        owner: territory.owner,
        seq: 0,
        changes: timed(territory.changes(), offset),
        colors: colors.slice(0, territory.ships),
      };
    }
    kept.owner = territory.owner;
    kept.seq = territory.last();
    kept.changes = timed(territory.changes(), offset);
    return kept;
  };
}

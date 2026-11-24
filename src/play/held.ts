import type { Territory } from '../sim/territory.ts';
import type { Sea } from '../snapshot.ts';
import type { Vec3 } from '../world/sphere.ts';

export function createHeld() {
  let kept: Sea | null = null;

  return (
    territory: Territory,
    generation: number,
    colors: readonly Vec3[]
  ): Sea => {
    if (kept?.generation !== generation)
      kept = {
        generation,
        owner: territory.owner,
        seq: 0,
        changes: territory.changes(),
        colors: colors.slice(0, territory.ships),
      };
    kept.owner = territory.owner;
    kept.seq = territory.last();
    kept.changes = territory.changes();
    return kept;
  };
}

// PLACEHOLDER: what the HUD shows that the sim has no value for yet, held here and nowhere else. Each line becomes one
// line reading the sim's value once it has it (items, Gust, her career); the game already supplies where she is, her
// heading, her hull, shield and gun, the ships afloat and the Storm (play/game.ts status).

import type { Career, Kit } from '../player';

export function createPlaceholder() {
  let chosen = 0;
  const fixed = {
    gust: 2,
    items: [{ item: 'item.smallShield', count: 1 }, { item: 'item.repairKit', count: 2 }, null],
  } as const satisfies Omit<Kit, 'chosen'>;

  return {
    /** Her career: her level, how far toward the next, and her rank's tier. */
    career: (): Career => ({ level: 7, progress: 0.35, tier: 2 }),
    /** A slot tapped: it is in hand. */
    choose(i: number) {
      chosen = i;
    },
    /** What she carries. */
    kit: (): Kit => ({ ...fixed, chosen }),
  };
}

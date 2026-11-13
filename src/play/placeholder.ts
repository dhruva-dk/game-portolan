// PLACEHOLDER: what the HUD shows and does that nothing in the game has yet, held here and nowhere else: the hotbar's
// items and the slot in hand (no items yet), Gust's charges and its button (no Gust yet), and her career (none kept
// yet), which the lobby, the rank folio and the result show. Only main.ts reads it, to fill the HUD's state (kit) and
// actions (choose, gust) and the flow's career. Each becomes the game's own once it has it; all else the HUD shows is
// the game's already (play/game.ts status: where she is and heads, her hull, shield and gun, the ships afloat, the
// Storm's clock and its calm on the minimap and the full map).

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
    /** Gust pressed: there is no Gust to raise yet, so nothing happens. */
    gust() {},
    /** What she carries. */
    kit: (): Kit => ({ ...fixed, chosen }),
  };
}

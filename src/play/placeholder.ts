// PLACEHOLDER: what the game shows that nothing in it keeps yet, held here and nowhere else: her career, which the
// lobby, the rank folio and the result show. Only main.ts reads it, for the flow. All else the HUD shows is the game's
// own (play/game.ts status and kit).

import type { Career } from '../player';

export function createPlaceholder() {
  return {
    /** Her career: her level, how far toward the next, and her rank's tier. */
    career: (): Career => ({ level: 7, progress: 0.35, tier: 2 }),
  };
}

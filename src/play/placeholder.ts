// PLACEHOLDER: what the HUD shows that the sim has no value for yet, held here and nowhere else. Each line becomes one
// line reading the sim's value once it has it (items, Gust, her career); the game already supplies where she is, her
// heading, her hull, shield and gun, the ships afloat and the Storm (play/game.ts status).

import type { HudState, Slot } from '../ui/hud';
import type { Status } from './game';

export function createPlaceholder() {
  let chosen = 0;
  const fixed = {
    gust: 2,
    items: [{ glyph: 'item.smallShield', count: 1 }, { glyph: 'item.repairKit', count: 2 }, null],
  } as const satisfies { gust: number; items: readonly (Slot | null)[] };

  return {
    /** Her career: her level, how far toward the next, and her rank's tier. */
    career: () => ({ level: 7, progress: 0.35, tier: 2 }),
    /** A slot tapped: it is in hand. */
    choose(i: number) {
      chosen = i;
    },
    state(status: Status): HudState {
      // the gun's slot holds her gun, if she has one
      const gun: Slot | null = status.gun ? { glyph: 'weapon.cannon' } : null;
      return { ...status, gust: fixed.gust, slots: [gun, ...fixed.items], chosen };
    },
  };
}

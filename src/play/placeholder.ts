// PLACEHOLDER: what the game shows that nothing in it keeps yet, held here and nowhere else: her career, which the
// lobby, the rank folio and the result show, and what a match adds to it. Only main.ts reads it, for the flow. All
// else the HUD shows is the game's own (play/game.ts status and kit).

import type { Career } from '../player';

/** What a match adds toward her next level: a little for taking part, more the higher she placed, and her share of
 *  the sea twice over. */
const GAIN = { part: 0.12, place: 0.45, share: 2 } as const;

export function createPlaceholder() {
  let career: Career = { level: 7, progress: 0.35, tier: 2 };
  return {
    /** Her career: her level, how far toward the next, and her rank's tier. */
    career: (): Career => career,
    /** A match ended for her in `place` of `of`, holding `share` of the sea: her career before and after. */
    credit(place: number, of: number, share: number): { from: Career; to: Career } {
      const from = career, placed = of > 1 ? (of - place) / (of - 1) : 1;
      let progress = from.progress + GAIN.part + GAIN.place * placed + GAIN.share * Math.max(0, share), level = from.level;
      for (; progress >= 1; progress -= 1) level += 1;
      career = { ...from, level, progress };
      return { from, to: career };
    },
  };
}

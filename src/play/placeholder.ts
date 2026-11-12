// PLACEHOLDER: what the HUD shows that the sim has no value for yet, held here and nowhere else. Each line becomes one
// line reading the sim's value once it has it (health, the Storm, items, Gust, her career); the game already supplies where she
// is, her heading and the ships afloat (play/game.ts status).

import type { HudState } from '../ui/hud';
import type { IslandSite } from '../world/planet';
import type { Status } from './game';

/** The Storm's clock counts down from this, seconds, and starts again. */
const STORM_ROUND = 81;

export function createPlaceholder(islands: readonly IslandSite[]) {
  let storm = STORM_ROUND, chosen = 0;
  const fixed = {
    hull: 100, hullMax: 100,
    shield: 40, shieldMax: 100,
    gust: 2,
    slots: [{ glyph: 'weapon.cannon', count: 8 }, { glyph: 'item.smallShield', count: 1 }, { glyph: 'item.repairKit', count: 2 }, null],
    // the Storm's calm round the largest island
    eye: islands.length ? { centre: islands[0].chart.at, radius: 300 } : null,
  } satisfies Partial<HudState>;

  return {
    /** Her career: her level, how far toward the next, and her rank's tier. */
    career: () => ({ level: 7, progress: 0.35, tier: 2 }),
    /** A slot tapped: it is in hand. */
    choose(i: number) {
      chosen = i;
    },
    state(status: Status, dt: number): HudState {
      storm -= dt;
      if (storm <= 0) storm += STORM_ROUND;
      return { ...fixed, ...status, storm, chosen };
    },
  };
}

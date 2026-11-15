// A bot's temperament: 0117's captains' six (src/sim/captains/temperaments.ts), what applies of them, each bot's varied
// a little by her seed as 0117 varied each captain's, with her skill and mood drawn as 0117 drew them (sim/setup.ts).
//
// Pure arithmetic: no three, so it runs in node for the tests; the same for a seed every time.

import type { Captain, Style } from '../race.ts';
import { random } from '../world/random.ts';

/** A captain's temperament (0117's Style, what applies of it): how readily she fights, 0–1; how far off she notices a
 *  ship, m; the hull she runs below; m she keeps inside the Storm's edge (seam); the share of a gun's range she closes
 *  to (seam); how much she wants loot, and how far off she goes for it, m; the hull she mends from (before her skill's
 *  part); how much she wants water (claimer.ts; new, 0–1: the homesteader and the turtle most, the brawler least). With
 *  her skill, 0–1, and her mood (aggro), 0–1. */
export interface Temper {
  fight: number; notice: number; run: number; margin: number; standoff: number;
  loot: number; lootReach: number; mend: number; claim: number;
  skill: number; aggro: number;
}

/** 0117's six temperaments: hunter, homesteader, raider, turtle, scavenger, brawler. */
const STYLES: readonly Omit<Temper, 'skill' | 'aggro'>[] = [
  { fight: 0.8, notice: 200, run: 25, margin: 25, standoff: 0.9, loot: 0.4, lootReach: 120, mend: 50, claim: 0.35 },
  { fight: 0.3, notice: 110, run: 45, margin: 35, standoff: 1.1, loot: 0.5, lootReach: 130, mend: 65, claim: 1 },
  { fight: 0.55, notice: 160, run: 35, margin: 25, standoff: 0.9, loot: 0.5, lootReach: 120, mend: 55, claim: 0.6 },
  { fight: 0.35, notice: 120, run: 50, margin: 45, standoff: 1.25, loot: 0.6, lootReach: 110, mend: 70, claim: 0.8 },
  { fight: 0.3, notice: 120, run: 40, margin: 30, standoff: 1.15, loot: 1, lootReach: 220, mend: 60, claim: 0.5 },
  { fight: 1, notice: 220, run: 15, margin: 15, standoff: 0.7, loot: 0.3, lootReach: 90, mend: 40, claim: 0.2 },
];

/** The six by name, in STYLES' order (race.ts Style). */
const NAMES: readonly Style[] = ['hunter', 'homesteader', 'raider', 'turtle', 'scavenger', 'brawler'];

/** The captain whose bot `temper(seed)` sails (a card's captain for today's bot): her seed, her style as it draws it,
 *  and stats on the 0–20 scale. Gunnery, Helm and Lookout are her skill (0.35 + 0.55 u at stat 20 u); the rest are
 *  middling (10). Until the bots read the stats (#58 step 6), only the seed sails her. */
export function captainOf(seed: number): Captain {
  const u = random(seed ^ 0x51a7e), style = NAMES[Math.floor(u() * STYLES.length)];
  const skill = temper(seed).skill, x = (20 * (skill - 0.35)) / 0.55;
  const stats = { gunnery: x, helm: x, seamanship: 10, nerve: 10, consistency: 10, stormcraft: 10, stamina: 10, feedback: 10, lookout: x };
  return { seed, style, stats };
}

/** A bot's temperament, by her seed: one of the six, varied a little as 0117 varied each captain's (but her loot and
 *  mending, 0117's own, which it never varied); her skill as 0117 drew it (0.35–0.9), and her mood (0.2–1). */
export function temper(seed: number): Temper {
  const u = random(seed ^ 0x51a7e);
  const t = STYLES[Math.floor(u() * STYLES.length)];
  return {
    fight: Math.min(1, Math.max(0, t.fight + 0.2 * (u() - 0.5))),
    notice: t.notice * (0.85 + 0.3 * u()),
    run: t.run * (0.8 + 0.4 * u()),
    margin: t.margin * (0.8 + 0.4 * u()),
    standoff: t.standoff * (0.9 + 0.2 * u()),
    loot: t.loot, lootReach: t.lootReach, mend: t.mend, claim: t.claim,
    skill: 0.35 + 0.55 * u(),
    aggro: 0.2 + 0.8 * u(),
  };
}

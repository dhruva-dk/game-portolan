// A bot's temperament: one of six, each bot's varied a little by her seed, with
// her skill and mood drawn by it too.
//
// Pure arithmetic: no three, so it runs in node for the tests; the same for a
// seed every time.

import { random } from '../world/random.ts';
import { weighed } from './tables.ts';

/**
 * A captain's temperament: how readily she fights, 0–1; how far off she notices
 * a ship, m; the hull she runs below; m she keeps inside the Storm's edge
 * (seam); the share of a gun's range she closes to (seam); how much she wants
 * loot, and how far off she goes for it, m; the hull she mends from (before her
 * skill's part); how much she wants water (claimer.ts, 0–1: the homesteader and
 * the turtle most, the brawler least). With her skill, 0–1, and her mood
 * (aggro), 0–1.
 */
export interface Temper {
  fight: number;
  notice: number;
  run: number;
  margin: number;
  standoff: number;
  loot: number;
  lootReach: number;
  mend: number;
  claim: number;
  skill: number;
  aggro: number;
}

/**
 * The six temperaments: hunter, homesteader, raider, turtle, scavenger,
 * brawler (persona.ts PERSONAS, in this order). Balanced by the ratings
 * (PLAN P6): a captain who sees every ship from far off slips away from
 * every fight, and outlasts those who fight; so the scavenger, her eyes on
 * the loot, notices a ship late, and the turtle, in her shell, not much
 * sooner.
 */
export const STYLES: readonly Omit<Temper, 'skill' | 'aggro'>[] = [
  {
    fight: 0.8,
    notice: 200,
    run: 25,
    margin: 25,
    standoff: 0.9,
    loot: 0.4,
    lootReach: 120,
    mend: 50,
    claim: 0.35,
  },
  {
    fight: 0.3,
    notice: 110,
    run: 45,
    margin: 35,
    standoff: 1.1,
    loot: 0.5,
    lootReach: 130,
    mend: 65,
    claim: 1,
  },
  {
    fight: 0.55,
    notice: 120,
    run: 35,
    margin: 25,
    standoff: 0.9,
    loot: 0.5,
    lootReach: 120,
    mend: 55,
    claim: 0.6,
  },
  {
    fight: 0.35,
    notice: 85,
    run: 35,
    margin: 45,
    standoff: 1.25,
    loot: 0.6,
    lootReach: 110,
    mend: 70,
    claim: 0.8,
  },
  {
    fight: 0.3,
    notice: 60,
    run: 30,
    margin: 30,
    standoff: 1.15,
    loot: 0.75,
    lootReach: 140,
    mend: 60,
    claim: 0.5,
  },
  {
    fight: 1,
    notice: 220,
    run: 32,
    margin: 15,
    standoff: 0.7,
    loot: 0.6,
    lootReach: 90,
    mend: 60,
    claim: 0.2,
  },
];

/**
 * The skill each style is drawn from, least to most (hunter … brawler): the
 * fighters sharper, as fighting is their trade, the scavenger, who lives by
 * keeping out of it, the least; each within 0–1. The raider's and the
 * turtle's were trimmed when the hand steadied with skill (gunner.ts
 * `unsteady`, PLAN A3), which gave most to the middling and put them ahead.
 */
const SKILL: readonly (readonly [number, number])[] = [
  [0.55, 1],
  [0.35, 0.9],
  [0.25, 0.8],
  [0.3, 0.85],
  [0.15, 0.7],
  [0.55, 1],
];

/**
 * A bot's temperament, by her seed: one of the `styles` (her brain's; the six
 * if not given), drawn by `weights` (each as likely as the next if not given:
 * a match's mix of personas, persona.ts), varied a little (but not her loot,
 * her mending or her claim, which are the style's own); her skill (by her
 * style, SKILL), and her mood (0.2–1). With the style drawn, by its index.
 */
export function temper(
  seed: number,
  styles: readonly Omit<Temper, 'skill' | 'aggro'>[] = STYLES,
  weights: readonly number[] = styles.map(() => 1)
): Temper & { style: number } {
  const u = random(seed ^ 0x51a7e);
  const style = weighed(weights, u()),
    t = styles[style],
    [lo, hi] = SKILL[style] ?? SKILL[1];
  return {
    style,
    fight: Math.min(1, Math.max(0, t.fight + 0.2 * (u() - 0.5))),
    notice: t.notice * (0.85 + 0.3 * u()),
    run: t.run * (0.8 + 0.4 * u()),
    margin: t.margin * (0.8 + 0.4 * u()),
    standoff: t.standoff * (0.9 + 0.2 * u()),
    loot: t.loot,
    lootReach: t.lootReach,
    mend: t.mend,
    claim: t.claim,
    skill: lo + (hi - lo) * u(),
    aggro: 0.2 + 0.8 * u(),
  };
}

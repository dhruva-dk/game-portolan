// The captains' temperaments: six ways to sail a battle royale, each with a little per-captain variation.
// A gentle captain (a first match) keeps its distance, shoots late and wide, and heals early.
import { hash32 } from '../math.ts';
import type { Ship } from '../state.ts';

export interface Style {
  /** Fight: how readily it engages, 0–1. */
  fight: number;
  /** How far off it notices and chases a ship, metres. */
  notice: number;
  /** Hull below which it breaks off and runs. */
  run: number;
  /** Hull below which it heals when it can. */
  mend: number;
  /** Interest in loot, 0–1, and how far it goes for it. */
  loot: number;
  lootReach: number;
  /** Size of the loops it sails to claim water, metres. */
  loop: number;
  /** Raiding: cutting rivals' trails, 0–1. */
  raid: number;
  /** Metres it keeps inside the Storm's edge. */
  margin: number;
  /** Share of the preferred range it closes to: under 1 presses in, over 1 stands off. */
  standoff: number;
  /** Coins it holds back before calling the gull. */
  thrift: number;
  /** How often a loop it plans goes round a landmark near enough to take, 0–1. */
  marks: number;
}

export const GENTLE: Style = { fight: 0.15, notice: 70, run: 55, mend: 75, loot: 0.8, lootReach: 140, loop: 40, raid: 0, margin: 40, standoff: 1.3, thrift: 20, marks: 0.2 };

/** Hunter, Homesteader, Raider, Turtle, Scavenger, Brawler. */
export const STYLES: readonly Style[] = [
  { fight: 0.8, notice: 200, run: 25, mend: 50, loot: 0.4, lootReach: 120, loop: 45, raid: 0.5, margin: 25, standoff: 0.9, thrift: 0, marks: 0.25 },
  { fight: 0.3, notice: 110, run: 45, mend: 65, loot: 0.5, lootReach: 130, loop: 90, raid: 0.1, margin: 35, standoff: 1.1, thrift: 30, marks: 0.9 },
  { fight: 0.55, notice: 160, run: 35, mend: 55, loot: 0.5, lootReach: 120, loop: 40, raid: 1, margin: 25, standoff: 0.9, thrift: 0, marks: 0.2 },
  { fight: 0.35, notice: 120, run: 50, mend: 70, loot: 0.6, lootReach: 110, loop: 30, raid: 0, margin: 45, standoff: 1.25, thrift: 45, marks: 0.5 },
  { fight: 0.3, notice: 120, run: 40, mend: 60, loot: 1, lootReach: 220, loop: 35, raid: 0.2, margin: 30, standoff: 1.15, thrift: 0, marks: 0.3 },
  { fight: 1, notice: 220, run: 15, mend: 40, loot: 0.3, lootReach: 90, loop: 30, raid: 0.3, margin: 15, standoff: 0.7, thrift: 0, marks: 0.1 },
];

export const STYLE_NAMES = ['hunter', 'homesteader', 'raider', 'turtle', 'scavenger', 'brawler'] as const;

const IDS = 64;
const unit = (x: number): number => Math.max(0, Math.min(1, x));

function signature(t: Style, id: number): Style {
  const u = (k: number): number => (hash32(0x51a7e, id * 16 + k) & 0xffff) / 0xffff;
  return {
    ...t,
    fight: unit(t.fight + 0.2 * (u(0) - 0.5)),
    notice: t.notice * (0.85 + 0.3 * u(1)),
    run: t.run * (0.8 + 0.4 * u(2)),
    loop: t.loop * (0.8 + 0.4 * u(3)),
    margin: t.margin * (0.8 + 0.4 * u(4)),
    standoff: t.standoff * (0.9 + 0.2 * u(5)),
  };
}

const SIGNED: readonly Style[] = STYLES.flatMap((t) => Array.from({ length: IDS }, (_, id) => signature(t, id)));

export const styleOf = (ship: Ship): Style =>
  (ship.captain.gentle ? GENTLE : SIGNED[(ship.captain.temperament % STYLES.length) * IDS + (ship.look % IDS)]);

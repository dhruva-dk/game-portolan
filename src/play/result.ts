// A race's result (race.ts RaceResult), tallied as it is sailed (play/state.ts keeps one): each ship's balls fired,
// landed on another and taken, and her share of the sea as she last held it afloat; then, once it is over, the
// finishing order. The order (#58): the ships afloat at the end first, by the sinkings credited to each, then her own
// share of the sea, then the lower id; then the sunk, the last sunk highest (a forfeit, sunk at second 0, so last).
// A ram is no ball: it counts in none of the hits. Faults and the flight's stops are kept by upkeep.ts, and state.ts
// adds them to the result.

import type { Cause, RaceCard, RaceResult } from '../race.ts';
import type { Shot, Strike } from '../sim/battle.ts';

/** A ship sunk, as the result reads her: who, at whose hand, how, and the second of the race. */
export interface Down { id: number; by: number | null; cause: Cause; time: number }

/** The finishing order, first place first: `alive` (the ships afloat at the end) by sinkings credited, then `share`,
 *  then id; then `sunk`, in the order they went down, the last first. */
export function finishing(alive: readonly number[], sunk: readonly Down[], share: (id: number) => number): number[] {
  const credit = (id: number) => sunk.filter((s) => s.by === id).length;
  const top = [...alive].sort((a, b) => credit(b) - credit(a) || share(b) - share(a) || a - b);
  return [...top, ...sunk.map((s) => s.id).reverse()];
}

/** The tally of a race of `count` ships. */
export function createTally(count: number) {
  const fired = new Array<number>(count).fill(0), landed = fired.slice(), taken = fired.slice(), held = fired.slice();
  return {
    /** What the guns did in a step: each ball fired (a shot's every ball), each that struck another ship. */
    step(shots: readonly Shot[], strikes: readonly Strike[]) {
      for (const s of shots) fired[s.shooter] += s.dirs.length;
      for (const s of strikes) {
        if (s.ram || s.shooter === s.struck) continue;
        landed[s.shooter]++;
        taken[s.struck]++;
      }
    },
    /** A ship sinking, with her share of the sea as she held it afloat. */
    sank(id: number, share: number) {
      held[id] = share;
    },
    /** The result of a race (dealt `card`, or a card-less one of `seed`) ended `seconds` in with `alive` afloat, sunk
     *  as `sunk` has it, each afloat holding `share` of the sea. */
    result(race: { card?: RaceCard; seed: number }, alive: readonly number[], sunk: readonly Down[], share: (id: number) => number, seconds: number): RaceResult {
      const afloat = new Set(alive), ids = fired.map((_, id) => id);
      const now = (id: number) => (afloat.has(id) ? share(id) : held[id]);
      return {
        seed: race.card?.seed ?? race.seed, league: race.card?.league ?? 0, round: race.card?.round ?? 0,
        order: finishing(alive, sunk, share),
        sinkings: sunk.map((s) => ({ id: s.id, by: s.by, cause: s.cause, second: s.time })),
        seaHeld: ids.map((id) => ({ id, share: now(id) })),
        faults: [], stops: [],
        hits: ids.map((id) => ({ id, fired: fired[id], landed: landed[id], taken: taken[id] })),
        seconds,
      };
    },
  };
}

export type Tally = ReturnType<typeof createTally>;

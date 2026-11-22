// A race's result (race.ts RaceResult), tallied as it is sailed (state.ts keeps
// one tally for a carded race) and made the step it is over (sim/carded.ts
// over).
//
// The finishing order: the ships afloat at the end first, by the sinkings
// credited to each, then her share of the sea, then the lower id; then the
// sunk, the last sunk first; then those that forfeited, in the order of their
// ids. A forfeit is listed among the sinkings at second 0, before the rest.
//
// The tally: each ship's shots fired (a scatter's charge is one shot), her
// strikes landed on another ship and taken from one (a ball's or a burst's: a
// ram is no shot, and counts in neither), and the hit points her balls and
// her rams took off others; her share of the sea as she last held it afloat
// (a sunk ship's water drains: what she held as she went down is kept, so the
// sea a team held is its ships' together, sunk or not); and each fault as it
// came on or worsened.
//
// The hash is FNV-1a over the bits of the final state's numbers, as eight hex
// digits: its clock, the loot left, every ship afloat (her place, heading and
// speed), every crew (her hit points, her share of the sea, whether she
// floats) and every sinking, in order. The same race gives the same hash
// wherever it is run.

import { SOUND, type Faults } from '../kinds.ts';
import type { RaceCard, RaceResult } from '../race.ts';
import type { Crew, Shot, Strike } from '../sim/battle.ts';
import { over, teamsOf } from '../sim/carded.ts';
import type { Vessel } from '../sim/contact.ts';
import { faultsIn } from '../sim/faults.ts';
import { sunk } from '../sim/health.ts';
import type { Sunk } from '../sim/match.ts';

/**
 * The finishing order, first place first: `alive` (the ships afloat at the
 * end) by sinkings credited, then `share`, then id; then `sunk`, in the order
 * they went down, the last first; then `forfeit`, by id.
 */
export function finishing(
  alive: readonly number[],
  sunk: readonly Pick<Sunk, 'id' | 'by'>[],
  share: (id: number) => number,
  forfeit: readonly number[] = []
): number[] {
  const credit = (id: number) => sunk.filter((s) => s.by === id).length;
  const top = [...alive].sort(
    (a, b) => credit(b) - credit(a) || share(b) - share(a) || a - b
  );
  return [
    ...top,
    ...sunk.map((s) => s.id).reverse(),
    ...[...forfeit].sort((a, b) => a - b),
  ];
}

/** FNV-1a over the bits of every number given, as eight hex digits. */
function fingerprint(numbers: readonly number[]): string {
  const bytes = new Uint8Array(new Float64Array(numbers).buffer);
  let h = 0x811c9dc5;
  for (const b of bytes) h = Math.imul(h ^ b, 0x01000193) >>> 0;
  return h.toString(16).padStart(8, '0');
}

/**
 * The sea as a race's step left it (state.ts): its clock, the ships afloat
 * (their ids, and as the sim has them), every crew, every sinking so far in
 * order with its second, the pieces of loot left, and a ship's share of the
 * sea now.
 */
interface Standing {
  seconds: number;
  alive: readonly number[];
  fleet: readonly Vessel[];
  crews: readonly Crew[];
  sunk: readonly (Sunk & { time: number })[];
  loot: number;
  share: (id: number) => number;
}

/** The numbers a race's hash is made of, as it stands. */
function numbers(s: Standing): number[] {
  const n: number[] = [s.seconds, s.loot];
  for (const v of [...s.fleet].sort((a, b) => a.id - b.id))
    n.push(v.id, ...v.ship.at, ...v.ship.heading, v.ship.speed);
  for (const c of [...s.crews].sort((a, b) => a.id - b.id))
    n.push(
      c.id,
      c.health.hull,
      c.health.shield,
      s.share(c.id),
      sunk(c.health) ? 0 : 1
    );
  for (const k of s.sunk) n.push(k.id, k.by ?? -1, k.time);
  return n;
}

/**
 * The tally of the race dealt `card`, whose storm has closed its last cap by
 * `closes` seconds on its clock.
 */
export function createTally(card: RaceCard, closes: number) {
  const count = card.ships.length,
    teams = teamsOf(card),
    zeros = () => new Array<number>(count).fill(0);
  const fired = zeros(),
    landed = zeros(),
    taken = zeros(),
    dealt = zeros(),
    held = zeros();
  const faults: RaceResult['faults'][number][] = [],
    pits: RaceResult['pits'][number][] = [];
  /** Each ship's faults as last watched. */
  const levels: Faults[] = [];
  const forfeit = card.ships.filter((s) => s.forfeit).map((s) => s.id);
  let made: RaceResult | null = null;

  /** What the guns and the rams did in a step. */
  const fought = (shots: readonly Shot[], strikes: readonly Strike[]) => {
    for (const s of shots) fired[s.shooter]++;
    for (const s of strikes) {
      if (s.shooter === s.struck) continue;
      dealt[s.shooter] += s.damage;
      if (s.ram) continue;
      landed[s.shooter]++;
      taken[s.struck]++;
    }
  };

  /**
   * The crews after a step, at `second` of the race: each fault come on or
   * worsened since the step before is noted.
   */
  const watch = (crews: readonly Crew[], second: number) => {
    for (const c of crews) {
      const now = sunk(c.health) ? SOUND : faultsIn(c),
        was = levels[c.id] ?? SOUND;
      if (now === was) continue;
      now.forEach((level, zone) => {
        if (level > was[zone]) faults.push({ id: c.id, zone, level, second });
      });
      levels[c.id] = now;
    }
  };

  /** The result of the race as it stands at its end. */
  const result = (s: Standing): RaceResult => {
    const afloat = new Set(s.alive),
      ids = card.ships.map((k) => k.id);
    const share = (id: number) => (afloat.has(id) ? s.share(id) : held[id]);
    const out: RaceResult['sinkings'] = forfeit.map((id) => ({
      id,
      by: null,
      cause: 'forfeit',
      gun: null,
      second: 0,
    }));
    return {
      seed: card.seed,
      tier: card.tier,
      round: card.round,
      order: finishing(s.alive, s.sunk, s.share, forfeit),
      sinkings: [
        ...out,
        ...s.sunk.map(({ id, by, cause, gun, time: second }) => ({
          id,
          by,
          cause,
          gun,
          second,
        })),
      ],
      seaHeld: ids.map((id) => ({ id, share: share(id) })),
      faults: faults.slice(),
      pits: pits.slice(),
      hits: ids.map((id) => ({
        id,
        fired: fired[id],
        landed: landed[id],
        taken: taken[id],
        dealt: dealt[id],
      })),
      seconds: s.seconds,
      hash: fingerprint(numbers(s)),
    };
  };

  return {
    /** Each ship's team, by her id. */
    teams,
    /** The ships that did not put to sea. */
    forfeit,
    /** A ship's share of the sea, as she holds it afloat. */
    holds(id: number, share: number) {
      held[id] = share;
    },
    /** A pit stop ended: whose, when it began, how long, its jobs and slips. */
    pitted(stop: RaceResult['pits'][number]) {
      pits.push(stop);
    },
    /**
     * A step of the race tallied: what its guns and rams did (`shots`,
     * `strikes`) and how it left the sea (`standing`, asked for once the
     * tally is taken); and the result made, the step the race is over. Once
     * it is, nothing more is tallied.
     */
    settle(
      shots: readonly Shot[],
      strikes: readonly Strike[],
      standing: () => Standing
    ) {
      if (made) return;
      fought(shots, strikes);
      const s = standing();
      watch(s.crews, s.seconds);
      if (over(teams, s.alive, s.seconds - closes)) made = result(s);
    },
    /** The race's result, once it is over; null while it is on. */
    result: (): RaceResult | null => made,
  };
}

export type Tally = ReturnType<typeof createTally>;

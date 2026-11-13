// What each ship carries, stepped with the fleet: her hold (hold.ts), her gust (gust.ts) and the loot on the water
// (loot.ts), as one step's work round the fleet's and the fighting's (0117's hotbar input, useTick, gust and pickups,
// in its order):
// - before the fleet sails (asked): what each ship asks of her stores, a player's tap or a bot's, done: a tap on her
//   gun's slot with a gun offered swaps it (0117's take); a tap on the slot in hand with something offered and her
//   slots full, likewise; any other tap chooses that slot, or begins it if it is in hand (hold.ts tapped); a gust
//   asked for is spent if one may be (not while she mends: 0117's);
// - her helm as her stores sail her (crewed): a gust blowing drives her on (ship.ts), and mending she sails at
//   hold.ts USING of the speed she asks;
// - after the fighting (stored): what she mends with and her gust stepped on, the loot drifted and swept up (and
//   the swaps asked for made), and every ship sunk this step spilling what she had.
//
// Pure arithmetic: no three, so it runs in node for the tests; deterministic for the same inputs.

import type { Crew } from './battle.ts';
import type { Vessel } from './contact.ts';
import { spent, stepGust } from './gust.ts';
import { sunk } from './health.ts';
import { stepUse, tapped, USING } from './hold.ts';
import { cargo, drifted, offered, overboard, swept, type Flotsam } from './loot.ts';
import type { Helm } from './ship.ts';
import type { Depth } from './shoal.ts';

/** What a ship asks of her stores this step: a slot tapped (0 her gun's, 1–3 the items'; null none), whether to spend
 *  a gust, and a swap asked for outright (a bot's: the slot to swap into; null none). */
export interface Ask { tap: number | null; gust: boolean; take: number | null }

/** Nothing asked. */
export const NOTHING: Ask = { tap: null, gust: false, take: null };

/**
 * The asks done, before the fleet sails: each ship's crew after her taps and gusts, the swaps asked for (her id to
 * the slot), and the ships a gust was spent for. `asks` by ship id; `fleet` for where each lies.
 */
export function asked(crews: readonly Crew[], fleet: readonly Vessel[], flotsam: Flotsam, asks: ReadonlyMap<number, Ask>): { crews: Crew[]; takes: Map<number, number>; blew: number[] } {
  const takes = new Map<number, number>(), blew: number[] = [];
  const at = new Map(fleet.map((v) => [v.id, v.ship.at]));
  const after = crews.map((c) => {
    const ask = asks.get(c.id), p = at.get(c.id);
    if (!ask || !p || sunk(c.health)) return c;
    let crew = c;
    if (ask.take !== null) takes.set(c.id, ask.take);
    if (ask.tap !== null) {
      const o = offered(crew, p, flotsam);
      if (ask.tap === 0 && o.gun) takes.set(c.id, 0);
      else if (ask.tap > 0 && ask.tap === crew.hold.chosen && o.item) takes.set(c.id, ask.tap);
      else crew = { ...crew, hold: tapped(crew.hold, ask.tap, crew.health) };
    }
    if (ask.gust && !crew.hold.using) {
      const g = spent(crew.gust);
      if (g.blew) {
        crew = { ...crew, gust: g.gust };
        blew.push(c.id);
      }
    }
    return crew;
  });
  return { crews: after, takes, blew };
}

/** Her helm as her stores sail her: driven on by a gust blowing, held back while she mends. */
export function crewed(h: Helm, c: Crew | undefined): Helm {
  if (!c) return h;
  const gust = c.gust.blowing > 0;
  const throttle = c.hold.using ? h.throttle * USING : h.throttle;
  return gust || throttle !== h.throttle ? { ...h, throttle, gust } : h;
}

/**
 * After the fighting: dt seconds of every crew's mending and gust, the loot drifting and swept up by `fleet` (the
 * swaps `takes` asks for made), and the ships of `sunkNow` (still in `fleet`) spilling all they had where they lie.
 * Over water `depth` deep; `seed` the match's, for the spill's kicks.
 */
export function stored(
  crews: readonly Crew[], flotsam: Flotsam, fleet: readonly Vessel[], takes: ReadonlyMap<number, number>,
  sunkNow: readonly number[], dt: number, depth: Depth, seed: number,
): { crews: Crew[]; flotsam: Flotsam } {
  let f = drifted(flotsam, dt, depth);
  const stepped = crews.map((c): Crew => {
    if (sunk(c.health)) return c;
    const u = stepUse(c.hold, c.health, dt);
    return { ...c, hold: u.hold, health: u.health, gust: stepGust(c.gust, dt) };
  });
  const s = swept(f, stepped, fleet, takes, seed);
  f = s.flotsam;
  for (const id of sunkNow) {
    const c = s.crews.find((k) => k.id === id), v = fleet.find((k) => k.id === id);
    if (!c || !v) continue;
    const goods = cargo(c);
    if (goods.length) f = overboard(f, v.ship.at, goods, id, seed);
  }
  // what she spilled is gone from her
  const gone = new Set(sunkNow);
  return { crews: s.crews.map((c) => (gone.has(c.id) ? { ...c, gun: null, hold: { ...c.hold, items: c.hold.items.map(() => null), using: null } } : c)), flotsam: f };
}

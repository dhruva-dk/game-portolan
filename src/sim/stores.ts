// What each ship carries, stepped with the fleet: her hold (hold.ts), her gust
// (gust.ts) and the loot on the water (loot.ts), as one step's work round the
// fleet's and the fighting's:
// - before the fleet sails (asked): what each ship asks of her stores, a
// player's tap or a bot's, done: a tap on the
//   gun slot not in hand takes that gun in hand (it fires only after EQUIP; its windup or reload let go); a tap on
//   the gun in hand swaps it for a gun offered, else takes the guns back in hand from her items, else reloads it if
//   its magazine isn't full; a tap on the item slot in hand with something offered and her slots full swaps it
//   likewise; any other tap chooses that slot, or begins it if it is in hand (hold.ts tapped); a gust asked for is
//   spent if one may be (not while she mends);
// - her helm as her stores sail her (crewed): a gust blowing drives her on
// (ship.ts), and mending she sails at
//   hold.ts USING of the speed she asks, her rigging cut RIGGING of it;
// - after the fighting (stored): what she mends with (mended above
// faults.ts FAULTS.minor, her zones' tallies cleared), her gust and her cut rigging stepped on,
// the loot drifted and swept up (and
//   the swaps asked for made), and every ship sunk this step spilling what she had.
//
// Pure arithmetic: no three, so it runs in node for the tests; deterministic
// for the same inputs.

import type { Call } from '../race.ts';
import type { Crew, Cue } from './battle.ts';
import type { Vessel } from './contact.ts';
import { fitOf, rose } from './faults.ts';
import { reloadOf } from './gun.ts';
import { spent, stepGust } from './gust.ts';
import { CARRIED, EQUIP, GUNS, RIGGING } from './handling.ts';
import { sunk } from './health.ts';
import { stepUse, tapped, USING, type Use } from './hold.ts';
import {
  cargo,
  drifted,
  offered,
  overboard,
  swept,
  type Flotsam,
  type Taken,
} from './loot.ts';
import type { Helm } from './ship.ts';
import type { Depth } from './shoal.ts';

/**
 * What a ship asks of her stores this step: an item slot tapped (1–3; 0 the
 * guns back in hand; null none), a gun slot tapped (0 or 1; null none), whether
 * to spend a gust, and a swap asked for outright (a bot's: the slot to swap
 * into, 0 the gun in hand; null none). In a race sailed by a card, besides: her
 * team's call changed (called.ts; her hands alone ask it).
 */
export interface Ask {
  tap: number | null;
  arm: number | null;
  gust: boolean;
  take: number | null;
  call?: Call;
}

/** A ship's mending done this step: whose, and what she mended with. */
export interface Mended {
  ship: number;
  use: Use;
}

/** Nothing asked. */
export const NOTHING: Ask = { tap: null, arm: null, gust: false, take: null };

/**
 * Her crew after a tap on gun slot `slot`, with what is offered her: the swap
 * asked for (0) if a gun is offered for the one in hand, and what her gun did
 * (cues).
 */
function armed(
  crew: Crew,
  slot: number,
  gunOffered: boolean,
  cue: (c: Omit<Cue, 'at'>) => void
): { crew: Crew; take: boolean } {
  if (slot < 0 || slot >= CARRIED) return { crew, take: false };
  const hold =
      crew.hold.chosen !== 0
        ? { ...crew.hold, chosen: 0, using: null }
        : crew.hold,
    g = crew.guns[slot];
  if (slot !== crew.hand) {
    // an empty slot isn't taken in hand; the other gun is, what the one put
    // down was doing let go
    if (!g)
      return {
        crew: hold === crew.hold ? crew : { ...crew, hold },
        take: false,
      };
    const guns = crew.guns.map((k, i) =>
      i === crew.hand && k ? { ...k, windup: 0, reload: 0 } : k
    );
    cue({ ship: crew.id, kind: 'swapped', gun: g.kind });
    return {
      crew: { ...crew, guns, hand: slot, equip: EQUIP, hold },
      take: false,
    };
  }
  if (gunOffered) return { crew, take: true };
  if (hold !== crew.hold) return { crew: { ...crew, hold }, take: false };
  if (!g || g.rounds >= GUNS[g.kind].mag || g.reload > 0 || g.windup > 0)
    return { crew, take: false };
  cue({ ship: crew.id, kind: 'reloading', gun: g.kind });
  return {
    crew: {
      ...crew,
      guns: crew.guns.map((k, i) =>
        i === slot ? { ...g, reload: reloadOf(g, fitOf(crew).reload) } : k
      ),
    },
    take: false,
  };
}

/**
 * The asks done, before the fleet sails: each ship's crew after her taps and
 * gusts, the swaps asked for (her id to the slot), the ships a gust was spent
 * for, and what their guns did. `asks` by ship id; `fleet` for where each lies.
 */
export function asked(
  crews: readonly Crew[],
  fleet: readonly Vessel[],
  flotsam: Flotsam,
  asks: ReadonlyMap<number, Ask>
): { crews: Crew[]; takes: Map<number, number>; blew: number[]; cues: Cue[] } {
  const takes = new Map<number, number>(),
    blew: number[] = [],
    cues: Cue[] = [];
  const at = new Map(fleet.map((v) => [v.id, v.ship.at]));
  const after = crews.map((c) => {
    const ask = asks.get(c.id),
      p = at.get(c.id);
    if (!ask || !p || sunk(c.health)) return c;
    let crew = c;
    if (ask.take !== null) takes.set(c.id, ask.take);
    const arm = ask.arm ?? (ask.tap === 0 ? crew.hand : null);
    if (arm !== null) {
      const a = armed(crew, arm, offered(crew, p, flotsam).gun !== null, (k) =>
        cues.push({ ...k, at: p })
      );
      crew = a.crew;
      if (a.take) takes.set(c.id, 0);
    } else if (ask.tap !== null) {
      const o = offered(crew, p, flotsam);
      if (ask.tap > 0 && ask.tap === crew.hold.chosen && o.item)
        takes.set(c.id, ask.tap);
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
  return { crews: after, takes, blew, cues };
}

/**
 * Her helm as her stores sail her: driven on by a gust blowing, held back while
 * she mends, and while her rigging is cut (RIGGING).
 */
export function crewed(h: Helm, c: Crew | undefined): Helm {
  if (!c) return h;
  const gust = c.gust.blowing > 0;
  const throttle =
    h.throttle * (c.hold.using ? USING : 1) * (c.cut > 0 ? RIGGING : 1);
  return gust || throttle !== h.throttle ? { ...h, throttle, gust } : h;
}

/**
 * After the fighting: dt seconds of every crew's mending and gust, the loot
 * drifting and swept up by `fleet` (the swaps `takes` asks for made), and the
 * ships of `sunkNow` (still in `fleet`) spilling all they had where they lie.
 * Over water `depth` deep; `seed` the match's, for the spill's kicks. Also what
 * was taken up, and the mending done.
 */
export function stored(
  crews: readonly Crew[],
  flotsam: Flotsam,
  fleet: readonly Vessel[],
  takes: ReadonlyMap<number, number>,
  sunkNow: readonly number[],
  dt: number,
  depth: Depth,
  seed: number
): { crews: Crew[]; flotsam: Flotsam; took: Taken[]; mended: Mended[] } {
  let f = drifted(flotsam, dt, depth);
  const mended: Mended[] = [];
  const stepped = crews.map((c): Crew => {
    if (sunk(c.health)) return c;
    const u = stepUse(c.hold, c.health, dt);
    if (u.done) mended.push({ ship: c.id, use: u.done });
    return {
      ...c,
      hold: u.hold,
      health: u.health,
      wear: rose(c.wear, c.health.hull, u.health.hull),
      gust: stepGust(c.gust, dt),
      cut: c.cut - dt > 1e-9 ? c.cut - dt : 0,
    };
  });
  const s = swept(f, stepped, fleet, takes, seed);
  return {
    ...spilled(s.crews, s.flotsam, fleet, sunkNow, seed),
    took: s.took,
    mended,
  };
}

/**
 * The ships `sunkNow` (in `fleet` as they went down) put their guns and slots
 * over the side where each lay, and carry them no more.
 */
export function spilled(
  crews: readonly Crew[],
  flotsam: Flotsam,
  fleet: readonly Vessel[],
  sunkNow: readonly number[],
  seed: number
): { crews: Crew[]; flotsam: Flotsam } {
  let f = flotsam;
  for (const id of sunkNow) {
    const c = crews.find((k) => k.id === id),
      v = fleet.find((k) => k.id === id);
    if (!c || !v) continue;
    const goods = cargo(c);
    if (goods.length) f = overboard(f, v.ship.at, goods, id, seed);
  }
  // what she spilled is gone from her
  const gone = new Set(sunkNow);
  const emptied = (c: Crew): Crew => ({
    ...c,
    guns: c.guns.map(() => null),
    hold: { ...c.hold, items: c.hold.items.map(() => null), using: null },
  });
  return {
    crews: crews.map((c) => (gone.has(c.id) ? emptied(c) : c)),
    flotsam: f,
  };
}

// Each ship's orders for a step (state.ts advance's first part): the player's from her hands, a lashed ship's the helm
// she holds, a bot's from her mind (sim/bot.ts think), by what she sails by (Bot); and what each asks of her stores.
//
// A bot sails by her captain's temperament (sim/temper.ts): a card's captain's `temperOf`, made at launch and made
// again once a second from half the race's expected length on, as she tires (Stamina); a card-less bot's
// `temper(seed)`, made once.

import type { Captain } from '../race.ts';
import { armed, type Crew, type Order } from '../sim/battle.ts';
import { think, type Hand, type Sea, type Seen } from '../sim/bot.ts';
import type { Vessel } from '../sim/contact.ts';
import { PLAYER } from '../sim/match.ts';
import type { Helm } from '../sim/ship.ts';
import { NOTHING, type Ask } from '../sim/stores.ts';
import { temper, temperOf } from '../sim/temper.ts';
import type { Aboard } from './aboard.ts';
import { captainIn, lengthIn, seedIn, type Match } from './match.ts';

/** What a bot sails by (sim/captain.ts Hand), with the captain her temperament is made from (null: by her seed) and
 *  the whole second of the match's clock it was last made at. */
export interface Bot extends Hand { captain: Captain | null; made: number }

/** What ship `id`'s bot sails by as she puts to sea in match `m`. */
export function botOf(m: Match, id: number): Bot {
  const captain = captainIn(m, id), seed = seedIn(m, id);
  return { seed, t: captain ? temperOf(captain, 0, lengthIn(m)) : temper(seed), captain, made: 0 };
}

/** Her temperament made again for the match's `clock` (s) in a race expected to last `length` s, if she tires and a
 *  whole second has passed since it was last made. */
const tiring = (b: Bot, clock: number, length: number): Bot => {
  const at = Math.floor(clock);
  if (!b.captain || length <= 0 || clock < length / 2 || at === b.made) return b;
  return { ...b, t: temperOf(b.captain, clock, length), made: at };
};

/** The player's hands for the step: her helm, her gun's orders and what she asks of her stores. */
export interface Hers { helm: Helm; gun: Order; ask: Ask }

/** What the orders are made from: the fleet afloat, what is kept aboard each (her mind and her bot written back), the
 *  crews by id, what the bots know of the sea, her hands, and the match's clock (s) in a race expected to last
 *  `length` s. */
export interface Bridge {
  fleet: readonly Vessel[]; aboard: ReadonlyMap<number, Aboard>; crews: ReadonlyMap<number, Crew>; sea: Sea; hers: Hers;
  clock: number; length: number;
}

/** Every ship's helm and gun's orders, in the fleet's order, and what each asks of her stores (by id; `asks` refilled). */
export function command(b: Bridge, asks: Map<number, Ask>): { helms: Helm[]; orders: Order[] } {
  const seen: Seen[] = b.fleet.map((v) => {
    const c = b.crews.get(v.id)!;
    return { ...v, hull: c.health.hull, shield: c.health.shield, armed: armed(c), crew: c };
  });
  const helms: Helm[] = [], orders: Order[] = [];
  asks.clear();
  // every ship but the one thinking, in one list refilled for each (a bot reads it only while she thinks)
  const others: Seen[] = [];
  b.fleet.forEach((v, i) => {
    const a = b.aboard.get(v.id)!;
    if (v.id === PLAYER && !a.mind) {
      [helms[i], orders[i]] = [b.hers.helm, b.hers.gun];
      asks.set(v.id, b.hers.ask);
    } else if (!a.mind || !a.bot) [helms[i], orders[i]] = [a.steady, { aim: null, fire: false }];
    else {
      others.length = 0;
      for (const o of seen) if (o.id !== v.id) others.push(o);
      a.bot = tiring(a.bot, b.clock, b.length);
      const r = think(seen[i], others, b.sea, a.mind, a.bot);
      [a.mind, helms[i], orders[i]] = [r.memory, r.helm, r.order];
      if (r.ask !== NOTHING) asks.set(v.id, r.ask);
    }
  });
  return { helms, orders };
}

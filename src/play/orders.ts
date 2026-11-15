// Each ship's orders for a step (state.ts advance's first part): the player's from her hands, a lashed ship's the helm
// she holds, a bot's from her mind (sim/bot.ts think), by what she sails by (Hand); and what each asks of her stores.

import { armed, type Crew, type Order } from '../sim/battle.ts';
import { think, type Sea, type Seen } from '../sim/bot.ts';
import type { Vessel } from '../sim/contact.ts';
import { PLAYER } from '../sim/match.ts';
import type { Helm } from '../sim/ship.ts';
import { NOTHING, type Ask } from '../sim/stores.ts';
import type { Aboard } from './aboard.ts';

/** What a bot sails by: her seed, for good. */
export interface Hand { seed: number }

/** The player's hands for the step: her helm, her gun's orders and what she asks of her stores. */
export interface Hers { helm: Helm; gun: Order; ask: Ask }

/** What the orders are made from: the fleet afloat, what is kept aboard each (her mind written back), the crews by id,
 *  what the bots know of the sea, and her hands. */
export interface Bridge { fleet: readonly Vessel[]; aboard: ReadonlyMap<number, Aboard>; crews: ReadonlyMap<number, Crew>; sea: Sea; hers: Hers }

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
    } else if (!a.mind || !a.hand) [helms[i], orders[i]] = [a.steady, { aim: null, fire: false }];
    else {
      others.length = 0;
      for (const o of seen) if (o.id !== v.id) others.push(o);
      const r = think(seen[i], others, b.sea, a.mind, a.hand.seed);
      [a.mind, helms[i], orders[i]] = [r.memory, r.helm, r.order];
      if (r.ask !== NOTHING) asks.set(v.id, r.ask);
    }
  });
  return { helms, orders };
}

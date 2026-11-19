// Each ship's orders for a step (state.ts advance's first part): the player's from her hands, a lashed ship's the helm
// she holds, a bot's from her mind (sim/bot.ts think), and what each asks of her stores. What the bots see of the
// fleet, and the lists the orders are handed back in, are kept and refilled each step, not made anew.

import { armed, type Crew, type Order } from '../sim/battle.ts';
import { think, type Memory, type Sea, type Seen } from '../sim/bot.ts';
import type { Chart } from '../sim/route.ts';
import type { Vessel } from '../sim/contact.ts';
import type { Holdings } from '../sim/claimer.ts';
import type { Flotsam } from '../sim/loot.ts';
import { PLAYER } from '../sim/match.ts';
import type { Helm } from '../sim/ship.ts';
import { NOTHING, type Ask } from '../sim/stores.ts';
import type { Storm } from '../sim/storm.ts';
import type { Vec3 } from '../world/sphere.ts';

/** What a ship's orders come from aboard her: her bot's mind (null: the player's hands, or her helm lashed), and the
 *  helm a lashed ship holds. A bot's mind is written back as she thinks. */
export interface Hand { mind: Memory | null; steady: Helm }

/** A lashed ship's gun: laid nowhere, never fired. */
const HOLD_FIRE: Order = { aim: null, fire: false };

/** The orders' maker on a planet of this depth, its open water charted for the bots' routes. */
export function createOrders(depth: (p: Vec3) => number, chart: Chart) {
  /** Each ship as the bots see her, by id; the fleet so seen, in its order; every ship but the one thinking. */
  const seenById = new Map<number, Seen>(), seen: Seen[] = [], others: Seen[] = [];
  const helms: Helm[] = [], orders: Order[] = [], asks = new Map<number, Ask>();
  /** The sea as the bots read it this step. */
  const sea: Sea = { depth, chart, storm: null, loot: [], holdings: null };
  const out = { helms, orders, asks };

  /** A ship as the bots see her: where she is and goes, her hit points, her gun, her crew. */
  const sight = (v: Vessel, c: Crew): Seen => {
    let s = seenById.get(v.id);
    if (!s) seenById.set(v.id, (s = { id: v.id, ship: v.ship }));
    s.ship = v.ship;
    s.shove = v.shove;
    s.hull = c.health.hull;
    s.shield = c.health.shield;
    s.armed = armed(c);
    s.crew = c;
    return s;
  };

  /**
   * The fleet's orders for a step, in its order, and what each asks of her stores: `helm`, `gun` and `ask` the
   * player's; `crews` and `aboard` each ship's by id; the storm, the loot and who holds the sea as the bots read them;
   * `seedOf` each bot's seed by id. The lists handed back are refilled by the next call.
   */
  return (
    fleet: readonly Vessel[], crews: ReadonlyMap<number, Crew>, aboard: ReadonlyMap<number, Hand>,
    helm: Helm, gun: Order, ask: Ask, storm: Storm, loot: Flotsam, holdings: Holdings | null, seedOf: (id: number) => number,
  ) => {
    seen.length = helms.length = orders.length = 0;
    asks.clear();
    for (const v of fleet) seen.push(sight(v, crews.get(v.id)!));
    sea.storm = storm;
    sea.loot = loot.pieces;
    sea.holdings = holdings;
    for (let i = 0; i < fleet.length; i++) {
      const id = fleet[i].id, a = aboard.get(id)!;
      if (id === PLAYER && !a.mind) {
        helms.push(helm);
        orders.push(gun);
        asks.set(id, ask);
      } else if (!a.mind) {
        helms.push(a.steady);
        orders.push(HOLD_FIRE);
      } else {
        // (a bot reads `others` only while she thinks)
        others.length = 0;
        for (const o of seen) if (o.id !== id) others.push(o);
        const r = think(seen[i], others, sea, a.mind, seedOf(id));
        a.mind = r.memory;
        helms.push(r.helm);
        orders.push(r.order);
        if (r.ask !== NOTHING) asks.set(id, r.ask);
      }
    }
    return out;
  };
}

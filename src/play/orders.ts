// Each ship's orders for a step (state.ts advance's first part): the player's
// from her hands, a lashed ship's the helm she holds, a bot's from her mind
// (sim/bot.ts think), and what each asks of her stores. What the bots see of
// the fleet, and the lists the orders are handed back in, are kept and refilled
// each step, not made anew.

import { armed, type Crew, type Order } from '../sim/battle.ts';
import type { Sight } from '../sim/sight.ts';
import { think, type Memory, type Sea, type Seen } from '../sim/bot.ts';
import type { Nature } from '../sim/persona.ts';
import { building, type Chart } from '../sim/route.ts';
import type { Vessel } from '../sim/contact.ts';
import type { Holdings } from '../sim/claimer.ts';
import type { Report } from '../sim/hunter.ts';
import type { Flotsam } from '../sim/loot.ts';
import { PLAYER } from '../sim/match.ts';
import type { Helm } from '../sim/ship.ts';
import { NOTHING, type Ask } from '../sim/stores.ts';
import type { Cap, Storm } from '../sim/storm.ts';
import { distance, R, type Vec3 } from '../world/sphere.ts';

/**
 * A stand-in's eye (state.ts debugOf standIn; tools/harness/player.ts): each
 * step, her gun's line of sight, given her own ship and the foe her bot
 * fights (null: none).
 */
export type Sighter = (own: Seen, foe: Seen | null) => Sight;

/**
 * What a ship's orders come from aboard her: her bot's mind (null: the player's
 * hands, or her helm lashed), her nature (her seed, brain and temperament:
 * sim/brain.ts), and the helm a lashed ship holds. A bot's mind is written back
 * as she thinks. A stand-in's `sights` lay her bot's gun in its stead, as a
 * player's hands would: the bot sails her and chooses when to fire, the
 * stand-in where, her balls going off within the gun's own spread.
 */
export interface Hand {
  mind: Memory | null;
  nature: Nature;
  steady: Helm;
  sights?: Sighter;
}

/**
 * The sea as it stands this step, as the bots read it: the storm, the loot, who
 * holds the water, and the guns ringing out.
 */
interface SeaNow {
  storm: Storm;
  loot: Flotsam;
  holdings: Holdings | null;
  gunfire: readonly Report[];
}

/** A lashed ship's gun: laid nowhere, never fired. */
const HOLD_FIRE: Order = { aim: null, fire: false };

/**
 * The calm's heart, the field leads into: within this share of its radius of
 * its centre (where the bots make for, sim/storming.ts STORMING.inward; the
 * way's cost short of it is how far in they reckon themselves).
 */
const HEART = 0.6;
/**
 * Cells of it looked at a step (some 0.8 ms; whole in some 25 steps, under a
 * second).
 */
const CALM_WORK = 8000;

/** Whether two caps are the same. */
const same = (a: Cap, b: Cap) =>
  a.radius === b.radius &&
  a.centre[0] === b.centre[0] &&
  a.centre[1] === b.centre[1] &&
  a.centre[2] === b.centre[2];

/**
 * The orders' maker on a planet of this depth, its open water charted for the
 * bots' routes.
 */
export function createOrders(depth: (p: Vec3) => number, chart: Chart) {
  /**
   * Each ship as the bots see her, by id; the fleet so seen, in its order;
   * every ship but the one thinking.
   */
  const seenById = new Map<number, Seen>(),
    seen: Seen[] = [],
    others: Seen[] = [];
  const helms: Helm[] = [],
    orders: Order[] = [],
    asks = new Map<number, Ask>();
  /** The sea as the bots read it this step. */
  const sea: Sea = {
    depth,
    chart,
    storm: null,
    loot: [],
    holdings: null,
    gunfire: [],
  };
  const out = { helms, orders, asks };
  /** The way into the next calm, while it is being found. */
  let coming: {
    cap: Cap;
    heart: number;
    found: ReturnType<typeof building>;
  } | null = null;

  /**
   * A ship as the bots see her: where she is and goes, her hit points, her gun,
   * her crew.
   */
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
   * The fleet's orders for a step, in its order, and what each asks of her
   * stores: `helm`, `gun` and `ask` the player's; `crews` and `aboard` each
   * ship's by id; the sea as it stands. The lists handed back are refilled by
   * the next call.
   */
  return (
    fleet: readonly Vessel[],
    crews: ReadonlyMap<number, Crew>,
    aboard: ReadonlyMap<number, Hand>,
    player: { helm: Helm; gun: Order; ask: Ask },
    now: SeaNow
  ) => {
    const { helm, gun, ask } = player;
    seen.length = helms.length = orders.length = 0;
    asks.clear();
    for (const v of fleet) seen.push(sight(v, crews.get(v.id)!));
    sea.storm = now.storm;
    // the way into the calm, found a share each step as the storm sets the
    // next (till then, the last)
    const next = now.storm.next;
    if (
      !(coming && same(coming.cap, next)) &&
      !(sea.calm && same(sea.calm.cap, next))
    ) {
      const heart = HEART * next.radius * R,
        centre = next.centre;
      coming = {
        cap: { centre, radius: next.radius },
        heart,
        found: building(chart, (p) => distance(p, centre) <= heart),
      };
    }
    if (coming?.found.build(CALM_WORK)) {
      sea.calm = {
        cap: coming.cap,
        field: coming.found.field,
        heart: coming.heart,
      };
      coming = null;
    }
    sea.loot = now.loot.pieces;
    sea.holdings = now.holdings;
    sea.gunfire = now.gunfire;
    for (let i = 0; i < fleet.length; i++) {
      const id = fleet[i].id,
        a = aboard.get(id)!;
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
        const r = think(seen[i], others, sea, a.mind, a.nature);
        a.mind = r.memory;
        helms.push(r.helm);
        if (a.sights) {
          const foe = others.find((o) => o.id === r.memory.foe) ?? null;
          orders.push({ aim: a.sights(seen[i], foe), fire: r.order.fire });
        } else orders.push(r.order);
        if (r.ask !== NOTHING) asks.set(id, r.ask);
      }
    }
    return out;
  };
}

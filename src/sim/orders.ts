import type { Crew, Order } from './battle.ts';
import type { Sight } from './sight.ts';
import {
  think,
  type Bot,
  type Memory,
  type Own,
  type Sea,
  type Seen,
} from './bot.ts';
import { building, type Chart } from './route.ts';
import type { Vessel } from './contact.ts';
import type { Holdings } from './claimer.ts';
import type { Report } from './hunter.ts';
import type { Flotsam } from './loot.ts';
import { PLAYER } from './match.ts';
import type { Helm } from './ship.ts';
import { NOTHING, type Ask } from './stores.ts';
import type { Cap, Storm } from './storm.ts';
import { distance, R, type Vec3 } from '../world/sphere.ts';

export type Sighter = (own: Seen, foe: Seen | null) => Sight;

export interface Hand {
  mind: Memory | null;
  bot: Bot | null;
  steady: Helm;
  sights?: Sighter;
  team?: number;
}

interface SeaNow {
  storm: Storm;
  loot: Flotsam;
  holdings: Holdings | null;
  gunfire: readonly Report[];
}

const HOLD_FIRE: Order = { aim: null, fire: false };

const HEART = 0.6;
const CALM_WORK = 8000;

const same = (a: Cap, b: Cap) =>
  a.radius === b.radius &&
  a.center[0] === b.center[0] &&
  a.center[1] === b.center[1] &&
  a.center[2] === b.center[2];

export function createOrders(depth: (p: Vec3) => number, chart: Chart) {
  const seenById = new Map<number, Own>(),
    seen: Own[] = [],
    others: Seen[] = [];
  const helms: Helm[] = [],
    orders: Order[] = [],
    asks = new Map<number, Ask>();
  const sea: Sea = {
    depth,
    chart,
    storm: null,
    loot: [],
    holdings: null,
    gunfire: [],
  };
  const out = { helms, orders, asks };
  let coming: {
    cap: Cap;
    heart: number;
    found: ReturnType<typeof building>;
  } | null = null;

  const sight = (v: Vessel, c: Crew, team: number | undefined): Own => {
    let s = seenById.get(v.id);
    if (!s)
      seenById.set(
        v.id,
        (s = {
          id: v.id,
          ship: v.ship,
          crew: c,
          hull: c.health.hull,
          shield: c.health.shield,
        })
      );
    s.ship = v.ship;
    s.shove = v.shove;
    s.hull = c.health.hull;
    s.shield = c.health.shield;
    s.crew = c;
    if (team !== s.team) s.team = team;
    return s;
  };

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
    for (const v of fleet)
      seen.push(sight(v, crews.get(v.id)!, aboard.get(v.id)?.team));
    sea.storm = now.storm;
    const next = now.storm.next;
    if (
      !(coming && same(coming.cap, next)) &&
      !(sea.calm && same(sea.calm.cap, next))
    ) {
      const heart = HEART * next.radius * R,
        center = next.center;
      coming = {
        cap: { center, radius: next.radius },
        heart,
        found: building(chart, (p) => distance(p, center) <= heart),
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
      } else if (!a.mind || !a.bot) {
        helms.push(a.steady);
        orders.push(HOLD_FIRE);
      } else {
        others.length = 0;
        for (const o of seen) if (o.id !== id) others.push(o);
        const r = think(seen[i], others, sea, a.mind, a.bot);
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

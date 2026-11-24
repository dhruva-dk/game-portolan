import { fitOf, type Crew, type Cue } from './battle.ts';
import type { Vessel } from './contact.ts';
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

export interface Ask {
  tap: number | null;
  arm: number | null;
  gust: boolean;
  take: number | null;
}

export interface Mended {
  ship: number;
  use: Use;
}

export const NOTHING: Ask = { tap: null, arm: null, gust: false, take: null };

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

export function crewed(h: Helm, c: Crew | undefined): Helm {
  if (!c) return h;
  const gust = c.gust.blowing > 0;
  const throttle =
    h.throttle * (c.hold.using ? USING : 1) * (c.cut > 0 ? RIGGING : 1);
  return gust || throttle !== h.throttle ? { ...h, throttle, gust } : h;
}

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

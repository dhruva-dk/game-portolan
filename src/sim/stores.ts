import type { Crew } from './battle.ts';
import { stepGust, toggled } from './gust.ts';
import { RIGGING } from './handling.ts';
import { sunk } from './health.ts';
import { begun, stepUse } from './hold.ts';
import type { Rarity } from './kinds.ts';
import {
  cargo,
  drifted,
  overboard,
  swept,
  type Flotsam,
  type Taken,
} from './loot.ts';
import type { Vessel } from './contact.ts';
import type { Helm } from './ship.ts';
import type { Depth } from './shoal.ts';
import { HEAL } from './tuning.ts';

export interface Ask {
  heal: number | null;
  gust: boolean;
}

export interface Mended {
  ship: number;
  heal: Rarity;
}

export const NOTHING: Ask = { heal: null, gust: false };

export function asked(
  crews: readonly Crew[],
  asks: ReadonlyMap<number, Ask>
): { crews: Crew[]; blew: number[] } {
  const blew: number[] = [];
  const after = crews.map((c) => {
    const ask = asks.get(c.id);
    if (!ask || sunk(c.health)) return c;
    let crew = c;
    if (ask.heal !== null)
      crew = {
        ...crew,
        hold: begun(crew.hold, ask.heal, crew.health, crew.values.healTime),
      };
    if (ask.gust) {
      const gust = toggled(crew.gust, crew.values.gustCapacity);
      if (gust.on && !crew.gust.on) blew.push(c.id);
      crew = { ...crew, gust };
    }
    return crew;
  });
  return { crews: after, blew };
}

export function crewed(h: Helm, c: Crew | undefined): Helm {
  if (!c) return h;
  const gust = c.gust.on;
  const throttle =
    h.throttle * (c.hold.using ? HEAL.using : 1) * (c.cut > 0 ? RIGGING : 1);
  return gust || throttle !== h.throttle ? { ...h, throttle, gust } : h;
}

export function stored(
  crews: readonly Crew[],
  flotsam: Flotsam,
  fleet: readonly Vessel[],
  sunkNow: readonly number[],
  dt: number,
  depth: Depth,
  seed: number
): { crews: Crew[]; flotsam: Flotsam; took: Taken[]; mended: Mended[] } {
  const f = drifted(flotsam, dt, depth);
  const mended: Mended[] = [];
  const stepped = crews.map((c): Crew => {
    if (sunk(c.health)) return c;
    const u = stepUse(c.hold, c.health, c.values, dt);
    if (u.done) mended.push({ ship: c.id, heal: u.done });
    return {
      ...c,
      hold: u.hold,
      health: u.health,
      gust: stepGust(c.gust, c.values.gustCapacity, dt),
      cut: c.cut - dt > 1e-9 ? c.cut - dt : 0,
    };
  });
  const s = swept(f, stepped, fleet);
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
    const heals = cargo(c);
    if (heals.length) f = overboard(f, v.ship.at, heals, seed);
  }
  const gone = new Set(sunkNow);
  const emptied = (c: Crew): Crew => ({
    ...c,
    hold: { ...c.hold, items: c.hold.items.map(() => null), using: null },
  });
  return {
    crews: crews.map((c) => (gone.has(c.id) ? emptied(c) : c)),
    flotsam: f,
  };
}

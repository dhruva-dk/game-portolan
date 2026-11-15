// The flights under way, as the gulls draw them (snapshot.ts FlightDraw): each ship's stop (upkeep.ts Upkept) and where
// her flight set out, the edge of her side's water nearest her when she called. The sim gains nothing: this only reads
// her stop and her water. Where it set out is found once, the first time the stop is drawn, and kept while it lasts.

import type { FlightDraw } from '../snapshot.ts';
import { ours, type Lying, type Waters } from '../sim/holding.ts';
import type { Vessel } from '../sim/contact.ts';
import { add, frameAt, scale, along, type Vec3 } from '../world/sphere.ts';
import type { Upkept } from './upkeep.ts';

/** Bearings searched for her water's edge, metres between looks along each, and the farthest looked. */
const BEARINGS = 16, STRIDE = 4, REACH = 360;

/** The edge of `v`'s side's water nearest her: the first water not her side's along any bearing (or as far as looked,
 *  her water all round), as a unit vector. */
export function edgeOf(waters: Waters, v: Lying): Vec3 {
  const { east, north } = frameAt(v.ship.at);
  let best = REACH, at: Vec3 = along(v.ship.at, east, REACH).p;
  for (let b = 0; b < BEARINGS; b++) {
    const a = (b / BEARINGS) * Math.PI * 2, t = add(scale(east, Math.cos(a)), north, Math.sin(a));
    for (let m = STRIDE; m < best; m += STRIDE) {
      const p = along(v.ship.at, t, m).p;
      if (ours(waters, p, v)) continue;
      best = m;
      at = p;
      break;
    }
  }
  return at;
}

export function createFlights() {
  const from = new Map<number, Vec3>();
  return {
    /** Every flight under way among `fleet`, its stop `stop(v)`; null outside a race. */
    drawn(fleet: readonly Vessel[], waters: Waters | null, stop: (v: Vessel) => Upkept | null): FlightDraw[] {
      const out: FlightDraw[] = [], live = new Set<number>();
      if (waters) for (const v of fleet) {
        const s = stop(v)?.stop;
        if (!s) continue;
        live.add(v.id);
        if (!from.has(v.id)) from.set(v.id, edgeOf(waters, v));
        out.push({ id: v.id, from: from.get(v.id)!, coming: s.coming, job: s.job, botched: s.botched });
      }
      for (const id of from.keys()) if (!live.has(id)) from.delete(id);
      return out;
    },
  };
}

import { EVENT, KNOW, afloat, fullHull, type MatchState, type Ship } from '../state.ts';
import { HOME } from '../tables.ts';
import type { Sight } from '../visibility.ts';
import type { Style } from './temperaments.ts';

type Captain = Ship['captain'];

export const WATCH = { rate: 0.5, raid: 5, wounded: 0.85, scrap: Math.PI * HOME.radius * HOME.radius } as const;

const know = (c: Captain, bit: number): void => {
  c.knows |= bit;
  c.learnt |= bit;
};

export function watch(state: MatchState, i: number, sight: Sight): void {
  const ship = state.ships[i], c = ship.captain, p = state.ships[0];
  if (!c.watches || !afloat(ship)) return;
  for (const e of state.events) {
    if (e.kind !== EVENT.loop || e.ship !== 0 || e.amount < WATCH.scrap) continue;
    const r = Math.sqrt(e.amount / Math.PI);
    c.loop = (c.knows & KNOW.loop) !== 0 ? c.loop + WATCH.rate * (r - c.loop) : r;
    c.seen++;
    know(c, KNOW.loop);
  }
  if ((sight.ships & 1) === 0) {
    c.eyed = 0;
    return;
  }
  for (const e of state.events) {
    if (e.kind === EVENT.breakOff && e.ship === 0) {
      c.breakOff = e.by;
      know(c, KNOW.breakOff);
    } else if (e.kind === EVENT.broken && e.by === 0) {
      c.raids = ((c.knows & KNOW.raids) !== 0 ? Math.max(0, c.raids) : 0) + WATCH.raid;
      know(c, KNOW.raids);
    }
  }
  if ((sight.hulls & 1) === 0 || !afloat(p)) return;
  const h = p.hull / fullHull(p.form, p.fittings), homing = p.homing ? 1 : 0;
  if (homing && !(c.eyed & 1) && h < WATCH.wounded) {
    const at = 100 * h;
    c.run = (c.knows & KNOW.run) !== 0 && c.run > 0 ? c.run + WATCH.rate * (at - c.run) : at;
    know(c, KNOW.run);
  }
  c.eyed = homing;
}

export function lure(c: Captain, style: Style): number {
  if (c.gentle) return -0.5;
  return 0.5 + 0.4 * style.fight + 0.4 * Math.min(1, style.raid) + 0.5 * style.stalk + 0.3 * Math.min(1, style.edge) - 0.8 * style.guard + 0.2 * c.grudge;
}

export const pressAt = (c: Captain): number => ((c.knows & KNOW.run) !== 0 && c.run > 0 ? Math.max(0.7, c.run / 100 + 0.1) : 0.7);

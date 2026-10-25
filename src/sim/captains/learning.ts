// Captains learn the player in play (PROMPT.md, Captains learn the player; WP12). Between matches the career moves
// what each captain knows of the player (career/learn.ts, carried in through its Mind); within a match a captain that
// watches the player (one the career sent with a Mind, past the first voyage) learns from what it sees it do there and
// then, and sails by it at once through the same skills (brain.ts): only what it could have seen — the player in its
// sight, from its deck or its gull, in the tick it did it:
//   it breaks off the Great Current into a region: that is where it breaks off (KNOW.breakOff), and a captain still
//     riding weighs that region by its temperament (lure: hunters, raiders and opportunists follow; turtles shun it);
//   it closes a loop: its loops are that size, the measure moving toward each one seen (KNOW.loop): a hunter patrols
//     beyond them (temperaments.ts reachOf);
//   it breaks a trail: it raids, and a captain guards its own trail the more (KNOW.raids, temperaments.ts wary);
//   it turns for home with its hull broken: it runs at that hull (KNOW.run), and the captains press it as it weakens
//     toward that hull (pressAt; brain.ts engages and stalks).
// What a captain has learned in play stands beside what it knew (Ship.captain.learnt), and a fresh sighting outweighs
// memory: the career's measures blend toward what it sees, a break-off region seen replaces the one remembered.
// A grudge (Mind.grudge: the player sank it) makes a captain stalk the player whenever it sees it (brain.ts stalks),
// follow it into the region it breaks off into, and close on it from farther.
import { EVENT, KNOW, afloat, fullHull, type MatchState, type Ship } from '../state.ts';
import type { Sight } from '../visibility.ts';
import type { Style } from './temperaments.ts';

type Captain = Ship['captain'];

/** In-play learning: how far a measure moves toward each sighting once known, the raid a sighting adds (tenths a match), the hull share below which a turn for home reads as running. */
export const WATCH = { rate: 0.5, raid: 5, wounded: 0.85 } as const;

const know = (c: Captain, bit: number): void => {
  c.knows |= bit;
  c.learnt |= bit;
};

/** Captain i watches the player through the tick just stepped: its events, and the player as its sight shows it. */
export function watch(state: MatchState, i: number, sight: Sight): void {
  const ship = state.ships[i], c = ship.captain, p = state.ships[0];
  if (!c.watches || !afloat(ship)) return;
  if ((sight.ships & 1) === 0) {
    c.eyed = 0;
    return;
  }
  for (const e of state.events) {
    if (e.kind === EVENT.breakOff && e.ship === 0) {
      c.breakOff = e.by;
      know(c, KNOW.breakOff);
    } else if (e.kind === EVENT.loop && e.ship === 0 && e.amount > 0) {
      const r = Math.sqrt(e.amount / Math.PI); // its loops' measure, as the career takes it (voyage.ts habitsOf)
      c.loop = (c.knows & KNOW.loop) !== 0 ? c.loop + WATCH.rate * (r - c.loop) : r;
      c.seen++;
      know(c, KNOW.loop);
    } else if (e.kind === EVENT.broken && e.by === 0) {
      c.raids = ((c.knows & KNOW.raids) !== 0 ? Math.max(0, c.raids) : 0) + WATCH.raid;
      know(c, KNOW.raids);
    }
  }
  if ((sight.hulls & 1) === 0 || !afloat(p)) return; // its wounds read only hull-up
  const h = p.hull / fullHull(p.form, p.fittings), homing = p.homing ? 1 : 0;
  if (homing && !(c.eyed & 1) && h < WATCH.wounded) {
    const at = 100 * h;
    c.run = (c.knows & KNOW.run) !== 0 && c.run > 0 ? c.run + WATCH.rate * (at - c.run) : at;
    know(c, KNOW.run);
  }
  c.eyed = homing;
}

/** What knowing the region the player breaks off into adds to that region's worth for captain c: its temperament's pull toward the player's waters, and its grudge. */
export function lure(c: Captain, style: Style): number {
  if (c.gentle) return -0.5;
  return 0.3 * style.fight + 0.25 * Math.min(1, style.raid) + 0.3 * style.stalk + 0.15 * Math.min(1, style.edge) - 0.3 * style.guard + 0.15 + 0.15 * c.grudge;
}

/** The hull share below which captain c reads the player as worth pressing: farther above 0.7 when it knows the player runs when wounded. */
export const pressAt = (c: Captain): number => ((c.knows & KNOW.run) !== 0 && c.run > 0 ? Math.max(0.7, c.run / 100 + 0.1) : 0.7);

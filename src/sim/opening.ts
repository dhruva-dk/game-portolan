// The opening (PROMPT.md, The Great Current). Every match opens with the ten ships riding the seed's Great Current
// abreast at speed (state.ts launches them in their lanes). Each breaks off when its input says so — the player's
// swipe up, a captain's choice (WP11, reading passage()) — and peels out into the region the current is passing, or
// is thrown off where the current ends. Where it has slowed, clear of the current, its home disc inks itself. From
// then on the current is water like any other: a fast highway everyone knows (environment.ts currentAt).
import { greatCurrentAt, type Sea } from './environment.ts';
import { FLAG, type ShipInput } from './input.ts';
import { cross, dot, dsin, normalize, set, v3, type V3 } from './math.ts';
import { BUMPED } from './sailing.ts';
import { EVENT, LANE, PHASE, TICK, chronicle, emit, onCurrent, type MatchState, type Ship } from './state.ts';
import { FORMS, OPENING } from './tables.ts';
import { inkHome } from './territory.ts';
import { regionOf } from './world/geography.ts';

const P = v3(), H = v3(), FLOW = v3(), STARBOARD = v3();
/** The sine of the least angle off the current's line a peeling hull is held at until it is clear. */
const PEEL = dsin(OPENING.peel);

/** How far down the Great Current it ends, u: its last centreline point (they lie every 2 u). */
const endOf = (sea: Sea): number => 2 * (sea.current.points.length / 3 - 1);

/**
 * One tick of ship i riding the Great Current: its lane carries it OPENING.ride u/s down the current, and then it
 * breaks off if its input says so, or is thrown off when the current has ended.
 */
export function ride(sea: Sea, state: MatchState, i: number, input: ShipInput): void {
  const ship = state.ships[i], end = endOf(sea);
  set(ship.was, ship.pos.x, ship.pos.y, ship.pos.z);
  set(ship.wasHead, ship.head.x, ship.head.y, ship.head.z);
  ship.ride = Math.min(end, ship.ride + OPENING.ride * TICK);
  onCurrent(sea.current, ship.ride, LANE[i], ship.pos, ship.head);
  ship.speed = OPENING.way; // a blow from a ship peeling across the fleet never knocks a rider out of its lane
  ship.rate = 0;
  set(ship.shove, 0, 0, 0);
  // Each tick's blows are its own (as sail() clears them): a rider never carries an old impact off the current, where
  // combat would read it as a ram on whatever ship it was once reported against.
  ship.bump = 0;
  ship.bumped = BUMPED.nothing;
  ship.bumpOn = 0;
  if (ship.ride === end) breakOff(state, i, 0, EVENT.thrown);
  else if ((input.flags & FLAG.breakOff) !== 0) breakOff(state, i, input.steer, EVENT.breakOff);
}

/**
 * Ship i leaves the current with the way it rode with, turning toward the helm, or else toward its own side of the
 * fleet (starboard from the centre): the turn its helm answers with dies away over the form's helm time constant, so
 * it comes about OPENING.peel off the current's line, a heavy hull more slowly. From the next tick it sails.
 */
function breakOff(state: MatchState, i: number, steer: number, kind: number): void {
  const ship = state.ships[i], side = steer !== 0 ? Math.sign(steer) : LANE[i] < 0 ? -1 : 1, region = regionOf(ship.pos);
  ship.rate = (side * OPENING.peel) / FORMS[ship.form].helm;
  ship.phase = PHASE.peeling;
  ship.peel = 0;
  emit(state, kind, i, region, ship.pos, ship.ride);
  chronicle(state, kind, i, region, ship.ride);
}

/**
 * One tick of ship i after it broke off. Until it is clear of the current it is held at least OPENING.peel off the
 * current's line where it is now (holdOff), so a current curving after it, a blow from a rider or the way dying away
 * never carry it on down the lane. Once it has slowed — OPENING.settle of its form's time constants of losing way —
 * and is clear of the current (or OPENING.most s have passed), its home disc inks itself round it (the timeline
 * remembers the region) and it is at sea.
 */
export function coast(sea: Sea, state: MatchState, i: number): void {
  const ship = state.ships[i], f = greatCurrentAt(sea, ship.pos, set(FLOW, 0, 0, 0)), on = f.x !== 0 || f.y !== 0 || f.z !== 0;
  ship.peel += TICK;
  if (on) holdOff(ship, normalize(f));
  if (ship.peel < OPENING.settle * FORMS[ship.form].drag || (on && ship.peel < OPENING.most)) return;
  const region = regionOf(ship.pos);
  set(ship.captain.anchor, ship.pos.x, ship.pos.y, ship.pos.z); // the heart of its waters, on every chart (Ship.captain.anchor)
  chronicle(state, EVENT.home, i, region, inkHome(state, i));
  ship.phase = PHASE.sailing;
}

/**
 * A peeling ship on the current, flowing `along`: unless its helm is turning it back, it turns toward the side of the
 * current's line its head lies on (or is turning to) at the rate that brings it OPENING.peel off that line over its
 * form's helm time constant, or faster if it is turning that way faster already.
 */
function holdOff(ship: Ship, along: V3): void {
  const b = dot(ship.head, normalize(cross(STARBOARD, along, ship.pos))), side = b !== 0 ? Math.sign(b) : Math.sign(ship.rate);
  if (side === 0 || side * ship.rate < 0 || side * b >= PEEL) return;
  ship.rate = side * Math.max(side * ship.rate, (PEEL - side * b) / FORMS[ship.form].helm);
}

/** Where the Great Current is taking a ship riding it: what a captain weighs to break off (WP11), and the interface shows. */
export interface Passage {
  /** The region it is passing now. */
  region: number;
  /** The next region it will pass, −1 when the current ends in this one. */
  next: number;
  /** Seconds until it is in the next region, or until the end when there is none. */
  untilNext: number;
  /** Seconds until the current throws it off at its end. */
  untilEnd: number;
}

/** The passage of a ship riding `s` u down the Great Current (its Ship.ride), into `out`. */
export function passage(sea: Sea, s: number, out: Passage): Passage {
  const p = sea.current.points, end = endOf(sea);
  onCurrent(sea.current, s, 0, P, H);
  out.region = regionOf(P);
  out.next = -1;
  out.untilEnd = out.untilNext = Math.max(0, end - s) / OPENING.ride;
  for (let k = Math.ceil(s / 2); 3 * k < p.length; k++) {
    const r = regionOf(set(P, p[3 * k], p[3 * k + 1], p[3 * k + 2]));
    if (r === out.region) continue;
    out.next = r;
    out.untilNext = (2 * k - s) / OPENING.ride;
    break;
  }
  return out;
}

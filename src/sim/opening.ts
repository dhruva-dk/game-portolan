import { greatCurrentAt, type Sea } from './environment.ts';
import { FLAG, type ShipInput } from './input.ts';
import { cross, dot, dsin, normalize, set, v3, type V3 } from './math.ts';
import { BUMPED } from './sailing.ts';
import { EVENT, LANE, PHASE, TICK, chronicle, emit, onCurrent, type MatchState, type Ship } from './state.ts';
import { FORMS, OPENING } from './tables.ts';
import { inkHome } from './territory.ts';
import { regionOf } from './world/geography.ts';

const P = v3(), H = v3(), FLOW = v3(), STARBOARD = v3();
const PEEL = dsin(OPENING.peel);

const endOf = (sea: Sea): number => 2 * (sea.current.points.length / 3 - 1);

export function ride(sea: Sea, state: MatchState, i: number, input: ShipInput): void {
  const ship = state.ships[i], end = endOf(sea);
  set(ship.was, ship.pos.x, ship.pos.y, ship.pos.z);
  set(ship.wasHead, ship.head.x, ship.head.y, ship.head.z);
  ship.ride = Math.min(end, ship.ride + OPENING.ride * TICK);
  onCurrent(sea.current, ship.ride, LANE[i], ship.pos, ship.head);
  ship.speed = OPENING.way;
  ship.rate = 0;
  set(ship.shove, 0, 0, 0);
  ship.bump = 0;
  ship.bumped = BUMPED.nothing;
  ship.bumpOn = 0;
  if (ship.ride === end) breakOff(state, i, 0, EVENT.thrown);
  else if ((input.flags & FLAG.breakOff) !== 0) breakOff(state, i, input.steer, EVENT.breakOff);
}

function breakOff(state: MatchState, i: number, steer: number, kind: number): void {
  const ship = state.ships[i], side = steer !== 0 ? Math.sign(steer) : LANE[i] < 0 ? -1 : 1, region = regionOf(ship.pos);
  ship.rate = (side * OPENING.peel) / FORMS[ship.form].helm;
  ship.phase = PHASE.peeling;
  ship.peel = 0;
  emit(state, kind, i, region, ship.pos, ship.ride);
  chronicle(state, kind, i, region, ship.ride);
}

export function coast(sea: Sea, state: MatchState, i: number): void {
  const ship = state.ships[i], f = greatCurrentAt(sea, ship.pos, set(FLOW, 0, 0, 0)), on = f.x !== 0 || f.y !== 0 || f.z !== 0;
  ship.peel += TICK;
  if (on) holdOff(ship, normalize(f));
  if (ship.peel < OPENING.settle * FORMS[ship.form].drag || (on && ship.peel < OPENING.most)) return;
  const region = regionOf(ship.pos);
  set(ship.captain.anchor, ship.pos.x, ship.pos.y, ship.pos.z);
  chronicle(state, EVENT.home, i, region, inkHome(state, i));
  ship.phase = PHASE.sailing;
}

function holdOff(ship: Ship, along: V3): void {
  const b = dot(ship.head, normalize(cross(STARBOARD, along, ship.pos))), side = b !== 0 ? Math.sign(b) : Math.sign(ship.rate);
  if (side === 0 || side * ship.rate < 0 || side * b >= PEEL) return;
  ship.rate = side * Math.max(side * ship.rate, (PEEL - side * b) / FORMS[ship.form].helm);
}

export interface Passage {
  region: number;
  next: number;
  untilNext: number;
  untilEnd: number;
}

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

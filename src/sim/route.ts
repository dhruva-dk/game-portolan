// The ship's pilot. While head home is held it sails the shortest safe route back to the ship's own waters; a drawn
// course is sailed until the stick is touched; otherwise the stick has the helm. The route home depends only on the
// match state, it is planned the same way for the player and the captains, and planHome can plan it for any ship,
// so rivals know it (PROMPT.md, Controls).
import { FLAG, STEER_MAX, type ShipInput } from './input.ts';
import { cross, datan2, dot, normalize, set, v3, type V3 } from './math.ts';
import { R, TERRITORY, cellDir, cellOf, tangentToward } from './sphere.ts';
import type { MatchState, Ship } from './state.ts';
import { FORMS, HELM, PILOT } from './tables.ts';
import { LOW_WATER, currentAt, seaLevel, timeOf, type Sea } from './environment.ts';
import { NAV, findRoute, navCellOf } from './world/nav.ts';

/** This tick's helm for ship i, −1 hard to port … 1 hard to starboard. Keeps the ship's course and route current. */
export function helmOf(sea: Sea, state: MatchState, i: number, input: ShipInput): number {
  const ship = state.ships[i];
  if (input.course !== null) ship.leg = 0;
  if (input.steer !== 0 && ship.course.length) {
    ship.course = [];
    ship.leg = 0;
  }
  const homing = (input.flags & FLAG.headHome) !== 0, pressed = homing && !ship.homing;
  ship.homing = homing;
  if (homing) {
    if (pressed || (ship.home.length && (state.tick + i) % PILOT.replan === 0)) {
      planHome(sea, state, i, ship.home);
      ship.homeLeg = 0;
    }
    if (!ship.home.length || state.owner[cellOf(TERRITORY, ship.pos)] === i + 1) return 0; // no way home, or home
    ship.homeLeg = follow(ship, ship.home, ship.homeLeg);
    return pilot(sea, ship);
  }
  if (ship.home.length) {
    ship.home = [];
    ship.homeLeg = 0;
  }
  if (ship.course.length) {
    ship.leg = follow(ship, ship.course, ship.leg);
    if (ship.leg < ship.course.length - 1 || distance(ship.pos, ship.course[ship.leg]) > PILOT.arrive) return pilot(sea, ship);
    ship.course = []; // the course is sailed: the helm is the stick's again
    ship.leg = 0;
  }
  const s = input.steer / STEER_MAX;
  return s * (HELM.soft + (1 - HELM.soft) * Math.abs(s));
}

const NAV_ROUTE: number[] = [];

/**
 * The shortest safe route from ship i to its own waters, written into `out` as territory cells (empty when it has
 * no waters it can reach). Shortest in time: it rides the currents that help and goes round those it cannot stem
 * (Sea.voyage). Safe: it keeps off the coasts as the navigation graph weighs them, and it uses only water open at
 * low tide, unless the ship lies where only the present tide floats it. Returns whether a route exists.
 */
export function planHome(sea: Sea, state: MatchState, i: number, out: number[]): boolean {
  const own = i + 1, owner = state.owner, from = navCellOf(state.ships[i].pos), nav = sea.voyage;
  out.length = 0;
  if (owner.indexOf(own) < 0) return false; // no waters at all: nothing to search for
  const tide = nav.level[from] < LOW_WATER ? LOW_WATER : seaLevel(timeOf(state));
  const cost = findRoute(nav, from, tide, (c) => owner[centreOf(c)] === own, null, NAV_ROUTE);
  if (cost < 0) return false;
  for (const c of NAV_ROUTE) out.push(centreOf(c));
  return true;
}

const F = TERRITORY.n / NAV.n;

/** The territory cell at the centre of a nav cell: both grids share the equal-angle faces, F territory cells a side. */
function centreOf(c: number): number {
  const n = NAV.n, i = c & (n - 1), j = (c >> NAV.log) & (n - 1), face = c >> (2 * NAV.log);
  return (face << (2 * TERRITORY.log)) + ((j * F + F / 2) << TERRITORY.log) + i * F + F / 2;
}

const AT = v3(), NEXT = v3(), AIM = v3(), TO = v3(), ACROSS = v3(), SIDE = v3(), FLOW = v3();

/** Distance in u from p to the centre of a territory cell. */
function distance(p: V3, cell: number): number {
  cellDir(TERRITORY, cell, AT);
  return R * Math.sqrt(Math.max(0, 2 - 2 * dot(p, AT)));
}

/**
 * The ship's place on a route: the nearest of the points ahead of the last place, so a ship set off its route by a
 * current or a blow picks it up again further on rather than turning back. Sets AIM PILOT.look along the route
 * beyond that place (or to its end).
 */
function follow(ship: Ship, cells: readonly number[], leg: number): number {
  const n = cells.length;
  let place = leg, near = Infinity;
  for (let k = leg; k <= Math.min(n - 1, leg + PILOT.window); k++) {
    const d = distance(ship.pos, cells[k]);
    if (d < near) {
      near = d;
      place = k;
    }
  }
  cellDir(TERRITORY, cells[place], AIM);
  for (let k = place, run = 0; k < n - 1 && run < PILOT.look; k++) {
    cellDir(TERRITORY, cells[k + 1], NEXT);
    run += R * Math.sqrt(Math.max(0, 2 - 2 * dot(AIM, NEXT)));
    set(AIM, NEXT.x, NEXT.y, NEXT.z);
  }
  return place;
}

/**
 * The helm that makes the ship's track good towards AIM: the bow is laid off against the current across the track,
 * up to PILOT.crab, or, in a stream too strong to stem, the ship crosses it square; the helm eases as the turn
 * already under way will carry it round.
 */
function pilot(sea: Sea, ship: Ship): number {
  if (dot(ship.pos, AIM) > 1 - 1e-12) return 0;
  tangentToward(ship.pos, AIM, TO);
  cross(ACROSS, TO, ship.pos); // to starboard of the track
  const way = Math.max(ship.speed, 0.5), x = Math.max(-PILOT.crab, Math.min(PILOT.crab, -dot(currentAt(sea, ship.pos, FLOW), ACROSS) / way));
  const a = Math.sqrt(1 - x * x), made = a * way + dot(FLOW, TO);
  if (made < PILOT.stem * way) { // a stream the ship cannot stem: cross it square, on the side of the aim
    cross(ACROSS, FLOW, ship.pos);
    const side = dot(ACROSS, TO) < 0 ? -1 : 1;
    normalize(set(TO, ACROSS.x * side, ACROSS.y * side, ACROSS.z * side));
  } else set(TO, TO.x * a + ACROSS.x * x, TO.y * a + ACROSS.y * x, TO.z * a + ACROSS.z * x); // the heading that holds the track
  cross(SIDE, ship.head, ship.pos); // to starboard of the bow
  const error = datan2(dot(TO, SIDE), dot(TO, ship.head)), lead = FORMS[ship.form].helm + PILOT.lead;
  return Math.max(-1, Math.min(1, (error - ship.rate * lead) / PILOT.full));
}

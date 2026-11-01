import { FLAG, STEER_MAX, type ShipInput } from './input.ts';
import { cross, datan2, dot, normalize, set, v3, type V3 } from './math.ts';
import { R, TERRITORY, cellDir, cellOf, neighbor, tangentToward } from './sphere.ts';
import type { MatchState, Ship } from './state.ts';
import { FORMS, HELM, PILOT } from './tables.ts';
import { LOW_WATER, currentAt, seaLevel, timeOf, type Sea } from './environment.ts';
import { NAV, findRoute, navCellOf } from './world/nav.ts';

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
    if (pressed || (state.tick + i) % PILOT.replan === 0) {
      if (planHome(sea, state, i, PLAN) || pressed || state.owner.indexOf(i + 1) < 0) {
        ship.home.length = 0;
        for (const c of PLAN) ship.home.push(c);
        ship.homeLeg = 0;
      }
    }
    if (!ship.home.length || state.owner[cellOf(TERRITORY, ship.pos)] === i + 1) return 0;
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
    ship.course = [];
    ship.leg = 0;
  }
  const s = input.steer / STEER_MAX;
  return s * (HELM.soft + (1 - HELM.soft) * Math.abs(s));
}

const NAV_ROUTE: number[] = [], PLAN: number[] = [], NEAR: number[] = [], DEPTH: number[] = [], AT_NAV = v3();

export function planHome(sea: Sea, state: MatchState, i: number, out: number[]): boolean {
  const own = i + 1, owner = state.owner, pos = state.ships[i].pos, nav = sea.voyage, now = seaLevel(timeOf(state));
  out.length = 0;
  if (owner.indexOf(own) < 0) return false;
  const from = openNear(nav.level, pos, now);
  if (from < 0) return false;
  const goal = (c: number) => owner[centreOf(c)] === own;
  let cost = nav.level[from] < LOW_WATER ? findRoute(nav, from, LOW_WATER, goal, null, NAV_ROUTE) : -1;
  if (cost < 0) cost = findRoute(nav, from, now, goal, null, NAV_ROUTE);
  if (cost < 0) return false;
  for (const c of NAV_ROUTE) out.push(centreOf(c));
  return true;
}

export function openNear(level: Float32Array, p: V3, tide: number): number {
  const from = navCellOf(p);
  if (level[from] < tide) return from;
  NEAR.length = DEPTH.length = 0;
  NEAR.push(from);
  DEPTH.push(0);
  let best = -1, near = -Infinity;
  for (let q = 0; q < NEAR.length; q++) {
    const c = NEAR[q];
    if (level[c] < tide) {
      const d = dot(cellDir(NAV, c, AT_NAV), p);
      if (d > near) {
        near = d;
        best = c;
      }
    }
    if (DEPTH[q] === PILOT.offing) continue;
    for (let s = 0; s < 4; s++) {
      const m = neighbor(NAV, c, s);
      if (NEAR.indexOf(m) < 0) {
        NEAR.push(m);
        DEPTH.push(DEPTH[q] + 1);
      }
    }
  }
  return best;
}

const F = TERRITORY.n / NAV.n;

function centreOf(c: number): number {
  const n = NAV.n, i = c & (n - 1), j = (c >> NAV.log) & (n - 1), face = c >> (2 * NAV.log);
  return (face << (2 * TERRITORY.log)) + ((j * F + F / 2) << TERRITORY.log) + i * F + F / 2;
}

const AT = v3(), NEXT = v3(), AIM = v3(), TO = v3(), ACROSS = v3(), SIDE = v3(), FLOW = v3();

function distance(p: V3, cell: number): number {
  cellDir(TERRITORY, cell, AT);
  return R * Math.sqrt(Math.max(0, 2 - 2 * dot(p, AT)));
}

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

function pilot(sea: Sea, ship: Ship): number {
  if (dot(ship.pos, AIM) > 1 - 1e-12) return 0;
  tangentToward(ship.pos, AIM, TO);
  cross(ACROSS, TO, ship.pos);
  const way = Math.max(ship.speed, 0.5), x = Math.max(-PILOT.crab, Math.min(PILOT.crab, -dot(currentAt(sea, ship.pos, FLOW), ACROSS) / way));
  const a = Math.sqrt(1 - x * x), made = a * way + dot(FLOW, TO);
  if (made < PILOT.stem * way) {
    cross(ACROSS, FLOW, ship.pos);
    const side = dot(ACROSS, TO) < 0 ? -1 : 1;
    normalize(set(TO, ACROSS.x * side, ACROSS.y * side, ACROSS.z * side));
  } else set(TO, TO.x * a + ACROSS.x * x, TO.y * a + ACROSS.y * x, TO.z * a + ACROSS.z * x);
  cross(SIDE, ship.head, ship.pos);
  const error = datan2(dot(TO, SIDE), dot(TO, ship.head)), lead = FORMS[ship.form].helm + PILOT.lead;
  return Math.max(-1, Math.min(1, (error - ship.rate * lead) / PILOT.full));
}

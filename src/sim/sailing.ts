import {
  aground, currentAt, newWind, offFloe, seaLevel, timeOf, vortexAt, windAt, type Sea, type Wind,
} from './environment.ts';
import type { ShipInput } from './input.ts';
import { addScaled, cross, dcos, dexp, dot, dsin, length, normalize, set, v3, type V3 } from './math.ts';
import { helmOf } from './route.ts';
import { R, TERRITORY, advance, cellOf, localFrame } from './sphere.ts';
import { PHASE, SHIPS, TICK, afloat, type MatchState, type Ship } from './state.ts';
import { inStorm } from './storm.ts';
import {
  BUMP, CONSUMABLES, COPPER, FITTING, FORMS, HELM, LAND, LATEEN_MIZZEN, POINT, SAILS, SLOT, SPARE_CANVAS, STORM, STORM_SAILS, TRIM, VORTEX,
} from './tables.ts';
import { holds } from './territory.ts';
import { ZONE, heightAt } from './world/geography.ts';
import { DRAFT, REGIONS } from './world/regions.ts';

export const BUMPED = { nothing: -1, land: SHIPS } as const;

const approach = (tau: number): number => 1 - dexp(-TICK / tau);
const K = FORMS.map((f) => ({ accel: approach(f.accel), drag: approach(f.drag), helm: approach(f.helm) }));
const K_SHOVE = approach(BUMP.shove), K_GRIP = approach(VORTEX.grip), K_CARRY = approach(VORTEX.carry);

export function pointOfSail(form: number, c: number): number {
  const f = FORMS[form];
  return 1 + POINT * (-f.close * c - f.reach * (2 * c * c - 1));
}

export interface Trim {
  speed: number;
  turn: number;
  stormSails: boolean;
  drive: number;
}

export const newTrim = (): Trim => ({ speed: 1, turn: 1, stormSails: false, drive: 0 });

export function trim(sea: Sea, state: MatchState, i: number, out: Trim): Trim {
  const ship = state.ships[i], cell = cellOf(TERRITORY, ship.pos), holder = state.owner[cell] - 1;
  const zone = sea.geo.zones[cell], waters = REGIONS[sea.geo.region[cell]].mechanics;
  const rig = ship.fittings[SLOT.rig], hull = ship.fittings[SLOT.hull];
  let speed = 1, turn = 1;
  if (holder === i) speed *= 1 + TRIM.home;
  else if (holder >= 0) speed *= 1 - TRIM.rival * (holds(sea, state, holder, 'rootGate') ? TRIM.rootGate : 1);
  if (holds(sea, state, i, 'whaleRoad')) speed *= 1 + TRIM.whaleRoad;
  if (rig.kind === FITTING.spareCanvas) speed *= 1 + SPARE_CANVAS[rig.tier];
  if (rig.kind === FITTING.lateenMizzen) turn *= 1 + LATEEN_MIZZEN[rig.tier];
  if (hull.kind === FITTING.copperSheathing) speed *= 1 + COPPER[hull.tier];
  if (ship.torn > 0) speed *= 1 - TRIM.torn;
  if (ship.boost > 0) speed *= 1 + CONSUMABLES.gust;
  if ((zone & ZONE.kelp) !== 0 && waters.kelp) speed *= waters.kelp.slow;
  if ((zone & ZONE.pack) !== 0 && waters.packSlow) speed *= waters.packSlow;
  if (rig.kind !== FITTING.stormSails && inStorm(state, ship.pos)) speed *= 1 - STORM.labour;
  out.speed = speed;
  out.turn = turn;
  out.stormSails = rig.kind === FITTING.stormSails;
  out.drive = out.stormSails ? STORM_SAILS[rig.tier] : 0;
  return out;
}

export function scald(sea: Sea, state: MatchState, i: number): number {
  const ship = state.ships[i], cell = cellOf(TERRITORY, ship.pos);
  if ((sea.geo.zones[cell] & ZONE.hot) === 0 || ship.fittings[SLOT.hull].kind === FITTING.copperSheathing) return 0;
  return REGIONS[sea.geo.region[cell]].mechanics.hotDamage ?? 0;
}

export function settledSpeed(form: number, sail: number, c: number, wind: Wind, t: Trim): number {
  const s = wind.strength, g = TRIM.gale;
  const airs = s < 1 ? TRIM.calm + (1 - TRIM.calm) * s : 1;
  const gale = (t.stormSails ? -t.drive : g.loss) * Math.max(0, Math.min(1, (s - g.from) / (g.to - g.from)));
  return FORMS[form].speed * SAILS[sail].speed * (1 + (pointOfSail(form, c) - 1) * wind.steady) * airs * (1 - gale)
    * (1 + TRIM.gust * wind.gust) * t.speed;
}

export const turningRadius = (form: number, sail: number, t: Trim): number => (FORMS[form].radius * SAILS[sail].radius) / t.turn;

const W = newWind(), T = newTrim(), V = v3(), P1 = v3(), H1 = v3(), PROBE = v3(), WAS = v3(), N = v3(), E = v3(), NN = v3();

export function sail(sea: Sea, state: MatchState, i: number, input: ShipInput): void {
  const ship = state.ships[i], form = FORMS[ship.form], k = K[ship.form];
  grip(sea, state, i);
  copy(ship.was, ship.pos);
  copy(ship.wasHead, ship.head);
  ship.bump = 0;
  ship.bumped = BUMPED.nothing;
  ship.bumpOn = 0;
  ship.torn = Math.max(0, ship.torn - TICK);

  const helm = helmOf(sea, state, i, input);
  trim(sea, state, i, T);
  windAt(sea, state, ship.pos, W);
  const ws = length(W.v), radius = turningRadius(ship.form, ship.sail, T);
  const way = Math.max(ship.speed, HELM.steerage * form.speed);
  ship.rate += ((helm * way) / radius - ship.rate) * k.helm;
  const carve = 1 - HELM.carve * Math.min(1, (Math.abs(ship.rate) * radius) / way);
  const grounded = aground(sea, state, ship.pos);
  const target = settledSpeed(ship.form, ship.sail, ws > 0 ? -dot(ship.head, W.v) / ws : 0, W, T) * carve
    * (grounded ? LAND.crawl : 1);
  ship.speed += (target - ship.speed) * (target > ship.speed ? k.accel : k.drag);

  move(sea, state, ship, grounded);
  const a = ship.rate * TICK, c = dcos(a), s = dsin(a);
  cross(E, ship.head, ship.pos);
  normalize(set(ship.head, ship.head.x * c + E.x * s, ship.head.y * c + E.y * s, ship.head.z * c + E.z * s));
  set(ship.shove, ship.shove.x * (1 - K_SHOVE), ship.shove.y * (1 - K_SHOVE), ship.shove.z * (1 - K_SHOVE));
}

const FLOW = v3();

function grip(sea: Sea, state: MatchState, i: number): void {
  const ship = state.ships[i], f = ship.fling;
  if (vortexAt(ship.pos, FLOW)) {
    set(f, f.x + (FLOW.x - f.x) * K_GRIP, f.y + (FLOW.y - f.y) * K_GRIP, f.z + (FLOW.z - f.z) * K_GRIP);
    return;
  }
  if (f.x === 0 && f.y === 0 && f.z === 0) return;
  const keep = vortexAt(ship.was, FLOW) && !holds(sea, state, i, 'eye') ? VORTEX.keep : 1, s = keep * (1 - K_CARRY);
  if (dot(f, f) * s * s < VORTEX.still * VORTEX.still) set(f, 0, 0, 0);
  else set(f, f.x * s, f.y * s, f.z * s);
}

export function velocityOf(sea: Sea, ship: Ship, out: V3): V3 {
  currentAt(sea, ship.pos, out);
  addScaled(out, out, ship.head, ship.speed);
  addScaled(out, out, ship.fling, 1);
  return addScaled(out, out, ship.shove, 1);
}

export function apparentWind(sea: Sea, state: MatchState, i: number, out: V3): number {
  const ship = state.ships[i];
  windAt(sea, state, ship.pos, W);
  velocityOf(sea, ship, V);
  return length(set(out, W.v.x - V.x, W.v.y - V.y, W.v.z - V.z));
}

function move(sea: Sea, state: MatchState, ship: Ship, grounded: boolean): void {
  velocityOf(sea, ship, V);
  const on = tryMove(sea, state, ship, grounded);
  if (on === null) return;
  shoreNormal(sea, state, PROBE, V, N);
  const into = -dot(V, N);
  if (into > 0) {
    report(ship, into, BUMPED.land, on);
    addScaled(V, V, N, into);
    ship.speed *= 1 - (1 - LAND.keep) * Math.max(0, -dot(ship.head, N));
    addScaled(ship.shove, ship.shove, N, Math.max(0, -dot(ship.shove, N)));
    addScaled(ship.fling, ship.fling, N, Math.max(0, -dot(ship.fling, N)));
  }
  tryMove(sea, state, ship, grounded);
}

const PROBES = [1, 0, -1];

function tryMove(sea: Sea, state: MatchState, ship: Ship, grounded: boolean): number | null {
  const v = length(V);
  if (v === 0) return null;
  set(H1, V.x / v, V.y / v, V.z / v);
  advance(ship.pos, H1, v * TICK, P1, H1);
  set(H1, ship.head.x, ship.head.y, ship.head.z);
  normalize(addScaled(H1, H1, P1, -dot(H1, P1)));
  if (!grounded) {
    const half = FORMS[ship.form].half / R;
    for (const on of PROBES) {
      if (aground(sea, state, normalize(addScaled(PROBE, P1, H1, on * half))) && !offShore(sea, state, ship, on * half)) return on;
    }
  }
  copy(ship.pos, P1);
  copy(ship.head, H1);
  addScaled(ship.shove, ship.shove, P1, -dot(ship.shove, P1));
  addScaled(ship.fling, ship.fling, P1, -dot(ship.fling, P1));
  return null;
}

function offShore(sea: Sea, state: MatchState, ship: Ship, at: number): boolean {
  const dry = seaLevel(timeOf(state)) - DRAFT, h = heightAt(sea.geo, PROBE);
  if (!(h >= dry)) return false;
  const was = heightAt(sea.geo, normalize(addScaled(WAS, ship.pos, ship.head, at)));
  return was >= dry && h < was;
}

function shoreNormal(sea: Sea, state: MatchState, p: V3, v: V3, out: V3): V3 {
  if (offFloe(sea, timeOf(state), p, out)) return out;
  const d = 0.6 / R;
  localFrame(p, E, NN);
  const gx = heightAt(sea.geo, normalize(addScaled(P1, p, E, d))) - heightAt(sea.geo, normalize(addScaled(P1, p, E, -d)));
  const gy = heightAt(sea.geo, normalize(addScaled(P1, p, NN, d))) - heightAt(sea.geo, normalize(addScaled(P1, p, NN, -d)));
  set(out, -gx * E.x - gy * NN.x, -gx * E.y - gy * NN.y, -gx * E.z - gy * NN.z);
  if (length(out) > 1e-9) return normalize(out);
  return normalize(set(out, -v.x, -v.y, -v.z));
}

function report(ship: Ship, speed: number, what: number, on: number): void {
  if (speed <= ship.bump) return;
  ship.bump = speed;
  ship.bumped = what;
  ship.bumpOn = on;
}

function copy(out: V3, a: V3): void {
  set(out, a.x, a.y, a.z);
}

const D = v3(), U = v3(), UB = v3(), SEP = v3(), DV = v3();

export function collide(state: MatchState): void {
  for (let i = 0; i < SHIPS; i++) {
    if (!afloat(state.ships[i])) continue;
    for (let j = i + 1; j < SHIPS; j++) if (afloat(state.ships[j]) && !makesWay(state.ships[i], state.ships[j])) contact(state, i, j);
  }
}

const makesWay = (a: Ship, b: Ship): boolean =>
  (a.phase === PHASE.riding && b.phase !== PHASE.sailing) || (b.phase === PHASE.riding && a.phase !== PHASE.sailing);

function contact(state: MatchState, i: number, j: number): void {
  const a = state.ships[i], b = state.ships[j], fa = FORMS[a.form], fb = FORMS[b.form];
  const touch = fa.beam + fb.beam, far = fa.half + fb.half + touch;
  if (R * R * (2 - 2 * dot(a.pos, b.pos)) >= far * far) return;
  set(D, (b.pos.x - a.pos.x) * R, (b.pos.y - a.pos.y) * R, (b.pos.z - a.pos.z) * R);
  set(U, a.head.x * fa.half, a.head.y * fa.half, a.head.z * fa.half);
  set(UB, b.head.x * fb.half, b.head.y * fb.half, b.head.z * fb.half);
  const uu = dot(U, U), uv = dot(U, UB), vv = dot(UB, UB), ud = -dot(U, D), vd = -dot(UB, D), den = uu * vv - uv * uv;
  let s = den > 1e-9 ? clamp1((uv * vd - vv * ud) / den) : 0, t = (vd + s * uv) / vv;
  if (t < -1 || t > 1) {
    t = clamp1(t);
    s = clamp1((t * uv - ud) / uu);
  }
  set(SEP, D.x + t * UB.x - s * U.x, D.y + t * UB.y - s * U.y, D.z + t * UB.z - s * U.z);
  addScaled(SEP, SEP, a.pos, -dot(SEP, a.pos));
  const gap = length(SEP);
  if (gap >= touch) return;
  if (gap > 1e-9) set(SEP, SEP.x / gap, SEP.y / gap, SEP.z / gap);
  else cross(SEP, a.head, a.pos);
  const ia = 1 / fa.mass, ib = 1 / fb.mass, share = ia / (ia + ib), pen = touch - gap;
  shift(a, SEP, -pen * share);
  shift(b, SEP, pen * (1 - share));
  set(DV, a.head.x * a.speed + a.shove.x + a.fling.x - b.head.x * b.speed - b.shove.x - b.fling.x,
    a.head.y * a.speed + a.shove.y + a.fling.y - b.head.y * b.speed - b.shove.y - b.fling.y,
    a.head.z * a.speed + a.shove.z + a.fling.z - b.head.z * b.speed - b.shove.z - b.fling.z);
  const closing = dot(DV, SEP);
  if (closing <= 0) return;
  const impulse = ((1 + BUMP.restitution) * closing) / (ia + ib);
  strike(a, SEP, -impulse * ia);
  strike(b, SEP, impulse * ib);
  report(a, closing, j, s);
  report(b, closing, i, t);
}

const clamp1 = (x: number): number => Math.max(-1, Math.min(1, x));

function shift(ship: Ship, n: V3, d: number): void {
  normalize(addScaled(ship.pos, ship.pos, n, d / R));
  normalize(addScaled(ship.head, ship.head, ship.pos, -dot(ship.head, ship.pos)));
}

function strike(ship: Ship, n: V3, dv: number): void {
  const along = dv * dot(n, ship.head);
  ship.speed += along;
  addScaled(ship.shove, ship.shove, n, dv);
  addScaled(ship.shove, ship.shove, ship.head, -along);
}

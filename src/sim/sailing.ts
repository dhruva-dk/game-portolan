// Being a ship under way. The helm answers with the momentum and turning circle of the ship's form; the sails'
// three settings trade speed against the turn; the point of sail, the waters, the landmarks held, the fittings,
// torn canvas, gusts, kelp and pack ice trim the speed; the current, the Maelstrom's grip and any shove carry the
// ship; land, floes and other ships stop it, and
// the closing speed of every blow is reported in the ship's bump fields for the damage of reefs, rocks and rams (WP8).
import {
  aground, currentAt, newWind, offFloe, timeOf, vortexAt, windAt, type Sea, type Wind,
} from './environment.ts';
import type { ShipInput } from './input.ts';
import { addScaled, cross, dcos, dexp, dot, dsin, length, normalize, set, v3, type V3 } from './math.ts';
import { helmOf } from './route.ts';
import { R, TERRITORY, advance, cellOf, localFrame } from './sphere.ts';
import { PHASE, SHIPS, TICK, afloat, type MatchState, type Ship } from './state.ts';
import { inStorm } from './storm.ts';
import {
  BUMP, COPPER, FITTING, FORMS, HELM, LAND, LATEEN_MIZZEN, POINT, SAILS, SLOT, SPARE_CANVAS, STORM, TRIM, VORTEX,
} from './tables.ts';
import { holds } from './territory.ts';
import { ZONE, heightAt } from './world/geography.ts';
import { REGIONS } from './world/regions.ts';

/** Ship.bumped when nothing was struck, and when it was land. */
export const BUMPED = { nothing: -1, land: SHIPS } as const;

/** Per-tick approach to a target with time constant tau: x += (target − x)·k. */
const approach = (tau: number): number => 1 - dexp(-TICK / tau);
const K = FORMS.map((f) => ({ accel: approach(f.accel), drag: approach(f.drag), helm: approach(f.helm) }));
const K_SHOVE = approach(BUMP.shove), K_GRIP = approach(VORTEX.grip), K_CARRY = approach(VORTEX.carry);

/** A form's point-of-sail speed factor; c is the cosine of the angle off the wind, 1 head to wind, −1 dead before it. */
export function pointOfSail(form: number, c: number): number {
  const f = FORMS[form];
  return 1 + POINT * (-f.close * c - f.reach * (2 * c * c - 1));
}

/** What the waters (whose, kelp, pack ice), the landmarks held, the fittings and torn canvas make of speed and turn. */
export interface Trim {
  speed: number;
  turn: number;
  /** Storm sails: no speed lost in high wind or in the storm. */
  stormSails: boolean;
}

export const newTrim = (): Trim => ({ speed: 1, turn: 1, stormSails: false });

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
  if ((zone & ZONE.kelp) !== 0 && waters.kelp) speed *= waters.kelp.slow;
  if ((zone & ZONE.pack) !== 0 && waters.packSlow) speed *= waters.packSlow;
  if (rig.kind !== FITTING.stormSails && inStorm(state, ship.pos)) speed *= 1 - STORM.labour; // sails labour in the storm
  out.speed = speed;
  out.turn = turn;
  out.stormSails = rig.kind === FITTING.stormSails;
  return out;
}

/**
 * The hull ship i loses each second to the Fire Archipelago's hot water where it lies (WP8 deals it): none outside the
 * hot zones, and none to a copper-sheathed hull.
 */
export function scald(sea: Sea, state: MatchState, i: number): number {
  const ship = state.ships[i], cell = cellOf(TERRITORY, ship.pos);
  if ((sea.geo.zones[cell] & ZONE.hot) === 0 || ship.fittings[SLOT.hull].kind === FITTING.copperSheathing) return 0;
  return REGIONS[sea.geo.region[cell]].mechanics.hotDamage ?? 0;
}

/**
 * The speed a ship settles to, u/s: its form and sails, its point of sail (c as for pointOfSail) as far as the wind
 * has a settled direction, light airs and gales by the wind's strength, a gust's surge, and its trim.
 */
export function settledSpeed(form: number, sail: number, c: number, wind: Wind, t: Trim): number {
  const s = wind.strength, g = TRIM.gale;
  const airs = s < 1 ? TRIM.calm + (1 - TRIM.calm) * s : 1;
  const gale = t.stormSails ? 0 : g.loss * Math.max(0, Math.min(1, (s - g.from) / (g.to - g.from)));
  return FORMS[form].speed * SAILS[sail].speed * (1 + (pointOfSail(form, c) - 1) * wind.steady) * airs * (1 - gale)
    * (1 + TRIM.gust * wind.gust) * t.speed;
}

/** The radius in u of a ship's circle with the helm hard over. */
export const turningRadius = (form: number, sail: number, t: Trim): number => (FORMS[form].radius * SAILS[sail].radius) / t.turn;

const W = newWind(), T = newTrim(), V = v3(), P1 = v3(), H1 = v3(), PROBE = v3(), N = v3(), E = v3(), NN = v3();

/** Ship i's tick: the helm, the way it gathers or loses, the turn, and the move over the sea. */
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
  const grounded = aground(sea, state, ship.pos); // the tide has left it on a bar: it crawls off
  const target = settledSpeed(ship.form, ship.sail, ws > 0 ? -dot(ship.head, W.v) / ws : 0, W, T) * carve
    * (grounded ? LAND.crawl : 1);
  ship.speed += (target - ship.speed) * (target > ship.speed ? k.accel : k.drag);

  move(sea, state, ship, grounded);
  const a = ship.rate * TICK, c = dcos(a), s = dsin(a);
  cross(E, ship.head, ship.pos); // starboard
  normalize(set(ship.head, ship.head.x * c + E.x * s, ship.head.y * c + E.y * s, ship.head.z * c + E.z * s));
  set(ship.shove, ship.shove.x * (1 - K_SHOVE), ship.shove.y * (1 - K_SHOVE), ship.shove.z * (1 - K_SHOVE));
}

const FLOW = v3();

/**
 * The Maelstrom's grip: inside the vortex its water takes the hull round with it (ship.fling closes on its flow);
 * leaving it, a ship keeps VORTEX.keep of that way, or all of it under its own colour (The Eye: launched at full
 * speed), and the way then dies off. Runs before `was` moves on, while it is still where the ship was a tick ago.
 */
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

/** The ship's velocity over the ground, u/s: its way along the heading, the current, the vortex's carry and any shove. */
export function velocityOf(sea: Sea, ship: Ship, out: V3): V3 {
  currentAt(sea, ship.pos, out);
  addScaled(out, out, ship.head, ship.speed);
  addScaled(out, out, ship.fling, 1);
  return addScaled(out, out, ship.shove, 1);
}

/** The wind ship i feels, u/s, into `out`: the true wind less its own velocity; what its sails and pennants show. */
export function apparentWind(sea: Sea, state: MatchState, i: number, out: V3): number {
  const ship = state.ships[i];
  windAt(sea, state, ship.pos, W);
  velocityOf(sea, ship, V);
  return length(set(out, W.v.x - V.x, W.v.y - V.y, W.v.z - V.z));
}

/** Moves the ship by its velocity for a tick. Run into land, it loses the way it had into the shore and slides along. */
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

/** Where the hull is sounded for ground: bow, middle, stern. */
const PROBES = [1, 0, -1];

/**
 * Moves the ship along V for a tick unless that puts its bow, middle or stern aground (ignored while it is already
 * aground). Returns null when it moved, else where on the hull it struck (1 bow … −1 stern), with PROBE there.
 */
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
      if (aground(sea, state, normalize(addScaled(PROBE, P1, H1, on * half)))) return on;
    }
  }
  copy(ship.pos, P1);
  copy(ship.head, H1);
  addScaled(ship.shove, ship.shove, P1, -dot(ship.shove, P1));
  addScaled(ship.fling, ship.fling, P1, -dot(ship.fling, P1));
  return null;
}

/**
 * The unit tangent at p pointing off what it struck: off the floe, or off the shore down the slope of the ground, or
 * straight back along v where the ground is flat.
 */
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

// ---------------------------------------------------------------------------------------------------------------
// Ship against ship: hulls are capsules along their headings. Overlaps are pushed apart by mass, and the closing
// speed along the contact is taken out with a little bounce, part off the way and part as a shove.

const D = v3(), U = v3(), UB = v3(), SEP = v3(), DV = v3();

/** Every pair of ships, in index order, after all have moved. */
export function collide(state: MatchState): void {
  for (let i = 0; i < SHIPS; i++) {
    if (!afloat(state.ships[i])) continue;
    for (let j = i + 1; j < SHIPS; j++) if (afloat(state.ships[j]) && !makesWay(state.ships[i], state.ships[j])) contact(state, i, j);
  }
}

/**
 * The fleet riding the Great Current makes way for a ship peeling off it: they never touch, so it slips out between
 * the riders' lanes from any place in the ranks instead of being boxed in by ships it cannot move (opening.ts).
 */
const makesWay = (a: Ship, b: Ship): boolean =>
  (a.phase === PHASE.riding && b.phase === PHASE.peeling) || (a.phase === PHASE.peeling && b.phase === PHASE.riding);

function contact(state: MatchState, i: number, j: number): void {
  const a = state.ships[i], b = state.ships[j], fa = FORMS[a.form], fb = FORMS[b.form];
  const touch = fa.beam + fb.beam, far = fa.half + fb.half + touch;
  if (R * R * (2 - 2 * dot(a.pos, b.pos)) >= far * far) return;
  // In u, from a's centre: a's keel s·U and b's D + t·UB, s and t in −1…1 (stern … bow).
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
  if (gap > 1e-9) set(SEP, SEP.x / gap, SEP.y / gap, SEP.z / gap); // the contact normal, a → b
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

/** Moves a ship `d` u along the tangent n, keeping its heading tangent. */
function shift(ship: Ship, n: V3, d: number): void {
  normalize(addScaled(ship.pos, ship.pos, n, d / R));
  normalize(addScaled(ship.head, ship.head, ship.pos, -dot(ship.head, ship.pos)));
}

/** A change of velocity dv along n: the part along the heading changes the way, the rest becomes a shove. */
function strike(ship: Ship, n: V3, dv: number): void {
  const along = dv * dot(n, ship.head);
  ship.speed += along;
  addScaled(ship.shove, ship.shove, n, dv);
  addScaled(ship.shove, ship.shove, ship.head, -along);
}

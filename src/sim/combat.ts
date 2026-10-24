// Combat (PROMPT.md, A match: Combat; Being a ship). Every hull loss goes through damage() with its CAUSE and the ship
// it came from: the guns, rams, fire, rocks and hot water here and the storm (storm.ts) all sink a ship through end.ts
// sink (bounty, "how it sank"), open fights on the timeline, and are remembered by the hurt ship (Ship.harm) for the
// captains. The step's combat runs once the hulls have moved and struck (sailing.ts collide) and every ship's sight is
// surveyed: this tick's blows, each hull's fire, hot water, embers and mending, the shots in flight, then the batteries
// that bear. Broadsides fire on their own at a rival in sight inside a battery's arc and range, so the captain's part
// is to bring the ship to bear: where it lies, at what angle and when. Ships riding the Great Current in the opening
// take no part. Fittings that need a target (WP9: the mortar, the gull's dive) aim through aim() and fire through launch().
import { sink } from './end.ts';
import { aground, type Sea } from './environment.ts';
import { addScaled, cross, dot, dsin, hash32, normalize, rngFloat, set, v3, type V3 } from './math.ts';
import { BUMPED, scald, velocityOf } from './sailing.ts';
import { R, TERRITORY, cellDir, cellOf } from './sphere.ts';
import { CAUSE, EVENT, PHASE, SHIPS, STREAM, TICK, afloat, chronicle, emit, fullHull, type MatchState, type Ship, type Shot } from './state.ts';
import {
  BATTERIES, BATTERY, BOWS, CASTLE, CHASERS, EFFECT, FIRE, FITTING, FORMS, GUNNERY, GUNS, PUMPS, RAM, ROCKS, SLOT, STEM_POST, type Gun,
} from './tables.ts';
import { breakTrail, reloadSpeed, repairRate, sheltered } from './territory.ts';
import type { Sight } from './visibility.ts';
import { ZONE } from './world/geography.ts';

const A = v3(), B = v3(), D = v3(), P = v3(), Q = v3(), U = v3(), W = v3(), X = v3(), STAR = v3();

/** The ship sails (or is breaking off the current): it fights, and can be fought. */
export const fights = (ship: Ship): boolean => ship.phase === PHASE.sailing || ship.phase === PHASE.peeling;

/** The distance in u between two points close together on the sphere (the chord). */
const apart = (a: V3, b: V3): number => R * Math.sqrt(Math.max(0, 2 - 2 * dot(a, b)));

/** Ship i loses `amount` hull points to `by` (−1 none), of a CAUSE; with none left it sinks (end.ts sink). A ward takes it all. */
export function damage(state: MatchState, i: number, amount: number, by: number, cause: number): void {
  const ship = state.ships[i];
  if (!afloat(ship) || ship.ward > 0 || amount <= 0) return;
  ship.hull = Math.max(0, ship.hull - amount);
  if (by >= 0 && by !== i) {
    if (ship.harm[by] === 0) chronicle(state, EVENT.engage, i, by, cause);
    ship.harm[by] += amount;
  }
  if (ship.hull === 0) sink(state, i, by, cause);
}

/** Sets ship i's hull afire for `seconds` (embers, EFFECT.burn) by ship `by` (−1 none), unless it already burns longer. */
export function ignite(state: MatchState, i: number, seconds: number, by: number): void {
  const ship = state.ships[i];
  if (!afloat(ship) || seconds <= ship.fire) return;
  if (ship.fire === 0) emit(state, EVENT.ablaze, i, by, ship.pos, seconds);
  ship.fire = seconds;
  ship.fireBy = by;
}

/** The ships that may be fired on now, as a bitmask by index: those that fight, but none inside the Great Lagoon while holding it. */
export function targets(sea: Sea, state: MatchState): number {
  let open = 0;
  for (let j = 0; j < SHIPS; j++) if (fights(state.ships[j]) && !sheltered(sea, state, j)) open |= 1 << j;
  return open;
}

/** The step's combat, after collide and the survey of every ship's sight (`sights`, visibility.ts survey). */
export function combat(sea: Sea, state: MatchState, sights: readonly Sight[]): void {
  blows(state);
  for (let i = 0; i < SHIPS; i++) endure(sea, state, i);
  const open = targets(sea, state);
  fly(sea, state, open);
  for (let i = 0; i < SHIPS; i++) batteries(sea, state, sights[i].ships & open, i);
}

// ---------------------------------------------------------------------------------------------------------------
// Blows (sailing.ts collide reports each hull's hardest impact of the tick), fire, hot water, embers and mending.

/** Rocks struck at speed, and rams: a hull striking a rival with its bow. */
function blows(state: MatchState): void {
  for (let i = 0; i < SHIPS; i++) {
    const ship = state.ships[i], j = ship.bumped;
    if (!fights(ship)) continue;
    if (j === BUMPED.land) {
      if (ship.bump <= ROCKS.speed) continue;
      const hurt = ROCKS.damage * (ship.bump - ROCKS.speed);
      emit(state, EVENT.struck, i, -1, ship.pos, hurt);
      damage(state, i, hurt, -1, CAUSE.rocks);
    } else if (j >= 0 && ship.bumpOn >= RAM.bow && ship.bump > RAM.speed && fights(state.ships[j])) ram(state, i, j);
  }
}

/**
 * Ship i rams ship j: harder the faster they close, the heavier the rammer and the stronger its bow; it takes a little
 * itself. A cutwater also cuts j's open trail, and j lays none for a while (Ship.cut), unless a ward holds it.
 */
function ram(state: MatchState, i: number, j: number): void {
  const a = state.ships[i], b = state.ships[j], fit = a.fittings[SLOT.bow], bow = BOWS[fit.kind] ?? STEM_POST;
  const m = FORMS[a.form].mass, hurt = RAM.damage * (a.bump - RAM.speed) * bow.power[fit.tier] * ((2 * m) / (m + FORMS[b.form].mass));
  emit(state, EVENT.ram, j, i, normalize(addScaled(P, a.pos, b.pos, 1)), hurt);
  damage(state, j, hurt, i, CAUSE.ram);
  damage(state, i, hurt * RAM.recoil * bow.recoil, j, CAUSE.ram);
  if (bow.cut[fit.tier] > 0 && afloat(b) && b.ward === 0) {
    breakTrail(state, j, i, cellOf(TERRITORY, b.pos));
    b.cut = Math.max(b.cut, bow.cut[fit.tier]);
  }
}

/** Ship i's tick of fire, hot water and embers, then mending where it lies (territory.ts repairRate) and by its pumps anywhere, and reloading. */
function endure(sea: Sea, state: MatchState, i: number): void {
  const ship = state.ships[i];
  if (!fights(ship)) return;
  if (ship.fire > 0) {
    damage(state, i, FIRE.rate * Math.min(TICK, ship.fire), ship.fireBy, CAUSE.fire);
    ship.fire = Math.max(0, ship.fire - TICK);
    if (ship.fire === 0) ship.fireBy = -1;
  }
  damage(state, i, scald(sea, state, i) * TICK, -1, CAUSE.hotWater);
  if ((sea.geo.zones[cellOf(TERRITORY, ship.pos)] & ZONE.hot) !== 0 && rngFloat(state.rng[STREAM.world]) < FIRE.embers * TICK) {
    ignite(state, i, FIRE.ember, -1);
  }
  if (!afloat(ship)) return;
  const h = ship.fittings[SLOT.hull], pumps = h.kind === FITTING.pumps ? PUMPS[h.tier] : 0;
  ship.hull = Math.min(fullHull(ship.form, ship.fittings), ship.hull + (repairRate(sea, state, i) + pumps) * TICK);
  const reload = TICK * reloadSpeed(sea, state, i);
  for (let k = 0; k < BATTERIES; k++) ship.reload[k] = Math.max(0, ship.reload[k] - reload);
}

// ---------------------------------------------------------------------------------------------------------------
// Shot: launched, flown over the curve, and struck against the moving hulls or fallen.

/**
 * Fires a shot from ship i's `kind` of FITTING, a `gun` of `tier`, from `from` to fall at `to`: in flight for the
 * distance over the gun's speed, striking for its damage less its falloff over that distance. WP9's guns, stern
 * chasers and mortar fire through it.
 */
export function launch(state: MatchState, i: number, kind: number, from: V3, to: V3, gun: Gun, tier: number): void {
  const d = apart(from, to);
  state.shots.push({
    ship: i, kind, from: { x: from.x, y: from.y, z: from.z }, to: { x: to.x, y: to.y, z: to.z }, age: 0,
    time: Math.max(TICK, d / gun.speed), top: gun.loft * d, power: gun.damage[tier] * (1 - gun.falloff * Math.min(1, d / gun.range)),
    effect: gun.effect, lasting: gun.lasting[tier], blast: gun.blast,
  });
}

/** Where a shot is over the sea `age` s into its flight, into `out` (the renderer passes an age between ticks). */
export function shotAt(shot: Shot, age: number, out: V3): V3 {
  const t = Math.max(0, Math.min(1, age / shot.time));
  set(out, shot.from.x + t * (shot.to.x - shot.from.x), shot.from.y + t * (shot.to.y - shot.from.y), shot.from.z + t * (shot.to.z - shot.from.z));
  return normalize(out);
}

/** How high a shot flies above the sea `age` s into its flight, u: its ballistic arc, for drawing. */
export function shotHeight(shot: Shot, age: number): number {
  const t = Math.max(0, Math.min(1, age / shot.time));
  return 4 * shot.top * t * (1 - t);
}

/** Every shot in flight flies its tick, in the order fired; those that strike or fall are gone. `open`: targets(). */
function fly(sea: Sea, state: MatchState, open: number): void {
  const shots = state.shots;
  let kept = 0;
  for (let s = 0; s < shots.length; s++) if (flies(sea, state, shots[s], open)) shots[kept++] = shots[s];
  shots.length = kept;
}

/** One shot's tick: false once it has struck a hull or fallen. Shot fired flat strikes the first hull in its path, or land. */
function flies(sea: Sea, state: MatchState, shot: Shot, open: number): boolean {
  shotAt(shot, shot.age, A);
  shot.age = Math.min(shot.time, shot.age + TICK);
  const landed = shot.age >= shot.time;
  if (shot.blast > 0) {
    if (landed) {
      const struck = burst(state, shot.ship, shot.to, shot.blast, shot.power, shot.effect, shot.lasting, open);
      emit(state, EVENT.shell, shot.ship, -1, shot.to, struck);
      if (struck === 0) emit(state, EVENT.splash, shot.ship, -1, shot.to, 0);
    }
    return !landed;
  }
  shotAt(shot, shot.age, B);
  let hit = -1, first = 2;
  for (let j = 0; j < SHIPS; j++) {
    if (j === shot.ship || (open & (1 << j)) === 0 || !afloat(state.ships[j])) continue;
    const u = pass(A, B, state.ships[j], GUNNERY.ball);
    if (u < first) {
      first = u;
      hit = j;
    }
  }
  if (hit >= 0) {
    set(D, B.x - A.x, B.y - A.y, B.z - A.z);
    const c = dot(D, state.ships[hit].head) / Math.sqrt(dot(D, D));
    strike(state, shot.ship, hit, normalize(addScaled(P, A, D, first)), shot.power * (1 + GUNNERY.rake * c * c), shot.effect, shot.lasting);
    return false;
  }
  const ashore = aground(sea, state, B);
  if (ashore || landed) emit(state, EVENT.splash, shot.ship, -1, B, ashore ? 1 : 0);
  return !(ashore || landed);
}

/**
 * A shell or a powder keg (items.ts) of ship `by` bursts at `at`, striking every hull open to fire (`open`, targets())
 * within `radius` u of it but `by`'s own, for `hurt` with an EFFECT lasting `lasting` s. Returns how many it struck.
 */
export function burst(state: MatchState, by: number, at: V3, radius: number, hurt: number, effect: number, lasting: number, open: number): number {
  let struck = 0;
  for (let j = 0; j < SHIPS; j++) {
    if (j === by || (open & (1 << j)) === 0 || !afloat(state.ships[j]) || !touches(state.ships[j], at, radius)) continue;
    strike(state, by, j, at, hurt, effect, lasting);
    struck++;
  }
  return struck;
}

/** Ship `by`'s shot strikes ship j at `at` for `hurt` hull, with an EFFECT lasting `lasting` s. */
function strike(state: MatchState, by: number, j: number, at: V3, hurt: number, effect: number, lasting: number): void {
  emit(state, EVENT.hit, j, by, at, hurt);
  damage(state, j, hurt, by, CAUSE.gun);
  if (effect === EFFECT.tear) state.ships[j].torn = Math.max(state.ships[j].torn, lasting);
  else if (effect === EFFECT.burn) ignite(state, j, lasting, by);
}

/** Whether `at` lies within `radius` u of the ship's hull. */
export const touches = (ship: Ship, at: V3, radius: number): boolean => pass(at, at, ship, radius) <= 1;

/**
 * Where the path a → b first comes within `radius` u of ship's hull (its keel, a segment along the heading, widened by
 * its beam): the share of the way, at the closest approach, or 2 when it passes clear.
 */
function pass(a: V3, b: V3, ship: Ship, radius: number): number {
  const f = FORMS[ship.form], reach = f.beam + radius, step = apart(a, b), far = f.half + reach + step;
  if (R * R * (2 - 2 * dot(a, ship.pos)) >= far * far) return 2;
  // In u from the keel's stern end: the path r + s·d (s in 0…1), the keel t·e (t in 0…1).
  set(X, (a.x - ship.pos.x) * R + ship.head.x * f.half, (a.y - ship.pos.y) * R + ship.head.y * f.half, (a.z - ship.pos.z) * R + ship.head.z * f.half);
  set(D, (b.x - a.x) * R, (b.y - a.y) * R, (b.z - a.z) * R);
  set(U, ship.head.x * 2 * f.half, ship.head.y * 2 * f.half, ship.head.z * 2 * f.half);
  const dd = dot(D, D), ee = dot(U, U), de = dot(D, U), dr = dot(D, X), er = dot(U, X), den = dd * ee - de * de;
  let s = den > 1e-12 ? clamp01((de * er - dr * ee) / den) : 0, t = (de * s + er) / ee;
  if (t < 0 || t > 1) {
    t = clamp01(t);
    s = dd > 1e-12 ? clamp01((de * t - dr) / dd) : 0;
  }
  set(W, X.x + s * D.x - t * U.x, X.y + s * D.y - t * U.y, X.z + s * D.z - t * U.z);
  return dot(W, W) < reach * reach ? s : 2;
}

const clamp01 = (x: number): number => Math.max(0, Math.min(1, x));

// ---------------------------------------------------------------------------------------------------------------
// Batteries: each fires on its own once reloaded, at the nearest rival in sight it bears on.

/**
 * Ship i's batteries that have reloaded and bear on a rival among `seen` (in sight, and open to fire) fire: the
 * broadsides and the castle with its broadside fitting's guns, the stern with its stern chasers.
 */
function batteries(sea: Sea, state: MatchState, seen: number, i: number): void {
  const ship = state.ships[i], form = FORMS[ship.form];
  if (seen === 0 || !fights(ship)) return;
  cross(STAR, ship.head, ship.pos);
  for (let k = 0; k < BATTERIES; k++) {
    const fit = ship.fittings[k === BATTERY.stern ? SLOT.stern : SLOT.broadside], gun = GUNS[fit.kind];
    if (gun === undefined || ship.reload[k] > 0 || (k === BATTERY.castle && !form.castle)) continue;
    const j = bearing(sea, state, seen, i, k, gun, Q);
    if (j < 0) continue;
    broadside(state, i, k, gun, fit, Q);
    ship.reload[k] = gun.reload;
    emit(state, EVENT.broadside, i, j, ship.pos, k);
  }
}

/** The nearest rival among `seen` that battery k of ship i bears on, its guns laid where it will be into `out`; −1 for none. */
function bearing(sea: Sea, state: MatchState, seen: number, i: number, k: number, gun: Gun, out: V3): number {
  const ship = state.ships[i], within = dsin(k === BATTERY.castle ? CASTLE.arc : gun.arc);
  let best = -1, near = gun.range;
  for (let j = 0; j < SHIPS; j++) {
    if ((seen & (1 << j)) === 0 || j === i) continue;
    lead(sea, state, i, j, gun.speed, P);
    const d = apart(ship.pos, P);
    if (d > near) continue;
    set(D, P.x - ship.pos.x, P.y - ship.pos.y, P.z - ship.pos.z);
    const ahead = dot(D, ship.head), abeam = dot(D, STAR), off = within * Math.sqrt(dot(D, D));
    const bears = k >= BATTERY.castle ? ahead < 0 && Math.abs(abeam) <= off : (k === BATTERY.starboard ? abeam > 0 : abeam < 0) && Math.abs(ahead) <= off;
    if (!bears) continue;
    best = j;
    near = d;
    set(out, P.x, P.y, P.z);
  }
  return best;
}

/**
 * Where ship i's gunners lay on ship j for shot flying `speed` u/s (Infinity: at once), into `out`: ahead of where it
 * is by its way over the flight, as far as their gunnery leads.
 */
function lead(sea: Sea, state: MatchState, i: number, j: number, speed: number, out: V3): V3 {
  const from = state.ships[i].pos, to = state.ships[j], g = state.ships[i].gunnery;
  velocityOf(sea, to, W);
  set(out, to.pos.x, to.pos.y, to.pos.z);
  for (let n = 0; n < GUNNERY.passes; n++) normalize(addScaled(out, to.pos, W, (g * apart(from, out)) / speed / R));
  return out;
}

/**
 * Battery k of ship i fires, laid on `at`: its guns spread along the deck (the castle's and the chasers' across the stern) fire
 * parallel, each ball falling wide of where it was laid by the gun's spread and the gunners' wildness.
 */
function broadside(state: MatchState, i: number, k: number, gun: Gun, fit: { kind: number; tier: number }, at: V3): void {
  const ship = state.ships[i], form = FORMS[ship.form], astern = k >= BATTERY.castle;
  const guns = k === BATTERY.castle ? CASTLE.guns : k === BATTERY.stern ? CHASERS.guns : form.guns, axis = astern ? STAR : ship.head;
  const span = (astern ? form.beam : form.half) * GUNNERY.deck, scatter = gun.spread + GUNNERY.wild * (1 - ship.gunnery);
  const roll = hash32(hash32(state.seed, state.tick), i * BATTERIES + k);
  for (let n = 0; n < guns; n++) {
    const off = guns > 1 ? (span * ((2 * n) / (guns - 1) - 1)) / R : 0;
    normalize(addScaled(A, ship.pos, axis, off));
    if (astern) normalize(addScaled(A, A, ship.head, -form.half / R));
    normalize(addScaled(B, at, axis, off));
    set(D, B.x - A.x, B.y - A.y, B.z - A.z);
    cross(X, D, B);
    const h = hash32(roll, n), across = ((h & 0xffff) / 0xffff) * 2 - 1, along = ((h >>> 16) / 0xffff) * 2 - 1;
    const wide = (scatter * Math.sqrt(dot(D, D))) / Math.sqrt(dot(X, X));
    normalize(addScaled(B, addScaled(B, B, D, along * scatter), X, across * wide));
    launch(state, i, fit.kind, A, B, gun, fit.tier);
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Aimed fittings (ShipInput: FLAG.useAimed or FLAG.dive with `aim`).

/**
 * Where ship i aims a fitting that needs a target (WP9: the mortar, the gull's dive), reaching `reach` u, its shot
 * flying `speed` u/s (Infinity: at once), from ShipInput.aim `cell`: a tap (−1) aims itself at the nearest rival in
 * sight (`seen`, Sight.ships) that may be fired on, led as its gunners lead; a drag aims by hand at that territory
 * cell, drawn in to the reach. The point goes into `out`. Returns the rival aimed at, SHIPS for a point aimed by hand,
 * or −1 with nothing to aim at (out untouched).
 */
export function aim(sea: Sea, state: MatchState, i: number, seen: number, cell: number, reach: number, speed: number, out: V3): number {
  const from = state.ships[i].pos;
  if (cell >= 0) {
    cellDir(TERRITORY, cell, out);
    const d = apart(from, out);
    if (d > reach) normalize(addScaled(out, from, set(D, out.x - from.x, out.y - from.y, out.z - from.z), reach / d));
    return SHIPS;
  }
  const open = seen & targets(sea, state);
  let best = -1, near = reach;
  for (let j = 0; j < SHIPS; j++) {
    if (j === i || (open & (1 << j)) === 0) continue;
    const d = apart(from, state.ships[j].pos);
    if (d < near) {
      near = d;
      best = j;
    }
  }
  if (best >= 0) lead(sea, state, i, best, speed, out);
  return best;
}

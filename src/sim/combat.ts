import { sink } from './end.ts';
import { aground, type Sea } from './environment.ts';
import { addScaled, cross, dot, dsin, hash32, normalize, rngFloat, set, v3, type V3 } from './math.ts';
import { BUMPED, scald, velocityOf } from './sailing.ts';
import { R, TERRITORY, cellDir, cellOf } from './sphere.ts';
import { CAUSE, EVENT, PHASE, SHIPS, STREAM, TICK, afloat, chronicle, emit, fullHull, type MatchState, type Ship, type Shot } from './state.ts';
import {
  BATTERIES, BATTERY, BOWS, AFT, CASTLE, CHASERS, EFFECT, FIRE, FITTING, FORMS, GUNNERY, GUNS, PUMPS, RAM, ROCKS, SLOT, STEM_POST, type Gun,
} from './tables.ts';
import { breakTrail, reloadSpeed, repairRate, sheltered } from './territory.ts';
import type { Sight } from './visibility.ts';
import { ZONE } from './world/geography.ts';

const A = v3(), B = v3(), D = v3(), P = v3(), Q = v3(), U = v3(), W = v3(), X = v3(), STAR = v3();

export const fights = (ship: Ship): boolean => ship.phase === PHASE.sailing || ship.phase === PHASE.peeling;

const apart = (a: V3, b: V3): number => R * Math.sqrt(Math.max(0, 2 - 2 * dot(a, b)));

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

export function ignite(state: MatchState, i: number, seconds: number, by: number): void {
  const ship = state.ships[i];
  if (!afloat(ship) || seconds <= ship.fire) return;
  if (ship.fire === 0) emit(state, EVENT.ablaze, i, by, ship.pos, seconds);
  ship.fire = seconds;
  ship.fireBy = by;
}

export function targets(sea: Sea, state: MatchState): number {
  let open = 0;
  for (let j = 0; j < SHIPS; j++) if (fights(state.ships[j]) && !sheltered(sea, state, j)) open |= 1 << j;
  return open;
}

export function combat(sea: Sea, state: MatchState, sights: readonly Sight[]): void {
  blows(state);
  for (let i = 0; i < SHIPS; i++) endure(sea, state, i);
  const open = targets(sea, state);
  fly(sea, state, open);
  for (let i = 0; i < SHIPS; i++) batteries(sea, state, sights[i].ships & open, i);
}

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

export function launch(state: MatchState, i: number, kind: number, from: V3, to: V3, gun: Gun, tier: number): void {
  const d = apart(from, to);
  state.shots.push({
    ship: i, kind, from: { x: from.x, y: from.y, z: from.z }, to: { x: to.x, y: to.y, z: to.z }, age: 0,
    time: Math.max(TICK, d / gun.speed), top: gun.loft * d, power: gun.damage[tier] * (1 - gun.falloff * Math.min(1, d / gun.range)),
    effect: gun.effect, lasting: gun.lasting[tier], blast: gun.blast,
  });
}

export function shotAt(shot: Shot, age: number, out: V3): V3 {
  const t = Math.max(0, Math.min(1, age / shot.time));
  set(out, shot.from.x + t * (shot.to.x - shot.from.x), shot.from.y + t * (shot.to.y - shot.from.y), shot.from.z + t * (shot.to.z - shot.from.z));
  return normalize(out);
}

export function shotHeight(shot: Shot, age: number): number {
  const t = Math.max(0, Math.min(1, age / shot.time));
  return 4 * shot.top * t * (1 - t);
}

function fly(sea: Sea, state: MatchState, open: number): void {
  const shots = state.shots;
  let kept = 0;
  for (let s = 0; s < shots.length; s++) if (flies(sea, state, shots[s], open)) shots[kept++] = shots[s];
  shots.length = kept;
}

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

export function burst(state: MatchState, by: number, at: V3, radius: number, hurt: number, effect: number, lasting: number, open: number): number {
  let struck = 0;
  for (let j = 0; j < SHIPS; j++) {
    if (j === by || (open & (1 << j)) === 0 || !afloat(state.ships[j]) || !touches(state.ships[j], at, radius)) continue;
    strike(state, by, j, at, hurt, effect, lasting);
    struck++;
  }
  return struck;
}

function strike(state: MatchState, by: number, j: number, at: V3, hurt: number, effect: number, lasting: number): void {
  emit(state, EVENT.hit, j, by, at, hurt);
  damage(state, j, hurt, by, CAUSE.gun);
  if (effect === EFFECT.tear) state.ships[j].torn = Math.max(state.ships[j].torn, lasting);
  else if (effect === EFFECT.burn) ignite(state, j, lasting, by);
}

export const touches = (ship: Ship, at: V3, radius: number): boolean => pass(at, at, ship, radius) <= 1;

function pass(a: V3, b: V3, ship: Ship, radius: number): number {
  const f = FORMS[ship.form], reach = f.beam + radius, step = apart(a, b), far = f.half + reach + step;
  if (R * R * (2 - 2 * dot(a, ship.pos)) >= far * far) return 2;
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
    ship.reload[k] = gun.reload * (k >= BATTERY.castle ? AFT.reload : 1);
    emit(state, EVENT.broadside, i, j, ship.pos, k);
  }
}

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

function lead(sea: Sea, state: MatchState, i: number, j: number, speed: number, out: V3): V3 {
  const from = state.ships[i].pos, to = state.ships[j], g = state.ships[i].gunnery;
  velocityOf(sea, to, W);
  set(out, to.pos.x, to.pos.y, to.pos.z);
  for (let n = 0; n < GUNNERY.passes; n++) normalize(addScaled(out, to.pos, W, (g * apart(from, out)) / speed / R));
  return out;
}

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

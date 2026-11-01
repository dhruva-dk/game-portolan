// Weapons: six classes in five rarities, all aimed at a point. Shots fly great circles at a height over the sea,
// with flight time and drop; magazines empty and reload; the head of the sail is the weak spot. The broadside
// fires from both sides at once.
import { hurt } from './harm.ts';
import type { ShipInput } from './input.ts';
import { addScaled, dot, rngFloat, set, v3, type V3 } from './math.ts';
import { hasPassive, hasPerk } from './perks.ts';
import { startUse } from './items.ts';
import { R, advance, apart, along, turned } from './sphere.ts';
import { CAUSE, EVENT, FLAG, PHASE, SHIPS, STREAM, TICK, copy, emit, elapse, type MatchState, type Ship, type Shot } from './state.ts';
import {
  BOXES, BURN, FALLOFF, GUST, LOB, MUZZLE, PERKS, POWERS, RARITY, TURN_SPREAD, WEAPONS, WEATHER, isUse, isWeapon,
  type Weapon,
} from './tables.ts';
import { newSky, skyAt } from './weather.ts';
import { heightAt } from './world/index.ts';

/** How far this ship's weapon reaches. */
export const rangeOf = (ship: Ship, w: Weapon): number => w.range * (hasPerk(ship, 'longRange') ? PERKS.longRange : 1);

/** Seconds to reload this weapon for this ship. */
export function reloadTime(ship: Ship, kind: number, rarity: number): number {
  let t = WEAPONS[kind].reload * RARITY.reload[rarity];
  if (hasPerk(ship, 'fastReload')) t *= PERKS.fastReload;
  if (hasPassive(ship, 'quickReload')) t *= POWERS.quickReload;
  return t;
}

const SKY = newSky();

/** One tick of the gun crew: reloading, firing, or starting a consumable. */
export function arm(state: MatchState, i: number, input: ShipInput): void {
  const ship = state.ships[i];
  ship.cool = elapse(ship.cool);
  ship.equip = elapse(ship.equip);
  copy(ship.aim, input.aim);
  ship.aimY = input.aimY;
  if (ship.phase !== PHASE.sea) return;
  const it = ship.slots[ship.sel];
  if (isUse(it.kind)) {
    if (input.fire && ship.use < 0) startUse(state, i);
    return;
  }
  if (!isWeapon(it.kind)) return;
  const w = WEAPONS[it.kind];
  if (ship.reload > 0) {
    ship.reload -= TICK;
    if (ship.reload <= 0) {
      ship.reload = 0;
      it.n = w.mag;
      emit(state, EVENT.reload, i, -1, ship.pos, { item: it.kind, amount: 0, flag: FLAG.done });
    }
    return;
  }
  if ((input.reload && it.n < w.mag) || (input.fire && it.n <= 0)) {
    startReload(state, i);
    return;
  }
  if (!input.fire || ship.cool > 0 || ship.equip > 0 || it.n <= 0 || ship.flip > 0 || ship.use >= 0) return;
  fire(state, i);
  if (it.n <= 0) {
    emit(state, EVENT.empty, i, -1, ship.pos, { item: it.kind });
    startReload(state, i);
  }
}

function startReload(state: MatchState, i: number): void {
  const ship = state.ships[i], it = ship.slots[ship.sel];
  ship.reload = reloadTime(ship, it.kind, it.rarity);
  emit(state, EVENT.reload, i, -1, ship.pos, { item: it.kind, amount: ship.reload });
}

const MUZ = v3(), DIR = v3(), RIGHT = v3(), T = v3();

/** Fires the selected weapon at the ship's aim point. */
export function fire(state: MatchState, i: number): void {
  const ship = state.ships[i], it = ship.slots[ship.sel], w = WEAPONS[it.kind], rng = state.rng[STREAM.combat];
  it.n--;
  ship.cool = w.interval;
  const range = rangeOf(ship, w), y0 = MUZZLE.up + ship.alt;
  let spread = w.spread;
  if (ship.boost > 0) spread *= GUST.spread;
  skyAt(state, ship.pos, SKY);
  if (SKY.rain > 0.3 || SKY.thunder > 0.3) spread *= WEATHER.rain.spread;
  const turning = Math.min(1, Math.abs(ship.rate) / 1.2) * TURN_SPREAD * (hasPassive(ship, 'steadyAim') ? POWERS.steadyAim : 1);
  spread *= 1 + turning;
  // captains' hands are less steady than they think
  if (ship.captain.on) spread *= 1 + (1 - ship.captain.skill) * 1.5 + (ship.captain.gentle ? 1 : 0);
  const damage = w.damage * RARITY.damage[it.rarity];
  set(RIGHT, ship.head.y * ship.pos.z - ship.head.z * ship.pos.y, ship.head.z * ship.pos.x - ship.head.x * ship.pos.z,
    ship.head.x * ship.pos.y - ship.head.y * ship.pos.x);

  if (w.sides > 0) {
    // the broadside: a ball from each gun port down both sides at once, out to the aim's distance
    const reach = Math.max(30, Math.min(range, apart(ship.pos, ship.aim)));
    for (const side of [-1, 1]) {
      for (let k = 0; k < w.sides; k++) {
        along(ship.pos, ship.head, -4.5 + (9 * k) / Math.max(1, w.sides - 1), MUZ);
        set(DIR, RIGHT.x * side, RIGHT.y * side, RIGHT.z * side);
        launch(state, i, it.kind, it.rarity, MUZ, DIR, y0, reach, ship.aimY, w, damage, range, spread, rng);
      }
    }
    emit(state, EVENT.fire, i, -1, ship.pos, { y: y0, item: it.kind, amount: it.rarity, flag: 3 });
    return;
  }

  along(ship.pos, ship.head, MUZZLE.ahead, MUZ);
  set(T, ship.aim.x - MUZ.x, ship.aim.y - MUZ.y, ship.aim.z - MUZ.z);
  addScaled(T, T, MUZ, -dot(T, MUZ));
  const tl = Math.sqrt(dot(T, T));
  if (tl > 1e-12) set(DIR, T.x / tl, T.y / tl, T.z / tl);
  else copy(DIR, ship.head);
  const dist = Math.max(4, Math.min(range, apart(MUZ, ship.aim)));
  const aimY = apart(MUZ, ship.aim) > range ? 0 : ship.aimY;
  for (let p = 0; p < w.pellets; p++) launch(state, i, it.kind, it.rarity, MUZ, DIR, y0, dist, aimY, w, damage, range, spread, rng);
  emit(state, EVENT.fire, i, -1, MUZ, { y: y0, item: it.kind, amount: it.rarity });
}

function launch(
  state: MatchState, owner: number, kind: number, rarity: number, from: V3, dir: V3, y0: number, dist: number, aimY: number,
  w: Weapon, damage: number, range: number, spread: number, rng: Uint32Array,
): void {
  let v: number, vy: number;
  if (w.lob) {
    const t = Math.max(LOB.min, Math.min(LOB.max, dist / LOB.per));
    v = dist / t;
    vy = (aimY - y0 + 0.5 * w.gravity * t * t) / t;
    v *= 1 + (rngFloat(rng) - 0.5) * spread * 4;
  } else {
    v = w.speed;
    const t = dist / v;
    vy = (aimY - y0 + 0.5 * w.gravity * t * t) / t + (rngFloat(rng) - 0.5) * 2 * spread * 0.6 * v;
  }
  const shot: Shot = {
    owner, kind, rarity, pos: { x: from.x, y: from.y, z: from.z }, dir: { x: 0, y: 0, z: 0 }, v, y: y0, vy, g: w.gravity,
    damage, crit: w.crit, splash: w.splash, range: w.lob ? range * 1.5 : range, travelled: 0,
  };
  turned(dir, from, (rngFloat(rng) - 0.5) * 2 * spread, shot.dir);
  state.shots.push(shot);
}

// ---------------------------------------------------------------- flight

const A = v3(), B = v3(), FWD = v3(), SIDE = v3();

interface Hit { t: number; crit: boolean }
const HIT: Hit = { t: 2, crit: false };

/** Where the segment a→b (unit vectors with heights ya, yb) first meets a hull at pos/head lifted by lift. */
function segmentShip(pos: V3, head: V3, lift: number, a: V3, ya: number, b: V3, yb: number, out: Hit): boolean {
  set(SIDE, head.y * pos.z - head.z * pos.y, head.z * pos.x - head.x * pos.z, head.x * pos.y - head.y * pos.x);
  const ax = R * ((a.x - pos.x) * SIDE.x + (a.y - pos.y) * SIDE.y + (a.z - pos.z) * SIDE.z);
  const az = R * ((a.x - pos.x) * head.x + (a.y - pos.y) * head.y + (a.z - pos.z) * head.z);
  const bx = R * ((b.x - pos.x) * SIDE.x + (b.y - pos.y) * SIDE.y + (b.z - pos.z) * SIDE.z);
  const bz = R * ((b.x - pos.x) * head.x + (b.y - pos.y) * head.y + (b.z - pos.z) * head.z);
  const ay = ya - lift, by = yb - lift, dx = bx - ax, dy = by - ay, dz = bz - az;
  let found = false;
  for (const [x0, x1, y0, y1, z0, z1, crit] of BOXES) {
    let t0 = 0, t1 = 1, ok = true;
    for (let k = 0; k < 3 && ok; k++) {
      const o = k === 0 ? ax : k === 1 ? ay : az, d = k === 0 ? dx : k === 1 ? dy : dz;
      const lo = k === 0 ? x0 : k === 1 ? y0 : z0, hi = k === 0 ? x1 : k === 1 ? y1 : z1;
      if (Math.abs(d) < 1e-9) {
        if (o < lo || o > hi) ok = false;
        continue;
      }
      let ta = (lo - o) / d, tb = (hi - o) / d;
      if (ta > tb) {
        const s = ta;
        ta = tb;
        tb = s;
      }
      t0 = Math.max(t0, ta);
      t1 = Math.min(t1, tb);
      if (t0 > t1) ok = false;
    }
    if (ok && (!found || t0 < out.t)) {
      out.t = t0;
      out.crit = crit;
      found = true;
    }
  }
  return found;
}

export const falloff = (s: Shot): number => {
  const k = s.travelled / s.range;
  return k < FALLOFF.hold ? 1 : Math.max(FALLOFF.floor, 1 - ((k - FALLOFF.hold) * (1 - FALLOFF.floor)) / (1 - FALLOFF.hold));
};

/** Moves every shot on, and lands those that hit a hull, a decoy, the land, the sea or a smoke cloud. */
export function fly(state: MatchState): void {
  const shots = state.shots;
  for (let k = shots.length - 1; k >= 0; k--) {
    const s = shots[k];
    copy(A, s.pos);
    const ya = s.y, step = s.v * TICK;
    advance(s.pos, s.dir, step, s.pos, s.dir);
    s.y += s.vy * TICK - 0.5 * s.g * TICK * TICK;
    s.vy -= s.g * TICK;
    s.travelled += step;
    copy(B, s.pos);
    let best = -1, bt = 2, crit = false;
    for (let j = 0; j < SHIPS; j++) {
      const t = state.ships[j];
      if (j === s.owner || t.phase !== PHASE.sea || apart(t.pos, B) > 30) continue;
      if (segmentShip(t.pos, t.head, t.alt, A, ya, B, s.y, HIT) && HIT.t < bt) {
        bt = HIT.t;
        best = j;
        crit = HIT.crit;
      }
    }
    let decoy = -1;
    for (let d = 0; d < state.decoys.length; d++) {
      const g = state.decoys[d];
      if (g.owner === s.owner || g.t <= 0 || apart(g.pos, B) > 30) continue;
      if (segmentShip(g.pos, g.head, 0, A, ya, B, s.y, HIT) && HIT.t < bt) {
        bt = HIT.t;
        best = -1;
        decoy = d;
      }
    }
    if (best >= 0 || decoy >= 0) {
      at(A, B, bt, FWD);
      const y = ya + (s.y - ya) * bt;
      if (s.splash > 0) burst(state, s, FWD, y);
      else if (best >= 0) strike(state, s, best, FWD, y, crit);
      else {
        state.decoys[decoy].t = 0;
        emit(state, EVENT.impact, -1, s.owner, FWD, { y, item: s.kind, flag: 8 });
      }
      shots.splice(k, 1);
      continue;
    }
    if (smoked(state, B, s.y)) {
      emit(state, EVENT.blocked, -1, s.owner, B, { y: s.y, item: s.kind });
      shots.splice(k, 1);
      continue;
    }
    const ground = heightAt(B);
    if (s.y <= Math.max(0, ground)) {
      const land = ground > 0;
      if (s.splash > 0) burst(state, s, B, Math.max(0, ground));
      else emit(state, EVENT.impact, -1, s.owner, B, { y: Math.max(0, ground), item: s.kind, flag: land ? FLAG.land : 0 });
      shots.splice(k, 1);
      continue;
    }
    if (s.travelled > s.range * FALLOFF.beyond) {
      if (s.splash > 0) burst(state, s, B, s.y);
      shots.splice(k, 1);
    }
  }
}

function at(a: V3, b: V3, t: number, out: V3): V3 {
  set(out, a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, a.z + (b.z - a.z) * t);
  const l = Math.sqrt(dot(out, out));
  return set(out, out.x / l, out.y / l, out.z / l);
}

function strike(state: MatchState, s: Shot, j: number, p: V3, y: number, crit: boolean): void {
  const isCrit = crit && s.crit > 1;
  const amount = s.damage * falloff(s) * (isCrit ? s.crit : 1);
  hurt(state, j, amount, s.owner, s.kind, p, y, isCrit ? FLAG.crit | FLAG.ship : FLAG.ship);
  emit(state, EVENT.impact, j, s.owner, p, { y, item: s.kind, flag: FLAG.ship | (isCrit ? FLAG.crit : 0) });
  onHit(state, s.owner, j);
}

/** What the owner's perks do to a ship their shot hits. */
export function onHit(state: MatchState, owner: number, j: number): void {
  if (owner < 0) return;
  const o = state.ships[owner], t = state.ships[j];
  if (hasPerk(o, 'fireShot')) {
    if (t.burn <= 0) emit(state, EVENT.ablaze, j, owner, t.pos, { amount: PERKS.fireShot });
    t.burn = PERKS.fireShot;
    t.burnBy = owner;
  }
  if (hasPerk(o, 'frostShot')) t.slow = PERKS.frostShot.time;
  if (hasPerk(o, 'spotter')) t.spotted = PERKS.spotter;
}

/** A mortar shell bursts: everything within its splash is hurt, less toward the edge. */
function burst(state: MatchState, s: Shot, p: V3, y: number): void {
  emit(state, EVENT.splash, -1, s.owner, p, { y, item: s.kind, amount: s.splash, flag: heightAt(p) > 0 ? FLAG.land : 0 });
  for (let j = 0; j < SHIPS; j++) {
    const t = state.ships[j];
    if (j === s.owner || t.phase !== PHASE.sea) continue;
    const h = apart(t.pos, p), v = (2 - y) * 0.5, d = Math.sqrt(h * h + v * v) - 3;
    if (d > s.splash) continue;
    hurt(state, j, s.damage * (1 - (Math.max(0, d) / s.splash) * 0.6), s.owner, s.kind, t.pos, 3, FLAG.ship);
    onHit(state, s.owner, j);
  }
}

/** Inside a smoke cloud, shots are swallowed. */
export function smoked(state: MatchState, p: V3, y: number): boolean {
  if (y > 30) return false;
  for (const c of state.clouds) if (c.t > 0 && apart(c.at, p) < POWERS.smokeScreen.r) return true;
  return false;
}

/** Fire Shot burns: points a second, shield first. */
export function burnTick(state: MatchState): void {
  for (let i = 0; i < SHIPS; i++) {
    const ship = state.ships[i];
    if (ship.slow > 0) ship.slow = elapse(ship.slow);
    if (ship.spotted > 0) ship.spotted = elapse(ship.spotted);
    if (ship.burn <= 0 || ship.phase !== PHASE.sea) continue;
    ship.burn = elapse(ship.burn);
    hurt(state, i, BURN.rate * TICK, ship.burnBy, CAUSE.burn, ship.pos, 3);
  }
}


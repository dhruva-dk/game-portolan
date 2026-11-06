// Sailing on the sphere: ships run great circles at up to 14.5 m/s, faster off the wind than into it, turn,
// carve, ride the currents, run aground on land and shallows, gust, hop, and bump into each other. A ship upwind
// steals her wind, and her parts (parts.ts) set what drive and steering she has left.
import { aground, bloomAt, currentAt, levelAt, solidAt, solidNormal } from './environment.ts';
import { hurt } from './harm.ts';
import { blanket, drive, steering } from './parts.ts';
import type { ShipInput } from './input.ts';
import { addScaled, dacos, dot, length, normalize, set, v3, type V3 } from './math.ts';
import { hasActive, hasPassive, hasPerk } from './perks.ts';
import { R, advance, apart, localFrame, turned } from './sphere.ts';
import { CAUSE, EVENT, PHASE, SHIPS, TICK, copy, emit, elapse, type MatchState, type Ship } from './state.ts';
import { COINS, GRAVITY, GROUND, GUST, PARTS, PERKS, POINT, POWERS, SHIP, WEATHER, WIND } from './tables.ts';
import { newWind, windAt, type Wind } from './wind.ts';
import { DRAFT, heightAt, regionAt } from './world/index.ts';

const smooth = (a: number, b: number, x: number): number => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/**
 * How well she sails at `a` radians off the wind's direction: 0 running dead before it, PI straight into it.
 * Best on a reach, a little slower running, and at most 25% slower close-hauled.
 */
export function pointOfSail(a: number): number {
  return POINT.run + (POINT.beam - POINT.run) * smooth(0, 1.2, a) - 0.07 * smooth(1.9, 2.5, a)
    - (POINT.beam - 0.07 - POINT.upwind) * smooth(2.5, 3, a);
}

/** The angle between her heading and where the wind blows to. */
export function offWind(head: V3, wind: V3): number {
  const w = length(wind);
  return w > 1e-9 ? dacos(Math.max(-1, Math.min(1, dot(head, wind) / w))) : 1.5;
}

/** The speed she settles to with this wind and sail. */
export function settledSpeed(ship: Ship, wind: Wind, throttle: number): number {
  let point = pointOfSail(offWind(ship.head, wind.v));
  point = 1 + (point - 1) * Math.min(1, wind.steady + 0.3);
  if (hasPassive(ship, 'windReader')) point = 1 - (1 - point) * POWERS.windReader;
  const s = wind.strength, airs = s < 1 ? WIND.airs + (1 - WIND.airs) * Math.max(0, s) : 1;
  let top = SHIP.top * point * airs * throttle * drive(ship);
  if (hasPassive(ship, 'lightHull')) top *= POWERS.lightHull.speed;
  if (ship.use >= 0) top *= SHIP.using;
  if (ship.slow > 0) top *= PERKS.frostShot.slow;
  return Math.min(SHIP.top * (hasPassive(ship, 'lightHull') ? POWERS.lightHull.speed : 1), top);
}

/** The fastest she can turn right now, rad/s. */
export function turnRate(ship: Ship): number {
  let r = SHIP.turn + SHIP.turnWay * Math.min(1, Math.abs(ship.speed) / SHIP.turnFull);
  if (hasPerk(ship, 'tightTurns')) r *= PERKS.tightTurns;
  if (hasPassive(ship, 'lightHull')) r *= POWERS.lightHull.turn;
  if (ship.boost > 0) r *= GUST.turn;
  return r * (1 - WEATHER.snow.turn * ship.ice) * steering(ship);
}

const W = newWind(), FLOW = v3(), V = v3(), SB = v3(), P1 = v3(), H1 = v3(), PROBE = v3(), WAS = v3(), N = v3(), E = v3(), NN = v3();

/** One tick of sailing for ship i. */
export function sail(state: MatchState, i: number, input: ShipInput): void {
  const ship = state.ships[i];
  copy(ship.was, ship.pos);
  if (ship.flip > 0) {
    ship.flip = elapse(ship.flip);
    ship.speed *= 0.9;
    ship.rate = 0;
  }
  windAt(state, ship.pos, W);
  const steer = Math.max(-3.2, Math.min(3.2, input.steer));
  const max = turnRate(ship);
  const want = ship.flip > 0 ? 0 : Math.max(-1, Math.min(1, steer / 0.3)) * max;
  ship.rate += (want - ship.rate) * Math.min(1, TICK * 5);
  ship.turn = steer;

  let target = ship.flip > 0 ? 0 : settledSpeed(ship, W, Math.max(0, Math.min(1, input.throttle)));
  target *= bloomAt(state, ship.pos) * blanket(state, i, W);
  if (Math.abs(steer) > SHIP.hard) target = Math.min(target, SHIP.crawl);
  let accel: number = target > ship.speed ? SHIP.accel : SHIP.decel;
  if (ship.boost > 0) {
    ship.boost = elapse(ship.boost);
    // the gust is a burst of wind in her canvas: with the mainmast down there is less to catch it
    target += GUST.speed * (ship.fallen > 0 ? PARTS.bare : 1);
    accel = GUST.accel;
  }
  if (ship.power > 0 && hasActive(ship, 'ram')) {
    target += POWERS.ram.speed;
    accel = GUST.accel;
  }
  const grounded = aground(state, ship.pos, draftOf(ship));
  if (grounded) target = Math.min(target, 2);
  ship.speed += Math.max(-accel * TICK, Math.min(accel * TICK, target - ship.speed));

  // the turn, and the slip of a carved turn
  const a = ship.rate * TICK;
  turned(ship.head, ship.pos, a, ship.head);
  normalize(addScaled(ship.head, ship.head, ship.pos, -dot(ship.head, ship.pos)));
  ship.drift = -SHIP.carve * ship.speed * (max > 0 ? ship.rate / max : 0);

  // velocity: way on, slip, current and any shove
  currentAt(state, ship.pos, FLOW);
  const rider = hasPerk(ship, 'currentRider') ? PERKS.currentRider : 1;
  set(SB, ship.head.y * ship.pos.z - ship.head.z * ship.pos.y, ship.head.z * ship.pos.x - ship.head.x * ship.pos.z,
    ship.head.x * ship.pos.y - ship.head.y * ship.pos.x);
  set(V, 0, 0, 0);
  addScaled(V, V, ship.head, ship.speed);
  addScaled(V, V, SB, ship.drift);
  addScaled(V, V, FLOW, rider);
  addScaled(V, V, ship.shove, 1);
  move(state, i, grounded);
  const k = Math.max(0, 1 - TICK * 1.5);
  set(ship.shove, ship.shove.x * k, ship.shove.y * k, ship.shove.z * k);
  addScaled(ship.shove, ship.shove, ship.pos, -dot(ship.shove, ship.pos));

  // the hop off the water
  if (ship.alt > 0 || ship.vy > 0) {
    ship.alt += ship.vy * TICK - 0.5 * GRAVITY * TICK * TICK;
    ship.vy -= GRAVITY * TICK;
    if (ship.alt <= 0) {
      ship.alt = 0;
      ship.vy = 0;
    }
  }

  // log and coins for the distance run
  const d = apart(ship.was, ship.pos), before = Math.floor(ship.sailed / COINS.metres);
  ship.sailed += d;
  const coins = Math.floor(ship.sailed / COINS.metres) - before;
  if (coins > 0) ship.coins += coins;
  if ((state.tick + i) % 15 === 0) ship.regions |= 1 << regionAt(ship.pos);
  if (ship.scrape > 0) ship.scrape = elapse(ship.scrape);
}

export const draftOf = (ship: Ship): number => (hasPerk(ship, 'shallowDraft') ? DRAFT * PERKS.shallowDraft : DRAFT);

function move(state: MatchState, i: number, grounded: boolean): void {
  const ship = state.ships[i];
  copy(ship.vel, V);
  let on = tryMove(state, ship, grounded);
  if (on === null) return;
  // she slides along whatever stopped her, easing off it; a bank that bends into her slide stops the next try too, so
  // she slides along that in turn
  for (let k = 0; k < GROUND.slides && on !== null; k++) {
    if (!hitSolid || !solidNormal(state, PROBE, N)) shoreNormal(PROBE, N);
    let into = -dot(V, N);
    // where the broad lie of the shore says she isn't going into it, the ground right under her says which way it rises
    if (into <= 0 && !hitSolid) into = -dot(V, shoreNormal(PROBE, N, GROUND.probe * GROUND.fine));
    if (into > 0) {
      if (k === 0 && into > GROUND.scrape && ship.scrape === 0) {
        emit(state, EVENT.scrape, i, -1, PROBE, { amount: into });
        ship.scrape = 0.5;
      }
      addScaled(V, V, N, into + GROUND.ease);
      if (k === 0) ship.speed *= 1 - (1 - GROUND.keep) * Math.max(0, -dot(ship.head, N));
      const s = dot(ship.shove, N);
      if (s < 0) addScaled(ship.shove, ship.shove, N, -s);
    }
    copy(ship.vel, V);
    on = tryMove(state, ship, grounded);
  }
  if (on !== null) ship.speed *= 0.5;
}

const PROBES = [1, 0, -1];
/** Whether the last move that was stopped ran into something standing out of the water rather than the ground. */
let hitSolid = false;

function tryMove(state: MatchState, ship: Ship, grounded: boolean): number | null {
  const v = length(V);
  if (v === 0) return null;
  set(H1, V.x / v, V.y / v, V.z / v);
  advance(ship.pos, H1, v * TICK, P1, H1);
  set(H1, ship.head.x, ship.head.y, ship.head.z);
  normalize(addScaled(H1, H1, P1, -dot(H1, P1)));
  const half = (SHIP.half * 0.8) / R, draft = draftOf(ship), fore = dot(V, ship.head);
  for (const on of PROBES) {
    // the hull follows where her bow has been: ground under her stern never stops a ship going ahead, nor under her bow
    // one going astern
    if (on * fore < 0) continue;
    normalize(addScaled(PROBE, P1, H1, on * half));
    // a hull already touching the ground may still work across the shallows, but not up onto dry land
    const h = heightAt(PROBE), level = levelAt(state, PROBE);
    if (h > (grounded ? level : level - draft) && h > heightAt(normalize(addScaled(WAS, ship.pos, ship.head, on * half)))) {
      hitSolid = false;
      return on;
    }
    // and one caught inside a column or a floe may still get out of it
    if (solidAt(state, PROBE) && !solidAt(state, normalize(addScaled(WAS, ship.pos, ship.head, on * half)))) {
      hitSolid = true;
      return on;
    }
  }
  copy(ship.pos, P1);
  copy(ship.head, H1);
  return null;
}

/** The way off the shore at p: down the slope of the ground, measured `across` metres either side. */
function shoreNormal(p: V3, out: V3, across: number = GROUND.probe): V3 {
  if (downhill(p, out, across)) return out;
  return normalize(set(out, -V.x, -V.y, -V.z));
}

/** The way down the slope of the ground at p, measured `across` metres either side, or false where it lies flat. */
function downhill(p: V3, out: V3, across: number): boolean {
  const d = across / R;
  localFrame(p, E, NN);
  const gx = heightAt(normalize(addScaled(P1, p, E, d))) - heightAt(normalize(addScaled(P1, p, E, -d)));
  const gy = heightAt(normalize(addScaled(P1, p, NN, d))) - heightAt(normalize(addScaled(P1, p, NN, -d)));
  set(out, -gx * E.x - gy * NN.x, -gx * E.y - gy * NN.y, -gx * E.z - gy * NN.z);
  if (length(out) <= 1e-9) return false;
  normalize(out);
  return true;
}

/**
 * Aground on a falling tide, she is pushed gently off toward deeper water; inside something solid, out of it. A ship
 * working off under her own way is pushed less, so the push never holds her where she is.
 */
export function refloat(state: MatchState, i: number): void {
  const ship = state.ships[i];
  // a floe riding into her, or a hull caught inside a column, is shouldered out of it
  if (solidNormal(state, ship.pos, N)) addScaled(ship.shove, ship.shove, N, GROUND.push * TICK * 6);
  // (on a bar lying flat there is no way down to push her, and she works off it under her own way)
  if (!aground(state, ship.pos, draftOf(ship)) || !downhill(ship.pos, N, GROUND.probe)) return;
  addScaled(ship.shove, ship.shove, N, GROUND.push * TICK * 4 * (ship.speed > 1 ? GROUND.under : 1));
}

// ---------------------------------------------------------------- the gust

/** Spends a gust charge: a burst of speed and a hop off the water. */
export function gust(state: MatchState, i: number): boolean {
  const ship = state.ships[i];
  if (ship.phase !== PHASE.sea || ship.gusts <= 0 || ship.boost > 0 || ship.flip > 0) return false;
  ship.gusts--;
  ship.boost = GUST.time;
  ship.vy = Math.max(ship.vy, GUST.hop);
  if (ship.alt <= 0) ship.alt = 1e-3;
  emit(state, EVENT.gust, i, -1, ship.pos, { amount: ship.gusts });
  return true;
}

/** Gust charges come back one at a time. */
export function rechargeGust(ship: Ship): void {
  if (ship.gusts >= GUST.charges) {
    ship.gustT = 0;
    return;
  }
  ship.gustT += TICK / (hasPerk(ship, 'quickGust') ? PERKS.quickGust : 1);
  if (ship.gustT >= GUST.recharge) {
    ship.gusts++;
    ship.gustT = 0;
  }
}

// ---------------------------------------------------------------- bumping

const D = v3(), DV = v3();

/** Hulls that touch push apart; one closing fast enough rams the other. */
export function collide(state: MatchState): void {
  for (let i = 0; i < SHIPS; i++) {
    if (state.ships[i].phase !== PHASE.sea) continue;
    for (let j = i + 1; j < SHIPS; j++) if (state.ships[j].phase === PHASE.sea) contact(state, i, j);
  }
}

function contact(state: MatchState, i: number, j: number): void {
  const a = state.ships[i], b = state.ships[j];
  const gap = apart(a.pos, b.pos);
  if (gap >= SHIP.touch) return;
  set(D, (b.pos.x - a.pos.x) * R, (b.pos.y - a.pos.y) * R, (b.pos.z - a.pos.z) * R);
  addScaled(D, D, a.pos, -dot(D, a.pos));
  const l = length(D);
  if (l > 1e-9) set(D, D.x / l, D.y / l, D.z / l);
  else set(D, a.head.y * a.pos.z - a.head.z * a.pos.y, a.head.z * a.pos.x - a.head.x * a.pos.z, a.head.x * a.pos.y - a.head.y * a.pos.x);
  const pen = SHIP.touch - gap;
  normalize(addScaled(a.pos, a.pos, D, (-pen * 0.5) / R));
  normalize(addScaled(b.pos, b.pos, D, (pen * 0.5) / R));
  normalize(addScaled(a.head, a.head, a.pos, -dot(a.head, a.pos)));
  normalize(addScaled(b.head, b.head, b.pos, -dot(b.head, b.pos)));
  set(DV, a.vel.x - b.vel.x, a.vel.y - b.vel.y, a.vel.z - b.vel.z);
  const closing = dot(DV, D);
  if (closing <= 0) return;
  addScaled(a.shove, a.shove, D, -closing * 0.6);
  addScaled(b.shove, b.shove, D, closing * 0.6);
  a.speed *= 0.7;
  b.speed *= 0.7;
  const aRams = a.power > 0 && hasActive(a, 'ram'), bRams = b.power > 0 && hasActive(b, 'ram');
  if (aRams) {
    hurt(state, j, POWERS.ram.damage, i, CAUSE.ram, b.pos, 2);
    a.power = 0;
  }
  if (bRams) {
    hurt(state, i, POWERS.ram.damage, j, CAUSE.ram, a.pos, 2);
    b.power = 0;
  }
  if (closing > SHIP.ram) {
    const dmg = (closing - 5) * SHIP.ramDamage;
    // the faster ship drives into the slower one and takes less of the blow; no collision takes off more than the cap
    const fa = Math.max(0, dot(a.vel, D)), fb = Math.max(0, -dot(b.vel, D)), sum = fa + fb > 1e-9 ? fa + fb : 1;
    const capA = SHIP.ramCap - (bRams ? POWERS.ram.damage : 0), capB = SHIP.ramCap - (aRams ? POWERS.ram.damage : 0);
    if (!aRams) hurt(state, i, Math.min(capA, dmg * (0.3 + 0.7 * (fb / sum))), j, CAUSE.ram, a.pos, 1);
    if (!bRams) hurt(state, j, Math.min(capB, dmg * (0.3 + 0.7 * (fa / sum))), i, CAUSE.ram, b.pos, 1);
    emit(state, EVENT.ram, fa >= fb ? i : j, fa >= fb ? j : i, a.pos, { amount: closing });
  }
}

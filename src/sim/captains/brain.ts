// A captain's mind. Every few ticks it thinks: pick a region and dive into it, then at sea weigh the Storm,
// its hull, the ships in sight, loot, the gull and its own water, and settle on a mode and a goal. Every tick
// it steers for the goal (by A* over the nav grid when land is in the way), aims, fires and uses what it carries.
import { canCall } from '../economy.ts';
import { solidAt } from '../environment.ts';
import type { ShipInput } from '../input.ts';
import { PI, addScaled, dcos, dot, dsin, normalize, rngFloat, rngInt, rngRange, set, v3, type Rng, type V3 } from '../math.ts';
import { cellCentre, clearLine, findPath, nearestOpen, openAt } from '../nav.ts';
import { GALE_SPEED, galeSeat } from '../opening.ts';
import { activeOf, hasPerk } from '../perks.ts';
import { rangeOf } from '../combat.ts';
import { roomFor, useful } from '../items.ts';
import { R, apart, along, angleTo, tangentAt, tangentToward } from '../sphere.ts';
import { PHASE, PLAYER, SHIPS, STREAM, TICK, copy, type Captain, type MatchState, type Ship } from '../state.ts';
import { calmNow, inStorm, stormView, newStormView, toEdge } from '../storm.ts';
import { GALE, ITEM, PARCELS, PERKS, SLOTS, WEAPONS, ZONES, isUse, isWeapon } from '../tables.ts';
import { atHome } from '../territory.ts';
import { seen, SEEN } from '../visibility.ts';
import { CENTRES, REGIONS } from '../world/index.ts';
import { styleOf, type Style } from './temperaments.ts';

export const MODE = { gale: 0, glide: 1, roam: 2, loot: 3, fight: 4, flee: 5, storm: 6, heal: 7, claim: 8, raid: 9 } as const;
export const MODE_NAMES = ['gale', 'glide', 'roam', 'loot', 'fight', 'flee', 'storm', 'heal', 'claim', 'raid'] as const;

export const BRAIN = {
  /** Think every this many ticks. */
  every: 6,
  /** Seconds before a green / a sharp captain first fires on a ship it has just seen. */
  react: [1.4, 0.35],
  /** Preferred range for each weapon, metres. */
  pref: { [ITEM.cannon]: 95, [ITEM.scatter]: 28, [ITEM.harpoon]: 170, [ITEM.mortar]: 140, [ITEM.repeater]: 65, [ITEM.broadside]: 45 } as Record<number, number>,
  /** Aim error, as a share of distance, for a green captain; a sharp one has a fifth of it. */
  error: 0.12,
  /** Seconds to the next look round for a new goal while roaming. */
  roam: 9,
  repath: 2,
  /** A captain sure of this much that the player stays out in the Storm this many seconds waits for them at its edge. */
  waits: { sure: 0.4, seconds: 3 },
} as const;

const rngOf = (state: MatchState, i: number): Rng => state.rng[STREAM.captains + i];
const P = v3(), Q = v3(), T = v3(), U = v3(), VIEW = newStormView();

// ---------------------------------------------------------------- thinking

export function think(state: MatchState, i: number): void {
  const ship = state.ships[i], c = ship.captain;
  if (ship.phase === PHASE.sunk) return;
  c.think--;
  if (c.think > 0) return;
  c.think = BRAIN.every;
  const style = styleOf(ship), rng = rngOf(state, i);
  if (ship.phase === PHASE.gale) {
    if (c.region < 0) chooseRegion(state, i, rng);
    c.mode = MODE.gale;
    return;
  }
  if (ship.phase === PHASE.glide) {
    c.mode = MODE.glide;
    return;
  }
  c.since += BRAIN.every * TICK;
  c.swapT = Math.max(0, c.swapT - BRAIN.every * TICK);

  // what it can see
  perceive(state, i, style);

  // 1. the Storm comes first
  stormView(state, VIEW);
  const edge = toEdge(state, ship.pos);
  const inNext = apart(ship.pos, VIEW.next.at) < VIEW.next.r - style.margin * 0.5;
  const late = VIEW.closing || VIEW.left < 25;
  if (edge < style.margin * 0.4 || (late && !inNext && VIEW.phase < 7)) {
    setMode(c, MODE.storm);
    const target = edge < style.margin * 0.4 || !late ? VIEW.calm : VIEW.next;
    inward(ship.pos, target.at, Math.max(0, target.r - style.margin), c.goal);
    if (c.foe >= 0 && seenNow(state, c)) c.mode = MODE.storm;
    return;
  }

  // 2. heal when it is safe to
  const foeD = c.foe >= 0 ? apart(ship.pos, state.ships[c.foe].pos) : 1e9;
  if ((ship.hull < style.mend || ship.shield < 25) && healSlot(ship) >= 0 && (foeD > 70 || ship.hull < style.run)) {
    setMode(c, MODE.heal);
    copy(c.goal, ship.pos);
    if (c.foe >= 0) away(ship.pos, state.ships[c.foe].pos, 60, c.goal);
    return;
  }

  // 3. run from a fight it is losing
  if (c.foe >= 0 && ship.hull < style.run * (c.gentle ? 1.3 : 1) && foeD < 140) {
    setMode(c, MODE.flee);
    away(ship.pos, state.ships[c.foe].pos, 120, c.goal);
    keepInside(state, c.goal, style);
    return;
  }

  // 4. fight what it sees
  if (c.foe >= 0 && wantsFight(state, i, style, foeD)) {
    setMode(c, MODE.fight);
    const foe = state.ships[c.foe].pos;
    // a captain who has learnt that the player lingers out in the Storm waits at its edge for them to come back in
    if (c.foe === PLAYER && waitsOut(c) && inStorm(state, foe)) lieInWait(foe, style.margin * 0.6, c.goal);
    else copy(c.goal, foe);
    return;
  }

  // 5. the gull, when it is flush
  // (hailing happens in helm, so the input is set on the tick it thinks)

  // 6. loot worth having
  const loot = bestLoot(state, i, style);
  if (loot >= 0) {
    setMode(c, MODE.loot);
    c.target = state.loot[loot].id;
    copy(c.goal, state.loot[loot].at);
    return;
  }

  // 7. raid a rival's trail
  if (style.raid > 0.4 && !c.gentle) {
    const cell = nearestTrail(state, i, 160);
    if (cell >= 0) {
      setMode(c, MODE.raid);
      cellCentre(cell, c.goal);
      return;
    }
  }

  // 8. claim water: sail a loop out from home and back
  if (c.mode === MODE.claim && c.li < c.ring.length) {
    const p = c.ring[c.li];
    if (apart(ship.pos, p) < 18) c.li++;
    if (c.li < c.ring.length) {
      copy(c.goal, c.ring[c.li]);
      return;
    }
  }
  if (c.claimT <= 0 && atHome(state, i) && edge > style.loop * 2) {
    planLoop(state, i, style, rng);
    c.claimT = rngRange(rng, 12, 30);
    if (c.ring.length > 0) {
      setMode(c, MODE.claim);
      copy(c.goal, c.ring[0]);
      return;
    }
  }
  c.claimT -= BRAIN.every * TICK;

  // 9. otherwise roam: home water when it has some, else somewhere in the circle
  if (c.mode !== MODE.roam || c.since > BRAIN.roam || apart(ship.pos, c.goal) < 20) {
    setMode(c, MODE.roam);
    roamGoal(state, i, style, rng);
  }
}

function setMode(c: Captain, mode: number): void {
  if (c.mode !== mode) {
    c.mode = mode;
    c.since = 0;
    c.path.length = 0;
  }
}

const seenNow = (state: MatchState, c: Captain): boolean => state.tick * TICK - c.seen < 2;

/** Chooses the region to dive to: its own pick, or the player's, if it has learnt where the player goes. */
function chooseRegion(state: MatchState, i: number, rng: Rng): void {
  const ship = state.ships[i], c = ship.captain, style = styleOf(ship);
  // a region whose heart is inside the first safe circle
  let r = rngInt(rng, REGIONS.length);
  for (let k = 0; k < 4 && apart(CENTRES[r], state.storm.centres[0]) > ZONES[0] - 120; k++) r = rngInt(rng, REGIONS.length);
  const knows = c.dive.confidence >= 0.4 && !state.ships[PLAYER].captain.on;
  if (knows && !c.gentle && style.fight >= 0.55 && rngFloat(rng) < 0.6 + 0.4 * c.dive.confidence) r = c.dive.value;
  else if (knows && (c.gentle || style.fight < 0.35) && r === c.dive.value) r = (r + 1 + rngInt(rng, REGIONS.length - 1)) % REGIONS.length;
  c.region = r;
  tangentAt(CENTRES[r], rngRange(rng, -PI, PI), T);
  along(CENTRES[r], T, rngRange(rng, 60, 180), c.drop);
  if (!openAt(c.drop)) nearestOpen(c.drop, c.drop, 30);
}

/** Notes the nearest ship it can see, and keeps a grudge against whoever hits it. */
function perceive(state: MatchState, i: number, style: Style): void {
  const ship = state.ships[i], c = ship.captain, now = state.tick * TICK;
  let best = -1, bd = style.notice * (c.gentle ? 0.7 : 1);
  for (let j = 0; j < SHIPS; j++) {
    const o = state.ships[j];
    if (j === i || o.phase !== PHASE.sea) continue;
    const d = apart(ship.pos, o.pos);
    if (d > SIGHT_MAX) continue;
    let score = d;
    if (j === ship.lastBy && state.tick - ship.lastHit < 150) score *= 0.5;
    if (j === PLAYER && c.gentle) score *= 1.6;
    if (j === PLAYER && !c.gentle && c.grudge > 0) score *= 0.8;
    if (score >= bd) continue;
    if ((seen(state, i, j) & SEEN.visible) === 0) continue;
    bd = score;
    best = j;
  }
  // a decoy draws the eye of a captain chasing its owner
  if (best >= 0) {
    for (const d of state.decoys) {
      if (d.owner === best && apart(ship.pos, d.pos) < apart(ship.pos, state.ships[best].pos) && d.t > 0) {
        copy(c.last, d.pos);
        c.foe = best;
        c.seen = now;
        c.target = -2;
        return;
      }
    }
  }
  if (best >= 0) {
    if (best !== c.foe) c.react = now + reactTime(c);
    c.foe = best;
    c.seen = now;
    c.target = -1;
    copy(c.last, state.ships[best].pos);
    if (best === PLAYER && ship.lastBy === PLAYER) c.grudge = 1;
  } else if (c.foe >= 0 && (now - c.seen > 4 || state.ships[c.foe].phase !== PHASE.sea)) c.foe = -1;
}

const SIGHT_MAX = 240;

const reactTime = (c: Captain): number => BRAIN.react[0] + (BRAIN.react[1] - BRAIN.react[0]) * c.skill + (c.gentle ? 1.5 : 0);

function wantsFight(state: MatchState, i: number, style: Style, d: number): boolean {
  const ship = state.ships[i], c = ship.captain, foe = state.ships[c.foe];
  if (!hasWeapon(ship)) return false;
  let will = style.fight * (0.6 + 0.4 * c.aggro);
  will += 0.25 * ((ship.hull + ship.shield) - (foe.hull + foe.shield)) / 100;
  if (ship.lastBy === c.foe && state.tick - ship.lastHit < 120) will += 0.4;
  // a captain who has learnt where the player's hull breaks presses the attack below it
  if (c.foe === PLAYER && c.run.confidence > 0.3 && foe.hull < c.run.value + 10) will += 0.3;
  if (c.foe === PLAYER && c.gentle) will -= 0.3;
  return will > 0.35 || d < 35;
}

const hasWeapon = (ship: Ship): boolean => {
  for (let s = 0; s < SLOTS; s++) if (isWeapon(ship.slots[s].kind)) return true;
  return false;
};

/** The slot holding the consumable it should use now, or -1. */
function healSlot(ship: Ship): number {
  let best = -1, bv = 0;
  for (let s = 0; s < SLOTS; s++) {
    const it = ship.slots[s];
    if (!isUse(it.kind) || it.n <= 0 || !useful(ship, it.kind)) continue;
    let v = 0;
    if (it.kind === ITEM.fullRepair) v = ship.hull < 45 ? 4 : 0;
    else if (it.kind === ITEM.repairKit) v = ship.hull < 75 ? 3 : 0;
    else if (it.kind === ITEM.bigShield) v = ship.shield < 50 ? 2.5 : 0;
    else v = ship.shield < 50 ? 2 : 0;
    if (v > bv) {
      bv = v;
      best = s;
    }
  }
  return best;
}

function bestLoot(state: MatchState, i: number, style: Style): number {
  const ship = state.ships[i], c = ship.captain;
  const reach = style.lootReach * (hasPerk(ship, 'lootSense') ? 1 + PERKS.lootSense / 200 : 1);
  let best = -1, bs = 0;
  for (let k = 0; k < state.loot.length; k++) {
    const l = state.loot[k], d = apart(ship.pos, l.at);
    if (d > reach || toEdge(state, l.at) < 10) continue;
    let worth = 0;
    if (isWeapon(l.item.kind)) worth = weaponWorth(ship, l.item.kind, l.item.rarity);
    else if (roomFor(ship, l.item) >= 0) worth = 0.5;
    if (worth <= 0) continue;
    const score = (worth * style.loot) / (1 + d / 60);
    if (score > bs) {
      bs = score;
      best = k;
    }
  }
  if (best >= 0 && c.mode === MODE.loot && c.target >= 0) {
    const k = state.loot.findIndex((l) => l.id === c.target);
    if (k >= 0 && apart(ship.pos, state.loot[k].at) < reach) return k;
  }
  return bs > 0.08 ? best : -1;
}

/** How much a weapon would improve the hotbar: 0 if it wouldn't. */
function weaponWorth(ship: Ship, kind: number, rarity: number): number {
  let empty = false, worst = 99, same = -1;
  for (let s = 0; s < SLOTS; s++) {
    const it = ship.slots[s];
    if (it.kind === ITEM.none) empty = true;
    if (isWeapon(it.kind)) {
      worst = Math.min(worst, it.rarity);
      if (it.kind === kind) same = Math.max(same, it.rarity);
    }
  }
  if (same >= rarity) return 0;
  if (empty) return 1 + rarity * 0.2;
  return rarity > worst ? 0.4 + 0.2 * (rarity - worst) : 0;
}

function nearestTrail(state: MatchState, i: number, reach: number): number {
  let best = -1, bd = reach;
  const ship = state.ships[i];
  for (let j = 0; j < SHIPS; j++) {
    if (j === i) continue;
    const laid = state.ships[j].laid;
    for (let k = 0; k < laid.length; k += 6) {
      const d = apart(ship.pos, cellCentre(laid[k], P));
      if (d < bd) {
        bd = d;
        best = laid[k];
      }
    }
  }
  return best;
}

/** A loop out of its own water and back: a few points around a circle that touches home. */
function planLoop(state: MatchState, i: number, style: Style, rng: Rng): void {
  const ship = state.ships[i], c = ship.captain;
  const r = style.loop * (1 - 0.3 * Math.min(1, c.raids.value / 4) * c.raids.confidence);
  c.ring = [];
  c.li = 0;
  // the circle's centre is r out from here, on a side with open water
  const a0 = rngRange(rng, -PI, PI);
  tangentAt(ship.pos, a0, T);
  along(ship.pos, T, r, Q);
  if (!openAt(Q) || toEdge(state, Q) < r + 20) return;
  const spin = rngFloat(rng) < 0.5 ? -1 : 1, n = 6;
  tangentToward(Q, ship.pos, U);
  for (let k = 1; k <= n; k++) {
    const a = (spin * 2 * PI * k) / n;
    const p = v3();
    rotateTangent(Q, U, a, T);
    along(Q, T, r, p);
    if (!openAt(p) && !nearestOpen(p, p, 6)) continue;
    c.ring.push(p);
  }
}

function rotateTangent(p: V3, t: V3, a: number, out: V3): V3 {
  const sx = t.y * p.z - t.z * p.y, sy = t.z * p.x - t.x * p.z, sz = t.x * p.y - t.y * p.x;
  const c = dcos(a), s = dsin(a);
  return set(out, t.x * c + sx * s, t.y * c + sy * s, t.z * c + sz * s);
}

function roamGoal(state: MatchState, i: number, style: Style, rng: Rng): void {
  const ship = state.ships[i], c = ship.captain, calm = calmNow(state);
  for (let tries = 0; tries < 8; tries++) {
    tangentAt(ship.pos, rngRange(rng, -PI, PI), T);
    along(ship.pos, T, rngRange(rng, 60, 160), P);
    // drift toward the middle of the circle as it closes
    if (calm.r < 600) {
      const k = 0.4;
      normalize(set(P, P.x + (calm.at.x - P.x) * k, P.y + (calm.at.y - P.y) * k, P.z + (calm.at.z - P.z) * k));
    }
    if (openAt(P) && toEdge(state, P) > style.margin) {
      copy(c.goal, P);
      return;
    }
  }
  inward(ship.pos, calm.at, Math.max(0, calm.r - style.margin * 2), c.goal);
}

/** A point at most `r` from the centre, along the line from p toward it. */
const waitsOut = (c: Captain): boolean => c.storm.confidence >= BRAIN.waits.sure && c.storm.value >= BRAIN.waits.seconds;

/** The water `inset` metres inside the calm's edge on the way out to p, where a ship out in the Storm comes back in. */
function lieInWait(p: V3, inset: number, out: V3): V3 {
  tangentToward(VIEW.calm.at, p, T);
  along(VIEW.calm.at, T, Math.max(0, VIEW.calm.r - inset), out);
  if (!openAt(out)) nearestOpen(out, out, 20);
  return out;
}

function inward(p: V3, centre: V3, r: number, out: V3): V3 {
  const d = R * Math.sqrt(Math.max(0, 2 - 2 * dot(p, centre)));
  if (d <= r) return copy(out, p);
  tangentToward(centre, p, T);
  along(centre, T, r * 0.6, out);
  if (!openAt(out)) nearestOpen(out, out, 20);
  return out;
}

function away(p: V3, from: V3, d: number, out: V3): V3 {
  tangentToward(p, from, T);
  set(T, -T.x, -T.y, -T.z);
  along(p, T, d, out);
  if (!openAt(out)) nearestOpen(out, out, 20);
  return out;
}

function keepInside(state: MatchState, p: V3, style: Style): void {
  const calm = calmNow(state);
  if (toEdge(state, p) < style.margin) inward(p, calm.at, Math.max(0, calm.r - style.margin), p);
}

// ---------------------------------------------------------------- the helm, every tick

export function helm(state: MatchState, i: number, out: ShipInput): void {
  const ship = state.ships[i], c = ship.captain, style = styleOf(ship), rng = rngOf(state, i);
  out.fire = false;
  out.select = -1;
  out.swap = -1;
  out.drop = false;
  out.take = false;
  out.reload = false;
  out.gust = false;
  out.ability = false;
  out.dive = false;
  out.hail = -1;
  out.throttle = 1;
  out.steer = 0;

  if (ship.phase === PHASE.gale) {
    galeHelm(state, i, out);
    return;
  }
  if (ship.phase === PHASE.glide) {
    tangentToward(ship.pos, c.drop, T);
    out.steer = angleTo(ship.head, T, ship.pos);
    const d = apart(ship.pos, c.drop), reach = (GALE.glide * ship.alt) / GALE.fall;
    out.dive = d < reach * 0.35;
    return;
  }

  steerFor(state, i, out);
  aimAndFire(state, i, style, rng, out);
  useWhatItCarries(state, i, style, out);
  stuck(state, i, rng, out);
}

/** Leaves the Gale when it passes closest to the drop point it chose. */
function galeHelm(state: MatchState, i: number, out: ShipInput): void {
  const ship = state.ships[i], c = ship.captain;
  if (c.region < 0) return;
  const now = apart(ship.pos, c.drop);
  galeSeat(state, i, state.gale.t + 1, P, T);
  const soon = apart(P, c.drop), reach = (GALE.glide * GALE.height) / GALE.fall;
  out.dive = (soon > now && now < reach * 0.9) || now < GALE_SPEED * 2;
}

const WANT = v3();

function steerFor(state: MatchState, i: number, out: ShipInput): void {
  const ship = state.ships[i], c = ship.captain;
  if (c.mode === MODE.fight && c.foe >= 0) {
    fightCourse(state, i, WANT);
  } else copy(WANT, c.goal);
  // land in the way: follow a route
  const d = apart(ship.pos, WANT);
  let to: V3 = WANT;
  if (d > 12 && !clearLine(ship.pos, WANT, 6)) {
    c.repath -= TICK;
    if (c.path.length === 0 || c.repath <= 0 || apart(c.pathTo, WANT) > 30) {
      findPath(ship.pos, WANT, c.path, 4000);
      copy(c.pathTo, WANT);
      c.leg = Math.min(1, c.path.length - 1);
      c.repath = BRAIN.repath;
    }
    while (c.leg < c.path.length - 1 && apart(ship.pos, cellCentre(c.path[c.leg], P)) < 10) c.leg++;
    if (c.leg < c.path.length) {
      // look ahead along the route as far as the water is clear
      let k = c.leg;
      while (k + 1 < c.path.length && k < c.leg + 6 && clearLine(ship.pos, cellCentre(c.path[k + 1], Q), 6)) k++;
      to = cellCentre(c.path[k], P);
    }
  } else c.path.length = 0;
  tangentToward(ship.pos, to, T);
  let steer = angleTo(ship.head, T, ship.pos);
  // feel ahead for land, and for floes and columns standing in the water
  along(ship.pos, ship.head, 14 + ship.speed, Q);
  if (!clearAt(state, Q)) {
    tangentAt(ship.pos, 0, U);
    const left = probeSide(state, ship, -0.6), right = probeSide(state, ship, 0.6);
    if (left !== right) steer = left ? -0.9 : 0.9;
    else if (!left) steer = steer >= 0 ? 1.2 : -1.2;
  }
  out.steer = steer;
  // ease off to pick loot up, or to hold a position
  if ((c.mode === MODE.loot || c.mode === MODE.heal) && d < 25) out.throttle = 0.55;
  if (c.mode === MODE.heal && d < 15) out.throttle = 0.3;
}

const clearAt = (state: MatchState, p: V3): boolean => openAt(p) && !solidAt(state, p);

function probeSide(state: MatchState, ship: Ship, a: number): boolean {
  rotateTangent(ship.pos, ship.head, a, T);
  along(ship.pos, T, 16 + ship.speed, Q);
  return clearAt(state, Q);
}

/** In a fight: hold the selected weapon's preferred range, circling the foe. */
function fightCourse(state: MatchState, i: number, out: V3): void {
  const ship = state.ships[i], c = ship.captain, foe = state.ships[c.foe], style = styleOf(ship);
  const kind = ship.slots[ship.sel].kind;
  const pref = (BRAIN.pref[kind] ?? 80) * style.standoff;
  const d = apart(ship.pos, foe.pos);
  c.strafeT -= TICK;
  if (c.strafeT <= 0) {
    c.strafe = -c.strafe;
    c.strafeT = rngRange(rngOf(state, i), 4, 9);
  }
  tangentToward(foe.pos, ship.pos, T);
  // a point on the ring of radius pref round the foe, a little round from where it is now
  const swing = kind === ITEM.broadside ? 0.9 : 0.5;
  rotateTangent(foe.pos, T, c.strafe * swing, U);
  along(foe.pos, U, d < pref * 0.6 ? pref * 1.2 : pref, out);
  if (activeOf(ship) === 'ram' && ship.cooldown <= 0 && d < 45 && ship.hull > foe.hull) copy(out, foe.pos);
  if (!openAt(out)) nearestOpen(out, out, 10);
}

const LEAD = v3();

function aimAndFire(state: MatchState, i: number, style: Style, rng: Rng, out: ShipInput): void {
  const ship = state.ships[i], c = ship.captain, now = state.tick * TICK;
  void style;
  if (c.foe < 0 || ship.use >= 0) {
    copy(out.aim, ship.head);
    along(ship.pos, ship.head, 60, out.aim);
    out.aimY = 2;
    return;
  }
  const foe = state.ships[c.foe], target = c.target === -2 ? c.last : foe.pos;
  const d = apart(ship.pos, target);
  // the right weapon for the range
  if (c.swapT <= 0 && c.mode === MODE.fight) {
    const s = bestWeapon(ship, d);
    if (s >= 0 && s !== ship.sel) {
      out.select = s;
      c.swapT = 1.5;
      return;
    }
  }
  const it = ship.slots[ship.sel];
  if (!isWeapon(it.kind)) {
    const s = bestWeapon(ship, d);
    if (s >= 0) out.select = s;
    return;
  }
  const w = WEAPONS[it.kind];
  // lead the target by its velocity over the flight time, with a wandering error
  const flight = w.lob ? Math.max(0.9, Math.min(2.8, d / 70)) : d / w.speed;
  set(LEAD, target.x + (foe.vel.x * flight) / R, target.y + (foe.vel.y * flight) / R, target.z + (foe.vel.z * flight) / R);
  normalize(LEAD);
  c.errT -= TICK;
  if (c.errT <= 0) {
    c.errT = rngRange(rng, 0.6, 1.4);
    tangentAt(LEAD, rngRange(rng, -PI, PI), c.errTo);
    const k = rngFloat(rng);
    set(c.errTo, c.errTo.x * k, c.errTo.y * k, c.errTo.z * k);
  }
  const blend = Math.min(1, TICK * 2);
  set(c.err, c.err.x + (c.errTo.x - c.err.x) * blend, c.err.y + (c.errTo.y - c.err.y) * blend, c.err.z + (c.errTo.z - c.err.z) * blend);
  const miss = BRAIN.error * (1 - 0.8 * c.skill) * (c.gentle ? 2 : 1) * d;
  addScaled(out.aim, LEAD, c.err, miss / R);
  normalize(out.aim);
  out.aimY = c.skill > 0.7 && it.kind === ITEM.harpoon ? 13 : 2.5;
  // fire when in range, past the first moment's surprise, and not in a pause between bursts
  const range = rangeOf(ship, w);
  if (now < c.react || d > range * 0.95 || c.mode === MODE.loot && d > range * 0.6) return;
  if (c.burst > 0) {
    c.burst -= TICK;
    if (c.burst <= 0) c.burst = -rngRange(rng, 0.8, 2.2) * (c.gentle ? 2.5 : 1);
  } else if (c.burst < 0) {
    c.burst += TICK;
    if (c.burst >= 0) c.burst = rngRange(rng, 1.5, 4);
    return;
  } else c.burst = rngRange(rng, 1.5, 4);
  if (it.kind === ITEM.broadside) {
    tangentToward(ship.pos, target, T);
    const a = Math.abs(angleTo(ship.head, T, ship.pos));
    if (Math.abs(a - PI / 2) > 0.45) return;
  }
  out.fire = it.n > 0 || ship.reload <= 0;
}

/** The weapon slot that suits this range best, preferring one that's loaded. */
function bestWeapon(ship: Ship, d: number): number {
  let best = -1, bs = -1e9;
  for (let s = 0; s < SLOTS; s++) {
    const it = ship.slots[s];
    if (!isWeapon(it.kind)) continue;
    const w = WEAPONS[it.kind], pref = BRAIN.pref[it.kind] ?? 80;
    let score = it.rarity * 0.15 - Math.abs(d - pref) / Math.max(pref, 40);
    if (d > rangeOf(ship, w)) score -= 2;
    if (it.n <= 0) score -= 0.6;
    if (s === ship.sel) score += 0.2;
    if (score > bs) {
      bs = score;
      best = s;
    }
  }
  return best;
}

function useWhatItCarries(state: MatchState, i: number, style: Style, out: ShipInput): void {
  const ship = state.ships[i], c = ship.captain;
  // consumables
  if (c.mode === MODE.heal && ship.use < 0) {
    const s = healSlot(ship);
    if (s >= 0) {
      if (ship.sel !== s) out.select = s;
      else out.fire = true;
    }
  }
  if (c.mode !== MODE.heal && ship.use < 0 && isUse(ship.slots[ship.sel].kind) && c.swapT <= 0) {
    const s = bestWeapon(ship, c.foe >= 0 ? apart(ship.pos, state.ships[c.foe].pos) : 100);
    if (s >= 0) out.select = s;
  }
  // a full hotbar: drop the worst weapon for better loot in reach
  if (c.mode === MODE.loot && c.target >= 0) {
    const l = state.loot.find((x) => x.id === c.target);
    if (l && apart(ship.pos, l.at) < 9 && roomFor(ship, l.item) < 0 && isWeapon(l.item.kind) && weaponWorth(ship, l.item.kind, l.item.rarity) > 0) {
      let worst = -1;
      for (let s = 0; s < SLOTS; s++) {
        const it = ship.slots[s];
        if (isWeapon(it.kind) && (worst < 0 || it.rarity < ship.slots[worst].rarity)) worst = s;
      }
      if (worst >= 0 && worst !== ship.sel) out.select = worst;
      else out.take = true;
    }
  }
  // the gust: to close in, to run, or to get back inside the circle
  const fleeing = c.mode === MODE.flee || c.mode === MODE.storm;
  if (ship.gusts > 0 && ship.boost <= 0 && ship.use < 0) {
    if ((fleeing && (ship.gusts === 2 || ship.hull < 40)) || (c.mode === MODE.fight && apart(ship.pos, c.goal) > 120)) out.gust = true;
  }
  // the gull, when it has coins to spare and nothing on
  if (c.foe < 0 && (state.tick + i) % 90 === 0) {
    for (let tier = PARCELS.length - 1; tier >= 0; tier--) {
      if (canCall(ship, tier) && ship.coins - PARCELS[tier].cost >= style.thrift) {
        out.hail = tier;
        break;
      }
    }
  }
  // the active ability
  if (ship.cooldown <= 0 && ship.phase === PHASE.sea) out.ability = abilityNow(state, i, style);
}

function abilityNow(state: MatchState, i: number, style: Style): boolean {
  const ship = state.ships[i], c = ship.captain;
  const foe = c.foe >= 0 ? state.ships[c.foe] : null, d = foe ? apart(ship.pos, foe.pos) : 1e9;
  switch (activeOf(ship)) {
    case 'repair': return ship.hull < 70;
    case 'smokeScreen': return c.mode === MODE.flee && d < 110;
    case 'ram': {
      if (!foe || d > 40 || c.mode !== MODE.fight) return false;
      tangentToward(ship.pos, foe.pos, T);
      return Math.abs(angleTo(ship.head, T, ship.pos)) < 0.3;
    }
    case 'reveal': return c.foe < 0 && c.since > 10 && style.fight > 0.4;
    case 'hardTurn': return (c.mode === MODE.flee && d < 60) || c.stuckT > 2;
    case 'decoy': return c.mode === MODE.flee && d < 140;
    case 'wave': return d < 30;
    case 'driftMine': {
      if (!foe || d > 70) return false;
      tangentToward(ship.pos, foe.pos, T);
      return Math.abs(angleTo(ship.head, T, ship.pos)) > 2.2;
    }
    default: return false;
  }
}

/** Backs off land it is stuck against. */
function stuck(state: MatchState, i: number, rng: Rng, out: ShipInput): void {
  const ship = state.ships[i], c = ship.captain;
  if (c.backT > 0) {
    c.backT -= TICK;
    out.steer = c.strafe * 2.4;
    out.throttle = 0.6;
    return;
  }
  if (ship.speed < 1.5 && ship.flip <= 0 && ship.use < 0) c.stuckT += TICK;
  else c.stuckT = Math.max(0, c.stuckT - TICK * 2);
  if (c.stuckT > 2.5) {
    c.backT = rngRange(rng, 1, 2.2);
    c.stuckT = 0;
    c.path.length = 0;
  }
}

export const modeName = (m: number): string => MODE_NAMES[m] ?? 'roam';

// A captain's mind. Every few ticks it thinks: pick a region and dive into it, then at sea weigh the Storm,
// its hull, the ships in sight, loot, the gull and its own water, and settle on a mode and a goal. Every tick
// it steers for the goal (by A* over the nav grid when land is in the way), aims, fires and uses what it carries.
import { canCall } from '../economy.ts';
import { aground, currentAt, seaLevel, seaLevelAt, solidAt } from '../environment.ts';
import type { ShipInput } from '../input.ts';
import { PI, addScaled, dcos, dot, dsin, length, normalize, rngFloat, rngInt, rngRange, set, v3, type Rng, type V3 } from '../math.ts';
import { cellCentre, clearLine, findPath, nearestOpen, openAt } from '../nav.ts';
import { GALE_SPEED, galeSeat } from '../opening.ts';
import { activeOf, hasPerk } from '../perks.ts';
import { rangeOf } from '../combat.ts';
import { roomFor, useful } from '../items.ts';
import { coverNear, dangerAt, escapeFrom, newDanger, rewardNear } from '../regionEvents.ts';
import { draftOf, offWind, pointOfSail } from '../sailing.ts';
import { R, apart, along, angleTo, tangentAt, tangentToward } from '../sphere.ts';
import { PHASE, PLAYER, SHIPS, STREAM, TICK, WHALE_STATE, copy, type Captain, type MatchState, type Ship } from '../state.ts';
import { calmNow, inStorm, stormPhase, stormView, newStormView, toEdge } from '../storm.ts';
import { GALE, ITEM, LOOT, PARCELS, PERKS, REGION_EVENT, SHIP, SLOTS, WEAPONS, WEATHER_KIND, WHALE, ZONES, isUse, isWeapon } from '../tables.ts';
import { atHome, holderOf, holdsAt, landmarkHold } from '../territory.ts';
import { seen, SEEN } from '../visibility.ts';
import { vigour } from '../weather.ts';
import { newWind, windAt } from '../wind.ts';
import { CENTRES, LANDMARKS, REGIONS, heightAt } from '../world/index.ts';
import { styleOf, type Style } from './temperaments.ts';

export const MODE = { gale: 0, glide: 1, roam: 2, loot: 3, fight: 4, flee: 5, storm: 6, heal: 7, claim: 8, raid: 9, event: 10, shelter: 11, landmark: 12 } as const;
export const MODE_NAMES = ['gale', 'glide', 'roam', 'loot', 'fight', 'flee', 'storm', 'heal', 'claim', 'raid', 'event', 'shelter', 'landmark'] as const;

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
  /**
   * Leaving the Gale: hold on while this many ships that have already left are within `near` metres; everyone still
   * aboard starts leaving this many seconds before it blows out.
   */
  spread: { most: 3, near: 100, gap: 2.5 },
  /**
   * Backing off a bank: a ship making less than `crawl` m/s is stuck. It turns hard toward the open side at about `rate`
   * radians a second, for at least `least` seconds and at most `most`, and holds the turn until its course lies within
   * `slack` of half a turn ahead of it. One aground and dragging slower than `drag` m/s for `wade` seconds, or crawling
   * with shoal water `bow` metres ahead, makes instead for the deepest water `sound` metres round it, for up to `most`
   * seconds more.
   */
  backOff: { crawl: 1, rate: 0.65, least: 1, most: 4.5, slack: 0.6, drag: 2.5, wade: 1, bow: 4, sound: 14 },
  /** Seconds it holds a turn off land ahead once the way clears. */
  avoid: 0.8,
  /**
   * Early in a match a captain would sooner loot than fight: its will to fight falls by this much in each Storm phase, and
   * while it does, it holds its fire outside a fight it chose.
   */
  restraint: [0.5, 0.5, 0.45, 0.35, 0.25, 0.1, 0, 0],
  /** While it holds back, metres off at which it lets a ship sailing away from it go. */
  letGo: 90,
  /** With this many ships or fewer afloat, a captain holds back this much more, and leaves the Storm to bring on the end. */
  lastFew: { ships: 3, more: 0.4 },
  /** A captain on the run makes for an event's fog bank this far off. */
  cover: 150,
} as const;

const rngOf = (state: MatchState, i: number): Rng => state.rng[STREAM.captains + i];
/** The sea level the captain thinking now plans by (see levelFor): goals it picks lie in water deep enough at it. */
let tide = 0;
/** The turn, in radians, the ship steering now would make to face its course, before it feels for land ahead. */
let course = 0;
const PICKS = new Int32Array(REGIONS.length);
const P = v3(), Q = v3(), T = v3(), U = v3(), VIEW = newStormView();

// ---------------------------------------------------------------- thinking

export function think(state: MatchState, i: number): void {
  const ship = state.ships[i], c = ship.captain;
  if (ship.phase === PHASE.sunk) return;
  c.think--;
  if (c.think > 0) return;
  c.think = BRAIN.every;
  tide = levelFor(state);
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
  decide(state, i, style, rng);
  // whatever it settled on, it keeps out of what a region's event is bringing down
  // and out of thunder, ash and a rising whale
  if (c.mode !== MODE.storm && c.mode !== MODE.event && (dangerAt(state, c.goal, 0, DANGER) || foulAt(state, c.goal, 0))) {
    escapeFrom(DANGER, c.goal, REGION_EVENT.berth, c.goal);
    if (!openAt(c.goal, tide)) nearestOpen(c.goal, c.goal, 20, tide);
  }
  c.lean = leanFor(state, i);
}

const DANGER = newDanger();

function decide(state: MatchState, i: number, style: Style, rng: Rng): void {
  const ship = state.ships[i], c = ship.captain;

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

  // then out from under whatever a region's event is about to bring down on it: a falling spire, the rockfall, the
  // whale, Cinder Peak's bombs, the bloom, the Maelstrom wound up
  if (dangerAt(state, ship.pos, REGION_EVENT.berth * 0.5, DANGER)) {
    setMode(c, MODE.event);
    wayOut(state, ship.pos, style, c.goal);
    return;
  }

  // and out of a thunderstorm or an ash fall, and from over a whale rising to breach
  if (foulAt(state, ship.pos, 0)) {
    setMode(c, MODE.shelter);
    wayOut(state, ship.pos, style, c.goal);
    return;
  }

  // 2. heal when it is safe to
  const foeD = c.foe >= 0 ? apart(ship.pos, state.ships[c.foe].pos) : 1e9;
  // (not with a foe close by: lying still to mend under its guns only gets it sunk, so it runs first)
  if ((ship.hull < style.mend || ship.shield < 25) && healSlot(ship) >= 0 && foeD > 70) {
    setMode(c, MODE.heal);
    // where it is, unless the tide is leaving it there
    if (!openAt(ship.pos, tide) || !nearestOpen(ship.pos, c.goal, 10, tide)) copy(c.goal, ship.pos);
    if (c.foe >= 0) away(ship.pos, state.ships[c.foe].pos, 60, c.goal);
    return;
  }

  // 3. run from a fight it is losing
  if (c.foe >= 0 && ship.hull < style.run * (c.gentle ? 1.3 : 1) && foeD < 140) {
    setMode(c, MODE.flee);
    // into a fog bank an event has thrown over the sea, when there is one near, else just away
    if (coverNear(state, ship.pos, BRAIN.cover, U) && toEdge(state, U) > style.margin) {
      copy(c.goal, U);
      if (!openAt(c.goal, tide)) nearestOpen(c.goal, c.goal, 20, tide);
    } else away(ship.pos, state.ships[c.foe].pos, 120, c.goal);
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

  // a captain going round a landmark sees it through, though loot or a rival's trail turns up; the trail it lays
  // wouldn't last for the detour
  const rounding = c.mode === MODE.landmark && c.li < c.ring.length;

  // 6. loot worth having
  const loot = rounding ? -1 : bestLoot(state, i, style);
  if (loot >= 0) {
    setMode(c, MODE.loot);
    c.target = state.loot[loot].id;
    copy(c.goal, state.loot[loot].at);
    // loot lying in the shallows it takes from the edge of the water deep enough to reach it by
    if (!openAt(c.goal, tide)) nearestOpen(c.goal, c.goal, 1, tide);
    return;
  }

  // 6b. what a region's event offers: a lane in spate to ride, the clam bed's pearls, the sea caves' hoard (inside the calm)
  if (rewardNear(state, ship.pos, REGION_EVENT.reach, U) >= 0 && toEdge(state, U) > style.margin) {
    setMode(c, MODE.event);
    copy(c.goal, U);
    if (!openAt(c.goal, tide)) nearestOpen(c.goal, c.goal, 6, tide);
    return;
  }

  // 7. raid a rival's trail
  if (style.raid > 0.4 && !c.gentle && !rounding) {
    const cell = nearestTrail(state, i, 160);
    if (cell >= 0) {
      setMode(c, MODE.raid);
      cellCentre(cell, c.goal);
      return;
    }
  }

  // 8. claim water: sail a loop out from home and back
  if ((c.mode === MODE.claim || c.mode === MODE.landmark) && c.li < c.ring.length) {
    const p = c.ring[c.li];
    if (apart(ship.pos, p) < (c.mode === MODE.landmark ? 12 : 18)) c.li++;
    if (c.li < c.ring.length) {
      copy(c.goal, c.ring[c.li]);
      return;
    }
  }
  // a landmark near enough to sail round, for the captains who go for them, from home water or by way of it
  if (c.claimT <= 0 && edge > style.loop * 2 && rngFloat(rng) < style.marks && markLoop(state, i, style)) {
    c.claimT = rngRange(rng, 12, 30);
    setMode(c, MODE.landmark);
    copy(c.goal, c.ring[0]);
    return;
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
const inFirst = (state: MatchState, r: number): boolean => apart(CENTRES[r], state.storm.centres[0]) <= ZONES[0] - 120;

function chooseRegion(state: MatchState, i: number, rng: Rng): void {
  const ship = state.ships[i], c = ship.captain, style = styleOf(ship);
  // a region whose heart is inside the first safe circle
  let r = rngInt(rng, REGIONS.length);
  for (let k = 0; k < 4 && !inFirst(state, r); k++) r = rngInt(rng, REGIONS.length);
  const knows = c.dive.confidence >= 0.4 && !state.ships[PLAYER].captain.on;
  if (knows && !c.gentle && style.fight >= 0.55 && rngFloat(rng) < 0.6 + 0.4 * c.dive.confidence) r = c.dive.value;
  else if (knows && (c.gentle || style.fight < 0.35) && r === c.dive.value) r = (r + 1 + rngInt(rng, REGIONS.length - 1)) % REGIONS.length;
  // the fleet spreads out: no region takes more than a quarter of the captains' picks, so a full one sends this
  // captain to the least picked region in the first circle instead
  let captains = 0;
  const picks = PICKS.fill(0);
  for (let j = 0; j < SHIPS; j++) {
    const o = state.ships[j].captain;
    if (!o.on) continue;
    captains++;
    if (j !== i && o.region >= 0) picks[o.region]++;
  }
  if (picks[r] >= Math.max(1, Math.floor(captains / 4))) {
    const from = rngInt(rng, REGIONS.length);
    let best = -1;
    for (let k = 0; k < REGIONS.length; k++) {
      const q = (from + k) % REGIONS.length;
      if (best < 0 || (inFirst(state, q) && !inFirst(state, best)) || (inFirst(state, q) === inFirst(state, best) && picks[q] < picks[best])) best = q;
    }
    r = best;
  }
  c.region = r;
  // the captains who go for landmarks land near the region's own, to loop it from home; the others anywhere near the
  // middle of the region
  const mark = rngFloat(rng) < style.marks, from = mark ? landmarkHold(r) : CENTRES[r];
  tangentAt(from, rngRange(rng, -PI, PI), T);
  along(from, T, mark ? rngRange(rng, 50, 110) : rngRange(rng, 60, 180), c.drop);
  if (!openAt(c.drop, tide)) nearestOpen(c.drop, c.drop, 30, tide);
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
  if (shotBy(state, ship, c.foe, 120)) will += 0.4;
  // a captain who has learnt where the player's hull breaks presses the attack below it
  if (c.foe === PLAYER && c.run.confidence > 0.3 && foe.hull < c.run.value + 10) will += 0.3;
  if (c.foe === PLAYER && c.gentle) will -= 0.3;
  // early on it would sooner loot than fight, and lets a ship running from it go once she is past its guns' best range
  const restraint = holdBack(state);
  if (restraint > 0 && d > BRAIN.letGo && dot(foe.head, addScaled(P, foe.pos, ship.pos, -1)) > 0) return false;
  will -= restraint;
  return will > 0.35 || d < 35 - 50 * restraint;
}

/** Whether ship j has shot this one in the last `ticks`: a bump from a ship sailing into it is no attack. */
const shotBy = (state: MatchState, ship: Ship, j: number, ticks: number): boolean => ship.lastBy === j && state.tick - ship.lastHit < ticks && isWeapon(ship.cause);

/** How much a captain holds back from a fight now: by the Storm's phase, and more among the last few afloat. */
function holdBack(state: MatchState): number {
  const by = BRAIN.restraint[stormPhase(state)];
  if (by <= 0) return 0;
  let afloat = 0;
  for (let j = 0; j < SHIPS; j++) if (state.ships[j].phase !== PHASE.sunk) afloat++;
  return afloat <= BRAIN.lastFew.ships ? by + BRAIN.lastFew.more : by;
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
    // nor loot in water too shallow to come within reach of it
    if (!openAt(l.at, tide) && !(nearestOpen(l.at, P, 1, tide) && apart(P, l.at) < LOOT.reach - 1.5)) continue;
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
  if (!openAt(Q, tide) || toEdge(state, Q) < r + 20) return;
  const spin = rngFloat(rng) < 0.5 ? -1 : 1, n = 6;
  tangentToward(Q, ship.pos, U);
  for (let k = 1; k <= n; k++) {
    const a = (spin * 2 * PI * k) / n;
    const p = v3();
    rotateTangent(Q, U, a, T);
    along(Q, T, r, p);
    if (!openAt(p, tide) && !nearestOpen(p, p, 6, tide)) continue;
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
    if (openAt(P, tide) && toEdge(state, P) > style.margin) {
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
  if (!openAt(out, tide)) nearestOpen(out, out, 20, tide);
  return out;
}

function inward(p: V3, centre: V3, r: number, out: V3): V3 {
  const d = R * Math.sqrt(Math.max(0, 2 - 2 * dot(p, centre)));
  if (d <= r) return copy(out, p);
  tangentToward(centre, p, T);
  along(centre, T, r * 0.6, out);
  if (!openAt(out, tide)) nearestOpen(out, out, 20, tide);
  return out;
}

function away(p: V3, from: V3, d: number, out: V3): V3 {
  tangentToward(p, from, T);
  set(T, -T.x, -T.y, -T.z);
  along(p, T, d, out);
  if (!openAt(out, tide)) nearestOpen(out, out, 20, tide);
  return out;
}

/**
 * Out of DANGER from p to open water inside the calm: straight out if that is inside, else swung round the danger a
 * little further each way until it is (pulling it in toward the calm's centre only would lead back into the danger).
 * Where the edge of the danger is dry land, as Cinder Peak's flanks are, it looks on out to the water beyond.
 */
function wayOut(state: MatchState, p: V3, style: Style, out: V3): void {
  for (let k = 0; k <= 12; k++) {
    const swing = (k % 2 ? 1 : -1) * Math.ceil(k / 2) * (PI / 12);
    for (let m = 0; m <= 60 && (m === 0 || !openAt(out, tide)); m += 10) escapeFrom(DANGER, p, REGION_EVENT.berth + m, out, swing);
    if (toEdge(state, out) >= style.margin && openAt(out, tide)) return;
  }
  escapeFrom(DANGER, p, REGION_EVENT.berth, out);
  keepInside(state, out, style);
  if (!openAt(out, tide)) nearestOpen(out, out, 20, tide);
}

function keepInside(state: MatchState, p: V3, style: Style): void {
  const calm = calmNow(state);
  if (toEdge(state, p) < style.margin) inward(p, calm.at, Math.max(0, calm.r - style.margin), p);
}

/** Metres round the spot a rising whale breaches at that a captain keeps clear of: the lift's reach and a margin. */
const BREACH = WHALE.lift + 15;

/**
 * Whether p is within `pad` of a thunderstorm or an ash fall at more than a third of its strength, or of the spot a
 * whale is rising to breach at, with that in DANGER, as a region event's danger is, so the same ways out serve.
 */
function foulAt(state: MatchState, p: V3, pad: number): boolean {
  const w = state.whale;
  if (w.state === WHALE_STATE.rising && apart(p, w.spot) < BREACH + pad) return foul(w.spot, BREACH);
  for (const s of state.weather) {
    if ((s.kind !== WEATHER_KIND.thunder && s.kind !== WEATHER_KIND.ash) || vigour(s) < 0.35) continue;
    if (apart(p, s.at) < s.r + pad) return foul(s.at, s.r);
  }
  return false;
}

function foul(at: V3, r: number): boolean {
  DANGER.region = -1;
  copy(DANGER.at, at);
  DANGER.r = r;
  return true;
}

/**
 * How far from its home water a captain looks for a landmark to take, the longest trip out, round it and home that fits
 * in a trail, and how far it goes back to the water it landed in to set out from.
 */
const MARK_REACH = 260;
const MARK_TRIP = 560;
const MARK_HOME = 360;

/**
 * A loop round the hold of the nearest landmark it doesn't hold, well inside the calm and out of any race too strong to
 * sail round in (the Eye's vortex): eight points round it at the first water out from it on each bearing, from the one
 * nearest home all the way round to it again, then home. Home is where it is if that's its own water, else the spot it
 * landed on if it still holds it, sailed to first. None if the trip wouldn't fit in a trail.
 */
function markLoop(state: MatchState, i: number, style: Style): boolean {
  const ship = state.ships[i], c = ship.captain;
  const out = !atHome(state, i);
  if (out && (!holdsAt(state, i, c.drop) || apart(ship.pos, c.drop) > MARK_HOME)) return false;
  const home = copy(HOME, out ? c.drop : ship.pos);
  let best = -1, near = MARK_REACH;
  for (let r = 0; r < LANDMARKS.length; r++) {
    const h = landmarkHold(r), d = apart(home, h);
    if (d >= near || holderOf(state, r) === i || toEdge(state, h) < style.margin + 40) continue;
    if (length(currentAt(state, h, U)) > 5) continue;
    best = r;
    near = d;
  }
  if (best < 0) return false;
  const h = landmarkHold(best), spin = i & 1 ? 1 : -1;
  c.ring = [];
  c.li = 0;
  if (out) c.ring.push(copy(v3(), home));
  tangentToward(h, home, U);
  let trip = 2 * near;
  for (let k = 0; k <= 8; k++) {
    rotateTangent(h, U, (spin * 2 * PI * k) / 8, T);
    let r = 16;
    while (r <= 160 && !openAt(along(h, T, r, Q), tide)) r += 6;
    if (r > 160) continue;
    // a little further out where there is water, to clear the shore
    if (openAt(along(h, T, r + 6, P), tide)) copy(Q, P);
    if (c.ring.length > 0) trip += apart(c.ring[c.ring.length - 1], Q);
    c.ring.push(copy(v3(), Q));
  }
  if (c.ring.length < (out ? 7 : 6) || trip > MARK_TRIP) {
    c.ring = [];
    return false;
  }
  c.ring.push(copy(v3(), home));
  return true;
}
const HOME = v3();

/** Leans tried off the straight course to the goal, radians, and what one has to gain over it, m/s made good. */
const LEANS = [-0.6, -0.3, 0.3, 0.6];
const LEAN_GAIN = 0.8;
const WIND = newWind(), FLOW = v3();

/**
 * How far off the straight line to its goal a captain sails, to ride a current going its way or to sail a better
 * point of the wind: the lean that makes most speed good toward the goal, if it beats the straight course by enough.
 * Not in a fight, on a route round land, or close to the goal.
 */
function leanFor(state: MatchState, i: number): number {
  const ship = state.ships[i], c = ship.captain;
  if (c.mode === MODE.fight || c.mode === MODE.gale || c.mode === MODE.glide || c.path.length > 0 || apart(ship.pos, c.goal) < 60) return 0;
  windAt(state, ship.pos, WIND);
  tangentToward(ship.pos, c.goal, U);
  const straight = madeGood(state, ship.pos, 0);
  let best = 0, most = straight + LEAN_GAIN;
  for (const a of LEANS) {
    const m = madeGood(state, ship.pos, a);
    if (m > most) [best, most] = [a, m];
  }
  return best;
}

/** Speed made good toward U (the goal's bearing) sailing `a` off it, in the current 35 m out that way. */
function madeGood(state: MatchState, p: V3, a: number): number {
  rotateTangent(p, U, a, T);
  along(p, T, 35, Q);
  if (!openAt(Q, tide)) return -Infinity;
  currentAt(state, Q, FLOW);
  return SHIP.top * pointOfSail(offWind(T, WIND.v)) * dcos(a) + dot(FLOW, U);
}

// ---------------------------------------------------------------- the helm, every tick

export function helm(state: MatchState, i: number, out: ShipInput): void {
  const ship = state.ships[i], c = ship.captain, style = styleOf(ship), rng = rngOf(state, i);
  tide = levelFor(state);
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

/**
 * Leaves the Gale when it passes closest to the drop point it chose, or as the Gale is about to blow out. The fleet
 * spreads out: once bound to leave, it holds on while ships that have just left crowd round it.
 */
function galeHelm(state: MatchState, i: number, out: ShipInput): void {
  const ship = state.ships[i], c = ship.captain;
  if (c.region < 0) return;
  const now = apart(ship.pos, c.drop);
  galeSeat(state, i, state.gale.t + 1, P, T);
  const soon = apart(P, c.drop), reach = (GALE.glide * GALE.height) / GALE.fall;
  if ((soon > now && now < reach * 0.9) || now < GALE_SPEED * 2 || state.gale.t > GALE.time - BRAIN.spread.gap * lateRiders(state)) c.bound = true;
  out.dive = c.bound && crowd(state, i) < BRAIN.spread.most;
  // the captains after it this tick count it as gone
  if (out.dive) c.mode = MODE.glide;
}

const END = v3(), BEFORE = v3(), EH = v3();

/**
 * Captains still riding whose drop the Gale is still closing on as it blows out. Each needs about BRAIN.spread.gap
 * seconds to itself to leave without a crowd, so they start taking turns that long before the end.
 */
function lateRiders(state: MatchState): number {
  let n = 0;
  for (let j = 0; j < SHIPS; j++) {
    const c = state.ships[j].captain;
    if (state.ships[j].phase !== PHASE.gale || !c.on || c.region < 0 || c.mode === MODE.glide) continue;
    galeSeat(state, j, GALE.time, END, EH);
    galeSeat(state, j, GALE.time - 1, BEFORE, EH);
    if (apart(END, c.drop) < apart(BEFORE, c.drop)) n++;
  }
  return n;
}

/** Ships that have left the Gale, or are leaving it this tick, within BRAIN.spread.near metres of ship i. */
function crowd(state: MatchState, i: number): number {
  let n = 0;
  for (let j = 0; j < SHIPS; j++) {
    const o = state.ships[j];
    const gone = o.phase === PHASE.glide || o.phase === PHASE.sea || (o.phase === PHASE.gale && o.captain.on && o.captain.mode === MODE.glide);
    if (j !== i && gone && apart(o.pos, state.ships[i].pos) < BRAIN.spread.near) n++;
  }
  return n;
}

const WANT = v3();

/** Seconds of tide a captain looks ahead: it routes through water deep enough now and still deep enough then. */
const TIDE_AHEAD = 15;
const levelFor = (state: MatchState): number => Math.min(seaLevel(state), seaLevelAt(state.tick * TICK + TIDE_AHEAD));

function steerFor(state: MatchState, i: number, out: ShipInput): void {
  const ship = state.ships[i], c = ship.captain, level = tide;
  if (c.mode === MODE.fight && c.foe >= 0) {
    fightCourse(state, i, WANT);
  } else copy(WANT, c.goal);
  // land in the way: follow a route. A line from shallows isn't to be trusted, for it starts past the ground the ship is
  // on: a bar there may lie between it and the water beyond, so it works out to open water by the route first.
  const d = apart(ship.pos, WANT), shoaled = !openAt(ship.pos, level);
  let to: V3 = WANT;
  if (d > 12 && (shoaled || !clearLine(ship.pos, WANT, 6, level))) {
    c.repath -= TICK;
    if (c.path.length === 0 || c.repath <= 0 || apart(c.pathTo, WANT) > 30) {
      findPath(ship.pos, WANT, c.path, 4000, level);
      copy(c.pathTo, WANT);
      c.leg = Math.min(1, c.path.length - 1);
      c.repath = BRAIN.repath;
    }
    while (c.leg < c.path.length - 1 && apart(ship.pos, cellCentre(c.path[c.leg], P)) < 10) c.leg++;
    if (c.leg < c.path.length) {
      // look ahead along the route as far as the water is clear
      let k = c.leg;
      while (!shoaled && k + 1 < c.path.length && k < c.leg + 6 && clearLine(ship.pos, cellCentre(c.path[k + 1], Q), 6, level)) k++;
      to = cellCentre(c.path[k], P);
    }
  } else c.path.length = 0;
  tangentToward(ship.pos, to, T);
  if (c.lean !== 0 && c.path.length === 0 && c.mode !== MODE.fight) rotateTangent(ship.pos, T, c.lean, T);
  let steer = angleTo(ship.head, T, ship.pos);
  course = steer;
  // feel ahead along its course for land, and for floes and columns standing in the water; not along its heading, for
  // a ship coming round in a narrow channel would only ever feel the bank
  along(ship.pos, T, Math.min(14 + ship.speed, apart(ship.pos, to)), Q);
  if (!clearAt(state, Q, level)) {
    const left = probeSide(state, ship, -0.6, level), right = probeSide(state, ship, 0.6, level);
    // it keeps turning off the way it began to, unless only the other side lies open
    let way = Math.sign(c.avoid);
    if (way === 0 || (way < 0 ? !left && right : !right && left)) way = left !== right ? (left ? -1 : 1) : left ? 0 : steer >= 0 ? 1 : -1;
    if (way !== 0) {
      steer = way * (left !== right ? 0.9 : 1.2);
      c.avoid = way * BRAIN.avoid;
    }
  } else if (c.avoid !== 0) {
    // and holds the turn a moment once the way ahead clears, rather than swing straight back at what it turned from
    if (Math.sign(steer) !== Math.sign(c.avoid)) steer = Math.sign(c.avoid) * 0.9;
    c.avoid = c.avoid > 0 ? Math.max(0, c.avoid - TICK) : Math.min(0, c.avoid + TICK);
  }
  out.steer = steer;
  // ease off to pick loot up, or to hold a position
  if ((c.mode === MODE.loot || c.mode === MODE.heal) && d < 25) out.throttle = 0.55;
  if (c.mode === MODE.heal && d < 15) out.throttle = 0.3;
}

const clearAt = (state: MatchState, p: V3, level: number): boolean => openAt(p, level) && !solidAt(state, p);

/**
 * The way off the ground for a ship aground, as a turn from her heading: radians, to starboard positive. It goes by the
 * highest ground she would cross in the first `sound` metres each way, then by how deep the water is at the end of it,
 * so she never makes for deep water over a spit of land.
 */
function deepest(ship: Ship): number {
  let best = 0, low = Infinity;
  for (let k = -7; k <= 8; k++) {
    rotateTangent(ship.pos, ship.head, (k * PI) / 8, T);
    let top = -Infinity, end = 0;
    for (let m = 2; m <= BRAIN.backOff.sound; m += 3) top = Math.max(top, end = heightAt(along(ship.pos, T, m, Q)));
    const score = top + 0.25 * end;
    if (score < low) [low, best] = [score, (k * PI) / 8];
  }
  return best;
}

function probeSide(state: MatchState, ship: Ship, a: number, level: number): boolean {
  rotateTangent(ship.pos, ship.head, a, T);
  along(ship.pos, T, 16 + ship.speed, Q);
  return clearAt(state, Q, level);
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
  if (!openAt(out, tide)) nearestOpen(out, out, 10, tide);
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
    // healing, it holds what it heals with
    if (c.mode === MODE.heal) return;
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
  // while it holds back it fires only in a fight it chose, or back at a ship close by that has just shot it; not at one
  // that only bumped it, nor after one that has broken off, or the two would trade shots all the way to the bottom
  if (c.mode !== MODE.fight && holdBack(state) > 0 && !(shotBy(state, ship, c.foe, 150) && d < BRAIN.letGo)) return;
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

/**
 * Backs off land it is stuck against. It goes by how far it really sailed last tick, not by its speed: a hull pressed
 * into a bank or a floe keeps its way on while hardly moving.
 */
function stuck(state: MatchState, i: number, rng: Rng, out: ShipInput): void {
  const ship = state.ships[i], c = ship.captain;
  if (c.backT > 0) {
    c.backT -= TICK;
    out.steer = c.strafe * 2.4;
    out.throttle = 0.6;
    return;
  }
  const crawling = apart(ship.was, ship.pos) < BRAIN.backOff.crawl * TICK, free = ship.flip <= 0 && ship.use < 0;
  // aground and dragging at a grounded ship's pace, or held up by shoal water off her bow (as in a pool a falling tide
  // has closed round her), it stops making for its mark across the bar and works off it the way the water deepens,
  // mending or not; the back-off clock runs below zero for the time it spends so
  const { drag, wade, most, bow } = BRAIN.backOff, draft = draftOf(ship);
  const held = (aground(state, ship.pos, draft) && ship.speed < drag) || (crawling && aground(state, along(ship.pos, ship.head, bow, Q), draft));
  if (held && ship.flip <= 0 && c.backT > -(wade + most)) {
    c.backT -= TICK;
    if (c.backT > -wade) return;
    if (c.backT + TICK > -wade) c.path.length = 0;
    // (with the way off astern it holds the turn it is in, or it would swing from one side to the other)
    const deep = deepest(ship);
    out.steer = Math.abs(deep) > PI / 2 && ship.rate * deep < 0 ? Math.sign(ship.rate) * 2.4 : Math.max(-2.4, Math.min(2.4, 2 * deep));
    out.throttle = 0.6;
    return;
  }
  // and if that doesn't float it, it backs off as from a bank
  const gaveUp = c.backT <= -(wade + most);
  c.backT = 0;
  if ((crawling || gaveUp) && free) c.stuckT += gaveUp ? 2.5 : TICK;
  else c.stuckT = Math.max(0, c.stuckT - TICK * 2);
  if (c.stuckT > 2.5) {
    c.stuckT = 0;
    c.path.length = 0;
    // it turns off toward whichever side lies open, or on the way to its course when both do
    const left = probeSide(state, ship, -1.2, tide), right = probeSide(state, ship, 1.2, tide);
    c.strafe = left !== right ? (left ? -1 : 1) : course >= 0 ? 1 : -1;
    // and keeps turning until its course lies less than half a turn on, so it doesn't swing back across the bank
    const { rate, least, slack } = BRAIN.backOff;
    const round = c.strafe * course >= 0 ? Math.abs(course) : 2 * PI - Math.abs(course);
    c.backT = Math.min(most, Math.max(rngRange(rng, least, least * 2.2), (round - PI + slack) / rate));
  }
}

export const modeName = (m: number): string => MODE_NAMES[m] ?? 'roam';

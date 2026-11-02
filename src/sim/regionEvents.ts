// The regions' own events: once a match each of the sixteen regions does what its water is known for, one after
// another, the far side of the world from the Storm's end first. Each is announced a few seconds ahead (regionWarn),
// runs (regionStart … regionEnd), and is gone: the Ice Crown's floes race, the Fjords and the Blossom Run come down in
// spate, a fog bank rolls out of Mistwood, a spire falls across the Spires' lane, rock fills one end of the Narrows,
// the Basalt Stacks' sea caves drain open, the kelp blooms, the whale breaches in the Glass Sea, the Jade Shoals ebb dry,
// the Great Atoll's tide runs to one side, a clam bed opens its pearls in the Spice Isles, Cinder Peak erupts, a cloudburst
// hangs over the Weeping Isle, a king tide floods the Mangrove Labyrinth, and the Maelstrom winds up.
//
// What the events do to the sea itself (its level, what stands in it, its currents and weather) lives in environment.ts,
// so sailing and the weather never reach in here; this file runs the clock, the falls, the bombs and the prizes, keeps
// the captains' chart in step, and answers the captains' questions about dangers, prizes and cover.
import { EVENT_REGION, eventStrength, seaLevelAt, solidNormal, strengthAt } from './environment.ts';
import { hurt } from './harm.ts';
import { rollItem, spawnLoot } from './items.ts';
import { PI, addScaled, dot, hash32, length, normalize, rngFloat, rngFrom, rngInt, rngRange, v3, type V3 } from './math.ts';
import { EVENT_CODES, NAV_EVENTS } from './nav.ts';
import { R, along, apart, tangentAt, tangentToward, turned } from './sphere.ts';
import { CAUSE, EVENT, EVENT_STATE, FLAG, PHASE, SHIPS, STREAM, TICK, copy, emit, type MatchState, type RegionEvent } from './state.ts';
import { calmAt, newCalm } from './storm.ts';
import { REGION_EVENT, WHALE } from './tables.ts';
import { callBreach, whaleFree } from './whale.ts';
import { newWind, windAt } from './wind.ts';
import { CENTRES, CURRENTS, REGION_EVENTS, blockAt, liftOf } from './world/index.ts';

const P = v3(), Q = v3(), T = v3(), N = v3(), W = newWind();

// ---------------------------------------------------------------- the programme

/**
 * Sets the match's programme: an event a region, the regions farthest from where the Storm will close first (with a
 * little shuffle), a few dozen seconds apart, each at one of its region's spots.
 */
export function planEvents(state: MatchState): void {
  const rng = rngFrom(hash32(state.seed, 0x5e7e47)), far = state.storm.centres[3];
  const order = REGION_EVENTS.map((e) => ({ ri: e.region, key: dot(CENTRES[e.region], far) + rngRange(rng, -0.35, 0.35) }));
  order.sort((a, b) => a.key - b.key || a.ri - b.ri);
  for (let i = 0; i < order.length; i++) {
    const ri = order[i].ri, e = REGION_EVENTS[ri], ev = state.regionEvents[ri];
    ev.state = EVENT_STATE.waiting;
    ev.at = REGION_EVENT.first + i * REGION_EVENT.every + rngFloat(rng) * REGION_EVENT.late;
    // the whale gives its own warning, rising for as long as it takes
    ev.warn = ri === EVENT_REGION.glass ? WHALE.rising : rngRange(rng, REGION_EVENT.warn[0], REGION_EVENT.warn[1]);
    ev.run = REGION_EVENT.run[ri];
    ev.t = 0;
    ev.k = rngInt(rng, e.spots.length);
    copy(ev.spot, e.spots[ev.k]);
    ev.n = 0;
    ev.marks = [];
  }
  // a danger the Storm's calm has closed round by its end would leave nowhere to get clear to: it trades its slot
  // with the latest earlier event it can, where the calm is wider
  for (let i = order.length - 1; i > 0; i--) {
    const a = state.regionEvents[order[i].ri];
    if (!cornered(state, order[i].ri, a.at)) continue;
    for (let j = i - 1; j >= 0; j--) {
      const b = state.regionEvents[order[j].ri];
      if (cornered(state, order[i].ri, b.at) || cornered(state, order[j].ri, a.at)) continue;
      [a.at, b.at] = [b.at, a.at];
      [order[i], order[j]] = [order[j], order[i]];
      break;
    }
  }
}

const CALM = newCalm();

/** Whether region ri's danger, starting at match time `at`, would fill the calm the Storm has left by its end. */
function cornered(state: MatchState, ri: number, at: number): boolean {
  const ev = state.regionEvents[ri], r = dangerReach(ri);
  if (r === 0) return false;
  calmAt(state, Math.max(0, at + ev.run - state.storm.start * TICK), CALM);
  return apart(CALM.at, ev.spot) + CALM.r < r + REGION_EVENT.berth + REGION_EVENT.room;
}

/** One tick of the regions' events, first thing in the step, so everything after it sees the sea they have made. */
export function tickEvents(state: MatchState): void {
  const now = state.tick * TICK;
  for (let ri = 0; ri < state.regionEvents.length; ri++) {
    const ev = state.regionEvents[ri];
    if (ev.state === EVENT_STATE.waiting && now >= ev.at - ev.warn) warn(state, ri, ev);
    if (ev.state === EVENT_STATE.warning && now >= ev.at) start(state, ri, ev);
    if (ev.state === EVENT_STATE.running) {
      ev.t = now - ev.at;
      if (ev.t >= ev.run) {
        ev.state = EVENT_STATE.over;
        emit(state, EVENT.regionEnd, -1, -1, ev.spot, { item: ri });
      } else act(state, ri, ev);
    }
    if (ev.marks.length > 0) bombsFall(state, ri, ev);
  }
  chartEvents(state);
}

function warn(state: MatchState, ri: number, ev: RegionEvent): void {
  if (ri === EVENT_REGION.glass) {
    // the whale is already about something of its own: the Glass Sea waits for it
    if (!whaleFree(state)) {
      ev.at += 8;
      return;
    }
    callBreach(state, ev.spot);
  }
  ev.state = EVENT_STATE.warning;
  emit(state, EVENT.regionWarn, -1, -1, ev.spot, { item: ri, amount: ev.warn, y: REGION_EVENTS[ri].r });
}

function start(state: MatchState, ri: number, ev: RegionEvent): void {
  ev.state = EVENT_STATE.running;
  ev.t = 0;
  emit(state, EVENT.regionStart, -1, -1, ev.spot, { item: ri, amount: ev.run, y: REGION_EVENTS[ri].r });
  if (ri === EVENT_REGION.spires) fall(state, ri, ev, REGION_EVENT.fall, 3);
  else if (ri === EVENT_REGION.narrows) fall(state, ri, ev, REGION_EVENT.rock, 6);
  else if (ri === EVENT_REGION.spice) spill(state, ev.spot, REGION_EVENT.pearls);
  else if (ri === EVENT_REGION.basalt) spill(state, ev.spot, REGION_EVENT.hoard);
}

/** Rock comes down: ships under it (or within `pad` metres) are hurt, and those it lands on are shouldered out from under it. */
function fall(state: MatchState, ri: number, ev: RegionEvent, damage: number, pad: number): void {
  for (let i = 0; i < SHIPS; i++) {
    const s = state.ships[i];
    if (s.phase !== PHASE.sea || !blockAt(ri, ev.k, s.pos, pad)) continue;
    hurt(state, i, damage, -1, CAUSE.rock, s.pos, 0);
    if (solidNormal(state, s.pos, N)) addScaled(s.shove, s.shove, N, 8);
  }
}

/** Loot scattered from a spot: a clam bed's pearls, a cave's hoard. */
function spill(state: MatchState, at: V3, what: { n: number; boost: number }): void {
  const rng = state.rng[STREAM.loot];
  for (let k = 0; k < what.n; k++) spawnLoot(state, at, rollItem(state, rng, what.boost), -1, -1, 4 + 2 * k);
}

/** What a running event does each tick. */
function act(state: MatchState, ri: number, ev: RegionEvent): void {
  if (ri === EVENT_REGION.ice) state.floeT += (REGION_EVENT.ice.speed - 1) * eventStrength(state, ri) * TICK;
  else if (ri === EVENT_REGION.fire) erupt(state, ri, ev);
}

// ---------------------------------------------------------------- Cinder Peak

/** The peak throws bombs, a few at ships, and its ash cloud drifts off downwind. */
function erupt(state: MatchState, ri: number, ev: RegionEvent): void {
  const E = REGION_EVENT.eruption, peak = REGION_EVENTS[ri].spots[ev.k];
  windAt(state, ev.spot, W);
  const w = length(W.v);
  if (w > 1e-6) normalize(addScaled(ev.spot, ev.spot, W.v, (E.ash.drift * TICK) / (R * w)));
  if (apart(ev.spot, peak) > E.ash.far) {
    tangentToward(peak, ev.spot, T);
    along(peak, T, E.ash.far, P);
    copy(ev.spot, P);
  }
  // (none thrown so late they would land after it has gone quiet)
  while (ev.n * E.every <= ev.t && ev.t < ev.run - E.flight) {
    ev.n++;
    launch(state, ri, ev, peak);
  }
}

function launch(state: MatchState, ri: number, ev: RegionEvent, peak: V3): void {
  const E = REGION_EVENT.eruption, rng = rngFrom(hash32(state.seed ^ 0x1a7a, ev.n * 16 + ri));
  let aimed = -1;
  if (rngInt(rng, E.aimed) === 0) {
    // one ship in reach of the peak, every one as likely
    for (let i = 0, n = 0; i < SHIPS; i++) {
      const s = state.ships[i];
      if (s.phase === PHASE.sea && apart(s.pos, peak) < E.far && rngInt(rng, ++n) === 0) aimed = i;
    }
  }
  if (aimed >= 0) {
    // where she will be, near enough
    const s = state.ships[aimed];
    along(s.pos, s.head, s.speed * E.flight * 0.6, Q);
    tangentAt(Q, rngRange(rng, -PI, PI), T);
    along(Q, T, rngRange(rng, 0, 7), P);
  } else {
    tangentAt(peak, rngRange(rng, -PI, PI), T);
    along(peak, T, rngRange(rng, E.near, E.far), P);
  }
  ev.marks.push({ at: { x: P.x, y: P.y, z: P.z }, t: E.flight });
  emit(state, EVENT.lavaBomb, -1, -1, P, { item: ri, amount: E.flight, y: E.reach });
}

/** Bombs in the air come down: ships they land by are hurt and set burning. */
function bombsFall(state: MatchState, ri: number, ev: RegionEvent): void {
  const E = REGION_EVENT.eruption;
  for (let m = 0; m < ev.marks.length; ) {
    const b = ev.marks[m];
    b.t -= TICK;
    if (b.t > 0) {
      m++;
      continue;
    }
    ev.marks.splice(m, 1);
    emit(state, EVENT.lavaBomb, -1, -1, b.at, { item: ri, y: E.reach, flag: FLAG.done });
    for (let i = 0; i < SHIPS; i++) {
      const s = state.ships[i], d = apart(s.pos, b.at);
      if (s.phase !== PHASE.sea || d > E.reach) continue;
      hurt(state, i, E.damage * (1 - (0.5 * d) / E.reach), -1, CAUSE.burn, s.pos, 0);
      if (s.burn <= 0) emit(state, EVENT.ablaze, i, -1, s.pos, { amount: E.burn });
      s.burn = Math.max(s.burn, E.burn);
      s.burnBy = -1;
    }
  }
}

// ---------------------------------------------------------------- the captains' chart

/** How far ahead, in seconds, the chart looks for a sea about to fall or a roof about to come down. */
const AHEAD = 15;

/** Whether region ri's roof `o` stands clear enough of the sea at match time t to pass under. */
function roofOpen(state: MatchState, ri: number, o: number, t: number): boolean {
  const roof = REGION_EVENTS[ri].roofs[o];
  const level = seaLevelAt(t) + strengthAt(state, ri, t) * liftOf(ri, state.regionEvents[ri].k, roof.pos);
  return level < roof.under - REGION_EVENT.air;
}

/**
 * Brings the captains' chart into step with the events: each region's lift at its worst for a keel over the next while,
 * fallen rock shut from the moment it is announced, and a roof open only while it will stay open.
 */
export function chartEvents(state: MatchState): void {
  const now = state.tick * TICK;
  for (let ri = 0; ri < REGION_EVENTS.length; ri++) {
    const ev = state.regionEvents[ri], e = REGION_EVENTS[ri];
    NAV_EVENTS.k[ri] = ev.k;
    let lo = 1, hi = 0;
    for (let s = 0; s <= AHEAD; s += 5) {
      const v = strengthAt(state, ri, now + s);
      lo = Math.min(lo, v);
      hi = Math.max(hi, v);
    }
    NAV_EVENTS.up[ri] = lo;
    NAV_EVENTS.down[ri] = hi;
    const fallen = ev.state === EVENT_STATE.warning || ev.state === EVENT_STATE.running || (e.block?.stays === true && ev.state === EVENT_STATE.over);
    const codes = EVENT_CODES.block[ri];
    for (let k = 0; k < codes.length; k++) NAV_EVENTS.shut[codes[k]] = fallen && k === ev.k ? 1 : 0;
    for (let o = 0; o < e.roofs.length; o++) NAV_EVENTS.shut[EVENT_CODES.roof[ri][o]] = roofOpen(state, ri, o, now) && roofOpen(state, ri, o, now + AHEAD) ? 0 : 1;
  }
}

// ---------------------------------------------------------------- what the captains ask

export interface Danger {
  region: number;
  /** The centre of it, and how far from there is safe. */
  at: V3;
  r: number;
}

export const newDanger = (): Danger => ({ region: -1, at: v3(), r: 0 });

/**
 * The events a captain keeps clear of: whether each is still a danger once it is running (not only while it is
 * announced), and whether it is only one then. Cinder Peak is two: the cone, and the ash cloud drifting off it.
 */
const DANGERS = [
  { ri: EVENT_REGION.spires, live: false, ash: false }, { ri: EVENT_REGION.narrows, live: false, ash: false },
  { ri: EVENT_REGION.glass, live: true, ash: false }, { ri: EVENT_REGION.fire, live: true, ash: false },
  { ri: EVENT_REGION.fire, live: true, ash: true }, { ri: EVENT_REGION.kelp, live: true, ash: false },
  { ri: EVENT_REGION.maelstrom, live: true, ash: false },
];

/** How far region ri's danger reaches from its spot (Cinder Peak's cone, not its ash), or 0 for an event that is no danger. */
function dangerReach(ri: number): number {
  if (!DANGERS.some((d) => d.ri === ri)) return 0;
  return ri === EVENT_REGION.kelp ? REGION_EVENT.bloom.r : REGION_EVENTS[ri].r;
}

/**
 * Where region ri's event shows on the map, and how far it reaches: Cinder Peak's cone, the kelp bloom where it has
 * drifted, and every other at its spot.
 */
export function eventMark(state: MatchState, ri: number, out: V3): number {
  const ev = state.regionEvents[ri];
  copy(out, ri === EVENT_REGION.fire ? REGION_EVENTS[ri].spots[ev.k] : ev.spot);
  return ri === EVENT_REGION.kelp ? REGION_EVENT.bloom.r : REGION_EVENTS[ri].r;
}

/** What region ri's event is to a captain: something to keep clear of, something to go for, or neither. */
export const eventTone = (ri: number): 'danger' | 'prize' | 'sea' =>
  dangerReach(ri) > 0 ? 'danger' : PRIZES.some((p) => p.ri === ri) ? 'prize' : 'sea';

/** The event danger over p, or within `pad` metres of it: where to get away from, and how far. */
export function dangerAt(state: MatchState, p: V3, pad: number, out: Danger): boolean {
  for (const { ri, live, ash } of DANGERS) {
    const ev = state.regionEvents[ri];
    if ((ash || ev.state !== EVENT_STATE.warning) && !(live && ev.state === EVENT_STATE.running)) continue;
    const at = ri === EVENT_REGION.fire && !ash ? REGION_EVENTS[ri].spots[ev.k] : ev.spot;
    const r = ash ? REGION_EVENT.eruption.ash.r : dangerReach(ri);
    if (apart(p, at) >= r + pad) continue;
    out.region = ri;
    copy(out.at, at);
    out.r = r;
    return true;
  }
  out.region = -1;
  return false;
}

/** Seconds into its run a prize is still worth going for: the pearls are soon taken, the caves' hoard lasts while they are open. */
const PRIZES = [{ ri: EVENT_REGION.spice, until: 30 }, { ri: EVENT_REGION.basalt, until: 1e9 }];
const SPATE = [EVENT_REGION.fjords, EVENT_REGION.blossom];

/**
 * Something an event offers a captain at p: a lane in spate under her, to ride on down (the goal a little way
 * downstream), or a prize within `reach` (the goal on it). Returns the region, or -1.
 */
export function rewardNear(state: MatchState, p: V3, reach: number, out: V3): number {
  for (const ri of SPATE) if (eventStrength(state, ri) > 0.5 && downstream(ri, p, out)) return ri;
  for (const { ri, until } of PRIZES) {
    const ev = state.regionEvents[ri];
    if (ev.state !== EVENT_STATE.running || ev.t > until || apart(p, ev.spot) > reach) continue;
    // (a cave's hoard only while the chart says its way in will stay open)
    if (EVENT_CODES.roof[ri].some((c) => NAV_EVENTS.shut[c] !== 0)) continue;
    copy(out, ev.spot);
    return ri;
  }
  return -1;
}

/** A point some 60 m on down region ri's lane from p, when p is on it. */
function downstream(ri: number, p: V3, out: V3): boolean {
  for (const l of CURRENTS) {
    if (l.region !== ri || dot(p, l.centre) < l.cos) continue;
    let best = -1, bd = l.width / 2 + 10;
    for (let k = 0; k < l.pts.length; k++) {
      const d = apart(p, l.pts[k]);
      if (d < bd) {
        bd = d;
        best = k;
      }
    }
    if (best < 0 || best >= l.pts.length - 3) continue;
    copy(out, l.pts[Math.min(l.pts.length - 1, best + 10)]);
    return true;
  }
  return false;
}

/** Cover an event throws over the sea within `reach` of p, Mistwood's fog bank or the Weeping Isle's cloudburst: the goal is well inside it on p's side. */
export function coverNear(state: MatchState, p: V3, reach: number, out: V3): boolean {
  for (const ri of [EVENT_REGION.mist, EVENT_REGION.weeping]) {
    const ev = state.regionEvents[ri];
    if (eventStrength(state, ri) < 0.5) continue;
    const d = apart(p, ev.spot), r = ri === EVENT_REGION.mist ? REGION_EVENT.mist.r : REGION_EVENT.cloudburst.fog;
    if (d > reach + r) continue;
    if (d < 1) {
      copy(out, p);
      return true;
    }
    tangentToward(ev.spot, p, T);
    along(ev.spot, T, Math.min(d, r * 0.4), out);
    return true;
  }
  return false;
}

/** The way out of a danger: a point `berth` metres outside it, straight out from its centre through p, or swung `swing` radians round from there. */
export function escapeFrom(danger: Danger, p: V3, berth: number, out: V3, swing = 0): V3 {
  if (apart(p, danger.at) < 1) tangentAt(danger.at, 0, T);
  else tangentToward(danger.at, p, T);
  if (swing !== 0) turned(T, danger.at, swing, T);
  return along(danger.at, T, danger.r + berth, out);
}

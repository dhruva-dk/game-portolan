// The simulation's events as the app's moments, and the moments the actors animate. Each tick the session reads
// state.events through momentsOf; the juice, sound, tally and HUD read those moments, and the actors get theirs from
// actorEvent. Positions in moments are metres from the planet's centre. At the end, the capture tools' scripted
// moments.
import type { ActorEvent, LootKind, Rarity } from '../render/actors/index.ts';
import { empty, useItem, weaponItem } from '../sim/items.ts';
import {
  ACTIVES, CAUSE, EVENT, FLAG, ITEM, PHASE, PLAYER, SHIPS, SLOTS, STORM, TICK, calmNow, idleInput, localHour, priceOf,
  type Happening, type Item, type MatchState, type Ship, type ShipInput,
} from '../sim/match.ts';
import { R, advance, along, tangentAt, tangentToward, turned } from '../sim/sphere.ts';
import { eventMark, eventTone } from '../sim/regionEvents.ts';
import { EVENT_STATE, copy } from '../sim/state.ts';
import { callBreach } from '../sim/whale.ts';
import { LANDMARKS, REGIONS, REGION_EVENTS, TIDE_AMPLITUDE, heightAt, navigable, regionShare } from '../sim/world/index.ts';
import { PI, v3, type V3 } from '../sim/math.ts';
import { WEAPON_CLASSES, type ConsumableKind, type Moment, type WeaponClass } from './events.ts';

const isWeapon = (kind: number): boolean => kind >= ITEM.cannon && kind <= ITEM.broadside;

/** An item kind (1–6) as its weapon class. */
export const weaponOf = (kind: number): WeaponClass => WEAPON_CLASSES[Math.max(0, Math.min(5, kind - ITEM.cannon))];

const CONSUMABLE: Record<number, ConsumableKind> = {
  [ITEM.smallShield]: 'smallShield', [ITEM.bigShield]: 'bigShield', [ITEM.repairKit]: 'repairKit', [ITEM.fullRepair]: 'fullRepair',
};
export const consumableOf = (kind: number): ConsumableKind => CONSUMABLE[kind] ?? 'repairKit';

/** An item kind as the actors' loot kind. */
export const lootKind = (kind: number): LootKind => (isWeapon(kind) ? weaponOf(kind) : consumableOf(kind));

/** An item kind's key, such as 'cannon' or 'bigShield'. */
export const itemKey = (kind: number): string => (isWeapon(kind) ? weaponOf(kind) : CONSUMABLE[kind] ?? 'none');

const CAUSES: Record<number, string> = {
  [CAUSE.storm]: 'storm', [CAUSE.ram]: 'ram', [CAUSE.ink]: 'ink', [CAUSE.burn]: 'burn', [CAUSE.ash]: 'ash',
  [CAUSE.lightning]: 'lightning', [CAUSE.mine]: 'mine', [CAUSE.wave]: 'wave', [CAUSE.whale]: 'whale',
  [CAUSE.rock]: 'rock',
};
/** What sank or hurt a ship, by name: a weapon class or one of the causes. */
export const causeName = (cause: number): string => (isWeapon(cause) ? weaponOf(cause) : CAUSES[cause] ?? 'sea');

/** A cause by name, as causeName gives it, back to the sim's number; anything else is the Storm. */
export function causeOf(name: string): number {
  const w = WEAPON_CLASSES.indexOf(name as WeaponClass);
  if (w >= 0) return ITEM.cannon + w;
  const k = Object.keys(CAUSES).find((n) => CAUSES[+n] === name);
  return k ? +k : CAUSE.storm;
}

function hurtBy(kind: number): Extract<Moment, { k: 'hit' }>['weapon'] {
  if (isWeapon(kind)) return weaponOf(kind);
  if (kind === CAUSE.storm) return 'storm';
  if (kind === CAUSE.ram) return 'ram';
  if (kind === CAUSE.burn) return 'fire';
  return 'other';
}

const metres = (at: V3, y = 0): V3 => ({ x: at.x * (R + y), y: at.y * (R + y), z: at.z * (R + y) });

/** The way a ship's guns point: from its position toward its aim, along the ground. */
export function gunDir(s: Ship): V3 {
  const p = s.pos;
  let x = s.aim.x - p.x, y = s.aim.y - p.y, z = s.aim.z - p.z;
  const d = x * p.x + y * p.y + z * p.z;
  x -= p.x * d; y -= p.y * d; z -= p.z * d;
  const l = Math.hypot(x, y, z);
  return l > 1e-6 ? { x: x / l, y: y / l, z: z / l } : { ...s.head };
}

/** One happening as a moment, or null for those nothing outside the simulation reacts to. */
export function momentOf(state: MatchState, e: Happening): Moment | null {
  const pos = metres(e.at, e.y), ship = e.ship;
  switch (e.kind) {
    case EVENT.fire: return { k: 'fire', ship, weapon: weaponOf(e.item), rarity: e.amount, pos, dir: gunDir(state.ships[ship]) };
    case EVENT.impact:
      return { k: 'impact', pos, on: e.flag & FLAG.ship ? 'ship' : e.flag & FLAG.land ? 'land' : 'water', weapon: weaponOf(e.item), ship };
    case EVENT.hit:
      if (e.flag & FLAG.steady && e.item === CAUSE.storm) return { k: 'stormHurt', ship };
      return {
        k: 'hit', ship, by: e.by, shield: e.shield, hull: e.hull, crit: (e.flag & FLAG.crit) !== 0, pos, weapon: hurtBy(e.item),
        ...(e.flag & FLAG.steady ? { steady: true } : {}),
      };
    case EVENT.shieldBreak: return { k: 'shieldBreak', ship, by: e.by, pos };
    case EVENT.sink: return { k: 'sink', ship, by: e.by, cause: causeName(e.item), pos };
    case EVENT.pickup: return { k: 'pickup', ship, item: itemKey(e.item), rarity: e.y, pos: metres(e.at) };
    case EVENT.drop: return { k: 'drop', ship, pos: metres(e.at) };
    case EVENT.gust: return { k: 'gust', ship, pos };
    case EVENT.reload: return e.flag & FLAG.done ? null : { k: 'reload', ship, weapon: weaponOf(e.item) };
    case EVENT.empty: return { k: 'empty', ship };
    case EVENT.useStart: return { k: 'useStart', ship, item: consumableOf(e.item), seconds: e.amount };
    case EVENT.useDone: return { k: 'useDone', ship, item: consumableOf(e.item) };
    case EVENT.useCancel: return { k: 'useCancel', ship, item: consumableOf(e.item) };
    case EVENT.ability: return { k: 'ability', ship, id: ACTIVES[e.item] ?? 'ram', pos };
    case EVENT.stormShrink: return { k: 'stormPhase', phase: e.item, seconds: e.amount };
    case EVENT.galeDive: return { k: 'galeDive', ship, region: e.item, pos };
    case EVENT.landing: return { k: 'landing', ship, pos };
    case EVENT.deliveryCalled: return { k: 'deliveryCalled', ship, pos };
    case EVENT.deliveryArrived: return { k: 'deliveryArrived', ship, pos };
    case EVENT.coins: return { k: 'coins', ship, amount: e.amount, pos };
    case EVENT.whaleBreach: return { k: 'whaleBreach', pos };
    case EVENT.whaleSurface: return { k: 'whaleSurface', pos };
    case EVENT.whaleDive: return { k: 'whaleDive', pos };
    case EVENT.perkGained: case EVENT.perkLost:
      return { k: 'perk', ship, perk: REGIONS[e.item]?.perk ?? '', on: e.kind === EVENT.perkGained };
    case EVENT.lightningWarn: return { k: 'lightning', pos, warning: true };
    case EVENT.lightning: return { k: 'lightning', pos, warning: false };
    case EVENT.scrape: return { k: 'aground', ship, pos };
    case EVENT.ram: return { k: 'ram', ship, by: e.by, pos };
    case EVENT.win: return { k: 'win', ship };
    case EVENT.regionWarn: return { k: 'regionEvent', region: e.item, phase: 'warn', seconds: e.amount, pos: metres(e.at) };
    case EVENT.regionStart: return { k: 'regionEvent', region: e.item, phase: 'start', seconds: e.amount, pos: metres(e.at) };
    case EVENT.regionEnd: return { k: 'regionEvent', region: e.item, phase: 'end', seconds: 0, pos: metres(e.at) };
    case EVENT.lavaBomb: return { k: 'lavaBomb', pos: metres(e.at), landed: (e.flag & FLAG.done) !== 0, seconds: e.amount };
    default: return null;
  }
}

/** This tick's happenings as moments, appended to `out`. */
export function momentsOf(state: MatchState, out: Moment[]): Moment[] {
  for (const e of state.events) {
    const m = momentOf(state, e);
    if (m) out.push(m);
    // a shield item done: the aura shimmers back
    if (e.kind === EVENT.useDone && e.shield > 0) out.push({ k: 'shieldUp', ship: e.ship, pos: metres(state.ships[e.ship].pos) });
  }
  return out;
}

const rarity = (n: number): Rarity => Math.max(0, Math.min(4, Math.round(n))) as Rarity;

/** What a moment shows on the actors, if anything. `whaleHead` turns the breach the way the whale swims. */
export function actorEvent(m: Moment, whaleHead: V3): ActorEvent | null {
  switch (m.k) {
    case 'fire': return { t: 'fire', ship: m.ship, weapon: m.weapon, rarity: rarity(m.rarity) };
    case 'hit':
      if (m.steady) return null;
      if (m.weapon === 'ram') return { t: 'ram', at: m.pos };
      if (m.weapon === 'storm' || m.weapon === 'fire' || m.weapon === 'other') return null;
      return { t: 'hit', ship: m.ship, by: m.by, weapon: m.weapon, at: m.pos, shield: m.shield, hull: m.hull, crit: m.crit };
    case 'impact': return m.on === 'ship' ? null : { t: 'impact', weapon: m.weapon, at: m.pos, on: m.on };
    case 'shieldBreak': return { t: 'shieldBreak', ship: m.ship, at: m.pos };
    case 'shieldUp': return { t: 'shieldRefill', ship: m.ship };
    case 'sink': return { t: 'sink', ship: m.ship };
    case 'gust': return { t: 'gust', ship: m.ship };
    case 'pickup': return { t: 'pickup', ship: m.ship, rarity: rarity(m.rarity) };
    case 'deliveryArrived': return { t: 'delivery', ship: m.ship };
    case 'ram': return { t: 'ram', at: m.pos };
    case 'aground': return { t: 'scrape', at: m.pos };
    case 'whaleBreach': return { t: 'breach', at: m.pos, head: whaleHead };
    case 'lavaBomb': return m.landed ? { t: 'lavaBomb', at: m.pos, on: heightAt(m.pos) > 0.5 ? 'land' : 'water' } : null;
    case 'regionEvent': return m.phase === 'start' && REGION_EVENTS[m.region].block ? { t: 'rockfall', region: m.region, at: m.pos } : null;
    default: return null;
  }
}

// ---------------------------------------------------------------- scripted moments
//
// The capture tools' moments (tools/capture/moment.ts keeps the same list). Each sets a moment up on a seeded match
// that has just begun, gives the player's input from then on, and names the moment its strip is about. At sea, the
// player is moved to open water and every other ship is held still with furled sails, so nothing else steps in.

/** The player's input from a tick on: [[tick, input], ...]. */
export type Script = [number, Partial<ShipInput>][];

export interface MomentScript {
  name: string;
  /** What the trigger is, for the plan. */
  note: string;
  /** Begin at sea, with the Gale skipped and the other ships held. False for the Gale's own moment. */
  sea: boolean;
  /** Ticks to start before the trigger, ticks between frames, and how many frames. */
  lead: number;
  every: number;
  frames: number;
  /** Sets the moment up on the match, and returns the player's input from now on. */
  arrange(state: MatchState): Script;
  /** Whether a moment is the one the strip is about. */
  is(m: Moment): boolean;
}

/** The target in the moments that need one. */
const TARGET = 1;
/** Where the target lies in the duels: ahead and to starboard, clear of the player's own ship in the chase camera. */
const OFF_BOW = { ahead: 55, side: 24 } as const;

interface Course {
  pos: V3;
  head: V3;
}

/** Deep at low tide, with a metre to spare. */
const open = (p: V3): boolean => navigable(p, -TIDE_AMPLITUDE - 1);

/** A point `d` metres along a course and `side` metres to starboard, with the course's heading there. */
function off(c: Course, d: number, side = 0): Course {
  const pos = v3(), head = v3();
  advance(c.pos, c.head, d, pos, head);
  if (side !== 0) {
    const right = v3(head.y * pos.z - head.z * pos.y, head.z * pos.x - head.x * pos.z, head.x * pos.y - head.y * pos.x);
    along(pos, right, side, pos);
  }
  return { pos, head };
}

/** Open water near the player: `run` metres clear ahead, and `side` metres clear to either side all the way. */
function openCourse(state: MatchState, run: number, side: number): Course {
  const me = state.ships[PLAYER], t = v3(), h = v3();
  for (let d = 0; d <= 400; d += 40) {
    for (let k = 0; k < (d ? 16 : 1); k++) {
      const pos = along(me.pos, tangentAt(me.pos, (k * PI) / 8, t), d, v3());
      for (let j = 0; j < 8; j++) {
        const c = { pos, head: tangentAt(pos, (j * PI) / 4, h) };
        let ok = true;
        for (let s = -20; s <= run && ok; s += 8) for (const x of [0, -side, side]) if (ok && !open(off(c, s, x).pos)) ok = false;
        if (ok) return { pos: v3(pos.x, pos.y, pos.z), head: v3(h.x, h.y, h.z) };
      }
    }
  }
  return { pos: v3(me.pos.x, me.pos.y, me.pos.z), head: v3(me.head.x, me.head.y, me.head.z) };
}

/** Puts ship i on the water, on a course, at rest. */
function place(state: MatchState, i: number, c: Course): void {
  const ship = state.ships[i];
  ship.phase = PHASE.sea;
  Object.assign(ship.pos, c.pos);
  Object.assign(ship.was, c.pos);
  Object.assign(ship.head, c.head);
  ship.alt = ship.vy = ship.speed = ship.rate = 0;
  ship.landed = state.tick;
}

/** The player's hotbar holds only these, the first selected. */
function arm(state: MatchState, ...items: Item[]): void {
  const me = state.ships[PLAYER];
  for (let k = 0; k < SLOTS; k++) me.slots[k] = items[k] ?? empty();
  me.sel = 0;
}

/** The player at the start of an open course with the target `d` metres ahead (`side` to starboard), and the
 *  player's guns firing at it from `wait` ticks on, sails furled. */
function duel(state: MatchState, d: number, side: number, target: Partial<Ship>, wait = 15): Script {
  const c = openCourse(state, d + 30, Math.abs(side) + 20), at = off(c, d, side);
  place(state, PLAYER, c);
  place(state, TARGET, at);
  Object.assign(state.ships[TARGET], { shield: 0, hull: 100, ...target });
  const t = state.tick;
  return [[t, { throttle: 0, steer: 0, aim: at.pos, aimY: 2 }], [t + wait, { fire: true }], [t + wait + 1, { fire: false }]];
}

/** Sets the clock so it is `hour` o'clock where the player is: the strips are shot in daylight, whatever the seed. */
export function daylight(state: MatchState, hour = 15): void {
  state.hour = (((state.hour + hour - localHour(state, state.ships[PLAYER].pos)) % 24) + 24) % 24;
}

/** Open water `d` metres or more from a spot, on a course facing it, with room astern and to either side. With
 *  `sight`, only where nothing stands between the ship and the spot short of its last `bare` metres, so the camera
 *  behind her sees it, and well inside region `own` when one is given, so the current doesn't carry her out of it: null
 *  when there's no such water. */
function facing(spot: V3, d: number, sight = false, own = -1, bare = 50): Course | null {
  const t = v3(), q = v3();
  for (let r = d; r <= d + (sight ? 260 : 400); r += 20) {
    for (let k = 0, n = sight ? 64 : 32; k < n; k++) {
      const pos = along(spot, tangentAt(spot, (k * 2 * PI) / n, t), r, v3()), c = { pos, head: tangentToward(pos, spot, v3()) };
      let ok = own < 0 || regionShare(own, pos) > 0.8;
      for (let s = -40; s <= 10 && ok; s += 10) for (const x of [-12, 0, 12]) if (ok && !open(off(c, s, x).pos)) ok = false;
      // (the spot's own ground, a dune or a peak, is what she looks at: only what stands short of it hides it)
      for (let s = 10; sight && ok && s < r - bare; s += 10) if (heightAt(along(pos, c.head, s, q)) > 4) ok = false;
      if (ok) return c;
    }
  }
  return sight ? null : { pos: v3(spot.x, spot.y, spot.z), head: tangentAt(spot, 0, v3()) };
}

/** A region's event, warned a second from now, with the player at rest facing it: just outside a danger's reach,
 *  or close by for the rest. Every other region's event waits out the strip. */
function eventMoment(id: string): MomentScript {
  const ri = REGIONS.findIndex((r) => r.id === id);
  return {
    name: `event-${id}`, note: `${REGIONS[ri].event} starting`, sea: true, lead: 120, every: 30, frames: 16,
    arrange: (s) => {
      const now = s.tick * TICK, spot = v3(), ev = s.regionEvents[ri], spots = REGION_EVENTS[ri].spots;
      s.regionEvents.forEach((e, j) => {
        e.state = EVENT_STATE.waiting;
        e.at = j === ri ? now + ev.warn + 1 : 1e6;
      });
      // (Cinder Peak stands tall: far enough off to see its plume and where its bombs come down; the kelp lies flat on
      // the water, so the ship waits inside its reach and the bloom spreads up to her and round her; the Maelstrom's
      // whirl races fastest well inside its reach, so she waits in it, where the water foams; the Narrows' rock comes
      // down into the slot of water between the Gorge's walls, so she waits off the mouth, back far enough to see the
      // wall tops it falls from, looking straight in with nothing at all in the way)
      const r = eventMark(s, ri, spot), id = REGIONS[ri].id;
      const off = id === 'fireArchipelago' ? r + 120 : id === 'kelpShallows' ? r * 0.25 : id === 'maelstrom' ? 80
        : id === 'narrows' ? r + 90 : eventTone(ri) === 'danger' ? r + 40 : Math.min(90, r);
      const bare = id === 'narrows' ? 10 : 50;
      // the match's spot when the region's own water looks on it, else the first of its others that does; then
      // the same from any water
      // (the Fjords' surge is seen at its source: the ship lies on the outflow, looking up the fjord at the falls)
      let c: Course | null = id === 'fjords' ? facing(LANDMARKS[ri].pos, 140, true, ri) : null;
      for (const own of [ri, -1]) {
        for (let j = 0; j < spots.length && !c; j++) {
          const k = (ev.k + j) % spots.length;
          c = facing(k === ev.k ? spot : spots[k], off, true, own, bare);
          if (c && k !== ev.k) (ev.k = k), copy(ev.spot, spots[k]);
        }
      }
      c ??= facing(spot, off)!;
      // a little off it, so the hull in front of the camera doesn't hide the spot
      turned(c.head, c.pos, 0.4, c.head);
      place(s, PLAYER, c);
      return [[s.tick, { throttle: 0, steer: 0 }]];
    },
    is: (m) => m.k === 'regionEvent' && m.region === ri && m.phase === 'start',
  };
}

/** A one-tick input at tick t, let go the tick after. */
const tap = (t: number, on: Partial<ShipInput>, offIs: Partial<ShipInput>): Script => [[t, on], [t + 1, offIs]];

export const MOMENTS: readonly MomentScript[] = [
  {
    name: 'cannon-hit', note: 'the first hit the player lands on the target', sea: true, lead: 14, every: 2, frames: 14,
    arrange: (s) => (arm(s, weaponItem(ITEM.cannon, 2)), duel(s, OFF_BOW.ahead, OFF_BOW.side, {})),
    is: (m) => m.k === 'hit' && m.ship === TARGET && m.by === PLAYER,
  },
  {
    name: 'shield-break', note: 'the target\'s shield breaking', sea: true, lead: 14, every: 2, frames: 14,
    arrange: (s) => (arm(s, weaponItem(ITEM.cannon, 2)), duel(s, OFF_BOW.ahead, OFF_BOW.side, { shield: 8 })),
    is: (m) => m.k === 'shieldBreak' && m.ship === TARGET,
  },
  {
    name: 'sinking', note: 'the target sinking', sea: true, lead: 10, every: 4, frames: 16,
    arrange: (s) => (arm(s, weaponItem(ITEM.cannon, 2)), duel(s, OFF_BOW.ahead, OFF_BOW.side, { hull: 4 })),
    is: (m) => m.k === 'sink' && m.ship === TARGET,
  },
  {
    name: 'gust', note: 'the player\'s gust', sea: true, lead: 8, every: 2, frames: 16,
    arrange: (s) => {
      place(s, PLAYER, openCourse(s, 140, 20));
      const t = s.tick;
      return [[t, { throttle: 1, steer: 0 }], ...tap(t + 45, { gust: true }, { gust: false })];
    },
    is: (m) => m.k === 'gust' && m.ship === PLAYER,
  },
  {
    name: 'consumable', note: 'the player starting to drink a Big Shield', sea: true, lead: 6, every: 6, frames: 16,
    arrange: (s) => {
      place(s, PLAYER, openCourse(s, 40, 20));
      arm(s, useItem(ITEM.bigShield, 1));
      s.ships[PLAYER].shield = 0;
      const t = s.tick;
      return [[t, { throttle: 0, steer: 0 }], [t + 15, { fire: true }]];
    },
    is: (m) => m.k === 'useStart' && m.ship === PLAYER,
  },
  {
    name: 'gale-dive', note: 'the player leaving the Gale', sea: false, lead: 30, every: 6, frames: 14,
    arrange: (s) => [[s.tick + 90, { dive: true }]],
    is: (m) => m.k === 'galeDive' && m.ship === PLAYER,
  },
  {
    name: 'storm-phase', note: 'the Storm starting to close', sea: true, lead: 30, every: 10, frames: 14,
    arrange: (s) => {
      // the player 40 m inside the safe circle's edge, facing out, with the first wait nearly over
      const calm = calmNow(s), t = v3();
      for (let k = 0; k < 32; k++) {
        const pos = along(calm.at, tangentAt(calm.at, (k * PI) / 16, t), calm.r - 40, v3());
        const head = tangentToward(pos, calm.at, v3());
        head.x = -head.x; head.y = -head.y; head.z = -head.z;
        const c = { pos, head };
        if (open(pos) && open(off(c, 20).pos) && open(off(c, 50).pos)) {
          place(s, PLAYER, c);
          break;
        }
      }
      s.storm.start = s.tick - Math.round((STORM.phases[0].wait * s.storm.scale - 2) / TICK);
      return [[s.tick, { throttle: 0, steer: 0 }]];
    },
    is: (m) => m.k === 'stormPhase',
  },
  {
    // on past the trigger through the leap (a second of boiling sea, then nearly four in the air) to the slam
    name: 'whale-breach', note: 'the giant whale breaching', sea: true, lead: 36, every: 6, frames: 30,
    arrange: (s) => {
      const c = openCourse(s, 60, 50);
      place(s, PLAYER, c);
      callBreach(s);
      // it rises ahead to starboard, inside the lift's reach and outside the flip's, far enough off for the view to
      // take in a leap twice its length, and swims across the view to port. Aimed at, the view turns to it
      const w = s.whale, spot = off(c, 22, 24).pos;
      Object.assign(w.spot, spot);
      Object.assign(w.at, spot);
      tangentToward(spot, off(c, 60, -10).pos, w.head);
      return [[s.tick, { throttle: 0, steer: 0, aim: spot }]];
    },
    is: (m) => m.k === 'whaleBreach',
  },
  {
    name: 'broadside', note: 'the player\'s broadside', sea: true, lead: 6, every: 2, frames: 14,
    arrange: (s) => (arm(s, weaponItem(ITEM.broadside, 2)), duel(s, 0, 40, {})),
    is: (m) => m.k === 'fire' && m.ship === PLAYER && m.weapon === 'broadside',
  },
  {
    name: 'delivery', note: 'the gull delivering to the player', sea: true, lead: 75, every: 5, frames: 18,
    arrange: (s) => {
      place(s, PLAYER, openCourse(s, 60, 20));
      const me = s.ships[PLAYER];
      me.coins = priceOf(me, 0) + 5;
      const t = s.tick;
      return [[t, { throttle: 0, steer: 0 }], ...tap(t + 10, { hail: 0 }, { hail: -1 })];
    },
    is: (m) => m.k === 'deliveryArrived' && m.ship === PLAYER,
  },
  ...REGIONS.map((r) => eventMoment(r.id)),
];

/** Every ship but the player's held still with furled sails, as step's inputs. */
export const heldStill = (): (ShipInput | null)[] =>
  Array.from({ length: SHIPS }, (_, i) => (i === PLAYER ? null : { ...idleInput(), throttle: 0 }));

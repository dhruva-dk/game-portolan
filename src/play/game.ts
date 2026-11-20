// The game view: the player's ship on the sea, sailed by the stick, watched by the chase camera, among the others
// she fights (the match itself, its ships, bots and fighting, is state.ts's).
//
// Each frame (step): her hands, as read for it (player.ts Hands), are turned into the helm's and the gun's orders, the
// match takes as many fixed steps as the frame has time for (sim/fixed.ts), and the camera follows the ship drawn
// blended between the last two. What is drawn (snapshot) is that moment: the ships, the balls, the camera's eye, and the world's clock (the
// sea's) set to it, so the hulls and the waves under them are the same instant.
//
// The stick steers by the screen: pushed toward a direction on the screen, she heads that way across the sea as the
// camera looks at it, as fast as it is pushed. Let go, she coasts. Her gun in hand is aimed along the camera's look,
// through the middle of the screen (chase.ts sight; the gun's assist lays it on a ship near that line: sim/gun.ts), its
// trigger held through every step of a frame her hands hold it (the HUD's button), or pressed between two. Her taps on
// the hotbar (a gun slot taken in hand, or an item's) and on Gust are asked of her stores at the next step
// (sim/stores.ts); what she carries is reported as her kit, and her aim as the reticle: where the ball will come down,
// whether it reaches, and how wide her balls go off there.
//
// The camera follows the ship the match's flow sets (view): hers, or once she has sunk and chosen to watch, the one she
// watches, always flown to, never cut; at her end, sunk or won, it holds on her ship in finale.ts's shot.
//
// It opens on the lobby's quiet sea (anchor), where the camera stands off her bow and a drag turns it round her
// (anchorage.ts) and her hands do not sail her; a match then opens with every ship afloat at her berth (start), the
// eye coming down from space onto her (arrival.ts), her hands on her ship once it is there. What only the debug
// switches ask of it (src/debug.ts: a match at sea among others, her helm lashed, ships sunk, loot strewn) is its
// `debug`, apart from what the game offers anyone.
//
// What happens on the sea (moments.ts) the camera answers (shake.ts: a shake, a knock, a punch of the field of view,
// laid over the chase camera's eye) and the match's time with it (stops.ts: a blow's moment held a few hundredths of
// a second); the HUD reads the same moments in her status.

import type { World } from '../environment.ts';
import { fixedClock } from '../sim/fixed.ts';
import { inHand } from '../sim/battle.ts';
import { laid, reloadOf, spreadOf, type Gun, type Laying } from '../sim/gun.ts';
import { charging } from '../sim/gust.ts';
import { EQUIP, GUN, GUNS, GUST, HEALTH } from '../sim/handling.ts';
import { progress } from '../sim/hold.ts';
import { offered, rarityOf } from '../sim/loot.ts';
import { STORM, toEdge } from '../sim/storm.ts';
import { sunk } from '../sim/health.ts';
import { RIDE } from '../sim/ride.ts';
import { PLAYER } from '../sim/match.ts';
import type { Vessel } from '../sim/contact.ts';
import type { Helm, ShipState } from '../sim/ship.ts';
import type { Use } from '../kinds.ts';
import type { Eye, LootDraw, Snapshot } from '../snapshot.ts';
import { createSwell } from '../world/swell.ts';
import type { Anchor } from '../world/lattice.ts';
import type { ShipPose } from '../world/pose.ts';
import { R, add, bearingAt, distance, dot, normalize, scale, type Vec3 } from '../world/sphere.ts';
import { HOTBAR, IDLE, type GunSlot, type Hands, type Item, type Kit, type Moment, type Slot, type Status } from '../player.ts';
import { REST, anchorageEye, dragged, eyeOut, relaxed, type Orbit } from './anchorage.ts';
import { ARRIVAL, arriving } from './arrival.ts';
import { createChase } from './chase.ts';
import { placed, type Point, type View as Viewport } from './lens.ts';
import { finale, type Ending } from './finale.ts';
import { see, seenOf } from './moments.ts';
import { answerTo, createShake } from './shake.ts';
import { createStops, stopFor } from './stops.ts';
import { createState, type Berth, type Match, type Waters } from './state.ts';

/** How little of the stick's push counts as none. */
const DEAD = 0.15;
/** Loot is drawn within DRAWN m of the eye (so none from space), floating on the waves within RIDES m of the eye's
 *  ship. (Never on the disc: the sea is searched by eye.) */
const DRAWN = 700, RIDES = 320;
/** Seconds before the match a piece strewn at its start is taken to have come onto the water: long since bobbed up. */
const LONG_AGO = 1e3;
/** How far a gun is through reloading (0…1), or null when it isn't. */
const reloading = (g: Gun): number | null => (g.reload > 0 ? 1 - g.reload / reloadOf(g) : null);
/** The hotbar's glyph for stores of each use. */
const ITEM: Record<Use, Item> = {
  smallShield: 'item.smallShield', bigShield: 'item.bigShield', repairKit: 'item.repairKit', fullRepair: 'item.fullRepair',
};
/** The hotbar's slot (HOTBAR) for the hold's slot `n` (1–3: the items'; sim/hold.ts chosen). */
const itemSlot = (n: number) => HOTBAR.guns - 1 + n;
/** A tap on the hotbar's slot `tapped` as her stores are asked it (sim/stores.ts Ask): a gun slot's takes that gun in
 *  hand (arm), an item slot's is the hold's (tap, 1–3). */
const tapOf = (tapped: number | null) => ({
  arm: tapped !== null && tapped < HOTBAR.guns ? tapped : null,
  tap: tapped !== null && tapped >= HOTBAR.guns ? tapped - HOTBAR.guns + 1 : null,
});

/** What the camera does, as the match's flow sets it (play/referee.ts): the ship it follows; whether the hands steer
 * and look, or only look (as she watches another ship); and her end's shot, held on her ship (finale.ts), or none. */
interface View { watch: number; hands: boolean; look: boolean; end: Ending | null }

/** world: the planet and its climate; anchors: the sea's (frame.ts), for the waves' CPU copy; waters: the planet's
 *  water sounded (state.ts); start: where she lies in the lobby and the bearing she heads (radians); first: the match
 *  in hand until another is dealt. */
export function createGame(world: World, anchors: readonly Anchor[], waters: Waters, start: { at: Vec3; bearing: number }, first: Match) {
  const ground = world.planet.height, depth = (p: Vec3) => -ground(p), rises = world.planet.rises;
  const sea = createSwell(anchors, ground, world.climate.seaWind, { shortest: RIDE.shortest });
  const state = createState(world.planet, sea.hull, waters, first);
  const chase = createChase(ground, sea.at);
  const clock = fixedClock();
  /** Whether her gun's trigger was held or pressed since the last frame that stepped, the hotbar's slot last tapped and
   *  whether Gust was pressed; how far the moment drawn is through the last step. */
  let pulled = false, tapped: number | null = null, gusted = false, between = 0;
  /** The camera: what the flow sets, and seconds since her end's shot began. */
  let view: View = { watch: PLAYER, hands: true, look: true, end: null }, ended = 0;
  /** Her pose as last drawn. */
  let last: ShipPose = { position: scale(start.at, R), forward: bearingAt(start.at, start.bearing), up: start.at };
  /** Seconds since the match began while the eye is still coming down onto her (arrival.ts), else null. */
  let arrival: number | null = null;
  /** Her helm while lashed, until a hand takes it. */
  let held: ((s: ShipState) => Helm) | null = null;
  /** Whether she lies at anchor in the lobby, where the camera has been dragged round her (written over), and its eye
   *  as last placed (into its own, kept), if it has been; and the floor it is kept over, of the land and the sea at the
   *  world's clock `floorAt`. */
  let anchored = false, berth: Eye | null = null, floorAt = 0;
  const orbit: Orbit = { ...REST }, berthed = eyeOut(), floor = (p: Vec3) => Math.max(ground(p), sea.at(p, floorAt));
  /** The camera's answer to what happens, the match's time held on a blow, and the last moment they answered. */
  const shake = createShake(), stops = createStops();
  let answered = 0;

  /** The hands' orders: the stick's push as a heading across the sea as the camera sees it. */
  const orders = (stick: Hands['stick']): Helm => {
    const push = stick ? Math.hypot(stick.x, stick.y) : 0;
    if (!stick || push < DEAD) return { course: null, throttle: 0 };
    const { ahead, right } = chase.axes();
    return { course: add(scale(ahead, stick.y), right, stick.x), throttle: Math.min(1, (push - DEAD) / (1 - DEAD)) };
  };

  /** The storm's calm as the HUD last read it (a new object only when it has moved or changed by a metre). */
  let calm = { centre: [0, 0, 1] as Vec3, radius: -1 };

  /** What the HUD reads (status), and what she carries (kit), as last reported: one object each, refilled each time,
   *  with what hangs off them (the gun in hand, the reticle and its fall, the calm the storm next closes to, the
   *  hotbar's slots, the moments) kept beside them and handed out or not. */
  const report: Status = {
    at: start.at, heading: start.at, facing: start.at, arriving: 0, hull: 0, hullMax: HEALTH.hull, shield: 0,
    shieldMax: HEALTH.shield, gun: null, afloat: 0, sunk: false, storm: 0, closing: false, eye: calm, next: null,
    outside: 0, reticle: null, moments: [],
  };
  const holding: NonNullable<Status['gun']> = {
    kind: 'cannon', rarity: 0, rounds: 0, ready: 1, charge: null, swapping: 0, locked: false,
  };
  const aim: NonNullable<Status['reticle']> = { fall: null, reach: false, spread: 0, lob: false };
  const fallAt: Point = { x: 0, y: 0 }, screen: Viewport = { width: 0, height: 0 };
  const closesTo: { centre: Vec3; radius: number } = { centre: start.at, radius: 0 };
  const gunSlots: GunSlot[] = [], itemSlots: Slot[] = [];
  const carried: Kit & { guns: [GunSlot | null, GunSlot | null]; items: [Slot | null, Slot | null, Slot | null] } = {
    guns: [null, null], items: [null, null, null], chosen: 0, using: null, offer: null, gust: 0, gusts: GUST.charges, blowing: false,
  };
  for (let i = 0; i < HOTBAR.guns; i++) gunSlots.push({ kind: 'cannon', rarity: 0, rounds: 0, mag: 0, reload: null });
  for (let i = 0; i < HOTBAR.items; i++) itemSlots.push({ item: ITEM.repairKit });
  const moments: Moment[] = [];

  /** Her gun in hand, `equip` s through taking it up, `locked` if its assist has a ship to lay on. */
  const inHandOf = (g: Gun, equip: number, locked: boolean) => {
    holding.kind = g.kind;
    holding.rarity = g.rarity;
    holding.rounds = g.rounds;
    holding.ready = reloading(g) ?? 1;
    holding.charge = g.windup > 0 ? 1 - g.windup / GUNS[g.kind].windup : null;
    holding.swapping = equip / EQUIP;
    holding.locked = locked;
    return holding;
  };
  /** Her gun's aim as `lay` lays it, its balls going off within `spread` px where they come down. */
  const reticleOf = (lay: Laying, g: Gun, eye: Eye, spread: number) => {
    aim.fall = screen.width > 0 ? placed(fallAt, eye, lay.fall, GUN.up, screen) : null;
    aim.reach = lay.reached;
    aim.spread = spread;
    aim.lob = GUNS[g.kind].lob > 0;
    return aim;
  };
  /** The calm the storm next closes to, its radius in whole metres. */
  const nextOf = (next: { centre: Vec3; radius: number }) => {
    closesTo.centre = next.centre;
    closesTo.radius = Math.round(next.radius * R);
    return closesTo;
  };
  /** Whether the calm's centre has moved by more than a metre on any axis. */
  const moved = (a: Vec3, b: Vec3) => Math.abs(a[0] - b[0]) * R > 1 || Math.abs(a[1] - b[1]) * R > 1 || Math.abs(a[2] - b[2]) * R > 1;
  /** Metres from the eye to where her ball will come down, at her gun's height over it. */
  const far = (eye: Eye, fall: Vec3) => {
    const up = R + GUN.up, e = eye.position, x = fall[0] * up - e[0], y = fall[1] * up - e[1], z = fall[2] * up - e[2];
    return Math.sqrt(x * x + y * y + z * z);
  };
  /** The match's deeds as she sees them through `eye` on the screen: one Moment kept for each while the match keeps
   *  it, seen again in place each time (moments.ts see). */
  const momentsSeen = (eye: Eye) => {
    const deeds = state.deeds();
    let gone = 0;
    while (gone < moments.length && (!deeds.length || moments[gone].seq < deeds[0].seq)) gone++;
    if (gone) moments.splice(0, gone);
    for (const m of moments) see(m, eye, screen);
    const seen = moments.length ? moments[moments.length - 1].seq : 0;
    for (const d of deeds) if (d.seq > seen) moments.push(seenOf(d, eye, screen.width, screen.height));
    return moments;
  };

  /** What is drawn (snapshot), as last drawn: one object, refilled each time, the loot near the eye in a list kept
   *  beside it, one entry kept for each place in it. */
  const loot: LootDraw[] = [], floating: LootDraw[] = [], spots: [number, number, number][] = [];
  const drawn: Snapshot = {
    eye: chase.eye(), clock: 0, storm: state.storm(0), ships: [], own: PLAYER, balls: [], loot, blasts: [],
  };

  /** How her gun would be laid now along the camera's look, with no spread: as the next step would lay it. */
  const aimed = (v: Vessel, gun: Gun): Laying => laid(v, gun, chase.sight(), state.vessels(), 0, depth, 0, rises);

  /** A new match or sea: the camera behind her, its shots and orders as at the start, her helm free. */
  const restart = (her: ShipPose, anchor = false) => {
    view = { watch: PLAYER, hands: true, look: true, end: null };
    ended = 0;
    anchored = anchor;
    Object.assign(orbit, REST);
    berth = null;
    shake.clear();
    stops.clear();
    answered = state.deeds().at(-1)?.seq ?? answered;
    held = null;
    arrival = null;
    last = her;
    chase.reset(last, state.clock(1));
  };
  /** Whether her hands are on her ship: the flow gives them (view), she is not at anchor, and the eye is down with her. */
  const steering = () => view.hands && !anchored && arrival === null;
  restart(state.anchor(start), true);

  return {
    /** Whether her hands are on her ship (steering and looking), or the match's flow, the lobby or the arrival has them. */
    steering,
    /** A frame of dt seconds, her hands as read for it (none while the match's flow, the lobby or the arrival has
     *  them): the match stepped on, the camera moved after the ship it follows. */
    step(dt: number, read: Hands) {
      const hands = steering() ? read : IDLE;
      if (hands.stick || hands.look.held) held = null;
      pulled ||= hands.fire;
      gusted ||= hands.gust;
      if (hands.tap !== null) tapped = hands.tap;
      // what happened since the last frame, answered from where the camera now looks
      const me = view.watch, lens = chase.eye();
      for (const d of state.deeds()) {
        if (d.seq <= answered) continue;
        answered = d.seq;
        const a = anchored || arrival !== null ? null : answerTo(d, me);
        if (!a) continue;
        const seen = seenOf(d, lens, 0, 0);
        shake.play(a.answer, a.strength, d.ship === me ? undefined : seen.bearing, seen.metres);
        const stop = stopFor(d, me);
        if (stop) stops.request(stop.stop, stop.strength);
      }
      shake.update(dt);
      const time = clock(stops.update(dt));
      for (let i = 0; i < time.steps; i++) {
        const v = state.mine();
        const helm = !v ? { course: null, throttle: 0 } : held ? held(v.ship) : orders(hands.stick);
        const { arm, tap } = tapOf(tapped);
        state.advance(helm, { aim: chase.sight(), fire: !!v && pulled }, { tap, arm, gust: gusted, take: null });
        [tapped, gusted] = [null, false];
      }
      // the trigger held through all of a frame's steps
      if (time.steps > 0) pulled = false;
      between = time.between;
      last = state.poseOf(PLAYER, between) ?? last;
      if (anchored) {
        // at anchor, the look's drag turns the camera round her; let go, it eases home
        dragged(orbit, read.look, orbit);
        if (!read.look.held) relaxed(orbit, dt, orbit);
        floorAt = state.clock(between);
        berth = anchorageEye(last, orbit, floorAt, floor, berthed);
        return;
      }
      const followed = view.watch === PLAYER ? last : state.poseOf(view.watch, between) ?? last;
      ended += dt;
      // watching another ship, her hands still turn the look about it
      const look = view.look && arrival === null ? read.look : hands.look;
      chase.update(followed, look, dt, state.clock(1), state.storm(1), finale(view.end, ended));
      if (arrival !== null && !arriving((arrival += dt), last, chase.eye())) arrival = null;
    },
    /** What is drawn now (snapshot.ts): the same object each time, refilled. */
    snapshot(): Snapshot {
      const eye = chase.eye(), time = state.clock(between), near = normalize(last.position);
      const seen = anchored ? berth ?? anchorageEye(last, orbit, time, ground, berthed)
        : (arrival !== null && arriving(arrival, last, eye)) || shake.on(eye);
      let n = 0;
      for (const l of state.loot().pieces) {
        if (distance(seen.position, l.at) > DRAWN) continue;
        const up = dot(near, l.at) > Math.cos(RIDES / R) ? sea.at(l.at, time) : 0, k = R + up;
        const at = (spots[n] ??= [0, 0, 0]), d = (floating[n] ??= { id: 0, at, kind: 'cannon', rarity: 0, born: 0 });
        at[0] = l.at[0] * k;
        at[1] = l.at[1] * k;
        at[2] = l.at[2] * k;
        d.id = l.id;
        d.kind = l.goods.kind;
        d.rarity = rarityOf(l.goods);
        d.born = state.born(l.id) ?? -LONG_AGO;
        loot[n++] = d;
      }
      loot.length = n;
      drawn.eye = seen;
      drawn.clock = time;
      drawn.storm = state.storm(between);
      drawn.ships = state.drawn(between);
      drawn.balls = state.balls(between);
      drawn.blasts = state.blasts();
      drawn.sea = state.sea(between);
      return drawn;
    },
    /** What she carries, as the hotbar shows it: the same object each time, refilled. */
    kit(): Kit {
      const c = state.crew(PLAYER), v = state.mine(), h = c.hold, slots = carried.guns, items = carried.items;
      for (let i = 0; i < slots.length; i++) {
        const g = c.guns[i], slot = gunSlots[i];
        if (g) {
          slot.kind = g.kind;
          slot.rarity = g.rarity;
          slot.rounds = g.rounds;
          slot.mag = GUNS[g.kind].mag;
          slot.reload = reloading(g);
        }
        slots[i] = g ? slot : null;
      }
      for (let i = 0; i < items.length; i++) {
        const k = h.items[i], slot = itemSlots[i];
        if (k) {
          slot.item = ITEM[k.kind];
          slot.count = k.count;
        }
        items[i] = k ? slot : null;
      }
      const o = v ? offered(c, v.ship.at, state.loot()) : null, charge = charging(c.gust);
      carried.chosen = h.chosen === 0 ? c.hand : itemSlot(h.chosen);
      carried.using = progress(h);
      carried.offer = o?.gun ? c.hand : o?.item ? itemSlot(Math.max(1, h.chosen)) : null;
      carried.gust = c.gust.charges + (charge < 1 ? charge : 0);
      carried.blowing = c.gust.blowing > 0;
      return carried;
    },
    /** What the HUD reads of the match, on a view `width` × `height` CSS px (where the ball will come down): the same
     *  object each time, refilled. */
    status(width = 0, height = 0): Status {
      const c = state.crew(PLAYER), v = state.mine(), s = state.storm(between), g = inHand(c), eye = chase.eye();
      screen.width = width;
      screen.height = height;
      const lay = g && v && steering() ? aimed(v, g) : null;
      // her balls' spread where they come down, as px on the screen there
      const off = lay && v && g ? distance(v.ship.at, lay.fall) * spreadOf(g) : 0, seen = lay ? far(eye, lay.fall) : 1;
      const radius = Math.round(s.radius * R);
      if (radius !== calm.radius || moved(s.centre, calm.centre)) calm = { centre: s.centre, radius };
      // once she has sunk, the disc is the watched ship's (ui/hud.ts watch)
      const watched = view.watch !== PLAYER || sunk(c.health) ? state.vessel(view.watch)?.ship ?? state.sinking(view.watch) : null;
      report.at = watched?.at ?? v?.ship.at ?? normalize(last.position);
      report.heading = watched?.heading ?? v?.ship.heading ?? last.forward;
      report.facing = chase.axes().ahead;
      report.arriving = arrival === null ? 0 : Math.max(0, 1 - arrival / ARRIVAL.seconds);
      report.hull = c.health.hull;
      report.shield = c.health.shield;
      report.gun = g ? inHandOf(g, c.equip, lay?.target != null) : null;
      report.afloat = state.alive().length;
      report.sunk = sunk(c.health);
      report.storm = Number.isFinite(s.secondsToNext) ? s.secondsToNext : 0;
      report.closing = s.closing;
      report.eye = calm;
      report.next = s.phase < STORM.phases.length && (s.closing || s.next.radius < s.radius) ? nextOf(s.next) : null;
      report.outside = v ? Math.max(0, -toEdge(v.ship.at, s)) : 0;
      const spread = (off * height) / (2 * Math.max(1, seen) * Math.tan((eye.fov * Math.PI) / 360));
      report.reticle = lay && g ? reticleOf(lay, g, eye, spread) : null;
      report.moments = momentsSeen(eye);
      return report;
    },
    sinkings: state.sinkings,
    /** Her share of the planet's water now, 0…1. */
    share: () => state.share(PLAYER),
    ships: state.ships,
    alive: state.alive,
    /** A new match: every ship afloat at her berth, hers the first, and the eye coming down onto her from space. */
    start(m: Match) {
      restart(state.start(m));
      arrival = 0;
    },
    /** A quiet sea for the lobby: her ship alone where she lies at the start. */
    anchor() {
      restart(state.anchor(start), true);
    },
    /** The camera's orders from the match's flow: a new ship to follow is flown to; her end's shot begins. */
    view(next: View) {
      if (next.watch !== view.watch) chase.fly();
      if (next.end !== view.end) ended = 0;
      view = next;
    },
    /** What only the debug switches (src/debug.ts) ask of the game. */
    debug: {
      /** A match at sea about her: her ship where she lies in the lobby, the others about her. */
      atSea(others: readonly Berth[]) {
        restart(state.debug.atSea(start, others));
      },
      /** Lashes her helm: from the next step she sails by `helm` (given her ship as she lies) until a hand takes the
       *  helm (the stick pushed or the look dragged). */
      lash(helm: (s: ShipState) => Helm) {
        held = helm;
      },
      sink: state.debug.sink,
      strew: state.debug.strew,
    },
  };
}

export type Game = ReturnType<typeof createGame>;

import type { World } from '../world/environment.ts';
import { fixedClock } from '../sim/fixed.ts';
import { fitOf, inHand, type Crew } from '../sim/battle.ts';
import { laid, reloadOf, spreadOf, type Gun, type Laying } from '../sim/gun.ts';
import { charging } from '../sim/gust.ts';
import { EQUIP, GUN, GUNS, GUST, HEALTH } from '../sim/handling.ts';
import { progress } from '../sim/hold.ts';
import { offered, rarityOf } from '../sim/loot.ts';
import { toEdge } from '../sim/storm.ts';
import { hullCap, sunk } from '../sim/health.ts';
import { RIDE } from '../sim/ride.ts';
import { PLAYER } from '../sim/match.ts';
import type { Vessel } from '../sim/contact.ts';
import type { Helm, ShipState } from '../sim/ship.ts';
import type { Use } from '../sim/kinds.ts';
import type { Eye, LootDraw, Snapshot, StormDraw } from '../render/snapshot.ts';
import { createSwell } from '../world/swell.ts';
import type { Anchor } from '../world/lattice.ts';
import type { ShipPose } from '../world/pose.ts';
import {
  R,
  add,
  bearingAt,
  distance,
  dot,
  normalize,
  scale,
  type Vec3,
} from '../world/sphere.ts';
import {
  PLAYER_SHIP,
  HOTBAR,
  IDLE,
  type Deed,
  type GunSlot,
  type Thumbs,
  type Item,
  type Kit,
  type Moment,
  type Slot,
  type Status,
} from './player.ts';
import {
  FOCI,
  LOOSE,
  PARTS,
  REST,
  WHOLE,
  anchorageEye,
  dragged,
  eyeOut,
  focused,
  framed,
  relaxed,
  turned,
  type Framing,
  type Orbit,
  type PartType,
} from './anchorage.ts';
import { ARRIVAL, arriving } from './arrival.ts';
import { createChase } from './chase.ts';
import { placed, type Point, type View as Viewport } from './lens.ts';
import { finale, type Ending } from './finale.ts';
import { see, seenOf } from './moments.ts';
import { answerTo, createShake } from './shake.ts';
import { createStops, stopFor } from './stops.ts';
import { createState, debugOf, type Berth } from './state.ts';
import type { Rig } from '../sim/engine.ts';
import type { MatchSetup } from '../sim/setup.ts';
import { watered, type Berthed, type Soundings } from '../sim/waters.ts';
import type { Livery } from '../world/livery.ts';

export interface DebugDamage {
  wear: 0 | 1 | 2;
}

const DEAD = 0.15;
const DRAWN = 700,
  RIDES = 320;
const LONG_AGO = 1e3;
const reloading = (g: Gun, c: Crew): number | null =>
  g.reload > 0 ? 1 - g.reload / reloadOf(g, fitOf(c).reload) : null;
const ITEM: Record<Use, Item> = {
  smallShield: 'item.smallShield',
  bigShield: 'item.bigShield',
  repairKit: 'item.repairKit',
  fullRepair: 'item.fullRepair',
};
const itemSlot = (n: number) => HOTBAR.guns - 1 + n;
const tapOf = (tapped: number | null) => ({
  arm: tapped !== null && tapped < HOTBAR.guns ? tapped : null,
  tap:
    tapped !== null && tapped >= HOTBAR.guns ? tapped - HOTBAR.guns + 1 : null,
});

interface View {
  watch: number;
  hands: boolean;
  look: boolean;
  end: Ending | null;
}

export function createGame(
  world: World,
  anchors: readonly Anchor[],
  soundings: Soundings,
  start: { at: Vec3; bearing: number }
) {
  const ground = world.planet.height,
    depth = (p: Vec3) => -ground(p),
    rises = world.planet.rises;
  const sea = createSwell(anchors, ground, world.climate.seaWind, {
    shortest: RIDE.shortest,
  });
  const state = createState(watered(world.planet, soundings, sea.hull), start);
  const chase = createChase(ground, sea.at);
  const clock = fixedClock();
  let pulled = false,
    tapped: number | null = null,
    gusted = false,
    between = 0;
  let view: View = { watch: PLAYER, hands: true, look: true, end: null },
    ended = 0;
  let last: ShipPose = {
    position: scale(start.at, R),
    forward: bearingAt(start.at, start.bearing),
    up: start.at,
  };
  let arrival: number | null = null;
  let held: ((s: ShipState) => Helm) | null = null;
  let anchored = false,
    berth: Eye | null = null,
    floorAt = 0,
    aside = false;
  const orbit: Orbit = { ...REST },
    berthed = eyeOut(),
    floor = (p: Vec3) => Math.max(ground(p), sea.at(p, floorAt));
  let wanted: Readonly<Framing> = WHOLE,
    part: PartType | null = null;
  const framing: Framing = { center: [0, 0], size: 1 },
    seat = { orbit, focus: { ...LOOSE } },
    nudge = { x: 0, y: 0, held: false };
  const reframe = () => {
    framing.center[0] = wanted.center[0];
    framing.center[1] = wanted.center[1];
    framing.size = wanted.size;
  };
  const shake = createShake(),
    stops = createStops();
  let answered = 0;
  let worn: DebugDamage | null = null;

  const orders = (stick: Thumbs['stick']): Helm => {
    const push = stick ? Math.hypot(stick.x, stick.y) : 0;
    if (!stick || push < DEAD) return { course: null, throttle: 0 };
    const { ahead, right } = chase.axes();
    return {
      course: add(scale(ahead, stick.y), right, stick.x),
      throttle: Math.min(1, (push - DEAD) / (1 - DEAD)),
    };
  };

  let calm: { center: Vec3; radius: number } = {
    center: [0, 0, 1],
    radius: -1,
  };

  const report: Status = {
    at: start.at,
    heading: start.at,
    facing: start.at,
    arriving: 0,
    hull: 0,
    hullMax: HEALTH.hull,
    shield: 0,
    shieldMax: HEALTH.shield,
    gun: null,
    afloat: 0,
    sunk: false,
    storm: 0,
    closing: false,
    eye: calm,
    next: null,
    outside: 0,
    reticle: null,
    moments: [],
    race: null,
  };
  const holding: NonNullable<Status['gun']> = {
    kind: 'cannon',
    rarity: 0,
    rounds: 0,
    ready: 1,
    charge: null,
    swapping: 0,
    locked: false,
  };
  const aim: NonNullable<Status['reticle']> = {
    fall: null,
    reach: false,
    spread: 0,
    lob: false,
  };
  const fallAt: Point = { x: 0, y: 0 },
    screen: Viewport = { width: 0, height: 0 };
  const closesTo: { center: Vec3; radius: number } = {
    center: start.at,
    radius: 0,
  };
  const gunSlots: GunSlot[] = [],
    itemSlots: Slot[] = [];
  const carried: Kit & {
    guns: [GunSlot | null, GunSlot | null];
    items: [Slot | null, Slot | null, Slot | null];
  } = {
    guns: [null, null],
    items: [null, null, null],
    chosen: 0,
    using: null,
    offer: null,
    gust: 0,
    gusts: GUST.charges,
    blowing: false,
  };
  for (let i = 0; i < HOTBAR.guns; i++)
    gunSlots.push({
      kind: 'cannon',
      rarity: 0,
      rounds: 0,
      mag: 0,
      reload: null,
    });
  for (let i = 0; i < HOTBAR.items; i++)
    itemSlots.push({ item: ITEM.repairKit });
  const moments: Moment[] = [];

  const inHandOf = (g: Gun, c: Crew, locked: boolean) => {
    holding.kind = g.kind;
    holding.rarity = g.rarity;
    holding.rounds = g.rounds;
    holding.ready = reloading(g, c) ?? 1;
    holding.charge = g.windup > 0 ? 1 - g.windup / GUNS[g.kind].windup : null;
    holding.swapping = c.equip / EQUIP;
    holding.locked = locked;
    return holding;
  };
  const reticleOf = (lay: Laying, g: Gun, eye: Eye, spread: number) => {
    aim.fall =
      screen.width > 0 ? placed(fallAt, eye, lay.fall, GUN.up, screen) : null;
    aim.reach = lay.reached;
    aim.spread = spread;
    aim.lob = GUNS[g.kind].lob > 0;
    return aim;
  };
  const nextOf = (next: { center: Vec3; radius: number }) => {
    closesTo.center = next.center;
    closesTo.radius = Math.round(next.radius * R);
    return closesTo;
  };
  const moved = (a: Vec3, b: Vec3) =>
    Math.abs(a[0] - b[0]) * R > 1 ||
    Math.abs(a[1] - b[1]) * R > 1 ||
    Math.abs(a[2] - b[2]) * R > 1;
  const far = (eye: Eye, fall: Vec3) => {
    const up = R + GUN.up,
      e = eye.position,
      x = fall[0] * up - e[0],
      y = fall[1] * up - e[1],
      z = fall[2] * up - e[2];
    return Math.sqrt(x * x + y * y + z * z);
  };
  const momentsSeen = (eye: Eye) => {
    const deeds = state.deeds();
    let gone = 0;
    while (
      gone < moments.length &&
      (!deeds.length || moments[gone].seq < deeds[0].seq)
    )
      gone++;
    if (gone) moments.splice(0, gone);
    for (const m of moments) see(m, eye, screen, dealer(m));
    const seen = moments.length ? moments[moments.length - 1].seq : 0;
    for (const d of deeds)
      if (d.seq > seen)
        moments.push(seenOf(d, eye, screen.width, screen.height, dealer(d)));
    return moments;
  };
  const dealer = (d: Deed) =>
    d.kind === 'struck' && d.ship === PLAYER_SHIP && !d.ram && d.by !== d.ship
      ? (state.vessel(d.by)?.ship.at ?? null)
      : null;

  const loot: LootDraw[] = [],
    floating: LootDraw[] = [],
    spots: [number, number, number][] = [];
  const storm: StormDraw = {
    center: state.storm(0).center,
    radius: state.storm(0).radius,
    closing: false,
  };
  const drawn: Snapshot = {
    eye: chase.eye(),
    clock: 0,
    storm,
    ships: [],
    own: PLAYER,
    balls: [],
    loot,
    blasts: [],
  };

  const aimed = (v: Vessel, gun: Gun): Laying =>
    laid(v, gun, chase.sight(), state.marks(v.id), {
      seed: 0,
      depth,
      spread: 0,
      cone: state.assist()[gun.rarity],
      rises,
    });

  const restart = (pose: ShipPose, anchor = false) => {
    view = { watch: PLAYER, hands: true, look: true, end: null };
    ended = 0;
    anchored = anchor;
    Object.assign(orbit, REST);
    berth = null;
    wanted = WHOLE;
    part = null;
    Object.assign(seat.focus, LOOSE);
    reframe();
    shake.clear();
    stops.clear();
    answered = state.deeds().at(-1)?.seq ?? answered;
    held = null;
    arrival = null;
    last = pose;
    chase.reset(last, state.clock(1));
  };
  const steering = () => view.hands && !anchored && arrival === null;
  restart(state.anchor(start), true);

  return {
    steering,
    wear: state.wear,
    worn: state.worn,
    broadside(on: boolean) {
      aside = on;
    },
    stage(to: { framing: Readonly<Framing>; focus?: string | null } | null) {
      const cut = wanted === WHOLE;
      wanted = to?.framing ?? WHOLE;
      part = PARTS.find((p) => p === to?.focus) ?? null;
      if (cut) reframe();
    },
    look(x: number, y: number, held: boolean) {
      nudge.x += x;
      nudge.y += y;
      nudge.held = held;
    },
    step(dt: number, read: Thumbs) {
      const hands = steering() ? read : IDLE;
      if (hands.stick || hands.look.held) held = null;
      pulled ||= hands.fire;
      gusted ||= hands.gust;
      if (hands.tap !== null) tapped = hands.tap;
      const me = view.watch,
        lens = chase.eye();
      for (const d of state.deeds()) {
        if (d.seq <= answered) continue;
        answered = d.seq;
        const a = anchored || arrival !== null ? null : answerTo(d, me);
        if (!a) continue;
        const seen = seenOf(d, lens, 0, 0);
        shake.play(
          a.answer,
          a.strength,
          d.ship === me ? undefined : seen.bearing,
          seen.meters
        );
        const stop = stopFor(d, me);
        if (stop) stops.request(stop.stop, stop.strength);
      }
      shake.update(dt);
      const time = clock(stops.update(dt));
      for (let i = 0; i < time.steps; i++) {
        const v = state.mine();
        const helm = !v
          ? { course: null, throttle: 0 }
          : held
            ? held(v.ship)
            : orders(hands.stick);
        const { arm, tap } = tapOf(tapped);
        state.step({
          course: helm.course,
          throttle: helm.throttle,
          aim: chase.sight(),
          fire: !!v && pulled,
          gust: gusted,
          heal: tap,
          arm,
        });
        [tapped, gusted] = [null, false];
      }
      if (time.steps > 0) pulled = false;
      between = time.between;
      last = state.poseOf(PLAYER, between) ?? last;
      if (anchored) {
        const drag = { x: read.look.x + nudge.x, y: read.look.y + nudge.y },
          held = read.look.held || nudge.held;
        nudge.x = nudge.y = 0;
        dragged(orbit, drag, orbit);
        if (!held) relaxed(orbit, dt, orbit);
        turned(orbit, aside, dt, orbit);
        focused(seat.focus, part ? FOCI[part] : LOOSE, dt);
        floorAt = state.clock(between);
        framed(framing, wanted, dt);
        berthed.center[0] = framing.center[0];
        berthed.center[1] = framing.center[1];
        berthed.size = framing.size;
        berth = anchorageEye(last, seat, floorAt, floor, berthed);
        return;
      }
      const followed =
        view.watch === PLAYER
          ? last
          : (state.poseOf(view.watch, between) ?? last);
      ended += dt;
      const look = view.look && arrival === null ? read.look : hands.look;
      chase.update(
        followed,
        look,
        dt,
        state.clock(1),
        state.storm(1),
        finale(view.end, ended)
      );
      if (arrival !== null && !arriving((arrival += dt), last, chase.eye()))
        arrival = null;
    },
    snapshot(): Snapshot {
      const eye = chase.eye(),
        time = state.clock(between),
        near = normalize(last.position);
      const seen = anchored
        ? (berth ?? anchorageEye(last, seat, time, ground, berthed))
        : (arrival !== null && arriving(arrival, last, eye)) || shake.on(eye);
      let n = 0;
      for (const l of state.loot().pieces) {
        if (distance(seen.position, l.at) > DRAWN) continue;
        const up =
            dot(near, l.at) > Math.cos(RIDES / R) ? sea.at(l.at, time) : 0,
          k = R + up;
        const at = (spots[n] ??= [0, 0, 0]),
          d = (floating[n] ??= {
            id: 0,
            at,
            kind: 'cannon',
            rarity: 0,
            born: 0,
          });
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
      const st = state.storm(between);
      storm.center = st.center;
      storm.radius = st.radius;
      storm.closing = st.closing && view.end !== 'won';
      drawn.ships = state.drawn(between);
      if (worn) for (const d of drawn.ships) if (d.afloat) d.wear = worn.wear;
      drawn.balls = state.balls(between);
      drawn.blasts = state.blasts();
      drawn.sea = state.sea(between);
      return drawn;
    },
    kit(): Kit {
      const c = state.crew(PLAYER),
        v = state.mine(),
        h = c.hold,
        slots = carried.guns,
        items = carried.items;
      for (let i = 0; i < slots.length; i++) {
        const g = c.guns[i],
          slot = gunSlots[i];
        if (g) {
          slot.kind = g.kind;
          slot.rarity = g.rarity;
          slot.rounds = g.rounds;
          slot.mag = GUNS[g.kind].mag;
          slot.reload = reloading(g, c);
        }
        slots[i] = g ? slot : null;
      }
      for (let i = 0; i < items.length; i++) {
        const k = h.items[i],
          slot = itemSlots[i];
        if (k) {
          slot.item = ITEM[k.kind];
          slot.count = k.count;
        }
        items[i] = k ? slot : null;
      }
      const o = v ? offered(c, v.ship.at, state.loot()) : null,
        charge = charging(c.gust);
      carried.chosen = h.chosen === 0 ? c.hand : itemSlot(h.chosen);
      carried.using = progress(h);
      carried.offer = o?.gun
        ? c.hand
        : o?.item
          ? itemSlot(Math.max(1, h.chosen))
          : null;
      carried.gust = c.gust.charges + (charge < 1 ? charge : 0);
      carried.blowing = c.gust.blowing > 0;
      return carried;
    },
    status(width = 0, height = 0): Status {
      const c = state.crew(PLAYER),
        v = state.mine(),
        s = state.storm(between),
        g = inHand(c),
        eye = chase.eye();
      screen.width = width;
      screen.height = height;
      const lay = g && v && steering() ? aimed(v, g) : null;
      const off =
          lay && v && g ? distance(v.ship.at, lay.fall) * spreadOf(g) : 0,
        seen = lay ? far(eye, lay.fall) : 1;
      const radius = Math.round(s.radius * R);
      if (radius !== calm.radius || moved(s.center, calm.center))
        calm = { center: s.center, radius };
      const watched =
        view.watch !== PLAYER || sunk(c.health)
          ? (state.vessel(view.watch)?.ship ?? state.sinking(view.watch))
          : null;
      report.at = watched?.at ?? v?.ship.at ?? normalize(last.position);
      report.heading = watched?.heading ?? v?.ship.heading ?? last.forward;
      report.facing = chase.axes().ahead;
      report.arriving =
        arrival === null ? 0 : Math.max(0, 1 - arrival / ARRIVAL.seconds);
      const w = (watched ? state.crew(view.watch) : c) ?? c;
      report.hull = w.health.hull;
      report.hullMax = hullCap(w.health);
      report.shield = w.health.shield;
      report.gun = g ? inHandOf(g, c, lay?.target != null) : null;
      report.afloat = state.alive().length;
      report.sunk = sunk(c.health);
      report.storm = Number.isFinite(s.secondsToNext) ? s.secondsToNext : 0;
      report.closing = s.closing;
      report.eye = calm;
      report.next =
        !s.final && (s.closing || s.next.radius < s.radius)
          ? nextOf(s.next)
          : null;
      report.outside = v ? Math.max(0, -toEdge(v.ship.at, s)) : 0;
      const spread =
        (off * height) /
        (2 * Math.max(1, seen) * Math.tan((eye.fov * Math.PI) / 360));
      report.reticle = lay && g ? reticleOf(lay, g, eye, spread) : null;
      report.moments = momentsSeen(eye);
      report.race = state.race(PLAYER);
      return report;
    },
    sinkings: state.sinkings,
    share: () => state.share(PLAYER),
    ships: state.ships,
    alive: state.alive,
    race() {
      const teams = state.teams();
      if (!teams) return null;
      const over = state.done();
      return {
        teams,
        over,
        place: over ? state.order().indexOf(PLAYER) + 1 : 0,
      };
    },
    done: state.done,
    result: state.result,
    start(setup: MatchSetup, liveries: readonly Livery[], berthed?: Berthed) {
      restart(state.start(setup, liveries, berthed));
      arrival = 0;
    },
    anchor() {
      restart(state.anchor(start), true);
    },
    view(next: View) {
      if (next.watch !== view.watch) chase.fly();
      if (next.end !== view.end) ended = 0;
      view = next;
    },
    debug: {
      atSea(setup: MatchSetup, others: readonly Berth[], rig?: Rig) {
        restart(debugOf(state).atSea(setup, start, others, rig));
      },
      rig(rig: Rig, setup: MatchSetup, liveries: readonly Livery[]) {
        restart(debugOf(state).rig(rig, setup, liveries));
        arrival = 0;
      },
      lash(helm: (s: ShipState) => Helm) {
        held = helm;
      },
      sink: debugOf(state).sink,
      strew: debugOf(state).strew,
      wear(w: DebugDamage | null) {
        worn = w;
      },
    },
  };
}

export type Game = ReturnType<typeof createGame>;

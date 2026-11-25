import { loosed } from '../sim/shot.ts';
import type { Crew } from '../sim/battle.ts';
import {
  createMatch,
  createMooring,
  debugOf as debugOfMatch,
  type Match,
  type Mooring,
  type Rig,
  type Stepped,
} from '../sim/engine.ts';
import { STEP, blendPose } from '../sim/fixed.ts';
import { pose, ride, settled, type Ride } from '../sim/ride.ts';
import { shipAt, type ShipState } from '../sim/ship.ts';
import type { Hands } from '../sim/hands.ts';
import { wearOf } from '../sim/health.ts';
import { indexed } from '../sim/indexed.ts';
import type { GunKind, Rarity } from '../sim/kinds.ts';
import { PLAYER } from '../sim/match.ts';
import type { Memory } from '../sim/bot.ts';
import type { Sighter } from '../sim/orders.ts';
import type { MatchSetup, ShipValues } from '../sim/setup.ts';
import type { Berthed, Waters } from '../sim/waters.ts';
import type { BallDraw, Look, Sea, ShipDraw } from '../render/snapshot.ts';
import type { Hull } from '../world/swell.ts';
import type { PoseOut, ShipPose } from '../world/pose.ts';
import { hash } from '../world/random.ts';
import { R, add, scale, type Vec3 } from '../world/sphere.ts';
import { EMBLEMS, LIVERY, type Livery } from '../world/livery.ts';
import type { Race } from './player.ts';
import { lookOf, worn } from './colors.ts';
import { createDrawing } from './drawing.ts';
import { createHeld } from './held.ts';
import { createLog, NOTHING_DONE } from './moments.ts';
import { createStandings } from './standings.ts';
import { sinking } from './sinking.ts';

export interface Berth extends Mooring {
  look: Look;
}

interface Consort {
  id: number;
  look: Look;
  ship: ShipState;
  ride: Ride;
  before: ShipPose;
  after: ShipPose;
}

interface Wreck {
  id: number;
  look: Look;
  pose: ShipPose;
  time: number;
  side: number;
}

const later =
  (sea: Hull, by: number): Hull =>
  (at, heading, reach, rail, time) =>
    sea(at, heading, reach, rail, time + by);

export function createState(
  waters: Waters,
  start: { at: Vec3; bearing: number },
  moored: ShipValues
) {
  let offset = 0;
  const shifted = (): Waters => ({ ...waters, sea: later(waters.sea, offset) });
  let match: Match = createMooring(shifted(), start, moored);
  const view = () => match.view;
  const byId = indexed<Crew>().of;
  const looks = new Map<number, Look>(),
    colors: Vec3[] = [];
  let wrecks: Wreck[] = [];
  const log = createLog(PLAYER);
  const held = createHeld();
  let livery: Livery = LIVERY,
    anchored = true,
    generation = 0;
  let standings: ReturnType<typeof createStandings> | null = null;
  let consort: Consort | null = null,
    fitted: { kind: GunKind } | null = null;
  const drawing = createDrawing();

  const clock = (between: number) => offset + view().clock(between);
  const wreckAt = (w: Wreck, now: number, out?: PoseOut) =>
    sinking(w.pose, now - w.time, w.side, out);

  const next = (make: (waters: Waters) => Match) => {
    offset = clock(1);
    match = make(shifted());
  };

  const cleared = (lobby: boolean) => {
    looks.clear();
    colors.length = 0;
    wrecks = [];
    log.clear();
    generation++;
    anchored = lobby;
    consort = null;
    const teams = view().teams();
    standings = teams ? createStandings(teams) : null;
  };

  const dress = (id: number, look: Look) => {
    looks.set(id, look);
    colors[id] = look.sail;
  };

  const foundered = () => {
    for (const { id, by, at, pose } of view().founded()) {
      log.sank(id, by, at);
      const look = looks.get(id);
      if (look)
        wrecks.push({
          id,
          look,
          pose,
          time: clock(1),
          side: hash(view().seed(), id) & 1 ? 1 : -1,
        });
    }
  };

  const dressed = (setup: MatchSetup, liveries: readonly Livery[]) => {
    cleared(false);
    for (const { id } of view().vessels())
      dress(
        id,
        lookOf(
          liveries[setup.ships[id].team] ?? LIVERY,
          setup.ships[id].team % EMBLEMS
        )
      );
  };

  const state = {
    step(hands: Hands): Stepped {
      match.step(hands);
      if (consort) {
        const c = consort;
        c.ride = ride(
          c.ride,
          c.ship,
          moored.topSpeed,
          waters.sea,
          clock(1),
          STEP
        );
        c.before = c.after;
        c.after = pose(c.ship, c.ride);
      }
      const v = view();
      foundered();
      while (wrecks.length && !wreckAt(wrecks[0], clock(0))) wrecks.shift();
      const last = v.happened();
      if (last)
        log.keep(
          last.fought,
          last.wants,
          last.kept,
          v.mine()?.ship.at ?? null,
          clock(1)
        );
      return v.last();
    },

    time: () => view().time(),
    clock,
    storm: (between: number) => view().storm(between),
    drawn(between: number): readonly ShipDraw[] {
      const v = view(),
        now = clock(between),
        crews = byId(v.crews()),
        fleet = v.vessels();
      let n = 0;
      for (let i = 0; i < fleet.length; i++) {
        const { id, ship, shove } = fleet[i],
          a = v.poses(id),
          look = looks.get(id),
          c = crews.get(id);
        if (!a || !look) continue;
        const d = drawing.slot(n++, id, look, true);
        blendPose(a.before, a.after, between, d.pose);
        add(scale(ship.heading, ship.speed, d.velocity), shove, 1, d.velocity);
        if (c)
          d.gun = drawing.armed(
            d,
            anchored && id === PLAYER && fitted ? fitted : c.gun,
            v.aim(id) ?? ship.heading
          );
        if (c) d.wear = wearOf(c.health);
      }
      for (const w of wrecks)
        if (wreckAt(w, now, drawing.slot(n, w.id, w.look, false).pose)) n++;
      if (consort) {
        const d = drawing.slot(n++, consort.id, consort.look, true);
        blendPose(consort.before, consort.after, between, d.pose);
      }
      return drawing.ships(n);
    },
    poseOf(id: number, between: number): ShipPose | null {
      const a = view().poses(id);
      if (a) return blendPose(a.before, a.after, between);
      for (const w of wrecks)
        if (w.id === id) return wreckAt(w, clock(between));
      return null;
    },
    after: (id: number) => view().after(id),
    balls: (between: number): readonly BallDraw[] =>
      drawing.balls(view().balls(), (between - 1) * STEP),
    blasts: log.blasts,
    loot: () => view().loot(),
    born: (id: number): number | undefined => {
      const t = view().born(id);
      return t === undefined ? undefined : t + offset;
    },
    deeds: log.deeds,
    sea: (_between = 1): Sea | undefined => {
      const territory = view().territory();
      return territory
        ? held(territory, generation, colors, offset)
        : undefined;
    },
    share: (id: number) => view().share(id),
    teamShare: (id: number) => view().teamShare(id),

    done: () => match.done,
    result: () => match.result(),
    race: (id: number): Race | null =>
      standings && standings(id, view().standing(), { order: view().order }),
    order: () => view().order(),
    teams: () => view().teams(),
    marks: (id: number) => view().marks(id),

    vessels: () => view().vessels(),
    vessel: (id: number) => view().vessel(id),
    crew: (id: number) => view().crew(id),
    mine: () => view().mine(),
    alive: () => view().alive(),
    sinkings: () => view().sinkings(),
    sinking: (id: number) => view().sinking(id),
    ships: () => view().ships(),
    start(
      setup: MatchSetup,
      liveries: readonly Livery[],
      berthed?: Berthed
    ): ShipPose {
      next((w) => createMatch(setup, { ...w, berthed }));
      dressed(setup, liveries);
      return view().after(PLAYER)!;
    },
    anchor(start: { at: Vec3; bearing: number }): ShipPose {
      next((w) => createMooring(w, start, moored));
      cleared(true);
      dress(PLAYER, lookOf(livery, 0));
      return view().after(PLAYER)!;
    },
    moor(id: number, berth: { at: Vec3; heading: Vec3 } | null) {
      if (!anchored || !berth) {
        consort = null;
        return;
      }
      const ship = shipAt(berth.at, berth.heading),
        r = settled(ship, moored.topSpeed, waters.sea, clock(1)),
        p = pose(ship, r);
      consort = {
        id,
        look: lookOf(livery, 0),
        ship,
        ride: r,
        before: p,
        after: p,
      };
    },
    wear(l: Livery): Livery {
      livery = worn(l);
      if (anchored && view().poses(PLAYER))
        looks.set(PLAYER, lookOf(livery, 0));
      if (consort) consort.look = lookOf(livery, 0);
      return livery;
    },
    worn: (): Livery => livery,
    arm(kind: GunKind | null) {
      fitted = kind === null ? null : { kind };
    },
    paint(look: Look) {
      if (anchored && view().poses(PLAYER)) looks.set(PLAYER, look);
      if (consort) consort.look = look;
    },
  };
  DEBUG.set(state, {
    atSea(
      setup: MatchSetup,
      start: { at: Vec3; bearing: number },
      others: readonly Berth[],
      rig?: Rig
    ): ShipPose {
      next((w) => createMatch(setup, w));
      if (rig) debugOfMatch(match).rig(rig);
      debugOfMatch(match).atSea(start, others);
      cleared(false);
      dress(PLAYER, lookOf(livery, 0));
      others.forEach((o, i) => dress(i + 1, o.look));
      return view().after(PLAYER)!;
    },
    rig(rig: Rig, setup: MatchSetup, liveries: readonly Livery[]): ShipPose {
      debugOfMatch(match).rig(rig);
      dressed(setup, liveries);
      return view().after(PLAYER)!;
    },
    strew: (at: Vec3, heals: readonly Rarity[]) =>
      debugOfMatch(match).strew(at, heals),
    sink(id: number, by: number | null) {
      if (!view().poses(id)) return;
      debugOfMatch(match).sink(id, by);
      foundered();
      log.keep(NOTHING_DONE, NOTHING_DONE, NOTHING_DONE, null, clock(1));
    },
    hurt: (id: number, points: number) => debugOfMatch(match).hurt(id, points),
    shoot(id: number, damage: number) {
      const on = view().vessel(id)?.ship.at,
        sides = view().teams(),
        by = view()
          .alive()
          .find((k) => k !== id && (!sides || sides[k] !== sides[id]));
      if (!on || by === undefined) return;
      debugOfMatch(match).volley([
        loosed(by, 'cannon', scale(on, R + 3), scale(on, -1), 90, damage, on),
      ]);
    },
    mindOf: (id: number) => debugOfMatch(match).mindOf(id),
    standIn: (id: number, sights: Sighter) =>
      debugOfMatch(match).standIn(id, sights),
  });
  return state;
}

interface Debug {
  atSea(
    setup: MatchSetup,
    start: { at: Vec3; bearing: number },
    others: readonly Berth[],
    rig?: Rig
  ): ShipPose;
  rig(rig: Rig, setup: MatchSetup, liveries: readonly Livery[]): ShipPose;
  strew(at: Vec3, heals: readonly Rarity[]): void;
  sink(id: number, by: number | null): void;
  hurt(id: number, points: number): void;
  shoot(id: number, damage: number): void;
  mindOf(id: number): Readonly<Memory> | null;
  standIn(id: number, sights: Sighter): void;
}

const DEBUG = new WeakMap<object, Debug>();

export function debugOf(state: ReturnType<typeof createState>): Debug {
  const d = DEBUG.get(state);
  if (!d) throw new Error('not a match state');
  return d;
}

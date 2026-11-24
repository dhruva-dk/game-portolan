import { inHand, type Crew, type Order } from '../sim/battle.ts';
import type { Brain } from '../sim/brain.ts';
import {
  createMatch,
  debugOf as debugOfMatch,
  type Match,
  type Mooring,
} from '../sim/engine.ts';
import { STEP, blendPose } from '../sim/fixed.ts';
import { wearOf } from '../sim/health.ts';
import { indexed } from '../sim/indexed.ts';
import type { Goods } from '../sim/loot.ts';
import { PLAYER } from '../sim/match.ts';
import type { Memory } from '../sim/bot.ts';
import type { Nature } from '../sim/persona.ts';
import type { Sighter } from '../sim/orders.ts';
import type { Helm } from '../sim/ship.ts';
import { NOTHING, type Ask } from '../sim/stores.ts';
import type { Waters } from '../sim/waters.ts';
import type { BallDraw, Look, Sea, ShipDraw } from '../render/snapshot.ts';
import type { Hull } from '../world/swell.ts';
import type { Planet } from '../world/planet.ts';
import type { PoseOut, ShipPose } from '../world/pose.ts';
import { hash } from '../world/random.ts';
import { add, scale, type Vec3 } from '../world/sphere.ts';
import { LIVERY, type Livery } from '../world/livery.ts';
import type { Race } from './player.ts';
import { dealt, lookOf, worn } from './colors.ts';
import { createDrawing } from './drawing.ts';
import { createHeld } from './held.ts';
import { createLog, NOTHING_DONE } from './moments.ts';
import { createStandings } from './standings.ts';
import { sinking } from './sinking.ts';

export interface Berth extends Mooring {
  look: Look;
}

interface Wreck {
  id: number;
  look: Look;
  pose: ShipPose;
  time: number;
  side: number;
}

export function createState(
  planet: Planet,
  sea: Hull,
  waters: Waters,
  first: Match,
  brainOf?: (id: number) => Brain
) {
  const match = createMatch(planet, sea, waters, first, brainOf),
    debug = debugOfMatch(match);
  const byId = indexed<Crew>().of;
  const looks = new Map<number, Look>(),
    colors: Vec3[] = [];
  let wrecks: Wreck[] = [];
  const log = createLog(PLAYER);
  const held = createHeld();
  let livery: Livery = LIVERY,
    anchored = false,
    generation = 0;
  let standings: ReturnType<typeof createStandings> | null = null;
  const drawing = createDrawing();

  const wreckAt = (w: Wreck, now: number, out?: PoseOut) =>
    sinking(w.pose, now - w.time, w.side, out);

  const cleared = (lobby: boolean) => {
    looks.clear();
    colors.length = 0;
    wrecks = [];
    log.clear();
    generation++;
    anchored = lobby;
    const card = match.card();
    standings = card ? createStandings(card) : null;
  };

  const dress = (id: number, look: Look) => {
    looks.set(id, look);
    colors[id] = look.sail;
  };

  const foundered = () => {
    for (const { id, by, at, pose } of match.founded()) {
      log.sank(id, by, at);
      const look = looks.get(id);
      if (look)
        wrecks.push({
          id,
          look,
          pose,
          time: match.clock(1),
          side: hash(match.seed(), id) & 1 ? 1 : -1,
        });
    }
  };

  const state = {
    advance(helm: Helm, gun: Order, ask: Ask = NOTHING) {
      const did = match.advance(helm, gun, ask);
      foundered();
      while (wrecks.length && !wreckAt(wrecks[0], match.clock(0)))
        wrecks.shift();
      const last = match.happened();
      if (last)
        log.keep(
          last.fought,
          last.wants,
          last.kept,
          match.mine()?.ship.at ?? null,
          match.clock(1)
        );
      return did;
    },

    time: match.time,
    clock: match.clock,
    storm: match.storm,
    drawn(between: number): readonly ShipDraw[] {
      const now = match.clock(between),
        crews = byId(match.crews()),
        fleet = match.vessels();
      let n = 0;
      for (let i = 0; i < fleet.length; i++) {
        const { id, ship, shove } = fleet[i],
          a = match.poses(id),
          look = looks.get(id),
          c = crews.get(id),
          g = c && inHand(c);
        if (!a || !look) continue;
        const d = drawing.slot(n++, id, look, true);
        blendPose(a.before, a.after, between, d.pose);
        add(scale(ship.heading, ship.speed, d.velocity), shove, 1, d.velocity);
        if (g) d.gun = drawing.armed(d, g, match.aim(id) ?? ship.heading);
        if (c) d.wear = wearOf(c.health);
      }
      for (const w of wrecks)
        if (wreckAt(w, now, drawing.slot(n, w.id, w.look, false).pose)) n++;
      return drawing.ships(n);
    },
    poseOf(id: number, between: number): ShipPose | null {
      const a = match.poses(id);
      if (a) return blendPose(a.before, a.after, between);
      for (const w of wrecks)
        if (w.id === id) return wreckAt(w, match.clock(between));
      return null;
    },
    after: match.after,
    balls: (between: number): readonly BallDraw[] =>
      drawing.balls(match.balls(), (between - 1) * STEP),
    blasts: log.blasts,
    loot: match.loot,
    born: match.born,
    deeds: log.deeds,
    sea: (_between = 1): Sea | undefined => {
      const territory = match.territory();
      return territory ? held(territory, generation, colors) : undefined;
    },
    share: match.share,

    result: match.result,
    race: (id: number): Race | null =>
      standings && standings(id, match.standing(), match),
    order: match.order,
    teams: match.teams,
    marks: match.marks,

    vessels: match.vessels,
    vessel: match.vessel,
    crew: match.crew,
    assist: match.assist,
    mine: match.mine,
    alive: match.alive,
    sinkings: match.sinkings,
    sinking: match.sinking,
    ships: match.ships,
    start(m: Match, manned = true): ShipPose {
      const pose = match.start(m, manned);
      cleared(false);
      for (const { id } of match.vessels()) {
        const entry = m.card?.ships[id];
        dress(
          id,
          lookOf(
            entry
              ? entry.colors
              : id === PLAYER
                ? livery
                : dealt(m.seed, id, livery)
          )
        );
      }
      return pose;
    },
    anchor(start: { at: Vec3; bearing: number }): ShipPose {
      const pose = match.anchor(start);
      cleared(true);
      dress(PLAYER, lookOf(livery));
      return pose;
    },
    wear(l: Livery): Livery {
      livery = worn(l);
      if (anchored && match.poses(PLAYER)) looks.set(PLAYER, lookOf(livery));
      return livery;
    },
    worn: (): Livery => livery,
  };
  DEBUG.set(state, {
    atSea(
      start: { at: Vec3; bearing: number },
      others: readonly Berth[]
    ): ShipPose {
      const pose = debug.atSea(start, others);
      cleared(false);
      dress(PLAYER, lookOf(livery));
      others.forEach((o, i) => dress(i + 1, o.look));
      return pose;
    },
    strew: debug.strew,
    sink(id: number, by: number | null) {
      if (!match.poses(id)) return;
      debug.sink(id, by);
      foundered();
      log.keep(NOTHING_DONE, NOTHING_DONE, NOTHING_DONE, null, match.clock(1));
    },
    mindOf: debug.mindOf,
    natureOf: debug.natureOf,
    standIn: debug.standIn,
  });
  return state;
}

interface Debug {
  atSea(
    start: { at: Vec3; bearing: number },
    others: readonly Berth[]
  ): ShipPose;
  strew(at: Vec3, goods: readonly Goods[]): void;
  sink(id: number, by: number | null): void;
  mindOf(id: number): Readonly<Memory> | null;
  natureOf(id: number): Nature | null;
  standIn(id: number, sights: Sighter): void;
}

const DEBUG = new WeakMap<object, Debug>();

export function debugOf(state: ReturnType<typeof createState>): Debug {
  const d = DEBUG.get(state);
  if (!d) throw new Error('not a match state');
  return d;
}

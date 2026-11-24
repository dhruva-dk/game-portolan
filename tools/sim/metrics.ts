import type { GunKind } from '../../src/sim/kinds.ts';
import { debugOf } from '../../src/play/state.ts';
import type { Memory } from '../../src/sim/bot.ts';
import { BOT, type Mode } from '../../src/sim/captain.ts';
import { GUNS, SHIP } from '../../src/sim/handling.ts';
import { PIECE, isArms } from '../../src/sim/loot.ts';
import { distance, type Vec3 } from '../../src/world/sphere.ts';
import type { State } from './match.ts';

export const STUCK = 15,
  WINDOW = 30,
  AGROUND = 2;
export const HELD = [30, 60, 120, 240] as const;

const MOVING = 4,
  ABOUT = 40;

export const BANDS = ['close', 'mid', 'far'] as const;
export type Band = (typeof BANDS)[number];
const bandOf = (m: number): Band =>
  m < GUNS.scatter.range ? 'close' : m < GUNS.repeater.range ? 'mid' : 'far';

export interface Count {
  shots: number;
  hits: number;
}

export interface Fighting {
  shots: Partial<Record<GunKind, number>>;
  hits: number;
  dealt: number;
  rammed: number;
  taken: number;
  kills: number;
}

export interface ShipResult {
  id: number;
  brain: string;
  persona: string;
  skill: number;
  player: boolean;
  aim: Partial<Record<GunKind, Record<Band, Count>>>;
  fell: Record<Band, Fell>;
  place: number;
  sunk: { time: number; cause: string; by: number | null } | null;
  armed: number | null;
  second: number | null;
  fighting: Fighting;
  hand: Partial<Record<GunKind, number>>;
  took: { guns: number; rarest: number; stores: number };
  modes: Partial<Record<Mode, number>>;
  stuck: Partial<Record<Mode, number>>;
  aground: number;
  pinned: number;
  why: Partial<Record<Why, number>>;
  episodes: Episode[];
  speed: number;
  held: number[];
  share: number;
  loops: number;
  regained: number;
  afloat: number;
  mended: { hull: number; shield: number };
  low: number | null;
  comeback: boolean;
}

export const LOW = 30,
  BACK = 60;

export type Why = 'avoid' | 'back' | 'short' | 'dry' | 'none';
const SHORT = 30;

export interface Episode {
  from: number;
  seconds: number;
  mode: Mode;
  at: Vec3;
  why: Why[];
}

export interface MatchResult {
  type: string;
  seconds: number;
  steps: number;
  msPerStep: number;
  left: number;
  causes: Record<string, number>;
  shots: {
    band: Record<Band, Count>;
    kind: Partial<
      Record<
        GunKind,
        Count & {
          balls: number;
          fell: number;
          dealt: number;
          bands: Record<Band, Count>;
        }
      >
    >;
    rarity: Record<number, Count>;
  };
  quiet: number;
  lull: number;
  loot: {
    start: number;
    shallow: number;
    end: number;
    taken: Record<'first' | 'later', Flow>;
    kinds: Record<string, number>;
    rarity: Record<number, number>;
  };
  ships: ShipResult[];
}

interface Watch {
  run: Episode | null;
  path: Vec3[];
  speeds: number[];
  r: ShipResult;
  afloat: number;
  speedSum: number;
  health: { hull: number; shield: number };
  last: {
    kind: GunKind;
    rarity: number;
    band: Band;
    target: number | null;
    home: boolean;
  } | null;
}

function whyNow(m: Readonly<Memory>, depth: (p: Vec3) => number): Why[] {
  const out: Why[] = [];
  if (m.avoid > 0) out.push('avoid');
  if (m.backT !== 0) out.push('back');
  if (m.mode !== 'fight' && m.route && distance(m.route.to, m.goal) > SHORT)
    out.push('short');
  if (depth(m.goal) < SHIP.draft + BOT.open) out.push('dry');
  return out.length ? out : ['none'];
}

interface Fell {
  astern: number;
  ahead: number;
}

const bump = <K extends string>(to: Partial<Record<K, number>>, k: K, n = 1) =>
  (to[k] = (to[k] ?? 0) + n);
const count = (): Count => ({ shots: 0, hits: 0 });
const bands = (): Record<Band, Count> => ({
  close: count(),
  mid: count(),
  far: count(),
});

export interface Flow {
  pieces: number;
  lay: number;
  fought: number;
}
const flow = (): Flow => ({ pieces: 0, lay: 0, fought: 0 });
export const FOUGHT = 150;

type Stepped = ReturnType<State['advance']>;

export function watch(
  state: State,
  brainOf: (id: number) => string,
  depth: (p: Vec3) => number,
  type: string,
  players: ReadonlySet<number> = new Set()
) {
  const ships = new Map<number, Watch>();
  for (const k of state.ships())
    ships.set(k.id, {
      run: null,
      path: [],
      speeds: [],
      afloat: 0,
      speedSum: 0,
      health: { hull: k.hull, shield: k.shield },
      last: null,
      r: {
        id: k.id,
        brain: brainOf(k.id),
        persona: debugOf(state).natureOf(k.id)?.persona ?? '',
        skill: debugOf(state).natureOf(k.id)?.temper.skill ?? 0,
        player: players.has(k.id),
        aim: {},
        fell: {
          close: { astern: 0, ahead: 0 },
          mid: { astern: 0, ahead: 0 },
          far: { astern: 0, ahead: 0 },
        },
        place: 0,
        sunk: null,
        armed: k.armed ? 0 : null,
        second: null,
        fighting: {
          shots: {},
          hits: 0,
          dealt: 0,
          rammed: 0,
          taken: 0,
          kills: 0,
        },
        hand: {},
        took: { guns: 0, rarest: -1, stores: 0 },
        modes: {},
        stuck: {},
        aground: 0,
        pinned: 0,
        why: {},
        episodes: [],
        speed: 0,
        held: HELD.map(() => 0),
        share: 0,
        loops: 0,
        regained: 0,
        afloat: 0,
        mended: { hull: 0, shield: 0 },
        low: null,
        comeback: false,
      },
    });
  const pieces = state.loot().pieces;
  const loot: Omit<MatchResult['loot'], 'end'> = {
    start: pieces.length,
    shallow: pieces.filter((l) => depth(l.at) < SHIP.draft + PIECE.open).length,
    taken: { first: flow(), later: flow() },
    kinds: {},
    rarity: {},
  };
  const born = new Map<number, number>(),
    firstLater = state.loot().next;
  let seenNext = firstLater;
  const shots: MatchResult['shots'] = { band: bands(), kind: {}, rarity: {} };
  let lastShot = 0,
    quiet = 0,
    lastBlow = 0,
    lull = 0;
  const regainedNow = new Map<number, number>();
  const where = (id: number) =>
    state.vessels().find((v) => v.id === id)?.ship.at ?? null;
  const fell = (w: Watch, at: Vec3) => {
    const l = w.last,
      v = l && state.vessels().find((o) => o.id === l.target);
    if (!l || !v || v.ship.speed < MOVING || distance(at, v.ship.at) > ABOUT)
      return;
    const { heading: h, at: p } = v.ship;
    const along =
      (at[0] - p[0]) * h[0] + (at[1] - p[1]) * h[1] + (at[2] - p[2]) * h[2];
    w.r.fell[l.band][along < 0 ? 'astern' : 'ahead']++;
  };

  return {
    step(did: Stepped) {
      const now = state.time();
      for (const s of did.shots) {
        const w = ships.get(s.shooter);
        if (!w) continue;
        const c = state.crew(s.shooter),
          rarity = c.guns[c.hand]?.rarity ?? 0,
          from = where(s.shooter);
        let range = Infinity;
        for (const v of state.vessels())
          if (
            from &&
            v.id !== s.shooter &&
            (s.target === null || v.id === s.target)
          )
            range = Math.min(range, distance(from, v.ship.at));
        const band = bandOf(range);
        w.last = { kind: s.gun, rarity, band, target: s.target, home: false };
        bump(w.r.fighting.shots, s.gun);
        (w.r.aim[s.gun] ??= bands())[band].shots++;
        shots.band[band].shots++;
        const k = (shots.kind[s.gun] ??= {
          ...count(),
          balls: 0,
          fell: 0,
          dealt: 0,
          bands: bands(),
        });
        k.shots++;
        k.bands[band].shots++;
        k.balls += GUNS[s.gun].pellets;
        (shots.rarity[rarity] ??= count()).shots++;
        if (now > 30) quiet = Math.max(quiet, now - Math.max(30, lastShot));
        lastShot = now;
      }
      if (did.strikes.length) {
        if (now > 30) lull = Math.max(lull, now - Math.max(30, lastBlow));
        lastBlow = now;
      }
      for (const s of did.strikes) {
        const by = ships.get(s.shooter),
          on = ships.get(s.struck);
        if (on) on.r.fighting.taken += s.damage;
        if (!by) continue;
        if (s.ram) {
          by.r.fighting.rammed += s.damage;
          continue;
        }
        by.r.fighting.dealt += s.damage;
        const l = by.last;
        if (!l) continue;
        if (s.struck === l.target) fell(by, s.at);
        const k = shots.kind[l.kind];
        if (k) k.dealt += s.damage;
        if (l.home) continue;
        l.home = true;
        by.r.fighting.hits++;
        const mine = by.r.aim[l.kind];
        if (mine) mine[l.band].hits++;
        shots.band[l.band].hits++;
        if (k) {
          k.hits++;
          k.bands[l.band].hits++;
        }
        const r = shots.rarity[l.rarity];
        if (r) r.hits++;
      }
      for (const s of did.splashes) {
        const k = shots.kind[s.gun];
        if (k) k.fell++;
        const w = ships.get(s.shooter);
        if (w) fell(w, s.at);
      }
      for (const t of did.took) {
        const f = loot.taken[t.id < firstLater ? 'first' : 'later'],
          by = where(t.ship);
        f.pieces++;
        f.lay += t.id < firstLater ? now : now - (born.get(t.id) ?? now);
        if (
          by &&
          state
            .vessels()
            .some((v) => v.id !== t.ship && distance(v.ship.at, by) < FOUGHT)
        )
          f.fought++;
        bump(loot.kinds, t.goods.kind);
        if (isArms(t.goods))
          loot.rarity[t.goods.rarity] = (loot.rarity[t.goods.rarity] ?? 0) + 1;
        const w = ships.get(t.ship);
        if (!w) continue;
        if (isArms(t.goods)) {
          w.r.took.guns++;
          w.r.took.rarest = Math.max(w.r.took.rarest, t.goods.rarity);
        } else w.r.took.stores++;
      }
      const f = state.loot();
      if (f.next > seenNext) {
        for (const l of f.pieces) if (l.id >= seenNext) born.set(l.id, now);
        seenNext = f.next;
      }
      for (const k of did.held?.claimed ?? []) {
        const w = ships.get(k.id);
        if (w) w.r.loops++;
      }
      regainedNow.clear();
      for (const k of did.regained) {
        const w = ships.get(k.id);
        if (w) w.r.regained += k.shield;
        regainedNow.set(k.id, k.shield);
      }
      for (const v of state.vessels()) {
        const w = ships.get(v.id);
        if (!w) continue;
        const h = state.crew(v.id).health,
          hull = h.hull - w.health.hull,
          shield = h.shield - w.health.shield - (regainedNow.get(v.id) ?? 0);
        if (hull > 1e-6) w.r.mended.hull += hull;
        if (shield > 1e-6) w.r.mended.shield += shield;
        if (w.r.low === null && h.hull < LOW) w.r.low = now;
        else if (w.r.low !== null && h.hull > BACK) w.r.comeback = true;
        w.health.hull = h.hull;
        w.health.shield = h.shield;
      }
    },
    second(s: number) {
      const at = HELD.indexOf(s as (typeof HELD)[number]);
      for (const v of state.vessels()) {
        const w = ships.get(v.id);
        if (!w) continue;
        const mind = debugOf(state).mindOf(v.id),
          mode = mind?.mode ?? 'roam',
          crew = state.crew(v.id);
        w.afloat++;
        w.speedSum += v.ship.speed;
        bump(w.r.modes, mode);
        const guns = crew.guns.filter((g) => g !== null),
          inHand = crew.guns[crew.hand];
        if (inHand) bump(w.r.hand, inHand.kind);
        if (w.r.armed === null && guns.length) w.r.armed = s;
        if (w.r.second === null && new Set(guns.map((g) => g.kind)).size > 1)
          w.r.second = s;
        if (at >= 0) w.r.held[at] = state.share(v.id);
        w.path.push(v.ship.at);
        w.speeds.push(v.ship.speed);
        if (w.path.length > WINDOW + 1) {
          w.path.shift();
          w.speeds.shift();
        }
        const stuck =
          w.path.length > WINDOW && distance(w.path[0], v.ship.at) < STUCK;
        if (stuck) {
          bump(w.r.stuck, mode);
          const mean = w.speeds.reduce((a, b) => a + b, 0) / w.speeds.length;
          if (mean < AGROUND) w.r.aground++;
        }
        if (stuck && mode !== 'claim' && mind) {
          w.r.pinned++;
          const why = whyNow(mind, depth);
          for (const y of why) bump(w.r.why, y);
          if (!w.run || w.run.mode !== mode) {
            w.run = { from: s, seconds: 0, mode, at: v.ship.at, why: [] };
            w.r.episodes.push(w.run);
          }
          w.run.seconds++;
          for (const y of why) if (!w.run.why.includes(y)) w.run.why.push(y);
        } else w.run = null;
      }
    },
    end(steps: number, ms: number): MatchResult {
      const sunk = state.sinkings(),
        left = state.alive();
      const causes: Record<string, number> = {};
      sunk.forEach((k, i) => {
        const w = ships.get(k.id)!;
        w.r.sunk = { time: k.time, cause: k.cause, by: k.by };
        w.r.place = ships.size - i;
        bump(causes, k.cause);
        const by = k.by === null ? undefined : ships.get(k.by);
        if (by && k.by !== k.id) {
          by.r.fighting.kills++;
          if (by.r.low !== null && k.time >= by.r.low) by.r.comeback = true;
        }
      });
      for (const w of ships.values()) {
        if (!w.r.sunk) w.r.place = 1;
        w.r.speed = w.afloat ? w.speedSum / w.afloat : 0;
        w.r.afloat = w.afloat;
        w.r.share = state.share(w.r.id);
      }
      return {
        type,
        seconds: state.time(),
        steps,
        msPerStep: ms / Math.max(1, steps),
        left: left.length,
        causes,
        shots,
        quiet,
        lull: Math.max(lull, state.time() - Math.max(30, lastBlow)),
        loot: { ...loot, end: state.loot().pieces.length },
        ships: [...ships.values()].map((w) => w.r),
      };
    },
  };
}

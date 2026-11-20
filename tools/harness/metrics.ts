// What the harness measures of a match, watched once a second of its clock:
// each ship's time in each mode, her time stuck (by the mode she was in), when
// she first held a gun, her water, and how and when she went down; and of the
// match, how it ended and what a step cost.
//
// Stuck: she moved less than STUCK m over the last WINDOW s. That is not always
// a fault: a bot claiming circles in her own water on purpose (claimer.ts
// circle), so the time is kept by mode and `pinned` is the stuck time in any
// mode but claim. Aground: stuck and making under AGROUND m/s on average.
//
// Node only (tools/).

import type { Memory } from '../../src/sim/bot.ts';
import { BOT, type Mode } from '../../src/sim/captain.ts';
import { SHIP } from '../../src/sim/handling.ts';
import { distance, type Vec3 } from '../../src/world/sphere.ts';
import type { State } from './run.ts';

export const STUCK = 15,
  WINDOW = 30,
  AGROUND = 2;

/** A ship's account of a match. */
export interface ShipResult {
  id: number;
  brain: string;
  /** 1 the last afloat (or every ship afloat at the end); n the first sunk. */
  place: number;
  sunk: { time: number; cause: string; by: number | null } | null;
  /** The match second she first held a gun (null: never). */
  armed: number | null;
  /** Seconds in each mode. */
  modes: Partial<Record<Mode, number>>;
  /** Seconds stuck, by the mode she was in; aground, of them; pinned: any mode but claim. */
  stuck: Partial<Record<Mode, number>>;
  aground: number;
  pinned: number;
  /** Of her pinned seconds, how many each of what her mind showed then was so (WHY). */
  why: Partial<Record<Why, number>>;
  /** Each run of pinned seconds: when it began, how long, her mode, where (a unit vector) and why. */
  episodes: Episode[];
  /** Mean speed over her seconds afloat (m/s), and her share of the water at the end. */
  speed: number;
  share: number;
}

/**
 * What her mind shows in a pinned second (helmsman.ts, pilot.ts): `avoid`
 * holding a turn off land, `back` backing off a bank or working off a bar,
 * `short` her route ending SHORT m or more short of her goal (none found to it:
 * route.ts hands back the cell nearest), `dry` her goal in water not open to
 * her; `none` none of these.
 */
export type Why = 'avoid' | 'back' | 'short' | 'dry' | 'none';
const SHORT = 30;

export interface Episode {
  from: number;
  seconds: number;
  mode: Mode;
  at: Vec3;
  why: Why[];
}

/** A match's account. */
export interface MatchResult {
  seconds: number;
  steps: number;
  msPerStep: number;
  left: number;
  causes: Record<string, number>;
  loot: { start: number; end: number };
  ships: ShipResult[];
}

interface Watch {
  /** The pinned run under way, if she is pinned. */
  run: Episode | null;
  path: Vec3[];
  speeds: number[];
  r: ShipResult;
  afloat: number;
  speedSum: number;
}

/** What her mind shows now (Why), `depth` the sea's. */
function whyNow(m: Readonly<Memory>, depth: (p: Vec3) => number): Why[] {
  const out: Why[] = [];
  if (m.avoid > 0) out.push('avoid');
  if (m.backT !== 0) out.push('back');
  if (m.mode !== 'fight' && m.route && distance(m.route.to, m.goal) > SHORT)
    out.push('short');
  if (depth(m.goal) < SHIP.draught + BOT.open) out.push('dry');
  return out.length ? out : ['none'];
}

/**
 * A watch over a match on a sea of `depth`: `second()` once each second of its
 * clock; `end()` its account.
 */
export function watch(
  state: State,
  brainOf: (id: number) => string,
  depth: (p: Vec3) => number
) {
  const ships = new Map<number, Watch>();
  for (const k of state.ships())
    ships.set(k.id, {
      run: null,
      path: [],
      speeds: [],
      afloat: 0,
      speedSum: 0,
      r: {
        id: k.id,
        brain: brainOf(k.id),
        place: 0,
        sunk: null,
        armed: k.armed ? 0 : null,
        modes: {},
        stuck: {},
        aground: 0,
        pinned: 0,
        why: {},
        episodes: [],
        speed: 0,
        share: 0,
      },
    });
  const loot = state.loot().pieces.length;
  const add = (to: Partial<Record<Mode, number>>, m: Mode) =>
    (to[m] = (to[m] ?? 0) + 1);

  return {
    second(s: number) {
      for (const v of state.vessels()) {
        const w = ships.get(v.id);
        if (!w) continue;
        const mind = state.debug.mindOf(v.id),
          mode = mind?.mode ?? 'roam';
        w.afloat++;
        w.speedSum += v.ship.speed;
        add(w.r.modes, mode);
        if (w.r.armed === null && state.crew(v.id).guns.some((g) => g))
          w.r.armed = s;
        w.path.push(v.ship.at);
        w.speeds.push(v.ship.speed);
        if (w.path.length > WINDOW + 1) {
          w.path.shift();
          w.speeds.shift();
        }
        const stuck =
          w.path.length > WINDOW && distance(w.path[0], v.ship.at) < STUCK;
        if (stuck) {
          add(w.r.stuck, mode);
          const mean = w.speeds.reduce((a, b) => a + b, 0) / w.speeds.length;
          if (mean < AGROUND) w.r.aground++;
        }
        if (stuck && mode !== 'claim' && mind) {
          w.r.pinned++;
          const why = whyNow(mind, depth);
          for (const y of why) w.r.why[y] = (w.r.why[y] ?? 0) + 1;
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
        causes[k.cause] = (causes[k.cause] ?? 0) + 1;
      });
      for (const w of ships.values()) {
        if (!w.r.sunk) w.r.place = 1;
        w.r.speed = w.afloat ? w.speedSum / w.afloat : 0;
        w.r.share = state.share(w.r.id);
      }
      return {
        seconds: state.time(),
        steps,
        msPerStep: ms / Math.max(1, steps),
        left: left.length,
        causes,
        loot: { start: loot, end: state.loot().pieces.length },
        ships: [...ships.values()].map((w) => w.r),
      };
    },
  };
}

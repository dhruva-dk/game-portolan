// A bot's fight and her flight (bot.ts weighs them): how much she wants to
// fight the ship her lookout has her eye on, how much she wants to run, and
// where she runs to.
//
// Fighting is ramming, or her guns once armed (gunner.ts): her will to is her
// temperament and mood (which a sinking she deals warms, and the blows she
// takes cool, settling back: `mood`), the odds (hull, a seam for health.ts), being rammed,
// and the crowd round her where a third ship would finish whoever won; close
// aboard she fights whatever her will; and she lets a ship sailing away from
// her go once it is past reach, as a ram can't catch a ship as fast as she is.
// Early in a match she holds back. She runs from a fight she is losing, or from
// a ship that rams her that she won't fight: behind land if there is any near,
// else straight away. Lamed (her rigging or rudder faulted: faults.ts), she
// can't outrun one, so she runs the less and, cornered, fights the more.
//
// Pure arithmetic: no three, so it runs in node for the tests; deterministic
// for the same inputs, to the bit.

import { along, distance, dot, toward, type Vec3 } from '../world/sphere.ts';
import { toEdge } from './storm.ts';
import { logistic, ramp, utility } from './utility.ts';
import { aggroOf, mate, open, rotate, type Ctx, type Seen } from './captain.ts';
import { ZONES } from '../kinds.ts';
import { faultsOf } from './faults.ts';
import { SHIP } from './handling.ts';
import { ranFromShip } from './logbook.ts';
import { hidden } from './lookout.ts';
import { keptInside } from './storming.ts';

/** How she weighs a fight, a run and holding back. Seconds and metres. */
export const MIND = {
  /**
   * A ship that rammed her within `grudge` s rouses her will to fight by
   * `roused`, cooling from `cool` s on (and her lookout sees her as nearer:
   * lookout.ts). Rammed within `fresh` s, by one she won't fight, she runs.
   */
  grudge: 5,
  roused: 0.4,
  cool: 3,
  fresh: 3,
  /**
   * Within `crowd` m each other ship she sees takes this much off her will, by
   * her skill.
   */
  crowd: 150,
  crowding: 0.25,
  /**
   * A ship she ran from lately (her log: logbook.ts), and no weaker than she,
   * takes this much off her will.
   */
  beaten: 0.25,
  /**
   * The will at which she is in two minds, and how sharply it decides (logistic
   * width).
   */
  will: 0.35,
  willWidth: 0.1,
  /**
   * Closer than `closeFrom` m she starts to fight whatever her will; closer
   * than `closeAt`, wholly.
   */
  closeFrom: 50,
  closeAt: 35,
  /**
   * A ship sailing away is let go from `letGo` m at any time in a match, as a
   * ram can't catch a ship as fast as she is.
   */
  letGo: 90,
  /**
   * Her speed away, m/s, over which she is let go from a fight, and over which
   * she isn't taken up (a ram must catch her, sailing up to SHIP.top).
   */
  outrun: [0.75 * SHIP.top, 0.95 * SHIP.top] as const,
  outran: [0.55 * SHIP.top, 0.75 * SHIP.top] as const,
  /**
   * Running, she makes for open water this far off from her foe; she looks this
   * far round a run for open water.
   */
  run: 120,
  /**
   * Running, she would sooner make for water with land between her and her foe
   * (out of sight, she is soon let go), within `cover` m of her on `rings`
   * rings, the nearest first (0: never); no more than `wide` rad off straight
   * away, and further from her foe by `gain` of the way to it at least (cover
   * off to her side would take her across her foe's guns).
   */
  cover: 180,
  rings: 3,
  wide: Math.PI / 3,
  gain: 0.6,
  /**
   * Early in a match she would sooner keep out of a fight: her will to fight
   * falls by this much in each of the storm's phases (the last once it has
   * closed), and more by `more` with `lastFew` ships or fewer afloat. While it
   * does, she lets a ship sailing away go past `letGo` m with a gun too, and
   * holds her fire outside a fight she chose, but at a ship within `letGo` m
   * that shot her within `shotFresh` s.
   */
  restraint: [0.5, 0.5, 0.45, 0.35, 0.25, 0.1, 0, 0] as const,
  lastFew: 3,
  more: 0.4,
  shotFresh: 5,
  /**
   * Her mood moves: each ship she sinks warms it by `won`; each hundred hit
   * points a ball or a ram takes off her cools it by `hurt` (not the storm's:
   * a storm is no fight); it settles back to her temper's, by
   * half every `settle` s; never further off it than `band`.
   */
  won: 0.2,
  hurt: 0.45,
  settle: 45,
  band: 0.5,
  /**
   * Lamed, her rigging or rudder faulted (faults.ts: half for a minor fault,
   * wholly for a major), she can't outrun a foe: her will to run falls by
   * `lame` of it, and with her foe within `letGo` m her will to fight rises by
   * `cornered`, each by her temper's will to fight (a timid ship lamed still
   * runs).
   */
  lame: 0.6,
  cornered: 0.3,
} as const;

/**
 * Her mood, as it stands off her temper's aggro (captain.ts aggroOf), and
 * what has befallen her since she last weighed it: hit points taken, ships
 * sunk.
 */
export interface MoodMemory {
  heat: number;
  hurt: number;
  won: number;
}
export const moodMemory = (): MoodMemory => ({ heat: 0, hurt: 0, won: 0 });

/** Her memory once she has taken `damage` hit points (bot.ts shot). */
export const wounded = <M extends MoodMemory>(m: M, damage: number): M => ({
  ...m,
  hurt: m.hurt + damage,
});

/** Her memory once a ship she struck last has gone down (the game tells her). */
export const sank = <M extends MoodMemory>(m: M): M => ({
  ...m,
  won: m.won + 1,
});

/**
 * Her mood over dt seconds: what befell her weighed in (MIND won, hurt), and
 * settling back toward her temper's.
 */
export function mood(c: Ctx, dt: number): void {
  const { m } = c,
    k = c.b.mind;
  if (m.heat === 0 && m.hurt === 0 && m.won === 0) return;
  const heat =
    m.heat * Math.pow(0.5, dt / k.settle) +
    k.won * m.won -
    (k.hurt * m.hurt) / 100;
  m.heat = Math.max(-k.band, Math.min(k.band, heat));
  m.hurt = 0;
  m.won = 0;
}

/** How much she wants to fight the ship she sees. */
export function fightUrge(c: Ctx): number {
  const { m, t, foe, own } = c;
  if (!foe) return 0;
  const d = c.foeD;
  let will = t.fight * (0.6 + 0.4 * aggroOf(c));
  const strength = (s: Seen) => (s.hull ?? 100) + (s.shield ?? 0);
  will += ((0.1 + 0.5 * t.skill) * (strength(own) - strength(foe))) / 100;
  if (m.hitBy === foe.id)
    will +=
      c.b.mind.roused *
      ramp(m.clock - m.hitT, c.b.mind.grudge + c.b.mind.cool, c.b.mind.cool);
  // (a mate close by is no third ship to finish whoever wins)
  for (const o of c.others)
    if (
      o.id !== foe.id &&
      !mate(c, o) &&
      distance(own.ship.at, o.ship.at) < c.b.mind.crowd
    )
      will -= c.b.mind.crowding * t.skill;
  if (strength(foe) >= strength(own) && ranFromShip(c, foe.id))
    will -= c.b.mind.beaten;
  if (d < c.b.mind.letGo) will += c.b.mind.cornered * t.fight * lamed(c);
  const restraint = holdBack(c);
  will -= restraint;
  // close aboard she fights whatever her will, from nearer while she holds back
  const close = ramp(
    d,
    c.b.mind.closeFrom - 50 * restraint,
    c.b.mind.closeAt - 50 * restraint
  );
  if (close >= 1) return 1;
  // past reach, a ship sailing away is let go: in a fight, once she is clearly
  // away; out of one, she is not taken up while she nearly is, so it doesn't
  // flicker as she weaves. Armed, while she holds back, by her heading alone,
  // as a gun reaches a ship however fast she sails; ramming, always, by her
  // speed away, as a ram must catch her
  const from = toward(foe.ship.at, own.ship.at),
    off = from ? -dot(foe.ship.heading, from) : 0;
  const past = ramp(d, c.b.mind.letGo - 10, c.b.mind.letGo + 15);
  const go = !own.armed
    ? 1 -
      past *
        ramp(
          off * foe.ship.speed,
          ...(m.mode === 'fight' ? c.b.mind.outrun : c.b.mind.outran)
        )
    : restraint > 0
      ? 1 -
        past *
          (m.mode === 'fight' ? ramp(off, 0, 0.35) : ramp(off, -0.45, -0.15))
      : 1;
  return Math.max(
    close,
    utility(logistic(will, c.b.mind.will, c.b.mind.willWidth), go)
  );
}

/**
 * How much she holds back from a fight now: by the storm's phase, and more
 * among the last few afloat (her and the others she is given). None without a
 * storm.
 */
function holdBack(c: Ctx): number {
  const s = c.sea.storm;
  const by = s
    ? c.b.mind.restraint[Math.min(s.phase, c.b.mind.restraint.length - 1)]
    : 0;
  if (by <= 0) return 0;
  return c.others.length + 1 <= c.b.mind.lastFew ? by + c.b.mind.more : by;
}

/**
 * Whether she holds her fire: while she holds back, outside a fight she chose,
 * but at a ship close by that has just shot her.
 */
export const holdsFire = (c: Ctx) =>
  c.m.mode !== 'fight' &&
  holdBack(c) > 0 &&
  !(
    c.foe &&
    c.m.shotBy === c.foe.id &&
    c.m.clock - c.m.shotT < c.b.mind.shotFresh &&
    c.foeD < c.b.mind.letGo
  );

/**
 * How lame she is: her rigging's or her rudder's fault, the worse (faults.ts),
 * 0 whole, 0.5 minor, 1 major.
 */
function lamed(c: Ctx): number {
  const crew = c.own.crew;
  if (!crew) return 0;
  const f = faultsOf(crew.health.hull, crew.wear);
  return Math.max(f[RIGGING] ?? 0, f[RUDDER] ?? 0) / 2;
}
const RIGGING = ZONES.indexOf('rigging'),
  RUDDER = ZONES.indexOf('rudder');

/**
 * Losing a fight: her hull down past where her temperament runs, with the foe
 * close (a seam for health.ts); lamed, she runs the less.
 */
const losing = (c: Ctx) =>
  c.foe
    ? utility(
        ramp(c.own.hull ?? 100, c.t.run + 8, c.t.run - 4),
        ramp(c.foeD, 160, 130)
      ) *
      (1 - c.b.mind.lame * c.t.fight * lamed(c))
    : 0;

/**
 * Rammed by a ship she doesn't want to fight: the less she wants to, and the
 * sharper she is, the more she gets clear.
 */
function evading(c: Ctx): number {
  const { m } = c;
  if (
    !c.foe ||
    c.foeD >= 140 ||
    m.hitBy !== c.foe.id ||
    m.clock - m.hitT > c.b.mind.fresh
  )
    return 0;
  return utility(1 - fightUrge(c), 0.3 + 0.7 * c.t.skill);
}

/** How much she wants to run: losing a fight, or rammed by one she won't. */
export const fleeUrge = (c: Ctx) => Math.max(losing(c), evading(c));

/**
 * Where she runs to from where her foe was last seen: behind land if there is
 * any near, else straight away; either kept inside the storm.
 */
export const fleeGoal = (c: Ctx): Vec3 =>
  keptInside(c, cover(c, c.m.last) ?? away(c, c.m.last, c.b.mind.run));

/**
 * Open water `d` m from p away from `from`: straight away, or swung a little
 * further round each way until open.
 */
export function away(c: Ctx, from: Vec3, d: number): Vec3 {
  const p = c.own.ship.at,
    t = toward(from, p) ?? c.own.ship.heading;
  const out =
    toward(p, along(from, t, distance(from, p) + 1).p) ?? c.own.ship.heading;
  for (let k = 0; k <= 8; k++) {
    const q = along(
      p,
      rotate(p, out, (k % 2 ? 1 : -1) * Math.ceil(k / 2) * (Math.PI / 8)),
      d
    ).p;
    if (open(c, q)) return q;
  }
  return along(p, out, d).p;
}

/**
 * Cover from `from` (where her foe was last seen): open water inside the storm
 * by her margin, further from `from` than she is, and land between it and
 * `from` (hidden). The cover she is making for while it still is; else the
 * nearest within MIND.cover m (on MIND.rings rings, twelve bearings each, the
 * ones most away first); else null.
 */
function cover(c: Ctx, from: Vec3): Vec3 | null {
  const { m } = c,
    p = c.own.ship.at,
    s = c.sea.storm,
    most = c.b.mind.cover,
    rings = c.b.mind.rings,
    now = distance(from, p);
  if (most <= 0) return null;
  const good = (q: Vec3, gain: number) =>
    distance(from, q) > now + gain &&
    open(c, q) &&
    (!s || toEdge(q, s) > c.t.margin) &&
    hidden(c, from, q);
  if (m.mode === 'flee' && good(m.goal, 0)) return m.goal;
  const out = toward(from, p) ?? c.own.ship.heading,
    off = toward(p, along(from, out, now + 1).p) ?? c.own.ship.heading;
  for (let r = 1; r <= rings; r++) {
    const d = (r * most) / rings;
    for (let k = 0; k < 12; k++) {
      const a = (k % 2 ? 1 : -1) * Math.ceil(k / 2) * (Math.PI / 6);
      if (Math.abs(a) > c.b.mind.wide + 1e-9) break;
      const q = along(p, rotate(p, off, a), d).p;
      if (good(q, d * c.b.mind.gain)) return q;
    }
  }
  return null;
}

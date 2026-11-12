// A bot: a captain's mind for a ship, as a pure function from what she can see to her helm's orders. 0117's captains
// (src/sim/captains/brain.ts, temperaments.ts, utility.ts) ported to this sea, with what needs guns, loot, territory,
// wind or the Storm left out until those are here; every value is 0117's (the same planet and the same tick, so the
// same metres and seconds) unless a comment says why not.
//
// Every BOT.every steps she thinks, as 0117's captains did:
// - perceive: the nearest ship she can see within her notice (land between hides one), a ship that just rammed her
//   seen as twice as near; a foe out of sight is followed to where she was lost, and let go after `forget` seconds;
// - decide: utility scoring (utility.ts) over flee, fight and roam, the one in hand kept while it is good enough.
//   Fighting is ramming: her will to is her temperament and mood, the odds (hull, a seam for health.ts), being rammed,
//   and the crowd round her where a third ship would finish whoever won; close aboard she fights whatever her will;
//   and she lets a ship sailing away from her go once it is past reach, as a ram can't catch a ship as fast as she is.
//   She runs from a fight she is losing, or from a ship that rams her that she won't fight.
// Every step she steers, as 0117's helm did:
// - for her goal: the ship she would ram (to strike her side, led for where she will be: new here, as 0117 rammed
//   only in passing), away from one she runs from, or a roaming mark 60–160 m off;
// - feeling ahead along that course for shoal water, and turning off toward the side that lies open, holding the turn a
//   moment once the way clears rather than swing back at what she turned from;
// - answering a ram coming at her (0117's answer to a gun winding up on her): bow or stern to it, whichever is the
//   nearer turn, end on where a blow does least; a sharp captain sees it nearly always, a green one often not;
// - and working off a bank she is stuck against, toward the open side or the deepest water.
//
// Seams: a gun (0117's aimAndFire and fightCourse, holding a weapon's range rather than ramming) goes in the fight's
// course and in what think returns; the Storm (0117's first option, weight 6, and roam goals kept `margin` inside its
// edge) goes in OPTIONS and roamGoal; mending (0117's heal, 3.5) in OPTIONS once health.ts gives a hull.
//
// Pure arithmetic: no three, so it runs in node for the tests; deterministic for the same inputs, to the bit.

import { add, along, cross, distance, dot, length, normalize, scale, transport, type Vec3 } from '../world/sphere.ts';
import { random } from '../world/random.ts';
import { gap } from './contact.ts';
import { STEP } from './fixed.ts';
import { RAM, SHIP } from './handling.ts';
import { offCourse, turned, type Helm, type ShipState } from './ship.ts';
import type { Depth } from './shoal.ts';
import { temper, type Temper } from './temper.ts';
import { choose, logistic, momentum, ramp, utility, type Option } from './utility.ts';

/** Everything a bot is tuned by. Seconds and metres; 0117's values unless said. */
export const BOT = {
  /** Think every this many steps (0117: 6 ticks, 0.2 s). */
  every: 6,
  /** The farthest she looks for a ship, m; seconds she follows one out of sight; ground higher than `sightLine` m
   *  hides one, looked for every `sightStep` m along the way. */
  sightMax: 240, forget: 4, sightLine: 2.5, sightStep: 20,
  /** A ship that rammed her within `grudge` s is seen as `nearer` as far, and rouses her will to fight by `roused`,
   *  cooling from `cool` s on (0117: 150, 240 and 90 ticks). Rammed within `fresh` s, by one she won't fight, she runs. */
  grudge: 5, nearer: 0.5, roused: 0.4, cool: 3, fresh: 3,
  /** Within `crowd` m each other ship she sees takes this much off her will, by her skill. */
  crowd: 150, crowding: 0.25,
  /** The will at which she is in two minds, and how sharply it decides (logistic width). */
  will: 0.35, willWidth: 0.1,
  /** Closer than `closeFrom` m she starts to fight whatever her will; closer than `closeAt`, wholly. */
  closeFrom: 50, closeAt: 35,
  /** A ship sailing away is let go from `letGo` m (0117's, then only while holding back early in a match: here always,
   *  as a ram can't catch a ship as fast as she is). */
  letGo: 90,
  /** Her speed away, m/s, over which she is let go from a fight, and over which she isn't taken up (new: a ram must
   *  catch her, sailing up to SHIP.top). */
  outrun: [0.75 * SHIP.top, 0.95 * SHIP.top] as const, outran: [0.55 * SHIP.top, 0.75 * SHIP.top] as const,
  /** Running, she makes for open water this far off from her foe; she looks this far round a run for open water. */
  run: 120,
  /** Roaming: a new mark every `roam` s or within `arrive` m, `near`–`far` m off. */
  roam: 9, arrive: 20, near: 60, far: 160,
  /** Water open to her: this deep past her draught (0117's OPEN). */
  open: 0.3,
  /** Feeling ahead for shoal water: this far plus her speed (m/s × 1 s); sides felt `side` rad either way, a little
   *  further; a turn off land is `firm` rad of steer when one side is open, `hard` when neither is; held `avoid` s once
   *  the way clears. */
  feel: 14, feelSide: 16, side: 0.6, firm: 0.9, hard: 1.2, avoid: 0.8,
  /**
   * Backing off a bank: making less than `crawl` m/s she is stuck (0117: 1, by top speed 14.5 → 12). With shoal water
   * `bow` m past her forefoot (0117: 4 m past a shorter hull's centre), she waits `wade` s, then makes for the deepest
   * water `sound` m round her for up to `most` s. Else stuck `stuck` s, she turns hard (steer `full`) toward the open
   * side at about `rate` rad/s (0117: 0.65 at her turn of 0.55; here SHIP.turn 0.42), for `least`–2.2×`least` s, at most
   * `most`, until her course lies within `slack` of half a turn ahead; at `slow` throttle.
   */
  crawl: 0.83, bow: 4, wade: 1, sound: 14, stuck: 2.5, full: 2.4, rate: 0.5, least: 1, most: 4.5, slack: 0.6, slow: 0.6,
  /** Ramming (new): the lead is at most `lead` s; from further than `commit` m, a ship she lies more than `abeam`
   *  (cosine) ahead or astern of is come at by way of a point off her beam, half the way out, `offMin`–`offMax` m; once
   *  her hull touches her foe's, she bears away for `recoil` s (a ram's blow lands once until they are RAM.rearm clear). */
  lead: 8, commit: 25, abeam: 0.5, offMin: 15, offMax: 50, recoil: 3,
  /** Answering a ram (adapted from 0117's answer to a gun): a ship within `threat` m, her bow within `aimed` rad of
   *  her, closing faster than `closing` of a ram's least, due within `warn` s and passing within `miss` m. Whether she
   *  sees it is decided once each `warn` s, with a chance of 0.2 + 0.75 × skill. */
  threat: 90, aimed: 0.6, closing: 0.8, warn: 5, miss: 0.75 * SHIP.length,
} as const;

/** A ship as a bot sees her: who she is, how she sails, the shove she is carried on by, and (a seam for health.ts) her
 *  hull, 0–100, taken as whole when not given. */
export interface Seen { id: number; ship: ShipState; shove?: Vec3; hull?: number }

export type Mode = 'roam' | 'fight' | 'flee';

/** What a bot carries from one step to the next. */
export interface Memory {
  /** Her random draws' state; seconds she has been afloat; steps to her next think. */
  rand: number;
  clock: number;
  think: number;
  /** What she is about, since when (s), and where she makes for. */
  mode: Mode;
  since: number;
  goal: Vec3;
  /** Her foe (an id, or -1), when she last saw her, and where. */
  foe: number;
  seen: number;
  last: Vec3;
  /** Who last rammed her (-1: none) and when. */
  hitBy: number;
  hitT: number;
  /** Seconds and way (sign, + to port) she holds a turn off land; seconds left backing off a bank (below 0: working
   *  off a bar), seconds crawling, and the way she backs off; seconds left bearing away from a ram. */
  avoid: number;
  backT: number;
  stuckT: number;
  strafe: number;
  recoil: number;
  /** Where she was a step ago. */
  was: Vec3;
}

/** A new mind for a ship at `at`, by her seed. Bots think on different steps, by their seeds. */
export const mind = (seed: number, at: Vec3): Memory => ({
  rand: (seed * 0x9e3779b1) >>> 0, clock: 0, think: 1 + (seed >>> 0) % BOT.every, mode: 'roam', since: 0, goal: at,
  foe: -1, seen: -Infinity, last: at, hitBy: -1, hitT: -Infinity, avoid: 0, backT: 0, stuckT: 0, strafe: 1, recoil: 0, was: at,
});

/** Her memory once `by` has rammed her (the game tells her, from contact.ts's blows). */
export const rammed = (m: Memory, by: number): Memory => ({ ...m, hitBy: by, hitT: m.clock });

// ---------------------------------------------------------------- the sphere

/** The way from p toward q along the surface: a unit tangent at p, or null at q (or its antipode). */
function toward(p: Vec3, q: Vec3): Vec3 | null {
  const t = add(q, p, -dot(p, q)), l = length(t);
  return l > 1e-12 ? scale(t, 1 / l) : null;
}
/** Tangent t at p turned `a` radians to port. */
const rotate = (p: Vec3, t: Vec3, a: number): Vec3 => add(scale(t, Math.cos(a)), cross(p, t), Math.sin(a));
/** A ship's way through the water and her shove: m/s, a tangent at her place. */
const velocity = (o: Seen): Vec3 => add(scale(o.ship.heading, o.ship.speed), o.shove ?? [0, 0, 0]);
/** A number 0..1 fixed by its two keys, for a choice made once and kept. */
const unitHash = (a: number, b: number) => random((Math.imul(a, 0x9e3779b1) ^ Math.imul(b, 0x85ebca6b)) >>> 0)();

// ---------------------------------------------------------------- one step

/** What a think and a step weigh. */
interface Ctx { own: Seen; others: readonly Seen[]; depth: Depth; m: Memory; t: Temper; foe: Seen | null; foeD: number; seed: number }

const open = (c: Ctx, p: Vec3) => c.depth(p) >= SHIP.draught + BOT.open;
/** Her next draw, 0..1. */
const roll = (m: Memory) => {
  const r = random(m.rand)();
  m.rand = (m.rand + 0x6d2b79f5) >>> 0;
  return r;
};
const between = (m: Memory, lo: number, hi: number) => lo + (hi - lo) * roll(m);

/**
 * One step of dt seconds of a bot's mind: what she orders her helm, and her memory after. `own` is her own ship,
 * `others` every other ship afloat (she sees only those in her sight), `seed` hers for good.
 */
export function think(own: Seen, others: readonly Seen[], depth: Depth, memory: Memory, seed: number, dt = STEP): { helm: Helm; memory: Memory } {
  const m: Memory = { ...memory, clock: memory.clock + dt, since: memory.since + dt, think: memory.think - 1 };
  const c: Ctx = { own, others, depth, m, t: temper(seed), foe: null, foeD: Infinity, seed };
  if (m.think <= 0) {
    m.think = BOT.every;
    perceive(c);
    decide(c);
  }
  c.foe = m.foe >= 0 ? others.find((o) => o.id === m.foe) ?? null : null;
  c.foeD = c.foe ? distance(own.ship.at, c.foe.ship.at) : Infinity;
  const helm = steer(c, dt);
  m.was = own.ship.at;
  return { helm, memory: m };
}

// ---------------------------------------------------------------- seeing

/** Whether land stands between a and b, high enough to hide a ship. */
function hidden(c: Ctx, a: Vec3, b: Vec3): boolean {
  const d = distance(a, b), t = toward(a, b);
  if (!t) return false;
  for (let s = BOT.sightStep; s < d; s += BOT.sightStep) if (-c.depth(along(a, t, s).p) > BOT.sightLine) return true;
  return false;
}

/** Notes the nearest ship she can see; a foe out of sight is followed to where she was last seen, then let go. */
function perceive(c: Ctx): void {
  const { m, own } = c;
  let best: Seen | null = null, bd = c.t.notice * (0.8 + 0.4 * c.t.skill);
  for (const o of c.others) {
    const d = distance(own.ship.at, o.ship.at);
    if (d > BOT.sightMax) continue;
    const score = o.id === m.hitBy && m.clock - m.hitT < BOT.grudge ? d * BOT.nearer : d;
    if (score >= bd || hidden(c, own.ship.at, o.ship.at)) continue;
    [bd, best] = [score, o];
  }
  if (best) [m.foe, m.seen, m.last] = [best.id, m.clock, best.ship.at];
  else if (m.foe >= 0 && (m.clock - m.seen > BOT.forget || !c.others.some((o) => o.id === m.foe))) m.foe = -1;
}

/** Whether she saw her foe when she last looked. */
const inSight = (c: Ctx) => c.m.foe >= 0 && c.m.clock - c.m.seen < (BOT.every - 0.5) * STEP;

// ---------------------------------------------------------------- deciding

/** How much she wants to ram the ship she sees (0117's fightUrge, a ram her weapon). */
function fightUrge(c: Ctx): number {
  const { m, t, foe, own } = c;
  if (!foe) return 0;
  const d = c.foeD;
  let will = t.fight * (0.6 + 0.4 * t.aggro);
  will += ((0.1 + 0.5 * t.skill) * ((own.hull ?? 100) - (foe.hull ?? 100))) / 100;
  if (m.hitBy === foe.id) will += BOT.roused * ramp(m.clock - m.hitT, BOT.grudge + BOT.cool, BOT.cool);
  for (const o of c.others) if (o.id !== foe.id && distance(own.ship.at, o.ship.at) < BOT.crowd) will -= BOT.crowding * t.skill;
  const close = ramp(d, BOT.closeFrom, BOT.closeAt);
  if (close >= 1) return 1;
  // past reach, a ship sailing away too fast to catch is let go: in a fight, once she is clearly away; out of one, she
  // is not taken up while she nearly is, so it doesn't flicker as she weaves (0117 went by her heading alone, as a gun
  // reaches a ship however fast she sails; a ram must catch her)
  const from = toward(foe.ship.at, own.ship.at);
  const flying = (from ? -dot(foe.ship.heading, from) : 0) * foe.ship.speed;
  const go = 1 - ramp(d, BOT.letGo - 10, BOT.letGo + 15) * ramp(flying, ...(m.mode === 'fight' ? BOT.outrun : BOT.outran));
  return Math.max(close, utility(logistic(will, BOT.will, BOT.willWidth), go));
}

/** Losing a fight: her hull down past where her temperament runs, with the foe close (0117's; a seam for health.ts). */
const losing = (c: Ctx) => (c.foe ? utility(ramp(c.own.hull ?? 100, c.t.run + 8, c.t.run - 4), ramp(c.foeD, 160, 130)) : 0);

/** Rammed by a ship she doesn't want to fight (0117's: shot by one): the less she wants to, and the sharper she is,
 *  the more she gets clear. */
function evading(c: Ctx): number {
  const { m } = c;
  if (!c.foe || c.foeD >= 140 || m.hitBy !== c.foe.id || m.clock - m.hitT > BOT.fresh) return 0;
  return utility(1 - fightUrge(c), 0.3 + 0.7 * c.t.skill);
}

interface Choice extends Option<Ctx> { readonly mode: Mode; act(c: Ctx): void }

// (0117's storm, 6, and shelter, 5.2, come first; heal, 3.5, next: seams for the Storm and health.ts. Its hunt (to the
// sound of guns), loot, raid and claiming water belong to things this sea hasn't got.)
const OPTIONS: readonly Choice[] = [
  { name: 'flee', weight: 3.3, mode: 'flee', score: (c) => Math.max(losing(c), evading(c)), act: (c) => { c.m.goal = away(c, c.m.last, BOT.run); } },
  { name: 'fight', weight: 2.6, mode: 'fight', score: fightUrge, act: (c) => { c.m.goal = c.m.last; } },
  {
    name: 'roam', weight: 1, mode: 'roam', score: () => 0.15, act: (c) => {
      const { m } = c;
      if (m.mode !== 'roam' || m.since > BOT.roam || distance(c.own.ship.at, m.goal) < BOT.arrive) {
        m.since = 0;
        m.goal = roamGoal(c);
      }
    },
  },
];

function decide(c: Ctx): void {
  const { m } = c;
  c.foe = m.foe >= 0 && inSight(c) ? c.others.find((o) => o.id === m.foe) ?? null : null;
  c.foeD = c.foe ? distance(c.own.ship.at, c.foe.ship.at) : Infinity;
  const current = OPTIONS.findIndex((o) => o.mode === m.mode);
  const k = choose(OPTIONS, c, current, c.t.skill, () => roll(m), momentum(m.since));
  const o = OPTIONS[k < 0 ? 2 : k];
  if (o.mode !== m.mode) [m.mode, m.since] = [o.mode, 0];
  o.act(c);
}

/** Open water `d` m from p away from `from`: straight away, or swung a little further round each way until open. */
function away(c: Ctx, from: Vec3, d: number): Vec3 {
  const p = c.own.ship.at, t = toward(from, p) ?? c.own.ship.heading;
  const out = toward(p, along(from, t, distance(from, p) + 1).p) ?? c.own.ship.heading;
  for (let k = 0; k <= 8; k++) {
    const q = along(p, rotate(p, out, (k % 2 ? 1 : -1) * Math.ceil(k / 2) * (Math.PI / 8)), d).p;
    if (open(c, q)) return q;
  }
  return along(p, out, d).p;
}

/** A mark to roam to: open water a random way off (0117's roamGoal, less its influence map and the Storm), or toward
 *  the deepest water round her. */
function roamGoal(c: Ctx): Vec3 {
  const p = c.own.ship.at, f = c.own.ship.heading;
  for (let tries = 0; tries < 8; tries++) {
    const q = along(p, rotate(p, f, between(c.m, -Math.PI, Math.PI)), between(c.m, BOT.near, BOT.far)).p;
    if (open(c, q)) return q;
  }
  return along(p, rotate(p, f, deepest(c)), BOT.near).p;
}

// ---------------------------------------------------------------- the helm, every step

/** Where to steer to ram `foe` on her side: led for where she will be, by way of her beam when she is end on. A tangent
 *  at her place. */
function ramCourse(c: Ctx, foe: Seen): Vec3 {
  const p = c.own.ship.at, d = c.foeD, t = toward(p, foe.ship.at);
  if (!t) return c.own.ship.heading;
  const r = scale(t, d), v = transport(velocity(foe), foe.ship.at, p), s = SHIP.top;
  // the soonest she can be where the foe is: |r + v·τ| = s·τ
  const a = dot(v, v) - s * s, b = 2 * dot(r, v), disc = b * b - 4 * a * d * d;
  let tau = d / s;
  if (disc >= 0 && Math.abs(a) > 1e-9) {
    const roots = [(-b - Math.sqrt(disc)) / (2 * a), (-b + Math.sqrt(disc)) / (2 * a)].filter((x) => x > 0);
    if (roots.length) tau = Math.min(...roots);
  }
  let aim = add(r, v, Math.min(tau, BOT.lead));
  const reach = length(aim);
  if (reach > BOT.commit) {
    const h = transport(foe.ship.heading, foe.ship.at, p), port = cross(p, h), back = scale(aim, -1 / reach);
    if (Math.abs(dot(back, h)) > BOT.abeam) aim = add(aim, port, Math.sign(dot(back, port) || 1) * Math.min(BOT.offMax, Math.max(BOT.offMin, reach / 2)));
  }
  return aim;
}

/** Whether the water `ahead` m out, `a` rad to port of her heading, is open. */
const probe = (c: Ctx, a: number, ahead: number) => open(c, along(c.own.ship.at, rotate(c.own.ship.at, c.own.ship.heading, a), ahead).p);

/** The way off a bank toward the deepest water, as a turn from her heading (rad, to port): by the highest ground she
 *  would cross in the first `sound` m each way, then by how deep the water is at the end of it. */
function deepest(c: Ctx): number {
  const { at, heading } = c.own.ship;
  let best = 0, low = Infinity;
  for (let k = -7; k <= 8; k++) {
    const t = rotate(at, heading, (k * Math.PI) / 8);
    let top = -Infinity, end = 0;
    for (let s = 2; s <= BOT.sound; s += 3) top = Math.max(top, (end = -c.depth(along(at, t, s).p)));
    const score = top + 0.25 * end;
    if (score < low) [low, best] = [score, (k * Math.PI) / 8];
  }
  return best;
}

function steer(c: Ctx, dt: number): Helm {
  const { m, own } = c, ship = own.ship;
  const order = (turn: number, throttle: number): Helm => ({ course: turned(ship, Math.max(-3, Math.min(3, turn))), throttle });
  // what she makes for: her foe's side, away from her after a ram, or her goal
  const foe = m.mode === 'fight' && inSight(c) ? c.foe : null;
  if (foe && gap(ship, foe.ship) < 1) m.recoil = BOT.recoil;
  m.recoil = Math.max(0, m.recoil - dt);
  let want: Vec3 | null;
  if (foe && m.recoil > 0) {
    const at = toward(ship.at, foe.ship.at);
    want = at && scale(at, -1);
  } else if (foe) want = ramCourse(c, foe);
  else want = toward(ship.at, m.goal);
  let turn = want ? offCourse(ship, want) : 0;
  const course = turn;
  // feel ahead along the course (not her heading: coming round, she would only ever feel the bank)
  const ahead = Math.min(BOT.feel + ship.speed, foe ? c.foeD : distance(ship.at, m.goal));
  if (want && !open(c, along(ship.at, normalize(add(want, ship.at, -dot(want, ship.at))), ahead).p)) {
    const port = probe(c, BOT.side, BOT.feelSide + ship.speed), starboard = probe(c, -BOT.side, BOT.feelSide + ship.speed);
    // she keeps turning off the way she began to, unless only the other side lies open
    let way = Math.sign(m.avoid);
    if (way === 0 || (way > 0 ? !port && starboard : !starboard && port)) way = port !== starboard ? (port ? 1 : -1) : port ? 0 : turn >= 0 ? 1 : -1;
    if (way !== 0) {
      turn = way * (port !== starboard ? BOT.firm : BOT.hard);
      m.avoid = way * BOT.avoid;
    }
  } else if (m.avoid !== 0) {
    if (Math.sign(turn) !== Math.sign(m.avoid)) turn = Math.sign(m.avoid) * BOT.firm;
    m.avoid = m.avoid > 0 ? Math.max(0, m.avoid - dt) : Math.min(0, m.avoid + dt);
  }
  const answered = answer(c);
  if (answered !== null) turn = answered;
  return stuck(c, dt, course) ?? order(turn, 1);
}

/** A ram coming at her: the turn that lays her bow or her stern to it, whichever is the nearer, or null if none she
 *  sees. Not one she is driving into bow on herself. */
function answer(c: Ctx): number | null {
  const { m, own } = c, p = own.ship.at, mine = velocity(own);
  for (const o of c.others) {
    const d = distance(p, o.ship.at), t = toward(p, o.ship.at);
    if (d > BOT.threat || !t) continue;
    const r = scale(t, d), rel = add(transport(velocity(o), o.ship.at, p), mine, -1), closing = -dot(t, rel);
    if (closing < BOT.closing * RAM.least || (d - SHIP.length / 2) / closing > BOT.warn) continue;
    const back = toward(o.ship.at, p);
    if (!back || dot(o.ship.heading, back) < Math.cos(BOT.aimed)) continue;
    const when = -dot(r, rel) / dot(rel, rel);
    if (length(add(r, rel, when)) > BOT.miss) continue;
    const bearing = offCourse(own.ship, t);
    if (m.mode === 'fight' && o.id === m.foe && Math.abs(bearing) < 0.5) continue;
    if (unitHash(c.seed, o.id * 7919 + Math.floor(m.clock / BOT.warn)) > 0.2 + 0.75 * c.t.skill) continue;
    return Math.abs(bearing) < Math.PI / 2 ? bearing : bearing - Math.sign(bearing) * Math.PI;
  }
  return null;
}

/**
 * Backs off a bank she is stuck against (0117's stuck), by how far she really sailed last step, not her speed: a hull
 * pressed into a bank keeps her way on while hardly moving. `course` is the turn she wants, before any off land.
 */
function stuck(c: Ctx, dt: number, course: number): Helm | null {
  const { m } = c, ship = c.own.ship;
  const order = (turn: number): Helm => ({ course: turned(ship, turn), throttle: BOT.slow });
  if (m.backT > 0) {
    m.backT -= dt;
    return order(m.strafe * BOT.full);
  }
  const crawling = distance(m.was, ship.at) < BOT.crawl * dt;
  // held up by shoal water off her bow, she works off it the way the water deepens; the clock runs below zero meanwhile
  const held = crawling && !open(c, along(ship.at, ship.heading, 0.4 * SHIP.length + BOT.bow).p);
  if (held && m.backT > -(BOT.wade + BOT.most)) {
    m.backT -= dt;
    if (m.backT > -BOT.wade) return null;
    const deep = deepest(c);
    // (with the way off astern she holds the turn she is in, or she would swing from one side to the other)
    return order(Math.abs(deep) > Math.PI / 2 && ship.turn * deep < 0 ? Math.sign(ship.turn) * BOT.full : Math.max(-BOT.full, Math.min(BOT.full, 2 * deep)));
  }
  // and if that doesn't float her, she backs off as from a bank
  const gaveUp = m.backT <= -(BOT.wade + BOT.most);
  m.backT = 0;
  if (crawling || gaveUp) m.stuckT += gaveUp ? BOT.stuck : dt;
  else m.stuckT = Math.max(0, m.stuckT - 2 * dt);
  if (m.stuckT <= BOT.stuck) return null;
  m.stuckT = 0;
  // she turns off toward whichever side lies open, or the way to her course when both do, until it lies less than half
  // a turn on, so she doesn't swing back across the bank
  const reach = BOT.feelSide + ship.speed, port = probe(c, 2 * BOT.side, reach), starboard = probe(c, -2 * BOT.side, reach);
  m.strafe = port !== starboard ? (port ? 1 : -1) : course >= 0 ? 1 : -1;
  const round = m.strafe * course >= 0 ? Math.abs(course) : 2 * Math.PI - Math.abs(course);
  m.backT = Math.min(BOT.most, Math.max(between(m, BOT.least, BOT.least * 2.2), (round - Math.PI + BOT.slack) / BOT.rate));
  return order(m.strafe * BOT.full);
}

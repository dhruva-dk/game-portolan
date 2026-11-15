// What a bot is, shared by her mind (bot.ts), her helm (helmsman.ts) and her gun (gunner.ts): what she is tuned by,
// how she sees a ship, what she carries from one step to the next, what a step of her weighs, and the few bits of the
// sphere and of chance they all reach for.
//
// Pure arithmetic: no three, so it runs in node for the tests; deterministic for the same inputs, to the bit.

import { add, cross, dot, length, scale, type Vec3 } from '../world/sphere.ts';
import { random } from '../world/random.ts';
import { STEP } from './fixed.ts';
import { SPEC, type Handling } from './fit.ts';
import { SHIP } from './handling.ts';
import { gunner, type Gunner } from './gunner.ts';
import type { ShipState } from './ship.ts';
import type { Chart, Route } from './route.ts';
import type { Depth } from './shoal.ts';
import type { Storm } from './storm.ts';
import { temper, type Temper } from './temper.ts';
import type { Call, Service, Stance } from '../race.ts';
import type { Crew } from './battle.ts';
import type { Loot } from './loot.ts';
import type { Holdings } from './claimer.ts';
import type { Rule } from '../world/biome.ts';

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
   * Backing off a bank: making less than `crawl` m/s she is stuck (0117: 1, by top speed 14.5 → 27). With shoal water
   * `bow` m past her forefoot (0117: 4 m past a shorter hull's centre), she waits `wade` s, then makes for the deepest
   * water `sound` m round her for up to `most` s. Else stuck `stuck` s, she turns hard (steer `full`) toward the open
   * side at about `rate` rad/s (0117: 0.65 at her turn of 0.55; here SHIP.turn 0.94), for `least`–2.2×`least` s, at most
   * `most`, until her course lies within `slack` of half a turn ahead; at `slow` throttle.
   */
  crawl: 1.86, bow: 4, wade: 1, sound: 14, stuck: 2.5, full: 2.4, rate: 1.11, least: 1, most: 4.5, slack: 0.6, slow: 0.6,
  /** Ramming (new): the lead is at most `lead` s; from further than `commit` m, a ship she lies more than `abeam`
   *  (cosine) ahead or astern of is come at by way of a point off her beam, half the way out, `offMin`–`offMax` m; once
   *  her hull touches her foe's, she bears away for `recoil` s (a ram's blow lands once until they are RAM.rearm clear). */
  lead: 8, commit: 25, abeam: 0.5, offMin: 15, offMax: 50, recoil: 3,
  /** Making for a mark inside the circle she turns at her speed (new: else she sails round it for good), she slows to
   *  `tighten` of the speed whose circle passes through it, down to `least` throttle (enough for the rudder to bite). */
  tighten: 0.8, leastWay: 0.35,
  /** Answering a ram (adapted from 0117's answer to a gun): a ship within `threat` m, her bow within `aimed` rad of
   *  her, closing faster than `closing` of a ram's least, due within `warn` s and passing within `miss` m. Whether she
   *  sees it is decided once each `warn` s, with a chance of 0.2 + 0.75 × skill. */
  threat: 90, aimed: 0.6, closing: 0.8, warn: 5, miss: 0.75 * SHIP.length,
  /**
   * The storm (0117's storm option, keepInside, inward and roamGoal), by her temperament's margin (Temper): the next
   * cap is `late` when it is closing or due to within this many s; getting inside is urgent from `ease[0]` of her
   * margin in from the edge, wholly by `ease[1]`; late, she is well inside the next cap `inNext` of her margin in.
   * Within `nearEdge` of her margin of the edge she makes for the cap she is in, else for the next. Making in, she
   * makes for open water `inward` of the way out from the centre to her edge less her margin, found within `shore` m
   * of it in rings `ring` m apart (0117: 20 of its 6.8 m cells). Once the cap is under `drift` m, a roaming mark is
   * drawn `drawn` of the way in toward its centre (a chord's share, as 0117 drew it).
   */
  late: 25, ease: [0.55, 0.3] as const, inNext: 0.5, nearEdge: 0.4, inward: 0.6, shore: 136, ring: 6.8, drift: 600, drawn: 0.4,
  /**
   * Early in a match she would sooner keep out of a fight (0117's restraint): her will to fight falls by this much in
   * each of the storm's phases (the last once it has closed), and more by `more` with `lastFew` ships or fewer afloat.
   * While it does, she lets a ship sailing away go past `letGo` m with a gun too, and holds her fire outside a fight
   * she chose, but at a ship within `letGo` m that shot her within `shotFresh` s (0117: 150 ticks).
   */
  restraint: [0.5, 0.5, 0.45, 0.35, 0.25, 0.1, 0, 0] as const, lastFew: 3, more: 0.4, shotFresh: 5,
  /** The top speed, m/s, the temperaments' storm margins were tuned at (before #58 doubled it): a margin is that many
   *  metres at this speed, as many seconds' sailing at hers. */
  tuned: 13.5,
} as const;

/** A ship as a bot sees her: who she is, how she sails, the shove she is carried on by, her hull and shield (health.ts;
 *  whole and none when not given), whether she carries a gun, her handling (fit.ts; the tables' when not given) and
 *  her side (contact.ts Vessel; her own when not given); and her own, what she carries (battle.ts Crew: her hold and
 *  gust), without which she pays her stores no heed, her parts failed (wear.ts) and whether her flight is with her or
 *  coming (flight.ts). */
export interface Seen {
  id: number; ship: ShipState; shove?: Vec3; hull?: number; shield?: number; armed?: boolean; fit?: Handling; side?: number; crew?: Crew;
  faults?: number; served?: boolean;
}

/** A ship's handling as a bot sees her. */
export const fitOf = (s: Seen): Handling => s.fit ?? SPEC;

/** Whether two ships are of one side: no foes to each other, their trails and water each other's. */
export const mates = (a: Seen, b: Seen) => a.id !== b.id && (a.side ?? a.id) === (b.side ?? b.id);

/** What a bot knows of the sea besides the ships on it: how deep it is; its chart (route.ts), without which she finds
 *  no routes round land, only feels her way along it; the storm now (storm.ts), without which she pays it no heed; and
 *  the loot on the water (loot.ts); and who holds it (territory.ts), without which she claims none. */
export interface Sea { depth: Depth; chart?: Chart | null; storm?: Storm | null; loot?: readonly Loot[]; holdings?: Holdings | null; rule?: Rule }

export type Mode = 'roam' | 'fight' | 'flee' | 'storm' | 'heal' | 'loot' | 'claim' | 'home' | 'cut' | 'service' | 'shadow' | 'attack' | 'hold';

/** What a bot carries from one step to the next, her gunnery's with it. */
export interface Memory extends Gunner {
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
  /** Who last rammed her (-1: none) and when; who last shot her and when. */
  hitBy: number;
  hitT: number;
  shotBy: number;
  shotT: number;
  /** Seconds and way (sign, + to port) she holds a turn off land; seconds left backing off a bank (below 0: working
   *  off a bar), seconds crawling, and the way she backs off; seconds left bearing away from a ram. */
  avoid: number;
  backT: number;
  stuckT: number;
  strafe: number;
  recoil: number;
  /** Where she was a step ago. */
  was: Vec3;
  /** The route round land she follows (route.ts), if any. */
  route: Route | null;
  /** Loot (purser.ts): the piece she would go for as she last weighed it, the one she is going for and for how many
   *  seconds, and the one she gave up (ids; -1 none). */
  loot: number;
  target: number;
  lootT: number;
  shun: number;
  /** Her water (claimer.ts): where she last lay in it; the bite she sails (its marks), the one she makes for, and when
   *  she may set out on the next. */
  haven: Vec3;
  bite: Vec3[] | null;
  leg: number;
  rested: number;
  /** A call from ship one (crewmate.ts): the last she was given (its seq), the call she obeys and the ship it names (an
   *  attack's), the clock she notices it at and the clock it lapses at. */
  heard: number;
  call: Call | null;
  callFor: number;
  callFrom: number;
  callTo: number;
}

/** A new mind for a ship at `at`, by her seed. Bots think on different steps, by their seeds. */
export const mind = (seed: number, at: Vec3): Memory => ({
  rand: (seed * 0x9e3779b1) >>> 0, clock: 0, think: 1 + (seed >>> 0) % BOT.every, mode: 'roam', since: 0, goal: at,
  foe: -1, seen: -Infinity, last: at, hitBy: -1, hitT: -Infinity, shotBy: -1, shotT: -Infinity, avoid: 0, backT: 0, stuckT: 0, strafe: 1, recoil: 0, was: at,
  route: null, loot: -1, target: -1, lootT: 0, shun: -1, haven: at, bite: null, leg: 0, rested: 0,
  heard: 0, call: null, callFor: -1, callFrom: Infinity, callTo: -Infinity, ...gunner(),
});

/** Her memory once `by` has rammed her (the game tells her, from contact.ts's blows). */
export const rammed = (m: Memory, by: number): Memory => ({ ...m, hitBy: by, hitT: m.clock });

/** Her memory once a ball of `by`'s has struck her (the game tells her, from battle.ts's strikes that aren't rams). */
export const shot = (m: Memory, by: number): Memory => ({ ...m, shotBy: by, shotT: m.clock });

/** What her side's first ship asks of her, as plain input like a helm (#58 section 8.2; play/ passes it each step):
 *  who leads her side (ship one), the ship ship one fights (her aim, or last aim; −1 none), and the last call given her,
 *  numbered (`seq`, from 1; 0 none), with the ship ship one fought when it was given. */
export interface Lead { id: number; target: number; call: Call | null; seq: number; at: number }

/** What a bot sails by: her seed, for good, and her temperament (temper.ts: `temper(seed)`, or her card's captain's
 *  `temperOf`, made at launch and refreshed by the match's clock); and, in a race, her captain's Nerve (0–20), what her
 *  flight can do (race.ts Service; none: she has none), her stance (crewmate.ts) and her lead (a crewmate's). */
export interface Hand { seed: number; t: Temper; nerve?: number; service?: Service; stance?: Stance; lead?: Lead }

/** What a temper by her seed alone sails by (a card-less bot's). */
export const byTemper = (seed: number): Hand => ({ seed, t: temper(seed) });

/** What a think and a step weigh: her, the others afloat, the sea, her memory (written to), her temperament, her foe
 *  as she sees her now and how far off, her seed, and what she sails by. */
export interface Ctx { own: Seen; others: readonly Seen[]; sea: Sea; m: Memory; t: Temper; foe: Seen | null; foeD: number; seed: number; hand: Hand }

// ---------------------------------------------------------------- the sphere

/** The way from p toward q along the surface: a unit tangent at p, or null at q (or its antipode). */
export function toward(p: Vec3, q: Vec3): Vec3 | null {
  const t = add(q, p, -dot(p, q)), l = length(t);
  return l > 1e-12 ? scale(t, 1 / l) : null;
}
/** Tangent t at p turned `a` radians to port. */
export const rotate = (p: Vec3, t: Vec3, a: number): Vec3 => add(scale(t, Math.cos(a)), cross(p, t), Math.sin(a));
/** A ship's way through the water and her shove: m/s, a tangent at her place. */
export const velocity = (o: Seen): Vec3 => add(scale(o.ship.heading, o.ship.speed), o.shove ?? [0, 0, 0]);

// ---------------------------------------------------------------- chance and the water

/** A number 0..1 fixed by its two keys, for a choice made once and kept. */
export const unitHash = (a: number, b: number) => random((Math.imul(a, 0x9e3779b1) ^ Math.imul(b, 0x85ebca6b)) >>> 0)();
/** Her next draw, 0..1. */
export const roll = (m: Memory) => {
  const r = random(m.rand)();
  m.rand = (m.rand + 0x6d2b79f5) >>> 0;
  return r;
};
export const between = (m: Memory, lo: number, hi: number) => lo + (hi - lo) * roll(m);

/** Whether the water at p is open to her. */
export const open = (c: Ctx, p: Vec3) => c.sea.depth(p) >= SHIP.draught + BOT.open;

/** Whether she saw her foe when she last looked. */
export const inSight = (c: Ctx) => c.m.foe >= 0 && c.m.clock - c.m.seen < (BOT.every - 0.5) * STEP;

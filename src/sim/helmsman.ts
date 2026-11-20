// A bot's helm, every step: she steers the way her pilot hands her (pilot.ts
// Way), at its pace, knowing nothing of what she is about (steer,
// answer and stuck below):
// - feeling ahead along that way for shoal water, and turning off toward the
// side that lies open, holding the turn a
//   moment once the way clears rather than swing back at what she turned from;
// - easing up for a mark inside her turning circle, and near one she makes for
//   gently;
// - answering a ram coming at her: bow or stern to it, whichever is the nearer
// turn, end on where a blow does least;
//   a sharp captain sees it nearly always, a green one often not;
// - and working off a bank she is stuck against, toward the open side or the
// deepest water.
//
// Pure arithmetic: no three, so it runs in node for the tests; deterministic
// for the same inputs, to the bit.

import { STRIDE } from '../world/random.ts';
import {
  add,
  apart,
  along,
  distance,
  dot,
  length,
  normalize,
  scale,
  toward,
  transport,
  type Vec3,
} from '../world/sphere.ts';
import { RAM, SHIP } from './handling.ts';
import { offCourse, turned, type Helm } from './ship.ts';
import {
  between,
  open,
  rotate,
  unitHash,
  velocity,
  type Ctx,
} from './captain.ts';
import type { Way } from './pilot.ts';

/**
 * What her helm carries from step to step: seconds and way (sign, + to port)
 * she holds a turn off land; seconds left backing off a bank (below 0: working
 * off a bar), seconds crawling, and the way she backs off; where she was a step
 * ago.
 */
export interface HelmMemory {
  avoid: number;
  backT: number;
  stuckT: number;
  strafe: number;
  was: Vec3;
}

/** A helm's memory as she puts to sea at `at`. */
export const helmMemory = (at: Vec3): HelmMemory => ({
  avoid: 0,
  backT: 0,
  stuckT: 0,
  strafe: 1,
  was: at,
});

/** Everything her helm is tuned by. Seconds and metres. */
const HELM = {
  /**
   * Feeling ahead for shoal water: this far plus her speed (m/s × 1 s); sides
   * felt `side` rad either way, a little further; a turn off land is `firm` rad
   * of steer when one side is open, `hard` when neither is; held `avoid` s once
   * the way clears.
   */
  feel: 14,
  feelSide: 16,
  side: 0.6,
  firm: 0.9,
  hard: 1.2,
  avoid: 0.8,
  /**
   * Backing off a bank: making less than `crawl` m/s she is stuck (1 at a top
   * of 14.5, scaled to SHIP.top). With shoal water `bow` m past her forefoot,
   * she waits `wade` s, then makes for the deepest water `sound` m round her
   * for up to `most` s. Else stuck `stuck` s, she turns hard (steer `full`)
   * toward the open side at about `rate` rad/s (0.65 at a turn of 0.55;
   * SHIP.turn is 0.6), for `least`–2.2×`least` s, at most `most`, until her
   * course lies within `slack` of half a turn ahead; at `slow` throttle.
   */
  crawl: 0.93,
  bow: 4,
  wade: 1,
  sound: 14,
  stuck: 2.5,
  full: 2.4,
  rate: 0.56,
  least: 1,
  most: 4.5,
  slack: 0.6,
  slow: 0.6,
  /**
   * Making for a mark inside the circle she turns at her speed (else she sails
   * round it for good), she slows to `tighten` of the speed whose circle passes
   * through it, down to `least` throttle (enough for the rudder to bite).
   */
  tighten: 0.8,
  leastWay: 0.35,
  /** Making for a mark gently, her throttle within `near` m of it. */
  gently: 0.55,
  near: 25,
  /**
   * Answering a ram: a ship within `threat` m, her bow within `aimed` rad of
   * her, closing faster than `closing` of a ram's least, due within `warn` s
   * and passing within `miss` m. Whether she sees it is decided once each
   * `warn` s, with a chance of 0.2 + 0.75 × skill.
   */
  threat: 90,
  aimed: 0.6,
  closing: 0.8,
  warn: 5,
  miss: 0.75 * SHIP.length,
} as const;

/** Whether the water `ahead` m out, `a` rad to port of her heading, is open. */
const probe = (c: Ctx, a: number, ahead: number) =>
  open(
    c,
    along(c.own.ship.at, rotate(c.own.ship.at, c.own.ship.heading, a), ahead).p
  );

/**
 * The way off a bank toward the deepest water, as a turn from her heading (rad,
 * to port): by the highest ground she would cross in the first `sound` m each
 * way, then by how deep the water is at the end of it.
 */
export function deepest(c: Ctx): number {
  const { at, heading } = c.own.ship;
  let best = 0,
    low = Infinity;
  for (let k = -7; k <= 8; k++) {
    const t = rotate(at, heading, (k * Math.PI) / 8);
    let top = -Infinity,
      end = 0;
    for (let s = 2; s <= HELM.sound; s += 3)
      top = Math.max(top, (end = -c.sea.depth(along(at, t, s).p)));
    const score = top + 0.25 * end;
    if (score < low) [low, best] = [score, (k * Math.PI) / 8];
  }
  return best;
}

/**
 * Her helm's orders this step, along `way`; and whether she is lost (backing
 * off a bank, so the route she was on is to be let go). Updates her memory.
 */
export function steer(
  c: Ctx,
  way: Way,
  dt: number
): { helm: Helm; lost: boolean } {
  const { m } = c,
    ship = c.own.ship,
    { want, distance: toD } = way;
  const order = (turn: number, throttle: number): Helm => ({
    course: turned(ship, Math.max(-3, Math.min(3, turn))),
    throttle,
  });
  let turn = want ? offCourse(ship, want) : 0;
  const course = turn;
  // feel ahead along the course (not her heading: coming round, she would only
  // ever feel the bank)
  const ahead = Math.min(HELM.feel + ship.speed, toD);
  if (
    want &&
    !open(
      c,
      along(ship.at, normalize(add(want, ship.at, -dot(want, ship.at))), ahead)
        .p
    )
  ) {
    const port = probe(c, HELM.side, HELM.feelSide + ship.speed),
      starboard = probe(c, -HELM.side, HELM.feelSide + ship.speed);
    // she keeps turning off the way she began to, unless only the other side
    // lies open
    let way = Math.sign(m.avoid);
    if (way === 0 || (way > 0 ? !port && starboard : !starboard && port)) {
      way =
        port !== starboard ? (port ? 1 : -1) : port ? 0 : turn >= 0 ? 1 : -1;
    }
    if (way !== 0) {
      turn = way * (port !== starboard ? HELM.firm : HELM.hard);
      m.avoid = way * HELM.avoid;
    }
  } else if (m.avoid !== 0) {
    if (Math.sign(turn) !== Math.sign(m.avoid))
      turn = Math.sign(m.avoid) * HELM.firm;
    m.avoid =
      m.avoid > 0 ? Math.max(0, m.avoid - dt) : Math.min(0, m.avoid + dt);
  }
  const answered = answer(c, way.foe);
  if (answered !== null) turn = answered;
  // making for it gently, she eases up near it
  const easy = way.pace === 'gently' && toD < HELM.near ? HELM.gently : 1;
  // a mark (not a ship she rams) inside the circle she turns at her speed she
  // would only sail round: slowed to turn to it, the circle through it r = d /
  // (2 sin off), the speed that turns it r × SHIP.turn
  const off = Math.abs(course),
    r = toD / (2 * (off > Math.PI / 2 ? 1 : Math.max(0.05, Math.sin(off))));
  const tight =
    way.pace === 'ram'
      ? 1
      : Math.max(
          HELM.leastWay,
          Math.min(1, (HELM.tighten * r * SHIP.turn) / SHIP.top)
        );
  const s = stuck(c, dt, course);
  m.was = ship.at;
  return { helm: s.helm ?? order(turn, Math.min(easy, tight)), lost: s.lost };
}

/**
 * A ram coming at her: the turn that lays her bow or her stern to it, whichever
 * is the nearer, or null if none she sees. Not one she is driving into bow on
 * herself, `foe` the ship she means to strike.
 */
function answer(c: Ctx, foe: number): number | null {
  const { m, own } = c,
    p = own.ship.at,
    mine = velocity(own);
  for (const o of c.others) {
    if (apart(p, o.ship.at, HELM.threat)) continue;
    const d = distance(p, o.ship.at),
      t = toward(p, o.ship.at);
    if (d > HELM.threat || !t) continue;
    const r = scale(t, d),
      rel = add(transport(velocity(o), o.ship.at, p), mine, -1),
      closing = -dot(t, rel);
    if (
      closing < HELM.closing * RAM.least ||
      (d - SHIP.length / 2) / closing > HELM.warn
    )
      continue;
    const back = toward(o.ship.at, p);
    if (!back || dot(o.ship.heading, back) < Math.cos(HELM.aimed)) continue;
    const when = -dot(r, rel) / dot(rel, rel);
    if (length(add(r, rel, when)) > HELM.miss) continue;
    const bearing = offCourse(own.ship, t);
    if (o.id === foe && Math.abs(bearing) < 0.5) continue;
    if (
      unitHash(c.seed, o.id * STRIDE + Math.floor(m.clock / HELM.warn)) >
      0.2 + 0.75 * c.t.skill
    )
      continue;
    return Math.abs(bearing) < Math.PI / 2
      ? bearing
      : bearing - Math.sign(bearing) * Math.PI;
  }
  return null;
}

/**
 * Backs off a bank she is stuck against, by how far she really sailed last
 * step, not her speed: a hull pressed into a bank keeps her way on while hardly
 * moving. `course` is the turn she wants, before any off land. Her helm while
 * she backs off (null: none), and whether she has just found herself lost.
 */
function stuck(
  c: Ctx,
  dt: number,
  course: number
): { helm: Helm | null; lost: boolean } {
  const { m } = c,
    ship = c.own.ship;
  const order = (turn: number, lost = false) => ({
    helm: { course: turned(ship, turn), throttle: HELM.slow },
    lost,
  });
  const steady = { helm: null, lost: false };
  if (m.backT > 0) {
    m.backT -= dt;
    return order(m.strafe * HELM.full);
  }
  const crawling = distance(m.was, ship.at) < HELM.crawl * dt;
  // held up by shoal water off her bow, she works off it the way the water
  // deepens; the clock runs below zero meanwhile
  const held =
    crawling &&
    !open(c, along(ship.at, ship.heading, 0.4 * SHIP.length + HELM.bow).p);
  if (held && m.backT > -(HELM.wade + HELM.most)) {
    m.backT -= dt;
    if (m.backT > -HELM.wade) return steady;
    const deep = deepest(c);
    // (with the way off astern she holds the turn she is in, or she would swing
    // from one side to the other)
    const holding = Math.abs(deep) > Math.PI / 2 && ship.turn * deep < 0;
    return order(
      holding
        ? Math.sign(ship.turn) * HELM.full
        : Math.max(-HELM.full, Math.min(HELM.full, 2 * deep)),
      m.backT + dt > -HELM.wade
    );
  }
  // and if that doesn't float her, she backs off as from a bank
  const gaveUp = m.backT <= -(HELM.wade + HELM.most);
  m.backT = 0;
  if (crawling || gaveUp) m.stuckT += gaveUp ? HELM.stuck : dt;
  else m.stuckT = Math.max(0, m.stuckT - 2 * dt);
  if (m.stuckT <= HELM.stuck) return steady;
  m.stuckT = 0;
  // she turns off toward whichever side lies open, or the way to her course
  // when both do, until it lies less than half a turn on, so she doesn't swing
  // back across the bank
  const reach = HELM.feelSide + ship.speed,
    port = probe(c, 2 * HELM.side, reach),
    starboard = probe(c, -2 * HELM.side, reach);
  m.strafe = port !== starboard ? (port ? 1 : -1) : course >= 0 ? 1 : -1;
  const round =
    m.strafe * course >= 0 ? Math.abs(course) : 2 * Math.PI - Math.abs(course);
  m.backT = Math.min(
    HELM.most,
    Math.max(
      between(m, HELM.least, HELM.least * 2.2),
      (round - Math.PI + HELM.slack) / HELM.rate
    )
  );
  return order(m.strafe * HELM.full, true);
}

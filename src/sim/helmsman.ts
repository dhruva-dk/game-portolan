// A bot's helm, every step (bot.ts decides what she is about; this sails her there), as 0117's helm did
// (src/sim/captains/brain.ts helm, stuck, answer):
// - for her goal: the ship she would ram (to strike her side, led for where she will be: new here, as 0117 rammed
//   only in passing), a mark on the ring round her foe when armed (gunner.ts), or her goal; by a route round land
//   (route.ts) when the water to it isn't clear and she has a chart;
// - feeling ahead along that course for shoal water, and turning off toward the side that lies open, holding the turn a
//   moment once the way clears rather than swing back at what she turned from;
// - answering a ram coming at her (0117's answer to a gun winding up on her): bow or stern to it, whichever is the
//   nearer turn, end on where a blow does least; a sharp captain sees it nearly always, a green one often not;
// - and working off a bank she is stuck against, toward the open side or the deepest water.
//
// Pure arithmetic: no three, so it runs in node for the tests; deterministic for the same inputs, to the bit.

import { add, along, cross, distance, dot, length, normalize, scale, transport, type Vec3 } from '../world/sphere.ts';
import { gap } from './contact.ts';
import { RAM, SHIP } from './handling.ts';
import { ring } from './gunner.ts';
import { offCourse, turned, type Helm } from './ship.ts';
import { course as routed } from './route.ts';
import { PURSER } from './purser.ts';
import { BOT, between, inSight, open, roll, rotate, toward, unitHash, velocity, type Ctx, type Seen } from './captain.ts';

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
export function deepest(c: Ctx): number {
  const { at, heading } = c.own.ship;
  let best = 0, low = Infinity;
  for (let k = -7; k <= 8; k++) {
    const t = rotate(at, heading, (k * Math.PI) / 8);
    let top = -Infinity, end = 0;
    for (let s = 2; s <= BOT.sound; s += 3) top = Math.max(top, (end = -c.sea.depth(along(at, t, s).p)));
    const score = top + 0.25 * end;
    if (score < low) [low, best] = [score, (k * Math.PI) / 8];
  }
  return best;
}

/** Her helm's orders this step, for what she is about (her memory's mode, goal and foe). Updates her memory. */
export function steer(c: Ctx, dt: number): Helm {
  const { m, own } = c, ship = own.ship;
  const order = (turn: number, throttle: number): Helm => ({ course: turned(ship, Math.max(-3, Math.min(3, turn))), throttle });
  // what she makes for: her foe's side, away from her after a ram, or her goal
  const foe = m.mode === 'fight' && inSight(c) ? c.foe : null;
  if (foe && gap(ship, foe.ship) < 1) m.recoil = BOT.recoil;
  m.recoil = Math.max(0, m.recoil - dt);
  let want: Vec3 | null, toD = foe ? c.foeD : distance(ship.at, m.goal);
  if (foe && m.recoil > 0) {
    const at = toward(ship.at, foe.ship.at);
    want = at && scale(at, -1);
  } else {
    // armed, she makes for a mark on the ring round her foe (gunner.ts); land in the way, by a route round it (route.ts)
    const mark = foe && own.armed ? ring(m, ship.at, foe, c.t.standoff, c.t.skill, () => roll(m), dt) : null;
    const r = c.sea.chart && routed(c.sea.chart, ship.at, mark ?? (foe ? foe.ship.at : m.goal), m.route, dt);
    m.route = r ? r.route : null;
    if (r && r.to) [want, toD] = [toward(ship.at, r.to), distance(ship.at, r.to)];
    else want = mark ? toward(ship.at, mark) : foe ? ramCourse(c, foe) : toward(ship.at, m.goal);
  }
  let turn = want ? offCourse(ship, want) : 0;
  const course = turn;
  // feel ahead along the course (not her heading: coming round, she would only ever feel the bank)
  const ahead = Math.min(BOT.feel + ship.speed, toD);
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
  // going for loot or mending, she eases up near where she makes for (0117's)
  const easy = (m.mode === 'loot' || m.mode === 'heal') && toD < PURSER.near ? PURSER.slow : 1;
  // a mark (not a ship) inside the circle she turns at her speed she would only sail round: slowed to turn to it, the
  // circle through it r = d / (2 sin off), the speed that turns it r × SHIP.turn
  const off = Math.abs(course), r = toD / (2 * (off > Math.PI / 2 ? 1 : Math.max(0.05, Math.sin(off))));
  const tight = foe ? 1 : Math.max(BOT.leastWay, Math.min(1, (BOT.tighten * r * SHIP.turn) / SHIP.top));
  return stuck(c, dt, course) ?? order(turn, Math.min(easy, tight));
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
    if (m.backT + dt > -BOT.wade) m.route = null;
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
  m.route = null;
  // she turns off toward whichever side lies open, or the way to her course when both do, until it lies less than half
  // a turn on, so she doesn't swing back across the bank
  const reach = BOT.feelSide + ship.speed, port = probe(c, 2 * BOT.side, reach), starboard = probe(c, -2 * BOT.side, reach);
  m.strafe = port !== starboard ? (port ? 1 : -1) : course >= 0 ? 1 : -1;
  const round = m.strafe * course >= 0 ? Math.abs(course) : 2 * Math.PI - Math.abs(course);
  m.backT = Math.min(BOT.most, Math.max(between(m, BOT.least, BOT.least * 2.2), (round - Math.PI + BOT.slack) / BOT.rate));
  return order(m.strafe * BOT.full);
}

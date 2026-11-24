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

export interface HelmMemory {
  avoid: number;
  backT: number;
  stuckT: number;
  strafe: number;
  was: Vec3;
  side: number;
  head: Vec3;
  sideT: number;
  blocked: number;
}

export const helmMemory = (at: Vec3): HelmMemory => ({
  avoid: 0,
  backT: 0,
  stuckT: 0,
  strafe: 1,
  was: at,
  side: 0,
  head: [0, 0, 0],
  sideT: 0,
  blocked: 0,
});

export const HELM = {
  feel: 14,
  feelSide: 16,
  side: 0.6,
  firm: 0.9,
  hard: 1.2,
  avoid: 0.8,
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
  budge: 1.5,
  swing: 0.15,
  tighten: 0.8,
  leastWay: 0.35,
  cramp: Math.PI / 2,
  gently: 0.55,
  near: 25,
  threat: 90,
  aimed: 0.6,
  closing: 0.8,
  warn: 5,
  miss: 0.75 * SHIP.length,
} as const;

const probe = (c: Ctx, a: number, ahead: number) =>
  open(
    c,
    along(c.own.ship.at, rotate(c.own.ship.at, c.own.ship.heading, a), ahead).p
  );

export function deepest(c: Ctx): number {
  const { at, heading } = c.own.ship;
  let best = 0,
    low = Infinity;
  for (let k = -7; k <= 8; k++) {
    const t = rotate(at, heading, (k * Math.PI) / 8);
    let top = -Infinity,
      end = 0;
    for (let s = 2; s <= c.b.helm.sound; s += 3)
      top = Math.max(top, (end = -c.sea.depth(along(at, t, s).p)));
    const score = top + 0.25 * end;
    if (score < low) [low, best] = [score, (k * Math.PI) / 8];
  }
  return best;
}

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
  const ahead = Math.min(c.b.helm.feel + ship.speed, toD);
  if (
    want &&
    !open(
      c,
      along(ship.at, normalize(add(want, ship.at, -dot(want, ship.at))), ahead)
        .p
    )
  ) {
    const port = probe(c, c.b.helm.side, c.b.helm.feelSide + ship.speed),
      starboard = probe(c, -c.b.helm.side, c.b.helm.feelSide + ship.speed);
    let way = Math.sign(m.avoid);
    if (way === 0 || (way > 0 ? !port && starboard : !starboard && port)) {
      way =
        port !== starboard ? (port ? 1 : -1) : port ? 0 : turn >= 0 ? 1 : -1;
    }
    if (way !== 0) {
      turn = way * (port !== starboard ? c.b.helm.firm : c.b.helm.hard);
      m.avoid = way * c.b.helm.avoid;
    }
  } else if (m.avoid !== 0) {
    if (Math.sign(turn) !== Math.sign(m.avoid))
      turn = Math.sign(m.avoid) * c.b.helm.firm;
    m.avoid =
      m.avoid > 0 ? Math.max(0, m.avoid - dt) : Math.min(0, m.avoid + dt);
  }
  const answered = answer(c, way.foe);
  if (answered !== null) turn = answered;
  const easy =
    way.pace === 'gently' && toD < c.b.helm.near ? c.b.helm.gently : 1;
  const off = Math.abs(course),
    r = toD / (2 * (off > Math.PI / 2 ? 1 : Math.max(0.05, Math.sin(off))));
  const cramped =
    off > c.b.helm.cramp && !probe(c, 0, c.b.helm.feel + ship.speed);
  const tight =
    way.pace === 'ram'
      ? 1
      : cramped
        ? c.b.helm.leastWay
        : Math.max(
            c.b.helm.leastWay,
            Math.min(1, (c.b.helm.tighten * r * SHIP.turn) / SHIP.top)
          );
  const s = stuck(c, dt, course);
  m.was = ship.at;
  return { helm: s.helm ?? order(turn, Math.min(easy, tight)), lost: s.lost };
}

function answer(c: Ctx, foe: number): number | null {
  const { m, own } = c,
    p = own.ship.at,
    mine = velocity(own);
  for (const o of c.others) {
    if (apart(p, o.ship.at, c.b.helm.threat)) continue;
    const d = distance(p, o.ship.at),
      t = toward(p, o.ship.at);
    if (d > c.b.helm.threat || !t) continue;
    const r = scale(t, d),
      rel = add(transport(velocity(o), o.ship.at, p), mine, -1),
      closing = -dot(t, rel);
    if (
      closing < c.b.helm.closing * RAM.least ||
      (d - SHIP.length / 2) / closing > c.b.helm.warn
    )
      continue;
    const back = toward(o.ship.at, p);
    if (!back || dot(o.ship.heading, back) < Math.cos(c.b.helm.aimed)) continue;
    const when = -dot(r, rel) / dot(rel, rel);
    if (length(add(r, rel, when)) > c.b.helm.miss) continue;
    const bearing = offCourse(own.ship, t);
    if (o.id === foe && Math.abs(bearing) < 0.5) continue;
    if (
      unitHash(c.seed, o.id * STRIDE + Math.floor(m.clock / c.b.helm.warn)) >
      0.2 + 0.75 * c.t.helm
    )
      continue;
    return Math.abs(bearing) < Math.PI / 2
      ? bearing
      : bearing - Math.sign(bearing) * Math.PI;
  }
  return null;
}

function sideOf(c: Ctx, want: number, dt: number): number {
  const { m } = c,
    heading = c.own.ship.heading;
  const s = want === m.blocked ? -want : want;
  if (s !== m.side) {
    [m.side, m.head, m.sideT] = [s, heading, 0];
    return s;
  }
  m.sideT += dt;
  if (
    m.sideT >= c.b.helm.budge &&
    dot(m.head, heading) > Math.cos(c.b.helm.swing)
  ) {
    m.blocked = s;
    [m.side, m.head, m.sideT] = [-s, heading, 0];
  }
  return m.side;
}

function stuck(
  c: Ctx,
  dt: number,
  course: number
): { helm: Helm | null; lost: boolean } {
  const { m } = c,
    ship = c.own.ship;
  const order = (turn: number, lost = false) => ({
    helm: { course: turned(ship, turn), throttle: c.b.helm.slow },
    lost,
  });
  const steady = { helm: null, lost: false };
  if (m.backT > 0) {
    m.backT -= dt;
    return order(sideOf(c, m.strafe, dt) * c.b.helm.full);
  }
  const crawling = distance(m.was, ship.at) < c.b.helm.crawl * dt;
  const held =
    crawling &&
    !open(c, along(ship.at, ship.heading, 0.4 * SHIP.length + c.b.helm.bow).p);
  if (held && m.backT > -(c.b.helm.wade + c.b.helm.most)) {
    m.backT -= dt;
    if (m.backT > -c.b.helm.wade) return steady;
    const deep = deepest(c);
    const holding = Math.abs(deep) > Math.PI / 2 && ship.turn * deep < 0;
    const turn = holding
      ? Math.sign(ship.turn) * c.b.helm.full
      : Math.max(-c.b.helm.full, Math.min(c.b.helm.full, 2 * deep));
    const side = sideOf(c, turn >= 0 ? 1 : -1, dt);
    return order(
      side * turn > 0 ? turn : side * c.b.helm.full,
      m.backT + dt > -c.b.helm.wade
    );
  }
  const gaveUp = m.backT <= -(c.b.helm.wade + c.b.helm.most);
  m.backT = 0;
  if (crawling || gaveUp) m.stuckT += gaveUp ? c.b.helm.stuck : dt;
  else {
    m.stuckT = Math.max(0, m.stuckT - 2 * dt);
    [m.side, m.blocked] = [0, 0];
  }
  if (m.stuckT <= c.b.helm.stuck) return steady;
  m.stuckT = 0;
  const reach = c.b.helm.feelSide + ship.speed,
    port = probe(c, 2 * c.b.helm.side, reach),
    starboard = probe(c, -2 * c.b.helm.side, reach);
  m.strafe = port !== starboard ? (port ? 1 : -1) : course >= 0 ? 1 : -1;
  const round =
    m.strafe * course >= 0 ? Math.abs(course) : 2 * Math.PI - Math.abs(course);
  m.backT = Math.min(
    c.b.helm.most,
    Math.max(
      between(m, c.b.helm.least, c.b.helm.least * 2.2),
      (round - Math.PI + c.b.helm.slack) / c.b.helm.rate
    )
  );
  return order(m.strafe * c.b.helm.full, true);
}

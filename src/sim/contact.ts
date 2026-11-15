// Ships meeting: hull against hull, and the rams among them. One fixed step of a whole fleet, each ship under her own
// helm (ship.ts), then kept off every other.
//
// Her hull, for meeting another's, is a capsule along her keel: as wide as her beam and as long as her length, its ends
// rounded by half her beam, so her stem is a blunt half-circle and her sides straight. Where two meet is found on a
// flat chart about the point between them (a few millimetres off the sphere at these sizes; the hulls are held a
// centimetre apart, RAM.skin, which covers it).
//
// Two that meet closing get one blow between them, as two rigid hulls do: equal of mass ahead, but each far heavier to
// shove broadside (the water she must shoulder aside with her), and turning as a plank turns. They part at a fifth of
// the speed they met at, and their sides grip only lightly as they slide, so a glancing blow scrapes along her and
// goes on. What the blow does to her way ahead goes into her speed; what it does across her, or to her astern, is a
// shove that carries her on and dies away in the water; what it does to her turn, into her turn, which her rudder
// takes back. Then wherever they still overlap they are pushed apart, each by as much as she gives (one shoved
// broadside moves the less), over a few passes for a pile of them. A push that would set her on the shallows (shoal.ts)
// is not made, and the other takes all of it; so one pressed against the shore stands, and the ship pressing her is
// held off. If any still overlap after that, they are put back where they began the step, all way off: as she does
// on the shallows, she stays put rather than go through. So hulls that begin clear of each other stay clear.
//
// A blow closing faster than RAM.least is a ram: its damage grows with the closing, each ship takes a share of it by
// how little of the closing was her own doing (0117's rule) and by where it landed on her, her bow taking it best and
// her side worst. A pair that has rammed may not ram again until they have drawn RAM.rearm metres clear: one ram, one
// blow, however long the rammer then presses on.
//
// Every pair is looked at, a few dot products each until two lie within a ship's length: 496 pairs for 32 ships. Pairs
// are taken in order of the ships' ids, so it makes no difference in which order the fleet is listed.
//
// Pure arithmetic: no three, so it runs in node for the tests; deterministic for the same inputs.

import { R, add, dot, frameAt, length, normalize, scale, transport, type Vec3 } from '../world/sphere.ts';
import { SPEC, type Handling } from './fit.ts';
import { RAM, SHIP } from './handling.ts';
import { step, type Helm, type ShipState } from './ship.ts';
import { clearance, hullAt, moved, type Depth } from './shoal.ts';

/** A ship in a fleet: who she is (an id no other in the fleet has), how she sails, the shove she is carried on by (m/s,
 * a tangent at her place), the ships she has rammed or been rammed by and not yet drawn clear of, and her own handling
 * (fit.ts). */
export interface Vessel {
  id: number;
  ship: ShipState;
  shove: Vec3;
  engaged: readonly number[];
  fit: Handling;
}

/** Where a blow lands on her. */
export type Part = 'bow' | 'side' | 'stern';

/** One ship's side of a ram: who she is, where it landed on her, and the hit points it took off her. */
export interface Hit {
  id: number;
  part: Part;
  damage: number;
}

/** A ram: the ship that drove it home (the more of the closing hers) and the one she struck, how fast they closed
 * where they met (m/s), and where that was (a unit vector). */
export interface Blow {
  striker: Hit;
  struck: Hit;
  closing: number;
  at: Vec3;
}

/** A ship in a fleet, under no shove and engaged with none, by her own handling (the tables' if not given). */
export const afloat = (id: number, ship: ShipState, fit: Handling = SPEC): Vessel => ({ id, ship, shove: [0, 0, 0], engaged: [], fit });

/** Her hull's half-width, and how far ahead and astern of amidships its rounded ends are centred. */
export const RADIUS = SHIP.beam / 2;
export const KEEL = SHIP.length / 2 - RADIUS;
/** Passes of pushing apart, for a pile. */
const PASSES = 8;

type P = readonly [number, number];
const sub = (a: P, b: P): P => [a[0] - b[0], a[1] - b[1]];
const dot2 = (a: P, b: P) => a[0] * b[0] + a[1] * b[1];
/** a × b, up: positive turning a toward b anticlockwise seen from above. */
const cross2 = (a: P, b: P) => a[0] * b[1] - a[1] * b[0];
const along2 = (a: P, b: P, k: number): P => [a[0] + b[0] * k, a[1] + b[1] * k];
const scale2 = (a: P, k: number): P => [a[0] * k, a[1] * k];
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

/** The points nearest each other on the segments p0–p1 and q0–q1, as shares of the way along each. Lying parallel and
 * overlapping, the middle of the overlap, so a hull alongside is met at the middle of where she lies alongside. */
function nearest(p0: P, p1: P, q0: P, q1: P): [s: number, t: number] {
  const d1 = sub(p1, p0), d2 = sub(q1, q0), r = sub(p0, q0);
  const a = dot2(d1, d1), e = dot2(d2, d2), b = dot2(d1, d2), c = dot2(d1, r), f = dot2(d2, r);
  const denom = a * e - b * b;
  let s: number;
  if (denom > 1e-9 * a * e) s = clamp01((b * f - c * e) / denom);
  else {
    const u0 = clamp01(-c / a), u1 = clamp01((b - c) / a);
    s = (u0 + u1) / 2;
  }
  let t = (b * s + f) / e;
  if (t < 0) [t, s] = [0, clamp01(-c / a)];
  else if (t > 1) [t, s] = [1, clamp01((b - c) / a)];
  return [s, t];
}

/** One ship as the chart about a meeting sees her: amidships, the way her bow points, and her keel, stern to stem. */
interface Laid { centre: P; ahead: P; stern: P; stem: P }

/** Two hulls on a chart about the point between them: how far apart (m, negative overlapping), the way from the first
 * to the second where they are nearest, and the point midway there; with the chart's axes and centre. */
interface Meeting {
  gap: number;
  n: P;
  c: P;
  a: Laid;
  b: Laid;
  east: Vec3;
  north: Vec3;
  middle: Vec3;
}

/** How a and b lie toward each other, or null if they lie too far apart to matter. */
function meet(a: ShipState, b: ShipState): Meeting | null {
  const dx = a.at[0] - b.at[0], dy = a.at[1] - b.at[1], dz = a.at[2] - b.at[2];
  const reach = SHIP.length + RAM.rearm + 1;
  if ((dx * dx + dy * dy + dz * dz) * R * R > reach * reach) return null;
  const middle = normalize(add(a.at, b.at));
  const { east, north } = frameAt(middle);
  const flat = (p: Vec3): P => [R * dot(p, east), R * dot(p, north)];
  const lay = (s: ShipState): Laid => {
    const x = dot(s.heading, east), y = dot(s.heading, north), l = Math.hypot(x, y);
    return { centre: flat(s.at), ahead: [x / l, y / l], stern: flat(hullAt(s.at, s.heading, [-KEEL, 0])), stem: flat(hullAt(s.at, s.heading, [KEEL, 0])) };
  };
  const la = lay(a), lb = lay(b);
  const [s, t] = nearest(la.stern, la.stem, lb.stern, lb.stem);
  const p = along2(la.stern, sub(la.stem, la.stern), s), q = along2(lb.stern, sub(lb.stem, lb.stern), t);
  const d = sub(q, p), apart = Math.hypot(d[0], d[1]);
  let n: P;
  if (apart > 1e-9) n = [d[0] / apart, d[1] / apart];
  else {
    // keel across keel: the way between them amidships, or, one right over the other, to the first's starboard
    const m = sub(lb.centre, la.centre), l = Math.hypot(m[0], m[1]);
    n = l > 1e-9 ? [m[0] / l, m[1] / l] : [la.ahead[1], -la.ahead[0]];
  }
  return { gap: apart - 2 * RADIUS, n, c: [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2], a: la, b: lb, east, north, middle };
}

/** Metres of open water between two hulls where they are nearest, negative where they overlap; Infinity far apart. */
export const gap = (a: ShipState, b: ShipState) => meet(a, b)?.gap ?? Infinity;

/** How much a push along u (a unit vector on the chart) moves her, against a push along her keel: 1 along it, 1/sway
 * square across it. */
const yields = (l: Laid, u: P) => {
  const ahead = dot2(l.ahead, u), across = cross2(l.ahead, u);
  return ahead * ahead + (across * across) / RAM.sway;
};

/** Her velocity on the chart change by an impulse J there (per unit of her mass ahead). */
const given = (l: Laid, j: P): P => {
  const ahead = dot2(l.ahead, j), across = cross2(l.ahead, j) / RAM.sway;
  return [l.ahead[0] * ahead - l.ahead[1] * across, l.ahead[1] * ahead + l.ahead[0] * across];
};

/** Where a blow meets her, by the way it comes at her (a unit vector on the chart, from her hull outward). */
function part(l: Laid, out: P): Part {
  const c = dot2(out, l.ahead), stem = Math.cos(RAM.stem);
  return c > stem ? 'bow' : c < -stem ? 'stern' : 'side';
}

/** A ship as the step works on her. */
interface Working { id: number; ship: ShipState; shove: Vec3; engaged: number[]; jolt: Vec3; fit: Handling }

/** Her way through the water and her shove together, on the chart, and at a point of her (r from amidships). */
function velocity(w: Working, m: Meeting, r: P): P {
  const v = add(scale(w.ship.heading, w.ship.speed), w.shove);
  return [dot(v, m.east) - w.ship.turn * r[1], dot(v, m.north) + w.ship.turn * r[0]];
}

/** A change of velocity dv (on the chart) and of turn given to her: what is along her keel to her speed, the rest to her
 * shove; never astern through the water. */
function jolted(w: Working, m: Meeting, dv: P, turn: number): void {
  let d = add(scale(m.east, dv[0]), m.north, dv[1]);
  d = add(d, w.ship.at, -dot(d, w.ship.at));
  const ahead = dot(d, w.ship.heading);
  let speed = w.ship.speed + ahead, rest = add(d, w.ship.heading, -ahead);
  if (speed < 0) [rest, speed] = [add(rest, w.ship.heading, speed), 0];
  w.ship = { ...w.ship, speed, turn: w.ship.turn + turn };
  w.shove = add(w.shove, rest);
  w.jolt = add(w.jolt, d);
}

/** The blow between a and b, met as `m`, if they are closing: their velocities changed, and the ram it was, if any. */
function strike(a: Working, b: Working, m: Meeting): Blow | null {
  const ra = sub(m.c, m.a.centre), rb = sub(m.c, m.b.centre);
  const va = velocity(a, m, ra), vb = velocity(b, m, rb);
  const rel = sub(vb, va), closing = -dot2(rel, m.n);
  if (!(closing > 0)) return null;
  const k2 = RAM.gyration * RAM.gyration;
  const heft = (u: P) => yields(m.a, u) + yields(m.b, u) + cross2(ra, u) ** 2 / k2 + cross2(rb, u) ** 2 / k2;
  const jn = ((1 + RAM.bounce) * closing) / heft(m.n);
  // the grip along their sides, against their sliding, no more than it takes to stop it
  const slide = along2(rel, m.n, closing), sliding = Math.hypot(slide[0], slide[1]);
  let j: P = scale2(m.n, jn);
  if (sliding > 1e-9) {
    const t: P = [slide[0] / sliding, slide[1] / sliding];
    j = along2(j, t, -Math.min(RAM.grip * jn, sliding / heft(t)));
  }
  jolted(a, m, scale2(given(m.a, j), -1), -cross2(ra, j) / k2);
  jolted(b, m, given(m.b, j), cross2(rb, j) / k2);
  if (closing <= RAM.least || a.engaged.includes(b.id)) return null;
  // a ram: shared by how little of the closing was each one's own, and by where on her it landed
  a.engaged.push(b.id);
  b.engaged.push(a.id);
  const fa = Math.max(0, dot2(va, m.n)), fb = Math.max(0, -dot2(vb, m.n)), sum = fa + fb;
  const share = sum > 1e-9 ? fa / sum : 0.5;
  const whole = RAM.damage * (closing - RAM.past);
  const hit = (w: Working, l: Laid, out: P, theirs: number): Hit => {
    const where = part(l, out);
    return { id: w.id, part: where, damage: Math.min(RAM.most, whole * (RAM.bear + (1 - RAM.bear) * theirs) * RAM[where]) };
  };
  const ha = hit(a, m.a, m.n, 1 - share), hb = hit(b, m.b, scale2(m.n, -1), share);
  const at = normalize(add(m.middle, add(scale(m.east, m.c[0]), m.north, m.c[1]), 1 / R));
  return fa >= fb ? { striker: ha, struck: hb, closing, at } : { striker: hb, struck: ha, closing, at };
}

/** The place `metres` along u (a unit vector on the chart) takes her, or null if it would set her on the shallows. */
function pushed(s: ShipState, m: Meeting, u: P, metres: number, depth: Depth): ShipState | null {
  if (metres === 0) return s;
  let d = add(scale(m.east, u[0]), m.north, u[1]);
  d = normalize(add(d, s.at, -dot(d, s.at)));
  const to = moved(s.at, s.heading, scale(d, metres));
  const c = clearance(to.at, to.heading, depth).least;
  return c >= 0 || c >= clearance(s.at, s.heading, depth).least ? { ...s, ...to } : null;
}

/** a and b pushed apart along the way between them, each by as much as she gives, unless the shallows hold her, when
 * the other is pushed the whole way. */
function heldApart(a: Working, b: Working, m: Meeting, depth: Depth): void {
  const want = RAM.skin - m.gap;
  const wa = yields(m.a, m.n), wb = yields(m.b, m.n);
  const sa = pushed(a.ship, m, m.n, -want * (wa / (wa + wb)), depth);
  const sb = pushed(b.ship, m, m.n, want * (wb / (wa + wb)), depth);
  if (sa && sb) [a.ship, b.ship] = [sa, sb];
  else if (sb) {
    const all = pushed(b.ship, m, m.n, want, depth);
    if (all) b.ship = all;
  } else if (sa) {
    const all = pushed(a.ship, m, m.n, -want, depth);
    if (all) a.ship = all;
  }
}

/** Her own step under her helm, then on along her shove, as far as the shallows let her; the shove dying away. */
function sailed(v: Vessel, helm: Helm, dt: number, depth: Depth): Working {
  let ship = step(v.ship, helm, dt, depth, v.fit);
  let shove = transport(v.shove, v.ship.at, ship.at);
  const metres = length(shove) * dt;
  if (metres > 0) {
    const to = moved(ship.at, ship.heading, scale(shove, dt));
    const c = clearance(to.at, to.heading, depth).least;
    if (c >= 0 || c >= clearance(ship.at, ship.heading, depth).least) {
      shove = transport(shove, ship.at, to.at);
      ship = { ...ship, ...to };
    } else shove = [0, 0, 0];
  }
  shove = scale(shove, Math.exp(-RAM.ease * dt));
  if (length(shove) < RAM.still) shove = [0, 0, 0];
  return { id: v.id, ship, shove, engaged: [...v.engaged], jolt: [0, 0, 0], fit: v.fit };
}

/**
 * One step of dt seconds for a fleet, each ship under her own helm (helms[i] for fleet[i]), in water `depth` deep;
 * the fleet after it (in the same order), the rams there were, and the change of velocity each ship's meetings gave
 * her (m/s, a tangent at her place), for her ride to show.
 */
export function stepFleet(fleet: readonly Vessel[], helms: readonly Helm[], dt: number, depth: Depth): { fleet: Vessel[]; blows: Blow[]; jolts: Vec3[] } {
  const order = fleet.map((_, i) => i).sort((i, j) => fleet[i].id - fleet[j].id);
  const ws = order.map((i) => sailed(fleet[i], helms[i], dt, depth));
  const pairs = (each: (a: Working, b: Working) => void) => {
    for (let i = 0; i < ws.length; i++) for (let j = i + 1; j < ws.length; j++) each(ws[i], ws[j]);
  };
  // the blows between hulls that meet
  const blows: Blow[] = [];
  pairs((a, b) => {
    const m = meet(a.ship, b.ship);
    const blow = m && m.gap < RAM.skin ? strike(a, b, m) : null;
    if (blow) blows.push(blow);
  });
  // pushed apart wherever they overlap
  for (let pass = 0, again = true; pass < PASSES && again; pass++) {
    again = false;
    pairs((a, b) => {
      const m = meet(a.ship, b.ship);
      if (!m || m.gap >= 0) return;
      heldApart(a, b, m, depth);
      again = true;
    });
  }
  // any still overlapping are put back where they were, all way off, and so any they then overlap
  const was = new Map(fleet.map((v) => [v.id, v]));
  const back = new Set<number>();
  for (let again = true; again;) {
    again = false;
    pairs((a, b) => {
      if ((back.has(a.id) && back.has(b.id)) || gap(a.ship, b.ship) >= 0) return;
      for (const w of [a, b]) if (!back.has(w.id)) {
        back.add(w.id);
        w.ship = { ...was.get(w.id)!.ship, speed: 0, turn: 0 };
        w.shove = [0, 0, 0];
        again = true;
      }
    });
  }
  // a pair drawn far enough clear may ram again
  const byId = new Map(ws.map((w) => [w.id, w]));
  for (const w of ws) w.engaged = w.engaged.filter((id) => byId.has(id) && gap(w.ship, byId.get(id)!.ship) <= RAM.rearm);
  const result = fleet.map((v) => byId.get(v.id)!);
  return {
    fleet: result.map(({ id, ship, shove, engaged, fit }) => ({ id, ship, shove, engaged, fit })),
    blows,
    jolts: result.map((w) => w.jolt),
  };
}

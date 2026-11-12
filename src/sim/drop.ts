// The drop (0117 src/sim/opening.ts, its numbers kept: the planet is the same 554 m): the Gale, a high wind, carries
// the whole fleet over the planet along a great circle, each ship on her own seat in its ranks. Each captain leaves
// it when she chooses (the player by DIVE; a bot when the Gale passes nearest the water she picked) and glides down,
// steering as she goes, stooping faster once near her mark; close to the water over land she is carried out to open
// water, and she touches down on it with a little way on, and sails from there.
//
// One change from 0117: the fleet is kept well apart. The Gale's seats are 46 m apart where they were 9 (a hull is 26
// m long), and no ship comes within APART metres of another in the air or as she touches down: one that would is
// eased off along the surface, and a landing is moved to the nearest open water clear of the ships already sailing.
//
// Pure and deterministic: a drop is a value, stepped by the orders given; a bot's orders are worked out from it alone.

import { random } from '../world/random.ts';
import { R, add, along, cross, distance, dot, frameAt, normalize, scale, type Vec3 } from '../world/sphere.ts';
import { SHIP } from './handling.ts';
import type { Depth } from './shoal.ts';
import type { Cap } from './storm.ts';

export const GALE = {
  /** The Gale's height over the sea, metres, how long it carries the fleet, s, and the arc it covers, radians. */
  height: 350, time: 35, arc: Math.PI,
  /** Gliding: speed along, m/s, and falling; and the stoop, slower along and falling faster. Turning, rad/s at full
   *  helm, which is half a radian off her course. */
  glide: 32, fall: 10, slow: 12, stoop: 35, turn: 1.5, helm: 0.5,
  /** Below this height over land she is carried out to open water; her way as she touches down, m/s. */
  steer: 40, land: 10,
  /** Seconds into the Gale before she may leave it: it takes her up first (0117 screens/gale.ts DIVE_ALLOWED). */
  allowed: 2.8,
  /** The seats: lanes across the course, `lanes` of them, and ranks behind its head, metres apart (0117: 9 and 9). */
  lane: 46, rank: 46, lanes: 5,
  /** No two ships closer than this, metres, in the air or touching down (new). */
  apart: 40,
  /** Open water: this deep past her draught at her middle and all round her, `round` metres out. */
  open: 0.3, round: 14,
  /** Marked water: she stoops onto it from within this many metres (0117 session.ts PICK.drop). */
  pick: 120,
} as const;

/** The bots' choice of where to come down (0117 captains/brain.ts chooseRegion and galeHelm). */
export const PICKING = {
  /** Within the first safe cap by this much, metres; this far off an island's middle, metres. */
  inside: 120, near: 60, far: 180,
  /** No island takes more than this share of the picks. */
  share: 0.25,
  /** Leaving: hold on while `most` ships that have already left are within `crowd` metres; everyone still aboard takes
   *  turns `gap` seconds apart before it blows out. Stoop within `stoop` of the glide's reach. */
  most: 3, crowd: 100, gap: 2.5, stoop: 0.35,
} as const;

/** The Gale's speed along its course, m/s (50). */
export const GALE_SPEED = (GALE.arc * R) / GALE.time;

/** The Gale's course: where it starts (a unit vector) and the way it blows there. */
export interface Gale { from: Vec3; dir: Vec3 }

export type Stage = 'gale' | 'glide' | 'sea';

/** A ship in the drop: her seat on the Gale, where she is (a unit vector) and heads, her height over the sea, her
 *  speed along and her rate of climb (m/s; falling, negative). */
export interface Flyer { id: number; seat: number; stage: Stage; at: Vec3; heading: Vec3; height: number; speed: number; climb: number }

/** Where a bot means to come down, and whether she has made up her mind to leave the Gale. */
export interface Plan { drop: Vec3; bound: boolean }

/** A drop: its Gale, the seconds it has blown, every ship in it (in order of id), and each bot's plan by id. */
export interface Drop { gale: Gale; t: number; flyers: readonly Flyer[]; plans: ReadonlyMap<number, Plan> }

/** A ship's orders in the drop: leave the Gale; the course she wants in the glide (a tangent; none, hold on); stoop. */
export interface Leap { leave: boolean; course: Vec3 | null; stoop: boolean }

export const HOLD: Leap = { leave: false, course: null, stoop: false };

/** A tangent at u, `bearing` radians from north (or, at a pole, from a fixed way). */
function tangentAt(u: Vec3, bearing: number): Vec3 {
  const { north, east } = frameAt(u);
  return add(scale(north, Math.cos(bearing)), east, Math.sin(bearing));
}

/** The tangent at p toward q along the great circle. */
const toward = (p: Vec3, q: Vec3): Vec3 => {
  const t = add(q, p, -dot(q, p));
  const l = Math.hypot(...t);
  return l > 1e-12 ? scale(t, 1 / l) : tangentAt(p, 0);
};

/** The angle from tangent a to tangent b at p, to port positive. */
const angleTo = (a: Vec3, b: Vec3, p: Vec3) => Math.atan2(dot(cross(a, b), p), dot(a, b));

/** a turned `angle` radians to port about p. */
const turned = (a: Vec3, p: Vec3, angle: number): Vec3 => normalize(add(scale(a, Math.cos(angle)), cross(p, a), Math.sin(angle)));

/** a kept along the surface at p. */
const level = (a: Vec3, p: Vec3): Vec3 => normalize(add(a, p, -dot(a, p)));

/** The match's Gale, from its seed. */
export function planGale(seed: number): Gale {
  const rand = random(seed * 69069 + 11);
  const z = 2 * rand() - 1, a = 2 * Math.PI * rand(), s = Math.sqrt(1 - z * z);
  const from: Vec3 = [s * Math.cos(a), z, s * Math.sin(a)];
  return { from, dir: tangentAt(from, 2 * Math.PI * rand()) };
}

/** Metres from the course's start its head has come at `t` seconds. */
const carried = (t: number) => GALE_SPEED * Math.min(Math.max(t, 0), GALE.time);

/** Where the Gale's head is at `t`, and the way it blows there. */
export function galeAt(g: Gale, t: number): { at: Vec3; heading: Vec3 } {
  const { p, t: heading } = along(g.from, g.dir, carried(t));
  return { at: p, heading };
}

/** How many ranks a fleet of n rides in. */
const ranks = (n: number) => Math.ceil(n / GALE.lanes);

/** The fleet's middle on the Gale at `t` (n ships), and the way on there: what the camera rides behind. */
export function fleetAt(g: Gale, t: number, n: number): { at: Vec3; heading: Vec3 } {
  const { p, t: heading } = along(g.from, g.dir, carried(t) - ((ranks(n) - 1) / 2) * GALE.rank);
  return { at: p, heading };
}

/** Ship `seat`'s place on the Gale at `t`: her lane across it, her rank behind its head. */
export function seatAt(g: Gale, seat: number, t: number): { at: Vec3; heading: Vec3 } {
  const lane = ((seat % GALE.lanes) - (GALE.lanes - 1) / 2) * GALE.lane, rank = -Math.floor(seat / GALE.lanes) * GALE.rank;
  const head = along(g.from, g.dir, carried(t) + rank);
  const side = along(head.p, cross(head.p, head.t), lane);
  return { at: side.p, heading: level(head.t, side.p) };
}

/** The Gale's course as `n` + 1 points, start to end, for the chart. */
export const course = (g: Gale, n = 72): Vec3[] =>
  Array.from({ length: n + 1 }, (_, k) => along(g.from, g.dir, (GALE.arc * R * k) / n).p);

/** Whether a ship lying at p (a unit vector) has open water under her and all round her. */
export function openAt(p: Vec3, depth: Depth): boolean {
  const need = SHIP.draught + GALE.open;
  if (depth(p) < need) return false;
  for (let k = 0; k < 8; k++) if (depth(along(p, tangentAt(p, (k * Math.PI) / 4), GALE.round).p) < need) return false;
  return true;
}

/** The nearest open water to p, within `reach` metres, clear by APART of every ship at `taken`; null if there is none. */
export function berth(p: Vec3, depth: Depth, taken: readonly Vec3[], reach: number): Vec3 | null {
  const clear = (q: Vec3) => taken.every((o) => distance(o, q) >= GALE.apart);
  if (openAt(p, depth) && clear(p)) return p;
  for (let r = 6; r <= reach; r += 6) {
    const n = Math.max(8, Math.round((2 * Math.PI * r) / 8));
    for (let k = 0; k < n; k++) {
      const q = along(p, tangentAt(p, (2 * Math.PI * k) / n), r).p;
      if (openAt(q, depth) && clear(q)) return q;
    }
  }
  return null;
}

/**
 * A new drop: every ship (ids, the player's among them) seated on the Gale in order, the bots (`bots`, ids) with
 * where each means to come down. sites: the islands' middles; first: the safe cap the storm first closes to.
 */
export function startDrop(seed: number, ids: readonly number[], bots: readonly number[], sites: readonly Vec3[], first: Cap, depth: Depth): Drop {
  const gale = planGale(seed);
  const flyers = ids.map((id, seat): Flyer => {
    const s = seatAt(gale, seat, 0);
    return { id, seat, stage: 'gale', at: s.at, heading: s.heading, height: GALE.height, speed: GALE_SPEED, climb: 0 };
  });
  return { gale, t: 0, flyers, plans: choosePlans(seed, bots, sites, first, depth) };
}

/**
 * Where each bot means to come down (0117 chooseRegion): an island whose middle lies well inside the first safe cap,
 * none taking more than a quarter of the picks (a full one sends her to the least picked inside it), and a point
 * 60–180 m off its middle, moved to the nearest open water.
 */
export function choosePlans(seed: number, bots: readonly number[], sites: readonly Vec3[], first: Cap, depth: Depth): Map<number, Plan> {
  const rand = random(seed * 16807 + 5), plans = new Map<number, Plan>();
  const inFirst = (s: Vec3) => distance(s, first.centre) <= first.radius * R - PICKING.inside;
  const picks = sites.map(() => 0), most = Math.max(1, Math.floor(bots.length * PICKING.share));
  for (const id of bots) {
    let drop: Vec3;
    if (sites.length === 0) drop = normalize(add(first.centre, tangentAt(first.centre, 2 * Math.PI * rand()), 0.3 * rand()));
    else {
      let r = Math.floor(rand() * sites.length);
      for (let k = 0; k < 4 && !inFirst(sites[r]); k++) r = Math.floor(rand() * sites.length);
      if (picks[r] >= most) {
        const from = Math.floor(rand() * sites.length);
        let best = -1;
        for (let k = 0; k < sites.length; k++) {
          const q = (from + k) % sites.length;
          if (best < 0 || (inFirst(sites[q]) && !inFirst(sites[best])) || (inFirst(sites[q]) === inFirst(sites[best]) && picks[q] < picks[best])) best = q;
        }
        r = best;
      }
      picks[r]++;
      drop = along(sites[r], tangentAt(sites[r], 2 * Math.PI * rand()), PICKING.near + (PICKING.far - PICKING.near) * rand()).p;
    }
    plans.set(id, { drop: berth(drop, depth, [], 60) ?? drop, bound: false });
  }
  return plans;
}

/** The glide's reach from a height: how far along she comes down, metres. */
const reach = (height: number) => (GALE.glide * height) / GALE.fall;

/** Ships that have left the Gale, or are leaving it this step (`going`), within PICKING.crowd metres of `f`. */
const crowd = (d: Drop, f: Flyer, going: ReadonlySet<number>) =>
  d.flyers.filter((o) => o.id !== f.id && (o.stage !== 'gale' || going.has(o.id)) && distance(o.at, f.at) < PICKING.crowd).length;

/** Bots still aboard and not yet bound whose mark the Gale is still closing on as it blows out: they take turns
 *  leaving before the end. */
const lateRiders = (d: Drop) => d.flyers.filter((o) => {
  const p = d.plans.get(o.id);
  if (!p || o.stage !== 'gale' || p.bound) return false;
  return distance(seatAt(d.gale, o.seat, GALE.time).at, p.drop) < distance(seatAt(d.gale, o.seat, GALE.time - 1).at, p.drop);
}).length;

/**
 * Every bot's orders this step, in order of seat, and the drop with their plans after them (0117 galeHelm and the
 * glide's helm). On the Gale a bot makes up her mind to leave as it passes nearest her mark while that is within her
 * glide's reach, or as it is about to blow out, and then leaves once fewer than PICKING.most ships that have left (or
 * are leaving before her this step) crowd her; gliding, she steers for her mark and stoops once near it.
 */
export function botLeaps(d: Drop): { drop: Drop; leaps: Map<number, Leap> } {
  const leaps = new Map<number, Leap>(), plans = new Map(d.plans), going = new Set<number>(), late = lateRiders(d);
  for (const f of d.flyers) {
    const plan = d.plans.get(f.id);
    if (!plan) continue;
    if (f.stage === 'gale') {
      const now = distance(f.at, plan.drop), soon = distance(seatAt(d.gale, f.seat, d.t + 1).at, plan.drop);
      const bound = plan.bound || (soon > now && now < reach(GALE.height) * 0.9) || now < GALE_SPEED * 2 || d.t > GALE.time - PICKING.gap * late;
      const leave = d.t >= GALE.allowed && bound && crowd(d, f, going) < PICKING.most;
      if (leave) going.add(f.id);
      plans.set(f.id, { ...plan, bound });
      leaps.set(f.id, { ...HOLD, leave });
    } else leaps.set(f.id, { leave: false, course: toward(f.at, plan.drop), stoop: distance(f.at, plan.drop) < reach(f.height) * PICKING.stoop });
  }
  return { drop: { ...d, plans }, leaps };
}

/** Her orders gliding for a mark she has set (0117 session.ts toward): steer for it, and stoop onto it from close. */
export const markLeap = (f: Flyer, mark: Vec3): Leap => ({ leave: false, course: toward(f.at, mark), stoop: distance(f.at, mark) < GALE.pick });

/** Leaving the Gale: starting down. */
const leave = (f: Flyer): Flyer => ({ ...f, stage: 'glide', speed: GALE.glide, climb: -GALE.fall });

/**
 * One step of dt seconds: the Gale blows on and carries those still on it (throwing everyone off as it blows out),
 * the gliders steer, glide or stoop and come down, kept APART from every other ship and from `sea` (where the ships
 * already sailing are); a ship reaching the water touches down on open water. The drop after it, and the ships that
 * touched down this step (stage 'sea'), which leave it.
 */
export function stepDrop(d: Drop, leaps: ReadonlyMap<number, Leap>, dt: number, depth: Depth, sea: readonly Vec3[]): { drop: Drop; landed: Flyer[] } {
  const t = d.t + dt, done = t >= GALE.time;
  const plans = new Map(d.plans);
  let flyers = d.flyers.map((f): Flyer => {
    const leap = leaps.get(f.id) ?? HOLD;
    if (f.stage === 'gale') {
      const s = seatAt(d.gale, f.seat, t), riding = { ...f, at: s.at, heading: s.heading };
      return (leap.leave && d.t >= GALE.allowed) || done ? leave(riding) : riding;
    }
    // gliding: the helm, the glide or the stoop, and out to open water low over land
    const off = leap.course ? angleTo(f.heading, level(leap.course, f.at), f.at) : 0;
    let heading = turned(f.heading, f.at, Math.max(-1, Math.min(1, off / GALE.helm)) * GALE.turn * dt);
    const speed = f.speed + ((leap.stoop ? GALE.slow : GALE.glide) - f.speed) * Math.min(1, dt * 2);
    const climb = f.climb + (-(leap.stoop ? GALE.stoop : GALE.fall) - f.climb) * Math.min(1, dt * 3);
    if (f.height < GALE.steer && !openAt(f.at, depth)) {
      const out = berth(f.at, depth, [], 30);
      if (out) heading = level(add(heading, add(toward(f.at, out), heading, -1), Math.min(1, dt * 4)), f.at);
    }
    const moved = along(f.at, heading, speed * dt);
    return { ...f, at: moved.p, heading: moved.t, speed, climb, height: f.height + climb * dt };
  });
  flyers = apart(flyers, sea);
  // touching down: on open water clear of the ships sailing and those touching down before her
  const landed: Flyer[] = [], afloat = [...sea];
  flyers = flyers.map((f) => {
    if (f.stage !== 'glide' || f.height > 0) return f;
    const at = berth(f.at, depth, afloat, 90) ?? berth(f.at, depth, [], 90) ?? f.at;
    const down: Flyer = { ...f, stage: 'sea', at, heading: level(f.heading, at), height: 0, speed: GALE.land, climb: 0 };
    afloat.push(at);
    landed.push(down);
    plans.delete(f.id);
    return down;
  }).filter((f) => f.stage !== 'sea');
  return { drop: { gale: d.gale, t, flyers, plans }, landed };
}


/** Metres between two ships in the drop, in the air or on the sea. */
const gap = (a: { at: Vec3; height: number }, b: { at: Vec3; height: number }) => {
  const p = scale(a.at, R + a.height), q = scale(b.at, R + b.height);
  return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
};

/**
 * Eases gliders apart: each pair closer than APART (one of them gliding) is pushed apart along the surface, the
 * glider taking it all against a ship on the Gale or on the sea. Twice over, so a crowd settles.
 */
function apart(flyers: readonly Flyer[], sea: readonly Vec3[]): Flyer[] {
  const out = flyers.map((f) => ({ ...f }));
  const fixed = sea.map((at) => ({ at, height: 0 }));
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 0; i < out.length; i++) {
      const a = out[i];
      if (a.stage !== 'glide') continue;
      const push = (from: { at: Vec3; height: number }, share: number, other?: Flyer) => {
        const g = gap(a, from);
        if (g >= GALE.apart) return;
        // the way apart along the surface (any way, if one is right over the other)
        const flat = add(a.at, from.at, -1), side = add(flat, a.at, -dot(flat, a.at));
        const way = Math.hypot(...side) > 1e-9 ? normalize(side) : a.heading;
        // what it takes along the surface to open the gap to APART, given the heights between them
        const rise = a.height - from.height, need = Math.sqrt(Math.max(0, GALE.apart ** 2 - rise * rise));
        const by = Math.max(0, need - distance(a.at, from.at)) + 0.01;
        a.at = along(a.at, way, by * share).p;
        a.heading = level(a.heading, a.at);
        if (other) {
          other.at = along(other.at, scale(way, -1), by * (1 - share)).p;
          other.heading = level(other.heading, other.at);
        }
      };
      for (let j = 0; j < out.length; j++) {
        if (j === i) continue;
        const b = out[j];
        if (b.stage === 'glide') { if (j > i) push(b, 0.5, b); } else push(b, 1);
      }
      for (const s of fixed) push(s, 1);
    }
  }
  return out;
}

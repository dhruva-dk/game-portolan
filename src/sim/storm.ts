// The storm: the battle royale's closing circle. The safe water is a cap of the sphere (a centre and an angular
// radius) that covers the whole planet at the start and, phase by phase, holds and then closes toward the next cap,
// each wholly inside the last, down to a final cap small enough that the last ships must meet in it. Outside the cap
// the storm wears at a ship, harder each phase.
//
// The caps are planned once from the match's seed and the sea floor (a final centre over open water, then each wider
// cap round the one inside it, every centre over water), and the storm at any moment is a function of the match's
// clock alone: no state to carry, the same for every player at the same second.
//
// Tuning is the old game's (game-portolan-0117, sim/tables.ts STORM: seven phases of wait then shrink, damage
// rising 1 → 12 of a 100-point hull a second), on the same 554 m planet, but started from the whole planet in place of
// half of it and quickened to a match of about seven and a half minutes (its was thirteen). It holds for any fleet
// from 20 to 100 (SHIPS is 80): whole matches of bots, armed or not, ran 6.5–7.5 minutes, no more than five ships
// outside the cap as each phase began, the storm sinking a few at most.
//
// Pure arithmetic: no three, so it runs in node for the tests.

import { R, add, along, cross, dot, normalize, scale, type Vec3 } from '../world/sphere.ts';
import { random } from '../world/random.ts';
import type { Depth } from './shoal.ts';

/** One phase: it holds for `wait` seconds, then closes over `close` seconds to a cap of `radius` metres (along the
 * surface); while it runs, a ship outside the cap loses `damage` of a full hull a second. */
export interface Phase { wait: number; close: number; radius: number; damage: number }

export const STORM = {
  /**
   * The phases in order. The first cap is the whole planet (π·R, 1740 m), so the first wait is only a warning: it
   * shows where the storm is headed. The first close is the long one (the far side of the planet is 940 m outside
   * its next cap: 70 s at a ship's best 13.5 m/s, 134 at an ordinary 7); after it the edge moves at 3–7 m/s, a
   * ship's easy pace, as the old game's did. The last cap, 25 m, holds two or three ships' lengths: a fight.
   */
  phases: [
    { wait: 60, close: 70, radius: 800, damage: 0.01 },
    { wait: 45, close: 40, radius: 480, damage: 0.02 },
    { wait: 40, close: 32, radius: 300, damage: 0.03 },
    { wait: 35, close: 26, radius: 180, damage: 0.05 },
    { wait: 25, close: 20, radius: 100, damage: 0.07 },
    { wait: 20, close: 16, radius: 55, damage: 0.09 },
    { wait: 15, close: 14, radius: 25, damage: 0.12 },
  ] as readonly Phase[],
  /** Once the last cap has closed, the damage rises by `rise` (of a hull a second) every `every` seconds, so the
   * match ends even if the last ships keep apart. */
  rise: 0.04,
  every: 10,
  /** The final centre lies over at least this depth of water, metres, and the final cap's rim over water all round. */
  open: 4,
  /** Each wider centre lies at most this share of the room the nesting allows from the one inside it. */
  wander: 0.9,
  /** Tries at a placement before falling back. */
  tries: 400,
} as const;

/** A cap of the sphere: its centre (a unit vector) and its angular radius, radians. */
export interface Cap { centre: Vec3; radius: number }

/** The storm at a moment. */
export interface Storm extends Cap {
  /** The cap it is closing toward, or will close toward next; the cap itself once the last has closed. */
  next: Cap;
  closing: boolean;
  /** Seconds until the hold ends or the close does: Infinity once the last cap has closed. */
  secondsToNext: number;
  /** 0 … phases − 1 while they run; the number of phases once the last cap has closed. */
  phase: number;
  /** Share of a full hull a ship outside the cap loses a second. */
  damage: number;
}

/** The whole planet's cap: the one the match starts with. */
const WHOLE = Math.PI;
const angle = (metres: number) => metres / R;

/** No storm: the whole planet's cap, held for ever and harming no one (the lobby's sea, with no match running). */
export const calm = (centre: Vec3): Storm => ({
  centre, radius: WHOLE, next: { centre, radius: WHOLE }, closing: false, secondsToNext: Infinity, phase: 0, damage: 0,
});

/** Radians between two unit vectors. */
const between = (a: Vec3, b: Vec3) => Math.atan2(Math.hypot(...cross(a, b)), dot(a, b));

/** A tangent at unit vector u, at angle `bearing` from an arbitrary but fixed reference. */
function tangent(u: Vec3, bearing: number): Vec3 {
  const ref: Vec3 = Math.abs(u[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  const e1 = normalize(cross(ref, u)), e2 = cross(u, e1);
  return add(scale(e1, Math.cos(bearing)), e2, Math.sin(bearing));
}

/** The point `f` of the way along the great circle from unit vector a to unit vector b. */
function slerp(a: Vec3, b: Vec3, f: number): Vec3 {
  const d = between(a, b);
  if (d < 1e-9) return a;
  const w = normalize(add(b, a, -dot(a, b)));
  return add(scale(a, Math.cos(d * f)), w, Math.sin(d * f));
}

/**
 * Plans the match's caps from its seed over the sea floor `depth`: the centres of the phases' caps, the first (the
 * whole planet's) sharing the second's. Each wider centre lies within the room its inner cap leaves (the difference
 * of their radii), so each cap holds the next, and over water.
 */
export function planStorm(seed: number, depth: Depth): Vec3[] {
  const rand = random(seed * 48271 + 7), phases = STORM.phases;
  const n = phases.length;
  const unit = (): Vec3 => {
    // uniform on the sphere
    const z = 2 * rand() - 1, a = 2 * Math.PI * rand(), s = Math.sqrt(1 - z * z);
    return [s * Math.cos(a), z, s * Math.sin(a)];
  };
  const wet = (u: Vec3) => depth(scale(u, R));
  const final = phases[n - 1].radius;
  const rim = (u: Vec3) => Math.min(...Array.from({ length: 8 }, (_, k) => wet(along(scale(u, R), tangent(u, (k * Math.PI) / 4), final).p)));
  let best: Vec3 = [0, 1, 0], score = -Infinity;
  for (let i = 0; i < STORM.tries; i++) {
    const u = unit();
    const s = Math.min(wet(u) - STORM.open, rim(u));
    if (s > score) [best, score] = [u, s];
    if (s >= 0) break;
  }
  // centres[k] is the centre of the cap phase k closes to
  const centres: Vec3[] = new Array(n);
  centres[n - 1] = best;
  for (let k = n - 2; k >= 0; k--) {
    const inner = centres[k + 1], room = angle(phases[k].radius - phases[k + 1].radius) * STORM.wander;
    centres[k] = inner;
    for (let i = 0; i < STORM.tries; i++) {
      const c = normalize(along(inner, tangent(inner, 2 * Math.PI * rand()), room * R * Math.sqrt(rand())).p);
      if (wet(c) > 0) {
        centres[k] = c;
        break;
      }
    }
  }
  return centres;
}

/**
 * The match's storm: storm(seconds) at that time on its clock (negative times are the start). seed: the match's;
 * depth: water over the floor at a point, metres (shoal.ts).
 */
export function createStorm(seed: number, depth: Depth) {
  const centres = planStorm(seed, depth), phases = STORM.phases, n = phases.length;
  /** The cap phase k holds at before it closes: the whole planet's for the first. */
  const held = (k: number): Cap => (k === 0 ? { centre: centres[0], radius: WHOLE } : { centre: centres[k - 1], radius: angle(phases[k - 1].radius) });
  const target = (k: number): Cap => ({ centre: centres[k], radius: angle(phases[k].radius) });
  return (seconds: number): Storm => {
    let t = Math.max(seconds, 0);
    for (let k = 0; k < n; k++) {
      const p = phases[k], from = held(k), to = target(k);
      if (t < p.wait) return { ...from, next: to, closing: false, secondsToNext: p.wait - t, phase: k, damage: p.damage };
      t -= p.wait;
      if (t < p.close) {
        const f = t / p.close;
        const centre = slerp(from.centre, to.centre, f), radius = from.radius + (to.radius - from.radius) * f;
        return { centre, radius, next: to, closing: true, secondsToNext: p.close - t, phase: k, damage: p.damage };
      }
      t -= p.close;
    }
    const last = target(n - 1);
    return { ...last, next: last, closing: false, secondsToNext: Infinity, phase: n, damage: phases[n - 1].damage + STORM.rise * Math.floor(t / STORM.every + 1) };
  };
}

/** Metres along the surface from p (any vector from the centre) in to the cap's edge: negative outside it. */
export const toEdge = (p: Vec3, cap: Cap) => (cap.radius - between(normalize(p), cap.centre)) * R;

/** Whether p (any vector from the centre) lies outside the cap, in the storm. */
export const outside = (p: Vec3, cap: Cap) => toEdge(p, cap) < 0;

// Hit-stop: a blow's moment held for a few hundredths of a second. The match steps on the time this returns
// (game.ts), so a stop slows the ships, the balls and the sea drawn from them, while the camera's shake and the HUD
// keep real time: the shake playing over the held frame is what sells the blow.
//
// Stops never add up: overlapping ones take the deepest. One in its hold masks every stop of a lower priority. Below a
// sinking, frozen time is budgeted (BUDGET seconds of it a rolling second), so a run of blows cannot make a slideshow:
// over it a stop is trimmed, or dropped if under a frame. None holds past MAX_HOLD.
//
// Pure: no three, no page.

import { blowOf, felt, type Blow, type Deed } from '../player.ts';
import { easeInOut } from '../world/scalar.ts';

const PRIORITY = { hurt: 0, hit: 1, break: 2, kill: 3 } as const;
type Priority = keyof typeof PRIORITY;

/** The time's scale while held (0 stops it), real seconds held at it and easing back, and its priority. */
interface Stop { scale: number; hold: number; release: number; priority: Priority }

/** The stops, by what asks them. */
export const STOPS = {
  hit: { scale: 0.05, hold: 0.045, release: 0.06, priority: 'hit' },
  shieldHit: { scale: 0.1, hold: 0.035, release: 0.05, priority: 'hit' },
  shieldBreak: { scale: 0, hold: 0.11, release: 0.14, priority: 'break' },
  shieldLost: { scale: 0.05, hold: 0.08, release: 0.12, priority: 'break' },
  hurt: { scale: 0.35, hold: 0.04, release: 0.08, priority: 'hurt' },
  sink: { scale: 0.2, hold: 0.32, release: 0.35, priority: 'kill' },
} as const satisfies Record<string, Stop>;
/** The stop for a blow she dealt. */
const DEALT: Record<Blow, Stop> = { broke: STOPS.shieldBreak, hull: STOPS.hit, shield: STOPS.shieldHit };

/** Frozen seconds a rolling second allows below a sinking; the longest hold; a frame. */
const BUDGET = 0.2, WINDOW = 1, MAX_HOLD = 0.6, FRAME = 1 / 60;

/** The stop a deed asks, seen from ship `me`, and how strongly: her blows and her sinkings of others, the blows she
 *  takes. */
export function stopFor(d: Deed, me: number): { stop: Stop; strength: number } | null {
  if (d.kind === 'sank') return d.by === me && d.ship !== me ? { stop: STOPS.sink, strength: 1 } : null;
  if (d.kind !== 'struck') return null;
  const points = d.shield + d.hull;
  if (d.by === me && d.ship !== me) return { stop: DEALT[blowOf(d)], strength: Math.min(1, felt.dealt(points)) };
  if (d.ship === me && points > 0) return { stop: d.broke ? STOPS.shieldLost : STOPS.hurt, strength: Math.min(1, felt.taken(points)) };
  return null;
}

type Live = Stop & { age: number };
const valueOf = (s: Live) =>
  (s.age < s.hold ? s.scale : s.scale + (1 - s.scale) * easeInOut(Math.min(1, (s.age - s.hold) / Math.max(1e-6, s.release))));
const budgeted = (s: Stop) => PRIORITY[s.priority] < PRIORITY.kill;
/** Frozen time still to come from a live stop. */
const toCome = (s: Live) => (1 - s.scale) * (Math.max(0, s.hold - s.age) + (Math.min(s.release, s.hold + s.release - s.age) * 2) / 3);

export function createStops() {
  /** The stops live; the frozen time spent, each frame's (the moment it was spent, and how much), oldest first. */
  const live: Live[] = [], spentAt: number[] = [], frozen: number[] = [];
  let now = 0;

  /** The scale now: the deepest of the stops at or above the highest priority still holding. */
  const current = () => {
    let floor = -1;
    for (const s of live) if (s.age < s.hold) floor = Math.max(floor, PRIORITY[s.priority]);
    let scale = 1;
    for (const s of live) if (PRIORITY[s.priority] >= floor) scale = Math.min(scale, valueOf(s));
    return scale;
  };
  /** Frozen time already spent this rolling second, and still to come from the live budgeted stops. */
  const used = () => {
    let spent = 0, coming = 0;
    for (const f of frozen) spent += f;
    for (const s of live) if (budgeted(s)) coming += toCome(s);
    return spent + coming;
  };

  return {
    /** A stop asked `strength` strong (0…1: shallower, and held for less). */
    request(spec: Stop, strength = 1) {
      const depth = (1 - spec.scale) * Math.min(1, strength);
      let hold = Math.min(spec.hold * (strength < 1 ? 0.5 + strength / 2 : 1), MAX_HOLD);
      if (budgeted(spec) && depth > 0) {
        const left = BUDGET - used(), cost = depth * (hold + (spec.release * 2) / 3);
        if (cost > left) hold = Math.max(0, left / depth - (spec.release * 2) / 3);
        if (hold < FRAME && cost > left) return;
      }
      live.push({ ...spec, scale: 1 - depth, hold, age: 0 });
    },
    /** dt seconds of real time on; the seconds of the match's time they make. */
    update(dt: number): number {
      const scale = current();
      now += dt;
      // those done, and the frozen time older than the window, dropped in place
      let n = 0;
      for (const s of live) {
        s.age += dt;
        if (s.age < s.hold + s.release) live[n++] = s;
      }
      live.length = n;
      if (scale < 1 && live.length && live.every(budgeted)) {
        spentAt.push(now);
        frozen.push((1 - scale) * dt);
      }
      n = 0;
      for (let i = 0; i < spentAt.length; i++) {
        if (spentAt[i] < now - WINDOW) continue;
        spentAt[n] = spentAt[i];
        frozen[n++] = frozen[i];
      }
      spentAt.length = frozen.length = n;
      return dt * scale;
    },
    clear() {
      live.length = spentAt.length = frozen.length = 0;
    },
  };
}

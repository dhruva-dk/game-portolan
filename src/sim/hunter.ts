// A bot's ear: the guns she hears, and going to them. The sea keeps each ship's
// last shot for a few seconds (heard: where, by whom, when), as it keeps the
// loot and the storm, and a bot reads it as she reads them. Weighed among her
// other options (bot.ts) by the same utility scoring:
// - hunt: armed, whole enough, and with no foe in sight, she makes for the
//   nearest guns she hears within her earshot (not her own, nor in the storm),
//   the keener the more she likes a fight and the nearer they are; when they
//   fall silent she makes on for where they last spoke for a while, and gives
//   it up there, or once that while is out. A fight draws ships to it, and the
//   ones that come find it by its smoke and noise, as a player would. Guns by
//   a ship she ran from she lets be; with none to hear, she goes back for a
//   wounded ship she saw lately, to where she saw her (her log: logbook.ts).
//
// Pure arithmetic: no three, so it runs in node for the tests; deterministic
// for the same inputs, to the bit.

import { R, distance, dot, normalize, type Vec3 } from '../world/sphere.ts';
import type { Shot } from './battle.ts';
import { toEdge } from './storm.ts';
import { ramp, utility } from './utility.ts';
import { aggroOf, type Ctx } from './captain.ts';
import { prey, shunned } from './logbook.ts';

/** Seconds a shot is heard after it is fired (the sea's, not a bot's). */
const RINGS = 6;

/** A ship's last shot heard: where (a unit vector), whose, and when (s). */
export interface Report {
  at: Vec3;
  by: number;
  t: number;
}

/**
 * The sea's reports after a step at `now` (s) in which `shots` were fired: each
 * ship's last shot, while it rings (RINGS s).
 */
export function heard(
  was: readonly Report[],
  shots: readonly Shot[],
  now: number
): Report[] {
  const out = was.filter(
    (r) => now - r.t < RINGS && !shots.some((s) => s.shooter === r.by)
  );
  for (const s of shots) {
    if (out.some((r) => r.by === s.shooter)) continue;
    out.push({ at: normalize(s.from), by: s.shooter, t: now });
  }
  return out;
}

/** Everything a bot's ear is tuned by. Metres and seconds. */
export const HUNTING = {
  /**
   * She hears guns `earshot` m off; they draw her the more from `far` m in to
   * `near` m (and nearer still she will soon see the ships).
   */
  earshot: 500,
  far: 450,
  near: 150,
  /**
   * Her hull and shield together under `weak` she goes to no fight; over
   * `whole`, all she is.
   */
  weak: 70,
  whole: 140,
  /**
   * The guns fallen silent, she makes on for where they last spoke for `keep` s;
   * there (within `arrive` m), or once that is out, she gives it up, and isn't
   * drawn again for `rest` s.
   */
  keep: 20,
  arrive: 45,
  rest: 15,
  /** Guns inside the storm's edge by less than this are let be. */
  edge: 20,
} as const;

/**
 * What her ear carries: where she is going to the guns (null: nowhere), when
 * she last heard them there, and when she last gave a hunt up (her mind's
 * clock, s).
 */
export interface HuntMemory {
  hunt: Vec3 | null;
  huntT: number;
  restT: number;
}

/** An ear's memory as she puts to sea. */
export const huntMemory = (): HuntMemory => ({
  hunt: null,
  huntT: -Infinity,
  restT: -Infinity,
});

/** The nearest guns she hears, not her own nor in the storm, or null. */
function nearest(c: Ctx): Report | null {
  const p = c.own.ship.at,
    reports = c.sea.gunfire,
    s = c.sea.storm,
    within = Math.cos(c.b.hunting.earshot / R);
  if (!reports) return null;
  let best: Report | null = null,
    bd = -Infinity;
  for (const r of reports) {
    if (r.by === c.own.id) continue;
    const d = dot(p, r.at);
    if (d < within || d <= bd) continue;
    if (s && toEdge(r.at, s) < c.b.hunting.edge) continue;
    // not back into a fight she ran from (logbook.ts)
    if (shunned(c, r.at)) continue;
    [best, bd] = [r, d];
  }
  return best;
}

/** Gives the hunt up: resting `rest` s before she is drawn again. */
const giveUp = (c: Ctx) => {
  c.m.hunt = null;
  c.m.restT = c.m.clock;
};

/**
 * The hunt option's score: armed, whole enough, no foe in sight and not
 * resting, the nearest guns she hears, by how near and how she likes a fight.
 * Notes where she would go in her memory (`hunt`).
 */
export function huntUrge(c: Ctx): number {
  const { m, own, t } = c,
    h = c.b.hunting;
  if (!own.armed || c.foe || m.clock - m.restT < h.rest) return 0;
  const r = nearest(c);
  if (r) [m.hunt, m.huntT] = [r.at, m.clock];
  else if (
    m.hunt &&
    (m.clock - m.huntT > h.keep || distance(own.ship.at, m.hunt) < h.arrive)
  )
    giveUp(c);
  // no guns, a wounded ship she saw lately (logbook.ts): back for her
  if (!m.hunt && !r) {
    const w = prey(c);
    if (w) [m.hunt, m.huntT] = [w.at, m.clock];
  }
  if (!m.hunt) return 0;
  const strength = (own.hull ?? 100) + (own.shield ?? 0);
  return utility(
    t.fight * (0.6 + 0.4 * aggroOf(c)),
    ramp(strength, h.weak, h.whole),
    ramp(distance(own.ship.at, m.hunt), h.far, h.near)
  );
}

/** Going to the guns: where she last heard them her goal. */
export const huntAct = (c: Ctx): Vec3 => c.m.hunt ?? c.m.goal;

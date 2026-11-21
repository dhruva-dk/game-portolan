// A ship's faults (ShipDraw.faults: kinds.ts ZONES, 0 none, 1 minor, 2 major)
// as she is drawn, laid on what the fleet and its materials already take, and
// nothing else:
//   rigging    her canvas grimed toward soot (her look's sail colour) and slack
//              (less of her sails' wind taken: fleet.ts set's slack)
//   rudder     her head wandering, a slow yaw back and forth about her course
//   waterline  a list (her pose's up leaned to one side, her own)
//   deck       (smoke from her gun ports: gunfire/puffs.ts)
// Each eases in and out as the fault comes on and is mended, never jumps. Her
// spray at the side and her ports' smoke are the puffs'.

import { SOOT } from '../palette.ts';
import type { Look, ShipDraw } from '../snapshot.ts';
import { cross, type Vec3 } from '../world/sphere.ts';

/**
 * By grade (none, minor, major): how far her canvas's dye goes toward soot
 * (palette.ts SOOT: grimed and scorched, greyed, not merely deeper), and the
 * share of her sails' wind it takes.
 */
const GRIME = [0, 0.45, 0.75] as const,
  SLACK = [1, 0.6, 0.3] as const;
/** By grade: her list (radians), and how far her head wanders (radians). */
const LIST = [0, 0.07, 0.15] as const,
  WANDER = [0, 0.04, 0.09] as const;
/** Her head's wander: its two periods (s), the second's share of it. */
const WANDERS = [5.3, 1.9, 0.35] as const;
/** How fast a fault comes on or goes, per second. */
const EASE = 0.9;
/** How near a ship's middle a point is to be on her, metres (her half-length and some). */
const ON = 14;

/** What one ship carries from frame to frame: each eased amount, her drawing, and its grimed sail. */
interface Eased {
  grime: number;
  slack: number;
  list: number;
  wander: number;
  drawn: ShipDraw;
  pose: {
    position: Vec3;
    forward: [number, number, number];
    up: [number, number, number];
  };
  look: Look;
  sail: [number, number, number];
}

export function createFaults() {
  const eased: Eased[] = [];
  /** The ships last drawn, faults laid on: the same list each time, made over. */
  const out: ShipDraw[] = [];
  /** Her slack, by slot, for the fleet. */
  const slacks: number[] = [];
  /** The world's clock at the last; a ship's port side, worked out for each in turn. */
  let then = -Infinity;
  const side: [number, number, number] = [0, 0, 0];

  return {
    /**
     * `ships` at `time` (the world's clock, s): each with her faults laid on
     * her pose and look, eased on the world's clock (held while it is). Read
     * the list before the next.
     */
    apply(ships: readonly ShipDraw[], time: number) {
      out.length = 0;
      const dt = time - then;
      then = time;
      // (a jump of the clock, a new match or the first frame, settles at once)
      const k = dt > 0 && dt < 1 ? 1 - Math.exp(-EASE * dt) : dt === 0 ? 0 : 1;
      for (const s of ships) {
        const [rig, rudder, water] = s.faults;
        const w = (eased[s.id] ??= {
          grime: 0,
          slack: 1,
          list: 0,
          wander: 0,
          drawn: { ...s },
          pose: { position: [0, 0, 0], forward: [0, 0, 0], up: [0, 0, 0] },
          look: { ...s.look },
          sail: [0, 0, 0],
        });
        w.grime += (GRIME[rig] - w.grime) * k;
        w.slack += (SLACK[rig] - w.slack) * k;
        // (to port or starboard, her own way)
        w.list += ((s.id % 2 ? 1 : -1) * LIST[water] - w.list) * k;
        w.wander += (WANDER[rudder] - w.wander) * k;
        slacks[s.id] = w.slack;
        if (w.grime < 1e-3 && Math.abs(w.list) < 1e-4 && w.wander < 1e-4) {
          out.push(s);
          continue;
        }
        const { position, forward: f, up: u } = s.pose,
          port = cross(u, f, side);
        // her head turned about her up by the wander, her up leaned toward
        // starboard (port up) by the list
        const phase = s.id * 1.7,
          yaw =
            w.wander *
            ((1 - WANDERS[2]) *
              Math.sin((2 * Math.PI * time) / WANDERS[0] + phase) +
              WANDERS[2] *
                Math.sin((2 * Math.PI * time) / WANDERS[1] + 2 * phase)),
          cy = Math.cos(yaw),
          sy = Math.sin(yaw),
          cl = Math.cos(w.list),
          sl = Math.sin(w.list);
        const p = w.pose;
        p.position = position;
        for (let j = 0; j < 3; j++) {
          p.forward[j] = f[j] * cy + port[j] * sy;
          p.up[j] = u[j] * cl - (port[j] * cy - f[j] * sy) * sl;
        }
        // her look as it is, every field, but for her sail grimed
        for (let j = 0; j < 3; j++)
          w.sail[j] = s.look.sail[j] + (SOOT[j] - s.look.sail[j]) * w.grime;
        Object.assign(w.look, s.look);
        w.look.sail = w.sail;
        Object.assign(w.drawn, s);
        w.drawn.pose = p;
        w.drawn.look = w.look;
        out.push(w.drawn);
      }
      return out;
    },
    /** Ship `id`'s share of her sails' wind her canvas takes (1 sound), as last applied. */
    slack: (id: number) => slacks[id] ?? 1,
    /**
     * Point `p` (world metres) on one of `ships` (the list last applied, as
     * it came in) carried with her onto her pose as it went out: listed and
     * turned with her (a gun's mouth, so its flash is where the gun is drawn);
     * as it is when on none (within ON metres of none), or she is unfaulted.
     * Into `into`.
     */
    carried(
      p: Vec3,
      ships: readonly ShipDraw[],
      into: [number, number, number]
    ): Vec3 {
      into[0] = p[0];
      into[1] = p[1];
      into[2] = p[2];
      let best = -1,
        near = ON * ON;
      for (let i = 0; i < ships.length; i++) {
        const q = ships[i]?.pose.position;
        if (!q) continue;
        const d = (p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2 + (p[2] - q[2]) ** 2;
        if (d < near) [best, near] = [i, d];
      }
      const was = ships[best]?.pose,
        now = out[best]?.pose;
      if (!was || !now || was === now) return into;
      const o = was.position,
        r0 = p[0] - o[0],
        r1 = p[1] - o[1],
        r2 = p[2] - o[2];
      // its place in her frame as she was (fore, up, to port), laid out again
      // in her frame as she is drawn
      cross(was.up, was.forward, side);
      const a = r0 * was.forward[0] + r1 * was.forward[1] + r2 * was.forward[2],
        b = r0 * was.up[0] + r1 * was.up[1] + r2 * was.up[2],
        c = r0 * side[0] + r1 * side[1] + r2 * side[2];
      cross(now.up, now.forward, side);
      for (let j = 0; j < 3; j++)
        into[j] =
          now.position[j] + a * now.forward[j] + b * now.up[j] + c * side[j];
      return into;
    },
  };
}

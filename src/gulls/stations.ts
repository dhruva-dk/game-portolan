// Where a flight's gulls work on her deck, by the job in hand, and each one's small loop of motion there: her own frame
// (+x port, +y up, +z ahead: ship/lines.ts's), metres, its feet's place, the way it faces and its up, and its wings.
//   mend    at the rail, two to a side, facing out over it, hammering (pecking hard and quick)
//   gust    off her stern, hovering in a row across her, facing forward, beating the wind into her canvas
//   stores  a chain across her waist over the hatch, hopping in turn, facing along the chain
//   part    clinging to the mainmast, two to a side, climbing slowly up and down it, wings fluttering
//   (none)  come aboard or between jobs: about the waist, looking round, bobbing

import type { FlightJob } from '../snapshot';
import type { Vec3 } from '../world/sphere';
import { MASTS, SCALE, deckAt, inside, mastZ, sideTop, zAt } from '../ship/lines';

/** A gull's place on deck: its feet (her frame, metres), the way it faces and its up (her frame, unit), how spread its
 *  wings are (0 folded … 1 flying) and how fast they beat (rad/s; 0 the flight's own). */
export interface Station { at: Vec3; ahead: Vec3; up: Vec3; spread: number; beat: number }

/** Facing `yaw` (rad from ahead toward port), its nose `pitch` rad down. */
function facing(yaw: number, pitch: number): { ahead: Vec3; up: Vec3 } {
  const cp = Math.cos(pitch), sp = Math.sin(pitch), sy = Math.sin(yaw), cy = Math.cos(yaw);
  return { ahead: [sy * cp, -sp, cy * cp], up: [sy * sp, cp, cy * sp] };
}

/** A design station s's place on deck, `x` metres to port. */
const onDeck = (s: number, x: number): Vec3 => [x, deckAt(s) * SCALE, zAt(s) * SCALE];

/** Gull `k`'s station for `job`, at `clock` (s). */
export function stationOf(job: FlightJob | null, k: number, clock: number): Station {
  const side = k % 2 === 0 ? 1 : -1, beat = (rate: number, phase = k * 1.9) => Math.sin(clock * rate + phase);
  switch (job) {
    case 'mend': {
      const s = [0.45, 0.5, 0.66, 0.71][k], y = sideTop(s);
      const peck = Math.max(0, beat(10)) ** 4;
      return { at: [side * (inside(s, y) + 0.07) * SCALE, y * SCALE, zAt(s) * SCALE], ...facing((side * Math.PI) / 2, 0.15 + 0.75 * peck), spread: 0, beat: 0 };
    }
    case 'gust': {
      // hovering in a row off her stern, beating the wind into her canvas
      const at = onDeck(0, (k - 1.5) * 2.6);
      return { at: [at[0], at[1] + 1.2 + 0.3 * beat(5) - 0.4 * Math.abs(k - 1.5), at[2] - 2.2 - (k % 2) * 0.8], ...facing(0, -0.3), spread: 1, beat: 17 };
    }
    case 'stores': {
      const s = 0.67, hop = Math.abs(beat(4.5, k * 0.8)), at = onDeck(s, (k - 1.5) * 1.3);
      return { at: [at[0], at[1] + 0.5 * hop, at[2]], ...facing((side * Math.PI) / 2, -0.2 * hop), spread: hop > 0.5 ? 0.6 : 0, beat: 14 };
    }
    case 'part': {
      const s = MASTS.main.s, r = MASTS.main.r * SCALE + 0.5, climb = 1.6 + Math.floor(k / 2) * 2.6 + 0.9 * beat(1.1);
      return { at: [side * r, deckAt(s) * SCALE + climb, mastZ('main') * SCALE - 0.2], ...facing((-side * Math.PI) / 2, -1.1), spread: 0.35, beat: 20 };
    }
    default: {
      const s = [0.48, 0.5, 0.62, 0.64][k];
      return { at: onDeck(s, side * (1.2 + 0.3 * (k >> 1))), ...facing(0.7 * beat(0.6), 0.12 * Math.max(0, beat(3))), spread: 0, beat: 0 };
    }
  }
}

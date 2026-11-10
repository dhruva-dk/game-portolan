// How a captain out on a trail weighs the risk of it, as the first Portolan's did: how soon the quickest rival could reach
// the open trail, against how soon it can be back in its own water and have the trail safe.
import { TERRITORY, apart, cellDir, neighbor } from '../sphere.ts';
import { PHASE, SHIPS, type MatchState } from '../state.ts';
import type { V3 } from '../math.ts';

/** The fewest metres a second a ship is taken to make, so that one lying still is not taken to be never coming. */
const SLOWEST = 6;
/** Only every so many cells of a trail are looked at. */
const STRIDE = 4;
/** The seconds a rival is taken to lose when not pointed at the trail, at worst. */
const TURNING = 1.2;

const P: V3 = { x: 0, y: 0, z: 0 }, Q: V3 = { x: 0, y: 0, z: 0 };

const speed = (v: V3): number => Math.max(Math.hypot(v.x, v.y, v.z), SLOWEST);

/** The nearest of the ship's own water to it that touches its open trail, in `out` (a unit direction), or null. */
export function haven(state: MatchState, i: number, out: V3): V3 | null {
  const ship = state.ships[i], laid = ship.laid, mark = i + 1;
  let best = Infinity, found = false;
  for (let k = 0; k < laid.length; k += STRIDE) {
    for (let m = 0; m < 4; m++) {
      const n = neighbor(TERRITORY, laid[k], m);
      if (state.owner[n] !== mark) continue;
      cellDir(TERRITORY, n, P);
      const d = apart(ship.pos, P);
      if (d < best) {
        best = d;
        out.x = P.x; out.y = P.y; out.z = P.z;
        found = true;
      }
    }
  }
  return found ? out : null;
}

/** Seconds by which the quickest rival could reach ship i's open trail before the ship has sailed `home` metres: above 0
 *  it is too late; a large negative number when no rival is near, or there is no trail. A captain's estimate of its
 *  rivals is out by the factor `misjudged`. */
export function exposure(state: MatchState, i: number, home: number, misjudged = 1): number {
  const ship = state.ships[i], laid = ship.laid;
  if (laid.length === 0) return -Infinity;
  const homeT = home / speed(ship.vel);
  let foe = Infinity;
  for (let j = 0; j < SHIPS; j++) {
    const o = state.ships[j];
    if (j === i || o.phase !== PHASE.sea) continue;
    const os = speed(o.vel);
    let best = apart(o.pos, ship.pos), at = ship.pos as V3;
    for (let k = 0; k < laid.length; k += STRIDE) {
      cellDir(TERRITORY, laid[k], P);
      const d = apart(o.pos, P);
      if (d < best) {
        best = d;
        Q.x = P.x; Q.y = P.y; Q.z = P.z;
        at = Q;
      }
    }
    // how far off pointing at the trail it is, 0 straight at it and 2 straight away, in the frame of the sphere near it
    const dx = at.x - o.pos.x, dy = at.y - o.pos.y, dz = at.z - o.pos.z, l = Math.hypot(dx, dy, dz) || 1, v = Math.hypot(o.vel.x, o.vel.y, o.vel.z) || 1;
    const facing = (dx * o.vel.x + dy * o.vel.y + dz * o.vel.z) / (l * v);
    foe = Math.min(foe, best / os + (1 - facing) * TURNING);
  }
  return homeT - foe * misjudged;
}

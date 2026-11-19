// Which ships' sails are simulated as cloth (cloth.ts): the player's own and the few nearest the eye, each in one of a
// fixed number of berths. Every other ship's canvas is the drawn shape the wind fills in the shader (materials.ts),
// and a ship passes from one to the other without a jump: given a berth, her cloth is laid out as cut and left to
// settle for SETTLE seconds unseen, then shown over FADE seconds (`share`, the simulated shape's part in what is
// drawn); let go, it is faded out again before the berth is free for another.
//
// A ship holding a berth keeps it until another is KEEP times nearer, so two ships at about the same distance don't
// trade it back and forth.
//
// Pure arithmetic: no three, so it runs in node for the tests.

/** How many ships' sails are simulated at once. */
export const BERTHS = 4;
/** No ship further than this from the eye is simulated, metres: past it the cloth's folds are under a pixel or two. */
export const CLOTH_REACH = 130;
/** Seconds a new berth's cloth settles before it is shown, and over which it is shown or hidden. */
export const SETTLE = 1, FADE = 1.5;
/** A ship keeps her berth until another is this many times nearer than she is. */
const KEEP = 1.3;

/** A ship in a berth: whose, how long she has had it, seconds, how much of her canvas the cloth draws (0–1), and
 * whether she has just come (her cloth to be laid out as cut). */
export interface Berth { ship: number; age: number; share: number; fresh: boolean }

/** The ships wanted in a berth, nearest first (moor's, kept from call to call). */
const wanted = new Int32Array(BERTHS);

/** Whether ship i holds one of the berths. */
function holds(berths: readonly (Berth | null)[], i: number): boolean {
  for (let k = 0; k < BERTHS; k++) if (berths[k]?.ship === i) return true;
  return false;
}

/** Whether ship i is among the first n wanted. */
function among(i: number, n: number): boolean {
  for (let w = 0; w < n; w++) if (wanted[w] === i) return true;
  return false;
}

/**
 * The berths (BERTHS of them, each empty or held) moved on dt seconds, in place, given each ship's distance from the
 * eye (metres; Infinity for a ship not on the sea) and the player's own ship (or −1), who always has one. Returns them.
 */
export function moor(berths: (Berth | null)[], metres: ArrayLike<number>, own: number, dt: number): (Berth | null)[] {
  // the wanted, picked nearest first (the player first of all; a ship holding a berth as if KEEP times nearer), the
  // lowest numbered first between equals
  let n = 0;
  for (; n < BERTHS; n++) {
    let best = -1, bestRank = Infinity;
    for (let i = 0; i < metres.length; i++) {
      if ((i !== own && !(metres[i] < CLOTH_REACH)) || among(i, n)) continue;
      const rank = i === own ? -1 : metres[i] / (holds(berths, i) ? KEEP : 1);
      if (rank < bestRank) { best = i; bestRank = rank; }
    }
    if (best < 0) break;
    wanted[n] = best;
  }
  // the held aged, and faded in, or out (and let go) if no longer wanted; then the wanted not held given free ones
  for (let k = 0; k < BERTHS; k++) {
    const b = berths[k];
    if (!b) continue;
    b.age += dt;
    b.fresh = false;
    if (among(b.ship, n)) {
      if (b.age > SETTLE) b.share = Math.min(1, b.share + dt / FADE);
    } else {
      b.share -= dt / FADE;
      if (b.share <= 0) berths[k] = null;
    }
  }
  for (let w = 0; w < n; w++) {
    if (holds(berths, wanted[w])) continue;
    const free = berths.indexOf(null);
    if (free < 0) break;
    berths[free] = { ship: wanted[w], age: 0, share: 0, fresh: true };
  }
  return berths;
}

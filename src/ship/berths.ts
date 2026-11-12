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

/**
 * The berths after dt seconds, given each ship's distance from the eye (metres; Infinity for a ship not on the sea)
 * and the player's own ship (or −1), who always has one.
 */
export function moor(berths: readonly (Berth | null)[], metres: readonly number[], own: number, dt: number): (Berth | null)[] {
  const held = new Set(berths.flatMap((b) => (b ? [b.ship] : [])));
  const rank = (i: number) => (i === own ? -1 : metres[i] / (held.has(i) ? KEEP : 1));
  const wanted = new Set(metres.map((_, i) => i).filter((i) => i === own || metres[i] < CLOTH_REACH)
    .sort((a, b) => rank(a) - rank(b)).slice(0, BERTHS));
  const next = Array.from({ length: BERTHS }, (_, k): Berth | null => {
    const b = berths[k];
    if (!b) return null;
    if (wanted.has(b.ship)) {
      const age = b.age + dt;
      return { ship: b.ship, age, share: age > SETTLE ? Math.min(1, b.share + dt / FADE) : b.share, fresh: false };
    }
    const share = b.share - dt / FADE;
    return share > 0 ? { ...b, age: b.age + dt, share, fresh: false } : null;
  });
  for (const ship of wanted) {
    if (held.has(ship)) continue;
    const free = next.indexOf(null);
    if (free < 0) break;
    next[free] = { ship, age: 0, share: 0, fresh: true };
  }
  return next;
}

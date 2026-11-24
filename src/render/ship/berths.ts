export const BERTHS = 4;
export const CLOTH_REACH = 130;
export const SETTLE = 1,
  FADE = 1.5;
const KEEP = 1.3;

export interface Berth {
  ship: number;
  age: number;
  share: number;
  fresh: boolean;
}

const wanted = new Int32Array(BERTHS);

function holds(berths: readonly (Berth | null)[], i: number): boolean {
  for (let k = 0; k < BERTHS; k++) if (berths[k]?.ship === i) return true;
  return false;
}

function among(i: number, n: number): boolean {
  for (let w = 0; w < n; w++) if (wanted[w] === i) return true;
  return false;
}

export function moor(
  berths: (Berth | null)[],
  meters: ArrayLike<number>,
  own: number,
  dt: number
): (Berth | null)[] {
  let n = 0;
  for (; n < BERTHS; n++) {
    let best = -1,
      bestRank = Infinity;
    for (let i = 0; i < meters.length; i++) {
      if ((i !== own && !(meters[i] < CLOTH_REACH)) || among(i, n)) continue;
      const rank = i === own ? -1 : meters[i] / (holds(berths, i) ? KEEP : 1);
      if (rank < bestRank) {
        best = i;
        bestRank = rank;
      }
    }
    if (best < 0) break;
    wanted[n] = best;
  }
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

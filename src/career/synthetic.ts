// A synthetic match: the rating's model of a match, played out with dice. Each ship's showing is its skill
// plus normal noise of spread SKILL.sigma; the order of showings is the order of finish. Each sunk ship was
// sunk by a ship still afloat (chosen at random) or, the rest of the time, by the Storm.
// The rating tests play synthetic players with it, and the league plays its off-screen heats with it.
import { rngFloat, rngInt, type Rng } from '../sim/math.ts';
import { SKILL } from './rating.ts';

/** A standard normal draw: twelve uniforms, centred. */
export function gauss(rng: Rng): number {
  let s = 0;
  for (let i = 0; i < 12; i++) s += rngFloat(rng);
  return s - 6;
}

export interface SyntheticResult {
  /** Place of each ship, 1 for the winner. */
  place: number[];
  /** The ship that sank each ship, or -1 (the winner, or sunk by the Storm). */
  sunkBy: number[];
  kills: number[];
}

export function playSynthetic(rng: Rng, skills: readonly number[]): SyntheticResult {
  const n = skills.length, showing = skills.map((s) => s + SKILL.sigma * gauss(rng));
  const order = skills.map((_, i) => i).sort((a, b) => showing[b] - showing[a] || a - b);
  const place = new Array<number>(n).fill(0), sunkBy = new Array<number>(n).fill(-1), kills = new Array<number>(n).fill(0);
  order.forEach((ship, k) => {
    place[ship] = k + 1;
  });
  for (let k = 1; k < n; k++) {
    if (rngFloat(rng) >= SKILL.fell) continue;
    const by = order[rngInt(rng, k)];
    sunkBy[order[k]] = by;
    kills[by]++;
  }
  return { place, sunkBy, kills };
}

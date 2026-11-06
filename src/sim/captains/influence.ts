// The captains' influence map: a coarse grid over the planet, cells about 50 m across, holding what draws a captain
// and what keeps it off (Tozour, "Influence Mapping", Game Programming Gems 2, 2001). It is drawn fresh from what any
// ship could know: loot lying on the water, whose glow stands up over the horizon, and the noise of fights
// (hearing.ts), each spread a hundred metres or so over the cells round it. A captain with nowhere it has to be weighs
// every cell in its reach on curves set by its temperament and its nerve (Mark and Lewis's utility scoring, as in
// brain.ts): a scavenger follows the loot, a hunter goes toward the guns, a turtle wants the quiet water far from
// both, and every captain wants water the Storm will leave it, drifting toward the next circle as it closes. Other
// captains' goals count against a cell, so the fleet spreads out, and the pacing director (director.ts) can keep the
// water round the player clear for a while after a fight.
import { cellDir, cubeGrid, neighbor, cellOf, apart, R } from '../sphere.ts';
import { rngFloat, v3, type Rng, type V3 } from '../math.ts';
import { nearestOpen, openAt } from '../nav.ts';
import { PHASE, PLAYER, SHIPS, TICK, copy, type MatchState } from '../state.ts';
import { stormView, newStormView, toEdge } from '../storm.ts';
import { holdsAt } from '../territory.ts';
import { fade } from './hearing.ts';
import { keptClear } from './director.ts';
import type { Style } from './temperaments.ts';

export const INFLUENCE = cubeGrid(16);

export const SCOUT = {
  /** Metres a green captain, and a sharp one, looks round for somewhere to go; and the nearest it bothers with. */
  reach: [170, 280],
  near: 35,
  /** Worth of a piece of loot lying on the water: `base`, and `rarity` more for each step of rarity. */
  base: 1,
  rarity: 0.4,
  /** Nerve (will to fight, 0..1) at which the guns stop putting a captain off and start drawing it in, and how hard
   *  they draw (`toward`) or repel (`off`) on either side of it. */
  nerve: 0.5,
  toward: 2.4,
  off: 3,
  /** What it costs a cell to lie within `margin` of the Storm's edge, outside the next circle (and more once that is
   *  closing), and far from the next circle's middle (per radius out). */
  edge: 3,
  outside: 0.7,
  closing: 2.2,
  middle: 0.5,
  /** Worth of its own water (by its temperament's love of landmarks); cost per 100 m sailed; cost of another
   *  captain's goal within `crowd` metres; the cost of the player's water while the director keeps it clear. */
  home: 0.6,
  far: 0.35,
  crowd: 70,
  crowded: 0.45,
  clear: 2.5,
  /** A green captain's whim: noise on each cell's worth, down to a fifth of it for a sharp one. */
  whim: 0.5,
} as const;

const N = INFLUENCE.cells;
/** What the map holds: loot worth, and the noise of fights, per cell. */
export const LOOT_MAP = new Float32Array(N), NOISE_MAP = new Float32Array(N);
const TMP = new Float32Array(N);
const P = v3(), VIEW = newStormView();
const TOP = 6, BEST = new Int32Array(TOP), BS = new Float64Array(TOP);
let builtFor: MatchState | null = null, builtAt = -1;

/** Draws the map from the match as it stands this tick (once a tick, however many captains ask). */
export function mapInfluence(state: MatchState): void {
  if (builtFor === state && builtAt === state.tick) return;
  builtFor = state;
  builtAt = state.tick;
  LOOT_MAP.fill(0);
  NOISE_MAP.fill(0);
  for (const l of state.loot) LOOT_MAP[cellOf(INFLUENCE, l.at)] += SCOUT.base + SCOUT.rarity * l.item.rarity;
  const now = state.tick * TICK;
  for (const x of state.noise) NOISE_MAP[cellOf(INFLUENCE, x.at)] += x.loud * fade(x, now);
  spread(LOOT_MAP);
  spread(LOOT_MAP);
  spread(NOISE_MAP);
  spread(NOISE_MAP);
}

/** One step of spreading: half of each cell stays, and an eighth of each neighbour's comes in. */
function spread(a: Float32Array): void {
  for (let c = 0; c < N; c++) {
    let s = 0;
    for (let k = 0; k < 4; k++) s += a[neighbor(INFLUENCE, c, k)];
    TMP[c] = a[c] * 0.5 + s * 0.125;
  }
  a.set(TMP);
}

/**
 * Somewhere worth going for captain i, in `out`: the best open cell in its reach, weighed by its temperament, its
 * nerve (its will to fight now, 0..1) and the Storm. False if nothing in reach is open water.
 */
export function scout(state: MatchState, i: number, style: Style, nerve: number, rng: Rng, tide: number, out: V3): boolean {
  mapInfluence(state);
  stormView(state, VIEW);
  const ship = state.ships[i], c = ship.captain;
  const reach = SCOUT.reach[0] + (SCOUT.reach[1] - SCOUT.reach[0]) * c.skill;
  const wantsLoot = style.loot * (0.6 + 0.8 * c.greed);
  const guns = nerve >= SCOUT.nerve ? (nerve - SCOUT.nerve) * SCOUT.toward : (nerve - SCOUT.nerve) * SCOUT.off;
  const whim = SCOUT.whim * (1 - 0.8 * c.skill);
  const clear = keptClear(state, i);
  const nextR = Math.max(VIEW.next.r, 30);
  BEST.fill(-1);
  BS.fill(-1e9);
  for (let cell = 0; cell < N; cell++) {
    cellDir(INFLUENCE, cell, P);
    const d = apart(ship.pos, P);
    if (d > reach || d < SCOUT.near) continue;
    let s = wantsLoot * LOOT_MAP[cell] + guns * NOISE_MAP[cell];
    if (toEdge(state, P) < style.margin) s -= SCOUT.edge;
    const fromNext = R * Math.sqrt(Math.max(0, 2 - 2 * (P.x * VIEW.next.at.x + P.y * VIEW.next.at.y + P.z * VIEW.next.at.z)));
    if (fromNext > VIEW.next.r - style.margin * 0.5) s -= VIEW.closing ? SCOUT.closing : SCOUT.outside;
    s -= SCOUT.middle * Math.min(2, fromNext / nextR) * (VIEW.phase > 0 ? 1 : 0.3);
    if (holdsAt(state, i, P)) s += SCOUT.home * style.marks;
    s -= (SCOUT.far * d) / 100;
    for (let j = 0; j < SHIPS; j++) {
      const o = state.ships[j];
      if (j === i || o.phase !== PHASE.sea || !o.captain.on) continue;
      if (apart(o.captain.goal, P) < SCOUT.crowd) s -= SCOUT.crowded;
    }
    if (clear && apart(state.ships[PLAYER].pos, P) < clear) s -= SCOUT.clear;
    s += whim * rngFloat(rng);
    // keep the best few, best first
    if (s <= BS[TOP - 1]) continue;
    let k = TOP - 1;
    while (k > 0 && BS[k - 1] < s) {
      BS[k] = BS[k - 1];
      BEST[k] = BEST[k - 1];
      k--;
    }
    BS[k] = s;
    BEST[k] = cell;
  }
  for (let k = 0; k < TOP; k++) {
    if (BEST[k] < 0) break;
    cellDir(INFLUENCE, BEST[k], P);
    if (openAt(P, tide) || nearestOpen(P, P, 25, tide)) {
      copy(out, P);
      return true;
    }
  }
  return false;
}

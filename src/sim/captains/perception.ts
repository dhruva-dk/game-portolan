// What a captain knows when it decides (PROMPT.md, How captains think): only what its own ship and its own gull could
// see this tick — the rivals in its sight or marked on its chart (visibility.ts survey: over the curve, through the
// air the weather leaves, under its gull's scouting), the open trails its chart shows (trailSeen), and the chests,
// flotsam and find sites within its lookout's horizon or marked by its gull's Eye (gull.ts gullMarks) — besides what
// every chart shows everyone: the sea held, the Great Current's route and the storm as announced, which the brain
// reads itself. Nothing else of the match reaches the brain: a ship, a trail or a chest beyond its sight cannot change
// what it does.
import { fights } from '../combat.ts';
import type { Sea } from '../environment.ts';
import { gullMarks } from '../gull.ts';
import { dcos, dot, v3, type V3 } from '../math.ts';
import { R, TERRITORY, cellDir, horizonDistance } from '../sphere.ts';
import { SHIPS, type MatchState } from '../state.ts';
import { eyeReach, trailSeen, type Sight } from '../visibility.ts';

/** u a lookout sees things afloat beyond its own horizon, by their height: a chest's glow, a coin's glint, a wreck's spars. */
const LOW = { chest: horizonDistance(2), coin: horizonDistance(0.3), site: horizonDistance(3) };

/** The farthest open trail a captain weighs, u, and the stride it reads a trail's cells at (newest first). */
export const NOTICE = { trail: 60, stride: 3 };

/** What one captain perceives now: rivals by ship bit; the nearest of each kind of thing, its index (−1 none) and distance (u, Infinity none). */
export interface Percept {
  /** Rivals it knows the place of: in sight or marked on its chart. */
  ships: number;
  /** Of those, the ones whose hulls are up: near enough to read their wounds. */
  hulls: number;
  /** The nearest of them that fights. */
  rival: number;
  rivalD: number;
  /** The nearest cell of a rival's open trail its chart shows, the trail's owner, and the trail's length in cells. */
  trail: number;
  trailCell: number;
  trailD: number;
  trailLen: number;
  /** The nearest chest afloat it may take (MatchState.chests), coin, flotsam or bottle (MatchState.coins), and find site there to take (Geography.finds). */
  chest: number;
  chestD: number;
  coin: number;
  coinD: number;
  site: number;
  siteD: number;
}

export const newPercept = (): Percept => ({
  ships: 0, hulls: 0, rival: -1, rivalD: Infinity, trail: -1, trailCell: -1, trailD: Infinity, trailLen: 0,
  chest: -1, chestD: Infinity, coin: -1, coinD: Infinity, site: -1, siteD: Infinity,
});

/** Whether the percept places rival j. */
export const knows = (p: Percept, j: number): boolean => (p.ships & (1 << j)) !== 0;

const MARKED_SITES: number[] = [], MARKED_CHESTS: number[] = [], CELL = v3();

/** u between two unit directions, by the chord: exact enough at a lookout's ranges. */
export function apart(a: V3, b: V3): number {
  return R * Math.sqrt(Math.max(0, 2 - 2 * dot(a, b)));
}

/** What captain i perceives through this tick's `sight` (its survey), into `out`. Reads nothing its ship or gull could not see. */
export function perceive(sea: Sea, state: MatchState, i: number, sight: Sight, out: Percept): Percept {
  const pos = state.ships[i].pos, reach = eyeReach(state, i), air = sight.range;
  out.ships = sight.ships | sight.marks;
  out.hulls = sight.hulls;
  out.rival = out.trail = out.trailCell = out.chest = out.coin = out.site = -1;
  out.rivalD = out.trailD = out.chestD = out.coinD = out.siteD = Infinity;
  out.trailLen = 0;
  for (let j = 0; j < SHIPS; j++) {
    if (!knows(out, j) || !fights(state.ships[j])) continue;
    const d = apart(pos, state.ships[j].pos);
    if (d < out.rivalD) {
      out.rivalD = d;
      out.rival = j;
    }
  }
  const trailCos = dcos(NOTICE.trail / R);
  for (let j = 0; j < SHIPS; j++) {
    const owner = state.ships[j], laid = owner.laid;
    // A ward's St Elmo's fire shows on a ship in sight; the first voyage's charm is a rule every captain knows.
    if (j === i || laid.length === 0 || (j === 0 && state.charm) || (owner.ward > 0 && knows(out, j))) continue;
    for (let k = laid.length - 1; k >= 0; k -= NOTICE.stride) {
      const c = dot(pos, cellDir(TERRITORY, laid[k], CELL));
      if (c < trailCos || !trailSeen(sea, state, i, j, k)) continue;
      const d = R * Math.sqrt(Math.max(0, 2 - 2 * c));
      if (d < out.trailD) {
        out.trailD = d;
        out.trail = j;
        out.trailCell = laid[k];
        out.trailLen = laid.length;
      }
    }
  }
  gullMarks(sea, state, i, MARKED_SITES, MARKED_CHESTS);
  const chestCos = dcos(Math.min(air, reach + LOW.chest) / R);
  for (let c = 0; c < state.chests.length; c++) {
    const chest = state.chests[c];
    if (chest.from === i || (dot(pos, chest.at) < chestCos && !MARKED_CHESTS.includes(c))) continue;
    const d = apart(pos, chest.at);
    if (d < out.chestD) {
      out.chestD = d;
      out.chest = c;
    }
  }
  const coinCos = dcos(Math.min(air, reach + LOW.coin) / R);
  for (let c = 0; c < state.coins.length; c++) {
    const coin = state.coins[c];
    if (coin.value <= 0 || dot(pos, coin.at) < coinCos) continue;
    const d = apart(pos, coin.at);
    if (d < out.coinD) {
      out.coinD = d;
      out.coin = c;
    }
  }
  const siteCos = dcos(Math.min(air, reach + LOW.site) / R), sites = sea.geo.finds;
  for (let k = 0; k < sites.length; k++) {
    if (state.finds[k] !== 0 || (dot(pos, sites[k].pos) < siteCos && !MARKED_SITES.includes(k))) continue;
    const d = apart(pos, sites[k].pos);
    if (d < out.siteD) {
      out.siteD = d;
      out.site = k;
    }
  }
  return out;
}

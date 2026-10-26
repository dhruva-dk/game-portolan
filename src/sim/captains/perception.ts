import { fights } from '../combat.ts';
import type { Sea } from '../environment.ts';
import { gullMarks } from '../gull.ts';
import { dcos, dot, v3, type V3 } from '../math.ts';
import { R, TERRITORY, cellDir, horizonDistance } from '../sphere.ts';
import { SHIPS, type MatchState } from '../state.ts';
import { eyeReach, trailSeen, type Sight } from '../visibility.ts';

const LOW = { chest: horizonDistance(2), coin: horizonDistance(0.3), site: horizonDistance(3) };

export const NOTICE = { trail: 60, stride: 3 };

export interface Percept {
  ships: number;
  hulls: number;
  rival: number;
  rivalD: number;
  trail: number;
  trailCell: number;
  trailD: number;
  trailLen: number;
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

export const knows = (p: Percept, j: number): boolean => (p.ships & (1 << j)) !== 0;

const MARKED_SITES: number[] = [], MARKED_CHESTS: number[] = [], CELL = v3();

export function apart(a: V3, b: V3): number {
  return R * Math.sqrt(Math.max(0, 2 - 2 * dot(a, b)));
}

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

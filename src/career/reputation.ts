// Reputation and marketability (Phase B section 10, D38). Reputation, a crew's and a manager's, is 0 to 100. A crew's
// moves after each race by its ships' points against its league's mean, and at the season's end by a title,
// promotion and relegation. The player's own ship counts in the crew's like any ship; her points and sinkings also
// move the player's manager reputation directly. A manager's moves with their crew's standing against their elder's
// target (the player's too).
//
// Marketability, a gull's, 0 to 100: a podium and each sinking raise a captain's; every race it drifts back toward what
// stars and youth give (the player's toward their reputation). A crew's is 0.4 × its reputation + 0.6 × the mean of its
// two ships' captains' (the player's own on ship one). It feeds asks (asks.ts), pay captains (effective.ts) and patrons.

import { marketability } from './effective.ts';
import { standingOf } from './elders.ts';
import type { Gull } from './roles.ts';
import { age, stars } from './stars.ts';
import type { CareerState, Crew } from './state.ts';
import { TUNING } from './tuning.ts';

const R = TUNING.reputation,
  M = TUNING.marketability,
  X = TUNING.marketMoves;

const clamp = (x: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, x));
const tenth = (x: number) => Math.round(x * 10) / 10;
const in100 = (x: number) => tenth(clamp(x, 0, 100));

/** A crew's reputation move a race: its points against its league's mean. */
export const crewMove = (points: number, mean: number): number =>
  clamp(R.perPoint * (points - mean), -R.most, R.most);

/** A manager's reputation move a race: places better than the target. */
export const managerMove = (target: number, standing: number): number =>
  clamp(R.perPlace * (target - standing), -R.managerMost, R.managerMost);

/** The player's own ship's move of their reputation: her points against a ship's mean, and her sinkings. */
export const shipMove = (
  points: number,
  mean: number,
  sinkings: number
): number =>
  clamp(
    R.playerPerPoint * (points - mean) + R.playerSinking * sinkings,
    -R.playerMost,
    R.playerMost
  );

/** A crew's reputation move at the season's end. */
export const seasonMove = (
  title: boolean,
  promoted: boolean,
  relegated: boolean
): number =>
  (title ? R.title : 0) +
  (promoted ? R.promoted : 0) +
  (relegated ? R.relegated : 0);

/** What a race gave a ship: her points and sinkings, and whether she made the podium. */
export interface ShipRace {
  points: number;
  sinkings: number;
  podium: boolean;
}

/** A state after a race for a league's reputations: each crew's by its points (`points(crew)`, both ships') against the
 *  league's mean; each manager's by standing against target; the player's also by their own ship (`mine`, if the
 *  player's crew is in this league). Section 13 calls it after the standings. */
export function reputationAfterRace(
  s: CareerState,
  league: number,
  points: (crew: number) => number,
  mine: ShipRace | null
): CareerState {
  const l = s.leagues[league];
  const mean =
    l.crews.reduce((a, c) => a + points(c), 0) / Math.max(1, l.crews.length);
  const crews = [...s.crews];
  const gulls = [...s.gulls];
  let player = s.player;
  for (const id of l.crews) {
    const c = s.crews[id];
    crews[id] = {
      ...c,
      reputation: in100(c.reputation + crewMove(points(id), mean)),
    };
    const m = c.staff.manager;
    if (m === null) continue;
    let move = managerMove(c.target, standingOf(s, id));
    if (c.player && player && mine)
      move += shipMove(mine.points, mean / 2, mine.sinkings);
    gulls[m] = { ...gulls[m], reputation: in100(gulls[m].reputation + move) };
    if (c.player && player)
      player = { ...player, reputation: gulls[m].reputation };
  }
  return { ...s, crews, gulls, player };
}

/** A state with a crew's season's-end reputation moved. */
export function reputationAtEnd(
  s: CareerState,
  crew: number,
  title: boolean,
  promoted: boolean,
  relegated: boolean
): CareerState {
  const crews = [...s.crews];
  crews[crew] = {
    ...s.crews[crew],
    reputation: in100(
      s.crews[crew].reputation + seasonMove(title, promoted, relegated)
    ),
  };
  return { ...s, crews };
}

/** What a gull's marketability drifts toward: stars and youth (the player: their reputation). */
export function anchor(g: Gull, day: number): number {
  if (g.player) return g.reputation;
  return clamp(
    M.base + M.perStar * stars(g) + (age(g, day) < M.youthAge ? M.youth : 0),
    0,
    100
  );
}

/** A gull's marketability after a race: a podium and sinkings raise it, then it drifts toward its anchor. */
export function marketMove(
  g: Gull,
  race: ShipRace | null,
  day: number
): number {
  const raised =
    g.marketability +
    (race ? (race.podium ? X.podium : 0) + X.sinking * race.sinkings : 0);
  return in100(raised + X.drift * (anchor(g, day) - raised));
}

/** A state with a crew's two ships' sailors' marketability moved by their race (`ships`, by ship; null: did not sail). */
export function marketabilityAfterRace(
  s: CareerState,
  crew: number,
  ships: readonly [ShipRace | null, ShipRace | null]
): CareerState {
  const c = s.crews[crew];
  const gulls = [...s.gulls];
  ([0, 1] as const).forEach((ship) => {
    const id =
      c.player && ship === 0
        ? (s.player?.gull ?? null)
        : c.staff.ships[ship].captain;
    if (id === null) return;
    gulls[id] = {
      ...gulls[id],
      marketability: marketMove(gulls[id], ships[ship], s.day),
    };
  });
  return { ...s, gulls };
}

/** A crew's marketability: 0.4 × its reputation + 0.6 × the mean of its two ships' sailors'. */
export function crewMarketability(s: CareerState, c: Crew): number {
  const sailors = ([0, 1] as const).map((ship) =>
    c.player && ship === 0
      ? (s.player?.gull ?? null)
      : c.staff.ships[ship].captain
  );
  const known = sailors
    .filter((id): id is number => id !== null)
    .map((id) => marketability(s.gulls[id]));
  const mean =
    known.length === 0 ? 0 : known.reduce((a, b) => a + b, 0) / known.length;
  return tenth(X.crew * c.reputation + (1 - X.crew) * mean);
}

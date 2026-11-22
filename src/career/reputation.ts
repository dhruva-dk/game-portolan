// Reputation and marketability (Phase B section 10, D38). Reputation, a team's and a manager's, is 0 to 100. A team's
// moves after each race by its ships' points against its tier's mean, and at the season's end by a title,
// promotion and relegation. The player's own ship counts in the team's like any ship; her points and sinkings also
// move the player's manager reputation directly. A manager's moves with their team's standing against their chairman's
// target (the player's too).
//
// Marketability, a person's, 0 to 100: a podium and each sinking raise a driver's; every race it drifts back toward what
// stars and youth give (the player's toward their reputation). A team's is 0.4 × its reputation + 0.6 × the mean of its
// two ships' drivers' (the player's own on ship one). It feeds asks (asks.ts), pay drivers (effective.ts) and sponsors.

import { marketability } from './effective.ts';
import { standingOf } from './chairmen.ts';
import type { Person } from './roles.ts';
import { age, stars } from './stars.ts';
import type { CareerState, Team } from './state.ts';
import { TUNING } from './tuning.ts';

const R = TUNING.reputation,
  M = TUNING.marketability,
  X = TUNING.marketMoves;

const clamp = (x: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, x));
const tenth = (x: number) => Math.round(x * 10) / 10;
const in100 = (x: number) => tenth(clamp(x, 0, 100));

/** A team's reputation move a race: its points against its tier's mean. */
export const teamMove = (points: number, mean: number): number =>
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

/** A team's reputation move at the season's end. */
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

/** A state after a race for a tier's reputations: each team's by its points (`points(team)`, both ships') against the
 *  tier's mean; each manager's by standing against target; the player's also by their own ship (`mine`, if the
 *  player's team is in this tier). Section 13 calls it after the standings. */
export function reputationAfterRace(
  s: CareerState,
  tier: number,
  points: (team: number) => number,
  mine: ShipRace | null
): CareerState {
  const l = s.championships[tier];
  const mean =
    l.teams.reduce((a, c) => a + points(c), 0) / Math.max(1, l.teams.length);
  const teams = [...s.teams];
  const people = [...s.people];
  let player = s.player;
  for (const id of l.teams) {
    const c = s.teams[id];
    teams[id] = {
      ...c,
      reputation: in100(c.reputation + teamMove(points(id), mean)),
    };
    const m = c.staff.manager;
    if (m === null) continue;
    let move = managerMove(c.target, standingOf(s, id));
    if (c.player && player && mine)
      move += shipMove(mine.points, mean / 2, mine.sinkings);
    people[m] = {
      ...people[m],
      reputation: in100(people[m].reputation + move),
    };
    if (c.player && player)
      player = { ...player, reputation: people[m].reputation };
  }
  return { ...s, teams, people, player };
}

/** A state with a team's season's-end reputation moved. */
export function reputationAtEnd(
  s: CareerState,
  team: number,
  title: boolean,
  promoted: boolean,
  relegated: boolean
): CareerState {
  const teams = [...s.teams];
  teams[team] = {
    ...s.teams[team],
    reputation: in100(
      s.teams[team].reputation + seasonMove(title, promoted, relegated)
    ),
  };
  return { ...s, teams };
}

/** What a person's marketability drifts toward: stars and youth (the player: their reputation). */
export function anchor(g: Person, day: number): number {
  if (g.player) return g.reputation;
  return clamp(
    M.base + M.perStar * stars(g) + (age(g, day) < M.youthAge ? M.youth : 0),
    0,
    100
  );
}

/** A person's marketability after a race: a podium and sinkings raise it, then it drifts toward its anchor. */
export function marketMove(
  g: Person,
  race: ShipRace | null,
  day: number
): number {
  const raised =
    g.marketability +
    (race ? (race.podium ? X.podium : 0) + X.sinking * race.sinkings : 0);
  return in100(raised + X.drift * (anchor(g, day) - raised));
}

/** A state with a team's two ships' sailors' marketability moved by their race (`ships`, by ship; null: did not sail). */
export function marketabilityAfterRace(
  s: CareerState,
  team: number,
  ships: readonly [ShipRace | null, ShipRace | null]
): CareerState {
  const c = s.teams[team];
  const people = [...s.people];
  ([0, 1] as const).forEach((ship) => {
    const id =
      c.player && ship === 0
        ? (s.player?.person ?? null)
        : c.staff.ships[ship].driver;
    if (id === null) return;
    people[id] = {
      ...people[id],
      marketability: marketMove(people[id], ships[ship], s.day),
    };
  });
  return { ...s, people };
}

/** A team's marketability: 0.4 × its reputation + 0.6 × the mean of its two ships' sailors'. */
export function teamMarketability(s: CareerState, c: Team): number {
  const sailors = ([0, 1] as const).map((ship) =>
    c.player && ship === 0
      ? (s.player?.person ?? null)
      : c.staff.ships[ship].driver
  );
  const known = sailors
    .filter((id): id is number => id !== null)
    .map((id) => marketability(s.people[id]));
  const mean =
    known.length === 0 ? 0 : known.reduce((a, b) => a + b, 0) / known.length;
  return tenth(X.team * c.reputation + (1 - X.team) * mean);
}

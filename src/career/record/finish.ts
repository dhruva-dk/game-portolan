import type { MatchResult, ShipResult } from '../../sim/result.ts';
import { LEAGUE } from '../tuning.ts';

export const shipOf = (team: number, slot: number): number =>
  team * LEAGUE.shipsPerTeam + slot;

export const teamOfShip = (ship: number): number =>
  Math.floor(ship / LEAGUE.shipsPerTeam);

export const teamShips = (result: MatchResult, team: number): ShipResult[] =>
  result.ships.slice(shipOf(team, 0), shipOf(team + 1, 0));

export const bestPlaceOf = (result: MatchResult, team: number): number =>
  Math.min(...teamShips(result, team).map((ship) => ship.place));

export function placedTeam(result: MatchResult, place: number): number {
  const ship = result.ships.findIndex((s) => s.place === place);
  return teamOfShip(ship);
}

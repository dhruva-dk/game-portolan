import type { GunKind } from '../../sim/kinds.ts';
import type { Reason } from '../commands.ts';
import { seatStat } from '../lookup.ts';
import { buildCost, fitCost } from '../rules/build-cost.ts';
import type { CareerState, Line } from '../state.ts';
import { updateShip, updateTeam } from '../teams.ts';

const teamThrift = (state: CareerState, team: number): number | null =>
  seatStat(state, team, 'mechanic', 'thrift');

export function buildPrice(
  state: CareerState,
  team: number,
  slot: number,
  line: Line
): number {
  const { design, ships } = state.teams[team];
  return buildCost(
    design[line],
    ships[slot].fitted[line],
    teamThrift(state, team)
  );
}

export function fitPrice(
  state: CareerState,
  team: number,
  slot: number
): number {
  const { design, ships } = state.teams[team];
  return fitCost(design.gun, ships[slot].fitted.gun, teamThrift(state, team));
}

export function buildRefusal(
  state: CareerState,
  team: number,
  slot: number,
  line: Line
): Reason | null {
  const { design, ships, balance } = state.teams[team];
  if (ships[slot].fitted[line] >= design[line]) return 'same';
  return balance < buildPrice(state, team, slot, line) ? 'funds' : null;
}

export function build(
  state: CareerState,
  team: number,
  slot: number,
  line: Line
): CareerState {
  const price = buildPrice(state, team, slot, line);
  return updateTeam(state, team, (t) => ({
    ...t,
    balance: t.balance - price,
    ships: updateShip(t.ships, slot, (ship) => ({
      ...ship,
      fitted: { ...ship.fitted, [line]: t.design[line] },
    })),
  }));
}

export function fitRefusal(
  state: CareerState,
  team: number,
  slot: number,
  kind: GunKind
): Reason | null {
  const { unlocked, ships, balance } = state.teams[team];
  if (!unlocked.includes(kind)) return 'locked';
  if (ships[slot].gun === kind) return 'same';
  return balance < fitPrice(state, team, slot) ? 'funds' : null;
}

export function fitGun(
  state: CareerState,
  team: number,
  slot: number,
  kind: GunKind
): CareerState {
  const price = fitPrice(state, team, slot);
  return updateTeam(state, team, (t) => ({
    ...t,
    balance: t.balance - price,
    ships: updateShip(t.ships, slot, (ship) => ({
      gun: kind,
      fitted: { ...ship.fitted, gun: t.design.gun },
    })),
  }));
}

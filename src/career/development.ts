import type { GunKind } from '../sim/kinds.ts';
import { updateShip, updateTeam } from './change.ts';
import type { Reason } from './commands.ts';
import { seatStat } from './lookup.ts';
import { buildCost, fitCost } from './rules/development.ts';
import type { CareerState, Focus, Line } from './state.ts';

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

export function sameFocus(a: Focus, b: Focus): boolean {
  if (a === null || b === null) return a === b;
  if ('line' in a) return 'line' in b && a.line === b.line;
  return 'gun' in b && a.gun === b.gun;
}

export function focusRefusal(
  state: CareerState,
  team: number,
  focus: Focus
): Reason | null {
  const { unlocked, focus: current } = state.teams[team];
  if (focus !== null && 'gun' in focus && unlocked.includes(focus.gun))
    return 'locked';
  return sameFocus(current, focus) ? 'same' : null;
}

export const setFocus = (
  state: CareerState,
  team: number,
  focus: Focus
): CareerState =>
  updateTeam(state, team, (t) => ({
    ...t,
    focus:
      focus === null
        ? null
        : 'line' in focus
          ? { line: focus.line }
          : { gun: focus.gun },
  }));

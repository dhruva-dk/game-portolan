import type { Reason } from '../commands.ts';
import type { CareerState, Focus } from '../state.ts';
import { updateTeam } from '../teams.ts';

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
): CareerState => updateTeam(state, team, (t) => ({ ...t, focus }));

import type { Line, Team } from '../state.ts';

export function lineLeader(
  teams: readonly Pick<Team, 'design'>[],
  line: Line
): number | null {
  let leader: number | null = null;
  let best = -Infinity;
  teams.forEach(({ design }, team) => {
    if (design[line] > best) {
      best = design[line];
      leader = team;
    } else if (design[line] === best) leader = null;
  });
  return leader;
}

export const leaderAfter = (
  stored: number | null,
  current: number | null
): number | null => current ?? stored;

import { seatHolder } from '../lookup.ts';
import { focusValue, focusWeight, wantsGun } from '../rules/development.ts';
import { LINES, STATS, type CareerState, type Focus } from '../state.ts';

export function wantedFocus(state: CareerState, team: number): Focus {
  const designer = seatHolder(state, team, 'designer');
  if (designer === null) return null;
  const { design, taste, unlocked } = state.teams[team];
  const locked = taste.filter((kind) => !unlocked.includes(kind));
  if (locked.length > 0 && wantsGun(design.gun, unlocked.length))
    return { gun: locked[0] };
  const mean =
    LINES.reduce((sum, line) => sum + design[line], 0) / LINES.length;
  let best = LINES[0];
  let top = -Infinity;
  for (const line of LINES) {
    const skill = designer.stats[STATS.designer.indexOf(line)];
    const value = focusValue(
      skill,
      design[line],
      focusWeight(design[line], mean)
    );
    if (value > top) {
      top = value;
      best = line;
    }
  }
  return { line: best };
}

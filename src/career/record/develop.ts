import { perKind } from '../../sim/kinds.ts';
import { seatHolder } from '../lookup.ts';
import { gainRate, gainedLevel } from '../rules/gain.ts';
import { advancedUnlock, unlockDone } from '../rules/unlock.ts';
import {
  STATS,
  perLine,
  type CareerState,
  type Line,
  type Team,
} from '../state.ts';

function developTeam(state: CareerState, index: number): Team {
  const team = state.teams[index];
  const designer = seatHolder(state, index, 'designer');
  if (designer === null) return team;
  const skill = (line: Line): number =>
    designer.stats[STATS.designer.indexOf(line)];
  const design = perLine((line) =>
    gainedLevel(team.design[line], skill(line), gainRate(team.focus, line))
  );
  const { focus } = team;
  if (focus === null || !('gun' in focus)) return { ...team, design };
  const progress = advancedUnlock(team.unlockProgress[focus.gun], skill('gun'));
  const done = unlockDone(progress);
  return {
    ...team,
    design,
    unlockProgress: perKind((kind) =>
      kind === focus.gun ? progress : team.unlockProgress[kind]
    ),
    unlocked: done
      ? team.taste.filter(
          (kind) => kind === focus.gun || team.unlocked.includes(kind)
        )
      : team.unlocked,
    focus: done ? null : focus,
  };
}

export const develop = (state: CareerState): CareerState => ({
  ...state,
  teams: state.teams.map((_, index) => developTeam(state, index)),
});

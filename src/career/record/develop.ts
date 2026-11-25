import { perKind, type GunKind } from '../../sim/kinds.ts';
import { announce } from '../announce.ts';
import { seatHolder } from '../lookup.ts';
import {
  advancedUnlock,
  gainRate,
  gainedLevel,
  unlockDone,
} from '../rules/development.ts';
import {
  STATS,
  perLine,
  type CareerState,
  type Line,
  type NewsEvent,
  type Team,
} from '../state.ts';

type Developed = { team: Team; unlocked: GunKind | null };

function developTeam(state: CareerState, index: number): Developed {
  const team = state.teams[index];
  const designer = seatHolder(state, index, 'designer');
  if (designer === null) return { team, unlocked: null };
  const skill = (line: Line): number =>
    designer.stats[STATS.designer.indexOf(line)];
  const design = perLine((line) =>
    gainedLevel(team.design[line], skill(line), gainRate(team.focus, line))
  );
  const { focus } = team;
  if (focus === null || !('gun' in focus))
    return { team: { ...team, design }, unlocked: null };
  const progress = advancedUnlock(team.unlockProgress[focus.gun], skill('gun'));
  const done = unlockDone(progress);
  return {
    team: {
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
    },
    unlocked: done ? focus.gun : null,
  };
}

export function develop(state: CareerState): CareerState {
  const developed = state.teams.map((_, index) => developTeam(state, index));
  const unlocks = developed.flatMap(({ unlocked }, team): NewsEvent[] =>
    unlocked === null ? [] : [{ kind: 'unlocked', team, gun: unlocked }]
  );
  return announce(
    { ...state, teams: developed.map(({ team }) => team) },
    ...unlocks
  );
}

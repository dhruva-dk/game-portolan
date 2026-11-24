// The board: what the player may ask of their chairman, and the chairman's
// confidence as it stood after each of their races (Player.board, for the
// board's chart). Three asks, each once a season: money (the season's budget ×
// `money`, into the balance), a lower debt floor (by the budget × `floor`), an
// easier target (`places` further down, never past the last). Each is granted
// when the chairman's confidence stands at or above the bar his temper sets
// (Generosity for money and the floor: the generous lower; Ambition for the
// target: the ambitious higher), raised by `behind` a place the team stands
// behind its target. Granted, it costs confidence `granted`; refused, `refused`.

import type { BoardAsk } from '../office/command.ts';
import { paid } from './balance.ts';
import { accept, refuse, why, type Check, type Handlers } from './command.ts';
import { effective } from './effective.ts';
import { known } from './canon.ts';
import { lin } from './leadership.ts';
import { mine } from './post.ts';
import { inRole, unit } from './roles.ts';
import { standingOf } from './standings.ts';
import { withTeam, type CareerState, type Team } from './state.ts';
import { TUNING } from './tuning.ts';

const B = TUNING.board;

export const ASKS: readonly BoardAsk[] = ['money', 'floor', 'target'];

/** The confidence a chairman wants to grant an ask: his temper's bar, raised the further the team stands behind its target. */
export function askBar(s: CareerState, c: Team, ask: BoardAsk): number {
  const g = effective(inRole(s.people[c.staff.chairman], 'chairman'), null);
  const temper =
    ask === 'target'
      ? lin(B.ambition, unit(g.ambition))
      : lin(B.generosity, unit(g.generosity));
  const behind = Math.max(0, standingOf(s, c.id) - c.target);
  return Math.min(100, Math.round(temper + B.behind * behind));
}

/** What an ask would give: money into the balance, the floor lowered by, places the target eased by. */
export function askGives(s: CareerState, c: Team, ask: BoardAsk): number {
  if (ask === 'money') return Math.round(B.money * c.budget);
  if (ask === 'floor') return Math.round(B.floor * c.budget);
  return Math.min(B.places, s.championships[c.tier].teams.length - c.target);
}

/** Whether the player may put an ask to their chairman now. */
export function askCheck(s: CareerState, ask: BoardAsk): Check {
  const p = s.player;
  if (!p) return why('unfounded', 'Found a team first.');
  if (!ASKS.includes(ask)) return why('ask', 'No such request.');
  if (p.sacked) return why('sacked', 'You have no chairman to ask.');
  if (s.race?.started) return why('racing', 'The race is under way.');
  if (p.asks.some((a) => a.season === s.season && a.ask === ask))
    return why('asked', 'You have asked that once this season.');
  const c = s.teams[p.team];
  if (ask === 'target' && askGives(s, c, ask) <= 0)
    return why('last', 'Your target is the last place already.');
  return null;
}

export const BOARD: Handlers = {
  AskBoard: (s, k) => {
    const no = askCheck(s, k.ask);
    if (no) return refuse(no.code, no.sentence);
    const p = known(s.player),
      c = s.teams[p.team];
    const granted = c.confidence >= askBar(s, c, k.ask),
      gives = askGives(s, c, k.ask);
    const confidence = Math.max(
      0,
      c.confidence - (granted ? B.granted : B.refused)
    );
    let out = withTeam(s, {
      ...c,
      confidence,
      ...(granted && k.ask === 'floor'
        ? { debtFloor: c.debtFloor - gives }
        : {}),
      ...(granted && k.ask === 'target' ? { target: c.target + gives } : {}),
    });
    if (granted && k.ask === 'money')
      out = paid(out, c.id, -gives, {
        kind: 'board',
        what: 'the chairman’s money',
      });
    return accept({
      ...out,
      player: {
        ...p,
        asks: [...p.asks, { season: s.season, ask: k.ask, granted }],
      },
    });
  },
};

/** A state with the player's chairman's confidence after a race kept, for the board's chart. */
export function boardKept(s: CareerState): CareerState {
  const p = s.player,
    me = mine(s);
  if (!p || me === null) return s;
  const c = s.teams[me];
  return {
    ...s,
    player: {
      ...p,
      board: [
        ...p.board,
        {
          season: s.season,
          round: s.round,
          team: me,
          confidence: c.confidence,
          balance: c.balance,
          place: standingOf(s, me),
        },
      ],
    },
  };
}

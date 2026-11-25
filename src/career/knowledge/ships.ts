import { draw, knowledgeYear, raceKey, type Key } from '../draw.ts';
import { narrowed, shipRange } from '../rules/knowledge.ts';
import {
  YOURS,
  perLine,
  type CareerState,
  type Line,
  type Range,
  type Team,
} from '../state.ts';
import { RIVAL_SHIPS } from '../tuning.ts';

type ShipLines = Record<Line, Range>[];

type Drawing = {
  seed: string;
  year: number;
  team: number;
  width: number;
  after: readonly Key[];
};

const drawnRange = (
  drawing: Drawing,
  slot: number,
  line: Line,
  level: number
): Range =>
  shipRange(
    level,
    drawing.width,
    draw(
      drawing.seed,
      'line',
      drawing.year,
      drawing.team,
      slot,
      line,
      ...drawing.after
    )
  );

const drawnShips = (ships: Team['ships'], drawing: Drawing): ShipLines =>
  ships.map((ship, slot) =>
    perLine((line) => drawnRange(drawing, slot, line, ship.fitted[line]))
  );

export const leagueLines = (
  seed: string,
  teams: readonly Team[],
  year: number
): ShipLines[] =>
  teams.map((team, index) =>
    index === YOURS
      ? []
      : drawnShips(team.ships, {
          seed,
          year,
          team: index,
          width: RIVAL_SHIPS.width,
          after: [],
        })
  );

const withLines = (
  state: CareerState,
  lines: readonly ShipLines[]
): CareerState => ({
  ...state,
  knowledge: { ...state.knowledge, lines: [...lines] },
});

const changeLines = (
  state: CareerState,
  team: number,
  change: (lines: ShipLines) => ShipLines
): CareerState =>
  withLines(
    state,
    state.knowledge.lines.map((lines, index) =>
      index === team ? change(lines) : lines
    )
  );

export const redrawShipLines = (state: CareerState): CareerState =>
  withLines(state, leagueLines(state.seed, state.teams, knowledgeYear(state)));

export function redrawRepossessed(
  state: CareerState,
  team: number
): CareerState {
  if (team === YOURS) return state;
  return changeLines(state, team, () =>
    drawnShips(state.teams[team].ships, {
      seed: state.seed,
      year: knowledgeYear(state),
      team,
      width: RIVAL_SHIPS.width,
      after: ['repossessed', raceKey(state)],
    })
  );
}

export function redrawBuilt(
  state: CareerState,
  team: number,
  slot: number,
  line: Line
): CareerState {
  if (team === YOURS) return state;
  const drawing: Drawing = {
    seed: state.seed,
    year: knowledgeYear(state),
    team,
    width: RIVAL_SHIPS.builtWidth,
    after: ['built', raceKey(state)],
  };
  const level = state.teams[team].ships[slot].fitted[line];
  return changeLines(state, team, (lines) =>
    lines.map((ranges, s) =>
      s === slot
        ? { ...ranges, [line]: drawnRange(drawing, slot, line, level) }
        : ranges
    )
  );
}

export function narrowShipLines(state: CareerState): CareerState {
  const narrowing = (
    team: number,
    slot: number,
    line: Line,
    side: 'a' | 'b'
  ): number =>
    draw(
      state.seed,
      'narrow',
      state.season,
      raceKey(state),
      team,
      slot,
      line,
      side
    );
  return withLines(
    state,
    state.knowledge.lines.map((lines, team) =>
      lines.map((ranges, slot) =>
        perLine((line) =>
          narrowed(
            ranges[line],
            state.teams[team].ships[slot].fitted[line],
            narrowing(team, slot, line, 'a'),
            narrowing(team, slot, line, 'b')
          )
        )
      )
    )
  );
}

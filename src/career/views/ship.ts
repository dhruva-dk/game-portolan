import { KINDS, type GunKind } from '../../sim/kinds.ts';
import {
  buildPrice,
  buildRefusal,
  fitPrice,
  fitRefusal,
} from '../development.ts';
import { seatHolder, seatStat } from '../lookup.ts';
import { designGain, focusedRate } from '../rules/development.ts';
import {
  LINES,
  YOURS,
  type CareerState,
  type Line,
  type Team,
} from '../state.ts';
import { LEVEL_SPAN, UNLOCK } from '../tuning.ts';

export type Sailor =
  | { who: 'you' }
  | { who: 'driver'; portrait: number }
  | { who: 'uncle' };

type BuildWhy = 'same' | 'funds';

export type BuildView = {
  fit: GunKind | null;
  cost: number;
  gain: number;
  faint: boolean;
  why: BuildWhy | null;
};

type FitView = { kind: GunKind; fitted: boolean; build: BuildView };

export type ShipRowView = {
  slot: 0 | 1;
  sailor: Sailor;
  fitted: number;
  build: BuildView;
  fits: FitView[] | null;
};

export type KindView = {
  kind: GunKind;
  unlocked: boolean;
  progress: number;
  needed: number;
  unlocking: boolean;
  faint: boolean;
};

type StopView = { line: Line; focused: boolean };

export type ShipView = {
  line: Line;
  stop: number;
  stops: StopView[];
  designer: number | null;
  design: number;
  scale: { least: number; most: number };
  rows: [ShipRowView, ShipRowView];
  focus: { on: boolean; gain: number; faint: boolean };
  kinds: KindView[] | null;
  unlocking: GunKind | null;
};

export const shown = (level: number): number => Math.round(level);

const lineFocused = (team: Team, line: Line) =>
  team.focus !== null && 'line' in team.focus && team.focus.line === line;

const unlockingOf = (team: Team): GunKind | null =>
  team.focus !== null && 'gun' in team.focus ? team.focus.gun : null;

const gainOf = (design: number, fitted: number) =>
  fitted >= design ? 0 : Math.max(1, Math.round(design - fitted));

function sailorOf(state: CareerState, slot: 0 | 1): Sailor {
  if (slot === 0) return { who: 'you' };
  const driver = seatHolder(state, YOURS, 'driver');
  return driver === null
    ? { who: 'uncle' }
    : { who: 'driver', portrait: driver.portrait };
}

function buildOf(state: CareerState, slot: 0 | 1, line: Line): BuildView {
  const team = state.teams[YOURS],
    why = buildRefusal(state, YOURS, slot, line);
  return {
    fit: null,
    cost: why === 'same' ? 0 : buildPrice(state, YOURS, slot, line),
    gain: gainOf(team.design[line], team.ships[slot].fitted[line]),
    faint: why !== null,
    why: why === 'same' || why === 'funds' ? why : null,
  };
}

function fitOf(state: CareerState, slot: 0 | 1, kind: GunKind): BuildView {
  const team = state.teams[YOURS],
    why = fitRefusal(state, YOURS, slot, kind);
  return {
    fit: kind,
    cost: fitPrice(state, YOURS, slot),
    gain: gainOf(team.design.gun, team.ships[slot].fitted.gun),
    faint: why !== null,
    why: why === 'same' || why === 'funds' ? why : null,
  };
}

function rowOf(state: CareerState, slot: 0 | 1, line: Line): ShipRowView {
  const team = state.teams[YOURS],
    ship = team.ships[slot],
    build = buildOf(state, slot, line);
  return {
    slot,
    sailor: sailorOf(state, slot),
    fitted: shown(ship.fitted[line]),
    build,
    fits:
      line === 'gun'
        ? KINDS.filter((k) => team.unlocked.includes(k)).map((kind) => ({
            kind,
            fitted: ship.gun === kind,
            build: ship.gun === kind ? build : fitOf(state, slot, kind),
          }))
        : null,
  };
}

function kindsOf(team: Team): KindView[] {
  const unlocking = unlockingOf(team);
  return KINDS.map((kind) => {
    const unlocked = team.unlocked.includes(kind);
    return {
      kind,
      unlocked,
      progress: unlocked
        ? UNLOCK.needed
        : Math.floor(Math.min(UNLOCK.needed, team.unlockProgress[kind])),
      needed: UNLOCK.needed,
      unlocking: unlocking === kind,
      faint: !unlocked,
    };
  });
}

export function shipView(state: CareerState, line: Line): ShipView {
  const team = state.teams[YOURS],
    designer = seatHolder(state, YOURS, 'designer'),
    skill = seatStat(state, YOURS, 'designer', line);
  const gain = skill === null ? 0 : designGain(skill, focusedRate());
  return {
    line,
    stop: LINES.indexOf(line),
    stops: LINES.map((l) => ({ line: l, focused: lineFocused(team, l) })),
    designer: designer?.portrait ?? null,
    design: shown(team.design[line]),
    scale: LEVEL_SPAN,
    rows: [rowOf(state, 0, line), rowOf(state, 1, line)],
    focus: {
      on: lineFocused(team, line),
      gain: Math.round(gain * 10) / 10,
      faint: designer === null,
    },
    kinds: line === 'gun' ? kindsOf(team) : null,
    unlocking: unlockingOf(team),
  };
}

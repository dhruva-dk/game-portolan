import { DYES, EMBLEMS, PATTERNS, type Livery } from '../../world/livery.ts';
import type { Reason } from '../commands.ts';
import { repaintRefusal } from '../repaint.ts';
import { sameLivery } from '../start.ts';
import { YOURS, type CareerState } from '../state.ts';
import { REPAINT } from '../tuning.ts';
import type { Swatch } from './new-career.ts';

export type PaintEdit = { livery: Livery; emblem: number };

export type PaintView = {
  livery: Livery;
  emblem: number;
  dyes: readonly Swatch[];
  patterns: readonly Swatch[];
  emblems: readonly Swatch[];
  changed: boolean;
  cost: number;
  faint: boolean;
  why: Reason | null;
};

const within = (index: number, count: number, fallback: number) =>
  Number.isInteger(index) && index >= 0 && index < count ? index : fallback;

function takenBy(state: CareerState, livery: Livery): boolean {
  return state.teams.some(
    (team, index) => index !== YOURS && sameLivery(team.livery, livery)
  );
}

export function paintView(
  state: CareerState,
  edit: PaintEdit | null = null
): PaintView {
  const team = state.teams[YOURS],
    asked = edit ?? { livery: team.livery, emblem: team.emblem };
  const livery = {
      dye: within(asked.livery.dye, DYES.length, team.livery.dye),
      pattern: within(
        asked.livery.pattern,
        PATTERNS.length,
        team.livery.pattern
      ),
    },
    emblem = within(asked.emblem, EMBLEMS, team.emblem);
  const why = repaintRefusal(state, YOURS, livery, emblem);
  return {
    livery,
    emblem,
    dyes: DYES.map((_, dye) => ({
      chosen: dye === livery.dye,
      faint: takenBy(state, { dye, pattern: livery.pattern }),
    })),
    patterns: PATTERNS.map((_, pattern) => ({
      chosen: pattern === livery.pattern,
      faint: takenBy(state, { dye: livery.dye, pattern }),
    })),
    emblems: Array.from({ length: EMBLEMS }, (_, i) => ({
      chosen: i === emblem,
      faint: false,
    })),
    changed: !sameLivery(livery, team.livery) || emblem !== team.emblem,
    cost: REPAINT.cost,
    faint: why !== null,
    why,
  };
}

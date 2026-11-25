import {
  edition,
  editionRace,
  headlineRuns,
  type EditionKind,
  type Run,
} from '../paper.ts';
import type { CareerState, Focus, NewsKind } from '../state.ts';
import { LEVEL_SPAN, UNLOCK } from '../tuning.ts';
import { DATELINES, MASTHEAD } from '../wordings.ts';

export type { EditionKind, Run };

export type PaperHeadline = { kind: NewsKind; runs: Run[] };

export type WorkshopStrip = {
  focus: NonNullable<Focus>;
  before: number;
  after: number;
  whole: number;
};

export type PaperView = {
  kind: EditionKind;
  title: string;
  dateline: string;
  headlines: PaperHeadline[];
  workshop: WorkshopStrip | null;
};

function workshopOf(state: CareerState): WorkshopStrip | null {
  const shop = state.lastRace?.workshop ?? null;
  if (shop === null) return null;
  return {
    focus: shop.focus,
    before: Math.round(shop.before),
    after: Math.round(shop.after),
    whole: 'line' in shop.focus ? LEVEL_SPAN.most : UNLOCK.needed,
  };
}

function datelineOf(state: CareerState, kind: EditionKind): string {
  const { season, race } = editionRace(state);
  return (kind === 'season' ? DATELINES.season : DATELINES.race)
    .replace('{season}', String(season))
    .replace('{race}', String(race));
}

export function paperView(state: CareerState): PaperView {
  const paper = edition(state);
  return {
    kind: paper.kind,
    title: MASTHEAD,
    dateline: datelineOf(state, paper.kind),
    headlines: paper.items.map((item) => ({
      kind: item.kind,
      runs: headlineRuns(paper.kind, item),
    })),
    workshop: paper.kind === 'race' ? workshopOf(state) : null,
  };
}

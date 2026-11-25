import { DYES, EMBLEMS, PATTERNS, type Livery } from '../../world/livery.ts';
import { TEAM_NAMES } from '../names.ts';
import { NAMES } from '../tuning.ts';

export const NEW_CAREER = {
  name: { least: 1, most: NAMES.longest },
  seed: { least: 1, most: 24 },
} as const;

export type NewCareerForm = {
  name: string;
  seed: string;
  livery: Livery;
  emblem: number;
  dyed: boolean;
};

export type NewCareerOptions = {
  seed: string;
  name: string;
  livery: Livery;
  emblem: number;
};

export type Swatch = { chosen: boolean; faint: boolean };

export type TextView = { value: string; least: number; most: number };

export type NewCareerView = {
  title: string;
  form: NewCareerForm;
  name: TextView;
  seed: TextView;
  dyes: readonly Swatch[];
  patterns: readonly Swatch[];
  emblems: readonly Swatch[];
  livery: Livery;
  wearing: Livery | null;
  emblem: number;
  start: { faint: boolean; twoTap: boolean };
  close: boolean;
  options: NewCareerOptions | null;
};

const TITLE = 'Portolan';

const FIRST = { livery: { dye: 0, pattern: 0 }, emblem: 0 } as const;

export const prefilled = (rolled: string): NewCareerForm => ({
  name: TEAM_NAMES[0] ?? '',
  seed: rolled.slice(0, NEW_CAREER.seed.most),
  livery: { ...FIRST.livery },
  emblem: FIRST.emblem,
  dyed: false,
});

const within = (index: number, count: number, fallback: number) =>
  Number.isInteger(index) && index >= 0 && index < count ? index : fallback;

const swatches = (count: number, chosen: number): Swatch[] =>
  Array.from({ length: count }, (_, i) => ({
    chosen: i === chosen,
    faint: false,
  }));

const text = (
  value: string,
  limits: { least: number; most: number }
): TextView => ({ value: value.slice(0, limits.most), ...limits });

export function newCareerView(
  form: NewCareerForm | null,
  o: { rolled: string; existing: boolean }
): NewCareerView {
  const asked = form ?? prefilled(o.rolled);
  const livery = {
      dye: within(asked.livery.dye, DYES.length, FIRST.livery.dye),
      pattern: within(
        asked.livery.pattern,
        PATTERNS.length,
        FIRST.livery.pattern
      ),
    },
    emblem = within(asked.emblem, EMBLEMS, FIRST.emblem);
  const name = text(asked.name, NEW_CAREER.name),
    seed = text(asked.seed, NEW_CAREER.seed),
    typed = { name: name.value.trim(), seed: seed.value.trim() };
  const ready =
    typed.name.length >= NEW_CAREER.name.least &&
    typed.seed.length >= NEW_CAREER.seed.least;
  return {
    title: TITLE,
    form: {
      name: name.value,
      seed: seed.value,
      livery,
      emblem,
      dyed: asked.dyed,
    },
    name,
    seed,
    dyes: swatches(DYES.length, livery.dye),
    patterns: swatches(PATTERNS.length, livery.pattern),
    emblems: swatches(EMBLEMS, emblem),
    livery,
    wearing: asked.dyed ? livery : null,
    emblem,
    start: { faint: !ready, twoTap: o.existing },
    close: o.existing,
    options: ready
      ? { seed: typed.seed, name: typed.name, livery, emblem }
      : null,
  };
}

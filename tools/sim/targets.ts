import type { TableRow, Told } from './career.ts';

export type CareerRecord = {
  told: readonly Told[];
  table: readonly TableRow[];
};

export type Targets = {
  careers: number;
  seasons: number;
  top10: { each: (number | null)[]; median: number | null };
  standing: { season: number; each: number[] }[];
  lowest: { races: number; each: number[]; least: number };
  rivals: number;
  richest: { each: number[]; most: number };
  levels: { top: number; bottom: number };
  stars: { top: number };
};

const FIVE = 5,
  TOP = 10;

const mean = (xs: readonly number[]): number =>
  xs.length ? xs.reduce((sum, x) => sum + x, 0) / xs.length : 0;

const seasonsOf = (r: CareerRecord) =>
  r.told.flatMap((t) => (t.kind === 'season' ? [t.figures] : []));

const racesOf = (r: CareerRecord) =>
  r.told.flatMap((t) => (t.kind === 'race' ? [t.line] : []));

export function targets(records: readonly CareerRecord[]): Targets {
  const seasons = Math.min(...records.map((r) => seasonsOf(r).length));
  const reached = records.map((r) => {
    const at = seasonsOf(r).find((f) => f.standing <= TOP);
    return at ? at.season : null;
  });
  const sorted = reached.map((s) => s ?? Infinity).sort((a, b) => a - b)[
    reached.length >> 1
  ];
  const first = records.map((r) =>
    Math.min(
      ...racesOf(r)
        .filter((l) => l.season === 1 && l.race <= FIVE)
        .map((l) => l.balance)
    )
  );
  const richest = records.map((r) =>
    Math.max(...r.table.map((row) => row.balance))
  );
  const top = records.flatMap((r) => r.table.slice(0, FIVE)),
    bottom = records.flatMap((r) => r.table.slice(-FIVE));
  return {
    careers: records.length,
    seasons,
    top10: { each: reached, median: Number.isFinite(sorted) ? sorted : null },
    standing: Array.from({ length: seasons }, (_, k) => ({
      season: k + 1,
      each: records.map((r) => seasonsOf(r)[k].standing),
    })),
    lowest: { races: FIVE, each: first, least: Math.min(...first) },
    rivals: mean(records.flatMap((r) => seasonsOf(r).map((f) => f.rivals))),
    richest: { each: richest, most: Math.max(...richest) },
    levels: {
      top: mean(top.map((row) => row.level)),
      bottom: mean(bottom.map((row) => row.level)),
    },
    stars: { top: mean(top.map((row) => row.stars)) },
  };
}

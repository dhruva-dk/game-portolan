import type { MatchResult } from '../sim/end.ts';
import type { Expect, Mind } from '../sim/state.ts';
import { REGIONS } from '../sim/world/regions.ts';
import { BINS, GRUDGE, LEARNING, type Career, type Learned } from './state.ts';
import { habitsOf, type Habits, type Voyage } from './voyage.ts';

const toward = (w: number, target: number, rate: number): number => w + Math.trunc(((target - w) * rate) / 100);
export const binOf = (edges: readonly number[], x: number): number => edges.filter((e) => e <= x).length;
export const FIGHTS = BINS.run.length + 1;
const argmax = (w: readonly number[]): number => w.reduce((best, x, i) => (x > w[best] ? i : best), 0);
const any = (w: readonly number[]): boolean => w.some((x) => x > 0);

function weigh(w: number[], at: readonly number[] | null): void {
  for (let i = 0; i < w.length; i++) w[i] = at ? toward(w[i], at.includes(i) ? LEARNING.full : 0, LEARNING.learn) : toward(w[i], 0, LEARNING.fade);
}

const show = (x: number | null | undefined, bin: (x: number) => number): number[] | null => (x === null || x === undefined ? null : [bin(x)]);

export function learn(h: Learned, seen: Habits | null): void {
  const measure = (w: readonly number[], was: number, x: number): number => (any(w) ? toward(was, x, LEARNING.learn) : x);
  if (seen) {
    if (seen.loop !== null) h.loopU = measure(h.loop, h.loopU, seen.loop);
    h.raids = measure(h.raid, h.raids, 10 * seen.raids);
    if (seen.run !== null && seen.run > 0) h.runAt = measure(h.run.slice(0, FIGHTS), h.runAt, seen.run);
    if (seen.storm !== null) h.stormU = measure(h.storm, h.stormU, seen.storm);
  }
  weigh(h.breakOff, show(seen?.breakOff, (r) => r));
  weigh(h.loop, show(seen?.loop, (u) => binOf(BINS.loop, u)));
  weigh(h.raid, show(seen?.raids, (n) => binOf(BINS.raid, n)));
  weigh(h.run, show(seen?.run, (p) => (p > 0 ? binOf(BINS.run, p) : FIGHTS)));
  weigh(h.storm, show(seen?.storm, (u) => binOf(BINS.storm, u)));
  weigh(h.fittings, seen ? seen.fittings : null);
}

export function remember(next: Career, sailed: readonly number[], result: MatchResult, voyage?: Voyage): void {
  sailed.forEach((id, k) => {
    const m = next.minds[id], f = k + 1;
    m.shared++;
    if (result.ships[0].by === f) m.sank++;
    if (result.ships[f].by === 0) {
      m.sunk++;
      m.grudge = Math.min(GRUDGE.max, m.grudge + 1);
    } else m.grudge = 0;
  });
  if (!voyage) return;
  const seen = habitsOf(voyage);
  learn(next.profile, seen);
  next.minds.forEach((m, id) => learn(m.habits, sailed.includes(id) ? seen : null));
  inkChart(next, voyage);
}

export function inkChart(next: Career, voyage: Voyage): void {
  const { seen, found, named } = next.chart;
  for (let i = 0; i < seen.length; i++) seen[i] |= voyage.seen[i];
  for (let k = 0; k < found.length; k++) found[k] |= voyage.found[k];
  voyage.entered.forEach((tick, r) => {
    if (tick >= 0 && named[r].match < 0) named[r] = { match: next.match, tick };
  });
}

export const knownSites = (career: Career): number[] => Array.from(career.chart.found).flatMap((f, k) => (f ? [k] : []));

const expect = (w: readonly number[], value: number): Expect => {
  const confidence = w[argmax(w)];
  return { value: confidence > 0 ? value : -1, confidence };
};

const favoured = (h: Learned): number[] =>
  h.fittings.flatMap((w, k) => (w >= LEARNING.known ? [k] : [])).sort((a, b) => h.fittings[b] - h.fittings[a] || a - b);

export function mindOf(career: Career, id: number): Mind {
  const m = career.minds[id], h = m.habits;
  return {
    gentle: career.match === 0,
    grudge: m.grudge,
    breakOff: expect(h.breakOff, argmax(h.breakOff)),
    loop: expect(h.loop, h.loopU),
    raids: expect(h.raid, h.raids),
    run: expect(h.run, argmax(h.run) === FIGHTS ? 0 : h.runAt),
    storm: expect(h.storm, h.stormU),
    fittings: favoured(h),
  };
}

const FITTING_NAMES: readonly string[] = [
  'none', 'stem post', 'iron ram', 'cutwater', 'light guns', 'long guns', 'swivel guns', 'chain shot', 'heated shot', 'stern chasers', 'powder kegs', 'mortar', 'spare canvas', 'lateen mizzen', 'storm sails', 'copper sheathing', 'doubled planking', 'pumps', 'stern glass', 'crows nest', 'lookout',
];

const where = (r: number): string => REGIONS[r].name.replace(/^The /, 'the ');

export const CARD = {
  breakOff: (r: number): string => `Has learned you break off at ${where(r)}.`,
  loop: ['Has learned you draw small loops.', 'Has learned you draw middling loops.', 'Has learned you draw large loops.', 'Has learned you draw huge loops.'],
  raid: ['Has learned you leave trails alone.', 'Has learned you raid trails now and then.', 'Has learned you raid trails.'],
  run: ['Has learned you run only when nearly sunk.', 'Has learned you run when half wrecked.', 'Has learned you run at the first hit.', 'Has learned you stand and fight.'],
  storm: ['Has learned you linger in the storm.', 'Has learned you skirt the storm’s edge.', 'Has learned you run early from the storm.'],
  fitting: (k: number): string => `Has learned you favour ${FITTING_NAMES[k]}.`,
  grudge: ['Remembers you sank it, and hunts you.', 'Sunk by you twice running, it hunts you hard.', 'Sunk by you again and again, it hunts you hardest.'],
  record: (sank: number, sunk: number, shared: number): string => `Sank you ${sank}, sunk by you ${sunk}, in ${shared} ${shared === 1 ? 'match' : 'matches'} together.`,
  stranger: 'Has never met you.',
} as const;

export function recordLine(career: Career, id: number): string {
  const { sank, sunk, shared } = career.minds[id];
  return shared > 0 ? CARD.record(sank, sunk, shared) : CARD.stranger;
}

export function cardLines(career: Career, id: number): string[] {
  const m = career.minds[id], h = m.habits, said: { line: string; weight: number }[] = [];
  const habit = (w: readonly number[], line: (bin: number) => string): void => {
    const b = argmax(w);
    if (w[b] >= LEARNING.known) said.push({ line: line(b), weight: w[b] });
  };
  habit(h.breakOff, CARD.breakOff);
  habit(h.loop, (b) => CARD.loop[b]);
  habit(h.raid, (b) => CARD.raid[b]);
  habit(h.run, (b) => CARD.run[b]);
  habit(h.storm, (b) => CARD.storm[b]);
  habit(h.fittings, CARD.fitting);
  said.sort((a, b) => b.weight - a.weight);
  return [...(m.grudge > 0 ? [CARD.grudge[m.grudge - 1]] : []), ...said.map((s) => s.line), recordLine(career, id)];
}

export const cardLine = (career: Career, id: number): string => cardLines(career, id)[0];

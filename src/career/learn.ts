// Captains learn the player (PROMPT.md, Captains learn the player; The career chart; progress.html A4): the career's
// profile of how the player plays and each captain's own memory of it, moved by the matches they share and fading
// with the matches they do not (state.ts LEARNING); a captain's memory of being sunk; what each brings to its next
// match (Mind, which the captains' brains read through the match setup, so the sim stays pure); the line its card
// says it in; and the career chart inked from the player's voyage.
import type { MatchResult } from '../sim/end.ts';
import type { Expect, Mind } from '../sim/state.ts';
import { REGIONS } from '../sim/world/regions.ts';
import { BINS, GRUDGE, LEARNING, type Career, type Learned } from './state.ts';
import { habitsOf, type Habits, type Voyage } from './voyage.ts';

const toward = (w: number, target: number, rate: number): number => w + Math.trunc(((target - w) * rate) / 100);
/** The bin of `x` by its bins' lower edges (state.ts BINS). */
export const binOf = (edges: readonly number[], x: number): number => edges.filter((e) => e <= x).length;
/** The bin of the habit of running in which the player stands and fights. */
export const FIGHTS = BINS.run.length + 1;
const argmax = (w: readonly number[]): number => w.reduce((best, x, i) => (x > w[best] ? i : best), 0);
const any = (w: readonly number[]): boolean => w.some((x) => x > 0);

/** Move weights `w` toward the bins a match showed (`at`, their indices) at the learning rate, or, shown nothing (null), fade them. */
function weigh(w: number[], at: readonly number[] | null): void {
  for (let i = 0; i < w.length; i++) w[i] = at ? toward(w[i], at.includes(i) ? LEARNING.full : 0, LEARNING.learn) : toward(w[i], 0, LEARNING.fade);
}

const show = (x: number | null | undefined, bin: (x: number) => number): number[] | null => (x === null || x === undefined ? null : [bin(x)]);

/**
 * `h` after a match that showed `seen` of the player's habits (voyage.ts habitsOf), or (null) one it did not see: each
 * habit's weights learn or fade (LEARNING), and the measure a brain steers by moves the same share of the way toward
 * the match's, or starts at it.
 */
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

/**
 * The career's memory after a match (progress.ts applyResult, before it counts the match), `sailed` the captains in it
 * in fleet order: from the result, each one's record against the player and its grudge (GRUDGE); from the player's
 * voyage, when given, the profile and the captains in the match learning, the rest fading, and the chart inked.
 */
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

/** Ink the career chart with what the player saw on `voyage` in match `next.match`: the cells, the find sites, the regions' names. */
export function inkChart(next: Career, voyage: Voyage): void {
  const { seen, found, named } = next.chart;
  for (let i = 0; i < seen.length; i++) seen[i] |= voyage.seen[i];
  for (let k = 0; k < found.length; k++) found[k] |= voyage.found[k];
  voyage.entered.forEach((tick, r) => {
    if (tick >= 0 && named[r].match < 0) named[r] = { match: next.match, tick };
  });
}

/** The find sites the career chart marks, for the next match's chart and HUD (MatchSetup.known). */
export const knownSites = (career: Career): number[] => Array.from(career.chart.found).flatMap((f, k) => (f ? [k] : []));

const expect = (w: readonly number[], value: number): Expect => {
  const confidence = w[argmax(w)];
  return { value: confidence > 0 ? value : -1, confidence };
};

/** The FITTING kinds `h` is sure the player favours, surest first. */
const favoured = (h: Learned): number[] =>
  h.fittings.flatMap((w, k) => (w >= LEARNING.known ? [k] : [])).sort((a, b) => h.fittings[b] - h.fittings[a] || a - b);

/** What captain `id` brings to the career's next match (MatchSetup.minds). */
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

/** How a card names each FITTING kind (tables.ts), by kind. */
const FITTING_NAMES: readonly string[] = [
  'none', 'stem post', 'iron ram', 'cutwater', 'light guns', 'long guns', 'swivel guns', 'chain shot', 'heated shot', 'stern chasers', 'powder kegs', 'mortar', 'spare canvas', 'lateen mizzen', 'storm sails', 'copper sheathing', 'doubled planking', 'pumps', 'stern glass', 'crows nest', 'lookout',
];

/** A region's name as it reads mid-sentence. */
const where = (r: number): string => REGIONS[r].name.replace(/^The /, 'the ');

/** What a captain's card says (PROMPT.md, Captains learn the player): of each habit by its bin (state.ts BINS), of a grudge by its depth, of its record. */
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

/** Captain `id`'s record against the player, as its card shows it. */
export function recordLine(career: Career, id: number): string {
  const { sank, sunk, shared } = career.minds[id];
  return shared > 0 ? CARD.record(sank, sunk, shared) : CARD.stranger;
}

/**
 * Every line captain `id`'s card could say, the most salient first: its grudge; then each habit it knows (LEARNING.known),
 * surest first (ties in the order breakOff, loop, raid, run, storm, fittings); then its record, or that it has never met the player.
 */
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

/** The one line captain `id`'s card says before a match. */
export const cardLine = (career: Career, id: number): string => cardLines(career, id)[0];

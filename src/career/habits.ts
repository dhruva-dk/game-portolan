// Captains learn your habits and hold grudges, as in the old game (ported from the old career's learn.ts).
// Each habit is a set of weights, one per bin, from 0 to LEARNING.full. A match together moves every weight
// 40% of the way toward what the captain saw; a match apart fades them 15% toward nothing. A weight at
// LEARNING.known or above is a habit the captain knows, and plays against.
import { REGION_COUNT, REGIONS } from '../sim/world/index.ts';

export const LEARNING = { learn: 40, fade: 15, known: 500, full: 1000 } as const;

/** Bin edges: hull % when you break off, seconds you stay out in the Storm each time, metres you fight at. */
export const BINS = { run: [30, 60], storm: [3, 10], range: [80, 160] } as const;

export const WEAPON_CLASSES = ['cannon', 'harpoon', 'mortar', 'repeater', 'scatter', 'broadside'] as const;
export type WeaponClass = (typeof WEAPON_CLASSES)[number];
const WEAPON_NAMES = ['cannon', 'harpoon', 'mortar', 'repeater', 'scatter gun', 'broadside'];

export const GRUDGE = { max: 3 } as const;

/** What the player did in one match, measured by the simulation. Any habit not shown is null. */
export interface PlayerHabits {
  /** The region the player dived into from the Gale. */
  drop: number | null;
  /** Hull % when the player broke off a fight; 0 when they fought on to the end. */
  runAt: number | null;
  /**
   * Average seconds the player stayed out in the Storm each time they were caught in it, the simulation's own measure
   * (learning.ts); 0 when the Storm closed on them and they never let it catch them.
   */
  storm: number | null;
  /** Average metres the player's hits landed at. */
  range: number | null;
  /** The weapon class (index into WEAPON_CLASSES) that dealt most of the player's damage. */
  weapon: number | null;
}

export const NO_HABITS: PlayerHabits = { drop: null, runAt: null, storm: null, range: null, weapon: null };

/** One captain's (or the player's own) learned picture of the player. */
export interface Learned {
  drop: number[];
  run: number[];
  storm: number[];
  range: number[];
  weapon: number[];
  /** Running measures behind the bins. */
  runAt: number;
  stormU: number;
  rangeU: number;
}

/** The bin for "stands and fights" in Learned.run. */
export const FIGHTS = BINS.run.length + 1;

const zeros = (n: number): number[] => new Array<number>(n).fill(0);

export const newLearned = (): Learned => ({
  drop: zeros(REGION_COUNT), run: zeros(BINS.run.length + 2), storm: zeros(BINS.storm.length + 1), range: zeros(BINS.range.length + 1),
  weapon: zeros(WEAPON_CLASSES.length), runAt: 0, stormU: 0, rangeU: 0,
});

const trunc = (x: number): number => (x < 0 ? -Math.floor(-x) : Math.floor(x));
const toward = (w: number, target: number, rate: number): number => w + trunc(((target - w) * rate) / 100);
export const binOf = (edges: readonly number[], x: number): number => edges.filter((e) => e <= x).length;
const argmax = (w: readonly number[]): number => w.reduce((best, x, i) => (x > w[best] ? i : best), 0);
const any = (w: readonly number[]): boolean => w.some((x) => x > 0);

function weigh(w: number[], at: number | null): void {
  for (let i = 0; i < w.length; i++) w[i] = at !== null ? toward(w[i], i === at ? LEARNING.full : 0, LEARNING.learn) : toward(w[i], 0, LEARNING.fade);
}

const inRange = (x: number | null, n: number): number | null => (x !== null && Number.isInteger(x) && x >= 0 && x < n ? x : null);

/** Learn from one match together (seen) or fade after one apart (null). */
export function learn(h: Learned, seen: PlayerHabits | null): void {
  const measure = (w: readonly number[], was: number, x: number): number => (any(w) ? toward(was, Math.round(x), LEARNING.learn) : Math.round(x));
  const s = seen ?? NO_HABITS;
  if (s.runAt !== null && s.runAt > 0) h.runAt = measure(h.run.slice(0, FIGHTS), h.runAt, s.runAt);
  if (s.storm !== null) h.stormU = measure(h.storm, h.stormU, s.storm);
  if (s.range !== null) h.rangeU = measure(h.range, h.rangeU, s.range);
  if (seen === null) {
    for (const w of [h.drop, h.run, h.storm, h.range, h.weapon]) weigh(w, null);
    return;
  }
  weigh(h.drop, inRange(s.drop, REGION_COUNT));
  weigh(h.run, s.runAt === null ? null : s.runAt > 0 ? binOf(BINS.run, s.runAt) : FIGHTS);
  weigh(h.storm, s.storm === null ? null : binOf(BINS.storm, s.storm));
  weigh(h.range, s.range === null ? null : binOf(BINS.range, s.range));
  weigh(h.weapon, inRange(s.weapon, WEAPON_CLASSES.length));
}

/** What a captain expects of the player: a value, and how sure it is (0 to LEARNING.full). Value is -1 when it has no idea. */
export interface Expect {
  value: number;
  confidence: number;
}

/** Everything a captain knows of the player, handed to the bot in its FleetEntry. */
export interface Knowledge {
  /** Region index the player tends to dive into. */
  drop: Expect;
  /** Hull % at which the player runs; 0 means they stand and fight. */
  runAt: Expect;
  /** Seconds the player stays out in the Storm each time it catches them. */
  storm: Expect;
  /** Metres the player likes to fight at. */
  range: Expect;
  /** Weapon class index the player favours. */
  weapon: Expect;
}

const expect = (w: readonly number[], value: number): Expect => {
  const confidence = w[argmax(w)];
  return { value: confidence > 0 ? value : -1, confidence };
};

export function knowledgeOf(h: Learned): Knowledge {
  return {
    drop: expect(h.drop, argmax(h.drop)),
    runAt: expect(h.run, argmax(h.run) === FIGHTS ? 0 : h.runAt),
    storm: expect(h.storm, h.stormU),
    range: expect(h.range, h.rangeU),
    weapon: expect(h.weapon, argmax(h.weapon)),
  };
}

/** A gentle captain knows nothing, whatever it has seen. */
export const KNOWS_NOTHING: Knowledge = {
  drop: { value: -1, confidence: 0 }, runAt: { value: -1, confidence: 0 }, storm: { value: -1, confidence: 0 },
  range: { value: -1, confidence: 0 }, weapon: { value: -1, confidence: 0 },
};

/** A grudge after a match together: sinking it deepens the grudge; a match where you leave it be eases it one step. */
export const nextGrudge = (grudge: number, sunkByYou: boolean): number =>
  sunkByYou ? Math.min(GRUDGE.max, grudge + 1) : Math.max(0, grudge - 1);

const where = (r: number): string => REGIONS[r].name;

/** The lines a rival's card can say, in plain words. */
export const CARD = {
  drop: (r: number): string => `Has learned you dive into ${where(r)}.`,
  run: ['Has learned you run only when nearly sunk.', 'Has learned you run when half wrecked.', 'Has learned you run at the first hit.', 'Has learned you stand and fight.'],
  storm: ['Has learned you run early from the Storm.', 'Has learned you skirt the Storm’s edge.', 'Has learned you linger in the Storm.'],
  range: ['Has learned you fight up close.', 'Has learned you fight at middle range.', 'Has learned you fight from long range.'],
  weapon: (k: number): string => `Has learned you favour the ${WEAPON_NAMES[k]}.`,
  grudge: ['Remembers you sank it, and hunts you.', 'Sunk by you twice running, it hunts you hard.', 'Sunk by you again and again, it hunts you hardest.'],
  stranger: 'Has never met you.',
} as const;

/** The habit lines a learned picture supports, surest first. */
export function habitLines(h: Learned): string[] {
  const said: { line: string; weight: number }[] = [];
  const habit = (w: readonly number[], line: (bin: number) => string): void => {
    const b = argmax(w);
    if (w[b] >= LEARNING.known) said.push({ line: line(b), weight: w[b] });
  };
  habit(h.drop, CARD.drop);
  habit(h.run, (b) => CARD.run[b]);
  habit(h.storm, (b) => CARD.storm[b]);
  habit(h.range, (b) => CARD.range[b]);
  habit(h.weapon, CARD.weapon);
  said.sort((a, b) => b.weight - a.weight);
  return said.map((s) => s.line);
}

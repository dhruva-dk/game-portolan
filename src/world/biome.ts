// A planet's biome (#61 section 3): what its land is like and the one rule it changes in how a race is sailed, chosen
// from the planet's seed alone, so the career, the race and a planet's sketch on a screen all agree.
//
// A seed carries its biome in its high part: the biome is BIOMES[⌊seed / SPAN⌋ mod 6], and the planet's fields are
// drawn from the seed's low part (groundOf). Every seed under SPAN is palm keys, today's islands and today's race, so
// every planet the game knew before biomes (the opening SEED, every test's) is what it was, to the bit.
//
// Each biome is a coastline shape, a height profile (planet-islands.ts lays it), vegetation rules (scatter.ts), a
// palette (palette.ts GROUNDS, by its name) and its rule: a name the sim reads from the planet, its numbers in
// sim/handling.ts RULES.
//
// Pure data: no three, so it runs in node for the tests.

import { hash } from './random.ts';
import type { Kind, KindOf } from './planet-islands.ts';

export type BiomeName = 'palmKeys' | 'coralAtolls' | 'basaltFjords' | 'mangroveDelta' | 'volcanicArc' | 'chalkDowns';

/**
 * The rule a biome changes in a race (the sim reads it, sim/rule.ts; its numbers are sim/handling.ts RULES):
 *   none   today's race
 *   reef   wide shoals: a ship slows over the reef's shallow water
 *   lee    wind shadow: the wind falls in the channels under the cliffs, and a ship there with it
 *   roots  rooted shallows: Gust drives her less in the shallows
 *   ash    sight falls in the ash, the more for a poor lookout
 *   tide   the tide runs strong: the sea rises and falls fast, opening and closing the shallow passages
 */
export type Rule = 'none' | 'reef' | 'lee' | 'roots' | 'ash' | 'tide';

/** An island's ground inland, from its beach to its top:
 *   hill   today's: a berm, then hills by their form (planet-islands.ts)
 *   cliff  a cliff all round behind the beach (`foot` m inland, `run` m across for each m high), its head `top` m
 *          (lowest, highest) under the summit, the rest rising gently over the top; split into two steps by a terrace
 *          `inland` m wide at `share` of its height, if any
 *   cone   a volcano: its flanks concave, steepening up to a crater rim, the crater `crater` of the summit deep
 *   flat   barely over the tide: the berm and low hummocks */
export type Profile =
  | { kind: 'hill' }
  | { kind: 'cliff'; foot: number; run: number; top: readonly [number, number]; terrace: { share: number; inland: number } | null }
  | { kind: 'cone'; crater: number }
  | { kind: 'flat' };

/** What grows where (world/scatter.ts): palms and shrubs as many as today's times these; trees of a form, `count` on a
 *  70 m island, `height` m (least, most), standing only on ground no steeper than `flat` (rise over run), `from`…`to` m
 *  from the waterline (negative inland), in clumps of the noise's `clump` m; the rocks' outcrops times `rocks`. */
export interface Growth {
  palms: number;
  shrubs: number;
  trees: { form: 'conifer' | 'broadleaf' | 'mangrove'; count: number; height: readonly [number, number]; flat: number; from: number; to: number; clump: number } | null;
  rocks: number;
}

export interface Land {
  /** Each kind's numbers where they differ from today's (planet-islands.ts KINDS). */
  kinds: { readonly [K in Kind]?: Partial<KindOf> };
  /** An island's coast: its wear times this, and headlands and coves more by these. */
  coast: { wear: number; headlands: number; coves: number };
  /** The island kind's profile (a mesa keeps its cliff, an atoll its ring, whatever the biome). */
  profile: Profile;
  /** The apron's depth, metres (by the ledge, at its edge), and a mesa's or atoll's numbers, where not today's. */
  apron: { inner: readonly [number, number]; outer: readonly [number, number] } | null;
  /** The share of islands holding inland water (a lagoon, a creek), and how drawn out it is (0 round … 1 a creek). */
  lagoon: { share: number; long: number; from: number } | null;
  /** Water between two aprons at least, metres (today's 45). */
  gap: number;
  /** The banks' depth, shallowest to deepest (today's 3–15). */
  bank: readonly [number, number];
}

export interface Biome {
  name: BiomeName;
  land: Land;
  growth: Growth;
  rule: Rule;
  /** The air's aerosol as a multiple of today's (environment.ts: the ash's haze). */
  haze: number;
  /** Whether its summits steam (land/steam.ts). */
  steam: boolean;
}

const TODAY: Land = { kinds: {}, coast: { wear: 1, headlands: 0, coves: 0 }, profile: { kind: 'hill' }, apron: null, lagoon: null, gap: 45, bank: [3, 15] };

/** The six, in the order a seed's high part counts them. Their numbers are starting values. */
export const BIOMES: readonly Biome[] = [
  { name: 'palmKeys', land: TODAY, growth: { palms: 1, shrubs: 1, trees: null, rocks: 1 }, rule: 'none', haze: 1, steam: false },
  {
    // rings of low reef round lagoons, wide pale reef flats about them; few high islands
    name: 'coralAtolls',
    land: {
      ...TODAY,
      kinds: {
        island: { density: 0.9e-6, radius: [18, 34], summit: [2.5, 4.5], apron: [40, 60] },
        atoll: { density: 3.4e-6, radius: [30, 52], summit: [1.4, 2.2], apron: [44, 66], clearance: 30 },
        mesa: { density: 0 },
        islet: { density: 3.6e-6, summit: [1.4, 2.4], apron: [26, 40] },
        rocks: { density: 1.2e-6, apron: [16, 24] },
      },
      apron: { inner: [2.9, 3.4], outer: [3.6, 4.6] },
      bank: [8, 17],
    },
    growth: { palms: 1.4, shrubs: 0.7, trees: null, rocks: 0.5 },
    rule: 'reef', haze: 1, steam: false,
  },
  {
    // high islands walled by dark cliffs, a terrace, a green top; packed close, so the sea between runs in channels
    name: 'basaltFjords',
    land: {
      ...TODAY,
      kinds: {
        island: { density: 2.6e-6, radius: [34, 70], skew: 1.4, summit: [24, 40], apron: [12, 20], clearance: 25 },
        atoll: { density: 0 },
        mesa: { density: 1.6e-6, radius: [18, 32], summit: [14, 22], apron: [10, 16] },
        islet: { density: 2.2e-6, summit: [4, 8], apron: [10, 16] },
        rocks: { density: 2e-6, summit: [1.2, 2], apron: [8, 12] },
      },
      coast: { wear: 1.5, headlands: 1, coves: 2 },
      profile: { kind: 'cliff', foot: 2.5, run: 0.3, top: [5, 9], terrace: { share: 0.45, inland: 9 } },
      apron: { inner: [5, 6], outer: [7, 9] },
      gap: 14,
    },
    growth: { palms: 0, shrubs: 0.6, trees: { form: 'conifer', count: 34, height: [7, 13], flat: 0.32, from: -60, to: -4, clump: 14 }, rocks: 1.6 },
    rule: 'lee', haze: 1, steam: false,
  },
  {
    // flat green islands crowded together, cut by creeks, mangroves along every shore
    name: 'mangroveDelta',
    land: {
      ...TODAY,
      kinds: {
        island: { density: 5.6e-6, radius: [20, 48], skew: 1.6, summit: [1.3, 2.4], long: [0.15, 0.5], apron: [12, 20], clearance: 20 },
        atoll: { density: 0 },
        mesa: { density: 0 },
        islet: { density: 6.5e-6, summit: [1.1, 1.8], long: [0.2, 0.5], apron: [10, 16] },
        rocks: { density: 0 },
      },
      coast: { wear: 1.7, headlands: 2, coves: 3 },
      profile: { kind: 'flat' },
      lagoon: { share: 0.85, long: 0.75, from: 22 },
      gap: 16,
      bank: [3.5, 11],
    },
    growth: { palms: 0, shrubs: 0.8, trees: { form: 'mangrove', count: 70, height: [4.5, 8], flat: 0.25, from: -16, to: 1.2, clump: 9 }, rocks: 0 },
    rule: 'roots', haze: 1, steam: false,
  },
  {
    // dark cones with ash beaches, steam off the craters, palms on the low flats
    name: 'volcanicArc',
    land: {
      ...TODAY,
      kinds: {
        island: { density: 2.2e-6, radius: [32, 62], skew: 1.5, summit: [26, 42], long: [0.02, 0.18], apron: [18, 30] },
        atoll: { density: 0 },
        mesa: { density: 0.6e-6 },
        islet: { density: 3.2e-6, summit: [3, 7] },
        rocks: { density: 2.4e-6 },
      },
      coast: { wear: 1.2, headlands: 0, coves: 0 },
      profile: { kind: 'cone', crater: 0.12 },
    },
    growth: { palms: 0.45, shrubs: 0.6, trees: null, rocks: 1.4 },
    rule: 'ash', haze: 1.9, steam: true,
  },
  {
    // white cliffs standing straight from a narrow shingle beach, rolling green downs on top, copses in the hollows
    name: 'chalkDowns',
    land: {
      ...TODAY,
      kinds: {
        island: { density: 3.4e-6, radius: [26, 58], skew: 1.6, summit: [16, 28], apron: [16, 28] },
        atoll: { density: 0 },
        mesa: { density: 1.2e-6, summit: [10, 16] },
        islet: { density: 3e-6, summit: [5, 9] },
        rocks: { density: 1.4e-6 },
      },
      coast: { wear: 0.8, headlands: 1, coves: 1 },
      profile: { kind: 'cliff', foot: 1.4, run: 0.14, top: [4, 7], terrace: null },
      bank: [2.6, 13],
    },
    growth: { palms: 0, shrubs: 0.9, trees: { form: 'broadleaf', count: 26, height: [6, 10], flat: 0.22, from: -70, to: -8, clump: 18 }, rocks: 0.7 },
    rule: 'tide', haze: 1, steam: false,
  },
];

/** How many seeds each biome has: a seed's low part. Under 2^20 because world/noise3.ts multiplies the seed by
 *  2654435761 and keeps every bit only below 2^53. */
export const SPAN = 2 ** 20;

/** A planet's biome, from its seed. */
export const biomeOf = (seed: number): Biome => BIOMES[Math.floor(seed / SPAN) % BIOMES.length];

/** The seed a planet's fields are drawn from (under SPAN): a palm keys planet's own seed; another biome's, its low part
 *  mixed with the biome, so two biomes' planets of one low part are not the same sea. */
export function groundOf(seed: number): number {
  const k = Math.floor(seed / SPAN) % BIOMES.length, low = seed % SPAN;
  return k === 0 ? low : hash(low, k) % SPAN;
}

/** The seed of a planet of biome `name` from any number: what a calendar, a restage or a test makes a planet from. */
export const seedIn = (name: BiomeName, n: number): number =>
  BIOMES.findIndex((b) => b.name === name) * SPAN + (Math.abs(Math.floor(n)) % SPAN);

/** Any planet's seed from any 32-bit number, every biome as likely. */
export const anyPlanet = (n: number): number => (n >>> 0) % (BIOMES.length * SPAN);

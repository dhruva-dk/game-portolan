// Making a person (Phase B section 2): a role, a strength in stars and an age go in; a whole person comes out, named,
// with stats about that strength, a ceiling (their stats at peak, from which potential is read), a peak age,
// improvability, traits, wants, morale and marketability. The world's start and each season's young people use it.

import type { Persona } from '../race.ts';
import type { Personality, Role } from '../office.ts';
import { dealtKnown } from './components.ts';
import { between, pick, seeded, within, type Rand } from './dice.ts';
import { drawWants } from './asks.ts';
import { family, fullName, given } from './names.ts';
import {
  ROLE_STATS,
  personOf,
  stat,
  type Person,
  type PersonCore,
} from './roles.ts';
import { YEAR, peakRange, starsOf } from './stars.ts';
import { gainable } from './traits.ts';
import { TUNING } from './tuning.ts';

const PERSONAS: readonly Persona[] = [
  'hunter',
  'homesteader',
  'raider',
  'turtle',
  'scavenger',
  'brawler',
];
const PERSONALITIES: readonly Personality[] = [
  'spender',
  'youthBuilder',
  'poacher',
  'engineer',
  'gambler',
  'steady',
];
/** The fixed key of a designer's deal of known components. */
const KNOWN = 0x636f6d70;

/** What a new person is made from. */
export interface Making {
  id: number;
  role: Role;
  stars: number; // about how strong now, 0..5
  years: number; // age on `day`
  day: number;
  colony: number;
}

/** A name not yet in `taken` (lower-case full names of the living); adds it. */
export function freshName(
  rand: Rand,
  taken: Set<string>
): { given: string; family: string } {
  for (;;) {
    const name = { given: given(rand), family: family(rand) };
    const key = fullName(name);
    if (!taken.has(key)) {
      taken.add(key);
      return name;
    }
  }
}

/** A role's stats about a mean, each spread by seed. */
function statsAbout(
  role: Role,
  mean: number,
  rand: Rand
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const k of ROLE_STATS[role])
    out[k] = stat(mean + (rand() * 2 - 1) * TUNING.world.statSpread);
  return out;
}

/** A person's marketability at the start: from stars and youth, spread by seed (traits add theirs when read). */
const marketabilityAt = (
  starsNow: number,
  years: number,
  rand: Rand
): number => {
  const M = TUNING.marketability;
  const youth = years < M.youthAge ? M.youth : 0;
  return Math.round(
    Math.min(
      100,
      Math.max(
        0,
        M.base + M.perStar * starsNow + youth + (rand() * 2 - 1) * M.spread
      )
    )
  );
};

/** A new person. */
export function makePerson(m: Making, rand: Rand, taken: Set<string>): Person {
  const [lo, hi] = peakRange(m.role);
  const peak = between(rand, lo, hi);
  const improvability = Math.round(within(rand, 0.3, 1) * 100) / 100;
  const mean = Math.min(20, Math.max(0, m.stars * 4));
  const stats = statsAbout(m.role, mean, rand);
  // the young lie below their potential, more the further from peak; the old at it or past it
  const gapStars =
    m.years < peak
      ? Math.min(
          TUNING.world.youthGapMost,
          TUNING.world.youthGap * (peak - m.years)
        ) * within(rand, 0.5, 1.5)
      : 0;
  const ceiling: Record<string, number> = {};
  for (const k of Object.keys(stats))
    ceiling[k] = stat(stats[k] + gapStars * 4 * within(rand, 0.6, 1.4));
  const traits: string[] = [];
  while (
    traits.length < TUNING.traits.most &&
    rand() < TUNING.world.traitChance
  ) {
    const t = gainable(m.role, traits, rand);
    if (!t) break;
    traits.push(t);
  }
  const name = freshName(rand, taken);
  const seed = Math.floor(rand() * 4294967296) >>> 0;
  const core: PersonCore = {
    id: m.id,
    seed,
    given: name.given,
    family: name.family,
    colony: m.colony,
    born: m.day - m.years * YEAR - Math.floor(rand() * YEAR),
    improvability,
    peak,
    traits,
    morale: TUNING.morale.start,
    marketability: marketabilityAt(starsOf(stats), m.years, rand),
    wants: drawWants(m.role, m.years, traits, rand),
    contract: null,
    known: {},
    history: [],
    persona: m.role === 'driver' ? pick(rand, PERSONAS) : null,
    personality: m.role === 'manager' ? pick(rand, PERSONALITIES) : null,
    reputation: m.role === 'manager' ? Math.round(within(rand, 10, 40)) : 0,
    fatigue: 0,
    fatigueDay: m.day,
    // a designer's known components, by their own seed (no stream's turn), so every new designer is dealt alike
    components:
      m.role === 'designer'
        ? dealtKnown(seeded(seed, KNOWN), starsOf(stats))
        : [],
    unfit: 0,
    grudge: null,
    patience: TUNING.patience,
    silentUntil: 0,
    silenced: false,
    retired: null,
    player: false,
  };
  return personOf(core, m.role, stats, ceiling);
}

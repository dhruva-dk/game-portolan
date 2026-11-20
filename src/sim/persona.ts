// Who a bot is: her persona, one of six by name, and the match's character,
// which weighs them.
//
// A persona is two things, and the rule between them is this: her temperament
// (temper.ts) is who she is, numbers drawn about her style (how readily she
// fights, how far she keeps from the storm's edge, how close she lies to a
// foe); her crew (a brain's variant: brain.ts) is how her ship is worked
// (which options her captain ranks first, how far her lookout sees, how keen
// her ear is for guns, how she fights her guns). A brawler is both a temper
// that fights and a crew that hunts and rams.
//
// A match is of a type, drawn from its seed: the mix of personas it is sailed
// by, and its rules (rules.ts: what loot it lays, how its storm closes). Each
// persona's crew is made once for each brain it changes, not once a bot.
//
// Pure arithmetic: no three, so it runs in node for the tests; the same for a
// seed every time.

import { DEFAULT_BRAIN, type Brain } from './brain.ts';
import { DEFAULT_RULES, type Rules } from './rules.ts';
import { temper, type Temper } from './temper.ts';

/** The personas, in the order of their temperaments (temper.ts STYLES). */
const PERSONAS = [
  'hunter',
  'homesteader',
  'raider',
  'turtle',
  'scavenger',
  'brawler',
] as const;
type Persona = (typeof PERSONAS)[number];

/** How much of a match's fleet each persona is, by weight. */
type Mix = Readonly<Record<Persona, number>>;

/** Every persona alike. */
const EVEN: Mix = {
  hunter: 1,
  homesteader: 1,
  raider: 1,
  turtle: 1,
  scavenger: 1,
  brawler: 1,
};

/**
 * A match's type: its name, the mix of personas it is sailed by, and its rules.
 */
export interface MatchType {
  readonly name: string;
  readonly mix: Mix;
  readonly rules: Rules;
}

/** A match like any other: every persona alike, the game's own rules. */
export const MIXED: MatchType = {
  name: 'mixed',
  mix: EVEN,
  rules: DEFAULT_RULES,
};

/**
 * A bot's nature, fixed for her life: her seed (her chance's start, and the
 * steps she thinks on), her persona, the brain her crew works by, and her
 * temperament.
 */
export interface Nature {
  readonly seed: number;
  readonly persona: Persona;
  readonly brain: Brain;
  readonly temper: Temper;
}

/**
 * The nature of a bot of this seed in a match of this mix, her crew worked by
 * `brain` (the game's own if not given). Her persona is drawn by the mix with
 * her temperament's first draw, so with every persona alike she is the one she
 * always was.
 */
export function nature(
  seed: number,
  brain: Brain = DEFAULT_BRAIN,
  mix: Mix = EVEN
): Nature {
  const t = temper(
    seed,
    brain.styles,
    PERSONAS.map((p) => mix[p])
  );
  const persona = PERSONAS[t.style];
  return { seed, persona, brain, temper: t };
}

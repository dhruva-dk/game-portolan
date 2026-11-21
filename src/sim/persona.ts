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

import { random } from '../world/random.ts';
import { DEFAULT_BRAIN, variant, type Brain, type Over } from './brain.ts';
import { DEFAULT_RULES, ruled, type Rules } from './rules.ts';
import { weighed } from './tables.ts';
import { temper, type Temper } from './temper.ts';

/**
 * The personas, in the order of their temperaments (temper.ts STYLES); the
 * seed panel counts them in this order (play/fleet.ts).
 */
export const PERSONAS = [
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

/**
 * Each persona's crew: how her ship is worked, as changes to whatever brain
 * `b` she sails (the game's, or one the harness gives), each a share of its
 * own, so what that brain changed stays changed (a brain that never seeks
 * cover gives a turtle none). Her options' weights (bot.ts CHOICE) lean her to
 * what she is about; her ear (hunter.ts HUNTING earshot) and eye (lookout.ts
 * SIGHT sightMax) reach as far as she cares to look for a fight; a turtle
 * looks further for cover (fighting.ts MIND cover). On the game's brain:
 * hunter hunt 2.7, fight 2.9, earshot 650 m, sight 280 m; homesteader claim
 * 2.1, hunt 1.4, earshot 350 m; raider loot 2.2, hunt 2.4, earshot 600 m;
 * turtle heal 4.2, flee 3.9, fight 2.2, hunt 1.4, cover 240 m; scavenger loot
 * 2.4, hunt 1.5; brawler fight 3.1, hunt 2.7, earshot 700 m, sight
 * 280 m.
 *
 * An ear longer than the game's draws her no further: guns past HUNTING `far`
 * (450 m) score nothing (hunter.ts huntUrge), so all a longer one changes is
 * which guns she last heard. Both mending that (her `far` as long as her ear)
 * and dropping the longer ears measured worse for the fighters (BOTS.md), so
 * they stay as they are.
 */
const CREWS: Readonly<Record<Persona, (b: Brain) => Over>> = {
  // goes to the guns she hears from far off, and sees a foe sooner; waits at a
  // narrows ships must pass, early
  hunter: ({ choice, hunting, sight, placing }) => ({
    choice: { hunt: choice.hunt * 1.35, fight: choice.fight * (29 / 26) },
    hunting: { earshot: hunting.earshot * 1.3 },
    sight: { sightMax: sight.sightMax * (7 / 6) },
    placing: {
      strait: placing.strait + 1,
      deep: placing.deep * 0.6,
      foes: placing.foes + 0.4,
      early: placing.early * 1.5,
    },
  }),
  // keeps to her water: claims more, hunts less, hears less; open water to
  // claim, a shore near
  homesteader: ({ choice, hunting, placing }) => ({
    choice: { claim: choice.claim * 1.4, hunt: choice.hunt * 0.7 },
    hunting: { earshot: hunting.earshot * 0.7 },
    placing: {
      open: placing.open + 0.4,
      cover: placing.cover + 0.3,
      foes: placing.foes - 0.3,
      early: placing.early * (4 / 3),
    },
  }),
  // after loot, and after a fight she hears to take it from; where the loot
  // lies, or a narrows
  raider: ({ choice, hunting, placing }) => ({
    choice: { loot: choice.loot * (11 / 9), hunt: choice.hunt * 1.2 },
    hunting: { earshot: hunting.earshot * 1.2 },
    placing: {
      plunder: placing.plunder + 0.6,
      strait: placing.strait + 0.4,
      early: placing.early * (5 / 6),
    },
  }),
  // mends and runs sooner, fights later, runs for cover further off; sits in a
  // cove with a way out, early
  turtle: ({ choice, mind, placing }) => ({
    choice: {
      heal: choice.heal * 1.2,
      flee: choice.flee * (39 / 33),
      fight: choice.fight * (22 / 26),
      hunt: choice.hunt * 0.7,
    },
    mind: { cover: mind.cover * (4 / 3) },
    placing: {
      cover: placing.cover + 1,
      deep: placing.deep * 0.6,
      foes: placing.foes - 0.4,
      early: placing.early * 2,
    },
  }),
  // the loot before anything but the storm and her life (her eyes on it, she
  // sees a ship late: temper.ts); where it lies, and late
  scavenger: ({ choice, placing }) => ({
    choice: { loot: choice.loot * (4 / 3), hunt: choice.hunt * 0.75 },
    placing: {
      plunder: placing.plunder + 1,
      deep: placing.deep * 0.6,
      early: placing.early * 0.5,
    },
  }),
  // fights first and hears furthest (see above), but one at a time: a crowd
  // round her cools her more than most (and she runs, losing, as any: her
  // style's own runs are later than most, temper.ts); in the heart of the
  // next cap, where the fleet will be
  brawler: ({ choice, hunting, sight, mind, placing }) => ({
    choice: { fight: choice.fight * (31 / 26), hunt: choice.hunt * 1.35 },
    mind: { crowding: mind.crowding * 1.6 },
    hunting: { earshot: hunting.earshot * 1.4 },
    sight: { sightMax: sight.sightMax * (7 / 6) },
    placing: {
      deep: placing.deep * 1.4,
      foes: placing.foes + 0.4,
      early: placing.early * (7 / 6),
    },
  }),
};

/** Each brain's crews by persona, made once. */
const crewed = new WeakMap<Brain, Readonly<Record<Persona, Brain>>>();
function crewsOf(brain: Brain): Readonly<Record<Persona, Brain>> {
  let c = crewed.get(brain);
  if (!c) {
    const of = (p: Persona) => variant(CREWS[p](brain), brain);
    c = {
      hunter: of('hunter'),
      homesteader: of('homesteader'),
      raider: of('raider'),
      turtle: of('turtle'),
      scavenger: of('scavenger'),
      brawler: of('brawler'),
    };
    crewed.set(brain, c);
  }
  return c;
}

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

/** The storm's waits between its closings, each `by` times as long. */
const waits = (by: number) =>
  DEFAULT_RULES.storm.phases.map((p) => ({ ...p, wait: p.wait * by }));

/**
 * The loot each type changes, as so many times the game's own: so a type keeps
 * its character as the game's loot is scaled.
 */
const LAID = DEFAULT_RULES.loot;
const times = (k: number, of: number) => Math.round(k * of * 100) / 100;
const cache = (pieces: number, more: number, gun = LAID.cache.gun) => ({
  ...LAID.cache,
  pieces: Math.round(LAID.cache.pieces * pieces),
  more: Math.round(LAID.cache.pieces * more),
  gun,
});

/**
 * The game's match types, each with how often it is dealt: most matches mixed;
 * a bloodbath (hunters, brawlers and raiders, guns lying thick and rarer, the
 * storm in a hurry, its caches mostly guns); a gold rush (scavengers, raiders
 * and homesteaders, loot everywhere, a gun lying near every berth, and caches
 * that grow as the storm closes, 11 pieces, then 14, 17 …); a cagey one (turtles
 * and homesteaders, guns scarce, the storm taking its time, its caches small
 * and mostly mending).
 */
export const TYPES: readonly (MatchType & { readonly dealt: number })[] = [
  { ...MIXED, dealt: 0.55 },
  {
    name: 'bloodbath',
    dealt: 0.15,
    mix: { ...EVEN, hunter: 3, brawler: 3, raider: 2, turtle: 0.5 },
    rules: ruled({
      loot: {
        gun: times(LAID.gun, 1.31),
        weights: [30, 32, 22, 11, 5],
        cache: cache(1.2, 0, 0.75),
      },
      storm: { phases: waits(0.8) },
    }),
  },
  {
    name: 'gold rush',
    dealt: 0.15,
    mix: { ...EVEN, scavenger: 3, raider: 2, homesteader: 2 },
    rules: ruled({
      loot: {
        spots: Math.round(LAID.spots * 1.375),
        second: 0.55,
        weights: [28, 30, 24, 12, 6],
        berth: 80,
        near: 30,
        far: 60,
        cache: cache(1.4, 0.4),
      },
    }),
  },
  {
    name: 'cagey',
    dealt: 0.15,
    mix: { ...EVEN, turtle: 3, homesteader: 3, brawler: 0.5 },
    rules: ruled({
      loot: { gun: times(LAID.gun, 0.81), cache: cache(0.8, 0, 0.25) },
      storm: { phases: waits(1.15) },
    }),
  },
];

/** The type of the match of this seed, as the game deals them (TYPES). */
export function dealt(seed: number): MatchType {
  const u = random(seed ^ 0x7e9e5);
  return TYPES[
    weighed(
      TYPES.map((t) => t.dealt),
      u()
    )
  ];
}

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
 * The nature of a bot of this seed in a match of this mix: her persona, drawn
 * by the mix with her temperament's first draw (so with every persona alike
 * she is the one she always was), and her crew, the persona's changes to
 * `brain` (the game's own if not given). A brain's styles are the six, in the
 * order of PERSONAS.
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
  return { seed, persona, brain: crewsOf(brain)[persona], temper: t };
}

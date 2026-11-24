import { random } from '../world/random.ts';
import { DEFAULT_BRAIN, variant, type Brain, type Over } from './brain.ts';
import { DEFAULT_RULES, ruled, type Rules } from './rules.ts';
import { weighed } from './tables.ts';
import { temper, type Temper } from './temper.ts';

export const PERSONAS = [
  'hunter',
  'homesteader',
  'raider',
  'turtle',
  'scavenger',
  'brawler',
] as const;
type Persona = (typeof PERSONAS)[number];

type Mix = Readonly<Record<Persona, number>>;

const CREWS: Readonly<Record<Persona, (b: Brain) => Over>> = {
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
  homesteader: ({ choice, hunting, placing }) => ({
    choice: { claim: choice.claim * 1.4, hunt: choice.hunt * 0.7 },
    hunting: { earshot: hunting.earshot * 0.7 },
    roaming: { shy: 250 },
    placing: {
      open: placing.open + 0.4,
      cover: placing.cover + 0.3,
      foes: placing.foes - 0.3,
      early: placing.early * (4 / 3),
    },
  }),
  raider: ({ choice, hunting, placing }) => ({
    choice: { loot: choice.loot * (11 / 9), hunt: choice.hunt * 1.2 },
    hunting: { earshot: hunting.earshot * 1.2, standoff: 1 },
    placing: {
      plunder: placing.plunder + 0.6,
      strait: placing.strait + 0.4,
      early: placing.early * (5 / 6),
    },
  }),
  turtle: ({ choice, mind, placing }) => ({
    choice: {
      heal: choice.heal * 1.2,
      flee: choice.flee * (39 / 33),
      fight: choice.fight * (22 / 26),
      hunt: choice.hunt * 0.7,
    },
    mind: { cover: mind.cover * (4 / 3) },
    roaming: { shy: 250 },
    placing: {
      cover: placing.cover + 1,
      deep: placing.deep * 0.6,
      foes: placing.foes - 0.4,
      early: placing.early * 2,
    },
  }),
  scavenger: ({ choice, placing }) => ({
    choice: { loot: choice.loot * (4 / 3), hunt: choice.hunt * 0.75 },
    placing: {
      plunder: placing.plunder + 1,
      deep: placing.deep * 0.6,
      early: placing.early * 0.5,
    },
  }),
  brawler: ({ choice, hunting, sight, mind, placing }) => ({
    choice: { fight: choice.fight * (31 / 26), hunt: choice.hunt * 1.35 },
    mind: { crowding: mind.crowding * 1.6 },
    hunting: { earshot: hunting.earshot * 1.4, standoff: 1 },
    sight: { sightMax: sight.sightMax * (7 / 6) },
    placing: {
      deep: placing.deep * 1.4,
      foes: placing.foes + 0.4,
      early: placing.early * (7 / 6),
    },
  }),
};

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

const EVEN: Mix = {
  hunter: 1,
  homesteader: 1,
  raider: 1,
  turtle: 1,
  scavenger: 1,
  brawler: 1,
};

export interface MatchType {
  readonly name: string;
  readonly mix: Mix;
  readonly rules: Rules;
}

export const MIXED: MatchType = {
  name: 'mixed',
  mix: EVEN,
  rules: DEFAULT_RULES,
};

const waits = (by: number) =>
  DEFAULT_RULES.storm.phases.map((p) => ({ ...p, wait: p.wait * by }));

export const TYPES: readonly (MatchType & { readonly dealt: number })[] = [
  { ...MIXED, dealt: 0.55 },
  {
    name: 'bloodbath',
    dealt: 0.15,
    mix: { ...EVEN, hunter: 3, brawler: 3, raider: 2, turtle: 0.5 },
    rules: ruled({ storm: { phases: waits(0.8) } }),
  },
  {
    name: 'gold rush',
    dealt: 0.15,
    mix: { ...EVEN, scavenger: 3, raider: 2, homesteader: 2 },
    rules: DEFAULT_RULES,
  },
  {
    name: 'cagey',
    dealt: 0.15,
    mix: { ...EVEN, turtle: 3, homesteader: 3, brawler: 0.5 },
    rules: ruled({ storm: { phases: waits(1.15) } }),
  },
];

export function dealt(seed: number): MatchType {
  const u = random(seed ^ 0x7e9e5);
  return TYPES[
    weighed(
      TYPES.map((t) => t.dealt),
      u()
    )
  ];
}

export interface Nature {
  readonly seed: number;
  readonly persona: Persona;
  readonly brain: Brain;
  readonly temper: Temper;
}

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

import { KINDS } from '../sim/kinds.ts';
import { COLORS, PATTERNS } from '../world/livery.ts';
import {
  PARTS,
  TEAM,
  TEAMS,
  type Fitted,
  type RaceCard,
  type RaceResult,
  type RaceShip,
} from '../sim/race.ts';
import type { Order } from '../sim/battle.ts';
import { MIXED, nature } from '../sim/persona.ts';
import { DEFAULT_RULES, ruled, type Rules } from '../sim/rules.ts';
import type { Helm } from '../sim/ship.ts';
import { NOTHING, type Ask } from '../sim/stores.ts';
import { createStorm } from '../sim/storm.ts';
import type { Planet } from '../world/planet.ts';
import { hash } from '../world/random.ts';
import type { Vec3 } from '../world/sphere.ts';
import { flat } from '../world/swell.ts';
import { createState, type Match, type Waters } from './state.ts';

const PART: Fitted = { performance: 1 };
const SPEC = {
  parts: {
    sails: PART,
    rigging: PART,
    rudder: PART,
    hull: PART,
    keel: PART,
    mounts: PART,
  },
  stats: {
    gunnery: 10,
    helm: 10,
    seamanship: 10,
    nerve: 10,
    consistency: 10,
    stormcraft: 10,
    stamina: 10,
    feedback: 10,
    lookout: 10,
  },
  rules: {
    storm: 1,
    banned: [],
    spec: PARTS,
    pointsPerSinking: 1,
    seaHeldPoint: true,
    prizeSpread: 1,
    inspection: 0,
  },
} as const;

function rulesOf(card: RaceCard): Rules {
  const { storm: pace, banned } = card.rules,
    base = DEFAULT_RULES;
  if (!(pace > 0)) throw new Error(`card: the storm's pace is ${pace}`);
  const left = (k: number) =>
    banned.includes(KINDS[k]) ? 0 : base.loot.kinds[k];
  const kinds: Rules['loot']['kinds'] = [
    left(0),
    left(1),
    left(2),
    left(3),
    left(4),
  ];
  if (kinds.every((w) => w === 0)) throw new Error('card: every gun is banned');
  return ruled({
    ...(banned.length > 0 && { loot: { kinds } }),
    ...(pace !== 1 && {
      storm: {
        phases: base.storm.phases.map((p) => ({
          ...p,
          wait: p.wait / pace,
          close: p.close / pace,
        })),
        every: base.storm.every / pace,
      },
    }),
  });
}

export function raceOf(card: RaceCard, planet: Planet): Match {
  const rules = rulesOf(card),
    depth = (p: Vec3) => -planet.height(p);
  return {
    seed: card.seed,
    type: { ...MIXED, name: 'race', rules },
    storm: createStorm(card.seed, depth, rules.storm),
    gun: null,
    card,
  };
}

const IDLE = {
  helm: { course: null, throttle: 0 },
  gun: { aim: null, fire: false },
};

export function runRace(
  card: RaceCard,
  planet: Planet,
  waters: Waters,
  pilot: (second: number) => { helm: Helm; gun: Order; ask?: Ask } = () => IDLE
): RaceResult {
  const match = raceOf(card, planet),
    state = createState(planet, flat, waters, match);
  state.start(match);
  for (;;) {
    const hands = pilot(state.time());
    state.advance(hands.helm, hands.gun, hands.ask ?? NOTHING);
    const result = state.result();
    if (result) return result;
  }
}

export function specField(
  seed: number,
  teams = TEAMS,
  hands = false
): RaceCard {
  const ship = (_: unknown, id: number): RaceShip => {
    const team = Math.floor(id / TEAM),
      own = hash(seed, id);
    return {
      id,
      team,
      colors: {
        dye: team % COLORS.length,
        pattern: Math.floor(team / COLORS.length) % PATTERNS.length,
      },
      parts: SPEC.parts,
      driver:
        hands && id === 0
          ? null
          : { seed: own, persona: nature(own).persona, stats: SPEC.stats },
      forfeit: false,
    };
  };
  return {
    seed,
    tier: 0,
    round: 0,
    rules: SPEC.rules,
    ships: Array.from({ length: teams * TEAM }, ship),
  };
}

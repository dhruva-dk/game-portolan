// A race sailed by its card (race.ts RaceCard), headless: the match the card
// makes on a planet (raceOf), sailed on the game's own state (state.ts) to its
// end for its result (runRace), and a field of spec ships to sail one with
// (specField).
//
// A race's match: its seed the card's (its storm, its loot and its berths come
// of it); the game's own rules, not a type dealt by the seed (a championship's
// rules are voted: race.ts Rules), changed by the card's: the storm's pace (its
// waits and its closings that many times as quick, what it wears off a hull
// unchanged) and the guns banned (none of that kind is ever laid); no ship
// armed at the start, as in any match.
//
// runRace is a pure function of its card and its planet: the sea is flat (no
// swell moves a number of the sim), every step is the sim's fixed one, and
// nothing reads a clock: the same card on the same planet gives the same
// result, hash and all, wherever it is run. Ship 0 with a driver on her card
// is sailed by her bot as every other is; with none, by the pilot's hands.

import { KINDS } from '../kinds.ts';
import { PATTERNS } from '../player.ts';
import {
  PARTS,
  TEAM,
  TEAMS,
  type Fitted,
  type RaceCard,
  type RaceResult,
  type RaceShip,
} from '../race.ts';
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
import { COLOURS } from './colours.ts';
import { createState, type Match, type Waters } from './state.ts';

/**
 * The spec ship and the spec championship: what specField deals every ship
 * and its card. A part of performance 1 and reliability 0.5, a driver of 10 in
 * every stat, the call free;
 * the storm at today's pace, no gun banned, every part spec.
 */
const PART: Fitted = { performance: 1, reliability: 0.5 };
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
  call: 'free',
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

/** A race's rules: the game's own, changed by what its card's rules say. */
function rulesOf(card: RaceCard): Rules {
  const { storm: pace, banned } = card.rules,
    base = DEFAULT_RULES;
  if (!(pace > 0)) throw new Error(`card: the storm's pace is ${pace}`);
  // (the kinds' weights, in kinds.ts KINDS' order, a banned kind's nothing)
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

/** The match `card` makes on `planet`: a race of teams, sailed by the card. */
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

/** Hands on no helm, no gun and no stores. */
const IDLE = {
  helm: { course: null, throttle: 0 },
  gun: { aim: null, fire: false },
};

/**
 * The race of `card` sailed to its end on `planet` (its water as `waters`
 * sounds it), and its result. `pilot`: the hands on ship 0, asked each step at
 * that second of the race, if her card names no driver (idle if not given).
 */
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

/**
 * A field of spec ships (SPEC) for the race of `seed`: `teams` teams of TEAM,
 * each team in a livery of its own, each ship's driver of the seed and the
 * persona today's bot of her berth has (state.ts: hash(seed, id)), so a spec
 * field is sailed by today's bots. `hands`: ship 0 has no driver, and is
 * sailed by hand.
 */
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
      colours: {
        dye: team % COLOURS.length,
        pattern: Math.floor(team / COLOURS.length) % PATTERNS.length,
      },
      parts: SPEC.parts,
      driver:
        hands && id === 0
          ? null
          : { seed: own, persona: nature(own).persona, stats: SPEC.stats },
      call: SPEC.call,
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

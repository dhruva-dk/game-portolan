// A whole race run with no one watching: the card's ships put to sea on the planet, stepped (state.ts advance) until
// it is over, and its result (result.ts). Pure: the same card on the same planet gives the same result, in node and in
// a Worker (league.ts) alike. It runs on a flat sea: no rule reads the sea's height, which only lifts the ships as
// they are drawn (sim/ride.ts; tests/race.test.ts holds a wavy sea's result to a flat one's). Her ship is a bot's,
// unless `pilot` gives her hands step by step (her helm replayed from what was recorded).

import type { RaceCard, RaceResult } from '../race.ts';
import type { Order } from '../sim/battle.ts';
import { STEP } from '../sim/fixed.ts';
import type { Helm } from '../sim/ship.ts';
import { NOTHING, type Ask } from '../sim/stores.ts';
import { STORM, createStorm } from '../sim/storm.ts';
import type { Planet } from '../world/planet.ts';
import type { Vec3 } from '../world/sphere.ts';
import { flat } from '../world/swell.ts';
import { createState, type Match, type Waters } from './state.ts';

/** Her hands for one step: her helm, her gun's orders and what she asks of her stores. */
export interface Hands { helm: Helm; gun: Order; ask: Ask }

const IDLE: Hands = { helm: { course: null, throttle: 0 }, gun: { aim: null, fire: false }, ask: NOTHING };

/** The match a card sails: its storm on the race's pace, no gun to start with (as PLAY's), its berths as sounded. */
export function matchOf(card: RaceCard, planet: Planet): Match {
  const storm = createStorm(card.seed, (p: Vec3) => -planet.height(p), card.rules.storm);
  return { seed: card.seed, storm, gun: null, card };
}

/** Seconds past the storm's last close by which a race has ended (the storm's rising wear sinks every ship long
 *  before): one still on then is an error. */
const OVERTIME = 600;

/** The race dealt `card` on `planet`, its water `waters`, run to its end. */
export function runRace(card: RaceCard, planet: Planet, waters: Waters, pilot?: (step: number) => Hands): RaceResult {
  const m = matchOf(card, planet), state = createState(planet, flat, waters, m);
  state.start(m, !!pilot);
  const last = card.rules.storm.pace * STORM.phases.reduce((t, p) => t + p.wait + p.close, 0) + OVERTIME;
  for (let step = 0; !state.result() && step * STEP < last; step++) {
    const h = pilot?.(step) ?? IDLE;
    state.advance(h.helm, h.gun, h.ask);
  }
  const result = state.result();
  if (!result) throw new Error(`race ${card.seed} still on at ${state.time().toFixed(0)} s, ${state.alive().length} afloat`);
  return result;
}

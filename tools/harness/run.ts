// One match of bots, run headless on the game's own state (play/state.ts start
// and advance, the match dealt as play/setup.ts deals it): every ship a bot,
// each sailing the brain the spec gives her, on a flat sea. The same spec runs
// the same match, to the bit, wherever it runs.
//
// Node only (tools/).

import { createMatches } from '../../src/play/setup.ts';
import { createState, debugOf } from '../../src/play/state.ts';
import { STEP } from '../../src/sim/fixed.ts';
import { hash } from '../../src/world/random.ts';
import { flat } from '../../src/world/swell.ts';
import { brainNamed } from './brains.ts';
import { watch, type MatchResult } from './metrics.ts';
import { standIn, type Thumb } from './player.ts';
import { ruledBy } from './rules.ts';
import { typeNamed } from './types.ts';
import { worldOf } from './world.ts';

/**
 * A match to run: on the planet of `planet` (the game's if not given), the
 * `match`-th dealt on it (1 the first after the lobby's), the bots' brains by
 * name, ship `id` sailing `brains[(id + match) % brains.length]`; of the type
 * named `type` (tools/harness/types.ts: as the game deals them if not given),
 * under its rules changed by the variant named `rules` (tools/harness/rules.ts:
 * as they are if not given); every `players`-th ship's gun laid by a stand-in
 * for a player with a `thumb` (tools/harness/player.ts THUMBS: none if not
 * given; steady); until one is
 * left, or `seconds` (the storm's whole course and two minutes more if not
 * given). (Turned by the match: a ship's id sets her temperament,
 * her berth and whose shots she takes, and in a mixed fleet the even ids,
 * sailing one brain in every match, placed better whatever brain it was. Over
 * matches each brain sails every id alike.)
 */
export interface Spec {
  planet?: number;
  match: number;
  brains: readonly string[];
  type?: string;
  rules?: string;
  players?: number;
  thumb?: Thumb;
  seconds?: number;
}

export type State = ReturnType<typeof createState>;

/** A spec's result: the spec, the match's seed, and its account. */
export interface Result extends MatchResult {
  spec: Spec;
  seed: number;
}

export const runMatch = (spec: Spec): Result => runWatched(spec);

/**
 * A spec's match run to its end. `look`: shown the state once each second of
 * its clock, and at its end (the fleet's jobs hash it as it goes).
 */
export function runWatched(spec: Spec, look?: (state: State) => void): Result {
  const w = worldOf(spec.planet);
  const brainOf = (id: number) =>
    spec.brains[(id + spec.match) % spec.brains.length];
  const brains = new Map(spec.brains.map((n) => [n, brainNamed(n)]));
  const matches = createMatches(
    w.seed,
    w.planet,
    null,
    null,
    ruledBy(typeNamed(spec.type), spec.rules)
  );
  const state = createState(
    w.planet,
    flat,
    w.waters,
    matches.first,
    (id) => brains.get(brainOf(id))!
  );
  let m = matches.deal();
  for (let k = 1; k < spec.match; k++) m = matches.deal();
  state.start(m, false);
  // the stand-ins: every players-th ship, turned by the match as the brains
  // are, so over matches they sail every id
  const players = new Set<number>();
  if (spec.players)
    for (const k of state.ships())
      if ((k.id + spec.match) % spec.players === 0) {
        players.add(k.id);
        debugOf(state).standIn(k.id, standIn(hash(m.seed, k.id), spec.thumb));
      }
  // the storm's whole course, and two minutes more
  const course = m.type.rules.storm.phases.reduce(
      (t, p) => t + p.wait + p.close,
      0
    ),
    end = spec.seconds ?? course + 120,
    seen = watch(state, brainOf, w.depth, m.type.name, players);
  const idle = { course: null, throttle: 0 },
    still = { aim: null, fire: false },
    each = Math.round(1 / STEP);
  let steps = 0;
  const t = performance.now();
  while (state.alive().length > 1 && state.time() < end) {
    seen.step(state.advance(idle, still));
    if (++steps % each === 0) {
      seen.second(steps / each);
      look?.(state);
    }
  }
  look?.(state);
  return { spec, seed: m.seed, ...seen.end(steps, performance.now() - t) };
}

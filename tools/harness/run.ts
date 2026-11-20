// One match of bots, run headless on the game's own state (play/state.ts start
// and advance, the match dealt as play/setup.ts deals it): every ship a bot,
// each sailing the brain the spec gives her, on a flat sea. The same spec runs
// the same match, to the bit, wherever it runs.
//
// Node only (tools/).

import { createMatches } from '../../src/play/setup.ts';
import { createState } from '../../src/play/state.ts';
import { STEP } from '../../src/sim/fixed.ts';
import { STORM } from '../../src/sim/storm.ts';
import { flat } from '../../src/world/swell.ts';
import { brainNamed } from './brains.ts';
import { watch, type MatchResult } from './metrics.ts';
import { worldOf } from './world.ts';

/**
 * A match to run: on the planet of `planet` (the game's if not given), the
 * `match`-th dealt on it (1 the first after the lobby's), the bots' brains by
 * name, ship `id` sailing `brains[id % brains.length]`; until one is left, or
 * `seconds` (the storm's whole course and two minutes more if not given).
 */
export interface Spec {
  planet?: number;
  match: number;
  brains: readonly string[];
  seconds?: number;
}

export type State = ReturnType<typeof createState>;

/** The storm's whole course, and two minutes more. */
const END = STORM.phases.reduce((t, p) => t + p.wait + p.close, 0) + 120;

/** A spec's result: the spec, the match's seed, and its account. */
export interface Result extends MatchResult {
  spec: Spec;
  seed: number;
}

export function runMatch(spec: Spec): Result {
  const w = worldOf(spec.planet);
  const brainOf = (id: number) => spec.brains[id % spec.brains.length];
  const brains = new Map(spec.brains.map((n) => [n, brainNamed(n)]));
  const matches = createMatches(w.seed, w.planet, null, null);
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
  const end = spec.seconds ?? END,
    seen = watch(state, brainOf, w.depth);
  const idle = { course: null, throttle: 0 },
    still = { aim: null, fire: false },
    each = Math.round(1 / STEP);
  let steps = 0;
  const t = performance.now();
  while (state.alive().length > 1 && state.time() < end) {
    state.advance(idle, still);
    if (++steps % each === 0) seen.second(steps / each);
  }
  return { spec, seed: m.seed, ...seen.end(steps, performance.now() - t) };
}

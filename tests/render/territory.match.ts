// A real headless match for WP20's tests and captures: the player's scripted helm breaks off the Great Current, sails
// out on a long curve and heads home, closing a big loop by the sim's own sailing and territory. The fleet's guns are
// struck (vectors.ts unarmed), so only the script decides who sinks.
import { seaFor, type Sea } from '../../src/sim/environment.ts';
import { FLAG, idleInput, type ShipInput } from '../../src/sim/input.ts';
import { step } from '../../src/sim/match.ts';
import { createMatch, EVENT, PHASE, TICK, type MatchState } from '../../src/sim/state.ts';
import { unarmed, world } from '../sim/vectors.ts';

export const SEED = 20261024;
const S = (seconds: number): number => Math.round(seconds / TICK);

/** The player's helm: break off at 20 s, then by turns sail out (straight, then a long turn) and head home. */
export function helm(s: MatchState): ShipInput {
  const input = idleInput(), off = S(20);
  if (s.tick >= off) input.flags = FLAG.breakOff;
  if (s.ships[0].phase === PHASE.sailing) {
    const t = (s.tick - off) % S(70);
    if (t < S(30)) input.steer = t < S(12) ? 0 : 40;
    else input.flags |= FLAG.headHome;
  }
  return input;
}

/** The scripted match at its first tick, and the sim's sea for it. */
export function scripted(): { sea: Sea; state: MatchState } {
  return { sea: seaFor(world(), SEED), state: unarmed(createMatch({ seed: SEED })) };
}

/** The tick on which the player closes its biggest loop within `limit` s (or its first of at least `area` u²). */
export function bigLoop(area = Infinity, limit = 200): { tick: number; area: number } {
  const { sea, state } = scripted();
  let best = { tick: -1, area: 0 };
  while (state.tick < S(limit) && best.area < area) {
    step(sea, state, helm(state));
    for (const e of state.events) if (e.kind === EVENT.loop && e.ship === 0 && e.amount > best.area) best = { tick: state.tick, area: e.amount };
  }
  return best;
}

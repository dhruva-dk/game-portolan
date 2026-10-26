import { seaFor, type Sea } from '../../src/sim/environment.ts';
import { FLAG, idleInput, type ShipInput } from '../../src/sim/input.ts';
import { step } from '../../src/sim/match.ts';
import { createMatch, EVENT, PHASE, TICK, type MatchState } from '../../src/sim/state.ts';
import { unarmed, world } from '../sim/vectors.ts';

export const SEED = 20261024;
const S = (seconds: number): number => Math.round(seconds / TICK);

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

export function scripted(): { sea: Sea; state: MatchState } {
  return { sea: seaFor(world(), SEED), state: unarmed(createMatch({ seed: SEED })) };
}

export function bigLoop(area = Infinity, limit = 200): { tick: number; area: number } {
  const { sea, state } = scripted();
  let best = { tick: -1, area: 0 };
  while (state.tick < S(limit) && best.area < area) {
    step(sea, state, helm(state));
    for (const e of state.events) if (e.kind === EVENT.loop && e.ship === 0 && e.amount > best.area) best = { tick: state.tick, area: e.amount };
  }
  return best;
}

// The match step: every system of the simulation, in order, once per tick. It is the only code that writes the
// match state, and ShipInput is the only way in: the player's input comes from outside, the captains' from
// inside. Each system appends its call here, in the order the rules need.
import { applyControls, inputAt, replay, type Recording, type ShipInput } from './input.ts';
import type { MatchState } from './state.ts';

/** Advance the match by one tick of TICK seconds, with the player's input for this tick. */
export function step(state: MatchState, player: ShipInput): void {
  applyControls(state.ships[0], player);
  state.tick++;
}

/** Step a match headless with recorded player inputs until it reaches `tick`. */
export function runMatch(state: MatchState, recording: Recording, tick: number): void {
  const inputs = replay(recording);
  while (state.tick < tick) step(state, inputAt(inputs, state.tick));
}

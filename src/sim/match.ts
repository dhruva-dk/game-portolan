// The match step: every system of the simulation, in order, once per tick. It is the only code that writes the
// match state, and ShipInput is the only way in: the player's input comes from outside, the captains' from
// inside. Each system appends its call here, in the order the rules need.
import { earn, scoop } from './economy.ts';
import { brew, stir, type Sea } from './environment.ts';
import { applyControls, idleInput, inputAt, replay, type Recording, type ShipInput } from './input.ts';
import { collide, sail } from './sailing.ts';
import { SHIPS, type MatchState } from './state.ts';
import { chart } from './territory.ts';

/** The captains' input until they think for themselves (WP11): hands off the helm. */
const CAPTAIN: ShipInput = idleInput();

/** Advance the match on its sea by one tick of TICK seconds, with the player's input for this tick. */
export function step(sea: Sea, state: MatchState, player: ShipInput): void {
  state.events.length = 0;
  brew(sea, state);
  stir(sea, state);
  for (let i = 0; i < SHIPS; i++) {
    const input = i === 0 ? player : CAPTAIN;
    applyControls(state.ships[i], input);
    sail(sea, state, i, input);
  }
  collide(state);
  chart(state);
  earn(state);
  scoop(state);
  state.tick++;
}

/** Step a match headless with recorded player inputs until it reaches `tick`. */
export function runMatch(sea: Sea, state: MatchState, recording: Recording, tick: number): void {
  const inputs = replay(recording);
  while (state.tick < tick) step(sea, state, inputAt(inputs, state.tick));
}

// The match step: every system of the simulation, in order, once per tick. It is the only code that writes the
// match state, and ShipInput is the only way in: the player's input comes from outside, the captains' from
// inside. Each system appends its call here, in the order the rules need.
import { earn, forage, scoop } from './economy.ts';
import { deadline, over } from './end.ts';
import { brew, stir, type Sea } from './environment.ts';
import { applyControls, idleInput, inputAt, replay, type Recording, type ShipInput } from './input.ts';
import { coast, ride } from './opening.ts';
import { collide, sail } from './sailing.ts';
import { PHASE, SHIPS, type MatchState } from './state.ts';
import { chart } from './territory.ts';

/** The captains' input until they think for themselves (WP11): hands off the helm. */
const CAPTAIN: ShipInput = idleInput();

/** Advance the match on its sea by one tick of TICK seconds, with the player's input for this tick. Once over, it stands still. */
export function step(sea: Sea, state: MatchState, player: ShipInput): void {
  if (over(state)) return;
  state.events.length = 0;
  brew(sea, state);
  stir(sea, state);
  for (let i = 0; i < SHIPS; i++) {
    const ship = state.ships[i], input = i === 0 ? player : CAPTAIN;
    if (ship.phase === PHASE.sunk) continue;
    applyControls(ship, input);
    if (ship.phase === PHASE.riding) ride(sea, state, i, input);
    else {
      sail(sea, state, i, input);
      if (ship.phase === PHASE.peeling) coast(sea, state, i);
    }
  }
  collide(state);
  chart(state);
  earn(sea, state);
  forage(sea, state);
  scoop(state);
  deadline(state);
  state.tick++;
}

/** Step a match headless with recorded player inputs until it reaches `tick` or is over. */
export function runMatch(sea: Sea, state: MatchState, recording: Recording, tick: number): void {
  const inputs = replay(recording);
  while (state.tick < tick && !over(state)) step(sea, state, inputAt(inputs, state.tick));
}

/**
 * The rest of the match at once, headless, once the player has sunk (PROMPT.md, Sinking and the end): the very steps
 * it would have taken, to its end, which the deadline (end.ts) guarantees.
 */
export function resolve(sea: Sea, state: MatchState): void {
  const still = idleInput();
  while (!over(state)) step(sea, state, still);
}

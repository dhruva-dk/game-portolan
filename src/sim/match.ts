// The match step: every system of the simulation, in order, once per tick. It is the only code that writes the
// match state, and ShipInput is the only way in: the player's input comes from outside, the captains' from
// inside. Each system appends its call here, in the order the rules need.
import { combat } from './combat.ts';
import { earn, forage, scoop } from './economy.ts';
import { over } from './end.ts';
import { brew, stir, type Sea } from './environment.ts';
import { gullEyes, gulls } from './gull.ts';
import { applyControls, idleInput, inputAt, replay, type Recording, type ShipInput } from './input.ts';
import { items } from './items.ts';
import { coast, ride } from './opening.ts';
import { collide, sail } from './sailing.ts';
import { PHASE, SHIPS, type MatchState } from './state.ts';
import { storm } from './storm.ts';
import { chart } from './territory.ts';
import { newSight, noteFog, survey } from './visibility.ts';

/** Each ship's input this tick: the player's, then the captains', hands off the helm until they think for themselves (WP11). */
const INPUTS: ShipInput[] = Array.from({ length: SHIPS }, idleInput);

/** What every ship sees this tick, surveyed once the hulls have moved: whom its guns may engage (and, WP11, what its captain knows). */
const SIGHT = Array.from({ length: SHIPS }, newSight);

/** Advance the match on its sea by one tick of TICK seconds, with the player's input for this tick. Once over, it stands still. */
export function step(sea: Sea, state: MatchState, player: ShipInput): void {
  if (over(state)) return;
  state.events.length = 0;
  brew(sea, state);
  stir(sea, state);
  INPUTS[0] = player;
  for (let i = 0; i < SHIPS; i++) {
    const ship = state.ships[i], input = INPUTS[i];
    if (ship.phase === PHASE.sunk) continue;
    applyControls(ship, input);
    if (ship.phase === PHASE.riding) ride(sea, state, i, input);
    else {
      sail(sea, state, i, input);
      if (ship.phase === PHASE.peeling) coast(sea, state, i);
    }
  }
  collide(state);
  survey(sea, state, SIGHT, gullEyes(state));
  combat(sea, state, SIGHT);
  items(sea, state, INPUTS, SIGHT);
  chart(state);
  gulls(sea, state, INPUTS, SIGHT);
  noteFog(state);
  storm(state);
  earn(sea, state);
  forage(sea, state);
  scoop(state);
  state.tick++;
}

/** Step a match headless with recorded player inputs until it reaches `tick` or is over. */
export function runMatch(sea: Sea, state: MatchState, recording: Recording, tick: number): void {
  const inputs = replay(recording);
  while (state.tick < tick && !over(state)) step(sea, state, inputAt(inputs, state.tick));
}

/**
 * The rest of the match at once, headless, once the player has sunk (PROMPT.md, Sinking and the end): the very steps
 * it would have taken, to its end, which the storm's last phase guarantees (storm.ts).
 */
export function resolve(sea: Sea, state: MatchState): void {
  const still = idleInput();
  while (!over(state)) step(sea, state, still);
}

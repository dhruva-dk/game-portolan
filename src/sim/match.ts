import { helm, piloted, think } from './captains/brain.ts';
import { watch } from './captains/learning.ts';
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

const INPUTS: ShipInput[] = Array.from({ length: SHIPS }, idleInput);

export const lastInputs = (): readonly ShipInput[] => INPUTS;

const SIGHT = Array.from({ length: SHIPS }, newSight);

export function step(sea: Sea, state: MatchState, player: ShipInput): void {
  if (over(state)) return;
  state.events.length = 0;
  brew(sea, state);
  stir(sea, state);
  INPUTS[0] = player;
  for (let i = piloted(state) ? 0 : 1; i < SHIPS; i++) helm(state, i, INPUTS[i]);
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
  for (let i = piloted(state) ? 0 : 1; i < SHIPS; i++) think(sea, state, i, SIGHT[i], INPUTS[i]);
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
  for (let i = 1; i < SHIPS; i++) watch(state, i, SIGHT[i]);
}

export function runMatch(sea: Sea, state: MatchState, recording: Recording, tick: number): void {
  const inputs = replay(recording);
  while (state.tick < tick && !over(state)) step(sea, state, inputAt(inputs, state.tick));
}

export function resolve(sea: Sea, state: MatchState): void {
  const still = idleInput();
  while (!over(state)) step(sea, state, still);
}

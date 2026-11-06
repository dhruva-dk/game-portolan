// The seaway: how rough the water is where a ship sails, and how her deck rolls in it. The render builds its sea from
// the same wind and weather (render/gpu/stage.ts, seaFromWind: the wind's speed and a squall's or a thunderhead's own),
// so a ship rolls hardest where the sea is drawn highest, and the lee of an island is a steady platform.
//
// A rolling deck throws off aim. Each ship rolls at her own period with a second, quicker roll over it, so the motion
// never quite repeats; a gun is steadiest at the top of each roll, where the deck hangs a moment before coming back,
// and wildest as she swings through upright. A broadside fired as her side lifts throws long, up into the rigging, and
// as it falls throws short, into the hull: the gunner's old choice of the up-roll or the down-roll.
import { PI, dcos, dsin, length } from './math.ts';
import { TICK, type MatchState } from './state.ts';
import { SEAWAY } from './tables.ts';
import { newSky, skyAt } from './weather.ts';
import { newWind, windAt } from './wind.ts';

const W = newWind(), SKY = newSky();

/** How rough the water is at p: 0 a sea too slight to roll a hull, 1 a full gale's. */
export function seaState(state: MatchState, p: { x: number; y: number; z: number }): number {
  windAt(state, p, W);
  skyAt(state, p, SKY);
  const storm = Math.max(SKY.rain * 0.55, SKY.thunder);
  const speed = Math.min(Math.max(length(W.v), 2) + storm * 9, 20);
  return Math.max(0, Math.min(1, (speed - SEAWAY.flat) / (SEAWAY.full - SEAWAY.flat)));
}

/** Ship i's deck: its roll (radians, positive with her starboard side down) and how unsteady it is (0 hanging at the
 *  top of a roll, 1 swinging through upright fastest). */
export interface Deck {
  roll: number;
  unsteady: number;
  sea: number;
}

/** Ship i's deck at this tick, in a sea `sea` rough (seaState). Her own period comes from her place in the fleet. */
export function deckOf(state: MatchState, i: number, sea: number, out: Deck): Deck {
  const t = state.tick * TICK, own = 0.88 + 0.24 * ((i * 0.6180339887) % 1);
  const w = (2 * PI) / (SEAWAY.period * own), w2 = w * 1.73, p = i * 2.399, p2 = i * 1.13;
  const a = SEAWAY.roll * sea;
  out.roll = a * (0.8 * dsin(w * t + p) + 0.2 * dsin(w2 * t + p2));
  // the deck's angular speed, as a share of the fastest it swings
  const v = Math.abs(0.8 * w * dcos(w * t + p) + 0.2 * w2 * dcos(w2 * t + p2)) / (0.8 * w + 0.2 * w2);
  out.unsteady = Math.min(1, v);
  out.sea = sea;
  return out;
}

/** The deck of ship i where she is now. */
export const deckAt = (state: MatchState, i: number, out: Deck): Deck => deckOf(state, i, seaState(state, state.ships[i].pos), out);

export const newDeck = (): Deck => ({ roll: 0, unsteady: 0, sea: 0 });

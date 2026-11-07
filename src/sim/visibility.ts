// Who can see whom. A ship sees another within the sightline (about 240 m, less in fog), unless land stands
// between them or it hides in smoke. At night, ships beyond about 150 m show only as a lantern: no name, no
// health bar. Separately, a ship is on the map unless fog or Hidden Wake hides it; Reveal and Spotter show it.
import { isNight } from './environment.ts';
import { lineOfSight } from './nav.ts';
import { hasPerk } from './perks.ts';
import { inSmoke } from './powers.ts';
import { apart } from './sphere.ts';
import { PHASE, SHIPS, type MatchState } from './state.ts';
import { POWERS, SIGHT } from './tables.ts';
import { atHome } from './territory.ts';
import { inFog, newSky, skyAt } from './weather.ts';

export const SEEN = {
  /** In sight. */
  visible: 1,
  /** In sight but only as a lantern: no name or health bar. */
  lantern: 2,
  /** On this ship's map. */
  map: 4,
} as const;

const SKY = newSky();

/** How far ship i can see right now. */
export function sightOf(state: MatchState, i: number): number {
  const ship = state.ships[i];
  if (hasPerk(ship, 'fogSight')) return SIGHT.range;
  skyAt(state, ship.pos, SKY);
  return SIGHT.range * SKY.sight;
}

/** What viewer v knows of ship j, as SEEN bits. */
export function seen(state: MatchState, v: number, j: number): number {
  const a = state.ships[v], b = state.ships[j];
  if (v === j) return SEEN.visible | SEEN.map;
  if (b.phase === PHASE.sunk) return 0;
  let out = 0;
  if (b.phase !== PHASE.sea) {
    // up in the Gale or gliding down: everyone can see the sky
    return SEEN.visible | SEEN.map;
  }
  const d = apart(a.pos, b.pos);
  const range = Math.min(sightOf(state, v), skyRange(state, j));
  // past the lantern's range at night a ship shows only as its lantern
  const dark = d > SIGHT.lantern && isNight(state, b.pos) && !hasPerk(a, 'fogSight');
  if (d <= range && !(inSmoke(state, j) && d > 12) && (d < 30 || lineOfSight(a.pos, b.pos))) {
    out |= SEEN.visible;
    if (dark) out |= SEEN.lantern;
  }
  const hidden = inFog(state, b.pos) || (hasPerk(b, 'hiddenWake') && atHome(state, j)) || inSmoke(state, j);
  if (!hidden && (out & SEEN.visible) !== 0) out |= SEEN.map;
  if (b.spotted > 0 || (a.revealed > 0 && d <= POWERS.reveal.r)) out |= SEEN.map;
  return out;
}

/** Fog around the target shortens the sightline to it too. */
function skyRange(state: MatchState, j: number): number {
  skyAt(state, state.ships[j].pos, SKY);
  return SIGHT.range * SKY.sight;
}

/** Every ship's view of every other, as SEEN bits: out[v * SHIPS + j]. */
export function survey(state: MatchState, out: Uint8Array): Uint8Array {
  for (let v = 0; v < SHIPS; v++) for (let j = 0; j < SHIPS; j++) out[v * SHIPS + j] = state.ships[v].phase === PHASE.sunk ? 0 : seen(state, v, j);
  return out;
}

export function newSurvey(): Uint8Array {
  return new Uint8Array(SHIPS * SHIPS);
}

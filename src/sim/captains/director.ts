// The pacing director: Booth's AI Director from Left 4 Dead ("The AI Systems of Left 4 Dead", AIIDE 2009), at sea.
// It reads how hard the match is pressing the player as one number, their heat: hull and shield they lose, damage they
// deal, ships going down round them. Heat fades away over a quiet sea. The match runs through build-up, peak and
// relax:
// - build-up: the sea is left to itself. If it stays quiet for too long (a lull, shorter as the circle closes), one
//   captain within earshot but out of sight is given a hunch of where the player is, a spot near them it goes to see
//   like a sound of guns, so a match never stalls into an empty sea.
// - peak: heat has climbed past a line; the fight plays out however it plays out.
// - relax: once it has passed, the water round the player is kept clear for a while. Captains not already in the fight
//   let the sound of it go and look elsewhere, and a captain who comes on the player and hasn't been shot by them is in
//   less of a hurry to start another. That gives a battered player the moment to mend, loot and reposition that
//   makes the next fight a choice, not a pile-on.
// It only steers where captains go and what they are minded to start, never what they see or how they aim, and it
// stands down for the last few ships, when the circle brings everyone together anyway. Off for a captained player.
import { hash32, type V3 } from '../math.ts';
import { along, apart, tangentAt } from '../sphere.ts';
import { EVENT, FLAG, PHASE, PLAYER, SHIPS, TICK, type MatchState } from '../state.ts';
import { stormPhase } from '../storm.ts';
import { isWeapon } from '../tables.ts';
import { styleOf } from './temperaments.ts';

export const PACE = { build: 0, peak: 1, relax: 2 } as const;
export const PACE_NAMES = ['build', 'peak', 'relax'] as const;

export const DIRECTOR = {
  /** Heat per hull and shield point the player loses, and per point they deal; heat for a ship sunk within `near`
   *  metres of them (their own kills included). */
  taken: 1 / 70,
  dealt: 1 / 150,
  sunk: 0.35,
  near: 220,
  /** Share of heat that fades a second, and the most it holds. */
  fade: 0.07,
  most: 2,
  /** Heat at which a peak begins, and below which it has passed; seconds a peak holds at the least, and at the most. */
  peak: 0.85,
  passed: 0.4,
  hold: 4,
  longest: 30,
  /** Seconds the player's water is kept clear after a peak, by Storm phase: shorter as the circle closes. */
  relax: [30, 30, 26, 22, 16, 10, 0, 0],
  /** Seconds of quiet before a captain is given a hunch, by Storm phase, and the heat under which the sea counts as
   *  quiet. */
  lull: [75, 60, 50, 42, 34, 26, 20, 20],
  quiet: 0.12,
  /** Metres round the player kept clear while relaxing. */
  clear: 170,
  /** A hunch lands this far from the player at the most, and goes to a captain this far off (out of sight, in
   *  earshot). */
  blur: 70,
  from: [200, 520],
  /** With this many ships afloat or fewer, it stands down. */
  last: 4,
} as const;

/** Runs the director for this tick, from this tick's events. */
export function direct(state: MatchState): void {
  const me = state.ships[PLAYER], d = state.director;
  if (me.captain.on || me.phase !== PHASE.sea) return;
  for (const e of state.events) {
    if (e.kind === EVENT.hit && (e.flag & FLAG.steady) === 0) {
      if (e.ship === PLAYER) d.heat += (e.shield + e.hull) * DIRECTOR.taken;
      else if (e.by === PLAYER) d.heat += (e.shield + e.hull) * DIRECTOR.dealt;
    } else if (e.kind === EVENT.sink && e.ship !== PLAYER && apart(state.ships[e.ship].pos, me.pos) < DIRECTOR.near) d.heat += DIRECTOR.sunk;
  }
  d.heat = Math.min(DIRECTOR.most, d.heat * (1 - DIRECTOR.fade * TICK));
  d.t += TICK;
  const phase = stormPhase(state);
  if (d.phase === PACE.build) {
    d.quiet = d.heat < DIRECTOR.quiet ? d.quiet + TICK : 0;
    if (d.heat >= DIRECTOR.peak) enter(d, PACE.peak);
    else if (d.quiet >= DIRECTOR.lull[phase] && !standsDown(state)) {
      // one hunch per lull; the next comes after another, a little shorter
      d.quiet = DIRECTOR.lull[phase] * 0.4;
      hunch(state);
    }
  } else if (d.phase === PACE.peak) {
    if ((d.t >= DIRECTOR.hold && d.heat < DIRECTOR.passed) || d.t >= DIRECTOR.longest) enter(d, DIRECTOR.relax[phase] > 0 ? PACE.relax : PACE.build);
  } else {
    if (d.heat >= DIRECTOR.peak) enter(d, PACE.peak);
    else if (d.t >= DIRECTOR.relax[phase]) enter(d, PACE.build);
  }
}

function enter(d: MatchState['director'], phase: number): void {
  d.phase = phase;
  d.t = 0;
  d.quiet = 0;
}

function standsDown(state: MatchState): boolean {
  let afloat = 0;
  for (const s of state.ships) if (s.phase !== PHASE.sunk) afloat++;
  return afloat <= DIRECTOR.last;
}

/** Metres round the player that captain i keeps clear of now (the director relaxing), or 0. Not for a captain
 *  already fighting the player, or with a grudge against them. */
export function keptClear(state: MatchState, i: number): number {
  const d = state.director, me = state.ships[PLAYER], c = state.ships[i].captain;
  if (d.phase !== PACE.relax || me.captain.on || me.phase !== PHASE.sea || i === PLAYER) return 0;
  if (c.grudge > 0 || (c.foe === PLAYER && state.ships[i].lastBy === PLAYER)) return 0;
  return standsDown(state) ? 0 : DIRECTOR.clear;
}

/** Gives the likeliest captain in earshot, but out of sight, a hunch of a spot near the player. */
function hunch(state: MatchState): void {
  const me = state.ships[PLAYER], now = state.tick * TICK;
  let best = -1, bs = -1e9;
  for (let i = 0; i < SHIPS; i++) {
    const s = state.ships[i], c = s.captain;
    if (i === PLAYER || !c.on || c.gentle || s.phase !== PHASE.sea || c.foe >= 0 || s.hull < 50) continue;
    if (!s.slots.some((x) => isWeapon(x.kind))) continue;
    const far = apart(s.pos, me.pos);
    if (far < DIRECTOR.from[0] || far > DIRECTOR.from[1]) continue;
    const st = styleOf(s);
    if (st.fight < 0.3) continue;
    const score = st.fight + 0.3 * c.aggro - far / 800;
    if (score > bs) {
      bs = score;
      best = i;
    }
  }
  if (best < 0) return;
  const c = state.ships[best].captain, h = hash32(state.seed ^ 0xd1ec7, state.tick);
  const a = ((h & 0xffff) / 0x10000) * 2 * Math.PI, r = DIRECTOR.blur * (0.4 + 0.6 * ((h >>> 16) / 0x10000));
  along(me.pos, tangentAt(me.pos, a, SIDE), r, c.heard);
  c.heardT = now;
  c.hunch = true;
  state.director.hunches++;
}

const SIDE: V3 = { x: 0, y: 0, z: 0 };

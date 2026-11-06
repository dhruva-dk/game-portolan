// What the captains hear, and see from afar. Gunfire carries well past the horizon, a ship going down is heard
// further still, a mast going over the side cracks like a shot, and the smoke of a burning ship stands up over the
// curve of the sea where her hull is long out of sight. Each makes a noise where it happened, which fades over
// NOISE.life seconds. A captain with nothing in sight hears the loudest noise in its reach and may go to see what it is
// (brain.ts), and the noises are the danger layer of the captains' influence map (influence.ts): this is how a fight
// draws in a third ship, and how a quiet captain learns which water to keep out of.
//
// Fair perception: a noise is only what any ship in earshot could hear, and fog hides smoke but not the guns.
import type { V3 } from '../math.ts';
import { apart } from '../sphere.ts';
import { EVENT, PHASE, SHIPS, TICK, copy, type MatchState, type Noise } from '../state.ts';
import { ITEM } from '../tables.ts';
import { newSky, skyAt } from '../weather.ts';

/** What made a noise. */
export const SOUND = { gun: 0, sink: 1, smoke: 2, crash: 3 } as const;

export const NOISE = {
  /** Seconds a noise lasts, fading all the while. */
  life: 25,
  /** Metres at which a noise of loudness 1 fades out; smoke is seen out to `sighted` metres in clear air. */
  reach: 560,
  sighted: 460,
  /** Loudness of a shot by weapon kind (anything else `gun`), a broadside's report, a sinking, a mast falling, and a
   *  burning ship's smoke. */
  guns: { [ITEM.cannon]: 0.8, [ITEM.scatter]: 0.6, [ITEM.harpoon]: 0.35, [ITEM.mortar]: 0.9, [ITEM.repeater]: 0.55, [ITEM.chain]: 0.8, [ITEM.heated]: 0.75 } as Record<number, number>,
  gun: 0.7,
  broadside: 1,
  sink: 1,
  crash: 0.75,
  smoke: 0.8,
  /** A noise this close to a fresh one of the same kind by the same ship is folded into it; at most `most` are kept. */
  merge: 60,
  most: 32,
  /** A captain doesn't count noises its own ship made, or any within `own` metres of it. */
  own: 30,
} as const;

const SKY = newSky();

/** Notes this tick's noises: the guns fired, ships sunk and masts felled, and (each second) the smoke of every
 *  burning ship. Fades the old ones out. */
export function listen(state: MatchState): void {
  const now = state.tick * TICK;
  const n = state.noise;
  for (let k = n.length - 1; k >= 0; k--) if (now - n[k].t > NOISE.life) n.splice(k, 1);
  for (const e of state.events) {
    if (e.kind === EVENT.fire) noise(state, SOUND.gun, e.at, e.flag === 3 ? NOISE.broadside : NOISE.guns[e.item] ?? NOISE.gun, e.ship, now);
    else if (e.kind === EVENT.sink) noise(state, SOUND.sink, state.ships[e.ship].pos, NOISE.sink, e.ship, now);
    else if (e.kind === EVENT.mastFall) noise(state, SOUND.crash, state.ships[e.ship].pos, NOISE.crash, e.ship, now);
  }
  if (state.tick % 30 === 0) {
    for (let i = 0; i < SHIPS; i++) {
      const s = state.ships[i];
      if (s.phase === PHASE.sea && s.burn > 0) noise(state, SOUND.smoke, s.pos, NOISE.smoke, i, now);
    }
  }
}

function noise(state: MatchState, kind: number, at: V3, loud: number, by: number, now: number): void {
  const n = state.noise;
  for (const x of n) {
    if (x.kind === kind && x.by === by && apart(x.at, at) < NOISE.merge) {
      copy(x.at, at);
      x.loud = Math.max(loud, x.loud * fade(x, now));
      x.t = now;
      return;
    }
  }
  if (n.length >= NOISE.most) {
    // the faintest goes
    let k = 0;
    for (let j = 1; j < n.length; j++) if (n[j].loud * fade(n[j], now) < n[k].loud * fade(n[k], now)) k = j;
    n.splice(k, 1);
  }
  n.push({ kind, at: { x: at.x, y: at.y, z: at.z }, t: now, loud, by });
}

/** How much of a noise is left, 1 fresh .. 0 gone. */
export const fade = (x: Noise, now: number): number => Math.max(0, 1 - (now - x.t) / NOISE.life);

/** How loud noise `x` is at p, 0 when out of earshot (or, for smoke, out of sight through the weather). */
export function loudness(state: MatchState, x: Noise, p: V3, now: number): number {
  const d = apart(x.at, p);
  let reach = NOISE.reach * x.loud;
  if (x.kind === SOUND.smoke) {
    skyAt(state, p, SKY);
    reach = NOISE.sighted * x.loud * SKY.sight;
  }
  if (d >= reach) return 0;
  return x.loud * fade(x, now) * (1 - d / reach);
}

/** The loudest noise ship i hears that it didn't make (nor ship `but`, one it has in sight), as an index into
 *  state.noise, or -1. Its place in `out`. */
export function hears(state: MatchState, i: number, out: V3, but = -1): number {
  const ship = state.ships[i], now = state.tick * TICK;
  let best = -1, bl = 0.04;
  for (let k = 0; k < state.noise.length; k++) {
    const x = state.noise[k];
    if (x.by === i || x.by === but || apart(x.at, ship.pos) < NOISE.own) continue;
    const l = loudness(state, x, ship.pos, now);
    if (l > bl) {
      bl = l;
      best = k;
    }
  }
  if (best >= 0) copy(out, state.noise[best].at);
  return best;
}

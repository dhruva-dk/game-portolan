// What captains learn of the player, match after match. Each captain watches the player and keeps an expectation
// (a value and a confidence) of five habits: which region they dive to, how big the loops they claim, how often
// they cut others' trails, how low their hull runs before they turn to heal or flee, and how long they linger in
// the Storm. The career carries these from match to match (setup fleet[i].mind in, result().minds out).
import { PHASE, PLAYER, TICK, type Expect, type MatchState } from '../state.ts';
import { EVENT } from '../state.ts';
import { inStorm } from '../storm.ts';
import { seen, SEEN } from '../visibility.ts';

export const WATCH = { rate: 0.35, gain: 0.25, raid: 1, sighted: 0.5 } as const;

/** Folds one observation into an expectation. */
export function learn(e: Expect, x: number, rate: number = WATCH.rate): void {
  e.value = e.confidence > 0 ? e.value + rate * (x - e.value) : x;
  e.confidence = Math.min(1, e.confidence + WATCH.gain * (1 - e.confidence) + 0.05);
}

/** A region is not a quantity: a repeat raises confidence, a change resets it. */
function learnRegion(e: Expect, r: number): void {
  if (e.confidence > 0 && e.value === r) e.confidence = Math.min(1, e.confidence + WATCH.gain);
  else {
    e.value = r;
    e.confidence = 0.3;
  }
}

/** Captain i watches the player through this tick's events. */
export function watch(state: MatchState, i: number): void {
  const c = state.ships[i].captain, p = state.ships[PLAYER];
  if (!c.watches || p.captain.on || i === PLAYER) return;
  for (const e of state.events) {
    if (e.ship !== PLAYER && e.by !== PLAYER) continue;
    if (e.kind === EVENT.landing && e.ship === PLAYER) learnRegion(c.dive, e.item);
    else if (e.kind === EVENT.claim && e.ship === PLAYER && e.amount > 50) learn(c.loop, Math.sqrt(e.amount / 3.14159));
    else if (e.kind === EVENT.cut && e.by === PLAYER) learn(c.raids, c.raids.value + WATCH.raid, 1);
    else if (e.kind === EVENT.useStart && e.ship === PLAYER && p.hull < 90) learn(c.run, p.hull);
  }
  // the Storm: seconds the player lingers outside the circle, noted when they come back in
  if (p.phase === PHASE.sea && (state.tick + i) % 15 === 0) {
    const out = inStorm(state, p.pos);
    if (out) c.felt += 15 * TICK;
    else if (c.felt > 0) {
      learn(c.storm, c.felt);
      c.felt = 0;
    }
  }
  // being seen sharpens a grudge
  if ((state.tick + i) % 30 === 0 && p.phase === PHASE.sea) c.eyed = (seen(state, i, PLAYER) & SEEN.visible) !== 0;
}


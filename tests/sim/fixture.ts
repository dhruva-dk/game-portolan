// A quiet match for the mechanics tests: twenty ships with no captains, already at sea on open water, at noon
// with no tilt, under the standard rule. Ships a test doesn't drive hold still with their sails furled.
// Loot and weather are cleared unless asked for, so each test sees only what it sets up.
import { idleInput, type ShipInput } from '../../src/sim/input.ts';
import { step } from '../../src/sim/match.ts';
import { PI, v3, type V3 } from '../../src/sim/math.ts';
import { RULE } from '../../src/sim/rules.ts';
import { nav, navCell } from '../../src/sim/nav.ts';
import { createMatch } from '../../src/sim/setup.ts';
import { along, apart, tangentAt } from '../../src/sim/sphere.ts';
import { PHASE, SHIPS, TICK, copy, type MatchState } from '../../src/sim/state.ts';
import { CENTRES, DRAFT, REGION_COUNT, TIDE_AMPLITUDE, currentAt, heightAt, regionAt } from '../../src/sim/world/index.ts';

export interface Quiet {
  seed?: number;
  rule?: number;
  hour?: number;
  tilt?: number;
  /** Keep the loot the match laid out. */
  loot?: boolean;
  /** Keep the weather the match brewed. */
  weather?: boolean;
}

export interface Course {
  pos: V3;
  head: V3;
}

const deep = (p: V3, margin: number): boolean => heightAt(p) < -TIDE_AMPLITUDE - DRAFT - margin;
const still = (p: V3, c: V3): boolean => {
  currentAt(p, c);
  return Math.hypot(c.x, c.y, c.z) < 0.05;
};

/**
 * Open water in a region with a clear run ahead: `margin` metres under the keel at low tide, no current, and
 * nothing within `side` metres either side for `run` metres. Searched outward from the region's centre, from
 * `bearing` round.
 */
export function openWater(region: number, run = 160, side = 50, bearing = 0, margin = 2): Course {
  const c = CENTRES[region], T = v3(), P = v3(), Q = v3(), H = v3(), S = v3(), F = v3();
  for (let d = 40; d <= 320; d += 10) {
    for (let k = 0; k < 24; k++) {
      tangentAt(c, bearing + (k * PI) / 12, T);
      along(c, T, d, P);
      // in the open: nothing shut on the nav grid within a few cells, as the lightning's own test has it
      if (regionAt(P) !== region || !deep(P, margin) || nav().clear[navCell(P)] < 4) continue;
      for (let h = 0; h < 8; h++) {
        tangentAt(P, (h * PI) / 4, H);
        let ok = true;
        for (let s = -16; s <= run && ok; s += 8) {
          along(P, H, s, Q);
          // the run may cross a shoal's bank, which leaves 0.7 m under the keel at low tide
          if (!deep(Q, Math.min(margin, 0.5)) || !still(Q, F)) ok = false;
          for (const off of [-side, side]) {
            if (!ok) break;
            tangentAt(Q, (h * PI) / 4 + PI / 2, S);
            along(Q, S, off, S);
            if (heightAt(S) > -DRAFT) ok = false;
          }
        }
        if (ok) return { pos: v3(P.x, P.y, P.z), head: v3(H.x, H.y, H.z) };
      }
    }
  }
  throw new Error(`fixture: no open water with a ${run} m run in region ${region}`);
}

/** Puts ship i on the water at a spot, heading along a course, at rest. */
export function place(state: MatchState, i: number, at: Course, speed = 0): void {
  const ship = state.ships[i];
  ship.phase = PHASE.sea;
  copy(ship.pos, at.pos);
  copy(ship.was, at.pos);
  copy(ship.head, at.head);
  ship.alt = 0;
  ship.vy = 0;
  ship.speed = speed;
  ship.rate = 0;
  ship.landed = state.tick;
}

const SPOTS: Course[] = [];

/** Where each ship of the quiet match waits: one to a region, the last four on the far side of four of them. */
function spot(i: number): Course {
  if (!SPOTS[i]) SPOTS[i] = openWater(i % REGION_COUNT, 24, 12, i < REGION_COUNT ? 0 : PI, 0.3);
  return SPOTS[i];
}

/** Five systems too small to touch anything, that never end: weather that leaves the sea alone. */
function clearSkies(state: MatchState): void {
  for (const s of state.weather) {
    s.kind = 0;
    s.r = 1e-6;
    s.age = 1e6;
    s.life = 1e9;
    s.gap = 1e9;
  }
}

export function quietMatch(q: Quiet = {}): MatchState {
  const state = createMatch({
    seed: q.seed ?? 7, rule: q.rule ?? RULE.none, hour: q.hour ?? 12, tilt: q.tilt ?? 0,
    fleet: Array.from({ length: SHIPS }, () => ({ captain: false })),
  });
  for (let i = 0; i < SHIPS; i++) place(state, i, spot(i));
  if (!q.loot) state.loot.length = 0;
  if (!q.weather) clearSkies(state);
  return state;
}

/** Furled sails, helm amidships. */
export const hold = (): ShipInput => ({ ...idleInput(), throttle: 0 });

/** A ship sailing straight on under full sail, its other controls at rest. */
export const sailOn = (over: Partial<ShipInput> = {}): ShipInput => ({ ...idleInput(), ...over });

const HELD: ShipInput[] = Array.from({ length: SHIPS }, hold);

/**
 * Runs the match for `seconds`. `drive` gives a ship's input each tick, or null to hold it still; `each` is
 * called after every tick and stops the run when it returns true.
 */
export function run(
  state: MatchState, seconds: number, drive: (i: number, tick: number) => ShipInput | null = () => null,
  each?: (state: MatchState) => boolean | void,
): void {
  const inputs: ShipInput[] = new Array(SHIPS);
  const end = state.tick + Math.round(seconds / TICK);
  while (state.tick < end) {
    for (let i = 0; i < SHIPS; i++) inputs[i] = drive(i, state.tick) ?? HELD[i];
    step(state, null, inputs);
    if (each?.(state)) return;
  }
}

/** The events of a kind raised on the last tick. */
export const events = (state: MatchState, kind: number) => state.events.filter((e) => e.kind === kind);

/** Metres between two ships. */
export const gap = (state: MatchState, i: number, j: number): number => apart(state.ships[i].pos, state.ships[j].pos);

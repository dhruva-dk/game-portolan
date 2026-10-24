// Sinking and the end (PROMPT.md, A match: Sinking and the end, The results). Every sinking goes through sink() —
// combat's (WP8 part B), the storm's (part C) and the deadline's below — which ranks the ship by the order it sank,
// spills its purse, frees its sea, pays its sinker's bounty and drops one of its fittings as a chest. When one ship is
// left afloat it has won and the match stands still; result() then explains the match.
import { spill } from './economy.ts';
import { rngInt, set } from './math.ts';
import { AREA_Q } from './sphere.ts';
import { CAUSE, EVENT, PHASE, SHIPS, STREAM, TICK, afloat, chronicle, emit, type Entry, type MatchState } from './state.ts';
import { END, FITTING, MOMENTS, TREASURE } from './tables.ts';
import { founder } from './territory.ts';

/** The player's ship. */
const PLAYER = 0;
/** The deadline's tick. */
const LAST = Math.round(END.deadline / TICK);
/** The timeline's kinds whose `by` is a ship, so a moment of the player's when it is either one (part B adds the fights). */
const RIVALRY: readonly number[] = [EVENT.broken, EVENT.lead, EVENT.sunk];

/** The match is over: one ship is left afloat, the winner. */
export const over = (state: MatchState): boolean => state.winner >= 0;

/**
 * Ship i sinks, `by` the ship that sank it (−1 none), of a CAUSE: it is ranked below every ship still afloat, its purse
 * spills where it went down, its trail washes away and its sea falls to nobody, its sinker banks END.bounty (twice over
 * for sinking the pennant's holder), and one of its fittings, drawn on the loot stream, floats up in a chest at the
 * wreck. A ship already sunk, or any ship once the match is over, is left as it is.
 */
export function sink(state: MatchState, i: number, by: number, cause: number): void {
  const ship = state.ships[i];
  if (!afloat(ship) || over(state)) return;
  const bounty = END.bounty * (state.leader === i ? 2 : 1);
  ship.phase = PHASE.sunk;
  ship.speed = 0;
  ship.rate = 0;
  ship.prize = -1;
  ship.holding = 0;
  set(ship.was, ship.pos.x, ship.pos.y, ship.pos.z); // it lies still: nothing left to draw between ticks
  set(ship.wasHead, ship.head.x, ship.head.y, ship.head.z);
  if (ship.purse > 0) spill(state, ship.pos, ship.purse, i);
  ship.purse = 0;
  founder(state, i);
  state.sunk.push({ ship: i, by, cause, tick: state.tick });
  emit(state, EVENT.sunk, i, by, ship.pos, cause);
  chronicle(state, EVENT.sunk, i, by, cause);
  if (by >= 0 && by !== i) {
    state.ships[by].bank += bounty;
    emit(state, EVENT.bounty, by, i, ship.pos, bounty);
  }
  dropChest(state, i);
  let left = 0;
  for (const s of state.ships) if (afloat(s)) left++;
  if (left === 1) win(state);
}

/** One of sunk ship i's fittings, drawn on the loot stream, leaves the wreck in a chest (WP9 says how chests are taken). */
function dropChest(state: MatchState, i: number): void {
  const ship = state.ships[i];
  let n = 0;
  for (const f of ship.fittings) if (f.kind !== FITTING.none) n++;
  if (n === 0) return;
  let k = rngInt(state.rng[STREAM.loot], n);
  for (const f of ship.fittings) {
    if (f.kind === FITTING.none) continue;
    if (k-- > 0) continue;
    state.chests.push({ at: { ...ship.pos }, fitting: { kind: f.kind, tier: f.tier }, from: i });
    emit(state, EVENT.chest, i, f.kind, ship.pos, f.tier);
    f.kind = FITTING.none;
    f.tier = 0;
    return;
  }
}

/** The last ship afloat has won: the match is over. */
function win(state: MatchState): void {
  const w = state.ships.findIndex(afloat), ship = state.ships[w];
  state.winner = w;
  emit(state, EVENT.win, w, -1, ship.pos, ship.held / AREA_Q);
  chronicle(state, EVENT.win, w, -1, ship.held / AREA_Q);
}

/**
 * The step's last system. At END.deadline the storm has covered the sea (part C closes it by then), and the ships
 * still afloat founder in it, the one holding the least sea first (then the poorer bank, then the lower index), until
 * one is left: no match runs on, and a fast-forward always ends.
 */
export function deadline(state: MatchState): void {
  if (state.tick < LAST) return;
  while (!over(state)) {
    let w = -1;
    for (let i = 0; i < SHIPS; i++) {
      const s = state.ships[i], o = w >= 0 ? state.ships[w] : null;
      if (afloat(s) && (o === null || s.held < o.held || (s.held === o.held && s.bank < o.bank))) w = i;
    }
    sink(state, w, -1, CAUSE.storm);
  }
}

/** One ship's match, for the results and the career. */
export interface Finish {
  ship: number;
  /** 1 the winner … SHIPS the first to sink. */
  place: number;
  /** The tick it sank at, or the match ended at for the winner. */
  tick: number;
  /** The ship that sank it (−1 none, and for the winner) and its CAUSE (−1 for the winner). */
  by: number;
  cause: number;
  /** u² of sea claimed over the match: its home disc and every loop it closed. */
  claimed: number;
  /** Ships it sank. */
  sank: number;
  /** Doubloons banked, and the treasure brought home: TREASURE.share of them × its place's multiplier, whole. */
  bank: number;
  treasure: number;
}

/** What a finished match was (PROMPT.md, The results). */
export interface MatchResult {
  /** Ships by finishing place, the winner first. */
  order: number[];
  /** Each ship's match, by ship index. */
  ships: Finish[];
  /**
   * The moments that decided the player's match, in order: where it broke off the current and made its home, its
   * MOMENTS.loops largest loops, the trails it lost and broke, the finds it took, the pennant won and lost, the ships it
   * sank, and how it sank or won.
   */
  timeline: Entry[];
  /** The tick the match ended at. */
  ticks: number;
}

export function result(state: MatchState): MatchResult {
  if (!over(state)) throw new RangeError('result: the match is not over');
  const order = [state.winner], end = state.sunk[state.sunk.length - 1].tick;
  for (let k = state.sunk.length - 1; k >= 0; k--) order.push(state.sunk[k].ship);
  const ships = state.ships.map((ship, i): Finish => {
    const place = order.indexOf(i) + 1, fate = state.sunk.find((s) => s.ship === i);
    let claimed = 0;
    for (const e of state.timeline) if (e.ship === i && (e.kind === EVENT.home || e.kind === EVENT.loop)) claimed += e.amount;
    return {
      ship: i, place, tick: fate ? fate.tick : end, by: fate ? fate.by : -1, cause: fate ? fate.cause : -1, claimed,
      sank: state.sunk.filter((s) => s.by === i).length, bank: ship.bank,
      treasure: Math.floor(ship.bank * TREASURE.share * TREASURE.place[place - 1]),
    };
  });
  const gone = state.timeline.findIndex((e) => e.kind === EVENT.sunk && e.ship === PLAYER); // what follows is not the player's
  const mine = state.timeline.filter((e, k) => (gone < 0 || k <= gone) && (e.ship === PLAYER || (RIVALRY.includes(e.kind) && e.by === PLAYER)));
  const loops = mine.filter((e) => e.kind === EVENT.loop).sort((a, b) => b.amount - a.amount || a.tick - b.tick);
  const kept = loops.slice(0, MOMENTS.loops);
  const timeline = mine.filter((e) => e.kind !== EVENT.loop || kept.includes(e)).map((e) => ({ ...e }));
  return { order, ships, timeline, ticks: end };
}

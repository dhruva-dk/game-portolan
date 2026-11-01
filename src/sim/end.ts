import { spill } from './economy.ts';
import { afloatChest } from './items.ts';
import { rngInt, set } from './math.ts';
import { AREA_Q } from './sphere.ts';
import { EVENT, PHASE, STREAM, afloat, chronicle, emit, type Entry, type MatchState } from './state.ts';
import { END, FITTING, MOMENTS, TREASURE } from './tables.ts';
import { founder } from './territory.ts';

const PLAYER = 0;
const RIVALRY: readonly number[] = [EVENT.broken, EVENT.lead, EVENT.sunk];

export const over = (state: MatchState): boolean => state.winner >= 0;

export function sink(state: MatchState, i: number, by: number, cause: number): void {
  const ship = state.ships[i];
  if (!afloat(ship) || over(state)) return;
  const bounty = END.bounty * (state.leader === i ? 2 : 1);
  ship.phase = PHASE.sunk;
  ship.speed = 0;
  ship.rate = 0;
  ship.prize = -1;
  ship.holding = 0;
  set(ship.was, ship.pos.x, ship.pos.y, ship.pos.z);
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

function dropChest(state: MatchState, i: number): void {
  const ship = state.ships[i];
  let n = 0;
  for (const f of ship.fittings) if (f.kind !== FITTING.none) n++;
  if (n === 0) return;
  let k = rngInt(state.rng[STREAM.loot], n);
  for (const f of ship.fittings) {
    if (f.kind === FITTING.none) continue;
    if (k-- > 0) continue;
    afloatChest(state, ship.pos, f.tier, f, i);
    f.kind = FITTING.none;
    f.tier = 0;
    return;
  }
}

function win(state: MatchState): void {
  const w = state.ships.findIndex(afloat), ship = state.ships[w];
  state.winner = w;
  emit(state, EVENT.win, w, -1, ship.pos, ship.held / AREA_Q);
  chronicle(state, EVENT.win, w, -1, ship.held / AREA_Q);
}

export interface Finish {
  ship: number;
  place: number;
  tick: number;
  by: number;
  cause: number;
  claimed: number;
  sank: number;
  bank: number;
  treasure: number;
}

export interface MatchResult {
  order: number[];
  ships: Finish[];
  timeline: Entry[];
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
  const gone = state.timeline.findIndex((e) => e.kind === EVENT.sunk && e.ship === PLAYER);
  const mine = state.timeline.filter((e, k) => (gone < 0 || k <= gone) && (e.ship === PLAYER || (RIVALRY.includes(e.kind) && e.by === PLAYER)));
  const loops = mine.filter((e) => e.kind === EVENT.loop).sort((a, b) => b.amount - a.amount || a.tick - b.tick);
  const kept = loops.slice(0, MOMENTS.loops);
  const timeline = mine.filter((e) => e.kind !== EVENT.loop || kept.includes(e)).map((e) => ({ ...e }));
  return { order, ships, timeline, ticks: end };
}

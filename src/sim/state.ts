// The whole state of a match: one plain-data object graph that the renderer, interface and audio only read and
// only the step (match.ts) writes. Its shape is declared once, as codec schemas; its TypeScript types, its
// snapshot encoding and its hash all follow from them. To add state, add a field to a schema here and bump
// MATCH_FORMAT.version, so snapshots of the old shape are discarded rather than misread.
import { bytes, decode, encode, hash64, int, list, rec, words, type Format, type Value } from './codec.ts';
import { hash32, rngFrom } from './math.ts';
import { TERRITORY } from './sphere.ts';

/** Seconds per tick: the simulation's fixed timestep. */
export const TICK = 1 / 30;
/** Ships in a match. Ship 0 is the player; ships 1–9 are captains. */
export const SHIPS = 10;

/**
 * The random streams, one generator each, so a system that draws more or fewer numbers never shifts another
 * system's draws. Captain ship i (1–9) draws from stream `captains + i − 1`.
 */
export const STREAM = { world: 0, weather: 1, loot: 2, storm: 3, captains: 4 } as const;
const STREAMS = STREAM.captains + SHIPS - 1;

/** The sail settings that ShipInput.sail steps between. */
export const SAIL = { reefed: 0, plain: 1, full: 2 } as const;

const SHIP = rec(
  ['sail', int], // a SAIL setting
  ['course', list(int)], // the drawn course: territory cells to sail through in order; empty when steering by hand
);

const MATCH = rec(
  ['seed', int], // the match seed, a uint32
  ['tick', int], // ticks stepped; match time is tick·TICK
  ['rng', list(words(4), STREAMS)], // each STREAM's generator
  ['ships', list(SHIP, SHIPS)],
  ['owner', bytes(TERRITORY.cells)], // who holds each territory cell: 0 nobody, else ship index + 1
  ['trail', bytes(TERRITORY.cells)], // whose open trail crosses each cell, coded the same way
);

export type Ship = Value<typeof SHIP>;
export type MatchState = Value<typeof MATCH>;

export const MATCH_FORMAT: Format<typeof MATCH> = { magic: 'PTLM', version: 1, schema: MATCH };

/** Everything a match starts from besides the player's inputs. The career's match setup fills it in. */
export interface MatchSetup {
  /** A uint32. */
  seed: number;
}

export function createMatch(setup: MatchSetup): MatchState {
  const { seed } = setup;
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) throw new RangeError(`createMatch: seed ${seed} is not a uint32`);
  const rng: Uint32Array[] = [];
  for (let s = 0; s < STREAMS; s++) rng.push(rngFrom(hash32(seed, s)));
  const ships: Ship[] = [];
  for (let i = 0; i < SHIPS; i++) ships.push({ sail: SAIL.plain, course: [] });
  return { seed, tick: 0, rng, ships, owner: new Uint8Array(TERRITORY.cells), trail: new Uint8Array(TERRITORY.cells) };
}

/** The snapshot of a match: everything needed to continue it exactly. */
export const encodeMatch = (state: MatchState): Uint8Array => encode(MATCH_FORMAT, state);

/** A match from its snapshot; throws on anything but an intact snapshot of the current format. */
export const decodeMatch = (bytes: Uint8Array): MatchState => decode(MATCH_FORMAT, bytes);

/** The match state's 64-bit hash, 16 hex digits: equal hashes mean identical states. */
export const matchHash = (state: MatchState): string => hash64(encodeMatch(state));

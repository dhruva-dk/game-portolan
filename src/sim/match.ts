// The match's course for the player, as 0117 ran it (app.ts follow, session.ts spectate/rewatch):
//   fighting   at sea, from the start (every ship begins afloat: spawn.ts)
//   spectating she has sunk: who she would watch is her crewmate while she is afloat, else the ship that sank her,
//              or else the one afloat with the most sinkings to her name; when that one sinks, the one that sank her,
//              and so on; she may turn to another afloat (switched)
//   won        the race ended with her afloat
// The race ends (over) when every ship afloat is of one side, or none is (#58: ships 2k and 2k + 1 are side k; with
// no sides given, each ship is a side of her own). What follows is hers to choose (ui/flow.ts). Her place as she
// sinks, as 0117 settled it (sim/end.ts sink): the ships not yet sunk as she sank, herself among them, the sinkings
// of one step counted one by one in the order the game reports them (the race's whole order is play/result.ts's).
// With her place, how she sank and at whose hand: the Storm's sinking goes to the ship that last struck her if it did
// so within CREDIT seconds (credited). Pure: a value stepped by what the game reports.

import type { Cause as RaceCause } from '../race.ts';

export type Phase = 'fighting' | 'spectating' | 'won';

/** The player's ship's id. */
export const PLAYER = 0;

/** The ships in a match, hers among them: the one number everything that counts them follows (0117's tables.ts
 *  MATCH.ships was 20). */
export const SHIPS = 80;

/** How a ship sank: by a ball, a ram, or the Storm; or she never sailed (race.ts: forfeit). */
export type Cause = RaceCause;

/** Each ship's side (race.ts RaceShip), by id: her own id when none is given. */
export type SideOf = (id: number) => number;
const own: SideOf = (id) => id;

/** Whether every ship of `alive` is of one side (true of none): the race is over. */
export const oneSide = (alive: readonly number[], sideOf: SideOf = own) => alive.every((id) => sideOf(id) === sideOf(alive[0]));

/** A ship sunk: who, who sank her (null: the storm, or none), and how. */
export interface Sunk { id: number; by: number | null; cause: Cause }

/** Seconds a blow is credited with a sinking by the Storm after it (0117 end.ts settle). */
export const CREDIT = 8;

/** Who is credited with a sinking by `cause`, the last blow to her `last` (its striker, and seconds since; null: none):
 *  a ball's or a ram's striker always; the Storm's, the last striker within CREDIT seconds, else none. */
export const credited = (cause: Cause, last: { by: number; ago: number } | null): number | null =>
  last && (cause !== 'storm' || last.ago < CREDIT) ? last.by : null;

export interface MatchState {
  phase: Phase;
  /** Her place once it is settled (sunk or won), else null. */
  place: number | null;
  /** Her sinking, once she has sunk: how and at whose hand. */
  sunk: Sunk | null;
  /** The ship she would watch once sunk (hers while she fights, and on a win). */
  watch: number;
  /** Seconds since her end (sunk or won); 0 while she fights. */
  since: number;
  /** The race is over: every ship afloat is of one side, or none is afloat. */
  over: boolean;
  /** How many of the game's sinkings this has read. */
  read: number;
  /** Her share of the planet's water (0…1) as she last held it afloat: kept once her place is settled, as a sunk
   *  ship's water drains (for the result, beside her place). */
  share: number;
}

/** What the game reports each frame: every sinking so far in order, the ids of every ship not sunk, her share of
 *  the planet's water now (0…1), and each ship's side (each her own if not given). */
export interface Report { sinkings: readonly Sunk[]; alive: readonly number[]; share?: number; sideOf?: SideOf }

export const startMatch = (): MatchState => ({
  phase: 'fighting', place: null, sunk: null, watch: PLAYER, since: 0, over: false, read: 0, share: 0,
});

/** Who to watch after `gone` sank, at the hand of `by`: her, if afloat, or the ship afloat with the most sinkings to
 *  her name (the lowest id of those tied). */
function next(by: number | null, r: Report): number {
  if (by !== null && r.alive.includes(by)) return by;
  let best = -1, most = -1;
  for (const id of r.alive) {
    const n = r.sinkings.filter((s) => s.by === id).length;
    if (n > most) [best, most] = [id, n];
  }
  return best;
}

/** The match after a frame of dt seconds and what the game reports. */
export function stepMatch(m: MatchState, r: Report, dt: number): MatchState {
  let s: MatchState = { ...m, read: r.sinkings.length };
  const fresh = r.sinkings.slice(m.read), side = r.sideOf ?? own, over = oneSide(r.alive, side);
  const mine = fresh.find((k) => k.id === PLAYER);
  // (the step she sinks, her water is already draining: what she held is the step before's)
  if (s.phase === 'fighting' && !mine) s.share = r.share ?? s.share;
  if (s.phase !== 'fighting') s.since += dt;
  if (mine && s.phase === 'fighting') {
    const place = r.alive.length + r.sinkings.length - r.sinkings.indexOf(mine);
    const mate = r.alive.find((id) => id !== PLAYER && side(id) === side(PLAYER));
    const watch = mate ?? next(mine.by, r);
    s = { ...s, phase: 'spectating', place, sunk: mine, watch: watch < 0 ? PLAYER : watch };
  } else if (s.phase === 'spectating') {
    // the ship watched has sunk: on to the one that sank her
    const gone = fresh.find((k) => k.id === s.watch);
    if (gone) {
      const watch = next(gone.by, r);
      if (watch >= 0) s = { ...s, watch };
    }
  } else if (s.phase === 'fighting' && fresh.length > 0 && over && r.alive.includes(PLAYER)) {
    // (her place among her side afloat is the race's order's: play/result.ts; first until it is read)
    s = { ...s, phase: 'won', place: 1 };
  }
  s.over = s.phase === 'won' || (s.phase === 'spectating' && over);
  return s;
}

/** Spectating, the ship afloat `by` places on from the one watched (+1 the next, −1 the one before) in the order of
 *  their ids, round and round; at any other time, or with none afloat but her, the match unchanged. */
export function switched(m: MatchState, alive: readonly number[], by: number): MatchState {
  const others = alive.filter((id) => id !== PLAYER);
  if (m.phase !== 'spectating' || others.length === 0) return m;
  // (from a ship no longer afloat, the next on is the first after it)
  const at = others.findIndex((id) => id >= m.watch), from = at < 0 ? others.length : at;
  const step = others[from] === m.watch || by < 0 ? by : by - 1, n = others.length;
  return { ...m, watch: others[(((from + step) % n) + n) % n] };
}

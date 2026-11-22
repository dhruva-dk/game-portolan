// The match's course for the player:
//   fighting   at sea, from the start (every ship begins afloat: spawn.ts)
//   spectating she has sunk: who she would watch is the ship that sank her, or else the one afloat with the most
//              sinkings to her name; when that one sinks, the one that sank her, and so on; she may turn to another
//              afloat (switched)
//   won        she is the last afloat
// Nothing moves on by itself: the match is over (over) once she has won or, she
// sunk, one ship or none is afloat, and what follows is hers to choose
// (ui/flow.ts). Her place: the ships not yet sunk as she sank, herself among
// them, the sinkings of one step counted one by one in the order the game
// reports them; so, the last ships all sunk at once, the last of them to sink
// is first and wins. With her place, how she sank and at whose hand: the
// Storm's sinking goes to the ship that last struck her if it did so within
// CREDIT seconds (credited). Pure: a value stepped by what the game reports.
//
// A race sailed in teams (Report.race) is over when the game says it is (one
// team afloat or none, or called: carded.ts): afloat then, she has `won` her
// way to its end, at the place she holds there; sunk, she watches a mate of
// hers first, and a mate of the ship she watched after her.

import type { GunKind } from '../kinds.ts';

type Phase = 'fighting' | 'spectating' | 'won';

/** The player's ship's id. */
export const PLAYER = 0;

/**
 * The ships in a match, hers among them: the one number everything that counts
 * them follows (20 at first).
 */
export const SHIPS = 80;

/** How a ship sank: by a ball, a ram, or the Storm. */
export type Cause = 'shot' | 'ram' | 'storm';

/**
 * A ship sunk: who, who sank her (null: the storm, or none), how, and by a
 * ball, the kind of gun it was fired from (null: a ram or the storm).
 */
export interface Sunk {
  id: number;
  by: number | null;
  cause: Cause;
  gun: GunKind | null;
}

/** Seconds a blow is credited with a sinking by the Storm after it. */
export const CREDIT = 8;

/**
 * Who is credited with a sinking by `cause`, the last blow to her `last` (its
 * striker, and seconds since; null: none): a ball's or a ram's striker always;
 * the Storm's, the last striker within CREDIT seconds, else none.
 */
export const credited = (
  cause: Cause,
  last: { by: number; ago: number } | null
): number | null =>
  last && (cause !== 'storm' || last.ago < CREDIT) ? last.by : null;

export interface MatchState {
  phase: Phase;
  /** Her place once it is settled (sunk or won), else null. */
  place: number | null;
  /** Her sinking, once she has sunk: how and at whose hand. */
  sunk: Sunk | null;
  /**
   * The ship she would watch once sunk (hers while she fights, and on a win).
   */
  watch: number;
  /** Seconds since her end (sunk or won); 0 while she fights. */
  since: number;
  /**
   * The match is over: she has won, or she has sunk and one ship or none is
   * afloat.
   */
  over: boolean;
  /** How many of the game's sinkings this has read. */
  read: number;
  /**
   * Her share of the planet's water (0…1) as she last held it afloat: kept once
   * her place is settled, as a sunk ship's water drains (for the result, beside
   * her place).
   */
  share: number;
}

/**
 * What the game reports each frame: every sinking so far in order, the ids of
 * every ship not sunk, and her share of the planet's water now (0…1). In a
 * race sailed in teams, besides: each ship's team by her id, whether the race
 * is over (one team afloat or none, or called: carded.ts over), and her place
 * as it stands (the result's order: play/result.ts finishing).
 */
export interface Report {
  sinkings: readonly Sunk[];
  alive: readonly number[];
  share?: number;
  race?: { teams: readonly number[]; over: boolean; place: number };
}

export const startMatch = (): MatchState => ({
  phase: 'fighting',
  place: null,
  sunk: null,
  watch: PLAYER,
  since: 0,
  over: false,
  read: 0,
  share: 0,
});

/**
 * Who to watch after `gone` sank, at the hand of `by`: in a race of teams, the
 * first of `gone`'s mates afloat; else `by`, if afloat, or the ship afloat
 * with the most sinkings to her name (the lowest id of those tied).
 */
function next(gone: number, by: number | null, r: Report): number {
  const teams = r.race?.teams,
    mate = teams && r.alive.find((id) => teams[id] === teams[gone]);
  if (mate !== undefined) return mate;
  if (by !== null && r.alive.includes(by)) return by;
  let best = -1,
    most = -1;
  for (const id of r.alive) {
    const n = r.sinkings.filter((s) => s.by === id).length;
    if (n > most) [best, most] = [id, n];
  }
  return best;
}

/** The match after a frame of dt seconds and what the game reports. */
export function stepMatch(m: MatchState, r: Report, dt: number): MatchState {
  let s: MatchState = { ...m, read: r.sinkings.length };
  const fresh = r.sinkings.slice(m.read);
  const mine = fresh.find((k) => k.id === PLAYER);
  // (the step she sinks, her water is already draining: what she held is the
  // step before's)
  if (s.phase === 'fighting' && !mine) s.share = r.share ?? s.share;
  if (s.phase !== 'fighting') s.since += dt;
  if (mine && s.phase === 'fighting') {
    const place = r.alive.length + r.sinkings.length - r.sinkings.indexOf(mine);
    const watch = next(PLAYER, mine.by, r);
    s =
      place === 1 && r.alive.length === 0
        ? { ...s, phase: 'won', place, sunk: mine }
        : {
            ...s,
            phase: 'spectating',
            place,
            sunk: mine,
            watch: watch < 0 ? PLAYER : watch,
          };
  } else if (s.phase === 'spectating') {
    // the ship watched has sunk: on to the one that sank her
    const gone = fresh.find((k) => k.id === s.watch);
    if (gone) {
      const watch = next(gone.id, gone.by, r);
      if (watch >= 0) s = { ...s, watch };
    }
  } else if (s.phase === 'fighting' && r.race) {
    // a race is hers to end afloat, at the place she holds as it ends
    if (r.race.over) s = { ...s, phase: 'won', place: r.race.place };
  } else if (
    s.phase === 'fighting' &&
    fresh.length > 0 &&
    r.alive.length === 1 &&
    r.alive[0] === PLAYER
  ) {
    s = { ...s, phase: 'won', place: 1 };
  }
  s.over = r.race
    ? r.race.over
    : s.phase === 'won' || (s.phase === 'spectating' && r.alive.length <= 1);
  return s;
}

/**
 * Spectating, the ship afloat `by` places on from the one watched (+1 the next,
 * −1 the one before) in the order of their ids, round and round; at any other
 * time, or with none afloat but her, the match unchanged.
 */
export function switched(
  m: MatchState,
  alive: readonly number[],
  by: number
): MatchState {
  const others = alive.filter((id) => id !== PLAYER);
  if (m.phase !== 'spectating' || others.length === 0) return m;
  // (from a ship no longer afloat, the next on is the first after it)
  const at = others.findIndex((id) => id >= m.watch),
    from = at < 0 ? others.length : at;
  const step = others[from] === m.watch || by < 0 ? by : by - 1,
    n = others.length;
  return { ...m, watch: others[(((from + step) % n) + n) % n] };
}

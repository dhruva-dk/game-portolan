// The match's course for the player, as 0117 ran it (app.ts follow, session.ts spectate/rewatch):
//   fighting   at sea, from the start (every ship begins afloat: spawn.ts)
//   spectating she has sunk: the camera watches the ship that sank her, or else the one afloat with the most sinkings
//              to her name; when that one sinks, the one that sank her, and so on. A tap moves on (to the result), or
//              the match ending does, SPECTATE seconds after
//   won        she is the last afloat: a tap moves on, or VICTORY seconds do
// Her place, as 0117 settled it (sim/end.ts sink): the ships not yet sunk as she sank, herself among them, the
// sinkings of one step counted one by one in the order the game reports them; so, the last ships all sunk at once,
// the last of them to sink is first and wins. With her place, how she sank and at whose hand: the Storm's sinking goes
// to the ship that last struck her if it did so within CREDIT seconds (credited). The defeat slip and the result show
// this place (ui/flow.ts). Pure: a value stepped by what the game reports.

export type Phase = 'fighting' | 'spectating' | 'won';

/** Seconds the end holds before moving on by itself (0117 app.ts HOLD): watching the last ship left, and the win. */
export const HOLD = { spectating: 3, won: 6 } as const;

/** The player's ship's id. */
export const PLAYER = 0;

/** The ships in a match, hers among them: the one number everything that counts them follows (0117's tables.ts
 *  MATCH.ships was 20). */
export const SHIPS = 80;

/** How a ship sank: by a ball, a ram, or the Storm. */
export type Cause = 'shot' | 'ram' | 'storm';

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
  /** The ship the camera follows. */
  watch: number;
  /** How the camera came to her: 'cut' to her at once, 'fly' over to her. Changes with `watch`. */
  move: 'cut' | 'fly';
  /** Seconds the end has been held (the match over, spectating; or won). */
  held: number;
  /** Time to move on, to the result. */
  done: boolean;
  /** How many of the game's sinkings this has read. */
  read: number;
  /** Her share of the planet's water (0…1) as she last held it afloat: kept once her place is settled, as a sunk
   *  ship's water drains (for the result, beside her place). */
  share: number;
}

/** What the game reports each frame: every sinking so far in order, the ids of every ship not sunk, and her share of
 *  the planet's water now (0…1). */
export interface Report { sinkings: readonly Sunk[]; alive: readonly number[]; share?: number }

export const startMatch = (): MatchState => ({
  phase: 'fighting', place: null, sunk: null, watch: PLAYER, move: 'cut', held: 0, done: false, read: 0, share: 0,
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
  if (m.done) return m;
  let s: MatchState = { ...m, read: r.sinkings.length };
  const fresh = r.sinkings.slice(m.read);
  const mine = fresh.find((k) => k.id === PLAYER);
  // (the step she sinks, her water is already draining: what she held is the step before's)
  if (s.phase === 'fighting' && !mine) s.share = r.share ?? s.share;
  if (mine && s.phase === 'fighting') {
    const place = r.alive.length + r.sinkings.length - r.sinkings.indexOf(mine);
    const watch = next(mine.by, r);
    s = place === 1 && r.alive.length === 0
      ? { ...s, phase: 'won', place, sunk: mine, held: 0 }
      : { ...s, phase: 'spectating', place, sunk: mine, watch: watch < 0 ? PLAYER : watch, move: 'cut' };
  } else if (s.phase === 'spectating') {
    // the ship watched has sunk: on to the one that sank her
    const gone = fresh.find((k) => k.id === s.watch);
    if (gone) {
      const watch = next(gone.by, r);
      if (watch >= 0) s = { ...s, watch, move: 'fly' };
    }
  } else if (s.phase === 'fighting' && fresh.length > 0 && r.alive.length === 1 && r.alive[0] === PLAYER) {
    s = { ...s, phase: 'won', place: 1, held: 0 };
  }
  if (s.phase === 'won' || (s.phase === 'spectating' && r.alive.length <= 1)) {
    s.held += dt;
    if (s.held >= HOLD[s.phase]) s.done = true;
  }
  return s;
}

/** A tap while the end is shown moves on; at any other time it does nothing. */
export const tapped = (m: MatchState): MatchState => (m.phase === 'spectating' || m.phase === 'won' ? { ...m, done: true } : m);

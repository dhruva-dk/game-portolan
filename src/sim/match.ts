// The match's course for the player, as 0117 ran it (app.ts follow, session.ts spectate/rewatch):
//   dropping   on the Gale and gliding down, until she touches the water
//   fighting   at sea
//   spectating she has sunk: the camera watches the ship that sank her, or else the one afloat with the most sinkings
//              to her name; when that one sinks, the one that sank her, and so on. A tap moves on (to the result), or
//              the match ending does, SPECTATE seconds after
//   won        she is the last afloat: a tap moves on, or VICTORY seconds do
// Her place: 1 + the ships still afloat as she sank (a ship still in the drop is afloat). Pure: a value stepped by what
// the game reports.

export type Phase = 'dropping' | 'fighting' | 'spectating' | 'won';

/** Seconds the end holds before moving on by itself (0117 app.ts HOLD): watching the last ship left, and the win. */
export const HOLD = { spectating: 3, won: 6 } as const;

/** The player's ship's id. */
export const PLAYER = 0;

/** A ship sunk: who, and who sank her (null: the storm, or none). */
export interface Sunk { id: number; by: number | null }

export interface MatchState {
  phase: Phase;
  /** Her place once it is settled (sunk or won), else null. */
  place: number | null;
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
}

/** What the game reports each frame: whether she is down on the sea, every sinking so far in order, and the ids of
 *  every ship not sunk (in the drop or afloat). */
export interface Report { landed: boolean; sinkings: readonly Sunk[]; alive: readonly number[] }

export const startMatch = (dropping: boolean): MatchState => ({
  phase: dropping ? 'dropping' : 'fighting', place: null, watch: PLAYER, move: 'cut', held: 0, done: false, read: 0,
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
  if (s.phase === 'dropping' && r.landed) s.phase = 'fighting';
  const mine = fresh.find((k) => k.id === PLAYER);
  if (mine && (s.phase === 'fighting' || s.phase === 'dropping')) {
    const watch = next(mine.by, r);
    s = { ...s, phase: 'spectating', place: 1 + r.alive.length, watch: watch < 0 ? PLAYER : watch, move: 'cut' };
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

// What happened on the sea in a step, as plain deeds (player.ts Deed), numbered
// in order: every gun fired, every ball come down or home, every ship sunk, and
// of her own stores what she took up, mended with and spent. The match keeps
// about a second of them (state.ts); the game reports them as she sees them
// (Moment: where each falls on her screen, its bearing from the camera's look,
// how far off), for the HUD's answer to each (ui/juice.ts), the camera's
// (shake.ts) and the sound's.
//
// The same step's fighting kept longer for the frame to draw (Blast:
// gunfire/gunfire.ts): the shots, the balls come down and home, the ships sunk.
//
// Pure: no three, no page; deterministic for the same inputs. A step with
// nothing new and nothing gone stale keeps the lists it had, and a moment is
// seen again in place, so neither makes anything.

import type { Cue, Shot, Splash, Strike } from '../sim/battle.ts';
import { isArms, rarityOf, type Taken } from '../sim/loot.ts';
import type { Mended } from '../sim/stores.ts';
import { bearingFrom, type Blast, type Eye } from '../snapshot.ts';
import { HOTBAR, LIFT, type Deed, type Moment } from '../player.ts';
import { R, normalize, type Vec3 } from '../world/sphere.ts';
import { placed, type Point, type View } from './lens.ts';

export { bearingFrom } from '../snapshot.ts';

/** Seconds of deeds the match keeps, on the world's clock. */
export const KEEP = 1;

/**
 * What a step did, as the sim reports it: the guns fired and what else they
 * did, the balls come down and home, the ships sunk (where, and by whom), what
 * was taken up and mended with, the ships that spent a gust, and where hers
 * lies (null: sunk).
 */
export interface Done {
  shots: readonly Pick<Shot, 'shooter' | 'gun' | 'dirs' | 'from'>[];
  cues: readonly Cue[];
  splashes: readonly Splash[];
  strikes: readonly Strike[];
  sunk: readonly { id: number; by: number | null; at: Vec3 }[];
  took: readonly Taken[];
  mended: readonly Mended[];
  blew: readonly number[];
  her: Vec3 | null;
}

/**
 * The guns' cues told before the shots (her taking a gun up), and after them.
 */
const FIRST: readonly Cue['kind'][] = ['swapped'],
  AFTER: readonly Cue['kind'][] = ['winding', 'reloading', 'reloaded'];

/**
 * The cues of `kinds` among the step's, as deeds onto `out`: every ship's
 * wind-ups, and `me`'s others alone.
 */
function cued(
  out: Deed[],
  done: Done,
  kinds: readonly Cue['kind'][],
  me: number,
  next: () => number,
  time: number
) {
  for (const c of done.cues) {
    if (!kinds.includes(c.kind) || (c.kind !== 'winding' && c.ship !== me))
      continue;
    out.push({
      seq: next(),
      time,
      at: c.at,
      ship: c.ship,
      kind: c.kind,
      gun: c.gun,
    });
  }
}

/**
 * The deeds of a step at `time` (the world's clock, s), numbered by `next`,
 * onto `out`: every ship's fighting and wind-ups, and `me`'s other guns' cues
 * and stores alone. In the order they happened within the step: her taking a
 * gun up, fired, wound, reloading and reloaded, fell, struck, sank, then her
 * stores.
 */
export function deedsOf(
  done: Done,
  me: number,
  next: () => number,
  time: number,
  out: Deed[] = []
): Deed[] {
  cued(out, done, FIRST, me, next, time);
  for (const s of done.shots)
    out.push({
      seq: next(),
      time,
      at: normalize(s.from),
      ship: s.shooter,
      kind: 'fired',
      gun: s.gun,
    });
  cued(out, done, AFTER, me, next, time);
  for (const s of done.splashes)
    out.push({
      seq: next(),
      time,
      at: s.at,
      ship: s.shooter,
      kind: 'fell',
      land: s.land,
    });
  for (const s of done.strikes) {
    const { shooter: by, shield, hull, broke, ram } = s;
    out.push({
      seq: next(),
      time,
      at: s.at,
      ship: s.struck,
      kind: 'struck',
      by,
      shield,
      hull,
      broke,
      ram,
    });
  }
  for (const s of done.sunk)
    out.push({
      seq: next(),
      time,
      at: s.at,
      ship: s.id,
      kind: 'sank',
      by: s.by,
    });
  for (const t of done.took) {
    if (t.ship !== me) continue;
    const slot = isArms(t.goods) ? t.slot : HOTBAR.guns - 1 + t.slot;
    out.push({
      seq: next(),
      time,
      at: t.at,
      ship: me,
      kind: 'took',
      piece: t.goods.kind,
      rarity: rarityOf(t.goods),
      slot,
    });
  }
  const her = done.her;
  if (!her) return out;
  for (const m of done.mended)
    if (m.ship === me)
      out.push({
        seq: next(),
        time,
        at: her,
        ship: me,
        kind: 'mended',
        piece: m.use,
      });
  if (done.blew.includes(me))
    out.push({ seq: next(), time, at: her, ship: me, kind: 'gust' });
  return out;
}

/**
 * Seconds what the guns did is kept for the frame: past the last of its smoke
 * (gunfire/gunfire.ts).
 */
const KEPT = 5;
/** What of a step the frame draws. */
type Fighting = Pick<Done, 'shots' | 'splashes' | 'strikes' | 'sunk'>;

/** Whether the oldest of a list kept in order of time is older than `cut`. */
const stale = (list: readonly { time: number }[], cut: number) =>
  list.length > 0 && list[0].time <= cut;

/**
 * What the guns did kept at `time` (the world's clock, s): `blasts` of the last
 * KEPT seconds, then the step's shots, balls come down, blows home and ships
 * sunk; `blasts` itself when there is nothing new and nothing gone.
 */
function blastsOf(
  blasts: readonly Blast[],
  done: Fighting,
  time: number
): readonly Blast[] {
  const fresh =
    done.shots.length +
    done.splashes.length +
    done.strikes.length +
    done.sunk.length;
  if (!fresh && !stale(blasts, time - KEPT)) return blasts;
  const out: Blast[] = [];
  for (const b of blasts) if (b.time > time - KEPT) out.push(b);
  for (const s of done.shots)
    out.push({ kind: 'shot', time, from: s.from, dir: s.dirs[0], gun: s.gun });
  for (const s of done.splashes)
    out.push({ kind: 'splash', time, at: s.at, land: s.land, gun: s.gun });
  for (const s of done.strikes) {
    out.push({
      kind: 'strike',
      time,
      at: s.at,
      ram: s.ram,
      shield: s.hull <= 0 && s.shield > 0,
      broke: s.broke,
    });
  }
  for (const s of done.sunk) out.push({ kind: 'sink', time, at: s.at });
  return out;
}

/**
 * The deeds kept at `time`: those of the last KEEP seconds, then `fresh`;
 * `deeds` itself when there is nothing new and nothing gone.
 */
export function kept(
  deeds: readonly Deed[],
  fresh: readonly Deed[],
  time: number
): readonly Deed[] {
  if (!fresh.length && !stale(deeds, time - KEEP)) return deeds;
  const out: Deed[] = [];
  for (const d of deeds) if (d.time > time - KEEP) out.push(d);
  for (const d of fresh) out.push(d);
  return out;
}

/**
 * What the match keeps of what happened (state.ts): the deeds of about the last
 * second, numbered on from 1 (never reset: a reader keeps its place across
 * matches), as `me` is told them, and what the guns did, for the frame. The
 * step's report is put together in place.
 */
export function createLog(me: number) {
  let deeds: readonly Deed[] = [],
    blasts: readonly Blast[] = [],
    seq = 0;
  const cues: Cue[] = [],
    sunk: { id: number; by: number | null; at: Vec3 }[] = [],
    fresh: Deed[] = [];
  const done: Done = {
    shots: [],
    splashes: [],
    strikes: [],
    cues,
    sunk,
    took: [],
    mended: [],
    blew: [],
    her: null,
  };
  const next = () => ++seq;
  return {
    /**
     * A ship sunk in the step under way, by `by` (null: the storm), where she
     * lay.
     */
    sank(id: number, by: number | null, at: Vec3) {
      sunk.push({ id, by, at });
    },
    /**
     * The step done at `time` (the world's clock, s): the fighting's, the
     * stores asked (their cues told first) and stepped, and where hers lies
     * (null: sunk); kept, with the ships sunk in it.
     */
    keep(
      fought: Pick<Done, 'shots' | 'splashes' | 'strikes' | 'cues'>,
      asked: Pick<Done, 'cues' | 'blew'>,
      stored: Pick<Done, 'took' | 'mended'>,
      her: Vec3 | null,
      time: number
    ) {
      cues.length = 0;
      for (const c of asked.cues) cues.push(c);
      for (const c of fought.cues) cues.push(c);
      done.shots = fought.shots;
      done.splashes = fought.splashes;
      done.strikes = fought.strikes;
      done.took = stored.took;
      done.mended = stored.mended;
      done.blew = asked.blew;
      done.her = her;
      fresh.length = 0;
      deeds = kept(deeds, deedsOf(done, me, next, time, fresh), time);
      blasts = blastsOf(blasts, done, time);
      sunk.length = 0;
    },
    /** What happened in about the last second, oldest first. */
    deeds: () => deeds,
    /** What the guns did in the last KEPT seconds, oldest first. */
    blasts: () => blasts,
    /**
     * A new sea: nothing the guns did is left to draw (the deeds are kept, read
     * on by their numbers).
     */
    clear() {
      blasts = [];
    },
  };
}

/** A step that did nothing. */
export const NOTHING_DONE = {
  shots: [],
  splashes: [],
  strikes: [],
  cues: [],
  took: [],
  mended: [],
  blew: [],
} as const;

/**
 * Where a moment is, world metres: see's, refilled; and each moment's point on
 * the screen, refilled, kept while it is off it.
 */
const where: [number, number, number] = [0, 0, 0],
  spots = new WeakMap<Moment, Point>();

/**
 * Moment `m` seen again, in place, through `eye` on `view` (CSS px; none where
 * its width is 0).
 */
export function see(m: Moment, eye: Eye, view: View): Moment {
  const lift = R + LIFT[m.kind],
    p = eye.position;
  where[0] = m.at[0] * lift;
  where[1] = m.at[1] * lift;
  where[2] = m.at[2] * lift;
  let spot = spots.get(m);
  if (!spot) spots.set(m, (spot = { x: 0, y: 0 }));
  m.seen = view.width > 0 ? placed(spot, eye, m.at, LIFT[m.kind], view) : null;
  m.bearing = bearingFrom(eye, where);
  m.metres = Math.hypot(where[0] - p[0], where[1] - p[1], where[2] - p[2]);
  return m;
}

/** A deed as she sees it through `eye` on a view `width` × `height` CSS px. */
export const seenOf = (
  d: Deed,
  eye: Eye,
  width: number,
  height: number
): Moment =>
  see({ ...d, seen: null, bearing: 0, metres: 0 }, eye, { width, height });

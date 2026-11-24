import type { Cue, Shot, Splash, Strike } from '../sim/battle.ts';
import { isArms, rarityOf, type Taken } from '../sim/loot.ts';
import type { Mended } from '../sim/stores.ts';
import { bearingFrom, type Blast, type Eye } from '../snapshot.ts';
import { HOTBAR, LIFT, type Deed, type Moment } from '../player.ts';
import { R, normalize, type Vec3 } from '../world/sphere.ts';
import { placed, type Point, type View } from './lens.ts';

export { bearingFrom } from '../snapshot.ts';

export const KEEP = 1;

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

const FIRST: readonly Cue['kind'][] = ['swapped'],
  AFTER: readonly Cue['kind'][] = ['winding', 'reloading', 'reloaded'];

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

const KEPT = 5;
type Fighting = Pick<Done, 'shots' | 'splashes' | 'strikes' | 'sunk'>;

const stale = (list: readonly { time: number }[], cut: number) =>
  list.length > 0 && list[0].time <= cut;

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
    sank(id: number, by: number | null, at: Vec3) {
      sunk.push({ id, by, at });
    },
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
    deeds: () => deeds,
    blasts: () => blasts,
    clear() {
      blasts = [];
    },
  };
}

export const NOTHING_DONE = {
  shots: [],
  splashes: [],
  strikes: [],
  cues: [],
  took: [],
  mended: [],
  blew: [],
} as const;

const where: [number, number, number] = [0, 0, 0],
  spots = new WeakMap<Moment, Point>();

export function see(
  m: Moment,
  eye: Eye,
  view: View,
  by: Readonly<Vec3> | null = null
): Moment {
  const p = eye.position;
  if (by) {
    const lift = R + LIFT.struck;
    where[0] = by[0] * lift;
    where[1] = by[1] * lift;
    where[2] = by[2] * lift;
    m.whence = bearingFrom(eye, where);
  } else m.whence = null;
  const lift = R + LIFT[m.kind];
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

export const seenOf = (
  d: Deed,
  eye: Eye,
  width: number,
  height: number,
  by: Readonly<Vec3> | null = null
): Moment =>
  see(
    { ...d, seen: null, bearing: 0, metres: 0, whence: null },
    eye,
    { width, height },
    by
  );

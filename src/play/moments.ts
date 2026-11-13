// What happened on the sea in a step, as plain deeds (player.ts Deed), numbered in order: every gun fired, every ball
// come down or home, every ship sunk, and of her own stores what she took up, mended with and spent. The match keeps
// about a second of them (state.ts); the game reports them as she sees them (Moment: where each falls on her screen,
// its bearing from the camera's look, how far off), for the HUD's answer to each (ui/juice.ts), the camera's
// (shake.ts) and the sound's. 0117's moments (app/events.ts), as far as this game has them.
//
// Pure: no three, no page; deterministic for the same inputs.

import type { Splash, Strike } from '../sim/battle.ts';
import { rarityOf, type Taken } from '../sim/loot.ts';
import type { Mended } from '../sim/stores.ts';
import type { Eye } from '../snapshot.ts';
import type { Deed, Moment } from '../player.ts';
import { R, add, length, normalize, scale, type Vec3 } from '../world/sphere.ts';
import { inverse, rotate } from '../world/turn.ts';
import { onScreen } from './lens.ts';

/** Seconds of deeds the match keeps, on the world's clock. */
export const KEEP = 1;

/** What a step did, as the sim reports it: the guns fired, the balls come down and home, the ships sunk (where, and by
 *  whom), what was taken up and mended with, the ships that spent a gust, and where hers lies (null: sunk). */
export interface Done {
  shots: readonly { shooter: number; from: Vec3 }[];
  splashes: readonly Splash[];
  strikes: readonly Strike[];
  sunk: readonly { id: number; by: number | null; at: Vec3 }[];
  took: readonly Taken[];
  mended: readonly Mended[];
  blew: readonly number[];
  her: Vec3 | null;
}

/** The deeds of a step at `time` (the world's clock, s), numbered by `next`: every ship's fighting, and `me`'s stores
 *  alone. In the order they happened within the step: fired, fell, struck, sank, then her stores. */
export function deedsOf(done: Done, me: number, next: () => number, time: number): Deed[] {
  const out: Deed[] = [];
  for (const s of done.shots) out.push({ seq: next(), time, at: normalize(s.from), ship: s.shooter, kind: 'fired' });
  for (const s of done.splashes) out.push({ seq: next(), time, at: s.at, ship: s.shooter, kind: 'fell', land: s.land });
  for (const s of done.strikes) {
    out.push({ seq: next(), time, at: s.at, ship: s.struck, kind: 'struck', by: s.shooter, shield: s.shield, hull: s.hull, broke: s.broke, ram: s.ram });
  }
  for (const s of done.sunk) out.push({ seq: next(), time, at: s.at, ship: s.id, kind: 'sank', by: s.by });
  for (const t of done.took) {
    if (t.ship !== me) continue;
    out.push({ seq: next(), time, at: t.at, ship: me, kind: 'took', piece: t.goods.kind, rarity: rarityOf(t.goods), slot: t.slot });
  }
  const her = done.her;
  if (!her) return out;
  for (const m of done.mended) if (m.ship === me) out.push({ seq: next(), time, at: her, ship: me, kind: 'mended', piece: m.use });
  if (done.blew.includes(me)) out.push({ seq: next(), time, at: her, ship: me, kind: 'gust' });
  return out;
}

/** The deeds kept at `time`: those of the last KEEP seconds, then `fresh`. */
export const kept = (deeds: readonly Deed[], fresh: readonly Deed[], time: number): Deed[] =>
  fresh.length || deeds.some((d) => d.time <= time - KEEP) ? [...deeds.filter((d) => d.time > time - KEEP), ...fresh] : [...deeds];

/** Metres over the sea a deed is seen at: a blow on a hull at her side, a gun at her muzzle, the rest at the water. */
const LIFT: Record<Deed['kind'], number> = { fired: 3, fell: 0, struck: 2, sank: 2, took: 0.5, mended: 2, gust: 2 };

/** The bearing of world point `p` (metres) from the way `eye` looks: radians clockwise, 0 ahead, ±π behind. */
export function bearingFrom(eye: Eye, p: Vec3): number {
  const [x, , z] = rotate(add(p, eye.position, -1), inverse(eye.orientation));
  return Math.atan2(x, -z);
}

/** A deed as she sees it through `eye` on a view `width` × `height` CSS px. */
export function seenOf(d: Deed, eye: Eye, width: number, height: number): Moment {
  const p = scale(d.at, R + LIFT[d.kind]);
  return { ...d, seen: width > 0 ? onScreen(eye, d.at, width, height, LIFT[d.kind]) : null, bearing: bearingFrom(eye, p), metres: length(add(p, eye.position, -1)) };
}

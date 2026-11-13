// What happened on the sea in a step, as plain deeds (player.ts Deed), numbered in order: every gun fired, every ball
// come down or home, every ship sunk, and of her own stores what she took up, mended with and spent. The match keeps
// about a second of them (state.ts); the game reports them as she sees them (Moment: where each falls on her screen,
// its bearing from the camera's look, how far off), for the HUD's answer to each (ui/juice.ts), the camera's
// (shake.ts) and the sound's. 0117's moments (app/events.ts), as far as this game has them.
//
// The same step's fighting kept longer for the frame to draw (Blast: gunfire/gunfire.ts): the shots, the balls come
// down and home, the ships sunk.
//
// Pure: no three, no page; deterministic for the same inputs.

import type { Cue, Shot, Splash, Strike } from '../sim/battle.ts';
import { isArms, rarityOf, type Taken } from '../sim/loot.ts';
import type { Mended } from '../sim/stores.ts';
import type { Blast, Eye } from '../snapshot.ts';
import { HOTBAR, LIFT, type Deed, type Moment } from '../player.ts';
import { R, add, length, normalize, scale, type Vec3 } from '../world/sphere.ts';
import { inverse, rotate } from '../world/turn.ts';
import { onScreen } from './lens.ts';

/** Seconds of deeds the match keeps, on the world's clock. */
export const KEEP = 1;

/** What a step did, as the sim reports it: the guns fired and what else they did, the balls come down and home, the
 *  ships sunk (where, and by whom), what was taken up and mended with, the ships that spent a gust, and where hers lies
 *  (null: sunk). */
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

/** The deeds of a step at `time` (the world's clock, s), numbered by `next`: every ship's fighting and wind-ups, and
 *  `me`'s other guns' cues and stores alone. In the order they happened within the step:
 *  her taking a gun up, fired, wound, reloading and reloaded, fell, struck, sank, then her stores. */
export function deedsOf(done: Done, me: number, next: () => number, time: number): Deed[] {
  const out: Deed[] = [];
  const cued = (kinds: readonly Cue['kind'][]) => {
    for (const c of done.cues) {
      if (kinds.includes(c.kind) && (c.kind === 'winding' || c.ship === me)) out.push({ seq: next(), time, at: c.at, ship: c.ship, kind: c.kind, gun: c.gun });
    }
  };
  cued(['swapped']);
  for (const s of done.shots) out.push({ seq: next(), time, at: normalize(s.from), ship: s.shooter, kind: 'fired', gun: s.gun });
  cued(['winding', 'reloading', 'reloaded']);
  for (const s of done.splashes) out.push({ seq: next(), time, at: s.at, ship: s.shooter, kind: 'fell', land: s.land });
  for (const s of done.strikes) {
    out.push({ seq: next(), time, at: s.at, ship: s.struck, kind: 'struck', by: s.shooter, shield: s.shield, hull: s.hull, broke: s.broke, ram: s.ram });
  }
  for (const s of done.sunk) out.push({ seq: next(), time, at: s.at, ship: s.id, kind: 'sank', by: s.by });
  for (const t of done.took) {
    if (t.ship !== me) continue;
    out.push({ seq: next(), time, at: t.at, ship: me, kind: 'took', piece: t.goods.kind, rarity: rarityOf(t.goods), slot: isArms(t.goods) ? t.slot : HOTBAR.guns - 1 + t.slot });
  }
  const her = done.her;
  if (!her) return out;
  for (const m of done.mended) if (m.ship === me) out.push({ seq: next(), time, at: her, ship: me, kind: 'mended', piece: m.use });
  if (done.blew.includes(me)) out.push({ seq: next(), time, at: her, ship: me, kind: 'gust' });
  return out;
}

/** Seconds what the guns did is kept for the frame: past the last of its smoke (gunfire/gunfire.ts). */
const KEPT = 5;

/** What the guns did kept at `time` (the world's clock, s): `blasts` of the last KEPT seconds, then the step's shots,
 *  balls come down, blows home and ships sunk. */
export const blastsOf = (blasts: readonly Blast[], done: Pick<Done, 'shots' | 'splashes' | 'strikes' | 'sunk'>, time: number): Blast[] => [
  ...blasts.filter((b) => b.time > time - KEPT),
  ...done.shots.map((s): Blast => ({ kind: 'shot', time, from: s.from, dir: s.dirs[0], gun: s.gun })),
  ...done.splashes.map((s): Blast => ({ kind: 'splash', time, at: s.at, land: s.land, gun: s.gun })),
  ...done.strikes.map((s): Blast => ({ kind: 'strike', time, at: s.at, ram: s.ram, shield: s.hull <= 0 && s.shield > 0, broke: s.broke })),
  ...done.sunk.map((s): Blast => ({ kind: 'sink', time, at: s.at })),
];

/** The deeds kept at `time`: those of the last KEEP seconds, then `fresh`. */
export const kept = (deeds: readonly Deed[], fresh: readonly Deed[], time: number): Deed[] =>
  fresh.length || deeds.some((d) => d.time <= time - KEEP) ? [...deeds.filter((d) => d.time > time - KEEP), ...fresh] : [...deeds];

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

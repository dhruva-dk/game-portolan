// The deeds on the sea (cues.ts Happening), read from what the Snapshot and the Status already show: the guns' blasts
// the frame draws (Snapshot blasts: a gun fired, a ball down, a ball home), the ships going down (a ShipDraw no longer
// afloat), and her own hit points and stores as they change from one frame to the next. The match's own report of its
// deeds (player.ts Moment, numbered: status.moments) says all of this directly once it comes, and takes this file's
// place (audio.ts: the one line that reads deeds).
//
// Pure: plain data in, deeds out; what it keeps between frames is its own.

import type { Kit, Item, Status } from '../player.ts';
import type { Snapshot } from '../snapshot.ts';
import { R, type Vec3 } from '../world/sphere.ts';
import type { Happening, Piece } from './cues.ts';

/** Within this many metres of her hull, a ball home is a blow on her; a gun fired, hers. */
const HERS = 16;
/** The most ships told apart going down (ids are below it). */
const FLEET = 256;

const PIECES: Record<Item, Piece> = {
  'item.smallShield': 'smallShield', 'item.bigShield': 'bigShield', 'item.repairKit': 'repairKit', 'item.fullRepair': 'fullRepair',
};

const unit = (p: Vec3): Vec3 => {
  const l = Math.sqrt(p[0] * p[0] + p[1] * p[1] + p[2] * p[2]);
  return [p[0] / l, p[1] / l, p[2] / l];
};
const near = (a: Vec3, b: Vec3, metres: number) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2 < metres * metres;

export function createDerive() {
  let seq = 0, generation = -1, heard = -Infinity;
  /** Each ship as last seen: −1 not seen, 0 going down, 1 afloat. */
  const afloat = new Int8Array(FLEET).fill(-1);
  let hull = 0, shield = 0, gun: number | null = null, blowing = false, using: number | null = null;
  let items: Kit['items'] = [null, null, null], chosen = 0;

  /** Takes in the last state seen without telling any of it (a new sea: nothing carries over). */
  const baseline = (scene: Snapshot) => {
    afloat.fill(-1);
    for (const sh of scene.ships) if (sh.id < FLEET) afloat[sh.id] = sh.afloat ? 1 : 0;
    for (const b of scene.blasts) heard = Math.max(heard, b.time);
  };

  return {
    /** The deeds since the last frame, appended to `out`. */
    derive(scene: Snapshot, s: Status & Kit, out: Happening[]) {
      const own = scene.own, time = scene.clock;
      const mine = scene.ships.find((sh) => sh.id === own && sh.afloat);
      const at = mine?.pose.position ?? null;
      const add = (h: Happening) => out.push(h);
      const fresh = (scene.sea?.generation ?? 0) !== generation;
      if (fresh) {
        generation = scene.sea?.generation ?? 0;
        baseline(scene);
      } else {
        // the guns' work, each blast once (as the frame lays them: frame.ts)
        let latest = heard;
        for (const b of scene.blasts) {
          if (b.time <= heard) continue;
          latest = Math.max(latest, b.time);
          if (b.kind === 'shot') add({ seq: ++seq, time: b.time, at: unit(b.from), ship: at && near(b.from, at, HERS) ? own ?? -1 : -1, kind: 'fired' });
          else if (b.kind === 'splash') add({ seq: ++seq, time: b.time, at: b.at, ship: -1, kind: 'fell', land: b.land });
          else {
            const p: Vec3 = [b.at[0] * R, b.at[1] * R, b.at[2] * R];
            const hers = !!at && own !== null && near(p, at, HERS);
            const lost = { shield: Math.max(0, shield - s.shield), hull: Math.max(0, hull - s.hull) };
            add({
              seq: ++seq, time: b.time, at: b.at, ship: hers && own !== null ? own : -1, kind: 'struck', by: -1,
              shield: hers ? lost.shield : 0, hull: hers ? lost.hull || (lost.shield ? 0 : 1) : 1, broke: hers && shield > 0 && s.shield <= 0, ram: b.ram,
            });
          }
        }
        heard = latest;
        // the ships gone down since
        for (const sh of scene.ships) {
          if (sh.id >= FLEET) continue;
          if (afloat[sh.id] === 1 && !sh.afloat) add({ seq: ++seq, time, at: unit(sh.pose.position), ship: sh.id, kind: 'sank', by: null });
          afloat[sh.id] = sh.afloat ? 1 : 0;
        }
        // her stores: a gun or stores taken up, stores mended with, a gust spent
        if (own !== null && at) {
          const here = unit(at);
          if (s.gun && s.gun.rarity !== gun) add({ seq: ++seq, time, at: here, ship: own, kind: 'took', piece: 'gun', rarity: s.gun.rarity, slot: 0 });
          s.items.forEach((k, i) => {
            const was = items[i];
            if (k && (!was || was.item !== k.item || (k.count ?? 1) > (was.count ?? 1))) {
              add({ seq: ++seq, time, at: here, ship: own, kind: 'took', piece: PIECES[k.item], rarity: 0, slot: i + 1 });
            }
          });
          const spent = items[chosen - 1];
          const after = s.items[chosen - 1];
          if (using !== null && using > 0.7 && s.using === null && spent && (!after || (after.count ?? 1) < (spent.count ?? 1))) {
            add({ seq: ++seq, time, at: here, ship: own, kind: 'mended', piece: PIECES[spent.item] });
          }
          if (s.blowing && !blowing) add({ seq: ++seq, time, at: here, ship: own, kind: 'gust' });
        }
      }
      hull = s.hull;
      shield = s.shield;
      gun = s.gun?.rarity ?? null;
      blowing = s.blowing;
      using = s.using;
      items = s.items;
      chosen = s.chosen;
    },
  };
}

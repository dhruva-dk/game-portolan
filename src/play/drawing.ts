// What the frame is handed of the match each frame (state.ts drawn and balls):
// the same lists, and the same objects in them, a slot to a ship or a ball,
// written over each frame; the frame reads them before the next.

import type { Faults, GunKind } from '../kinds.ts';
import type { Ball } from '../sim/shot.ts';
import type { BallDraw, Look, ShipDraw } from '../snapshot.ts';
import { poseOut, type PoseOut } from '../world/pose.ts';
import { add, put, type Out3, type Vec3 } from '../world/sphere.ts';

/**
 * A ship as drawn: her pose and her velocity her slot's own, and her gun's
 * kind, rarity and aim (`gun`, when she has one in hand).
 */
interface Drawing extends ShipDraw {
  pose: PoseOut;
  velocity: Out3;
  held: { kind: GunKind; rarity: number; aim: Vec3 };
}
const UNFAULTED: Faults = [0, 0, 0, 0];
/** A ball as drawn. */
interface Flight extends BallDraw {
  at: Out3;
}

export function createDrawing() {
  const ships: Drawing[] = [],
    slots: Drawing[] = [],
    flying: Flight[] = [],
    flights: Flight[] = [];
  return {
    /**
     * The nth ship drawn's slot, put nth on the list: ship `id` in her colours,
     * afloat or going down, unworn, still and with no gun in hand till her
     * wear, her velocity and her gun are written.
     */
    slot(n: number, id: number, look: Look, afloat: boolean): Drawing {
      const d =
        (ships[n] =
        slots[n] ??=
          {
            id,
            pose: poseOut(),
            look,
            velocity: [0, 0, 0],
            afloat,
            gun: null,
            wear: 0,
            faults: UNFAULTED,
            held: { kind: 'cannon', rarity: 0, aim: [0, 0, 1] },
          });
      d.id = id;
      d.look = look;
      d.afloat = afloat;
      put(d.velocity, 0, 0, 0);
      d.gun = null;
      d.wear = 0;
      d.faults = UNFAULTED;
      return d;
    },
    /** Her gun in hand, of a kind and rarity, laid along `aim`: her slot's own. */
    armed(
      d: Drawing,
      gun: { kind: GunKind; rarity: number },
      aim: Vec3
    ): ShipDraw['gun'] {
      d.held.kind = gun.kind;
      d.held.rarity = gun.rarity;
      d.held.aim = aim;
      return d.held;
    },
    /** The first n ships drawn. */
    ships(n: number): readonly ShipDraw[] {
      ships.length = n;
      return ships;
    },
    /**
     * Every ball in flight as drawn `seconds` after the step it was flown to
     * (before it, back along its way, for less than none).
     */
    balls(all: readonly Ball[], seconds: number): readonly BallDraw[] {
      for (let i = 0; i < all.length; i++) {
        const b = all[i],
          d = (flights[i] ??= {
            at: [0, 0, 0],
            way: b.v,
            gun: b.kind,
            to: b.to,
          });
        add(b.p, b.v, seconds, d.at);
        d.way = b.v;
        d.gun = b.kind;
        d.to = b.to;
        flying[i] = d;
      }
      flying.length = all.length;
      return flying;
    },
  };
}

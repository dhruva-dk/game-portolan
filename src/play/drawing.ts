import type { GunKind } from '../sim/kinds.ts';
import type { Ball } from '../sim/shot.ts';
import type { BallDraw, Look, ShipDraw } from '../render/snapshot.ts';
import { poseOut, type PoseOut } from '../world/pose.ts';
import { add, put, type Out3, type Vec3 } from '../world/sphere.ts';

interface Drawing extends ShipDraw {
  pose: PoseOut;
  velocity: Out3;
  held: { kind: GunKind; rarity: number; aim: Vec3 };
}
interface Flight extends BallDraw {
  at: Out3;
}

export function createDrawing() {
  const ships: Drawing[] = [],
    slots: Drawing[] = [],
    flying: Flight[] = [],
    flights: Flight[] = [];
  return {
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
            held: { kind: 'cannon', rarity: 0, aim: [0, 0, 1] },
          });
      d.id = id;
      d.look = look;
      d.afloat = afloat;
      put(d.velocity, 0, 0, 0);
      d.gun = null;
      d.wear = 0;
      return d;
    },
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
    ships(n: number): readonly ShipDraw[] {
      ships.length = n;
      return ships;
    },
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

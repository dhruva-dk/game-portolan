import { uniform } from 'three/tsl';
import type { Light } from '../sky/light.ts';
import type { BallDraw, ShipDraw } from '../snapshot.ts';
import type { Eye } from '../view/view.ts';
import type { Vec3 } from '../../world/sphere.ts';
import { createBalls } from './balls.ts';
import { createMarks } from './marks.ts';
import { createPuffs } from './puffs.ts';

export function createGunfire(light: Light) {
  const now = uniform(0);
  const pixel = uniform(0);
  const balls = createBalls(pixel),
    marks = createMarks(pixel, now),
    puffs = createPuffs(light, now);

  return {
    meshes: [...balls.meshes, marks.mesh, puffs.mesh],
    shot: puffs.shot,
    splash: puffs.splash,
    strike: puffs.strike,
    sink: puffs.sink,
    draw(
      time: number,
      flying: readonly BallDraw[],
      ships: readonly ShipDraw[],
      eye: Vec3
    ) {
      now.value = time;
      puffs.worn(time, ships, eye);
      const n = balls.draw(flying);
      marks.draw(flying, n);
      puffs.draw(time, flying, n);
    },
    update(eye: Readonly<Eye>) {
      pixel.value = eye.pixel;
    },
  };
}

// The guns' work as it is seen: the balls in flight, the marks where the
// mortars' shells will fall, and the puffs where they go off and come down.
// Four draws for all of it, each a single instanced mesh; no targets of their
// own, nothing to compute. Each mesh is its own module:
//   balls.ts  the balls and their tracers (two draws)
//   marks.ts  the fall marks on the water about each mortar shell's landing
//   puffs.ts  flashes, smoke, spray and splinters, laid as the battle reports
//             what made them, the smoke trailing the balls, and the worn
//             ships' smoke
// This one holds the clock and the eye's pixel they share, and hands each its
// part of every frame.

import { uniform } from 'three/tsl';
import type { Light } from '../sky/light.ts';
import type { BallDraw, ShipDraw } from '../snapshot.ts';
import type { Eye } from '../view/view.ts';
import type { Vec3 } from '../world/sphere.ts';
import { createBalls } from './balls.ts';
import { createMarks } from './marks.ts';
import { createPuffs } from './puffs.ts';

/**
 * light: how the world is lit (sky/light.ts): the puffs; the sparks glow of
 * themselves.
 */
export function createGunfire(light: Light) {
  const now = uniform(0);
  /**
   * How wide a pixel is per metre away: the eye's, set by `update` each frame
   * before anything is drawn.
   */
  const pixel = uniform(0);
  const balls = createBalls(pixel),
    marks = createMarks(pixel, now),
    puffs = createPuffs(light, now);

  return {
    meshes: [...balls.meshes, marks.mesh, puffs.mesh],
    /** A gun fired, a ball come down, a ball home or a ram, a ship gone down. */
    shot: puffs.shot,
    splash: puffs.splash,
    strike: puffs.strike,
    sink: puffs.sink,
    /**
     * Each frame: the world's clock now (s), every ball in flight, and the
     * ships (the worn smoke) as seen from `eye` (metres).
     */
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
    /** Each frame, once the eye has moved (view.ts). */
    update(eye: Readonly<Eye>) {
      pixel.value = eye.pixel;
    },
  };
}

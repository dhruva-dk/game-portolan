// Views for the actors and the stage when no match is running: a fixed scene from the hook or the capture tools, and
// the lobby, where the player's ship sits on the water wearing their cosmetics.
import type { ActorsView, CosmeticIds, ShipView } from '../render/actors/index.ts';
import type { Look } from '../career/index.ts';
import { R } from '../sim/sphere.ts';
import type { V3 } from '../sim/math.ts';
import type { SceneSpec } from './scenes.ts';

/** The career's look as the actors' cosmetic ids. */
export const cosmeticsOf = (look: Look): CosmeticIds => ({
  sail: look.sailColour, pattern: look.sailPattern, hull: look.hullPaint, figurehead: look.figurehead, emblem: look.emblem, wake: look.wake,
});

const scale = (v: V3, k: number): V3 => ({ x: v.x * k, y: v.y * k, z: v.z * k });

/** A lone ship (or none) at a scene's spot. */
export function sceneActors(s: SceneSpec, time: number, sun: V3, look: CosmeticIds, speed = 0): ActorsView {
  const ships: ShipView[] = s.ship ? [{
    id: 0, pos: scale(s.pos, R), head: s.heading, speed, turn: 0, hull: 1, shield: 0, shieldMax: 100, weapon: 'cannon',
    cosmetics: look, alive: true,
  }] : [];
  // a steady breeze from behind the ship's port quarter
  const wind = { x: s.heading.x * 6, y: s.heading.y * 6, z: s.heading.z * 6 };
  return { time, sun, seaLevel: s.tide, wind, player: s.ship ? 0 : -1, ships, projectiles: [], loot: [], whales: [] };
}

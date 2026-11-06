// Heat haze: what is hot enough to bend the light over it. Anything on the stage that burns or fires names itself here
// each frame (a burning deck, Cinder Peak's crater) or once with a life (a muzzle's blast, a lava bomb landing); the
// frame's finish (post.ts) takes the strongest few on screen and shimmers what lies behind each, most in the column of
// air rising over it.
import { Vector3, type PerspectiveCamera } from 'three/webgpu';

/** How many sources the finish shimmers at once. */
export const HAZE_MAX = 8;

interface Source { at: Vector3; radius: number; strength: number; life: number; age: number }

const live: Source[] = [];
const pool: Source[] = [];

/**
 * Heat at `at` (world metres) shimmering the air `radius` metres round it, 0..1 strong. With `life` seconds it fades
 * out over them by itself; without, it is gone next frame unless named again.
 */
export function heat(at: { x: number; y: number; z: number }, radius: number, strength: number, life = 0): void {
  const s = pool.pop() ?? { at: new Vector3(), radius: 0, strength: 0, life: 0, age: 0 };
  s.at.set(at.x, at.y, at.z);
  s.radius = radius;
  s.strength = strength;
  s.life = life;
  s.age = 0;
  live.push(s);
}

/** A source on screen: where (0..1, y down), how far round in screen heights, how strong, and its distance in metres. */
export interface HazeSpot { x: number; y: number; r: number; strength: number; depth: number }

const V = new Vector3(), SPOTS: HazeSpot[] = Array.from({ length: HAZE_MAX }, () => ({ x: 0, y: 0, r: 0, strength: 0, depth: 0 }));

/** The strongest sources on screen this frame, projected through the camera; ages and drops the old ones. */
export function hazeSpots(cam: PerspectiveCamera, dt: number): readonly HazeSpot[] {
  const tanHalf = Math.tan((cam.fov * Math.PI) / 360);
  let n = 0;
  for (const s of SPOTS) s.strength = 0;
  for (let k = live.length - 1; k >= 0; k--) {
    const s = live[k];
    const fade = s.life > 0 ? 1 - s.age / s.life : 1;
    s.age += dt;
    if (s.life <= 0 || s.age >= s.life) {
      live.splice(k, 1);
      pool.push(s);
    }
    if (fade <= 0) continue;
    V.copy(s.at).applyMatrix4(cam.matrixWorldInverse);
    const depth = -V.z;
    if (depth < 0.5) continue;
    V.applyMatrix4(cam.projectionMatrix);
    const r = s.radius / (depth * tanHalf * 2);
    if (Math.abs(V.x) > 1 + r * 2 || Math.abs(V.y) > 1 + r * 2 || r < 0.004) continue;
    const strength = s.strength * fade * Math.min(1, r * 30);
    // the weakest of those kept makes room for a stronger one
    let slot = n < HAZE_MAX ? n++ : -1;
    if (slot < 0) {
      let weakest = 0;
      for (let j = 1; j < HAZE_MAX; j++) if (SPOTS[j].strength < SPOTS[weakest].strength) weakest = j;
      if (SPOTS[weakest].strength >= strength) continue;
      slot = weakest;
    }
    const o = SPOTS[slot];
    o.x = V.x * 0.5 + 0.5;
    o.y = 0.5 - V.y * 0.5;
    o.r = r;
    o.strength = strength;
    o.depth = depth - s.radius;
  }
  return SPOTS;
}

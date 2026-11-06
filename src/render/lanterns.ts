// The lanterns lit this frame, for the light they throw into the air round them: the ships list theirs as they draw
// them, and the stage hands the nearest to the fog. Each is a place in metres and a colour already times its
// strength; the list is cleared as the ships start listing again.
export interface Lantern {
  x: number; y: number; z: number;
  r: number; g: number; b: number;
}

const pool: Lantern[] = [];
let count = 0;

export const LANTERNS = {
  /** Starts a new frame's list. */
  clear(): void {
    count = 0;
  },
  add(at: { x: number; y: number; z: number }, colour: { r: number; g: number; b: number }, strength: number): void {
    const l = (pool[count] ??= { x: 0, y: 0, z: 0, r: 0, g: 0, b: 0 });
    l.x = at.x; l.y = at.y; l.z = at.z;
    l.r = colour.r * strength; l.g = colour.g * strength; l.b = colour.b * strength;
    count++;
  },
  get count(): number {
    return count;
  },
  at(i: number): Lantern {
    return pool[i];
  },
};

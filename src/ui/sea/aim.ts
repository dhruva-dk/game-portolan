export const FIRE_DRAG = { slop: 8 } as const;

type Delta = [number, number];

export const aimed = ([dx, dy]: Delta, sensitivity: number): Delta => [
  dx * sensitivity,
  dy * sensitivity,
];

export function fireDrag(slop: number = FIRE_DRAG.slop) {
  let from: Delta | null = null,
    last: Delta = [0, 0],
    moving = false;
  return {
    down(x: number, y: number) {
      from = [x, y];
      last = [x, y];
      moving = false;
    },
    move(x: number, y: number): Delta | null {
      if (!from) return null;
      if (!moving && Math.hypot(x - from[0], y - from[1]) < slop) return null;
      moving = true;
      const d: Delta = [x - last[0], y - last[1]];
      last = [x, y];
      return d;
    },
    up() {
      from = null;
    },
    get moving() {
      return from !== null && moving;
    },
  };
}

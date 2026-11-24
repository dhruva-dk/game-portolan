import type { Hands } from '../player.ts';
import { clamp } from '../world/scalar.ts';
import { view } from './ui.ts';

export const STICK = 56;
const LEFT = 0.45;
const KEYS = {
  right: ['KeyD', 'ArrowRight'],
  left: ['KeyA', 'ArrowLeft'],
  up: ['KeyW', 'ArrowUp'],
  down: ['KeyS', 'ArrowDown'],
} as const;

interface Finger {
  x: number;
  y: number;
}

export function createInput(element: HTMLElement, steers: () => boolean) {
  const looks = new Map<number, Finger>();
  const thumb = { id: -1, x: 0, y: 0, cx: 0, cy: 0 };
  const keys = new Set<string>();
  let lookX = 0,
    lookY = 0,
    fired = false,
    holding = false,
    tapped: number | null = null,
    gusted = false;

  element.addEventListener('pointerdown', (e) => {
    element.setPointerCapture(e.pointerId);
    if (thumb.id < 0 && steers() && e.clientX < view.w * LEFT) {
      const reach = STICK * view.k,
        within = (v: number, size: number) => clamp(v, reach, size - reach);
      [thumb.id, thumb.x, thumb.y] = [e.pointerId, e.clientX, e.clientY];
      [thumb.cx, thumb.cy] = [
        within(e.clientX, view.w),
        within(e.clientY, view.h),
      ];
    } else looks.set(e.pointerId, { x: e.clientX, y: e.clientY });
  });
  element.addEventListener('pointermove', (e) => {
    if (e.pointerId === thumb.id) {
      thumb.x = e.clientX;
      thumb.y = e.clientY;
      return;
    }
    const f = looks.get(e.pointerId);
    if (!f) return;
    lookX += e.clientX - f.x;
    lookY += e.clientY - f.y;
    f.x = e.clientX;
    f.y = e.clientY;
  });
  const lift = (e: PointerEvent) => {
    if (e.pointerId === thumb.id) thumb.id = -1;
    else looks.delete(e.pointerId);
  };
  element.addEventListener('pointerup', lift);
  element.addEventListener('pointercancel', lift);
  const down = (e: KeyboardEvent) => keys.add(e.code);
  const up = (e: KeyboardEvent) => keys.delete(e.code);
  const blur = () => {
    keys.clear();
    looks.clear();
    thumb.id = -1;
    holding = false;
  };
  addEventListener('keydown', down);
  addEventListener('keyup', up);
  addEventListener('blur', blur);

  const pressed = (codes: readonly string[]) => {
    for (const c of codes) if (keys.has(c)) return 1;
    return 0;
  };

  return {
    read(): Hands {
      let stick: Hands['stick'] = null;
      if (thumb.id >= 0) {
        const reach = STICK * view.k;
        const x = (thumb.x - thumb.cx) / reach,
          y = (thumb.cy - thumb.y) / reach,
          over = Math.max(1, Math.hypot(x, y));
        stick = { x: x / over, y: y / over, centre: [thumb.cx, thumb.cy] };
      } else {
        const x = pressed(KEYS.right) - pressed(KEYS.left),
          y = pressed(KEYS.up) - pressed(KEYS.down);
        const size = Math.hypot(x, y);
        if (size > 0) stick = { x: x / size, y: y / size, centre: null };
      }
      const look = { x: lookX, y: lookY, held: looks.size > 0 };
      lookX = lookY = 0;
      const fire = fired || holding || keys.has('Space'),
        tap = tapped,
        gust = gusted;
      fired = gusted = false;
      tapped = null;
      return { stick, look, fire, tap, gust };
    },
    fire(down: boolean) {
      holding = down;
      if (down) fired = true;
    },
    tap(i: number) {
      tapped = i;
    },
    gust() {
      gusted = true;
    },
    dispose() {
      removeEventListener('keydown', down);
      removeEventListener('keyup', up);
      removeEventListener('blur', blur);
    },
  };
}

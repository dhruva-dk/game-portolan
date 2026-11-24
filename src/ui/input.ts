// The player's hands: a stick under the left thumb, a look under the right,
// both at once; the keyboard at a desk.
//
// While she steers, a finger put down anywhere on the left of the screen holds
// the stick there, its centre where it landed (kept its own reach inside the
// screen's edges) and staying there until it is let go: pushed past the rim it
// reads as fully pushed that way. Any other finger drags the look: every finger
// on the canvas is a drag, never a tap (touch.ts). WASD or the arrows push the
// stick all the way while no finger holds it. The gun's trigger is held by the
// HUD's Fire (fire) or Space, a slot of the hotbar tapped (tap) and Gust
// pressed (gust), with a finger or a click. What they mean is the game's
// business (play/game.ts step); this only reports them.

import type { Call, Hands } from '../player.ts';
import { clamp } from '../world/scalar.ts';
import { view } from './ui.ts';

/**
 * The stick's reach from its centre, CSS pixels at the UI's drawn size (ui.ts
 * size: grown with the rest of it).
 */
export const STICK = 56;
/**
 * The share of the screen's width, from the left, where a finger takes the
 * stick.
 */
const LEFT = 0.45;
/** The keys that push the stick each way. */
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

/**
 * element: what the fingers are read on; steers: whether a finger on the left
 * takes the stick (off, as in the lobby, every finger drags the look).
 */
export function createInput(element: HTMLElement, steers: () => boolean) {
  /** The fingers dragging the look, by pointer. */
  const looks = new Map<number, Finger>();
  /**
   * The finger on the stick (its pointer, -1 with none), where it is and the
   * stick's centre.
   */
  const thumb = { id: -1, x: 0, y: 0, cx: 0, cy: 0 };
  const keys = new Set<string>();
  let lookX = 0,
    lookY = 0,
    fired = false,
    holding = false,
    tapped: number | null = null,
    gusted = false,
    called: Call | undefined;

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

  /** 1 if any of `codes` is held, else 0. */
  const pressed = (codes: readonly string[]) => {
    for (const c of codes) if (keys.has(c)) return 1;
    return 0;
  };

  return {
    read(): Hands {
      let stick: Hands['stick'] = null;
      if (thumb.id >= 0) {
        // past the rim she is pushed all the way, no further
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
      // the trigger: held while Fire or Space is down, and a press since the
      // last read counted though let go before it
      const fire = fired || holding || keys.has('Space'),
        tap = tapped,
        gust = gusted;
      fired = gusted = false;
      tapped = null;
      const hands: Hands = { stick, look, fire, tap, gust };
      if (called !== undefined) hands.call = called;
      called = undefined;
      return hands;
    },
    /** Her team's call changed, read once. */
    call(c: Call) {
      called = c;
    },
    /**
     * Fire pressed (down) or let go: her gun fires while it is held, at its
     * kind's interval.
     */
    fire(down: boolean) {
      holding = down;
      if (down) fired = true;
    },
    /** A slot of the hotbar tapped, read once. */
    tap(i: number) {
      tapped = i;
    },
    /** Gust pressed, read once. */
    gust() {
      gusted = true;
    },
    /** Stops listening to the page's keys. */
    dispose() {
      removeEventListener('keydown', down);
      removeEventListener('keyup', up);
      removeEventListener('blur', blur);
    },
  };
}

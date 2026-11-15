// The player's hands: a stick under the left thumb, a look under the right, both at once; the keyboard at a desk.
//
// While she steers, a finger put down anywhere on the left of the screen holds the stick there, its centre where it landed (kept its
// own reach inside the screen's edges) and staying there until it is let go: pushed past the rim it reads as fully
// pushed that way. Any other finger drags the look.
// WASD or the arrows push the stick all the way while no finger holds it. The gun's trigger is held by the HUD's Fire
// (fire) or Space, a slot of the hotbar tapped (tap) and Gust pressed (gust), with a finger or a click; in a race, her
// flight called (flight) and a call to her crewmate (call) from the HUD's buttons. What they mean is the
// game's business (play/game.ts step); this only reports them.

import type { Hands } from '../player';
import type { Call } from '../race';

/** The stick's reach from its centre, CSS pixels. */
export const STICK = 56;
/** The share of the screen's width, from the left, where a finger takes the stick. */
const LEFT = 0.45;

interface Finger { stick: boolean; x: number; y: number; cx: number; cy: number }

/** element: what the fingers are read on; steers: whether a finger on the left takes the stick (off, as in the lobby,
 *  every finger drags the look). */
export function createInput(element: HTMLElement, steers: () => boolean) {
  const fingers = new Map<number, Finger>();
  const keys = new Set<string>();
  let lookX = 0, lookY = 0, fired = false, holding = false, tapped: number | null = null, gusted = false;
  let flown = false, given: Call | null = null;

  element.addEventListener('pointerdown', (e) => {
    element.setPointerCapture(e.pointerId);
    const stick = steers() && e.clientX < innerWidth * LEFT && ![...fingers.values()].some((f) => f.stick);
    const within = (v: number, size: number) => Math.min(Math.max(v, STICK), size - STICK);
    const cx = stick ? within(e.clientX, innerWidth) : e.clientX, cy = stick ? within(e.clientY, innerHeight) : e.clientY;
    fingers.set(e.pointerId, { stick, x: e.clientX, y: e.clientY, cx, cy });
  });
  element.addEventListener('pointermove', (e) => {
    const f = fingers.get(e.pointerId);
    if (!f) return;
    if (!f.stick) {
      lookX += e.clientX - f.x;
      lookY += e.clientY - f.y;
    }
    f.x = e.clientX;
    f.y = e.clientY;
  });
  const lift = (e: PointerEvent) => fingers.delete(e.pointerId);
  element.addEventListener('pointerup', lift);
  element.addEventListener('pointercancel', lift);
  addEventListener('keydown', (e) => keys.add(e.code));
  addEventListener('keyup', (e) => keys.delete(e.code));
  addEventListener('blur', () => {
    keys.clear();
    fingers.clear();
    holding = false;
  });

  const key = (plus: string[], minus: string[]) => (plus.some((k) => keys.has(k)) ? 1 : 0) - (minus.some((k) => keys.has(k)) ? 1 : 0);

  return {
    read(): Hands {
      const held = [...fingers.values()];
      const thumb = held.find((f) => f.stick);
      let stick: Hands['stick'] = null;
      if (thumb) {
        // past the rim she is pushed all the way, no further
        const x = (thumb.x - thumb.cx) / STICK, y = (thumb.cy - thumb.y) / STICK, over = Math.max(1, Math.hypot(x, y));
        stick = { x: x / over, y: y / over, centre: [thumb.cx, thumb.cy] };
      }
      else {
        const x = key(['KeyD', 'ArrowRight'], ['KeyA', 'ArrowLeft']), y = key(['KeyW', 'ArrowUp'], ['KeyS', 'ArrowDown']);
        const size = Math.hypot(x, y);
        if (size > 0) stick = { x: x / size, y: y / size, centre: null };
      }
      const look = { x: lookX, y: lookY, held: held.some((f) => !f.stick) };
      lookX = lookY = 0;
      // the trigger: held while Fire or Space is down, and a press since the last read counted though let go before it
      const fire = fired || holding || keys.has('Space'), tap = tapped, gust = gusted, flight = flown, call = given;
      [fired, tapped, gusted, flown, given] = [false, null, false, false, null];
      return { stick, look, fire, tap, gust, flight, call };
    },
    /** Her flight called, read once. */
    flight() {
      flown = true;
    },
    /** A call to her crewmate, read once. */
    call(c: Call) {
      given = c;
    },
    /** Fire pressed (down) or let go: her gun fires while it is held, at its kind's interval. */
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
  };
}

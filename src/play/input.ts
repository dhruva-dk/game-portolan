// The player's hands: a stick under the left thumb, a look under the right, both at once; the keyboard at a desk.
//
// A finger put down anywhere on the left of the screen holds the stick there, its centre where it landed (kept its
// own reach inside the screen's edges) and staying there until it is let go: pushed past the rim it reads as fully
// pushed that way. Any other finger drags the look.
// WASD or the arrows push the stick all the way while no finger holds it. What the stick and look mean is the
// game's business; this only reports them.

/** The stick's reach from its centre, CSS pixels. */
export const STICK = 56;
/** The share of the screen's width, from the left, where a finger takes the stick. */
const LEFT = 0.45;

export interface Hands {
  /** The stick, while held: how far it is pushed right and up the screen (within the unit disc), and its centre (px; none for the keys). */
  stick: { x: number; y: number; centre: [number, number] | null } | null;
  /** The look: pixels dragged right and down since the last read, and whether a finger is on it. */
  look: { x: number; y: number; held: boolean };
  /** TEMPORARY (until the HUD's fire button is the only way): the gun ordered fired, Space held at a desk. */
  fire: boolean;
}

interface Finger { stick: boolean; x: number; y: number; cx: number; cy: number }

export function createInput(element: HTMLElement) {
  const fingers = new Map<number, Finger>();
  const keys = new Set<string>();
  let lookX = 0, lookY = 0;

  element.addEventListener('pointerdown', (e) => {
    element.setPointerCapture(e.pointerId);
    const stick = e.clientX < innerWidth * LEFT && ![...fingers.values()].some((f) => f.stick);
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
      return { stick, look, fire: keys.has('Space') };
    },
  };
}

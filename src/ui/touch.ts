// What a touch on the UI amounts to, one way for every piece of it: a tap is a
// pointer that comes down on a thing and lifts on it without travelling past
// TAP; past that it is a drag. The full map's fingers (globe.ts) tell its spin
// and pinch from a tap by the same travel; the canvas's stick and look
// (input.ts) take every finger as a drag, as the seed panel's globe takes its
// one (onDrag, orb.ts).

/** How far a press may travel and still be a tap, CSS px. */
const TAP = 8;

/** Whether a press from (x0, y0) to (x1, y1) has travelled past a tap. */
export const dragged = (x0: number, y0: number, x1: number, y1: number) =>
  Math.hypot(x1 - x0, y1 - y0) > TAP;

/**
 * Calls `act` on a tap of `el`, and keeps the touch from whatever is under it
 * (the canvas, a sheet's own tap).
 */
export function onTap(el: GlobalEventHandlers, act: (e: PointerEvent) => void) {
  let id = -1,
    x = 0,
    y = 0;
  el.addEventListener('pointerdown', (e) => {
    id = e.pointerId;
    x = e.clientX;
    y = e.clientY;
    e.stopPropagation();
  });
  el.addEventListener('pointerup', (e) => {
    e.stopPropagation();
    if (e.pointerId === id && !dragged(x, y, e.clientX, e.clientY)) act(e);
    id = -1;
  });
  el.addEventListener('pointercancel', () => {
    id = -1;
  });
}

/**
 * Calls `held(true)` as a touch comes down on `el` and `held(false)` as it
 * lifts, wherever it has gone meanwhile (the element keeps it); the touch kept
 * from whatever is under it.
 */
export function onHold(el: HTMLElement, held: (on: boolean) => void) {
  el.addEventListener('pointerdown', (e) => {
    e.stopPropagation();
    el.setPointerCapture(e.pointerId);
    held(true);
  });
  for (const lift of [
    'pointerup',
    'pointercancel',
    'lostpointercapture',
  ] as const)
    el.addEventListener(lift, () => held(false));
}

/**
 * One finger dragged on `el` (the seed panel's globe): `drag.move` as it goes,
 * by the CSS px it went and the ms that took; `drag.lift` as it lifts, with the
 * ms it was held still before; the touch kept from whatever is under it, and
 * the element keeping it wherever it goes.
 */
export function onDrag(
  el: HTMLElement,
  drag: {
    move(dx: number, dy: number, ms: number): void;
    lift(still: number): void;
  }
) {
  let id = -1,
    x = 0,
    y = 0,
    t = 0;
  el.addEventListener('pointerdown', (e) => {
    e.stopPropagation();
    if (id !== -1) return;
    el.setPointerCapture(e.pointerId);
    [id, x, y, t] = [e.pointerId, e.clientX, e.clientY, e.timeStamp];
    drag.move(0, 0, 0);
  });
  el.addEventListener('pointermove', (e) => {
    if (e.pointerId !== id) return;
    drag.move(e.clientX - x, e.clientY - y, e.timeStamp - t);
    [x, y, t] = [e.clientX, e.clientY, e.timeStamp];
  });
  for (const end of ['pointerup', 'pointercancel'] as const)
    el.addEventListener(end, (e) => {
      if (e.pointerId !== id) return;
      e.stopPropagation();
      id = -1;
      drag.lift(e.timeStamp - t);
    });
}

/**
 * Keeps a touch on `el` from whatever is under it, doing nothing with it (a
 * sheet's paper, under its own taps).
 */
export function keep(el: Element) {
  el.addEventListener('pointerdown', (e) => e.stopPropagation());
}

/**
 * Calls `act` as a touch comes down on anything of `layer`'s that takes one
 * (`.press`), before that thing hears it.
 */
export function onPressed(layer: HTMLElement, act: () => void) {
  layer.addEventListener(
    'pointerdown',
    (e) => {
      if (e.target instanceof Element && e.target.closest('.press')) act();
    },
    true
  );
}

/**
 * A part of a sheet's drawing, by its id, made to take a tap; the part, if
 * there is one.
 */
export function region(
  el: SVGSVGElement,
  id: string,
  act: (e: PointerEvent) => void
): SVGElement | null {
  const r = el.querySelector<SVGElement>(`#${id}`);
  if (!r) return null;
  // the class, not a style on the group: a touch lands on the shapes inside it, which the layer's rule would
  // otherwise leave untouchable (ui.ts)
  r.classList.add('press');
  onTap(r, act);
  return r;
}

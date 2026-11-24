const TAP = 8;

export const dragged = (x0: number, y0: number, x1: number, y1: number) =>
  Math.hypot(x1 - x0, y1 - y0) > TAP;

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

export function onHold(
  el: GlobalEventHandlers & Pick<Element, 'setPointerCapture'>,
  held: (on: boolean) => void
) {
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

export function onLook(
  layer: HTMLElement,
  within: string,
  look: (dx: number, dy: number, held: boolean) => void
) {
  let id = -1,
    x = 0,
    y = 0;
  layer.addEventListener(
    'pointerdown',
    (e) => {
      if (!(e.target instanceof Element) || !e.target.closest(within)) return;
      [id, x, y] = [e.pointerId, e.clientX, e.clientY];
    },
    { capture: true }
  );
  addEventListener('pointermove', (e) => {
    if (e.pointerId !== id) return;
    look(e.clientX - x, e.clientY - y, true);
    [x, y] = [e.clientX, e.clientY];
  });
  for (const end of ['pointerup', 'pointercancel'] as const)
    addEventListener(end, (e) => {
      if (e.pointerId !== id) return;
      id = -1;
      look(0, 0, false);
    });
}

export function keep(el: Element) {
  el.addEventListener('pointerdown', (e) => e.stopPropagation());
}

export function onPressed(layer: HTMLElement, act: () => void) {
  layer.addEventListener(
    'pointerdown',
    (e) => {
      if (e.target instanceof Element && e.target.closest('.press')) act();
    },
    true
  );
}

export function region(
  el: SVGSVGElement,
  id: string,
  act: (e: PointerEvent) => void
): SVGElement | null {
  const r = el.querySelector<SVGElement>(`#${id}`);
  if (!r) return null;
  r.classList.add('press');
  onTap(r, act);
  return r;
}

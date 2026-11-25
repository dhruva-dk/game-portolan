import { MOTION, SPACE } from './house.ts';
import { INK } from './ink.ts';
import { dragged } from './touch.ts';
import { view } from './ui.ts';

export type Box = { x: number; y: number; w: number; h: number };

export type List = {
  el: HTMLElement;
  show(rows: readonly HTMLElement[]): void;
  to(index: number, instant?: boolean): void;
  near(index: number): boolean;
};

type Sample = { dy: number; ms: number };

const THUMB = { w: 3, inset: 2, least: 18, opacity: 0.4 } as const;
const EDGE = SPACE.gap;

const r2 = (n: number) => Math.round(n * 100) / 100;

const easeOut = (t: number) => 1 - (1 - t) ** 3;

export function createList(parent: HTMLElement, box: Box, row: number): List {
  const {
    glide,
    rubber,
    bounce,
    settle,
    rest,
    sampled,
    margin,
    to: going,
    thumb: shown,
  } = MOTION.list;
  const edge = EDGE;
  const el = document.createElement('div');
  el.className = 'list press';
  el.style.cssText =
    `position:absolute;left:${box.x}px;top:${box.y}px;width:${box.w}px;height:${box.h}px;` +
    `overflow:hidden;touch-action:none;cursor:default;` +
    `mask-image:linear-gradient(transparent, #000 ${edge}px, #000 calc(100% - ${edge}px), transparent);` +
    `-webkit-mask-image:linear-gradient(transparent, #000 ${edge}px, #000 calc(100% - ${edge}px), transparent)`;
  parent.append(el);
  const strip = document.createElement('div');
  strip.style.cssText = 'position:absolute;left:0;top:0;right:0;';
  const thumb = document.createElement('div');
  thumb.style.cssText =
    `position:absolute;right:${THUMB.inset}px;top:0;width:${THUMB.w}px;border-radius:${THUMB.w}px;background:${INK.iron};` +
    `opacity:0;transition:opacity ${shown.fade}ms ease;`;
  el.append(strip, thumb);

  let rows: readonly HTMLElement[] = [],
    y = 0,
    raw = 0,
    v = 0,
    held = -1,
    moving = false,
    from = { x: 0, y: 0 },
    last = 0,
    samples: Sample[] = [],
    frame = 0,
    then = 0,
    tween: { from: number; to: number; at: number } | null = null,
    hide = 0;

  const most = () => Math.max(0, rows.length * row + 2 * EDGE - box.h);

  const stretched = (over: number) =>
    Math.sign(over) * (1 - 1 / ((Math.abs(over) * rubber) / box.h + 1)) * box.h;

  const bounded = (at: number) => Math.min(most(), Math.max(0, at));

  function place() {
    strip.style.transform = `translateY(${r2(-y)}px)`;
    const reach = margin * row;
    rows.forEach((r, i) => {
      const top = EDGE + i * row - y,
        far = top + row < -reach || top > box.h + reach;
      if (r.hidden !== far) r.hidden = far;
    });
    const content = rows.length * row + 2 * EDGE;
    if (content <= box.h) return;
    const size = Math.max(THUMB.least, (box.h * box.h) / content),
      over = y < 0 ? y : y > most() ? y - most() : 0,
      squeezed = Math.max(THUMB.least / 2, size - Math.abs(over)),
      at = ((bounded(y) / most()) * (box.h - size)) | 0;
    thumb.style.height = `${r2(squeezed)}px`;
    thumb.style.transform = `translateY(${r2(over < 0 ? 0 : over > 0 ? box.h - squeezed : at)}px)`;
  }

  function wake() {
    clearTimeout(hide);
    if (rows.length * row + 2 * EDGE > box.h)
      thumb.style.opacity = `${THUMB.opacity}`;
  }

  function sleep() {
    clearTimeout(hide);
    hide = window.setTimeout(() => {
      thumb.style.opacity = '0';
    }, shown.linger);
  }

  function step(now: number) {
    const dt = Math.min(48, now - then);
    then = now;
    if (tween) {
      const t = Math.min(1, (now - tween.at) / going.ms);
      y = tween.from + (tween.to - tween.from) * easeOut(t);
      if (t >= 1) tween = null;
    } else {
      const top = most(),
        out = y < 0 ? y : y > top ? y - top : 0;
      if (out !== 0 && Math.abs(v) > rest) {
        v *= Math.exp(-dt / bounce);
        y += v * dt;
      } else if (out !== 0) {
        v = 0;
        const target = out < 0 ? 0 : top;
        y = target + (y - target) * Math.exp(-dt / settle);
        if (Math.abs(y - target) < 0.2) y = target;
      } else if (Math.abs(v) > rest) {
        v *= Math.exp(-dt / glide);
        y += v * dt;
      } else v = 0;
    }
    place();
    const top = most();
    const still = !tween && v === 0 && y >= 0 && y <= top;
    if (still) {
      frame = 0;
      sleep();
      return;
    }
    frame = requestAnimationFrame(step);
  }

  function run() {
    if (frame) return;
    then = performance.now();
    frame = requestAnimationFrame(step);
  }

  function stop() {
    cancelAnimationFrame(frame);
    frame = 0;
    tween = null;
    v = 0;
  }

  el.addEventListener(
    'pointerdown',
    (e) => {
      if (held !== -1) return;
      stop();
      held = e.pointerId;
      moving = false;
      from = { x: e.clientX, y: e.clientY };
      last = e.timeStamp;
      raw = y;
      samples = [];
    },
    true
  );

  el.addEventListener(
    'pointermove',
    (e) => {
      if (e.pointerId !== held) return;
      if (!moving) {
        if (!dragged(from.x, from.y, e.clientX, e.clientY)) return;
        moving = true;
        el.setPointerCapture(e.pointerId);
        el.querySelectorAll('.down').forEach((down) =>
          down.classList.remove('down')
        );
        from = { x: e.clientX, y: e.clientY };
        last = e.timeStamp;
        return;
      }
      const dy = (e.clientY - from.y) / view.k,
        ms = Math.max(1, e.timeStamp - last);
      from = { x: e.clientX, y: e.clientY };
      last = e.timeStamp;
      raw -= dy;
      const top = most();
      y =
        raw < 0 ? stretched(raw) : raw > top ? top + stretched(raw - top) : raw;
      samples.push({ dy: -dy, ms });
      if (samples.length > sampled) samples.shift();
      place();
      wake();
    },
    true
  );

  const lift = (e: PointerEvent) => {
    if (e.pointerId !== held) return;
    held = -1;
    if (!moving) {
      sleep();
      return;
    }
    moving = false;
    const idle = e.timeStamp - last;
    const span = samples.reduce((a, s) => a + s.ms, 0);
    v =
      idle > sampled * 16 || span === 0
        ? 0
        : samples.reduce((a, s) => a + s.dy, 0) / span;
    run();
  };
  el.addEventListener('pointerup', lift, true);
  el.addEventListener('pointercancel', lift, true);

  el.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      stop();
      y = bounded(y + e.deltaY / view.k);
      place();
      wake();
      sleep();
    },
    { passive: false }
  );

  return {
    el,
    show(next) {
      rows = next;
      next.forEach((r, i) => {
        r.style.position = 'absolute';
        r.style.left = '0';
        r.style.right = '0';
        r.style.top = `${EDGE + i * row}px`;
        r.style.height = `${row}px`;
      });
      strip.replaceChildren(...next);
      strip.style.height = `${next.length * row + 2 * EDGE}px`;
      if (!moving && !frame) y = bounded(y);
      place();
    },
    to(index, instant = false) {
      const target = bounded(EDGE + index * row - (box.h - row) / 2);
      stop();
      if (instant) {
        y = target;
        place();
        return;
      }
      tween = { from: y, to: target, at: performance.now() };
      wake();
      run();
    },
    near(index) {
      const top = EDGE + index * row - y;
      return top + row > 0 && top < box.h;
    },
  };
}

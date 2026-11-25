import { LINES, bubble, type Side } from '../base/bubble.ts';
import { MOTION } from '../base/house.ts';
import { svg } from '../base/ink.ts';
import { onTap } from '../base/touch.ts';
import { view } from '../base/ui.ts';

export type Beside = { el: Element; side: Side; aim?: number };

const SPOKEN = {
  gap: 4,
  edge: 10,
  clear: 70,
  every: 15,
  tries: 4,
  late: 8,
} as const;

type Placed = { left: number; top: number; html: string };

function placeBubble(
  line: string,
  target: { left: number; top: number; right: number; bottom: number },
  side: Side,
  screen: { w: number; h: number; k: number },
  lean = 0.5
): Placed {
  const { k, w: sw, h: sh } = screen,
    gap = SPOKEN.gap * k,
    edge = SPOKEN.edge * k,
    clear = SPOKEN.clear * k;
  const cx = (target.left + target.right) / 2,
    cy = (target.top + target.bottom) / 2;
  const [ax, ay] =
    side === 'down'
      ? [cx, target.top - gap]
      : side === 'up'
        ? [cx, target.bottom + gap]
        : side === 'right'
          ? [target.left - gap, cy]
          : [target.right + gap, cy];
  const across = side === 'down' || side === 'up';
  let aim = lean,
    b = bubble(line, aim, side);
  for (let i = 0; across && i < SPOKEN.tries; i++) {
    const wide = b.w * k,
      tall = b.h * k,
      from = ax - b.tip[0] * k,
      top = side === 'down' ? ay - tall : ay;
    let to = Math.min(Math.max(from, edge), sw - edge - wide);
    const middle = top < sh / 2 + clear && top + tall > sh / 2 - clear;
    if (middle && to < sw / 2 + clear && to + wide > sw / 2 - clear)
      to =
        ax < sw / 2
          ? Math.min(to, sw / 2 - clear - wide)
          : Math.max(to, sw / 2 + clear);
    if (Math.abs(to - from) < 1) break;
    aim = Math.min(1, Math.max(0, aim + (from - to) / wide));
    b = bubble(line, aim, side);
  }
  const left = ax - b.tip[0] * k,
    top = Math.min(
      Math.max(ay - b.tip[1] * k, edge),
      Math.max(edge, sh - edge - b.h * k)
    );
  return { left, top, html: svg(b.w, b.h, b.svg) };
}

export function createUncleAtSea<Id extends string>(
  host: HTMLElement,
  seen: (id: Id) => void
) {
  let id: Id | null = null,
    said: HTMLDivElement | null = null,
    beside: Beside | null = null,
    where = '',
    frames = 0;

  const place = () => {
    if (!said || !id || !beside) return;
    const r = beside.el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) return;
    const key = `${Math.round(r.left)},${Math.round(r.top)},${Math.round(r.width)},${Math.round(r.height)},${beside.side},${view.w},${view.h}`;
    if (key === where) return;
    const first = where === '';
    where = key;
    const p = placeBubble(LINES[id] ?? '', r, beside.side, view, beside.aim);
    said.style.left = `${p.left.toFixed(1)}px`;
    said.style.top = `${p.top.toFixed(1)}px`;
    said.innerHTML = p.html;
    if (!first) said.querySelector('.said')?.classList.add('settled');
  };

  const fold = (tapped: boolean) => {
    const going = said,
      was = id;
    beside?.el.classList.remove('beckon');
    said = null;
    id = null;
    beside = null;
    where = '';
    if (!going) return;
    going.classList.add('folding');
    going.addEventListener('animationend', (e) => {
      if (e.animationName === 'uncle-out') going.remove();
    });
    window.setTimeout(
      () => going.remove(),
      SPOKEN.late * (MOTION.uncle.fold + MOTION.uncle.away)
    );
    if (tapped && was) seen(was);
  };

  const open = (next: Id, by: Beside) => {
    id = next;
    beside = by;
    const el = document.createElement('div');
    el.className = 'press';
    el.style.cssText = `position:absolute;transform-origin:0 0;scale:var(--k)`;
    el.setAttribute('data-tap', 'bubble');
    onTap(el, () => {
      if (said === el) fold(true);
    });
    host.appendChild(el);
    said = el;
    place();
    by.el.classList.add('beckon');
  };

  return {
    say(next: Id | null, by: Beside | null) {
      if (next === id && by?.el === beside?.el && by?.side === beside?.side) {
        if (++frames % SPOKEN.every === 0) place();
        return;
      }
      if (said) fold(false);
      if (next !== null && by) open(next, by);
    },
    get showing() {
      return id;
    },
  };
}

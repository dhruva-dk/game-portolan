// Progress bars and rings. A bar drains with a ghost that lags behind, gains with a ghost that leads, and can be
// filled over time for the results screen. A ring fills round a button for cooldowns and use times.
import { clamp, el, esc } from './dom.ts';
import { tween } from './motion.ts';

export type BarKind = 'xp' | 'rank' | 'shield' | 'hull' | 'plain';

export interface BarHandle {
  el: HTMLElement;
  /** Sets the value (0–1). Animated by default: a drain leaves a ghost, a gain leads with one. */
  set(v: number, animate?: boolean): void;
  /** Fills from the current value to v over ms; resolves when it lands. */
  fillTo(v: number, ms?: number): Promise<void>;
  setLabel(t: string): void;
  value(): number;
}

export function progressBar(o: { kind?: BarKind; value?: number; label?: string; segments?: number; icon?: string; parent?: Element; className?: string }): BarHandle {
  // with a glyph, the bar sits in a row behind it; the handle is still the bar's
  const row = o.icon ? el('p-barRow', o.parent, `<i class="p-barRow__icon">${o.icon}</i>`) : null;
  if (row) row.dataset.kind = o.kind ?? 'xp';
  const parent = row ?? o.parent;
  const b = el(`p-bar p-bar--${o.kind ?? 'xp'}${o.className ? ' ' + o.className : ''}`, parent, '<i class="p-bar__ghost"></i><i class="p-bar__fill"></i>');
  b.dataset.part = `bar:${o.kind ?? 'xp'}`;
  const ghost = b.querySelector<HTMLElement>('.p-bar__ghost')!, fill = b.querySelector<HTMLElement>('.p-bar__fill')!;
  if (o.segments && o.segments > 1) {
    const s = el('p-bar__seg', b);
    s.style.background = `repeating-linear-gradient(90deg, transparent 0 calc(${100 / o.segments}% - 1.5px), rgba(26,16,8,.75) calc(${100 / o.segments}% - 1.5px) ${100 / o.segments}%)`;
  }
  const label = el('p-bar__label', b, o.label ? esc(o.label) : '');
  let v = clamp(o.value ?? 0, 0, 1), timer = 0;
  const put = (e: HTMLElement, x: number, t: string) => { e.style.transition = t; e.style.transform = `scaleX(${x.toFixed(4)})`; };
  put(fill, v, 'none');
  put(ghost, v, 'none');
  const set = (x: number, animate = true) => {
    x = clamp(x, 0, 1);
    clearTimeout(timer);
    if (!animate) { put(fill, x, 'none'); put(ghost, x, 'none'); v = x; return; }
    if (x < v) {
      put(fill, x, 'transform 120ms ease-out');
      timer = window.setTimeout(() => put(ghost, x, 'transform 520ms cubic-bezier(.4,0,.2,1)'), 360);
      b.classList.remove('is-gaining');
    } else if (x > v) {
      put(ghost, x, 'transform 120ms ease-out');
      put(fill, x, 'transform 620ms cubic-bezier(.2,.8,.2,1) 120ms');
      b.classList.add('is-gaining');
      timer = window.setTimeout(() => b.classList.remove('is-gaining'), 800);
    }
    v = x;
  };
  const fillTo = (x: number, ms = 900) => {
    const from = v;
    x = clamp(x, 0, 1);
    ghost.style.transition = fill.style.transition = 'none';
    return tween(ms, (t) => {
      const y = from + (x - from) * t;
      fill.style.transform = ghost.style.transform = `scaleX(${y.toFixed(4)})`;
    }).then(() => { v = x; });
  };
  return { el: b, set, fillTo, setLabel: (t) => { label.textContent = t; }, value: () => v };
}

export interface RingHandle { el: SVGSVGElement; set(f: number): void }

/** A ring that fills clockwise from the top, f from 0 to 1. */
export function ring(o: { color: string; track?: string; width?: number; parent?: Element; className?: string }): RingHandle {
  const w = o.width ?? 6, r = 50 - w / 2, C = 2 * Math.PI * r;
  const host = document.createElement('div');
  host.innerHTML = `<svg class="p-ring${o.className ? ' ' + o.className : ''}" viewBox="0 0 100 100"><circle cx="50" cy="50" r="${r}" stroke="${o.track ?? 'rgba(0,0,0,.35)'}" stroke-width="${w}"/><circle class="a" cx="50" cy="50" r="${r}" stroke="${o.color}" stroke-width="${w}" stroke-dasharray="${C.toFixed(2)}" stroke-dashoffset="${C.toFixed(2)}" transform="rotate(-90 50 50)"/></svg>`;
  const s = host.firstElementChild as SVGSVGElement, a = s.querySelector('.a')!;
  o.parent?.appendChild(s);
  let last = '';
  return {
    el: s,
    set: (f) => {
      const v = (C * (1 - clamp(f, 0, 1))).toFixed(1);
      if (v !== last) { last = v; a.setAttribute('stroke-dashoffset', v); }
    },
  };
}

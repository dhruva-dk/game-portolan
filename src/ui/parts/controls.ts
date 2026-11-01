// Tabs, toggles, sliders and segmented choices. Each responds to a press, reports through the feedback hook, and
// animates its change.
import { clamp, el, esc } from './dom.ts';
import { feedback } from './feedback.ts';
import { press } from './press.ts';

export interface TabItem {
  id: string;
  label: string;
  icon?: string;
  badge?: number;
}

export interface TabsHandle {
  el: HTMLElement;
  set(id: string): void;
  value(): string;
}

/** A row of tabs with a sliding indicator. */
export function tabs(o: { items: TabItem[]; value: string; onChange: (id: string) => void; fill?: boolean; iconsOnly?: boolean; parent?: Element; className?: string }): TabsHandle {
  const t = el(`p-tabs${o.fill ? ' p-tabs--fill' : ''}${o.className ? ' ' + o.className : ''}`, o.parent);
  t.dataset.part = 'tabs';
  t.setAttribute('role', 'tablist');
  const ind = el('p-tabs__ind', t);
  let cur = o.value;
  const btns = o.items.map((it) => {
    const b = el('p-tab', t, `${it.icon ? `<span class="p-tab__icon">${it.icon}</span>` : ''}${o.iconsOnly ? '' : `<span>${esc(it.label)}</span>`}`);
    b.setAttribute('role', 'tab');
    b.setAttribute('aria-label', it.label);
    b.dataset.id = it.id;
    if (it.badge) el('p-badge', b, String(it.badge));
    press(b, () => { if (cur !== it.id) { set(it.id); o.onChange(it.id); } }, { sound: 'tab', haptic: 'selection' });
    return b;
  });
  const place = () => {
    const b = btns.find((x) => x.dataset.id === cur);
    if (!b || !b.offsetWidth) return;
    ind.style.width = `${b.offsetWidth}px`;
    ind.style.transform = `translateX(${b.offsetLeft}px)`;
  };
  const set = (id: string) => {
    cur = id;
    for (const b of btns) {
      b.classList.toggle('is-on', b.dataset.id === id);
      b.setAttribute('aria-selected', String(b.dataset.id === id));
    }
    place();
  };
  set(cur);
  // place the indicator once laid out, and again whenever the row changes size, without animating the first time
  ind.style.transition = 'none';
  requestAnimationFrame(() => { place(); requestAnimationFrame(() => { ind.style.transition = ''; }); });
  new ResizeObserver(place).observe(t);
  return { el: t, set, value: () => cur };
}

export interface ToggleHandle { el: HTMLElement; set(v: boolean): void }

/** An on/off switch. */
export function toggle(o: { value: boolean; label: string; onChange: (v: boolean) => void; parent?: Element }): ToggleHandle {
  const t = el('p-toggle', o.parent);
  t.dataset.part = `toggle:${o.label.toLowerCase()}`;
  t.setAttribute('role', 'switch');
  t.setAttribute('aria-label', o.label);
  let v = o.value;
  const set = (x: boolean) => { v = x; t.classList.toggle('is-on', x); t.setAttribute('aria-checked', String(x)); };
  set(v);
  press(t, () => { set(!v); o.onChange(v); }, { sound: 'toggle', haptic: 'selection' });
  return { el: t, set };
}

export interface SliderHandle { el: HTMLElement; set(v: number): void }

/** A slider from min to max; drags anywhere along it, and ticks a haptic each step. */
export function slider(o: { value: number; min?: number; max?: number; step?: number; label: string; format?: (v: number) => string; onChange: (v: number) => void; parent?: Element }): SliderHandle {
  const min = o.min ?? 0, max = o.max ?? 1, step = o.step ?? 0.05, fmt = o.format ?? ((v: number) => `${Math.round(((v - min) / (max - min)) * 100)}%`);
  const s = el('p-slider', o.parent, '<div class="p-slider__track"><i class="p-slider__fill"></i></div><div class="p-slider__knob"></div><div class="p-slider__val"></div>');
  s.dataset.part = `slider:${o.label.toLowerCase()}`;
  s.setAttribute('role', 'slider');
  s.setAttribute('aria-label', o.label);
  s.tabIndex = 0;
  const fill = s.querySelector<HTMLElement>('.p-slider__fill')!, knob = s.querySelector<HTMLElement>('.p-slider__knob')!, val = s.querySelector<HTMLElement>('.p-slider__val')!;
  let v = o.value;
  const set = (x: number) => {
    v = clamp(Math.round(x / step) * step, min, max);
    const f = (v - min) / (max - min);
    fill.style.transform = `scaleX(${f})`;
    knob.style.left = `${f * 100}%`;
    val.textContent = fmt(v);
    s.setAttribute('aria-valuenow', String(v));
  };
  set(v);
  let id = -1;
  const at = (x: number) => {
    const r = s.getBoundingClientRect(), before = v;
    set(min + clamp((x - r.left) / r.width, 0, 1) * (max - min));
    if (v !== before) { feedback('slide', 'selection', s.dataset.part); o.onChange(v); }
  };
  s.addEventListener('pointerdown', (e) => { id = e.pointerId; s.setPointerCapture(id); s.classList.add('is-down'); at(e.clientX); });
  s.addEventListener('pointermove', (e) => { if (e.pointerId === id) at(e.clientX); });
  const up = (e: PointerEvent) => { if (e.pointerId === id) { id = -1; s.classList.remove('is-down'); } };
  s.addEventListener('pointerup', up);
  s.addEventListener('pointercancel', up);
  s.addEventListener('keydown', (e) => {
    const d = e.key === 'ArrowRight' || e.key === 'ArrowUp' ? step : e.key === 'ArrowLeft' || e.key === 'ArrowDown' ? -step : 0;
    if (!d) return;
    e.preventDefault();
    set(v + d);
    feedback('slide', 'selection', s.dataset.part);
    o.onChange(v);
  });
  return { el: s, set };
}

export interface SegmentedHandle { el: HTMLElement; set(id: string): void }

/** One choice of a few, side by side. */
export function segmented(o: { items: { id: string; label: string }[]; value: string; label: string; onChange: (id: string) => void; parent?: Element }): SegmentedHandle {
  const s = el('p-seg', o.parent);
  s.dataset.part = `segmented:${o.label.toLowerCase()}`;
  s.setAttribute('role', 'radiogroup');
  s.setAttribute('aria-label', o.label);
  const opts = o.items.map((it) => {
    const b = el('p-seg__opt', s, esc(it.label));
    b.dataset.id = it.id;
    b.setAttribute('role', 'radio');
    press(b, () => { set(it.id); o.onChange(it.id); }, { sound: 'select', haptic: 'selection' });
    return b;
  });
  const set = (id: string) => { for (const b of opts) { b.classList.toggle('is-on', b.dataset.id === id); b.setAttribute('aria-checked', String(b.dataset.id === id)); } };
  set(o.value);
  return { el: s, set };
}

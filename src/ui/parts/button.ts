// Buttons: primary (wax), gold (the one big call to action), secondary (parchment) and dark (over the scene), in three
// sizes, plus the round icon button. Each is a face on a lip that a press pushes down, with the feedback hook's sound
// and haptic.
import { el, esc } from './dom.ts';
import type { UiHaptic, UiSound } from './feedback.ts';
import { press } from './press.ts';

export type ButtonKind = 'primary' | 'gold' | 'secondary' | 'dark';

export interface ButtonOptions {
  label?: string;
  /** SVG markup. */
  icon?: string;
  /** A small line under the label, for the big buttons. */
  sub?: string;
  kind?: ButtonKind;
  size?: 'sm' | 'md' | 'lg';
  wide?: boolean;
  disabled?: boolean;
  sound?: UiSound;
  haptic?: UiHaptic;
  /** A name for the capture log. */
  what?: string;
  onPress?: () => void;
  parent?: Element;
  className?: string;
}

export interface ButtonHandle {
  el: HTMLButtonElement;
  setLabel(v: string): void;
  setDisabled(v: boolean): void;
}

export function button(o: ButtonOptions): ButtonHandle {
  const kind = o.kind ?? 'primary', size = o.size ?? 'md';
  const b = el<HTMLButtonElement>(`p-btn p-btn--${kind}${size !== 'md' ? ` p-btn--${size}` : ''}${o.wide ? ' p-btn--wide' : ''}${o.className ? ' ' + o.className : ''}`, o.parent, '', 'button');
  b.type = 'button';
  b.dataset.part = o.what ?? `button:${(o.label ?? 'icon').toLowerCase()}`;
  const face = el('p-btn__face', b);
  if (o.icon) el('p-btn__icon', face, o.icon);
  const label = el('p-btn__label', face, o.label ? esc(o.label) : '', 'span');
  if (!o.label) label.remove();
  if (o.sub) { el('p-btn__sub', b, esc(o.sub)); b.classList.add('p-btn--sub'); }
  const setDisabled = (v: boolean) => b.setAttribute('aria-disabled', v ? 'true' : 'false');
  setDisabled(!!o.disabled);
  press(b, () => o.onPress?.(), { sound: o.sound ?? (kind === 'gold' ? 'play' : 'tap'), haptic: o.haptic ?? (kind === 'gold' ? 'medium' : 'light') });
  return { el: b, setLabel: (v) => { label.textContent = v; }, setDisabled };
}

export interface IconButtonOptions {
  icon: string;
  /** Read by screen readers, and named in the capture log. */
  label: string;
  kind?: 'paper' | 'dark' | 'wax';
  size?: 'sm' | 'md';
  badge?: number | '' | null;
  sound?: UiSound;
  haptic?: UiHaptic;
  on?: 'up' | 'down';
  onPress?: () => void;
  parent?: Element;
  className?: string;
}

export interface IconButtonHandle {
  el: HTMLButtonElement;
  setBadge(v: number | '' | null): void;
  setDisabled(v: boolean): void;
}

export function iconButton(o: IconButtonOptions): IconButtonHandle {
  const kind = o.kind ?? 'paper';
  const b = el<HTMLButtonElement>(`p-ibtn${kind !== 'paper' ? ` p-ibtn--${kind}` : ''}${o.size === 'sm' ? ' p-ibtn--sm' : ''}${o.className ? ' ' + o.className : ''}`, o.parent, '', 'button');
  b.type = 'button';
  b.setAttribute('aria-label', o.label);
  b.dataset.part = `icon:${o.label.toLowerCase()}`;
  el('p-ibtn__face', b, `<div class="p-ibtn__icon">${o.icon}</div>`);
  let badge: HTMLElement | null = null;
  const setBadge = (v: number | '' | null) => {
    if (v === null || v === 0) { badge?.remove(); badge = null; return; }
    if (!badge) badge = el('p-badge', b);
    badge.textContent = v === '' ? '' : String(v);
  };
  setBadge(o.badge ?? null);
  const setDisabled = (v: boolean) => b.setAttribute('aria-disabled', v ? 'true' : 'false');
  press(b, () => o.onPress?.(), { sound: o.sound ?? 'tap', haptic: o.haptic ?? 'light', on: o.on });
  return { el: b, setBadge, setDisabled };
}

export interface TileOptions {
  icon: string;
  label: string;
  badge?: number | null;
  onPress?: () => void;
  parent?: Element;
  className?: string;
}

/** A menu tile: a big glyph over its name, on dark glass, with a count of new things. */
export function tile(o: TileOptions): IconButtonHandle {
  const b = el<HTMLButtonElement>(`p-tile${o.className ? ' ' + o.className : ''}`, o.parent, '', 'button');
  b.type = 'button';
  b.dataset.part = `tile:${o.label.toLowerCase()}`;
  el('p-tile__face', b, `<div class="p-tile__icon">${o.icon}</div><div class="p-tile__label">${esc(o.label)}</div>`);
  let badge: HTMLElement | null = null;
  const setBadge = (v: number | '' | null) => {
    if (v === null || v === 0) { badge?.remove(); badge = null; return; }
    if (!badge) badge = el('p-badge', b);
    badge.textContent = v === '' ? '' : String(v);
  };
  setBadge(o.badge ?? null);
  const setDisabled = (v: boolean) => b.setAttribute('aria-disabled', v ? 'true' : 'false');
  press(b, () => o.onPress?.(), { sound: 'open', haptic: 'light' });
  return { el: b, setBadge, setDisabled };
}

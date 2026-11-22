// The kit's controls: a button (go, plain, danger, and the one way on), a
// choice of a few side by side (a segmented choice; wide, a tab strip), a chip
// that opens a list under it, and a value stepped down or up. Each 44 px to the
// touch; none answers a hover.

import { icon, type Icon } from './icons.ts';
import { el, pressed, type Kid } from './part.ts';

/** What a button is: the kit's blue, plain paper, the dangerous red, or the one way on. */
type Kind = 'go' | 'plain' | 'danger' | 'on';

/** How a button is drawn besides its label. */
interface ButtonLook {
  kind?: Kind;
  /** Shown unavailable, and deaf. */
  off?: boolean;
  /** As wide as what it is set in. */
  wide?: boolean;
  /** A pictogram before its label, or after it. */
  before?: Icon;
  after?: Icon;
}

/** A button labelled `label`: a tap on it calls `act`. */
export function button(label: Kid, act: () => void, look: ButtonLook = {}) {
  return pressed(
    el(
      'div',
      `k-btn ${look.kind ?? 'go'}${look.wide ? ' wide' : ''}`,
      look.before && icon(look.before, 20),
      label,
      look.after && icon(look.after, 20)
    ),
    act,
    look.off
  );
}

/** One of a choice: what it is called, and what it is shown as. */
interface Option<T extends string> {
  id: T;
  label: string;
}

/**
 * A choice of a few, side by side, `chosen` filled: a tap on another calls
 * `pick` with it. `wide`: a tab strip, across what it is set in.
 */
export function segmented<T extends string>(
  options: readonly Option<T>[],
  chosen: T,
  pick: (id: T) => void,
  wide = false
) {
  return el(
    'div',
    `k-seg${wide ? ' wide' : ''}`,
    ...options.map((o) =>
      pressed(el('div', o.id === chosen ? 'chosen' : '', o.label), () =>
        pick(o.id)
      )
    )
  );
}

/**
 * A chip showing `chosen` of `options`: a tap opens the list under it, a tap on
 * one of the list calls `pick` with it, a tap anywhere else on the page closes
 * it. `wide`: as wide as what it is set in.
 */
export function dropdown<T extends string>(
  options: readonly Option<T>[],
  chosen: T,
  pick: (id: T) => void,
  wide = false
) {
  const label = options.find((o) => o.id === chosen)?.label ?? '';
  const chip = el(
    'div',
    `k-drop${wide ? ' wide' : ''}`,
    label,
    icon('down', 18)
  );
  let open: HTMLElement[] = [];
  const close = () => {
    for (const o of open) o.remove();
    open = [];
  };
  return pressed(chip, () => {
    if (open.length) return close();
    const catcher = pressed(el('div', 'k-catch'), close);
    const menu = el(
      'div',
      'k-menu',
      ...options.map((o) =>
        pressed(el('div', o.id === chosen ? 'chosen' : '', o.label), () => {
          close();
          pick(o.id);
        })
      )
    );
    open = [catcher, menu];
    chip.closest('.office')?.append(catcher);
    chip.append(menu);
  });
}

/**
 * A value between two arrows: a tap on one calls `step` with -1 or 1. `least`
 * and `most` show the arrow that way unavailable.
 */
export function stepper(
  value: Kid,
  step: (by: -1 | 1) => void,
  ends: { least?: boolean; most?: boolean } = {}
) {
  return el(
    'div',
    'k-step',
    pressed(el('div', 'k-arrow', icon('back', 20)), () => step(-1), ends.least),
    el('div', 'k-value', value),
    pressed(el('div', 'k-arrow', icon('forward', 20)), () => step(1), ends.most)
  );
}

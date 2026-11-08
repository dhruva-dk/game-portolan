// The frame a page is built in: a backdrop over the live planet, the safe area, a header with a back
// button, and a body. Escape (or the browser's back key on a keyboard) leaves, the same as the back button.
import { el, header } from '../parts/index.ts';
import type { ScreenView } from '../shell.ts';

export interface PageOptions {
  title: string;
  sub?: string;
  onBack?: () => void;
  className?: string;
}

export interface Page extends ScreenView {
  safe: HTMLElement;
  head: HTMLElement;
  right: HTMLElement;
  body: HTMLElement;
}

export function page(o: PageOptions): Page {
  const root = el(`s-page${o.className ? ' ' + o.className : ''}`);
  el('s-backdrop s-backdrop--chart', root);
  const safe = el('pui-safe s-page__safe', root);
  const h = header({ title: o.title, sub: o.sub, onBack: o.onBack, parent: safe });
  const body = el('s-page__body', safe);
  const key = (e: KeyboardEvent) => { if (e.key === 'Escape' && o.onBack) { e.preventDefault(); o.onBack(); } };
  return {
    el: root, safe, head: h.el, right: h.right, body,
    enter: () => addEventListener('keydown', key),
    leave: () => removeEventListener('keydown', key),
  };
}

/** Chains extra enter and leave work onto a view. */
export function chain(v: ScreenView, enter?: () => void, leave?: () => void): void {
  const e0 = v.enter, l0 = v.leave;
  v.enter = () => { e0?.(); enter?.(); };
  v.leave = () => { l0?.(); leave?.(); };
}

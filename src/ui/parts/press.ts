// The one way anything in the interface becomes tappable: a press animation on touch-down (the .is-down class), and
// the feedback hook's sound and haptic when it acts. Menu parts act on release, so a drag that scrolls a list never
// fires them; HUD controls act on touch-down, for speed.
import { feedback, type UiHaptic, type UiSound } from './feedback.ts';

export interface PressOptions {
  sound?: UiSound;
  haptic?: UiHaptic;
  /** A name for the capture log. */
  what?: string;
  /** 'up' (default) acts on release inside; 'down' acts at once. */
  on?: 'up' | 'down';
  /** Fires again while held, for steppers. */
  repeat?: boolean;
}

/** Makes an element tappable. Returns a function that removes the handlers. */
export function press(e: HTMLElement, act: (ev: Event) => void, o: PressOptions = {}): () => void {
  const sound = o.sound ?? 'tap', haptic = o.haptic ?? 'light', what = o.what ?? (e.dataset.part || 'part');
  e.classList.add('p-pressable');
  if (!e.hasAttribute('tabindex') && e.tagName !== 'BUTTON') e.tabIndex = 0;
  if (!e.hasAttribute('role') && e.tagName !== 'BUTTON') e.setAttribute('role', 'button');
  let timer = 0;
  const disabled = () => e.getAttribute('aria-disabled') === 'true';
  const fireIt = (ev: Event) => {
    if (disabled()) {
      feedback('deny', 'error', what);
      e.classList.remove('is-denied');
      void e.offsetWidth;
      e.classList.add('is-denied');
      return;
    }
    feedback(sound, haptic, what);
    act(ev);
  };
  const down = (ev: PointerEvent) => {
    if (ev.button > 0) return;
    e.classList.add('is-down');
    if (o.on === 'down') {
      ev.stopPropagation();
      fireIt(ev);
    }
    if (o.repeat) {
      clearInterval(timer);
      timer = window.setTimeout(() => { timer = window.setInterval(() => fireIt(ev), 90); }, 380);
    }
  };
  const up = () => {
    e.classList.remove('is-down');
    clearTimeout(timer);
    clearInterval(timer);
  };
  const click = (ev: MouseEvent) => {
    if (o.on === 'down') return;
    fireIt(ev);
  };
  const key = (ev: KeyboardEvent) => {
    if (ev.key !== 'Enter' && ev.key !== ' ') return;
    ev.preventDefault();
    e.classList.add('is-down');
    setTimeout(() => e.classList.remove('is-down'), 110);
    fireIt(ev);
  };
  e.addEventListener('pointerdown', down);
  e.addEventListener('pointerup', up);
  e.addEventListener('pointercancel', up);
  e.addEventListener('pointerleave', up);
  e.addEventListener('click', click);
  e.addEventListener('keydown', key);
  return () => {
    e.removeEventListener('pointerdown', down);
    e.removeEventListener('pointerup', up);
    e.removeEventListener('pointercancel', up);
    e.removeEventListener('pointerleave', up);
    e.removeEventListener('click', click);
    e.removeEventListener('keydown', key);
  };
}

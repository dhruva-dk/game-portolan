// The interface's root: it hangs the parchment and the tokens on the page, keeps the layers in order (screens, the HUD,
// overlays, ceremonies, toasts, fliers), and moves between screens with an animation every time. The layer is
// transparent, so the game canvas behind it shows through (the lobby's scraps sit over her ship at anchor).
import { Toasts, applyTokens, effect, el, setFlyLayer, type Form } from './parts/index.ts';
import './screens/screens.css';

export interface ScreenView {
  el: HTMLElement;
  /** Called after the screen has been placed and laid out, before it animates in. */
  enter?(): void;
  /** Called as the screen leaves; it is removed after its exit animation. */
  leave?(): void;
}

/** How a screen arrives: pushed from the side (a menu), popped back, faded over, or zoomed (title to lobby). */
export type Transition = 'push' | 'pop' | 'fade' | 'zoom' | 'rise' | 'none';

export class Shell {
  readonly root: HTMLElement;
  readonly screens: HTMLElement;
  readonly hud: HTMLElement;
  readonly overlay: HTMLElement;
  readonly toasts: Toasts;
  form: Form = 'tablet';
  k = 1;
  private current: { id: string; view: ScreenView } | null = null;
  private readonly forced?: Form;
  private readonly resizers = new Set<() => void>();

  constructor(parent: HTMLElement, o: { form?: Form } = {}) {
    this.forced = o.form;
    this.root = el('pui', parent);
    this.screens = el('pui-screens', this.root);
    this.hud = el('pui-hud', this.root);
    this.overlay = el('pui-overlay', this.root);
    this.toasts = new Toasts(this.root);
    setFlyLayer(el('pui-fly', this.root));
    this.resize();
    addEventListener('resize', () => this.resize());
  }

  /** Re-reads the window: the form (tablet or phone) and the token scale. */
  resize(): void {
    const { form, k } = applyTokens(this.root, innerWidth, innerHeight, this.forced);
    this.form = form;
    this.k = k;
    for (const f of this.resizers) f();
  }

  /** Runs fn whenever the window changes size. */
  onResize(fn: () => void): () => void {
    this.resizers.add(fn);
    return () => this.resizers.delete(fn);
  }

  /** The screen showing now. */
  get screenId(): string | null {
    return this.current?.id ?? null;
  }

  /** Replaces the screen, animating the old one out and the new one in. */
  show(id: string, view: ScreenView, how: Transition = 'fade'): void {
    const old = this.current;
    this.current = { id, view };
    view.el.classList.add('pui-screen');
    view.el.dataset.screen = id;
    this.screens.appendChild(view.el);
    view.enter?.();
    if (how !== 'none') {
      view.el.classList.add(`pui-in-${how}`);
      view.el.addEventListener('animationend', (e) => { if (e.target === view.el) view.el.classList.remove(`pui-in-${how}`); }, { once: true });
    }
    if (old) {
      old.view.leave?.();
      old.view.el.classList.add('pui-leaving', `pui-out-${how}`);
      old.view.el.style.pointerEvents = 'none';
      setTimeout(() => old.view.el.remove(), how === 'none' ? 0 : 420);
    }
    effect(`screen:${id}`, how === 'pop' ? 'back' : how === 'none' ? 'none' : 'whoosh', 'none');
  }

  /** Clears the screen layer (for the match, when only the HUD shows). */
  hide(how: Transition = 'fade'): void {
    const old = this.current;
    this.current = null;
    if (!old) return;
    old.view.leave?.();
    old.view.el.classList.add('pui-leaving', `pui-out-${how}`);
    old.view.el.style.pointerEvents = 'none';
    setTimeout(() => old.view.el.remove(), 420);
    effect('screen:none', 'none', 'none');
  }
}

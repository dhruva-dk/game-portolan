// The interface's root: it hangs the tokens on the page. It is transparent and takes no touches; every screen is drawn on
// the chart above it.
import { applyTokens, el } from './parts/index.ts';

export class Shell {
  readonly root: HTMLElement;

  constructor(parent: HTMLElement) {
    this.root = el('pui', parent);
    this.resize();
    addEventListener('resize', () => this.resize());
  }

  /** Re-reads the window for the token scale. */
  private resize(): void {
    applyTokens(this.root, innerWidth, innerHeight);
  }
}

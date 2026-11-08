// The interface's root: it hangs the tokens on the page and holds what is still DOM over the chart (the tip card). It is
// transparent and takes no touches.
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

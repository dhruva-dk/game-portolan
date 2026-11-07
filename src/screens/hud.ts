// The HUD's disc, top right, as it stands until the HUD is drawn on it: the papyrus disc cut round, its rim frayed,
// nothing on it yet. It inks in as she comes to sea (laid on the chart and settling) and dries away when the match's
// screens leave it.
import { drawBaked, dryAlpha, ease, type ChartLayer, type Rect } from '../chart/index.ts';

const AT = { lay: 0.5, dry: 0.3 } as const;
const clamp = (x: number) => Math.min(1, Math.max(0, x));

export class HudDisc {
  #layer: ChartLayer | null = null;
  #born = -1;
  #leftAt = -1;
  #off: (() => void) | null = null;
  /** Called once the disc has gone. */
  onGone?: () => void;

  attach(layer: ChartLayer, now: number): void {
    this.#layer = layer;
    this.#born = now;
    this.#off = layer.addLive((g, t) => this.#frame(g, t));
  }

  leave(now: number): void {
    if (this.#leftAt < 0) this.#leftAt = now;
  }

  dispose(): void {
    this.#off?.();
    this.#off = null;
  }

  #frame(g: CanvasRenderingContext2D, now: number): Rect | void {
    const layer = this.#layer!, c = layer.layout.hud, d = layer.disc(c.r);
    const dry = this.#leftAt < 0 ? 0 : clamp((now - this.#leftAt) / 1000 / AT.dry);
    if (dry >= 1) {
      this.dispose();
      this.onGone?.();
      return;
    }
    // laid down: it comes in a little large and settles onto the chart as its ink takes
    const t = clamp((now - this.#born) / 1000 / AT.lay), k = 1 + 0.08 * (1 - ease.back(t));
    g.save();
    g.translate(c.x, c.y);
    g.scale(k, k);
    drawBaked(g, d, -c.r, -c.r, ease.out(t) * dryAlpha(dry));
    g.restore();
    const r = (c.r + d.pad) * 1.1;
    return { x: c.x - r, y: c.y - r, w: r * 2, h: r * 2 };
  }
}

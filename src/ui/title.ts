// WP26 the title: the planet turning slowly over a parchment laced with a portolan's rhumb lines while Portolan
// letters itself stroke by stroke in swash capitals on a ribbon cartouche, the gull wheeling overhead; a touch anywhere
// goes on to the harbour. Built in one layout pass of a few canvas sheets and one shader quad, inside the boot budget.
import * as THREE from 'three';
import type { InkText } from '../lettering/ink.ts';
import { drop, titleArt, type TitleArt } from '../render/harbourScene.ts';
import { Scrap } from './parchment.ts';
import { safeRect } from './safeArea.ts';
import { loadSettings, settings, uiSound } from './settings.ts';
import type { Screen, ScreenContext } from './shell.ts';

const BARE = { scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera() };
/** Seconds before the pen touches the page. */
const PEN_DOWN = 0.35;
let settingsRead = false;

export function title(ctx: ScreenContext): Screen {
  if (!settingsRead) { settingsRead = true; void loadSettings(); }
  const ui = new THREE.Group();
  let art: TitleArt | null = null, word: InkText | null = null, hint: InkText | null = null;
  let start: number | null = null, left = false;
  return {
    ...BARE,
    ui,
    layout(view) {
      drop(ui);
      const r = safeRect(view);
      const page = new Scrap(ctx.pipeline.style, { width: view.width, height: view.height, torn: [0, 0, 0, 0], age: 0.18 });
      page.position.set(view.width / 2, view.height / 2, 0);
      const R = Math.min(r.height * 0.34, r.width * 0.2), cx = r.x + r.width / 2, cy = r.y + r.height * 0.42;
      art = titleArt(view.width, view.height, r, cx, cy, R, view.dpr);
      ctx.pipeline.registerTexture('title', art.bytes);
      const rb = art.ribbon;
      word = ctx.lettering.text('Portolan', { size: rb.height * 0.74, align: 'center', valign: 'middle', swash: true });
      word.position.set(rb.x, rb.y, 0);
      word.renderOrder = 6;
      word.progress = 0;
      const hs = Math.max(15, r.height * 0.04);
      hint = ctx.lettering.text('Touch to set out', { size: hs, align: 'center', valign: 'middle', pigment: 'sepia' });
      hint.position.set(cx, Math.min(r.y + r.height - hs, rb.y + rb.height * 0.62 + Math.max(24, r.height * 0.07)), 0);
      hint.renderOrder = 6;
      hint.opacity = 0;
      ui.add(page, art.group, word, hint);
    },
    frame(f) {
      start ??= f.clock;
      const t = f.clock - start, still = settings().reducedMotion;
      art?.frame(f.clock, still);
      if (!word || !hint) return;
      word.progress = still ? 1 : (t - PEN_DOWN) / word.duration;
      const done = still || t > PEN_DOWN + word.duration;
      hint.opacity = done ? (still ? 0.85 : 0.6 + 0.3 * Math.sin((t - PEN_DOWN - word.duration) * 2.1)) : 0;
    },
    touch(t) {
      if (t.phase !== 'up' || left) return;
      left = true;
      uiSound('page');
      ctx.runtime.show('harbour');
    },
    dispose() {
      drop(ui);
      ctx.pipeline.registerTexture('title', 0);
    },
  };
}

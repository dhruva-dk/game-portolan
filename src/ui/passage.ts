// The way home from a match (LEAVE: ways.ts HOME, wayHome): plain parchment comes over the match with one mark on it,
// the compass rose turning slowly, and no words; it is held while the match is put away and the lobby made and drawn
// unseen under it, and lifts off the lobby settled, her ship at anchor and its pieces in place. Over every screen.
// Skip to the result comes under the same parchment (the orchestrator's ruling): held, the world not drawn under it, while
// the race runs on to its end, a line under the rose filling as it goes; then lifted off her result.
// What it covers of the world, the sound follows (main.ts: the bed fades under it).

import { INK, WASH, svg } from './ink';
import { rose } from './marks';
import { H, W, sheet } from './screens';
import { HOME, wayHome } from './ways';

/** Seconds the rose takes to turn once. */
const TURN = 16;
/** The rose's box in the page's own units (screens.ts W × H, scaled to fit the screen alike), and its radius in it. */
const BOX = 330, RADIUS = 150;
/** Skip's progress line under the rose, in the rose box's units: its width and its height. */
const LINE = { w: 220, h: 6 } as const;

/** Skip's hold: whether the race is over (the parchment may lift), how far it has run (0…1), and what is shown as it
 *  lifts (her result). */
export interface Running { over(): boolean; progress(): number; lifted(): void }

export function createPassage() {
  const s = sheet(true);
  s.root.style.zIndex = '3';
  // the rose in a box of its own, centred and scaled as the screens' page is, turned whole (no repaint of its marks)
  const box = document.createElement('div');
  box.style.cssText = `position:absolute;left:50%;top:50%;width:min(${((BOX / W) * 100).toFixed(2)}vw,${((BOX / H) * 100).toFixed(2)}vh);`
    + 'aspect-ratio:1;transform:translate(-50%,-50%)';
  box.innerHTML = svg(BOX, BOX, rose(BOX / 2, BOX / 2, RADIUS));
  const mark = box.firstElementChild;
  if (mark instanceof SVGSVGElement) {
    mark.setAttribute('width', '100%');
    mark.setAttribute('height', '100%');
    mark.style.animation = `passage-turn ${TURN}s linear infinite`;
  }
  // Skip's line, under the rose (not turned with it): an iron rule and a gold fill
  const line = document.createElement('div');
  line.style.cssText = 'position:absolute;left:0;right:0;top:104%;display:none';
  const lx = (BOX - LINE.w) / 2;
  line.innerHTML = svg(BOX, 2 * LINE.h, `<rect x="${lx}" y="${LINE.h / 2}" width="${LINE.w}" height="${LINE.h}" fill="none" stroke="${INK.iron}" stroke-width="1"/>`
    + `<rect class="fill" x="${lx}" y="${LINE.h / 2}" width="0" height="${LINE.h}" fill="${WASH.gold}"/>`);
  const fill = line.querySelector<SVGRectElement>('.fill');
  box.append(line);
  s.root.append(box);
  const style = document.createElement('style');
  style.textContent = '@keyframes passage-turn { to { transform: rotate(360deg) } }';
  document.head.appendChild(style);

  /** The way home under way (null: none), the change it makes once the match is covered, and Skip's hold (or none). */
  let way: ReturnType<typeof wayHome> | null = null, change: (() => void) | null = null, running: Running | null = null;

  return {
    /** Whether the way home is under way. */
    get going() {
      return way !== null;
    },
    /** How much of the world the parchment covers now, 0…1. */
    get covered() {
      return way?.covered(performance.now()) ?? 0;
    },
    /** Whether the world under it is not to be drawn: Skip's parchment, held. */
    get hiding() {
      return running !== null && way?.leg === 'hold';
    },
    /** Brings the parchment over the match; once it is covered, makes the change (`act`) under it. With `run` (Skip),
     *  it is held until the race is over, its line filling, and lifts off her result. */
    cover(act: () => void, run: Running | null = null) {
      running = run;
      way = wayHome(performance.now(), run ? run.over : undefined);
      change = act;
      line.style.display = run ? '' : 'none';
      fill?.setAttribute('width', '0');
      s.show(true, HOME.cover);
    },
    /** A frame just drawn (or, under Skip's parchment, gone undrawn): the way home moved on by it. */
    drawn() {
      if (running && fill) fill.setAttribute('width', (LINE.w * Math.min(1, Math.max(0, running.progress()))).toFixed(1));
      const leg = way?.drawn(performance.now());
      if (leg === 'hold') {
        change?.();
        change = null;
      } else if (leg === 'lift') {
        running?.lifted();
        s.show(false, HOME.lift);
      } else if (leg === 'home') {
        way = null;
        running = null;
      }
    },
  };
}

// The way home from a match (LEAVE: ways.ts HOME, wayHome): plain parchment comes over the match with one mark on it,
// the compass rose turning slowly, and no words; it is held while the match is put away and the lobby made and drawn
// unseen under it, and lifts off the lobby settled, her ship at anchor and its pieces in place. Over every screen.
// What it covers of the world, the sound follows (main.ts: the bed fades under it).

import { svg } from './ink';
import { rose } from './marks';
import { sheet } from './screens';
import { HOME, wayHome } from './ways';

/** Seconds the rose takes to turn once. */
const TURN = 16;
/** The rose's box in the page's own units (screens.ts W × H, scaled to fit the screen alike), and its radius in it. */
const BOX = 220, RADIUS = 100;

export function createPassage() {
  const s = sheet(true);
  s.root.style.zIndex = '3';
  // the rose in a box of its own, centred and scaled as the screens' page is, turned whole (no repaint of its marks)
  const box = document.createElement('div');
  box.style.cssText = `position:absolute;left:50%;top:50%;width:min(${(BOX / 9.56).toFixed(2)}vw,${(BOX / 4.4).toFixed(2)}vh);`
    + 'aspect-ratio:1;transform:translate(-50%,-50%)';
  box.innerHTML = svg(BOX, BOX, rose(BOX / 2, BOX / 2, RADIUS));
  const mark = box.firstElementChild;
  if (mark instanceof SVGSVGElement) {
    mark.setAttribute('width', '100%');
    mark.setAttribute('height', '100%');
    mark.style.animation = `passage-turn ${TURN}s linear infinite`;
  }
  s.root.append(box);
  const style = document.createElement('style');
  style.textContent = '@keyframes passage-turn { to { transform: rotate(360deg) } }';
  document.head.appendChild(style);

  /** The way home under way (null: none), and the change it makes once the match is covered. */
  let way: ReturnType<typeof wayHome> | null = null, change: (() => void) | null = null;

  return {
    /** Whether the way home is under way. */
    get going() {
      return way !== null;
    },
    /** How much of the world the parchment covers now, 0…1. */
    get covered() {
      return way?.covered(performance.now()) ?? 0;
    },
    /** Brings the parchment over the match; once it is covered, makes the change (`act`) under it. */
    cover(act: () => void) {
      way = wayHome(performance.now());
      change = act;
      s.show(true, HOME.cover);
    },
    /** A frame just drawn: the way home moved on by it. */
    drawn() {
      const leg = way?.drawn(performance.now());
      if (leg === 'hold') {
        change?.();
        change = null;
      } else if (leg === 'lift') s.show(false, HOME.lift);
      else if (leg === 'home') way = null;
    },
  };
}

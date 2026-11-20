// The world's cross-fade, PLAY's: when the world changes under the screens all at once (from her ship at anchor to the
// eye high over her berth), the last frame drawn before the change is held over the world and fades away (FADE) as the
// new one is drawn under it, so the one dissolves into the other and nothing is cut. Under every screen, so a screen
// fading in or out over it is seen whole. (Home from a match goes under the title instead: passage.ts.)

import { FADE } from './ways.ts';
import { fade, reflow, uiLayer } from './ui.ts';

export function createVeil() {
  const held = document.createElement('canvas');
  held.className = 'screen';
  held.style.cssText = 'width:100%;height:100%';
  held.hidden = true;
  uiLayer().prepend(held);
  /** The change waiting on the next frame drawn. */
  let then: (() => void) | null = null;
  return {
    /** Holds the next frame drawn, makes the change (`act`) under it, and fades it away. */
    cover(act: () => void) {
      then = act;
    },
    /** Whether a change waits on the next frame drawn. */
    get waiting() {
      return then !== null;
    },
    /** The frame drawn, the moment it is drawn (the world's canvas): held over the world while the change is made. */
    hold(picture: HTMLCanvasElement) {
      const act = then;
      if (!act) return;
      then = null;
      [held.width, held.height] = [picture.width, picture.height];
      held.getContext('2d')!.drawImage(picture, 0, 0);
      held.style.transition = 'none';
      held.style.opacity = '1';
      held.hidden = false;
      held.classList.remove('gone');
      act();
      // (laid out whole before it fades)
      reflow(held);
      fade(held, false, FADE + 80);
    },
  };
}

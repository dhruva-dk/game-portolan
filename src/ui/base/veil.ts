import { FADE } from './house.ts';
import { fade, reflow, uiLayer } from './ui.ts';

export function createVeil() {
  const held = document.createElement('canvas');
  held.className = 'screen';
  held.style.cssText = 'width:100%;height:100%';
  held.hidden = true;
  uiLayer().prepend(held);
  let then: (() => void) | null = null;
  return {
    cover(act: () => void) {
      then = act;
    },
    get waiting() {
      return then !== null;
    },
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
      reflow(held);
      fade(held, false, FADE + 80);
    },
  };
}

// The stick as drawn on the UI's layer: a ring where the thumb came down and a knob under it, in ink; nothing when it
// is let go, or held by the keys (which have no place on the screen).

import type { Hands } from '../player.ts';
import { INK, PAPER, alpha } from './ink.ts';
import { STICK } from './input.ts';
import { show } from './ui.ts';

/** The stick's line, iron a little faint, and its knob's paper, fainter. */
const LINE = alpha(INK.iron, 0.7), KNOB_FILL = alpha(PAPER, 0.3);
const KNOB = 22;

/** The stick drawn on `layer`, under every other piece of it. */
export function createStick(layer: HTMLElement) {
  const ring = document.createElement('div');
  ring.style.cssText = `position:absolute;left:0;top:0;width:${2 * STICK}px;height:${2 * STICK}px;border:2px solid ${LINE};
    border-radius:50%;box-sizing:border-box;scale:var(--k)`;
  ring.hidden = true;
  const knob = document.createElement('div');
  knob.style.cssText = `position:absolute;left:${STICK - KNOB}px;top:${STICK - KNOB}px;width:${2 * KNOB}px;height:${2 * KNOB}px;
    border:2px solid ${LINE};border-radius:50%;box-sizing:border-box;background:${KNOB_FILL}`;
  ring.appendChild(knob);
  layer.prepend(ring);

  return (stick: Hands['stick']) => {
    show(ring, !!stick?.centre);
    if (!stick?.centre) return;
    // `translate`, not `transform`: the UI's size (`scale`) applies after `translate` but before `transform`, and would
    // carry her thumb's place off with it
    ring.style.translate = `${stick.centre[0] - STICK}px ${stick.centre[1] - STICK}px`;
    knob.style.transform = `translate(${stick.x * STICK}px, ${-stick.y * STICK}px)`;
  };
}

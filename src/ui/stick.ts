// The stick as drawn on the UI's layer: a ring where the thumb came down and a knob under it, in ink; nothing when it
// is let go, or held by the keys (which have no place on the screen).

import type { Hands } from '../player';
import { STICK } from './input';

const INK = 'rgba(58, 38, 20, 0.7)';
const KNOB = 22;

/** The stick drawn on `layer`, under every other piece of it. */
export function createStick(layer: HTMLElement) {
  const ring = document.createElement('div');
  ring.style.cssText = `position:absolute;left:0;top:0;width:${2 * STICK}px;height:${2 * STICK}px;border:2px solid ${INK};
    border-radius:50%;box-sizing:border-box;display:none;scale:var(--k, 1)`;
  const knob = document.createElement('div');
  knob.style.cssText = `position:absolute;left:${STICK - KNOB}px;top:${STICK - KNOB}px;width:${2 * KNOB}px;height:${2 * KNOB}px;
    border:2px solid ${INK};border-radius:50%;box-sizing:border-box;background:rgba(232, 214, 178, 0.3)`;
  ring.appendChild(knob);
  layer.prepend(ring);

  return (stick: Hands['stick']) => {
    if (!stick?.centre) {
      ring.style.display = 'none';
      return;
    }
    ring.style.display = 'block';
    ring.style.transform = `translate(${stick.centre[0] - STICK}px, ${stick.centre[1] - STICK}px)`;
    knob.style.transform = `translate(${stick.x * STICK}px, ${-stick.y * STICK}px)`;
  };
}

// The stick as drawn: a ring where the thumb came down and a knob under it, in ink; nothing when it is let go. Plain
// for now, until the chart's hand draws it.

import { STICK, type Hands } from './input';

const INK = 'rgba(58, 38, 20, 0.7)';
const KNOB = 22;

export function createStickView() {
  const ring = document.createElement('div');
  ring.style.cssText = `position:fixed;left:0;top:0;width:${2 * STICK}px;height:${2 * STICK}px;border:2px solid ${INK};
    border-radius:50%;box-sizing:border-box;pointer-events:none;display:none`;
  const knob = document.createElement('div');
  knob.style.cssText = `position:absolute;left:${STICK - KNOB}px;top:${STICK - KNOB}px;width:${2 * KNOB}px;height:${2 * KNOB}px;
    border:2px solid ${INK};border-radius:50%;box-sizing:border-box;background:rgba(232, 214, 178, 0.3)`;
  ring.appendChild(knob);
  document.body.appendChild(ring);

  return (stick: Hands['stick']) => {
    // the keyboard's stick has no place on the screen
    if (!stick?.centre) {
      ring.style.display = 'none';
      return;
    }
    ring.style.display = 'block';
    ring.style.transform = `translate(${stick.centre[0] - STICK}px, ${stick.centre[1] - STICK}px)`;
    knob.style.transform = `translate(${stick.x * STICK}px, ${-stick.y * STICK}px)`;
  };
}

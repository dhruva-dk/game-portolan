import type { Hands } from '../player.ts';
import { INK, PAPER, alpha } from './ink.ts';
import { STICK } from './input.ts';
import { show } from './ui.ts';

const LINE = alpha(INK.iron, 0.7),
  KNOB_FILL = alpha(PAPER, 0.3);
const KNOB = 22;

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
    show(ring, !!stick?.center);
    if (!stick?.center) return;
    ring.style.translate = `${stick.center[0] - STICK}px ${stick.center[1] - STICK}px`;
    knob.style.transform = `translate(${stick.x * STICK}px, ${-stick.y * STICK}px)`;
  };
}

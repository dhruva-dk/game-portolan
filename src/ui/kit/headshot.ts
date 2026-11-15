// Headshot: a gull's portrait (ui/gull.ts) at 40, 96 or 240, redrawn only when what it shows changes.

import type { Face } from '../../office';
import { headshot as draw, type FaceSize } from '../gull';
import { make, type Part } from './part';

/** A headshot `size` across. */
export function headshot(size: FaceSize): Part<Face> {
  const el = make('div', 'k-face');
  Object.assign(el.style, { width: `${size}px`, height: `${size}px` });
  let last = '';
  return {
    el,
    set(face) {
      const key = `${face.seed}.${face.role}.${face.age}.${face.colours?.first}.${face.colours?.second}.${face.emblem}`;
      if (key === last) return;
      last = key;
      el.innerHTML = draw(face, size);
    },
  };
}

// The round frame a person of the office is shown in: the gull's bust (gull.ts,
// which alone knows how he is drawn) in his team's jacket, on the strip's navy,
// inked round.

import { bust, type Jacket } from '../gull.ts';
import { el } from './part.ts';

/** The gull in `jacket`, in a round frame `size` px across. */
export function portrait(jacket: Jacket, size: number) {
  const round = el('div', 'k-face', bust(jacket, size));
  round.style.width = round.style.height = `${size}px`;
  return round;
}

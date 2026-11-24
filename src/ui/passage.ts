import type { Title } from './screens.ts';
import { HOME, wayHome } from './ways.ts';

export function createPassage(title: Title) {
  let way: ReturnType<typeof wayHome> | null = null,
    change: (() => void) | null = null;

  return {
    get going() {
      return way !== null;
    },
    get covered() {
      return way?.covered(performance.now()) ?? 0;
    },
    cover(act: () => void) {
      way = wayHome(performance.now());
      change = act;
      title.swing();
      title.show(true, HOME.cover);
    },
    drawn() {
      if (way?.leg !== 'cover') return;
      if (way.drawn(performance.now()) === 'hold') {
        change?.();
        change = null;
      }
    },
  };
}

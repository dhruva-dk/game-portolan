// The chase camera's shot for the match's end (play/chase.ts takes it): on a win, drawn back and circling her (0117
// app.ts victory: 0.22 rad/s, 9 m on its 36 m boom, eased in at 1.5/s).

import { BOOM, type Shot } from './chase';

/** The win (0117 app.ts): the boom drawn back by a quarter (9 m on 36) and turning about her, rad/s, eased in at EASE/s. */
const WIN = { back: BOOM * (9 / 36), turn: 0.22, ease: 1.5 } as const;

export function createShots() {
  /** How far drawn back for a win, and its turn about her. */
  let pull = 0, spun = 0;
  return {
    /** A new match. */
    reset() {
      pull = spun = 0;
    },
    /** The shot for a frame of dt seconds: drawn back and circling her if `circle` (the win). */
    take(circle: boolean, dt: number): Shot {
      pull += ((circle ? 1 : 0) - pull) * (1 - Math.exp(-dt * WIN.ease));
      spun += dt * WIN.turn * pull;
      return { boom: BOOM + WIN.back * pull, spin: spun };
    },
  };
}

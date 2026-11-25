import type { CareerState } from '../career/state.ts';
import { newCareerView } from '../career/views/new-career.ts';
import type { Framing } from '../play/anchorage.ts';
import { PLAIN, lookOf } from '../play/colors.ts';
import { rolled } from '../world/seeds.ts';
import { uiLayer } from '../ui/base/ui.ts';
import { createNewCareer } from '../ui/lobby/new-career.ts';
import type { NewCareerPort } from '../ui/lobby/port.ts';
import { anchorage } from './ashore.ts';
import { painter } from './painter.ts';
import { begun, type Founded } from './launch.ts';
import type { Stage } from './debug.ts';

const BESIDE: Framing = { center: [0.34, -0.04], size: 0.66 };
export async function founding(
  s: Stage,
  existing: CareerState | null,
  o: { ready(): void; started(founded: Founded): void; closed(): void }
) {
  const { game, input } = await anchorage(s, false);
  game.paint(PLAIN);
  game.stage({ framing: BESIDE });
  uiLayer();
  const repaint = painter((look) => game.paint(look), PLAIN);
  const port: NewCareerPort = {
    start: (options) => o.started(begun(options)),
    close: () => o.closed(),
    scene: {
      wear(livery, emblem) {
        repaint(
          livery === null
            ? { ...PLAIN, emblem: emblem ?? PLAIN.emblem }
            : lookOf({ ...livery, emblem: emblem ?? undefined })
        );
      },
    },
  };
  const screen = createNewCareer(port);
  const seed = rolled(Math.random),
    existed = existing !== null;
  void s.ready.then(() => {
    o.ready();
    screen.show((form) =>
      newCareerView(form, { rolled: seed, existing: existed })
    );
  });
  void s.draw((dt) => {
    game.step(dt, input.read());
    return game.snapshot();
  });
}

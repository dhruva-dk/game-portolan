import type { CareerState } from '../career/state.ts';
import { newCareerView } from '../career/views/new-career.ts';
import type { Framing } from '../play/anchorage.ts';
import { PLAIN, lookOf } from '../play/colors.ts';
import { rolled } from '../world/seeds.ts';
import { createAudio } from '../audio/audio.ts';
import type { Hearing } from '../audio/listen.ts';
import { onBeats } from '../ui/base/beat.ts';
import { onPressed } from '../ui/base/touch.ts';
import { uiLayer, view } from '../ui/base/ui.ts';
import { createNewCareer } from '../ui/lobby/new-career.ts';
import type { NewCareerPort } from '../ui/lobby/port.ts';
import { anchorage } from './ashore.ts';
import { painter } from './painter.ts';
import { deviceStore, keptSettings } from './kept.ts';
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
  const audio = createAudio(s.world.planet.height),
    sound = keptSettings(deviceStore()).sound;
  const hearing: Hearing = {
    scene: game.snapshot(),
    status: Object.assign({}, game.status(), game.kit()),
    screen: 'lobby',
    map: false,
  };
  onPressed(uiLayer(), () => audio.tap(hearing.screen));
  onBeats(uiLayer(), (b) => audio.cue(b));
  audio.level(sound);
  void s.draw((dt) => {
    game.step(dt, input.read());
    hearing.scene = game.snapshot();
    hearing.status = Object.assign(
      hearing.status,
      game.status(view.w, view.h),
      game.kit()
    );
    audio.update(hearing, sound, dt);
    return hearing.scene;
  });
}

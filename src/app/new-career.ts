import { apply, newCareer, type CareerOptions } from '../career/apply.ts';
import { YOURS, type CareerState } from '../career/state.ts';
import { newCareerView } from '../career/views/new-career.ts';
import type { Framing } from '../play/anchorage.ts';
import { PLAIN, lookOf } from '../play/colors.ts';
import type { Look } from '../render/snapshot.ts';
import type { Vec3 } from '../world/sphere.ts';
import { rolled } from '../world/seeds.ts';
import { MOTION } from '../ui/base/house.ts';
import { uiLayer } from '../ui/base/ui.ts';
import { createNewCareer } from '../ui/lobby/new-career.ts';
import type { NewCareerPort } from '../ui/lobby/port.ts';
import { anchorage } from './ashore.ts';
import type { Stage } from './debug.ts';

const BESIDE: Framing = { center: [0.34, -0.04], size: 0.66 };
const PAPER_LIFT: Vec3 = [0.86, 0.8, 0.68];

const mix = (a: Vec3, b: Vec3, t: number): Vec3 => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];

const eased = (t: number) => 1 - (1 - t) ** 3;

function painter(paint: (look: Look) => void) {
  let shown: Look = PLAIN,
    from: Look = PLAIN,
    to: Look = PLAIN,
    began = 0,
    frame = 0;
  const step = (now: number) => {
    const t = Math.min(1, (now - began) / MOTION.repaint.ms),
      e = eased(t),
      lift = Math.sin(Math.PI * t) * MOTION.repaint.lift;
    shown = {
      paint: mix(mix(from.paint, to.paint, e), PAPER_LIFT, lift),
      sail: mix(mix(from.sail, to.sail, e), PAPER_LIFT, lift * 0.5),
      pattern: t < 0.5 ? from.pattern : to.pattern,
    };
    paint(shown);
    if (t < 1) frame = requestAnimationFrame(step);
  };
  return (look: Look) => {
    cancelAnimationFrame(frame);
    from = shown;
    to = look;
    began = performance.now();
    frame = requestAnimationFrame(step);
  };
}

export type Founded = { state: CareerState; options: CareerOptions };

export async function founding(
  s: Stage,
  existing: CareerState | null,
  o: { ready(): void; started(founded: Founded): void; closed(): void }
) {
  const { game, input } = await anchorage(s, false);
  game.paint(PLAIN);
  game.stage({ framing: BESIDE });
  uiLayer();
  const repaint = painter((look) => game.paint(look));
  const port: NewCareerPort = {
    start(options) {
      const created = newCareer(options),
        raced = apply(created, { type: 'StartRace', team: YOURS });
      if (!raced.ok) throw new Error(`StartRace refused (${raced.reason})`);
      o.started({ state: raced.state, options });
    },
    close: () => o.closed(),
    scene: {
      wear(livery) {
        repaint(livery === null ? PLAIN : lookOf(livery));
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

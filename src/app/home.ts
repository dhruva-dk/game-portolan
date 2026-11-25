import { createAudio } from '../audio/audio.ts';
import { YOURS, type CareerState } from '../career/state.ts';
import type { Snapshot } from '../render/snapshot.ts';
import { MOTION } from '../ui/base/house.ts';
import { createLoading } from '../ui/base/loading.ts';
import { seedOf } from '../world/seeds.ts';
import { anchorage, ashore, type Crew } from './ashore.ts';
import type { Setup, Stage } from './debug.ts';
import { deviceStore, keptSettings } from './kept.ts';
import { launchOf, recordOf, type Founded } from './launch.ts';
import { founding } from './new-career.ts';
import {
  indexedStore,
  loadCareer,
  saveQueue,
  sendAndSave,
  type SaveQueue,
} from './save.ts';
import { voyage } from './voyage.ts';

const RETRY = { first: 500, most: 8000 } as const;

const wait = (ms: number) =>
  new Promise<void>((go) => window.setTimeout(go, ms));

export async function home(
  release: Setup,
  stage: (setup: Setup) => Promise<Stage>
) {
  const loading = createLoading();
  loading.show(true, true);
  const store = indexedStore();
  const queue: SaveQueue = saveQueue(store, {
    retry: (attempt) =>
      wait(Math.min(RETRY.most, RETRY.first * 2 ** (attempt - 1))),
    failing: (on) => loading.refused(on),
  });
  const launch = launchOf(await loadCareer(store));
  const s = await stage({
    ...release,
    seed: seedOf(launch.planet),
    name: launch.planet,
  });

  let next: (dt: number) => Snapshot | null = () => null,
    drawn: (canvas: HTMLCanvasElement) => void = () => undefined;
  const steered: Stage = {
    ...s,
    async draw(given) {
      next = given;
    },
  };
  void s.draw(
    (dt) => next(dt),
    (canvas) => drawn(canvas)
  );

  const reload = async (saved: Promise<void>) => {
    loading.show(true);
    await Promise.all([saved, queue.settled(), wait(MOTION.loading.fade)]);
    location.replace(location.href);
  };
  const founded = (f: Founded) => void reload(queue.save(f.before, f.state));

  const sail = async (crew: Crew, start: CareerState, casting: boolean) => {
    let state = start;
    const v = await voyage(s, crew, state, {
      casting,
      seen(id) {
        const { applied } = sendAndSave(queue, state, {
          type: 'MarkSeen',
          team: YOURS,
          id,
        });
        if (applied.ok) state = applied.state;
        return state.seen;
      },
      ended({ result, forfeited, settle }) {
        const { saved } = sendAndSave(
          queue,
          state,
          recordOf(result, forfeited)
        );
        void settle().then(() => reload(saved));
      },
    });
    next = v.next;
    drawn = v.drawn;
  };

  if (launch.kind === 'new') {
    await founding(steered, null, {
      ready: () => loading.show(false),
      started: founded,
      closed: () => undefined,
    });
    return;
  }

  if (launch.kind === 'race') {
    const device = deviceStore();
    const crew = await anchorage(s, false, () => keptSettings(device));
    const audio = createAudio(s.world.planet.height);
    audio.level(keptSettings(device).sound);
    await sail({ ...crew, audio }, launch.state, false);
    void s.ready.then(() => loading.show(false));
    return;
  }

  const shore = await ashore(steered, launch.state, {
    queue,
    ready: () => loading.show(false),
    founded,
    sailed(state) {
      void sail(shore.leave(), state, true);
    },
  });
}

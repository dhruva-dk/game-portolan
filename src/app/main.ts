import { WebGPUCoordinateSystem, WebGPURenderer } from 'three/webgpu';
import type { Setup, Stage } from './debug.ts';
import { SEED, createWorld } from '../world/environment.ts';
import { createFrame } from '../render/frame.ts';
import { loaded } from '../render/load.ts';
import { createMeter } from './meter.ts';
import { SETUP } from '../sim/engine.ts';
import { rigOf } from './race.ts';
import type { Snapshot } from '../render/snapshot.ts';
import { createLoading } from '../ui/base/loading.ts';
import { onResize, uiLayer, view } from '../ui/base/ui.ts';
import { seedOf } from '../world/seeds.ts';
import { MEAN, SWING } from '../world/weather.ts';

const DEBUG = new URLSearchParams(location.search).has('debug');

const NAME = String(SEED);

const RELEASE: Setup = {
  seed: seedOf(NAME),
  name: NAME,
  mean: MEAN,
  swing: SWING,
  hours: 16.3,
  drawing: {
    sea: 'water',
    fleet: SETUP.most,
    lod: null,
    cloth: true,
    bolt: false,
  },
  meter: false,
  hold: null,
  gun: 'cannon',
};

loaded('script');

const meterEl = document.getElementById('meter')!;
const say = (text: string) => {
  meterEl.hidden = false;
  meterEl.textContent = text;
};

async function stage(setup: Setup): Promise<Stage> {
  if (!navigator.gpu) {
    say('no WebGPU');
    throw new Error('WebGPU unavailable');
  }
  const renderer = new WebGPURenderer({
    antialias: false,
    trackTimestamp: true,
  });
  document.body.appendChild(renderer.domElement);
  await renderer.init();
  if (renderer.coordinateSystem !== WebGPUCoordinateSystem) {
    say('no WebGPU');
    throw new Error('WebGPU unavailable: three fell back to WebGL');
  }
  loaded('gpu');

  const world = createWorld(setup.seed, setup.mean, setup.swing, setup.hours);
  loaded('world');
  const frame = createFrame(renderer, world, setup.drawing);
  loaded('frame');
  const meter = createMeter(renderer, meterEl, setup.meter);
  meter.show(setup.meter);

  return {
    world,
    name: setup.name,
    start: world.planet.start,
    canvas: renderer.domElement,
    anchors: frame.anchors,
    ready: frame.ready,
    stats: (on) => meter.show(setup.meter || on),
    rig: rigOf(setup, world),
    gun: setup.gun,
    async draw(
      next: (dt: number) => Snapshot | null,
      drawn?: (canvas: HTMLCanvasElement) => void
    ) {
      console.info(`ground baked in ${(await frame.ready).toFixed(0)} ms`);
      uiLayer();
      const fit = () => frame.resize(view.w, view.h);
      fit();
      onResize(fit);
      let last = performance.now(),
        first = true;
      renderer.setAnimationLoop(() => {
        const now = performance.now();
        const dt = Math.min((now - last) / 1000, 0.1);
        last = now;
        const snapshot = next(dt);
        if (!snapshot) return;
        const begun = performance.now();
        frame.render(snapshot, dt);
        const rendered = performance.now() - begun;
        drawn?.(renderer.domElement);
        meter.sample(performance.now() - now, rendered);
        if (first) loaded('first frame');
        first = false;
      });
    },
  };
}

if (DEBUG) {
  const cover = createLoading();
  cover.show(true, true);
  await new Promise((go) => {
    requestAnimationFrame(() => setTimeout(go));
    setTimeout(go, 250);
  });
  loaded('cover shown');
  const { scenario } = await import('./debug.ts');
  await scenario(RELEASE, stage, cover);
} else {
  const { home } = await import('./home.ts');
  await home(RELEASE, stage);
}

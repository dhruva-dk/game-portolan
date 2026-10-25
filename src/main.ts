// Boot, the composition root: the one canvas every frame is drawn on, the ink pipeline with the style's generated
// textures, the lettering, the game runtime and its test hooks; then the world from its worker and any match saved
// when the app last went to the background. The title is up from the first frame and the world arrives while it
// letters itself in.
import { App } from '@capacitor/app';
import { Game } from './app/game.ts';
import { installHooks } from './app/hooks.ts';
import { loadCareer, loadMatch } from './app/save.ts';
import type { WorldMessage } from './app/worldWorker.ts';
import { Lettering } from './lettering/ink.ts';
import { Pipeline } from './render/pipeline.ts';
import { setChartPage } from './ui/harbour.ts';

// WP27: the career chart in the harbour ledger, loaded off the boot path.
void import('./ui/careerChart.ts').then((m) => setChartPage(m.careerChartPage));

// WP26 index.html made the canvas and its context while the modules loaded (the GPU wakes in parallel)
const canvas = (document.getElementById('ink') as HTMLCanvasElement | null) ?? document.body.appendChild(document.createElement('canvas'));
const pipeline = new Pipeline(canvas);
const lettering = new Lettering(pipeline.style, devicePixelRatio, (bytes) => pipeline.registerTexture('lettering', bytes));
const game = new Game(canvas, pipeline, lettering);
installHooks(game);

// The app's life: on iOS from the native app events, in a browser from the page's visibility.
void App.addListener('pause', () => void game.background());
void App.addListener('resume', () => void game.foreground());

function loadWorld(): Promise<WorldMessage> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./app/worldWorker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (e: MessageEvent<WorldMessage>) => {
      resolve(e.data);
      worker.terminate();
    };
    worker.onerror = (e) => reject(new Error(`world worker: ${e.message}`));
  });
}

const [world, saved, career] = await Promise.all([loadWorld(), loadMatch(), loadCareer()]);
game.arrive(world, saved, career);

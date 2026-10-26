import { App } from '@capacitor/app';
import { Game } from './app/game.ts';
import { installHooks } from './app/hooks.ts';
import { loadCareer, loadMatch } from './app/save.ts';
import type { WorldMessage } from './app/worldWorker.ts';
import { Lettering } from './lettering/ink.ts';
import { Pipeline } from './render/pipeline.ts';
import { setChartPage } from './ui/harbour.ts';

void import('./ui/careerChart.ts').then((m) => setChartPage(m.careerChartPage));

const canvas = (document.getElementById('ink') as HTMLCanvasElement | null) ?? document.body.appendChild(document.createElement('canvas'));
const pipeline = new Pipeline(canvas);
const lettering = new Lettering(pipeline.style, devicePixelRatio, (bytes) => pipeline.registerTexture('lettering', bytes));
const game = new Game(canvas, pipeline, lettering);
installHooks(game);

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

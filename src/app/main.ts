// The new app's entry: the canvas and interface layer from the page, the app, and the test hook.
import { App } from './app.ts';
import { installHook } from './hook.ts';

const q = new URLSearchParams(location.search);
const canvas = document.getElementById('view') as HTMLCanvasElement;
const overlay = document.getElementById('ui') as HTMLElement;
const app = new App(canvas, overlay, { capture: q.has('capture') });
installHook(app);
app.start();

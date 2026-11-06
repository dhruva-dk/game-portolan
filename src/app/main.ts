// The new app's entry: the canvas and interface layer from the page, the app, and the test hook.
import { Capacitor } from '@capacitor/core';
import { App } from './app.ts';
import { installHook } from './hook.ts';

const q = new URLSearchParams(location.search);
const canvas = document.getElementById('view') as HTMLCanvasElement;
const overlay = document.getElementById('ui') as HTMLElement;
// the native app has no query: VITE_AUTOPLAY=1 at build time stands in for ?autoplay
const app = new App(canvas, overlay, {
  capture: q.has('capture'), perfLog: q.has('perflog') || Capacitor.isNativePlatform(),
  autoplay: q.has('autoplay') || import.meta.env.VITE_AUTOPLAY === '1',
});
installHook(app);
app.start();

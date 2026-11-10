// The new app's entry: the canvas and interface layer from the page, the app, and the test hook.
import { Capacitor } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';
import { BACKUP_KEY, SAVE_KEY } from '../career/save.ts';
import { openDurable } from './durable.ts';
import { SETTINGS_KEY } from './settings.ts';
import { TIPS_KEY } from './tips.ts';
import { App } from './app.ts';
import { installHook } from './hook.ts';
import { Resolution } from '../render/gpu/resolution.ts';

// the native app's saves are read before anything asks for them; a store that will not open leaves local storage, not a blank screen
if (Capacitor.isNativePlatform()) {
  await openDurable(Preferences, localStorage, [SAVE_KEY, BACKUP_KEY, SETTINGS_KEY, TIPS_KEY]).catch((e) => console.error('saves', e));
}

const q = new URLSearchParams(location.search);
const canvas = document.getElementById('view') as HTMLCanvasElement;
const overlay = document.getElementById('ui') as HTMLElement;
// the native app has no query: VITE_AUTOPLAY=1 and VITE_FIXTURE=fight at build time stand in for ?autoplay and ?fight
if (import.meta.env.VITE_RELEASE !== '1' && import.meta.env.VITE_FIXED_SCALE === '1') Resolution.held = true;
const app = new App(canvas, overlay, {
  frameRate: import.meta.env.VITE_RELEASE === '1' ? 30
    : import.meta.env.VITE_RENDER_FPS === 'uncapped' ? null
    : import.meta.env.VITE_RENDER_FPS === '40' ? 40 : 30,
  capture: q.has('capture'), perfLog: q.has('perflog') || (Capacitor.isNativePlatform() && import.meta.env.VITE_RELEASE !== '1'),
  autoplay: q.has('autoplay') || import.meta.env.VITE_AUTOPLAY === '1',
  fight: q.has('fight') || import.meta.env.VITE_FIXTURE === 'fight',
});
// (a release has no test hook: the comparison is settled at build time, and the hook goes with it)
if (import.meta.env.VITE_RELEASE !== '1') installHook(app);
app.start();

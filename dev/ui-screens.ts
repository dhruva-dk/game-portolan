// Mounts one screen (or the parts gallery) at the window's size, over a stand-in for the live planet, with the
// fixtures as its data. Its buttons navigate the way the game will.
import { Shell } from '../src/ui/shell.ts';
import { applyParchment, el, setChartPainter } from '../src/ui/parts/index.ts';
import { Parchment } from '../src/render/paper/parchment.ts';
import { fxAbilities, fxCareer, fxLocker, fxRank, fxRivals } from '../src/ui/fixtures.ts';
import { DEFAULT_SETTINGS } from '../src/ui/model.ts';
import { abilitiesScreen, careerScreen, lockerScreen, rankScreen, rivalsScreen, settingsScreen } from '../src/ui/screens/menus.ts';
import { warmChart } from '../src/ui/screens/chart.ts';
import { partsGallery } from './ui-parts.ts';

/** The two designed devices, as tools/harness.ts has them: CSS size and safe areas. */
export const DEVICES = {
  ipad: { label: 'iPad 13"', width: 1376, height: 1032, safe: { top: 0, right: 0, bottom: 25, left: 0 } },
  iphone: { label: 'iPhone Pro Max', width: 956, height: 440, safe: { top: 0, right: 62, bottom: 20, left: 62 } },
} as const;
export type DeviceName = keyof typeof DEVICES;

export const SCREENS = ['parts', 'abilities', 'locker', 'rivals', 'career', 'rank', 'settings'];

const devStyle = `
  .dev-backdrop { position: fixed; inset: 0; overflow: hidden; background: linear-gradient(180deg, #6d8fb3 0%, #b9c7cf 38%, #e8d2a6 47%, #2f5d72 47.4%, #1f4256 70%, #10283a 100%); }
  .dev-backdrop::before { content: ''; position: absolute; left: -20%; right: -20%; top: 46%; height: 120%; border-radius: 50% 50% 0 0 / 14% 14% 0 0; background: radial-gradient(ellipse at 50% 0%, #3d7187 0%, #234a60 30%, #0f2433 80%); }
  .dev-backdrop .ship { position: absolute; left: 50%; top: 50%; width: 22%; transform: translate(-50%, -62%); color: #1d140c; opacity: 0.92; filter: drop-shadow(0 10px 12px rgba(0,0,0,.4)); }
  .dev-backdrop .sun { position: absolute; left: 68%; top: 18%; width: 9vmin; height: 9vmin; border-radius: 50%; background: radial-gradient(circle, #fff7da, #ffd98a 40%, rgba(255,210,120,0) 70%); }
  .dev-backdrop.dark { background: linear-gradient(180deg, #0a1020 0%, #1a2440 45%, #0b1622 46%, #050b12 100%); }
  .dev-parts { position: absolute; inset: 0; display: flex; flex-direction: column; padding: var(--st) var(--sr) 0 var(--sl); background: rgba(18, 10, 4, 0.5); }
  .dev-parts__scroll { flex: 1; padding: var(--sp-3) var(--sp-5) var(--sp-8); display: flex; flex-direction: column; gap: var(--sp-5); }
  .dev-sec { flex: none; }
  .dev-row { display: flex; flex-direction: column; gap: var(--sp-2); margin-bottom: var(--sp-4); }
  .dev-row__c { display: flex; flex-wrap: wrap; align-items: center; gap: var(--sp-4); }
  .dev-sw { display: flex; flex-direction: column; align-items: center; gap: 4px; font: 10px ui-monospace, monospace; width: calc(74px * var(--k)); }
  .dev-sw i { width: 100%; height: calc(34px * var(--k)); border-radius: var(--r-sm); border: 1.5px solid var(--c-ink); }
  .dev-type { display: flex; flex-direction: column; align-items: flex-start; }
  .dev-space { display: flex; flex-direction: column; align-items: center; gap: 2px; }
  .dev-space i { background: var(--c-wax); display: block; }
  .dev-rad { width: calc(110px * var(--k)); height: calc(60px * var(--k)); display: grid; place-items: center; }
  .dev-card { width: calc(170px * var(--k)); }
  .dev-card__art { height: calc(120px * var(--k)); border-radius: 0; border-width: 0 0 calc(2px * var(--k)) 0; }
  .dev-card__body { padding: var(--sp-3) var(--sp-4) var(--sp-4); }
  .dev-rframe { width: calc(110px * var(--k)); height: calc(110px * var(--k)); }
  .dev-panel { width: calc(260px * var(--k)); min-height: calc(130px * var(--k)); }
  .dev-bar { width: calc(330px * var(--k)); }
  .dev-ring { position: relative; width: calc(70px * var(--k)); height: calc(70px * var(--k)); }
  .dev-count { font-size: var(--fs-num); min-width: 3em; }
  .dev-coin { display: flex; align-items: center; gap: 6px; font-size: var(--fs-num); }
  .dev-coin__i { width: 1.1em; height: 1.1em; color: var(--c-gold); display: block; }
  .dev-glyph { display: flex; flex-direction: column; align-items: center; gap: 4px; width: calc(78px * var(--k)); font: 10px ui-monospace, monospace; color: var(--c-inkSoft); }
  .dev-glyph i { width: calc(40px * var(--k)); height: calc(40px * var(--k)); color: var(--c-ink); }
  .dev-static { position: relative; animation: none; }
  .dev-sheet { width: calc(420px * var(--k)); }
  .dev-play { min-width: calc(320px * var(--k)); }
`;

/** The parchment, on a renderer of the gallery's own (it has no stage). */
const parchment = Parchment.create().then(async (p) => {
  applyParchment(await p.sheets());
  setChartPainter((w, h, mask, sailed) => p.chart(w, h, mask, sailed));
});

export function mountScreen(screen: string, device: DeviceName): void {
  void parchment;
  const st = document.createElement('style');
  st.textContent = devStyle;
  document.head.appendChild(st);
  const backdrop = el('dev-backdrop', document.body, `<div class="sun"></div><div class="ship"><svg viewBox="0 0 120 80"><path d="M58 4v52H24z" fill="#f4ead6"/><path d="M62 10v46h30C88 38 78 22 62 10z" fill="#efe2c8"/><path d="M8 58h104l-12 16H22z"/><path d="M58 2h4v58h-4z"/></svg></div>`);
  const shell = new Shell(document.body, { form: device === 'iphone' ? 'phone' : 'tablet' });
  // the device's safe areas, which env() cannot know inside the gallery's frame
  const D = DEVICES[device];
  shell.root.style.setProperty('--sl', `${D.safe.left}px`);
  shell.root.style.setProperty('--sr', `${D.safe.right}px`);
  shell.root.style.setProperty('--st', `${D.safe.top}px`);
  shell.root.style.setProperty('--sb', `${D.safe.bottom}px`);
  void backdrop;
  const go = (id: string) => { location.search = `?frame=1&device=${device}&screen=${id}`; };
  if (screen === 'parts') shell.show('parts', { el: partsGallery(shell) }, 'fade');
  // the lobby is drawn on the chart now (src/screens/lobby.ts): the menus go back to the parts
  const back = () => go('parts');
  if (screen === 'abilities') shell.show('abilities', abilitiesScreen(fxAbilities(), { onBack: back, onEquip: () => {} }), 'fade');
  if (screen === 'locker') shell.show('locker', lockerScreen(fxLocker(), { onBack: back, onEquip: () => {}, onPreview: () => {} }), 'fade');
  if (screen === 'rivals') shell.show('rivals', rivalsScreen(fxRivals(), { onBack: back }), 'fade');
  if (screen === 'career') {
    warmChart();
    shell.show('career', careerScreen(fxCareer(), { onBack: back }), 'fade');
  }
  if (screen === 'rank') shell.show('rank', rankScreen(fxRank(), { onBack: back }), 'fade');
  if (screen === 'settings') {
    const v = settingsScreen(DEFAULT_SETTINGS, { onBack: back, onChange: (x) => v.set({ ...DEFAULT_SETTINGS, ...x }) });
    shell.show('settings', v, 'fade');
  }
}

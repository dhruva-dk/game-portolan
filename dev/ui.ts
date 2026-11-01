// The interface gallery. Every part, and every screen driven by fixtures, at iPad and iPhone sizes.
//
//   dev/ui.html                               the gallery: a device frame with a picker for screen and device
//   dev/ui.html?device=iphone&screen=lobby    the same, opened on a screen
//   dev/ui.html?frame=1&device=ipad&screen=X  one screen alone at the window's size (what the frame shows, and what
//                                             screenshots load with the viewport at the device's size)
//   &state=...                                a screen's variant (see STATES in ui-screens.ts)
//   dev/ui.html?grid=1                        every screen at both sizes, side by side
//
// Screens are live: their buttons navigate the way the game will (title → lobby → menus → Gale → match → results),
// with the fixtures standing in for the career and the match.
import { DEVICES, SCREENS, STATES, mountScreen, type DeviceName } from './ui-screens.ts';

const q = new URLSearchParams(location.search);
const device = (q.get('device') ?? 'ipad') as DeviceName;
const screen = q.get('screen') ?? 'parts';

const style = document.createElement('style');
style.textContent = `
  .dev-top { position: fixed; left: 0; right: 0; top: 0; height: 52px; display: flex; align-items: center; gap: 8px; padding: 0 12px; background: #120a04; color: #f4e3c0; font: 13px/1 system-ui, sans-serif; z-index: 10; overflow-x: auto; }
  .dev-top a, .dev-top button { color: #f4e3c0; background: #2a1a0d; border: 1px solid #5a4024; border-radius: 6px; padding: 6px 10px; text-decoration: none; white-space: nowrap; cursor: pointer; font: inherit; }
  .dev-top .on { background: #a12a17; border-color: #dc5a3c; }
  .dev-top .sep { width: 1px; height: 28px; background: #5a4024; flex: none; }
  .dev-stage { position: fixed; left: 0; right: 0; top: 52px; bottom: 0; display: grid; place-items: center; }
  .dev-frame { border: 0; background: #000; box-shadow: 0 0 0 2px #5a4024, 0 20px 60px rgba(0,0,0,.6); border-radius: 18px; transform-origin: center; }
  .dev-log { position: fixed; right: 8px; bottom: 8px; width: 260px; max-height: 40vh; overflow: hidden; font: 11px/1.3 ui-monospace, monospace; color: #f4e3c0; background: rgba(18,10,4,.85); border-radius: 6px; padding: 6px 8px; z-index: 11; pointer-events: none; }
  .dev-grid { position: fixed; inset: 0; overflow: auto; background: #120a04; padding: 16px; display: flex; flex-wrap: wrap; gap: 16px; align-content: flex-start; }
  .dev-cell { color: #f4e3c0; font: 12px system-ui; }
  .dev-cell iframe { display: block; border: 0; transform-origin: 0 0; background: #000; }
`;
document.head.appendChild(style);

if (q.get('frame')) {
  mountScreen(screen, device, q.get('state') ?? '');
} else if (q.get('grid')) {
  // every screen at both sizes, small
  const grid = document.createElement('div');
  grid.className = 'dev-grid';
  document.body.appendChild(grid);
  const scale = 0.32;
  for (const s of SCREENS) {
    for (const d of ['ipad', 'iphone'] as DeviceName[]) {
      const D = DEVICES[d], cell = document.createElement('div');
      cell.className = 'dev-cell';
      cell.innerHTML = `<div>${s} · ${d}</div>`;
      const box = document.createElement('div');
      box.style.cssText = `width:${D.width * scale}px;height:${D.height * scale}px;overflow:hidden`;
      const f = document.createElement('iframe');
      f.src = `?frame=1&device=${d}&screen=${s}`;
      f.style.cssText = `width:${D.width}px;height:${D.height}px;transform:scale(${scale})`;
      box.appendChild(f);
      cell.appendChild(box);
      grid.appendChild(cell);
    }
  }
} else {
  // the gallery: a picker and one device frame
  const top = document.createElement('div');
  top.className = 'dev-top';
  const link = (label: string, params: Record<string, string>, on: boolean) => {
    const a = document.createElement('a');
    const p = new URLSearchParams(location.search);
    for (const [k, v] of Object.entries(params)) { if (v) p.set(k, v); else p.delete(k); }
    a.href = `?${p}`;
    a.textContent = label;
    if (on) a.className = 'on';
    top.appendChild(a);
  };
  for (const d of ['ipad', 'iphone'] as DeviceName[]) link(DEVICES[d].label, { device: d }, d === device);
  top.appendChild(Object.assign(document.createElement('span'), { className: 'sep' }));
  for (const s of SCREENS) link(s, { screen: s, state: '' }, s === screen);
  const states = STATES[screen] ?? [];
  if (states.length) {
    top.appendChild(Object.assign(document.createElement('span'), { className: 'sep' }));
    for (const st of states) link(st || 'default', { state: st }, (q.get('state') ?? '') === st);
  }
  link('grid', { grid: '1' }, false);
  document.body.appendChild(top);
  const stage = document.createElement('div');
  stage.className = 'dev-stage';
  document.body.appendChild(stage);
  const D = DEVICES[device];
  const frame = document.createElement('iframe');
  frame.className = 'dev-frame';
  frame.src = `?frame=1&device=${device}&screen=${screen}&state=${q.get('state') ?? ''}`;
  frame.style.width = `${D.width}px`;
  frame.style.height = `${D.height}px`;
  stage.appendChild(frame);
  const fit = () => {
    const s = Math.min(1, (innerWidth - 24) / D.width, (innerHeight - 52 - 24) / D.height);
    frame.style.transform = `scale(${s})`;
  };
  fit();
  addEventListener('resize', fit);
  // the frame keeps its own URL in step, so reloading lands on the same screen
  addEventListener('message', (e) => {
    if (e.data?.type !== 'ui-screen') return;
    const p = new URLSearchParams(location.search);
    p.set('screen', e.data.screen);
    p.delete('state');
    history.replaceState(null, '', `?${p}`);
  });
}

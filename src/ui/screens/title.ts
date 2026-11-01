// The title: the name over the planet, the loading progress beneath it, then "Tap to start".
import { effect, el, esc, ICON, press, progressBar, text } from '../parts/index.ts';
import type { TitleModel } from '../model.ts';
import type { ScreenView } from '../shell.ts';
import './title.css';

export interface TitleActions {
  onStart(): void;
}

export interface TitleView extends ScreenView {
  /** Loading progress, 0–1; at 1 the screen waits for a tap. */
  setProgress(p: number, status?: string): void;
}

export function titleScreen(m: TitleModel, a: TitleActions): TitleView {
  const root = el('s-title');
  el('s-title__sky', root);
  const mark = el('s-title__mark', root);
  el('s-title__rose', mark, ICON.fleur);
  const word = el('s-title__word', mark);
  [...'PORTOLAN'].forEach((c, i) => {
    const s = el('s-title__letter', word, esc(c), 'span');
    s.style.setProperty('--i', String(i));
  });
  el('s-title__tag', mark, 'Sixteen waters. Twenty ships. One left afloat.');
  const load = el('s-title__load', root);
  const bar = progressBar({ kind: 'rank', value: m.progress, parent: load });
  const status = el('s-title__status', load, esc(m.status));
  el('s-title__tap', root, 'Tap to start');
  el('s-title__ver', root, esc(m.version));
  let ready = false, started = false;
  const setProgress = (p: number, s?: string) => {
    bar.set(p);
    if (s) text(status, s);
    if (p >= 1 && !ready) {
      ready = true;
      root.classList.add('is-ready');
      effect('title:ready', 'reward', 'light');
    }
  };
  press(root, () => {
    if (!ready || started) return;
    started = true;
    a.onStart();
  }, { sound: 'start', haptic: 'medium', what: 'title:start' });
  root.removeAttribute('role');
  setProgress(m.progress, m.status);
  return { el: root, setProgress };
}

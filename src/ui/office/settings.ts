// settings: a dialog over home (Phase C section 6): the sound's level and the look's speed, each a slider; Back up now,
// with the day of the last backup; and Restore the backup (danger: the career goes back to it).

import type { SettingsView } from '../../office';
import type { Settings } from '../screens';
import { button } from '../kit/button';
import { dialog, type Dialog } from '../kit/dialog';
import { make } from '../kit/part';
import type { Send } from './screen';

/** The device's settings, as the flow keeps them. */
export interface Prefs { get(): Settings; set(s: Settings): void }

export interface SettingsDialog { show(v: SettingsView | null): void }

/** A slider of 0…1 in twentieths. */
function slider(parent: HTMLElement, label: string, get: () => number, set: (v: number) => void) {
  const row = make('div', '', parent);
  Object.assign(row.style, { display: 'grid', gridTemplateColumns: '150px 1fr 56px', columnGap: '12px', alignItems: 'center' });
  make('span', '', row, label);
  const input = make('input', 'k-range', row);
  Object.assign(input, { type: 'range', min: '0', max: '20', step: '1' });
  input.setAttribute('aria-label', label);
  input.addEventListener('pointerdown', (e) => e.stopPropagation());
  const value = make('span', 'num', row);
  input.addEventListener('input', () => {
    set(Number(input.value) / 20);
    value.textContent = `${Number(input.value) * 5}%`;
  });
  return () => {
    input.value = String(Math.round(get() * 20));
    value.textContent = `${Number(input.value) * 5}%`;
  };
}

export function createSettings(send: Send, prefs: Prefs): SettingsDialog {
  let d: Dialog | null = null, sure: Dialog | null = null, backup: HTMLElement | null = null;
  const draws: (() => void)[] = [];
  const make1 = () => {
    const box = dialog(send.page(), 'Settings', { from: 3, to: 10, top: 80, height: 420 });
    const body = box.body;
    Object.assign(body.style, { display: 'flex', flexDirection: 'column', gap: '12px' });
    draws.push(slider(body, 'Sound', () => prefs.get().sound, (v) => prefs.set({ ...prefs.get(), sound: v })));
    draws.push(slider(body, 'Look speed', () => prefs.get().look, (v) => prefs.set({ ...prefs.get(), look: v })));
    make('div', 'o-label', body, 'Your career');
    const row = make('div', '', body);
    Object.assign(row.style, { display: 'flex', gap: '12px', alignItems: 'center', justifyContent: 'space-between' });
    backup = make('span', '', row);
    row.appendChild(button('Back up now', async () => {
      const r = await send.desk().backup();
      send.say(r ?? 'The career is backed up.', r ? 'harm' : 'good');
      if (!r) backup!.textContent = send.desk().settings().backup;
    }, 'plain').el);
    const restore = make('div', '', body);
    Object.assign(restore.style, { display: 'flex', gap: '12px', alignItems: 'center', justifyContent: 'space-between' });
    make('span', 'small faint', restore, 'Restoring takes the career back to its backup; what came after is lost.');
    restore.appendChild(button('Restore the backup', () => {
      if (!sure) {
        sure = dialog(send.page(), 'Restore the backup?', { from: 4, to: 9, top: 160, height: 220 });
        make('p', '', sure.body, 'Everything since the backup will be lost. This cannot be undone.');
        sure.foot.append(button('Keep the career', () => sure?.close(), 'plain').el, button('Restore it', async () => {
          sure?.close();
          const r = await send.desk().recoverBy('restore');
          send.say(r ?? 'The backup is restored.', r ? 'harm' : 'good');
        }, 'danger').el);
      }
      sure.open();
    }, 'danger').el);
    box.foot.appendChild(button('Done', () => send.tap('close'), 'primary').el);
    return box;
  };
  return {
    show(v) {
      if (!v) {
        d?.close();
        sure?.close();
        return;
      }
      d ??= make1();
      for (const draw of draws) draw();
      backup!.textContent = v.backup;
      d.open();
    },
  };
}

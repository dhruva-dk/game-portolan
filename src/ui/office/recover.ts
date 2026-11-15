// recover: the save was damaged, or could not be read (Phase C section 6). One panel in columns 3–10: what the load
// found, what was lost, a plain button for each way forward it allows, and, apart, a new career (danger: the career
// on this device is wiped).

import type { RecoverView } from '../../office';
import { button } from '../kit/button';
import { dialog } from '../kit/dialog';
import { make } from '../kit/part';
import { panel } from '../kit/panel';
import type { Screen, Send } from './screen';

export function createRecover(send: Send): Screen<RecoverView> {
  const p = panel({ from: 3, to: 10, top: 96, height: 520 }, { title: 'Your save needs a look' });
  const found = make('p', '', p.body), lost = make('p', 'bold', p.body);
  make('div', 'o-label', p.body, 'Ways forward');
  const ways = make('div', 'o-ways', p.body);
  const apart = make('div', '', p.body);
  Object.assign(apart.style, { position: 'absolute', left: '14px', right: '14px', bottom: '14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '16px' });
  make('span', 'small faint', apart, 'A new career wipes this one from the device.');

  let sure: ReturnType<typeof dialog> | null = null;
  const by = async (way: 'retry' | 'carry' | 'restore' | 'new') => {
    const r = await send.desk().recoverBy(way);
    if (r) return send.say(r, 'harm');
    send.say(way === 'new' ? 'A new career is ready to found.' : 'The career is open.', 'good');
    const where = send.desk().where();
    if (where !== 'recover') send.tap(where);
  };
  apart.appendChild(button('Start a new career', () => {
    if (!sure) {
      sure = dialog(send.page(), 'Start a new career?', { from: 4, to: 9, top: 200, height: 240 });
      make('p', '', sure.body, 'The career on this device, and its backup, will be wiped. This cannot be undone.');
      sure.foot.append(button('Keep it', () => sure?.close(), 'plain').el, button('Wipe and start anew', () => {
        sure?.close();
        void by('new');
      }, 'danger').el);
    }
    sure.open();
  }, 'danger').el);

  return {
    el: p.el,
    show(v) {
      found.textContent = v.found;
      lost.textContent = v.lost;
      ways.textContent = '';
      for (const w of v.ways) ways.appendChild(button(w.label, () => void by(w.way), 'plain').el);
    },
  };
}

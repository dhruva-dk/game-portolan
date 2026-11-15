// A screen not yet drawn (batches 2–4 of Phase C): one panel across the body with an empty state naming it, and the
// way on its place in ways.ts gives (the plan's to the anchorage; the season's and the jobs' home). Each is replaced by
// its own file of ui/office/ and its line in office/screens.ts.

import type { Glyph } from '../glyphs';
import { empty } from '../kit/empty';
import { panel } from '../kit/panel';
import type { OfficeScreen, Tap } from '../ways';
import type { Screen, Send } from './screen';

const MARK: Partial<Record<OfficeScreen, Glyph>> = {
  crew: 'tab.crew', profile: 'tab.crew', offer: 'tab.market', market: 'tab.market', ship: 'tab.ship', rookery: 'tab.rookery',
  finance: 'tab.finance', league: 'tab.league', mail: 'tab.mail', career: 'menu.rank', plan: 'call.withMe', season: 'tab.league', jobs: 'tab.market',
};
const WAY: Partial<Record<OfficeScreen, { label: string; tap: Tap }>> = {
  plan: { label: 'To the anchorage', tap: 'anchorage' }, season: { label: 'Home', tap: 'home' }, jobs: { label: 'Home', tap: 'home' },
};

/** The stub for `name`. */
export function createStub(name: OfficeScreen) {
  return (send: Send): Screen<null> => {
    const title = name[0].toUpperCase() + name.slice(1);
    const p = panel({ from: 1, to: 12, top: 0, height: 724 }, { title });
    const e = empty(), way = WAY[name];
    p.body.appendChild(e.el);
    return {
      el: p.el,
      show() {
        e.set({
          mark: MARK[name] ?? 'tab.home', title: `The ${title} screen`,
          sentence: `The ${name} screen is drawn in a later batch of the office. Its tab and its ways in already lead here.`,
          action: way ? { label: way.label, act: () => send.tap(way.tap) } : undefined,
        });
      },
    };
  };
}

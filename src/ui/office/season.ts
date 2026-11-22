// The season's two screens, laid out as the manager's game it follows lays
// them.
//
// Sponsors: her ship herself, live, through the page (where that game stands
// the car in its sponsors' paint); the offers standing at the left, a card
// each, signed into a slot by a tap; along the foot the three slots, a card
// each, with what its sponsor pays and how long the deal has to run.
//
// Calendar: the season's races down the left, a row each (sailed, today's, to
// come); in the middle the next race under its planet pictured from space; at
// the right the race before it and how far the season has got.

import type {
  Backer,
  CalendarPaper,
  SponsorsPaper,
} from '../../office/papers.ts';
import { button } from '../kit/button.ts';
import { band, panel } from '../kit/panel.ts';
import { el, pictured } from '../kit/part.ts';
import { stars, tag } from '../kit/stat.ts';
import { cut, stylesheet } from '../kit/style.ts';
import { bitsStyle, lines, money } from './bits.ts';
import type { Office } from './office.ts';
import type { Screen } from './screens.ts';

const CSS = `
.s-sponsors > .o-window { position: absolute; inset: 0; }
/* she is drawn in the middle of what the panels leave of the page */
.sp-subject { position: absolute; left: 330px; right: 0; top: 0; bottom: 206px; pointer-events: none; }
.sp-offers { position: absolute; left: 18px; top: 12px; width: 312px; max-height: calc(100% - 230px); }
.sp-offers > .k-body { gap: 8px; }
.sp-list { flex: 1; min-height: 0; overflow-y: auto; display: flex; flex-direction: column; gap: 8px; padding: 3px; }
.sp-offer { flex: none; display: flex; flex-direction: column; gap: 5px; padding: 9px 10px 10px; ${cut('light')} }
.sp-offer > b { font: 700 17px/1.15 var(--serif); }
.sp-offer > header { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
.sp-offer small, .sp-slot small { font-size: 13px; font-style: italic; color: var(--faint); }
.sp-pays { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; }
.sp-pays > b { font: italic 500 24px/1 var(--serif); font-variant-numeric: oldstyle-nums; }
.sp-pays > span { font-weight: 700; white-space: nowrap; }
.sp-offer > p { margin: 0; line-height: 1.25; }
.sp-sign { display: grid; grid-template-columns: repeat(3, 1fr); gap: 4px; }
.sp-sign > .k-btn { height: 36px; min-width: 0; padding: 0; }
.sp-none { padding: 14px 8px; text-align: center; font-style: italic; color: var(--faint); }
.sp-slots { position: absolute; left: 18px; right: 18px; bottom: 10px; }
.sp-slots > .k-body { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
.sp-slot { display: flex; flex-direction: column; align-items: center; gap: 3px; padding: 0 10px 9px; text-align: center; min-width: 0;
  ${cut('light')} }
.sp-slot > .k-band { align-self: stretch; margin: 0 -10px 3px; }
.sp-slot > b { max-width: 100%; font: 700 19px/1.2 var(--serif); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sp-slot > span { max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sp-slot > hr { align-self: stretch; margin: 3px 0 1px; border: 0; border-top: 1px solid var(--rule); }
.sp-slot > strong { font: 700 16px/1.1 var(--serif); letter-spacing: .04em; }
.sp-slot.vacant > b { font-weight: 500; font-style: italic; color: var(--faint); }

.s-calendar { display: grid; grid-template-columns: 318px 1fr 300px; gap: 10px; padding: 12px 18px; }
.s-calendar > div { display: flex; flex-direction: column; gap: 10px; min-height: 0; min-width: 0; }
.c-races { flex: 1; min-height: 0; overflow-y: auto; display: flex; flex-direction: column; gap: 5px; padding: 3px; }
.c-race { flex: 1; min-height: 36px; max-height: 64px; display: grid; grid-template-columns: 26px 1fr auto; align-items: center; gap: 8px;
  padding: 0 12px; ${cut('light')} }
.c-race > i { font: italic 500 19px/1 var(--serif); font-variant-numeric: oldstyle-nums; color: var(--faint); }
.c-race > b { font-weight: 700; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.c-race > span { font-size: 13px; font-style: italic; color: var(--faint); white-space: nowrap; }
.c-race.sailed > b { font-weight: 500; color: var(--faint); }
.c-race.next { ${cut('gilt')} }
.c-race.next > span, .c-race.next > i { color: var(--ink); }
.c-list, .c-next { flex: 1; }
.c-next > .k-body { gap: 8px; padding: 0 4px 8px; }
.c-title { flex: none; display: flex; flex-direction: column; align-items: center; gap: 3px; padding: 12px 8px 2px; }
.c-title > span { font-style: italic; color: var(--faint); }
.c-title > b { font: 700 28px/1.1 var(--serif); letter-spacing: .08em; text-transform: uppercase; text-align: center; }
.c-art { position: relative; flex: 1; min-height: 0; overflow: hidden; background: var(--light); border: 1.5px solid var(--ink); }
.c-art > img { position: absolute; left: 0; top: 0; width: 100%; height: 100%; object-fit: cover; }
.c-art > .k-tag { position: absolute; right: 10px; top: 10px; }
.c-facts { flex: none; display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; padding: 0 4px; }
.c-facts > div { display: flex; flex-direction: column; align-items: center; gap: 2px; padding: 7px 6px 8px; text-align: center;
  box-shadow: inset 0 0 0 1px var(--line); }
.c-facts small, .c-last small { font-size: 13px; font-style: italic; color: var(--faint); }
.c-facts b { font: 700 17px/1.1 var(--serif); }
.c-rounds { flex: none; display: flex; gap: 3px; height: 6px; padding: 0 4px; }
.c-rounds > i { flex: 1; background: var(--track); }
.c-rounds > i.done { background: var(--gold); }
.c-last { flex: 1; }
.c-last > .k-body { gap: 12px; justify-content: center; }
.c-season > .k-body { gap: 8px; }
.c-last .c-name { display: flex; flex-direction: column; align-items: center; gap: 4px; padding: 4px 0 2px; text-align: center; }
.c-last .c-name > b { font: 700 22px/1.1 var(--serif); letter-spacing: .06em; text-transform: uppercase; }
.c-none { padding: 18px 8px; text-align: center; font-style: italic; color: var(--faint); }
.c-season { flex: none; }
`;

/** `made`, of the classes `cls` too (a panel's place on its screen). */
const placed = <T extends Element>(made: T, cls: string) => {
  made.classList.add(...cls.split(' '));
  return made;
};

/** So many races, as a deal's length is said. */
const races = (n: number) => `${n} ${n === 1 ? 'Race' : 'Races'}`;

type Standing = SponsorsPaper['offers'][number];

/** The sponsors. */
export function createSponsors(office: Office): Screen<SponsorsPaper> {
  stylesheet(CSS);
  bitsStyle();
  const root = el('div', 's-sponsors');

  /** An offer standing: who, how good, what it pays and for what, and the slots it may be signed into. */
  const offer = (r: Standing, slots: number) =>
    el(
      'div',
      'sp-offer',
      el('b', '', r.name),
      el(
        'header',
        '',
        stars(r.grade, r.grade, 14),
        el('small', '', `Stands ${r.days} ${r.days === 1 ? 'Day' : 'Days'}`)
      ),
      el(
        'div',
        'sp-pays',
        el('b', '', money(r.amount)),
        el('span', '', races(r.races))
      ),
      el('p', '', r.pays),
      el(
        'div',
        'sp-sign',
        ...Array.from({ length: slots }, (_, slot) =>
          button(
            `Slot ${slot + 1}`,
            () =>
              office.ask({
                kind: 'send',
                command: { kind: 'SignSponsor', offer: r.id, slot },
              }),
            { kind: 'on', off: !r.sign.ok }
          )
        )
      ),
      !r.sign.ok && r.sign.why !== '' && el('div', 'b-why', r.sign.why)
    );

  /** A slot: its sponsor, what it pays and for what, and the races its deal has left; or vacant. */
  const slot = (b: Backer | null, i: number) =>
    el(
      'div',
      `sp-slot${b ? '' : ' vacant'}`,
      band(`Slot ${i + 1}`),
      el('b', '', b?.name ?? 'Vacant'),
      el(
        'span',
        '',
        b ? `${money(b.amount)} · ${b.pays}` : 'No sponsor signed'
      ),
      el('hr'),
      el('small', '', 'Sponsor deal time remaining:'),
      el('strong', '', b ? races(b.races) : '–')
    );

  return {
    el: root,
    show(v) {
      root.replaceChildren(
        // her ship herself, at anchor: the world through the page
        el('div', 'o-window', el('div', 'o-subject sp-subject')),
        placed(
          panel('Sponsor Offers', [
            v.offers.length > 0
              ? el(
                  'div',
                  'sp-list',
                  ...v.offers.map((r) => offer(r, v.slots.length))
                )
              : el('div', 'sp-none', 'No offers stand.'),
          ]),
          'sp-offers'
        ),
        placed(panel('Sponsors', v.slots.map(slot)), 'sp-slots')
      );
    },
  };
}

type Race = CalendarPaper['races'][number];

/** The calendar. */
export function createCalendar(office: Office): Screen<CalendarPaper> {
  stylesheet(CSS);
  bitsStyle();
  const root = el('div', 's-calendar');

  /** A fact of the next race, under its name. */
  const fact = (name: string, value: string) =>
    el('div', '', el('small', '', name), el('b', '', value));

  return {
    el: root,
    show(v) {
      const next = v.races.find((r) => r.when !== 'sailed'),
        sailed = v.races.filter((r) => r.when === 'sailed'),
        last = sailed.at(-1);
      /** A race of the season's list: its round, where, and when or how it stands. */
      const row = (r: Race) =>
        el(
          'div',
          `c-race ${r.when}${r === next ? ' next' : ''}`,
          el('i', '', r.round),
          el('b', '', r.name),
          r.when === 'sailed'
            ? tag('Complete', 'good', 'bare')
            : el('span', '', r.date)
        );
      root.replaceChildren(
        el(
          'div',
          '',
          placed(
            panel(v.championship, [el('div', 'c-races', ...v.races.map(row))]),
            'c-list'
          )
        ),
        el(
          'div',
          '',
          placed(
            panel(
              null,
              next
                ? [
                    el(
                      'div',
                      'c-title',
                      el('span', '', 'Next Race'),
                      el('b', '', next.name)
                    ),
                    // the planet she sails next, pictured from space
                    el(
                      'div',
                      'c-art',
                      pictured(office.still()),
                      next.when === 'today' && tag('Race Day', 'go')
                    ),
                    el(
                      'div',
                      'c-facts',
                      fact('Round', `${next.round} of ${v.races.length}`),
                      fact('Date', next.date),
                      fact('Championship', v.championship)
                    ),
                  ]
                : [el('div', 'c-none', 'The season is sailed.')]
            ),
            'c-next'
          )
        ),
        el(
          'div',
          '',
          placed(
            panel(
              'Previous Race',
              last
                ? [
                    el(
                      'div',
                      'c-name',
                      el('b', '', last.name),
                      el(
                        'small',
                        '',
                        `Round ${last.round} of ${v.races.length} · ${last.date}`
                      ),
                      tag('Complete', 'good', 'boxed')
                    ),
                    button(
                      'Standings',
                      () => office.ask({ kind: 'open', screen: 'standings' }),
                      { wide: true }
                    ),
                  ]
                : [el('div', 'c-none', 'No race has been sailed this season.')]
            ),
            'c-last'
          ),
          placed(
            panel('Season', [
              lines([
                ['Races Sailed', sailed.length],
                ['Races to Come', v.races.length - sailed.length],
              ]),
              el(
                'div',
                'c-rounds',
                ...v.races.map((r) =>
                  el('i', r.when === 'sailed' ? 'done' : '')
                )
              ),
            ]),
            'c-season'
          )
        )
      );
    },
  };
}

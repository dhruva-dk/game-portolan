// The sponsors on the chartroom kit, after MM's: her ship through the brass
// window in the middle (where MM stands the car in its sponsors' paint), the
// market under it in the same frame: what her slots are worth a race, what
// offers are sized by (her marketability), the grade her landing pad receives
// (the way to it), when the next offers come. At the left the offers
// standing, a card each: what it pays (a sum a race, or what each objective
// pays when it is chosen in a race's plan), for how many races, signed into
// any slot by its button (over the sponsor there), or shut with why once
// under them. At the right her three slots, a card each, the same way.

import type { Backer, SponsorsPaper } from '../../office/papers.ts';
import { button, link } from '../chartroom/controls.ts';
import { terms } from '../chartroom/data.ts';
import { fig, label } from '../chartroom/figures.ts';
import { kitLooks } from '../chartroom/kit.ts';
import { column, page } from '../chartroom/layout.ts';
import { paper, sheet } from '../chartroom/paper.ts';
import { shipWindow } from '../chartroom/port.ts';
import { u } from '../chartroom/tokens.ts';
import { el, grouped } from '../kit/part.ts';
import { stylesheet } from '../kit/style.ts';
import type { Office } from './office.ts';
import type { Screen } from './screens.ts';

const CSS = `
.sp-offers, .sp-slots { flex: 1; display: flex; flex-direction: column; gap: var(--s3); min-height: 0; overflow-y: auto;
  padding: var(--s1); }
.sp-offer { flex: none; display: flex; flex-direction: column; gap: var(--s2); padding: var(--s3) var(--s4) var(--s4); }
.sp-offer > b, .sp-slot > b { font: 700 var(--t-name)/1.15 var(--face); overflow-wrap: break-word; }
.sp-sign { display: grid; grid-template-columns: repeat(3, 1fr); gap: var(--s2); }
.sp-sign .cr-btn { padding: 0; }
.sp-slot { flex: none; display: flex; flex-direction: column; gap: var(--s2); min-width: 0; padding: var(--s3) var(--s4) var(--s4); }
.sp-slot.empty > b { font-weight: 500; font-style: italic; color: var(--ink-2); }
.sp-head { display: flex; justify-content: space-between; align-items: baseline; gap: var(--s3); }
/* the market, the window's nameplate: what the slots are worth beside what offers are sized by */
.sp-market { flex: none; display: grid; grid-template-columns: ${u(90)} minmax(0, 1fr); align-items: center; gap: var(--s5);
  padding: var(--s3) var(--s5) var(--s4); }
.sp-worth { display: flex; flex-direction: column; align-items: center; gap: var(--s1); }
.sp-market > div:last-child { display: flex; flex-direction: column; gap: var(--s2); }
`;

/** So many races, as a deal's length is said. */
const races = (n: number) => `${n} ${n === 1 ? 'race' : 'races'}`;

/** So many days, as a wait is said. */
const days = (n: number) => `${n} ${n === 1 ? 'day' : 'days'}`;

/** What a sponsor pays: a sum a race, or each objective with what meeting it pays. */
const pays = (b: Backer) =>
  terms(
    b.objectives.length === 0
      ? [['A race', grouped(b.perRace)]]
      : b.objectives.map((o) => [o.label, grouped(o.pays)] as const)
  );

type Standing = SponsorsPaper['offers'][number];

/** The sponsors. */
export function createSponsors(office: Office): Screen<SponsorsPaper> {
  kitLooks();
  stylesheet(CSS);
  const root = page('ledger', 's-sponsors');

  /** An offer standing: who, its grade and how long it stands; what it pays, for how long; a button a slot. */
  const offer = (r: Standing, filled: readonly (Backer | null)[]) => {
    const shut = r.into.find((a) => !a.ok);
    return paper(
      el(
        'div',
        'sp-offer',
        el('b', '', r.name),
        el(
          'div',
          'sp-head',
          label(`Grade ${r.grade} · ${races(r.races)}`),
          label(`Stands ${days(r.days)}`)
        ),
        pays(r),
        el(
          'div',
          'sp-sign',
          ...r.into.map((a, slot) =>
            button(
              `Slot ${slot + 1}`,
              () =>
                office.ask({
                  kind: 'send',
                  command: { kind: 'SignSponsor', offer: r.id, slot },
                }),
              { off: !a.ok, kind: filled[slot] ? 'plain' : 'act' }
            )
          )
        ),
        shut && shut.why !== '' && label(shut.why)
      ),
      { fill: 'paper-raised' }
    );
  };

  /** A slot: its sponsor, what it pays, the races its deal has left; or empty. */
  const slot = (b: Backer | null, i: number) =>
    paper(
      el(
        'div',
        `sp-slot${b ? '' : ' empty'}`,
        el(
          'div',
          'sp-head',
          label(`Slot ${i + 1}`),
          b && label(`${races(b.races)} left`)
        ),
        el('b', '', b?.name ?? 'Empty'),
        b ? pays(b) : label('Sign an offer into it.')
      ),
      { fill: 'paper-raised' }
    );

  /** The market: what offers are sized by, the grade received, when the next come, the slots' worth. */
  const market = (v: SponsorsPaper) =>
    paper(
      el(
        'div',
        'sp-market',
        el(
          'div',
          'sp-worth',
          fig(grouped(v.worth), 'l'),
          label('Your slots, a race')
        ),
        el(
          'div',
          '',
          terms([
            ['Marketability', `${v.marketability} of 100`],
            [
              'Landing pad receives',
              link(`Grade ${v.grade} of ${v.grades}`, () =>
                office.ask({ kind: 'open', screen: 'hq' })
              ),
            ],
            [
              'Next offers',
              v.next === null ? 'None this season' : `In ${days(v.next)}`,
            ],
          ]),
          label(
            'Offers are sized by your marketability. A sponsor that pays for objectives pays for the one chosen in each race’s plan.'
          )
        )
      )
    );

  return {
    el: root,
    show(v) {
      root.replaceChildren(
        column(
          sheet(
            'Offers',
            [
              v.offers.length > 0
                ? el(
                    'div',
                    'sp-offers',
                    ...v.offers.map((r) => offer(r, v.slots))
                  )
                : label(
                    v.next === null
                      ? 'No offers stand.'
                      : `No offers stand. The next come in ${days(v.next)}.`
                  ),
            ],
            { cls: 'cr-grow' }
          )
        ),
        column(shipWindow(market(v))),
        column(
          sheet('Your Slots', [el('div', 'sp-slots', ...v.slots.map(slot))], {
            cls: 'cr-grow',
          })
        )
      );
    },
  };
}

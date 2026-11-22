// What the team builds, laid out as the manager's game it follows lays them.
//
// Headquarters: the harbour's chart (harbour.ts), each of the nine buildings a
// woodcut in its place under its name and level; one tapped opens its card
// over the roads at the chart's left (what it is for, what it costs a race,
// the next level's cost and days, and the way to build it, or how far the
// works have got). At the right the headquarters' stats against the
// championship, and what her designer knows of each part's components.
//
// Ship: her ship herself, live, through the page; beside her the ships' stats
// against the championship and who supplies them; along the foot the three
// things done to a ship, each a card with how it stands and the way to it.
// Design New Part: the six parts to choose from, the drawing board's slots
// (each slot's cards dealt and one picked) and what the part would be and
// cost. Fit Parts: each ship's plan with her six parts round it, and the
// spares, each fitted to a ship by a tap.

import { SHIPS, type Building } from '../../office/command.ts';
import type { HqPaper, PartLine, ShipPaper } from '../../office/papers.ts';
import { button, segmented } from '../kit/button.ts';
import { bars } from '../kit/chart.ts';
import { icon } from '../kit/icons.ts';
import { band, panel } from '../kit/panel.ts';
import { drawn, el, pressed, styled } from '../kit/part.ts';
import { job, meter } from '../kit/stat.ts';
import { cut, stylesheet } from '../kit/style.ts';
import { plan } from '../vitals.ts';
import { acted, bitsStyle, lines, money } from './bits.ts';
import { BOX, CHART, SITES, harbour, woodcut } from './harbour.ts';
import type { Office } from './office.ts';
import type { Screen } from './screens.ts';

/** A site's box on the chart, and how many times its woodcut's box the drawing is. */
const SITE = { w: 150, k: 1.2 } as const;

const CSS = `
.s-hq { display: grid; grid-template-columns: 1fr 330px; gap: 10px; padding: 12px 18px; }
.q-sheet { position: relative; overflow: hidden; }
.q-chart { position: absolute; left: 50%; top: 50%; width: ${CHART.w}px; height: ${CHART.h}px;
  margin: ${-CHART.h / 2}px 0 0 ${-CHART.w / 2}px; }
.q-chart > svg { position: absolute; left: 0; top: 0; }
.q-site { position: absolute; width: ${SITE.w}px; margin-left: ${-SITE.w / 2}px; display: flex; flex-direction: column;
  align-items: center; }
.q-site > svg { margin-bottom: -6px; }
.q-label { display: flex; flex-direction: column; align-items: center; gap: 4px; padding: 4px 12px 6px; ${cut('light')}
  white-space: nowrap; }
.q-label > b { font: 700 13px/1.1 var(--serif); letter-spacing: .1em; text-transform: uppercase; }
.q-site.chosen > .q-label { ${cut('gilt')} }
.q-label > .q-works { width: 84px; height: 7px; background: var(--stripes); box-shadow: inset 0 0 0 .8px var(--ink); }
.h-level { display: flex; gap: 4px; justify-content: center; }
.h-level > i { width: 24px; height: 7px; background: var(--light); box-shadow: inset 0 0 0 1px var(--line); }
.h-level > i.on { background: var(--hatch), var(--go); box-shadow: inset 0 0 0 1px var(--ink); }
.q-card { position: absolute; left: 10px; top: 10px; width: 286px; }
.q-card > .k-body { gap: 8px; }
.q-card .k-head { padding-left: 16px; padding-right: 40px; }
.q-pic { display: grid; place-items: center; padding: 6px 0 2px; background: var(--light); box-shadow: inset 0 0 0 1px var(--line); }
.q-about { margin: 0; padding: 0 2px; line-height: 1.35; font-style: italic; }
.q-top { text-align: center; font: 700 14px var(--serif); letter-spacing: .12em; text-transform: uppercase; color: var(--good); }
.q-side { display: flex; flex-direction: column; gap: 10px; min-height: 0; }
.q-side > .q-stats { flex: none; height: 318px; }
.q-side .k-names > div { font-weight: 500; letter-spacing: 0; }
.q-know { flex: 1; }
.q-know > .k-body { gap: 0; justify-content: space-around; }
.q-part { display: grid; grid-template-columns: 26px 1fr auto; align-items: center; gap: 8px; padding: 0 4px; }
.q-part > .k-meter { grid-column: 2 / 4; height: 7px; }
.q-part > span { font-weight: 700; }
.q-part > small { font-size: 13px; font-style: italic; color: var(--faint); }

.s-ship > .o-window { position: absolute; inset: 0; }
.y-stats { position: absolute; left: 18px; top: 12px; width: 372px; height: 470px; }
.y-stats > .k-body { gap: 8px; }
.y-stats .k-names > div { font-weight: 500; letter-spacing: 0; }
.y-doing { position: absolute; left: 18px; right: 18px; bottom: 10px; display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
.y-do > .k-body { gap: 7px; padding-top: 0; align-items: center; text-align: center; }
.y-do .k-head { padding-bottom: 4px; }
.y-do p { margin: 0; font-style: italic; color: var(--faint); }
.y-do .k-btn { align-self: stretch; }
.y-state { align-self: stretch; display: flex; gap: 6px; justify-content: center; }
.y-state > div { flex: 1; max-width: 220px; padding: 4px 10px; font: 700 13px/1.3 var(--serif); letter-spacing: .1em;
  text-transform: uppercase; box-shadow: inset 0 0 0 1px var(--line); }
.y-state > div > small { display: block; font: italic 500 13px var(--serif); letter-spacing: 0; text-transform: none; color: var(--faint); }
.y-state > .busy { background: var(--gilt); box-shadow: inset 0 0 0 1px var(--ink); }

.y-sheet { padding: 12px 18px 62px; display: flex; flex-direction: column; gap: 10px; }
.y-tabs { position: absolute; left: 18px; bottom: 10px; }
.y-types { display: grid; grid-template-columns: repeat(6, 1fr); gap: 8px; }
.y-type { display: flex; flex-direction: column; align-items: center; gap: 5px; padding: 8px 10px 10px; ${cut('light')} }
.y-type.chosen { ${cut('gilt')} }
.y-type > b { font: 700 14px/1.1 var(--serif); letter-spacing: .12em; text-transform: uppercase; }
.y-type > small { font-size: 13px; font-style: italic; color: var(--faint); }
.y-type > .k-meter { align-self: stretch; height: 8px; }
.y-board { flex: 1; min-height: 0; display: grid; grid-template-columns: 1fr 330px; gap: 10px; }
.y-board .k-body { gap: 8px; }
.y-slots { flex: 1; min-height: 0; display: grid; grid-auto-flow: column; grid-auto-columns: 1fr; gap: 8px; }
.y-slot { display: flex; flex-direction: column; gap: 6px; min-height: 0; padding: 8px; box-shadow: inset 0 0 0 1px var(--line); }
.y-slot > header { display: flex; justify-content: space-between; align-items: center; gap: 8px; font-style: italic; color: var(--faint); }
.y-slot > header > .k-btn { height: 36px; padding: 0 12px; }
.y-cards { display: flex; flex-direction: column; gap: 6px; overflow-y: auto; min-height: 0; padding: 3px; }
.y-card { display: flex; flex-direction: column; gap: 2px; padding: 8px 10px; ${cut('light')} }
.y-card > b { font-weight: 700; }
.y-card > small { color: var(--faint); font-size: 13px; font-style: italic; }
.y-card.picked { ${cut('gilt')} }
.y-none { flex: 1; display: grid; place-items: center; text-align: center; font-style: italic; color: var(--faint); }
.y-fig { display: grid; grid-template-columns: 1fr auto; align-items: baseline; gap: 2px 8px; padding: 2px 2px 0; }
.y-fig > b { font: italic 500 22px/1 var(--serif); font-variant-numeric: oldstyle-nums; }
.y-fig > .k-meter { grid-column: 1 / 3; height: 9px; }

.y-ships { flex: 1; min-height: 0; display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; }
.y-ship > .k-body { display: grid; grid-template-columns: 1fr 84px 1fr; align-items: center; gap: 2px; padding: 4px 7px 10px; }
.y-ship > .k-body > svg { justify-self: center; }
.y-ship > .k-head { padding: 12px 8px 2px; }
.y-ship > .k-head > small { display: block; margin-top: 3px; font: italic 500 13px var(--serif); letter-spacing: 0; text-transform: none;
  color: var(--faint); }
.y-side { align-self: stretch; display: flex; flex-direction: column; justify-content: space-around; gap: 6px; }
.y-part { display: grid; grid-template-columns: 20px 1fr; align-items: center; gap: 3px 4px; padding: 7px 6px 8px; ${cut('light')} }
.y-part > small { font-size: 13px; font-style: italic; color: var(--faint); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.y-part > b { grid-column: 1 / 3; font: italic 500 24px/1 var(--serif); font-variant-numeric: oldstyle-nums; text-align: center; }
.y-part > .k-meter { grid-column: 1 / 3; height: 6px; }
.y-part.none { opacity: .5; }
.y-spares { flex: none; height: 196px; }
.y-spares > .k-body { display: flex; flex-direction: row; gap: 10px; overflow-x: auto; align-items: flex-start; }
.y-spare { flex: none; width: 150px; display: flex; flex-direction: column; gap: 6px; }
.y-fit { display: grid; grid-template-columns: repeat(4, 1fr); gap: 4px; }
.y-fit > .k-btn { height: 36px; min-width: 0; padding: 0; }
`;

type Works = HqPaper['buildings'][number];
/** A part's type, as the ship's paper names it. */
type PartType = ShipPaper['types'][number]['id'];

/** A building's levels, a pip each, the ones it has filled. */
const pips = (b: Works) =>
  el(
    'div',
    'h-level',
    ...Array.from({ length: b.top }, (_, i) => el('i', i < b.level ? 'on' : ''))
  );

/** A building's woodcut, `k` times its box. */
function cutOf(id: Building, k: number) {
  const svg = drawn(BOX.w, BOX.h, woodcut(id));
  svg.setAttribute('width', String(BOX.w * k));
  svg.setAttribute('height', String(BOX.h * k));
  return svg;
}

/** The headquarters. */
export function createHq(office: Office): Screen<HqPaper> {
  stylesheet(CSS);
  bitsStyle();
  const root = el('div', 's-hq');
  /** The building whose card is open. */
  let chosen: Building | null = null;

  const site = (b: Works) => {
    const [x, y] = SITES[b.id];
    return styled(
      pressed(
        el(
          'div',
          `q-site${b.id === chosen ? ' chosen' : ''}`,
          cutOf(b.id, SITE.k),
          el(
            'div',
            'q-label',
            el('b', '', b.name),
            b.under ? el('i', 'q-works') : pips(b)
          )
        ),
        () => {
          chosen = chosen === b.id ? null : b.id;
          office.draw();
        }
      ),
      { left: `${x}px`, top: `${y - BOX.h * SITE.k * 0.875}px` }
    );
  };

  const card = (b: Works) => {
    const sheet = panel(
      b.name,
      [
        el('div', 'q-pic', cutOf(b.id, 2.2), pips(b)),
        lines([
          ['Level', `${b.level} of ${b.top}`],
          ['Cost per Race', money(b.upkeep)],
        ]),
        el('p', 'q-about', b.about),
        ...(b.under
          ? [
              band('The Works'),
              job(
                { mark: null, name: `Level ${b.level + 1}` },
                b.under.done,
                `${b.under.days} Days`,
                []
              ),
            ]
          : b.level < b.top
            ? [
                band(`To Level ${b.level + 1}`),
                lines([
                  ['Build Time', `${b.days} Days`],
                  ['Cost', money(b.cost)],
                ]),
                acted(
                  'Upgrade',
                  b.build,
                  () =>
                    office.ask({
                      kind: 'send',
                      command: { kind: 'Build', building: b.id },
                    }),
                  'on'
                ),
              ]
            : [el('div', 'q-top', 'At its highest level')]),
      ],
      pressed(el('div', 'k-mark', icon('close', 18)), () => {
        chosen = null;
        office.draw();
      })
    );
    sheet.classList.add('q-card');
    return sheet;
  };

  return {
    el: root,
    show(v) {
      const open = v.buildings.find((b) => b.id === chosen);
      const sheet = el(
        'section',
        'k-panel q-sheet',
        el(
          'div',
          'q-chart',
          drawn(CHART.w, CHART.h, harbour()),
          ...v.buildings.map(site),
          open && card(open)
        )
      );
      const stats = panel('Headquarters Stats', [
        bars(v.stats, 'Best in Championship', 'Average Team'),
      ]);
      stats.classList.add('q-stats');
      const know = panel(
        'Part Knowledge',
        v.knowledge.map((k, i) =>
          el(
            'div',
            'q-part',
            icon(TYPE_ICONS[i] ?? 'ship', 24),
            el('span', '', k.part),
            el('small', '', `${k.known} of ${k.of}`),
            meter(k.of > 0 ? k.known / k.of : 0, 'fair')
          )
        )
      );
      know.classList.add('q-know');
      root.replaceChildren(sheet, el('div', 'q-side', stats, know));
    },
  };
}

/** The six parts' pictograms, in the order the career lists them. */
const TYPE_ICONS = [
  'sails',
  'rigging',
  'rudder',
  'hull',
  'keel',
  'mounts',
] as const;
/** A part type's pictogram (the ship's own where it is none of the six). */
const mark = (type: PartType, size: number) =>
  icon(TYPE_ICONS.find((t) => t === type) ?? 'ship', size);

/** What the Ship tab shows: her ship and what is done to her, the drawing board, or the fitting. */
type Mode = 'ship' | 'design' | 'fit';

/** The ship. */
export function createShip(office: Office): Screen<ShipPaper> {
  stylesheet(CSS);
  bitsStyle();
  const root = el('div', 's-ship');
  let mode: Mode = 'ship';
  const to = (next: Mode) => () => {
    mode = next;
    office.draw();
  };
  /** The three sheets' tabs, at the foot as the nav's are. */
  const tabs = () => {
    const made = segmented<Mode>(
      [
        { id: 'ship', label: 'Ship' },
        { id: 'design', label: 'Design New Parts' },
        { id: 'fit', label: 'Fit Parts' },
      ],
      mode,
      (id) => to(id)()
    );
    made.classList.add('y-tabs');
    return made;
  };
  /** A share of the improvement's work as its card says it. */
  const share = (of: number) =>
    of > 0 ? `${Math.round(of * 100)}% of the Work` : 'Idle';

  /** A part as a tile shows it: what it is, its performance, how worn. */
  const tile = (type: PartType, label: string, p: PartLine | undefined) =>
    el(
      'div',
      `y-part${p ? '' : ' none'}`,
      mark(type, 20),
      el('small', '', label),
      el('b', '', p ? Math.round(p.perf) : '–'),
      meter(p?.condition ?? 0, p && p.condition < 0.5 ? 'bad' : 'good')
    );

  /** Her ship, live, and what is done to her. */
  function overview(v: ShipPaper) {
    const spares = v.parts.filter((p) => p.ship === null).length;
    const stats = panel('Ship Stats', [
      bars(
        v.stats.map((s) => (s.name === 'Rigging' ? { ...s, name: 'Rig' } : s)),
        'Best in Championship',
        'Average on Grid'
      ),
      band('Suppliers'),
      lines(v.suppliers.map((s) => [s.trade, s.name ?? 'None'] as const)),
    ]);
    stats.classList.add('y-stats');
    const doing = (
      title: string,
      what: string,
      state: readonly (readonly [string, string | null, boolean])[],
      way: HTMLElement | null
    ) => {
      const made = panel(title, [
        el('p', '', what),
        el(
          'div',
          'y-state',
          ...state.map(([word, under, busy]) =>
            el('div', busy ? 'busy' : '', word, under && el('small', '', under))
          )
        ),
        way,
      ]);
      made.classList.add('y-do');
      return made;
    };
    return [
      el('div', 'o-window'),
      stats,
      el(
        'div',
        'y-doing',
        doing(
          'Design New Part',
          'Design new parts for your ships.',
          [
            v.design
              ? [v.design.name, `${v.design.days} Days Left`, true]
              : ['No Work in Progress', null, false],
          ],
          button('Design New Part', to('design'), { wide: true })
        ),
        doing(
          'Fit Parts',
          'Choose the parts fitted to each ship.',
          [
            spares > 0
              ? [
                  `${spares} Spare ${spares === 1 ? 'Part' : 'Parts'}`,
                  null,
                  true,
                ]
              : ['No New Parts', null, false],
          ],
          button('Fit Parts', to('fit'), { wide: true })
        ),
        doing(
          'Improve Parts',
          'The factory and the mechanics work the parts up between races.',
          [
            ['Performance', share(v.improving.perf), v.improving.perf > 0],
            [
              'Reliability',
              share(v.improving.reliability),
              v.improving.reliability > 0,
            ],
          ],
          null
        )
      ),
    ];
  }

  /** The drawing board: the part chosen, its slots' cards, and what it would be. */
  function design(v: ShipPaper) {
    const d = v.draft;
    const types = el(
      'div',
      'y-types',
      ...v.types.map((t, i) => {
        const stat = v.stats[i + 1];
        return pressed(
          el(
            'div',
            `y-type${t.id === d.type ? ' chosen' : ''}`,
            mark(t.id, 40),
            el('b', '', t.label),
            el('small', '', 'Fitted, against the best'),
            meter(stat ? stat.value / Math.max(1e-9, stat.best) : 0, 'fair')
          ),
          () => office.ask({ kind: 'design', type: t.id })
        );
      })
    );
    const name = v.types.find((t) => t.id === d.type)?.label ?? '';
    const slots = v.design
      ? el(
          'div',
          'y-none',
          `The drawing loft is at work on the ${v.design.name.toLowerCase()}. One part is designed at a time.`
        )
      : el(
          'div',
          'y-slots',
          ...d.slots.map((s, slot) =>
            el(
              'div',
              'y-slot',
              el(
                'header',
                '',
                `Component ${slot + 1}`,
                button(
                  s.cards.length > 0 ? 'Redeal' : 'Deal',
                  () =>
                    office.ask({
                      kind: 'send',
                      command: { kind: 'DealComponents', type: d.type, slot },
                    }),
                  { kind: 'plain', off: !s.deal.ok }
                )
              ),
              s.cards.length > 0
                ? el(
                    'div',
                    'y-cards',
                    ...s.cards.map((c) =>
                      pressed(
                        el(
                          'div',
                          `y-card${c.id === s.picked ? ' picked' : ''}`,
                          el('b', '', c.name),
                          el('small', '', c.effect)
                        ),
                        () => office.ask({ kind: 'card', slot, card: c.id })
                      )
                    )
                  )
                : el(
                    'div',
                    'y-none',
                    !s.deal.ok && s.deal.why !== ''
                      ? s.deal.why
                      : 'Deal this slot its components, and pick one.'
                  )
            )
          )
        );
    const sum = v.design
      ? [
          job(
            { mark: mark(d.type, 20), name: v.design.name },
            v.design.done,
            `${v.design.days} Days`,
            []
          ),
        ]
      : [
          el(
            'div',
            'y-fig',
            'Performance',
            el('b', '', `${d.perf} / ${d.perfMax}`),
            meter(d.perfMax > 0 ? d.perf / d.perfMax : 0, 'go')
          ),
          el(
            'div',
            'y-fig',
            'Reliability',
            el('b', '', `${Math.round(d.reliability * 100)}%`),
            meter(d.reliability, d.reliability < 0.5 ? 'bad' : 'good')
          ),
          lines([
            ['Time', `${d.days} Days`],
            ['Cost', money(d.cost)],
          ]),
          el('div', 'y-none'),
          acted(
            'Start Design',
            d.start,
            () =>
              office.ask({
                kind: 'send',
                command: {
                  kind: 'StartDesign',
                  type: d.type,
                  components: d.slots.flatMap((s) =>
                    s.picked ? [s.picked] : []
                  ),
                  forNext: false,
                },
              }),
            'on'
          ),
        ];
    return [
      panel('Choose a Part to Design', [types]),
      el(
        'div',
        'y-board',
        panel(`${name}: Components`, [slots]),
        panel(v.design ? 'In the Drawing Loft' : `New ${name}`, sum)
      ),
      tabs(),
    ];
  }

  /** The fitting: each ship's plan with her parts round it, and the spares. */
  function fitting(v: ShipPaper) {
    const spares = v.parts.filter((p) => p.ship === null);
    const half = Math.ceil(v.types.length / 2);
    const ship = (h: ShipPaper['ships'][number], i: number) => {
      const side = (types: ShipPaper['types']) =>
        el(
          'div',
          'y-side',
          ...types.map((t) =>
            tile(
              t.id,
              t.label,
              v.parts.find((p) => p.type === t.id && p.ship === i)
            )
          )
        );
      const sketch = drawn(84, 92, plan());
      sketch.setAttribute('width', '84');
      sketch.setAttribute('height', '92');
      const made = el(
        'section',
        'k-panel y-ship',
        el('header', 'k-head', h.name, el('small', '', h.driver)),
        el(
          'div',
          'k-body',
          side(v.types.slice(0, half)),
          sketch,
          side(v.types.slice(half))
        )
      );
      return made;
    };
    const spare = (p: PartLine) =>
      el(
        'div',
        'y-spare',
        tile(p.type, `${p.name} · ${Math.round(p.reliability * 100)}%`, p),
        el(
          'div',
          'y-fit',
          ...v.ships.map((_, i) =>
            button(
              String(i + 1),
              () =>
                office.ask({
                  kind: 'send',
                  // (a team has four ships: the index is one of them)
                  command: { kind: 'FitPart', part: p.id, ship: SHIPS[i] ?? 0 },
                }),
              { kind: 'plain' }
            )
          )
        )
      );
    const kept = panel(
      'Spare Parts',
      spares.length > 0
        ? spares.map(spare)
        : [
            el(
              'div',
              'y-none',
              'No spare parts. A part once designed and built waits here to be fitted to a ship.'
            ),
          ]
    );
    kept.classList.add('y-spares');
    return [el('div', 'y-ships', ...v.ships.map(ship)), kept, tabs()];
  }

  return {
    el: root,
    show(v) {
      root.className = mode === 'ship' ? 's-ship' : 's-ship y-sheet';
      root.replaceChildren(
        ...(mode === 'ship'
          ? overview(v)
          : mode === 'design'
            ? design(v)
            : fitting(v))
      );
    },
  };
}

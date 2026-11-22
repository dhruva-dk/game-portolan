// What the team builds, laid out as the manager's game it follows lays them.
//
// Headquarters: the harbour itself, live, through the page: the camera stands
// out over the water before it (play/anchorage.ts), and each of the nine
// buildings carries its name and level over its head, pinned to it as it is
// drawn; one tapped opens its card at the left (what it is for, what it costs
// a race, the next level's cost and days, and the way to build it, or how far
// the works have got). At the right the headquarters' stats against the
// championship, and what her designer knows of each part's components.
//
// Ship: her ship herself, live, through the page; beside her the ships' stats
// against the championship and who supplies them; along the foot the three
// things done to a ship, each a card with how it stands and the way to it.
// Design New Part: the six parts to choose from, the drawing board's slots
// (each slot's cards dealt and one picked) and what the part would be and
// cost. Fit Parts: each ship's six parts, a tile each, and the spares, each
// fitted to a ship by a tap.

import { SHIPS, type Building } from '../../office/command.ts';
import type { HqPaper, PartLine, ShipPaper } from '../../office/papers.ts';
import { button, segmented, stepper } from '../kit/button.ts';
import { bars } from '../kit/chart.ts';
import { icon } from '../kit/icons.ts';
import { band, panel } from '../kit/panel.ts';
import { el, pressed } from '../kit/part.ts';
import { job, meter } from '../kit/stat.ts';
import { cut, stylesheet } from '../kit/style.ts';
import { acted, bitsStyle, lines, money } from './bits.ts';
import type { Office } from './office.ts';
import type { Screen } from './screens.ts';

const CSS = `
.s-hq > .o-window { position: absolute; inset: 0; }
/* the harbour is drawn in the middle of what the panels leave of the page */
.q-subject { position: absolute; left: 0; right: 348px; top: 34px; bottom: 0; pointer-events: none; }
/* (a card open at the left: in what that leaves, smaller) */
.q-subject.carded { left: 316px; top: 120px; bottom: 40px; }
.q-site { position: absolute; left: 0; top: 0; width: 0; height: 0; visibility: hidden; }
.q-label { position: absolute; left: 0; bottom: 6px; transform: translateX(-50%); display: flex; flex-direction: column;
  align-items: center; gap: 3px; padding: 3px 9px 5px; ${cut('light')} white-space: nowrap; }
.q-label .h-level > i { width: 18px; height: 6px; }
.q-label::after { content: ''; position: absolute; left: 50%; bottom: -9px; width: 1.5px; height: 8px; background: var(--ink); }
.q-label > b { font: 700 13px/1.1 var(--serif); letter-spacing: .06em; text-transform: uppercase; }
.q-site.chosen > .q-label { ${cut('gilt')} }
.q-label > .q-works { width: 84px; height: 7px; background: var(--stripes); box-shadow: inset 0 0 0 .8px var(--ink); }
.h-level { display: flex; gap: 4px; justify-content: center; }
.h-level > i { width: 24px; height: 7px; background: var(--light); box-shadow: inset 0 0 0 1px var(--line); }
.h-level > i.on { background: var(--hatch), var(--go); box-shadow: inset 0 0 0 1px var(--ink); }
.q-card { position: absolute; left: 18px; top: 12px; width: 290px; }
.q-card > .k-body { gap: 8px; }
.q-card .k-head { padding-left: 16px; padding-right: 40px; }
.q-about { margin: 0; padding: 0 2px; line-height: 1.35; font-style: italic; }
.q-top { text-align: center; font: 700 14px var(--serif); letter-spacing: .12em; text-transform: uppercase; color: var(--good); }
.q-side { position: absolute; right: 18px; top: 12px; bottom: 12px; width: 330px; display: flex; flex-direction: column;
  gap: 10px; }
.q-side > .q-stats { flex: none; height: 318px; }
.q-side .k-names > div { font-weight: 500; letter-spacing: 0; }
.q-know { flex: 1; }
.q-know > .k-body { gap: 0; justify-content: space-around; }
.q-part { display: grid; grid-template-columns: 26px 1fr auto; align-items: center; gap: 8px; padding: 0 4px; }
.q-part > .k-meter { grid-column: 2 / 4; height: 7px; }
.q-part > span { font-weight: 700; }
.q-part > small { font-size: 13px; font-style: italic; color: var(--faint); }

.s-ship > .o-window { position: absolute; inset: 0; }
/* she is drawn in the middle of what the panels leave of the page */
.y-subject { position: absolute; left: 0; right: 400px; top: 0; bottom: 170px; pointer-events: none; }
.y-stats { position: absolute; right: 18px; top: 12px; width: 372px; height: 470px; }
.y-stats > .k-body { gap: 8px; }
.y-stats .k-names > div { font-weight: 500; letter-spacing: 0; }
.y-doing { position: absolute; left: 18px; right: 18px; bottom: 10px; display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
.y-do > .k-body { gap: 7px; padding-top: 0; align-items: center; text-align: center; }
.y-do .k-head { padding-bottom: 4px; }
.y-do p { margin: 0; font-style: italic; color: var(--faint); }
.y-do .k-btn { align-self: stretch; margin-top: auto; }
.y-state { align-self: stretch; display: flex; gap: 6px; justify-content: center; }
.y-state > div { flex: 1; max-width: 220px; padding: 4px 10px; font: 700 13px/1.3 var(--serif); letter-spacing: .1em;
  text-transform: uppercase; box-shadow: inset 0 0 0 1px var(--line); }
.y-state > div > small { display: block; font: italic 500 13px var(--serif); letter-spacing: 0; text-transform: none; color: var(--faint); }
.y-state > .busy { background: var(--gilt); box-shadow: inset 0 0 0 1px var(--ink); }

.y-sheet { padding: 12px 18px 62px; display: flex; flex-direction: column; gap: 10px; }
.y-tabs { position: absolute; left: 18px; bottom: 10px; }
/* choosing the part: she stands above with the stats, the six parts a card each beneath */
.y-subject.above { bottom: 340px; }
.y-stats.above { height: 352px; }
.y-choose { position: absolute; left: 18px; right: 18px; bottom: 62px; height: 272px; }
.y-choose > .k-body { gap: 8px; }
.y-types { flex: 1; display: grid; grid-template-columns: repeat(6, 1fr); gap: 8px; }
.y-type { display: flex; flex-direction: column; align-items: center; justify-content: space-between; gap: 4px;
  padding: 8px 10px 10px; ${cut('light')} }
.y-type > b { font: 700 15px/1.1 var(--serif); letter-spacing: .12em; text-transform: uppercase; }
.y-type > small { font-size: 13px; font-style: italic; color: var(--faint); }
.y-type > .y-fig { align-self: stretch; font-size: 13px; }
.y-type > .y-fig > b { font-size: 18px; }
.y-type > .y-fig > .k-meter { height: 7px; }
.y-board { flex: 1; min-height: 0; display: grid; grid-template-columns: 1fr 330px; gap: 10px; }
.y-board .k-body { gap: 8px; }
/* the board's head: how many slots are filled, the part, and what the cards beneath are */
.y-top { display: flex; align-items: center; gap: 16px; padding: 2px 6px 8px; box-shadow: 0 1px 0 var(--line); }
.y-top > div { display: flex; flex-direction: column; }
.y-top > div > b { font: 700 17px/1.2 var(--serif); letter-spacing: .12em; text-transform: uppercase; }
.y-top > div > small { font-size: 13px; font-style: italic; color: var(--faint); }
.y-top > .y-count { align-items: center; padding-right: 16px; box-shadow: 1px 0 0 var(--line); }
.y-top > .y-count > b { font: italic 500 30px/1 var(--serif); letter-spacing: 0; font-variant-numeric: oldstyle-nums; }
.y-slots { flex: 1; min-height: 0; display: flex; flex-direction: column; gap: 8px; }
.y-slot { flex: 1; min-height: 0; max-height: 170px; display: grid; grid-template-columns: 118px 1fr; gap: 8px; padding: 8px;
  box-shadow: inset 0 0 0 1px var(--line); }
.y-slot > header { display: flex; flex-direction: column; justify-content: center; align-items: stretch; gap: 6px; text-align: center;
  font: 700 14px/1.1 var(--serif); letter-spacing: .12em; text-transform: uppercase; }
.y-slot > header > .k-btn { height: 36px; padding: 0 12px; }
.y-cards { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; min-height: 0; }
.y-card { display: flex; flex-direction: column; justify-content: center; gap: 2px; padding: 6px 12px; min-width: 0; ${cut('light')} }
.y-card > b { font-weight: 700; }
.y-card > small { color: var(--faint); font-size: 13px; font-style: italic; }
.y-card.picked { ${cut('gilt')} }
.y-none { flex: 1; display: grid; place-items: center; text-align: center; font-style: italic; color: var(--faint); }
.y-fig { display: grid; grid-template-columns: 1fr auto; align-items: baseline; gap: 2px 8px; padding: 2px 2px 0; }
.y-fig > b { font: italic 500 22px/1 var(--serif); font-variant-numeric: oldstyle-nums; }
.y-fig > .k-meter { grid-column: 1 / 3; height: 9px; }
/* the slots across the summary's head, each empty or holding the card picked */
.y-picks { display: grid; grid-auto-flow: column; grid-auto-columns: 1fr; gap: 5px; }
.y-pick { display: flex; flex-direction: column; align-items: center; gap: 2px; min-width: 0; padding: 6px 3px; text-align: center;
  font: 700 13px/1.15 var(--serif); box-shadow: inset 0 0 0 1px var(--line); color: var(--faint); }
.y-pick > small { font: italic 500 13px var(--serif); color: var(--faint); }
.y-pick.full { background: var(--gilt); box-shadow: inset 0 0 0 1px var(--ink); color: var(--ink); }
.y-new { align-self: center; display: flex; flex-direction: column; align-items: center; gap: 4px; padding: 8px 22px; ${cut('light')}
  font: 700 14px/1.1 var(--serif); letter-spacing: .12em; text-transform: uppercase; }

/* the improvement: the parts in a table at the left (as the game it follows has them), the two departments at the right */
.y-works { flex: 1; min-height: 0; display: grid; grid-template-columns: 1fr 420px; gap: 10px; }
.y-works .k-body { gap: 8px; min-height: 0; }
.y-works p { margin: 0; text-align: center; font-style: italic; color: var(--faint); }
.y-row { display: grid; grid-template-columns: 1fr 64px 84px 120px 76px 76px; align-items: center; gap: 8px; padding: 0 6px; }
.y-row.head { font-size: 13px; font-style: italic; color: var(--faint); text-align: center; line-height: 1.1; }
.y-list { flex: 1; min-height: 0; overflow-y: auto; display: flex; flex-direction: column; gap: 4px; }
.y-list > .y-row { flex: none; height: 44px; box-shadow: inset 0 0 0 1px var(--line); }
.y-list > .y-row.gap { margin-top: 6px; }
.y-row > .y-what { display: flex; align-items: center; gap: 8px; font-weight: 700; }
.y-row > span { text-align: center; }
.y-row.head > span:first-child { text-align: left; padding-left: 30px; }
.y-row > b { font: italic 500 19px/1 var(--serif); font-variant-numeric: oldstyle-nums; text-align: center; }
.y-row > b > small { font-size: 13px; color: var(--faint); }
.y-rel { display: grid; grid-template-columns: 40px 1fr; align-items: center; gap: 6px; font-variant-numeric: oldstyle-nums; }
.y-rel > .k-meter { height: 8px; }
.y-tog { height: 34px; display: grid; place-items: center; ${cut('light')} }
.y-tog.on { ${cut('gilt')} }
.y-tog.off { opacity: .35; pointer-events: none; }
.y-lean { display: flex; justify-content: center; }
.y-depts { flex: 1; min-height: 0; display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.y-dept { display: flex; flex-direction: column; gap: 6px; min-height: 0; padding: 8px; box-shadow: inset 0 0 0 1px var(--line); }
.y-dept > header { display: flex; flex-direction: column; align-items: center; gap: 2px; padding-bottom: 6px;
  box-shadow: 0 1px 0 var(--line); font: 700 14px/1.1 var(--serif); letter-spacing: .12em; text-transform: uppercase; }
.y-dept > header > b { font: italic 500 26px/1 var(--serif); letter-spacing: 0; font-variant-numeric: oldstyle-nums; }
.y-dept > header > small { font: italic 500 13px var(--serif); letter-spacing: 0; text-transform: none; color: var(--faint); }
.y-chosen { flex: 1; min-height: 0; overflow-y: auto; display: grid; grid-template-columns: 1fr 1fr; align-content: start; gap: 6px;
  padding: 3px; }
.y-acts { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }

/* the fitting: the ships side by side at the left, each her six parts; how they compare at the right */
.y-fitting { flex: 1; min-height: 0; display: grid; grid-template-columns: 1fr 300px; gap: 10px; }
.y-yard { display: flex; flex-direction: column; gap: 10px; min-height: 0; min-width: 0; }
.y-ships { flex: 1; min-height: 0; display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; }
.y-ship > .k-body { display: grid; grid-template-columns: 1fr 1fr; align-items: center; gap: 6px; padding: 4px 7px 8px; }
.y-ship > .k-head { padding: 12px 8px 2px; }
.y-ship > .k-head > small { display: block; margin-top: 3px; font: italic 500 13px var(--serif); letter-spacing: 0; text-transform: none;
  color: var(--faint); }
.y-side { align-self: stretch; display: flex; flex-direction: column; justify-content: space-around; gap: 6px; }
.y-compare > .k-body { gap: 6px; justify-content: space-between; }
.y-versus { display: grid; grid-template-columns: 24px 1fr; align-items: center; gap: 2px 8px; }
.y-versus > span { font-weight: 700; }
.y-versus > div { grid-column: 1 / 3; display: grid; grid-template-columns: 14px 1fr; align-items: center; gap: 2px 6px;
  font: italic 500 13px/1 var(--serif); color: var(--faint); }
.y-versus .k-meter { height: 6px; }
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

/** The headquarters. */
export function createHq(office: Office): Screen<HqPaper> {
  stylesheet(CSS);
  bitsStyle();
  const root = el('div', 's-hq');
  /** The building whose card is open. */
  let chosen: Building | null = null;

  /** A building's name and level, pinned over its head (the office moves it there: data-plot). */
  const site = (b: Works) => {
    const made = el(
      'div',
      `q-site${b.id === chosen ? ' chosen' : ''}`,
      pressed(
        el(
          'div',
          'q-label',
          el('b', '', b.name),
          b.under ? el('i', 'q-works') : pips(b)
        ),
        () => {
          chosen = chosen === b.id ? null : b.id;
          office.draw();
        }
      )
    );
    made.dataset.plot = b.id;
    return made;
  };

  const card = (b: Works) => {
    const sheet = panel(
      b.name,
      [
        pips(b),
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
        'div',
        'o-window',
        el('div', `o-subject q-subject${open ? ' carded' : ''}`),
        ...v.buildings.map(site)
      );
      sheet.dataset.scene = 'harbour';
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
      root.replaceChildren(
        sheet,
        ...(open ? [card(open)] : []),
        el('div', 'q-side', stats, know)
      );
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

/** The ships' stats against the championship, as a chart. */
const rated = (v: ShipPaper) =>
  bars(
    v.stats.map((s) => (s.name === 'Rigging' ? { ...s, name: 'Rig' } : s)),
    'Best in Championship',
    'Average on Grid'
  );
/** The improvement's table narrowed to a ship, by her index. */
const LISTED: readonly Listed[] = ['0', '1', '2', '3'];

/** What the Ship tab shows: her ship and what is done to her, the drawing board, the fitting, or the improvement. */
type Mode = 'ship' | 'design' | 'fit' | 'improve';
/** Which of the fitted parts the improvement's table lists: all of them, or one ship's. */
type Listed = 'all' | '0' | '1' | '2' | '3';
/** What the fitting compares the ships by. */
type Versus = 'perf' | 'reliability';

/** The ship. */
export function createShip(office: Office): Screen<ShipPaper> {
  stylesheet(CSS);
  bitsStyle();
  const root = el('div', 's-ship');
  let mode: Mode = 'ship';
  /** Whether the drawing board is open on the part chosen (else the six parts to choose from). */
  let board = false;
  let listed: Listed = 'all';
  let versus: Versus = 'perf';
  /** The share of the improvement's work that goes to performance where both departments have parts. */
  let lean = 0.5;
  const to = (next: Mode) => () => {
    mode = next;
    board = false;
    office.draw();
  };
  /** The sheets' tabs, at the foot as the nav's are. */
  const tabs = () => {
    const made = segmented<Mode>(
      [
        { id: 'ship', label: 'Ship' },
        { id: 'design', label: 'Design New Parts' },
        { id: 'fit', label: 'Fit Parts' },
        { id: 'improve', label: 'Improve Parts' },
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
      rated(v),
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
      el('div', 'o-window', el('div', 'o-subject y-subject')),
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
          'Improve the performance or reliability of your parts.',
          [
            ['Performance', share(v.improving.perf), v.improving.perf > 0],
            [
              'Reliability',
              share(v.improving.reliability),
              v.improving.reliability > 0,
            ],
          ],
          button('Improve Parts', to('improve'), { wide: true })
        )
      ),
    ];
  }

  /** A figure of a part with its meter under it. */
  const figure = (name: string, value: string, of: number, bad = false) =>
    el(
      'div',
      'y-fig',
      name,
      el('b', '', value),
      meter(of, bad ? 'bad' : name === 'Performance' ? 'go' : 'good')
    );

  /** The part to design chosen: her ship and the stats above, the six parts a card each (or the design under way). */
  function choosing(v: ShipPaper) {
    const stats = panel('Ship Stats', [rated(v)]);
    stats.classList.add('y-stats', 'above');
    const card = (t: ShipPaper['types'][number]) => {
      // (the best of the team's parts of the type, fitted or spare)
      const top = v.parts
        .filter((p) => p.type === t.id)
        .reduce<PartLine | null>(
          (a, p) => (a && a.perf >= p.perf ? a : p),
          null
        );
      return pressed(
        el(
          'div',
          'y-type',
          el('b', '', t.label),
          mark(t.id, 36),
          el('small', '', 'Current Best Part'),
          figure(
            'Performance',
            top ? `${Math.round(top.perf)} / ${Math.round(top.perfMax)}` : '–',
            top ? top.perf / Math.max(1, top.perfMax) : 0
          ),
          figure(
            'Reliability',
            top ? `${Math.round(top.reliability * 100)}%` : '–',
            top?.reliability ?? 0,
            (top?.reliability ?? 1) < 0.5
          )
        ),
        () => {
          board = true;
          office.ask({ kind: 'design', type: t.id });
        }
      );
    };
    const choose = v.design
      ? panel('In the Drawing Loft', [
          job(
            { mark: null, name: v.design.name },
            v.design.done,
            `${v.design.days} Days`,
            []
          ),
          el(
            'div',
            'y-none',
            `The drawing loft is at work on the ${v.design.name.toLowerCase()}. One part is designed at a time.`
          ),
        ])
      : panel('Choose a Part to Design', [
          el('div', 'y-types', ...v.types.map(card)),
        ]);
    choose.classList.add('y-choose');
    return [
      el('div', 'o-window', el('div', 'o-subject y-subject above')),
      stats,
      choose,
      tabs(),
    ];
  }

  /** The drawing board: the part's slots, each one's cards dealt and one picked, and what the part would be. */
  function design(v: ShipPaper) {
    const d = v.draft;
    const name = v.types.find((t) => t.id === d.type)?.label ?? '';
    const top = el(
      'div',
      'y-top',
      el(
        'div',
        'y-count',
        el(
          'b',
          '',
          `${d.slots.filter((s) => s.picked).length}/${d.slots.length}`
        ),
        el('small', '', 'Slots Filled')
      ),
      mark(d.type, 44),
      el(
        'div',
        '',
        el('b', '', `${name} Part Design`),
        el('small', '', 'Available Components')
      )
    );
    const slots = el(
      'div',
      'y-slots',
      ...d.slots.map((s, slot) =>
        el(
          'div',
          'y-slot',
          el(
            'header',
            '',
            `Slot ${slot + 1}`,
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
    const sum = [
      el(
        'div',
        'y-picks',
        ...d.slots.map((s, slot) => {
          const c = s.cards.find((x) => x.id === s.picked);
          return el(
            'div',
            `y-pick${c ? ' full' : ''}`,
            el('small', '', `Slot ${slot + 1}`),
            c ? c.name : 'Empty'
          );
        })
      ),
      el('div', 'y-new', mark(d.type, 40), name),
      figure(
        'Performance',
        `${d.perf} / ${d.perfMax}`,
        d.perfMax > 0 ? d.perf / d.perfMax : 0
      ),
      figure(
        'Reliability',
        `${Math.round(d.reliability * 100)}%`,
        d.reliability,
        d.reliability < 0.5
      ),
      el('div', 'y-none'),
      lines([
        ['Build Time', `${d.days} Days`],
        ['Cost', money(d.cost)],
      ]),
      acted(
        'Build Part',
        d.start,
        () =>
          office.ask({
            kind: 'send',
            command: {
              kind: 'StartDesign',
              type: d.type,
              components: d.slots.flatMap((s) => (s.picked ? [s.picked] : [])),
              forNext: false,
            },
          }),
        'on'
      ),
      button(
        'Cancel',
        () => {
          board = false;
          office.draw();
        },
        { kind: 'plain', wide: true }
      ),
    ];
    return [
      el(
        'div',
        'y-board',
        panel(null, [top, slots]),
        panel(`New ${name}`, sum)
      ),
      tabs(),
    ];
  }

  /** The improvement: the fitted parts in a table, each put to either department by a tap, and the two departments. */
  function improve(v: ShipPaper) {
    const on = v.types.flatMap((t) =>
      v.parts.filter((p) => p.type === t.id && p.ship !== null)
    );
    const able = on.filter((p) => !p.spec);
    const worked = (by: Versus) =>
      able
        .filter((p) =>
          v.improving.shares.some((s) => s.part === p.id && s[by] > 0)
        )
        .map((p) => p.id);
    const perf = worked('perf'),
      rel = worked('reliability');
    const both = v.improving.perf + v.improving.reliability;
    if (v.improving.perf > 0 && v.improving.reliability > 0)
      lean = v.improving.perf / both;
    /** The split asked of the career: each department's share dealt evenly among its parts (one alone has all the work). */
    const split = (p: readonly number[], r: readonly number[]) => {
      const toPerf = p.length === 0 ? 0 : r.length === 0 ? 1 : lean;
      const toRel = r.length === 0 ? 0 : p.length === 0 ? 1 : 1 - lean;
      office.ask({
        kind: 'send',
        command: {
          kind: 'SetImprovement',
          shares: able
            .filter((x) => p.includes(x.id) || r.includes(x.id))
            .map((x) => ({
              part: x.id,
              perf: p.includes(x.id) ? toPerf / p.length : 0,
              reliability: r.includes(x.id) ? toRel / r.length : 0,
            })),
        },
      });
    };
    const flip = (ids: readonly number[], id: number) =>
      ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id];
    const shipOf = (p: PartLine) =>
      p.ship === null ? '' : (v.ships[p.ship]?.name ?? '');
    const toggle = (p: PartLine, by: Versus) => {
      const ids = by === 'perf' ? perf : rel;
      return pressed(
        el(
          'div',
          `y-tog${ids.includes(p.id) ? ' on' : ''}${p.spec ? ' off' : ''}`,
          icon(by === 'perf' ? 'up' : 'cog', 20)
        ),
        () =>
          by === 'perf'
            ? split(flip(perf, p.id), rel)
            : split(perf, flip(rel, p.id))
      );
    };
    const shown = on.filter(
      (p) => listed === 'all' || (p.ship !== null && LISTED[p.ship] === listed)
    );
    const parts = panel('Parts', [
      el('p', '', 'Select the parts you want to improve.'),
      segmented<Listed>(
        [
          { id: 'all', label: 'Parts List' },
          ...LISTED.slice(0, v.ships.length).map((id, i) => ({
            id,
            label: v.ships[i]?.name ?? '',
          })),
        ],
        listed,
        (id) => {
          listed = id;
          office.draw();
        },
        true
      ),
      el(
        'div',
        'y-row head',
        el('span', '', 'Parts'),
        el('span', '', 'Ship'),
        el('span', '', 'Performance'),
        el('span', '', 'Reliability'),
        el('span', '', 'Improve Performance'),
        el('span', '', 'Improve Reliability')
      ),
      el(
        'div',
        'y-list',
        ...shown.map((p, i) =>
          el(
            'div',
            `y-row${i > 0 && shown[i - 1]?.type !== p.type ? ' gap' : ''}`,
            el('div', 'y-what', mark(p.type, 22), p.name),
            el('span', '', shipOf(p)),
            el(
              'b',
              '',
              Math.round(p.perf),
              el('small', '', ` (${Math.round(p.perfMax)})`)
            ),
            el(
              'div',
              'y-rel',
              `${Math.round(p.reliability * 100)}%`,
              meter(p.reliability, p.reliability < 0.5 ? 'bad' : 'good')
            ),
            toggle(p, 'perf'),
            toggle(p, 'reliability')
          )
        )
      ),
    ]);
    const dept = (name: string, ids: readonly number[], of: number) =>
      el(
        'div',
        'y-dept',
        el(
          'header',
          '',
          el('b', '', `${Math.round(of * 100)}%`),
          name,
          el(
            'small',
            '',
            `${ids.length} ${ids.length === 1 ? 'Part' : 'Parts'}`
          )
        ),
        ids.length > 0
          ? el(
              'div',
              'y-chosen',
              ...able
                .filter((p) => ids.includes(p.id))
                .map((p) => tile(p.type, shipOf(p), p))
            )
          : el('div', 'y-none', 'No part chosen.')
      );
    const tenths = Math.round(lean * 10);
    const depts = panel('Improvement Departments', [
      el('p', '', 'Share the work between the two departments.'),
      el(
        'div',
        'y-lean',
        stepper(
          `${tenths * 10}% Performance · ${100 - tenths * 10}% Reliability`,
          (by) => {
            lean = (tenths + by) / 10;
            split(perf, rel);
          },
          { least: tenths <= 1, most: tenths >= 9 }
        )
      ),
      el(
        'div',
        'y-depts',
        dept('Performance', perf, v.improving.perf),
        dept('Reliability', rel, v.improving.reliability)
      ),
      el(
        'div',
        'y-acts',
        button('Clear', () => split([], []), { kind: 'plain' }),
        button(
          'Auto Fill',
          () => {
            const all = able.map((p) => p.id);
            split(all, all);
          },
          { kind: 'plain' }
        )
      ),
    ]);
    return [el('div', 'y-works', parts, depts), tabs()];
  }

  /** The fitting: each ship's six parts, and the spares. */
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
      const made = el(
        'section',
        'k-panel y-ship',
        el('header', 'k-head', h.name, el('small', '', h.driver)),
        el(
          'div',
          'k-body',
          side(v.types.slice(0, half)),
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
    // (one scale for every part, so the ships' meters compare)
    const most = Math.max(1, ...v.parts.map((p) => p.perfMax));
    const compare = panel(
      versus === 'perf' ? 'Ship Performance' : 'Ship Reliability',
      [
        segmented<Versus>(
          [
            { id: 'perf', label: 'Performance' },
            { id: 'reliability', label: 'Reliability' },
          ],
          versus,
          (id) => {
            versus = id;
            office.draw();
          },
          true
        ),
        ...v.types.map((t) =>
          el(
            'div',
            'y-versus',
            mark(t.id, 20),
            el('span', '', t.label),
            ...v.ships.map((_, i) => {
              const p = v.parts.find((x) => x.type === t.id && x.ship === i);
              return el(
                'div',
                '',
                String(i + 1),
                versus === 'perf'
                  ? meter(p ? p.perf / most : 0, 'go')
                  : meter(p?.reliability ?? 0, 'good')
              );
            })
          )
        ),
      ]
    );
    compare.classList.add('y-compare');
    return [
      el(
        'div',
        'y-fitting',
        el('div', 'y-yard', el('div', 'y-ships', ...v.ships.map(ship)), kept),
        compare
      ),
      tabs(),
    ];
  }

  return {
    el: root,
    show(v) {
      // (a design under way, or no part chosen yet: the six parts to choose from, her ship above them)
      const open = mode === 'design' && board && !v.design;
      const live = mode === 'ship' || (mode === 'design' && !open);
      root.className = live ? 's-ship' : 's-ship y-sheet';
      root.replaceChildren(
        ...(mode === 'ship'
          ? overview(v)
          : mode === 'fit'
            ? fitting(v)
            : mode === 'improve'
              ? improve(v)
              : open
                ? design(v)
                : choosing(v))
      );
    },
  };
}

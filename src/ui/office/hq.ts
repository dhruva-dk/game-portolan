// The headquarters on the chartroom kit, after MM's: the campus itself, live,
// through a window framed in brass (the office stands the camera over the
// harbour: office.ts data-scene), dragged to pan across it, gliding in to the
// building chosen (data-focus). Over each of the
// nine buildings its nameplate and its levels, pinned to it as it is drawn,
// and a tap anywhere on the building (its pin runs from the plate to its
// foot) opens its sheet at the right: what it is for, what it gives now and at
// its next level, what it costs a race, and the way to build it (what it
// costs, how long, what it needs first, or why not), or how far the works have
// got. With none chosen the right holds the campus against the championship,
// and every building and its level (each a way to its sheet).

import type { HqPaper } from '../../office/papers.ts';
import type { Building } from '../../office/command.ts';
import { button, link } from '../chartroom/controls.ts';
import { busy, compared, gauge, terms } from '../chartroom/data.ts';
import { label } from '../chartroom/figures.ts';
import { kitLooks } from '../chartroom/kit.ts';
import { column, page } from '../chartroom/layout.ts';
import { plate, sheet } from '../chartroom/paper.ts';
import { el, grouped, pressed } from '../kit/part.ts';
import { stylesheet } from '../kit/style.ts';
import type { Office } from './office.ts';
import type { Screen } from './screens.ts';

/** A building as the paper has it. */
type Works = HqPaper['buildings'][number];

const CSS = `
.s-hq .cr-window { overflow: hidden; cursor: grab; }
.hq-pin { position: absolute; left: 0; top: 0; width: 0; height: 0; visibility: hidden;
  /* set on each by the office as it is drawn (office.ts plots): its foot's drop under the pin, a metre across it */
  --drop: 0; --metre: 0; }
.hq-pin > .cr-plate { position: absolute; bottom: var(--s2); left: 0; translate: -50% 0; white-space: nowrap;
  display: flex; align-items: center; gap: var(--s2); padding: var(--s1) var(--s2);
  font: 600 var(--t-label)/1.1 var(--face); letter-spacing: .04em; text-transform: none; }
.hq-pin > .cr-plate .hq-lv > i { width: var(--s2); height: var(--s2); }
.hq-pin.chosen > .cr-plate { background: var(--gilt); color: var(--ink); }
.hq-hit { position: absolute; top: 0; left: calc(var(--metre) * -11); width: calc(var(--metre) * 22);
  height: var(--drop); }
.hq-lv { display: flex; gap: var(--s1); }
.hq-lv > i { width: var(--s3); height: var(--s3); box-shadow: inset 0 0 0 var(--w-fine) currentColor; }
.hq-lv > i.on { background: currentColor; }
.hq-lv > i.works { background: var(--stripes); }
.hq-lv > i.shut { opacity: .3; }
.hq-gives { display: flex; flex-direction: column; gap: var(--s1); margin: 0; padding: 0; list-style: none; }
.hq-gives > li { font: 500 var(--t-body)/1.3 var(--face); }
.hq-gives > li.new { color: var(--act); font-weight: 700; }
.hq-list { display: flex; flex-direction: column; }
.hq-row { display: flex; align-items: center; justify-content: space-between; gap: var(--s2);
  min-height: var(--row); border-bottom: var(--w-fine) solid var(--rule); }
`;

/** Its levels: one a square to the highest any reaches, filled as far as built, striped where under way, faint past
 *  what the championship lets it rise to. */
const levels = (b: Works) =>
  el(
    'span',
    'hq-lv',
    ...Array.from({ length: b.top }, (_, i) =>
      el(
        'i',
        i < b.level
          ? 'on'
          : i === b.level && b.under
            ? 'works'
            : i >= b.cap
              ? 'shut'
              : ''
      )
    )
  );

/** What it gives, a line each; those that differ from `was` marked new. */
const gives = (lines: readonly string[], was: readonly string[] = lines) =>
  el(
    'ul',
    'hq-gives',
    ...lines.map((l) => el('li', was.includes(l) ? '' : 'new', l))
  );

/** The headquarters. */
export function createHq(office: Office): Screen<HqPaper> {
  kitLooks();
  stylesheet(CSS);
  const root = page('aside', 's-hq');
  /** The building whose sheet is open (null: the campus's). */
  let chosen: Building | null = null;
  const choose = (b: Building | null) => () => {
    chosen = chosen === b ? null : b;
    office.draw();
  };

  /** Pinned over a building's head (data-plot): `made` in it. */
  const pinned = (b: Works, made: HTMLElement) => {
    const at = el('div', `hq-pin${b.id === chosen ? ' chosen' : ''}`, made);
    at.dataset.plot = b.id;
    return at;
  };
  /** A building's hit, from its head down to its foot. */
  const hit = (b: Works) =>
    pinned(b, pressed(el('div', 'hq-hit'), choose(b.id)));
  /** A building's nameplate and levels. */
  const pin = (b: Works) =>
    pinned(b, pressed(plate(el('span', '', b.name), levels(b)), choose(b.id)));

  /** The campus through its window. */
  const campus = (v: HqPaper) => {
    const pane = el(
      'div',
      'cr-window o-window',
      el('div', 'o-subject'),
      // every plate over every hit (each pin is a layer of its own)
      ...v.buildings.map(hit),
      ...v.buildings.map(pin)
    );
    pane.dataset.scene = 'harbour';
    // the camera glides to the building chosen (office.ts data-focus)
    if (chosen) pane.dataset.focus = chosen;
    return el('div', 'cr-framed', pane);
  };

  /** A building's sheet. */
  const building = (b: Works) => {
    const next = b.level + 1,
      open = b.level < b.cap;
    return sheet(
      b.name,
      [
        link('All buildings', choose(null)),
        label(b.about),
        gauge('Level', `${b.level} of ${b.cap}`, levels(b)),
        b.cap < b.top &&
          label(`In your championship no building rises above level ${b.cap}.`),
        label('Now'),
        b.level > 0 ? gives(b.now) : label('Not built'),
        terms([['Upkeep a race', grouped(b.upkeep)]]),
        ...(b.under
          ? [
              gauge(
                `Building level ${next}`,
                `${b.under.days} days left`,
                busy(b.under.done)
              ),
            ]
          : open && b.next
            ? [
                label(`At level ${next}`),
                gives(b.next, b.now),
                terms([
                  ['Cost', grouped(b.cost)],
                  ['Build time', `${b.days} days`],
                  ...(b.needs
                    ? [
                        [
                          'Needs',
                          `${b.needs.name} at level ${b.level} (now ${b.needs.level})`,
                        ] as const,
                      ]
                    : []),
                ]),
                button(
                  b.level === 0 ? 'Build' : `Upgrade to level ${next}`,
                  () =>
                    office.ask({
                      kind: 'send',
                      command: { kind: 'Build', building: b.id },
                    }),
                  { off: b.build.ok ? null : b.build.why }
                ),
              ]
            : [label('At the highest level it may reach.')]),
      ],
      { cls: 'cr-grow' }
    );
  };

  /** The campus against the championship, and every building. */
  const overview = (v: HqPaper) =>
    sheet(
      'Headquarters',
      [
        compared(v.stats, {
          best: 'Best in championship',
          average: 'Average team',
        }),
        el(
          'div',
          'hq-list',
          ...v.buildings.map((b) =>
            pressed(el('div', 'hq-row', link(b.name), levels(b)), choose(b.id))
          )
        ),
      ],
      { cls: 'cr-grow' }
    );

  return {
    el: root,
    show(v) {
      const open = v.buildings.find((b) => b.id === chosen);
      if (!open) chosen = null;
      root.replaceChildren(
        campus(v),
        column(open ? building(open) : overview(v))
      );
    },
  };
}

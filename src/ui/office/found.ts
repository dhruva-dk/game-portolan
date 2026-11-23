// A new team made, on the chartroom kit, after MM's (048–050), on the whole
// page. At the left its making in four steps, one open at a time: the team's
// name, its owner's, its emblem and its ships' livery (a pattern stepped
// through, a dye of the swatches); each shut step a strip saying what it holds;
// under them what it takes on (whose place, their chairman, their staff).
// At the right her ship through a brass-framed window (the world clear behind
// the page), the team's plate under it (its emblem, its name, the championship
// it joins and whose place it takes), and at the foot its owner, why the last
// making was refused, and the way on.

import type { FoundView, Founding } from '../../office/loop.ts';
import { button, field, stepper } from '../chartroom/controls.ts';
import { terms } from '../chartroom/data.ts';
import { label, stars } from '../chartroom/figures.ts';
import { kitLooks } from '../chartroom/kit.ts';
import { column, page } from '../chartroom/layout.ts';
import { paper, plate, sheet } from '../chartroom/paper.ts';
import { who } from '../chartroom/person.ts';
import { u } from '../chartroom/tokens.ts';
import { emblem } from '../emblem.ts';
import { el, pressed, styled, type Kid } from '../kit/part.ts';
import { stylesheet } from '../kit/style.ts';
import type { Office } from './office.ts';
import type { Screen } from './screens.ts';

const CSS = `
.s-found { height: 100%; box-sizing: border-box; padding: var(--s5) var(--s6); }
.fd-title { flex: none; text-align: center; }
.fd-step { min-height: var(--touch); display: grid; grid-template-columns: ${u(12)} auto minmax(0, 1fr); align-items: center;
  gap: var(--s3); padding: 0 var(--s4); }
.fd-step > b { font: 600 var(--fig-s)/1 var(--face); font-style: italic; }
.fd-step > span { font: 700 var(--t-label)/1 var(--face); letter-spacing: .14em; text-transform: uppercase; }
.fd-step > :last-child { justify-self: end; display: flex; align-items: center; gap: var(--s2); min-width: 0;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.fd-picks { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: var(--s3); }
.fd-pick { height: ${u(30)}; display: grid; place-items: center; }
.fd-dyes { display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: var(--s3); }
.fd-dye { height: ${u(18)}; background: linear-gradient(135deg, var(--dye) 0 62%, var(--dye-2) 62%);
  box-shadow: inset 0 0 0 var(--w-fine) var(--ink); }
.fd-dye.chosen { box-shadow: inset 0 0 0 var(--w-bold) var(--ink), 0 0 0 var(--s1) var(--gilt), 0 0 0 calc(var(--s1) + var(--w-fine)) var(--ink); }
/* the window and the team's plate under it, one frame; the window no paper's, the world shows through it */
.fd-framed { flex: 1; min-height: 0; display: flex; flex-direction: column; box-shadow: 0 0 0 var(--w-bold) var(--ink); }
.fd-window { position: relative; flex: 1; min-height: 0; box-shadow: inset 0 0 0 ${u(3)} var(--brass), inset 0 0 0 ${u(3.8)} var(--ink); }
.fd-window > .o-subject { position: absolute; left: 0; right: 0; top: 50%; height: 100%; translate: 0 -50%; pointer-events: none; }
.fd-crest { flex: none; display: flex; align-items: center; gap: var(--s4); padding: var(--s3) var(--s5); }
.fd-crest > svg { flex: none; width: ${u(22)}; height: ${u(22)}; }
.fd-crest b { flex: none; font: 700 var(--t-title)/1 var(--face); letter-spacing: .14em; text-transform: uppercase; white-space: nowrap; }
.fd-crest span { min-width: 0; margin-left: auto; text-align: right; font: italic 500 var(--t-body)/1.2 var(--face); letter-spacing: 0; text-transform: none; opacity: .8; }
.fd-foot { display: grid; grid-template-columns: minmax(0, 1fr) auto ${u(90)}; align-items: center; gap: var(--s5);
  padding: var(--s3) var(--s4); }
.fd-foot > .cr-harm { font-style: italic; }
`;

/** The four steps of the making, in the order they stand. */
const STEPS = ['name', 'owner', 'emblem', 'livery'] as const;
type Step = (typeof STEPS)[number];
const TITLES: Readonly<Record<Step, string>> = {
  name: 'Team Name',
  owner: 'Team Owner',
  emblem: 'Emblem',
  livery: 'Livery',
};

/** The team's making. */
export function createFound(office: Office): Screen<FoundView> {
  kitLooks();
  stylesheet(CSS);
  const root = page('side', 's-found');
  let draft: Founding | null = null,
    open: Step = 'name';

  function draw(v: FoundView) {
    const d = (draft ??= {
      team: v.team,
      given: v.given,
      family: v.family,
      dye: 0,
      pattern: 0,
      emblem: 0,
    });
    const set = (next: Partial<Founding>) => {
      draft = { ...d, ...next };
      office.draw();
    };
    /** A field of the draft: what is typed kept, the page drawn again once it is left. */
    const typed = (title: string, key: 'team' | 'given' | 'family') =>
      field(
        title,
        d[key],
        (text) => {
          if (draft) draft = { ...draft, [key]: text };
        },
        () => office.draw()
      );
    const jacket = v.dyes[d.dye] ?? v.dyes[0] ?? ['', ''];
    const patterns = Math.max(1, v.patterns.length);

    const bodies: Readonly<Record<Step, () => Kid[]>> = {
      name: () => [typed('The team’s name', 'team')],
      owner: () => [typed('First name', 'given'), typed('Last name', 'family')],
      emblem: () => [
        el(
          'div',
          'fd-picks',
          ...Array.from({ length: v.emblems }, (_, i) =>
            pressed(
              paper(el('div', 'fd-pick', emblem(i, jacket, 34)), {
                fill: i === d.emblem ? 'gilt' : 'paper-raised',
                flat: i !== d.emblem,
              }),
              () => set({ emblem: i })
            )
          )
        ),
      ],
      livery: () => [
        stepper(
          v.patterns[d.pattern] ?? `Pattern ${d.pattern + 1}`,
          () => set({ pattern: (d.pattern + patterns - 1) % patterns }),
          () => set({ pattern: (d.pattern + 1) % patterns })
        ),
        el(
          'div',
          'fd-dyes',
          ...v.dyes.map(([a, b], i) =>
            pressed(
              styled(el('div', `fd-dye${i === d.dye ? ' chosen' : ''}`), {
                '--dye': a,
                '--dye-2': b,
              }),
              () => set({ dye: i })
            )
          )
        ),
      ],
    };
    /** What a shut step holds, at its strip's right. */
    const holds: Readonly<Record<Step, () => Kid>> = {
      name: () => d.team,
      owner: () => `${d.given} ${d.family}`,
      emblem: () => emblem(d.emblem, jacket, 18),
      livery: () => v.patterns[d.pattern] ?? '',
    };
    const step = (s: Step, i: number) =>
      s === open
        ? sheet(TITLES[s], bodies[s](), { aside: `${i + 1} of 4` })
        : pressed(
            paper(
              el(
                'div',
                'fd-step',
                el('b', '', String(i + 1)),
                el('span', '', TITLES[s]),
                el('div', '', holds[s]())
              ),
              { fill: 'paper-raised' }
            ),
            () => {
              open = s;
              office.draw();
            }
          );

    const crest = plate(
      emblem(d.emblem, jacket, 22),
      el('b', '', d.team),
      el(
        'span',
        '',
        `Joins the ${v.championship} in ${v.replacing.team}’s place`
      )
    );
    crest.classList.add('fd-crest');
    root.replaceChildren(
      column(
        el('div', 'fd-title', plate('Found a Team')),
        ...STEPS.map(step),
        sheet('What It Takes On', [
          terms([
            ['The place of', v.replacing.team],
            ['Its chairman', v.replacing.chairman],
            [
              'Its staff, on average',
              stars(Math.round(v.replacing.staff * 2) / 2),
            ],
          ]),
        ])
      ),
      column(
        el(
          'div',
          'fd-framed',
          el('div', 'fd-window o-window', el('div', 'o-subject')),
          crest
        ),
        paper(
          el(
            'div',
            'fd-foot',
            who(
              { jacket, name: `${d.given} ${d.family}`, said: 'Team owner' },
              30,
              'beside'
            ),
            v.refused ? label(v.refused, 'cr-harm') : el('span'),
            button('Found the Team', () =>
              office.ask({ kind: 'found', founding: draft ?? d })
            )
          ),
          { fill: 'paper-raised' }
        )
      )
    );
  }

  return { el: root, show: draw };
}

// A new team made, on the whole page. At the left its making in four parts,
// one open at a time under its bar: the team's name, its owner's, its emblem
// and its ships' livery. At the foot right the owner's card beside the team's
// emblem and name as they stand; the way on at the foot. The world shows clear
// behind: her ship at anchor.

import type { FoundView, Founding } from '../../office/loop.ts';
import { emblem } from '../emblem.ts';
import { button, stepper } from '../kit/button.ts';
import { icon } from '../kit/icons.ts';
import { el, pressed, styled, type Kid } from '../kit/part.ts';
import { portrait } from '../kit/portrait.ts';
import { tag } from '../kit/stat.ts';
import { stylesheet } from '../kit/style.ts';
import type { Office } from './office.ts';
import type { Screen } from './screens.ts';

const CSS = `
.s-found > .f-top { position: absolute; left: 0; right: 0; top: 0; height: 64px; display: flex; align-items: center; padding: 0 24px;
  background: var(--bar); color: var(--bar-ink); border-bottom: 1.5px solid var(--ink);
  font: 600 24px/1 var(--narrow); letter-spacing: .1em; text-transform: uppercase; }
.s-found > .f-make { position: absolute; left: 18px; top: 82px; width: 420px; display: flex; flex-direction: column; gap: 3px;
  padding: 4px; background: var(--panel); border: 1.5px solid var(--ink); box-shadow: 0 2px 0 var(--shade); }
.f-bar { height: 44px; display: flex; align-items: center; gap: 8px; padding: 0 10px; background: var(--go); color: var(--on-fill);
  font: 600 17px/1 var(--narrow); letter-spacing: .1em; text-transform: uppercase; }
.f-bar > span { flex: 1; text-align: center; }
.f-part { display: flex; flex-direction: column; gap: 10px; padding: 12px 10px 14px; }
.f-part > label { display: flex; flex-direction: column; gap: 4px; font-size: 13px; color: var(--faint); }
.f-part input { height: 44px; padding: 0 12px; background: var(--light); color: var(--ink); border: 1.5px solid var(--ink);
  border-radius: 0; font: 600 17px var(--serif); outline: none; -webkit-appearance: none; }
.f-grid { display: grid; grid-template-columns: repeat(6, 1fr); gap: 6px; }
.f-grid.dyes { grid-template-columns: repeat(8, 1fr); }
.f-pick { height: 52px; display: grid; place-items: center; background: var(--dark); border: 1.5px solid transparent; }
.f-pick.chosen { background: var(--light); border-color: var(--ink); box-shadow: inset 0 0 0 2px var(--go); }
.f-dye { height: 44px; background: var(--dye); border: 1.5px solid var(--ink); }
.f-dye.chosen { box-shadow: 0 0 0 3px var(--panel), 0 0 0 5px var(--go); }
.s-found > .f-card { position: absolute; right: 18px; bottom: 78px; height: 112px; display: flex; align-items: center; gap: 16px;
  padding: 0 22px; background: var(--panel); border: 1.5px solid var(--ink); box-shadow: 0 2px 0 var(--shade); }
.f-card > .f-who { display: flex; flex-direction: column; gap: 4px; }
.f-who > b { font: 600 17px/1 var(--narrow); letter-spacing: .1em; text-transform: uppercase; }
.f-card > i { align-self: stretch; margin: 14px 4px; width: 1px; background: var(--rule); }
.f-card > .f-name { font: 700 24px/1.1 var(--serif); max-width: 260px; }
.s-found > .f-foot { position: absolute; left: 0; right: 0; bottom: 0; height: 60px; display: flex; align-items: center;
  justify-content: flex-end; gap: 14px; padding: 0 8px; background: var(--bar); border-top: 1.5px solid var(--ink); }
.f-foot > .k-btn { width: 150px; }
.s-found > .o-window { position: absolute; left: 0; right: 0; top: 64px; bottom: 60px; z-index: -1; }
`;

/** The four parts of the making, in the order they stand. */
const PARTS = ['name', 'owner', 'emblem', 'livery'] as const;
type Part = (typeof PARTS)[number];
const TITLES: Readonly<Record<Part, string>> = {
  name: 'Team Name',
  owner: 'Team Owner',
  emblem: 'Emblem Design',
  livery: 'Ship Livery',
};

/** The team's making. */
export function createFound(office: Office): Screen<FoundView> {
  stylesheet(CSS);
  const root = el('div', 's-found');
  let draft: Founding | null = null,
    open: Part = 'name';

  /** A field of the draft, typed into: the draft keeps what is typed, and the card is drawn again when it is left. */
  const field = (label: string, key: 'team' | 'given' | 'family') => {
    const input = el('input');
    input.type = 'text';
    input.maxLength = 28;
    input.value = draft?.[key] ?? '';
    input.addEventListener('input', () => {
      if (draft) draft = { ...draft, [key]: input.value };
    });
    input.addEventListener('change', () => office.draw());
    return el('label', '', label, input);
  };

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
    const jacket = v.dyes[d.dye] ?? v.dyes[0];
    const bodies: Readonly<Record<Part, () => Kid[]>> = {
      name: () => [field('Team Name', 'team')],
      owner: () => [field('First Name', 'given'), field('Last Name', 'family')],
      emblem: () => [
        el(
          'div',
          'f-grid',
          ...Array.from({ length: v.emblems }, (_, i) =>
            pressed(
              el(
                'div',
                `f-pick${i === d.emblem ? ' chosen' : ''}`,
                jacket && emblem(i, jacket, 36)
              ),
              () => set({ emblem: i })
            )
          )
        ),
      ],
      livery: () => [
        stepper(
          v.patterns[d.pattern] ?? `Livery ${d.pattern + 1}`,
          (by) =>
            set({
              pattern: (d.pattern + by + v.patterns.length) % v.patterns.length,
            }),
          {}
        ),
        el(
          'div',
          'f-grid dyes',
          ...v.dyes.map((dye, i) =>
            pressed(
              styled(el('div', `f-dye${i === d.dye ? ' chosen' : ''}`), {
                '--dye': dye[0],
              }),
              () => set({ dye: i })
            )
          )
        ),
      ],
    };
    root.replaceChildren(
      el('div', 'o-window'),
      el('div', 'f-top', 'Create a New Team'),
      el(
        'div',
        'f-make',
        ...PARTS.flatMap((p) => [
          pressed(
            el(
              'div',
              'f-bar',
              icon('down', 18),
              el('span', '', TITLES[p]),
              icon('forward', 18)
            ),
            () => {
              open = p;
              office.draw();
            }
          ),
          p === open && el('div', 'f-part', ...bodies[p]()),
        ])
      ),
      el(
        'div',
        'f-card',
        jacket && portrait(jacket, 76),
        el(
          'div',
          'f-who',
          el('b', '', 'Team Owner'),
          `${d.given} ${d.family}`,
          v.championship
        ),
        el('i'),
        jacket && emblem(d.emblem, jacket, 64),
        el('div', 'f-name', d.team)
      ),
      el(
        'div',
        'f-foot',
        v.refused && tag(v.refused, 'bad'),
        button(
          'Continue',
          () => office.ask({ kind: 'found', founding: draft ?? d }),
          { kind: 'on', after: 'forward' }
        )
      )
    );
  }

  return { el: root, show: draw };
}

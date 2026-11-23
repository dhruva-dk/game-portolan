// Bits the office's screens share: a person's jacket by their team's dye, a
// list of names and values, a range of stars, a button that says why it is
// shut, and money as the office sets it.

import type { Face } from '../../office/career.ts';
import type { Dyed } from '../../office/papers.ts';
import type { Act } from '../../office/people.ts';
import type { Jacket } from '../gull.ts';
import { OFFICE } from '../ink.ts';
import { button } from '../kit/button.ts';
import { el, grouped, type Kid } from '../kit/part.ts';
import { portrait } from '../kit/portrait.ts';
import { stylesheet } from '../kit/style.ts';

const CSS = `
.b-lines { display: grid; grid-template-columns: 1fr auto; gap: 1px; }
.b-lines > * { padding: 7px 10px; background: var(--dark); min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.b-lines > b { text-align: right; font-weight: 600; }
.b-why { font-size: 13px; color: var(--bad); text-align: center; min-height: 16px; }
.b-act { display: flex; flex-direction: column; gap: 3px; }
.b-who { display: flex; align-items: center; gap: 10px; min-width: 0; }
.b-who > span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.b-pad { padding: 12px 18px; display: grid; gap: 10px; }
.b-col { display: flex; flex-direction: column; gap: 10px; min-height: 0; min-width: 0; }
.b-row { display: flex; gap: 8px; align-items: center; }
.b-row > .k-btn { flex: 1; }
.b-big { font: 700 26px/1.1 var(--narrow); }
.b-faint { color: var(--faint); font-size: 13px; }
.b-text { padding: 10px 4px; line-height: 1.45; white-space: pre-wrap; overflow-y: auto; }
.p-top { display: flex; flex-direction: column; align-items: center; gap: 6px; padding-top: 12px; text-align: center; }
.p-tags { display: flex; flex-wrap: wrap; gap: 4px; justify-content: center; }
.d-name { font: 600 19px/1.15 var(--serif); }
`;

/** The bits' styles, once. */
export const bitsStyle = () => stylesheet(CSS);

/** A free agent's jacket: no team's. */
const PLAIN: Jacket = [OFFICE.faint, OFFICE.panel];

/** The jacket a face wears: their team's dye as the page shows it. */
export const jacketOf = (
  face: Face | null,
  dyes: Dyed<unknown>['dyes']
): Jacket =>
  (face?.colours && dyes[face.colours.dye % Math.max(1, dyes.length)]) || PLAIN;

/** A person named beside their portrait. */
export const who = (
  face: Face | null,
  dyes: Dyed<unknown>['dyes'],
  name: string,
  size = 30
) =>
  el(
    'div',
    'b-who',
    portrait(jacketOf(face, dyes), size),
    el('span', '', name)
  );

/** Names and their values, a line each. */
export const lines = (rows: readonly (readonly [string, Kid])[]) =>
  el(
    'div',
    'b-lines',
    ...rows.flatMap(([name, value]) => [
      el('span', '', name),
      el('b', '', value),
    ])
  );

/** A button that is shut with its reason under it. */
export function acted(
  label: string,
  act: Act,
  go: () => void,
  kind: 'go' | 'plain' | 'danger' | 'on' = 'go'
) {
  return el(
    'div',
    'b-act',
    button(label, go, { kind, off: !act.ok, wide: true }),
    !act.ok && act.why !== '' && el('div', 'b-why', act.why)
  );
}

/** A sum of money as the office sets it. */
export const money = (n: number) => grouped(n);

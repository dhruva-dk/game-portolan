// The chartroom's controls: paper slips that take a tap. A button is washed in
// what it does (act, harm) or left plain; one that cannot be pressed now says
// why under it. A choice of a few is one slip ruled into parts; a value is
// stepped in a ruled well; a long choice drops a menu; a figure's breakdown
// rises on a slip over it. Each is a function of plain values and what a tap
// calls; none keeps the career's state.

import type { Explanation } from '../../office/career.ts';
import { el, pressed, type Kid } from '../kit/part.ts';
import { mark, label } from './figures.ts';
import { paper } from './paper.ts';
import { TONE, u } from './tokens.ts';

export const CONTROLS_CSS = `
.cr-btn { min-height: var(--touch); padding: 0 var(--s5); display: flex; align-items: center; justify-content: center;
  color: var(--on-ink); font: 700 var(--t-body)/1 var(--face); letter-spacing: .03em; white-space: nowrap; }
.cr-btn.plain { color: var(--ink); }
.cr-act { display: flex; flex-direction: column; gap: var(--s1); }
.cr-act > .cr-label { text-align: center; }

.cr-seg { display: flex; min-height: var(--touch); padding: var(--s1); }
.cr-seg > div { flex: 1; display: grid; place-items: center; padding: 0 var(--s3); font: 500 var(--t-body)/1 var(--face);
  color: var(--ink-2); border-left: var(--w-hair) solid var(--line); }
.cr-seg > div:first-child, .cr-seg > .chosen, .cr-seg > .chosen + div { border-left-color: transparent; }
.cr-seg > .chosen { background: var(--gilt); color: var(--ink); font-weight: 700; box-shadow: inset 0 0 0 var(--w-rule) var(--ink); }

.cr-stepper { display: grid; grid-template-columns: var(--touch) 1fr var(--touch); align-items: stretch; gap: var(--s2); }
.cr-step { height: var(--touch); display: grid; place-items: center; font: 700 var(--fig-s)/1 var(--face); }
.cr-well { display: grid; place-items: center; background: var(--paper-sunk); box-shadow: inset 0 0 0 var(--w-fine) var(--ink);
  font: 600 var(--t-name)/1 var(--face); font-variant-numeric: tabular-nums lining-nums; }

.cr-field { display: flex; flex-direction: column; gap: var(--s1); }
.cr-field > input { min-height: var(--touch); padding: 0 var(--s3); border: 0; border-radius: 0; outline: none; -webkit-appearance: none;
  appearance: none; background: var(--paper-sunk); box-shadow: inset 0 0 0 var(--w-fine) var(--ink); color: var(--ink);
  font: 600 var(--t-name)/1 var(--face); }
.cr-field > input:focus { box-shadow: inset 0 0 0 var(--w-rule) var(--act); }

.cr-drop-at { position: relative; }
.cr-drop { min-height: var(--touch); display: flex; align-items: center; justify-content: space-between; gap: var(--s3);
  padding: 0 var(--s4); font: 600 var(--t-body)/1 var(--face); }
.cr-caret { transition: rotate var(--quick); }
.cr-drop-at.open .cr-caret { rotate: 180deg; }
.cr-menu { position: absolute; z-index: 20; left: 0; right: 0; top: calc(100% + var(--s2)); display: flex; flex-direction: column;
  padding: var(--s1); animation: cr-rise var(--quick) both; }
.cr-menu > div { min-height: var(--row-tap); display: flex; align-items: center; padding: 0 var(--s4);
  border-bottom: var(--w-fine) solid var(--rule); }
.cr-menu > div:last-child { border-bottom: 0; }
.cr-menu > .chosen { background: var(--gilt); font-weight: 700; box-shadow: inset 0 0 0 var(--w-rule) var(--ink); }

.cr-pop { position: absolute; z-index: 20; width: ${u(150)}; display: flex; flex-direction: column; padding: var(--s4) var(--s5);
  animation: cr-rise var(--quick) both; }
.cr-pop-title { padding-bottom: var(--s2); margin-bottom: var(--s1); border-bottom: var(--w-rule) solid var(--ink);
  font: 700 var(--t-label)/1.2 var(--face); letter-spacing: .12em; text-transform: uppercase; text-align: center; }
.cr-pop-line { display: flex; justify-content: space-between; align-items: baseline; gap: var(--s4); padding: var(--s1) 0;
  border-bottom: var(--w-fine) solid var(--rule); }
.cr-pop-line b { font-weight: 600; font-variant-numeric: tabular-nums lining-nums; }
.cr-pop-line.harm b { color: var(--harm); }
.cr-pop-line.good b { color: var(--good); }
.cr-pop-line.total { border-bottom: 0; border-top: var(--w-rule) double var(--ink); margin-top: var(--s1); padding-top: var(--s2); }
.cr-pop-line.total b { font-weight: 700; }
@keyframes cr-rise { from { opacity: 0; translate: 0 calc(-2 * var(--u)); } }
`;

/** What a button does: act (blue), harm (rubric), or plain paper. */
type Kind = 'act' | 'harm' | 'plain';

/**
 * A button: a slip washed in what it does; a tap calls `act`. `off`, it is
 * shown unavailable and deaf, with why under it.
 */
export function button(
  text: string,
  act: () => void,
  how: { kind?: Kind; off?: string | null } = {}
) {
  const kind = how.kind ?? 'act';
  const slip = paper(el('div', `cr-btn ${kind}`, text), {
    fill: kind === 'plain' ? 'paper-raised' : kind,
    bold: true,
  });
  pressed(slip, act, !!how.off);
  return how.off ? el('div', 'cr-act', slip, label(how.off)) : slip;
}

/** A choice of a few: one slip ruled into parts, the chosen gilt; a tap on another calls `choose` with its index. */
export const segmented = (
  parts: readonly string[],
  chosen: number,
  choose: (i: number) => void
) =>
  paper(
    el(
      'div',
      'cr-seg',
      ...parts.map((p, i) =>
        i === chosen
          ? el('div', 'chosen', p)
          : pressed(el('div', '', p), () => choose(i))
      )
    ),
    { fill: 'paper-raised', flat: true }
  );

/**
 * A value stepped down or up: its text in a ruled well between − and +; a
 * side with nothing to call is off (the value is at its limit).
 */
export function stepper(
  text: Kid,
  down: (() => void) | null,
  up: (() => void) | null
) {
  const side = (sign: string, act: (() => void) | null) =>
    pressed(
      paper(el('div', 'cr-step', sign), { fill: 'paper-raised' }),
      act ?? (() => undefined),
      !act
    );
  return el(
    'div',
    'cr-stepper',
    side('−', down),
    el('div', 'cr-well', text),
    side('+', up)
  );
}

/**
 * A line typed into: its name over a sunk well ruled in ink (the action's ink
 * round it while it is typed in), at most `most` letters; `typed` hears each
 * change, `left` once it is left.
 */
export function field(
  title: string,
  value: string,
  typed: (text: string) => void,
  left: () => void,
  most = 28
) {
  const input = el('input');
  input.type = 'text';
  input.maxLength = most;
  input.value = value;
  input.addEventListener('input', () => typed(input.value));
  input.addEventListener('change', left);
  return el('label', 'cr-field', label(title), input);
}

/** The woodcut caret of a slip that drops a menu. */
const caret = () =>
  mark(
    10,
    8,
    `<path d="M1.5 1.5L8.5 1.5L5 6.8Z" fill="url(#h-iron)" stroke="${TONE.ink}" stroke-width="1" stroke-linejoin="round"/>`,
    'cr-caret'
  );

/**
 * A long choice: a raised slip with the chosen option and a caret; a tap drops
 * the menu of `options` under it, and a tap on one calls `choose` with its
 * index and puts the menu away.
 */
export function dropdown(
  options: readonly string[],
  chosen: number,
  choose: (i: number) => void
) {
  const at = el('div', 'cr-drop-at');
  const menu = paper(
    el(
      'div',
      'cr-menu',
      ...options.map((o, i) =>
        pressed(el('div', i === chosen ? 'chosen' : '', o), () => {
          shut();
          if (i !== chosen) choose(i);
        })
      )
    ),
    { fill: 'paper-raised' }
  );
  const shut = () => {
    at.classList.remove('open');
    menu.remove();
  };
  const slip = pressed(
    paper(el('div', 'cr-drop', el('span', '', options[chosen]), caret()), {
      fill: 'paper-raised',
    }),
    () => {
      if (at.classList.toggle('open')) at.append(menu);
      else shut();
    }
  );
  at.append(slip);
  return at;
}

/** The ink a line's amount is set in: a gain good, a cost harm, anything else plain. */
const signOf = (amount: string) =>
  amount.startsWith('−') || amount.startsWith('-')
    ? 'harm'
    : amount.startsWith('+')
      ? 'good'
      : '';

/**
 * What a figure is made of, on a raised slip: its lines, each gain good and
 * each cost harm, ruled to its total. Its holder places it.
 */
export const popover = (e: Explanation, total: string) =>
  paper(
    el(
      'div',
      'cr-pop',
      el('div', 'cr-pop-title', e.title),
      ...e.lines.map((l) =>
        el(
          'div',
          `cr-pop-line ${signOf(l.amount)}`,
          label(l.label),
          el('b', '', l.amount)
        )
      ),
      el('div', 'cr-pop-line total', label('Total'), el('b', '', total))
    ),
    { fill: 'paper-raised' }
  );

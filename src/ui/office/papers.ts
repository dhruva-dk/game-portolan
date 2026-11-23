// The office's mail: the inbox at the left (the kinds of letter down its side,
// a choice of all, the unread or those that wait on an answer, then the
// letters as cards, newest first), the open letter at the right under its kind
// and date, its sender's portrait beside its subject, its answers at its foot.

import type { Letter, MailPaper } from '../../office/papers.ts';
import { button, segmented } from '../kit/button.ts';
import { icon } from '../kit/icons.ts';
import { panel } from '../kit/panel.ts';
import { el, pressed } from '../kit/part.ts';
import { portrait } from '../kit/portrait.ts';
import { tag } from '../kit/stat.ts';
import { stylesheet } from '../kit/style.ts';
import { bitsStyle, jacketOf } from './bits.ts';
import type { Office } from './office.ts';
import type { Screen } from './screens.ts';

const CSS = `
.s-mail { grid-template-columns: 580px 1fr; }
.m-inbox > .k-body { display: flex; flex-direction: row; gap: 8px; }
.m-kinds { flex: none; width: 156px; display: flex; flex-direction: column; gap: 3px; overflow-y: auto; }
.m-kinds > div { flex: none; min-height: 40px; display: flex; align-items: center; padding: 0 8px; border-left: 4px solid var(--line); font-size: 14px;
  white-space: nowrap; overflow: hidden; }
.m-kinds > .m-all { height: 84px; flex-direction: column; justify-content: center; gap: 6px; border-left: 0; background: var(--dark);
  box-shadow: inset 0 0 0 1px var(--line); font: 700 14px/1 var(--narrow); letter-spacing: .08em; text-transform: uppercase; }
.m-kinds > .chosen { background: var(--gilt); font-weight: 700; box-shadow: inset 0 0 0 1.2px var(--ink); }
.m-side { flex: 1; min-width: 0; min-height: 0; display: flex; flex-direction: column; gap: 8px; }
.m-list > .k-tr.m-card { grid-template-columns: 9px 52px 1fr; height: 80px; padding-left: 10px; }
.m-dot { width: 9px; height: 9px; border-radius: 50%; background: var(--go); }
.m-what { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
.m-what > * { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.m-from { display: flex; align-items: center; gap: 8px; font-size: 13px; color: var(--faint); font-weight: 500; }
.m-subject { font: 500 17px/1.2 var(--serif); }
.m-card.unread .m-subject { font-weight: 700; }
.m-about { display: flex; justify-content: space-between; gap: 8px; font-size: 13px; font-style: italic; font-weight: 500; color: var(--faint); }
.m-none { flex: 1; display: grid; place-items: center; font-style: italic; color: var(--faint); }
.m-steps { display: flex; gap: 4px; }
.m-step { width: 40px; height: 30px; display: grid; place-items: center; background: var(--light); color: var(--ink); border: 1.2px solid var(--ink); }
.m-step.off { opacity: .35; }
.m-letter > .k-body { padding: 0 4px 4px; gap: 0; }
.m-mast { flex: none; display: flex; align-items: baseline; justify-content: space-between; gap: 12px; padding: 14px 16px 12px;
  background: var(--dark); border-bottom: 1.2px solid var(--ink); }
.m-mast > b { font: 700 21px/1 var(--narrow); letter-spacing: .12em; text-transform: uppercase; }
.m-mast > span { font-size: 13px; font-style: italic; color: var(--faint); }
.m-who { flex: none; display: flex; align-items: center; gap: 16px; padding: 14px 14px 12px; border-bottom: 1px solid var(--rule); }
.m-who > div:last-child { min-width: 0; display: flex; flex-direction: column; gap: 4px; padding-left: 16px; border-left: 1px solid var(--rule); }
.m-who b { font: 600 21px/1.2 var(--serif); }
.m-who span { font-size: 14px; color: var(--faint); }
.s-mail .b-text { flex: 1; padding: 14px; }
.m-answers { flex: none; display: flex; gap: 8px; padding: 10px; background: var(--dark); border-top: 1px solid var(--rule); }
.m-answers > .k-btn { flex: 1; }
`;

/** Which letters the inbox shows: all, the unread, or those that wait on her answer. */
type Which = 'all' | 'unread' | 'respond';

/** `made`, of the classes `cls` too (a panel's place on its screen). */
const classed = <T extends Element>(made: T, cls: string) => {
  made.classList.add(...cls.split(' '));
  return made;
};

/** The office's own hand: no team's jacket. */
const secretary = () => jacketOf(null, []);

/** A letter as the inbox lists it: a dot while unread, its sender's portrait, who sent it (marked while it waits on an answer), its subject and kind, its date. */
const letterCard = (l: Letter, own: boolean, open: () => void) =>
  pressed(
    el(
      'div',
      `k-tr m-card${l.unread ? ' unread' : ''}${own ? ' own' : ''}`,
      el('span', l.unread ? 'm-dot' : ''),
      portrait(secretary(), 52),
      el(
        'div',
        'm-what',
        el(
          'div',
          'm-from',
          el('span', '', l.from),
          l.sealed && tag('Must Respond', 'warn')
        ),
        el('div', 'm-subject', l.subject),
        el('div', 'm-about', el('span', '', l.about), el('span', '', l.date))
      )
    ),
    open
  );

/** The mail. */
export function createMail(office: Office): Screen<MailPaper> {
  stylesheet(CSS);
  bitsStyle();
  const root = el('div', 'b-pad s-mail');
  let which: Which = 'all',
    about: string | null = null;
  const open = (id: number) => office.ask({ kind: 'letter', id });
  return {
    el: root,
    show(v) {
      const o = v.open;
      const shown = v.letters.filter(
        (l) =>
          (about === null || l.about === about) &&
          (which === 'all' || (which === 'unread' ? l.unread : l.sealed))
      );
      /** A kind of letter at the inbox's side: its name, and how many of it are unread. */
      const kind = (name: string | null) => {
        const n = v.letters.filter(
          (l) => l.unread && (name === null || l.about === name)
        ).length;
        return pressed(
          el(
            'div',
            `${name === null ? 'm-all' : ''}${name === about ? ' chosen' : ''}`,
            name === null && icon('mail', 26),
            `${name ?? 'Inbox'}${n > 0 ? ` (${n})` : ''}`
          ),
          () => {
            about = name;
            office.draw();
          }
        );
      };
      const list = el(
        'div',
        'm-list k-rows',
        ...shown.map((l) => letterCard(l, l.id === o?.id, () => open(l.id)))
      );
      list.dataset.keep = 'mail';
      // the letter before the open one in the list, or after it
      const at = shown.findIndex((l) => l.id === o?.id);
      const step = (by: -1 | 1) => {
        // (the open one not in the list: on, to the list's first)
        const to = at < 0 ? (by > 0 ? shown[0] : undefined) : shown[at + by];
        return pressed(
          el(
            'div',
            `m-step${to ? '' : ' off'}`,
            icon(by < 0 ? 'up' : 'down', 20)
          ),
          () => to && open(to.id),
          !to
        );
      };
      root.replaceChildren(
        classed(
          panel('Inbox', [
            el(
              'div',
              'm-kinds',
              kind(null),
              ...[...new Set(v.letters.map((l) => l.about))].map(kind)
            ),
            el(
              'div',
              'm-side',
              segmented<Which>(
                [
                  { id: 'all', label: 'All' },
                  { id: 'unread', label: 'Unread' },
                  { id: 'respond', label: 'Must Respond' },
                ],
                which,
                (id) => {
                  which = id;
                  office.draw();
                },
                true
              ),
              shown.length === 0 && el('div', 'm-none', 'No letters.'),
              list
            ),
          ]),
          'm-inbox'
        ),
        classed(
          panel(
            'Message',
            o
              ? [
                  el(
                    'div',
                    'm-mast',
                    el('b', '', o.about),
                    el('span', '', o.date)
                  ),
                  el(
                    'div',
                    'm-who',
                    portrait(secretary(), 76),
                    el(
                      'div',
                      '',
                      el('b', '', o.subject),
                      el('span', '', `From: ${o.from}`)
                    )
                  ),
                  el('div', 'b-text', o.body),
                  o.options.length > 0 &&
                    el(
                      'div',
                      'm-answers',
                      ...o.options.map((label, option) =>
                        button(
                          label,
                          () =>
                            office.ask({
                              kind: 'send',
                              command: {
                                kind: 'AnswerDilemma',
                                mail: o.id,
                                option,
                              },
                            }),
                          {
                            kind: o.answer === option ? 'on' : 'go',
                            off: o.answer !== null,
                          }
                        )
                      )
                    ),
                ]
              : [el('div', 'm-none', 'No letter is open.')],
            el('div', 'm-steps', step(-1), step(1))
          ),
          'm-letter'
        )
      );
    },
  };
}

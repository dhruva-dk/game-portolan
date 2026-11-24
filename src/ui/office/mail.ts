// The mail on the chartroom kit, after MM's: at the left the inbox: the folder
// (all the letters, or a kind of letter, each with how many of it are unread)
// and which of its letters (all, the unread, those that wait on your answer),
// then those letters, newest first, each with its kind's woodcut, the open one
// gilt; at the right the open letter under its kind and date: its sender (a link to them),
// its words, what it names (each a link to its page), and a dilemma's answers,
// with the one it comes to if left; the letters before and after it.

import type {
  Dyed,
  Letter,
  LetterKind,
  MailPaper,
} from '../../office/papers.ts';
import { button, dropdown, link, segmented } from '../chartroom/controls.ts';
import { table } from '../chartroom/data.ts';
import { cut, label } from '../chartroom/figures.ts';
import { kitLooks } from '../chartroom/kit.ts';
import { column, page } from '../chartroom/layout.ts';
import { sheet } from '../chartroom/paper.ts';
import { who } from '../chartroom/person.ts';
import { u } from '../chartroom/tokens.ts';
import type { Glyph } from '../glyphs.ts';
import { el } from '../kit/part.ts';
import { stylesheet } from '../kit/style.ts';
import { jacketOf } from './faces.ts';
import { toPerson } from './links.ts';
import type { Office } from './office.ts';
import type { Screen } from './screens.ts';

const CSS = `
/* the folder and which of its letters, side by side */
.ml-sift { flex: none; display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: var(--s3); }
.s-mail .cr-tr .cr-mark { width: ${u(12)}; height: ${u(12)}; }
.ml-subject { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.ml-subject.unread { font-weight: 700; }
.ml-wait { color: var(--harm); font-style: italic; }
/* the open letter */
.ml-words { flex: 1; min-height: 0; overflow-y: auto; display: flex; flex-direction: column; gap: var(--s4); padding: var(--s2) 0; }
.ml-words > p { margin: 0; font: 400 var(--t-name)/1.45 var(--face); }
.ml-names { display: flex; flex-wrap: wrap; align-items: baseline; gap: var(--s1) var(--s4); }
.ml-answers { flex: none; display: flex; flex-direction: column; gap: var(--s2); padding-top: var(--s3); border-top: var(--w-rule) solid var(--ink); }
.ml-answers > div { display: grid; grid-template-columns: ${u(72)} minmax(0, 1fr); align-items: center; gap: var(--s3); }
.ml-answers .cr-btn { padding: 0 var(--s2); }
.ml-answers p { margin: 0; font: italic 400 var(--t-body)/1.3 var(--face); color: var(--ink-2); }
.ml-steps { flex: none; display: grid; grid-template-columns: 1fr 1fr; gap: var(--s2); }
.ml-none { flex: 1; display: grid; place-items: center; }
`;

/** What each kind of letter pictures: the tab its business is done on. */
const KINDS: Readonly<Record<LetterKind, Glyph>> = {
  team: 'office.drivers',
  market: 'office.scouting',
  ship: 'office.ship',
  hq: 'office.hq',
  tier: 'office.standings',
  finance: 'office.finances',
  chairman: 'office.team',
};

/** Which letters the list shows: all, the unread, those that wait on your answer. */
const WHICH = ['All', 'Unread', 'Answer'] as const;
const kept = [
  () => true,
  (l: Letter) => l.unread,
  (l: Letter) => l.sealed,
] as const;

/** The mail. */
export function createMail(office: Office): Screen<Dyed<MailPaper>> {
  kitLooks();
  stylesheet(CSS);
  const root = page({ cols: 2, rows: 1 }, 's-mail'),
    profile = toPerson(office);
  let which = 0,
    folder: LetterKind | null = null;

  const open = (l: Letter) => () => office.ask({ kind: 'letter', id: l.id });
  const redraw = () => office.draw();

  /** The folders: all the letters, then each kind there is, each with how many of it are unread. */
  const folders = (v: MailPaper) => {
    const kinds = [...new Set(v.letters.map((l) => l.kind))];
    const titled = (k: LetterKind | null) => {
      const n = v.letters.filter(
        (l) => l.unread && (k === null || l.kind === k)
      ).length;
      const title =
        k === null
          ? 'All letters'
          : (v.letters.find((l) => l.kind === k)?.about ?? k);
      return n > 0 ? `${title} (${n} unread)` : title;
    };
    const ways = [null, ...kinds];
    return dropdown(
      ways.map(titled),
      Math.max(0, ways.indexOf(folder)),
      (i) => {
        folder = ways[i] ?? null;
        redraw();
      }
    );
  };

  /** The letters of the folder chosen, as `which` sifts them. */
  const shownOf = (v: MailPaper) =>
    v.letters.filter(
      (l) => (folder === null || l.kind === folder) && kept[which](l)
    );

  /** The inbox: the folder and which of its letters, then the letters, a row each: its kind, its subject, whether it waits on you, its date. */
  const list = (v: MailPaper, shown: readonly Letter[]) =>
    sheet(
      'Mail',
      [
        el(
          'div',
          'ml-sift',
          folders(v),
          segmented(WHICH, which, (i) => {
            which = i;
            redraw();
          })
        ),
        table<Letter>(
          [
            { head: '', track: u(12), cell: (l) => cut(KINDS[l.kind]) },
            {
              head: 'Subject',
              track: 'minmax(0, 1fr)',
              cell: (l) =>
                link(
                  el(
                    'span',
                    `ml-subject${l.unread ? ' unread' : ''}`,
                    l.subject
                  )
                ),
            },
            {
              head: '',
              track: u(40),
              cell: (l) => (l.sealed ? el('span', 'ml-wait', 'Answer') : ''),
            },
            { head: 'Date', track: u(56), num: true, cell: (l) => l.date },
          ],
          shown,
          {
            own: (l) => l.id === v.open?.id,
            tap: open,
            none: 'No letters.',
            scrolls: { keep: 'mail' },
          }
        ),
      ],
      {
        cls: 'cr-grow',
        aside: `${v.letters.filter((l) => l.unread).length} unread`,
      }
    );

  /** The open letter: who sent it, its words, what it names, its answers; the letters either side of it. */
  const letter = (d: Dyed<MailPaper>, shown: readonly Letter[]) => {
    const o = d.view.open;
    const at = o ? shown.findIndex((l) => l.id === o.id) : -1;
    const near = (by: -1 | 1) => {
      const to = at < 0 ? (by > 0 ? shown[0] : undefined) : shown[at + by];
      return button(by < 0 ? 'Newer' : 'Older', to ? open(to) : () => {}, {
        kind: 'plain',
        off: !to,
      });
    };
    const steps = el('div', 'ml-steps', near(-1), near(1));
    if (!o)
      return sheet(
        'Letter',
        [el('div', 'ml-none', label('No letter is open.')), steps],
        { cls: 'cr-grow' }
      );
    const lapse = o.options[o.options.length - 1]?.text;
    return sheet(
      o.about,
      [
        who(
          {
            jacket: jacketOf(o.face, d.dyes),
            name: o.subject,
            said: el(
              'span',
              '',
              'From ',
              o.sender === null ? o.from : link(o.from, profile(o.sender))
            ),
          },
          40,
          'beside'
        ),
        el(
          'div',
          'ml-words',
          el('p', '', o.body),
          o.names.length > 0 &&
            el(
              'div',
              'ml-names',
              label('Named'),
              ...o.names.map((n) => link(n.name, () => office.ask(n.ask)))
            )
        ),
        o.options.length > 0 &&
          el(
            'div',
            'ml-answers',
            label(
              o.answer !== null
                ? `You answered: ${o.options[o.answer]?.text ?? ''}.`
                : `Your answer. Left unanswered, it comes to “${lapse ?? ''}”.`
            ),
            ...o.options.map(({ text, hint }, option) =>
              el(
                'div',
                '',
                button(
                  text,
                  () =>
                    office.ask({
                      kind: 'send',
                      command: { kind: 'AnswerDilemma', mail: o.id, option },
                    }),
                  {
                    kind:
                      o.answer === null || o.answer === option
                        ? 'act'
                        : 'plain',
                    off: o.answer !== null,
                  }
                ),
                el('p', '', hint)
              )
            )
          ),
        steps,
      ],
      { cls: 'cr-grow', aside: o.date }
    );
  };

  return {
    el: root,
    show(d) {
      const shown = shownOf(d.view);
      root.replaceChildren(
        column(list(d.view, shown)),
        column(letter(d, shown))
      );
    },
  };
}

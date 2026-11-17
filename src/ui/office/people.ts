// What the people screens (crew, profile, offer, market, career, jobs) draw alike: a gull as a table's cell (headshot,
// name, a line under it), stars from a Range, a button shut with its reason beside it, and a row of a figure.

import type { Face, Figure } from '../../office';
import type { Act, JobCard, Range } from '../../office-people';
import { emblem } from '../emblem';
import { PAPER, crewInk, svg } from '../ink';
import { button, type ButtonKind } from '../kit/button';
import { card } from '../kit/card';
import { figure } from '../kit/figure';
import { headshot } from '../kit/headshot';
import { make } from '../kit/part';
import { stars } from '../kit/stars';
import type { Send } from './screen';

/** A gull in a table's cell: their headshot at 40, their name, and a faint line under it. */
export function whoCell(el: HTMLElement, face: Face | null, name: string, under: string) {
  const box = make('div', 'o-who-cell', el);
  if (face) {
    const h = headshot(40);
    h.set(face);
    box.appendChild(h.el);
  }
  const text = make('div', '', box);
  make('div', 'bold', text, name);
  if (under) make('div', 'small faint', text, under);
}

/** Stars from a Range: exact once known, else the range hatched; potential in outline. */
export function rangeStars(el: HTMLElement, r: Range, potential: Range | null, size = 14) {
  const s = stars(size);
  s.set({ stars: r.lo, hi: r.known ? undefined : r.hi, potential: potential ? potential.hi : undefined });
  el.appendChild(s.el);
  return s;
}

/** A button whose Act may shut it: the reason said under it, small, while it is shut. */
export function actButton(label: string, act: () => void, kind: ButtonKind = 'plain') {
  const el = make('div', ''), b = button(label, act, kind), why = make('div', 'small faint', undefined);
  el.append(b.el, why);
  Object.assign(el.style, { display: 'flex', flexDirection: 'column', gap: '2px', minWidth: '0' });
  return {
    el,
    set(a: Act, text = label) {
      b.set({ label: text, disabled: !a.ok });
      why.textContent = a.ok ? '' : a.why;
      why.style.display = a.ok ? 'none' : '';
    },
  };
}

/** A row of a figure with its label (.o-lines). */
export function figRow(parent: HTMLElement, label: string, page: () => HTMLElement) {
  const row = make('div', 'o-lines', parent);
  const l = make('span', '', row, label), f = figure(page);
  row.appendChild(f.el);
  return { row, set: (fig: Figure, text = label) => { l.textContent = text; f.set(fig); } };
}

/** A crew's offer of its manager's post: its emblem and name, its elder, league, standing and target, budget and
 *  when the offer lapses; Take (shut with its reason) and Decline. */
export function jobCard(parent: HTMLElement, j: JobCard, send: Send) {
  const el = make('div', 'o-job', parent);
  const head = make('div', 'o-job-head', el);
  head.innerHTML = svg(44, 44, emblem(j.emblem, 22, 22, 40, { ink: crewInk(j.colours.first), ground: PAPER }));
  const title = make('div', '', head);
  make('div', 'bold o-job-name', title, j.name);
  make('div', 'small faint', title, `${j.league} · ${j.standing}`);
  const elder = card();
  elder.set({ face: j.elderFace, name: j.elder, line: 'Elder', rating: null, tags: [{ text: `Target ${j.target}` }], lines: [{ label: 'Expires', amount: j.expires }] });
  el.appendChild(elder.el);
  const budget = figRow(el, 'Budget', () => send.page());
  budget.set(j.budget);
  const ways = make('div', 'o-job-ways', el);
  const take = actButton('Take the post', () => void send.command({ kind: 'TakeJob', crew: j.crew }), 'primary');
  take.set(j.take);
  ways.append(take.el, button('Decline', () => void send.command({ kind: 'DeclineJob', crew: j.crew }), 'quiet').el);
  return el;
}

/** A column laid out top to bottom with `gap` px between. */
export function column(el: HTMLElement, gap = 10) {
  Object.assign(el.style, { display: 'flex', flexDirection: 'column', gap: `${gap}px` });
  return el;
}

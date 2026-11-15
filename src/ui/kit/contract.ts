// Contract: an offer as a document in a double rule: its heading, its terms as dotted lines of label and figure, and
// the two parties' lines to sign, with a stamp (stamp.ts) pressed on it when it is signed or refused.

import type { Line } from '../../office';
import { make, type Part } from './part';
import { stamp } from './stamp';

export interface ContractView { title: string; terms: readonly Line[]; parties: readonly [string, string]; verdict: 'signed' | 'refused' | null }

/** A contract. */
export function contract(): Part<ContractView> {
  const el = make('div', 'k-contract'), title = make('h4', '', el), terms = make('div', '', el);
  const sign = make('div', 'sign', el), a = make('div', '', sign), b = make('div', '', sign);
  const mark = stamp();
  Object.assign(mark.el.style, { position: 'absolute', right: '24px', bottom: '40px' });
  el.appendChild(mark.el);
  let verdict: ContractView['verdict'] = null;
  return {
    el,
    set(c) {
      title.textContent = c.title;
      terms.textContent = '';
      for (const t of c.terms) {
        const l = make('div', 'l', terms);
        make('span', '', l, t.label);
        make('span', 'num', l, t.amount);
      }
      a.textContent = c.parties[0];
      b.textContent = c.parties[1];
      mark.el.style.display = c.verdict ? '' : 'none';
      if (c.verdict) mark.set({ text: c.verdict === 'signed' ? 'Signed' : 'Refused', tone: c.verdict === 'signed' ? 'good' : 'harm', press: c.verdict !== verdict });
      verdict = c.verdict;
    },
  };
}

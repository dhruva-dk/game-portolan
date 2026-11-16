// offer (Phase C section 7): the terms put to a gull, set with steppers and segmented controls (status, the one
// replaced, wage, fee, length, the bonuses, a break clause), each beside what they ask or countered; what it costs now,
// a race, and the Coin left. Their side: how the terms meet their wants, their patience in pips, the last answer, the
// offers before, who else is talking to them. Send, Accept their terms, Withdraw; locked while they think or are
// silent; SIGNED stamped once theirs.

import type { Offer } from '../../office';
import type { OfferView } from '../../office-people';
import { segmented } from '../kit/segmented';
import { headshot } from '../kit/headshot';
import { meter } from '../kit/meter';
import { make, type Part } from '../kit/part';
import { panel } from '../kit/panel';
import { stamp } from '../kit/stamp';
import { stepper } from '../kit/stepper';
import { tag } from '../kit/tag';
import { FOCUS } from './focus';
import { actButton, column, figRow, rangeStars } from './people';
import type { Screen, Send } from './screen';

const coins = (n: number) => n.toLocaleString('en-GB');

/** A term's row: its label, its control, and what they ask (or countered) beside it. */
function term(parent: HTMLElement, label: string, control: { el: HTMLElement }) {
  const row = make('div', 'o-term', parent);
  make('span', 'o-term-l', row, label);
  row.appendChild(control.el);
  const said = make('span', 'small faint num', row);
  return { row, said };
}

export function createOffer(send: Send): Screen<OfferView> {
  const el = make('div', '');
  Object.assign(el.style, { inset: '0' });
  const page = () => send.page();
  let v: OfferView | null = null;
  /** The draft with one term changed, drawn again. */
  const edit = (change: Partial<Offer>) => {
    if (!v) return;
    FOCUS.draft = { ...v.draft, ...change };
    show(send.desk().offer(v.id, FOCUS.draft));
  };

  // the terms
  const terms = panel({ from: 1, to: 7, top: 0, height: 724 }, { title: 'Offer' });
  column(terms.body, 0);
  const head = make('div', 'o-row', terms.body);
  head.style.gridTemplateColumns = '96px 1fr auto';
  const face = headshot(96);
  head.appendChild(face.el);
  const who = make('div', '', head), name = make('div', 'bold', who), sub = make('div', 'small faint', who);
  const rating = make('div', '', who);
  const state = make('div', '', head);

  const grid = make('div', 'o-terms', terms.body);
  const status = choices((id) => edit({ status: id as Offer['status'] }));
  const statusRow = term(grid, 'Post', status);
  const replaces = choices((id) => edit({ replaces: id === '' ? null : Number(id) }));
  const replacesRow = term(grid, 'Replaces', replaces);
  let wage = stepper({ min: 0, max: 1, step: 5 }, (n) => edit({ wage: n }));
  const wageRow = term(grid, 'Wage a race', wage);
  let fee = stepper({ min: 0, max: 1, step: 25 }, (n) => edit({ fee: n }));
  const feeRow = term(grid, 'Signing fee', fee);
  const length = segmented(['1', '2', '3'].map((n) => ({ id: n, label: `${n} season${n === '1' ? '' : 's'}` })), (id) => edit({ seasons: Number(id) as 1 | 2 | 3 }));
  const lengthRow = term(grid, 'Length', length);
  let podium = stepper({ min: 0, max: 1, step: 5 }, (n) => edit({ podium: n }));
  const podiumRow = term(grid, 'Podium bonus', podium);
  let sinking = stepper({ min: 0, max: 1, step: 5 }, (n) => edit({ sinking: n }));
  const sinkingRow = term(grid, 'Sinking bonus', sinking);
  const clause = make('div', 'o-row');
  clause.style.gridTemplateColumns = 'auto 1fr';
  const hasClause = segmented([{ id: 'no', label: 'None' }, { id: 'yes', label: 'Set' }], (id) => edit({ breakClause: id === 'no' ? null : (v?.most.breakClause ?? 100) / 2 }));
  let breakAt = stepper({ min: 0, max: 1, step: 50 }, (n) => edit({ breakClause: n }));
  clause.append(hasClause.el, breakAt.el);
  const clauseRow = term(grid, 'Break clause', { el: clause });

  /** Steppers' bounds follow the gull (their most), so each is made again when the bounds change. */
  let bounds = '';
  const rebound = (view: OfferView) => {
    const key = JSON.stringify(view.most);
    if (key === bounds) return;
    bounds = key;
    const swap = (old: Part<number>, row: { row: HTMLElement }, made: Part<number>) => { row.row.replaceChild(made.el, old.el); return made; };
    wage = swap(wage, wageRow, stepper({ min: 5, max: view.most.wage, step: 5, format: coins }, (n) => edit({ wage: n })));
    fee = swap(fee, feeRow, stepper({ min: 0, max: view.most.fee, step: 25, format: coins }, (n) => edit({ fee: n })));
    podium = swap(podium, podiumRow, stepper({ min: 0, max: view.most.bonus, step: 5, format: coins }, (n) => edit({ podium: n })));
    sinking = swap(sinking, sinkingRow, stepper({ min: 0, max: view.most.bonus, step: 5, format: coins }, (n) => edit({ sinking: n })));
    const made = stepper({ min: 50, max: view.most.breakClause, step: 50, format: coins }, (n) => edit({ breakClause: n }));
    clause.replaceChild(made.el, breakAt.el);
    breakAt = made;
  };

  const costs = make('div', 'o-costs', terms.body);
  const now = figRow(costs, 'Cost now', page), perRace = figRow(costs, 'A race', page), left = figRow(costs, 'Coin left', page);
  const signedStamp = stamp();
  terms.el.appendChild(signedStamp.el);
  signedStamp.el.classList.add('o-signed');

  // their side
  const side = panel({ from: 8, to: 12, top: 0, height: 724 }, { title: 'Their Side' });
  column(side.body, 4);
  make('div', 'o-label', side.body, 'Wants met');
  const wants = column(make('div', '', side.body), 6);
  const unknown = make('div', 'faint', side.body, 'Unscouted');
  const pipsRow = make('div', 'o-lines', side.body);
  make('span', '', pipsRow, 'Patience');
  const pips = make('span', 'o-pips', pipsRow);
  const lastRow = make('div', 'o-lines', side.body);
  make('span', '', lastRow, 'Last answer');
  const last = make('span', 'bold', lastRow);
  make('div', 'o-label', side.body, 'Earlier');
  const earlier = make('div', 'o-lines', side.body);
  make('div', 'o-label', side.body, 'Also talking');
  const rivals = make('div', '', side.body);
  const ways = column(make('div', '', side.body), 8);
  ways.style.marginTop = 'auto';
  const sendIt = actButton('Send', () => {
    if (!v) return;
    const draft = v.draft;
    void send.command({ kind: 'OfferContract', gull: v.id, offer: draft }).then((ok) => { if (ok) FOCUS.draft = null; });
  }, 'primary');
  const accept = actButton('Accept their terms', () => { if (v) void send.command({ kind: 'AcceptCounter', gull: v.id }); });
  const withdraw = actButton('Withdraw', () => { if (v) void send.command({ kind: 'WithdrawOffer', gull: v.id }); }, 'quiet');
  ways.append(sendIt.el, accept.el, withdraw.el);

  el.append(terms.el, side.el);

  function show(view: OfferView) {
    const fresh = v?.id !== view.id || v?.state !== view.state;
    v = view;
    const d = view.draft, c = view.counter, locked = view.state === 'waiting' || view.state === 'silent' || view.state === 'signed';
    terms.set({ title: 'Offer', note: view.crew });
    face.set(view.face);
    name.textContent = view.name;
    sub.textContent = `${view.roleName} · asks ${coins(view.ask.wage)} a race`;
    rating.textContent = '';
    rangeStars(rating, view.stars, null, 14);
    state.textContent = '';
    state.appendChild(tag({ text: view.stateText, tone: view.state === 'countered' ? 'good' : view.state === 'silent' ? 'harm' : undefined }).el);

    rebound(view);
    statusRow.row.style.display = view.statuses.length > 1 ? '' : 'none';
    status.set(view.statuses.map((x) => ({ id: x.id, label: x.label })), d.status);
    replacesRow.row.style.display = view.replaces.length > 1 ? '' : 'none';
    replaces.set(view.replaces.map((x) => ({ id: x.id === null ? '' : String(x.id), label: x.label })), d.replaces === null ? '' : String(d.replaces));
    wage.set(d.wage);
    fee.set(d.fee);
    length.set(String(d.seasons));
    podium.set(d.podium);
    sinking.set(d.sinking);
    hasClause.set(d.breakClause === null ? 'no' : 'yes');
    breakAt.el.style.visibility = d.breakClause === null ? 'hidden' : '';
    if (d.breakClause !== null) breakAt.set(d.breakClause);
    wageRow.said.textContent = c ? `wants ${coins(c.wage)}` : `asks ${coins(view.ask.wage)}`;
    feeRow.said.textContent = c ? `wants ${coins(c.fee)}` : `asks ${coins(view.ask.fee)}`;
    lengthRow.said.textContent = c ? `wants ${c.seasons}` : `asks ${view.ask.seasons}`;
    podiumRow.said.textContent = c ? `wants ${coins(c.podium)}` : '';
    sinkingRow.said.textContent = c ? `wants ${coins(c.sinking)}` : '';
    clauseRow.said.textContent = c ? `wants ${c.breakClause === null ? 'none' : coins(c.breakClause)}` : '';
    statusRow.said.textContent = c && c.status !== d.status ? `wants ${view.statuses.find((x) => x.id === c.status)?.label ?? ''}` : '';
    grid.classList.toggle('o-locked', locked);
    now.set(view.cost.now);
    perRace.set(view.cost.perRace);
    left.set(view.cost.left);
    signedStamp.el.style.display = view.state === 'signed' ? '' : 'none';
    if (view.state === 'signed') signedStamp.set({ text: 'Signed', tone: 'good', press: fresh });

    wants.textContent = '';
    for (const w of view.wants) {
      const m = meter();
      m.set({ label: w.label, value: w.value * 100, text: w.text });
      wants.appendChild(m.el);
    }
    unknown.style.display = view.wants.length ? 'none' : '';
    pips.textContent = '';
    for (let i = 0; i < view.patience.of; i++) make('i', i < view.patience.left ? 'on' : '', pips);
    pips.setAttribute('aria-label', `${view.patience.left} of ${view.patience.of}`);
    last.textContent = view.last ?? 'None';
    earlier.textContent = '';
    for (const e of view.earlier) {
      make('span', '', earlier, e.day);
      make('span', '', earlier, e.answer);
    }
    if (!view.earlier.length) make('span', 'faint', earlier, 'None');
    rivals.textContent = '';
    for (const r of view.rivals) rivals.appendChild(tag({ text: r, tone: 'harm' }).el);
    if (!view.rivals.length) make('span', 'faint', rivals, 'None');
    sendIt.set(view.send);
    accept.set(view.accept);
    withdraw.set(view.withdraw);
  }

  return { el, show };
}

/** A segmented control whose choices differ by gull (a role's posts, the ones it could replace): made again when
 *  they change, in a box that stays. */
function choices(pick: (id: string) => void) {
  const el = make('div', '');
  let key = '', part: Part<string> | null = null;
  return {
    el,
    set(list: readonly { id: string; label: string }[], at: string) {
      const k = JSON.stringify(list);
      if (k !== key || !part) {
        key = k;
        part = segmented(list, pick);
        el.replaceChildren(part.el);
      }
      part.set(at);
    },
  };
}

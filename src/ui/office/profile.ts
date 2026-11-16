// profile (Phase C section 7): any gull, of any role, as the player's crew sees them. Columns 1–4: the headshot at
// 240, name, role, age, colony and crew, stars (a range until scouted), traits, morale, marketability and wants. 5–9:
// the stats as bars with their ceilings and arrows, the role's own figures, and the seasons behind them. 10–12: the
// contract and what can be done (Scout, Make offer, Renew, Dismiss: each shut with its reason), Pin, Back. Dismiss
// asks first, saying what is owed.

import type { HistoryLine, ProfileView } from '../../office-people';
import { button } from '../kit/button';
import { contract } from '../kit/contract';
import { dialog, type Dialog } from '../kit/dialog';
import { empty } from '../kit/empty';
import { figure } from '../kit/figure';
import { headshot } from '../kit/headshot';
import { meter } from '../kit/meter';
import { make } from '../kit/part';
import { panel } from '../kit/panel';
import { stars } from '../kit/stars';
import { statBar } from '../kit/statbar';
import { table } from '../kit/table';
import { tag } from '../kit/tag';
import { FOCUS } from './focus';
import { actButton, column, figRow } from './people';
import type { Screen, Send } from './screen';

/** A level out of 100 with its figure: the label and figure on a line, the bar under. */
function level(parent: HTMLElement, label: string, page: () => HTMLElement) {
  const box = make('div', '', parent), f = figRow(box, label, page), m = meter();
  box.appendChild(m.el);
  m.el.classList.add('o-bare');
  return { el: box, set: (fig: ProfileView['marketability']) => { f.set(fig); m.set({ label: '', value: fig.value, text: ' ' }); } };
}

export function createProfile(send: Send): Screen<ProfileView> {
  const el = make('div', '');
  Object.assign(el.style, { inset: '0' });
  const page = () => send.page();
  let v: ProfileView | null = null;

  // who they are
  const who = panel({ from: 1, to: 4, top: 0, height: 724 }, { title: 'Profile' });
  column(who.body, 8);
  const face = headshot(240);
  who.body.appendChild(face.el);
  face.el.style.alignSelf = 'center';
  const name = make('div', 'o-big', who.body), line = make('div', 'small caps faint', who.body), crew = make('div', '', who.body);
  const rating = stars(22);
  who.body.appendChild(rating.el);
  const traits = make('div', '', who.body);
  const morale = level(who.body, 'Morale', page), market = level(who.body, 'Marketability', page);
  make('div', 'o-label', who.body, 'Wants');
  const wants = make('div', '', who.body);

  // what they can do
  const stats = panel({ from: 5, to: 9, top: 0, height: 468 }, { title: 'Attributes' });
  const bars = column(make('div', '', stats.body), 6);
  const unscouted = empty();
  unscouted.set({ mark: 'tab.market', title: 'Unscouted', sentence: '' });
  stats.body.appendChild(unscouted.el);
  Object.assign(unscouted.el.style, { minHeight: '0', height: '100%' });
  const post = make('div', 'o-label', stats.body, 'At the post');
  const specifics = make('div', '', stats.body);
  Object.assign(specifics.style, { display: 'grid', gridTemplateColumns: '1fr 1fr', columnGap: '24px' });

  const history = panel({ from: 5, to: 9, top: 484, height: 240 }, { title: 'History' });
  const seasons = table<HistoryLine>([
    { label: 'Sea.', width: '44px', cell: (r, c) => { c.textContent = r.season; } },
    { label: 'Crew', width: '1fr', cell: (r, c) => { c.textContent = r.crew; } },
    { label: 'League', width: '64px', cell: (r, c) => { c.textContent = r.league; } },
    { label: 'Races', width: '48px', align: 'right', cell: (r, c) => { c.textContent = String(r.races); } },
    { label: 'Best', width: '40px', align: 'right', cell: (r, c) => { c.textContent = r.best; } },
    { label: 'Pts', width: '36px', align: 'right', cell: (r, c) => { c.textContent = String(r.points); } },
    { label: 'Sunk', width: '40px', align: 'right', cell: (r, c) => { c.textContent = String(r.sinkings); } },
  ], { row: 36 });
  history.body.appendChild(seasons.el);
  seasons.el.style.height = '172px';
  const noHistory = make('div', 'faint', history.body, 'No seasons yet');

  // the contract and the ways
  const deal = panel({ from: 10, to: 12, top: 0, height: 724 }, { title: 'Contract' });
  column(deal.body, 10);
  const paper = contract();
  deal.body.appendChild(paper.el);
  const free = make('div', 'faint', deal.body, 'Free agent');
  const talk = make('div', 'bold', deal.body);
  const ways = column(make('div', '', deal.body), 8);
  ways.style.marginTop = 'auto';
  const scout = actButton('Scout', () => { if (v?.scout.scout != null) void send.command({ kind: 'StartScout', scout: v.scout.scout, gull: v.id }); });
  const offer = actButton('Make offer', () => toOffer(), 'primary');
  const renew = actButton('Renew', () => toOffer());
  const dismiss = actButton('Dismiss', () => sure().open(), 'danger');
  const pin = button('Pin', () => {
    if (!v) return;
    const at = FOCUS.shortlist.indexOf(v.id);
    if (at < 0) FOCUS.shortlist.push(v.id);
    else FOCUS.shortlist.splice(at, 1);
    show(v);
  }, 'plain', 'tab.market');
  const back = button('Back', () => send.tap(FOCUS.back), 'quiet');
  ways.append(scout.el, offer.el, renew.el, dismiss.el, pin.el, back.el);

  let box: Dialog | null = null, owed: ReturnType<typeof figure> | null = null;
  const sure = () => {
    if (box) return box;
    const d = dialog(page(), 'Dismiss', { from: 4, to: 9, top: 220, height: 230 });
    const row = make('div', 'o-lines', d.body);
    make('span', '', row, 'Wages owed');
    owed = figure(page);
    row.appendChild(owed.el);
    if (v) owed.set(v.dismiss.owed);
    d.foot.append(button('Keep', () => d.close(), 'plain').el, button('Dismiss', () => {
      d.close();
      if (v) void send.command({ kind: 'Dismiss', gull: v.id });
    }, 'danger').el);
    box = d;
    return d;
  };
  const toOffer = () => {
    if (!v) return;
    FOCUS.gull = v.id;
    FOCUS.draft = null;
    send.tap('offer');
  };

  el.append(who.el, stats.el, history.el, deal.el);

  function show(view: ProfileView) {
    v = view;
    who.set({ title: view.roleName, note: view.known ? '' : 'Unscouted' });
    face.set(view.face);
    name.textContent = view.name;
    line.textContent = `${view.roleName} · ${view.age} · ${view.colony}`;
    crew.textContent = view.contract ? [view.crew, view.league, view.post].filter(Boolean).join(' · ') : 'Free agent';
    rating.set({ stars: view.stars.lo, hi: view.stars.known ? undefined : view.stars.hi, potential: view.potential.hi });
    traits.textContent = '';
    for (const t of view.traits) traits.appendChild(tag({ text: t }).el);
    morale.el.style.display = view.morale ? '' : 'none';
    if (view.morale) morale.set(view.morale);
    market.set(view.marketability);
    wants.textContent = '';
    if (view.wants) for (const w of view.wants) wants.appendChild(tag({ text: w.label }).el);
    else make('span', 'faint', wants, '?  ?  ?');

    bars.textContent = '';
    for (const st of view.stats) {
      const b = statBar();
      b.set({ label: st.label, value: st.value, max: 20, mark: st.ceiling, arrow: st.arrow, text: st.text });
      bars.appendChild(b.el);
    }
    unscouted.set({ mark: 'tab.market', title: view.statsNote, sentence: '' });
    unscouted.el.style.display = view.stats.length ? 'none' : '';
    post.style.display = view.specifics.length ? '' : 'none';
    specifics.textContent = '';
    for (const sp of view.specifics) figRow(specifics, sp.label, page).set(sp.figure);
    seasons.set({ rows: view.history });
    seasons.el.style.display = view.history.length ? '' : 'none';
    noHistory.style.display = view.history.length ? 'none' : '';

    paper.el.style.display = view.contract ? '' : 'none';
    if (view.contract) paper.set({ ...view.contract, verdict: null });
    free.style.display = view.contract ? 'none' : '';
    talk.textContent = view.talk ?? '';
    scout.set(view.scout, view.scout.label);
    offer.set(view.offer);
    renew.set(view.renew);
    dismiss.set(view.dismiss);
    for (const [b, show] of [[scout, !view.mine && !view.you], [offer, !view.mine && !view.you], [renew, view.mine], [dismiss, view.mine]] as const) b.el.style.display = show ? '' : 'none';
    pin.el.style.display = view.mine || view.you ? 'none' : '';
    pin.set({ label: FOCUS.shortlist.includes(view.id) ? 'Unpin' : 'Pin to shortlist' });
    if (owed) owed.set(view.dismiss.owed);
  }
  return { el, show };
}

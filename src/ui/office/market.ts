// market (Phase C section 7): two sub-tabs. Gulls: the filter (role, league, contract, known only, stars at least;
// columns 1–3), every gull it lets through in one table (4–9; a row opens the profile), the shortlist pinned from
// profiles (10–12). Scouts: each scout, whom they are reading and the days left, with Cancel (1–8), and the crow's
// nest that sets how many there may be (9–12).

import type { MarketFilter, MarketRow, MarketView, ScoutRow } from '../../office-people';
import type { Role } from '../../office';
import { button } from '../kit/button';
import { figure } from '../kit/figure';
import { make, tappable } from '../kit/part';
import { panel, place } from '../kit/panel';
import { segmented } from '../kit/segmented';
import { stars } from '../kit/stars';
import { stepper } from '../kit/stepper';
import { table } from '../kit/table';
import { subTabs } from '../kit/tabs';
import { tag } from '../kit/tag';
import { FOCUS, openProfile } from './focus';
import { column, figRow, rangeStars, whoCell } from './people';
import type { Screen, Send } from './screen';

const TOP = 56, H = 724 - TOP;
const LEAGUE = [{ id: 'any', label: 'Any' }, { id: '0', label: '1' }, { id: '1', label: '2' }, { id: '2', label: '3' }, { id: '3', label: 'None' }];
const CONTRACT = [{ id: 'any', label: 'Any' }, { id: 'free', label: 'Free' }, { id: 'closing', label: 'Ending' }];

/** The market's columns: the gull (and their crew, or the talk under way), age, stars, contract, ask. */
const gullColumns = () => [
  { label: 'Gull', width: '1fr', cell: (r: MarketRow, c: HTMLElement) => whoCell(c, r.face, r.name, r.crew) },
  { label: 'Age', width: '36px', align: 'right' as const, cell: (r: MarketRow, c: HTMLElement) => { c.textContent = String(r.age); } },
  { label: 'Stars', width: '92px', cell: (r: MarketRow, c: HTMLElement) => { rangeStars(c, r.stars, r.potential); } },
  { label: 'Ends', width: '112px', cell: (r: MarketRow, c: HTMLElement) => {
    if (r.talk) c.appendChild(tag({ text: r.talk, tone: r.talk === 'Silent' ? 'harm' : 'good' }).el);
    else c.textContent = r.contract;
  } },
  { label: 'Asks', width: '52px', align: 'right' as const, cell: (r: MarketRow, c: HTMLElement) => { c.textContent = r.ask; } },
];

export function createMarket(send: Send): Screen<MarketView> {
  const el = make('div', '');
  Object.assign(el.style, { inset: '0' });
  const page = () => send.page();
  let last: MarketView | null = null;
  const sub = subTabs([{ id: 'gulls', label: 'Gulls' }, { id: 'scouts', label: 'Scouts' }], (id) => {
    FOCUS.tab = id;
    if (last) show(last);
  });
  sub.el.classList.add('o-sub');
  place(sub.el, { from: 1, to: 3, top: 0, height: 44 });
  sub.el.style.position = 'absolute';
  /** The filter with one choice changed, drawn again. */
  const filter = (change: Partial<MarketFilter>) => {
    if (!last) return;
    FOCUS.filter = { ...last.filter, ...change };
    show(send.desk().market(FOCUS.filter, FOCUS.shortlist));
  };

  // the filter
  const filters = panel({ from: 1, to: 3, top: TOP, height: H }, { title: 'Filter' });
  make('div', 'o-label', filters.body, 'Role');
  let roleBox: HTMLElement = make('div', '', filters.body), roleKey = '', role: ReturnType<typeof segmented> | null = null;
  make('div', 'o-label', filters.body, 'League');
  const league = segmented(LEAGUE, (id) => filter({ league: id === 'any' ? null : Number(id) }));
  league.el.classList.add('o-wrap');
  filters.body.appendChild(league.el);
  make('div', 'o-label', filters.body, 'Contract');
  const contract = segmented(CONTRACT, (id) => filter({ contract: id as MarketFilter['contract'] }));
  filters.body.appendChild(contract.el);
  make('div', 'o-label', filters.body, 'Stars at least');
  const least = stepper({ min: 0, max: 5, step: 0.5, format: (n) => (n ? `${n}★` : 'Any') }, (n) => filter({ stars: n }));
  filters.body.appendChild(least.el);
  make('div', 'o-label', filters.body, 'Scouted');
  const known = segmented([{ id: 'all', label: 'All' }, { id: 'known', label: 'Known only' }], (id) => filter({ known: id === 'known' }));
  filters.body.appendChild(known.el);

  // the list
  const list = panel({ from: 4, to: 9, top: TOP, height: H }, { title: 'Gulls' });
  const rows = table<MarketRow>(gullColumns(), { row: 52, pick: (r) => openProfile(send.tap, r.id, 'market') });
  list.body.appendChild(rows.el);
  rows.el.style.height = `${H - 64}px`;
  const none = make('div', 'faint', list.body, 'No one matches');

  // the shortlist
  const pinned = panel({ from: 10, to: 12, top: TOP, height: H }, { title: 'Shortlist' });
  const shortlist = column(make('div', '', pinned.body), 0);
  const noPins = make('div', 'faint', pinned.body, 'Pin from a profile');

  // the scouts
  const scoutPanel = panel({ from: 1, to: 8, top: TOP, height: H }, { title: 'Scouts' });
  const scouts = table<ScoutRow>([
    { label: 'Scout', width: '1fr', cell: (r, c) => whoCell(c, r.face, r.name, r.reach) },
    { label: 'Stars', width: '92px', cell: (r, c) => { const s = stars(14); s.set({ stars: r.stars }); c.appendChild(s.el); } },
    { label: 'Reading', width: '1fr', cell: (r, c) => { if (r.on) c.textContent = r.on; else make('span', 'faint', c, 'Idle'); } },
    { label: 'Left', width: '112px', align: 'right', cell: (r, c) => { if (r.days) { const f = figure(page); f.set(r.days); c.appendChild(f.el); } } },
    { label: '', width: '112px', cell: (r, c) => {
      if (!r.cancel.ok) return;
      c.style.paddingLeft = '16px';
      c.appendChild(button('Cancel', () => void send.command({ kind: 'CancelScout', scout: r.id }), 'quiet').el);
    } },
  ], { row: 56 });
  scoutPanel.body.appendChild(scouts.el);
  scouts.el.style.height = `${H - 64}px`;
  const nestPanel = panel({ from: 9, to: 12, top: TOP, height: H }, { title: "Crow's Nest" });
  column(nestPanel.body, 10);
  const nest = figRow(nestPanel.body, 'Level', page);
  const seatRow = make('div', 'o-lines', nestPanel.body);
  make('span', '', seatRow, 'Scouts');
  const seats = make('span', 'o-pips o-seats', seatRow);

  el.append(sub.el, filters.el, list.el, pinned.el, scoutPanel.el, nestPanel.el);

  function show(v: MarketView) {
    last = v;
    const tab = FOCUS.tab === 'scouts' ? 'scouts' : 'gulls';
    sub.set(tab);
    for (const p of [filters.el, list.el, pinned.el]) p.style.display = tab === 'gulls' ? '' : 'none';
    for (const p of [scoutPanel.el, nestPanel.el]) p.style.display = tab === 'scouts' ? '' : 'none';

    const key = v.roles.map((r) => r.id).join();
    if (key !== roleKey) {
      roleKey = key;
      const made = segmented(v.roles, (id) => filter({ role: id as Role }));
      made.el.classList.add('o-vseg');
      roleBox.replaceWith(made.el);
      roleBox = made.el;
      role = made;
    }
    role?.set(v.filter.role);
    league.set(v.filter.league === null ? 'any' : String(v.filter.league));
    contract.set(v.filter.contract);
    least.set(v.filter.stars);
    known.set(v.filter.known ? 'known' : 'all');
    list.set({ title: v.roles.find((r) => r.id === v.filter.role)?.label ?? 'Gulls', note: v.count });
    rows.set({ rows: v.rows });
    rows.el.style.display = v.rows.length ? '' : 'none';
    none.style.display = v.rows.length ? 'none' : '';

    shortlist.textContent = '';
    for (const r of v.shortlist) {
      const row = make('div', 'o-pin', shortlist);
      whoCell(row, r.face, r.name, r.talk ?? r.ask);
      tappable(row, () => openProfile(send.tap, r.id, 'market'));
    }
    noPins.style.display = v.shortlist.length ? 'none' : '';
    pinned.set({ title: 'Shortlist', note: v.shortlist.length ? String(v.shortlist.length) : '' });

    scouts.set({ rows: v.scouts });
    nest.set(v.nest);
    seats.textContent = '';
    for (let i = 0; i < Math.max(v.nest.value, v.scouts.length); i++) make('i', i < v.scouts.length ? 'on' : '', seats);
  }
  return { el, show };
}

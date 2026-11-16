// crew (Phase C section 7): two sub-tabs. Roster: every gull of the crew by role in one table (columns 1–9; "you" at
// the head of the captains; a row opens the profile, an open post the market filtered to it), and beside it the wages
// a race, each open post's Find and the two ships' bonds (10–12). Flight: the four at their jobs, each with rating,
// fatigue, rate and botch and the job to move them to (1–8), and the order the jobs are worked in, Up and Down (9–12).

import type { RosterRow, CrewView, FlightRow, OrderRow } from '../../office-people';
import type { Job } from '../../race';
import type { Role, Status } from '../../office';
import { WASH } from '../ink';
import { button } from '../kit/button';
import { figure } from '../kit/figure';
import { headshot } from '../kit/headshot';
import { meter } from '../kit/meter';
import { make } from '../kit/part';
import { panel, place } from '../kit/panel';
import { segmented } from '../kit/segmented';
import { statBar } from '../kit/statbar';
import { table } from '../kit/table';
import { subTabs } from '../kit/tabs';
import { tag } from '../kit/tag';
import { FOCUS, openProfile } from './focus';
import { column, figRow, rangeStars, whoCell } from './people';
import type { Screen, Send } from './screen';

const JOBS: readonly Job[] = ['mend', 'gust', 'stores', 'part'];
const TOP = 56, H = 724 - TOP;

/** Opens the market on a role's open post. */
export function find(send: Send, role: Role, status: Status) {
  void status;
  FOCUS.filter = { role, league: null, contract: 'any', known: false, stars: 0 };
  send.tap('market');
}

/** A flight gull's row: headshot, name and job; rating, rate and botch; fatigue; the job to move them to. */
function flightRow(parent: HTMLElement, send: Send) {
  const page = () => send.page();
  const el = make('div', 'o-row', parent);
  Object.assign(el.style, { gridTemplateColumns: '96px 1fr 104px 104px 104px', gridTemplateRows: 'auto auto', rowGap: '6px', columnGap: '16px', padding: '10px 4px', borderBottom: '1px solid currentColor' });
  const face = headshot(96);
  face.el.style.gridRow = '1 / 3';
  el.appendChild(face.el);
  const who = make('div', '', el), name = make('div', 'bold', who), job = make('div', 'small caps faint', who);
  name.style.fontSize = '20px';
  const stat = (label: string) => {
    const box = make('div', '', el);
    make('div', 'small faint caps', box, label);
    const f = figure(page);
    box.appendChild(f.el);
    return f;
  };
  const rating = stat('Rating'), rate = stat('Rate'), botch = stat('Botch');
  const tiredBox = make('div', '', el), tired = statBar(), tiredFig = figure(page);
  make('div', 'small faint caps', tiredBox, 'Fatigue');
  const tiredLine = make('div', '', tiredBox);
  Object.assign(tiredLine.style, { display: 'flex', alignItems: 'center', gap: '10px' });
  tired.el.classList.add('o-mini');
  tired.el.style.flex = '1';
  tiredLine.append(tired.el, tiredFig.el);
  const moveBox = make('div', '', el);
  moveBox.style.gridColumn = '3 / 6';
  return (r: FlightRow | null) => {
    el.style.display = r ? '' : 'none';
    if (!r) return;
    face.set(r.face);
    name.textContent = r.name;
    job.textContent = r.jobName;
    rating.set(r.rating);
    rate.set(r.rate);
    botch.set(r.botch);
    tiredFig.set(r.fatigue);
    tired.set({ label: '', value: r.fatigue.value, max: 100, text: '', wash: r.fatigue.value > 66 ? WASH.vermilion : r.fatigue.value > 33 ? WASH.ochre : WASH.viridian });
    moveBox.textContent = '';
    const s = segmented(JOBS.map((j) => ({ id: j, label: j === r.job ? r.jobName : r.moves.find((m) => m.job === j)?.label ?? j })),
      (j) => { if (j !== r.job) void send.command({ kind: 'MoveFlightJob', gull: r.id, job: j as Job }); });
    s.set(r.job);
    moveBox.appendChild(s.el);
  };
}

export function createCrew(send: Send): Screen<CrewView> {
  const el = make('div', '');
  Object.assign(el.style, { inset: '0' });
  const page = () => send.page();
  let last: CrewView | null = null;
  const sub = subTabs([{ id: 'roster', label: 'Roster' }, { id: 'flight', label: 'Flight' }], (id) => {
    FOCUS.tab = id;
    if (last) show(last);
  });
  sub.el.classList.add('o-sub');
  place(sub.el, { from: 1, to: 3, top: 0, height: 44 });
  sub.el.style.position = 'absolute';

  // the roster
  const roster = panel({ from: 1, to: 9, top: TOP, height: H }, { title: 'Roster' });
  const rows = table<RosterRow>([
    { label: 'Gull', width: '1fr', cell: (r, c) => {
      (c.parentElement as HTMLElement).classList.toggle('o-head', r.kind === 'head');
      (c.parentElement as HTMLElement).classList.toggle('o-open', r.kind === 'open');
      if (r.kind === 'gull') whoCell(c, r.face, r.title, r.tags.join(' · '));
      else c.textContent = r.title;
    } },
    { label: 'Post', width: '84px', cell: (r, c) => { c.textContent = r.kind === 'head' ? '' : r.post; } },
    { label: 'Age', width: '36px', align: 'right', cell: (r, c) => { c.textContent = r.age; } },
    { label: 'Stars', width: '92px', cell: (r, c) => { if (r.stars) rangeStars(c, r.stars, r.potential); } },
    { label: 'Morale', width: '104px', cell: (r, c) => {
      if (r.morale == null) return;
      const m = statBar();
      m.set({ label: '', value: r.morale, max: 100, wash: r.morale < 34 ? WASH.vermilion : r.morale < 67 ? WASH.ochre : WASH.viridian });
      m.el.classList.add('o-mini');
      c.appendChild(m.el);
    } },
    { label: 'Wage', width: '72px', align: 'right', cell: (r, c) => { c.textContent = r.wage; } },
    { label: 'Ends', width: '116px', align: 'right', cell: (r, c) => {
      if (r.kind === 'open') c.appendChild(tag({ text: 'Find', tone: 'harm' }).el);
      else c.textContent = r.ends;
    } },
  ], { row: 52, pick: (r) => {
    if (r.kind === 'gull' && r.id != null) openProfile(send.tap, r.id, 'crew');
    else if (r.kind === 'open' && r.find) find(send, r.find.role, r.find.status);
  } });
  roster.body.appendChild(rows.el);
  rows.el.style.height = `${H - 64}px`;

  const side = panel({ from: 10, to: 12, top: TOP, height: H }, { title: 'Wages and Bonds' });
  column(side.body);
  const wages = figRow(side.body, 'Wages a race', page);
  make('div', 'o-label', side.body, 'Open posts');
  const open = column(make('div', '', side.body), 8);
  make('div', 'o-label', side.body, 'Bonds');
  const bonds = [0, 1].map(() => {
    const f = figRow(side.body, '', page), m = meter();
    side.body.appendChild(m.el);
    return { f, m };
  });

  // the flight
  const flight = panel({ from: 1, to: 8, top: TOP, height: H }, { title: 'The Flight' });
  column(flight.body, 0);
  const flightRows = Array.from({ length: 4 }, () => flightRow(flight.body, send));

  const orderPanel = panel({ from: 9, to: 12, top: TOP, height: H }, { title: 'Job Order' });
  const orderRows = table<OrderRow & { n: number }>([
    { label: '#', width: '24px', align: 'right', cell: (r, c) => { c.textContent = String(r.n); } },
    { label: 'Job', width: '1fr', cell: (r, c) => whoCell(c, null, r.label, r.who) },
    { label: '', width: '112px', cell: (r, c) => {
      Object.assign(c.style, { display: 'flex', gap: '10px' });
      for (const [label, plan] of [['▲', r.up], ['▼', r.down]] as const) {
        const b = button(label, () => { if (plan) void send.command({ kind: 'SetPlan', plan }); }, 'plain');
        b.set({ label, disabled: !plan });
        b.el.setAttribute('aria-label', `${r.label} ${label === '▲' ? 'up' : 'down'}`);
        c.appendChild(b.el);
      }
    } },
  ], { row: 56 });
  orderPanel.body.appendChild(orderRows.el);
  orderRows.el.style.height = `${4 * 56 + 36}px`;
  const orderWhy = make('div', 'small faint', orderPanel.body);
  orderWhy.style.marginTop = '8px';

  el.append(sub.el, roster.el, side.el, flight.el, orderPanel.el);

  function show(v: CrewView) {
    last = v;
    const tab = FOCUS.tab === 'flight' ? 'flight' : 'roster';
    sub.set(tab);
    for (const p of [roster.el, side.el]) p.style.display = tab === 'roster' ? '' : 'none';
    for (const p of [flight.el, orderPanel.el]) p.style.display = tab === 'flight' ? '' : 'none';
    const gulls = v.roster.filter((r) => r.kind === 'gull').length;
    roster.set({ title: 'Roster', note: `${gulls} gulls${v.open.length ? ` · ${v.open.length} open` : ''}` });
    rows.set({ rows: v.roster, mine: (r) => r.you });
    wages.set(v.wages);
    open.textContent = '';
    for (const o of v.open) open.appendChild(button(`Find · ${o.label}`, () => find(send, o.role, o.status), 'plain', 'tab.market').el);
    if (!v.open.length) make('div', 'faint', open, 'None');
    v.bonds.forEach((b, i) => {
      bonds[i].f.set(b.bond, b.label);
      bonds[i].m.set({ label: '', value: b.fill, text: ' ' });
    });
    flight.set({ title: 'The Flight', note: `${v.flight.length} of 4` });
    flightRows.forEach((f, i) => f(v.flight[i] ?? null));
    orderRows.set({ rows: v.order.map((o, i) => ({ ...o, n: i + 1 })) });
    orderWhy.textContent = v.orderWhy ?? '';
  }
  return { el, show };
}

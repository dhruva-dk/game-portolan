// career (Phase C section 7): the player as a manager. Columns 1–4: the headshot at 240, name, crew and age, reputation
// and its rank among managers, marketability, the elder's confidence. 5–8: the record by season, and honours. 9–12:
// the posts other crews offer, as cards to take or decline.

import type { CareerView } from '../../office-people';
import { empty } from '../kit/empty';
import { headshot } from '../kit/headshot';
import { meter } from '../kit/meter';
import { make } from '../kit/part';
import { panel } from '../kit/panel';
import { table } from '../kit/table';
import { tag } from '../kit/tag';
import { column, figRow, jobCard } from './people';
import type { Screen, Send } from './screen';

type Season = CareerView['record'][number];

export function createCareer(send: Send): Screen<CareerView> {
  const el = make('div', '');
  Object.assign(el.style, { inset: '0' });
  const page = () => send.page();

  const me = panel({ from: 1, to: 4, top: 0, height: 724 }, { title: 'Manager' });
  column(me.body, 8);
  const face = headshot(240);
  face.el.style.alignSelf = 'center';
  me.body.appendChild(face.el);
  const name = make('div', 'o-big', me.body), line = make('div', 'small caps faint', me.body);
  const reputation = figRow(me.body, 'Reputation', page), rank = figRow(me.body, 'Rank', page);
  const level = (label: string) => {
    const f = figRow(me.body, label, page), m = meter();
    m.el.classList.add('o-bare');
    me.body.appendChild(m.el);
    return { f, m };
  };
  const market = level('Marketability'), confidence = level("Elder's confidence");

  const record = panel({ from: 5, to: 8, top: 0, height: 460 }, { title: 'Record' });
  const seasons = table<Season>([
    { label: 'Sea.', width: '44px', cell: (r, c) => { c.textContent = r.season; } },
    { label: 'Crew', width: '1fr', cell: (r, c) => { c.textContent = r.crew; } },
    { label: 'League', width: '1fr', cell: (r, c) => { c.textContent = r.league; } },
    { label: 'Races', width: '48px', align: 'right', cell: (r, c) => { c.textContent = String(r.races); } },
    { label: 'Pts', width: '40px', align: 'right', cell: (r, c) => { c.textContent = String(r.points); } },
  ], { row: 36 });
  record.body.appendChild(seasons.el);
  seasons.el.style.height = '392px';
  const noRecord = make('div', 'faint', record.body, 'No seasons yet');

  const honours = panel({ from: 5, to: 8, top: 476, height: 248 }, { title: 'Honours' });
  const won = make('div', '', honours.body);
  const noHonours = make('div', 'faint', honours.body, 'None yet');

  const offers = panel({ from: 9, to: 12, top: 0, height: 724 }, { title: 'Offers' });
  const cards = column(make('div', '', offers.body), 16);
  const noOffers = empty();
  noOffers.set({ mark: 'menu.rank', title: 'No offers', sentence: '' });
  offers.body.appendChild(noOffers.el);

  el.append(me.el, record.el, honours.el, offers.el);

  function show(v: CareerView) {
    face.set(v.face);
    name.textContent = v.name;
    line.textContent = `${v.crew} · ${v.age}`;
    reputation.set(v.reputation);
    rank.set(v.rank);
    market.f.set(v.marketability);
    market.m.set({ label: '', value: v.marketability.value, text: ' ' });
    confidence.f.set(v.confidence);
    confidence.m.set({ label: '', value: v.confidence.value, text: ' ' });
    seasons.set({ rows: v.record });
    seasons.el.style.display = v.record.length ? '' : 'none';
    noRecord.style.display = v.record.length ? 'none' : '';
    won.textContent = '';
    for (const h of v.honours) won.appendChild(tag({ text: h, tone: 'good' }).el);
    noHonours.style.display = v.honours.length ? 'none' : '';
    cards.textContent = '';
    for (const j of v.offers) jobCard(cards, j, send);
    offers.set({ title: 'Offers', note: v.offers.length ? String(v.offers.length) : '' });
    noOffers.el.style.display = v.offers.length ? 'none' : '';
  }
  return { el, show };
}

// The office's two debug sheets (debug.ts ?screen=kit and ?screen=headshots), each one page laid as the office lays
// its screens, for judging the kit and the headshots by eye and for tools/capture.ts's checks. Neither is a screen of
// the game: no way leads to either.

import type { Face, Figure, LetterLine, Role } from '../../office';
import { make } from '../kit/part';
import { button } from '../kit/button';
import { card } from '../kit/card';
import { coin } from '../kit/coin';
import { contract } from '../kit/contract';
import { chartDisc } from '../kit/disc';
import { empty } from '../kit/empty';
import { figure } from '../kit/figure';
import { headshot } from '../kit/headshot';
import { letter } from '../kit/letter';
import { meter } from '../kit/meter';
import { notices } from '../kit/notice';
import { panel } from '../kit/panel';
import { plate } from '../kit/plate';
import { segmented } from '../kit/segmented';
import { stamp } from '../kit/stamp';
import { stars } from '../kit/stars';
import { statBar } from '../kit/statbar';
import { stepper } from '../kit/stepper';
import { kitStyle } from '../kit/style';
import { table } from '../kit/table';
import { subTabs } from '../kit/tabs';
import { tag } from '../kit/tag';
import { dialog } from '../kit/dialog';
import { fitted } from './office';
import { officeStyle } from './style';

/** A sheet's page, titled in the top bar's place. */
function sheetPage(title: string) {
  kitStyle();
  officeStyle();
  const root = make('div', 'o-root screen press');
  const page = make('div', 'office', root);
  const head = make('h1', 'title', page, title);
  Object.assign(head.style, { position: 'absolute', left: '16px', top: '14px', margin: '0' });
  fitted(page);
  return { root, page, grid: make('div', 'grid', page) };
}

const ROLES: readonly Role[] = ['manager', 'captain', 'bosun', 'shipwright', 'scout', 'flight', 'elder'];

/** The sheet's `i`th face: every role, every age, some free agents on paper, the rest in a crew's colours. */
const faceOf = (i: number): Face => ({
  seed: (i * 7919 + 11) >>> 0, role: ROLES[i % ROLES.length], age: 18 + ((i * 7) % 44),
  colours: i % 4 === 3 ? null : { first: i % 24, second: (i * 5 + 3) % 24 }, emblem: i % 4 === 3 ? null : i % 12,
});

const FIG = (value: number, text: string, against: Figure['against']): Figure => ({
  value, text, against, explain: { title: text, lines: [{ label: 'Wages', amount: '−420' }, { label: 'Prize money', amount: '+1,600' }] },
});

/** ?screen=kit: every part of the kit (ui/kit/), on one page. */
export function kitSheet(): HTMLElement {
  const { root, page, grid } = sheetPage('The Kit');
  const pg = () => page;
  const say = notices(page);

  const a = panel({ from: 1, to: 3, top: 0, height: 724 }, { title: 'Controls', note: 'Buttons, tabs' });
  const box = dialog(page, 'A dialog', { from: 4, to: 9, top: 160, height: 220 });
  make('p', '', box.body, 'Over a veil that takes every tap beneath it.');
  box.foot.appendChild(button('Close', () => box.close(), 'primary').el);
  for (const [label, kind] of [['Sign', 'primary'], ['Open the dialog', 'plain'], ['Sack', 'danger'], ['Quietly', 'quiet']] as const) {
    a.body.appendChild(button(label, () => (kind === 'plain' ? box.open() : say.say(`${label} pressed.`, kind === 'danger' ? 'harm' : 'good')), kind).el);
  }
  const off = button('Disabled', () => undefined, 'plain');
  off.set({ label: 'Disabled', disabled: true });
  a.body.appendChild(off.el);
  const sub = subTabs([{ id: 'roster', label: 'Roster' }, { id: 'flight', label: 'Flight' }], (id) => sub.set(id));
  sub.set('roster');
  const seg = segmented([{ id: 'all', label: 'All' }, { id: 'free', label: 'Free' }, { id: 'mine', label: 'Mine' }], (id) => seg.set(id));
  seg.set('free');
  const step = stepper({ min: 0, max: 5000, step: 250, format: (n) => `${n} a race` }, (n) => step.set(n));
  step.set(1250);
  const purse = coin(20);
  purse.set(12450);
  const tags = make('div', '');
  for (const t of [{ text: 'Veteran' }, { text: 'Injured', tone: 'harm' as const }, { text: 'Rising', tone: 'good' as const }]) tags.appendChild(tag(t).el);
  const st = stamp();
  st.set({ text: 'Signed', tone: 'good' });
  a.body.append(sub.el, seg.el, step.el, purse.el, tags, st.el);
  Object.assign(a.body.style, { display: 'flex', flexDirection: 'column', gap: '10px' });

  const b = panel({ from: 4, to: 6, top: 0, height: 724 }, { title: 'Gulls' });
  const faces = make('div', '', b.body);
  Object.assign(faces.style, { display: 'flex', gap: '12px', alignItems: 'flex-end' });
  const big = headshot(96), small = headshot(40);
  big.set(faceOf(1));
  small.set(faceOf(2));
  faces.append(big.el, small.el);
  const rating = stars(16);
  rating.set({ stars: 3.5, potential: 4.5 });
  const sb1 = statBar(), sb2 = statBar(), mood = meter();
  sb1.set({ label: 'Seamanship', value: 14, max: 20, mark: 16 });
  sb2.set({ label: 'Nerve', value: 6, max: 20 });
  mood.set({ label: 'Morale', value: 28 });
  const c = card(() => say.say('The card opens the profile.'));
  c.set({ face: faceOf(5), name: 'Henrietta Gale', line: 'Captain, 31', rating: { stars: 3, potential: 4 }, tags: [{ text: 'Free agent' }], lines: [{ label: 'Asks', amount: '900 a race' }] });
  b.body.append(rating.el, sb1.el, sb2.el, mood.el, c.el);
  Object.assign(b.body.style, { display: 'flex', flexDirection: 'column', gap: '10px' });

  const cc = panel({ from: 7, to: 9, top: 0, height: 724 }, { title: 'Figures and Parts' });
  for (const [label, f] of [
    ['Coin', FIG(12450, '12,450', { kind: 'rank', place: 4, of: 10 })],
    ['Wages a race', FIG(-420, '−420', { kind: 'change', by: -60, text: '−60 this season' })],
    ['Points', FIG(31, '31', { kind: 'rival', label: 'Leader', text: '44' })],
  ] as const) {
    const row = make('div', 'o-lines', cc.body);
    make('span', '', row, label);
    const fg = figure(pg);
    fg.set(f);
    row.appendChild(fg.el);
  }
  const disc = chartDisc(96);
  disc.set(20261115);
  const pl = plate();
  pl.set({ type: 'sails', name: 'Lateen Mk II', tags: [{ text: 'Light' }], perf: 14, perfMax: 20, reliability: 9, reliabilityMax: 20, condition: 0.42 });
  const nothing = empty();
  nothing.set({ mark: 'tab.mail', title: 'No letters', sentence: 'Letters come as the days pass.' });
  cc.body.append(disc.el, pl.el, nothing.el);
  Object.assign(cc.body.style, { display: 'flex', flexDirection: 'column', gap: '10px' });

  const d = panel({ from: 10, to: 12, top: 0, height: 724 }, { title: 'Paper' });
  const rows = table<{ n: string; p: number }>([
    { label: 'Crew', width: '1fr', cell: (r, el) => { el.textContent = r.n; } },
    { label: 'Pts', width: '48px', align: 'right', cell: (r, el) => { el.textContent = String(r.p); } },
  ], { pick: (_, i) => rows.set({ rows: ROWS, picked: i, mine: (r) => r.n === 'Portolan Quills' }) });
  const ROWS = [{ n: 'Saltmarsh Kites', p: 44 }, { n: 'Portolan Quills', p: 31 }, { n: 'Brine Wardens', p: 29 }, { n: 'Fogbank Rovers', p: 12 }];
  rows.set({ rows: ROWS, mine: (r) => r.n === 'Portolan Quills' });
  rows.el.style.height = '210px';
  const line = (id: number, unread: boolean, sealed: boolean): LetterLine => ({
    id, day: 12 - id, subject: sealed ? 'A matter of the purse' : 'The yard reports', from: sealed ? 'The elder' : 'Your shipwright',
    face: faceOf(id + 7), category: sealed ? 'elder' : 'ship', unread, sealed,
  });
  const l1 = letter(), l2 = letter();
  l1.set({ line: line(1, true, true) });
  l2.set({ line: line(2, false, false) });
  const k = contract();
  k.set({ title: 'Contract', terms: [{ label: 'Wage', amount: '900 a race' }, { label: 'Seasons', amount: '2' }], parties: ['Portolan Quills', 'Henrietta Gale'], verdict: null });
  d.body.append(rows.el, l1.el, l2.el, k.el);
  Object.assign(d.body.style, { display: 'flex', flexDirection: 'column', gap: '10px' });

  grid.append(a.el, b.el, cc.el, d.el);
  say.say('A notice: a refusal says why.', 'harm');
  return root;
}

/** ?screen=headshots: 48 gulls' headshots at 96, each captioned with role and age. */
export function headshotSheet(): HTMLElement {
  const { root, grid } = sheetPage('Headshots');
  const sheet = make('div', '', grid);
  Object.assign(sheet.style, { inset: '0', display: 'grid', gridTemplateColumns: 'repeat(8, 1fr)', rowGap: '8px', columnGap: '16px' });
  for (let i = 0; i < 48; i++) {
    const f = faceOf(i), cell = make('div', '', sheet), h = headshot(96);
    Object.assign(cell.style, { display: 'flex', flexDirection: 'column', alignItems: 'center' });
    h.set(f);
    cell.appendChild(h.el);
    make('span', 'small', cell, `${f.role}, ${f.age}${f.colours ? '' : ', free'}`);
  }
  return root;
}

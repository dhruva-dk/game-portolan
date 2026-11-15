// home, the dashboard (Phase C section 6). Above: the next race (columns 1–5, 320 px: round, planet, chart disc, days
// to go, the elder's target, the confidence meter, the patron's objective; "Race Day" on race day) and the two ships
// (columns 6–12: ship one is yours, with its bosun, bond and six part marks; ship two has her captain at 96, stars,
// morale and tags, her bosun and bond; each half opens the ship or the captain). Below: the yard and rookery (1–4), the
// table round your crew (5–8), and the four newest letters (9–12). A gear opens the settings.

import type { Building, HomeView, ShipHalf, StandingLine } from '../../office';
import type { PartType } from '../../race';
import { emblem } from '../emblem';
import { PAPER, crewInk, glyph, svg } from '../ink';
import { button } from '../kit/button';
import { chartDisc } from '../kit/disc';
import { figure } from '../kit/figure';
import { headshot } from '../kit/headshot';
import { letter } from '../kit/letter';
import { meter } from '../kit/meter';
import { make, tappable } from '../kit/part';
import { panel } from '../kit/panel';
import { stars } from '../kit/stars';
import { table } from '../kit/table';
import { tag } from '../kit/tag';
import type { Screen, Send } from './screen';

const PARTS: readonly PartType[] = ['hull', 'keel', 'sails', 'rigging', 'rudder', 'mounts'];
const words = (id: string) => id.replace(/([A-Z])/g, ' $1').toLowerCase().replace(/^./, (c) => c.toUpperCase());
/** A building's name ("Drawing loft"). */
export const buildingName = (b: Building) => words(b);

/** A row of a figure with its label, set in a panel's lines. */
function labelled(parent: HTMLElement, label: string, page: () => HTMLElement) {
  const row = make('div', 'o-lines', parent);
  make('span', '', row, label);
  const f = figure(page);
  row.appendChild(f.el);
  return f;
}

/** The six part marks of a ship: each part's woodcut, vermilion when under half its condition. */
function marks(parent: HTMLElement) {
  const el = make('div', '', parent);
  Object.assign(el.style, { display: 'flex', gap: '6px', alignItems: 'center' });
  return (ms: ShipHalf['parts']) => {
    el.innerHTML = PARTS.map((t) => {
      const m = ms.find((x) => x.type === t);
      return svg(26, 26, glyph(`part.${t}`, 13, 13, 24, { ink: !m?.fitted ? 'sepia' : m.low ? 'rubric' : 'iron' }));
    }).join('');
    el.setAttribute('aria-label', ms.filter((m) => m.low).map((m) => `${m.type} worn`).join(', ') || 'every part sound');
  };
}

/** Half of the Ships panel. */
function half(parent: HTMLElement, open: () => void, page: () => HTMLElement, big: boolean) {
  const el = make('div', '', parent);
  Object.assign(el.style, { display: 'flex', flexDirection: 'column', gap: '8px', padding: '4px 10px', minWidth: '0' });
  tappable(el, open);
  const title = make('div', 'caps bold', el);
  const cap = make('div', '', el);
  Object.assign(cap.style, { display: big ? 'grid' : 'none', gridTemplateColumns: '96px 1fr', columnGap: '12px' });
  const capFace = headshot(96), capText = make('div', '', cap);
  cap.prepend(capFace.el);
  const capName = make('div', 'bold', capText), capStars = stars(16);
  capText.appendChild(capStars.el);
  const morale = meter();
  capText.appendChild(morale.el);
  const tags = make('div', '', capText);
  const bos = make('div', '', el);
  Object.assign(bos.style, { display: 'grid', gridTemplateColumns: '40px 1fr auto', columnGap: '10px', alignItems: 'center' });
  const bosFace = headshot(40), bosName = make('div', '', bos), bond = figure(page);
  bos.prepend(bosFace.el);
  bos.appendChild(bond.el);
  const parts = marks(el);
  return (h: ShipHalf) => {
    title.textContent = h.you ? 'Ship one · You' : 'Ship two';
    el.setAttribute('aria-label', h.you ? 'Ship one: open the ship' : "Ship two: open her captain's profile");
    if (h.captain) {
      capFace.set(h.captain.face);
      capName.textContent = h.captain.name;
      capStars.set({ stars: h.captain.stars, potential: h.captain.potential });
      morale.set({ label: 'Morale', value: h.captain.morale.value, text: h.captain.morale.text });
      tags.textContent = '';
      for (const t of h.captain.tags) tags.appendChild(tag({ text: t }).el);
    }
    if (h.bosun) bosFace.set(h.bosun.face);
    bosFace.el.style.visibility = h.bosun ? '' : 'hidden';
    bosName.innerHTML = '';
    make('div', 'small faint', bosName, 'Bosun');
    make('div', '', bosName, h.bosun?.name ?? 'No bosun');
    bond.set(h.bond);
    parts(h.parts);
  };
}

export function createHome(send: Send): Screen<HomeView> {
  const el = make('div', '');
  Object.assign(el.style, { inset: '0' });
  const page = () => send.page();

  // the next race
  const race = panel({ from: 1, to: 5, top: 0, height: 320 }, { title: 'Next Race' });
  const raceTop = make('div', '', race.body);
  Object.assign(raceTop.style, { display: 'grid', gridTemplateColumns: '128px 1fr', columnGap: '14px' });
  const disc = chartDisc(128);
  raceTop.appendChild(disc.el);
  const raceText = make('div', '', raceTop), round = make('div', 'small caps faint', raceText), planet = make('div', 'bold', raceText);
  planet.style.fontSize = '20px';
  const days = labelled(raceText, 'Days to go', page), target = labelled(raceText, "The elder's target", page);
  const confidence = meter();
  race.body.appendChild(confidence.el);
  confidence.el.style.marginTop = '8px';
  const patron = make('p', 'small', race.body);
  patron.style.margin = '6px 0 0';
  const gear = button('', () => send.tap('settings'), 'quiet', 'menu.wheel');
  gear.el.setAttribute('aria-label', 'Settings');
  gear.el.classList.add('o-gear');
  Object.assign(gear.el.style, { right: '6px', top: '2px', padding: '0' });
  race.el.appendChild(gear.el);
  race.head.style.paddingRight = '52px';

  // the ships
  const ships = panel({ from: 6, to: 12, top: 0, height: 320 }, { title: 'The Ships' });
  Object.assign(ships.body.style, { display: 'grid', gridTemplateColumns: '1fr 1.5fr', columnGap: '8px' });
  const one = half(ships.body, () => send.tap('ship'), page, false), two = half(ships.body, () => send.tap('profile'), page, true);
  (ships.body.lastElementChild as HTMLElement).style.borderLeft = '1px solid currentColor';

  // the yard and rookery
  const yard = panel({ from: 1, to: 4, top: 336, height: 388 }, { title: 'Yard and Rookery' });
  const design = make('div', '', yard.body);
  const designDays = labelled(yard.body, 'Days to finish', page), points = labelled(yard.body, 'Yard points a day', page);
  make('div', 'o-label', yard.body, 'Under way');
  const works = make('div', 'o-lines', yard.body);
  const toRookery = button('Open the rookery', () => send.tap('rookery'), 'plain');
  Object.assign(toRookery.el.style, { position: 'absolute', left: '14px', right: '14px', bottom: '12px' });
  yard.body.appendChild(toRookery.el);

  // the table
  const league = panel({ from: 5, to: 8, top: 336, height: 388 }, { title: 'The Table' });
  const standings = table<StandingLine>([
    { label: 'Pos', width: '36px', align: 'right', cell: (r, c) => { c.textContent = String(r.place); } },
    { label: '', width: '26px', cell: (r, c) => { c.innerHTML = svg(22, 22, emblem(r.emblem, 11, 11, 20, { ink: crewInk(r.colours.first), ground: PAPER })); } },
    { label: 'Crew', width: '1fr', cell: (r, c) => { c.textContent = r.name; } },
    { label: 'Pts', width: '40px', align: 'right', cell: (r, c) => { c.textContent = String(r.points); } },
    { label: 'Gap', width: '44px', align: 'right', cell: (r, c) => { c.textContent = r.gap; } },
  ], { row: 44 });
  league.body.appendChild(standings.el);
  standings.el.style.height = '236px';
  const toLeague = button('The whole league', () => send.tap('league'), 'plain');
  Object.assign(toLeague.el.style, { position: 'absolute', left: '14px', right: '14px', bottom: '12px' });
  league.body.appendChild(toLeague.el);

  // the mail
  const mail = panel({ from: 9, to: 12, top: 336, height: 388 }, { title: 'Mail' });
  const letters = Array.from({ length: 4 }, () => letter(() => send.tap('mail')));
  for (const l of letters) mail.body.appendChild(l.el);
  Object.assign(mail.body.style, { display: 'flex', flexDirection: 'column', gap: '6px' });
  const noMail = make('p', 'faint', mail.body, 'No letters yet.');

  el.append(race.el, ships.el, yard.el, league.el, mail.el);

  return {
    el,
    show(v) {
      if (v.race) {
        race.set({ title: v.race.heading });
        disc.set(v.race.planet.seed);
        round.textContent = v.race.round;
        planet.textContent = v.race.planet.name;
        days.set(v.race.days);
        target.set(v.race.target);
        confidence.set({ label: "The elder's confidence", value: v.race.confidence.value, text: v.race.confidence.text });
        patron.textContent = v.race.patron ? `Patron's objective: ${v.race.patron}.` : 'No patron objective this race.';
      } else race.set({ title: 'No Race Ahead' });
      one(v.ships[0]);
      two(v.ships[1]);
      design.textContent = v.yard.design ? `Designing new ${v.yard.design.type}` : 'No design under way.';
      if (v.yard.design) designDays.set(v.yard.design.days);
      (designDays.el.parentElement as HTMLElement).style.display = v.yard.design ? '' : 'none';
      points.set(v.yard.points);
      works.textContent = '';
      for (const w of v.yard.works) {
        make('span', '', works, `${buildingName(w.building)}, to level ${w.level}`);
        make('span', 'num', works, `${w.days} days`);
      }
      if (v.yard.works.length === 0) make('span', 'faint', works, 'Nothing building.');
      league.set({ title: 'The Table', note: v.table.league });
      standings.set({ rows: v.table.lines, mine: (r) => r.mine });
      mail.set({ title: 'Mail', note: v.mail.unread ? `${v.mail.unread} unread` : '' });
      letters.forEach((l, i) => {
        const line = v.mail.letters[i];
        l.el.style.display = line ? '' : 'none';
        if (line) l.set({ line });
      });
      noMail.style.display = v.mail.letters.length ? 'none' : '';
    },
  };
}

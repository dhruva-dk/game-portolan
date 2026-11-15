// The HUD's race pieces (#58 step 8.3), laid as its other slips are (hud.ts):
//   top left, under the vitals   her parts failed, each its mark in rubric
//   left, under them             her crewmate's slip: a frame for her headshot (empty until the career draws faces:
//                                the `headshot` element), her hull's bar, and a mark of where she is: under sail
//                                (iron), in their side's water (azure), sunk (struck through in rubric)
//   under it                     the call wheel: four 48 px buttons (with me, attack, hold, free), the call in force
//                                inked gold
//   right, over Gust             the flight: a gull on a paper disc, pale outside her side's water; once called a gold
//                                ring filling as it comes, then the mark of the job in hand, shaking while a botch holds
//                                it
// None of it shows outside a race (Status.race null), nor once she has sunk.

import type { Call, Job, PartType } from '../race';
import type { Race } from '../player';
import type { Glyph } from './glyphs';
import { INK, WASH, bar, glyph, paperDisc, ring, slip, svg } from './ink';
import { onTap, piece } from './ui';

export interface CrewActions { flight(): void; call(c: Call): void }

/** The calls, in the wheel's order, and each one's mark. */
const CALLS: readonly Call[] = ['withMe', 'attack', 'hold', 'free'];
/** A call button's side, and the gap between them, px. */
const BUTTON = 48, GAP = 4;
/** The mark of each job the flight works at. */
const JOB: Readonly<Record<Job, Glyph>> = { mend: 'item.repairKit', gust: 'hud.gust', stores: 'item.smallShield', part: 'part.rudder' };
/** Where the pieces stand: below the vitals slip (60 px), and the flight's disc over Gust (hud.ts). */
const FAULTS_TOP = 64, MATE_TOP = 90, CALLS_TOP = 150, FLIGHT_RIGHT = 52, FLIGHT_BOTTOM = 222;

export function createCrew(body: HTMLElement, act: CrewActions) {
  const faults = piece(body, 'top left');
  faults.style.marginTop = `${FAULTS_TOP}px`;
  const mate = piece(body, 'top left');
  mate.style.marginTop = `${MATE_TOP}px`;
  // her crewmate's face goes in this frame (Phase C): an element of its own, under the slip's ink
  const headshot = document.createElement('div');
  headshot.style.cssText = 'position:absolute;left:7px;top:7px;width:42px;height:42px;overflow:hidden';
  const card = document.createElement('div');
  mate.append(card, headshot);
  const wheel = piece(body, 'top left');
  wheel.style.cssText = `margin-top:${CALLS_TOP}px;width:${4 * BUTTON + 3 * GAP}px;height:${BUTTON}px`;
  const buttons = CALLS.map((c, i) => {
    const el = document.createElement('div');
    el.className = 'press';
    el.style.cssText = `position:absolute;left:${i * (BUTTON + GAP)}px;top:0;width:${BUTTON}px;height:${BUTTON}px`;
    wheel.appendChild(el);
    onTap(el, () => act.call(c));
    return el;
  });
  const flight = piece(body, 'right bottom', true);
  flight.style.margin = `0 ${FLIGHT_RIGHT}px ${FLIGHT_BOTTOM}px 0`;
  onTap(flight, () => act.flight());

  const keys = new Map<HTMLElement, string>();
  const draw = (el: HTMLElement, key: string, html: () => string) => {
    if (keys.get(el) === key) return;
    keys.set(el, key);
    el.innerHTML = html();
  };
  const all = [faults, mate, wheel, flight];

  return {
    /** The element her crewmate's headshot is set in (empty until the career draws one). */
    headshot,
    /** A frame: her race's own (null: none, or hidden). */
    update(r: Race | null) {
      for (const el of all) el.style.display = r ? '' : 'none';
      if (!r) return;
      draw(faults, r.faults.join(' '), () => (r.faults.length
        ? svg(r.faults.length * 24 + 4, 24, r.faults.map((p: PartType, i) => glyph(`part.${p}`, 14 + i * 24, 12, 20, { ink: 'rubric' })).join(''))
        : ''));

      const m = r.mate, hull = m ? Math.round(m.hull) : 0;
      mate.style.display = m ? '' : 'none';
      draw(card, m ? `${hull}/${m.hullMax} ${m.where}` : '', () => (m ? svg(160, 56,
        slip(1, 1, 158, 54)
        + `<rect x="7" y="7" width="42" height="42" fill="none" stroke="${INK.iron}" stroke-width="1.4" opacity=".7"/>`
        + bar(56, 30, 96, 13, m.hull / m.hullMax, WASH.hull)
        + glyph('hud.shipsLeft', 66, 17, 16, { ink: m.where === 'home' ? 'blue' : m.where === 'sunk' ? 'sepia' : 'iron' })
        + (m.where === 'sunk' ? `<path d="M56 24L76 10" stroke="${INK.rubric}" stroke-width="2.4" stroke-linecap="round"/>` : '')) : ''));

      buttons.forEach((el, i) => {
        const on = r.call === CALLS[i];
        draw(el, `${on}`, () => svg(BUTTON, BUTTON, paperDisc(BUTTON / 2, BUTTON / 2, BUTTON / 2 - 2, on ? WASH.gold : INK.iron)
          + (on ? `<circle cx="${BUTTON / 2}" cy="${BUTTON / 2}" r="${BUTTON / 2 - 5}" fill="none" stroke="${WASH.gold}" stroke-width="2.4"/>` : '')
          + glyph(`call.${CALLS[i]}`, BUTTON / 2, BUTTON / 2, 30, { ink: on ? 'gold' : 'iron' })));
      });

      // the flight: pale unless she may call it or it is called; coming, a ring filling in 24ths; working, the job's mark
      const f = r.flight, come = f.coming === null ? -1 : Math.floor(f.coming * 24);
      draw(flight, `${f.can} ${come} ${f.job} ${f.botched}`, () => {
        const shake = f.botched ? '<animateTransform attributeName="transform" type="translate" values="0 0;-3 0;3 0;0 0" dur="0.25s" repeatCount="indefinite"/>' : '';
        const mark = f.job ? glyph(JOB[f.job], 30, 30, 28, { ink: f.botched ? 'rubric' : 'iron' }) : glyph('hud.flight', 30, 30, 32);
        return svg(60, 60, `<g opacity="${f.can || come >= 0 ? 1 : 0.45}">${paperDisc(30, 30, 28)}`
          + (come >= 0 && come < 24 ? ring(30, 30, 26, come / 24, WASH.gold, 3.5) : '')
          + (come >= 24 ? `<circle cx="30" cy="30" r="25" fill="none" stroke="${WASH.gold}" stroke-width="2.4"/>` : '')
          + `<g>${mark}${shake}</g></g>`);
      });
    },
  };
}

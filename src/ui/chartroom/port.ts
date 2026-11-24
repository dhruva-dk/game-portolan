// A round window onto the world, in the brass of the minimap's rim
// (minimap.ts): the rim, its dashed paper ring, and inside it the seed panel's
// globe (orb.ts) inked from a planet's chart, spun by a finger. The chart is
// plain data (player.ts Chart) handed in by whoever surveyed it; nothing here
// runs the world. Sized in drawn units on the office's page, so the globe is
// laid over its disc by the unit's fixed size, never by measuring the page.

import type { Chart } from '../../player.ts';
import { el, styled, type Kid } from '../kit/part.ts';
import { createOrb } from '../orb.ts';
import { mark } from './figures.ts';
import { TONE, UNIT, u } from './tokens.ts';

/** The port's size, units; how far its brass and ring run in from its edge to the sea. */
const PORT = { across: 140, rim: 13 } as const;

export const PORT_CSS = `
.cr-port { position: relative; flex: none; width: ${u(PORT.across)}; height: ${u(PORT.across)}; }
/* the window and what is set under it (a nameplate), one frame */
.cr-framed { flex: 1; min-height: 0; display: flex; flex-direction: column; box-shadow: 0 0 0 var(--w-bold) var(--ink); }
.cr-window { position: relative; flex: 1; min-height: 0; box-shadow: inset 0 0 0 ${u(3)} var(--brass), inset 0 0 0 ${u(3.8)} var(--ink); }
.cr-window > .o-subject { position: absolute; left: 0; right: 0; top: 50%; height: var(--subject, 100%); translate: 0 -50%;
  pointer-events: none; }
`;

/**
 * Her ship through a window framed in brass, `under` it in the same frame (a
 * nameplate). The office draws the world clear through it (office.ts
 * o-window), her ship filling `subject` of its height (more than all of it: her
 * hull and courses fill the window).
 */
export const shipWindow = (under: Kid, subject = 1) =>
  el(
    'div',
    'cr-framed',
    el(
      'div',
      'cr-window o-window',
      styled(el('div', 'o-subject'), { '--subject': `${subject * 100}%` })
    ),
    under
  );

/** The rim drawn round a port `across` units wide. */
const rim = (across: number) => {
  const r = across / 2;
  return (
    `<circle cx="${r}" cy="${r}" r="${r - 2}" fill="${TONE.brass}" filter="url(#sh)"/>` +
    `<circle cx="${r}" cy="${r}" r="${r - 6}" fill="none" stroke="${TONE.paper}" stroke-width="5" stroke-dasharray="2.2 2.2"/>` +
    `<circle cx="${r}" cy="${r}" r="${r - PORT.rim + 0.5}" fill="${TONE.sea}" stroke="${TONE.ink}" stroke-width="1"/>`
  );
};

/**
 * A port onto `chart`'s planet; null, the globe waits faded until `show` is
 * given one.
 */
export function brassPort(chart: Chart | null) {
  const orb = createOrb();
  const port = el(
    'div',
    'cr-port',
    mark(PORT.across, PORT.across, rim(PORT.across)),
    orb.el
  );
  orb.place(
    PORT.rim * UNIT,
    PORT.rim * UNIT,
    (PORT.across - 2 * PORT.rim) * UNIT
  );
  orb.show(chart, chart === null);
  return { el: port, show: (next: Chart) => orb.show(next, false) };
}

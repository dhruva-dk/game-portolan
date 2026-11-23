// A round window onto the world, in the brass of the minimap's rim
// (minimap.ts): the rim, its dashed paper ring, and inside it the seed panel's
// globe (orb.ts) inked from a planet's chart, spun by a finger. The chart is
// plain data (player.ts Chart) handed in by whoever surveyed it; nothing here
// runs the world. Sized in drawn units on the office's page, so the globe is
// laid over its disc by the unit's fixed size, never by measuring the page.

import type { Chart } from '../../player.ts';
import { el } from '../kit/part.ts';
import { createOrb } from '../orb.ts';
import { mark } from './figures.ts';
import { TONE, UNIT, u } from './tokens.ts';

/** The port's size, units; how far its brass and ring run in from its edge to the sea. */
const PORT ={ across: 140, rim: 13 } as const;

export const PORT_CSS = `
.cr-port { position: relative; flex: none; width: ${u(PORT.across)}; height: ${u(PORT.across)}; }
`;

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

// The chartroom kit's looks, set into the page once: its tokens, then each
// piece's own sheet. A screen built on the kit asks for them as it is made, and
// roots itself in `.cr`, where the tokens are set.

import { CONTROLS_CSS } from './controls.ts';
import { DATA_CSS } from './data.ts';
import { FIGURES_CSS } from './figures.ts';
import { PAPER_CSS } from './paper.ts';
import { PORT_CSS } from './port.ts';
import { chartroom } from './tokens.ts';

/** Sets the kit's tokens and looks into the page, once however often it is asked. */
export const kitLooks = () =>
  chartroom(PAPER_CSS + FIGURES_CSS + CONTROLS_CSS + DATA_CSS + PORT_CSS);

// The office's page: 1180 × 820, the iPad Air's landscape screen, scaled to
// whatever screen it is on and centred on it. The office lies on one
// (office/office.ts), and so does the race's pit wall (pitwall.ts), so a thing
// placed on either stands where it was drawn on any screen.

import { onResize, view } from '../ui.ts';
import { el, type Kid } from './part.ts';
import { stylesheet } from './style.ts';

/** The page's size, px. */
export const PAGE = { w: 1180, h: 820 } as const;

const CSS = `
.office { position: absolute; left: 0; top: 0; width: ${PAGE.w}px; height: ${PAGE.h}px; transform-origin: 0 0; }
`;

/** A page holding `kids`, kept scaled to the screen and centred on it. */
export function createPage(...kids: Kid[]) {
  stylesheet(CSS);
  const page = el('div', 'office', ...kids);
  const fit = () => {
    const k = Math.min(view.w / PAGE.w, view.h / PAGE.h);
    page.style.transform = `translate(${((view.w - PAGE.w * k) / 2).toFixed(1)}px, ${((view.h - PAGE.h * k) / 2).toFixed(1)}px) scale(${k.toFixed(4)})`;
  };
  onResize(fit);
  fit();
  return page;
}

// The office's pictograms: one line weight on a 24 grid, in the colour of what
// they are set in (currentColor), so a tab's glyph is lit with its label. The
// nav's thirteen, the strip's, and the small marks controls carry.

import { drawn } from './part.ts';

const ICONS = {
  // the nav's tabs
  home: '<path d="M3 11.5 12 4l9 7.5M5.5 10v10h5v-6h3v6h5V10"/>',
  player:
    '<circle cx="12" cy="8" r="3.6"/><path d="M4.5 20.5c.6-4.6 3.6-7 7.5-7s6.9 2.4 7.5 7"/>',
  mail: '<rect x="3" y="5.5" width="18" height="13"/><path d="m3.5 6.5 8.5 7 8.5-7"/>',
  ship: '<path d="M2.5 15.5h19l-3 5h-13zM11.5 3v12.5M11.5 4.5l6.5 8.5h-6.5M11.5 6.5 6 13h5.5"/>',
  hq: '<path d="M4.5 21V8.5L12 4l7.5 4.5V21M2.5 21h19M9.5 21v-5h5v5M8 11.5h2.5M13.5 11.5H16"/>',
  team:
    '<circle cx="12" cy="7.5" r="3"/><circle cx="4.8" cy="9.8" r="2.1"/><circle cx="19.2" cy="9.8" r="2.1"/>' +
    '<path d="M6.5 20c.4-4 2.6-6 5.5-6s5.1 2 5.5 6M1.5 18.5c.2-2.4 1.4-4 3.2-4.4M22.5 18.5c-.2-2.4-1.4-4-3.2-4.4"/>',
  drivers:
    '<circle cx="12" cy="12" r="5.6"/><circle cx="12" cy="12" r="1.5"/>' +
    '<path d="M12 2.5v4M12 17.5v4M2.5 12h4M17.5 12h4M5.3 5.3l2.8 2.8M15.9 15.9l2.8 2.8M5.3 18.7l2.8-2.8M15.9 8.1l2.8-2.8"/>',
  staff:
    '<path d="m4 20.5 9.5-9.5M12.5 6a4 4 0 0 1 5.3-2.2l-2.5 2.5.5 2 2 .5 2.4-2.5a4 4 0 0 1-5.7 5.5M20 20.5l-9-9M4 6.5 6.5 4l4 4L8 10.5z"/>',
  scouting:
    '<path d="m3 14.5 11-6 2 3.6-11 6zM14 8.5l5-2.7 2 3.6-5 2.7M9.5 17.5 8 21.5M11.5 16.4l2.5 5"/>',
  finances:
    '<ellipse cx="12" cy="6.5" rx="7" ry="2.8"/><path d="M5 6.5v4c0 1.5 3.1 2.8 7 2.8s7-1.3 7-2.8v-4M5 10.5v4c0 1.5 3.1 2.8 7 2.8s7-1.3 7-2.8v-4M5 14.5v3c0 1.5 3.1 2.8 7 2.8s7-1.3 7-2.8v-3"/>',
  sponsors: '<path d="M5 21.5V3M5 4h14l-3.5 4.5L19 13H5"/>',
  standings:
    '<path d="M7 4h10v5a5 5 0 0 1-10 0zM7 6H4v1.5a3 3 0 0 0 3 3M17 6h3v1.5a3 3 0 0 1-3 3M12 14v4M8 21h8M9 18h6"/>',
  calendar:
    '<rect x="3.5" y="5" width="17" height="15.5"/><path d="M3.5 9.5h17M8 3v4M16 3v4M7.5 13h2M11 13h2M14.5 13h2M7.5 16.5h2M11 16.5h2"/>',
  // the strip's
  bell: '<path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l2 2H4zM10 20.5a2 2 0 0 0 4 0"/>',
  cloud:
    '<path d="M7 18.5a4 4 0 0 1-.6-7.96A5.5 5.5 0 0 1 17 9.5a4.5 4.5 0 0 1 .5 9z"/>',
  anchor:
    '<circle cx="12" cy="5" r="2"/><path d="M12 7v14M8 10.5h8M4.5 14c.4 4 3.4 7 7.5 7s7.1-3 7.5-7M4.5 14 3 16.5M4.5 14l2.4 1.5M19.5 14l1.5 2.5M19.5 14l-2.4 1.5"/>',
  // the marks controls carry
  back: '<path d="M14.5 5 8 12l6.5 7"/>',
  forward: '<path d="M9.5 5 16 12l-6.5 7"/>',
  down: '<path d="m6 9.5 6 6 6-6"/>',
  up: '<path d="m6 14.5 6-6 6 6"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.3v.4"/>',
  cog:
    '<circle cx="12" cy="12" r="3.2"/><circle cx="12" cy="12" r="6.6"/>' +
    '<path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1"/>',
  load: '<path d="M12 15V4M7.5 8.5 12 4l4.5 4.5M4 14.5v5h16v-5"/>',
  cup: '<path d="M7 4h10v5a5 5 0 0 1-10 0zM12 14v4M8 21h8"/>',
  pennants:
    '<path d="M6 21 14.5 4M14.5 4l6 2.5-7.5 2.5M18 21 9.5 4M9.5 4l-6 2.5 7.5 2.5"/>',
} as const;

export type Icon = keyof typeof ICONS;

/** The pictogram `name`, `size` px across, in its element's own colour. */
export const icon = (name: Icon, size = 24) => {
  const svg = drawn(
    24,
    24,
    `<g fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${ICONS[name]}</g>`,
    'k-icon'
  );
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  return svg;
};

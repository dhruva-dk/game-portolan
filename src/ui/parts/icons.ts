// The interface's glyphs, as inline SVG on a 24-unit grid, filled with currentColor. Ported from the rewrite's ICON
// set and extended: weapons, consumables, the 16 abilities, the cosmetic kinds, the menus, and the captains' emblems.
// No glyph shows a person or a building.

const f = (n: number) => +n.toFixed(2);
/** A stroked path. */
const st = (d: string, w = 2.4) => `<path d="${d}" fill="none" stroke="currentColor" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`;
/** Wraps a body in an svg. */
export const svg = (body: string, vb = '0 0 24 24'): string => `<svg viewBox="${vb}" aria-hidden="true">${body}</svg>`;

/** A star polygon with n points. */
function star(n: number, ro: number, ri: number, cx = 12, cy = 12, a0 = -Math.PI / 2): string {
  const p: string[] = [];
  for (let i = 0; i < n * 2; i++) {
    const r = i % 2 ? ri : ro, a = a0 + (i * Math.PI) / n;
    p.push(`${f(cx + Math.cos(a) * r)} ${f(cy + Math.sin(a) * r)}`);
  }
  return `<path d="M${p.join('L')}z"/>`;
}
/** A regular polygon. */
function gon(n: number, r: number, cx = 12, cy = 12, a0 = -Math.PI / 2): string {
  const p: string[] = [];
  for (let i = 0; i < n; i++) p.push(`${f(cx + Math.cos(a0 + (i * 2 * Math.PI) / n) * r)} ${f(cy + Math.sin(a0 + (i * 2 * Math.PI) / n) * r)}`);
  return `M${p.join('L')}z`;
}
const ring = (r: number, w: number, cx = 12, cy = 12) => `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="currentColor" stroke-width="${w}"/>`;
const dot = (cx: number, cy: number, r: number) => `<circle cx="${cx}" cy="${cy}" r="${r}"/>`;
const spokes = (n: number, r0: number, r1: number, w: number, a0 = 0) => {
  let d = '';
  for (let i = 0; i < n; i++) {
    const a = a0 + (i * 2 * Math.PI) / n;
    d += `M${f(12 + Math.cos(a) * r0)} ${f(12 + Math.sin(a) * r0)}L${f(12 + Math.cos(a) * r1)} ${f(12 + Math.sin(a) * r1)}`;
  }
  return st(d, w);
};

const SHIELD_D = 'M12 1.8l8.6 3.2v6.3c0 5.3-3.6 9.3-8.6 11-5-1.7-8.6-5.7-8.6-11V5z';
const FEATHER = svg('<path d="M20.5 2.5C12 3 5.6 8.3 3.5 17.3l1.9 1.9C8.6 16.4 12 15.3 15 15.1c-2.5-.5-4.5-.4-6.4.2 2.1-2.4 4.7-3.8 7.8-4.3-2-.5-3.9-.4-5.6.1 3.4-3.6 6.6-5.6 9.7-8.6z"/>' + st('M2.5 21.5l4-4', 2));

export const ICON = {
  // weapons
  cannon: svg('<path d="M1.5 9.2h3l1.6 1.3h11.3l4.6-1.6v6.2l-4.6-1.6H6.1l-1.6 1.3h-3z"/><circle cx="8" cy="16.6" r="3.4"/>'),
  scatter: svg('<path d="M1.5 10.3h8.5l10-4.6v12.6l-10-4.6H1.5z"/><rect x="2.5" y="13.4" width="4.5" height="5.5" rx="1"/>'),
  harpoon: svg('<path d="M1 11.1h15v1.8H1z"/><path d="M14.5 7.2l8.5 4.8-8.5 4.8 2.4-4.8z"/><path d="M2.6 8.4l2.4 3.6-2.4 3.6H.8l2.4-3.6L.8 8.4z"/>'),
  mortar: svg('<path d="M6 15.2l6.4-10.6 5.4 3.3-6.4 10.6z"/><path d="M3 18.4h11.5V22H3z"/><ellipse cx="15.2" cy="6.2" rx="3.2" ry="1.5" transform="rotate(31 15.2 6.2)"/>'),
  repeater: svg('<rect x="3" y="5.6" width="18" height="2.8" rx="1.2"/><rect x="3" y="10.6" width="18" height="2.8" rx="1.2"/><rect x="3" y="15.6" width="18" height="2.8" rx="1.2"/><rect x="6" y="4" width="4" height="16" rx="1.2"/>'),
  broadside: svg('<path d="M12 2.5c2.6 2.4 3.6 5.6 3.6 9.5s-1 7.1-3.6 9.5C9.4 19.1 8.4 15.9 8.4 12s1-7.1 3.6-9.5z"/><path d="M.8 8.4h6.4v2.4H.8zM.8 13.2h6.4v2.4H.8zM16.8 8.4h6.4v2.4h-6.4zM16.8 13.2h6.4v2.4h-6.4z"/>'),
  // consumables
  smallShield: svg(`<path d="M12 4.5l6 2.2v4.4c0 3.7-2.5 6.5-6 7.7-3.5-1.2-6-4-6-7.7V6.7z"/><path d="M11 8.5h2v2.4h2.4v2H13v2.4h-2v-2.4H8.6v-2H11z" fill="rgba(255,255,255,.85)"/>`),
  bigShield: svg(`<path d="${SHIELD_D}"/><path d="M12 5.2l5.6 2.1v4.1c0 3.5-2.3 6.1-5.6 7.3-3.3-1.2-5.6-3.8-5.6-7.3V7.3z" fill="none" stroke="rgba(255,255,255,.75)" stroke-width="1.4"/><path d="M10.8 8.4h2.4v2.6h2.6v2.4h-2.6V16h-2.4v-2.6H8.2v-2.4h2.6z" fill="rgba(255,255,255,.9)"/>`),
  repairKit: svg('<path fill-rule="evenodd" d="M5.5 5h13A2.5 2.5 0 0 1 21 7.5v9a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 16.5v-9A2.5 2.5 0 0 1 5.5 5zm5.2 3v2.7H8v2.6h2.7V16h2.6v-2.7H16v-2.6h-2.7V8z"/><path d="M9 3h6v2.4H9z"/>'),
  fullRepair: svg('<path fill-rule="evenodd" d="M12 1.5l2.6 3.4 4.2-.7-.7 4.2 3.4 2.6-3.4 2.6.7 4.2-4.2-.7L12 20.5l-2.6-3.4-4.2.7.7-4.2L2.5 11l3.4-2.6-.7-4.2 4.2.7zm-1.3 5.7v2.5H8.2v2.6h2.5v2.5h2.6v-2.5h2.5V9.7h-2.5V7.2z"/>'),
  // vitals and counters
  shield: svg(`<path d="${SHIELD_D}"/>`),
  hull: svg('<path d="M1.5 10.5h21l-3.6 8H5.1z"/><path d="M11 2.5h2v7h-2z"/><path d="M13 3.2l6 5.3h-6z"/>'),
  coin: svg('<circle cx="12" cy="12" r="9.6"/><circle cx="12" cy="12" r="6.8" fill="none" stroke="rgba(0,0,0,.28)" stroke-width="1.3"/>' + star(4, 4.6, 1.5).replace('<path', '<path fill="rgba(255,250,220,.85)"')),
  // moves and the HUD
  gust: svg(st('M3 8.5h10.5a3 3 0 1 0-3-3') + st('M2 13h16a3 3 0 1 1-3 3') + st('M5 17.8h5')),
  reload: svg(st('M19.5 12.5a7.5 7.5 0 1 1-2.2-5.3', 2.8) + '<path d="M21 3v7h-7z"/>'),
  gull: svg('<path d="M1.2 9.3c3.6-1.6 6.8-.5 10.8 4.2 4-4.7 7.2-5.8 10.8-4.2-3 .3-6.6 2.5-10.8 7.8-4.2-5.3-7.8-7.5-10.8-7.8z"/>'),
  sail: svg('<path d="M11 1.8v15H3.6z"/><path d="M12.6 4v12.8h7.4z"/><path d="M2.2 18.2h19.6L19 22H5z"/>'),
  target: svg(st('M12 4a8 8 0 1 0 0 16a8 8 0 1 0 0-16M12 .8v5M12 18.2v5M.8 12h5M18.2 12h5') + '<circle cx="12" cy="12" r="2.4"/>'),
  storm: svg(st('M13.5 12a1.5 1.5 0 1 1-1.5-1.5a4 4 0 0 1 4 4a6.5 6.5 0 0 1-13 0a9 9 0 0 1 9-9', 2.2)),
  map: svg(st('M2 5.2l6.6-2.6 6.8 2.6 6.6-2.6v16.2l-6.6 2.6-6.8-2.6L2 21.4zM8.6 2.6v16.2M15.4 5.2v16.2', 2)),
  menu: svg('<rect x="3" y="5" width="18" height="2.8" rx="1.4"/><rect x="3" y="10.6" width="18" height="2.8" rx="1.4"/><rect x="3" y="16.2" width="18" height="2.8" rx="1.4"/>'),
  pause: svg('<rect x="5.5" y="4" width="4.6" height="16" rx="1.4"/><rect x="13.9" y="4" width="4.6" height="16" rx="1.4"/>'),
  swap: svg(st('M4 8h14l-3.5-3.8M20 16H6l3.5 3.8', 2.6)),
  drop: svg(st('M12 2v12.5M6.5 9.5l5.5 6 5.5-6', 3) + st('M2 20.4c2.5-1.5 4.5-1.5 6.7 0s4.3 1.5 6.6 0 4.2-1.5 6.7 0', 2.2)),
  dive: svg(st('M5 4l7 6.5L19 4M5 12l7 6.5 7-6.5', 3)),
  sink: svg('<path d="M3 11.5l13.6 5.8 3-3.2-13.6-5.8z"/><path d="M8.6 8.8l3.2-7 2.6 8.6z"/>' + st('M1 21c2.5-1.3 4.5-1.3 7 0s4.5 1.3 7 0 4.5-1.3 7 0', 2)),
  ram: svg('<path d="M12 1.5l2.3 6.1 6.4-1.5-3.9 5.3 4.9 4.4-6.5.3L14 22.5 12 16.3l-2 6.2-1.2-6.4-6.5-.3 4.9-4.4-3.9-5.3 6.4 1.5z"/>'),
  gear: svg('<path fill-rule="evenodd" d="M10.3 1.8h3.4l.5 2.6 1.9.8 2.2-1.5 2.4 2.4-1.5 2.2.8 1.9 2.6.5v3.4l-2.6.5-.8 1.9 1.5 2.2-2.4 2.4-2.2-1.5-1.9.8-.5 2.6h-3.4l-.5-2.6-1.9-.8-2.2 1.5-2.4-2.4 1.5-2.2-.8-1.9-2.6-.5v-3.4l2.6-.5.8-1.9-1.5-2.2 2.4-2.4 2.2 1.5 1.9-.8zM12 8.4a3.6 3.6 0 1 0 0 7.2a3.6 3.6 0 1 0 0-7.2z"/>'),
  close: svg(st('M5.5 5.5l13 13M18.5 5.5l-13 13', 3.2)),
  back: svg(st('M15 4l-8 8 8 8', 3.4)),
  next: svg(st('M9 4l8 8-8 8', 3.4)),
  up: svg(st('M4 15l8-8 8 8', 3.4)),
  check: svg(st('M4 12.5l5 5L20 6', 3.4)),
  plus: svg(st('M12 4v16M4 12h16', 3.2)),
  lock: svg('<path fill-rule="evenodd" d="M7 10V7.5a5 5 0 0 1 10 0V10h1.2c.9 0 1.6.7 1.6 1.6v8.6c0 .9-.7 1.6-1.6 1.6H5.8c-.9 0-1.6-.7-1.6-1.6v-8.6c0-.9.7-1.6 1.6-1.6zm2.6 0h4.8V7.5a2.4 2.4 0 0 0-4.8 0zM12 13.2a1.7 1.7 0 0 0-.9 3.1v2.2h1.8v-2.2a1.7 1.7 0 0 0-.9-3.1z"/>'),
  crown: svg('<path d="M2.5 8l4.5 4 5-7 5 7 4.5-4-2 11h-15z"/>'),
  trophy: svg('<path d="M6 2.5h12v3h3.5c0 3.8-1.8 6.4-4.6 7.1A6 6 0 0 1 13.4 16v2.2h3.4V21.5H7.2v-3.3h3.4V16a6 6 0 0 1-3.5-3.4C4.3 11.9 2.5 9.3 2.5 5.5H6zm12 5v2.6c.9-.5 1.4-1.4 1.5-2.6zM6 7.5H4.5c.1 1.2.6 2.1 1.5 2.6z"/>'),
  star: svg(star(5, 10.5, 4.4)),
  hourglass: svg(st('M5.5 2.5h13M5.5 21.5h13M7.5 2.5c0 5.2 4.5 6 4.5 9.5s-4.5 4.3-4.5 9.5M16.5 2.5c0 5.2-4.5 6-4.5 9.5s4.5 4.3 4.5 9.5', 2) + '<path d="M9 19.6c.6-2.2 2-3 3-3.6 1 .6 2.4 1.4 3 3.6z"/>'),
  eye: svg(st('M1.8 12S5.6 5.2 12 5.2 22.2 12 22.2 12 18.4 18.8 12 18.8 1.8 12 1.8 12z', 2) + '<circle cx="12" cy="12" r="3.4"/>'),
  play: svg('<path d="M7 3.5l13 8.5-13 8.5z"/>'),
  leave: svg(st('M13.5 3.5H4.5v17h9M9.5 12h12M17.5 7.5l4.5 4.5-4.5 4.5', 2.4)),
  anchor: svg(st('M12 6v15M7.5 9.5h9M3.8 13.5c0 4.4 3.6 7.5 8.2 7.5s8.2-3.1 8.2-7.5', 2.4) + '<circle cx="12" cy="4" r="2.2" fill="none" stroke="currentColor" stroke-width="2"/>'),
  flag: svg(st('M5 2v20', 2.2) + '<path d="M6 3h13.5l-3.6 4.6 3.6 4.6H6z"/>'),
  hand: svg('<path d="M8.6 3a1.7 1.7 0 0 1 3.4 0v7.2l5.8.9c1.5.2 2.4 1.6 2.2 3l-1 5.6a3.2 3.2 0 0 1-3.1 2.6h-5.3a3.2 3.2 0 0 1-2.6-1.3l-4.4-5.8a1.7 1.7 0 0 1 2.6-2.1l2.4 2.2z"/>'),
  whale: svg('<path d="M12 21.5c0-4 .5-7.2 2-9.6 1.8 1 4.5 1.2 7.6.2-1.4-2.9-4-4.7-7.1-4.5C13.6 5.4 13 3.6 12 2c-1 1.6-1.6 3.4-2.5 5.6-3.1-.2-5.7 1.6-7.1 4.5 3.1 1 5.8.8 7.6-.2 1.5 2.4 2 5.6 2 9.6z"/>'),
  fleur: svg('<path d="M12 1.5c-2 2.6-3 5-1.6 8.3L12 13l1.6-3.2C15 6.5 14 4.1 12 1.5zM10.6 13.4C8.3 9.6 3.6 9.8 3 12.6c-.4 2 2 3.6 4 2.2-.4 2.2 1.2 3.4 3 2.6zM13.4 13.4c2.3-3.8 7-3.6 7.6-.8.4 2-2 3.6-4 2.2.4 2.2-1.2 3.4-3 2.6z"/><path d="M7.5 14.2h9v1.8h-9zM11 16h2v6.5h-2z"/>'),
  // menus
  abilities: svg(`<path d="${gon(6, 10.4)}" fill="none" stroke="currentColor" stroke-width="2"/><path d="M13.4 3.8l-6 9.4h4.4l-1.2 7 6-9.6h-4.4z"/>`),
  locker: svg('<path d="M11 1.8v14.6H3.2z"/><path d="M12.6 3.6v12.8h7.6c-.6-4.6-3.2-9.4-7.6-12.8z"/><path d="M2.2 17.8h19.6L19 21.8H5z"/><circle cx="16.4" cy="12.6" r="1.7" fill="rgba(255,250,230,.9)"/>'),
  rivals: svg('<path d="M3 21V3.2l7.6 3.4L3 10.2"/><path d="M21 21V3.2l-7.6 3.4L21 10.2"/>' + st('M3 3v18M21 3v18', 2)),
  career: svg(`<circle cx="12" cy="12" r="9.8" fill="none" stroke="currentColor" stroke-width="2"/>${st('M2.6 12h18.8M12 2.2c-3 2.6-4.4 6-4.4 9.8s1.4 7.2 4.4 9.8M12 2.2c3 2.6 4.4 6 4.4 9.8s-1.4 7.2-4.4 9.8', 1.6)}`),
  rank: svg('<path d="M4 2.5h16v7.8L12 15l-8-4.7z"/><path d="M4 13.2l8 4.7 8-4.7v3.4L12 21.3l-8-4.7z"/>'),
  sound: svg('<path d="M3 9h4l5.5-4.5v15L7 15H3z"/>' + st('M15.5 8.5a5 5 0 0 1 0 7M18.3 5.6a9 9 0 0 1 0 12.8', 2.2)),
  haptic: svg('<rect x="7" y="3" width="10" height="18" rx="2.2"/>' + st('M3 8v8M21 8v8', 2.2)),
  quality: svg(star(4, 10.5, 3) + star(4, 4, 1.2, 19, 5)),
  controls: svg('<path fill-rule="evenodd" d="M12 3.5a8.5 8.5 0 1 1 0 17 8.5 8.5 0 0 1 0-17zm0 4.6a3.9 3.9 0 1 0 0 7.8 3.9 3.9 0 0 0 0-7.8z"/>' + dot(12, 12, 2)),
  chart: svg(st('M3 19.5h18M5.5 16l4.5-5 3.5 3 5.5-7.5', 2.6) + dot(19, 6.5, 2)),
  calendar: svg('<path fill-rule="evenodd" d="M4 4.5h16a1.5 1.5 0 0 1 1.5 1.5v14a1.5 1.5 0 0 1-1.5 1.5H4A1.5 1.5 0 0 1 2.5 20V6A1.5 1.5 0 0 1 4 4.5zm1 5.5v9.5h14V10z"/><path d="M7 2.5h2.4v4H7zM14.6 2.5H17v4h-2.4z"/>'),
  info: svg('<path fill-rule="evenodd" d="M12 2a10 10 0 1 1 0 20 10 10 0 0 1 0-20zm-1.3 8.4v7.4h2.6v-7.4zM12 5.6a1.6 1.6 0 1 0 0 3.2 1.6 1.6 0 0 0 0-3.2z"/>'),
  wind: svg(st('M2.5 9h11a3 3 0 1 0-3-3M2.5 14h15.5a3 3 0 1 1-3 3M2.5 19h6', 2.3)),
  sun: svg(dot(12, 12, 4.8) + spokes(8, 7.4, 10.6, 2)),
  moon: svg('<path d="M15.5 2.5a9.5 9.5 0 1 0 6 15.5A8 8 0 1 1 15.5 2.5z"/>'),
  fire: svg('<path d="M12 22c-4.4 0-7.5-3-7.5-7.2 0-3.4 2.2-5.6 3.8-7.6.3 2 1.2 3.2 2.6 3.8C10.6 7 12.2 4.2 15 2c-.5 3.4 1 5.4 2.7 7.4 1.4 1.7 1.8 3.4 1.8 5.4C19.5 19 16.4 22 12 22z"/>'),
  skip: svg('<path d="M4 4l10 8-10 8z"/><rect x="16" y="4" width="3.6" height="16" rx="1"/>'),
  new: svg(star(8, 10.8, 7)),
};

// ---------------------------------------------------------------- the 16 abilities

export const ABILITY_ICON: Record<string, string> = {
  repair: svg('<path d="M3.5 15.2l9.8-9.8 5.3 5.3-9.8 9.8H3.5z"/>' + st('M15.5 3.2l5.3 5.3', 3) + '<path d="M6.2 15.4l2.4 2.4" stroke="rgba(255,250,230,.8)" stroke-width="1.6"/>'),
  smokeScreen: svg(dot(7.5, 14, 4.6) + dot(12.5, 10, 5.6) + dot(17, 14.5, 4.4) + '<path d="M3 15h18v4.2H3z"/>'),
  ram: ICON.ram,
  reveal: ICON.eye,
  hardTurn: svg(st('M6 21V10a6 6 0 0 1 12 0v4', 3) + '<path d="M13.2 12.6h9.6L18 19.4z"/>'),
  decoy: svg('<path d="M11 1.8v15H3.6z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-dasharray="2.4 1.8"/><path d="M12.6 4v12.8h7.4z"/><path d="M2.2 18.2h19.6L19 22H5z"/>'),
  wave: svg(st('M1.5 10c2.6-3.6 5.6-3.6 8.2 0s5.6 3.6 8.2 0 3.6-2.6 4.6-1.4', 2.8) + st('M1.5 17c2.6-3.6 5.6-3.6 8.2 0s5.6 3.6 8.2 0 3.6-2.6 4.6-1.4', 2.8)),
  driftMine: svg(dot(12, 13, 6.4) + spokes(8, 6, 10, 2.2, Math.PI / 8) + '<circle cx="10" cy="11" r="1.6" fill="rgba(255,250,230,.8)"/>'),
  salvage: svg(`<path d="${SHIELD_D}" fill="none" stroke="currentColor" stroke-width="2.2"/>` + '<path d="M12 6.6l4.4 4.6h-2.8v5.4h-3.2v-5.4H7.6z"/>'),
  quickReload: svg(st('M18.5 12.5a6.5 6.5 0 1 1-1.9-4.6', 2.6) + '<path d="M20 4v6.2h-6.2z"/>' + st('M1.5 9h3M1 13h3.5M1.5 17h3', 1.8)),
  quickHands: svg(st('M6 2.5h12M6 21.5h12M7.8 2.5c0 5 4.2 5.8 4.2 9.5s-4.2 4.5-4.2 9.5M16.2 2.5c0 5-4.2 5.8-4.2 9.5s4.2 4.5 4.2 9.5', 2) + '<path d="M13.4 6.4l-3.2 5h2.4l-1 4.8 3.4-5.6h-2.4z"/>'),
  lightHull: FEATHER,
  windReader: svg(st('M2.5 8h9a2.6 2.6 0 1 0-2.6-2.6M2.5 12.6h13.2a2.6 2.6 0 1 1-2.6 2.6', 2.3) + '<path d="M14 18.6s2.2-3 5-3 5 3 5 3-2.2 3-5 3-5-3-5-3z" transform="translate(-1.5 0)"/>'),
  stormWalker: svg(`<path d="${SHIELD_D}"/>` + st('M13.2 11.6a1.2 1.2 0 1 1-1.2-1.2 3 3 0 0 1 3 3 4.6 4.6 0 0 1-9.2 0 6.4 6.4 0 0 1 6.4-6.4', 1.8).replace('currentColor', 'rgba(255,250,230,.9)')),
  deepHold: svg('<path d="M3 8.5h18v12.2H3z"/><path d="M4.4 3.3h15.2L21 7H3z"/>' + st('M3 12.6h18M3 16.6h18', 1.2).replace('currentColor', 'rgba(255,250,230,.6)') + dot(12, 14.6, 1.6)),
  steadyAim: svg(ring(7.4, 2) + st('M12 1.5v5M12 17.5v5M1.5 12h5M17.5 12h5', 2.4) + dot(12, 12, 2.4)),
};

// ---------------------------------------------------------------- cosmetic kinds

export const KIND_ICON: Record<string, string> = {
  sailColour: ICON.sail,
  sailPattern: svg('<path d="M4.5 2h15l2 20h-19z"/><path d="M5.6 7h12.8l.4 3.6H5.2zM4.8 14.6h14.4l.4 3.6H4.4z" fill="rgba(255,250,230,.75)"/>'),
  hullPaint: svg('<path d="M1.5 12h21l-3.6 8H5.1z"/><path d="M15.5 2.5c1.5 2.4 3.2 4 3.2 5.8a3.2 3.2 0 0 1-6.4 0c0-1.8 1.7-3.4 3.2-5.8z"/>'),
  figurehead: ICON.gull,
  emblem: svg(`<path d="${SHIELD_D}"/>${star(5, 5.6, 2.3, 12, 11.6).replace('<path', '<path fill="rgba(255,250,230,.88)"')}`),
  wake: svg(st('M2 20c4-1 6-4 9-8s5-6.6 11-8', 2.6) + dot(6, 11, 1.4) + dot(15, 18, 1.6) + dot(19.5, 12.5, 1.2) + dot(10, 5.5, 1.1)),
};

// ---------------------------------------------------------------- the captains' emblems

/** Each captain is a spirit shown by a sail emblem, never a face. Unknown names fall back to a mark drawn from the name. */
export const EMBLEM: Record<string, string> = {
  arrowhead: svg('<path d="M12 1.5l7 12.5-7-3.6L5 14z"/><path d="M10.8 11.5h2.4v11h-2.4z"/>'),
  crossedLances: svg(st('M4 20L20 4M20 20L4 4', 2.4) + '<path d="M20.5 1.5l1.8 5-3-.8-.8-3zM3.5 1.5l-1.8 5 3-.8.8-3z"/>'),
  feather: FEATHER,
  sunburst: svg(star(12, 11, 6) + '<circle cx="12" cy="12" r="4" fill="rgba(255,250,230,.6)"/>'),
  ironKnot: svg(st('M12 3a4.5 4.5 0 0 1 0 9 4.5 4.5 0 0 0 0 9M3 12a4.5 4.5 0 0 1 9 0 4.5 4.5 0 0 0 9 0', 2.8)),
  meridianArc: svg(st('M3 19a9 9 0 0 1 18 0', 2.6) + st('M12 3v16M7 8.5l5-5.5 5 5.5', 2.4)),
  waves: svg(st('M2 7c2.5-2.4 5-2.4 7.5 0s5 2.4 7.5 0 3.5-2 5-1M2 12c2.5-2.4 5-2.4 7.5 0s5 2.4 7.5 0 3.5-2 5-1M2 17c2.5-2.4 5-2.4 7.5 0s5 2.4 7.5 0 3.5-2 5-1', 2.4)),
  risingSun: svg('<path d="M3.5 17a8.5 8.5 0 0 1 17 0z"/>' + st('M12 2.5v3.5M4.2 6.2l2.4 2.4M19.8 6.2l-2.4 2.4M1 11.5h3M20 11.5h3', 2) + '<path d="M1.5 18.6h21V21h-21z"/>'),
  eightPointStar: svg(star(8, 11, 4.4)),
  windRose: svg(star(4, 11, 2.6) + star(4, 7, 1.8, 12, 12, -Math.PI / 4) + ring(4, 1.4)),
  diamond: svg('<path d="M12 1.5l8.5 10.5L12 22.5 3.5 12z"/><path d="M12 6l4.4 6L12 18l-4.4-6z" fill="rgba(255,250,230,.55)"/>'),
  crescent: svg('<path d="M15 2.5a9.5 9.5 0 1 0 6.5 16.2A7.6 7.6 0 1 1 15 2.5z"/>'),
  key: svg('<path fill-rule="evenodd" d="M7.5 3a5 5 0 1 1 0 10 5 5 0 0 1 0-10zm0 3a2 2 0 1 0 0 4 2 2 0 0 0 0-4z"/><path d="M11 10.6l10.5 8.2-1.6 2-2.4-1.9-1.6 2-1.8-1.4 1.6-2-1.8-1.4-1.6 2-1.8-1.4 1.6-2-2.6-2z"/>'),
  lightningStroke: svg('<path d="M14.5 1.5L5 13.5h6l-2 9 10-12.6h-6.2z"/>'),
  coin: svg('<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6.6" fill="none" stroke="rgba(255,250,230,.75)" stroke-width="1.6"/>' + dot(12, 12, 2.2).replace('<circle', '<circle fill="rgba(255,250,230,.75)"')),
  hexagon: svg(`<path fill-rule="evenodd" d="${gon(6, 10.6)}${gon(6, 6.2).replace('M', 'M')}"/>`),
  peak: svg('<path d="M1.5 21L9 6.5l3.6 6.4 2.6-4.4L22.5 21z"/><path d="M9 6.5l2 3.6-1.8-.8-1.6 1.4-.4-1.8z" fill="rgba(255,250,230,.85)"/>'),
  anchor: ICON.anchor,
  zigzag: svg(st('M2 8l5 6 5-6 5 6 5-6M2 15l5 6 5-6 5 6 5-6', 2.4)),
  circle: svg(dot(12, 12, 7.5) + ring(10.6, 1.3)),
  hourglass: ICON.hourglass,
  eclipse: svg(dot(12, 12, 9.5) + '<circle cx="15" cy="10" r="7.6" fill="rgba(255,250,230,.55)"/>'),
  twoRings: svg(ring(6.4, 2.4, 8.6, 12) + ring(6.4, 2.4, 15.4, 12)),
  brokenWheel: svg(ring(9, 2.4) + spokes(6, 0, 9, 2).replace('stroke-width="2"', 'stroke-width="2" stroke-dasharray="6 3"') + dot(12, 12, 2.6)),
  spiral: svg(st('M12 12.2a1.4 1.4 0 0 1 1.4 1.4 2.8 2.8 0 0 1-2.8 2.8 4.2 4.2 0 0 1-4.2-4.2 5.6 5.6 0 0 1 5.6-5.6 7 7 0 0 1 7 7 8.4 8.4 0 0 1-8.4 8.4', 2.3)),
  wheelOfFortune: svg(ring(9.6, 2) + spokes(8, 2.4, 9.6, 1.6) + dot(12, 12, 2.6) + dot(12, 1.6, 1.4)),
  die: svg('<path fill-rule="evenodd" d="M5 2.5h14A2.5 2.5 0 0 1 21.5 5v14a2.5 2.5 0 0 1-2.5 2.5H5A2.5 2.5 0 0 1 2.5 19V5A2.5 2.5 0 0 1 5 2.5zM7.5 5.6a1.9 1.9 0 1 0 0 3.8 1.9 1.9 0 0 0 0-3.8zm9 9a1.9 1.9 0 1 0 0 3.8 1.9 1.9 0 0 0 0-3.8zM12 10.1a1.9 1.9 0 1 0 0 3.8 1.9 1.9 0 0 0 0-3.8z"/>'),
  thunderbolt: svg('<path d="M6.5 1.5h9l-3 7h5.5L7 22.5l3-10H5z"/>'),
  comet: svg(dot(16.5, 7.5, 5) + '<path d="M13 11.5L2 22l3-7.5L1.5 15 11 9z"/>'),
  flame: ICON.fire,
  snowflake: svg(spokes(6, 0, 10.6, 2.2) + spokes(6, 6.6, 9, 1.6, Math.PI / 6)),
  leaf: svg('<path d="M20.5 3.5C9 3.5 3.5 9 3.5 16.5c0 1.4.3 2.6.7 3.6C6 13.6 10.4 10 15 8.4 10.8 11 7.6 14.6 6 20.6c1 .4 2 .6 3.2.6 7.5 0 11.3-6.6 11.3-17.7z"/>'),
  shell: svg('<path d="M12 21.5L2.5 9.8C4.4 5.2 8 2.5 12 2.5s7.6 2.7 9.5 7.3z"/>' + st('M12 21.5V5.5M12 21.5L6.6 7.4M12 21.5l5.4-14.1M12 21.5L4 10.2M12 21.5l8-11.3', 1.2).replace('currentColor', 'rgba(255,250,230,.7)')),
  whaleTail: svg('<path d="M12 22c-.4-4 0-7.4 1.2-10 2.2 1.4 5.4 1.2 9.3-.6-1.6-4-4.8-6.4-8.3-6-1-1.4-1.6-2.8-2.2-4-.6 1.2-1.2 2.6-2.2 4-3.5-.4-6.7 2-8.3 6 3.9 1.8 7.1 2 9.3.6 1.2 2.6 1.6 6 1.2 10z"/>'),
  drop: svg('<path d="M12 1.8c3.4 5 6.6 8.6 6.6 12.4a6.6 6.6 0 0 1-13.2 0C5.4 10.4 8.6 6.8 12 1.8z"/>'),
  fern: svg(st('M12 22V3', 2) + st('M12 6l-4-2M12 6l4-2M12 10l-5.5-2.6M12 10l5.5-2.6M12 14l-7-3M12 14l7-3M12 18l-6-2.4M12 18l6-2.4', 2)),
  eye: ICON.eye,
  trident: svg(st('M12 22V4M5 3v5a7 7 0 0 0 14 0V3', 2.4) + '<path d="M12 .8l2.4 3.6H9.6zM5 .8l2 2.8H3zM19 .8l2 2.8h-4z"/>'),
  moonPhases: svg(dot(4.5, 12, 3) + '<path d="M12 9a3 3 0 0 0 0 6z"/>' + ring(3, 1.4, 12, 12) + '<circle cx="19.5" cy="12" r="3" fill="none" stroke="currentColor" stroke-width="1.4"/>'),
  starCluster: svg(star(5, 6, 2.5, 8, 9) + star(5, 4, 1.7, 17.5, 6.5) + star(5, 4.6, 1.9, 15.5, 17)),
  gull: ICON.gull,
};

/** A captain's emblem by name, or a mark drawn from the name when the career names one the interface lacks. */
export function emblem(name: string): string {
  if (EMBLEM[name]) return EMBLEM[name];
  let h = 7;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) | 0;
  const n = 3 + (Math.abs(h) % 6);
  return svg(star(n, 10.5, 4 + (Math.abs(h >> 4) % 4)));
}

// ---------------------------------------------------------------- weapons and consumables by name

export const WEAPON_ICON: Record<string, string> = {
  cannon: ICON.cannon, harpoon: ICON.harpoon, mortar: ICON.mortar, repeater: ICON.repeater, scatter: ICON.scatter, broadside: ICON.broadside,
};
export const CONSUMABLE_ICON: Record<string, string> = {
  smallShield: ICON.smallShield, bigShield: ICON.bigShield, repairKit: ICON.repairKit, fullRepair: ICON.fullRepair,
};

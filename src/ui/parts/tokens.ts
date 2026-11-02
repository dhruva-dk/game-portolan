// The interface's one set of tokens: colour, type sizes, spacing, corner radii, shadows and motion. These TS constants
// are the source; applyTokens writes them onto the interface root as CSS custom properties (--c-*, --fs-*, --sp-*,
// --r-*, --sh-*, --t-*), resolved to pixels for the device's form. Every part and screen reads only these.
//
// Two forms are designed, not scaled: 'tablet' (iPad, 1376×1032) and 'phone' (iPhone, 956×440 with safe areas left
// and right). Within a form, sizes scale gently with the window so other iPads and phones still fit.

export type Form = 'tablet' | 'phone';

export const COLOR = {
  paper: '#ecdcb4',
  paperHi: '#f8edd2',
  paperLo: '#d6bd8a',
  paperEdge: '#a98552',
  ink: '#2a1a0d',
  inkSoft: 'rgba(42, 26, 13, 0.68)',
  inkFaint: 'rgba(42, 26, 13, 0.24)',
  inkGhost: 'rgba(42, 26, 13, 0.1)',
  rubric: '#b3301c',
  wax: '#a12a17',
  waxHi: '#dc5a3c',
  waxLo: '#661409',
  gold: '#d39a2a',
  goldHi: '#ffd76e',
  goldLo: '#7c5208',
  lapis: '#2f64a8',
  olive: '#56752c',
  teal: '#1e6e78',
  cream: '#fff6e2',
  night: '#120a04',
  scrim: 'rgba(18, 10, 4, 0.58)',
  shield: '#3f9cff',
  shieldHi: '#a8d6ff',
  hull: '#f7f3ea',
  hullLow: '#ff5a3a',
  danger: '#e2472c',
  ok: '#58b83a',
} as const;

/** The five rarities: plain names and strong colours (base, highlight, shade). Index is the rarity. */
export const RARITY = [
  { id: 'common', name: 'Common', base: '#8d98a3', hi: '#d3dae1', lo: '#4a535c' },
  { id: 'uncommon', name: 'Uncommon', base: '#45b33a', hi: '#a6f08a', lo: '#1f5f18' },
  { id: 'rare', name: 'Rare', base: '#2f8cff', hi: '#98ccff', lo: '#123f88' },
  { id: 'epic', name: 'Epic', base: '#a64ff0', hi: '#dcb0ff', lo: '#4e1683' },
  { id: 'legendary', name: 'Legendary', base: '#f29a17', hi: '#ffe08a', lo: '#8a4a00' },
] as const;
export type Rarity = 0 | 1 | 2 | 3 | 4;

/** Type sizes in px at the design size of each form. */
export const TYPE: Record<Form, Record<'display' | 'h1' | 'h2' | 'h3' | 'body' | 'small' | 'micro' | 'btn' | 'btnLg' | 'num' | 'numXl', number>> = {
  tablet: { display: 104, h1: 46, h2: 31, h3: 24, body: 20, small: 17, micro: 14, btn: 24, btnLg: 38, num: 30, numXl: 96 },
  phone: { display: 66, h1: 30, h2: 22, h3: 18, body: 15, small: 13, micro: 11, btn: 17, btnLg: 26, num: 21, numXl: 60 },
};

/** The spacing scale, steps 1–8, in px. */
export const SPACE: Record<Form, readonly number[]> = {
  tablet: [0, 4, 8, 12, 16, 24, 32, 48, 64],
  phone: [0, 3, 5, 8, 11, 15, 20, 28, 38],
};

export const RADIUS: Record<Form, Record<'sm' | 'md' | 'lg' | 'xl', number>> = {
  tablet: { sm: 6, md: 12, lg: 18, xl: 28 },
  phone: { sm: 5, md: 9, lg: 14, xl: 20 },
};

/** The smallest thing a thumb is asked to hit, and the big buttons. */
export const HIT: Record<Form, Record<'min' | 'btn' | 'btnLg' | 'icon', number>> = {
  tablet: { min: 56, btn: 64, btnLg: 92, icon: 64 },
  phone: { min: 46, btn: 48, btnLg: 64, icon: 48 },
};

export const SHADOW = {
  1: '0 2px 5px rgba(20, 10, 0, 0.35)',
  2: '0 6px 16px rgba(20, 10, 0, 0.42)',
  3: '0 16px 40px rgba(20, 10, 0, 0.55)',
  /** The scorched inner edge of a parchment sheet. */
  burn: 'inset 0 0 18px rgba(110, 58, 14, 0.42), inset 0 0 3px rgba(70, 34, 6, 0.6)',
  /** Text over the scene. */
  text: '0 0 3px rgba(20, 10, 2, 0.95), 0 2px 10px rgba(20, 10, 2, 0.7)',
} as const;

export const MOTION = {
  fast: 120,
  base: 240,
  slow: 460,
  screen: 380,
  stagger: 38,
  ease: 'cubic-bezier(0.2, 0.8, 0.2, 1)',
  out: 'cubic-bezier(0.4, 0, 1, 1)',
  spring: 'cubic-bezier(0.22, 1.6, 0.36, 1)',
} as const;

export const FONT = {
  display: "'Cinzel', 'Trajan Pro', Georgia, serif",
  body: "'Fell', 'Iowan Old Style', Georgia, serif",
} as const;

/** Which form a window gets: phones are short and wide in landscape. */
export function formFor(w: number, h: number): Form {
  return h < 620 || w / h > 1.75 ? 'phone' : 'tablet';
}

/** How far sizes scale from the form's design size for this window. */
export function scaleFor(form: Form, w: number, h: number): number {
  const k = form === 'tablet' ? Math.min(w / 1376, h / 1032) : Math.min(w / 956, h / 440);
  return form === 'tablet' ? Math.min(1.25, Math.max(0.72, k)) : Math.min(1.2, Math.max(0.78, k));
}

/** Writes every token onto the root as a CSS custom property, resolved for the window. Returns the form. */
export function applyTokens(root: HTMLElement, w: number, h: number, force?: Form): { form: Form; k: number } {
  const form = force ?? formFor(w, h), k = scaleFor(form, w, h), s = root.style, px = (v: number) => `${(v * k).toFixed(2)}px`;
  root.dataset.form = form;
  for (const [n, v] of Object.entries(COLOR)) s.setProperty(`--c-${n}`, v);
  RARITY.forEach((r, i) => {
    s.setProperty(`--rar${i}`, r.base);
    s.setProperty(`--rar${i}-hi`, r.hi);
    s.setProperty(`--rar${i}-lo`, r.lo);
  });
  for (const [n, v] of Object.entries(TYPE[form])) s.setProperty(`--fs-${n}`, px(v));
  SPACE[form].forEach((v, i) => s.setProperty(`--sp-${i}`, px(v)));
  for (const [n, v] of Object.entries(RADIUS[form])) s.setProperty(`--r-${n}`, px(v));
  // a target never shrinks under 44 points, however small the window
  for (const [n, v] of Object.entries(HIT[form])) s.setProperty(`--hit-${n}`, `${Math.max(44, v * k).toFixed(2)}px`);
  for (const [n, v] of Object.entries(SHADOW)) s.setProperty(`--sh-${n}`, v);
  s.setProperty('--t-fast', `${MOTION.fast}ms`);
  s.setProperty('--t-base', `${MOTION.base}ms`);
  s.setProperty('--t-slow', `${MOTION.slow}ms`);
  s.setProperty('--t-screen', `${MOTION.screen}ms`);
  s.setProperty('--t-stagger', `${MOTION.stagger}ms`);
  s.setProperty('--ease', MOTION.ease);
  s.setProperty('--ease-out', MOTION.out);
  s.setProperty('--spring', MOTION.spring);
  s.setProperty('--f-display', FONT.display);
  s.setProperty('--f-body', FONT.body);
  s.setProperty('--k', k.toFixed(3));
  s.setProperty('--u', px(1));
  return { form, k };
}

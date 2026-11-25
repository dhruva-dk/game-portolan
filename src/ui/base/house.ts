export const TYPE = {
  ribbon: 26,
  figure: 21,
  name: 14,
  speech: 13,
  word: 11,
  small: 9.5,
} as const;

export const STEP = 4;

export const SPACE = {
  margin: 4 * STEP,
  pad: 3 * STEP,
  gap: 2 * STEP,
  hair: STEP,
} as const;

export const SIZE = {
  slip: 38,
  disc: 26,
  close: 19,
  rule: 3,
  corner: 7,
  dot: 5.5,
} as const;

const OUT = 'cubic-bezier(.22,.8,.3,1)',
  IN = 'cubic-bezier(.5,0,.75,.2)',
  POP = 'cubic-bezier(.3,1.5,.6,1)';

export const MOTION = {
  sheet: { ms: 300, ease: OUT, leave: 200, leaveEase: IN },
  card: { ms: 240, ease: OUT },
  press: { ms: 80, release: 160, scale: 0.94, ease: OUT },
  number: { ms: 450 },
  dot: { ms: 220, ease: POP },
  deal: { ms: 240, ease: OUT, after: 100, stagger: 70 },
  fan: { ms: 320, ease: POP, after: 90 },
  glide: { ms: 300, ease: OUT },
  arm: { ms: 160, ease: POP, from: 0.9 },
  fade: { ms: 180, ease: 'ease' },
} as const;

export const FAINT = 0.32;

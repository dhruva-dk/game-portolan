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
  stamp: { ms: 280, ease: POP, from: 1.9 },
  refuse: { ms: 280, shift: 3 },
  dealt: { from: 0.55, turn: -9 },
  hold: {
    delay: 380,
    first: 150,
    least: 40,
    quicken: 0.86,
    burst: [
      { after: 60, times: 25 },
      { after: 26, times: 5 },
    ],
  },
  tick: { ms: 140, ease: OUT, rise: 3 },
  bar: { ms: 160, ease: OUT },
  suspense: { ms: 520 },
  signed: { hold: 1000 },
  seal: { after: 140, ms: 300, ease: POP, from: 2.4, turn: -26, rest: -9 },
  blow: { after: 330, ms: 300, ease: OUT, give: 0.955, drop: 2 },
  flourish: { after: 330, ms: 480, ease: OUT, from: 0.55, reach: 1.65 },
  seated: { ms: 420, ease: POP, drop: 22 },
  answer: { ms: 260, ease: POP, swell: 1.16 },
  roll: { ms: 520, ease: POP, hop: 9, turn: 400, land: 300, letter: 34 },
  repaint: { ms: 700, lift: 0.22 },
  wake: { ms: 360, ease: POP, swell: 1.08 },
  title: {
    after: 90,
    rose: 720,
    rhumbs: 900,
    word: 560,
    rule: 460,
    turn: -140,
    ease: OUT,
    pop: POP,
  },
  turn: { ms: 280, ease: OUT, shift: 16 },
  built: { burst: 620, float: 760, rise: 26, ease: OUT },
  painted: { hold: 320 },
  fade: { ms: 180, ease: 'ease' },
} as const;

export const FAINT = 0.32;

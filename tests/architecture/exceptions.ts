// Every exception to an architecture rule, in one table: which rule, which file (and, where the rule finds something
// named, which name), and why it stands. An entry that excuses nothing fails as stale; an entry with no reason fails; an
// entry that stands for a gap in three.js names the three it was checked against, and fails when package.json's three
// moves, to be checked again against the new one (a gap three closed is an exception no longer needed).

export interface Exception {
  /** The rule's id, as its test names it ('f', 'A1', 'B7'). */
  rule: string;
  /** Repo-relative path. */
  file: string;
  /** What within the file, where the rule names what it found (an export, a function). */
  name?: string;
  /** Why it stands: a reason, not a citation. */
  why: string;
  /** For a gap in three.js: the three version it was checked against. */
  three?: string;
  /** For a ratchet: the most it may be (parameters taken, casts made); it may come down, and must be lowered when it
   *  does, never go up. */
  at?: number;
}

/** Why each of the functions over the parameter limit stands: it took that many when the rule came in. */
const TOOK = 'took this many when the limit came in; pass a named record when it is next reworked';
/** Why each part of src errs under the strictest options: it was written without them; each error fixed lowers it. */
const STRICTER = 'written before an index read could be missing or an optional property absent; fix as touched, and lower this';

export const EXCEPTIONS: readonly Exception[] = [
  // the renderer and the camera, outside the frame
  { rule: 'renderer', file: 'src/meter.ts', why: "the meter reads the renderer's own timestamps and draw counts, which nothing else hands it" },
  { rule: 'camera', file: 'src/meter.ts', why: 'the meter measures what the frame drew from its eye; it reads, never moves, the camera' },
  { rule: 'camera', file: 'src/land/shadow.ts', why: "the shadow map's camera is its own, orthographic, looking down on what it maps" },

  // a colour moved toward its grey: the look's own (grade), and how much of a tint the light and the clouds carry
  { rule: 'desaturate', file: 'src/post/grade.ts', why: "the look's saturation, overall and by hue" },
  { rule: 'desaturate', file: 'src/sky/light.ts', why: "how much of the sky's tint the light carries (TINTED)" },
  { rule: 'desaturate', file: 'src/sky/cloud-field.ts', why: "how much of the sun's colour a cloud's lit side takes (WARMED)" },

  // over the parameter limit, at what they took
  ...([
    ['src/audio/dsp.ts', 'design', 6], ['src/audio/dsp.ts', 'filter', 7], ['src/audio/dsp.ts', 'slips', 6], ['src/audio/dsp.ts', 'bubbles', 7],
    ['src/audio/dsp.ts', 'crackle', 6], ['src/audio/sounds/blows.ts', 'timber', 7], ['src/land/site.ts', 'standing', 6],
    ['src/ship/kit.ts', 'rod', 8], ['src/ship/kit.ts', 'rope', 7], ['src/ship/kit.ts', 'box', 6], ['src/ship/kit.ts', 'beam', 7],
    ['src/sim/battle.ts', 'stepBattle', 7], ['src/sim/bot.ts', 'think', 6], ['src/sim/gun.ts', 'chosen', 6], ['src/sim/gun.ts', 'laid', 8],
    ['src/sim/gunner.ts', 'ring', 8], ['src/sim/gunner.ts', 'aimAndFire', 9], ['src/sim/ride.ts', 'settled', 6], ['src/sim/shot.ts', 'loosed', 7],
    ['src/sim/stores.ts', 'stored', 8],['src/sim/utility.ts', 'choose', 6], ['src/ui/disc.ts', 'laid', 7],
    ['src/ui/ink.ts', 'bar', 6], ['src/ui/ink.ts', 'ring', 6], ['src/water/water.ts', 'createWater', 7], ['src/world/cells.ts', 'trace', 6],
    ['src/world/lattice.ts', 'weighInto', 7], ['src/world/sphere.ts', 'chartAt', 6],
  ] as const).map(([file, name, at]) => ({ rule: 'parameters', file, name, at, why: TOOK })),

  // errors under the strictest options (tsconfig.strict.json), by part of src, at what they were when the options came in
  ...([
    ['src/audio/', 51], ['src/debug.ts', 16], ['src/gunfire/', 6], ['src/land/', 72], ['src/loot/', 20], ['src/meter.ts', 3], ['src/play/', 46],
    ['src/post/', 20], ['src/probe.ts', 3], ['src/ship/', 222], ['src/sim/', 213], ['src/sky/', 22], ['src/tsl.ts', 16], ['src/ui/', 54],
    ['src/view/', 54], ['src/water/', 202], ['src/world/', 463],
  ] as const).map(([file, at]) => ({ rule: 'strict', file, at, why: STRICTER })),
];

// Every exception to an architecture rule, in one table: which rule, which file
// (and, where the rule finds something named, which name), and why it stands.
// An entry that excuses nothing fails as stale; an entry with no reason fails;
// an entry that stands for a gap in three.js names the three it was checked
// against, and fails when package.json's three moves, to be checked again
// against the new one (a gap three closed is an exception no longer needed).

export interface Exception {
  /** The rule's id, as its test names it ('f', 'A1', 'B7'). */
  rule: string;
  /** Repo-relative path. */
  file: string;
  /**
   * What within the file, where the rule names what it found (an export, a
   * function).
   */
  name?: string;
  /** Why it stands: a reason, not a citation. */
  why: string;
  /** For a gap in three.js: the three version it was checked against. */
  three?: string;
  /**
   * For a ratchet: the most it may be (parameters taken, casts made); it may
   * come down, and must be lowered when it does, never go up.
   */
  at?: number;
}

/**
 * Why each of the functions over the parameter limit stands: it took that many
 * when the rule came in.
 */
const TOOK =
  'took this many when the limit came in; pass a named record when it is next reworked';
/**
 * Why each file's non-null assertions stand: each a value the code knows is
 * there (a canvas's context, an element of its own drawing, a key it just set);
 * proved to the types instead as each is touched.
 */
const ASSERTED =
  'asserted this many when the rule came in; prove each to the types as touched, and lower this';
/**
 * Why each part of src errs under the strictest options: it was written without
 * them; each error fixed lowers it.
 */
const STRICTER =
  'written before an index read could be missing or an optional property absent; fix as touched, and lower this';

export const EXCEPTIONS: readonly Exception[] = [
  // the renderer and the camera, outside the frame
  {
    rule: 'renderer',
    file: 'src/meter.ts',
    why: "the meter reads the renderer's own timestamps and draw counts, which nothing else hands it",
  },
  {
    rule: 'camera',
    file: 'src/meter.ts',
    why: 'the meter measures what the frame drew from its eye; it reads, never moves, the camera',
  },
  {
    rule: 'camera',
    file: 'src/land/shadow.ts',
    why: "the shadow map's camera is its own, orthographic, looking down on what it maps",
  },

  // the meter's panel, its pointers and three's types filled in
  {
    rule: 'markup',
    file: 'src/meter.ts',
    why: "the meter's panel, written from its own numbers each half second; not the UI's, as it measures the UI too",
  },
  {
    rule: 'pointers',
    file: 'src/ui/globe.ts',
    why: "the full map's spin and pinch: fingers followed together, told from a tap by touch.ts dragged",
  },
  {
    rule: 'pointers',
    file: 'src/fly.ts',
    why: "the debug page's free eye, turned by a mouse drag; never in the release",
  },
  {
    rule: 'casts',
    file: 'src/ship/wood.ts',
    at: 1,
    why: "Object.keys is string[] by TypeScript's design; KIND is a closed literal, its keys exactly these",
  },
  {
    rule: 'primitives',
    file: 'src/tsl.ts',
    three: '0.187.0',
    why: "three's types leave out TSL nodes it exports (the types are filled in where tsl.ts names them)",
  },

  // exports only the tests or tools take: each the plain form of what the game
  // runs, for them to read it through
  {
    rule: 'exports',
    file: 'src/audio/cues.ts',
    name: 'DEEDS',
    why: 'every kind of deed, for the test that each has its cue',
  },
  {
    rule: 'exports',
    file: 'src/sim/route.ts',
    name: 'chart',
    why: 'the chart baked in-process for the tests and tools; the game bakes the same in its worker (play/sounding.ts)',
  },
  {
    rule: 'exports',
    file: 'src/sky/atmosphere.ts',
    name: 'transmittance',
    why: "the CPU's reference transmittance, which the tests hold the sky's table to",
  },
  {
    rule: 'exports',
    file: 'src/sky/atmosphere.ts',
    name: 'transmittanceUV',
    why: "the transmittance table's coordinates on the CPU, which the tests hold the shader's to",
  },
  {
    rule: 'exports',
    file: 'src/sky/atmosphere.ts',
    name: 'transmittanceRMu',
    why: "the inverse of the table's coordinates, for the tests' round trip",
  },
  {
    rule: 'exports',
    file: 'src/world/lattice.ts',
    name: 'blend',
    why: "the blend's weights written plainly, which the tests hold weighInto's to",
  },
  {
    rule: 'exports',
    file: 'src/world/lattice.ts',
    name: 'weigh',
    why: 'weighInto into lists of its own, for the tests to read the choice the GPU makes',
  },
  {
    rule: 'exports',
    file: 'src/world/lattice.ts',
    name: 'stretch',
    why: "how far a chart stretches, for the test that the lattice's cover keeps it under 1%",
  },
  {
    rule: 'exports',
    file: 'src/world/swell.ts',
    name: 'flat',
    why: 'a sea without waves for the matches run headless (the tests, tools/harness and tools/steps.ts)',
  },
  {
    rule: 'exports',
    file: 'src/world/terrain.ts',
    name: 'heightAt',
    why: "the terrain's own reading, held by its tests; the planet reads it the same way with its cover (planet-terrain.ts)",
  },
  {
    rule: 'exports',
    file: 'src/world/turn.ts',
    name: 'inverse',
    why: 'a turn undone, for the tests that a turn and its inverse come home',
  },
  {
    rule: 'exports',
    file: 'src/world/wind.ts',
    name: 'calms',
    why: "where createWind's field vanishes, for the tests that it vanishes there alone",
  },

  // a colour moved toward its grey: the look's own (grade), and how much of a
  // tint the light and the clouds carry
  {
    rule: 'desaturate',
    file: 'src/post/grade.ts',
    why: "the look's saturation, overall and by hue",
  },
  {
    rule: 'desaturate',
    file: 'src/sky/light.ts',
    why: "how much of the sky's tint the light carries (TINTED)",
  },
  {
    rule: 'desaturate',
    file: 'src/sky/cloud-field.ts',
    why: "how much of the sun's colour a cloud's lit side takes (WARMED)",
  },

  // over the parameter limit, at what they took
  ...(
    [
      ['src/audio/dsp.ts', 'filter', 7],
      ['src/audio/dsp.ts', 'slips', 6],
      ['src/audio/dsp.ts', 'bubbles', 7],
      ['src/audio/dsp.ts', 'crackle', 6],
      ['src/audio/sounds/blows.ts', 'timber', 7],
      ['src/land/site.ts', 'standing', 6],
      ['src/ship/kit.ts', 'rod', 8],
      ['src/ship/kit.ts', 'rope', 7],
      ['src/ship/kit.ts', 'box', 6],
      ['src/ship/kit.ts', 'beam', 7],
      ['src/sim/battle.ts', 'stepBattle', 7],
      ['src/sim/bot.ts', 'think', 6],
      ['src/sim/gun.ts', 'chosen', 6],
      ['src/sim/gun.ts', 'laid', 8],
      ['src/sim/ride.ts', 'settled', 6],
      ['src/sim/shot.ts', 'loosed', 7],
      ['src/sim/stores.ts', 'stored', 8],
      ['src/sim/utility.ts', 'choose', 6],
      ['src/ui/disc.ts', 'laid', 7],
      ['src/ui/ink.ts', 'bar', 6],
      ['src/ui/ink.ts', 'ring', 6],
      ['src/water/water.ts', 'createWater', 6],
      ['src/world/cells.ts', 'trace', 6],
      ['src/world/lattice.ts', 'weighInto', 7],
      ['src/world/sphere.ts', 'chartAt', 6],
    ] as const
  ).map(([file, name, at]) => ({
    rule: 'parameters',
    file,
    name,
    at,
    why: TOOK,
  })),

  // non-null assertions, by file, at what they were when the rule came in
  ...(
    [
      ['src/loot/loot.ts', 1],
      ['src/main.ts', 1],
      ['src/play/chase.ts', 1],
      ['src/play/orders.ts', 2],
      ['src/play/state.ts', 7],
      ['src/ship/rig.ts', 1],
      ['src/sim/battle.ts', 1],
      ['src/sim/claimer.ts', 2],
      ['src/sim/contact.ts', 3],
      ['src/sim/gun.ts', 2],
      ['src/sim/loot.ts', 3],
      ['src/sim/wake.ts', 1],
      ['src/ui/globe.ts', 3],
      ['src/ui/ground.ts', 1],
      ['src/ui/held.ts', 1],
      ['src/ui/hud.ts', 1],
      ['src/ui/minimap.ts', 2],
      ['src/ui/screens.ts', 3],
      ['src/ui/veil.ts', 1],
      ['src/water/claimed.ts', 1],
      ['src/world/coastline.ts', 2],
      ['src/world/terrain-grid.ts', 2],
      ['src/world/terrain.ts', 1],
    ] as const
  ).map(([file, at]) => ({ rule: 'non-null', file, at, why: ASSERTED })),

  // errors under the strictest options (tsconfig.strict.json), by part of src,
  // at what they were when the options came in
  ...(
    [
      ['src/audio/', 51],
      ['src/debug.ts', 16],
      ['src/gunfire/', 6],
      ['src/land/', 72],
      ['src/loot/', 20],
      ['src/meter.ts', 3],
      ['src/play/', 46],
      ['src/post/', 20],
      ['src/probe.ts', 3],
      ['src/ship/', 222],
      ['src/sim/', 213],
      ['src/sky/', 22],
      ['src/tsl.ts', 16],
      ['src/ui/', 54],
      ['src/view/', 54],
      ['src/water/', 202],
      ['src/world/', 463],
    ] as const
  ).map(([file, at]) => ({ rule: 'strict', file, at, why: STRICTER })),
];

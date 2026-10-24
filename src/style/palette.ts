// The illuminator's palette: every colour in Portolan is defined here, once. Materials, effects, the interface and
// the lettering read their pigments, the hour's light and the team colours from this module (and its GLSL mirror in
// style/glsl.ts), so the whole frame is one illustrator's hand. Pure data and arithmetic: no three, no DOM, so the
// readability test runs it in Node.
//
// The colour model is the painter's. Bare parchment is the page's white. A pigment is laid as a transparent wash:
// over a ground g, a wash of transmittance T at density d leaves g · T^d (Beer–Lambert in linear light), so thin
// washes tint, deep washes saturate and darken, and every wash takes the hue of the paper under it. Lead white,
// gold leaf and ink are body colours: opaque, laid over whatever is beneath. Colours are authored in sRGB as they
// look on bare parchment at midday at density 1; transmittances are derived from that, so authoring stays visual.

export type RGB = readonly [number, number, number];

export function hex(s: string): RGB {
  const v = parseInt(s.slice(1), 16);
  return [((v >> 16) & 255) / 255, ((v >> 8) & 255) / 255, (v & 255) / 255];
}

export function toLinear(c: RGB): RGB {
  const f = (x: number) => (x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4);
  return [f(c[0]), f(c[1]), f(c[2])];
}

export function toDisplay(c: RGB): RGB {
  const f = (x: number) => {
    const y = Math.min(Math.max(x, 0), 1);
    return y <= 0.0031308 ? y * 12.92 : 1.055 * y ** (1 / 2.4) - 0.055;
  };
  return [f(c[0]), f(c[1]), f(c[2])];
}

export function mix(a: RGB, b: RGB, t: number): RGB {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

/** Bare parchment under neutral midday light: the reference ground every pigment is authored on. */
export const PARCHMENT = hex('#efe0c0');

/**
 * The illuminator's pigments (sRGB): each as one transparent glaze looks on bare midday parchment at density 1, pale
 * enough for the vellum to show through. Depth comes from density, never from opaque paint.
 */
export const PIGMENTS = {
  ironGall: hex('#2a211c'), // the ink: lines, hatching, lettering (a body colour)
  sepia: hex('#6b4f36'),
  umber: hex('#8d6a45'),
  ochre: hex('#d4a656'),
  verdigris: hex('#5aa394'),
  malachite: hex('#4c9567'),
  ultramarine: hex('#4566b0'),
  indigo: hex('#3e4d72'),
  vermilion: hex('#d9472b'),
  roseMadder: hex('#c7687c'),
  leadWhite: hex('#f8f3e7'), // a body colour: foam, spray, highlights
  goldLeaf: hex('#d4a64a'), // a body colour, and the only thing in the world that shines
} as const satisfies Record<string, RGB>;

export type PigmentName = keyof typeof PIGMENTS;

/**
 * Transmittance (linear) of the wash that turns midday parchment into `appearance` at density 1. A wash cannot
 * lighten the paper, so channels brighter than parchment are clamped: blue pigments read a little greener and
 * deeper on warm parchment, as they do on the old charts.
 */
export function transmittance(appearance: RGB): RGB {
  const a = toLinear(appearance), p = toLinear(PARCHMENT);
  return [Math.min(a[0] / p[0], 1), Math.min(a[1] / p[1], 1), Math.min(a[2] / p[2], 1)];
}

/** A wash of transmittance T (linear) at density d over ground g (linear): g · T^d. */
export function wash(ground: RGB, t: RGB, d: number): RGB {
  return [ground[0] * t[0] ** d, ground[1] * t[1] ** d, ground[2] * t[2] ** d];
}

// -------------------------------------------------------------------------------------------------------------
// The hour. Each hour of the day has a hand-picked palette; the frame interpolates between neighbours. All colours
// sRGB. `paper` is bare parchment under that light (the page's white), `ink` the line and hatching ink, `shade` the
// transmittance-colour of the glaze laid over the side turned from the light (cool by day, violet in the evening),
// `sunTint` the warm glaze over the lit side, `silver` the highlight ink used as night falls, `sky*` the sky wash (`skyGlow` the low sky toward a rising or setting sun),
// `night` how far the page has gone over to candlelight (silver highlights replace light hatching).

export interface HourPalette {
  hour: number;
  paper: RGB;
  ink: RGB;
  shade: RGB;
  sunTint: RGB;
  silver: RGB;
  skyZenith: RGB;
  skyHorizon: RGB;
  skyGlow: RGB;
  night: number;
}

const SILVER = hex('#dfe4ee');

function hourKey(hour: number, paper: string, ink: string, shade: string, sunTint: string,
  skyZenith: string, skyHorizon: string, skyGlow: string, night: number): HourPalette {
  return {
    hour, paper: hex(paper), ink: hex(ink), shade: hex(shade), sunTint: hex(sunTint), silver: SILVER,
    skyZenith: hex(skyZenith), skyHorizon: hex(skyHorizon), skyGlow: hex(skyGlow), night,
  };
}

/** The named hours, in order through the day. Night wraps from 21:00 round to 3:30. */
export const HOURS = {
  night: hourKey(21.0, '#5c6789', '#14151f', '#8c95bc', '#ffffff', '#232a4c', '#46507c', '#46507c', 1),
  preDawn: hourKey(4.5, '#878aa6', '#1c1b27', '#a6a6c6', '#f6eef2', '#363c69', '#a9909f', '#c098a6', 0.7),
  dawn: hourKey(6.0, '#f0d6c6', '#2e2226', '#c9b5cd', '#fde4c8', '#9fb0cf', '#f2cfb8', '#f4b29c', 0),
  morning: hourKey(8.5, '#f1e3c6', '#2a221d', '#bcc3d8', '#fff4dc', '#7a98c8', '#e7e4d3', '#f4e0b4', 0),
  midday: hourKey(12.0, '#efe0c0', '#28201b', '#b6bed8', '#fffaf0', '#6487c2', '#dfe4dc', '#eae6cc', 0),
  afternoon: hourKey(15.0, '#efdcb8', '#2a211b', '#b9b9d1', '#fff1d8', '#6d8cc2', '#e9dfc8', '#f2dcae', 0),
  goldenHour: hourKey(17.5, '#f1d4a6', '#3a2216', '#b799aa', '#ffd8a0', '#8296bd', '#eebd86', '#f09c50', 0),
  dusk: hourKey(18.6, '#e8af8f', '#33201f', '#9d89ac', '#ffc89a', '#66709f', '#e8a07a', '#e06c4a', 0),
  blueHour: hourKey(19.4, '#a69ec0', '#1f1a2a', '#8c88b3', '#e9e0f2', '#433f7c', '#9488ba', '#b48ab4', 0.45),
} as const satisfies Record<string, HourPalette>;

export type HourName = keyof typeof HOURS;

const HOUR_RING: HourPalette[] = Object.values(HOURS).slice().sort((a, b) => a.hour - b.hour);

const smooth = (t: number) => t * t * (3 - 2 * t);

/** The palette at any hour (0–24, wrapping), blended between the two named hours either side in linear light. */
export function hourPalette(hour: number): HourPalette {
  const h = ((hour % 24) + 24) % 24;
  let i = HOUR_RING.findIndex((k) => k.hour > h);
  if (i < 0) i = 0;
  const b = HOUR_RING[i], a = HOUR_RING[(i + HOUR_RING.length - 1) % HOUR_RING.length];
  const span = (b.hour - a.hour + 24) % 24, t = smooth(((h - a.hour + 24) % 24) / span);
  const m = (x: RGB, y: RGB) => toDisplay(mix(toLinear(x), toLinear(y), t));
  return {
    hour: h, paper: m(a.paper, b.paper), ink: m(a.ink, b.ink), shade: m(a.shade, b.shade),
    sunTint: m(a.sunTint, b.sunTint), silver: SILVER, skyZenith: m(a.skyZenith, b.skyZenith),
    skyHorizon: m(a.skyHorizon, b.skyHorizon), skyGlow: m(a.skyGlow, b.skyGlow), night: a.night + (b.night - a.night) * t,
  };
}

// -------------------------------------------------------------------------------------------------------------
// The storm grade: under the storm the page greys toward wet slate and darkens. The same formula runs in the ink
// composite (glsl.ts: stormGrade), applied to the finished frame with the storm's local strength s ∈ [0, 1].

export const STORM_SLATE = hex('#7c8592');
export const STORM_GREY = 0.3; // how far colour goes over to slate at full storm
export const STORM_DIM = 0.15; // how much darker the page gets at full storm

export function stormGrade(c: RGB, s: number): RGB {
  const l = toLinear(c), slate = toLinear(STORM_SLATE);
  const y = (0.2126 * l[0] + 0.7152 * l[1] + 0.0722 * l[2]) / luminance(slate);
  const g = mix(l, [y * slate[0], y * slate[1], y * slate[2]], STORM_GREY * s), k = 1 - STORM_DIM * s;
  return toDisplay([g[0] * k, g[1] * k, g[2] * k]);
}

function luminance(l: RGB): number {
  return 0.2126 * l[0] + 0.7152 * l[1] + 0.0722 * l[2];
}

// -------------------------------------------------------------------------------------------------------------
// Teams. Ten ships sail each match and each takes one of ten team slots: a pigment pair (the primary washes its
// waters and draws its trail and border; the accent hatches the border band and flies on its pennant) and a trail
// pattern, so ships are told apart by pattern as well as by colour. Captains carry their own named pigments (below)
// on sails and emblems; the match assigns slots. No slot is a sea blue, so waters never vanish into the sea.
// Distinctness at every hour and in the storm is proven by tests/style/palette.test.ts.

export const TRAIL_PATTERNS = [
  'solid', 'dashed', 'dotted', 'double', 'dashDot', 'longDash', 'triple', 'chain', 'wave', 'zigzag',
] as const;

export type TrailPattern = (typeof TRAIL_PATTERNS)[number];

/** The narrowest a trail is ever drawn, CSS px: patterns stay legible down to this (tests/style/palette.test.ts). */
export const TRAIL_MIN_CSS = 7;

/**
 * Ink coverage (0–1) of a trail pattern at s along the trail and t across it, both in trail widths (the band spans
 * t ∈ [−0.5, 0.5]), anti-aliased over aa trail widths. Mirrors trailPattern in glsl.ts line for line.
 */
export function trailCoverage(pattern: TrailPattern, s: number, t: number, aa: number): number {
  const mod = (x: number, m: number) => x - m * Math.floor(x / m);
  const capsule = (x: number, y: number, len: number, r: number) => Math.hypot(x - Math.min(Math.max(x, 0), len), y) - r;
  let d: number;
  switch (pattern) {
    case 'solid': d = Math.abs(t) - 0.22; break;
    case 'dashed': d = capsule(mod(s, 2.6), t, 1.5, 0.22); break;
    case 'dotted': d = Math.hypot(mod(s, 1) - 0.5, t) - 0.26; break;
    case 'double': d = Math.abs(Math.abs(t) - 0.3) - 0.09; break;
    case 'dashDot': {
      const m = mod(s, 3.4);
      d = Math.min(capsule(m, t, 1.6, 0.2), Math.hypot(m - 2.55, t) - 0.2);
      break;
    }
    case 'longDash': d = capsule(mod(s, 5.2), t, 4, 0.2); break;
    case 'triple': d = Math.min(Math.abs(t) - 0.065, Math.abs(Math.abs(t) - 0.38) - 0.065); break;
    case 'chain': d = Math.abs(Math.hypot((mod(s, 1.4) - 0.7) / 0.62, t / 0.3) - 1) * 0.3 - 0.07; break;
    case 'wave': {
      const a = (2 * Math.PI) / 2.2;
      d = Math.abs(t - 0.3 * Math.sin(a * s)) / Math.sqrt(1 + (0.3 * a * Math.cos(a * s)) ** 2) - 0.1;
      break;
    }
    case 'zigzag': {
      const m = mod(s, 1.6) / 1.6;
      d = Math.abs(t - 0.32 * (Math.abs(m * 4 - 2) - 1)) * 0.78 - 0.1;
      break;
    }
  }
  return Math.min(Math.max(0.5 - d / aa, 0), 1);
}

export interface Team {
  name: string;
  primary: RGB;
  accent: RGB;
  pattern: TrailPattern;
}

export const TEAMS: readonly Team[] = [
  { name: 'vermilion', primary: PIGMENTS.vermilion, accent: PIGMENTS.ironGall, pattern: 'solid' },
  { name: 'saffron', primary: hex('#f0b81c'), accent: PIGMENTS.vermilion, pattern: 'dashed' },
  { name: 'malachite', primary: hex('#4a9a28'), accent: PIGMENTS.ochre, pattern: 'dotted' },
  { name: 'rose madder', primary: hex('#e05ea8'), accent: PIGMENTS.leadWhite, pattern: 'double' },
  { name: 'murex', primary: hex('#7b3fae'), accent: PIGMENTS.goldLeaf, pattern: 'dashDot' },
  { name: 'iron-gall', primary: hex('#2b2522'), accent: PIGMENTS.leadWhite, pattern: 'longDash' },
  { name: 'umber', primary: hex('#8a5230'), accent: PIGMENTS.ochre, pattern: 'triple' },
  { name: 'minium', primary: hex('#f08a2c'), accent: PIGMENTS.ironGall, pattern: 'chain' },
  { name: 'sap green', primary: hex('#b4c83a'), accent: PIGMENTS.umber, pattern: 'wave' },
  { name: 'azurite', primary: hex('#8fd0e8'), accent: PIGMENTS.indigo, pattern: 'zigzag' },
];

// The canonical way a team colour is laid, mirrored in glsl.ts (teamBody, watersColour). The illustrator keeps the
// team pigments true at every hour: a team's body colour is TEAM_KEEP of its own pigment and the rest its wash
// under the hour's paper, so it warms at golden hour and cools at night without losing its identity. Waters are
// that body laid over the sea with WATERS_COVER opacity; a trail is the pen stroke, laid at TRAIL_DENSITY.
export const TEAM_KEEP = 0.75;
export const WATERS_COVER = 0.75;
export const TRAIL_DENSITY = 1.5;

function teamBody(team: Team, h: HourPalette, density: number): RGB {
  return mix(wash(toLinear(h.paper), transmittance(team.primary), density), toLinear(team.primary), TEAM_KEEP);
}

/** A team's waters over a sea ground (sRGB in and out). */
export function watersColour(ground: RGB, team: Team, h: HourPalette): RGB {
  return toDisplay(mix(toLinear(ground), teamBody(team, h, 1), WATERS_COVER));
}

/** A team's trail stroke (sRGB). */
export function trailColour(team: Team, h: HourPalette): RGB {
  return toDisplay(teamBody(team, h, TRAIL_DENSITY));
}

/** The sea washes the waters and trails are laid over: lagoon to deep, each a wash over the hour's paper. */
export const SEA_WASHES = {
  lagoon: { pigment: PIGMENTS.verdigris, density: 0.35 },
  shallows: { pigment: PIGMENTS.verdigris, density: 0.6 },
  shelf: { pigment: PIGMENTS.ultramarine, density: 0.6 },
  deep: { pigment: PIGMENTS.indigo, density: 0.75 },
} as const;

export function seaColour(kind: keyof typeof SEA_WASHES, h: HourPalette): RGB {
  const s = SEA_WASHES[kind];
  return toDisplay(wash(toLinear(h.paper), transmittance(s.pigment), s.density));
}

// -------------------------------------------------------------------------------------------------------------
// The captains' named pigments (PROMPT.md, The captains), each mixed from the illuminator's palette.

export const NAMED_PIGMENTS = {
  vermilion: PIGMENTS.vermilion,
  black: PIGMENTS.ironGall,
  ironGrey: hex('#5d5f63'),
  gold: PIGMENTS.goldLeaf,
  umber: PIGMENTS.umber,
  white: PIGMENTS.leadWhite,
  crimson: hex('#a8232f'),
  ochre: PIGMENTS.ochre,
  verdigris: PIGMENTS.verdigris,
  ultramarine: PIGMENTS.ultramarine,
  teal: hex('#1f7f80'),
  cream: hex('#efe3c4'),
  roseMadder: PIGMENTS.roseMadder,
  indigo: PIGMENTS.indigo,
  silver: SILVER,
  orange: hex('#e2782c'),
  ash: hex('#9a978f'),
  purple: hex('#6a3a94'),
  mossGreen: hex('#5f7036'),
  stoneGrey: hex('#8b8579'),
  navy: hex('#223055'),
  brickRed: hex('#9c4430'),
  sage: hex('#8fa184'),
  slate: hex('#5b6573'),
  charcoal: hex('#3a3734'),
  bone: hex('#e6dcc3'),
  stormBlue: hex('#46607e'),
  saffron: hex('#e6a51c'),
} as const satisfies Record<string, RGB>;

export type NamedPigment = keyof typeof NAMED_PIGMENTS;


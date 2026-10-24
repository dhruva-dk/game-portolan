// The palette's promises (PROMPT.md, The look › Readability): every team's colour stays distinct from every other
// and from the sea and parchment beneath it at every hour and in the storm; trail patterns tell teams apart without
// colour at the narrowest a trail is drawn; the hour palette is continuous; pigments are reproduced as authored.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  HOURS, PARCHMENT, PIGMENTS, SEA_WASHES, TEAMS, TRAIL_MIN_CSS, TRAIL_PATTERNS, hourPalette, seaColour, stormGrade,
  toDisplay, toLinear, trailColour, trailCoverage, transmittance, wash, watersColour, type RGB,
} from '../../src/style/palette.ts';

// CIELAB (D65) and the CIEDE2000 difference (Sharma, Wu & Dalal 2005). ΔE00 ≈ 1 is just noticeable side by side;
// 10 and more reads as a different colour at a glance.
function lab(c: RGB): RGB {
  const [r, g, b] = toLinear(c);
  const f = (t: number) => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116);
  const fx = f((0.4124564 * r + 0.3575761 * g + 0.1804375 * b) / 0.95047);
  const fy = f(0.2126729 * r + 0.7151522 * g + 0.072175 * b);
  const fz = f((0.0193339 * r + 0.119192 * g + 0.9503041 * b) / 1.08883);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

function deltaE(c1: RGB, c2: RGB): number {
  return deltaELab(lab(c1), lab(c2));
}

function deltaELab([L1, a1, b1]: RGB, [L2, a2, b2]: RGB): number {
  const rad = Math.PI / 180;
  const Cm = (Math.hypot(a1, b1) + Math.hypot(a2, b2)) / 2;
  const G = 0.5 * (1 - Math.sqrt(Cm ** 7 / (Cm ** 7 + 25 ** 7)));
  const ap1 = a1 * (1 + G), ap2 = a2 * (1 + G), Cp1 = Math.hypot(ap1, b1), Cp2 = Math.hypot(ap2, b2);
  const hue = (b: number, a: number) => (a === 0 && b === 0 ? 0 : (Math.atan2(b, a) / rad + 360) % 360);
  const hp1 = hue(b1, ap1), hp2 = hue(b2, ap2), both = Cp1 * Cp2 !== 0;
  const dhp = !both ? 0 : Math.abs(hp2 - hp1) <= 180 ? hp2 - hp1 : hp2 - hp1 > 180 ? hp2 - hp1 - 360 : hp2 - hp1 + 360;
  const dH = 2 * Math.sqrt(Cp1 * Cp2) * Math.sin((dhp * rad) / 2);
  const Lm = (L1 + L2) / 2, Cpm = (Cp1 + Cp2) / 2;
  const hm = !both ? hp1 + hp2 : Math.abs(hp1 - hp2) <= 180 ? (hp1 + hp2) / 2 : hp1 + hp2 < 360 ? (hp1 + hp2 + 360) / 2 : (hp1 + hp2 - 360) / 2;
  const T = 1 - 0.17 * Math.cos((hm - 30) * rad) + 0.24 * Math.cos(2 * hm * rad) + 0.32 * Math.cos((3 * hm + 6) * rad) - 0.2 * Math.cos((4 * hm - 63) * rad);
  const Rc = 2 * Math.sqrt(Cpm ** 7 / (Cpm ** 7 + 25 ** 7)), Rt = -Math.sin(2 * 30 * Math.exp(-(((hm - 275) / 25) ** 2)) * rad) * Rc;
  const Sl = 1 + (0.015 * (Lm - 50) ** 2) / Math.sqrt(20 + (Lm - 50) ** 2), Sc = 1 + 0.045 * Cpm, Sh = 1 + 0.015 * Cpm * T;
  const dl = (L2 - L1) / Sl, dc = (Cp2 - Cp1) / Sc, dh = dH / Sh;
  return Math.sqrt(dl * dl + dc * dc + dh * dh + Rt * dc * dh);
}

test('CIEDE2000 matches the published reference pairs', () => {
  // Sharma, Wu & Dalal 2005, table 1: pairs 1, 7, 17 and 25
  const cases: [RGB, RGB, number][] = [
    [[50, 2.6772, -79.7751], [50, 0, -82.7485], 2.0425],
    [[50, 0, 0], [50, -1, 2], 2.3669],
    [[50, 2.5, 0], [73, 25, -18], 27.1492],
    [[60.2574, -34.0099, 36.2677], [60.4626, -34.1751, 39.4387], 1.2644],
  ];
  for (const [a, b, d] of cases) assert.ok(Math.abs(deltaELab(a, b) - d) < 1e-4, `${deltaELab(a, b)} ≠ ${d}`);
});

// every half hour of the day, clear and half and full storm
const CONDITIONS = Array.from({ length: 48 }, (_, i) => i / 2).flatMap((hour) => [0, 0.5, 1].map((storm) => ({ hour, storm })));
const GROUNDS = Object.keys(SEA_WASHES) as (keyof typeof SEA_WASHES)[];

/** The smallest ΔE00 found by `measure` over every condition, and where. */
function worst(measure: (hour: number, storm: number) => { d: number; at: string }[]): { d: number; at: string } {
  let w = { d: Infinity, at: '' };
  for (const { hour, storm } of CONDITIONS) {
    for (const m of measure(hour, storm)) if (m.d < w.d) w = { d: m.d, at: `${m.at} at ${hour}h, storm ${storm}` };
  }
  return w;
}

function pairs<T>(xs: readonly T[]): [number, number][] {
  const out: [number, number][] = [];
  for (let i = 0; i < xs.length; i++) for (let j = i + 1; j < xs.length; j++) out.push([i, j]);
  return out;
}

test('ten teams, ten patterns, each pattern used once', () => {
  assert.equal(TEAMS.length, 10);
  assert.deepEqual(new Set(TEAMS.map((t) => t.pattern)), new Set(TRAIL_PATTERNS));
});

test('team waters stay distinct from one another over every sea, at every hour and in the storm', () => {
  const w = worst((hour, storm) => GROUNDS.flatMap((g) => {
    const h = hourPalette(hour), ground = seaColour(g, h);
    const c = TEAMS.map((t) => stormGrade(watersColour(ground, t, h), storm));
    return pairs(TEAMS).map(([i, j]) => ({ d: deltaE(c[i], c[j]), at: `${TEAMS[i].name}/${TEAMS[j].name} over ${g}` }));
  }));
  assert.ok(w.d >= 12, `ΔE00 ${w.d.toFixed(2)}: ${w.at}`);
});

test('team waters stand out from the sea they are laid over', () => {
  // ≥ 6 for the wash alone; the inked border in the team pigment and its hatched band carry the edge besides
  const w = worst((hour, storm) => GROUNDS.flatMap((g) => {
    const h = hourPalette(hour), ground = seaColour(g, h), bg = stormGrade(ground, storm);
    return TEAMS.map((t) => ({ d: deltaE(stormGrade(watersColour(ground, t, h), storm), bg), at: `${t.name} over ${g}` }));
  }));
  assert.ok(w.d >= 6, `ΔE00 ${w.d.toFixed(2)}: ${w.at}`);
});

test('team trails stay distinct from one another and from the sea and parchment beneath them', () => {
  const between = worst((hour, storm) => {
    const h = hourPalette(hour), c = TEAMS.map((t) => stormGrade(trailColour(t, h), storm));
    return pairs(TEAMS).map(([i, j]) => ({ d: deltaE(c[i], c[j]), at: `${TEAMS[i].name}/${TEAMS[j].name}` }));
  });
  assert.ok(between.d >= 12, `ΔE00 ${between.d.toFixed(2)}: ${between.at}`);
  const against = worst((hour, storm) => {
    const h = hourPalette(hour), grounds = [...GROUNDS.map((g) => ({ name: g, c: seaColour(g, h) })), { name: 'parchment', c: h.paper }];
    return TEAMS.flatMap((t) => grounds.map((g) => ({
      d: deltaE(stormGrade(trailColour(t, h), storm), stormGrade(g.c, storm)), at: `${t.name} trail on ${g.name}`,
    })));
  });
  assert.ok(against.d >= 9, `ΔE00 ${against.d.toFixed(2)}: ${against.at}`);
});

test('trail patterns tell every team apart without colour, at the narrowest trail', () => {
  // Coverage of each pattern sampled at the narrowest trail on the lowest-density screen (TRAIL_MIN_CSS CSS px at
  // 2 px per CSS px), compared with every other at its best alignment along the trail and in either direction.
  const px = TRAIL_MIN_CSS * 2, window = 20 * px, slide = 6 * px;
  const strip = (p: (typeof TRAIL_PATTERNS)[number], n: number) => Array.from({ length: n }, (_, i) =>
    Array.from({ length: px }, (_, j) => trailCoverage(p, i / px, (j + 0.5) / px - 0.5, 1 / px)));
  const strips = TRAIL_PATTERNS.map((p) => strip(p, window + slide));
  let w = { d: Infinity, at: '' };
  for (const [a, b] of pairs(TRAIL_PATTERNS)) {
    for (const reverse of [false, true]) {
      for (let k = 0; k < slide; k++) {
        let d = 0;
        for (let i = 0; i < window; i++) {
          const row = strips[b][reverse ? window + slide - 1 - i - k : i + k];
          for (let j = 0; j < px; j++) d += Math.abs(strips[a][i][j] - row[j]);
        }
        d /= window * px;
        if (d < w.d) w = { d, at: `${TRAIL_PATTERNS[a]}/${TRAIL_PATTERNS[b]}` };
      }
    }
  }
  assert.ok(w.d >= 0.08, `patterns differ over only ${(w.d * 100).toFixed(1)} % of the trail: ${w.at}`);
});

test('the hour palette passes through each named hour, wraps at midnight, and never jumps', () => {
  for (const h of Object.values(HOURS)) assert.ok(deltaE(hourPalette(h.hour).paper, h.paper) < 0.01);
  assert.ok(deltaE(hourPalette(0).paper, hourPalette(24).paper) < 0.01);
  for (let t = 0; t < 24; t += 0.01) {
    const a = hourPalette(t), b = hourPalette(t + 0.01);
    for (const k of ['paper', 'ink', 'shade', 'skyZenith', 'skyHorizon'] as const) {
      assert.ok(deltaE(a[k], b[k]) < 1, `${k} jumps at ${t.toFixed(2)}h`);
    }
  }
});

test('washes reproduce each pigment on parchment as authored', () => {
  for (const [name, p] of Object.entries(PIGMENTS)) {
    if (name === 'leadWhite' || name === 'goldLeaf') continue; // body colours, never washes
    const got = toDisplay(wash(toLinear(PARCHMENT), transmittance(p), 1));
    assert.ok(deltaE(got, p) < 1, `${name}: ΔE00 ${deltaE(got, p).toFixed(2)}`);
  }
});

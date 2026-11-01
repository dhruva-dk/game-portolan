import { hash64 } from '../../src/sim/codec.ts';
import { STEER_MAX, idleInput, record, recorder, type Recording, type ShipInput } from '../../src/sim/input.ts';
import * as m from '../../src/sim/math.ts';
import { seaFor, type World } from '../../src/sim/environment.ts';
import { runMatch } from '../../src/sim/match.ts';
import { buildGeography } from '../../src/sim/world/geography.ts';
import { buildNav } from '../../src/sim/world/nav.ts';
import {
  TERRITORY, advance, angleBetween, bearingOf, cellDir, cellOf, faceUV, fromLatLon, horizonDistance, localFrame,
  tangentAt, tangentToward,
} from '../../src/sim/sphere.ts';
import { createMatch, decodeMatch, encodeMatch, matchHash } from '../../src/sim/state.ts';
import type { MatchState } from '../../src/sim/state.ts';
import { FITTING, SLOT } from '../../src/sim/tables.ts';

function digest(values: ArrayLike<number>): string {
  const bytes = new Uint8Array(values.length * 8), view = new DataView(bytes.buffer);
  for (let i = 0; i < values.length; i++) view.setFloat64(8 * i, values[i], true);
  return hash64(bytes);
}

const TENS = [1, 10, 100, 1e3, 1e4, 1e5, 1e6, 1e7, 1e8, 1e9, 1e10, 1e11, 1e12];
const spread = (r: m.Rng, top: number) => (m.rngFloat(r) - 0.5) * 2 * TENS[m.rngInt(r, top + 1)];

function mathVectors(): string {
  const r = m.rngFrom(1), out: number[] = [];
  const special = [0, -0, 1e-300, -1e-300, 0.5, -0.5, 1, -1, 2, m.HALF_PI, m.PI, -m.PI, 2 * m.PI, 1e-8, 355, 103993, m.TRIG_RANGE];
  for (let i = 0; i < 20_000; i++) {
    const x = i < special.length ? special[i] : i & 1 ? (m.rngFloat(r) - 0.5) * 4 * m.PI : spread(r, 6);
    out.push(m.dsin(x), m.dcos(x), m.dtan(x));
    const a = i < special.length ? special[i] : spread(r, 12) * (i & 1 ? 1 : 1e-12);
    out.push(m.datan(a), m.datan2(a, spread(r, 4)), m.datan2(spread(r, 4), a));
    const s = i & 1 ? m.rngRange(r, -1, 1) : (i & 2 ? 1 : -1) * (1 - 1 / TENS[m.rngInt(r, 13)]);
    out.push(m.dasin(s), m.dacos(s));
    const e = i < special.length ? special[i] : m.rngRange(r, -745.2, 709.8);
    out.push(m.dexp(e), m.dlog(m.dexp(m.rngRange(r, -740, 709))), m.dlog(m.rngRange(r, 0.5, 2)));
  }
  for (const x of [5e-324, 2.2250738585072014e-308, 1.7976931348623157e308, -1, 0, Infinity]) out.push(m.dlog(x));
  for (const x of [710, -746, -745, -744.44, 709.78]) out.push(m.dexp(x));
  const a = m.v3(), b = m.v3(), c = m.v3();
  for (let i = 0; i < 2000; i++) {
    m.set(a, spread(r, 3), spread(r, 3), spread(r, 3));
    m.set(b, spread(r, 3), spread(r, 3), spread(r, 3));
    m.cross(c, a, b);
    m.addScaled(c, c, m.normalize(a), m.dot(a, b));
    out.push(c.x, c.y, c.z, m.length(c));
  }
  return digest(out);
}

function rngVectors(): string {
  const out: number[] = [];
  for (let s = 0; s < 16; s++) {
    const r = m.rngFrom(m.hash32(20261024, s));
    for (let i = 0; i < 2000; i++) out.push(m.rngU32(r), m.rngFloat(r), m.rngInt(r, 1000), m.rngRange(r, -3, 7), m.rngChance(r, 0.25) ? 1 : 0);
    for (let i = 0; i < 64; i++) out.push(m.hash32(s, i));
  }
  return digest(out);
}

function sphereVectors(): string {
  const r = m.rngFrom(2), out: number[] = [TERRITORY.totalArea];
  for (const c of TERRITORY.edge) out.push(c);
  for (const a of TERRITORY.area) out.push(a);
  const p = m.v3(), t = m.v3(), q = m.v3(), e = m.v3(), n = m.v3(), uv = { face: 0, u: 0, v: 0 };
  for (let i = 0; i < 20_000; i++) {
    fromLatLon(m.rngRange(r, -m.HALF_PI, m.HALF_PI), m.rngRange(r, -m.PI, m.PI), p);
    faceUV(p, uv);
    out.push(cellOf(TERRITORY, p), uv.face, uv.u, uv.v);
    cellDir(TERRITORY, m.rngInt(r, TERRITORY.cells), q);
    out.push(q.x, q.y, q.z, angleBetween(p, q));
    localFrame(p, e, n);
    tangentAt(p, m.rngRange(r, -m.PI, m.PI), t);
    out.push(e.x, e.y, e.z, n.x, n.y, n.z, t.x, t.y, t.z, bearingOf(p, t));
    tangentToward(p, q, t);
    out.push(t.x, t.y, t.z);
  }
  fromLatLon(0.3, 1.1, p);
  tangentAt(p, 0.7, t);
  for (let i = 0; i < 18_000; i++) {
    advance(p, t, 0.11 + (i % 7) * 0.01, p, t);
    if (i % 100 === 0) out.push(p.x, p.y, p.z, t.x, t.y, t.z);
  }
  for (let h = 0; h < 50; h++) out.push(horizonDistance(h * 0.37));
  return digest(out);
}

export function scriptedInputs(seed: number, ticks: number): ShipInput[] {
  const r = m.rngFrom(seed), inputs: ShipInput[] = [], held = idleInput();
  for (let t = 0; t < ticks; t++) {
    const input: ShipInput = { ...held, sail: 0, consumable: -1, chestPick: -1, course: null };
    if (m.rngChance(r, 0.05)) held.steer = input.steer = m.rngInt(r, 2 * STEER_MAX + 1) - STEER_MAX;
    if (m.rngChance(r, 0.01)) input.sail = m.rngChance(r, 0.5) ? 1 : -1;
    if (m.rngChance(r, 0.01)) held.flags = input.flags = m.rngInt(r, 32);
    if (m.rngChance(r, 0.003)) input.consumable = m.rngInt(r, 3);
    if (m.rngChance(r, 0.003)) held.aim = input.aim = m.rngChance(r, 0.5) ? -1 : m.rngInt(r, TERRITORY.cells);
    if (m.rngChance(r, 0.002)) input.chestPick = m.rngInt(r, 3);
    if (m.rngChance(r, 0.002)) {
      input.course = m.rngChance(r, 0.2) ? [] : Array.from({ length: 1 + m.rngInt(r, 40) }, () => m.rngInt(r, TERRITORY.cells));
    }
    inputs.push(input);
  }
  return inputs;
}

export function recordInputs(inputs: ShipInput[]): Recording {
  const rec = recorder();
  inputs.forEach((input, tick) => record(rec, tick, input));
  return rec.recording;
}

let built: World | null = null;

export function world(): World {
  if (!built) {
    const geo = buildGeography();
    built = { geo, nav: buildNav(geo) };
  }
  return built;
}

function matchVectors(): { match: string; resumed: string } {
  const ticks = 3600, recording = recordInputs(scriptedInputs(5, ticks)), seed = 20261024, sea = seaFor(world(), seed);
  const whole = createMatch({ seed, fleet: [1, 0, 1, 2, 3, 0, 1, 2, 3, 0].map((form, i) => ({ form, captain: i > 0 ? { temperament: (i - 1) % 6, tier: i } : undefined })) });
  runMatch(sea, whole, recording, ticks);
  const half = createMatch({ seed, fleet: [1, 0, 1, 2, 3, 0, 1, 2, 3, 0].map((form, i) => ({ form, captain: i > 0 ? { temperament: (i - 1) % 6, tier: i } : undefined })) });
  runMatch(sea, half, recording, ticks / 2);
  const resumed = decodeMatch(encodeMatch(half));
  runMatch(sea, resumed, recording, ticks);
  return { match: matchHash(whole), resumed: matchHash(resumed) };
}

export function vectors(): Record<string, string> {
  return { math: mathVectors(), rng: rngVectors(), sphere: sphereVectors(), ...matchVectors() };
}

export function unarmed(s: MatchState, from = 0): MatchState {
  for (let i = from; i < s.ships.length; i++) s.ships[i].fittings[SLOT.broadside] = { kind: FITTING.none, tier: 0 };
  return s;
}

import * as THREE from 'three';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { illustratedMaterial, inkMaterial, linearVec, transmittanceVec, type Style } from '../../style/glsl.ts';
import { mix, PIGMENTS, type RGB } from '../../style/palette.ts';
import { cellOf, R, TERRITORY } from '../../sim/sphere.ts';
import { heightAt, ZONE } from '../../sim/world/geography.ts';
import { DRAFT, REGIONS, TIDE, type Stroke } from '../../sim/world/regions.ts';
import { CALDERA } from '../../sim/tables.ts';
import { eruption, untilEruption } from '../../sim/economy.ts';
import type { MatchState } from '../../sim/state.ts';
import { floraMaterial, kitGeometry } from '../flora.ts';
import type { Lamp, Lights } from '../light.ts';
import { seas } from '../sea.ts';
import { skies } from '../sky.ts';
import { SWELL_GLSL, type Swell } from '../swell.ts';
import { GROUND, terrains, type Ground, type Surface, type TerrainField } from '../terrain.ts';
import { airOf } from '../weather.ts';
import type { RenderContext, RenderModule } from '../world.ts';
import { chartDir, Draw, Kit, lift, pose, regionSeen, seeded, vec, type V, washOf } from './kit.ts';

const RI = REGIONS.findIndex((r) => r.id === 'fireArchipelago');
const REGION = REGIONS[RI];
const TAU = 2 * Math.PI;
export const BLOCK = TIDE.amp - DRAFT, LAND = TIDE.amp + 0.15;
export const PERIOD = REGION.mechanics.eruption!;

type Cone = Extract<Stroke, { k: 'cone' }>;
type Hot = Extract<Stroke, { k: 'hot' }>;
type Land = Extract<Stroke, { k: 'land' }>;
const CONES = REGION.strokes.filter((s): s is Cone => s.k === 'cone');
export const VOLCANO = CONES.reduce((a, b) => (b.top > a.top ? b : a));
export const HOTS = REGION.strokes.filter((s): s is Hot => s.k === 'hot');

export function calderaTime(state: MatchState): number {
  const e = eruption(state);
  return e >= 0 ? e * CALDERA.burst : PERIOD - untilEruption(state);
}

export function fireOf(t: number): number {
  return t < CALDERA.burst ? Math.min(1, t / 0.8) : 0.6 * Math.exp(-(t - CALDERA.burst) / 5);
}

export interface Flow { x: number[]; y: number[]; half: number[]; s: number[]; entry: number; hot: Hot }
const STEP = 0.35;

export function flowsOf(sim: (x: number, y: number) => number): Flow[] {
  const flows: Flow[] = [];
  for (const st of REGION.strokes) {
    if (st.k !== 'land') continue;
    const p = (st as Land).pts, n = p.length / 3, ex = p[3 * n - 3], ey = p[3 * n - 2];
    const hot = HOTS.find((h) => Math.hypot(ex - h.x, ey - h.y) < h.r);
    if (!hot || Math.hypot(p[0] - VOLCANO.x, p[1] - VOLCANO.y) > VOLCANO.r) continue;
    const ux = p[0] - VOLCANO.x, uy = p[1] - VOLCANO.y, ul = Math.hypot(ux, uy), rim = VOLCANO.crater + 0.6;
    const mid = (rim + ul) / 2, kx = [VOLCANO.x + (ux / ul) * rim, VOLCANO.x + (ux / ul) * mid], ky = [VOLCANO.y + (uy / ul) * rim, VOLCANO.y + (uy / ul) * mid], kh = [0.6, 0.95];
    for (let i = 0; i < n; i++) kx.push(p[3 * i]), ky.push(p[3 * i + 1]), kh.push(p[3 * i + 2] * (i === 0 ? 0.62 : 0.68));
    kx.push(hot.x), ky.push(hot.y), kh.push(kh[kh.length - 1] * 0.85);
    const f: Flow = { x: [], y: [], half: [], s: [], entry: 0, hot };
    const at = (i: number, t: number, k: number[]): number => {
      const a = k[Math.max(i - 1, 0)], b = k[i], c = k[i + 1], d = k[Math.min(i + 2, k.length - 1)];
      return 0.5 * (2 * b + (c - a) * t + (2 * a - 5 * b + 4 * c - d) * t * t + (3 * b - a - 3 * c + d) * t * t * t);
    };
    let s = 0, px = kx[0], py = ky[0];
    for (let i = 0; i + 1 < kx.length; i++) {
      for (let t = 0; t < 1; t += 0.01) {
        const x = at(i, t, kx), y = at(i, t, ky), d = Math.hypot(x - px, y - py);
        if (f.s.length && s + d < f.s[f.s.length - 1] + STEP) { s += d; px = x; py = y; continue; }
        s += d; px = x; py = y;
        f.x.push(x), f.y.push(y), f.half.push(at(i, t, kh)), f.s.push(s);
      }
    }
    for (let i = 1; i + 1 < f.x.length; i++) {
      const tx = f.x[i + 1] - f.x[i - 1], ty = f.y[i + 1] - f.y[i - 1], tl = Math.hypot(tx, ty), m = (0.3 + 0.6 * (1 - Math.min(1, f.s[i] / 16))) * Math.sin(f.s[i] * 0.38 + p[0]);
      f.x[i] += (-ty / tl) * m;
      f.y[i] += (tx / tl) * m;
    }
    const k = f.s.findIndex((_, i) => i > 4 && sim(f.x[i], f.y[i]) < 0);
    f.entry = f.s[k < 0 ? f.s.length - 1 : k];
    flows.push(f);
  }
  return flows;
}

export function flowNear(flows: readonly Flow[], x: number, y: number): { d: number; s: number; flow: Flow | null } {
  let best = { d: Infinity, s: 0, flow: null as Flow | null };
  for (const f of flows) {
    for (let i = 0; i < f.x.length; i++) {
      const d = Math.hypot(x - f.x[i], y - f.y[i]) / f.half[i];
      if (d < best.d) best = { d, s: f.s[i], flow: f };
    }
  }
  return best;
}

const W = {
  basalt: washOf(mix(PIGMENTS.ironGall, PIGMENTS.indigo, 0.25), 0.62), basaltLit: washOf(mix(PIGMENTS.sepia, PIGMENTS.leadWhite, 0.35), 0.5),
  rust: washOf(mix(PIGMENTS.umber, PIGMENTS.vermilion, 0.35), 0.6),
  tuff: washOf(mix(PIGMENTS.ochre, PIGMENTS.leadWhite, 0.45), 0.42), tuffBand: washOf(mix(PIGMENTS.ochre, PIGMENTS.umber, 0.45), 0.55),
  tuffTop: washOf(mix(PIGMENTS.ochre, PIGMENTS.sepia, 0.3), 0.35),
  char: washOf(PIGMENTS.ironGall, 0.9), charLit: washOf(mix(PIGMENTS.sepia, PIGMENTS.ironGall, 0.4), 0.7), ash: washOf(mix(PIGMENTS.sepia, PIGMENTS.indigo, 0.2), 0.7),
};

function clinkerKit(seed: number): THREE.BufferGeometry {
  const rnd = seeded(seed), k = new Kit((_, n) => (n.y > 0.55 ? W.basaltLit : rnd() < 0.18 ? W.rust : W.basalt));
  const j = Array.from({ length: 6 }, () => 0.75 + 0.5 * rnd());
  return k.loft([
    Array.from({ length: 6 }, (_, i) => vec(Math.cos((i / 6) * TAU) * j[i], -0.15, Math.sin((i / 6) * TAU) * j[i])),
    Array.from({ length: 6 }, (_, i) => vec(Math.cos((i / 6 + 0.08) * TAU) * j[(i + 2) % 6] * 0.95, 0.5 + 0.2 * rnd(), Math.sin((i / 6 + 0.08) * TAU) * j[(i + 2) % 6] * 0.95)),
    Array.from({ length: 6 }, (_, i) => vec(Math.cos((i / 6 + 0.17) * TAU) * 0.4 * j[(i + 4) % 6], 0.85 + 0.15 * rnd(), Math.sin((i / 6 + 0.17) * TAU) * 0.4 * j[(i + 4) % 6])),
  ]).build();
}

function tuffKit(seed: number): THREE.BufferGeometry {
  const rnd = seeded(seed), beds = [0, 0.22, 0.4, 0.62, 0.78, 0.95];
  const k = new Kit((c, n) => (n.y > 0.7 ? W.tuffTop : Math.floor((c.y + 0.12) / 0.2) % 2 ? W.tuffBand : W.tuff));
  const lobes = Array.from({ length: 9 }, () => 0.8 + 0.4 * rnd());
  return k.loft(beds.map((y, b) => Array.from({ length: 9 }, (_, i) => {
    const a = (i / 9) * TAU, r = lobes[i] * (1.15 - 0.62 * y - 0.06 * (b % 2)) * (1 + 0.1 * (rnd() - 0.5));
    return vec(Math.cos(a) * r * 1.4, y, Math.sin(a) * r);
  }))).build();
}

function snagKit(seed: number): THREE.BufferGeometry {
  const rnd = seeded(seed), k = new Kit((c, n) => (c.y < 0.35 ? W.char : n.y > 0.4 ? W.charLit : W.ash));
  const limb = (from: V, dir: V, len: number, r0: number, r1: number, segs: number): void => {
    const d = dir.clone().normalize(), side = vec().crossVectors(d, Math.abs(d.y) < 0.9 ? vec(0, 1, 0) : vec(1, 0, 0)).normalize(), side2 = vec().crossVectors(side, d);
    k.loft(Array.from({ length: segs + 1 }, (_, i) => {
      const t = i / segs, r = r0 + (r1 - r0) * t, c = from.clone().addScaledVector(d, len * t).add(vec(0.03 * (rnd() - 0.5), 0, 0.03 * (rnd() - 0.5)));
      return Array.from({ length: 5 }, (_, j) => c.clone().addScaledVector(side, Math.cos((j / 5) * TAU) * r).addScaledVector(side2, Math.sin((j / 5) * TAU) * r));
    }));
  };
  const lean = vec(0.12 * (rnd() - 0.5), 1, 0.12 * (rnd() - 0.5));
  limb(vec(), lean, 1, 0.07, 0.025, 4);
  for (let i = 0, m = 2 + Math.floor(rnd() * 2); i < m; i++) {
    const h = 0.45 + 0.4 * rnd(), a = rnd() * TAU;
    limb(lean.clone().normalize().multiplyScalar(h), vec(Math.cos(a), 0.7 + 0.6 * rnd(), Math.sin(a)), 0.25 + 0.2 * rnd(), 0.025, 0.01, 2);
  }
  return k.build();
}

export interface Part { m: THREE.Matrix4; at: V; dir: V; base: number; ground: number; sim: number; top: number; reach: number }
export interface FirePlan {
  flows: Flow[];
  clinker: Part[]; tuff: Part[]; snags: Part[]; palms: Part[];
  crater: { dir: V; h: number; rim: number }; entries: { dir: V; half: number }[]; vents: { dir: V; r: number; sea: boolean }[];
  voices: { at: V; loud: number; kind: 'crater' | 'entry' | 'fumarole' }[];
}

const surfaceOut = (): Surface => ({ height: 0, normal: vec(), up: 1, ground: GROUND.meadow as Ground, region: RI });
export const groundAt = (field: TerrainField, dir: V): number => field.surface(dir, -10, surfaceOut()).height;

export function planFire(field: TerrainField): FirePlan {
  const geo = field.geo, S = surfaceOut();
  const sim = (x: number, y: number): number => heightAt(geo, chartDir(RI, x, y));
  const flows = flowsOf(sim);
  const plan: FirePlan = {
    flows, clinker: [], tuff: [], snags: [], palms: [],
    crater: { dir: chartDir(RI, VOLCANO.x, VOLCANO.y), h: 0, rim: 0 }, entries: [], vents: [], voices: [],
  };
  const place = (list: Part[], x: number, y: number, o: { sink: number; yaw: number; tilt?: number; s: number; sy?: number; kitH: number; reach: number }): Part => {
    const dir = chartDir(RI, x, y), ground = field.surface(dir, -10, S).height, base = ground - o.sink, sy = o.sy ?? o.s, at = lift(dir, base);
    const fwd = chartDir(RI, x, y + 0.5).sub(dir).normalize();
    const p: Part = { m: pose(new THREE.Matrix4(), at, S.normal.lengthSq() > 0 && o.tilt === undefined ? S.normal.clone().lerp(dir, 0.5) : dir, fwd, o.yaw, o.tilt ?? 0, o.s, sy, o.s), at, dir, base, ground, sim: heightAt(geo, dir), top: base + o.kitH * sy, reach: o.reach };
    list.push(p);
    return p;
  };
  plan.crater.h = field.surface(plan.crater.dir, -10, S).height + 1;
  for (let k = 0; k < 24; k++) plan.crater.rim = Math.max(plan.crater.rim, field.surface(chartDir(RI, VOLCANO.x + VOLCANO.crater * Math.cos((k / 24) * TAU), VOLCANO.y + VOLCANO.crater * Math.sin((k / 24) * TAU)), -10, S).height);
  for (const f of flows) {
    const i = f.s.findIndex((s) => s >= f.entry);
    plan.entries.push({ dir: chartDir(RI, f.x[i], f.y[i]), half: f.half[i] });
  }
  for (const h of HOTS) if (!flows.some((f) => f.hot === h)) plan.vents.push({ dir: chartDir(RI, h.x, h.y), r: h.r, sea: sim(h.x, h.y) < 0 });
  const rnd = seeded(925), satellites = CONES.filter((c) => c !== VOLCANO);
  for (let y = -70; y <= 70; y += 0.7) {
    for (let x = -70; x <= 70; x += 0.7) {
      const px = x + 0.6 * (rnd() - 0.5), py = y + 0.6 * (rnd() - 0.5), h = sim(px, py), r1 = rnd(), r2 = rnd(), r3 = rnd();
      if (h < BLOCK) continue;
      const near = flowNear(flows, px, py), rho = Math.hypot(px - VOLCANO.x, py - VOLCANO.y);
      if (near.flow && ((near.d > 0.78 && near.d < 1.25 && near.s > 3 && r1 < 0.42) || (near.d < 1.15 && near.s > near.flow.entry - 6 && h > -0.5 && r1 < 0.5))) {
        place(plan.clinker, px, py, { sink: 0.08, yaw: r2 * TAU, tilt: 0.25 * (r3 - 0.5), s: near.s > near.flow.entry - 6 ? 0.3 + 0.45 * r2 : 0.18 + 0.3 * r2, sy: 0.18 + 0.3 * r3, kitH: 1, reach: 0.7 });
        continue;
      }
      if (h < LAND || near.d < 1.05) continue;
      const S2 = field.surface(chartDir(RI, px, py), -10, S), up = S2.up, sat = satellites.find((c) => Math.hypot(px - c.x, py - c.y) < c.r);
      const old = rho > VOLCANO.r + 1.5;
      if (((sat && Math.hypot(px - sat.x, py - sat.y) > 0.3 * sat.r) || (old && up < 0.93)) && r1 < (sat ? 0.045 : 0.03) && S2.ground !== GROUND.beach) {
        place(plan.tuff, px, py, { sink: 0.25, yaw: r2 * TAU, s: 0.5 + 0.9 * r3, sy: 0.35 + 0.5 * r2, kitH: 0.95, reach: 1.6 });
        continue;
      }
      if (S2.height < 6 && ((near.d < 2.2 && r1 < 0.07) || (!old && rho > 0.72 * VOLCANO.r && r1 < 0.008))) {
        place(plan.snags, px, py, { sink: 0.05, yaw: r2 * TAU, tilt: 0.16 * (r3 - 0.5), s: 0.55 + 0.55 * r3, kitH: 1, reach: 0.4 });
        continue;
      }
      if (old && up > 0.82 && S2.height < 3.5 && S2.ground !== GROUND.beach && r1 < 0.05) {
        place(plan.palms, px, py, { sink: 0.1, yaw: r2 * TAU, tilt: 0.12 + 0.2 * r3, s: 2.4 + 1.2 * r2, kitH: 0.95, reach: 0.6 });
      }
    }
  }
  plan.voices = [
    { at: plan.crater.dir, loud: 1, kind: 'crater' },
    ...plan.entries.map((e) => ({ at: e.dir, loud: 0.8, kind: 'entry' as const })),
    ...plan.vents.map((v) => ({ at: v.dir, loud: 0.35, kind: 'fumarole' as const })),
  ];
  return plan;
}

const NOISE_GLSL =  `
float fzHash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float fzNoise(vec3 x) {
  vec3 i = floor(x), f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(fzHash(i), fzHash(i + vec3(1, 0, 0)), f.x), mix(fzHash(i + vec3(0, 1, 0)), fzHash(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(fzHash(i + vec3(0, 0, 1)), fzHash(i + vec3(1, 0, 1)), f.x), mix(fzHash(i + vec3(0, 1, 1)), fzHash(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}
vec2 fzCell(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  float d1 = 8.0, d2 = 8.0;
  for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
    vec2 g = vec2(x, y), o = vec2(fzHash(vec3(i + g, 1.7)), fzHash(vec3(i + g, 5.3)));
    vec2 r = g + o - f;
    float d = dot(r, r);
    if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) d2 = d;
  }
  return vec2(sqrt(d1), sqrt(d2) - sqrt(d1));
}
`;

const FLOW_VERT =  `
in vec4 aFlow;
out vec3 vWorld;
out vec3 vNormal;
out vec4 vFlow;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  vNormal = normalize(mat3(modelMatrix) * normal);
  vFlow = aFlow;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;

const FLOW_FRAG =  `
${NOISE_GLSL}
in vec3 vWorld;
in vec3 vNormal;
in vec4 vFlow;
uniform vec3 uCrustT, uRustT, uFireC, uGoldC;
uniform float uFire, uFront;
void main() {
  vec3 n = normalize(vNormal) * (gl_FrontFacing ? 1.0 : -1.0), v = normalize(cameraPosition - vWorld);
  Paper q = paperAt(vWorld, n, 1.0);
  float s = vFlow.x, x = vFlow.y * vFlow.z, edge = abs(vFlow.y), far = distance(cameraPosition, vWorld);
  vec2 fp = vec2(s, x);
  float ndl = dot(n, uSun), tone = lightTone(ndl, abs(dot(n, v)));
  float rust = smoothstep(0.5, 0.85, fzNoise(vec3(fp * 0.3, 3.0)));
  vec3 col = glaze(parchment(q), mix(uCrustT, uRustT, 0.3 * rust), 1.45 + 0.2 * smoothstep(0.7, 1.0, edge), washPool(n, v, q), q);
  col = sunGlaze(shadeGlaze(col, tone, q), ndl, tone);
  col = mix(col, mix(uInk, vec3(0.04, 0.05, 0.08), 0.5), 0.62 - 0.2 * rust - 0.2 * smoothstep(0.3, 0.9, ndl) * fzNoise(vec3(fp * 1.7, 4.0)));
  float rope = s * 1.6 - 0.5 * x * x / max(vFlow.z, 0.6) + 0.35 * fzNoise(vec3(fp * 0.7, 1.0));
  float rl = abs(fract(rope) - 0.5) / max(fwidth(rope), 1e-4);
  col = mix(col, uInk, 0.7 * (1.0 - smoothstep(0.5, 1.5, rl)) * (1.0 - smoothstep(25.0, 60.0, far)) * (1.0 - smoothstep(0.75, 0.95, edge)));
  vec2 hc = vec2(rope * 0.7, x * 1.4);
  col = mix(col, hatchInk(tone), hatching(hc, dFdx(hc), dFdy(hc), tone, 3.0));
  vec2 cell = fzCell(fp * vec2(1.5, 1.9));
  float crack = 1.0 - smoothstep(0.0, 0.05 + 1.2 * fwidth(cell.y), cell.y);
  float channel = 1.0 - smoothstep(0.08, 0.3, edge);
  float front = smoothstep(-12.0, -1.0, vFlow.w) * (1.0 - smoothstep(0.6, 1.0, edge));
  float skylight = smoothstep(0.78, 0.92, fzNoise(vec3(fp * vec2(0.35, 0.9), 7.0))) * channel;
  float run = (1.0 - smoothstep(0.04, 0.16, edge)) * (1.0 - smoothstep(uFront - 2.0, uFront, s)) * uFire;
  float heat = crack * (0.3 + 0.5 * channel + 0.9 * front + 0.6 * run) + 0.8 * skylight * (0.4 + 0.6 * uFire) + 0.75 * run * (0.6 + 0.4 * fzNoise(vec3(fp * 1.3, 2.0)));
  heat = clamp(heat, 0.0, 1.0);
  col = mix(col, mix(uFireC, uGoldC, smoothstep(0.55, 1.0, heat)), heat);
  writeInk(col, n, 0.8);
}`;

const HOT_VERT =  `
${SWELL_GLSL}
uniform float uTime;
in float aHot;
out float vHot;
out vec3 vRest;
out vec3 vWorld;
void main() {
  vec3 dir = normalize(position), nn;
  float lift;
  vec4 f = seaField(dir);
  vec3 d = swell(dir, uTime, swellAmp(uSeaLevel - f.x), nn, lift);
  vWorld = dir * (SEA_R + uSeaLevel + 0.06) + d;
  vRest = dir;
  vHot = aHot;
  gl_Position = projectionMatrix * viewMatrix * vec4(vWorld, 1.0);
}`;

const HOT_FRAG =  `
${NOISE_GLSL}
in float vHot;
in vec3 vRest;
in vec3 vWorld;
uniform vec3 uJadeT, uSulphurT, uRustT, uRimT;
void main() {
  vec3 p = vRest * ${R.toFixed(1)};
  Paper q = paperAt(p, vRest, 1.0);
  float n1 = fzNoise(p * 0.2 + vec3(0.0, uTime * 0.04, 0.0)), n2 = fzNoise(p * 0.55 - uTime * 0.06);
  float h = clamp(vHot + 0.3 * (n1 - 0.5), 0.0, 1.0);
  vec3 t = mix(uRustT, uSulphurT, smoothstep(0.35, 0.6, h));
  t = mix(t, uJadeT, smoothstep(0.62, 0.9, h + 0.2 * (n2 - 0.5)));
  vec3 col = glaze(parchment(q), t, 0.85, 0.35 + 0.3 * n2, q);
  float a = smoothstep(0.35, 0.7, h) * (0.45 + 0.25 * n2);
  float rl = abs(vHot - 0.5) / max(fwidth(vHot), 1e-4);
  float rim = (1.0 - smoothstep(0.5, 1.6, rl)) * step(0.45, fzNoise(p * 1.9)) * (1.0 - smoothstep(60.0, 140.0, distance(cameraPosition, vWorld)));
  col = mix(col, glaze(parchment(q), uRimT, 1.1, 0.5, q), rim);
  writeVeil(col, max(a, 0.6 * rim));
}`;

const SMOKE_VERT =  `
in vec4 aLobe;
out vec3 vWorld;
out vec3 vNormal;
out vec3 vAnchor;
out vec3 vUp;
out vec4 vLobe;
void main() {
  mat4 M = modelMatrix * instanceMatrix;
  vec4 w = M * vec4(position, 1.0);
  vWorld = w.xyz;
  vNormal = normalize(mat3(M) * normal);
  vAnchor = normalize(position) * length(instanceMatrix[0].xyz) + aLobe.w * 41.0;
  vUp = normalize(instanceMatrix[3].xyz);
  vLobe = aLobe;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;

const SMOKE_FRAG =  `
${NOISE_GLSL}
in vec3 vWorld;
in vec3 vNormal;
in vec3 vAnchor;
in vec3 vUp;
in vec4 vLobe;
uniform vec3 uAshT, uSteamT, uFireC, uGoldC;
void main() {
  float grain = 0.6 * fzNoise(vAnchor * 0.9) + 0.4 * fzNoise(vAnchor * 3.3);
  vec3 n = normalize(vNormal) * (gl_FrontFacing ? 1.0 : -1.0), v = normalize(cameraPosition - vWorld);
  float rimEdge = 1.0 - abs(dot(n, v));
  if (grain < vLobe.y * 1.1 - 0.08 + 0.6 * pow(rimEdge, 1.5)) discard;
  Paper q = paperAt(vAnchor, n, 0.3);
  float ndl = dot(n, uSun), tone = lightTone(ndl, abs(dot(n, v)));
  vec3 col = glaze(parchment(q), mix(uAshT, uSteamT, vLobe.x), mix(1.1, 0.18, vLobe.x), washPool(n, v, q), q);
  col = mix(col, mix(uInk, uPaper, 0.6), (0.1 + 0.3 * smoothstep(0.2, 0.9, tone) + 0.12 * smoothstep(-0.2, 0.8, -dot(n, vUp))) * (1.0 - 0.75 * vLobe.x));
  col = sunGlaze(col, ndl, tone);
  float glow = vLobe.z * (0.35 + 0.65 * smoothstep(-0.3, 0.7, -dot(n, vUp)));
  vec2 hc = vec2(vAnchor.y, vAnchor.x + 0.7 * vAnchor.z);
  float ink = hatching(hc, dFdx(hc), dFdy(hc), tone * mix(0.45, 0.25, vLobe.x), vLobe.w * 7.0);
  col = mix(col, hatchInk(tone), ink * (1.0 - glow));
  col = mix(col, mix(uFireC, uGoldC, smoothstep(0.8, 1.0, glow)), 0.7 * glow);
  writeInk(candle(col, vWorld), n, mix(0.75, 0.5, vLobe.x));
}`;

const STREAK_VERT =  `
uniform float uTime, uErupt, uAsh, uBox;
uniform vec3 uCrater, uUp, uDrift, uEye;
in vec4 aSeed;
in float aKind;
out vec2 vQ;
out float vHeat;
out float vKind;
out float vAlpha;
void main() {
  vec3 p, vel;
  float w, len, alpha, heat = 0.0;
  if (aKind < 0.5) {
    float L = 1.6 + 1.6 * aSeed.y, ph = fract(uTime / L + aSeed.x), t = ph * L;
    vec3 e = normalize(cross(uUp, vec3(0.31, 0.83, 0.47))), f = cross(uUp, e);
    float ang = aSeed.z * 6.2831853, out_ = aSeed.x < 0.4 ? 0.3 + 1.2 * aSeed.w : 1.0 + 5.0 * aSeed.w * aSeed.w;
    vec3 v0 = uUp * (13.0 + 13.0 * aSeed.y) + (cos(ang) * e + sin(ang) * f) * out_;
    p = uCrater + v0 * t - 7.0 * t * t * uUp;
    vel = v0 - 14.0 * t * uUp;
    heat = 1.0 - 0.8 * ph;
    alpha = step(aSeed.w, uErupt * 1.02) * step(-3.0, dot(p - uCrater, uUp));
    w = 0.22 + 0.25 * aSeed.y;
    len = 0.08;
  } else {
    vec3 v = uDrift - uUp * (0.5 + 0.6 * aSeed.y);
    p = uEye + uBox * (fract((aSeed.xyz * uBox + v * uTime - uEye) / uBox) - 0.5);
    vel = v + 0.35 * vec3(sin(uTime * 1.3 + aSeed.x * 40.0), cos(uTime * 1.1 + aSeed.y * 30.0), sin(uTime * 0.9 + aSeed.z * 50.0));
    float r = distance(p, uEye) / uBox;
    alpha = step(aSeed.w, uAsh) * (1.0 - smoothstep(0.3, 0.5, r)) * smoothstep(1.2, 3.0, distance(p, cameraPosition));
    w = 0.012 + 0.012 * aSeed.y;
    len = 0.12 + 0.12 * aSeed.z;
  }
  w = max(w, 0.0014 * distance(p, cameraPosition));
  vec3 ax = normalize(vel), side = normalize(cross(ax, normalize(cameraPosition - p)));
  vec3 at = p + ax * (position.y - 1.0) * length(vel) * len + side * position.x * w;
  vQ = position.xy;
  vHeat = heat;
  vKind = aKind;
  vAlpha = alpha;
  gl_Position = alpha > 0.0 ? projectionMatrix * viewMatrix * vec4(at, 1.0) : vec4(2.0, 2.0, 2.0, 1.0);
}`;

const STREAK_FRAG =  `
in vec2 vQ;
in float vHeat;
in float vKind;
in float vAlpha;
uniform vec3 uFireC, uGoldC, uAshC;
void main() {
  float across = abs(vQ.x), edge = 1.0 - smoothstep(0.3, 0.5, across);
  if (vKind < 0.5) {
    vec3 c = mix(uFireC, uGoldC, smoothstep(0.35, 0.9, vHeat) * (1.0 - smoothstep(0.08, 0.4, across)));
    writeVeil(c, edge * vAlpha * smoothstep(0.0, 0.3, vQ.y));
  } else {
    writeVeil(uAshC, edge * vAlpha * 0.6 * smoothstep(0.0, 0.35, vQ.y) * (1.0 - smoothstep(0.85, 1.0, vQ.y)));
  }
}`;

function lobeGeometry(detail: number, seed: number): THREE.BufferGeometry {
  const g = mergeVertices(new THREE.IcosahedronGeometry(1, detail).deleteAttribute('normal').deleteAttribute('uv'));
  const rnd = seeded(seed), knobs = Array.from({ length: 9 }, () => [vec(rnd() - 0.5, rnd() - 0.3, rnd() - 0.5).normalize(), 0.12 + 0.16 * rnd(), 0.5 + 0.2 * rnd()] as const);
  const pos = g.getAttribute('position') as THREE.BufferAttribute, p = vec();
  const curls = Array.from({ length: 22 }, () => [vec(rnd() - 0.5, rnd() - 0.35, rnd() - 0.5).normalize(), 0.06 + 0.07 * rnd(), 0.8 + 0.1 * rnd()] as const);
  for (let i = 0; i < pos.count; i++) {
    p.fromBufferAttribute(pos, i).normalize();
    let r = 0.82 - 0.12 * Math.max(-p.y, 0);
    for (const [d, h, c] of curls) {
      const k = Math.max(0, (p.dot(d) - c) / (1 - c));
      r += h * Math.sqrt(k * (2 - k));
    }
    for (const [d, h, c] of knobs) {
      const k = Math.max(0, (p.dot(d) - c) / (1 - c));
      r += h * k * k * (3 - 2 * k);
    }
    pos.setXYZ(i, p.x * r, p.y * r * 0.9, p.z * r);
  }
  g.computeVertexNormals();
  return g;
}

interface Emitter {
  at: V; up: V; n: number; life: number; rise: number; tau: number; r0: number; r1: number; drift: number; shade: number;
  spread: number; thin: number; glow: number; surge: boolean;
}

export class FireArchipelago {
  readonly group = new THREE.Group();
  readonly plan: FirePlan;
  readonly gold = { from: vec(), reach: CALDERA.spread, rain: -1 };
  readonly voices: FirePlan['voices'];
  private readonly kits: Draw[];
  private readonly flow: THREE.Mesh;
  private readonly hot: THREE.Mesh;
  private readonly plume: Draw;
  private readonly steam: Draw;
  private readonly streaks: THREE.Mesh;
  private readonly palms: [Draw, number, number][];
  private readonly emitters: Emitter[];
  private readonly materials: THREE.ShaderMaterial[];
  private readonly lamps: Lamp[];
  private readonly lights: Lights;
  private readonly seen = vec(1e9, 0, 0);
  private readonly m = new THREE.Matrix4();
  private readonly p = vec();
  private readonly e = vec();
  private readonly f = vec();
  private readonly w = vec();

  constructor(style: Style, field: TerrainField, swell: Swell, lights: Lights) {
    const plan = (this.plan = planFire(field));
    this.voices = plan.voices;
    this.lights = lights;
    const T = (c: RGB): THREE.Vector3 => transmittanceVec(c), L = (c: RGB): THREE.Vector3 => linearVec(c);
    const fireC = L(mix(PIGMENTS.vermilion, PIGMENTS.ochre, 0.2)), goldC = L(mix(PIGMENTS.ochre, PIGMENTS.leadWhite, 0.4));
    const painted = illustratedMaterial(style, { pigment: PIGMENTS.sepia, painted: true, side: THREE.DoubleSide });
    const kit = (g: THREE.BufferGeometry, parts: Part[]): Draw => new Draw(g, painted, parts.length).fill(parts.map((p) => p.m));
    const split = (parts: Part[], k: number, of: number): Part[] => parts.filter((_, i) => i % of === k);
    this.kits = [
      ...[0, 1, 2].map((k) => kit(clinkerKit(31 + k), split(plan.clinker, k, 3))),
      ...[0, 1].map((k) => kit(tuffKit(47 + k), split(plan.tuff, k, 2))),
      ...[0, 1].map((k) => kit(snagKit(59 + k), split(plan.snags, k, 2))),
    ];
    const near = floraMaterial(style, swell, { band: new THREE.Vector4(-1, 0, 60, 70), sway: 0.05, hand: true });
    const far = floraMaterial(style, swell, { band: new THREE.Vector4(60, 70, 240, 300), sway: 0.05, far: true, hand: true, id: near.uniforms.uInkId.value as number });
    this.palms = [[0, 0, 70], [1, 60, 300]].map(([lod, from, to]) => {
      const g = kitGeometry('palm', lod).toNonIndexed(), n = Math.max(1, plan.palms.length);
      const fo = new Float32Array(3 * n), bl = new Float32Array(3 * n), sd = new Float32Array(2 * n);
      plan.palms.forEach((_, i) => {
        const u = seeded(i + 7)(), c = T(mix(mix(PIGMENTS.malachite, PIGMENTS.ochre, 0.5 + 0.3 * u), PIGMENTS.umber, 0.2 + 0.25 * u));
        fo.set([c.x, c.y, c.z], 3 * i), bl.set([c.x, c.y, c.z], 3 * i), sd.set([u, 300], 2 * i);
      });
      g.setAttribute('aFoliage', new THREE.InstancedBufferAttribute(fo, 3));
      g.setAttribute('aBloom', new THREE.InstancedBufferAttribute(bl, 3));
      g.setAttribute('aSeed', new THREE.InstancedBufferAttribute(sd, 2));
      return [new Draw(g, lod ? far : near, plan.palms.length), from, to];
    });
    const flowMat = inkMaterial(style, { vertexShader: FLOW_VERT, fragmentShader: FLOW_FRAG, inkWeight: 0.8, side: THREE.DoubleSide, uniforms: {
      uCrustT: { value: T(mix(PIGMENTS.ironGall, PIGMENTS.indigo, 0.4)) }, uRustT: { value: T(mix(PIGMENTS.umber, PIGMENTS.vermilion, 0.3)) },
      uFireC: { value: fireC }, uGoldC: { value: goldC }, uFire: { value: 0 }, uFront: { value: 0 } } });
    flowMat.polygonOffset = true;
    flowMat.polygonOffsetFactor = -1;
    flowMat.polygonOffsetUnits = -2;
    this.flow = new THREE.Mesh(flowGeometry(field, plan.flows), flowMat);
    const hotMat = inkMaterial(style, { vertexShader: HOT_VERT, fragmentShader: HOT_FRAG, veil: true, uniforms: {
      ...swell.uniforms, uJadeT: { value: T(mix(PIGMENTS.verdigris, PIGMENTS.leadWhite, 0.45)) }, uSulphurT: { value: T(mix(PIGMENTS.ochre, PIGMENTS.verdigris, 0.25)) },
      uRustT: { value: T(mix(PIGMENTS.umber, PIGMENTS.vermilion, 0.35)) }, uRimT: { value: T(mix(PIGMENTS.vermilion, PIGMENTS.umber, 0.5)) } } });
    this.hot = new THREE.Mesh(hotGeometry(field), hotMat);
    const smoke = (detail: number, seed: number, n: number): Draw => {
      const g = lobeGeometry(detail, seed);
      g.setAttribute('aLobe', new THREE.InstancedBufferAttribute(new Float32Array(4 * n), 4));
      return new Draw(g, smokeMat, n);
    };
    const smokeMat = inkMaterial(style, { vertexShader: SMOKE_VERT, fragmentShader: SMOKE_FRAG, uniforms: {
      uAshT: { value: T(mix(mix(PIGMENTS.indigo, PIGMENTS.ironGall, 0.4), PIGMENTS.leadWhite, 0.35)) }, uSteamT: { value: T(mix(PIGMENTS.leadWhite, PIGMENTS.ultramarine, 0.08)) },
      uFireC: { value: fireC }, uGoldC: { value: goldC } } });
    this.emitters = emittersOf(plan);
    const count = (plume: boolean): number => this.emitters.filter((e) => e.surge === plume).reduce((s, e) => s + e.n, 0);
    this.plume = smoke(3, 5, count(true));
    this.steam = smoke(2, 9, count(false));
    const BOMBS = 360, ASH = 4200, sg = new THREE.InstancedBufferGeometry(), rnd = seeded(77);
    sg.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, 0, 0, 0.5, 0, 0, 0.5, 1, 0, -0.5, 1, 0], 3));
    sg.setIndex([0, 1, 2, 0, 2, 3]);
    sg.setAttribute('aSeed', new THREE.InstancedBufferAttribute(Float32Array.from({ length: 4 * (BOMBS + ASH) }, () => rnd()), 4));
    sg.setAttribute('aKind', new THREE.InstancedBufferAttribute(Float32Array.from({ length: BOMBS + ASH }, (_, i) => (i < BOMBS ? 0 : 1)), 1));
    sg.instanceCount = BOMBS + ASH;
    const streakMat = inkMaterial(style, { vertexShader: STREAK_VERT, fragmentShader: STREAK_FRAG, veil: true, side: THREE.DoubleSide, uniforms: {
      uErupt: { value: 0 }, uAsh: { value: 0 }, uBox: { value: 44 }, uCrater: { value: vec() }, uUp: { value: vec() }, uDrift: { value: vec() }, uEye: { value: vec() },
      uFireC: { value: fireC }, uGoldC: { value: goldC }, uAshC: { value: L(mix(mix(PIGMENTS.sepia, PIGMENTS.indigo, 0.3), PIGMENTS.leadWhite, 0.15)) } } });
    this.streaks = new THREE.Mesh(sg, streakMat);
    for (const o of [this.flow, this.hot, this.streaks]) o.frustumCulled = false;
    this.materials = [painted, near, far, flowMat, hotMat, smokeMat, streakMat];
    lift(plan.crater.dir, plan.crater.rim + 2, this.gold.from);
    this.lamps = [lights.add({ pos: this.gold.from.clone(), reach: 0 }), ...plan.entries.map((e) => lights.add({ pos: lift(e.dir, 1.2), reach: 7 }))];
    this.group.add(...this.kits.map((d) => d.mesh), ...this.palms.map(([d]) => d.mesh), this.flow, this.hot, this.plume.mesh, this.steam.mesh, this.streaks);
  }

  update(eye: V, clock: number, caldera: number, rain: number, wind: V): void {
    this.group.visible = regionSeen(RI, eye, 200);
    this.gold.rain = rain;
    const fire = fireOf(caldera);
    this.lamps[0].reach = this.group.visible ? 9 + 15 * fire : 0;
    for (const l of this.lamps.slice(1)) l.reach = this.group.visible ? 7 : 0;
    if (!this.group.visible) return;
    const up = this.plan.crater.dir, fu = (this.flow.material as THREE.ShaderMaterial).uniforms;
    fu.uFire.value = fire;
    fu.uFront.value = caldera < CALDERA.burst ? 2 + 6 * caldera : 1e3;
    const wt = this.w.copy(wind).addScaledVector(up, -wind.dot(up));
    if (wt.lengthSq() < 1e-4) wt.copy(chartDir(RI, VOLCANO.x + 1, VOLCANO.y)).sub(up).normalize().multiplyScalar(0.2);
    this.lobes(clock, caldera, wt);
    const su = (this.streaks.material as THREE.ShaderMaterial).uniforms, h = eye.length() - R;
    su.uErupt.value = caldera < CALDERA.burst ? fire : 0;
    lift(up, this.plan.crater.h + 1, su.uCrater.value);
    su.uUp.value.copy(up);
    su.uDrift.value.copy(wt).multiplyScalar(1.6);
    su.uEye.value.copy(eye);
    const arc = R * Math.acos(Math.min(1, eye.dot(up) / eye.length())), down = Math.max(0, this.e.copy(eye).normalize().sub(up).normalize().dot(this.f.copy(wt).normalize()));
    su.uAsh.value = (1 - THREE.MathUtils.smoothstep(h, 25, 60)) * (1 - THREE.MathUtils.smoothstep(arc, 60, 110)) * (0.45 + 0.3 * down + 0.25 * fire);
    if (eye.distanceToSquared(this.seen) < 2.25) return;
    this.seen.copy(eye);
    for (const [d, from, to] of this.palms) {
      d.begin();
      for (const p of this.plan.palms) {
        const r2 = eye.distanceToSquared(p.at);
        if (r2 >= from * from && r2 < to * to) d.add(p.m);
      }
      d.end();
    }
  }

  private lobes(clock: number, caldera: number, wind: V): void {
    const fire = fireOf(caldera), wl = wind.length();
    for (const [d, plume] of [[this.plume, true], [this.steam, false]] as const) {
      const a4 = d.mesh.geometry.getAttribute('aLobe') as THREE.InstancedBufferAttribute, arr = a4.array as Float32Array;
      let n = 0;
      d.begin();
      for (const em of this.emitters) {
        if (em.surge !== plume) continue;
        const e = this.e.copy(wind).normalize(), f = this.f.crossVectors(em.up, e).normalize();
        for (let k = 0; k < em.n; k++) {
          const h1 = fract(Math.sin(k * 12.9898 + em.life * 78.233) * 43758.5453), h2 = fract(h1 * 91.7), h3 = fract(h1 * 317.3);
          const ph = fract(clock / em.life + k / em.n + 0.3 * h1), age = ph * em.life;
          const born = em.surge ? fireOf((((caldera - age) % PERIOD) + PERIOD) % PERIOD) : 0;
          const rise = em.rise * (1 + 0.35 * born) * (1 - Math.exp(-age / em.tau)), hf = rise / em.rise;
          const lat = em.spread * (0.4 + ph);
          this.p.copy(em.at).addScaledVector(em.up, rise)
            .addScaledVector(e, em.drift * Math.min(wl, 1.4) * age * (0.2 + 0.8 * hf) + lat * (h2 - 0.5))
            .addScaledVector(f, lat * (h3 - 0.5));
          const r = (em.r0 + (em.r1 - em.r0) * Math.sqrt(ph)) * (1 + 0.45 * born) * (0.65 + 0.7 * h3);
          d.add(pose(this.m, this.p, em.up, e, h1 * TAU + ph * 1.6, 0.25 * (h2 - 0.5), r, r * (0.85 + 0.2 * h3), r));
          arr.set([Math.min(1, em.shade + (plume ? 0.45 * ph - 0.15 * born : 0)), em.thin + (1 - em.thin) * THREE.MathUtils.smoothstep(ph, em.thin ? 0.4 : 0.62, 1),
            em.glow * (plume ? fire * Math.exp(-rise / 16) * (0.6 + 0.4 * born) : Math.exp(-rise / 5)), h1], 4 * n++);
        }
      }
      d.end();
      a4.needsUpdate = true;
    }
  }

  get triangles(): number {
    if (!this.group.visible) return 0;
    const tris = (m: THREE.Mesh): number => (m.geometry.index ? m.geometry.index.count : m.geometry.getAttribute('position').count) / 3;
    return [...this.kits, ...this.palms.map(([d]) => d)].reduce((s, d) => s + d.triangles, 0) + this.plume.mesh.count * tris(this.plume.mesh) + this.steam.mesh.count * tris(this.steam.mesh) + tris(this.flow) + tris(this.hot)
      + 2 * (this.streaks.geometry as THREE.InstancedBufferGeometry).instanceCount;
  }

  dispose(): void {
    for (const l of this.lamps) this.lights.remove(l);
    for (const m of this.materials) m.dispose();
    for (const d of [...this.kits, ...this.palms.map(([d]) => d), this.plume, this.steam]) d.mesh.geometry.dispose();
    for (const o of [this.flow, this.hot, this.streaks]) o.geometry.dispose();
  }
}

const fract = (x: number): number => x - Math.floor(x);

function emittersOf(plan: FirePlan): Emitter[] {
  const up = plan.crater.dir, rnd = seeded(13);
  const at = (dir: V, h: number): V => lift(dir, h);
  const out: Emitter[] = [
    { at: at(up, plan.crater.h), up, n: 150, life: 40, rise: 46, tau: 11, r0: 1.6, r1: 7.4, drift: 1.1, shade: 0.12, spread: 5.5, thin: 0, glow: 1, surge: true },
  ];
  for (const e of plan.entries) out.push({ at: at(e.dir, 0.4), up: e.dir, n: 26, life: 13, rise: 15, tau: 6, r0: 1.1, r1: 4.6, drift: 1.4, shade: 0.94, spread: 2 * e.half, thin: 0.12, glow: 0.22, surge: false });
  for (let k = 0; k < 4; k++) {
    const a = (k / 4 + 0.1 * rnd()) * TAU, rho = VOLCANO.crater + 1.2;
    const dir = chartDir(RI, VOLCANO.x + rho * Math.cos(a), VOLCANO.y + rho * Math.sin(a));
    out.push({ at: at(dir, plan.crater.rim - 0.8), up: dir, n: 6, life: 9, rise: 6, tau: 4, r0: 0.5, r1: 2.6, drift: 1, shade: 0.88, spread: 1, thin: 0.15, glow: 0, surge: false });
  }
  for (const v of plan.vents) {
    out.push({ at: at(v.dir, v.sea ? 0.2 : 1), up: v.dir, n: 8, life: 8, rise: 6, tau: 4, r0: 0.5, r1: 2.4, drift: 1.2, shade: 0.95, spread: 0.6 * v.r, thin: 0.1, glow: 0, surge: false });
  }
  for (const h of HOTS) {
    const dir = chartDir(RI, h.x, h.y);
    out.push({ at: at(dir, 0.3), up: dir, n: 10, life: 7, rise: 2.6, tau: 3, r0: 0.5, r1: 2.1, drift: 1.4, shade: 1, spread: 1.4 * h.r, thin: 0.3, glow: 0, surge: false });
  }
  return out;
}

function flowGeometry(field: TerrainField, flows: readonly Flow[]): THREE.BufferGeometry {
  const pos: number[] = [], attr: number[] = [], idx: number[] = [], ACROSS = 14, S = surfaceOut(), p = vec();
  for (const f of flows) {
    const base = pos.length / 3, n = f.x.length;
    for (let i = 0; i < n; i++) {
      const a = Math.max(i - 1, 0), b = Math.min(i + 1, n - 1), tx = f.x[b] - f.x[a], ty = f.y[b] - f.y[a], tl = Math.hypot(tx, ty);
      const s = f.s[i], lobe = 1 + 0.16 * Math.sin(s * 0.7 + 1.3) + 0.08 * Math.sin(s * 2.3);
      const thick = 0.1 + 0.4 * THREE.MathUtils.smoothstep(s, 6, 14);
      for (let j = 0; j <= ACROSS; j++) {
        const w = (j / ACROSS) * 2 - 1, half = f.half[i] * lobe * (1 + 0.1 * Math.sin(s * 1.7 + w * 2));
        const x = f.x[i] - (ty / tl) * w * half, y = f.y[i] + (tx / tl) * w * half;
        const dir = chartDir(RI, x, y), g = field.surface(dir, -10, S).height;
        lift(dir, g + 0.05 + thick * Math.sqrt(Math.max(0, 1 - w * w)) * (g > -0.5 ? 1 : 0.3), p);
        pos.push(p.x, p.y, p.z);
        attr.push(s, w, f.half[i], s - f.entry);
      }
    }
    for (let i = 0; i + 1 < n; i++) {
      for (let j = 0; j < ACROSS; j++) {
        const a = base + i * (ACROSS + 1) + j, b = a + ACROSS + 1;
        idx.push(a, b, a + 1, a + 1, b, b + 1);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aFlow', new THREE.Float32BufferAttribute(attr, 4));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function hotGeometry(field: TerrainField): THREE.BufferGeometry {
  const geo = field.geo, pos: number[] = [], hot: number[] = [], idx: number[] = [], RINGS = 22, SECT = 64;
  const zone = (x: number, y: number): number => (geo.zones[cellOf(TERRITORY, chartDir(RI, x, y))] & ZONE.hot ? 1 : 0);
  for (const h of HOTS) {
    const base = pos.length / 3, reach = 1.4 * h.r + 2;
    for (let i = 0; i <= RINGS; i++) {
      for (let j = 0; j < SECT; j++) {
        const rr = (i / RINGS) * reach, a = (j / SECT) * TAU, x = h.x + rr * Math.cos(a), y = h.y + rr * Math.sin(a), d = chartDir(RI, x, y);
        let z = 0;
        for (let k = 0; k < 9; k++) z += zone(x + 0.9 * ((k % 3) - 1), y + 0.9 * (Math.floor(k / 3) - 1));
        pos.push(d.x * R, d.y * R, d.z * R);
        hot.push(i === RINGS ? 0 : z / 9);
      }
    }
    for (let i = 0; i < RINGS; i++) {
      for (let j = 0; j < SECT; j++) {
        const a = base + i * SECT + j, b = base + i * SECT + ((j + 1) % SECT);
        idx.push(a, a + SECT, b, b, a + SECT, b + SECT);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aHot', new THREE.Float32BufferAttribute(hot, 1));
  g.setIndex(idx);
  return g;
}

export function createFireArchipelago(ctx: RenderContext): RenderModule {
  const terrain = terrains.get(ctx.scene), sea = seas.get(ctx.scene), sky = skies.get(ctx.scene);
  if (!terrain || !sea || !sky) throw new Error('createFireArchipelago: the sea, sky and terrain are built first (MODULES order)');
  const fire = new FireArchipelago(ctx.pipeline.style, terrain.field, sea.swell, sky.lights);
  ctx.scene.add(fire.group);
  const wind = vec();
  return {
    frame(f) {
      const air = airOf(ctx.scene).update(ctx.world, f.state, ctx.camera.position);
      fire.update(ctx.camera.position, f.clock, calderaTime(f.state), eruption(f.state), wind.copy(air.toward).multiplyScalar(air.strength));
    },
    dispose() {
      ctx.scene.remove(fire.group);
      fire.dispose();
    },
  };
}

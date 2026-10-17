// The chart interface: the round papyrus HUD, the unrolling globe menu with its live planet render
// and pennant leaderboard, and the wordless loading screen. Everything is drawn, nothing is written:
// line art is inked once into canvases, papyrus and watercolour are shaded on the GPU.
import * as THREE from 'three';
import { R, HN, SHIPS, faceDir, wrapCell, v3, type V3 } from './sim.ts';
import type { World } from './world.ts';
import { TEAMS, teamColor, emblemAtlas } from './ships.ts';
import { COMMON_GLSL } from './sky.ts';
import { OWNER_GLSL } from './territory.ts';
import { LAYER, loadTexture } from './post.ts';
import papyrusUrl from './assets/papyrus_color.jpg';
import type { Ctx, Frame } from './main.ts';

// ---------------------------------------------------------------------------------------------
// Line art. Iron-gall ink and the portolan palette (black main winds, green half winds, red quarters).
const PEN = { ink: '#2a1a0f', red: '#a8392a', green: '#3d6840', blue: '#2d4b78', gold: '#bd8f38', cream: '#f1e4c2' };

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const ramp = (t: number, a: number, b: number) => clamp01((t - a) / (b - a));

/** Fleur-de-lis one unit tall, foot at the origin, pointing to -y. */
function fleur(g: CanvasRenderingContext2D): void {
  g.beginPath();
  g.moveTo(0, -1);
  g.bezierCurveTo(0.2, -0.8, 0.19, -0.5, 0.05, -0.3);
  g.lineTo(-0.05, -0.3);
  g.bezierCurveTo(-0.19, -0.5, -0.2, -0.8, 0, -1);
  for (const s of [1, -1]) {
    g.moveTo(0.06 * s, -0.33);
    g.bezierCurveTo(0.24 * s, -0.66, 0.56 * s, -0.6, 0.47 * s, -0.36);
    g.bezierCurveTo(0.42 * s, -0.24, 0.3 * s, -0.25, 0.33 * s, -0.34);
    g.bezierCurveTo(0.26 * s, -0.3, 0.16 * s, -0.27, 0.06 * s, -0.24);
    g.closePath();
  }
  g.rect(-0.25, -0.27, 0.5, 0.075);
  g.moveTo(0, -0.19);
  g.bezierCurveTo(0.1, -0.12, 0.17, -0.05, 0.13, 0);
  g.lineTo(-0.13, 0);
  g.bezierCurveTo(-0.17, -0.05, -0.1, -0.12, 0, -0.19);
}

function circle(g: CanvasRenderingContext2D, r: number, width: number, frac: number): void {
  if (frac <= 0) return;
  g.lineWidth = width;
  g.beginPath();
  g.arc(0, 0, r, -Math.PI / 2, -Math.PI / 2 + frac * Math.PI * 2);
  g.stroke();
}

/** Graduated compass ring between radii a and b at the origin: rules, ticks, a band of alternating bars. */
function drawRing(g: CanvasRenderingContext2D, a: number, b: number, u: number, t = 1): void {
  const s = (b - a) / 0.106; // ring proportions below are for a = 0.78, b = 0.886
  const at = (x: number) => a + (x - 0.78) * s;
  const arc = ramp(t, 0, 0.35), ticks = ramp(t, 0.1, 0.5);
  g.strokeStyle = g.fillStyle = PEN.ink;
  circle(g, at(0.78), 1.1 * u, arc);
  circle(g, at(0.792), 0.6 * u, arc);
  circle(g, at(0.828), 0.6 * u, arc);
  circle(g, at(0.835), 0.6 * u, arc);
  circle(g, at(0.865), 0.6 * u, arc);
  circle(g, at(0.877), 1.5 * u, arc);
  circle(g, at(0.886), 0.6 * u, arc);
  g.lineWidth = 0.55 * u;
  for (let k = 0; k < 128; k++) {
    if (k / 128 > ticks) break;
    const ang = (k / 128) * Math.PI * 2 - Math.PI / 2, c = Math.cos(ang), sn = Math.sin(ang);
    const len = k % 16 === 0 ? 0.828 : k % 4 === 0 ? 0.816 : 0.803;
    g.beginPath();
    g.moveTo(c * at(0.792), sn * at(0.792));
    g.lineTo(c * at(len), sn * at(len));
    g.stroke();
  }
  for (let k = 0; k < 64; k += 2) {
    if (k / 64 > ticks) break;
    const a0 = (k / 64) * Math.PI * 2 - Math.PI / 2, a1 = a0 + Math.PI / 32;
    g.beginPath();
    g.arc(0, 0, at(0.865), a0, a1);
    g.arc(0, 0, at(0.835), a1, a0, true);
    g.fill();
  }
}

/** A 32-point compass rose of radius r at the origin, north up, its ring `ring`·r wide; `t` (0..1) inks it in. */
function drawRose(g: CanvasRenderingContext2D, r: number, u: number, t = 1, ring = 0.12): void {
  drawRing(g, r * (1 - ring), r, u, t);
  // drawn smallest first so the main winds lie on top
  const kinds = [
    { first: 1, every: 2, len: 0.4, w: 0.05, dark: PEN.red, from: 0.32 },
    { first: 2, every: 4, len: 0.52, w: 0.065, dark: PEN.green, from: 0.44 },
    { first: 4, every: 8, len: 0.68, w: 0.085, dark: PEN.blue, from: 0.56 },
    { first: 0, every: 8, len: 0.86, w: 0.1, dark: PEN.ink, from: 0.68 },
  ];
  g.lineJoin = 'round';
  for (const kd of kinds) {
    const n = 32 / kd.every;
    for (let i = 0; i < n; i++) {
      const k = kd.first + i * kd.every;
      const alpha = ramp(t, kd.from + (i / n) * 0.12, kd.from + (i / n) * 0.12 + 0.05);
      if (alpha <= 0) continue;
      const ang = (k / 32) * Math.PI * 2 - Math.PI / 2, c = Math.cos(ang), s = Math.sin(ang);
      const tip = [c * kd.len * r, s * kd.len * r], w = kd.w * r;
      const left = [-s * w, c * w], right = [s * w, -c * w];
      g.globalAlpha = alpha;
      g.fillStyle = kd.dark;
      g.beginPath();
      g.moveTo(tip[0], tip[1]);
      g.lineTo(left[0], left[1]);
      g.lineTo(0, 0);
      g.fill();
      g.fillStyle = PEN.cream;
      g.beginPath();
      g.moveTo(tip[0], tip[1]);
      g.lineTo(right[0], right[1]);
      g.lineTo(0, 0);
      g.fill();
      g.strokeStyle = PEN.ink;
      g.lineWidth = 0.7 * u;
      g.beginPath();
      g.moveTo(tip[0], tip[1]);
      g.lineTo(left[0], left[1]);
      g.lineTo(0, 0);
      g.lineTo(right[0], right[1]);
      g.closePath();
      g.moveTo(0, 0);
      g.lineTo(tip[0], tip[1]);
      g.stroke();
    }
  }
  const end = ramp(t, 0.86, 1);
  g.globalAlpha = end;
  if (end > 0) {
    g.save();
    g.translate(0, -r * 0.83);
    g.scale(r * 0.24, r * 0.24);
    fleur(g);
    g.restore();
    g.fillStyle = PEN.gold;
    g.fill();
    g.strokeStyle = PEN.ink;
    g.lineWidth = 0.7 * u;
    g.stroke();
    g.beginPath();
    g.arc(0, 0, r * 0.045, 0, Math.PI * 2);
    g.fillStyle = PEN.gold;
    g.fill();
    g.stroke();
  }
  g.globalAlpha = 1;
}

/** The HUD's compass card: graduated ring, north fleur and wind marks, on a transparent square canvas. */
function hudCardArt(size: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!, r = size / 2, u = size / 512;
  g.translate(r, r);
  drawRing(g, r * 0.78, r * 0.886, u * 1.3);
  // wind marks on the bar band: fleur at north, lozenges at the other seven winds
  for (let k = 1; k < 8; k++) {
    g.save();
    g.rotate((k / 8) * Math.PI * 2);
    g.beginPath();
    g.moveTo(0, -r * 0.888);
    g.lineTo(r * 0.018, -r * 0.85);
    g.lineTo(0, -r * 0.812);
    g.lineTo(-r * 0.018, -r * 0.85);
    g.closePath();
    g.fillStyle = k % 2 ? PEN.green : PEN.red;
    g.fill();
    g.strokeStyle = PEN.ink;
    g.lineWidth = u;
    g.stroke();
    g.restore();
  }
  g.save();
  g.translate(0, -r * 0.79);
  g.scale(r * 0.13, r * 0.13);
  fleur(g);
  g.restore();
  g.fillStyle = PEN.red;
  g.fill();
  g.strokeStyle = PEN.ink;
  g.lineWidth = u * 1.2;
  g.stroke();
  return c;
}

/**
 * Portolan rhumb-line web: sixteen wind nodes on a ring round (cx, cy) plus the centre, each radiating
 * the 32 winds out to `reach`. `t` (0..1) draws the lines outward from their nodes, centre first.
 */
function drawRhumbs(
  g: CanvasRenderingContext2D, cx: number, cy: number, ring: number, reach: number, u: number, t = 1,
): void {
  const paths = [new Path2D(), new Path2D(), new Path2D()];
  for (let n = 0; n <= 16; n++) {
    const a = (n / 16) * Math.PI * 2, k = n < 16 ? ring : 0, x = cx + Math.cos(a) * k, y = cy + Math.sin(a) * k;
    const len = reach * ramp(t, n < 16 ? 0.15 + n * 0.025 : 0, n < 16 ? 0.6 + n * 0.025 : 0.45);
    for (let k = 0; k < 32 && len > 0; k++) {
      const b = (k / 32) * Math.PI * 2;
      const path = paths[k % 4 === 0 ? 0 : k % 2 === 0 ? 1 : 2];
      path.moveTo(x, y);
      path.lineTo(x + Math.cos(b) * len, y + Math.sin(b) * len);
    }
  }
  g.lineWidth = 0.6 * u;
  g.globalAlpha = 0.45;
  [PEN.ink, PEN.green, PEN.red].forEach((c, i) => {
    g.strokeStyle = c;
    g.stroke(paths[i]);
  });
  g.globalAlpha = 1;
}

/** A sail bellied by a following wind: yard from (x0, top) to (x1, top), foot at `foot`, leeches bulging by b. */
function sail(g: CanvasRenderingContext2D, x0: number, x1: number, top: number, foot: number, b: number): void {
  g.beginPath();
  g.moveTo(x0, top);
  g.lineTo(x1, top);
  g.quadraticCurveTo(x1 + b, (top + foot) / 2, x1 + b * 0.6, foot);
  g.quadraticCurveTo((x0 + x1) / 2 + b * 1.4, foot + (foot - top) * 0.12, x0 + b * 0.6, foot);
  g.quadraticCurveTo(x0 + b, (top + foot) / 2, x0, top);
}

/** An engraved galleon in profile sailing right; waterline at the origin, about 2.4·s long. */
function drawGalleon(g: CanvasRenderingContext2D, s: number, u: number): void {
  g.save();
  g.scale(s, s);
  const lw = u / s;
  g.lineJoin = g.lineCap = 'round';
  g.strokeStyle = PEN.ink;
  // rigging first so hull and sails cover its ends
  g.lineWidth = 0.5 * lw;
  g.beginPath();
  for (const [x0, y0, x1, y1] of [[0.56, -1.86, 1.42, -0.8], [0.04, -2.12, 0.56, -1.3], [-0.55, -1.6, 0.04, -1.2],
    [0.04, -2.12, -0.98, -0.62], [0.56, -1.86, 0.36, -0.42], [0.04, -2.12, -0.2, -0.38], [-0.55, -1.6, -0.82, -0.52]]) {
    g.moveTo(x0, y0);
    g.lineTo(x1, y1);
  }
  g.stroke();
  // masts and bowsprit
  g.lineWidth = 1.6 * lw;
  g.beginPath();
  for (const [x, y0, y1] of [[0.56, -0.44, -1.9], [0.04, -0.36, -2.18], [-0.55, -0.5, -1.64]]) {
    g.moveTo(x, y0);
    g.lineTo(x, y1);
  }
  g.moveTo(0.88, -0.4);
  g.lineTo(1.46, -0.78);
  g.stroke();
  // hull: high stern castle, low waist, forecastle and beakhead
  const hull = new Path2D();
  hull.moveTo(-1.02, -0.64);
  hull.bezierCurveTo(-1.04, -0.4, -0.98, -0.12, -0.86, 0.02);
  hull.bezierCurveTo(-0.6, 0.15, 0.45, 0.15, 0.72, 0.03);
  hull.bezierCurveTo(0.84, -0.03, 0.9, -0.16, 0.92, -0.3);
  hull.lineTo(1.2, -0.37);
  hull.lineTo(1.13, -0.42);
  hull.lineTo(0.88, -0.43);
  hull.lineTo(0.86, -0.48);
  hull.lineTo(0.46, -0.46);
  hull.lineTo(0.42, -0.37);
  hull.lineTo(-0.18, -0.37);
  hull.lineTo(-0.22, -0.48);
  hull.lineTo(-0.62, -0.52);
  hull.lineTo(-0.66, -0.58);
  hull.closePath();
  g.fillStyle = PEN.cream;
  g.fill(hull);
  g.fillStyle = '#8a6038';
  g.globalAlpha = 0.5;
  g.fill(hull);
  g.globalAlpha = 1;
  g.save();
  g.clip(hull);
  g.lineWidth = 0.45 * lw;
  g.beginPath();
  for (let y = -0.62; y < 0.15; y += 0.045) {
    g.moveTo(-1.1, y);
    g.bezierCurveTo(-0.4, y + 0.06, 0.4, y + 0.06, 1.2, y - 0.04);
  }
  g.stroke();
  g.lineWidth = 1.3 * lw;
  g.beginPath();
  for (const y of [-0.3, -0.16]) {
    g.moveTo(-1.1, y);
    g.bezierCurveTo(-0.4, y + 0.07, 0.4, y + 0.07, 1.2, y - 0.05);
  }
  g.stroke();
  g.fillStyle = PEN.ink;
  for (let x = -0.78; x < 0.7; x += 0.17) g.fillRect(x, -0.27 + Math.abs(x) * 0.02, 0.06, 0.06);
  g.restore();
  g.lineWidth = 1.1 * lw;
  g.stroke(hull);
  // sails: courses and topsails on fore and main, a lateen on the mizzen, a spritsail under the bowsprit
  const sails: [number, number, number, number][] = [
    [0.3, 0.84, -0.78, -0.5], [0.34, 0.78, -1.32, -0.86], [0.38, 0.72, -1.76, -1.4],
    [-0.36, 0.46, -0.88, -0.48], [-0.3, 0.38, -1.48, -0.96], [-0.2, 0.28, -1.98, -1.56], [1.08, 1.4, -0.62, -0.36],
  ];
  for (const [x0, x1, top, foot] of sails) {
    sail(g, x0, x1, top, foot, 0.07);
    g.fillStyle = PEN.cream;
    g.fill();
    g.save();
    g.clip();
    g.lineWidth = 0.3 * lw;
    g.beginPath();
    for (let x = x0 + (x1 - x0) * 0.7; x < x1 + 0.1; x += 0.045) {
      g.moveTo(x, top);
      g.quadraticCurveTo(x + 0.07, (top + foot) / 2, x + 0.04, foot);
    }
    g.stroke();
    g.restore();
    g.lineWidth = 0.8 * lw;
    g.stroke();
  }
  g.beginPath();
  g.moveTo(-1.0, -0.66);
  g.lineTo(-0.32, -1.5);
  g.quadraticCurveTo(-0.42, -0.9, -0.5, -0.58);
  g.closePath();
  g.fillStyle = PEN.cream;
  g.fill();
  g.lineWidth = 0.8 * lw;
  g.stroke();
  // streaming pennants
  g.fillStyle = PEN.red;
  for (const [x, y, l] of [[0.56, -1.9, 0.5], [0.04, -2.18, 0.7], [-0.55, -1.64, 0.4]]) {
    g.beginPath();
    g.moveTo(x, y);
    g.bezierCurveTo(x - l * 0.3, y - 0.06, x - l * 0.6, y + 0.06, x - l, y + 0.01);
    g.bezierCurveTo(x - l * 0.6, y + 0.1, x - l * 0.3, y + 0.02, x, y + 0.07);
    g.closePath();
    g.fill();
    g.lineWidth = 0.5 * lw;
    g.stroke();
  }
  // the sea she rides
  g.lineWidth = 0.7 * lw;
  g.beginPath();
  for (let i = 0; i < 9; i++) {
    const x = -1.5 + i * 0.36, y = 0.08 + (i % 2) * 0.1;
    g.moveTo(x, y);
    g.quadraticCurveTo(x + 0.12, y - 0.1, x + 0.24, y);
    g.quadraticCurveTo(x + 0.3, y + 0.04, x + 0.36, y - 0.02);
  }
  g.stroke();
  g.restore();
}

/** Sea texture: a small engraver's wave, two crests drawn with one stroke. */
function wavelet(g: CanvasRenderingContext2D, x: number, y: number, w: number): void {
  g.moveTo(x, y);
  g.quadraticCurveTo(x + w * 0.25, y - w * 0.3, x + w * 0.5, y);
  g.quadraticCurveTo(x + w * 0.75, y - w * 0.3, x + w, y);
}

// ---------------------------------------------------------------------------------------------
// GPU materials shared by the HUD and the menu.

/** sRGB hex → linear RGB, for pigments. */
const TEAM = TEAMS.map((_, i) => teamColor(i));

const PAPER_GLSL = /* glsl */ `
${COMMON_GLSL}
const vec3 INK = vec3(0.022, 0.011, 0.005);
vec3 toSRGB(vec3 c) {
  c = max(c, 0.0);
  return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
}
uniform sampler2D tPapyrus;
// Aged papyrus at q (CSS px): rgb linear colour, a fibre density (0..1) for lighting and pigment uptake.
// The photograph is backlit, so its brightness reads as thinness: dense crossings and flecks are dark.
vec4 papyrus(vec2 q) {
  vec3 ph = texture2D(tPapyrus, q / 820.0).rgb;
  float dens = clamp(1.0 - sqrt(dot(ph, vec3(0.3, 0.55, 0.15))) * 1.05, 0.0, 1.0);
  float stain = fbm(vec3(q * 0.003, 4.0)) - 0.5;
  float fox = smoothstep(0.72, 0.8, vnoise(vec3(q * 0.045, 7.0))) * 0.35;
  float d = 0.85 * dens + 0.6 * smoothstep(0.45, 0.8, dens) + stain * 0.7 + fox;
  return vec4(mix(vec3(0.78, 0.63, 0.38), vec3(0.42, 0.28, 0.12), clamp(0.15 + d * 0.5, 0.0, 1.0)), dens);
}
// Watercolour pigment over paper: transmittance raised to the deposited density (Beer-Lambert).
vec3 wash(vec3 under, vec3 pigment, float density) { return under * pow(max(pigment, 0.002), vec3(density)); }
// Anti-aliased ink line of width w (device px) around the zero of a field whose screen slope is fw.
float inkLine(float d, float fw, float w) {
  return 1.0 - smoothstep(w * 0.5 - 0.6, w * 0.5 + 0.6, abs(d) / max(fw, 1e-6));
}
`;

/** Height at a unit direction from heightAtlas() (needs OWNER_GLSL's face mapping and an HN define). */
const HEIGHT_GLSL = /* glsl */ `
float heightAt(vec3 p) {
  int f = terrFace(p);
  vec2 uv = terrUV(p * terrBasis(f));
  vec2 t = vec2((uv.x + 1.0) * 0.5 * HN + 1.0, float(f) * (HN + 2.0) + (uv.y + 1.0) * 0.5 * HN + 1.0);
  return texture2D(tHeight, t / vec2(HN + 2.0, 6.0 * (HN + 2.0))).r;
}
`;

/**
 * World heights as a half-float atlas of the six cube faces, each with a one-cell border copied from
 * its neighbours so bilinear filtering is seamless across face edges.
 */
function heightAtlas(world: World): THREE.DataTexture {
  const S = HN + 2, data = new Uint16Array(S * S * 6);
  for (let f = 0; f < 6; f++) {
    for (let j = -1; j <= HN; j++) {
      for (let i = -1; i <= HN; i++) {
        const inside = i >= 0 && j >= 0 && i < HN && j < HN;
        const c = inside ? (f * HN + j) * HN + i : wrapCell(f, i, j, HN);
        data[(f * S + j + 1) * S + i + 1] = THREE.DataUtils.toHalfFloat(world.heights[c]);
      }
    }
  }
  const t = new THREE.DataTexture(data, S, S * 6, THREE.RedFormat, THREE.HalfFloatType);
  t.magFilter = t.minFilter = THREE.LinearFilter;
  t.needsUpdate = true;
  return t;
}

function overlayMaterial(o: THREE.ShaderMaterialParameters): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    transparent: true, depthTest: false, depthWrite: false, toneMapped: false, side: THREE.DoubleSide, ...o,
  });
}

/** Send only the first `count` items of a dynamic attribute to the GPU this frame. */
function upload(a: THREE.BufferAttribute, count: number): void {
  a.clearUpdateRanges();
  a.addUpdateRange(0, count * a.itemSize);
  a.needsUpdate = true;
}

/** A per-ship instance attribute of n floats, rewritten every frame. */
function perShip(n: number): THREE.InstancedBufferAttribute {
  return new THREE.InstancedBufferAttribute(new Float32Array(SHIPS * n), n).setUsage(THREE.DynamicDrawUsage);
}

function overlayMesh(geometry: THREE.BufferGeometry, material: THREE.Material, order: number): THREE.Mesh {
  const m = new THREE.Mesh(geometry, material);
  m.frustumCulled = false;
  m.renderOrder = order;
  return m;
}

const bakeQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
bakeQuad.frustumCulled = false;
const bakeScene = new THREE.Scene().add(bakeQuad), bakeCam = new THREE.Camera();
/** Render a full-target pass of `material` into `target` (a one-off bake); `compileOnly` just builds its program. */
function bakeInto(
  r: THREE.WebGLRenderer, material: THREE.Material, target: THREE.WebGLRenderTarget, compileOnly = false,
): void {
  bakeQuad.material = material;
  r.setRenderTarget(target);
  if (compileOnly) r.compile(bakeScene, bakeCam);
  else r.render(bakeScene, bakeCam);
  r.setRenderTarget(null);
}

/** Where the HUD disc sits, in CSS px. Shared with the loader, whose rose lands on it. */
export function hudLayout(w: number, h: number) {
  const r = Math.min(150, Math.max(92, Math.min(w, h) * 0.13));
  const m = Math.max(16, r * 0.16);
  return { x: w - m - r, y: m + r, r };
}

// ---------------------------------------------------------------------------------------------
// HUD: a round papyrus chart fragment centred on the player's ship, heading up.

const VIEW = 95; // world units from the HUD centre to the edge of the map window
const WIN = 0.78; // map window radius as a fraction of the paper disc
const MAX_TRAIL_POINTS = 8192;
const HUD_QUAD = 1.15; // the disc's quad reaches past the paper for its drop shadow

const HUD_VERT = /* glsl */ `
uniform vec3 uDisc; // centre x, y and radius, CSS px
varying vec2 vLocal;
void main() {
  vLocal = position.xy;
  gl_Position = projectionMatrix * vec4(uDisc.xy + vec2(position.x, -position.y) * uDisc.z, 0.0, 1.0);
}
`;

// The HUD's paper does not move on screen: papyrus, frayed rim, light and drop shadow are baked once per size.
const HUD_PAPER_FRAG = /* glsl */ `
uniform float uRadius; // CSS px
uniform float uDpr;
varying vec2 vUv;
${PAPER_GLSL}
void main() {
  vec2 l = (vUv * 2.0 - 1.0) * ${HUD_QUAD}; // disc units, y up
  float r = length(l), px = 1.0 / (uRadius * uDpr);
  vec2 q = l * uRadius, ring = l / max(r, 1e-4);
  // frayed, darkened rim with fibre ends poking out along both strip directions
  float rim = 0.952 + 0.035 * (fbm(vec3(ring * 2.0, 1.3)) - 0.5) + 0.012 * (vnoise(vec3(ring * 24.0, 4.0)) - 0.5)
    + 0.005 * (vnoise(vec3(ring * 90.0, 2.0)) - 0.5);
  rim += 0.035 * (pow(vnoise(vec3(q.x * 1.2, q.y * 0.04, 8.0)), 14.0)
    + pow(vnoise(vec3(q.x * 0.04, q.y * 1.2, 3.0)), 14.0));
  float paperA = smoothstep(rim + px * 1.2, rim - px * 1.2, r);
  vec4 pap = papyrus(q + vec2(311.0, 97.0));
  float burn = smoothstep(rim - 0.12 - 0.08 * vnoise(vec3(ring * 5.0, 9.0)), rim, r);
  vec3 col = pap.rgb * mix(vec3(1.0), vec3(0.5, 0.33, 0.18), burn * burn * 0.85);
  // lit softly from the upper left: fibre relief catches the light, the sheet curls a little
  vec2 rel = vec2(dFdx(pap.a), dFdy(pap.a));
  col *= 1.0 + clamp(dot(rel, vec2(-1.0, 1.0)) * 2.0, -0.15, 0.15);
  col *= 1.05 - 0.12 * dot(l, vec2(0.45, -0.55));
  // soft drop shadow on the world beneath the frayed edge
  float shadowA = 0.5 * (1.0 - smoothstep(0.82, 1.14, length(l - vec2(0.03, -0.05))));
  float a = paperA + shadowA * (1.0 - paperA);
  gl_FragColor = vec4(col * paperA / max(a, 1e-4), a);
}
`;

const HUD_FRAG = /* glsl */ `
#define HN ${HN}.0
uniform sampler2D tHeight, tOwner, tCard, tPaper;
uniform vec3 uTeam[${SHIPS}];
uniform vec3 uUp, uFwd, uStar;
uniform vec3 uDisc;
uniform float uNorth, uFade, uNight, uDpr;
varying vec2 vLocal;
${PAPER_GLSL}
${OWNER_GLSL}
${HEIGHT_GLSL}
vec3 dirAt(vec2 l) {
  vec2 m = l / ${WIN};
  float r = length(m), th = r * ${VIEW}.0 / ${R}.0;
  vec2 d = m / max(r, 1e-6);
  return cos(th) * uUp + sin(th) * (d.x * uStar + d.y * uFwd);
}
vec2 rot(vec2 v, float a) { float c = cos(a), s = sin(a); return vec2(c * v.x - s * v.y, s * v.x + c * v.y); }

void main() {
  float r = length(vLocal), px = 1.0 / (uDisc.z * uDpr); // disc units per device pixel
  vec2 q = vLocal * uDisc.z; // paper position, CSS px, fixed to the screen
  vec4 base = texture2D(tPaper, vLocal / (2.0 * ${HUD_QUAD}) + 0.5);
  vec3 col = base.rgb;
  float fib = 1.0 - clamp(dot(col, vec3(0.3, 0.55, 0.15)) * 1.8, 0.0, 1.0); // darker paper is denser fibre
  if (r < ${WIN} + px) {
    vec3 p = dirAt(vLocal);
    // height and its slope per device pixel from central differences, smooth across pixel quads
    float h = heightAt(p);
    vec2 g = vec2(heightAt(dirAt(vLocal + vec2(px, 0.0))) - heightAt(dirAt(vLocal - vec2(px, 0.0))),
      heightAt(dirAt(vLocal + vec2(0.0, px))) - heightAt(dirAt(vLocal - vec2(0.0, px)))) * 0.5;
    float hw = max(length(g), 1e-5);
    float land = smoothstep(-hw, hw, h);
    // sea: faint wash everywhere, turquoise over the shelves and lagoons
    col = wash(col, vec3(0.5, 0.68, 0.7), 0.08);
    col = wash(col, vec3(0.38, 0.76, 0.8), smoothstep(-11.0, -1.0, h) * 0.55 * (1.0 - land));
    // rhumb lines of the compass card, radiating from the ship in the 32 winds
    float wa = atan(vLocal.x, vLocal.y) - uNorth;
    float k = floor(wa / 0.19635 + 0.5);
    float dl = abs(sin(wa - k * 0.19635)) * r / px;
    int kk = int(mod(k, 32.0));
    vec3 rhumb = kk % 4 == 0 ? INK : kk % 2 == 0 ? vec3(0.05, 0.16, 0.06) : vec3(0.4, 0.05, 0.03);
    col = mix(col, rhumb, (1.0 - smoothstep(0.4, 1.3, dl)) * 0.32 * smoothstep(0.08, 0.2, r) * (1.0 - land));

    // territory: watercolour washes with soft blooms and granulation, pigment pooled where they dried
    // at their edges, feathering out along the fibres
    vec2 warp = (vec2(vnoise(p * 9.0), vnoise(p * 9.0 + 9.0)) - 0.5) * 0.035;
    warp += (vec2(vnoise(vec3(q.x * 0.9, q.y * 0.05, 2.0)), vnoise(vec3(q.x * 0.05, q.y * 0.9, 5.0))) - 0.5) * 0.012;
    vec2 at = vLocal + warp;
    int id0 = terrOwnerAt(tOwner, dirAt(at));
    float cover = 0.0, same = 0.0, nbn = 0.0;
    vec3 nb = vec3(0.0);
    for (int i = 0; i < 4; i++) {
      vec2 o = vec2(i % 2 == 0 ? -0.5 : 0.5, i < 2 ? -0.5 : 0.5) * px;
      cover += terrOwnerAt(tOwner, dirAt(at + o)) == id0 ? 0.25 : 0.0;
    }
    for (int i = 0; i < 8; i++) {
      float a = float(i) * 0.7854 + 0.4;
      int id = terrOwnerAt(tOwner, dirAt(at + 0.034 * vec2(cos(a), sin(a))));
      same += id == id0 ? 1.0 : 0.0;
      if (id > 0) { nb += uTeam[id - 1]; nbn += 1.0; }
    }
    float gran = (0.78 + 0.45 * vnoise(p * 1400.0)) * (0.75 + 0.5 * fib) * (0.65 + 0.7 * vnoise(p * 40.0));
    float fibre = smoothstep(0.45, 0.85,
      vnoise(vec3(q.x * 1.3, q.y * 0.05, 1.0)) * 0.6 + vnoise(vec3(q.x * 0.05, q.y * 1.3, 2.0)) * 0.6);
    if (id0 > 0) {
      float edge = pow(1.0 - same / 8.0, 1.4);
      col = mix(col, wash(col, uTeam[id0 - 1], (0.42 + 2.2 * edge) * gran), cover);
    }
    if (nbn > 0.0 && (id0 == 0 || cover < 1.0)) {
      col = wash(col, nb / nbn, (0.08 + 0.3 * fibre) * nbn / 8.0 * gran * (id0 == 0 ? 1.0 : 1.0 - cover));
    }

    // isobaths: two fine contours stepping out from the coast, fading where the shelf is too steep for them
    float iso = inkLine(h + 2.5, hw, 0.8 * uDpr) * 0.4 + inkLine(h + 8.0, hw, 0.7 * uDpr) * 0.22;
    iso *= smoothstep(1.2, 0.4, hw * uDpr);
    col = mix(col, INK, iso * (1.0 - land));
    // reef and shoal stipple, anchored to the world
    vec3 sp = p * ${R}.0 / 2.6;
    float dotP = hash13(floor(sp)) < smoothstep(-5.0, -0.8, h) * 0.6 ? 1.0 : 0.0;
    float dd = length(fract(sp) - 0.5), dw = fwidth(dd);
    col = mix(col, INK, dotP * (1.0 - smoothstep(0.16 - dw, 0.16 + dw, dd)) * 0.75 * (1.0 - land));

    // land: ochre and sap-green washes, engraved hatching on the slopes turned from the light
    float hi = smoothstep(1.5, 14.0, h);
    vec3 green = mix(vec3(0.36, 0.5, 0.2), vec3(0.45, 0.47, 0.5), smoothstep(0.55, 0.85, abs(p.y)));
    vec3 earth = mix(vec3(0.78, 0.55, 0.22), green, hi);
    col = mix(col, wash(col, earth, 0.8 * gran), land);
    float shade = clamp(dot(g / hw, normalize(vec2(-1.0, 1.0))) * 0.8 + hi * 0.35, 0.0, 1.0);
    float hs = dot(p, normalize(vec3(0.6, 0.35, -0.72))) * ${R}.0 / 3.0, hsw = fwidth(hs);
    float hatch = 1.0 - smoothstep(0.1 - hsw, 0.1 + hsw, abs(fract(hs) - 0.5));
    col = mix(col, INK, hatch * shade * land * 0.55);
    // coastline: a firm ink line with a soft bleed
    col = mix(col, INK, inkLine(h, hw, 1.7 * uDpr) * 0.92);
    col = mix(col, INK, inkLine(h, hw, 5.0 * uDpr) * 0.12);

    // window edge: the map is drawn inside the card's inner rule
    col = mix(base.rgb, col, smoothstep(${WIN} + px, ${WIN} - px, r));
  }

  // compass card turns with north
  vec4 card = texture2D(tCard, rot(vLocal, uNorth) * 0.5 + 0.5);
  col = mix(col, col * card.rgb * card.rgb, card.a);

  // lubber mark: a gilt pointer fixed at the top of the ring, showing the ship's heading
  vec2 lp = vLocal - vec2(0.0, 0.84);
  float tri = max(abs(lp.x) * 1.9 + lp.y * 0.9 - 0.045, abs(lp.y) - 0.05);
  vec3 gilt = mix(vec3(0.95, 0.68, 0.24), vec3(0.42, 0.24, 0.06), smoothstep(-0.05, 0.05, lp.y + lp.x * 0.6));
  col = mix(col, gilt, smoothstep(px, -px, tri));
  col = mix(col, INK, (1.0 - smoothstep(0.3, 1.0, abs(tri) / px - 0.5)) * 0.9);

  col *= mix(vec3(1.0), vec3(0.8, 0.7, 0.58), uNight * 0.7);
  gl_FragColor = vec4(toSRGB(col), base.a * uFade);
}
`;

const TRAIL_FRAG = /* glsl */ `
uniform vec3 uDisc;
uniform float uFade;
varying vec3 vColor;
varying float vSide, vAlong;
varying vec2 vScreen;
void main() {
  float aa = fwidth(vSide) * 1.2;
  float cover = 1.0 - smoothstep(1.0 - aa, 1.0, abs(vSide));
  float clip = smoothstep(${WIN}, ${WIN} - 0.02, length(vScreen - uDisc.xy) / uDisc.z);
  float dens = 0.9 + 0.9 * smoothstep(0.35, 1.0, abs(vSide));
  vec3 t = pow(vColor, vec3(dens));
  float dash = step(0.45, fract(vAlong / 7.0)) * (1.0 - smoothstep(0.18, 0.3 + aa, abs(vSide)));
  t = mix(t, vec3(0.03, 0.02, 0.01), dash * 0.85);
  gl_FragColor = vec4(mix(vec3(1.0), t, cover * clip * uFade), 1.0);
}
`;

const TRAIL_VERT = /* glsl */ `
attribute vec3 aColor;
attribute vec2 aSideAlong;
varying vec3 vColor;
varying float vSide, vAlong;
varying vec2 vScreen;
void main() {
  vColor = aColor;
  vSide = aSideAlong.x;
  vAlong = aSideAlong.y;
  vScreen = position.xy;
  gl_Position = projectionMatrix * vec4(position.xy, 0.0, 1.0);
}
`;

// Ship marks in the manner of old sea charts: a little ship drawn in profile, upright on the chart and
// facing the way she sails, hull washed in her colour, sails in cream, a pennant at the main truck, a
// curl of sea at bow and stern, and a short wake stroke along her true heading where her trail joins.
const MARK_VERT = /* glsl */ `
attribute vec2 aPos, aDir;
attribute vec3 aColor;
attribute vec2 aSizeAlpha;
attribute vec2 aFlags; // player, facing (+1 right, -1 left)
varying vec2 vG, vDir;
varying vec3 vColor;
varying float vAlpha, vPlayer;
void main() {
  vG = vec2(position.x * aFlags.y, position.y);
  vDir = vec2(aDir.x * aFlags.y, aDir.y);
  vColor = aColor;
  vAlpha = aSizeAlpha.y;
  vPlayer = aFlags.x;
  vec2 local = position.xy * aSizeAlpha.x;
  gl_Position = projectionMatrix * vec4(aPos + vec2(local.x, -local.y), 0.0, 1.0);
}
`;

const MARK_FRAG = /* glsl */ `
uniform float uFade;
varying vec2 vG, vDir;
varying vec3 vColor;
varying float vAlpha, vPlayer;
float seg(vec2 p, vec2 a, vec2 b) {
  vec2 pa = p - a, ba = b - a;
  return length(pa - ba * clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0));
}
float box(vec2 p, vec2 b) { vec2 d = abs(p) - b; return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0); }
// a square sail on mast x between heights y0 and y1, bellied forward
float sail(vec2 p, float x, float y0, float y1, float hw) {
  float k = clamp((p.y - y0) / (y1 - y0), 0.0, 1.0);
  return box(vec2(p.x - x - 0.07 * sin(3.1416 * k), p.y - (y0 + y1) * 0.5), vec2(hw, (y1 - y0) * 0.5));
}
void main() {
  vec2 p = vG; // the ship faces +x here
  float fw = fwidth(p.y), x = p.x;
  // hull: round bilge, raked stem, high stern castle and a lower forecastle
  float deck = 0.07 + 0.07 * x * x + 0.2 * smoothstep(-0.48, -0.66, x) + 0.06 * smoothstep(0.5, 0.64, x);
  float hull = max(max(1.5 - sqrt(max(3.4 - x * x, 0.0)) - p.y, p.y - deck), max(x - 1.02 - 0.35 * p.y, -0.92 - x));
  float masts = min(min(seg(p, vec2(0.42, 0.0), vec2(0.42, 0.92)), seg(p, vec2(0.0, 0.0), vec2(0.0, 1.22))),
    seg(p, vec2(-0.5, 0.2), vec2(-0.5, 0.92)));
  float sails = min(min(sail(p, 0.42, 0.6, 0.86, 0.16), sail(p, 0.42, 0.27, 0.55, 0.21)),
    min(min(sail(p, 0.0, 0.7, 1.06, 0.2), sail(p, 0.0, 0.29, 0.64, 0.27)), sail(p, -0.5, 0.36, 0.72, 0.15)));
  float u = -p.x / 0.4;
  float pennant = max(abs(p.y - 1.17 + 0.04 * u) - 0.065 * (1.0 - u), max(-u, u - 1.0) * 0.4);
  float wave = abs(p.y + 0.1 - 0.035 * sin(p.x * 11.0)) + max(0.0, 0.98 - abs(p.x + 0.04)) * 4.0;
  wave = max(wave, abs(p.x + 0.04) - 1.4);
  // the wake runs aft along the true heading, tapering, from under the hull where the trail arrives
  vec2 a = vec2(0.0, -0.18);
  float along = clamp(dot(p - a, -vDir) / 1.35, 0.0, 1.0);
  float wake = seg(p, a, a - vDir * 1.35) - 0.07 * (1.0 - along);
  float line = fw * 0.35;
  float ink = max(1.0 - smoothstep(0.0, fw, abs(hull) - line), 1.0 - smoothstep(0.0, fw, masts - line));
  ink = max(ink, 1.0 - smoothstep(0.0, fw, abs(sails) - line * 0.8));
  ink = max(ink, (1.0 - smoothstep(0.0, fw, abs(pennant) - line * 0.7)) * step(-0.05, u));
  ink = max(ink, (1.0 - smoothstep(0.0, fw, wave - line)) * 0.7);
  ink = max(ink, (1.0 - smoothstep(0.0, fw, wake)) * (1.0 - along) * 0.55);
#ifdef GOUACHE
  // second pass: sail cloth and the pennant painted over the wash; on the player's ship a gilt rim
  float cloth = smoothstep(fw, -fw, sails) * (1.0 - ink);
  float flag = smoothstep(fw, -fw, pennant) * step(0.0, u) * (1.0 - ink);
  float gilt = vPlayer * (1.0 - smoothstep(0.0, fw, abs(hull + 0.05) - fw * 0.6));
  vec3 c = vec3(0.95, 0.9, 0.78) * (0.82 + 0.18 * smoothstep(-0.1, 0.15, p.x - floor(p.x * 2.4 + 0.5) / 2.4));
  c = mix(c, vColor, flag);
  c = mix(c, vec3(0.93, 0.66, 0.2), gilt);
  gl_FragColor = vec4(toSRGB(c), max(max(cloth, flag), gilt) * vAlpha * uFade);
#else
  float fill = smoothstep(fw, -fw, hull);
  vec3 t = mix(vec3(1.0), pow(vColor, vec3(0.9)), fill);
  t = mix(t, vec3(0.03, 0.02, 0.01), ink);
  gl_FragColor = vec4(mix(vec3(1.0), t, vAlpha * uFade), 1.0);
#endif
}
`;

class Hud {
  readonly root = new THREE.Group();
  private readonly ctx: Ctx;
  private readonly disc: THREE.ShaderMaterial;
  private readonly trailGeo = new THREE.BufferGeometry();
  private readonly trailPos = new Float32Array(MAX_TRAIL_POINTS * 2 * 3);
  private readonly trailCol = new Float32Array(MAX_TRAIL_POINTS * 2 * 3);
  private readonly trailSA = new Float32Array(MAX_TRAIL_POINTS * 2 * 2);
  private readonly trailIdx = new Uint32Array(MAX_TRAIL_POINTS * 6);
  private readonly pts = new Float32Array(MAX_TRAIL_POINTS * 2);
  private readonly marks = new THREE.InstancedBufferGeometry();
  private readonly fadeU = { value: 0 };
  private readonly discU = { value: new THREE.Vector3() };
  private readonly dpr = { value: 1 };
  private readonly paper: THREE.WebGLRenderTarget;
  private readonly paperMat: THREE.ShaderMaterial;
  private bakedFor = '';
  private readonly U = new THREE.Vector3();
  private readonly F = new THREE.Vector3();
  private readonly S = new THREE.Vector3();
  private readonly ahead = new THREE.Vector3();
  private readonly facing = new Float32Array(SHIPS).fill(1);
  private nv = 0; // trail vertices and indices written this frame
  private ni = 0;

  constructor(ctx: Ctx, papyrus: THREE.Texture) {
    this.ctx = ctx;
    this.paper = new THREE.WebGLRenderTarget(1, 1, { colorSpace: THREE.SRGBColorSpace });
    this.paperMat = new THREE.ShaderMaterial({
      vertexShader: QUAD_VERT, fragmentShader: HUD_PAPER_FRAG, depthTest: false, depthWrite: false,
      uniforms: { tPapyrus: { value: papyrus }, uRadius: { value: 1 }, uDpr: this.dpr },
    });
    bakeInto(ctx.pipeline.renderer, this.paperMat, this.paper, true);
    const card = new THREE.CanvasTexture(hudCardArt(1024));
    card.colorSpace = THREE.NoColorSpace;
    card.anisotropy = 4;
    const dpr = this.dpr;
    this.disc = overlayMaterial({
      vertexShader: HUD_VERT,
      fragmentShader: HUD_FRAG,
      uniforms: {
        tHeight: { value: heightAtlas(ctx.world) }, tOwner: ctx.territory.u.tTerrOwner, tCard: { value: card },
        tPaper: { value: this.paper.texture },
        uTeam: { value: TEAM }, uUp: { value: this.U }, uFwd: { value: this.F }, uStar: { value: this.S },
        uDisc: this.discU, uNorth: { value: 0 }, uFade: this.fadeU, uNight: { value: 0 }, uDpr: dpr,
      },
    });
    this.root.add(overlayMesh(new THREE.PlaneGeometry(HUD_QUAD * 2, HUD_QUAD * 2), this.disc, 0));

    // open trails: one indexed strip per polyline, mitred on the CPU, multiplied onto the paper like ink
    const dyn = (a: THREE.TypedArray, n: number) => new THREE.BufferAttribute(a, n).setUsage(THREE.DynamicDrawUsage);
    this.trailGeo.setAttribute('position', dyn(this.trailPos, 3));
    this.trailGeo.setAttribute('aColor', dyn(this.trailCol, 3));
    this.trailGeo.setAttribute('aSideAlong', dyn(this.trailSA, 2));
    this.trailGeo.setIndex(dyn(this.trailIdx, 1));
    const multiply = { blending: THREE.CustomBlending, blendSrc: THREE.ZeroFactor, blendDst: THREE.SrcColorFactor };
    const trails = overlayMaterial({
      vertexShader: TRAIL_VERT, fragmentShader: TRAIL_FRAG, ...multiply,
      uniforms: { uDisc: this.discU, uFade: this.fadeU },
    });
    this.root.add(overlayMesh(this.trailGeo, trails, 1));

    // ship marks: ink and wash multiplied, then sail cloth, pennant and gilt painted over
    const box = new THREE.PlaneGeometry(3.4, 3.4);
    this.marks.index = box.index;
    this.marks.setAttribute('position', box.getAttribute('position'));
    for (const [name, n] of [['aPos', 2], ['aDir', 2], ['aColor', 3], ['aSizeAlpha', 2], ['aFlags', 2]] as const) {
      this.marks.setAttribute(name, perShip(n));
    }
    const markU = { uFade: this.fadeU };
    const mark = { vertexShader: MARK_VERT, fragmentShader: PAPER_GLSL + MARK_FRAG, uniforms: markU };
    const ink = overlayMaterial({ ...mark, ...multiply });
    const gouache = overlayMaterial({ ...mark, defines: { GOUACHE: '' } });
    this.root.add(overlayMesh(this.marks, ink, 2), overlayMesh(this.marks, gouache, 3));
  }

  /** Azimuthal-equidistant projection around the player into HUD CSS px offsets (x right, y up). */
  private project(q: V3 | THREE.Vector3, out: Float32Array, o: number, scale: number): boolean {
    const U = this.U, c = Math.min(1, Math.max(-1, q.x * U.x + q.y * U.y + q.z * U.z));
    const th = Math.acos(c), tx = q.x - c * U.x, ty = q.y - c * U.y, tz = q.z - c * U.z;
    const k = ((th * R) / VIEW) * scale / (Math.hypot(tx, ty, tz) || 1);
    out[o] = (tx * this.S.x + ty * this.S.y + tz * this.S.z) * k;
    out[o + 1] = (tx * this.F.x + ty * this.F.y + tz * this.F.z) * k;
    return th * R < VIEW * 1.3;
  }

  update(f: Frame, w: number, h: number, dpr: number, visible: number): void {
    const { sim } = this.ctx;
    const lay = hudLayout(w, h);
    this.discU.value.set(lay.x, lay.y, lay.r);
    this.dpr.value = dpr;
    this.fadeU.value = visible;
    this.root.visible = visible > 0;
    if (!this.root.visible) return;
    const key = `${lay.r}@${dpr}`;
    if (key !== this.bakedFor) {
      this.bakedFor = key;
      const size = Math.ceil(lay.r * HUD_QUAD * 2 * dpr);
      this.paper.setSize(size, size);
      this.paperMat.uniforms.uRadius.value = lay.r;
      bakeInto(this.ctx.pipeline.renderer, this.paperMat, this.paper);
    }

    const me = f.poses[0];
    this.U.copy(me.up);
    this.F.copy(me.fwd);
    this.S.crossVectors(this.F, this.U);
    const north = this.disc.uniforms.uNorth;
    const ny = 1 - this.U.y * this.U.y;
    // north = Y with its normal part removed: (-U.y·U.x, 1 - U.y², -U.y·U.z); undefined at the poles
    const nx = -this.U.y * this.U.x, nz = -this.U.y * this.U.z;
    const S = this.S, F = this.F;
    if (ny > 1e-6) north.value = Math.atan2(nx * S.x + ny * S.y + nz * S.z, nx * F.x + ny * F.y + nz * F.z);
    this.disc.uniforms.uNight.value = f.env.night;

    // trails: the open polyline plus the ship's current position, thinned to ~1.5 px steps
    const scale = lay.r * WIN;
    this.nv = this.ni = 0;
    for (const s of sim.ships) {
      if (!s.trail.length) continue;
      let n = 0;
      for (let i = 0; i <= s.trail.length && this.nv / 2 + n < MAX_TRAIL_POINTS; i++) {
        const last = i === s.trail.length;
        if (!this.project(last ? f.poses[s.id].up : s.trail[i], this.pts, n * 2, scale)) {
          if (n > 1) this.emitStrip(n, TEAM[s.id], lay.x, lay.y);
          n = 0;
          continue;
        }
        const dx = this.pts[n * 2] - this.pts[n * 2 - 2], dy = this.pts[n * 2 + 1] - this.pts[n * 2 - 1];
        if (n === 0 || last || dx * dx + dy * dy > 2.25) n++;
      }
      if (n > 1) this.emitStrip(n, TEAM[s.id], lay.x, lay.y);
    }
    this.trailGeo.setDrawRange(0, this.ni);
    const g = this.trailGeo;
    upload(g.attributes.position as THREE.BufferAttribute, this.nv);
    upload(g.attributes.aColor as THREE.BufferAttribute, this.nv);
    upload(g.attributes.aSideAlong as THREE.BufferAttribute, this.nv);
    upload(g.index!, this.ni);

    // ship marks
    const at = (name: string) => this.marks.getAttribute(name) as THREE.InstancedBufferAttribute;
    const pos = at('aPos'), dir = at('aDir'), color = at('aColor'), sa = at('aSizeAlpha'), fl = at('aFlags');
    const ahead = this.ahead, xy = this.pts;
    let count = 0;
    for (const p of f.poses) {
      if (!p.visible || !this.project(p.up, xy, 0, scale)) continue;
      const d = Math.hypot(xy[0], xy[1]) / scale;
      if (d > 1.05) continue;
      this.project(ahead.copy(p.up).addScaledVector(p.fwd, 0.01).normalize(), xy, 2, scale);
      const hx = xy[2] - xy[0], hy = xy[3] - xy[1], hl = Math.hypot(hx, hy) || 1;
      pos.setXY(count, lay.x + xy[0], lay.y - xy[1]);
      if (p.id === 0) dir.setXY(count, 0, 1);
      else dir.setXY(count, hx / hl, hy / hl);
      if (Math.abs(hx / hl) > 0.3) this.facing[p.id] = Math.sign(hx); // held while she heads up or down the chart
      const c = TEAM[p.id];
      color.setXYZ(count, c.r, c.g, c.b);
      const fade = (1 - ramp(d, 0.86, 1)) * (1 - p.sink) * Math.min(1, p.rise * 1.5);
      sa.setXY(count, (p.id === 0 ? 0.105 : 0.08) * lay.r, fade);
      fl.setXY(count, p.id === 0 ? 1 : 0, this.facing[p.id]);
      count++;
    }
    pos.needsUpdate = dir.needsUpdate = color.needsUpdate = sa.needsUpdate = fl.needsUpdate = true;
    this.marks.instanceCount = count;
  }

  /** Mitre n projected points (this.pts, HUD offsets) onto the end of the trail strip buffers. */
  private emitStrip(n: number, col: THREE.Color, cx: number, cy: number): void {
    const P = this.pts, T = this.trailIdx, nv = this.nv, half = 1.35;
    let along = 0;
    for (let i = 0; i < n; i++) {
      const i0 = Math.max(0, i - 1), i1 = Math.min(n - 1, i + 1);
      let tx = P[i1 * 2] - P[i0 * 2], ty = P[i1 * 2 + 1] - P[i0 * 2 + 1];
      const tl = Math.hypot(tx, ty) || 1;
      tx /= tl; ty /= tl;
      if (i > 0) along += Math.hypot(P[i * 2] - P[i * 2 - 2], P[i * 2 + 1] - P[i * 2 - 1]);
      for (let s = -1; s <= 1; s += 2) {
        const v = nv + i * 2 + (s + 1) / 2;
        this.trailPos[v * 3] = cx + P[i * 2] - ty * half * s;
        this.trailPos[v * 3 + 1] = cy - (P[i * 2 + 1] + tx * half * s);
        this.trailPos[v * 3 + 2] = 0;
        this.trailCol[v * 3] = col.r; this.trailCol[v * 3 + 1] = col.g; this.trailCol[v * 3 + 2] = col.b;
        this.trailSA[v * 2] = s;
        this.trailSA[v * 2 + 1] = along;
      }
      if (i > 0) {
        const a = nv + i * 2 - 2;
        T[this.ni++] = a; T[this.ni++] = a + 1; T[this.ni++] = a + 2;
        T[this.ni++] = a + 1; T[this.ni++] = a + 3; T[this.ni++] = a + 2;
      }
    }
    this.nv = nv + n * 2;
  }
}

// ---------------------------------------------------------------------------------------------
// Globe menu: a papyrus sea chart unrolled across the screen, the live planet at its centre and the
// leaderboard as a hoist of pennants beside it.

/** Sheet, globe and leaderboard placement, in CSS px. */
function menuLayout(w: number, h: number) {
  const sx = Math.max(16, w * 0.03), sy = Math.max(14, h * 0.045), sw = w - sx * 2, sh = h - sy * 2;
  const rg = Math.min(sh * 0.355, sw * 0.23); // globe radius
  const gx = sx + sw * 0.44, gy = sy + sh * 0.5;
  const staff = gx + rg * 1.3 + 46, top = sy + sh * 0.1, row = (sh * 0.8) / SHIPS;
  const reach = Math.min(sx + sw - 44 - staff, row * 12); // the leader's pennant
  return { sx, sy, sw, sh, rg, gx, gy, staff, top, row, reach };
}
type MenuLayout = ReturnType<typeof menuLayout>;

/** Everything inked on the sheet once: frame, rhumb web, roses, the globe's ring and shadow, galleon, hoist. */
function sheetArt(g: CanvasRenderingContext2D, L: MenuLayout, u: number): void {
  const { sx, sy, sw, sh, rg, gx, gy, staff, top, row } = L;
  const m = 22, band = 9, x0 = sx + m, y0 = sy + m, x1 = sx + sw - m, y1 = sy + sh - m;
  const roseL = { x: sx + Math.min(150, sw * 0.1), y: sy + Math.min(150, sh * 0.19), r: Math.min(82, sh * 0.1) };
  const ship = { x: sx + Math.min(170, sw * 0.12), y: sy + sh * 0.8, s: Math.min(78, sh * 0.09) };
  g.lineCap = 'round';
  g.save();
  g.beginPath();
  g.rect(x0 + band, y0 + band, x1 - x0 - band * 2, y1 - y0 - band * 2);
  g.clip();
  drawRhumbs(g, gx, gy, rg * 1.75, Math.hypot(sw, sh), u);
  // engraved sea: loose rows of wavelets, kept clear of the globe, the hoist and the ornaments
  g.strokeStyle = PEN.ink;
  g.lineWidth = 0.7 * u;
  g.globalAlpha = 0.55;
  g.beginPath();
  for (let y = y0 + 40; y < y1 - 20; y += 46) {
    for (let x = x0 + 30 + ((y / 46) % 2) * 37; x < x1 - 30; x += 74) {
      const jx = x + Math.sin(x * 12.9898 + y * 78.233) * 14, jy = y + Math.sin(x * 39.34 + y * 11.13) * 9;
      const clear = Math.hypot(jx - gx, jy - gy) > rg * 1.42
        && !(jx > staff - 30 && jy > top - row * 2 && jy < top + row * 22)
        && Math.hypot(jx - roseL.x, jy - roseL.y) > roseL.r * 1.25
        && Math.hypot(jx - ship.x, (jy - ship.y + ship.s) * 1.6) > ship.s * 2.6;
      if (clear) wavelet(g, jx, jy, 12 + 6 * Math.abs(Math.sin(jx * 3.1 + jy)));
    }
  }
  g.stroke();
  g.globalAlpha = 1;
  g.restore();
  // the globe sits in a great compass ring; its points reach out past the planet
  g.save();
  g.translate(gx, gy);
  drawRose(g, rg * 1.3, u * 1.2, 1, 0.055);
  g.restore();
  g.save();
  g.translate(roseL.x, roseL.y);
  drawRose(g, roseL.r, u);
  g.restore();
  g.save();
  g.translate(ship.x, ship.y);
  drawGalleon(g, ship.s, u);
  g.restore();
  // the hoist the pennants fly from: a staff with a gilt truck
  g.strokeStyle = PEN.ink;
  g.lineWidth = 2.2 * u;
  g.beginPath();
  g.moveTo(staff, top - row * 1.1);
  g.lineTo(staff, top + row * (SHIPS + 0.2));
  g.stroke();
  g.beginPath();
  g.arc(staff, top - row * 1.1 - 6, 6, 0, Math.PI * 2);
  g.fillStyle = PEN.gold;
  g.fill();
  g.lineWidth = u;
  g.stroke();
  // neatline: double rule with a band of alternating bars, rosettes at the corners
  g.lineWidth = 1.6 * u;
  g.strokeRect(x0, y0, x1 - x0, y1 - y0);
  g.lineWidth = 0.8 * u;
  g.strokeRect(x0 + band, y0 + band, x1 - x0 - band * 2, y1 - y0 - band * 2);
  g.fillStyle = PEN.ink;
  const bars = (a: number, b: number, fixed: number, vertical: boolean) => {
    const n = Math.round((b - a) / 34);
    for (let i = 1; i < n - 1; i += 2) {
      const p0 = a + ((b - a) * i) / n, len = (b - a) / n;
      if (vertical) g.fillRect(fixed + 2.5, p0, band - 5, len);
      else g.fillRect(p0, fixed + 2.5, len, band - 5);
    }
  };
  bars(x0, x1, y0, false);
  bars(x0, x1, y1 - band, false);
  bars(y0, y1, x0, true);
  bars(y0, y1, x1 - band, true);
  for (const [cx, cy] of [[x0, y0], [x1, y0], [x0, y1], [x1, y1]]) {
    g.save();
    g.translate(cx + (cx < gx ? band : -band) / 2, cy + (cy < gy ? band : -band) / 2);
    for (let k = 0; k < 4; k++) {
      g.rotate(Math.PI / 2);
      g.beginPath();
      g.ellipse(0, -band * 0.9, band * 0.28, band * 0.75, 0, 0, Math.PI * 2);
      g.fillStyle = k % 2 ? PEN.red : PEN.green;
      g.fill();
      g.stroke();
    }
    g.restore();
  }
  // the planet's soft shadow on the sheet
  const ox = gx + rg * 0.06, oy = gy + rg * 0.09, sh2 = g.createRadialGradient(ox, oy, rg * 0.8, ox, oy, rg * 1.16);
  sh2.addColorStop(0, 'rgba(40,22,8,0.55)');
  sh2.addColorStop(1, 'rgba(40,22,8,0)');
  g.fillStyle = sh2;
  g.fillRect(gx - rg * 1.3, gy - rg * 1.3, rg * 2.6, rg * 2.6);
}

const QUAD_VERT = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

// The sheet's paper, its ageing and its line art, baked once per screen size into an sRGB target.
const BAKE_FRAG = /* glsl */ `
uniform sampler2D tArt;
uniform vec2 uSize;
varying vec2 vUv;
${PAPER_GLSL}
void main() {
  vec2 q = vec2(vUv.x, 1.0 - vUv.y) * uSize;
  vec4 pap = papyrus(q);
  vec3 col = pap.rgb;
  // torn, scorched margins; two old folds
  float n = fbm(vec3(q * 0.012, 3.0)) * 16.0 + vnoise(vec3(q * 0.15, 1.0)) * 4.0;
  n += 9.0 * (pow(vnoise(vec3(q.x * 1.1, q.y * 0.04, 8.0)), 12.0)
    + pow(vnoise(vec3(q.x * 0.04, q.y * 1.1, 3.0)), 12.0));
  vec2 e2 = min(q, uSize - q);
  float edge = min(e2.x, e2.y) - n;
  float scorch = 1.0 - smoothstep(0.0, 70.0, edge + 20.0 * fbm(vec3(q * 0.02, 6.0)));
  col *= mix(vec3(1.0), vec3(0.42, 0.27, 0.13), scorch * 0.8);
  col *= 1.0 - 0.07 * (fbm(vec3(q * 0.0015, 9.0)) - 0.3);
  vec2 fold = abs(q - uSize * 0.5);
  float crease = exp(-fold.x * fold.x / 18.0) + exp(-fold.y * fold.y / 18.0);
  col *= 1.0 - 0.1 * crease + 0.03 * sign(q.x - uSize.x * 0.5) * exp(-fold.x / 30.0);
  // ink sinks into the fibres and bleeds a little
  vec2 st = vec2(vUv.x, 1.0 - vUv.y);
  vec4 art = texture2D(tArt, st);
  vec4 bleed = texture2D(tArt, st, 2.5);
  col *= mix(vec3(1.0), pow(bleed.rgb, vec3(2.2)), bleed.a * 0.18);
  col *= mix(vec3(1.0), pow(art.rgb, vec3(2.2)), art.a * (0.88 + 0.25 * (pap.a - 0.5)));
  gl_FragColor = vec4(col, smoothstep(0.0, 1.2, edge));
}
`;

const SCREEN_VERT = /* glsl */ `
uniform vec4 uQuad; // x, y, w, h in CSS px
varying vec2 vPx;
void main() {
  vPx = uQuad.xy + (position.xy * vec2(0.5, -0.5) + 0.5) * uQuad.zw;
  gl_Position = projectionMatrix * vec4(vPx, 0.0, 1.0);
}
`;

/** Shared by everything painted on the sheet: where it is, how far it is spread and how it is lit. */
const SHEET_GLSL = /* glsl */ `
uniform sampler2D tSheet;
uniform vec4 uSheet; // x, y, w, h
uniform float uX, uRoll, uNight;
vec4 sheetAt(vec2 px) {
  return texture2D(tSheet, vec2((px.x - uSheet.x) / uSheet.z, 1.0 - (px.y - uSheet.y) / uSheet.w));
}
// a warm reading light; at night a lamp off the upper left
vec3 lamp(vec2 px) {
  float d = length((px - uSheet.xy - vec2(0.25, 0.2) * uSheet.zw) / uSheet.w);
  return mix(vec3(1.0, 0.985, 0.95), vec3(1.0, 0.82, 0.62) * (1.08 - 0.35 * d), uNight);
}
`;

const SHEET_FRAG = /* glsl */ `
varying vec2 vPx;
${PAPER_GLSL}
${SHEET_GLSL}
float box(vec2 p, vec2 b) { vec2 d = abs(p) - b; return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0); }
void main() {
  vec4 s = sheetAt(vPx);
  vec2 rel = vPx - uSheet.xy;
  float inside = step(0.0, rel.x) * step(rel.x, uSheet.z) * step(0.0, rel.y) * step(rel.y, uSheet.w);
  float spread = smoothstep(uX + 0.5, uX - 0.5, vPx.x);
  float a = s.a * inside * spread;
  vec3 col = s.rgb * lamp(vPx);
  col *= 1.0 - 0.45 * exp(-max(uX - uRoll - vPx.x, 0.0) / max(uRoll * 0.7, 1.0)) * step(0.5, uRoll);
  // shadow the spread part of the sheet casts on the world
  float right = min(uX, uSheet.x + uSheet.z);
  vec2 c = vec2(uSheet.x + right, 2.0 * uSheet.y + uSheet.w) * 0.5 + vec2(6.0, 10.0);
  float sd = box(vPx - c, vec2(right - uSheet.x, uSheet.w) * 0.5);
  float shadow = 0.55 * (1.0 - smoothstep(-16.0, 30.0, sd));
  float alpha = a + shadow * (1.0 - a);
  gl_FragColor = vec4(toSRGB(col * a / max(alpha, 1e-4)), alpha);
}
`;

// The rolled-up remainder: a papyrus cylinder lying on the sheet, its back side out, casting shadows.
const ROLL_FRAG = /* glsl */ `
varying vec2 vPx;
${PAPER_GLSL}
${SHEET_GLSL}
uniform float uSpread, uSlide;
void main() {
  float r = uRoll, dx = vPx.x - uX, c = dx / max(r, 1e-3);
  float bottom = uSheet.y + uSheet.w;
  float yIn = smoothstep(uSheet.y - 0.5, uSheet.y + 0.5, vPx.y) * smoothstep(bottom + 0.5, bottom - 0.5, vPx.y);
  float body = smoothstep(1.0, 1.0 - 1.5 / max(r, 1.0), abs(c)) * yIn;
  float nz = sqrt(max(1.0 - c * c, 0.0));
  vec3 n = vec3(c, 0.0, nz);
  vec4 pap = papyrus(vec2(uSpread + r * (3.14159 - asin(clamp(c, -1.0, 1.0))), vPx.y - uSheet.y) + vec2(517.0, 211.0));
  vec3 L = normalize(vec3(-0.45, 0.0, 0.9));
  float diff = 0.3 + 0.7 * max(dot(n, L), 0.0);
  float spec = pow(max(dot(reflect(-L, n), vec3(0.0, 0.0, 1.0)), 0.0), 18.0) * 0.12;
  vec3 col = (pap.rgb * vec3(0.93, 0.88, 0.8) * diff + spec) * lamp(vPx);
  // darker, frayed ends of the roll
  float end = min(vPx.y - uSheet.y, uSheet.y + uSheet.w - vPx.y);
  col *= 0.75 + 0.25 * smoothstep(0.0, 10.0, end);
  // the near end shows the spiral of wound layers, edge on
  vec2 cap = vec2(c, (vPx.y - uSheet.y - uSheet.w) / max(r * 0.35, 1.0));
  float capR = length(cap), capA = smoothstep(1.0, 1.0 - 2.0 / max(r, 1.0), capR) * step(0.0, cap.y);
  float layers = 0.5 + 0.5 * cos(capR * r * 2.4 + atan(cap.y, cap.x) * 0.5);
  vec3 capCol = vec3(0.45, 0.32, 0.17) * (0.75 + 0.25 * layers) * (0.7 + 0.3 * capR) * lamp(vPx);
  col = mix(col, capCol, capA);
  body = max(body, capA);
  // contact shadow on the sheet to the left, cast shadow on the world to the right and below
  float left = 0.4 * exp(-max(-dx - r, 0.0) / max(r * 0.5, 1.0)) * step(dx, -r) * yIn;
  float right = 0.55 * exp(-max(dx - r, 0.0) / max(r * 0.9, 1.0)) * step(r, dx);
  right *= smoothstep(uSheet.y - 6.0, uSheet.y + 12.0, vPx.y) * smoothstep(bottom + 22.0, bottom, vPx.y);
  float below = 0.45 * smoothstep(r * 1.4, 0.0, abs(dx + 4.0)) * smoothstep(bottom + r * 0.35 + 18.0, bottom, vPx.y);
  below *= step(bottom, vPx.y);
  float shadow = max(max(left, right), below) * (1.0 - body);
  float alpha = body + shadow;
  gl_FragColor = vec4(toSRGB(col * body / max(alpha, 1e-4)), alpha * uSlide * smoothstep(0.0, 3.0, r));
}
`;

const BACKDROP_FRAG = /* glsl */ `
uniform float uFade;
uniform vec2 uView;
varying vec2 vPx;
void main() {
  float v = length((vPx / uView - 0.5) * vec2(1.0, 0.8));
  gl_FragColor = vec4(0.03, 0.02, 0.01, uFade * (0.42 + 0.4 * smoothstep(0.2, 0.75, v)));
}
`;

// The live planet composited onto the sheet: opaque over the planet's disc (renderView's output is already
// tone-mapped), its atmosphere carried over as a glow that fades into the paper.
const GLOBE_FRAG = /* glsl */ `
uniform sampler2D tGlobe, tGlobeDepth, tOwner;
uniform vec3 uTeam[${SHIPS}];
uniform vec3 uGlobe; // centre x, y and half size of the render, CSS px
uniform float uPlanet; // the sea-level sphere's radius as a fraction of the half size
uniform vec3 uCamPos, uCamRight, uCamUp, uCamFwd, uSun;
uniform float uTanHalf;
varying vec2 vPx;
${PAPER_GLSL}
${SHEET_GLSL}
${OWNER_GLSL}
vec2 globeUV(vec2 d) { return vec2(d.x, -d.y) * 0.5 + 0.5; }
void main() {
  vec2 d = (vPx - uGlobe.xy) / uGlobe.z;
  vec3 col = texture2D(tGlobe, globeUV(d)).rgb;
  float r = length(d), px = fwidth(r), rr = r / uPlanet;
  float disc = smoothstep(uPlanet + px, uPlanet - px, r);
  // ground standing proud of the sea on the limb, faded before it can stand out as a spike
  float proud = step(texture2D(tGlobeDepth, globeUV(d)).r, 0.9999) * smoothstep(uPlanet * 1.06, uPlanet * 1.01, r);
  float solid = max(disc, proud);
  // where this pixel's ray meets the sea-level sphere (or passes closest to it), and how the sun stands there
  vec3 ray = normalize(uCamFwd + (uCamRight * d.x - uCamUp * d.y) * uTanHalf);
  float b = dot(uCamPos, ray), h = b * b - dot(uCamPos, uCamPos) + ${R}.0 * ${R}.0;
  vec3 n = normalize(uCamPos + ray * (h > 0.0 ? -b - sqrt(h) : -b));
  float sun = dot(n, uSun), day = smoothstep(-0.1, 0.22, sun);
  // territories as dyed water: the owner's colour through the sea's own shading, glints left white on top
  int id = terrOwnerAt(tOwner, n);
  vec3 glint = max(col - 0.32, 0.0), body = col - glint;
  if (id > 0) col = mix(body, dot(body, vec3(0.3, 0.55, 0.15)) * uTeam[id - 1] * 2.4, 0.55 * disc) + glint;
  // Day and night. The lit hemisphere's sky light is the player's own sky, dim when the player is in the
  // dark, so it is lifted back to daylight; the night hemisphere falls to a deep moonlit blue in which
  // glints, lanterns, beacons and shimmering borders still show as points of light.
  vec3 lit = col * (1.0 + 1.5 * uNight) + vec3(0.006, 0.02, 0.05) * uNight;
  vec3 dark = col * vec3(0.15, 0.2, 0.31) + max(col - 0.16, 0.0) * 1.3;
  col = mix(dark, lit, day);
  // twilight: warm light scattered along the terminator, strongest toward the limb where the air is deepest
  float limb = smoothstep(0.35, 1.0, rr);
  float band = exp(-(sun - 0.02) * (sun - 0.02) / 0.0018) * (0.06 + 0.94 * limb * limb);
  col = mix(col, col * vec3(1.45, 0.95, 0.7) + vec3(0.045, 0.016, 0.005) * limb, band * disc);
  // the atmosphere: blue over the daylit limb, rose and orange where the terminator meets it, faint by night
  vec3 air = mix(vec3(0.45, 0.68, 1.0), vec3(1.0, 0.52, 0.28), exp(-sun * sun / 0.02));
  float airLit = smoothstep(-0.3, 0.15, sun);
  col += air * pow(rr, 8.0) * 0.18 * airLit * disc;
  float halo = pow(1.0 - smoothstep(uPlanet, uPlanet * 1.13, r), 2.0) * (0.12 + 0.8 * airLit);
  col = mix(air, col, solid);
  // a fine ink rim where the planet meets the paper
  col = mix(col, INK, (1.0 - smoothstep(0.0, 1.6 * px, abs(r - uPlanet) - 0.6 * px)) * 0.3 * (1.0 - solid * 0.5));
  float a = solid + halo * (1.0 - solid);
  a *= smoothstep(uX - uRoll + 0.5, uX - uRoll - 0.5, vPx.x);
  gl_FragColor = vec4(toSRGB(col), a);
}
`;

// Pennants: tapering swallow-tailed streamers painted in watercolour, fluttering on the hoist.
const PENNANT_VERT = /* glsl */ `
attribute vec4 aRow; // staff x, row y, length, hoist height
attribute vec3 aColor, aTrim;
attribute vec3 aFlag; // player, limp (sunk), ship id
uniform float uTime;
varying vec2 vUv, vPx;
varying vec3 vColor, vTrim, vFlag;
varying float vFold, vLen, vH;
void main() {
  float u = position.x + 0.5, v = position.y * 2.0;
  float L = aRow.z, H = aRow.w, x = u * L, live = 1.0 - aFlag.y;
  float k = 6.2832 / max(H * 6.0, 40.0), ph = x * k - uTime * 6.0 + aFlag.z * 2.39;
  float wave = sin(ph) + 0.3 * sin(ph * 2.3 - uTime * 3.0);
  float amp = H * 0.2 * pow(u, 1.1) * live;
  float y = v * H * 0.5 * (1.0 - 0.6 * u) + wave * amp + (1.0 - live) * u * u * H * 1.2;
  vFold = cos(ph) * amp * k;
  vUv = vec2(u, v);
  vColor = aColor;
  vTrim = aTrim;
  vFlag = aFlag;
  vLen = L;
  vH = H;
  vPx = vec2(aRow.x + x * (1.0 - 0.03 * live * (0.5 + 0.5 * wave) * u), aRow.y + y);
  gl_Position = projectionMatrix * vec4(vPx, 0.0, 1.0);
}
`;

const PENNANT_FRAG = /* glsl */ `
varying vec2 vUv, vPx;
varying vec3 vColor, vTrim, vFlag;
varying float vFold, vLen, vH;
uniform sampler2D tEmblem;
${PAPER_GLSL}
${SHEET_GLSL}
void main() {
  float u = vUv.x, v = abs(vUv.y), x = u * vLen;
  float hh = vH * 0.5 * (1.0 - 0.6 * u); // half height here, px
  // distance to the cloth's edge in px: top and bottom, the fly end and the swallow-tail notch
  float depth = min(vH * 1.1, vLen * 0.3);
  float notch = v * hh - vH * 0.5 * 0.4 * 0.9 * (x - (vLen - depth)) / depth;
  float edgePx = min(min((1.0 - v) * hh, vLen - x), x > vLen - depth ? notch : 1e3);
  float cover = smoothstep(-0.6, 0.6, edgePx);
  vec3 paper = sheetAt(vPx).rgb;
  // hoist in the trim colour, a trim stripe down the middle of the fly
  float hoist = vH * 0.95;
  vec3 pig = x < hoist || v < 0.17 ? vTrim : vColor;
  float dens = (0.9 + 0.8 * exp(-max(edgePx, 0.0) / 2.2)) * (0.82 + 0.36 * vnoise(vec3(vPx * 0.7, vFlag.z)));
  dens *= 1.0 - 0.55 * vFlag.y;
  vec3 col = wash(paper, pig, dens);
  // the ship's emblem painted on the hoist in its colour
  vec2 e = vec2(x - hoist * 0.5, vUv.y * hh) / (hoist * 0.5);
  vec2 cell = vec2(mod(vFlag.z, 5.0), floor(vFlag.z / 5.0));
  float em = x < hoist ? texture2D(tEmblem, (cell + 0.5 + e * 0.5) / 5.0).r : 0.0;
  col = mix(col, wash(paper, vColor, dens * 1.2), em);
  float line = 1.0 - smoothstep(0.35, 1.1, abs(edgePx));
  line = max(line, (1.0 - smoothstep(0.25, 0.9, abs(x - hoist))) * 0.7);
  line = max(line, (1.0 - smoothstep(0.25, 0.9, abs(v - 0.17) * hh)) * 0.35 * step(hoist, x));
  col = mix(col, INK, line * 0.85);
  // the player's pennant is edged in gilt inside its ink line
  float gilt = vFlag.x * (1.0 - smoothstep(0.5, 1.2, abs(edgePx - 2.0)));
  col = mix(col, vec3(0.95, 0.7, 0.24) * (0.8 + 0.35 * sin(vPx.x * 0.06 - vPx.y * 0.04 + vFlag.z)), gilt);
  col *= 1.0 + clamp(vFold, -0.4, 0.4) * 0.5;
  float a = cover * smoothstep(uX - uRoll + 0.5, uX - uRoll - 0.5, vPx.x);
  gl_FragColor = vec4(toSRGB(col * lamp(vPx)), a);
}
`;

// A gilt star beside the hoist marks the player's pennant.
const STAR_FRAG = /* glsl */ `
varying vec2 vPx;
uniform vec3 uStar; // x, y, radius
${PAPER_GLSL}
${SHEET_GLSL}
void main() {
  vec2 p = (vPx - uStar.xy) / uStar.z;
  float a = atan(p.y, p.x), r = length(p);
  float star = r - (0.42 + 0.48 * pow(abs(cos(a * 2.5)), 6.0));
  float px = fwidth(r);
  float fill = smoothstep(px, -px, star);
  float line = 1.0 - smoothstep(0.0, 1.4 * px, abs(star) - 0.4 * px);
  vec3 col = mix(vec3(0.96, 0.72, 0.26), vec3(0.6, 0.38, 0.1), smoothstep(-0.6, 0.6, p.x + p.y));
  col = mix(col, INK, line);
  float alpha = max(fill, line) * smoothstep(uX - uRoll + 0.5, uX - uRoll - 0.5, vPx.x);
  gl_FragColor = vec4(toSRGB(col * lamp(vPx)), alpha);
}
`;

const GLOBE_DIST = 1270; // camera distance that frames the planet with room for its atmosphere
const GLOBE_FOV = 22;
/** The sea-level sphere's apparent radius as a fraction of the globe render's half size. */
const GLOBE_PLANET = Math.tan(Math.asin(R / GLOBE_DIST)) / Math.tan(THREE.MathUtils.degToRad(GLOBE_FOV / 2));
const AUTO_SPIN = 0.07; // rad/s

/**
 * The planet's relief for the globe view. The terrain builds only the tiles the game camera can see, so
 * the menu brings its own whole-planet land and seabed, sunk a little below the real ground where both draw.
 */
function globeLand(world: World): THREE.Mesh {
  const N = 192, V = N + 1, pos = new Float32Array(6 * V * V * 3), col = new Float32Array(pos.length);
  const index = new Uint32Array(6 * N * N * 6), p = v3(), c = new THREE.Color(), H = world.heights;
  // by climate: tropical, temperate, polar
  const rgb = (r: number, g: number, b: number) => new THREE.Color(r, g, b);
  const sand = [rgb(0.8, 0.74, 0.56), rgb(0.52, 0.46, 0.34), rgb(0.1, 0.1, 0.11)];
  const green = [rgb(0.07, 0.19, 0.05), rgb(0.06, 0.13, 0.05), rgb(0.07, 0.07, 0.08)];
  const rock = rgb(0.16, 0.13, 0.11), snow = rgb(0.78, 0.8, 0.84), deep = rgb(0.1, 0.11, 0.1);
  const pick = (set: THREE.Color[], k: number) =>
    c.copy(set[Math.min(1, Math.floor(k))]).lerp(set[Math.min(2, Math.floor(k) + 1)], k % 1);
  const at = (f: number, i: number, j: number) => H[(f * HN + Math.min(HN - 1, j)) * HN + Math.min(HN - 1, i)];
  for (let f = 0; f < 6; f++) {
    for (let j = 0; j <= N; j++) {
      for (let i = 0; i <= N; i++) {
        faceDir(f, (i / N) * 2 - 1, (j / N) * 2 - 1, p);
        let h: number;
        if (i === 0 || j === 0 || i === N || j === N) h = world.height(p); // shared with the next face: exact
        else {
          const x = (i / N) * HN - 0.5, y = (j / N) * HN - 0.5, x0 = Math.floor(x), y0 = Math.floor(y);
          const fx = x - x0, fy = y - y0;
          h = (at(f, x0, y0) * (1 - fx) + at(f, x0 + 1, y0) * fx) * (1 - fy)
            + (at(f, x0, y0 + 1) * (1 - fx) + at(f, x0 + 1, y0 + 1) * fx) * fy;
        }
        const o = ((f * V + j) * V + i) * 3, k = world.climate(p), r = R + h - 0.3;
        pos.set([p.x * r, p.y * r, p.z * r], o);
        if (h < 0) pick(sand, k).lerp(deep, THREE.MathUtils.smoothstep(h, -2, -30));
        else if (h < 1.2) pick(sand, k);
        else {
          pick(green, k).lerp(rock, THREE.MathUtils.smoothstep(h, 14, 30));
          if (k > 1.6) c.lerp(snow, THREE.MathUtils.smoothstep(h, 8, 18));
        }
        col.set([c.r, c.g, c.b], o);
      }
    }
    for (let j = 0; j < N; j++) {
      for (let i = 0; i < N; i++) {
        const a = (f * V + j) * V + i;
        index.set([a, a + 1, a + V, a + 1, a + V + 1, a + V], ((f * N + j) * N + i) * 6);
      }
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setIndex(new THREE.BufferAttribute(index, 1));
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 }));
  mesh.layers.set(LAYER.GLOBE);
  return mesh;
}

class Menu {
  readonly root = new THREE.Group();
  /** 0 rolled up … 1 fully spread */
  progress = 0;
  want = false;
  private readonly ctx: Ctx;
  private readonly u = {
    tSheet: { value: null as THREE.Texture | null }, uSheet: { value: new THREE.Vector4() },
    uX: { value: 0 }, uRoll: { value: 0 }, uNight: { value: 0 },
  };
  private readonly bakeMat: THREE.ShaderMaterial;
  private readonly bakeRT = new THREE.WebGLRenderTarget(1, 1, { colorSpace: THREE.SRGBColorSpace });
  private bakedFor = '';
  private readonly globeRT = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType });
  private readonly globeCam = new THREE.PerspectiveCamera(GLOBE_FOV, 1, GLOBE_DIST - R * 1.6, GLOBE_DIST + R * 1.6);
  private readonly mats: Record<'sheet' | 'roll' | 'backdrop' | 'globe' | 'pennant' | 'star', THREE.ShaderMaterial>;
  private readonly pennants = new THREE.InstancedBufferGeometry();
  private readonly rowY = new Float32Array(SHIPS);
  private readonly order = Array.from({ length: SHIPS }, (_, i) => i);
  private readonly trim = TEAMS.map((t) => new THREE.Color().setHex(t.trim, THREE.SRGBColorSpace));
  private yaw = 0;
  private pitch = 0;
  private spin = 0;
  private drag: { x: number; y: number; t: number } | null = null;
  private frames = 0;

  constructor(ctx: Ctx, papyrus: THREE.Texture) {
    this.ctx = ctx;
    this.bakeMat = new THREE.ShaderMaterial({
      vertexShader: QUAD_VERT, fragmentShader: BAKE_FRAG, depthTest: false, depthWrite: false,
      uniforms: { tArt: { value: null }, uSize: { value: new THREE.Vector2() }, tPapyrus: { value: papyrus } },
    });
    this.u.tSheet.value = this.bakeRT.texture;
    bakeInto(ctx.pipeline.renderer, this.bakeMat, this.bakeRT, true);
    ctx.scene.add(globeLand(ctx.world));
    this.globeCam.layers.set(LAYER.WORLD);
    for (const l of [LAYER.WATER, LAYER.OVER, LAYER.GLOBE]) this.globeCam.layers.enable(l);
    const quad = new THREE.PlaneGeometry(2, 2);
    const screen = (frag: string, extra: Record<string, THREE.IUniform> = {}) =>
      overlayMaterial({
        vertexShader: SCREEN_VERT, fragmentShader: frag,
        uniforms: { ...this.u, uQuad: { value: new THREE.Vector4() }, ...extra },
      });
    this.mats = {
      backdrop: screen(BACKDROP_FRAG, { uView: { value: new THREE.Vector2() }, uFade: { value: 0 } }),
      sheet: screen(SHEET_FRAG),
      globe: screen(GLOBE_FRAG, {
        tGlobe: { value: this.globeRT.texture }, tGlobeDepth: { value: null }, uGlobe: { value: new THREE.Vector3() },
        uPlanet: { value: GLOBE_PLANET }, tOwner: ctx.territory.u.tTerrOwner, uTeam: { value: TEAM },
        uCamPos: { value: this.globeCam.position }, uCamRight: { value: new THREE.Vector3() },
        uCamUp: { value: new THREE.Vector3() }, uCamFwd: { value: new THREE.Vector3() },
        uSun: { value: new THREE.Vector3() }, uTanHalf: { value: Math.tan(THREE.MathUtils.degToRad(GLOBE_FOV / 2)) },
      }),
      star: screen(STAR_FRAG, { uStar: { value: new THREE.Vector3() } }),
      roll: screen(ROLL_FRAG, { uSpread: { value: 0 }, uSlide: { value: 0 }, tPapyrus: { value: papyrus } }),
      pennant: overlayMaterial({
        vertexShader: PENNANT_VERT, fragmentShader: PENNANT_FRAG,
        uniforms: { ...this.u, uTime: { value: 0 }, tEmblem: { value: emblemAtlas() } },
      }),
    };
    const strip = new THREE.PlaneGeometry(1, 1, 40, 2);
    this.pennants.index = strip.index;
    this.pennants.setAttribute('position', strip.getAttribute('position'));
    for (const [name, n] of [['aRow', 4], ['aColor', 3], ['aTrim', 3], ['aFlag', 3]] as const) {
      this.pennants.setAttribute(name, perShip(n));
    }
    this.pennants.instanceCount = SHIPS;
    this.root.add(
      overlayMesh(quad, this.mats.backdrop, 10), overlayMesh(quad, this.mats.sheet, 11),
      overlayMesh(quad, this.mats.globe, 12), overlayMesh(this.pennants, this.mats.pennant, 13),
      overlayMesh(quad, this.mats.star, 14), overlayMesh(quad, this.mats.roll, 15),
    );
    this.root.visible = false;

    // while the chart is spread the pointer and the arrow keys (main's key set) turn the globe
    const el = ctx.pipeline.renderer.domElement;
    el.addEventListener('pointerdown', (e) => {
      if (!this.want) return;
      this.drag = { x: e.clientX, y: e.clientY, t: e.timeStamp };
      el.setPointerCapture(e.pointerId);
      el.style.cursor = 'grabbing';
    });
    el.addEventListener('pointermove', (e) => {
      if (!this.drag) return;
      const dx = e.clientX - this.drag.x, dy = e.clientY - this.drag.y;
      const dt = Math.max(0.008, (e.timeStamp - this.drag.t) / 1000);
      const k = 1 / menuLayout(innerWidth, innerHeight).rg;
      this.yaw -= dx * k;
      this.pitch = THREE.MathUtils.clamp(this.pitch + dy * k, -1.2, 1.2);
      this.spin += (-dx * k / dt - this.spin) * 0.5;
      this.drag = { x: e.clientX, y: e.clientY, t: e.timeStamp };
    });
    const release = () => {
      this.drag = null;
      el.style.cursor = this.want ? 'grab' : '';
    };
    el.addEventListener('pointerup', release);
    el.addEventListener('pointercancel', release);
  }

  /** Spread or roll up the chart; on spreading, face the globe toward the player and the daylight. */
  toggle(f: Frame | null): void {
    this.want = !this.want;
    this.ctx.pipeline.renderer.domElement.style.cursor = this.want ? 'grab' : '';
    if (!this.want || this.progress > 0 || !f) return;
    const me = f.poses[0].up, sun = f.env.sunDir;
    const apart = me.angleTo(sun), turn = Math.max(0, apart - 1.66); // at night the terminator crosses the view
    const axis = new THREE.Vector3().crossVectors(me, sun);
    const view = me.clone();
    if (axis.lengthSq() > 1e-8) view.applyAxisAngle(axis.normalize(), turn);
    this.yaw = Math.atan2(view.x, view.z);
    this.pitch = THREE.MathUtils.clamp(Math.asin(view.y), -1.1, 1.1);
    this.spin = AUTO_SPIN;
  }

  update(f: Frame, w: number, h: number, dpr: number): void {
    const dt = f.dt;
    this.progress = clamp01(this.progress + dt * (this.want ? 1 / 1.05 : -1 / 0.8));
    this.root.visible = this.progress > 0;
    // Nothing renders before the game's own first frames (the scene's shadow maps must exist first); the
    // third frame bakes the sheet and renders the globe once, unseen, so the first M does not stall.
    if (++this.frames < 3) return;
    const L = menuLayout(w, h);
    this.bake(L, dpr);
    if (!this.root.visible && this.frames > 3) return;

    // the roll slides in, then travels right paying out the sheet; its radius shrinks as it empties
    const slide = ramp(this.progress, 0, 0.14);
    const k = ramp(this.progress, 0.1, 1), spread = k * k * (3 - 2 * k);
    const roll = Math.min(32, Math.max(16, L.sh * 0.034)) * Math.sqrt(1 - spread);
    const x = L.sx + spread * L.sw - (1 - slide) * 60;
    this.u.uSheet.value.set(L.sx, L.sy, L.sw, L.sh);
    this.u.uX.value = x;
    this.u.uRoll.value = roll;
    this.u.uNight.value = f.env.night;
    const quad = (m: THREE.ShaderMaterial, x0: number, y0: number, x1: number, y1: number) =>
      (m.uniforms.uQuad.value as THREE.Vector4).set(x0, y0, x1 - x0, y1 - y0);
    quad(this.mats.backdrop, 0, 0, w, h);
    this.mats.backdrop.uniforms.uFade.value = ramp(this.progress, 0, 0.6);
    (this.mats.backdrop.uniforms.uView.value as THREE.Vector2).set(w, h);
    quad(this.mats.sheet, L.sx - 40, L.sy - 40, L.sx + L.sw + 60, L.sy + L.sh + 60);
    quad(this.mats.roll, x - roll * 5, L.sy - 30, x + roll * 6, L.sy + L.sh + 40);
    this.mats.roll.uniforms.uSpread.value = spread * L.sw;
    this.mats.roll.uniforms.uSlide.value = slide;

    // globe: turns slowly, flung by the pointer, nudged by the arrow keys
    const held = (a: string, b: string) => (this.ctx.keys.has(a) || this.ctx.keys.has(b) ? 1 : 0);
    const keyTurn = held('ArrowLeft', 'KeyA') - held('ArrowRight', 'KeyD');
    const keyTilt = held('ArrowUp', 'KeyW') - held('ArrowDown', 'KeyS');
    const goal = keyTurn ? keyTurn * 1.4 : AUTO_SPIN;
    if (!this.drag) this.spin += (goal - this.spin) * (1 - Math.exp(-dt * (keyTurn ? 4 : 1.2)));
    if (!this.drag) this.yaw += this.spin * dt;
    this.pitch = THREE.MathUtils.clamp(this.pitch + keyTilt * dt * 0.9, -1.2, 1.2);
    const half = L.rg / GLOBE_PLANET, size = Math.min(2048, Math.round(half * 2 * dpr));
    if (this.globeRT.width !== size) this.globeRT.setSize(size, size);
    const cp = Math.cos(this.pitch);
    this.globeCam.position.set(Math.sin(this.yaw) * cp, Math.sin(this.pitch), Math.cos(this.yaw) * cp);
    this.globeCam.position.multiplyScalar(GLOBE_DIST);
    this.globeCam.lookAt(0, 0, 0);
    this.globeCam.updateMatrixWorld();
    const gu = this.mats.globe.uniforms;
    gu.uCamRight.value.setFromMatrixColumn(this.globeCam.matrixWorld, 0);
    gu.uCamUp.value.setFromMatrixColumn(this.globeCam.matrixWorld, 1);
    gu.uCamFwd.value.setFromMatrixColumn(this.globeCam.matrixWorld, 2).negate();
    gu.uSun.value.copy(f.env.sunDir);
    const pipe = this.ctx.pipeline;
    pipe.renderView(this.ctx.scene, this.globeCam, this.globeRT);
    this.mats.globe.uniforms.tGlobeDepth.value = pipe.u.tSceneDepth.value; // still the globe view's opaque depth
    quad(this.mats.globe, L.gx - half, L.gy - half, L.gx + half, L.gy + half);
    (this.mats.globe.uniforms.uGlobe.value as THREE.Vector3).set(L.gx, L.gy, half);

    // the hoist: pennants re-rank smoothly, their length the ship's share of the planet
    const sim = this.ctx.sim;
    this.order.sort((a, b) => sim.ships[b].share - sim.ships[a].share || a - b);
    const best = Math.max(1e-6, sim.ships[this.order[0]].share);
    const at = (n: string) => this.pennants.getAttribute(n) as THREE.InstancedBufferAttribute;
    const row = at('aRow'), color = at('aColor'), trim = at('aTrim'), flag = at('aFlag');
    const settle = this.progress < 0.05 ? 1 : 1 - Math.exp(-dt * 5);
    for (const [rank, id] of this.order.entries()) {
      const s = sim.ships[id], mine = id === 0;
      this.rowY[id] += (L.top + (rank + 0.5) * L.row - this.rowY[id]) * settle;
      const H = L.row * (mine ? 1.0 : 0.76);
      row.setXYZW(id, L.staff, this.rowY[id], H * 1.3 + (L.reach - H * 1.3) * (s.share / best), H);
      color.setXYZ(id, TEAM[id].r, TEAM[id].g, TEAM[id].b);
      trim.setXYZ(id, this.trim[id].r, this.trim[id].g, this.trim[id].b);
      flag.setXYZ(id, mine ? 1 : 0, s.alive ? 0 : 1, id);
    }
    row.needsUpdate = color.needsUpdate = trim.needsUpdate = flag.needsUpdate = true;
    this.mats.pennant.uniforms.uTime.value = f.t;
    const sr = L.row * 0.42;
    quad(this.mats.star, L.staff - 26 - sr, this.rowY[0] - sr, L.staff - 26 + sr, this.rowY[0] + sr);
    (this.mats.star.uniforms.uStar.value as THREE.Vector3).set(L.staff - 26, this.rowY[0], sr);
  }

  /** Ink the sheet's line art and bake it with the paper into a texture, once per screen size. */
  private bake(L: MenuLayout, dpr: number): void {
    const key = `${L.sw}x${L.sh}@${dpr}`;
    if (key === this.bakedFor) return;
    this.bakedFor = key;
    const W = Math.round(L.sw * dpr), H = Math.round(L.sh * dpr);
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const g = canvas.getContext('2d')!;
    g.scale(dpr, dpr);
    g.translate(-L.sx, -L.sy);
    sheetArt(g, L, 1);
    const art = new THREE.CanvasTexture(canvas);
    art.flipY = false;
    art.colorSpace = THREE.NoColorSpace;
    this.bakeRT.setSize(W, H);
    this.bakeMat.uniforms.tArt.value = art;
    this.bakeMat.uniforms.uSize.value.set(L.sw, L.sh);
    bakeInto(this.ctx.pipeline.renderer, this.bakeMat, this.bakeRT);
    art.dispose();
  }
}

// ---------------------------------------------------------------------------------------------

/** Warm papyrus for DOM surfaces, with a darkened, sun-aged margin. */
const PAPER_CSS = 'radial-gradient(ellipse at 50% 46%, rgba(255,240,205,0.3), rgba(0,0,0,0) 45%, rgba(74,40,14,0.62)),'
  + 'linear-gradient(rgba(214,186,134,0.62), rgba(214,186,134,0.62)),'
  + `url(${papyrusUrl}) center / cover no-repeat #c29a5c;`
  + 'background-blend-mode: normal, normal, luminosity';

function layer(tag: 'div' | 'canvas', css: string): HTMLElement {
  const e = document.createElement(tag);
  e.style.cssText = `position:absolute;${css}`;
  return e;
}

/** A floating compass needle, blued steel to the north, bright steel to the south, on a gilt pivot. */
function drawNeedle(g: CanvasRenderingContext2D, S: number, dpr: number): void {
  const L = S * 0.36, w = S * 0.03;
  g.translate(S / 2, S / 2);
  g.shadowColor = 'rgba(45,22,6,0.45)';
  g.shadowBlur = 10 * dpr;
  g.shadowOffsetX = 5 * dpr;
  g.shadowOffsetY = 8 * dpr;
  for (const [dir, a, b] of [[-1, '#22324f', '#4b6286'], [1, '#b9b2a2', '#efe8d6']] as const) {
    const grad = g.createLinearGradient(-w, 0, w, 0);
    grad.addColorStop(0, a);
    grad.addColorStop(1, b);
    g.fillStyle = grad;
    g.beginPath();
    g.moveTo(0, dir * L);
    g.lineTo(w, 0);
    g.lineTo(-w, 0);
    g.closePath();
    g.fill();
  }
  g.shadowColor = 'transparent';
  g.strokeStyle = PEN.ink;
  g.lineWidth = 1.2 * dpr;
  g.beginPath();
  g.moveTo(0, -L);
  g.lineTo(w, 0);
  g.lineTo(0, L);
  g.lineTo(-w, 0);
  g.closePath();
  g.moveTo(0, -L);
  g.lineTo(0, L);
  g.stroke();
  g.beginPath();
  g.arc(0, 0, w * 1.25, 0, Math.PI * 2);
  const cap = g.createRadialGradient(-w * 0.4, -w * 0.4, 0, 0, 0, w * 1.25);
  cap.addColorStop(0, '#f6d98a');
  cap.addColorStop(1, '#8a5a1c');
  g.fillStyle = cap;
  g.fill();
  g.stroke();
}

/**
 * Wordless loading screen: the rhumb web and a compass rose ink themselves onto papyrus as the world
 * loads while a needle swings over the rose; when the world is ready the needle settles north, the
 * rose flies into the corner where the HUD chart takes its place, and the papyrus fades into the game.
 */
export class Loader {
  /** Resolves once the screen has been painted, so the heavy synchronous build can follow. */
  readonly shown: Promise<void>;
  private readonly root = layer('div', 'inset:0;z-index:10;pointer-events:none;overflow:hidden');
  private readonly paper = layer('div', `inset:0;background:${PAPER_CSS}`);
  private readonly net = layer('canvas', 'inset:0;width:100%;height:100%;mix-blend-mode:multiply') as HTMLCanvasElement;
  private readonly card = layer('div', 'will-change:transform,opacity');
  private readonly rose = layer('canvas', 'inset:0;width:100%;height:100%') as HTMLCanvasElement;
  private readonly needle = layer('canvas', 'inset:0;width:100%;height:100%;will-change:transform') as
    HTMLCanvasElement;
  private readonly swing: Animation;
  private readonly size: number;
  private target = 0;
  private p = 0;
  private drawn = -1;
  private last = performance.now();
  private finished = false;

  constructor() {
    const W = innerWidth, H = innerHeight, dpr = devicePixelRatio, S = (this.size = Math.round(Math.min(W, H) * 0.62));
    this.card.style.cssText += `left:${(W - S) / 2}px;top:${(H - S) / 2}px;width:${S}px;height:${S}px`;
    this.net.width = W * dpr;
    this.net.height = H * dpr;
    this.rose.width = this.rose.height = this.needle.width = this.needle.height = S * dpr;
    drawNeedle(this.needle.getContext('2d')!, S * dpr, dpr);
    this.card.append(this.rose, this.needle);
    this.paper.append(this.net);
    this.root.append(this.paper, this.card);
    document.body.append(this.root);
    // transform animations run on the compositor, so the needle keeps swinging while the world is built
    this.swing = this.needle.animate([{ transform: 'rotate(-17deg)' }, { transform: 'rotate(13deg)' }], {
      duration: 2300, iterations: Infinity, direction: 'alternate', easing: 'ease-in-out',
    });
    requestAnimationFrame(this.frame);
    this.shown = new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(() => done())));
  }

  progress(fraction: number): void {
    this.target = Math.max(this.target, fraction);
  }

  /** The world is ready: finish the last strokes on the way out; the exit runs on the compositor's clock. */
  done(): void {
    this.finished = true;
    this.leave();
  }

  private readonly frame = (now: number) => {
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    // ink follows the loaded fraction; the last strokes wait for the shaders
    const goal = this.finished ? 1 : this.target * 0.92;
    this.p += (goal - this.p) * (1 - Math.exp(-dt * (this.finished ? 9 : 2.5)));
    if (this.p - this.drawn > 0.002) this.draw();
    if (this.root.isConnected) requestAnimationFrame(this.frame);
  };

  private draw(): void {
    this.drawn = this.p;
    const dpr = devicePixelRatio, W = innerWidth, H = innerHeight, S = this.size;
    const g = this.net.getContext('2d')!;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, W, H);
    drawRhumbs(g, W / 2, H / 2, Math.min(W, H) * 0.44, Math.hypot(W, H), 1, ramp(this.p, 0, 0.75));
    const r = this.rose.getContext('2d')!;
    r.setTransform(dpr, 0, 0, dpr, S * dpr / 2, S * dpr / 2);
    r.clearRect(-S / 2, -S / 2, S, S);
    drawRose(r, S * 0.45, 1.3, ramp(this.p, 0.08, 1));
  }

  private leave(): void {
    const hud = hudLayout(innerWidth, innerHeight), k = (hud.r * 0.886) / (this.size * 0.45);
    const from = getComputedStyle(this.needle).transform;
    this.swing.cancel();
    this.needle.animate([{ transform: from }, { transform: 'rotate(0deg)' }], {
      duration: 700, easing: 'cubic-bezier(.3,1.7,.5,1)', fill: 'forwards',
    });
    const to = `translate(${hud.x - innerWidth / 2}px,${hud.y - innerHeight / 2}px) scale(${k})`;
    const flight = [
      { transform: 'none', opacity: 1 }, { transform: to, opacity: 1, offset: 0.78 }, { transform: to, opacity: 0 },
    ];
    this.card.animate(flight, {
      duration: 950, delay: 100, easing: 'cubic-bezier(.6,0,.3,1)', fill: 'forwards',
    });
    const fade = { duration: 700, delay: 150, easing: 'ease-in-out', fill: 'forwards' } as const;
    this.paper.animate([{ opacity: 1 }, { opacity: 0 }], fade);
    setTimeout(() => this.root.remove(), 1100);
  }
}

export class Chart {
  /** true while the globe menu is open (or still rolling up); the match is paused while open */
  open = false;
  private readonly ctx: Ctx;
  private readonly hud: Hud;
  private readonly menu: Menu;
  private readonly overlay = new THREE.Scene();
  private readonly cam = new THREE.OrthographicCamera(0, 1, 0, 1, -1, 1);
  private readonly size = new THREE.Vector2();
  private last: Frame | null = null;
  private shown = -0.5; // the HUD fades in as the loader's rose lands on it

  constructor(ctx: Ctx) {
    this.ctx = ctx;
    const papyrus = loadTexture(papyrusUrl, true);
    papyrus.wrapS = papyrus.wrapT = THREE.MirroredRepeatWrapping;
    this.hud = new Hud(ctx, papyrus);
    this.menu = new Menu(ctx, papyrus);
    this.overlay.add(this.hud.root, this.menu.root);
    // every overlay program (menu, trails, both ship-mark passes) is built now, not when it first appears
    ctx.pipeline.renderer.setRenderTarget(null);
    ctx.pipeline.renderer.compile(this.overlay, this.cam);
    ctx.pipeline.overlays.push((r) => r.render(this.overlay, this.cam));
  }

  toggle(): void {
    this.menu.toggle(this.last);
    this.open = true;
  }

  update(f: Frame): void {
    this.last = f;
    const r = this.ctx.pipeline.renderer;
    r.getSize(this.size);
    const w = this.size.x, h = this.size.y;
    if (this.cam.right !== w || this.cam.bottom !== h) {
      this.cam.right = w;
      this.cam.bottom = h;
      this.cam.updateProjectionMatrix();
    }
    this.menu.update(f, w, h, r.getPixelRatio());
    this.open = this.menu.want || this.menu.progress > 0;
    this.shown = Math.min(1, this.shown + f.dt / 0.8);
    const k = clamp01(this.shown) * (1 - ramp(this.menu.progress, 0, 0.4));
    this.hud.update(f, w, h, r.getPixelRatio(), k * k * (3 - 2 * k));
  }
}

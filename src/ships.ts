// The 21 procedural ships: hulls, masts, yards, rigging, sails, flags and lanterns, their motion on the
// swell, and the sinking and respawn sequences. Also the team palette and emblems.
//
// Each class is built once per level of detail and shared by every ship of that class. A ship owns a
// small bone palette (rudder, a topple and a brace bone per mast, a yaw bone per flag) that all of its
// materials read, so yards swing, the helm turns and masts fall without touching a vertex buffer. The
// rig is drawn as camera-facing ribbons whose two ends ride those bones, with coverage alpha so the
// thinnest lines never shimmer.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { R, HULL_LENGTH, Rng, smoothstep, wind, type ShipClass, type V3 } from './sim.ts';
import { box as craftBox, lathe as craftLathe, tube as craftTube, TANGENT_NORMAL_GLSL, type Sink } from './craft.ts';
import { swell } from './ocean.ts';
import { LAYER, loadTexture } from './post.ts';
import { COMMON_GLSL, POINT_LIGHTS_GLSL, SHADOW_GLSL, applyWeather, type LightSource } from './sky.ts';
import type { Ctx, Frame } from './main.ts';
import hullColorUrl from './assets/wood_hull_color.jpg';
import hullNormalUrl from './assets/wood_hull_normal.jpg';
import deckColorUrl from './assets/wood_deck_color.jpg';
import deckNormalUrl from './assets/wood_deck_normal.jpg';
import ironColorUrl from './assets/iron_color.jpg';
import canvasColorUrl from './assets/canvas_color.jpg';
import canvasNormalUrl from './assets/canvas_normal.jpg';

// ---------------------------------------------------------------------------------------------
// Palette

/** Team colours (sRGB) and emblems. Index = ship id; 0 is the player. */
export const TEAMS: { color: number; trim: number; emblem: Emblem }[] = [
  { color: 0xd8342a, trim: 0xf1c453, emblem: 'sun' },
  { color: 0xf2a51a, trim: 0x7a2e12, emblem: 'cross' },
  { color: 0x2f8f4e, trim: 0xf3e7c9, emblem: 'trefoil' },
  { color: 0x6a3fa0, trim: 0xe8c14a, emblem: 'crown' },
  { color: 0x1fb5b0, trim: 0x173b4d, emblem: 'wave' },
  { color: 0xe46aa6, trim: 0x40203a, emblem: 'rose' },
  { color: 0x2d5fc4, trim: 0xf4efe0, emblem: 'star' },
  { color: 0x9bc43a, trim: 0x2a3a16, emblem: 'chevron' },
  { color: 0x8a1f2d, trim: 0xd9b56b, emblem: 'saltire' },
  { color: 0xf07a2e, trim: 0x1f2a44, emblem: 'crescent' },
  { color: 0xf3ead2, trim: 0xb3262e, emblem: 'quarterly' },
  { color: 0x2b2d36, trim: 0xe2c35a, emblem: 'key' },
  { color: 0xb07a3c, trim: 0x203040, emblem: 'tower' },
  { color: 0x4bb7e8, trim: 0xffffff, emblem: 'anchor' },
  { color: 0x5c7a2a, trim: 0xe9dcb5, emblem: 'fleur' },
  { color: 0xc23b8f, trim: 0xf6d6e6, emblem: 'lozenge' },
  { color: 0x0f6b5c, trim: 0xd8a34a, emblem: 'compass' },
  { color: 0xe9d45a, trim: 0x3a2a12, emblem: 'roundel' },
  { color: 0x7d4a2a, trim: 0xe8d5a8, emblem: 'bend' },
  { color: 0x9aa7b8, trim: 0x8a1f2d, emblem: 'wheel' },
  { color: 0xa86ad8, trim: 0x2c1a40, emblem: 'triangle' },
];
export type Emblem =
  | 'sun' | 'cross' | 'trefoil' | 'crown' | 'wave' | 'rose' | 'star' | 'chevron' | 'saltire' | 'crescent' | 'quarterly'
  | 'key' | 'tower' | 'anchor' | 'fleur' | 'lozenge' | 'compass' | 'roundel' | 'bend' | 'wheel' | 'triangle';

/** Linear-space team colour, for shaders. */
export function teamColor(id: number, out = new THREE.Color()): THREE.Color {
  return out.setHex(TEAMS[id].color, THREE.SRGBColorSpace);
}

/** Rendered state of one ship this frame. Filled by Ships.update(), read by everyone else. */
export interface ShipPose {
  id: number;
  visible: boolean; // afloat, sinking or rising
  pos: THREE.Vector3; // world position of the hull origin (waterline, amidships), swell included
  quat: THREE.Quaternion; // hull orientation: +Y up (deck), +Z forward (bow), +X port (left)
  up: THREE.Vector3; // sphere normal under the ship
  fwd: THREE.Vector3; // heading, tangent to the sphere
  speed: number; // world units / s
  heel: number; // roll about the bow axis, radians; positive lowers the starboard (-X) side
  length: number; // hull length, world units
  sink: number; // 0 afloat … 1 gone (sinking sequence progress)
  rise: number; // 0 surfacing … 1 fully afloat (respawn sequence progress)
}

// Emblems are drawn once into a shared mask atlas (5×5 cells) that sails and ensigns sample.
const ATLAS = 2048, CELLS = 5;

function drawEmblem(g: CanvasRenderingContext2D, e: Emblem): void {
  const TAU = Math.PI * 2;
  const poly = (...p: number[]) => {
    g.moveTo(p[0], p[1]);
    for (let i = 2; i < p.length; i += 2) g.lineTo(p[i], p[i + 1]);
    g.closePath();
  };
  const disc = (x: number, y: number, r: number) => {
    g.moveTo(x + r, y);
    g.arc(x, y, r, 0, TAU);
  };
  const star = (n: number, ro: number, ri: number) => {
    for (let i = 0; i < n * 2; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / n, r = i % 2 ? ri : ro;
      if (i) g.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      else g.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    g.closePath();
  };
  const shield = (k: number) => {
    g.moveTo(-0.78 * k, -0.86 * k);
    g.lineTo(0.78 * k, -0.86 * k);
    g.lineTo(0.78 * k, 0.12 * k);
    g.quadraticCurveTo(0.74 * k, 0.74 * k, 0, 1.0 * k);
    g.quadraticCurveTo(-0.74 * k, 0.74 * k, -0.78 * k, 0.12 * k);
    g.closePath();
  };
  // fill() paints, cut() erases the current path
  const fill = () => { g.fill(); g.beginPath(); };
  const cut = () => {
    g.globalCompositeOperation = 'destination-out';
    g.fill();
    g.globalCompositeOperation = 'source-over';
    g.beginPath();
  };
  const ring = (x: number, y: number, ro: number, ri: number) => {
    disc(x, y, ro);
    fill();
    disc(x, y, ri);
    cut();
  };
  g.beginPath();
  switch (e) {
    case 'sun':
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * TAU, w = 0.13, r = i % 2 ? 0.78 : 0.98;
        poly(Math.cos(a - w) * 0.5, Math.sin(a - w) * 0.5, Math.cos(a) * r, Math.sin(a) * r, Math.cos(a + w) * 0.5, Math.sin(a + w) * 0.5);
      }
      fill();
      ring(0, 0, 0.5, 0.43);
      disc(0, 0, 0.36);
      fill();
      break;
    case 'cross':
      for (let k = 0; k < 4; k++) {
        const c = Math.cos((k * TAU) / 4), s = Math.sin((k * TAU) / 4);
        const p = [-0.14, 0.14, -0.46, 0.96, 0, 0.8, 0.46, 0.96, 0.14, 0.14];
        g.moveTo(p[0] * c - p[1] * s, p[0] * s + p[1] * c);
        for (let i = 2; i < p.length; i += 2) g.lineTo(p[i] * c - p[i + 1] * s, p[i] * s + p[i + 1] * c);
        g.closePath();
      }
      poly(-0.15, -0.15, 0.15, -0.15, 0.15, 0.15, -0.15, 0.15);
      fill();
      break;
    case 'trefoil':
      for (let k = 0; k < 3; k++) {
        const a = -Math.PI / 2 + (k * TAU) / 3;
        disc(Math.cos(a) * 0.36, Math.sin(a) * 0.36 - 0.12, 0.34);
      }
      fill();
      poly(-0.07, 0.2, 0.07, 0.2, 0.16, 0.98, 0.02, 0.98);
      fill();
      break;
    case 'crown':
      poly(-0.78, 0.62, 0.78, 0.62, 0.78, 0.26, 0.92, -0.42, 0.42, -0.02, 0, -0.62, -0.42, -0.02, -0.92, -0.42, -0.78, 0.26);
      fill();
      disc(-0.92, -0.5, 0.11);
      disc(0, -0.72, 0.12);
      disc(0.92, -0.5, 0.11);
      fill();
      for (const x of [-0.45, 0, 0.45]) disc(x, 0.44, 0.08);
      cut();
      poly(-0.78, 0.26, 0.78, 0.26, 0.78, 0.2, -0.78, 0.2);
      cut();
      break;
    case 'wave':
      for (let k = 0; k < 3; k++) {
        const y0 = -0.62 + k * 0.5;
        g.moveTo(-0.95, y0 + 0.24);
        for (let i = 0; i <= 32; i++) {
          const x = -0.95 + (i / 32) * 1.9;
          g.lineTo(x, y0 + 0.13 * Math.sin(x * 5.2 + k * 1.3));
        }
        for (let i = 32; i >= 0; i--) {
          const x = -0.95 + (i / 32) * 1.9;
          g.lineTo(x, y0 + 0.24 + 0.13 * Math.sin(x * 5.2 + k * 1.3));
        }
        g.closePath();
      }
      fill();
      break;
    case 'rose':
      for (let k = 0; k < 5; k++) {
        const a = -Math.PI / 2 + (k * TAU) / 5, b = a + TAU / 10;
        disc(Math.cos(a) * 0.5, Math.sin(a) * 0.5, 0.42);
        poly(Math.cos(b - 0.12) * 0.6, Math.sin(b - 0.12) * 0.6, Math.cos(b) * 0.98, Math.sin(b) * 0.98, Math.cos(b + 0.12) * 0.6, Math.sin(b + 0.12) * 0.6);
      }
      fill();
      g.lineWidth = 0.06;
      g.arc(0, 0, 0.5, 0, TAU);
      g.globalCompositeOperation = 'destination-out';
      g.stroke();
      g.globalCompositeOperation = 'source-over';
      g.beginPath();
      disc(0, 0, 0.18);
      cut();
      disc(0, 0, 0.12);
      fill();
      break;
    case 'star':
      star(5, 0.98, 0.4);
      fill();
      break;
    case 'chevron':
      for (const y of [-0.42, 0.22]) poly(-0.95, y + 0.5, 0, y - 0.32, 0.95, y + 0.5, 0.95, y + 0.82, 0, y, -0.95, y + 0.82);
      fill();
      break;
    case 'saltire':
      for (const s of [1, -1]) {
        const c = Math.SQRT1_2, w = 0.2, l = 0.98;
        poly((-l - w * s) * c, (-l * s + w) * c, (l - w * s) * c, (l * s + w) * c, (l + w * s) * c, (l * s - w) * c, (-l + w * s) * c, (-l * s - w) * c);
      }
      fill();
      break;
    case 'crescent':
      disc(-0.08, 0, 0.9);
      fill();
      disc(0.26, -0.12, 0.74);
      cut();
      star(5, 0.3, 0.12);
      g.translate(0.3, 0.05);
      fill();
      g.translate(-0.3, -0.05);
      break;
    case 'quarterly':
      shield(1);
      fill();
      shield(0.84);
      cut();
      g.save();
      shield(0.84);
      g.clip();
      g.beginPath();
      poly(-1, -1, 0, -1, 0, 0.06, -1, 0.06);
      poly(0, 0.06, 1, 0.06, 1, 1, 0, 1);
      fill();
      g.restore();
      break;
    case 'key':
      ring(0, -0.56, 0.36, 0.19);
      poly(-0.08, -0.22, 0.08, -0.22, 0.08, 0.96, -0.08, 0.96);
      poly(0.08, 0.56, 0.42, 0.56, 0.42, 0.7, 0.08, 0.7);
      poly(0.08, 0.8, 0.32, 0.8, 0.32, 0.94, 0.08, 0.94);
      fill();
      break;
    case 'tower':
      poly(-0.5, -0.42, 0.5, -0.42, 0.56, 0.96, -0.56, 0.96);
      poly(-0.64, -0.56, 0.64, -0.56, 0.64, -0.4, -0.64, -0.4);
      for (let k = 0; k < 4; k++) poly(-0.64 + k * 0.36, -0.9, -0.42 + k * 0.36, -0.9, -0.42 + k * 0.36, -0.54, -0.64 + k * 0.36, -0.54);
      fill();
      poly(-0.18, 0.96, 0.18, 0.96, 0.18, 0.56, -0.18, 0.56);
      disc(0, 0.56, 0.18);
      poly(-0.06, -0.24, 0.06, -0.24, 0.06, 0.12, -0.06, 0.12);
      cut();
      break;
    case 'anchor':
      ring(0, -0.78, 0.18, 0.09);
      poly(-0.07, -0.62, 0.07, -0.62, 0.07, 0.86, -0.07, 0.86);
      poly(-0.48, -0.5, 0.48, -0.5, 0.48, -0.37, -0.48, -0.37);
      fill();
      g.lineWidth = 0.14;
      g.arc(0, 0.2, 0.66, 0.2 * Math.PI, 0.8 * Math.PI);
      g.stroke();
      g.beginPath();
      for (const s of [1, -1]) poly(s * 0.66, 0.14, s * 0.8, 0.5, s * 0.46, 0.5);
      fill();
      break;
    case 'fleur':
      g.moveTo(0, -0.98);
      g.bezierCurveTo(0.3, -0.62, 0.26, -0.18, 0.08, 0.16);
      g.lineTo(-0.08, 0.16);
      g.bezierCurveTo(-0.26, -0.18, -0.3, -0.62, 0, -0.98);
      for (const s of [1, -1]) {
        g.moveTo(s * 0.1, 0.16);
        g.bezierCurveTo(s * 0.18, -0.42, s * 0.98, -0.62, s * 0.86, -0.08);
        g.bezierCurveTo(s * 0.8, 0.14, s * 0.6, 0.1, s * 0.62, -0.06);
        g.bezierCurveTo(s * 0.5, 0.12, s * 0.3, 0.16, s * 0.1, 0.16);
        g.closePath();
        poly(s * 0.06, 0.34, s * 0.48, 0.92, s * 0.26, 0.94, 0, 0.5);
      }
      poly(-0.56, 0.16, 0.56, 0.16, 0.56, 0.34, -0.56, 0.34);
      fill();
      break;
    case 'lozenge':
      poly(0, -0.98, 0.68, 0, 0, 0.98, -0.68, 0);
      fill();
      poly(0, -0.72, 0.5, 0, 0, 0.72, -0.5, 0);
      cut();
      poly(0, -0.44, 0.3, 0, 0, 0.44, -0.3, 0);
      fill();
      break;
    case 'compass':
      // eight kite-shaped points, the cardinals long, inside a ring
      for (let i = 0; i < 8; i++) {
        const a = -Math.PI / 2 + (i * Math.PI) / 4, r = i % 2 ? 0.62 : 0.98, w = i % 2 ? 0.13 : 0.17;
        const c = Math.cos(a), s = Math.sin(a);
        poly(c * r, s * r, c * 0.22 - s * w, s * 0.22 + c * w, 0, 0, c * 0.22 + s * w, s * 0.22 - c * w);
      }
      fill();
      ring(0, 0, 0.56, 0.47);
      disc(0, 0, 0.07);
      cut();
      break;
    case 'roundel':
      ring(0, 0, 0.96, 0.76);
      ring(0, 0, 0.58, 0.38);
      disc(0, 0, 0.2);
      fill();
      break;
    case 'bend':
      shield(1);
      fill();
      shield(0.84);
      cut();
      g.save();
      shield(0.84);
      g.clip();
      g.beginPath();
      g.rotate(Math.PI / 4);
      poly(-1.6, -0.2, 1.6, -0.2, 1.6, 0.2, -1.6, 0.2);
      fill();
      g.restore();
      break;
    case 'wheel':
      ring(0, 0, 0.64, 0.5);
      disc(0, 0, 0.15);
      for (let k = 0; k < 8; k++) {
        const a = (k * TAU) / 8, c = Math.cos(a), s = Math.sin(a);
        poly(-0.045 * s, 0.045 * c, 0.84 * c - 0.045 * s, 0.84 * s + 0.045 * c, 0.84 * c + 0.045 * s, 0.84 * s - 0.045 * c, 0.045 * s, -0.045 * c);
        disc(0.88 * c, 0.88 * s, 0.085);
      }
      fill();
      break;
    case 'triangle':
      poly(0, -0.96, 0.98, 0.8, -0.98, 0.8);
      fill();
      poly(0, 0.8, 0.49, -0.08, -0.49, -0.08);
      cut();
      break;
  }
}

let atlas: THREE.DataTexture | null = null;
/**
 * Shared emblem mask atlas (red channel = coverage): 5×5 cells, team id i in column i % 5, row ⌊i / 5⌋ counted
 * from the top; texture row 0 is the canvas top, so v grows downward.
 */
export function emblemAtlas(): THREE.DataTexture {
  return (atlas ??= drawAtlas());
}

function drawAtlas(): THREE.DataTexture {
  const c = document.createElement('canvas');
  c.width = c.height = ATLAS;
  const g = c.getContext('2d', { willReadFrequently: true })!;
  const cell = ATLAS / CELLS;
  g.fillStyle = '#fff';
  g.strokeStyle = '#fff';
  TEAMS.forEach((t, i) => {
    g.setTransform(cell * 0.44, 0, 0, cell * 0.44, (i % CELLS + 0.5) * cell, (Math.floor(i / CELLS) + 0.5) * cell);
    drawEmblem(g, t.emblem);
  });
  const px = g.getImageData(0, 0, ATLAS, ATLAS).data, a = new Uint8Array(ATLAS * ATLAS);
  for (let i = 0; i < a.length; i++) a[i] = px[i * 4 + 3];
  const tex = new THREE.DataTexture(a, ATLAS, ATLAS, THREE.RedFormat, THREE.UnsignedByteType);
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.anisotropy = 8;
  tex.needsUpdate = true;
  return tex;
}

// ---------------------------------------------------------------------------------------------
// Ship designs. Hull positions are given by u, the fraction of the hull from the stern (0) to the
// bow (1); heights are above the waterline, in world units.

interface DeckSpec { from: number; to: number; rise: number }
interface LateenSpec {
  sling: number; // height where the yard crosses the mast
  len: number; // yard length
  tilt: number; // yard angle above the horizontal (peak aft)
  fore: number; // share of the yard forward of the mast
  clew: number; // clew distance aft of the mast
  clewY: number; // clew height above the deck
}
interface MastSpec {
  u: number;
  rake: number; // radians, positive leans aft
  r: number; // lower-mast radius at the deck
  shrouds: number; // per side
  top: number; // square rig: height of the top; lateen: height of the masthead
  heads: number[]; // square rig: topmast (and topgallant) head heights
  yards: number[]; // square rig: yard half-lengths, course first
  lat?: LateenSpec;
}
interface Spec {
  beam: number; draft: number; rail: number; sheerAft: number; sheerFwd: number; bulwark: number;
  maxY: number; tumble: number; stemRake: number; forefoot: number; sternRake: number; tuck: number;
  transom: number; bowStart: number; sternStart: number;
  decks: DeckSpec[];
  strakes: number; // strakes from the keel to the main rail
  wales: number[]; // strake positions of the wales
  paintFrom: number; // strake above which the upper works are painted
  ports: { strake: number; from: number; to: number; n: number }[];
  balcony: boolean; quarterGalleries: boolean; beak: number; lanterns: number; basket: boolean;
  masts: MastSpec[]; // stern to bow
  sprit: { len: number; angle: number; yard: number } | null;
}

const SPECS: Record<ShipClass, Spec> = {
  galleon: {
    beam: 1.6, draft: 0.62, rail: 0.66, sheerAft: 0.22, sheerFwd: 0.32, bulwark: 0.2, maxY: 0.14, tumble: 0.3,
    stemRake: 0.55, forefoot: 0.5, sternRake: 0.42, tuck: 0.3, transom: 0.66, bowStart: 0.58, sternStart: 0.36,
    decks: [{ from: 0, to: 0.33, rise: 0.3 }, { from: 0, to: 0.15, rise: 0.56 }, { from: 0.82, to: 1, rise: 0.3 }],
    strakes: 18, wales: [9.9, 12.5, 15.1], paintFrom: 15.7,
    ports: [{ strake: 11.2, from: 0.3, to: 0.74, n: 7 }, { strake: 13.8, from: 0.36, to: 0.78, n: 6 }],
    balcony: true, quarterGalleries: true, beak: 1.0, lanterns: 3, basket: false,
    masts: [
      { u: 0.2, rake: 0.06, r: 0.055, shrouds: 3, top: 4.6, heads: [], yards: [], lat: { sling: 3.6, len: 3.1, tilt: 0.62, fore: 0.3, clew: 1.2, clewY: 1.0 } },
      { u: 0.53, rake: 0.04, r: 0.09, shrouds: 6, top: 3.45, heads: [5.15, 6.25], yards: [1.5, 1.08, 0.62] },
      { u: 0.81, rake: -0.02, r: 0.08, shrouds: 5, top: 3.1, heads: [4.62, 5.55], yards: [1.32, 0.94, 0.54] },
    ],
    sprit: { len: 2.6, angle: 0.55, yard: 0.75 },
  },
  carrack: {
    beam: 1.76, draft: 0.6, rail: 0.62, sheerAft: 0.3, sheerFwd: 0.42, bulwark: 0.2, maxY: 0.16, tumble: 0.26,
    stemRake: 0.7, forefoot: 0.45, sternRake: 0.36, tuck: 0.34, transom: 0.6, bowStart: 0.55, sternStart: 0.35,
    decks: [{ from: 0, to: 0.36, rise: 0.36 }, { from: 0, to: 0.17, rise: 0.7 }, { from: 0.76, to: 1, rise: 0.5 }],
    strakes: 17, wales: [9.5, 11.9, 14.4], paintFrom: 15,
    ports: [{ strake: 10.7, from: 0.34, to: 0.7, n: 5 }, { strake: 13.15, from: 0.4, to: 0.72, n: 4 }],
    balcony: true, quarterGalleries: false, beak: 0.5, lanterns: 2, basket: true,
    masts: [
      { u: 0.27, rake: 0.06, r: 0.05, shrouds: 3, top: 4.25, heads: [], yards: [], lat: { sling: 3.25, len: 2.2, tilt: 0.62, fore: 0.3, clew: 0.7, clewY: 0.95 } },
      { u: 0.52, rake: 0.03, r: 0.095, shrouds: 5, top: 3.4, heads: [4.95], yards: [1.62, 1.0] },
      { u: 0.83, rake: -0.02, r: 0.075, shrouds: 4, top: 3.15, heads: [4.3], yards: [1.18, 0.74] },
    ],
    sprit: { len: 2.2, angle: 0.6, yard: 0.65 },
  },
  fluyt: {
    beam: 1.24, draft: 0.55, rail: 0.52, sheerAft: 0.28, sheerFwd: 0.24, bulwark: 0.18, maxY: 0.05, tumble: 0.5,
    stemRake: 0.38, forefoot: 0.38, sternRake: 0.3, tuck: 0.48, transom: 0.34, bowStart: 0.6, sternStart: 0.4,
    decks: [{ from: 0, to: 0.28, rise: 0.26 }, { from: 0, to: 0.11, rise: 0.48 }, { from: 0.86, to: 1, rise: 0.16 }],
    strakes: 15, wales: [8.8, 11.2], paintFrom: 12,
    ports: [{ strake: 10.0, from: 0.32, to: 0.7, n: 5 }],
    balcony: false, quarterGalleries: false, beak: 0.4, lanterns: 1, basket: false,
    masts: [
      { u: 0.18, rake: 0.05, r: 0.05, shrouds: 3, top: 4.2, heads: [], yards: [], lat: { sling: 3.2, len: 2.5, tilt: 0.62, fore: 0.3, clew: 1.0, clewY: 0.9 } },
      { u: 0.5, rake: 0.04, r: 0.08, shrouds: 5, top: 3.25, heads: [4.85, 5.65], yards: [1.28, 0.92, 0.5] },
      { u: 0.8, rake: -0.02, r: 0.07, shrouds: 4, top: 2.9, heads: [4.35, 5.1], yards: [1.12, 0.8, 0.45] },
    ],
    sprit: { len: 2.1, angle: 0.55, yard: 0.6 },
  },
  pinnace: {
    beam: 1.06, draft: 0.42, rail: 0.46, sheerAft: 0.18, sheerFwd: 0.22, bulwark: 0.17, maxY: 0.1, tumble: 0.24,
    stemRake: 0.36, forefoot: 0.32, sternRake: 0.28, tuck: 0.24, transom: 0.62, bowStart: 0.6, sternStart: 0.36,
    decks: [{ from: 0, to: 0.3, rise: 0.24 }, { from: 0.86, to: 1, rise: 0.16 }],
    strakes: 13, wales: [7.3, 9.6], paintFrom: 10.4,
    ports: [{ strake: 8.45, from: 0.32, to: 0.72, n: 4 }],
    balcony: false, quarterGalleries: false, beak: 0.5, lanterns: 1, basket: false,
    masts: [
      { u: 0.2, rake: 0.05, r: 0.04, shrouds: 2, top: 3.5, heads: [], yards: [], lat: { sling: 2.5, len: 1.9, tilt: 0.62, fore: 0.3, clew: 0.8, clewY: 0.75 } },
      { u: 0.52, rake: 0.04, r: 0.065, shrouds: 4, top: 2.45, heads: [3.95], yards: [1.02, 0.72] },
      { u: 0.8, rake: -0.02, r: 0.058, shrouds: 3, top: 2.15, heads: [3.45], yards: [0.88, 0.62] },
    ],
    sprit: { len: 1.5, angle: 0.5, yard: 0.5 },
  },
  caravel: {
    beam: 1.28, draft: 0.5, rail: 0.46, sheerAft: 0.36, sheerFwd: 0.32, bulwark: 0.17, maxY: 0.12, tumble: 0.18,
    stemRake: 0.42, forefoot: 0.4, sternRake: 0.3, tuck: 0.3, transom: 0.6, bowStart: 0.56, sternStart: 0.36,
    decks: [{ from: 0, to: 0.28, rise: 0.28 }],
    strakes: 14, wales: [8.3, 10.5], paintFrom: 11.2,
    ports: [{ strake: 9.4, from: 0.34, to: 0.68, n: 4 }],
    balcony: false, quarterGalleries: false, beak: 0, lanterns: 1, basket: false,
    masts: [
      { u: 0.1, rake: 0.04, r: 0.045, shrouds: 2, top: 3.4, heads: [], yards: [], lat: { sling: 2.4, len: 1.8, tilt: 0.7, fore: 0.3, clew: 0.55, clewY: 0.8 } },
      { u: 0.44, rake: -0.04, r: 0.075, shrouds: 4, top: 4.25, heads: [], yards: [], lat: { sling: 3.25, len: 2.9, tilt: 0.85, fore: 0.2, clew: 0.9, clewY: 0.65 } },
      { u: 0.8, rake: -0.1, r: 0.06, shrouds: 3, top: 3.7, heads: [], yards: [], lat: { sling: 2.7, len: 2.4, tilt: 0.8, fore: 0.28, clew: 0.85, clewY: 0.65 } },
    ],
    sprit: null,
  },
};

// Material zones of the wooden mesh (aInfo.y), shaded in HULL_FRAG.
const PLANK = 0, PAINT = 1, TRIM = 2, GILT = 3, TAR = 4, DECK = 5, SPAR = 6, IRON = 7, GLASS = 8, LAMP = 9, ROPE = 10, DARK = 11, RED = 12;

// Bone palette per ship: root, rudder, a topple and a brace bone per mast, a yaw bone per flag.
const BONES = 16;
const B_RUDDER = 1;
const bMast = (m: number) => 2 + 2 * m;
const bBrace = (m: number) => 3 + 2 * m;
const bFlag = (k: number) => 10 + k; // pennants 0..3 by mast, 4 ensign, 5 jack

// ---------------------------------------------------------------------------------------------
// Geometry builder

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const _a = V(), _b = V(), _c = V(), _d = V(), _e = V();

/** Accumulates the wooden mesh: position, normal, uv (zone-specific coordinates), aInfo (bone, zone, ao, aux). */
class Mesher {
  readonly pos: number[] = [];
  readonly nrm: number[] = [];
  readonly uv: number[] = [];
  readonly info: number[] = [];
  readonly index: number[] = [];
  bone = 0;
  zone = 0;
  aux = 0;

  get n(): number {
    return this.pos.length / 3;
  }

  vert(p: THREE.Vector3, n: THREE.Vector3, u: number, v: number, ao = 1): number {
    this.pos.push(p.x, p.y, p.z);
    this.nrm.push(n.x, n.y, n.z);
    this.uv.push(u, v);
    this.info.push(this.bone, this.zone, ao, this.aux);
    return this.n - 1;
  }

  /** Triangle a b c, wound so its face agrees with the normal at a. */
  tri(a: number, b: number, c: number): void {
    const p = this.pos, n = this.nrm;
    _a.fromArray(p, a * 3);
    _b.fromArray(p, b * 3).sub(_a);
    _c.fromArray(p, c * 3).sub(_a);
    _e.crossVectors(_b, _c);
    if (_e.x * n[a * 3] + _e.y * n[a * 3 + 1] + _e.z * n[a * 3 + 2] >= 0) this.index.push(a, b, c);
    else this.index.push(a, c, b);
  }

  /** Quad a b c d, wound so its face agrees with the vertex normals. */
  quad(a: number, b: number, c: number, d: number): void {
    const p = this.pos, n = this.nrm;
    _a.fromArray(p, a * 3);
    _b.fromArray(p, b * 3).sub(_a);
    _c.fromArray(p, c * 3).sub(_a);
    _d.fromArray(p, d * 3).sub(_a);
    _e.crossVectors(_b, _c).add(_c.cross(_d));
    const s = _e.x * (n[a * 3] + n[c * 3]) + _e.y * (n[a * 3 + 1] + n[c * 3 + 1]) + _e.z * (n[a * 3 + 2] + n[c * 3 + 2]);
    if (s >= 0) this.index.push(a, b, c, a, c, d);
    else this.index.push(a, c, b, a, d, c);
  }

  /**
   * Parametric patch over the samples ss × ts. P writes a position; normals come from central differences
   * of P (pointing to the side given by `out`), uv and ao from callbacks.
   */
  grid(ss: number[], ts: number[], P: (s: number, t: number, o: THREE.Vector3) => void, out: (p: THREE.Vector3) => THREE.Vector3,
    UV: (s: number, t: number, p: THREE.Vector3) => [number, number], AO?: (s: number, t: number) => number): void {
    const base = this.n, p = V(), ps = V(), pt = V(), q = V(), n = V();
    const s0 = ss[0], s1 = ss[ss.length - 1], t0 = ts[0], t1 = ts[ts.length - 1];
    for (const t of ts) {
      for (const s of ss) {
        P(s, t, p);
        const es = (s1 - s0) * 1e-3, et = (t1 - t0) * 1e-3;
        P(Math.min(s + es, s1), t, ps);
        P(Math.max(s - es, s0), t, q);
        ps.sub(q);
        P(s, Math.min(t + et, t1), pt);
        P(s, Math.max(t - et, t0), q);
        pt.sub(q);
        n.crossVectors(ps, pt);
        if (n.lengthSq() < 1e-14) n.copy(out(p));
        n.normalize();
        if (n.dot(out(p)) < 0) n.negate();
        const [u, v] = UV(s, t, p);
        this.vert(p, n, u, v, AO ? AO(s, t) : 1);
      }
    }
    const w = ss.length;
    for (let j = 0; j + 1 < ts.length; j++) {
      for (let i = 0; i + 1 < w; i++) {
        const a = base + j * w + i;
        this.quad(a, a + 1, a + w + 1, a + w);
      }
    }
  }

  /** A craft sink writing into this mesh through m, with the generator's coordinates mapped to uv. */
  private sink(m: THREE.Matrix4 | null, uv: (s: number, t: number, i: number) => readonly [number, number]): Sink {
    const nm = m && new THREE.Matrix3().getNormalMatrix(m);
    return {
      vert: (p, n, s, t, i) => {
        const [u, v] = uv(s, t, i);
        return this.vert(m ? _d.copy(p).applyMatrix4(m) : p, nm ? _e.copy(n).applyMatrix3(nm).normalize() : n, u, v);
      },
      tri: (a, b, c) => this.tri(a, b, c),
    };
  }

  /** Box of size (sx, sy, sz) centred on m's origin; uv in world units on each face. */
  box(m: THREE.Matrix4, sx: number, sy: number, sz: number): void {
    craftBox(this.sink(m, (s, t) => [s, t]), sx, sy, sz);
  }

  /** Box spanning from a to b (its long axis), with cross-section w × h; `up` orients the h side. */
  beam(a: THREE.Vector3, b: THREE.Vector3, w: number, h: number, up = V(0, 1, 0)): void {
    const z = V().subVectors(b, a), len = z.length();
    z.normalize();
    const x = V().crossVectors(up, z);
    if (x.lengthSq() < 1e-8) x.set(1, 0, 0).cross(z);
    x.normalize();
    const y = V().crossVectors(z, x);
    const m = new THREE.Matrix4().makeBasis(x, y, z).setPosition(V().addVectors(a, b).multiplyScalar(0.5));
    this.box(m, w, h, len);
  }

  /** Profile [a0, b0, a1, b1, …] swept along `path`; `side` gives each point's a-axis (b = tangent × side). */
  sweep(path: THREE.Vector3[], side: THREE.Vector3[], prof: number[], closed: boolean): void {
    const base = this.n, np = prof.length / 2, T = V(), S = V(), U = V(), p = V(), n = V();
    let along = 0;
    for (let k = 0; k < path.length; k++) {
      T.subVectors(path[Math.min(k + 1, path.length - 1)], path[Math.max(k - 1, 0)]).normalize();
      S.copy(side[k]).addScaledVector(T, -side[k].dot(T)).normalize();
      U.crossVectors(T, S);
      if (k) along += path[k].distanceTo(path[k - 1]);
      let around = 0;
      for (let i = 0; i < np; i++) {
        const a = prof[i * 2], b = prof[i * 2 + 1];
        const ip = (i + np - 1) % np, inx = (i + 1) % np;
        const i0 = closed || i > 0 ? ip : i, i1 = closed || i < np - 1 ? inx : i;
        const da = prof[i1 * 2] - prof[i0 * 2], db = prof[i1 * 2 + 1] - prof[i0 * 2 + 1];
        n.copy(S).multiplyScalar(db).addScaledVector(U, -da).normalize();
        p.copy(path[k]).addScaledVector(S, a).addScaledVector(U, b);
        if (i) around += Math.hypot(a - prof[i * 2 - 2], b - prof[i * 2 - 1]);
        this.vert(p, n, along, around);
      }
    }
    const rows = closed ? np : np - 1;
    for (let k = 0; k + 1 < path.length; k++) {
      for (let i = 0; i < rows; i++) {
        const a = base + k * np + i, b = base + k * np + ((i + 1) % np);
        this.quad(a, b, b + np, a + np);
      }
    }
  }

  /** Round tapered spar from a to b with radii ra → rb; uv: along, then around. */
  tube(a: THREE.Vector3, b: THREE.Vector3, ra: number, rb: number, seg: number, caps = true): void {
    const around = Math.PI * (ra + rb);
    craftTube(this.sink(null, (s, t, i) => (i < 0 ? [s, t] : [t, s * around])), [a, b], (i) => (i ? rb : ra), seg, caps ? { caps: [0, 0] } : {});
  }

  /** Surface of revolution about m's +Y axis; prof = [r0, y0, r1, y1, …] from bottom to top. */
  lathe(m: THREE.Matrix4, prof: number[], seg: number): void {
    const pts = Array.from({ length: prof.length / 2 }, (_, i) => [prof[i * 2], prof[i * 2 + 1]]);
    craftLathe(this.sink(m, (s, _t, i) => [s * Math.PI * 2 * pts[i][0], pts[i][1]]), pts, seg);
  }

  /** Duplicate everything from vertex v0 / index i0 on, mirrored to the starboard side. */
  mirror(v0: number, i0: number): void {
    const off = this.n - v0, end = this.n, iend = this.index.length;
    for (let v = v0; v < end; v++) {
      this.pos.push(-this.pos[v * 3], this.pos[v * 3 + 1], this.pos[v * 3 + 2]);
      this.nrm.push(-this.nrm[v * 3], this.nrm[v * 3 + 1], this.nrm[v * 3 + 2]);
      this.uv.push(this.uv[v * 2], this.uv[v * 2 + 1]);
      this.info.push(this.info[v * 4], this.info[v * 4 + 1], this.info[v * 4 + 2], this.info[v * 4 + 3]);
    }
    for (let i = i0; i < iend; i += 3) this.index.push(this.index[i] + off, this.index[i + 2] + off, this.index[i + 1] + off);
  }

  build(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nrm, 3));
    g.setAttribute('aUv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('aInfo', new THREE.Float32BufferAttribute(this.info, 4));
    g.setIndex(this.index);
    return g;
  }
}

// ---------------------------------------------------------------------------------------------
// Hull form: the port half of the outer skin as a function of (u, y), with the sheer, castles and decks.

const _fa = V(), _fb = V(), _fc = V(), _fd = V();

class Form {
  readonly s: Spec;
  readonly L: number;
  readonly yk: number; // keel line
  readonly railAft: number;
  readonly railFwd: number;
  constructor(s: Spec, L: number) {
    this.s = s;
    this.L = L;
    this.yk = -s.draft;
    this.railAft = this.rail(0);
    this.railFwd = this.rail(1);
  }

  /** Height of the main rail (sheer line, without castles). */
  sheer(u: number): number {
    const s = this.s;
    return s.rail + (u < 0.45 ? s.sheerAft * ((0.45 - u) / 0.45) ** 2 : s.sheerFwd * ((u - 0.45) / 0.55) ** 2);
  }
  /** Rise of the uppermost deck over u above the main deck. */
  level(u: number): number {
    let r = 0;
    for (const d of this.s.decks) if (u >= d.from - 1e-6 && u <= d.to + 1e-6) r = Math.max(r, d.rise);
    return r;
  }
  /** Castle rails stand at full height over the castle and sweep down just outside it. */
  rail(u: number): number {
    let r = 0;
    for (const d of this.s.decks) {
      const k = d.from <= 0 ? 1 - smoothstep(d.to, d.to + 0.022, u) : smoothstep(d.from - 0.022, d.from, u);
      r = Math.max(r, d.rise * k);
    }
    return this.sheer(u) + r;
  }
  /** Deck levels at the stern, main deck (0) first. */
  sternLevels(): number[] {
    return [0, ...this.s.decks.filter((d) => d.from <= 0).map((d) => d.rise)].sort((a, b) => a - b);
  }
  deck(u: number, rise = this.level(u)): number {
    return this.sheer(u) - this.s.bulwark + rise;
  }
  zFwd(y: number): number {
    const s = this.s, h = this.L / 2;
    return y >= 0 ? h + s.stemRake * Math.pow(y / this.railFwd, 1.25) : h - s.forefoot * (y / s.draft) ** 2;
  }
  zAft(y: number): number {
    return -this.L / 2 - (this.s.sternRake * (y - this.yk)) / (this.railAft - this.yk);
  }
  z(u: number, y: number): number {
    const a = this.zAft(y);
    return a + u * (this.zFwd(y) - a);
  }
  uAt(z: number, y: number): number {
    const a = this.zAft(y);
    return (z - a) / (this.zFwd(y) - a);
  }
  /** Half-breadth of the skin: plan shape along the hull times the section shape at height y. */
  half(u: number, y: number): number {
    const s = this.s;
    const above = smoothstep(s.tuck - 0.28, s.tuck + 0.04, y);
    const flare = smoothstep(-0.3, 0.9, y);
    let plan = 1;
    if (u > s.bowStart) {
      const t = Math.min(1, (u - s.bowStart) / (1 - s.bowStart));
      plan = Math.pow(1 - Math.pow(t, 1.7 + 0.9 * flare), 0.5 + 0.15 * flare);
    } else if (u < s.sternStart) {
      const t = Math.min(1, (s.sternStart - u) / s.sternStart);
      const run = Math.pow(1 - Math.pow(t, 1.9), 0.75);
      const upper = 1 - (1 - s.transom) * Math.pow(t, 1.6);
      plan = run + (upper - run) * above;
    }
    let sec: number;
    if (y < s.maxY) {
      const e = 1.35 + 1.4 * plan, t = Math.min(1, (s.maxY - y) / (s.maxY - this.yk));
      sec = Math.pow(Math.max(0, 1 - Math.pow(t, e)), 1 / e);
    } else sec = 1 - s.tumble * (1 - Math.exp(-(y - s.maxY) * 1.5));
    return 0.5 * s.beam * plan * sec;
  }
  /** Planking coordinate: strakes counted from the keel, following the sheer. */
  strake(u: number, y: number): number {
    return ((y - this.yk) / (this.sheer(u) - this.yk)) * this.s.strakes;
  }
  strakeY(u: number, k: number): number {
    return this.yk + (k / this.s.strakes) * (this.sheer(u) - this.yk);
  }
  at(u: number, y: number, o: THREE.Vector3): THREE.Vector3 {
    return o.set(this.half(u, y), y, this.z(u, y));
  }
  /** Outward normal of the port skin. */
  normal(u: number, y: number, o: THREE.Vector3): THREE.Vector3 {
    this.at(u + 1e-3, y, _fa).sub(this.at(u - 1e-3, y, _fb));
    this.at(u, y + 1e-3, _fc).sub(this.at(u, y - 1e-3, _fd));
    return o.crossVectors(_fc, _fa).normalize();
  }
  /** Port skin point at hull station z and height y, pushed out by `off`. */
  side(z: number, y: number, off: number, o = V()): THREE.Vector3 {
    const u = this.uAt(z, y);
    return this.at(u, y, o).addScaledVector(this.normal(u, y, _fd), off);
  }
}

/** Where the rig meets the hull, collected while the hull is built. */
interface Fittings {
  lamp: THREE.Vector3; // centre of the stern lanterns, where their light is registered
  ensign: THREE.Vector3; // top of the ensign staff
  jack: THREE.Vector3 | null; // top of the jack staff
  sprit: { heel: THREE.Vector3; dir: THREE.Vector3; r: number; len: number } | null;
  rudder: [THREE.Vector3, THREE.Vector3]; // hinge axis, bottom to top
  ports: THREE.Vector4[]; // gunport rows for the shader: first z, spacing, count, strake
}

const TH = 0.05; // bulwark thickness

function stations(f: Form, n: number): number[] {
  const us = new Set<number>();
  for (let i = 0; i <= n; i++) us.add(i / n);
  for (const d of f.s.decks) {
    const aft = d.from <= 0, b = aft ? d.to : d.from;
    for (let k = -2; k <= 6; k++) us.add(Math.min(1, Math.max(0, b + (aft ? k : -k) * 0.0055)));
  }
  return [...us].sort((a, b) => a - b);
}

/** Exposed deck regions: contiguous runs of the same uppermost deck. */
function regions(f: Form): { a: number; b: number; rise: number }[] {
  const out: { a: number; b: number; rise: number }[] = [];
  const cuts = [0, 1, ...f.s.decks.flatMap((d) => [d.from, d.to])].filter((c) => c >= 0 && c <= 1);
  const sorted = [...new Set(cuts)].sort((a, b) => a - b);
  for (let i = 0; i + 1 < sorted.length; i++) {
    const a = sorted[i], b = sorted[i + 1], rise = f.level((a + b) / 2);
    const last = out[out.length - 1];
    if (last && last.rise === rise) last.b = b;
    else out.push({ a, b, rise });
  }
  return out;
}

function hexa(m: Mesher, c: THREE.Vector3[]): void {
  // corners: 0-3 one face (loop), 4-7 the opposite face in the same order
  const faces = [[0, 1, 2, 3], [7, 6, 5, 4], [0, 4, 5, 1], [1, 5, 6, 2], [2, 6, 7, 3], [3, 7, 4, 0]];
  const ctr = V();
  for (const p of c) ctr.addScaledVector(p, 1 / 8);
  for (const f of faces) {
    const n = V().subVectors(c[f[2]], c[f[0]]).cross(V().subVectors(c[f[3]], c[f[1]])).normalize();
    const fc = V().add(c[f[0]]).add(c[f[1]]).add(c[f[2]]).add(c[f[3]]).multiplyScalar(0.25);
    if (n.dot(fc.sub(ctr)) < 0) n.negate();
    const ids = f.map((i, k) => m.vert(c[i], n, k === 1 || k === 2 ? 1 : 0, k >= 2 ? 1 : 0));
    m.quad(ids[0], ids[1], ids[2], ids[3]);
  }
}

/** The hull, its fittings and decoration; returns where the rig attaches. */
function buildHull(m: Mesher, f: Form, lod: number, hero: boolean): Fittings {
  const s = f.s, yk = f.yk, us = stations(f, lod ? 36 : 72), nq = lod ? 14 : 30;
  const qs = Array.from({ length: nq + 1 }, (_, i) => i / nq);
  const outX = () => _e.set(1, 0, 0);
  m.bone = 0;
  const v0 = m.n, i0 = m.index.length;

  // outer skin
  m.zone = PLANK;
  m.aux = 0;
  m.grid(us, qs, (u, q, o) => f.at(u, yk + q * (f.rail(u) - yk), o), outX, (u, _q, p) => [p.z, f.strake(u, p.y)]);

  // transom
  let yt = yk;
  while (f.half(0, yt) < 0.03 * s.beam) yt += 0.01;
  const bulge = 0.035;
  const transomZ = (x: number, y: number) => f.zAft(y) - bulge * (1 - (x / Math.max(f.half(0, y), 1e-3)) ** 2);
  m.aux = 1;
  m.grid(Array.from({ length: 9 }, (_, i) => i / 8), Array.from({ length: lod ? 6 : 12 }, (_, i) => yt + ((f.railAft - yt) * i) / (lod ? 5 : 11)),
    (sx, y, o) => {
      const x = sx * f.half(0, y);
      o.set(x, y, transomZ(x, y));
    }, () => _e.set(0, 0, -1), (_s, y, p) => [p.x, f.strake(0, y)]);

  // inner bulwarks and decks, region by region
  const regs = regions(f);
  for (const r of regs) {
    const ru = us.filter((u) => u > r.a && u < r.b);
    ru.unshift(r.a);
    ru.push(r.b);
    m.zone = RED;
    m.grid(ru, [0, 0.5, 1], (u, t, o) => {
      const y0 = f.deck(u, r.rise), y = y0 + t * (f.rail(u) - y0);
      o.set(f.half(u, y) - TH, y, f.z(u, y));
    }, () => _e.set(-1, 0, 0), (_u, t, p) => [p.z, t * 3], (_u, t) => 0.55 + 0.45 * t);
    m.zone = DECK;
    m.grid(ru, Array.from({ length: lod ? 3 : 7 }, (_, i) => i / (lod ? 2 : 6)), (u, sx, o) => {
      const y = f.deck(u, r.rise);
      const x = sx * (f.half(u, y) - TH);
      o.set(x, y + 0.025 * (1 - sx * sx), f.z(u, y));
    }, () => _e.set(0, 1, 0), (_u, _s, p) => [p.z, p.x], (_u, sx) => 1 - 0.4 * smoothstep(0.7, 1, sx));
  }
  // bulkheads where one deck steps up to the next, with a breastwork rail along the upper edge
  for (let i = 0; i + 1 < regs.length; i++) {
    const a = regs[i], b = regs[i + 1], ub = a.b, lo = Math.min(a.rise, b.rise), hi = Math.max(a.rise, b.rise);
    const y0 = f.deck(ub, lo), y1 = f.deck(ub, hi);
    m.zone = RED;
    m.grid([0, 0.5, 1], [0, 0.5, 1], (sx, t, o) => {
      const y = y0 + t * (y1 - y0);
      o.set(sx * (f.half(ub, y) - TH), y, f.z(ub, y));
    }, () => _e.set(0, 0, a.rise > b.rise ? 1 : -1), (sx, t) => [sx, t * 4]);
    const fwd = a.rise > b.rise ? 1 : -1, yr = y1 + s.bulwark * 0.92, hw = f.half(ub, yr) - TH;
    m.zone = TRIM;
    m.beam(V(0, yr, f.z(ub, yr) + fwd * 0.01), V(hw, yr, f.z(ub, yr) + fwd * 0.01), 0.04, 0.03);
    m.beam(V(0, y1 + 0.02, f.z(ub, y1) + fwd * 0.012), V(hw, y1 + 0.02, f.z(ub, y1) + fwd * 0.012), 0.045, 0.04);
    if (!lod) {
      m.zone = GILT;
      for (let x = 0.05; x < hw - 0.02; x += 0.075) {
        m.lathe(new THREE.Matrix4().makeTranslation(x, y1 + 0.04, f.z(ub, y1) + fwd * 0.01),
          [0.011, 0, 0.016, 0.03, 0.009, 0.06, 0.013, 0.1, 0.012, yr - y1 - 0.055, 0.011, yr - y1 - 0.055], 6);
      }
      // a door into the castle under each break
      if (y1 - y0 > 0.2) {
        const dh = (y1 - y0) * 0.78, dz = f.z(ub, y0) + fwd * 0.012, dx = Math.min(0.3, (f.half(ub, y0) - TH) * 0.5);
        m.zone = PLANK;
        m.aux = 1;
        m.box(new THREE.Matrix4().makeTranslation(dx, y0 + dh / 2, dz), 0.13, dh, 0.02);
        m.zone = TRIM;
        m.beam(V(dx - 0.075, y0, dz + fwd * 0.01), V(dx - 0.075, y0 + dh + 0.02, dz + fwd * 0.01), 0.022, 0.022, V(0, 0, 1));
        m.beam(V(dx + 0.075, y0, dz + fwd * 0.01), V(dx + 0.075, y0 + dh + 0.02, dz + fwd * 0.01), 0.022, 0.022, V(0, 0, 1));
        m.beam(V(dx - 0.09, y0 + dh + 0.02, dz + fwd * 0.01), V(dx + 0.09, y0 + dh + 0.02, dz + fwd * 0.01), 0.03, 0.025);
      }
    }
  }

  // rail cap along the whole sheer
  m.zone = TRIM;
  {
    const path: THREE.Vector3[] = [], side: THREE.Vector3[] = [];
    for (const u of us) {
      const y = f.rail(u);
      path.push(V(f.half(u, y) - TH / 2, y, f.z(u, y)));
      side.push(f.normal(u, y, V()).setY(0).normalize());
    }
    const w = TH / 2 + 0.014;
    m.sweep(path, side, [-w, -0.004, w, -0.004, w, 0.02, w - 0.012, 0.032, -w + 0.012, 0.032, -w, 0.02], true);
  }

  // wales: heavy tarred bands following the sheer
  m.zone = TAR;
  for (const k of s.wales) {
    const path: THREE.Vector3[] = [], side: THREE.Vector3[] = [];
    for (const u of us) {
      if (u > 0.995) continue;
      const y = f.strakeY(u, k);
      path.push(f.at(u, y, V()));
      side.push(f.normal(u, y, V()));
    }
    const h = (0.42 * (s.rail - yk)) / s.strakes, t = 0.035;
    m.sweep(path, side, [-0.01, -h, t * 0.8, -h, t, -h * 0.5, t, h * 0.5, t * 0.8, h, -0.01, h], false);
  }
  // fashion pieces: mouldings down the transom corners, covering the wale ends
  m.zone = TRIM;
  {
    const path: THREE.Vector3[] = [], side: THREE.Vector3[] = [];
    for (let i = 0; i <= 10; i++) {
      const y = yt + ((f.railAft - yt) * i) / 10;
      path.push(V(f.half(0, y), y, f.zAft(y)));
      side.push(V(1, 0, -0.6).normalize());
    }
    m.sweep(path, side, [-0.03, -0.03, 0.05, -0.03, 0.05, 0.04, -0.03, 0.04], true);
  }

  // gunports: painted openings (shader), lids hinged open above them and the muzzles run out
  const ports: THREE.Vector4[] = [];
  for (const row of s.ports) {
    const y = f.strakeY((row.from + row.to) / 2, row.strake);
    const za = f.z(row.from, y), zb = f.z(row.to, y), dz = (zb - za) / row.n;
    ports.push(new THREE.Vector4(za + dz / 2, dz, row.n, row.strake));
    if (lod > 1) continue;
    for (let k = 0; k < row.n; k++) {
      const z = za + dz * (k + 0.5), u = f.uAt(z, y), yc = f.strakeY(u, row.strake);
      const n = f.normal(u, yc, V()), p = f.at(u, yc, V());
      const ph = 0.6 * ((s.rail - yk) / s.strakes) * 2;
      const top = V().copy(p).setY(yc + ph / 2 + 0.008).addScaledVector(n, 0.01);
      const lid = new THREE.Matrix4().makeBasis(V(0, 0, -1), V().crossVectors(n, V(0, 0, -1)), n);
      const at = new THREE.Matrix4().makeTranslation(top.x, top.y, top.z).multiply(lid).multiply(new THREE.Matrix4().makeRotationX(-1.15));
      m.zone = PAINT;
      m.box(at.clone().multiply(new THREE.Matrix4().makeTranslation(0, -ph / 2, 0.006)), 0.115, ph, 0.012);
      m.zone = RED;
      m.box(at.clone().multiply(new THREE.Matrix4().makeTranslation(0, -ph / 2, -0.006)), 0.11, ph - 0.006, 0.012);
      m.zone = IRON;
      const bore = V().copy(p).setY(yc - ph * 0.08);
      m.tube(V().copy(bore).addScaledVector(n, -0.04), V().copy(bore).addScaledVector(n, 0.1), 0.024, 0.02, 8);
      if (!lod) m.tube(V().copy(bore).addScaledVector(n, 0.085), V().copy(bore).addScaledVector(n, 0.11), 0.027, 0.027, 8);
    }
  }

  m.mirror(v0, i0);

  // centre-line timbers: keel, stem, sternpost
  m.zone = TAR;
  m.aux = 1;
  m.beam(V(0, yk - 0.03, f.zAft(yk) - 0.03), V(0, yk - 0.03, f.zFwd(yk) + 0.02), 0.075, 0.075);
  {
    const path: THREE.Vector3[] = [], side: THREE.Vector3[] = [];
    const top = f.railFwd + 0.18;
    for (let i = 0; i <= 16; i++) {
      const y = yk + ((top - yk) * i) / 16;
      path.push(V(0, y, f.zFwd(y) - 0.012));
      side.push(V(1, 0, 0));
    }
    m.sweep(path, side, [-0.036, -0.03, 0.036, -0.03, 0.036, 0.06, -0.036, 0.06], true);
  }
  const post0 = V(0, yk - 0.05, f.zAft(yk) - 0.02), post1 = V(0, s.tuck + 0.12, f.zAft(s.tuck + 0.12) - 0.02);
  m.beam(post0, post1, 0.07, 0.06, V(0, 0, -1));

  // rudder, hung on the sternpost
  {
    m.bone = B_RUDDER;
    m.zone = PLANK;
    const ax = V().subVectors(post1, post0).normalize(), aft = V(0, -ax.z, ax.y).multiplyScalar(-1);
    if (aft.z > 0) aft.negate();
    const lo = V().copy(post0).addScaledVector(ax, 0.06), hi = V().copy(post1).addScaledVector(ax, -0.02);
    const wb = 0.34 * (f.L / 5.8), wt = 0.13 * (f.L / 5.8), t = 0.032;
    const c = [V().copy(lo), V().copy(lo).addScaledVector(aft, wb), V().copy(hi).addScaledVector(aft, wt), V().copy(hi)];
    hexa(m, [...c.map((p) => V().copy(p).setX(t)), ...c.map((p) => V().copy(p).setX(-t * 0.6))]);
    m.zone = IRON;
    for (let k = 1; k <= 3; k++) {
      const p = V().lerpVectors(lo, hi, k / 4);
      m.beam(V().copy(p).addScaledVector(aft, -0.05), V().copy(p).addScaledVector(aft, (wb + (wt - wb) * (k / 4)) * 0.55), t * 2 + 0.012, 0.02);
    }
    m.bone = 0;
  }

  // stern: lantern-lit windows in tiers between the decks, gilt pilasters and mouldings, a balcony,
  // the carved taffrail and its lanterns
  const ra = f.railAft, xT = (y: number) => f.half(0, y) * 0.86;
  const tn = V(0, -(s.sternRake / (ra - yk)), -1).normalize();
  const onT = (x: number, y: number, out: number) => V(x, y, transomZ(x, y)).addScaledVector(tn, out);
  const frame = (p: THREE.Vector3) => new THREE.Matrix4().makeBasis(V(1, 0, 0), V().crossVectors(tn, V(1, 0, 0)), tn).setPosition(p);
  const levels = f.sternLevels();
  const rnd = new Rng(Math.round(f.L * 1000));
  levels.slice(0, -1).forEach((lv, k) => {
    const y0 = f.deck(0, lv) + 0.05, y1 = f.deck(0, levels[k + 1]) - 0.03, yc = (y0 + y1) / 2, X = xT(yc);
    const wh = Math.min(0.2, y1 - y0 - 0.05), n = Math.max(2, Math.floor((2 * X) / 0.21)), step = (2 * X) / n;
    for (let j = 0; j < n; j++) {
      const x = -X + step * (j + 0.5);
      m.zone = GLASS;
      m.aux = rnd.next();
      m.box(frame(onT(x, yc, 0.004)), step * 0.62, wh, 0.016);
      m.aux = 1;
      if (lod > 1) continue;
      m.zone = GILT;
      const p = onT(x, yc, 0.012);
      m.box(frame(p), 0.014, wh, 0.02);
      m.box(frame(p), step * 0.62, 0.014, 0.02);
      m.box(frame(V().copy(p).setY(yc + wh / 2 + 0.008)), step * 0.7, 0.016, 0.026);
      m.box(frame(V().copy(p).setY(yc - wh / 2 - 0.008)), step * 0.7, 0.016, 0.026);
    }
    m.zone = GILT;
    for (let j = 0; j <= n; j++) m.box(frame(onT(-X + step * j, yc, 0.012)), 0.028, y1 - y0, 0.03);
    m.zone = TRIM;
    for (const y of [y0 - 0.015, y1 + 0.015]) {
      const path: THREE.Vector3[] = [], side: THREE.Vector3[] = [];
      for (let i = 0; i <= 8; i++) {
        const x = f.half(0, y) * (-1 + i / 4);
        path.push(V(x, y, transomZ(x, y)));
        side.push(tn);
      }
      m.sweep(path, side, [-0.01, -0.018, 0.035, -0.018, 0.035, 0.018, -0.01, 0.018], true);
    }
    if (k === 0 && s.balcony && lod < 2) {
      // stern walk: platform on brackets, balustrade
      const yb = y0 - 0.035, d = 0.17, Xb = f.half(0, yb) * 0.92, zb = transomZ(0, yb);
      m.zone = TRIM;
      m.box(new THREE.Matrix4().makeTranslation(0, yb, zb - d / 2), 2 * Xb, 0.03, d);
      m.beam(V(-Xb, yb + 0.15, zb - d + 0.01), V(Xb, yb + 0.15, zb - d + 0.01), 0.03, 0.022);
      for (const sx of [-1, 1]) m.beam(V(sx * Xb, yb + 0.15, zb - d + 0.01), V(sx * Xb, yb + 0.15, transomZ(sx * Xb, yb + 0.15)), 0.026, 0.022);
      m.zone = GILT;
      if (!lod) {
        for (let x = -Xb + 0.03; x < Xb; x += 0.05) {
          m.lathe(new THREE.Matrix4().makeTranslation(x, yb + 0.015, zb - d + 0.01), [0.009, 0, 0.014, 0.025, 0.007, 0.06, 0.012, 0.1, 0.01, 0.125, 0, 0.125], 6);
        }
      }
      for (const x of [-Xb * 0.7, 0, Xb * 0.7]) m.beam(V(x, yb - 0.14, transomZ(x, yb - 0.14)), V(x, yb - 0.01, zb - d * 0.8), 0.03, 0.03, V(1, 0, 0));
    }
  });
  // taffrail: a carved arch over the transom
  const archH = 0.14 * (f.L / 5.8) + 0.04, Xa = f.half(0, ra) * 0.95;
  const archY = (x: number) => ra + archH * Math.pow(Math.max(0, 1 - (x / Xa) ** 2), 0.6);
  m.zone = PAINT;
  m.grid(Array.from({ length: 13 }, (_, i) => -1 + i / 6), [0, 1], (sx, t, o) => {
    const x = sx * Xa, y = ra - 0.02 + t * (archY(x) - ra + 0.02);
    o.set(x, y, transomZ(x, Math.min(y, ra)));
  }, () => _e.copy(tn), (sx, t) => [sx, t]);
  m.zone = GILT;
  {
    const path: THREE.Vector3[] = [], side: THREE.Vector3[] = [];
    for (let i = 0; i <= 16; i++) {
      const x = Xa * (-1 + i / 8);
      path.push(V(x, archY(x), transomZ(x, ra)));
      side.push(V(0, 1, 0));
    }
    m.sweep(path, side, [-0.02, -0.03, 0.02, -0.03, 0.025, 0.03, -0.025, 0.03], true);
    m.lathe(frame(onT(0, ra + archH * 0.45, 0)).multiply(new THREE.Matrix4().makeRotationX(Math.PI / 2)),
      [0, 0, 0.07, 0.0, 0.075, 0.015, 0.055, 0.03, 0.03, 0.04, 0, 0.042], 12);
  }
  // lanterns on iron brackets over the taffrail
  const lanterns: THREE.Vector3[] = [];
  const xs = s.lanterns === 1 ? [0] : s.lanterns === 2 ? [-0.62, 0.62] : [0, -0.7, 0.7];
  for (const k of xs) {
    const x = k * Xa, big = (k === 0 && hero ? 1.35 : 1) * (0.8 + 0.2 * (f.L / 5.8));
    const base = V(x, archY(x) + 0.02, transomZ(x, ra) - 0.02), bottom = V(x, base.y + 0.1 * big, base.z - 0.16 * big);
    m.zone = IRON;
    m.tube(base, V(x, bottom.y - 0.01, base.z - 0.04), 0.012, 0.012, 6);
    m.tube(V(x, bottom.y - 0.01, base.z - 0.04), V().copy(bottom).setY(bottom.y + 0.01), 0.012, 0.01, 6);
    const L = new THREE.Matrix4().makeTranslation(bottom.x, bottom.y, bottom.z).scale(V(big, big, big));
    m.lathe(L, [0, -0.04, 0.012, -0.03, 0.02, 0.0, 0.058, 0.04, 0.062, 0.05], 8);
    m.zone = LAMP;
    m.lathe(L, [0.056, 0.05, 0.066, 0.11, 0.058, 0.17], 8);
    m.zone = GILT;
    m.lathe(L, [0.06, 0.17, 0.072, 0.18, 0.052, 0.21, 0.026, 0.24, 0.012, 0.26, 0.022, 0.275, 0, 0.29], 8);
    if (lod < 2) {
      m.zone = IRON;
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2, c = V(Math.cos(a) * 0.064, 0, Math.sin(a) * 0.064).multiplyScalar(big).add(bottom);
        m.beam(V().copy(c).setY(bottom.y + 0.05 * big), V().copy(c).setY(bottom.y + 0.17 * big), 0.008, 0.008);
      }
    }
    lanterns.push(V(bottom.x, bottom.y + 0.11 * big, bottom.z));
  }
  // ensign staff stepped on the poop just inboard of the taffrail
  m.zone = SPAR;
  const staff = V(0, f.deck(0.02), transomZ(0, ra) + 0.07);
  const ensign = V(0, ra + 1.15 * Math.max(0.8, f.L / 5.8), staff.z);
  m.tube(staff, ensign, 0.016, 0.01, 6);
  m.zone = GILT;
  m.lathe(new THREE.Matrix4().makeTranslation(ensign.x, ensign.y, ensign.z), [0, 0, 0.022, 0.01, 0.02, 0.03, 0, 0.04], 8);

  // beakhead: a pointed platform ahead of the stem with head rails, the knee beneath and a carved finial
  if (s.beak > 0) {
    const yb = f.deck(0.97, 0), zs = f.zFwd(yb), zt = zs + s.beak * 0.85, yt = yb + 0.12, u0 = 0.9;
    const z0 = f.z(u0, yb), hw = f.half(u0, yb) - 0.03;
    m.zone = DECK;
    const A = V(0, yb, z0), B = V(hw, yb, z0), C = V(0, yt, zt), dn = V(0, -0.035, 0);
    for (const sx of [1, -1]) {
      const b = V().copy(B).setX(sx * hw);
      hexa(m, [A, b, C, C, V().copy(A).add(dn), V().copy(b).add(dn), V().copy(C).add(dn), V().copy(C).add(dn)]);
    }
    if (lod < 2) {
      m.zone = TRIM;
      for (const sx of [1, -1]) {
        for (const [y, zf] of [[yb + 0.36, 0.86], [yb + 0.16, 0.92]]) {
          const p0 = V(sx * f.half(zf, y), y, f.z(zf, y)), p3 = V(sx * 0.03, yt + 0.02, zt - 0.06);
          const p1 = V(p0.x * 0.9, y - 0.05, p0.z + 0.35 * s.beak), p2 = V(sx * 0.12, yt + 0.12, zt - 0.3 * s.beak);
          const path: THREE.Vector3[] = [], side: THREE.Vector3[] = [];
          for (let i = 0; i <= 10; i++) {
            const t = i / 10, it = 1 - t;
            path.push(V().addScaledVector(p0, it * it * it).addScaledVector(p1, 3 * it * it * t).addScaledVector(p2, 3 * it * t * t).addScaledVector(p3, t * t * t));
            side.push(V(sx, 0, 0));
          }
          const r = 0.016;
          m.sweep(path, side, Array.from({ length: 6 }, (_, i) => [Math.cos((i / 6) * Math.PI * 2) * r, Math.sin((i / 6) * Math.PI * 2) * r]).flat(), true);
        }
      }
    }
    // knee of the head: a cutwater curving from the forefoot up under the beak
    m.zone = TAR;
    for (let i = 0; i < 10; i++) {
      const seg = (k: number) => {
        const t = k / 10, y = -0.1 + t * (yt - 0.04 + 0.1), back = f.zFwd(y) - 0.03;
        const front = Math.max(back + 0.06, Math.min(zt - 0.05, f.zFwd(y) + 0.05 + (zt - 0.05 - f.zFwd(y)) * Math.pow(t, 2.5)));
        return [V(0.032, y, back), V(0.032, y, front), V(-0.032, y, front), V(-0.032, y, back)];
      };
      hexa(m, [...seg(i), ...seg(i + 1)]);
    }
    m.zone = GILT;
    const fin = new THREE.Matrix4().makeTranslation(0, yt - 0.03, zt - 0.02).multiply(new THREE.Matrix4().makeRotationX(0.9));
    m.lathe(fin, [0, 0, 0.035, 0.015, 0.05, 0.05, 0.03, 0.09, 0.04, 0.12, 0.02, 0.15, 0, 0.16], 10);
  }

  // bowsprit with its gammoning, spritsail yard and jack staff
  let sprit: Fittings['sprit'] = null, jack: THREE.Vector3 | null = null;
  if (s.sprit) {
    const uh = 0.9, yh = f.deck(uh) + 0.07, len = s.sprit.len, r = 0.026 * len;
    const heel = V(0, yh, f.z(uh, yh)), dir = V(0, Math.sin(s.sprit.angle), Math.cos(s.sprit.angle));
    const tip = V().copy(heel).addScaledVector(dir, len);
    m.zone = SPAR;
    m.tube(heel, tip, r, r * 0.55, lod > 1 ? 6 : 10);
    if (lod < 2) {
      m.zone = ROPE;
      const tg = (f.zFwd(f.railFwd) - heel.z) / dir.z;
      for (const d of [-0.08, -0.03, 0.02]) m.tube(V().copy(heel).addScaledVector(dir, tg + d), V().copy(heel).addScaledVector(dir, tg + d + 0.03), r + 0.012, r + 0.012, 8);
    }
    jack = V().copy(tip).setY(tip.y + 0.42 * (len / 2.6));
    m.zone = SPAR;
    m.tube(V().copy(tip).addScaledVector(dir, -0.06), jack, 0.012, 0.009, 6);
    sprit = { heel, dir, r, len };
  }
  const lamp = lanterns.reduce((c, l) => c.addScaledVector(l, 1 / lanterns.length), V());
  return { lamp, ensign, jack, sprit, rudder: [post0, post1], ports };
}

// ---------------------------------------------------------------------------------------------
// Sails: a grid per sail in its rest (unbillowed) shape. The vertex shader bellies it along the rest
// normal by the mast's fill state; tangents let it rebuild the normal of the deformed cloth.

class SailMesher {
  readonly pos: number[] = [];
  readonly nrm: number[] = [];
  readonly uv: number[] = [];
  readonly tu: number[] = [];
  readonly tv: number[] = [];
  readonly sail: number[] = []; // mast slot, lateen, belly depth, carries the emblem
  readonly crease: number[] = []; // lateen: distance past the mast along the cloth, room before the mast
  readonly emb: number[] = []; // position in emblem space (unit radius), as seen from aft / from port
  readonly index: number[] = [];

  private patch(nu: number, nv: number, P: (u: number, v: number, o: THREE.Vector3) => void, info: number[],
    crease: (p: THREE.Vector3) => [number, number], emb: (p: THREE.Vector3) => [number, number]): void {
    const base = this.pos.length / 3, p = V(), a = V(), b = V(), du = V(), dv = V(), n = V();
    for (let j = 0; j <= nv; j++) {
      for (let i = 0; i <= nu; i++) {
        const u = i / nu, v = j / nv, e = 1e-3;
        P(u, v, p);
        P(Math.min(u + e, 1), v, a);
        P(Math.max(u - e, 0), v, b);
        du.subVectors(a, b).divideScalar(Math.min(u + e, 1) - Math.max(u - e, 0));
        P(u, Math.min(v + e, 1), a);
        P(u, Math.max(v - e, 0), b);
        dv.subVectors(a, b).divideScalar(Math.min(v + e, 1) - Math.max(v - e, 0));
        n.crossVectors(du, dv).normalize();
        this.pos.push(p.x, p.y, p.z);
        this.nrm.push(n.x, n.y, n.z);
        this.uv.push(u, v);
        this.tu.push(du.x, du.y, du.z);
        this.tv.push(dv.x, dv.y, dv.z);
        this.sail.push(...info);
        this.crease.push(...crease(p));
        this.emb.push(...emb(p));
      }
    }
    for (let j = 0; j < nv; j++) {
      for (let i = 0; i < nu; i++) {
        const a0 = base + j * (nu + 1) + i;
        this.index.push(a0, a0 + nu + 1, a0 + 1, a0 + 1, a0 + nu + 1, a0 + nu + 2);
      }
    }
  }

  /** Square sail from its head corners (port, starboard) to its clews; roach lifts the middle of the foot. */
  square(hp: THREE.Vector3, hs: THREE.Vector3, fp: THREE.Vector3, fs: THREE.Vector3, roach: number, slot: number,
    depth: number, emblem: boolean, nu: number, nv: number): void {
    const h = V(), ft = V();
    const ctr = V().lerpVectors(hp, fs, 0.5).setY(hp.y + (fp.y + roach - hp.y) * 0.46);
    const size = 0.36 * Math.min(hp.distanceTo(hs), hp.y - fp.y - roach * 0.5);
    this.patch(nu, nv, (u, v, o) => {
      h.lerpVectors(hp, hs, u);
      ft.lerpVectors(fp, fs, u);
      ft.y += roach * Math.sin(Math.PI * u);
      o.lerpVectors(h, ft, v);
    }, [slot, 0, depth, emblem ? 1 : 0], () => [9, 9], (p) => [(ctr.x - p.x) / size, (ctr.y - p.y) / size]);
  }

  /** Lateen sail: luff along the yard from tack to peak, clew aft and low. */
  lateen(tack: THREE.Vector3, peak: THREE.Vector3, clew: THREE.Vector3, slot: number, depth: number,
    nu: number, nv: number, crease: (p: THREE.Vector3) => [number, number]): void {
    const l = V();
    const a = tack.distanceTo(peak), b = peak.distanceTo(clew), c = clew.distanceTo(tack);
    const area = 0.5 * V().subVectors(peak, tack).cross(V().subVectors(clew, tack)).length();
    const ctr = V().add(tack).add(peak).add(clew).multiplyScalar(1 / 3), size = (1.25 * area) / (a + b + c);
    this.patch(nu, nv, (u, v, o) => o.lerpVectors(l.lerpVectors(tack, peak, u), clew, v * 0.999), [slot, 1, depth, 1], crease,
      (p) => [(ctr.z - p.z) / size, (ctr.y - p.y) / size]);
  }

  build(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nrm, 3));
    g.setAttribute('aUv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('aTu', new THREE.Float32BufferAttribute(this.tu, 3));
    g.setAttribute('aTv', new THREE.Float32BufferAttribute(this.tv, 3));
    g.setAttribute('aSail', new THREE.Float32BufferAttribute(this.sail, 4));
    g.setAttribute('aCrease', new THREE.Float32BufferAttribute(this.crease, 2));
    g.setAttribute('aEmb', new THREE.Float32BufferAttribute(this.emb, 2));
    g.setIndex(this.index);
    return g;
  }
}

/** One line of the rig: its ends ride bones; `mask` lists the masts whose fall parts it. */
interface Rope { a: THREE.Vector3; ba: number; b: THREE.Vector3; bb: number; r: number; sag: number; tar: boolean; mask: number }

function buildLines(ropes: Rope[]): THREE.BufferGeometry {
  const A: number[] = [], B: number[] = [], L: number[] = [], M: number[] = [], index: number[] = [];
  for (const r of ropes) {
    const seg = r.sag > 0 ? 6 : 1, base = A.length / 3;
    for (let k = 0; k <= seg; k++) {
      for (const side of [-1, 1]) {
        A.push(r.a.x, r.a.y, r.a.z);
        B.push(r.b.x, r.b.y, r.b.z);
        L.push(k / seg, side, r.r, r.sag);
        M.push(r.ba, r.bb, r.tar ? 1 : 0, r.mask);
      }
      if (k) {
        const i = base + (k - 1) * 2;
        index.push(i, i + 1, i + 3, i, i + 3, i + 2);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  // three needs a position attribute to count vertices; the shader builds positions from aA/aB
  g.setAttribute('position', new THREE.Float32BufferAttribute(A, 3));
  g.setAttribute('aB', new THREE.Float32BufferAttribute(B, 3));
  g.setAttribute('aL', new THREE.Float32BufferAttribute(L, 4));
  g.setAttribute('aM', new THREE.Float32BufferAttribute(M, 4));
  g.setIndex(index);
  return g;
}

/** A flag's hoist point and size; it streams along -Z from there in its rest pose. */
interface FlagMount { at: THREE.Vector3; bone: number; type: number; len: number; wid: number }

function buildFlags(mounts: FlagMount[], lod: number): THREE.BufferGeometry {
  const P: number[] = [], N: number[] = [], U: number[] = [], F: number[] = [], index: number[] = [];
  const nu = lod ? 6 : 18, nv = lod ? 1 : 3;
  for (const fm of mounts) {
    const base = P.length / 3;
    for (let j = 0; j <= nv; j++) {
      for (let i = 0; i <= nu; i++) {
        const u = i / nu, v = j / nv, taper = fm.type === 0 ? 1 - 0.6 * u : 1;
        P.push(fm.at.x, fm.at.y - fm.wid * (0.5 + (v - 0.5) * taper), fm.at.z - fm.len * u);
        N.push(1, 0, 0);
        U.push(u, v);
        F.push(fm.bone, fm.type, fm.len, fm.wid);
      }
    }
    for (let j = 0; j < nv; j++) {
      for (let i = 0; i < nu; i++) {
        const a = base + j * (nu + 1) + i;
        index.push(a, a + 1, a + nu + 2, a, a + nu + 2, a + nu + 1);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
  g.setAttribute('aUv', new THREE.Float32BufferAttribute(U, 2));
  g.setAttribute('aFlag', new THREE.Float32BufferAttribute(F, 4));
  g.setIndex(index);
  return g;
}

/** Geometry of one mast in its rest pose. */
class Mast {
  readonly foot: THREE.Vector3;
  readonly dir: THREE.Vector3; // up the lower mast
  readonly fwd: THREE.Vector3; // forward, perpendicular to the mast
  readonly sc: number; // size relative to a galleon's mainmast
  readonly square: boolean;
  truck = V(); // pennant hoist
  head = V(); // lateen: front of the masthead band (halyard, braces from forward)
  stays: THREE.Vector3[] = []; // where this mast's stays leave it, lowest first
  lands: THREE.Vector3[] = []; // where the stays from the mast aft land on it: deck, lower cap, topmast head
  // lateen yard
  tack = V();
  peak = V();
  clew = V();
  yards: THREE.Vector3[] = []; // square rig: yard centres, course first
  readonly s: MastSpec;
  readonly i: number;
  constructor(f: Form, s: MastSpec, i: number) {
    this.s = s;
    this.i = i;
    const y = f.deck(s.u);
    this.foot = V(0, y, f.z(s.u, y));
    this.dir = V(0, Math.cos(s.rake), -Math.sin(s.rake));
    this.fwd = V(0, Math.sin(s.rake), Math.cos(s.rake));
    this.square = !s.lat;
    this.sc = s.lat ? s.lat.len / 3.4 : s.yards[0] / 1.5;
  }
  at(y: number, o = V()): THREE.Vector3 {
    return o.copy(this.foot).addScaledVector(this.dir, (y - this.foot.y) / this.dir.y);
  }
  r(y: number): number {
    return this.s.r * (1 - (0.24 * (y - this.foot.y)) / (this.s.top - this.foot.y));
  }
}

const mask = (...ms: number[]) => ms.reduce((a, m) => a | (1 << m), 0);

/** Masts, yards, tops, sails, standing and running rigging, pennants. */
function buildRig(f: Form, fit: Fittings, lod: number, hm: Mesher, sm: SailMesher, ropes: Rope[], flags: FlagMount[]): Mast[] {
  const s = f.s, masts = s.masts.map((ms, i) => new Mast(f, ms, i));
  const nu = lod > 1 ? 4 : lod ? 8 : 16, nv = lod > 1 ? 3 : lod ? 6 : 14, seg = lod > 1 ? 6 : lod ? 8 : 12;
  const rope = (a: THREE.Vector3, ba: number, b: THREE.Vector3, bb: number, r: number, tar: boolean, mk: number, sag = 0) =>
    ropes.push({ a: a.clone(), ba, b: b.clone(), bb, r, tar, mask: mk, sag });
  const spar = (a: THREE.Vector3, b: THREE.Vector3, rmid: number, rend: number) => {
    // tapered spar along a→b, thickest in the middle, closed at both ends
    const d = V().subVectors(b, a), len = d.length();
    const q = new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), d.normalize());
    const prof = [0, 0];
    for (let k = 0; k <= 8; k++) {
      const t = k / 8;
      prof.push(rend + (rmid - rend) * Math.pow(1 - (2 * t - 1) ** 2, 0.6), t * len);
    }
    prof.push(0, len);
    hm.lathe(new THREE.Matrix4().compose(a, q, V(1, 1, 1)), prof, seg);
  };
  const mast = (a: THREE.Vector3, b: THREE.Vector3, ra: number, rb: number) => hm.tube(a, b, ra, rb, seg);

  // channels with deadeyes and chainplates, then the shroud itself up to the mast
  const shroud = (m: Mast, z: number, yc: number, side: number, top: THREE.Vector3, r: number, ratlines: THREE.Vector3[][] | null) => {
    const u = f.uAt(z, yc), xe = f.half(u, yc) + 0.11 * Math.max(0.8, m.sc) + (m.square ? 0 : 0.06);
    const d = V(side * xe, yc + 0.045, z), dir = V().subVectors(top, d).normalize();
    const up = V().copy(d).addScaledVector(dir, 0.1 * Math.max(0.75, m.sc));
    if (lod < 2) {
      hm.bone = 0;
      hm.zone = TAR;
      for (const c of [d, up]) hm.tube(V().copy(c).setX(c.x - side * 0.01), V().copy(c).setX(c.x + side * 0.012), 0.026, 0.026, 8);
      hm.zone = IRON;
      const hull = f.side(z, yc - 0.27, 0.006);
      hm.beam(V(side * hull.x, hull.y, hull.z), V(d.x - side * 0.01, d.y - 0.01, d.z), 0.014, 0.006, V(side, 0, 0));
      if (!lod) {
        for (const o of [-0.011, 0.011]) {
          rope(V().copy(d).add(V(0, 0.02, o)), 0, V().copy(up).addScaledVector(dir, -0.02).add(V(0, 0, o)), 0, 0.0035, false, 0);
        }
      }
    }
    const from = V().copy(up).addScaledVector(dir, 0.022);
    rope(from, 0, top, bMast(m.i), r, true, mask(m.i));
    ratlines?.push([from, top]);
  };
  const ratlines = (lines: THREE.Vector3[][], y1: number, mk: number) => {
    if (lod) return;
    for (let i = 0; i + 1 < lines.length; i++) {
      const [a0, a1] = lines[i], [b0, b1] = lines[i + 1];
      for (let y = Math.max(a0.y, b0.y) + 0.07; y < y1; y += 0.058) {
        const pa = V().lerpVectors(a0, a1, (y - a0.y) / (a1.y - a0.y)), pb = V().lerpVectors(b0, b1, (y - b0.y) / (b1.y - b0.y));
        rope(pa, 0, pb, 0, 0.0036, true, mk);
      }
    }
  };
  const channel = (m: Mast, z0: number, z1: number, yc: number) => {
    if (lod > 1) return;
    hm.bone = 0;
    hm.zone = SPAR;
    const path: THREE.Vector3[] = [], side: THREE.Vector3[] = [];
    for (let k = 0; k <= 6; k++) {
      const z = z0 + ((z1 - z0) * k) / 6, u = f.uAt(z, yc);
      path.push(f.at(u, yc, V()));
      side.push(f.normal(u, yc, V()).setY(0).normalize());
    }
    const w = 0.13 * Math.max(0.8, m.sc) + (m.square ? 0 : 0.06);
    const v0 = hm.n, i0 = hm.index.length;
    hm.sweep(path, side, [-0.02, -0.016, w, -0.016, w, 0.016, -0.02, 0.016], true);
    hm.mirror(v0, i0);
  };

  for (const m of masts) {
    const ms = m.s, sc = m.sc;
    hm.bone = bMast(m.i);
    hm.zone = SPAR;
    if (m.square) {
      const top = ms.top, capY = top + 0.2 * sc, topR = 0.22 * ms.yards[0];
      const rTm = 0.6 * ms.r, rTg = 0.36 * ms.r;
      const tmOff = m.r(capY) + rTm + 0.004, tgOff = rTm * 0.75 + rTg + 0.004;
      const tm = (y: number) => m.at(y).addScaledVector(m.fwd, tmOff);
      const tg = (y: number) => tm(y).addScaledVector(m.fwd, tgOff);
      const h0 = ms.heads[0], h1 = ms.heads[1];
      // lower mast, woldings, top, cap
      mast(m.at(m.foot.y - 0.05), m.at(capY), ms.r, m.r(capY));
      if (!lod) {
        hm.zone = ROPE;
        for (let y = m.foot.y + 0.4; y < top - 0.9 * sc; y += 0.26 * sc) mast(m.at(y), m.at(y + 0.03), m.r(y) + 0.008, m.r(y) + 0.008);
      }
      hm.zone = SPAR;
      const tc = m.at(top);
      // the top: an oval platform, wide abeam and short fore and aft so the topsail clears its forward rim
      const tb = 0.55 * topR, tz = tc.z - 0.1 * topR;
      for (const x of [-1, 1]) hm.beam(V(x * m.r(top), top - 0.03, tz - tb * 0.9), V(x * m.r(top), top - 0.03, tz + tb * 0.9), 0.035 * sc, 0.04 * sc);
      for (const zz of [-0.5, 0.1, 0.6]) hm.beam(V(-topR * 0.85, top - 0.065 * sc, tz + zz * tb), V(topR * 0.85, top - 0.065 * sc, tz + zz * tb), 0.03 * sc, 0.03 * sc);
      const rim = s.basket ? 0.2 * sc : 0.08 * sc;
      const topM = new THREE.Matrix4().makeTranslation(tc.x, top - 0.012, tz).scale(V(1, 1, 0.55));
      hm.lathe(topM, [0, -0.012, topR, -0.012, topR, 0.012, 0, 0.012], seg + 4);
      hm.zone = PAINT;
      hm.lathe(topM, [topR * 0.98, 0, topR * 1.02, 0.01, topR * 1.04, rim, topR * 0.98, rim, topR * 0.95, 0.012], seg + 4);
      hm.zone = TAR;
      hm.beam(V().copy(m.at(capY)).addScaledVector(m.fwd, -m.r(capY)), V().copy(m.at(capY)).addScaledVector(m.fwd, tmOff + rTm + 0.02), 2.4 * m.r(capY), 0.07 * sc, m.dir);
      // topmast and topgallant
      hm.zone = SPAR;
      mast(tm(top - 0.06 * sc), tm(h0 + 0.12 * sc), rTm, rTm * 0.72);
      hm.zone = TAR;
      mast(tm(h0 - 0.05 * sc), tm(h0 + 0.13 * sc), rTm * 0.8, rTm * 0.72);
      hm.zone = SPAR;
      const tmh = tm(h0);
      for (const x of [-1, 1]) hm.beam(V(x * rTm, h0 - 0.02, tmh.z - 0.16 * sc), V(x * rTm, h0 - 0.02, tmh.z + 0.12 * sc), 0.022 * sc, 0.026 * sc);
      for (const zz of [-0.1, 0.06]) hm.beam(V(-0.19 * sc, h0, tmh.z + zz * sc), V(0.19 * sc, h0, tmh.z + zz * sc), 0.02 * sc, 0.02 * sc);
      let truckY = h0 + 0.2 * sc, truck = tm(truckY);
      if (h1) {
        mast(tg(h0 - 0.15 * sc), tg(h1 + 0.04 * sc), rTg, rTg * 0.68);
        truckY = h1 + 0.04 * sc;
        truck = tg(truckY);
      } else mast(tm(h0 + 0.12 * sc), tm(truckY), rTm * 0.7, rTm * 0.5);
      hm.zone = GILT;
      hm.lathe(new THREE.Matrix4().makeTranslation(truck.x, truck.y, truck.z), [0, 0, 0.035 * sc, 0.006, 0.04 * sc, 0.025 * sc, 0, 0.035 * sc], 8);
      hm.zone = SPAR;
      mast(V().copy(truck).setY(truck.y + 0.03 * sc), V().copy(truck).setY(truck.y + 0.2 * sc), 0.008, 0.006);
      m.truck.copy(truck).setY(truck.y + 0.19 * sc);
      // stays leave from under the top's forward rim and from the mastheads; stays from aft land above the top
      m.stays = [m.at(top - 0.07 * sc).addScaledVector(m.fwd, tb * 0.82), tm(h0 - 0.03 * sc).addScaledVector(m.fwd, rTm), ...(h1 ? [tg(h1 - 0.04 * sc).addScaledVector(m.fwd, rTg)] : [])];
      m.lands = [V(0, f.deck(ms.u) + 0.14, m.foot.z - ms.r - 0.04), m.at(top + 0.12 * sc).addScaledVector(m.fwd, -m.r(top)), tm(h0 + 0.07 * sc).addScaledVector(m.fwd, -rTm * 0.9)];

      // yards and their sails
      const ys = [top - 0.42 * sc, h0 - 0.3 * sc, ...(h1 ? [h1 - 0.22 * sc] : [])];
      const axes = [(y: number) => m.at(y), tm, tg];
      const mr = [(y: number) => m.r(y), () => rTm * 0.85, () => rTg * 0.85];
      const ry = [0.45, 0.32, 0.22].map((k) => k * ms.r);
      const gaps = [0.05, 0.03, 0.02].map((k) => k * sc);
      const centres = ys.map((y, k) => axes[k](y).addScaledVector(m.fwd, mr[k](y) + ry[k] + gaps[k]));
      hm.bone = bBrace(m.i);
      ys.forEach((_, k) => {
        const c = centres[k], h = ms.yards[k];
        hm.zone = SPAR;
        spar(V(c.x + h, c.y, c.z), V(c.x - h, c.y, c.z), ry[k], ry[k] * 0.45);
        hm.zone = ROPE;
        hm.beam(V().copy(c).addScaledVector(m.fwd, -ry[k]), axes[k](c.y).addScaledVector(m.fwd, mr[k](c.y) * 0.6), ry[k] * 0.9, ry[k] * 1.2, m.dir);
      });
      // sail corners: heads bent on just ahead of each yard, clews at the yardarms below
      const clew = (k: number, x: number) => V(x, centres[k].y + ry[k] * 0.6, centres[k].z + ry[k] + 0.012);
      const footY = f.rail(ms.u) + 0.26;
      ys.forEach((_, k) => {
        const c = centres[k], h = ms.yards[k] * 0.95, hy = c.y - ry[k] * 0.5, hz = c.z + ry[k] + 0.012;
        const fp = k ? clew(k - 1, ms.yards[k - 1] * 0.93) : V(ms.yards[0] * 0.99, footY, centres[0].z + ry[0] + 0.012);
        const fs = V(-fp.x, fp.y, fp.z), height = hy - fp.y;
        sm.square(V(h, hy, hz), V(-h, hy, hz), fp, fs, k ? height * 0.24 : 0.06 * sc, m.i, (0.13 + 0.02 * k) * 2 * h, k < 2, nu, nv);
        if (!k) {
          // course sheets lead aft outside the channel to a sheave in the side, tacks forward to the rail
          const yc = f.rail(ms.u) - 0.1, za = m.foot.z - (0.3 + (ms.shrouds - 1) * 0.13) * sc - 0.36 * sc, ua = f.uAt(za, yc);
          const ut = Math.min(0.84, f.uAt(c.z + 0.85 * sc, yc)), yt = f.rail(ut);
          for (const side of [1, -1]) {
            const cl = V(side * fp.x, fp.y, fp.z);
            rope(cl, bBrace(m.i), V(side * (f.half(ua, yc) + 0.03), yc + 0.06, za), 0, 0.006, false, mask(m.i), 0.01);
            rope(cl, bBrace(m.i), V(side * (f.half(ut, yt) + 0.02), yt + 0.01, f.z(ut, yt)), 0, 0.006, false, mask(m.i), 0.01);
          }
        }
      });

      // standing rigging
      const yc = f.rail(ms.u) - 0.1;
      const zs = Array.from({ length: ms.shrouds }, (_, i) => m.foot.z - (0.3 + i * 0.13) * sc);
      channel(m, zs[zs.length - 1] - 0.24 * sc, zs[0] + 0.1, yc);
      for (const side of [1, -1]) {
        const lines: THREE.Vector3[][] = [];
        zs.forEach((z, i) => shroud(m, z, yc, side, V().copy(m.at(top - (0.05 + 0.022 * i) * sc)).setX(side * m.r(top) * 0.95), 0.011 * sc, lines));
        ratlines(lines, top - 0.34 * sc, mask(m.i));
        // topmast shrouds from the rim of the top, futtocks beneath
        const tl: THREE.Vector3[][] = [];
        for (let j = 0; j < 3; j++) {
          const a = -0.25 - 0.38 * j, rimP = V(side * topR * 0.9 * Math.cos(a), top + 0.03, tz + tb * 0.9 * Math.sin(a));
          const hd = V().copy(tm(h0 - (0.06 + 0.02 * j) * sc)).setX(side * rTm);
          rope(rimP, bMast(m.i), hd, bMast(m.i), 0.008 * sc, true, mask(m.i));
          tl.push([rimP, hd]);
          if (!lod) rope(V().copy(rimP).setY(top - 0.01), bMast(m.i), V().copy(m.at(top - 0.34 * sc)).setX(side * m.r(top - 0.34 * sc)), bMast(m.i), 0.006 * sc, true, mask(m.i));
        }
        if (!lod) {
          for (let i = 0; i + 1 < tl.length; i++) {
            const [a0, a1] = tl[i], [b0, b1] = tl[i + 1];
            for (let y = top + 0.1; y < h0 - 0.32 * sc; y += 0.058) {
              rope(V().lerpVectors(a0, a1, (y - a0.y) / (a1.y - a0.y)), bMast(m.i), V().lerpVectors(b0, b1, (y - b0.y) / (b1.y - b0.y)), bMast(m.i), 0.0034, true, mask(m.i));
            }
          }
        }
        if (h1) {
          for (const zz of [-0.1, 0.06]) {
            rope(V(side * 0.18 * sc, h0 + 0.01, tmh.z + zz * sc), bMast(m.i), V().copy(tg(h1 - 0.06 * sc)).setX(side * rTg), bMast(m.i), 0.006 * sc, true, mask(m.i));
          }
        }
        // backstays to the after end of the channel
        const zb = zs[zs.length - 1] - 0.16 * sc, ub = f.uAt(zb, yc);
        const bs = V(side * (f.half(ub, yc) + 0.1 * Math.max(0.8, sc)), yc + 0.04, zb);
        rope(V().copy(tm(h0 - 0.04 * sc)).setX(side * rTm), bMast(m.i), bs, 0, 0.009 * sc, true, mask(m.i));
      }
      // lifts and ties
      ys.forEach((_, k) => {
        const c = centres[k], h = ms.yards[k] * 0.97;
        // lifts to blocks under the rim of the top and under the crosstrees; ties up to the masthead below them
        for (const side of [1, -1]) {
          const to = [V(side * topR * 0.85, top - 0.07 * sc, tz), V(side * 0.18 * sc, h0 - 0.035 * sc, tmh.z), V().copy(tg(h1 ? h1 - 0.02 : 0)).setX(side * rTg)][k];
          rope(V(c.x + side * h, c.y + ry[k] * 0.7, c.z - ry[k] * 0.4), bBrace(m.i), to, bMast(m.i), 0.005 * sc, false, mask(m.i), 0.004);
        }
        const tie = [m.at(top - 0.1 * sc - 0.03), tm(h0 - 0.06 * sc), tg(h1 ? h1 - 0.06 : 0)][k];
        rope(V(c.x, c.y + ry[k], c.z - ry[k] * 0.5), bBrace(m.i), tie.addScaledVector(m.fwd, mr[k](c.y) + 0.01), bMast(m.i), 0.008 * sc, false, mask(m.i));
      });
      m.yards = centres;
    } else {
      const lat = ms.lat!, top = ms.top;
      mast(m.at(m.foot.y - 0.05), m.at(top + 0.12 * sc), ms.r, m.r(top) * 0.85);
      if (!lod) {
        hm.zone = ROPE;
        for (let y = m.foot.y + 0.4; y < lat.sling - 0.4; y += 0.26 * sc) mast(m.at(y), m.at(y + 0.03), m.r(y) + 0.008, m.r(y) + 0.008);
      }
      hm.zone = TAR;
      mast(m.at(top - 0.12 * sc), m.at(top + 0.02 * sc), m.r(top) * 1.15, m.r(top) * 1.1);
      const truck = m.at(top + 0.14 * sc);
      hm.zone = GILT;
      hm.lathe(new THREE.Matrix4().makeTranslation(truck.x, truck.y, truck.z), [0, 0, 0.032 * sc, 0.006, 0.036 * sc, 0.022 * sc, 0, 0.032 * sc], 8);
      hm.zone = SPAR;
      mast(V().copy(truck).setY(truck.y + 0.02), V().copy(truck).setY(truck.y + 0.18 * sc), 0.008, 0.006);
      m.truck.copy(truck).setY(truck.y + 0.17 * sc);
      m.head.copy(m.at(top + 0.07 * sc)).addScaledVector(m.fwd, m.r(top) * 0.85 + 0.008);
      m.stays = [m.head];
      // the yard hangs on the port side of the mast, peak aft
      const ryd = 0.55 * ms.r, off = m.r(lat.sling) + ryd + 0.01;
      const sl = m.at(lat.sling).setX(off), yd = V(0, Math.sin(lat.tilt), -Math.cos(lat.tilt));
      m.tack.copy(sl).addScaledVector(yd, -lat.len * lat.fore);
      m.peak.copy(sl).addScaledVector(yd, lat.len * (1 - lat.fore));
      hm.bone = bBrace(m.i);
      spar(m.tack, m.peak, ryd, ryd * 0.4);
      hm.zone = ROPE;
      hm.beam(V().copy(sl).setX(sl.x - ryd), V().copy(sl).setX(m.r(lat.sling) * 0.5), ryd, ryd * 1.4);
      const below = V(0, -Math.cos(lat.tilt), -Math.sin(lat.tilt)).multiplyScalar(ryd + 0.01);
      const tk = V().copy(m.tack).add(below).setX(off), pk = V().copy(m.peak).add(below).setX(off);
      const cz = Math.max(m.foot.z - lat.clew, f.zAft(f.railAft) + 0.32);
      m.clew.set(off, f.deck(f.uAt(cz, m.foot.y)) + lat.clewY, cz);
      const gap = off - 0.012;
      sm.lateen(tk, pk, m.clew, m.i, 0.12 * tk.distanceTo(m.clew), nu, nv, (p) => {
        const y = Math.min(p.y, top);
        return p.y > top ? [9, 9] : [Math.abs(p.z - m.at(y).z) - m.r(y) * 1.1, gap - m.r(y)];
      });
      // standing and running rigging
      const yc = f.rail(ms.u) - 0.1, n = ms.shrouds;
      const zs = Array.from({ length: n }, (_, i) => m.foot.z + ((i - (n - 1) / 2) * 0.15 - 0.05) * Math.max(0.8, sc));
      channel(m, zs[0] - 0.14, zs[n - 1] + 0.14, yc);
      for (const side of [1, -1]) {
        const lines: THREE.Vector3[][] = [];
        zs.forEach((z, i) => shroud(m, z, yc, side, V().copy(m.at(top - (0.06 + 0.02 * i) * sc)).setX(side * m.r(top)), 0.009 * Math.max(0.8, sc), lines));
        ratlines(lines, lat.sling - 0.5, mask(m.i));
      }
      // halyard up the yard's side of the masthead, clear of the band
      rope(V(sl.x, sl.y + ryd, sl.z), bBrace(m.i), m.at(top + 0.07 * sc).setX(m.r(top) * 0.85 + 0.012), bMast(m.i), 0.008, false, mask(m.i));
      // tack belayed on the bitts before the mast, sheet to the deck just ahead of the clew
      const bz = m.foot.z + ms.r + 0.1;
      rope(m.tack, bBrace(m.i), V(ms.r + 0.07, f.deck(f.uAt(bz, s.rail)) + 0.22, bz), 0, 0.007, false, mask(m.i), 0.01);
      // lead the sheet to whichever side of the clew keeps clear of a break in the deck
      const clear = (u: number) => Math.min(...s.decks.flatMap((d) => [d.from, d.to]).filter((b) => b > 0 && b < 1).map((b) => Math.abs(u - b)));
      const ua = f.uAt(Math.min(m.clew.z + 0.12, m.foot.z - 0.15), m.foot.y), ub = f.uAt(m.clew.z - 0.12, m.foot.y);
      const uc = clear(ua) >= clear(ub) || ub < 0.02 ? ua : ub;
      rope(m.clew, bBrace(m.i), V(0, f.deck(uc) + 0.04, f.z(uc, f.deck(uc))), 0, 0.006, false, mask(m.i), 0.02);
    }
    hm.bone = bMast(m.i);
    flags.push({ at: m.truck, bone: bFlag(m.i), type: 0, len: 1.1 * Math.max(0.7, sc), wid: 0.1 * Math.max(0.7, sc) });
  }

  // stays and braces between masts (stern to bow order)
  for (let k = 0; k < masts.length; k++) {
    const m = masts[k], next = masts[k + 1], prev = masts[k - 1];
    const sc = m.sc;
    m.stays.forEach((from, i) => {
      let to: THREE.Vector3, bt = 0, mt = 0;
      if (next && !m.square && !next.square) return; // lateens overlap: shrouds alone hold the mast
      if (next && !m.square) {
        // a lateen mast's stay runs shallower than its yard so the two never meet
        const y = Math.min(m.s.top - (next.foot.z - m.foot.z) * Math.tan(m.s.lat!.tilt) * 0.85, next.square ? next.s.top - 0.35 : 1e9);
        to = V().copy(next.at(y)).addScaledVector(next.fwd, -next.r(y) - 0.005);
        bt = bMast(next.i);
        mt = mask(next.i);
      } else if (next) {
        to = next.lands[Math.min(i, next.lands.length - 1)];
        if (i > 0) {
          bt = bMast(next.i);
          mt = mask(next.i);
        }
      } else if (fit.sprit) to = V().copy(fit.sprit.heel).addScaledVector(fit.sprit.dir, fit.sprit.len * [0.4, 0.82, 0.97][i]);
      else to = V(0, f.railFwd + 0.15, f.zFwd(f.railFwd + 0.15) - 0.02);
      rope(from, bMast(m.i), to, bt, (0.016 - 0.004 * i) * sc, true, mask(m.i) | mt, 0.004);
    });
    if (!m.square) continue;
    // braces lead aft: the main yard's to the quarters, the others to the next mast aft or to its stays
    m.yards.forEach((c, i) => {
      const h = m.s.yards[i] * 0.99;
      for (const side of [1, -1]) {
        const arm = V(c.x + side * h, c.y, c.z - 0.02);
        let to: THREE.Vector3, bt = 0, mt = 0;
        if (prev && prev.square) {
          // a block on the stay from the mast aft to this one
          const j = Math.min(i, prev.stays.length - 1);
          to = V().lerpVectors(prev.stays[j], m.lands[j], 0.45);
        } else if (prev && i > 0) {
          to = V().copy(prev.head).setY(prev.head.y + 0.04 * i);
          bt = bMast(prev.i);
          mt = mask(prev.i);
        } else {
          const uq = 0.05, yq = f.rail(uq) + 0.02;
          to = V(side * (f.half(uq, yq) - TH / 2), yq, f.z(uq, yq));
        }
        rope(arm, bBrace(m.i), to, bt, 0.005 * sc, false, mask(m.i) | mt, 0.006);
      }
    });
  }

  // spritsail beneath the bowsprit with its lifts and sheets; ensign and jack
  const sp = fit.sprit;
  if (sp) {
    const c = V().copy(sp.heel).addScaledVector(sp.dir, sp.len * 0.8), h = s.sprit!.yard, ry = 0.008 * sp.len + 0.006;
    const yc = V(0, c.y - sp.r * 0.6 - 0.05, c.z);
    hm.bone = 0;
    hm.zone = SPAR;
    spar(V(h, yc.y, yc.z), V(-h, yc.y, yc.z), ry, ry * 0.45);
    hm.zone = ROPE;
    hm.beam(V(0, yc.y, yc.z), V(0, c.y - sp.r * 0.4, c.z), ry, ry * 1.2);
    const hy = yc.y - ry * 0.5, hz = yc.z + ry + 0.012, footY = Math.max(f.railFwd + 0.1, hy - 0.6 * (sp.len / 2.6));
    const fp = V(h * 1.05, footY, hz + 0.05);
    sm.square(V(h * 0.95, hy, hz), V(-h * 0.95, hy, hz), fp, V(-fp.x, fp.y, fp.z), 0.05, 4, 0.28 * h, false, nu, nv);
    for (const side of [1, -1]) {
      rope(V(side * h * 0.97, yc.y + ry * 0.6, yc.z - ry * 0.4), 0, V().copy(sp.heel).addScaledVector(sp.dir, sp.len * 0.96), 0, 0.004, false, 0, 0.004);
      rope(V(side * fp.x, fp.y, fp.z), 0, cathead(f).setX(side * cathead(f).x), 0, 0.005, false, 0, 0.03);
    }
  }
  const ek = Math.max(0.75, f.L / 5.8);
  flags.push({ at: fit.ensign, bone: bFlag(4), type: 1, len: 0.62 * ek, wid: 0.4 * ek });
  if (fit.jack) flags.push({ at: fit.jack, bone: bFlag(5), type: 2, len: 0.34, wid: 0.23 });
  return masts;
}

/** Outer end of the port cathead, where the anchor hangs and the spritsail sheets lead. */
function cathead(f: Form): THREE.Vector3 {
  const u = 0.88, y = f.rail(u) - 0.04;
  return V(f.half(u, y) + 0.22 * (f.L / 5.8), y + 0.01, f.z(u, y) + 0.06);
}

/** Deck furniture and hull fittings: hatches, capstan, bitts, the ship's boat, catheads and anchors, quarter galleries. */
function buildFittings(f: Form, masts: Mast[], lod: number, hero: boolean, m: Mesher): void {
  const s = f.s;
  m.bone = 0;
  m.aux = 1;
  const deckAt = (z: number) => {
    const y = f.deck(Math.min(0.99, Math.max(0.01, f.uAt(z, f.s.rail))));
    return y + 0.025;
  };
  const square = masts.filter((k) => k.square), main = square[0] ?? masts[Math.floor(masts.length / 2)];
  // bitts with belaying pins before every mast
  for (const k of masts) {
    const z = k.foot.z + k.s.r + 0.1, y = deckAt(z), w = k.s.r + 0.07;
    m.zone = SPAR;
    for (const x of [-w, w]) m.beam(V(x, y - 0.02, z), V(x, y + 0.24, z), 0.045, 0.045, V(0, 0, 1));
    m.beam(V(-w - 0.05, y + 0.17, z), V(w + 0.05, y + 0.17, z), 0.03, 0.04);
    if (!lod) {
      m.zone = TAR;
      for (let x = -w; x <= w + 1e-6; x += w / 2) m.tube(V(x, y + 0.13, z + 0.02), V(x, y + 0.23, z + 0.02), 0.007, 0.006, 5, false);
    }
  }
  // a grated hatch ahead of the mainmast (lateen sheets and tacks keep a caravel's waist clear), the capstan abaft it
  const hz = main.foot.z + 0.55 * main.sc + 0.2, hy = deckAt(hz), hw = 0.2 * main.sc + 0.1, hl = 0.28 * main.sc + 0.1;
  if (main.square) {
    m.zone = TRIM;
    for (const [a, b] of [[[-hw, -hl], [hw, -hl]], [[-hw, hl], [hw, hl]], [[-hw, -hl], [-hw, hl]], [[hw, -hl], [hw, hl]]]) {
      m.beam(V(a[0], hy + 0.02, hz + a[1]), V(b[0], hy + 0.02, hz + b[1]), 0.04, 0.07);
    }
    m.zone = DARK;
    m.box(new THREE.Matrix4().makeTranslation(0, hy + 0.01, hz), hw * 2, 0.02, hl * 2);
    if (!lod) {
      m.zone = PLANK;
      for (let x = -hw + 0.05; x < hw; x += 0.05) m.beam(V(x, hy + 0.045, hz - hl), V(x, hy + 0.045, hz + hl), 0.014, 0.012);
      for (let z = -hl + 0.05; z < hl; z += 0.05) m.beam(V(-hw, hy + 0.04, hz + z), V(hw, hy + 0.04, hz + z), 0.012, 0.012);
    }
  }
  const cz = main.foot.z - main.s.r - 0.35 * main.sc - 0.15, cy = deckAt(cz);
  m.zone = SPAR;
  m.lathe(new THREE.Matrix4().makeTranslation(0, cy - 0.01, cz), [0.12, 0, 0.11, 0.04, 0.075, 0.08, 0.07, 0.17, 0.11, 0.21, 0.12, 0.26, 0.05, 0.28, 0, 0.29], 12);
  if (!lod) {
    m.zone = TAR;
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      m.beam(V(Math.cos(a) * 0.072, cy + 0.08, cz + Math.sin(a) * 0.072), V(Math.cos(a) * 0.072, cy + 0.17, cz + Math.sin(a) * 0.072), 0.012, 0.012);
    }
  }
  // the ship's boat on chocks over the hatch, in the larger ships
  if (s.beam > 1.15 && main.square && !lod) {
    const bl = Math.min(1.1, hl * 2 + 0.35), bb = Math.min(0.36, hw * 1.8), bd = 0.13, by = hy + 0.09;
    const v0 = m.n, i0 = m.index.length;
    const shell = (t: number, sx: number, inset: number, o: THREE.Vector3) => {
      const zt = (t - 0.5) * bl, plan = Math.pow(Math.max(0, 1 - Math.abs(2 * t - 1) ** (t > 0.5 ? 1.8 : 3)), 0.5);
      const ang = sx * Math.PI * 0.5;
      return o.set(Math.sin(ang) * (bb / 2 * plan - inset), by + bd * (1 - Math.cos(ang)) * 1.0 - inset * 0.6 + 0.04 * (2 * t - 1) ** 2, hz + zt);
    };
    const ts = Array.from({ length: 13 }, (_, i) => i / 12), ss = Array.from({ length: 6 }, (_, i) => i / 5);
    m.zone = PLANK;
    m.grid(ts, ss, (t, sx, o) => shell(t, sx, 0, o), (p) => _e.set(p.x, -1, 0).normalize(), (t, sx) => [t * bl, sx * 6]);
    m.zone = RED;
    m.grid(ts, ss, (t, sx, o) => shell(t, sx, 0.02, o), (p) => _e.set(-p.x, 1, 0).normalize(), (t, sx) => [t * bl, sx * 6]);
    m.zone = TRIM;
    const path: THREE.Vector3[] = [], side: THREE.Vector3[] = [];
    for (const t of ts) {
      path.push(shell(t, 1, 0.01, V()));
      side.push(V(1, 0, 0));
    }
    m.sweep(path, side, [-0.012, -0.012, 0.012, -0.012, 0.012, 0.012, -0.012, 0.012], true);
    m.mirror(v0, i0);
    m.zone = SPAR;
    for (const t of [0.3, 0.55, 0.78]) {
      const p = shell(t, 1, 0.02, V());
      m.beam(V(-p.x, by + bd * 0.75, p.z), V(p.x, by + bd * 0.75, p.z), 0.05, 0.015);
    }
    for (const t of [0.25, 0.75]) m.beam(V(-bb * 0.3, hy + 0.06, hz + (t - 0.5) * bl), V(bb * 0.3, hy + 0.06, hz + (t - 0.5) * bl), 0.05, 0.06);
  }
  // catheads and anchors at the bow
  {
    const u = 0.88, y = f.rail(u) - 0.04, x = f.half(u, y), z = f.z(u, y), sc = f.L / 5.8;
    const v0 = m.n, i0 = m.index.length;
    m.zone = TAR;
    m.beam(V(x - 0.15, y, z), cathead(f).add(V(0, 0.03, 0)), 0.06, 0.06);
    const n = f.normal(f.uAt(z - 0.1, y - 0.45), y - 0.45, V());
    const top = V(x + 0.17 * sc, y - 0.03, z + 0.05), foot = f.side(z - 0.08, y - 0.62 * sc, 0.07);
    m.zone = IRON;
    m.beam(top, foot, 0.035 * sc, 0.035 * sc, n);
    m.zone = SPAR;
    m.beam(V().lerpVectors(top, foot, 0.08).addScaledVector(n, -0.16 * sc), V().lerpVectors(top, foot, 0.08).addScaledVector(n, 0.16 * sc), 0.04 * sc, 0.04 * sc);
    m.zone = IRON;
    const dir = V().subVectors(foot, top).normalize(), along = V().crossVectors(dir, n).normalize();
    for (const sx of [-1, 1]) {
      const tip = V().copy(foot).addScaledVector(along, sx * 0.16 * sc).addScaledVector(dir, -0.12 * sc);
      m.beam(foot, tip, 0.03 * sc, 0.03 * sc, n);
      m.beam(V().lerpVectors(foot, tip, 0.65), V().copy(tip).addScaledVector(dir, -0.05 * sc), 0.06 * sc, 0.012 * sc, n);
    }
    m.mirror(v0, i0);
  }
  // quarter galleries: glazed turrets on the stern quarters of the great ships
  if (s.quarterGalleries) {
    const levels = f.sternLevels();
    const y0 = f.deck(0, 0) - 0.04, y1 = f.deck(0, levels[levels.length - 1]) + 0.12, u0 = 0.03, u1 = 0.1;
    const z0 = f.z(u0, y0), z1 = f.z(u1, y0), xin = Math.min(f.half(u0, y1), f.half(u1, y1)) - 0.03;
    const xout = Math.max(f.half(u0, y0), f.half(u1, y0)) + 0.12, zc = (z0 + z1) / 2, yc = (y0 + y1) / 2;
    const v0 = m.n, i0 = m.index.length;
    m.zone = PAINT;
    m.box(new THREE.Matrix4().makeTranslation((xin + xout) / 2, yc, zc), xout - xin, y1 - y0, z1 - z0);
    m.zone = GILT;
    m.lathe(new THREE.Matrix4().makeTranslation((xin + xout) / 2, y1, zc).scale(V((xout - xin) / 0.2, 1.4, (z1 - z0) / 0.2)),
      [0.105, 0, 0.1, 0.02, 0.085, 0.05, 0.05, 0.08, 0.015, 0.1, 0.02, 0.12, 0, 0.14], 10);
    m.lathe(new THREE.Matrix4().makeTranslation((xin + xout) / 2, y0, zc).scale(V((xout - xin) / 0.2, 1.2, (z1 - z0) / 0.2)).multiply(new THREE.Matrix4().makeRotationX(Math.PI)),
      [0.105, 0, 0.09, 0.03, 0.05, 0.07, 0.012, 0.1, 0, 0.12], 10);
    for (const y of [y0 + 0.01, y1 - 0.01, yc]) m.box(new THREE.Matrix4().makeTranslation(xout + 0.005, y, zc), 0.03, 0.025, z1 - z0 + 0.02);
    const rnd = new Rng(7);
    for (const y of [(y0 + yc) / 2, (yc + y1) / 2]) {
      for (const k of [0.3, 0.7]) {
        m.zone = GLASS;
        m.aux = rnd.next();
        m.box(new THREE.Matrix4().makeTranslation(xout, y, z0 + (z1 - z0) * k), 0.016, (y1 - y0) * 0.3, (z1 - z0) * 0.3);
        m.aux = 1;
      }
    }
    m.mirror(v0, i0);
  }
  if (hero) {
    // the flagship's gilt sheer rail and wreathed stern windows are its distinction
    m.zone = GILT;
    const path: THREE.Vector3[] = [], side: THREE.Vector3[] = [];
    for (let i = 0; i <= 40; i++) {
      const u = 0.02 + (0.94 * i) / 40, y = f.strakeY(u, s.paintFrom - 0.25);
      path.push(f.at(u, y, V()));
      side.push(f.normal(u, y, V()));
    }
    const v0 = m.n, i0 = m.index.length;
    m.sweep(path, side, [-0.01, -0.016, 0.022, -0.016, 0.028, 0, 0.022, 0.016, -0.01, 0.016], false);
    m.mirror(v0, i0);
  }
}

// ---------------------------------------------------------------------------------------------
// Shaders. The wooden mesh, sails and flags are standard materials patched for bones and their own
// detail, so IBL, shadows, point lights, haze and rain stay consistent with the world.

const BONE_PARS = /* glsl */ `
uniform mat4 uBones[${BONES}];
`;

const HULL_VERT = /* glsl */ `
attribute vec2 aUv;
attribute vec4 aInfo;
varying vec2 vWUv;
varying vec4 vInfo;
varying vec3 vLocal;
`;

const HULL_FRAG = /* glsl */ `
uniform sampler2D tWood;
uniform sampler2D tWoodN;
uniform sampler2D tDeck;
uniform sampler2D tDeckN;
uniform sampler2D tIron;
uniform vec3 uTeam;
uniform vec3 uTrim;
uniform vec4 uScheme; // paint pattern, first painted strake, world height of a strake, seed
uniform vec4 uPorts[2]; // gunport rows: first z, spacing, count, strake
uniform float uLamp;
uniform float uTime;
varying vec2 vWUv;
varying vec4 vInfo;
varying vec3 vLocal;
${COMMON_GLSL}
${TANGENT_NORMAL_GLSL}
// Painted upper works in the period's patterns: banded, chequered, chevrons, pales, lozenges.
vec3 scheme(float x, float s) {
  float st = uScheme.x, a;
  if (st < 0.5) a = step(2.0, mod(floor(s), 3.0));
  else if (st < 1.5) a = mod(floor(x / 0.24) + floor(s / 1.5), 2.0);
  else if (st < 2.5) a = step(0.5, fract(s / 2.0 + abs(fract(x / 0.32) - 0.5) * 1.6));
  else if (st < 3.5) a = mod(floor(x / 0.17), 2.0);
  else a = step(abs(fract(x / 0.3) - 0.5) * 2.0 + abs(fract(s / 2.2) - 0.5) * 2.0, 0.62);
  return mix(uTeam, uTrim, a);
}
`;

const HULL_MAIN = /* glsl */ `
int zone = int(vInfo.y + 0.5);
vec2 uv = vWUv;
vec3 alb = vec3(0.5), emis = vec3(0.0), tn = vec3(0.0, 0.0, 1.0);
float rough = 0.75, metal = 0.0, nAmt = 1.0;
vec2 nuv = uv;
float flick = 0.86 + 0.08 * sin(uTime * 7.3 + vInfo.w * 40.0) * sin(uTime * 3.1 + vInfo.w * 17.0) + 0.06 * sin(uTime * 13.0);
if (zone == ${DECK}) {
  vec2 tc = uv / 0.56;
  alb = texture(tDeck, tc).rgb * vec3(1.1, 1.0, 0.86);
  tn = texture(tDeckN, tc).xyz * 2.0 - 1.0;
  nuv = tc;
  rough = 0.84;
} else if (zone == ${SPAR}) {
  vec2 tc = vec2(uv.x / 0.9, 0.43 + uv.y * 0.05);
  alb = texture(tDeck, tc).rgb * vec3(1.3, 0.98, 0.62);
  tn = texture(tDeckN, tc).xyz * 2.0 - 1.0;
  nuv = tc;
  nAmt = 0.5;
  rough = 0.58;
} else if (zone == ${IRON}) {
  alb = texture(tIron, uv / 0.4).rgb * 0.42;
  metal = 0.6;
  rough = 0.55;
} else if (zone == ${GILT}) {
  float n = vnoise(vLocal * 70.0);
  alb = vec3(0.92, 0.62, 0.24) * (0.65 + 0.35 * n);
  metal = 0.92;
  rough = 0.26 + 0.24 * n;
} else if (zone == ${GLASS}) {
  vec2 q = uv / 0.03;
  float lead = min(abs(fract(q.x + q.y) - 0.5), abs(fract(q.x - q.y) - 0.5));
  float ld = 1.0 - smoothstep(0.04, 0.09 + fwidth(q.x), lead);
  alb = mix(vec3(0.025, 0.03, 0.035), vec3(0.04, 0.035, 0.03), ld);
  rough = mix(0.05, 0.5, ld);
  emis = vec3(1.0, 0.42, 0.12) * uLamp * 3.2 * (0.55 + 0.45 * vInfo.w) * flick * (1.0 - 0.85 * ld);
} else if (zone == ${LAMP}) {
  alb = vec3(0.45, 0.42, 0.36);
  rough = 0.15;
  emis = vec3(1.0, 0.48, 0.16) * uLamp * 24.0 * flick;
} else if (zone == ${ROPE}) {
  alb = vec3(0.28, 0.2, 0.12) * (0.8 + 0.2 * sin(uv.x * 140.0 + uv.y * 90.0));
  rough = 0.9;
} else if (zone == ${DARK}) {
  alb = vec3(0.02, 0.016, 0.012);
  rough = 0.95;
} else {
  // planked wood, natural, tarred or painted: hull strakes sample one plank band of the texture each
  float sk = zone == ${PLANK} ? uv.y : uv.y / uScheme.z;
  float k = floor(sk), fv = fract(sk), h = hash13(vec3(k, 7.3, uScheme.w));
  vec2 base = vec2(uv.x / 0.63, sk * 0.071);
  vec2 tc = vec2(base.x + h * 5.31, 0.057 + 0.111 * (floor(h * 8.0) + 0.18 + 0.64 * fv));
  vec3 wood = textureGrad(tWood, tc, dFdx(base), dFdy(base)).rgb * vec3(1.3, 1.02, 0.76) * (0.82 + 0.36 * h);
  tn = textureGrad(tWoodN, tc, dFdx(base), dFdy(base)).xyz * 2.0 - 1.0;
  nuv = base;
  float w = fwidth(sk), bu = fract(uv.x / 1.3 + h * 3.7), wb = fwidth(uv.x / 1.3);
  float seam = (1.0 - smoothstep(0.0, max(0.05, w), min(fv, 1.0 - fv))) * (1.0 - smoothstep(0.25, 0.7, w));
  seam = max(seam, (1.0 - smoothstep(0.0, max(0.008, wb), min(bu, 1.0 - bu))) * (1.0 - smoothstep(0.02, 0.06, wb)));
  vec3 col = wood, pc = vec3(0.0);
  float paint = 0.0;
  rough = 0.7;
  if (zone == ${PAINT}) { paint = 1.0; pc = uTeam; }
  else if (zone == ${TRIM}) { paint = 1.0; pc = uTrim; }
  else if (zone == ${RED}) { paint = 1.0; pc = vec3(0.3, 0.05, 0.03); }
  else if (zone == ${TAR}) { col = wood * 0.2; rough = 0.48; }
  else if (sk > uScheme.y) { paint = 1.0; pc = scheme(uv.x, sk - uScheme.y); }
  if (zone == ${PLANK} && vInfo.w < 0.5) {
    for (int r = 0; r < 2; r++) {
      vec4 P = uPorts[r];
      if (P.z < 0.5) continue;
      float i = clamp(floor((uv.x - P.x) / P.y + 0.5), 0.0, P.z - 1.0);
      float e = max(abs(uv.x - (P.x + i * P.y)) / 0.056, abs(sk - P.w) / 0.62), fe = fwidth(e);
      float hole = 1.0 - smoothstep(1.0 - fe, 1.0 + fe, e), rim = 1.0 - smoothstep(1.22 - fe, 1.22 + fe, e);
      col = mix(col, uTrim * 0.7, rim * (1.0 - hole));
      paint = mix(paint, 1.0, rim);
      col = mix(col, vec3(0.01, 0.008, 0.006), hole);
      pc = mix(pc, col, rim);
    }
  }
  if (paint > 0.0) {
    float chip = smoothstep(0.6, 0.72, 0.7 * vnoise(vec3(uv.x * 7.0, sk * 2.3, uScheme.w)) + 0.3 * vnoise(vec3(uv.x * 37.0, sk * 11.0, 2.0)));
    vec3 painted = pc * (0.8 + 0.2 * smoothstep(0.02, 0.2, dot(wood, vec3(0.33))));
    col = mix(col, mix(painted, wood, chip * 0.85), paint);
    rough = mix(rough, mix(0.5, 0.7, chip), paint);
    nAmt = 1.0 - 0.6 * paint * (1.0 - chip);
  }
  col *= 0.8 + 0.2 * smoothstep(0.15, 0.7, vnoise(vec3(uv.x * 9.0, vLocal.y * 0.7, uScheme.w * 3.0)));
  if (zone == ${PLANK}) {
    // waterline: tarred boot-top, fouled white stuff below
    float wl = vLocal.y + 0.012 * sin(vLocal.z * 7.0);
    col = mix(col, wood * 0.16, smoothstep(0.08, 0.04, wl));
    col = mix(col, mix(vec3(0.42, 0.4, 0.31), vec3(0.08, 0.1, 0.045), smoothstep(-0.25, -0.02, wl) * 0.8), smoothstep(-0.005, -0.03, wl));
  }
  col *= 1.0 - 0.6 * seam;
  alb = col;
}
diffuseColor.rgb = alb;
`;

const SAIL_VERT = /* glsl */ `
attribute vec2 aUv;
attribute vec3 aTu;
attribute vec3 aTv;
attribute vec4 aSail;
attribute vec2 aCrease;
attribute vec2 aEmb;
uniform vec4 uSail[5]; // per mast: fill, luff, leeward side (lateen), tear
uniform float uTime;
varying vec2 vSUv;
varying vec2 vEmb;
varying vec4 vSInfo;
varying vec2 vDim;
float sailShape(vec2 uv) {
  float su = sin(3.14159 * uv.x);
  return aSail.y > 0.5 ? 4.0 * uv.y * (1.0 - uv.y) * (0.35 + 0.65 * su)
                       : su * sin(2.199 * uv.y) + 0.3 * sin(3.14159 * uv.y) * (1.0 - su);
}
float sailBelly(vec2 uv, vec4 st) {
  float sh = sailShape(uv), ph = aSail.x * 1.7;
  float luff = st.y * aSail.z * sh * (0.3 * sin(6.2832 * (1.7 * uv.x + 1.1 * uv.y) - 14.0 * uTime + ph)
                                    + 0.12 * sin(6.2832 * (3.1 * uv.x - 2.3 * uv.y) - 21.0 * uTime + ph * 2.3));
  float b = aSail.z * st.x * sh + luff;
  if (aSail.y < 0.5) return max(b, 0.015 * aSail.z * sh); // square sails never belly back onto the mast
  b *= st.z;
  return b < 0.0 ? -min(-b, aCrease.y + 0.9 * max(aCrease.x, 0.0)) : b; // a lateen drapes against its mast
}
`;

/** Torn cloth while a ship founders (needs vSUv, vSInfo and COMMON_GLSL). */
const TEAR = 'if (vSInfo.w > 0.0 && vnoise(vec3(vSUv * vec2(7.0, 5.0), vSInfo.x * 3.0)) < vSInfo.w) discard;';

const SAIL_FRAG = /* glsl */ `
uniform sampler2D tEmblem;
uniform sampler2D tCanvas;
uniform sampler2D tCanvasN;
uniform vec2 uEmblemCell;
uniform vec3 uTeam;
uniform vec3 uTrim;
uniform vec2 uStyle; // dye pattern, wear seed
varying vec2 vSUv;
varying vec2 vEmb;
varying vec4 vSInfo;
varying vec2 vDim;
${COMMON_GLSL}
${TANGENT_NORMAL_GLSL}
`;

const SAIL_MAIN = /* glsl */ `
vec2 suv = vSUv, wv = suv * vDim / 0.45;
float weave = dot(texture(tCanvas, wv).rgb, vec3(0.3, 0.59, 0.11)) / max(1e-3, dot(textureLod(tCanvas, wv, 12.0).rgb, vec3(0.3, 0.59, 0.11)));
vec3 canvasC = vec3(0.74, 0.68, 0.55) * (0.92 + 0.08 * vnoise(vec3(suv * vDim * 3.0, uStyle.y)));
vec3 dye = uTeam * (0.86 + 0.14 * vnoise(vec3(suv * vDim * 1.3, uStyle.y + 4.0)));
float cloth = suv.x * vDim.x / 0.09, st = uStyle.x, lat = vSInfo.y;
vec3 c = canvasC;
if (st < 0.5) c = dye;
else if (st < 1.5) c = mod(floor(cloth / 3.0), 2.0) < 1.0 ? dye : canvasC;
else if (st < 2.5) c = min(min(suv.x, 1.0 - suv.x) * vDim.x, (lat > 0.5 ? suv.y : 1.0 - suv.y) * vDim.y) < 0.2 ? dye : canvasC;
else c = suv.y < 0.45 ? dye : canvasC;
float paint = 0.0;
if (vSInfo.z > 0.5 && max(abs(vEmb.x), abs(vEmb.y)) < 1.0) {
  float disc = 1.0 - smoothstep(0.98, 1.0, length(vEmb));
  if (st > 0.5) c = mix(c, canvasC, disc * step(0.5, st) * step(st, 1.5) + disc * step(2.5, st) * step(suv.y, 0.45));
  float m = texture(tEmblem, (uEmblemCell + 0.5 + vEmb * 0.5) / ${CELLS}.0).r;
  c = mix(c, (st < 0.5 ? uTrim : uTeam) * 1.1 + 0.03, m);
  paint = m;
}
// sewn cloths, tabling and bolt ropes along the edges, reef bands with their points
float wc = fwidth(cloth), seam = (1.0 - smoothstep(0.0, max(0.06, wc), abs(fract(cloth) - 0.5) * 2.0 - 0.9)) * (1.0 - smoothstep(0.3, 0.8, wc));
float ex = min(suv.x, 1.0 - suv.x) * vDim.x, ey = min(suv.y, 1.0 - suv.y) * vDim.y;
float edge = 1.0 - smoothstep(0.015, 0.035, min(ex, ey));
float reef = 0.0;
if (lat < 0.5) {
  float ry = suv.y * vDim.y, band = abs(ry - 0.32) < 0.025 || abs(ry - 0.62) < 0.025 ? 1.0 : 0.0;
  float pts = step(abs(fract(suv.x * vDim.x / 0.11) - 0.5), 0.07) * (step(0.32, ry) * step(ry, 0.4) + step(0.62, ry) * step(ry, 0.7));
  reef = max(band * 0.6, pts * (1.0 - smoothstep(0.3, 0.9, fwidth(suv.x * vDim.x / 0.11))));
}
c *= 1.0 - 0.18 * seam - 0.3 * edge - 0.35 * reef;
c *= (0.85 + 0.15 * smoothstep(0.0, 0.5, suv.y + 0.3 * vnoise(vec3(suv * 5.0, uStyle.y)))) * mix(1.0, weave, 0.5);
float transmit = 0.55 * (1.0 - 0.5 * seam) * (1.0 - 0.8 * edge) * (1.0 - 0.6 * reef) * (1.0 - 0.6 * paint);
// rain soaks the canvas: darker, a little less translucent, never glossy
diffuseColor.rgb = c * (1.0 - 0.38 * uSky.wet);
transmit *= 1.0 - 0.3 * uSky.wet;
`;

const TRANSMIT_PARS = /* glsl */ `
uniform vec3 uKeyDir;
uniform vec3 uKeyColor;
uniform vec3 uAmbient;
${SHADOW_GLSL}`;

const TRANSMIT = /* glsl */ `
{
  // backlit canvas: key light and skylight come through the cloth, seams and paint show dark against it
  vec3 Lv = normalize((viewMatrix * vec4(uKeyDir, 0.0)).xyz);
  vec3 wp = (-vViewPosition - viewMatrix[3].xyz) * mat3(viewMatrix);
  float back = max(dot(-normal, Lv), 0.0) * skyKeyShadow(wp, vViewPosition.z);
  reflectedLight.directDiffuse += uKeyColor * diffuseColor.rgb * back * transmit * (1.0 / 3.14159);
  reflectedLight.indirectDiffuse += uAmbient * diffuseColor.rgb * 0.3 * transmit * skyAmbientScale(wp);
}
`;

const FLAG_VERT = /* glsl */ `
attribute vec2 aUv;
attribute vec4 aFlag; // bone, kind (pennant, ensign, jack), length, hoist
uniform float uWind; // apparent wind strength
uniform float uTime;
varying vec2 vFUv;
varying float vKind;
`;

const FLAG_FRAG = /* glsl */ `
uniform sampler2D tEmblem;
uniform vec2 uEmblemCell;
uniform vec3 uTeam;
uniform vec3 uTrim;
varying vec2 vFUv;
varying float vKind;
`;

const FLAG_MAIN = /* glsl */ `
vec2 fu = vFUv;
vec3 c = uTeam;
float transmit = 0.5;
if (vKind < 0.5) {
  if (fu.x > 0.8 && abs(fu.y - 0.5) < (fu.x - 0.8) * 2.2) discard; // swallowtail
  c = fu.x < 0.16 || abs(fu.y - 0.5) < 0.12 ? uTrim : uTeam;
} else if (vKind < 1.5) {
  vec2 e = vec2((0.5 - fu.x) * 1.6, (fu.y - 0.5) * 2.4);
  c = min(min(fu.x, 1.0 - fu.x), min(fu.y, 1.0 - fu.y) * 0.66) < 0.06 ? uTrim : uTeam;
  if (max(abs(e.x), abs(e.y)) < 1.0) {
    float m = texture(tEmblem, (uEmblemCell + 0.5 + e * 0.5) / ${CELLS}.0).r;
    c = mix(c, uTrim, m);
    transmit *= 1.0 - 0.5 * m;
  }
} else c = (fu.x < 0.5) == (fu.y < 0.5) ? uTeam : uTrim;
diffuseColor.rgb = c * 0.9 * (1.0 - 0.35 * uSky.wet);
`;

const LINE_VERT = /* glsl */ `
attribute vec3 aB;
attribute vec4 aL; // along, side, radius, sag
attribute vec4 aM; // bone A, bone B, tarred, masts whose fall parts it
uniform mat4 uBones[${BONES}];
uniform vec4 uSnap;
uniform float uSlack;
uniform vec2 uRes;
varying float vAcross;
varying float vHalf;
varying float vCover;
varying float vTar;
varying vec3 vSide;
varying vec3 vView;
varying vec3 vWorld;
#include <fog_pars_vertex>
void main() {
  vec3 A = (uBones[int(aM.x + 0.5)] * vec4(position, 1.0)).xyz;
  vec3 B = (uBones[int(aM.y + 0.5)] * vec4(aB, 1.0)).xyz;
  float snap = 0.0;
  for (int i = 0; i < 4; i++) if (mod(floor(aM.w / exp2(float(i))), 2.0) > 0.5) snap = max(snap, uSnap[i]);
  float t = aL.x, sag = (aL.w + uSlack + snap * 0.3) * length(B - A);
  vec3 P = mix(A, B, t) - vec3(0.0, 4.0 * sag * t * (1.0 - t), 0.0);
  vec3 T = (B - A) - vec3(0.0, 4.0 * sag * (1.0 - 2.0 * t), 0.0);
  vec4 mvPosition = modelViewMatrix * vec4(P, 1.0);
  vec3 side = normalize(cross(normalize(mat3(modelViewMatrix) * T), mvPosition.xyz));
  // one pixel at this depth; ropes keep a width of at least a pixel and fade by their true coverage
  float px = -mvPosition.z * 2.0 / (projectionMatrix[1][1] * uRes.y), rPx = aL.z / px, halfPx = max(rPx, 0.55);
  vCover = min(1.0, rPx / halfPx) * (1.0 - smoothstep(0.5, 1.0, snap));
  vHalf = halfPx;
  vAcross = aL.y * (halfPx + 0.75);
  mvPosition.xyz += side * aL.y * (halfPx + 0.75) * px;
  vSide = side;
  vView = mvPosition.xyz;
  vTar = aM.z;
  vWorld = (modelMatrix * vec4(P, 1.0)).xyz;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}
`;

const LINE_FRAG = /* glsl */ `
uniform vec3 uKeyDir;
uniform vec3 uKeyColor;
uniform vec3 uAmbient;
varying float vAcross;
varying float vHalf;
varying float vCover;
varying float vTar;
varying vec3 vSide;
varying vec3 vView;
varying vec3 vWorld;
#include <fog_pars_fragment>
${SHADOW_GLSL}
${POINT_LIGHTS_GLSL}
void main() {
  float a = clamp(vHalf + 0.5 - abs(vAcross), 0.0, 1.0) * vCover;
  if (a < 0.004) discard;
  float c = clamp(vAcross / max(vHalf, 1.0), -1.0, 1.0);
  vec3 N = normalize(vSide * c + normalize(-vView) * sqrt(1.0 - c * c));
  vec3 Lv = normalize((viewMatrix * vec4(uKeyDir, 0.0)).xyz), Nw = N * mat3(viewMatrix);
  vec3 base = vTar > 0.5 ? vec3(0.05, 0.04, 0.03) : vec3(0.3, 0.22, 0.13);
  float sh = skyKeyShadow(vWorld, -vView.z);
  vec3 light = uKeyColor * (0.75 * max(dot(N, Lv), 0.0) + 0.25) * sh / 3.14159
             + uAmbient * skyAmbientScale(vWorld) + skyPointLights(vWorld, Nw, 0.3) / 3.14159;
  gl_FragColor = vec4(base * light, a);
  #include <fog_fragment>
}
`;

/** Patch a standard (or depth) material: bones, then `vert`'s extra deformation and `frag`'s shading. */
interface Patch { vertPars: string; vertMain?: string; normal?: string; begin: string; fragPars?: string; frag?: Record<string, string> }

function patch(m: THREE.Material, u: Record<string, THREE.IUniform>, key: string, o: Patch): void {
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>\n${BONE_PARS}${o.vertPars}`)
      .replace('void main() {', `void main() {\n${o.vertMain ?? ''}`)
      .replace('#include <beginnormal_vertex>', o.normal ?? '#include <beginnormal_vertex>')
      .replace('#include <begin_vertex>', o.begin);
    if (o.fragPars) sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>\n${o.fragPars}`);
    for (const [chunk, code] of Object.entries(o.frag ?? {})) sh.fragmentShader = sh.fragmentShader.replace(`#include <${chunk}>`, code);
  };
  m.customProgramCacheKey = () => key;
}

const HULL_PATCH = {
  vertPars: HULL_VERT,
  vertMain: 'mat4 boneM = uBones[int(aInfo.x + 0.5)];\nvWUv = aUv;\nvInfo = aInfo;\nvLocal = position;',
  normal: 'vec3 objectNormal = mat3(boneM) * normal;',
  begin: 'vec3 transformed = (boneM * vec4(position, 1.0)).xyz;',
};
const SAIL_PATCH = {
  vertPars: SAIL_VERT,
  vertMain: /* glsl */ `
  int slot = int(aSail.x + 0.5);
  vec4 st = uSail[slot];
  mat4 boneM = uBones[slot < 4 ? ${bBrace(0)} + 2 * slot : 0];
  float e = 0.02, bl = sailBelly(aUv, st);
  vec3 tu = aTu + normal * (sailBelly(aUv + vec2(e, 0.0), st) - sailBelly(aUv - vec2(e, 0.0), st)) / (2.0 * e);
  vec3 tv = aTv + normal * (sailBelly(aUv + vec2(0.0, e), st) - sailBelly(aUv - vec2(0.0, e), st)) / (2.0 * e);
  vec3 bentN = normalize(cross(tu, tv));
  vSUv = aUv;
  vEmb = aEmb;
  vSInfo = vec4(aSail.x, aSail.y, aSail.w, st.w);
  vDim = vec2(length(aTu), length(aTv));`,
  normal: 'vec3 objectNormal = mat3(boneM) * bentN;',
  begin: 'vec3 transformed = (boneM * vec4(position + normal * bl, 1.0)).xyz;',
};
const FLAG_PATCH = {
  vertPars: FLAG_VERT,
  vertMain: /* glsl */ `
  mat4 boneM = uBones[int(aFlag.x + 0.5)];
  float s = aUv.x, L = aFlag.z, str = uWind, ph = aFlag.x * 2.1;
  float amp = (0.04 + 0.08 * str) * L * pow(s, 1.15), w = 6.2832 * (1.8 * s - (1.2 + 2.4 * str) * uTime) + ph + aUv.y * 0.5;
  float dx = amp * sin(w) + 0.25 * amp * sin(2.3 * w + 1.0);
  float dxs = (0.04 + 0.08 * str) * L * (1.15 * pow(max(s, 1e-3), 0.15) * sin(w) + pow(s, 1.15) * 6.2832 * 1.8 * cos(w));
  float droop = L * s * s * 0.45 * clamp(1.0 - str, 0.0, 1.0);
  vec3 flagD = vec3(dx, -droop, droop * 0.4 * s);
  vec3 flagN = normalize(vec3(1.0, 0.0, dxs / L));
  vFUv = aUv;
  vKind = aFlag.y;`,
  normal: 'vec3 objectNormal = mat3(boneM) * flagN;',
  begin: 'vec3 transformed = (boneM * vec4(position + flagD, 1.0)).xyz;',
};

// ---------------------------------------------------------------------------------------------
// Per-class kits: geometry for three levels of detail, plus where the bones pivot.

interface Lod { hull: THREE.BufferGeometry; sails: THREE.BufferGeometry; lines: THREE.BufferGeometry; flags: THREE.BufferGeometry }
interface Kit {
  form: Form;
  masts: Mast[];
  fit: Fittings;
  lods: Lod[];
  flags: THREE.Vector3[]; // pivot of each flag bone, by flag slot
}

const LOD_NEAR = 42, LOD_FAR = 130;
/** Angle past the camera's horizon at which a masthead still shows. */
const HORIZON = Math.acos((R - 1) / (R + 7));

function buildKit(cls: ShipClass, hero: boolean): Kit {
  const form = new Form(SPECS[cls], HULL_LENGTH[cls]);
  const lods: Lod[] = [];
  let masts: Mast[] = [], fit: Fittings | null = null;
  const pivots: THREE.Vector3[] = [];
  for (let lod = 0; lod < 3; lod++) {
    const hm = new Mesher(), sm = new SailMesher(), ropes: Rope[] = [], mounts: FlagMount[] = [];
    const ft = buildHull(hm, form, lod, hero);
    const ms = buildRig(form, ft, lod, hm, sm, ropes, mounts);
    if (lod < 2) buildFittings(form, ms, lod, hero, hm);
    if (!lod) {
      masts = ms;
      fit = ft;
      for (const fm of mounts) pivots[fm.bone - bFlag(0)] = fm.at;
    }
    const L = { hull: hm.build(), sails: sm.build(), lines: buildLines(ropes), flags: buildFlags(mounts, lod) };
    const sphere = new THREE.Sphere(V(0, 2.4, 0), form.L * 0.95 + 1.5);
    for (const g of Object.values(L)) g.boundingSphere = sphere;
    lods.push(L);
  }
  return { form, masts, fit: fit!, lods, flags: pivots };
}

// ---------------------------------------------------------------------------------------------
// Runtime

const AFLOAT = 0, SINKING = 1, GONE = 2, RISING = 3;
const SINK_TIME = 5, RISE_TIME = 2.6;

interface Rig {
  id: number;
  kit: Kit;
  group: THREE.Group;
  meshes: THREE.Mesh[]; // hull, sails, flags, lines
  lod: number;
  bones: Float32Array;
  sail: THREE.Vector4[];
  snap: THREE.Vector4;
  slack: { value: number };
  lamp: { value: number };
  wind: { value: number };
  light: LightSource;
  state: number;
  t: number;
  anchor: THREE.Vector3; // sinking: where it went down
  heading: THREE.Vector3;
  list: number; // sinking: which side it rolls to
  dive: number; // sinking: bow (+1) or stern first
  falls: number[]; // sinking: when each mast goes
  // motion state
  heave: Spring; pitch: Spring; roll: Spring; heel: number;
  brace: number[]; fill: Spring[]; luff: number[]; side: number[]; // per mast
  rudder: number; yaw: number[]; topple: number[];
}

const _m = new THREE.Matrix4(), _m2 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion();
const _v = V(), _w = V(), _port = V(), _p4 = new THREE.Vector4(), _wind = { x: 0, y: 0, z: 0 } as V3;
const X_AXIS = V(1, 0, 0), Z_AXIS = V(0, 0, 1);

/** A damped spring's state. */
interface Spring { x: number; v: number }
const spring = (x = 0): Spring => ({ x, v: 0 });
/** Advance a spring towards `target` (natural frequency w, damping ratio z); returns its position. */
function step(s: Spring, target: number, w: number, z: number, dt: number): number {
  s.v += (w * w * (target - s.x) - 2 * z * w * s.v) * dt;
  return (s.x += s.v * dt);
}
/** Soft limit of x to ±k. */
const soft = (x: number, k: number) => k * Math.tanh(x / k);
const _ma = new THREE.Matrix4(), _mb = new THREE.Matrix4(), _mc = new THREE.Matrix4();
/** Rotation by `ang` about the line through `at` along `axis`, into `out`. */
function about(out: THREE.Matrix4, at: THREE.Vector3, axis: THREE.Vector3, ang: number): THREE.Matrix4 {
  return out.makeTranslation(at.x, at.y, at.z).multiply(_mc.makeRotationAxis(axis, ang)).multiply(_mb.makeTranslation(-at.x, -at.y, -at.z));
}

export class Ships {
  readonly poses: ShipPose[];
  private readonly ctx: Ctx;
  private readonly rigs: Rig[] = [];
  private readonly tokens: THREE.InstancedMesh[] = [];

  constructor(ctx: Ctx) {
    this.ctx = ctx;
    const sky = ctx.sky.u;
    const tex = {
      tWood: { value: loadTexture(hullColorUrl, true) },
      tWoodN: { value: loadTexture(hullNormalUrl, false) },
      tDeck: { value: loadTexture(deckColorUrl, true) },
      tDeckN: { value: loadTexture(deckNormalUrl, false) },
      tIron: { value: loadTexture(ironColorUrl, true) },
      tCanvas: { value: loadTexture(canvasColorUrl, true) },
      tCanvasN: { value: loadTexture(canvasNormalUrl, false) },
      tEmblem: { value: emblemAtlas() },
    };
    const kits = new Map<string, Kit>(); // by class, the hero's galleon apart
    this.poses = ctx.sim.ships.map((s) => ({
      id: s.id, visible: true, pos: V(), quat: new THREE.Quaternion(), up: V(), fwd: V(), speed: 0, heel: 0,
      length: HULL_LENGTH[s.cls], sink: 0, rise: 1,
    }));
    for (const s of ctx.sim.ships) {
      const hero = s.id === 0, name = s.cls + (hero ? '+' : '');
      const kit = kits.get(name) ?? buildKit(s.cls, hero);
      kits.set(name, kit);
      const rng = new Rng((ctx.seed * 131 + s.id * 977) >>> 0);
      const bones = new Float32Array(BONES * 16);
      for (let b = 0; b < BONES; b++) _m.identity().toArray(bones, b * 16);
      const own = {
        uBones: { value: bones },
        uTeam: { value: teamColor(s.id) },
        uTrim: { value: new THREE.Color().setHex(TEAMS[s.id].trim, THREE.SRGBColorSpace) },
        uEmblemCell: { value: new THREE.Vector2(s.id % CELLS, Math.floor(s.id / CELLS)) },
      };
      const sail = Array.from({ length: 5 }, () => new THREE.Vector4(0.6, 0.1, 1, 0));
      const lamp = { value: 0 }, wind = { value: 1 }, snap = new THREE.Vector4(), slack = { value: 0 };
      const ports = kit.fit.ports.concat([new THREE.Vector4(), new THREE.Vector4()]).slice(0, 2);
      const strakeH = (kit.form.s.rail + kit.form.s.draft) / kit.form.s.strakes;
      const hullU = {
        ...sky, ...tex, ...own, uLamp: lamp, uPorts: { value: ports },
        uScheme: { value: new THREE.Vector4(s.id === 0 ? 0 : (s.id * 3) % 5, kit.form.s.paintFrom, strakeH, rng.next() * 10) },
      };
      const sailU = { ...sky, ...tex, ...own, uSail: { value: sail }, uStyle: { value: new THREE.Vector2(s.id === 0 ? 0 : s.id % 4, rng.next() * 10) } };
      const flagU = { ...sky, ...tex, ...own, uWind: wind };

      const hullM = new THREE.MeshStandardMaterial();
      patch(hullM, hullU, 'ship-hull', {
        ...HULL_PATCH, fragPars: HULL_FRAG, frag: {
          map_fragment: HULL_MAIN,
          roughnessmap_fragment: 'float roughnessFactor = rough;',
          metalnessmap_fragment: 'float metalnessFactor = metal;',
          normal_fragment_maps: 'normal = tangentNormal(normal, -vViewPosition, nuv, vec3(tn.xy * nAmt, tn.z));',
          emissivemap_fragment: 'totalEmissiveRadiance = emis;',
          aomap_fragment: 'reflectedLight.indirectDiffuse *= vInfo.z;\nreflectedLight.indirectSpecular *= vInfo.z;',
        },
      });
      applyWeather(hullM, 0.4);
      const sailM = new THREE.MeshStandardMaterial({ side: THREE.DoubleSide, roughness: 0.92 });
      patch(sailM, sailU, 'ship-sail', {
        ...SAIL_PATCH, fragPars: SAIL_FRAG + TRANSMIT_PARS, frag: {
          clipping_planes_fragment: TEAR,
          map_fragment: SAIL_MAIN,
          normal_fragment_maps: 'normal = tangentNormal(normal, -vViewPosition, wv, vec3((texture(tCanvasN, wv).xy * 2.0 - 1.0) * 0.6, 1.0));',
          lights_fragment_end: `#include <lights_fragment_end>\n${TRANSMIT}`,
        },
      });
      const flagM = new THREE.MeshStandardMaterial({ side: THREE.DoubleSide, roughness: 0.9 });
      patch(flagM, flagU, 'ship-flag', {
        ...FLAG_PATCH, fragPars: FLAG_FRAG + TRANSMIT_PARS,
        frag: { map_fragment: FLAG_MAIN, lights_fragment_end: `#include <lights_fragment_end>\n${TRANSMIT}` },
      });
      const lineM = new THREE.ShaderMaterial({
        uniforms: { ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog), ...sky, uBones: own.uBones, uSnap: { value: snap }, uSlack: slack, uRes: ctx.pipeline.u.uResolution },
        vertexShader: LINE_VERT, fragmentShader: LINE_FRAG, transparent: true, depthWrite: false, fog: true, side: THREE.DoubleSide,
      });
      const depth = (p: Patch, u: Record<string, THREE.IUniform>, key: string) => {
        const d = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
        patch(d, u, key, p);
        return d;
      };
      const lod0 = kit.lods[0];
      const hull = new THREE.Mesh(lod0.hull, hullM), sails = new THREE.Mesh(lod0.sails, sailM);
      const flags = new THREE.Mesh(lod0.flags, flagM), lines = new THREE.Mesh(lod0.lines, lineM);
      hull.customDepthMaterial = depth(HULL_PATCH, hullU, 'ship-hull-depth');
      sails.customDepthMaterial = depth({
        ...SAIL_PATCH, fragPars: `varying vec2 vSUv;\nvarying vec4 vSInfo;\n${COMMON_GLSL}`, frag: { clipping_planes_fragment: TEAR },
      }, sailU, 'ship-sail-depth');
      hull.castShadow = hull.receiveShadow = sails.castShadow = sails.receiveShadow = flags.receiveShadow = true;
      const group = new THREE.Group();
      group.add(hull, sails, flags, lines);
      ctx.scene.add(group);
      const light: LightSource = { pos: V(), color: new THREE.Color(1, 0.58, 0.26), intensity: 0, range: 10 };
      ctx.sky.lights.add(light);
      const nm = kit.masts.length;
      this.rigs.push({
        id: s.id, kit, group, meshes: [hull, sails, flags, lines], lod: 0, bones, sail, snap, slack, lamp, wind, light,
        state: AFLOAT, t: 0, anchor: V(), heading: V(), list: 1, dive: 1, falls: [],
        heave: spring(), pitch: spring(), roll: spring(), heel: 0,
        brace: new Array(nm).fill(0), fill: Array.from({ length: nm }, () => spring(0.6)), luff: new Array(nm).fill(0),
        side: new Array(nm).fill(1), rudder: 0, yaw: new Array(6).fill(0), topple: new Array(nm).fill(0),
      });
    }
    this.buildTokens();
  }

  /** Tiny ships for the globe menu: one instanced mesh per hull design, sails in team colours. */
  private buildTokens(): void {
    const byKit = new Map<Kit, number[]>();
    for (const r of this.rigs) byKit.set(r.kit, [...(byKit.get(r.kit) ?? []), r.id]);
    for (const [kit, ids] of byKit) {
      const lod = kit.lods[2];
      const parts = [lod.hull, lod.sails].map((g, k) => {
        const p = g.getAttribute('position'), n = g.getAttribute('normal');
        const out = new THREE.BufferGeometry();
        out.setAttribute('position', p);
        out.setAttribute('normal', n);
        out.setAttribute('aTint', new THREE.Float32BufferAttribute(new Array(p.count).fill(k), 1));
        out.setIndex(g.getIndex());
        return out;
      });
      const merged = mergeGeometries(parts);
      const mat = new THREE.MeshStandardMaterial({ color: 0x5a3c22, roughness: 0.8 });
      mat.onBeforeCompile = (sh) => {
        sh.vertexShader = sh.vertexShader
          .replace('#include <common>', '#include <common>\nattribute float aTint;\nvarying float vTint;')
          .replace('#include <begin_vertex>', '#include <begin_vertex>\nvTint = aTint;');
        sh.fragmentShader = sh.fragmentShader
          .replace('#include <common>', '#include <common>\nvarying float vTint;')
          .replace('#include <color_fragment>', '#if defined( USE_INSTANCING_COLOR )\ndiffuseColor.rgb = mix(diffuseColor.rgb, vColor, vTint);\n#endif');
      };
      mat.customProgramCacheKey = () => 'ship-token';
      const im = new THREE.InstancedMesh(merged, mat, ids.length);
      ids.forEach((id, i) => im.setColorAt(i, teamColor(id)));
      im.layers.set(LAYER.GLOBE);
      im.frustumCulled = false;
      im.userData.ids = ids;
      this.tokens.push(im);
      this.ctx.scene.add(im);
    }
  }

  update(f: Frame): void {
    const sim = this.ctx.sim, dt = Math.min(Math.max(f.dt, 1e-4), 0.05), env = f.env;
    for (const e of f.events) {
      if (e.type === 'sink') {
        const r = this.rigs[e.ship], rng = new Rng((e.tick * 7919 + e.ship * 31) >>> 0);
        r.state = SINKING;
        r.t = 0;
        r.anchor.set(e.pos.x, e.pos.y, e.pos.z);
        r.heading.set(e.fwd.x, e.fwd.y, e.fwd.z);
        r.list = rng.next() < 0.5 ? -1 : 1;
        r.dive = rng.next() < 0.6 ? 1 : -1;
        r.falls = r.kit.masts.map((_, i) => 0.9 + rng.next() * 1.4 + i * 0.25);
      } else if (e.type === 'respawn') {
        const r = this.rigs[e.ship];
        r.state = RISING;
        r.t = 0;
        r.heave.x = -2.6;
        r.heave.v = 2.5;
        r.pitch.x = 0.3;
        r.roll.x = 0.12;
        r.topple.fill(0);
        for (const sp of r.fill) sp.x = sp.v = 0;
      }
    }
    const cam = f.camera.position, hc = Math.acos(Math.min(1, (R - 1) / cam.length()));
    const night = smoothstep(0.2, 0.62, env.night);
    for (const r of this.rigs) {
      const s = sim.ships[r.id], p = this.poses[r.id], kit = r.kit, L = kit.form.L, B = kit.form.s.beam;
      r.t += dt;
      if (r.state === SINKING && r.t > SINK_TIME) r.state = GONE;
      if (r.state === RISING && r.t > RISE_TIME) r.state = AFLOAT;
      const down = r.state === SINKING || r.state === GONE;
      // heading and position on the sphere
      if (down) {
        const drift = 2.2 * (1 - Math.exp(-r.t / 1.4));
        p.up.copy(r.anchor).multiplyScalar(R).addScaledVector(r.heading, drift).normalize();
        p.fwd.copy(r.heading).addScaledVector(p.up, -r.heading.dot(p.up)).normalize();
        p.speed = 4 * Math.exp(-r.t);
      } else {
        p.up.set(s.prevPos.x, s.prevPos.y, s.prevPos.z).lerp(_v.set(s.pos.x, s.pos.y, s.pos.z), f.alpha).normalize();
        p.fwd.set(s.prevFwd.x, s.prevFwd.y, s.prevFwd.z).lerp(_v.set(s.fwd.x, s.fwd.y, s.fwd.z), f.alpha);
        p.fwd.addScaledVector(p.up, -p.fwd.dot(p.up)).normalize();
        p.speed = s.speed;
      }
      _port.crossVectors(p.up, p.fwd);
      p.visible = r.state !== GONE;
      p.sink = r.state === SINKING ? Math.min(1, r.t / SINK_TIME) : r.state === GONE ? 1 : 0;
      p.rise = r.state === RISING ? Math.min(1, r.t / RISE_TIME) : r.state === AFLOAT ? 1 : 0;
      // the waterline amidships follows the sea under it; bow, stern and beams (sampled only for ships in
      // sight) add the pitch and roll
      const seen = p.visible && cam.angleTo(p.up) < hc + HORIZON;
      const hm = this.sea(p, 0, 0, f);
      const hb = seen ? this.sea(p, L * 0.4, 0, f) : hm, hs = seen ? this.sea(p, -L * 0.4, 0, f) : hm;
      const hp = seen ? this.sea(p, 0, B * 0.55, f) : hm, hst = seen ? this.sea(p, 0, -B * 0.55, f) : hm;
      const storm = env.storm, sp = p.speed / 9;
      const chop = Math.sin(f.t * 2.9 + r.id * 1.7) * Math.sin(f.t * 1.3 + r.id);
      step(r.heave, 0.6 * hm + 0.1 * (hb + hs + hp + hst) + 0.03 * chop * sp, 6, 0.75, dt);
      step(r.pitch, soft(Math.atan2(hb - hs, L * 0.8), 0.2) + 0.015 * chop * sp * (1 + 2 * storm), 2.8, 0.5, dt);
      step(r.roll, soft(Math.atan2(hp - hst, B * 1.1) * (1 + 0.3 * storm), 0.3), 2.1 - 0.4 * storm, 0.22 - 0.08 * storm, dt);
      // apparent wind in the ship's frame drives trim, fill and flags
      wind(p.up, f.simTime, _wind);
      _v.set(_wind.x, _wind.y, _wind.z).multiplyScalar(11).addScaledVector(p.fwd, -p.speed * 0.55);
      const ax = _v.dot(_port), az = _v.dot(p.fwd), str = Math.min(1.4, Math.hypot(ax, az) / 9);
      const phi = Math.atan2(ax, az), gust = 1 + 0.12 * Math.sin(f.t * 0.7 + r.id) * Math.sin(f.t * 1.9 + r.id * 3);
      const riseK = r.state === RISING ? smoothstep(0.15, 1, r.t / RISE_TIME) : down ? 0 : 1;
      let fillSum = 0;
      for (let i = 0; i < kit.masts.length; i++) {
        let tf: number, side = 1;
        if (kit.masts[i].square) {
          // yards square to the wind as far as the shrouds allow; the sails draw until nearly head to wind
          r.brace[i] += (Math.max(-0.42, Math.min(0.42, phi)) - r.brace[i]) * (1 - Math.exp(-dt * 0.7));
          tf = 1 - smoothstep(2.2, 2.85, Math.abs(phi));
        } else {
          const lee = ax >= 0 ? 1 : -1, mag = 0.15 * Math.pow(1 - Math.abs(phi) / Math.PI, 0.7) + 0.07;
          r.brace[i] += (-lee * mag - r.brace[i]) * (1 - Math.exp(-dt * 0.6));
          const wn = (ax * Math.cos(r.brace[i]) - az * Math.sin(r.brace[i])) / Math.max(1e-3, Math.hypot(ax, az));
          tf = 1 - smoothstep(2.5, 3.0, Math.abs(phi));
          side = Math.max(-1, Math.min(1, wn * 4));
        }
        tf *= Math.min(1.15, str * gust) * riseK;
        fillSum += step(r.fill[i], tf, 7.5, 0.3, dt);
        r.luff[i] += ((1 - smoothstep(0.15, 0.55, tf)) * Math.min(1, str) + 0.06 - r.luff[i]) * (1 - Math.exp(-dt * 3));
        r.side[i] += (side - r.side[i]) * (1 - Math.exp(-dt * 2.5));
      }
      // heel: outward in a turn, to leeward under sail
      const heelT = Math.max(-0.2, Math.min(0.2, s.turn * p.speed * 0.011)) - 0.07 * Math.max(-1, Math.min(1, ax / 9)) * (fillSum / kit.masts.length);
      r.heel += ((down ? 0 : heelT) - r.heel) * (1 - Math.exp(-dt * 1.6));
      let heel = r.roll.x + r.heel, pitch = r.pitch.x, depth = -r.heave.x, tear = 0, slackK = 0;
      if (down) {
        const k = Math.min(1, r.t / SINK_TIME);
        heel += r.list * 0.95 * smoothstep(0, 0.65, k);
        pitch -= r.dive * 0.4 * smoothstep(0.25, 1, k);
        depth += 0.25 * r.t + 7.5 * Math.pow(smoothstep(0.3, 1, k), 1.6);
        tear = 0.85 * smoothstep(0.12, 0.8, k);
        slackK = 0.04 * smoothstep(0, 0.3, k);
        for (let i = 0; i < r.falls.length; i++) r.topple[i] = Math.min(1.5, 1.6 * Math.max(0, r.t - r.falls[i]) ** 2);
      }
      p.heel = heel;
      p.pos.copy(p.up).multiplyScalar(R - depth);
      _m.makeBasis(_port, p.up, p.fwd);
      p.quat.setFromRotationMatrix(_m).multiply(_q.setFromAxisAngle(Z_AXIS, heel)).multiply(_q2.setFromAxisAngle(X_AXIS, -pitch));
      r.group.position.copy(p.pos);
      r.group.quaternion.copy(p.quat);
      // visibility and level of detail
      r.group.visible = seen;
      if (!seen) continue;
      const dist = cam.distanceTo(p.pos);
      const lod = dist < LOD_NEAR * (r.lod > 0 ? 0.9 : 1.1) ? 0 : dist < LOD_FAR * (r.lod > 1 ? 0.9 : 1.1) ? 1 : 2;
      if (lod !== r.lod) {
        r.lod = lod;
        const g = kit.lods[lod];
        [r.meshes[0].geometry, r.meshes[1].geometry, r.meshes[2].geometry, r.meshes[3].geometry] = [g.hull, g.sails, g.flags, g.lines];
      }
      r.meshes[3].visible = lod < 2;
      // sails, flags, lights
      // sail slots follow their masts; the spritsail (slot 4) follows the foremast
      for (let i = 0; i < 5; i++) {
        const k = i < kit.masts.length ? i : kit.masts.length - 1;
        r.sail[i].set(r.fill[k].x, down ? 1 : r.luff[k], r.side[k], tear);
      }
      r.wind.value = str;
      for (let i = 0; i < 4; i++) r.snap.setComponent(i, smoothstep(0, 0.35, r.topple[i] ?? 0));
      r.slack.value = slackK;
      const lampOn = night * (down ? 1 - smoothstep(0.2, 0.45, p.sink) : 1) * (0.9 + 0.1 * Math.sin(f.t * 9 + r.id));
      r.lamp.value = lampOn;
      r.light.intensity = 5 * lampOn;
      r.light.pos.copy(kit.fit.lamp).applyQuaternion(p.quat).add(p.pos);
      this.bones(r, s.rudder, phi, f.t, dt);
    }
    this.updateTokens();
  }

  /** Height of the sea `dz` ahead and `dx` to port of the ship. */
  private sea(p: ShipPose, dz: number, dx: number, f: Frame): number {
    _w.copy(p.up).multiplyScalar(R).addScaledVector(p.fwd, dz).addScaledVector(_port, dx).normalize();
    return swell(_w, f.t, f.simTime, _p4).w;
  }

  /** Rudder, mast falls, yard braces and flag yaws into the ship's bone palette. */
  private bones(r: Rig, rudder: number, phi: number, t: number, dt: number): void {
    const kit = r.kit, b = r.bones;
    r.rudder += (-rudder * 0.55 - r.rudder) * (1 - Math.exp(-dt * 3));
    const [r0, r1] = kit.fit.rudder;
    about(_m, r0, _v.subVectors(r1, r0).normalize(), r.rudder).toArray(b, B_RUDDER * 16);
    for (let i = 0; i < kit.masts.length; i++) {
      const m = kit.masts[i], mast = about(_m2, m.foot, Z_AXIS, -r.list * r.topple[i]);
      mast.toArray(b, bMast(i) * 16);
      _m.copy(mast).multiply(about(_ma, m.foot, m.dir, r.brace[i])).toArray(b, bBrace(i) * 16);
      // pennants stream down the apparent wind
      r.yaw[i] += Math.atan2(Math.sin(phi + Math.PI - r.yaw[i]), Math.cos(phi + Math.PI - r.yaw[i])) * (1 - Math.exp(-dt * 4));
      _m.copy(mast).multiply(about(_ma, kit.flags[i], m.dir, r.yaw[i] + 0.12 * Math.sin(t * 2.3 + i))).toArray(b, bFlag(i) * 16);
    }
    for (let k = 4; k < 6; k++) {
      const at = kit.flags[k];
      if (!at) continue;
      const target = k === 4 ? Math.max(-1.9, Math.min(1.9, Math.atan2(Math.sin(phi + Math.PI), Math.cos(phi + Math.PI)))) : phi + Math.PI;
      r.yaw[k] += Math.atan2(Math.sin(target - r.yaw[k]), Math.cos(target - r.yaw[k])) * (1 - Math.exp(-dt * 4));
      about(_m, at, _w.set(0, 1, 0), r.yaw[k]).toArray(b, bFlag(k) * 16);
    }
  }

  private updateTokens(): void {
    for (const im of this.tokens) {
      const ids = im.userData.ids as number[];
      for (let i = 0; i < ids.length; i++) {
        const p = this.poses[ids[i]];
        _m.compose(p.pos, p.quat, _v.setScalar(p.visible && p.sink < 0.6 ? 3 : 0));
        im.setMatrixAt(i, _m);
      }
      im.instanceMatrix.needsUpdate = true;
    }
  }
}

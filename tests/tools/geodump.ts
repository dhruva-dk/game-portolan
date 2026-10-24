// Top-down debug charts of the geography, for reviewing each region's design: depth washes, land shaded by height,
// coast rings, zones (kelp dots, tidal hatching, hot water, the Great Lagoon, harbour waters, pack ice, the vortex),
// sites (lights ■, harbours ○, the landmark's ring, wrecks ×, caches •, falls, stacks), floes at t = 0, the designed
// Great Current passes (dashed) and the fixed lanes. Writes progress/shots/wp03-<region>.png (±90 u, 3 px/u),
// progress/shots/wp03-world.png (equirectangular) and, with --sheet <path>, a contact sheet of all twelve.
//   node tests/tools/geodump.ts [--sheet out.png] [--only <regionId>]
import { mkdirSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { dirname } from 'node:path';
import { performance } from 'node:perf_hooks';
import { v3, type V3 } from '../../src/sim/math.ts';
import { TERRITORY, cellOf } from '../../src/sim/sphere.ts';
import { DRAFT, REGIONS } from '../../src/sim/world/regions.ts';
import {
  ZONE, buildGeography, coastAt, heightAt, toChart, toWorld, type Geography,
} from '../../src/sim/world/geography.ts';

const ROOT = new URL('../../', import.meta.url).pathname;

// --- PNG -------------------------------------------------------------------------------------------------------
const CRC = new Int32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c;
});
function crc32(b: Uint8Array): number {
  let c = -1;
  for (const x of b) c = CRC[(c ^ x) & 255] ^ (c >>> 8);
  return ~c >>> 0;
}
function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length), dv = new DataView(out.buffer);
  dv.setUint32(0, data.length);
  out.set(new TextEncoder().encode(type), 4);
  out.set(data, 8);
  dv.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}
export function png(w: number, h: number, rgb: Uint8Array): Uint8Array {
  const raw = new Uint8Array(h * (w * 3 + 1));
  for (let y = 0; y < h; y++) raw.set(rgb.subarray(y * w * 3, (y + 1) * w * 3), y * (w * 3 + 1) + 1);
  const head = new Uint8Array(13), dv = new DataView(head.buffer);
  dv.setUint32(0, w); dv.setUint32(4, h); head[8] = 8; head[9] = 2;
  const parts = [new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', head), chunk('IDAT', deflateSync(raw)), chunk('IEND', new Uint8Array())];
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}

// --- Colours ---------------------------------------------------------------------------------------------------
type C = [number, number, number];
const lerp = (a: C, b: C, t: number): C => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const PARCH: C = [239, 224, 192], INK: C = [42, 33, 28], INDIGO: C = [38, 53, 87], ULTRA: C = [52, 86, 160];
const VERD: C = [96, 170, 156], PALE: C = [190, 222, 205], OCHRE: C = [208, 155, 69], UMBER: C = [135, 97, 61];
const GREEN: C = [47, 138, 88], VERM: C = [217, 71, 43], GOLD: C = [212, 166, 74], WHITE: C = [248, 243, 231];

function seaColour(h: number): C {
  if (h > -2) return lerp(PALE, VERD, (h + 2 + DRAFT) / 2);
  if (h > -8) return lerp(VERD, ULTRA, (-2 - h) / 6);
  return lerp(ULTRA, INDIGO, Math.min(1, (-8 - h) / 30));
}

// --- Region charts ---------------------------------------------------------------------------------------------
const SPAN = 90, PX = 3, W = 2 * SPAN * PX;

function regionImage(geo: Geography, ri: number): Uint8Array {
  const img = new Uint8Array(W * W * 3), p = v3(), q = v3(), e = 0.6;
  const put = (x: number, y: number, c: C, a = 1) => {
    if (x < 0 || y < 0 || x >= W || y >= W) return;
    const o = (y * W + x) * 3;
    for (let k = 0; k < 3; k++) img[o + k] = img[o + k] + (c[k] - img[o + k]) * a;
  };
  const toPx = (x: number, y: number): [number, number] => [Math.round((x + SPAN) * PX), Math.round((SPAN - y) * PX)];
  for (let py = 0; py < W; py++) {
    for (let px = 0; px < W; px++) {
      const x = px / PX - SPAN, y = SPAN - py / PX;
      toWorld(ri, x, y, p);
      const h = heightAt(geo, p), cd = coastAt(geo, p), cell = cellOf(TERRITORY, p), z = geo.zones[cell];
      let c: C;
      if (h >= -DRAFT) {
        // land: parchment to umber by height, shaded from the north-west
        const hx = heightAt(geo, toWorld(ri, x + e, y, q)) - heightAt(geo, toWorld(ri, x - e, y, q));
        const hy = heightAt(geo, toWorld(ri, x, y + e, q)) - heightAt(geo, toWorld(ri, x, y - e, q));
        const shade = Math.max(-0.5, Math.min(0.5, (-hx + hy) * 0.35));
        c = h < 0.4 ? lerp(PARCH, OCHRE, 0.35) : lerp(lerp(PARCH, OCHRE, 0.5), UMBER, Math.min(1, h / 30));
        c = shade > 0 ? lerp(c, WHITE, shade) : lerp(c, INK, -shade * 0.8);
      } else {
        c = seaColour(h);
        // coast rings, as on the old charts
        for (const ring of [1.5, 3.5, 6, 9.5]) if (Math.abs(cd - ring) < 0.18 + ring * 0.01) c = lerp(c, INK, 0.45 - ring * 0.03);
        if (z & ZONE.lagoon) c = lerp(c, WHITE, 0.25);
        if (z & ZONE.harbour) c = lerp(c, ULTRA, 0.3);
        if (z & ZONE.hot) c = lerp(c, VERM, 0.45);
        if (z & ZONE.pack) c = lerp(c, WHITE, 0.18);
        if (z & ZONE.kelp && (px * 7 + py * 3) % 11 < 3) c = lerp(c, GREEN, 0.8);
      }
      if (z & ZONE.tidal && (px + py) % 6 < 2) c = lerp(c, UMBER, 0.6);
      if (Math.abs(cd) < 0.25) c = INK;
      put(px, py, c);
    }
  }
  const mark = (pos: V3, draw: (x: number, y: number) => void) => {
    const l = toChart(ri, pos), [x, y] = toPx(l.x, l.y);
    draw(x, y);
  };
  const disc = (cx: number, cy: number, r: number, c: C, a = 1) => {
    for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) if (x * x + y * y <= r * r) put(cx + x, cy + y, c, a);
  };
  const circle = (cx: number, cy: number, r: number, c: C) => {
    for (let a = 0; a < 720; a++) put(Math.round(cx + r * Math.cos(a / 114.6)), Math.round(cy + r * Math.sin(a / 114.6)), c);
  };
  const line = (x0: number, y0: number, x1: number, y1: number, c: C, dash = 0) => {
    const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0)));
    for (let i = 0; i <= n; i++) if (!dash || i % dash < dash / 2) put(Math.round(x0 + ((x1 - x0) * i) / n), Math.round(y0 + ((y1 - y0) * i) / n), c);
  };
  const reg = REGIONS[ri];
  for (const pass of reg.passes) {
    for (let k = 0; k + 3 < pass.length; k += 2) {
      const [a, b] = toPx(pass[k], pass[k + 1]), [c2, d] = toPx(pass[k + 2], pass[k + 3]);
      line(a, b, c2, d, [160, 60, 160], 8);
    }
  }
  for (const s of geo.stacks) if (s.region === ri) mark(s.pos, (x, y) => disc(x, y, Math.max(1, Math.round(s.r * PX * 0.6)), INK));
  for (const f of geo.floes) {
    const ring = reg.mechanics.floes?.[f.ring];
    if (!ring || ri !== 0) continue;
    const [x, y] = toPx(f.r * Math.sin(f.angle), f.r * Math.cos(f.angle));
    disc(x, y, Math.round(f.size * PX), WHITE, 0.85);
  }
  if (reg.mechanics.vortex) {
    const [x, y] = toPx(0, 0);
    circle(x, y, reg.mechanics.vortex.r * PX, WHITE);
    circle(x, y, reg.mechanics.vortex.eye * PX, WHITE);
  }
  for (const c of geo.cascades) if (c.region === ri) mark(c.pos, (x, y) => disc(x, y, 3, WHITE));
  for (const f of geo.finds) {
    if (f.region !== ri) continue;
    mark(f.pos, (x, y) => (f.kind === 'cache' ? disc(x, y, 4, GOLD) : (line(x - 5, y - 5, x + 5, y + 5, INK), line(x - 5, y + 5, x + 5, y - 5, INK))));
  }
  for (const h of geo.harbours) if (h.region === ri) mark(h.pos, (x, y) => { circle(x, y, 7, INK); circle(x, y, 6, WHITE); });
  for (const l of geo.lights) if (l.region === ri) mark(l.pos, (x, y) => { disc(x, y, 5, INK); disc(x, y, 3, VERM); });
  const lm = geo.landmarks[ri];
  mark(lm.pos, (x, y) => { circle(x, y, lm.r * PX, GOLD); circle(x, y, lm.r * PX + 1, GOLD); disc(x, y, 3, GOLD); });
  for (const lane of geo.lanes) {
    if (lane.from !== ri && lane.to !== ri) continue;
    const a = toChart(ri, lane.a), [x0, y0] = toPx(a.x, a.y), b = toChart(ri, lane.b), [x1, y1] = toPx(b.x, b.y);
    line(x0, y0, x1, y1, WHITE, 0);
  }
  return img;
}

function worldImage(geo: Geography): Uint8Array {
  const w = 1024, h = 512, img = new Uint8Array(w * h * 3), p = v3();
  for (let y = 0; y < h; y++) {
    const lat = Math.PI / 2 - ((y + 0.5) / h) * Math.PI;
    for (let x = 0; x < w; x++) {
      const lon = ((x + 0.5) / w) * 2 * Math.PI - Math.PI;
      p.x = Math.cos(lat) * Math.cos(lon); p.y = Math.sin(lat); p.z = -Math.cos(lat) * Math.sin(lon);
      const c = cellOf(TERRITORY, p), hh = geo.heights[c];
      const col = hh >= -DRAFT ? lerp(lerp(PARCH, OCHRE, 0.5), UMBER, Math.min(1, hh / 30)) : seaColour(hh);
      img.set(col.map(Math.round), (y * w + x) * 3);
    }
  }
  // region borders
  for (let y = 1; y < h; y++) {
    for (let x = 1; x < w; x++) {
      const a = (y * w + x), lat = Math.PI / 2 - ((y + 0.5) / h) * Math.PI, lon = ((x + 0.5) / w) * 2 * Math.PI - Math.PI;
      const lat2 = lat + Math.PI / h, lon2 = lon - (2 * Math.PI) / w;
      const q = v3(Math.cos(lat) * Math.cos(lon), Math.sin(lat), -Math.cos(lat) * Math.sin(lon));
      const q1 = v3(Math.cos(lat2) * Math.cos(lon), Math.sin(lat2), -Math.cos(lat2) * Math.sin(lon));
      const q2 = v3(Math.cos(lat) * Math.cos(lon2), Math.sin(lat), -Math.cos(lat) * Math.sin(lon2));
      const r = geo.region[cellOf(TERRITORY, q)];
      if (r !== geo.region[cellOf(TERRITORY, q1)] || r !== geo.region[cellOf(TERRITORY, q2)]) img.set([110, 90, 70], a * 3);
    }
  }
  return img;
}

function downsample(img: Uint8Array, w: number, f: number): Uint8Array {
  const v = w / f, out = new Uint8Array(v * v * 3);
  for (let y = 0; y < v; y++) {
    for (let x = 0; x < v; x++) {
      for (let k = 0; k < 3; k++) {
        let s = 0;
        for (let j = 0; j < f; j++) for (let i = 0; i < f; i++) s += img[((y * f + j) * w + x * f + i) * 3 + k];
        out[(y * v + x) * 3 + k] = s / (f * f);
      }
    }
  }
  return out;
}

// --- Main ------------------------------------------------------------------------------------------------------
const args = process.argv.slice(2), opt = (k: string) => (args.includes(k) ? args[args.indexOf(k) + 1] : undefined);
const t0 = performance.now();
const geo = buildGeography();
console.log(`buildGeography: ${(performance.now() - t0).toFixed(0)} ms`);
const shots = `${ROOT}progress/shots/`;
mkdirSync(shots, { recursive: true });
const only = opt('--only'), sheetPath = opt('--sheet'), tiles: Uint8Array[] = [];
REGIONS.forEach((reg, ri) => {
  if (only && reg.id !== only) return;
  const img = regionImage(geo, ri);
  writeFileSync(`${shots}wp03-${reg.id}.png`, png(W, W, img));
  tiles.push(downsample(img, W, 2));
});
writeFileSync(`${shots}wp03-world.png`, png(1024, 512, worldImage(geo)));
if (sheetPath && tiles.length) {
  const t = W / 2, cols = Math.min(4, tiles.length), rows = Math.ceil(tiles.length / cols), sw = cols * t, sheet = new Uint8Array(sw * rows * t * 3);
  tiles.forEach((tile, k) => {
    const ox = (k % cols) * t, oy = Math.floor(k / cols) * t;
    for (let y = 0; y < t; y++) sheet.set(tile.subarray(y * t * 3, (y + 1) * t * 3), ((oy + y) * sw + ox) * 3);
  });
  mkdirSync(dirname(sheetPath), { recursive: true });
  writeFileSync(sheetPath, png(sw, rows * t, sheet));
}

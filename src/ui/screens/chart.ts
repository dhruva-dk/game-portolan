// The HUD's map: it samples the land round the ship itself as she sails.
import { DRAFT, heightExact } from '../../sim/world/index.ts';
import { R, fromLatLon, localFrame } from '../../sim/sphere.ts';
import { v3, type V3 } from '../../sim/math.ts';

const DEG = Math.PI / 180;
type RGB = readonly [number, number, number];
const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

const SEA: RGB = [150, 182, 164], DEEP: RGB = [96, 138, 136];
const LAND: RGB = [201, 167, 106], HIGH: RGB = [164, 124, 72];

/** Fits a canvas's backing store to its laid-out size; false while it has none. */
// ── the HUD's map ──

/** Samples across the land once settled, and on the first draw, which takes them all at once. */
const LAND_N = 144, LAND_FIRST = 56;
/** How far the samples reach, as a share of the map's range, and how far the ship may sail, as a share, before they
 *  are taken afresh round her. The reach covers the map's circle however far she has sailed in that time. */
const LAND_OVER = 1.25, LAND_MOVE = 0.12;
/** Milliseconds each draw may spend sampling while fresh land is on the way. */
const LAND_BUDGET = 4;
const SHOAL: RGB = [190, 198, 150], COAST: RGB = [108, 74, 40];

interface LandGrid { n: number; span: number; at: V3; east: V3; north: V3; h: Float32Array; row: number }

const dot3 = (a: V3, b: V3): number => a.x * b.x + a.y * b.y + a.z * b.z;

/** The land round the ship for the HUD's map, north up: sampled from the world's heights a few rows a draw and kept
 *  until she has sailed a way off, then coloured against the tide, the shoals no keel can cross shown apart and the
 *  coast inked. */
export class LandLayer {
  private readonly canvas = document.createElement('canvas');
  private shown: LandGrid | null = null;
  private job: LandGrid | null = null;
  /** The grid on the canvas and the sea level it was coloured for. */
  private painted: LandGrid | null = null;
  private tide = 0;
  private readonly p = v3();
  private readonly e = v3();
  private readonly n = v3();
  private readonly q = v3();

  /** Draws the land into g's circle of radius c pixels, which shows `range` metres round lat, lon (degrees). */
  draw(g: CanvasRenderingContext2D, c: number, lat: number, lon: number, range: number, tide: number): void {
    const p = fromLatLon(lat * DEG, lon * DEG, this.p), e = this.e, n = this.n;
    localFrame(p, e, n);
    if (!this.shown) {
      this.start(LAND_FIRST, range);
      this.work(Infinity);
    }
    const s = this.shown!;
    const dx = R * (dot3(s.at, e) - dot3(p, e)), dy = R * (dot3(s.at, n) - dot3(p, n));
    if (this.job) this.work(LAND_BUDGET);
    else if (s.n < LAND_N || Math.hypot(dx, dy) > range * LAND_MOVE || Math.abs(s.span - range * LAND_OVER) > 1) this.start(LAND_N, range);
    const now = this.shown!;
    if (now !== this.painted || Math.abs(tide - this.tide) > 0.02) this.paint(tide);
    const k = c / range, w = 2 * now.span * k;
    const ox = R * (dot3(now.at, e) - dot3(p, e)), oy = R * (dot3(now.at, n) - dot3(p, n));
    g.save();
    g.translate(c + ox * k, c - oy * k);
    // the samples' north, as it lies here: near the poles it swings as she sails
    g.rotate(Math.atan2(dot3(now.north, e), dot3(now.north, n)));
    g.imageSmoothingEnabled = true;
    g.drawImage(this.canvas, -w / 2, -w / 2, w, w);
    g.restore();
  }

  /** Begins sampling n × n heights round the ship as she is now. */
  private start(n: number, range: number): void {
    this.job = { n, span: range * LAND_OVER, at: { ...this.p }, east: { ...this.e }, north: { ...this.n }, h: new Float32Array(n * n), row: 0 };
  }

  /** Samples rows until `ms` milliseconds are spent; the grid shows once its last row is in. */
  private work(ms: number): void {
    const j = this.job!, end = performance.now() + ms, q = this.q;
    while (j.row < j.n) {
      const y = j.span * (1 - (2 * (j.row + 0.5)) / j.n);
      for (let i = 0; i < j.n; i++) {
        // straight down onto the sphere from the plane the map is drawn on, as the map places everything else
        const x = j.span * ((2 * (i + 0.5)) / j.n - 1), z = Math.sqrt(Math.max(0, 1 - (x * x + y * y) / (R * R)));
        q.x = j.east.x * (x / R) + j.north.x * (y / R) + j.at.x * z;
        q.y = j.east.y * (x / R) + j.north.y * (y / R) + j.at.y * z;
        q.z = j.east.z * (x / R) + j.north.z * (y / R) + j.at.z * z;
        j.h[j.row * j.n + i] = heightExact(q);
      }
      j.row++;
      if (performance.now() > end) break;
    }
    if (j.row < j.n) return;
    this.shown = j;
    this.job = null;
  }

  /** Colours the shown heights against the sea level `tide`. */
  private paint(tide: number): void {
    const s = this.shown!, n = s.n, h = s.h;
    this.painted = s;
    this.tide = tide;
    if (this.canvas.width !== n) this.canvas.width = this.canvas.height = n;
    const g = this.canvas.getContext('2d');
    if (!g) return;
    const img = g.createImageData(n, n), d = img.data;
    const land = (i: number, j: number) => i < 0 || j < 0 || i >= n || j >= n || h[j * n + i] >= tide;
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const v = h[j * n + i] - tide;
        let c: RGB;
        if (v >= 0) c = land(i - 1, j) && land(i + 1, j) && land(i, j - 1) && land(i, j + 1) ? mix(LAND, HIGH, Math.min(1, v / 40)) : COAST;
        else if (v > -DRAFT) c = SHOAL;
        else c = mix(SEA, DEEP, Math.min(1, (-v - DRAFT) / 14));
        const o = (j * n + i) * 4;
        d[o] = c[0]; d[o + 1] = c[1]; d[o + 2] = c[2]; d[o + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
  }
}
